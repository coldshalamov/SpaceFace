// Dead combat-feedback seams: events the sim already emits that no ear played.
// Pure resolvers plus one admission book so a beam or a repeating mayday cannot
// machine-gun the cue. Recipes are existing ids — no new samples.

export const DISTRESS_CALL_RECIPE = 'sfx_ui_alert';
export const MINE_DETONATION_RECIPE = 'sfx_explosion_small';
export const WARDED_SHOT_RECIPE = 'sfx_shield_blowout_pop';
export const MINING_NOISE_RECIPE = 'sfx_ui_alert';

export const DISTRESS_ADMIT_TICKS = 90;
export const MINE_ADMIT_TICKS = 8;
export const WARD_ADMIT_TICKS = 10;
// The meter can flicker across the danger line. One warning, then a gap
// long enough that a held beam is not a wall of alerts.
export const MINING_NOISE_ADMIT_TICKS = 180;

/** One voice per key inside gapTicks. Same book the audio host keeps on rt. */
export function admitEarCue(book, key, nowTick, gapTicks) {
  if (!book || key == null) return false;
  const now = Number(nowTick);
  if (!Number.isFinite(now)) return false;
  const id = String(key);
  const last = book[id];
  if (last != null && now - last < gapTicks) return false;
  book[id] = now;
  return true;
}

/** A civilian mayday the player is inside the radius of. Far calls stay silent. */
export function distressCallCue(payload) {
  if (!payload || payload.routedToPlayer !== true) return null;
  const caller = payload.callerId != null ? payload.callerId : null;
  if (caller == null) return null;
  const pos = payload.pos;
  return {
    recipeId: DISTRESS_CALL_RECIPE,
    gain: 0.62,
    key: `distress:${caller}`,
    gapTicks: DISTRESS_ADMIT_TICKS,
    critical: true,
    position: pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x: pos.x, z: pos.z } : null,
  };
}

/** The mine's own detonation. Damage already stings the hull; this is the blast. */
export function mineDetonationCue(payload) {
  if (!payload || payload.mineId == null) return null;
  const pos = payload.pos;
  return {
    recipeId: MINE_DETONATION_RECIPE,
    gain: 0.8,
    key: `mine:${payload.mineId}`,
    gapTicks: MINE_ADMIT_TICKS,
    critical: false,
    position: pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x: pos.x, z: pos.z } : null,
  };
}

/** A shot caught by an escort's ward. Distinct from the hull hit on the same tick. */
export function wardedShotCue(payload) {
  if (!payload || payload.escortId == null) return null;
  const pos = payload.pos;
  return {
    recipeId: WARDED_SHOT_RECIPE,
    gain: 0.42,
    key: `ward:${payload.escortId}`,
    gapTicks: WARD_ADMIT_TICKS,
    critical: false,
    position: pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x: pos.x, z: pos.z } : null,
  };
}

/**
 * Mining noise just crossed into "they can hear you". One darker alert than a
 * mayday (same recipe, lower rate) and a duck so the warning sits over the beam.
 * Below-threshold payloads stay silent — the sim only emits the crossing.
 */
export function miningNoiseDangerCue(payload) {
  if (!payload || !Number.isFinite(payload.level)) return null;
  if (Number.isFinite(payload.threshold) && !(payload.level > payload.threshold)) return null;
  return {
    recipeId: MINING_NOISE_RECIPE,
    gain: 0.7,
    rate: 0.72,
    key: 'miningNoise',
    gapTicks: MINING_NOISE_ADMIT_TICKS,
    critical: true,
    duck: true,
    position: null,
  };
}

export function playAdmittedEarCue(host, cue, nowTick) {
  if (!host || !cue || typeof host.play !== 'function') return null;
  const rt = host.rt || (host.rt = {});
  const book = rt._combatFeedbackAdmit || (rt._combatFeedbackAdmit = Object.create(null));
  if (!admitEarCue(book, cue.key, nowTick, cue.gapTicks)) return null;
  return host.play(cue.recipeId, {
    gain: cue.gain,
    position: cue.position,
    critical: cue.critical === true,
    duck: cue.duck === true,
    rate: Number.isFinite(cue.rate) ? cue.rate : undefined,
  });
}
