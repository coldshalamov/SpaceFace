/**
 * Plume slug: where the visible gas of the live jet starts and ends, nozzle-local, along the exhaust.
 *
 * WHY THIS EXISTS (slice 1, thruster lifecycle)
 * ---------------------------------------------
 * The live jet used to carry the throttle in its OWN LENGTH: the whole sheet structure was scaled
 * toward the throat when the drive spooled down, and the mesh was hidden at a third of its size
 * (8 WU, ~50 px at the chase camera, 52% of held radiance) one frame after the throat lamp had been
 * switched off. That is the dial-turning-back the standard rejects (E3: "release stops supply;
 * surviving material travels, separates, cools and dissipates instead of replaying birth backward").
 *
 * This module is the pure, allocation-free model of the alternative. The jet is a SLUG of gas with a
 * head (the leading edge) and a tail (the trailing edge, normally at the throat):
 *
 *   press    the head runs out of the throat at a bounded front speed (an ignition head, not a
 *            mesh scaled from nothing); the tail stays at the throat.
 *   hold     head = the reach the current drive supports; tail = 0.
 *   release  the source dies. Gas already out there does not retract with the throttle (the head
 *            holds and only slowly thins); the TAIL leaves the throat and travels aft as the supply
 *            fails, so the slug detaches, shortens from the root side, cools, and is gone when it
 *            has no length left — never while it is still a recognisable jet.
 *   re-press the tail relaxes back to the throat with its own short time constant; nothing snaps.
 *
 * Length, radiance and reach are the only channels. Opacity is never a throttle channel (VFX
 * technique standard B10/B17).
 */
import { EMIT_FLOOR, PLUME_DARK } from './driveEnvelope.js';

export const SLUG = Object.freeze({
  /** Head follows a growing reach with this time constant... */
  headRiseTau: 0.035,
  /** ...but never faster than this front speed, WU/s (14.8 WU in ~0.1 s: inside the G10 window). */
  headSpeedWU: 150,
  /** Gas already in flight thins out slowly; it does not retract with the throttle. */
  headFallTau: 0.22,
  /** Tail speed once the source is dead, WU/s. */
  blowSpeedWU: 130,
  /** Tail relaxes back to the throat at this rate (1/s) while the source is supplying. */
  catchUpPerS: 22,
  /** Below this visible length the slug is gone (about 3 px at the chase camera). */
  minVisibleWU: 0.5,
  /** Radiance ramps in/out across this much length either side of the visibility floor. */
  fadeSpanWU: 5.0,
  /** Radiance cools on this time constant after the source stops lighting it (slower than the spool). */
  coolTau: 0.08,
  /**
   * Radiance may rise at most this many reference-radiances per second (so ~0.18 of the held value
   * per 60 Hz tick): the jet is lit, not switched. Flares (dash/boost) are applied by the caller
   * after the slug and are not limited.
   */
  heatRiseRel: 11,
  /** The tail slows over the last few WU so the closing edge is eased, not guillotined. */
  easeSpanWU: 6.0,
  easeFloor: 0.35,
});

export function createPlumeSlug() {
  return {
    head: 0,
    tail: 0,
    peak: 0,
    heat: 0,
    supply: 0,
    live: false,
    /** Visible length, WU. */
    length: 0,
    /** Distance of the root from the throat, WU (the detached tail). */
    rootOffset: 0,
    /** 0..1 visibility ramp on the slug's own length. */
    fade: 0,
    /** Radiance to draw: cooled heat * fade. */
    radiance: 0,
  };
}

export function resetPlumeSlug(s) {
  s.head = 0; s.tail = 0; s.peak = 0; s.heat = 0; s.supply = 0;
  s.live = false; s.length = 0; s.rootOffset = 0; s.fade = 0; s.radiance = 0;
  return s;
}

function smooth(edge0, edge1, x) {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Advance the slug one render tick. Mutates and returns `s`; allocates nothing.
 *
 * @param {object} s from createPlumeSlug
 * @param {number} spool smoothed drive (the spring)
 * @param {number} target the un-smoothed drive target (0 once the throttle is off)
 * @param {number} reachTarget WU of reach the CURRENT spool supports (0 at PLUME_DARK, continuous)
 * @param {number} radianceTarget radiance the current spool supports (0 at PLUME_DARK, continuous)
 * @param {number} radianceRef the held radiance this jet is designed around (rate-limit scale)
 * @param {number} dt seconds
 */
export function stepPlumeSlug(s, spool, target, reachTarget, radianceTarget, radianceRef, dt) {
  const d = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
  const reach = Math.max(0, Number.isFinite(reachTarget) ? reachTarget : 0);
  const commanded = target > EMIT_FLOOR;

  // How alive the source is, relative to where it was when it was last commanded.
  if (commanded) s.peak = spool;
  s.supply = commanded
    ? 1
    : (s.peak > PLUME_DARK ? Math.max(0, Math.min(1, (spool - PLUME_DARK) / (s.peak - PLUME_DARK))) : 0);

  // Head: runs out at a bounded front speed; thins slowly once the reach it was given is withdrawn.
  if (reach > s.head) {
    const grow = (reach - s.head) * (1 - Math.exp(-d / SLUG.headRiseTau));
    s.head += Math.min(grow, SLUG.headSpeedWU * d);
  } else {
    s.head += (reach - s.head) * (1 - Math.exp(-d / SLUG.headFallTau));
  }

  // Tail: pinned at the throat while the source supplies; leaves it as the supply fails.
  if (commanded) {
    s.tail *= Math.exp(-SLUG.catchUpPerS * d);
  } else {
    const gone = 1 - s.supply;
    const len0 = Math.max(0, s.head - s.tail);
    const ease = SLUG.easeFloor + (1 - SLUG.easeFloor) * smooth(0, SLUG.easeSpanWU, len0);
    s.tail += SLUG.blowSpeedWU * gone * gone * ease * d;
  }
  if (s.tail > s.head) s.tail = s.head;

  // Heat: lights with the spool, cools slower than the spool falls.
  const radianceT = Math.max(0, Number.isFinite(radianceTarget) ? radianceTarget : 0);
  const cooled = s.heat * Math.exp(-d / SLUG.coolTau);
  if (radianceT > cooled) {
    const ref = Math.max(1e-3, Number.isFinite(radianceRef) ? radianceRef : 1);
    s.heat = Math.min(radianceT, cooled + SLUG.heatRiseRel * ref * d);
  } else {
    s.heat = cooled;
  }

  const length = Math.max(0, s.head - s.tail);
  if (!commanded && length <= SLUG.minVisibleWU) {
    // Nothing left of the slug: the only hide, taken when its length and radiance are already nil.
    resetPlumeSlug(s);
    return s;
  }
  if (commanded && !(length > 0) && !(reach > 0)) {
    s.live = false; s.length = 0; s.rootOffset = 0; s.fade = 0; s.radiance = 0;
    return s;
  }
  s.live = true;
  s.length = length;
  s.rootOffset = s.tail;
  s.fade = smooth(SLUG.minVisibleWU, SLUG.minVisibleWU + SLUG.fadeSpanWU, length);
  s.radiance = s.heat * s.fade;
  return s;
}
