# Melbourne Cafe Finder — Roadmap

## Done

- [x] **PWA manifest** — `manifest.json` and service worker support for installable mobile usage.
- [x] **Suburb filter** — Dropdown populated from `public/cafes.json`.
- [x] **Analytics** — Vercel Analytics wired up.
- [x] **Saved cafes sharing** — Encode saved IDs in the URL with `?saved=id1,id2`.
- [x] **Photo hosting** — Cafe photos migrated to Cloudinary-backed URLs.
- [x] **Google Maps links** — Cafes include Google Maps URLs where available.
- [x] **Submit a cafe** — Modal form and `/api/submit-cafe` serverless email endpoint.
- [x] **Report closed** — `/api/report-closed` serverless email endpoint for bad listing reports.
- [x] **Filter simplification** — Removed AI natural-language filtering, generated descriptions, and unreliable review-derived filters.
- [x] **Coffee-brand focus** — Kept coffee-brand filtering as the primary enrichment filter and normalised brand labels in the public dataset.

## Short-term

- [ ] **Branding** — Finalise public name, wordmark, and logo.
- [ ] **Homepage UI refinement** — Continue tightening the mobile-first discovery flow.
- [ ] **Resend setup** — Add `RESEND_API_KEY`, `RESEND_TO_EMAIL`, and preferably `RESEND_FROM_EMAIL` to Vercel environment variables.
- [ ] **Dataset schema validation** — Add an automated check that `public/cafes.json` contains only approved display fields and valid coordinate/filter data.
- [ ] **Coffee-brand enrichment pass** — Improve coverage using cafe websites, menus, roaster pages, or manually reviewed sources.

## Data & content

- [ ] **Ratings freshness** — Re-scrape Google ratings periodically so rating and review-count data do not go stale.
- [ ] **Source confidence** — Track how each coffee-brand value was identified, especially if brand coverage is expanded.
- [ ] **Moderation workflow** — Add a simple reviewed/pending process for submitted cafes before they enter the public dataset.

## Future

- [ ] **Neighbourhood pages** — Static suburb pages for SEO, such as “Best cafes in Fitzroy”.
- [ ] **Crowd-sourced tips** — Short user tips that can be moderated independently of structured filters.
- [ ] **Better map performance** — Continue code-splitting and lazy-loading heavy map assets as traffic grows.
