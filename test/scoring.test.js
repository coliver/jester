// Regression tests for the scoring math. Runs under Node's built-in test
// runner, no dependencies: `node --test` (or `npm test`) from repo root.
"use strict";

// The game expects a global `Sound` object (normally provided by sounds.js
// in the browser); stub it so loading the game under Node doesn't blow up
// when actions call Sound.*().
global.Sound = new Proxy({}, { get: () => () => {} });

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateHand,
  scoreSelection,
  targetForRound,
  interestOn,
  JESTER_POOL,
  resolveCopyTarget,
  _setState,
} = require("../tools/load-game.js");

function card(rank, suit) {
  return { rank, suit, id: `${rank}${suit}` };
}

function jesterById(id) {
  const j = JESTER_POOL.find(j => j.id === id);
  assert.ok(j, `no such jester: ${id}`);
  return j;
}

// scoreSelection reads several state fields beyond `jesters` (hand, deck,
// discardsLeft, money) to feed jesters that key off held-hand cards, deck
// size, discards remaining, etc. Real gameplay always has a fully-shaped
// state; tests need to provide one explicitly. `hand` defaults to the
// selection itself (so "held in hand" jesters see nothing extra unless a
// test overrides it).
function baseState(overrides) {
  return Object.assign({
    jesters: [],
    hand: [],
    deck: [],
    discardsLeft: 0,
    money: 0,
    jestersSold: 0,
  }, overrides);
}

// --- evaluateHand: one case per hand type -----------------------------

