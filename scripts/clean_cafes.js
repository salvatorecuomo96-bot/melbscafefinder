/**
 * clean_cafes.js
 * Removes non-cafe entries from public/cafes.json.
 *
 * Strategy:
 *  1. Any entry from Geoapify with a catering.cafe category → keep
 *  2. All other entries → apply name-based filter
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const cafesPath  = resolve(__dirname, '../public/cafes.json');
const rawPath    = resolve(__dirname, '../data/cafes_raw.json');

const cafes = JSON.parse(readFileSync(cafesPath, 'utf8'));
const raw   = JSON.parse(readFileSync(rawPath, 'utf8'));

// Build placeId → categories lookup from Geoapify raw data
const catMap = {};
for (const f of raw.features) {
  catMap[f.properties.place_id] = f.properties.categories || [];
}

// Terms that make a place definitely NOT a cafe, no exceptions
const HARD_REMOVE = [
  'car wash', 'carwash', 'hand car',
  "mcdonald's", 'mcdonalds', 'mcdonald ',
  'hungry jack',
  'woolworths',
  'supermarket', 'piedimonte',
  'petroleum', 'ampol foodary', 'caltex',
  'magic hand', 'infinity carwash', 'carrera car wash', 'prestige hand car',
  'magic carwash',
  'oneGym', 'onegym',
  'acorn nursery', 'poyntons nursery',
  'palace cinema', 'cinemas balwyn',
];

// Terms that make a place likely not a cafe UNLESS a cafe/coffee term is also present
const SOFT_REMOVE = [
  'restaurant', 'bistro', 'trattoria', 'ristorante', 'osteria', 'brasserie',
  'yacht club', 'rowing club', 'football club', 'cricket club',
  'rsl club', 'bowls club', 'bowling club', 'sporting club',
  'theatre',
  'nursery', 'garden centre', 'garden center',
  'charcoal grill', 'steak house', 'steakhouse',
];

// Terms that rescue a place from soft removal
const CAFE_TERMS = [
  'cafe', 'coffee', 'espresso', 'bakery', 'patisserie', 'boulangerie',
  'roaster', 'roastery', 'matcha', 'tea house', 'brunch', 'barista',
];

function isCafe(cafe) {
  const n = cafe.name.toLowerCase();

  // Geoapify entries with confirmed catering.cafe category are always kept
  const cats = catMap[cafe._placeId] || [];
  if (cats.some(c => c.includes('catering.cafe') || c.includes('catering.coffee'))) {
    return true;
  }

  // Hard removes — no exceptions
  if (HARD_REMOVE.some(t => n.includes(t.toLowerCase()))) return false;

  // Soft removes — only remove if no cafe term saves it
  const hasCafeTerm = CAFE_TERMS.some(t => n.includes(t));
  if (!hasCafeTerm && SOFT_REMOVE.some(t => n.includes(t.toLowerCase()))) return false;

  return true;
}

const before = cafes.length;
const clean  = cafes.filter(isCafe);
const removed = cafes.filter(c => !isCafe(c));

console.log(`Before: ${before}  After: ${clean.length}  Removed: ${removed.length}`);
console.log('\nRemoved entries:');
removed.forEach(c => console.log(' -', c.name, '|', c.suburb));

writeFileSync(cafesPath, JSON.stringify(clean, null, 2));
console.log('\nWrote', cafesPath);
