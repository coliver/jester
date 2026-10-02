# Boss art — generation prompts

Optional portraits for the boss courtiers (`BOSS_POOL` in src/court.js: the random
`BOSS_MODIFIERS` plus `KING_BOSS`). Same pipeline as the jesters (see
[../jesters/PROMPTS.md](../jesters/PROMPTS.md)).

- One square image per boss, saved as `assets/bosses/<id>.png`, where `<id>`
  matches the boss `id` in src/court.js.
- Source at 512×512 or larger, export to **150×150 PNG**
  (`python3 tools/imagegen/export_cards.py bosses`). The boss banner shows it at 40px,
  so keep the subject bold.
- No placeholder is needed: the banner hides its image until the file loads.
- [prompts.csv](prompts.csv) holds the subject prompts (`id,prompt`);
  `test/art-prompts.test.js` keeps it in step with `BOSS_POOL`. Queue it with
  `python3 tools/imagegen/queue_cards.py bosses`.
