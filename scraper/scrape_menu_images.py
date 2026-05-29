"""
Scrapes menu images for cafes:
  1. Finds the cafe's menu page (website /menu links)
  2. Takes a full-page screenshot, uploads to Cloudinary
  3. Falls back to Google Maps menu photos if no website menu found
  4. Saves menuImages: [url, ...] per cafe in cafes.json

Progress saved to data/menu_images_progress.json (resumable).
Live log: data/menu_images_live.log — watch with: Get-Content data/menu_images_live.log -Wait
"""

import asyncio
import base64
import io
import json
import os
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import cloudinary
import cloudinary.uploader
from playwright.async_api import async_playwright

ROOT       = Path(__file__).parent.parent
CAFES_FILE = ROOT / "public" / "cafes.json"
PROGRESS   = ROOT / "data"   / "menu_images_progress.json"
LOG_FILE   = ROOT / "data"   / "menu_images_live.log"

CBD_LAT, CBD_LNG = -37.8136, 144.9631
MAX_KM = 10


def _dist_km(lat1, lon1, lat2, lon2):
    import math
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def within_cbd(cafe):
    lat = cafe.get("latitude") or 0
    lng = cafe.get("longitude") or 0
    if not lat or not lng:
        return False
    return _dist_km(CBD_LAT, CBD_LNG, lat, lng) <= MAX_KM

# Load Cloudinary creds from .env
def load_env():
    env_path = ROOT / "scraper" / ".env"
    if not env_path.exists():
        env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

load_env()

cloudinary.config(
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "dxevftbv7"),
    api_key    = os.environ.get("CLOUDINARY_API_KEY",    "611417132349261"),
    api_secret = os.environ.get("CLOUDINARY_API_SECRET", "tOgQCsMJe9kBrHM4VS7dswJI4ec"),
)

MENU_PATH_RE = re.compile(
    r"\b(menu|menus|food|drink|eat|brunch|breakfast|what.we.serve|order)\b", re.I
)

# ── Helpers ────────────────────────────────────────────────────────────────────

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def upload_screenshot(img_bytes, cafe_id, idx=0):
    """Upload PNG bytes to Cloudinary, return secure_url."""
    try:
        b64 = "data:image/png;base64," + base64.b64encode(img_bytes).decode()
        res = cloudinary.uploader.upload(
            b64,
            folder="cafemenus",
            public_id=f"{cafe_id}_menu_{idx}",
            overwrite=True,
            resource_type="image",
        )
        return res.get("secure_url")
    except Exception as e:
        log(f"  [cloudinary error] {e}")
        return None


# ── Website menu ───────────────────────────────────────────────────────────────

async def find_menu_url(page, website):
    """Navigate to website homepage and find the menu page URL."""
    base = website.rstrip("/")
    try:
        await page.goto(base, wait_until="domcontentloaded", timeout=12000)
        await page.wait_for_timeout(800)
    except Exception:
        return None

    try:
        links = await page.evaluate("""(function(base) {
            return [...new Set(
                Array.from(document.querySelectorAll('a[href]'))
                    .map(a => {
                        try { return new URL(a.getAttribute('href'), base).href; } catch { return ''; }
                    })
                    .filter(h => {
                        if (!h || !h.startsWith(base)) return false;
                        const p = new URL(h).pathname.toLowerCase();
                        return /menu|food|drink|eat|brunch|breakfast|order/.test(p)
                            && !/\.(pdf|jpg|jpeg|png|gif|webp|svg)$/i.test(p);
                    })
            )].slice(0, 6);
        })(arguments[0])""", base)
    except Exception:
        links = []

    # Also try common paths
    for suffix in ["/menu", "/menus", "/food", "/food-menu", "/our-menu",
                   "/cafe-menu", "/brunch", "/breakfast", "/eat"]:
        candidate = base + suffix
        if candidate not in links:
            links.append(candidate)

    return links[:8] if links else None


