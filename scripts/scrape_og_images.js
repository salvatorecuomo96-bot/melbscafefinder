// Scrapes og:image / twitter:image from cafe websites and uploads to Cloudinary.
// Adds new photo as the 5th image for cafes that have a website.
// Run: node scripts/scrape_og_images.js

import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_PATH = path.join(__dirname, '../public/cafes.json');
const PROGRESS_PATH = path.join(__dirname, '../data/og_progress.json');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  return { done: [], failed: [] };
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
}

async function fetchOgImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CafeFinder/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    // Try og:image first, then twitter:image
    const patterns = [
      /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
      /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const imgUrl = match[1].trim();
        // Resolve relative URLs
        if (imgUrl.startsWith('http')) return imgUrl;
        if (imgUrl.startsWith('//')) return 'https:' + imgUrl;
        if (imgUrl.startsWith('/')) {
          const base = new URL(url);
          return base.origin + imgUrl;
        }
      }
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function uploadToCloudinary(imageUrl, publicId) {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      public_id: publicId,
      folder: 'melbcafes',
      overwrite: false,
      resource_type: 'image',
      transformation: [{ width: 800, height: 600, crop: 'fill', quality: 'auto:good' }],
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

  const targets = cafes.filter(
    (c) => c.website && !done.has(c.id) && !failed.has(c.id)
  );

  console.log(`Total with website: ${cafes.filter(c => c.website).length}`);
  console.log(`Already done: ${done.size}, failed: ${failed.size}`);
  console.log(`Remaining: ${targets.length}`);

  let saved = 0, skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name} ... `);

    const ogUrl = await fetchOgImage(cafe.website);
    if (!ogUrl) {
      process.stdout.write('no og:image\n');
      failed.add(cafe.id);
      saveProgress({ done: [...done], failed: [...failed] });
      skipped++;
      continue;
    }

    const publicId = `${cafe.id}_og`;
    const cloudUrl = await uploadToCloudinary(ogUrl, publicId);
    if (!cloudUrl) {
      process.stdout.write('upload failed\n');
      failed.add(cafe.id);
      saveProgress({ done: [...done], failed: [...failed] });
      skipped++;
      continue;
    }

    // Add to cafe's images if not already present
    const idx = cafes.findIndex((c) => c.id === cafe.id);
    if (idx !== -1) {
      const imgs = cafes[idx].images || [];
      if (!imgs.includes(cloudUrl)) {
        cafes[idx].images = [...imgs, cloudUrl];
      }
    }

    done.add(cafe.id);
    saveProgress({ done: [...done], failed: [...failed] });
    fs.writeFileSync(CAFES_PATH, JSON.stringify(cafes));
    saved++;
    process.stdout.write(`saved (${cafe.id}_og)\n`);

    // Polite delay
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\nDone. Added og:image for ${saved} cafes, skipped ${skipped}.`);
}

main().catch(console.error);
