// --- Shop --------------------------------------------------------------
// Winning a round, the shop's offers, and buying, selling and rerolling.

function finishRoundWin() {
  const reward = 3 + state.handsLeft + state.discardsLeft;
  const interest = Math.min(INTEREST_CAP, Math.floor(state.money / INTEREST_UNIT));
  const roundEndCtx = {
    money: state.money, discardsLeft: state.discardsLeft, discardsUsed: state.discardsUsed,
    jesters: state.jesters, isBoss: state.round === ROUNDS_PER_ANTE, deck: freshDeck(),
  };
  state.money += reward + interest;

  let bonus = 0;
  const destroyed = new Set();
  for (const j of state.jesters) {
    if (!j.roundEnd) continue;
    const effect = j.roundEnd(roundEndCtx, j) || {};
    if (effect.money) bonus += effect.money;
    if (effect.destroySelf) destroyed.add(j.id);
  }
  if (bonus) state.money += bonus;
  if (destroyed.size) state.jesters = state.jesters.filter(j => !destroyed.has(j.id));
  if (state.round === ROUNDS_PER_ANTE) state.jestersSold = 0; // boss round cleared

  state.lastEarnings = { reward, interest, bonus };

  if (state.ante >= FINAL_ANTE && state.round >= ROUNDS_PER_ANTE) {
    state.phase = "win";
    cue(() => Sound.gameWin());
    return;
  }

  cue(() => Sound.roundWin());
  state.phase = "shop";
  state.rerollCost = rerollBaseCost();
  state.freeRerollUsed = false;
  const owned = new Set(state.jesters.map(j => j.id));
  const pool = JESTER_POOL.filter(j => !owned.has(j.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.shopOffers = pool.slice(0, 3);
  rollTrickOffers();
  state.packAvailable = true;
  state.decreePackAvailable = true;
  if (state.round === 1) {
    const have = new Set(state.props.map(v => v.id));
    const left = PROP_POOL.filter(v => !have.has(v.id));
    state.shopProp = left.length ? left[Math.floor(Math.random() * left.length)] : null;
  }
}

function debtFloor() {
  return -Math.max(0, ...state.jesters.map(j => j.debtLimit || 0));
}

function buyJester(id) {
  if (state.jesters.length >= jesterSlots()) return;
  const idx = state.shopOffers.findIndex(j => j.id === id);
  if (idx === -1) return;
  const jester = state.shopOffers[idx];
  if (state.money - jester.price < debtFloor()) return;
  state.money -= jester.price;
  state.jesters.push({ ...jester, sellBonus: 0 });
  state.shopOffers.splice(idx, 1);
  Sound.coinBuy();
  render();
}

function rollShopOffers() {
  const owned = new Set(state.jesters.map(j => j.id));
  const pool = JESTER_POOL.filter(j => !owned.has(j.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.shopOffers = pool.slice(0, 3);
}

function shuffled(list) {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  return pool;
}

// Two random trick cards and two decrees for sale (duplicates of owned ones are fine).
function rollTrickOffers() {
  const pool = [...TRICK_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.shopTricks = pool.slice(0, 2);
  state.shopDecrees = shuffled(DECREE_POOL).slice(0, 2);
}

function inShop() {
  return state.phase === "shop" || (state.phase === "playing" && state.debugShop);
}

// Debug shop: open the shop at any time during play, with a money cheat.
function setDebugShop(open) {
  if (!DEBUG_ENABLED) return;
  if (state.phase !== "playing") return;
  state.debugShop = open;
  if (open && state.shopOffers.length === 0) {
    rollShopOffers();
    rollTrickOffers();
    state.packAvailable = true;
    state.decreePackAvailable = true;
  }
  render();
}

// Instant win: clears the current round as if the target had been scored,
// paying the usual rewards and landing in the real shop.
function debugWinRound() {
  if (!DEBUG_ENABLED) return;
  if (state.phase !== "playing") return;
  state.roundScore = Math.max(state.roundScore, state.target);
  finishRoundWin();
  render();
}
function addDebugMoney(amount = 1000) {
  if (!DEBUG_ENABLED) return;
  state.money += amount;
  Sound.coinSell();
  render();
}

function sellJester(id) {
  if (!canAct()) return;
  const idx = state.jesters.findIndex(j => j.id === id);
  if (idx === -1) return;
  const [jester] = state.jesters.splice(idx, 1);
  state.money += sellValue(jester);
  state.jestersSold += 1;
  Sound.coinSell();
  render();
}

function rerollShop() {
  if (!inShop()) return;
  const freeReroll = !state.freeRerollUsed && state.jesters.some(j => j.id === "chaos_the_clown");
  const cost = freeReroll ? 0 : state.rerollCost;
  if (state.money - cost < debtFloor()) return;
  state.money -= cost;
  if (freeReroll) state.freeRerollUsed = true;
  else state.rerollCost += 1;
  Sound.shuffle();
  const owned = new Set(state.jesters.map(j => j.id));
  const pool = JESTER_POOL.filter(j => !owned.has(j.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.shopOffers = pool.slice(0, 3);
  rollTrickOffers();
  render();
}

function canAct() {
  return !scoring && (inShop() || state.phase === "playing");
}

function buyProp() {
  const v = state.shopProp;
  if (!inShop() || !v || state.money - PROP_PRICE < debtFloor()) return;
  state.money -= PROP_PRICE;
  state.props.push(v);
  state.shopProp = null;
  Sound.coinBuy();
  render();
}