test("high card", () => {
  const h = evaluateHand([card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")]);
  assert.equal(h.name, "High Card");
});

test("pair", () => {
  const h = evaluateHand([card("2", "♠"), card("2", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")]);
  assert.equal(h.name, "Pair");
});

test("two pair", () => {
  const h = evaluateHand([card("2", "♠"), card("2", "♥"), card("9", "♦"), card("9", "♣"), card("K", "♠")]);
  assert.equal(h.name, "Two Pair");
});

test("three of a kind", () => {
  const h = evaluateHand([card("2", "♠"), card("2", "♥"), card("2", "♦"), card("9", "♣"), card("K", "♠")]);
  assert.equal(h.name, "Three of a Kind");
});

test("straight (ace high)", () => {
  const h = evaluateHand([card("10", "♠"), card("J", "♥"), card("Q", "♦"), card("K", "♣"), card("A", "♠")]);
  assert.equal(h.name, "Straight");
  assert.equal(h.isStraight, true);
});

test("straight, ace-low wheel (A-2-3-4-5)", () => {
  const h = evaluateHand([card("A", "♠"), card("2", "♥"), card("3", "♦"), card("4", "♣"), card("5", "♠")]);
  assert.equal(h.name, "Straight");
  assert.equal(h.isStraight, true);
});

test("flush", () => {
  const h = evaluateHand([card("2", "♠"), card("5", "♠"), card("9", "♠"), card("J", "♠"), card("K", "♠")]);
  assert.equal(h.name, "Flush");
});

test("full house", () => {
  const h = evaluateHand([card("2", "♠"), card("2", "♥"), card("2", "♦"), card("9", "♣"), card("9", "♠")]);
  assert.equal(h.name, "Full House");
});

test("four of a kind", () => {
  const h = evaluateHand([card("2", "♠"), card("2", "♥"), card("2", "♦"), card("2", "♣"), card("9", "♠")]);
  assert.equal(h.name, "Four of a Kind");
});

test("straight flush, including ace-low wheel", () => {
  const h1 = evaluateHand([card("5", "♠"), card("6", "♠"), card("7", "♠"), card("8", "♠"), card("9", "♠")]);
  assert.equal(h1.name, "Straight Flush");

  const h2 = evaluateHand([card("A", "♠"), card("2", "♠"), card("3", "♠"), card("4", "♠"), card("5", "♠")]);
  assert.equal(h2.name, "Straight Flush");
});

test("near-straight is not a straight (gap)", () => {
  const h = evaluateHand([card("2", "♠"), card("3", "♥"), card("4", "♦"), card("5", "♣"), card("7", "♠")]);
  assert.equal(h.isStraight, false);
});

// --- hand-size contract: fewer than 5 cards -----------------------------

test("4 selected cards of one rank is still four of a kind", () => {
  const h = evaluateHand([card("2", "♠"), card("2", "♥"), card("2", "♦"), card("2", "♣")]);
  assert.equal(h.name, "Four of a Kind");
});

test("4 cards, no flush/straight even with matching suit/sequence", () => {
  const h = evaluateHand([card("5", "♠"), card("6", "♠"), card("7", "♠"), card("8", "♠")]);
  assert.equal(h.isFlush, false);
  assert.equal(h.isStraight, false);
  assert.equal(h.name, "High Card");
});

test("1 selected card is high card", () => {
  const h = evaluateHand([card("K", "♠")]);
  assert.equal(h.name, "High Card");
});

// --- scoreSelection: jester effects in combination -----------------------

test("scoreSelection with no jesters matches base chips/mult", () => {
  const selected = [card("2", "♠"), card("2", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ hand: selected }));
  const result = scoreSelection(selected);
  // Pair: base 10 chips, 2 mult. Only the pair scores: 2+2 = 4. The 9, J and K
  // are kickers and add nothing. Total chips = 14.
  assert.equal(result.chips, 14);
  assert.equal(result.mult, 2);
  assert.equal(result.multMul, 1);
  assert.equal(result.total, 28);
});

test("scoreSelection stacks additive and multiplicative jesters", () => {
  const selected = [card("2", "♠"), card("2", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({
    jesters: [jesterById("base_jester"), jesterById("standard_bearer"), jesterById("royal_portrait")],
    hand: selected,
    discardsLeft: 1,
  }));
  const result = scoreSelection(selected);
  // Base: 10 chips + 4 pair chips = 14, +30 (banner, 1 discard left) = 44 chips.
  // Mult: 2 base +4 (base_jester) = 6. Photograph needs a scoring face card, and
  // the J and K are only kickers here, so it stays at x1.
  assert.equal(result.chips, 44);
  assert.equal(result.mult, 6);
  assert.equal(result.multMul, 1);
  assert.equal(result.total, 44 * 6);
});

test("conditional jesters only fire when their condition holds", () => {
  const jesters = [jesterById("duettist"), jesterById("blackleg")];
  const highCardSelected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters, hand: highCardSelected }));
  const highCardResult = scoreSelection(highCardSelected);
  // High card: neither duettist (+8 Mult on a Pair) nor blackleg
  // (+100 Chips on a Straight) should fire.
  assert.equal(highCardResult.chips, 5 + 10); // only the K scores
  assert.equal(highCardResult.mult, 1);

  const straightSelected = [card("10", "♠"), card("J", "♥"), card("Q", "♦"), card("K", "♣"), card("A", "♠")];
  _setState(baseState({ jesters, hand: straightSelected }));
  const straightResult = scoreSelection(straightSelected);
  // Straight: duettist should NOT fire (no pair present); blackleg
  // (+100 chips) should.
  assert.equal(straightResult.mult, 4);
  assert.equal(straightResult.chips, 30 + 100 + 10 + 10 + 10 + 10 + 11);
});

// --- ported jesters: the ones that key off context beyond the -----------
// --- selected cards themselves (held hand, randomness, other stats) -----

function withMockedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

test("gauntlet doubles the lowest held card's rank into Mult", () => {
  const selected = [card("K", "♠")];
  const held = [card("7", "♥"), card("3", "♦"), card("J", "♣")]; // lowest held rank = 3
  _setState(baseState({ jesters: [jesterById("gauntlet")], hand: [...selected, ...held] }));
  const result = scoreSelection(selected);
  assert.equal(result.mult, 1 + 3 * 2); // High Card base mult 1, +2x lowest held rank
});

test("gauntlet adds nothing when no cards are held (whole hand played)", () => {
  const selected = [card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("gauntlet")], hand: selected })); // nothing held back
  const result = scoreSelection(selected);
  assert.equal(result.mult, 1);
});

test("kingmaker rewards each played Ace with +20 chips and +4 mult", () => {
  const selected = [card("A", "♠"), card("A", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("kingmaker")], hand: selected }));
  const result = scoreSelection(selected);
  // Pair of Aces: base 10 chips/2 mult. Card chips: 11+11=22 (kickers don't score). +2 Aces*20=40 chips.
  assert.equal(result.chips, 10 + 22 + 40);
  assert.equal(result.mult, 2 + 2 * 4);
});

