// UI/wiring tests: render()/renderOverlay()/initApp() and the DOM event
// wiring that connects buttons to actions — the layer game-flow.test.js
// can't reach (it drives the state machine directly, without a DOM).
//
// jsdom's own `window.eval()` runs code in a separate V8 context that
// Node's coverage instrumentation can't see, so code executed that way
// never shows up as covered even when the tests genuinely exercise it.
// Instead: build one jsdom document from the real index.html, attach it to
// Node's own `global.document`/`global.window`, and load the game's scripts with
// `require("../tools/load-game.js")` — that runs them in the same (instrumented)
// context node:test tracks,
// while still getting a real DOM (querySelector, classList, click/dispatch)
// instead of a hand-rolled fake.
"use strict";

// Everything no-ops except isMuted/toggleMuted, which keep real state so
// the mute-button test below has something meaningful to check.
let soundMuted = false;
global.Sound = new Proxy(
  {
    isMuted: () => soundMuted,
    toggleMuted: () => { soundMuted = !soundMuted; return soundMuted; },
    setMuted: (v) => { soundMuted = v; },
  },
  { get: (target, prop) => (prop in target ? target[prop] : () => {}) },
);

const { test, before, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const dom = new JSDOM(HTML, { url: "https://example.test/jester/" });
global.window = dom.window;
global.document = dom.window.document;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// A drag release leaves a one-shot listener on the card to swallow the click that follows it,
// removed on the next tick. Cards are reused between tests, so let that tick pass after each one;
// otherwise a later test's first click on the same card is swallowed.
afterEach(() => new Promise((resolve) => setTimeout(resolve, 2)));

const DEAL_ANIMATION_MS = 450;
const PLAY_WAIT_MS = 430; // Play Hand shows the cards in the play area for 380ms first // startRound()'s real deal delay is 420ms

// document/window are on the global now, so this require() runs the game's
// real browser entry point (initApp(): wires the buttons below once for the
// whole file, deals an initial hand via the animated setTimeout path, etc).
const gameModule = require("../tools/load-game.js");

// The pending initial deal (scheduled by the require() above) must settle
// before any test runs — otherwise it can fire mid-test and clobber
// whatever state that test just injected via dealtState().
before(() => sleep(DEAL_ANIMATION_MS));

function text(id) {
  return document.getElementById(id).textContent;
}

function jesterByName(name) {
  const j = gameModule.JESTER_POOL.find((j) => j.name === name);
  assert.ok(j, `no such jester: ${name}`);
  return j;
}

// Directly injects a fully-dealt "just started a round" state and
// re-renders, instead of going through startRound()'s ~420ms deal
// animation — keeps most tests fast and deterministic. The dedicated
// "startRound deals..." test below exercises the real animated path.
function dealtState(overrides = {}) {
  const deck = gameModule.freshDeck();
  const hand = deck.splice(deck.length - 8, 8);
  const s = Object.assign(gameModule.newState(), { deck, hand, phase: "playing" }, overrides);
  gameModule._setState(s);
  gameModule.render();
  return s;
}

// --- initial render (from the real require()-time init) -------------------

test("initial render: HUD, dealt hand, hand reference, and disabled buttons", () => {
  assert.equal(text("ante-val"), "1");
  assert.equal(text("round-val"), "1");
  assert.equal(text("hands-val"), "4");
  assert.equal(text("discards-val"), "3");
  assert.equal(text("money-val"), "4");

  assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
  assert.equal(document.querySelectorAll("#hand-reference-list li").length, gameModule.HAND_TYPES.length);

  assert.equal(document.getElementById("play-btn").disabled, true);
  assert.equal(document.getElementById("discard-btn").disabled, true);
  assert.ok(document.getElementById("overlay").classList.contains("hidden"));
});

test("mute button reflects Sound.isMuted() and toggles it", () => {
  const muteBtn = document.getElementById("mute-btn");
  const initiallyMuted = muteBtn.textContent === "🔇";
  muteBtn.click();
  assert.equal(muteBtn.textContent, initiallyMuted ? "🔊" : "🔇");
  assert.equal(muteBtn.getAttribute("aria-label"), initiallyMuted ? "Mute sound" : "Unmute sound");
  muteBtn.click(); // restore, so later tests see a consistent starting point
});

test("startRound deals after the shuffle animation, not immediately", async () => {
  gameModule.startRound();
  assert.equal(gameModule._getState().hand.length, 0); // not dealt yet
  await sleep(DEAL_ANIMATION_MS);
  assert.equal(gameModule._getState().hand.length, 8);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
});

// --- selection, preview, and button disabled state -------------------------

test("selecting a card updates aria-pressed, the preview, and enables play/discard", () => {
  dealtState();

  // render() rebuilds #hand-row's children from scratch on every call, so
  // any card element reference is only valid until the next click — always
  // re-query after an action. Selection doesn't change card order, so
  // "the first card" consistently refers to the same underlying card.
  document.querySelector("#hand-row .card").click();
  let card = document.querySelector("#hand-row .card");
  assert.equal(card.getAttribute("aria-pressed"), "true");
  assert.ok(card.classList.contains("selected"));
  assert.notEqual(text("preview-name").trim(), "");
  assert.equal(document.getElementById("play-btn").disabled, false);
  assert.equal(document.getElementById("discard-btn").disabled, false);

  card.click(); // deselect
  card = document.querySelector("#hand-row .card");
  assert.equal(card.getAttribute("aria-pressed"), "false");
  assert.ok(!card.classList.contains("selected"));
  assert.equal(text("preview-name").trim(), "");
  assert.equal(document.getElementById("play-btn").disabled, true);
});

test("Enter/Space toggle card selection from the keyboard; other keys do nothing", () => {
  dealtState();
  const keydown = (el, key) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

  keydown(document.querySelector("#hand-row .card"), "a");
  assert.equal(document.querySelector("#hand-row .card").getAttribute("aria-pressed"), "false");

  keydown(document.querySelector("#hand-row .card"), "Enter");
  assert.equal(document.querySelector("#hand-row .card").getAttribute("aria-pressed"), "true");

  keydown(document.querySelector("#hand-row .card"), " ");
  assert.equal(document.querySelector("#hand-row .card").getAttribute("aria-pressed"), "false");
});

test("selection is capped at 5 cards in the DOM too", () => {
  dealtState();
  const cards = [...document.querySelectorAll("#hand-row .card")];

  cards.slice(0, 6).forEach((c) => c.click());
  assert.equal(document.querySelectorAll("#hand-row .card.selected").length, 5);
});

test("card selection is blocked outside the playing phase", () => {
  dealtState({ phase: "shop" });
  document.querySelector("#hand-row .card").click();
  assert.equal(gameModule._getState().selected.size, 0);
});

// --- playing a hand via a real button click --------------------------------

test("clicking Play Hand scores the selection and refills the hand", async () => {
  dealtState();
  const cards = [...document.querySelectorAll("#hand-row .card")].slice(0, 2);
  cards.forEach((c) => c.click());

  document.getElementById("play-btn").click();
  await sleep(PLAY_WAIT_MS);

  const after = gameModule._getState();
  assert.equal(after.handsLeft, 3);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
  assert.equal(document.querySelectorAll("#hand-row .card.selected").length, 0);
  assert.equal(text("hands-val"), "3");
  assert.equal(text("score-val"), `${after.roundScore} / ${after.target}`);
  assert.ok(after.roundScore > 0);
});

// --- shop overlay + buy/sell/reroll wiring ---------------------------------

test("winning a round opens the shop overlay with working buy/sell/reroll buttons", async () => {
  dealtState({ target: 1 }); // any hand clears it
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();
  await sleep(PLAY_WAIT_MS);

  assert.equal(gameModule._getState().phase, "shop");
  assert.ok(!document.getElementById("overlay").classList.contains("hidden"));
  assert.equal(text("overlay-title"), "Round Cleared!");
  assert.equal(document.querySelectorAll("#shop-items .shop-item").length, 3);
  assert.ok(!document.getElementById("reroll-btn").classList.contains("hidden"));
  assert.equal(text("reroll-btn"), "Reroll ($2)");

  // Buy the first offer (money after a 1-hand round-1 win is always 13 —
  // START_MONEY 4 + reward(3+handsLeft 3+discardsLeft 3) — well above any
  // jester's price, so this is deterministic, not RNG-dependent). `_getState()`
  // returns the live, mutable state object, so snapshot the values we need
  // (and the JESTER_POOL entry, which is never mutated) up front rather than
  // reading them back through a reference after further actions mutate it.
  const moneyBeforeBuy = gameModule._getState().money;
  const offer = gameModule._getState().shopOffers[0];
  document.querySelector("#shop-items .shop-item button").click();

  assert.equal(gameModule._getState().jesters.length, 1);
  assert.equal(gameModule._getState().jesters[0].id, offer.id);
  assert.equal(gameModule._getState().money, moneyBeforeBuy - offer.price);
  assert.equal(document.querySelectorAll("#shop-items .shop-item").length, 2);
  assert.ok(!document.getElementById("owned-jesters-section").classList.contains("hidden"));
  assert.equal(document.querySelectorAll("#owned-jesters .jester").length, 1);

  // Sell it back.
  const moneyBeforeSell = gameModule._getState().money;
  document.querySelector("#owned-jesters .sell-btn").click();
  assert.equal(gameModule._getState().jesters.length, 0);
  assert.equal(gameModule._getState().money, moneyBeforeSell + Math.max(1, Math.floor(offer.price / 2)));
  assert.ok(document.getElementById("owned-jesters-section").classList.contains("hidden"));

  // Reroll: cost escalates and offers refresh.
  document.getElementById("reroll-btn").click();
  assert.equal(gameModule._getState().rerollCost, 3);
  assert.equal(text("reroll-btn"), "Reroll ($3)");
  assert.equal(document.querySelectorAll("#shop-items .shop-item").length, 3);

  // Next Round: overlay closes synchronously; the new round's deal is
  // animated (see the dedicated startRound test), so just check the overlay
  // and round number here.
  document.getElementById("overlay-btn").click();
  assert.ok(document.getElementById("overlay").classList.contains("hidden"));
  assert.equal(text("round-val"), "2");
  await sleep(DEAL_ANIMATION_MS); // let that round's deal land before the next test injects its own state
});

test("shop: an unaffordable offer is marked unaffordable and its button disabled", () => {
  const offer = gameModule.JESTER_POOL[0];
  dealtState({ phase: "shop", shopOffers: [offer], money: offer.price - 1, jesters: [] });

  const item = document.querySelector("#shop-items .shop-item");
  assert.ok(item.classList.contains("unaffordable"));
  assert.equal(item.querySelector("button").disabled, true);
});

test("shop: reroll button is disabled when reroll is unaffordable", () => {
  dealtState({ phase: "shop", shopOffers: gameModule.JESTER_POOL.slice(0, 3), money: 0, rerollCost: 2 });
  assert.equal(document.getElementById("reroll-btn").disabled, true);
});

// --- game over overlay ------------------------------------------------------

test("running out of hands opens the Off With Your Head overlay; Restart resets the run", async () => {
  dealtState({ target: Number.MAX_SAFE_INTEGER, handsLeft: 1 }); // one hand left, unreachable target
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();
  await sleep(PLAY_WAIT_MS);

  assert.equal(gameModule._getState().phase, "gameover");
  assert.ok(!document.getElementById("overlay").classList.contains("hidden"));
  assert.equal(text("overlay-title"), "Off With Your Head");
  assert.ok(document.getElementById("reroll-btn").classList.contains("hidden"));
  assert.equal(text("overlay-btn"), "Restart");

  document.getElementById("overlay-btn").click(); // -> restart() -> startRound() (animated)
  assert.equal(gameModule._getState().phase, "playing");
  assert.equal(gameModule._getState().ante, 1);
  assert.equal(gameModule._getState().handsLeft, 4);
  assert.ok(document.getElementById("overlay").classList.contains("hidden"));
  await sleep(DEAL_ANIMATION_MS); // let that round's deal land before the next test injects its own state
});

// --- win overlay -------------------------------------------------------------

test("clearing the final ante opens the Court Is Amused overlay", async () => {
  dealtState({ ante: 8, round: 3, target: 1 }); // FINAL_ANTE, ROUNDS_PER_ANTE
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();
  await sleep(PLAY_WAIT_MS);

  assert.equal(gameModule._getState().phase, "win");
  assert.equal(text("overlay-title"), "The Court Is Amused");
  assert.match(text("overlay-sub"), /cleared The Throne Room/);
  assert.ok(document.getElementById("reroll-btn").classList.contains("hidden"));
  assert.ok(document.getElementById("owned-jesters-section").classList.contains("hidden"));
  assert.equal(text("overlay-btn"), "Play Again");
});

// --- discard via a real button click ----------------------------------------

test("clicking Discard swaps cards without changing the score", () => {
  dealtState();
  document.querySelector("#hand-row .card").click();
  document.getElementById("discard-btn").click();

  const after = gameModule._getState();
  assert.equal(after.discardsLeft, 2);
  assert.equal(after.roundScore, 0);
  assert.equal(text("discards-val"), "2");
  assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
});

test("Discard is a no-op once discards are exhausted", () => {
  dealtState({ discardsLeft: 0 });
  document.querySelector("#hand-row .card").click();
  document.getElementById("discard-btn").click();
  assert.equal(gameModule._getState().discardsLeft, 0);
  assert.equal(gameModule._getState().selected.size, 1); // selection untouched
});

// --- sort controls -----------------------------------------------------------

test("sort buttons re-order the hand and toggle the active class", () => {
  dealtState();
  const rankBtn = document.getElementById("sort-rank-btn");
  const suitBtn = document.getElementById("sort-suit-btn");
  assert.ok(rankBtn.classList.contains("active"));
  assert.ok(!suitBtn.classList.contains("active"));

  suitBtn.click();
  assert.ok(suitBtn.classList.contains("active"));
  assert.ok(!rankBtn.classList.contains("active"));

  const suitOrder = ["♠", "♥", "♦", "♣"];
  const hand = gameModule._getState().hand;
  const expected = [...hand].sort((a, b) => {
    const s = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    // Ranks sort numerically ("10" > "9"), not lexically — use the game's
    // own rankNum, same as sortedHand() does in src/cards-view.js.
    return s !== 0 ? s : gameModule.rankNum(a.rank) - gameModule.rankNum(b.rank);
  });
  const rendered = [...document.querySelectorAll("#hand-row .card .rank-top")].map((el) => el.textContent);
  assert.deepEqual(rendered, expected.map((c) => `${c.rank}${c.suit}`));

  rankBtn.click();
  assert.ok(rankBtn.classList.contains("active"));

  // Clicking the already-active button is a documented no-op.
  rankBtn.click();
  assert.ok(rankBtn.classList.contains("active"));
});

// --- preview -----------------------------------------------------------------

test("preview is blank with nothing selected", () => {
  dealtState();
  assert.equal(text("preview-name").trim(), "");
});

// --- jester-row rendering (owned jesters outside the shop) --------------------

test("owned jesters render their name, rarity, and description in the jester row", () => {
  const jester = jesterByName("Baron"); // has a non-default rarity ("Rare")
  dealtState({ jesters: [jester] });

  const row = document.querySelector("#jester-row .jester");
  assert.ok(row, "expected a rendered jester in #jester-row");
  assert.match(row.textContent, /Baron/);
  assert.match(row.textContent, /Rare/);
  assert.match(row.textContent, new RegExp(jester.desc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("slot counters, deck count, and tap-to-inspect popups", () => {
  const jester = jesterByName("Baron");
  dealtState({ jesters: [jester] });
  assert.equal(text("jester-count"), "1/5");
  assert.equal(text("deck-count"), "44/52");

  const inspect = document.getElementById("inspect");
  assert.ok(inspect.classList.contains("hidden"));
  document.querySelector("#jester-row .jester").click();
  assert.ok(!inspect.classList.contains("hidden"));
  assert.match(inspect.textContent, /Baron/);
  assert.match(inspect.textContent, new RegExp(jester.desc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  document.querySelector("#jester-row .jester").click(); // tap again toggles off
  assert.ok(inspect.classList.contains("hidden"));
  document.querySelector("#jester-row .jester").click();
  document.body.click(); // tap elsewhere dismisses
  assert.ok(inspect.classList.contains("hidden"));

  document.getElementById("deck-pile").click();
  assert.ok(!document.getElementById("deck-modal").classList.contains("hidden"));
  document.getElementById("deck-close-btn").click();
});

test("play rows: the tap-to-inspect popup has a Sell button for jesters, masks and decrees", () => {
  const { TRICK_POOL, DECREE_POOL } = gameModule;
  const jester = jesterByName("Baron");
  const mask = { ...TRICK_POOL[0] };
  const decree = { ...DECREE_POOL[0] };
  const s = dealtState({ jesters: [jester], tricks: [mask, decree], money: 0 });
  const inspect = document.getElementById("inspect");
  const sellBtn = () => inspect.querySelector(".sell-btn");

  document.querySelector("#jester-row .jester").click();
  assert.equal(sellBtn().textContent, `Sell $${Math.max(1, Math.floor(jester.price / 2))}`);
  sellBtn().click();
  assert.equal(s.jesters.length, 0);
  assert.equal(s.money, Math.max(1, Math.floor(jester.price / 2)));
  assert.ok(inspect.classList.contains("hidden"));

  // Selling the second card by tooltip finds it by identity, not a stale index.
  document.querySelectorAll("#trick-row .trick")[1].click();
  assert.equal(sellBtn().textContent, `Sell $${Math.max(1, Math.floor(decree.price / 2))}`);
  sellBtn().click();
  assert.deepEqual(s.tricks, [mask]);
  assert.ok(inspect.classList.contains("hidden"));

  document.querySelector("#trick-row .trick").click();
  sellBtn().click();
  assert.equal(s.tricks.length, 0);
});

// --- jester art fallback (missing_no) ---------------------------------------
// The jsdom document runs without runScripts, so inline onerror attributes
// never fire on their own; these tests run the attribute's source with the
// <img> as `this`, which is what a browser does when the image fails to load.

const ART_DIR = path.join(__dirname, "..", "assets", "jesters");

function renderedArt() {
  dealtState({ jesters: [jesterByName("Baron")] });
  const img = document.querySelector("#jester-row .jester img.jester-art");
  assert.ok(img, "expected a jester <img> in #jester-row");
  return img;
}

function failToLoad(img) {
  new Function(img.getAttribute("onerror")).call(img);
}

test("missing_no.png exists, so the art fallback has something to show", () => {
  assert.ok(fs.existsSync(path.join(ART_DIR, "missing_no.png")));
});

test("jester art points at its own <id>.png first", () => {
  assert.equal(renderedArt().getAttribute("src"), "assets/jesters/baron.png");
});

test("a jester image that fails to load falls back to missing_no", () => {
  const img = renderedArt();
  failToLoad(img);
  assert.equal(img.getAttribute("src"), "assets/jesters/missing_no.png");
});

test("if missing_no itself fails, the handler detaches instead of looping", () => {
  const img = renderedArt();
  failToLoad(img);
  assert.equal(img.onerror, null); // a browser fires no further error events once cleared
});

test("shop: prop offer renders, buys via its button, and is listed as owned", () => {
  const prop = gameModule.PROP_POOL[0];
  dealtState({ phase: "shop", shopProp: prop, money: 20, props: [] });
  gameModule.render();
  const item = document.querySelector("#shop-prop .shop-item");
  assert.match(item.textContent, new RegExp(prop.name));
  item.querySelector("button").click();
  assert.equal(gameModule._getState().props.length, 1);
  assert.equal(document.querySelectorAll("#shop-prop .shop-item").length, 0);
  assert.match(document.getElementById("owned-props").textContent, new RegExp(prop.name));
});

test("shop: an unaffordable prop is marked unaffordable", () => {
  dealtState({ phase: "shop", shopProp: gameModule.PROP_POOL[0], money: 0, props: [] });
  gameModule.render();
  const item = document.querySelector("#shop-prop .shop-item");
  assert.ok(item.classList.contains("unaffordable"));
  assert.ok(item.querySelector("button").disabled);
});

test("shop: decree offers and both packs render, and a decree buys into a slot", () => {
  const decree = gameModule.DECREE_POOL[0];
  dealtState({ phase: "shop", money: 20, shopDecrees: [decree], shopTricks: [], packAvailable: true, decreePackAvailable: true });
  gameModule.render();
  const items = [...document.querySelectorAll("#shop-tricks .shop-item")];
  assert.equal(items.length, 1);
  assert.match(items[0].textContent, new RegExp(decree.name));
  const packs = [...document.querySelectorAll("#shop-packs .shop-item")];
  assert.equal(packs.length, 2);
  assert.match(packs[1].textContent, /Decree Pack/);
  items[0].querySelector("button").click();
  assert.equal(gameModule._getState().tricks[0].id, decree.id);
});

test("decree Use button enables only with a valid selection and edits the hand card", () => {
  const decree = gameModule.DECREE_POOL.find((t) => t.id === "decree_marriage");
  const state = dealtState({ tricks: [{ ...decree }] });
  gameModule.render();
  const useBtn = () => document.querySelector("#trick-row .use-btn");
  assert.ok(useBtn().disabled);
  document.querySelector("#hand-row .card").click();
  assert.ok(!useBtn().disabled);
  useBtn().click();
  assert.equal(document.querySelectorAll("#hand-row .enh-wild").length, 1);
  assert.equal(document.querySelectorAll("#hand-row .enh-badge").length, 1);
  assert.equal(gameModule._getState().tricks.length, 0);
  assert.ok(state);
});

test("decree cards load optional art, and a missing file leaves the glyph", () => {
  const decree = gameModule.DECREE_POOL[0];
  dealtState({ tricks: [{ ...decree }] });
  gameModule.render();
  const card = document.querySelector("#trick-row .trick");
  const img = card.querySelector(".card-art");
  assert.equal(img.getAttribute("src"), `assets/decrees/${decree.id}.png`);
  assert.ok(img.hidden);
  failToLoad(img);
  assert.equal(card.querySelector(".card-art"), null);
  assert.ok(!card.querySelector(".trick-glyph").hidden);
  // ...and when the file loads, the art replaces the glyph.
  dealtState({ tricks: [{ ...decree }] });
  const loaded = document.querySelector("#trick-row .card-art");
  new Function(loaded.getAttribute("onload")).call(loaded);
  assert.ok(!loaded.hidden);
  assert.ok(document.querySelector("#trick-row .trick-glyph").hidden);
});

test("an open decree pack is titled as one and blocks Take when slots are full", () => {
  const { DECREE_POOL } = gameModule;
  dealtState({
    phase: "shop", pack: DECREE_POOL.slice(0, 3), packKind: "decree",
    tricks: [{ ...DECREE_POOL[3] }, { ...DECREE_POOL[4] }],
  });
  gameModule.render();
  assert.match(text("pack-title"), /^Decree Pack/);
  const take = document.querySelector("#pack-items button");
  assert.ok(take.disabled);
  gameModule._getState().packKind = "trick";
  gameModule._getState().pack = [gameModule.TRICK_POOL[0]];
  gameModule.render();
  assert.match(text("pack-title"), /^Mask Pack/);
  assert.ok(!document.querySelector("#pack-items button").disabled);
});

test("deck view shows enhancements and marks discarded and played cards", () => {
  const state = dealtState();
  state.masterDeck[0].enh = "glass";
  state.masterDeck[1].enh = "wild";
  state.played = [state.masterDeck[2]];
  state.discarded = [state.masterDeck[3]];
  gameModule.render();
  document.getElementById("deck-btn").click();
  assert.equal(document.querySelectorAll("#deck-grid .mini-card").length, 52);
  assert.equal(document.querySelectorAll("#deck-grid .enh-glass").length, 1);
  assert.ok(document.querySelector("#deck-grid .mini-card[title*='(Glass)']"));
  assert.ok(document.querySelector("#deck-grid .mini-card.played"));
  assert.ok(document.querySelector("#deck-grid .mini-card.discarded"));
  document.getElementById("deck-close-btn").click();
});

test("shop: reroll button shows a free reroll, and a boss banner shows in play", () => {
  dealtState({ phase: "shop", jesters: [jesterByName("Chaos the Clown")], lastEarnings: { reward: 5, interest: 1, bonus: 2 } });
  gameModule.render();
  assert.match(text("reroll-btn"), /Free/);
  assert.match(text("overlay-sub"), /interest/);
  assert.match(text("overlay-sub"), /jesters/);
  const boss = gameModule.BOSS_MODIFIERS[0];
  dealtState({ bossModifier: boss });
  gameModule.render();
  assert.ok(!document.getElementById("boss-banner").classList.contains("hidden"));
  assert.equal(text("boss-name"), boss.name);
});

test("skipping a pack closes it, and Escape closes the deck view", () => {
  dealtState({ phase: "shop", pack: [gameModule.TRICK_POOL[0]], packKind: "trick" });
  gameModule.render();
  document.getElementById("pack-skip-btn").click();
  assert.equal(gameModule._getState().pack, null);
  document.getElementById("deck-btn").click();
  assert.ok(!document.getElementById("deck-modal").classList.contains("hidden"));
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.ok(document.getElementById("deck-modal").classList.contains("hidden"));
});

// --- card faces ----------------------------------------------------------------

test("number cards show as many pips as their rank; aces and faces show one big suit", () => {
  const cards = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A", "K"].map((rank, i) => ({ id: 900 + i, rank, suit: "♠" }));
  dealtState({ hand: cards });
  const els = [...document.querySelectorAll("#hand-row .card")];
  const pipCount = (rank) => {
    const el = els.find((e) => e.querySelector(".rank-top").textContent === `${rank}♠`);
    return el.querySelectorAll(".pip").length;
  };
  for (const rank of ["2", "3", "4", "5", "6", "7", "8", "9", "10"]) assert.equal(pipCount(rank), Number(rank), `${rank} pips`);
  assert.equal(pipCount("A"), 0);
  assert.equal(pipCount("K"), 0);
  const four = els.find((e) => e.querySelector(".rank-top").textContent === "4♠");
  assert.equal(four.querySelectorAll(".pip.flip").length, 2, "bottom half of the 4 is upside-down");
});

// --- reordering hand cards ---------------------------------------------------

test("dragging a hand card reorders the hand and switches to custom order", () => {
  dealtState();
  const cards = () => [...document.querySelectorAll("#hand-row .card")];
  const label = (el) => el.querySelector(".rank-top").textContent;
  const before = cards().map(label);
  const row = document.getElementById("hand-row");
  cards().forEach((el, i) => {
    el.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 100, top: 0, bottom: 50 });
  });
  const last = cards().length - 1;
  const first = cards()[0];
  first.dispatchEvent(ptr("pointerdown", 50, 25));
  document.dispatchEvent(ptr("pointermove", 200, 25));
  document.dispatchEvent(ptr("pointermove", last * 100 + 50, 25));
  document.dispatchEvent(ptr("pointerup", last * 100 + 50, 25));

  assert.deepEqual(cards().map(label), [...before.slice(1), before[0]]);
  assert.equal(gameModule._getState().sortMode, "custom");
  assert.equal(gameModule._getState().selected.size, 0); // the drag's click didn't select
  assert.ok(!document.getElementById("sort-rank-btn").classList.contains("active"));
  assert.ok(!document.getElementById("sort-suit-btn").classList.contains("active"));
  assert.equal(row.children.length, before.length);

  document.getElementById("sort-rank-btn").click();
  assert.equal(gameModule._getState().sortMode, "rank");
});

// --- shop screen -------------------------------------------------------------

test("shop bar shows money and one payout chip per earnings line; owned panes show slot counts", () => {
  dealtState({ phase: "shop", money: 12, lastEarnings: { reward: 4, interest: 0, bonus: 2 }, jesters: [] });
  gameModule.render();
  assert.equal(text("shop-money-val"), "12");
  const chips = [...document.querySelectorAll("#overlay-sub .chip")].map((c) => c.textContent);
  assert.deepEqual(chips.slice(1), ["+$4 round", "+$2 jesters"]);
  assert.ok(!document.getElementById("shop-yours-empty").classList.contains("hidden"));
  const [a] = gameModule.JESTER_POOL;
  gameModule._getState().jesters = [{ ...a, sellBonus: 0 }];
  gameModule.render();
  assert.ok(document.getElementById("shop-yours-empty").classList.contains("hidden"));
  assert.match(text("owned-jesters-count"), /^1\/\d+$/);
  assert.equal(document.querySelectorAll("#owned-jesters .move-btns").length, 0);
});

// --- reordering jesters ---------------------------------------------------

function ptr(type, x, y, pointerType = "mouse") {
  const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  return e;
}

// Drags `from` and releases at `over`'s center, or at `dropX` if given.
// jsdom has no layout, so fake one: slots (the card's wrapper in the play
// row, the card itself in the shop list) are 100px wide, laid out in a row.
function dragOnto(from, over, pointerType = "mouse", dropX = null) {
  const slotOf = (el) => el.closest(".jester-slot") || el;
  const slots = [...slotOf(from).parentElement.children];
  for (const [i, slot] of slots.entries()) {
    slot.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 100, top: 0, bottom: 50 });
  }
  const x0 = slots.indexOf(slotOf(from)) * 100 + 50;
  const x1 = dropX ?? (over ? slots.indexOf(slotOf(over)) * 100 + 50 : x0);
  from.dispatchEvent(ptr("pointerdown", x0, 25, pointerType));
  document.dispatchEvent(ptr("pointermove", (x0 + x1) / 2 + 10, 25, pointerType));
  document.dispatchEvent(ptr("pointermove", x1, 25, pointerType));
  document.dispatchEvent(ptr("pointerup", x1, 25, pointerType));
}

test("dragging a jester onto another moves it into that slot (shop and play rows)", () => {
  const [a, b, c] = gameModule.JESTER_POOL;
  const ids = () => gameModule._getState().jesters.map((j) => j.id);
  dealtState({ phase: "shop", jesters: [a, b, c].map((j) => ({ ...j, sellBonus: 0 })) });
  let cards = document.querySelectorAll("#owned-jesters .jester");
  dragOnto(cards[2], cards[0]); // drop c onto slot 0
  assert.deepEqual(ids(), [c.id, a.id, b.id]);
  // dropping on itself, or outside any jester, does nothing
  cards = document.querySelectorAll("#owned-jesters .jester");
  dragOnto(cards[0], cards[0]);
  dragOnto(cards[0], null); // released at its own spot
  assert.deepEqual(ids(), [c.id, a.id, b.id]);
  assert.equal(cards[0].style.transform, "");

  // main jester row, during play
  dealtState({ jesters: [a, b, c].map((j) => ({ ...j, sellBonus: 0 })) });
  const row = document.querySelectorAll("#jester-row .jester");
  dragOnto(row[0], row[2]);
  assert.deepEqual(ids(), [b.id, c.id, a.id]);
  const names = [...document.querySelectorAll("#jester-row .jester-name")].map((el) => el.textContent);
  assert.deepEqual(names, [b.name, c.name, a.name]);
});

test("drops are forgiving: nearest slot wins, even in gaps and far off-target", () => {
  const [a, b, c] = gameModule.JESTER_POOL;
  const ids = () => gameModule._getState().jesters.map((j) => j.id);
  const setup = () => {
    dealtState({ jesters: [a, b, c].map((j) => ({ ...j, sellBonus: 0 })) });
    return document.querySelectorAll("#jester-row .jester");
  };
  let row = setup();
  dragOnto(row[0], null, "mouse", 215); // just left of slot 2's center, below the row
  assert.deepEqual(ids(), [b.id, c.id, a.id]);
  row = setup();
  dragOnto(row[2], null, "mouse", -300); // way past the left edge
  assert.deepEqual(ids(), [c.id, a.id, b.id]);
  row = setup();
  dragOnto(row[1], null, "mouse", 120); // wiggle within its own slot
  assert.deepEqual(ids(), [a.id, b.id, c.id]);
});

test("a tiny mouse movement is a click, not a drag", () => {
  const [a, b] = gameModule.JESTER_POOL;
  dealtState({ jesters: [a, b].map((j) => ({ ...j, sellBonus: 0 })) });
  const row = document.querySelectorAll("#jester-row .jester");
  document.elementFromPoint = () => row[1];
  row[0].dispatchEvent(ptr("pointerdown", 0, 0));
  document.dispatchEvent(ptr("pointermove", 2, 0));
  document.dispatchEvent(ptr("pointerup", 2, 0));
  assert.deepEqual(gameModule._getState().jesters.map((j) => j.id), [a.id, b.id]);
});

test("touch drags like a mouse, and pointercancel puts the card back", () => {
  const [a, b] = gameModule.JESTER_POOL;
  const ids = () => gameModule._getState().jesters.map((j) => j.id);
  dealtState({ jesters: [a, b].map((j) => ({ ...j, sellBonus: 0 })) });
  let row = document.querySelectorAll("#jester-row .jester");
  row[0].dispatchEvent(ptr("pointerdown", 0, 0, "touch"));
  document.dispatchEvent(ptr("pointermove", 20, 0, "touch"));
  assert.ok(row[0].classList.contains("dragging"));
  document.dispatchEvent(ptr("pointercancel", 20, 0, "touch"));
  assert.ok(!row[0].classList.contains("dragging"));
  assert.deepEqual(ids(), [a.id, b.id]);

  row = document.querySelectorAll("#jester-row .jester");
  dragOnto(row[0], row[1], "touch");
  assert.deepEqual(ids(), [b.id, a.id]);
});

test("play row outlines every jester slot, filled or empty, and tracks the slot count", () => {
  const [a] = gameModule.JESTER_POOL;
  const s = dealtState({ jesters: [{ ...a, sellBonus: 0 }] });
  let slots = document.querySelectorAll("#jester-row .jester-slot");
  assert.equal(slots.length, 5);
  assert.equal(slots[0].querySelectorAll(".jester").length, 1);
  assert.equal(slots[1].children.length, 0);
  s.props = gameModule.PROP_POOL.filter((v) => v.id === "wide_stage");
  gameModule.render();
  assert.equal(document.querySelectorAll("#jester-row .jester-slot").length, 6);
});

test("trick row is always shown, with an outlined slot per free trick slot", () => {
  dealtState();
  assert.ok(!document.getElementById("trick-group").classList.contains("hidden"));
  assert.equal(document.querySelectorAll("#trick-row .trick-slot").length, 2);
  assert.equal(document.querySelectorAll("#trick-row .trick").length, 0);
  dealtState({ tricks: [{ ...gameModule.TRICK_POOL[0] }] });
  assert.equal(document.querySelectorAll("#trick-row .trick-slot").length, 2);
  assert.equal(document.querySelectorAll("#trick-row .trick-slot .trick").length, 1);
});

test("the HUD names the venue and audience, and the preview names the poker hand", () => {
  dealtState();
  gameModule.render();
  assert.equal(text("venue-val"), "The Scullery");
  assert.equal(text("audience-val"), "Small Audience");
  document.querySelector("#hand-row .card").click();
  assert.match(text("preview-name"), /^High Card/);
});

test("the King's mood follows score progress and shows in the amusement meter", () => {
  const { courtMood } = gameModule;
  assert.equal(courtMood(0, 300, 4), "bored");
  assert.equal(courtMood(150, 300, 4), "amused");
  assert.equal(courtMood(300, 300, 1), "delighted");
  assert.equal(courtMood(50, 300, 1), "displeased");
  dealtState({ roundScore: 160, target: 300 });
  gameModule.render();
  assert.equal(document.getElementById("amusement").dataset.mood, "amused");
  assert.match(text("amusement-label"), /amused/);
  assert.equal(document.getElementById("amusement-fill").style.width.slice(0, 2), "53");
});

// --- the play area -------------------------------------------------------------

// jsdom has no layout: fake the play area as a box well above the hand.
function fakePlayArea() {
  document.getElementById("play-area").getBoundingClientRect = () => ({ left: 0, right: 500, top: 0, bottom: 100 });
}

// Drags a card from (x0, y0) to (x1, y1).
function dragTo(el, x0, y0, x1, y1) {
  el.dispatchEvent(ptr("pointerdown", x0, y0));
  document.dispatchEvent(ptr("pointermove", (x0 + x1) / 2, (y0 + y1) / 2));
  document.dispatchEvent(ptr("pointermove", x1, y1));
  document.dispatchEvent(ptr("pointerup", x1, y1));
}

test("Play Hand moves the selected cards into the play area, then scores them", async () => {
  dealtState();
  [...document.querySelectorAll("#hand-row .card")].slice(0, 2).forEach((c) => c.click());
  document.getElementById("play-btn").click();

  assert.equal(document.querySelectorAll("#play-area .card").length, 2);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 6);
  assert.equal(gameModule._getState().handsLeft, 4); // not scored yet

  document.getElementById("play-btn").click(); // a second press mid-flight does nothing
  await sleep(PLAY_WAIT_MS);
  assert.equal(gameModule._getState().handsLeft, 3);
  assert.equal(document.querySelectorAll("#play-area .card").length, 0);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
});

test("input is ignored while the played cards are on their way up", async () => {
  dealtState();
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();
  document.querySelector("#hand-row .card").click(); // ignored: would otherwise select a second card
  document.getElementById("discard-btn").click();
  assert.equal(gameModule._getState().selected.size, 1);
  assert.equal(gameModule._getState().discardsLeft, 3);
  await sleep(PLAY_WAIT_MS);
  assert.equal(gameModule._getState().handsLeft, 3);
});

test("dragging a hand card into the play area selects and parks it; dragging it out returns it", () => {
  dealtState();
  fakePlayArea();
  const card = document.querySelector("#hand-row .card");
  const id = card.dataset.cardId;
  dragTo(card, 300, 300, 250, 50);

  const state = gameModule._getState();
  assert.ok(state.selected.has(id));
  assert.equal(document.querySelectorAll("#play-area .card").length, 1);
  assert.equal(document.querySelector("#play-area .card").dataset.cardId, id);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 7);
  assert.equal(document.getElementById("play-btn").disabled, false);

  // released back over the hand
  document.getElementById("hand-area").getBoundingClientRect = () => ({ left: 0, right: 500, top: 200, bottom: 400 });
  dragTo(document.querySelector("#play-area .card"), 250, 50, 250, 300);
  assert.equal(gameModule._getState().selected.size, 0);
  assert.equal(document.querySelectorAll("#play-area .card").length, 0);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 8);

  // released over the play area again (not the hand): stays put
  dragTo(document.querySelector("#hand-row .card"), 300, 300, 250, 50);
  dragTo(document.querySelector("#play-area .card"), 250, 50, 260, 60);
  assert.equal(document.querySelectorAll("#play-area .card").length, 1);
});

