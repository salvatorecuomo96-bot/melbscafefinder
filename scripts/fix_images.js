/**
 * fix_images.js
 * Downloads each cafe's images, scores them for quality (sharpness + brightness),
 * removes bad ones (blurry/blank/dark), and reorders so best image is first.
 *
 * Quality scoring:
 *   - Laplacian variance → blur detection (low = blurry)
 *   - Pixel stdev → contrast/blank detection (low = blank/solid)
 *   - Mean brightness → dark/overexposed detection
 *
 * Run: node scripts/fix_images.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const PROG_FILE  = path.join(__dirname, '../data/image_quality_progress.json');

const CONCURRENCY  = 4;
const THUMB_SIZE   = 400; // download at 400px to save bandwidth

// Rejection thresholds
const MIN_STDEV       = 12;  // below = blank/solid colour
const MIN_BRIGHTNESS  = 25;  // below = too dark
const MAX_BRIGHTNESS  = 240; // above = overexposed/white
const MIN_LAPLACIAN   = 40;  // below = too blurry

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return {}; }
}

// Add Cloudinary transformation for smaller download
function thumbUrl(url) {
  return url.replace('/upload/', `/upload/w_${THUMB_SIZE},h_${THUMB_SIZE},c_fill,f_jpg/`);
}

async function fetchBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function scoreImage(url) {
  try {
    const buf = await fetchBuffer(thumbUrl(url));
    const img = sharp(buf);

    // Basic stats (brightness + contrast)
    const stats = await img.clone().grayscale().stats();
    const mean  = stats.channels[0].mean;
    const stdev = stats.channels[0].stdev;

    // Laplacian variance for blur detection
    const lapStats = await img.clone().grayscale().convolve({
      width: 3, height: 3,
      kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
    }).stats();
    const laplacian = lapStats.channels[0].stdev ** 2;

    const bad = stdev < MIN_STDEV || mean < MIN_BRIGHTNESS ||
                mean > MAX_BRIGHTNESS || laplacian < MIN_LAPLACIAN;

    // Score: higher = better quality
    const score = laplacian * 0.6 + stdev * 0.4;

    return { url, score, mean, stdev, laplacian, bad };
  } catch {
    return { url, score: 0, bad: true };
  }
}

async function processChunk(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const res = await Promise.all(batch.map(fn));
    results.push(...res);
  }
  return results;
}

async function run() {
  const cafes    = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const progress = loadProgress();

  const targets = cafes.filter(c =>
    c.images && c.images.length > 0 && progress[c.id] === undefined
  );

  console.log(`Cafes to process: ${targets.length}`);
  let removed = 0, reordered = 0;

  for (let i = 0; i < targets.length; i++) {
    const cafe = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${cafe.name.substring(0, 35).padEnd(35)}`);

    const scored = await processChunk(cafe.images, scoreImage, CONCURRENCY);
    const good   = scored.filter(s => !s.bad).sort((a, b) => b.score - a.score);
    const badCount = scored.length - good.length;

    if (badCount > 0) {
      const idx = cafes.findIndex(c => c.id === cafe.id);
      cafes[idx].images = good.map(s => s.url);
      removed += badCount;
      reordered++;
      process.stdout.write(` removed:${badCount} kept:${good.length}`);
    } else {
      // Still reorder by quality
      const idx = cafes.findIndex(c => c.id === cafe.id);
      cafes[idx].images = good.map(s => s.url);
    }

    process.stdout.write('\n');
    progress[cafe.id] = true;

    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
      console.log(`  [saved — ${removed} bad images removed so far]`);
    }
  }

  fs.writeFileSync(PROG_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2));
  console.log(`\nDone. Bad images removed: ${removed} | Cafes reordered: ${reordered}`);
}

run().catch(console.error);
