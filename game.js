// --- Constants ---------------------------------------------------------

const SUITS = ["♠", "♥", "♦", "♣"];
const RED_SUITS = new Set(["♥", "♦"]);
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { J: 11, Q: 12, K: 13, A: 14 };
const FACE_RANKS = new Set(["J", "Q", "K"]);
const EVEN_RANKS = new Set(["2", "4", "6", "8", "10"]);
const ODD_RANKS = new Set(["A", "3", "5", "7", "9"]);
const FIBONACCI_RANKS = new Set(["A", "2", "3", "5", "8"]);
const RETRIGGER_RANKS = new Set(["2", "3", "4", "5"]);
const HAND_SIZE = 8;
const MAX_SELECTED = 5;
const START_HANDS = 4;
const START_DISCARDS = 3;
const START_MONEY = 4;
const JESTER_SLOTS = 5;
const TRICK_SLOTS = 2;
const TRICK_PRICE = 3;
const PACK_PRICE = 4;
const PACK_SIZE = 3;
const ROUNDS_PER_ANTE = 3;
const FINAL_ANTE = 8;
const REROLL_BASE_COST = 2;
const INTEREST_UNIT = 5;
const INTEREST_CAP = 5;

// Resale price of an owned jester: half its cost (min $1) plus whatever
// round-end jesters (Egg, Gift Card) have added to it since it was bought.
function sellValue(jester) {
  return Math.max(1, Math.floor(jester.price / 2)) + (jester.sellBonus || 0);
}

// Each hand has a level (1 by default). Every level above 1 adds levelChips
// and levelMult to the hand's base; trick cards are how a hand levels up.
const HAND_TYPES = [
  { name: "Straight Flush", chips: 100, mult: 8, levelChips: 40, levelMult: 4, trick: "Grand Finale", test: h => h.isFlush && h.isStraight },
  { name: "Four of a Kind", chips: 60, mult: 7, levelChips: 30, levelMult: 3, trick: "Four-Ring Circus", test: h => h.counts[0] === 4 },
  { name: "Full House", chips: 40, mult: 4, levelChips: 25, levelMult: 2, trick: "Big Top", test: h => h.counts[0] === 3 && h.counts[1] === 2 },
  { name: "Flush", chips: 35, mult: 4, levelChips: 15, levelMult: 2, trick: "Sleight of Hand", test: h => h.isFlush },
  { name: "Straight", chips: 30, mult: 4, levelChips: 30, levelMult: 3, trick: "Tightrope", test: h => h.isStraight },
  { name: "Three of a Kind", chips: 30, mult: 3, levelChips: 20, levelMult: 2, trick: "Triple Threat", test: h => h.counts[0] === 3 },
  { name: "Two Pair", chips: 20, mult: 2, levelChips: 20, levelMult: 1, trick: "Tag Team", test: h => h.counts[0] === 2 && h.counts[1] === 2 },
  { name: "Pair", chips: 10, mult: 2, levelChips: 15, levelMult: 1, trick: "Double Take", test: h => h.counts[0] === 2 },
  { name: "High Card", chips: 5, mult: 1, levelChips: 10, levelMult: 1, trick: "Pratfall", test: () => true },
];

// One trick card per hand type; using it raises that hand's level by one.
const TRICK_POOL = HAND_TYPES.map(t => ({
  id: "trick_" + t.name.toLowerCase().replace(/ /g, "_"),
  name: t.trick,
  hand: t.name,
  price: TRICK_PRICE,
  desc: `Level up ${t.name}: +${t.levelChips} chips, +${t.levelMult} mult.`,
}));

function handLevel(name) {
  return state?.handLevels?.[name] || 1;
}

