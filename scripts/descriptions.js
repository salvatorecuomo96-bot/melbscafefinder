/**
 * descriptions.js  —  keep Google-sourced descriptions, regenerate the Claude ones
 * ----------------------------------------------------------------------------
 * The first run didn't record each description's source, so this re-checks
 * Google per cafe:
 *   • Google HAS a summary  → keep the existing description, tag 'google'.
 *   • Google has NONE       → that one was Claude-written from photos; regenerate
 *                             it with a specialty-focused, menu-grounded prompt
 *                             and tag 'claude'.
 *
 * Google read uses your Google credit (not Anthropic). Claude regen is cheap.
 *
 * Run:  node scripts/descriptions.js
 *       DESC_LIMIT=15 node scripts/descriptions.js   (test 15)
 * To redo from scratch: delete data/descriptions_resource_progress.json first.
 * ----------------------------------------------------------------------------
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/descriptions_resource_progress.json');

const KEY      = process.env.GOOGLE_PLACES_KEY;
const MODEL    = 'claude-haiku-4-5';
const DELAY_MS = 130;
const LIMIT    = parseInt(process.env.DESC_LIMIT || '0', 10) || Infinity;

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You write one-sentence descriptions of Melbourne cafes for a cafe-finder app.
Your #1 job: say what this place is actually KNOWN FOR — its signature food or drink, or what makes it distinctive.
- Use the cafe's NAME and its MENU photo as your strongest clues. If the name or menu makes the specialty obvious (e.g. "Panineria" or a panini-heavy menu → panini; a bagel shop → bagels; a roaster → its coffee), SAY IT explicitly.
- Then add vibe/setting only if there's room and the photos show it.
- Exactly one sentence, ~12–22 words. Concrete and specific, never generic filler.
- Only state what the name, menu, or photos actually support — never invent prices, history, or dishes you can't see.
- No emojis. No clichés ("hidden gem", "nestled", "whether you're", "must-visit"). Don't start with the cafe's name.
- Output only the sentence.`;

const loadProgress = () => { try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); } catch { return {}; } };
const placeIdOf = (c) => (c.googleMapsUrl || '').match(/query_place_id=([^&]+)/)?.[1] || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sized(u, w) {
  if (u.includes('res.cloudinary.com') && u.includes('/upload/')) return u.replace('/upload/', `/upload/w_${w},c_limit/`);
  if (u.includes('maps.googleapis.com')) return u.replace(/maxwidth=\d+/, `maxwidth=${w}`);
  return u;
}

async function hasGoogleSummary(placeId) {
  if (!placeId) return false;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
      headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'generativeSummary,editorialSummary' },
    });
    if (!res.ok) return false;
    const d = await res.json();
    const g = d.generativeSummary;
    const text = (g?.overview?.text || g?.description?.text)
      || (d.editorialSummary?.text?.text || d.editorialSummary?.text);
    return !!(text && text.trim());
  } catch { return false; }
}

async function describe(cafe) {
  const content = [];
  if (cafe.images?.[0]) content.push({ type: 'image', source: { type: 'url', url: sized(cafe.images[0], 400) } });
  for (const m of (cafe.menuImages || []).slice(0, 2)) content.push({ type: 'image', source: { type: 'url', url: sized(m, 900) } });
  const meta = [`Name: ${cafe.name}`, `Suburb: ${cafe.suburb}`,
    cafe.coffeeBrand && `Coffee brand: ${cafe.coffeeBrand}`].filter(Boolean).join('\n');
  content.push({ type: 'text', text: `${meta}\n\nWrite the one-sentence description, leading with what this cafe is known for.` });

  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 90,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });
  return res.content.find((b) => b.type === 'text')?.text?.trim() || null;
}

async function run() {
  if (!KEY) { console.error('Missing GOOGLE_PLACES_KEY'); process.exit(1); }
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();
  const targets  = cafes.filter((c) => progress[c.id] === undefined).slice(0, LIMIT);
  console.log(`Cafes to process: ${targets.length}${LIMIT !== Infinity ? ` (TEST ${LIMIT})` : ''}`);

  let kept = 0, redone = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 30).padEnd(30)}`);
    try {
      const t = cafes.find((c) => c.id === cafe.id);
      if (await hasGoogleSummary(placeIdOf(cafe))) {
        t.descriptionSource = 'google';   // keep existing text
        progress[cafe.id] = 'google';
        kept++;
        process.stdout.write(' ✓ kept (Google)');
      } else {
        const desc = await describe(cafe);
        if (desc) { t.shortDescription = desc; t.descriptionSource = 'claude'; redone++; process.stdout.write(` ✎ ${desc.slice(0, 50)}…`); }
        progress[cafe.id] = desc ? 'claude' : 0;
      }
    } catch (err) {
      progress[cafe.id] = null;
      process.stdout.write(` skip: ${err.message.slice(0, 40)}`);
    }
    process.stdout.write('\n');
    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${kept} kept, ${redone} regenerated]`);
    }
    await sleep(DELAY_MS);
  }
  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. Kept ${kept} Google, regenerated ${redone} Claude.`);
}

run().catch(console.error);
