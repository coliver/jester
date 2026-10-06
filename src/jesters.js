// --- Jester roster -----------------------------------------------------
// Every jester in the game: its price, rarity and scoring or round hooks.

// --- Copiers (Mimic, Understudy) ---------------------------------------
// A copier names the jester it points at with copyFrom(jesters, its index). Copiers can chain
// through each other. What it can borrow is anything that triggers during play (apply,
// onScored, onPlay); end-of-act payouts, passive rules and growth hooks are not copied.
// reason is "ok", "none" (nothing to point at, or a loop), "incompatible" (the target has no
// play-time effect) or "silenced" (the target sits in the leftmost slot during the Spymaster).
function resolveCopyTarget(copier, jesters, st = state) {
  const seen = new Set([copier]);
  let source = copier;
  while (source.copyFrom) {
    source = source.copyFrom(jesters, jesters.indexOf(source));
    if (!source || seen.has(source)) return { source: null, reason: "none" };
    seen.add(source);
  }
  const silenced = st?.bossModifier?.silenceLeftmost && [...seen].some(j => j !== copier && jesters[0] === j);
  if (silenced) return { source, reason: "silenced" };
  if (!source.apply && !source.onScored && !source.onPlay) return { source, reason: "incompatible" };
  return { source, reason: "ok" };
}

// The hooks both copiers share: each runs the resolved jester's own hook with that jester as
// `self`, and does nothing when there is nothing valid to copy.
function copierHooks() {
  const target = (self) => {
    const { source, reason } = resolveCopyTarget(self, state.jesters);
    return reason === "ok" ? source : null;
  };
  return {
    apply: (ctx, self) => { const t = target(self); return t?.apply?.(ctx, t) || {}; },
    onScored: (c, ctx, self) => { const t = target(self); return t?.onScored?.(c, ctx, t) || {}; },
    onPlay: (self) => { const t = target(self); return t?.onPlay?.(t) || {}; },
  };
}