// A hand's current base values, including any trick-card levels.
function handBase(type) {
  const extra = handLevel(type.name) - 1;
  return { chips: type.chips + extra * type.levelChips, mult: type.mult + extra * type.levelMult };
}

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
    apply: (ctx) => ({ chips: 30 * ctx.selected.filter(c => isFaceCard(c, ctx)).length }),
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
      for (const c of ctx.selected) if (isFaceCard(c, ctx) && Math.random() < 0.5) money += 2;
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
    apply: (ctx) => ({ multMul: ctx.selected.some(c => isFaceCard(c, ctx)) ? 2 : 1 }),
  },
  {
    id: "reserved_parking", name: "Reserved Parking", price: 6, rarity: "Common",
    desc: "Each face card held in hand has a 1 in 2 chance to give $1",
    apply: (ctx) => {
      let money = 0;
      for (const c of ctx.heldHand) if (isFaceCard(c, ctx) && Math.random() < 0.5) money += 1;
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
    apply: (ctx) => ({ multAdd: 5 * ctx.selected.filter(c => isFaceCard(c, ctx)).length }),
  },

  // --- Ported from Balatro, round 2: jesters that needed a small amount of --
  // --- new engine plumbing (round-start deltas, a discard hook, a round-end -
  // --- hook, a shop-debt floor, a free reroll flag, and a 4-card flush/ -----
  // --- straight rule) rather than just the existing per-hand scoring hook. -
  {
    id: "hack", name: "Hack", price: 6, rarity: "Uncommon",
    desc: "Played 2s, 3s, 4s, and 5s are scored again",
    apply: (ctx) => ({
      chips: ctx.selected.filter(c => RETRIGGER_RANKS.has(c.rank)).reduce((sum, c) => sum + cardChipValue(c), 0),
    }),
  },
  {
    id: "delayed_gratification", name: "Delayed Gratification", price: 4, rarity: "Common",
    desc: "Earn $2 per discard if no discards are used by round end",
    roundEnd: (ctx) => (ctx.discardsUsed === 0 ? { money: 2 * ctx.discardsLeft } : {}),
  },
  {
    id: "to_the_moon", name: "To the Moon", price: 5, rarity: "Uncommon",
    desc: "Earn an extra $1 of interest per $5 held (up to $5) at round end",
    roundEnd: (ctx) => ({ money: Math.min(INTEREST_CAP, Math.floor(ctx.money / INTEREST_UNIT)) }),
  },
  {
    id: "golden_jester", name: "Golden Jester", price: 6, rarity: "Common",
    desc: "Earn $4 at the end of the round",
    roundEnd: () => ({ money: 4 }),
  },
  {
    id: "egg", name: "Egg", price: 4, rarity: "Common",
    desc: "Gains $3 of sell value at the end of every round",
    roundEnd: (ctx, self) => { self.sellBonus = (self.sellBonus || 0) + 3; return {}; },
  },
  {
    id: "gros_michel", name: "Gros Michel", price: 5, rarity: "Common",
    desc: "+15 Mult, 1 in 6 chance to be destroyed at round end",
    apply: () => ({ multAdd: 15 }),
    roundEnd: () => (Math.random() < 1 / 6 ? { destroySelf: true } : {}),
  },
  {
    id: "cloud_9", name: "Cloud 9", price: 7, rarity: "Uncommon",
    desc: "Earn $1 at round end for each 9 in your deck",
    roundEnd: (ctx) => ({ money: ctx.deck.filter(c => c.rank === "9").length }),
  },
  {
    id: "rocket", name: "Rocket", price: 6, rarity: "Uncommon",
    desc: "Earn $1 at round end; the payout rises by $2 each time a boss round is cleared",
    roundEnd: (ctx, self) => {
      const money = self.rocketPayout || 1;
      if (ctx.isBoss) self.rocketPayout = money + 2;
      return { money };
    },
  },
  {
    id: "gift_card", name: "Gift Card", price: 6, rarity: "Uncommon",
    desc: "Adds $1 of sell value to every owned Jester at the end of every round",
    roundEnd: (ctx) => {
      for (const j of ctx.jesters) j.sellBonus = (j.sellBonus || 0) + 1;
      return {};
    },
  },
  {
    id: "cavendish", name: "Cavendish", price: 4, rarity: "Common",
    desc: "X3 Mult, 1 in 1000 chance to be destroyed at round end",
    apply: () => ({ multMul: 3 }),
    roundEnd: () => (Math.random() < 0.001 ? { destroySelf: true } : {}),
  },
  {
    id: "juggler", name: "Juggler", price: 4, rarity: "Common",
    desc: "+1 hand size",
    handSizeDelta: 1,
  },
  {
    id: "drunkard", name: "Drunkard", price: 4, rarity: "Common",
    desc: "+1 discard each round",
    discardsDelta: 1,
  },
  {
    id: "credit_card", name: "Credit Card", price: 1, rarity: "Common",
    desc: "Allows going up to -$20 in debt when buying or rerolling",
    debtLimit: 20,
  },
  {
    id: "chaos_the_clown", name: "Chaos the Clown", price: 4, rarity: "Common",
    desc: "1 free reroll per shop visit",
    freeReroll: true,
  },
  {
    id: "pareidolia", name: "Pareidolia", price: 5, rarity: "Uncommon",
    desc: "All cards are considered face cards",
  },
  {
    id: "faceless_jester", name: "Faceless Jester", price: 4, rarity: "Common",
    desc: "Earn $5 if 3 or more face cards are discarded at the same time",
  },
  {
    id: "four_fingers", name: "Four Fingers", price: 7, rarity: "Uncommon",
    desc: "Flushes and Straights can be made with 4 cards",
  },

  // --- Phase 2: jester-to-jester synergy/anti-synergy — effects that read --
  // --- (Brainstorm, Blueprint, Swashbuckler, Ringmaster) or accumulate from (Campfire) the rest of -
  // --- the owned roster, rather than just the played hand or game state. ---
  // --- Campfire's sell-for-scaling payoff directly tugs against Brainstorm/-
  // --- Swashbuckler/Jester Stencil/Abstract Jester, which all want a full, --
  // --- stable board — selling for Campfire starves those.
  {
    id: "brainstorm", name: "Brainstorm", price: 10, rarity: "Rare",
    desc: "Emulates the scoring ability of the leftmost Jester",
    apply: (ctx) => {
      const target = ctx.jesters[0];
      if (!target || target.id === "brainstorm" || !target.apply) return {};
      return target.apply(ctx, target);
    },
  },
  {
    id: "swashbuckler", name: "Swashbuckler", price: 6, rarity: "Uncommon",
    desc: "+Mult equal to the sell value of all other owned Jesters",
    apply: (ctx) => {
      let multAdd = 0;
      for (const j of ctx.jesters) {
        if (j.id === "swashbuckler") continue;
        multAdd += sellValue(j);
      }
      return { multAdd };
    },
  },
  {
    id: "campfire", name: "Campfire", price: 9, rarity: "Rare",
    desc: "X0.25 Mult per Jester sold this run; resets when a boss round is cleared",
    apply: (ctx) => ({ multMul: 1 + 0.25 * ctx.jestersSold }),
  },
  {
    id: "blueprint", name: "Blueprint", price: 10, rarity: "Rare",
    desc: "Emulates the scoring ability of the Jester to its right",
    apply: (ctx) => {
      const target = ctx.jesters[ctx.jesters.findIndex(j => j.id === "blueprint") + 1];
      if (!target || target.id === "blueprint" || target.id === "brainstorm" || !target.apply) return {};
      return target.apply(ctx, target);
    },
  },
  {
    id: "constellation", name: "Constellation", price: 6, rarity: "Uncommon",
    desc: "Gains X0.1 Mult every time a Trick card is used",
    apply: (ctx, self) => ({ multMul: 1 + 0.1 * (self.tricksUsed || 0) }),
    onTrickUsed: (self) => { self.tricksUsed = (self.tricksUsed || 0) + 1; },
  },
  {
    id: "space_jester", name: "Space Jester", price: 5, rarity: "Common",
    desc: "1 in 4 chance to level up the played poker hand",
    onPlay: () => (Math.random() < 1 / 4 ? { levelUp: true } : {}),
  },
  {
    id: "ringmaster", name: "Ringmaster", price: 5, rarity: "Uncommon",
    desc: "+4 Mult per different rarity among owned Jesters",
    apply: (ctx) => ({ multAdd: 4 * new Set(ctx.jesters.map(j => j.rarity)).size }),
  },
];

