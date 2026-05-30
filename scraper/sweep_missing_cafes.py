"""
Grid sweep using Google Places Nearby Search to find cafes missing from cafes.json.
Covers all of Greater Melbourne with overlapping 2.5km radius circles.
For each new cafe found, fetches full details and adds to cafes.json.

Cost: ~300 grid calls + details for new cafes. Est. $15-25 total (covered by free credit).
Progress saved to data/sweep_progress.json (resumable).
Run: python scraper/sweep_missing_cafes.py
"""

import io
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# Force UTF-8 stdout so Unicode cafe names don't crash the log
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

GOOGLE_KEY = os.getenv("GOOGLE_PLACES_KEY")
CAFES_FILE = ROOT / "public" / "cafes.json"
SWEEP_FILE = ROOT / "data" / "sweep_found.json"
PROGRESS   = ROOT / "data" / "sweep_progress.json"

DAYS    = ["mon","tue","wed","thu","fri","sat","sun"]
DAY_MAP = {0:"mon",1:"tue",2:"wed",3:"thu",4:"fri",5:"sat",6:"sun"}

# 15km circle around Melbourne CBD, 2km grid spacing
CBD_LAT, CBD_LNG = -37.8136, 144.9631
MAX_RADIUS_KM = 15
GRID_STEP_KM  = 1.5   # spacing < radius/√2 guarantees full overlap, no gaps
RADIUS = 2500  # metres per nearby search call


def _dist_km(lat1, lon1, lat2, lon2):
    import math
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def grid_points():
    lat_step = GRID_STEP_KM / 111.0
    lng_step = GRID_STEP_KM / (111.0 * abs(__import__('math').cos(__import__('math').radians(CBD_LAT))))
    lat = CBD_LAT - MAX_RADIUS_KM / 111.0
    while lat <= CBD_LAT + MAX_RADIUS_KM / 111.0:
        lng = CBD_LNG - MAX_RADIUS_KM / 88.0
        while lng <= CBD_LNG + MAX_RADIUS_KM / 88.0:
            if _dist_km(CBD_LAT, CBD_LNG, lat, lng) <= MAX_RADIUS_KM:
                yield round(lat, 6), round(lng, 6)
            lng += lng_step
        lat += lat_step


def nearby_search(lat, lng):
    """Returns list of place dicts from one grid point (up to 60 via pagination)."""
    places = []
    params = {
        "location": f"{lat},{lng}",
        "radius": RADIUS,
        "type": "cafe",
        "key": GOOGLE_KEY,
    }
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

    for page in range(3):
        try:
            r = requests.get(url, params=params, timeout=10).json()
        except Exception:
            break

        status = r.get("status")
        if status not in ("OK", "ZERO_RESULTS"):
            print(f"  API status: {status}")
            break

        places.extend(r.get("results", []))

        token = r.get("next_page_token")
        if not token:
            break
        params = {"pagetoken": token, "key": GOOGLE_KEY}
        time.sleep(2.2)  # Google requires delay before using next_page_token

    return places


def get_place_details(place_id):
    fields = "name,formatted_address,geometry,rating,user_ratings_total,price_level,opening_hours,formatted_phone_number,website,photos,place_id"
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/place/details/json",
            params={"place_id": place_id, "fields": fields, "key": GOOGLE_KEY},
            timeout=10
        ).json()
        return r.get("result")
    except Exception:
        return None


def parse_hours(result):
    hours = {}
    periods = result.get("opening_hours", {}).get("periods", [])
    for p in periods:
        d = DAY_MAP.get(p.get("open", {}).get("day"))
        ot = p.get("open", {}).get("time", "")
        ct = p.get("close", {}).get("time", "")
        if d and ot and ct:
            hours[d] = f"{ot[:2]}:{ot[2:]} - {ct[:2]}:{ct[2:]}"
    return hours


def photo_url(photo_ref, max_width=800):
    return (
        f"https://maps.googleapis.com/maps/api/place/photo"
        f"?maxwidth={max_width}&photo_reference={photo_ref}&key={GOOGLE_KEY}"
    )


def suburb_from_address(address):
    """Extract suburb from formatted address like '75 High St, Malvern VIC 3144, Australia'"""
    m = re.search(r",\s*([A-Za-z\s]+)\s+VIC\s+\d{4}", address)
    return m.group(1).strip() if m else ""


def make_id(name, suburb):
    slug = re.sub(r"[^a-z0-9]+", "-", f"{name} {suburb}".lower()).strip("-")
    return slug


def hours_known(oh):
    return any(oh.get(d, "").strip().lower() not in ("", "closed") for d in DAYS)


