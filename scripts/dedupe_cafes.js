/**
 * dedupe_cafes.js — merge true duplicate cafes that share a Google place_id.
 * ---------------------------------------------------------------------------
 * Groups cafes by place_id. WITHIN each group it compares the (stop-word
 * stripped, accent-folded) "core" of the names:
 *   - SIMILAR names  -> same venue entered twice = auto-merge (keep richest,
 *                       fold any missing fields in from the other, drop rest).
 *   - DIFFERENT names -> could be a rename/closure OR a wrong place_id. NOT
 *                       touched. Printed under "MANUAL REVIEW" for your call.
 *
 * DRY RUN by default (writes nothing). To actually apply:
 *     APPLY=1 node scripts/dedupe_cafes.js
 * Plain dry run:
 *     node scripts/dedupe_cafes.js
 * ---------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const APPLY = process.env.APPLY === '1';

const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
const placeIdOf = (c) => (c.googleMapsUrl || '').match(/query_place_id=([^&]+)/)?.[1] || null;

// ── name similarity ────────────────────────────────────────────────────────
const STOP = /\b(the|cafe|café|coffee|co|and|bar|kitchen|eatery|melbourne|caffe|caffé|dine|in)\b/g;
const core = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(STOP, '')
    .replace(/[^a-z0-9]/g, '');

function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

function similar(a, b) {
  const x = core(a), y = core(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  return lev(x, y) <= 2; // tiny typos: Scarlet/Scarlett, Saporo/Saporo
}

// ── richness score: keep the most complete record ───────────────────────────
const onNewCloud = (c) => (c.images || []).some((u) => u.includes('dqsn9vvpl'));
function score(c) {
  return (c.images || []).length * 2
    + (c.menuImages || []).length
    + (c.description ? 2 : 0)
    + (c.descriptionSource === 'google' ? 1 : 0)
    + (c.coffeeBrand ? 1 : 0)
    + (c.instagram ? 1 : 0)
    + (c.priceLevel ? 1 : 0)
    + (c.phone ? 1 : 0)
    + (c.website ? 1 : 0)
    + (onNewCloud(c) ? 2 : 0);
}

// fold scalar fields the keeper is missing in from a loser
const FILL = ['instagram', 'website', 'phone', 'priceLevel', 'coffeeBrand', 'description', 'descriptionSource'];
function mergeInto(keep, loser) {
  for (const f of FILL) if (!keep[f] && loser[f]) keep[f] = loser[f];
  // prefer a Google-sourced description if the keeper's is Claude/none
  if (loser.descriptionSource === 'google' && keep.descriptionSource !== 'google' && loser.description) {
    keep.description = loser.description; keep.descriptionSource = 'google';
  }
  if ((!keep.openingHours || !Object.keys(keep.openingHours).length) && loser.openingHours)
    keep.openingHours = loser.openingHours;
  // take the richer media set if the loser clearly has more
  if ((loser.images || []).length > (keep.images || []).length) keep.images = loser.images;
  if ((loser.menuImages || []).length > (keep.menuImages || []).length) keep.menuImages = loser.menuImages;
}

// ── group by place_id ────────────────────────────────────────────────────────
const groups = new Map();
for (const c of cafes) {
  const k = placeIdOf(c);
  if (!k) continue;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}

const removeIds = new Set();
const merges = [];
const manual = [];

for (const [pid, list] of groups) {
  if (list.length < 2) continue;
  // all names mutually similar?  -> auto-merge whole group
  const allSimilar = list.every((c, i) => list.every((d, j) => i === j || similar(c.name, d.name)));
  if (!allSimilar) { manual.push([pid, list]); continue; }

  const keep = list.slice().sort((a, b) => score(b) - score(a))[0];
  for (const loser of list) {
    if (loser === keep) continue;
    mergeInto(keep, loser);
    removeIds.add(loser.id);
  }
  merges.push({ keep, losers: list.filter((c) => c !== keep) });
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no changes)'}\n`);
console.log(`==== AUTO-MERGE (${merges.length} groups, removing ${removeIds.size}) ====`);
for (const { keep, losers } of merges) {
  console.log(`  KEEP   "${keep.name}" (${keep.suburb}) [${keep.id}]  imgs:${(keep.images||[]).length} menu:${(keep.menuImages||[]).length}`);
  for (const l of losers) console.log(`  remove "${l.name}" (${l.suburb}) [${l.id}]`);
}

console.log(`\n==== MANUAL REVIEW — same place_id, different names (${manual.length}) ====`);
for (const [pid, list] of manual) {
  console.log(`  [${pid}]`);
  for (const c of list) console.log(`     - "${c.name}" (${c.suburb}) ${c.rating}★/${c.userRatingsTotal} [${c.id}]`);
}

if (APPLY) {
  const out = cafes.filter((c) => !removeIds.has(c.id));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(out, null, 2));
  console.log(`\nApplied. ${cafes.length} -> ${out.length} cafes (removed ${removeIds.size}).`);
} else {
  console.log(`\nDry run only. Re-run with  APPLY=1 node scripts/dedupe_cafes.js  to write.`);
}