test("letter_of_introduction pays $2 per scoring face card, only when its coin flip hits", () => {
  const selected = [card("J", "♠"), card("J", "♥"), card("9", "♦")]; // pair of face cards, 9 is a kicker
  _setState(baseState({ jesters: [jesterById("letter_of_introduction")], hand: selected }));

  assert.equal(withMockedRandom(0, () => scoreSelection(selected)).money, 4); // always hits
  assert.equal(withMockedRandom(0.9, () => scoreSelection(selected)).money, 0); // never hits
});

test("seat_at_the_high_table pays $1 per held face card, not played ones", () => {
  const selected = [card("2", "♠")]; // no face cards played
  const held = [card("K", "♥"), card("Q", "♦"), card("5", "♣")]; // 2 face cards held
  _setState(baseState({ jesters: [jesterById("seat_at_the_high_table")], hand: [...selected, ...held] }));

  assert.equal(withMockedRandom(0, () => scoreSelection(selected)).money, 2); // always hits
  assert.equal(withMockedRandom(0.9, () => scoreSelection(selected)).money, 0); // never hits
});

test("carrier_pigeon rewards each played 10 or 4 with +10 chips and +4 mult", () => {
  const selected = [card("10", "♠"), card("10", "♥"), card("4", "♦"), card("9", "♦")];
  _setState(baseState({ jesters: [jesterById("carrier_pigeon")], hand: selected }));
  const result = scoreSelection(selected);
  // Pair of 10s: base 10 chips/2 mult. Card chips: 10+10=20. +2 matches*10=20 chips.
  // The kicker 4 is not scored, so it doesn't trigger.
  assert.equal(result.chips, 10 + 20 + 20);
  assert.equal(result.mult, 2 + 2 * 4);
});

// --- ported jesters: new ctx fields (heldHand, money, rarity) -------------

test("held-in-hand jesters see cards not in the played selection", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("A", "♦")];
  const heldOnly = [card("K", "♣"), card("3", "♠"), card("7", "♥")];
  const jesters = [jesterById("gauntlet"), jesterById("baron")];
  _setState(baseState({ jesters, hand: [...selected, ...heldOnly] }));
  const result = scoreSelection(selected);
  // High card: base 5 chips + the Ace (11) = 16 chips, base mult 1.
  // gauntlet: lowest-ranked held card is the 3 -> +6 mult (double its rank).
  // baron: one held King -> X1.5 mult. Neither reads `selected`, so playing
  // different cards wouldn't change either effect.
  assert.equal(result.chips, 16);
  assert.equal(result.mult, 7);
  assert.equal(result.multMul, 1.5);
  assert.equal(result.total, Math.floor(16 * 7 * 1.5));
});

test("money-granting jesters add to result.money, not chips/mult", () => {
  const selected = [card("J", "♠"), card("J", "♥"), card("2", "♦"), card("5", "♣"), card("7", "♠")];
  const heldOnly = [card("K", "♦"), card("K", "♠")];
  const jesters = [jesterById("letter_of_introduction"), jesterById("seat_at_the_high_table")];
  _setState(baseState({ jesters, hand: [...selected, ...heldOnly] }));
  const origRandom = Math.random;
  Math.random = () => 0; // force every "1 in 2 chance" to succeed
  try {
    const result = scoreSelection(selected);
    // letter_of_introduction: $2 per scoring face card (J, J) = $4.
    // seat_at_the_high_table: $1 per held face card (K, K) = $2.
    assert.equal(result.money, 6);
    assert.equal(result.mult, 2); // Pair — neither jester touches mult
  } finally {
    Math.random = origRandom;
  }
});

test("scoreSelection doesn't apply money itself — only playHand does", () => {
  // scoreSelection is called on every render for the live preview, so it
  // must stay side-effect free; money should only land in state via playHand.
  const selected = [card("J", "♠"), card("Q", "♥"), card("2", "♦"), card("5", "♣"), card("7", "♠")];
  const jesters = [jesterById("letter_of_introduction")];
  const s = baseState({ jesters, hand: selected, money: 4 });
  _setState(s);
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    scoreSelection(selected);
    assert.equal(s.money, 4, "scoreSelection must not mutate state.money");
  } finally {
    Math.random = origRandom;
  }
});