def main():
    if not GOOGLE_KEY:
        print("ERROR: GOOGLE_PLACES_KEY not set in .env")
        sys.exit(1)

    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))

    # Build lookup sets for deduplication
    existing_place_ids = set()
    existing_coords = []  # list of (lat, lng, id)
    for c in cafes:
        url = c.get("googleMapsUrl", "")
        m = re.search(r"query_place_id=([\w-]+)", url)
        if m:
            existing_place_ids.add(m.group(1))
        lat = c.get("latitude") or 0
        lng = c.get("longitude") or 0
        if lat and lng:
            existing_coords.append((lat, lng, c["id"]))

    def is_duplicate(place_id, lat, lng):
        if place_id in existing_place_ids:
            return True
        # Check proximity: within 80m
        for elat, elng, _ in existing_coords:
            dlat = (lat - elat) * 111000
            dlng = (lng - elng) * 111000 * 0.85
            if (dlat**2 + dlng**2) ** 0.5 < 80:
                return True
        return False

    # Load existing sweep results
    found_places = json.loads(SWEEP_FILE.read_text(encoding="utf-8")) if SWEEP_FILE.exists() else {}
    prog = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {"done_points": []}
    done_points = set(tuple(p) for p in prog["done_points"])

    all_points = list(grid_points())
    total_points = len(all_points)
    todo_points = [p for p in all_points if p not in done_points]

    print(f"Grid points: {total_points} total, {len(todo_points)} remaining")
    print(f"Existing cafes: {len(cafes)}, already found new: {len(found_places)}")

    # Phase 1: Grid sweep
    new_found = 0
    for i, (lat, lng) in enumerate(todo_points):
        print(f"Grid {len(done_points)+1}/{total_points} ({lat},{lng})", end="", flush=True)
        results = nearby_search(lat, lng)
        batch_new = 0
        for r in results:
            pid = r.get("place_id")
            if not pid or pid in found_places:
                continue
            rlat = r.get("geometry", {}).get("location", {}).get("lat", 0)
            rlng = r.get("geometry", {}).get("location", {}).get("lng", 0)
            if is_duplicate(pid, rlat, rlng):
                continue
            found_places[pid] = {
                "place_id": pid,
                "name": r.get("name", ""),
                "lat": rlat,
                "lng": rlng,
                "rating": r.get("rating"),
                "user_ratings_total": r.get("user_ratings_total"),
                "details_fetched": False,
            }
            existing_coords.append((rlat, rlng, pid))
            batch_new += 1
            new_found += 1

        print(f"  +{batch_new} new (total new: {new_found})")
        done_points.add((lat, lng))
        time.sleep(0.15)

        if (i + 1) % 20 == 0:
            SWEEP_FILE.write_text(json.dumps(found_places, indent=2, ensure_ascii=False), encoding="utf-8")
            prog["done_points"] = [list(p) for p in done_points]
            PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"  [checkpoint saved]")

    SWEEP_FILE.write_text(json.dumps(found_places, indent=2, ensure_ascii=False), encoding="utf-8")
    prog["done_points"] = [list(p) for p in done_points]
    PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nGrid sweep done. Found {new_found} new cafes to add.")

    # Phase 2: Fetch details for new cafes
    need_details = [v for v in found_places.values() if not v.get("details_fetched")]
    print(f"\nFetching details for {len(need_details)} new cafes...")

    new_cafe_objects = []
    for i, p in enumerate(need_details):
        print(f"{i+1}/{len(need_details)} | {p['name']}", end="", flush=True)
        detail = get_place_details(p["place_id"])
        time.sleep(0.15)

        if not detail:
            print("  — no details")
            p["details_fetched"] = True
            continue

        addr = detail.get("formatted_address", "")
        suburb = suburb_from_address(addr)
        hours = parse_hours(detail)
        photos = [photo_url(ph["photo_reference"]) for ph in detail.get("photos", [])[:5]]

        cafe_obj = {
            "id": make_id(detail.get("name", p["name"]), suburb),
            "name": detail.get("name", p["name"]),
            "suburb": suburb,
            "address": addr,
            "latitude": detail.get("geometry", {}).get("location", {}).get("lat", p["lat"]),
            "longitude": detail.get("geometry", {}).get("location", {}).get("lng", p["lng"]),
            "images": photos,
            "rating": detail.get("rating"),
            "userRatingsTotal": detail.get("user_ratings_total"),
            "shortDescription": None,
            "priceLevel": detail.get("price_level"),
            "coffeeBrand": None,
            "openingHours": hours,
            "phone": detail.get("formatted_phone_number"),
            "website": detail.get("website"),
            "instagram": None,
            "googleMapsUrl": f"https://www.google.com/maps/search/?api=1&query={detail.get('name','').replace(' ','+')}+{suburb.replace(' ','+')}+Melbourne&query_place_id={p['place_id']}",
            "hasWifi": None,
            "hasPowerOutlets": None,
            "menuImages": [],
            "plantMilk": None,
        }

        print(f"  suburb={suburb}, hours={'yes' if hours_known(hours) else 'no'}, photos={len(photos)}")
        new_cafe_objects.append(cafe_obj)
        p["details_fetched"] = True

        if (i + 1) % 25 == 0:
            SWEEP_FILE.write_text(json.dumps(found_places, indent=2, ensure_ascii=False), encoding="utf-8")

    SWEEP_FILE.write_text(json.dumps(found_places, indent=2, ensure_ascii=False), encoding="utf-8")

    if new_cafe_objects:
        cafes.extend(new_cafe_objects)
        # Sort by suburb then name
        cafes.sort(key=lambda c: (c.get("suburb", ""), c.get("name", "")))
        CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nAdded {len(new_cafe_objects)} new cafes. Total: {len(cafes)}")
    else:
        print("\nNo new cafes to add.")


if __name__ == "__main__":
    main()
