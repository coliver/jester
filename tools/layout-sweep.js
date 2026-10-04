"use strict";

// Layout sweep: loads the real page headless at a spread of viewports and checks the play
// screen and the shop for the things that go wrong when the layout doesn't scale: page overflow,
// boxes leaving the viewport or overlapping, clipped card faces, and cards too small to read.
// One line per failure, so it is cheap to run and to read. Also saves a screenshot of every
// viewport x scenario combination to SCREENSHOT_DIR, labeled with the device/scenario in the
// image itself (top-left banner), for a human to actually look at.
//
//   node tools/layout-sweep.js            # all viewports, real player-facing page (no ?debug)
//   node tools/layout-sweep.js 844x390    # just one
//   node tools/layout-sweep.js --debug    # faster, via ?debug's debug-shop shortcuts
//
// By default this loads the page with no ?debug param, same as a real player (no debug buttons;
// debugWinRound/setDebugShop/addDebugMoney are all no-ops without it), and reaches the crowded/
// shop states through genuine production calls: finishRoundWin() (the real win-a-round function,
// never gated) stands in for debugWinRound()+setDebugShop(), and nextRound() carries the
// purchases back to a fresh "playing" round instead of toggling the debug-shop overlay. That's
// slower (plays through real round transitions) but screenshots exactly what a player would see.
// --debug is the opt-in exception, for a quicker pass when you already trust the real path and
// just want a fast look; its screenshots go in SCREENSHOT_DIR/debug/ so they can't be mistaken
// for the real thing or silently overwrite it.
//
// Needs playwright-core (not a project dependency): set PLAYWRIGHT_CORE to its path, or have it
// resolvable from here. Dev tool only; the game ships with no build step.

const path = require("node:path");
const fs = require("node:fs");

const DEBUG = process.argv.includes("--debug");
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR
  || path.resolve(__dirname, "screenshots", ...(DEBUG ? ["debug"] : []));

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_CORE, "playwright-core", "playwright"].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch { /* try the next */ }
  }
  console.error("playwright-core not found: set PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core");
  process.exit(2);
}

// Named entries pin the sweep to real devices instead of round numbers, so "does this still
// work on an actual Pixel 8 Pro" has a definite answer. Picked by install base, not novelty:
// iPhone 13 and 15 are (as of 2026) the most and second-most common iPhone models, and Pixel 8
// Pro / Galaxy S24 Ultra are this generation's flagship Android devices. CSS viewport sizes
// (not physical-pixel resolutions) from each device's devtools/user-agent profile. Phones are
// landscape only (portrait phones get the rotate prompt, checked separately below); where two
// heights are given for the same width, the taller is the browser chrome's resting state and
// the shorter is with its toolbar expanded (e.g. before the page has scrolled).
const VIEWPORTS = [
  [844, 390, "iPhone 13/14 (most common iPhone) landscape"],
  [844, 340, "iPhone 13/14 landscape, toolbar expanded"],
  [852, 393, "iPhone 15 (2nd most common iPhone) landscape"],
  [852, 343, "iPhone 15 landscape, toolbar expanded"],
  [997, 448, "Pixel 8 Pro landscape"],
  [1040, 480, "Galaxy S24 Ultra landscape"],
  [667, 375, "small phone (iPhone SE-class) landscape"],
  [740, 360, "small Android phone landscape"],
  [932, 430, "iPhone 14/15 Pro Max landscape"],
  [1024, 768, "iPad (classic 4:3) landscape"],
  [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1080], [2560, 1440],
  [768, 1024, "iPad (classic 4:3) portrait"],
  [1024, 1366, "iPad Pro 12.9\" portrait"],
  [390, 844, "iPhone 13/14 portrait (rotate prompt check)"],
];
// 568x320 and smaller are out of scope (the supported floor is about 640x360).
const MIN_CARD_W = 44; // narrower than this and a rank index stops being legible
const TOL = 1.5;
// Every jester, mask/decree and playing card is meant to render at the same --card-w (see the
// LAYOUT CONTRACT and "Every jester, mask, decree..." comments in styles.css). A couple of px is
// the jester's own border eating into its percentage width; anything past that is the row
// actually squeezing one card type and not another.
const CARD_PARITY_TOL = 4;

