// Integration tests that drive the game's state machine end-to-end (play,
// discard, shop buy/sell/reroll, round/ante transitions, win/game-over) —
// not just the pure scoring functions. Runs under Node's built-in test
// runner: `node --test` (or `npm test`) from repo root.
"use strict";

// game.js expects a global `Sound` object (normally provided by sounds.js
// in the browser); stub it so requiring game.js under Node doesn't blow up
// when actions call Sound.*().
global.Sound = new Proxy({}, { get: () => () => {} });

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  scoreSelection,
  freshDeck,
  JESTER_POOL,
  BOSS_MODIFIERS,
  newState,
  startRound,
  toggleCard,
  getSelectedCards,
  playHand,
  discardSelected,
  buyJester,
  sellJester,
  rerollShop,
  nextRound,
  _getState,
  _setState,
} = require("../game.js");

function withMockedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

// Forces a specific boss modifier by ID: mocks Math.random so
// BOSS_MODIFIERS[Math.floor(Math.random() * BOSS_MODIFIERS.length)] lands on
// it, then runs startRound() (which is where the pick happens) inside that
// mock.
function withBossModifier(id, fn) {
  const idx = BOSS_MODIFIERS.findIndex(m => m.id === id);
  assert.ok(idx !== -1, `no such boss modifier: ${id}`);
  const value = idx / BOSS_MODIFIERS.length + 0.001;
  return withMockedRandom(value, fn);
}

// Fresh, dealt state for each test. startRound() deals synchronously
// outside a DOM (see game.js), so no waiting/faking timers is needed.
function freshRoundState() {
  _setState(newState());
  startRound();
  return _getState();
}

test("toggleCard selects and deselects, capped at 5", () => {
  const state = freshRoundState();
  const ids = state.hand.map(c => c.id);

  for (const id of ids.slice(0, 5)) toggleCard(id);
  assert.equal(_getState().selected.size, 5);

  // A 6th selection past the cap is ignored.
  toggleCard(ids[5]);
  assert.equal(_getState().selected.size, 5);

  // Deselecting frees a slot back up.
  toggleCard(ids[0]);
  assert.equal(_getState().selected.size, 4);
  toggleCard(ids[5]);
  assert.equal(_getState().selected.size, 5);
});

test("playHand scores the selection, spends a hand, and refills to 8 cards", () => {
  const state = freshRoundState();
  const before = state.deck.length;
  const selectedIds = state.hand.slice(0, 3).map(c => c.id);
  for (const id of selectedIds) toggleCard(id);
  const selectedCards = getSelectedCards();
  const expected = scoreSelection(selectedCards).total;

  playHand();

  const after = _getState();
  assert.equal(after.roundScore, expected);
  assert.equal(after.handsLeft, 3); // START_HANDS(4) - 1
  assert.equal(after.hand.length, 8); // refilled back to HAND_SIZE
  assert.equal(after.selected.size, 0);
  assert.equal(after.deck.length, before - 3); // 3 cards drawn to refill
});

test("playHand does nothing with no cards selected", () => {
  const state = freshRoundState();
  const before = JSON.stringify(state.hand);
  playHand();
  assert.equal(state.handsLeft, 4);
  assert.equal(JSON.stringify(state.hand), before);
});

test("running out of hands without reaching target ends the run", () => {
  const state = freshRoundState();
  state.target = Number.MAX_SAFE_INTEGER; // unreachable, forces a loss

  for (let i = 0; i < 4; i++) {
    const id = _getState().hand[0].id;
    toggleCard(id);
    playHand();
  }

  assert.equal(_getState().phase, "gameover");
});

test("reaching the target mid-hand wins the round and opens the shop", () => {
  const state = freshRoundState();
  state.target = 1; // trivially reachable by any hand
  const id = state.hand[0].id;
  toggleCard(id);

  playHand();

  const after = _getState();
  assert.equal(after.phase, "shop");
  assert.equal(after.shopOffers.length, 3);
  assert.ok(after.money > 0);
});

test("winning a round pays interest on savings, capped at $5", () => {
  const state = freshRoundState();
  state.target = 1;
  state.money = 23; // floor(23/5) = 4 interest, under the $5 cap
  const id = state.hand[0].id;
  toggleCard(id);

  playHand();

  const after = _getState();
  const reward = 3 + after.handsLeft + after.discardsLeft;
  assert.equal(after.lastEarnings.interest, 4);
  assert.equal(after.money, 23 + reward + 4);
});

