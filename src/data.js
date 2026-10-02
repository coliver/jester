// --- Constants ---------------------------------------------------------

const SUITS = ["♠", "♥", "♦", "♣"];
const RED_SUITS = new Set(["♥", "♦"]);
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUE = { J: 11, Q: 12, K: 13, A: 14 };
const FACE_RANKS = new Set(["J", "Q", "K"]);
// Must match the hand-bob animation duration in styles.css.
const BOB_PERIOD_MS = 5000;
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
const DECREE_PRICE = 3;
const PACK_PRICE = 4;
const PACK_SIZE = 3;
const ROUNDS_PER_VENUE = 3;
const FINAL_VENUE = 8;
const REROLL_BASE_COST = 2;
const INTEREST_UNIT = 5;
const INTEREST_CAP = 5;
// Interest on held money; debt earns none.
const interestOn = money => Math.max(0, Math.min(INTEREST_CAP, Math.floor(money / INTEREST_UNIT)));
const PROP_PRICE = 8;
const BONUS_CHIPS = 30;
const MULT_BONUS = 4;
const GLASS_MULT = 2;
const GLASS_BREAK_CHANCE = 0.25;

// Debug tools are enabled by adding ?debug to the page URL.
const DEBUG_ENABLED = typeof location !== "undefined"
  && new URLSearchParams(location.search).has("debug");

// Permanent upgrades, one offered per venue (in the shop after its first
// round) and bought once per run. Each sets numeric deltas read by the
// helpers below.
const PROP_POOL = [
  { id: "extra_hand", name: "Extra Hand", desc: "+1 hand each act.", handsDelta: 1 },
  { id: "extra_discard", name: "Extra Discard", desc: "+1 discard each act.", discardsDelta: 1 },
  { id: "big_hand", name: "Big Hand", desc: "+1 hand size.", handSizeDelta: 1 },
  { id: "haggler", name: "Haggler", desc: "Shop rerolls start $1 cheaper.", rerollDelta: -1 },
  { id: "wide_stage", name: "Wide Stage", desc: "+1 jester slot.", jesterSlotsDelta: 1 },
  { id: "trick_tray", name: "Mask Rack", desc: "+1 mask slot.", trickSlotsDelta: 1 },
];

function propSum(key) {
  return (state.props || []).reduce((sum, v) => sum + (v[key] || 0), 0);
}
function jesterSlots() { return JESTER_SLOTS + propSum("jesterSlotsDelta"); }
function trickSlots() { return TRICK_SLOTS + propSum("trickSlotsDelta"); }
function rerollBaseCost() { return Math.max(1, REROLL_BASE_COST + propSum("rerollDelta")); }

// Resale price of an owned jester: half its cost (min $1) plus whatever
// round-end jesters (Egg, Gift Card) have added to it since it was bought.
function sellValue(jester) {
  return Math.max(1, Math.floor(jester.price / 2)) + (jester.sellBonus || 0);
}

// Each hand has a level (1 by default). Every level above 1 adds levelChips
// and levelMult to the hand's base; mask cards are how a hand levels up.
const HAND_TYPES = [
  { name: "Straight Flush", chips: 100, mult: 8, levelChips: 40, levelMult: 4, mask: "Harlequin", test: h => h.isStraightFlush },
  { name: "Four of a Kind", chips: 60, mult: 7, levelChips: 30, levelMult: 3, mask: "Il Capitano", test: h => h.counts[0] >= 4 },
  { name: "Full House", chips: 40, mult: 4, levelChips: 25, levelMult: 2, mask: "Pantalone", test: h => h.counts[0] === 3 && h.counts[1] === 2 },
  { name: "Flush", chips: 35, mult: 4, levelChips: 15, levelMult: 2, mask: "Pierrot", test: h => h.isFlush },
  { name: "Straight", chips: 30, mult: 4, levelChips: 30, levelMult: 3, mask: "Scaramouche", test: h => h.isStraight },
  { name: "Three of a Kind", chips: 30, mult: 3, levelChips: 20, levelMult: 2, mask: "Brighella", test: h => h.counts[0] === 3 },
  { name: "Two Pair", chips: 20, mult: 2, levelChips: 20, levelMult: 1, mask: "Zanni", test: h => h.counts[0] === 2 && h.counts[1] === 2 },
  { name: "Pair", chips: 10, mult: 2, levelChips: 15, levelMult: 1, mask: "Innamorati", test: h => h.counts[0] === 2 },
  { name: "High Card", chips: 5, mult: 1, levelChips: 10, levelMult: 1, mask: "Pulcinella", test: () => true },
];

