# AI Development Instructions

These instructions apply to all future development.

---

## Core Philosophy

This project is not a generic cafe directory.

It is a premium Melbourne cafe discovery experience focused on:
- vibe
- emotion
- personality
- intelligent filtering
- beautiful UX

The app should feel closer to:
- Airbnb
- Apple Maps
- Broadsheet
- Kinfolk

than:
- Yelp
- TripAdvisor
- generic dashboards

---

# Development Rules

## IMPORTANT

- Do NOT rebuild the project from scratch.
- Reuse existing components whenever possible.
- Improve incrementally.
- Keep the architecture clean and scalable.
- Avoid unnecessary dependencies.
- Do not overengineer.
- Keep the project beginner-friendly.

---

# AI Collaboration Rules

---

## Model Selection

Current model: **Claude Sonnet 4.6** — fast, good for most tasks.

**Stay on Sonnet for** day-to-day work: writing components, fixing bugs, CSS, scripts, explanations.

**Switch to Claude Opus when:**
- Debugging a hard problem that spans many files
- Planning a large architectural change (e.g. migrating to Supabase)
- The current model is going in circles or giving inconsistent answers
- A task requires deep reasoning across 5+ files at once

> To switch: type `/model` in Claude Code and select Opus. Switch back to Sonnet after — Opus is slower and costs more.

---

## File Splitting

Split a file when it is doing two jobs, not when it hits a line count.

- A component handling both UI and data logic → move data logic to a custom hook
- A CSS file covering multiple unrelated components → split per component
- Mock data growing large → split by suburb or category

Claude will flag this proactively. When a file is getting unwieldy, say "suggest how to split this" rather than pushing through.

---

## Working Together Efficiently

- **Batch related changes** into one request rather than one tiny change per message
- **Start a new conversation** when switching to a new major phase — long conversations degrade quality
- **Keep ROADMAP.md accurate** — Claude reads it at the start of each session to understand the project without needing re-explanation
- If Claude seems confused about the current state of the project, say: *"re-read ROADMAP.md and list the current files before continuing"*

---

## What Claude should always do on this project:
- Read a file before editing it
- Prefer editing existing files over creating new ones
- Flag when a task is bigger than it looks or belongs in a later phase
- Recommend Opus when a task genuinely needs it
- Suggest the simpler option when two solutions exist
- Never add a package without explaining what it does and why it's needed

---

# Tech Stack

Current stack:

- React
- Vite
- Mapbox GL JS
- CSS modules/plain CSS
- Local mock data

Future stack:
- Supabase
- PostgreSQL
- Storage
- Authentication

---

# UI Direction

The UI should feel:
- warm
- premium
- editorial
- minimal
- smooth
- modern
- mobile-first

Avoid:
- corporate dashboard feel
- overly colorful UI
- generic templates
- cluttered layouts

Preferred design inspiration:
- Airbnb
- Apple Maps
- Notion
- Broadsheet
- Japanese minimalism
- Kinfolk magazine

---

# Code Rules

- Keep components modular.
- Use clean folder structure.
- Prefer reusable components.
- Keep naming consistent.
- Add comments for complex logic.
- Do not introduce backend unless requested.
- Keep code easy to understand for beginners.

---

# Map Experience Rules

The map is the core product.

The experience should feel:
- alive
- smooth
- immersive
- app-like

Prioritize:
- smooth animations
- beautiful markers
- mobile UX
- quick interactions
- emotional feel

---

# Product Differentiation

The product should focus heavily on:
- cafe personality
- vibe intelligence
- emotional recommendations
- mood-based discovery

Not just:
- ratings
- reviews
- distance

---

# Data Rules

Preferred data sources:
- OpenStreetMap
- Official cafe websites
- Public menus
- User submissions

Avoid:
- direct Google Maps scraping
- Instagram scraping

Always preserve:
- source attribution
- confidence scores
- clean data structure

---

# Important Workflow

When making changes:
1. Inspect existing files first.
2. Reuse current architecture.
3. Only modify what is necessary.
4. Explain created/updated files clearly.
5. Avoid unnecessary rewrites.

---

# Priority Order

1. Core UX polish
2. Map interactions
3. Search/filter experience + mood presets
4. Save Cafe (localStorage)
5. Real cafe data + vibe taxonomy
6. Photos
7. Personality scoring
8. Backend + accounts
9. Advanced features

