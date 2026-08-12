/**
 * Unified continuous liquid plasma thruster.
 * Wide hot root + continuous thinner wake. Not beads, not dual cone+ribbon.
 * Scale matched to lab ship (~8 WU) and bell radius ~1.35.
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
 * Teardrop envelopes: fat root, full mid body, wispy tip.
 */
export function samplePlasmaEnvelope(s, drive = 1, boost = 0, out = null) {
  const u = Math.max(0, Math.min(1, Number.isFinite(s) ? s : 1));
  const d = Math.max(0, Math.min(1.35, Number.isFinite(drive) ? drive : 0));
  const b = Math.max(0, Math.min(1, Number.isFinite(boost) ? boost : 0));
  const root = 1 - smoothstep(0.0, 0.2, u);
  const jet = (1 - smoothstep(0.05, 0.55, u));
  const wake = smoothstep(0.2, 0.45, u) * (1 - smoothstep(0.72, 1.0, u));
  const belly = Math.exp(-((u - 0.14) * (u - 0.14)) / (2 * 0.11 * 0.11));
  const midBulge = Math.exp(-((u - 0.3) * (u - 0.3)) / (2 * 0.18 * 0.18)) * 0.4;
  const taper = Math.pow(Math.max(0.1, 1.0 - u * 0.8), 0.9);
  const width = (0.58 + root * 0.7 + jet * 0.48 + belly * 0.55 + midBulge + b * 0.28)
    * (0.82 + d * 0.35)
    * taper;
  const heat = Math.min(1.35, root * 1.15 + jet * 0.55 + b * 0.3 + d * 0.15 + belly * 0.2);
  // Keep wake readable as a continuous history trail (was fading to almost nothing by s=0.7)
  const opacity = (0.7 + root * 0.35 + jet * 0.3 + d * 0.15)
    * (1.0 - smoothstep(0.55, 1.0, u) * 0.55);
  const target = out || {};
  target.s = u;
  target.width = Math.max(0.14, width);
  target.heat = Math.max(0, heat);
  target.opacity = Math.max(0.04, opacity);
  target.root = root;
  target.jet = jet;
  target.wake = wake;
  target.density = target.opacity;
  target.filament = jet * 0.75 + wake * 0.55;
  target.rootWindow = root;
  target.jetWindow = jet;
  target.wakeWindow = wake;
  return target;
}

export const PLAYER_PLASMA_STREAM_RECIPE = freezeDeep({
  // CONSTRUCTION: soft-camera-facing-strips. v25 layered-filament shader (ridged-FBM web).
  id: 'player_liquid_plasma_v25.1',
  kind: 'unified_liquid_plasma',
  displayName: 'Player continuous liquid plasma thruster',
  notes: 'v25: layered ridged-FBM filament web (coarse core / mid body / fine sheath) over transparent gaps — replaces solid fog wedge. Continuous flow (no scroll-wrap), eased boost envelope drives width+radiance+flow speed.',
  path: {
    capacity: 220,
    sampleSpacingWU: 0.22,
    sampleHz: 120,
    nearJetLengthWU: 12,
    discontinuityFloorWU: 160,
    discontinuityMaxWU: 640,
  },
  layers: [
    {
      role: 'core',
      widthScale: 0.85,
      opacity: 0.92,
      radiance: 2.05,
      color: [0.5, 0.9, 1.0],
      cross: false,
    },
    {
      role: 'body',
      widthScale: 1.95,
      opacity: 0.8,
      radiance: 1.42,
      color: [0.24, 0.76, 1.0],
      // Soft cross REQUIRED — single plane goes edge-on invisible from rear¾.
      // Keep cross opacity low in system attach so dual-plane plates stay subordinate.
      cross: true,
    },
    {
      role: 'sheath',
      widthScale: 3.3,
      opacity: 0.5,
      radiance: 0.95,
      color: [0.1, 0.34, 0.9],
      cross: false,
    },
  ],
  drive: {
    idleFloor: 0.04,
    boostWidthMul: 1.5,
    boostRadianceMul: 1.45,
    boostLengthSegmentsBonus: 8,
  },
  // Nozzle-interior glow discs (one per socket): the lit engine core inside the bell.
  throat: {
    radiusWU: 1.45,
    opacity: 0.9,
    radiance: 2.4,
  },
});
