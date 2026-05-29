"""
One-time setup: opens a visible browser for you to log in to Google.
After you log in, press Enter in this terminal and your session is saved.
The hours scraper will then use that session automatically.
"""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

AUTH_FILE = Path(__file__).parent / "google_auth.json"


async def main():
    print("Opening browser — log in to Google when it appears...")
    print("After logging in, come back here and press Enter.\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--start-maximized"],
        )
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="en-AU",
        )
        page = await ctx.new_page()
        await page.goto("https://accounts.google.com/signin", wait_until="domcontentloaded")

        print("Log in to your Google account in the browser window.")
        input("Press Enter here once you are logged in and can see your Google account...")

        # Save the session
        await ctx.storage_state(path=str(AUTH_FILE))
        print(f"\nSession saved to {AUTH_FILE}")
        print("You can now run: python scraper/fix_missing_hours.py")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
