"""
Scrapes full menu text for cafes from two sources (text only, no PDFs/images):
  1. Google Maps — "Menu" tab on the place page
  2. Cafe website — finds menu page, extracts body text

Only saves menus that look complete (enough items / length).
Saves progress to data/menu_progress.json (resumable).
Writes results to public/cafes.json when done.
"""

import asyncio
import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from playwright.async_api import async_playwright

ROOT        = Path(__file__).parent.parent
CAFES_FILE  = ROOT / "public" / "cafes.json"
PROGRESS    = ROOT / "data" / "menu_progress2.json"
RESULTS     = ROOT / "data" / "menu_results2.json"

# ── Helpers ────────────────────────────────────────────────────────────────────

FOOD_WORDS = [
    "coffee", "espresso", "latte", "cappuccino", "flat white", "long black",
    "oat milk", "almond milk", "soy milk", "matcha", "chai", "hot chocolate",
    "cold brew", "filter", "pour over", "batch brew",
    "toast", "eggs", "avocado", "smashed avo", "benedict", "poached",
    "scrambled", "fried", "omelette", "frittata",
    "smoothie", "juice", "açaí", "acai",
    "cake", "muffin", "croissant", "danish", "pastry", "scone",
    "sandwich", "wrap", "salad", "bowl", "granola", "bircher",
    "sourdough", "rye", "focaccia", "brioche",
    "lunch", "brunch", "breakfast", "snack",
]

PRICE_RE = re.compile(r"\$\s*\d+(?:\.\d{2})?")
MENU_LINK_RE = re.compile(
    r"\b(menu|food|drink|eat|brunch|breakfast|what we serve|order)\b", re.I
)


def food_hit_count(text):
    lower = text.lower()
    return sum(1 for w in FOOD_WORDS if w in lower)


def is_full_menu(text):
    """Return True only if text looks like a real, full menu."""
    if not text or len(text) < 400:
        return False
    hits = food_hit_count(text)
    has_prices = bool(PRICE_RE.search(text))
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    # Need either many food words OR prices + some food words
    if has_prices and hits >= 4:
        return True
    if hits >= 8 and len(lines) >= 10:
        return True
    return False


def clean_text(raw):
    raw = re.sub(r"[ \t]+", " ", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()[:5000]


# ── Google Maps menu scrape ────────────────────────────────────────────────────

async def scrape_gmaps_menu(page, cafe):
    url = cafe.get("googleMapsUrl") or (
        f"https://www.google.com/maps/search/"
        f"{cafe['name'].replace(' ', '+')}+{cafe['suburb'].replace(' ', '+')}+Melbourne"
    )
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(2500)
    except Exception:
        return None

    # If on search results page, click first result
    if "@" not in page.url:
        try:
            first = page.locator('a[href*="/maps/place/"]').first
            await first.click(timeout=4000)
            await page.wait_for_timeout(2000)
        except Exception:
            return None

    # Look for a "Menu" tab/button
    for label in ["Menu", "See menu", "Full menu"]:
        try:
            btn = page.locator(f'button:has-text("{label}"), a:has-text("{label}")').first
            await btn.click(timeout=3000)
            await page.wait_for_timeout(2000)
            break
        except Exception:
            continue

    # Extract inner text of the place panel
    try:
        # The main panel in Google Maps is the left sidebar
        panel = page.locator('[role="main"]').first
        text = await panel.inner_text(timeout=4000)
        text = clean_text(text)
        if is_full_menu(text):
            return text
    except Exception:
        pass

    return None


# ── Website menu scrape ───────────────────────────────────────────────────────

MENU_PATH_KEYWORDS = [
    "/menu", "/menus", "/food", "/food-menu", "/drink-menu", "/drinks",
    "/our-menu", "/cafe-menu", "/breakfast", "/brunch", "/coffee",
    "/what-we-serve", "/eat", "/food-and-drink", "/order",
]


async def scrape_website_menu(page, website):
    base = website.rstrip("/")
    try:
        await page.goto(base, wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(1500)
    except Exception:
        return None

    # Collect menu-like links from homepage
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
                            && !p.endsWith('.pdf') && !p.endsWith('.jpg')
                            && !p.endsWith('.png') && !p.endsWith('.webp');
                    })
            )].slice(0, 6);
        })(arguments[0])""", base)
    except Exception:
        links = []

    # Add common path guesses
    guesses = [base + p for p in MENU_PATH_KEYWORDS
               if not any(p in l for l in links)]
    to_try = (links + guesses)[:8]

    # Try homepage first
    for url in [base] + to_try:
        try:
            if url != base:
                await page.goto(url, wait_until="domcontentloaded", timeout=12000)
                await page.wait_for_timeout(1000)

            # Skip if PDF or binary (check content type via URL)
            if re.search(r"\.(pdf|jpg|jpeg|png|gif|webp|svg)$", url, re.I):
                continue

            text = await page.evaluate("""(function() {
                const remove = ['script','style','noscript','header','footer',
                                'nav','iframe','form','aside'];
                remove.forEach(t => document.querySelectorAll(t)
                    .forEach(el => el.remove()));
                // Prefer menu/food sections
                for (const sel of ['[class*="menu"]','[id*="menu"]',
                                   '[class*="food"]','main','article','#content']) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText.trim().length > 300) return el.innerText;
                }
                return document.body.innerText;
            })()""")

            text = clean_text(text or "")
            if is_full_menu(text):
                return text
        except Exception:
            continue

    return None


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    cafes  = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    prog   = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    done   = set(prog.keys())
    todo   = [c for c in cafes if c["id"] not in done]

    print(f"Total: {len(cafes)} | Done: {len(done)} | To do: {len(todo)}")

    found = sum(1 for v in prog.values() if v)
    print(f"Menus found so far: {found}")

    if not todo:
        print("All done — writing to cafes.json")
    else:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
                locale="en-AU",
            )
            page = await context.new_page()

            for i, cafe in enumerate(todo):
                print(f"\n{len(done)+1}/{len(cafes)} | {cafe['name']} — {cafe['suburb']}")

                menu = None

                # 1. Try Google Maps first
                menu = await scrape_gmaps_menu(page, cafe)
                if menu:
                    print(f"  [gmaps] {len(menu)} chars")

                # 2. Try website if no menu from Maps
                if not menu and cafe.get("website"):
                    menu = await scrape_website_menu(page, cafe["website"])
                    if menu:
                        print(f"  [web]   {len(menu)} chars")

                if not menu:
                    print(f"  no menu found")

                prog[cafe["id"]] = menu
                done.add(cafe["id"])
                if menu:
                    found += 1

                if len(done) % 20 == 0:
                    PROGRESS.write_text(
                        json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8"
                    )
                    print(f"  [saved — {found} menus so far]")

                await asyncio.sleep(1.5)

            await browser.close()

        PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")

    # Write results file (found only)
    results = {k: v for k, v in prog.items() if v}
    RESULTS.parent.mkdir(exist_ok=True)
    RESULTS.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nMenu results: {len(results)} cafes")

    # Apply to cafes.json
    cafe_map = {c["id"]: c for c in cafes}
    patched = 0
    for cid, text in results.items():
        if cid in cafe_map and not cafe_map[cid].get("menuText"):
            cafe_map[cid]["menuText"] = text
            patched += 1

    CAFES_FILE.write_text(
        json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Written menuText to {patched} cafes in cafes.json")


if __name__ == "__main__":
    asyncio.run(main())
