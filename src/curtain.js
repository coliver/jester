"use strict";

// The theatre curtain that closes on a won round and opens on Backstage.
//
// Each half is a small cloth simulation (Verlet points, distance constraints) drawn in WebGL as
// velvet on the deformed mesh. The top row hangs from a rail on sliding carriers, as on a real
// stage track: the leading carrier is pulled across, and each carrier behind it is picked up once
// the fabric between them is taut. The cloth is wider than the rail span, so the spare width
// has nowhere to go but into the depth, as pleats; the carriers' spacing sets how deep they are,
// so the folds gather and bunch as the halves part, and flatten as they close.
//
// Browser only: it needs WebGL. With none (or with reduced motion) it reports itself unsupported
// and the caller skips the curtain.
const Curtain = (function () {
  const COLS = 14; // carriers per half
  const ROWS = 26;
  const SUB_X = 4; // the drawn mesh subdivides the simulated one, so folds are round
  const SUB_Y = 2;
  const STEP = 1 / 60;
  const ITERATIONS = 14;
  const GATHER = 1.55; // fabric width over rail span, when shut
  const STACK = 0.16; // carrier spacing when stacked, as a fraction of the fabric's own
  const MAX_DPR = 1.5;

  const CLOSE = 2.6; // seconds, the same names as the timings the caller schedules around
  const HOLD = 0.8;
  const OPEN = 2.8;
  const FADE = 0.6;
  const LEAD = CLOSE + HOLD + 0.9; // when the ledger may begin: the curtain is on its way open

  let canvas = null;
  let gl = null;
  let prog = null;
  let broken = false;
  let run = null; // the sequence in progress

  const VERT = [
    "precision highp float;",
    "attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv;",
    "uniform vec2 uView; uniform float uZScale;",
    "varying vec3 vPos; varying vec3 vNor; varying vec2 vUv;",
    "void main() {",
    "  vPos = aPos; vNor = aNor; vUv = aUv;",
    "  gl_Position = vec4(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0, -aPos.z / uZScale, 1.0);",
    "}",
  ].join("\n");

  const FRAG = [
    "precision highp float;",
    "uniform vec2 uView; uniform float uZBase;",
    "varying vec3 vPos; varying vec3 vNor; varying vec2 vUv;",
    "void main() {",
    "  vec3 n = normalize(vNor);",
    "  if (n.z < 0.0) n = -n;",
    // Light from above and in front, like the house lights over the stalls.
    "  vec3 l = normalize(vec3(0.0, -0.55, 0.85));",
    "  float ndl = max(dot(n, l), 0.0);",
    "  float fold = clamp((vPos.z - uZBase) / (uView.x * 0.03), -1.0, 1.0);",
    "  float ao = mix(0.32, 1.0, smoothstep(-1.0, 0.7, fold));",
    // Velvet is dark head-on and glows at the grazing edges of each fold.
    "  float graze = pow(1.0 - n.z, 2.2);",
    "  vec3 wine = vec3(0.40, 0.035, 0.085);",
    "  vec3 sheen = vec3(0.95, 0.30, 0.38);",
    "  vec3 col = wine * (0.22 + 0.95 * pow(ndl, 0.85)) + sheen * graze * 0.55;",
    "  col *= ao;",
    // Fine vertical pile in the weave.
    "  col *= 0.94 + 0.06 * sin(vPos.x * 1.7 + vPos.y * 0.015);",
    // A spotlight pooled at the centre of the stage, a vignette round the edges, and shadow
    // under the valance and over the floor.
    "  vec2 q = vPos.xy / uView - vec2(0.5, 0.35);",
    "  float spot = exp(-dot(q * vec2(1.6, 1.1), q * vec2(1.6, 1.1)) * 2.4);",
    "  col *= 0.5 + 0.8 * spot;",
    "  col *= mix(0.55, 1.0, smoothstep(0.0, 0.14, vUv.y));",
    "  col *= mix(0.7, 1.0, smoothstep(1.0, 0.8, vUv.y));",
    "  col *= mix(0.4, 1.0, smoothstep(1.0, 0.96, vUv.x));",
    // The hem: a twisted gilt rope sewn along the bottom, lit by the same folds.
    "  float b = (vUv.y - 0.967) / 0.033;",
    "  if (b > 0.0) {",
    "    float cyl = sin(clamp(b, 0.0, 1.0) * 3.14159);",
    "    float twist = 0.5 + 0.5 * sin(vPos.x * 0.55 + b * 2.6);",
    "    vec3 gold = mix(vec3(0.46, 0.31, 0.09), vec3(0.95, 0.80, 0.44), twist) * (0.35 + 0.75 * cyl);",
    "    gold *= 0.45 + 0.7 * pow(ndl, 0.7);",
    "    col = mix(col, gold * (0.6 + 0.6 * spot), smoothstep(0.0, 0.08, b));",
    "  }",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function reduced() {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function supported() {
    if (broken || reduced() || typeof document === "undefined") return false;
    if (gl) return true;
    try {
      canvas = document.createElement("canvas");
      canvas.id = "curtain";
      gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
      if (!gl) throw new Error("no webgl");
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      return true;
    } catch (e) {
      console.warn("curtain unavailable:", e.message);
      broken = true;
      gl = null;
      return false;
    }
  }

  // --- One half of the curtain -----------------------------------------------------------

  // x runs from the half's outer edge toward the middle (the right half is mirrored when drawn),
  // y down, z toward the audience.
  function makeHalf(W, H, side) {
    const n = COLS * ROWS;
    const outer = -0.02 * W;
    const closedLead = W / 2 + 0.07 * W;
    const span = closedLead - outer;
    const smax = span / (COLS - 1);
    const smin = smax * GATHER * STACK;
    const L = smax * GATHER; // the fabric's own width between neighbouring carriers
    const top = -0.04 * H;
    const rowH = (H - top) / (ROWS - 1);
    const h = {
      side, W, H, outer, smin, smax, L, top, rowH,
      openLead: outer + (COLS - 1) * smin,
      closedLead,
      zBase: (side === 0 ? 1 : -1) * 0.03 * W,
      x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
      px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
      jitter: Float32Array.from({ length: COLS }, () => 0.82 + Math.random() * 0.36),
      railX: new Float32Array(COLS), railZ: new Float32Array(COLS), amp: new Float32Array(COLS),
      diag: Math.hypot(L, rowH),
      time: 0,
    };
    h.lead = h.openLead;
    pinRail(h);
    for (let j = 0; j < ROWS; j++) {
      for (let k = 0; k < COLS; k++) {
        const i = j * COLS + k;
        h.x[i] = h.px[i] = h.railX[k];
        h.y[i] = h.py[i] = top + j * rowH;
        h.z[i] = h.pz[i] = targetZ(h, k, j);
      }
    }
    for (let s = 0; s < 150; s++) step(h);
    return h;
  }

  function targetZ(h, k, j) {
    return h.zBase + (k % 2 ? -1 : 1) * h.amp[k] * (1 - 0.12 * j / (ROWS - 1));
  }

  // Where the carriers sit for the leading one at h.lead, and how deep each pleat is there.
  function pinRail(h) {
    const x = h.railX;
    x[COLS - 1] = h.lead;
    for (let k = COLS - 2; k >= 0; k--) x[k] = Math.max(h.outer + k * h.smin, x[k + 1] - h.smax);
    for (let k = 0; k < COLS; k++) {
      const a = k > 0 ? x[k] - x[k - 1] : x[1] - x[0];
      const b = k < COLS - 1 ? x[k + 1] - x[k] : a;
      const s = Math.min(h.L, (a + b) / 2);
      h.amp[k] = 0.5 * Math.sqrt(Math.max(0, h.L * h.L - s * s)) * h.jitter[k];
      h.railZ[k] = targetZ(h, k, 0);
    }
  }

  function pull(h, a, b, rest, stiff) {
    const dx = h.x[b] - h.x[a], dy = h.y[b] - h.y[a], dz = h.z[b] - h.z[a];
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    const wa = a < COLS ? 0 : 1, wb = b < COLS ? 0 : 1;
    const w = wa + wb;
    if (!w) return;
    const k = (d - rest) / d * stiff / w;
    h.x[a] += dx * k * wa; h.y[a] += dy * k * wa; h.z[a] += dz * k * wa;
    h.x[b] -= dx * k * wb; h.y[b] -= dy * k * wb; h.z[b] -= dz * k * wb;
  }

  function step(h) {
    h.time += STEP;
    pinRail(h);
    const g = 2600 * STEP * STEP;
    for (let j = 1; j < ROWS; j++) {
      for (let k = 0; k < COLS; k++) {
        const i = j * COLS + k;
        const vx = (h.x[i] - h.px[i]) * 0.985, vy = (h.y[i] - h.py[i]) * 0.985, vz = (h.z[i] - h.pz[i]) * 0.985;
        h.px[i] = h.x[i]; h.py[i] = h.y[i]; h.pz[i] = h.z[i];
        // The pleats remember their depth (they are sewn), and the draught stirs them a little.
        const stir = Math.sin(h.time * 1.7 + k * 1.3 + j * 0.21) * 9 * STEP * STEP * 60;
        h.x[i] += vx + (h.railX[k] - h.x[i]) * 0.045; // the weight of the hem drags, but the pleats are sewn to the track
        h.y[i] += vy + g;
        h.z[i] += vz + (targetZ(h, k, j) - h.z[i]) * 0.035 + stir;
      }
    }
    for (let k = 0; k < COLS; k++) {
      h.x[k] = h.px[k] = h.railX[k];
      h.y[k] = h.py[k] = h.top;
      h.z[k] = h.pz[k] = h.railZ[k];
    }
    for (let it = 0; it < ITERATIONS; it++) {
      for (let j = 0; j < ROWS; j++) {
        for (let k = 0; k < COLS; k++) {
          const i = j * COLS + k;
          if (k < COLS - 1) pull(h, i, i + 1, h.L, 1);
          if (j < ROWS - 1) {
            pull(h, i, i + COLS, h.rowH, 1);
            if (k < COLS - 1) pull(h, i, i + COLS + 1, h.diag, 0.6);
            if (k > 0) pull(h, i, i + COLS - 1, h.diag, 0.6);
          }
          if (j < ROWS - 2) pull(h, i, i + 2 * COLS, 2 * h.rowH, 0.15);
        }
      }
    }
  }

  // Catmull-Rom through four points, t in [0, 1] between b and c.
  function spline(a, b, c, d, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
  }

  const FX = (COLS - 1) * SUB_X + 1;
  const FY = (ROWS - 1) * SUB_Y + 1;
  const FLOATS = 8;

  function edgeWander(h, r, f) {
    const w = Math.pow(f / (FX - 1), 8);
    return w * (4.5 * Math.sin(r * 0.17 + h.side * 2 + h.time * 0.8) + 2.5 * Math.sin(r * 0.43 + h.time * 1.3)) * (h.W / 1200);
  }

  // Draws the cloth's mesh into `out`: position, normal, uv per vertex.
  const rowBuf = new Float32Array(FX * ROWS * 3);
  function tessellate(h, out) {
    const clampK = (k) => Math.max(0, Math.min(COLS - 1, k));
    const clampJ = (j) => Math.max(0, Math.min(ROWS - 1, j));
    const mx = (v) => (h.side === 0 ? v : h.W - v);
    for (let j = 0; j < ROWS; j++) {
      for (let f = 0; f < FX; f++) {
        const k = Math.min(COLS - 2, Math.floor(f / SUB_X)), t = (f - k * SUB_X) / SUB_X;
        const o = (j * FX + f) * 3;
        for (let c = 0; c < 3; c++) {
          const src = c === 0 ? h.x : c === 1 ? h.y : h.z;
          const at = (kk) => src[j * COLS + clampK(kk)];
          rowBuf[o + c] = spline(at(k - 1), at(k), at(k + 1), at(k + 2), t);
        }
      }
    }
    for (let r = 0; r < FY; r++) {
      const j = Math.min(ROWS - 2, Math.floor(r / SUB_Y)), t = (r - j * SUB_Y) / SUB_Y;
      for (let f = 0; f < FX; f++) {
        const o = (r * FX + f) * FLOATS;
        for (let c = 0; c < 3; c++) {
          const at = (jj) => rowBuf[(clampJ(jj) * FX + f) * 3 + c];
          const v = spline(at(j - 1), at(j), at(j + 1), at(j + 2), t);
          // The leading edge is never ruled straight: it wanders a little as it hangs.
          out[o + c] = c === 0 ? mx(v + edgeWander(h, r, f)) : v;
        }
        out[o + 6] = f / (FX - 1);
        out[o + 7] = r / (FY - 1);
      }
    }
    for (let r = 0; r < FY; r++) {
      for (let f = 0; f < FX; f++) {
        const o = (r * FX + f) * FLOATS;
        const e = (rr, ff) => (Math.min(FY - 1, Math.max(0, rr)) * FX + Math.min(FX - 1, Math.max(0, ff))) * FLOATS;
        const a = e(r, f - 1), b = e(r, f + 1), c = e(r - 1, f), d = e(r + 1, f);
        const ux = out[b] - out[a], uy = out[b + 1] - out[a + 1], uz = out[b + 2] - out[a + 2];
        const vx = out[d] - out[c], vy = out[d + 1] - out[c + 1], vz = out[d + 2] - out[c + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        out[o + 3] = nx / len; out[o + 4] = ny / len; out[o + 5] = nz / len;
      }
    }
  }

  // --- Sequence ---------------------------------------------------------------------------

  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10)); // smootherstep

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    return { W, H };
  }

  function buildGl(r) {
    const idx = [];
    for (let y = 0; y < FY - 1; y++) {
      for (let x = 0; x < FX - 1; x++) {
        const a = y * FX + x, b = a + 1, c = a + FX, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    r.index = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    r.indexCount = idx.length;
    r.verts = r.halves.map(() => new Float32Array(FX * FY * FLOATS));
    r.vbos = r.halves.map(() => gl.createBuffer());
  }

  function draw(r) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.useProgram(prog);
    gl.uniform2f(gl.getUniformLocation(prog, "uView"), r.W, r.H);
    gl.uniform1f(gl.getUniformLocation(prog, "uZScale"), r.W * 0.12);
    const stride = FLOATS * 4;
    const loc = (name) => gl.getAttribLocation(prog, name);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.index);
    r.halves.forEach((h, n) => {
      tessellate(h, r.verts[n]);
      gl.uniform1f(gl.getUniformLocation(prog, "uZBase"), h.zBase);
      gl.bindBuffer(gl.ARRAY_BUFFER, r.vbos[n]);
      gl.bufferData(gl.ARRAY_BUFFER, r.verts[n], gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc("aPos"));
      gl.vertexAttribPointer(loc("aPos"), 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(loc("aNor"));
      gl.vertexAttribPointer(loc("aNor"), 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(loc("aUv"));
      gl.vertexAttribPointer(loc("aUv"), 2, gl.FLOAT, false, stride, 24);
      gl.drawElements(gl.TRIANGLES, r.indexCount, gl.UNSIGNED_SHORT, 0);
    });
  }

  function frame(now) {
    const r = run;
    if (!r) return;
    r.raf = window.requestAnimationFrame(frame);
    if (r.start === null) r.start = now;
    // The sequence follows the clock, not the frame count, so the ledger can be timed against
    // it; the cloth takes a few fixed steps to catch up when frames are slow.
    r.t = (now - r.start) / 1000;
    r.halves.forEach((h, n) => {
      // The right half trails by a breath, so the two never move as one mirrored sheet.
      const t = r.t - n * 0.07;
      const open = r.t < CLOSE + HOLD ? 1 - ease(t / CLOSE) : ease((t - CLOSE - HOLD) / OPEN);
      h.lead = h.openLead + (h.closedLead - h.openLead) * (1 - open);
    });
    r.sim = Math.max(r.sim, r.t - 8 * STEP);
    while (r.sim + STEP <= r.t) {
      r.sim += STEP;
      r.halves.forEach(step);
    }
    if (!r.shut && r.t >= CLOSE + 0.35) { r.shut = true; r.onShut(); }
    if (r.t >= CLOSE + HOLD) canvas.style.pointerEvents = "none";
    draw(r);
    const gone = r.t - CLOSE - HOLD - OPEN;
    canvas.style.opacity = gone > 0 ? String(Math.max(0, 1 - gone / FADE)) : "1";
    if (gone > FADE) finish(true);
  }

  function finish(complete) {
    const r = run;
    if (!r) return;
    run = null;
    window.cancelAnimationFrame(r.raf);
    canvas.style.display = "none";
    gl.deleteBuffer(r.index);
    r.vbos.forEach((b) => gl.deleteBuffer(b));
    if (!r.shut) r.onShut();
    if (complete) r.onDone();
  }

  // Closes the curtain, calls onShut once it is drawn across (a good moment to swap the scene
  // behind it), then opens it. Returns false, calling nothing, when there is no curtain to show.
  function play({ onShut = () => {}, onDone = () => {} } = {}) {
    if (!supported()) return false;
    finish(false);
    const { W, H } = resize();
    const r = {
      W, H, t: 0, sim: 0, start: null, shut: false, onShut, onDone, raf: 0,
      halves: [makeHalf(W, H, 0), makeHalf(W, H, 1)],
    };
    buildGl(r);
    run = r;
    canvas.style.display = "block";
    canvas.style.opacity = "1";
    canvas.style.pointerEvents = "auto";
    if (!canvas.parentNode) document.body.appendChild(canvas);
    r.raf = window.requestAnimationFrame(frame);
    return true;
  }

  function cancel() { finish(false); }

  return { supported, play, cancel, LEAD, CLOSE, HOLD, OPEN };
})();