// Fill the run so the page is as crowded as it gets: both slot-upgrade props (Wide Stage, Mask
// Rack), every jester and mask/decree slot that opens up because of them, an oversized hand, a
// boss banner.
const CROWD = `(() => {
  const t = window.__jesterTest;
  const s = t._getState();
  s.money = 9999;
  s.props = [...(s.props || []), ...PROP_POOL.filter((p) => p.id === "wide_stage" || p.id === "trick_tray")];
  t.setDebugShop(true);
  for (const o of [...s.shopOffers]) { if (s.jesters.length < jesterSlots()) t.buyJester(o.id); }
  for (const o of [...s.shopTricks]) t.buyTrick(o.id);
  for (const o of [...s.shopDecrees]) t.buyDecree(o.id);
  t.setDebugShop(false);
  s.hand.push(...draw(3));
  s.bossModifier = BOSS_MODIFIERS[0];
  t.render();
  return { jesters: s.jesters.length, tricks: s.tricks.length, hand: s.hand.length };
})()`;
const SHOP = `(() => { const t = window.__jesterTest; t.setDebugShop(true); })()`;

// Same end state as CROWD, through the real win-a-round path instead of the debug shop: win
// the round for real (rolls real offers), buy to the same limits, then carry it into a fresh
// round with nextRound() so the final render is the ordinary "playing" screen, not an overlay.
// finishRoundWin() plays the Backstage intro (see NODEBUG_SHOP below), but this scenario is
// about the crowded PLAY screen, not the shop - waiting out an intro nobody's going to look at
// would just be slow for nothing, so instead this skips it outright: #iris lives outside
// #overlay (it's the stage-light wipe over the whole page, not part of the shop card), so
// hiding #overlay on the way back to "playing" leaves it exactly as it was, mid-animation, a
// black circle stuck over the play screen until its own "iris-open" animationend fires - which
// never happens here, since reaching nextRound() this fast means the real reveal sequence that
// would normally fire it never gets to run. No real player can hit this (you can't call
// "Next Audience" before the shop has even opened); it's purely an artifact of skipping the
// intro programmatically, so it's cleaned up here rather than worked around at the game level.
const NODEBUG_CROWD = `(() => {
  const t = window.__jesterTest;
  const s = t._getState();
  t.finishRoundWin();
  s.money = 9999;
  s.props = [...(s.props || []), ...PROP_POOL.filter((p) => p.id === "wide_stage" || p.id === "trick_tray")];
  for (const o of [...s.shopOffers]) { if (s.jesters.length < jesterSlots()) t.buyJester(o.id); }
  for (const o of [...s.shopTricks]) t.buyTrick(o.id);
  for (const o of [...s.shopDecrees]) t.buyDecree(o.id);
  document.getElementById("iris").classList.remove("on");
  document.getElementById("overlay").classList.remove("irised");
  document.getElementById("top-row").classList.remove("dim"); // lives in #app, not #overlay, so hiding the shop doesn't undim it
  for (const el of [document.getElementById("iris"), document.getElementById("overlay"), document.getElementById("top-row")]) {
    for (const a of el.getAnimations()) a.cancel();
  }
  t.nextRound();
  s.hand.push(...draw(3));
  s.bossModifier = BOSS_MODIFIERS[0];
  t.render();
  return { jesters: s.jesters.length, tricks: s.tricks.length, hand: s.hand.length };
})()`;
// Win the round for real; finishRoundWin() is never debug-gated, so this needs no toggle at
// all. Unlike the debug shortcut, a real win plays the Backstage intro (iris wipe, applause,
// the ledger counting up, the shelves dealing in dim-then-lit) before the shop settles - the
// main loop waits for #shop-main to stop being .dim before it screenshots.
const NODEBUG_SHOP = `(() => { const t = window.__jesterTest; t.finishRoundWin(); t.render(); })()`;

