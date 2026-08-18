/**
 * SpaceFace · Loading Terminal — "TACTICAL MAINFRAME" dot-matrix artwork engine
 *
 * One engine, two hosts. `createEngine` is fully self-contained (no module-scope
 * references) so the same source is stringified into the Web Worker and called
 * directly for the main-thread fallback. Both paths get the full animation.
 *
 * Rendering contract:
 *   120x60 character cells. Each cell carries TWO vertical subpixels via
 *   half/whole block glyphs ('█','▀','▄') with per-cell fg/bg colors — an
 *   effective 120x240 dot-matrix raster. Sparse areas fall back to a density
 *   ramp so the field still reads as terminal ASCII up close. Luminance is
 *   ordered-dithered (Bayer 8x8) against a 16-stop per-act color LUT before
 *   quantization, so shading gradients print like halftone instead of banding.
 *
 * Direction: five acts on a 32.5s loop, each with its own palette journey,
 * eased camera, beat structure, and glitch transition. Phosphor decay, bloom,
 * scanlines, vignette and a rolling retrace band close the CRT illusion.
 *
 * Lifecycle law (pinned by test/loading-boot-resilience.test.mjs): the artwork
 * is decoration. It must never throw out of boot, and losing it may only cost
 * the animation — never the game.
 */

// Act timing shared with the DOM telemetry below.
const ACT_COUNT = 5;
const ACT_SECONDS = 6.5;
const LOOP_SECONDS = ACT_COUNT * ACT_SECONDS;

