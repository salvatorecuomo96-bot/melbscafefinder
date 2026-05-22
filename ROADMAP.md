# Melbourne Cafe Finder — Roadmap

**Mission**: Build a high-quality, mobile-first cafe discovery web app for Melbourne. Real data. Useful filters. Feels premium. $0 spent on data.

**Rule**: No paid APIs. No paid scraping services. Every data source must be free.

**Current Date**: 22 May 2026

---

## What's Already Built

- Map-first mobile layout with draggable bottom sheet
- Mood presets (8 vibes with ranked filtering)
- Save cafes to localStorage
- Near Me (geolocation + distance sort)
- Filter drawer (wifi, dog-friendly, outdoor seating, etc.)
- Desktop sidebar + map layout
- 10 mock cafes (placeholder only)

**The gap**: mock data. Everything else is ready for real cafes.

---

## Phase 1: Real Data — Free Sources Only (Highest Priority)

**Goal**: Replace 10 mock cafes with 500+ real Melbourne cafes. Zero cost.

### 1.1 OpenStreetMap via Overpass API
- Completely free, no key required, no rate limit with polite usage
- Query all `amenity=cafe` nodes/ways within Greater Melbourne bounding box
- Fields available: name, lat/lng, suburb, phone, website, opening_hours, outdoor_seating, wheelchair
- Write a script: `scripts/scrape_osm.js` or `.py`
- Target: 300–600 cafes from OSM alone

### 1.2 City of Melbourne Open Data
- Free government dataset at `data.melbourne.vic.gov.au`
- Has cafe/restaurant listings with addresses, coordinates, suburb
- Download as CSV/GeoJSON, parse and merge with OSM
- Adds legitimacy and fills gaps in inner-city coverage

### 1.3 Merge & Deduplicate
- Match by name + proximity (within ~50m = same cafe)
- Prefer OSM coordinates (more accurate), CoM for metadata
- Output: `data/cafes_raw.json` — ~500 entries, basic fields only

**Cost**: $0. Both sources are public and free forever.

**Deliverable**: `src/data/cafes.js` swapped from mock to real, app works with real pins on the map.

**Status**: Pending

---

## Phase 2: Enrich With Google Maps (Free Tier — Scraping HTML, Not API)

**Goal**: Add photos, ratings, review snippets, and rich attributes without paying Google.

### 2.1 What's free from Google
- Public Google Maps pages are publicly accessible HTML
- A headless browser (Playwright/Puppeteer) can extract:
  - Star rating + review count
  - 3–5 recent review snippets
  - Category tags (e.g. "Cozy", "Good coffee")
  - Cover photo URL (public CDN)
- This is scraping, not the paid API — no cost

### 2.2 Attribute extraction from reviews (no AI cost)
- Rule-based keyword matching on review text, completely free:
  - "wifi", "laptop", "work" → `laptopFriendly: true`
  - "dog", "puppy", "pets allowed" → `dogFriendly: true`
  - "quiet", "calm", "peaceful" → `quiet: true`
  - "noisy", "loud", "busy" → `quiet: false`
  - "outdoor", "garden", "terrace" → `outdoorSeating: true`
  - "great coffee", "best espresso" → boost `coffeeQuality`
- No LLM needed. Regex + word lists. Fast, free, good enough for V1.

### 2.3 Photos
- Pull the first public cover photo from each cafe's Google Maps page
- Store as URL (hotlink from Google CDN) — no hosting cost
- Fall back to a suburb-based placeholder if scraping fails

**Cost**: $0. Compute only (your machine or a free GitHub Actions run).

**Deliverable**: `data/cafes_enriched.json` — ratings, photo URLs, extracted attributes

**Status**: Pending

---

## Phase 3: Frontend Integration

**Goal**: Wire real data into the app.

- [ ] Replace `src/data/cafes.js` with real enriched data
- [ ] Display real photos in CafeCard and CafeDetail
- [ ] Show real rating + review count
- [ ] Wire attributes to existing filters (they already exist in UI)
- [ ] Add photo loading skeleton state
- [ ] Add marker clustering for the map (Mapbox has this free)

**Status**: Pending

---

## Phase 4: Mobile Polish (Ongoing — Not Blocked by Data)

**Goal**: Native app feel on iOS and Android.

- [ ] Mood preset scroll confirmed working on all devices
- [ ] Bottom sheet drag feels smooth and snappy
- [ ] Map pins don't drift on zoom
- [ ] Preview card + detail sheet transitions
- [ ] PWA manifest + install prompt
- [ ] Test on real iOS Safari + Android Chrome

**Note**: This runs in parallel with Phase 1–3, not after.

**Status**: In Progress

---

## Phase 5: Backend & Users (Future — When There's an Audience)

- [ ] Supabase (Postgres + Auth) — free tier is enough to start
- [ ] User accounts
- [ ] Saved cafes synced across devices (replace localStorage)
- [ ] "I've been here" + user corrections
- [ ] Automated stale-data detection (re-scrape if hours/name changed)
- [ ] Admin queue for reviewing corrections

**Status**: Future. Don't build this until people are actually using the app.

---

## Execution Rules

1. $0 on data — OSM + CoM + HTML scraping only
2. Mobile polish runs in parallel with data work, not after
3. Keep the app runnable at all times
4. Real data on the map before any new features
5. 50 hand-curated cafes is better than 500 low-quality ones — quality over quantity

---

## Success Metrics

- 200+ real Melbourne cafes with correct coordinates
- Photos visible in the app
- Filters based on real attributes (not mocked booleans)
- Works smoothly on iPhone Safari
- Zero ongoing cost to run

*Last updated: 22 May 2026*
