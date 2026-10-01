"use strict";

// Candlelit masquerade-hall backdrop. Three layers, all procedural:
//   1. a gilt-on-wine damask wall, painted once per resize;
//   2. a low-res light map (flickering sconces, a swaying chandelier and a
//      cold moonbeam that drifts across the room) multiplied over the wall, so
//      the gilt only glints where the light falls on it;
//   3. gold motes rising off the candles.
// Purely decorative: with no canvas (jsdom) it does nothing, and with reduced
// motion it paints a single still frame.
(function () {
  const FRAME_MS = 1000 / 30;
  const LIGHT_SCALE = 4; // the light map is 1/4 size; it is all soft gradients
  const MAX_DPR = 1.5;
  const MOTE_COUNT = 46;
  const AMBIENT = [0.2, 0.15, 0.2]; // how much of the wall shows with no light

  // Sconces along the wall (x, y as fractions of the viewport, radius as a
  // fraction of its diagonal) plus the chandelier, which also sways.
  const CANDLES = [
    { x: 0.1, y: 0.22, r: 0.3, power: 0.85 },
    { x: 0.34, y: 0.16, r: 0.26, power: 0.7 },
    { x: 0.66, y: 0.16, r: 0.26, power: 0.7 },
    { x: 0.9, y: 0.22, r: 0.3, power: 0.85 },
    { x: 0.5, y: 0.04, r: 0.5, power: 0.9, sway: true },
  ];
  const CANDLE_RGB = [255, 160, 70];
  const MOON_RGB = [70, 95, 190];

  const WINE = "#4a1630";
  const SATIN = "rgba(150, 58, 92, 0.55)";
  const GILT = "rgba(236, 192, 98, 0.9)";
  const GILT_SOFT = "rgba(236, 192, 98, 0.4)";

  // One damask motif (an ogee medallion with leaves and a finial) centered on
  // (0, 0), drawn symmetric about the vertical axis.
  function motif(ctx) {
    function ogee(k) {
      ctx.beginPath();
      ctx.moveTo(0, -62 * k);
      ctx.bezierCurveTo(10 * k, -48 * k, 30 * k, -30 * k, 30 * k, -6 * k);
      ctx.bezierCurveTo(30 * k, 22 * k, 12 * k, 34 * k, 0, 58 * k);
      ctx.bezierCurveTo(-12 * k, 34 * k, -30 * k, 22 * k, -30 * k, -6 * k);
      ctx.bezierCurveTo(-30 * k, -30 * k, -10 * k, -48 * k, 0, -62 * k);
      ctx.closePath();
    }
    ctx.lineWidth = 1.4;
    ctx.fillStyle = SATIN;
    ctx.strokeStyle = GILT;
    ogee(1);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = GILT_SOFT;
    ogee(0.62);
    ctx.stroke();

    ctx.fillStyle = GILT;
    ctx.beginPath(); // heart diamond
    ctx.moveTo(0, -14); ctx.lineTo(7, 0); ctx.lineTo(0, 14); ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    for (const [x, y, r] of [[0, -30, 3], [0, 28, 3], [-4, -68, 2.4], [4, -68, 2.4], [0, -72, 2.8]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Acanthus-ish leaves flaring out of the base, mirrored left and right.
    for (const side of [1, -1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.fillStyle = "rgba(236, 192, 98, 0.32)";
      ctx.strokeStyle = GILT_SOFT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, 44);
      ctx.bezierCurveTo(36, 46, 52, 26, 47, 2);
      ctx.bezierCurveTo(43, 20, 32, 30, 16, 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(30, -26);
      ctx.bezierCurveTo(46, -34, 54, -50, 46, -62);
      ctx.bezierCurveTo(44, -48, 38, -40, 26, -36);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // A half-drop repeat: a medallion in the middle of the tile and a quarter of
  // one in each corner, joined by faint diagonals into a trellis.
  function makeTile(doc) {
    const TW = 120, TH = 190, S = 0.7;
    const tile = doc.createElement("canvas");
    tile.width = TW;
    tile.height = TH;
    const ctx = tile.getContext("2d");
    ctx.fillStyle = WINE;
    ctx.fillRect(0, 0, TW, TH);

    ctx.strokeStyle = "rgba(236, 192, 98, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [x, y] of [[0, 0], [TW, 0], [0, TH], [TW, TH]]) {
      ctx.moveTo(x, y);
      ctx.lineTo(TW / 2, TH / 2);
    }
    ctx.stroke();

    for (const [x, y] of [[TW / 2, TH / 2], [0, 0], [TW, 0], [0, TH], [TW, TH]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(S, S);
      motif(ctx);
      ctx.restore();
    }
    return tile;
  }

  // Smooth, never-quite-repeating flicker from a few incommensurate sines.
  function flicker(t, phase) {
    return 1 + 0.09 * Math.sin(t * 7.3 + phase) + 0.06 * Math.sin(t * 12.9 + phase * 2.1) +
      0.05 * Math.sin(t * 3.1 + phase * 3.7);
  }

  function start() {
    const canvas = document.getElementById("court");
    if (!canvas || typeof canvas.getContext !== "function") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const wall = document.createElement("canvas");
    const light = document.createElement("canvas");
    const wallCtx = wall.getContext("2d");
    const lightCtx = light.getContext("2d");
    const tile = makeTile(document);
    if (!wallCtx || !lightCtx || !tile) return;

    let W = 0, H = 0, diag = 0;
    let motes = [];

    function makeMote(fresh) {
      const c = CANDLES[Math.floor(Math.random() * CANDLES.length)];
      return {
        x: (c.x + (Math.random() - 0.5) * 0.18) * W,
        y: fresh ? Math.random() * H : H * (0.3 + Math.random() * 0.7),
        vx: (Math.random() - 0.5) * 6,
        vy: -(5 + Math.random() * 11),
        r: 0.6 + Math.random() * 1.4,
        phase: Math.random() * 10,
      };
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      W = Math.max(1, Math.round(window.innerWidth));
      H = Math.max(1, Math.round(window.innerHeight));
      diag = Math.hypot(W, H);
      canvas.width = wall.width = Math.round(W * dpr);
      canvas.height = wall.height = Math.round(H * dpr);
      light.width = Math.max(1, Math.round(W / LIGHT_SCALE));
      light.height = Math.max(1, Math.round(H / LIGHT_SCALE));
      wallCtx.save();
      wallCtx.scale(dpr, dpr);
      wallCtx.fillStyle = wallCtx.createPattern(tile, "repeat");
      wallCtx.fillRect(0, 0, W, H);
      wallCtx.restore();
      motes = [];
      for (let i = 0; i < MOTE_COUNT; i++) motes.push(makeMote(true));
    }

    function glow(x, y, r, rgb, power) {
      const g = lightCtx.createRadialGradient(x, y, 0, x, y, r);
      const [cr, cg, cb] = rgb;
      g.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${power})`);
      g.addColorStop(0.35, `rgba(${cr}, ${cg}, ${cb}, ${power * 0.42})`);
      g.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      lightCtx.fillStyle = g;
      lightCtx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function draw(t, dt) {
      // Light map: ambient, then every light added on top.
      lightCtx.globalCompositeOperation = "source-over";
      lightCtx.fillStyle = `rgb(${AMBIENT.map((a) => Math.round(a * 255)).join(",")})`;
      lightCtx.fillRect(0, 0, light.width, light.height);
      lightCtx.globalCompositeOperation = "lighter";
      const s = 1 / LIGHT_SCALE;
      CANDLES.forEach((c, i) => {
        const sway = c.sway ? Math.sin(t * 0.45) * 0.035 : 0;
        glow((c.x + sway) * W * s, c.y * H * s, c.r * diag * s, CANDLE_RGB, c.power * flicker(t, i * 1.7));
      });
      // A cold moonbeam slides along the floor and back, pooled low.
      const moonX = 0.5 + 0.38 * Math.sin(t * 0.07);
      glow(moonX * W * s, 0.88 * H * s, 0.42 * diag * s, MOON_RGB, 0.55 + 0.1 * Math.sin(t * 0.31));

      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(wall, 0, 0);
      ctx.globalCompositeOperation = "multiply";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(light, 0, 0, canvas.width, canvas.height);

      // Motes: tiny gold sparks that twinkle as they rise.
      ctx.globalCompositeOperation = "lighter";
      const k = canvas.width / W;
      for (const m of motes) {
        m.x += (m.vx + Math.sin(t * 0.8 + m.phase) * 4) * dt;
        m.y += m.vy * dt;
        if (m.y < -8) Object.assign(m, makeMote(false), { y: H + 4 });
        const a = 0.35 + 0.35 * Math.sin(t * 2.4 + m.phase * 5);
        ctx.fillStyle = `rgba(255, 205, 120, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(m.x * k, m.y * k, m.r * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    resize();
    draw(0, 0);

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => { resize(); draw(performance.now() / 1000, 0); }, 120);
    });

    const reduced = typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof window.requestAnimationFrame !== "function") return;

    let last = 0;
    function tick(now) {
      if (now - last >= FRAME_MS && !document.hidden) {
        const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
        last = now;
        draw(now / 1000, dt);
      }
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
