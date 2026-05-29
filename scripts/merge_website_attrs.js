/**
 * merge_website_attrs.js
 * Merges data/website_attrs.json into public/cafes.json.
 * Only fills null fields — never overwrites existing data.
 * Run after scrape_websites.js finishes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const ATTRS_FILE = path.join(__dirname, '../data/website_attrs.json');

const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
const attrs = JSON.parse(fs.readFileSync(ATTRS_FILE, 'utf8'));

const FIELDS = [
  'coffeeBrand', 'hasWifi', 'plantMilk', 'chaiType', 'hasDecaf',
  'matcha', 'pastries', 'specialtyCoffee', 'dogFriendly',
  'outdoorSeating', 'laptopFriendly', 'goodForWork',
];

let patched = 0;
for (const cafe of cafes) {
  const a = attrs[cafe.id];
  if (!a || !a.fetched) continue;
  let changed = false;
  for (const f of FIELDS) {
    if (cafe[f] == null && a[f] != null) {
      cafe[f] = a[f];
      changed = true;
    }
  }
  if (changed) patched++;
}

fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));

const withWifi  = cafes.filter(c => c.hasWifi).length;
const withBrand = cafes.filter(c => c.coffeeBrand).length;
console.log(`Patched ${patched} cafes`);
console.log(`hasWifi: ${withWifi} | coffeeBrand: ${withBrand}`);
