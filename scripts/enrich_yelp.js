#!/usr/bin/env node
/**
 * scripts/enrich_yelp.js
 *
 * Matches each cafe to Yelp and pulls structured attributes:
 * outdoor_seating, wifi, dogs_allowed, noise_level, good_for_groups, etc.
 *
 * Limit: 500 calls/day on free tier (resets midnight Pacific Time).
 * This script is resumable — run it daily until all cafes are covered.
 *
 * Setup:
 *   1. Go to yelp.com/fusion → Create App → copy API key
 *   2. Add YELP_API_KEY=xxx to your .env file
 *   3. node scripts/enrich_yelp.js
 *
 * Output: data/yelp_attrs.json
 * Then run: node scripts/publish_enriched.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const KEY = process.env.YELP_API_KEY;
if (!KEY) {
  console.error('❌  YELP_API_KEY not found in .env');
  console.error('   → yelp.com/fusion → Create App → add YELP_API_KEY=xxx to .env');
  process.exit(1);
}

const CAFES_FILE    = path.join(ROOT, 'public', 'cafes.json');
const PROGRESS_FILE = path.join(ROOT, 'data', 'yelp_attrs.json');

const RATE_MS   = 300;
const MAX_CALLS = 490; // stay under 500/day limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function yelpGet(path) {
  await sleep(RATE_MS);
  const res = await fetch(`https://api.yelp.com/v3${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) return null;
  return res.json();
}

async function findYelp(name, lat, lng) {
  const q = encodeURIComponent(name);
  const data = await yelpGet(`/businesses/search?term=${q}&latitude=${lat}&longitude=${lng}&limit=3&radius=500`);
  if (!data?.businesses?.length) return null;
  // Pick closest match by name similarity
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(name);
  const match = data.businesses.find((b) => norm(b.name).includes(target) || target.includes(norm(b.name)));
  return match || data.businesses[0];
}

async function getYelpDetails(id) {
  return yelpGet(`/businesses/${id}`);
}

function parseAttributes(biz) {
  if (!biz) return {};
  const a = biz.attributes || {};
  const cats = (biz.categories || []).map((c) => c.alias);

  const wifiMap = { free: true, paid: true, no: false };
  const noiseMap = { quiet: true, average: null, loud: false, very_loud: false };

  return {
    hasWifi:        a.wifi_info in wifiMap ? wifiMap[a.wifi_info] : null,
    dogFriendly:    a.dogs_allowed ?? null,
    outdoorSeating: a.outdoor_seating ?? null,
    quiet:          a.noise_level in noiseMap ? noiseMap[a.noise_level] : null,
    goodForGroups:  a.restaurants_good_for_groups ?? null,
    goodForDates:   cats.includes('romantic') ? true : null,
    laptopFriendly: a.wifi_info === 'free' ? true : null,
    yelpRating:     biz.rating ?? null,
    yelpReviewCount: biz.review_count ?? null,
    yelpCategories: cats,
  };
}

// ── Load ──────────────────────────────────────────────────────────────────────

const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
console.log(`▶  ${cafes.length} cafes to process`);

let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  const done = Object.keys(progress).length;
  console.log(`↩  Resuming — ${done} already done, ${cafes.length - done} remaining`);
}

const save = () => fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

// ── Main ──────────────────────────────────────────────────────────────────────

let calls = 0;
let n = 0;

for (const cafe of cafes) {
  n++;
  if (progress[cafe.id] !== undefined) continue;
  if (calls >= MAX_CALLS) {
    console.log(`\n⏸  Hit daily limit (${MAX_CALLS} calls). Re-run tomorrow to continue.`);
    console.log(`   ${Object.keys(progress).length} / ${cafes.length} done so far.`);
    break;
  }

  process.stdout.write(`[${n}/${cafes.length}] ${cafe.name}… `);

  try {
    const biz = await findYelp(cafe.name, cafe.latitude, cafe.longitude);
    calls++;

    if (!biz) {
      process.stdout.write('✗ not found on Yelp\n');
      progress[cafe.id] = { found: false };
    } else {
      const details = await getYelpDetails(biz.id);
      calls++;
      const attrs = parseAttributes(details || biz);
      progress[cafe.id] = { found: true, ...attrs };
      const hits = Object.entries(attrs)
        .filter(([k, v]) => !k.startsWith('yelp') && v === true)
        .map(([k]) => k).join(', ') || '–';
      process.stdout.write(`✓ ${hits}\n`);
    }
  } catch (err) {
    if (err.message === 'RATE_LIMITED') {
      console.log('\n⚠️  Rate limited by Yelp — stopping for today.');
      break;
    }
    process.stdout.write(`error: ${err.message}\n`);
    progress[cafe.id] = { found: false };
  }

  if (n % 20 === 0) save();
}

save();
const found = Object.values(progress).filter((p) => p.found).length;
const total = Object.keys(progress).length;
console.log(`\n✅  Session done — ${found}/${total} matched on Yelp`);
console.log(`   Calls used today: ${calls}`);
console.log(`\n👉  Run: node scripts/publish_enriched.js`);