test("the play area highlights while a card is dragged over it", () => {
  dealtState();
  fakePlayArea();
  const area = document.getElementById("play-area");
  const card = document.querySelector("#hand-row .card");
  card.dispatchEvent(ptr("pointerdown", 300, 300));
  document.dispatchEvent(ptr("pointermove", 250, 150));
  document.dispatchEvent(ptr("pointermove", 250, 50));
  assert.ok(area.classList.contains("drop-ready"));
  document.dispatchEvent(ptr("pointermove", 250, 300));
  assert.ok(!area.classList.contains("drop-ready"));
  document.dispatchEvent(ptr("pointerup", 250, 300));
  assert.equal(gameModule._getState().selected.size, 0);
});

test("clicking a card in the play area sends it back to the hand", async () => {
  dealtState();
  fakePlayArea();
  dragTo(document.querySelector("#hand-row .card"), 300, 300, 250, 50);
  await sleep(5); // the click a real drag release triggers is swallowed until the next tick
  document.querySelector("#play-area .card").click();
  assert.equal(gameModule._getState().selected.size, 0);
  assert.equal(gameModule._getState().staged.size, 0);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
});

test("the play area holds at most 5 cards", () => {
  dealtState();
  fakePlayArea();
  for (let i = 0; i < 6; i++) dragTo(document.querySelector("#hand-row .card"), 300, 300, 250, 50);
  assert.equal(document.querySelectorAll("#play-area .card").length, 5);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 3);
});

