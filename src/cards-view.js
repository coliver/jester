// --- Card and jester views ---------------------------------------------------

const SUIT_ORDER = new Map(SUITS.map((s, i) => [s, i]));

function sortedHand() {
  const cards = [...state.hand];
  if (state.sortMode === "custom") return cards;
  if (state.sortMode === "suit") {
    return cards.sort((a, b) => {
      const suitDiff = SUIT_ORDER.get(a.suit) - SUIT_ORDER.get(b.suit);
      if (suitDiff !== 0) return suitDiff;
      return rankNum(a.rank) - rankNum(b.rank);
    });
  }
  return cards.sort((a, b) => {
    const rankDiff = rankNum(a.rank) - rankNum(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return SUIT_ORDER.get(a.suit) - SUIT_ORDER.get(b.suit);
  });
}

function setSortMode(mode) {
  if (state.sortMode === mode) return;
  state.sortMode = mode;
  Sound.click();
  render();
}

// Jester art is optional and added incrementally (see assets/jesters/PROMPTS.md);
// the onerror handler swaps a missing file for the shared missing_no.png
// placeholder (and clears itself so a missing placeholder can't loop).
function jesterArtHTML(id) {
  return `<img class="jester-art" src="assets/jesters/${id}.png" alt="" onerror="this.onerror=null; this.src='assets/jesters/missing_no.png';">`;
}

function jesterHeaderHTML(j) {
  const rarityClass = "rarity-" + (j.rarity || "common").toLowerCase();
  return `${jesterArtHTML(j.id)}<span class="jester-name">${j.name}</span><span class="jester-rarity ${rarityClass}">${j.rarity || ""}</span>`;
}

// Tap (or Enter/Space) a card to read its full text in a small tooltip under
// it; the landscape layout hides descriptions so the card rows stay compact.
// `sell` ({ label, fn }, optional) adds a Sell button to the tooltip, so cards
// in the play rows can be sold without crowding the cards themselves.
function makeInspectable(el, bodyHTML, sell) {
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.dataset.inspectable = "1";
  el.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    toggleInspect(el, bodyHTML(), sell?.());
  });
  el.addEventListener("keydown", (e) => {
    if (e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    toggleInspect(el, bodyHTML(), sell?.());
  });
}

let inspectAnchor = null;

function hideInspect() {
  inspectAnchor = null;
  document.getElementById("inspect").classList.add("hidden");
}

function toggleInspect(anchor, html, sell) {
  const tip = document.getElementById("inspect");
  if (inspectAnchor && inspectAnchor.isConnected && inspectAnchor === anchor) {
    hideInspect();
    return;
  }
  inspectAnchor = anchor;
  tip.innerHTML = html;
  if (sell) {
    const btn = document.createElement("button");
    btn.className = "sell-btn";
    btn.textContent = sell.label;
    btn.addEventListener("click", () => {
      hideInspect();
      sell.fn();
    });
    tip.appendChild(btn);
  }
  tip.classList.remove("hidden");
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(6, Math.min(rect.left + rect.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 6));
  tip.style.left = `${left}px`;
  tip.style.top = `${rect.bottom + 6}px`;
}

// Decree and mask art is optional (see assets/decrees/PROMPTS.md and
// assets/masks/PROMPTS.md): the glyph shows until <id>.png loads, and a
// missing file just leaves the glyph in place.
function cardArtHTML(dir, id) {
  return `<img class="card-art" src="assets/${dir}/${id}.png" alt="" hidden onload="this.hidden=false; this.previousElementSibling.hidden=true;" onerror="this.remove()">`;
}

function trickCardHTML(t) {
  return `<span class="trick-glyph">${t.decree ? "📜" : "🎭"}</span>${cardArtHTML(t.decree ? "decrees" : "masks", t.id)}<span class="trick-name">${t.name}</span><span class="trick-hand">${t.decree ? "Decree" : t.hand}</span><span class="trick-desc">${t.desc}</span>`;
}

function useButtonDisabled(t) {
  return Boolean(state.pack) || Boolean(t.decree && !canUseDecree(t));
}

// A card-sized face for a shop offer or an owned card. Its text lives in the tap-to-read tooltip,
// so the face only carries the art, name and rarity, and every card stays the same size.
function cardFace(className, html) {
  const face = document.createElement("div");
  face.className = className;
  face.innerHTML = html;
  makeInspectable(face, () => `<div class="${className.split(" ")[0]}">${html}</div>`);
  return face;
}

// The description, plus the current amount for a jester that grows as the run goes on.
function jesterDescHTML(j) {
  return j.status ? `${j.desc}<br><b>${j.status(j)}</b>` : j.desc;
}

function jesterFaceHTML(j) {
  return `${jesterHeaderHTML(j)}<span class="jester-desc">${jesterDescHTML(j)}</span>`;
}

