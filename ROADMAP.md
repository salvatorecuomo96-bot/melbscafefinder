# Melbourne Cafe Finder - Grok Execution Roadmap

**Mission**: Build a high-quality, mobile-first cafe discovery web app (PWA-ready) for Melbourne with real data and powerful, review-backed filters.

**My Operating Style**: Super efficient. No fluff. Execute phases in order. Push working improvements frequently. Automation first.

**Current Date**: 22 May 2026

---

## Phase 0: Audit & Baseline (Do Immediately)

**Goal**: Understand exactly what exists and create a clean baseline.

- [ ] Clone repo and audit current structure
- [ ] Review current components (Map, BottomSheet, Filters, etc.)
- [ ] Check scraper quality in `/scraper/`
- [ ] Document current data flow (mock vs real)
- [ ] Create `data/` folder structure if missing
- [ ] Update this roadmap with findings

**Status**: In Progress

---

## Phase 1: Production Data Pipeline (Highest Priority)

**Goal**: Replace mock data with real, rich cafe data from multiple sources.

### 1.1 Geoapify Scraper (Foundation)
- [ ] Make scraper robust, resumable, and efficient
- [ ] Implement smart grid/bounding box coverage for full Greater Melbourne
- [ ] Add rate limiting, progress saving, error handling, logging
- [ ] Output clean `data/raw/cafes_geoapify.json`
- [ ] Run it and get 500+ real cafes

### 1.2 Supplementary Data
- [ ] Pull City of Melbourne open data (cafes/restaurants)
- [ ] Pull OSM data via Overpass for additional coverage
- [ ] Merge + deduplicate sources

### 1.3 Google Places Enrichment
- [ ] Enrich top cafes with Google Places (New) for photos, phone, website, hours, ratings
- [ ] Pull recent reviews for attribute extraction
- [ ] Strict cost control (field masks + limited calls)

**Deliverable**: `data/processed/cafes_final.json` with real data + rich attributes

**Status**: Pending

---

## Phase 2: Review Intelligence Engine

**Goal**: Turn reviews into usable filter attributes.

- [ ] Build review parser + sentiment/attribute extractor
- [ ] Generate these structured fields from real reviews:
  - wifi_quality
  - power_outlets
  - cozy_comfortable
  - noise_level
  - natural_light
  - laptop_work_friendly
  - dog_friendly
  - good_for (solo/dates/groups/work)
  - vibe_aesthetic
  - coffee_quality + food_quality
- [ ] Store attributes in JSONB-friendly format
- [ ] Score confidence on each attribute

**Deliverable**: Updated `cafes_final.json` with intelligent filter data

**Status**: Pending

---

## Phase 3: Frontend Data Integration

**Goal**: Make the app use real data + powerful filters.

- [ ] Load `cafes_final.json` into the React app
- [ ] Replace mock data everywhere
- [ ] Implement advanced filter system based on new attributes
- [ ] Improve Mapbox integration (real markers, clustering, info windows)
- [ ] Enhance bottom sheet with real photos + attribute badges
- [ ] Add "Near Me" + distance sorting

**Status**: Pending

---

## Phase 4: Mobile UX Polish & PWA

**Goal**: Make it feel like a native mobile app.

- [ ] Fix any remaining mobile bugs (touch, scroll, overlays)
- [ ] Polish bottom sheet experience
- [ ] Add smooth animations and loading states
- [ ] Make it installable as PWA
- [ ] Test thoroughly on mobile

**Status**: Pending

---

## Phase 5: Backend & Persistence (Future)

- [ ] Move to Supabase (Postgres + Auth)
- [ ] Add user accounts + saved cafes
- [ ] Add "I was here" + community corrections
- [ ] Set up data refresh jobs

**Status**: Future

---

## Execution Rules (For Me)

1. Work phase by phase in order
2. Push meaningful progress at least every 1-2 days
3. Always keep the app in a runnable state
4. Prioritize real data + useful filters over polish
5. Be ruthless about automation and simplicity

---

## Success Metrics

- 500+ real cafes with rich attributes
- Filters actually work based on real reviews/data
- Smooth mobile experience
- Easy to run data pipeline end-to-end

**Let's build something actually useful.**

*Last updated: 22 May 2026 by Grok 4.3*