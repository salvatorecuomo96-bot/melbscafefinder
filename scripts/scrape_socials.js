/**
 * scrape_socials.js
 * Visits each cafe's website and extracts Instagram / Facebook / TikTok links.
 * Only runs on cafes that have a website. Resumable via data/socials_progress.json.
 * Run: node scripts/scrape_socials.js
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE    = path.join(__dirname, '../public/cafes.json');
const PROGRESS_FILE = path.join(__dirname, '../data/socials_progress.json');

const CONCURRENCY  = 6;
const NAV_TIMEOUT  = 10000;
const CAFE_TIMEOUT = 20000;

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
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

async function processOne(browser, cafe, progress) {
  if (progress[cafe.id] !== undefined) return;
  if (!cafe.website) return;
  const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), CAFE_TIMEOUT));
  try {
    await Promise.race([_scrape(browser, cafe, progress), deadline]);
  } catch {
    progress[cafe.id] = {};
  }
}

async function _scrape(browser, cafe, progress) {
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image','font','media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.goto(cafe.website, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await new Promise(r => setTimeout(r, 1500)); // wait for JS frameworks to render footer

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
    );

    const socials = extractSocials(links);
    progress[cafe.id] = socials;
    const found = Object.values(socials).filter(Boolean);
    if (found.length) process.stdout.write(` ✓ ${cafe.name}: ${found.join(', ')}\n`);
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function run() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();
  const withSite = cafes.filter(c => c.website);
  const remaining = withSite.filter(c => progress[c.id] === undefined);

  console.log(`With website: ${withSite.length} | Done: ${withSite.length - remaining.length} | Remaining: ${remaining.length}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let i = 0;
  while (i < remaining.length) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(cafe => processOne(browser, cafe, progress)));
    saveProgress(progress);
    i += CONCURRENCY;
    const found = Object.values(progress).filter(v => v?.instagram).length;
    process.stdout.write(`\r${i}/${remaining.length} scraped, ${found} instagram links found   `);
  }

  await browser.close();
  console.log('\n\nDone. Merging into cafes.json...');

  let patched = 0;
  for (const cafe of cafes) {
    const s = progress[cafe.id];
    if (!s) continue;
    if (!cafe.instagram && s.instagram) { cafe.instagram = s.instagram; patched++; }
    if (!cafe.facebook  && s.facebook)  cafe.facebook  = s.facebook;
    if (!cafe.tiktok    && s.tiktok)    cafe.tiktok    = s.tiktok;
  }

  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`Patched ${patched} cafes. Total instagram: ${cafes.filter(c => c.instagram).length}`);
}

run().catch(console.error);
