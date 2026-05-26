// Re-queries Google Places API for the 64 cafes missing opening hours.
// Also checks business_status — removes any CLOSED_PERMANENTLY.
// Cost: ~$1.28 (64 cafes × $0.020)
// Usage: node scripts/fix_missing_hours.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_PATH = path.join(__dirname, '../public/cafes.json');
const PROGRESS_PATH = path.join(__dirname, '../data/fix_hours_progress.json');

const API_KEY = process.env.GOOGLE_PLACES_KEY;
if (!API_KEY) { console.error('GOOGLE_PLACES_KEY not set'); process.exit(1); }

const DAY_MAP = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

function formatTime(t) {
  return t.slice(0, 2) + ':' + t.slice(2);
}

function convertPeriods(periods) {
  const result = {};
  for (const p of periods) {
    const day = DAY_MAP[p.open.day];
    result[day] = p.close
      ? formatTime(p.open.time) + ' - ' + formatTime(p.close.time)
      : 'Open 24 hours';
  }
  return result;
}

function extractPlaceId(googleMapsUrl) {
  if (!googleMapsUrl) return null;
  const match = googleMapsUrl.match(/query_place_id=(ChIJ[^&]+)/);
  return match ? match[1] : null;
}

async function fetchPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=business_status,opening_hours&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`API error: ${data.status} — ${data.error_message || ''}`);
  return data.result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const cafes = JSON.parse(fs.readFileSync(CAFES_PATH, 'utf8'));
  const progress = fs.existsSync(PROGRESS_PATH)
    ? JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'))
    : {};

  const targets = cafes.filter(c => !c.openingHours || Object.keys(c.openingHours).length === 0);
  console.log(`Found ${targets.length} cafes missing opening hours`);

  const closed = [];
  let patched = 0;
  let failed = 0;

  for (const cafe of targets) {
    if (progress[cafe.id]?.done) {
      console.log(`  skip  ${cafe.name} (already done)`);
      continue;
    }

    const placeId = extractPlaceId(cafe.googleMapsUrl);
    if (!placeId) {
      console.log(`  skip  ${cafe.name} — no place ID in URL`);
      progress[cafe.id] = { done: true, skipped: true };
      continue;
    }

    try {
      const result = await fetchPlaceDetails(placeId);

      if (result.business_status === 'CLOSED_PERMANENTLY') {
        console.log(`  CLOSED  ${cafe.name} (${cafe.suburb})`);
        closed.push(cafe.id);
        progress[cafe.id] = { done: true, closed: true };
      } else {
        const hours = result.opening_hours?.periods
          ? convertPeriods(result.opening_hours.periods)
          : null;
        if (hours && Object.keys(hours).length > 0) {
          cafe.openingHours = hours;
          patched++;
          console.log(`  patched ${cafe.name} — ${Object.keys(hours).length} days`);
        } else {
          console.log(`  no hours returned for ${cafe.name}`);
        }
        progress[cafe.id] = { done: true };
      }
    } catch (err) {
      console.error(`  error  ${cafe.name}: ${err.message}`);
      failed++;
      progress[cafe.id] = { done: false, error: err.message };
    }

    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
    await sleep(120); // ~8 req/s
  }

  // Remove permanently closed cafes
  const kept = cafes.filter(c => !closed.includes(c.id));
  fs.writeFileSync(CAFES_PATH, JSON.stringify(kept, null, 2));

  console.log('\n--- Done ---');
  console.log(`Patched hours: ${patched}`);
  console.log(`Permanently closed (removed): ${closed.length}`, closed.length ? closed : '');
  console.log(`Errors: ${failed}`);
  console.log(`Total cafes: ${cafes.length} → ${kept.length}`);
}

main().catch(console.error);
