// --- Sound effects: recorded card clips + synthesized stings (Web Audio) --
/* exported Sound */

const Sound = (() => {
  let ctx = null;
  let noiseBuffer = null;
  let muted = (() => {
    try { return localStorage.getItem("jester-muted") === "1"; } catch { return false; }
  })();

  function clip(src) {
    const el = new Audio(src);
    el.preload = "auto";
    return el;
  }

  const clips = {
    take: [
      clip("assets/sound/taking-playing-card.mp3"),
      clip("assets/sound/taking-playing-card-2.mp3"),
      clip("assets/sound/taking-playing-card-3.mp3"),
    ],
    place: clip("assets/sound/placing-playing-card.mp3"),
    shuffleDeck: clip("assets/sound/shuffling-deck-of-cards.mp3"),
  };

  function playClip(base, { delay = 0, volume = 0.5, rate = 1 } = {}) {
    if (muted) return;
    const run = () => {
      const node = base.cloneNode();
      node.volume = volume;
      node.playbackRate = rate;
      node.play().catch(() => {});
    };
    if (delay > 0) setTimeout(run, delay * 1000);
    else run();
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

  function noiseBurst({ delay = 0, duration = 0.08, filterType = "bandpass", freq = 3000, q = 1, gain = 0.3 }) {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = envGain(t, gain, 0.002, duration);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  function tone({ delay = 0, freq = 440, duration = 0.12, type = "sine", gain = 0.2, glideTo = null }) {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + duration);
    const g = envGain(t, gain, 0.005, duration);
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
    noiseBurst({ duration: 0.03, freq: 4200, q: 1, gain: 0.1 });
    tone({ freq: 900, duration: 0.05, type: "triangle", gain: 0.1 });
  }

  function cardDeselect() {
    playClip(clips.place, { volume: 0.4, rate: 1 + Math.random() * 0.1 });
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

  function coinSell() {
    tone({ freq: 900, duration: 0.05, type: "square", gain: 0.09 });
    tone({ delay: 0.04, freq: 600, duration: 0.1, type: "square", gain: 0.07 });
  }

  function shuffle() {
    playClip(clips.shuffleDeck, { volume: 0.55 });
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
  }

  function gameWin() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone({ delay: i * 0.1, freq: f, duration: 0.35, type: "triangle", gain: 0.14 })
    );
  }

  function click() {
    tone({ freq: 700, duration: 0.03, type: "square", gain: 0.07 });
  }

  function isMuted() { return muted; }
  function setMuted(v) {
    muted = v;
    try { localStorage.setItem("jester-muted", v ? "1" : "0"); } catch {}
  }
  function toggleMuted() { setMuted(!muted); return muted; }

  return {
    cardFlip, dealHand, cardSelect, cardDeselect, discard, playHandResolve,
    scoreChip, scoreMult, scoreXMult, scoreMute, scoreTotal, scoreRoll,
    coinBuy, coinSell, shuffle, roundWin, gameOver, gameWin, click,
    isMuted, setMuted, toggleMuted,
  };
})();