test("Baseball Card scales X1.5 Mult per Uncommon jester owned", () => {
  const selected = [card("6", "♠"), card("9", "♥"), card("Q", "♦"), card("K", "♣"), card("A", "♠")];
  _setState(baseState({ jesters: [jesterById("heraldic_crest"), jesterById("royal_geometer")], hand: selected }));
  const oneUncommon = scoreSelection(selected);
  assert.equal(oneUncommon.multMul, 1.5); // only Fibonacci (Uncommon) counts, not Baseball Card itself (Rare)

  _setState(baseState({
    jesters: [jesterById("heraldic_crest"), jesterById("royal_geometer"), jesterById("privy_purse")],
    hand: selected,
  }));
  const twoUncommons = scoreSelection(selected);
  assert.equal(twoUncommons.multMul, 1.5 * 1.5);
});

// --- ported jesters, round 2: needed a small amount of new engine --------
// --- plumbing (see src/scoring.js) beyond the plain per-hand apply(ctx) hook ------

test("Hack doubles the chip value of played 2s, 3s, 4s, and 5s only", () => {
  const selected = [card("2", "♠"), card("2", "♥"), card("9", "♦"), card("9", "♣"), card("K", "♣")];
  _setState(baseState({ jesters: [jesterById("peasant_revolt")], hand: selected }));
  const result = scoreSelection(selected);
  // Two Pair: base 20 chips + scoring cards (2+2+9+9=22) = 42, +2nd copy of the two 2s (4).
  assert.equal(result.chips, 42 + 4);
});

test("Cavendish gives a flat X3 Mult", () => {
  const selected = [card("2", "♠")];
  _setState(baseState({ jesters: [jesterById("hardened_taster")], hand: selected }));
  assert.equal(scoreSelection(selected).multMul, 3);
});

test("Pareidolia makes every card count as a face card for other jesters", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦")]; // no real face cards
  _setState(baseState({ jesters: [jesterById("delusions_of_grandeur"), jesterById("grotesque")], hand: selected }));
  const result = scoreSelection(selected);
  // Scary Face: +30 Chips per scoring face card; Pareidolia makes every card a face card,
  // but only the 9 scores in a High Card.
  assert.equal(result.chips, 5 + 9 + 30);
});

test("without Pareidolia, Scary Face only counts real face cards", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦")];
  _setState(baseState({ jesters: [jesterById("grotesque")], hand: selected }));
  const result = scoreSelection(selected);
  assert.equal(result.chips, 5 + 9); // High Card: only the 9 scores
});

test("evaluateHand: a 4-card flush only counts with Four Fingers owned", () => {
  const fourSameSuit = [card("2", "♠"), card("5", "♠"), card("9", "♠"), card("K", "♠")];
  _setState(baseState({ jesters: [], hand: fourSameSuit }));
  assert.equal(evaluateHand(fourSameSuit).isFlush, false);

  _setState(baseState({ jesters: [jesterById("corner_cutter")], hand: fourSameSuit }));
  assert.equal(evaluateHand(fourSameSuit).isFlush, true);
});

test("evaluateHand: a 4-card straight only counts with Four Fingers owned", () => {
  const fourInARow = [card("5", "♠"), card("6", "♥"), card("7", "♦"), card("8", "♣")];
  _setState(baseState({ jesters: [], hand: fourInARow }));
  assert.equal(evaluateHand(fourInARow).isStraight, false);

  _setState(baseState({ jesters: [jesterById("corner_cutter")], hand: fourInARow }));
  assert.equal(evaluateHand(fourInARow).isStraight, true);
});

test("Four Fingers still allows the Ace-low wheel at 4 cards (A-2-3-4)", () => {
  const wheelFour = [card("A", "♠"), card("2", "♥"), card("3", "♦"), card("4", "♣")];
  _setState(baseState({ jesters: [jesterById("corner_cutter")], hand: wheelFour }));
  assert.equal(evaluateHand(wheelFour).isStraight, true);
});

test("Four Fingers: a flush plus a straight in different suits is not a Straight Flush", () => {
  const mixed = [card("2", "♥"), card("3", "♥"), card("4", "♥"), card("K", "♥"), card("5", "♠")];
  _setState(baseState({ jesters: [jesterById("corner_cutter")], hand: mixed }));
  assert.equal(evaluateHand(mixed).name, "Flush");
});

