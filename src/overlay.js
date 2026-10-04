// --- Shop screen ------------------------------------------------------------

// What the shop has already dealt in, so a re-render after a purchase only
// animates cards that are actually new; and which payout the count-up last ran for.
const shopSeen = new Set();
let shopIntroFor = null;
let shopStartMoney = null; // the purse before this shop's payout, for its ledger; null when unknown (a reloaded shop)
let moneyTick = 0;

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// FLIP for cards moving between the hand and the play area: measure before the
// re-render, then slide each card from where it was to where it landed.
function cardRects(ids) {
  const wanted = new Set(ids.map(String));
  const rects = new Map();
  for (const el of document.querySelectorAll(".card[data-card-id]")) {
    if (wanted.has(el.dataset.cardId)) rects.set(el.dataset.cardId, el.getBoundingClientRect());
  }
  return rects;
}

function flipCards(from) {
  if (prefersReducedMotion() || typeof document.documentElement.animate !== "function") return;
  for (const el of document.querySelectorAll(".card[data-card-id]")) {
    const was = from.get(el.dataset.cardId);
    if (!was) continue;
    const now = el.getBoundingClientRect();
    el.animate(
      [{ translate: `${was.left - now.left}px ${was.top - now.top}px` }, { translate: "0 0" }],
      { duration: 240, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)" },
    );
  }
}

// The won round closes like a stage iris: the play screen dims to black, a circle of light shrinks onto
// the table and goes out, and Backstage fades up from the dark. The ledger and the shelves wait for it
// (IRIS_LEAD, matching the CSS timings). A tap anywhere does not cut it short; it runs everything
// (iris, ledger, flying coins, deals) at HURRY times speed, so it all still plays, comically fast.
const IRIS_LEAD = 2.2; // seconds until Backstage is lit enough for the ledger to start
const HURRY = 10;
let introLead = 0; // seconds the ledger and shelves wait this showing: IRIS_LEAD on a won round, else 0
let introRate = 1; // playback speed of the intro: 1, or HURRY once the player taps
let introActive = false;
const introTimers = new Set();

// A setTimeout that follows the intro's speed, so a tap can pull the pending ones forward.
function introLater(fn, ms) {
  const t = { fn, at: performance.now() + ms / introRate };
  const fire = () => { introTimers.delete(t); t.fn(); };
  t.id = setTimeout(fire, ms / introRate);
  t.fire = fire;
  introTimers.add(t);
}

function hurryIntro() {
  if (!introActive || introRate !== 1) return;
  introRate = HURRY;
  const now = performance.now();
  for (const t of introTimers) {
    clearTimeout(t.id);
    t.at = now + Math.max(0, t.at - now) / HURRY;
    t.id = setTimeout(t.fire, t.at - now);
  }
  if (typeof document.getAnimations !== "function") return;
  for (const a of document.getAnimations()) {
    if (a.effect?.target?.closest?.("#overlay, #iris, .ledger-flier")) a.playbackRate = HURRY;
  }
}

function startIntro(overlay) {
  introRate = 1;
  for (const t of introTimers) clearTimeout(t.id);
  introTimers.clear();
  introActive = true;
  introLead = prefersReducedMotion() ? 0 : IRIS_LEAD;
  // Over once the ledger has run and the last shelf has dealt in.
  introLater(() => { introActive = false; }, (introLead + 0.8 + LEDGER_FIRST + 4 * LEDGER_STEP + 2) * 1000);
  if (!introLead) return;
  const iris = document.getElementById("iris");
  const hand = document.getElementById("play-area").getBoundingClientRect();
  iris.style.setProperty("--iris-x", hand.width ? `${hand.left + hand.width / 2}px` : "50%");
  iris.style.setProperty("--iris-y", hand.height ? `${hand.top + hand.height / 2}px` : "50%");
  for (const el of [iris, overlay]) {
    el.classList.remove(el === iris ? "on" : "irised");
    void el.offsetWidth;
  }
  iris.classList.add("on");
  overlay.classList.add("irised");
}

