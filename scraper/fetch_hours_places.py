"""
Fetches opening hours for cafes using Google Places API.
Uses place_id from googleMapsUrl where available, otherwise searches by name+address.
Progress saved to data/hours_places_progress.json (resumable).
Updates public/cafes.json when done.

Cost: ~$0.017 per cafe (place/details call). 539 cafes ≈ $9 total.
Run: python scraper/fetch_hours_places.py
"""

import io
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs, quote

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

GOOGLE_KEY = os.getenv("GOOGLE_PLACES_KEY")
CAFES_FILE = ROOT / "public" / "cafes.json"
PROGRESS   = ROOT / "data" / "hours_places_progress.json"

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_MAP = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}


def hours_known(oh):
    if not oh:
        return False
    return any(oh.get(d, "").strip().lower() not in ("", "closed") for d in DAYS)


def extract_place_id(url):
    if not url:
        return None
    m = re.search(r"query_place_id=([\w-]+)", url)
    return m.group(1) if m else None


def find_place_id(name, address, suburb):
    query = f"{name} {suburb} Melbourne"
    url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
    resp = requests.get(url, params={
        "input": query,
        "inputtype": "textquery",
        "fields": "place_id",
        "key": GOOGLE_KEY,
    }, timeout=10)
    data = resp.json()
    candidates = data.get("candidates", [])
    if candidates:
        return candidates[0].get("place_id")
    return None


def get_place_hours(place_id):
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    resp = requests.get(url, params={
        "place_id": place_id,
        "fields": "opening_hours",
        "key": GOOGLE_KEY,
    }, timeout=10)
    data = resp.json()
    result = data.get("result", {})
    oh = result.get("opening_hours", {})
    periods = oh.get("periods", [])
    if not periods:
        return None

    hours = {}
    for period in periods:
        open_info  = period.get("open", {})
        close_info = period.get("close", {})
        day_num = open_info.get("day")
        if day_num is None:
            continue
        day_key = DAY_MAP.get(day_num)
        if not day_key:
            continue

        open_time  = open_info.get("time", "")
        close_time = close_info.get("time", "")
        if open_time and close_time:
            o = f"{open_time[:2]}:{open_time[2:]}"
            c = f"{close_time[:2]}:{close_time[2:]}"
            hours[day_key] = f"{o} - {c}"

    return hours if hours_known(hours) else None


def main():
    if not GOOGLE_KEY:
        print("ERROR: GOOGLE_PLACES_KEY not set in .env")
        sys.exit(1)

    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    todo_all = [c for c in cafes if not hours_known(c.get("openingHours") or {})]

    prog = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    done = set(prog.keys())
    todo = [c for c in todo_all if c["id"] not in done]
    found = sum(1 for v in prog.values() if v and hours_known(v))

    print(f"Total needing hours: {len(todo_all)} | Done: {len(done)} | To do: {len(todo)} | Found so far: {found}")

    for i, cafe in enumerate(todo):
        n = len(done) + 1
        print(f"{n}/{len(todo_all)} | {cafe['name']} — {cafe.get('suburb', '')}", end="", flush=True)

        place_id = extract_place_id(cafe.get("googleMapsUrl"))

        if not place_id:
            place_id = find_place_id(cafe["name"], cafe.get("address", ""), cafe.get("suburb", ""))
            time.sleep(0.1)

        hours = None
        if place_id:
            hours = get_place_hours(place_id)
            time.sleep(0.1)

        if hours:
            print(f"  [found] {hours}")
            found += 1
        else:
            print(f"  — not found")

        prog[cafe["id"]] = hours or {}
        done.add(cafe["id"])

        if len(done) % 25 == 0:
            PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"  [checkpoint — {found}/{len(done)} found]")

    PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nDone. Found hours for {found} / {len(todo_all)} cafes.")

    # Apply to cafes.json
    cafe_map = {c["id"]: c for c in cafes}
    patched = 0
    for cid, hours in prog.items():
        if cid in cafe_map and hours and hours_known(hours):
            cafe_map[cid]["openingHours"] = hours
            patched += 1

    CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Written hours to {patched} cafes in cafes.json")


if __name__ == "__main__":
    main()
