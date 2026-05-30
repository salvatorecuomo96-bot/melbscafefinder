"""
Scrapes Instagram links from cafe websites.
Saves instagram URL to cafe.instagram field in cafes.json.
Progress saved to data/social_progress.json (resumable).
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
PROGRESS   = ROOT / "data"   / "social_progress.json"
LOG_FILE   = ROOT / "data"   / "social_live.log"

INSTA_RE = re.compile(r"https?://(?:www\.)?instagram\.com/([A-Za-z0-9_.]+)/?", re.I)


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


async def find_instagram(page, website):
    try:
        await page.goto(website.rstrip("/"), wait_until="domcontentloaded", timeout=10000)
        await page.wait_for_timeout(800)
        html = await page.content()
        matches = INSTA_RE.findall(html)
        # Filter out generic Instagram handles (explore, p, reel, etc.)
        skip = {"explore", "p", "reel", "reels", "stories", "accounts", "instagram"}
        for handle in matches:
            if handle.lower() not in skip and len(handle) > 2:
                return f"https://www.instagram.com/{handle}/"
    except Exception:
        pass
    return None


async def main():
    LOG_FILE.parent.mkdir(exist_ok=True)
    LOG_FILE.write_text("", encoding="utf-8")

    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    todo_all = [c for c in cafes if c.get("website") and not c.get("instagram")]

    prog = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    done = set(prog.keys())
    todo = [c for c in todo_all if c["id"] not in done]
    found = sum(1 for v in prog.values() if v)

    log(f"Total with website, no instagram: {len(todo_all)} | Done: {len(done)} | To do: {len(todo)} | Found so far: {found}")

    if todo:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800},
                locale="en-AU",
            )
            page = await context.new_page()

            for cafe in todo:
                n = len(done) + 1
                insta = await find_instagram(page, cafe["website"])
                prog[cafe["id"]] = insta
                done.add(cafe["id"])

                if insta:
                    found += 1
                    log(f"{n}/{len(todo_all)} | {cafe['name']} — {insta}")
                else:
                    log(f"{n}/{len(todo_all)} | {cafe['name']} — not found")

                if len(done) % 50 == 0:
                    PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")
                    log(f"  [checkpoint — {found}/{len(done)} found]")

            await browser.close()

        PROGRESS.write_text(json.dumps(prog, indent=2, ensure_ascii=False), encoding="utf-8")

    log(f"\nDone. Found Instagram for {found} / {len(todo_all)} cafes.")

    cafe_map = {c["id"]: c for c in cafes}
    patched = 0
    for cid, insta in prog.items():
        if cid in cafe_map and insta:
            cafe_map[cid]["instagram"] = insta
            patched += 1

    CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"Written instagram to {patched} cafes in cafes.json")


if __name__ == "__main__":
    asyncio.run(main())
