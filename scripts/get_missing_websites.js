/**
 * get_missing_websites.js
 * For cafes with no website, calls Google Place Details to get their website URL.
 * Then runs the social scraper on newly found websites to get Instagram links.
 *
 * Cost: ~640 Place Details calls × $0.017 = ~$11
 * Run: node scripts/get_missing_websites.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
dotenv.config();

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/missing_websites_progress.json');
const SOC_FILE   = path.join(__dirname, '../data/socials_progress.json');

const KEY = process.env.GOOGLE_PLACES_KEY;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractPlaceId(url) {
  const m = (url || '').match(/query_place_id=([\w-]+)/);
  return m ? m[1] : null;
}

function extractSocials(links) {
  let instagram = null, facebook = null, tiktok = null;
  for (const href of links) {
    if (!href) continue;
    const h = href.toLowerCase();
    if (!instagram && h.includes('instagram.com/')) {
      const m = href.match(/instagram\.com\/([A-Za-z0-9_.]{2,})\/?(\?|$)/);
      if (m && !['p','reel','explore','accounts','stories','tv','reels'].includes(m[1].toLowerCase())) {
        instagram = `https://instagram.com/${m[1]}`;
      }
    }
    if (!facebook && h.includes('facebook.com/')) {
      const m = href.match(/facebook\.com\/([A-Za-z0-9_.%-]{3,})\/?(\?|$)/);
      if (m && !['sharer','share','login','dialog','pages','events','groups','photo','video'].includes(m[1].toLowerCase())) {
        facebook = `https://facebook.com/${m[1]}`;
      }
    }
    if (!tiktok && h.includes('tiktok.com/@')) {
      const m = href.match(/tiktok\.com\/@([A-Za-z0-9_.]{2,})\/?(\?|$)/);
      if (m && m[1] !== 'tiktok') tiktok = `https://tiktok.com/@${m[1]}`;
    }
  }
  return { instagram, facebook, tiktok };
}

async function getWebsite(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website&key=${KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result?.website || null;
}

async function scrapeForSocials(browser, website) {
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36');
    await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await new Promise(r => setTimeout(r, 1500));
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
    );
    return extractSocials(links);
  } catch { return {}; }
  finally { if (page) await page.close().catch(() => {}); }
}

async function run() {
  if (!KEY) { console.error('GOOGLE_PLACES_KEY not set'); process.exit(1); }

  const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const prog  = fs.existsSync(PROG_FILE) ? JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')) : {};
  const socProg = fs.existsSync(SOC_FILE) ? JSON.parse(fs.readFileSync(SOC_FILE, 'utf8')) : {};

  // Target: cafes with no website and no instagram
  const targets = cafes.filter(c => !c.website && !c.instagram && prog[c.id] === undefined);
  console.log(`Cafes needing website lookup: ${targets.length}`);

  // Phase 1: Get websites from Place Details
  let found = 0;
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    process.stdout.write(`\r[${i+1}/${targets.length}] ${c.name.substring(0,40).padEnd(40)}`);

    const placeId = extractPlaceId(c.googleMapsUrl);
    if (!placeId) { prog[c.id] = null; continue; }

    try {
      const website = await getWebsite(placeId);
      prog[c.id] = website || null;
      if (website) {
        const idx = cafes.findIndex(x => x.id === c.id);
        cafes[idx].website = website;
        found++;
      }
    } catch (e) {
      prog[c.id] = null;
    }

    await sleep(120);
    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(prog, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
    }
  }

  fs.writeFileSync(PROG_FILE, JSON.stringify(prog, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nFound websites for ${found}/${targets.length} cafes`);

  // Phase 2: Scrape newly found websites for Instagram
  const toScrape = cafes.filter(c => c.website && !c.instagram && socProg[c.id] === undefined);
  console.log(`\nScraping ${toScrape.length} new websites for Instagram...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let patched = 0;
  for (let i = 0; i < toScrape.length; i++) {
    const c = toScrape[i];
    process.stdout.write(`\r[${i+1}/${toScrape.length}] ${c.name.substring(0,40).padEnd(40)}`);
    const socials = await scrapeForSocials(browser, c.website);
    socProg[c.id] = socials;

    const idx = cafes.findIndex(x => x.id === c.id);
    if (!cafes[idx].instagram && socials.instagram) { cafes[idx].instagram = socials.instagram; patched++; }
    if (!cafes[idx].facebook  && socials.facebook)   cafes[idx].facebook  = socials.facebook;
    if (!cafes[idx].tiktok    && socials.tiktok)      cafes[idx].tiktok    = socials.tiktok;

    if (socials.instagram) process.stdout.write(` ✓ ${socials.instagram}\n`);
    if ((i + 1) % 30 === 0) {
      fs.writeFileSync(SOC_FILE, JSON.stringify(socProg, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
    }
  }

  await browser.close();
  fs.writeFileSync(SOC_FILE, JSON.stringify(socProg, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));

  console.log(`\nInstagram links found: ${patched}`);
  console.log(`Total instagram: ${cafes.filter(c => c.instagram).length}`);
  console.log('\nRun: git add public/cafes.json && git commit -m "data: add instagram from google place websites" && git push');
}

run().catch(console.error);
