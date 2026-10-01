// Regression tests for the scoring math. Runs under Node's built-in test
// runner, no dependencies: `node --test` (or `npm test`) from repo root.
"use strict";

// game.js expects a global `Sound` object (normally provided by sounds.js
// in the browser); stub it so requiring game.js under Node doesn't blow up
// when actions call Sound.*().
global.Sound = new Proxy({}, { get: () => () => {} });

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateHand,
  scoreSelection,
  targetForRound,
  JESTER_POOL,
  _setState,
} = require("../game.js");

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
  // Pair: base 10 chips, 2 mult. Card chips: 2+2+9+10+10 = 33. Total chips = 43.
  assert.equal(result.chips, 43);
  assert.equal(result.mult, 2);
  assert.equal(result.multMul, 1);
  assert.equal(result.total, 86);
});

test("scoreSelection stacks additive and multiplicative jesters", () => {
  const selected = [card("2", "♠"), card("2", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({
    jesters: [jesterById("base_jester"), jesterById("banner"), jesterById("photograph")],
    hand: selected,
    discardsLeft: 1,
  }));
  const result = scoreSelection(selected);
  // Base: 10 chips + 33 card chips = 43, +30 (banner, 1 discard left) = 73 chips.
  // Mult: 2 base +4 (base_jester) = 6, x2 (photograph, a face card was played) = 12.
  assert.equal(result.chips, 73);
  assert.equal(result.mult, 6);
  assert.equal(result.multMul, 2);
  assert.equal(result.total, Math.floor(73 * 6 * 2));
});

test("conditional jesters only fire when their condition holds", () => {
  const jesters = [jesterById("jolly_jester"), jesterById("devious_jester")];
  const highCardSelected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters, hand: highCardSelected }));
  const highCardResult = scoreSelection(highCardSelected);
  // High card: neither jolly_jester (+8 Mult on a Pair) nor devious_jester
  // (+100 Chips on a Straight) should fire.
  assert.equal(highCardResult.chips, 5 + 2 + 5 + 9 + 10 + 10);
  assert.equal(highCardResult.mult, 1);

  const straightSelected = [card("10", "♠"), card("J", "♥"), card("Q", "♦"), card("K", "♣"), card("A", "♠")];
  _setState(baseState({ jesters, hand: straightSelected }));
  const straightResult = scoreSelection(straightSelected);
  // Straight: jolly_jester should NOT fire (no pair present); devious_jester
  // (+100 chips) should.
  assert.equal(straightResult.mult, 4);
  assert.equal(straightResult.chips, 30 + 100 + 10 + 10 + 10 + 10 + 11);
});

// --- ported Balatro jesters: the ones that key off context beyond the -----
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

test("raised_fist doubles the lowest held card's rank into Mult", () => {
  const selected = [card("K", "♠")];
  const held = [card("7", "♥"), card("3", "♦"), card("J", "♣")]; // lowest held rank = 3
  _setState(baseState({ jesters: [jesterById("raised_fist")], hand: [...selected, ...held] }));
  const result = scoreSelection(selected);
  assert.equal(result.mult, 1 + 3 * 2); // High Card base mult 1, +2x lowest held rank
});

test("raised_fist adds nothing when no cards are held (whole hand played)", () => {
  const selected = [card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("raised_fist")], hand: selected })); // nothing held back
  const result = scoreSelection(selected);
  assert.equal(result.mult, 1);
});

test("scholar rewards each played Ace with +20 chips and +4 mult", () => {
  const selected = [card("A", "♠"), card("A", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("scholar")], hand: selected }));
  const result = scoreSelection(selected);
  // Pair of Aces: base 10 chips/2 mult. Card chips: 11+11+9+10+10=51. +2 Aces*20=40 chips.
  assert.equal(result.chips, 10 + 51 + 40);
  assert.equal(result.mult, 2 + 2 * 4);
});

