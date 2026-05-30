#!/usr/bin/env node
/**
 * scripts/scrape_websites.js
 *
 * Fetches each cafe's website and extracts attributes via keyword matching:
 * coffee brand, chai type, plant milks, decaf, matcha, wifi, dog friendly, etc.
 *
 * Usage:  node scripts/scrape_websites.js
 * Output: data/website_attrs.json  (resumable progress file)
 *
 * Run node scripts/publish_enriched.js afterwards to merge into public/cafes.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CAFES_FILE    = path.join(ROOT, 'public', 'cafes.json');
const PROGRESS_FILE = path.join(ROOT, 'data', 'website_attrs.json');

const TIMEOUT_MS = 12000;
const RATE_MS    = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CafeFinder/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null;
    const html = await res.text();
    return stripHtml(html);
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
      const url = new URL(slug, base).href;
      const text = await fetchText(url);
      if (text) parts.push(text);
    } catch { /* invalid URL */ }
  }

  return parts.join(' ');
}

// ── Keyword lists ─────────────────────────────────────────────────────────────

const COFFEE_BRANDS = [
  ['seven seeds', 'Seven Seeds'],
  ['st ali', 'St Ali'],
  ['ona coffee', 'Ona Coffee'],
  ['market lane', 'Market Lane'],
  ['axil coffee', 'Axil Coffee'],
  ['proud mary', 'Proud Mary'],
  ["duke's coffee", 'Dukes Coffee'],
  ['dukes coffee', 'Dukes Coffee'],
  ['veneziano', 'Veneziano'],
  ['patricia coffee', 'Patricia Coffee'],
  ['pillar of salt', 'Pillar of Salt'],
  ['industry beans', 'Industry Beans'],
  ['rumble coffee', 'Rumble Coffee'],
  ['allpress', 'Allpress'],
  ['all press', 'Allpress'],
  ['campos coffee', 'Campos Coffee'],
  ['five senses', 'Five Senses'],
  ['edition coffee', 'Edition Coffee'],
  ['code black', 'Code Black'],
  ['mecca coffee', 'Mecca Coffee'],
  ['sensory lab', 'Sensory Lab'],
  ['single o', 'Single O'],
  ['summit coffee', 'Summit Coffee'],
  ['bureau of meteorology coffee', 'Bureau of Meteorology Coffee'],
  ['commonfolk', 'Commonfolk Coffee'],
  ['uncle billy', "Uncle Billy's"],
  ['batch brewing', 'Batch Brewing'],
  ['yarraville coffee', 'Yarraville Coffee'],
  ['black box roasters', 'Black Box Roasters'],
];

const CHAI_KEYWORDS = {
  newspaper: ['newspaper chai', 'masala chai blend', 'spiced chai blend', 'chai tea bag', 'chai sachet'],
  leaf:      ['loose leaf chai', 'leaf chai', 'whole leaf chai', 'brewed chai', 'loose chai'],
  powder:    ['arkadia chai', 'powder chai', 'chai latte powder', 'sticky chai', 'maca chai powder'],
};

const PLANT_MILK_KEYWORDS = [
  ['oat milk', 'oat'],
  ['oat', 'oat'],
  ['soy milk', 'soy'],
  ['soy', 'soy'],
  ['almond milk', 'almond'],
  ['almond', 'almond'],
  ['macadamia', 'macadamia'],
  ['coconut milk', 'coconut'],
  ['cashew milk', 'cashew'],
  ['rice milk', 'rice'],
  ['hemp milk', 'hemp'],
  ['lactose free', 'lactose-free'],
];

