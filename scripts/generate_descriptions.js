/**
 * generate_descriptions.js  —  Claude-written cafe descriptions (fallback)
 * ----------------------------------------------------------------------------
 * Fills cafe.shortDescription for any cafe that still has none (e.g. cafes
 * Google had no generativeSummary for). Grounds Claude (Haiku) in the cafe's
 * actual photos + metadata so it describes what's real, not invented.
 *
 * Run AFTER fetch_descriptions.js so Google's AI summaries take priority.
 *
 * Run:  node scripts/generate_descriptions.js
 *       DESC_LIMIT=10 node scripts/generate_descriptions.js   (test 10)
 * ----------------------------------------------------------------------------
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/gen_descriptions_progress.json');

const MODEL    = 'claude-haiku-4-5';
const DELAY_MS = 120;
const LIMIT    = parseInt(process.env.DESC_LIMIT || '0', 10) || Infinity;

const anthropic = new Anthropic(); // ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `You write one-sentence descriptions of Melbourne cafes for a cafe-finder app.
Use ONLY the photos and details given. Rules:
- Exactly one sentence, roughly 12–22 words.
- Warm and specific, but factual — describe only what the photos/details actually show.
- NEVER invent menu items, prices, history, opening hours, or claims you can't see.
- No emojis. Avoid clichés: "hidden gem", "nestled", "whether you're", "a must-visit".
- Don't start with the cafe's name. Output only the sentence, nothing else.`;

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// shrink image URLs so the vision call stays cheap
function smallUrl(u) {
  if (u.includes('res.cloudinary.com') && u.includes('/upload/'))
    return u.replace('/upload/', '/upload/w_400,c_limit/');
  if (u.includes('maps.googleapis.com')) return u.replace(/maxwidth=\d+/, 'maxwidth=400');
  return u;
}

function metaLine(c) {
  const bits = [`${c.name}, ${c.suburb}`];
  if (c.coffeeBrand) bits.push(`coffee by ${c.coffeeBrand}`);
  if (c.rating) bits.push(`rated ${c.rating}${c.reviewCount ? ` (${c.reviewCount} reviews)` : ''}`);
  if (c.vibe) bits.push(`${c.vibe} vibe`);
  if (c.specialtyCoffee) bits.push('specialty coffee');
  return bits.join('; ');
}

async function describe(cafe) {
  const imgs = (cafe.images || []).slice(0, 2);
  const content = [];
  for (const u of imgs) content.push({ type: 'image', source: { type: 'url', url: smallUrl(u) } });
  content.push({ type: 'text', text: `${metaLine(cafe)}.\nWrite the one-sentence description.` });

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 80,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });
  const text = res.content.find((b) => b.type === 'text')?.text?.trim();
  return text || null;
}

async function run() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes
    .filter((c) => !c.shortDescription && progress[c.id] === undefined)
    .slice(0, LIMIT);

  console.log(`Cafes to describe: ${targets.length}${LIMIT !== Infinity ? ` (TEST limit ${LIMIT})` : ''}`);

  let done = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 32).padEnd(32)}`);

    try {
      const desc = await describe(cafe);
      progress[cafe.id] = desc ? 1 : 0;
      if (desc) {
        cafes.find((c) => c.id === cafe.id).shortDescription = desc;
        done++;
        process.stdout.write(` ✓ ${desc.slice(0, 60)}…`);
      } else {
        process.stdout.write(' · none');
      }
    } catch (err) {
      progress[cafe.id] = null;
      process.stdout.write(` skip: ${err.message.slice(0, 40)}`);
    }
    process.stdout.write('\n');

    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${done} written so far]`);
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. ${done} descriptions written.`);
}

run().catch(console.error);
