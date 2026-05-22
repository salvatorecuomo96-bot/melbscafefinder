# Melbourne Cafe Scraper

Pulls every cafe in Greater Melbourne from the **Geoapify Places API** using a
dense grid strategy. Covers ~1,400 km² in ~260 overlapping grid cells with full
pagination — giving near-complete coverage of every named cafe in the metro area.

## What you get

| File | Description |
|------|-------------|
| `output/master_cafes_geoapify.json` | Full rich payload — every field Geoapify returns |
| `output/master_cafes_geoapify.csv`  | Flat CSV — ready to import into Excel / the app |
| `output/checkpoint.json`           | Resume state — delete to restart from scratch |
| `output/scraper.log`               | Full run log |

Fields extracted per cafe: `name`, `suburb`, `postcode`, `lat`, `lon`, `phone`,
`website`, `email`, `opening_hours`, `categories`, `formatted address`, `osm_id`,
and any `facilities` (outdoor seating, wheelchair, takeaway, delivery).

---

## Setup

### 1. Navigate to this folder

```powershell
cd C:\Users\User\OneDrive\Desktop\melbscafefinder\scraper
```

### 2. Create your `.env` file

```powershell
Copy-Item .env.example .env
```

Then open `.env` and add your Geoapify API key:

```
GEOAPIFY_API_KEY=your_key_here
```

Get a free key at https://www.geoapify.com (3,000 credits/day free).

### 3. Install dependencies

```powershell
C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe -m pip install -r requirements.txt
```

---

## Run

```powershell
C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe main.py
```

The script will:
1. Print a grid summary (~260 cells to scan)
2. Show a live progress bar with place count
3. Auto-save a checkpoint every 10 cells
4. Write both output files when complete

**Estimated time:** 10–20 minutes on a normal connection (free-tier rate limiting).

---

## Resume after interruption

Just re-run the same command — the script reads `output/checkpoint.json` and
skips cells it has already processed:

```powershell
C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe main.py
```

To start completely fresh, delete the checkpoint:

```powershell
Remove-Item output\checkpoint.json
```

---

## Geoapify free tier limits

| Metric | Value |
|--------|-------|
| Credits/day | 3,000 |
| Cost per Places request | ~6.5 credits (500 results) |
| Max requests/day | ~460 |
| Grid cells in this run | ~260 |
| Expected credit usage | ~1,700 |

The default 0.6 s delay between requests keeps you well within the per-minute
rate cap. If you hit a 402 error the script exits cleanly — just re-run
the next day and it will resume from where it stopped.

---

## Importing data into the app

After the scraper finishes, run the converter (coming soon) to transform
`master_cafes_geoapify.csv` into the `src/data/cafes.js` format used by the app.
