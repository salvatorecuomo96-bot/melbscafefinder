#!/usr/bin/env node
/**
 * scripts/review_intel.js
 *
 * Review Intelligence Engine — uses Claude Haiku to extract structured
 * cafe attributes from Google review text. Much smarter than regex:
 * understands context, negation, implied meaning, vibe, etc.
 *
 * Cost: ~$2 total for all 2800 cafes (Haiku is very cheap).
 *
 * Usage: node scripts/review_intel.js
 * Output: data/review_intel.json
 * Then:   node scripts/publish_enriched.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error('❌  ANTHROPIC_API_KEY not found in .env');
  process.exit(1);
}

const CAFES_FILE    = path.join(ROOT, 'public', 'cafes.json');
const PROGRESS_FILE = path.join(ROOT, 'data', 'enrich_progress.json');
const OUTPUT_FILE   = path.join(ROOT, 'data', 'review_intel.json');

const MODEL   = 'claude-haiku-4-5-20251001';
const RATE_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Claude call ───────────────────────────────────────────────────────────────

async function extractAttributes(cafeName, reviews) {
  const reviewText = reviews
    .map((r, i) => `Review ${i + 1} (${r.rating}★): "${r.text}"`)
    .join('\n\n');

  const body = {
    model: MODEL,
    max_tokens: 300,
    system: `You are a structured data extractor for a cafe discovery app. Given cafe reviews, extract attributes as a JSON object. Be conservative — only mark true/false when clearly evidenced by the reviews. Use null when uncertain.`,
    messages: [{
      role: 'user',
      content: `Cafe: ${cafeName}

${reviewText}

Return ONLY a JSON object with these fields:
{
  "hasWifi": null,
  "hasPowerOutlets": null,
  "outdoorSeating": null,
  "dogFriendly": null,
  "laptopFriendly": null,
  "quiet": null,
  "goodForDates": null,
  "goodForGroups": null,
  "goodForWork": null,
  "goodForSolo": null,
  "specialtyCoffee": null,
  "matcha": null,
  "pastries": null,
  "hasDecaf": null,
  "vibe": null,
  "coffeeBrand": null,
  "chaiType": null
}

Rules:
- Boolean fields: true, false, or null (null = not mentioned)
- "quiet": false if reviews mention noise/loud/busy, true if quiet/calm/peaceful
- "vibe": one word only — cozy, modern, industrial, rustic, minimal, bright, artsy, traditional, or null
- "coffeeBrand": only if a specific roaster is named (e.g. "Seven Seeds", "Market Lane", "St Ali", "Ona", "Axil", "Proud Mary", "Dukes", "Industry Beans"), otherwise null
- "chaiType": "newspaper" if chai is made from a tea bag/masala blend, "leaf" if loose leaf chai, "powder" if powder-based chai (e.g. Arkadia), null if not mentioned
- "hasPowerOutlets": true if reviews mention power points, outlets, charging, plugs
Return raw JSON only, no markdown.`
    }]
  };

  await sleep(RATE_MS);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text?.trim();
  if (!text) throw new Error('Empty response');

  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from response if it has extra text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Invalid JSON response');
  }
}

// ── Load data ─────────────────────────────────────────────────────────────────

const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));

if (!fs.existsSync(PROGRESS_FILE)) {
  console.error('❌  data/enrich_progress.json not found. Run enrich_google.js first.');
  process.exit(1);
}

const googleProgress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));

// Build review map: cafeId → reviews array
const reviewMap = {};
for (const [id, e] of Object.entries(googleProgress.enriched || {})) {
  if (e.found && e.reviews?.length) {
    reviewMap[id] = e.reviews;
  }
}

// Also check newCafes
for (const nc of (googleProgress.newCafes || [])) {
  if (nc.reviews?.length && nc._googlePlaceId) {
    // match by place ID — look up in cafes
    const cafe = cafes.find((c) => c._googlePlaceId === nc._googlePlaceId);
    if (cafe) reviewMap[cafe.id] = nc.reviews;
  }
}

const cafesWithReviews = cafes.filter((c) => reviewMap[c.id]?.length);
console.log(`▶  ${cafes.length} cafes, ${cafesWithReviews.length} have reviews to analyze\n`);

// Load progress
let output = {};
if (fs.existsSync(OUTPUT_FILE)) {
  output = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  console.log(`↩  Resuming — ${Object.keys(output).length} already analyzed\n`);
}

const save = () => fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));

// ── Main loop ─────────────────────────────────────────────────────────────────

let n = 0;
let cost = 0;

for (const cafe of cafesWithReviews) {
  n++;
  if (output[cafe.id] !== undefined) continue;

  const reviews = reviewMap[cafe.id];
  process.stdout.write(`[${n}/${cafesWithReviews.length}] ${cafe.name}… `);

  try {
    const attrs = await extractAttributes(cafe.name, reviews);
    output[cafe.id] = attrs;

    // Rough cost estimate: ~800 tokens per cafe × $0.80/M
    cost += 0.00064;

    const hits = Object.entries(attrs)
      .filter(([k, v]) => v !== null && v !== false && k !== 'vibe' && k !== 'coffeeBrand')
      .map(([k]) => k);
    const extras = [attrs.vibe, attrs.coffeeBrand].filter(Boolean);
    const summary = [...hits, ...extras].join(', ') || '–';
    process.stdout.write(`✓ ${summary}\n`);
  } catch (err) {
    process.stdout.write(`error: ${err.message}\n`);
    output[cafe.id] = null;
  }

  if (n % 50 === 0) {
    save();
    console.log(`  💰  Estimated cost so far: $${cost.toFixed(2)}`);
  }
}

save();

const analyzed = Object.values(output).filter((v) => v !== null).length;
const withWifi   = Object.values(output).filter((v) => v?.hasWifi).length;
const withVibe   = Object.values(output).filter((v) => v?.vibe).length;
const withBrand  = Object.values(output).filter((v) => v?.coffeeBrand).length;

console.log(`\n✅  Done!`);
console.log(`   Analyzed      : ${analyzed} / ${cafesWithReviews.length} cafes`);
console.log(`   WiFi detected : ${withWifi}`);
console.log(`   Vibe detected : ${withVibe}`);
console.log(`   Coffee brand  : ${withBrand}`);
console.log(`   💰  Est. total cost: $${cost.toFixed(2)}`);
console.log(`\n👉  Run: node scripts/publish_enriched.js`);
