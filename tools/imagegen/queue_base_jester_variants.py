"""One-off: queue N varied base_jester renders (not part of prompts.csv/JESTER_POOL).

Same workflow, style_jesters.txt suffix and 9:16 aspect as queue_cards.py, but with a
hardcoded list of subject prompts instead of a CSV row, so it doesn't touch the real
jesters pipeline or trip test/art-prompts.test.js. Saved under base_jester_variants/.
Pair with export_cards.py by hand (or just Read the renders directly) to pick a favorite.
"""
import copy
import json
import os
import random
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).parent
COMFY_URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8600")
WORKFLOW_FILE = HERE / "workflow_api.json"
STYLE = (HERE / "style_jesters.txt").read_text(encoding="utf-8").strip()

PROMPTS = [
    "A grinning adult female jester with wild curly red hair, winking while balancing a gold coin on one fingertip",
    "A sly adult female jester with a silver-grey updo, peeking out from behind a fan of three cards",
    "A jovial adult female jester in a deep green and bronze motley, mid-laugh with hands on her hips",
    "A graceful adult female jester with a long braided auburn ponytail, mid-twirl with ribbons trailing from her sleeves",
    "A mischievous adult female jester with a short black bob, tipping her belled cap to the viewer",
    "A dreamy adult female jester in violet and tarnished gold, resting her chin on one hand, lost in thought",
    "A bold adult female jester with a shaved-side undercut, cracking her knuckles before a trick",
    "A warm adult female jester with soft blonde curls, offering a single red rose to the viewer",
    "A sharp-eyed adult female jester in midnight blue and silver, mid-bow with a flourish of her cap",
    "A playful adult female jester with freckles and a messy braid, juggling three small bells",
    "A regal adult female jester in wine-red and brass, counting coins from a small velvet purse",
    "A spry adult female jester with cropped silver hair, mid-cartwheel, bells flying",
    "A coy adult female jester with a high ponytail, holding two carved masks up beside her face",
    "A tender adult female jester with soft grey eyes, cradling a small lute against her shoulder",
    "A sassy adult female jester in amber and copper, snapping her fingers with a wry smile",
    "A dramatic adult female jester with flowing dark hair, mid-curtsy, skirts caught mid-swirl",
    "A sleepy-eyed adult female jester with tousled chestnut hair, stretching both arms overhead with a yawn",
    "A watchful adult female jester in teal and gold, whispering behind a raised hand as if sharing a secret",
    "An impish adult female jester with twin braids, spinning a ribboned wand overhead",
    "A stately adult female jester with pinned-up grey-streaked hair, adjusting the bell on her cap with a smirk",
]

PROMPT_NODE = "6"
PROMPT_FIELD = "text"
SEED_NODES = ("52", "60")
SAVE_NODE = "9"
RESOLUTION_NODE = "41"
ASPECT = "9:16 (Slim Vertical)"
PREFIX = "base_jester_variants"

with open(WORKFLOW_FILE, "r", encoding="utf-8") as f:
    template = json.load(f)

for index, prompt in enumerate(PROMPTS, start=1):
    name = f"variant_{index:02d}"
    workflow = copy.deepcopy(template)
    workflow[PROMPT_NODE]["inputs"][PROMPT_FIELD] = f"{prompt} {STYLE}"
    workflow[RESOLUTION_NODE]["inputs"]["aspect_ratio"] = ASPECT
    seed = random.randrange(0, 2**48)
    for node in SEED_NODES:
        workflow[node]["inputs"]["seed"] = seed
    workflow[SAVE_NODE]["inputs"]["filename_prefix"] = f"{PREFIX}/{name}"

    payload = {"prompt": workflow, "client_id": str(uuid.uuid4())}
    request = Request(
        f"{COMFY_URL}/prompt",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request) as response:
        result = json.load(response)
    print(f"Queued {name} with seed {seed}: {result}")
