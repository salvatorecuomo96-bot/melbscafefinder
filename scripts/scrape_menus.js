/**
 * scrape_menus.js
 * Scrapes menu text from cafe websites.
 * Saves progress to data/menu_progress.json (resumable).
 * Run: node scripts/scrape_menus.js
 */

import fs   from 'fs';
import path from 'path';
import https from 'https';
import http  from 'http';
import { fileURLToPath } from 'url';
import { load } from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CAFES_FILE    = path.join(__dirname, '../public/cafes.json');
const PROGRESS_FILE = path.join(__dirname, '../data/menu_progress.json');
const OUT_FILE      = path.join(__dirname, '../data/menu_results.json');

const TIMEOUT_MS  = 8000;
const CONCURRENCY = 5;
const DELAY_MS    = 300;

const MENU_PATHS = [
  '/menu', '/menus', '/food', '/food-menu', '/drink-menu', '/drinks',
  '/our-menu', '/cafe-menu', '/breakfast', '/brunch', '/coffee',
  '/what-we-serve', '/eat', '/food-and-drink',
];

const MENU_LINK_RE = /\b(menu|food|drinks?|eat|brunch|breakfast|what we (serve|offer))\b/i;

// ── HTTP fetch ────────────────────────────────────────────────────────────────

function fetchUrl(url, timeoutMs = TIMEOUT_MS, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) return resolve(null);
    let parsed;
    try { parsed = new URL(url); } catch { return resolve(null); }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get({
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      headers:  {
        'User-Agent': 'Mozilla/5.0 (compatible; MelbCafeFinder/1.0)',
        Accept:       'text/html,application/pdf',
      },
      timeout: timeoutMs,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        try {
          const next = new URL(res.headers.location, url).href;
          return fetchUrl(next, timeoutMs, redirectCount + 1).then(resolve).catch(reject);
        } catch { return resolve(null); }
      }
      if (res.statusCode !== 200) return resolve(null);
      const ct = res.headers['content-type'] || '';
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end',  () => resolve({ body: Buffer.concat(chunks), contentType: ct }));
      res.on('error', reject);
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── HTML → clean text ─────────────────────────────────────────────────────────

function extractText(html) {
  const $ = load(html);
  $('script, style, noscript, header, footer, nav, iframe, form').remove();
  $('[class*="cookie"],[class*="popup"],[class*="modal"],[class*="banner"],[class*="newsletter"]').remove();

  const menuSelectors = [
    '[class*="menu"]', '[id*="menu"]',
    '[class*="food"]',  '[id*="food"]',
    '[class*="drink"]', '[id*="drink"]',
    'main', 'article', '.content', '#content',
  ];

  let text = '';
  for (const sel of menuSelectors) {
    const el = $(sel).first();
    if (el.length) {
      text = el.text();
      if (text.trim().length > 200) break;
    }
  }
  if (!text || text.trim().length < 100) text = $('body').text();

  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000);
}

// ── Find links on homepage ────────────────────────────────────────────────────

function findMenuLinks(html, baseUrl) {
  const $ = load(html);
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text();
    if (!href || /^(#|mailto:|tel:)/.test(href)) return;
    if (MENU_LINK_RE.test(text) || MENU_LINK_RE.test(href)) {
      try {
        const abs = new URL(href, baseUrl).href;
        if (new URL(abs).hostname === new URL(baseUrl).hostname) links.push(abs);
      } catch {}
    }
  });
  return [...new Set(links)].slice(0, 3);
}

function findPdfLinks(html, baseUrl) {
  const $ = load(html);
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.toLowerCase().endsWith('.pdf')) return;
    try { links.push(new URL(href, baseUrl).href); } catch {}
  });
  return links.slice(0, 2);
}

// ── PDF text extraction ───────────────────────────────────────────────────────

async function extractPdf(buf) {
  try {
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(buf);
    return data.text.replace(/\s+/g, ' ').trim().slice(0, 3000);
  } catch {
    return null;
  }
}

// ── Menu heuristic ────────────────────────────────────────────────────────────

function isLikelyMenu(text) {
  if (!text || text.length < 150) return false;
  const lower = text.toLowerCase();
  const hits = ['coffee', 'espresso', 'latte', 'cappuccino', 'flat white',
    'toast', 'eggs', 'avocado', 'smoothie', 'juice', 'cake', 'muffin',
    'sandwich', 'matcha', 'chai', 'oat milk', 'almond', 'soy',
    'croissant', 'pastry', 'breakfast', 'brunch', 'lunch', 'bowl',
    'wrap', 'salad', 'granola', 'acai', 'benedict', 'poached',
  ].filter(w => lower.includes(w)).length;
  return hits >= 3;
}

// ── Scrape one cafe ───────────────────────────────────────────────────────────

async function scrapeMenu(website) {
  const base = website.replace(/\/$/, '');

  let homeRes;
  try { homeRes = await fetchUrl(base); } catch { return null; }
  if (!homeRes) return null;

  const homeHtml = homeRes.body.toString('utf8');

  // Check for PDF links on homepage
  for (const pdfUrl of findPdfLinks(homeHtml, base)) {
    try {
      const res = await fetchUrl(pdfUrl);
      if (res?.contentType.includes('pdf')) {
        const text = await extractPdf(res.body);
        if (text && text.length > 100) return text;
      }
    } catch {}
  }

  // Try menu links found on homepage + common paths
  const menuLinks = findMenuLinks(homeHtml, base);
  const toTry = [...new Set([...menuLinks, ...MENU_PATHS.map(p => base + p)])].slice(0, 10);

  for (const url of toTry) {
    try {
      const res = await fetchUrl(url);
      if (!res) continue;
      if (res.contentType.includes('pdf')) {
        const text = await extractPdf(res.body);
        if (text && text.length > 150) return text;
      } else if (res.contentType.includes('html')) {
        const text = extractText(res.body.toString('utf8'));
        if (isLikelyMenu(text)) return text;
      }
    } catch {}
    await delay(80);
  }

  // Fall back: homepage itself
  const homeText = extractText(homeHtml);
  return isLikelyMenu(homeText) ? homeText : null;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = fs.existsSync(PROGRESS_FILE)
    ? JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
    : {};

  const withSite = cafes.filter(c => c.website);
  const todo     = withSite.filter(c => !(c.id in progress));

  console.log(`Total cafes:    ${cafes.length}`);
  console.log(`With website:   ${withSite.length}`);
  console.log(`Already done:   ${Object.keys(progress).length}`);
  console.log(`To scrape:      ${todo.length}\n`);

  let done = 0, found = 0;
  const save = () => fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (cafe) => {
      try {
        const text = await scrapeMenu(cafe.website);
        progress[cafe.id] = text || null;
        if (text) found++;
      } catch {
        progress[cafe.id] = null;
      }
      done++;
      process.stdout.write(`\r${done}/${todo.length} — ${found} menus found`);
    }));
    save();
    await delay(DELAY_MS);
  }

  save();
  console.log(`\n\nDone! ${found} menus found out of ${withSite.length} cafes with websites.`);

  // Write found-only results
  const results = Object.fromEntries(
    Object.entries(progress).filter(([, v]) => v)
  );
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Saved to data/menu_results.json`);
}

main().catch(console.error);
