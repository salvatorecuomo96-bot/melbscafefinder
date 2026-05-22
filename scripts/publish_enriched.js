#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = path.join(ROOT, 'data', 'cafes_enriched.json');
const dest = path.join(ROOT, 'public', 'cafes.json');

if (!fs.existsSync(src)) {
  console.error('❌  data/cafes_enriched.json not found. Run enrich_google.js first.');
  process.exit(1);
}

const cafes = JSON.parse(fs.readFileSync(src, 'utf8'));
fs.writeFileSync(dest, JSON.stringify(cafes));
console.log(`✅  Published ${cafes.length} cafes → public/cafes.json`);
console.log(`👉  git add public/cafes.json && git commit -m "data: Phase 2 enrichment" && git push`);
