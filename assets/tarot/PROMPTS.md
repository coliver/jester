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

## Style block

Use the shared style block from the jester prompts, with one change: these are
tarot cards, so lean harder into the tarot half of "carnival/tarot".

> Painted carnival/tarot illustration style, thick confident gouache
> brushwork with visible texture, moody midnight-purple background
> (#1b1023), warm gold linework accents (#ffcf56), occasional glowing
> cyan highlights (#6be3ff) for magical effects only. Single centered
> subject, square 1:1 composition, dramatic single-source lighting, no
> text, no numbers, no playing-card pips, no border/frame (the UI adds
> its own).

## Per-tarot prompts

| id | name | effect | subject prompt |
|---|---|---|---|
| `tarot_hierophant` | The Hierophant | Bonus Card | A robed circus high priest on a throne of stacked drums, holding up a gold-tipped staff, two kneeling acrobats at his feet, coins glinting in the folds of his robe |
| `tarot_empress` | The Empress | Mult Card | A regal bearded-lady empress in a crown of flaming candles, seated on a cushioned elephant howdah, one hand lifting a glowing scepter |
| `tarot_lovers` | The Lovers | Wild Card | Two trapeze artists reaching for each other mid-swing under the big top, their silk costumes shifting through every color of the rainbow |
| `tarot_justice` | Justice | Glass Card | A masked judge in a ringmaster's coat holding a delicate glass sword upright and a pair of scales, one pan holding a cracked glass orb |
| `tarot_star` | The Star | ♦ | A kneeling fortune teller pouring glowing cyan water from two jugs beneath a sky of golden diamond-shaped stars |
| `tarot_moon` | The Moon | ♣ | A great crescent moon with a sleepy painted face looming over the tent tops, a lone clown howling below, clover-shaped shadows on the grass |
| `tarot_sun` | The Sun | ♥ | A beaming carnival sun with a ruffled clown collar rising over the fairground, a child jester on a hobby horse below, red hearts drifting up like balloons |
| `tarot_world` | The World | ♠ | A dancer encircled by a laurel wreath, spinning inside a giant globe-shaped cage on a circus stage, four small figures in the corners, spade-shaped leaves in the wreath |
| `tarot_strength` | Strength | +1 rank | A calm strongwoman in a leopard-print leotard gently closing the jaws of a lion with her bare hands, an infinity-shaped ribbon floating above her head |
| `tarot_hanged_man` | The Hanged Man | Destroy | A tightrope walker hanging upside down by one ankle from a high wire, serene and smiling, a halo of faint gold light around his head, cards falling away below |

## Adding new tarots later

Append a row with the new tarot's `id` from `TAROT_POOL` and drop the file at
`assets/tarot/<id>.png`. No code changes needed.
