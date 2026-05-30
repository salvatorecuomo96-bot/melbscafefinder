/**
 * google_find_instagram.js
 * For each cafe missing Instagram or Facebook, searches DuckDuckGo with site: operator
 * and extracts the profile URL from results (uddg= param).
 * Resumable via data/google_ig_progress.json
 * Run: node scripts/google_find_instagram.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/google_ig_progress.json');

const DELAY_MS = 1200;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36';

const FB_SKIP = ['sharer','share','login','dialog','events','groups','photo','video','watch','marketplace','gaming','help','policies','privacy','ads','business','reel','hashtag'];
const IG_SKIP = ['p','reel','explore','accounts','stories','tv','reels','instagram'];

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

async function ddgSearch(query) {
  const q = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${q}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await res.text();
    return [...html.matchAll(/uddg=(https?[^&"]+)/g)].map(m => decodeURIComponent(m[1]));
  } catch { return []; }
}

async function findInstagram(cafe) {
  const urls = await ddgSearch(`${cafe.name} ${cafe.suburb || ''} site:instagram.com`);
  for (const href of urls.filter(u => u.includes('instagram.com/'))) {
    const m = href.match(/instagram\.com\/([A-Za-z0-9_.]{2,})\/?(\?|$)/);
    if (!m) continue;
    if (IG_SKIP.includes(m[1].toLowerCase())) continue;
    return `https://instagram.com/${m[1]}`;
  }
  return null;
}

async function findFacebook(cafe) {
  await new Promise(r => setTimeout(r, DELAY_MS));
  const urls = await ddgSearch(`${cafe.name} ${cafe.suburb || ''} site:facebook.com`);
  for (const href of urls.filter(u => u.includes('facebook.com/'))) {
    const m = href.match(/facebook\.com\/([A-Za-z0-9_.%-]{3,})\/?(\?|$)/);
    if (!m) continue;
    const handle = m[1].toLowerCase();
    if (FB_SKIP.includes(handle)) continue;
    if (/^\d+$/.test(handle)) continue;
    return `https://facebook.com/${m[1]}`;
  }
  return null;
}

async function run() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes.filter(c => (!c.instagram || !c.facebook) && progress[c.id] === undefined);
  console.log(`Cafes missing Instagram or Facebook: ${targets.length}`);

  let igFound = 0, fbFound = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 40).padEnd(40)}`);

    const results = {};

    if (!cafe.instagram) {
      const ig = await findInstagram(cafe);
      results.instagram = ig || null;
      if (ig) {
        const idx = cafes.findIndex(c => c.id === cafe.id);
        cafes[idx].instagram = ig;
        igFound++;
        process.stdout.write(` IG:${ig.replace('https://instagram.com/', '@')}`);
      }
    }

    if (!cafe.facebook) {
      const fb = await findFacebook(cafe);
      results.facebook = fb || null;
      if (fb) {
        const idx = cafes.findIndex(c => c.id === cafe.id);
        cafes[idx].facebook = fb;
        fbFound++;
        process.stdout.write(` FB:${fb.replace('https://facebook.com/', '@')}`);
      }
    }

    progress[cafe.id] = results;
    process.stdout.write('\n');

    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — IG:${igFound} FB:${fbFound} found so far]`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));

  console.log(`\nDone. Instagram: +${igFound}, Facebook: +${fbFound}`);
  console.log(`Total IG: ${cafes.filter(c => c.instagram).length} | FB: ${cafes.filter(c => c.facebook).length}`);
}

run().catch(console.error);
