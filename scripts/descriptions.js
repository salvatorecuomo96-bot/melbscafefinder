/**
 * descriptions.js  —  Google facts, rewritten by Claude into original text
 * ----------------------------------------------------------------------------
 * For each cafe:
 *   1. Fetch Google's AI/editorial summary via Places API (New).
 *   2. Have Claude (Haiku) REWRITE it into one original sentence — same facts,
 *      completely different wording → not a copy, no attribution needed, free
 *      to store.
 *   3. If Google has no summary, Claude writes one from the cafe's photos +
 *      details instead (so every cafe still gets a description).
 *
 * Output is original text (descriptionSource: 'original').
 *
 * Run:  node scripts/descriptions.js
 *       DESC_LIMIT=10 node scripts/descriptions.js   (test 10)
 * ----------------------------------------------------------------------------
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/descriptions_progress.json');

const KEY      = process.env.GOOGLE_PLACES_KEY;
const MODEL    = 'claude-haiku-4-5';
const DELAY_MS = 130;
const LIMIT    = parseInt(process.env.DESC_LIMIT || '0', 10) || Infinity;

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You write one-sentence cafe descriptions for a Melbourne cafe-finder app.
- Output EXACTLY one sentence, ~12–22 words.
- If given a source blurb, convey the same facts in COMPLETELY ORIGINAL wording — never reuse its distinctive phrasing.
- If given only photos/details, describe what's actually shown — never invent menu items, prices, or history.
- Factual and warm. No emojis. Avoid clichés ("hidden gem", "nestled", "whether you're", "must-visit").
- Don't start with the cafe's name. Output only the sentence.`;

const loadProgress = () => { try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); } catch { return {}; } };
const placeIdOf = (c) => (c.googleMapsUrl || '').match(/query_place_id=([^&]+)/)?.[1] || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function smallUrl(u) {
  if (u.includes('res.cloudinary.com') && u.includes('/upload/')) return u.replace('/upload/', '/upload/w_400,c_limit/');
  if (u.includes('maps.googleapis.com')) return u.replace(/maxwidth=\d+/, 'maxwidth=400');
  return u;
}

async function googleSummary(placeId) {
  if (!placeId) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'generativeSummary,editorialSummary' },
  });
  if (!res.ok) return null;
  const d = await res.json();
  const g = d.generativeSummary;
  return (g?.overview?.text || g?.description?.text)
      || (d.editorialSummary?.text?.text || d.editorialSummary?.text)
      || null;
}

async function rewriteFromText(cafe, summary) {
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 80,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content:
      `Cafe: ${cafe.name}, ${cafe.suburb}.\nSource blurb to rewrite in original words:\n"${summary}"` }],
  });
  return res.content.find((b) => b.type === 'text')?.text?.trim() || null;
}

async function writeFromPhotos(cafe) {
  const content = [];
  for (const u of (cafe.images || []).slice(0, 2)) content.push({ type: 'image', source: { type: 'url', url: smallUrl(u) } });
  const meta = [`${cafe.name}, ${cafe.suburb}`, cafe.coffeeBrand && `coffee by ${cafe.coffeeBrand}`, cafe.rating && `rated ${cafe.rating}`].filter(Boolean).join('; ');
  content.push({ type: 'text', text: `${meta}.\nWrite the one-sentence description from the photos and details.` });
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 80,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });
  return res.content.find((b) => b.type === 'text')?.text?.trim() || null;
}

async function run() {
  if (!KEY) { console.error('Missing GOOGLE_PLACES_KEY'); process.exit(1); }
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();
  const targets  = cafes.filter((c) => !c.shortDescription && progress[c.id] === undefined).slice(0, LIMIT);
  console.log(`Cafes to describe: ${targets.length}${LIMIT !== Infinity ? ` (TEST ${LIMIT})` : ''}`);

  let g = 0, p = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 32).padEnd(32)}`);
    try {
      const summary = await googleSummary(placeIdOf(cafe));
      const desc = summary ? await rewriteFromText(cafe, summary) : await writeFromPhotos(cafe);
      progress[cafe.id] = desc ? 1 : 0;
      if (desc) {
        const t = cafes.find((c) => c.id === cafe.id);
        t.shortDescription = desc;
        t.descriptionSource = 'original';
        summary ? g++ : p++;
        process.stdout.write(` ${summary ? '✎' : '◷'} ${desc.slice(0, 52)}…`);
      } else process.stdout.write(' · none');
    } catch (err) {
      progress[cafe.id] = null;
      process.stdout.write(` skip: ${err.message.slice(0, 40)}`);
    }
    process.stdout.write('\n');
    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${g} from Google, ${p} from photos]`);
    }
    await sleep(DELAY_MS);
  }
  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. ${g} rewritten from Google, ${p} written from photos.`);
}

run().catch(console.error);
