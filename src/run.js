// --- Run lifecycle -----------------------------------------------------
// Starting rounds and runs, and saving and resuming a run.

function nextRound() {
  state.pack = null; // an unpicked pack is forfeited
  state.round += 1;
  if (state.round > ROUNDS_PER_ANTE) {
    state.round = 1;
    state.ante += 1;
  }
  startRound();
  render();
}

// Debug only (?debug): begin each run with 3 distinct random Common jesters,
// plus one random trick card and one random decree.
const STARTING_JESTERS = 3;
function grantStartingJester() {
  if (!DEBUG_ENABLED) return;
  const commons = shuffled(JESTER_POOL.filter(j => j.rarity === "Common"));
  for (const pick of commons.slice(0, STARTING_JESTERS)) state.jesters.push({ ...pick, sellBonus: 0 });
  state.tricks.push({ ...shuffled(TRICK_POOL)[0] }, { ...shuffled(DECREE_POOL)[0] });
}

// A new run; `seed` replays a given seed, otherwise a fresh one is rolled.
function restart(seed) {
  state = newState(normalizeSeed(seed) || randomSeed());
  grantStartingJester();
  startRound();
  render();
}

// --- Run persistence ---------------------------------------------------------
//
// A run is saved to localStorage whenever the screen is drawn during a round or in the
// shop, so a reload resumes where you were: the shop with its offers, or the round with
// its deck order, hand, score and hands/discards left. Not saved: the selection, cards
// staged in the play area, and any scoring animation in progress. Jesters, masks,
// decrees, props and offers are saved by id and rebuilt from their pools; the only
// per-instance jester state is sellBonus plus the scaling counters tricksUsed and rocketPayout.

const SAVE_KEY = DEBUG_ENABLED ? "jester-run-debug" : "jester-run";
const SAVE_VERSION = 1;
const SAVED_SCALARS = {
  ante: "number", round: "number", target: "number", roundScore: "number", money: "number",
  handsLeft: "number", discardsLeft: "number", handSize: "number", rerollCost: "number",
  jestersSold: "number", freeRerollUsed: "boolean", packAvailable: "boolean",
  decreePackAvailable: "boolean", sortMode: "string", packKind: "string",
};

function runStorage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function serializeRun(s) {
  const data = { v: SAVE_VERSION, phase: s.phase };
  for (const key of Object.keys(SAVED_SCALARS)) data[key] = s[key];
  data.jesters = s.jesters.map(j => ({ id: j.id, sellBonus: j.sellBonus || 0, tricksUsed: j.tricksUsed || 0, rocketPayout: j.rocketPayout || 0 }));
  data.tricks = s.tricks.map(t => t.id);
  data.props = s.props.map(v => v.id);
  data.shopProp = s.shopProp?.id ?? null;
  data.shopOffers = s.shopOffers.map(j => j.id);
  data.shopTricks = s.shopTricks.map(t => t.id);
  data.shopDecrees = s.shopDecrees.map(d => d.id);
  data.pack = s.pack ? s.pack.map(t => t.id) : null;
  data.handLevels = s.handLevels;
  data.masterDeck = s.masterDeck;
  data.removed = s.removed;
  data.lastEarnings = s.lastEarnings;
  data.seed = s.seed;
  data.shopRolls = s.shopRolls;
  data.stats = s.stats;
  data.boss = s.bossModifier?.id ?? null;
  // A round that hasn't dealt yet has nothing more to save: resuming it just starts the round.
  data.roundState = s.phase === "playing" && (s.hand.length || s.played.length) ? {
    deck: s.deck, hand: s.hand, played: s.played, discarded: s.discarded,
    discardsUsed: s.discardsUsed, handTypesPlayed: [...s.handTypesPlayed],
  } : null;
  return data;
}