const JESTER_POOL = [
  // --- jesters "Available from start" whose effects --
  // --- fit this engine's scoring hook without adding new state tracking) -
  {
    id: "base_jester", name: "Jester", price: 2, rarity: "Common",
    desc: "+4 Mult.",
    apply: () => ({ multAdd: 4 }),
  },
  {
    id: "miser", name: "Miser", price: 5, rarity: "Common",
    desc: "Each scoring ♦ card: +3 Mult.",
    onScored: (c) => ({ multAdd: cardIsSuit(c, "♦") ? 3 : 0 }),
  },
  {
    id: "libertine", name: "Libertine", price: 5, rarity: "Common",
    desc: "Each scoring ♥ card: +3 Mult.",
    onScored: (c) => ({ multAdd: cardIsSuit(c, "♥") ? 3 : 0 }),
  },
  {
    id: "firebrand", name: "Firebrand", price: 5, rarity: "Common",
    desc: "Each scoring ♠ card: +3 Mult.",
    onScored: (c) => ({ multAdd: cardIsSuit(c, "♠") ? 3 : 0 }),
  },
  {
    id: "glutton", name: "Glutton", price: 5, rarity: "Common",
    desc: "Each scoring ♣ card: +3 Mult.",
    onScored: (c) => ({ multAdd: cardIsSuit(c, "♣") ? 3 : 0 }),
  },
  {
    id: "duettist", name: "Duettist", price: 3, rarity: "Common",
    desc: "Hand contains a Pair: +8 Mult.",
    apply: (ctx) => ({ multAdd: ctx.hand.counts[0] >= 2 ? 8 : 0 }),
  },
  {
    id: "juggler", name: "Juggler", price: 4, rarity: "Common",
    desc: "Hand contains Three of a Kind: +12 Mult.",
    apply: (ctx) => ({ multAdd: ctx.hand.counts[0] >= 3 ? 12 : 0 }),
  },
  {
    id: "quadrille_dancer", name: "Quadrille Dancer", price: 4, rarity: "Common",
    desc: "Hand contains Two Pair: +10 Mult.",
    apply: (ctx) => ({ multAdd: ctx.hand.counts.filter(n => n >= 2).length >= 2 ? 10 : 0 }),
  },
  {
    id: "tightrope_walker", name: "Tightrope Walker", price: 4, rarity: "Common",
    desc: "Hand contains a Straight: +12 Mult.",
    apply: (ctx) => ({ multAdd: ctx.hand.isStraight ? 12 : 0 }),
  },
  {
    id: "fan_dancer", name: "Fan Dancer", price: 4, rarity: "Common",
    desc: "Hand contains a Flush: +10 Mult.",
    apply: (ctx) => ({ multAdd: ctx.hand.isFlush ? 10 : 0 }),
  },
  {
    id: "sharper", name: "Sharper", price: 3, rarity: "Common",
    desc: "Hand contains a Pair: +50 Chips.",
    apply: (ctx) => ({ chips: ctx.hand.counts[0] >= 2 ? 50 : 0 }),
  },
  {
    id: "cozener", name: "Cozener", price: 4, rarity: "Common",
    desc: "Hand contains Three of a Kind: +100 Chips.",
    apply: (ctx) => ({ chips: ctx.hand.counts[0] >= 3 ? 100 : 0 }),
  },
  {
    id: "coney_catcher", name: "Coney-Catcher", price: 4, rarity: "Common",
    desc: "Hand contains Two Pair: +80 Chips.",
    apply: (ctx) => ({ chips: ctx.hand.counts.filter(n => n >= 2).length >= 2 ? 80 : 0 }),
  },
  {
    id: "blackleg", name: "Blackleg", price: 4, rarity: "Common",
    desc: "Hand contains a Straight: +100 Chips.",
    apply: (ctx) => ({ chips: ctx.hand.isStraight ? 100 : 0 }),
  },
  {
    id: "card_marker", name: "Card Marker", price: 4, rarity: "Common",
    desc: "Hand contains a Flush: +80 Chips.",
    apply: (ctx) => ({ chips: ctx.hand.isFlush ? 80 : 0 }),
  },
  {
    id: "soul_of_wit", name: "Soul of Wit", price: 5, rarity: "Common",
    desc: "Hand has 3 or fewer cards: +20 Mult.",
    apply: (ctx) => ({ multAdd: ctx.selected.length <= 3 ? 20 : 0 }),
  },
  {
    id: "absent_friends", name: "Absent Friends", price: 8, rarity: "Uncommon",
    desc: "×1 Mult per empty jester slot. This slot counts as empty.",
    apply: (ctx) => ({ multMul: 1 + Math.max(0, ctx.jesterSlots - ctx.jesters.length) }),
  },
  {
    id: "standard_bearer", name: "Standard-Bearer", price: 5, rarity: "Common",
    desc: "+30 Chips per discard remaining.",
    apply: (ctx) => ({ chips: 30 * ctx.discardsLeft }),
  },
  {
    id: "last_rites", name: "Last Rites", price: 5, rarity: "Common",
    desc: "No discards remaining: +15 Mult.",
    apply: (ctx) => ({ multAdd: ctx.discardsLeft === 0 ? 15 : 0 }),
  },
  {
    id: "fortunes_fool", name: "Fortune's Fool", price: 4, rarity: "Common",
    desc: "+0 to +23 Mult, rolled each hand.",
    apply: () => ({ multAdd: Math.floor(Math.random() * 24) }),
  },
  {
    id: "gauntlet", name: "Gauntlet", price: 5, rarity: "Common",
    desc: "+Mult equal to double the rank of the lowest card left in hand.",
    apply: (ctx) => {
      if (ctx.heldHand.length === 0) return {};
      const lowest = Math.min(...ctx.heldHand.map(c => rankNum(c.rank)));
      return { multAdd: lowest * 2 };
    },
  },
  {
    id: "royal_geometer", name: "Royal Geometer", price: 8, rarity: "Uncommon",
    desc: "Each scoring Ace, 2, 3, 5 or 8: +8 Mult.",
    onScored: (c) => ({ multAdd: FIBONACCI_RANKS.has(c.rank) ? 8 : 0 }),
  },
  {
    id: "grotesque", name: "Grotesque", price: 4, rarity: "Common",
    desc: "Each scoring face card: +30 Chips.",
    onScored: (c, ctx) => ({ chips: isFaceCard(c, ctx) ? 30 : 0 }),
  },
  {
    id: "entourage", name: "Entourage", price: 4, rarity: "Common",
    desc: "+3 Mult per jester you own.",
    apply: (ctx) => ({ multAdd: 3 * ctx.jesters.length }),
  },
  {
    id: "lady_even", name: "Lady Even", price: 4, rarity: "Common",
    desc: "Each scoring 2, 4, 6, 8 or 10: +4 Mult.",
    onScored: (c) => ({ multAdd: EVEN_RANKS.has(c.rank) ? 4 : 0 }),
  },
  {
    id: "lady_odd", name: "Lady Odd", price: 4, rarity: "Common",
    desc: "Each scoring Ace, 3, 5, 7 or 9: +31 Chips.",
    onScored: (c) => ({ chips: ODD_RANKS.has(c.rank) ? 31 : 0 }),
  },
  {
    id: "kingmaker", name: "Kingmaker", price: 4, rarity: "Common",
    desc: "Each scoring Ace: +20 Chips and +4 Mult.",
    onScored: (c) => c.rank === "A" ? { chips: 20, multAdd: 4 } : {},
  },
  {
    id: "letter_of_introduction", name: "Letter of Introduction", price: 4, rarity: "Common",
    desc: "Each scoring face card: 1 in 2 chance of +$2.",
    onScored: (c, ctx) => ({ money: isFaceCard(c, ctx) && Math.random() < 0.5 ? 2 : 0 }),
  },
  {
    id: "widows_weeds", name: "Widow's Weeds", price: 6, rarity: "Uncommon",
    desc: "Every card left in hand is ♠ or ♣: ×3 Mult.",
    apply: (ctx) => ({ multMul: ctx.heldHand.every(c => cardIsSuit(c, "♠") || cardIsSuit(c, "♣")) ? 3 : 1 }),
  },
  {
    id: "blue_blood", name: "Blue Blood", price: 5, rarity: "Common",
    desc: "+2 Chips per card left in the draw pile.",
    apply: (ctx) => ({ chips: 2 * ctx.deckSize }),
  },
  {
    id: "baron", name: "Baron", price: 8, rarity: "Rare",
    desc: "Each King left in hand: ×1.5 Mult.",
    apply: (ctx) => ({ multMul: Math.pow(1.5, ctx.heldHand.filter(c => c.rank === "K").length) }),
  },
  {
    id: "royal_portrait", name: "Royal Portrait", price: 5, rarity: "Common",
    desc: "First scoring face card: ×2 Mult.",
    onScored: (c, ctx) => ({ multMul: ctx.scored.find(x => isFaceCard(x, ctx)) === c ? 2 : 1 }),
  },
  {
    id: "seat_at_the_high_table", name: "Seat at the High Table", price: 6, rarity: "Common",
    desc: "Each face card left in hand: 1 in 2 chance of +$1.",
    apply: (ctx) => {
      let money = 0;
      for (const c of ctx.heldHand) if (isFaceCard(c, ctx) && Math.random() < 0.5) money += 1;
      return { money };
    },
  },
  {
    id: "heraldic_crest", name: "Heraldic Crest", price: 8, rarity: "Rare",
    desc: "×1.5 Mult per Uncommon jester you own.",
    apply: (ctx) => ({ multMul: Math.pow(1.5, ctx.jesters.filter(j => j.rarity === "Uncommon").length) }),
  },
  {
    id: "privy_purse", name: "Privy Purse", price: 6, rarity: "Uncommon",
    desc: "+2 Chips per $1 you have.",
    apply: (ctx) => ({ chips: 2 * Math.max(0, ctx.money) }),
  },
  {
    id: "carrier_pigeon", name: "Carrier Pigeon", price: 4, rarity: "Common",
    desc: "Each scoring 4 or 10: +10 Chips and +4 Mult.",
    onScored: (c) => c.rank === "10" || c.rank === "4" ? { chips: 10, multAdd: 4 } : {},
  },
  {
    id: "flatterer", name: "Flatterer", price: 4, rarity: "Common",
    desc: "Each scoring face card: +5 Mult.",
    onScored: (c, ctx) => ({ multAdd: isFaceCard(c, ctx) ? 5 : 0 }),
  },

  // --- jesters that needed a small amount of --
  // --- new engine plumbing (round-start deltas, a discard hook, a round-end -
  // --- hook, a shop-debt floor, a free reroll flag, and a 4-card flush/ -----
  // --- straight rule) rather than just the existing per-hand scoring hook. -
  {
    id: "peasant_revolt", name: "Peasant Revolt", price: 6, rarity: "Uncommon",
    desc: "Each scoring 2, 3, 4 or 5: adds its Chips again.",
    onScored: (c) => ({ chips: RETRIGGER_RANKS.has(c.rank) ? cardChipValue(c) : 0 }),
  },
  {
    id: "patience", name: "Patience", price: 4, rarity: "Common",
    desc: "End of act, if you used no discards: +$2 per discard remaining.",
    roundEnd: (ctx) => (ctx.discardsUsed === 0 ? { money: 2 * ctx.discardsLeft } : {}),
  },
  {
    id: "usurer", name: "Usurer", price: 5, rarity: "Uncommon",
    desc: "End of act: interest pays out twice.",
    roundEnd: (ctx) => ({ money: interestOn(ctx.money) }),
  },
  {
    id: "gilded_fool", name: "Gilded Fool", price: 6, rarity: "Common",
    desc: "End of act: +$4.",
    roundEnd: () => ({ money: 4 }),
  },
  {
    id: "nest_egg", name: "Nest Egg", price: 4, rarity: "Common",
    desc: "End of act: gains $3 sell value.",
    grew: "+$3",
    status: (self) => `Currently +$${self.sellBonus || 0} sell value`,
    roundEnd: (ctx, self) => { self.sellBonus = (self.sellBonus || 0) + 3; return {}; },
  },
  {
    id: "royal_taster", name: "Royal Taster", price: 5, rarity: "Common",
    desc: "+15 Mult. End of act: 1 in 6 chance it is destroyed.",
    apply: () => ({ multAdd: 15 }),
    roundEnd: () => (Math.random() < 1 / 6 ? { destroySelf: true } : {}),
  },
  {
    id: "ninepins", name: "Ninepins", price: 7, rarity: "Uncommon",
    desc: "End of act: +$1 per 9 in your full deck.",
    roundEnd: (ctx) => ({ money: ctx.deck.filter(c => c.rank === "9").length }),
  },
  {
    id: "trebuchet", name: "Trebuchet", price: 6, rarity: "Uncommon",
    desc: "End of act: +$1. The payout gains $2 each time you clear a boss act.",
    grew: "+$2",
    status: (self) => `Currently +$${self.rocketPayout || 1}`,
    roundEnd: (ctx, self) => {
      const money = self.rocketPayout || 1;
      if (ctx.isBoss) self.rocketPayout = money + 2;
      return { money };
    },
  },
  {
    id: "patron", name: "Patron", price: 6, rarity: "Uncommon",
    desc: "End of act: each jester you own gains $1 sell value.",
    roundEnd: (ctx) => {
      for (const j of ctx.jesters) j.sellBonus = (j.sellBonus || 0) + 1;
      return {};
    },
  },
  {
    id: "hardened_taster", name: "Hardened Taster", price: 4, rarity: "Common",
    desc: "×3 Mult. End of act: 1 in 1000 chance it is destroyed.",
    apply: () => ({ multMul: 3 }),
    roundEnd: () => (Math.random() < 0.001 ? { destroySelf: true } : {}),
  },
  {
    id: "many_hands", name: "Many Hands", price: 4, rarity: "Common",
    desc: "+1 hand size.",
    handSizeDelta: 1,
  },
  {
    id: "tippler", name: "Tippler", price: 4, rarity: "Common",
    desc: "+1 discard each act.",
    discardsDelta: 1,
  },
  {
    id: "promissory_note", name: "Promissory Note", price: 1, rarity: "Common",
    desc: "You can go into debt in the shop, down to -$20.",
    debtLimit: 20,
  },
  {
    id: "weathervane", name: "Weathervane", price: 4, rarity: "Common",
    desc: "Each shop: 1 free reroll.",
    freeReroll: true,
  },
  {
    id: "delusions_of_grandeur", name: "Delusions of Grandeur", price: 5, rarity: "Uncommon",
    desc: "Every card counts as a face card.",
  },
  {
    id: "palace_purge", name: "Palace Purge", price: 4, rarity: "Common",
    desc: "Discard 3 or more face cards at once: +$5.",
  },
  {
    id: "corner_cutter", name: "Corner-Cutter", price: 7, rarity: "Uncommon",
    desc: "Flushes and Straights need only 4 cards.",
  },

  // --- jester-to-jester synergy/anti-synergy — effects that read --
  // --- (Mimic, Understudy, King's Ransom, Master of Revels) or accumulate from (Pyre) the rest of -
  // --- the owned roster, rather than just the played hand or game state. ---
  // --- Pyre's sell-for-scaling payoff directly tugs against Mimic/-
  // --- King's Ransom/Absent Friends/Entourage, which all want a full, --
  // --- stable board — selling for Pyre starves those.
  Object.assign({
    id: "mimic", name: "Mimic", price: 10, rarity: "Rare",
    desc: "Copies the scoring effect of the leftmost jester.",
    copyFrom: (jesters) => jesters[0],
  }, copierHooks()),
  {
    id: "kings_ransom", name: "King's Ransom", price: 6, rarity: "Uncommon",
    desc: "+Mult equal to the total sell value of your other jesters.",
    apply: (ctx) => {
      let multAdd = 0;
      for (const j of ctx.jesters) {
        if (j.id === "kings_ransom") continue;
        multAdd += sellValue(j);
      }
      return { multAdd };
    },
  },
  {
    id: "pyre", name: "Pyre", price: 9, rarity: "Rare",
    desc: "Gains ×0.25 Mult per jester sold since the last boss act.",
    apply: (ctx) => ({ multMul: 1 + 0.25 * ctx.jestersSold }),
  },
  Object.assign({
    id: "understudy", name: "Understudy", price: 10, rarity: "Rare",
    desc: "Copies the scoring effect of the jester to its right.",
    copyFrom: (jesters, index) => jesters[index + 1],
  }, copierHooks()),
  {
    id: "belle_of_the_ball", name: "Belle of the Ball", price: 6, rarity: "Uncommon",
    desc: "Gains ×0.1 Mult per mask card used.",
    grew: "+×0.1",
    status: (self) => `Currently ×${(1 + 0.1 * (self.tricksUsed || 0)).toFixed(1)} Mult`,
    apply: (ctx, self) => ({ multMul: 1 + 0.1 * (self.tricksUsed || 0) }),
    onTrickUsed: (self) => { self.tricksUsed = (self.tricksUsed || 0) + 1; },
  },
  {
    id: "court_astrologer", name: "Court Astrologer", price: 5, rarity: "Common",
    desc: "Each hand: 1 in 4 chance to level up that hand type.",
    onPlay: () => (Math.random() < 1 / 4 ? { levelUp: true } : {}),
  },
  {
    id: "master_of_revels", name: "Master of Revels", price: 5, rarity: "Uncommon",
    desc: "+4 Mult per different rarity among your jesters.",
    apply: (ctx) => ({ multAdd: 4 * new Set(ctx.jesters.map(j => j.rarity)).size }),
  },
];
