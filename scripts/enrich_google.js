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

// Cafes known to exist but missed by the grid — searched by text with no location bias.
const MUST_FIND = [
  { query: 'Little Nooky Cafe Degraves Street Melbourne CBD' },
  { query: 'Little Nooky Cafe Richmond Church Street Victoria' },
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
  const bias = `circle:1000@${lat},${lng}`;
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id,geometry&locationbias=${bias}&key=${KEY}`;
  await sleep(RATE_MS);
  const data = await get(url);
  if (data.status !== 'OK') {
    if (data.status !== 'ZERO_RESULTS') process.stdout.write(`[API:${data.status}] `);
    return null;
  }
  if (!data.candidates?.length) return null;
  const c = data.candidates[0];
  const dlat = c.geometry.location.lat - lat;
  const dlng = c.geometry.location.lng - lng;
  if (Math.sqrt(dlat * dlat + dlng * dlng) * 111000 > 600) return null;
  return c.place_id;
}

// Looser re-pass: wider bias, larger distance, name-only query
async function findPlaceIdLoose(name, lat, lng) {
  const q = encodeURIComponent(`${name} Melbourne`);
  const bias = `circle:5000@${lat},${lng}`;
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id,geometry&locationbias=${bias}&key=${KEY}`;
  await sleep(RATE_MS);
  const data = await get(url);
  if (data.status !== 'OK') return null;
  if (!data.candidates?.length) return null;
  const c = data.candidates[0];
  const dlat = c.geometry.location.lat - lat;
  const dlng = c.geometry.location.lng - lng;
  if (Math.sqrt(dlat * dlat + dlng * dlng) * 111000 > 1500) return null;
  return c.place_id;
}

async function getDetails(placeId) {
  const fields = 'name,rating,user_ratings_total,photos,price_level,opening_hours,formatted_phone_number,website,business_status,reviews';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${KEY}`;
  await sleep(RATE_MS);
  const data = await get(url);
  return data.status === 'OK' ? data.result : null;
}

function extractAttributes(reviews = []) {
  const text = reviews.map((r) => r.text || '').join(' ').toLowerCase();
  const has = (re) => re.test(text) ? true : null;
  const quiet = /\bquiet\b|\bpeaceful\b|\bcalm\b|\brelax/.test(text)
    ? true : /\bnoisy\b|\bloud\b|\bcrowded\b/.test(text) ? false : null;
  return {
    hasWifi:         has(/\bwi.?fi\b|\bwireless\b|\binternet\b/),
    laptopFriendly:  has(/\blaptop\b|\bremote work\b|\bwork(ing)? (from|here)\b|\bstud(y|ying)\b/),
    dogFriendly:     has(/\bdog\b|\bpup(py|pet)?\b|\bcanine\b|\bpooch\b|\bfour.legged\b/),
    outdoorSeating:  has(/\boutdoor\b|\boutside\b|\bgarden\b|\bterrace\b|\bcourtyard\b|\balfresco\b|\bsidewal(k|kside)\b/),
    quiet,
    matcha:          has(/\bmatcha\b/),
    pastries:        has(/\bpastry\b|\bpastries\b|\bcroissant\b|\bdanish\b|\bscone\b|\bbrioche\b/),
    hasDecaf:        has(/\bdecaf\b/),
    specialtyCoffee: has(/\bspecialt(y|ies) coffee\b|\bsingle.?origin\b|\bfilter coffee\b|\baeropress\b|\bpour.?over\b|\bcold brew\b/),
  };
}

async function getPhotoUrl(ref) {
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${ref}&key=${KEY}`;
  const res = await fetch(url, { redirect: 'manual' });
  return res.headers.get('location') || null;
}

async function getPhotoUrls(photos, max = 4) {
  const urls = [];
  for (const photo of (photos || []).slice(0, max)) {
    const url = await getPhotoUrl(photo.photo_reference);
    if (url) urls.push(url);
  }
  return urls;
}

