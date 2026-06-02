/**
 * fetch_coffee_brands.js  —  detect coffee roaster from Google reviews + summaries
 * ----------------------------------------------------------------------------
 * No website scraping, no Anthropic. For each cafe missing a coffeeBrand, pulls
 * Google Places (New) reviews + editorial/generative summary and matches the
 * text against a curated list of Melbourne/AU coffee roasters. A roaster is
 * accepted only when it appears near coffee context (so "better than X" noise
 * is filtered), and the most-mentioned qualifying roaster wins.
 *
 * Uses your Google credit (Places API New). Resumable.
 *
 * Run:  node scripts/fetch_coffee_brands.js
 *       BRAND_LIMIT=20 node scripts/fetch_coffee_brands.js   (test 20)
 * ----------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/coffee_brands_progress.json');

const KEY      = process.env.GOOGLE_PLACES_KEY;
const DELAY_MS = 140;
const LIMIT    = parseInt(process.env.BRAND_LIMIT || '0', 10) || Infinity;

// Canonical brand → match patterns (lowercase, matched as word-ish). Order = priority on ties.
const ROASTERS = [
  ['Seven Seeds', ['seven seeds', '7 seeds']],
  ['Market Lane', ['market lane']],
  ['Proud Mary', ['proud mary']],
  ['Padre', ['padre']],
  ['Industry Beans', ['industry beans']],
  ['Single O', ['single o', 'single origin roasters']],
  ['St Ali', ['st ali', 'st. ali', 'stali']],
  ['Allpress', ['allpress']],
  ['Five Senses', ['five senses']],
  ['Code Black', ['code black']],
  ['Veneziano', ['veneziano']],
  ['Genovese', ['genovese']],
  ['Axil', ['axil']],
  ['Inglewood', ['inglewood']],
  ['Dukes', ['dukes']],
  ['Ona', ['ona coffee', 'ona ']],
  ['Sensory Lab', ['sensory lab']],
  ['Campos', ['campos']],
  ['Coffee Supreme', ['coffee supreme', 'supreme coffee']],
  ['Cartel', ['cartel']],
  ['Rumble', ['rumble coffee', 'rumble']],
  ['Clark Street', ['clark street']],
  ['Symmetry', ['symmetry']],
  ['Small Batch', ['small batch']],
  ['Wood & Co', ['wood and co', 'wood & co']],
  ['Vacation', ['vacation coffee']],
  ["Toby's Estate", ["toby's estate", 'tobys estate']],
  ['Vittoria', ['vittoria']],
  ['Lavazza', ['lavazza']],
  ["Aunty Peg's", ["aunty peg"]],
  ['Bureaux', ['bureaux']],
  ['Monk Bodhi', ['monk bodhi']],
  ['Rebellion', ['rebellion coffee']],
  ['Pablo & Rusty\'s', ['pablo & rusty', 'pablo and rusty']],
  ['Will & Co', ['will & co', 'will and co']],
  ['Everyday Coffee', ['everyday coffee']],
  ['Acoffee', ['acoffee', 'a.coffee']],
  ['Wide Open Road', ['wide open road']],
  ['Atomica', ['atomica']],
  ['Mocopan', ['mocopan']],
  ['Grinders', ['grinders']],
  ['Bench', ['bench coffee']],
  ['Coffee Anthology', ['coffee anthology']],
  ['Black Bag', ['black bag']],
];

const CONTEXT = /(coffee|beans?|roast|brew|espresso|latte|flat white|cappuccino)/;

const loadProgress = () => { try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); } catch { return {}; } };
const placeIdOf = (c) => (c.googleMapsUrl || '').match(/query_place_id=([^&]+)/)?.[1] || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(placeId) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'reviews,editorialSummary,generativeSummary' },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const d = await res.json();
  const parts = [];
  if (d.editorialSummary?.text?.text) parts.push(d.editorialSummary.text.text);
  if (d.generativeSummary?.overview?.text) parts.push(d.generativeSummary.overview.text);
  for (const r of (d.reviews || [])) if (r.text?.text) parts.push(r.text.text);
  return parts;
}

// Returns best roaster name or null. Sentence-level: roaster + coffee context in same chunk.
function detectBrand(chunks) {
  const score = {};
  for (const chunk of chunks) {
    const lc = chunk.toLowerCase();
    if (!CONTEXT.test(lc)) continue;
    for (const [canon, pats] of ROASTERS) {
      if (pats.some((p) => lc.includes(p))) score[canon] = (score[canon] || 0) + 1;
    }
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : null;
}

// ── Merge clearly-duplicate brand values to one canonical name ──────────────
// Explicit aliases for odd cases; generic suffix-strip handles "X Coffee" → "X".
const BRAND_ALIASES = {
  'axil coffee': 'Axil', 'ona coffee': 'Ona', 'campos coffee': 'Campos',
  'commonfolk coffee': 'Commonfolk', 'st. ali': 'St Ali', 'stali': 'St Ali', 'st ali': 'St Ali',
  'coffee supreme': 'Supreme', 'supreme coffee': 'Supreme',
  'wood and co': 'Wood & Co', 'wood and co coffee': 'Wood & Co', 'wood & co coffee': 'Wood & Co',
  'cartel coffee beans': 'Cartel', 'cartel coffee': 'Cartel',
  'jamaica blue mountain': 'Jamaica Blue', 'genovese coffee': 'Genovese',
  'veneziano coffee roasters': 'Veneziano', 'code black coffee': 'Code Black',
  'industry beans coffee': 'Industry Beans', 'seven seeds coffee': 'Seven Seeds',
};
// canonical proper-casing for stripped names (lowercase → display)
const CANON = Object.fromEntries(ROASTERS.map(([c]) => [c.toLowerCase(), c]));

function canonBrand(b) {
  if (!b) return b;
  const raw = b.trim();
  const alias = BRAND_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  // strip a trailing "coffee"/"roasters"/"coffee beans"/"coffee roasters" suffix
  const stripped = raw.replace(/\s+(coffee\s+roasters?|coffee\s+beans?|coffee\s+co\.?|coffee|roasters?)$/i, '').trim();
  const cand = stripped.length >= 2 ? stripped : raw;
  return BRAND_ALIASES[cand.toLowerCase()] || CANON[cand.toLowerCase()] || cand;
}

function mergeBrands(cafes) {
  const changes = {};
  for (const c of cafes) {
    if (!c.coffeeBrand) continue;
    const canon = canonBrand(c.coffeeBrand);
    if (canon !== c.coffeeBrand) { changes[`${c.coffeeBrand} → ${canon}`] = (changes[`${c.coffeeBrand} → ${canon}`] || 0) + 1; c.coffeeBrand = canon; }
  }
  return changes;
}

async function run() {
  if (!KEY) { console.error('Missing GOOGLE_PLACES_KEY'); process.exit(1); }
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();
  const targets  = cafes.filter((c) => (!c.coffeeBrand || !c.coffeeBrand.trim())
    && placeIdOf(c) && progress[c.id] === undefined).slice(0, LIMIT);

  console.log(`Cafes to check for coffee brand: ${targets.length}`);
  let found = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 34).padEnd(34)}`);
    try {
      const brand = detectBrand(await fetchText(placeIdOf(cafe)));
      progress[cafe.id] = brand || null;
      if (brand) {
        cafes.find((c) => c.id === cafe.id).coffeeBrand = brand;
        found++;
        process.stdout.write(` ☕ ${brand}`);
      } else process.stdout.write(' · none');
    } catch (err) {
      progress[cafe.id] = null;
      process.stdout.write(` skip: ${err.message.slice(0, 30)}`);
    }
    process.stdout.write('\n');
    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${found} brands found]`);
    }
    await sleep(DELAY_MS);
  }
  // Auto-merge clearly-duplicate brand variants across ALL cafes
  const changes = mergeBrands(cafes);

  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. ${found} coffee brands added from reviews.`);
  const mergeKeys = Object.keys(changes);
  console.log(`Merged ${mergeKeys.length} variant(s):`);
  mergeKeys.forEach((k) => console.log('  ', k, `(${changes[k]})`));
  const total = cafes.filter((c) => c.coffeeBrand && c.coffeeBrand.trim()).length;
  console.log(`Total cafes with a coffee brand now: ${total}`);
}

run().catch(console.error);
