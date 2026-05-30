/**
 * Looks up late-night cafes via Google Places Text Search + Place Details,
 * then appends them to public/cafes.json.
 * Run: node scripts/add_late_cafes.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');
const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) { console.error('GOOGLE_PLACES_KEY missing'); process.exit(1); }

// ── Manually-provided entries (full data already known) ──────────────────────
const MANUAL_ENTRIES = [
  {
    id: 'pellegrinis-espresso-bar-melbourne',
    name: "Pellegrini's Espresso Bar",
    suburb: 'Melbourne',
    address: '66 Bourke Street, Melbourne VIC 3000, Australia',
    latitude: -37.8136,
    longitude: 144.9696,
    rating: 4.4,
    userRatingsTotal: 3200,
    reviewCount: 3200,
    phone: '(03) 9662 1885',
    website: 'https://www.facebook.com/pages/Pellegrinis-Espresso-Bar/146032138772817',
    openingHours: {
      mon: '08:00 - 21:00', tue: '08:00 - 21:00', wed: '08:00 - 21:00',
      thu: '08:00 - 21:00', fri: '08:00 - 22:00', sat: '08:00 - 22:00',
    },
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Pellegrini's%20Melbourne&query_place_id=ChIJlfjfvchC1moRCNO0EIFZ1vo",
  },
  {
    id: 'tamisweet-melbourne',
    name: 'TamiSweet',
    suburb: 'Melbourne',
    address: '145 Lonsdale Street, Melbourne VIC 3000, Australia',
    latitude: -37.8098,
    longitude: 144.9686,
    rating: 4.3,
    userRatingsTotal: 480,
    reviewCount: 480,
    phone: '0451 268 268',
    website: 'https://www.facebook.com/profile.php?id=100063638080309',
    openingHours: {
      mon: '08:00 - 19:00', tue: '08:00 - 19:00', wed: '08:00 - 19:00',
      thu: '08:00 - 19:00', fri: '08:00 - 21:00',
      sat: '09:00 - 21:00', sun: '09:00 - 19:00',
    },
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tami%20Sweet%20Melbourne&query_place_id=ChIJuzcI1WhD1moRCgZFl5ZiAgw',
  },
  {
    id: 'sulbing-dessert-cafe-melbourne',
    name: 'Sulbing Dessert Cafe',
    suburb: 'Melbourne',
    address: '168 Lonsdale Street, Melbourne VIC 3000, Australia',
    latitude: -37.8094,
    longitude: 144.9687,
    rating: 4.1,
    userRatingsTotal: 1425,
    reviewCount: 1425,
    phone: '(03) 9957 1835',
    website: 'https://www.sulbingcafe.com.au/',
    openingHours: {},
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Sulbing%20168%20Lonsdale%20Melbourne',
  },
  {
    id: 'sulbing-dessert-cafe-hawthorn',
    name: 'Sulbing Dessert Cafe',
    suburb: 'Hawthorn',
    address: '656 Glenferrie Road, Hawthorn VIC 3122, Australia',
    latitude: -37.8216,
    longitude: 145.0394,
    rating: 4.7,
    userRatingsTotal: 216,
    reviewCount: 216,
    phone: '(03) 9191 9261',
    website: 'https://www.sulbingcafe.com.au/',
    openingHours: {},
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Sulbing%20656%20Glenferrie%20Hawthorn',
  },
];

// ── Cafes to look up via Google Places ───────────────────────────────────────
const TO_LOOKUP = [
  { query: 'Cathedral Coffee Melbourne CBD', suburb: 'Melbourne' },
  { query: 'Good Measure cafe Carlton Melbourne', suburb: 'Carlton' },
  { query: 'Sunhands cafe Carlton Melbourne', suburb: 'Carlton' },
  { query: 'Lumen People cafe Fitzroy Melbourne', suburb: 'Fitzroy' },
  { query: 'Palette cafe North Melbourne', suburb: 'North Melbourne' },
  { query: 'Three Squared Coffee Melbourne CBD', suburb: 'Melbourne' },
  { query: "Balha's Pastry Brunswick Melbourne", suburb: 'Brunswick' },
  { query: 'Goat House Cafe Bar Elsternwick Melbourne', suburb: 'Elsternwick' },
  { query: 'Abbey Road Cafe St Kilda Melbourne', suburb: 'St Kilda' },
  { query: 'La Roche Cafe St Kilda Melbourne', suburb: 'St Kilda' },
  { query: 'Sons of Mary cafe Brighton Melbourne', suburb: 'Gardenvale' },
  { query: 'Amiri Cafe QV Melbourne CBD', suburb: 'Melbourne' },
  { query: 'Miilk Cake Studio Melbourne CBD', suburb: 'Melbourne' },
  { query: 'Kaneffi dessert cafe Windsor Melbourne', suburb: 'Windsor' },
  { query: 'Dessert Story Melbourne Chinatown', suburb: 'Melbourne' },
];

async function textSearch(query) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${KEY}&region=au`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results?.[0] || null;
}

async function placeDetails(placeId) {
  const fields = 'name,formatted_address,geometry,rating,user_ratings_total,formatted_phone_number,website,opening_hours,place_id';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result || null;
}

function parseHours(periods) {
  if (!periods) return {};
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const hours = {};
  for (const p of periods) {
    const dayKey = DAY_KEYS[p.open.day];
    if (!p.close) { hours[dayKey] = 'Open 24h'; continue; }
    const fmt = (t) => `${t.slice(0, 2)}:${t.slice(2)}`;
    hours[dayKey] = `${fmt(p.open.time)} - ${fmt(p.close.time)}`;
  }
  return hours;
}

function makeId(name, suburb) {
  return `${name}-${suburb}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildEntry(result, detail, suburb) {
  const loc = result.geometry?.location || detail?.geometry?.location || {};
  return {
    id: makeId(detail?.name || result.name, suburb),
    name: detail?.name || result.name,
    suburb,
    address: detail?.formatted_address || result.formatted_address || '',
    latitude: loc.lat || 0,
    longitude: loc.lng || 0,
    rating: detail?.rating || result.rating || null,
    userRatingsTotal: detail?.user_ratings_total || result.user_ratings_total || null,
    reviewCount: detail?.user_ratings_total || result.user_ratings_total || null,
    phone: detail?.formatted_phone_number || null,
    website: detail?.website || null,
    openingHours: parseHours(detail?.opening_hours?.periods),
    images: [],
    shortDescription: null,
    tags: [],
    specialtyCoffee: null,
    coffeeBrand: null,
    priceLevel: result.price_level || null,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((detail?.name || result.name) + ' ' + suburb)}&query_place_id=${result.place_id}`,
  };
}

async function main() {
  const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
  const existingIds = new Set(cafes.map(c => c.id));
  const toAdd = [];

  // Add manual entries
  for (const entry of MANUAL_ENTRIES) {
    if (existingIds.has(entry.id)) {
      console.log(`SKIP (exists): ${entry.name}`);
      continue;
    }
    const full = {
      images: [], shortDescription: null, tags: [],
      specialtyCoffee: null, coffeeBrand: null, priceLevel: 2,
      ...entry,
    };
    toAdd.push(full);
    console.log(`MANUAL ADD: ${entry.name} — ${entry.suburb}`);
  }

  // Look up remaining via API
  for (const item of TO_LOOKUP) {
    console.log(`\nLooking up: ${item.query}`);
    const result = await textSearch(item.query);
    if (!result) { console.log('  Not found'); continue; }

    const detail = await placeDetails(result.place_id);
    const entry = buildEntry(result, detail, item.suburb);

    if (existingIds.has(entry.id)) {
      console.log(`  SKIP (exists): ${entry.name}`);
      continue;
    }

    toAdd.push(entry);
    console.log(`  ADDED: ${entry.name} — ${entry.suburb} | ${entry.address}`);
    console.log(`  Hours:`, JSON.stringify(entry.openingHours));

    await new Promise(r => setTimeout(r, 300));
  }

  if (toAdd.length === 0) {
    console.log('\nNothing new to add.');
    return;
  }

  const updated = [...cafes, ...toAdd];
  fs.writeFileSync(CAFES_FILE, JSON.stringify(updated, null, 2));
  console.log(`\nAdded ${toAdd.length} cafes. Total: ${updated.length}`);
}

main().catch(console.error);
