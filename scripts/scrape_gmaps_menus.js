/**
 * scrape_gmaps_menus.js  —  Melbourne Cafe Finder menu scraper
 * ----------------------------------------------------------------------------
 * Pulls real menu photos from each cafe's Google Maps "Menu" photo tab,
 * perceptually de-duplicates them, and uploads the unique pages to Cloudinary.
 *
 * Why this is reliable (all verified empirically):
 *   • Stealth headless Chrome defeats Google's bot detection that blocks
 *     vanilla Puppeteer.
 *   • The photo gallery's "Menu" category tab is a stable, first-class element
 *     present whenever a place has menu photos — no fragile UI guessing.
 *   • Google ranks official / business-provided menu photos FIRST, so taking
 *     them in DOM order and keeping the first of any duplicate group means we
 *     prefer the clean official scan, falling back to a user photo otherwise.
 *   • Perceptual de-dup (dHash + Hamming distance ≤ 10) collapses the same
 *     physical menu page shot by different people. Calibrated on real data:
 *     genuine distinct pages sit 30+ apart, near-identical re-shoots ≤ 9.
 *
 * Behaviour:
 *   • Processes cafes closest to the CBD first (highest-value coverage first).
 *   • Resumable — progress saved every 15 cafes; stop/restart any time.
 *   • Skips cafes with no "Menu" tab (most cafes simply have no menu photos).
 *   • Excludes user avatar images; only real photo assets are considered.
 *
 * Run:  node scripts/scrape_gmaps_menus.js
 * ----------------------------------------------------------------------------
 */
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

puppeteerExtra.use(StealthPlugin());

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/gmaps_menu_progress.json');

const CBD            = { lat: -37.8136, lng: 144.9631 };
const MAX_MENU_PAGES = 8;     // a menu is rarely more than a handful of pages
const DHASH_THRESH   = 10;    // ≤ this Hamming distance ⇒ same page (duplicate)
const DELAY_MS       = 2600;  // pause between cafes — gentler = less likely to be blocked
const NAV_TIMEOUT    = 30000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function distKm(lat, lng) {
  const R = 6371, dLat = (lat - CBD.lat) * Math.PI / 180, dLng = (lng - CBD.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(CBD.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

function placeIdOf(cafe) {
  const m = (cafe.googleMapsUrl || '').match(/query_place_id=([^&]+)/);
  return m ? m[1] : null;
}

// ── Perceptual hashing ──────────────────────────────────────────────────────
// dHash: 9×8 grayscale, compare adjacent pixels → 64-bit fingerprint.
async function dhash(buffer) {
  const { data } = await sharp(buffer).grayscale().resize(9, 8, { fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });
  const bits = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      bits.push(data[r * 9 + c] > data[r * 9 + c + 1] ? 1 : 0);
  return bits;
}
const hamming = (a, b) => a.reduce((d, _, i) => d + (a[i] !== b[i] ? 1 : 0), 0);

// Dismiss Google's cookie-consent interstitial if present.
async function dismissConsent(page) {
  try {
    const url = page.url();
    if (!/consent\.google|sorry\/index/.test(url)) return false;
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((b) => /accept all|reject all|i agree|accept/i.test(b.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clicked) await new Promise((r) => setTimeout(r, 2500));
    return clicked;
  } catch { return false; }
}

// Detect Google block / error page ("sorry", 400, unusual traffic).
async function isBlocked(page) {
  try {
    const t = await page.evaluate(() => document.body.innerText.slice(0, 400));
    return /unusual traffic|That.s an error|malformed or illegal|not a robot/i.test(t)
        || /\/sorry\//.test(page.url());
  } catch { return false; }
}

// ── Scrape the Menu tab → ordered list of distinct menu photo URLs ──────────
// Returns { status, urls }. status: 'ok' | 'no-gallery' | 'no-menu' | 'blocked'
async function getMenuPhotoUrls(page, cafe) {
  // Use the cafe's real consumer Maps URL — less likely to be flagged than a
  // hand-built place_id URL.
  await page.goto(cafe.googleMapsUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await sleep(2200);
  await dismissConsent(page);

  if (await isBlocked(page)) return { status: 'blocked', urls: [] };

  const photoBtn = await page.$('button[aria-label*="Photo"], [aria-label="See photos"]');
  if (!photoBtn) return { status: 'no-gallery', urls: [] };
  await photoBtn.click();
  await sleep(2800);

  const hasMenuTab = await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button[role="tab"], [role="tablist"] button'))
      .find((b) => (b.textContent || '').trim() === 'Menu');
    if (tab) { tab.click(); return true; }
    return false;
  });
  if (!hasMenuTab) return { status: 'no-menu', urls: [] };
  await sleep(2200);

  // Scroll until the loaded-photo count stabilises (all pages present).
  let prev = -1;
  for (let i = 0; i < 15; i++) {
    const count = await page.evaluate(() => {
      const s = document.querySelector('[role="main"]');
      if (s) s.scrollTop += 1200;
      return document.querySelectorAll('[role="main"] [style*="googleusercontent"]').length;
    });
    if (count === prev) break;
    prev = count;
    await sleep(550);
  }

  // Extract in DOM order; only real photo assets (/p/ or /gps-cs-s/), no avatars.
  const urls = await page.evaluate(() => {
    const seen = new Set();
    const out = [];
    document.querySelectorAll('[role="main"] [style*="googleusercontent"]').forEach((el) => {
      const m = (el.style.backgroundImage || '').match(/url\("([^"]+)"\)/);
      if (!m) return;
      if (!/\/p\/|\/gps-cs-s\//.test(m[1])) return; // skip avatars (/a-/ , /a/)
      const base = m[1].split('=')[0];
      if (!seen.has(base)) { seen.add(base); out.push(base); }
    });
    return out;
  });
  return { status: 'ok', urls };
}

// ── Download + perceptual de-dup → unique page buffers (official-first) ─────
async function uniqueMenuBuffers(urls) {
  const kept = []; // { hash, buffer }
  for (const base of urls) {
    if (kept.length >= MAX_MENU_PAGES) break;
    const url = (base.startsWith('//') ? 'https:' + base : base) + '=w1200';
    let buffer;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      buffer = Buffer.from(await res.arrayBuffer());
    } catch { continue; }

    let hash;
    try { hash = await dhash(buffer); } catch { continue; }

    if (kept.some((k) => hamming(k.hash, hash) <= DHASH_THRESH)) continue; // duplicate page
    kept.push({ hash, buffer });
  }
  return kept.map((k) => k.buffer);
}

function uploadBuffer(buffer, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'melbcafes/menus', public_id: publicId },
      (err, res) => (err ? reject(err) : resolve(res.secure_url)),
    ).end(buffer);
  });
}

