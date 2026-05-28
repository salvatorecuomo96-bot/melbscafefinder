"""
Checks Google Maps for each cafe's closure status.
Detects: permanently closed, temporarily closed, operational.
Resumable — saves progress to data/closure_progress.json.
"""

import asyncio
import io
import json
import os
import random
import re
import sys

# Force UTF-8 output on Windows to handle special characters in cafe names
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).parent.parent
CAFES_FILE = ROOT / "public" / "cafes.json"
PROGRESS_FILE = ROOT / "data" / "closure_progress.json"
RESULTS_FILE = ROOT / "data" / "closure_results.json"

PERMANENTLY_CLOSED_PHRASES = [
    "permanently closed",
    "permanently_closed",
]
TEMPORARILY_CLOSED_PHRASES = [
    "temporarily closed",
    "closed temporarily",
    "may be temporarily closed",
    "temporarily_closed",
]


def extract_place_id(url: str) -> str | None:
    if not url:
        return None
    m = re.search(r"query_place_id=([^&]+)", url)
    return m.group(1) if m else None


def classify(text: str) -> str:
    lower = text.lower()
    if any(p in lower for p in PERMANENTLY_CLOSED_PHRASES):
        return "permanently_closed"
    if any(p in lower for p in TEMPORARILY_CLOSED_PHRASES):
        return "temporarily_closed"
    return "operational"


async def check_cafe(page, cafe: dict) -> str:
    place_id = extract_place_id(cafe.get("googleMapsUrl", ""))
    if not place_id:
        return "no_place_id"

    url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        # Wait for main content to render
        await page.wait_for_timeout(2500)
        text = await page.evaluate("document.body.innerText")
        return classify(text)
    except Exception as e:
        return f"error:{str(e)[:60]}"


async def main():
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))

    # Load progress
    progress: dict = {}
    if PROGRESS_FILE.exists():
        progress = json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
        print(f"Resuming — {len(progress)} already done")

    remaining = [c for c in cafes if c["id"] not in progress]
    total = len(cafes)
    done = len(progress)

    print(f"Total: {total} | Done: {done} | Remaining: {len(remaining)}")
    if not remaining:
        print("All done!")
        return

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

        consecutive_errors = 0

        for i, cafe in enumerate(remaining):
            status = await check_cafe(page, cafe)
            progress[cafe["id"]] = status
            done += 1

            flag = ""
            if status == "permanently_closed":
                flag = " *** PERMANENTLY CLOSED ***"
            elif status == "temporarily_closed":
                flag = " ** TEMPORARILY CLOSED **"
            elif status.startswith("error"):
                flag = f" [ERR]"

            print(f"{done}/{total} | {cafe['name']} — {cafe['suburb']} | {status}{flag}", flush=True)

            # Save progress every 10 cafes
            if done % 10 == 0:
                PROGRESS_FILE.write_text(json.dumps(progress, indent=2), encoding="utf-8")

            # Track consecutive errors (possible rate-limiting)
            if status.startswith("error"):
                consecutive_errors += 1
                if consecutive_errors >= 5:
                    print("5 consecutive errors — pausing 30s then retrying with new page")
                    await asyncio.sleep(30)
                    await page.close()
                    page = await context.new_page()
                    consecutive_errors = 0
            else:
                consecutive_errors = 0

            # Random delay 2.5–4.5s
            delay = 2.5 + random.random() * 2.0
            await asyncio.sleep(delay)

        await browser.close()

    # Final save
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2), encoding="utf-8")

    # Write clean results summary
    permanently = [{"id": k, "name": next((c["name"] for c in cafes if c["id"] == k), k), "suburb": next((c["suburb"] for c in cafes if c["id"] == k), "")} for k, v in progress.items() if v == "permanently_closed"]
    temporarily = [{"id": k, "name": next((c["name"] for c in cafes if c["id"] == k), k), "suburb": next((c["suburb"] for c in cafes if c["id"] == k), "")} for k, v in progress.items() if v == "temporarily_closed"]
    errors = {k: v for k, v in progress.items() if v.startswith("error") or v == "no_place_id"}

    results = {
        "permanently_closed": permanently,
        "temporarily_closed": temporarily,
        "errors": errors,
        "summary": {
            "total": total,
            "operational": total - len(permanently) - len(temporarily),
            "permanently_closed": len(permanently),
            "temporarily_closed": len(temporarily),
            "errors": len(errors),
        }
    }
    RESULTS_FILE.write_text(json.dumps(results, indent=2), encoding="utf-8")

    print("\n=== DONE ===")
    print(f"Permanently closed: {len(permanently)}")
    print(f"Temporarily closed: {len(temporarily)}")
    print(f"Errors: {len(errors)}")
    print(f"Results saved to {RESULTS_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