// The round's payout as a ledger, one line per source: the label, dotted leaders, and the
// amount flush right. On the first showing the lines arrive one at a time, each paying into the
// money total below it (see showShopMoney), so the sum is worked out in front of you.
const LEDGER_FIRST = 0.15; // seconds until the first line lands
const LEDGER_STEP = 0.65; // seconds from one line to the next
const FLIGHT = 0.5; // seconds a ledger amount takes to fly into the total

function renderPayout(el, debug, earnings, animate, before) {
  el.innerHTML = "";
  const gains = [];
  const add = (label, amount, cls = "") => {
    const chip = document.createElement("span");
    chip.className = "chip " + cls;
    if (amount === undefined) {
      chip.textContent = label;
    } else {
      const amt = document.createElement("span");
      amt.className = "amt";
      amt.textContent = amount;
      const lead = document.createElement("span");
      lead.className = "lead";
      chip.append(label, lead, amt);
    }
    chip.style.setProperty("--i", el.children.length);
    el.appendChild(chip);
    return chip;
  };
  el.classList.toggle("tally", animate);
  el.style.setProperty("--ledger-first", `${LEDGER_FIRST + introLead}s`);
  el.style.setProperty("--ledger-step", `${LEDGER_STEP}s`);
  if (debug) { add("Buy and sell freely", undefined, "where"); return gains; }
  if (!earnings) return gains;
  if (before !== null) add("Purse", `$${before}`, "purse");
  const gain = (label, n) => gains.push({ chip: add(label, `+$${n}`, "gain"), amount: n, index: el.children.length - 1 });
  gain("Reward", earnings.reward);
  if (earnings.interest) gain("Interest", earnings.interest);
  if (earnings.bonus) gain("Jesters", earnings.bonus);
  return gains;
}

