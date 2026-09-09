/**
 * Deterministic CPU texture sampling for thruster/RCS atlases.
 * Pure JS — no canvas, no GPU. Seeded noise only.
 */

export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGrid(seed, size = 256) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(size);
  for (let i = 0; i < size; i++) grid[i] = rnd();
  return grid;
}

export function valueNoise2D(x, y, seed = 17, gridSize = 16) {
  // Stable grid derived from seed (not per-call reseed of full field with drifting state)
  const cacheKey = seed;
  if (!valueNoise2D._cache) valueNoise2D._cache = new Map();
  let grid = valueNoise2D._cache.get(cacheKey);
  if (!grid) {
    grid = makeGrid(seed, gridSize * gridSize);
    valueNoise2D._cache.set(cacheKey, grid);
  }
  const at = (ix, iy) => grid[((iy & (gridSize - 1)) * gridSize) + (ix & (gridSize - 1))];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  let sx = x - x0;
  let sy = y - y0;
  sx = sx * sx * (3 - 2 * sx);
  sy = sy * sy * (3 - 2 * sy);
  const n00 = at(x0, y0);
  const n10 = at(x0 + 1, y0);
  const n01 = at(x0, y0 + 1);
  const n11 = at(x0 + 1, y0 + 1);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}

/** Soft radial falloff (no hard card edge). u,v in [0,1]. */
export function sampleSoftRadial(u, v, opts = {}) {
  const cx = opts.cx ?? 0.5;
  const cy = opts.cy ?? 0.5;
  const dx = (u - cx) / (opts.rx ?? 0.48);
  const dy = (v - cy) / (opts.ry ?? 0.48);
  const r = Math.sqrt(dx * dx + dy * dy);
  const core = Math.exp(-r * r * (opts.coreSharp ?? 4.5));
  const halo = Math.exp(-r * (opts.haloFall ?? 2.8)) * (opts.haloAmp ?? 0.4);
  const edge = r >= 1 ? 0 : 1;
  return Math.min(1, (core + halo) * edge);
}

/** Anisotropic stream / flow — bright along centerline, streaks along u. */
export function sampleFlowStream(u, v, opts = {}) {
  const seed = opts.seed ?? 19;
  const side = (v - 0.5) * 2;
  const cross = Math.exp(-side * side * (opts.crossSharp ?? 5.2));
  const along = Math.pow(1 - u * 0.15, 0.6);
  const warp = valueNoise2D(u * 6.0, side * 2.0 + 0.3, seed) - 0.5;
  const streak = valueNoise2D(u * 10.0 - warp * 0.4, side * 3.5, seed + 3);
  const filament = 0.35 + streak * 0.75;
  // Soft vertical edge so card border is transparent
  const edgeY = 1 - Math.min(1, Math.max(0, (Math.abs(side) - 0.72) / 0.28));
  const edgeX = Math.min(1, u / 0.04) * Math.min(1, (1 - u) / 0.08);
  return Math.max(0, Math.min(1, cross * along * filament * edgeY * edgeX));
}

/**
 * RCS core jet — nozzle-hot sharp core, narrow directional body, one-sided turbulent
 * breakup, short fading tail. Explicitly rejects ball/ellipse/flash form.
 * u=0 at nozzle, u=1 at tail; v cross-axis.
 */
export function sampleRcsJet(u, v, opts = {}) {
  const seed = opts.seed ?? 41;
  const side = (v - 0.5) * 2;
  // Nozzle-hot sharp core: very narrow, brightest at u≈0
  const core = Math.exp(-side * side * 22.0) * Math.pow(Math.max(0, 1 - u * 2.1), 2.4) * 1.25;
  // Narrow elongated body (high aspect along u)
  const body = Math.exp(-side * side * 9.0) * Math.pow(Math.max(0, 1 - u * 1.35), 1.15) * 0.58;
  // One-sided turbulent breakup on +side only near mid→tip
  const nTurb = valueNoise2D(u * 14.0, side * 2.2, seed);
  const breakMask = Math.max(0, u - 0.28) * Math.max(0, side);
  const asym = 1 - breakMask * (1.35 + nTurb * 1.1);
  // Short fading tail (weak, continuous from body, not a detached puff)
  const tail = Math.exp(-side * side * 4.0)
    * Math.max(0, u - 0.5)
    * Math.pow(Math.max(0, 1 - u), 1.6)
    * 0.4
    * (0.5 + valueNoise2D(u * 9.0, side, seed + 3) * 0.5);
  // Longitudinal filaments only (no isotropic blobs)
  const filament = 0.55 + valueNoise2D(u * 18.0, side * 0.7, seed) * 0.45;
  const field = (core + body * Math.max(0.12, asym) + tail) * filament;
  // Hard-reject circular falloff: require strong cross-axis compression
  const edgeY = Math.pow(Math.max(0, 1 - Math.abs(side)), 2.8);
  const edgeX = Math.min(1, u / 0.03) * Math.min(1, (1 - u) / 0.1);
  return Math.max(0, Math.min(1, field * edgeY * edgeX));
}

