// --- State ---------------------------------------------------------------

let state = null;
let lastJesterSig = null;
let lastTricks = null; // the tricks the play row was last built from
let lastTrickSlots = 0;

function newState() {
  return {
    ante: 1,
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
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

function targetForRound(ante, round) {
  const base = 300 * Math.pow(1.5, ante - 1);
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
  state.bossModifier = state.round === ROUNDS_PER_ANTE
    ? (boss || (state.ante >= FINAL_ANTE ? KING_BOSS : BOSS_MODIFIERS[Math.floor(Math.random() * BOSS_MODIFIERS.length)]))
    : null;
  const jesterHandSizeDelta = state.jesters.reduce((sum, j) => sum + (j.handSizeDelta || 0), 0) + propSum("handSizeDelta");
  const jesterDiscardsDelta = state.jesters.reduce((sum, j) => sum + (j.discardsDelta || 0), 0) + propSum("discardsDelta");
  state.handSize = HAND_SIZE + (state.bossModifier?.handSizeDelta || 0) + jesterHandSizeDelta;
  state.handsLeft = (state.bossModifier?.handsOverride ?? START_HANDS) + propSum("handsDelta");
  state.discardsLeft = (state.bossModifier?.discardsOverride ?? START_DISCARDS) + jesterDiscardsDelta;
  state.target = targetForRound(state.ante, state.round);
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
