/**
 * fetch_descriptions.js  —  AI place descriptions via Google Places API (New)
 * ----------------------------------------------------------------------------
 * For each cafe, fetches Google's AI-generated place summary (generativeSummary)
 * from the Places API (New), falling back to editorialSummary, and writes it to
 * cafe.shortDescription (shown on the cafe detail page).
 *
 * Requires GOOGLE_PLACES_KEY in .env, with the *Places API (New)* enabled in the
 * same Google Cloud project (it's a different API from the legacy Places API).
 *
 * Cost: Place Details with generativeSummary is the priciest Places SKU
 * (~USD $0.04/call). Editorial-only is cheaper. TEST first with DESC_LIMIT=10.
 *
 * Run:  node scripts/fetch_descriptions.js
 *       DESC_LIMIT=10 node scripts/fetch_descriptions.js   (test 10)
 * ----------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/descriptions_progress.json');

const KEY      = process.env.GOOGLE_PLACES_KEY;
const DELAY_MS = 150;
const LIMIT    = parseInt(process.env.DESC_LIMIT || '0', 10) || Infinity;

const FIELD_MASK = 'generativeSummary,editorialSummary';

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

function placeIdOf(cafe) {
  const m = (cafe.googleMapsUrl || '').match(/query_place_id=([^&]+)/);
  return m ? m[1] : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pull the best available text out of the Places (New) response.
function extractDescription(data) {
  const gs = data.generativeSummary;
  // field naming has shifted across API versions — handle the common shapes
  const genText = gs?.overview?.text || gs?.description?.text || gs?.overview || null;
  if (typeof genText === 'string' && genText.trim()) return genText.trim();

  const ed = data.editorialSummary;
  const edText = ed?.text?.text || ed?.text || null;
  if (typeof edText === 'string' && edText.trim()) return edText.trim();

  return null;
}

async function fetchDescription(placeId) {
  const url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=en`;
  const res = await fetch(url, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELD_MASK },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body.slice(0, 120)}`);
  }
  return extractDescription(await res.json());
}

async function run() {
  if (!KEY) { console.error('Missing GOOGLE_PLACES_KEY in .env'); process.exit(1); }

  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes
    .filter((c) => placeIdOf(c) && !c.shortDescription && progress[c.id] === undefined)
    .slice(0, LIMIT);

  console.log(`Cafes to describe: ${targets.length}${LIMIT !== Infinity ? ` (TEST limit ${LIMIT})` : ''}`);

  let found = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 38).padEnd(38)}`);

    try {
      const desc = await fetchDescription(placeIdOf(cafe));
      progress[cafe.id] = desc ? 1 : 0;
      if (desc) {
        cafes.find((c) => c.id === cafe.id).shortDescription = desc;
        found++;
        process.stdout.write(` ✓ ${desc.slice(0, 50)}…`);
      } else {
        process.stdout.write(' · none');
      }
    } catch (err) {
      progress[cafe.id] = null;
      process.stdout.write(` skip: ${err.message.slice(0, 50)}`);
    }

    process.stdout.write('\n');

    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${found} descriptions so far]`);
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. ${found} descriptions added.`);
}

run().catch(console.error);
