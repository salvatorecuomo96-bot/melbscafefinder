"""
Scrapes Time Out Melbourne cafe/coffee listings and cross-references
against public/cafes.json to find missing cafes.
Saves to data/timeout_missing.json.
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
MISSING_FILE = ROOT / "data" / "timeout_missing.json"

GUIDE_URLS = [
    "https://www.timeout.com/melbourne/restaurants/best-coffee-shops-in-melbourne",
    "https://www.timeout.com/melbourne/restaurants/best-cafes-in-melbourne",
    "https://www.timeout.com/melbourne/restaurants/best-brunch-in-melbourne",
    "https://www.timeout.com/melbourne/restaurants/best-breakfast-restaurants-melbourne",
]


def normalise(name):
    n = name.lower()
    n = re.sub(r"[''`''''\"\-]", "", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    n = re.sub(r"\b(the|a|an|cafe|coffee|espresso|bar|melbourne)\b", "", n)
    return re.sub(r"\s+", " ", n).strip()


async def scrape_page(page, url):
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(4000)
    except Exception as e:
        print(f"  ERROR: {e}")
        return []

    names = await page.evaluate("""(function() {
        var seen = {};
        var results = [];
        // Time Out uses numbered list format with h3 venue names
        Array.from(document.querySelectorAll('h3, h2, [class*="card-title"], [class*="venue-title"], [class*="listing-title"]')).forEach(function(el) {
            var text = el.innerText.trim().replace(/^\\d+\\.?\\s*/, '').trim();
            if (text.length > 2 && text.length < 80 && !seen[text]) {
                seen[text] = 1;
                results.push(text);
            }
        });
        return results;
    })()""")
    return names


async def main():
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    existing_lower = {c["name"].lower() for c in cafes}
    existing_norm = {normalise(c["name"]) for c in cafes}

    all_venues = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-AU",
        )
        page = await context.new_page()

        for url in GUIDE_URLS:
            short = url.split("/")[-1]
            names = await scrape_page(page, url)
            new = 0
            for n in names:
                if n not in all_venues:
                    all_venues[n] = [url]
                    new += 1
                elif url not in all_venues[n]:
                    all_venues[n].append(url)
            print(f"  {short}: {len(names)} venues ({new} new)")
            await asyncio.sleep(1.5)

        await browser.close()

    print(f"\nTotal on Time Out: {len(all_venues)}")

    missing = []
    for name, sources in sorted(all_venues.items()):
        nl = name.lower()
        nn = normalise(name)
        if nl not in existing_lower and nn not in existing_norm:
            close = any(
                nn and ex and len(nn) > 4 and (nn in ex or ex in nn)
                for ex in existing_norm if ex and len(ex) > 4
            )
            if not close:
                missing.append({"name": name, "suburb_guess": "Melbourne", "sources": sources})

    print(f"Missing from database: {len(missing)}")
    for m in missing:
        print(f"  {m['name']}")

    MISSING_FILE.parent.mkdir(exist_ok=True)
    MISSING_FILE.write_text(
        json.dumps({"missing": missing, "total": len(all_venues)}, indent=2),
        encoding="utf-8",
    )
    print(f"Saved to {MISSING_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
