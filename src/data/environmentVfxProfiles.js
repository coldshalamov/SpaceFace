// ID-V (Asset Experience Program, chunk C11): authored VFX parameter sets for the
// environmental weather fronts. The audit's burning-claim / forge / rim identities ask for
// fronts that read as their own phenomena, not as the shared storm signature — a fire front is
// ember-lit and leaves a scorched edge against the rock, a thermal plume is a hot vent updraft,
// an ion storm is a cold discharge sheet that kills radar.
//
// Mechanics stay generic: a WEATHER_VOLUMES row (src/data/environmentalMachinery.js) carries a
// `vfxProfile` id on both the volume and its field spec; normalizeField passes it through the
// kernel and fields.js publishes it on the live record, so fieldForcePresentation styles the
// front from this table instead of the kind-level FIELD_SIGNATURES palette alone. Every value
// here is consumed by the presentation layer — nothing in this file changes sim behaviour.
//
// Parameters:
//   tint        — body colour of the front's surfaces (THREE.Color hex)
//   accent      — accent colour (end caps, rims) — replaces the kind-level accent
//   edgeTint    — far-edge cap tint (sheet end walls, cone mouth)
//   particles   — burst modulation for the front's emitted parcels:
//                 countMul multiplies the per-pulse parcel count,
//                 strengthMul the parcel strength, lifeMul the parcel lifetime
//   scorch      — fire_front only: the blackened edge the front burns onto the ground line it
//                 has crossed (the "scorched rock" read). bandFrac is the band width as a
//                 fraction of the sheet's half-width; alpha its opacity.

export const ENVIRONMENT_VFX_PROFILES = Object.freeze({
  // A wall of burning debris crossing a mining claim: orange-ember body, hot rim, and a
  // charcoal scorch band where the front has already passed. Ember parcels drift slower and
  // live longer than storm spray.
  fire_front: Object.freeze({
    tint: 0xff6a2a,
    accent: 0xffc36c,
    edgeTint: 0x8a3416,
    particles: Object.freeze({ countMul: 1.35, strengthMul: 0.70, lifeMul: 1.15 }),
    scorch: Object.freeze({ tint: 0x1a0d08, bandFrac: 0.10, alpha: 0.55 }),
  }),
  // A vent-column updraft off the foundry floor: paler heat-shimmer body, hot white mouth,
  // parcels pushed harder and shorter-lived (a plume throws mass up, it does not linger).
  thermal_plume: Object.freeze({
    tint: 0xffb36c,
    accent: 0xffe1a4,
    edgeTint: 0xd97a3a,
    particles: Object.freeze({ countMul: 0.85, strengthMul: 1.35, lifeMul: 0.80 }),
  }),
  // A charged front on the dark rim: blue-violet discharge body, pale arc edges, many small
  // fast-fading parcels (static popping, not weather). Pairs with hazardType 'nebula' on the
  // volume so the volume's scanScale is the radar kill the front promises.
  ion_storm: Object.freeze({
    tint: 0x6f9bff,
    accent: 0xb7d9ff,
    edgeTint: 0x2a4a9b,
    particles: Object.freeze({ countMul: 1.60, strengthMul: 0.55, lifeMul: 0.60 }),
  }),
});

export function resolveEnvironmentVfxProfile(id) {
  return (typeof id === 'string' && ENVIRONMENT_VFX_PROFILES[id]) || null;
}
