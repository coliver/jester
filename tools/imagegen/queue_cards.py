"""Queue one ComfyUI job per CSV row.

Usage: python3 queue_cards.py [kind] [--limit N] [--prefix DIR]
  kind     jesters (default), tarot or masks: reads assets/<kind>/prompts.csv
           (columns: id,prompt), the single source of art prompts. Card ids,
           names and rarities live in game.js; test/art-prompts.test.js keeps
           the two in step.
Env: COMFY_URL (default http://127.0.0.1:8600)

style.txt is the shared style prefix put in front of every prompt (the text
baked into the workflow's prompt node is overwritten on each run).

workflow_api.json needs the checkpoint/LoRAs named in it, plus the style
reference image it loads (LoadImage node 15) present in ComfyUI's input dir.
"""
import argparse
import csv
import copy
import json
import os
import random
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).parent
ASSETS = HERE.parent.parent / "assets"
COMFY_URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8600")
WORKFLOW_FILE = HERE / "workflow_api.json"

parser = argparse.ArgumentParser()
parser.add_argument("kind", nargs="?", default="jesters", choices=["jesters", "tarot", "masks"])
parser.add_argument("--limit", type=int, default=None, help="queue only the first N rows")
parser.add_argument("--prefix", default="joker_cards", help="ComfyUI output subfolder")
args = parser.parse_args()

PROMPT_NODE = "7"
PROMPT_FIELD = "text"
SAMPLER_NODE = "9"
SAVE_NODE = "8"

STYLE = (HERE / "style.txt").read_text(encoding="utf-8").strip()

with open(WORKFLOW_FILE, "r", encoding="utf-8") as f:
    template = json.load(f)

with open(ASSETS / args.kind / "prompts.csv", "r", encoding="utf-8-sig", newline="") as f:
    cards = list(csv.DictReader(f))

for index, card in enumerate(cards):
    if args.limit is not None and index >= args.limit:
        break
    name = card["id"].strip()
    prompt = card["prompt"].strip()

    workflow = copy.deepcopy(template)
    workflow[PROMPT_NODE]["inputs"][PROMPT_FIELD] = (
        f"{STYLE}, {prompt}"
    )
    workflow[SAMPLER_NODE]["inputs"]["seed"] = random.randrange(0, 2**64)
    workflow[SAVE_NODE]["inputs"]["filename_prefix"] = (
        f"{args.prefix}/{name}"
    )

    payload = {
        "prompt": workflow,
        "client_id": str(uuid.uuid4()),
    }
    request = Request(
        f"{COMFY_URL}/prompt",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    with urlopen(request) as response:
        result = json.load(response)

    print(
        f"Queued {name} with seed "
        f"{workflow[SAMPLER_NODE]['inputs']['seed']}: {result}"
    )