test("reordering the hand still works with cards parked in the play area", () => {
  dealtState();
  fakePlayArea();
  const parked = document.querySelector("#hand-row .card").dataset.cardId;
  dragTo(document.querySelector("#hand-row .card"), 300, 300, 250, 50);
  const label = (el) => el.dataset.cardId;
  const before = [...document.querySelectorAll("#hand-row .card")].map(label);
  const cards = [...document.querySelectorAll("#hand-row .card")];
  cards.forEach((el, i) => {
    el.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 100, top: 200, bottom: 300 });
  });
  const last = cards.length - 1;
  dragTo(cards[0], 50, 250, last * 100 + 50, 250);
  assert.deepEqual([...document.querySelectorAll("#hand-row .card")].map(label), [...before.slice(1), before[0]]);
  assert.equal(document.querySelector("#play-area .card").dataset.cardId, parked);
});

// Parks three cards in the play area and gives them fake 100px-wide slots, left to right.
function parkThree() {
  dealtState();
  fakePlayArea();
  for (let i = 0; i < 3; i++) dragTo(document.querySelector("#hand-row .card"), 300, 300, 250, 50);
  const slots = () => [...document.querySelectorAll("#play-area .card")];
  // Re-run after a reorder: the rects belong to the elements, not to the slots.
  slots.layout = () => slots().forEach((el, i) => {
    el.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 100, top: 0, bottom: 50 });
  });
  slots.layout();
  return slots;
}