async def screenshot_menu_page(page, url):
    """Navigate to URL and take a full-page screenshot. Returns PNG bytes or None."""
    try:
        await page.goto(url, wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(1000)

        # Remove cookie banners / overlays
        await page.evaluate("""() => {
            ['[id*="cookie"]','[class*="cookie"]','[id*="gdpr"]',
             '[class*="gdpr"]','[id*="popup"]','[class*="overlay"]',
             '[class*="modal"]'].forEach(sel => {
                document.querySelectorAll(sel).forEach(el => el.remove());
            });
        }""")

        # Check if there's actually menu content
        text = await page.evaluate("() => document.body.innerText")
        if not text or len(text.strip()) < 100:
            return None

        # Check it looks like a menu page (food words)
        food_words = ["coffee","eggs","toast","avocado","menu","breakfast","brunch",
                      "lunch","coffee","latte","cappuccino","smoothie","cake"]
        lower = text.lower()
        if not any(w in lower for w in food_words):
            return None

        # Take screenshot — clip to reasonable width, full page height
        await page.set_viewport_size({"width": 1000, "height": 900})
        img = await page.screenshot(full_page=True, type="png")
        return img if img and len(img) > 5000 else None

    except Exception:
        return None


async def get_website_menu(page, website, cafe_id):
    """Try to find and screenshot the menu page. Returns list of Cloudinary URLs."""
    menu_urls = await find_menu_url(page, website)
    if not menu_urls:
        return []

    for url in menu_urls:
        img_bytes = await screenshot_menu_page(page, url)
        if img_bytes:
            cdn_url = upload_screenshot(img_bytes, cafe_id)
            if cdn_url:
                return [cdn_url]

    return []


# ── Google Maps menu photos ────────────────────────────────────────────────────

async def get_gmaps_menu_photos(page, cafe):
    """Try to find menu photos in Google Maps. Returns list of Cloudinary URLs."""
    lat, lng = cafe.get("latitude", 0), cafe.get("longitude", 0)
    name, suburb = cafe["name"], cafe["suburb"]

    if lat and lat != 0:
        url = f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
    else:
        q = f"{name} {suburb} Melbourne".replace(" ", "+")
        url = f"https://www.google.com/maps/search/{q}"

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=12000)
        await page.wait_for_timeout(2000)
    except Exception:
        return []

    if "@" not in page.url:
        try:
            first = page.locator('a[href*="/maps/place/"]').first
            await first.click(timeout=4000)
            await page.wait_for_timeout(2000)
        except Exception:
            return []

    # Try to find Menu tab in photos
    for label in ["Menu", "See menu"]:
        try:
            btn = page.locator(f'button:has-text("{label}"), a:has-text("{label}")').first
            if await btn.is_visible(timeout=2000):
                await btn.click(timeout=3000)
                await page.wait_for_timeout(2000)
                break
        except Exception:
            continue

    # Look for menu photo images
    try:
        imgs = await page.evaluate("""(function() {
            return Array.from(document.querySelectorAll('img'))
                .map(i => i.src || '')
                .filter(s => s && s.includes('googleusercontent.com') && s.length > 80);
        })()""")
    except Exception:
        return []

    results = []
    for i, img_url in enumerate(imgs[:3]):
        img_url = re.sub(r"=w\d+", "=w1200", re.sub(r"=s\d+", "=s1200", img_url))
        # Upload the image URL directly to Cloudinary
        try:
            res = cloudinary.uploader.upload(
                img_url,
                folder="cafemenus",
                public_id=f"{cafe['id']}_gmenu_{i}",
                overwrite=True,
                resource_type="image",
            )
            cdn_url = res.get("secure_url")
            if cdn_url:
                results.append(cdn_url)
        except Exception:
            continue

    return results


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    LOG_FILE.parent.mkdir(exist_ok=True)
    LOG_FILE.write_text("", encoding="utf-8")

    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))

    # Only process cafes within 10km of CBD that don't already have menuImages
    todo_all = [c for c in cafes if within_cbd(c) and not c.get("menuImages")]
    prog = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    done = set(prog.keys())
    todo = [c for c in todo_all if c["id"] not in done]

    found = sum(1 for v in prog.values() if v)
    log(f"Total: {len(todo_all)} | Done: {len(done)} | To do: {len(todo)} | Found so far: {found}")

    if todo:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1000, "height": 900},
                locale="en-AU",
            )
            page = await context.new_page()

            for cafe in todo:
                n = len(done) + 1
                log(f"{n}/{len(todo_all)} | {cafe['name']} — {cafe['suburb']}")

                menu_images = []

                # 1. Try website first
                if cafe.get("website"):
                    menu_images = await get_website_menu(page, cafe["website"], cafe["id"])
                    if menu_images:
                        log(f"  [web] {len(menu_images)} image(s)")

                # 2. Fall back to Google Maps menu photos
                if not menu_images:
                    menu_images = await get_gmaps_menu_photos(page, cafe)
                    if menu_images:
                        log(f"  [gmaps] {len(menu_images)} image(s)")

                if not menu_images:
                    log(f"  — no menu found")

                prog[cafe["id"]] = menu_images
                done.add(cafe["id"])
                if menu_images:
                    found += 1

                if len(done) % 20 == 0:
                    PROGRESS.write_text(
                        json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8"
                    )
                    log(f"  [saved — {found}/{len(done)} found]")

                await asyncio.sleep(0.3)

            await browser.close()

        PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")

    log(f"\nDone. Found menus for {found} / {len(todo_all)} cafes.")

    # Apply to cafes.json
    cafe_map = {c["id"]: c for c in cafes}
    patched = 0
    for cid, images in prog.items():
        if cid in cafe_map and images:
            cafe_map[cid]["menuImages"] = images
            patched += 1

    CAFES_FILE.write_text(
        json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    log(f"Written menuImages to {patched} cafes in cafes.json")


if __name__ == "__main__":
    asyncio.run(main())
