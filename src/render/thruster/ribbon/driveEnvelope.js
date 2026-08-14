/**
 * Drive envelopes for the player plume.
 *
 * WHY THIS EXISTS
 * ---------------
 * The plume used to read its intensity from `Math.max(drive, throttle, ...)` — an unsmoothed maximum
 * of instantaneous inputs — and plume length and width were computed straight from it. Pressing
 * forward was therefore a literal one-frame step from idle to full, which is the "clips from small to
 * big instantly" the owner rejected. Boost was the only channel with any smoothing, which is exactly
 * why boost was the only part that read as animated.
 *
 * The same maximum also meant speed could never contribute: at full throttle the throttle term
 * always won, so "hauling ass" had no visual consequence at all. Speed is a weighted share of the
 * target here, not a competitor for it.
 *
 * Every transition is asymmetric, and every release is slower than its own attack, because a drive
 * cools more slowly than it lights.
 */

/** Faint bell glow when the drive is alive but making no thrust. */
export const IDLE_FLOOR = 0.06;

/**
 * Threshold above which the drive is actually throwing mass. Sits above IDLE_FLOOR so a lit but
 * unfired drive glows in the bell without laying down a contrail or counting as thrust anywhere else.
 * Anything that asks "is this engine firing?" must use this, not a separate hand-picked number — the
 * two drifting apart is what left the drive permanently "emitting" while parked.
 */
export const EMIT_FLOOR = IDLE_FLOOR * 1.35;

/** Share of the drive target owned by airspeed rather than by the throttle. */
export const SPEED_SHARE = 0.25;

/**
 * Time constants, in seconds. A first-order lag reaches ~95% of its target in 3 tau, so the spool
 * rise below lands full thrust at about 0.66 s — inside the half-to-three-quarter-second window the
 * owner specified.
 */
export const RATES = Object.freeze({
  spoolRiseTau: 0.22,
  spoolFallTau: 0.34,
  // Boost is a blast, so its attack is roughly four times faster than the base spool.
  boostRiseTau: 0.055,
  boostFallTau: 0.26,
});

/** One-shot dash flare: a bright supernova for about a second, then a long cooling tail. */
export const DASH_ENVELOPE = Object.freeze({
  attackS: 0.05,
  sustainS: 0.12,
  releaseS: 0.62,
});

const DASH_TOTAL_S = DASH_ENVELOPE.attackS + DASH_ENVELOPE.sustainS + DASH_ENVELOPE.releaseS;

export function createDriveEnvelope() {
  return {
    spool: 0,
    boost: 0,
    dash: 0,
    dashAge: -1,
    lit: false,
  };
}

/**
 * Sample the one-shot dash flare. Fast attack, brief hold, long cooling release.
 * @param {number} age seconds since the dash fired, or negative when idle
 */
export function sampleDashFlare(age) {
  if (!(age >= 0)) return 0;
  const { attackS, sustainS, releaseS } = DASH_ENVELOPE;
  if (age < attackS) return attackS <= 0 ? 1 : age / attackS;
  if (age < attackS + sustainS) return 1;
  const rel = age - attackS - sustainS;
  if (rel >= releaseS) return 0;
  const u = rel / releaseS;
  // Quadratic tail: the flare dumps most of its brightness quickly and then lingers, which reads as
  // cooling rather than as a linear fade-out.
  return (1 - u) * (1 - u);
}

/**
 * Resolve the drive target from pilot input, before smoothing.
 *
 * Speed contributes SPEED_SHARE of the target, but only counts in full once some thrust is actually
 * commanded — otherwise coasting at speed would light a drive that is not firing. Coasting still
 * keeps a fraction of it as residual thermal glow.
 *
 * @param {number} throttle 0..1 commanded forward authority
 * @param {number} speedNorm 0..1 airspeed as a fraction of the ship's top speed
 */
