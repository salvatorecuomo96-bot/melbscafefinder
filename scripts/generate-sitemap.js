#!/usr/bin/env node
/**
 * Generates public/sitemap.xml from cafes.json.
 * Run via: node scripts/generate-sitemap.js
 * Or automatically as part of: npm run build
 *
 * Currently includes:
 *   - Homepage
 *   - Suburb pages (suburbs with >= 15 cafes)
 *
 * Add /cafes/:slug URLs here once those routes are implemented.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE_URL = 'https://kookabrew.au';
const MIN_CAFES_FOR_SUBURB_PAGE = 15;

const cafes = JSON.parse(readFileSync(join(ROOT, 'public/cafes.json'), 'utf-8'));

// Count cafes per suburb
const suburbCounts = {};
for (const cafe of cafes) {
  if (cafe.suburb) suburbCounts[cafe.suburb] = (suburbCounts[cafe.suburb] || 0) + 1;
}

// Only include suburbs with enough cafes to be a useful page
const qualifiedSuburbs = Object.entries(suburbCounts)
  .filter(([, count]) => count >= MIN_CAFES_FOR_SUBURB_PAGE)
  .map(([suburb]) => suburb)
  .sort();

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const today = new Date().toISOString().split('T')[0];

const urls = [
  // Homepage — highest priority
  `  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,

  // Suburb pages — once /suburbs/:suburb routes are implemented
  // Uncomment after adding react-router routes:
  // ...qualifiedSuburbs.map((suburb) => `  <url>
  //   <loc>${BASE_URL}/suburbs/${slugify(suburb)}</loc>
  //   <lastmod>${today}</lastmod>
  //   <changefreq>weekly</changefreq>
  //   <priority>0.8</priority>
  // </url>`),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

writeFileSync(join(ROOT, 'public/sitemap.xml'), xml);
console.log(`✓ sitemap.xml generated (${urls.length} URLs, ${qualifiedSuburbs.length} suburbs ready to unlock)`);