// Shows the money total in the shop rail. With `from`, it starts there and each ledger line in
// `gains` flies its amount down into the total in turn, which ticks up as each one lands.
function showShopMoney(from, gains = []) {
  const box = document.getElementById("shop-money");
  const val = document.getElementById("shop-money-val");
  box.classList.remove("hidden");
  const tick = ++moneyTick;
  const settle = () => { if (tick === moneyTick) val.textContent = state.money; };
  if (from === null || from === state.money || prefersReducedMotion() || typeof box.animate !== "function") {
    settle();
    return;
  }
  let shown = from;
  val.textContent = shown;
  // A tick as each line is written, including the Purse line that has nothing to fly.
  const lines = [...document.querySelectorAll("#overlay-sub .chip:not(.where)")];
  lines.forEach((line) => {
    introLater(() => { if (tick === moneyTick) Sound.ledgerLine(); }, (LEDGER_FIRST + introLead + Number(line.style.getPropertyValue("--i")) * LEDGER_STEP) * 1000);
  });
  gains.forEach(({ chip, amount, index }, n) => {
    const land = (LEDGER_FIRST + introLead + index * LEDGER_STEP + 0.3) * 1000; // after the line has landed
    introLater(() => {
      if (tick !== moneyTick) return;
      const src = chip.querySelector(".amt").getBoundingClientRect();
      const dst = val.getBoundingClientRect();
      const flier = document.createElement("span");
      flier.className = "ledger-flier";
      flier.textContent = `+$${amount}`;
      flier.style.left = `${src.left}px`;
      flier.style.top = `${src.top}px`;
      document.body.appendChild(flier);
      Sound.ledgerFly();
      const dx = dst.left + dst.width / 2 - src.left - src.width / 2, dy = dst.top - src.top;
      flier.animate(
        [{ transform: "none", opacity: 1 }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 14}px) scale(1.25)`, opacity: 1, offset: 0.55 }, { transform: `translate(${dx}px, ${dy}px) scale(0.8)`, opacity: 0 }],
        { duration: FLIGHT * 1000 / introRate, easing: "cubic-bezier(0.4, 0, 0.7, 1)", fill: "forwards" },
      ).onfinish = () => {
        flier.remove();
        if (tick !== moneyTick) return;
        shown += amount;
        val.textContent = n === gains.length - 1 ? state.money : shown;
        box.classList.remove("bump");
        void box.offsetWidth;
        box.classList.add("bump");
        const landed = val.getBoundingClientRect();
        coinBurst(landed.right - 6, landed.top + landed.height / 2, n === gains.length - 1 ? 22 : 10);
        Sound.coinTally(n, n === gains.length - 1);
        if (n === gains.length - 1) Sound.ledgerDone();
      };
    }, land);
  });
  if (!gains.length) settle();
}

// Debug: replays the ledger and fly-out sequence in the open shop (Backstage or the debug shop), with the last real
// payout or a made-up one, starting the total from what it would have been before it.
function debugReplayPayout() {
  if (!DEBUG_ENABLED || !inShop()) return;
  const earnings = state.lastEarnings || { reward: 5, interest: 2, bonus: 3 };
  const from = Math.max(0, state.money - (earnings.reward + earnings.interest + earnings.bonus));
  introRate = 1;
  introLead = 0;
  const gains = renderPayout(document.getElementById("overlay-sub"), false, earnings, true, from);
  showShopMoney(from, gains);
}

// The shop starts below the play screen's top row, wherever the layout puts it. It's also
// framed so the ledger rail ends exactly where the top row begins and the stock reaches
// exactly to the top row's right edge: the lifted-up top row is positioned by #app, which
// knows nothing about the overlay, so without this a wide top row (e.g. an extra jester
// slot from Wide Stage) can land under the ledger rail instead of beside it. See the
// "framed to the play screen's own #app box" comment on #overlay-card.

// A breathing gap between the ledger rail and the top row beside it, matching #overlay-bar's
// own padding, so the leftmost jester isn't flush against the rail.
const SHOP_GAP = 16;
function syncShopTop() {
  const row = document.getElementById("top-row").getBoundingClientRect();
  const overlay = document.getElementById("overlay");
  overlay.style.setProperty("--top-bottom", `${Math.ceil(row.bottom)}px`);
  const barWidth = document.getElementById("overlay-bar").getBoundingClientRect().width;
  // Clamped to 0: on a narrow landscape viewport, the play screen's own left gutter can be
  // narrower than the ledger rail plus this gap, and the rail must stay on screen even at the
  // cost of shrinking (or losing) the gap and overlapping the top row a little, same as this
  // layout already lived with before the shop was framed to it.
  const left = Math.max(0, Math.round(row.left - barWidth - SHOP_GAP));
  overlay.style.setProperty("--shop-left", `${left}px`);
  overlay.style.setProperty("--shop-width", `${Math.round(row.right) - left}px`);
}

// A tap on a "Full" tag: the count of slots used shakes, with a knock.
function denyFull(countId) {
  const el = document.getElementById(countId);
  Sound.deny();
  if (prefersReducedMotion()) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

// A burst of gold coins and glints thrown from a point, which fall under a little gravity.
function coinBurst(x, y, count) {
  if (typeof document.body.animate !== "function") return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "coin-particle" + (i % 3 === 0 ? " glint" : "");
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    document.body.appendChild(p);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; // mostly upward
    const speed = 40 + Math.random() * 70;
    const dx = Math.cos(angle) * speed, dy = Math.sin(angle) * speed;
    p.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(1)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px, ${dy + 70}px) scale(0.4)`, opacity: 0 },
      ],
      { duration: 550 + Math.random() * 300, easing: "ease-out", fill: "forwards" },
    ).onfinish = () => p.remove();
  }
}

// The price tag under an offer is its Buy button, so an offer is just its card and its price.
// When the only thing stopping the purchase is a full slot row, the tag says "Full" instead of a red price.
function buyHTML(price, canBuy, full = false) {
  // A full tag stays clickable: pressing it shakes the slot count, which says why it can't be bought.
  return `<button class="buy-btn${full ? " full" : ""}" aria-label="${full ? "No free slot" : `Buy for $${price}`}" ${canBuy || full ? "" : "disabled"}>${full ? "Full" : `$${price}`}</button>`;
}

