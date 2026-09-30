// --- Constants ---------------------------------------------------------

const SUITS = ["♠", "♥", "♦", "♣"];
const RED_SUITS = new Set(["♥", "♦"]);
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { J: 11, Q: 12, K: 13, A: 14 };
const FACE_RANKS = new Set(["J", "Q", "K"]);
const EVEN_RANKS = new Set(["2", "4", "6", "8", "10"]);
const ODD_RANKS = new Set(["A", "3", "5", "7", "9"]);
const FIBONACCI_RANKS = new Set(["A", "2", "3", "5", "8"]);
const HAND_SIZE = 8;
const MAX_SELECTED = 5;
const START_HANDS = 4;
const START_DISCARDS = 3;
const START_MONEY = 4;
const JESTER_SLOTS = 5;
const ROUNDS_PER_ANTE = 3;
const FINAL_ANTE = 8;
const REROLL_BASE_COST = 2;

const HAND_TYPES = [
  { name: "Straight Flush", chips: 100, mult: 8, test: h => h.isFlush && h.isStraight },
  { name: "Four of a Kind", chips: 60, mult: 7, test: h => h.counts[0] === 4 },
  { name: "Full House", chips: 40, mult: 4, test: h => h.counts[0] === 3 && h.counts[1] === 2 },
  { name: "Flush", chips: 35, mult: 4, test: h => h.isFlush },
  { name: "Straight", chips: 30, mult: 4, test: h => h.isStraight },
  { name: "Three of a Kind", chips: 30, mult: 3, test: h => h.counts[0] === 3 },
  { name: "Two Pair", chips: 20, mult: 2, test: h => h.counts[0] === 2 && h.counts[1] === 2 },
  { name: "Pair", chips: 10, mult: 2, test: h => h.counts[0] === 2 },
  { name: "High Card", chips: 5, mult: 1, test: () => true },
];

