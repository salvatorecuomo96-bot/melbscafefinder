# Melbourne Cafe Finder — Roadmap

## Quick wins (< 1 day)

- [ ] **Analytics** — Add Vercel Analytics or Plausible. One import in `main.jsx`, free tier, see what people actually filter by.
- [ ] **PWA manifest** — `manifest.json` + service worker so users can "Add to Home Screen" on iOS/Android.
- [ ] **Suburb filter dropdown** — Add a suburb picker (dropdown or pill list) so users can browse by neighbourhood without typing. Populate from the unique suburb values already in cafes.json.

## Data & content

- [ ] **Brunch filter** — Single-field AI enrichment pass (~$2) to get a reliable `servesBrunch` boolean. Current `brunchQuality` data is too noisy to use.
- [ ] **Photo URL expiry** — Google Places photo URLs expire. Re-fetch with existing Places key, or mirror on Cloudflare R2 / Cloudinary for permanent URLs.
- [ ] **Menu scraping (CBD + 5km)** — Scrape cafe websites for menu text. ~$3.80 in API costs but only ~200-250 usable results (PDFs, Instagram links, etc.). Worth doing once brunch filter is sorted.

## Features

- [ ] **AI natural language search** — User types e.g. "quiet cafe to work with specialty coffee near the city" and Claude maps it to the right filters automatically. Needs a serverless function (Vercel `/api/filter`) to proxy Anthropic API calls so the key isn't exposed client-side.
- [ ] **Saved cafes persistence** — Encode saved IDs in the URL so bookmarks and share links work without a backend.
