// --- Synthesized sound effects (Web Audio API, no external assets) --------

const Sound = (() => {
  let ctx = null;
  let noiseBuffer = null;
  let muted = (() => {
    try { return localStorage.getItem("jester-muted") === "1"; } catch { return false; }
  })();

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
    noiseBurst({ delay, duration: 0.06, freq: 2600 + Math.random() * 900, q: 0.8, gain: 0.22 });
  }

  function dealHand(count) {
    for (let i = 0; i < count; i++) cardFlip(i * 0.045);
  }

  function cardSelect() {
    noiseBurst({ duration: 0.03, freq: 4200, q: 1, gain: 0.1 });
    tone({ freq: 900, duration: 0.05, type: "triangle", gain: 0.1 });
  }

  function cardDeselect() {
    tone({ freq: 550, duration: 0.05, type: "triangle", gain: 0.08 });
  }

  function discard(count = 1) {
    noiseBurst({ duration: 0.16, freq: 1100, q: 0.5, gain: 0.2 });
    tone({ freq: 500, glideTo: 200, duration: 0.15, type: "sine", gain: 0.08 });
  }

  function playHandResolve(total) {
    noiseBurst({ duration: 0.09, freq: 1900, q: 0.6, gain: 0.18 });
    const clinks = Math.min(6, Math.max(2, Math.round(total / 40)));
    for (let i = 0; i < clinks; i++) {
      tone({ delay: 0.07 + i * 0.05, freq: 1300 + i * 100, duration: 0.06, type: "square", gain: 0.05 });
    }
    tone({ delay: 0.07 + clinks * 0.05 + 0.04, freq: 660, glideTo: 880, duration: 0.22, type: "sine", gain: 0.14 });
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
    for (let i = 0; i < 5; i++) {
      noiseBurst({ delay: i * 0.035, duration: 0.05, freq: 2000 + Math.random() * 1500, q: 1.2, gain: 0.13 });
    }
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
    coinBuy, coinSell, shuffle, roundWin, gameOver, gameWin, click,
    isMuted, setMuted, toggleMuted,
  };
})();
