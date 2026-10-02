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
    isFlush = SUITS.some(s => cards.filter(c => cardIsSuit(c, s)).length >= runSize);
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
  if (!type) throw new Error("No hand type matched");
  const base = handBase(type);
  if (!Number.isFinite(base?.chips) || !Number.isFinite(base?.mult)) {
    throw new Error(`Invalid hand base for ${type.name}: ${JSON.stringify(base)}`);
  }
  // Scoring cards trigger left to right as they sit in the played hand, not in the
  // order the hand type happened to find them (highest group first).
  const scoringIds = new Set(getScoringCards(type.name, cards, runSize).map(c => c.id));
  const scoringCards = cards.filter(c => scoringIds.has(c.id));

  return { name: type.name, baseChips: base.chips, baseMult: base.mult, isStraight, isFlush, counts, scoringCards };
}

function getScoringCards(typeName, cards, runSize) {
  const groups = Object.values(
    Object.groupBy(cards, c => c.rank)
  ).sort((a, b) => rankNum(b[0].rank) - rankNum(a[0].rank));

  const straightCards = pool => {
    const nums = [...new Set(pool.map(c => rankNum(c.rank)))].sort((a, b) => a - b);
    const withWheel = nums.includes(14) ? [1, ...nums] : nums;

    // Keep the highest straight found.
    let targets = null;
    for (let i = 0; i + runSize <= withWheel.length; i++) {
      const window = withWheel.slice(i, i + runSize);
      if (window.at(-1) - window[0] === runSize - 1) targets = window;
    }

    if (!targets) return [];
    return targets.map(n =>
      pool.find(c => rankNum(c.rank) === (n === 1 ? 14 : n))
    ).filter(Boolean);
  };

  if (typeName.includes("Straight Flush")) {
    for (const suit of SUITS) {
      const result = straightCards(cards.filter(c => cardIsSuit(c, suit)));
      if (result.length) return result;
    }
    return [];
  }

  if (typeName.includes("Straight")) return straightCards(cards);

  if (typeName.includes("Flush")) {
    const suit = SUITS.find(s => cards.filter(c => cardIsSuit(c, s)).length >= runSize);
    return suit ? cards.filter(c => cardIsSuit(c, suit)) : [];
  }

  if (typeName.includes("Five of a Kind")) return groups.find(g => g.length >= 5) ?? [];
  if (typeName.includes("Four of a Kind")) return groups.find(g => g.length >= 4) ?? [];

  if (typeName.includes("Full House")) {
    const three = groups.find(g => g.length >= 3);
    const pair = groups.find(g => g !== three && g.length >= 2);
    return three && pair ? [...three.slice(0, 3), ...pair.slice(0, 2)] : [];
  }

  if (typeName.includes("Three of a Kind")) return groups.find(g => g.length >= 3) ?? [];

  if (typeName.includes("Two Pair")) {
    return groups.filter(g => g.length >= 2).slice(0, 2).flatMap(g => g.slice(0, 2));
  }

  if (typeName.includes("Pair")) return groups.find(g => g.length >= 2)?.slice(0, 2) ?? [];

  // High Card: only the highest-ranked card scores.
  return [...cards].sort((a, b) => rankNum(b.rank) - rankNum(a.rank)).slice(0, 1);
}


function cardChipValue(card) {
  if (state?.bossModifier?.suitDebuff && cardIsSuit(card, state.bossModifier.suitDebuff)) return 0;
  if (state?.bossModifier?.faceDebuff && isFaceCard(card, { pareidolia: state.jesters.some(j => j.id === "pareidolia") })) return 0;
  if (card.rank === "A") return 11;
  if (RANK_VALUE[card.rank]) return 10;
  return parseInt(card.rank, 10);
}

// Pareidolia makes every card count as a face card for jesters that key off
// FACE_RANKS; ctx.pareidolia is computed once per scoreSelection call.
function isFaceCard(card, ctx) {
  return FACE_RANKS.has(card.rank) || Boolean(ctx?.pareidolia);
}

// Besides the totals, the result lists every scoring trigger in the order it happens
// (each played card, then each jester left to right) so the screen can play them out
// one at a time. Each step: { type, chips, multAdd, multMul, money } plus the card id
// or jester index and name; steps that do nothing (a jester whose condition isn't met)
// are left out.
function scoreSelection(selected) {
  const hand = evaluateHand(selected);
  const steps = [];

  for (const c of hand.scoringCards) {
    const chips = cardChipValue(c);

    if (!Number.isFinite(chips)) {
      throw new Error(
        `Invalid chip value for card ${c.id}, rank ${c.rank}: ${chips}`
      );
    }

    const step = {
      type: "card",
      id: c.id,
      chips,
      multAdd: 0,
      multMul: 1,
      money: 0
    };

    if (c.enh === "bonus") step.chips += BONUS_CHIPS;
    else if (c.enh === "mult") step.multAdd = MULT_BONUS;
    else if (c.enh === "glass") step.multMul = GLASS_MULT;

    step.debuffed = step.chips === 0;
    steps.push(step);
  }

  const selectedIds = new Set(selected.map(c => c.id));
  const heldHand = state.hand.filter(c => !selectedIds.has(c.id));

  const ctx = {
    selected,
    scored: hand.scoringCards,
    hand,
    heldHand,
    discardsLeft: state.discardsLeft,
    money: state.money,
    deckSize: state.deck.length,
    jesters: state.jesters,
    jesterSlots: jesterSlots(),
    pareidolia: state.jesters.some(j => j.id === "pareidolia"),
    jestersSold: state.jestersSold
  };

  for (const [i, j] of state.jesters.entries()) {
    const step = {
      type: "jester",
      index: i,
      id: j.id,
      name: j.name,
      chips: 0,
      multAdd: 0,
      multMul: 1,
      money: 0
    };

    if (i === 0 && state.bossModifier?.silenceLeftmost) {
      steps.push({ ...step, silenced: true });
      continue;
    }

    const effect = j.apply ? j.apply(ctx, j) : {};

    step.chips = effect.chips || 0;
    step.multAdd = effect.multAdd || 0;
    step.multMul = effect.multMul || 1;
    step.money = effect.money || 0;

    if (
      step.chips ||
      step.multAdd ||
      step.multMul !== 1 ||
      step.money
    ) {
      steps.push(step);
    }
  }

  let chips = hand.baseChips;
  let mult = hand.baseMult;
  let multMul = 1;
  let money = 0;

  for (const step of steps) {
    chips += step.chips;
    mult += step.multAdd;
    multMul *= step.multMul;
    money += step.money;
  }

  const total = Math.floor(chips * mult * multMul);

  return {
    hand,
    chips,
    mult,
    multMul,
    total,
    money,
    steps
  };
}