test("business_card pays $2 per played face card, only when its coin flip hits", () => {
  const selected = [card("J", "♠"), card("Q", "♥"), card("9", "♦")]; // 2 face cards
  _setState(baseState({ jesters: [jesterById("business_card")], hand: selected }));

  assert.equal(withMockedRandom(0, () => scoreSelection(selected)).money, 4); // always hits
  assert.equal(withMockedRandom(0.9, () => scoreSelection(selected)).money, 0); // never hits
});

test("reserved_parking pays $1 per held face card, not played ones", () => {
  const selected = [card("2", "♠")]; // no face cards played
  const held = [card("K", "♥"), card("Q", "♦"), card("5", "♣")]; // 2 face cards held
  _setState(baseState({ jesters: [jesterById("reserved_parking")], hand: [...selected, ...held] }));

  assert.equal(withMockedRandom(0, () => scoreSelection(selected)).money, 2); // always hits
  assert.equal(withMockedRandom(0.9, () => scoreSelection(selected)).money, 0); // never hits
});

test("walkie_talkie rewards each played 10 or 4 with +10 chips and +4 mult", () => {
  const selected = [card("10", "♠"), card("4", "♥"), card("9", "♦")];
  _setState(baseState({ jesters: [jesterById("walkie_talkie")], hand: selected }));
  const result = scoreSelection(selected);
  // High Card: base 5 chips/1 mult. Card chips: 10+4+9=23. +2 matches*10=20 chips.
  assert.equal(result.chips, 5 + 23 + 20);
  assert.equal(result.mult, 1 + 2 * 4);
});

// --- ported Balatro jesters: new ctx fields (heldHand, money, rarity) ------

test("held-in-hand jesters see cards not in the played selection", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("A", "♦")];
  const heldOnly = [card("K", "♣"), card("3", "♠"), card("7", "♥")];
  const jesters = [jesterById("raised_fist"), jesterById("baron")];
  _setState(baseState({ jesters, hand: [...selected, ...heldOnly] }));
  const result = scoreSelection(selected);
  // High card: base 5 chips + (2+5+9+10+11) card chips = 42 chips, base mult 1.
  // raised_fist: lowest-ranked held card is the 3 -> +6 mult (double its rank).
  // baron: one held King -> X1.5 mult. Neither reads `selected`, so playing
  // different cards wouldn't change either effect.
  assert.equal(result.chips, 42);
  assert.equal(result.mult, 7);
  assert.equal(result.multMul, 1.5);
  assert.equal(result.total, 441);
});

test("money-granting jesters add to result.money, not chips/mult", () => {
  const selected = [card("J", "♠"), card("Q", "♥"), card("2", "♦"), card("5", "♣"), card("7", "♠")];
  const heldOnly = [card("K", "♦"), card("K", "♠")];
  const jesters = [jesterById("business_card"), jesterById("reserved_parking")];
  _setState(baseState({ jesters, hand: [...selected, ...heldOnly] }));
  const origRandom = Math.random;
  Math.random = () => 0; // force every "1 in 2 chance" to succeed
  try {
    const result = scoreSelection(selected);
    // business_card: $2 per played face card (J, Q) = $4.
    // reserved_parking: $1 per held face card (K, K) = $2.
    assert.equal(result.money, 6);
    assert.equal(result.mult, 1); // High Card — neither jester touches mult
  } finally {
    Math.random = origRandom;
  }
});

test("scoreSelection doesn't apply money itself — only playHand does", () => {
  // scoreSelection is called on every render for the live preview, so it
  // must stay side-effect free; money should only land in state via playHand.
  const selected = [card("J", "♠"), card("Q", "♥"), card("2", "♦"), card("5", "♣"), card("7", "♠")];
  const jesters = [jesterById("business_card")];
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
  _setState(baseState({ jesters: [jesterById("baseball_card"), jesterById("fibonacci")], hand: selected }));
  const oneUncommon = scoreSelection(selected);
  assert.equal(oneUncommon.multMul, 1.5); // only Fibonacci (Uncommon) counts, not Baseball Card itself (Rare)

  _setState(baseState({
    jesters: [jesterById("baseball_card"), jesterById("fibonacci"), jesterById("bull")],
    hand: selected,
  }));
  const twoUncommons = scoreSelection(selected);
  assert.equal(twoUncommons.multMul, 1.5 * 1.5);
});

