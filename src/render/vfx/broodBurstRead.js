// inf-brood-burst-read — the brood bomb's death blast, as pure decisions.
//
// WHAT THIS OWNS
// --------------
// A Lantern Cyst or Bellows dying — or a volatile-marked mite popping — shoves every
// neighbor, shatters neighbors outright, and can chip the player's hull, yet the glass
// showed nothing: the engine's `swarm:broodBurst` receipt has carried the blast
// (pos, radius, familyId, strain) since the deaths landed, and no render path ever
// subscribed to it. In a 200-body furball a bomb went off invisibly — the only honest
// tell was your own velocity changing.
//
//   gate   only a receipt with a finite position and a positive blast radius plays.
//   hue    the family's own body colour is the vent voice; the flash pushes that hue
//          toward white-hot. A strain pop (`strain` on the receipt) wears the strain's
//          mark tint instead — the pale-hot mites pop in the colour they cook with.
//   plan   flash (white-hot core, gone fast), vent (family-coloured gas, drifting out
//          over the blast's reach), and star (the beat that outlives the flash — the
//          shove the pack felt), all sized off the receipt's ACTUAL blast radius; the
//          event light rides the director's explosion/beat row in the family hue with
//          a distance keyed to the same reach.
//
// The sprites themselves spawn through vfx.js's normal admission and its automatic flash
// accessibility pass — this file invents no pool, no clock and no randomness.

import { SWARM_BROOD_FAMILIES } from '../../data/swarmBrood.js';
import { SWARM_BROOD_LATE_FAMILIES, SWARM_BROOD_STRAINS } from '../../data/swarmBroodLate.js';
import { SWARM_MACHINE_FAMILIES } from '../../data/swarmMachine.js';

/** True when the payload is a real blast receipt: finite position, positive reach. */
export function isBroodBurstMoment(payload) {
  return !!(payload
    && payload.pos
    && Number.isFinite(payload.pos.x)
    && Number.isFinite(payload.pos.z)
    && Number.isFinite(payload.radius)
    && payload.radius > 0);
}

// The roster's own colours are the burst's voice. Built once; the late table imports
// this file's siblings (never this one), so the lookups stay at call time in value only.
const FAMILY_BY_ID = new Map();
for (const def of SWARM_BROOD_FAMILIES.concat(SWARM_BROOD_LATE_FAMILIES, SWARM_MACHINE_FAMILIES)) {
  if (def && typeof def.id === 'string') FAMILY_BY_ID.set(def.id, def);
}
const STRAIN_BY_ID = new Map(SWARM_BROOD_STRAINS.map((s) => [s.id, s]));

/** The brood's default vent voice when a receipt names no family we know. */
const FALLBACK_VENT_RGB = Object.freeze([0.42, 0.86, 0.56]);

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The burst's two hues as [r,g,b] in 0..1: `ventRgb` is the family's body colour (or the
 * strain's mark tint for a strain pop), `flashRgb` is that hue pushed toward white-hot
 * for the core. Pure; unknown names fall to the brood's acid green, never to black.
 */
export function broodBurstHue(familyId, strainId) {
  const strain = typeof strainId === 'string' ? STRAIN_BY_ID.get(strainId) : null;
  const family = typeof familyId === 'string' ? FAMILY_BY_ID.get(familyId) : null;
  const vent = (strain && Array.isArray(strain.tint) && strain.tint.length === 3)
    ? strain.tint
    : (family && Array.isArray(family.bodyColor) && family.bodyColor.length === 3)
      ? family.bodyColor
      : FALLBACK_VENT_RGB;
  // White-hot core: the hue keeps its voice but the centre burns.
  const flash = [
    clamp01(vent[0] * 0.45 + 0.55),
    clamp01(vent[1] * 0.45 + 0.55),
    clamp01(vent[2] * 0.45 + 0.55),
  ];
  return {
    ventRgb: [clamp01(vent[0]), clamp01(vent[1]), clamp01(vent[2])],
    flashRgb: flash,
  };
}

/** [r,g,b] 0..1 → CSS rgb() string for the sprite/light colour path. */
export function broodBurstColorCss(rgb) {
  const c = (v) => Math.round(clamp01(Number(v) || 0) * 255);
  return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`;
}

/** Sprite admission priority — above scenery, below hull collisions. */
export const BROOD_BURST_PRIORITY = 0.6;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The blast's sprite + light plan, keyed to the receipt's actual blast radius (the live
 * families burst at 46–110 wu, so the same numbers must read on a mite's pop and a
 * bellows' shockwave). Pure; the caller spawns exactly what this names.
 */
export function broodBurstPlan(radius, hue) {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 60;
  const h = hue || broodBurstHue(null, null);
  const flashSize1 = clamp(r * 0.09, 4, 10);
  const ventSize1 = clamp(r * 0.16, 8, 18);
  return {
    flash: {
      color: broodBurstColorCss(h.flashRgb),
      life: 0.32, size0: 2.2, size1: flashSize1, op0: 0.85,
    },
    vent: {
      color: broodBurstColorCss(h.ventRgb),
      life: 0.8, size0: clamp(r * 0.06, 3, 7), size1: ventSize1, op0: 0.5,
      drift: clamp(r * 0.1, 4, 12),
    },
    star: {
      color: broodBurstColorCss(h.ventRgb),
      life: 1.1, size0: 1.6, size1: 5, op0: 0.8,
    },
    light: {
      severity: 'beat',
      distance: clamp(r * 1.6, 90, 180),
    },
  };
}
