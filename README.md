# Jester

A very small, single-page poker-scoring roguelike: play poker hands for
chips × mult, clear an escalating chip target each round, and spend money on
a handful of simple jokers between rounds.

No build step, no dependencies — just `index.html`, `styles.css`, and
`game.js`. Open `index.html` directly, or serve the folder with anything
static (it's also set up for GitHub Pages).

## What's in scope

- Standard 52-card deck, 8-card hand, select up to 5 cards to play or discard.
- Poker hand detection (high card through straight flush) with its own
  base chip/mult values.
- 4 hands and 3 discards per round; reach the round's chip target before
  hands run out.
- 8 simple jokers (flat chip/mult bonuses, conditional bonuses, one
  multiplicative one) bought from a 3-item shop after each round win.
- Ante escalates every 3 rounds; target chips scale with ante and round.

## What's intentionally left out

Card art, animations/juice, a large joker roster, tarot/planet/spectral
cards, vouchers, decks, and stakes. This is the "real basic" version — small
and deliberately scoped, not a sprawling feature set.