test("dragging a card within the play area reorders it, and the hand scores in that order", () => {
  const slots = parkThree();
  const ids = () => slots().map((el) => el.dataset.cardId);
  const before = ids();
  assert.equal(before.length, 3);

  dragTo(slots()[0], 50, 25, 250, 25); // first card dropped on the third slot
  assert.deepEqual(ids(), [before[1], before[2], before[0]]);
  assert.equal(gameModule._getState().sortMode, "custom");
  assert.equal(gameModule._getState().staged.size, 3); // still parked, still selected
  assert.equal(document.querySelectorAll("#hand-row .card").length, 5);

  // Play Hand takes the selected cards in hand order, so that order has to follow the play area.
  const st = gameModule._getState();
  assert.deepEqual(st.hand.filter((c) => st.staged.has(c.id)).map((c) => String(c.id)), ids());

  slots.layout();
  dragTo(slots()[2], 250, 25, 50, 25); // and back to the front
  assert.deepEqual(ids(), before);
});

test("dropping a hand card into the play area puts it where it was released", () => {
  const slots = parkThree();
  const before = slots().map((el) => el.dataset.cardId);
  const card = document.querySelector("#hand-row .card");
  const id = card.dataset.cardId;
  card.getBoundingClientRect = () => ({ left: 120, right: 220, top: 0, bottom: 50 }); // centre 170: between slots 1 and 2
  dragTo(card, 300, 300, 250, 50);
  assert.deepEqual([...document.querySelectorAll("#play-area .card")].map((el) => el.dataset.cardId),
    [before[0], before[1], id, before[2]]);
});

