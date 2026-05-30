/**
 * gmaps_menu_screenshot.js
 * For each cafe, opens Google Maps, finds the Menu section,
 * screenshots it, uploads to Cloudinary, saves URL to cafe.menuImages.
 *
 * Run: node scripts/gmaps_menu_screenshot.js
 */
import puppeteer from 'puppeteer';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/gmaps_menu_progress.json');

const CBD = { lat: -37.8136, lng: 144.9631 };
const RADIUS_KM = 10;

function distKm(lat, lng) {
  const R=6371, dLat=(lat-CBD.lat)*Math.PI/180, dLng=(lng-CBD.lng)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(CBD.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function extractPlaceId(mapsUrl) {
  const m = mapsUrl.match(/query_place_id=([^&]+)/);
  return m ? m[1] : null;
}

async function getMenuScreenshot(page, cafe) {
  const placeId = extractPlaceId(cafe.googleMapsUrl);
  if (!placeId) return null;

  // Navigate to the place directly
  const url = `https://www.google.com/maps/place/?q=place_id:${placeId}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2000));

  // Look for Menu tab/button
  const menuBtn = await page.$x(`//button[contains(., 'Menu')] | //a[contains(., 'Menu')]`);
  if (!menuBtn.length) {
    // Try clicking on "See menu" or "Menu" link
    const menuLink = await page.$('[data-tab-index][aria-label*="Menu"], [aria-label*="menu"]');
    if (!menuLink) return null;
    await menuLink.click();
    await new Promise(r => setTimeout(r, 1500));
  } else {
    await menuBtn[0].click();
    await new Promise(r => setTimeout(r, 1500));
  }

  // Find the menu panel
  const menuPanel = await page.$('[class*="menu"], [aria-label*="Menu"]');
  if (!menuPanel) return null;

  const box = await menuPanel.boundingBox();
  if (!box || box.height < 100) return null;

  // Screenshot just the menu area
  const buffer = await page.screenshot({
    clip: { x: box.x, y: box.y, width: Math.min(box.width, 600), height: Math.min(box.height, 1200) },
  });

  // Upload to Cloudinary
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'melbcafes/menus', public_id: `${cafe.id}_menu` },
      (err, res) => err ? reject(err) : resolve(res)
    ).end(buffer);
  });

  return result.secure_url;
}

async function run() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes.filter(c =>
    c.googleMapsUrl &&
    !c.menuImages?.length &&
    progress[c.id] === undefined &&
    distKm(c.latitude, c.longitude) <= RADIUS_KM
  );

  console.log(`Cafes to process: ${targets.length}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-AU'],
  });

  let found = 0;

  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i+1}/${targets.length}] ${cafe.name.substring(0,40).padEnd(40)}`);

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });

      const menuUrl = await getMenuScreenshot(page, cafe);
      await page.close();

      progress[cafe.id] = menuUrl || null;

      if (menuUrl) {
        const idx = cafes.findIndex(c => c.id === cafe.id);
        cafes[idx].menuImages = [menuUrl];
        found++;
        process.stdout.write(` ✓`);
      }
    } catch (err) {
      progress[cafe.id] = null;
      process.stdout.write(` skip: ${err.message.substring(0,40)}`);
    }

    process.stdout.write('\n');

    if ((i+1) % 20 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${found} menus found]`);
    }
  }

  await browser.close();
  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. Menus found: ${found}`);
}

run().catch(console.error);
