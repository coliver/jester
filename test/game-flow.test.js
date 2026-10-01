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
  buyVoucher,
  finishRoundWin,
  VOUCHER_POOL,
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

test("played and discarded cards are tracked per round for the deck view", () => {
  const state = freshRoundState();
  const [a, b, c] = state.hand.slice(0, 3).map(x => x.id);
  toggleCard(a);
  playHand();
  toggleCard(b);
  toggleCard(c);
  discardSelected();

  const after = _getState();
  assert.deepEqual(after.played.map(x => x.id), [a]);
  assert.deepEqual(after.discarded.map(x => x.id), [b, c]);

  startRound();
  assert.equal(_getState().played.length, 0);
  assert.equal(_getState().discarded.length, 0);
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

test("selling a jester increments the run's jestersSold counter", () => {
  const state = freshRoundState();
  state.phase = "shop";
  const jester = JESTER_POOL.find(j => j.price === 5);
  state.jesters = [jester];
  state.jestersSold = 2;

  sellJester(jester.id);

  assert.equal(_getState().jestersSold, 3);
});

test("jestersSold resets to 0 when a boss round (round 3) is cleared", () => {
  const state = freshRoundState();
  state.round = 3; // ROUNDS_PER_ANTE
  state.target = 1;
  state.jestersSold = 4;
  const id = state.hand[0].id;
  toggleCard(id);

  playHand();

  assert.equal(_getState().phase, "shop");
  assert.equal(_getState().jestersSold, 0);
});

test("jestersSold carries over after a non-boss round win", () => {
  const state = freshRoundState();
  state.round = 1;
  state.target = 1;
  state.jestersSold = 4;
  const id = state.hand[0].id;
  toggleCard(id);

  playHand();

  assert.equal(_getState().phase, "shop");
  assert.equal(_getState().jestersSold, 4);
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
  // The random shop offer may be a hand-size jester (Juggler), so the next
  // deal is 8 plus whatever the bought jester (if any) adds.
  const handSizeBonus = after.jesters.reduce((sum, j) => sum + (j.handSizeDelta || 0), 0);
  assert.equal(after.hand.length, 8 + handSizeBonus);
});

// --- ported Balatro jesters, round 2: new engine plumbing -----------------

function jesterById(id) {
  const j = JESTER_POOL.find(j => j.id === id);
  assert.ok(j, `no such jester: ${id}`);
  return j;
}

test("Delayed Gratification pays $2 per unused discard if none were used", () => {
  const state = freshRoundState();
  state.target = 1;
  state.jesters = [jesterById("delayed_gratification")];
  toggleCard(state.hand[0].id);

  playHand();

  assert.equal(_getState().lastEarnings.bonus, 2 * 3); // START_DISCARDS(3), none used
});

test("Delayed Gratification pays nothing once a discard has been used", () => {
  const state = freshRoundState();
  state.jesters = [jesterById("delayed_gratification")];
  toggleCard(state.hand[0].id);
  discardSelected();

  const after = _getState();
  after.target = 1;
  toggleCard(after.hand[0].id);
  playHand();

  assert.equal(_getState().lastEarnings.bonus, 0);
});

test("To the Moon doubles the interest earned at round end", () => {
  const state = freshRoundState();
  state.target = 1;
  state.money = 23; // floor(23/5) = 4 base interest
  state.jesters = [jesterById("to_the_moon")];
  toggleCard(state.hand[0].id);

  playHand();

  const after = _getState();
  assert.equal(after.lastEarnings.interest, 4);
  assert.equal(after.lastEarnings.bonus, 4);
});

test("Golden Jester pays a flat $4 at round end", () => {
  const state = freshRoundState();
  state.target = 1;
  state.jesters = [jesterById("golden_jester")];
  toggleCard(state.hand[0].id);

  playHand();

  assert.equal(_getState().lastEarnings.bonus, 4);
});

test("Cavendish gives X3 Mult and can be destroyed by its round-end roll", () => {
  const state = freshRoundState();
  state.target = 1;
  state.jesters = [jesterById("cavendish")];
  toggleCard(state.hand[0].id);

  withMockedRandom(0, () => playHand()); // always hits the 1-in-1000 destroy chance

  assert.equal(_getState().jesters.length, 0);
});

test("Cavendish usually survives round end", () => {
  const state = freshRoundState();
  state.target = 1;
  state.jesters = [jesterById("cavendish")];
  toggleCard(state.hand[0].id);

  withMockedRandom(0.5, () => playHand());

  assert.equal(_getState().jesters.length, 1);
});

test("Juggler adds 1 to hand size", () => {
  _setState(newState());
  _getState().jesters = [jesterById("juggler")];
  startRound();
  assert.equal(_getState().handSize, 9);
  assert.equal(_getState().hand.length, 9);
});

test("Drunkard adds 1 discard per round", () => {
  _setState(newState());
  _getState().jesters = [jesterById("drunkard")];
  startRound();
  assert.equal(_getState().discardsLeft, 4); // START_DISCARDS(3) + 1
});

test("Credit Card allows buying into debt, down to -$20", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.jesters = [jesterById("credit_card")];
  const jester = jesterById("juggler");
  state.shopOffers = [jester];
  state.money = 0;

  buyJester(jester.id);

  assert.equal(_getState().money, -jester.price);
});

test("Credit Card still blocks a purchase that would exceed -$20 debt", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.jesters = [jesterById("credit_card")];
  const jester = jesterById("baron"); // price 8
  state.shopOffers = [jester];
  state.money = -19; // buying would land at -27, past the -20 floor

  buyJester(jester.id);

  assert.equal(_getState().jesters.some(j => j.id === "baron"), false);
  assert.equal(_getState().money, -19);
});

