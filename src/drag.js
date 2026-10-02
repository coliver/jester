// --- Reordering --------------------------------------------------------
// Moving jesters and cards by dragging them.

// Jesters score left to right, so array order is play order.
function moveJester(id, toIndex) {
  const from = state.jesters.findIndex(j => j.id === id);
  if (from === -1) return;
  const to = Math.max(0, Math.min(state.jesters.length - 1, toIndex));
  if (to === from) return;
  const [jester] = state.jesters.splice(from, 1);
  state.jesters.splice(to, 0, jester);
  lastJesterSig = null;
  render();
}

// Dragging a card to a new place in the hand row or the play area switches to a custom order
// (neither sort button active) until a sort button is clicked again. Played cards score left
// to right as they sit in the play area.
// Moves a card to `toIndex` among the cards `inRow` accepts (the ones shown in that row) and
// returns whether anything changed; the caller renders.
function moveCardInRow(id, toIndex, inRow) {
  if (scoring) return false;
  const cards = sortedHand();
  const visible = cards.filter(inRow);
  const from = visible.findIndex(c => c.id === id);
  if (from === -1) return false;
  const to = Math.max(0, Math.min(visible.length - 1, toIndex));
  if (to === from) return false;
  const anchor = visible[to];
  const [card] = cards.splice(cards.indexOf(visible[from]), 1);
  const at = cards.indexOf(anchor);
  cards.splice(to > from ? at + 1 : at, 0, card);
  state.hand = cards;
  state.sortMode = "custom";
  return true;
}

// The hand row only shows cards that aren't parked in the play area, so indices count those.
function moveHandCard(id, toIndex) {
  if (!moveCardInRow(id, toIndex, c => !state.staged.has(c.id))) return;
  Sound.click();
  render();
}

function moveStagedCard(id, toIndex) {
  if (!moveCardInRow(id, toIndex, c => state.staged.has(c.id))) return;
  Sound.click();
  render();
}

// Pointer-based drag (HTML5 drag-and-drop doesn't fire on touch screens).
// Cards set `touch-action: none` in CSS so the browser doesn't claim the
// gesture for scrolling (which would cancel the drag). Dropping over another
// jester in the same row puts the dragged one in that slot; the target is
// the nearest slot center to the pointer. Hand cards use the same gesture.
const DRAG_THRESHOLD_PX = 6;

function makeJesterDraggable(el, id) {
  el.dataset.jesterId = id;
  // Slots are the card's wrapper in the play row, or the cards themselves in
  // the shop list; either way sibling order is jester order.
  makeDraggable(el, () => (el.closest(".jester-slot") || el).parentElement.children,
    (index) => moveJester(id, index));
}

// `getSlots` returns the sibling elements that make up the row; `onDrop`
// gets the index of the slot nearest the pointer when a drag is released.
// An optional `zone` ({ target: () => element, onDrop: (rect) => void }) is a
// drop area outside the row: releasing the pointer over it calls zone.onDrop
// with the dragged card's last on-screen rect instead of reordering.
function makeDraggable(el, getSlots, onDrop, zone) {
  el.addEventListener("dragstart", (e) => e.preventDefault());
  el.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || e.target.closest("button")) return;
    const startX = e.clientX, startY = e.clientY;
    let dragging = false;
    let slots = [], centers = [], from = -1, hover = -1;
    let overZone = false;
    const pointerInZone = (ev) => {
      if (!zone) return false;
      const r = zone.target().getBoundingClientRect();
      return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    };

    // Nearest slot center to the pointer wins, so gaps, overlaps and sloppy
    // aim all still land somewhere sensible. Centers are measured once at
    // drag start: the slots shift as feedback, which must not move the target.
    const nearest = (x, y) => {
      let best = -1, bestDist = Infinity;
      centers.forEach((c, i) => {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < bestDist) { best = i; bestDist = d; }
      });
      return best;
    };
    // The slots between the dragged one and the hover target slide one place
    // toward where it came from, opening a gap where it will land.
    const showGap = (target) => {
      if (target === hover) return;
      hover = target;
      slots.forEach((slot, i) => {
        let j = i;
        if (from < target && i > from && i <= target) j = i - 1;
        else if (target < from && i >= target && i < from) j = i + 1;
        slot.style.translate = j === i ? "" : `${centers[j].x - centers[i].x}px ${centers[j].y - centers[i].y}px`;
      });
    };

    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
        dragging = true;
        hideInspect();
        el.classList.add("dragging");
        el.style.zIndex = "5";
        slots = [...getSlots()];
        centers = slots.map(slot => {
          const r = slot.getBoundingClientRect();
          return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
        });
        from = hover = slots.findIndex(slot => slot === el || slot.contains(el));
      }
      if (ev.cancelable) ev.preventDefault();
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      const inside = pointerInZone(ev);
      if (inside !== overZone) {
        overZone = inside;
        zone.target().classList.toggle("drop-ready", inside);
      }
      // Over the drop zone the row closes back up instead of opening a gap.
      const target = inside ? from : nearest(ev.clientX, ev.clientY);
      if (from !== -1 && target !== -1) showGap(target);
    };
    const cleanup = () => {
      if (zone) zone.target().classList.remove("drop-ready");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
    };
    const reset = () => {
      el.classList.remove("dragging");
      el.style.transform = el.style.zIndex = "";
      for (const slot of slots) slot.style.translate = "";
    };
    const onCancel = () => { cleanup(); reset(); };
    const onUp = (ev) => {
      cleanup();
      if (!dragging) return;
      const rect = el.getBoundingClientRect();
      const droppedInZone = pointerInZone(ev);
      reset();
      // The click that follows a drag would open the inspect tooltip.
      const swallow = (c) => { c.stopImmediatePropagation(); c.preventDefault(); };
      el.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", swallow, true), 0);
      if (droppedInZone) {
        zone.onDrop(rect);
        return;
      }
      const best = nearest(ev.clientX, ev.clientY);
      if (best !== -1) onDrop(best);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  });
}