// Two quick clicks on the same card. Dispatched with a click's usual detail counter, plus the
// dblclick a browser sends, which the game ignores.
function doubleClick(el) {
  const fire = (type, detail) => el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, detail }));
  fire("click", 1);
  fire("click", 2);
  fire("dblclick", 2);
}

test("double clicking a hand card parks it at the right end of the play area", () => {
  dealtState();
  const [a, b] = document.querySelectorAll("#hand-row .card");
  doubleClick(a);
  doubleClick(b);
  const st = gameModule._getState();
  assert.deepEqual([...document.querySelectorAll("#play-area .card")].map((el) => el.dataset.cardId),
    [a.dataset.cardId, b.dataset.cardId]);
  assert.equal(st.selected.size, 2);
  assert.equal(st.staged.size, 2);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 6);
});

test("double clicking a card that was already selected still parks it", () => {
  dealtState();
  const card = document.querySelector("#hand-row .card");
  card.click(); // selected, still in the hand
  doubleClick(card);
  assert.equal(gameModule._getState().staged.size, 1);
  assert.equal(gameModule._getState().selected.size, 1);
});

test("two quick clicks on neighbouring cards select both; double clicking one then parks only that one", () => {
  dealtState();
  const [a, b] = document.querySelectorAll("#hand-row .card");
  const click = (el, detail) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, detail }));
  click(a, 1);
  click(b, 2); // a browser counts this as a double click, though it landed on another card
  let st = gameModule._getState();
  assert.deepEqual([...st.selected].sort(), [a.dataset.cardId, b.dataset.cardId].sort());
  assert.equal(st.staged.size, 0);

  doubleClick(a);
  st = gameModule._getState();
  assert.deepEqual([...st.staged], [a.dataset.cardId]);
  assert.ok(st.selected.has(b.dataset.cardId)); // the neighbour stays selected, in the hand
  assert.deepEqual([...document.querySelectorAll("#play-area .card")].map((el) => el.dataset.cardId), [a.dataset.cardId]);
});