/**
 * Outer sheath — directional turbulent envelope, nozzle-anchored (u=0),
 * asymmetric breakup toward tail. Not a soft ellipse.
 */
export function sampleSheathNoise(u, v, opts = {}) {
  const seed = opts.seed ?? 27;
  const side = (v - 0.5) * 2;
  // Wider cross-section than core, still anisotropic — soft, not rectangular field
  const cross = Math.exp(-side * side * 2.1);
  // Dense at nozzle, ragged dissolve downstream
  const along = Math.pow(Math.max(0, 1 - u * 0.62), 0.85);
  const warp = valueNoise2D(u * 4.2, side * 2.8 + 0.2, seed) - 0.5;
  const filament = valueNoise2D(u * 7.5 - warp * 0.6, side * 4.1, seed + 5);
  const fork = valueNoise2D(u * 11.0 + side * 0.4, side * 1.2, seed + 11);
  // Asymmetric tongue break on one side near tip
  const asym = 1 - Math.max(0, (u - 0.45) * side * 0.55) * fork;
  const body = cross * along * (0.32 + filament * 0.78) * Math.max(0.15, asym);
  // Soft borders all around — no hard card rectangle
  const edgeY = Math.pow(1 - Math.min(1, Math.abs(side)), 1.35);
  const edgeX = Math.min(1, u / 0.06) * Math.min(1, (1 - u) / 0.14);
  return Math.max(0, Math.min(1, body * edgeY * edgeX));
}

/**
 * Vapor / ion dissipation — elongated directional wake, not a round puff.
 * Nozzle-weak / mid-strong / tail-ragged.
 */
export function sampleVaporWake(u, v, opts = {}) {
  const seed = opts.seed ?? 11;
  const side = (v - 0.5) * 2;
  const cross = Math.exp(-side * side * 1.35);
  // Peak slightly downstream of nozzle, then dissipates
  const envelope = Math.sin(Math.min(1, u * 1.15) * Math.PI) * Math.pow(1 - u * 0.35, 1.1);
  const wisps = valueNoise2D(u * 6.5, side * 3.2, seed);
  const breakUp = valueNoise2D(u * 13.0 + 2.1, side * 5.0, seed + 4);
  const lateralDrift = 1 - Math.abs(side - (wisps - 0.5) * 0.35) * 0.25;
  const body = cross * Math.max(0, envelope) * (0.28 + wisps * 0.55) * (0.55 + breakUp * 0.45) * lateralDrift;
  const edgeY = 1 - Math.min(1, Math.max(0, (Math.abs(side) - 0.88) / 0.12));
  const edgeX = Math.min(1, u / 0.05) * Math.min(1, (1 - u) / 0.12);
  return Math.max(0, Math.min(1, body * edgeY * edgeX));
}

/**
 * Distortion interface — returns { r, g, a } with signed offsets centered at 0.5.
 * Neutral (0.5, 0.5) outside the interface; alpha = strength.
 */
export function sampleDistortionSigned(u, v, opts = {}) {
  const seed = opts.seed ?? 63;
  const side = (v - 0.5) * 2;
  const ring = Math.exp(-Math.pow(Math.abs(side) - 0.28, 2) * 22.0);
  const along = Math.pow(Math.max(0, 1 - u * 0.75), 0.7) * (0.35 + Math.min(1, u * 2.5) * 0.65);
  const edgeY = 1 - Math.min(1, Math.max(0, (Math.abs(side) - 0.78) / 0.22));
  const edgeX = Math.min(1, u / 0.05) * Math.min(1, (1 - u) / 0.12);
  const mask = Math.max(0, Math.min(1, ring * along * edgeY * edgeX));

  // Signed flow vectors along nozzle→tail (X) and lateral (Y), zero when mask≈0
  const nx = valueNoise2D(u * 10.0, side * 3.0, seed) - 0.5;
  const ny = valueNoise2D(u * 7.0 + 1.7, side * 5.5, seed + 9) - 0.5;
  const ox = nx * mask;
  const oy = ny * mask * 0.75;
  return {
    r: Math.max(0, Math.min(1, 0.5 + ox)),
    g: Math.max(0, Math.min(1, 0.5 + oy)),
    b: 0.5,
    a: mask,
  };
}

