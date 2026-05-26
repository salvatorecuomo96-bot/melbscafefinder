# Melbourne Cafe Finder — Roadmap

## Done

- [x] **PWA manifest** — `manifest.json` + service worker, "Add to Home Screen" on iOS/Android
- [x] **Suburb filter** — Dropdown with all 324 suburbs, populated from cafes.json
- [x] **Analytics** — Vercel Analytics wired up
- [x] **Saved cafes sharing** — Encode saved IDs in URL (`?saved=id1,id2`)
- [x] **AI natural language search** — `/api/filter` Vercel function, maps free-text to filters via Claude Haiku
- [x] **Photo hosting** — All 9921 photos migrated to Cloudinary (permanent URLs)
- [x] **Google Maps links** — Every cafe has a proper `place_id`-based Maps URL
- [x] **Submit a cafe** — Modal form + `/api/submit-cafe` Vercel function, emails submissions via Resend
- [x] **Data cleaning** — Removed 300 non-cafes: chains, distant suburbs, late-opening, low-review count venues

## Short-term

- [ ] **Branding** — Name finalisation (leaning Filtrd). New wordmark + logo.
- [ ] **Homepage UI redesign** — User not happy with current layout/feel. Rethink from scratch.
- [ ] **Interior photo sorting** — AI classification pass to reorder images (interior first). ~$3-5 cost.
- [ ] **Resend setup** — Add `RESEND_API_KEY` to Vercel env vars so submit-cafe emails actually send.

## Data & content

- [ ] **Brunch filter** — Needs menu text to be reliable. `servesBrunch` field exists in data but not exposed in UI. Revisit once menu scraping is done.
- [ ] **Menu scraping** — Scrape cafe websites for menu text. ~$3.80 in API costs, ~200-250 usable results. Enables brunch + dietary filters.

## Future

- [ ] **Ratings freshness** — Re-scrape Google ratings periodically so data doesn't go stale.
- [ ] **Neighbourhood pages** — Static pages per suburb for SEO (e.g. "Best cafes in Fitzroy").
- [ ] **User reviews / tips** — Short crowd-sourced notes on each cafe.
