"""
Finds cafes with coordinates outside real Melbourne bounds and fixes them via Places API.
Melbourne inner suburbs: lat -38.2 to -37.5, lng 144.85 to 145.55
Suspicious: lng < 144.85 (places them west of Werribee/Balliang area)

Progress saved to data/fix_coords_progress.json (resumable).
"""

import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

GOOGLE_KEY = os.getenv("GOOGLE_PLACES_KEY")
CAFES_FILE = ROOT / "public" / "cafes.json"
PROGRESS   = ROOT / "data" / "fix_coords_progress.json"

# Melbourne bounding box — anything outside this is suspect
LAT_MIN, LAT_MAX = -38.25, -37.45
LNG_MIN, LNG_MAX = 144.44, 145.75


def is_bad_coord(lat, lng):
    if not lat or not lng:
        return True
    return not (LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX)


def fix_coords(name, suburb, address):
    query = f"{name} {suburb} Melbourne"
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
            params={"input": query, "inputtype": "textquery",
                    "fields": "place_id,geometry,name,formatted_address", "key": GOOGLE_KEY},
            timeout=10
        ).json()
        cands = r.get("candidates", [])
        if not cands:
            return None, None, None
        loc = cands[0].get("geometry", {}).get("location", {})
        return loc.get("lat"), loc.get("lng"), cands[0].get("place_id")
    except Exception:
        return None, None, None


def main():
    if not GOOGLE_KEY:
        print("ERROR: GOOGLE_PLACES_KEY not set in .env")
        sys.exit(1)

    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    bad = [c for c in cafes if is_bad_coord(c.get("latitude"), c.get("longitude"))]

    prog = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    done = set(prog.keys())
    todo = [c for c in bad if c["id"] not in done]

    print(f"Cafes with bad coordinates: {len(bad)}")
    print(f"Already fixed: {len(done)}, remaining: {len(todo)}")

    fixed = 0
    for i, cafe in enumerate(todo):
        name, suburb = cafe["name"], cafe.get("suburb", "")
        lat, lng = cafe.get("latitude"), cafe.get("longitude")
        print(f"{i+1}/{len(todo)} | {name} ({suburb}) — current: {lat}, {lng}", end="", flush=True)

        new_lat, new_lng, place_id = fix_coords(name, suburb, cafe.get("address", ""))
        time.sleep(0.15)

        if new_lat and not is_bad_coord(new_lat, new_lng):
            cafe["latitude"] = new_lat
            cafe["longitude"] = new_lng
            if place_id:
                url = cafe.get("googleMapsUrl", "")
                if "query_place_id" not in url:
                    cafe["googleMapsUrl"] = (
                        f"https://www.google.com/maps/search/?api=1"
                        f"&query={name.replace(' ','+')}+{suburb.replace(' ','+')}+Melbourne"
                        f"&query_place_id={place_id}"
                    )
            print(f"  → fixed: {new_lat}, {new_lng}")
            fixed += 1
            prog[cafe["id"]] = {"fixed": True, "lat": new_lat, "lng": new_lng}
        else:
            print(f"  — could not fix (got {new_lat}, {new_lng})")
            prog[cafe["id"]] = {"fixed": False}

        if (i + 1) % 20 == 0:
            PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")
            CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"  [checkpoint — {fixed}/{i+1} fixed]")

    PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")
    CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nDone. Fixed {fixed} / {len(todo)} bad coordinates.")


if __name__ == "__main__":
    main()
