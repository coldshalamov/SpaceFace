// Dead combat-feedback seams: events the sim already emits that no ear played.
// Pure resolvers plus one admission book so a beam or a repeating mayday cannot
// machine-gun the cue. Recipes are existing ids — no new samples.

export const DISTRESS_CALL_RECIPE = 'sfx_wanted_alert';
export const MINE_DETONATION_RECIPE = 'sfx_explosion_small';
export const WARDED_SHOT_RECIPE = 'sfx.shieldHit';
export const MINING_NOISE_RECIPE = 'sfx_wanted_alert';
export const MINE_ARMED_RECIPE = 'sfx_vector_mine';
export const MINE_ARMED_ADMIT_TICKS = 30;
export const CLOAK_BURN_RECIPE = 'sfx_cloak_fade';
export const CLOAK_BURN_ADMIT_TICKS = 45;

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
  if (!Number.isFinite(now) || !Number.isFinite(gapTicks) || gapTicks < 0) return false;
  const entries = book.entries || (book.entries = new Map());
  // Clock rollback can also occur in a test/replay host without the normal run-boundary event.
  if (Number.isFinite(book.lastTick) && now < book.lastTick) entries.clear();
  if (!Number.isFinite(book.pruneAt) || now < book.lastTick || now >= book.pruneAt) {
    // Expire only spent cooldowns. A large burst never evicts a still-live cue and permits it
    // to repeat. One scan per simulation second bounds retained mine/escort IDs by their TTL.
    for (const [id, until] of entries) if (until <= now) entries.delete(id);
    book.pruneAt = now + 60;
  }
  book.lastTick = now;
  const id = String(key);
  const until = entries.get(id);
  if (until != null && now < until) return false;
  entries.set(id, now + gapTicks);
  return true;
}

/** A civilian mayday the player is inside the radius of. Far calls stay silent. */
export function distressCallCue(payload) {
  if (!payload || payload.routedToPlayer !== true) return null;
  const caller = payload.callerId != null ? payload.callerId : null;
  if (caller == null) return null;
  return {
    recipeId: DISTRESS_CALL_RECIPE,
    gain: 0.62,
    key: `distress:${caller}`,
    gapTicks: DISTRESS_ADMIT_TICKS,
    critical: true,
    // The traffic owner already admitted this radio call to the receiver (1800 WU).
    // Positional playback would silently cull it at the much shorter physical hearing edge.
    position: null,
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

/** A shot caught by an escort's ward. A hit, not the shield-collapse pop. */
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
 * Mining noise just crossed into "they can hear you". Same alert as a mayday,
 * pitched down, and a duck so the warning sits over the beam.
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

/**
 * The breath after a fight. Shallower than a death or a capital kill so the
 * roar still owns those moments; deep enough that the room drops.
 */
export const AFTERMATH_HUSH = Object.freeze({
  depth: 0.42,
  attackS: 0.2,
  holdS: 0.85,
  releaseS: 1.35,
});

/**
 * One hush per silence window. A later kill inside the same window (now still
 * before the recorded until) does not restart the breath.
 */
export function admitAftermathHush(book, until, nowSim) {
  const end = Number(until);
  const now = Number(nowSim);
  if (!book || !Number.isFinite(end) || !Number.isFinite(now) || end <= now) return false;
  if (Number.isFinite(book.until) && now < book.until) {
    book.until = Math.max(book.until, end);
    return false;
  }
  book.until = end;
  return true;
}

/** The story on a deep wreck read. One line per loss; a repeat replaces it. */
export function wreckMemorialLine(payload) {
  if (!payload || payload.lossId == null) return null;
  const story = typeof payload.story === 'string' ? payload.story.trim() : '';
  if (!story) return null;
  const text = story.length > 160 ? `${story.slice(0, 157)}…` : story;
  return {
    channel: 'comms',
    id: `wreckMemorial:${payload.lossId}`,
    text,
    kind: 'memorial',
    ttl: 5,
  };
}

/** The click of a mine going live. The blast is a different event. */
export function mineArmedCue(payload) {
  if (!payload || payload.mineId == null) return null;
  const pos = payload.pos;
  return {
    recipeId: MINE_ARMED_RECIPE,
    gain: 0.38,
    key: `arm:${payload.mineId}`,
    gapTicks: MINE_ARMED_ADMIT_TICKS,
    critical: false,
    position: pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x: pos.x, z: pos.z } : null,
  };
}

/**
 * The player's own cloak, burned open by a scan. Same fade as going dark,
 * slower, and only the player's burn — a pulse that lights an NPC stays quiet.
 * Admission is long enough that one pulse cannot machine-gun the shimmer.
 */
export function cloakBurnCue(payload) {
  if (!payload || payload.entityId == null) return null;
  const x = Number(payload.x);
  const z = Number(payload.z);
  return {
    recipeId: CLOAK_BURN_RECIPE,
    gain: 0.55,
    rate: 0.84,
    key: `cloakBurn:${payload.entityId}`,
    gapTicks: CLOAK_BURN_ADMIT_TICKS,
    critical: false,
    position: Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null,
  };
}
