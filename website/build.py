"""Assemble only the public website and its cited local media."""
from pathlib import Path
from shutil import copy2, copytree
import sys

site = Path(__file__).resolve().parent
root = site.parent
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
for name in ("index.html", "style.css", "site.js", "data.js", "mark.svg"):
    copy2(site / name, out / name)
for name in ("media", "fonts"):
    copytree(site / name, out / name, dirs_exist_ok=True)
(out / "assets").mkdir(exist_ok=True)
for source, target in (
    ("paper/main.pdf", "report.pdf"),
    ("docs/report_appendix.pdf", "supplement.pdf"),
    ("results/t4/raw/spatial_baseline_s0_videos/failure_t0_i0.mp4", "released.mp4"),
    ("results/t4/raw/spatial_cold3_fp16_s0_videos/success_t0_i0.mp4", "three-step.mp4"),
):
    copy2(root / source, out / "assets" / target)
(out / ".nojekyll").touch()
