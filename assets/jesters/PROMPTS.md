# Jester art — generation prompts

Art is deferred to Phase 4 per [ROADMAP.md](../../ROADMAP.md), but the
asset pipeline (this file + the `<img>` hooks in src/cards-view.js) is in place now
so art can be dropped in incrementally without further code changes.

## Convention

- One square image per jester, saved as `assets/jesters/<id>.png` — the
  `<id>` matches the `id` field in `JESTER_POOL` (src/jesters.js).
- Recommended source size **512×512**, exported/compressed down to
  **~150×150 PNG** (or WebP) for the actual asset — these render at
  roughly 80–100px in the UI, no need to ship large files.
- Transparent background *not* required — the card panel background
  (`--panel: #2a1a38`) shows around the art, so a filled dark-purple or
  near-black background blends in fine and avoids matting/edge-halo
  issues from generators.
- Missing files are safe: when `<id>.png` fails to load, the `<img>`'s
  `onerror` handler swaps in `assets/jesters/missing_no.png` (and clears
  itself, so it can't loop). Add art one jester at a time, in any order.
  `test/render.test.js` covers this fallback.

## Shared style

The style prefix put in front of every prompt is
[tools/imagegen/style.txt](../../tools/imagegen/style.txt), read by
`queue_cards.py`. Edit it there and every kind (jesters, decrees, masks) picks
it up. If you generate by hand, paste that text before the subject prompt.

## Per-jester prompts

[prompts.csv](prompts.csv) holds one subject prompt per jester (columns
`id,prompt`), keyed by the `id` in `JESTER_POOL`. It is the only copy: names,
rarities and effects live in src/jesters.js, and `test/art-prompts.test.js` fails if
a jester has no prompt or a prompt names a jester that is gone. Queue the whole
sheet into ComfyUI with `python3 tools/imagegen/queue_cards.py jesters`.

## Rarity color key (already wired into styles.css)

Common = `#4db8ff`, Uncommon = `#35d68a`, Rare = `#ff5d6c` — matches
Balatro's own rarity colors loosely, adapted to this game's palette.
Art doesn't need to encode rarity itself (the UI badge already shows it),
but leaning into slightly richer detail/lighting for Rare pieces is a
nice touch if you want one.

## Adding new jesters later

Add the jester to `JESTER_POOL` (src/jesters.js), append an `id,prompt` row to
[prompts.csv](prompts.csv), and drop the resulting file at
`assets/jesters/<id>.png`. The test suite flags a missing row.