/** Scalar distortion magnitude (for metrics). */
export function sampleDistortion(u, v, opts = {}) {
  return sampleDistortionSigned(u, v, opts).a;
}

/**
 * RCS sheath — wider streak envelope around the jet, still nozzle-attached and
 * directional (not a rounded triangle/ellipse blob). One-sided tip breakup.
 */
export function sampleRcsSheath(u, v, opts = {}) {
  const seed = opts.seed ?? 53;
  const side = (v - 0.5) * 2;
  // Streak envelope slightly wider than core, still highly anisotropic
  const cross = Math.exp(-side * side * 6.2);
  const along = Math.max(0, 1 - u * 1.85);
  const alongPow = Math.pow(along, 1.45);
  const streak = valueNoise2D(u * 12.0, side * 1.6, seed);
  // One-sided ragged tip (+side)
  const tipBreak = 1 - smooth01(u, 0.4, 0.95) * (0.35 + streak * 0.55) * Math.max(0, side);
  const body = cross * alongPow * (0.32 + streak * 0.58) * Math.max(0.12, tipBreak);
  const edgeY = Math.pow(Math.max(0, 1 - Math.abs(side)), 2.2);
  const edgeX = Math.min(1, u / 0.05) * Math.min(1, (1 - u) / 0.14);
  return Math.max(0, Math.min(1, body * edgeY * edgeX));
}

/** RCS vapor — short trailing streak residue, continuous with nozzle at onset. */
export function sampleRcsVapor(u, v, opts = {}) {
  const seed = opts.seed ?? 59;
  const side = (v - 0.5) * 2;
  const cross = Math.exp(-side * side * 5.0);
  // Peak shortly after nozzle then dies — not a centered ellipse
  const envelope = Math.max(0, 1 - u * 2.2) * smooth01(u, 0.0, 0.1);
  const streak = valueNoise2D(u * 11.0, side * 1.4, seed);
  const oneSide = 1 - Math.max(0, side) * smooth01(u, 0.35, 0.9) * 0.7;
  const body = cross * envelope * (0.22 + streak * 0.42) * oneSide;
  const edgeY = Math.pow(Math.max(0, 1 - Math.abs(side)), 2.4);
  const edgeX = Math.min(1, u / 0.06) * Math.min(1, (1 - u) / 0.16);
  return Math.max(0, Math.min(1, body * edgeY * edgeX));
}

function smooth01(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Flipbook cell sample — each cell is a slightly phase-shifted flow stream.
 * Atlas layout: cols x rows, cell index row-major from top-left for PNG preview.
 */
export function sampleFlipbookCell(localU, localV, frameIndex, opts = {}) {
  const phase = frameIndex * 0.17;
  return sampleFlowStream(localU, localV, {
    seed: (opts.seed ?? 33) + frameIndex * 13,
    crossSharp: 4.8 + Math.sin(phase) * 0.4,
  });
}

/**
 * Build RGBA uint8 buffer (row-major top-down for PNG).
 * sampleFn may return number (luma→rgba) or {r,g,b,a}.
 * @returns {Uint8Array} length width*height*4
 */
export function buildRgbaTexture(width, height, sampleFn) {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = height <= 1 ? 0.5 : y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = width <= 1 ? 0.5 : x / (width - 1);
      const s = sampleFn(u, v, x, y);
      const i = (y * width + x) * 4;
      if (typeof s === 'object' && s != null) {
        out[i] = Math.round(Math.max(0, Math.min(1, s.r ?? 0)) * 255);
        out[i + 1] = Math.round(Math.max(0, Math.min(1, s.g ?? 0)) * 255);
        out[i + 2] = Math.round(Math.max(0, Math.min(1, s.b ?? 0.5)) * 255);
        out[i + 3] = Math.round(Math.max(0, Math.min(1, s.a ?? 0)) * 255);
      } else {
        const g = Math.round(Math.max(0, Math.min(1, s)) * 255);
        out[i] = g;
        out[i + 1] = g;
        out[i + 2] = g;
        out[i + 3] = g;
      }
    }
  }
  return out;
}

