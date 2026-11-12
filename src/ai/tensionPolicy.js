/** Read-only encounter port. This file has NO dependency on the system singleton.
 * Consumers retain their own state and every existing admission/safety gate.
 */
export const TENSION_POLICY_SCHEMA = 'spaceface.tension-policy.v1';
const PHASES = new Set(['quiet', 'opportunity', 'build', 'peak', 'aftermath', 'recovery']);
const RHYTHMS = new Set(['quiet', 'curiosity', 'opportunity', 'tension', 'violence', 'aftermath']);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function readTensionPolicy(state, now = state?.simTime) {
  const p = state?.tensionDirector?.policy;
  if (!p || p.schema !== TENSION_POLICY_SCHEMA || p.enabled !== true
    || !Number.isFinite(now) || !Number.isFinite(p.issuedAt) || !Number.isFinite(p.validUntil)
    || p.issuedAt > now || p.validUntil < now || p.validUntil - p.issuedAt > 3
    || !PHASES.has(p.phase) || !RHYTHMS.has(p.rhythmPhase)
    || typeof p.allowCombat !== 'boolean' || typeof p.allowMajor !== 'boolean'
    || !Number.isFinite(p.combatRate) || !Number.isFinite(p.civilianRate)
    || !Number.isFinite(p.minGapS) || !Number.isFinite(p.preference)
    || !Array.isArray(p.recentShapes) || p.recentShapes.length > 8
    || !Array.from(p.recentShapes).every((v) => typeof v === 'string' && v.length <= 96)) return null;
  return p;
}

export function tensionAccrualScale(state, deck, now = state?.simTime) {
  const p = readTensionPolicy(state, now);
  if (!p) return 1;
  // Slow pressure accumulation during quiet. Long rests may still fill a pool;
  // existing gap/quota/live-combat gates prevent dumping that reserve in a burst.
  return deck === 'combat' ? clamp(p.combatRate, 0.15, 1.25)
    : deck === 'civilian' ? clamp(p.civilianRate, 0.65, 1.3) : 1;
}

export function tensionPacingBlockReason(dir, state, shape, now) {
  const p = readTensionPolicy(state, now);
  if (!p || !shape) return null;
  if (shape.deck === 'combat' && !p.allowCombat) return 'tension_recovery';
  if (shape.deck === 'combat' && shape.tier === 'major' && !p.allowMajor) return 'tension_reserve';
  // INF-080: the earned recovery is not combat-only. A meaningful non-combat demand — a
  // distress decision, a convoy hail, a customs scan — landing seconds after a kill talks
  // over the loot inspection the fight paid for. During aftermath/recovery it defers like
  // combat. Ambient world-life (tier ambient) is not a demand: props keep flowing so
  // nearby work continues honestly, and live rows are untouched (this gate only blocks
  // NEW offers — active threats and running jobs never consult it).
  if (shape.deck !== 'combat' && shape.tier !== 'ambient'
    && (p.phase === 'aftermath' || p.phase === 'recovery')) return 'tension_recovery';
  // INF-080 (voice owner): the immediate tail. barkDirector stamps a short post-combat
  // silence on every fight outcome; a meaningful demand inside it would talk over the
  // kill confirmations before tension even reaches aftermath. Same deferral, shorter
  // fuse. Absent/unparseable windows fail open.
  if (shape.deck !== 'combat' && shape.tier !== 'ambient' && voiceQuietUntil(state) > now) {
    return 'post_combat_silence';
  }
  const last = Number.isFinite(dir?.lastMeaningfulAt) ? dir.lastMeaningfulAt : -1e9;
  if (shape.tier !== 'ambient' && now - last < clamp(p.minGapS, 30, 90)) return 'tension_spacing';
  return null;
}

// Read-only view of the voice owner's post-combat window (barkDirector stamps
// postCombatSilenceUntil on every fight outcome). Same sim clock the gate's `now`
// already uses; anything unparseable fails open to -Infinity (no deferral).
function voiceQuietUntil(state) {
  const until = Number(state && state.barkDirector && state.barkDirector.postCombatSilenceUntil);
  return Number.isFinite(until) ? until : -Infinity;
}

/** Earliest-due selection with a <=20 s contextual preference. Older work wins;
 * this is NOT a new spawn path and cannot bypass a single downstream gate.
 * Stable input index resolves ties (no locale-sensitive ordering).
 */
export function tensionCandidateRank(state, item, shape, now) {
  const dueAt = Number.isFinite(item?.dueAt) ? item.dueAt : Infinity;
  const p = readTensionPolicy(state, now);
  if (!p || !shape) return dueAt;
  let bias = (shape.deck === 'civilian' ? 1 : -1) * clamp(p.preference, -1, 1) * 12;
  if (p.recentShapes.includes(shape.id || item.shapeId)) bias -= 8;
  if (shape.deck === 'combat' && !p.allowCombat) bias -= 20;
  return dueAt - clamp(bias, -20, 20);
}