const JESTER_POOL = [
  // --- Ported from Balatro (jesters "Available from start" whose effects --
  // --- fit this engine's scoring hook without adding new state tracking) -
  {
    id: "base_jester", name: "Jester", price: 2, rarity: "Common",
    desc: "+4 Mult",
    apply: () => ({ multAdd: 4 }),
  },
  {
    id: "greedy_jester", name: "Greedy Jester", price: 5, rarity: "Common",
    desc: "+3 Mult per Diamond played",
    apply: (ctx) => ({ multAdd: 3 * ctx.selected.filter(c => c.suit === "♦").length }),
  },
  {
    id: "lusty_jester", name: "Lusty Jester", price: 5, rarity: "Common",
    desc: "+3 Mult per Heart played",
    apply: (ctx) => ({ multAdd: 3 * ctx.selected.filter(c => c.suit === "♥").length }),
  },
  {
    id: "wrathful_jester", name: "Wrathful Jester", price: 5, rarity: "Common",
    desc: "+3 Mult per Spade played",
    apply: (ctx) => ({ multAdd: 3 * ctx.selected.filter(c => c.suit === "♠").length }),
  },
  {
    id: "gluttonous_jester", name: "Gluttonous Jester", price: 5, rarity: "Common",
    desc: "+3 Mult per Club played",
    apply: (ctx) => ({ multAdd: 3 * ctx.selected.filter(c => c.suit === "♣").length }),
  },
  {
    id: "jolly_jester", name: "Jolly Jester", price: 3, rarity: "Common",
    desc: "+8 Mult if played hand contains a Pair",
    apply: (ctx) => ({ multAdd: ctx.hand.counts[0] >= 2 ? 8 : 0 }),
  },
  {
    id: "zany_jester", name: "Zany Jester", price: 4, rarity: "Common",
    desc: "+12 Mult if played hand contains a Three of a Kind",
    apply: (ctx) => ({ multAdd: ctx.hand.counts[0] >= 3 ? 12 : 0 }),
  },
  {
    id: "mad_jester", name: "Mad Jester", price: 4, rarity: "Common",
    desc: "+10 Mult if played hand contains a Two Pair",
    apply: (ctx) => ({ multAdd: ctx.hand.counts.filter(n => n >= 2).length >= 2 ? 10 : 0 }),
  },
  {
    id: "crazy_jester", name: "Crazy Jester", price: 4, rarity: "Common",
    desc: "+12 Mult if played hand contains a Straight",
    apply: (ctx) => ({ multAdd: ctx.hand.isStraight ? 12 : 0 }),
  },
  {
    id: "droll_jester", name: "Droll Jester", price: 4, rarity: "Common",
    desc: "+10 Mult if played hand contains a Flush",
    apply: (ctx) => ({ multAdd: ctx.hand.isFlush ? 10 : 0 }),
  },
  {
    id: "sly_jester", name: "Sly Jester", price: 3, rarity: "Common",
    desc: "+50 Chips if played hand contains a Pair",
    apply: (ctx) => ({ chips: ctx.hand.counts[0] >= 2 ? 50 : 0 }),
  },
  {
    id: "wily_jester", name: "Wily Jester", price: 4, rarity: "Common",
    desc: "+100 Chips if played hand contains a Three of a Kind",
    apply: (ctx) => ({ chips: ctx.hand.counts[0] >= 3 ? 100 : 0 }),
  },
  {
    id: "clever_jester", name: "Clever Jester", price: 4, rarity: "Common",
    desc: "+80 Chips if played hand contains a Two Pair",
    apply: (ctx) => ({ chips: ctx.hand.counts.filter(n => n >= 2).length >= 2 ? 80 : 0 }),
  },
  {
    id: "devious_jester", name: "Devious Jester", price: 4, rarity: "Common",
    desc: "+100 Chips if played hand contains a Straight",
    apply: (ctx) => ({ chips: ctx.hand.isStraight ? 100 : 0 }),
  },
  {
    id: "crafty_jester", name: "Crafty Jester", price: 4, rarity: "Common",
    desc: "+80 Chips if played hand contains a Flush",
    apply: (ctx) => ({ chips: ctx.hand.isFlush ? 80 : 0 }),
  },
  {
    id: "half_jester", name: "Half Jester", price: 5, rarity: "Common",
    desc: "+20 Mult if played hand has 3 or fewer cards",
    apply: (ctx) => ({ multAdd: ctx.selected.length <= 3 ? 20 : 0 }),
  },
  {
    id: "jester_stencil", name: "Jester Stencil", price: 8, rarity: "Uncommon",
    desc: "X1 Mult for each empty Jester slot (itself included)",
    apply: (ctx) => ({ multMul: 1 + Math.max(0, ctx.jesterSlots - ctx.jesters.length) }),
  },
  {
    id: "banner", name: "Banner", price: 5, rarity: "Common",
    desc: "+30 Chips for each remaining discard",
    apply: (ctx) => ({ chips: 30 * ctx.discardsLeft }),
  },
  {
    id: "mystic_summit", name: "Mystic Summit", price: 5, rarity: "Common",
    desc: "+15 Mult when 0 discards remaining",
    apply: (ctx) => ({ multAdd: ctx.discardsLeft === 0 ? 15 : 0 }),
  },
  {
    id: "misprint", name: "Misprint", price: 4, rarity: "Common",
    desc: "+0-23 Mult (random)",
    apply: () => ({ multAdd: Math.floor(Math.random() * 24) }),
  },
  {
    id: "raised_fist", name: "Raised Fist", price: 5, rarity: "Common",
    desc: "Adds double the rank of the lowest card held in hand to Mult",
    apply: (ctx) => {
      if (ctx.heldHand.length === 0) return {};
      const lowest = Math.min(...ctx.heldHand.map(c => rankNum(c.rank)));
      return { multAdd: lowest * 2 };
    },
  },
  {
    id: "fibonacci", name: "Fibonacci", price: 8, rarity: "Uncommon",
    desc: "+8 Mult per played Ace, 2, 3, 5, or 8",
    apply: (ctx) => ({ multAdd: 8 * ctx.selected.filter(c => FIBONACCI_RANKS.has(c.rank)).length }),
  },
  {
    id: "scary_face", name: "Scary Face", price: 4, rarity: "Common",
    desc: "+30 Chips per played face card",
    apply: (ctx) => ({ chips: 30 * ctx.selected.filter(c => FACE_RANKS.has(c.rank)).length }),
  },
  {
    id: "abstract_jester", name: "Abstract Jester", price: 4, rarity: "Common",
    desc: "+3 Mult per Jester card",
    apply: (ctx) => ({ multAdd: 3 * ctx.jesters.length }),
  },
  {
    id: "even_steven", name: "Even Steven", price: 4, rarity: "Common",
    desc: "+4 Mult per played even-rank card (10,8,6,4,2)",
    apply: (ctx) => ({ multAdd: 4 * ctx.selected.filter(c => EVEN_RANKS.has(c.rank)).length }),
  },
  {
    id: "odd_todd", name: "Odd Todd", price: 4, rarity: "Common",
    desc: "+31 Chips per played odd-rank card (A,9,7,5,3)",
    apply: (ctx) => ({ chips: 31 * ctx.selected.filter(c => ODD_RANKS.has(c.rank)).length }),
  },
  {
    id: "scholar", name: "Scholar", price: 4, rarity: "Common",
    desc: "Played Aces give +20 Chips and +4 Mult",
    apply: (ctx) => {
      const aces = ctx.selected.filter(c => c.rank === "A").length;
      return { chips: 20 * aces, multAdd: 4 * aces };
    },
  },
  {
    id: "business_card", name: "Business Card", price: 4, rarity: "Common",
    desc: "Played face cards have a 1 in 2 chance to give $2 when scored",
    apply: (ctx) => {
      let money = 0;
      for (const c of ctx.selected) if (FACE_RANKS.has(c.rank) && Math.random() < 0.5) money += 2;
      return { money };
    },
  },
  {
    id: "blackboard", name: "Blackboard", price: 6, rarity: "Uncommon",
    desc: "X3 Mult if all cards held in hand are Spades or Clubs",
    apply: (ctx) => ({ multMul: ctx.heldHand.every(c => c.suit === "♠" || c.suit === "♣") ? 3 : 1 }),
  },
  {
    id: "blue_jester", name: "Blue Jester", price: 5, rarity: "Common",
    desc: "+2 Chips for each remaining card in deck",
    apply: (ctx) => ({ chips: 2 * ctx.deckSize }),
  },
  {
    id: "baron", name: "Baron", price: 8, rarity: "Rare",
    desc: "Each King held in hand gives X1.5 Mult",
    apply: (ctx) => ({ multMul: Math.pow(1.5, ctx.heldHand.filter(c => c.rank === "K").length) }),
  },
  {
    id: "photograph", name: "Photograph", price: 5, rarity: "Common",
    desc: "First played face card gives X2 Mult when scored",
    apply: (ctx) => ({ multMul: ctx.selected.some(c => FACE_RANKS.has(c.rank)) ? 2 : 1 }),
  },
  {
    id: "reserved_parking", name: "Reserved Parking", price: 6, rarity: "Common",
    desc: "Each face card held in hand has a 1 in 2 chance to give $1",
    apply: (ctx) => {
      let money = 0;
      for (const c of ctx.heldHand) if (FACE_RANKS.has(c.rank) && Math.random() < 0.5) money += 1;
      return { money };
    },
  },
  {
    id: "baseball_card", name: "Baseball Card", price: 8, rarity: "Rare",
    desc: "Uncommon Jesters each give X1.5 Mult",
    apply: (ctx) => ({ multMul: Math.pow(1.5, ctx.jesters.filter(j => j.rarity === "Uncommon").length) }),
  },
  {
    id: "bull", name: "Bull", price: 6, rarity: "Uncommon",
    desc: "+2 Chips for each $1 you have",
    apply: (ctx) => ({ chips: 2 * Math.max(0, ctx.money) }),
  },
  {
    id: "walkie_talkie", name: "Walkie Talkie", price: 4, rarity: "Common",
    desc: "Each played 10 or 4 gives +10 Chips and +4 Mult",
    apply: (ctx) => {
      const n = ctx.selected.filter(c => c.rank === "10" || c.rank === "4").length;
      return { chips: 10 * n, multAdd: 4 * n };
    },
  },
  {
    id: "smiley_face", name: "Smiley Face", price: 4, rarity: "Common",
    desc: "Played face cards give +5 Mult",
    apply: (ctx) => ({ multAdd: 5 * ctx.selected.filter(c => FACE_RANKS.has(c.rank)).length }),
  },
];

