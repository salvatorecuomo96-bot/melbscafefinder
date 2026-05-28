"""
Rescrapes Google Maps for cafes in Melbourne CBD (postcode 3000) without any API key.
Searches by area and by street to maximise coverage, then adds any missing ones
to public/cafes.json with images uploaded to Cloudinary.
"""

import asyncio
import io
import json
import os
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import cloudinary
import cloudinary.uploader
from playwright.async_api import async_playwright

ROOT = Path(__file__).parent.parent
CAFES_FILE = ROOT / "public" / "cafes.json"

env_file = ROOT / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME", "dxevftbv7"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)

# Search queries to maximise CBD coverage
CBD_SEARCHES = [
    "cafe Melbourne CBD 3000",
    "coffee Melbourne CBD",
    "cafe Flinders Lane Melbourne",
    "cafe Collins Street Melbourne",
    "cafe Bourke Street Melbourne",
    "cafe Lonsdale Street Melbourne",
    "cafe Swanston Street Melbourne",
    "cafe Elizabeth Street Melbourne",
    "cafe Little Collins Street Melbourne",
    "cafe Little Bourke Street Melbourne",
    "cafe Queen Street Melbourne",
    "cafe Spencer Street Melbourne",
    "cafe King Street Melbourne",
    "cafe William Street Melbourne",
    "cafe Melbourne Central",
    "cafe QVM Melbourne",
    "cafe Degraves Street Melbourne",
    "cafe Hardware Lane Melbourne",
    "dessert cafe Melbourne CBD",
    "specialty coffee Melbourne CBD",
]

DAY_MAP = {
    "Monday": "mon", "Tuesday": "tue", "Wednesday": "wed",
    "Thursday": "thu", "Friday": "fri", "Saturday": "sat", "Sunday": "sun",
}
MAX_IMAGES = 4


def make_id(name, suburb):
    return re.sub(r"[^a-z0-9]+", "-", f"{name}-{suburb}".lower()).strip("-")


def parse_coords_from_url(url):
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None, None


def to24(t):
    t = t.strip()
    if re.match(r"\d{1,2}:\d{2}$", t):
        return t.zfill(5)
    try:
        from datetime import datetime
        return datetime.strptime(t, "%I:%M %p").strftime("%H:%M")
    except Exception:
        return t


def upload_image(url: str, cafe_id: str, idx: int) -> str | None:
    try:
        result = cloudinary.uploader.upload(
            url,
            folder="cafes",
            public_id=f"{cafe_id}_{idx}",
            overwrite=False,
            resource_type="image",
        )
        return result.get("secure_url")
    except Exception as e:
        print(f"    [img error] {e}")
        return None


async def scrape_listing_names(page, query: str) -> list[dict]:
    """Search Google Maps and extract all venue names from the results list."""
    url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)
    except Exception:
        return []

    # Scroll the results panel to load more
    results_panel = page.locator('[role="feed"]')
    try:
        for _ in range(8):
            await results_panel.evaluate("el => el.scrollBy(0, 500)")
            await page.wait_for_timeout(600)
    except Exception:
        pass

    # Extract listing cards
    items = await page.evaluate("""(function() {
        var cards = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
        var seen = {};
        return cards.map(function(a) {
            var nameEl = a.querySelector('[class*="fontHeadlineSmall"], .qBF1Pd, .NrDZNb');
            var name = nameEl ? nameEl.innerText.trim() : a.getAttribute('aria-label') || '';
            var href = a.href;
            return {name: name, href: href};
        }).filter(function(x) {
            if (!x.name || x.name.length < 2 || seen[x.name]) return false;
            seen[x.name] = 1;
            return true;
        });
    })()""")

    return items


