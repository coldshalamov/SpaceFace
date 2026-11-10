// Sector wind — the pure decision layer for the belt's ambient weather.
//
// The player story: sitting still in a belt, the dust used to hang dead in the vacuum — the
// near-field drift sheet only moved when YOU moved (camera parallax) or when a chip spun in
// place. Nothing said "this sky has weather", and nothing carried sector identity into that
// weather. Now the drift dust rides a slow wind keyed to the sector's own palette class: the
// inhabited core breathes a near-still drift, the belts run a brisk dusty solar-wind flow,
// the fringe pulls cold and slow, and the anomaly shears fast on a wrong-heading vector.
//
// Truth read: `state.render.sectorPalette` — the same palette object identity the parallax
// field and the deep-field finishes already consume (resolved by the renderer's sector rig).
// Classes are matched by their authored tint values (the resolveDebrisFinish fallback-match
// habit: nebulaTint is unique per authored class), so this module needs no sector-table
// import and no sim state. No rng, no wall time: the caller feeds a clock it already owns
// (the presentation delta), and reduced motion freezes that clock — animation, not membership.
//
// Geometry contract (mirrors the drift-band shader exactly):
//   wrapped = mod(base - focus*factor - wind*speed*time*(0.6 + 0.8*phase) + tile*0.5, tile)
//             - tile*0.5
// Each grain carries its own phase in [0,1), so the sheet SHEARS along the wind instead of
// marching in lockstep (a lockstep sheet reads as a conveyor, not weather).

const TAU = Math.PI * 2;

/** Per-class wind: direction (radians, world XZ) and steady speed in wu/s. */
const WIND_BY_TINT = {
  // core — Helios: calm, barely-there drift off the trade lanes.
  0x2450a0: { angle: 0.65, speed: 2.6 },
  // belt — Ceres: the working belts ride a brisk dusty flow (solar-wind downstream).
  0x8a4a1e: { angle: -0.9, speed: 8.5 },
  // fringe — a colder, slower pull toward the deep field.
  0x8a1e1e: { angle: 2.4, speed: 5.2 },
  // anomaly — wrong-heading shear, the fastest weather in the chart.
  0x5a1e8a: { angle: 3.9, speed: 11.5 },
  // viscera — the Bolus wet interior: near-still, heavy air.
  0x2a0810: { angle: 1.2, speed: 1.4 },
};

/** Deterministic fallback for an unlisted palette: mid weather, hashed from its own tint. */
export function fallbackSectorWind(palette) {
  const tint = (palette && Number.isFinite(palette.nebulaTint)) ? (palette.nebulaTint >>> 0) : 0;
  let h = 2166136261 ^ tint;
  h = Math.imul(h ^ (h >>> 13), 16777619) >>> 0;
  const angle = ((h % 3600) / 3600) * TAU;
  const speed = 3.2 + ((h >>> 9) % 1000) / 1000 * 3.4;
  return { angle, speed };
}

/** Resolve one palette's wind as { dirX, dirZ, speedWuPerS }. Never null, never NaN. */
export function resolveSectorWind(palette) {
  const tint = palette && Number.isFinite(palette.nebulaTint) ? palette.nebulaTint : null;
  const known = tint != null && Object.prototype.hasOwnProperty.call(WIND_BY_TINT, tint)
    ? WIND_BY_TINT[tint]
    : null;
  const { angle, speed } = known || fallbackSectorWind(palette);
  return {
    dirX: Math.cos(angle),
    dirZ: Math.sin(angle),
    speedWuPerS: speed,
  };
}

/**
 * Where one grain sits after the wind has run. `timeS` is the caller's motion clock — a frozen
 * clock (reduced motion) freezes the sheet. Wraps into the same [-tile/2, tile/2) cell the
 * shader's edge-shrink zone dissolves against, so a grain crossing the boundary pops nowhere.
 */
export function windWrappedCenterXZ(baseX, baseZ, wind, timeS, phase, tile) {
  const t = Number.isFinite(timeS) && timeS > 0 ? timeS : 0;
  const p = Number.isFinite(phase) ? Math.min(1, Math.max(0, phase)) : 0;
  const cell = Number.isFinite(tile) && tile > 0 ? tile : 1;
  const speed = Number.isFinite(wind && wind.speedWuPerS) ? wind.speedWuPerS : 0;
  const dx = Number.isFinite(wind && wind.dirX) ? wind.dirX : 1;
  const dz = Number.isFinite(wind && wind.dirZ) ? wind.dirZ : 0;
  const drift = speed * t * (0.6 + 0.8 * p);
  const half = cell * 0.5;
  const wrap = (value) => ((value + half) % cell + cell) % cell - half;
  return {
    x: wrap((Number.isFinite(baseX) ? baseX : 0) - dx * drift),
    z: wrap((Number.isFinite(baseZ) ? baseZ : 0) - dz * drift),
  };
}

/**
 * The per-frame uniform payload for the drift band: the wind vector in wrap-space wu/s.
 * `t01` is the palette transition share (0 = from, 1 = to); direction is lerped through the
 * SHORT arc so a sector hand-off swings the weather the short way around, not the long way.
 */
export function lerpedWindUniforms(from, to, t01) {
  const t = Number.isFinite(t01) ? Math.min(1, Math.max(0, t01)) : 1;
  const fx = Number.isFinite(from && from.dirX) ? from.dirX : 1;
  const fz = Number.isFinite(from && from.dirZ) ? from.dirZ : 0;
  const tx = Number.isFinite(to && to.dirX) ? to.dirX : fx;
  const tz = Number.isFinite(to && to.dirZ) ? to.dirZ : fz;
  const fromAngle = Math.atan2(fz, fx);
  let delta = Math.atan2(tz, tx) - fromAngle;
  while (delta > Math.PI) delta -= TAU;
  while (delta < -Math.PI) delta += TAU;
  const angle = fromAngle + delta * t;
  const fromSpeed = Number.isFinite(from && from.speedWuPerS) ? from.speedWuPerS : 0;
  const toSpeed = Number.isFinite(to && to.speedWuPerS) ? to.speedWuPerS : fromSpeed;
  const speed = fromSpeed + (toSpeed - fromSpeed) * t;
  return {
    x: Math.cos(angle) * speed,
    z: Math.sin(angle) * speed,
    speedWuPerS: speed,
  };
}
