/**
 * screenshot_menus.js
 * For each cafe with a website, find the menu page, take a full-page screenshot,
 * upload to Cloudinary, and save the URL to data/menu_screenshots.json.
 * Resumable — skips already-done cafes.
 * Run: node scripts/screenshot_menus.js
 */

import puppeteer from 'puppeteer';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE    = path.join(__dirname, '../public/cafes.json');
const PROGRESS_FILE = path.join(__dirname, '../data/menu_screenshots.json');

const CONCURRENCY   = 3;
const NAV_TIMEOUT   = 15000;
const SCROLL_DELAY  = 800;

const MENU_PATHS = [
  '/menu', '/menus', '/our-menu', '/food-menu', '/food', '/eat',
  '/breakfast', '/brunch', '/food-and-drink', '/drinks', '/drink-menu',
  '/what-we-serve', '/cafe-menu',
];

cloudinary.config({
  cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
  api_key:     process.env.CLOUDINARY_API_KEY,
  api_secret:  process.env.CLOUDINARY_API_SECRET,
});

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return {}; }
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function findMenuPage(page, baseUrl) {
  const origin = new URL(baseUrl).origin;

  // First try: look for menu link on the homepage
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    const menuHref = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const re = /\b(menu|food|eat|brunch|breakfast|drinks?)\b/i;
      const match = links.find(a => re.test(a.textContent) || re.test(a.href));
      return match ? match.href : null;
    });
    if (menuHref) {
      const resolved = new URL(menuHref, baseUrl).href;
      if (resolved.startsWith(origin) || resolved.startsWith('http')) {
        return resolved;
      }
    }
  } catch { /* continue */ }

  // Second try: common menu paths
  for (const p of MENU_PATHS) {
    const url = origin + p;
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      if (res && res.ok()) return url;
    } catch { /* continue */ }
  }

  return null;
}

async function screenshotPage(page, url) {
  // Use domcontentloaded + short wait instead of networkidle2 (which hangs on analytics/ads forever)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await new Promise(r => setTimeout(r, 1500));

  // Dismiss cookie banners and popups
  await page.evaluate(() => {
    const selectors = [
      '[class*="cookie"]', '[class*="consent"]', '[id*="cookie"]',
      '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]',
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
  }).catch(() => {});

  // Scroll to load lazy content
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let y = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, 300);
        y += 300;
        if (y >= document.body.scrollHeight) { clearInterval(timer); resolve(); }
      }, 80);
    });
    window.scrollTo(0, 0);
  }).catch(() => {});

  await new Promise(r => setTimeout(r, SCROLL_DELAY));

  return page.screenshot({ fullPage: true, type: 'jpeg', quality: 85 });
}

async function uploadToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: 'melbcafes/menus', resource_type: 'image', overwrite: true },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    stream.end(buffer);
  });
}

async function processOne(browser, cafe, progress) {
  if (!cafe.website) return;
  const id = cafe.id;
  if (progress[id] !== undefined) return; // already done (even if null = no menu found)

  // Hard 30s timeout per cafe — prevents one slow site freezing the whole run
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('cafe timeout')), 30000));

  let page;
  try {
    await Promise.race([_processOneCafe(browser, cafe, progress), timeout]);
    return;
  } catch (err) {
    progress[id] = null;
    console.log(`✗ ${cafe.name}: ${err.message?.substring(0, 60)}`);
    return;
  }
}

async function _processOneCafe(browser, cafe, progress) {
  const id = cafe.id;
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

    const menuUrl = await findMenuPage(page, cafe.website);
    if (!menuUrl) {
      progress[id] = null;
      return;
    }

    const screenshot = await screenshotPage(page, menuUrl);
    const url = await uploadToCloudinary(screenshot, `menu_${id}`);
    progress[id] = { url, menuUrl };
    console.log(`✓ ${cafe.name} → ${url}`);
  } catch (err) {
    progress[id] = null;
    console.log(`✗ ${cafe.name}: ${err.message?.substring(0, 60)}`);
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function run() {
  const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const withWebsite = cafes.filter(c => c.website);
  const progress = loadProgress();

  const done = Object.keys(progress).length;
  const remaining = withWebsite.filter(c => progress[c.id] === undefined);
  console.log(`Total with website: ${withWebsite.length} | Done: ${done} | Remaining: ${remaining.length}`);

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

    const found = Object.values(progress).filter(v => v && v.url).length;
    const checked = Object.keys(progress).length;
    process.stdout.write(`\r${checked}/${withWebsite.length} checked, ${found} menus found`);
  }

  await browser.close();
  console.log('\nDone.');

  const found = Object.values(progress).filter(v => v && v.url);
  console.log(`\nMenus captured: ${found.length}`);
}

run().catch(console.error);