test("double clicking a card in the play area sends it back instead of re-parking it", () => {
  dealtState();
  const card = document.querySelector("#hand-row .card");
  doubleClick(card);
  assert.equal(gameModule._getState().staged.size, 1);
  doubleClick(document.querySelector("#play-area .card"));
  const st = gameModule._getState();
  assert.equal(st.staged.size, 0);
  assert.equal(st.selected.size, 0);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
});

test("stageCard and unstageCard refuse outside the playing phase or for unknown cards", () => {
  dealtState({ phase: "shop" });
  assert.equal(gameModule.stageCard(gameModule._getState().hand[0].id), false);
  dealtState();
  assert.equal(gameModule.stageCard("nope"), false);
  assert.equal(gameModule.unstageCard("nope"), false);
});

test("selecting cards does not rebuild the mask/decree row, so its art never reloads", () => {
  const decree = gameModule.DECREE_POOL.find((t) => t.id === "decree_marriage");
  dealtState({ tricks: [{ ...decree }] });
  const card = document.querySelector("#trick-row .trick");
  const use = card.querySelector(".use-btn");
  assert.ok(use.disabled);
  document.querySelector("#hand-row .card").click();
  assert.equal(document.querySelector("#trick-row .trick"), card); // same element, not a rebuilt one
  assert.ok(!use.disabled);
  document.querySelector("#hand-row .card").click();
  assert.ok(use.disabled);
  // a changed set of cards does rebuild
  gameModule._getState().tricks.push({ ...gameModule.DECREE_POOL[0] });
  gameModule.render();
  assert.equal(document.querySelectorAll("#trick-row .trick").length, 2);
});

