#!/usr/bin/env node
/**
 * prerender.js — post-build static SEO pages for a client-rendered SPA.
 * ---------------------------------------------------------------------------
 * Vite outputs one index.html for the whole app, so crawlers see no per-cafe
 * content. This runs AFTER `vite build` and, using dist/index.html as the
 * template (to inherit the hashed JS/CSS tags), writes a real HTML document for
 * every cafe and every suburb:
 *
 *   dist/cafe/{id}/index.html        unique title/desc/OG + CafeOrCoffeeShop JSON-LD
 *   dist/cafes/{suburb}/index.html   unique title/desc/OG + CollectionPage JSON-LD
 *   dist/sitemap.xml                 home + every suburb + every cafe
 *   dist/robots.txt
 *
 * Each page carries visible, crawlable content in #root; the SPA replaces it on
 * mount (createRoot().render clears #root, so no hydration mismatch) and the
 * path is read by Home.jsx to open the right cafe/suburb.
 *
 * Run:  node scripts/prerender.js   (or automatically via `npm run build`)
 * ---------------------------------------------------------------------------
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const BASE = 'https://kookabrew.au';
const DEFAULT_OG = `${BASE}/og-image.png`;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html not found — run `vite build` first.');
  process.exit(1);
}

const template = readFileSync(join(DIST, 'index.html'), 'utf-8');
const cafes = JSON.parse(readFileSync(join(ROOT, 'public/cafes.json'), 'utf-8'));

// ── helpers ──────────────────────────────────────────────────────────────────
const slugify = (s) => (s || '').toLowerCase().trim().replace(/&/g, 'and').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

const DAYS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function setHead(html, { title, description, canonical, ogImage, ogType = 'website' }) {
  let h = html;
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  h = h.replace(/(<meta name="description" content=")[\s\S]*?(")/, `$1${esc(description)}$2`);
  h = h.replace(/(<link rel="canonical" href=")[\s\S]*?(")/, `$1${esc(canonical)}$2`);
  h = h.replace(/(<meta property="og:type" content=")[\s\S]*?(")/, `$1${esc(ogType)}$2`);
  h = h.replace(/(<meta property="og:url" content=")[\s\S]*?(")/, `$1${esc(canonical)}$2`);
  h = h.replace(/(<meta property="og:title" content=")[\s\S]*?(")/, `$1${esc(title)}$2`);
  h = h.replace(/(<meta property="og:description" content=")[\s\S]*?(")/, `$1${esc(description)}$2`);
  h = h.replace(/(<meta property="og:image" content=")[\s\S]*?(")/, `$1${esc(ogImage)}$2`);
  h = h.replace(/(<meta name="twitter:title" content=")[\s\S]*?(")/, `$1${esc(title)}$2`);
  h = h.replace(/(<meta name="twitter:description" content=")[\s\S]*?(")/, `$1${esc(description)}$2`);
  h = h.replace(/(<meta name="twitter:image" content=")[\s\S]*?(")/, `$1${esc(ogImage)}$2`);
  return h;
}
// replace the loading splash with crawlable content + inject JSON-LD before </head>
function setBody(html, contentHtml, jsonLd) {
  let h = html.replace(/<div id="app-shell"[\s\S]*?<\/div>\s*<\/div>/, `<div id="ssg">${contentHtml}</div>\n    </div>`);
  const ld = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  return h.replace('</head>', `    ${ld}\n  </head>`);
}

function openingHoursSpec(oh) {
  if (!oh) return undefined;
  const spec = [];
  for (const [k, v] of Object.entries(oh)) {
    const day = DAYS[k.toLowerCase()];
    const m = String(v).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (day && m) spec.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: day, opens: m[1], closes: m[2] });
  }
  return spec.length ? spec : undefined;
}

// ── cafe pages ────────────────────────────────────────────────────────────────
let cafeCount = 0;
const cafeUrls = [];
for (const c of cafes) {
  if (!c.id) continue;
  const url = `${BASE}/cafe/${c.id}`;
  const img = c.images?.[0] || DEFAULT_OG;
  const ratingStr = c.rating ? `${c.rating}★${c.userRatingsTotal ? ` (${c.userRatingsTotal} reviews)` : ''}` : '';
  const title = `${c.name} — Cafe in ${c.suburb || 'Melbourne'} | Kookabrew`;
  const descBits = [
    `${c.name} is a cafe in ${c.suburb || 'Melbourne'}.`,
    ratingStr && `Rated ${ratingStr}.`,
    c.coffeeBrand && `Serving ${c.coffeeBrand} coffee.`,
    clip(c.description, 90),
  ].filter(Boolean);
  const description = clip(descBits.join(' '), 158);

  const hoursHtml = c.openingHours
    ? `<h2>Opening hours</h2><ul>${Object.entries(c.openingHours).map(([d, v]) => `<li>${esc(DAYS[d.toLowerCase()] || d)}: ${esc(v)}</li>`).join('')}</ul>`
    : '';
  const content = [
    `<h1>${esc(c.name)}</h1>`,
    `<p>Cafe in <a href="/cafes/${slugify(c.suburb)}">${esc(c.suburb || 'Melbourne')}</a>, Melbourne.</p>`,
    c.address && `<p>${esc(c.address)}</p>`,
    ratingStr && `<p>Rating: ${esc(ratingStr)}</p>`,
    c.coffeeBrand && `<p>Coffee: ${esc(c.coffeeBrand)}</p>`,
    c.description && `<p>${esc(c.description)}</p>`,
    c.images?.[0] && `<img src="${esc(c.images[0])}" alt="${esc(c.name)} in ${esc(c.suburb || 'Melbourne')}" width="600" height="400" />`,
    hoursHtml,
    c.website && `<p><a href="${esc(c.website)}" rel="nofollow noopener">Website</a></p>`,
    `<p><a href="/">Browse more Melbourne cafes on Kookabrew</a></p>`,
  ].filter(Boolean).join('\n');

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'CafeOrCoffeeShop',
    name: c.name, url, image: img, servesCuisine: 'Coffee',
    ...(c.address && { address: { '@type': 'PostalAddress', streetAddress: c.address, addressLocality: c.suburb, addressRegion: 'VIC', addressCountry: 'AU' } }),
    ...(c.latitude && c.longitude && { geo: { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude } }),
    ...(c.rating && c.userRatingsTotal && { aggregateRating: { '@type': 'AggregateRating', ratingValue: c.rating, reviewCount: c.userRatingsTotal } }),
    ...(c.phone && { telephone: c.phone }),
    ...(c.priceLevel && { priceRange: '$'.repeat(c.priceLevel) }),
    ...(openingHoursSpec(c.openingHours) && { openingHoursSpecification: openingHoursSpec(c.openingHours) }),
    ...((c.website || c.instagram) && { sameAs: [c.website, c.instagram].filter(Boolean) }),
  };

  let html = setHead(template, { title, description, canonical: url, ogImage: img, ogType: 'place' });
  html = setBody(html, content, jsonLd);
  const dir = join(DIST, 'cafe', c.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  cafeUrls.push(url);
  cafeCount++;
}

// ── suburb pages ──────────────────────────────────────────────────────────────
const bySuburb = {};
for (const c of cafes) { if (c.suburb) (bySuburb[c.suburb] ||= []).push(c); }
const suburbUrls = [];
for (const [suburb, list] of Object.entries(bySuburb)) {
  const slug = slugify(suburb);
  if (!slug) continue;
  const url = `${BASE}/cafes/${slug}`;
  const top = list.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const title = `Best Cafes in ${suburb}, Melbourne (${list.length}) | Kookabrew`;
  const description = clip(`Discover ${list.length} cafes in ${suburb}, Melbourne. Browse by rating, opening hours, and coffee brand on Kookabrew.`, 158);
  const ogImage = top.find((c) => c.images?.[0])?.images[0] || DEFAULT_OG;

  const content = [
    `<h1>Cafes in ${esc(suburb)}, Melbourne</h1>`,
    `<p>${list.length} cafes in ${esc(suburb)}.</p>`,
    `<ul>${top.slice(0, 60).map((c) => `<li><a href="/cafe/${c.id}">${esc(c.name)}</a>${c.rating ? ` — ${c.rating}★` : ''}</li>`).join('')}</ul>`,
    `<p><a href="/">Browse all Melbourne cafes on Kookabrew</a></p>`,
  ].join('\n');

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: `Cafes in ${suburb}, Melbourne`, url,
    mainEntity: {
      '@type': 'ItemList', numberOfItems: list.length,
      itemListElement: top.slice(0, 30).map((c, i) => ({
        '@type': 'ListItem', position: i + 1, url: `${BASE}/cafe/${c.id}`, name: c.name,
      })),
    },
  };

  let html = setHead(template, { title, description, canonical: url, ogImage });
  html = setBody(html, content, jsonLd);
  const dir = join(DIST, 'cafes', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  suburbUrls.push(url);
}

// ── sitemap.xml + robots.txt ────────────────────────────────────────────────
const today = new Date().toISOString().split('T')[0];
const u = (loc, pr, freq) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${pr}</priority>\n  </url>`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[u(`${BASE}/`, '1.0', 'daily'), ...suburbUrls.map((x) => u(x, '0.8', 'weekly')), ...cafeUrls.map((x) => u(x, '0.6', 'weekly'))].join('\n')}
</urlset>
`;
writeFileSync(join(DIST, 'sitemap.xml'), sitemap);
writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);

console.log(`✓ prerendered ${cafeCount} cafe pages, ${suburbUrls.length} suburb pages`);
console.log(`✓ sitemap.xml: ${1 + suburbUrls.length + cafeUrls.length} URLs · robots.txt written`);
