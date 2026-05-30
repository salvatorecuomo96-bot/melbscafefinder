/**
 * google_find_instagram.js
 * Finds missing Instagram + Facebook for cafes using Serper.dev (Google results).
 * Resumable via data/google_ig_progress.json
 *
 * Setup: add SERPER_KEY=your_key to .env (get free key at serper.dev)
 * Run:   node scripts/google_find_instagram.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/google_ig_progress.json');

const API_KEY  = process.env.SERPER_KEY;
const DELAY_MS = 150;

const CBD = { lat: -37.8136, lng: 144.9631 };
const RADIUS_KM = 10;

function distKm(lat, lng) {
  const R = 6371;
  const dLat = (lat - CBD.lat) * Math.PI / 180;
  const dLng = (lng - CBD.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(CBD.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const FB_SKIP = ['sharer','share','login','dialog','events','groups','photo','video','watch','marketplace','gaming','help','policies','privacy','ads','business','reel','hashtag','permalink','profile.php','pages','search','about','home'];
const IG_SKIP = ['p','reel','explore','accounts','stories','tv','reels','instagram'];

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

async function serperSearch(query) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 5, gl: 'au' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Serper ${res.status}: ${err?.message || res.statusText}`);
  }
  const data = await res.json();
  return (data.organic || []).map(r => ({ link: r.link, title: r.title || '' })).filter(r => r.link);
}

// Returns true if title contains at least one meaningful word from the cafe name.
// If no meaningful words exist (very short name), always returns true.
function titleMatchesCafe(title, cafeName) {
  const words = cafeName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return true;
  const t = title.toLowerCase();
  return words.some(w => t.includes(w));
}

// Known chain names — reject if handle contains these
const CHAIN_BLOCKLIST = ['mcdonald', 'starbucks', '7eleven', 'subway', 'kfc', 'hungry', 'dominos', 'nandos'];

function extractIG(results, cafeName) {
  for (const { link, title } of results) {
    const m = link.match(/instagram\.com\/([A-Za-z0-9_.]{2,})\/?(\?|$)/);
    if (!m) continue;
    if (IG_SKIP.includes(m[1].toLowerCase())) continue;
    if (CHAIN_BLOCKLIST.some(c => m[1].toLowerCase().includes(c))) continue;
    // accept if title matches cafe name OR it's the first result from a site: query
    if (!titleMatchesCafe(title, cafeName) && !titleMatchesCafe(m[1], cafeName)) continue;
    return `https://instagram.com/${m[1]}`;
  }
  return null;
}

function extractFB(results, cafeName) {
  for (const { link, title } of results) {
    const m = link.match(/facebook\.com\/([A-Za-z0-9_.%-]{3,})\/?(\?|$)/);
    if (!m) continue;
    const handle = m[1].toLowerCase();
    if (FB_SKIP.includes(handle)) continue;
    if (/^\d+$/.test(handle)) continue;
    if (handle.startsWith('www') || /\.(com|au|net|org|co|php)/.test(handle)) continue;
    if (CHAIN_BLOCKLIST.some(c => handle.includes(c))) continue;
    if (!titleMatchesCafe(title, cafeName) && !titleMatchesCafe(handle, cafeName)) continue;
    return `https://facebook.com/${m[1]}`;
  }
  return null;
}

async function findInstagram(cafe) {
  const r1 = await serperSearch(`${cafe.name} ${cafe.suburb || ''} Melbourne site:instagram.com`);
  const ig1 = extractIG(r1, cafe.name);
  if (ig1) return ig1;
  await new Promise(r => setTimeout(r, DELAY_MS));
  const r2 = await serperSearch(`"${cafe.name}" Melbourne cafe instagram`);
  return extractIG(r2.filter(r => r.link.includes('instagram.com')), cafe.name);
}

async function findFacebook(cafe) {
  const results = await serperSearch(`${cafe.name} ${cafe.suburb || ''} Melbourne site:facebook.com`);
  return extractFB(results, cafe.name);
}

async function run() {
  if (!API_KEY) {
    console.error('Missing SERPER_KEY in .env — get a free key at serper.dev');
    process.exit(1);
  }

  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();
  const targets  = cafes.filter(c =>
    !c.instagram &&
    progress[c.id] === undefined &&
    distKm(c.latitude, c.longitude) <= RADIUS_KM
  );

  console.log(`Cafes to process: ${targets.length}`);

  let igFound = 0, fbFound = 0;
  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 40).padEnd(40)}`);

    const results = {};

    try {
      const ig = await findInstagram(cafe);
      results.instagram = ig || null;
      if (ig) {
        cafes.find(c => c.id === cafe.id).instagram = ig;
        igFound++;
        process.stdout.write(` IG:${ig.replace('https://instagram.com/', '@')}`);
      }
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (err) {
      process.stdout.write(` ERROR: ${err.message}`);
      results.error = err.message;
      // pause on error in case of rate limiting
      await new Promise(r => setTimeout(r, 2000));
    }

    progress[cafe.id] = results;
    process.stdout.write('\n');

    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — IG:+${igFound} FB:+${fbFound}]`);
    }
  }

  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));

  console.log(`\nDone. Instagram: +${igFound}`);
  console.log(`Total IG: ${cafes.filter(c => c.instagram).length}`);
}

run().catch(console.error);
