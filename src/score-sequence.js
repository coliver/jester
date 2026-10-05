// --- Scoring sequence ------------------------------------------------------
// A played hand resolves in the state at once (so the rules stay easy to test), then plays
// out on screen genre-style: the hand name and its base chips x mult, each card
// scoring left to right, each jester in turn, then the two numbers collide into a total that
// rolls into the round score. While it runs, `scoring` holds what the screen still has to
// show (the old score, the played cards, the cards drawn after them), and input is locked.
// Clicking or pressing a key speeds the rest up.

const SCORE_CARD_MS = 330;
const SCORE_JESTER_MS = 430;
const SCORE_FACET_MS = 140;
const SCORE_ROLL_MS = 650;
const TABLE_WIPE_MS = 400; // how long the played cards take to sweep off the table once scoring ends
const SCORE_FAST = 0.18; // a click plays the remaining delays at this fraction of their length
let scoring = null;
let scoringOverride = null;

// Tests (and anything without real animation support) can force it on or off.
function scoringAnimated() {
  if (scoringOverride !== null) return scoringOverride;
  return typeof document !== "undefined" && !prefersReducedMotion() && typeof document.documentElement.animate === "function";
}

// Runs fn now, or once the sequence has finished if one is playing (sounds that
// announce the outcome of the hand, like the round being won).
function cue(fn) {
  if (scoring) scoring.after.push(fn); else fn();
}

function beginScoring(selected, result) {
  return {
    result,
    cards: selected,
    target: state.target,
    scoreBefore: state.roundScore,
    scoreAfter: state.roundScore + result.total,
    shownScore: state.roundScore,
    money: state.money,
    drawn: new Set(),
    dealtIds: new Map(),
    after: [],
    fast: false,
    done: null,
  };
}

// The chips x mult counters in the sidebar. `xmult` is the running product of every X effect.
function renderTally(chips, mult, xmult = 1) {
  document.getElementById("tally-chips").textContent = chips;
  document.getElementById("tally-mult").textContent = mult;
  const x = document.getElementById("tally-x");
  x.textContent = xmult === 1 ? "" : `×${Number(xmult.toFixed(2))}`;
}

function restartClass(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // so adding it again restarts the animation
  el.classList.add(cls);
}

// A floating number over `el` (the card or jester that just scored).
function scorePop(el, text, kind, slot) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pop = document.createElement("div");
  pop.className = `score-pop ${kind}`;
  pop.textContent = text;
  pop.style.left = `${r.left + r.width / 2}px`;
  pop.style.top = `${r.top + 6 - slot * 26}px`;
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1250);
}

function shakeScreen() {
  restartClass(document.getElementById("app"), "shake");
}

function jesterElements() {
  return document.querySelectorAll("#jester-row .jester");
}

// Resolves after ms, or a fraction of it once the player has clicked to hurry things along.
function scoringPause(s, ms) {
  return new Promise(resolve => setTimeout(resolve, s.fast ? ms * SCORE_FAST : ms));
}

function rollScore(s) {
  return new Promise(resolve => {
    const useRaf =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function";

    const frame = useRaf
      ? fn => window.requestAnimationFrame(fn)
      : fn => setTimeout(() => fn(performance.now()), 16);

    const duration = SCORE_ROLL_MS * (s.fast ? SCORE_FAST : 1);
    const t0 = performance.now();


    const step = now => {
      const elapsed = now - t0;
      const k = Math.min(1, elapsed / duration);
      const easing = 1 - Math.pow(1 - k, 3);
      const rawScore =
        s.scoreBefore + (s.scoreAfter - s.scoreBefore) * easing;
      const shownScore = Math.round(rawScore);
      s.shownScore = shownScore;
      renderScoreHud(s.shownScore);

      if (k < 1) {
        frame(step);
      } else {
        // Force the exact final value in case of rounding or timing issues.
        s.shownScore = s.scoreAfter;
        renderScoreHud(s.shownScore);
        resolve();
      }
    };

    frame(step);
  });
}

