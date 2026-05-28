"""
Adds missing late-night cafes to public/cafes.json.
Uses Playwright to scrape Google Maps pages — no API key needed.
"""

import asyncio
import json
import re
import time
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).parent.parent
CAFES_FILE = ROOT / "public" / "cafes.json"

# ── Cafes with full data already known ──────────────────────────────────────
MANUAL = [
    {
        "id": "pellegrinis-espresso-bar-melbourne",
        "name": "Pellegrini's Espresso Bar",
        "suburb": "Melbourne",
        "address": "66 Bourke Street, Melbourne VIC 3000, Australia",
        "latitude": -37.81360,
        "longitude": 144.96960,
        "rating": 4.4,
        "userRatingsTotal": 3200,
        "reviewCount": 3200,
        "phone": "(03) 9662 1885",
        "website": "https://www.facebook.com/pages/Pellegrinis-Espresso-Bar/146032138772817",
        "openingHours": {
            "mon": "08:00 - 21:00", "tue": "08:00 - 21:00", "wed": "08:00 - 21:00",
            "thu": "08:00 - 21:00", "fri": "08:00 - 22:00", "sat": "08:00 - 22:00",
        },
        "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=Pellegrini%27s+Espresso+Bar+Melbourne&query_place_id=ChIJlfjfvchC1moRCNO0EIFZ1vo",
    },
    {
        "id": "tamisweet-melbourne",
        "name": "TamiSweet",
        "suburb": "Melbourne",
        "address": "145 Lonsdale Street, Melbourne VIC 3000, Australia",
        "latitude": -37.80980,
        "longitude": 144.96860,
        "rating": 4.3,
        "userRatingsTotal": 480,
        "reviewCount": 480,
        "phone": "0451 268 268",
        "website": "https://www.facebook.com/profile.php?id=100063638080309",
        "openingHours": {
            "mon": "08:00 - 19:00", "tue": "08:00 - 19:00", "wed": "08:00 - 19:00",
            "thu": "08:00 - 19:00", "fri": "08:00 - 21:00",
            "sat": "09:00 - 21:00", "sun": "09:00 - 19:00",
        },
        "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=TamiSweet+Melbourne&query_place_id=ChIJuzcI1WhD1moRCgZFl5ZiAgw",
    },
    {
        "id": "sulbing-dessert-cafe-melbourne",
        "name": "Sulbing Dessert Cafe",
        "suburb": "Melbourne",
        "address": "168 Lonsdale Street, Melbourne VIC 3000, Australia",
        "latitude": -37.80940,
        "longitude": 144.96870,
        "rating": 4.1,
        "userRatingsTotal": 1425,
        "reviewCount": 1425,
        "phone": "(03) 9957 1835",
        "website": "https://www.sulbingcafe.com.au/",
        "openingHours": {},
        "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=Sulbing+168+Lonsdale+Melbourne",
    },
    {
        "id": "sulbing-dessert-cafe-hawthorn",
        "name": "Sulbing Dessert Cafe",
        "suburb": "Hawthorn",
        "address": "656 Glenferrie Road, Hawthorn VIC 3122, Australia",
        "latitude": -37.82160,
        "longitude": 145.03940,
        "rating": 4.7,
        "userRatingsTotal": 216,
        "reviewCount": 216,
        "phone": "(03) 9191 9261",
        "website": "https://www.sulbingcafe.com.au/",
        "openingHours": {},
        "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=Sulbing+656+Glenferrie+Hawthorn",
    },
]