test("interest caps at $5 regardless of how much money is saved", () => {
  const state = freshRoundState();
  state.target = 1;
  state.money = 1000; // floor(1000/5) = 200, well past the cap
  const id = state.hand[0].id;
  toggleCard(id);

  playHand();

  assert.equal(_getState().lastEarnings.interest, 5);
});

test("clearing round 3 of the final ante wins the run", () => {
  const state = freshRoundState();
  state.ante = 8; // FINAL_ANTE
  state.round = 3; // ROUNDS_PER_ANTE
  state.target = 1;
  const id = state.hand[0].id;
  toggleCard(id);

  playHand();

  assert.equal(_getState().phase, "win");
});

test("discardSelected swaps cards without touching score or hand count", () => {
  const state = freshRoundState();
  const before = JSON.stringify([...state.hand].sort((a, b) => a.id.localeCompare(b.id)));
  const ids = state.hand.slice(0, 2).map(c => c.id);
  for (const id of ids) toggleCard(id);

  discardSelected();

  const after = _getState();
  assert.equal(after.discardsLeft, 2); // START_DISCARDS(3) - 1
  assert.equal(after.roundScore, 0);
  assert.equal(after.hand.length, 8);
  assert.equal(after.selected.size, 0);
  const afterSorted = JSON.stringify([...after.hand].sort((a, b) => a.id.localeCompare(b.id)));
  assert.notEqual(afterSorted, before); // the discarded cards are gone
});

test("discardSelected is a no-op once discards are exhausted", () => {
  const state = freshRoundState();
  state.discardsLeft = 0;
  toggleCard(state.hand[0].id);

  discardSelected();

  assert.equal(_getState().discardsLeft, 0);
  assert.equal(_getState().selected.size, 1); // selection untouched
});

test("shop: buying a jester spends money and removes it from the offers", () => {
  const state = freshRoundState();
  state.phase = "shop";
  const jester = JESTER_POOL[0];
  state.shopOffers = [jester, JESTER_POOL[1], JESTER_POOL[2]];
  state.money = jester.price;

  buyJester(jester.id);

  const after = _getState();
  assert.equal(after.money, 0);
  assert.equal(after.jesters.length, 1);
  assert.equal(after.jesters[0].id, jester.id);
  assert.equal(after.shopOffers.find(j => j.id === jester.id), undefined);
});

test("shop: buying is blocked without enough money", () => {
  const state = freshRoundState();
  state.phase = "shop";
  const jester = JESTER_POOL[0];
  state.shopOffers = [jester];
  state.money = jester.price - 1;

  buyJester(jester.id);

  const after = _getState();
  assert.equal(after.jesters.length, 0);
  assert.equal(after.money, jester.price - 1);
});

test("shop: selling refunds half price (rounded down, min 1) and frees the slot", () => {
  const state = freshRoundState();
  state.phase = "shop";
  const jester = JESTER_POOL.find(j => j.price === 5); // odd price -> floor matters
  state.jesters = [jester];
  state.money = 0;

  sellJester(jester.id);

  const after = _getState();
  assert.equal(after.jesters.length, 0);
  assert.equal(after.money, Math.max(1, Math.floor(jester.price / 2)));
});

test("shop: reroll costs escalate and refresh the offers", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.jesters = [];
  state.shopOffers = JESTER_POOL.slice(0, 3);
  state.money = 100;
  state.rerollCost = 2;

  rerollShop();

  const after = _getState();
  assert.equal(after.money, 98);
  assert.equal(after.rerollCost, 3);
  assert.equal(after.shopOffers.length, 3);
});

test("shop: reroll is blocked without enough money", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 0;
  state.rerollCost = 2;
  const offersBefore = state.shopOffers;

  rerollShop();

  assert.equal(_getState().money, 0);
  assert.equal(_getState().shopOffers, offersBefore);
});

