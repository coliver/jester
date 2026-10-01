"""Queue one ComfyUI job per CSV row.

Usage: python3 queue_cards.py [kind] [--limit N] [--only ID[,ID...]] [--repeat N] [--prefix DIR]
  kind     jesters (default), tarot, masks or faces: reads assets/<kind>/prompts.csv
           (columns: id,prompt), the single source of art prompts. Card ids,
           names and rarities live in game.js; test/art-prompts.test.js keeps
           the two in step.
Env: COMFY_URL (default http://127.0.0.1:8600)

style.txt is the shared style prefix put in front of every prompt (the text
baked into the workflow's prompt node is overwritten on each run).

workflow_api.json is the Z-Image Turbo workflow (a copy of ZImageTurbo.json from
the ComfyUI install, set to 1:1 at 1 megapixel); it needs the models named in
it (z_image_turbo_bf16, qwen_3_4b, zImageTurboVAE_v10) and the ClownsharK and
SeedVarianceEnhancer custom nodes. Both samplers' seeds are randomised per card.
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
parser.add_argument("kind", nargs="?", default="jesters", choices=["jesters", "tarot", "masks", "faces"])
parser.add_argument("--limit", type=int, default=None, help="queue only the first N rows")
parser.add_argument("--only", default=None, help="comma-separated card ids to queue (default: all)")
parser.add_argument("--repeat", type=int, default=1, help="queue each card N times with different seeds")
parser.add_argument("--prefix", default="joker_cards", help="ComfyUI output subfolder")
args = parser.parse_args()

PROMPT_NODE = "6"
PROMPT_FIELD = "text"
SEED_NODES = ("52", "60")  # ClownsharKSampler, SeedVarianceEnhancer
SAVE_NODE = "9"

STYLE = (HERE / "style.txt").read_text(encoding="utf-8").strip()

with open(WORKFLOW_FILE, "r", encoding="utf-8") as f:
    template = json.load(f)

with open(ASSETS / args.kind / "prompts.csv", "r", encoding="utf-8-sig", newline="") as f:
    cards = list(csv.DictReader(f))

if args.only:
    wanted = set(args.only.split(","))
    cards = [c for c in cards if c["id"].strip() in wanted]
cards = [c for c in cards for _ in range(args.repeat)]

for index, card in enumerate(cards):
    if args.limit is not None and index >= args.limit:
        break
    name = card["id"].strip()
    prompt = card["prompt"].strip()

    workflow = copy.deepcopy(template)
    workflow[PROMPT_NODE]["inputs"][PROMPT_FIELD] = (
        f"{STYLE}, {prompt}"
    )
    seed = random.randrange(0, 2**48)
    for node in SEED_NODES:
        workflow[node]["inputs"]["seed"] = seed
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
        f"{seed}: {result}"
    )
