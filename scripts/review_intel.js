#!/usr/bin/env node
/**
 * scripts/review_intel.js
 *
 * Review Intelligence Engine — uses Claude Haiku to extract structured
 * cafe attributes from Google review text. Much smarter than regex:
 * understands context, negation, implied meaning, vibe, etc.
 *
 * Cost: ~$8-10 total for all 2800 cafes (larger prompt, still cheap).
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
const RATE_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Claude call ───────────────────────────────────────────────────────────────

async function extractAttributes(cafeName, reviews) {
  const reviewText = reviews
    .map((r, i) => `Review ${i + 1} (${r.rating}★): "${r.text}"`)
    .join('\n\n');

  const body = {
    model: MODEL,
    max_tokens: 700,
    system: `You are a structured data extractor for a cafe discovery app. Given cafe reviews, extract attributes as a JSON object. Be conservative — only populate fields when clearly evidenced. Use null when not mentioned or uncertain.`,
    messages: [{
      role: 'user',
      content: `Cafe: ${cafeName}

${reviewText}

Return ONLY a JSON object with these exact fields (no extras):
{
  "hasWifi": null,
  "wifiQuality": null,
  "hasPowerOutlets": null,
  "powerOutlets": null,
  "laptopFriendly": null,
  "goodForWork": null,
  "goodForDigitalNomads": null,
  "goodForLongStays": null,
  "workPressure": null,
  "noiseLevel": null,
  "naturalLight": null,
  "seatingComfort": null,
  "vibe": null,
  "energyLevel": null,
  "instagrammable": null,
  "music": null,
  "lightingMood": null,
  "communityFeel": null,
  "specialtyCoffee": null,
  "coffeeStyle": null,
  "filterCoffee": null,
  "baristaSkill": null,
  "consistency": null,
  "coffeeBrand": null,
  "hasDecaf": null,
  "matcha": null,
  "chaiType": null,
  "pastries": null,
  "brunchQuality": null,
  "veganOptions": null,
  "breakfastAllDay": null,
  "outdoorSeating": null,
  "dogFriendly": null,
  "pramFriendly": null,
  "goodForSolo": null,
  "goodForDates": null,
  "goodForGroups": null,
  "goodForMeetings": null,
  "kidFriendly": null,
  "serviceStyle": null,
  "hiddenGem": null,
  "locallyOwned": null,
  "sustainability": null
}

Rules — Boolean fields (true / false / null only): hasWifi, hasPowerOutlets, laptopFriendly, goodForWork, goodForDigitalNomads, goodForLongStays, filterCoffee, hasDecaf, matcha, pastries, outdoorSeating, dogFriendly, pramFriendly, goodForSolo, goodForDates, goodForGroups, goodForMeetings, kidFriendly, hiddenGem, locallyOwned, sustainability, baristaSkill, consistency, breakfastAllDay
Enum fields:
- "wifiQuality": "reliable" | "spotty" | "none" | null
- "powerOutlets": "plenty" | "some" | "few" | null
- "workPressure": "relaxed" | "medium" | "rushed" | null
- "noiseLevel": "quiet" | "moderate" | "lively" | "loud" | null
- "naturalLight": "bright" | "good" | "dim" | null
- "seatingComfort": "very comfortable" | "comfortable" | "basic" | null
- "vibe": "cozy" | "modern" | "industrial" | "warm" | "minimal" | "eclectic" | "rustic" | "artsy" | null
- "energyLevel": "calm" | "focused" | "social" | "bustling" | null
- "instagrammable": "very" | "nice" | "functional" | null
- "music": "none" | "background" | "noticeable" | "loud" | null
- "lightingMood": "bright" | "warm" | "dark" | null
- "communityFeel": "local" | "welcoming" | "neutral" | "touristy" | null
- "coffeeStyle": "third wave" | "specialty" | "classic" | "casual" | null
- "coffeeBrand": named roaster only (e.g. "Seven Seeds", "Market Lane", "St Ali", "Ona", "Axil", "Proud Mary", "Dukes", "Industry Beans", "Veneziano", "Patricia", "Mecca", "Sensory Lab", "Code Black", "Allpress", "Five Senses", "Campos", "Edition", "Rumble"), null otherwise
- "chaiType": "newspaper" if tea bag/masala blend, "leaf" if loose leaf, "powder" if powder-based (e.g. Arkadia), null if not mentioned
- "brunchQuality": "excellent" | "good" | "average" | null
- "veganOptions": "excellent" | "good" | "limited" | null
- "serviceStyle": "table service" | "counter" | "mixed" | null
Extra notes:
- "goodForDigitalNomads": true if explicitly mentions working all day, multiple hours, good setup for remote work
- "hiddenGem": true only if reviews call it hidden, tucked away, or underrated
- "locallyOwned": true only if reviews mention independent, family-owned, or local
- "breakfastAllDay": true if reviews mention all-day breakfast or ordering brekky in the afternoon
Return raw JSON only, no markdown, no explanation.`
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

    // ~1200 input tokens × $0.80/M + ~650 output tokens × $4/M ≈ $0.0036 per cafe
    cost += 0.0036;

    const hits = Object.entries(attrs)
      .filter(([k, v]) => v === true || (typeof v === 'string' && v !== null && k !== 'vibe' && k !== 'coffeeBrand' && k !== 'coffeeStyle'))
      .map(([k]) => k);
    const extras = [attrs.vibe, attrs.coffeeBrand, attrs.coffeeStyle].filter(Boolean);
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

const analyzed       = Object.values(output).filter((v) => v !== null).length;
const withWifi        = Object.values(output).filter((v) => v?.hasWifi).length;
const withVibe        = Object.values(output).filter((v) => v?.vibe).length;
const withBrand       = Object.values(output).filter((v) => v?.coffeeBrand).length;
const withNomad       = Object.values(output).filter((v) => v?.goodForDigitalNomads).length;
const withBreakfast   = Object.values(output).filter((v) => v?.breakfastAllDay).length;
const withHiddenGem   = Object.values(output).filter((v) => v?.hiddenGem).length;

console.log(`\n✅  Done!`);
console.log(`   Analyzed           : ${analyzed} / ${cafesWithReviews.length} cafes`);
console.log(`   WiFi detected      : ${withWifi}`);
console.log(`   Vibe detected      : ${withVibe}`);
console.log(`   Coffee brand       : ${withBrand}`);
console.log(`   Digital nomad      : ${withNomad}`);
console.log(`   All-day breakfast  : ${withBreakfast}`);
console.log(`   Hidden gems        : ${withHiddenGem}`);
console.log(`   💰  Est. total cost: $${cost.toFixed(2)} USD`);
console.log(`\n👉  Run: node scripts/publish_enriched.js`);
