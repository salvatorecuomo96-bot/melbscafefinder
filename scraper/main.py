#!/usr/bin/env python3
"""
Melbourne Cafe Scraper — Geoapify Places API
=============================================
Covers the entire Greater Melbourne metro area using a grid+pagination strategy.
Each grid cell is small enough (~10 km²) that a single 500-result page almost
always captures every cafe in that cell, giving near-complete coverage.

Outputs:
  output/master_cafes_geoapify.json  — full rich payload
  output/master_cafes_geoapify.csv   — flat table ready for import
  output/checkpoint.json             — resume state (safe to delete to restart)
"""

import os
import sys
import json
import time
import math
import logging
from pathlib import Path
from datetime import datetime

import requests
import pandas as pd
from tqdm import tqdm
from dotenv import load_dotenv

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────

# Greater Melbourne metropolitan bounding box
# Covers CBD → Frankston (S), Sunbury (NW), Lilydale (E), Werribee (SW)
LAT_MIN = -38.60
LAT_MAX = -37.40
LON_MIN = 144.30
LON_MAX = 145.80

# Grid cell size in degrees.
# 0.08° lat ≈ 8.9 km   |   0.08° lon ≈ 6.8 km
# Dense suburbs → at most ~150 cafes per cell, well under the 500-result page limit.
GRID_STEP = 0.08

# Geoapify Places API
BASE_URL  = "https://api.geoapify.com/v2/places"
MAX_LIMIT = 500   # hard API max per request

# Categories that capture Melbourne cafe culture
# catering.cafe          → standard cafes
# catering.coffee_shop   → specialty/espresso bars
# catering.tea_room      → tea houses (some are cafe-style)
CATEGORIES = "catering.cafe,catering.coffee_shop,catering.tea_room"

# Rate limiting — Geoapify free tier: 3,000 credits/day.
# Each call costs ~5 credits + 0.003/result → 500-result page ≈ 6.5 credits.
# 0.6 s delay → comfortably under the per-minute cap.
REQUEST_DELAY = 0.6   # seconds between HTTP calls
MAX_RETRIES   = 4     # retry on transient errors
RETRY_BACKOFF = 2.0   # exponential backoff base (seconds)

# Output
OUTPUT_DIR      = Path("output")
JSON_FILE       = OUTPUT_DIR / "master_cafes_geoapify.json"
CSV_FILE        = OUTPUT_DIR / "master_cafes_geoapify.csv"
CHECKPOINT_FILE = OUTPUT_DIR / "checkpoint.json"
LOG_FILE        = OUTPUT_DIR / "scraper.log"

# ──────────────────────────────────────────────────────────────────────────────
# Logging setup
# ──────────────────────────────────────────────────────────────────────────────

OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Grid generation
# ──────────────────────────────────────────────────────────────────────────────

def generate_grid():
    """
    Return a list of (lat_min, lon_min, lat_max, lon_max) cell tuples that
    tile the entire Greater Melbourne bounding box.
    """
    cells = []
    lat = LAT_MIN
    while lat < LAT_MAX:
        lon = LON_MIN
        while lon < LON_MAX:
            cells.append((
                round(lat, 6),
                round(lon, 6),
                round(min(lat + GRID_STEP, LAT_MAX), 6),
                round(min(lon + GRID_STEP, LON_MAX), 6),
            ))
            lon += GRID_STEP
        lat += GRID_STEP
    return cells


def cell_key(cell):
    """Stable string key for checkpoint dict."""
    return f"{cell[0]},{cell[1]},{cell[2]},{cell[3]}"

# ──────────────────────────────────────────────────────────────────────────────
# Checkpoint (resume support)
# ──────────────────────────────────────────────────────────────────────────────

def load_checkpoint():
    """
    Returns (completed_cell_keys: set, collected_places: dict[place_id → props]).
    If no checkpoint exists, returns empty structures.
    """
    if not CHECKPOINT_FILE.exists():
        return set(), {}
    try:
        data = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
        log.info(
            "Resuming from checkpoint — %d cells done, %d places collected",
            len(data.get("completed", [])),
            len(data.get("places", {})),
        )
        return set(data.get("completed", [])), data.get("places", {})
    except Exception as exc:
        log.warning("Checkpoint unreadable (%s), starting fresh", exc)
        return set(), {}


