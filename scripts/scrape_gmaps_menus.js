/**
 * scrape_gmaps_menus.js
 * Reliable menu scraper using Google Maps photo gallery "Menu" tab.
 *
 * How it works (verified working):
 *   1. Open the place via its place_id (stealth headless evades bot detection)
 *   2. Open the photo gallery
 *   3. If a "Menu" category tab exists, click it
 *   4. Extract the menu photo URLs, dedupe, upload to Cloudinary
 *   5. Save to cafe.menuImages
 *
 * Cafes with no "Menu" tab are skipped (most don't have menu photos).
 * Processes closest-to-CBD first. Resumable. Saves every 15 cafes.
 *
 * Run: node scripts/scrape_gmaps_menus.js
 */
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

puppeteerExtra.use(StealthPlugin());

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/gmaps_menu_progress.json');

const CBD = { lat: -37.8136, lng: 144.9631 };
const MAX_MENU_IMAGES = 5;     // cap per cafe
const DELAY_MS        = 1800;  // between cafes — be polite to avoid rate-limit
const NAV_TIMEOUT     = 30000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function distKm(lat, lng) {
  const R=6371, dLat=(lat-CBD.lat)*Math.PI/180, dLng=(lng-CBD.lng)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(CBD.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

function placeIdOf(cafe) {
  const m = (cafe.googleMapsUrl || '').match(/query_place_id=([^&]+)/);
  return m ? m[1] : null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Returns array of deduped, normalized menu photo URLs (empty if no menu tab)
async function getMenuPhotos(page, placeId) {
  await page.goto(`https://www.google.com/maps/place/?q=place_id:${placeId}`,
    { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
  await sleep(2500);

  // Open photo gallery
  const photoBtn = await page.$('button[aria-label*="Photo"], [aria-label="See photos"]');
  if (!photoBtn) return [];
  await photoBtn.click();
  await sleep(2800);

  // Click "Menu" category tab if present
  const hasMenu = await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button[role="tab"], [role="tablist"] button'))
      .find(b => (b.textContent || '').trim() === 'Menu');
    if (tab) { tab.click(); return true; }
    return false;
  });
  if (!hasMenu) return [];
  await sleep(2200);

  // Scroll to load all menu photos
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const s = document.querySelector('[role="main"]');
      if (s) s.scrollTop += 1200;
    });
    await sleep(500);
  }

  // Extract photo URLs
  const raw = await page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll('[style*="googleusercontent"], img[src*="googleusercontent"]').forEach(el => {
      const bg = el.style.backgroundImage || '';
      const m = bg.match(/url\("([^"]+)"\)/);
      if (m) set.add(m[1]);
      if (el.src && el.src.includes('googleusercontent')) set.add(el.src);
    });
    return [...set];
  });

  // Dedupe by base photo ID (strip size suffix), normalize to w1200
  const byBase = new Map();
  for (const url of raw) {
    const base = url.split('=')[0];
    // skip tiny thumbnails / icons
    if (!byBase.has(base)) byBase.set(base, `${base}=w1200`);
  }
  return [...byBase.values()].slice(0, MAX_MENU_IMAGES);
}

async function uploadToCloudinary(url, publicId) {
  const res = await cloudinary.uploader.upload(url, {
    folder: 'melbcafes/menus',
    public_id: publicId,
    timeout: 30000,
  });
  return res.secure_url;
}

async function run() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes
    .filter(c => placeIdOf(c) && !(c.menuImages?.length) && progress[c.id] === undefined)
    .sort((a, b) => distKm(a.latitude, a.longitude) - distKm(b.latitude, b.longitude));

  console.log(`Cafes to check for menus: ${targets.length} (closest to CBD first)`);

  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--lang=en-AU'],
  });

  let found = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 38).padEnd(38)}`);

    let page;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 1000 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });

      const photos = await getMenuPhotos(page, placeIdOf(cafe));

      if (photos.length) {
        const uploaded = [];
        for (let j = 0; j < photos.length; j++) {
          try {
            uploaded.push(await uploadToCloudinary(photos[j], `${cafe.id}_menu_${j}`));
          } catch { /* skip failed upload */ }
        }
        if (uploaded.length) {
          cafes.find(c => c.id === cafe.id).menuImages = uploaded;
          progress[cafe.id] = uploaded.length;
          found++;
          process.stdout.write(` ✓ ${uploaded.length} menu images`);
        } else {
          progress[cafe.id] = 0;
        }
      } else {
        progress[cafe.id] = 0;
      }
    } catch (err) {
      progress[cafe.id] = null;
      process.stdout.write(` skip: ${err.message.substring(0, 35)}`);
    } finally {
      if (page) await page.close().catch(() => {});
    }

    process.stdout.write('\n');

    if ((i + 1) % 15 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${found} cafes with menus so far]`);
    }

    await sleep(DELAY_MS);
  }

  await browser.close();
  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. Cafes with menus added: ${found}`);
}

run().catch(console.error);
