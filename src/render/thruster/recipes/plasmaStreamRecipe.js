/**
 * Unified plasma thruster recipe: one medium for root jet + history wake.
 * Envelopes are functions of path age s in [0,1] (0 = nozzle, 1 = oldest wake).
 */

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

/** Smoothstep helper for envelope evaluation (pure). */
export function smoothstep(edge0, edge1, x) {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Evaluate root→wake envelopes at path age s (0 nozzle … 1 oldest).
 * Mutates `out` when provided; otherwise returns a new object (tests only).
 */
export function samplePlasmaEnvelope(s, drive = 1, boost = 0, out = null) {
  const u = Math.max(0, Math.min(1, Number.isFinite(s) ? s : 1));
  const d = Math.max(0, Math.min(1.35, Number.isFinite(drive) ? drive : 0));
  const b = Math.max(0, Math.min(1, Number.isFinite(boost) ? boost : 0));
  // Wide hot root near nozzle; thinner cooler wake with distance.
  const rootWindow = 1 - smoothstep(0.0, 0.22, u);
  const jetWindow = (1 - smoothstep(0.0, 0.55, u)) * smoothstep(0.0, 0.08, u);
  const wakeWindow = smoothstep(0.12, 0.35, u) * (1 - smoothstep(0.72, 1.0, u));
  const width = (0.55 + rootWindow * 1.85 + jetWindow * 0.55 + b * 0.45)
    * (0.55 + d * 0.55)
    * (1 - u * 0.72);
  const density = (rootWindow * 1.4 + jetWindow * 0.95 + wakeWindow * 0.42 + d * 0.35)
    * (1 - u * 0.55)
    * (0.65 + b * 0.4);
  const heat = rootWindow * 1.0 + jetWindow * 0.55 + wakeWindow * 0.18 + b * 0.25;
  const filament = (rootWindow * 0.35 + jetWindow * 0.85 + wakeWindow * 0.55)
    * (0.5 + d * 0.5)
    * (1 - u * 0.4);
  const target = out || {};
  target.s = u;
  target.width = Math.max(0.05, width);
  target.density = Math.max(0, density);
  target.heat = Math.max(0, Math.min(1.4, heat));
  target.filament = Math.max(0, filament);
  target.rootWindow = rootWindow;
  target.jetWindow = jetWindow;
  target.wakeWindow = wakeWindow;
  return target;
}

export const PLAYER_PLASMA_STREAM_RECIPE = freezeDeep({
  id: 'player_plasma_stream_v1',
  kind: 'unified_plasma_stream',
  displayName: 'Player unified plasma thruster',
  notes: 'One particle medium for hot wide root and thinner history wake. Solid ribbon is not the hero.',
  path: {
    capacity: 36,
    sampleSpacingWU: 1.65,
    sampleHz: 36,
    discontinuityFloorWU: 160,
    discontinuityMaxWU: 640,
  },
  capacity: {
    high: 520,
    medium: 340,
    low: 180,
  },
  roles: {
    core: {
      life: 0.11,
      size0: 2.8,
      size1: 0.4,
      drag: 1.8,
      stretch: 0.15,
      color0: [1.0, 0.98, 0.94],
      color1: [0.55, 0.85, 1.0],
    },
    body: {
      life: 0.28,
      size0: 4.2,
      size1: 1.1,
      drag: 1.15,
      stretch: 0.55,
      color0: [0.45, 0.82, 1.0],
      color1: [0.15, 0.35, 0.85],
    },
    filament: {
      life: 0.22,
      size0: 2.4,
      size1: 0.35,
      drag: 0.95,
      stretch: 2.4,
      color0: [0.75, 0.95, 1.0],
      color1: [0.25, 0.45, 0.95],
    },
  },
  spawn: {
    // particles per second at density=1 (split across roles)
    rateCore: 55,
    rateBody: 90,
    rateFilament: 48,
    exhaustSpeed: 18,
    lateralJitter: 1.35,
    boostRateMul: 1.55,
    boostSizeMul: 1.22,
  },
  a11y: {
    reducedMotionRateScale: 0.35,
    reducedFlashHeatCap: 0.55,
    lowQualityRateScale: 0.45,
  },
});
