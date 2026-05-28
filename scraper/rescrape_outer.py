"""
Rescrapes Google Maps for cafes in under-represented outer Melbourne suburbs.
Adds missing cafes with images to public/cafes.json.
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

SEARCHES = [
    ("cafe Hampton Melbourne", "Hampton", "3188"),
    ("cafe Hampton Beach Melbourne", "Hampton", "3188"),
    ("cafe McKinnon Melbourne", "McKinnon", "3204"),
    ("cafe Glen Huntly Melbourne", "Glen Huntly", "3163"),
    ("cafe Doncaster Melbourne", "Doncaster", "3108"),
    ("cafe Westfield Doncaster", "Doncaster", "3108"),
    ("cafe Glen Waverley Melbourne", "Glen Waverley", "3150"),
    ("specialty coffee Glen Waverley", "Glen Waverley", "3150"),
    ("cafe Box Hill Melbourne", "Box Hill", "3128"),
    ("cafe Box Hill Central", "Box Hill", "3128"),
    ("cafe Sandringham Melbourne", "Sandringham", "3191"),
    ("cafe Mentone Melbourne", "Mentone", "3194"),
    ("cafe Moorabbin Melbourne", "Moorabbin", "3189"),
    ("cafe Toorak Melbourne", "Toorak", "3142"),
    ("cafe Toorak Road South Yarra", "Toorak", "3142"),
    ("cafe Middle Park Melbourne", "Middle Park", "3206"),
    ("cafe Balaclava Melbourne", "Balaclava", "3183"),
    ("cafe Chapel Street Balaclava", "Balaclava", "3183"),
    ("cafe Williamstown Melbourne", "Williamstown", "3016"),
    ("specialty coffee Williamstown", "Williamstown", "3016"),
    ("cafe Kensington Melbourne", "Kensington", "3031"),
    ("cafe Ascot Vale Melbourne", "Ascot Vale", "3032"),
    ("cafe Moonee Ponds Melbourne", "Moonee Ponds", "3039"),
    ("specialty coffee Moonee Ponds", "Moonee Ponds", "3039"),
    ("cafe Essendon Melbourne", "Essendon", "3040"),
    ("cafe Camberwell Melbourne", "Camberwell", "3124"),
    ("specialty coffee Camberwell", "Camberwell", "3124"),
    ("cafe Hawthorn Melbourne", "Hawthorn", "3122"),
    ("cafe Hawthorn East Melbourne", "Hawthorn East", "3123"),
    ("cafe Malvern Melbourne", "Malvern", "3144"),
    ("specialty coffee Malvern", "Malvern", "3144"),
    ("cafe Armadale Melbourne", "Armadale", "3143"),
    ("cafe High Street Armadale", "Armadale", "3143"),
    ("cafe Ivanhoe Melbourne", "Ivanhoe", "3079"),
    ("cafe Heidelberg Melbourne", "Heidelberg", "3084"),
    ("cafe Preston Melbourne", "Preston", "3072"),
    ("specialty coffee Preston", "Preston", "3072"),
    ("cafe Reservoir Melbourne", "Reservoir", "3073"),
    ("cafe Footscray Melbourne", "Footscray", "3011"),
    ("specialty coffee Footscray", "Footscray", "3011"),
    ("cafe Yarraville Melbourne", "Yarraville", "3013"),
    ("cafe Seddon Melbourne", "Seddon", "3011"),
    ("cafe Newport Melbourne", "Newport", "3015"),
    ("cafe Albert Park Melbourne", "Albert Park", "3206"),
    ("cafe St Kilda Melbourne", "St Kilda", "3182"),
    ("specialty coffee St Kilda", "St Kilda", "3182"),
    ("cafe Elwood Melbourne", "Elwood", "3184"),
]

DAY_MAP = {
    "Monday": "mon", "Tuesday": "tue", "Wednesday": "wed",
    "Thursday": "thu", "Friday": "fri", "Saturday": "sat", "Sunday": "sun",
}
MAX_IMAGES = 4


def make_id(name, suburb):
    return re.sub(r"[^a-z0-9]+", "-", f"{name}-{suburb}".lower()).strip("-")


def parse_coords(url):
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)


def to24(t):
    t = t.strip()
    if re.match(r"\d{1,2}:\d{2}$", t):
        return t.zfill(5)
    try:
        from datetime import datetime
        return datetime.strptime(t, "%I:%M %p").strftime("%H:%M")
    except Exception:
        return t


def upload_image(url, cafe_id, idx):
    try:
        r = cloudinary.uploader.upload(
            url, folder="cafes", public_id=f"{cafe_id}_{idx}",
            overwrite=False, resource_type="image",
        )
        return r.get("secure_url")
    except Exception as e:
        print(f"    [img error] {e}")
        return None


def normalise(name):
    n = name.lower()
    n = re.sub(r"[''`''''\"]", "", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    return re.sub(r"\s+", " ", n).strip()


async def scrape_images_filtered(page, max_images=MAX_IMAGES):
    images = []
    try:
        for sel in ['button[aria-label*="photo" i]', '.ZKCDEc', '.RZ66Rb']:
            try:
                btn = page.locator(sel).first
                await btn.click(timeout=2000)
                await page.wait_for_timeout(2000)
                break
            except Exception:
                continue

        for tab_label in ["By owner", "Outside", "Inside", "Food & drink"]:
            try:
                tab = page.locator(f'button:has-text("{tab_label}")').first
                await tab.click(timeout=2000)
                await page.wait_for_timeout(1500)
                imgs = await page.evaluate("""(function() {
                    return Array.from(document.querySelectorAll('img'))
                        .map(function(i) { return i.src || ''; })
                        .filter(function(s) {
                            return s && s.includes('googleusercontent.com')
                                && s.length > 80
                                && !/=[ws][1-5][0-9]/.test(s);
                        });
                })()""")
                for u in imgs:
                    u2 = re.sub(r"=w\d+", "=w1200", re.sub(r"=s\d+", "=s1200", u))
                    if u2 not in images:
                        images.append(u2)
                if len(images) >= max_images:
                    break
            except Exception:
                continue

        await page.go_back()
        await page.wait_for_timeout(800)
    except Exception:
        pass

    if not images:
        try:
            imgs = await page.evaluate("""(function() {
                return Array.from(document.querySelectorAll('img'))
                    .map(function(i) { return i.src || ''; })
                    .filter(function(s) {
                        return s && s.includes('googleusercontent.com')
                            && s.length > 100
                            && !/=[ws][1-5][0-9](-h[0-9]+)?$/.test(s);
                    });
            })()""")
            seen = set()
            for u in imgs:
                u2 = re.sub(r"=w\d+", "=w1200", re.sub(r"=s\d+", "=s1200", u))
                if u2 not in seen:
                    seen.add(u2)
                    images.append(u2)
        except Exception:
            pass

    return list(dict.fromkeys(images))[:max_images]


async def scroll_and_extract(page, query):
    url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(2500)
    except Exception:
        return []

    for _ in range(8):
        try:
            panel = page.locator('[role="feed"]')
            await panel.evaluate("el => el.scrollBy(0, 600)")
            await page.wait_for_timeout(500)
        except Exception:
            break

    items = await page.evaluate("""(function() {
        var seen = {};
        return Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
            .map(function(a) {
                var nameEl = a.querySelector('[class*="fontHeadlineSmall"], .qBF1Pd, .NrDZNb');
                var name = nameEl ? nameEl.innerText.trim() : (a.getAttribute('aria-label') || '');
                name = name.split('\\n')[0].trim();
                return {name: name, href: a.href};
            })
            .filter(function(x) {
                if (!x.name || x.name.length < 2 || x.name.length > 80) return false;
                if (seen[x.name]) return false;
                seen[x.name] = 1;
                return true;
            });
    })()""")
    return items


async def get_place_details(page, name, suburb, postcode):
    result = {
        "address": None, "phone": None, "website": None,
        "rating": None, "userRatingsTotal": None,
        "openingHours": {}, "latitude": None, "longitude": None,
        "googleMapsUrl": None, "_skip": False,
    }

    current_url = page.url
    lat, lng = parse_coords(current_url)
    result["latitude"] = lat
    result["longitude"] = lng

    pid_m = re.search(r"query_place_id=([^&]+)", current_url)
    if pid_m:
        result["googleMapsUrl"] = (
            f"https://www.google.com/maps/search/?api=1"
            f"&query={name.replace(' ', '+')}+{suburb.replace(' ', '+')}"
            f"&query_place_id={pid_m.group(1)}"
        )

    text = await page.evaluate("document.body.innerText")

    skip_types = ["petrol", "service station", "supermarket", "pharmacy",
                  "gym", "fitness centre", "newsagent", "hardware store"]
    if any(k in text.lower() for k in skip_types):
        result["_skip"] = True
        return result

    addr_m = re.search(
        r"(\d+[^,\n]+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Place|Pl|"
        r"Drive|Dr|Way|Boulevard|Blvd|Parade|Pde|Court|Ct|Crescent|Cres)"
        r"[^,\n]*,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+VIC\s+\d{4})",
        text,
    )
    if addr_m:
        result["address"] = addr_m.group(1).strip()
        pc_m = re.search(r"VIC\s+(\d{4})", result["address"])
        if pc_m and postcode and pc_m.group(1) != postcode:
            result["_skip"] = True
            return result

    phone_m = re.search(r"(\(0\d\)\s*\d{4}\s*\d{4}|04\d{2}\s*\d{3}\s*\d{3})", text)
    if phone_m:
        result["phone"] = phone_m.group(1)

    rating_m = re.search(r"(\d\.\d)\s*\((\d[\d,]+)\)", text)
    if rating_m:
        result["rating"] = float(rating_m.group(1))
        result["userRatingsTotal"] = int(rating_m.group(2).replace(",", ""))

    try:
        wb = page.locator('a[data-item-id="authority"]').first
        href = await wb.get_attribute("href", timeout=2000)
        if href and href.startswith("http"):
            result["website"] = href
    except Exception:
        pass

    hours = {}
    for day_full, day_key in DAY_MAP.items():
        pat = (
            rf"{day_full}\s+(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?)"
            rf"\s*[–\-]\s*(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?|(?:Open\s+24\s+hours?))"
        )
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            close = m.group(2).strip()
            hours[day_key] = "Open 24h" if re.search(r"24\s*h", close, re.I) else f"{to24(m.group(1))} - {to24(close)}"
    result["openingHours"] = hours

    if not result["googleMapsUrl"]:
        result["googleMapsUrl"] = (
            f"https://www.google.com/maps/search/?api=1"
            f"&query={name.replace(' ', '+')}+{suburb.replace(' ', '+')}"
        )

    return result


def build_entry(name, suburb, details, images):
    return {
        "id": make_id(name, suburb),
        "name": name, "suburb": suburb,
        "address": details.get("address") or "",
        "latitude": details.get("latitude") or 0,
        "longitude": details.get("longitude") or 0,
        "rating": details.get("rating"),
        "userRatingsTotal": details.get("userRatingsTotal"),
        "reviewCount": details.get("userRatingsTotal"),
        "phone": details.get("phone"),
        "website": details.get("website"),
        "openingHours": details.get("openingHours", {}),
        "googleMapsUrl": details.get("googleMapsUrl"),
        "images": images, "shortDescription": None, "tags": [],
        "specialtyCoffee": None, "coffeeBrand": None, "priceLevel": None,
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
    existing_norm = {normalise(c["name"]) for c in cafes}

    suburb_counts = {}
    for c in cafes:
        suburb_counts[c["suburb"]] = suburb_counts.get(c["suburb"], 0) + 1
    print("Current counts for target suburbs:")
    target_suburbs = set(s for _, s, _ in SEARCHES)
    for s in sorted(target_suburbs):
        print(f"  {s}: {suburb_counts.get(s, 0)}")

    all_candidates: dict[str, dict] = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-AU",
        )
        page = await context.new_page()

        print("\n=== Phase 1: Collecting listings ===")
        for query, suburb, postcode in SEARCHES:
            items = await scroll_and_extract(page, query)
            new = 0
            for item in items:
                name = item["name"]
                if name and name not in all_candidates:
                    all_candidates[name] = {"href": item["href"], "suburb": suburb, "postcode": postcode}
                    new += 1
            print(f"  [{suburb}] {len(items)} results, {new} new")
            await asyncio.sleep(1.2)

        print(f"\nTotal unique candidates: {len(all_candidates)}")

        missing = []
        for name, data in all_candidates.items():
            nl = name.lower()
            nn = normalise(name)
            if nl not in existing_lower and nn not in existing_norm:
                close = any(
                    nn and ex and len(nn) > 4 and (nn in ex or ex in nn)
                    for ex in existing_norm if ex and len(ex) > 4
                )
                if not close:
                    missing.append((name, data))

        print(f"Not in database: {len(missing)}")
        if not missing:
            print("Nothing new to add!")
            await browser.close()
            return

        print(f"\n=== Phase 2: Scraping {len(missing)} new cafes ===")
        added = []

        for i, (name, data) in enumerate(missing):
            suburb = data["suburb"]
            postcode = data["postcode"]
            print(f"\n{i+1}/{len(missing)} | {name} — {suburb}")
            try:
                await page.goto(data["href"], wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(3000)

                details = await get_place_details(page, name, suburb, postcode)
                if details.get("_skip"):
                    print(f"  SKIP (wrong area or non-cafe)")
                    continue

                cafe_id = make_id(name, suburb)
                images = []
                raw_imgs = await scrape_images_filtered(page)
                for idx, img_url in enumerate(raw_imgs):
                    cdn = upload_image(img_url, cafe_id, idx)
                    if cdn:
                        images.append(cdn)

                entry = build_entry(name, suburb, details, images)
                if entry["id"] in existing_ids or name.lower() in existing_lower:
                    print(f"  SKIP (exists)")
                    continue

                existing_ids.add(entry["id"])
                existing_lower.add(name.lower())
                cafes.append(entry)
                added.append(f"{name} ({suburb})")

                print(f"  addr: {entry['address']}")
                print(f"  rating: {entry['rating']}  images: {len(images)}")

                if len(added) % 10 == 0:
                    CAFES_FILE.write_text(json.dumps(cafes, indent=2), encoding="utf-8")
                    print(f"  [saved — {len(added)} added]")

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
