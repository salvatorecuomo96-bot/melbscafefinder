/**
 * fix_missing_places.js  —  give place-less cafes a Google place ID + coords
 * ----------------------------------------------------------------------------
 * ~370 cafes (from non-Google list sources) have no Google place ID, which
 * cuts them off from menus, curated photos, AND descriptions — and leaves them
 * at (0,0) so they show "14,489 km away" and vanish from the map.
 *
 * This resolves each via Places Text Search (New): name + suburb -> place ID +
 * coordinates. It then writes a proper googleMapsUrl (with query_place_id) and
 * real lat/lng, so the menu / photo / description scripts pick them up next run.
 *
 * Safeguards: only accepts results inside Greater Melbourne, and only when the
 * returned name plausibly matches the cafe (shared word) — so it won't bind a
 * cafe to the wrong place.
 *
 * Run:  node scripts/fix_missing_places.js
 *       PLACES_LIMIT=10 node scripts/fix_missing_places.js   (test 10)
 * ----------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');

const KEY      = process.env.GOOGLE_PLACES_KEY;
const DELAY_MS = 150;
const LIMIT    = parseInt(process.env.PLACES_LIMIT || '0', 10) || Infinity;

const BOUNDS = { latMin: -38.6, latMax: -37.4, lngMin: 144.3, lngMax: 145.6 };
const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));

const hasPid     = (c) => /query_place_id=/.test(c.googleMapsUrl || '');
const badCoords  = (c) => !c.latitude || Math.abs(c.latitude) < 1;

function nameMatches(found, cafeName) {
  const words = cafeName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return true;
  const f = found.toLowerCase();
  return words.some((w) => f.includes(w));
}

async function textSearch(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.id,places.location,places.displayName',
    },
    body: JSON.stringify({ textQuery: query, regionCode: 'AU' }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 100)}`);
  return (await res.json()).places?.[0] || null;
}

async function run() {
  if (!KEY) { console.error('Missing GOOGLE_PLACES_KEY in .env'); process.exit(1); }

  const cafes   = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const targets = cafes.filter((c) => !hasPid(c) || badCoords(c)).slice(0, LIMIT);
  console.log(`Cafes missing place ID / coords: ${targets.length}`);

  let fixed = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 34).padEnd(34)}`);

    try {
      const p = await textSearch(`${cafe.name} ${cafe.suburb} Victoria`);
      const loc = p?.location;
      const inBox = loc && loc.latitude >= BOUNDS.latMin && loc.latitude <= BOUNDS.latMax
        && loc.longitude >= BOUNDS.lngMin && loc.longitude <= BOUNDS.lngMax;
      const named = p && nameMatches(p.displayName?.text || '', cafe.name);

      if (p?.id && inBox && named) {
        cafe.googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cafe.name} ${cafe.suburb}`)}&query_place_id=${p.id}`;
        cafe.latitude = loc.latitude;
        cafe.longitude = loc.longitude;
        fixed++;
        process.stdout.write(` ✓ ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}\n`);
      } else {
        failed++;
        process.stdout.write(` · no confident match\n`);
      }
    } catch (err) {
      failed++;
      process.stdout.write(` skip: ${err.message.slice(0, 40)}\n`);
    }

    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${fixed} fixed, ${failed} unmatched]`);
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. ${fixed} linked to a place ID + coords, ${failed} unmatched.`);
}

run().catch(console.error);
