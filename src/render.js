// --- Rendering ---------------------------------------------------------
// Redrawing the table from `state`, plus the deck view.

function render() {
  if (typeof document === "undefined") return;
  persistRun();
  document.getElementById("ante-val").textContent = state.ante;
  document.getElementById("venue-val").textContent = venueName(state.ante);
  document.getElementById("round-val").textContent = state.round;
  document.getElementById("audience-val").textContent = audienceName(state.round);
  renderScoreHud(scoring ? scoring.shownScore : state.roundScore);
  document.getElementById("money-val").textContent = scoring ? scoring.money : state.money;
  document.getElementById("hands-val").textContent = state.handsLeft;
  document.getElementById("discards-val").textContent = state.discardsLeft;

  const bossBanner = document.getElementById("boss-banner");
  if (state.bossModifier) {
    bossBanner.classList.remove("hidden");
    document.getElementById("boss-name").textContent = state.bossModifier.name;
    document.getElementById("boss-desc").textContent = state.bossModifier.desc;
    document.getElementById("boss-quip").textContent = state.bossModifier.quip || "";
    const bossArt = document.getElementById("boss-art");
    const bossSrc = `assets/bosses/${state.bossModifier.id}.png`;
    if (bossArt.getAttribute("src") !== bossSrc) { // only on a new boss: reloading it every render makes the banner flicker
      bossArt.hidden = true;
      bossArt.onload = () => { bossArt.hidden = false; };
      bossArt.onerror = () => { bossArt.hidden = true; };
      bossArt.src = bossSrc;
    }
  } else {
    bossBanner.classList.add("hidden");
  }

  const jesterRow = document.getElementById("jester-row");
  const jesterSig = state.jesters.map(j => j.id).join(",") + "/" + jesterSlots();
  if (jesterSig !== lastJesterSig) {
    lastJesterSig = jesterSig;
    jesterRow.innerHTML = "";
    const slotCount = Math.max(jesterSlots(), state.jesters.length);
    for (let i = 0; i < slotCount; i++) {
      const slot = document.createElement("div");
      slot.className = "jester-slot";
      jesterRow.appendChild(slot);
      const j = state.jesters[i];
      if (!j) continue;
      const div = document.createElement("div");
      div.className = "jester";
      div.innerHTML = `${jesterHeaderHTML(j)}<span class="jester-desc">${j.desc}</span>`;
      makeInspectable(div, () => `<div class="jester">${jesterHeaderHTML(j)}<span class="jester-desc">${j.desc}</span></div>`,
        () => ({ label: `Sell $${sellValue(j)}`, fn: () => sellJester(j.id) }));
      makeJesterDraggable(div, j.id);
      slot.appendChild(div);
    }
  }

  // Rebuilding the row on every render would reload each card's art (the glyph flashes back and
  // the card visibly hops), so it is only rebuilt when the cards or slots change; otherwise just
  // the Use buttons, which depend on the selection, are refreshed.
  const trickRow = document.getElementById("trick-row");
  const sameTricks = lastTricks && lastTricks.length === state.tricks.length &&
    lastTricks.every((t, i) => t === state.tricks[i]) && lastTrickSlots === trickSlots();
  if (sameTricks) {
    trickRow.querySelectorAll(".use-btn").forEach((btn, i) => { btn.disabled = useButtonDisabled(state.tricks[i]); });
  } else {
    lastTricks = [...state.tricks];
    lastTrickSlots = trickSlots();
    fillTrickList(trickRow, false);
  }
  document.getElementById("jester-count").textContent = `${state.jesters.length}/${jesterSlots()}`;
  document.getElementById("trick-count").textContent = `${state.tricks.length}/${trickSlots()}`;
  renderHandReference();

  document.getElementById("sort-rank-btn").classList.toggle("active", state.sortMode === "rank");
  document.getElementById("sort-suit-btn").classList.toggle("active", state.sortMode === "suit");

  const dealt = state.dealtIds;
  state.dealtIds = new Map();

  const handRow = document.getElementById("hand-row");
  const playArea = document.getElementById("play-area");
  const allCards = sortedHand().filter(c => !scoring?.drawn.has(c.id)); // cards drawn after a hand wait for its scoring
  const handCards = allCards.filter(c => !isStaged(c));
  const wantHand = [], wantPlay = [];
  const present = new Set();
  for (const card of allCards) {
    const staged = isStaged(card);
    let el = handEls.get(card.id);
    if (el && el.dataset.sig !== cardSig(card)) { // a decree changed this card: draw it afresh
      el.remove();
      el = null;
    }
    if (!el) {
      el = buildCardEl(card, handCards.indexOf(card));
      handEls.set(card.id, el);
    }
    present.add(card.id);
    const isSelected = state.selected.has(card.id);
    el.classList.toggle("selected", isSelected);
    el.setAttribute("aria-pressed", String(isSelected));
    // Fan position, -1 (leftmost) .. 1 (rightmost); CSS decides whether to use it.
    const i = handCards.indexOf(card);
    el.style.setProperty("--fan", !staged && handCards.length > 1 ? (i / (handCards.length - 1)) * 2 - 1 : 0);
    if (dealt.has(card.id)) {
      el.classList.add("dealt");
      el.style.animationDelay = `${dealt.get(card.id) * 70}ms`;
    }
    (staged ? wantPlay : wantHand).push(el);
  }
  const scoringIds = new Set(scoring?.cards.map(c => c.id));
  for (const [id, el] of handEls) {
    if (!present.has(id) && !scoringIds.has(id)) {
      el.remove();
      handEls.delete(id);
    }
  }
  syncChildren(handRow, wantHand);
  syncChildren(playArea, scoring ? scoring.cards.map(c => handEls.get(c.id)).filter(Boolean) : wantPlay); // played cards stay up while they score

  const selected = getSelectedCards();
  const previewName = document.getElementById("preview-name");
  const tallyEl = document.getElementById("tally");
  if (!scoring) { // while a hand scores, the sequence drives the preview
    if (selected.length > 0) {
      const result = scoreSelection(selected);
      previewName.textContent = result.hand.name;
      if (handBlocked(result.hand.name)) previewName.insertAdjacentHTML("beforeend", ` <span class="preview-note">already played</span>`);
      renderTally(result.hand.baseChips, result.hand.baseMult);
      tallyEl.classList.remove("idle");
    } else {
      previewName.textContent = " ";
      tallyEl.classList.add("idle");
    }
  }

  const blocked = selected.length > 0 && handBlocked(evaluateHand(selected).name);
  document.getElementById("play-btn").disabled = selected.length === 0 || state.phase !== "playing" || blocked;
  document.getElementById("discard-btn").disabled = selected.length === 0 || state.discardsLeft <= 0 || state.phase !== "playing";

  renderDeckView();
  if (!scoring) renderOverlay(); // the shop or game over screen waits for the scoring to finish
}

