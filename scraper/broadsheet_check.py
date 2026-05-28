"""
Scrapes all Broadsheet Melbourne best-cafes guide pages and cross-references
against public/cafes.json to find important missing cafes.

Outputs data/broadsheet_missing.json with names + Broadsheet URLs.
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
MISSING_FILE = ROOT / "data" / "broadsheet_missing.json"

# All Broadsheet best-cafes guide URLs (discovered from their homepage)
GUIDE_URLS = [
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-abbotsford",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-albert-park",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-armadale",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-ascot-vale",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-balaclava",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-bentleigh",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-bentleigh-east",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-brighton",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-brunswick",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-brunswick-east",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-camberwell",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-carlton",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-carlton-north",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-clifton-hill",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-coburg",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-collingwood",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-elsternwick",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-elwood",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-essendon",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-fairfield",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-fitzroy",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-fitzroy-north",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-flemington",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-footscray",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-glen-iris",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-hawthorn",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-hawthorn-east",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-kensington",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-kew",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-malvern",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-malvern-east",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-melbournes-cbd",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-northcote",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-pascoe-vale",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-port-melbourne",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-prahran",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-preston",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-richmond",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-seddon",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-south-melbourne",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-south-yarra",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-st-kilda",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-thornbury",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-west-footscray",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-west-melbourne",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-windsor",
    "https://www.broadsheet.com.au/melbourne/guides/best-cafes-yarraville",
    "https://www.broadsheet.com.au/melbourne/guides/best-coffee",
]

# Broadsheet venue types that are cafe-like
CAFE_TYPES = {"cafe", "bakery", "dessert", "patisserie", "coffee"}


def normalise(name: str) -> str:
    n = name.lower()
    n = re.sub(r"[''`‘’“”]", "", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    n = re.sub(r"\b(the|a|an|cafe|coffee|espresso|bar|melbourne|fitzroy|richmond)\b", "", n)
    return re.sub(r"\s+", " ", n).strip()


async def scrape_guide(page, url: str) -> list[dict]:
    """Return list of {name, type, broadsheet_url} from a guide page."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(2500)
    except Exception as e:
        print(f"  ERROR: {e}")
        return []

    # Extract venue links — format is "TYPE\nVenue Name" pointing to /melbourne/suburb/type/slug
    items = await page.evaluate("""(function() {
        var seen = {};
        return Array.from(document.querySelectorAll('a[href]'))
            .filter(function(a) {
                return a.href.match(/broadsheet\\.com\\.au\\/melbourne\\/[^/]+\\/(cafes|bakeries|dessert|patisseries|coffee)/);
            })
            .map(function(a) {
                var text = a.innerText.trim();
                var parts = text.split('\\n');
                var type = parts[0] ? parts[0].trim().toLowerCase() : '';
                var name = parts[1] ? parts[1].trim() : text;
                return {name: name, type: type, url: a.href};
            })
            .filter(function(x) { return x.name.length > 1 && !seen[x.name] && (seen[x.name] = 1); });
    })()""")

    return items


async def main():
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    existing_normalised = {normalise(c["name"]) for c in cafes}
    existing_lower = {c["name"].lower() for c in cafes}

    # name -> {type, sources: [guide_url], broadsheet_url}
    found: dict[str, dict] = {}

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

        for url in GUIDE_URLS:
            short = url.split("/guides/")[1]
            items = await scrape_guide(page, url)
            new_count = 0
            for item in items:
                if item["name"] not in found:
                    found[item["name"]] = {"type": item["type"], "sources": [], "broadsheet_url": item["url"]}
                    new_count += 1
                if url not in found[item["name"]]["sources"]:
                    found[item["name"]]["sources"].append(url)
            print(f"{short}: {len(items)} venues ({new_count} new)")
            await asyncio.sleep(1.0)

        await browser.close()

    print(f"\nTotal unique venues on Broadsheet: {len(found)}")

    # Cross-reference — find ones not in our database
    missing = []
    for name, data in sorted(found.items()):
        norm = normalise(name)
        if name.lower() not in existing_lower and norm not in existing_normalised:
            # Check partial match to avoid near-duplicates
            close = any(
                norm and existing and len(norm) > 4 and (norm in existing or existing in norm)
                for existing in existing_normalised
                if existing and len(existing) > 4
            )
            if not close:
                suburb = data["sources"][0].split("/guides/best-cafes-")[-1].replace("-", " ").title() if "best-cafes-" in data["sources"][0] else "Melbourne"
                if suburb == data["sources"][0]:
                    suburb = "Melbourne"
                missing.append({
                    "name": name,
                    "type": data["type"],
                    "suburb_guess": suburb,
                    "broadsheet_url": data["broadsheet_url"],
                    "guide_sources": [s.split("/guides/")[1] for s in data["sources"]],
                })

    print(f"\n=== NOT IN OUR DATABASE ({len(missing)}) ===")
    for m in missing:
        print(f"  [{m['type'].upper()}] {m['name']} ({m['suburb_guess']})")

    MISSING_FILE.parent.mkdir(exist_ok=True)
    MISSING_FILE.write_text(json.dumps({"missing": missing, "total_on_broadsheet": len(found)}, indent=2), encoding="utf-8")
    print(f"\nSaved to {MISSING_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
