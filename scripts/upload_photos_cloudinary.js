// Uploads all cafe photos from Google URLs to Cloudinary.
// Reads public/cafes.json, uploads each image, rewrites URLs, saves back.
// Run: node scripts/upload_photos_cloudinary.js
// Safe to re-run — skips images already uploaded via progress file.

import { v2 as cloudinary } from 'cloudinary';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '../.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const CAFES_PATH    = join(__dirname, '../public/cafes.json');
const PROGRESS_PATH = join(__dirname, '../data/cloudinary_progress.json');
const BATCH_SIZE    = 5;
const DELAY_MS      = 300;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadProgress() {
  try { return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')); }
  catch { return {}; }
}

function saveProgress(map) {
  mkdirSync(dirname(PROGRESS_PATH), { recursive: true });
  writeFileSync(PROGRESS_PATH, JSON.stringify(map, null, 2));
}

async function uploadImage(googleUrl, publicId) {
  const result = await cloudinary.uploader.upload(googleUrl, {
    public_id:     publicId,
    folder:        'melbcafes',
    overwrite:     false,
    resource_type: 'image',
    fetch_format:  'auto',
    quality:       'auto',
  });
  return result.secure_url;
}

async function main() {
  const cafes    = JSON.parse(readFileSync(CAFES_PATH, 'utf8'));
  const progress = loadProgress();

  const todo = [];
  for (const cafe of cafes) {
    if (!cafe.images?.length) continue;
    cafe.images.forEach((url, idx) => {
      if (!progress[url]) todo.push({ cafeId: cafe.id, url, idx });
    });
  }

  const totalImages = Object.keys(progress).length + todo.length;
  const alreadyDone = Object.keys(progress).length;
  console.log(`Total: ${totalImages} | Done: ${alreadyDone} | Remaining: ${todo.length}`);

  let uploaded = 0;
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async ({ cafeId, url, idx }) => {
      const publicId = `${cafeId}_${idx}`;
      try {
        const cloudUrl = await uploadImage(url, publicId);
        progress[url] = cloudUrl;
        uploaded++;
      } catch (err) {
        if (err.http_code === 400 && err.message?.includes('already exists')) {
          progress[url] = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/melbcafes/${publicId}`;
          uploaded++;
        } else {
          console.error(`\n  FAILED ${cafeId}[${idx}]: ${err.message}`);
          progress[url] = null;
        }
      }
    }));

    saveProgress(progress);
    const pct = Math.round(((alreadyDone + uploaded) / totalImages) * 100);
    process.stdout.write(`\r  Progress: ${alreadyDone + uploaded}/${totalImages} (${pct}%)   `);
    if (i + BATCH_SIZE < todo.length) await sleep(DELAY_MS);
  }

  console.log('\nRewriting cafes.json...');
  let replaced = 0;
  for (const cafe of cafes) {
    if (!cafe.images?.length) continue;
    cafe.images = cafe.images.map(url => {
      const mapped = progress[url];
      if (mapped) { replaced++; return mapped; }
      return url;
    });
  }

  writeFileSync(CAFES_PATH, JSON.stringify(cafes));
  console.log(`Done. ${replaced}/${totalImages} URLs replaced. cafes.json updated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
