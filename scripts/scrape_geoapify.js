#!/usr/bin/env node
/**
 * scripts/scrape_geoapify.js
 *
 * Fetches all cafes in greater Melbourne from the Geoapify Places API.
 * Resumable: saves progress after each grid cell.
 * Deduplicates by place_id across the whole run.
 *
 * Usage:
 *   GEOAPIFY_KEY=your_key node scripts/scrape_geoapify.js
 *
 * Output:
 *   data/cafes_raw.json   — raw Geoapify features, ready for transform.js
 *   data/progress.json    — resume checkpoint (auto-deleted on clean finish)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'cafes_raw.json');

const API_KEY = process.env.GEOAPIFY_KEY;
if (!API_KEY) {
  console.error('❌  Missing API key.\n   Run: GEOAPIFY_KEY=your_key node scripts/scrape_geoapify.js');
  process.exit(1);
}

// Greater Melbourne bounding box
const BOUNDS = { minLat: -38.20, maxLat: -37.50, minLng: 144.55, maxLng: 145.60 };

// 0.04° ≈ 4.4km lat × 3.5km lng at Melbourne — well under the 500-result cap per cell
const CELL = 0.04;

// 1 req/sec = 3,600/hr — comfortably within the 3,000/day free tier
const RATE_MS = 1100;

// ── Build grid ──────────────────────────────────────────────────────────────

const grid = [];
for (let lat = BOUNDS.minLat; lat < BOUNDS.maxLat; lat = round(lat + CELL)) {
  for (let lng = BOUNDS.minLng; lng < BOUNDS.maxLng; lng = round(lng + CELL)) {
    grid.push({ minLat: lat, minLng: lng, maxLat: round(lat + CELL), maxLng: round(lng + CELL) });
  }
}

function round(n) { return Math.round(n * 1e6) / 1e6; }
function cellKey(c) { return `${c.minLat},${c.minLng}`; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Load or init progress ───────────────────────────────────────────────────

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let progress = { done: new Set(), places: {} };

if (fs.existsSync(PROGRESS_FILE)) {
  const saved = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  progress.done = new Set(saved.done);
  progress.places = saved.places;
  console.log(`▶  Resuming: ${progress.done.size}/${grid.length} cells done, ${Object.keys(progress.places).length} places so far`);
} else {
  console.log(`▶  Starting fresh: ${grid.length} grid cells over Greater Melbourne`);
}

function saveProgress() {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    done: [...progress.done],
    places: progress.places,
  }));
}

// ── Fetch one grid cell ─────────────────────────────────────────────────────

async function fetchCell(cell, attempt = 1) {
  const url = new URL('https://api.geoapify.com/v2/places');
  url.searchParams.set('categories', 'catering.cafe');
  url.searchParams.set('filter', `rect:${cell.minLng},${cell.minLat},${cell.maxLng},${cell.maxLat}`);
  url.searchParams.set('limit', '500');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('apiKey', API_KEY);

  const res = await fetch(url.toString());

  if (res.status === 429) {
    const wait = attempt * 5000;
    process.stdout.write(`\n  ⏱  Rate limited — waiting ${wait / 1000}s`);
    await sleep(wait);
    return fetchCell(cell, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.features || [];
}

// ── Main loop ───────────────────────────────────────────────────────────────

async function run() {
  const todo = grid.filter(c => !progress.done.has(cellKey(c)));
  const startCount = Object.keys(progress.places).length;

  console.log(`⏳  ${todo.length} cells remaining (${grid.length - todo.length} already done)\n`);

  for (let i = 0; i < todo.length; i++) {
    const cell = todo[i];
    const key = cellKey(cell);

    try {
      const features = await fetchCell(cell);
      let newCount = 0;

      for (const f of features) {
        const id = f.properties?.place_id;
        if (id && !progress.places[id]) {
          progress.places[id] = f;
          newCount++;
        }
      }

      progress.done.add(key);
      saveProgress();

      const total = Object.keys(progress.places).length;
      const pct = (((progress.done.size) / grid.length) * 100).toFixed(1);
      process.stdout.write(`\r  [${pct}%] ${progress.done.size}/${grid.length} cells | +${newCount} | ${total} total cafes   `);

    } catch (err) {
      console.error(`\n⚠️  Cell ${key} failed: ${err.message} — skipping, will retry next run`);
    }

    if (i < todo.length - 1) await sleep(RATE_MS);
  }

  const total = Object.keys(progress.places).length;
  console.log(`\n\n✅  Done! ${total} unique cafes (${total - startCount} new this run)`);

  // Write final output
  const features = Object.values(progress.places);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    count: features.length,
    features,
  }, null, 2));

  console.log(`\n📄  Saved → data/cafes_raw.json`);
  console.log(`\n👉  Next: node scripts/transform.js`);

  // Clean up progress checkpoint
  if (progress.done.size === grid.length) {
    fs.unlinkSync(PROGRESS_FILE);
    console.log(`🧹  Cleaned up progress.json`);
  }
}

run().catch(err => {
  console.error('\n❌  Fatal:', err.message);
  process.exit(1);
});
