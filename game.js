// --- Constants ---------------------------------------------------------

const SUITS = ["♠", "♥", "♦", "♣"];
const RED_SUITS = new Set(["♥", "♦"]);
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { J: 11, Q: 12, K: 13, A: 14 };
const HAND_SIZE = 8;
const MAX_SELECTED = 5;
const START_HANDS = 4;
const START_DISCARDS = 3;
const START_MONEY = 4;
const JOKER_SLOTS = 5;

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

const JOKER_POOL = [
  {
    id: "steady", name: "Steady", price: 4,
    desc: "+4 Mult",
    apply: () => ({ multAdd: 4 }),
  },
  {
    id: "heavyweight", name: "Heavyweight", price: 4,
    desc: "+30 Chips",
    apply: () => ({ chips: 30 }),
  },
  {
    id: "pair_bonus", name: "Pair Bonus", price: 5,
    desc: "+3 Mult if hand has a pair or better",
    apply: (ctx) => ({ multAdd: ctx.hand.counts[0] >= 2 ? 3 : 0 }),
  },
  {
    id: "flush_fan", name: "Flush Fan", price: 6,
    desc: "+2 Mult per Heart played",
    apply: (ctx) => ({ multAdd: 2 * ctx.selected.filter(c => c.suit === "♥").length }),
  },
  {
    id: "straight_shooter", name: "Straight Shooter", price: 5,
    desc: "+20 Chips if Straight or better",
    apply: (ctx) => ({ chips: ctx.hand.isStraight ? 20 : 0 }),
  },
  {
    id: "face_value", name: "Face Value", price: 5,
    desc: "+3 Chips per face card (J/Q/K/A)",
    apply: (ctx) => ({ chips: 3 * ctx.selected.filter(c => RANK_VALUE[c.rank]).length }),
  },
  {
    id: "multiplier", name: "Multiplier", price: 7,
    desc: "x1.5 Mult",
    apply: () => ({ multMul: 1.5 }),
  },
  {
    id: "crowd_pleaser", name: "Crowd Pleaser", price: 4,
    desc: "+1 Mult per card played",
    apply: (ctx) => ({ multAdd: ctx.selected.length }),
  },
];

// --- State ---------------------------------------------------------------

let state = null;

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
    jokers: [],
    shopOffers: [],
    phase: "playing", // playing | shop | gameover
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

function startRound() {
  state.deck = freshDeck();
  state.hand = draw(HAND_SIZE);
  state.selected = new Set();
  state.roundScore = 0;
  state.handsLeft = START_HANDS;
  state.discardsLeft = START_DISCARDS;
  state.target = targetForRound(state.ante, state.round);
  state.phase = "playing";
}

// --- Hand evaluation -------------------------------------------------------

function rankNum(rank) {
  return RANK_VALUE[rank] || parseInt(rank, 10);
}