def save_checkpoint(completed_keys, places):
    tmp = CHECKPOINT_FILE.with_suffix(".tmp")
    tmp.write_text(
        json.dumps({"completed": list(completed_keys), "places": places}, ensure_ascii=False),
        encoding="utf-8",
    )
    tmp.replace(CHECKPOINT_FILE)  # atomic on most OSes

# ──────────────────────────────────────────────────────────────────────────────
# Geoapify API calls
# ──────────────────────────────────────────────────────────────────────────────

def fetch_page(api_key, cell, offset=0):
    """
    Fetch one page (up to MAX_LIMIT results) for a grid cell.
    Returns the parsed JSON response or raises on unrecoverable error.
    """
    lat_min, lon_min, lat_max, lon_max = cell
    params = {
        "categories": CATEGORIES,
        # Geoapify rect filter: lon_min,lat_min,lon_max,lat_max
        "filter":     f"rect:{lon_min},{lat_min},{lon_max},{lat_max}",
        "limit":      MAX_LIMIT,
        "offset":     offset,
        "apiKey":     api_key,
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(BASE_URL, params=params, timeout=30)

            if resp.status_code == 429:
                wait = RETRY_BACKOFF ** attempt
                log.warning("Rate limited — waiting %.1f s (attempt %d)", wait, attempt)
                time.sleep(wait)
                continue

            if resp.status_code == 402:
                log.error("Daily credit quota exhausted. Re-run tomorrow or upgrade plan.")
                sys.exit(1)

            resp.raise_for_status()
            return resp.json()

        except requests.exceptions.ConnectionError as exc:
            wait = RETRY_BACKOFF ** attempt
            log.warning("Connection error: %s — retrying in %.1f s", exc, wait)
            time.sleep(wait)

        except requests.exceptions.Timeout:
            wait = RETRY_BACKOFF ** attempt
            log.warning("Timeout — retrying in %.1f s (attempt %d)", wait, attempt)
            time.sleep(wait)

        except requests.exceptions.HTTPError as exc:
            log.error("HTTP error %s for cell %s offset %d", exc, cell, offset)
            return None

    log.error("All retries exhausted for cell %s offset %d — skipping", cell, offset)
    return None


def fetch_cell(api_key, cell):
    """
    Paginate through all results for one grid cell.
    Returns a list of raw Geoapify feature dicts.
    """
    features = []
    offset = 0

    while True:
        data = fetch_page(api_key, cell, offset)
        time.sleep(REQUEST_DELAY)

        if data is None:
            break

        batch = data.get("features", [])
        features.extend(batch)

        # If we got fewer than MAX_LIMIT results, there are no more pages
        if len(batch) < MAX_LIMIT:
            break

        offset += MAX_LIMIT
        log.debug("  Cell %s — fetched %d so far (offset %d)", cell, len(features), offset)

    return features

# ──────────────────────────────────────────────────────────────────────────────
# Data extraction
# ──────────────────────────────────────────────────────────────────────────────

def extract_place(feature):
    """
    Flatten a Geoapify GeoJSON feature into a clean dict.
    Returns None if the feature has no name (filters out unnamed locations).
    """
    props = feature.get("properties", {})
    name  = (props.get("name") or "").strip()
    if not name:
        return None

    geo  = feature.get("geometry", {})
    coords = geo.get("coordinates", [None, None])
    lon  = coords[0] if len(coords) > 0 else None
    lat  = coords[1] if len(coords) > 1 else None

    # Contact details (present on many OSM-sourced entries)
    contact = props.get("contact", {}) or {}

    # Facilities block (wifi, outdoor seating, etc.)
    facilities = props.get("facilities", {}) or {}

    # Opening hours — OSM format string, e.g. "Mo-Fr 07:00-17:00"
    hours_raw = props.get("opening_hours") or ""

    # Categories list → comma-joined string
    categories = props.get("categories") or []
    categories_str = ", ".join(categories) if isinstance(categories, list) else str(categories)

    return {
        "place_id":      props.get("place_id", ""),
        "name":          name,
        "formatted":     props.get("formatted", ""),
        "street":        props.get("street", ""),
        "housenumber":   props.get("housenumber", ""),
        "suburb":        props.get("suburb") or props.get("city_district") or props.get("locality", ""),
        "postcode":      props.get("postcode", ""),
        "city":          props.get("city", ""),
        "state":         props.get("state", ""),
        "country":       props.get("country", ""),
        "lat":           lat,
        "lon":           lon,
        "phone":         contact.get("phone") or props.get("phone", ""),
        "website":       contact.get("website") or props.get("website", ""),
        "email":         contact.get("email") or props.get("email", ""),
        "opening_hours": hours_raw,
        "categories":    categories_str,
        "wifi":          facilities.get("wheelchair") or "",   # placeholder key varies
        "outdoor_seating": facilities.get("outdoor_seating", ""),
        "wheelchair":    facilities.get("wheelchair", ""),
        "takeaway":      facilities.get("takeaway", ""),
        "delivery":      facilities.get("delivery", ""),
        "raw_facilities": json.dumps(facilities) if facilities else "",
        "osm_id":        props.get("datasource", {}).get("raw", {}).get("osm_id", ""),
        "osm_type":      props.get("datasource", {}).get("raw", {}).get("osm_type", ""),
    }

# ──────────────────────────────────────────────────────────────────────────────
# Export
# ──────────────────────────────────────────────────────────────────────────────

def export(places_dict):
    """Write final JSON and CSV outputs from the places dict."""
    records = list(places_dict.values())
    log.info("Exporting %d unique cafes …", len(records))

    # JSON — full rich payload
    JSON_FILE.write_text(
        json.dumps(records, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log.info("JSON saved → %s", JSON_FILE)

    # CSV — flat table
    df = pd.DataFrame(records)
    # Put key columns first
    priority = ["name", "suburb", "postcode", "lat", "lon", "phone",
                "website", "opening_hours", "categories", "formatted", "place_id"]
    rest = [c for c in df.columns if c not in priority]
    df = df[priority + rest]
    df.to_csv(CSV_FILE, index=False, encoding="utf-8-sig")  # utf-8-sig = Excel-safe BOM
    log.info("CSV saved  → %s", CSV_FILE)

    return df

# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    # Load .env from the scraper/ directory (same folder as this script)
    env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=env_path)

    api_key = os.getenv("GEOAPIFY_API_KEY", "").strip()
    if not api_key:
        log.error("GEOAPIFY_API_KEY not set. Copy .env.example → .env and add your key.")
        sys.exit(1)

    log.info("═" * 60)
    log.info("Melbourne Cafe Scraper — Geoapify Places API")
    log.info("Started at %s", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    log.info("═" * 60)

    # Build grid
    cells = generate_grid()
    total_cells = len(cells)
    log.info(
        "Grid: %.2f°–%.2f° lat, %.2f°–%.2f° lon, step %.2f° → %d cells",
        LAT_MIN, LAT_MAX, LON_MIN, LON_MAX, GRID_STEP, total_cells,
    )

    # Load checkpoint
    completed_keys, places = load_checkpoint()
    remaining = [c for c in cells if cell_key(c) not in completed_keys]
    log.info(
        "%d cells remaining (%d already done, %d places collected so far)",
        len(remaining), len(completed_keys), len(places),
    )

    # Main loop
    new_this_run = 0
    checkpoint_interval = 10  # save checkpoint every N cells

    with tqdm(total=len(remaining), unit="cell", desc="Scanning Melbourne") as pbar:
        for i, cell in enumerate(remaining):
            pbar.set_postfix(places=len(places), new=new_this_run)

            features = fetch_cell(api_key, cell)

            added = 0
            for feat in features:
                record = extract_place(feat)
                if record is None:
                    continue
                pid = record["place_id"]
                if pid and pid not in places:
                    places[pid] = record
                    added += 1
                    new_this_run += 1

            completed_keys.add(cell_key(cell))
            log.debug("Cell %s → %d features, %d new (total %d)", cell, len(features), added, len(places))

            # Periodic checkpoint save
            if (i + 1) % checkpoint_interval == 0:
                save_checkpoint(completed_keys, places)
                log.info("Checkpoint saved — %d places total", len(places))

            pbar.update(1)

    # Final checkpoint
    save_checkpoint(completed_keys, places)

    # Export
    df = export(places)

    # Summary
    log.info("═" * 60)
    log.info("DONE — %d unique cafes across Greater Melbourne", len(places))
    log.info("New this run: %d", new_this_run)
    log.info(
        "Top suburbs:\n%s",
        df["suburb"].value_counts().head(15).to_string()
    )
    log.info("═" * 60)


if __name__ == "__main__":
    main()