// --- ported Balatro jesters, round 2: needed a small amount of new engine --
// --- plumbing (see game.js) beyond the plain per-hand apply(ctx) hook ------

test("Hack doubles the chip value of played 2s, 3s, 4s, and 5s only", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("K", "♣")];
  _setState(baseState({ jesters: [jesterById("hack")], hand: selected }));
  const result = scoreSelection(selected);
  // High Card: base 5 chips + card chips (2+5+9+10=26) = 31, +2nd copy of the 2 and 5 (2+5=7).
  assert.equal(result.chips, 31 + 7);
});

test("Cavendish gives a flat X3 Mult", () => {
  const selected = [card("2", "♠")];
  _setState(baseState({ jesters: [jesterById("cavendish")], hand: selected }));
  assert.equal(scoreSelection(selected).multMul, 3);
});

test("Pareidolia makes every card count as a face card for other jesters", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦")]; // no real face cards
  _setState(baseState({ jesters: [jesterById("pareidolia"), jesterById("scary_face")], hand: selected }));
  const result = scoreSelection(selected);
  // Scary Face: +30 Chips per face card; Pareidolia makes all 3 played cards count.
  assert.equal(result.chips, 5 + (2 + 5 + 9) + 30 * 3);
});

test("without Pareidolia, Scary Face only counts real face cards", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦")];
  _setState(baseState({ jesters: [jesterById("scary_face")], hand: selected }));
  const result = scoreSelection(selected);
  assert.equal(result.chips, 5 + (2 + 5 + 9));
});

test("evaluateHand: a 4-card flush only counts with Four Fingers owned", () => {
  const fourSameSuit = [card("2", "♠"), card("5", "♠"), card("9", "♠"), card("K", "♠")];
  _setState(baseState({ jesters: [], hand: fourSameSuit }));
  assert.equal(evaluateHand(fourSameSuit).isFlush, false);

  _setState(baseState({ jesters: [jesterById("four_fingers")], hand: fourSameSuit }));
  assert.equal(evaluateHand(fourSameSuit).isFlush, true);
});

test("evaluateHand: a 4-card straight only counts with Four Fingers owned", () => {
  const fourInARow = [card("5", "♠"), card("6", "♥"), card("7", "♦"), card("8", "♣")];
  _setState(baseState({ jesters: [], hand: fourInARow }));
  assert.equal(evaluateHand(fourInARow).isStraight, false);

  _setState(baseState({ jesters: [jesterById("four_fingers")], hand: fourInARow }));
  assert.equal(evaluateHand(fourInARow).isStraight, true);
});

test("Four Fingers still allows the Ace-low wheel at 4 cards (A-2-3-4)", () => {
  const wheelFour = [card("A", "♠"), card("2", "♥"), card("3", "♦"), card("4", "♣")];
  _setState(baseState({ jesters: [jesterById("four_fingers")], hand: wheelFour }));
  assert.equal(evaluateHand(wheelFour).isStraight, true);
});

// --- jester-to-jester synergy/anti-synergy ---------------------------------

test("Brainstorm copies the leftmost Jester's scoring ability", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")]; // High Card
  const jesters = [jesterById("base_jester"), jesterById("brainstorm")]; // base_jester (+4 Mult) is leftmost
  _setState(baseState({ jesters, hand: selected }));
  const result = scoreSelection(selected);
  // High Card base mult 1, +4 (base_jester) +4 (Brainstorm's copy) = 9.
  assert.equal(result.mult, 9);
});

test("Brainstorm does nothing when it is itself the leftmost Jester", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  const jesters = [jesterById("brainstorm"), jesterById("base_jester")];
  _setState(baseState({ jesters, hand: selected }));
  const result = scoreSelection(selected);
  // Brainstorm copies slot 0 (itself) -> no-op; base_jester still gives +4.
  assert.equal(result.mult, 5);
});

