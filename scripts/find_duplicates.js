/**
 * find_duplicates.js — READ-ONLY. Reports duplicate cafes. Writes nothing.
 * ------------------------------------------------------------------------
 * Clusters cafes by (a) Google place_id and (b) rounded coordinates, and
 * (c) normalised name+suburb. Prints every group with >1 entry so you can
 * decide which to keep. Does NOT modify cafes.json.
 *
 * Run:  node scripts/find_duplicates.js
 * ------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');

const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
const placeIdOf = (c) => (c.googleMapsUrl || '').match(/query_place_id=([^&]+)/)?.[1] || null;
const normName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

console.log(`Total cafes: ${cafes.length}\n`);

function groupBy(keyFn) {
  const m = new Map();
  for (const c of cafes) {
    const k = keyFn(c);
    if (k == null || k === '') continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(c);
  }
  return [...m.entries()].filter(([, v]) => v.length > 1);
}

function report(title, groups) {
  console.log(`\n========== ${title}: ${groups.length} group(s) ==========`);
  for (const [key, list] of groups) {
    console.log(`\n  [${key}]  ×${list.length}`);
    for (const c of list) {
      console.log(`     - "${c.name}" | ${c.suburb} | id=${c.id} | ${c.rating ?? '?'}★/${c.userRatingsTotal ?? '?'} | imgs:${(c.images||[]).length} menu:${(c.menuImages||[]).length}`);
    }
  }
}

// (a) same place_id
const byPlace = groupBy(placeIdOf);

// (b) same coordinates (rounded to ~11m). Skip 0,0.
const byCoord = groupBy((c) =>
  (c.latitude && c.longitude && !(c.latitude === 0 && c.longitude === 0))
    ? `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`
    : null
);

// (c) same normalised name + suburb
const byName = groupBy((c) => `${normName(c.name)}|${normName(c.suburb)}`);

// Only show coord/name groups that aren't already caught by place_id
const placeIdKeys = new Set(byPlace.flatMap(([, list]) => list.map((c) => c.id)));
const coordExtra = byCoord.filter(([, list]) => !list.every((c) => placeIdKeys.has(c.id)));
const nameExtra  = byName.filter(([, list]) => !list.every((c) => placeIdKeys.has(c.id)));

report('SAME PLACE_ID', byPlace);
report('SAME COORDINATES (not already in place_id groups)', coordExtra);
report('SAME NAME+SUBURB (not already above)', nameExtra);

const dupTotal = byPlace.reduce((n, [, l]) => n + l.length - 1, 0);
console.log(`\n\nApprox. removable duplicates by place_id alone: ${dupTotal}`);
