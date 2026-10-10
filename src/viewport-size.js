// Shows what the browser reports for the window size and orientation, to diagnose phones that
// won't switch between the rotate prompt and the game. It always fills the rotate prompt's
// line, and ?size also pins a small badge to the corner of the game.
(() => {
  // Plain Node tests load every script with no DOM or a stub one.
  if (typeof location === "undefined" || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const lines = [document.getElementById("size-readout")];
  if (new URLSearchParams(location.search).has("size")) {
    const badge = document.createElement("div");
    badge.id = "size-badge";
    document.body.appendChild(badge);
    lines.push(badge);
  }

  function update() {
    const shape = window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait";
    const scr = window.screen || {};
    const type = (scr.orientation && scr.orientation.type) || "n/a";
    const text = `window ${window.innerWidth}x${window.innerHeight} (${shape}), screen ${scr.width}x${scr.height}, ${type}`;
    for (const el of lines) if (el) el.textContent = text;
  }

  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", update);
  update();
})();
