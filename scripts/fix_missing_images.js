/**
 * Fetches images for the 3 cafes missing them, uploads to Cloudinary, updates cafes.json
 */
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const KEY = process.env.GOOGLE_PLACES_KEY;
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findPlaceId(name, suburb, lat, lng) {
  const q = encodeURIComponent(`${name} ${suburb} Melbourne`);
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id&locationbias=circle:1000@${lat},${lng}&key=${KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.candidates?.[0]?.place_id || null;
}

async function getPhotos(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result?.photos || [];
}

async function uploadFromGoogle(googlePhotoRef, publicId) {
  const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${googlePhotoRef}&key=${KEY}`;
  const result = await cloudinary.uploader.upload(googleUrl, {
    public_id: publicId, folder: 'melbcafes', overwrite: false,
    resource_type: 'image', fetch_format: 'auto', quality: 'auto',
  });
  return result.secure_url;
}

async function run() {
  const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const missing = cafes.filter(c => !c.images || c.images.length === 0);
  console.log('Fixing images for:', missing.map(c => c.name));

  for (const cafe of missing) {
    console.log(`\nProcessing: ${cafe.name}`);
    const placeId = await findPlaceId(cafe.name, cafe.suburb, cafe.latitude, cafe.longitude);
    if (!placeId) { console.log('  No place ID found'); continue; }
    console.log('  Place ID:', placeId);
    await sleep(300);

    const photos = await getPhotos(placeId);
    console.log('  Photos found:', photos.length);
    if (!photos.length) continue;

    const urls = [];
    for (let i = 0; i < Math.min(photos.length, 4); i++) {
      try {
        const url = await uploadFromGoogle(photos[i].photo_reference, `${cafe.id}_${i}`);
        urls.push(url);
        console.log(`  Uploaded ${i}: ${url}`);
        await sleep(200);
      } catch (e) {
        console.log(`  Upload ${i} failed:`, e.message);
      }
    }

    if (urls.length) {
      const idx = cafes.findIndex(c => c.id === cafe.id);
      cafes[idx].images = urls;
    }
  }

  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log('\nDone. cafes.json updated.');
}

run().catch(console.error);
