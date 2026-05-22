# Melbourne Cafe Finder - Project Roadmap

**Goal**: Build the best mobile-first web app (that can become a PWA/app) helping people in Melbourne find the *perfect* cafe using real, useful filters derived from data and reviews.

**Core Philosophy**: Maximize automation. Minimum manual work. Real data over mock data. Safe, cost-conscious, scalable.

---

## Current Status (22 May 2026)

- Vite + React + Mapbox mobile-first web app (good foundation from Claude)
- Features: Map view, bottom sheets, tabs (Explore/Map/Saved), basic filters, search, sort, geolocation
- Data: Currently mock data (~12 cafes)
- Scraper: Geoapify scraper started in `/scraper/`
- Repo: `salvatorecuomo96-bot/melbscafefinder`

**Next Priority**: Replace mock data with real, rich cafe data + powerful filters.

---

## Phase 1: Data Foundation (Highest Priority - Do This Week)

### 1.1 Robust Data Pipeline
- [ ] Improve Geoapify scraper (make it reliable, resumable, suburb-by-suburb or grid-based for full Greater Melbourne coverage)
- [ ] Save clean, deduplicated data to `data/raw/cafes_geoapify.json`
- [ ] Add City of Melbourne open data + OSM/Overpass as additional sources
- [ ] Create `scripts/` folder with reusable data tools

### 1.2 Google Places Enrichment (Quality Layer)
- [ ] Use Google Places (New) API on top cafes for:
  - High-quality photos
  - Phone, website, opening hours
  - Ratings + recent reviews
- [ ] Cost control: Only enrich top 500-1000 cafes + use field masks

### 1.3 Review Intelligence Engine (The Magic)
- [ ] Build review sentiment / attribute extractor that creates these filters from real reviews:
  - `wifi_quality` (good / reliable / poor / none)
  - `power_outlets` (plenty / some / none)
  - `cozy_comfortable` (true/false + score)
  - `noise_level` (quiet / moderate / loud)
  - `natural_light` (bright / good / dim)
  - `laptop_work_friendly`
  - `dog_friendly`
  - `good_for` (solo / dates / groups / work)
  - `vibe_aesthetic` + `coffee_quality` + `food_quality`
- [ ] Store as structured JSON/JSONB for fast filtering

**Deliverable**: `data/processed/cafes_final.json` with 500+ real cafes + rich attributes.

---

## Phase 2: Backend & Data Layer

- [ ] Set up Supabase (Postgres + Storage)
- [ ] Design clean schema (cafes table + tags/attributes as JSONB)
- [ ] API routes for search + filtering
- [ ] Background jobs for data refresh (weekly)
- [ ] Caching layer

---

## Phase 3: Frontend Polish & Mobile Experience

- [ ] Replace mock data with real `cafes_final.json`
- [ ] Build powerful, intuitive filter UI (chips + advanced drawer)
- [ ] Improve Mapbox integration (clusters, info windows, "Near Me")
- [ ] Enhance bottom sheet experience (photos carousel, review summaries, attributes badges)
- [ ] Add "Save Cafe", "I was here" (future community data)
- [ ] Dark mode + beautiful mobile UX

**Target**: Feels like a native app in the browser.

---

## Phase 4: Advanced Features

- [ ] Smart recommendations ("Cafes like the one you saved")
- [ ] User accounts + saved lists (Supabase Auth)
- [ ] Review submission / correction system (community-powered data)
- [ ] Admin dashboard for data quality
- [ ] Analytics (most popular filters, areas, etc.)

---

## Phase 5: Launch & Growth

- [ ] Deploy to Vercel / Netlify (easy + free)
- [ ] Make it a PWA (installable on phone)
- [ ] SEO + shareable cafe pages
- [ ] Beta testing with Melbourne locals
- [ ] Marketing landing page + social proof
- [ ] Optional: React Native wrapper later for App Store / Play Store

---

## Phase 6: Monetization & Scale (Future)

- [ ] Featured / sponsored cafes
- [ ] API access for other apps
- [ ] Expand to bars, bakeries, restaurants
- [ ] White-label version for other cities

---

## Tech Stack (Current + Planned)

**Frontend**
- Vite + React + TypeScript (recommended)
- Mapbox GL JS
- Tailwind / CSS modules
- React Query / SWR for data

**Data & Backend**
- Python (pandas, requests, python-dotenv, tqdm)
- Supabase (Postgres + Auth + Storage)
- Geoapify + Google Places (New) APIs

**DevOps & Safety**
- Proper `.env` management
- GitHub Actions for CI (optional)
- Rate limiting + resumable scripts
- Cost monitoring

---

## Guiding Principles

1. **Real data beats mock data** — Every filter must be backed by actual reviews or reliable sources.
2. **Automation first** — Scripts should be runnable with one command. Minimal manual steps.
3. **Mobile-first, delightful UX** — The web app should feel native on phones.
4. **Safe & Cheap** — Respect API limits, use free tiers first, monitor costs.
5. **Iterate fast** — Ship improvements weekly. Get real user feedback early.

---

## Immediate Next Actions (This Weekend)

1. Improve + run Geoapify scraper → get real cafe list
2. Build basic review attribute extractor
3. Load real data into the frontend
4. Update this roadmap with progress

**Let's make this the best cafe discovery tool in Melbourne.**

---

*Last updated: 22 May 2026 by Grok 4.3 (taking over from Claude)*