export function resolveDriveTarget(throttle, speedNorm) {
  const cmd = Math.max(0, Math.min(1, throttle || 0));
  const spd = Math.max(0, Math.min(1, speedNorm || 0));
  // smoothstep(0.05, 0.35, cmd)
  const t = Math.max(0, Math.min(1, (cmd - 0.05) / 0.30));
  const gate = 0.35 + 0.65 * (t * t * (3 - 2 * t));
  const blended = (1 - SPEED_SHARE) * cmd + SPEED_SHARE * spd * gate;
  return IDLE_FLOOR + (1 - IDLE_FLOOR) * Math.max(0, Math.min(1, blended));
}

/**
 * Advance the envelope. Mutates `state`; allocates nothing.
 *
 * @param {object} state from createDriveEnvelope
 * @param {{throttle:number, speedNorm:number, boosting:boolean, dashFired:boolean, alive:boolean}} input
 * @param {number} dt seconds
 */
export function integrateDriveEnvelope(state, input, dt) {
  const d = Math.max(0, dt || 0);
  const alive = input.alive !== false;

  const target = alive ? resolveDriveTarget(input.throttle, input.speedNorm) : 0;
  const spoolTau = target > state.spool ? RATES.spoolRiseTau : RATES.spoolFallTau;
  state.spool += (target - state.spool) * (1 - Math.exp(-d / Math.max(spoolTau, 1e-4)));

  const boostTarget = alive && input.boosting ? 1 : 0;
  const boostTau = boostTarget > state.boost ? RATES.boostRiseTau : RATES.boostFallTau;
  state.boost += (boostTarget - state.boost) * (1 - Math.exp(-d / Math.max(boostTau, 1e-4)));

  // The dash happened somewhere inside this frame, so its envelope starts one step in. Starting at
  // exactly zero would sample the very bottom of the attack and show nothing on the frame it fired.
  if (input.dashFired) state.dashAge = d;
  else if (state.dashAge >= 0) state.dashAge += d;
  state.dash = sampleDashFlare(state.dashAge);
  // Retire on the clock, not on the sampled value. The envelope legitimately reads zero on its very
  // first frame because the attack starts at zero, so retiring on "dash <= 0" cancelled every flare
  // the instant it fired.
  if (state.dashAge > DASH_TOTAL_S) state.dashAge = -1;

  state.lit = state.spool > IDLE_FLOOR * 0.5;
  return state;
}

/**
 * Plume geometry driven by the envelope. Boost buys length and collimation, never width: a uniform
 * width multiply is what made boost read as a triangle inflating in place.
 *
 * LENGTH is the load-bearing number, because length is what the eye reads as the drive coming up. A
 * light touch on the throttle has to produce a genuinely short jet standing off the bell that then
 * lengthens; the failure this replaces was a full-length jet drawn at a lower opacity, which reads as
 * a decal fading in rather than as an engine lighting.
 *
 * Opacity is deliberately NOT scaled by the drive. Transparency is material, and how hard the engine
 * is running does not change how see-through its exhaust is — it changes how far the exhaust reaches
 * and how hot it is.
 *
 * @param {object} state envelope
 * @param {object} base recipe numbers
 * @param {object} out preallocated target
 */
export function resolvePlumeShape(state, base, out) {
  const spool = state.spool;
  const boost = state.boost;
  const dash = state.dash;

  const drive = Math.max(0, Math.min(1, (spool - IDLE_FLOOR) / (1 - IDLE_FLOOR)));

  // Never quite zero while the drive is alive: a lit engine standing at idle still has a stub of hot
  // gas in the bell. It just does not reach.
  out.jetLength = base.jetLength
    * (0.10 + drive * 0.90)
    * (1 + boost * 0.55 + dash * 1.15);
  out.throatRadius = base.throatRadius * (0.72 + drive * 0.28);
  out.spread = base.spread * (0.55 + drive * 0.45) * (1 - boost * 0.12);
  out.radiance = base.radiance * (0.45 + drive * 0.55) * (1 + boost * 0.45 + dash * 1.6);
  out.opacity = base.opacity;
  out.drive = drive;
  out.spool = spool;
  out.boost = boost;
  out.dash = dash;
  // Above idle, so a glowing but unfired drive lays down no contrail.
  out.emitFloor = EMIT_FLOOR;
  return out;
}
