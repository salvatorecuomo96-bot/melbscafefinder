/**
 * scrape_cafe_photos.js  —  Curated 4-photo set per cafe (CBD + 5km)
 * ----------------------------------------------------------------------------
 * For each cafe: gather candidate photos from its Google Maps gallery, then ask
 * Claude (Haiku vision) to pick the single best EXTERIOR, INTERIOR, COFFEE, and
 * FOOD photo — rejecting any image with a clearly visible human face. The four
 * chosen photos are uploaded to Cloudinary and written to cafe.images in that
 * order: [exterior, interior, coffee, food].
 *
 * Why this design (hybrid, user-approved):
 *   • Google's photo category tabs are inconsistent (no reliable "exterior"),
 *     so tabs alone can't satisfy the ordered 4-type requirement — a vision
 *     model has to actually look at the images.
 *   • Haiku 4.5 is the cheap vision model; candidate images are sent at small
 *     size (~400px) to keep token cost ~$0.003/cafe (~$2–3 for all of CBD+5km).
 *   • Structured outputs make Claude return clean integer indices, not prose.
 *
 * COST CONTROL: set PHOTO_LIMIT=5 to process only the first 5 cafes — do this
 * first to validate quality + cost before the full run. Resumable.
 *
 * Run:  node scripts/scrape_cafe_photos.js          (full run)
 *       PHOTO_LIMIT=5 node scripts/scrape_cafe_photos.js   (test 5 cafes)
 * ----------------------------------------------------------------------------
 */
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Anthropic from '@anthropic-ai/sdk';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

puppeteerExtra.use(StealthPlugin());

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/cafe_photos_progress.json');

const CBD          = { lat: -37.8136, lng: 144.9631 };
const RADIUS_KM    = 10;
const MAX_CANDIDATES = 12;     // photos sent to Claude per cafe
const TARGET_PHOTOS  = 4;      // aim for this many; backfill missing categories with face-free extras
const CAND_SIZE    = 'w400';   // small size for the vision call (cheap tokens)
const FINAL_SIZE   = 'w1200';  // full size for the saved/uploaded image
const DELAY_MS     = 2600;     // between cafes — gentle, avoids Google blocking
const NAV_TIMEOUT  = 30000;
const MODEL        = 'claude-haiku-4-5';
const LIMIT        = parseInt(process.env.PHOTO_LIMIT || '0', 10) || Infinity;
const ALL          = !!process.env.PHOTO_ALL;   // PHOTO_ALL=1 → ignore radius, do every cafe

// Cafes whose photos were curated by hand — never overwrite these.
const MANUAL_SKIP = new Set(['au79-abbotsford-abbotsford', 'amiri-cafe-melbourne']);

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env
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

// ── Google Maps navigation (resilient — consent + block detection) ──────────
async function dismissConsent(page) {
  try {
    if (!/consent\.google|sorry\/index/.test(page.url())) return;
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((x) => /accept all|reject all|i agree|accept/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(2200);
  } catch { /* noop */ }
}

async function isBlocked(page) {
  try {
    const t = await page.evaluate(() => document.body.innerText.slice(0, 400));
    return /unusual traffic|That.s an error|malformed or illegal|not a robot/i.test(t) || /\/sorry\//.test(page.url());
  } catch { return false; }
}

// Returns { status: 'ok'|'no-gallery'|'blocked', urls: [baseUrl,...] }
async function getCandidatePhotos(page, cafe) {
  await page.goto(cafe.googleMapsUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await sleep(2200);
  await dismissConsent(page);
  if (await isBlocked(page)) return { status: 'blocked', urls: [] };

  const photoBtn = await page.$('button[aria-label*="Photo"], [aria-label="See photos"]');
  if (!photoBtn) return { status: 'no-gallery', urls: [] };
  await photoBtn.click();
  await sleep(2800);

  // Gallery opens on the "All" tab — scroll to load a varied pool.
  let prev = -1;
  for (let i = 0; i < 8; i++) {
    const count = await page.evaluate(() => {
      const s = document.querySelector('[role="main"]');
      if (s) s.scrollTop += 1200;
      return document.querySelectorAll('[role="main"] [style*="googleusercontent"]').length;
    });
    if (count === prev || count >= MAX_CANDIDATES * 2) break;
    prev = count;
    await sleep(500);
  }

  const urls = await page.evaluate(() => {
    const seen = new Set(); const out = [];
    document.querySelectorAll('[role="main"] [style*="googleusercontent"]').forEach((el) => {
      const m = (el.style.backgroundImage || '').match(/url\("([^"]+)"\)/);
      if (!m) return;
      if (!/\/p\/|\/gps-cs-s\//.test(m[1])) return; // skip avatars
      const base = m[1].split('=')[0];
      if (!seen.has(base)) { seen.add(base); out.push(base); }
    });
    return out;
  });

  return { status: 'ok', urls: urls.slice(0, MAX_CANDIDATES) };
}

// ── Claude vision: pick best exterior / interior / coffee / food ────────────
const SYSTEM_PROMPT = `You classify cafe photos. You will receive a numbered list of photos of a single cafe.
Pick the SINGLE BEST photo for each of these four categories:
- exterior: the outside of the cafe / its storefront / building facade / signage from the street
- interior: inside the cafe — seating, counter, fit-out, ambiance
- coffee: a coffee drink (latte, espresso, cappuccino, etc.), close-up
- food: a food dish or pastry (not coffee)

Also return "extras": a ranked array (best first) of OTHER photo indices to use as
backfill when a category is missing — any good-quality photo of interior, food, coffee,
a drink, or an appealing detail shot. The same face rule applies: NO clearly visible faces.
Do not put menu photos, blurry/dark shots, or anything with a clear face in extras, and do
not repeat an index already used for the four categories.

Rules:
- REJECT any photo with a clearly visible, recognizable human face. Small/blurred/background people are acceptable; a clear face in focus is NOT.
- Pick the most attractive, well-lit, in-focus, representative photo for each category.
- If NO suitable photo exists for a category, use -1 for that category.
- Each photo index may be used for at most one category. Photos are 0-indexed in the order given.
Return only the structured result.`;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    exterior: { type: 'integer' },
    interior: { type: 'integer' },
    coffee:   { type: 'integer' },
    food:     { type: 'integer' },
    extras:   { type: 'array', items: { type: 'integer' } },
  },
  required: ['exterior', 'interior', 'coffee', 'food', 'extras'],
  additionalProperties: false,
};

async function classifyPhotos(baseUrls) {
  const content = [];
  baseUrls.forEach((base, i) => {
    content.push({ type: 'text', text: `Photo ${i}:` });
    content.push({ type: 'image', source: { type: 'url', url: `${base}=${CAND_SIZE}` } });
  });
  content.push({ type: 'text', text: 'Classify these photos into exterior, interior, coffee, food (0-indexed; -1 if none).' });

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    // System prompt is stable across cafes → marked cacheable. (Note: it's short,
    // so on Haiku's 4096-token cache minimum it likely won't actually cache —
    // but it's correct, and per-request cost is dominated by the images anyway.)
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
  });

  const textBlock = res.content.find((b) => b.type === 'text');
  return JSON.parse(textBlock.text);
}

