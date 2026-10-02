// --- Court -------------------------------------------------------------
// Boss modifiers, venues and audiences, and the king's mood.

// Boss rounds: the last round of every venue (round === ROUNDS_PER_VENUE) picks
// one of these at random and applies it for that round only, forcing a
// different line of play instead of just a bigger number to hit.
const BOSS_MODIFIERS = [
  {
    id: "wall", name: "The Seneschal",
    desc: "Act target is 50% higher",
    quip: "The steward has counted the candles, and finds you wanting.",
    targetMult: 1.5,
  },
  {
    id: "needle", name: "The Executioner",
    desc: "Only 1 hand allowed this act",
    quip: "One swing is all he permits.",
    handsOverride: 1,
  },
  {
    id: "water", name: "The Censor",
    desc: "No discards this act",
    quip: "What is said at court cannot be unsaid.",
    discardsOverride: 0,
  },
  {
    id: "manacle", name: "The Gaoler",
    desc: "Hand size reduced by 1 card",
    quip: "Iron is heavy on a fool's wrists.",
    handSizeDelta: -1,
  },
  {
    id: "club", name: "The Marshal",
    desc: "Played ♣ cards score no chip value",
    quip: "His men have confiscated your clubs.",
    suitDebuff: "♣",
  },
  {
    id: "heart", name: "The Queen of Hearts",
    desc: "Played ♥ cards score no chip value",
    quip: "She has no use for hearts, yours least of all.",
    suitDebuff: "♥",
  },
  {
    id: "tax", name: "The Tax Collector",
    desc: "Lose $1 for each hand you play",
    quip: "The crown takes its share of every performance.",
    handTax: 1,
  },
  {
    id: "laureate", name: "The Poet Laureate",
    desc: "No hand type may be played twice",
    quip: "Repeat yourself and he will have you exiled.",
    noRepeatHands: true,
  },
  {
    id: "bishop", name: "The Bishop",
    desc: "Played face cards score no chip value",
    quip: "He condemns the vanity of kings.",
    faceDebuff: true,
  },
  {
    id: "spymaster", name: "The Spymaster",
    desc: "Your leftmost jester is silenced",
    quip: "Someone you trusted has been whispering.",
    silenceLeftmost: true,
  },
];

// The last round of the last venue is always the King, never a random draw.
const KING_BOSS = {
  id: "king", name: "The King",
  desc: "Target 25% higher and only 3 hands",
  quip: "Amuse me, fool, or lose your head.",
  targetMult: 1.25,
  handsOverride: 3,
};
const BOSS_POOL = [...BOSS_MODIFIERS, KING_BOSS];

// Court dressing: each venue number maps to a named room and each round to an audience.
const VENUES = [
  "The Scullery", "The Stables", "The Great Kitchen", "The Banquet Hall",
  "The Gilded Salon", "The Queen's Solar", "The War Council", "The Throne Room",
];
const AUDIENCES = ["Small Audience", "Grand Audience", "Royal Command"];
function venueName(venue) { return VENUES[Math.min(venue, VENUES.length) - 1]; }
function audienceName(round) { return AUDIENCES[round - 1] || AUDIENCES[AUDIENCES.length - 1]; }

// The king's mood tracks how the round is going: score progress toward the
// target, with a scowl once the hands are nearly gone and the target is far.
const MOODS = {
  bored: { label: "Bored", img: "king_bored" },
  amused: { label: "Amused", img: "king_amused" },
  delighted: { label: "Delighted", img: "king_amused" },
  displeased: { label: "Displeased", img: "king_displeased" },
};
function courtMood(roundScore, target, handsLeft) {
  const progress = target > 0 ? roundScore / target : 0;
  if (progress >= 1) return "delighted";
  if (handsLeft <= 1 && progress < 0.6) return "displeased";
  if (progress >= 0.5) return "amused";
  return "bored";
}
