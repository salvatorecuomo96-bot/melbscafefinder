#!/usr/bin/env node
/**
 * Merges all enrichment sources and publishes to public/cafes.json.
 *
 * Sources (priority order — later sources only fill in nulls):
 *   1. data/cafes_enriched.json  — Google Places (ratings, photos, hours)
 *   2. data/yelp_attrs.json      — Yelp (wifi, dogs, outdoor, noise, groups)
 *   3. data/website_attrs.json   — Website scrape (coffee brand, chai, milks)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = path.join(ROOT, 'data', 'cafes_enriched.json');
const dest = path.join(ROOT, 'public', 'cafes.json');

if (!fs.existsSync(src)) {
  console.error('❌  data/cafes_enriched.json not found. Run enrich_google.js first.');
  process.exit(1);
}

const cafes = JSON.parse(fs.readFileSync(src, 'utf8'));

// Load optional enrichment sources
const yelpPath    = path.join(ROOT, 'data', 'yelp_attrs.json');
const websitePath = path.join(ROOT, 'data', 'website_attrs.json');

const yelpAttrs    = fs.existsSync(yelpPath)    ? JSON.parse(fs.readFileSync(yelpPath, 'utf8'))    : {};
const websiteAttrs = fs.existsSync(websitePath) ? JSON.parse(fs.readFileSync(websitePath, 'utf8')) : {};

const yelpCount    = Object.keys(yelpAttrs).length;
const websiteCount = Object.keys(websiteAttrs).length;
console.log(`📦  Google: ${cafes.length} cafes`);
console.log(`📦  Yelp:   ${yelpCount} matched`);
console.log(`📦  Web:    ${websiteCount} scraped`);

// Merge: only fill in null fields (manual curation + Google always wins)
const merged = cafes.map((cafe) => {
  const y = yelpAttrs[cafe.id]    || {};
  const w = websiteAttrs[cafe.id] || {};

  const fill = (field, ...sources) => {
    if (cafe[field] != null) return cafe[field]; // Google/manual wins
    for (const s of sources) {
      if (s[field] != null) return s[field];
    }
    return cafe[field];
  };

  return {
    ...cafe,
    // Boolean attributes — Yelp structured > website keyword
    hasWifi:        fill('hasWifi', y, w),
    dogFriendly:    fill('dogFriendly', y, w),
    outdoorSeating: fill('outdoorSeating', y, w),
    quiet:          fill('quiet', y, w),
    goodForGroups:  fill('goodForGroups', y, w),
    goodForDates:   fill('goodForDates', y, w),
    laptopFriendly: fill('laptopFriendly', y, w),
    hasDecaf:       fill('hasDecaf', w, y),
    matcha:         fill('matcha', w, y),
    pastries:       fill('pastries', w, y),
    specialtyCoffee: fill('specialtyCoffee', w, y),
    goodForWork:    fill('goodForWork', w, y),
    // Website-only fields
    plantMilk:      cafe.plantMilk  ?? w.plantMilk  ?? null,
    coffeeBrand:    cafe.coffeeBrand ?? w.coffeeBrand ?? null,
    chaiType:       cafe.chaiType   ?? w.chaiType    ?? null,
  };
});

// Filter: require at least 40 Google reviews OR manually curated (has boolean attributes)
const hasCuration = (c) => [c.hasWifi, c.dogFriendly, c.outdoorSeating, c.laptopFriendly, c.quiet]
  .some((v) => v != null);
const clean = merged.filter((c) => (c.userRatingsTotal ?? 0) >= 40 || hasCuration(c));

fs.writeFileSync(dest, JSON.stringify(clean));
console.log(`\n✅  Published ${clean.length} cafes → public/cafes.json`);
console.log(`   (removed ${merged.length - clean.length} with no rating or photos)`);

// Stats
const withWifi     = clean.filter((c) => c.hasWifi).length;
const withDogs     = clean.filter((c) => c.dogFriendly).length;
const withBrand    = clean.filter((c) => c.coffeeBrand).length;
const withChai     = clean.filter((c) => c.chaiType).length;
console.log(`\n   WiFi: ${withWifi}  Dogs: ${withDogs}  Coffee brand: ${withBrand}  Chai: ${withChai}`);
console.log(`\n👉  git add public/cafes.json && git commit -m "data: enrichment update" && git push`);
