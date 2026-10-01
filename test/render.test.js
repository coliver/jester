// UI/wiring tests: render()/renderOverlay()/initApp() and the DOM event
// wiring that connects buttons to actions — the layer game-flow.test.js
// can't reach (it drives the state machine directly, without a DOM).
//
// jsdom's own `window.eval()` runs code in a separate V8 context that
// Node's coverage instrumentation can't see, so code executed that way
// never shows up as covered even when the tests genuinely exercise it.
// Instead: build one jsdom document from the real index.html, attach it to
// Node's own `global.document`/`global.window`, and `require("../game.js")`
// normally — that runs in the same (instrumented) context node:test tracks,
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

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const dom = new JSDOM(HTML, { url: "https://example.test/jester/" });
global.window = dom.window;
global.document = dom.window.document;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEAL_ANIMATION_MS = 450; // startRound()'s real deal delay is 420ms

// document/window are on the global now, so this require() runs game.js's
// real browser entry point (initApp(): wires the buttons below once for the
// whole file, deals an initial hand via the animated setTimeout path, etc).
const gameModule = require("../game.js");

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

test("clicking Play Hand scores the selection and refills the hand", () => {
  dealtState();
  const cards = [...document.querySelectorAll("#hand-row .card")].slice(0, 2);
  cards.forEach((c) => c.click());

  document.getElementById("play-btn").click();

  const after = gameModule._getState();
  assert.equal(after.handsLeft, 3);
  assert.equal(document.querySelectorAll("#hand-row .card").length, 8);
  assert.equal(document.querySelectorAll("#hand-row .card.selected").length, 0);
  assert.equal(text("hands-val"), "3");
  assert.equal(text("score-val"), `${after.roundScore} / ${after.target}`);
  assert.ok(after.roundScore > 0);
});

// --- shop overlay + buy/sell/reroll wiring ---------------------------------

test("winning a round opens the shop overlay with working buy/sell/reroll buttons", () => {
  dealtState({ target: 1 }); // any hand clears it
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();

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

test("running out of hands opens the Game Over overlay; Restart resets the run", () => {
  dealtState({ target: Number.MAX_SAFE_INTEGER, handsLeft: 1 }); // one hand left, unreachable target
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();

  assert.equal(gameModule._getState().phase, "gameover");
  assert.ok(!document.getElementById("overlay").classList.contains("hidden"));
  assert.equal(text("overlay-title"), "Game Over");
  assert.ok(document.getElementById("reroll-btn").classList.contains("hidden"));
  assert.equal(text("overlay-btn"), "Restart");

  document.getElementById("overlay-btn").click(); // -> restart() -> startRound() (animated)
  assert.equal(gameModule._getState().phase, "playing");
  assert.equal(gameModule._getState().ante, 1);
  assert.equal(gameModule._getState().handsLeft, 4);
  assert.ok(document.getElementById("overlay").classList.contains("hidden"));
});

// --- win overlay -------------------------------------------------------------

test("clearing the final ante opens the You Win overlay", () => {
  dealtState({ ante: 8, round: 3, target: 1 }); // FINAL_ANTE, ROUNDS_PER_ANTE
  document.querySelector("#hand-row .card").click();
  document.getElementById("play-btn").click();

  assert.equal(gameModule._getState().phase, "win");
  assert.equal(text("overlay-title"), "You Win!");
  assert.match(text("overlay-sub"), /Cleared Ante 8/);
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
    // own rankNum, same as sortedHand() does in game.js.
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

test("shop: voucher offer renders, buys via its button, and is listed as owned", () => {
  const voucher = gameModule.VOUCHER_POOL[0];
  dealtState({ phase: "shop", shopVoucher: voucher, money: 20, vouchers: [] });
  gameModule.render();
  const item = document.querySelector("#shop-voucher .shop-item");
  assert.match(item.textContent, new RegExp(voucher.name));
  item.querySelector("button").click();
  assert.equal(gameModule._getState().vouchers.length, 1);
  assert.equal(document.querySelectorAll("#shop-voucher .shop-item").length, 0);
  assert.match(document.getElementById("owned-vouchers").textContent, new RegExp(voucher.name));
});

test("shop: an unaffordable voucher is marked unaffordable", () => {
  dealtState({ phase: "shop", shopVoucher: gameModule.VOUCHER_POOL[0], money: 0, vouchers: [] });
  gameModule.render();
  const item = document.querySelector("#shop-voucher .shop-item");
  assert.ok(item.classList.contains("unaffordable"));
  assert.ok(item.querySelector("button").disabled);
});
