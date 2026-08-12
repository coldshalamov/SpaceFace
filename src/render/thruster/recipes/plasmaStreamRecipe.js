/**
 * Unified continuous liquid plasma thruster.
 * One continuous surface medium: wide hot root at the nozzle, thinner long wake along history.
 * Not particles/balls. Not dual cone+ribbon.
 *
 * Scale note: lab ship hull ~8 WU, bell radius ~1.35. Root half-width should be
 * ~1.2–2.8 WU (body), sheath ~2.5–4.0 — not screen-filling whiteout.
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
 * Teardrop: fat root ≥ bell, continuous body, wispy wake.
 */
export function samplePlasmaEnvelope(s, drive = 1, boost = 0, out = null) {
  const u = Math.max(0, Math.min(1, Number.isFinite(s) ? s : 1));
  const d = Math.max(0, Math.min(1.35, Number.isFinite(drive) ? drive : 0));
  const b = Math.max(0, Math.min(1, Number.isFinite(boost) ? boost : 0));
  const root = 1 - smoothstep(0.0, 0.2, u);
  const jet = (1 - smoothstep(0.05, 0.55, u));
  const wake = smoothstep(0.2, 0.45, u) * (1 - smoothstep(0.72, 1.0, u));
  // Teardrop: fat root/mid belly, then fray — not linear laser taper.
  const belly = Math.exp(-((u - 0.14) * (u - 0.14)) / (2 * 0.12 * 0.12));
  const taper = Math.pow(Math.max(0.1, 1.0 - u * 0.82), 0.95);
  // Slight mid widen so body is a full teardrop (ref), then soft collapse
  const midBulge = Math.exp(-((u - 0.28) * (u - 0.28)) / (2 * 0.18 * 0.18)) * 0.35;
  const width = (0.6 + root * 0.7 + jet * 0.5 + belly * 0.55 + midBulge + b * 0.28)
    * (0.82 + d * 0.35)
    * taper;
  const heat = Math.min(1.35, root * 1.15 + jet * 0.55 + b * 0.3 + d * 0.15 + belly * 0.2);
  const opacity = (0.65 + root * 0.35 + jet * 0.25 + d * 0.15)
    * (1.0 - smoothstep(0.52, 1.0, u) * 0.78);
  const target = out || {};
  target.s = u;
  target.width = Math.max(0.12, width);
  target.heat = Math.max(0, heat);
  target.opacity = Math.max(0.03, opacity);
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
  id: 'player_liquid_plasma_v11',
  kind: 'unified_liquid_plasma',
  displayName: 'Player continuous liquid plasma thruster',
  notes: 'Volume teardrop + stream filaments. Soft dual-cross for fill. Cyan liquid body, white-hot root ropes.',
  path: {
    capacity: 72,
    sampleSpacingWU: 0.7,
    sampleHz: 64,
    nearJetLengthWU: 16,
    discontinuityFloorWU: 160,
    discontinuityMaxWU: 640,
  },
  layers: [
    {
      role: 'core',
      widthScale: 0.58,
      opacity: 0.9,
      radiance: 1.85,
      color: [0.95, 0.98, 1.0],
      cross: false,
    },
    {
      role: 'body',
      widthScale: 1.8,
      opacity: 0.7,
      radiance: 1.15,
      color: [0.28, 0.8, 1.0],
      cross: true,
    },
    {
      role: 'sheath',
      widthScale: 2.85,
      opacity: 0.52,
      radiance: 0.68,
      color: [0.12, 0.35, 0.88],
      cross: true,
    },
  ],
  drive: {
    idleFloor: 0.04,
    boostWidthMul: 1.35,
    boostRadianceMul: 1.4,
    boostLengthSegmentsBonus: 8,
  },
});