test("Four Fingers: a 5-card straight scores all five cards", () => {
  const five = [card("5", "♠"), card("6", "♥"), card("7", "♦"), card("8", "♣"), card("9", "♠")];
  _setState(baseState({ jesters: [jesterById("corner_cutter")], hand: five }));
  assert.equal(evaluateHand(five).scoringCards.length, 5);
});

test("five cards of one rank score as Four of a Kind", () => {
  const five = [card("7", "♠"), card("7", "♥"), card("7", "♦"), card("7", "♣"), card("7", "♠")];
  _setState(baseState({ jesters: [], hand: five }));
  const hand = evaluateHand(five);
  assert.equal(hand.name, "Four of a Kind");
  assert.equal(hand.scoringCards.length, 5);
});

test("interestOn: debt earns no interest", () => {
  assert.equal(interestOn(-7), 0);
  assert.equal(interestOn(12), 2);
  assert.equal(interestOn(100), 5);
});

// --- jester-to-jester synergy/anti-synergy ---------------------------------

test("Brainstorm copies the leftmost Jester's scoring ability", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")]; // High Card
  const jesters = [jesterById("base_jester"), jesterById("mimic")]; // base_jester (+4 Mult) is leftmost
  _setState(baseState({ jesters, hand: selected }));
  const result = scoreSelection(selected);
  // High Card base mult 1, +4 (base_jester) +4 (Brainstorm's copy) = 9.
  assert.equal(result.mult, 9);
});

test("Brainstorm does nothing when it is itself the leftmost Jester", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  const jesters = [jesterById("mimic"), jesterById("base_jester")];
  _setState(baseState({ jesters, hand: selected }));
  const result = scoreSelection(selected);
  // Brainstorm copies slot 0 (itself) -> no-op; base_jester still gives +4.
  assert.equal(result.mult, 5);
});

test("Swashbuckler gives Mult equal to the sell value of every other owned Jester", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  const banner = jesterById("standard_bearer"); // price 5 -> sell value 2
  const baseJester = jesterById("base_jester"); // price 2 -> sell value 1
  const jesters = [baseJester, banner, jesterById("kings_ransom")];
  _setState(baseState({ jesters, hand: selected, discardsLeft: 0 }));
  const result = scoreSelection(selected);
  // High Card base mult 1, +4 (base_jester), +3 (Swashbuckler: 1 + 2 sell value of the other two).
  assert.equal(result.mult, 8);
});

test("Campfire scales X0.25 Mult per Jester sold this run", () => {
  const selected = [card("2", "♠"), card("2", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")]; // Pair
  _setState(baseState({ jesters: [jesterById("pyre")], hand: selected, jestersSold: 3 }));
  const result = scoreSelection(selected);
  assert.equal(result.multMul, 1.75); // 1 + 0.25 * 3
});

test("Campfire has no bonus before any Jester has been sold", () => {
  const selected = [card("2", "♠"), card("2", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("pyre")], hand: selected, jestersSold: 0 }));
  const result = scoreSelection(selected);
  assert.equal(result.multMul, 1);
});

test("Blueprint copies the scoring ability of the Jester to its right", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("understudy"), jesterById("base_jester")], hand: selected }));
  // High Card base mult 1, +4 (Blueprint's copy) +4 (base_jester) = 9.
  assert.equal(scoreSelection(selected).mult, 9);
});

test("Blueprint does nothing in the rightmost slot or when the two copiers point at each other", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("base_jester"), jesterById("understudy")], hand: selected }));
  assert.equal(scoreSelection(selected).mult, 5);
  _setState(baseState({ jesters: [jesterById("understudy"), jesterById("mimic")], hand: selected }));
  assert.equal(scoreSelection(selected).mult, 1);
});

// --- copiers (Mimic, Understudy) copy what triggers during play ---

const PAIR_WITH_KICKER = [card("5", "♦"), card("5", "♠"), card("9", "♦")]; // only the two 5s score

test("Understudy copies a per-card jester, once for each card it triggers on", () => {
  _setState(baseState({ jesters: [jesterById("understudy"), jesterById("miser")], hand: PAIR_WITH_KICKER }));
  const r = scoreSelection(PAIR_WITH_KICKER);
  assert.equal(r.mult, r.hand.baseMult + 3 + 3); // one scoring ♦ card, Miser and its copy
  assert.deepEqual(r.steps.filter(s => s.type === "jester").map(s => s.index), [0, 1]);
});