test("Swashbuckler gives Mult equal to the sell value of every other owned Jester", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  const banner = jesterById("banner"); // price 5 -> sell value 2
  const baseJester = jesterById("base_jester"); // price 2 -> sell value 1
  const jesters = [baseJester, banner, jesterById("swashbuckler")];
  _setState(baseState({ jesters, hand: selected, discardsLeft: 0 }));
  const result = scoreSelection(selected);
  // High Card base mult 1, +4 (base_jester), +3 (Swashbuckler: 1 + 2 sell value of the other two).
  assert.equal(result.mult, 8);
});

test("Campfire scales X0.25 Mult per Jester sold this run", () => {
  const selected = [card("2", "♠"), card("2", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")]; // Pair
  _setState(baseState({ jesters: [jesterById("campfire")], hand: selected, jestersSold: 3 }));
  const result = scoreSelection(selected);
  assert.equal(result.multMul, 1.75); // 1 + 0.25 * 3
});

test("Campfire has no bonus before any Jester has been sold", () => {
  const selected = [card("2", "♠"), card("2", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("campfire")], hand: selected, jestersSold: 0 }));
  const result = scoreSelection(selected);
  assert.equal(result.multMul, 1);
});

test("Blueprint copies the scoring ability of the Jester to its right", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("blueprint"), jesterById("base_jester")], hand: selected }));
  // High Card base mult 1, +4 (Blueprint's copy) +4 (base_jester) = 9.
  assert.equal(scoreSelection(selected).mult, 9);
});

test("Blueprint does nothing in the rightmost slot or next to another copier", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("base_jester"), jesterById("blueprint")], hand: selected }));
  assert.equal(scoreSelection(selected).mult, 5);
  _setState(baseState({ jesters: [jesterById("blueprint"), jesterById("brainstorm")], hand: selected }));
  assert.equal(scoreSelection(selected).mult, 1);
});

test("Ringmaster gives +4 Mult per different rarity among owned Jesters", () => {
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  _setState(baseState({ jesters: [jesterById("ringmaster")], hand: selected }));
  assert.equal(scoreSelection(selected).mult, 1 + 4); // Uncommon only
  _setState(baseState({ jesters: [jesterById("base_jester"), jesterById("ringmaster")], hand: selected }));
  assert.equal(scoreSelection(selected).mult, 1 + 4 + 8); // Common + Uncommon
});

// --- targetForRound scaling -----------------------------------------------

test("targetForRound: ante 1 round 1 is the base target", () => {
  assert.equal(targetForRound(1, 1), 300);
});

test("targetForRound scales up within an ante as round increases", () => {
  const r1 = targetForRound(2, 1);
  const r2 = targetForRound(2, 2);
  const r3 = targetForRound(2, 3);
  assert.ok(r1 < r2 && r2 < r3, `expected strictly increasing targets, got ${r1}, ${r2}, ${r3}`);
});

test("targetForRound scales up across antes", () => {
  const a1 = targetForRound(1, 1);
  const a8 = targetForRound(8, 1);
  assert.ok(a8 > a1 * 5, `expected ante 8 target to dwarf ante 1, got ${a1} vs ${a8}`);
});

test("targetForRound is always rounded to the nearest 10", () => {
  for (let ante = 1; ante <= 8; ante++) {
    for (let round = 1; round <= 3; round++) {
      assert.equal(targetForRound(ante, round) % 10, 0);
    }
  }
});

test("jester order changes scoring: Blueprint copies whichever Jester is on its right", () => {
  const { moveJester } = require("../game.js");
  const selected = [card("2", "♠"), card("5", "♥"), card("9", "♦"), card("J", "♣"), card("K", "♠")];
  const s = baseState({ jesters: [jesterById("base_jester"), jesterById("blueprint")], hand: selected });
  _setState(s);
  assert.equal(scoreSelection(selected).mult, 5);
  moveJester("blueprint", 0);
  assert.deepEqual(s.jesters.map(j => j.id), ["blueprint", "base_jester"]);
  assert.equal(scoreSelection(selected).mult, 9);
});
