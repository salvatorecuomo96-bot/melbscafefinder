/**
 * fix_kindb_placeids.js — repair wrong/colliding place_ids ("Kind B").
 * ---------------------------------------------------------------------------
 * After dedupe_cafes.js removes look-alike duplicates, the cafes that STILL
 * share a place_id but have *different* names are collisions: two real venues
 * wrongly bound to one Google place_id (e.g. Padre Coffee vs Proud Mary).
 *
 * Policy (per user): try to give each colliding cafe its OWN place_id via
 * Places Text Search (name + suburb). If a cafe can't get a confident, distinct
 * place_id — or two of them resolve back to the SAME place (a rename, i.e. one
 * real venue) — REMOVE the extra, keeping the best record.
 *
 *   - confident + unique place_id  -> keep, write new place_id + coords.
 *   - two resolve to same place    -> same venue; keep best (name match, then
 *                                     richness), remove the other.
 *   - no confident match           -> can't fix; removed (unless it's the only
 *                                     survivor of its group, then kept as-is).
 *
 * DRY RUN by default. To write:  APPLY=1 node scripts/fix_kindb_placeids.js
 * Test a few:                    KINDB_LIMIT=4 node scripts/fix_kindb_placeids.js
 * Uses GOOGLE_PLACES_KEY (Text Search ~AUD$0.03/call; ~54 calls ≈ $1.70).
 * ---------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');

const KEY      = process.env.GOOGLE_PLACES_KEY;
const APPLY    = process.env.APPLY === '1';
const LIMIT    = parseInt(process.env.KINDB_LIMIT || '0', 10) || Infinity;
const DELAY_MS = 150;
const BOUNDS   = { latMin: -38.6, latMax: -37.4, lngMin: 144.3, lngMax: 145.6 };
const sleep    = (ms) => new Promise((r) => setTimeout(r, ms));

const placeIdOf = (c) => (c.googleMapsUrl || '').match(/query_place_id=([^&]+)/)?.[1] || null;

// ── name-similarity test (same as dedupe_cafes.js) to identify Kind B groups ─
const STOP = /\b(the|cafe|café|coffee|co|and|bar|kitchen|eatery|melbourne|caffe|caffé|dine|in)\b/g;
const core = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(STOP, '').replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[m][n];
}
const similar = (a, b) => { const x = core(a), y = core(b); if (!x || !y) return false; return x === y || x.includes(y) || y.includes(x) || lev(x, y) <= 2; };

function nameMatches(found, cafeName) {
  const words = cafeName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return true;
  return words.some((w) => found.toLowerCase().includes(w));
}
const richness = (c) => (c.images || []).length * 2 + (c.menuImages || []).length
  + (c.description ? 2 : 0) + (c.coffeeBrand ? 1 : 0) + (c.instagram ? 1 : 0);

async function textSearch(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.id,places.location,places.displayName' },
    body: JSON.stringify({ textQuery: query, regionCode: 'AU' }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 80)}`);
  return (await res.json()).places?.[0] || null;
}

async function run() {
  if (!KEY) { console.error('Missing GOOGLE_PLACES_KEY in .env'); process.exit(1); }
  const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));

  const byPid = new Map();
  for (const c of cafes) { const k = placeIdOf(c); if (!k) continue; if (!byPid.has(k)) byPid.set(k, []); byPid.get(k).push(c); }
  const kindB = [...byPid.values()].filter((list) =>
    list.length > 1 && !list.every((c, i) => list.every((d, j) => i === j || similar(c.name, d.name)))
  ).slice(0, LIMIT);

  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN'}`);
  console.log(`Kind B collision groups: ${kindB.length}\n`);

  const fixed = [], removed = [], keptRename = [];

  for (const group of kindB) {
    // resolve every member's own place_id
    const resolved = [];
    for (const cafe of group) {
      try {
        const p = await textSearch(`${cafe.name} ${cafe.suburb} Victoria`);
        const loc = p?.location;
        const inBox = loc && loc.latitude >= BOUNDS.latMin && loc.latitude <= BOUNDS.latMax
          && loc.longitude >= BOUNDS.lngMin && loc.longitude <= BOUNDS.lngMax;
        const named = p && nameMatches(p.displayName?.text || '', cafe.name);
        resolved.push({ cafe, pid: (p?.id && inBox && named) ? p.id : null, loc, disp: p?.displayName?.text || '' });
      } catch (err) {
        resolved.push({ cafe, pid: null, disp: '', err: err.message.slice(0, 50) });
      }
      await sleep(DELAY_MS);
    }

    const counts = {};
    for (const r of resolved) if (r.pid) counts[r.pid] = (counts[r.pid] || 0) + 1;

    const keep = new Set();
    // Phase 1: confident + group-unique place_id -> keep & fix
    for (const r of resolved) {
      if (r.pid && counts[r.pid] === 1) {
        if (placeIdOf(r.cafe) !== r.pid) {
          r.cafe.googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.cafe.name} ${r.cafe.suburb}`)}&query_place_id=${r.pid}`;
          r.cafe.latitude = r.loc.latitude; r.cafe.longitude = r.loc.longitude;
          fixed.push(r);
        } else {
          keptRename.push({ ...r, note: 'already correct' });
        }
        keep.add(r.cafe.id);
      }
    }

    // Phase 2: leftovers — same-pid collisions (rename) or unresolved
    const leftovers = resolved.filter((r) => !keep.has(r.cafe.id));
    if (leftovers.length) {
      if (keep.size === 0) {
        // nobody fixed: keep one representative so the venue survives.
        // prefer name-matches-displayName, then richness.
        const pick = leftovers.slice().sort((a, b) => {
          const am = a.disp && nameMatches(a.disp, a.cafe.name) ? 1 : 0;
          const bm = b.disp && nameMatches(b.disp, b.cafe.name) ? 1 : 0;
          if (am !== bm) return bm - am;
          return richness(b.cafe) - richness(a.cafe);
        })[0];
        if (pick.pid && placeIdOf(pick.cafe) !== pick.pid) {
          pick.cafe.googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pick.cafe.name} ${pick.cafe.suburb}`)}&query_place_id=${pick.pid}`;
          pick.cafe.latitude = pick.loc.latitude; pick.cafe.longitude = pick.loc.longitude;
        }
        keep.add(pick.cafe.id);
        keptRename.push({ ...pick, note: pick.pid ? 'rename — kept as current venue' : 'unresolved — kept (only survivor)' });
      }
      for (const r of leftovers) if (!keep.has(r.cafe.id)) removed.push(r);
    }
  }

  const removeIds = new Set(removed.map((r) => r.cafe.id));

  console.log(`==== FIXED — new distinct place_id (${fixed.length}) ====`);
  fixed.forEach((r) => console.log(`  "${r.cafe.name}" (${r.cafe.suburb}) -> ${r.pid}  [${r.disp}]`));
  console.log(`\n==== KEPT — rename / sole survivor (${keptRename.length}) ====`);
  keptRename.forEach((r) => console.log(`  "${r.cafe.name}" (${r.cafe.suburb})  (${r.note})`));
  console.log(`\n==== REMOVED — no distinct place_id (${removed.length}) ====`);
  removed.forEach((r) => console.log(`  "${r.cafe.name}" (${r.cafe.suburb}) [${r.cafe.id}]${r.err ? ' ERR ' + r.err : r.disp ? ' (dup of "' + r.disp + '")' : ' (no match)'}`));

  if (APPLY) {
    const out = cafes.filter((c) => !removeIds.has(c.id));
    fs.writeFileSync(CAFES_FILE, JSON.stringify(out, null, 2));
    console.log(`\nApplied. ${fixed.length} place_id(s) fixed, ${removed.length} removed. ${cafes.length} -> ${out.length} cafes.`);
  } else {
    console.log(`\nDry run only. Re-run with  APPLY=1 node scripts/fix_kindb_placeids.js  to write.`);
  }
}

run().catch(console.error);
