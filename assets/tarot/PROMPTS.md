# Tarot art — generation prompts

Optional art for the ten tarot cards (`TAROT_POOL` in game.js). Same pipeline
as the jesters (see [../jesters/PROMPTS.md](../jesters/PROMPTS.md)).

## Convention

- One square image per tarot, saved as `assets/tarot/<id>.png`, where `<id>`
  matches the `id` field in `TAROT_POOL`.
- Source at **512×512**, export to **~150×150 PNG** (or WebP). Tarots render at
  about 72px on the card, so keep the subject bold and simple.
- No placeholder file is needed: until `<id>.png` loads, the card shows its ☾
  glyph, and a missing file just leaves the glyph in place (the `<img>`
  removes itself on error). Add art one tarot at a time, in any order.

## Style

Same shared style as the jesters
([tools/imagegen/style.txt](../../tools/imagegen/style.txt)).

## Per-tarot prompts

[prompts.csv](prompts.csv) holds one subject prompt per tarot (columns
`id,prompt`), keyed by the `id` in `TAROT_POOL`. Names and effects live in
game.js; `test/art-prompts.test.js` keeps the two in step. Queue the sheet into
ComfyUI with `python3 tools/imagegen/queue_cards.py tarot`.

## Adding new tarots later

Add the tarot to `TAROT_POOL`, append an `id,prompt` row to
[prompts.csv](prompts.csv), and drop the file at `assets/tarot/<id>.png`.
