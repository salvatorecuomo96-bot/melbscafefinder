#!/usr/bin/env node
/**
 * scripts/transform.js
 *
 * Converts data/cafes_raw.json (Geoapify features) into src/data/cafes.js
 * (the ES module the React app imports).
 *
 * Fields set to null here will be filled by Phase 2 (Google Places enrichment).
 *
 * Usage:
 *   node scripts/transform.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_FILE = path.join(ROOT, 'data', 'cafes_raw.json');
const OUT_FILE = path.join(ROOT, 'public', 'cafes.json');

if (!fs.existsSync(RAW_FILE)) {
  console.error('❌  data/cafes_raw.json not found. Run scrape_geoapify.js first.');
  process.exit(1);
}

const { features } = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'));
console.log(`▶  Transforming ${features.length} raw features…`);

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

function pickSuburb(props) {
  // Geoapify uses different fields depending on the area
  return (
    props.suburb ||
    props.city_district ||
    props.district ||
    props.quarter ||
    props.county ||
    props.city ||
    'Melbourne'
  );
}

/**
 * Parse OSM opening_hours string into our { mon, tue, wed, thu, fri, sat, sun } shape.
 * OSM format examples:
 *   "Mo-Fr 07:00-17:00"
 *   "Mo-Fr 07:00-17:00; Sa 08:00-15:00"
 *   "Mo-Su 07:00-17:00"
 *   "24/7"
 *   "off" / "closed"
 */
function parseHours(raw) {
  if (!raw) return null;

  const DAY_MAP = {
    mo: 'mon', tu: 'tue', we: 'wed', th: 'thu', fr: 'fri', sa: 'sat', su: 'sun',
  };
  const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_ORDER = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

  if (raw === '24/7') {
    return Object.fromEntries(ALL_DAYS.map(d => [d, 'Open 24h']));
  }

  const result = {};

  const rules = raw.split(/\s*;\s*/);
  for (const rule of rules) {
    const m = rule.match(/^([A-Za-z,\-]+)\s+(.+)$/);
    if (!m) continue;

    const daysPart = m[1].toLowerCase();
    const timePart = m[2].trim();
    const timeStr = timePart === 'off' || timePart === 'closed' ? 'Closed' : timePart.replace('-', ' - ');

    // Expand day ranges like "mo-fr" → [mo, tu, we, th, fr]
    const dayTokens = daysPart.split(',');
    const expandedDays = [];

    for (const token of dayTokens) {
      if (token.includes('-')) {
        const [from, to] = token.split('-');
        const start = DAY_ORDER.indexOf(from.trim());
        const end = DAY_ORDER.indexOf(to.trim());
        if (start !== -1 && end !== -1) {
          for (let i = start; i <= end; i++) expandedDays.push(DAY_ORDER[i]);
        }
      } else {
        const key = token.trim();
        if (DAY_ORDER.includes(key)) expandedDays.push(key);
      }
    }

    for (const osmDay of expandedDays) {
      const appDay = DAY_MAP[osmDay];
      if (appDay) result[appDay] = timeStr;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ── Transform ────────────────────────────────────────────────────────────────

const seen = new Set();
const cafes = [];

for (const feature of features) {
  const p = feature.properties || {};

  const name = (typeof p.name === 'string' ? p.name : String(p.name ?? '')).trim();
  if (!name) continue;

  const lat = p.lat ?? feature.geometry?.coordinates?.[1];
  const lng = p.lon ?? feature.geometry?.coordinates?.[0];
  if (!lat || !lng) continue;

  // Skip if way outside Melbourne (shouldn't happen but belt-and-braces)
  if (lat < -39 || lat > -37 || lng < 143 || lng > 146) continue;

  const suburb = pickSuburb(p);
  const baseSlug = slugify(`${name}-${suburb}`);

  // Deduplicate slugs
  let slug = baseSlug;
  let suffix = 2;
  while (seen.has(slug)) { slug = `${baseSlug}-${suffix++}`; }
  seen.add(slug);

  const raw = p.datasource?.raw || {};
  const hours = parseHours(raw.opening_hours);

  cafes.push({
    id: slug,
    name,
    suburb,
    address: p.address_line2 || p.formatted || '',
    latitude: lat,
    longitude: lng,

    // ── Phase 2 will fill these ──
    rating: null,
    coffeeQuality: null,
    foodQuality: null,
    priceLevel: null,
    images: [],
    shortDescription: null,

    // ── Attributes (Phase 2 enrichment via review keyword matching) ──
    hasWifi: null,
    laptopFriendly: null,
    dogFriendly: null,
    outdoorSeating: null,
    quiet: null,
    goodForDates: null,
    goodForWork: null,
    goodForGroups: null,
    specialtyCoffee: null,
    matcha: null,
    pastries: null,
    hasDecaf: null,
    plantMilk: null,

    // ── From Geoapify directly ──
    phone: raw.phone || raw['contact:phone'] || null,
    website: p.website || raw.website || raw['contact:website'] || null,
    openingHours: hours,

    // ── Misc ──
    vibe: null,
    tags: [],
    amenities: [],
    _source: 'geoapify',
    _placeId: p.place_id,
  });
}

console.log(`✅  ${cafes.length} cafes after filtering & deduplication`);

// ── Write output ─────────────────────────────────────────────────────────────

fs.writeFileSync(OUT_FILE, JSON.stringify(cafes));
console.log(`\n📄  Saved → public/cafes.json  (${cafes.length} cafes)`);
console.log(`\n👉  Run the dev server: npm run dev`);