export function buildFlipbookRgba(width, height, cols, rows, opts = {}) {
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  const out = new Uint8Array(width * height * 4);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const frame = row * cols + col;
      for (let cy = 0; cy < cellH; cy++) {
        for (let cx = 0; cx < cellW; cx++) {
          const u = cellW <= 1 ? 0.5 : cx / (cellW - 1);
          const v = cellH <= 1 ? 0.5 : cy / (cellH - 1);
          const s = sampleFlipbookCell(u, v, frame, opts);
          const x = col * cellW + cx;
          const y = row * cellH + cy;
          const i = (y * width + x) * 4;
          const g = Math.round(Math.max(0, Math.min(1, s)) * 255);
          out[i] = g;
          out[i + 1] = g;
          out[i + 2] = g;
          out[i + 3] = g;
        }
      }
    }
  }
  return out;
}

/** Texture generation catalog — deterministic IDs used by recipes. */
export const TEXTURE_CATALOG = Object.freeze([
  {
    id: 'plume_core_flow_v1',
    width: 256,
    height: 128,
    kind: 'flow',
    seed: 19,
    sample: (u, v) => sampleFlowStream(u, v, { seed: 19, crossSharp: 6.2 }),
  },
  {
    id: 'plume_inner_flipbook_v1',
    width: 256,
    height: 256,
    kind: 'flipbook',
    cols: 4,
    rows: 4,
    seed: 33,
  },
  {
    id: 'plume_sheath_noise_v1',
    width: 256,
    height: 128,
    kind: 'directional_sheath',
    seed: 27,
    sample: (u, v) => sampleSheathNoise(u, v, { seed: 27 }),
  },
  {
    id: 'plume_vapor_soft_v1',
    width: 256,
    height: 128,
    kind: 'directional_vapor',
    seed: 11,
    sample: (u, v) => sampleVaporWake(u, v, { seed: 11 }),
  },
  {
    id: 'plume_distortion_interface_v1',
    width: 128,
    height: 128,
    kind: 'distortion_interface',
    seed: 63,
    sample: (u, v) => sampleDistortionSigned(u, v, { seed: 63 }),
  },
  {
    id: 'rcs_core_jet_v1',
    width: 128,
    height: 64,
    kind: 'flow',
    seed: 41,
    sample: (u, v) => sampleRcsJet(u, v, { seed: 41 }),
  },
  {
    id: 'rcs_inner_streak_v1',
    width: 128,
    height: 64,
    kind: 'flow',
    seed: 47,
    sample: (u, v) => sampleRcsJet(u, v, { seed: 47 }),
  },
  {
    id: 'rcs_sheath_puff_v1',
    width: 128,
    height: 64,
    kind: 'directional_sheath',
    seed: 53,
    sample: (u, v) => sampleRcsSheath(u, v, { seed: 53 }),
  },
  {
    id: 'rcs_vapor_dissipate_v1',
    width: 128,
    height: 64,
    kind: 'directional_vapor',
    seed: 59,
    sample: (u, v) => sampleRcsVapor(u, v, { seed: 59 }),
  },
]);

/** Tiny 3x5 uppercase glyph map for embedded proof labels (deterministic). */
const GLYPH3x5 = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'],
  _: ['000', '000', '000', '000', '111'],
  '-': ['000', '000', '111', '000', '000'],
  '.': ['000', '000', '000', '000', '010'],
  '/': ['001', '001', '010', '100', '100'],
  ' ': ['000', '000', '000', '000', '000'],
};

function drawLabel(dst, dw, dh, x0, y0, text, scale = 2) {
  const s = String(text).toUpperCase();
  let x = x0;
  for (let ci = 0; ci < s.length; ci++) {
    const g = GLYPH3x5[s[ci]] || GLYPH3x5['.'];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (g[row][col] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = x + col * scale + dx;
            const py = y0 + row * scale + dy;
            if (px < 0 || py < 0 || px >= dw || py >= dh) continue;
            const di = (py * dw + px) * 4;
            dst[di] = 255;
            dst[di + 1] = 230;
            dst[di + 2] = 80;
            dst[di + 3] = 255;
          }
        }
      }
    }
    x += 4 * scale;
  }
}

