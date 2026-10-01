# Mask art: generation prompts

Optional art for the nine mask cards (`TRICK_POOL` in game.js, one per hand
type). Same pipeline as the jesters (see [../jesters/PROMPTS.md](../jesters/PROMPTS.md))
and the tarots (see [../tarot/PROMPTS.md](../tarot/PROMPTS.md)).

## Convention

- One square image per mask, saved as `assets/masks/<id>.png`, where `<id>`
  matches the `id` field in `TRICK_POOL` (`mask_` + the lowercased character
  name, spaces as underscores).
- Source at **512×512**, export to **~150×150 PNG** (or WebP). Masks render at
  about 72px on the card, so keep the mask large, bold and simple, with one
  readable silhouette.
- No placeholder file is needed: until `<id>.png` loads, the card shows its 🎭
  glyph, and a missing file just leaves the glyph in place (the `<img>`
  removes itself on error). Add art one mask at a time, in any order.

## Style

Same shared style as the jesters
([tools/imagegen/style.txt](../../tools/imagegen/style.txt)). Each prompt
already says the mask hangs by its ribbon, so nothing extra is needed.

## Per-mask prompts

Higher hands get more elaborate masks, so the art itself shows the level of
the card.

[prompts.csv](prompts.csv) holds one subject prompt per mask (columns
`id,prompt`), keyed by the `id` in `TRICK_POOL`. Character and hand names live
in game.js (`HAND_TYPES`); `test/art-prompts.test.js` keeps the two in step.
Queue the sheet into ComfyUI with `python3 tools/imagegen/queue_cards.py masks`.
