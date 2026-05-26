// Free script — checks website health for all cafes with a website URL.
// Flags potential closures: 404s, domain parking pages, timeouts.
// Outputs data/closed_suspects.json for manual review.
// Cost: $0. Runtime: ~30-40 mins for ~1678 cafes.
// Usage: node scripts/check_closed_cafes.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_PATH = path.join(__dirname, '../public/cafes.json');
const OUTPUT_PATH = path.join(__dirname, '../data/closed_suspects.json');
const PROGRESS_PATH = path.join(__dirname, '../data/closed_check_progress.json');

const PARKING_PATTERNS = [
  'domain for sale', 'this domain', 'buy this domain', 'parked domain',
  'godaddy', 'namecheap', 'domain expired', 'under construction',
  'coming soon', 'site not found', 'website coming soon',
];

const CONCURRENCY = 10;
const TIMEOUT_MS = 8000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CafeChecker/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (res.status === 404 || res.status === 410) return { status: res.status, reason: 'not_found' };
    if (res.status >= 500) return { status: res.status, reason: 'server_error' };

    const text = (await res.text()).toLowerCase().slice(0, 3000);
    const parked = PARKING_PATTERNS.find(p => text.includes(p));
    if (parked) return { status: res.status, reason: 'parked', match: parked };

    return { status: res.status, reason: 'ok' };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') return { status: 0, reason: 'timeout' };
    return { status: 0, reason: 'error', error: err.message };
  }
}

async function runBatch(batch, progress, suspects) {
  await Promise.all(batch.map(async (cafe) => {
    if (progress[cafe.id]) return;
    const result = await checkUrl(cafe.website);
    progress[cafe.id] = result;

    if (result.reason !== 'ok') {
      const flag = { id: cafe.id, name: cafe.name, suburb: cafe.suburb, website: cafe.website, ...result };
      suspects.push(flag);
      console.log(`  SUSPECT  ${cafe.name.padEnd(35)} | ${result.reason} (${result.status})`);
    }
  }));
}

async function main() {
  const cafes = JSON.parse(fs.readFileSync(CAFES_PATH, 'utf8'));
  const withWebsite = cafes.filter(c => c.website);
  console.log(`Checking ${withWebsite.length} cafe websites...`);

  const progress = fs.existsSync(PROGRESS_PATH)
    ? JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'))
    : {};

  const existing = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'))
    : [];

  const suspects = [...existing];
  const todo = withWebsite.filter(c => !progress[c.id]);
  console.log(`Remaining: ${todo.length} (${withWebsite.length - todo.length} already checked)`);

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    await runBatch(batch, progress, suspects);
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(suspects, null, 2));
    process.stdout.write(`\r  Progress: ${Math.min(i + CONCURRENCY, todo.length)}/${todo.length}`);
    await sleep(200);
  }

  console.log('\n\n--- Results ---');
  const byReason = {};
  for (const s of suspects) {
    byReason[s.reason] = (byReason[s.reason] || 0) + 1;
  }
  console.log('Suspects by reason:', byReason);
  console.log(`Total suspects: ${suspects.length} of ${withWebsite.length} cafes`);
  console.log(`Saved to ${OUTPUT_PATH}`);
  console.log('\nReview data/closed_suspects.json and manually remove any confirmed closures.');
}

main().catch(console.error);
