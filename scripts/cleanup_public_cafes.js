#!/usr/bin/env node
/**
 * Cleans the shipped cafe dataset after the product pivot away from unreliable
 * review-derived attributes. Keeps only display/search data and normalises
 * coffee-brand labels so brand filtering is consistent.
 *
 * Usage: node scripts/cleanup_public_cafes.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '../public/cafes.json');

export const BRAND_ALIASES = new Map([
  ['single o', 'Single O'],
  ['single o coffee', 'Single O'],
  ['code black', 'Code Black'],
  ['code black coffee', 'Code Black'],
  ['five senses', 'Five Senses'],
  ['5 senses', 'Five Senses'],
  ['allpress', 'Allpress'],
  ['allpress espresso', 'Allpress'],
  ['st ali', 'St Ali'],
  ['st. ali', 'St Ali'],
  ['saint ali', 'St Ali'],
  ['industry beans', 'Industry Beans'],
  ['axil', 'Axil'],
  ['axil coffee', 'Axil'],
  ['seven seeds', 'Seven Seeds'],
  ['7 seeds', 'Seven Seeds'],
  ['market lane', 'Market Lane'],
  ['market lane coffee', 'Market Lane'],
  ['veneziano', 'Veneziano'],
  ['veneziano coffee', 'Veneziano'],
  ['proud mary', 'Proud Mary'],
  ['dukes', 'Dukes'],
  ['dukes coffee', 'Dukes'],
  ['dukes coffee roasters', 'Dukes'],
  ['rumble', 'Rumble'],
  ['rumble coffee', 'Rumble'],
  ['campos', 'Campos'],
  ['campos coffee', 'Campos'],
  ['ona', 'Ona'],
  ['ona coffee', 'Ona'],
  ['padre', 'Padre'],
  ['padre coffee', 'Padre'],
  ['sensory lab', 'Sensory Lab'],
  ['small batch', 'Small Batch'],
  ['small batch coffee', 'Small Batch'],
  ['batch brewing', 'Small Batch'],
  ['maker', 'Maker'],
  ['maker coffee', 'Maker'],
  ['assembly', 'Assembly'],
  ['assembly coffee', 'Assembly'],
  ['streat', 'STREAT'],
]);

const REMOVE_FIELDS = new Set([
  'shortDescription', 'descriptionSource', 'vibe', 'specialtyCoffee', 'filterCoffee',
  'hasDecaf', 'matcha', 'chaiType', 'pastries', 'breakfastAllDay', 'brunchQuality',
  'veganOptions', 'plantMilk', 'hasWifi', 'wifiQuality', 'hasPowerOutlets',
  'powerOutlets', 'laptopFriendly', 'goodForWork', 'goodForDigitalNomads',
  'goodForLongStays', 'workPressure', 'noiseLevel', 'naturalLight',
  'seatingComfort', 'energyLevel', 'instagrammable', 'music', 'lightingMood',
  'communityFeel', 'baristaSkill', 'consistency', 'outdoorSeating', 'dogFriendly',
  'pramFriendly', 'providesNewspaper', 'goodForSolo', 'goodForDates', 'goodForGroups',
  'goodForMeetings', 'kidFriendly', 'serviceStyle', 'hiddenGem', 'locallyOwned',
  'sustainability',
]);

const normaliseBrand = (value) => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');
  return BRAND_ALIASES.get(key) || raw;
};

const cafes = JSON.parse(readFileSync(SRC, 'utf8'));
let changedBrands = 0;
let removedValues = 0;

const cleaned = cafes.map((cafe) => {
  const out = { ...cafe };
  const beforeBrand = out.coffeeBrand ?? null;
  const afterBrand = normaliseBrand(beforeBrand);
  if (beforeBrand !== afterBrand) changedBrands++;
  if (afterBrand) out.coffeeBrand = afterBrand;
  else delete out.coffeeBrand;

  for (const field of REMOVE_FIELDS) {
    if (field in out) {
      removedValues++;
      delete out[field];
    }
  }
  return out;
});

writeFileSync(SRC, JSON.stringify(cleaned));

const brandCounts = cleaned.reduce((acc, cafe) => {
  if (cafe.coffeeBrand) acc[cafe.coffeeBrand] = (acc[cafe.coffeeBrand] || 0) + 1;
  return acc;
}, {});

console.log(`Cleaned ${cleaned.length} cafes`);
console.log(`Normalised brand labels on ${changedBrands} cafes`);
console.log(`Removed ${removedValues} legacy description/review-derived field values`);
console.log('Top coffee brands:');
Object.entries(brandCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([brand, count]) => console.log(`  ${brand}: ${count}`));