function edgeCrop4x(src, w, h, edge) {
  // edge: left|right|top|bottom
  const band = Math.max(6, Math.floor((edge === 'left' || edge === 'right' ? w : h) * 0.1));
  let cw;
  let ch;
  let read = (x, y) => (y * w + x) * 4;
  if (edge === 'left') {
    cw = band;
    ch = h;
  } else if (edge === 'right') {
    cw = band;
    ch = h;
  } else if (edge === 'top') {
    cw = w;
    ch = band;
  } else {
    cw = w;
    ch = band;
  }
  const outW = cw * 4;
  const outH = ch * 4;
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let sx;
      let sy;
      if (edge === 'left') {
        sx = x;
        sy = y;
      } else if (edge === 'right') {
        sx = w - band + x;
        sy = y;
      } else if (edge === 'top') {
        sx = x;
        sy = y;
      } else {
        sx = x;
        sy = h - band + y;
      }
      const si = read(sx, sy);
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const di = ((y * 4 + dy) * outW + (x * 4 + dx)) * 4;
          out[di] = src[si];
          out[di + 1] = src[si + 1];
          out[di + 2] = src[si + 2];
          out[di + 3] = 255;
        }
      }
    }
  }
  // Stamp edge name into crop
  drawLabel(out, outW, outH, 2, 2, edge.toUpperCase(), 2);
  return { rgba: out, width: outW, height: outH, edge };
}

/**
 * Build full native-resolution proof pack for one texture entry.
 * Modes: rgb, alpha, premult_black, premult_midgray, four edge crops
 */
