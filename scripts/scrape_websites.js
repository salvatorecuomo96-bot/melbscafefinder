#!/usr/bin/env node
/**
 * Fetches cafe websites and extracts only coffee-brand / roaster signals.
 *
 * Output: data/website_attrs.json
 * Run node scripts/publish_enriched.js afterwards to merge into public/cafes.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CAFES_FILE = path.join(ROOT, 'public', 'cafes.json');
const PROGRESS_FILE = path.join(ROOT, 'data', 'website_attrs.json');

const TIMEOUT_MS = 12000;
const RATE_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COFFEE_BRANDS = [
  ['single o coffee', 'Single O'], ['single o', 'Single O'],
  ['code black coffee', 'Code Black'], ['code black', 'Code Black'],
  ['five senses coffee', 'Five Senses'], ['five senses', 'Five Senses'], ['5 senses', 'Five Senses'],
  ['allpress espresso', 'Allpress'], ['allpress', 'Allpress'], ['all press', 'Allpress'],
  ['st ali', 'St Ali'], ['st. ali', 'St Ali'], ['saint ali', 'St Ali'],
  ['industry beans', 'Industry Beans'],
  ['axil coffee', 'Axil'], ['axil', 'Axil'],
  ['seven seeds', 'Seven Seeds'], ['7 seeds', 'Seven Seeds'],
  ['market lane coffee', 'Market Lane'], ['market lane', 'Market Lane'],
  ['veneziano coffee', 'Veneziano'], ['veneziano', 'Veneziano'],
  ['proud mary', 'Proud Mary'],
  ["duke's coffee", 'Dukes'], ['dukes coffee roasters', 'Dukes'], ['dukes coffee', 'Dukes'], ['dukes', 'Dukes'],
  ['rumble coffee', 'Rumble'], ['rumble', 'Rumble'],
  ['campos coffee', 'Campos'], ['campos', 'Campos'],
  ['ona coffee', 'Ona'], ['ona', 'Ona'],
  ['padre coffee', 'Padre'], ['padre', 'Padre'],
  ['sensory lab', 'Sensory Lab'],
  ['small batch coffee', 'Small Batch'], ['small batch', 'Small Batch'], ['batch brewing', 'Small Batch'],
  ['maker coffee', 'Maker'], ['maker', 'Maker'],
  ['assembly coffee', 'Assembly'], ['assembly', 'Assembly'],
  ['streat', 'STREAT'],
  ['patricia coffee', 'Patricia Coffee'],
  ['black box roasters', 'Black Box Roasters'],
  ['commonfolk coffee', 'Commonfolk Coffee'], ['commonfolk', 'Commonfolk Coffee'],
  ['mecca coffee', 'Mecca Coffee'],
];

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MelbourneCafeFinder/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
    return stripHtml(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryPages(base) {
  const parts = [];
  const home = await fetchText(base);
  if (!home) return null;
  parts.push(home);

  for (const slug of ['/menu', '/about', '/about-us', '/our-coffee', '/coffee']) {
    await sleep(RATE_MS);
    try {
      const text = await fetchText(new URL(slug, base).href);
      if (text) parts.push(text);
    } catch {
      // Invalid URL; ignore this page.
    }
  }

  return parts.join(' ');
}

function extract(text) {
  if (!text) return { fetched: false };
  const brand = COFFEE_BRANDS.find(([keyword]) => text.includes(keyword));
  return {
    fetched: true,
    coffeeBrand: brand ? brand[1] : null,
  };
}

const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
const withSite = cafes.filter((cafe) => cafe.website);
console.log(`${cafes.length} cafes total, ${withSite.length} with websites`);

let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  const done = Object.values(progress).filter((entry) => entry.fetched !== undefined).length;
  console.log(`Resuming — ${done} already done`);
}

const save = () => fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

let n = 0;
for (const cafe of withSite) {
  n += 1;
  if (progress[cafe.id] !== undefined) continue;

  process.stdout.write(`[${n}/${withSite.length}] ${cafe.name}… `);

  try {
    const text = await tryPages(cafe.website);
    const attrs = extract(text);
    progress[cafe.id] = attrs;
    process.stdout.write(attrs.fetched ? `${attrs.coffeeBrand || 'no brand found'}\n` : 'unreachable\n');
  } catch (err) {
    process.stdout.write(`error: ${err.message}\n`);
    progress[cafe.id] = { fetched: false, coffeeBrand: null };
  }

  await sleep(RATE_MS);
  if (n % 50 === 0) save();
}

save();
const fetched = Object.values(progress).filter((entry) => entry.fetched).length;
const withBrand = Object.values(progress).filter((entry) => entry.coffeeBrand).length;
console.log('Done');
console.log(`Websites fetched: ${fetched} / ${withSite.length}`);
console.log(`Coffee brands: ${withBrand}`);
console.log('Run: node scripts/publish_enriched.js');
