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

test("shop: tarot offers and both packs render, and a tarot buys into a slot", () => {
  const tarot = gameModule.TAROT_POOL[0];
  dealtState({ phase: "shop", money: 20, shopTarots: [tarot], shopTricks: [], packAvailable: true, tarotPackAvailable: true });
  gameModule.render();
  const items = [...document.querySelectorAll("#shop-tricks .shop-item")];
  assert.equal(items.length, 1);
  assert.match(items[0].textContent, new RegExp(tarot.name));
  const packs = [...document.querySelectorAll("#shop-packs .shop-item")];
  assert.equal(packs.length, 2);
  assert.match(packs[1].textContent, /Tarot Pack/);
  items[0].querySelector("button").click();
  assert.equal(gameModule._getState().tricks[0].id, tarot.id);
});

test("tarot Use button enables only with a valid selection and edits the hand card", () => {
  const tarot = gameModule.TAROT_POOL.find((t) => t.id === "tarot_lovers");
  const state = dealtState({ tricks: [{ ...tarot }] });
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

test("tarot cards load optional art, and a missing file leaves the glyph", () => {
  const tarot = gameModule.TAROT_POOL[0];
  dealtState({ tricks: [{ ...tarot }] });
  gameModule.render();
  const card = document.querySelector("#trick-row .trick");
  const img = card.querySelector(".tarot-art");
  assert.equal(img.getAttribute("src"), `assets/tarot/${tarot.id}.png`);
  assert.ok(img.hidden);
  failToLoad(img);
  assert.equal(card.querySelector(".tarot-art"), null);
  assert.ok(!card.querySelector(".trick-glyph").hidden);
  // ...and when the file loads, the art replaces the glyph.
  gameModule.render();
  const loaded = document.querySelector("#trick-row .tarot-art");
  new Function(loaded.getAttribute("onload")).call(loaded);
  assert.ok(!loaded.hidden);
  assert.ok(document.querySelector("#trick-row .trick-glyph").hidden);
});

test("an open tarot pack is titled as one and blocks Take when slots are full", () => {
  const { TAROT_POOL } = gameModule;
  dealtState({
    phase: "shop", pack: TAROT_POOL.slice(0, 3), packKind: "tarot",
    tricks: [{ ...TAROT_POOL[3] }, { ...TAROT_POOL[4] }],
  });
  gameModule.render();
  assert.match(text("pack-title"), /^Tarot Pack/);
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
