// --- First-run tutorial ----------------------------------------------------
// A short guided tour of the play screen, shown once automatically to a
// brand-new player (no saved run yet) and never again. It dims everything
// but the element being introduced, with a bubble of text beside it.

const TUTORIAL_SEEN_KEY = "jester-tutorial-seen";

function tutorialSeen() {
  try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === "1"; } catch { return false; }
}

function markTutorialSeen() {
  try { localStorage.setItem(TUTORIAL_SEEN_KEY, "1"); } catch {}
}

// `target` is a selector for the live element to spotlight; omit it for a
// centered step with no spotlight (the opening and closing lines).
const TUTORIAL_STEPS = [
  {
    title: "Welcome to the Court",
    body: "You're the King's jester. Play poker hands from your cards to score Chips × Mult, and clear the target before your hands run out.",
  },
  {
    target: "#hand-row",
    title: "Your hand",
    body: "Click cards to select up to 5 of them — they lift as you pick them.",
  },
  {
    target: "#tally",
    title: "Chips × Mult",
    body: "Your selection's hand type, chips, and multiplier preview here before you play it.",
  },
  {
    target: "#controls",
    title: "Play or discard",
    body: "Play Hand scores your selection against the target. Discard trades unwanted cards for new ones — you have a limited number of each per round.",
  },
  {
    target: "#score-val",
    title: "Beat the target",
    body: "Clear the target score before you run out of hands, or the court loses interest in you.",
  },
  {
    target: "#jester-row",
    title: "Jesters",
    body: "Jesters are passive charms that bend the rules your way. Hire them Backstage between rounds, and drag to reorder — order matters for some.",
  },
  {
    target: "#deck-pile",
    title: "Your deck",
    body: "Tap the deck anytime to see what's left in it, or check hand rankings and options.",
  },
  {
    title: "Places, please",
    body: "That's the whole act. Good luck, fool — the curtain's rising.",
  },
];

let tutorialStep = 0;
let tutorialEls = null;

function tutorialKeydown(e) {
  if (e.key === "Escape") { endTutorial(); return; }
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tutorialAdvance(); }
}

function buildTutorialDOM() {
  const block = document.createElement("div");
  block.id = "tutorial-block";
  const spot = document.createElement("div");
  spot.id = "tutorial-spot";
  const bubble = document.createElement("div");
  bubble.id = "tutorial-bubble";
  bubble.innerHTML = `
    <p id="tutorial-count"></p>
    <h3 id="tutorial-title"></h3>
    <p id="tutorial-text"></p>
    <div id="tutorial-actions">
      <button id="tutorial-skip" type="button">Skip</button>
      <button id="tutorial-next" type="button">Next</button>
    </div>`;
  document.body.append(block, spot, bubble);
  tutorialEls = {
    block, spot, bubble,
    count: bubble.querySelector("#tutorial-count"),
    title: bubble.querySelector("#tutorial-title"),
    text: bubble.querySelector("#tutorial-text"),
    skip: bubble.querySelector("#tutorial-skip"),
    next: bubble.querySelector("#tutorial-next"),
  };
  tutorialEls.skip.addEventListener("click", endTutorial);
  tutorialEls.next.addEventListener("click", tutorialAdvance);
  window.addEventListener("resize", positionTutorialStep);
}

// Places the spotlight hole over the step's target (if any) and the bubble beside it,
// flipping above/below depending on which has room. No target centers the bubble instead.
function positionTutorialStep() {
  if (!tutorialEls) return;
  const step = TUTORIAL_STEPS[tutorialStep];
  const { spot, bubble } = tutorialEls;
  const target = step.target && document.querySelector(step.target);
  const rect = target ? target.getBoundingClientRect() : null;
  if (rect && rect.width) {
    const pad = 10;
    spot.classList.remove("hidden");
    spot.style.left = `${rect.left - pad}px`;
    spot.style.top = `${rect.top - pad}px`;
    spot.style.width = `${rect.width + pad * 2}px`;
    spot.style.height = `${rect.height + pad * 2}px`;
    bubble.classList.remove("centered");
    const bw = bubble.offsetWidth || 320;
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - bw - 16);
    bubble.style.left = `${left}px`;
    const below = rect.bottom + pad + 160 < window.innerHeight;
    bubble.style.top = below
      ? `${rect.bottom + pad + 14}px`
      : `${Math.max(16, rect.top - pad - 14 - bubble.offsetHeight)}px`;
  } else {
    spot.classList.add("hidden");
    bubble.classList.add("centered");
    bubble.style.left = "";
    bubble.style.top = "";
  }
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStep];
  const { count, title, text, next } = tutorialEls;
  count.textContent = `${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
  title.textContent = step.title;
  text.textContent = step.body;
  next.textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? "Start Playing" : "Next";
  positionTutorialStep();
}

function tutorialAdvance() {
  if (tutorialStep >= TUTORIAL_STEPS.length - 1) { endTutorial(); return; }
  tutorialStep++;
  renderTutorialStep();
}

function endTutorial() {
  markTutorialSeen();
  if (tutorialEls) {
    tutorialEls.block.remove();
    tutorialEls.spot.remove();
    tutorialEls.bubble.remove();
    window.removeEventListener("resize", positionTutorialStep);
    tutorialEls = null;
  }
  document.removeEventListener("keydown", tutorialKeydown);
}

function startTutorial() {
  if (tutorialEls) return; // already showing
  tutorialStep = 0;
  buildTutorialDOM();
  document.addEventListener("keydown", tutorialKeydown);
  renderTutorialStep();
}

// Called once after a brand-new run's opening deal; delayed to clear the shuffle/deal
// animation (see startRound in state.js) so the hand is actually on screen to point at.
function maybeStartTutorial() {
  if (tutorialSeen()) return;
  setTimeout(startTutorial, 900);
}
