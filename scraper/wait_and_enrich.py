"""
Waits for sweep_missing_cafes.py and scrape_menu_images.py to finish,
then runs check_closures.py and enrich_cafes.py.
"""
import subprocess, sys, time
from pathlib import Path

ROOT   = Path(__file__).parent.parent
PYTHON = sys.executable

def is_done(log_file, done_marker):
    if not log_file.exists():
        return False
    return done_marker in log_file.read_text(encoding="utf-8", errors="replace")

sweep_log = ROOT / "data" / "sweep.log"
menu_log  = ROOT / "data" / "menu_images_live.log"

print("Waiting for sweep and menu scrapers to finish...")
while True:
    sweep_done = is_done(sweep_log, "Grid sweep done") or is_done(sweep_log, "No new cafes")
    menu_done  = is_done(menu_log,  "Done. Found menus")
    print(f"  sweep={'done' if sweep_done else 'running'} | menu={'done' if menu_done else 'running'}", flush=True)
    if sweep_done and menu_done:
        break
    time.sleep(60)

print("\nFiltering non-cafes from sweep results...")
subprocess.run([PYTHON, str(Path(__file__).parent / "filter_sweep_cafes.py")], cwd=str(ROOT))

print("\nRunning closure check...")
subprocess.run([PYTHON, str(Path(__file__).parent / "check_closures.py")], cwd=str(ROOT))

print("\nFixing bad coordinates...")
subprocess.run([PYTHON, str(Path(__file__).parent / "fix_bad_coords.py")], cwd=str(ROOT))

print("\nRunning enrich (photos, ratings, price level)...")
subprocess.run([PYTHON, str(Path(__file__).parent / "enrich_cafes.py")], cwd=str(ROOT))

print("\nScraping menus for new cafes from sweep...")
subprocess.run([PYTHON, str(Path(__file__).parent / "scrape_menu_images.py")], cwd=str(ROOT))

print("\nScraping Instagram links from cafe websites...")
subprocess.run([PYTHON, str(Path(__file__).parent / "scrape_social.py")], cwd=str(ROOT))

print("\nCommitting and pushing to git...")
subprocess.run(["git", "add", "public/cafes.json", "scraper/"], cwd=str(ROOT))
subprocess.run(["git", "commit", "-m", "feat: enrich all cafes — hours, coords, photos, ratings, price, menus\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"], cwd=str(ROOT))
subprocess.run(["git", "push", "origin", "main"], cwd=str(ROOT))

print("\nAll done.")
