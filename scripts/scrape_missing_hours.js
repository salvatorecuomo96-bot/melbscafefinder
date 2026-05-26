// Free script — scrapes opening hours from cafe websites for cafes missing hours data.
// Looks for JSON-LD openingHoursSpecification and itemprop="openingHours" meta tags.
// Saves results to data/missing_hours_found.json, then patches public/cafes.json.
// Usage: node scripts/scrape_missing_hours.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_PATH = path.join(__dirname, '../public/cafes.json');
const FOUND_PATH = path.join(__dirname, '../data/missing_hours_found.json');
const MANUAL_PATH = path.join(__dirname, '../data/missing_hours.json');

const DAY_NAME_MAP = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu',
  friday: 'fri', saturday: 'sat', sunday: 'sun',
  'https://schema.org/monday': 'mon', 'https://schema.org/tuesday': 'tue',
  'https://schema.org/wednesday': 'wed', 'https://schema.org/thursday': 'thu',
  'https://schema.org/friday': 'fri', 'https://schema.org/saturday': 'sat',
  'https://schema.org/sunday': 'sun',
};

// "Mo" / "Mo-Fr" schema abbreviations
const ABBR_MAP = { Mo: 'mon', Tu: 'tue', We: 'wed', Th: 'thu', Fr: 'fri', Sa: 'sat', Su: 'sun' };
const ABBR_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function expandDayRange(spec) {
  // e.g. "Mo-Fr 07:00-17:00" or "Mo 07:00-17:00"
  const match = spec.match(/^([A-Z][a-z])(?:-([A-Z][a-z]))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!match) return null;
  const [, start, end, opens, closes] = match;
  const startIdx = ABBR_ORDER.indexOf(start);
  const endIdx = end ? ABBR_ORDER.indexOf(end) : startIdx;
  if (startIdx === -1) return null;
  const result = {};
  for (let i = startIdx; i <= endIdx; i++) {
    result[ABBR_MAP[ABBR_ORDER[i]]] = `${opens} - ${closes}`;
  }
  return result;
}

function parseJsonLdHours(specs) {
  if (!Array.isArray(specs)) specs = [specs];
  const result = {};
  for (const spec of specs) {
    const opens = spec.opens?.slice(0, 5);
    const closes = spec.closes?.slice(0, 5);
    if (!opens || !closes) continue;
    const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
    for (const d of days) {
      const key = DAY_NAME_MAP[(d || '').toLowerCase()];
      if (key) result[key] = `${opens} - ${closes}`;
    }
  }
  return Object.keys(result).length ? result : null;
}

function parseMetaHours(contents) {
  // contents = array of strings like "Mo-Fr 07:00-17:00"
  const result = {};
  for (const c of contents) {
    const expanded = expandDayRange(c.trim());
    if (expanded) Object.assign(result, expanded);
  }
  return Object.keys(result).length ? result : null;
}

function extractHours(html) {
  // 1. JSON-LD
  const ldMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
      for (const node of nodes) {
        if (node.openingHoursSpecification) {
          const hours = parseJsonLdHours(node.openingHoursSpecification);
          if (hours) return hours;
        }
        if (node.openingHours) {
          const specs = Array.isArray(node.openingHours) ? node.openingHours : [node.openingHours];
          const result = parseMetaHours(specs);
          if (result) return result;
        }
      }
    } catch {}
  }

  // 2. itemprop="openingHours"
  const metaMatches = [...html.matchAll(/<(?:meta|span|time)[^>]+itemprop="openingHours"[^>]*content="([^"]+)"/gi)];
  if (metaMatches.length) {
    const hours = parseMetaHours(metaMatches.map(m => m[1]));
    if (hours) return hours;
  }

  return null;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MelbCafeFinder/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const cafes = JSON.parse(fs.readFileSync(CAFES_PATH, 'utf8'));
  const targets = cafes.filter(c => (!c.openingHours || Object.keys(c.openingHours).length === 0) && c.website);
  console.log(`Scraping hours for ${targets.length} cafes with websites...`);

  const found = {};
  let patched = 0;

  for (const cafe of targets) {
    process.stdout.write(`  ${cafe.name.slice(0, 40).padEnd(40)} `);
    const html = await fetchHtml(cafe.website);
    if (!html) { console.log('✗ no response'); await sleep(300); continue; }

    const hours = extractHours(html);
    if (hours) {
      console.log(`✓ ${Object.keys(hours).length} days`);
      found[cafe.id] = hours;
      patched++;
    } else {
      console.log('~ not found');
    }
    await sleep(300);
  }

  // Patch cafes.json
  let updated = 0;
  for (const cafe of cafes) {
    if (found[cafe.id]) {
      cafe.openingHours = found[cafe.id];
      updated++;
    }
  }
  fs.writeFileSync(CAFES_PATH, JSON.stringify(cafes, null, 2));
  fs.writeFileSync(FOUND_PATH, JSON.stringify(found, null, 2));

  // Regenerate manual fill-in file with only remaining missing
  const stillMissing = cafes.filter(c => !c.openingHours || Object.keys(c.openingHours).length === 0);
  const manual = stillMissing.map(c => ({
    id: c.id, name: c.name, suburb: c.suburb, website: c.website || null,
    openingHours: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' },
  }));
  fs.writeFileSync(MANUAL_PATH, JSON.stringify(manual, null, 2));

  console.log(`\n--- Done ---`);
  console.log(`Scraped: ${patched}/${targets.length}`);
  console.log(`Still missing: ${stillMissing.length} — fill in data/missing_hours.json manually`);
}

main().catch(console.error);
