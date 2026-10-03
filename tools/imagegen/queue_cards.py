"""Queue one ComfyUI job per CSV row.

Usage: python3 queue_cards.py [kind] [--limit N] [--only ID[,ID...]] [--repeat N] [--seed N] [--prefix DIR]
  kind     jesters (default), decrees, masks, faces, bosses or court: reads assets/<kind>/prompts.csv
           (columns: id,prompt), the single source of art prompts. Card ids,
           names and rarities live in src/; test/art-prompts.test.js keeps
           the two in step.
Env: COMFY_URL (default http://127.0.0.1:8600)
ComfyUI runs on the Windows host, which WSL cannot reach (refused/timeout), so from WSL run this
with Windows Python: COMFY_URL=http://127.0.0.1:8600 python.exe queue_cards.py ... (export_cards.py
only reads the output folder and works from WSL).

style.txt is the shared style prefix (style_<kind>.txt replaces it for that kind, placed after the prompt) put in front of every prompt (the text
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
parser.add_argument("kind", nargs="?", default="jesters", choices=["jesters", "decrees", "masks", "faces", "bosses", "court"])
parser.add_argument("--limit", type=int, default=None, help="queue only the first N rows")
parser.add_argument("--only", default=None, help="comma-separated card ids to queue (default: all)")
parser.add_argument("--repeat", type=int, default=1, help="queue each card N times with different seeds")
parser.add_argument("--seed", type=int, default=None, help="use this seed for every card (default: random per card)")
parser.add_argument("--aspect", default=None, help="resolution node aspect ratio (default: 9:16 for faces/jesters/decrees/masks, the workflow's 1:1 otherwise)")
parser.add_argument("--prefix", default="joker_cards", help="ComfyUI output subfolder")
args = parser.parse_args()

PROMPT_NODE = "6"
PROMPT_FIELD = "text"
SEED_NODES = ("52", "60")  # ClownsharKSampler, SeedVarianceEnhancer
SAVE_NODE = "9"
RESOLUTION_NODE = "41"  # FluxResolutionNode: aspect ratio at the set megapixels
# Court portraits fill a tall window on the card (about 0.58 wide to 1 high).
FACE_ASPECT = "9:16 (Slim Vertical)"
# Jesters, masks and decrees are all rendered tall at the same 9:16 (jesters are full-bleed card
# art; masks and decrees fit a flexible art window above the name, but a tall source still reads
# better there than a square one gets stretched into); bosses stay square.
TALL_ASPECT = "9:16 (Slim Vertical)"

# A kind can have its own style text (style_<kind>.txt, placed after the prompt); faces need one without
# the "empty space around it" wording, which shrinks a portrait in a tall frame.
style_file = HERE / f"style_{args.kind}.txt"
STYLE = (style_file if style_file.exists() else HERE / "style.txt").read_text(encoding="utf-8").strip()

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
    # A kind's own style file closes the prompt (subject first, as Z-Image Turbo prefers); the shared
    # style.txt opens it.
    workflow[PROMPT_NODE]["inputs"][PROMPT_FIELD] = (
        f"{prompt} {STYLE}" if style_file.exists() else f"{STYLE}, {prompt}"
    )
    aspect = args.aspect or (FACE_ASPECT if args.kind == "faces" else TALL_ASPECT if args.kind in ("jesters", "decrees", "masks") else None)
    if aspect:
        workflow[RESOLUTION_NODE]["inputs"]["aspect_ratio"] = aspect
    seed = args.seed if args.seed is not None else random.randrange(0, 2**48)
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
