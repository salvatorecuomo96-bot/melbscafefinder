/**
 * fix_kindb_placeids.js — repair wrong/colliding place_ids ("Kind B").
 * ---------------------------------------------------------------------------
 * Cafes that share a place_id but have *different* names are collisions: two
 * records bound to one Google place. Reliable resolution uses the place_id
 * itself as ground truth.
 *
 * Per group:
 *   1. Fetch Place Details for the shared place_id -> the venue Google CURRENTLY
 *      has there (displayName + location + businessStatus).
 *   2. OWNER = the member whose name is most similar to that current name. Keep
 *      it; correct its coordinates to the place's real location.
 *   3. Each OTHER member: Text Search its own name. If that returns a DISTINCT
 *      place with a STRICT name match in Melbourne -> repoint it (fix). Else it
 *      is a defunct rename / unverifiable -> REMOVE it ("remove if u cant").
 *
 * DRY RUN by default. To write:  APPLY=1 node scripts/fix_kindb_placeids.js
 * Uses GOOGLE_PLACES_KEY. ~27 details + ~27 searches per run (~AUD$3).
 * ---------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');

const KEY      = process.env.GOOGLE_PLACES_KEY;
const APPLY    = process.env.APPLY === '1';
const LIMIT    = parseInt(process.env.KINDB_LIMIT || '0', 10) || Infinity;
const DELAY_MS = 150;
const BOUNDS   = { latMin: -38.6, latMax: -37.4, lngMin: 144.3, lngMax: 145.6 };
const sleep    = (ms) => new Promise((r) => setTimeout(r, ms));

const placeIdOf = (c) => (c.googleMapsUrl || '').match(/query_place_id=([^&]+)/)?.[1] || null;

// ── name cores + similarity ──────────────────────────────────────────────────
const STOP = /\b(the|cafe|café|coffee|co|and|bar|kitchen|eatery|melbourne|caffe|caffé|dine|in)\b/g;
const core = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(STOP, '').replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[m][n];
}
const similarLoose = (a, b) => { const x = core(a), y = core(b); if (!x || !y) return false; return x === y || x.includes(y) || y.includes(x) || lev(x, y) <= 2; };
// for repointing a record to a NEW place: require a strong match (no generic-word flukes)
function strictMatch(a, b) {
  const x = core(a), y = core(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y, long = x.length <= y.length ? y : x;
  if (short.length >= 4 && long.includes(short)) return true;
  return lev(x, y) <= 1;
}
// 0..1 similarity, used to pick which member owns the place
function simScore(a, b) {
  const x = core(a), y = core(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const short = x.length <= y.length ? x : y, long = x.length <= y.length ? y : x;
  if (short.length >= 3 && long.includes(short)) return 0.85;
  return 1 - lev(x, y) / Math.max(x.length, y.length);
}
const richness = (c) => (c.images || []).length * 2 + (c.menuImages || []).length + (c.description ? 2 : 0) + (c.coffeeBrand ? 1 : 0);

async function placeDetails(pid) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${pid}?languageCode=en`, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'displayName,location,businessStatus' },
  });
  if (!res.ok) throw new Error(`details ${res.status}`);
  return res.json();
}
async function textSearch(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'places.id,places.location,places.displayName' },
    body: JSON.stringify({ textQuery: query, regionCode: 'AU' }),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return (await res.json()).places?.[0] || null;
}
const inBox = (loc) => loc && loc.latitude >= BOUNDS.latMin && loc.latitude <= BOUNDS.latMax && loc.longitude >= BOUNDS.lngMin && loc.longitude <= BOUNDS.lngMax;
const mapsUrl = (name, suburb, pid) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${suburb}`)}&query_place_id=${pid}`;

async function run() {
  if (!KEY) { console.error('Missing GOOGLE_PLACES_KEY in .env'); process.exit(1); }
  const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));

  const byPid = new Map();
  for (const c of cafes) { const k = placeIdOf(c); if (!k) continue; if (!byPid.has(k)) byPid.set(k, []); byPid.get(k).push([k, c]); }
  const kindB = [...byPid.values()]
    .map((arr) => ({ pid: arr[0][0], list: arr.map((x) => x[1]) }))
    .filter(({ list }) => list.length > 1 && !list.every((c, i) => list.every((d, j) => i === j || similarLoose(c.name, d.name))))
    .slice(0, LIMIT);

  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN'}`);
  console.log(`Kind B collision groups: ${kindB.length}\n`);

  const fixed = [], removed = [], owners = [];

  for (const { pid, list } of kindB) {
    let det = null;
    try { det = await placeDetails(pid); } catch (e) { det = { err: e.message }; }
    await sleep(DELAY_MS);
    const ownerName = det?.displayName?.text || '';
    const ownerLoc = det?.location;
    const status = det?.businessStatus || '';

    // pick owner of the shared place_id
    const owner = ownerName
      ? list.slice().sort((a, b) => simScore(b.name, ownerName) - simScore(a.name, ownerName))[0]
      : list.slice().sort((a, b) => richness(b) - richness(a))[0];
    if (inBox(ownerLoc)) { owner.latitude = ownerLoc.latitude; owner.longitude = ownerLoc.longitude; }
    owners.push({ owner, ownerName, status });

    // resolve the other members
    for (const m of list) {
      if (m === owner) continue;
      let p = null;
      try { p = await textSearch(`${m.name} ${m.suburb} Victoria`); } catch { p = null; }
      await sleep(DELAY_MS);
      if (p?.id && p.id !== pid && inBox(p.location) && strictMatch(p.displayName?.text || '', m.name)) {
        m.googleMapsUrl = mapsUrl(m.name, m.suburb, p.id);
        m.latitude = p.location.latitude; m.longitude = p.location.longitude;
        fixed.push({ m, disp: p.displayName?.text || '' });
      } else {
        removed.push({ m, owner, disp: p?.displayName?.text || '', status });
      }
    }
  }

  const removeIds = new Set(removed.map((r) => r.m.id));

  console.log(`==== OWNERS kept (place_id verified, coords corrected) (${owners.length}) ====`);
  owners.forEach((o) => console.log(`  "${o.owner.name}" (${o.owner.suburb})  <- Google: "${o.ownerName}"${o.status && o.status !== 'OPERATIONAL' ? ' [' + o.status + ']' : ''}`));
  console.log(`\n==== FIXED — repointed to own place_id (${fixed.length}) ====`);
  fixed.forEach((r) => console.log(`  "${r.m.name}" (${r.m.suburb}) -> "${r.disp}"`));
  console.log(`\n==== REMOVED — no distinct verifiable place (${removed.length}) ====`);
  removed.forEach((r) => console.log(`  "${r.m.name}" (${r.m.suburb}) [${r.m.id}]  (kept "${r.owner.name}"${r.disp ? `; search hit "${r.disp}"` : '; no search match'})`));

  if (APPLY) {
    const out = cafes.filter((c) => !removeIds.has(c.id));
    fs.writeFileSync(CAFES_FILE, JSON.stringify(out, null, 2));
    console.log(`\nApplied. ${fixed.length} repointed, ${removed.length} removed. ${cafes.length} -> ${out.length} cafes.`);
  } else {
    console.log(`\nDry run only. Re-run with  APPLY=1 node scripts/fix_kindb_placeids.js  to write.`);
  }
}

run().catch(console.error);