# ── Cafes to scrape from Google Maps ────────────────────────────────────────
TO_SCRAPE = [
    {"name": "Cathedral Coffee",            "suburb": "Melbourne",      "search": "Cathedral Coffee Melbourne CBD cafe"},
    {"name": "Good Measure",                "suburb": "Carlton",        "search": "Good Measure cafe Carlton Melbourne"},
    {"name": "Sunhands",                    "suburb": "Carlton",        "search": "Sunhands cafe Carlton Melbourne"},
    {"name": "Lumen People",                "suburb": "Fitzroy",        "search": "Lumen People cafe bar Fitzroy Melbourne"},
    {"name": "Palette",                     "suburb": "North Melbourne","search": "Palette cafe North Melbourne"},
    {"name": "Three Squared Coffee",        "suburb": "Melbourne",      "search": "Three Squared Coffee Melbourne CBD"},
    {"name": "Balha's Pastry",              "suburb": "Brunswick",      "search": "Balha Pastry cafe Brunswick Melbourne"},
    {"name": "Goat House",                  "suburb": "Elsternwick",    "search": "Goat House Cafe Bar Elsternwick Melbourne"},
    {"name": "Abbey Road Cafe",             "suburb": "St Kilda",       "search": "Abbey Road Cafe St Kilda Melbourne"},
    {"name": "La Roche Cafe",               "suburb": "St Kilda",       "search": "La Roche Cafe St Kilda Melbourne"},
    {"name": "Sons of Mary",                "suburb": "Gardenvale",     "search": "Sons of Mary cafe Brighton Gardenvale Melbourne"},
    {"name": "Amiri Cafe",                  "suburb": "Melbourne",      "search": "Amiri Cafe QV Melbourne CBD"},
    {"name": "Miilk Cake Studio",           "suburb": "Melbourne",      "search": "Miilk Cake Studio Melbourne CBD"},
    {"name": "Kaneffi",                     "suburb": "Windsor",        "search": "Kaneffi dessert cafe Windsor Melbourne"},
    {"name": "Dessert Story",               "suburb": "Melbourne",      "search": "Dessert Story Melbourne Chinatown"},
]

DAY_MAP = {"Monday": "mon", "Tuesday": "tue", "Wednesday": "wed",
           "Thursday": "thu", "Friday": "fri", "Saturday": "sat", "Sunday": "sun"}

def make_id(name, suburb):
    return re.sub(r'[^a-z0-9]+', '-', f"{name}-{suburb}".lower()).strip('-')

def parse_coords_from_url(url):
    m = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', url)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None, None

async def scrape_place(page, search_query):
    url = f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}"
    await page.goto(url, wait_until="domcontentloaded", timeout=20000)
    await page.wait_for_timeout(3000)

    result = {
        "address": None, "phone": None, "website": None,
        "rating": None, "userRatingsTotal": None,
        "openingHours": {}, "latitude": None, "longitude": None,
    }

    # Get coords from URL after redirect
    current_url = page.url
    lat, lng = parse_coords_from_url(current_url)
    result["latitude"] = lat
    result["longitude"] = lng

    text = await page.evaluate("document.body.innerText")

    # Address — look for VIC postcode pattern
    addr_match = re.search(r'(\d+[^,\n]+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Place|Pl|Drive|Dr|Way|Boulevard|Blvd|Parade|Pde)[^,\n]*,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+VIC\s+\d{4})', text)
    if addr_match:
        result["address"] = addr_match.group(1).strip()

    # Phone
    phone_match = re.search(r'(\(0\d\)\s*\d{4}\s*\d{4}|04\d{2}\s*\d{3}\s*\d{3})', text)
    if phone_match:
        result["phone"] = phone_match.group(1)

    # Rating
    rating_match = re.search(r'(\d\.\d)\s*\((\d[\d,]+)\)', text)
    if rating_match:
        result["rating"] = float(rating_match.group(1))
        result["userRatingsTotal"] = int(rating_match.group(2).replace(',', ''))

    # Website — try to click Website button
    try:
        website_btn = page.locator('a[data-item-id="authority"]').first
        href = await website_btn.get_attribute('href', timeout=2000)
        if href and href.startswith('http'):
            result["website"] = href
    except Exception:
        pass

    # Hours — look for day patterns in text
    hours = {}
    for day_full, day_key in DAY_MAP.items():
        pattern = rf'{day_full}\s+(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?)\s*[–\-]\s*(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?|(?:Open\s+24\s+hours?))'
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            def to24(t):
                t = t.strip()
                if re.match(r'\d{1,2}:\d{2}$', t):
                    return t.zfill(5)
                try:
                    from datetime import datetime
                    return datetime.strptime(t, '%I:%M %p').strftime('%H:%M')
                except Exception:
                    return t
            open_t = to24(m.group(1))
            close_t = m.group(2).strip()
            if re.search(r'24\s*h', close_t, re.I):
                hours[day_key] = 'Open 24h'
            else:
                hours[day_key] = f"{open_t} - {to24(close_t)}"
    result["openingHours"] = hours

    return result