function endScreen(overlay) {
  overlay.classList.add("end");
  document.getElementById("shop-money").classList.add("hidden");
  shopSeen.clear();
  shopIntroFor = null;
  shopStartMoney = null;
}

// The end-of-run summary: how far the run got, its stats, and its seed (to copy or replay).
function runSummaryRows(s) {
  const { stats } = s;
  const favourite = Object.entries(stats.handCounts).sort((a, b) => b[1] - a[1])[0];
  const rows = [
    ["Reached", `${venueName(s.venue)}, ${audienceName(s.round)}`],
    ["Hands played", stats.handsPlayed],
    ["Discards used", stats.discards],
    ["Best hand", stats.bestHand ? `${stats.bestHand.score.toLocaleString()} (${stats.bestHand.name})` : "none"],
    ["Favourite hand", favourite ? `${favourite[0]} (${favourite[1]}×)` : "none"],
    ["Money", `$${s.money}`],
    ["Jesters", s.jesters.length ? s.jesters.map(j => j.name).join(", ") : "none"],
  ];
  return rows;
}

function showRunSummary() {
  const box = document.getElementById("run-summary");
  box.innerHTML = "";
  const dl = document.createElement("dl");
  for (const [label, value] of runSummaryRows(state)) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  box.appendChild(dl);
  const replay = document.getElementById("replay-btn");
  if (state.seed) {
    const seedLine = document.createElement("p");
    seedLine.className = "seed-line";
    seedLine.append("Seed ");
    const code = document.createElement("code");
    code.textContent = state.seed;
    const copy = document.createElement("button");
    copy.className = "seed-copy";
    copy.textContent = "Copy link";
    copy.addEventListener("click", () => copySeedLink(state.seed, copy));
    seedLine.append(code, copy);
    box.appendChild(seedLine);
    replay.classList.remove("hidden");
    replay.onclick = () => restart(state.seed);
  } else {
    replay.classList.add("hidden");
  }
  box.classList.remove("hidden");
}

function copySeedLink(seed, btn) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("seed", seed);
  const done = () => { btn.textContent = "Copied"; setTimeout(() => { btn.textContent = "Copy link"; }, 1500); };
  try {
    navigator.clipboard.writeText(url.toString()).then(done, () => { btn.textContent = url.toString(); });
  } catch {
    btn.textContent = url.toString();
  }
}