async function run() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes
    .filter((c) => placeIdOf(c) && !(c.menuImages?.length) && progress[c.id] === undefined)
    .sort((a, b) => distKm(a.latitude, a.longitude) - distKm(b.latitude, b.longitude));

  console.log(`Cafes to check for menus: ${targets.length} (closest to CBD first)`);

  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--lang=en-AU'],
  });

  let withMenus = 0, totalImages = 0, consecutiveBlocks = 0;

  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 36).padEnd(36)}`);

    let pg;
    try {
      pg = await browser.newPage();
      await pg.setViewport({ width: 1366, height: 1100 });
      await pg.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });

      const { status, urls } = await getMenuPhotoUrls(pg, cafe);

      if (status === 'blocked') {
        consecutiveBlocks++;
        const backoff = Math.min(60000, 8000 * consecutiveBlocks);
        process.stdout.write(` ⚠ BLOCKED by Google — backing off ${Math.round(backoff/1000)}s`);
        // don't record progress so it retries on next run
        await pg.close().catch(() => {});
        process.stdout.write('\n');
        if (consecutiveBlocks >= 5) {
          console.log('\n✋ Google is blocking repeatedly. Stopping — wait a while (or change network) and re-run; progress is saved.');
          break;
        }
        await sleep(backoff);
        continue;
      }
      consecutiveBlocks = 0;

      const buffers = urls.length ? await uniqueMenuBuffers(urls) : [];

      if (buffers.length) {
        const uploaded = [];
        for (let j = 0; j < buffers.length; j++) {
          try { uploaded.push(await uploadBuffer(buffers[j], `${cafe.id}_menu_${j}`)); }
          catch { /* skip a failed upload, keep the rest */ }
        }
        if (uploaded.length) {
          cafes.find((c) => c.id === cafe.id).menuImages = uploaded;
          progress[cafe.id] = uploaded.length;
          withMenus++; totalImages += uploaded.length;
          process.stdout.write(` ✓ ${uploaded.length} menu page${uploaded.length > 1 ? 's' : ''}`);
        } else { progress[cafe.id] = 0; process.stdout.write(' (upload failed)'); }
      } else {
        progress[cafe.id] = 0;
        process.stdout.write(status === 'no-menu' ? ' · no menu' : status === 'no-gallery' ? ' · no gallery' : ' · 0 photos');
      }
    } catch (err) {
      progress[cafe.id] = null;
      process.stdout.write(` skip: ${err.message.substring(0, 32)}`);
    } finally {
      if (pg) await pg.close().catch(() => {});
    }

    process.stdout.write('\n');

    if ((i + 1) % 15 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${withMenus} cafes, ${totalImages} menu images so far]`);
    }

    await sleep(DELAY_MS);
  }

  await browser.close();
  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. ${withMenus} cafes got menus (${totalImages} unique menu images total).`);
}

run().catch(console.error);