// Boss rounds: the last round of every ante (round === ROUNDS_PER_ANTE) picks
// one of these at random and applies it for that round only, forcing a
// different line of play instead of just a bigger number to hit.
const BOSS_MODIFIERS = [
  {
    id: "wall", name: "The Wall",
    desc: "Round target is 50% higher",
    targetMult: 1.5,
  },
  {
    id: "needle", name: "The Needle",
    desc: "Only 1 hand allowed this round",
    handsOverride: 1,
  },
  {
    id: "water", name: "The Water",
    desc: "No discards this round",
    discardsOverride: 0,
  },
  {
    id: "manacle", name: "The Manacle",
    desc: "Hand size reduced by 1 card",
    handSizeDelta: -1,
  },
  {
    id: "club", name: "The Club",
    desc: "Played ♣ cards score no chip value",
    suitDebuff: "♣",
  },
  {
    id: "heart", name: "The Heart",
    desc: "Played ♥ cards score no chip value",
    suitDebuff: "♥",
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
    played: [],
    discarded: [],
    selected: new Set(),
    jesters: [],
    tricks: [],
    handLevels: {},
    shopOffers: [],
    shopTricks: [],
    packAvailable: false,
    pack: null,
    rerollCost: REROLL_BASE_COST,
    sortMode: "rank", // rank | suit
    phase: "playing", // playing | shop | gameover | win
    dealtIds: new Map(),
    lastEarnings: null,
    bossModifier: null,
    handSize: HAND_SIZE,
    discardsUsed: 0,
    freeRerollUsed: false,
    jestersSold: 0,
    debugShop: false,
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
  state.played = [];
  state.discarded = [];
  state.selected = new Set();
  state.roundScore = 0;
  state.bossModifier = state.round === ROUNDS_PER_ANTE
    ? BOSS_MODIFIERS[Math.floor(Math.random() * BOSS_MODIFIERS.length)]
    : null;
  const jesterHandSizeDelta = state.jesters.reduce((sum, j) => sum + (j.handSizeDelta || 0), 0);
  const jesterDiscardsDelta = state.jesters.reduce((sum, j) => sum + (j.discardsDelta || 0), 0);
  state.handSize = HAND_SIZE + (state.bossModifier?.handSizeDelta || 0) + jesterHandSizeDelta;
  state.handsLeft = state.bossModifier?.handsOverride ?? START_HANDS;
  state.discardsLeft = (state.bossModifier?.discardsOverride ?? START_DISCARDS) + jesterDiscardsDelta;
  state.target = targetForRound(state.ante, state.round);
  if (state.bossModifier?.targetMult) {
    state.target = Math.round(state.target * state.bossModifier.targetMult / 10) * 10;
  }
  state.phase = "playing";
  state.dealtIds = new Map();
  state.discardsUsed = 0;

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

// --- Hand evaluation -------------------------------------------------------

function rankNum(rank) {
  return RANK_VALUE[rank] || parseInt(rank, 10);
}

// Called with 1-5 selected cards. Flush/straight normally require exactly 5
// (checked below); count-based hands (pair..four of a kind) fall out of
// rankCounts naturally at any size, which is correct (e.g. 4 selected cards
// of the same rank is a real four of a kind). Owning Four Fingers drops the
// flush/straight requirement to 4 cards — any 4 (of the up to 5 selected)
// that qualify are enough, so a 5-card selection checks every 4-card window.
function evaluateHand(cards) {
  const rankCounts = {};
  for (const c of cards) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  const fourFingers = state?.jesters?.some(j => j.id === "four_fingers");
  const runSize = fourFingers ? 4 : 5;

  let isFlush = false;
  if (cards.length >= runSize) {
    const bySuit = {};
    for (const c of cards) bySuit[c.suit] = (bySuit[c.suit] || 0) + 1;
    isFlush = Object.values(bySuit).some(n => n >= runSize);
  }

  let isStraight = false;
  if (cards.length >= runSize) {
    const nums = [...new Set(cards.map(c => rankNum(c.rank)))].sort((a, b) => a - b);
    const withWheel = nums.includes(14) ? [1, ...nums] : nums; // Ace can also count low
    for (let i = 0; i + runSize - 1 < withWheel.length; i++) {
      if (withWheel[i + runSize - 1] - withWheel[i] === runSize - 1) { isStraight = true; break; }
    }
  }

  const h = { counts, isFlush, isStraight };
  const type = HAND_TYPES.find(t => t.test(h));
  const base = handBase(type);
  return { name: type.name, baseChips: base.chips, baseMult: base.mult, isStraight, isFlush, counts };
}

function cardChipValue(card) {
  if (state?.bossModifier?.suitDebuff === card.suit) return 0;
  if (card.rank === "A") return 11;
  if (RANK_VALUE[card.rank]) return 10;
  return parseInt(card.rank, 10);
}

// Pareidolia makes every card count as a face card for jesters that key off
// FACE_RANKS; ctx.pareidolia is computed once per scoreSelection call.
function isFaceCard(card, ctx) {
  return FACE_RANKS.has(card.rank) || Boolean(ctx?.pareidolia);
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
    pareidolia: state.jesters.some(j => j.id === "pareidolia"),
    jestersSold: state.jestersSold,
  };

  for (const j of state.jesters) {
    const effect = j.apply ? j.apply(ctx, j) : {};
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

  // Level-up hooks fire before scoring, so the hand scores at its new level.
  const played = evaluateHand(selected).name;
  for (const j of state.jesters) {
    if (j.onPlay && j.onPlay().levelUp) levelUpHand(played);
  }

  const result = scoreSelection(selected);
  state.roundScore += result.total;
  state.money += result.money;
  state.handsLeft -= 1;
  Sound.playHandResolve(result.total);

  state.played.push(...selected);
  state.hand = state.hand.filter(c => !state.selected.has(c.id));
  state.selected = new Set();
  const drawn = draw(state.handSize - state.hand.length);
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
  state.discardsUsed += 1;
  Sound.discard(selected.length);
  const faceCount = selected.filter(c => isFaceCard(c, { pareidolia: state.jesters.some(j => j.id === "pareidolia") })).length;
  if (faceCount >= 3 && state.jesters.some(j => j.id === "faceless_jester")) {
    state.money += 5;
  }
  state.discarded.push(...selected);
  state.hand = state.hand.filter(c => !state.selected.has(c.id));
  state.selected = new Set();
  const drawn = draw(state.handSize - state.hand.length);
  state.hand.push(...drawn);
  state.dealtIds = new Map(drawn.map((c, i) => [c.id, i]));
  if (drawn.length) Sound.dealHand(drawn.length);
  render();
}

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
    Sound.gameWin();
    return;
  }

  Sound.roundWin();
  state.phase = "shop";
  state.rerollCost = REROLL_BASE_COST;
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
}

