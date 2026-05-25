/**
 * Strips fields from public/cafes.json that are not used by any UI component,
 * filter, or search logic. Run after any enrichment step.
 *
 * Usage: node scripts/trim_cafes.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '../public/cafes.json');

const KEEP = new Set([
  // Identity
  'id', 'name', 'suburb', 'address', 'latitude', 'longitude',
  // Display
  'images', 'rating', 'userRatingsTotal', 'shortDescription', 'vibe',
  'priceLevel', 'phone', 'website', 'openingHours', 'tags',
  // Coffee
  'specialtyCoffee', 'filterCoffee', 'hasDecaf', 'matcha', 'chaiType', 'coffeeBrand',
  // Food
  'pastries', 'breakfastAllDay', 'brunchQuality', 'veganOptions', 'plantMilk',
  // Practical
  'hasWifi', 'hasPowerOutlets', 'laptopFriendly',
  'outdoorSeating', 'dogFriendly', 'pramFriendly', 'kidFriendly',
  // Atmosphere
  'noiseLevel', 'serviceStyle',
  // Character
  'hiddenGem', 'locallyOwned',
]);

const cafes = JSON.parse(readFileSync(SRC, 'utf8'));

const trimmed = cafes.map((cafe) => {
  const out = {};
  for (const key of KEEP) {
    if (key in cafe) out[key] = cafe[key];
  }
  return out;
});

const before = JSON.stringify(cafes).length;
const after  = JSON.stringify(trimmed).length;
writeFileSync(SRC, JSON.stringify(trimmed));

console.log(`Cafes: ${trimmed.length}`);
console.log(`Before: ${(before / 1024).toFixed(0)} KB`);
console.log(`After:  ${(after  / 1024).toFixed(0)} KB`);
console.log(`Saved:  ${((before - after) / 1024).toFixed(0)} KB (${(100 * (1 - after / before)).toFixed(1)}%)`);