test("Mimic copies a leftmost whole-hand jester", () => {
  _setState(baseState({ jesters: [jesterById("duettist"), jesterById("mimic")], hand: PAIR_WITH_KICKER }));
  const r = scoreSelection(PAIR_WITH_KICKER);
  assert.equal(r.mult, r.hand.baseMult + 8 + 8);
});

test("copiers chain: Understudy through Understudy to Baron", () => {
  const second = { ...jesterById("understudy"), id: "blueprint_2" };
  const held = [card("K", "♠"), card("K", "♥")];
  const jesters = [jesterById("understudy"), second, jesterById("baron")];
  _setState(baseState({ jesters, hand: [...PAIR_WITH_KICKER, ...held] }));
  const r = scoreSelection(PAIR_WITH_KICKER);
  assert.equal(resolveCopyTarget(jesters[0], jesters).source, jesters[2]);
  assert.equal(r.multMul, Math.pow(1.5, 2) ** 3); // two Kings left in hand, three jesters that trigger on them
});

test("two copiers pointing at each other copy nothing and say so", () => {
  const jesters = [jesterById("understudy"), jesterById("mimic")];
  _setState(baseState({ jesters, hand: PAIR_WITH_KICKER }));
  assert.equal(resolveCopyTarget(jesters[0], jesters).reason, "none");
  const r = scoreSelection(PAIR_WITH_KICKER);
  assert.equal(r.mult, r.hand.baseMult);
  assert.deepEqual(r.steps.filter(s => s.copyFailed).map(s => s.index), [0, 1]);
});

test("Understudy can't copy end-of-act or passive jesters", () => {
  for (const id of ["gilded_fool", "many_hands", "nest_egg", "palace_purge"]) {
    const jesters = [jesterById("understudy"), jesterById(id)];
    _setState(baseState({ jesters, hand: PAIR_WITH_KICKER }));
    assert.equal(resolveCopyTarget(jesters[0], jesters).reason, "incompatible", id);
    const r = scoreSelection(PAIR_WITH_KICKER);
    assert.equal(r.mult, r.hand.baseMult, id);
    assert.equal(r.steps.find(s => s.index === 0).copyFailed, true, id);
  }
});

test("a copier in the leftmost slot, or with no target, is flagged and a working copier is not", () => {
  const jesters = [jesterById("mimic"), jesterById("base_jester")];
  _setState(baseState({ jesters, hand: PAIR_WITH_KICKER }));
  assert.equal(resolveCopyTarget(jesters[0], jesters).reason, "none");
  assert.equal(scoreSelection(PAIR_WITH_KICKER).steps.find(s => s.index === 0).copyFailed, true);
  const ok = [jesterById("base_jester"), jesterById("mimic")];
  _setState(baseState({ jesters: ok, hand: PAIR_WITH_KICKER }));
  assert.equal(resolveCopyTarget(ok[1], ok).reason, "ok");
  assert.ok(!scoreSelection(PAIR_WITH_KICKER).steps.some(s => s.copyFailed));
});

test("Mimic can't copy the leftmost jester while the Spymaster silences it", () => {
  const jesters = [jesterById("base_jester"), jesterById("mimic")];
  _setState(baseState({ jesters, hand: PAIR_WITH_KICKER, bossModifier: { silenceLeftmost: true } }));
  assert.equal(resolveCopyTarget(jesters[1], jesters).reason, "silenced");
  const r = scoreSelection(PAIR_WITH_KICKER);
  assert.equal(r.mult, r.hand.baseMult);
  assert.equal(r.steps.find(s => s.index === 1).copyFailed, true);
});

test("a silenced copier shows Silenced, not a second copy warning", () => {
  const jesters = [jesterById("understudy"), jesterById("base_jester")];
  _setState(baseState({ jesters, hand: PAIR_WITH_KICKER, bossModifier: { silenceLeftmost: true } }));
  const steps = scoreSelection(PAIR_WITH_KICKER).steps.filter(s => s.index === 0);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].silenced, true);
});