export function buildTextureProofs(entry) {
  let src;
  if (entry.kind === 'flipbook') {
    src = buildFlipbookRgba(entry.width, entry.height, entry.cols, entry.rows, { seed: entry.seed });
  } else {
    src = buildRgbaTexture(entry.width, entry.height, (u, v) => entry.sample(u, v));
  }
  const w = entry.width;
  const h = entry.height;
  const labelH = 18;
  const role = entry.id.includes('rcs') ? 'RCS' : entry.id.includes('distortion') ? 'DIST' : 'MAIN';
  const modeTag = entry.kind.replace(/_/g, '-').slice(0, 14);

  function labeledPanel(base, modeName) {
    const outH = h + labelH;
    const out = new Uint8Array(w * outH * 4);
    for (let i = 0; i < out.length; i += 4) {
      out[i] = 20;
      out[i + 1] = 22;
      out[i + 2] = 28;
      out[i + 3] = 255;
    }
    // copy base into lower region
    for (let y = 0; y < h; y++) {
      out.set(base.subarray(y * w * 4, (y + 1) * w * 4), ((y + labelH) * w) * 4);
    }
    fillRect(out, w, outH, 0, 0, w, labelH, 32, 36, 48);
    // Scale-2 labels for legibility
    drawLabel(out, w, outH, 2, 3, `${role}/${modeName}`, 2);
    drawLabel(out, w, outH, Math.max(2, w - modeTag.length * 8 - 4), 3, modeTag, 2);
    return out;
  }

  const rgb = new Uint8Array(w * h * 4);
  const alpha = new Uint8Array(w * h * 4);
  const premultBlack = new Uint8Array(w * h * 4);
  const premultMid = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = src[o];
    const g = src[o + 1];
    const b = src[o + 2];
    const a = src[o + 3] / 255;
    rgb[o] = r;
    rgb[o + 1] = g;
    rgb[o + 2] = b;
    rgb[o + 3] = 255;
    const av = src[o + 3];
    alpha[o] = av;
    alpha[o + 1] = av;
    alpha[o + 2] = av;
    alpha[o + 3] = 255;
    premultBlack[o] = Math.round(r * a);
    premultBlack[o + 1] = Math.round(g * a);
    premultBlack[o + 2] = Math.round(b * a);
    premultBlack[o + 3] = 255;
    premultMid[o] = Math.round(128 * (1 - a) + r * a);
    premultMid[o + 1] = Math.round(128 * (1 - a) + g * a);
    premultMid[o + 2] = Math.round(128 * (1 - a) + b * a);
    premultMid[o + 3] = 255;
  }

  const rgbL = labeledPanel(rgb, 'RGB');
  const alphaL = labeledPanel(alpha, 'ALPHA');
  const premulBlackL = labeledPanel(premultBlack, 'PREMUL-BLK');
  const premulMidL = labeledPanel(premultMid, 'PREMUL-MID');

  const edges = {
    left: edgeCrop4x(src, w, h, 'left'),
    right: edgeCrop4x(src, w, h, 'right'),
    top: edgeCrop4x(src, w, h, 'top'),
    bottom: edgeCrop4x(src, w, h, 'bottom'),
  };
  // Combined 4-edge montage for contact sheet
  const edgeMontageH = Math.max(edges.left.height, edges.right.height, edges.top.height, edges.bottom.height);
  const edgeMontageW = edges.left.width + edges.right.width + edges.top.width + edges.bottom.width + 12;
  const edgeMontage = new Uint8Array(edgeMontageW * (edgeMontageH + labelH) * 4);
  for (let i = 0; i < edgeMontage.length; i += 4) {
    edgeMontage[i] = 16;
    edgeMontage[i + 1] = 18;
    edgeMontage[i + 2] = 22;
    edgeMontage[i + 3] = 255;
  }
  fillRect(edgeMontage, edgeMontageW, edgeMontageH + labelH, 0, 0, edgeMontageW, labelH, 28, 32, 40);
  drawLabel(edgeMontage, edgeMontageW, edgeMontageH + labelH, 2, 2, `${role} EDGES L-R-T-B`, 2);
  let ex = 2;
  for (const key of ['left', 'right', 'top', 'bottom']) {
    const e = edges[key];
    blitScaled(e.rgba, e.width, e.height, edgeMontage, edgeMontageW, edgeMontageH + labelH, ex, labelH, e.width, e.height, 'raw');
    ex += e.width + 2;
  }

  let distortChannels = null;
  if (entry.kind === 'distortion_interface') {
    distortChannels = {
      x: labeledPanel(rgb, 'DIST-X'), // will overwrite
      y: null,
      mag: null,
      a: alphaL,
    };
    const xRaw = new Uint8Array(w * h * 4);
    const yRaw = new Uint8Array(w * h * 4);
    const magRaw = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const ox = Math.abs(src[o] - 128) * 2;
      const oy = Math.abs(src[o + 1] - 128) * 2;
      const mag = Math.min(255, Math.hypot(ox, oy));
      xRaw[o] = src[o];
      xRaw[o + 1] = 128;
      xRaw[o + 2] = 128;
      xRaw[o + 3] = 255;
      yRaw[o] = 128;
      yRaw[o + 1] = src[o + 1];
      yRaw[o + 2] = 128;
      yRaw[o + 3] = 255;
      magRaw[o] = mag;
      magRaw[o + 1] = mag;
      magRaw[o + 2] = mag;
      magRaw[o + 3] = 255;
    }
    distortChannels.x = labeledPanel(xRaw, 'DIST-X');
    distortChannels.y = labeledPanel(yRaw, 'DIST-Y');
    distortChannels.mag = labeledPanel(magRaw, 'DIST-MAG');
  }

  return {
    id: entry.id,
    role,
    kind: entry.kind,
    width: w,
    height: h + labelH,
    contentHeight: h,
    src,
    rgb: rgbL,
    alpha: alphaL,
    premultBlack: premulBlackL,
    premultMid: premulMidL,
    border4x: edgeMontage,
    border4xW: edgeMontageW,
    border4xH: edgeMontageH + labelH,
    edges,
    borderMean: sampleBorderMean(src, w, h),
    centerMean: sampleCenterMean(src, w, h),
    distortChannels,
  };
}

/**
 * RCS form proof: combined anisotropic field at game-scale projected sizes
 * on black and mid-gray, with measured aspect / nozzle connectivity.
 * Replaces the old 320x112 three-puff temporal triptych.
 */
