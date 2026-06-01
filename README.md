# Melbourne Cafe Finder

A mobile-first, map-driven cafe discovery app for Melbourne. The app focuses on reliable discovery signals: **name/suburb search**, **open now**, **rating**, **price**, and **coffee brand** where it can be identified from cafe website data.

Built with React, Vite, Mapbox GL JS, Vercel serverless functions, and a static `public/cafes.json` dataset. There is no database required for the current version.

---

## Requirements

- **Node.js 18+** from <https://nodejs.org>
- **Git** from <https://git-scm.com> if you are contributing through GitHub

No Docker or local database is required.

## Run locally

```bash
npm install
npm run dev
```

Vite serves the app at <http://localhost:5173>. Edits hot-reload automatically.

## Environment variables

Copy `.env.example` to `.env` for local development.

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_MAPBOX_TOKEN` | Recommended | Enables the interactive Mapbox map. Without it, the cafe list still works. |
| `RESEND_API_KEY` | Optional locally, required for email forms | Sends cafe submissions and closure reports from the Vercel API routes. |
| `RESEND_TO_EMAIL` | Optional | Destination inbox for submissions and reports. |
| `RESEND_FROM_EMAIL` | Optional | Verified sender address for Resend. Defaults to Resend onboarding sender. |

## Main folder structure

```text
melbscafefinder/
├── api/                         # Vercel serverless email endpoints
├── public/
│   └── cafes.json               # Production cafe dataset used by the app
├── scripts/                     # Data import, enrichment, cleanup, and publishing utilities
├── src/
│   ├── components/              # Reusable UI building blocks
│   ├── constants/filters.js     # Canonical filter options
│   ├── hooks/useCafeFilters.js  # Search, filter, and sort logic
│   ├── pages/Home/              # Main app shell
│   └── utils/                   # Formatting, distance, and chip helpers
├── package.json
├── vercel.json
└── vite.config.js
```

## Current filter strategy

The app deliberately avoids filters that cannot be supported reliably by the available data. Filters such as laptop friendliness, Wi-Fi, power outlets, outdoor seating, dog friendliness, plant milk, and review-derived vibe attributes have been removed from the product surface and public dataset.

The only enrichment filter currently exposed is **coffee brand**. Coffee-brand values are normalised in the publishing scripts and shown only when there is supporting website-derived data.

## Data workflow

The production app reads from `public/cafes.json`. The scripts keep that file limited to display-safe fields and coffee-brand enrichment.

```bash
node scripts/cleanup_public_cafes.js
node scripts/trim_cafes.js
npm run build
```

Use `scripts/publish_enriched.js` when assembling an updated public dataset from source/enrichment files. The publishing step intentionally strips legacy review-derived fields and descriptions before writing the public output.

## Deployment

Vercel is the expected deployment target.

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Set the build command to `npm run build` and the output directory to `dist`.
4. Add `VITE_MAPBOX_TOKEN` and, if using the submission/report forms, the Resend variables listed above.

## Notes for future work

The next useful improvements are stronger admin moderation for submitted cafes, schema validation for `public/cafes.json`, and a more systematic coffee-brand enrichment source. Avoid adding filters unless the source data is reliable enough to keep user trust high.
