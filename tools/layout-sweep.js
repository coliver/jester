"use strict";

// Layout sweep: loads the real page headless at a spread of viewports and checks the play
// screen and the shop for the things that go wrong when the layout doesn't scale: page overflow,
// boxes leaving the viewport or overlapping, clipped card faces, and cards too small to read.
// One line per failure, so it is cheap to run and to read.
//
//   node tools/layout-sweep.js            # all viewports
//   node tools/layout-sweep.js 844x390    # just one
//
// Needs playwright-core (not a project dependency): set PLAYWRIGHT_CORE to its path, or have it
// resolvable from here. Dev tool only; the game ships with no build step.

const path = require("node:path");

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_CORE, "playwright-core", "playwright"].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch { /* try the next */ }
  }
  console.error("playwright-core not found: set PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core");
  process.exit(2);
}

const VIEWPORTS = [
  [667, 375], [740, 360], [844, 390], [844, 340], [932, 430],
  [1024, 768], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1080], [2560, 1440],
  [768, 1024], [1024, 1366], [390, 844],
];
// 568x320 and smaller are out of scope (the supported floor is about 640x360).
const MIN_CARD_W = 44; // narrower than this and a rank index stops being legible
const TOL = 1.5;

// Fill the run so the page is as crowded as it gets: every jester slot, masks and decrees,
// an oversized hand, a boss banner.
const CROWD = `(() => {
  const t = window.__jesterTest;
  const s = t._getState();
  s.money = 9999;
  t.setDebugShop(true);
  for (const o of [...s.shopOffers]) { if (s.jesters.length < 5) t.buyJester(o.id); }
  for (const o of [...s.shopTricks]) t.buyTrick(o.id);
  for (const o of [...s.shopDecrees]) t.buyDecree(o.id);
  t.setDebugShop(false);
  s.hand.push(...draw(3));
  s.bossModifier = BOSS_MODIFIERS[0];
  t.render();
  return { jesters: s.jesters.length, tricks: s.tricks.length, hand: s.hand.length };
})()`;
const SHOP = `(() => { const t = window.__jesterTest; t.setDebugShop(true); })()`;

// Runs in the page: returns a list of problem strings.
function inspect({ kind, MIN_CARD_W, TOL }) {
  const out = [];
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

async function main() {
  const { chromium } = loadPlaywright();
  const only = process.argv[2];
  const list = only ? [only.split("x").map(Number)] : VIEWPORTS;
  const url = "file://" + path.resolve(__dirname, "..", "index.html") + "?debug";
  const browser = await chromium.launch();
  let failures = 0;
  for (const [w, h] of list) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__JESTER_TEST__ = true; try { localStorage.clear(); } catch { /* none */ } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__jesterTest);
    await page.waitForTimeout(600); // let the deal animation settle
    const runs = [["play", null], ["play-crowded", CROWD], ["shop", SHOP]];
    const lines = [];
    for (const [name, setup] of runs) {
      if (name === "shop" && !(w > h)) continue;
      if (setup) {
        const r = await page.evaluate(setup);
        if (name === "play-crowded" && r && (r.jesters < 5)) lines.push(`  note: crowd setup only reached ${JSON.stringify(r)}`);
        await page.waitForTimeout(700);
      }
      const kind = name === "shop" ? "shop" : "play";
      const { info, out } = await page.evaluate(inspect, { kind, MIN_CARD_W, TOL });
      lines.push(`  ${out.length ? "FAIL" : "ok  "} ${name.padEnd(13)} ${info}${out.length ? ": " + out.join("; ") : ""}`);
      failures += out.length;
    }
    if (errors.length) { lines.push(`  FAIL page errors: ${errors.join(" | ")}`); failures += errors.length; }
    console.log(`${w}x${h}`);
    console.log(lines.join("\n"));
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} problem(s)` : "\nall viewports clean");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(2); });