function debtFloor() {
  return -Math.max(0, ...state.jesters.map(j => j.debtLimit || 0));
}

function buyJester(id) {
  if (state.jesters.length >= JESTER_SLOTS) return;
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

// Debug tools are enabled by adding ?debug to the page URL.
const DEBUG_ENABLED = typeof location !== "undefined"
  && new URLSearchParams(location.search).has("debug");

// Debug shop: open the shop at any time during play, with a money cheat.
function rollShopOffers() {
  const owned = new Set(state.jesters.map(j => j.id));
  const pool = JESTER_POOL.filter(j => !owned.has(j.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.shopOffers = pool.slice(0, 3);
}

// Two random trick cards for sale (duplicates of owned ones are fine).
function rollTrickOffers() {
  const pool = [...TRICK_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.shopTricks = pool.slice(0, 2);
}

function inShop() {
  return state.phase === "shop" || (state.phase === "playing" && state.debugShop);
}

function setDebugShop(open) {
  if (!DEBUG_ENABLED) return;
  if (state.phase !== "playing") return;
  state.debugShop = open;
  if (open && state.shopOffers.length === 0) {
    rollShopOffers();
    rollTrickOffers();
    state.packAvailable = true;
  }
  render();
}

function addDebugMoney(amount = 1000) {
  if (!DEBUG_ENABLED) return;
  state.money += amount;
  Sound.coinSell();
  render();
}

function sellJester(id) {
  if (!inShop()) return;
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

function canAct() {
  return inShop() || state.phase === "playing";
}

function buyTrick(id) {
  if (!inShop() || state.tricks.length >= TRICK_SLOTS) return;
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

function useTrick(index) {
  if (!canAct() || state.pack) return;
  const [trick] = state.tricks.splice(index, 1);
  if (!trick) return;
  trickUsed(trick);
  Sound.coinBuy();
  render();
}

function sellTrick(index) {
  if (!inShop()) return;
  const [trick] = state.tricks.splice(index, 1);
  if (!trick) return;
  state.money += trickSellValue(trick);
  Sound.coinSell();
  render();
}

// A trick pack offers PACK_SIZE distinct tricks; you pick one and it's used
// immediately (no slot needed), or skip the rest.
function buyPack() {
  if (!inShop() || !state.packAvailable || state.pack) return;
  if (state.money - PACK_PRICE < debtFloor()) return;
  state.money -= PACK_PRICE;
  state.packAvailable = false;
  const pool = [...TRICK_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  state.pack = pool.slice(0, PACK_SIZE);
  Sound.coinBuy();
  render();
}

function pickFromPack(id) {
  if (!state.pack) return;
  const trick = state.pack.find(t => t.id === id);
  if (!trick) return;
  trickUsed(trick);
  state.pack = null;
  render();
}

function skipPack() {
  state.pack = null;
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

// Debug only (?debug): begin each run with one random Common jester.
function grantStartingJester() {
  if (!DEBUG_ENABLED) return;
  const commons = JESTER_POOL.filter(j => j.rarity === "Common");
  const pick = commons[Math.floor(Math.random() * commons.length)];
  state.jesters.push({ ...pick, sellBonus: 0 });
}

function restart() {
  state = newState();
  grantStartingJester();
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
function makeInspectable(el, bodyHTML) {
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.dataset.inspectable = "1";
  el.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    toggleInspect(el, bodyHTML());
  });
  el.addEventListener("keydown", (e) => {
    if (e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    toggleInspect(el, bodyHTML());
  });
}

let inspectAnchor = null;

function hideInspect() {
  inspectAnchor = null;
  document.getElementById("inspect").classList.add("hidden");
}

function toggleInspect(anchor, html) {
  const tip = document.getElementById("inspect");
  if (inspectAnchor && inspectAnchor.isConnected && inspectAnchor === anchor) {
    hideInspect();
    return;
  }
  inspectAnchor = anchor;
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(6, Math.min(rect.left + rect.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 6));
  tip.style.left = `${left}px`;
  tip.style.top = `${rect.bottom + 6}px`;
}

function trickCardHTML(t) {
  return `<span class="trick-glyph">✦</span><span class="trick-name">${t.name}</span><span class="trick-hand">${t.hand}</span><span class="trick-desc">${t.desc}</span>`;
}

// Held trick cards, with a Use button (and Sell in the shop) on each.
function fillTrickList(container, withSell) {
  container.innerHTML = "";
  state.tricks.forEach((t, i) => {
    const div = document.createElement("div");
    div.className = "trick";
    div.innerHTML = trickCardHTML(t);
    makeInspectable(div, () => `<div class="trick">${trickCardHTML(t)}</div>`);
    const useBtn = document.createElement("button");
    useBtn.className = "use-btn";
    useBtn.textContent = "Use";
    useBtn.disabled = Boolean(state.pack);
    useBtn.addEventListener("click", () => useTrick(i));
    div.appendChild(useBtn);
    if (withSell) {
      const sellBtn = document.createElement("button");
      sellBtn.className = "sell-btn";
      sellBtn.textContent = `Sell $${trickSellValue(t)}`;
      sellBtn.addEventListener("click", () => sellTrick(i));
      div.appendChild(sellBtn);
    }
    container.appendChild(div);
  });
}

function renderHandReference() {
  const items = document.querySelectorAll("#hand-reference-list li");
  HAND_TYPES.forEach((t, i) => {
    const b = handBase(t);
    const lvl = handLevel(t.name);
    items[i].textContent = `${t.name}${lvl > 1 ? ` (Lv ${lvl})` : ""} — ${b.chips} chips × ${b.mult} mult`;
  });
}

function render() {
  if (typeof document === "undefined") return;
  document.getElementById("ante-val").textContent = state.ante;
  document.getElementById("round-val").textContent = state.round;
  document.getElementById("score-val").textContent = `${state.roundScore} / ${state.target}`;
  document.getElementById("money-val").textContent = state.money;
  document.getElementById("hands-val").textContent = state.handsLeft;
  document.getElementById("discards-val").textContent = state.discardsLeft;

  const bossBanner = document.getElementById("boss-banner");
  if (state.bossModifier) {
    bossBanner.classList.remove("hidden");
    document.getElementById("boss-name").textContent = state.bossModifier.name;
    document.getElementById("boss-desc").textContent = state.bossModifier.desc;
  } else {
    bossBanner.classList.add("hidden");
  }

  const jesterRow = document.getElementById("jester-row");
  const jesterSig = state.jesters.map(j => j.id).join(",");
  if (jesterSig !== lastJesterSig) {
    lastJesterSig = jesterSig;
    jesterRow.innerHTML = "";
    for (const j of state.jesters) {
      const div = document.createElement("div");
      div.className = "jester";
      div.innerHTML = `${jesterHeaderHTML(j)}<span class="jester-desc">${j.desc}</span>`;
      makeInspectable(div, () => `<div class="jester">${jesterHeaderHTML(j)}<span class="jester-desc">${j.desc}</span></div>`);
      jesterRow.appendChild(div);
    }
  }

  const trickRow = document.getElementById("trick-row");
  trickRow.classList.toggle("hidden", state.tricks.length === 0);
  document.getElementById("trick-group").classList.toggle("hidden", state.tricks.length === 0);
  fillTrickList(trickRow, false);
  document.getElementById("jester-count").textContent = `${state.jesters.length}/${JESTER_SLOTS}`;
  document.getElementById("trick-count").textContent = `${state.tricks.length}/${TRICK_SLOTS}`;
  renderHandReference();

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
  if (selected.length > 0) {
    const result = scoreSelection(selected);
    previewName.textContent = result.hand.name;
  } else {
    previewName.textContent = " ";
  }

  document.getElementById("play-btn").disabled = selected.length === 0 || state.phase !== "playing";
  document.getElementById("discard-btn").disabled = selected.length === 0 || state.discardsLeft <= 0 || state.phase !== "playing";

  renderDeckView();
  renderOverlay();
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
  const counts = { deck: 0, hand: 0, played: 0, discarded: 0 };
  for (const v of status.values()) counts[v] += 1;
  document.getElementById("deck-legend").innerHTML = ["deck", "hand", "played", "discarded"]
    .map(k => `<span class="legend-item ${k}">${k === "deck" ? "In deck" : k[0].toUpperCase() + k.slice(1)}: ${counts[k]}</span>`)
    .join("");

  const grid = document.getElementById("deck-grid");
  grid.innerHTML = "";
  for (const suit of SUITS) {
    for (const rank of [...RANKS].reverse()) {
      const st = status.get(`${rank}${suit}`) || "deck";
      const div = document.createElement("div");
      div.className = `mini-card ${RED_SUITS.has(suit) ? "red" : "black"} ${st}`;
      div.textContent = `${rank}${suit}`;
      div.title = `${rank} of ${suit}: ${st === "deck" ? "still in deck" : st}`;
      grid.appendChild(div);
    }
  }
}

function setDeckViewOpen(open) {
  document.getElementById("deck-modal").classList.toggle("hidden", !open);
  renderDeckView();
}

function renderOverlay() {
  const overlay = document.getElementById("overlay");
  const rerollBtn = document.getElementById("reroll-btn");
  const ownedSection = document.getElementById("owned-jesters-section");
  const moneyBtn = document.getElementById("money-btn");
  const debug = state.phase === "playing" && state.debugShop;
  moneyBtn.classList.toggle("hidden", !debug);
  if (state.phase === "shop" || debug) {
    overlay.classList.remove("hidden");
    document.getElementById("overlay-title").textContent = debug ? "Debug Shop" : "Round Cleared!";
    const earnings = state.lastEarnings;
    const earningsText = earnings
      ? ` — +$${earnings.reward} round${earnings.interest ? `, +$${earnings.interest} interest` : ""}${earnings.bonus ? `, +$${earnings.bonus} jesters` : ""}`
      : "";
    document.getElementById("overlay-sub").textContent = debug
      ? `Buy and sell freely – $${state.money}`
      : `Shop – Ante ${state.ante}, Round ${state.round}${earningsText}`;
    const shopItems = document.getElementById("shop-items");
    shopItems.innerHTML = "";
    for (const j of state.shopOffers) {
      const div = document.createElement("div");
      div.className = "shop-item";
      const canBuy = state.money - j.price >= debtFloor() && state.jesters.length < JESTER_SLOTS;
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

    const shopTricks = document.getElementById("shop-tricks");
    shopTricks.innerHTML = "";
    const trickOffers = state.shopTricks.map(t => ({ t, pack: false }));
    if (state.packAvailable) trickOffers.push({ pack: true });
    for (const { t, pack } of trickOffers) {
      const price = pack ? PACK_PRICE : t.price;
      const canBuy = state.money - price >= debtFloor() && (pack ? !state.pack : state.tricks.length < TRICK_SLOTS);
      const div = document.createElement("div");
      div.className = "shop-item trick" + (canBuy ? "" : " unaffordable");
      div.innerHTML = `${pack
        ? `<span class="trick-glyph">✦✦✦</span><span class="trick-name">Trick Pack</span><span class="trick-desc">Pick 1 of ${PACK_SIZE} tricks, used right away.</span>`
        : trickCardHTML(t)}<div class="price">$${price}</div><button ${canBuy ? "" : "disabled"}>Buy</button>`;
      div.querySelector("button").addEventListener("click", () => (pack ? buyPack() : buyTrick(t.id)));
      shopTricks.appendChild(div);
    }

    const packSection = document.getElementById("pack-section");
    packSection.classList.toggle("hidden", !state.pack);
    const packItems = document.getElementById("pack-items");
    packItems.innerHTML = "";
    for (const t of state.pack || []) {
      const div = document.createElement("div");
      div.className = "shop-item trick";
      div.innerHTML = `${trickCardHTML(t)}<button>Take</button>`;
      div.querySelector("button").addEventListener("click", () => pickFromPack(t.id));
      packItems.appendChild(div);
    }

    const ownedTricksSection = document.getElementById("owned-tricks-section");
    ownedTricksSection.classList.toggle("hidden", state.tricks.length === 0);
    fillTrickList(document.getElementById("owned-tricks"), true);

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
        sellBtn.textContent = `Sell $${sellValue(j)}`;
        sellBtn.addEventListener("click", () => sellJester(j.id));
        div.appendChild(sellBtn);
        ownedList.appendChild(div);
      }
    } else {
      ownedSection.classList.add("hidden");
    }

    const freeReroll = !state.freeRerollUsed && state.jesters.some(j => j.id === "chaos_the_clown");
    rerollBtn.classList.remove("hidden");
    rerollBtn.textContent = freeReroll ? "Reroll (Free)" : `Reroll ($${state.rerollCost})`;
    rerollBtn.disabled = state.money - (freeReroll ? 0 : state.rerollCost) < debtFloor();
    rerollBtn.onclick = rerollShop;
    const btn = document.getElementById("overlay-btn");
    btn.textContent = debug ? "Close" : "Next Round";
    btn.onclick = debug ? () => setDebugShop(false) : nextRound;
  } else if (state.phase === "win") {
    overlay.classList.remove("hidden");
    document.getElementById("overlay-title").textContent = "You Win!";
    document.getElementById("overlay-sub").textContent = `Cleared Ante ${FINAL_ANTE} with ${state.jesters.length} jester(s) held.`;
    document.getElementById("shop-items").innerHTML = "";
    document.getElementById("shop-tricks").innerHTML = "";
    document.getElementById("pack-section").classList.add("hidden");
    document.getElementById("owned-tricks-section").classList.add("hidden");
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
    document.getElementById("shop-tricks").innerHTML = "";
    document.getElementById("pack-section").classList.add("hidden");
    document.getElementById("owned-tricks-section").classList.add("hidden");
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
  document.getElementById("shop-btn").classList.toggle("hidden", !DEBUG_ENABLED);
  document.getElementById("shop-btn").addEventListener("click", () => setDebugShop(true));
  document.getElementById("money-btn").addEventListener("click", () => addDebugMoney());
  document.getElementById("sort-rank-btn").addEventListener("click", () => setSortMode("rank"));
  document.getElementById("sort-suit-btn").addEventListener("click", () => setSortMode("suit"));

  const deckModal = document.getElementById("deck-modal");
  document.getElementById("deck-btn").addEventListener("click", () => setDeckViewOpen(true));
  document.getElementById("deck-close-btn").addEventListener("click", () => setDeckViewOpen(false));
  deckModal.addEventListener("click", (e) => { if (e.target === deckModal) setDeckViewOpen(false); });
  const deckPile = document.getElementById("deck-pile");
  deckPile.addEventListener("click", () => setDeckViewOpen(true));
  deckPile.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    setDeckViewOpen(true);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-inspectable]")) hideInspect();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!deckModal.classList.contains("hidden")) setDeckViewOpen(false);
    hideInspect();
  });

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
  for (let i = 0; i < HAND_TYPES.length; i++) {
    handReferenceList.appendChild(document.createElement("li"));
  }
  document.getElementById("pack-skip-btn").addEventListener("click", skipPack);

  // On a landscape phone the hand-rankings panel moves into the left column
  // (under the HUD) to save vertical space.
  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(orientation: landscape) and (max-height: 500px)");
    const sideTools = document.getElementById("side-tools");
    const handRef = document.getElementById("hand-reference");
    const controls = document.getElementById("controls");
    const placeTools = () => {
      if (mq.matches) sideTools.append(handRef);
      else controls.after(handRef);
    };
    placeTools();
    mq.addEventListener("change", placeTools);
  }

  state = newState();
  grantStartingJester();
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
  TRICK_POOL,
  JESTER_POOL,
  BOSS_MODIFIERS,
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
  buyTrick,
  useTrick,
  sellTrick,
  buyPack,
  pickFromPack,
  skipPack,
  setDebugShop,
  addDebugMoney,
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
