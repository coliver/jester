// --- Shop screen ------------------------------------------------------------

// What the shop has already dealt in, so a re-render after a purchase only
// animates cards that are actually new; and which payout the count-up last ran for.
const shopSeen = new Set();
let ownedSeen = new Set();
let shopIntroFor = null;
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

// The round's payout, one chip per line so each can land in turn.
function renderPayout(el, debug, earnings, animate) {
  el.innerHTML = "";
  const add = (label, cls = "") => {
    const chip = document.createElement("span");
    chip.className = "chip " + cls;
    const money = /^(\+\$\d+) (.*)$/.exec(label); // a receipt line: label left, amount flush right
    if (money) {
      const amt = document.createElement("span");
      amt.className = "amt";
      amt.textContent = money[1];
      chip.append(amt, ` ${money[2]}`); // shown label-first by the stylesheet
    } else {
      chip.textContent = label;
    }
    chip.style.setProperty("--i", el.children.length);
    el.appendChild(chip);
  };
  el.classList.toggle("tally", animate);
  if (debug) return add("Buy and sell freely", "where");
  add(`${venueName(state.venue)}, Act ${state.round}`, "where");
  if (!earnings) return;
  add(`+$${earnings.reward} act`);
  if (earnings.interest) add(`+$${earnings.interest} interest`);
  if (earnings.bonus) add(`+$${earnings.bonus} jesters`);
}

// Shows the money total in the shop bar. With `from`, counts up from there to
// the current total after the payout chips have landed.
function showShopMoney(from) {
  const box = document.getElementById("shop-money");
  const val = document.getElementById("shop-money-val");
  box.classList.remove("hidden");
  const tick = ++moneyTick;
  const settle = () => { if (tick === moneyTick) val.textContent = state.money; };
  if (from === null || from === state.money || prefersReducedMotion() || typeof window.requestAnimationFrame !== "function") {
    settle();
    return;
  }
  val.textContent = from;
  const delay = 700, span = 700, t0 = performance.now();
  const step = (now) => {
    if (tick !== moneyTick) return;
    const k = Math.min(1, Math.max(0, (now - t0 - delay) / span));
    val.textContent = Math.round(from + (state.money - from) * k);
    if (k < 1) window.requestAnimationFrame(step); else settle();
  };
  window.requestAnimationFrame(step);
}

// The price tag under an offer is its Buy button, so an offer is just its card and its price.
function buyHTML(price, canBuy) {
  return `<button class="buy-btn" aria-label="Buy for $${price}" ${canBuy ? "" : "disabled"}>$${price}</button>`;
}

function endScreen(overlay) {
  overlay.classList.add("end");
  document.getElementById("shop-money").classList.add("hidden");
  shopSeen.clear();
  ownedSeen = new Set();
  shopIntroFor = null;
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
  const ownedSection = document.getElementById("owned-jesters-section");
  const moneyBtn = document.getElementById("money-btn");
  const debug = state.phase === "playing" && state.debugShop;
  moneyBtn.classList.toggle("hidden", !debug);
  if (state.phase !== "win" && state.phase !== "gameover") {
    document.getElementById("run-summary").classList.add("hidden");
    document.getElementById("replay-btn").classList.add("hidden");
  }
  document.getElementById("new-run-btn").classList.toggle("hidden", state.phase !== "shop");
  if (state.phase === "shop" || debug) {
    overlay.classList.remove("hidden", "end");
    document.getElementById("overlay-title").textContent = debug ? "Debug Shop" : "Act Cleared!";
    const earnings = state.lastEarnings;
    const intro = !debug && !!earnings && earnings !== shopIntroFor;
    if (intro) {
      shopIntroFor = earnings;
      shopSeen.clear();
      ownedSeen = new Set(state.jesters.map(j => j.id));
    }
    overlay.style.setProperty("--d", intro ? "0.8s" : "0s");
    renderPayout(document.getElementById("overlay-sub"), debug, earnings, intro);
    showShopMoney(intro ? state.money - (earnings.reward + earnings.interest + earnings.bonus) : null);

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
      div.insertAdjacentHTML("beforeend", buyHTML(j.price, canBuy));
      div.querySelector("button").addEventListener("click", () => buyJester(j.id));
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
      div.append(cardFace("trick prop", `<span class="trick-glyph">★</span><span class="trick-name">${prop.name}</span><span class="trick-hand">Prop</span><span class="trick-desc">${prop.desc}</span>`));
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
        ? `<span class="trick-glyph">${pack === "decree" ? "📜📜📜" : "🎭🎭🎭"}</span><span class="trick-name">${pack === "decree" ? "Decree" : "Mask"} Pack</span><span class="trick-hand">Pack</span><span class="trick-desc">${pack === "decree" ? `Pick 1 of ${PACK_SIZE} decrees, kept to use on a hand.` : `Pick 1 of ${PACK_SIZE} masks, used right away.`}</span>`
        : trickCardHTML(t);
      div.append(cardFace("trick" + (pack ? " pack" : "") + (isDecree ? " decree" : ""), face));
      div.insertAdjacentHTML("beforeend", buyHTML(price, canBuy));
      div.querySelector("button").addEventListener("click", pack ? () => buyPack(pack) : buy);
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

    const ownedTricksSection = document.getElementById("owned-tricks-section");
    ownedTricksSection.classList.toggle("hidden", state.tricks.length === 0);
    document.getElementById("owned-tricks-count").textContent = `${state.tricks.length}/${trickSlots()}`;
    fillTrickList(document.getElementById("owned-tricks"), true);

    const ownedList = document.getElementById("owned-jesters");
    ownedList.innerHTML = "";
    document.getElementById("owned-jesters-count").textContent = `${state.jesters.length}/${jesterSlots()}`;
    document.getElementById("shop-yours-empty").classList.toggle("hidden", state.jesters.length > 0 || state.tricks.length > 0);
    if (state.jesters.length > 0) {
      ownedSection.classList.remove("hidden");
      state.jesters.forEach((j) => {
        // The slot wraps the card and its Sell button, so dragging reorders them together.
        const slot = document.createElement("div");
        slot.className = "jester-slot owned-slot";
        const div = cardFace("jester", jesterFaceHTML(j));
        if (!ownedSeen.has(j.id)) div.classList.add("dealt");
        makeJesterDraggable(div, j.id);
        const sellBtn = document.createElement("button");
        sellBtn.className = "sell-btn";
        sellBtn.textContent = `Sell $${sellValue(j)}`;
        sellBtn.addEventListener("click", () => sellJester(j.id));
        slot.append(div, sellBtn);
        ownedList.appendChild(slot);
      });
    } else {
      ownedSection.classList.add("hidden");
    }
    ownedSeen = new Set(state.jesters.map(j => j.id));

    const freeReroll = !state.freeRerollUsed && state.jesters.some(j => j.id === "chaos_the_clown");
    rerollBtn.classList.remove("hidden");
    rerollBtn.textContent = freeReroll ? "Reroll (Free)" : `Reroll ($${state.rerollCost})`;
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
