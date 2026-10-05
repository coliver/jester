// --- Init ---------------------------------------------------------------

function initApp() {
  document.getElementById("play-btn").addEventListener("click", playSelected);
  document.getElementById("discard-btn").addEventListener("click", discardSelected);
  document.getElementById("shop-btn").classList.toggle("hidden", !DEBUG_ENABLED);
  document.getElementById("shop-btn").addEventListener("click", () => setDebugShop(true));
  document.getElementById("win-btn").classList.toggle("hidden", !DEBUG_ENABLED);
  document.getElementById("win-btn").addEventListener("click", debugWinRound);
  document.getElementById("destroy-jester-btn").classList.toggle("hidden", !DEBUG_ENABLED);
  document.getElementById("destroy-jester-btn").addEventListener("click", debugDestroyJester);
  document.getElementById("money-btn").addEventListener("click", () => addDebugMoney());
  window.addEventListener("resize", () => { if (inShop()) syncShopTop(); });
  document.addEventListener("pointerdown", hurryIntro, true);
  document.getElementById("iris").addEventListener("animationend", (e) => { if (e.animationName === "iris-open") e.currentTarget.classList.remove("on"); });
  document.getElementById("payout-btn").addEventListener("click", () => debugReplayPayout());
  document.getElementById("sort-rank-btn").addEventListener("click", () => setSortMode("rank"));
  document.getElementById("sort-suit-btn").addEventListener("click", () => setSortMode("suit"));

  const deckModal = document.getElementById("deck-modal");
  document.getElementById("deck-btn").addEventListener("click", () => setDeckViewOpen(true));
  document.getElementById("options-btn").addEventListener("click", () => setDeckViewOpen(true, "options"));
  document.getElementById("deck-tab").addEventListener("click", () => setDeckViewTab("deck"));
  document.getElementById("hands-tab").addEventListener("click", () => setDeckViewTab("hands"));
  document.getElementById("options-tab").addEventListener("click", () => setDeckViewTab("options"));
  document.getElementById("replay-tutorial-btn").addEventListener("click", () => {
    setDeckViewOpen(false);
    startTutorial();
  });

  document.getElementById("deck-close-btn").addEventListener("click", () => setDeckViewOpen(false));
  deckModal.addEventListener("click", (e) => { if (e.target === deckModal) setDeckViewOpen(false); });
  const deckPile = document.getElementById("deck-pile");
  deckPile.addEventListener("click", () => setDeckViewOpen(true));
  deckPile.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    setDeckViewOpen(true);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-inspectable]")) hideInspect();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!deckModal.classList.contains("hidden")) setDeckViewOpen(false);
    hideInspect();
  });

  const hurry = () => { if (scoring) scoring.fast = true; };
  document.addEventListener("pointerdown", hurry);
  document.addEventListener("keydown", hurry);

  const muteBtn = document.getElementById("mute-btn");
  function syncMuteBtn() {
    const muted = Sound.isMuted();
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.classList.toggle("muted", muted);
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }
  muteBtn.addEventListener("click", () => {
    Sound.toggleMuted();
    syncMuteBtn();
  });
  syncMuteBtn();

  const volumeSliders = [
    ["sfx-volume-slider", Sound.getSfxVolume, Sound.setSfxVolume],
    ["music-volume-slider", Sound.getMusicVolume, Sound.setMusicVolume],
    ["ui-volume-slider", Sound.getUiVolume, Sound.setUiVolume],
  ];
  for (const [id, get, set] of volumeSliders) {
    const slider = document.getElementById(id);
    slider.value = String(Math.round(get() * 100));
    slider.addEventListener("input", () => set(slider.value / 100));
  }

  // Browsers block audio playback until a user gesture, so background music starts on
  // the first pointer/key input rather than at load.
  const startMusicOnce = () => {
    Sound.startMusic();
    document.removeEventListener("pointerdown", startMusicOnce);
    document.removeEventListener("keydown", startMusicOnce);
  };
  document.addEventListener("pointerdown", startMusicOnce);
  document.addEventListener("keydown", startMusicOnce);

  // The options panel's "Now Playing" row (the persistent half) always reflects the
  // current track; the toast (the ephemeral half) only appears to announce a change,
  // and skipping it is the one action it offers without opening Options.
  const nowPlayingTitle = document.getElementById("now-playing-title");
  const nowPlayingArtist = document.getElementById("now-playing-artist");
  const musicToast = document.getElementById("music-toast");
  const musicToastTitle = document.getElementById("music-toast-title");
  let musicToastHideTimer = null;

  function hideMusicToast() {
    musicToast.classList.remove("show");
    clearTimeout(musicToastHideTimer);
    musicToastHideTimer = setTimeout(() => musicToast.classList.add("hidden"), 350);
  }
  function scheduleMusicToastHide() {
    clearTimeout(musicToastHideTimer);
    musicToastHideTimer = setTimeout(hideMusicToast, 4500);
  }
  musicToast.addEventListener("mouseenter", () => clearTimeout(musicToastHideTimer));
  musicToast.addEventListener("mouseleave", scheduleMusicToastHide);
  document.getElementById("music-toast-skip").addEventListener("click", () => Sound.nextTrack());
  document.getElementById("music-prev-btn").addEventListener("click", () => Sound.prevTrack());
  document.getElementById("music-next-btn").addEventListener("click", () => Sound.nextTrack());

  Sound.onTrackChange((track) => {
    nowPlayingTitle.textContent = track.title;
    nowPlayingArtist.textContent = track.artist ? `· ${track.artist}` : "";
    nowPlayingArtist.href = track.artistUrl || "#";
    musicToastTitle.textContent = track.title;
    clearTimeout(musicToastHideTimer);
    musicToast.classList.remove("hidden");
    window.requestAnimationFrame(() => musicToast.classList.add("show"));
    scheduleMusicToastHide();
  });

  document.getElementById("pack-skip-btn").addEventListener("click", skipPack);
  initNewRunButton();

  // A shared ?seed= link starts a new run on that seed, unless that run is already the saved one.
  let saved = loadRun();
  const linked = seedFromUrl();
  if (linked) {
    if (saved?.seed !== linked) {
      state = newState(linked);
      grantStartingJester();
      startRound();
      render();
      dropSeedParam();
      return;
    }
    dropSeedParam();
  }
  if (saved?.phase === "shop") {
    state = saved;
    shopIntroFor = saved.lastEarnings; // no payout count-up for a shop that was already opened
    render();
  } else if (saved && (saved.hand.length || saved.played.length)) {
    state = saved; // resume mid-round exactly as it was
    render();
  } else {
    state = saved || newState(randomSeed());
    if (!saved) grantStartingJester();
    startRound(saved?.bossModifier);
    render();
    if (!saved) maybeStartTutorial();
  }
}

