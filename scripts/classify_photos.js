// Classifies cafe interior photos using Claude Haiku vision.
// Step 1: classify each photo as interior/exterior/food/drink/menu/other
// Step 2: from interior photos, determine atmosphere
// Pilot: top 500 cafes within 15km of CBD, sorted by review count desc.
// Output: data/photo_classification.json (don't merge until spot-checked)
// Cost: ~$2 for 500 cafes
// Usage: node scripts/classify_photos.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_PATH  = path.join(__dirname, '../public/cafes.json');
const OUTPUT_PATH = path.join(__dirname, '../data/photo_classification.json');

const CBD = { lat: -37.8136, lng: 144.9631 };
const RADIUS_KM = 15;
const PILOT_SIZE = 500;
const MAX_PHOTOS = 3; // per cafe — balances cost vs accuracy

const ATMOSPHERE_OPTIONS = [
  'bright_airy',    // Light, natural light, white/light tones
  'cosy_warm',      // Warm, wood, soft/warm lighting, intimate
  'sleek_modern',   // Contemporary, minimalist, clean lines
  'moody_intimate', // Dark, atmospheric, dim lighting
  'classic_cafe',   // Traditional cafe aesthetic
  'unknown',        // Can't tell from available photos
];

function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function pickPhotos(cafe) {
  // Prefer Cloudinary-hosted images (our scraped ones, reliably accessible)
  const cloudinary = (cafe.images || []).filter(u => u.includes('cloudinary'));
  const all = cafe.images || [];
  const pool = cloudinary.length >= 2 ? cloudinary : all;
  return pool.slice(0, MAX_PHOTOS);
}

function buildPrompt(cafeName) {
  return `These are photos from a Melbourne cafe called "${cafeName}".

For each photo (numbered 0, 1, 2...), classify it as one of: interior, exterior, food, drink, menu, people, other.

Then, based on the INTERIOR photos only, classify the atmosphere as one of:
- bright_airy: light-filled, airy, white or light-toned walls, natural light
- cosy_warm: warm tones, timber/wood, soft or warm lighting, intimate feel
- sleek_modern: contemporary, minimalist, clean lines, monochrome or industrial palette
- moody_intimate: dark, atmospheric, dim or moody lighting, dramatic
- classic_cafe: traditional neighbourhood cafe feel, timeless, unpretentious
- unknown: cannot determine from available photos (no usable interior shots)

Also note if outdoor seating is clearly visible in any photo.

Respond with ONLY valid JSON, no other text:
{
  "photos": [
    {"index": 0, "type": "interior|exterior|food|drink|menu|people|other"},
    {"index": 1, "type": "..."},
    {"index": 2, "type": "..."}
  ],
  "atmosphere": "${ATMOSPHERE_OPTIONS.join('|')}",
  "outdoorVisible": true,
  "confidence": "high|medium|low",
  "reasoning": "one short sentence explaining the atmosphere call"
}

confidence = high if 2+ clear interior shots, medium if 1 interior shot, low/none if no interior shots.`;
}

function parseResponse(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function classifyCafe(client, cafe, photos) {
  const imageContent = photos.map((url, i) => ({
    type: 'image',
    source: { type: 'url', url },
  }));

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        ...imageContent,
        { type: 'text', text: buildPrompt(cafe.name) },
      ],
    }],
  });

  return parseResponse(msg.content[0].text);
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

  const client = new Anthropic({ apiKey });
  const cafes = JSON.parse(fs.readFileSync(CAFES_PATH, 'utf8'));

  // Filter: within 15km, has images
  const inRange = cafes.filter(c => {
    if (!c.latitude || !c.longitude) return false;
    if (!c.images || c.images.length < 2) return false;
    return haversine(CBD, { lat: c.latitude, lng: c.longitude }) <= RADIUS_KM;
  });

  // Sort by review count desc, take top PILOT_SIZE
  const pilot = inRange
    .sort((a, b) => (b.userRatingsTotal || 0) - (a.userRatingsTotal || 0))
    .slice(0, PILOT_SIZE);

  console.log(`Pilot: ${pilot.length} cafes within ${RADIUS_KM}km of CBD`);
  console.log(`(filtered from ${inRange.length} cafes with 2+ images in range)\n`);

  // Load existing progress
  const results = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'))
    : {};

  const todo = pilot.filter(c => !results[c.id]);
  console.log(`Already done: ${pilot.length - todo.length}, Remaining: ${todo.length}\n`);

  let done = 0;
  let errors = 0;
  let totalCost = 0;

  for (const cafe of todo) {
    const photos = pickPhotos(cafe);
    process.stdout.write(`[${done + 1}/${todo.length}] ${cafe.name.slice(0, 35).padEnd(35)} `);

    try {
      const result = await classifyCafe(client, cafe, photos);
      const interiorCount = result.photos?.filter(p => p.type === 'interior').length || 0;

      results[cafe.id] = {
        name: cafe.name,
        suburb: cafe.suburb,
        atmosphere: result.atmosphere,
        outdoorVisible: result.outdoorVisible,
        confidence: result.confidence,
        reasoning: result.reasoning,
        photoTypes: result.photos,
        interiorCount,
        photosChecked: photos.length,
        processedAt: new Date().toISOString(),
      };

      // Rough cost estimate: ~$0.004 per call (3 images + prompt at Haiku pricing)
      totalCost += 0.004;
      console.log(`✓ ${result.atmosphere} (${result.confidence}) — ${interiorCount} interior`);
      done++;
    } catch (err) {
      console.log(`✗ ${err.message.slice(0, 60)}`);
      errors++;
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
    await sleep(400); // stay well within rate limits
  }

  // Summary
  const all = Object.values(results);
  const atmCounts = {};
  for (const r of all) {
    atmCounts[r.atmosphere] = (atmCounts[r.atmosphere] || 0) + 1;
  }

  console.log('\n========= DONE =========');
  console.log(`Processed: ${done} | Errors: ${errors}`);
  console.log(`Estimated cost: $${totalCost.toFixed(2)}`);
  console.log('\nAtmosphere breakdown:');
  Object.entries(atmCounts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(18)} ${v} (${Math.round(v/all.length*100)}%)`);
  });
  console.log(`\nResults saved to data/photo_classification.json`);
  console.log('Review and spot-check before merging into cafes.json.');
}

main().catch(console.error);
