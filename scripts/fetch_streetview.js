// Fetches Google Street View photos for cafes using lat/lng and uploads to Cloudinary.
// Only adds a photo if Street View coverage exists at that location.
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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  return { done: [], failed: [], no_coverage: [] };
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
}

async function checkCoverage(lat, lng) {
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${GOOGLE_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.status === 'OK';
  } catch {
    return false;
  }
}

async function uploadStreetView(lat, lng, publicId) {
  const photoUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${lat},${lng}&fov=90&pitch=10&key=${GOOGLE_KEY}`;
  try {
    const result = await cloudinary.uploader.upload(photoUrl, {
      public_id: publicId,
      folder: 'melbcafes',
      overwrite: false,
      resource_type: 'image',
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
  const failed = new Set(progress.failed);
  const noCoverage = new Set(progress.no_coverage || []);

  const targets = cafes.filter(
    (c) => c.latitude && c.longitude && !done.has(c.id) && !failed.has(c.id) && !noCoverage.has(c.id)
  );

  console.log(`Total with coords: ${cafes.filter(c => c.latitude).length}`);
  console.log(`Already done: ${done.size}, no coverage: ${noCoverage.size}, failed: ${failed.size}`);
  console.log(`Remaining: ${targets.length}`);

  let saved = 0, skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name} ... `);

    const hasCoverage = await checkCoverage(cafe.latitude, cafe.longitude);
    if (!hasCoverage) {
      process.stdout.write('no street view\n');
      noCoverage.add(cafe.id);
      saveProgress({ done: [...done], failed: [...failed], no_coverage: [...noCoverage] });
      skipped++;
      continue;
    }

    const publicId = `${cafe.id}_sv`;
    const cloudUrl = await uploadStreetView(cafe.latitude, cafe.longitude, publicId);
    if (!cloudUrl) {
      process.stdout.write('upload failed\n');
      failed.add(cafe.id);
      saveProgress({ done: [...done], failed: [...failed], no_coverage: [...noCoverage] });
      skipped++;
      continue;
    }

    const idx = cafes.findIndex((c) => c.id === cafe.id);
    if (idx !== -1) {
      const imgs = cafes[idx].images || [];
      if (!imgs.includes(cloudUrl)) {
        cafes[idx].images = [...imgs, cloudUrl];
      }
    }

    done.add(cafe.id);
    saveProgress({ done: [...done], failed: [...failed], no_coverage: [...noCoverage] });
    fs.writeFileSync(CAFES_PATH, JSON.stringify(cafes));
    saved++;
    process.stdout.write(`saved\n`);

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone. Added street view for ${saved} cafes, skipped ${skipped}.`);
}

main().catch(console.error);
