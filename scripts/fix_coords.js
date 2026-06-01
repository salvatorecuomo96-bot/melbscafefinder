/**
 * fix_coords.js  —  repair cafes with missing / (0,0) coordinates
 * ----------------------------------------------------------------------------
 * ~396 cafes have latitude/longitude of 0, which breaks distance ("14,489 km
 * away"), hides them from the map, and made the photo run skip them. This
 * geocodes each one from its address via Geoapify (free) and writes real coords.
 *
 * Only accepts results inside Greater Melbourne bounds, so a bad geocode can't
 * fling a cafe somewhere wrong. Resumable.
 *
 * Run:  node scripts/fix_coords.js
 * ----------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');

const KEY      = process.env.GEOAPIFY_KEY;
const DELAY_MS = 120;

// Greater Melbourne sanity box — reject geocodes outside it
const BOUNDS = { latMin: -38.6, latMax: -37.4, lngMin: 144.3, lngMax: 145.6 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const badCoords = (c) => !c.latitude || !c.longitude || Math.abs(c.latitude) < 1;

async function geocode(text) {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&filter=countrycode:au&bias=proximity:144.9631,-37.8136&limit=1&apiKey=${KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geoapify ${res.status}`);
  const p = (await res.json()).features?.[0]?.properties;
  return p ? { lat: p.lat, lng: p.lon } : null;
}

function inBounds(g) {
  return g && g.lat >= BOUNDS.latMin && g.lat <= BOUNDS.latMax
    && g.lng >= BOUNDS.lngMin && g.lng <= BOUNDS.lngMax;
}

async function run() {
  if (!KEY) { console.error('Missing GEOAPIFY_KEY in .env'); process.exit(1); }

  const cafes   = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const targets = cafes.filter(badCoords);
  console.log(`Cafes with bad coords: ${targets.length}`);

  let fixed = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 36).padEnd(36)}`);

    // try the full address first, then name + suburb
    const queries = [
      cafe.address && `${cafe.address}`,
      `${cafe.name}, ${cafe.suburb}, Victoria`,
    ].filter(Boolean);

    let g = null;
    for (const q of queries) {
      try { g = await geocode(q); } catch { /* retry next query */ }
      if (inBounds(g)) break;
      g = null;
      await sleep(DELAY_MS);
    }

    if (inBounds(g)) {
      cafe.latitude = g.lat;
      cafe.longitude = g.lng;
      fixed++;
      process.stdout.write(` ✓ ${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}\n`);
    } else {
      failed++;
      process.stdout.write(' · could not geocode\n');
    }

    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${fixed} fixed, ${failed} failed]`);
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. Fixed ${fixed}, failed ${failed}. (Failed ones keep 0,0 — re-run or fix manually.)`);
}

run().catch(console.error);