test("Master of Revels gives +4 Mult per different rarity among owned Jesters", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("master_of_revels")], hand: selected }));
  assert.equal(scoreSelection(selected).mult, 1 + 4); // Uncommon only
  _setState(baseState({ jesters: [jesterById("base_jester"), jesterById("master_of_revels")], hand: selected }));
  assert.equal(scoreSelection(selected).mult, 1 + 4 + 8); // Common + Uncommon
});

// --- targetForRound scaling -----------------------------------------------

test("targetForRound: venue 1 round 1 is the base target", () => {
  assert.equal(targetForRound(1, 1), 300);
});

test("targetForRound scales up within an venue as round increases", () => {
  const r1 = targetForRound(2, 1);
  const r2 = targetForRound(2, 2);
  const r3 = targetForRound(2, 3);
  assert.ok(r1 < r2 && r2 < r3, `expected strictly increasing targets, got ${r1}, ${r2}, ${r3}`);
});

test("targetForRound scales up across venues", () => {
  const a1 = targetForRound(1, 1);
  const a8 = targetForRound(8, 1);
  assert.ok(a8 > a1 * 5, `expected venue 8 target to dwarf venue 1, got ${a1} vs ${a8}`);
});

test("targetForRound is always rounded to the nearest 10", () => {
  for (let venue = 1; venue <= 8; venue++) {
    for (let round = 1; round <= 3; round++) {
      assert.equal(targetForRound(venue, round) % 10, 0);
    }
  }
});

test("jester order changes scoring: Blueprint copies whichever Jester is on its right", () => {
  const { moveJester } = require("../tools/load-game.js");
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  const s = baseState({ jesters: [jesterById("base_jester"), jesterById("understudy")], hand: selected });
  _setState(s);
  assert.equal(scoreSelection(selected).mult, 5);
  moveJester("understudy", 0);
  assert.deepEqual(s.jesters.map(j => j.id), ["understudy", "base_jester"]);
  assert.equal(scoreSelection(selected).mult, 9);
});

// --- scoring steps: the trigger-by-trigger breakdown the screen plays out ---

test("scoreSelection lists each played card, then each jester that fires, left to right", () => {
  const selected = [card("A", "♠"), card("A", "♥"), card("9", "♦")];
  _setState(baseState({
    jesters: [jesterById("duettist"), jesterById("juggler"), jesterById("sharper")],
    hand: selected,
  }));
  const r = scoreSelection(selected);
  // The 9 is a kicker, so it isn't listed. Zany Jester needs three of a kind, so it stays out too.
  assert.deepEqual(r.steps.map(s => `${s.type}:${s.id}`), [
    "card:A♠", "card:A♥", "jester:duettist", "jester:sharper",
  ]);
  assert.equal(r.steps[0].chips, 11);
  assert.equal(r.steps[2].multAdd, 8);
  assert.equal(r.steps[3].chips, 50);
  assert.equal(r.steps[2].index, 0);
  assert.equal(r.steps[3].index, 2);
});

test("the steps add up to the totals", () => {
  const selected = [card("K", "♠"), card("K", "♥"), card("5", "♦")];
  selected[0].enh = "bonus";
  selected[1].enh = "glass";
  selected[2].enh = "mult";
  _setState(baseState({ jesters: [jesterById("base_jester"), jesterById("widows_weeds")], hand: selected }));
  const r = scoreSelection(selected);
  const sum = (key, init) => r.steps.reduce((acc, s) => (key === "multMul" ? acc * s[key] : acc + s[key]), init);
  assert.equal(sum("chips", r.hand.baseChips), r.chips);
  assert.equal(sum("multAdd", r.hand.baseMult), r.mult);
  assert.equal(sum("multMul", 1), r.multMul);
  assert.equal(r.total, Math.floor(r.chips * r.mult * r.multMul));
  assert.equal(r.steps[0].chips, 10 + 30); // Bonus card: face value plus 30
  assert.equal(r.steps[1].multMul, 2); // Glass card
  assert.equal(r.steps[2].multAdd, 4); // Mult card
});

test("a silenced jester and a debuffed card show up as steps that add nothing", () => {
  const selected = [card("9", "♠"), card("9", "♥")];
  _setState(baseState({
    jesters: [jesterById("base_jester")],
    hand: selected,
    bossModifier: { silenceLeftmost: true, suitDebuff: "♠" },
  }));
  const r = scoreSelection(selected);
  assert.equal(r.steps[0].debuffed, true);
  assert.equal(r.steps[0].chips, 0);
  assert.equal(r.steps[1].debuffed, false);
  assert.equal(r.steps[2].silenced, true);
  assert.equal(r.mult, r.hand.baseMult); // Silenced: the +4 never lands
});

