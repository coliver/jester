// --- Sound effects: recorded card clips + synthesized stings (Web Audio) --
/* exported Sound */

const Sound = (() => {
  let ctx = null;
  let noiseBuffer = null;
  let muted = (() => {
    try { return localStorage.getItem("jester-muted") === "1"; } catch { return false; }
  })();

  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  function loadVolume(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : clamp01(parseFloat(v));
    } catch { return fallback; }
  }

  function saveVolume(key, v) {
    try { localStorage.setItem(key, String(v)); } catch {}
  }

  let sfxVolume = loadVolume("jester-sfx-volume", 0.7);
  let musicVolume = loadVolume("jester-music-volume", 0.5);
  let uiVolume = loadVolume("jester-ui-volume", 0.7);

  // The scale a sound should play at: 0 whenever the master mute is on, otherwise
  // whichever bus's slider it belongs to. "sfx" (the default) covers card/game-event
  // sounds; "ui" covers direct click feedback (selecting a card, denials, button clicks).
  function busVolume(bus) {
    if (muted) return 0;
    return bus === "ui" ? uiVolume : sfxVolume;
  }

  function clip(src) {
    const el = new Audio(src);
    el.preload = "auto";
    return el;
  }

  const clips = {
    take: [
      clip("assets/sound/sfx/taking-playing-card.mp3"),
      clip("assets/sound/sfx/taking-playing-card-2.mp3"),
      clip("assets/sound/sfx/taking-playing-card-3.mp3"),
    ],
    place: clip("assets/sound/sfx/placing-playing-card.mp3"),
    shuffleDeck: clip("assets/sound/sfx/shuffling-deck-of-cards.mp3"),
    applause: clip("assets/sound/sfx/clapping.wav"),
    crowdCheers: clip("assets/sound/sfx/storegraphic-crowd-cheers-314919.mp3"),
    crowdInterval: clip("assets/sound/sfx/freesound_community-happy-crowd-at-interval-23485.mp3"),
    disappointedCrowd: clip("assets/sound/sfx/universfield-crowd-disappointment-reaction-352718.mp3"),
    glassBreak: clip("assets/sound/sfx/bottle_breaking.mp3"),
    swoosh: clip("assets/sound/sfx/swoosh.mp3"),
  };

  // Returns the playing <audio> node (so a caller can fade it early), unless `delay`
  // means it hasn't started yet.
  function playClip(base, { delay = 0, volume = 0.5, rate = 1, bus = "sfx", fadeOut = 0 } = {}) {
    const scale = busVolume(bus);
    if (scale <= 0) return null;
    const run = () => {
      const node = base.cloneNode();
      const target = clamp01(volume * scale);
      node.volume = target;
      node.playbackRate = rate;
      node.preservesPitch = false;
      node.mozPreservesPitch = false;
      node.webkitPreservesPitch = false;
      // Some clips end abruptly rather than naturally tailing off; ease the last
      // `fadeOut` seconds down to silence instead of letting it just cut out.
      if (fadeOut > 0) {
        node.addEventListener("timeupdate", () => {
          if (!isFinite(node.duration)) return;
          const remaining = node.duration - node.currentTime;
          node.volume = remaining <= fadeOut ? clamp01(target * (remaining / fadeOut)) : target;
        });
      }
      node.play().catch(() => {});
      return node;
    };
    if (delay > 0) { setTimeout(run, delay * 1000); return null; }
    return run();
  }

  // Ramps a still-playing node's volume down to 0 over `duration` seconds, then pauses it,
  // instead of waiting for its own natural (and possibly abrupt) end.
  function fadeOutNode(node, duration) {
    if (!node || node.paused) return;
    const startVol = node.volume;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / (duration * 1000));
      // House lights going down: hangs near full for a moment, then sinks to black,
      // rather than a flat linear bleed-out.
      node.volume = startVol * (1 - t) * (1 - t);
      if (t < 1 && !node.paused) window.requestAnimationFrame(step);
      else node.pause();
    };
    window.requestAnimationFrame(step);
  }

  function randomTake() {
    return clips.take[Math.floor(Math.random() * clips.take.length)];
  }

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function envGain(startTime, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(peak, startTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + decay);
    return g;
  }

  function noiseBurst({ delay = 0, duration = 0.08, filterType = "bandpass", freq = 3000, q = 1, gain = 0.3, bus = "sfx" }) {
    const scale = busVolume(bus);
    if (scale <= 0) return;
    ensureCtx();
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = envGain(t, gain * scale, 0.002, duration);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  function tone({ delay = 0, freq = 440, duration = 0.12, type = "sine", gain = 0.2, glideTo = null, bus = "sfx" }) {
    const scale = busVolume(bus);
    if (scale <= 0) return;
    ensureCtx();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + duration);
    const g = envGain(t, gain * scale, 0.005, duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function cardFlip(delay = 0) {
    playClip(randomTake(), { delay, volume: 0.45, rate: 0.95 + Math.random() * 0.1 });
  }

  function dealHand(count) {
    for (let i = 0; i < count; i++) cardFlip(i * 0.045);
  }

  function cardSelect() {
    noiseBurst({ duration: 0.03, freq: 4200, q: 1, gain: 0.1, bus: "ui" });
    tone({ freq: 900, duration: 0.05, type: "triangle", gain: 0.1, bus: "ui" });
  }

  function cardDeselect() {
    playClip(clips.place, { volume: 0.4, rate: 1 + Math.random() * 0.1, bus: "ui" });
  }

  function discard(count = 1) {
    for (let i = 0; i < count; i++) {
      playClip(clips.place, { delay: i * 0.03, volume: 0.45, rate: 0.95 + Math.random() * 0.1 });
    }
  }

  function playHandResolve(total) {
    noiseBurst({ duration: 0.09, freq: 1900, q: 0.6, gain: 0.18 });
    const clinks = Math.min(6, Math.max(2, Math.round(total / 40)));
    for (let i = 0; i < clinks; i++) {
      tone({ delay: 0.07 + i * 0.05, freq: 1300 + i * 100, duration: 0.06, type: "square", gain: 0.05 });
    }
    tone({ delay: 0.07 + clinks * 0.05 + 0.04, freq: 660, glideTo: 880, duration: 0.22, type: "sine", gain: 0.14 });
  }

  // Scoring ticks climb a pentatonic ladder, one rung per trigger in a hand, so a long chain
  // of jesters sounds like it is building. n is how many triggers have already happened.
  const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function rung(n) {
    return 392 * Math.pow(2, LADDER[Math.min(Math.max(0, n), LADDER.length - 1)] / 12);
  }

  function scoreChip(n = 0) {
    const f = rung(n);
    tone({ freq: f, duration: 0.14, type: "triangle", gain: 0.16 });
    tone({ freq: f * 2, duration: 0.07, type: "sine", gain: 0.05 });
    noiseBurst({ duration: 0.02, freq: 5200, q: 1, gain: 0.05 });
  }

  function scoreMult(n = 0) {
    const f = rung(n);
    tone({ freq: f, duration: 0.16, type: "square", gain: 0.06 });
    tone({ freq: f / 2, duration: 0.2, type: "triangle", gain: 0.13 });
  }

  function scoreXMult(n = 0) {
    const f = rung(n);
    noiseBurst({ duration: 0.12, freq: 800, q: 0.8, gain: 0.2 });
    tone({ freq: f / 2, glideTo: f, duration: 0.24, type: "sawtooth", gain: 0.1 });
    tone({ delay: 0.06, freq: f * 1.5, duration: 0.28, type: "triangle", gain: 0.1 });
  }

  // A card barred from scoring: a dull, falling thud that doesn't climb the ladder.
  function scoreMute() {
    noiseBurst({ duration: 0.07, filterType: "lowpass", freq: 500, q: 0.7, gain: 0.14 });
    tone({ freq: 220, glideTo: 110, duration: 0.18, type: "sawtooth", gain: 0.08 });
  }

  // The chips and mult colliding into the hand's total; bigger hands (tier 1, 2) get a longer flourish.
  function scoreTotal(tier = 0) {
    noiseBurst({ duration: 0.16, freq: 1400, q: 0.5, gain: 0.25 });
    tone({ freq: 140, glideTo: 55, duration: 0.32, type: "sine", gain: 0.32 });
    const notes = [523.25, 783.99, 1046.5, 1318.5, 1568, 2093].slice(0, 2 + tier * 2);
    notes.forEach((f, i) => tone({ delay: 0.06 + i * 0.07, freq: f, duration: 0.24, type: "triangle", gain: 0.12 }));
  }

  // A run of rising ticks while the total counts into the round score.
  function scoreRoll(seconds = 0.65) {
    const ticks = 9;
    for (let i = 0; i < ticks; i++) {
      tone({ delay: (i * seconds) / ticks, freq: 800 + i * 90, duration: 0.03, type: "square", gain: 0.04 });
    }
  }

  function coinBuy() {
    tone({ freq: 1400, duration: 0.05, type: "square", gain: 0.1 });
    tone({ delay: 0.05, freq: 1900, duration: 0.12, type: "square", gain: 0.09 });
  }

  // The payout ledger: a soft tick as a line is written, a rising whoosh as its amount leaves,
  // a bright coin clink as it lands (n climbs the ladder like the scoring ticks), and a flourish
  // when the last one has paid in.
  function ledgerLine() {
    tone({ freq: 520, duration: 0.04, type: "triangle", gain: 0.1 });
    noiseBurst({ duration: 0.03, freq: 3200, q: 1, gain: 0.06 });
  }

  // The coins are tuned to the F# major triad (F#, A#, C#), the A# being the major third that makes
  // it sound major. Every note a coin plays is a chord tone, so nothing hints at D# minor.
  const F_SHARP_6 = 1479.98;
  const fSharp = (semitones) => F_SHARP_6 * Math.pow(2, semitones / 12);
  const ARPEGGIO = [0, 4, 7, 12, 16]; // F#, A#, C#, F#, A#: up the triad, as far as it climbs

  // One coin hit: a ringing note with its octave and twelfth, over a short click of high noise
  // and a dull knock an octave down, the surface it lands on.
  function clink(delay, f, gain) {
    tone({ delay, freq: f, duration: 0.32, type: "sine", gain });
    tone({ delay, freq: f * 2, duration: 0.18, type: "sine", gain: gain * 0.6 });
    tone({ delay, freq: f * 3, duration: 0.09, type: "sine", gain: gain * 0.35 });
    tone({ delay, freq: f / 2, duration: 0.05, type: "triangle", gain: gain * 0.6 });
    noiseBurst({ delay, duration: 0.03, freq: 8000, q: 1.5, gain: gain * 0.9 });
  }

  // A coin dropped on a pile: it hits, then bounces twice an octave up, quieter and closer together.
  function coinDrop(delay, f, gain) {
    clink(delay, f, gain);
    clink(delay + 0.075, f * 2, gain * 0.5);
    clink(delay + 0.125, f * 2, gain * 0.3);
  }

  // The F# major triad ringing softly beneath, so the key is stated every time.
  function triadBed(delay, gain) {
    [-12, -8, -5].forEach((semi, i) => clink(delay + i * 0.02, fSharp(semi), gain)); // F#5, A#5, C#6
  }

  function ledgerFly() {
    noiseBurst({ duration: 0.3, filterType: "highpass", freq: 5000, q: 0.5, gain: 0.05 }); // coins sliding
    [0, 0.07, 0.13, 0.2, 0.25].forEach((d, i) => clink(d, fSharp(ARPEGGIO[i % 3]), 0.06));
  }

  // The amount landing in the purse: a coin on the next note up the triad, over the triad itself,
  // so a run of landings arpeggiates F#, A#, C#. The last one resolves home to F# an octave up.
  function coinTally(n = 0, last = false) {
    const semi = last ? 12 : ARPEGGIO[Math.min(Math.max(0, n), 2)];
    coinDrop(0, fSharp(semi), last ? 0.18 : 0.16);
    triadBed(0.01, 0.05);
    tone({ freq: 185, glideTo: 92.5, duration: 0.12, type: "sine", gain: 0.12 }); // the weight of the purse, F#3 down to F#2
  }

  // Ka-ching: a till bell on an F# major chord with a cascade of coins pouring in behind it,
  // the last coin settling on F#.
  function ledgerDone() {
    const cascade = [0, 4, 7, 4, 7, 12, 4, 7, 16, 12]; // F#, A#, C#... ending on F#
    [0, 0.05, 0.09, 0.16, 0.2, 0.27, 0.31, 0.38, 0.46, 0.55].forEach((d, i) => clink(d, fSharp(cascade[i]), i === 9 ? 0.14 : 0.1));
    [[fSharp(0), 0.16], [fSharp(4), 0.12], [fSharp(7), 0.12], [fSharp(12), 0.08]].forEach(([f, g], i) =>
      tone({ delay: 0.05, freq: f, duration: 0.9 - i * 0.12, type: "sine", gain: g })); // F#, A#, C#, F#
    noiseBurst({ delay: 0.05, duration: 0.02, freq: 4000, q: 2, gain: 0.2 }); // the bell's strike
  }

  // A tap on something that can't be done: a dull falling knock.
  function deny() {
    noiseBurst({ duration: 0.06, filterType: "lowpass", freq: 600, q: 0.7, gain: 0.14, bus: "ui" });
    tone({ freq: 200, glideTo: 100, duration: 0.14, type: "sawtooth", gain: 0.08, bus: "ui" });
  }

  // A jester destroyed at act end.
  function jesterDestroy() {
    playClip(clips.glassBreak, { volume: 0.6, rate: 0.85 + Math.random() * 0.3 });
  }

  // The shop's offers dealing onto the shelf.
  function shopDeal() {
    playClip(clips.swoosh, { volume: 0.45 });
  }

  function coinSell() {
    tone({ freq: 900, duration: 0.05, type: "square", gain: 0.09 });
    tone({ delay: 0.04, freq: 600, duration: 0.1, type: "square", gain: 0.07 });
  }

  function shuffle() {
    playClip(clips.shuffleDeck, { volume: 0.55 });
  }

  let crowdIntervalNode = null;
  function applause() {
    playClip(clips.applause, { volume: 0.75 });
    crowdIntervalNode = playClip(clips.crowdInterval, { volume: 0.5, fadeOut: 2.5 });
  }

  // Called when the player leaves Backstage (Next Audience), so the crowd clip doesn't
  // keep going, or cut off bluntly, under the next round starting up.
  function fadeOutCrowdInterval() {
    fadeOutNode(crowdIntervalNode, 2.2);
    crowdIntervalNode = null;
  }

  function roundWin() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ delay: i * 0.09, freq: f, duration: 0.2, type: "triangle", gain: 0.13 })
    );
  }

  function gameOver() {
    [440, 392, 349.23, 293.66].forEach((f, i) =>
      tone({ delay: i * 0.12, freq: f, duration: 0.3, type: "sawtooth", gain: 0.1 })
    );
    playClip(clips.disappointedCrowd, { volume: 0.55 });
  }

  function gameWin() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone({ delay: i * 0.1, freq: f, duration: 0.35, type: "triangle", gain: 0.14 })
    );
    playClip(clips.crowdCheers, { volume: 0.55 });
  }

  function click() {
    tone({ freq: 700, duration: 0.03, type: "square", gain: 0.07, bus: "ui" });
  }

  function isMuted() { return muted; }
  function setMuted(v) {
    muted = v;
    try { localStorage.setItem("jester-muted", v ? "1" : "0"); } catch {}
    syncMusicVolume();
  }
  function toggleMuted() { setMuted(!muted); return muted; }

  function getSfxVolume() { return sfxVolume; }
  function setSfxVolume(v) {
    sfxVolume = clamp01(v);
    saveVolume("jester-sfx-volume", sfxVolume);
  }

  function getUiVolume() { return uiVolume; }
  function setUiVolume(v) {
    uiVolume = clamp01(v);
    saveVolume("jester-ui-volume", uiVolume);
  }

  // --- Background music: a shuffled playlist of the court's ambient tracks, one Audio
  // element that advances to the next track when the current one ends. A played-order
  // history (rather than just the shuffle pointer) is what lets prevTrack step backward
  // without re-shuffling or repeating a track out of order. ---
  // `artist` is each track's Pixabay uploader handle (also the filename's own prefix);
  // `artistUrl` is their Pixabay profile.
  const MUSIC_TRACKS = [
    { src: "assets/sound/music/2b16-the-inn-184201.mp3", title: "The Inn", artist: "2b16", artistUrl: "https://pixabay.com/users/2b16/" },
    { src: "assets/sound/music/melodigne-enigmatic-embrace-185358.mp3", title: "Enigmatic Embrace", artist: "Melodigne", artistUrl: "https://pixabay.com/users/melodigne/" },
    { src: "assets/sound/music/turning_pages-candle-hearts-483961.mp3", title: "Candle Hearts", artist: "Turning Pages", artistUrl: "https://pixabay.com/users/turning_pages/" },
    { src: "assets/sound/music/turning_pages-dead-manx27s-drink-lofi-483957.mp3", title: "Dead Man's Drink", artist: "Turning Pages", artistUrl: "https://pixabay.com/users/turning_pages/" },
    { src: "assets/sound/music/turning_pages-degraded-castle-loops-medieval-lofi-390677.mp3", title: "Degraded Castle Loops", artist: "Turning Pages", artistUrl: "https://pixabay.com/users/turning_pages/" },
    { src: "assets/sound/music/turning_pages-four-shields-inn-lo-fi-483964.mp3", title: "Four Shields Inn", artist: "Turning Pages", artistUrl: "https://pixabay.com/users/turning_pages/" },
    { src: "assets/sound/music/turning_pages-winding-village-roads-upbeat-medieval-lofi-390678.mp3", title: "Winding Village Roads", artist: "Turning Pages", artistUrl: "https://pixabay.com/users/turning_pages/" },
  ];

  let musicEl = null;
  let musicPlaylist = [];
  let musicIndex = 0;
  let musicHistory = [];
  let musicHistoryPos = -1;
  const trackListeners = [];

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function nextFromShuffle() {
    if (musicIndex >= musicPlaylist.length) {
      musicPlaylist = shuffled(MUSIC_TRACKS);
      musicIndex = 0;
    }
    return musicPlaylist[musicIndex++];
  }

  function playTrack(track) {
    musicEl.src = track.src;
    musicEl.play().catch(() => {});
    trackListeners.forEach((fn) => fn(track));
  }

  // Both the natural end-of-track and a user-pressed "skip" land here: if prevTrack had
  // stepped back into history, this first replays forward through it before drawing a
  // fresh track from the shuffle, so skipping never drops a track the history already has.
  function nextTrack() {
    let track;
    if (musicHistoryPos < musicHistory.length - 1) {
      track = musicHistory[++musicHistoryPos];
    } else {
      track = nextFromShuffle();
      musicHistory.push(track);
      musicHistoryPos = musicHistory.length - 1;
    }
    playTrack(track);
  }

  // Mirrors most players' "previous": only steps back if there's history to return to,
  // otherwise just restarts the current track.
  function prevTrack() {
    if (musicHistoryPos > 0) {
      playTrack(musicHistory[--musicHistoryPos]);
    } else if (musicEl) {
      musicEl.currentTime = 0;
    }
  }

  function getCurrentTrack() {
    return musicHistoryPos >= 0 ? musicHistory[musicHistoryPos] : null;
  }

  function onTrackChange(fn) {
    trackListeners.push(fn);
  }

  function syncMusicVolume() {
    if (musicEl) musicEl.volume = muted ? 0 : musicVolume;
  }

  // Browsers block audio until a user gesture, so this is called once on the first
  // pointerdown/keydown rather than at load; it's harmless to call more than once.
  // Normally wide open (inaudibly high for a lowpass); swept down while browsing the
  // Backstage shop so the music sounds like it's playing through the wall out front.
  const MUSIC_FREQ_OPEN = 18000;
  let musicFreqMuffled = 300; // tweakable live via the debug LP cutoff knob
  const MUSIC_HP_OPEN = 0;
  let musicFreqMuffledHP = 450; // tweakable live via the debug HP cutoff knob
  const MUSIC_DUCK_OPEN = 1;
  const MUSIC_DUCK_MUFFLED = 0.75; // shop ducks the music 25% quieter on top of the filters
  let musicFilter = null;
  let musicFilterHP = null;
  let musicDuckGain = null;
  let musicFlangeDelay = null;
  let musicFlangeFeedback = null;
  let musicFlangeWet = null;

  // Routes the music element through the Web Audio graph (source -> lowpass -> highpass ->
  // duck gain -> output) instead of straight to the speakers, so its tone and loudness can
  // both be swept without touching the user's own volume slider (that still lives on
  // musicEl.volume). The highpass trims the sub-bass rumble the lowpass alone leaves boomy,
  // so together they band-limit the shop's music into a narrow, "through the wall" band.
  // A second, parallel path (source -> delay (with feedback) -> wet gain -> output) adds a
  // flanger: its delay and wet mix normally sit at 0 and only pulse during a transition (see
  // flangeSwoosh), giving the filter sweep an audible "swish" instead of just a gradual
  // darkening. The feedback loop (delay output back into its own input) is what gives a plain
  // doubled-and-delayed signal real resonant bite instead of a barely-there comb.
  function setupMusicGraph() {
    ensureCtx();
    const source = ctx.createMediaElementSource(musicEl);
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = MUSIC_FREQ_OPEN;
    musicFilter.Q.value = 1.4;
    musicFilterHP = ctx.createBiquadFilter();
    musicFilterHP.type = "highpass";
    musicFilterHP.frequency.value = MUSIC_HP_OPEN;
    musicFilterHP.Q.value = 0.7;
    musicDuckGain = ctx.createGain();
    musicDuckGain.gain.value = MUSIC_DUCK_OPEN;
    source.connect(musicFilter).connect(musicFilterHP).connect(musicDuckGain).connect(ctx.destination);
    musicFlangeDelay = ctx.createDelay(0.03);
    musicFlangeDelay.delayTime.value = 0;
    musicFlangeFeedback = ctx.createGain();
    musicFlangeFeedback.gain.value = 0.35;
    musicFlangeWet = ctx.createGain();
    musicFlangeWet.gain.value = 0;
    source.connect(musicFlangeDelay);
    musicFlangeDelay.connect(musicFlangeFeedback).connect(musicFlangeDelay);
    musicFlangeDelay.connect(musicFlangeWet).connect(ctx.destination);
  }

  // A one-shot flange sweep: the delay rides up to ~15ms and back down over a couple of
  // seconds (slow enough to actually hear as a sweep, not a blip), comb-filtering the wet
  // signal against the dry one as it moves, for the classic swooshing "swish" of a flanger
  // passing through, rather than a sustained flanging texture.
  function flangeSwoosh() {
    const t = ctx.currentTime;
    const peak = 0.015;
    musicFlangeDelay.delayTime.cancelScheduledValues(t);
    musicFlangeDelay.delayTime.setValueAtTime(musicFlangeDelay.delayTime.value, t);
    musicFlangeDelay.delayTime.linearRampToValueAtTime(peak, t + 0.9);
    musicFlangeDelay.delayTime.linearRampToValueAtTime(0, t + 2.2);
    musicFlangeWet.gain.cancelScheduledValues(t);
    musicFlangeWet.gain.setValueAtTime(musicFlangeWet.gain.value, t);
    musicFlangeWet.gain.linearRampToValueAtTime(0.9, t + 0.9);
    musicFlangeWet.gain.linearRampToValueAtTime(0, t + 2.2);
  }

  const FILTER_TAU = 0.15;
  const FILTER_LANDED = FILTER_TAU * 4; // ~98% of the way to target; "landed" for sequencing purposes

  // Sweeps both filter cutoffs first; only once they've landed does the volume duck start
  // moving, rather than both happening at once, with a flange swoosh riding along on top of
  // the cutoff sweep in either direction.
  function setMusicMuffled(on) {
    if (!musicFilter) return;
    const t = ctx.currentTime;
    musicFilter.frequency.cancelScheduledValues(t);
    musicFilter.frequency.setTargetAtTime(on ? musicFreqMuffled : MUSIC_FREQ_OPEN, t, FILTER_TAU);
    musicFilterHP.frequency.cancelScheduledValues(t);
    musicFilterHP.frequency.setTargetAtTime(on ? musicFreqMuffledHP : MUSIC_HP_OPEN, t, FILTER_TAU);
    const volT = t + FILTER_LANDED;
    musicDuckGain.gain.cancelScheduledValues(t);
    musicDuckGain.gain.setValueAtTime(musicDuckGain.gain.value, t); // hold flat until the cutoff lands
    musicDuckGain.gain.setTargetAtTime(on ? MUSIC_DUCK_MUFFLED : MUSIC_DUCK_OPEN, volT, FILTER_TAU);
    flangeSwoosh();
  }

  // Debug knobs: live-retune the shop's muffled cutoffs and immediately preview them on the
  // actual filters, whatever phase the game is in, so they can be dialed in by ear without
  // having to be sitting in the shop while you drag them.
  function getShopFilterFreq() { return musicFreqMuffled; }
  function setShopFilterFreq(hz) {
    musicFreqMuffled = hz;
    if (!musicFilter) return;
    musicFilter.frequency.cancelScheduledValues(ctx.currentTime);
    musicFilter.frequency.setTargetAtTime(musicFreqMuffled, ctx.currentTime, 0.03);
  }
  function getShopFilterFreqHP() { return musicFreqMuffledHP; }
  function setShopFilterFreqHP(hz) {
    musicFreqMuffledHP = hz;
    if (!musicFilterHP) return;
    musicFilterHP.frequency.cancelScheduledValues(ctx.currentTime);
    musicFilterHP.frequency.setTargetAtTime(musicFreqMuffledHP, ctx.currentTime, 0.03);
  }

  // Re-callable on every click/keydown rather than just once: if the context ever ends up
  // stuck suspended (the first gesture's resume() can lose a race, or the tab backgrounds
  // and the browser suspends it), the very next interaction retries and heals it, instead
  // of only a later music-transport click happening to kick it back into life.
  function startMusic() {
    if (musicEl) {
      if (ctx && ctx.state === "suspended") ctx.resume();
      return;
    }
    musicEl = new Audio();
    musicEl.preload = "auto";
    musicEl.volume = muted ? 0 : musicVolume;
    musicEl.preservesPitch = false;
    musicEl.mozPreservesPitch = false;
    musicEl.webkitPreservesPitch = false;
    musicEl.addEventListener("ended", nextTrack);
    setupMusicGraph();
    musicPlaylist = shuffled(MUSIC_TRACKS);
    musicIndex = 0;
    // Routing the element through the Web Audio graph means its sound only reaches the
    // speakers once ctx is actually running, not merely once .play() resolves; resume()
    // is async, so without waiting for it here the very first track can start playing
    // silently (fixed only once some later action, e.g. skipping a track, happens to land
    // after the context has caught up).
    ctx.resume().then(nextTrack, nextTrack);
  }

  let windDownId = null;

  function cancelMusicWindDown() {
    if (windDownId !== null) {
      window.cancelAnimationFrame(windDownId);
      windDownId = null;
    }
  }

  // The court's record player being switched off on a loss: speed and pitch droop
  // together toward a stall and the volume sinks with them, rather than the track
  // just cutting out or fading at a constant speed.
  function musicWindDown(duration = 3.5) {
    if (!musicEl || musicEl.paused) return;
    cancelMusicWindDown();
    const startRate = musicEl.playbackRate;
    const startVol = musicEl.volume;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / (duration * 1000));
      const eased = t * t; // slow to start, then the turntable drags down fast at the end
      musicEl.playbackRate = Math.max(0.06, startRate * (1 - eased * 0.94));
      musicEl.volume = startVol * (1 - eased);
      if (t < 1) {
        windDownId = window.requestAnimationFrame(step);
      } else {
        windDownId = null;
        musicEl.pause();
      }
    };
    windDownId = window.requestAnimationFrame(step);
  }

  // Undoes a wind-down in progress (or one left stalled) so the next round's music
  // starts back up at normal speed and volume.
  function resumeMusic() {
    cancelMusicWindDown();
    if (!musicEl) return;
    musicEl.playbackRate = 1;
    syncMusicVolume();
    if (musicEl.paused && musicEl.src) musicEl.play().catch(() => {});
  }

  function getMusicVolume() { return musicVolume; }
  function setMusicVolume(v) {
    musicVolume = clamp01(v);
    saveVolume("jester-music-volume", musicVolume);
    syncMusicVolume();
  }

  return {
    cardFlip, dealHand, cardSelect, cardDeselect, discard, playHandResolve,
    scoreChip, scoreMult, scoreXMult, scoreMute, scoreTotal, scoreRoll,
    coinBuy, coinSell, coinTally, ledgerLine, ledgerFly, ledgerDone, deny, jesterDestroy, shopDeal, shuffle, applause, fadeOutCrowdInterval, roundWin, gameOver, gameWin, click,
    isMuted, setMuted, toggleMuted,
    getSfxVolume, setSfxVolume, getUiVolume, setUiVolume, getMusicVolume, setMusicVolume, startMusic,
    nextTrack, prevTrack, getCurrentTrack, onTrackChange, musicWindDown, resumeMusic, setMusicMuffled,
    getShopFilterFreq, setShopFilterFreq, getShopFilterFreqHP, setShopFilterFreqHP,
  };
})();
