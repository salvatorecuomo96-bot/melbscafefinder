"""
Scrapes UrbanList Melbourne cafe/coffee pages and cross-references against
public/cafes.json to find important missing cafes.
Saves results to data/urbanlist_missing.json.
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
MISSING_FILE = ROOT / "data" / "urbanlist_missing.json"

SEED_URLS = [
    "https://www.urbanlist.com/melbourne/eat-drink/cafes",
    "https://www.urbanlist.com/melbourne/eat-drink/coffee",
    "https://www.urbanlist.com/melbourne/eat-drink/breakfast-brunch",
]


def normalise(name: str) -> str:
    n = name.lower()
    n = re.sub(r"[''`''''\"\-]", "", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    n = re.sub(r"\b(the|a|an|cafe|coffee|espresso|bar|melbourne)\b", "", n)
    return re.sub(r"\s+", " ", n).strip()


async def get_guide_links(page, seed_url: str) -> list[str]:
    """Find all sub-guide links from a seed page."""
    try:
        await page.goto(seed_url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(3000)
    except Exception as e:
        print(f"  ERROR loading {seed_url}: {e}")
        return []

    links = await page.evaluate("""(function() {
        return [...new Set(Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(h => h.includes('urbanlist.com/melbourne') &&
                (h.includes('cafe') || h.includes('coffee') || h.includes('brunch') ||
                 h.includes('breakfast')) &&
                !h.includes('#') && !h.includes('?')))]
    })()""")
    return links


async def scrape_venue_names(page, url: str) -> list[str]:
    """Extract cafe names from an UrbanList article/guide page."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(3000)
    except Exception:
        return []

    # UrbanList uses numbered list articles with venue names in h2/h3
    names = await page.evaluate("""(function() {
        var seen = {};
        var results = [];

        // Try article headings (numbered list format: "1. Venue Name")
        var headings = Array.from(document.querySelectorAll('h2, h3, h4'));
        headings.forEach(function(h) {
            var text = h.innerText.trim();
            // Strip leading numbers like "1. " or "01. "
            text = text.replace(/^\\d+\\.?\\s*/, '').trim();
            if (text.length > 2 && text.length < 70 && !seen[text]) {
                seen[text] = 1;
                results.push(text);
            }
        });

        // Also try venue card links
        Array.from(document.querySelectorAll('a[href]')).forEach(function(a) {
            var href = a.href;
            var text = a.innerText.trim().split('\\n')[0].trim();
            if (href.includes('/melbourne/') && !href.includes('/eat-drink') &&
                !href.includes('/guides') && text.length > 2 && text.length < 70 &&
                !seen[text]) {
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

    all_venues: dict[str, list[str]] = {}  # name -> [source urls]

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

        # Collect all guide URLs
        all_urls = set(SEED_URLS)
        print("Discovering UrbanList guide pages...")
        for seed in SEED_URLS:
            links = await get_guide_links(page, seed)
            for l in links:
                all_urls.add(l)
            print(f"  {seed.split('/')[-1]}: found {len(links)} sub-links")
            await asyncio.sleep(1.0)

        print(f"\nTotal pages to scrape: {len(all_urls)}")

        # Scrape each page
        for url in sorted(all_urls):
            short = url.replace("https://www.urbanlist.com/melbourne/", "")
            names = await scrape_venue_names(page, url)
            new = 0
            for n in names:
                if n not in all_venues:
                    all_venues[n] = []
                    new += 1
                if url not in all_venues[n]:
                    all_venues[n].append(url)
            print(f"  {short}: {len(names)} venues ({new} new)")
            await asyncio.sleep(1.0)

        await browser.close()

    print(f"\nTotal unique venues on UrbanList: {len(all_venues)}")

    # Cross-reference
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
                # Guess suburb from source URL
                suburb = "Melbourne"
                for src in sources:
                    parts = src.replace("https://www.urbanlist.com/melbourne/", "").split("/")
                    for part in parts:
                        if len(part) > 3 and "-" in part:
                            suburb = part.replace("-", " ").title()
                            break

                missing.append({
                    "name": name,
                    "suburb_guess": suburb,
                    "sources": [s.replace("https://www.urbanlist.com/melbourne/", "") for s in sources[:2]],
                })

    print(f"\n=== MISSING FROM DATABASE ({len(missing)}) ===")
    for m in missing:
        print(f"  {m['name']} ({m['suburb_guess']})")

    MISSING_FILE.parent.mkdir(exist_ok=True)
    MISSING_FILE.write_text(
        json.dumps({"missing": missing, "total_on_urbanlist": len(all_venues)}, indent=2),
        encoding="utf-8",
    )
    print(f"\nSaved to {MISSING_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
