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
const reviewIntelPath = path.join(ROOT, 'data', 'review_intel.json');
const websitePath     = path.join(ROOT, 'data', 'website_attrs.json');

const reviewIntel  = fs.existsSync(reviewIntelPath) ? JSON.parse(fs.readFileSync(reviewIntelPath, 'utf8')) : {};
const websiteAttrs = fs.existsSync(websitePath)     ? JSON.parse(fs.readFileSync(websitePath, 'utf8'))     : {};

console.log(`📦  Google:         ${cafes.length} cafes`);
console.log(`📦  Review Intel:   ${Object.keys(reviewIntel).length} analyzed`);
console.log(`📦  Website scrape: ${Object.keys(websiteAttrs).length} scraped`);

// Merge: only fill in null fields (manual curation + Google always wins)
const merged = cafes.map((cafe) => {
  const r = reviewIntel[cafe.id] || {};  // Claude Haiku analysis
  const w = websiteAttrs[cafe.id] || {}; // Website scrape

  // Priority: existing manual data > Claude review analysis > website scrape
  const fill = (field, ...sources) => {
    if (cafe[field] != null) return cafe[field];
    for (const s of sources) {
      if (s[field] != null) return s[field];
    }
    return null;
  };

  return {
    ...cafe,
    hasWifi:         fill('hasWifi', r, w),
    outdoorSeating:  fill('outdoorSeating', r, w),
    dogFriendly:     fill('dogFriendly', r, w),
    laptopFriendly:  fill('laptopFriendly', r, w),
    quiet:           fill('quiet', r, w),
    goodForDates:    fill('goodForDates', r, w),
    goodForGroups:   fill('goodForGroups', r, w),
    goodForWork:     fill('goodForWork', r, w),
    specialtyCoffee: fill('specialtyCoffee', r, w),
    matcha:          fill('matcha', r, w),
    pastries:        fill('pastries', r, w),
    hasDecaf:        fill('hasDecaf', r, w),
    // Website-only fields (reviews rarely mention these)
    plantMilk:   cafe.plantMilk  ?? w.plantMilk  ?? null,
    coffeeBrand: cafe.coffeeBrand ?? r.coffeeBrand ?? w.coffeeBrand ?? null,
    chaiType:    cafe.chaiType   ?? w.chaiType    ?? null,
    vibe:        cafe.vibe       ?? r.vibe        ?? null,
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
console.log(`\n   WiFi: ${withWifi}  Dogs: ${withDogs}  Brand: ${withBrand}  Chai: ${withChai}`)
;
console.log(`\n👉  git add public/cafes.json && git commit -m "data: enrichment update" && git push`);