test("Chaos the Clown makes only the first reroll of a shop visit free", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.jesters = [jesterById("chaos_the_clown")];
  state.money = 0;
  state.rerollCost = 2;

  rerollShop();
  assert.equal(_getState().money, 0); // free
  assert.equal(_getState().rerollCost, 2); // doesn't escalate on the free reroll
  assert.equal(_getState().freeRerollUsed, true);

  _getState().money = 2;
  rerollShop(); // second reroll costs normally
  assert.equal(_getState().money, 0);
  assert.equal(_getState().rerollCost, 3);
});

test("Faceless Jester pays $5 when 3+ face cards are discarded together", () => {
  const state = freshRoundState();
  state.jesters = [jesterById("faceless_jester")];
  state.money = 0;
  state.hand = [
    { rank: "J", suit: "♠", id: "J♠" },
    { rank: "Q", suit: "♥", id: "Q♥" },
    { rank: "K", suit: "♦", id: "K♦" },
    { rank: "2", suit: "♣", id: "2♣" },
  ];
  for (const id of ["J♠", "Q♥", "K♦"]) toggleCard(id);

  discardSelected();

  assert.equal(_getState().money, 5);
});

test("Faceless Jester pays nothing for fewer than 3 discarded face cards", () => {
  const state = freshRoundState();
  state.jesters = [jesterById("faceless_jester")];
  state.money = 0;
  state.hand = [
    { rank: "J", suit: "♠", id: "J♠" },
    { rank: "Q", suit: "♥", id: "Q♥" },
    { rank: "2", suit: "♦", id: "2♦" },
  ];
  for (const id of ["J♠", "Q♥"]) toggleCard(id);

  discardSelected();

  assert.equal(_getState().money, 0);
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

// --- round-end jesters: Egg, Gros Michel, Cloud 9, Rocket, Gift Card -------
// Owned jesters that change over the run are per-instance copies (as buyJester
// makes them) so tests don't mutate the shared JESTER_POOL entries.

function clearRoundWith(jesters, { round } = {}) {
  const state = freshRoundState();
  state.target = 1;
  if (round) state.round = round;
  state.jesters = jesters;
  toggleCard(state.hand[0].id);
  playHand();
  return _getState();
}

test("buyJester gives the owned jester its own copy, so sell value can change", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 50;
  state.shopOffers = [jesterById("egg")];
  buyJester("egg");
  const owned = _getState().jesters[0];
  assert.notEqual(owned, jesterById("egg"));
  assert.equal(owned.sellBonus, 0);
});

test("Egg gains $3 of sell value each round cleared", () => {
  const egg = { ...jesterById("egg"), sellBonus: 0 };
  clearRoundWith([egg]);
  assert.equal(egg.sellBonus, 3);
  assert.equal(jesterById("egg").sellBonus, undefined);
});

test("Gift Card adds $1 of sell value to every owned jester, itself included", () => {
  const gift = { ...jesterById("gift_card"), sellBonus: 0 };
  const other = { ...jesterById("base_jester"), sellBonus: 0 };
  clearRoundWith([gift, other]);
  assert.equal(gift.sellBonus, 1);
  assert.equal(other.sellBonus, 1);
});

test("sold jesters refund their base value plus accumulated sell bonus", () => {
  const egg = { ...jesterById("egg"), sellBonus: 6 };
  const state = clearRoundWith([egg]);
  const before = state.money;
  sellJester("egg");
  assert.equal(_getState().money, before + 2 + 9); // floor(4/2) + (6 + 3 from this round)
});

test("Cloud 9 pays $1 per 9 in the deck", () => {
  assert.equal(clearRoundWith([{ ...jesterById("cloud_9") }]).lastEarnings.bonus, 4);
});

test("Rocket pays $1 at round end and $2 more per boss round cleared", () => {
  const rocket = { ...jesterById("rocket") };
  assert.equal(clearRoundWith([rocket]).lastEarnings.bonus, 1);
  assert.equal(clearRoundWith([rocket], { round: 3 }).lastEarnings.bonus, 1); // boss: pays 1, then rises
  assert.equal(rocket.rocketPayout, 3);
  assert.equal(clearRoundWith([rocket]).lastEarnings.bonus, 3);
});

test("Gros Michel gives +15 Mult and can be destroyed by its 1-in-6 round-end roll", () => {
  const card = freshRoundState().hand[0];
  const base = scoreSelection([card]).mult;
  _getState().jesters = [jesterById("gros_michel")];
  assert.equal(scoreSelection([card]).mult, base + 15);

  clearRoundWith([{ ...jesterById("gros_michel") }]); // random unmocked: just must not throw
  const state = freshRoundState();
  state.target = 1;
  state.jesters = [{ ...jesterById("gros_michel") }];
  toggleCard(state.hand[0].id);
  withMockedRandom(0, () => playHand());
  assert.equal(_getState().jesters.length, 0);
});

// --- Trick cards (hand levels) ---------------------------------------------

test("using a trick card levels its hand and raises base chips/mult", () => {
  const { TRICK_POOL, evaluateHand, useTrick } = require("../game.js");
  const state = freshRoundState();
  const pair = [{ suit: "♠", rank: "5", id: "5♠" }, { suit: "♥", rank: "5", id: "5♥" }];
  assert.equal(evaluateHand(pair).baseChips, 10);
  state.tricks.push({ ...TRICK_POOL.find(t => t.hand === "Pair") });
  useTrick(0);
  const after = evaluateHand(pair);
  assert.equal(after.baseChips, 25);
  assert.equal(after.baseMult, 3);
  assert.equal(_getState().tricks.length, 0);
});

test("buyTrick respects money and the trick slot limit; sellTrick refunds half", () => {
  const { TRICK_POOL, buyTrick, sellTrick } = require("../game.js");
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 20;
  state.shopTricks = [TRICK_POOL[0], TRICK_POOL[1], TRICK_POOL[2]];
  buyTrick(TRICK_POOL[0].id);
  buyTrick(TRICK_POOL[1].id);
  buyTrick(TRICK_POOL[2].id); // slots full
  assert.equal(_getState().tricks.length, 2);
  assert.equal(_getState().money, 14);
  sellTrick(0);
  assert.equal(_getState().money, 15);
});

test("trick pack: costs money, picking one levels its hand", () => {
  const { buyPack, pickFromPack } = require("../game.js");
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 10;
  state.packAvailable = true;
  buyPack();
  assert.equal(_getState().money, 6);
  assert.equal(_getState().pack.length, 3);
  const pick = _getState().pack[0];
  pickFromPack(pick.id);
  assert.equal(_getState().handLevels[pick.hand], 2);
  assert.equal(_getState().pack, null);
  assert.equal(_getState().packAvailable, false);
});

test("Constellation gains X0.1 Mult per trick used", () => {
  const { TRICK_POOL, useTrick } = require("../game.js");
  const state = freshRoundState();
  state.jesters = [{ ...jesterById("constellation") }];
  const cards = [{ suit: "♠", rank: "5", id: "5♠" }];
  const before = scoreSelection(cards).multMul;
  state.tricks.push({ ...TRICK_POOL[0] }, { ...TRICK_POOL[1] });
  useTrick(0);
  useTrick(0);
  assert.equal(before, 1);
  assert.ok(Math.abs(scoreSelection(cards).multMul - 1.2) < 1e-9);
});

test("Space Jester levels the played hand when its 1-in-4 roll hits", () => {
  const state = freshRoundState();
  state.jesters = [{ ...jesterById("space_jester") }];
  state.hand = [{ suit: "♠", rank: "5", id: "5♠" }];
  state.selected = new Set(["5♠"]);
  withMockedRandom(0.1, () => playHand());
  assert.equal(_getState().handLevels["High Card"], 2);
});

const voucherById = (id) => VOUCHER_POOL.find(v => v.id === id);

test("buying a voucher charges $8, records it, and clears the offer", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 10;
  state.shopVoucher = voucherById("extra_hand");
  buyVoucher();
  assert.equal(state.money, 2);
  assert.deepEqual(state.vouchers.map(v => v.id), ["extra_hand"]);
  assert.equal(state.shopVoucher, null);
  buyVoucher(); // nothing on offer: no-op
  assert.equal(state.money, 2);
});

