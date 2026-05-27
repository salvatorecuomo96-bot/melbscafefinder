/**
 * merge_menus.js
 * Merges scraped menu text into public/cafes.json.
 * Run after scrape_menus.js finishes: node scripts/merge_menus.js
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CAFES_FILE   = path.join(__dirname, '../public/cafes.json');
const RESULTS_FILE = path.join(__dirname, '../data/menu_results.json');

const cafes   = JSON.parse(fs.readFileSync(CAFES_FILE,   'utf8'));
const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));

let added = 0;
const updated = cafes.map((cafe) => {
  if (results[cafe.id]) {
    added++;
    return { ...cafe, menuText: results[cafe.id] };
  }
  return cafe;
});

fs.writeFileSync(CAFES_FILE, JSON.stringify(updated, null, 2));
console.log(`Done. Added menuText to ${added} / ${cafes.length} cafes.`);