// Browser entry point. Guarded so this file can also be `require()`d from
// plain Node (see test/scoring.test.js) without a DOM.
if (typeof document !== "undefined") {
  initApp();
}

// Test hooks: pure scoring functions, the state machine's actions, and a
// raw accessor to `state` so tests can drive/inspect it directly instead of
// only going through the DOM.
const testHooks = {
  // pure functions
  evaluateHand,
  scoreSelection,
  targetForRound,
  interestOn,
  rankNum,
  cardChipValue,
  freshDeck,
  HAND_TYPES,
  TRICK_POOL,
  DECREE_POOL,
  JESTER_POOL,
  BOSS_MODIFIERS,
  KING_BOSS,
  BOSS_POOL,
  courtMood,
  VENUES,
  // state machine
  newState,
  startRound,
  toggleCard,
  getSelectedCards,
  playHand,
  playSelected,
  stageCard,
  unstageCard,
  PLAY_ANIMATION_MS,
  discardSelected,
  buyJester,
  sellJester,
  moveJester,
  rerollShop,
  buyProp,
  finishRoundWin,
  PROP_POOL,
  buyTrick,
  buyDecree,
  useTrick,
  sellTrick,
  buyPack,
  pickFromPack,
  skipPack,
  setDebugShop,
  addDebugMoney,
  debugWinRound,
  nextRound,
  restart,
  normalizeSeed,
  seededRandom,
  randomSeed,
  render,
  serializeRun,
  restoreRun,
  loadRun,
  SAVE_KEY,
  NEW_RUN_CONFIRM_MS,
  // test-only state access
  _getState: () => state,
  _setScoringAnimation: (on) => { scoringOverride = on; },
  _scoringDone: () => scoring?.done || Promise.resolve(),
  _isScoring: () => scoring !== null,
  destroyCards,
  _setState: (s) => { state = s; },
  tutorialSeen,
  markTutorialSeen,
  startTutorial,
  endTutorial,
  TUTORIAL_STEPS,
};

// Plain Node (no DOM): export the hooks as a CommonJS module.
if (typeof module !== "undefined" && module.exports) {
  module.exports = testHooks;
}
// Browser test runner (jsdom driving the real index.html + initApp() path):
// opts in by setting this sentinel *before* the game's scripts load. Real pages never
// set it, so nothing extra ships to players.
if (typeof window !== "undefined" && window.__JESTER_TEST__) {
  window.__jesterTest = testHooks;
}
