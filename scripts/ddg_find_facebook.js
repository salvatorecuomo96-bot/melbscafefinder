/**
 * ddg_find_facebook.js
 * Searches DuckDuckGo for each cafe without Facebook using two strategies:
 *   1. site:facebook.com query
 *   2. fallback: plain "{name} {suburb} Melbourne facebook" query
 * Retries on timeout. Resumable via data/ddg_fb_progress.json
 * Run: node scripts/ddg_find_facebook.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/ddg_fb_progress.json');

const DELAY_MS   = 1500;
const TIMEOUT_MS = 12000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36';

const SKIP_PATHS = ['sharer','share','login','dialog','events','groups','photo','video','watch',
  'marketplace','gaming','help','policies','privacy','about','ads','business','reel','hashtag','permalink'];

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

async function ddgSearch(query, retries = 2) {
  const q = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${q}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
      clearTimeout(timer);
      const html = await res.text();
      return [...html.matchAll(/uddg=(https?[^&"]+)/g)].map(m => decodeURIComponent(m[1]));
    } catch {
      if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return [];
}

function extractFacebook(urls) {
  for (const href of urls.filter(u => u.includes('facebook.com/'))) {
    const m = href.match(/facebook\.com\/([A-Za-z0-9_.%-]{3,})\/?(\?|$)/);
    if (!m) continue;
    const handle = m[1].toLowerCase();
    if (SKIP_PATHS.includes(handle)) continue;
    if (/^\d+$/.test(handle)) continue;
    return `https://facebook.com/${m[1]}`;
  }
  return null;
}

async function findFacebook(cafe) {
  // Strategy 1: site: filter
  const urls1 = await ddgSearch(`${cafe.name} ${cafe.suburb || ''} site:facebook.com`);
  const fb1 = extractFacebook(urls1);
  if (fb1) return fb1;

  await new Promise(r => setTimeout(r, DELAY_MS));

  // Strategy 2: plain search with "facebook" keyword — picks up FB links in regular results
  const urls2 = await ddgSearch(`"${cafe.name}" ${cafe.suburb || ''} Melbourne facebook`);
  return extractFacebook(urls2);
}

async function run() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes.filter(c => !c.facebook && progress[c.id] === undefined);
  console.log(`Cafes without Facebook: ${targets.length}`);

  let found = 0, errors = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 45).padEnd(45)}`);

    const fb = await findFacebook(cafe);
    progress[cafe.id] = fb || null;

    if (fb) {
      const idx = cafes.findIndex(c => c.id === cafe.id);
      cafes[idx].facebook = fb;
      found++;
      process.stdout.write(` ✓ ${fb}\n`);
    } else {
      process.stdout.write(` –\n`);
    }

    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${found} found so far, ${errors} timeouts]`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));

  console.log(`\nDone. Found Facebook for ${found}/${targets.length} cafes.`);
  console.log(`Total with Facebook: ${cafes.filter(c => c.facebook).length}`);
}

run().catch(console.error);