/**
 * The engine. `host` abstracts the host thread:
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
  const zbuf = new Float32Array(N_SUB);    // act 3 depth buffer
  const emittedKey = new Int32Array(COLS * ROWS).fill(-2);

  // ─────────────────────────────────────────────────────────────────────────
  // Math helpers
  // ─────────────────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }
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
  // Palettes: per act, main + accent, 16 stops each (anchors interpolate)
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
    { // Act 1 · Ghost in the Wire — neural emerald + violet
      main: buildLUT(['#02100c', '#073a2c', '#0d7a5c', '#17b58c', '#3fe6ba', '#b8ffe8']),
      accent: buildLUT(['#0e0618', '#2c1850', '#583493', '#8a5cd6', '#c9aeff', '#f1eaff']),
      bg: '#030806',
    },
    { // Act 2 · Night Metropolis — amber + hot magenta neon
      main: buildLUT(['#0c0703', '#331f07', '#6d440c', '#a8721a', '#e3a52c', '#ffe9b8']),
      accent: buildLUT(['#17040c', '#571030', '#a01d55', '#e0418a', '#ff8fc0', '#ffd9e9']),
      bg: '#0a0604',
    },
    { // Act 3 · Kinetic Intercept — navy cyan + incendiary orange
      main: buildLUT(['#030812', '#0a2338', '#155d85', '#2ba4cd', '#5adcf2', '#d8f6ff']),
      accent: buildLUT(['#170702', '#57220b', '#a34a10', '#e07822', '#ffa95e', '#ffe3c2']),
      bg: '#04070e',
    },
    { // Act 4 · Aperture — void purple + machine red
      main: buildLUT(['#070312', '#1d0f3c', '#42207e', '#7347c4', '#a87cf0', '#e9dbff']),
      accent: buildLUT(['#160409', '#480d1c', '#8c1830', '#cf3a4e', '#ff7d8a', '#ffd6da']),
      bg: '#06030d',
    },
    { // Act 5 · Hyperwarp — vasimr cyan + electric lime
      main: buildLUT(['#020d13', '#073248', '#0e6e94', '#22acd4', '#5adcf2', '#dcfaff']),
      accent: buildLUT(['#07130a', '#1c5122', '#3f9a37', '#72d84f', '#a9f97e', '#eaffdc']),
      bg: '#030a0f',
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // 5x7 bitmap font — real letterforms, never density-character noise
  // ─────────────────────────────────────────────────────────────────────────
  const FONT = {
    'A': '01110 10001 10001 11111 10001 10001 10001', 'B': '11110 10001 11110 10001 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110', 'D': '11110 10001 10001 10001 10001 10001 11110',
    'E': '11111 10000 11110 10000 10000 10000 11111', 'F': '11111 10000 11110 10000 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111', 'H': '10001 10001 11111 10001 10001 10001 10001',
    'I': '01110 00100 00100 00100 00100 00100 01110', 'J': '00111 00010 00010 00010 00010 10010 01100',
    'K': '10001 10010 11100 10010 10001 10001 10001', 'L': '10000 10000 10000 10000 10000 10000 11111',
    'M': '10001 11011 10101 10101 10001 10001 10001', 'N': '10001 11001 10101 10011 10001 10001 10001',
    'O': '01110 10001 10001 10001 10001 10001 01110', 'P': '11110 10001 10001 11110 10000 10000 10000',
    'Q': '01110 10001 10001 10001 10101 10010 01101', 'R': '11110 10001 10001 11110 10010 10001 10001',
    'S': '01111 10000 10000 01110 00001 00001 11110', 'T': '11111 00100 00100 00100 00100 00100 00100',
    'U': '10001 10001 10001 10001 10001 10001 01110', 'V': '10001 10001 10001 10001 10001 01010 00100',
    'W': '10001 10001 10001 10101 10101 11011 10001', 'X': '10001 01010 00100 00100 01010 10001 10001',
    'Y': '10001 10001 01010 00100 00100 00100 00100', 'Z': '11111 00001 00010 00100 01000 10000 11111',
    '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00110 01000 10000 11111', '3': '11111 00010 00100 00110 00001 10001 01110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
    '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
    ':': '00000 01100 01100 00000 01100 01100 00000', ';': '00000 01100 01100 00000 01100 00100 01000',
    '-': '00000 00000 00000 11111 00000 00000 00000', '_': '00000 00000 00000 00000 00000 00000 11111',
    '/': '00001 00010 00010 00100 01000 01000 10000', '\\': '10000 01000 01000 00100 00010 00010 00001',
    '|': '00100 00100 00100 00100 00100 00100 00100', '(': '00010 00100 01000 01000 01000 00100 00010',
    ')': '01000 00100 00010 00010 00010 00100 01000', '[': '01110 01000 01000 01000 01000 01000 01110',
    ']': '01110 00010 00010 00010 00010 00010 01110', '<': '00010 00100 01000 10000 01000 00100 00010',
    '>': '01000 00100 00010 00001 00010 00100 01000', '=': '00000 11111 00000 11111 00000 00000 00000',
    '+': '00000 00100 00100 11111 00100 00100 00000', '*': '00000 10101 01110 11111 01110 10101 00000',
    '#': '01010 11111 01010 01010 11111 01010 00000', '%': '11001 11010 00010 00100 01000 01011 10011',
    '@': '01110 10001 10111 10101 10111 10000 01110', '!': '00100 00100 00100 00100 00100 00000 00100',
    '?': '01110 10001 00001 00110 00100 00000 00100', "'": '00100 00100 01000 00000 00000 00000 00000',
    '·': '00000 00000 00000 01100 01100 00000 00000', ' ': '00000 00000 00000 00000 00000 00000 00000',
  };

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
  function forcePx(x, y, l, t) {
    x |= 0; y |= 0;
    if (x < 0 || x >= SW || y < 0 || y >= SH) return;
    const i = y * SW + x;
    lum[i] = l; tint[i] = t || 0;
  }
  function line(x0, y0, x1, y1, l, t) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    if (steps <= 0) { px(x0, y0, l, t); return; }
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      px(lerp(x0, x1, f), lerp(y0, y1, f), l, t);
    }
  }
  function addLine(x0, y0, x1, y1, l, t) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    if (steps <= 0) { addPx(x0, y0, l, t); return; }
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      addPx(lerp(x0, x1, f), lerp(y0, y1, f), l, t);
    }
  }
  function disc(cx, cy, r, l, t) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) px(x, y, l, t);
      }
    }
  }
  function ring(cx, cy, r, w, l, t) {
    const rOut = r + w, rIn = r - w;
    for (let y = Math.floor(cy - rOut); y <= cy + rOut; y++) {
      for (let x = Math.floor(cx - rOut); x <= cx + rOut; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= rOut && d >= rIn) px(x, y, l * clamp(w + 1 - Math.abs(d - r), 0, 1), t);
      }
    }
  }
  function drawText(str, x, y, l, t, scale) {
    scale = scale || 1;
    let cx = x;
    for (let i = 0; i < str.length; i++) {
      const g = FONT[str[i]] || FONT['?'];
      const rows = g.split(' ');
      for (let ry = 0; ry < 7; ry++) {
        const row = rows[ry];
        for (let rx = 0; rx < 5; rx++) {
          if (row[rx] === '1') {
            if (scale === 1) px(cx + rx, y + ry, l, t);
            else for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++)
              px(cx + rx * scale + sx, y + ry * scale + sy, l, t);
          }
        }
      }
      cx += 6 * scale;
    }
  }
  const textW = (s, scale) => s.length * 6 * (scale || 1) - (scale || 1);

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
    return (52.9829189 * (f - Math.floor(f)));
  }

  // Density ramp for sparse cells (ASCII texture identity)
  const DENSITY_L = [0.02, 0.055, 0.09, 0.13, 0.18, 0.24, 0.31, 0.42, 0.55, 0.72];
  const ATLAS_CHARS = ['·', ':', '+', '=', 'x', '*', '#', '%', '@', '▒'];

  // ─────────────────────────────────────────────────────────────────────────
  // ACT 1 · GHOST IN THE WIRE — shaded android portrait (layered SDF)
  // ─────────────────────────────────────────────────────────────────────────
  function act1(u) {
    const turn = clamp(gx * 0.45 + Math.sin(T * 0.35) * 0.12, -0.5, 0.5);
    const pitch = clamp(gy * 0.18 + Math.sin(T * 0.23 + 1) * 0.05, -0.3, 0.3);
    const cx = SW * 0.5 + turn * 5;
    const cy = 58 + pitch * 8;
    const breath = Math.sin(T * 1.1) * 0.7;

    // ambient: neural grid + motes + back glow
    for (let y = 0; y < SH; y += 6) for (let x = ((y / 6) | 0) % 2 * 4; x < SW; x += 9)
      px(x, y, 0.10 + vnoise(x * 0.08, y * 0.08 + T * 0.05) * 0.06, 0);
    for (let i = 0; i < 26; i++) {
      const mx = (hash1(i * 7.3) * SW + T * (2 + hash1(i) * 3)) % SW;
      const my = (hash1(i * 3.1) * SH + Math.sin(T * 0.6 + i) * 6 + SH) % SH;
      px(mx, my, 0.16 + hash1(i * 13) * 0.1, 1);
    }
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x += 2) {
      const d = Math.hypot(x - cx, (y - cy) * 1.25);
      if (d < 46) addPx(x, y, (1 - d / 46) * 0.10, 1);
    }

    // head SDF + feature bump field
    const hx0 = Math.max(0, (cx - 36) | 0), hx1 = Math.min(SW - 1, (cx + 36) | 0);
    const hy0 = Math.max(0, (cy - 44) | 0), hy1 = Math.min(SH - 1, (cy + 52) | 0);

    function sdHead(pxx, pyy) {
      let dx = (pxx - (cx + turn * 3)) / 24, dy = (pyy - (cy - 6 + breath)) / 28;
      let d = Math.sqrt(dx * dx + dy * dy) - 1;
      dx = (pxx - (cx + turn * 8)) / 15.5; dy = (pyy - (cy + 16 + breath)) / 17;
      const dJ = Math.sqrt(dx * dx + dy * dy) - 1;
      const k = 0.35;
      const h = clamp(0.5 + 0.5 * (dJ - d) / k, 0, 1);
      d = lerp(d, dJ, h) - k * h * (1 - h);
      dx = Math.abs(pxx - (cx + turn * 8)) / 11; dy = (pyy - (cy + 34)) / 10;
      const dC = 1 - Math.sqrt(dx * dx + dy * dy);
      if (dC < 0.6) d = Math.max(d, dC);
      return d;
    }
    // hair: swept side-bob on the organic (left) side + crown mass; the cyber
    // side is shaved with circuit traces instead. Negative = inside hair.
    function sdHair(pxx, pyy) {
      const hx0 = cx + turn * 3, hy0 = cy - 8 + breath;
      // crown + left curtain: ellipse bigger than the skull, biased left
      let dx = (pxx - (hx0 - 3)) / 26.5, dy = (pyy - (hy0 - 2)) / 30;
      let d = Math.sqrt(dx * dx + dy * dy) - 1;
      // right edge of the curtain sweeps from temple to jaw (diagonal)
      const sweep = hx0 + 9 - (pyy - (cy - 8)) * 0.28;
      if (pxx > sweep && pyy > cy - 26) d = Math.max(d, (sweep - pxx) / 8);
      // fringe across the forehead
      if (pyy > cy - 24 && pyy < cy - 16 && pxx < sweep + 2) {
        const fringe = cy - 22 + Math.sin((pxx - hx0) * 0.35) * 1.6;
        d = Math.min(d, (pyy - fringe) / 3);
      }
      return d;
    }
    function featureBump(pxx, pyy) {
      let b = 0;
      if (pyy > cy - 2 && pyy < cy + 10) {
        const side = pxx - cx - turn * 6;
        b += 0.35 * Math.exp(-Math.pow((Math.abs(side) - 14) / 4.5, 2)) * Math.exp(-Math.pow((pyy - cy - 3) / 6, 2));
      }
      b += 0.3 * Math.exp(-Math.pow((pyy - (cy - 12)) / 2.6, 2)) * Math.exp(-Math.pow((pxx - cx - turn * 5) / 16, 4));
      b += 0.5 * Math.exp(-Math.pow((pxx - (cx + turn * 7)) / 2.2, 2)) * Math.exp(-Math.pow((pyy - (cy + 2)) / 10, 2));
      return b;
    }
    const blink = (T % 4.3) < 0.14 ? 1 : 0;

    for (let y = hy0; y <= hy1; y++) {
      for (let x = hx0; x <= hx1; x++) {
        const d = sdHead(x + 0.5, y + 0.5);
        const dH = sdHair(x + 0.5, y + 0.5);
        const aa = clamp(-d * 1.6 + 0.5, 0, 1);
        if (aa <= 0) {
          // hair extends past the skull silhouette — draw it with its own edge
          if (dH < 0.4) {
            const strand = Math.max(0, Math.sin(y * 1.5 + x * 0.28 + turn * 8));
            let hl = 0.10 + strand * strand * 0.22 + vnoise(x * 0.3, y * 0.12) * 0.08;
            if (dH > -1.6) hl += 0.12; // rim light on the hair edge
            px(x, y, hl, 1);
          }
          continue;
        }
        if (dH < 0) {
          // hair over the face region: dark mass with flowing strand sheen
          const strand = Math.max(0, Math.sin(y * 1.5 + x * 0.28 + turn * 8));
          let hl = 0.08 + strand * strand * 0.3 + vnoise(x * 0.3, y * 0.12) * 0.06;
          if (dH > -1.6) hl += 0.14;
          forcePx(x, y, hl, 1);
          continue;
        }
        const e = 1.2;
        const nx = sdHead(x + 0.5 + e, y + 0.5) - sdHead(x + 0.5 - e, y + 0.5);
        const ny = sdHead(x + 0.5, y + 0.5 + e) - sdHead(x + 0.5, y + 0.5 - e);
        const bump = featureBump(x, y);
        let gxx = -nx - (featureBump(x + 1, y) - featureBump(x - 1, y)) * 0.5;
        let gyy = ny + (featureBump(x, y + 1) - featureBump(x, y - 1)) * 0.5;
        const gl = Math.hypot(gxx, gyy) || 1;
        gxx /= gl; gyy /= gl;
        // key light upper-left (emerald), rim from the right in violet.
        // Shading is kept in the mid range — only authored highlights may
        // exceed 1.0 so the anamorphic streak pass stays meaningful.
        const diff = clamp(0.42 + (gxx * 0.55 + gyy * 0.75) * 0.7 + bump * 0.65, 0, 1);
        let rim = clamp(1 - Math.abs(gxx - 0.85), 0, 1);
        rim = rim * rim;
        const rimT = x > cx + turn * 5 ? 1 : 0;
        let l = 0.10 + diff * 0.5 + rim * 0.42;
        if (x > cx + turn * 6 + 4) { // cyber half: panel seams + lattice
          const seam = Math.sin((x - cx) * 0.9 + (y - cy) * 0.35 + turn * 4) > 0.86 ? 0.5 : 0;
          l *= 1 - seam;
          if (((x * 13 + y * 7) % 31) === 0 && d < -3) l += 0.1;
        }
        if (y < cy - 18 && Math.abs(x - cx - turn * 2) < 15) l += 0.12 * Math.exp(-Math.pow((y - (cy - 26)) / 5, 2));
        forcePx(x, y, l * aa, rim > 0.25 ? rimT : 0);
      }
    }

    // neck + shoulders
    for (let y = cy + 26; y < SH; y++) {
      const t = clamp((y - cy - 26) / 26, 0, 1);
      const w = 8 + t * 26;
      for (let x = Math.round(cx - w + turn * 4); x <= cx + w + turn * 4; x++) {
        const edge = 1 - Math.abs(x - cx - turn * 4) / w;
        px(x, y, (0.14 + edge * 0.3) * (1 - t * 0.3), 0);
      }
    }

    // cranial cables with data pulses
    const pulse = (T * 0.55) % 1;
    for (let c = 0; c < 7; c++) {
      const side = c % 2 === 0 ? -1 : 1;
      const rootX = cx + side * (17 + (c % 3) * 2.4) + turn * 3;
      const rootY = cy - 22 + ((c / 2) | 0) * 7 + breath;
      const endX = cx + side * (46 + hash1(c * 9) * 12);
      const endY = SH - 2 - hash1(c * 5) * 8;
      for (let s = 0; s <= 46; s++) {
        const f = s / 46;
        const sag = Math.sin(f * Math.PI) * (10 + hash1(c * 3) * 8) * (1 - f * 0.3);
        const wob = Math.sin(T * 1.3 + c * 2 + f * 5) * 1.4 * f;
        const bx = lerp(rootX, endX, f) + wob * 0.4;
        const by = lerp(rootY, endY, f) + sag + wob;
        px(bx, by, 0.3 + 0.12 * Math.sin(f * 40 + c), 1);
        px(bx, by + 1, 0.2, 1);
        const pf = (pulse + c * 0.143) % 1;
        if (Math.abs(f - pf) < 0.05) { addPx(bx, by, 0.9, 1); addPx(bx + 1, by, 0.5, 1); }
      }
      px(rootX, rootY, 0.9, 1); px(rootX + side, rootY, 0.6, 1);
    }

    // features (parallax planes)
    const fx = (depth) => cx + turn * depth;
    const eyeY = cy - 8 + breath;
    for (let s = -4; s <= 4; s++) {
      px(fx(7) - 8 + s, eyeY - 5 + Math.round(Math.abs(s) * 0.4), 0.85, 0);
      px(fx(7) + 8 + s, eyeY - 5 + Math.round(Math.abs(s) * 0.4), 0.85, 0);
    }
    const lex = fx(8) - 8;
    if (blink) {
      line(lex - 4, eyeY, lex + 4, eyeY, 0.8, 0);
    } else {
      for (let s = -4; s <= 4; s++) {
        const lid = Math.round((1 - Math.abs(s) / 4) * 1.8);
        px(lex + s, eyeY - lid, 0.9, 0);
        px(lex + s, eyeY + lid, 0.55, 0);
      }
      disc(lex, eyeY, 2, 0.55, 0);
      forcePx(lex, eyeY, 0.14, 0);            // pupil
      forcePx(lex + 1, eyeY - 1, 1.2, 0);     // glint -> anamorphic streak
    }
    const rex = fx(9) + 8;
    ring(rex, eyeY, 4.4, 0.8, 0.9, 1);
    for (let a = 0; a < 8; a++) {
      const ang = T * 2.4 + a * Math.PI / 4;
      px(rex + Math.cos(ang) * 6.2, eyeY + Math.sin(ang) * 3.4, 0.95, 1);
    }
    line(rex - 2, eyeY, rex + 2, eyeY, 0.9, 1);
    line(rex, eyeY - 2, rex, eyeY + 2, 0.9, 1);
    forcePx(rex, eyeY, 1.5, 1);
    if ((T % 2.1) < 0.5) {
      const b = 8 + Math.sin(T * 20) * 0.6;
      line(rex - b, eyeY - 4, rex - b, eyeY - 2, 0.7, 1);
      line(rex + b, eyeY - 4, rex + b, eyeY - 2, 0.7, 1);
      line(rex - b, eyeY + 4, rex - b, eyeY + 2, 0.7, 1);
      line(rex + b, eyeY + 4, rex + b, eyeY + 2, 0.7, 1);
    }

    const nx = fx(9);
    line(nx - 1, eyeY + 3, nx - 1, cy + 8, 0.75, 0);
    px(nx, cy + 8, 0.9, 0); px(nx - 2, cy + 9, 0.7, 0); px(nx + 1, cy + 9, 0.7, 0);
    // lips: solid lens mass with a dark seam and a gloss highlight
    const my = cy + 14;
    for (let dy = 0; dy <= 3; dy++) {
      const w = dy === 0 ? 4 : dy === 1 ? 6 : dy === 2 ? 5 : 3;
      const shade = dy === 1 ? 0.6 : dy === 2 ? 0.48 : 0.34;
      for (let dx2 = -w; dx2 <= w; dx2++) px(nx + dx2, my + dy, shade, 0);
    }
    for (let dx2 = -5; dx2 <= 5; dx2++) forcePx(nx + dx2, my + 1, 0.16, 0); // mouth seam
    addPx(nx - 1, my + 2, 0.4, 0); addPx(nx + 1, my + 2, 0.4, 0);           // gloss
    line(nx - 2, my - 1, nx + 2, my - 1, 0.3, 0);                           // philtrum
    line(nx - 3, my + 4, nx + 3, my + 4, 0.22, 0);                          // under-lip

    const pY = cy - 20;
    for (let i = -2; i <= 2; i++) px(fx(6) + i * 2, pY, i === 0 ? 1.3 : 0.8, 1);
    line(fx(6) - 6, pY - 2, fx(6) + 6, pY - 2, 0.4, 0);

    const scanY = ((T * 40) % (SH + 30)) - 15;
    if (scanY >= 0 && scanY < SH) for (let x = 0; x < SW; x++) addPx(x, scanY, 0.22, 0);

    drawText('01 · GHOST IN THE WIRE', 3, 3, 0.85, 1);
    const bio = (98.2 + Math.sin(T * 1.7) * 1.2).toFixed(1);
    drawText('NEURAL_SYNC ' + bio + '%', 3, SH - 11, 0.6, 0);
    energy = 0.25 + (blink ? 0.35 : 0) + Math.max(0, Math.sin(T * 2.4)) * 0.1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACT 2 · NIGHT METROPOLIS — canyon flythrough, wet reflections
  // ─────────────────────────────────────────────────────────────────────────
  const CITY = { buildings: [], zHead: 0, act: -1 };
  function cityBuilding(z, side, seed) {
    return {
      z, side, seed,
      w: 14 + hash1(seed * 1.7) * 16,
      h: 42 + hash1(seed * 2.3) * 46,
      depth: 26 + hash1(seed * 3.1) * 22,
      style: (hash1(seed * 5.9) * 3) | 0,
      xOff: hash1(seed * 7.7) * 10,
    };
  }
  function initCity() {
    CITY.buildings.length = 0;
    CITY.zHead = 0;
    for (let i = 0; i < 14; i++) {
      CITY.zHead += 26 + hash1(i * 3.7) * 18;
      CITY.buildings.push(cityBuilding(CITY.zHead, i % 2 === 0 ? -1 : 1, i * 13.7 + 3));
    }
  }
  function act2(u) {
    // act-local camera: re-seed the canyon each time the act starts
    if (CITY.act !== 1) { initCity(); CITY.act = 1; }
    const camZ = u * ACT_LEN * 26 + 20;
    const horizon = 34 + u * 10;
    const f = 46;

    for (let y = 0; y < horizon; y++) {
      const g = Math.pow(1 - y / horizon, 1.6);
      for (let x = 0; x < SW; x += 2) addPx(x, y, 0.08 + g * 0.22, 0);
    }
    for (let layer = 0; layer < 2; layer++) {
      const off = camZ * (layer === 0 ? 0.06 : 0.14);
      const base = horizon + layer * 3;
      for (let i = 0; i < 30; i++) {
        const bw = 4 + hash1(i * 3.3 + layer) * 7;
        const bx = ((i * 11 + layer * 5 - off * 0.35) % 130 + 130) % 130 - 5;
        const bh = 8 + hash1(i * 7.1 + layer * 3) * (layer === 0 ? 10 : 17);
        const dim = layer === 0 ? 0.35 : 0.5;
        for (let y = (base - bh) | 0; y < base; y++) for (let x = Math.round(bx); x < bx + bw; x++)
          px(x, y, dim + hash2(x, y) * 0.06, 0);
        if (layer === 1) for (let wI = 0; wI < 4; wI++)
          if (hash1(i * 31 + wI) > 0.6) {
            const wy = (base - bh + 2 + ((wI * 5) % Math.max(1, (bh - 3) | 0))) | 0;
            px(bx + 1 + (wI % 3) * 2, wy, 0.8, 1);
          }
      }
    }
    for (let y = horizon; y < SH; y++) for (let x = 0; x < SW; x += 2)
      addPx(x, y, 0.04 + (y - horizon) / (SH - horizon) * 0.05, 0);

    // lightning (twice per act)
    const bolt1 = Math.abs(u - 0.5) < 0.012, bolt2 = Math.abs(u - 0.82) < 0.008;
    const flash = (bolt1 || bolt2) && !reduced;
    if (flash) {
      for (let y = 0; y < horizon; y++) for (let x = 0; x < SW; x += 2) addPx(x, y, 0.28, 0);
      let bx = 20 + hash1(T) * 80, by = 0;
      while (by < horizon - 4) {
        const nx2 = bx + (hash1(by * 3.1 + T) - 0.5) * 10;
        const ny2 = by + 3 + hash1(by) * 3;
        addLine(bx, by, nx2, ny2, 1.4, 1);
        bx = nx2; by = ny2;
      }
    }

    // recycle buildings behind the camera, then draw far → near
    for (let i = 0; i < CITY.buildings.length; i++) {
      const b = CITY.buildings[i];
      if (b.z - camZ < 4) {
        CITY.zHead += 26 + hash1(T + i * 3.3) * 18;
        const nb = cityBuilding(CITY.zHead, b.side, hash1(T + i * 7.1) * 100);
        CITY.buildings[i] = nb;
      }
    }
    CITY.buildings.sort((a, b2) => b2.z - a.z);

    for (let bIdx = 0; bIdx < CITY.buildings.length; bIdx++) {
      const b = CITY.buildings[bIdx];
      const zRel = b.z - camZ;
      if (zRel < 4) continue;
      const s = f / zRel;
      const wallX = (34 + b.xOff) * b.side;
      const x0 = SW / 2 + wallX * s;
      const x1 = SW / 2 + (wallX - b.w * b.side) * s;
      const topY = horizon - b.h * s;
      const botY = horizon + 6 * s;
      const left = Math.max(0, Math.round(Math.min(x0, x1)));
      const right = Math.min(SW - 1, Math.round(Math.max(x0, x1)));
      if (right < 0 || left >= SW || botY < 0 || topY >= SH) continue;
      const haze = clamp(1 - zRel / 240, 0.25, 1);
      const near = clamp((120 - zRel) / 90, 0, 1);

      for (let y = Math.max(0, topY | 0); y < Math.min(SH, botY); y++) {
        const vy = clamp((y - topY) / Math.max(1, botY - topY), 0, 1);
        const face = 0.2 + vy * 0.1;
        for (let x = left; x <= right; x++)
          px(x, y, face * haze * (0.8 + hash2(x * 0.5, y * 0.5) * 0.35), 0);
      }
      const wStep = Math.max(2, Math.round(7.8 * s));
      const hStep = Math.max(2, Math.round(FLOOR_H * s));
      for (let wy = (topY | 0) + hStep; wy < botY - 1; wy += hStep) {
        for (let wx = left + 1; wx < right; wx += wStep) {
          const lit = hash2(b.seed, (wx / wStep | 0) * 13.3 + (wy / hStep | 0) * 7.7);
          if (lit > 0.42) {
            const flick = hash1(lit * 977 + ((T * 0.4 + lit * 40) % 1)) > 0.985 ? 0.3 : 1;
            const wl = (0.6 + lit * 0.55) * haze * flick * (1 - near * 0.25);
            px(wx, wy, wl, b.style === 2 ? 1 : 0);
            if (wStep > 3) px(wx + 1, wy, wl * 0.8, b.style === 2 ? 1 : 0);
          }
        }
      }
      const ax = (x0 + x1) / 2;
      if (topY > 2) {
        addLine(ax, topY, ax, topY - 18 * s, 0.5 * haze, 0);
        if (Math.sin(T * 5 + b.seed) > 0.4) px(ax, topY - 18 * s, 1.2 * haze, 1);
      }
      if (b.style === 1 && zRel < 170 && topY > 8) {
        const bw2 = Math.min(right - left - 2, 30);
        const by0 = Math.round(topY + 8 + hash1(b.seed) * 20);
        const bx0 = Math.round((left + right) / 2 - bw2 / 2);
        for (let y = by0; y < by0 + 11; y++) for (let x = bx0; x < bx0 + bw2; x++)
          px(x, y, 0.14 * haze, 1);
        const ads = ['KAIJU', 'TETSUO', 'ARYA+CO', 'NEO·GEAR'];
        const ad = ads[(b.seed | 0) % ads.length];
        const drift = ((T * 4) % (bw2 + textW(ad))) | 0;
        drawText(ad, bx0 + bw2 - drift, by0 + 2, 1.0 * haze, 1);
        for (let x = bx0; x < bx0 + bw2; x += 2) { px(x, by0, 0.7 * haze, 1); px(x, by0 + 10, 0.7 * haze, 1); }
      }
      for (let y = Math.max(0, topY | 0); y < Math.min(SH, botY); y += 2)
        for (let x = left; x <= right; x += 2) addPx(x, y, 0.03 * (1 - haze), 0);
    }

    // AV traffic lanes
    for (let lane = 0; lane < 3; lane++) {
      const ly = (horizon + 6 + lane * 9) | 0;
      const dir = lane % 2 === 0 ? 1 : -1;
      const speed = 26 + lane * 9;
      for (let vI = 0; vI < 5; vI++) {
        const vx0 = ((T * speed * dir + vI * 34 + lane * 11) % (SW + 30) + SW + 30) % (SW + 30) - 15;
        const vx = dir > 0 ? vx0 : SW - vx0;
        px(vx, ly, 1.3, 0);
        px(vx, ly + 1, 0.9, 0);
        addLine(vx, ly + 1, vx - dir * (7 + lane * 3), ly + 1, 0.55, 1);
        addLine(vx + dir * 2, ly + 1, vx + dir * 5, ly + 1, 0.3, 0);
      }
      for (let x = 0; x < SW; x += 4) px(x, ly + 2, 0.1, 0);
    }

    // rain
    for (let i = 0; i < 70; i++) {
      const depth = hash1(i * 17.7);
      const rx = (hash1(i * 3.3) * SW + T * (10 + depth * 26)) % SW;
      const ry = (hash1(i * 9.1) * SH + T * (55 + depth * 70)) % SH;
      addLine(rx, ry, rx - 1, ry + 1 + depth * 3, 0.12 + depth * 0.16, 0);
    }

    // foreground gantry sweep
    const gPh = (T * 0.22) % 1;
    if (gPh > 0.62 && gPh < 0.75) {
      const gx0 = easeInCubic((gPh - 0.62) / 0.13) * (SW + 60) - 30;
      for (let y = 0; y < SH; y++) {
        const w = y < 30 ? 10 : 4;
        for (let x = Math.round(gx0 - w); x < gx0 + w; x++) forcePx(x, y, 0.03, 0);
      }
    }

    // wet-ground reflection: smeared, rippled vertical streaks of the towers
    const groundY = (horizon + 14) | 0;
    for (let y = groundY; y < SH; y++) {
      const src = Math.max(0, 2 * groundY - y);
      const fall = clamp(1 - (y - groundY) / (SH - groundY), 0, 1);
      for (let x = 0; x < SW; x++) {
        const ripple = Math.round(2 * Math.sin(y * 0.8 + T * 2.5) + 1.5 * Math.sin(y * 0.31 + T * 1.2));
        const sx = clamp(x + ripple, 0, SW - 1);
        const srcL = lum[src * SW + sx] || 0;
        if (srcL > 0.12) addPx(x, y, srcL * fall * 1.05 * (0.55 + vnoise(x * 0.2, y * 0.6 + T * 2) * 0.5), tint[src * SW + sx]);
      }
    }

    drawText('02 · SECTOR 09 NIGHT METROPOLIS', 3, 3, 0.85, 1);
    drawText('ELEV +1420M · TRAFFIC DENSE', 3, SH - 11, 0.6, 0);
    energy = 0.35 + (flash ? 0.6 : 0) + Math.max(0, Math.sin(T * 3.1)) * 0.08;
  }
  const FLOOR_H = 3.4;

  // ─────────────────────────────────────────────────────────────────────────
  // ACT 3 · KINETIC INTERCEPT — 3D dogfight + staged detonation
  // ─────────────────────────────────────────────────────────────────────────
  const projX = new Float32Array(8), projY = new Float32Array(8);
  let camAng = 0, camH = 0;
  function toCamX(px_, pz_) { return px_ * Math.cos(camAng) - pz_ * Math.sin(camAng); }
  function toCamZ(px_, pz_) { return px_ * Math.sin(camAng) + pz_ * Math.cos(camAng) + 58; }
  // project into shared scratch [sx, sy, z]; returns null if behind camera
  const P = new Float32Array(3);
  function project(x, y, z) {
    const cz = toCamZ(x, z);
    if (cz < 2) return null;
    const s = 72 / cz;
    P[0] = SW / 2 + toCamX(x, z) * s;
    P[1] = 62 - (y - camH) * s;
    P[2] = cz;
    return P;
  }
  function fillPoly3D(pts, shade, t) {
    let zRef = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = project(pts[i][0], pts[i][1], pts[i][2]);
      if (!p) return;
      if (i === 0) zRef = p[2];
      else if (Math.abs(p[2] - zRef) > 60) return;
      projX[i] = p[0]; projY[i] = p[1];
    }
    const n = pts.length;
    if (n < 3) return;
    let yMin = 1e9, yMax = -1e9;
    for (let i = 0; i < n; i++) { yMin = Math.min(yMin, projY[i]); yMax = Math.max(yMax, projY[i]); }
    yMin = Math.max(0, Math.ceil(yMin)); yMax = Math.min(SH - 1, Math.floor(yMax));
    for (let y = yMin; y <= yMax; y++) {
      let xl = 1e9, xr = -1e9;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const y0 = projY[i], y1 = projY[j];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          const f = (y - y0) / (y1 - y0);
          const x = lerp(projX[i], projX[j], f);
          xl = Math.min(xl, x); xr = Math.max(xr, x);
        }
      }
      if (xr < xl) continue;
      const xi0 = Math.max(0, Math.ceil(xl)), xi1 = Math.min(SW - 1, Math.floor(xr));
      for (let x = xi0; x <= xi1; x++) {
        const idx = y * SW + x;
        if (zRef < zbuf[idx]) { zbuf[idx] = zRef; forcePx(x, y, shade, t); }
      }
    }
  }
  const FRIG_BOXES = [
    [0, 0, 0, 16, 3.2, 6],
    [2, 4.2, -3, 5, 2.6, 3.4],
    [0, 0, -8.5, 7, 2.4, 3],
    [0, -4.6, 2, 10, 0.8, 4],
    [-13, 1, -1, 3.4, 3.4, 3.4],
    [13, 1, -1, 3.4, 3.4, 3.4],
  ];
  const boxScratch = [];
  function drawBox3D(bx, by, bz, hw, hh, hd, yaw, roll, baseL, t) {
    const cY = Math.cos(yaw), sY = Math.sin(yaw);
    const cR = Math.cos(roll), sR = Math.sin(roll);
    boxScratch.length = 0;
    for (let ci = 0; ci < 8; ci++) {
      const x = (ci & 1 ? hw : -hw), y = (ci & 2 ? hh : -hh), z = (ci & 4 ? hd : -hd);
      const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
      const y1 = y * cR - x1 * sR, x2 = x1 * cR + y * sR;
      boxScratch.push([x2 + bx, y1 + by, z1 + bz]);
    }
    const faces = [
      [0, 2, 3, 1], [4, 6, 7, 5],
      [0, 1, 5, 4], [2, 3, 7, 6],
      [1, 3, 7, 5], [0, 2, 6, 4],
    ];
    // key light upper-left-front, in world space
    const LX = -0.4, LY = 0.7, LZ = -0.55;
    const camWX = -96 * Math.sin(camAng), camWZ = -96 * Math.cos(camAng);
    for (let fI = 0; fI < faces.length; fI++) {
      const f = faces[fI];
      const a = boxScratch[f[0]], b = boxScratch[f[1]], c = boxScratch[f[2]];
      // face normal from edge cross product
      let nX = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let nY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nZ = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const nl = Math.hypot(nX, nY, nZ) || 1;
      nX /= nl; nY /= nl; nZ /= nl;
      // view vector for rim: camera orbits the origin at radius 96
      const fcx = (a[0] + boxScratch[f[3]][0]) * 0.5, fcy = (a[1] + boxScratch[f[3]][1]) * 0.5, fcz = (a[2] + boxScratch[f[3]][2]) * 0.5;
      let vX = camWX - fcx, vY = camH - fcy, vZ = camWZ - fcz;
      const vl = Math.hypot(vX, vY, vZ) || 1;
      vX /= vl; vY /= vl; vZ /= vl;
      const lambert = clamp(0.22 + 0.78 * Math.max(0, nX * LX + nY * LY + nZ * LZ), 0, 1.1);
      const rim = Math.pow(1 - Math.abs(nX * vX + nY * vY + nZ * vZ), 2) * 0.55;
      const shade = clamp(baseL * (lambert + rim), 0.05, 1.5);
      fillPoly3D([a, b, c, boxScratch[f[3]]], shade, t);
    }
  }
  // silhouette stroke: brighten depth discontinuities so hulls read as objects
  function edgeEnhance() {
    for (let y = 1; y < SH - 1; y++) {
      for (let x = 1; x < SW - 1; x++) {
        const i = y * SW + x;
        const z = zbuf[i];
        if (z === 1e9) continue;
        if (zbuf[i - 1] - z > 22 || zbuf[i + 1] - z > 22 ||
            zbuf[i - SW] - z > 22 || zbuf[i + SW] - z > 22) {
          addPx(x, y, 0.55, 0);
        }
      }
    }
  }

  function act3(u) {
    camAng = -0.5 + Math.sin(u * Math.PI * 0.8) * 0.55 + gx * 0.25;
    camH = 10 + gy * 8;
    zbuf.fill(1e9);

    // nebula band — fills the void so space has atmosphere, not emptiness
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x += 2) {
        const n = vnoise(x * 0.022 + 31, y * 0.022 + 7) * 0.6 + vnoise(x * 0.05, y * 0.05 + 40) * 0.4;
        if (n > 0.52) addPx(x, y, (n - 0.52) * 0.22, n > 0.72 ? 1 : 0);
      }
    }
    for (let i = 0; i < 140; i++) {
      const sx = (hash1(i * 7.7) * SW + camAng * 160 * hash1(i)) % SW;
      const sy = hash1(i * 3.3) * SH;
      const sl = 0.14 + hash1(i * 11) * 0.24 * (0.5 + 0.5 * Math.sin(T * 2 + i));
      px(sx, sy, sl, 0);
      if (hash1(i * 2.9) > 0.8) { px(sx + 1, sy, sl * 0.8, 0); px(sx, (sy + 1) | 0, sl * 0.8, 0); }
    }

    const destroyed = u > 0.55;
    const fYaw = 0.35 + Math.sin(T * 0.3) * 0.06;
    const fRoll = Math.sin(T * 0.5) * 0.05;
    const fBX = Math.sin(T * 0.4) * 2, fBY = Math.sin(T * 0.7) * 1.2;

    if (!destroyed) {
      for (let i = 0; i < FRIG_BOXES.length; i++) {
        const b = FRIG_BOXES[i];
        drawBox3D(b[0] + fBX, b[1] + fBY, b[2], b[3], b[4], b[5], fYaw, fRoll, 0.55, 0);
      }
      for (let r = -12; r <= 12; r += 4) {
        const c = Math.cos(fYaw), s = Math.sin(fYaw);
        const wx = r * c + 6.2 * s + fBX, wz = -r * s + 6.2 * c;
        const p0 = project(wx, -3 + fBY, wz);
        if (!p0) continue;
        const x0 = p0[0], y0 = p0[1];
        const p1 = project(wx, 3.4 + fBY, wz);
        if (p1) addLine(x0, y0, p1[0], p1[1], 0.5, 0);
      }
      for (let e = -1; e <= 1; e++) {
        const p = project(e * 3.4 * Math.cos(fYaw) - 11.4 * Math.sin(fYaw) + fBX, fBY, -e * 3.4 * Math.sin(fYaw) - 11.4 * Math.cos(fYaw));
        if (p) { const ex = p[0], ey = p[1]; disc(ex, ey, 2.2, 1.1, 1); addPx(ex, ey, 0.8, 0); }
      }
      edgeEnhance();
    }

    // interceptor strafing run
    const runT = clamp(u / 0.55, 0, 1);
    const ix = lerp(-52, 40, runT) + Math.sin(runT * Math.PI) * -6;
    const iy = 10 + Math.sin(runT * Math.PI * 1.6) * 7;
    const iz = lerp(18, -8, runT);
    if (!destroyed || u < 0.62) {
      const iYaw = 1.2 + Math.sin(u * 6) * 0.15;
      drawBox3D(ix, iy, iz, 4.4, 0.9, 1.6, iYaw, Math.sin(T * 3) * 0.3, 0.8, 0);
      drawBox3D(ix, iy, iz + 2.6, 1.1, 0.4, 2.4, iYaw, 0, 0.9, 0);
      const pE = project(ix - 6, iy, iz);
      if (pE) { const ex = pE[0], ey = pE[1]; addLine(ex, ey, ex - 9, ey + 2, 0.8, 1); disc(ex, ey, 1.4, 1.2, 1); }
    }

    if (!destroyed) {
      const volley = Math.floor(u / 0.14);
      const vPhase = (u % 0.14) / 0.14;
      if (volley < 3 && vPhase < 0.42) {
        const hitP = project(fBX - 4 + volley * 5, 2 + fBY, 6);
        const gunP = project(ix + 5, iy, iz + 2);
        if (hitP && gunP) {
          addLine(gunP[0], gunP[1], hitP[0], hitP[1], 1.5, 1);
          addLine(gunP[0], gunP[1] + 1, hitP[0], hitP[1] + 1, 0.7, 0);
          disc(hitP[0], hitP[1], 2 + vPhase * 3, 1.2 * (1 - vPhase * 2), 1);
          ring(hitP[0], hitP[1], 3 + vPhase * 9, 1, 0.8 * (1 - vPhase * 2.3), 0);
        }
        energy = 0.75;
      }
    } else {
      const dT = (u - 0.55) / 0.45;
      if (dT < 0.16) {
        const fl = 1 - dT / 0.16;
        const p = project(fBX, fBY, 0);
        if (p) { disc(p[0], p[1], 6 + fl * 10, fl * 1.6, 1); disc(p[0], p[1], 3 + fl * 5, fl * 1.4, 0); }
        energy = 1;
      }
      if (dT > 0.08 && dT < 0.85) {
        const r = easeOutCubic((dT - 0.08) / 0.77) * 42;
        const alpha = 1 - (dT - 0.08) / 0.77;
        for (let a = 0; a < Math.PI * 2; a += 0.07) {
          const p = project(fBX + Math.cos(a) * r, fBY + Math.sin(a) * r * 0.25, Math.sin(a) * r * 0.4);
          if (p) addPx(p[0], p[1], alpha * 1.1, 1);
        }
      }
      for (let i = 0; i < 16; i++) {
        const ang = hash1(i * 4.4) * Math.PI * 2;
        const spd = 10 + hash1(i * 8.8) * 26;
        const dDist = easeInCubic(dT) * spd;
        const dx_ = fBX + Math.cos(ang) * dDist;
        const dy_ = fBY + Math.sin(ang) * dDist * 0.6 + dT * dT * -6;
        const dz_ = Math.sin(ang) * dDist * 0.4;
        const p = project(dx_, dy_, dz_);
        if (p && p[2] < 90) {
          const sz = 0.8 + hash1(i * 2.2) * 1.4;
          const glint = Math.cos(dT * 20 + i * 2.4) > 0.4 ? 1.2 : 0.45;
          fillPoly3D([[dx_ - sz, dy_ - sz * 0.6, dz_], [dx_ + sz, dy_ - sz * 0.5, dz_], [dx_ + sz * 0.6, dy_ + sz, dz_], [dx_ - sz * 0.7, dy_ + sz * 0.8, dz_]], glint * (1 - dT * 0.7), i % 3 === 0 ? 1 : 0);
        }
      }
      for (let i = 0; i < 24; i++) {
        const ex = fBX + (hash1(i * 6.1) - 0.5) * 60 * dT;
        const ey = fBY + (hash1(i * 2.9) - 0.5) * 30 * dT;
        const p = project(ex, ey, (hash1(i * 5.5) - 0.5) * 24 * dT);
        if (p) addPx(p[0], p[1], (1 - dT) * (0.3 + hash1(i * 7.3) * 0.6) * (0.6 + 0.4 * Math.sin(T * 7 + i * 3)), 1);
      }
      if (u > 0.62) {
        const eT = (u - 0.62) / 0.38;
        drawBox3D(lerp(40, 66, eT), 10 - eT * 6, -8 - eT * 14, 4.4, 0.9, 1.6, 1.4, 0.4, 0.7, 0);
      }
    }

    drawText('03 · KINETIC INTERCEPT', 3, 3, 0.85, 1);
    drawText(destroyed ? 'HOSTILE CORE BREACH' : 'RAILGUN VOLLEY ' + (Math.min(3, Math.floor(u / 0.14) + 1)) + '/3', 3, SH - 11, 0.7, 0);
    energy = Math.max(energy * 0.94, destroyed ? 0.5 : 0.3);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACT 4 · APERTURE — machine-god iris
  // ─────────────────────────────────────────────────────────────────────────
  function act4(u) {
    const cx = SW / 2 + gx * 5, cy = 62 + gy * 4;
    for (let y = 0; y < SH; y += 5) {
      for (let x = 0; x < SW; x += 9) {
        const wob = ((x + y) % 18 === 0) ? 0.16 : 0.08;
        px(x, y, wob + vnoise(x * 0.05, y * 0.05 + T * 0.1) * 0.05, 0);
        px(x + 4, (y + 2.5) | 0, wob * 0.7, 0);
      }
    }
    for (let a = 0; a < Math.PI * 2; a += 0.23) {
      const r = 30 + 22 * Math.sin(T * 0.3 + a * 3);
      px(cx + Math.cos(a - T * 0.18) * r, cy + Math.sin(a - T * 0.18) * r * 0.9, 0.16, 0);
    }

    let dil = 0.5 + Math.sin(T * 1.15) * 0.28;
    if (u > 0.8) dil = lerp(dil, 1.15, easeInCubic((u - 0.8) / 0.2));

    const gearA = T * 0.35;
    const bladeA = -T * 0.28; // counter-rotation against the gear ring
    for (let a = 0; a < Math.PI * 2; a += 0.012) {
      const tooth = Math.sin(a * 24 + gearA * 6) > 0.3 ? 2.6 : 0;
      const r = 47 + tooth;
      // single traveling specular sweep instead of static lobes
      const band = 0.35 + 0.55 * Math.pow(Math.max(0, Math.sin(a - T * 2.0)), 8);
      px(cx + Math.cos(a + gearA) * r, cy + Math.sin(a + gearA) * r * 0.88, band, 0);
      px(cx + Math.cos(a + gearA) * (r - 3), cy + Math.sin(a + gearA) * (r - 3) * 0.88, band * 0.6, 0);
    }

    for (let bI = 0; bI < 12; bI++) {
      const bA = bI / 12 * Math.PI * 2 + bladeA;
      const innerR = 9 + dil * 20;
      for (let r = innerR; r < 44; r += 1.1) {
        const curve = (r - innerR) * 0.028 + (1 - dil) * 0.05;
        const aIn = bA + curve;
        const edgeD = r - innerR;
        const l = edgeD < 1.6 ? 1.0 : 0.42 + 0.18 * Math.sin(r * 0.35 - T * 2 + bI);
        px(cx + Math.cos(aIn) * r, cy + Math.sin(aIn) * r * 0.88, l, bI % 4 === 0 ? 1 : 0);
      }
    }

    const hR = 8 + dil * 3;
    for (let a = 0; a < Math.PI * 2; a += 0.03) {
      const flick = 0.85 + vnoise(a * 4, T * 2.4) * 0.5;
      addPx(cx + Math.cos(a) * hR, cy + Math.sin(a) * hR * 0.88, 1.2 * flick, 1);
      addPx(cx + Math.cos(a) * (hR + 1), cy + Math.sin(a) * (hR + 1) * 0.88, 0.5 * flick, 1);
    }
    const vR = hR - 1.5;
    for (let y = Math.floor(cy - vR); y <= cy + vR; y++)
      for (let x = Math.floor(cx - vR); x <= cx + vR; x++)
        if (Math.hypot(x - cx, (y - cy) / 0.88) <= vR) forcePx(x, y, 0, 0);
    const pxl = cx + gx * 2.4, pyl = cy + gy * 2;
    forcePx(pxl, pyl, 1.6, 1); forcePx(pxl + 1, pyl, 1.1, 1); forcePx(pxl, pyl + 1, 1.1, 1);

    const runes = '0X1F9A4C7E2B5D8';
    for (let i = 0; i < runes.length; i++) {
      const oA = i / runes.length * Math.PI * 2 + T * 0.5;
      const depth = Math.sin(oA);
      const r = 52 - depth * 4;
      if (depth > -0.2) drawText(runes[i], cx + Math.cos(oA) * r - 2, cy + Math.sin(oA) * r * 0.88 - 3, 0.35 + (depth + 1) * 0.35, i % 2);
    }

    const arcPhase = (T % 1.4) / 1.4;
    if (arcPhase < 0.05 && !reduced) {
      const seed = Math.floor(T / 1.4);
      for (let aI = 0; aI < 2; aI++) {
        const ax0 = cx + Math.cos(hash1(seed * 3 + aI) * Math.PI * 2) * hR;
        const ay0 = cy + Math.sin(hash1(seed * 5 + aI) * Math.PI * 2) * hR * 0.88;
        const ax1 = cx + Math.cos(hash1(seed * 7 + aI) * Math.PI * 2) * 46;
        const ay1 = cy + Math.sin(hash1(seed * 11 + aI) * Math.PI * 2) * 40;
        for (let s = 0; s < 8; s++) {
          const f = s / 8, f2 = (s + 1) / 8;
          const jx = (hash1(seed + s * 3.1 + aI) - 0.5) * 9;
          const jy = (hash1(seed + s * 7.7 + aI) - 0.5) * 9;
          addLine(lerp(ax0, ax1, f) + jx * (1 - f), lerp(ay0, ay1, f) + jy * (1 - f),
                  lerp(ax0, ax1, f2) + jx * (1 - f2), lerp(ay0, ay1, f2) + jy * (1 - f2), 1.3, 1);
        }
      }
      energy = 0.9;
    }

    for (let i = 0; i < 9; i++) {
      const f = (T * 0.22 + i * 0.111) % 1;
      const r = (1 - f) * 58 + 6;
      const a = i * 0.7 + f * 5;
      if (r > hR + 2) { addPx(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.88, 0.9, 1); addPx(cx + Math.cos(a) * r + 1, cy + Math.sin(a) * r * 0.88, 0.5, 1); }
    }

    drawText('04 · APERTURE // MACHINE GOD', 3, 3, 0.85, 1);
    drawText('CONTAINMENT ' + (dil > 0.9 ? 'FALLING' : '99.9' + ((T * 10 | 0) % 9) + '%'), 3, SH - 11, 0.7, 0);
    energy = Math.max(energy * 0.93, 0.35 + Math.abs(Math.sin(T * 1.15)) * 0.15);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACT 5 · HYPERWARP — tunnel + hero corvette, progress-charged
  // ─────────────────────────────────────────────────────────────────────────
  const WARP_STARS = [];
  function initWarp() {
    WARP_STARS.length = 0;
    for (let i = 0; i < 130; i++) {
      WARP_STARS.push({
        a: hash1(i * 1.618) * Math.PI * 2,
        r: 0.18 + hash1(i * 3.14) * 0.85,
        z: hash1(i * 7.77) * 240 + 8,
      });
    }
  }
  function act5(u) {
    if (!WARP_STARS.length) initWarp();
    const cx = SW / 2, cy = 56;
    const collapse = u > 0.86 ? easeInCubic((u - 0.86) / 0.14) : 0;
    const charge = clamp(progressShown * 1.25, 0, 1);
    const speed = (26 + u * u * 90 + charge * 46) * (1 - collapse * 0.4);
    const dtF = 1 / 60;

    for (let i = 0; i < WARP_STARS.length; i++) {
      const st = WARP_STARS[i];
      st.z -= speed * dtF * (1 + st.r);
      if (st.z < 3) { st.z = 200 + hash1(i * 9.1 + T) * 60; st.a = hash1(i * 1.6 + T * 0.3) * Math.PI * 2; }
      const r0 = 52 / st.z * st.r * 60;
      const zPrev = st.z + speed * dtF * (1 + st.r) * 1.7;
      const r1 = 52 / zPrev * st.r * 60;
      const ex = cx + Math.cos(st.a) * r0 * (1 - collapse);
      const ey = cy + Math.sin(st.a) * r0 * 0.85 * (1 - collapse);
      const sx = cx + Math.cos(st.a) * r1 * (1 - collapse);
      const sy = cy + Math.sin(st.a) * r1 * 0.85 * (1 - collapse);
      const bF = clamp(1 - st.z / 200, 0.12, 1) * clamp((r0 - 6) / 44, 0, 1) * (1 - collapse * 0.7);
      addLine(ex, ey, sx, sy, bF * (st.r > 0.7 ? 1.0 : 0.65), st.r > 0.75 ? 1 : 0);
    }

    for (let i = 0; i < 9; i++) {
      const rz = (i / 9) * 240 + 240 - ((T * speed * 2.2) % 240);
      const r = 52 / rz * 62;
      if (r < 4 || r > 90) continue;
      const rb = clamp(1 - rz / 240, 0.1, 1) * (1 - collapse * 0.8);
      for (let a = 0; a < Math.PI * 2; a += 0.55 / Math.max(1, r * 0.04)) {
        addPx(cx + Math.cos(a) * r * (1 - collapse), cy + Math.sin(a) * r * 0.85 * (1 - collapse), rb, 0);
        addPx(cx + Math.cos(a) * (r - 1.4) * (1 - collapse), cy + Math.sin(a) * (r - 1.4) * 0.85 * (1 - collapse), rb * 0.7, 1);
      }
    }

    // hero corvette — faceted silhouette, owning the lower-center third
    const bob = Math.sin(T * 1.4) * 1.2;
    const hx = cx, hy = 70 + bob;
    const bank = Math.sin(T * 0.9) * 0.05 + gx * 0.06;
    const HS = 1.35; // hull scale
    const hull = [
      [[-2, -9], [4, -5], [4, 2], [-2, 0], 0.95],
      [[-2, -9], [-8, -4], [-8, 0], [-2, 0], 0.6],
      [[4, -5], [16, -1], [13, 3], [4, 2], 0.8],
      [[-2, -9], [-16, -1], [-13, 3], [-2, 0], 0.5],
      [[-13, 3], [-6, 5], [6, 5], [13, 3], [4, 2], 0.4],
    ];
    const xs = [0, 0, 0, 0, 0], ys = [0, 0, 0, 0, 0];
    for (let fI = 0; fI < hull.length; fI++) {
      const poly = hull[fI];
      const shade = poly[4];
      const nPts = poly.length - 1;
      let yMin = 1e9, yMax = -1e9;
      for (let pI = 0; pI < nPts; pI++) {
        const ptx = poly[pI][0] * HS, pty = poly[pI][1] * HS;
        xs[pI] = hx + ptx * Math.cos(bank) - pty * Math.sin(bank) * 1.6;
        ys[pI] = hy + pty * Math.cos(bank) * 1.4 + ptx * Math.sin(bank);
        yMin = Math.min(yMin, ys[pI]); yMax = Math.max(yMax, ys[pI]);
      }
      for (let y = Math.max(0, yMin | 0); y <= Math.min(SH - 1, yMax | 0); y++) {
        let xl = 1e9, xr = -1e9;
        for (let pI = 0; pI < nPts; pI++) {
          const q = (pI + 1) % nPts;
          if ((ys[pI] <= y && ys[q] > y) || (ys[q] <= y && ys[pI] > y)) {
            const f = (y - ys[pI]) / (ys[q] - ys[pI]);
            xl = Math.min(xl, lerp(xs[pI], xs[q], f)); xr = Math.max(xr, lerp(xs[pI], xs[q], f));
          }
        }
        for (let x = Math.max(0, xl | 0); x <= Math.min(SW - 1, xr | 0); x++)
          px(x, y, shade * (0.75 + 0.25 * Math.sin(x * 0.4 + y * 0.3)), 0);
      }
    }
    const glintX = (hx - 5 + ((T * 6) % 19)) | 0;
    for (let y = hy - 8; y < hy - 3; y++) addPx(glintX, y, 0.8, 0);
    if (Math.sin(T * 4) > 0) { px(hx - 21, hy - 1, 1.3, 1); px(hx + 21, hy - 1, 1.3, 1); }
    for (let nz = -1; nz <= 1; nz += 2) {
      const nx0 = hx + nz * 7;
      const plumeLen = 16 + Math.sin(T * 13) * 2 + charge * 8;
      for (let d = 0; d < plumeLen; d++) {
        const f = d / plumeLen;
        const flick = 0.85 + vnoise(d * 0.5, T * 9) * 0.3;
        const l = (1 - f) * 1.2 * flick;
        const wy = (hy + 4 + d) | 0;
        addPx(nx0, wy, l * 0.8, 1);
        addPx(nx0 - 1, wy, l * 0.4, 1); addPx(nx0 + 1, wy, l * 0.4, 1);
        if ((d + 2) % 4 === 0 && d < plumeLen - 2) {
          addPx(nx0 - 2, wy, l, 0); addPx(nx0 + 2, wy, l, 0); addPx(nx0, wy, l * 1.3, 0);
        }
      }
    }

    for (let i = 0; i < 20; i++) {
      const a = hash1(i * 3.7) * Math.PI * 2;
      const r0 = 34 + (T * 80 + i * 17) % 46;
      addLine(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.85,
              cx + Math.cos(a) * (r0 + 9), cy + Math.sin(a) * (r0 + 9) * 0.85, 0.22, 0);
    }

    if (collapse > 0.6) {
      const cl = (collapse - 0.6) / 0.4;
      disc(cx, cy, 2 + cl * 3, 1.6 * cl, 1);
      if (cl > 0.85) for (let i = 0; i < N_SUB; i++) lum[i] *= 1 - cl;
    }

    drawText('05 · TESSERA HYPERWARP', 3, 3, 0.85, 1);
    drawText('WARP CHG ' + String(Math.round(progressShown * 100)).padStart(3, ' ') + '%', 3, SH - 11, 0.7, progressShown > 0.9 ? 1 : 0);
    energy = 0.5 + charge * 0.3 + Math.abs(Math.sin(T * 13)) * 0.1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Frame composition
  // ─────────────────────────────────────────────────────────────────────────
  function actIndexAt(tt) { return labAct >= 0 ? labAct : Math.floor(tt / ACT_LEN) % ACTS; }

  function renderScene() {
    lum.fill(0); tint.fill(0);
    const tt = T % LOOP_LEN;
    const act = actIndexAt(tt);
    const u = labAct >= 0 ? (T % ACT_LEN) / ACT_LEN : (tt % ACT_LEN) / ACT_LEN;
    switch (act) {
      case 0: act1(u); break;
      case 1: act2(u); break;
      case 2: act3(u); break;
      case 3: act4(u); break;
      default: act5(u); break;
    }
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
    // the cinematic lens streak signature (railguns, engines, iris core).
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
    // act burn-in crossfade: the previous act's phosphor ghosts through the
    // new one for ~0.6s — signal-corruption dissolve instead of a hard cut.
    if (snapT >= 0) {
      const fade = Math.exp(-3.5 * Math.max(0, T - snapT));
      if (fade < 0.02) snapT = -1;
      else for (let i = 0; i < N_SUB; i++) {
        const g = decaySnap[i] * fade;
        if (g > decay[i]) decay[i] = g;
      }
    }
    return act;
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
    const cellW = Math.max(4, Math.floor(W / COLS));
    const cellH = Math.max(6, Math.floor(H / ROWS));
    const a = makeCanvas(ATLAS_CHARS.length * cellW, 64 * cellH);
    if (!a) { atlas = null; atlasAct = act; return; }
    const aCtx = a.getContext('2d');
    const pal = PALETTES[act];
    aCtx.clearRect(0, 0, a.width, a.height);
    aCtx.font = 'bold ' + Math.floor(cellH * 0.92) + 'px "IBM Plex Mono","Consolas",monospace';
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
        if (lTop > 0.035) qT = clamp(((lTop + nT * 0.45) * 31.5) | 0, 0, 31);
        if (lBot > 0.035) qB = clamp(((lBot + nB * 0.45) * 31.5) | 0, 0, 31);
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
          for (let d = DENSITY_L.length - 1; d >= 0; d--) if (avg + nT * 0.22 > DENSITY_L[d]) { dI = d; break; }
          if (dI <= 0) { kind = 0; }
          else {
            kind = 5 + dI;
            fgL = clamp(Math.round(avg * 28), 1, 18);
            fgT = tTop;
          }
        } else if (qB < 0) { kind = 1; fgL = qT; fgT = tTop; }
        else if (qT < 0) { kind = 2; fgL = qB; fgT = tBot; }
        else if (qT === qB && tTop === tBot) { kind = 3; fgL = qT; fgT = tTop; }
        else { kind = 4; fgL = qT; fgT = tTop; bgL = qB; }

        const key = (((kind * 32 + fgL) * 2 + fgT) * 32 + bgL) * 2 + (tBot & 1);
        const cellIdx = rowOff + c;
        if (key === emittedKey[cellIdx]) continue;
        emittedKey[cellIdx] = key;

        const x = (c + tearX) * cellW, y = r * cellH;
        const lutTop = fgT ? pal.accent : pal.main;
        if (kind === 0) {
          ctx.fillStyle = pal.bg; ctx.fillRect(x, y, cellW + 1, cellH + 1);
        } else if (kind === 1) {
          ctx.fillStyle = pal.bg; ctx.fillRect(x, y, cellW + 1, cellH + 1);
          ctx.fillStyle = css(lutTop, qT); ctx.fillRect(x, y, cellW + 1, cellH * 0.5 + 0.5);
        } else if (kind === 2) {
          ctx.fillStyle = pal.bg; ctx.fillRect(x, y, cellW + 1, cellH + 1);
          ctx.fillStyle = css(tBot ? pal.accent : pal.main, qB);
          ctx.fillRect(x, y + cellH * 0.5, cellW + 1, cellH * 0.5 + 1);
        } else if (kind === 3) {
          ctx.fillStyle = css(lutTop, qT); ctx.fillRect(x, y, cellW + 1, cellH + 1);
        } else if (kind === 4) {
          ctx.fillStyle = css(tBot ? pal.accent : pal.main, qB);
          ctx.fillRect(x, y, cellW + 1, cellH + 1);
          ctx.fillStyle = css(lutTop, qT); ctx.fillRect(x, y, cellW + 1, cellH * 0.5 + 0.5);
        } else {
          ctx.fillStyle = pal.bg; ctx.fillRect(x, y, cellW + 1, cellH + 1);
          if (atlas) {
            ctx.drawImage(atlas, (kind - 5) * atlasTileW, ((fgT ? 32 : 0) + fgL) * atlasTileH, atlasTileW, atlasTileH,
              x, y, cellW + 1, cellH + 1);
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
      c2.fillStyle = 'rgba(0,0,0,0.28)';
      c2.fillRect(0, 0, 4, 2);
      scanPattern = ctx.createPattern(p, 'repeat');
    }
    const v = makeCanvas(Math.max(2, W | 0), Math.max(2, H | 0));
    if (v) {
      const c2 = v.getContext('2d');
      const g = c2.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.32)');
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
    // CRT power-on effect only lives for the first 0.9s of act 1 — after that
    // it must get out of the way (a stale multiplier here once doubled the
    // luminance of the entire first act).
    const powerOn = (labAct === 0 || (labAct < 0 && act === 0 && tt < ACT_LEN))
      ? (tt < 0.9 ? tt / 0.9 : -1) : -1;

    skipScene = frameCostAvg > 24 && (frameCounter & 1) === 1;
    if (!skipScene) {
      if (lastAct !== act && lastAct >= 0) { decaySnap.set(decay); snapT = T; }
      lastAct = act;
      renderScene();
    }
    else {
      const decayK = Math.exp(-7.5 / 60);
      for (let i = 0; i < N_SUB; i++) decay[i] *= decayK;
    }

    emitCells(act, glitch, powerOn);

    if (scanPattern) {
      const oldAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 0.5;
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
    ctx = msg.canvas.getContext('2d');
    W = msg.width || 640; H = msg.height || 380;
    if (msg.waveformCanvas) {
      waveCtx = msg.waveformCanvas.getContext('2d');
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
// FULL-RESOLUTION PATH — WebGL2 scene render displayed through a character
// screen. The five acts are procedural GLSL scenes rendered at canvas
// resolution into an HDR-ish texture; a post shader maps every ~5px cell to
// a glyph from a 16-step density ramp with per-cell color, chromatic
// aberration, mip-bloom, barrel distortion, aperture grille, scanlines and
// glitch. The character field is the DISPLAY TECHNOLOGY, not the pixel
// budget. Any failure anywhere falls back to the 2D half-block engine above.
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
float gsmin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float gsdEllipse(vec2 p, vec2 c, vec2 r){
  vec2 d = (p-c)/r;
  return (length(d)-1.0)*min(r.x, r.y);
}
float gsdSeg(vec2 p, vec2 a, vec2 b){
  vec2 pa = p-a, ba = b-a;
  float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa - ba*h);
}
`;

// ── Act 1 · portrait (full-res layered SDF) ────────────────────────────────
const GLSL_A1 = `
uniform vec4 uSeg[70];  // cable segments p0.xy p1.xy
uniform vec4 uCab[7];   // per-cable: pulse brightness, tint, width, rootBright
vec3 pal1m(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.004,0.031,0.024), vec3(0.027,0.164,0.122), smoothstep(0.0,0.3,x));
  c = mix(c, vec3(0.051,0.360,0.270), smoothstep(0.3,0.55,x));
  c = mix(c, vec3(0.090,0.710,0.549), smoothstep(0.55,0.8,x));
  c = mix(c, vec3(0.722,1.0,0.910), smoothstep(0.8,1.0,x));
  return c;
}
vec3 pal1a(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.055,0.024,0.094), vec3(0.173,0.094,0.314), smoothstep(0.0,0.35,x));
  c = mix(c, vec3(0.345,0.204,0.580), smoothstep(0.35,0.65,x));
  c = mix(c, vec3(0.788,0.682,1.0), smoothstep(0.65,1.0,x));
  return c;
}
float sdHead1(vec2 p, float turn, float breath){
  float d = gsdEllipse(p, vec2(turn*3.0, -8.0+breath), vec2(24.0,28.0));
  float dj = gsdEllipse(p, vec2(turn*8.0, 14.0+breath), vec2(15.5,17.0));
  d = gsmin(d, dj, 0.35);
  vec2 dc = vec2(abs(p.x - turn*8.0)/11.0, (p.y - 32.0)/10.0);
  float dC = 1.0 - length(dc);
  if (dC < 0.6) d = max(d, dC);
  return d;
}
float sdHair1(vec2 p, float turn, float breath){
  float d = gsdEllipse(p, vec2(turn*3.0-3.0, -10.0+breath), vec2(26.5,30.0));
  float sweep = turn*3.0 + 9.0 - (p.y + 10.0)*0.28;
  if (p.x > sweep && p.y > -28.0) d = max(d, (sweep - p.x)/8.0);
  if (p.y > -26.0 && p.y < -14.0 && p.x < sweep + 2.0){
    float fringe = -22.0 + sin((p.x - turn*3.0)*0.35)*1.6;
    d = min(d, (p.y - fringe)/3.0);
  }
  return d;
}
float bump1(vec2 p, float turn){
  float b = 0.0;
  if (p.y > 0.0 && p.y < 8.0){
    float side = p.x - turn*6.0;
    b += 0.35*exp(-pow((abs(side)-14.0)/4.5, 2.0))*exp(-pow((p.y-1.0)/6.0, 2.0));
  }
  b += 0.3*exp(-pow((p.y+10.0)/2.6, 2.0))*exp(-pow((p.x-turn*5.0)/16.0, 4.0));
  b += 0.5*exp(-pow((p.x-(turn*7.0))/2.2, 2.0))*exp(-pow((p.y-0.0)/10.0, 2.0));
  return b;
}
vec3 act1(vec2 p){
  float turn = clamp(uGyro.x*0.45 + sin(uT*0.35)*0.12, -0.5, 0.5);
  float pitch = clamp(uGyro.y*0.18 + sin(uT*0.23+1.0)*0.05, -0.3, 0.3);
  vec2 C = vec2(turn*5.0, pitch*8.0);
  p -= C;
  float breath = sin(uT*1.1)*0.7;
  vec3 col = vec3(0.0);
  // neural grid + back glow + motes
  vec2 gp = mod(p, vec2(9.0, 6.0));
  if (abs(gp.x) < 0.35 && abs(gp.y) < 0.35)
    col += pal1m(0.10 + gvno(p*0.08 + uT*0.05)*0.06)*0.35;
  float dGlow = length(p*vec2(1.0,0.8));
  if (dGlow < 46.0) col += pal1a((1.0-dGlow/46.0)*0.35)*(1.0-dGlow/46.0)*0.30;
  for (int m = 0; m < 12; m++){
    float fi = float(m);
    vec2 mp = vec2(mod(gh1(fi*7.3)*120.0 + uT*(2.0+gh1(fi)*3.0), 120.0)-60.0,
                   mod(gh1(fi*3.1)*120.0 + sin(uT*0.6+fi)*6.0, 120.0)-60.0);
    float dm = length(p-mp);
    col += pal1a(0.4)*exp(-dm*dm*2.0)*0.5;
  }
  // head + hair with finite-difference normals
  float d = sdHead1(p, turn, breath);
  float dH = sdHair1(p, turn, breath);
  float aa = clamp(-d*1.4+0.5, 0.0, 1.0);
  if (dH < 0.4 && aa <= 0.0){
    float strand = max(0.0, sin(p.y*1.5 + p.x*0.28 + turn*8.0));
    float hl = 0.10 + strand*strand*0.22 + gvno(vec2(p.x*0.3, p.y*0.12))*0.08;
    if (dH > -1.6) hl += 0.12;
    col += pal1a(hl)*hl;
  }
  if (aa > 0.0){
    if (dH < 0.0){
      float strand = max(0.0, sin(p.y*1.5 + p.x*0.28 + turn*8.0));
      float hl = 0.08 + strand*strand*0.3 + gvno(vec2(p.x*0.3, p.y*0.12))*0.06;
      if (dH > -1.6) hl += 0.14;
      col = pal1a(hl)*hl;
    } else {
      float e = 1.1;
      float nx = sdHead1(p+vec2(e,0.0), turn, breath) - sdHead1(p-vec2(e,0.0), turn, breath);
      float ny = sdHead1(p+vec2(0.0,e), turn, breath) - sdHead1(p-vec2(0.0,e), turn, breath);
      float bump = bump1(p, turn);
      vec2 g = vec2(-nx - (bump1(p+vec2(1.0,0.0),turn)-bump1(p-vec2(1.0,0.0),turn))*0.5,
                     ny + (bump1(p+vec2(0.0,1.0),turn)-bump1(p-vec2(0.0,1.0),turn))*0.5);
      g /= max(length(g), 1e-4);
      float diff = clamp(0.42 + (g.x*0.55 + g.y*0.75)*0.7 + bump*0.65, 0.0, 1.0);
      float rim = pow(clamp(1.0-abs(g.x-0.85), 0.0, 1.0), 2.0);
      float l = 0.10 + diff*0.5 + rim*0.42;
      if (p.x > turn*6.0+4.0){
        float seam = step(0.86, sin((p.x)*0.9 + (p.y+2.0)*0.35 + turn*4.0));
        l *= 1.0 - seam*0.5;
        if (mod(p.x*13.0 + p.y*7.0, 31.0) < 1.0 && d < -3.0) l += 0.1;
      }
      if (p.y < -20.0 && abs(p.x - turn*2.0) < 15.0) l += 0.12*exp(-pow((p.y+28.0)/5.0, 2.0));
      vec3 skin = pal1m(l);
      if (rim > 0.25 && p.x > turn*5.0) skin = pal1a(l);
      col = mix(col, skin*l*1.6, aa);
    }
  }
  // neck + shoulders
  if (p.y > 24.0){
    float t = clamp((p.y-24.0)/26.0, 0.0, 1.0);
    float w = 8.0 + t*26.0;
    float edge = 1.0 - abs(p.x - turn*4.0)/w;
    if (edge > 0.0) col = pal1m((0.14 + edge*0.3)*(1.0-t*0.3))*0.55;
  }
  // cables
  for (int ci = 0; ci < 7; ci++){
    vec4 cab = uCab[ci];
    float baseI = ci*10;
    for (int si = 0; si < 10; si++){
      int idx = ci*10 + si;
      vec4 s0 = uSeg[idx];
      float dd = gsdSeg(p, s0.xy, s0.zw);
      float wdt = 0.7 + cab.z;
      float body = smoothstep(wdt+0.6, wdt-0.2, dd);
      float sheen = 0.75 + 0.25*sin(dd*3.0 - uT*2.0 + float(idx));
      col += pal1a(0.35)*body*0.55*sheen;
      float pulse = cab.x*smoothstep(1.4, 0.0, abs(dd - (1.0 - cab.x)*0.0));
      col += pal1a(0.85)*exp(-dd*dd*1.2)*cab.x*1.4;
    }
  }
  // features
  float fx7 = turn*7.0;
  float eyeY = -10.0 + breath;
  // brows
  col += pal1m(0.85)*0.001; // keep
  vec2 bl = p - vec2(fx7*7.0/7.0 - 8.0, 0.0); bl = p - vec2(turn*7.0 - 8.0, eyeY-5.0+abs(p.x-(turn*7.0-8.0))*0.4);
  if (abs(bl.x) < 4.0 && abs(bl.y) < 0.6) col = pal1m(0.85)*0.9;
  vec2 br = p - vec2(turn*7.0 + 8.0, eyeY-5.0+abs(p.x-(turn*7.0+8.0))*0.4);
  if (abs(br.x) < 4.0 && abs(br.y) < 0.6) col = pal1m(0.85)*0.9;
  // organic left eye
  float blink = mod(uT, 4.3) < 0.14 ? 1.0 : 0.0;
  vec2 el = p - vec2(turn*8.0 - 8.0, eyeY);
  if (blink > 0.5){
    if (abs(el.x) < 4.0 && abs(el.y) < 0.5) col = pal1m(0.8)*0.8;
  } else {
    float lidU = max(0.0, 1.8 - abs(el.x)*0.45);
    if (abs(el.x) < 4.3 && abs(el.y - (-lidU)) < 0.55 && abs(el.y) < lidU + 0.6) col = pal1m(0.9)*0.95;
    if (abs(el.x) < 4.3 && abs(el.y - lidU) < 0.5 && abs(el.y) < lidU + 0.6) col = pal1m(0.55)*0.6;
    if (length(el) < 2.0 && abs(el.y) < lidU) col = pal1m(0.55)*0.7;
    if (length(el) < 0.7) col = pal1m(0.12)*0.2;
    vec2 gl2 = el - vec2(1.0,-1.0);
    if (length(gl2) < 0.55) col = vec3(1.4,1.5,1.45);
  }
  // cyber right eye: reticle
  vec2 er = p - vec2(turn*9.0 + 8.0, eyeY);
  float dRim = abs(length(er*vec2(1.0,0.72)) - 4.4);
  if (dRim < 0.5) col = pal1a(0.9)*1.0;
  for (int ti = 0; ti < 8; ti++){
    float ang = uT*2.4 + float(ti)*0.7853981;
    vec2 tp = vec2(turn*9.0+8.0, eyeY) + vec2(cos(ang)*6.2, sin(ang)*3.4);
    if (length(p-tp) < 0.55) col = pal1a(0.95)*1.1;
  }
  if (abs(er.x) < 2.0 && abs(er.y) < 0.4) col = pal1a(0.9);
  if (abs(er.y) < 2.0 && abs(er.x) < 0.4) col = pal1a(0.9);
  if (length(er) < 0.6) col = vec3(1.6,1.3,1.9);
  // nose
  vec2 nq = p - vec2(turn*9.0, 0.0);
  if (abs(nq.x + 1.0) < 0.5 && nq.y > -7.0 && nq.y < 8.0) col = pal1m(0.75)*0.8;
  if (abs(nq.y - 8.0) < 0.5 && abs(nq.x) < 2.2) col = pal1m(0.9)*0.95;
  if (length(nq-vec2(-2.0,9.0)) < 0.5 || length(nq-vec2(1.0,9.0)) < 0.5) col = pal1m(0.55)*0.6;
  // lips
  vec2 lq = p - vec2(turn*9.0, 12.0);
  for (int ly = 0; ly < 4; ly++){
    float fly = float(ly);
    float w = ly == 0 ? 4.0 : (ly == 1 ? 6.0 : (ly == 2 ? 5.0 : 3.0));
    float shade = ly == 1 ? 0.6 : (ly == 2 ? 0.48 : 0.34);
    if (abs(lq.x) < w && abs(lq.y - fly) < 0.55) col = pal1m(shade)*0.85;
  }
  if (abs(lq.y - 1.0) < 0.35 && abs(lq.x) < 5.2) col = pal1m(0.16)*0.25;
  if (length(lq-vec2(-1.0,2.0)) < 0.55 || length(lq-vec2(1.0,2.0)) < 0.55) col += pal1m(0.95)*0.5;
  if (abs(lq.y + 1.0) < 0.4 && abs(lq.x) < 2.5) col = pal1m(0.3)*0.45;
  if (abs(lq.y - 4.0) < 0.4 && abs(lq.x) < 3.0) col = pal1m(0.22)*0.35;
  // forehead port
  if (abs(p.y - (-20.0+breath)) < 0.5 && mod(p.x - turn*6.0 + 100.0, 2.0) < 1.0 && abs(p.x-turn*6.0) < 5.0)
    col = pal1a(1.0)*1.3;
  // scan sweep
  float scanY = mod(uT*40.0, 150.0) - 15.0;
  col += pal1m(0.5)*exp(-abs(p.y+62.0 - scanY)*0.8)*0.28;
  return col;
}
`;

// ── Act 2 · megacity canyon (true raycast walls + wet street) ──────────────
const GLSL_A2 = `
uniform vec4 uAV[10];
uniform float uFlash;
vec3 pal2m(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.047,0.027,0.012), vec3(0.20,0.12,0.04), smoothstep(0.0,0.3,x));
  c = mix(c, vec3(0.42,0.27,0.078), smoothstep(0.3,0.6,x));
  c = mix(c, vec3(0.89,0.65,0.17), smoothstep(0.6,0.85,x));
  c = mix(c, vec3(1.0,0.91,0.72), smoothstep(0.85,1.0,x));
  return c;
}
vec3 pal2a(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.09,0.016,0.047), vec3(0.34,0.063,0.19), smoothstep(0.0,0.35,x));
  c = mix(c, vec3(0.63,0.11,0.33), smoothstep(0.35,0.7,x));
  c = mix(c, vec3(1.0,0.56,0.75), smoothstep(0.7,1.0,x));
  return c;
}
vec4 wallQuery(vec3 ro, vec3 rd){
  float bestD = 1e9;
  vec3 wcol = vec3(0.0);
  for (int side = 0; side < 2; side++){
    float sgn = side == 0 ? -1.0 : 1.0;
    float z = ro.z;
    for (int k = 0; k < 14; k++){
      float slab = floor(z/26.0);
      float zc = (slab+0.5)*26.0;
      float hx = 30.0 + gh1(slab*2.7 + sgn*13.0)*14.0;
      float h = 38.0 + gh1(slab*3.1 + sgn*7.0)*52.0;
      float t = (sgn*hx - ro.x)/rd.x;
      if (t > 0.0 && t < bestD){
        vec3 hp = ro + rd*t;
        if (hp.z > slab*26.0 && hp.z < (slab+1.0)*26.0 && hp.y < h && hp.y > -12.0){
          bestD = t;
          float fog = exp(-t*0.010);
          float fy = hp.y, fz = hp.z;
          float facade = 0.16 + clamp((fy+12.0)/(h+12.0), 0.0, 1.0)*0.10;
          vec3 wc = pal2m(facade + gfbm(vec2(fz*0.15, fy*0.15))*0.05)*fog;
          vec2 wcell = vec2(floor(fz/2.1), floor(fy/3.3));
          float lit = gh2(wcell + slab*17.0);
          if (lit > 0.44){
            vec2 wf = fract(vec2(fz/2.1, fy/3.3));
            float win = smoothstep(0.12,0.24,wf.x)*smoothstep(0.88,0.76,wf.x)*smoothstep(0.15,0.3,wf.y)*smoothstep(0.9,0.78,wf.y);
            float fl = gh1(lit*977.0 + floor(uT*0.5)) > 0.985 ? 0.3 : 1.0;
            wc += mix(pal2m(0.85), pal2a(0.8), step(0.78, gh1(slab*4.4+sgn)))
                 * win * (0.5 + lit*0.5) * fl * fog;
          }
          if (gh1(slab*5.9 + sgn*3.0) > 0.74 && fy > 6.0 && fy < 16.0 && abs(fz-zc) < 10.0){
            float bb = smoothstep(3.2,2.6,abs(fz-zc))*smoothstep(5.5,4.9,abs(fy-11.0));
            float flick = 0.72 + 0.28*sin(uT*7.0 + fz*2.0);
            wc += pal2a(0.8)*bb*flick*fog;
          }
          if (fy > h-0.8){
            wc += pal2a(0.95)*step(0.3, sin(uT*5.0 + slab*2.7))*fog;
            wc += pal2m(0.4)*0.4*fog;
          }
          wcol = wc;
        }
      }
      z += 26.0;
    }
  }
  return vec4(wcol, bestD);
}
vec3 act2(vec2 uv){
  float aspect = uRes.x/uRes.y;
  vec3 ro = vec3(sin(uT*0.2)*2.0, 4.0 + uU*6.0, uT*24.0 + 20.0);
  vec2 pp = (uv - 0.5)*vec2(aspect, 1.0);
  vec3 rd = normalize(vec3(pp.x*0.9, pp.y*0.9 + 0.10, 1.15));
  vec3 col;
  vec4 wq = wallQuery(ro, rd);
  float tG = rd.y < -0.001 ? (-12.0 - ro.y)/rd.y : 1e9;
  if (tG < wq.w && tG < 1e8){
    // wet street: mirrored wall glow + streaks + lane light
    vec3 gp = ro + rd*tG;
    vec3 rdm = vec3(rd.x, -rd.y, rd.z);
    vec4 wr = wallQuery(gp + vec3(0.0, 0.4, 0.0), rdm);
    float fall = exp(-tG*0.014);
    col = wr.rgb * wr.rgb * 2.2 * fall; // squared = colored smears (neon bleed)
    col *= 0.55 + 0.45*gvno(vec2(gp.x*0.9, gp.z*0.15 + uT*2.5));
    col += pal2m(0.25)*0.10*fall;
    for (int l = 0; l < 2; l++){
      float lx = l == 0 ? -8.0 : 8.0;
      col += pal2a(0.9)*exp(-abs(gp.x-lx)*abs(gp.x-lx)*0.4)*0.35*fall;
    }
  } else if (wq.w < 1e8){
    col = wq.rgb;
  } else {
    // sky: smog gradient + far skyline + lightning
    float hgt = clamp(uv.y, 0.0, 1.0);
    col = pal2m(0.10 + pow(1.0-hgt, 1.6)*0.30)*0.9;
    float colI = floor(uv.x*64.0);
    float sb = gh1(colI*3.3);
    float skh = 0.34 + sb*0.16;
    if (uv.y < skh) col = pal2m(0.32 + sb*0.1)*0.85;
    if (uv.y < skh && gh1(colI*7.1) > 0.6) col += pal2a(0.7)*0.5;
    col += pal2m(0.9)*uFlash*0.5*(1.0-hgt);
  }
  // AV traffic glow + streaks
  for (int i = 0; i < 10; i++){
    vec4 av = uAV[i];
    if (av.z <= 0.0) continue;
    vec2 d2 = (uv - av.xy)*vec2(aspect, 1.0);
    float dd = length(d2);
    vec3 ac = mix(pal2m(0.95), pal2a(0.9), av.w);
    col += ac*exp(-dd*dd/(av.z*0.00008))*1.4;
    col += ac*exp(-d2.y*d2.y*9000.0)*exp(-abs(d2.x)*9.0)*0.5;
  }
  // rain: two layers of slanted streaks
  for (int l = 0; l < 2; l++){
    float fl = float(l);
    vec2 rq = uv*vec2(140.0, 40.0*(1.0+fl*0.7)) + vec2(uT*(6.0+fl*9.0), uT*(38.0+fl*52.0));
    rq.x += floor(rq.y)*1.7;
    vec2 rf = fract(rq) - vec2(0.5);
    if (gh2(floor(rq)) > 0.86-fl*0.05)
      col += pal2m(0.5)*smoothstep(0.20,0.0,length(rf*vec2(3.2,0.7)))*0.24;
  }
  col += pal2m(1.0)*uFlash*0.35;
  return col;
}
`;

// ── Act 3 · dogfight (analytic box intersections, full 3D) ─────────────────
const GLSL_A3 = `
uniform vec4 uB[26];    // pos.xyz, yaw
uniform vec4 uBD[26];   // halfdim.xyz, roll
uniform vec4 uBC[26];   // shade, tint, glow, unused
uniform float uBNf;
uniform vec4 uBeam0[3]; // xyz, on
uniform vec4 uBeam1[3];
uniform vec4 uExp;      // phase, x, y, z
uniform vec4 uDeb[16];  // xyz pos, w size
uniform vec4 uDebC[16]; // bright, tint, spin phase, 0
vec3 pal3m(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.012,0.031,0.07), vec3(0.04,0.137,0.22), smoothstep(0.0,0.3,x));
  c = mix(c, vec3(0.082,0.365,0.52), smoothstep(0.3,0.6,x));
  c = mix(c, vec3(0.35,0.86,0.95), smoothstep(0.6,0.85,x));
  c = mix(c, vec3(0.85,0.96,1.0), smoothstep(0.85,1.0,x));
  return c;
}
vec3 pal3a(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.09,0.027,0.008), vec3(0.34,0.13,0.04), smoothstep(0.0,0.35,x));
  c = mix(c, vec3(0.64,0.29,0.066), smoothstep(0.35,0.7,x));
  c = mix(c, vec3(1.0,0.66,0.37), smoothstep(0.7,1.0,x));
  return c;
}
bool boxHit(vec3 ro, vec3 rd, int i, out float tHit, out vec3 nrm){
  vec3 q = ro - uB[i].xyz;
  float cy = cos(uB[i].w), sy = sin(uB[i].w);
  q.xz = mat2(cy, sy, -sy, cy)*q.xz;
  vec3 qd = rd;
  qd.xz = mat2(cy, sy, -sy, cy)*qd.xz;
  float cr = cos(uBD[i].w), sr = sin(uBD[i].w);
  q.xy = mat2(cr, sr, -sr, cr)*q.xy;
  qd.xy = mat2(cr, sr, -sr, cr)*qd.xy;
  vec3 b = uBD[i].xyz;
  vec3 m = 1.0/qd;
  vec3 nn = m*q;
  vec3 k = abs(m)*b;
  vec3 t1 = -nn - k, t2 = -nn + k;
  float tN = max(max(t1.x, t1.y), t1.z);
  float tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tF < 0.0) return false;
  tHit = tN;
  vec3 bi = (tN == t1.x) ? vec3(-1,0,0) : ((tN == t1.y) ? vec3(0,-1,0) : vec3(0,0,-1));
  bi.xy = mat2(cr, -sr, sr, cr)*bi.xy;
  bi.xz = mat2(cy, -sy, sy, cy)*bi.xz;
  nrm = bi;
  return true;
}
float segDist(vec3 p, vec3 a, vec3 b){
  vec3 pa = p-a, ba = b-a;
  float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa - ba*h);
}
vec3 act3(vec2 uv){
  float aspect = uRes.x/uRes.y;
  float ca = -0.5 + sin(uU*3.14159*0.8)*0.55 + uGyro.x*0.25;
  float ch = 10.0 + uGyro.y*8.0;
  vec3 ro = vec3(-sin(ca)*58.0, ch, -cos(ca)*58.0);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 fw = normalize(ta - ro);
  vec3 ri = normalize(cross(fw, vec3(0.0,1.0,0.0)));
  vec3 up = cross(ri, fw);
  vec2 pp = (uv - 0.5)*vec2(aspect, 1.0);
  vec3 rd = normalize(fw + ri*pp.x*0.9 + up*pp.y*0.9);
  vec3 col;
  // nebula + stars
  vec2 sp = vec2(atan(rd.z, rd.x), asin(clamp(rd.y,-1.0,1.0)));
  float nb = gfbm(sp*3.0 + 31.0);
  if (nb > 0.52) col = mix(pal3m(0.2), pal3a(0.3), step(0.72, nb))*(nb-0.52)*0.5;
  vec2 sc = sp*vec2(160.0, 90.0);
  if (gh2(floor(sc)) > 0.9) col += pal3m(0.8)*(0.3 + 0.7*gh2(floor(sc)+7.0))*0.6;
  // ships
  float bestT = 1e9;
  vec3 bestN = vec3(0.0);
  float bestShade = 0.0; float bestTint = 0.0; float bestGlow = 0.0;
  for (int i = 0; i < 26; i++){
    if (float(i) >= uBNf) break;
    float tH; vec3 nH;
    if (boxHit(ro, rd, i, tH, nH) && tH < bestT){
      bestT = tH; bestN = nH;
      bestShade = uBC[i].x; bestTint = uBC[i].y; bestGlow = uBC[i].z;
    }
  }
  if (bestT < 1e8){
    vec3 L = normalize(vec3(-0.4, 0.7, -0.55));
    float lam = clamp(0.22 + 0.78*max(0.0, dot(bestN, L)), 0.0, 1.1);
    float rim = pow(1.0 - abs(dot(bestN, rd)), 2.0)*0.55;
    float sh = clamp(bestShade*(lam + rim) + bestGlow, 0.05, 1.6);
    vec3 hull = mix(pal3m(sh), pal3a(sh*0.9), clamp(bestTint, 0.0, 1.0));
    col = hull*sh*1.15;
  }
  // beams
  for (int bi = 0; bi < 3; bi++){
    if (uBeam0[bi].w <= 0.0) continue;
    float bd = segDist(ro + rd*min(bestT, 200.0)*0.5, uBeam0[bi].xyz, uBeam1[bi].xyz);
    // proper: distance from RAY to segment — approximate via closest point on ray mid
    float bd2 = segDist(ro + rd*30.0, uBeam0[bi].xyz, uBeam1[bi].xyz);
    float glow = exp(-bd2*bd2*0.08)*uBeam0[bi].w;
    col += pal3a(1.0)*glow*1.8;
    col += vec3(1.2)*exp(-bd2*bd2*0.5)*uBeam0[bi].w;
  }
  // detonation
  float eP = uExp.x;
  if (eP > 0.0){
    vec3 ep = uExp.yzw;
    float er = segDist(ro + rd*40.0, ep, ep);
    if (eP < 0.16){
      float fl = 1.0 - eP/0.16;
      col += mix(pal3a(1.0), vec3(1.5), fl)*exp(-er*er*0.02)*fl*2.2;
    }
    if (eP > 0.08 && eP < 0.85){
      float R = (1.0 - pow(1.0-(eP-0.08)/0.77, 3.0))*42.0 + 2.0;
      float ringD = abs(length((ro + rd*40.0 - ep)*vec3(1.0,2.6,1.0)) - R);
      col += pal3a(0.95)*exp(-ringD*ringD*0.5)*(1.0-(eP-0.08)/0.77)*1.4;
    }
  }
  // debris
  for (int i = 0; i < 16; i++){
    vec4 d0 = uDeb[i];
    if (d0.w <= 0.0) continue;
    float dd = segDist(ro + rd*40.0, d0.xyz, d0.xyz);
    float gl2 = uDebC[i].x*(0.55 + 0.45*sin(uT*9.0 + uDebC[i].z));
    col += mix(pal3m(0.9), pal3a(0.95), uDebC[i].y)*exp(-dd*dd/(d0.w*d0.w*3.0))*gl2;
  }
  return col;
}
`;

// ── Act 4 · aperture (full-res 2D SDF iris) ────────────────────────────────
const GLSL_A4 = `
uniform vec4 uArc[20];  // p0.xy, p1.xy, bright in w of uArcC
uniform vec4 uArcC[20];
vec3 pal4m(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.027,0.012,0.07), vec3(0.114,0.059,0.24), smoothstep(0.0,0.3,x));
  c = mix(c, vec3(0.26,0.125,0.49), smoothstep(0.3,0.55,x));
  c = mix(c, vec3(0.45,0.31,0.79), smoothstep(0.55,0.8,x));
  c = mix(c, vec3(0.91,0.86,1.0), smoothstep(0.8,1.0,x));
  return c;
}
vec3 pal4a(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.086,0.016,0.035), vec3(0.28,0.09,0.11), smoothstep(0.0,0.35,x));
  c = mix(c, vec3(0.55,0.094,0.19), smoothstep(0.35,0.65,x));
  c = mix(c, vec3(1.0,0.49,0.54), smoothstep(0.65,1.0,x));
  return c;
}
vec3 act4(vec2 p){
  vec2 C = vec2(uGyro.x*5.0, uGyro.y*4.0 - 2.0);
  p -= C;
  vec3 col = vec3(0.0);
  // hex containment grid
  vec2 hg = p*vec2(0.16, 0.28);
  float hexD = abs(fract(hg.x + hg.y*0.5) - 0.5);
  if (hexD < 0.035 && gh2(floor(hg + 7.0)) > 0.35)
    col += pal4m(0.12 + gvno(p*0.05 + uT*0.1)*0.05)*0.5;
  // spiral wisps
  for (int i = 0; i < 8; i++){
    float fi = float(i);
    float a = fi*0.785 + uT*0.18;
    float r = 30.0 + 22.0*sin(uT*0.3 + fi*1.2);
    vec2 wp = vec2(cos(a)*r, sin(a)*r*0.9);
    col += pal4m(0.2)*exp(-dot(p-wp,p-wp)*0.1)*0.5;
  }
  float dil = 0.5 + sin(uT*1.15)*0.28;
  if (uU > 0.8) dil = mix(dil, 1.15, pow((uU-0.8)/0.2, 3.0));
  float gearA = uT*0.35;
  // gear ring
  float aP = atan(p.y, p.x*1.136);
  float rP = length(p*vec2(1.0, 1.136));
  float tooth = step(0.3, sin(aP*24.0 + gearA*6.0))*2.6;
  float band = 0.35 + 0.55*pow(max(0.0, sin(aP - uT*2.0)), 8.0);
  float gearD = abs(rP - (47.0 + tooth));
  if (gearD < 1.2) col = pal4m(band)*band;
  else if (gearD < 3.6) col += pal4m(band*0.5)*0.4;
  // blades
  float bladeA = -uT*0.28;
  float innerR = 9.0 + dil*20.0;
  float aB = mod(aP - bladeA, 6.2831853);
  aB = aB > 3.1415926 ? aB - 6.2831853 : aB;
  float bladeW = 0.028 + (1.0-dil)*0.05/6.2831853*6.2831853;
  float curve = (rP - innerR)*0.028 + (1.0-dil)*0.05;
  float bladeAng = aB - curve*3.34;
  float bCell = abs(mod(bladeAng, 0.5235987) - 0.2617994);
  if (rP > innerR && rP < 44.0 && bCell < 0.21){
    float edgeD = rP - innerR;
    float l = edgeD < 1.6 ? 1.0 : 0.42 + 0.18*sin(rP*0.35 - uT*2.0 + bCell*12.0);
    float bIdx = floor(bladeAng/0.5235987 + 100.0);
    vec3 bc = mod(bIdx, 4.0) < 0.5 ? pal4a(l) : pal4m(l);
    col = mix(col, bc*l, clamp(1.2 - bCell*4.0, 0.0, 1.0));
  }
  // event horizon rim
  float hR = 8.0 + dil*3.0;
  float rimD = abs(length(p*vec2(1.0,1.136)) - hR);
  float flick = 0.85 + gvno(vec2(aP*4.0, uT*2.4))*0.5;
  col += pal4a(1.0)*exp(-rimD*rimD*1.4)*1.3*flick;
  col += pal4m(0.9)*exp(-rimD*rimD*0.35)*0.35;
  // void
  float vD = length(p*vec2(1.0,1.136)) - (hR-1.5);
  if (vD < 0.0) col = vec3(0.0);
  // pupil tracking pointer
  vec2 pu = p - uGyro*vec2(2.4, 2.0);
  col += pal4a(1.0)*exp(-dot(pu,pu)*1.8)*2.0;
  // orbiting runes (glyph dots)
  for (int i = 0; i < 14; i++){
    float fi = float(i);
    float oa = fi/14.0*6.2831853 + uT*0.5;
    float depth = sin(oa);
    float rr = 52.0 - depth*4.0;
    vec2 rp = vec2(cos(oa)*rr, sin(oa)*rr*0.88);
    float dl = length(p - rp);
    if (depth > -0.2){
      float cellF = fract((p.x-p.y)*0.5 + fi);
      float br2 = 0.35 + (depth+1.0)*0.35;
      float glyph = step(0.35, fract((p.x*3.1 + p.y*2.7 + fi*13.0)));
      col += mix(pal4m(br2), pal4a(br2), mod(fi,2.0))*exp(-dl*dl*0.35)*br2*(0.4+0.6*glyph);
    }
  }
  // arcs
  for (int i = 0; i < 20; i++){
    vec4 a0 = uArc[i];
    float br2 = uArcC[i].x;
    if (br2 <= 0.0) continue;
    float ad = gsdSeg(p, a0.xy, a0.zw);
    col += mix(pal4m(1.0), pal4a(1.0), uArcC[i].y)*exp(-ad*ad*2.2)*br2*2.0;
  }
  // infalling motes
  for (int i = 0; i < 9; i++){
    float fi = float(i);
    float f = fract(uT*0.22 + fi*0.111);
    float r = (1.0-f)*58.0 + 6.0;
    float a = fi*0.7 + f*5.0;
    vec2 mp = vec2(cos(a)*r, sin(a)*r*0.88);
    if (r > hR+2.0) col += pal4a(0.95)*exp(-dot(p-mp,p-mp)*0.5)*1.1;
  }
  return col;
}
`;

// ── Act 5 · warp tunnel + hero ship (analytic) ─────────────────────────────
const GLSL_A5 = `
vec3 pal5m(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.008,0.05,0.075), vec3(0.027,0.196,0.28), smoothstep(0.0,0.3,x));
  c = mix(c, vec3(0.055,0.43,0.58), smoothstep(0.3,0.6,x));
  c = mix(c, vec3(0.35,0.86,0.95), smoothstep(0.6,0.85,x));
  c = mix(c, vec3(0.86,0.98,1.0), smoothstep(0.85,1.0,x));
  return c;
}
vec3 pal5a(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.027,0.075,0.04), vec3(0.11,0.32,0.13), smoothstep(0.0,0.35,x));
  c = mix(c, vec3(0.25,0.6,0.22), smoothstep(0.35,0.7,x));
  c = mix(c, vec3(0.66,0.98,0.49), smoothstep(0.7,1.0,x));
  return c;
}
vec3 act5(vec2 p){
  float collapse = uU > 0.86 ? pow((uU-0.86)/0.14, 3.0) : 0.0;
  float charge = clamp(uProg*1.25, 0.0, 1.0);
  vec2 q = (p - vec2(0.0, 10.0))*(1.0 - collapse*0.92);
  float a = atan(q.y, q.x);
  float r = max(length(q), 1e-3);
  float zc = 4.0/r + uT*(26.0 + uU*uU*90.0 + charge*46.0)*0.35;
  vec3 col = vec3(0.0);
  // star cells in (angle, depth): elongated streaks
  float ca = a/6.2831853*40.0;
  vec2 cell = vec2(floor(ca), floor(zc*0.9));
  vec2 cf = fract(vec2(ca, zc*0.9));
  float h = gh2(cell);
  if (h > 0.42){
    vec2 pos = vec2(0.25 + gh2(cell+3.1)*0.5, 0.5);
    vec2 d2 = (cf - pos)*vec2(1.0, 0.16);
    float sd = length(d2);
    float bF = clamp(1.0 - zc*0.05, 0.1, 1.0)*(0.4 + h*0.6);
    col += mix(pal5m(bF), pal5a(bF*0.9), step(0.75, h))*smoothstep(0.22, 0.0, sd)*bF*1.6;
  }
  // warp rings
  float ringPh = fract(zc*0.14 - uT*0.2);
  float ring = smoothstep(0.16, 0.02, abs(ringPh - 0.5));
  float rr2 = clamp(1.0 - zc*0.045, 0.1, 1.0);
  col += pal5m(rr2)*ring*rr2*0.9;
  col += pal5a(rr2*0.9)*smoothstep(0.05, 0.0, abs(fract(zc*0.14 - uT*0.2 + 0.02) - 0.5))*rr2*0.5;
  // radial speed streaks near edges
  float ang2 = fract(a/6.2831853*20.0 + gh1(floor(a/6.2831853*20.0))*7.0 + uT*0.8);
  col += pal5m(0.4)*smoothstep(0.3,0.0,abs(ang2-0.5))*smoothstep(34.0, 58.0, r)*0.3;
  // hero ship (2D silhouette with facets)
  vec2 sp = p - vec2(0.0, 26.0);
  float bank = sin(uT*0.9)*0.05 + uGyro.x*0.06;
  float cb = cos(bank), sbb = sin(bank);
  sp = vec2(sp.x*cb - sp.y*sbb, sp.x*sbb + sp.y*cb);
  // hull: swept dart built from edge functions
  float noseY = -14.0*1.35, midY = -7.0*1.35;
  float eTop = sp.y - (noseY + (0.55)*(sp.x+27.0));     // upper edge L
  float eBot = sp.y - (midY - 0.28*(sp.x+27.0));
  float inHull = step(-27.0, sp.x)*step(sp.x, 0.0)
    * step(eTop, 0.0)*step(0.0, eBot);
  // wings
  float wingR = step(0.0, sp.x)*step(sp.x, 22.0)
    * step(sp.y - (-6.0 - 0.16*sp.x), 0.0)*step(sp.y - (2.0 - 0.35*sp.x), 0.0);
  float wingL = step(-22.0, sp.x)*step(sp.x, 0.0)
    * step(sp.y - (-6.0 - 0.16*(sp.x+22.0)) - -0.0, 0.0);
  float hull = max(inHull, wingR);
  if (hull > 0.5){
    float shade = 0.35 + 0.4*clamp((sp.y+14.0)/22.0, 0.0, 1.0);
    shade += 0.2*exp(-pow((sp.x+10.0)/6.0, 2.0)); // nose sheen
    col = pal5m(shade)*shade*1.3;
    if (sp.y < -8.0 && sp.x < 0.0) col = pal5m(shade*0.7)*shade*0.9;
  }
  // canopy
  if (sp.x > -9.0 && sp.x < -1.0 && sp.y > -12.5 && sp.y < -8.0)
    col = mix(col, pal5m(0.95), 0.8)*(0.9 + 0.1*sin(uT*7.0));
  // nav lights
  if (length(sp - vec2(21.0, -2.0)) < 1.1 && sin(uT*4.0) > 0.0) col += pal5a(1.0)*1.6;
  // twin plumes with mach diamonds
  for (int nz = 0; nz < 2; nz++){
    float nx0 = nz == 0 ? -20.0 : -25.0;
    float plumeLen = 22.0 + sin(uT*13.0)*2.0 + charge*10.0;
    if (sp.x > nx0-plumeLen && sp.x < nx0 && abs(sp.y + 2.0 + (nx0-sp.x)*0.06) < 2.6){
      float f = (nx0 - sp.x)/plumeLen;
      float flick = 0.85 + gvno(vec2(sp.x*0.5, uT*9.0))*0.3;
      float l = (1.0-f)*1.3*flick;
      col += pal5a(l)*l*0.9*smoothstep(2.6, 0.6, abs(sp.y + 2.0 + (nx0-sp.x)*0.06));
      float node = abs(mod(sp.x + 2.0, 4.0) - 2.0);
      if (node < 0.7 && f < 0.9) col += pal5m(1.0)*1.1;
    }
  }
  // collapse singularity
  if (collapse > 0.6){
    float cl = (collapse-0.6)/0.4;
    col += pal5a(1.0)*exp(-dot(q,q)*0.15)*cl*2.0;
    col *= mix(1.0, 0.05, clamp((cl-0.85)/0.15, 0.0, 1.0));
  }
  return col;
}
`;

// Each scene program contains only its own act's uniforms. Passed to the
// engine factory via host.sources (never via closure — the factory is
// stringified into the worker). Declared AFTER the shader strings.

const GLSL_POST = `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform vec2 uCellPx;
uniform float uTime, uGlitch, uPowerOn, uFlash, uGrille;
float ph2(vec2 p){ return fract(sin(p.x*127.1 + p.y*311.7)*43758.5453); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 buv = 0.5 + cc*(1.0 + 0.05*r2);           // barrel
  float rowN = ph2(vec2(floor(uv.y*90.0), floor(uTime*24.0)));
  float tear = rowN > 0.9 ? (rowN-0.9)*22.0*uGlitch*sign(rowN-0.95) : 0.0;
  buv.x = fract(buv.x + tear*0.05);
  float ab = 0.0012 + uGlitch*0.005;
  vec3 col;
  col.r = texture2D(uScene, clamp(buv+vec2(ab,0.0), 0.001, 0.999)).r;
  col.g = texture2D(uScene, clamp(buv, 0.001, 0.999)).g;
  col.b = texture2D(uScene, clamp(buv-vec2(ab,0.0), 0.001, 0.999)).b;
  vec3 bloom = texture2D(uScene, clamp(buv, 0.001, 0.999), 3.0).rgb;
  col += bloom*0.45;
  // character cell: glyph ramp + per-cell color
  vec2 cellId = floor(gl_FragCoord.xy/uCellPx);
  vec2 cuv = (cellId*uCellPx + uCellPx*0.5)/uRes;
  vec3 cellCol = texture2D(uScene, clamp(cuv, 0.001, 0.999)).rgb;
  cellCol += texture2D(uScene, clamp(cuv, 0.001, 0.999), 3.0).rgb*0.4;
  float lum = dot(cellCol, vec3(0.299, 0.587, 0.114));
  lum += (ph2(cellId + floor(uTime*61.0)) - 0.5)*0.05;   // animated grain
  float gi = clamp(floor(pow(max(lum, 0.0), 0.82)*15.0 + 0.5), 0.0, 15.0);
  vec2 cf = fract(gl_FragCoord.xy/uCellPx);
  float ga = texture2D(uAtlas, vec2((gi + clamp(cf.x, 0.02, 0.98))/16.0, clamp(cf.y, 0.02, 0.98))).r;
  vec3 outc = cellCol*ga*1.35;
  // cell lattice
  vec2 gf = abs(cf - 0.5);
  outc *= 0.82 + 0.18*smoothstep(0.5, 0.4, max(gf.x, gf.y));
  // aperture grille
  float g3 = fract(gl_FragCoord.x/3.0);
  outc *= vec3(0.86 + 0.28*step(g3, 0.333), 0.86 + 0.28*step(0.333, g3)*step(g3, 0.666), 0.86 + 0.28*step(0.666, g3))*uGrille + (1.0-uGrille);
  // scanline
  outc *= 0.86 + 0.14*sin(gl_FragCoord.y*3.14159);
  // retrace band
  outc += vec3(0.85, 1.0, 0.98)*exp(-abs(uv.y - fract(uTime*0.11))*55.0)*0.05;
  // power-on band
  if (uPowerOn >= 0.0){
    float bw = (0.04 + 0.96*pow(uPowerOn, 0.3333))*0.5;
    float dy = abs(uv.y - 0.5);
    if (dy > bw) { outc *= 0.0; }
    else outc *= 1.0 + (1.0-uPowerOn)*1.4;
  }
  // dropout
  if (uGlitch > 0.3 && ph2(cellId + floor(uTime*47.0)) > 0.93) outc *= 0.08;
  outc *= 1.0 - 0.42*r2;   // vignette
  outc += vec3(uFlash);
  gl_FragColor = vec4(outc, 1.0);
}
`;

/**
 * GL engine wrapper. Tries the full-resolution WebGL2 path; every failure
 * path (no context, no float buffers, compile/link errors, runtime) falls
 * back to the proven 2D half-block engine via host.engine2D. The validation
 * render happens on a THROWAWAY 4x4 canvas first so a dead GL stack never
 * burns the real canvas's context slot.
 */