async function runScoring(s) {
  const { result } = s;
  const hand = result.hand;
  const preview = document.getElementById("preview");
  const tally = document.getElementById("tally");
  const need = Math.max(1, s.target - s.scoreBefore); // what this hand has to add to clear the round
  // How big the hand is next to what's left to score: drives the glow while it builds and the finale.
  const tier = result.total >= need ? 2 : result.total >= need * 0.5 ? 1 : 0;
  let chips = hand.baseChips, mult = hand.baseMult, xmult = 1, ticks = 0, heat = 0;
  try {
    document.getElementById("preview-name").textContent = hand.name;
    renderTally(chips, mult);
    tally.className = "";
    delete preview.dataset.heat;
    await scoringPause(s, 380);

    // A jester that levelled the hand up says which hand and what level it is now.
    for (const up of s.levelUps || []) {
      scorePop(jesterElements()[up.index], `${up.name} Lv.${up.level}!`, "level", 0);
      await scoringPause(s, SCORE_JESTER_MS);
    }

    const bump = (id) => restartClass(document.getElementById(id), "bump");
    const cardEls = new Map(s.cards.map(c => [c.id, document.querySelector(`.card[data-card-id="${c.id}"]`)]));
    for (const step of result.steps) {
      const el = step.type === "card" ? cardEls.get(step.id) : jesterElements()[step.index];
      if (el) restartClass(el, step.type === "card" ? "scoring" : "trigger");
      const facets = [];
      if (step.silenced) facets.push(["Silenced", "mute"]);
      if (step.debuffed) facets.push(["Debuffed", "mute"]);
      if (step.chips) facets.push([`+${step.chips}`, "chips"]);
      if (step.multAdd) facets.push([`+${step.multAdd} Mult`, "mult"]);
      if (step.multMul !== 1) facets.push([`×${Number(step.multMul.toFixed(2))}`, "xmult"]);
      if (step.money) facets.push([`+$${step.money}`, "money"]);

      for (const [i, [text, kind]] of facets.entries()) {
        scorePop(el, text, kind, i);
        if (kind === "mute") Sound.scoreMute();
        else if (kind === "chips") { chips += step.chips; bump("tally-chips"); Sound.scoreChip(ticks++); }
        else if (kind === "mult") { mult += step.multAdd; bump("tally-mult"); Sound.scoreMult(ticks++); }
        else if (kind === "xmult") { xmult *= step.multMul; bump("tally-x"); Sound.scoreXMult(ticks++); }
        else if (kind === "money") {
          s.money += step.money;
          document.getElementById("money-val").textContent = s.money;
          Sound.coinBuy();
        }
        renderTally(chips, mult, xmult);
        const running = chips * mult * xmult;
        const now = running >= need ? 2 : running >= need * 0.5 ? 1 : 0;
        if (now > heat) {
          heat = now;
          preview.dataset.heat = String(heat);
          if (heat === 2) shakeScreen();
        }
        if (i < facets.length - 1) await scoringPause(s, SCORE_FACET_MS);
      }
      await scoringPause(s, facets.length === 0 ? 0 : step.type === "card" ? SCORE_CARD_MS : SCORE_JESTER_MS);
    }

    // The two numbers collide into the hand's total...
    await scoringPause(s, 280);
    document.getElementById("tally-total").textContent = result.total;
    tally.className = `merged tier-${tier}`;
    Sound.scoreTotal(tier);
    if (tier === 2) shakeScreen();
    await scoringPause(s, 520);

    // ...which rolls into the round score.
    tally.classList.add("landing");
    Sound.scoreRoll(SCORE_ROLL_MS / 1000);
    restartClass(document.getElementById("score-val"), "bump");
    await rollScore(s);
    await scoringPause(s, 300);
  } finally {
    finishScoring(s);
    // The played cards linger a moment longer to sweep off the table instead of
    // vanishing the instant the sequence ends.
    if (tableWipe && tableWipe.cards === s.cards) {
      await scoringPause(s, TABLE_WIPE_MS);
      if (tableWipe && tableWipe.cards === s.cards) { tableWipe = null; render(); }
    }
  }
}

// After the winning hand, the jesters' end-of-act effects play out on the table (money, growth,
// being destroyed) before the shop opens over them. `before` is the row as it stood, so a jester
// that is about to be destroyed is still there to be seen.
function startRoundEndShow(before, fx) {
  const show = { before, fx };
  roundEnd = show;
  runRoundEndShow(show);
}

async function runRoundEndShow(show) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    await wait(450);
    for (const f of show.fx) {
      const el = jesterElements()[show.before.indexOf(f.jester)];
      if (!el) continue;
      restartClass(el, "trigger");
      let slot = 0;
      if (f.money) { scorePop(el, `+$${f.money}`, "money", slot++); Sound.coinBuy(); }
      if (f.grew) scorePop(el, f.jester.grew || f.jester.status(f.jester), "money", slot++);
      if (f.destroyed) { scorePop(el, "Destroyed!", "mute", slot++); el.classList.add("destroyed"); Sound.jesterDestroy(); }
      await wait(f.destroyed ? 900 : 700);
    }
    await wait(250);
  } finally {
    if (roundEnd === show) roundEnd = null;
    render();
  }
}

function finishScoring(s) {
  if (scoring !== s) return;
  scoring = null;
  document.getElementById("tally").className = "";
  delete document.getElementById("preview").dataset.heat;
  if (state) state.dealtIds = s.dealtIds;
  if (scoringAnimated()) tableWipe = { cards: s.cards };
  for (const fn of s.after) fn();
  render();
}
