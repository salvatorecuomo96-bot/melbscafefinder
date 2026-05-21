/**
 * Yelp Fusion API seeder.
 *
 * Searches Yelp for cafes across Melbourne suburbs and writes the results
 * to src/data/cafes.generated.js — a drop-in replacement for cafes.js.
 *
 * Usage (one-time, run from the project root):
 *   node scripts/seedFromYelp.js
 *
 * Prerequisites:
 *   Set YELP_API_KEY in your .env file (free at yelp.com/developers).
 *   This script uses built-in Node 18+ fetch — no extra packages needed.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Read .env manually (no dotenv package needed in Node 20+)
const envPath = path.resolve(process.cwd(), '.env');
const envText = await fs.readFile(envPath, 'utf8').catch(() => '');
const envVars = Object.fromEntries(
  envText.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);
const YELP_KEY = envVars.YELP_API_KEY || process.env.YELP_API_KEY;

if (!YELP_KEY || YELP_KEY.includes('your_')) {
  console.error('\n  ERROR: Set YELP_API_KEY in your .env file first.\n  Get a free key at https://www.yelp.com/developers/v3/manage_app\n');
  process.exit(1);
}

// Melbourne suburbs to search. Each search returns up to 50 results.
// Yelp de-dupes across location so you'll get ~15–30 unique cafes per suburb.
const SUBURBS = [
  'Fitzroy, Melbourne',
  'Carlton, Melbourne',
  'Collingwood, Melbourne',
  'Brunswick, Melbourne',
  'Richmond, Melbourne',
  'South Yarra, Melbourne',
  'Prahran, Melbourne',
  'St Kilda, Melbourne',
  'South Melbourne',
  'Northcote, Melbourne',
  'Cremorne, Melbourne',
  'CBD, Melbourne',
];

// Map Yelp price tier (1–4) straight across — same scale as our app.
function priceLevel(yelpPrice) {
  if (!yelpPrice) return 2;
  return Math.min(4, yelpPrice.length); // "$" → 1, "$$" → 2, etc.
}

// Turn a Yelp category alias into a tag we recognise.
const CATEGORY_TAGS = {
  coffee: 'specialty',
  cafes: 'cafe',
  tea: 'tea',
  juicebars: 'juice',
  breakfast_brunch: 'brunch',
  bakeries: 'bakery',
};

function extractTags(categories = []) {
  return categories
    .map(c => CATEGORY_TAGS[c.alias] || c.title.toLowerCase())
    .filter(Boolean)
    .slice(0, 4);
}

async function yelpSearch(location) {
  const url = new URL('https://api.yelp.com/v3/businesses/search');
  url.searchParams.set('location', location);
  url.searchParams.set('term', 'coffee cafe');
  url.searchParams.set('limit', '50');
  url.searchParams.set('sort_by', 'rating');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${YELP_KEY}` }
  });
  if (!res.ok) {
    console.warn(`  Yelp search failed for "${location}" — ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.businesses || [];
}

async function yelpDetail(id) {
  const res = await fetch(`https://api.yelp.com/v3/businesses/${id}`, {
    headers: { Authorization: `Bearer ${YELP_KEY}` }
  });
  if (!res.ok) return null;
  return res.json();
}

// Pause between requests so we don't hit rate limits.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- main ----

console.log('\n  Melbourne Cafe Finder — Yelp seeder\n');

const seen = new Set();
const rawCafes = [];

for (const suburb of SUBURBS) {
  console.log(`  Searching: ${suburb} …`);
  const results = await yelpSearch(suburb);
  console.log(`    → ${results.length} results`);

  for (const biz of results) {
    if (seen.has(biz.id)) continue;
    seen.add(biz.id);
    rawCafes.push(biz);
    await sleep(120); // ~8 detail calls/sec, well under the 100/s limit
  }
}

console.log(`\n  Found ${rawCafes.length} unique cafes. Fetching details …\n`);

const cafes = [];
let i = 0;

for (const biz of rawCafes) {
  i++;
  process.stdout.write(`  [${i}/${rawCafes.length}] ${biz.name} …\r`);

  // The detail endpoint gives us hours and extra photos.
  const detail = await yelpDetail(biz.id);
  await sleep(120);

  const hours = {};
  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const yelpOpen = detail?.hours?.[0]?.open || [];

  for (const slot of yelpOpen) {
    const key = dayKeys[slot.day];
    // Yelp gives hours as "0700" → convert to "7:00"
    const fmt = (t) => `${parseInt(t.slice(0, 2))}:${t.slice(2)}`;
    hours[key] = `${fmt(slot.start)} - ${fmt(slot.end)}`;
  }
  // Fill in Closed for any day not returned
  for (const key of dayKeys) {
    if (!hours[key]) hours[key] = 'Closed';
  }

  // Collect up to 4 photos (Yelp returns 3 on the detail endpoint)
  const photos = [
    biz.image_url,
    ...(detail?.photos || [])
  ].filter(Boolean).slice(0, 4);

  // Build the suburb from the Yelp location object
  const suburb = biz.location?.city || biz.location?.neighborhood || 'Melbourne';
  const address = [
    biz.location?.address1,
    biz.location?.city
  ].filter(Boolean).join(', ');

  const tags = extractTags(biz.categories || []);
  const isSpecialty = tags.includes('specialty') || (biz.rating >= 4.3);

  cafes.push({
    id: biz.alias,          // Yelp's URL-safe unique slug
    name: biz.name,
    suburb,
    address,
    latitude: biz.coordinates?.latitude ?? null,
    longitude: biz.coordinates?.longitude ?? null,
    rating: biz.rating,
    coffeeQuality: Math.round(biz.rating),   // Yelp rating → coffee quality proxy
    foodQuality: 3,                           // Yelp doesn't separate these; fill in manually
    vibe: tags.slice(0, 2).join(', ') || 'cafe',
    tags,
    amenities: [],
    // Fields Yelp doesn't have — set sensible defaults, then edit manually
    hasWifi: null,
    laptopFriendly: null,
    hasDecaf: null,
    plantMilk: [],
    dogFriendly: null,
    outdoorSeating: null,
    quiet: null,
    goodForDates: null,
    goodForWork: null,
    goodForGroups: null,
    specialtyCoffee: isSpecialty,
    matcha: null,
    pastries: null,
    priceLevel: priceLevel(biz.price),
    openingHours: hours,
    images: photos,
    shortDescription: `${biz.name} — ${suburb}. ${biz.review_count} reviews on Yelp.`,
    // Source metadata (helps if you later want to re-sync)
    _source: 'yelp',
    _yelpId: biz.id,
    _yelpUrl: biz.url,
  });
}

// Write output file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '../src/data/cafes.generated.js');

const js = `// Auto-generated by scripts/seedFromYelp.js — ${new Date().toISOString()}
// Do NOT edit manually. Re-run the script to refresh.
// After seeding, manually fill in the null fields (wifi, plantMilk, etc.)

export const CAFES = ${JSON.stringify(cafes, null, 2)};
`;

await fs.writeFile(outPath, js, 'utf8');
console.log(`\n\n  Done. ${cafes.length} cafes written to:\n  src/data/cafes.generated.js\n`);
console.log('  Next steps:');
console.log('  1. Rename cafes.generated.js to cafes.js (or update the import in useCafeFilters.js)');
console.log('  2. Manually fill in the null fields for each cafe (wifi, plantMilk, quiet, etc.)');
console.log('  3. Run npm run dev and verify the map\n');
