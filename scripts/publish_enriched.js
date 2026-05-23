#!/usr/bin/env node
/**
 * Merges all enrichment sources and publishes to public/cafes.json.
 *
 * Sources (priority order — later sources only fill in nulls):
 *   1. data/cafes_enriched.json  — Google Places (ratings, photos, hours)
 *   2. data/review_intel.json    — Claude Haiku review analysis
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
    // Work & environment
    hasWifi:              fill('hasWifi', r, w),
    wifiQuality:          fill('wifiQuality', r, w),
    hasPowerOutlets:      fill('hasPowerOutlets', r, w),
    powerOutlets:         fill('powerOutlets', r, w),
    laptopFriendly:       fill('laptopFriendly', r, w),
    goodForWork:          fill('goodForWork', r, w),
    goodForDigitalNomads: fill('goodForDigitalNomads', r, w),
    goodForLongStays:     fill('goodForLongStays', r, w),
    workPressure:         fill('workPressure', r, w),
    noiseLevel:           fill('noiseLevel', r, w),
    naturalLight:         fill('naturalLight', r, w),
    seatingComfort:       fill('seatingComfort', r, w),
    // Vibe
    vibe:                 cafe.vibe ?? r.vibe ?? null,
    energyLevel:          fill('energyLevel', r, w),
    instagrammable:       fill('instagrammable', r, w),
    music:                fill('music', r, w),
    lightingMood:         fill('lightingMood', r, w),
    communityFeel:        fill('communityFeel', r, w),
    // Coffee
    specialtyCoffee:      fill('specialtyCoffee', r, w),
    coffeeStyle:          fill('coffeeStyle', r, w),
    filterCoffee:         fill('filterCoffee', r, w),
    baristaSkill:         fill('baristaSkill', r, w),
    consistency:          fill('consistency', r, w),
    coffeeBrand:          cafe.coffeeBrand ?? r.coffeeBrand ?? w.coffeeBrand ?? null,
    hasDecaf:             fill('hasDecaf', r, w),
    matcha:               fill('matcha', r, w),
    chaiType:             cafe.chaiType ?? w.chaiType ?? r.chaiType ?? null,
    // Food
    pastries:             fill('pastries', r, w),
    brunchQuality:        fill('brunchQuality', r, w),
    veganOptions:         fill('veganOptions', r, w),
    breakfastAllDay:      fill('breakfastAllDay', r, w),
    // Practical
    outdoorSeating:       fill('outdoorSeating', r, w),
    dogFriendly:          fill('dogFriendly', r, w),
    pramFriendly:         fill('pramFriendly', r, w),
    // Social
    goodForSolo:          fill('goodForSolo', r, w),
    goodForDates:         fill('goodForDates', r, w),
    goodForGroups:        fill('goodForGroups', r, w),
    goodForMeetings:      fill('goodForMeetings', r, w),
    kidFriendly:          fill('kidFriendly', r, w),
    serviceStyle:         fill('serviceStyle', r, w),
    // Advanced
    hiddenGem:            fill('hiddenGem', r, w),
    locallyOwned:         fill('locallyOwned', r, w),
    sustainability:       fill('sustainability', r, w),
    // Website-only
    plantMilk:            cafe.plantMilk ?? w.plantMilk ?? null,
  };
});

// Filter: require at least 40 Google reviews OR manually curated (has boolean attributes)
const hasCuration = (c) => [c.hasWifi, c.dogFriendly, c.outdoorSeating, c.laptopFriendly, c.noiseLevel]
  .some((v) => v != null);
const clean = merged.filter((c) => (c.userRatingsTotal ?? 0) >= 40 || hasCuration(c));

fs.writeFileSync(dest, JSON.stringify(clean));
console.log(`\n✅  Published ${clean.length} cafes → public/cafes.json`);
console.log(`   (removed ${merged.length - clean.length} below threshold)`);

// Stats
const withWifi    = clean.filter((c) => c.hasWifi).length;
const withDogs    = clean.filter((c) => c.dogFriendly).length;
const withBrand   = clean.filter((c) => c.coffeeBrand).length;
const withChai    = clean.filter((c) => c.chaiType).length;
const withVibe    = clean.filter((c) => c.vibe).length;
const withNomad   = clean.filter((c) => c.goodForDigitalNomads).length;
const withHidden  = clean.filter((c) => c.hiddenGem).length;
console.log(`\n   WiFi: ${withWifi}  Dogs: ${withDogs}  Brand: ${withBrand}  Chai: ${withChai}  Vibe: ${withVibe}  Nomad: ${withNomad}  Hidden gems: ${withHidden}`);
console.log(`\n👉  git add public/cafes.json && git commit -m "data: enrichment update" && git push`);