// --- State ---------------------------------------------------------------

let state = null;
let lastJesterSig = null;

function newState() {
  return {
    ante: 1,
    round: 1,
    target: 300,
    roundScore: 0,
    money: START_MONEY,
    handsLeft: START_HANDS,
    discardsLeft: START_DISCARDS,
    deck: [],
    hand: [],
    selected: new Set(),
    jesters: [],
    shopOffers: [],
    rerollCost: REROLL_BASE_COST,
    sortMode: "rank", // rank | suit
    phase: "playing", // playing | shop | gameover | win
    dealtIds: new Map(),
  };
}

function freshDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank, id: `${rank}${suit}` });
  }
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

function startRound() {
  state.deck = freshDeck();
  state.hand = [];
  state.selected = new Set();
  state.roundScore = 0;
  state.handsLeft = START_HANDS;
  state.discardsLeft = START_DISCARDS;
  state.target = targetForRound(state.ante, state.round);
  state.phase = "playing";
  state.dealtIds = new Map();

  const deal = () => {
    state.hand = draw(HAND_SIZE);
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

// --- Hand evaluation -------------------------------------------------------

function rankNum(rank) {
  return RANK_VALUE[rank] || parseInt(rank, 10);
}

// Called with 1-5 selected cards. Flush/straight require exactly 5 (checked
// below); count-based hands (pair..four of a kind) fall out of rankCounts
// naturally at any size, which is correct (e.g. 4 selected cards of the same
// rank is a real four of a kind).
function evaluateHand(cards) {
  const rankCounts = {};
  for (const c of cards) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  const isFlush = cards.length === 5 && cards.every(c => c.suit === cards[0].suit);

  let isStraight = false;
  if (cards.length === 5) {
    const nums = [...new Set(cards.map(c => rankNum(c.rank)))].sort((a, b) => a - b);
    const isWheel = nums.join(",") === "2,3,4,5,14"; // A-2-3-4-5
    if (nums.length === 5 && (nums[4] - nums[0] === 4 || isWheel)) isStraight = true;
  }

  const h = { counts, isFlush, isStraight };
  const type = HAND_TYPES.find(t => t.test(h));
  return { name: type.name, baseChips: type.chips, baseMult: type.mult, isStraight, isFlush, counts };
}

function cardChipValue(card) {
  if (card.rank === "A") return 11;
  if (RANK_VALUE[card.rank]) return 10;
  return parseInt(card.rank, 10);
}

function scoreSelection(selected) {
  const hand = evaluateHand(selected);
  let chips = hand.baseChips + selected.reduce((sum, c) => sum + cardChipValue(c), 0);
  let mult = hand.baseMult;
  let multMul = 1;
  let money = 0;

  // Cards still in hand after this selection is played/discarded — used by
  // jesters that key off what's "held in hand" rather than what's played.
  const selectedIds = new Set(selected.map(c => c.id));
  const heldHand = state.hand.filter(c => !selectedIds.has(c.id));

  const ctx = {
    selected, hand, heldHand,
    discardsLeft: state.discardsLeft,
    money: state.money,
    deckSize: state.deck.length,
    jesters: state.jesters,
    jesterSlots: JESTER_SLOTS,
  };

  for (const j of state.jesters) {
    const effect = j.apply(ctx);
    if (effect.chips) chips += effect.chips;
    if (effect.multAdd) mult += effect.multAdd;
    if (effect.multMul) multMul *= effect.multMul;
    if (effect.money) money += effect.money;
  }

  const total = Math.floor(chips * mult * multMul);
  return { hand, chips, mult, multMul, total, money };
}

// --- Actions ---------------------------------------------------------------

function toggleCard(id) {
  if (state.phase !== "playing") return;
  const card = state.hand.find(c => c.id === id);
  if (!card) return;
  if (state.selected.has(id)) {
    state.selected.delete(id);
    Sound.cardDeselect();
  } else if (state.selected.size < MAX_SELECTED) {
    state.selected.add(id);
    Sound.cardSelect();
  }
  render();
}

function getSelectedCards() {
  return state.hand.filter(c => state.selected.has(c.id));
}

function playHand() {
  const selected = getSelectedCards();
  if (selected.length === 0 || state.handsLeft <= 0) return;

  const result = scoreSelection(selected);
  state.roundScore += result.total;
  state.money += result.money;
  state.handsLeft -= 1;
  Sound.playHandResolve(result.total);

  state.hand = state.hand.filter(c => !state.selected.has(c.id));
  state.selected = new Set();
  const drawn = draw(HAND_SIZE - state.hand.length);
  state.hand.push(...drawn);
  state.dealtIds = new Map(drawn.map((c, i) => [c.id, i]));
  if (drawn.length) Sound.dealHand(drawn.length);

  if (state.roundScore >= state.target) {
    finishRoundWin();
  } else if (state.handsLeft <= 0) {
    state.phase = "gameover";
    Sound.gameOver();
  }
  render();
}

function discardSelected() {
  const selected = getSelectedCards();
  if (selected.length === 0 || state.discardsLeft <= 0) return;
  state.discardsLeft -= 1;
  Sound.discard(selected.length);
  state.hand = state.hand.filter(c => !state.selected.has(c.id));
  state.selected = new Set();
  const drawn = draw(HAND_SIZE - state.hand.length);
  state.hand.push(...drawn);
  state.dealtIds = new Map(drawn.map((c, i) => [c.id, i]));
  if (drawn.length) Sound.dealHand(drawn.length);
  render();
}

function finishRoundWin() {
  const reward = 3 + state.handsLeft + state.discardsLeft;
  state.money += reward;

  if (state.ante >= FINAL_ANTE && state.round >= ROUNDS_PER_ANTE) {
    state.phase = "win";
    Sound.gameWin();
    return;
  }

  Sound.roundWin();
  state.phase = "shop";
  state.rerollCost = REROLL_BASE_COST;
  const owned = new Set(state.jesters.map(j => j.id));
  const pool = JESTER_POOL.filter(j => !owned.has(j.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.shopOffers = pool.slice(0, 3);
}

function buyJester(id) {
  if (state.jesters.length >= JESTER_SLOTS) return;
  const idx = state.shopOffers.findIndex(j => j.id === id);
  if (idx === -1) return;
  const jester = state.shopOffers[idx];
  if (state.money < jester.price) return;
  state.money -= jester.price;
  state.jesters.push(jester);
  state.shopOffers.splice(idx, 1);
  Sound.coinBuy();
  render();
}

function sellJester(id) {
  if (state.phase !== "shop") return;
  const idx = state.jesters.findIndex(j => j.id === id);
  if (idx === -1) return;
  const [jester] = state.jesters.splice(idx, 1);
  state.money += Math.max(1, Math.floor(jester.price / 2));
  Sound.coinSell();
  render();
}

function rerollShop() {
  if (state.phase !== "shop" || state.money < state.rerollCost) return;
  state.money -= state.rerollCost;
  state.rerollCost += 1;
  Sound.shuffle();
  const owned = new Set(state.jesters.map(j => j.id));
  const pool = JESTER_POOL.filter(j => !owned.has(j.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.shopOffers = pool.slice(0, 3);
  render();
}

function nextRound() {
  state.round += 1;
  if (state.round > ROUNDS_PER_ANTE) {
    state.round = 1;
    state.ante += 1;
  }
  startRound();
  render();
}

function restart() {
  state = newState();
  startRound();
  render();
}

// --- Rendering ---------------------------------------------------------------

const SUIT_ORDER = new Map(SUITS.map((s, i) => [s, i]));

function sortedHand() {
  const cards = [...state.hand];
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
// the onerror handler drops the <img> so a missing file just falls back to
// the plain name/description card that's always been there.
function jesterArtHTML(id) {
  return `<img class="jester-art" src="assets/jesters/${id}.png" alt="" onerror="this.remove()">`;
}

function jesterHeaderHTML(j) {
  const rarityClass = "rarity-" + (j.rarity || "common").toLowerCase();
  return `${jesterArtHTML(j.id)}<span class="jester-name">${j.name}</span><span class="jester-rarity ${rarityClass}">${j.rarity || ""}</span>`;
}

function render() {
  if (typeof document === "undefined") return;
  document.getElementById("ante-val").textContent = state.ante;
  document.getElementById("round-val").textContent = state.round;
  document.getElementById("score-val").textContent = `${state.roundScore} / ${state.target}`;
  document.getElementById("money-val").textContent = state.money;
  document.getElementById("hands-val").textContent = state.handsLeft;
  document.getElementById("discards-val").textContent = state.discardsLeft;

  const jesterRow = document.getElementById("jester-row");
  const jesterSig = state.jesters.map(j => j.id).join(",");
  if (jesterSig !== lastJesterSig) {
    lastJesterSig = jesterSig;
    jesterRow.innerHTML = "";
    for (const j of state.jesters) {
      const div = document.createElement("div");
      div.className = "jester";
      div.innerHTML = `${jesterHeaderHTML(j)}${j.desc}`;
      jesterRow.appendChild(div);
    }
  }

  document.getElementById("sort-rank-btn").classList.toggle("active", state.sortMode === "rank");
  document.getElementById("sort-suit-btn").classList.toggle("active", state.sortMode === "suit");

  const dealt = state.dealtIds;
  state.dealtIds = new Map();

  const handRow = document.getElementById("hand-row");
  handRow.innerHTML = "";
  for (const card of sortedHand()) {
    const div = document.createElement("div");
    div.className = "card " + (RED_SUITS.has(card.suit) ? "red" : "black");
    const isSelected = state.selected.has(card.id);
    if (isSelected) div.classList.add("selected");
    if (dealt.has(card.id)) {
      div.classList.add("dealt");
      div.style.animationDelay = `${dealt.get(card.id) * 70}ms`;
    }
    div.innerHTML = `
      <span class="rank-top">${card.rank}${card.suit}</span>
      <span class="suit-mid">${card.suit}</span>
      <span class="rank-bottom">${card.rank}${card.suit}</span>
    `;
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.setAttribute("aria-pressed", String(isSelected));
    div.setAttribute("aria-label", `${card.rank} of ${card.suit}`);
    div.addEventListener("click", () => toggleCard(card.id));
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleCard(card.id);
      }
    });
    handRow.appendChild(div);
  }

  const selected = getSelectedCards();
  const previewName = document.getElementById("preview-name");
  const previewMath = document.getElementById("preview-math");
  if (selected.length > 0) {
    const result = scoreSelection(selected);
    previewName.textContent = result.hand.name;
    previewMath.textContent = `${result.chips} chips × ${(result.mult * result.multMul).toFixed(result.multMul !== 1 ? 1 : 0)} mult = ${result.total}`;
  } else {
    previewName.textContent = " ";
    previewMath.textContent = "";
  }

  document.getElementById("play-btn").disabled = selected.length === 0 || state.phase !== "playing";
  document.getElementById("discard-btn").disabled = selected.length === 0 || state.discardsLeft <= 0 || state.phase !== "playing";

  renderOverlay();
}

function renderOverlay() {
  const overlay = document.getElementById("overlay");
  const rerollBtn = document.getElementById("reroll-btn");
  const ownedSection = document.getElementById("owned-jesters-section");
  if (state.phase === "shop") {
    overlay.classList.remove("hidden");
    document.getElementById("overlay-title").textContent = "Round Cleared!";
    document.getElementById("overlay-sub").textContent = `Shop – Ante ${state.ante}, Round ${state.round}`;
    const shopItems = document.getElementById("shop-items");
    shopItems.innerHTML = "";
    for (const j of state.shopOffers) {
      const div = document.createElement("div");
      div.className = "shop-item";
      const canBuy = state.money >= j.price && state.jesters.length < JESTER_SLOTS;
      if (!canBuy) div.classList.add("unaffordable");
      div.innerHTML = `
        ${jesterHeaderHTML(j)}
        <div>${j.desc}</div>
        <div class="price">$${j.price}</div>
        <button ${canBuy ? "" : "disabled"}>Buy</button>
      `;
      div.querySelector("button").addEventListener("click", () => buyJester(j.id));
      shopItems.appendChild(div);
    }

    const ownedList = document.getElementById("owned-jesters");
    ownedList.innerHTML = "";
    if (state.jesters.length > 0) {
      ownedSection.classList.remove("hidden");
      for (const j of state.jesters) {
        const div = document.createElement("div");
        div.className = "jester";
        div.innerHTML = `${jesterHeaderHTML(j)}${j.desc}`;
        const sellBtn = document.createElement("button");
        sellBtn.className = "sell-btn";
        sellBtn.textContent = `Sell $${Math.max(1, Math.floor(j.price / 2))}`;
        sellBtn.addEventListener("click", () => sellJester(j.id));
        div.appendChild(sellBtn);
        ownedList.appendChild(div);
      }
    } else {
      ownedSection.classList.add("hidden");
    }

    rerollBtn.classList.remove("hidden");
    rerollBtn.textContent = `Reroll ($${state.rerollCost})`;
    rerollBtn.disabled = state.money < state.rerollCost;
    rerollBtn.onclick = rerollShop;
    const btn = document.getElementById("overlay-btn");
    btn.textContent = "Next Round";
    btn.onclick = nextRound;
  } else if (state.phase === "win") {
    overlay.classList.remove("hidden");
    document.getElementById("overlay-title").textContent = "You Win!";
    document.getElementById("overlay-sub").textContent = `Cleared Ante ${FINAL_ANTE} with ${state.jesters.length} jester(s) held.`;
    document.getElementById("shop-items").innerHTML = "";
    rerollBtn.classList.add("hidden");
    ownedSection.classList.add("hidden");
    const btn = document.getElementById("overlay-btn");
    btn.textContent = "Play Again";
    btn.onclick = restart;
  } else if (state.phase === "gameover") {
    overlay.classList.remove("hidden");
    document.getElementById("overlay-title").textContent = "Game Over";
    document.getElementById("overlay-sub").textContent = `You reached Ante ${state.ante}, Round ${state.round}.`;
    document.getElementById("shop-items").innerHTML = "";
    rerollBtn.classList.add("hidden");
    ownedSection.classList.add("hidden");
    const btn = document.getElementById("overlay-btn");
    btn.textContent = "Restart";
    btn.onclick = restart;
  } else {
    overlay.classList.add("hidden");
  }
}

// --- Init ---------------------------------------------------------------

function initApp() {
  document.getElementById("play-btn").addEventListener("click", playHand);
  document.getElementById("discard-btn").addEventListener("click", discardSelected);
  document.getElementById("sort-rank-btn").addEventListener("click", () => setSortMode("rank"));
  document.getElementById("sort-suit-btn").addEventListener("click", () => setSortMode("suit"));

  const muteBtn = document.getElementById("mute-btn");
  function syncMuteBtn() {
    const muted = Sound.isMuted();
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.classList.toggle("muted", muted);
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }
  muteBtn.addEventListener("click", () => {
    Sound.toggleMuted();
    syncMuteBtn();
  });
  syncMuteBtn();

  const handReferenceList = document.getElementById("hand-reference-list");
  for (const t of HAND_TYPES) {
    const li = document.createElement("li");
    li.textContent = `${t.name} — ${t.chips} chips × ${t.mult} mult`;
    handReferenceList.appendChild(li);
  }

  state = newState();
  startRound();
  render();
}

// Browser entry point. Guarded so this file can also be `require()`d from
// plain Node (see test/scoring.test.js) without a DOM.
if (typeof document !== "undefined") {
  initApp();
}

// Test hooks: pure scoring functions, the state machine's actions, and a
// raw accessor to `state` so tests can drive/inspect it directly instead of
// only going through the DOM.
const testHooks = {
  // pure functions
  evaluateHand,
  scoreSelection,
  targetForRound,
  rankNum,
  cardChipValue,
  freshDeck,
  HAND_TYPES,
  JESTER_POOL,
  // state machine
  newState,
  startRound,
  toggleCard,
  getSelectedCards,
  playHand,
  discardSelected,
  buyJester,
  sellJester,
  rerollShop,
  nextRound,
  restart,
  render,
  // test-only state access
  _getState: () => state,
  _setState: (s) => { state = s; },
};

// Plain Node (no DOM): export the hooks as a CommonJS module.
if (typeof module !== "undefined" && module.exports) {
  module.exports = testHooks;
}
// Browser test runner (jsdom driving the real index.html + initApp() path):
// opts in by setting this sentinel *before* game.js loads. Real pages never
// set it, so nothing extra ships to players.
if (typeof window !== "undefined" && window.__JESTER_TEST__) {
  window.__jesterTest = testHooks;
}
