#!/usr/bin/env node
/**
 * Publishes the Google-enriched cafe dataset to public/cafes.json and merges only
 * reliable coffee-brand enrichment from data/website_attrs.json.
 *
 * The app no longer ships review-derived lifestyle filters or generated cafe
 * descriptions because those fields were too sparse and unreliable.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'data', 'cafes_enriched.json');
const dest = path.join(ROOT, 'public', 'cafes.json');
const websitePath = path.join(ROOT, 'data', 'website_attrs.json');

const BRAND_ALIASES = new Map([
  ['single o', 'Single O'], ['single o coffee', 'Single O'],
  ['code black', 'Code Black'], ['code black coffee', 'Code Black'],
  ['five senses', 'Five Senses'], ['5 senses', 'Five Senses'],
  ['allpress', 'Allpress'], ['allpress espresso', 'Allpress'],
  ['st ali', 'St Ali'], ['st. ali', 'St Ali'], ['saint ali', 'St Ali'],
  ['industry beans', 'Industry Beans'],
  ['axil', 'Axil'], ['axil coffee', 'Axil'],
  ['seven seeds', 'Seven Seeds'], ['7 seeds', 'Seven Seeds'],
  ['market lane', 'Market Lane'], ['market lane coffee', 'Market Lane'],
  ['veneziano', 'Veneziano'], ['veneziano coffee', 'Veneziano'],
  ['proud mary', 'Proud Mary'],
  ['dukes', 'Dukes'], ['dukes coffee', 'Dukes'], ['dukes coffee roasters', 'Dukes'],
  ['rumble', 'Rumble'], ['rumble coffee', 'Rumble'],
  ['campos', 'Campos'], ['campos coffee', 'Campos'],
  ['ona', 'Ona'], ['ona coffee', 'Ona'],
  ['padre', 'Padre'], ['padre coffee', 'Padre'],
  ['sensory lab', 'Sensory Lab'],
  ['small batch', 'Small Batch'], ['small batch coffee', 'Small Batch'], ['batch brewing', 'Small Batch'],
  ['maker', 'Maker'], ['maker coffee', 'Maker'],
  ['assembly', 'Assembly'], ['assembly coffee', 'Assembly'],
  ['streat', 'STREAT'],
]);

const REMOVE_FIELDS = new Set([
  'shortDescription', 'descriptionSource', 'vibe', 'specialtyCoffee', 'coffeeStyle',
  'filterCoffee', 'baristaSkill', 'consistency', 'hasDecaf', 'matcha', 'chaiType',
  'pastries', 'brunchQuality', 'veganOptions', 'breakfastAllDay', 'plantMilk',
  'hasWifi', 'wifiQuality', 'hasPowerOutlets', 'powerOutlets', 'laptopFriendly',
  'goodForWork', 'goodForDigitalNomads', 'goodForLongStays', 'workPressure',
  'noiseLevel', 'naturalLight', 'seatingComfort', 'energyLevel', 'instagrammable',
  'music', 'lightingMood', 'communityFeel', 'outdoorSeating', 'dogFriendly',
  'pramFriendly', 'providesNewspaper', 'goodForSolo', 'goodForDates', 'goodForGroups',
  'goodForMeetings', 'kidFriendly', 'serviceStyle', 'hiddenGem', 'locallyOwned',
  'sustainability',
]);

function normaliseBrand(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');
  return BRAND_ALIASES.get(key) || raw;
}

function stripLegacyFields(cafe) {
  const out = { ...cafe };
  for (const field of REMOVE_FIELDS) delete out[field];
  return out;
}

if (!fs.existsSync(src)) {
  console.error('data/cafes_enriched.json not found. Run enrich_google.js first.');
  process.exit(1);
}

const cafes = JSON.parse(fs.readFileSync(src, 'utf8'));
const websiteAttrs = fs.existsSync(websitePath) ? JSON.parse(fs.readFileSync(websitePath, 'utf8')) : {};

console.log(`Google-enriched cafes: ${cafes.length}`);
console.log(`Website coffee-brand records: ${Object.keys(websiteAttrs).length}`);

const merged = cafes.map((cafe) => {
  const websiteBrand = normaliseBrand(websiteAttrs[cafe.id]?.coffeeBrand);
  const existingBrand = normaliseBrand(cafe.coffeeBrand);
  const out = stripLegacyFields(cafe);
  const coffeeBrand = existingBrand || websiteBrand;
  if (coffeeBrand) out.coffeeBrand = coffeeBrand;
  else delete out.coffeeBrand;
  return out;
});

const clean = merged.filter((cafe) => (cafe.userRatingsTotal ?? 0) >= 40 || cafe.coffeeBrand);
fs.writeFileSync(dest, JSON.stringify(clean));

const brandCounts = clean.reduce((acc, cafe) => {
  if (cafe.coffeeBrand) acc[cafe.coffeeBrand] = (acc[cafe.coffeeBrand] || 0) + 1;
  return acc;
}, {});

console.log(`Published ${clean.length} cafes → public/cafes.json`);
console.log(`Removed ${merged.length - clean.length} cafes below the ratings threshold with no coffee-brand enrichment`);
console.log(`Coffee-brand coverage: ${Object.values(brandCounts).reduce((a, b) => a + b, 0)} cafes`);
Object.entries(brandCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([brand, count]) => console.log(`  ${brand}: ${count}`));
