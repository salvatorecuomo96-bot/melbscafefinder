"""
Runs in sequence:
  1. fetch_hours_places.py  — fills opening hours for all cafes via Google Places API
  2. scrape_menu_images.py  — scrapes menu images for cafes within 10km of CBD

Run: python scraper/run_all.py
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
PYTHON = sys.executable


def run(script_name):
    script = Path(__file__).parent / script_name
    print(f"\n{'='*60}")
    print(f"STARTING: {script_name}")
    print(f"{'='*60}\n")
    result = subprocess.run([PYTHON, str(script)], cwd=str(ROOT))
    if result.returncode != 0:
        print(f"\nWARNING: {script_name} exited with code {result.returncode}")
    return result.returncode


if __name__ == "__main__":
    run("fetch_hours_places.py")
    run("scrape_menu_images.py")
    run("sweep_missing_cafes.py")
    run("check_closures.py")
    run("enrich_cafes.py")
    print("\n\nAll done.")