test("a voucher can't be bought without enough money", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 7;
  state.shopVoucher = voucherById("extra_hand");
  buyVoucher();
  assert.equal(state.vouchers.length, 0);
  assert.equal(state.money, 7);
});

test("hand, discard and hand-size vouchers apply at round start", () => {
  _setState(newState());
  _getState().vouchers = ["extra_hand", "extra_discard", "big_hand"].map(voucherById);
  startRound();
  const s = _getState();
  assert.equal(s.handsLeft, 5);
  assert.equal(s.discardsLeft, 4);
  assert.equal(s.handSize, 9);
});

test("Haggler lowers reroll base cost; Wide Stage adds a jester slot", () => {
  const state = freshRoundState();
  state.vouchers = ["haggler", "wide_stage"].map(voucherById);
  state.jesters = JESTER_POOL.slice(0, 5).map(j => ({ ...j, sellBonus: 0 }));
  finishRoundWin();
  assert.equal(state.rerollCost, 1);
  state.money = 20;
  state.shopOffers = [JESTER_POOL[10]];
  buyJester(JESTER_POOL[10].id);
  assert.equal(state.jesters.length, 6);
});

test("the shop after round 1 rolls a voucher; later shops keep it", () => {
  const state = freshRoundState();
  finishRoundWin();
  const offered = state.shopVoucher;
  assert.ok(offered);
  state.round = 2;
  finishRoundWin();
  assert.equal(state.shopVoucher, offered);
});

test("no voucher is offered once all have been bought", () => {
  const state = freshRoundState();
  state.vouchers = [...VOUCHER_POOL];
  finishRoundWin();
  assert.equal(state.shopVoucher, null);
});

test("Haggler's reroll discount never drops the base cost below $1", () => {
  const state = freshRoundState();
  state.vouchers = [voucherById("haggler"), { id: "x", rerollDelta: -5 }];
  finishRoundWin();
  assert.equal(state.rerollCost, 1);
});
