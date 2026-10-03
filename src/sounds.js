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
    applause: clip("assets/sound/clapping.wav"),
    glassBreak: clip("assets/sound/bottle_breaking.mp3"),
    swoosh: clip("assets/sound/swoosh.mp3"),
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
    noiseBurst({ duration: 0.06, filterType: "lowpass", freq: 600, q: 0.7, gain: 0.14 });
    tone({ freq: 200, glideTo: 100, duration: 0.14, type: "sawtooth", gain: 0.08 });
  }

  // A jester destroyed at act end.
  function jesterDestroy() {
    playClip(clips.glassBreak, { volume: 0.6 });
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

  function applause() {
    playClip(clips.applause, { volume: 0.6 });
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
    coinBuy, coinSell, coinTally, ledgerLine, ledgerFly, ledgerDone, deny, jesterDestroy, shopDeal, shuffle, applause, roundWin, gameOver, gameWin, click,
    isMuted, setMuted, toggleMuted,
  };
})();