// Rebuilds a run state from saved data, or returns null if anything is off
// (wrong version, unknown ids, bad shapes), so a stale save never breaks the game.
function restoreRun(data) {
  const byId = (pool, id) => pool.find(x => x.id === id);
  const cardOk = c => c && typeof c.id === "string" && SUITS.includes(c.suit) && RANKS.includes(c.rank);
  const list = (ids, pool) => {
    if (!Array.isArray(ids)) throw new Error("not a list");
    return ids.map(id => {
      const item = byId(pool, id);
      if (!item) throw new Error("unknown id " + id);
      return item;
    });
  };
  try {
    if (!data || data.v !== SAVE_VERSION || (data.phase !== "shop" && data.phase !== "playing")) return null;
    const s = newState();
    for (const [key, type] of Object.entries(SAVED_SCALARS)) {
      if (typeof data[key] !== type) return null;
      s[key] = data[key];
    }
    s.phase = data.phase;
    s.jesters = data.jesters.map(j => ({ ...list([j.id], JESTER_POOL)[0], sellBonus: Number(j.sellBonus) || 0, tricksUsed: Number(j.tricksUsed) || 0, rocketPayout: Number(j.rocketPayout) || 0 }));
    s.tricks = list(data.tricks, [...TRICK_POOL, ...DECREE_POOL]).map(t => ({ ...t }));
    s.props = list(data.props, PROP_POOL);
    s.shopProp = data.shopProp ? list([data.shopProp], PROP_POOL)[0] : null;
    s.shopOffers = list(data.shopOffers, JESTER_POOL);
    s.shopTricks = list(data.shopTricks, TRICK_POOL);
    s.shopDecrees = list(data.shopDecrees, DECREE_POOL);
    s.pack = data.pack ? list(data.pack, s.packKind === "decree" ? DECREE_POOL : TRICK_POOL) : null;
    s.handLevels = {};
    for (const [name, level] of Object.entries(data.handLevels)) {
      if (!HAND_TYPES.some(t => t.name === name) || typeof level !== "number") return null;
      s.handLevels[name] = level;
    }
    if (!Array.isArray(data.masterDeck) || !data.masterDeck.every(cardOk)) return null;
    if (!Array.isArray(data.removed) || !data.removed.every(cardOk)) return null;
    s.masterDeck = data.masterDeck.map(c => ({ ...c }));
    s.removed = data.removed.map(c => ({ ...c }));
    s.lastEarnings = data.lastEarnings || null;
    // Saves from before seeds and stats existed lack these; the run just continues unseeded.
    s.seed = normalizeSeed(data.seed);
    s.shopRolls = Number(data.shopRolls) || 0;
    s.stats = restoreStats(data.stats);
    s.bossModifier = data.boss ? list([data.boss], BOSS_POOL)[0] : null;
    if (data.roundState) {
      if (data.phase !== "playing" || typeof data.roundState.discardsUsed !== "number") return null;
      for (const key of ["deck", "hand", "played", "discarded"]) {
        const cards = data.roundState[key];
        if (!Array.isArray(cards) || !cards.every(cardOk)) return null;
        s[key] = cards.map(c => ({ ...c }));
      }
      s.discardsUsed = data.roundState.discardsUsed;
      const played = data.roundState.handTypesPlayed;
      if (!Array.isArray(played) || !played.every(name => HAND_TYPES.some(t => t.name === name))) return null;
      s.handTypesPlayed = new Set(played);
    }
    return s;
  } catch {
    return null;
  }
}

function restoreStats(raw) {
  const stats = newStats();
  if (!raw || typeof raw !== "object") return stats;
  stats.handsPlayed = Number(raw.handsPlayed) || 0;
  stats.discards = Number(raw.discards) || 0;
  const best = raw.bestHand;
  if (best && typeof best.score === "number" && HAND_TYPES.some(t => t.name === best.name)) stats.bestHand = { score: best.score, name: best.name };
  for (const [name, n] of Object.entries(raw.handCounts || {})) {
    if (HAND_TYPES.some(t => t.name === name) && typeof n === "number") stats.handCounts[name] = n;
  }
  return stats;
}

// The ?seed=XXXX the page was opened with, if any.
function seedFromUrl() {
  try { return normalizeSeed(new URLSearchParams(location.search).get("seed")); } catch { return null; }
}

function dropSeedParam() {
  const url = new URL(location.href);
  url.searchParams.delete("seed");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}

// Saves whenever the screen is drawn in a round or the shop, and forgets the run once it
// ends. startRound() also saves explicitly, before its deal animation has drawn anything.
let lastSavedRun = null; // render() runs on every click; only write when the save changed
function persistRun() {
  const storage = runStorage();
  if (!storage || !state) return;
  try {
    if (state.phase === "gameover" || state.phase === "win") {
      storage.removeItem(SAVE_KEY);
      lastSavedRun = null;
    } else if (state.phase === "shop" || (state.phase === "playing" && !state.debugShop)) {
      const json = JSON.stringify(serializeRun(state));
      if (json === lastSavedRun) return;
      storage.setItem(SAVE_KEY, json);
      lastSavedRun = json;
    }
  } catch { /* storage full or blocked: the run just isn't saved */ }
}

// Abandoning a run takes two clicks: the first arms the button, and it disarms itself after a moment.
const NEW_RUN_CONFIRM_MS = 3000;
function initNewRunButton() {
  const btn = document.getElementById("new-run-btn");
  let timer = null;
  const disarm = () => {
    clearTimeout(timer);
    timer = null;
    btn.textContent = "New Run";
    btn.classList.remove("confirm");
  };
  btn.addEventListener("click", () => {
    if (timer === null) {
      btn.textContent = "Abandon this run?";
      btn.classList.add("confirm");
      timer = setTimeout(disarm, NEW_RUN_CONFIRM_MS);
      return;
    }
    disarm();
    restart();
  });
}

function loadRun() {
  const storage = runStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    return raw ? restoreRun(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
