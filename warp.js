"use strict";

// Acidwarp-style table background: one indexed-color image is generated once,
// then animated purely by rotating its 256-entry palette (the original's trick,
// so a frame costs one palette lookup per pixel and nothing is redrawn).
// Purely decorative: if there is no canvas (jsdom) or the user prefers reduced
// motion, it paints a single still frame or does nothing.
(function () {
  const W = 320;
  const H = 200;
  const TAU = Math.PI * 2;
  const FRAME_MS = 1000 / 24;
  const CYCLE_PER_SEC = 14; // palette steps per second

  // Each pattern maps a pixel to a palette index in 0..255 (wrapping is fine).
  const PATTERNS = [
    function rings(x, y) {
      const dx = x - W / 2, dy = y - H / 2;
      return Math.sqrt(dx * dx + dy * dy) * 3;
    },
    function spiral(x, y) {
      const dx = x - W / 2, dy = y - H / 2;
      return Math.atan2(dy, dx) / TAU * 512 + Math.sqrt(dx * dx + dy * dy) * 2;
    },
    function waves(x, y) {
      return 128 + 60 * Math.sin(x / 23) + 60 * Math.sin(y / 17) + 40 * Math.sin((x + y) / 31);
    },
    function plasma(x, y) {
      const dx = x - W / 2, dy = y - H / 2;
      return 128 + 50 * Math.sin(x / 19) + 50 * Math.sin(y / 13) +
        50 * Math.sin(Math.sqrt(dx * dx + dy * dy) / 11) + 40 * Math.sin((x - y) / 27);
    },
    function checkerWarp(x, y) {
      return (Math.sin(x / 14 + Math.sin(y / 20) * 3) + Math.cos(y / 14 + Math.cos(x / 25) * 3)) * 64 + 128;
    },
  ];

  // Smooth looping palette: a few random jewel-tone anchors, linearly blended
  // around the ring so index 255 meets index 0 without a visible seam.
  function makePalette() {
    const anchors = 5 + Math.floor(Math.random() * 3);
    const hue0 = Math.random() * 360;
    const stops = [];
    for (let i = 0; i < anchors; i++) {
      stops.push(hsv((hue0 + i * (360 / anchors) + Math.random() * 40) % 360, 0.65 + Math.random() * 0.3, 0.55 + Math.random() * 0.45));
    }
    const out = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 256 * anchors;
      const a = stops[Math.floor(t) % anchors];
      const b = stops[(Math.floor(t) + 1) % anchors];
      const f = t - Math.floor(t);
      const r = a[0] + (b[0] - a[0]) * f;
      const g = a[1] + (b[1] - a[1]) * f;
      const bl = a[2] + (b[2] - a[2]) * f;
      out[i] = (255 << 24) | (bl << 16) | (g << 8) | r; // little-endian RGBA
    }
    return out;
  }

  function hsv(h, s, v) {
    const c = v * s, hp = h / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = v - c;
    const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hp) % 6];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function makeImage() {
    const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    const img = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        img[y * W + x] = Math.floor(pattern(x, y)) & 255;
      }
    }
    return img;
  }

  function start() {
    const canvas = document.getElementById("warp");
    if (!canvas || typeof canvas.getContext !== "function") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = W;
    canvas.height = H;
    const frame = ctx.createImageData(W, H);
    const pixels = new Uint32Array(frame.data.buffer);
    const image = makeImage();
    const palette = makePalette();

    function draw(offset) {
      for (let i = 0; i < image.length; i++) {
        pixels[i] = palette[(image[i] + offset) & 255];
      }
      ctx.putImageData(frame, 0, 0);
    }

    draw(0);
    const reduced = typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof window.requestAnimationFrame !== "function") return;

    let last = 0;
    function tick(now) {
      if (now - last >= FRAME_MS && !document.hidden) {
        last = now;
        draw(Math.floor(now / 1000 * CYCLE_PER_SEC));
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
