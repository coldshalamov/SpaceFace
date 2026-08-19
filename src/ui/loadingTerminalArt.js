/**
 * SpaceFace · Loading Terminal — continuous signal-field artwork engine
 *
 * One engine, two hosts. `createEngineGL` renders a full-resolution WebGL2
 * FEEDBACK simulation displayed through a character screen; `createEngine` is
 * the self-contained 2D fallback (same source is stringified into the Web
 * Worker and called directly on the main thread). Both hosts get the full
 * animation.
 *
 * Direction (2026-08): no mascots, no scripted tableaus, nothing static.
 * The picture is a single continuous simulation — every frame is derived from
 * the previous frame (ping-pong feedback) through a curl-noise flow field,
 * slow zoom / rotation / kaleidoscope folding, phosphor decay and hue drift,
 * with new energy injected by choreographed emitters. Five phases on a 32.5s
 * loop (GENESIS → CURRENTS → BLOOM → TEMPEST → SINGULARITY) cross-blend; the
 * character-cell grid is the DISPLAY TECHNOLOGY, never the pixel budget.
 *
 * Lifecycle law (pinned by test/loading-boot-resilience.test.mjs): the artwork
 * is decoration. It must never throw out of boot, and losing it may only cost
 * the animation — never the game.
 */

// Phase timing shared with the DOM telemetry below.
const ACT_COUNT = 5;
const ACT_SECONDS = 6.5;
const LOOP_SECONDS = ACT_COUNT * ACT_SECONDS;

/**
 * The 2D fallback engine. `host` abstracts the host thread:
 *   post(msg)  — send a message out (worker: self.postMessage, main: no-op)
 *   raf(fn)    — schedule a frame callback; returns a cancel handle
 *   cancel(id) — cancel it
 *   document   — main thread only, for canvas element creation
 */
