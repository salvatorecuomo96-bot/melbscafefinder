/**
 * Fetches missing images and/or hours for cafes that have gaps.
 * One Place Details call per cafe (fields: photos + opening_hours).
 * Uploads photos to Cloudinary. Resumable via data/fix_gaps_progress.json.
 * Run: node scripts/fix_gaps.js
 */
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const KEY       = process.env.GOOGLE_PLACES_KEY;
const CAFES     = path.join(__dirname, '../public/cafes.json');
const PROGRESS  = path.join(__dirname, '../data/fix_gaps_progress.json');
const DAYS      = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_MAP   = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); }
  catch { return {}; }
}

function extractPlaceId(url) {
  const m = (url || '').match(/query_place_id=([\w-]+)/);
  return m ? m[1] : null;
}

async function findPlaceId(name, suburb, lat, lng) {
  const q = encodeURIComponent(`${name} ${suburb} Melbourne`);
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id&locationbias=circle:500@${lat},${lng}&key=${KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.candidates?.[0]?.place_id || null;
}

async function getDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos,opening_hours&key=${KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result || {};
}

function parseHours(openingHours) {
  const result = {};
  if (!openingHours?.periods) return result;
  for (const period of openingHours.periods) {
    const day = DAYS[period.open?.day ?? -1];
    if (!day) continue;
    const open  = period.open?.time  ? `${period.open.time.slice(0,2)}:${period.open.time.slice(2)}` : null;
    const close = period.close?.time ? `${period.close.time.slice(0,2)}:${period.close.time.slice(2)}` : null;
    if (open && close) result[day] = `${open} - ${close}`;
    else if (open) result[day] = open;
  }
  return result;
}

async function uploadPhoto(ref, publicId) {
  const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${ref}&key=${KEY}`;
  const result = await cloudinary.uploader.upload(googleUrl, {
    public_id: publicId, folder: 'melbcafes', overwrite: false,
    resource_type: 'image', fetch_format: 'auto', quality: 'auto',
  });
  return result.secure_url;
}

async function run() {
  const cafes = JSON.parse(fs.readFileSync(CAFES, 'utf8'));
  const prog  = loadProgress();

  const targets = cafes.filter(c =>
    (prog[c.id] === undefined) &&
    ((!c.images || c.images.length === 0) || (!c.openingHours || Object.keys(c.openingHours).length === 0))
  );

  console.log(`Targets: ${targets.length} cafes need images or hours`);

  let i = 0;
  for (const cafe of targets) {
    i++;
    process.stdout.write(`\r${i}/${targets.length} | ${cafe.name.substring(0,40).padEnd(40)}`);

    try {
      // Get place_id
      let placeId = extractPlaceId(cafe.googleMapsUrl);
      if (!placeId) {
        placeId = await findPlaceId(cafe.name, cafe.suburb || '', cafe.latitude, cafe.longitude);
        await sleep(200);
      }

      if (!placeId) {
        prog[cafe.id] = 'no_place_id';
        continue;
      }

      const details = await getDetails(placeId);
      await sleep(250);

      const cafeIdx = cafes.findIndex(c => c.id === cafe.id);
      let updated = false;

      // Fix images
      if ((!cafe.images || cafe.images.length === 0) && details.photos?.length) {
        const urls = [];
        for (let j = 0; j < Math.min(details.photos.length, 4); j++) {
          try {
            const url = await uploadPhoto(details.photos[j].photo_reference, `${cafe.id}_${j}`);
            urls.push(url);
            await sleep(150);
          } catch { /* skip failed upload */ }
        }
        if (urls.length) { cafes[cafeIdx].images = urls; updated = true; }
      }

      // Fix hours
      if ((!cafe.openingHours || Object.keys(cafe.openingHours).length === 0) && details.opening_hours) {
        const hours = parseHours(details.opening_hours);
        if (Object.keys(hours).length) { cafes[cafeIdx].openingHours = hours; updated = true; }
      }

      prog[cafe.id] = updated ? 'fixed' : 'no_data';
    } catch (err) {
      prog[cafe.id] = 'error';
    }

    // Checkpoint every 20
    if (i % 20 === 0) {
      fs.writeFileSync(CAFES, JSON.stringify(cafes, null, 2));
      fs.writeFileSync(PROGRESS, JSON.stringify(prog, null, 2));
    }
  }

  fs.writeFileSync(CAFES, JSON.stringify(cafes, null, 2));
  fs.writeFileSync(PROGRESS, JSON.stringify(prog, null, 2));

  const fixed  = Object.values(prog).filter(v => v === 'fixed').length;
  const noData = Object.values(prog).filter(v => v === 'no_data').length;
  console.log(`\nDone. Fixed: ${fixed} | No data found: ${noData}`);
}

run().catch(console.error);