// Runs in the page: returns a list of problem strings.
function inspect({ kind, MIN_CARD_W, TOL, CARD_PARITY_TOL }) {
  const out = [];
  // All card-shaped faces should be the same size. Compares offsetWidth (the laid-out box,
  // unaffected by the hand's fan/hover transforms) across whichever of the given selectors
  // actually have an element on screen; skips the check entirely if fewer than two do.
  const checkParity = (label, selectors) => {
    const sizes = {};
    for (const [name, sel] of Object.entries(selectors)) {
      const el = document.querySelector(sel);
      if (el) sizes[name] = el.offsetWidth;
    }
    const vals = Object.values(sizes);
    if (vals.length < 2) return;
    if (Math.max(...vals) - Math.min(...vals) > CARD_PARITY_TOL) {
      const detail = Object.entries(sizes).map(([n, v]) => `${n} ${v}px`).join(", ");
      out.push(`${label} sizes don't match: ${detail}`);
    }
  };
  const W = innerWidth, H = innerHeight;
  const landscape = W > H;
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? r : null;
  };
  const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w"));
  const firstCard = document.querySelector("#hand-row .card");
  const realCardW = firstCard ? firstCard.offsetWidth : null; // layout size, ignoring any transform mid-animation
  const info = `card ${Math.round(realCardW ?? cardW)}px`;

  if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${W})`);
  if (landscape && document.documentElement.scrollHeight > H + 1) out.push(`page scrolls vertically (${document.documentElement.scrollHeight} > ${H})`);

  const within = (name, r) => {
    if (!r) return;
    if (r.left < -TOL || r.right > W + TOL || (landscape && (r.top < -TOL || r.bottom > H + TOL))) {
      out.push(`${name} outside viewport (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)})`);
    }
  };

  if (kind === "shop") {
    for (const sel of ["#overlay-bar", "#overlay-btn", "#reroll-btn", "#shop-money", "#shop-stock"]) within(sel, box(sel));
    const bar = document.querySelector("#overlay-bar");
    if (bar && bar.scrollWidth > bar.clientWidth + 1) out.push("shop bar content wider than the bar");
    const stock = document.querySelector("#shop-stock");
    if (stock && stock.scrollWidth > stock.clientWidth + 1) out.push("shop stock scrolls sideways");
    const items = [...document.querySelectorAll("#shop-stock .shop-item")];
    if (items.length && items[0].offsetWidth < MIN_CARD_W) out.push(`shop cards under ${MIN_CARD_W}px wide`);
    checkParity("shop", { jester: "#shop-items .jester", trick: "#shop-tricks .trick", prop: "#shop-prop .trick" });
    return { info: `card ${Math.round(items[0]?.offsetWidth ?? 0)}px`, out };
  }

  // Play screen. Portrait narrow shows the rotate prompt instead of the game.
  if (!landscape && W <= 600) {
    const rp = box("#rotate-prompt");
    if (!rp) out.push("narrow portrait but no rotate prompt");
    return { info: "rotate prompt", out };
  }

  const sections = ["#hud", "#preview", "#amusement", "#boss-banner", "#top-row", "#play-area", "#hand-area", "#controls"];
  const boxes = sections.map((s) => [s, box(s)]).filter(([, r]) => r);
  const side = document.querySelector("#side-tools");
  if (side) for (const ch of side.children) { const r = ch.getBoundingClientRect(); if (r.width) boxes.push([`#side-tools>${ch.id || ch.tagName}`, r]); }
  for (const [n, r] of boxes) within(n, r);
  // Sections must not sit on top of each other (the side column and the table are separate columns).
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [na, a] = boxes[i], [nb, b] = boxes[j];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > TOL && oy > TOL) out.push(`${na} overlaps ${nb} by ${Math.round(ox)}x${Math.round(oy)}`);
    }
  }
  const hr = box("#hand-row");
  for (const c of document.querySelectorAll("#hand-row .card")) {
    const r = c.getBoundingClientRect();
    if (r.left < -TOL || r.right > W + TOL) { out.push("a hand card is off-screen sideways"); break; }
  }
  if (hr && landscape) {
    const cards = [...document.querySelectorAll("#hand-row .card")];
    if (cards.length > 1) {
      const a = cards[0].getBoundingClientRect(), b = cards[1].getBoundingClientRect();
      const visible = (b.left - a.left) / a.width;
      if (visible < 0.4) out.push(`hand cards overlap heavily (${Math.round(visible * 100)}% of each card visible)`);
    }
  }
  if (realCardW !== null && realCardW < MIN_CARD_W) out.push(`cards under ${MIN_CARD_W}px wide`);
  checkParity("card/jester/mask", { card: "#hand-row .card", jester: "#jester-row .jester", trick: "#trick-row .trick" });
  // Card faces use overflow:hidden, so clipped text shows up as scrollHeight > clientHeight.
  let clipped = 0;
  for (const el of document.querySelectorAll("#jester-row .jester, #trick-row .trick")) {
    if (el.scrollHeight > el.clientHeight + 1) clipped++;
  }
  if (clipped) out.push(`${clipped} jester/mask face(s) with clipped content`);
  const tr = box("#trick-row"), tg = box("#top-row");
  if (tr && tg && tr.right > tg.right + TOL) out.push("trick row spills out of the top row");
  return { info, out };
}