test("kickers add no chips and don't trigger per-card jesters", () => {
  const selected = [card("5", "♦"), card("5", "♣"), card("A", "♦"), card("K", "♦")];
  _setState(baseState({
    jesters: [jesterById("miser"), jesterById("grotesque"), jesterById("kingmaker")],
    hand: selected,
  }));
  const r = scoreSelection(selected);
  // Pair of 5s: only the two 5s score. The A and K are kickers, even though the
  // A♦ and K♦ would otherwise feed Greedy, Scary Face and Scholar.
  assert.equal(r.chips, 10 + 5 + 5);
  assert.equal(r.mult, 2 + 3); // Greedy: just the one scoring diamond, the 5
});

test("a per-card jester fires once for each scoring card, right after that card", () => {
  const played = [card("K", "♠"), card("Q", "♥"), card("J", "♦"), card("10", "♣"), card("9", "♠")];
  _setState(baseState({ jesters: [jesterById("flatterer")], hand: played }));
  const r = scoreSelection(played);
  assert.deepEqual(r.steps.map(s => `${s.type}:${s.cardId ?? s.id}`), [
    "card:K♠", "jester:K♠", "card:Q♥", "jester:Q♥", "card:J♦", "jester:J♦", "card:10♣", "card:9♠",
  ]);
  assert.ok(r.steps.filter(s => s.type === "jester").every(s => s.multAdd === 5));
});

test("every per-card jester ignores kickers", () => {
  // Pair of 8s plus kickers chosen to match each jester's condition. Fibonacci
  // (A, 2, 3, 5, 8), Even Steven (2, 4, 6, 8, 10), Odd Todd, Smiley Face, and the
  // suit jesters all see the kickers; none of them may fire for them.
  const played = [card("8", "♠"), card("8", "♣"), card("A", "♥"), card("3", "♦"), card("K", "♥")];
  const expectKickersIgnored = (id, fires) => {
    _setState(baseState({ jesters: [jesterById(id)], hand: played }));
    const r = scoreSelection(played);
    const jesterSteps = r.steps.filter(s => s.type === "jester");
    assert.equal(jesterSteps.length > 0, fires, id);
    return { multAdd: jesterSteps.reduce((sum, s) => sum + s.multAdd, 0) };
  };
  // 8♠ 8♣ score: Fibonacci +8 each, Even Steven +4 each; nothing for A, 3 or K.
  assert.equal(expectKickersIgnored("royal_geometer", true).multAdd, 16);
  assert.equal(expectKickersIgnored("lady_even", true).multAdd, 8);
  // No odd rank, face card, heart, or diamond scores.
  for (const id of ["lady_odd", "flatterer", "libertine", "miser"]) {
    expectKickersIgnored(id, false);
  }
  // The 8♠ and 8♣ do score for the spade and club jesters, one suit card each.
  assert.equal(expectKickersIgnored("firebrand", true).multAdd, 3);
  assert.equal(expectKickersIgnored("glutton", true).multAdd, 3);
});

test("scoring cards come out left to right as laid out, whatever order that is", () => {
  // The cards are passed in the order they sit on the field (the player can rearrange
  // them). The pair of 5s is found before the lower pair, but they fire as laid out.
  const selected = [card("3", "♠"), card("5", "♦"), card("K", "♣"), card("3", "♥"), card("5", "♠")];
  _setState(baseState({ jesters: [], hand: selected }));
  const r = scoreSelection(selected);
  assert.equal(r.hand.name, "Two Pair");
  assert.deepEqual(r.steps.map(s => s.id), ["3♠", "5♦", "3♥", "5♠"]);
  assert.deepEqual(r.hand.scoringCards.map(c => c.id), ["3♠", "5♦", "3♥", "5♠"]);

  const flush = [card("9", "♥"), card("2", "♥"), card("K", "♥"), card("4", "♥"), card("7", "♥")];
  _setState(baseState({ jesters: [], hand: flush }));
  assert.deepEqual(scoreSelection(flush).steps.map(s => s.id), flush.map(c => c.id));
});