function renderOverlay() {
  const overlay = document.getElementById("overlay");
  const rerollBtn = document.getElementById("reroll-btn");
  const moneyBtn = document.getElementById("money-btn");
  const debug = state.phase === "playing" && state.debugShop;
  moneyBtn.classList.toggle("hidden", !debug);
  document.getElementById("payout-btn").classList.toggle("hidden", !(DEBUG_ENABLED && (debug || state.phase === "shop")));
  if (state.phase !== "win" && state.phase !== "gameover") {
    document.getElementById("run-summary").classList.add("hidden");
    document.getElementById("replay-btn").classList.add("hidden");
  }
  document.getElementById("new-run-btn").classList.toggle("hidden", state.phase !== "shop");
  if (state.phase === "shop" || debug) {
    overlay.classList.remove("hidden", "end");
    document.getElementById("overlay-title").textContent = debug ? "Debug shop" : "Backstage";
    const earnings = state.lastEarnings;
    const intro = !debug && !!earnings && earnings !== shopIntroFor;
    if (intro) {
      shopIntroFor = earnings;
      shopSeen.clear();
    }
    if (intro) {
      startIntro(overlay);
      Sound.applause(); // the house applauds the won round as the audience leaves
    }
    if (intro) shopStartMoney = state.money - (earnings.reward + earnings.interest + earnings.bonus);
    const gains = renderPayout(document.getElementById("overlay-sub"), debug, earnings, intro, shopStartMoney);
    showShopMoney(intro ? shopStartMoney : null, gains);

    // The shelves (and the top row of jesters/cards floating above them) stay dark and locked
    // under the ledger while the money counts up, then deal in, swoosh, and light up together
    // once the last coin has landed (lineCount includes the Purse line).
    const shopMain = document.getElementById("shop-main");
    const topRow = document.getElementById("top-row");
    const lineCount = 1 + gains.length;
    const shelfDelay = intro ? introLead + LEDGER_FIRST + (lineCount - 1) * LEDGER_STEP + 0.3 + FLIGHT + 0.3 : 0;
    overlay.style.setProperty("--d", `${shelfDelay}s`);
    if (intro) {
      shopMain.classList.add("dim");
      topRow.classList.add("dim");
      introLater(() => { shopMain.classList.remove("dim"); topRow.classList.remove("dim"); Sound.shopDeal(); }, shelfDelay * 1000);
    } else {
      shopMain.classList.remove("dim");
      topRow.classList.remove("dim");
    }

    // Offers not shown before (fresh shop, or after a reroll) deal in; a
    // re-render after a purchase leaves the rest of the shelf still.
    let dealIndex = 0;
    const dealIn = (div, id) => {
      if (shopSeen.has(id)) return;
      shopSeen.add(id);
      div.classList.add("dealt");
      div.style.setProperty("--i", dealIndex++);
    };

    const shopItems = document.getElementById("shop-items");
    shopItems.innerHTML = "";
    for (const j of state.shopOffers) {
      const div = document.createElement("div");
      div.className = "shop-item";
      dealIn(div, "j:" + j.id);
      const canBuy = state.money - j.price >= debtFloor() && state.jesters.length < jesterSlots();
      if (!canBuy) div.classList.add("unaffordable");
      div.append(cardFace("jester", jesterFaceHTML(j)));
      div.insertAdjacentHTML("beforeend", buyHTML(j.price, canBuy, state.jesters.length >= jesterSlots()));
      const jesterFull = state.jesters.length >= jesterSlots();
      div.querySelector("button").addEventListener("click", () => jesterFull ? denyFull("jester-count") : buyJester(j.id));
      shopItems.appendChild(div);
    }

    const propEl = document.getElementById("shop-prop");
    propEl.innerHTML = "";
    const prop = state.shopProp;
    if (prop) {
      const canBuy = state.money - PROP_PRICE >= debtFloor();
      const div = document.createElement("div");
      div.className = "shop-item prop" + (canBuy ? "" : " unaffordable");
      dealIn(div, "v:" + prop.id);
      div.append(cardFace("trick prop", `<span class="trick-glyph prop-initial">${prop.name[0]}</span><span class="trick-name">${prop.name}</span><span class="trick-hand">Prop</span><span class="trick-desc">${prop.desc}</span>`));
      div.insertAdjacentHTML("beforeend", buyHTML(PROP_PRICE, canBuy));
      div.querySelector("button").addEventListener("click", buyProp);
      propEl.appendChild(div);
    }
    const ownedProps = document.getElementById("owned-props");
    ownedProps.textContent = state.props.length ? `Props: ${state.props.map(v => v.name).join(", ")}` : "";

    const shopTricks = document.getElementById("shop-tricks");
    const shopPacks = document.getElementById("shop-packs");
    shopTricks.innerHTML = "";
    shopPacks.innerHTML = "";
    const trickOffers = state.shopTricks.map(t => ({ t, buy: () => buyTrick(t.id) }));
    trickOffers.push(...(state.shopDecrees || []).map(t => ({ t, buy: () => buyDecree(t.id) })));
    if (state.packAvailable) trickOffers.push({ pack: "trick" });
    if (state.decreePackAvailable) trickOffers.push({ pack: "decree" });
    for (const { t, pack, buy } of trickOffers) {
      const price = pack ? PACK_PRICE : t.price;
      const canBuy = state.money - price >= debtFloor() && (pack ? !state.pack : state.tricks.length < trickSlots());
      const div = document.createElement("div");
      const isDecree = pack === "decree" || Boolean(t?.decree);
      div.className = "shop-item" + (pack ? " pack" : "") + (isDecree ? " decree" : "") + (canBuy ? "" : " unaffordable");
      dealIn(div, pack ? "p:" + pack : "t:" + t.id);
      const face = pack
        ? `<span class="pack-cartouche"><span class="trick-name">${pack === "decree" ? "Decree" : "Mask"} Pack</span><span class="trick-hand">Pick 1 of ${PACK_SIZE}</span></span><span class="trick-desc">${pack === "decree" ? `Pick 1 of ${PACK_SIZE} decrees, kept to use on a hand.` : `Pick 1 of ${PACK_SIZE} masks, used right away.`}</span>`
        : trickCardHTML(t);
      div.append(cardFace("trick" + (pack ? " pack" : "") + (isDecree ? " decree" : ""), face));
      div.insertAdjacentHTML("beforeend", buyHTML(price, canBuy, !pack && state.tricks.length >= trickSlots()));
      const trickFull = !pack && state.tricks.length >= trickSlots();
      div.querySelector("button").addEventListener("click", trickFull ? () => denyFull("trick-count") : pack ? () => buyPack(pack) : buy);
      (pack ? shopPacks : shopTricks).appendChild(div);
    }

    document.getElementById("pack-modal").classList.toggle("hidden", !state.pack);
    document.getElementById("pack-title").textContent = `${state.packKind === "decree" ? "Decree" : "Mask"} Pack: pick one`;
    const packItems = document.getElementById("pack-items");
    packItems.innerHTML = "";
    for (const t of state.pack || []) {
      const div = document.createElement("div");
      div.className = "shop-item";
      dealIn(div, "k:" + t.id);
      const full = t.decree && state.tricks.length >= trickSlots();
      div.append(cardFace("trick" + (t.decree ? " decree" : ""), trickCardHTML(t)));
      div.insertAdjacentHTML("beforeend", `<button class="buy-btn" ${full ? "disabled title=\"No free slot\"" : ""}>Take</button>`);
      div.querySelector("button").addEventListener("click", () => pickFromPack(t.id));
      packItems.appendChild(div);
    }

    // A decree pick needs a free slot: when they are all taken, the picker lists your cards to use or sell.
    const packFull = Boolean(state.pack) && state.packKind === "decree" && state.tricks.length >= trickSlots();
    document.getElementById("pack-owned").classList.toggle("hidden", !packFull);
    if (packFull) fillTrickList(document.getElementById("pack-owned-tricks"), true);

    // Your jesters and cards are the play screen's own top row, lifted above the shop (see styles.css),
    // so the shop only has to leave room for it.
    syncShopTop();

    const freeReroll = !state.freeRerollUsed && state.jesters.some(j => j.id === "chaos_the_clown");
    rerollBtn.classList.remove("hidden");
    rerollBtn.textContent = freeReroll ? "Reroll free" : `Reroll for $${state.rerollCost}`;
    rerollBtn.disabled = state.money - (freeReroll ? 0 : state.rerollCost) < debtFloor();
    rerollBtn.onclick = rerollShop;
    const btn = document.getElementById("overlay-btn");
    btn.textContent = debug ? "Close" : "Next Audience";
    btn.onclick = debug ? () => setDebugShop(false) : nextRound;
  } else if (state.phase === "win") {
    overlay.classList.remove("hidden");
    document.getElementById("overlay-title").textContent = "The Court Is Amused";
    document.getElementById("overlay-sub").textContent = `You cleared ${venueName(FINAL_VENUE)} with ${state.jesters.length} jester(s) in tow. You may keep your head.`;
    endScreen(overlay);
    rerollBtn.classList.add("hidden");
    showRunSummary();
    const btn = document.getElementById("overlay-btn");
    btn.textContent = "Play Again";
    btn.onclick = () => restart();
  } else if (state.phase === "gameover") {
    overlay.classList.remove("hidden");
    document.getElementById("overlay-title").textContent = "Off With Your Head";
    document.getElementById("overlay-sub").textContent = `The court lost interest in ${venueName(state.venue)}, ${audienceName(state.round)}.`;
    endScreen(overlay);
    rerollBtn.classList.add("hidden");
    showRunSummary();
    const btn = document.getElementById("overlay-btn");
    btn.textContent = "New Game";
    btn.onclick = () => restart();
  } else {
    overlay.classList.add("hidden");
  }
}
