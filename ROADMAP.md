# Roadmap

Jester is a small, single-page poker-scoring roguelike (deck → hand →
score chips × mult → clear a target → shop for jesters → escalate). The
current build (see [README](README.md)) is well past the initial scaffold:
the loop is hardened and tested, and Phases 1-3 are largely landed, with
parts of Phases 4 and 5 (art, sound, mobile layout) already in. This
document keeps the original phase plan and marks what has shipped.

Guiding constraint carried through every phase: **no build step, no
dependencies**, plain `index.html` / `styles.css` / the scripts in `src/`. Anything that
would require a bundler or framework is out of scope unless a phase says
otherwise explicitly.

## 10,000-foot view

**Phase 0 — Current state (done)**
Deck, hand, poker evaluation, 4 hands / 3 discards, 8 jesters, 3-item shop,
venue/round escalation. Playable start-to-finish, no persistence, no tests,
a few known rules gaps (see Phase 1). The roster is now 61 jesters.

**Phase 1 — Harden the core loop**
Make the existing scope *correct and complete* before adding anything new:
fix scoring/rules bugs, give the run a real ending, add minimal regression
tests for the scoring math, small UX gaps (sell a jester, see hand
rankings). No new content, no visuals work.

**Phase 2 — Strategic depth (in progress)**
Grow the decision space within the existing systems: more jesters with
real synergies/anti-synergies ✓ (Mimic and Understudy copy another owned jester;
King's Ransom, Pyre and Master of Revels scale off the rest of the roster —
sell value held, jesters sold, rarity variety — see below), an economy layer (interest on saved money
✓, reroll cost ✓, jester resale value ✓), boss-round-style modifiers that
force different play ✓ (ten courtier modifiers — higher target, 1-hand-only,
no-discard, smaller hand, two suit debuffs, $1 per hand, no repeated hand type,
chipless face cards, and a silenced leftmost jester — one picked at random for
round 3 of every venue, with venue 8's boss always the King). The round-end hook group (Nest Egg, Royal Taster, Ninepins, Trebuchet, Patron — the
last two grow per-jester sell value/payout) has landed too. Jester order now matters and is
player-controlled (drag to reorder; Understudy copies its right-hand
neighbor), and hand cards can be dragged into a custom order. Remaining: more of this synergy/anti-synergy work
if it keeps paying off — the five landed so far are a first pass, not a
ceiling. This is where the game gets *replayable* rather than just
*playable*.

**Phase 3 — Content breadth**
Add the systems the README explicitly deferred: simplified
decree/mask-style consumable cards (landed: mask cards and Mask Packs as the hand-levelling side; ten deck-editing decrees and Decree Packs; mask cards are reskinned as commedia masks), props (landed: six, one offered per venue), alternate decks (not started), a
difficulty modifier (not started). Each is additive and toggleable in scope — pick
the smallest version of each that fits the no-build-step constraint.

**Phase 4 — Feel & presentation**
Card art (landed for jesters; mask and decree art in progress), scoring
animation/juice (deal animation, fanned hand, hover/drag feedback and the
step-by-step scoring animation landed), sound (landed: card clips, stings, mute
toggle). Explicitly deferred until the systems are stable, since presentation work
churns hard if the underlying model is still moving.

**Phase 5 — Meta & reach**
Run persistence (landed: resume via localStorage, in the shop or mid-round), run stats and seed display (landed: end-of-run summary, shareable `?seed=` links; a seed fixes decks, bosses and shops, not in-hand chance), anything GitHub Pages deployment needs.
The mobile layout pass has landed (landscape phone layout, rotate prompt in
portrait, touch drag). Lower priority than
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
(venue 8) with win/game-over summaries, sell jester, reroll shop,
hand-reference panel, the 1-4 card hand-size contract audit, and the
`test/scoring.test.js` regression suite (21 assertions covering hand
detection, jester stacking, and target scaling) are all in. All verified
end-to-end in a headless browser (card selection, play/discard, shop
buy/sell/reroll, win and game-over flows, no console errors) plus
`node test/scoring.test.js` passing.

### 1. Rules/correctness fixes

- **Ace-low straight.** `evaluateHand` in [src/scoring.js](src/scoring.js) treats Ace as
  rank 14 only, so A-2-3-4-5 doesn't score as a straight (or straight
  flush). Fix `rankNum`/`isStraight` to also check the wheel case.
- **Win condition.** The run currently escalates venue forever with no
  finish line — `phase` only ever becomes `"playing"`, `"shop"`, or
  `"gameover"` (on loss). Decide a final venue (e.g. 8) and add a `"win"` overlay state when it's cleared.
- **Audit `scoreSelection`/jester `apply` contracts** for edge cases: hand
  sizes other than 5 (currently high-card/pair/etc. detection assumes
  `cards.length === 5` for flush/straight but the function is called with
  1-5 selected cards) — confirm behavior for 1-4 card hands is intentional
  and documented, not accidental.

### 2. Missing core actions

- **Sell a jester** from the shop/jester row for partial refund. Games in
  this genre lean on this for economy tuning in Phase 2, so land the
  plumbing now.
- **Reroll shop** (even a simple fixed- or scaling-cost reroll) — currently
  the 3 offers are fixed per shop visit with no player agency.
- **Hand reference** — a small always-available legend (tooltip or panel)
  listing hand types and their base chip/mult, since `HAND_TYPES` in
  src/data.js is the only place this lives today.

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
  at a few venue/round values.
- Wire a one-line `npm test`-equivalent or documented `node test/…` command
  in the README's dev section (no `package.json` dependency needed unless
  it's just for the script name).

### 4. Polish carried by this phase

- Game-over/win overlays should show a short run summary (venue/round
  reached, jesters held) rather than just the current one-line message.
- Verify keyboard accessibility (already partially done) extends to the
  shop buttons and overlay buttons — confirm focus order/visibility on
  round transition.

### Explicitly not in Phase 1

New jesters, decree/mask cards, props, alternate decks, card art,
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