function createEngine(host) {
  'use strict';

  const ACTS = 5;
  const ACT_LEN = 6.5;
  const LOOP_LEN = ACTS * ACT_LEN;

  // ─────────────────────────────────────────────────────────────────────────
  // Grid + buffers
  // ─────────────────────────────────────────────────────────────────────────
  const COLS = 120;          // character columns
  const ROWS = 60;           // character rows
  const SW = 120;            // subpixel width  (= COLS)
  const SH = 120;            // subpixel height (= ROWS * 2)
  const N_SUB = SW * SH;

  const lum = new Float32Array(N_SUB);     // scene luminance (may exceed 1 for bloom)
  const tint = new Uint8Array(N_SUB);      // 0 = main LUT, 1 = accent LUT
  const decay = new Float32Array(N_SUB);   // phosphor persistence
  const bloomA = new Float32Array(N_SUB);
  const bloomB = new Float32Array(N_SUB);
  const emittedKey = new Int32Array(COLS * ROWS).fill(-2);

  // ─────────────────────────────────────────────────────────────────────────
  // Math helpers
  // ─────────────────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function hash1(n) {
    n = Math.sin(n) * 43758.5453123;
    return n - Math.floor(n);
  }
  function hash2(x, y) { return hash1(x * 127.1 + y * 311.7); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(
      lerp(hash2(xi, yi), hash2(xi + 1, yi), u),
      lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Palettes: per phase, main + accent, 32 stops each (anchors interpolate)
  // ─────────────────────────────────────────────────────────────────────────
  function hex(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function buildLUT(anchors) {
    const rgb = anchors.map(hex);
    const lut = [];
    for (let i = 0; i < 32; i++) {
      const t = i / 31 * (rgb.length - 1);
      const i0 = Math.floor(t), i1 = Math.min(rgb.length - 1, i0 + 1);
      const f = t - i0;
      lut.push([0, 1, 2].map(c => Math.round(lerp(rgb[i0][c], rgb[i1][c], f))));
    }
    return lut;
  }
  const PALETTES = [
    { // 0 · GENESIS — deep teal condensation
      main: buildLUT(['#020c0e', '#052226', '#0a4a4e', '#12827e', '#2cc4ae', '#b8fff0']),
      accent: buildLUT(['#0a0714', '#241a3e', '#4b3a72', '#7d68ad', '#b3a3e0', '#efeaff']),
      bg: '#030809',
    },
    { // 1 · CURRENTS — emerald flow
      main: buildLUT(['#03100b', '#08321f', '#0f6b3c', '#1cae5c', '#54eca0', '#d6ffe4']),
      accent: buildLUT(['#061019', '#123452', '#1f6a8e', '#39a8c4', '#7fe0ea', '#e0fbff']),
      bg: '#040a08',
    },
    { // 2 · BLOOM — jewel symmetry
      main: buildLUT(['#0d0616', '#2c1440', '#5c2a6e', '#a0489a', '#e08ac2', '#ffe9f6']),
      accent: buildLUT(['#160d02', '#48300a', '#8a6a14', '#cfa51e', '#ffd873', '#fff7dc']),
      bg: '#0a0510',
    },
    { // 3 · TEMPEST — fire against ice
      main: buildLUT(['#120503', '#401505', '#8a3a0c', '#d97a1e', '#ffc35e', '#fff0d0']),
      accent: buildLUT(['#040a18', '#123058', '#2a5f9a', '#4f9ad4', '#93d4f2', '#e4f6ff']),
      bg: '#0c0503',
    },
    { // 4 · SINGULARITY — indigo collapse
      main: buildLUT(['#050512', '#141244', '#2c2a7e', '#5a54b8', '#9a92e8', '#eae6ff']),
      accent: buildLUT(['#0d0310', '#3a0f3e', '#78216e', '#b8489a', '#eb8cc8', '#ffe4f2']),
      bg: '#050510',
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // Pixel API — subpixel writes into (lum, tint)
  // ─────────────────────────────────────────────────────────────────────────
  function px(x, y, l, t) {
    x |= 0; y |= 0;
    if (x < 0 || x >= SW || y < 0 || y >= SH) return;
    const i = y * SW + x;
    if (l > lum[i]) { lum[i] = l; if (t !== undefined) tint[i] = t; }
  }
  function addPx(x, y, l, t) {
    x |= 0; y |= 0;
    if (x < 0 || x >= SW || y < 0 || y >= SH) return;
    lum[y * SW + x] += l;
    if (t !== undefined) tint[y * SW + x] = t;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Engine state
  // ─────────────────────────────────────────────────────────────────────────
  let ctx = null, waveCtx = null;
  let W = 640, H = 380, WW = 200, WH = 48;
  let running = false, rafId = null;
  let T = 0;
  let lastNow = 0;
  let progress = 0.05, progressShown = 0.05;
  let gx = 0, gy = 0, gxT = 0, gyT = 0, lastPointerAt = -10;
  let reduced = false;
  let energy = 0.3;
  const energyHist = new Float32Array(64).fill(0.1); let energyIdx = 0;
  let frameCostAvg = 10;
  let skipScene = false;
  let frameCounter = 0;
  let labAct = -1;
  let labFreeze = false;

  // Interleaved gradient noise (Jimenez 2014) — spectrally quiet dither that
  // reads as film grain instead of Bayer crosshatch. Animated per frame.
  function ign(x, y, frame) {
    const f = 0.06711056 * x + 0.00583715 * y + 0.006 * frame;
    const n = 52.9829189 * (f - Math.floor(f));
    return n - Math.floor(n);
  }

  // Density ramp for sparse cells (ASCII texture identity)
  const DENSITY_L = [0.01, 0.02, 0.034, 0.05, 0.07, 0.095, 0.125, 0.16, 0.205, 0.26, 0.33, 0.42, 0.54, 0.68];
  const ATLAS_CHARS = ['.', ',', ':', ';', '-', '+', '=', '*', 'x', 'X', '#', '%', '@', 'M'];

  // ─────────────────────────────────────────────────────────────────────────
  // FLOW FIELD — the whole picture. A swarm of emitters advected by a
  // curl-noise field whose character (scale, drift, swirl, attractor,
  // symmetry) is choreographed per phase. Trails come free from the phosphor
  // decay buffer; nothing here is ever static.
  // ─────────────────────────────────────────────────────────────────────────
  const FLOWP = [
    // speed fscale drift  swirl attract bright sym  energy
    { sp: 14, fs: 0.055, dr: 0.10, sw: 0.10, at: 0.05, br: 0.30, sym: 0, en: 0.22 },
    { sp: 30, fs: 0.105, dr: 0.24, sw: 0.30, at: 0.00, br: 0.42, sym: 0, en: 0.38 },
    { sp: 22, fs: 0.160, dr: 0.16, sw: 0.85, at: 0.12, br: 0.50, sym: 1, en: 0.52 },
    { sp: 58, fs: 0.290, dr: 0.55, sw: -0.4, at: -0.1, br: 0.66, sym: 0, en: 0.85 },
    { sp: 26, fs: 0.090, dr: 0.05, sw: 1.30, at: 0.65, br: 0.72, sym: 0, en: 0.62 },
  ];
  const PCOUNT = 170;
  const px_ = new Float32Array(PCOUNT), py_ = new Float32Array(PCOUNT);
  const vx_ = new Float32Array(PCOUNT), vy_ = new Float32Array(PCOUNT);
  const age_ = new Float32Array(PCOUNT), life_ = new Float32Array(PCOUNT);
  const tt_ = new Uint8Array(PCOUNT);
  let spawnedPhase = -1;

  function spawnPhase(pi) {
    for (let i = 0; i < PCOUNT; i++) {
      const s = i * 17.13 + pi * 7.77;
      px_[i] = hash1(s + 0.11) * SW;
      py_[i] = hash1(s + 0.53) * SH;
      vx_[i] = 0; vy_[i] = 0;
      age_[i] = hash1(s + 0.97) * 5;
      life_[i] = 3.5 + hash1(s + 1.71) * 5;
      tt_[i] = hash1(s + 2.31) > 0.7 ? 1 : 0;
    }
  }

  function respawn(i, pi) {
    const s = i * 13.7 + pi * 3.1 + Math.floor(T * 7.7) * 0.917;
    px_[i] = hash1(s) * SW;
    py_[i] = hash1(s + 0.37) * SH;
    vx_[i] = 0; vy_[i] = 0;
    age_[i] = 0;
    life_[i] = 3.5 + hash1(s + 0.71) * 5;
  }

  function stamp(x, y, l, t, soft) {
    addPx(x, y, l, t);
    if (soft) {
      addPx(x + 1, y, l * 0.55, t); addPx(x - 1, y, l * 0.55, t);
      addPx(x, y + 1, l * 0.55, t); addPx(x, y - 1, l * 0.55, t);
    }
  }

  function stepFlow(dt) {
    const tt = T % LOOP_LEN;
    const pi = labAct >= 0 ? labAct : Math.floor(tt / ACT_LEN) % ACTS;
    const u = (tt % ACT_LEN) / ACT_LEN;
    if (pi !== spawnedPhase) { spawnPhase(pi); spawnedPhase = pi; }
    const P = FLOWP[pi];
    const cx = SW * 0.5 + gx * 7;
    const cy = SH * 0.5 + gy * 7;
    const mScale = reduced ? 0.35 : 1;

    // breathing depth floor — evolves with T, never a flat void
    for (let y = 0; y < SH; y += 2) {
      for (let x = 0; x < SW; x += 2) {
        const n = vnoise(x * 0.03 + 31, y * 0.03 + T * P.dr * 0.3) * 0.65
                + vnoise(x * 0.085, y * 0.085 + 40 + T * P.dr * 0.5) * 0.35;
        if (n > 0.55) addPx(x, y, (n - 0.55) * 0.09, n > 0.8 ? 1 : 0);
      }
    }

    const e = 0.7;
    for (let i = 0; i < PCOUNT; i++) {
      // curl of the same value-noise the background breathes with
      const nx = px_[i] * P.fs, ny = py_[i] * P.fs + T * P.dr;
      const n1 = vnoise(nx + e, ny), n2 = vnoise(nx - e, ny);
      const n3 = vnoise(nx, ny + e), n4 = vnoise(nx, ny - e);
      let ax = (n1 - n2) / (2 * e), ay = -(n3 - n4) / (2 * e);
      const dx = cx - px_[i], dy = cy - py_[i];
      const dl = Math.hypot(dx, dy) || 1;
      ax += (-dy / dl) * P.sw * 2.2 + (dx / dl) * P.at * 2.2;
      ay += (dx / dl) * P.sw * 2.2 + (dy / dl) * P.at * 2.2;
      const al = Math.hypot(ax, ay) || 1;
      vx_[i] += ((ax / al) * P.sp * mScale - vx_[i]) * 0.09;
      vy_[i] += ((ay / al) * P.sp * mScale - vy_[i]) * 0.09;
      px_[i] += vx_[i] * dt * 60 * mScale;
      py_[i] += vy_[i] * dt * 60 * mScale;
      age_[i] += dt;
      if (px_[i] < 0) px_[i] += SW; else if (px_[i] >= SW) px_[i] -= SW;
      if (py_[i] < 0) py_[i] += SH; else if (py_[i] >= SH) py_[i] -= SH;
      if (age_[i] > life_[i]) { respawn(i, pi); continue; }
      const fade = Math.min(1, age_[i] * 2.5) * Math.min(1, (life_[i] - age_[i]) * 1.5);
      const pulse = 0.55 + 0.45 * Math.sin(T * 2.2 + i * 1.9);
      const b = P.br * fade * pulse;
      stamp(px_[i], py_[i], b, tt_[i], true);
      // occasional hot head — feeds bloom + anamorphic streak
      if (hash1(i * 31.7 + Math.floor(T * 3)) > 0.93) px(px_[i], py_[i], b * 3.2, tt_[i]);
      // kaleidoscope echo in BLOOM: every emitter also stamps its rotations
      if (P.sym) {
        const rx = px_[i] - cx, ry = py_[i] - cy;
        for (let k = 1; k < 6; k++) {
          const a = k * Math.PI / 3 + T * 0.12;
          const cA = Math.cos(a), sA = Math.sin(a);
          stamp(cx + rx * cA - ry * sA, cy + rx * sA + ry * cA, b * 0.6, tt_[i], false);
        }
      }
    }
    // SINGULARITY: matter pouring into the core
    if (pi === 4) {
      const collapse = 0.4 + u * 0.6;
      for (let s = 0; s < 26; s++) {
        const a = hash1(s * 3.3 + Math.floor(T * 9) * 0.71) * Math.PI * 2;
        const r = (1 - (T * 0.9 + hash1(s) * 2) % 1) * 34 * collapse + 4;
        stamp(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92, 0.5 * collapse, s % 3 === 0 ? 1 : 0, false);
      }
      px(cx, cy, 1.6 + Math.sin(T * 17) * 0.4, 0);
    }
    // TEMPEST: jagged discharge, re-struck every few frames
    if (pi === 3 && !reduced) {
      const seed = Math.floor(T * 7);
      let bx = cx + (hash1(seed * 3.7) - 0.5) * 60, by = 4;
      while (by < SH - 4) {
        const nx2 = bx + (hash1(seed + by * 3.1) - 0.5) * 14;
        const ny2 = by + 3 + hash1(seed + by) * 4;
        addPx(bx, by, 1.5, 1); addPx(bx + 1, by, 1.0, 1);
        addPx(Math.round((bx + nx2) / 2), Math.round((by + ny2) / 2), 0.5, 1);
        bx = nx2; by = ny2;
      }
      if (hash1(seed * 1.9) > 0.55) {
        for (let y = 0; y < SH; y += 2) for (let x = 0; x < SW; x += 2) addPx(x, y, 0.06, 0);
      }
    }
    energy = P.en + Math.max(0, Math.sin(T * 3.1)) * 0.12;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Frame composition
  // ─────────────────────────────────────────────────────────────────────────
  function actIndexAt(tt) { return labAct >= 0 ? labAct : Math.floor(tt / ACT_LEN) % ACTS; }

  function renderPost() {
    // bloom: threshold + separable blur, add back
    const TH = 0.95;
    for (let i = 0; i < N_SUB; i++) bloomA[i] = lum[i] > TH ? lum[i] - TH : 0;
    bloomB.fill(0);
    for (let y = 0; y < SH; y++) {
      const row = y * SW;
      for (let x = 0; x < SW; x++) {
        let s = bloomA[row + clamp(x - 2, 0, SW - 1)] + bloomA[row + clamp(x - 1, 0, SW - 1)]
              + bloomA[row + x] + bloomA[row + clamp(x + 1, 0, SW - 1)] + bloomA[row + clamp(x + 2, 0, SW - 1)];
        bloomB[row + x] = s / 5;
      }
    }
    for (let x = 0; x < SW; x++) {
      for (let y = 0; y < SH; y++) {
        const s = bloomB[clamp(y - 2, 0, SH - 1) * SW + x] + bloomB[clamp(y - 1, 0, SH - 1) * SW + x]
                + bloomB[y * SW + x] + bloomB[clamp(y + 1, 0, SH - 1) * SW + x] + bloomB[clamp(y + 2, 0, SH - 1) * SW + x];
        lum[y * SW + x] += (s / 5) * 0.5;
      }
    }
    // anamorphic horizontal flare: very bright subpixels smear laterally —
    // the cinematic lens streak signature.
    bloomA.fill(0);
    for (let y = 0; y < SH; y++) {
      const row = y * SW;
      for (let x = 0; x < SW; x++) {
        const l = lum[row + x];
        if (l > 1.12) {
          const amt = 0.16 * (l - 1.12);
          for (let d = -8; d <= 8; d++) {
            const xx = x + d;
            if (xx < 0 || xx >= SW) continue;
            bloomA[row + xx] += amt * Math.exp(-Math.abs(d) / 3);
          }
        }
      }
    }
    for (let i = 0; i < N_SUB; i++) if (bloomA[i] > 0) lum[i] += Math.min(bloomA[i], 0.8);
    // phosphor decay
    const decayK = Math.exp(-7.5 / 60);
    for (let i = 0; i < N_SUB; i++) {
      const prev = decay[i] * decayK;
      decay[i] = lum[i] > prev ? lum[i] : prev;
    }
    // phase burn-in crossfade: the previous phase's phosphor ghosts through
    // the new one for ~0.6s — signal-corruption dissolve instead of a cut.
    if (snapT >= 0) {
      const fade = Math.exp(-3.5 * Math.max(0, T - snapT));
      if (fade < 0.02) snapT = -1;
      else for (let i = 0; i < N_SUB; i++) {
        const g = decaySnap[i] * fade;
        if (g > decay[i]) decay[i] = g;
      }
    }
  }
  const decaySnap = new Float32Array(N_SUB);
  let snapT = -1;
  let lastAct = -1;

  // ─────────────────────────────────────────────────────────────────────────
  // Cell emit: dither → LUT → block/density glyph; dirty-cell diffed blits
  // ─────────────────────────────────────────────────────────────────────────
  let atlas = null, atlasTileW = 0, atlasTileH = 0, atlasAct = -1;
  let emitAct = -1;
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
    if (host.document && host.document.createElement) {
      const c = host.document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }
    return null;
  }
  function buildAtlas(act) {
    const cellW = Math.max(5, Math.floor(W / COLS));
    const cellH = Math.max(7, Math.floor(H / ROWS));
    const a = makeCanvas(ATLAS_CHARS.length * cellW, 64 * cellH);
    if (!a) { atlas = null; atlasAct = act; return; }
    const aCtx = a.getContext('2d');
    const pal = PALETTES[act];
    if (aCtx && 'imageSmoothingEnabled' in aCtx) aCtx.imageSmoothingEnabled = false;
    aCtx.clearRect(0, 0, a.width, a.height);
    aCtx.font = '700 ' + Math.floor(cellH * 0.96) + 'px "IBM Plex Mono","Consolas",monospace';
    aCtx.textAlign = 'center'; aCtx.textBaseline = 'middle';
    for (let li = 0; li < 64; li++) {
      const lut = li < 32 ? pal.main : pal.accent;
      const rgb = lut[li < 32 ? li : li - 32];
      aCtx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      for (let ci = 0; ci < ATLAS_CHARS.length; ci++) {
        aCtx.fillText(ATLAS_CHARS[ci], ci * cellW + cellW / 2, li * cellH + cellH / 2 + 0.5);
      }
    }
    atlas = a; atlasTileW = cellW; atlasTileH = cellH; atlasAct = act;
  }
  function css(lut, i) { return 'rgb(' + lut[i][0] + ',' + lut[i][1] + ',' + lut[i][2] + ')'; }

  function emitCells(act, transGlitch, powerOn) {
    const pal = PALETTES[act];
    const cellW = W / COLS, cellH = H / ROWS;
    if (atlasAct !== act || (atlas === null && atlasAct !== act)) buildAtlas(act);
    if (emitAct !== act) {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      emitAct = act;
      emittedKey.fill(-2);
    }
    if (transGlitch > 0) emittedKey.fill(-2); // force full re-emit during transitions

    for (let r = 0; r < ROWS; r++) {
      const rowOff = r * COLS;
      const subRow0 = r * 2 * SW;
      let tearX = 0;
      if (transGlitch > 0) {
        const n = vnoise(r * 0.35, T * 18);
        if (n > 0.62) tearX = Math.round((n - 0.62) * 26 * transGlitch * (hash1(r * 7 + ((T * 30) | 0)) > 0.5 ? 1 : -1));
      }
      for (let c = 0; c < COLS; c++) {
        const i0 = subRow0 + c;
        const i1 = subRow0 + SW + c;
        let lTop = decay[i0], lBot = decay[i1];
        const tTop = tint[i0], tBot = tint[i1];
        if (powerOn >= 0) {
          // CRT power-on: a bright horizontal band snaps open vertically.
          // Boost is strongest at the start and fades as the band opens.
          const bandC = (0.06 + 0.94 * easeOutCubic(powerOn)) * ROWS * 0.5;
          const dY = Math.abs(r - ROWS * 0.5);
          if (dY > bandC + 1) { lTop = 0; lBot = 0; }
          else {
            const boost = 1 + (1 - powerOn) * 1.1;
            lTop *= boost; lBot *= boost;
          }
        }
        const nT = ign(c, r * 2, frameCounter) - 0.5;
        const nB = ign(c, r * 2 + 1, frameCounter) - 0.5;
        let qT = -1, qB = -1;
        if (lTop > 0.012) qT = clamp((Math.pow(Math.max(lTop, 0), 0.86) + nT * 0.14) * 31.5, 0, 31) | 0;
        if (lBot > 0.012) qB = clamp((Math.pow(Math.max(lBot, 0), 0.86) + nB * 0.14) * 31.5, 0, 31) | 0;
        if (transGlitch > 0.3 && ((c * 13 + r * 7 + ((T * 40) | 0)) % 11) === 0) {
          if (qT >= 0) qT = clamp(qT + 7, 0, 31);
          if (qB >= 0) qB = clamp(qB - 7, 0, 31);
        }
        if (transGlitch > 0.5 && hash1(c * 31.7 + r * 17.3 + ((T * 50) | 0)) > 0.86) { qT = -1; qB = -1; }

        // kind: 0 blank, 1 top-block, 2 bottom-block, 3 full, 4 top+bg, 5+d density char
        let kind, fgL = 0, fgT = 0, bgL = 0;
        if (qT < 0 && qB < 0) {
          const avg = (lTop + lBot) * 0.5;
          let dI = -1;
          for (let d = DENSITY_L.length - 1; d >= 0; d--) if (avg + nT * 0.08 > DENSITY_L[d]) { dI = d; break; }
          if (dI < 0) { kind = 0; }
          else {
            kind = 5 + dI;
            fgL = clamp(Math.round(Math.pow(Math.max(avg, 0), 0.9) * 31), 1, 26);
            fgT = lTop >= lBot ? tTop : tBot;
          }
        } else if (qB < 0) { kind = 1; fgL = qT; fgT = tTop; }
        else if (qT < 0) { kind = 2; fgL = qB; fgT = tBot; }
        else if (qT === qB && tTop === tBot) { kind = 3; fgL = qT; fgT = tTop; }
        else { kind = 4; fgL = qT; fgT = tTop; bgL = qB; }

        const key = (((kind * 32 + fgL) * 2 + fgT) * 32 + bgL) * 2 + (tBot & 1);
        const cellIdx = rowOff + c;
        if (key === emittedKey[cellIdx]) continue;
        emittedKey[cellIdx] = key;

        const x0 = Math.round((c + tearX) * cellW);
        const y0 = Math.round(r * cellH);
        const x1 = Math.round((c + tearX + 1) * cellW);
        const y1 = Math.round((r + 1) * cellH);
        const cw = Math.max(1, x1 - x0);
        const ch = Math.max(1, y1 - y0);
        const halfH = Math.max(1, Math.floor(ch * 0.5));
        const lutTop = fgT ? pal.accent : pal.main;
        if (kind === 0) {
          ctx.fillStyle = pal.bg; ctx.fillRect(x0, y0, cw, ch);
        } else if (kind === 1) {
          ctx.fillStyle = pal.bg; ctx.fillRect(x0, y0, cw, ch);
          ctx.fillStyle = css(lutTop, qT); ctx.fillRect(x0, y0, cw, halfH);
        } else if (kind === 2) {
          ctx.fillStyle = pal.bg; ctx.fillRect(x0, y0, cw, ch);
          ctx.fillStyle = css(tBot ? pal.accent : pal.main, qB);
          ctx.fillRect(x0, y0 + halfH, cw, Math.max(1, ch - halfH));
        } else if (kind === 3) {
          ctx.fillStyle = css(lutTop, qT); ctx.fillRect(x0, y0, cw, ch);
        } else if (kind === 4) {
          ctx.fillStyle = css(tBot ? pal.accent : pal.main, qB);
          ctx.fillRect(x0, y0, cw, ch);
          ctx.fillStyle = css(lutTop, qT); ctx.fillRect(x0, y0, cw, halfH);
        } else {
          ctx.fillStyle = pal.bg; ctx.fillRect(x0, y0, cw, ch);
          if (atlas) {
            ctx.drawImage(atlas, (kind - 5) * atlasTileW, ((fgT ? 32 : 0) + fgL) * atlasTileH, atlasTileW, atlasTileH,
              x0, y0, cw, ch);
          }
        }
      }
    }
  }

  // scanline pattern + vignette (prerendered)
  let scanPattern = null, vignette = null;
  function buildOverlays() {
    const p = makeCanvas(4, 4);
    if (p) {
      const c2 = p.getContext('2d');
      c2.clearRect(0, 0, 4, 4);
      c2.fillStyle = 'rgba(0,0,0,0.18)';
      c2.fillRect(0, 0, 4, 2);
      scanPattern = ctx.createPattern(p, 'repeat');
    }
    const v = makeCanvas(Math.max(2, W | 0), Math.max(2, H | 0));
    if (v) {
      const c2 = v.getContext('2d');
      const g = c2.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.24)');
      c2.fillStyle = g;
      c2.fillRect(0, 0, W, H);
      vignette = v;
    }
  }

  function drawWaveform() {
    if (!waveCtx) return;
    waveCtx.fillStyle = '#02070a';
    waveCtx.fillRect(0, 0, WW, WH);
    waveCtx.strokeStyle = 'rgba(90,220,242,0.9)';
    waveCtx.lineWidth = 1.2;
    waveCtx.beginPath();
    for (let i = 0; i < 64; i++) {
      const v = energyHist[(energyIdx + i) % 64];
      const x = (i / 63) * WW;
      const y = WH * 0.62 - v * WH * 0.52 + Math.sin(i * 0.7 + T * 9) * v * 2.4;
      if (i === 0) waveCtx.moveTo(x, y); else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();
    waveCtx.fillStyle = 'rgba(90,220,242,0.25)';
    for (let i = 0; i < 16; i++) waveCtx.fillRect((i / 16) * WW, WH - 2, 1, 2);
  }

  function frame(now) {
    if (!running) return;
    const t0 = Date.now();
    let dt = lastNow ? (now - lastNow) / 1000 : 1 / 60;
    lastNow = now;
    dt = clamp(dt, 0.001, 0.05);
    if (!labFreeze) T += dt;

    progressShown += (progress - progressShown) * Math.min(1, dt * 3);
    if (T - lastPointerAt > 4) {
      gxT = Math.sin(T * 0.3) * 0.4;
      gyT = Math.cos(T * 0.23) * 0.3;
    }
    gx += (gxT - gx) * Math.min(1, dt * 4);
    gy += (gyT - gy) * Math.min(1, dt * 4);

    const tt = T % LOOP_LEN;
    const act = actIndexAt(tt);
    const uLocal = (tt % ACT_LEN) / ACT_LEN;
    let glitch = 0;
    if (labAct < 0) {
      if (uLocal > 0.925) glitch = (uLocal - 0.925) / 0.075;
      else if (uLocal < 0.055) glitch = 1 - uLocal / 0.055;
      if (reduced) glitch *= 0.35;
    }
    // CRT power-on effect only lives for the first 0.9s of phase 1 — after
    // that it must get out of the way (a stale multiplier here once doubled
    // the luminance of the entire first phase).
    const powerOn = (labAct === 0 || (labAct < 0 && act === 0 && tt < ACT_LEN))
      ? (tt < 0.9 ? tt / 0.9 : -1) : -1;

    if (!labFreeze) {
      skipScene = frameCostAvg > 24 && (frameCounter & 1) === 1;
      if (lastAct !== act && lastAct >= 0) { decaySnap.set(decay); snapT = T; }
      lastAct = act;
      if (!skipScene) {
        lum.fill(0); tint.fill(0);
        stepFlow(dt);
        renderPost();
      } else {
        const decayK = Math.exp(-7.5 / 60);
        for (let i = 0; i < N_SUB; i++) decay[i] *= decayK;
      }
    }

    emitCells(act, glitch, powerOn);

    if (scanPattern) {
      const oldAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = scanPattern;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = oldAlpha;
    }
    const bandY = ((T * 0.12) % 1) * H;
    const grad = ctx.createLinearGradient(0, bandY - 14, 0, bandY + 14);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(220,255,250,0.045)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, bandY - 14, W, 28);
    if (vignette) ctx.drawImage(vignette, 0, 0, W, H);

    drawWaveform();

    energyHist[energyIdx] = energy;
    energyIdx = (energyIdx + 1) % 64;

    frameCostAvg = frameCostAvg * 0.92 + (Date.now() - t0) * 0.08;
    frameCounter++;
    rafId = host.raf(frame);
  }

  function init(msg) {
    W = msg.width || 640; H = msg.height || 380;
    try {
      msg.canvas.width = W;
      msg.canvas.height = H;
    } catch {}
    ctx = msg.canvas.getContext('2d');
    if (ctx && 'imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;
    if (msg.waveformCanvas) {
      try {
        msg.waveformCanvas.width = msg.waveWidth || 200;
        msg.waveformCanvas.height = msg.waveHeight || 48;
      } catch {}
      waveCtx = msg.waveformCanvas.getContext('2d');
      if (waveCtx && 'imageSmoothingEnabled' in waveCtx) waveCtx.imageSmoothingEnabled = false;
      WW = msg.waveWidth || 200; WH = msg.waveHeight || 48;
    }
    reduced = !!msg.reducedMotion;
    buildOverlays();
    ctx.fillStyle = PALETTES[0].bg;
    ctx.fillRect(0, 0, W, H);
    running = true;
    rafId = host.raf(frame);
  }

  return {
    receive(msg) {
      if (!msg) return;
      switch (msg.type) {
        case 'init': init(msg); break;
        case 'progress': progress = clamp(Number(msg.progress) || 0, 0, 1); break;
        case 'pointer':
          gxT = clamp(Number(msg.x) || 0, -1, 1);
          gyT = clamp(Number(msg.y) || 0, -1, 1);
          lastPointerAt = T;
          break;
        case 'stop':
          running = false;
          if (rafId != null) host.cancel(rafId);
          rafId = null;
          break;
        case 'start':
          if (!running && ctx) { running = true; lastNow = 0; rafId = host.raf(frame); }
          break;
        case 'lab':
          if (msg.act !== undefined) labAct = Number(msg.act);
          labFreeze = !!msg.freeze;
          if (msg.t !== undefined) T = Number(msg.t);
          if (msg.reduced !== undefined) reduced = !!msg.reduced;
          break;
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL-RESOLUTION PATH — WebGL2 ping-pong feedback simulation displayed
// through a character screen. Each frame samples the PREVIOUS frame's texture
// through a curl-noise flow warp, zoom / rotation / kaleidoscope fold, hue
// drift and phosphor decay, then adds energy from choreographed emitters.
// The character field is the DISPLAY TECHNOLOGY, not the pixel budget. Any
// failure anywhere falls back to the 2D engine above.
// ═══════════════════════════════════════════════════════════════════════════
const GLSL_VERT = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

const GLSL_COMMON = `
float gh1(float n){ return fract(sin(n)*43758.5453123); }
float gh2(vec2 p){ return gh1(p.x*127.1 + p.y*311.7); }
float gvno(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(gh2(i), gh2(i+vec2(1.0,0.0)), u.x), mix(gh2(i+vec2(0.0,1.0)), gh2(i+vec2(1.0,1.0)), u.x), u.y);
}
float gfbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){ s += a*gvno(p); p = p*2.03 + 7.31; a *= 0.5; }
  return s;
}
`;

// ── The feedback scene ──────────────────────────────────────────────────────
// Uniforms are packed:
//   uWarp (zoom, rot, flowAmp, flowScale)   — per-frame warp magnitudes
//   uFlow (driftX, driftY, swirl, jitter)   — field drift / rotation / row noise
//   uLook (symN, symAmt, decay, hue)        — symmetry fold + feedback decay
//   uDrive (beatEnv, modeBlend, whiteout, energy)
//   uAux  (uLocal, reduced, fog, spare)
//   uPalA..D — cosine palette (IQ): pal(t) = A + B*cos(2π(C·t + D))
const GLSL_SCENE = `
uniform sampler2D uPrev;
uniform vec4 uWarp, uFlow, uLook, uDrive, uAux;
uniform vec3 uPalA, uPalB, uPalC, uPalD;

vec3 pal(float t){
  return clamp(uPalA + uPalB*cos(6.2831853*(uPalC*t + uPalD)), 0.0, 1.0);
}
vec2 rot2(vec2 v, float a){
  float c = cos(a), s = sin(a);
  return vec2(c*v.x - s*v.y, s*v.x + c*v.y);
}
vec3 hueRot(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c*ca + cross(k, c)*sin(a) + k*dot(k, c)*(1.0-ca);
}
vec2 curl2(vec2 p){
  float e = 0.14;
  float a = gfbm(p + vec2(0.0, e)) - gfbm(p - vec2(0.0, e));
  float b = gfbm(p + vec2(e, 0.0)) - gfbm(p - vec2(e, 0.0));
  return vec2(a, -b)/(2.0*e);
}

// ── emitters (blended by modeBlend so phases morph, never cut) ─────────────
// M0 · GENESIS — slow orbiting embers + an expanding ring pulse
vec3 inj0(vec2 cc, float b, float e){
  vec3 s = vec3(0.0);
  for (int i = 0; i < 8; i++){
    float fi = float(i);
    float w1 = 0.31 + gh1(fi*3.1)*0.22, w2 = 0.27 + gh1(fi*7.7)*0.19;
    vec2 c = vec2(sin(uT*w1 + fi*1.7)*0.46 + sin(uT*0.11 + fi)*0.10,
                  cos(uT*w2 + fi*2.3)*0.36 + cos(uT*0.07 + fi*2.0)*0.08);
    float d = length(cc - c);
    float sz = 0.075 + 0.045*gh1(fi*13.1);
    float amp = (0.35 + 0.65*b)*(0.6 + 0.4*sin(uT*(0.5 + gh1(fi)) + fi*2.0));
    s += pal(fi*0.125 + e*0.2)*exp(-d*d/(sz*sz))*amp*2.6;
  }
  float rr = fract(uT*0.42);
  s += pal(0.55 + e*0.3)*exp(-pow((length(cc) - rr*1.1)*11.0, 2.0))*(1.0 - rr)*1.3*b;
  return s;
}
// M1 · CURRENTS — moving heads the flow field stretches into streams
vec3 inj1(vec2 cc, float b, float e){
  vec3 s = vec3(0.0);
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float sp = 0.23 + gh1(fi*5.3)*0.30;
    vec2 c = vec2(sin(uT*sp + fi*2.39)*0.50 + sin(uT*sp*2.7 + fi)*0.14,
                  sin(uT*sp*0.8 + fi*1.87)*0.36 + cos(uT*sp*3.1 + fi*4.0)*0.10);
    float d = length(cc - c);
    vec3 col = pal(fi*0.11 + e*0.25);
    s += col*exp(-d*d*1500.0)*(0.55 + 0.45*b)*2.4;
    vec2 vel = vec2(cos(uT*sp + fi*2.39 + 1.57), 0.8*cos(uT*sp*0.8 + fi*1.87))*0.06;
    float d2 = length(cc - c + vel);
    s += col*exp(-d2*d2*900.0)*1.0;
  }
  return s;
}
// M2 · BLOOM — rotating petals + breathing core (whole mandala turns)
vec3 inj2(vec2 cc, float b, float e){
  float r = length(cc), a = atan(cc.y, cc.x + 1e-5) + uT*0.15;
  float pet = pow(abs(sin(a*6.0)), 2.5);
  float radial = exp(-pow((r - 0.60 - 0.07*sin(uT*0.8 + a*3.0))*5.5, 2.0));
  vec3 s = pal(a*0.16 + uT*0.05 + e*0.1)*pet*radial*(0.5 + 0.5*b)*3.0;
  float pet2 = pow(abs(sin(a*6.0 + 0.5)), 2.0);
  float radial2 = exp(-pow((r - 0.34 - 0.05*sin(uT*1.1 - a*2.0))*8.0, 2.0));
  s += pal(0.6 + a*0.1)*pet2*radial2*(0.5 + 0.5*b)*2.0;
  s += pal(0.92)*exp(-r*r*16.0)*(0.5 + 0.5*b)*1.8;
  float sp = fract(uT*0.35);
  s += pal(0.75)*exp(-pow((r - 0.24 - 0.16*sp)*11.0, 2.0))*(1.0 - sp)*1.1;
  return s;
}
// M3 · TEMPEST — jagged twin discharges, held ~0.3s per strike + hard flecks
vec3 bolt3(vec2 cc, float seed, float b){
  vec3 s = vec3(0.0);
  vec2 p0 = vec2((gh1(seed*3.7) - 0.5)*0.8, (gh1(seed*9.1) - 0.5)*0.55);
  for (int i = 0; i < 9; i++){
    float fi = float(i);
    float f = (fi + 1.0)/9.0;
    vec2 p1 = vec2(p0.x + f*1.4*(gh1(seed + fi*17.3) - 0.30), p0.y + (gh1(seed + fi*7.7) - 0.5)*1.7*f);
    vec2 pa = cc - p0, ba = p1 - p0;
    float h = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-4), 0.0, 1.0);
    float d = length(pa - ba*h);
    s += (pal(0.88)*exp(-d*d*700.0)*4.2 + pal(0.62)*exp(-d*d*140.0)*1.0)*(0.25 + 0.75*b)*(1.0 - f*0.35);
    p0 = p1;
  }
  return s;
}
vec3 inj3(vec2 cc, float b, float e){
  float strike = floor(uT*3.2);           // two strikes per beat
  float hold = 1.0 - clamp(fract(uT*3.2)*2.6, 0.0, 1.0); // ~0.31s visible tail
  vec3 s = (bolt3(cc, strike*1.0, b) + bolt3(cc, strike*1.0 + 41.7, b*0.8))*hold;
  s += pal(fract(cc.x + uT*0.2))*step(0.9955, gh2(floor(cc*140.0) + floor(uT*36.0)))*2.2;
  return s;
}
// M4 · SINGULARITY — a core that swallows the frame + counter-rotating rings
vec3 inj4(vec2 cc, float b, float e, float uL){
  float r = length(cc), a = atan(cc.y, cc.x + 1e-5);
  float core = exp(-r*r*(26.0 - 15.0*uL));
  vec3 s = pal(0.93)*core*(1.4 + 2.4*uL*uL)*(0.6 + 0.4*b);
  float r1 = 0.34 + 0.16*sin(uT*0.9);
  s += pal(0.70)*exp(-pow((r - r1)*18.0, 2.0))*(0.5 + 0.5*sin(a*10.0 + uT*3.0))*1.5;
  s += pal(0.45)*exp(-pow((r - r1*0.62)*22.0, 2.0))*(0.5 + 0.5*sin(a*14.0 - uT*4.2))*1.3;
  return s;
}
vec3 injMode(float m, vec2 cc, float b, float e, float uL){
  if (m < 0.5) return inj0(cc, b, e);
  if (m < 1.5) return inj1(cc, b, e);
  if (m < 2.5) return inj2(cc, b, e);
  if (m < 3.5) return inj3(cc, b, e);
  return inj4(cc, b, e, uL);
}

void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  float aspect = uRes.x/uRes.y;
  vec2 cc = (uv - 0.5)*vec2(aspect, 1.0) - uGyro*0.05;
  float beat = uDrive.x, modeB = uDrive.y, white = uDrive.z, e = uDrive.w;

  // row-coherent jitter (analog tape unrest, strongest in TEMPEST)
  float rowId = floor(gl_FragCoord.y*0.22);
  float jit = (gh1(rowId*7.31 + floor(uT*24.0)*13.77) - 0.5)*uFlow.w;

  // ── where this pixel reads the PREVIOUS frame ────────────────────────────
  vec2 fl = curl2(cc*uWarp.w + uFlow.xy*uT)*uWarp.z;
  vec2 disp = fl + vec2(-cc.y, cc.x)*uFlow.z;
  vec2 puvA = uv + vec2((disp.x + jit)/aspect, disp.y);
  puvA = 0.5 + rot2(puvA - 0.5, uWarp.y)/uWarp.x;
  // kaleidoscope fold (BLOOM): sector-mirror the lookup coordinate
  vec2 puvB = puvA;
  if (uLook.y > 0.001){
    vec2 k = (puvB - 0.5)*vec2(aspect, 1.0);
    float r = length(k);
    float a2 = atan(k.y, k.x + 1e-5);
    float sect = 6.2831853/max(uLook.x, 1.0);
    a2 = abs(mod(a2, sect) - sect*0.5);
    puvB = 0.5 + vec2(cos(a2), sin(a2))*r/vec2(aspect, 1.0);
  }
  vec2 puv = mix(puvA, puvB, uLook.y);

  vec3 prev = texture2D(uPrev, clamp(puv, 0.001, 0.999)).rgb;
  vec2 ef2 = abs(puv - 0.5);
  prev *= 1.0 - smoothstep(0.44, 0.5, max(ef2.x, ef2.y))*0.92; // no border smear
  prev = hueRot(prev, uLook.w)*uLook.z;
  float pl = dot(prev, vec3(0.299, 0.587, 0.114));
  prev = mix(vec3(pl), prev, 1.04); // hold saturation against hue drift

  // ── new energy ───────────────────────────────────────────────────────────
  float uL = uAux.x;
  float mA = floor(modeB), mf = smoothstep(0.0, 1.0, fract(modeB));
  vec3 inj = mix(injMode(mA, cc, beat, e, uL), injMode(mA + 1.0, cc, beat, e, uL), mf);
  // living fog: a full-frame, ever-evolving luminous substrate so the picture
  // never has dead zones — the emitters ride on top of it
  float fogN = gfbm(cc*1.15 + uFlow.xy*uT*0.05 + 3.7);
  vec3 fog = pal(0.22 + fogN*0.5)*pow(gfbm(cc*0.85 - uT*0.03), 2.0)*uAux.z;
  vec3 col = prev + inj*(1.0 - uAux.y*0.55) + fog;

  // dither defeats 8-bit feedback banding and keeps dark areas alive
  col += (gh2(gl_FragCoord.xy + fract(uT)*vec2(157.0, 113.0)) - 0.5)*0.012;
  col = mix(col, vec3(1.25, 1.28, 1.20), white);
  gl_FragColor = vec4(min(col, vec3(6.0)), 1.0);
}
`;

// ── The character screen (post) ─────────────────────────────────────────────
// The simulation is displayed as a dense phosphor character grid: ~3px cells
// pick a 16-step density glyph with per-cell color, plus barrel distortion,
// chromatic aberration, mip-bloom, aperture grille, scanlines, retrace band,
// tear/dropout glitch and the CRT power-on band.
const GLSL_POST = `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform vec2 uCellPx;
uniform float uTime, uGlitch, uPowerOn, uFlash, uGrille, uAsciiShift;
float ph2(vec2 p){ return fract(sin(p.x*127.1 + p.y*311.7)*43758.5453); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 buv = 0.5 + cc*(1.0 + 0.028*r2 + 0.008*uGlitch); // restrained barrel
  float rowN = ph2(vec2(floor(uv.y*90.0), floor(uTime*24.0)));
  float tear = rowN > 0.9 ? (rowN-0.9)*22.0*uGlitch*sign(rowN-0.95) : 0.0;
  buv.x = fract(buv.x + tear*0.05);
  float ab = 0.0008 + uGlitch*0.0032;
  vec3 col;
  col.r = texture2D(uScene, clamp(buv+vec2(ab,0.0), 0.001, 0.999)).r;
  col.g = texture2D(uScene, clamp(buv, 0.001, 0.999)).g;
  col.b = texture2D(uScene, clamp(buv-vec2(ab,0.0), 0.001, 0.999)).b;
  vec3 bloom = texture2D(uScene, clamp(buv, 0.001, 0.999), 3.0).rgb;
  col += bloom*0.45;
  // character cell: glyph ramp + per-cell color
  vec2 cellId = floor(gl_FragCoord.xy/uCellPx);
  vec2 cuv = (cellId*uCellPx + uCellPx*0.5)/uRes;
  vec2 cellSzUv = uCellPx / uRes;
  vec3 cellCol = vec3(0.0);
  cellCol += texture2D(uScene, clamp(cuv + vec2(-0.22, -0.22) * cellSzUv, 0.001, 0.999)).rgb;
  cellCol += texture2D(uScene, clamp(cuv + vec2(0.22, -0.22) * cellSzUv, 0.001, 0.999)).rgb;
  cellCol += texture2D(uScene, clamp(cuv + vec2(-0.22, 0.22) * cellSzUv, 0.001, 0.999)).rgb;
  cellCol += texture2D(uScene, clamp(cuv + vec2(0.22, 0.22) * cellSzUv, 0.001, 0.999)).rgb;
  cellCol *= 0.25;
  cellCol += texture2D(uScene, clamp(cuv, 0.001, 0.999), 2.0).rgb*0.32;
  float lum = dot(cellCol, vec3(0.299, 0.587, 0.114));
  lum += (ph2(cellId + floor(uTime*61.0)) - 0.5)*0.025;   // animated grain
  float gi = clamp(floor(pow(max(lum, 0.0), 0.75)*15.0 + 0.5), 0.0, 15.0);
  vec2 cf = fract(gl_FragCoord.xy/uCellPx);
  float ga = texture2D(uAtlas, vec2((gi + clamp(cf.x, 0.02, 0.98))/16.0, clamp(cf.y, 0.02, 0.98))).r;
  float dotMask = smoothstep(0.48, 0.08, length(cf - 0.5));
  float shiftPulse = smoothstep(0.58, 0.98, 0.5 + 0.5*sin(uTime*0.74 + cellId.x*0.09 + cellId.y*0.05));
  float glyphMix = mix(dotMask, ga, clamp(0.28 + uAsciiShift*0.72*shiftPulse, 0.0, 1.0));
  vec3 outc = cellCol*glyphMix*1.95;
  // cell lattice
  vec2 gf = abs(cf - 0.5);
  outc *= 0.88 + 0.12*smoothstep(0.5, 0.34, max(gf.x, gf.y));
  // aperture grille
  float g3 = fract(gl_FragCoord.x/3.0);
  outc *= vec3(0.9 + 0.2*step(g3, 0.333), 0.9 + 0.2*step(0.333, g3)*step(g3, 0.666), 0.9 + 0.2*step(0.666, g3))*uGrille + (1.0-uGrille);
  // scanline
  outc *= 0.91 + 0.09*sin(gl_FragCoord.y*3.14159);
  // retrace band
  outc += vec3(0.85, 1.0, 0.98)*exp(-abs(uv.y - fract(uTime*0.11))*55.0)*0.038;
  // power-on band
  if (uPowerOn >= 0.0){
    float bw = (0.04 + 0.96*pow(uPowerOn, 0.3333))*0.5;
    float dy = abs(uv.y - 0.5);
    if (dy > bw) { outc *= 0.0; }
    else outc *= 1.0 + (1.0-uPowerOn)*1.4;
  }
  // dropout
  if (uGlitch > 0.3 && ph2(cellId + floor(uTime*47.0)) > 0.93) outc *= 0.2;
  outc *= 1.0 - 0.3*r2;   // vignette
  outc = pow(max(outc, vec3(0.0)), vec3(0.96));
  outc += vec3(uFlash);
  gl_FragColor = vec4(outc, 1.0);
}
`;

/**
 * GL engine wrapper. Tries the full-resolution WebGL2 path; every failure
 * path (no context, no float buffers, compile/link errors, runtime) falls
 * back to the proven 2D engine via host.engine2D. The validation render
 * happens on a THROWAWAY 4x4 canvas first so a dead GL stack never burns the
 * real canvas's context slot.
 */
const GL_SOURCES = {
  vert: GLSL_VERT,
  common: GLSL_COMMON,
  scene: GLSL_SCENE,
  post: GLSL_POST,
};

function createEngineGL(host) {
  'use strict';
  const ACTS = 5, ACT_LEN = 6.5, LOOP_LEN = ACTS * ACT_LEN;
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Shader sources MUST arrive via host (this factory is stringified into the
  // worker and cannot close over module scope).
  const SRC = host && host.sources;
  if (!SRC || !SRC.vert || !SRC.common || !SRC.scene || !SRC.post) {
    return host && host.engine2D ? host.engine2D(host) : { receive() {} };
  }
  const sceneSrc = 'precision highp float;\n' +
    'uniform vec2 uRes; uniform float uT; uniform vec2 uGyro;\n' +
    SRC.common + SRC.scene;
  const postSrc = SRC.post;

  function fallback2D(reason) {
    try { if (host.post) host.post({ type: 'glFallback', reason: String(reason) }); } catch {}
    if (host.engine2D) return host.engine2D(host);
    return { receive() {} };
  }

  // ── validate the whole GL stack on a THROWAWAY canvas first ─────────────
  let validated = false;
  try {
    if (typeof OffscreenCanvas !== 'function') return fallback2D('no-offscreen');
    const scratch = new OffscreenCanvas(8, 8);
    const sgl = scratch.getContext('webgl2', { antialias: false });
    if (!sgl) return fallback2D('no-webgl2');
    const cShader = (gl2, type, src) => {
      const sh = gl2.createShader(type);
      gl2.shaderSource(sh, src);
      gl2.compileShader(sh);
      if (!gl2.getShaderParameter(sh, gl2.COMPILE_STATUS)) throw new Error(gl2.getShaderInfoLog(sh));
      return sh;
    };
    const sv = cShader(sgl, sgl.VERTEX_SHADER, SRC.vert);
    const p1 = sgl.createProgram();
    sgl.attachShader(p1, sv);
    sgl.attachShader(p1, cShader(sgl, sgl.FRAGMENT_SHADER, sceneSrc));
    sgl.linkProgram(p1);
    if (!sgl.getProgramParameter(p1, sgl.LINK_STATUS)) throw new Error(sgl.getProgramInfoLog(p1));
    const pp = sgl.createProgram();
    sgl.attachShader(pp, sv);
    sgl.attachShader(pp, cShader(sgl, sgl.FRAGMENT_SHADER, postSrc));
    sgl.linkProgram(pp);
    if (!sgl.getProgramParameter(pp, sgl.LINK_STATUS)) throw new Error(sgl.getProgramInfoLog(pp));
    validated = true;
  } catch (e) {
    return fallback2D('validate:' + e.message);
  }
  if (!validated) return fallback2D('validate-false');

  // ── phase choreography ──────────────────────────────────────────────────
  // Per-phase targets. Phases cross-blend over the last 14% of their window,
  // so the simulation state carries across transitions — no cuts, only morphs.
  //   zoom/rot: per-frame feedback magnifiers (1.0 = hold)
  //   flowAmp:  uv displacement per frame from the curl field
  //   decay:    phosphor retention per frame; hue: rotation per frame
  //   period:   beat interval driving injection pulses
  const PH = [
    { // 0 · GENESIS — dark water finding first light
      zoom: 1.0006, rot: 0.00018, flowAmp: 0.0042, flowScale: 0.34,
      drift: [0.045, 0.020], swirl: 0.0006, jitter: 0.0004,
      symN: 6, symAmt: 0, decay: 0.9780, hue: 0.0026, period: 2.6, energy: 0.22, fog: 0.62,
      palA: [0.085, 0.200, 0.185], palB: [0.085, 0.230, 0.205], palC: [1.0, 1.0, 1.0], palD: [0.38, 0.47, 0.42],
    },
    { // 1 · CURRENTS — long emerald streams
      zoom: 0.99915, rot: -0.00033, flowAmp: 0.0085, flowScale: 0.95,
      drift: [0.100, -0.030], swirl: 0.0012, jitter: 0.0009,
      symN: 0, symAmt: 0, decay: 0.9650, hue: -0.0035, period: 1.7, energy: 0.38, fog: 0.42,
      palA: [0.075, 0.190, 0.215], palB: [0.095, 0.235, 0.260], palC: [1.0, 1.0, 1.0], palD: [0.45, 0.35, 0.30],
    },
    { // 2 · BLOOM — kaleidoscope opens (symAmt is shaped in code)
      zoom: 1.0026, rot: 0.00062, flowAmp: 0.0050, flowScale: 1.65,
      drift: [0.060, 0.060], swirl: 0.0040, jitter: 0.0007,
      symN: 6, symAmt: 1, decay: 0.9680, hue: 0.0042, period: 1.15, energy: 0.52, fog: 0.36,
      palA: [0.240, 0.180, 0.270], palB: [0.200, 0.170, 0.230], palC: [1.0, 1.0, 0.9], palD: [0.10, 0.42, 0.70],
    },
    { // 3 · TEMPEST — the field tears
      zoom: 1.0058, rot: 0.00130, flowAmp: 0.0160, flowScale: 2.70,
      drift: [-0.160, 0.090], swirl: -0.0028, jitter: 0.0050,
      symN: 0, symAmt: 0, decay: 0.9520, hue: -0.0060, period: 0.60, energy: 0.85, fog: 0.26,
      palA: [0.220, 0.120, 0.105], palB: [0.220, 0.140, 0.150], palC: [1.2, 0.9, 0.8], palD: [0.02, 0.55, 0.25],
    },
    { // 4 · SINGULARITY — collapse (zoom accelerates in code), then rebirth
      zoom: 1.0030, rot: 0.00220, flowAmp: 0.0080, flowScale: 1.20,
      drift: [0.000, 0.000], swirl: 0.0200, jitter: 0.0016,
      symN: 0, symAmt: 0, decay: 0.9710, hue: 0.0080, period: 0.90, energy: 0.62, fog: 0.34,
      palA: [0.170, 0.155, 0.260], palB: [0.160, 0.145, 0.265], palC: [0.8, 1.0, 1.2], palD: [0.62, 0.58, 0.50],
    },
  ];

  function phaseParams(tt) {
    const p = Math.floor(tt / ACT_LEN) % ACTS;
    const u = (tt % ACT_LEN) / ACT_LEN;
    const A = PH[p], B = PH[(p + 1) % ACTS];
    const w = sstep(0.86, 1.0, u);
    // per-phase shaping applied to A before the cross-blend
    let zoomA = A.zoom, symAmtA = A.symAmt;
    if (p === 2) symAmtA = Math.pow(Math.sin(u * Math.PI), 1.5); // bloom opens, then folds
    if (p === 4) zoomA = A.zoom + Math.pow(u, 3) * 0.030;        // collapse accelerates
    const white = p === 4 ? sstep(0.94, 1.0, u) * 0.9 : 0;
    const o = {
      p, u, white,
      zoom: lerp(zoomA, B.zoom, w),
      rot: lerp(A.rot, B.rot, w),
      flowAmp: lerp(A.flowAmp, B.flowAmp, w),
      flowScale: lerp(A.flowScale, B.flowScale, w),
      dx: lerp(A.drift[0], B.drift[0], w),
      dy: lerp(A.drift[1], B.drift[1], w),
      swirl: lerp(A.swirl, B.swirl, w),
      jitter: lerp(A.jitter, B.jitter, w),
      symN: lerp(A.symN, B.symN, w),
      symAmt: lerp(symAmtA, B.symAmt, w),
      decay: lerp(A.decay, B.decay, w),
      hue: lerp(A.hue, B.hue, w),
      period: lerp(A.period, B.period, w),
      energy: lerp(A.energy, B.energy, w),
      fog: lerp(A.fog, B.fog, w),
      mode: p + w,
    };
    for (let c = 0; c < 3; c++) {
      o['palA_' + c] = lerp(A.palA[c], B.palA[c], w);
      o['palB_' + c] = lerp(A.palB[c], B.palB[c], w);
      o['palC_' + c] = lerp(A.palC[c], B.palC[c], w);
      o['palD_' + c] = lerp(A.palD[c], B.palD[c], w);
    }
    return o;
  }

  // ── live state ──────────────────────────────────────────────────────────
  let gl = null, canvas = null, ctx2dWave = null;
  let W = 640, H = 380, WW = 200, WH = 48;
  let progScene = null, progPost = null, quadBuf = null;
  let texA = null, texB = null, fbA = null, fbB = null, atlasTex = null;
  let renderScale = 1.05;
  let hdrOK = false;
  let dead = false;
  let running = false, rafId = null;
  let T = 0, lastNow = 0;
  let progress = 0.05, progressShown = 0.05;
  let gx = 0, gy = 0, gxT = 0, gyT = 0, lastPointerAt = -10;
  let reduced = false;
  let labAct = -1, labFreeze = false;
  let frameCounter = 0, frameCostAvg = 10;
  let energy = 0.3;
  const energyHist = new Float32Array(64).fill(0.1);
  let energyIdx = 0;

  function compile(gl2, type, src) {
    const sh = gl2.createShader(type);
    gl2.shaderSource(sh, src);
    gl2.compileShader(sh);
    if (!gl2.getShaderParameter(sh, gl2.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl2.getShaderInfoLog(sh));
    }
    return sh;
  }
  function link(gl2, vsSrc, fsSrc) {
    const p = gl2.createProgram();
    gl2.attachShader(p, compile(gl2, gl2.VERTEX_SHADER, vsSrc));
    gl2.attachShader(p, compile(gl2, gl2.FRAGMENT_SHADER, fsSrc));
    gl2.linkProgram(p);
    if (!gl2.getProgramParameter(p, gl2.LINK_STATUS)) {
      throw new Error('link: ' + gl2.getProgramInfoLog(p));
    }
    return p;
  }

  function buildAtlasTex(gl2) {
    const glyphCols = 16;
    const glyphCell = 32;
    let ac;
    if (typeof OffscreenCanvas === 'function') ac = new OffscreenCanvas(glyphCols * glyphCell, glyphCell);
    else if (host.document && host.document.createElement) {
      ac = host.document.createElement('canvas');
      ac.width = glyphCols * glyphCell; ac.height = glyphCell;
    } else return null;
    const c2 = ac.getContext('2d');
    if (c2 && 'imageSmoothingEnabled' in c2) c2.imageSmoothingEnabled = false;
    c2.fillStyle = '#000';
    c2.fillRect(0, 0, ac.width, ac.height);
    c2.fillStyle = '#fff';
    c2.font = '700 28px "IBM Plex Mono","Consolas",monospace';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    const ramp = ' .,:;-+=*xX#%@M8';
    for (let i = 0; i < glyphCols; i++) c2.fillText(ramp[i], i * glyphCell + glyphCell * 0.5, glyphCell * 0.54);
    const tex = gl2.createTexture();
    gl2.bindTexture(gl2.TEXTURE_2D, tex);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, ac);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.NEAREST);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.NEAREST);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
    return tex;
  }

  function makeFBO(gl2, w, h) {
    const tex = gl2.createTexture();
    gl2.bindTexture(gl2.TEXTURE_2D, tex);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, hdrOK ? gl2.RGBA16F : gl2.RGBA8, w, h, 0, gl2.RGBA, hdrOK ? gl2.HALF_FLOAT : gl2.UNSIGNED_BYTE, null);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR_MIPMAP_LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
    gl2.generateMipmap(gl2.TEXTURE_2D);
    const fb = gl2.createFramebuffer();
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, fb);
    gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0, gl2.TEXTURE_2D, tex, 0);
    const ok = gl2.checkFramebufferStatus(gl2.FRAMEBUFFER) === gl2.FRAMEBUFFER_COMPLETE;
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
    return ok ? { tex, fb } : null;
  }

  function init(msg) {
    canvas = msg.canvas;
    W = msg.width || 640; H = msg.height || 380;
    try {
      canvas.width = W;
      canvas.height = H;
    } catch {}
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    } catch { gl = null; }
    if (!gl) throw new Error('real-context-failed');
    try { hdrOK = !!gl.getExtension('EXT_color_buffer_float'); } catch { hdrOK = false; }
    if (msg.waveformCanvas) {
      try {
        msg.waveformCanvas.width = msg.waveWidth || 200;
        msg.waveformCanvas.height = msg.waveHeight || 48;
      } catch {}
      ctx2dWave = msg.waveformCanvas.getContext('2d');
      if (ctx2dWave && 'imageSmoothingEnabled' in ctx2dWave) ctx2dWave.imageSmoothingEnabled = false;
      WW = msg.waveWidth || 200; WH = msg.waveHeight || 48;
    }
    reduced = !!msg.reducedMotion;
    progScene = link(gl, SRC.vert, sceneSrc);
    progPost = link(gl, SRC.vert, postSrc);
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    atlasTex = buildAtlasTex(gl);
    if (!atlasTex) throw new Error('no-atlas');
    const rw = Math.max(2, Math.round(W * renderScale));
    const rh = Math.max(2, Math.round(H * renderScale));
    const fa = makeFBO(gl, rw, rh);
    const fb = makeFBO(gl, rw, rh);
    if (!fa || !fb) throw new Error('no-fbo');
    texA = fa.tex; fbA = fa.fb; texB = fb.tex; fbB = fb.fb;
    gl.viewport(0, 0, W, H);
    running = true;
    rafId = host.raf(frame);
  }

  function resizeFBOs() {
    try {
      const rw = Math.max(2, Math.round(W * renderScale));
      const rh = Math.max(2, Math.round(H * renderScale));
      const fa = makeFBO(gl, rw, rh);
      const fb = makeFBO(gl, rw, rh);
      if (fa && fb) {
        if (texA) gl.deleteTexture(texA);
        if (texB) gl.deleteTexture(texB);
        if (fbA) gl.deleteFramebuffer(fbA);
        if (fbB) gl.deleteFramebuffer(fbB);
        texA = fa.tex; fbA = fa.fb; texB = fb.tex; fbB = fb.fb;
      }
    } catch {}
  }

  function bindQuad(prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function drawWaveform() {
    if (!ctx2dWave) return;
    ctx2dWave.fillStyle = '#02070a';
    ctx2dWave.fillRect(0, 0, WW, WH);
    ctx2dWave.strokeStyle = 'rgba(90,220,242,0.9)';
    ctx2dWave.lineWidth = 1.2;
    ctx2dWave.beginPath();
    for (let i = 0; i < 64; i++) {
      const v = energyHist[(energyIdx + i) % 64];
      const x = (i / 63) * WW;
      const y = WH * 0.62 - v * WH * 0.52 + Math.sin(i * 0.7 + T * 9) * v * 2.4;
      if (i === 0) ctx2dWave.moveTo(x, y); else ctx2dWave.lineTo(x, y);
    }
    ctx2dWave.stroke();
    ctx2dWave.fillStyle = 'rgba(90,220,242,0.25)';
    for (let i = 0; i < 16; i++) ctx2dWave.fillRect((i / 16) * WW, WH - 2, 1, 2);
  }

  function frame(now) {
    if (!running || dead) return;
    const t0 = Date.now();
    let dt = lastNow ? (now - lastNow) / 1000 : 1 / 60;
    lastNow = now;
    dt = clamp(dt, 0.001, 0.05);
    if (!labFreeze) T += dt;
    progressShown += (progress - progressShown) * Math.min(1, dt * 3);
    if (T - lastPointerAt > 4) {
      gxT = Math.sin(T * 0.3) * 0.4;
      gyT = Math.cos(T * 0.23) * 0.3;
    }
    gx += (gxT - gx) * Math.min(1, dt * 4);
    gy += (gyT - gy) * Math.min(1, dt * 4);

    const tt = T % LOOP_LEN;
    const act = labAct >= 0 ? labAct : Math.floor(tt / ACT_LEN) % ACTS;
    const uLocal = (tt % ACT_LEN) / ACT_LEN;
    let glitch = 0;
    if (labAct < 0) {
      if (uLocal > 0.925) glitch = (uLocal - 0.925) / 0.075;
      else if (uLocal < 0.055) glitch = 1 - uLocal / 0.055;
      if (reduced) glitch *= 0.35;
    }
    const powerOn = (labAct === 0 || (labAct < 0 && act === 0 && tt < ACT_LEN)) ? (tt < 0.9 ? tt / 0.9 : -1) : -1;

    if (frameCounter > 0 && frameCounter % 90 === 0) {
      const previousScale = renderScale;
      if (frameCostAvg > 23 && renderScale > 0.75) renderScale = Math.max(0.75, renderScale - 0.1);
      else if (frameCostAvg < 10 && renderScale < 1.15) renderScale = Math.min(1.15, renderScale + 0.05);
      if (renderScale !== previousScale) resizeFBOs();
    }

    // ── choreography → uniforms ────────────────────────────────────────────
    const pp = phaseParams(labAct >= 0 ? (labAct * ACT_LEN + (T % ACT_LEN)) : tt);
    const mScale = reduced ? 0.3 : 1;
    const beatPh = (T / (pp.period * (reduced ? 1.6 : 1))) % 1;
    const beat = Math.pow(1 - beatPh, 1.7) * (reduced ? 0.6 : 1);
    energy = pp.energy * (0.7 + beat * 0.5);

    const rw = Math.max(2, Math.round(W * renderScale));
    const rh = Math.max(2, Math.round(H * renderScale));
    try {
      // pass 1: feedback simulation — read texA (previous frame), write texB
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbB);
      gl.viewport(0, 0, rw, rh);
      gl.useProgram(progScene);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texA);
      gl.uniform1i(gl.getUniformLocation(progScene, 'uPrev'), 0);
      gl.uniform2f(gl.getUniformLocation(progScene, 'uRes'), rw, rh);
      gl.uniform1f(gl.getUniformLocation(progScene, 'uT'), T);
      gl.uniform2f(gl.getUniformLocation(progScene, 'uGyro'), gx, gy);
      gl.uniform4f(gl.getUniformLocation(progScene, 'uWarp'),
        1 + (pp.zoom - 1) * mScale, pp.rot * mScale, pp.flowAmp * mScale, pp.flowScale);
      gl.uniform4f(gl.getUniformLocation(progScene, 'uFlow'),
        pp.dx, pp.dy, pp.swirl * mScale, pp.jitter * mScale);
      gl.uniform4f(gl.getUniformLocation(progScene, 'uLook'),
        pp.symN, pp.symAmt * (reduced ? 0.5 : 1), pp.decay, pp.hue * mScale);
      gl.uniform4f(gl.getUniformLocation(progScene, 'uDrive'),
        beat, pp.mode, pp.white * (reduced ? 0.4 : 1), pp.energy);
      gl.uniform4f(gl.getUniformLocation(progScene, 'uAux'), pp.u, reduced ? 1 : 0, pp.fog, 0);
      gl.uniform3f(gl.getUniformLocation(progScene, 'uPalA'), pp.palA_0, pp.palA_1, pp.palA_2);
      gl.uniform3f(gl.getUniformLocation(progScene, 'uPalB'), pp.palB_0, pp.palB_1, pp.palB_2);
      gl.uniform3f(gl.getUniformLocation(progScene, 'uPalC'), pp.palC_0, pp.palC_1, pp.palC_2);
      gl.uniform3f(gl.getUniformLocation(progScene, 'uPalD'), pp.palD_0, pp.palD_1, pp.palD_2);
      bindQuad(progScene);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, texB);
      gl.generateMipmap(gl.TEXTURE_2D);

      // pass 2: character screen — display texB to the real canvas
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(progPost);
      bindQuad(progPost);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texB);
      gl.uniform1i(gl.getUniformLocation(progPost, 'uScene'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(gl.getUniformLocation(progPost, 'uAtlas'), 1);
      gl.uniform2f(gl.getUniformLocation(progPost, 'uRes'), W, H);
      const cellPxX = Math.max(2.0, Math.min(3.0, W / 440.0));
      const cellPxY = cellPxX * 1.72;
      gl.uniform2f(gl.getUniformLocation(progPost, 'uCellPx'), cellPxX, cellPxY);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uTime'), T);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uGlitch'), glitch);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uPowerOn'), powerOn);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uFlash'), pp.white * (reduced ? 0.1 : 0.2) * 0.5);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uGrille'), 1.0);
      const asciiShift = reduced ? 0.42 : (0.62 + 0.12 * Math.sin(T * 0.31 + Math.sin(T * 0.09) * 0.5));
      gl.uniform1f(gl.getUniformLocation(progPost, 'uAsciiShift'), asciiShift);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // swap for the next frame
      const st = texA; texA = texB; texB = st;
      const sf = fbA; fbA = fbB; fbB = sf;
    } catch (e) {
      // A mid-run GL failure kills only the animation, never the game.
      running = false;
      dead = true;
      try { if (host.post) host.post({ type: 'glRuntimeError', message: String(e) }); } catch {}
      return;
    }

    drawWaveform();
    energyHist[energyIdx] = energy;
    energyIdx = (energyIdx + 1) % 64;
    energy *= 0.96;

    frameCostAvg = frameCostAvg * 0.92 + (Date.now() - t0) * 0.08;
    frameCounter++;
    rafId = host.raf(frame);
  }

  return {
    receive(msg) {
      if (!msg || dead) return;
      switch (msg.type) {
        case 'init':
          try {
            init(msg);
          } catch (e) {
            dead = true;
            try { if (host.post) host.post({ type: 'glInitError', message: String(e) }); } catch {}
          }
          break;
        case 'progress': progress = clamp(Number(msg.progress) || 0, 0, 1); break;
        case 'pointer':
          gxT = clamp(Number(msg.x) || 0, -1, 1);
          gyT = clamp(Number(msg.y) || 0, -1, 1);
          lastPointerAt = T;
          break;
        case 'stop':
          running = false;
          if (rafId != null) host.cancel(rafId);
          rafId = null;
          break;
        case 'start':
          if (!running && gl && !dead) { running = true; lastNow = 0; rafId = host.raf(frame); }
          break;
        case 'lab':
          if (msg.act !== undefined) labAct = Number(msg.act);
          labFreeze = !!msg.freeze;
          if (msg.t !== undefined) T = Number(msg.t);
          if (msg.reduced !== undefined) reduced = !!msg.reduced;
          break;
      }
    },
  };
}

