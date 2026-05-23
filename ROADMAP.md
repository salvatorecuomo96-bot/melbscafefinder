# Melbourne Cafe Finder — Roadmap

**Mission**: Build a high-quality, mobile-first cafe discovery web app for Melbourne. Real data. Useful filters. Feels premium.

**Rule**: Use free tiers and keys we already have. No surprise bills.

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

## Phase 1: Real Data Pipeline (Highest Priority)

**Goal**: Replace 10 mock cafes with 500+ real Melbourne cafes.

### 1.1 Geoapify (Primary — we have a key)
- Free tier: 3,000 requests/day — enough to cover all of Melbourne in one run
- Query `categories=catering.cafe` with bounding box grid across Greater Melbourne
- Fields: name, lat/lng, address, suburb, phone, website, opening_hours, categories
- Script: `scripts/scrape_geoapify.js` — resumable, saves progress, rate-limited
- Target: 400–600 cafes

### 1.2 OSM via Overpass API (Supplementary — free, no key)
- Catches cafes Geoapify misses, especially in outer suburbs
- Query `amenity=cafe` across same bounding box
- Merge with Geoapify output, deduplicate by name + proximity (~50m)

### 1.3 City of Melbourne Open Data (Inner city top-up — free)
- `data.melbourne.vic.gov.au` — official listings with suburb + coordinates
- Good for inner-city density and cross-checking names

### 1.4 Merge & Output
- Deduplicate: same name within 50m = same cafe
- Output: `data/cafes_raw.json` — 500+ entries

**Cost**: $0 (Geoapify free tier + OSM free + CoM free)

**Deliverable**: `src/data/cafes.js` replaced with real data, real pins on the map.

**Status**: Pending

---

## Phase 2: Enrich With Google Places (Free Trial First, Then Decide)

**Goal**: Add photos, ratings, reviews, and structured attributes.

### 2.1 Google Places API (New) — use the free trial credit
- $200 free credit covers ~10,000 Place Details calls
- Fields to fetch per cafe: rating, user_ratings_total, photos, opening_hours, website, phone, reviews (5 per cafe)
- Use field masks to only pay for what we need (minimise cost when trial ends)
- Script: `scripts/enrich_google.js` — processes `cafes_raw.json`, outputs `cafes_enriched.json`
- Run once during trial, save results permanently — don't re-call unnecessarily

### 2.2 Attribute extraction from reviews (no API cost)
- Rule-based keyword matching on the review text we already fetched:
  - "wifi", "laptop", "work" → `laptopFriendly: true`
  - "dog", "puppy", "pets" → `dogFriendly: true`
  - "quiet", "calm", "peaceful" → `quiet: true`
  - "loud", "busy", "noisy" → `quiet: false`
  - "outdoor", "garden", "terrace" → `outdoorSeating: true`
  - "amazing coffee", "best espresso" → boost `coffeeQuality`
- Regex + word lists. No LLM. Runs on already-fetched data, costs nothing extra.

### 2.3 Photos
- Google Places returns photo references — fetch the image URL once, save it
- Store as a CDN URL in the JSON — no hosting cost
- Fallback: OSM-linked Wikimedia image if Google photo missing

**Cost**: $0 during free trial. After trial, re-evaluate — may stay free if under $200/month threshold.

**Deliverable**: `data/cafes_enriched.json` — ratings, photo URLs, review snippets, extracted attributes

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

## Phase 5: AI Natural Language Filter (After Real Data Exists)

**Goal**: Let users describe what they want in plain English instead of tapping filters.

### How it works
- User types (or speaks): *"quiet spot near the CBD to work on my laptop, good wifi"*
- Claude Haiku parses it → structured filter object: `{ wifi: true, laptopFriendly: true, quiet: true, suburb: 'CBD', sort: 'distance' }`
- Existing filter system applies the result — no UI rebuild needed, just a new input mode

### Implementation
- API: Claude Haiku (`claude-haiku-4-5`) — cheapest Claude model, ~$0.25/M input tokens
- One API call per query, ~200 tokens each = costs fractions of a cent per search
- System prompt defines the output schema (matches existing filter shape)
- Frontend: add an "AI search" input above the mood presets, with a sparkle icon
- Falls back to normal filters if AI call fails
- Needs `VITE_CLAUDE_API_KEY` in `.env` — requires a proxy/serverless function (can't expose key in browser)

### Requires
- Phase 1 complete (real cafes, real attributes to filter against)
- A serverless function (Vercel/Netlify edge function) as a thin proxy — free tier is enough

**Cost**: Near-zero. Haiku is so cheap that 10,000 AI searches = ~$0.50.

**Status**: Pending (blocked on Phase 1)

---

## Phase 6: Backend & Users (Future — When There's an Audience)

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

*Last updated: 23 May 2026*

---

## Phase 7: Advanced Filters (Planned)

### Chai type
- [ ] Filter: newspaper chai (pre-mixed masala / Arkadia-style)
- [ ] Filter: loose leaf chai
- [ ] Filter: powder chai

Data field: `chaiType: 'newspaper' | 'leaf' | 'powder' | null`
Sourced manually or via review keyword extraction.

### Coffee brand
- [ ] Display roaster/brand on cafe card (e.g. St Ali, Seven Seeds, Ona, Market Lane, Axil)
- [ ] Filter by coffee brand
- [ ] "Independent roaster" toggle

Data field: `coffeeBrand: string | null`
Sourced manually — no automated way to get this from Google.

