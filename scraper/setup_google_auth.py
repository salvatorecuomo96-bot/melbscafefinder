"""
Saves your existing Chrome Google login session for the hours scraper.
Close Chrome completely before running this.
"""

import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright

AUTH_FILE   = Path(__file__).parent / "google_auth.json"
CHROME_DATA = Path(os.environ["LOCALAPPDATA"]) / "Google" / "Chrome" / "User Data"


async def main():
    if not CHROME_DATA.exists():
        print(f"Chrome data not found at {CHROME_DATA}")
        return

    print("Close ALL Chrome windows first, then press Enter...")
    input()

    print("Opening your Chrome profile (already logged in to Google)...")

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(CHROME_DATA),
            channel="chrome",
            headless=False,
            args=["--start-maximized"],
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://myaccount.google.com", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(2000)

        title = await page.title()
        print(f"Page title: {title}")

        if "google" in title.lower() or "account" in title.lower() or "myaccount" in page.url:
            await ctx.storage_state(path=str(AUTH_FILE))
            print(f"\nSession saved to {AUTH_FILE}")
            print("You can now close this window and run: python scraper/fix_missing_hours.py")
        else:
            print("Doesn't look like you're logged in. Check the browser window.")
            input("Press Enter to save anyway...")
            await ctx.storage_state(path=str(AUTH_FILE))

        await ctx.close()


if __name__ == "__main__":
    asyncio.run(main())
