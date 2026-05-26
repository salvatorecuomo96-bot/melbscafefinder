// Scrapes up to 5 images per cafe website (og:image, schema.org, large page imgs)
// and uploads each to Cloudinary. Resumes from progress file.
// Run: node scripts/scrape_og_images.js

import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_PATH = path.join(__dirname, '../public/cafes.json');
const PROGRESS_PATH = path.join(__dirname, '../data/og_progress.json');
const MAX_IMAGES_PER_CAFE = 5;

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

function resolveUrl(imgUrl, pageUrl) {
  if (!imgUrl) return null;
  imgUrl = imgUrl.trim();
  if (imgUrl.startsWith('http')) return imgUrl;
  if (imgUrl.startsWith('//')) return 'https:' + imgUrl;
  try {
    const base = new URL(pageUrl);
    if (imgUrl.startsWith('/')) return base.origin + imgUrl;
    return base.origin + '/' + imgUrl;
  } catch {
    return null;
  }
}

function isJunkUrl(url) {
  if (!url) return true;
  const low = url.toLowerCase();
  // Skip logos, icons, avatars, tiny thumbnails, SVGs, tracking pixels
  if (/\.(svg|gif|ico|webp)(\?|$)/i.test(low)) return true;
  if (/(logo|icon|favicon|avatar|sprite|pixel|blank|placeholder|badge|button|arrow|close|menu|nav|header|footer|social|twitter|facebook|instagram|youtube|linkedin|pinterest)/i.test(low)) return true;
  return false;
}

async function extractImages(pageUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CafeFinder/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();
    const found = new Set();

    // 1. og:image (may appear multiple times)
    const ogPattern = /(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image/gi;
    for (const m of html.matchAll(ogPattern)) {
      const u = resolveUrl(m[1] || m[2], pageUrl);
      if (u && !isJunkUrl(u)) found.add(u);
    }

    // 2. twitter:image
    const twitterPattern = /(?:property|name)=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*(?:property|name)=["']twitter:image/gi;
    for (const m of html.matchAll(twitterPattern)) {
      const u = resolveUrl(m[1] || m[2], pageUrl);
      if (u && !isJunkUrl(u)) found.add(u);
    }

    // 3. JSON-LD schema.org images
    const jsonldPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    for (const m of html.matchAll(jsonldPattern)) {
      try {
        const data = JSON.parse(m[1]);
        const imgs = [].concat(
          data.image, data.photo, data.logo,
          data['@graph']?.flatMap(n => [n.image, n.photo]).flat()
        ).flat().filter(Boolean);
        for (const img of imgs) {
          const src = typeof img === 'string' ? img : img?.url || img?.contentUrl;
          const u = resolveUrl(src, pageUrl);
          if (u && !isJunkUrl(u)) found.add(u);
        }
      } catch { /* invalid JSON */ }
    }

    // 4. Large img tags — data-src (lazy load), src, srcset first entry
    const imgPattern = /<img[^>]+(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["'][^>]*>/gi;
    for (const m of html.matchAll(imgPattern)) {
      const u = resolveUrl(m[1], pageUrl);
      if (!u || isJunkUrl(u)) continue;
      // Skip tiny images — heuristic: reject URLs with dimension hints showing small size
      if (/[-_x](?:[1-9]\d?|[1-9])\b/.test(u) && !/[-_x][3-9]\d{2,}/.test(u)) continue;
      found.add(u);
    }

    return [...found].slice(0, MAX_IMAGES_PER_CAFE);
  } catch {
    clearTimeout(timer);
    return [];
  }
}

async function uploadOne(imgUrl, publicId) {
  try {
    const result = await cloudinary.uploader.upload(imgUrl, {
      public_id: publicId,
      folder: 'melbcafes',
      overwrite: false,
      resource_type: 'image',
      transformation: [{ width: 900, height: 675, crop: 'fill', quality: 'auto:good' }],
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
  const failed = new Set(progress.failed);

  // Process cafes that haven't been done yet (skip permanently failed with no website)
  const targets = cafes.filter(c => c.website && !done.has(c.id));

  console.log(`Total with website: ${cafes.filter(c => c.website).length}`);
  console.log(`Already done: ${done.size}, failed (retrying): ${failed.size}`);
  console.log(`Remaining: ${targets.length}`);

  let totalAdded = 0;

  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name} ... `);

    const imgUrls = await extractImages(cafe.website);
    if (imgUrls.length === 0) {
      process.stdout.write('no images\n');
      failed.add(cafe.id);
      saveProgress({ done: [...done], failed: [...failed] });
      continue;
    }

    const idx = cafes.findIndex(c => c.id === cafe.id);
    const existing = new Set(cafes[idx].images || []);
    let added = 0;

    for (let j = 0; j < imgUrls.length; j++) {
      if (existing.size >= 9) break; // cap total photos at 9
      const publicId = `${cafe.id}_w${j}`;
      const cloudUrl = await uploadOne(imgUrls[j], publicId);
      if (cloudUrl && !existing.has(cloudUrl)) {
        existing.add(cloudUrl);
        added++;
      }
    }

    cafes[idx].images = [...existing];
    done.add(cafe.id);
    failed.delete(cafe.id);
    saveProgress({ done: [...done], failed: [...failed] });
    fs.writeFileSync(CAFES_PATH, JSON.stringify(cafes));
    totalAdded += added;
    process.stdout.write(`+${added} images (now ${cafes[idx].images.length} total)\n`);

    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`\nDone. Added ${totalAdded} images total across ${done.size} cafes.`);
}

main().catch(console.error);