// Returns all results across up to 3 pages (max 60 per location)
async function nearbySearchAll(lat, lng, radiusM, keyword = null) {
  const results = [];
  const kw = keyword ? `&keyword=${encodeURIComponent(keyword)}` : '';
  let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusM}&type=cafe${kw}&key=${KEY}`;

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

// ── Step 0: Upgrade already-enriched cafes (multi-photo + reviews) ───────────

console.log('\n─── Step 0: Upgrading photos + reviews for matched cafes ────────────\n');

const needsUpgrade = Object.entries(progress.enriched)
  .filter(([, e]) => e.found && e.googlePlaceId && !e.photoUrls && !e.reviews);
console.log(`  ${needsUpgrade.length} cafes need photo/review upgrade\n`);

let u = 0;
for (const [id, e] of needsUpgrade) {
  u++;
  if (u % 50 === 0) process.stdout.write(`  [${u}/${needsUpgrade.length}]\n`);
  try {
    const d = await getDetails(e.googlePlaceId);
    if (!d) continue;
    e.photoUrls = await getPhotoUrls(d.photos);
    e.reviews = (d.reviews || []).map((r) => ({ text: r.text, rating: r.rating }));
    e.businessStatus = d.business_status ?? e.businessStatus;
  } catch (err) {
    // non-fatal — keep old data
  }
  if (u % 20 === 0) save();
}

save();
console.log(`✅  Upgrade done (${needsUpgrade.length} cafes)\n`);

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
      const photoUrls = await getPhotoUrls(d?.photos);

      const reviews = (d?.reviews || []).map((r) => ({ text: r.text, rating: r.rating }));
      progress.enriched[cafe.id] = {
        found: true,
        googlePlaceId: placeId,
        businessStatus: d?.business_status ?? 'OPERATIONAL',
        rating: d?.rating ?? null,
        userRatingsTotal: d?.user_ratings_total ?? null,
        priceLevel: d?.price_level ?? null,
        photoUrls,
        reviews,
        openingHours: d?.opening_hours?.periods ? parseGoogleHours(d.opening_hours.periods) : null,
        phone: d?.formatted_phone_number ?? null,
        website: d?.website ?? null,
      };

      const stars = d?.rating ? `${d.rating}★` : '–';
      const reviewCount = d?.user_ratings_total ? `${d.user_ratings_total} reviews` : 'no reviews';
      process.stdout.write(`✓ ${stars} ${reviewCount} ${photoUrls.length}📷\n`);
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

// ── Step 1b: Re-pass for unmatched cafes with looser search ──────────────────

console.log('\n─── Step 1b: Re-pass unmatched cafes (wider search) ─────────────────\n');

const unmatched = cafes.filter((c) => progress.enriched[c.id]?.found === false);
console.log(`  ${unmatched.length} cafes to retry\n`);

let rematchCount = 0;
for (const cafe of unmatched) {
  process.stdout.write(`  ${cafe.name} (${cafe.suburb})… `);
  try {
    const placeId = await findPlaceIdLoose(cafe.name, cafe.latitude, cafe.longitude);
    if (!placeId) {
      process.stdout.write('✗ still not found\n');
    } else {
      const d = await getDetails(placeId);
      const photoUrls = await getPhotoUrls(d?.photos);
      const reviews = (d?.reviews || []).map((r) => ({ text: r.text, rating: r.rating }));
      progress.enriched[cafe.id] = {
        found: true,
        googlePlaceId: placeId,
        businessStatus: d?.business_status ?? 'OPERATIONAL',
        rating: d?.rating ?? null,
        userRatingsTotal: d?.user_ratings_total ?? null,
        priceLevel: d?.price_level ?? null,
        photoUrls,
        reviews,
        openingHours: d?.opening_hours?.periods ? parseGoogleHours(d.opening_hours.periods) : null,
        phone: d?.formatted_phone_number ?? null,
        website: d?.website ?? null,
      };
      const stars = d?.rating ? `${d.rating}★` : '–';
      process.stdout.write(`✓ ${stars} (rematch) ${photoUrls.length}📷\n`);
      rematchCount++;
    }
  } catch (err) {
    process.stdout.write(`error: ${err.message}\n`);
  }
}

save();
console.log(`\n✅  Rematched ${rematchCount} / ${unmatched.length} previously-unmatched cafes`);

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
      if (d.business_status === 'CLOSED_PERMANENTLY') { knownGoogleIds.add(place.place_id); continue; }
      const photoUrls = await getPhotoUrls(d.photos);

      progress.newCafes.push({
        _googlePlaceId: place.place_id,
        name: d.name || place.name,
        latitude: plat,
        longitude: plng,
        rating: d.rating ?? null,
        userRatingsTotal: d.user_ratings_total ?? null,
        priceLevel: d.price_level ?? null,
        photoUrls,
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

// ── Step 2b: Discovery with coffee/brunch keywords (catches non-"cafe" typed places) ──

console.log('\n─── Step 2b: Discovery — coffee/brunch keyword sweep ────────────────\n');

if (!progress.scannedCellsKw) progress.scannedCellsKw = [];
const scannedSetKw = new Set(progress.scannedCellsKw);
const KW_PASSES = ['coffee', 'brunch'];

for (const kw of KW_PASSES) {
  let kwCellN = 0;
  for (const cell of deduped) {
    kwCellN++;
    const key = `${cell.key}:${kw}`;
    if (scannedSetKw.has(key)) continue;

    process.stdout.write(`  [${kw}] Cell ${kwCellN}/${deduped.length}… `);
    try {
      let places;
      try {
        places = await nearbySearchAll(cell.lat, cell.lng, cell.radiusM, kw);
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

        const d = await getDetails(place.place_id);
        if (!d) continue;
        if (d.business_status === 'CLOSED_PERMANENTLY') { knownGoogleIds.add(place.place_id); continue; }
        const photoUrls = await getPhotoUrls(d.photos);

        progress.newCafes.push({
          _googlePlaceId: place.place_id,
          name: d.name || place.name,
          latitude: plat,
          longitude: plng,
          rating: d.rating ?? null,
          userRatingsTotal: d.user_ratings_total ?? null,
          priceLevel: d.price_level ?? null,
          photoUrls,
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
      scannedSetKw.add(key);
      progress.scannedCellsKw.push(key);
    } catch (err) {
      process.stdout.write(`error: ${err.message}\n`);
    }

    if (kwCellN % 20 === 0) save();
  }
}

save();
console.log(`\n✅  Keyword sweep done — ${progress.newCafes.length} total new cafes`);

// ── Step 2c: Force-find specific known cafes by text search ──────────────────

console.log('\n─── Step 2c: Force-find known missing cafes ─────────────────────────\n');
if (!progress.forceFindDone) progress.forceFindDone = [];
const forceDoneSet = new Set(progress.forceFindDone);

for (const { query } of MUST_FIND) {
  if (forceDoneSet.has(query)) continue;
  process.stdout.write(`  Searching: "${query}"… `);
  try {
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,geometry,name&key=${KEY}`;
    await sleep(RATE_MS);
    const data = await get(url);
    if (data.status !== 'OK' || !data.candidates?.length) {
      process.stdout.write('✗ not found\n');
    } else {
      const c = data.candidates[0];
      if (knownGoogleIds.has(c.place_id)) {
        process.stdout.write(`already have it (${c.name})\n`);
      } else {
        const d = await getDetails(c.place_id);
        if (!d || d.business_status === 'CLOSED_PERMANENTLY') {
          process.stdout.write('✗ closed or no details\n');
        } else {
          const photoUrls = await getPhotoUrls(d.photos);
          const reviews = (d.reviews || []).map((r) => ({ text: r.text, rating: r.rating }));
          progress.newCafes.push({
            _googlePlaceId: c.place_id,
            name: d.name || c.name,
            latitude: c.geometry.location.lat,
            longitude: c.geometry.location.lng,
            rating: d.rating ?? null,
            userRatingsTotal: d.user_ratings_total ?? null,
            priceLevel: d.price_level ?? null,
            photoUrls,
            reviews,
            openingHours: d.opening_hours?.periods ? parseGoogleHours(d.opening_hours.periods) : null,
            phone: d.formatted_phone_number ?? null,
            website: d.website ?? null,
            vicinity: d.vicinity ?? '',
          });
          knownGoogleIds.add(c.place_id);
          process.stdout.write(`✓ added ${d.name} (${d.rating}★ ${d.user_ratings_total} reviews)\n`);
        }
      }
    }
  } catch (err) {
    process.stdout.write(`error: ${err.message}\n`);
  }
  progress.forceFindDone.push(query);
}

