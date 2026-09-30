# Deferred Balatro jesters

51 of the 105 "available from start" Balatro jesters (source, under
Balatro's own name for them:
[balatrogame.fandom.com/wiki/Jokers](https://balatrogame.fandom.com/wiki/Jokers),
pulled 2026-09-29) aren't in `JESTER_POOL` yet — see [PROMPTS.md](PROMPTS.md)
for the 54 that are. Each of these needs something the engine doesn't
track today. Grouped by what's missing, so a future phase can knock out a
whole group at once rather than one jester at a time.

## Needs a blind-select hook

No "blind selected, before the round deals" hook exists yet.

Ceremonial Dagger ($6, Uncommon) · Marble Jester ($6, Uncommon) ·
Burglar ($6, Uncommon) · Madness ($7, Uncommon) · Riff-Raff ($6, Common)

## Needs a discard-event hook

No hook fires on discard specifically (only on play); several of these
also need the discarded rank/suit, which isn't tracked per-discard.

Trading Card ($6, Uncommon) ·
Mail-In Rebate ($4, Common, rank rotates each round) ·
Castle ($6, Uncommon, suit rotates each round)

## Needs a persistent per-jester counter (grows across hands/rounds)

These "Currently +N" jesters permanently accumulate a bonus over the run —
needs a mutable field on the owned-jester instance, not just a pure
`apply(ctx)` function.

Loyalty Card ($5) · Supernova ($5) · Ride the Bus ($6) · Runner ($5) ·
Ice Cream ($5) · Green Jester ($4) · Square Jester ($4) · Flash Card ($5) ·
Spare Trousers ($6) · Ramen ($6) · Popcorn ($5) · Obelisk ($8) ·
Card Sharp ($6, needs "hand types played this round" too) ·
Red Card ($5, needs Booster Packs) · Hologram ($7, needs deck-add events) ·
Vampire ($7, needs card Enhancements) · Lucky Cat ($6, needs Lucky cards) ·
Constellation ($6, needs Planet cards) · Seltzer ($6, needs a retrigger
system) · Ancient Jester ($8, suit rotates each round) ·
Campfire ($9, needs a sell-event hook)

## Needs consumables that don't exist (Tarot / Spectral / Planet cards)

This game has no consumable-card system at all yet (Phase 3 per
ROADMAP.md).

8 Ball ($5) · Superposition ($4) · Sixth Sense ($6) · Séance ($6) ·
Vagabond ($8) · Hallucination ($4) · Fortune Teller ($6) ·
Constellation ($6, listed above too) · Space Jester ($5, "upgrade hand
level" is a Planet-card concept)

## Needs card enhancements that don't exist (Stone / Steel / Gold / Lucky)

No per-card enhancement system exists — cards are just `{suit, rank}`.

Marble Jester ($6, listed above too) · Steel Jester ($7) ·
Stone Jester ($6) · Midas Mask ($7) · Hiker ($5, permanent per-card chip
buff also needs mutable card state)

## Needs a passive rule change to hand evaluation itself

These change what counts as a valid straight/flush/face card game-wide,
which means `evaluateHand` would need to know which jesters are owned —
a bigger architectural change than a scoring bonus.

Shortcut ($7) · Splash ($3, note: under this game's simplified scoring,
every selected card already counts toward chips regardless of hand type,
so this one is arguably a no-op here rather than a true port)

## Needs an economy mechanic that doesn't exist

Luchador ($5, Boss Blinds don't exist) · Diet Cola ($6, Tags don't exist) ·
Turtle Bean ($6, mutable hand size) · DNA ($8, permanent deck mutation
mid-round)

## Needs `state.deck` to mean "full deck" not "draw pile"

`state.deck` is currently the shrinking draw pile for the round, reset
fresh each round to all 52 cards. "Full deck" jesters (Erosion, Steel
Jester, Stone Jester, Cloud 9 above) need a concept of deck composition
that's independent of what's been drawn — meaningful once Phase 3 adds
anything that permanently changes deck composition (card removal,
vouchers, added cards). Until then they'd all read as constant/inert, so
they're grouped with their other blockers above rather than ported early.

---

When any of the above hooks/systems land, pull the matching jesters from
this file into `JESTER_POOL` (game.js) and their prompts into
[PROMPTS.md](PROMPTS.md).
