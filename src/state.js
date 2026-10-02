// --- State ---------------------------------------------------------------

let state = null;
const lastJesterStatus = new WeakMap(); // jester -> its status text at the last render, to spot growth
let lastJesterSig = null;
let roundEnd = null; // while the jesters' end-of-act effects play out on the table, before the shop opens
let lastTricks = null; // the tricks the play row was last built from
let lastTrickSlots = 0;

// --- Seeds --------------------------------------------------------------
// A run's seed fixes its deck order each round, its boss choices and its shop offers
// (including each reroll), so the same seed deals the same cards and stocks the same
// shelves. In-hand chance (glass breaking, jester procs) stays unseeded. A state with
// no seed (tests, old saves) falls back to Math.random.

const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SEED_LENGTH = 8;

function randomSeed() {
  let seed = "";
  for (let i = 0; i < SEED_LENGTH; i++) seed += SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)];
  return seed;
}

// Uppercases and drops anything that isn't a letter or digit; null if nothing is left.
function normalizeSeed(text) {
  const seed = String(text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return seed || null;
}

// FNV-1a over the text, then mulberry32 seeded from that.
function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The random source for one named event of the run (e.g. "deck:2:1").
function rngFor(label) {
  return state?.seed ? seededRandom(state.seed + "|" + label) : Math.random;
}

function newStats() {
  return { handsPlayed: 0, discards: 0, bestHand: null, handCounts: {} };
}

function newState(seed = null) {
  return {
    seed,
    stats: newStats(),
    shopRolls: 0, // shop rolls this round, so each reroll under a seed is its own roll
    venue: 1,
    round: 1,
    target: 300,
    roundScore: 0,
    money: START_MONEY,
    handsLeft: START_HANDS,
    discardsLeft: START_DISCARDS,
    masterDeck: baseDeck(),
    removed: [], // cards destroyed this run, kept so the deck screen can show them as removed
    deck: [],
    hand: [],
    played: [],
    discarded: [],
    selected: new Set(),
    staged: new Set(), // selected cards that have been moved into the play area
    jesters: [],
    tricks: [],
    props: [],
    shopProp: null,
    handLevels: {},
    shopOffers: [],
    shopTricks: [],
    shopDecrees: [],
    packAvailable: false,
    decreePackAvailable: false,
    pack: null,
    packKind: "trick", // trick | decree
    rerollCost: REROLL_BASE_COST,
    sortMode: "rank", // rank | suit | custom (hand order set by dragging)
    phase: "playing", // playing | shop | gameover | win
    dealtIds: new Map(),
    lastEarnings: null,
    bossModifier: null,
    handTypesPlayed: new Set(),
    handSize: HAND_SIZE,
    discardsUsed: 0,
    freeRerollUsed: false,
    jestersSold: 0,
    debugShop: false,
  };
}

// The standard 52. A card's id is its identity for the whole run: decrees may
// change its rank/suit, but never its id.
function baseDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank, id: `${rank}${suit}` });
  }
  return deck;
}

// A shuffled copy of the run's deck (decree edits included).
function freshDeck() {
  const deck = (state?.masterDeck || baseDeck()).map(c => ({ ...c }));
  const rand = rngFor(`deck:${state?.venue}:${state?.round}`);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function draw(n) {
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (state.deck.length === 0) break;
    drawn.push(state.deck.pop());
  }
  return drawn;
}

function targetForRound(venue, round) {
  const base = 300 * Math.pow(1.5, venue - 1);
  return Math.round(base * (1 + 0.35 * (round - 1)) / 10) * 10;
}

function animateShuffle() {
  const pile = document.getElementById("deck-pile");
  pile.classList.remove("shuffling");
  void pile.offsetWidth; // restart animation
  pile.classList.add("shuffling");
}

// `boss` is only passed when resuming a saved run, so a refresh can't re-roll the boss.
function startRound(boss) {
  state.deck = freshDeck();
  state.hand = [];
  state.played = [];
  state.discarded = [];
  clearSelection();
  state.roundScore = 0;
  state.handTypesPlayed = new Set();
  state.bossModifier = state.round === ROUNDS_PER_VENUE
    ? (boss || (state.venue >= FINAL_VENUE ? KING_BOSS : BOSS_MODIFIERS[Math.floor(rngFor(`boss:${state.venue}`)() * BOSS_MODIFIERS.length)]))
    : null;
  const jesterHandSizeDelta = state.jesters.reduce((sum, j) => sum + (j.handSizeDelta || 0), 0) + propSum("handSizeDelta");
  const jesterDiscardsDelta = state.jesters.reduce((sum, j) => sum + (j.discardsDelta || 0), 0) + propSum("discardsDelta");
  state.handSize = HAND_SIZE + (state.bossModifier?.handSizeDelta || 0) + jesterHandSizeDelta;
  state.handsLeft = (state.bossModifier?.handsOverride ?? START_HANDS) + propSum("handsDelta");
  state.discardsLeft = (state.bossModifier?.discardsOverride ?? START_DISCARDS) + jesterDiscardsDelta;
  state.target = targetForRound(state.venue, state.round);
  if (state.bossModifier?.targetMult) {
    state.target = Math.round(state.target * state.bossModifier.targetMult / 10) * 10;
  }
  state.phase = "playing";
  state.dealtIds = new Map();
  state.discardsUsed = 0;
  persistRun();

  const deal = () => {
    state.hand = draw(state.handSize);
    state.dealtIds = new Map(state.hand.map((c, i) => [c.id, i]));
    Sound.dealHand(state.hand.length);
    render();
  };

  Sound.shuffle();
  if (typeof document !== "undefined") {
    // Deal after the shuffle animation finishes.
    animateShuffle();
    setTimeout(deal, 420);
  } else {
    // No DOM (e.g. tests driving the state machine directly): deal now.
    deal();
  }
}
