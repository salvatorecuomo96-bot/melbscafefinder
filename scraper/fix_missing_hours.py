"""
Scrapes Google Maps opening hours for cafes that have empty/all-Closed hours.
Progress saved to data/hours_progress.json (resumable).
Live log written to data/hours_live.log — run: Get-Content data/hours_live.log -Wait
Updates public/cafes.json when done.
"""

import asyncio
import io
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from playwright.async_api import async_playwright

ROOT       = Path(__file__).parent.parent
CAFES_FILE = ROOT / "public" / "cafes.json"
PROGRESS   = ROOT / "data"   / "hours_progress.json"
LOG_FILE   = ROOT / "data"   / "hours_live.log"

DAY_MAP = {
    "Monday": "mon", "Tuesday": "tue", "Wednesday": "wed",
    "Thursday": "thu", "Friday": "fri", "Saturday": "sat", "Sunday": "sun",
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def hours_known(oh):
    return any(
        oh.get(d, "").strip().lower() not in ("", "closed")
        for d in ("mon","tue","wed","thu","fri","sat","sun")
    )


def to24(t):
    t = t.strip()
    if re.match(r"^\d{1,2}:\d{2}$", t):
        return t.zfill(5)
    try:
        from datetime import datetime as dt
        return dt.strptime(t, "%I:%M %p").strftime("%H:%M")
    except Exception:
        try:
            return datetime.strptime(t, "%I:%M%p").strftime("%H:%M")
        except Exception:
            return t


def parse_hours(text):
    hours = {}
    for day_full, day_key in DAY_MAP.items():
        # "Monday 8:00 AM – 4:00 PM" or "Monday 08:00 - 16:00"
        m = re.search(
            rf"{day_full}\s+(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?)"
            rf"\s*[–\-]\s*(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?|Open\s+24\s+hours?)",
            text, re.IGNORECASE
        )
        if m:
            close = m.group(2).strip()
            if re.search(r"24\s*h", close, re.I):
                hours[day_key] = "Open 24h"
            else:
                hours[day_key] = f"{to24(m.group(1))} - {to24(close)}"
        elif re.search(rf"{day_full}\s+Closed", text, re.IGNORECASE):
            hours[day_key] = "Closed"
    return hours


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ── Scrape ─────────────────────────────────────────────────────────────────────

async def get_hours(page, cafe):
    lat, lng = cafe.get("latitude", 0), cafe.get("longitude", 0)
    name    = cafe["name"]
    suburb  = cafe["suburb"]

    # Build URL — coords are more reliable than search
    if lat and lat != 0 and lng and lng != 0:
        search_q = f"{lat},{lng}"
        url = f"https://www.google.com/maps/search/?api=1&query={search_q}"
    else:
        q = f"{name} {suburb} Melbourne".replace(" ", "+")
        url = f"https://www.google.com/maps/search/{q}"

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(2500)
    except Exception:
        return None

    # If still on search-results page, click first place result
    if "@" not in page.url:
        try:
            first = page.locator('a[href*="/maps/place/"]').first
            await first.click(timeout=5000)
            await page.wait_for_timeout(2500)
        except Exception:
            # Try clicking the top result card
            try:
                card = page.locator('[data-result-index="0"]').first
                await card.click(timeout=3000)
                await page.wait_for_timeout(2000)
            except Exception:
                return None

    # Try to expand the hours section (it may be collapsed)
    for sel in [
        'button[aria-label*="hour" i][aria-expanded="false"]',
        'button[data-item-id*="oh"]',
        'div[aria-label*="hour" i] button',
        'button:has-text("See more hours")',
        'button:has-text("Hours")',
    ]:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=1200):
                await btn.click(timeout=2000)
                await page.wait_for_timeout(1000)
                break
        except Exception:
            continue

    # Extract text from main panel
    try:
        panel = page.locator('[role="main"]').first
        text  = await panel.inner_text(timeout=6000)
        hours = parse_hours(text)
        if hours_known(hours):
            return hours
    except Exception:
        pass

    return None


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    # Clear / init log
    LOG_FILE.parent.mkdir(exist_ok=True)
    LOG_FILE.write_text("", encoding="utf-8")

    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))

    # Identify cafes that need hours
    todo_all = [c for c in cafes if not hours_known(c.get("openingHours") or {})]

    # Load existing progress
    prog = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    done = set(prog.keys())
    todo = [c for c in todo_all if c["id"] not in done]

    found = sum(1 for v in prog.values() if v and hours_known(v))

    log(f"Total needing hours: {len(todo_all)} | Done: {len(done)} | To do: {len(todo)} | Found so far: {found}")

    if todo:
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

            for cafe in todo:
                n = len(done) + 1
                log(f"{n}/{len(todo_all)} | {cafe['name']} — {cafe['suburb']}")

                hours = await get_hours(page, cafe)

                if hours and hours_known(hours):
                    log(f"  ✓ {hours}")
                    found += 1
                else:
                    log(f"  — no hours")
                    hours = {}

                prog[cafe["id"]] = hours
                done.add(cafe["id"])

                # Checkpoint every 15
                if len(done) % 15 == 0:
                    PROGRESS.write_text(
                        json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8"
                    )
                    log(f"  [saved — {found}/{len(done)} found]")

                await asyncio.sleep(0.4)

            await browser.close()

        PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")

    log(f"\nDone. Found hours for {found} / {len(todo_all)} cafes.")

    # Apply results back to cafes.json
    cafe_map = {c["id"]: c for c in cafes}
    patched = 0
    for cid, hours in prog.items():
        if cid in cafe_map and hours and hours_known(hours):
            cafe_map[cid]["openingHours"] = hours
            patched += 1

    CAFES_FILE.write_text(
        json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    log(f"Written hours to {patched} cafes in cafes.json")


if __name__ == "__main__":
    asyncio.run(main())
