// --- Trick cards -------------------------------------------------------------

function levelUpHand(name) {
  state.handLevels[name] = handLevel(name) + 1;
}

// A trick card was used (from a slot or picked from a pack).
function trickUsed(trick) {
  levelUpHand(trick.hand);
  for (const j of state.jesters) if (j.onTrickUsed) j.onTrickUsed(j);
}

function trickSellValue(trick) {
  return Math.max(1, Math.floor(trick.price / 2));
}

function buyTrick(id) {
  if (!inShop() || state.pack || state.tricks.length >= trickSlots()) return;
  const idx = state.shopTricks.findIndex(t => t.id === id);
  if (idx === -1) return;
  const trick = state.shopTricks[idx];
  if (state.money - trick.price < debtFloor()) return;
  state.money -= trick.price;
  state.tricks.push({ ...trick });
  state.shopTricks.splice(idx, 1);
  Sound.coinBuy();
  render();
}

function buyDecree(id) {
  if (!inShop() || state.pack || state.tricks.length >= trickSlots()) return;
  const idx = state.shopDecrees.findIndex(t => t.id === id);
  if (idx === -1) return;
  const decree = state.shopDecrees[idx];
  if (state.money - decree.price < debtFloor()) return;
  state.money -= decree.price;
  state.tricks.push({ ...decree });
  state.shopDecrees.splice(idx, 1);
  Sound.coinBuy();
  render();
}

function useTrick(index) {
  if (!canAct()) return;
  const item = state.tricks[index];
  if (!item) return;
  if (item.decree) {
    useDecree(index);
    return;
  }
  state.tricks.splice(index, 1);
  trickUsed(item);
  Sound.coinBuy();
  render();
}

// --- Decree cards ---------------------------------------------------------------

// A decree can be used mid-round with between 1 and its max cards selected.
function canUseDecree(decree) {
  const n = state.selected.size;
  return state.phase === "playing" && !state.debugShop && !state.pack && n >= 1 && n <= decree.max;
}

// Apply fn to a card both where it currently sits and in the run's master deck.
function editCard(id, fn) {
  for (const list of [state.hand, state.deck, state.played, state.discarded, state.masterDeck]) {
    const c = list?.find(card => card.id === id);
    if (c) fn(c);
  }
}

// Permanently remove cards from the run, wherever they currently are.
function destroyCards(ids) {
  const gone = new Set(ids);
  const everywhere = ["masterDeck", "hand", "deck", "played", "discarded"].flatMap(key => state[key] || []);
  state.removed ||= [];
  for (const id of gone) {
    const card = (state.masterDeck || []).find(c => c.id === id) || everywhere.find(c => c.id === id);
    if (card && !state.removed.some(c => c.id === id)) state.removed.push({ ...card });
  }
  for (const key of ["hand", "deck", "played", "discarded", "masterDeck"]) {
    if (state[key]) state[key] = state[key].filter(c => !gone.has(c.id));
  }
}

function useDecree(index) {
  const decree = state.tricks[index];
  if (!decree || !decree.decree || !canUseDecree(decree)) return;
  const ids = getSelectedCards().map(c => c.id);
  state.tricks.splice(index, 1);
  clearSelection();
  if (decree.destroy) {
    const stayingIds = state.hand.filter(c => !ids.includes(c.id)).map(c => c.id);
    const from = cardRects(stayingIds);
    destroyCards(ids);
    const drawn = draw(state.handSize - state.hand.length);
    state.hand.push(...drawn);
    state.dealtIds = new Map(drawn.map((c, i) => [c.id, i]));
    if (drawn.length) Sound.dealHand(drawn.length);
    Sound.coinBuy();
    render();
    flipCards(from);
    return;
  }
  for (const id of ids) editCard(id, decree.apply);
  Sound.coinBuy();
  render();
}

// Allowed with a pack open: a full pack picker lets you sell or use a card to free a slot.
function sellTrick(index) {
  if (!canAct()) return;
  const [trick] = state.tricks.splice(index, 1);
  if (!trick) return;
  state.money += trickSellValue(trick);
  Sound.coinSell();
  render();
}

// A pack offers PACK_SIZE distinct cards and you pick one, or skip the rest.
// A trick pack's pick is used immediately (no slot needed); a decree pack's
// pick goes into a slot to be used on a later round's hand.
function buyPack(kind = "trick") {
  const decree = kind === "decree";
  if (!inShop() || !(decree ? state.decreePackAvailable : state.packAvailable) || state.pack) return;
  if (state.money - PACK_PRICE < debtFloor()) return;
  state.money -= PACK_PRICE;
  if (decree) state.decreePackAvailable = false;
  else state.packAvailable = false;
  state.packKind = kind;
  state.pack = shuffled(decree ? DECREE_POOL : TRICK_POOL).slice(0, PACK_SIZE);
  Sound.coinBuy();
  render();
}

function pickFromPack(id) {
  if (!state.pack) return;
  const card = state.pack.find(t => t.id === id);
  if (!card) return;
  if (card.decree) {
    if (state.tricks.length >= trickSlots()) return;
    state.tricks.push({ ...card });
  } else {
    trickUsed(card);
  }
  state.pack = null;
  render();
}

function skipPack() {
  state.pack = null;
  render();
}
