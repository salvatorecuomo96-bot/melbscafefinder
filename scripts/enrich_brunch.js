// Adds servesBrunch boolean to every cafe in public/cafes.json.
// Pass 1: rule-based (free) — covers ~400 obvious cases.
// Pass 2: Anthropic claude-haiku-4-5 for remaining ~2000 ambiguous cafes.
// Estimated cost: < $0.10 total (name + attributes only, no review text).
// Run: node scripts/enrich_brunch.js
// Safe to re-run — skips cafes already processed.

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '../.env') });

const CAFES_PATH    = join(__dirname, '../public/cafes.json');
const PROGRESS_PATH = join(__dirname, '../data/brunch_progress.json');
const BATCH_SIZE    = 10;
const DELAY_MS      = 200;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function loadProgress() {
  try { return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')); }
  catch { return {}; }
}

function saveProgress(map) {
  mkdirSync(dirname(PROGRESS_PATH), { recursive: true });
  writeFileSync(PROGRESS_PATH, JSON.stringify(map, null, 2));
}

// Rule-based: returns true/false/null (null = needs AI)
function ruleBasedBrunch(cafe) {
  const name = cafe.name?.toLowerCase() ?? '';

  // Strong positive signals
  if (cafe.breakfastAllDay === true) return true;
  if (/\bbrunch\b/.test(name)) return true;
  if (/\bbreakfast\b/.test(name)) return true;

  // Strong negative signals — cafes that clearly don't do food
  if (/\bkiosk\b/.test(name)) return false;
  if (/\bespresso bar\b/.test(name) && !cafe.breakfastAllDay) return false;

  return null; // needs AI
}

async function askAI(cafes) {
  const lines = cafes.map((c, i) =>
    `${i + 1}. "${c.name}" (${c.suburb}) — vibe: ${c.vibe ?? 'unknown'}, brunchQuality: ${c.brunchQuality ?? 'unknown'}, breakfastAllDay: ${c.breakfastAllDay ?? 'unknown'}, priceLevel: ${c.priceLevel ?? '?'}`
  ).join('\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `For each Melbourne cafe below, answer Y or N: does it likely serve a brunch menu (eggs, toast, pancakes, poached eggs etc)?

${lines}

Reply with ONLY a comma-separated list of Y or N answers in order, e.g.: Y,N,Y,Y,N`
    }]
  });

  const raw = message.content[0].text.trim();
  const answers = raw.split(',').map(s => s.trim().toUpperCase() === 'Y');
  return answers;
}

async function main() {
  const cafes    = JSON.parse(readFileSync(CAFES_PATH, 'utf8'));
  const progress = loadProgress(); // { cafeId: true/false }

  // Pass 1: rule-based
  let ruleYes = 0, ruleNo = 0, needsAI = [];
  for (const cafe of cafes) {
    if (cafe.id in progress) continue;
    const result = ruleBasedBrunch(cafe);
    if (result !== null) {
      progress[cafe.id] = result;
      result ? ruleYes++ : ruleNo++;
    } else {
      needsAI.push(cafe);
    }
  }
  saveProgress(progress);
  console.log(`Rule-based: ${ruleYes} yes, ${ruleNo} no. Need AI: ${needsAI.length}`);

  // Pass 2: AI for ambiguous cafes
  let aiDone = 0;
  for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
    const batch = needsAI.slice(i, i + BATCH_SIZE);
    try {
      const answers = await askAI(batch);
      batch.forEach((cafe, j) => {
        progress[cafe.id] = answers[j] ?? false;
      });
      aiDone += batch.length;
    } catch (err) {
      console.error(`\n  Batch failed at ${i}: ${err.message}`);
      // mark as false so we don't block progress
      batch.forEach(cafe => { progress[cafe.id] = false; });
    }
    saveProgress(progress);
    const total = ruleYes + ruleNo + aiDone;
    process.stdout.write(`\r  AI progress: ${aiDone}/${needsAI.length} (total ${total}/${cafes.length})   `);
    if (i + BATCH_SIZE < needsAI.length) await sleep(DELAY_MS);
  }

  console.log('\nWriting servesBrunch to cafes.json...');
  let yes = 0, no = 0;
  for (const cafe of cafes) {
    const val = progress[cafe.id];
    cafe.servesBrunch = val === true;
    val ? yes++ : no++;
  }

  writeFileSync(CAFES_PATH, JSON.stringify(cafes));
  console.log(`Done. servesBrunch: ${yes} yes, ${no} no.`);
  console.log('Next: add servesBrunch to FilterDrawer and MobileExplore brunch section.');
}

main().catch(err => { console.error(err); process.exit(1); });