test("nextRound advances round, then wraps into the next ante", () => {
  const state = freshRoundState();
  state.round = 1;
  state.ante = 1;

  nextRound();
  assert.equal(_getState().round, 2);
  assert.equal(_getState().ante, 1);

  nextRound();
  assert.equal(_getState().round, 3);
  assert.equal(_getState().ante, 1);

  nextRound(); // round 3 -> wraps to round 1, ante 2
  assert.equal(_getState().round, 1);
  assert.equal(_getState().ante, 2);
});

test("nextRound resets hands, discards, score, and deals a fresh 8-card hand", () => {
  const state = freshRoundState();
  state.handsLeft = 0;
  state.discardsLeft = 0;
  state.roundScore = 999;

  nextRound();

  const after = _getState();
  assert.equal(after.handsLeft, 4);
  assert.equal(after.discardsLeft, 3);
  assert.equal(after.roundScore, 0);
  assert.equal(after.hand.length, 8);
  assert.equal(after.deck.length, freshDeck().length - 8);
});

test("full round trip: play to the target, shop, then start the next round", () => {
  const state = freshRoundState();
  state.target = 1; // any hand clears it

  toggleCard(state.hand[0].id);
  playHand();
  assert.equal(_getState().phase, "shop");

  const moneyAfterWin = _getState().money;
  if (_getState().shopOffers.length > 0) {
    const offer = _getState().shopOffers[0];
    if (_getState().money >= offer.price) {
      buyJester(offer.id);
      assert.equal(_getState().jesters.length, 1);
      assert.equal(_getState().money, moneyAfterWin - offer.price);
    }
  }

  nextRound();
  const after = _getState();
  assert.equal(after.phase, "playing");
  assert.equal(after.round, 2);
  assert.equal(after.hand.length, 8);
});

// --- Boss rounds -----------------------------------------------------------

test("rounds 1 and 2 never get a boss modifier", () => {
  _setState(newState());
  const state = _getState();
  state.round = 1;
  startRound();
  assert.equal(_getState().bossModifier, null);

  state.round = 2;
  startRound();
  assert.equal(_getState().bossModifier, null);
});

test("round 3 always picks a boss modifier", () => {
  _setState(newState());
  _getState().round = 3; // ROUNDS_PER_ANTE
  startRound();
  const modifier = _getState().bossModifier;
  assert.ok(modifier);
  assert.ok(BOSS_MODIFIERS.includes(modifier));
});

test("The Needle limits the boss round to 1 hand", () => {
  _setState(newState());
  _getState().round = 3;
  withBossModifier("needle", startRound);
  assert.equal(_getState().handsLeft, 1);
  assert.equal(_getState().discardsLeft, 3); // untouched
});

test("The Water removes discards for the boss round", () => {
  _setState(newState());
  _getState().round = 3;
  withBossModifier("water", startRound);
  assert.equal(_getState().discardsLeft, 0);
  assert.equal(_getState().handsLeft, 4); // untouched
});

test("The Manacle deals one fewer card for the boss round", () => {
  _setState(newState());
  _getState().round = 3;
  withBossModifier("manacle", startRound);
  assert.equal(_getState().handSize, 7);
  assert.equal(_getState().hand.length, 7);
});

test("The Wall raises the boss round's target by 50%", () => {
  _setState(newState());
  _getState().round = 3;
  _getState().ante = 1;
  withBossModifier("wall", startRound);
  // targetForRound(1, 3) is 510; *1.5 rounded to the nearest 10 is 770.
  assert.equal(_getState().target, 770);
});

test("boss round clears back to no modifier once the round ends", () => {
  _setState(newState());
  _getState().round = 3;
  withBossModifier("needle", startRound);
  assert.ok(_getState().bossModifier);

  nextRound(); // wraps to round 1 of the next ante
  assert.equal(_getState().round, 1);
  assert.equal(_getState().bossModifier, null);
  assert.equal(_getState().handSize, 8);
});

test("The Club zeroes the chip value of played clubs", () => {
  _setState(newState());
  _getState().round = 3;
  withBossModifier("club", startRound);

  const clubCard = { rank: "K", suit: "♣", id: "K♣" };
  const spadeCard = { rank: "K", suit: "♠", id: "K♠" };
  const clubResult = scoreSelection([clubCard]);
  const spadeResult = scoreSelection([spadeCard]);
  assert.equal(clubResult.chips, spadeResult.chips - 10);
});
