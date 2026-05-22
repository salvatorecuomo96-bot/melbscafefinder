#!/usr/bin/env node
/**
 * scripts/enrich_google.js
 *
 * Phase 2: Enriches existing cafes with Google Places data (ratings, photos,
 * price level, opening hours) and discovers cafes missing from the Geoapify
 * scrape via Google Nearby Search.
 *
 * Usage:
 *   node scripts/enrich_google.js
 *   (GOOGLE_PLACES_KEY must be in .env or passed as an env var)
 *
 * Outputs:
 *   data/cafes_enriched.json  — review this, then run:
 *   node scripts/publish_enriched.js  — to push it live to public/cafes.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env manually (no dotenv dependency)
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) {
  console.error('❌  GOOGLE_PLACES_KEY not found in .env');
  process.exit(1);
}

const CAFES_FILE      = path.join(ROOT, 'public', 'cafes.json');
const PROGRESS_FILE   = path.join(ROOT, 'data', 'enrich_progress.json');
const ENRICHED_FILE   = path.join(ROOT, 'data', 'cafes_enriched.json');

const RATE_MS = 250;   // 4 req/sec — well within Google's limits

// Discovery grid: CBD + ~11km radius, 0.02° cells (~2km).
// Covers all iconic Melbourne cafe suburbs: Fitzroy, Carlton, Brunswick,
// Richmond, South Yarra, St Kilda, Northcote, Hawthorn, Collingwood, Prahran.
const DISCOVERY_ZONES = [
  { minLat: -37.92, maxLat: -37.71, minLng: 144.84, maxLng: 145.09, cell: 0.02 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── API helpers ───────────────────────────────────────────────────────────────

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function findPlaceId(name, suburb, lat, lng) {
  const q = encodeURIComponent(`${name} ${suburb} Melbourne`);
  const bias = `circle:400@${lat},${lng}`;
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id,geometry&locationbias=${bias}&key=${KEY}`;
  await sleep(RATE_MS);
  const data = await get(url);
  if (data.status !== 'OK') {
    if (data.status !== 'ZERO_RESULTS') process.stdout.write(`[API:${data.status}] `);
    return null;
  }
  if (!data.candidates?.length) return null;
  const c = data.candidates[0];
  // Must be within 350m of our known location
  const dlat = c.geometry.location.lat - lat;
  const dlng = c.geometry.location.lng - lng;
  if (Math.sqrt(dlat * dlat + dlng * dlng) * 111000 > 350) return null;
  return c.place_id;
}

async function getDetails(placeId) {
  const fields = 'name,rating,user_ratings_total,photos,price_level,opening_hours,formatted_phone_number,website';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${KEY}`;
  await sleep(RATE_MS);
  const data = await get(url);
  return data.status === 'OK' ? data.result : null;
}

async function getPhotoUrl(ref) {
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${ref}&key=${KEY}`;
  const res = await fetch(url, { redirect: 'manual' });
  return res.headers.get('location') || null;
}

// Returns all results across up to 3 pages (max 60 per location)
async function nearbySearchAll(lat, lng, radiusM) {
  const results = [];
  let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusM}&type=cafe&key=${KEY}`;

  for (let page = 0; page < 3; page++) {
    await sleep(RATE_MS);
    const data = await get(url);
    if (data.status === 'OVER_QUERY_LIMIT') throw new Error('OVER_QUERY_LIMIT');
    for (const r of (data.results || [])) results.push(r);
    if (!data.next_page_token) break;
    // Google requires a short delay before using next_page_token
    await sleep(2000);
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${data.next_page_token}&key=${KEY}`;
  }
  return results;
}

// ── Hours parsing ─────────────────────────────────────────────────────────────

function parseGoogleHours(periods) {
  if (!periods?.length) return null;
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const result = {};
  for (const p of periods) {
    const day = DAYS[p.open?.day];
    if (!day) continue;
    if (!p.close) { result[day] = 'Open 24h'; continue; }
    const fmt = (t) => { const s = String(t).padStart(4, '0'); return `${s.slice(0, 2)}:${s.slice(2)}`; };
    result[day] = `${fmt(p.open.time)} - ${fmt(p.close.time)}`;
  }
  return Object.keys(result).length ? result : null;
}

// ── Slug helpers (mirrors transform.js) ──────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
}

function suburbFromVicinity(vicinity) {
  if (!vicinity) return 'Melbourne';
  const parts = vicinity.split(',');
  return parts[parts.length > 1 ? parts.length - 2 : 0]?.trim() || 'Melbourne';
}

// ── Load state ────────────────────────────────────────────────────────────────

const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
console.log(`▶  Loaded ${cafes.length} existing cafes`);

let progress = { enriched: {}, newCafes: [], scannedCells: [] };
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  const done = Object.keys(progress.enriched).length;
  console.log(`↩  Resuming: ${done} enriched, ${progress.newCafes.length} new cafes, ${progress.scannedCells.length} cells scanned`);
}

const save = () => fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

// ── API sanity check ──────────────────────────────────────────────────────────
{
  const testUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=Proud%20Mary%20Collingwood&inputtype=textquery&fields=place_id,name&key=${KEY}`;
  const r = await fetch(testUrl).then(r => r.json());
  if (r.status === 'REQUEST_DENIED') {
    console.error(`\n❌  API key rejected: ${r.error_message}`);
    console.error('   → Go to Google Cloud Console → Credentials → edit your API key → remove API restrictions\n');
    process.exit(1);
  }
  if (r.status === 'OK') console.log(`✅  API key working — found "${r.candidates[0]?.name}" in test search\n`);
  else console.log(`⚠️  API test status: ${r.status} (may still work)\n`);
}

// ── Step 1: Enrich existing cafes ────────────────────────────────────────────

console.log('\n─── Step 1: Enrich existing cafes ───────────────────────────────────\n');

let n = 0;
for (const cafe of cafes) {
  n++;
  if (progress.enriched[cafe.id]) continue;

  process.stdout.write(`[${n}/${cafes.length}] ${cafe.name} (${cafe.suburb})… `);

  try {
    const placeId = await findPlaceId(cafe.name, cafe.suburb, cafe.latitude, cafe.longitude);

    if (!placeId) {
      progress.enriched[cafe.id] = { found: false };
      process.stdout.write('✗ not found\n');
    } else {
      const d = await getDetails(placeId);
      let photoUrl = null;
      if (d?.photos?.[0]) photoUrl = await getPhotoUrl(d.photos[0].photo_reference);

      progress.enriched[cafe.id] = {
        found: true,
        googlePlaceId: placeId,
        rating: d?.rating ?? null,
        userRatingsTotal: d?.user_ratings_total ?? null,
        priceLevel: d?.price_level ?? null,
        photoUrl,
        openingHours: d?.opening_hours?.periods ? parseGoogleHours(d.opening_hours.periods) : null,
        phone: d?.formatted_phone_number ?? null,
        website: d?.website ?? null,
      };

      const stars = d?.rating ? `${d.rating}★` : '–';
      const reviews = d?.user_ratings_total ? `${d.user_ratings_total} reviews` : 'no reviews';
      process.stdout.write(`✓ ${stars} ${reviews}\n`);
    }
  } catch (err) {
    process.stdout.write(`error: ${err.message}\n`);
    progress.enriched[cafe.id] = { found: false };
  }

  if (n % 20 === 0) save();
}

save();
const foundCount = Object.values(progress.enriched).filter((e) => e.found).length;
console.log(`\n✅  Enriched ${foundCount} / ${cafes.length} cafes`);

// ── Step 2: Discover missing cafes ───────────────────────────────────────────

console.log('\n─── Step 2: Discover missing cafes ──────────────────────────────────\n');

// Index existing + already-found new cafes by rounded coord for fast dedup
const knownCoords = new Set([
  ...cafes.map((c) => `${Math.round(c.latitude * 1000)},${Math.round(c.longitude * 1000)}`),
  ...progress.newCafes.map((c) => `${Math.round(c.latitude * 1000)},${Math.round(c.longitude * 1000)}`),
]);
const knownGoogleIds = new Set(progress.newCafes.map((c) => c._googlePlaceId));
// Also index google IDs from enriched existing cafes
for (const e of Object.values(progress.enriched)) {
  if (e.googlePlaceId) knownGoogleIds.add(e.googlePlaceId);
}

const scannedSet = new Set(progress.scannedCells);

// Build grid from two zones; zone 1 (dense CBD area) comes first
const cells = [];
for (const zone of DISCOVERY_ZONES) {
  const { minLat, maxLat, minLng, maxLng, cell } = zone;
  for (let lat = minLat; lat < maxLat; lat = Math.round((lat + cell) * 100000) / 100000) {
    for (let lng = minLng; lng < maxLng; lng = Math.round((lng + cell) * 100000) / 100000) {
      const clat = +(lat + cell / 2).toFixed(5);
      const clng = +(lng + cell / 2).toFixed(5);
      // Skip if already covered by a finer zone cell (avoids exact duplicates)
      const key = `${clat},${clng}`;
      if (!cells.some((c) => c.key === key)) {
        cells.push({ lat: clat, lng: clng, key, radiusM: Math.round(cell * 55000) });
      }
    }
  }
}

// Deduplicate: zone 2 cells whose centre already falls inside zone 1 bounds get skipped
const zone1 = DISCOVERY_ZONES[0];
const deduped = cells.filter((c) => {
  if (c.radiusM > 1200) return true; // zone 2 cells (0.04° → ~2200m)
  return true; // keep all zone 1 cells
});

console.log(`  Grid: ${deduped.filter(c=>c.radiusM<=1200).length} zone-1 cells (CBD 20km, 0.02°) + ${deduped.filter(c=>c.radiusM>1200).length} zone-2 cells (outer)`);
console.log(`  ${scannedSet.size}/${deduped.length} already scanned, ${progress.newCafes.length} new cafes so far\n`);

let cellN = 0;
for (const cell of deduped) {
  cellN++;
  const key = cell.key;
  if (scannedSet.has(key)) continue;

  const zone = cell.radiusM <= 1200 ? 'Z1' : 'Z2';
  process.stdout.write(`  [${zone}] Cell ${cellN}/${deduped.length}… `);

  try {
    let places;
    try {
      places = await nearbySearchAll(cell.lat, cell.lng, cell.radiusM);
    } catch (e) {
      if (e.message === 'OVER_QUERY_LIMIT') {
        process.stdout.write('rate limited — pausing 10s\n');
        await sleep(10000);
        continue;
      }
      throw e;
    }

    let added = 0;
    for (const place of places) {
      if (knownGoogleIds.has(place.place_id)) continue;
      const plat = place.geometry.location.lat;
      const plng = place.geometry.location.lng;
      const coordKey = `${Math.round(plat * 1000)},${Math.round(plng * 1000)}`;
      if (knownCoords.has(coordKey)) continue;

      // New cafe — get full details
      const d = await getDetails(place.place_id);
      if (!d) continue;
      let photoUrl = null;
      if (d.photos?.[0]) photoUrl = await getPhotoUrl(d.photos[0].photo_reference);

      progress.newCafes.push({
        _googlePlaceId: place.place_id,
        name: d.name || place.name,
        latitude: plat,
        longitude: plng,
        rating: d.rating ?? null,
        userRatingsTotal: d.user_ratings_total ?? null,
        priceLevel: d.price_level ?? null,
        photoUrl,
        openingHours: d.opening_hours?.periods ? parseGoogleHours(d.opening_hours.periods) : null,
        phone: d.formatted_phone_number ?? null,
        website: d.website ?? null,
        vicinity: place.vicinity ?? '',
      });

      knownGoogleIds.add(place.place_id);
      knownCoords.add(coordKey);
      added++;
    }

    process.stdout.write(`+${added} new (${places.length} results)\n`);
    scannedSet.add(key);
    progress.scannedCells.push(key);
  } catch (err) {
    process.stdout.write(`error: ${err.message}\n`);
  }

  if (cellN % 20 === 0) save();
}

save();
console.log(`\n✅  Discovery done — ${progress.newCafes.length} new cafes found`);

// ── Step 3: Merge & write output ──────────────────────────────────────────────

console.log('\n─── Step 3: Building output ──────────────────────────────────────────\n');

// Merge enrichment into existing cafes
const merged = cafes.map((cafe) => {
  const e = progress.enriched[cafe.id];
  if (!e?.found) return cafe;
  return {
    ...cafe,
    rating: e.rating,
    priceLevel: e.priceLevel,
    images: e.photoUrl ? [e.photoUrl] : cafe.images,
    openingHours: e.openingHours || cafe.openingHours,
    phone: e.phone || cafe.phone,
    website: e.website || cafe.website,
    _googlePlaceId: e.googlePlaceId,
  };
});

// Convert new cafes to the same shape
const seen = new Set(merged.map((c) => c.id));
const newConverted = [];

for (const nc of progress.newCafes) {
  const suburb = suburbFromVicinity(nc.vicinity);
  let slug = slugify(`${nc.name}-${suburb}`);
  let suffix = 2;
  while (seen.has(slug)) slug = `${slugify(`${nc.name}-${suburb}`)}-${suffix++}`;
  seen.add(slug);

  newConverted.push({
    id: slug,
    name: nc.name,
    suburb,
    address: nc.vicinity || '',
    latitude: nc.latitude,
    longitude: nc.longitude,
    rating: nc.rating,
    coffeeQuality: null,
    foodQuality: null,
    priceLevel: nc.priceLevel,
    images: nc.photoUrl ? [nc.photoUrl] : [],
    shortDescription: null,
    hasWifi: null,
    laptopFriendly: null,
    dogFriendly: null,
    outdoorSeating: null,
    quiet: null,
    goodForDates: null,
    goodForWork: null,
    goodForGroups: null,
    specialtyCoffee: null,
    matcha: null,
    pastries: null,
    hasDecaf: null,
    plantMilk: null,
    phone: nc.phone,
    website: nc.website,
    openingHours: nc.openingHours,
    vibe: null,
    tags: [],
    amenities: [],
    _source: 'google',
    _googlePlaceId: nc._googlePlaceId,
  });
}

const output = [...merged, ...newConverted];
fs.writeFileSync(ENRICHED_FILE, JSON.stringify(output));

const withRating  = output.filter((c) => c.rating != null).length;
const withPhoto   = output.filter((c) => c.images?.length).length;
const newFromGoogle = newConverted.length;

console.log(`✅  Done!`);
console.log(`   Total cafes   : ${output.length} (${newFromGoogle} new from Google)`);
console.log(`   With rating   : ${withRating}`);
console.log(`   With photo    : ${withPhoto}`);
console.log(`\n📄  Saved → data/cafes_enriched.json`);
console.log(`\n👉  To go live: node scripts/publish_enriched.js`);
