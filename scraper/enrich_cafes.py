"""
Enriches cafes.json with:
  1. Re-merges any new cafes found by sweep_missing_cafes.py (in case menu scraper overwrote them)
  2. Photos — fetches Google photos for cafes with < 2 images
  3. Price level — fills missing priceLevel from Google
  4. Ratings — refreshes rating + userRatingsTotal for all cafes

Run AFTER sweep_missing_cafes.py and scrape_menu_images.py have finished.
Progress saved to data/enrich_progress.json (resumable).
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

GOOGLE_KEY  = os.getenv("GOOGLE_PLACES_KEY")
CAFES_FILE  = ROOT / "public" / "cafes.json"
SWEEP_FILE  = ROOT / "data"   / "sweep_found.json"
PROGRESS    = ROOT / "data"   / "enrich_progress.json"

DAYS    = ["mon","tue","wed","thu","fri","sat","sun"]
DAY_MAP = {0:"mon",1:"tue",2:"wed",3:"thu",4:"fri",5:"sat",6:"sun"}


def hours_known(oh):
    return any((oh or {}).get(d,"").strip().lower() not in ("","closed") for d in DAYS)


def find_place_id(name, suburb):
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
            params={"input": f"{name} {suburb} Melbourne", "inputtype": "textquery",
                    "fields": "place_id", "key": GOOGLE_KEY},
            timeout=10
        ).json()
        cands = r.get("candidates", [])
        return cands[0].get("place_id") if cands else None
    except Exception:
        return None


def get_details(place_id, fields):
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/place/details/json",
            params={"place_id": place_id, "fields": fields, "key": GOOGLE_KEY},
            timeout=10
        ).json()
        return r.get("result", {})
    except Exception:
        return {}


def photo_url(ref, width=800):
    return f"https://maps.googleapis.com/maps/api/place/photo?maxwidth={width}&photo_reference={ref}&key={GOOGLE_KEY}"


def extract_place_id(url):
    m = re.search(r"query_place_id=([\w-]+)", url or "")
    return m.group(1) if m else None


def parse_hours(result):
    hours = {}
    for p in result.get("opening_hours", {}).get("periods", []):
        d = DAY_MAP.get(p.get("open", {}).get("day"))
        ot = p.get("open", {}).get("time", "")
        ct = p.get("close", {}).get("time", "")
        if d and ot and ct:
            hours[d] = f"{ot[:2]}:{ot[2:]} - {ct[:2]}:{ct[2:]}"
    return hours


def suburb_from_address(address):
    m = re.search(r",\s*([A-Za-z\s]+)\s+VIC\s+\d{4}", address or "")
    return m.group(1).strip() if m else ""


def make_id(name, suburb):
    return re.sub(r"[^a-z0-9]+", "-", f"{name} {suburb}".lower()).strip("-")


def main():
    if not GOOGLE_KEY:
        print("ERROR: GOOGLE_PLACES_KEY not set in .env")
        sys.exit(1)

    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    cafe_map = {c["id"]: c for c in cafes}

    # ── Step 1: Re-merge + filter new cafes from sweep ───────────────────────
    # Processes ALL 790 sweep entries (not just details_fetched=True).
    # Fetches types inline so non-cafes are skipped before enrich runs on them.
    VALID_TYPES = {"cafe", "coffee_shop"}
    BAD_TYPES   = {"bar", "night_club", "gas_station", "liquor_store",
                   "restaurant", "lodging", "gym", "stadium"}
    BAD_NAME_KW = [
        "pizza", "pizzeria", "burger", "kebab", "sushi", "noodle",
        "bar ", " bar", "hotel", "motel", "tavern", "pub ",
        "petrol", "servo", "service station", "fuel", "play centre",
        "bottle shop", "liquor", "wine bar", "beer garden",
        "social club", "rsl ", "bowling club", "mcdonald",
    ]

    if SWEEP_FILE.exists():
        sweep = json.loads(SWEEP_FILE.read_text(encoding="utf-8"))

        # Build existing place_id set for fast dedup
        existing_pids = set()
        for c in cafes:
            pid_m = re.search(r"query_place_id=([\w-]+)", c.get("googleMapsUrl","") or "")
            if pid_m:
                existing_pids.add(pid_m.group(1))
        existing_coords = [(c.get("latitude",0), c.get("longitude",0)) for c in cafes]
        existing_ids = set(cafe_map.keys())

        todo_sweep = [
            (pid, p) for pid, p in sweep.items()
            if pid not in existing_pids
        ]
        print(f"Sweep entries to merge: {len(todo_sweep)} (of {len(sweep)} total)")

        added = skipped = 0
        for i, (pid, p) in enumerate(todo_sweep):
            lat, lng = p.get("lat", 0), p.get("lng", 0)
            if not lat or not lng:
                continue
            # Proximity dedup
            if any(
                abs(elat - lat) * 111000 < 80 and abs(elng - lng) * 88000 < 80
                for elat, elng in existing_coords if elat and elng
            ):
                continue

            detail = get_details(pid,
                "name,formatted_address,geometry,rating,user_ratings_total,"
                "price_level,opening_hours,formatted_phone_number,website,photos,types")
            time.sleep(0.15)
            if not detail:
                continue

            types = set(detail.get("types", []))
            name  = detail.get("name", p.get("name", ""))

            # Type + name filter — same rules as filter_sweep_cafes.py
            bad_name = any(kw in name.lower() for kw in BAD_NAME_KW)
            if not (types & VALID_TYPES) or (types & BAD_TYPES) or bad_name:
                skipped += 1
                print(f"  SKIP {name} — {types & (VALID_TYPES | BAD_TYPES) or 'bad name'}")
                existing_pids.add(pid)
                continue

            addr   = detail.get("formatted_address", "")
            suburb = suburb_from_address(addr)
            hours  = parse_hours(detail)
            photos = [photo_url(ph["photo_reference"]) for ph in detail.get("photos", [])[:5]]
            cafe_obj = {
                "id": make_id(name, suburb),
                "name": name,
                "suburb": suburb,
                "address": addr,
                "latitude": detail.get("geometry",{}).get("location",{}).get("lat", lat),
                "longitude": detail.get("geometry",{}).get("location",{}).get("lng", lng),
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
                "googleMapsUrl": (
                    f"https://www.google.com/maps/search/?api=1"
                    f"&query={name.replace(' ','+')}+{suburb.replace(' ','+')}+Melbourne"
                    f"&query_place_id={pid}"
                ),
                "hasWifi": None, "hasPowerOutlets": None,
                "menuImages": [], "plantMilk": None,
            }
            if cafe_obj["id"] not in existing_ids:
                cafes.append(cafe_obj)
                cafe_map[cafe_obj["id"]] = cafe_obj
                existing_coords.append((cafe_obj["latitude"], cafe_obj["longitude"]))
                existing_ids.add(cafe_obj["id"])
                added += 1
                print(f"  ADD {name} ({suburb})")
            existing_pids.add(pid)

            # Checkpoint every 30 so we can resume if interrupted
            if (i + 1) % 30 == 0:
                cafes.sort(key=lambda c: (c.get("suburb",""), c.get("name","")))
                CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
                print(f"  [sweep checkpoint {i+1}/{len(todo_sweep)} — added {added}, skipped {skipped}]")

        if added:
            cafes.sort(key=lambda c: (c.get("suburb",""), c.get("name","")))
            CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Sweep merge done: {added} added, {skipped} non-cafes skipped. Total: {len(cafes)}")

    # ── Step 2: Enrich existing cafes (photos, price, ratings) ────────────────
    prog = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    done = set(prog.keys())
    todo = [c for c in cafes if c["id"] not in done]

    needs_photos = lambda c: len(c.get("images") or []) < 2
    needs_price  = lambda c: c.get("priceLevel") is None
    # All cafes get rating refresh

    print(f"\nEnriching {len(todo)} cafes (photos, price, ratings)...")
    updated = 0

    for i, cafe in enumerate(todo):
        need_ph = needs_photos(cafe)
        need_pr = needs_price(cafe)

        fields = "rating,user_ratings_total"
        if need_ph:
            fields += ",photos"
        if need_pr:
            fields += ",price_level"

        place_id = extract_place_id(cafe.get("googleMapsUrl",""))
        if not place_id:
            place_id = find_place_id(cafe["name"], cafe.get("suburb",""))
            time.sleep(0.1)

        result = {}
        if place_id:
            result = get_details(place_id, fields)
            time.sleep(0.1)

        changed = False
        if result.get("rating") is not None:
            cafe["rating"] = result["rating"]
            changed = True
        if result.get("user_ratings_total") is not None:
            cafe["userRatingsTotal"] = result["user_ratings_total"]
            changed = True
        if need_ph and result.get("photos"):
            new_photos = [photo_url(ph["photo_reference"]) for ph in result["photos"][:5]]
            if new_photos:
                cafe["images"] = new_photos
                changed = True
        if need_pr and result.get("price_level") is not None:
            cafe["priceLevel"] = result["price_level"]
            changed = True

        if changed:
            updated += 1

        prog[cafe["id"]] = True
        done.add(cafe["id"])

        if (i + 1) % 50 == 0:
            PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")
            CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"  {i+1}/{len(todo)} done, {updated} updated")

    PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")
    cafes.sort(key=lambda c: (c.get("suburb",""), c.get("name","")))
    CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nDone. Updated {updated} cafes. Total: {len(cafes)}")


if __name__ == "__main__":
    main()