// One mask card per hand type (a commedia stock character); using it raises
// that hand's level by one.
const TRICK_POOL = HAND_TYPES.map(t => ({
  id: "mask_" + t.mask.toLowerCase().replace(/ /g, "_"),
  name: t.mask,
  hand: t.name,
  price: TRICK_PRICE,
  desc: `Level up ${t.name}: +${t.levelChips} chips, +${t.levelMult} mult.`,
}));

function handLevel(name) {
  return state?.handLevels?.[name] || 1;
}

// A hand's current base values, including any mask-card levels.
function handBase(type) {
  const extra = handLevel(type.name) - 1;
  return { chips: type.chips + extra * type.levelChips, mult: type.mult + extra * type.levelMult };
}

// Decree cards edit the run's deck. Each acts on 1..max of the cards selected
// in hand during a round, and the change is permanent (it is written to the
// run's master deck as well as the copy in hand). They share trick slots.
// An enhancement sets card.enh; Wild counts as every suit, Bonus adds chips,
// Mult adds mult, Glass doubles the score but may shatter after it's played.
const ENHANCEMENTS = {
  bonus: { label: "+30", name: "Bonus" },
  mult: { label: "+4", name: "Mult" },
  wild: { label: "W", name: "Wild" },
  glass: { label: "×2", name: "Glass" },
};

function enhancer(id, name, enh, max, desc) {
  return { id, name, max, desc, apply: card => { card.enh = enh; } };
}
function suitChanger(id, name, suit, suitName) {
  return { id, name, max: 3, desc: `Turn up to 3 selected cards into ${suitName}.`, apply: card => { card.suit = suit; } };
}

const DECREE_POOL = [
  enhancer("decree_archbishop", "The Archbishop", "bonus", 2, `Make up to 2 selected cards Bonus Cards: +${BONUS_CHIPS} chips when played.`),
  enhancer("decree_queen", "The Queen", "mult", 2, `Make up to 2 selected cards Mult Cards: +${MULT_BONUS} mult when played.`),
  enhancer("decree_marriage", "The Marriage", "wild", 1, "Make 1 selected card a Wild Card: counts as every suit."),
  enhancer("decree_magistrate", "The Magistrate", "glass", 1, `Make 1 selected card a Glass Card: X${GLASS_MULT} mult when played, ${GLASS_BREAK_CHANCE * 100}% chance to shatter after.`),
  suitChanger("decree_oath_diamonds", "Oath of Diamonds", "♦", "Diamonds"),
  suitChanger("decree_oath_clubs", "Oath of Clubs", "♣", "Clubs"),
  suitChanger("decree_oath_hearts", "Oath of Hearts", "♥", "Hearts"),
  suitChanger("decree_oath_spades", "Oath of Spades", "♠", "Spades"),
  {
    id: "decree_knighthood", name: "Knighthood", max: 2, desc: "Raise the rank of up to 2 selected cards by 1 (Ace wraps to 2).",
    apply: card => { card.rank = RANKS[(RANKS.indexOf(card.rank) + 1) % RANKS.length]; }
  },
  { id: "decree_headsman", name: "The Headsman", max: 2, desc: "Destroy up to 2 selected cards, thinning your deck.", destroy: true },
].map(t => ({ ...t, decree: true, price: DECREE_PRICE }));

// A wild card counts as every suit.
function cardIsSuit(card, suit) {
  return card.suit === suit || card.enh === "wild";
}