export function buildRcsFormProof(width = 720, height = 400) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 14;
    rgba[i + 1] = 16;
    rgba[i + 2] = 20;
    rgba[i + 3] = 255;
  }
  drawLabel(rgba, width, height, 8, 8, 'RCS FORM PROOF ANISOTROPIC STREAK', 3);
  drawLabel(rgba, width, height, 8, 28, 'NOZZLE CORE / BODY / ONE-SIDED BREAK / SHORT TAIL', 2);

  const panels = [
    { name: 'BLACK BG', bg: 0, x0: 20, y0: 60 },
    { name: 'MIDGRAY BG', bg: 128, x0: 370, y0: 60 },
  ];
  const pw = 320;
  const ph = 160;
  const metrics = [];

  for (const panel of panels) {
    // background
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const di = ((panel.y0 + y) * width + (panel.x0 + x)) * 4;
        rgba[di] = panel.bg;
        rgba[di + 1] = panel.bg;
        rgba[di + 2] = panel.bg;
        rgba[di + 3] = 255;
      }
    }
    drawLabel(rgba, width, height, panel.x0 + 4, panel.y0 - 14, panel.name, 2);

    // Projected game-scale streak: ~48x12 px hot core region inside panel
    const nozX = panel.x0 + 24;
    const nozY = panel.y0 + ph * 0.5;
    const len = 96;
    const halfW = 10;
    let nozzleEnergy = 0;
    let tailEnergy = 0;
    let midEnergy = 0;
    let widthSum = 0;
    let widthN = 0;
    let emitted = 0;
    for (let t = 0; t < len; t++) {
      const u = t / Math.max(1, len - 1);
      let rowMin = halfW;
      let rowMax = -halfW;
      for (let s = -halfW; s <= halfW; s++) {
        const v = 0.5 + s / (2 * halfW);
        const e = sampleRcsJet(u, v, { seed: 41 }) * 0.85
          + sampleRcsSheath(u, v, { seed: 53 }) * 0.35
          + sampleRcsVapor(u, v, { seed: 59 }) * 0.2;
        if (e < 0.03) continue;
        const x = nozX + t;
        const y = nozY + s;
        const a = Math.min(1, e);
        const di = (y * width + x) * 4;
        if (di < 0 || di + 3 >= rgba.length) continue;
        rgba[di] = Math.min(255, Math.round(rgba[di] * (1 - a) + (120 + e * 120) * a));
        rgba[di + 1] = Math.min(255, Math.round(rgba[di + 1] * (1 - a) + (190 + e * 40) * a));
        rgba[di + 2] = Math.min(255, Math.round(rgba[di + 2] * (1 - a) + 255 * a));
        emitted += 1;
        if (u < 0.1) nozzleEnergy += e;
        if (u > 0.35 && u < 0.55) midEnergy += e;
        if (u > 0.75) tailEnergy += e;
        rowMin = Math.min(rowMin, s);
        rowMax = Math.max(rowMax, s);
      }
      if (rowMax >= rowMin) {
        widthSum += rowMax - rowMin + 1;
        widthN += 1;
      }
    }
    // nozzle marker
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const di = ((nozY + dy) * width + (nozX + dx)) * 4;
        rgba[di] = 255;
        rgba[di + 1] = 160;
        rgba[di + 2] = 40;
        rgba[di + 3] = 255;
      }
    }
    const meanW = widthN ? widthSum / widthN : 1;
    const aspect = len / Math.max(1, meanW);
    metrics.push({
      panel: panel.name,
      projectedLengthPx: len,
      meanWidthPx: meanW,
      aspect,
      nozzleEnergy,
      midEnergy,
      tailEnergy,
      tailFalloff: midEnergy > 0 ? tailEnergy / midEnergy : 0,
      emittedPixels: emitted,
      nozzleConnected: nozzleEnergy > 0.5,
    });
    drawLabel(rgba, width, height, panel.x0 + 4, panel.y0 + ph + 6, `ASPECT ${aspect.toFixed(1)} NOZ-CONN`, 2);
  }

  // Legend
  drawLabel(rgba, width, height, 20, height - 48, 'LEGEND: ORANGE = NOZZLE ROOT', 2);
  drawLabel(rgba, width, height, 20, height - 28, 'FORM: SHARP CORE + NARROW BODY + +SIDE BREAK + SHORT TAIL', 2);

  return {
    width,
    height,
    rgba,
    metrics,
    forbidBallFlash: metrics.every((m) => m.aspect >= 4.0 && m.nozzleConnected),
  };
}

/**
 * Labeled multi-column contact sheet with role/mode text and 4-edge montage.
 * Larger cells + scale-2 labels for legibility (GFX01-RCSFORM-029).
 */