---

# Final Goal

Create the best cafe discovery experience in Melbourne.

The product should feel curated, intelligent, emotional, and beautiful.

# Melbourne Cafe Finder — Roadmap

A premium Melbourne cafe discovery platform focused on vibe, personality, and intelligent filtering — not just ratings.

---

## North Star

> **The goal is not to catalogue cafes. The goal is to reduce decision fatigue.**

Not maps. Not filters. Not AI. Decision relief. That is the emotional value this product delivers. Every feature decision should be tested against this: does it reduce the friction of choosing where to go?

---

## Vision

Create the best way to discover cafes in Melbourne.

Not just ratings and reviews, but:

- Atmosphere and emotional feel
- Work friendliness and quietness
- Date vibes
- Coffee and matcha quality
- Natural light and seating
- Pastries and food options
- Laptop friendliness
- Dog friendly, outdoor seating, accessibility

The goal is to feel like Google Maps + Airbnb + Broadsheet — but simpler, warmer, and more personal.

---

## Phase 1 — Core Product Experience

**Goal:** Make the prototype feel like a real, polished app. Ship something you'd actually show someone.

### Map + Layout
- [ ] Full-screen Mapbox map
- [ ] Desktop split view (map + list side by side)
- [ ] Mobile-first layout with bottom sheet
- [ ] Floating search bar
- [ ] Floating filter button
- [ ] Cafe markers on map
- [ ] Active marker state (selected cafe highlighted)
- [ ] Fly-to animation when selecting a cafe
- [ ] Responsive design polish

### Cafe Cards + Detail
- [ ] Cafe card with real photo, name, suburb, rating, tags
- [ ] Cafe detail modal (full info, photos, hours, amenities)
- [ ] Smooth open/close animations
- [ ] Loading and empty states

### Filters + Search
- [ ] Bottom filter drawer (mobile)
- [ ] Filter sidebar (desktop)
- [ ] Search by name or suburb
- [ ] Filter by: wifi, laptop-friendly, dog-friendly, outdoor seating, quiet, specialty coffee, matcha, pastries, plant milk, decaf, good for work, good for dates
- [ ] Sort by: rating, distance, price

### Mood Presets ← this is the differentiator, build it in Phase 1
- [ ] "Quiet work session"
- [ ] "First date"
- [ ] "Read a book"
- [ ] "Espresso nerd"
- [ ] "Matcha + pastry"
- [ ] "Dog walk coffee"
- [ ] "Group brunch"
- [ ] "Late afternoon chill"

Each preset is just a pre-filled filter combination. Simple to build, immediately impressive. This is what makes the app feel different from Google Maps.

Mood presets are the first recommendation engine. No AI, no ML, no cost — just good product thinking expressed as saved filter states. They solve 80% of what AI vibe matching would solve, at 2% of the complexity. Do not replace them with an LLM until they demonstrably fail to cover a use case.

### Save Cafe ← belongs in Phase 1, uses localStorage only
- [ ] Save / unsave button on every cafe card and detail modal
- [ ] Saved cafes persist between visits (localStorage — no account needed)
- [ ] "Saved" tab or page showing saved cafes
- [ ] Lightweight collections: user can name a list ("Work spots", "Date nights")

**No backend, no accounts, no Supabase required.** localStorage is free and works immediately. When accounts are added in Phase 4, saved cafes migrate from localStorage to the database.

Why Phase 1: saving behavior is your first real product signal. If users save cafes, the recommendations matter to them. If nobody saves anything, you have a discovery problem. You need this data before you build anything else.

### Near Me ← basic location feature, belongs in Phase 1
- [ ] "Cafes near me" button using browser geolocation
- [ ] Sort by distance from current location
- [ ] Distance displayed on each card

### Photos ← must be in Phase 1, not Phase 5
- [ ] Real photo on every cafe card and detail modal
- [ ] Photo carousel in detail modal
- [ ] Graceful fallback if photo is missing (gradient with cafe initial)

A card without a real photo looks unfinished. Photos are not optional.

**Photo sources — in order of preference:**
1. Yelp Fusion API — free, real photos, licensed for display via the API
2. Google Places API — $200/month free credit, excellent photo coverage
3. Photos submitted directly by the cafe
4. User-uploaded photos (Phase 4+)
5. Generic styled placeholder — last resort only

