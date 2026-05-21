# Melbourne Cafe Finder

A mobile-first, map-driven cafe discovery app for Melbourne. Filters on the things Google Maps does badly: laptop friendly, oat milk, quiet, specialty coffee, outdoor seating, dog friendly, and more.

Built with React + Vite + Mapbox GL JS. Mock data first, no backend required.

---

## 1. What you need installed

- **Node.js 18+** - download from <https://nodejs.org>. Run `node -v` in PowerShell to confirm.
- **Git** (optional but recommended) - <https://git-scm.com>.

That's it. No Docker, no database.

## 2. Run it locally

From PowerShell, inside this folder:

```powershell
npm install
npm run dev
```

Vite will open the app at <http://localhost:5173>. Edits hot-reload automatically.

> If `npm install` is slow the first time, that's normal - Mapbox GL JS is a chunky download.

### Without a Mapbox token (works out of the box)

The app runs fine with no token - you just see a friendly "add your token" panel where the map would be. The cafe list still works.

### With a Mapbox token (recommended - it's free)

1. Sign up at <https://account.mapbox.com>.
2. Copy your **default public token** from <https://account.mapbox.com/access-tokens/>.
3. In this folder, copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
4. Open `.env` and paste your token after `VITE_MAPBOX_TOKEN=`.
5. Stop the dev server (`Ctrl+C`) and run `npm run dev` again.

You should now see a real Mapbox map of Melbourne with custom cafe pins.

## 3. Folder structure

```
melbscafefinder/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/         # Reusable UI building blocks
│   │   ├── CafeCard/
│   │   ├── CafeDetail/         # Full cafe view (bottom sheet on mobile)
│   │   ├── CafePreviewCard/    # Floating card after a pin click
│   │   ├── EmptyState/
│   │   ├── FilterChips/        # Quick toggle filter pills
│   │   ├── FilterDrawer/       # All filters, in a bottom sheet
│   │   ├── Header/             # Available, currently unused (kept as reference)
│   │   ├── LoadingState/       # Skeleton cards
│   │   ├── MapPlaceholder/     # Old non-Mapbox placeholder, kept as fallback
│   │   ├── MapView/            # The real Mapbox map
│   │   ├── SearchBar/
│   │   └── SortBar/
│   ├── constants/
│   │   └── filters.js          # Single source of truth for filter options
│   ├── data/
│   │   └── cafes.js            # Mock cafe database (~12 real Melbourne spots)
│   ├── hooks/
│   │   ├── useCafeFilters.js   # Filter + sort logic
│   │   └── useGeolocation.js   # Asks the browser for the user's location
│   ├── pages/
│   │   └── Home/               # The only page right now
│   ├── utils/
│   │   ├── distance.js         # Haversine + formatting
│   │   └── format.js           # Price label, open/closed status, etc.
│   ├── App.jsx
│   ├── App.css
│   ├── index.css               # Design tokens + base styles
│   └── main.jsx
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── README.md
└── vite.config.js
```

### Where to add things

- **A new filter** - add it to `src/constants/filters.js` and the matching field on each cafe in `src/data/cafes.js`. The drawer and filter logic pick it up automatically.
- **A new cafe** - just push another object into `CAFES` in `src/data/cafes.js`.
- **A new page** - create `src/pages/YourPage/`, then add `react-router-dom` and replace the single `<Home />` render in `App.jsx` with a `<Routes>` tree.
- **A real backend** - replace the import of `CAFES` in `useCafeFilters.js` with a `fetch()` from your API or Supabase client. Nothing else needs to change.

## 4. Upload to GitHub

```powershell
git init
git add .
git commit -m "Initial commit: Melbourne Cafe Finder MVP"
# Create a new empty repo on github.com, then:
git remote add origin https://github.com/<you>/melbourne-cafe-finder.git
git branch -M main
git push -u origin main
```

> `.env` is git-ignored, so your Mapbox token stays private. Good.

## 5. Deploy (when you're ready)

The fastest free path is **Vercel** or **Netlify**:

1. Push to GitHub (above).
2. Connect the repo in Vercel/Netlify.
3. Build command: `npm run build`. Output: `dist`.
4. Add an environment variable `VITE_MAPBOX_TOKEN` in the dashboard - same value as your local `.env`.

## 6. The next 5 upgrades after this MVP

1. **Real cafe database (Supabase)**
   Create a `cafes` table mirroring the shape in `src/data/cafes.js`, then swap the import in `useCafeFilters.js` for a Supabase fetch. Add image uploads to Supabase Storage. This unlocks user-submitted cafes and admin moderation.

2. **Cluster markers + viewport filtering**
   With more than ~50 cafes the map starts to feel busy. Add Mapbox clustering (built in - just a `cluster: true` source option) and a "Search this area" button so the list reflects what's currently on screen, like Airbnb does.

3. **Auth + favourites**
   Add Supabase Auth (magic link / Google) and a `favourites` table. A heart button on each card lets users save spots. This is the first feature that actually creates retention.

4. **Submit-a-cafe form + photo upload**
   A simple form behind a route like `/submit` that writes a pending row. You moderate from a `/admin` page. Photos go to Supabase Storage with a signed-URL preview. This is the only realistic path to keeping data fresh.

5. **PWA + later React Native**
   Add a manifest + service worker (Vite has plugins for both) so users can install the site to their home screen. The bulk of the app - filter logic, data shape, components by responsibility - already maps cleanly to React Native when you're ready. Anything in `src/hooks/`, `src/utils/`, `src/constants/`, and `src/data/` ports verbatim; the components become the only rewrite.

---

## Common questions

- **The map is blank / says "Add your Mapbox token"** - You're missing a `.env` file. See step 2 above.
- **`npm: command not found`** - Install Node.js from <https://nodejs.org>, then close and reopen PowerShell.
- **Hot reload stopped working** - Stop the server (`Ctrl+C`) and re-run `npm run dev`.
- **I changed `.env` but nothing happened** - Vite only reads env files on startup. Restart `npm run dev`.