def build_entry(name, suburb, scraped):
    return {
        "id": make_id(name, suburb),
        "name": name,
        "suburb": suburb,
        "address": scraped.get("address") or "",
        "latitude": scraped.get("latitude") or 0,
        "longitude": scraped.get("longitude") or 0,
        "rating": scraped.get("rating"),
        "userRatingsTotal": scraped.get("userRatingsTotal"),
        "reviewCount": scraped.get("userRatingsTotal"),
        "phone": scraped.get("phone"),
        "website": scraped.get("website"),
        "openingHours": scraped.get("openingHours", {}),
        "images": [],
        "shortDescription": None,
        "tags": [],
        "specialtyCoffee": None,
        "coffeeBrand": None,
        "priceLevel": None,
        "googleMapsUrl": f"https://www.google.com/maps/search/?api=1&query={name.replace(' ', '+')}+{suburb}",
    }

def defaults(entry):
    fields = ["hiddenGem", "locallyOwned", "matcha", "hasDecaf", "filterCoffee",
              "pastries", "breakfastAllDay", "brunchQuality", "veganOptions",
              "hasWifi", "hasPowerOutlets", "laptopFriendly", "outdoorSeating",
              "dogFriendly", "pramFriendly", "kidFriendly", "noiseLevel", "serviceStyle"]
    for f in fields:
        entry.setdefault(f, None)
    return entry

async def main():
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    existing_ids = {c["id"] for c in cafes}
    existing_names = {c["name"].lower() for c in cafes}
    to_add = []

    # Add manual entries
    for entry in MANUAL:
        if entry["id"] in existing_ids or entry["name"].lower() in existing_names:
            print(f"SKIP (exists): {entry['name']}")
            continue
        to_add.append(defaults({**entry, "images": [], "shortDescription": None,
                                  "tags": [], "specialtyCoffee": None, "coffeeBrand": None,
                                  "priceLevel": 2}))
        print(f"MANUAL ADD: {entry['name']} — {entry['suburb']}")

    # Scrape remaining
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="en-AU",
        )
        page = await context.new_page()

        for item in TO_SCRAPE:
            name, suburb, query = item["name"], item["suburb"], item["search"]

            # Check duplicates
            candidate_id = make_id(name, suburb)
            if candidate_id in existing_ids or name.lower() in existing_names:
                print(f"SKIP (exists): {name}")
                continue

            print(f"\nScraping: {name} — {suburb}")
            try:
                scraped = await scrape_place(page, query)
                entry = defaults(build_entry(name, suburb, scraped))
                to_add.append(entry)
                print(f"  addr:  {entry['address']}")
                print(f"  coords:{entry['latitude']}, {entry['longitude']}")
                print(f"  phone: {entry['phone']}")
                print(f"  hours: {entry['openingHours']}")
            except Exception as e:
                print(f"  ERROR: {e}")

            await asyncio.sleep(2.5)

        await browser.close()

    if not to_add:
        print("\nNothing new to add.")
        return

    # Final dedup check
    final = []
    seen_ids = set(existing_ids)
    seen_names = set(existing_names)
    for entry in to_add:
        if entry["id"] in seen_ids or entry["name"].lower() in seen_names:
            print(f"DEDUP SKIP: {entry['name']}")
            continue
        seen_ids.add(entry["id"])
        seen_names.add(entry["name"].lower())
        final.append(entry)

    updated = cafes + final
    CAFES_FILE.write_text(json.dumps(updated, indent=2), encoding="utf-8")
    print(f"\nAdded {len(final)} cafes. Total: {len(updated)}")
    for e in final:
        print(f"  + {e['name']} — {e['suburb']}")

if __name__ == "__main__":
    asyncio.run(main())