// Stamps a label banner into the top-left corner of the page itself, so a screenshot is
// identifiable on sight without having to match it back up to a filename.
async function labelPage(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("__layout_sweep_label");
    if (!el) {
      el = document.createElement("div");
      el.id = "__layout_sweep_label";
      el.style.cssText = "position:fixed;top:0;left:0;z-index:2147483647;background:#000;" +
        "color:#4f6;font:bold 13px/1.4 monospace;padding:3px 7px;white-space:pre;pointer-events:none;";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

// Filesystem-safe name for a device label/scenario, used as (part of) a screenshot filename.
function slug(s) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function main() {
  const { chromium } = loadPlaywright();
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const list = only ? [only.split("x").map(Number)] : VIEWPORTS;
  const url = "file://" + path.resolve(__dirname, "..", "index.html") + (DEBUG ? "?debug" : "");
  fs.rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  let failures = 0;
  for (const [w, h, device] of list) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__JESTER_TEST__ = true; try { localStorage.clear(); } catch { /* none */ } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__jesterTest);
    await page.waitForTimeout(600); // let the deal animation settle
    const runs = [["play", null], ["play-crowded", DEBUG ? CROWD : NODEBUG_CROWD], ["shop", DEBUG ? SHOP : NODEBUG_SHOP]];
    const lines = [];
    for (const [name, setup] of runs) {
      if (name === "shop" && !(w > h)) continue;
      if (setup) {
        const r = await page.evaluate(setup);
        if (name === "play-crowded" && r && (r.jesters < 5)) lines.push(`  note: crowd setup only reached ${JSON.stringify(r)}`);
        await page.waitForTimeout(700);
      }
      const kind = name === "shop" ? "shop" : "play";
      if (kind === "shop") {
        // A real win (no-debug mode) plays the Backstage intro before the shelves light up:
        // the iris, the ledger counting up with flying coins, then the shelves dealing in with
        // a per-card stagger - all separate CSS/Web Animations timelines, so waiting for .dim
        // to clear alone still lands mid-deal. The debug shortcut skips all of it, so both
        // waits resolve immediately there.
        await page.waitForFunction(() => !document.getElementById("shop-main")?.classList.contains("dim"), { timeout: 10000 }).catch(() => {});
        // Scoped to the overlay/iris/ledger-flier (the same scope overlay.js's own hurryIntro()
        // uses to fast-forward the intro on a tap): the play screen's hand cards bob forever in
        // the background and would make an unscoped "any animation running" check never settle.
        await page.waitForFunction(
          () => document.getAnimations().every((a) => a.playState !== "running" || !a.effect?.target?.closest?.("#overlay, #iris, .ledger-flier")),
          { timeout: 10000 },
        ).catch(() => {});
      }
      const { info, out } = await page.evaluate(inspect, { kind, MIN_CARD_W, TOL, CARD_PARITY_TOL });
      lines.push(`  ${out.length ? "FAIL" : "ok  "} ${name.padEnd(13)} ${info}${out.length ? ": " + out.join("; ") : ""}`);
      failures += out.length;
      const label = `${w}x${h}${device ? "  " + device : ""}\n${name}  ${info}${out.length ? "  [" + out.length + " problem(s)]" : ""}`;
      await labelPage(page, label);
      const file = `${String(w).padStart(4, "0")}x${String(h).padStart(4, "0")}-${slug(name)}${device ? "-" + slug(device) : ""}.png`;
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, file) });
    }
    if (errors.length) { lines.push(`  FAIL page errors: ${errors.join(" | ")}`); failures += errors.length; }
    console.log(`${w}x${h}${device ? "  " + device : ""}`);
    console.log(lines.join("\n"));
    await ctx.close();
  }
  await browser.close();
  console.log(`\nscreenshots: ${SCREENSHOT_DIR}`);
  console.log(failures ? `\n${failures} problem(s)` : "\nall viewports clean");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(2); });
