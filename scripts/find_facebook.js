/**
 * find_facebook.js
 * Finds Facebook pages for cafes within 10km of CBD that have no social at all.
 * Uses Serper.dev (Google results).
 * Run: node scripts/find_facebook.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/fb_progress.json');

const API_KEY  = process.env.SERPER_KEY;
const DELAY_MS = 200;

const CBD = { lat: -37.8136, lng: 144.9631 };
const RADIUS_KM = 10;

function distKm(lat, lng) {
  const R = 6371, dLat = (lat - CBD.lat) * Math.PI / 180, dLng = (lng - CBD.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(CBD.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const FB_SKIP = ['sharer','share','login','dialog','events','groups','photo','video','watch',
  'marketplace','gaming','help','policies','privacy','ads','business','reel','hashtag',
  'permalink','profile.php','pages','search','about','home'];
const CHAIN_BLOCKLIST = ['mcdonald','starbucks','7eleven','subway','kfc','hungry','dominos','nandos'];

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

function titleMatchesCafe(title, cafeName) {
  const words = cafeName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return true;
  return words.some(w => title.toLowerCase().includes(w));
}

async function serperSearch(query) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 5, gl: 'au' }),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}`);
  const data = await res.json();
  return (data.organic || []).map(r => ({ link: r.link, title: r.title || '' })).filter(r => r.link);
}

async function findFacebook(cafe) {
  const results = await serperSearch(`${cafe.name} ${cafe.suburb || ''} Melbourne site:facebook.com`);
  for (const { link, title } of results) {
    const m = link.match(/facebook\.com\/([A-Za-z0-9_.%-]{3,})\/?(\?|$)/);
    if (!m) continue;
    const handle = m[1].toLowerCase();
    if (FB_SKIP.includes(handle)) continue;
    if (/^\d+$/.test(handle)) continue;
    if (handle.startsWith('www') || /\.(com|au|net|org|co|php)/.test(handle)) continue;
    if (CHAIN_BLOCKLIST.some(c => handle.includes(c))) continue;
    if (!titleMatchesCafe(title, cafe.name) && !titleMatchesCafe(handle, cafe.name)) continue;
    return `https://facebook.com/${m[1]}`;
  }
  return null;
}

async function run() {
  if (!API_KEY) { console.error('Missing SERPER_KEY in .env'); process.exit(1); }

  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();
  const targets  = cafes.filter(c =>
    !c.instagram && !c.facebook &&
    progress[c.id] === undefined &&
    distKm(c.latitude, c.longitude) <= RADIUS_KM
  );

  console.log(`Cafes with no social within 10km: ${targets.length}`);
  let found = 0;

  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 40).padEnd(40)}`);

    try {
      const fb = await findFacebook(cafe);
      progress[cafe.id] = fb || null;
      if (fb) {
        cafes.find(c => c.id === cafe.id).facebook = fb;
        found++;
        process.stdout.write(` FB:${fb.replace('https://facebook.com/', '@')}`);
      }
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (err) {
      process.stdout.write(` ERROR: ${err.message}`);
      progress[cafe.id] = null;
    }

    process.stdout.write('\n');

    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${found} found so far]`);
    }
  }

  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. Facebook found: +${found}`);
}

run().catch(console.error);
