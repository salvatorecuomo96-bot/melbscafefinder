"""
After sweep_missing_cafes.py adds new cafes, this filters out non-cafes.
Keeps only places where Google's types include 'cafe' or 'coffee_shop'.
Uses sweep_found.json to identify which cafes came from the sweep.
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
SWEEP_FILE = ROOT / "data" / "sweep_found.json"
PROGRESS   = ROOT / "data" / "filter_progress.json"

VALID_TYPES = {"cafe", "coffee_shop"}

BAD_NAME_KEYWORDS = [
    "pizza", "pizzeria", "burger", "kebab", "sushi", "noodle",
    "bar ", " bar", "hotel", "motel", "tavern", "pub ",
    "petrol", "servo", "service station", "fuel",
    "pool", "aquatic", "tennis", "gym", "fitness", "play centre",
    "candy", "lolly", "confection", "tobacco", "newsagent",
    "bottle shop", "liquor", "wine bar", "beer garden",
    "social club", "rsl ", "bowling club",
]

BAD_TYPES = {
    "bar", "night_club", "gas_station", "liquor_store",
    "restaurant", "lodging", "gym", "stadium",
}


def is_bad_name(name):
    lower = name.lower()
    return any(kw in lower for kw in BAD_NAME_KEYWORDS)


def opens_too_late(opening_hours):
    """Returns True if cafe doesn't open until after 9 AM on any weekday — likely a restaurant."""
    if not opening_hours:
        return False
    weekdays = ["mon", "tue", "wed", "thu", "fri"]
    open_times = []
    for d in weekdays:
        val = opening_hours.get(d, "")
        if val and val.lower() != "closed":
            try:
                open_time = val.split("-")[0].strip()
                h, m = map(int, open_time.split(":"))
                open_times.append(h * 60 + m)
            except Exception:
                pass
    if not open_times:
        return False
    avg_open = sum(open_times) / len(open_times)
    return avg_open > 9 * 60  # opens after 9 AM on average


def get_types(place_id):
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/place/details/json",
            params={"place_id": place_id, "fields": "types,name", "key": GOOGLE_KEY},
            timeout=10
        ).json()
        result = r.get("result", {})
        return set(result.get("types", [])), result.get("name", "")
    except Exception:
        return set(), ""


def main():
    if not GOOGLE_KEY:
        print("ERROR: GOOGLE_PLACES_KEY not set in .env")
        sys.exit(1)

    if not SWEEP_FILE.exists():
        print("No sweep_found.json — nothing to filter")
        return

    sweep = json.loads(SWEEP_FILE.read_text(encoding="utf-8"))
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))

    # Build set of place_ids from sweep
    sweep_pids = set(sweep.keys())

    # Build id→cafe map and find sweep cafe ids
    # New cafes from sweep have their place_id in googleMapsUrl
    def extract_pid(url):
        m = re.search(r"query_place_id=([\w-]+)", url or "")
        return m.group(1) if m else None

    sweep_cafe_ids = {
        c["id"] for c in cafes
        if extract_pid(c.get("googleMapsUrl", "")) in sweep_pids
    }

    print(f"Total cafes: {len(cafes)}")
    print(f"Cafes from sweep: {len(sweep_cafe_ids)}")

    prog = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    done = set(prog.keys())

    to_check = [c for c in cafes if c["id"] in sweep_cafe_ids and c["id"] not in done]
    print(f"To check: {len(to_check)}")

    remove_ids = set(k for k, v in prog.items() if v == "remove")

    for i, cafe in enumerate(to_check):
        pid = extract_pid(cafe.get("googleMapsUrl", ""))
        if not pid:
            prog[cafe["id"]] = "no_pid"
            continue

        types, gname = get_types(pid)
        time.sleep(0.1)

        is_cafe = bool(types & VALID_TYPES)
        has_bad_type = bool(types & BAD_TYPES)
        has_bad_name = is_bad_name(cafe.get("name", ""))
        too_late = opens_too_late(cafe.get("openingHours") or {})

        keep = is_cafe and not has_bad_type and not has_bad_name and not too_late
        status = "keep" if keep else "remove"
        reason = "" if keep else f" [{'not cafe type' if not is_cafe else 'bad type' if has_bad_type else 'bad name' if has_bad_name else 'opens too late'}]"
        prog[cafe["id"]] = status

        flag = "" if keep else f"  *** REMOVING{reason} ***"
        print(f"{i+1}/{len(to_check)} | {cafe['name']} ({cafe.get('suburb')}) | {status}{flag}")

        if not keep:
            remove_ids.add(cafe["id"])

        if (i + 1) % 30 == 0:
            PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")

    PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")

    if remove_ids:
        before = len(cafes)
        cafes = [c for c in cafes if c["id"] not in remove_ids]
        CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nRemoved {before - len(cafes)} non-cafes. Total now: {len(cafes)}")
    else:
        print("\nAll sweep cafes passed the filter.")


if __name__ == "__main__":
    main()