const DOUBLE_CLICK_MS = 350;
let lastHandClick = { state: null };

// Parks a hand card at the right end of the play area, flying it there from `from`.
function parkCard(id, from) {
  if (!stageCard(id)) return;
  moveCardInRow(id, state.staged.size - 1, c => state.staged.has(c.id));
  render();
  flipCards(from);
}

// The card lands where it was dropped: among the cards already parked, by horizontal position.
function dropIntoPlayArea(id, rect) {
  const centre = (rect.left + rect.right) / 2;
  const slot = [...document.getElementById("play-area").children].filter(el => {
    const r = el.getBoundingClientRect();
    return (r.left + r.right) / 2 < centre;
  }).length;
  if (!stageCard(id)) return;
  moveCardInRow(id, slot, c => state.staged.has(c.id));
  render();
  flipCards(new Map([[String(id), rect]]));
}

function returnToHand(id, rect) {
  if (!unstageCard(id)) return;
  render();
  flipCards(new Map([[String(id), rect]]));
}

function cardStatuses() {
  const status = new Map();
  for (const c of state.deck) status.set(c.id, "deck");
  for (const c of state.hand) status.set(c.id, "hand");
  for (const c of state.played) status.set(c.id, "played");
  for (const c of state.discarded) status.set(c.id, "discarded");
  return status;
}

function renderDeckView() {
  const modal = document.getElementById("deck-modal");
  const open = !modal.classList.contains("hidden");
  const btn = document.getElementById("deck-btn");
  const total = state.deck.length + state.hand.length + state.played.length + state.discarded.length;
  btn.textContent = `Deck (${state.deck.length}/${total})`;
  document.getElementById("deck-count").textContent = `${state.deck.length}/${total}`;
  if (!open) return;

  const status = cardStatuses();
  const removed = state.removed || [];
  const counts = { deck: 0, hand: 0, played: 0, discarded: 0, removed: removed.length };
  for (const v of status.values()) counts[v] += 1;
  for (const c of removed) status.set(c.id, "removed");
  document.getElementById("deck-legend").innerHTML = ["deck", "hand", "played", "discarded", ...(removed.length ? ["removed"] : [])]
    .map(k => `<span class="legend-item ${k}">${k === "deck" ? "In deck" : k[0].toUpperCase() + k.slice(1)}: ${counts[k]}</span>`)
    .join("");

  const grid = document.getElementById("deck-grid");
  grid.innerHTML = "";
  const cards = [...(state.masterDeck || []), ...removed].sort((a, b) =>
    SUIT_ORDER.get(a.suit) - SUIT_ORDER.get(b.suit) || rankNum(b.rank) - rankNum(a.rank));
  for (const card of cards) {
    const st = status.get(card.id) || "deck";
    const enh = ENHANCEMENTS[card.enh];
    const div = document.createElement("div");
    div.className = `mini-card ${RED_SUITS.has(card.suit) ? "red" : "black"} ${st}${enh ? " enh-" + card.enh : ""}`;
    div.textContent = `${card.rank}${card.suit}`;
    div.title = `${card.rank} of ${card.suit}${enh ? ` (${enh.name})` : ""}: ${st === "deck" ? "still in deck" : st === "removed" ? "destroyed, gone from your deck for good" : st}`;
    grid.appendChild(div);
  }
}

function setDeckViewOpen(open) {
  document.getElementById("deck-modal").classList.toggle("hidden", !open);
  renderDeckView();
}