export function buildContactSheet(maxTileW = 280, pad = 10, labelH = 22) {
  const n = TEXTURE_CATALOG.length;
  const modes = 5;
  let maxH = 0;
  let maxW = 0;
  const proofs = [];
  for (let i = 0; i < n; i++) {
    const p = buildTextureProofs(TEXTURE_CATALOG[i]);
    proofs.push(p);
    maxH = Math.max(maxH, p.height, p.border4xH);
    maxW = Math.max(maxW, Math.min(maxTileW, p.width), Math.min(maxTileW, p.border4xW));
  }
  // Enlarge tiles for readable legend
  const tileW = Math.max(maxW, 200);
  const tileH = Math.max(maxH, 120);
  const width = pad + n * (tileW + pad);
  const height = pad + 36 + modes * (tileH + labelH + pad);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 18;
    rgba[i + 1] = 20;
    rgba[i + 2] = 24;
    rgba[i + 3] = 255;
  }
  drawLabel(rgba, width, height, pad, 8, 'THRUSTER TEXTURE CONTACT SHEET - ROLE AND MODE LEGEND', 3);
  const modeNames = ['rgb', 'alpha', 'premul_black', 'premul_mid', 'edges_LRTB'];
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const p = proofs[i];
    const x0 = pad + i * (tileW + pad);
    const panels = [p.rgb, p.alpha, p.premultBlack, p.premultMid, p.border4x];
    const panelW = [p.width, p.width, p.width, p.width, p.border4xW];
    const panelH = [p.height, p.height, p.height, p.height, p.border4xH];
    // Column header with full texture id
    drawLabel(rgba, width, height, x0 + 2, 28, p.id.slice(0, 18), 2);
    for (let m = 0; m < modes; m++) {
      const y0 = 36 + pad + m * (tileH + labelH + pad) + labelH;
      fillRect(rgba, width, height, x0, y0 - labelH, tileW, labelH, 40 + m * 18, 44, 52);
      // Scale-2 plain readable labels
      drawLabel(rgba, width, height, x0 + 4, y0 - labelH + 4, `${p.role} ${modeNames[m]}`, 2);
      blitScaled(
        panels[m],
        panelW[m],
        panelH[m],
        rgba,
        width,
        height,
        x0,
        y0,
        tileW,
        tileH,
        'raw',
      );
    }
    tiles.push({
      id: p.id,
      role: p.role,
      kind: TEXTURE_CATALOG[i].kind,
      borderMean: p.borderMean,
      centerMean: p.centerMean,
      modes: modeNames,
      edges: ['left', 'right', 'top', 'bottom'],
      directional: true,
    });
  }
  return { width, height, rgba, tiles, proofs };
}

function fillRect(dst, dw, dh, x0, y0, w, h, r, g, b) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = ((y0 + y) * dw + (x0 + x)) * 4;
      if (di < 0 || di + 3 >= dst.length) continue;
      dst[di] = r;
      dst[di + 1] = g;
      dst[di + 2] = b;
      dst[di + 3] = 255;
    }
  }
}

function blitScaled(src, sw, sh, dst, dw, dh, x0, y0, tw, th, mode) {
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const u = tw <= 1 ? 0.5 : tx / (tw - 1);
      const v = th <= 1 ? 0.5 : ty / (th - 1);
      const sx = Math.min(sw - 1, Math.floor(u * (sw - 1)));
      const sy = Math.min(sh - 1, Math.floor(v * (sh - 1)));
      const si = (sy * sw + sx) * 4;
      const di = ((y0 + ty) * dw + (x0 + tx)) * 4;
      if (di + 3 >= dst.length || si + 3 >= src.length) continue;
      if (mode === 'alpha') {
        const a = src[si + 3];
        dst[di] = a;
        dst[di + 1] = a;
        dst[di + 2] = a;
        dst[di + 3] = 255;
      } else if (mode === 'luma') {
        const a = src[si + 3] / 255;
        const g = Math.round(src[si] * a);
        dst[di] = g;
        dst[di + 1] = g;
        dst[di + 2] = g;
        dst[di + 3] = 255;
      } else {
        dst[di] = src[si];
        dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2];
        dst[di + 3] = 255;
      }
    }
  }
}

function sampleBorderMean(src, w, h) {
  let sum = 0;
  let n = 0;
  for (let x = 0; x < w; x++) {
    sum += src[x * 4 + 3];
    sum += src[((h - 1) * w + x) * 4 + 3];
    n += 2;
  }
  for (let y = 0; y < h; y++) {
    sum += src[(y * w) * 4 + 3];
    sum += src[(y * w + w - 1) * 4 + 3];
    n += 2;
  }
  return sum / (n * 255);
}

function sampleCenterMean(src, w, h) {
  const x0 = Math.floor(w * 0.35);
  const x1 = Math.floor(w * 0.65);
  const y0 = Math.floor(h * 0.35);
  const y1 = Math.floor(h * 0.65);
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sum += src[(y * w + x) * 4 + 3];
      n += 1;
    }
  }
  return n ? sum / (n * 255) : 0;
}
