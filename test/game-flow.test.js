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
  KING_BOSS,
  newState,
  startRound,
  toggleCard,
  getSelectedCards,
  playHand,
  discardSelected,
  buyJester,
  sellJester,
  sellTrick,
  rerollShop,
  buyProp,
  finishRoundWin,
  PROP_POOL,
  nextRound,
  serializeRun,
  restoreRun,
  TRICK_POOL,
  DECREE_POOL,
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

test("jesters, masks and decrees can be sold mid-round, not just in the shop", () => {
  const state = freshRoundState();
  assert.equal(state.phase, "playing");
  const jester = JESTER_POOL.find(j => j.price === 5);
  state.jesters = [jester];
  state.tricks = [{ id: "m", name: "Mask", hand: "Pair", price: 4 }, { id: "d", name: "Decree", decree: true, price: 3 }];
  state.money = 0;

  sellJester(jester.id);
  sellTrick(1); // the decree, $3 -> $1
  sellTrick(0); // the mask, $4 -> $2

  const after = _getState();
  assert.equal(after.jesters.length, 0);
  assert.equal(after.tricks.length, 0);
  assert.equal(after.money, 2 + 1 + 2);
});

test("nothing can be sold once the run is over", () => {
  const state = freshRoundState();
  state.phase = "gameover";
  state.jesters = [JESTER_POOL[0]];
  state.tricks = [{ id: "m", name: "Mask", hand: "Pair", price: 4 }];
  state.money = 0;

  sellJester(JESTER_POOL[0].id);
  sellTrick(0);

  assert.equal(_getState().jesters.length, 1);
  assert.equal(_getState().tricks.length, 1);
  assert.equal(_getState().money, 0);
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

// --- Mask cards (hand levels) ---------------------------------------------

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

const propById = (id) => PROP_POOL.find(v => v.id === id);

test("buying a prop charges $8, records it, and clears the offer", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 10;
  state.shopProp = propById("extra_hand");
  buyProp();
  assert.equal(state.money, 2);
  assert.deepEqual(state.props.map(v => v.id), ["extra_hand"]);
  assert.equal(state.shopProp, null);
  buyProp(); // nothing on offer: no-op
  assert.equal(state.money, 2);
});

test("a prop can't be bought without enough money", () => {
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 7;
  state.shopProp = propById("extra_hand");
  buyProp();
  assert.equal(state.props.length, 0);
  assert.equal(state.money, 7);
});

test("hand, discard and hand-size props apply at round start", () => {
  _setState(newState());
  _getState().props = ["extra_hand", "extra_discard", "big_hand"].map(propById);
  startRound();
  const s = _getState();
  assert.equal(s.handsLeft, 5);
  assert.equal(s.discardsLeft, 4);
  assert.equal(s.handSize, 9);
});

test("Haggler lowers reroll base cost; Wide Stage adds a jester slot", () => {
  const state = freshRoundState();
  state.props = ["haggler", "wide_stage"].map(propById);
  state.jesters = JESTER_POOL.slice(0, 5).map(j => ({ ...j, sellBonus: 0 }));
  finishRoundWin();
  assert.equal(state.rerollCost, 1);
  state.money = 20;
  state.shopOffers = [JESTER_POOL[10]];
  buyJester(JESTER_POOL[10].id);
  assert.equal(state.jesters.length, 6);
});

test("the shop after round 1 rolls a prop; later shops keep it", () => {
  const state = freshRoundState();
  finishRoundWin();
  const offered = state.shopProp;
  assert.ok(offered);
  state.round = 2;
  finishRoundWin();
  assert.equal(state.shopProp, offered);
});

test("no prop is offered once all have been bought", () => {
  const state = freshRoundState();
  state.props = [...PROP_POOL];
  finishRoundWin();
  assert.equal(state.shopProp, null);
});

test("Haggler's reroll discount never drops the base cost below $1", () => {
  const state = freshRoundState();
  state.props = [propById("haggler"), { id: "x", rerollDelta: -5 }];
  finishRoundWin();
  assert.equal(state.rerollCost, 1);
});

// --- Decree cards (deck editing) ----------------------------------------------

function decreeById(id) {
  const { DECREE_POOL } = require("../game.js");
  const t = DECREE_POOL.find(t => t.id === id);
  assert.ok(t, `no such decree: ${id}`);
  return { ...t };
}

// Select the first n cards of the dealt hand and give the player a decree.
function holdDecree(id, n) {
  const state = freshRoundState();
  state.tricks.push(decreeById(id));
  state.selected = new Set(state.hand.slice(0, n).map(c => c.id));
  return state;
}

test("decree enhancement edits the card in hand and in the master deck", () => {
  const { useTrick } = require("../game.js");
  const state = holdDecree("decree_archbishop", 2);
  const ids = [...state.selected];
  useTrick(0);
  const s = _getState();
  assert.equal(s.tricks.length, 0);
  assert.equal(s.selected.size, 0);
  for (const id of ids) {
    assert.equal(s.hand.find(c => c.id === id).enh, "bonus");
    assert.equal(s.masterDeck.find(c => c.id === id).enh, "bonus");
  }
  // A fresh round's deck carries the edit forward.
  startRound();
  const all = [..._getState().deck, ..._getState().hand];
  assert.equal(all.filter(c => c.enh === "bonus").length, 2);
});

test("decree refuses to act with too many or no cards selected", () => {
  const { useTrick } = require("../game.js");
  const state = holdDecree("decree_marriage", 2); // Lovers takes 1
  useTrick(0);
  assert.equal(_getState().tricks.length, 1);
  state.selected = new Set();
  useTrick(0);
  assert.equal(_getState().tricks.length, 1);
  assert.ok(!_getState().masterDeck.some(c => c.enh));
});

test("suit-changing decree permanently changes suits", () => {
  const { useTrick } = require("../game.js");
  const state = holdDecree("decree_oath_hearts", 3);
  const ids = [...state.selected];
  useTrick(0);
  for (const id of ids) {
    assert.equal(_getState().hand.find(c => c.id === id).suit, "♥");
    assert.equal(_getState().masterDeck.find(c => c.id === id).suit, "♥");
  }
});

test("Strength raises rank by one and Ace wraps to 2", () => {
  const { useTrick } = require("../game.js");
  const state = freshRoundState();
  state.hand = [{ suit: "♠", rank: "K", id: "K♠" }, { suit: "♠", rank: "A", id: "A♠" }];
  state.masterDeck = state.hand.map(c => ({ ...c }));
  state.tricks.push(decreeById("decree_knighthood"));
  state.selected = new Set(["K♠", "A♠"]);
  useTrick(0);
  assert.equal(_getState().hand.find(c => c.id === "K♠").rank, "A");
  assert.equal(_getState().masterDeck.find(c => c.id === "A♠").rank, "2");
});

test("The Hanged Man destroys cards for the run and refills the hand", () => {
  const { useTrick } = require("../game.js");
  const state = holdDecree("decree_headsman", 2);
  const ids = [...state.selected];
  useTrick(0);
  const s = _getState();
  assert.equal(s.masterDeck.length, 50);
  assert.equal(s.hand.length, s.handSize);
  assert.ok(ids.every(id => !s.hand.some(c => c.id === id)));
  startRound();
  assert.equal(_getState().deck.length + _getState().hand.length, 50);
});

test("Bonus, Mult and Glass cards add chips, mult and X2 when scored", () => {
  const state = freshRoundState();
  state.jesters = [];
  const plain = scoreSelection([{ suit: "♠", rank: "5", id: "a" }]);
  const bonus = scoreSelection([{ suit: "♠", rank: "5", id: "a", enh: "bonus" }]);
  const mult = scoreSelection([{ suit: "♠", rank: "5", id: "a", enh: "mult" }]);
  const glass = scoreSelection([{ suit: "♠", rank: "5", id: "a", enh: "glass" }]);
  assert.equal(bonus.chips - plain.chips, 30);
  assert.equal(mult.mult - plain.mult, 4);
  assert.equal(glass.multMul, 2);
});

test("a Wild card completes a flush and counts for suit jesters", () => {
  const { evaluateHand } = require("../game.js");
  const state = freshRoundState();
  const hand = [
    { suit: "♠", rank: "2", id: "a" }, { suit: "♠", rank: "5", id: "b" },
    { suit: "♠", rank: "9", id: "c" }, { suit: "♠", rank: "J", id: "d" },
    { suit: "♥", rank: "K", id: "e", enh: "wild" },
  ];
  assert.equal(evaluateHand(hand).name, "Flush");
  hand[4] = { ...hand[4], enh: undefined };
  assert.equal(evaluateHand(hand).name, "High Card");
  state.jesters = [{ ...jesterById("greedy_jester") }];
  const lone = [{ suit: "♠", rank: "5", id: "a", enh: "wild" }];
  assert.equal(scoreSelection(lone).mult, 1 + 3);
});

test("a played Glass card can shatter and is removed from the run", () => {
  const state = freshRoundState();
  const target = state.hand[0];
  target.enh = "glass";
  state.masterDeck.find(c => c.id === target.id).enh = "glass";
  state.selected = new Set([target.id]);
  withMockedRandom(0.1, () => playHand());
  assert.ok(!_getState().masterDeck.some(c => c.id === target.id));
  assert.equal(_getState().masterDeck.length, 51);
});

test("a played Glass card survives when the roll misses", () => {
  const state = freshRoundState();
  const target = state.hand[0];
  target.enh = "glass";
  state.masterDeck.find(c => c.id === target.id).enh = "glass";
  state.selected = new Set([target.id]);
  withMockedRandom(0.9, () => playHand());
  assert.equal(_getState().masterDeck.length, 52);
});

test("buyDecree respects money and trick slots; decrees can be sold", () => {
  const { buyDecree, sellTrick, DECREE_POOL } = require("../game.js");
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 10;
  state.shopDecrees = [DECREE_POOL[0], DECREE_POOL[1], DECREE_POOL[2]];
  buyDecree(DECREE_POOL[0].id);
  buyDecree(DECREE_POOL[1].id);
  buyDecree(DECREE_POOL[2].id); // slots full
  assert.equal(_getState().tricks.length, 2);
  assert.equal(_getState().money, 4);
  sellTrick(0);
  assert.equal(_getState().money, 5);
});

test("decree pack: pick goes to a slot instead of being used, blocked when full", () => {
  const { buyPack, pickFromPack } = require("../game.js");
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 10;
  state.decreePackAvailable = true;
  buyPack("decree");
  assert.equal(_getState().money, 6);
  assert.equal(_getState().decreePackAvailable, false);
  assert.equal(_getState().pack.length, 3);
  assert.ok(_getState().pack.every(t => t.decree));
  state.tricks.push(decreeById("decree_oath_diamonds"), decreeById("decree_oath_clubs")); // full
  pickFromPack(_getState().pack[0].id);
  assert.ok(_getState().pack, "pack stays open when slots are full");
  state.tricks.pop();
  pickFromPack(_getState().pack[0].id);
  assert.equal(_getState().tricks.length, 2);
  assert.equal(_getState().pack, null);
});

test("finishRoundWin stocks the shop with decree offers and a decree pack", () => {
  const state = freshRoundState();
  finishRoundWin();
  assert.equal(_getState().shopDecrees.length, 2);
  assert.equal(_getState().decreePackAvailable, true);
  assert.ok(state);
});

// --- Shop action guards --------------------------------------------------------
// Each action silently ignores a call that can't legally happen (wrong phase,
// unknown id, no money, no room); these pin that none of them change state.

function shopState(overrides = {}) {
  const state = freshRoundState();
  state.phase = "shop";
  state.money = 20;
  return Object.assign(state, overrides);
}

test("buyJester ignores unknown ids, unaffordable offers and a full roster", () => {
  const { buyJester } = require("../game.js");
  const [a, b, c] = JESTER_POOL;
  const state = shopState({ shopOffers: [a, b] });
  buyJester("nope");
  assert.equal(state.jesters.length, 0);
  state.money = 0;
  buyJester(a.id);
  assert.equal(state.jesters.length, 0);
  state.money = 50;
  state.jesters = Array.from({ length: 5 }, () => ({ ...c }));
  buyJester(a.id);
  assert.equal(state.jesters.length, 5);
  assert.equal(state.money, 50);
});

test("sellJester ignores unknown ids and calls after the run is over", () => {
  const { sellJester } = require("../game.js");
  const state = shopState({ jesters: [{ ...JESTER_POOL[0], sellBonus: 0 }] });
  sellJester("nope");
  assert.equal(state.jesters.length, 1);
  state.phase = "gameover";
  sellJester(JESTER_POOL[0].id);
  assert.equal(state.jesters.length, 1);
  assert.equal(state.money, 20);
});

test("buyTrick and buyDecree ignore unknown ids, unaffordable offers and calls outside the shop", () => {
  const { buyTrick, buyDecree, TRICK_POOL, DECREE_POOL } = require("../game.js");
  const state = shopState({ shopTricks: [TRICK_POOL[0]], shopDecrees: [DECREE_POOL[0]] });
  buyTrick("nope");
  buyDecree("nope");
  state.money = 0;
  buyTrick(TRICK_POOL[0].id);
  buyDecree(DECREE_POOL[0].id);
  state.money = 20;
  state.phase = "playing";
  buyTrick(TRICK_POOL[0].id);
  buyDecree(DECREE_POOL[0].id);
  assert.equal(state.tricks.length, 0);
  assert.equal(state.money, 20);
});

test("sellTrick ignores calls after the run is over and bad indexes", () => {
  const { sellTrick } = require("../game.js");
  const state = shopState({ tricks: [decreeById("decree_oath_diamonds")] });
  sellTrick(5);
  state.phase = "gameover";
  sellTrick(0);
  assert.equal(state.tricks.length, 1);
  assert.equal(state.money, 20);
});

test("useTrick ignores a bad index and does nothing while a pack is open", () => {
  const { useTrick, TRICK_POOL } = require("../game.js");
  const state = freshRoundState();
  state.tricks.push({ ...TRICK_POOL[0] });
  useTrick(3);
  state.pack = [TRICK_POOL[1]];
  useTrick(0);
  assert.equal(state.tricks.length, 1);
  assert.equal(state.handLevels[TRICK_POOL[0].hand], undefined);
});

test("a decree can't be used from the shop, with a pack open, or in the debug shop", () => {
  const { useTrick } = require("../game.js");
  const state = holdDecree("decree_oath_hearts", 1);
  state.debugShop = true;
  useTrick(0);
  state.debugShop = false;
  state.phase = "shop";
  useTrick(0);
  assert.equal(state.tricks.length, 1);
  assert.ok(!state.masterDeck.some(c => c.suit === "♥" && c.enh));
});

test("buyPack ignores calls outside the shop, a sold-out pack, an open pack and no money", () => {
  const { buyPack } = require("../game.js");
  const state = shopState({ packAvailable: true, decreePackAvailable: false });
  buyPack("decree"); // decree pack already bought
  state.money = 1;
  buyPack(); // can't afford
  state.money = 20;
  state.pack = [];
  buyPack(); // a pack is already open
  state.pack = null;
  state.phase = "playing";
  buyPack();
  assert.equal(state.money, 20);
  assert.equal(state.pack, null);
  assert.equal(state.packAvailable, true);
});

test("pickFromPack ignores a missing pack and an id that isn't in it", () => {
  const { pickFromPack, TRICK_POOL } = require("../game.js");
  const state = shopState();
  pickFromPack("nope");
  state.pack = [TRICK_POOL[0]];
  pickFromPack("nope");
  assert.equal(state.pack.length, 1);
  assert.equal(state.handLevels[TRICK_POOL[0].hand], undefined);
});

test("the free reroll from Chaos the Clown costs nothing once per shop visit", () => {
  const state = shopState({ jesters: [{ ...jesterById("chaos_the_clown") }], money: 0 });
  rerollShop();
  assert.equal(state.money, 0);
  assert.equal(state.freeRerollUsed, true);
  rerollShop(); // no longer free and no money
  assert.equal(state.money, 0);
  assert.equal(state.rerollCost, 2);
});

test("moveJester reorders in place, clamps out-of-range targets and ignores unknown ids", () => {
  const { moveJester } = require("../game.js");
  const [a, b, c] = JESTER_POOL;
  const state = shopState({ jesters: [a, b, c].map(j => ({ ...j, sellBonus: 0 })) });
  const ids = () => state.jesters.map(j => j.id);
  moveJester(c.id, 0);
  assert.deepEqual(ids(), [c.id, a.id, b.id]);
  moveJester(c.id, 2);
  assert.deepEqual(ids(), [a.id, b.id, c.id]);
  moveJester(a.id, 99);
  assert.deepEqual(ids(), [b.id, c.id, a.id]);
  moveJester(a.id, -5);
  assert.deepEqual(ids(), [a.id, b.id, c.id]);
  moveJester(b.id, 1); // same slot: no-op
  moveJester("nope", 0);
  assert.deepEqual(ids(), [a.id, b.id, c.id]);
  assert.equal(state.money, 20);
});

test("moveJester keeps each jester's per-run data (sellBonus) with it", () => {
  const { moveJester } = require("../game.js");
  const [a, b] = JESTER_POOL;
  const state = shopState({ jesters: [{ ...a, sellBonus: 3 }, { ...b, sellBonus: 0 }] });
  moveJester(a.id, 1);
  assert.equal(state.jesters[1].id, a.id);
  assert.equal(state.jesters[1].sellBonus, 3);
});

// --- Court bosses ---------------------------------------------------------------

test("The Tax Collector takes $1 per hand played, but never from a broke player", () => {
  const state = freshRoundState();
  state.bossModifier = BOSS_MODIFIERS.find(m => m.id === "tax");
  state.target = Number.MAX_SAFE_INTEGER;
  state.money = 5;
  toggleCard(state.hand[0].id);
  playHand();
  assert.equal(_getState().money, 4);
  state.money = 0;
  toggleCard(state.hand[0].id);
  playHand();
  assert.equal(_getState().money, 0);
});

test("The Poet Laureate refuses a repeated hand type this round", () => {
  const state = freshRoundState();
  state.bossModifier = BOSS_MODIFIERS.find(m => m.id === "laureate");
  state.target = Number.MAX_SAFE_INTEGER;
  state.hand = [{ suit: "♠", rank: "2", id: "a" }, { suit: "♥", rank: "9", id: "b" }];
  toggleCard("a");
  playHand();
  assert.equal(_getState().handsLeft, 3);
  toggleCard("b");
  playHand(); // another High Card: blocked
  assert.equal(_getState().handsLeft, 3);
  assert.ok(_getState().hand.some(c => c.id === "b"), "the blocked card stays in hand");
});

test("The Bishop zeroes the chip value of played face cards", () => {
  const state = freshRoundState();
  state.bossModifier = BOSS_MODIFIERS.find(m => m.id === "bishop");
  const { scoreSelection } = require("../game.js");
  const king = scoreSelection([{ suit: "♠", rank: "K", id: "k" }]);
  const five = scoreSelection([{ suit: "♠", rank: "5", id: "f" }]);
  assert.equal(king.chips, 5); // High Card base only
  assert.equal(five.chips, 10);
});

test("The Spymaster silences the leftmost jester", () => {
  const state = freshRoundState();
  const { scoreSelection } = require("../game.js");
  const jolly = JESTER_POOL.find(j => j.id === "greedy_jester" || j.id === "base_jester");
  state.jesters = [{ ...jolly, sellBonus: 0 }];
  const card = [{ suit: "♦", rank: "5", id: "d" }];
  const before = scoreSelection(card).total;
  state.bossModifier = BOSS_MODIFIERS.find(m => m.id === "spymaster");
  const after = scoreSelection(card).total;
  assert.ok(before > after);
});

test("the last round of the last ante is always The King", () => {
  _setState(newState());
  _getState().ante = 8;
  _getState().round = 3;
  startRound();
  assert.equal(_getState().bossModifier, KING_BOSS);
  assert.equal(_getState().handsLeft, 3);
  assert.ok(!BOSS_MODIFIERS.includes(KING_BOSS));
});

// --- run persistence (the serialize/restore round trip; no storage involved) ---

// Pushes the fresh state through real JSON, the way localStorage would.
function roundTrip(state) {
  return restoreRun(JSON.parse(JSON.stringify(serializeRun(state))));
}

function savedShopState() {
  const state = freshRoundState();
  state.jesters = [{ ...JESTER_POOL[0], sellBonus: 3 }, { ...JESTER_POOL[1], sellBonus: 0 }];
  state.tricks = [{ ...TRICK_POOL[2] }, { ...DECREE_POOL[0] }];
  state.props = [PROP_POOL[0]];
  state.handLevels = { Pair: 3 };
  state.money = 17;
  state.target = 1;
  state.masterDeck[0] = { ...state.masterDeck[0], enh: "glass" };
  state.removed = [state.masterDeck.pop()];
  finishRoundWin();
  return state;
}

test("a shop save restores the run, offers, and owned cards", () => {
  const before = savedShopState();
  assert.equal(before.phase, "shop");
  const after = roundTrip(before);
  assert.equal(after.phase, "shop");
  for (const key of ["ante", "round", "money", "target", "rerollCost", "jestersSold", "packAvailable", "handLevels"]) {
    assert.deepEqual(after[key], before[key], key);
  }
  assert.deepEqual(after.jesters.map(j => [j.id, j.sellBonus]), before.jesters.map(j => [j.id, j.sellBonus]));
  assert.equal(typeof after.jesters[0].apply === "function" || typeof after.jesters[0].roundEnd === "function", true);
  assert.deepEqual(after.tricks.map(t => t.id), before.tricks.map(t => t.id));
  assert.equal(typeof after.tricks[1].apply, "function"); // the decree keeps its effect
  assert.deepEqual(after.props, before.props);
  assert.deepEqual(after.shopOffers.map(j => j.id), before.shopOffers.map(j => j.id));
  assert.deepEqual(after.shopTricks.map(j => j.id), before.shopTricks.map(j => j.id));
  assert.deepEqual(after.shopDecrees.map(j => j.id), before.shopDecrees.map(j => j.id));
  assert.equal(after.shopProp?.id ?? null, before.shopProp?.id ?? null);
  assert.deepEqual(after.masterDeck, before.masterDeck); // enhancements survive
  assert.deepEqual(after.removed, before.removed);
  assert.deepEqual(after.lastEarnings, before.lastEarnings);
});

test("an open pack is restored with the same cards", () => {
  const before = savedShopState();
  before.pack = DECREE_POOL.slice(0, 3);
  before.packKind = "decree";
  assert.deepEqual(roundTrip(before).pack.map(c => c.id), before.pack.map(c => c.id));
});

test("a saved boss round resumes with the same boss", () => {
  const state = freshRoundState();
  state.round = 3;
  state.bossModifier = BOSS_MODIFIERS.find(m => m.id === "water");
  const saved = roundTrip(state);
  assert.equal(saved.bossModifier, state.bossModifier);
  _setState(saved);
  startRound(saved.bossModifier);
  assert.equal(_getState().bossModifier.id, "water");
  assert.equal(_getState().discardsLeft, 0);
  assert.equal(_getState().hand.length, _getState().handSize);
});

test("a bad save is rejected rather than half restored", () => {
  const good = JSON.parse(JSON.stringify(serializeRun(savedShopState())));
  const bad = (patch) => restoreRun({ ...good, ...patch });
  assert.ok(restoreRun(good));
  assert.equal(restoreRun(null), null);
  assert.equal(bad({ v: 99 }), null);
  assert.equal(bad({ phase: "gameover" }), null);
  assert.equal(bad({ money: "lots" }), null);
  assert.equal(bad({ jesters: [{ id: "no_such_jester" }] }), null);
  assert.equal(bad({ props: "nope" }), null);
  assert.equal(bad({ handLevels: { "Royal Marmalade": 2 } }), null);
  assert.equal(bad({ masterDeck: [{ id: "x", suit: "?", rank: "2" }] }), null);
  assert.equal(bad({ boss: "no_such_boss" }), null);
});

test("a round in progress resumes with the same deck, hand, score and plays left", () => {
  const state = freshRoundState();
  state.target = Number.MAX_SAFE_INTEGER;
  state.hand.slice(0, 3).forEach(c => toggleCard(c.id));
  playHand();
  state.hand.slice(0, 2).forEach(c => toggleCard(c.id));
  discardSelected();
  state.money = 9;

  const after = roundTrip(state);
  assert.equal(after.phase, "playing");
  for (const key of ["deck", "hand", "played", "discarded", "roundScore", "handsLeft", "discardsLeft", "money", "target", "discardsUsed"]) {
    assert.deepEqual(after[key], state[key], key);
  }
  assert.deepEqual([...after.handTypesPlayed], [...state.handTypesPlayed]);
  assert.equal(after.played.length, 3);
  assert.equal(after.discarded.length, 2);
  assert.equal(after.deck.length + after.hand.length + after.played.length + after.discarded.length, 52);
  assert.equal(after.selected.size, 0);
});

test("a round that hasn't dealt yet saves no round state", () => {
  const state = freshRoundState();
  state.hand = [];
  assert.equal(serializeRun(state).roundState, null);
});

test("a bad round state is rejected", () => {
  const state = freshRoundState();
  const good = JSON.parse(JSON.stringify(serializeRun(state)));
  assert.ok(restoreRun(good));
  const bad = (patch) => restoreRun({ ...good, roundState: { ...good.roundState, ...patch } });
  assert.equal(bad({ hand: [{ id: "x", suit: "?", rank: "2" }] }), null);
  assert.equal(bad({ deck: "nope" }), null);
  assert.equal(bad({ discardsUsed: "many" }), null);
  assert.equal(bad({ handTypesPlayed: ["Royal Marmalade"] }), null);
  assert.equal(bad({ handTypesPlayed: "Pair" }), null);
  assert.equal(restoreRun({ ...good, phase: "shop" }), null);
});
