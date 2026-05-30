/**
 * google_find_instagram.js
 * Finds missing Instagram + Facebook for cafes using Google Custom Search API.
 * Resumable via data/google_ig_progress.json
 *
 * Setup (one-time):
 *   1. Enable "Custom Search JSON API" in Google Cloud Console
 *   2. Create a search engine at programmablesearchengine.google.com
 *      → set it to search the whole web
 *      → copy the Search Engine ID (cx)
 *   3. Add to .env:
 *        GOOGLE_CSE_KEY=your_api_key
 *        GOOGLE_CX=your_cx_id
 *
 * Run: node scripts/google_find_instagram.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/google_ig_progress.json');

const API_KEY = process.env.GOOGLE_CSE_KEY;
const CX      = process.env.GOOGLE_CX;

const DELAY_MS = 200; // Google CSE allows ~10 req/sec on paid tier

const FB_SKIP = ['sharer','share','login','dialog','events','groups','photo','video','watch','marketplace','gaming','help','policies','privacy','ads','business','reel','hashtag','permalink'];
const IG_SKIP = ['p','reel','explore','accounts','stories','tv','reels','instagram'];

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

async function googleSearch(query) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${CX}&q=${encodeURIComponent(query)}&num=5`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google CSE ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return (data.items || []).map(i => i.link);
}

async function findInstagram(cafe) {
  const urls = await googleSearch(`${cafe.name} ${cafe.suburb || ''} Melbourne site:instagram.com`);
  for (const href of urls) {
    const m = href.match(/instagram\.com\/([A-Za-z0-9_.]{2,})\/?(\?|$)/);
    if (!m) continue;
    if (IG_SKIP.includes(m[1].toLowerCase())) continue;
    return `https://instagram.com/${m[1]}`;
  }
  return null;
}

async function findFacebook(cafe) {
  const urls = await googleSearch(`${cafe.name} ${cafe.suburb || ''} Melbourne site:facebook.com`);
  for (const href of urls) {
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
  if (!API_KEY || !CX) {
    console.error('Missing GOOGLE_CSE_KEY or GOOGLE_CX in .env');
    console.error('See setup instructions at the top of this file.');
    process.exit(1);
  }

  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes.filter(c => (!c.instagram || !c.facebook) && progress[c.id] === undefined);
  console.log(`Cafes missing Instagram or Facebook: ${targets.length}`);

  let igFound = 0, fbFound = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 40).padEnd(40)}`);

    const results = {};

    try {
      if (!cafe.instagram) {
        const ig = await findInstagram(cafe);
        results.instagram = ig || null;
        if (ig) {
          cafes.find(c => c.id === cafe.id).instagram = ig;
          igFound++;
          process.stdout.write(` IG:${ig.replace('https://instagram.com/', '@')}`);
        }
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      if (!cafe.facebook) {
        const fb = await findFacebook(cafe);
        results.facebook = fb || null;
        if (fb) {
          cafes.find(c => c.id === cafe.id).facebook = fb;
          fbFound++;
          process.stdout.write(` FB:${fb.replace('https://facebook.com/', '@')}`);
        }
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    } catch (err) {
      process.stdout.write(` ERROR: ${err.message}`);
      results.error = err.message;
    }

    progress[cafe.id] = results;
    process.stdout.write('\n');

    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — IG:${igFound} FB:${fbFound} found so far]`);
    }
  }

  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));

  console.log(`\nDone. Instagram: +${igFound}, Facebook: +${fbFound}`);
  console.log(`Total IG: ${cafes.filter(c => c.instagram).length} | FB: ${cafes.filter(c => c.facebook).length}`);
}

run().catch(console.error);
