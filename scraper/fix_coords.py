"""
Fixes cafes with missing coordinates (lat=0 or lng=0) by re-visiting
their Google Maps URL and extracting coords from the redirected URL.
"""

import asyncio
import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from playwright.async_api import async_playwright

ROOT = Path(__file__).parent.parent
CAFES_FILE = ROOT / "public" / "cafes.json"

MEL_BOUNDS = (-38.5, -37.3, 144.3, 145.8)  # lat_min, lat_max, lng_min, lng_max


def parse_coords(url):
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None, None


def in_bounds(lat, lng):
    return MEL_BOUNDS[0] < lat < MEL_BOUNDS[1] and MEL_BOUNDS[2] < lng < MEL_BOUNDS[3]


async def main():
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    missing = [c for c in cafes if not c.get("latitude") or c["latitude"] == 0]
    print(f"Cafes missing coords: {len(missing)}")
    if not missing:
        print("Nothing to fix.")
        return

    cafe_by_id = {c["id"]: c for c in cafes}
    fixed = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="en-AU",
        )
        page = await context.new_page()

        for i, cafe in enumerate(missing):
            url = cafe.get("googleMapsUrl") or (
                f"https://www.google.com/maps/search/"
                f"{cafe['name'].replace(' ', '+')}+{cafe['suburb'].replace(' ', '+')}+Melbourne"
            )
            print(f"{i+1}/{len(missing)} | {cafe['name']} — {cafe['suburb']}")
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(2500)

                lat, lng = parse_coords(page.url)
                if lat and in_bounds(lat, lng):
                    cafe_by_id[cafe["id"]]["latitude"] = lat
                    cafe_by_id[cafe["id"]]["longitude"] = lng
                    print(f"  Fixed: {lat}, {lng}")
                    fixed += 1
                else:
                    # On search results page — click first result to get place URL with coords
                    try:
                        first = page.locator('a[href*="/maps/place/"]').first
                        await first.click(timeout=4000)
                        await page.wait_for_timeout(2500)
                        lat, lng = parse_coords(page.url)
                        if not lat:
                            await page.wait_for_timeout(2000)
                            lat, lng = parse_coords(page.url)
                    except Exception:
                        lat, lng = None, None

                    if lat and in_bounds(lat, lng):
                        cafe_by_id[cafe["id"]]["latitude"] = lat
                        cafe_by_id[cafe["id"]]["longitude"] = lng
                        print(f"  Fixed (click): {lat}, {lng}")
                        fixed += 1
                    else:
                        print(f"  No valid coords")
            except Exception as e:
                print(f"  ERROR: {e}")

            if (i + 1) % 10 == 0:
                CAFES_FILE.write_text(json.dumps(cafes, indent=2), encoding="utf-8")
                print(f"  [saved — {fixed} fixed so far]")

            await asyncio.sleep(2.0)

        await browser.close()

    CAFES_FILE.write_text(json.dumps(cafes, indent=2), encoding="utf-8")
    print(f"\nDone. Fixed {fixed} / {len(missing)} missing coords.")


if __name__ == "__main__":
    asyncio.run(main())
