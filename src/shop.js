// --- Shop --------------------------------------------------------------
// Winning a round, the shop's offers, and buying, selling and rerolling.

function finishRoundWin() {
  const reward = 3 + state.handsLeft + state.discardsLeft;
  const interest = interestOn(state.money);
  const roundEndCtx = {
    money: state.money, discardsLeft: state.discardsLeft, discardsUsed: state.discardsUsed,
    jesters: state.jesters, isBoss: state.round === ROUNDS_PER_VENUE, deck: freshDeck(),
  };
  state.money += reward + interest;

  let bonus = 0;
  const destroyed = new Set();
  const before = [...state.jesters];
  const fx = []; // what each jester did, for the end-of-act show
  for (const j of state.jesters) {
    if (!j.roundEnd) continue;
    const status = j.status?.(j);
    const effect = j.roundEnd(roundEndCtx, j) || {};
    const grew = j.status && j.status(j) !== status;
    if (effect.money || grew || effect.destroySelf) fx.push({ jester: j, money: effect.money || 0, grew, destroyed: !!effect.destroySelf });
    if (effect.money) bonus += effect.money;
    if (effect.destroySelf) destroyed.add(j.id);
  }
  if (bonus) state.money += bonus;
  if (destroyed.size) state.jesters = state.jesters.filter(j => !destroyed.has(j.id));
  if (state.round === ROUNDS_PER_VENUE) state.jestersSold = 0; // boss round cleared

  state.lastEarnings = { reward, interest, bonus };
  if (scoring && fx.length) cue(() => startRoundEndShow(before, fx));

  if (state.venue >= FINAL_VENUE && state.round >= ROUNDS_PER_VENUE) {
    state.phase = "win";
    cue(() => Sound.gameWin());
    return;
  }

  cue(() => Sound.roundWin());
  state.phase = "shop";
  state.rerollCost = rerollBaseCost();
  state.freeRerollUsed = false;
  state.shopRolls = 0;
  rollShopOffers();
  rollTrickOffers();
  state.packAvailable = true;
  state.decreePackAvailable = true;
  if (state.round === 1) {
    const have = new Set(state.props.map(v => v.id));
    const left = PROP_POOL.filter(v => !have.has(v.id));
    state.shopProp = left.length ? left[Math.floor(rngFor(`prop:${state.venue}`)() * left.length)] : null;
  }
}

function debtFloor() {
  return -Math.max(0, ...state.jesters.map(j => j.debtLimit || 0));
}

function buyJester(id) {
  if (state.pack) return;
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
  state.shopOffers = shuffled(JESTER_POOL.filter(j => !owned.has(j.id)), rngFor(shopRollLabel("jesters"))).slice(0, 3);
}

function shopRollLabel(kind) {
  return `shop-${kind}:${state.venue}:${state.round}:${state.shopRolls}`;
}

function shuffled(list, rand = Math.random) {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(rand() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  return pool;
}

// Two random trick cards and two decrees for sale (duplicates of owned ones are fine).
function rollTrickOffers() {
  state.shopTricks = shuffled(TRICK_POOL, rngFor(shopRollLabel("tricks"))).slice(0, 2);
  state.shopDecrees = shuffled(DECREE_POOL, rngFor(shopRollLabel("decrees"))).slice(0, 2);
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

// Destroys the first owned jester through the normal round-end show (crack sound, "Destroyed!"
// pop, fades it out), to preview that without waiting on the real roundEnd odds.
function debugDestroyJester() {
  if (!DEBUG_ENABLED) return;
  if (state.phase !== "playing" || !state.jesters.length) return;
  const jester = state.jesters[0];
  const before = [...state.jesters];
  state.jesters = state.jesters.filter(j => j.id !== jester.id);
  cue(() => startRoundEndShow(before, [{ jester, money: 0, grew: false, destroyed: true }]));
  render();
}

function sellJester(id) {
  if (!canAct() || state.pack) return;
  const idx = state.jesters.findIndex(j => j.id === id);
  if (idx === -1) return;
  const [jester] = state.jesters.splice(idx, 1);
  state.money += sellValue(jester);
  state.jestersSold += 1;
  Sound.coinSell();
  render();
}

function rerollShop() {
  if (!inShop() || state.pack) return;
  const freeReroll = !state.freeRerollUsed && state.jesters.some(j => j.id === "chaos_the_clown");
  const cost = freeReroll ? 0 : state.rerollCost;
  if (state.money - cost < debtFloor()) return;
  state.money -= cost;
  if (freeReroll) state.freeRerollUsed = true;
  else state.rerollCost += 1;
  Sound.shuffle();
  Sound.shopDeal();
  state.shopRolls += 1;
  rollShopOffers();
  rollTrickOffers();
  render();
}

function canAct() {
  return !scoring && (inShop() || state.phase === "playing");
}

function buyProp() {
  const v = state.shopProp;
  if (!inShop() || state.pack || !v || state.money - PROP_PRICE < debtFloor()) return;
  state.money -= PROP_PRICE;
  state.props.push(v);
  state.shopProp = null;
  Sound.coinBuy();
  render();
}
