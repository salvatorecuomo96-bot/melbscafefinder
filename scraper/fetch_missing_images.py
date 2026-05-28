"""
Finds cafes with no images and tries to fetch them from Google Maps,
filtering to By owner / Outside / Inside / Food & drink categories only.
Uploads to Cloudinary and updates cafes.json.
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

MAX_IMAGES = 4


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


async def scrape_images_filtered(page, max_images=MAX_IMAGES):
    images = []
    try:
        for sel in ['button[aria-label*="photo" i]', '.ZKCDEc', '.RZ66Rb', 'button[jsaction*="photo"]']:
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

    # Fallback: grab large images from place page directly
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


async def main():
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    no_images = [c for c in cafes if not c.get("images") or len(c["images"]) == 0]
    print(f"Cafes with no images: {len(no_images)}")
    if not no_images:
        print("All cafes have images.")
        return

    cafe_by_id = {c["id"]: c for c in cafes}
    fetched = 0
    skipped = 0

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

        for i, cafe in enumerate(no_images):
            url = cafe.get("googleMapsUrl") or (
                f"https://www.google.com/maps/search/"
                f"{cafe['name'].replace(' ', '+')}+{cafe['suburb'].replace(' ', '+')}+Melbourne"
            )
            print(f"{i+1}/{len(no_images)} | {cafe['name']} — {cafe['suburb']}")
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(3000)

                raw_imgs = await scrape_images_filtered(page)
                if not raw_imgs:
                    print(f"  No images found")
                    skipped += 1
                    await asyncio.sleep(1.5)
                    continue

                images = []
                for idx, img_url in enumerate(raw_imgs):
                    cdn = upload_image(img_url, cafe["id"], idx)
                    if cdn:
                        images.append(cdn)

                if images:
                    cafe_by_id[cafe["id"]]["images"] = images
                    print(f"  Got {len(images)} images")
                    fetched += 1
                else:
                    print(f"  Upload failed")
                    skipped += 1

            except Exception as e:
                print(f"  ERROR: {e}")
                skipped += 1

            if (i + 1) % 20 == 0:
                CAFES_FILE.write_text(json.dumps(cafes, indent=2), encoding="utf-8")
                print(f"  [saved — {fetched} fetched, {skipped} skipped]")

            await asyncio.sleep(2.0)

        await browser.close()

    CAFES_FILE.write_text(json.dumps(cafes, indent=2), encoding="utf-8")
    print(f"\nDone. Fetched images for {fetched} cafes. {skipped} had none.")


if __name__ == "__main__":
    asyncio.run(main())
