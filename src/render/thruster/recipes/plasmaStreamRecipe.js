/**
 * Unified continuous liquid plasma thruster.
 * One continuous surface medium: wide hot root at the nozzle, thinner long wake along history.
 * Not particles/balls. Not dual cone+ribbon.
 */

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

export function smoothstep(edge0, edge1, x) {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Width / heat / density envelopes along path age s (0 = nozzle, 1 = oldest wake).
 * Mutates `out` when provided.
 */
export function samplePlasmaEnvelope(s, drive = 1, boost = 0, out = null) {
  const u = Math.max(0, Math.min(1, Number.isFinite(s) ? s : 1));
  const d = Math.max(0, Math.min(1.35, Number.isFinite(drive) ? drive : 0));
  const b = Math.max(0, Math.min(1, Number.isFinite(boost) ? boost : 0));
  // Hot wide root, continuous taper into thinner wake (reference plasma anatomy).
  const root = 1 - smoothstep(0.0, 0.18, u);
  const jet = (1 - smoothstep(0.05, 0.55, u));
  const wake = smoothstep(0.2, 0.45, u) * (1 - smoothstep(0.75, 1.0, u));
  // Absolute half-width scale (world units), later multiplied per layer.
  const width = (1.15 + root * 2.4 + jet * 1.1 + b * 0.85)
    * (0.55 + d * 0.65)
    * (1.0 - u * 0.78);
  const heat = Math.min(1.35, root * 1.15 + jet * 0.55 + b * 0.35 + d * 0.15);
  const opacity = (0.55 + root * 0.45 + jet * 0.25 + d * 0.2)
    * (1.0 - smoothstep(0.55, 1.0, u) * 0.85);
  const target = out || {};
  target.s = u;
  target.width = Math.max(0.12, width);
  target.heat = Math.max(0, heat);
  target.opacity = Math.max(0.02, opacity);
  target.root = root;
  target.jet = jet;
  target.wake = wake;
  // Keep density alias for older tests / callers.
  target.density = target.opacity;
  target.filament = jet * 0.7 + wake * 0.5;
  target.rootWindow = root;
  target.jetWindow = jet;
  target.wakeWindow = wake;
  return target;
}

export const PLAYER_PLASMA_STREAM_RECIPE = freezeDeep({
  id: 'player_liquid_plasma_v2',
  kind: 'unified_liquid_plasma',
  displayName: 'Player continuous liquid plasma thruster',
  notes: 'Continuous multi-layer soft plasma path. Wide hot root, thinner long wake, one substance. No point-sprite beads.',
  path: {
    capacity: 48,
    sampleSpacingWU: 1.35,
    sampleHz: 40,
    discontinuityFloorWU: 160,
    discontinuityMaxWU: 640,
  },
  layers: [
    {
      role: 'core',
      widthScale: 0.38,
      opacity: 0.95,
      radiance: 2.6,
      color: [1.0, 0.98, 0.95],
    },
    {
      role: 'body',
      widthScale: 1.0,
      opacity: 0.72,
      radiance: 1.85,
      color: [0.35, 0.82, 1.0],
    },
    {
      role: 'sheath',
      widthScale: 1.85,
      opacity: 0.38,
      radiance: 1.15,
      color: [0.2, 0.45, 0.95],
    },
  ],
  drive: {
    idleFloor: 0.04,
    boostWidthMul: 1.28,
    boostRadianceMul: 1.35,
    boostLengthSegmentsBonus: 8,
  },
});