// Stringify the engine for the worker. The factories are fully self-contained;
// shader sources travel through the host object.
const WORKER_BOOTSTRAP = (prefer2D) => `
const factoryGL = ${createEngineGL.toString()};
const factory2D = ${createEngine.toString()};
const sources = ${JSON.stringify(GL_SOURCES)};
const engine = ${prefer2D ? 'factory2D' : 'factoryGL'}({
  post: (m) => self.postMessage(m),
  raf: self.requestAnimationFrame ? (fn) => self.requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(Date.now()), 16),
  cancel: self.requestAnimationFrame ? (id) => self.cancelAnimationFrame(id) : (id) => clearTimeout(id),
  now: () => Date.now(),
  document: null,
  engine2D: factory2D,
  sources: sources,
});
self.onmessage = (e) => engine.receive(e.data);
`;

let activeTerminalInstance = null;

export function createTerminalArtwork({
  canvas,
  waveformCanvas,
  overlay,
  force2D = false,
  document: doc = globalThis.document,
} = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return {
      updateProgress() {}, start() {}, stop() {}, destroy() {},
    };
  }

  // Idempotent PER CANVAS. This element is set up from two places: the inline module in index.html
  // (bootstrapLoadingTerminal) and createLoadingPresenter, which calls this factory DIRECTLY and so
  // skips the activeTerminalInstance guard. Setting the same canvas up twice is fatal rather than
  // wasteful, because transferControlToOffscreen cannot be undone. Pinned by
  // test/loading-boot-resilience.test.mjs; do not drop this in a rewrite.
  if (canvas.__sfTerminalArt) return canvas.__sfTerminalArt;

  let worker = null;
  let workerUrl = null;
  let mainEngine = null;
  let mainRafId = null;
  let running = false;
  let startTime = 0;
  let currentProgress = 0.05;
  let currentStageId = 'loading';

  function isReducedMotion() {
    if (!doc) return false;
    try {
      if (doc.documentElement && doc.documentElement.classList && doc.documentElement.classList.contains('sf-reduce-motion')) return true;
      if (globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch {}
    return false;
  }

  function onPointerMove(e) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
    const ny = ((e.clientY - rect.top) / rect.height) * 2.0 - 1.0;
    if (worker) worker.postMessage({ type: 'pointer', x: nx, y: ny });
    else if (mainEngine) mainEngine.receive({ type: 'pointer', x: nx, y: ny });
  }
  if (overlay && typeof overlay.addEventListener === 'function') {
    overlay.addEventListener('pointermove', onPointerMove, { passive: true });
  }

  const nativeDpr = Number(globalThis.devicePixelRatio) || 1;
  const dpr = Math.min(4, Math.max(1, nativeDpr));
  const resolutionBoost = Math.min(5, Math.max(1, dpr * 1.35));
  const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 640, height: 380 };
  let w = Math.round((rect.width || 640) * resolutionBoost);
  let h = Math.round((rect.height || 380) * resolutionBoost);
  const MAX_RENDER_PIXELS = 6_000_000;
  const pixelCount = w * h;
  if (pixelCount > MAX_RENDER_PIXELS) {
    const scaleDown = Math.sqrt(MAX_RENDER_PIXELS / pixelCount);
    w = Math.max(2, Math.round(w * scaleDown));
    h = Math.max(2, Math.round(h * scaleDown));
  }
  const waveScale = Math.min(3, Math.max(1, dpr * 1.2));
  const waveWidth = Math.max(120, Math.round(200 * waveScale));
  const waveHeight = Math.max(40, Math.round(48 * waveScale));
  const reducedAtInit = isReducedMotion();
  try {
    canvas.width = w;
    canvas.height = h;
  } catch {}
  if (waveformCanvas) {
    try {
      waveformCanvas.width = waveWidth;
      waveformCanvas.height = waveHeight;
    } catch {}
  }

  // ── host selection ──────────────────────────────────────────────────────
  // transferControlToOffscreen is IRREVERSIBLE. After a successful transfer
  // there is no fallback context — if the Worker then fails we keep the
  // transferred OffscreenCanvas and drive the SAME engine on the main thread.
  // Pinned by test/loading-boot-resilience.test.mjs.
  let offscreen = null;
  let offscreenWave = null;
  // Engine health visibility: the worker posts glFallback / glInitError /
  // glRuntimeError when the artwork degrades. Nobody must ACT on these (the
  // artwork is decoration), but they should not vanish either — the dev lab
  // surfaces them via instance.__status() and the console gets one warn line.
  let engineStatus = 'boot';
  const recordStatus = (m) => {
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'glFallback') engineStatus = 'gl-fallback: ' + (m.reason || '?');
    else if (m.type === 'glInitError') engineStatus = 'gl-init-error: ' + (m.message || '?');
    else if (m.type === 'glRuntimeError') engineStatus = 'gl-runtime-error: ' + (m.message || '?');
    try { console.warn('[boot] loading artwork', engineStatus); } catch {}
  };
  try {
    if (
      typeof globalThis.Worker === 'function' &&
      typeof globalThis.Blob === 'function' &&
      typeof canvas.transferControlToOffscreen === 'function'
    ) {
      offscreen = canvas.transferControlToOffscreen();
      canvas.__sfTransferred = true; // irreversible from this line on
      try {
        offscreen.width = w;
        offscreen.height = h;
      } catch {}
      if (waveformCanvas && typeof waveformCanvas.transferControlToOffscreen === 'function') {
        offscreenWave = waveformCanvas.transferControlToOffscreen();
        waveformCanvas.__sfTransferred = true;
        try {
          offscreenWave.width = waveWidth;
          offscreenWave.height = waveHeight;
        } catch {}
      }
      const blob = new Blob([WORKER_BOOTSTRAP(force2D)], { type: 'application/javascript' });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      worker.onmessage = (e) => recordStatus(e && e.data);
      worker.postMessage(
        {
          type: 'init',
          canvas: offscreen,
          waveformCanvas: offscreenWave,
          width: w,
          height: h,
          waveWidth,
          waveHeight,
          reducedMotion: reducedAtInit,
        },
        offscreenWave ? [offscreen, offscreenWave] : [offscreen]
      );
    }
  } catch (err) {
    worker = null;
    try { console.warn('[boot] loading artwork worker unavailable; using main-thread render', err); } catch {}
  }

  // Main-thread engine: either the canvas was never transferred, or the
  // transfer succeeded but the worker died — in that case render straight
  // onto the OffscreenCanvas we still hold.
  const canUse2d = (el) => !!el && !el.__sfTransferred && typeof el.getContext === 'function';
  if (!worker) {
    const target = offscreen || (canUse2d(canvas) ? canvas : null);
    const targetWave = offscreenWave || (canUse2d(waveformCanvas) ? waveformCanvas : null);
    if (target && target.getContext) {
      try {
        try {
          target.width = w;
          target.height = h;
        } catch {}
        if (targetWave) {
          try {
            targetWave.width = waveWidth;
            targetWave.height = waveHeight;
          } catch {}
        }
        if (target === canvas) { canvas.width = w; canvas.height = h; }
        const hostMain = {
          post: () => {},
          raf: (fn) => (typeof globalThis.requestAnimationFrame === 'function'
            ? globalThis.requestAnimationFrame(fn)
            : setTimeout(() => fn(Date.now()), 16)),
          cancel: (id) => (typeof globalThis.cancelAnimationFrame === 'function'
            ? globalThis.cancelAnimationFrame(id)
            : clearTimeout(id)),
          now: () => Date.now(),
          document: doc,
          engine2D: createEngine,
          sources: GL_SOURCES,
          post: recordStatus,
        };
        mainEngine = force2D ? createEngine(hostMain) : createEngineGL(hostMain);
        mainEngine.receive({
          type: 'init',
          canvas: target,
          waveformCanvas: targetWave,
          width: w,
          height: h,
          waveWidth,
          waveHeight,
          reducedMotion: reducedAtInit,
        });
      } catch (err) {
        mainEngine = null;
        try { console.warn('[boot] loading artwork main-thread render failed; continuing without it', err); } catch {}
      }
    }
  }

  let lastDomTime = 0;
  const actTitles = [
    'SIGNAL_GENESIS // CONDENSATION',
    'DEEP_CURRENTS // FLOW STATE',
    'PRISM_BLOOM // SYMMETRY CASCADE',
    'TEMPEST_PROTOCOL // ION STORM',
    'SINGULARITY // EVENT HORIZON',
  ];
  const actLogs = [
    '[PHASE_01] SIGNAL_GENESIS // FIRST_LIGHT',
    '[PHASE_02] DEEP_CURRENTS // EMERALD_STREAMS',
    '[PHASE_03] PRISM_BLOOM // KALEIDO_FOLD',
    '[PHASE_04] TEMPEST_PROTOCOL // DISCHARGE',
    '[PHASE_05] SINGULARITY // COLLAPSE_AND_REBIRTH',
  ];

  function updateTelemetry(time) {
    if (time - lastDomTime < 90) return;
    lastDomTime = time;
    if (!overlay || typeof overlay.querySelector !== 'function') return;

    const clockEl = overlay.querySelector('[data-loading-clock]');
    if (clockEl) {
      const elapsed = (time - startTime) / 1000;
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(Math.floor(elapsed % 60)).padStart(2, '0');
      const ms = String(Math.floor((elapsed * 10) % 10));
      clockEl.textContent = `00:${mins}:${secs}.${ms}`;
    }

    const elapsed = (time - startTime) / 1000;
    const actIdx = Math.floor((elapsed % LOOP_SECONDS) / ACT_SECONDS) % ACT_COUNT;

    const diagStreamEl = overlay.querySelector('[data-loading-diag-stream]');
    if (diagStreamEl) {
      let html = '';
      for (let i = 0; i < actLogs.length; i++) {
        if (i < actIdx) {
          html += `<div class="boot-diag-line is-done"><span class="diag-tag">[OK]</span> ${actLogs[i]}</div>`;
        } else if (i === actIdx) {
          html += `<div class="boot-diag-line is-done is-latest"><span class="diag-tag">[⌖]</span> ${actLogs[i]}</div>`;
        } else {
          html += `<div class="boot-diag-line is-pending"><span class="diag-tag">[..]</span> ${actLogs[i]}</div>`;
        }
      }
      diagStreamEl.innerHTML = html;
    }

    const hexEl = overlay.querySelector('[data-loading-hex]');
    if (hexEl) {
      const baseAddr = 0x7fa0 + Math.floor((time / 160) % 64) * 0x10;
      const b1 = Math.floor(Math.sin(time * 0.003 + 1) * 127 + 128).toString(16).padStart(2, '0').toUpperCase();
      const b2 = Math.floor(Math.cos(time * 0.005 + 2) * 127 + 128).toString(16).padStart(2, '0').toUpperCase();
      hexEl.textContent = `0x${baseAddr.toString(16).toUpperCase()}: ${b1} ${b2} 53 46 20 4C 49 44 41 52 20 4F 4E`;
    }

    const subsysEl = overlay.querySelector('[data-loading-subsystems]');
    if (subsysEl) {
      const p = currentProgress;
      const pwr = Math.round(Math.min(100, 52 + p * 48));
      const ion = Math.round(Math.min(100, 20 + p * 80));
      const opt = Math.round(Math.min(100, 30 + p * 70));
      const nav = Math.round(Math.min(100, 40 + p * 60));

      const renderLedBar = (pct) => {
        const segs = 14;
        const activeCount = Math.round((pct / 100) * segs);
        let barHtml = '<div class="subsys-led-bar">';
        for (let s = 0; s < segs; s++) {
          const cls = s < activeCount ? 'subsys-seg active' : 'subsys-seg';
          barHtml += `<span class="${cls}"></span>`;
        }
        barHtml += '</div>';
        return barHtml;
      };

      subsysEl.innerHTML = `
        <div class="boot-subsys-row"><span class="subsys-name">PWR_CORE</span>${renderLedBar(pwr)}<span class="subsys-val">${pwr}%</span></div>
        <div class="boot-subsys-row"><span class="subsys-name">AVIONICS</span>${renderLedBar(ion)}<span class="subsys-val">${ion}%</span></div>
        <div class="boot-subsys-row"><span class="subsys-name">OPT_ARRAY</span>${renderLedBar(opt)}<span class="subsys-val">${opt}%</span></div>
        <div class="boot-subsys-row"><span class="subsys-name">NAV_LINK</span>${renderLedBar(nav)}<span class="subsys-val">${nav}%</span></div>
      `;
    }

    const segsEl = overlay.querySelector('[data-loading-segments]');
    const pctEl = overlay.querySelector('[data-loading-pct]');
    const stageNameEl = overlay.querySelector('[data-loading-stage-name]');
    if (segsEl) {
      const count = 28;
      const filled = Math.round(currentProgress * count);
      segsEl.textContent = `[${'█'.repeat(filled)}${'·'.repeat(Math.max(0, count - filled))}]`;
    }
    if (pctEl) pctEl.textContent = `${Math.round(currentProgress * 100)}%`;
    if (stageNameEl) stageNameEl.textContent = actTitles[actIdx];
  }

  const safeRaf = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (fn) => setTimeout(() => fn(Date.now()), 16);
  const safeCancelRaf = typeof globalThis.cancelAnimationFrame === 'function'
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : (id) => clearTimeout(id);

  function telemetryLoop(ts) {
    if (!running) return;
    if (!startTime) startTime = ts;
    updateTelemetry(ts);
    mainRafId = safeRaf(telemetryLoop);
  }

  const instance = {
    // Dev-lab diagnostics: last artwork engine health line ('boot' until the
    // engine reports, 'ok' once running, or a gl-fallback/gl-*-error reason).
    __status() { return engineStatus; },
    // Dev-lab passthrough (scripts/loading-terminal-lab.html). Forwards raw
    // engine messages ('lab' pins phases / freezes the clock). Harmless if the
    // host is gone.
    __engine: {
      receive(msg) {
        if (worker) worker.postMessage(msg);
        else if (mainEngine) mainEngine.receive(msg);
      },
    },
    start() {
      if (running) return;
      running = true;
      startTime = 0;
      if (worker) worker.postMessage({ type: 'start' });
      else if (mainEngine) mainEngine.receive({ type: 'start' });
      mainRafId = safeRaf(telemetryLoop);
    },
    stop() {
      running = false;
      if (overlay && typeof overlay.removeEventListener === 'function') {
        overlay.removeEventListener('pointermove', onPointerMove);
      }
      if (mainRafId != null) {
        safeCancelRaf(mainRafId);
        mainRafId = null;
      }
      if (worker) worker.postMessage({ type: 'stop' });
      else if (mainEngine) mainEngine.receive({ type: 'stop' });
    },
    updateProgress(stage = {}) {
      const amount = Math.max(0, Math.min(1, Number(stage.progress) || 0));
      currentProgress = amount;
      currentStageId = String(stage.id || 'loading');
      if (worker) worker.postMessage({ type: 'progress', progress: amount, id: currentStageId });
      else if (mainEngine) mainEngine.receive({ type: 'progress', progress: amount });
    },
    destroy() {
      this.stop();
      if (worker) {
        try { worker.terminate(); } catch {}
        worker = null;
      }
      if (workerUrl) {
        try { URL.revokeObjectURL(workerUrl); } catch {}
        workerUrl = null;
      }
      if (mainEngine) {
        try { mainEngine.receive({ type: 'stop' }); } catch {}
        mainEngine = null;
      }
      if (activeTerminalInstance === this) {
        activeTerminalInstance = null;
      }
    },
  };

  activeTerminalInstance = instance;
  if (canvas) canvas.__sfTerminalArt = instance;
  try { setTimeout(() => { if (engineStatus === 'boot') engineStatus = 'ok'; }, 1500); } catch {}
  return instance;
}

export function bootstrapLoadingTerminal(document = globalThis.document) {
  if (!document || typeof document.getElementById !== 'function') return null;
  if (activeTerminalInstance) return activeTerminalInstance;

  const canvas = document.getElementById('boot-terminal-canvas');
  const waveformCanvas = document.getElementById('boot-waveform-canvas');
  const overlay = document.getElementById('boot-overlay');

  if (!canvas) return null;
  const instance = createTerminalArtwork({ canvas, waveformCanvas, overlay, document });
  instance.start();
  return instance;
}