> Do NOT take photos from cafe websites, Google Images, or Instagram without explicit permission. Photos are copyrighted. Only use photos sourced via APIs that license them for display, or photos the cafe has given you directly.

---

## Phase 2 — Real Cafe Data

**Goal:** Replace mock data with 100–300 real Melbourne cafes.

### The Moat

The long-term winner in this category is whoever has the most accurate, most nuanced, most up-to-date cafe data in Melbourne. You are building a structured local knowledge graph. That is the real business.

The data system — not the UI — is the defensible advantage. The goal is to make that system as automated and self-maintaining as possible, so the product stays accurate without requiring constant manual effort.

Your role long-term is reviewing and approving changes, not entering them.

### Vibe Taxonomy

Define this before seeding any real data. Once 50 cafes have inconsistent vibe strings the data becomes unusable.

**Allowed vibe values (pick 1–2 per cafe):**

```
cozy        — warm, soft lighting, snug seating
minimalist  — clean lines, white space, calm
buzzing     — loud, energetic, social
quiet       — low noise, easy to concentrate
artsy       — creative, eclectic, gallery-like
industrial  — exposed brick/pipes, raw materials
bright      — lots of natural light, airy
hidden      — laneway, basement, easy to miss
community   — neighbourhood feel, regulars, welcoming
luxury      — high-end fit-out, premium experience
```

These values are an enum. Do not accept anything outside this list when entering cafe data. Add new values only deliberately, not on a per-cafe basis.

### Data Strategy

#### Bootstrap — launch batch only (temporary, one-time)
Manual curation is only for the first 50 cafes to get to launch. It is bootstrapping, not the operating model.

- Run `scripts/seedFromYelp.js` to auto-seed name, address, lat/lng, rating, hours, photos
- Manually fill in the null fields for those 50 cafes only: vibe, wifi, plantMilk, quiet, etc.
- Write a short description and assign vibe tags from the taxonomy above
- Once live, the system takes over from here

#### Long-term data system (the real operating model)
After launch, data quality is maintained automatically with minimal admin involvement:

- **Automated re-seeding** — Yelp/Google Places API jobs run periodically to refresh hours, ratings, and photos
- **AI-assisted enrichment** — when a new cafe is seeded, an AI pass attempts to fill null fields using the cafe's website, menu, and Google reviews as source material; output goes to an approval queue, not live directly
- **User-submitted corrections** — "Is this still accurate?" prompts and a lightweight "Suggest an edit" flow; all submissions go to an admin queue
- **Stale-data detection** — flag cafes whose hours/details haven't been verified in 90+ days; prompt users who recently visited to confirm
- **Admin approval queue** — you review and approve batches of AI-suggested or user-submitted changes; you are not entering data yourself

Your ongoing role: approve or reject queued changes in batches. Not data entry.

#### Data Sources
- Yelp Fusion API — free, start here
- Google Places API — $200/month free credit, better photo quality
- OpenStreetMap Overpass API — free lat/lng data, almost no amenity data
- Cafe websites and menus — source material for AI enrichment, not manual copying

#### Avoid
- Scraping Google Maps directly (violates ToS, gets blocked)
- Scraping Instagram (Meta actively blocks this)
- Taking photos from websites without permission (copyright infringement)

#### Target
- 50 cafes at launch, fully enriched — that is enough
- Focus on inner suburbs first: Fitzroy, Carlton, Collingwood, Brunswick, Richmond, South Yarra, CBD
- Expand suburbs progressively as the automated system matures

---

## Phase 3 — Personality Scores

**Goal:** Differentiate further with intelligent scoring per cafe.

Each cafe gets a computed score (1–5) for each personality dimension:

- Work score
- Quiet score
- Date score
- Coffee nerd score
- Matcha score
- Pastry score
- Group brunch score
- Outdoor sunny score
- Cozy winter score

These scores are derived from the boolean attributes you already collect — not a separate AI system.

```js
// Example — no ML needed, just weighted averages
workScore = avg(laptopFriendly, hasWifi, quiet, priceLevel <= 2)
dateScore = avg(goodForDates, quiet, priceLevel >= 2)
matchaScore = matcha ? 5 : 0
```

