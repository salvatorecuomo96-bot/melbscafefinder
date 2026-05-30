"""
Waits for sweep_missing_cafes.py (sweep2.log) to finish,
then runs the rest of the pipeline:
  1. filter_sweep_cafes.py  — remove non-cafes from cafes.json
  2. check_closures.py      — mark any permanently closed new cafes
  3. fix_bad_coords.py      — fix any bad coordinates
  4. git commit + push      — publish to live site
"""
import subprocess, sys, time, os
from pathlib import Path

ROOT   = Path(__file__).parent.parent
PYTHON = sys.executable
SWEEP2_LOG = ROOT / "data" / "sweep2.log"

def run(cmd, **kw):
    print(f"\n>>> {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, cwd=str(ROOT), **kw)

def sweep_done():
    if not SWEEP2_LOG.exists():
        return False
    text = SWEEP2_LOG.read_text(encoding="utf-8", errors="replace")
    lines = [l for l in text.strip().splitlines() if l.strip()]
    if not lines:
        return False
    last = lines[-1]
    # Done when last log line shows 640/640 or contains "Done" or "Grid sweep done"
    if "640/640" in last or "Grid sweep done" in last or "Done." in last:
        return True
    # Also done if we see the final summary lines
    if "Total new cafes added" in text or "No new cafes found" in text:
        return True
    return False

print("Waiting for sweep (sweep2.log 640/640)...", flush=True)
waited = 0
while not sweep_done():
    time.sleep(30)
    waited += 30
    if SWEEP2_LOG.exists():
        lines = SWEEP2_LOG.read_text(encoding="utf-8", errors="replace").strip().splitlines()
        last = lines[-1] if lines else "..."
        print(f"  [{waited//60}m] {last}", flush=True)
    if waited > 7200:  # 2 hour timeout
        print("Timeout waiting for sweep. Running pipeline anyway.", flush=True)
        break

print("\nSweep done! Running pipeline...", flush=True)

# Step 1: Filter sweep cafes (remove non-cafes)
run([PYTHON, "scraper/filter_sweep_cafes.py"])

# Step 2: Check closures on new cafes
run([PYTHON, "scraper/check_closures.py"])

# Step 3: Fix any bad coordinates
if (ROOT / "scraper" / "fix_bad_coords.py").exists():
    run([PYTHON, "scraper/fix_bad_coords.py"])

# Step 4: Commit and push
import json
cafes = json.loads((ROOT / "public" / "cafes.json").read_text(encoding="utf-8"))
count = len(cafes)
print(f"\nCafes.json now has {count} cafes. Committing...", flush=True)

run(["git", "add", "public/cafes.json"])
run(["git", "commit", "-m", f"feat: add new cafes from suburb sweep (total: {count})"])
run(["git", "push", "origin", "main"])

print("\nAll done! Pipeline complete.", flush=True)