async def scrape_place_details(page, name: str) -> dict:
    """Scrape details from the currently loaded Google Maps place page."""
    result = {
        "address": None, "phone": None, "website": None,
        "rating": None, "userRatingsTotal": None,
        "openingHours": {}, "latitude": None, "longitude": None,
        "googleMapsUrl": None, "rawImageUrls": [],
    }

    current_url = page.url
    lat, lng = parse_coords_from_url(current_url)
    result["latitude"] = lat
    result["longitude"] = lng

    pid_match = re.search(r"query_place_id=([^&]+)", current_url)
    if pid_match:
        result["googleMapsUrl"] = (
            f"https://www.google.com/maps/search/?api=1"
            f"&query={name.replace(' ', '+')}+Melbourne+CBD"
            f"&query_place_id={pid_match.group(1)}"
        )

    text = await page.evaluate("document.body.innerText")

    # Skip non-cafes based on page text
    skip_keywords = ["petrol", "service station", "supermarket", "pharmacy", "gym", "fitness"]
    if any(k in text.lower() for k in skip_keywords):
        result["_skip"] = True
        return result

    addr_match = re.search(
        r"(\d+[^,\n]+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Place|Pl|"
        r"Drive|Dr|Way|Boulevard|Blvd|Parade|Pde|Court|Ct|Crescent|Cres)"
        r"[^,\n]*,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+VIC\s+\d{4})",
        text,
    )
    if addr_match:
        result["address"] = addr_match.group(1).strip()

    # Only keep CBD results (postcode 3000 or known CBD streets)
    if result["address"] and "VIC" in result["address"]:
        postcode_m = re.search(r"VIC\s+(\d{4})", result["address"])
        if postcode_m and postcode_m.group(1) != "3000":
            result["_skip"] = True
            return result

    phone_match = re.search(r"(\(0\d\)\s*\d{4}\s*\d{4}|04\d{2}\s*\d{3}\s*\d{3})", text)
    if phone_match:
        result["phone"] = phone_match.group(1)

    rating_match = re.search(r"(\d\.\d)\s*\((\d[\d,]+)\)", text)
    if rating_match:
        result["rating"] = float(rating_match.group(1))
        result["userRatingsTotal"] = int(rating_match.group(2).replace(",", ""))

    try:
        website_btn = page.locator('a[data-item-id="authority"]').first
        href = await website_btn.get_attribute("href", timeout=2000)
        if href and href.startswith("http"):
            result["website"] = href
    except Exception:
        pass

    hours = {}
    for day_full, day_key in DAY_MAP.items():
        pattern = (
            rf"{day_full}\s+(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?)"
            rf"\s*[–\-]\s*(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?|(?:Open\s+24\s+hours?))"
        )
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            close = m.group(2).strip()
            hours[day_key] = "Open 24h" if re.search(r"24\s*h", close, re.I) else f"{to24(m.group(1))} - {to24(close)}"
    result["openingHours"] = hours

    # Scrape images
    try:
        await page.wait_for_timeout(1000)
        img_urls = await page.evaluate("""(function() {
            return Array.from(document.querySelectorAll('img'))
                .map(function(img) { return img.src || ''; })
                .filter(function(src) {
                    return src && src.includes('googleusercontent.com')
                        && !src.match(/=w[1-4][0-9]$/) && !src.match(/=s[1-4][0-9]$/)
                        && src.length > 60;
                });
        })()""")
        cleaned = []
        for u in img_urls[:MAX_IMAGES * 2]:
            u = re.sub(r"=w\d+", "=w800", u)
            u = re.sub(r"=s\d+", "=s800", u)
            cleaned.append(u)
        result["rawImageUrls"] = list(dict.fromkeys(cleaned))[:MAX_IMAGES]
    except Exception:
        pass

    if not result["googleMapsUrl"]:
        result["googleMapsUrl"] = (
            f"https://www.google.com/maps/search/?api=1&query={name.replace(' ', '+')}+Melbourne+CBD"
        )

    return result


def build_entry(name, scraped, cloudinary_images):
    return {
        "id": make_id(name, "Melbourne"),
        "name": name,
        "suburb": "Melbourne",
        "address": scraped.get("address") or "",
        "latitude": scraped.get("latitude") or 0,
        "longitude": scraped.get("longitude") or 0,
        "rating": scraped.get("rating"),
        "userRatingsTotal": scraped.get("userRatingsTotal"),
        "reviewCount": scraped.get("userRatingsTotal"),
        "phone": scraped.get("phone"),
        "website": scraped.get("website"),
        "openingHours": scraped.get("openingHours", {}),
        "googleMapsUrl": scraped.get("googleMapsUrl"),
        "images": cloudinary_images,
        "shortDescription": None, "tags": [], "specialtyCoffee": None,
        "coffeeBrand": None, "priceLevel": None,
        "hiddenGem": None, "locallyOwned": None, "matcha": None,
        "hasDecaf": None, "filterCoffee": None, "pastries": None,
        "breakfastAllDay": None, "brunchQuality": None, "veganOptions": None,
        "hasWifi": None, "hasPowerOutlets": None, "laptopFriendly": None,
        "outdoorSeating": None, "dogFriendly": None, "pramFriendly": None,
        "kidFriendly": None, "noiseLevel": None, "serviceStyle": None,
    }


