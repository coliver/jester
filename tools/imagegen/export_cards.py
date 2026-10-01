"""Copy finished ComfyUI renders into assets/<kind>/<id>.png at 150x150.

Usage: python3 export_cards.py KIND [--only ID[,ID...]] [--prefix DIR]
Reads the newest <prefix>/<id>_NNNNN_.png for each id in assets/<kind>/prompts.csv
from the ComfyUI output folder (env COMFY_OUTPUT, default the Windows portable
install as seen from WSL) and writes the downscaled RGB PNG next to the card art.
Pair it with queue_cards.py, which only queues the jobs.
"""
import argparse
import csv
import os
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent.parent / "assets"
OUTPUT = Path(os.environ.get("COMFY_OUTPUT", "/mnt/h/code/_ComfyUI_windows_portable/ComfyUI/output"))

parser = argparse.ArgumentParser()
parser.add_argument("kind")
parser.add_argument("--only", default=None, help="comma-separated card ids (default: all)")
parser.add_argument("--prefix", default="court_art", help="ComfyUI output subfolder")
parser.add_argument("--size", type=int, default=150)
args = parser.parse_args()

with open(ASSETS / args.kind / "prompts.csv", encoding="utf-8-sig", newline="") as f:
    ids = [row["id"].strip() for row in csv.DictReader(f)]
if args.only:
    wanted = set(args.only.split(","))
    ids = [i for i in ids if i in wanted]

for card_id in ids:
    renders = sorted((OUTPUT / args.prefix).glob(f"{card_id}_*.png"), key=lambda p: p.stat().st_mtime)
    if not renders:
        print(f"skip {card_id}: no render yet")
        continue
    img = Image.open(renders[-1]).convert("RGB").resize((args.size, args.size), Image.LANCZOS)
    img.save(ASSETS / args.kind / f"{card_id}.png", optimize=True)
    print(f"wrote assets/{args.kind}/{card_id}.png from {renders[-1].name}")