// Held trick cards, with a Use button (and Sell in the shop) on each.
function fillTrickList(container, withSell) {
  container.innerHTML = "";
  state.tricks.forEach((t, i) => {
    const div = document.createElement("div");
    div.className = "trick" + (t.decree ? " decree" : "");
    div.innerHTML = trickCardHTML(t);
    makeInspectable(div, () => `<div class="trick">${trickCardHTML(t)}</div>`,
      withSell ? undefined : () => ({ label: `Sell $${trickSellValue(t)}`, fn: () => sellTrick(state.tricks.indexOf(t)) }));
    const useBtn = document.createElement("button");
    useBtn.className = "use-btn";
    useBtn.textContent = "Use";
    useBtn.disabled = useButtonDisabled(t);
    if (t.decree) useBtn.title = `Select 1-${t.max} card${t.max > 1 ? "s" : ""} in hand during an act`;
    useBtn.addEventListener("click", () => useTrick(i));
    if (withSell) {
      // Shop list: the buttons sit under the card so it keeps the common card size.
      const slot = document.createElement("div");
      slot.className = "owned-slot";
      const btns = document.createElement("div");
      btns.className = "owned-btns";
      const sellBtn = document.createElement("button");
      sellBtn.className = "sell-btn";
      sellBtn.textContent = `Sell $${trickSellValue(t)}`;
      sellBtn.addEventListener("click", () => sellTrick(i));
      btns.append(useBtn, sellBtn);
      slot.append(div, btns);
      container.appendChild(slot);
    } else {
      div.appendChild(useBtn);
      const slot = document.createElement("div");
      slot.className = "trick-slot";
      slot.appendChild(div);
      container.appendChild(slot);
    }
  });
  if (withSell) return;
  // Play row: outline the free slots too, so the row is visible when empty.
  for (let i = state.tricks.length; i < trickSlots(); i++) {
    const slot = document.createElement("div");
    slot.className = "trick-slot";
    container.appendChild(slot);
  }
}

// Pip positions for the number cards as [x, y] in 0..1 across the pip field
// (x: left column, centre, right column; y: top .. bottom). Pips in the lower
// half are drawn upside-down, as on a real card. Aces and face cards instead
// show one big suit in the middle.
const PIP_LAYOUT = (() => {
  const L = 0, C = 0.5, R = 1;
  const sides = (...ys) => ys.flatMap(y => [[L, y], [R, y]]);
  return {
    "2": [[C, 0], [C, 1]],
    "3": [[C, 0], [C, 0.5], [C, 1]],
    "4": sides(0, 1),
    "5": [...sides(0, 1), [C, 0.5]],
    "6": sides(0, 0.5, 1),
    "7": [...sides(0, 0.5, 1), [C, 0.25]],
    "8": [...sides(0, 0.5, 1), [C, 0.25], [C, 0.75]],
    "9": [...sides(0, 1 / 3, 2 / 3, 1), [C, 0.5]],
    "10": [...sides(0, 1 / 3, 2 / 3, 1), [C, 1 / 6], [C, 5 / 6]],
  };
})();

// Court cards are drawn as a split panel (mirrored halves) topped by a crown
// glyph, like the old woodblock decks; U+FE0E keeps the glyph in text style.
const COURT_CROWN = { J: "♞\uFE0E", Q: "♛\uFE0E", K: "♚\uFE0E" };

// Generated portraits (assets/faces/face_<rank>_<suit>.png) cover the panel once
// they load; a missing file just leaves the split panel in place.
const COURT_NAME = { J: "jack", Q: "queen", K: "king" };
const SUIT_NAME = { "♠": "spades", "♥": "hearts", "♣": "clubs", "♦": "diamonds" };

function cardFaceHtml(card) {
  const layout = PIP_LAYOUT[card.rank];
  if (COURT_CROWN[card.rank]) {
    const art = `<img class="court-art" src="assets/faces/face_${COURT_NAME[card.rank]}_${SUIT_NAME[card.suit]}.png" alt="" hidden onload="this.hidden=false" onerror="this.remove()">`;
    const half = `<span class="court-half"><span class="court-crown">${COURT_CROWN[card.rank]}</span><span>${card.suit}</span></span>`;
    return `<span class="court-panel">${half}${half}${art}</span>`;
  }
  if (!layout) return `<span class="suit-mid">${card.suit}</span>`;
  const pips = layout.map(([x, y]) =>
    `<span class="pip${y > 0.5 ? " flip" : ""}" style="left:${(0.33 + x * 0.34) * 100}%;top:${(0.17 + y * 0.66) * 100}%">${card.suit}</span>`
  ).join("");
  return `<span class="pips">${pips}</span>`;
}

// Hand cards are built once and kept between renders (only moved or restyled), so a
// selection never redraws them: rebuilt face cards flashed as their portrait reloaded.
const handEls = new Map(); // card id -> its element

const isStaged = (card) => state.selected.has(card.id) && Boolean(state.staged?.has(card.id));
const cardSig = (card) => `${card.rank}${card.suit}${card.enh || ""}`;