def normalise(name):
    n = name.lower()
    n = re.sub(r"[''`''‘’“”]", "", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    return re.sub(r"\s+", " ", n).strip()


async def main():
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    existing_ids = {c["id"] for c in cafes}
    existing_lower = {c["name"].lower() for c in cafes}
    existing_norm = {normalise(c["name"]) for c in cafes}

    print(f"Current CBD cafes: {sum(1 for c in cafes if c['suburb'] == 'Melbourne')}")
    print(f"Total in database: {len(cafes)}")

    # Collect all listing names from all searches
    all_candidates: dict[str, str] = {}  # name -> href

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-AU",
        )
        page = await context.new_page()

        # Phase 1: collect all candidate names
        print("\n=== Phase 1: Collecting listings ===")
        for query in CBD_SEARCHES:
            items = await scrape_listing_names(page, query)
            new = 0
            for item in items:
                if item["name"] and item["name"] not in all_candidates:
                    all_candidates[item["name"]] = item["href"]
                    new += 1
            print(f"  '{query}': {len(items)} results, {new} new")
            await asyncio.sleep(1.5)

        print(f"\nTotal unique candidates: {len(all_candidates)}")

        # Phase 2: filter to ones not already in our database
        missing_names = []
        for name in all_candidates:
            nl = name.lower()
            nn = normalise(name)
            if nl not in existing_lower and nn not in existing_norm:
                close = any(
                    nn and ex and len(nn) > 4 and (nn in ex or ex in nn)
                    for ex in existing_norm if ex and len(ex) > 4
                )
                if not close:
                    missing_names.append(name)

        print(f"Not in database: {len(missing_names)}")
        for n in missing_names:
            print(f"  {n}")

        if not missing_names:
            print("Nothing new to add!")
            await browser.close()
            return

        # Phase 3: scrape details + add
        print(f"\n=== Phase 2: Scraping details for {len(missing_names)} new cafes ===")
        added = []

        for i, name in enumerate(missing_names):
            print(f"\n{i+1}/{len(missing_names)} | {name}")
            try:
                href = all_candidates[name]
                await page.goto(href, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(3000)

                details = await scrape_place_details(page, name)

                if details.get("_skip"):
                    print(f"  SKIP (non-CBD or non-cafe)")
                    continue

                # Upload images
                cafe_id = make_id(name, "Melbourne")
                cloudinary_images = []
                if details["rawImageUrls"]:
                    for idx, img_url in enumerate(details["rawImageUrls"]):
                        cdn_url = upload_image(img_url, cafe_id, idx)
                        if cdn_url:
                            cloudinary_images.append(cdn_url)

                entry = build_entry(name, details, cloudinary_images)

                if entry["id"] in existing_ids or name.lower() in existing_lower:
                    print(f"  SKIP (exists)")
                    continue

                existing_ids.add(entry["id"])
                existing_lower.add(name.lower())
                cafes.append(entry)
                added.append(name)

                print(f"  addr:   {entry['address']}")
                print(f"  rating: {entry['rating']} ({entry['userRatingsTotal']} reviews)")
                print(f"  hours:  {len(entry['openingHours'])} days")
                print(f"  images: {len(cloudinary_images)}")

                if len(added) % 10 == 0:
                    CAFES_FILE.write_text(json.dumps(cafes, indent=2), encoding="utf-8")
                    print(f"  [saved — {len(added)} added]")

            except Exception as e:
                print(f"  ERROR: {e}")

            await asyncio.sleep(2.5)

        await browser.close()

    CAFES_FILE.write_text(json.dumps(cafes, indent=2), encoding="utf-8")
    print(f"\n=== DONE ===")
    print(f"Added {len(added)} new CBD cafes. Total now: {len(cafes)}")
    for n in added:
        print(f"  + {n}")


if __name__ == "__main__":
    asyncio.run(main())