const GL_SOURCES = {
  vert: GLSL_VERT,
  common: GLSL_COMMON,
  acts: [GLSL_A1, GLSL_A2, GLSL_A3, GLSL_A4, GLSL_A5],
  post: GLSL_POST,
};

function createEngineGL(host) {
  'use strict';
  const ACTS = 5, ACT_LEN = 6.5, LOOP_LEN = ACTS * ACT_LEN;
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const lerp = (a, b, t) => a + (b - a) * t;

  // Shader sources MUST arrive via host (this factory is stringified into the
  // worker and cannot close over module scope).
  const SRC = host && host.sources;
  if (!SRC || !SRC.vert || !SRC.common || !SRC.acts || SRC.acts.length < ACTS || !SRC.post) {
    return host && host.engine2D ? host.engine2D(host) : { receive() {} };
  }
  const sceneSrc = (actIdx) => 'precision highp float;\n' +
    'uniform vec2 uRes; uniform float uT; uniform float uU; uniform vec2 uGyro; uniform float uProg;\n' +
    SRC.common + SRC.acts[actIdx] +
    'void main(){\n' +
    '  vec2 uv = gl_FragCoord.xy/uRes;\n' +
    '  float aspect = uRes.x/uRes.y;\n' +
    '  vec2 sc = vec2((uv.x-0.5)*aspect*120.0, (0.5-uv.y)*120.0);\n' +
    '  vec3 c;\n' +
    (actIdx === 1 || actIdx === 2
      ? '  c = ' + (actIdx === 1 ? 'act2(uv);' : 'act3(uv);') + '\n'
      : '  c = ' + (actIdx === 0 ? 'act1(sc);' : actIdx === 3 ? 'act4(sc);' : 'act5(sc);') + '\n') +
    '  gl_FragColor = vec4(c, 1.0);\n' +
    '}\n';

  function fallback2D(reason) {
    try { if (host.post) host.post({ type: 'glFallback', reason: String(reason) }); } catch {}
    if (host.engine2D) return host.engine2D(host);
    return { receive() {} };
  }

  // ── validate the whole GL stack on a THROWAWAY canvas first ─────────────
  // Programs are not shareable across contexts, so this compiles everything
  // once on a scratch context; only a fully passing pipeline ever touches
  // the real canvas's context slot.
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
    for (let a = 0; a < ACTS; a++) {
      const p = sgl.createProgram();
      sgl.attachShader(p, sv);
      sgl.attachShader(p, cShader(sgl, sgl.FRAGMENT_SHADER, sceneSrc(a)));
      sgl.linkProgram(p);
      if (!sgl.getProgramParameter(p, sgl.LINK_STATUS)) throw new Error(sgl.getProgramInfoLog(p));
    }
    const pp = sgl.createProgram();
    sgl.attachShader(pp, sv);
    sgl.attachShader(pp, cShader(sgl, sgl.FRAGMENT_SHADER, SRC.post));
    sgl.linkProgram(pp);
    if (!sgl.getProgramParameter(pp, sgl.LINK_STATUS)) throw new Error(sgl.getProgramInfoLog(pp));
    validated = true;
  } catch (e) {
    return fallback2D('validate:' + e.message);
  }
  if (!validated) return fallback2D('validate-false');

  // ── live state ──────────────────────────────────────────────────────────
  let gl = null, canvas = null, ctx2dWave = null;
  let W = 640, H = 380, WW = 200, WH = 48;
  let progScene = [], progPost = null, quadBuf = null;
  let sceneTex = null, sceneFb = null, atlasTex = null;
  let renderScale = 1.0;
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
  let uLocalCache = 0;

  // uniform array scratch (allocated once)
  const segData = new Float32Array(70 * 4);
  const cabData = new Float32Array(7 * 4);
  const avData = new Float32Array(10 * 4);
  const boxData = new Float32Array(26 * 4);
  const boxDim = new Float32Array(26 * 4);
  const boxCol = new Float32Array(26 * 4);
  const beam0 = new Float32Array(3 * 4);
  const beam1 = new Float32Array(3 * 4);
  const expData = new Float32Array(4);
  const debData = new Float32Array(16 * 4);
  const debCol = new Float32Array(16 * 4);
  const arcData = new Float32Array(20 * 4);
  const arcCol = new Float32Array(20 * 4);
  let boxCount = 0;

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
    let ac;
    if (typeof OffscreenCanvas === 'function') ac = new OffscreenCanvas(16 * 16, 16);
    else if (host.document && host.document.createElement) {
      ac = host.document.createElement('canvas');
      ac.width = 16 * 16; ac.height = 16;
    } else return null;
    const c2 = ac.getContext('2d');
    c2.fillStyle = '#000';
    c2.fillRect(0, 0, ac.width, ac.height);
    c2.fillStyle = '#fff';
    c2.font = 'bold 14px "IBM Plex Mono","Consolas",monospace';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    const ramp = ' .:;=+*xX#%@MB8';
    for (let i = 0; i < 16; i++) c2.fillText(ramp[i], i * 16 + 8, 9);
    const tex = gl2.createTexture();
    gl2.bindTexture(gl2.TEXTURE_2D, tex);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, ac);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
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
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    } catch { gl = null; }
    if (!gl) throw new Error('real-context-failed');
    try { hdrOK = !!gl.getExtension('EXT_color_buffer_float'); } catch { hdrOK = false; }
    W = msg.width || 640; H = msg.height || 380;
    if (msg.waveformCanvas) {
      ctx2dWave = msg.waveformCanvas.getContext('2d');
      WW = msg.waveWidth || 200; WH = msg.waveHeight || 48;
    }
    reduced = !!msg.reducedMotion;
    for (let a = 0; a < ACTS; a++) progScene.push(link(gl, SRC.vert, sceneSrc(a)));
    progPost = link(gl, SRC.vert, SRC.post);
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    atlasTex = buildAtlasTex(gl);
    if (!atlasTex) throw new Error('no-atlas');
    const f = makeFBO(gl, Math.max(2, Math.round(W * renderScale)), Math.max(2, Math.round(H * renderScale)));
    if (!f) throw new Error('no-fbo');
    sceneTex = f.tex; sceneFb = f.fb;
    gl.viewport(0, 0, W, H);
    running = true;
    rafId = host.raf(frame);
  }

  function resizeFBO() {
    try {
      const f = makeFBO(gl, Math.max(2, Math.round(W * renderScale)), Math.max(2, Math.round(H * renderScale)));
      if (f) {
        if (sceneTex) gl.deleteTexture(sceneTex);
        if (sceneFb) gl.deleteFramebuffer(sceneFb);
        sceneTex = f.tex; sceneFb = f.fb;
      }
    } catch {}
  }

  // ── choreography (JS side; feeds uniform arrays) ────────────────────────
  function choreograph(act, u) {
    boxCount = 0;
    if (act === 0) {
      const turn = clamp(gx * 0.45 + Math.sin(T * 0.35) * 0.12, -0.5, 0.5);
      const breath = Math.sin(T * 1.1) * 0.7;
      const pulse = (T * 0.55) % 1;
      const SEG = 10;
      for (let c = 0; c < 7; c++) {
        const side = c % 2 === 0 ? -1 : 1;
        const rootX = turn * 8 + side * (17 + (c % 3) * 2.4);
        const rootY = -24 + ((c / 2) | 0) * 7 + breath;
        const endX = turn * 8 + side * (46 + hash01(c * 9.1) * 12);
        const endY = 56 - hash01(c * 5.1) * 8;
        const pf = (pulse + c * 0.143) % 1;
        for (let s = 0; s < SEG; s++) {
          const f0 = s / SEG, f1 = (s + 1) / SEG;
          const sag = (ff) => Math.sin(ff * Math.PI) * (10 + hash01(c * 3.1) * 8) * (1 - ff * 0.3);
          const wob = (ff) => Math.sin(T * 1.3 + c * 2 + ff * 5) * 1.4 * ff;
          const o = (c * SEG + s) * 4;
          segData[o] = lerp(rootX, endX, f0) + wob(f0) * 0.4;
          segData[o + 1] = lerp(rootY, endY, f0) + sag(f0) + wob(f0);
          segData[o + 2] = lerp(rootX, endX, f1) + wob(f1) * 0.4;
          segData[o + 3] = lerp(rootY, endY, f1) + sag(f1) + wob(f1);
        }
        const co = c * 4;
        cabData[co] = Math.abs(pf - 0.5) < 0.09 ? 1.0 : 0.15;
        cabData[co + 1] = 0;
        cabData[co + 2] = 0.3;
        cabData[co + 3] = 0.5;
      }
      energy = 0.25 + Math.max(0, Math.sin(T * 2.4)) * 0.1;
    } else if (act === 1) {
      const aspect = W / H;
      const camX = Math.sin(T * 0.2) * 2, camY = 4 + u * 6, camZ = T * 24 + 20;
      for (let lane = 0; lane < 3; lane++) {
        const ly = 2 + lane * 4, dir = lane % 2 === 0 ? 1 : -1, speed = 26 + lane * 9;
        for (let vi = 0; vi < 3; vi++) {
          const idx = lane * 3 + vi;
          const wx = dir > 0 ? -30 + ((T * speed + vi * 26 + lane * 11) % 64) : 30 - ((T * speed + vi * 26 + lane * 11) % 64);
          const wz = camZ + 30 + lane * 12;
          const cz = wz - camZ;
          if (cz <= 1) { avData[idx * 4 + 2] = 0; continue; }
          avData[idx * 4] = 0.5 + ((wx - camX) / (cz * 1.15 * aspect)) * 0.5;
          avData[idx * 4 + 1] = 0.5 - ((ly - camY) / (cz * 1.15)) * 0.5;
          avData[idx * 4 + 2] = clamp(1 - cz / 120, 0.05, 1) * 900;
          avData[idx * 4 + 3] = lane === 1 ? 1 : 0;
        }
      }
      const bolt = Math.max(0, 1 - Math.abs(u - 0.5) / 0.012) + Math.max(0, 1 - Math.abs(u - 0.82) / 0.008);
      expData[0] = clamp(bolt, 0, 1);
      energy = 0.35 + expData[0] * 0.6;
    } else if (act === 2) {
      const pushBox = (x, y, z, hx, hy, hz, yaw, roll, shade, tint, glow) => {
        if (boxCount >= 26) return;
        const o = boxCount * 4;
        boxData[o] = x; boxData[o + 1] = y; boxData[o + 2] = z; boxData[o + 3] = yaw;
        boxDim[o] = hx; boxDim[o + 1] = hy; boxDim[o + 2] = hz; boxDim[o + 3] = roll;
        boxCol[o] = shade; boxCol[o + 1] = tint; boxCol[o + 2] = glow; boxCol[o + 3] = 0;
        boxCount++;
      };
      const destroyed = u > 0.55;
      const fYaw = 0.35 + Math.sin(T * 0.3) * 0.06;
      const fRoll = Math.sin(T * 0.5) * 0.05;
      const fBX = Math.sin(T * 0.4) * 2, fBY = Math.sin(T * 0.7) * 1.2;
      const FRIG = [[0, 0, 0, 16, 3.2, 6], [2, 4.2, -3, 5, 2.6, 3.4], [0, 0, -8.5, 7, 2.4, 3], [0, -4.6, 2, 10, 0.8, 4], [-13, 1, -1, 3.4, 3.4, 3.4], [13, 1, -1, 3.4, 3.4, 3.4]];
      if (!destroyed) {
        for (let i = 0; i < FRIG.length; i++) {
          const b = FRIG[i];
          pushBox(b[0] + fBX, b[1] + fBY, b[2], b[3], b[4], b[5], fYaw, fRoll, 0.55, 0, 0);
        }
        for (let e = -1; e <= 1; e++)
          pushBox(e * 3.4 * Math.cos(fYaw) - 11.4 * Math.sin(fYaw) + fBX, fBY + 0.1, -e * 3.4 * Math.sin(fYaw) - 11.4 * Math.cos(fYaw), 0.7, 0.7, 0.7, 0, 0, 0.2, 1, 1.4);
      } else {
        const dT = (u - 0.55) / 0.45;
        for (let i = 0; i < 16; i++) {
          const ang = hash01(i * 4.4) * Math.PI * 2;
          const spd = 10 + hash01(i * 8.8) * 26;
          const dd = Math.pow(dT, 3) * spd * 2.2;
          pushBox(fBX + Math.cos(ang) * dd, fBY + Math.sin(ang) * dd * 0.6 + dT * dT * -6, Math.sin(ang) * dd * 0.4,
            0.8 + hash01(i * 2.2) * 1.4, 0.7, 0.9, ang, dT * 9, 0.4, i % 3 === 0 ? 1 : 0,
            Math.max(0, 0.9 - dT) * (Math.cos(dT * 20 + i * 2.4) > 0.4 ? 1.0 : 0.3));
        }
        if (u > 0.62) {
          const eT = (u - 0.62) / 0.38;
          pushBox(lerp(40, 66, eT), 10 - eT * 6, -8 - eT * 14, 4.4, 0.9, 1.6, 1.4, 0.4, 0.8, 0, 0.4);
        }
        expData[0] = dT;
        expData[1] = fBX; expData[2] = fBY; expData[3] = 0;
      }
      if (!destroyed || u < 0.62) {
        const runT = clamp(u / 0.55, 0, 1);
        const ix = lerp(-52, 40, runT) + Math.sin(runT * Math.PI) * -6;
        const iy = 10 + Math.sin(runT * Math.PI * 1.6) * 7;
        const iz = lerp(18, -8, runT);
        const iYaw = 1.2 + Math.sin(u * 6) * 0.15;
        pushBox(ix, iy, iz, 4.4, 0.9, 1.6, iYaw, Math.sin(T * 3) * 0.3, 0.8, 0, 0);
        pushBox(ix, iy, iz + 2.6, 1.1, 0.4, 2.4, iYaw, 0, 0.9, 0, 0);
        const volley = Math.floor(u / 0.14);
        const vPhase = (u % 0.14) / 0.14;
        for (let bi = 0; bi < 3; bi++) {
          const on = (!destroyed && volley === bi && vPhase < 0.42) ? Math.max(0, 1 - vPhase * 1.8) : 0;
          beam0[bi * 4] = ix + 5; beam0[bi * 4 + 1] = iy; beam0[bi * 4 + 2] = iz + 2; beam0[bi * 4 + 3] = on;
          beam1[bi * 4] = fBX - 4 + volley * 5; beam1[bi * 4 + 1] = 2 + fBY; beam1[bi * 4 + 2] = 6; beam1[bi * 4 + 3] = 0;
        }
        energy = 0.75;
      } else {
        energy = 0.5;
      }
    } else if (act === 3) {
      const arcPhase = (T % 1.4) / 1.4;
      arcCol.fill(0);
      if (arcPhase < 0.06 && !reduced) {
        const seed = Math.floor(T / 1.4);
        const hR = 8 + (0.5 + Math.sin(T * 1.15) * 0.28) * 3;
        for (let aI = 0; aI < 2; aI++) {
          const a0x = Math.sin(seed * 3.1 + aI * 2.7) * hR;
          const a0y = -2 + Math.sin(seed * 5.3 + aI * 1.3) * hR * 0.88;
          const a1x = Math.cos(seed * 7.1 + aI) * 46;
          const a1y = -2 + Math.sin(seed * 11.2 + aI) * 40;
          let px0 = a0x, py0 = a0y;
          for (let s = 1; s <= 10; s++) {
            const f = s / 10;
            const jx = (hash01(seed + s * 3.1 + aI * 7) - 0.5) * 9 * (1 - f);
            const jy = (hash01(seed + s * 7.7 + aI * 3) - 0.5) * 9 * (1 - f);
            const px1 = lerp(a0x, a1x, f) + jx;
            const py1 = lerp(a0y, a1y, f) + jy;
            const o = (aI * 10 + s - 1) * 4;
            arcData[o] = px0; arcData[o + 1] = py0; arcData[o + 2] = px1; arcData[o + 3] = py1;
            arcCol[o] = 1.2;
            arcCol[o + 1] = aI;
            px0 = px1; py0 = py1;
          }
        }
        energy = 0.9;
      }
    } else if (act === 4) {
      energy = 0.45 + Math.abs(Math.sin(T * 13)) * 0.1;
    }
  }
  function hash01(n) {
    const x = Math.sin(n) * 43758.5453123;
    return x - Math.floor(x);
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

  function bindQuad(prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function uploadActUniforms(act, prog) {
    const loc4 = (name, data, cnt) => {
      const l = gl.getUniformLocation(prog, name);
      if (l) gl.uniform4fv(l, cnt ? data.subarray(0, cnt * 4) : data);
    };
    if (act === 0) { loc4('uSeg', segData, 70); loc4('uCab', cabData, 7); }
    else if (act === 1) {
      loc4('uAV', avData, 10);
      gl.uniform1f(gl.getUniformLocation(prog, 'uFlash'), expData[0] * (reduced ? 0.2 : 1.0));
    } else if (act === 2) {
      loc4('uB', boxData, 26); loc4('uBD', boxDim, 26); loc4('uBC', boxCol, 26);
      gl.uniform1f(gl.getUniformLocation(prog, 'uBNf'), boxCount);
      loc4('uBeam0', beam0, 3); loc4('uBeam1', beam1, 3);
      loc4('uExp', expData, 1);
      loc4('uDeb', debData, 16); loc4('uDebC', debCol, 16);
    } else if (act === 3) { loc4('uArc', arcData, 20); loc4('uArcC', arcCol, 20); }
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
    uLocalCache = uLocal;
    let glitch = 0;
    if (labAct < 0) {
      if (uLocal > 0.925) glitch = (uLocal - 0.925) / 0.075;
      else if (uLocal < 0.055) glitch = 1 - uLocal / 0.055;
      if (reduced) glitch *= 0.35;
    }
    const powerOn = (labAct === 0 || (labAct < 0 && act === 0 && tt < ACT_LEN)) ? (tt < 0.9 ? tt / 0.9 : -1) : -1;

    if (frameCounter > 0 && frameCounter % 120 === 0) {
      if (frameCostAvg > 22 && renderScale > 0.5) { renderScale = Math.max(0.5, renderScale - 0.25); resizeFBO(); }
      else if (frameCostAvg < 9 && renderScale < 1.0) { renderScale = Math.min(1.0, renderScale + 0.25); resizeFBO(); }
    }

    choreograph(act, uLocal);
    const flash = (act === 1 ? expData[0] : (act === 2 && uLocal > 0.55 && uLocal < 0.62 ? 1 - (uLocal - 0.55) / 0.07 : 0));

    const rw = Math.max(2, Math.round(W * renderScale));
    const rh = Math.max(2, Math.round(H * renderScale));
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFb);
      gl.viewport(0, 0, rw, rh);
      const ps = progScene[act];
      gl.useProgram(ps);
      gl.uniform2f(gl.getUniformLocation(ps, 'uRes'), rw, rh);
      gl.uniform1f(gl.getUniformLocation(ps, 'uT'), T);
      gl.uniform1f(gl.getUniformLocation(ps, 'uU'), uLocal);
      gl.uniform2f(gl.getUniformLocation(ps, 'uGyro'), gx, gy);
      gl.uniform1f(gl.getUniformLocation(ps, 'uProg'), progressShown);
      bindQuad(ps);
      uploadActUniforms(act, ps);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.generateMipmap(gl.TEXTURE_2D);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(progPost);
      bindQuad(progPost);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(gl.getUniformLocation(progPost, 'uScene'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(gl.getUniformLocation(progPost, 'uAtlas'), 1);
      gl.uniform2f(gl.getUniformLocation(progPost, 'uRes'), W, H);
      const cellPx = Math.max(3.5, W / 220.0);
      gl.uniform2f(gl.getUniformLocation(progPost, 'uCellPx'), cellPx, cellPx * 1.9);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uTime'), T);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uGlitch'), glitch);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uPowerOn'), powerOn);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uFlash'), flash * (reduced ? 0.15 : 1.0) * 0.22);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uGrille'), 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
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

  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 640, height: 380 };
  const w = Math.round((rect.width || 640) * dpr);
  const h = Math.round((rect.height || 380) * dpr);
  const reducedAtInit = isReducedMotion();

  // ── host selection ──────────────────────────────────────────────────────
  // transferControlToOffscreen is IRREVERSIBLE. After a successful transfer
  // there is no fallback context — if the Worker then fails we keep the
  // transferred OffscreenCanvas and drive the SAME engine on the main thread.
  // Pinned by test/loading-boot-resilience.test.mjs.
  let offscreen = null;
  let offscreenWave = null;
  try {
    if (
      typeof globalThis.Worker === 'function' &&
      typeof globalThis.Blob === 'function' &&
      typeof canvas.transferControlToOffscreen === 'function'
    ) {
      offscreen = canvas.transferControlToOffscreen();
      canvas.__sfTransferred = true; // irreversible from this line on
      if (waveformCanvas && typeof waveformCanvas.transferControlToOffscreen === 'function') {
        offscreenWave = waveformCanvas.transferControlToOffscreen();
        waveformCanvas.__sfTransferred = true;
      }
      const blob = new Blob([WORKER_BOOTSTRAP(force2D)], { type: 'application/javascript' });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      worker.postMessage(
        {
          type: 'init',
          canvas: offscreen,
          waveformCanvas: offscreenWave,
          width: w,
          height: h,
          waveWidth: 200,
          waveHeight: 48,
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
        };
        mainEngine = force2D ? createEngine(hostMain) : createEngineGL(hostMain);
        mainEngine.receive({
          type: 'init',
          canvas: target,
          waveformCanvas: targetWave,
          width: target === canvas ? w : w,
          height: target === canvas ? h : h,
          waveWidth: 200,
          waveHeight: 48,
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
    'NEURAL_BIOFEED // GHOST IN THE WIRE',
    'SECTOR_09 // NIGHT METROPOLIS',
    'KINETIC INTERCEPT // HOSTILE RUN',
    'APERTURE // MACHINE GOD',
    'TESSERA-MK3 // HYPERWARP',
  ];
  const actLogs = [
    '[ACT_01] NEURAL_BIOFEED // GHOST_IN_THE_WIRE',
    '[ACT_02] SECTOR_09 // METROPOLIS_SURVEILLANCE',
    '[ACT_03] KINETIC_COMBAT // INTERCEPT_DOGFIGHT',
    '[ACT_04] AI_CORE_APERTURE // OMNI_IRIS_SYNTHESIS',
    '[ACT_05] TESSERA_CORVETTE // HYPERDRIVE_IGNITION',
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
    // Dev-lab passthrough (scripts/loading-terminal-lab.html). Forwards raw
    // engine messages ('lab' pins acts / freezes the clock). Harmless if the
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