function buildCardEl(card, i) {
  const id = card.id;
  const div = document.createElement("div");
  div.className = "card " + (RED_SUITS.has(card.suit) ? "red" : "black");
  const enh = ENHANCEMENTS[card.enh];
  if (enh) div.classList.add("enh-" + card.enh);
  div.dataset.sig = cardSig(card);
  div.dataset.cardId = id;
  // Staggered per card; the element persists, so the bob stays continuous.
  div.style.setProperty("--bob-delay", `-${(performance.now() + i * 620) % BOB_PERIOD_MS}ms`);
  const index = `<span>${card.rank}</span><span>${card.suit}</span>`;
  div.innerHTML = `
    <span class="rank-top">${index}</span>
    ${cardFaceHtml(card)}
    <span class="rank-bottom">${index}</span>
    ${enh ? `<span class="enh-badge" title="${enh.name} Card">${enh.label}</span>` : ""}
  `;
  div.tabIndex = 0;
  div.setAttribute("role", "button");
  div.setAttribute("aria-label", `${card.rank} of ${card.suit}${enh ? `, ${enh.name} Card` : ""}`);
  // Handlers read the current state (staged or in hand) when they fire, as the element outlives renders.
  // A second click on the same hand card in quick succession (the browser reports it as a click
  // with detail 2) parks it at the right end of the play area. Which card each click landed on
  // decides it, not the browser's dblclick event: two quick clicks on neighbouring cards must stay
  // two separate selections.
  div.addEventListener("click", (e) => {
    const staged = Boolean(state.staged?.has(id));
    const last = lastHandClick;
    const again = e.detail >= 2 && last.state === state && last.id === id && e.timeStamp - last.time < DOUBLE_CLICK_MS;
    const from = cardRects([id]);
    if (staged && last.parked && last.id === id && e.timeStamp - last.time < DOUBLE_CLICK_MS) {
      return; // a stray click right after parking (touch taps can deliver one) must not send it back
    } else if (staged) { // back to the hand; a quick second click on it must not select it again
      lastHandClick = { state, id, time: e.timeStamp, returned: true };
      toggleCard(id);
      flipCards(from);
    } else if (again && last.returned) {
      lastHandClick = { state: null };
    } else if (again) {
      lastHandClick = { state, id, time: e.timeStamp, parked: true };
      parkCard(id, from);
    } else {
      lastHandClick = { state, id, time: e.timeStamp };
      toggleCard(id);
    }
  });
  makeDraggable(div, () => document.getElementById(isStaged({ id }) ? "play-area" : "hand-row").children,
    (slot) => (isStaged({ id }) ? moveStagedCard(id, slot) : moveHandCard(id, slot)),
    {
      target: () => document.getElementById(isStaged({ id }) ? "hand-area" : "play-area"),
      onDrop: (rect) => (isStaged({ id }) ? returnToHand(id, rect) : dropIntoPlayArea(id, rect)),
    });
  div.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCard(id);
    }
  });
  div.addEventListener("animationend", (e) => {
    if (e.animationName !== "card-deal") return;
    div.classList.remove("dealt");
    div.style.animationDelay = "";
  });
  return div;
}

// Make `container`'s children exactly `els`, in order, touching only what has to move
// (re-inserting an element restarts its animations and can flash its images).
function syncChildren(container, els) {
  els.forEach((el, idx) => {
    if (container.children[idx] !== el) container.insertBefore(el, container.children[idx] || null);
  });
  while (container.children.length > els.length) container.lastElementChild.remove();
}

// The hand rankings table in the deck popup: each hand's level and its chips and mult at that level.
function renderHandTable() {
  const body = document.querySelector("#hands-table tbody");
  body.innerHTML = "";
  for (const t of HAND_TYPES) {
    const b = handBase(t);
    const row = body.insertRow();
    row.insertCell().textContent = t.name;
    row.insertCell().textContent = handLevel(t.name);
    row.insertCell().textContent = b.chips;
    row.insertCell().textContent = b.mult;
  }
}

// The score readout and the King's mood, which follow `score` (the real round score, or the
// number still rolling up to it while a hand is being scored).
function renderScoreHud(score) {
  document.getElementById("score-val").textContent = `${score} / ${state.target}`;
  const mood = courtMood(score, state.target, state.handsLeft);
  document.getElementById("amusement").dataset.mood = mood;
  document.getElementById("amusement-label").textContent = `The King is ${MOODS[mood].label.toLowerCase()}`;
  document.getElementById("amusement-fill").style.width = `${Math.min(100, state.target > 0 ? (score / state.target) * 100 : 0)}%`;
  const kingArt = document.getElementById("amusement-art");
  const kingSrc = `assets/court/${MOODS[mood].img}.png`;
  if (kingArt.getAttribute("src") !== kingSrc) {
    kingArt.hidden = true;
    kingArt.onload = () => { kingArt.hidden = false; };
    kingArt.onerror = () => { kingArt.hidden = true; };
    kingArt.src = kingSrc;
  }
}