function extract(text) {
  if (!text) return { fetched: false };

  // Coffee brand — look for "roasted by X", "we use X", "X coffee", etc.
  let coffeeBrand = null;
  for (const [kw, label] of COFFEE_BRANDS) {
    if (text.includes(kw)) { coffeeBrand = label; break; }
  }

  // Chai type
  let chaiType = null;
  for (const [type, kwds] of Object.entries(CHAI_KEYWORDS)) {
    if (kwds.some((kw) => text.includes(kw))) { chaiType = type; break; }
  }

  // Plant milks
  const milkSet = new Set();
  for (const [kw, label] of PLANT_MILK_KEYWORDS) {
    if (text.includes(kw)) milkSet.add(label);
  }
  const plantMilk = milkSet.size ? [...milkSet] : null;

  const has  = (re) => re.test(text) ? true : null;
  const bool = (yes, no) => yes.test(text) ? true : no.test(text) ? false : null;

  return {
    fetched: true,
    coffeeBrand,
    chaiType,
    plantMilk,
    hasDecaf:        has(/\bdecaf\b/),
    matcha:          has(/\bmatcha\b/),
    pastries:        has(/\bpastry\b|\bpastries\b|\bcroissant\b|\bdanish\b|\bscone\b|\bbrioche\b|\blamington\b|\bfriand\b/),
    specialtyCoffee: has(/\bspecialty coffee\b|\bsingle.?origin\b|\bfilter coffee\b|\baeropress\b|\bpour.?over\b|\bcold brew\b|\bchemex\b|\bv60\b/),
    hasWifi:         has(/\bfree wi.?fi\b|\bwi.?fi available\b|\bcomplimentary wi.?fi\b|\bwireless internet\b/),
    dogFriendly:     has(/\bdog.friendly\b|\bdogs welcome\b|\bdogs allowed\b|\bpet.friendly\b|\bfour.legged friends?\b/),
    outdoorSeating:  has(/\boutdoor seating\b|\boutdoor dining\b|\balfresco\b|\bgarden seating\b|\bcourtyard seating\b|\bterrace seating\b/),
    laptopFriendly:  has(/\blaptop friendly\b|\bwork.?friendly\b|\bco.?working\b/),
    goodForWork:     bool(/\bgreat for work\b|\bgood for work\b|\bwork.?friendly\b|\bco.?working\b/, /\bno laptop\b|\blaptops discouraged\b/),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
const withSite = cafes.filter((c) => c.website);
console.log(`▶  ${cafes.length} cafes total, ${withSite.length} with websites\n`);

let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  const done = Object.values(progress).filter((p) => p.fetched !== undefined).length;
  console.log(`↩  Resuming — ${done} already done\n`);
}

const save = () => fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

let n = 0;
for (const cafe of withSite) {
  n++;
  if (progress[cafe.id] !== undefined) continue;

  process.stdout.write(`[${n}/${withSite.length}] ${cafe.name}… `);

  try {
    const text = await tryPages(cafe.website);
    const attrs = extract(text);
    progress[cafe.id] = attrs;

    if (!attrs.fetched) {
      process.stdout.write('✗ unreachable\n');
    } else {
      const hits = Object.entries(attrs)
        .filter(([k, v]) => k !== 'fetched' && v != null && v !== false)
        .map(([k, v]) => typeof v === 'string' ? v : k)
        .join(', ') || '–';
      process.stdout.write(`✓ ${hits}\n`);
    }
  } catch (err) {
    process.stdout.write(`error: ${err.message}\n`);
    progress[cafe.id] = { fetched: false };
  }

  await sleep(RATE_MS);
  if (n % 50 === 0) save();
}

save();
const fetched = Object.values(progress).filter((p) => p.fetched).length;
const withBrand = Object.values(progress).filter((p) => p.coffeeBrand).length;
const withChai  = Object.values(progress).filter((p) => p.chaiType).length;
console.log(`\n✅  Done!`);
console.log(`   Websites fetched : ${fetched} / ${withSite.length}`);
console.log(`   Coffee brands    : ${withBrand}`);
console.log(`   Chai types       : ${withChai}`);
console.log(`\n👉  Run: node scripts/publish_enriched.js`);
