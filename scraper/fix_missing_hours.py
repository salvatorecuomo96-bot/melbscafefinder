"""
Scrapes opening hours for cafes that have empty/all-Closed hours.
Source 1: Google Maps (full week, requires google_auth.json — run setup_google_auth.py first)
Source 2: Cafe website (schema.org JSON-LD, text patterns) — fallback
Progress saved to data/hours_progress.json (resumable).
Live log: data/hours_live.log — watch with: Get-Content data\hours_live.log -Wait
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

AUTH_FILE = Path(__file__).parent / "google_auth.json"

ROOT       = Path(__file__).parent.parent
CAFES_FILE = ROOT / "public" / "cafes.json"
PROGRESS   = ROOT / "data"   / "hours_progress.json"
LOG_FILE   = ROOT / "data"   / "hours_live.log"

DAY_MAP = {
    "Monday": "mon", "Tuesday": "tue", "Wednesday": "wed",
    "Thursday": "thu", "Friday": "fri", "Saturday": "sat", "Sunday": "sun",
}
DAY_SHORT = {
    "Mo": "mon", "Tu": "tue", "We": "wed",
    "Th": "thu", "Fr": "fri", "Sa": "sat", "Su": "sun",
}
DAYS = list(DAY_MAP.values())


# ── Helpers ────────────────────────────────────────────────────────────────────

def hours_known(oh):
    return any(oh.get(d, "").strip().lower() not in ("", "closed") for d in DAYS)


def to24(t):
    t = t.strip()
    if re.match(r"^\d{1,2}:\d{2}$", t):
        return t.zfill(5)
    try:
        return datetime.strptime(t, "%I:%M %p").strftime("%H:%M")
    except Exception:
        try:
            return datetime.strptime(t.upper(), "%I:%M%p").strftime("%H:%M")
        except Exception:
            try:
                return datetime.strptime(t, "%I%p").strftime("%H:%M")
            except Exception:
                return t


def parse_hours_text(text):
    """Parse hours from free-form text. Returns dict with day keys."""
    hours = {}
    # Full day names: "Monday 8am - 4pm" or "Monday 08:00 - 16:00"
    for day_full, day_key in DAY_MAP.items():
        m = re.search(
            rf"{day_full}\s*[:\-]?\s*(\d{{1,2}}(?::\d{{2}})?\s*(?:AM|PM|am|pm)?)"
            rf"\s*[-–—to]+\s*(\d{{1,2}}(?::\d{{2}})?\s*(?:AM|PM|am|pm)?)",
            text, re.IGNORECASE
        )
        if m:
            hours[day_key] = f"{to24(m.group(1))} - {to24(m.group(2))}"
        elif re.search(rf"{day_full}[:\s]*[Cc]losed", text, re.IGNORECASE):
            hours[day_key] = "Closed"

    if hours_known(hours):
        return hours

    # Range patterns: "Mon - Fri 7:00am - 4:00pm" / "Mon–Wed | 8am–3pm"
    range_pat = re.compile(
        r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s*[-–—to/]+\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*"
        r"\s*[:\|]?\s*(\d{1,2}(?::\d{2})?(?:am|pm|AM|PM)?)\s*[-–—to]+\s*(\d{1,2}(?::\d{2})?(?:am|pm|AM|PM)?)",
        re.IGNORECASE
    )
    for m in range_pat.finditer(text):
        d1, d2 = m.group(1)[:2].capitalize(), m.group(2)[:2].capitalize()
        # Map short to index
        order = ["Mo","Tu","We","Th","Fr","Sa","Su"]
        if d1 in order and d2 in order:
            start, end = order.index(d1), order.index(d2)
            if end < start: end += 7
            t = f"{to24(m.group(3))} - {to24(m.group(4))}"
            for i in range(start, end + 1):
                key = DAYS[i % 7]
                if key not in hours:
                    hours[key] = t

    return hours


def parse_schema_hours(json_text):
    """Parse schema.org openingHours string like 'Mo-Fr 07:00-17:00'."""
    hours = {}
    # Format: "Mo-Fr 07:00-17:00" or "Sa 08:00-14:00" or "Mo Tu We 08:00-16:00"
    for segment in re.split(r",\s*", json_text):
        segment = segment.strip()
        m = re.match(
            r"([A-Za-z]{2}(?:[-–][A-Za-z]{2})?(?:\s+[A-Za-z]{2})*)"
            r"\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})",
            segment
        )
        if not m:
            continue
        days_str, t_open, t_close = m.group(1), m.group(2), m.group(3)
        t = f"{t_open.zfill(5)} - {t_close.zfill(5)}"

        # Expand day ranges/lists
        day_tokens = re.findall(r"[A-Z][a-z]", days_str)
        for token in day_tokens:
            if token in DAY_SHORT:
                hours[DAY_SHORT[token]] = t

        # Handle range like Mo-Fr
        range_m = re.match(r"([A-Z][a-z])-([A-Z][a-z])", days_str)
        if range_m:
            order = list(DAY_SHORT.keys())  # Mo Tu We Th Fr Sa Su
            d1, d2 = range_m.group(1), range_m.group(2)
            if d1 in order and d2 in order:
                start, end = order.index(d1), order.index(d2)
                for i in range(start, end + 1):
                    hours[DAY_SHORT[order[i]]] = t

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


# ── Website hours ──────────────────────────────────────────────────────────────

HOURS_PAGES = ["/contact", "/about", "/find-us", "/visit", "/hours", "/location",
               "/our-story", "/info", "/cafe", "/store"]


async def get_website_hours(page, website):
    base = website.rstrip("/")
    pages_to_try = [base] + [base + p for p in HOURS_PAGES]

    for url in pages_to_try[:6]:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=10000)
            await page.wait_for_timeout(1000)
        except Exception:
            continue

        # 1. Schema.org JSON-LD
        try:
            schemas = await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
                    .map(s => s.textContent)
                    .filter(t => t.includes('openingHours') || t.includes('OpeningHours'));
            }""")
            for s in schemas:
                try:
                    data = json.loads(s)
                    # Handle array
                    if isinstance(data, list):
                        for item in data:
                            oh = item.get("openingHours", "")
                            if oh:
                                h = parse_schema_hours(oh if isinstance(oh, str) else " ".join(oh))
                                if hours_known(h):
                                    return h
                    else:
                        oh = data.get("openingHours", "")
                        if oh:
                            h = parse_schema_hours(oh if isinstance(oh, str) else " ".join(oh))
                            if hours_known(h):
                                return h
                        # openingHoursSpecification
                        spec = data.get("openingHoursSpecification", [])
                        if spec:
                            h = {}
                            for item in (spec if isinstance(spec, list) else [spec]):
                                dow = item.get("dayOfWeek", "")
                                if isinstance(dow, list): dow = dow[0]
                                dow = str(dow).split("/")[-1]  # extract from URL
                                key = DAY_MAP.get(dow)
                                if key:
                                    opens  = item.get("opens", "")
                                    closes = item.get("closes", "")
                                    if opens and closes:
                                        h[key] = f"{opens[:5]} - {closes[:5]}"
                            if hours_known(h):
                                return h
                except Exception:
                    pass
        except Exception:
            pass

        # 2. Page text patterns
        try:
            body = await page.evaluate("() => document.body.innerText")
            if body and len(body) > 200:
                h = parse_hours_text(body)
                if hours_known(h):
                    return h
        except Exception:
            pass

    return None