save();

// ── Step 3: Merge & write output ──────────────────────────────────────────────

console.log('\n─── Step 3: Building output ──────────────────────────────────────────\n');

// Merge enrichment into existing cafes, dropping permanently closed ones.
// Also drop cafes that are confirmed not found AND have no rating/reviews — likely stale OSM ghosts.
const merged = cafes
  .filter((cafe) => {
    const e = progress.enriched[cafe.id];
    if (e?.found && e.businessStatus === 'CLOSED_PERMANENTLY') return false;
    if (e?.found === false) return false;
    return true;
  })
  .map((cafe) => {
    const e = progress.enriched[cafe.id];
    if (!e?.found) return cafe;
    const attrs = extractAttributes(e.reviews || []);
    return {
      ...cafe,
      rating: e.rating,
      userRatingsTotal: e.userRatingsTotal,
      priceLevel: e.priceLevel,
      images: e.photoUrls?.length ? e.photoUrls : (e.photoUrl ? [e.photoUrl] : cafe.images),
      openingHours: e.openingHours || cafe.openingHours,
      phone: e.phone || cafe.phone,
      website: e.website || cafe.website,
      _googlePlaceId: e.googlePlaceId,
      // Only overwrite if the existing value is null (manual curation wins)
      hasWifi:         cafe.hasWifi         ?? attrs.hasWifi,
      laptopFriendly:  cafe.laptopFriendly  ?? attrs.laptopFriendly,
      dogFriendly:     cafe.dogFriendly     ?? attrs.dogFriendly,
      outdoorSeating:  cafe.outdoorSeating  ?? attrs.outdoorSeating,
      quiet:           cafe.quiet           ?? attrs.quiet,
      matcha:          cafe.matcha          ?? attrs.matcha,
      pastries:        cafe.pastries        ?? attrs.pastries,
      hasDecaf:        cafe.hasDecaf        ?? attrs.hasDecaf,
      specialtyCoffee: cafe.specialtyCoffee ?? attrs.specialtyCoffee,
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

  const ncAttrs = extractAttributes(nc.reviews || []);
  newConverted.push({
    id: slug,
    name: nc.name,
    suburb,
    address: nc.vicinity || '',
    latitude: nc.latitude,
    longitude: nc.longitude,
    rating: nc.rating,
    userRatingsTotal: nc.userRatingsTotal,
    coffeeQuality: null,
    foodQuality: null,
    priceLevel: nc.priceLevel,
    images: nc.photoUrls?.length ? nc.photoUrls : [],
    shortDescription: null,
    hasWifi:         ncAttrs.hasWifi,
    laptopFriendly:  ncAttrs.laptopFriendly,
    dogFriendly:     ncAttrs.dogFriendly,
    outdoorSeating:  ncAttrs.outdoorSeating,
    quiet:           ncAttrs.quiet,
    goodForDates: null,
    goodForWork: null,
    goodForGroups: null,
    specialtyCoffee: ncAttrs.specialtyCoffee,
    matcha:          ncAttrs.matcha,
    pastries:        ncAttrs.pastries,
    hasDecaf:        ncAttrs.hasDecaf,
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