test("hand cards persist across renders, so face-card portraits never reload", () => {
  const king = { id: "K-test", rank: "K", suit: "\u2660" };
  const others = gameModule.freshDeck().slice(0, 7);
  dealtState({ hand: [king, ...others] });
  const art = () => document.querySelector("#hand-row .court-art");
  const first = art();
  const kingEl = document.querySelector("#hand-row .card");
  assert.ok(first);
  document.querySelectorAll("#hand-row .card")[1].click(); // any render
  assert.equal(art(), first); // the very same element, not a fresh <img>
  assert.equal(document.querySelector("#hand-row .card"), kingEl);
  gameModule.render();
  assert.equal(art(), first);
});

test("destroyed cards stay in the deck screen, marked as removed", () => {
  const state = dealtState();
  const victim = state.hand[0];
  gameModule.destroyCards([victim.id]);
  document.getElementById("deck-btn").click();
  const cells = [...document.querySelectorAll("#deck-grid .mini-card")];
  assert.equal(cells.length, 52); // still all 52, in place
  const removed = cells.filter((c) => c.classList.contains("removed"));
  assert.equal(removed.length, 1);
  assert.equal(removed[0].textContent, `${victim.rank}${victim.suit}`);
  assert.match(document.getElementById("deck-legend").textContent, /Removed: 1/);
  assert.match(document.getElementById("deck-btn").textContent, /\/51\)/); // the live deck total drops by one
  document.getElementById("deck-close-btn").click();
});

// --- the scoring sequence --------------------------------------------------
// The hand resolves in the state at once, but the screen plays it out: the old score stays up,
// the played cards stay in the play area, the shop waits, and input is locked, until the
// sequence ends (a click hurries it along, which these tests use to keep them quick).

const hurry = () => document.dispatchEvent(new window.Event("pointerdown"));

// Runs fn with the sequence switched on (jsdom has no Web Animations, so it is off by default).
async function withScoringAnimation(fn) {
  gameModule._setScoringAnimation(true);
  try {
    await fn();
    await gameModule._scoringDone();
  } finally {
    gameModule._setScoringAnimation(null);
  }
}

test("selecting cards shows the hand's base chips and mult in the counters", () => {
  dealtState();
  const tally = document.getElementById("tally");
  assert.ok(tally.classList.contains("idle"));
  document.querySelector("#hand-row .card").click();
  assert.ok(!tally.classList.contains("idle"));
  const base = gameModule.evaluateHand(gameModule.getSelectedCards()).baseChips;
  assert.equal(text("tally-chips"), String(base));
  assert.equal(text("tally-x"), "");
  document.querySelector("#hand-row .card").click();
  assert.ok(tally.classList.contains("idle"));
});

test("a scored hand plays out on screen before the score, shop and new cards appear", async () => {
  await withScoringAnimation(async () => {
    const jester = jesterByName("Jester"); // +4 Mult
    dealtState({ target: 1, jesters: [{ ...jester }] });
    const before = gameModule._getState().roundScore;
    const pops = [];
    const observer = new window.MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains("score-pop")) pops.push(n.textContent);
    });
    observer.observe(document.body, { childList: true });

    document.querySelector("#hand-row .card").click();
    document.getElementById("play-btn").click();
    await sleep(PLAY_WAIT_MS);

    // Resolved in the state already...
    const state = gameModule._getState();
    assert.equal(state.handsLeft, 3);
    assert.ok(state.roundScore > before);
    assert.equal(state.phase, "shop");
    // ...but not yet on screen.
    assert.ok(gameModule._isScoring());
    assert.equal(text("score-val"), `${before} / 1`);
    assert.equal(document.querySelectorAll("#play-area .card").length, 1);
    assert.equal(document.querySelectorAll("#hand-row .card").length, 7); // the replacement is still to be dealt
    assert.ok(document.getElementById("overlay").classList.contains("hidden"));
    assert.equal(text("preview-name").trim(), gameModule.evaluateHand([state.played.at(-1)]).name);

    // Input is locked meanwhile.
    document.querySelector("#hand-row .card").click();
    document.getElementById("discard-btn").click();
    assert.equal(state.selected.size, 0);
    assert.equal(state.discardsLeft, 3);

    hurry();
    await gameModule._scoringDone();
    observer.disconnect();

    assert.ok(!gameModule._isScoring());
    assert.equal(text("score-val"), `${state.roundScore} / 1`);
    assert.equal(document.querySelectorAll("#play-area .card").length, 0);
    assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
    assert.ok(!document.getElementById("overlay").classList.contains("hidden"));
    assert.ok(document.getElementById("tally").classList.contains("idle"));
    assert.ok(pops.some((p) => /^\+\d+$/.test(p)), `no chips popup in ${pops}`); // the card
    assert.ok(pops.includes("+4 Mult"), `no jester popup in ${pops}`);
  });
});

