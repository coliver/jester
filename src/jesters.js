// --- Jester roster -----------------------------------------------------
// Every jester in the game: its price, rarity and scoring or round hooks.

const JESTER_POOL = [
  // --- jesters "Available from start" whose effects --
  // --- fit this engine's scoring hook without adding new state tracking) -
  {
    id: "base_jester", name: "Jester", price: 2, rarity: "Common",
    desc: "+4 Mult",
    apply: () => ({ multAdd: 4 }),
  },
  {
    id: "greedy_jester", name: "Greedy Jester", price: 5, rarity: "Common",
    desc: "+3 Mult per Diamond played",
    apply: (ctx) => ({ multAdd: 3 * ctx.scored.filter(c => cardIsSuit(c, "♦")).length }),
  },
  {
    id: "lusty_jester", name: "Lusty Jester", price: 5, rarity: "Common",
    desc: "+3 Mult per Heart played",
    apply: (ctx) => ({ multAdd: 3 * ctx.scored.filter(c => cardIsSuit(c, "♥")).length }),
  },
  {
    id: "wrathful_jester", name: "Wrathful Jester", price: 5, rarity: "Common",
    desc: "+3 Mult per Spade played",
    apply: (ctx) => ({ multAdd: 3 * ctx.scored.filter(c => cardIsSuit(c, "♠")).length }),
  },
  {
    id: "gluttonous_jester", name: "Gluttonous Jester", price: 5, rarity: "Common",
    desc: "+3 Mult per Club played",
    apply: (ctx) => ({ multAdd: 3 * ctx.scored.filter(c => cardIsSuit(c, "♣")).length }),
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
    apply: (ctx) => ({ multAdd: 8 * ctx.scored.filter(c => FIBONACCI_RANKS.has(c.rank)).length }),
  },
  {
    id: "scary_face", name: "Scary Face", price: 4, rarity: "Common",
    desc: "+30 Chips per played face card",
    apply: (ctx) => ({ chips: 30 * ctx.scored.filter(c => isFaceCard(c, ctx)).length }),
  },
  {
    id: "abstract_jester", name: "Abstract Jester", price: 4, rarity: "Common",
    desc: "+3 Mult per Jester card",
    apply: (ctx) => ({ multAdd: 3 * ctx.jesters.length }),
  },
  {
    id: "even_steven", name: "Even Steven", price: 4, rarity: "Common",
    desc: "+4 Mult per played even-rank card (10,8,6,4,2)",
    apply: (ctx) => ({ multAdd: 4 * ctx.scored.filter(c => EVEN_RANKS.has(c.rank)).length }),
  },
  {
    id: "odd_todd", name: "Odd Todd", price: 4, rarity: "Common",
    desc: "+31 Chips per played odd-rank card (A,9,7,5,3)",
    apply: (ctx) => ({ chips: 31 * ctx.scored.filter(c => ODD_RANKS.has(c.rank)).length }),
  },
  {
    id: "scholar", name: "Scholar", price: 4, rarity: "Common",
    desc: "Played Aces give +20 Chips and +4 Mult",
    apply: (ctx) => {
      const aces = ctx.scored.filter(c => c.rank === "A").length;
      return { chips: 20 * aces, multAdd: 4 * aces };
    },
  },
  {
    id: "business_card", name: "Letter of Introduction", price: 4, rarity: "Common",
    desc: "Played face cards have a 1 in 2 chance to give $2 when scored",
    apply: (ctx) => {
      let money = 0;
      for (const c of ctx.scored) if (isFaceCard(c, ctx) && Math.random() < 0.5) money += 2;
      return { money };
    },
  },
  {
    id: "blackboard", name: "Blackboard", price: 6, rarity: "Uncommon",
    desc: "X3 Mult if all cards held in hand are Spades or Clubs",
    apply: (ctx) => ({ multMul: ctx.heldHand.every(c => cardIsSuit(c, "♠") || cardIsSuit(c, "♣")) ? 3 : 1 }),
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
    id: "photograph", name: "Royal Portrait", price: 5, rarity: "Common",
    desc: "First played face card gives X2 Mult when scored",
    apply: (ctx) => ({ multMul: ctx.scored.some(c => isFaceCard(c, ctx)) ? 2 : 1 }),
  },
  {
    id: "reserved_parking", name: "Seat at the High Table", price: 6, rarity: "Common",
    desc: "Each face card held in hand has a 1 in 2 chance to give $1",
    apply: (ctx) => {
      let money = 0;
      for (const c of ctx.heldHand) if (isFaceCard(c, ctx) && Math.random() < 0.5) money += 1;
      return { money };
    },
  },
  {
    id: "baseball_card", name: "Heraldic Crest", price: 8, rarity: "Rare",
    desc: "Uncommon Jesters each give X1.5 Mult",
    apply: (ctx) => ({ multMul: Math.pow(1.5, ctx.jesters.filter(j => j.rarity === "Uncommon").length) }),
  },
  {
    id: "bull", name: "Bull", price: 6, rarity: "Uncommon",
    desc: "+2 Chips for each $1 you have",
    apply: (ctx) => ({ chips: 2 * Math.max(0, ctx.money) }),
  },
  {
    id: "walkie_talkie", name: "Carrier Pigeon", price: 4, rarity: "Common",
    desc: "Each played 10 or 4 gives +10 Chips and +4 Mult",
    apply: (ctx) => {
      const n = ctx.scored.filter(c => c.rank === "10" || c.rank === "4").length;
      return { chips: 10 * n, multAdd: 4 * n };
    },
  },
  {
    id: "smiley_face", name: "Smiley Face", price: 4, rarity: "Common",
    desc: "Played face cards give +5 Mult",
    apply: (ctx) => ({ multAdd: 5 * ctx.scored.filter(c => isFaceCard(c, ctx)).length }),
  },

  // --- jesters that needed a small amount of --
  // --- new engine plumbing (round-start deltas, a discard hook, a round-end -
  // --- hook, a shop-debt floor, a free reroll flag, and a 4-card flush/ -----
  // --- straight rule) rather than just the existing per-hand scoring hook. -
  {
    id: "hack", name: "Hack", price: 6, rarity: "Uncommon",
    desc: "Played 2s, 3s, 4s, and 5s are scored again",
    apply: (ctx) => ({
      chips: ctx.scored.filter(c => RETRIGGER_RANKS.has(c.rank)).reduce((sum, c) => sum + cardChipValue(c), 0),
    }),
  },
  {
    id: "delayed_gratification", name: "Delayed Gratification", price: 4, rarity: "Common",
    desc: "Earn $2 per discard if no discards are used by act end",
    roundEnd: (ctx) => (ctx.discardsUsed === 0 ? { money: 2 * ctx.discardsLeft } : {}),
  },
  {
    id: "to_the_moon", name: "To the Moon", price: 5, rarity: "Uncommon",
    desc: "Earn an extra $1 of interest per $5 held (up to $5) at act end",
    roundEnd: (ctx) => ({ money: interestOn(ctx.money) }),
  },
  {
    id: "golden_jester", name: "Golden Jester", price: 6, rarity: "Common",
    desc: "Earn $4 at the end of the act",
    roundEnd: () => ({ money: 4 }),
  },
  {
    id: "egg", name: "Egg", price: 4, rarity: "Common",
    desc: "Gains $3 of sell value at the end of every act",
    grew: "+$3",
    status: (self) => `Currently +$${self.sellBonus || 0} sell value`,
    roundEnd: (ctx, self) => { self.sellBonus = (self.sellBonus || 0) + 3; return {}; },
  },
  {
    id: "gros_michel", name: "Gros Michel", price: 5, rarity: "Common",
    desc: "+15 Mult, 1 in 6 chance to be destroyed at act end",
    apply: () => ({ multAdd: 15 }),
    roundEnd: () => (Math.random() < 1 / 6 ? { destroySelf: true } : {}),
  },
  {
    id: "cloud_9", name: "Cloud 9", price: 7, rarity: "Uncommon",
    desc: "Earn $1 at act end for each 9 in your deck",
    roundEnd: (ctx) => ({ money: ctx.deck.filter(c => c.rank === "9").length }),
  },
  {
    id: "rocket", name: "Trebuchet", price: 6, rarity: "Uncommon",
    desc: "Earn $1 at act end; the payout rises by $2 each time a boss act is cleared",
    grew: "+$2",
    status: (self) => `Currently $${self.rocketPayout || 1}`,
    roundEnd: (ctx, self) => {
      const money = self.rocketPayout || 1;
      if (ctx.isBoss) self.rocketPayout = money + 2;
      return { money };
    },
  },
  {
    id: "gift_card", name: "Gift Card", price: 6, rarity: "Uncommon",
    desc: "Adds $1 of sell value to every owned Jester at the end of every act",
    roundEnd: (ctx) => {
      for (const j of ctx.jesters) j.sellBonus = (j.sellBonus || 0) + 1;
      return {};
    },
  },
  {
    id: "cavendish", name: "Cavendish", price: 4, rarity: "Common",
    desc: "X3 Mult, 1 in 1000 chance to be destroyed at act end",
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
    desc: "+1 discard each act",
    discardsDelta: 1,
  },
  {
    id: "credit_card", name: "Promissory Note", price: 1, rarity: "Common",
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

  // --- jester-to-jester synergy/anti-synergy — effects that read --
  // --- (Brainstorm, Blueprint, Swashbuckler, Ringmaster) or accumulate from (Campfire) the rest of -
  // --- the owned roster, rather than just the played hand or game state. ---
  // --- Campfire's sell-for-scaling payoff directly tugs against Brainstorm/-
  // --- Swashbuckler/Jester Stencil/Abstract Jester, which all want a full, --
  // --- stable board — selling for Campfire starves those.
  {
    id: "brainstorm", name: "The Mimic", price: 10, rarity: "Rare",
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
    desc: "X0.25 Mult per Jester sold this run; resets when a boss act is cleared",
    apply: (ctx) => ({ multMul: 1 + 0.25 * ctx.jestersSold }),
  },
  {
    id: "blueprint", name: "The Understudy", price: 10, rarity: "Rare",
    desc: "Emulates the scoring ability of the Jester to its right",
    apply: (ctx) => {
      const target = ctx.jesters[ctx.jesters.findIndex(j => j.id === "blueprint") + 1];
      if (!target || target.id === "blueprint" || target.id === "brainstorm" || !target.apply) return {};
      return target.apply(ctx, target);
    },
  },
  {
    id: "constellation", name: "Constellation", price: 6, rarity: "Uncommon",
    desc: "Gains X0.1 Mult every time a Mask card is used",
    grew: "+0.1 Mult",
    status: (self) => `Currently X${(1 + 0.1 * (self.tricksUsed || 0)).toFixed(1)} Mult`,
    apply: (ctx, self) => ({ multMul: 1 + 0.1 * (self.tricksUsed || 0) }),
    onTrickUsed: (self) => { self.tricksUsed = (self.tricksUsed || 0) + 1; },
  },
  {
    id: "space_jester", name: "Court Astrologer", price: 5, rarity: "Common",
    desc: "1 in 4 chance to level up the played poker hand",
    onPlay: () => (Math.random() < 1 / 4 ? { levelUp: true } : {}),
  },
  {
    id: "ringmaster", name: "Master of Revels", price: 5, rarity: "Uncommon",
    desc: "+4 Mult per different rarity among owned Jesters",
    apply: (ctx) => ({ multAdd: 4 * new Set(ctx.jesters.map(j => j.rarity)).size }),
  },
];
