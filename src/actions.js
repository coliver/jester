// --- Actions ---------------------------------------------------------------

function clearSelection() {
  state.selected = new Set();
  state.staged = new Set();
}

// Between pressing Play Hand and the hand scoring, the cards fly up into the play area; input waits.
const PLAY_ANIMATION_MS = 380;
let playPending = false;

function toggleCard(id) {
  if (state.phase !== "playing" || playPending || scoring) return;
  const card = state.hand.find(c => c.id === id);
  if (!card) return;
  if (state.selected.has(id)) {
    state.selected.delete(id);
    state.staged?.delete(id);
    Sound.cardDeselect();
  } else if (state.selected.size < MAX_SELECTED) {
    state.selected.add(id);
    Sound.cardSelect();
  }
  render();
}

// Dragging a hand card into the play area selects it and parks it there; dragging it
// (or clicking it) back puts it in the hand again, unselected. Both return whether anything changed.
function stageCard(id) {
  if (state.phase !== "playing" || playPending || scoring || !state.hand.some(c => c.id === id)) return false;
  if (!state.selected.has(id)) {
    if (state.selected.size >= MAX_SELECTED) return false;
    state.selected.add(id);
  }
  state.staged.add(id);
  Sound.cardSelect();
  return true;
}

function unstageCard(id) {
  if (playPending || scoring || !state.staged.delete(id)) return false;
  state.selected.delete(id);
  Sound.cardDeselect();
  return true;
}

function getSelectedCards() {
  return state.hand.filter(c => state.selected.has(c.id));
}

// The Poet Laureate bars a hand type once it has been played this round.
function handBlocked(handName) {
  return Boolean(state.bossModifier?.noRepeatHands && state.handTypesPlayed?.has(handName));
}

// The Play Hand button: selected cards still in the hand first fly up into the play area, then the hand scores.
function playSelected() {
  if (playPending || scoring) return;
  const toStage = getSelectedCards().filter(c => !state.staged.has(c.id));
  if (toStage.length === 0 || state.phase !== "playing" || prefersReducedMotion()) {
    playHand();
    return;
  }
  const from = cardRects(toStage.map(c => c.id));
  for (const c of toStage) state.staged.add(c.id);
  render();
  flipCards(from);
  playPending = true;
  setTimeout(() => {
    playPending = false;
    playHand();
  }, PLAY_ANIMATION_MS);
}

function playHand() {
  // In the order the cards are shown, so they score left to right as laid out in the play area.
  const selected = sortedHand().filter(c => state.selected.has(c.id));
  if (selected.length === 0 || state.handsLeft <= 0) return;

  // Level-up hooks fire before scoring, so the hand scores at its new level.
  const played = evaluateHand(selected).name;
  if (handBlocked(played)) return;
  state.handTypesPlayed?.add(played);
  state.stats.handCounts[played] = (state.stats.handCounts[played] || 0) + 1;
  state.stats.handsPlayed += 1;
  const levelUps = []; // jester index and the hand's new level, for the on-screen callout
  state.jesters.forEach((j, index) => {
    if (j.onPlay && j.onPlay(j).levelUp) {
      levelUpHand(played);
      levelUps.push({ index, name: played, level: handLevel(played) });
    }
  });

  // The hand resolves in the state right away; the screen then plays it out (see runScoring),
  // and anything that should only be seen or heard afterwards goes through cue().
  const result = scoreSelection(selected);
  if (scoringAnimated()) { scoring = beginScoring(selected, result); scoring.levelUps = levelUps; }
  if (!state.stats.bestHand || result.total > state.stats.bestHand.score) state.stats.bestHand = { score: result.total, name: played };
  state.roundScore += result.total;
  state.money += result.money;
  if (state.bossModifier?.handTax && state.money > 0) state.money -= state.bossModifier.handTax;
  state.handsLeft -= 1;
  if (!scoring) Sound.playHandResolve(result.total);

  state.played.push(...selected);
  state.hand = state.hand.filter(c => !state.selected.has(c.id));
  clearSelection();
  const shattered = selected.filter(c => c.enh === "glass" && Math.random() < GLASS_BREAK_CHANCE).map(c => c.id);
  if (shattered.length) destroyCards(shattered);
  const won = state.roundScore >= state.target;
  const drawn = won ? [] : draw(state.handSize - state.hand.length); // a cleared act doesn't deal a fresh hand
  state.hand.push(...drawn);
  state.dealtIds = new Map(drawn.map((c, i) => [c.id, i]));
  if (drawn.length) cue(() => Sound.dealHand(drawn.length));
  if (scoring) {
    // The new cards wait out the scoring, then deal in.
    scoring.drawn = new Set(drawn.map(c => c.id));
    scoring.dealtIds = state.dealtIds;
    state.dealtIds = new Map();
  }

  if (won) {
    finishRoundWin();
  } else if (state.handsLeft <= 0) {
    state.phase = "gameover";
    cue(() => { Sound.gameOver(); Sound.musicWindDown(); });
  }
  render();
  if (scoring) scoring.done = runScoring(scoring);
}

function discardSelected() {
  const selected = getSelectedCards();
  if (playPending || scoring || selected.length === 0 || state.discardsLeft <= 0) return;
  state.discardsLeft -= 1;
  state.discardsUsed += 1;
  state.stats.discards += 1;
  markDiscardRoll();
  Sound.discard(selected.length);
  const faceCount = selected.filter(c => isFaceCard(c, { allFaces: state.jesters.some(j => j.id === "delusions_of_grandeur") })).length;
  if (faceCount >= 3 && state.jesters.some(j => j.id === "palace_purge")) {
    state.money += 5;
  }
  // A redraw rarely lands the new card(s) in the exact slot(s) vacated: the surviving cards'
  // sorted positions can shift by one, and with no FLIP they'd snap there instantly while the
  // new card alone animates in. Measure them now so flipCards can glide them too.
  const stayingIds = state.hand.filter(c => !state.selected.has(c.id)).map(c => c.id);
  const from = cardRects(stayingIds);
  state.discarded.push(...selected);
  state.hand = state.hand.filter(c => !state.selected.has(c.id));
  clearSelection();
  const won = state.roundScore >= state.target;
  const drawn = won ? [] : draw(state.handSize - state.hand.length); // a cleared act doesn't deal a fresh hand
  state.hand.push(...drawn);
  state.dealtIds = new Map(drawn.map((c, i) => [c.id, i]));
  if (drawn.length) Sound.dealHand(drawn.length);
  render();
  flipCards(from);
}
