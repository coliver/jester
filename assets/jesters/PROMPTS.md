# Jester art — generation prompts

Art is deferred to Phase 4 per [ROADMAP.md](../../ROADMAP.md), but the
asset pipeline (this file + the `<img>` hooks in game.js) is in place now
so art can be dropped in incrementally without further code changes.

## Convention

- One square image per jester, saved as `assets/jesters/<id>.png` — the
  `<id>` matches the `id` field in `JESTER_POOL` (game.js).
- Recommended source size **512×512**, exported/compressed down to
  **~150×150 PNG** (or WebP) for the actual asset — these render at
  roughly 80–100px in the UI, no need to ship large files.
- Transparent background *not* required — the card panel background
  (`--panel: #2a1a38`) shows around the art, so a filled dark-purple or
  near-black background blends in fine and avoids matting/edge-halo
  issues from generators.
- Missing files are safe: `game.js` fails the `<img>` over silently and
  the jester renders exactly as it does today (name + description only).
  Add art one jester at a time, in any order.

## Shared style block

Prepend this to every per-jester prompt below (or set as a persistent
style reference if your tool supports one):

> Painted carnival/tarot illustration style, thick confident gouache
> brushwork with visible texture, moody midnight-purple background
> (#1b1023), warm gold linework accents (#ffcf56), occasional glowing
> cyan highlights (#6be3ff) for magical effects only. Single centered
> subject, square 1:1 composition, dramatic single-source lighting, no
> text, no numbers, no playing-card pips, no border/frame (the UI adds
> its own).

## Per-jester prompts

### Ported from Balatro (mechanically simple "available from start" Jokers — see DEFERRED.md for the rest)

| id | name | rarity | subject prompt |
|---|---|---|---|
| `base_jester` | Jester | Common | A classic grinning jester in cap and bells, simple and iconic, holding nothing, direct eye contact |
| `greedy_jester` | Greedy Jester | Common | A miserly jester figure hoarding a glittering pile of orange diamond-cut gems, greedy hunched posture |
| `lusty_jester` | Lusty Jester | Common | A flamboyant jester performer blowing a kiss, surrounded by floating red heart shapes |
| `wrathful_jester` | Wrathful Jester | Common | A furious armored jester warrior mid-battle-cry, black spade-shaped banner behind them |
| `gluttonous_jester` | Gluttonous Jester | Common | An overindulgent jester feaster at a banquet table, green clover/club motifs on their goblet and plate |
| `jolly_jester` | Jolly Jester | Common | A belly-laughing rotund jester, hands on stomach, pure joy |
| `zany_jester` | Zany Jester | Common | A wild-eyed jester juggler mid-trick with three objects airborne, chaotic energy |
| `mad_jester` | Mad Jester | Common | A wide-eyed, unhinged jester mid-cackle, slightly manic expression |
| `crazy_jester` | Crazy Jester | Common | A jester tightrope walker mid-stride on a perfectly straight taut rope high above a carnival |
| `droll_jester` | Droll Jester | Common | A jester deadpan comedian mid one-liner, single raised eyebrow, dry wit |
| `sly_jester` | Sly Jester | Common | A sly jester card sharp peeking from behind a fan of two matching cards, sideways grin |
| `wily_jester` | Wily Jester | Common | A cunning jester fox-masked performer holding three identical cards, clever smirk |
| `clever_jester` | Clever Jester | Common | A bespectacled jester strategist studying two paired sets of cards laid before them |
| `devious_jester` | Devious Jester | Common | A shadowy jester figure sliding a straight run of cards across a table, sly glance up |
| `crafty_jester` | Crafty Jester | Common | An artisan jester card-maker fanning five matching-suited cards like a hand-crafted quilt |
| `half_jester` | Half Jester | Common | A jester literally split in two by a curtain, only half visible, minimalist |
| `jester_stencil` | Jester Stencil | Uncommon | A jester rendered as a hollow chalk outline/stencil, empty silhouettes echoing beside it |
| `banner` | Banner | Common | A herald holding an unfurled banner, discard tokens sewn into the fabric like medals |
| `mystic_summit` | Mystic Summit | Common | A robed mystic standing triumphant at a mountain peak, arms raised, aura of finality |
| `misprint` | Misprint | Common | A glitched, ink-smeared jester portrait, numbers and symbols scattered and jumbled across the canvas |
| `raised_fist` | Raised Fist | Common | A determined figure with one fist raised high, rank-numbered ring glowing on the hand |
| `fibonacci` | Fibonacci | Uncommon | A scholarly jester surrounded by a glowing spiral of numbers and card pips |
| `scary_face` | Scary Face | Common | A carved jack-o'-lantern-style jester mask, menacing grin, lantern glow from within |
| `abstract_jester` | Abstract Jester | Common | A cubist, fragmented jester made of overlapping geometric shapes in gold and purple |
| `even_steven` | Even Steven | Common | A meticulous, symmetrical jester balancing perfectly paired objects on a scale |
| `odd_todd` | Odd Todd | Common | A quirky, asymmetrical jester with mismatched juggling pins, off-kilter grin |
| `scholar` | Scholar | Common | A studious jester in academic robes holding a glowing ace card like a diploma |
| `business_card` | Business Card | Common | A sharply dressed carnival dealmaker handing out gilded calling cards, coins mid-flip |
| `blackboard` | Blackboard | Uncommon | A chalkboard covered in black spade and club symbols, jester chalk-drawn at the corner |
| `blue_jester` | Blue Jester | Common | A serene performer wrapped in deep blue card-backed robes, deck fanned like a cape |
| `baron` | Baron | Rare | A regal noble in purple and gold, crown tilted, four kings' portraits faintly visible in the background |
| `photograph` | Photograph | Common | A vintage carnival photographer under a flash-powder burst, capturing a face-card portrait |
| `reserved_parking` | Reserved Parking | Common | A carnival valet gesturing to a roped-off VIP spot lined with face cards |
| `baseball_card` | Baseball Card | Rare | A jester posed like a vintage trading-card athlete, mid-swing, glowing stat lines around them |
| `bull` | Bull | Uncommon | A snorting bull performer draped in coin-covered regalia, ready to charge |
| `walkie_talkie` | Walkie Talkie | Common | A carnival radio operator speaking into an old two-way radio, "10-4" energy, headset glow |
| `smiley_face` | Smiley Face | Common | A jester wearing an oversized painted smiley mask, exaggerated cheerful grin |

## Rarity color key (already wired into styles.css)

Common = `#4db8ff`, Uncommon = `#35d68a`, Rare = `#ff5d6c` — matches
Balatro's own rarity colors loosely, adapted to this game's palette.
Art doesn't need to encode rarity itself (the UI badge already shows it),
but leaning into slightly richer detail/lighting for Rare pieces is a
nice touch if you want one.

## Adding new jesters later

When Phase 2/3 adds jesters (including the ones in
[DEFERRED.md](DEFERRED.md)), append a row here with the same shared style
block and drop the resulting file at `assets/jesters/<id>.png` — no other
code changes needed.
