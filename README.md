# Jester

A very small, single-page poker-scoring roguelike: play poker hands for
chips × mult, clear an escalating chip target each round, and spend money on
a handful of simple jesters between rounds.

No build step, no dependencies — just `index.html`, `styles.css`, and
`game.js`. Open `index.html` directly, or serve the folder with anything
static (it's also set up for GitHub Pages).

## What's in scope

- Standard 52-card deck, 8-card hand, select up to 5 cards to play or discard.
- Poker hand detection (high card through straight flush) with its own
  base chip/mult values.
- 4 hands and 3 discards per round; reach the round's chip target before
  hands run out.
- 59 jesters across three rarities (flat chip/mult bonuses, conditional
  bonuses, several multiplicative and scaling ones, a few that read or
  build on the rest of the owned roster — copy another jester's ability,
  scale off jesters sold or their resale value — plus a handful that
  change round setup — extra hand size/discards, shop debt, a free reroll,
  round-end payouts and sell-value growth, or a discard/evaluation hook) bought from a 3-item
  shop after each round win; sell owned jesters or reroll the shop's offers
  (for an escalating cost) between rounds. Saved money earns interest ($1
  per $5 held, capped at $5) on every round win.
- Ante escalates every 3 rounds; target chips scale with ante and round.
  The last round of each ante is a boss round: one of six modifiers (higher
  target, 1 hand only, no discards, a smaller hand, or a debuffed suit)
  applies for that round. Clearing round 3 of ante 8 wins the run; running
  out of hands first ends it.
- In-game hand-ranking reference (collapsible panel below the controls).
- Sort the hand by rank or suit, and a Deck button that opens a grid of all
  52 cards showing which are still in the draw pile, in hand, played, or
  discarded this round.
- Jester card art is optional per jester; any jester without its own image
  shows `assets/jesters/missing_no.png` instead.

## What's intentionally left out

Animations/juice, a Balatro-sized jester roster, tarot/planet/spectral cards,
vouchers, decks, and stakes. This is the "real basic" version — small and
deliberately scoped, not a sprawling feature set. (Card art is a partial
exception: a lightweight, optional `<img>` hook and generated art for most
jesters landed early since it's additive and non-breaking — see
`assets/jesters/PROMPTS.md`.)

## Development

Dev tooling only — the game itself still has no build step and no runtime
dependencies.

Tests run on Node's built-in test runner, no install required:

```
node --test
```

Three layers, each testing what the one below it can't reach:
- `test/scoring.test.js` — pure scoring-math regression tests (hand
  detection, jester effects, target scaling).
- `test/game-flow.test.js` — game-flow/integration tests (play, discard,
  shop, round/ante transitions, win/game-over) driven directly against the
  state machine, no DOM.
- `test/render.test.js` — UI/wiring tests: real button clicks and keyboard
  events against a real DOM (via `jsdom`, attached to Node's own global so
  it's coverage-tracked, not `window.eval`'d in a separate context), for
  the rendering and event-wiring code the other two layers can't exercise.

Branch coverage is gated at 90% (`npm run test:coverage`, needs a one-time
`npm install` for `jsdom`):

```
npm install
npm run test:coverage
```

Linting also needs that same `npm install` (ESLint is a dev dependency only):

```
npm run lint
```
