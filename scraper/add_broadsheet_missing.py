"""
Adds all cafes from data/broadsheet_missing.json to public/cafes.json.
Scrapes Google Maps for address/coords/hours/images — no API key needed.
Uploads images to Cloudinary. Resumable.
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
MISSING_FILE = ROOT / "data" / "broadsheet_missing.json"

# Load .env
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
    """Upload an image URL to Cloudinary and return the secure URL."""
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
        print(f"    [img upload error] {e}")
        return None


async def scrape_images(page, max_images: int = MAX_IMAGES) -> list[str]:
    """Extract image URLs from the current Google Maps place page."""
    try:
        # Wait briefly for images to load
        await page.wait_for_timeout(1500)
        # Google Maps photo thumbnails are in img tags with specific URL patterns
        img_urls = await page.evaluate("""(function() {
            var imgs = Array.from(document.querySelectorAll('img'))
                .map(function(img) { return img.src || img.getAttribute('src') || ''; })
                .filter(function(src) {
                    return src && (
                        src.includes('googleusercontent.com') ||
                        src.includes('maps.googleapis.com/maps/api/place/photo')
                    ) && !src.includes('=w20') && !src.includes('=w30') && !src.includes('=w40')
                    && !src.includes('=s20') && !src.includes('=s30') && !src.includes('=s40')
                    && src.length > 60;
                });
            // Deduplicate
            return [...new Set(imgs)];
        })()""")
        # Prefer larger versions by replacing size params
        cleaned = []
        for u in img_urls[:max_images * 2]:
            # Bump up to a reasonable size (800px wide)
            u = re.sub(r"=w\d+", "=w800", u)
            u = re.sub(r"=s\d+", "=s800", u)
            cleaned.append(u)
        return cleaned[:max_images]
    except Exception:
        return []


async def scrape_place(page, name, suburb):
    query = f"{name} cafe {suburb} Melbourne"
    url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
    await page.goto(url, wait_until="domcontentloaded", timeout=20000)
    await page.wait_for_timeout(3000)

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
            f"&query={name.replace(' ', '+')}+{suburb}"
            f"&query_place_id={pid_match.group(1)}"
        )

    text = await page.evaluate("document.body.innerText")

    addr_match = re.search(
        r"(\d+[^,\n]+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Place|Pl|"
        r"Drive|Dr|Way|Boulevard|Blvd|Parade|Pde|Court|Ct|Crescent|Cres)"
        r"[^,\n]*,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+VIC\s+\d{4})",
        text,
    )
    if addr_match:
        result["address"] = addr_match.group(1).strip()

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
            if re.search(r"24\s*h", close, re.I):
                hours[day_key] = "Open 24h"
            else:
                hours[day_key] = f"{to24(m.group(1))} - {to24(close)}"
    result["openingHours"] = hours

    result["rawImageUrls"] = await scrape_images(page)

    if not result["googleMapsUrl"]:
        result["googleMapsUrl"] = (
            f"https://www.google.com/maps/search/?api=1"
            f"&query={name.replace(' ', '+')}+{suburb}"
        )

    return result


def build_entry(name, suburb, scraped, cloudinary_images):
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
        "googleMapsUrl": scraped.get("googleMapsUrl"),
        "images": cloudinary_images,
        "shortDescription": None,
        "tags": [],
        "specialtyCoffee": None,
        "coffeeBrand": None,
        "priceLevel": None,
        "hiddenGem": None, "locallyOwned": None, "matcha": None,
        "hasDecaf": None, "filterCoffee": None, "pastries": None,
        "breakfastAllDay": None, "brunchQuality": None, "veganOptions": None,
        "hasWifi": None, "hasPowerOutlets": None, "laptopFriendly": None,
        "outdoorSeating": None, "dogFriendly": None, "pramFriendly": None,
        "kidFriendly": None, "noiseLevel": None, "serviceStyle": None,
    }


async def main():
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    existing_ids = {c["id"] for c in cafes}
    existing_lower = {c["name"].lower() for c in cafes}

    missing_data = json.loads(MISSING_FILE.read_text(encoding="utf-8"))
    to_add_list = missing_data["missing"]

    remaining = [
        m for m in to_add_list
        if make_id(m["name"], m["suburb_guess"]) not in existing_ids
        and m["name"].lower() not in existing_lower
    ]
    already_done = len(to_add_list) - len(remaining)
    if already_done:
        print(f"Skipping {already_done} already in database")
    print(f"To scrape: {len(remaining)} / {len(to_add_list)}")

    if not remaining:
        print("All done!")
        return

    added = []

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

        for i, item in enumerate(remaining):
            name = item["name"]
            suburb = item["suburb_guess"]
            n = already_done + i + 1
            total = len(to_add_list)

            print(f"\n{n}/{total} | {name} — {suburb}")
            try:
                scraped = await scrape_place(page, name, suburb)

                # Upload images to Cloudinary
                cafe_id = make_id(name, suburb)
                cloudinary_images = []
                if scraped["rawImageUrls"]:
                    print(f"  Uploading {len(scraped['rawImageUrls'])} images...")
                    for idx, img_url in enumerate(scraped["rawImageUrls"]):
                        cdn_url = upload_image(img_url, cafe_id, idx)
                        if cdn_url:
                            cloudinary_images.append(cdn_url)

                entry = build_entry(name, suburb, scraped, cloudinary_images)

                if entry["id"] in existing_ids or name.lower() in existing_lower:
                    print(f"  SKIP (exists): {name}")
                    continue

                existing_ids.add(entry["id"])
                existing_lower.add(name.lower())
                cafes.append(entry)
                added.append(name)

                print(f"  addr:  {entry['address']}")
                print(f"  coords:{entry['latitude']}, {entry['longitude']}")
                print(f"  rating:{entry['rating']} ({entry['userRatingsTotal']} reviews)")
                print(f"  hours: {len(entry['openingHours'])} days")
                print(f"  images:{len(cloudinary_images)}")

                if len(added) % 10 == 0:
                    CAFES_FILE.write_text(json.dumps(cafes, indent=2), encoding="utf-8")
                    print(f"  [saved — {len(added)} added so far]")

            except Exception as e:
                print(f"  ERROR: {e}")

            await asyncio.sleep(2.5)

        await browser.close()

    CAFES_FILE.write_text(json.dumps(cafes, indent=2), encoding="utf-8")
    print(f"\n=== DONE ===")
    print(f"Added {len(added)} cafes. Total now: {len(cafes)}")
    for n in added:
        print(f"  + {n}")


if __name__ == "__main__":
    asyncio.run(main())
