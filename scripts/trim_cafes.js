#!/usr/bin/env node
/**
 * Strips public/cafes.json to fields used by the current UI, search logic, and
 * reliable filters. Run after enrichment/publishing.
 *
 * Usage: node scripts/trim_cafes.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '../public/cafes.json');

const KEEP = new Set([
  // Identity and location
  'id', 'name', 'suburb', 'address', 'latitude', 'longitude',
  // Display
  'images', 'menuImages', 'rating', 'userRatingsTotal', 'priceLevel',
  'phone', 'website', 'instagram', 'facebook', 'tiktok', 'googleMapsUrl',
  'openingHours', 'tags',
  // Reliable filter/search enrichment
  'coffeeBrand',
]);

const cafes = JSON.parse(readFileSync(SRC, 'utf8'));

const trimmed = cafes.map((cafe) => {
  const out = {};
  for (const key of KEEP) {
    if (key in cafe && cafe[key] != null) out[key] = cafe[key];
  }
  return out;
});

const before = JSON.stringify(cafes).length;
const after = JSON.stringify(trimmed).length;
writeFileSync(SRC, JSON.stringify(trimmed));

console.log(`Cafes: ${trimmed.length}`);
console.log(`Before: ${(before / 1024).toFixed(0)} KB`);
console.log(`After:  ${(after / 1024).toFixed(0)} KB`);
console.log(`Saved:  ${((before - after) / 1024).toFixed(0)} KB (${(100 * (1 - after / before)).toFixed(1)}%)`);
