// Salvage work-lamp (inf-salvage-lamp) — the pure decision layer.
//
// The player story: a furball leaves a string of hulks, and the ones still paying wear a slow
// amber work-lamp — the salvage crews' "worth a stop" convention. When the pool is stripped
// bare, the lamp goes dark and the hulk joins the scenery. Today nothing in the picture reads
// `data.salvagePool`: a fresh kill worth thousands and a worked-out husk are identical wrecks,
// so the player beams each one to find out.
//
// Truth read: `entity.data.salvagePool` (commodityId -> qty) — the same live truth
// aftermathWrecks and the mining beam consume; no sim state is created or written. Presentation
// is deterministic off simTime and a per-wreck id hash; reduced motion stretches the breath and
// never darkens the lamp below its floor (the beacon-lamp floor law: a dark beacon reads as a
// dead one). Same buffer contract as dockApproachBeacons.js: typed arrays grown by the caller,
// fixed Uint16 indices, draw count moves; the adapter binds one additive mesh.
//
// Lamp language: ONE flat amber diamond lying over the hulk (the dock-sodium family tint),
// breathing at a work-light rhythm, plus a smaller hot core so the lamp survives bloom.

/** Readability cull: past this range the lamp is a sub-pixel glint; skip the wreck. */
export const SALVAGE_LAMP_MAX_RANGE_WU = 1200;
/** One mesh, one draw call; six paying wrecks fit a furball's aftermath with margin. */
export const SALVAGE_LAMP_CAP = 6;
/** Quads per wreck: the outer diamond + the hot inner core. */
export const SALVAGE_LAMP_QUADS_PER_WRECK = 2;

export const SALVAGE_LAMP_PERIOD_S = 2.4;
export const SALVAGE_LAMP_REDUCED_PERIOD_MUL = 3;
/** The floor keeps a paying wreck's lamp alive at the trough — dark means worked out. */
export const SALVAGE_LAMP_FLOOR = 0.26;
export const SALVAGE_LAMP_BREATH = 0.5;
/** Dock-lamp sodium: the same family that lights quays and apron pylons. */
export const SALVAGE_LAMP_COLOR_HEX = 0xffb66b;
export const SALVAGE_LAMP_Y = 0.45;
/** Diamond halfwidth as a fraction of the wreck radius: a halo, not a spotlight cone. */
export const SALVAGE_LAMP_RADIUS_FRAC = 0.95;
export const SALVAGE_LAMP_CORE_FRAC = 0.45;

/**
 * Does this wreck still pay? Same live predicate aftermathWrecks uses — any pool entry > 0.
 * Non-arrays/missing pools (set dressing, env husks) read false and stay dark.
 */
export function salvageLampLive(pool) {
  if (!pool || typeof pool !== 'object') return false;
  const values = Object.values(pool);
  for (let i = 0; i < values.length; i++) {
    if (Number(values[i]) > 0) return true;
  }
  return false;
}

/** Deterministic per-wreck phase in [0,1) — the beacon-lamp hash habit. */
export function salvageLampPhase(id) {
  let hash = 2166136261;
  const text = String(id);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) / 4294967296 + 0.38196601125) % 1;
}

/**
 * The lamp's brightness this instant in [floor, floor + breath]: a slow work-light breath,
 * phased per wreck so two hulks never pulse in lockstep. Reduced motion stretches the period;
 * it never drops the floor.
 */
export function salvageLampGlow01(id, simTime, reduced = false) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  const period = SALVAGE_LAMP_PERIOD_S * (reduced ? SALVAGE_LAMP_REDUCED_PERIOD_MUL : 1);
  const c = (((t / period + salvageLampPhase(id)) % 1) + 1) % 1;
  const breathe = 0.5 + 0.5 * Math.sin(c * Math.PI * 2);
  return SALVAGE_LAMP_FLOOR + SALVAGE_LAMP_BREATH * breathe;
}

/** Halfwidth of a wreck's lamp diamond in world units. NaN-safe. */
export function salvageLampHalfWidthWu(radius) {
  const r = Number(radius);
  return Math.max(2.5, (Number.isFinite(r) && r > 0 ? r : 7) * SALVAGE_LAMP_RADIUS_FRAC);
}

/** Scratch buffers for the shared lamp mesh — same contract as dockApproachBeacons. */
export function createSalvageLampGeometry() {
  const quadCapacity = SALVAGE_LAMP_CAP * SALVAGE_LAMP_QUADS_PER_WRECK;
  const positions = new Float32Array(quadCapacity * 12);
  const colors = new Float32Array(quadCapacity * 12);
  const indices = new Uint16Array(quadCapacity * 6);
  for (let q = 0; q < quadCapacity; q++) {
    const o = q * 4;
    indices[q * 6] = o;
    indices[q * 6 + 1] = o + 1;
    indices[q * 6 + 2] = o + 2;
    indices[q * 6 + 3] = o;
    indices[q * 6 + 4] = o + 2;
    indices[q * 6 + 5] = o + 3;
  }
  return { positions, colors, indices, indexCount: 0, quadCapacity };
}

/**
 * Write one wreck's lamp (outer diamond + hot core, flat on the play plane) into the shared
 * pool. `baseQuads` is the quad count already written this frame — emission appends and
 * `out.indexCount` reports the POOL total, so the adapter can dress several wrecks into one
 * draw call. No geometry moves between frames; only the color brightness breathes.
 */
export function writeSalvageLampQuads(out, x, z, halfW, glow01, baseQuads = 0) {
  if (!out || !out.positions || !out.colors) return out;
  const base = Math.max(0, Math.trunc(Number(baseQuads) || 0));
  if (base === 0) out.indexCount = 0;
  if (!out.quadCapacity || !(halfW > 0)) return out;
  const glow = Math.min(1, Math.max(0, Number(glow01) || 0));
  if (!(glow > 0.01)) return out;
  const cr = ((SALVAGE_LAMP_COLOR_HEX >> 16) & 255) / 255;
  const cg = ((SALVAGE_LAMP_COLOR_HEX >> 8) & 255) / 255;
  const cb = (SALVAGE_LAMP_COLOR_HEX & 255) / 255;
  const y = SALVAGE_LAMP_Y;
  let emitted = base;

  const emitDiamond = (hw, bright) => {
    if (emitted >= out.quadCapacity) return;
    const o = emitted * 12;
    const p = out.positions, c = out.colors;
    p[o] = x - hw; p[o + 1] = y; p[o + 2] = z;
    p[o + 3] = x; p[o + 4] = y; p[o + 5] = z - hw;
    p[o + 6] = x + hw; p[o + 7] = y; p[o + 8] = z;
    p[o + 9] = x; p[o + 10] = y; p[o + 11] = z + hw;
    for (let v = 0; v < 4; v++) {
      c[o + v * 3] = cr * bright;
      c[o + v * 3 + 1] = cg * bright;
      c[o + v * 3 + 2] = cb * bright;
    }
    emitted += 1;
  };

  emitDiamond(halfW, glow);
  emitDiamond(halfW * SALVAGE_LAMP_CORE_FRAC, Math.min(1.25, glow * 1.35));
  out.indexCount = emitted * 6;
  return out;
}
