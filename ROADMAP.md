# Roadmap

Jester is a small, single-page poker-scoring roguelike (deck → hand →
score chips × mult → clear a target → shop for jesters → escalate). The
current build (see [README](README.md)) is a single-commit scaffold: the
whole loop works, but it hasn't been hardened, tested, or extended past its
initial shape. This document lays out where it goes from here.

Guiding constraint carried through every phase: **no build step, no
dependencies**, plain `index.html` / `styles.css` / `game.js`. Anything that
would require a bundler or framework is out of scope unless a phase says
otherwise explicitly.

## 10,000-foot view

**Phase 0 — Current state (done)**
Deck, hand, poker evaluation, 4 hands / 3 discards, 8 jesters, 3-item shop,
ante/round escalation. Playable start-to-finish, no persistence, no tests,
a few known rules gaps (see Phase 1).

**Phase 1 — Harden the core loop**
Make the existing scope *correct and complete* before adding anything new:
fix scoring/rules bugs, give the run a real ending, add minimal regression
tests for the scoring math, small UX gaps (sell a jester, see hand
rankings). No new content, no visuals work.

**Phase 2 — Strategic depth (in progress)**
Grow the decision space within the existing systems: more jesters with
real synergies/anti-synergies ✓ (Brainstorm and Blueprint copy another owned jester;
Swashbuckler, Campfire and Ringmaster scale off the rest of the roster —
sell value held, jesters sold, rarity variety — see below), an economy layer (interest on saved money
✓, reroll cost ✓, jester resale value ✓), boss-round-style modifiers that
force different play ✓ (six modifiers — higher target, 1-hand-only,
no-discard, smaller hand, and two suit debuffs — one picked at random for
round 3 of every ante). The round-end hook group (Egg, Gros Michel, Cloud 9, Rocket, Gift Card — the
last two grow per-jester sell value/payout) has landed too. Remaining: more of this synergy/anti-synergy work
if it keeps paying off — the five landed so far are a first pass, not a
ceiling. This is where the game gets *replayable* rather than just
*playable*.

**Phase 3 — Content breadth**
Add the systems the README explicitly deferred: a simplified
tarot/planet-style consumable card (landed: trick cards and Trick Packs), vouchers (landed: six, one offered per ante), alternate decks, a
stake/difficulty modifier. Each is additive and toggleable in scope — pick
the smallest version of each that fits the no-build-step constraint.

**Phase 4 — Feel & presentation**
Card art (or better procedural card faces), scoring animation/juice, sound.
Explicitly deferred until the systems are stable, since presentation work
churns hard if the underlying model is still moving.

**Phase 5 — Meta & reach**
Run persistence (resume via localStorage), run stats/seed display, mobile
layout pass, anything GitHub Pages deployment needs. Lower priority than
it sounds — the game is already playable end-to-end without it.

Phases are roughly sequential but not strictly gated — Phase 3 content can
start before Phase 2 is 100% done, for instance. The ordering reflects risk
(fix correctness before building on top of it) and churn (don't polish
visuals for a scoring model that's still changing).

---

## Phase 1 — Harden the core loop

**Goal:** the current feature set (per README "What's in scope") is
*correct*, has a real beginning/middle/end, and has enough of a safety net
that Phase 2 work doesn't silently regress the scoring math.

**Status (2026-09-29):** complete. Ace-low straight fix, win condition
(ante 8) with win/game-over summaries, sell jester, reroll shop,
hand-reference panel, the 1-4 card hand-size contract audit, and the
`test/scoring.test.js` regression suite (21 assertions covering hand
detection, jester stacking, and target scaling) are all in. All verified
end-to-end in a headless browser (card selection, play/discard, shop
buy/sell/reroll, win and game-over flows, no console errors) plus
`node test/scoring.test.js` passing.

### 1. Rules/correctness fixes

- **Ace-low straight.** `evaluateHand` in [game.js](game.js) treats Ace as
  rank 14 only, so A-2-3-4-5 doesn't score as a straight (or straight
  flush). Fix `rankNum`/`isStraight` to also check the wheel case.
- **Win condition.** The run currently escalates ante forever with no
  finish line — `phase` only ever becomes `"playing"`, `"shop"`, or
  `"gameover"` (on loss). Decide a final ante (e.g. 8, matching Balatro's
  convention loosely) and add a `"win"` overlay state when it's cleared.
- **Audit `scoreSelection`/jester `apply` contracts** for edge cases: hand
  sizes other than 5 (currently high-card/pair/etc. detection assumes
  `cards.length === 5` for flush/straight but the function is called with
  1-5 selected cards) — confirm behavior for 1-4 card hands is intentional
  and documented, not accidental.

### 2. Missing core actions

- **Sell a jester** from the shop/jester row for partial refund. Balatro-style
  games lean on this for economy tuning in Phase 2, so land the plumbing
  now.
- **Reroll shop** (even a simple fixed- or scaling-cost reroll) — currently
  the 3 offers are fixed per shop visit with no player agency.
- **Hand reference** — a small always-available legend (tooltip or panel)
  listing hand types and their base chip/mult, since `HAND_TYPES` in
  game.js is the only place this lives today.

### 3. Regression safety net

No test infrastructure exists yet. Add the smallest thing that catches
scoring regressions without violating the no-build-step rule for the game
itself:
- A standalone `test/scoring.test.js` (or similar) that imports the pure
  functions (`evaluateHand`, `scoreSelection`, `targetForRound`, the
  Ace-low fix) and runs plain `assert`-based checks under plain Node —
  dev-only tooling, doesn't touch `index.html`.
- Cover: each hand type detection (including the Ace-low straight fix),
  a couple of jester `apply` effects in combination, `targetForRound` scaling
  at a few ante/round values.
- Wire a one-line `npm test`-equivalent or documented `node test/…` command
  in the README's dev section (no `package.json` dependency needed unless
  it's just for the script name).

### 4. Polish carried by this phase

- Game-over/win overlays should show a short run summary (ante/round
  reached, jesters held) rather than just the current one-line message.
- Verify keyboard accessibility (already partially done) extends to the
  shop buttons and overlay buttons — confirm focus order/visibility on
  round transition.

### Explicitly not in Phase 1

New jesters, tarot/planet cards, vouchers, alternate decks, card art,
animation, sound, localStorage persistence — all later phases.

### Suggested order

1. Ace-low straight fix + tests around it (small, isolated, unblocks
   confidence for everything else).
2. Win condition + game-over/win overlay summary.
3. Sell jester, then reroll shop.
4. Hand reference panel.
5. Fill out the rest of the test file alongside whichever of the above
   touches scoring, so coverage lands incrementally rather than as one
   big test-writing pass at the end.