async function uploadChosen(baseUrl, publicId) {
  const res = await cloudinary.uploader.upload(`${baseUrl}=${FINAL_SIZE}`, {
    folder: 'melbcafes/curated',
    public_id: publicId,
  });
  return res.secure_url;
}

async function run() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes
    .filter((c) => /query_place_id=/.test(c.googleMapsUrl || '')
      && !MANUAL_SKIP.has(c.id)
      && progress[c.id] === undefined
      && c.latitude
      && (ALL || distKm(c.latitude, c.longitude) <= RADIUS_KM))
    .sort((a, b) => distKm(a.latitude, a.longitude) - distKm(b.latitude, b.longitude))
    .slice(0, LIMIT);

  console.log(`Cafes to curate: ${targets.length}${ALL ? ' (ALL cafes)' : ` (within ${RADIUS_KM}km)`}${LIMIT !== Infinity ? ` — TEST limit ${LIMIT}` : ''}`);

  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--lang=en-AU'],
  });

  let done = 0, consecutiveBlocks = 0;
  const ORDER = ['exterior', 'interior', 'coffee', 'food'];

  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 34).padEnd(34)}`);

    let pg;
    try {
      pg = await browser.newPage();
      await pg.setViewport({ width: 1366, height: 1100 });
      await pg.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });

      const { status, urls } = await getCandidatePhotos(pg, cafe);

      if (status === 'blocked') {
        consecutiveBlocks++;
        const backoff = Math.min(60000, 8000 * consecutiveBlocks);
        process.stdout.write(` ⚠ BLOCKED — backing off ${Math.round(backoff / 1000)}s\n`);
        await pg.close().catch(() => {});
        if (consecutiveBlocks >= 5) { console.log('\n✋ Google blocking repeatedly. Stopping; progress saved — re-run later.'); break; }
        await sleep(backoff);
        continue;
      }
      consecutiveBlocks = 0;

      if (urls.length < 2) {
        progress[cafe.id] = 0;
        process.stdout.write(status === 'no-gallery' ? ' · no gallery\n' : ' · too few photos\n');
      } else {
        const picks = await classifyPhotos(urls);
        const chosen = [];
        const used = new Set();
        const labels = [];
        const valid = (idx) => Number.isInteger(idx) && idx >= 0 && idx < urls.length && !used.has(idx);

        // 1) the four categories, in order
        for (const cat of ORDER) {
          const idx = picks[cat];
          if (!valid(idx)) continue;
          used.add(idx);
          try { chosen.push(await uploadChosen(urls[idx], `${cafe.id}_${cat}`)); labels.push(cat); }
          catch { used.delete(idx); }
        }
        // 2) backfill with face-free extras until we reach TARGET_PHOTOS
        let extraN = 0;
        for (const idx of (Array.isArray(picks.extras) ? picks.extras : [])) {
          if (chosen.length >= TARGET_PHOTOS) break;
          if (!valid(idx)) continue;
          used.add(idx);
          try { chosen.push(await uploadChosen(urls[idx], `${cafe.id}_extra_${extraN}`)); labels.push('+'); extraN++; }
          catch { used.delete(idx); }
        }

        if (chosen.length) {
          cafes.find((c) => c.id === cafe.id).images = chosen;
          progress[cafe.id] = chosen.length;
          done++;
          process.stdout.write(` ✓ ${chosen.length} photos [${labels.join(', ')}]\n`);
        } else {
          progress[cafe.id] = 0;
          process.stdout.write(' · no usable photos\n');
        }
      }
    } catch (err) {
      progress[cafe.id] = null;
      process.stdout.write(` skip: ${err.message.substring(0, 40)}\n`);
    } finally {
      if (pg) await pg.close().catch(() => {});
    }

    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${done} cafes curated so far]`);
    }

    await sleep(DELAY_MS);
  }

  await browser.close();
  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. ${done} cafes curated.`);
}

run().catch(console.error);
