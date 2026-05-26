// Fetches 4 Street View angles per cafe and uploads to Cloudinary.
// Completely free within Google's $200/month credit (~28k photos free).
// Run: node scripts/fetch_streetview.js

import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_PATH = path.join(__dirname, '../public/cafes.json');
const PROGRESS_PATH = path.join(__dirname, '../data/streetview_progress.json');

const GOOGLE_KEY = process.env.GOOGLE_PLACES_KEY;
const HEADINGS = [0, 90, 180, 270]; // 4 compass directions

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  return { done: [], no_coverage: [] };
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
}

async function checkCoverage(lat, lng) {
  try {
    const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.status === 'OK';
  } catch {
    return false;
  }
}

async function uploadStreetView(lat, lng, heading, publicId) {
  const photoUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${lat},${lng}&heading=${heading}&fov=90&pitch=5&key=${GOOGLE_KEY}`;
  try {
    const result = await cloudinary.uploader.upload(photoUrl, {
      public_id: publicId,
      folder: 'melbcafes',
      overwrite: false,
      resource_type: 'image',
      timeout: 20000,
    });
    return result.secure_url;
  } catch (err) {
    if (err.message?.includes('already exists')) {
      return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/melbcafes/${publicId}.jpg`;
    }
    return null;
  }
}

async function main() {
  const cafes = JSON.parse(fs.readFileSync(CAFES_PATH, 'utf8'));
  const progress = loadProgress();
  const done = new Set(progress.done);
  const noCoverage = new Set(progress.no_coverage || []);

  const targets = cafes.filter(
    c => c.latitude && c.longitude && !done.has(c.id) && !noCoverage.has(c.id)
  );

  console.log(`Total cafes: ${cafes.length}`);
  console.log(`Done: ${done.size}, no coverage: ${noCoverage.size}`);
  console.log(`Remaining: ${targets.length}`);
  console.log(`Estimated new photos: up to ${targets.length * 4}`);

  let totalAdded = 0;

  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name} ... `);

    const hasCoverage = await checkCoverage(cafe.latitude, cafe.longitude);
    if (!hasCoverage) {
      process.stdout.write('no street view\n');
      noCoverage.add(cafe.id);
      saveProgress({ done: [...done], no_coverage: [...noCoverage] });
      continue;
    }

    const idx = cafes.findIndex(c => c.id === cafe.id);
    const existing = new Set(cafes[idx].images || []);
    let added = 0;

    for (const heading of HEADINGS) {
      if (existing.size >= 9) break; // cap at 9 total
      const publicId = `${cafe.id}_sv${heading}`;
      const cloudUrl = await uploadStreetView(cafe.latitude, cafe.longitude, heading, publicId);
      if (cloudUrl && !existing.has(cloudUrl)) {
        existing.add(cloudUrl);
        added++;
      }
      await new Promise(r => setTimeout(r, 150));
    }

    cafes[idx].images = [...existing];
    done.add(cafe.id);
    saveProgress({ done: [...done], no_coverage: [...noCoverage] });
    fs.writeFileSync(CAFES_PATH, JSON.stringify(cafes));
    totalAdded += added;
    process.stdout.write(`+${added} street view shots (now ${cafes[idx].images.length} total)\n`);
  }

  console.log(`\nDone. Added ${totalAdded} street view photos across ${done.size} cafes.`);
}

main().catch(console.error);