function evaluateHand(cards) {
  const rankCounts = {};
  for (const c of cards) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  const isFlush = cards.length === 5 && cards.every(c => c.suit === cards[0].suit);

  let isStraight = false;
  if (cards.length === 5) {
    const nums = [...new Set(cards.map(c => rankNum(c.rank)))].sort((a, b) => a - b);
    if (nums.length === 5 && nums[4] - nums[0] === 4) isStraight = true;
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

  for (const j of state.jokers) {
    const effect = j.apply({ selected, hand });
    if (effect.chips) chips += effect.chips;
    if (effect.multAdd) mult += effect.multAdd;
    if (effect.multMul) multMul *= effect.multMul;
  }

  const total = Math.floor(chips * mult * multMul);
  return { hand, chips, mult, multMul, total };
}

// --- Actions ---------------------------------------------------------------

function toggleCard(id) {
  if (state.phase !== "playing") return;
  const card = state.hand.find(c => c.id === id);
  if (!card) return;
  if (state.selected.has(id)) {
    state.selected.delete(id);
  } else if (state.selected.size < MAX_SELECTED) {
    state.selected.add(id);
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
  state.handsLeft -= 1;

  state.hand = state.hand.filter(c => !state.selected.has(c.id));
  state.selected = new Set();
  state.hand.push(...draw(HAND_SIZE - state.hand.length));

  if (state.roundScore >= state.target) {
    finishRoundWin();
  } else if (state.handsLeft <= 0) {
    state.phase = "gameover";
  }
  render();
}

function discardSelected() {
  const selected = getSelectedCards();
  if (selected.length === 0 || state.discardsLeft <= 0) return;
  state.discardsLeft -= 1;
  state.hand = state.hand.filter(c => !state.selected.has(c.id));
  state.selected = new Set();
  state.hand.push(...draw(HAND_SIZE - state.hand.length));
  render();
}

function finishRoundWin() {
  const reward = 3 + state.handsLeft + state.discardsLeft;
  state.money += reward;
  state.phase = "shop";
  const owned = new Set(state.jokers.map(j => j.id));
  const pool = JOKER_POOL.filter(j => !owned.has(j.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.shopOffers = pool.slice(0, 3);
}

function buyJoker(id) {
  if (state.jokers.length >= JOKER_SLOTS) return;
  const idx = state.shopOffers.findIndex(j => j.id === id);
  if (idx === -1) return;
  const joker = state.shopOffers[idx];
  if (state.money < joker.price) return;
  state.money -= joker.price;
  state.jokers.push(joker);
  state.shopOffers.splice(idx, 1);
  render();
}

function nextRound() {
  state.round += 1;
  if (state.round > 3) {
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

function render() {
  document.getElementById("ante-val").textContent = state.ante;
  document.getElementById("round-val").textContent = state.round;
  document.getElementById("score-val").textContent = `${state.roundScore} / ${state.target}`;
  document.getElementById("money-val").textContent = state.money;
  document.getElementById("hands-val").textContent = state.handsLeft;
  document.getElementById("discards-val").textContent = state.discardsLeft;

  const jokerRow = document.getElementById("joker-row");
  jokerRow.innerHTML = "";
  for (const j of state.jokers) {
    const div = document.createElement("div");
    div.className = "joker";
    div.innerHTML = `<span class="joker-name">${j.name}</span>${j.desc}`;
    jokerRow.appendChild(div);
  }

  const handRow = document.getElementById("hand-row");
  handRow.innerHTML = "";
  for (const card of state.hand) {
    const div = document.createElement("div");
    div.className = "card " + (RED_SUITS.has(card.suit) ? "red" : "black");
    if (state.selected.has(card.id)) div.classList.add("selected");
    div.innerHTML = `
      <span class="rank-top">${card.rank}${card.suit}</span>
      <span class="suit-mid">${card.suit}</span>
      <span class="rank-bottom">${card.rank}${card.suit}</span>
    `;
    div.addEventListener("click", () => toggleCard(card.id));
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
    previewName.textContent = " ";
    previewMath.textContent = "";
  }

  document.getElementById("play-btn").disabled = selected.length === 0 || state.phase !== "playing";
  document.getElementById("discard-btn").disabled = selected.length === 0 || state.discardsLeft <= 0 || state.phase !== "playing";

  renderOverlay();
}

function renderOverlay() {
  const overlay = document.getElementById("overlay");
  if (state.phase === "shop") {
    overlay.classList.remove("hidden");
    document.getElementById("overlay-title").textContent = "Round Cleared!";
    document.getElementById("overlay-sub").textContent = `Shop – Ante ${state.ante}, Round ${state.round}`;
    const shopItems = document.getElementById("shop-items");
    shopItems.innerHTML = "";
    for (const j of state.shopOffers) {
      const div = document.createElement("div");
      div.className = "shop-item";
      const canBuy = state.money >= j.price && state.jokers.length < JOKER_SLOTS;
      if (!canBuy) div.classList.add("unaffordable");
      div.innerHTML = `
        <span class="joker-name">${j.name}</span>
        <div>${j.desc}</div>
        <div class="price">$${j.price}</div>
        <button ${canBuy ? "" : "disabled"}>Buy</button>
      `;
      div.querySelector("button").addEventListener("click", () => buyJoker(j.id));
      shopItems.appendChild(div);
    }
    const btn = document.getElementById("overlay-btn");
    btn.textContent = "Next Round";
    btn.onclick = nextRound;
  } else if (state.phase === "gameover") {
    overlay.classList.remove("hidden");
    document.getElementById("overlay-title").textContent = "Game Over";
    document.getElementById("overlay-sub").textContent = `You reached Ante ${state.ante}, Round ${state.round}.`;
    document.getElementById("shop-items").innerHTML = "";
    const btn = document.getElementById("overlay-btn");
    btn.textContent = "Restart";
    btn.onclick = restart;
  } else {
    overlay.classList.add("hidden");
  }
}

// --- Init ---------------------------------------------------------------

document.getElementById("play-btn").addEventListener("click", playHand);
document.getElementById("discard-btn").addEventListener("click", discardSelected);

state = newState();
startRound();
render();