These scores power the mood presets and make recommendations smarter over time.

---

## Phase 4 — Backend + User Accounts

**Goal:** Turn the prototype into a real platform.

### Stack
- Supabase (Postgres + Auth + Storage + Realtime)
- Replace static `cafes.js` with Supabase database queries
- Store user-uploaded photos in Supabase Storage

### Features
- [ ] User accounts (sign up / log in)
- [ ] Save cafes to a personal list
- [ ] Cafe collections ("My work spots", "Date night cafes")
- [ ] "Suggest an edit" flow with admin approval
- [ ] New cafe submissions
- [ ] Admin moderation dashboard
- [ ] Basic analytics (most viewed, most saved)

---

## Phase 5 — Launch

**Goal:** Ship the Melbourne-only version publicly.

### Good Enough to Launch

Stop building and ship when all of these are true. Not most — all.

- [ ] At least 50 cafes exist with complete, accurate data (no null fields)
- [ ] Every cafe has at least one real photo
- [ ] Mood presets return good results for every preset
- [ ] Near Me works on mobile
- [ ] Save Cafe works and persists between visits
- [ ] Filters return correct results
- [ ] The app loads fast on a phone on 4G
- [ ] You have tested it on iOS Safari and Android Chrome personally
- [ ] Empty state and no-results states look good
- [ ] You would genuinely use this to find a cafe today

That is enough. Ship it. Do not wait for 300 cafes, a perfect map, or advanced features. A focused product with 50 great cafes beats an incomplete product with 300 mediocre ones.

### Launch Checklist
- [ ] 50+ curated Melbourne cafes with accurate, complete data
- [ ] Mobile UX tested on real devices (iOS Safari, Android Chrome)
- [ ] SEO: suburb landing pages ("Best cafes in Fitzroy Melbourne")
- [ ] Performance: fast load, optimised images, lazy loading
- [ ] Error monitoring (Sentry free tier)
- [ ] Analytics (Plausible or Google Analytics)
- [ ] Feedback collection (simple form)
- [ ] Social sharing (share a cafe as a link with Open Graph preview)

### Marketing Channels
- TikTok — "Best cafe for working in Melbourne" content
- Instagram Reels — cafe walkthrough videos
- Reddit r/melbourne — genuine community contribution, not spam
- Melbourne coffee communities and Facebook groups
- Reach out to featured cafes — many will share if you feature them well

---

## Phase 6 — Advanced Features

**Goal:** Make the product genuinely intelligent.

### Ideas (rough priority order)
- "Find me a cafe right now" — nearest open cafe in real time
- Weather-aware recommendations (cozy spots on cold days, outdoor on sunny days)
- Time-of-day recommendations (quiet morning spot vs. buzzy brunch)
- Walking distance mode
- Crowd prediction (busy/quiet based on time patterns)
- Neighbourhood guide pages (curated suburb-specific content)
- Barista profiles and roastery connections

> **AI vibe matching ("describe what you want in plain English") has been removed.** Mood presets already solve this problem — faster, cheaper, and more reliably. Do not add LLM features until mood presets demonstrably fail to cover a real use case. Do not prematurely AI-ify the product.

---

## Product Philosophy

This should not feel like Yelp, TripAdvisor, or a generic review app.

It should feel curated, emotional, and premium. The experience matters as much as the data.

The competitive advantage is not having more cafes than Google Maps. It is having better *insight* into each cafe — the stuff that matters when you're choosing where to spend two hours of your morning.

---

## Current Priorities

### Do now
1. Finish Phase 1 — map, filters, mood presets, near me, photos, save cafe (localStorage)
2. Define vibe taxonomy before entering any real cafe data
3. Run Yelp seeder to auto-populate base data
4. Manually enrich the launch batch of 50 cafes — one time only, not the ongoing model

### Avoid for now
- User accounts
- Monetisation
- Complex backend
- AI enrichment pipeline (Phase 2 problem, not Phase 1)
- Confidence scoring / ML
- Features that don't directly reduce decision fatigue

### After launch
Build the automated data system: AI enrichment, user corrections, stale-data detection, admin queue. That is what removes you from the data entry loop permanently.

**The launch bar is 50 great cafes, not 300 average ones. Ship when the "good enough to launch" checklist is complete.**