# ── Google Maps full hours (requires login session) ───────────────────────────

async def get_gmaps_hours(page, cafe):
    """Navigate to cafe's Google Maps page and extract full weekly hours."""
    q = f"{cafe['name']} {cafe['suburb']} Melbourne".replace(" ", "+")
    url = f"https://www.google.com/maps/search/{q}"

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(3000)
    except Exception:
        return None

    # If still on search results, click first result
    if "@" not in page.url:
        try:
            await page.locator('a[href*="/maps/place/"]').first.click(timeout=5000)
            await page.wait_for_timeout(3000)
        except Exception:
            return None

    # Expand the hours dropdown
    try:
        btn = page.locator('div[jsaction*="openhours"][jsaction*="dropdown"]').first
        await btn.scroll_into_view_if_needed(timeout=3000)
        await btn.click(timeout=3000)
        await page.wait_for_timeout(1500)
    except Exception:
        pass

    # Extract hours from the expanded panel
    try:
        text = await page.locator('[role="main"]').first.inner_text(timeout=5000)
        # Check we have the full week (not limited view)
        if "limited view" in text.lower():
            return None
        h = parse_hours_text(text)
        if hours_known(h):
            return h
    except Exception:
        pass

    return None


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    LOG_FILE.parent.mkdir(exist_ok=True)
    LOG_FILE.write_text("", encoding="utf-8")

    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    todo_all = [c for c in cafes if not hours_known(c.get("openingHours") or {})]

    prog = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    done = set(prog.keys())
    todo = [c for c in todo_all if c["id"] not in done]
    found = sum(1 for v in prog.values() if v and hours_known(v))

    log(f"Total needing hours: {len(todo_all)} | Done: {len(done)} | To do: {len(todo)} | Found so far: {found}")

    use_gmaps = AUTH_FILE.exists()
    if use_gmaps:
        log(f"Google auth found — will use Google Maps for full hours")
    else:
        log(f"No google_auth.json — run setup_google_auth.py first for better results")
        log(f"Falling back to website scraping only")

    if todo:
        async with async_playwright() as p:
            launch_kwargs = {"headless": True}
            if use_gmaps:
                launch_kwargs["channel"] = "chrome"  # real Chrome avoids Google bot detection
            browser = await p.chromium.launch(**launch_kwargs)
            ctx_kwargs = dict(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
                locale="en-AU",
            )
            if use_gmaps:
                ctx_kwargs["storage_state"] = str(AUTH_FILE)
            context = await browser.new_context(**ctx_kwargs)
            page = await context.new_page()

            for cafe in todo:
                n = len(done) + 1
                log(f"{n}/{len(todo_all)} | {cafe['name']} — {cafe['suburb']}")

                hours = None

                # 1. Google Maps (full week, logged-in session)
                if use_gmaps:
                    hours = await get_gmaps_hours(page, cafe)
                    if hours and hours_known(hours):
                        log(f"  [maps] {hours}")
                        found += 1

                # 2. Website fallback
                if not hours and cafe.get("website"):
                    hours = await get_website_hours(page, cafe["website"])
                    if hours and hours_known(hours):
                        log(f"  [web] {hours}")
                        found += 1

                if not hours:
                    log(f"  — no hours found")
                    hours = {}

                prog[cafe["id"]] = hours
                done.add(cafe["id"])

                if len(done) % 20 == 0:
                    PROGRESS.write_text(
                        json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8"
                    )
                    log(f"  [saved — {found}/{len(done)} found]")

                await asyncio.sleep(0.2)

            await browser.close()

        PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")

    log(f"\nDone. Found hours for {found} / {len(todo_all)} cafes.")

    # Apply to cafes.json
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
