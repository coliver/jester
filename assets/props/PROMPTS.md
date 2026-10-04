# Prop art — generation prompts

Optional art for the six props (`PROP_POOL` in src/data.js). Same pipeline as
the jesters (see [../jesters/PROMPTS.md](../jesters/PROMPTS.md)).

## Convention

- One square image per prop, saved as `assets/props/<id>.png`, where `<id>`
  matches the `id` field in `PROP_POOL` — note two ids predate the current
  display names: `wide_stage` is **Stilts** and `trick_tray` is **Mask Rack**.
- Source at **512×512**, export to **~150×150 PNG** (or WebP).
- No placeholder file is needed: until `<id>.png` loads, the card shows its
  oversized initial letter, and a missing file just leaves the letter in
  place (the `<img>` removes itself on error). Add art one prop at a time, in
  any order.

## Style

Same shared style as the jesters
([tools/imagegen/style.txt](../../tools/imagegen/style.txt)).

## Per-prop prompts

Each prompt depicts the specific object or scene the prop's effect implies
(a spare hand for the extra hand, stilts for the extra jester slot, and so
on) rather than a generic stage-prop still life.

[prompts.csv](prompts.csv) holds one subject prompt per prop (columns
`id,prompt`), keyed by the `id` in `PROP_POOL`. Names and effects live in
src/data.js; `test/art-prompts.test.js` keeps the two in step. Queue the sheet
into ComfyUI with `python3 tools/imagegen/queue_cards.py props`.

## Adding new props later

Add the prop to `PROP_POOL` (src/data.js), append an `id,prompt` row to
[prompts.csv](prompts.csv), and drop the resulting file at
`assets/props/<id>.png`.
