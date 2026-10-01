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

## Style block

> Painted carnival/tarot illustration style, thick confident gouache
> brushwork with visible texture, moody midnight-purple background
> (#1b1023), warm gold linework accents (#ffcf56), occasional glowing
> cyan highlights (#6be3ff) for magical effects only. A single commedia
> dell'arte mask floating centered, hanging from a thin ribbon, square 1:1
> composition, dramatic single-source lighting, no text, no numbers, no
> playing-card pips, no border/frame (the UI adds its own).

## Per-mask prompts

Higher hands get more elaborate masks, so the art itself shows the level of
the card.

| id | mask | hand | subject prompt (appended to the style block) |
|---|---|---|---|
| `mask_pulcinella` | Pulcinella | High Card | A plain white-and-black half mask with a long hooked beak nose and a sad, lopsided grin, hanging alone, a single feather tucked in the ribbon |
| `mask_innamorati` | Innamorati | Pair | A pair of identical soft, rosy, unmasked-looking half masks facing each other, their ribbons tied together in a bow, small red hearts between them |
| `mask_zanni` | Zanni | Two Pair | Two long-nosed leather servant masks side by side, one scheming and one wide-eyed, each with a matching twin ribbon, a wink of gold on both brows |
| `mask_brighella` | Brighella | Three of a Kind | An olive-green sly half mask with arched black eyebrows and a thin moustache, three small charms dangling from the ribbon: a ladle, a coin and a lute pick |
| `mask_scaramouche` | Scaramouche | Straight | A swashbuckler's black domino mask with a rakish plume, trailing a ribbon that streaks sideways in a perfectly straight line as if mid-sprint |
| `mask_pierrot` | Pierrot | Flush | A pure white full-face mask with a single painted cyan tear and a tiny pointed black skullcap, the whole mask a single unbroken colour |
| `mask_pantalone` | Pantalone | Full House | A red-and-gold mask with a huge hooked nose and a pointed grey beard, a small house-shaped gold brooch pinned to the forehead, jingling coin purses on the ribbon |
| `mask_il_capitano` | Il Capitano | Four of a Kind | A haughty bronze mask with an enormous curling moustache and a feathered officer's hat, four medals pinned in a square on the cheek |
| `mask_harlequin` | Harlequin | Straight Flush | A gleaming black half mask with arched gold brows, framed by a diamond-checkered cape in all four suit colours, a glow of cyan sparks around it, the most ornate of the nine |