test("the sequence shows X effects, money and a debuffed card, and a missed target plays on to the next hand", async () => {
  await withScoringAnimation(async () => {
    const purse = { ...jesterByName("Jester"), id: "test_purse", name: "Purse", apply: () => ({ money: 2 }) };
    const jesters = [{ ...jesterByName("Cavendish") }, purse];
    dealtState({ target: Number.MAX_SAFE_INTEGER, jesters, bossModifier: { suitDebuff: "♠" } });
    const state = gameModule._getState();
    state.hand[0] = { ...state.hand[0], rank: "K", suit: "♠" }; // debuffed: scores no chips
    gameModule.render();
    const pops = [];
    const observer = new window.MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains("score-pop")) pops.push(n.textContent);
    });
    observer.observe(document.body, { childList: true });

    document.querySelector(`#hand-row .card[data-card-id="${state.hand[0].id}"]`).click();
    document.getElementById("play-btn").click();
    await sleep(PLAY_WAIT_MS);
    hurry();
    await gameModule._scoringDone();
    observer.disconnect();

    assert.ok(pops.includes("Debuffed"), `${pops}`);
    assert.ok(pops.includes("×3"), `no X popup in ${pops}`);
    assert.ok(pops.includes("+$2"), `no money popup in ${pops}`);
    assert.equal(state.money, 4 + 2);
    assert.equal(state.phase, "playing");
    assert.equal(text("score-val"), `${state.roundScore} / ${state.target}`);
    assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
  });
});

test("losing on the last hand waits for the sequence, then shows the end screen", async () => {
  await withScoringAnimation(async () => {
    dealtState({ target: Number.MAX_SAFE_INTEGER, handsLeft: 1 });
    document.querySelector("#hand-row .card").click();
    document.getElementById("play-btn").click();
    await sleep(PLAY_WAIT_MS);
    assert.equal(gameModule._getState().phase, "gameover");
    assert.ok(document.getElementById("overlay").classList.contains("hidden"));
    hurry();
    await gameModule._scoringDone();
    assert.ok(!document.getElementById("overlay").classList.contains("hidden"));
  });
});

test("played cards keep their order in the play area while they score", async () => {
  await withScoringAnimation(async () => {
    const state = dealtState({ target: Number.MAX_SAFE_INTEGER });
    state.sortMode = "rank"; // shown sorted, whatever order the hand array is in
    state.hand.reverse();
    gameModule.render();
    [...document.querySelectorAll("#hand-row .card")].slice(0, 4).forEach((c) => c.click());
    document.getElementById("play-btn").click();
    const order = () => [...document.querySelectorAll("#play-area .card")].map((c) => c.dataset.cardId);
    const before = order();
    assert.equal(before.length, 4);
    await sleep(PLAY_WAIT_MS);
    assert.ok(gameModule._isScoring());
    assert.deepEqual(order(), before);
    hurry();
  });
});

// --- run persistence (localStorage in the jsdom window) -----------------------

const savedRun = () => JSON.parse(window.localStorage.getItem(gameModule.SAVE_KEY));

test("persistence: the shop is saved on render, buying updates the save, and a loss clears it", async () => {
  window.localStorage.clear();
  dealtState({ target: 1 });
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();
  await sleep(PLAY_WAIT_MS);
  assert.equal(gameModule._getState().phase, "shop");

  const saved = savedRun();
  assert.equal(saved.phase, "shop");
  assert.equal(saved.jesters.length, 0);
  assert.equal(saved.shopOffers.length, 3);

  document.querySelector("#shop-items .shop-item button").click();
  assert.equal(savedRun().jesters.length, 1);
  assert.equal(savedRun().money, gameModule._getState().money);

  // loadRun() rebuilds the same shop from storage.
  const loaded = gameModule.loadRun();
  assert.equal(loaded.phase, "shop");
  assert.deepEqual(loaded.jesters.map((j) => j.id), gameModule._getState().jesters.map((j) => j.id));

  // A round in progress is saved too, with its hand and score.
  const state = dealtState({ target: Number.MAX_SAFE_INTEGER, handsLeft: 1, roundScore: 42 });
  assert.equal(savedRun().phase, "playing");
  assert.equal(savedRun().roundScore, 42);
  assert.equal(savedRun().roundState.hand.length, 8);
  state.phase = "gameover";
  gameModule.render();
  assert.equal(window.localStorage.getItem(gameModule.SAVE_KEY), null);
});

test("persistence: a round start is saved, and a corrupt or unusable save is ignored", async () => {
  window.localStorage.clear();
  dealtState();
  gameModule.nextRound(); // startRound() saves the new round
  await sleep(DEAL_ANIMATION_MS);
  assert.equal(savedRun().phase, "playing");
  assert.equal(gameModule.loadRun().phase, "playing");

  window.localStorage.setItem(gameModule.SAVE_KEY, "{not json");
  assert.equal(gameModule.loadRun(), null);
  window.localStorage.setItem(gameModule.SAVE_KEY, JSON.stringify({ v: 1, phase: "shop" }));
  assert.equal(gameModule.loadRun(), null);

  const realStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    assert.equal(gameModule.loadRun(), null);
    gameModule.render(); // saving with storage blocked must not throw
  } finally {
    Object.defineProperty(window, "localStorage", realStorage);
  }
});

test("shop: New Run needs a second click, then starts a fresh run and saves it", async () => {
  window.localStorage.clear();
  dealtState({ target: 1 });
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();
  await sleep(PLAY_WAIT_MS);
  assert.equal(gameModule._getState().phase, "shop");

  const btn = document.getElementById("new-run-btn");
  assert.ok(!btn.classList.contains("hidden"));
  btn.click();
  assert.equal(gameModule._getState().phase, "shop"); // first click only arms it
  assert.ok(btn.classList.contains("confirm"));
  btn.click();
  await sleep(DEAL_ANIMATION_MS);
  const state = gameModule._getState();
  assert.equal(state.phase, "playing");
  assert.equal(state.ante, 1);
  assert.equal(state.money, 4);
  assert.equal(savedRun().phase, "playing");
  assert.ok(btn.classList.contains("hidden"));
  assert.equal(btn.textContent, "New Run");
});

test("shop: an armed New Run button disarms itself", async () => {
  dealtState({ target: 1 });
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();
  await sleep(PLAY_WAIT_MS);
  const btn = document.getElementById("new-run-btn");
  btn.click();
  assert.ok(btn.classList.contains("confirm"));
  await sleep(gameModule.NEW_RUN_CONFIRM_MS + 50);
  assert.ok(!btn.classList.contains("confirm"));
  assert.equal(btn.textContent, "New Run");
  assert.equal(gameModule._getState().phase, "shop");
});
