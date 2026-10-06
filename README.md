# Jester

A very small, single-page poker-scoring roguelike: play poker hands for
chips × mult, clear an escalating chip target each act, and spend money on
a handful of simple jesters between acts.

## Theme

A dark baroque masquerade court: you are the fool, and your head is the ante.
The venues climb from the Scullery to the Throne Room, and each act is an
audience (Small, Grand, Royal Command), and poker hands keep their plain
poker names. The mask cards are the Masquerade
Ball, tarot-style cards are Decrees, and a portrait of the King reacts to how
the act is going. Playing cards are drawn as aged ivory stock with serif
indices and split court-card panels.

No build step, no dependencies — just `index.html`, `styles.css`, and the
plain scripts in `src/`. Open `index.html` directly, or serve the folder with anything
static (it's also set up for GitHub Pages).

## What's in scope

- Standard 52-card deck, 8-card hand, select up to 5 cards to play or discard.
- Poker hand detection (high card through straight flush) with its own
  base chip/mult values.
- 4 hands and 3 discards per act; reach the act's chip target before
  hands run out.
- 61 jesters across three rarities (flat chip/mult bonuses, conditional
  bonuses, several multiplicative and scaling ones, a few that read or
  build on the rest of the owned roster — copy another jester's ability,
  scale off jesters sold or their resale value — plus a handful that
  change act setup — extra hand size/discards, shop debt, a free reroll,
  act-end payouts and sell-value growth, or a discard/evaluation hook) bought from a 3-item
  shop after each act win; sell owned jesters (any time, from the tap-to-inspect tooltip) or reroll the shop's offers
  (for an escalating cost) between acts. Saved money earns interest ($1
  per $5 held, capped at $5) on every act win.
- Mask cards: each poker hand has a level, and a mask card (one per hand, a
  commedia stock character, e.g. Innamorati for Pair) raises it, adding chips
  and mult to that hand's base. The shop sells two masks plus a Mask Pack (pick 1 of 3, used
  immediately); you can hold 2 and use or sell them. The Hand Rankings panel
  shows current levels. Belle of the Ball and Court Astrologer build on them.
- Decree cards (court edicts): ten deck-editing cards that share the mask slots. Used mid-act
  on 1-3 selected cards, they permanently change the run's deck: enhancements
  (Bonus +30 chips, Mult +4 mult, Wild counts as every suit, Glass X2 mult with
  a 25% chance to shatter after being played), set a suit, raise a rank, or
  destroy cards. The shop sells two decrees plus a Decree Pack (pick 1 of 3, kept
  in a slot); enhanced cards show a badge in hand and tint in the Deck view.
- Props: one permanent upgrade ($8) is offered in the shop after the first
  act of each venue and can be bought once per run — +1 hand, +1 discard,
  +1 hand size, cheaper rerolls, +1 jester slot, or +1 mask slot.
- Venue escalates every 3 acts; target chips scale with venue and act.
  The last act of each venue is a boss act: one of ten courtier modifiers
  (the Seneschal's higher target, the Executioner's single hand, the Censor's
  no discards, the Gaoler's smaller hand, the Marshal's and Queen of Hearts'
  debuffed suits, the Tax Collector's $1 per hand, the Poet Laureate's no
  repeated hand type, the Bishop's chipless face cards, or the Spymaster's
  silenced leftmost jester) applies for that act; venue 8's boss is always
  the King. Clearing act 3 of venue 8 wins the run; running out of hands
  first ends it.
- Animated scoring: the hand name and live chips × mult counters sit in the
  sidebar; each played card, then each jester left to right, pops with a floating
  number and a rising-pitch tick; the counters glow as the hand nears what the act
  needs, merge into a total, and roll into the score (the King reacts as it climbs).
  The result is already in the state when the sequence starts; click or press a key
  to speed it up. Skipped under `prefers-reduced-motion`.
- In-game hand-ranking reference (collapsible panel below the controls).
- Sort the hand by rank or suit, or drag cards into your own order (the
  sort buttons go inactive until you click one again). Selected cards score
  left to right, and the cards in between slide aside as you drag. Cards parked
  in the play area reorder the same way, and a card dropped there lands where you
  release it; the played cards score in the order they sit.
- Jesters reorder the same way (drag them), and order
  matters: they score left to right, so an Understudy copies whatever is on its
  right. You can own 5 jesters (more with the Stilts prop).
- Tap or click a jester, mask, or decree to inspect it. Sound effects (recorded
  card clips plus synthesized stings) with a mute button that remembers its
  setting. Layout is landscape-first: a wide desktop layout with a fanned
  hand, a compact landscape phone layout, and a rotate prompt in portrait.
- Run persistence: the run is saved to localStorage as you play and resumes on reload,
  in the shop (with its offers) or mid-act (deck order, hand, score, hands and discards
  left). The card selection and any scoring animation in progress aren't saved. A finished
  run (win or loss) clears the save, and the shop has a New Run button (two clicks to
  confirm) to abandon one. `?debug` runs save to their own slot, separate from normal play.
- Add `?debug` to the URL for a debug shop, a Win button that instantly clears the current act into the real shop, and a starting hand of jesters.
- A Deck button that opens a grid of all
  52 cards showing which are still in the draw pile, in hand, played, or
  discarded this act.
- Jester card art is optional per jester; any jester without its own image
  shows `assets/jesters/missing_no.png` instead.

## What's intentionally left out

Mid-act saves, a much larger jester roster, spectral-style cards, decks,
and stakes. This is the "real basic" version — small and
deliberately scoped, not a sprawling feature set. (Card art is a partial
exception: a lightweight, optional `<img>` hook and generated art for the
jesters landed early since it's additive and non-breaking — see
`assets/jesters/PROMPTS.md`; mask, decree, boss and King portrait prompts live in
`assets/masks/`, `assets/decrees/`, `assets/bosses/` and `assets/court/`;
`tools/imagegen/queue_cards.py` queues them into ComfyUI and
`tools/imagegen/export_cards.py` copies finished renders into place at 150px.)

## Development

Dev tooling only — the game itself still has no build step and no runtime
dependencies.

The game is a set of classic `<script>` files in `src/`, loaded in the order
`index.html` lists them and sharing one global scope (no modules, so opening
`index.html` from disk keeps working):

- `data.js`, `jesters.js`, `court.js` — constants, mask/decree/prop pools, the
  jester roster, boss modifiers, venues.
- `state.js`, `scoring.js` — the run's `state`, deck and act setup; hand
  detection and scoring.
- `actions.js`, `score-sequence.js`, `shop.js`, `consumables.js`, `run.js` —
  what the player can do: select/play/discard, the scoring animation,
  shopping, using masks and decrees, new runs and saving.
- `drag.js`, `cards-view.js`, `render.js`, `overlay.js` — drag-to-reorder and
  everything drawn on screen.
- `main.js` — wires up the page, plus the Node-only test hooks.
- `sounds.js`, `backdrop.js` — audio and the candlelit canvas backdrop.

Because the scripts share globals, ESLint is given each file's neighbours'
top-level names (read from `index.html`, see `eslint.config.js`), and
`test/globals.test.js` flags top-level names nothing uses. Tests load the
scripts through `tools/load-game.js`.

Tests run on Node's built-in test runner, no install required:

```
node --test
```

Three layers, each testing what the one below it can't reach:
- `test/scoring.test.js` — pure scoring-math regression tests (hand
  detection, jester effects, target scaling).
- `test/game-flow.test.js` — game-flow/integration tests (play, discard,
  shop, act/venue transitions, win/game-over) driven directly against the
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
