import { SCHEMA, TUG_KEY, APPEARANCES, LIMITS, bodyKey } from './catalog.js';

const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z)
  && Math.abs(p.x) <= 1e9 && Math.abs(p.z) <= 1e9 ? { x: p.x, z: p.z } : null;
const text = s => typeof s === 'string' && s.length > 0 && s.length <= 160 ? s : null;
const states = new Set(['pending', 'live', 'staged', 'recovered', 'destroyed', 'lost']);
export const terminal = row => row && ['staged', 'recovered', 'destroyed', 'lost'].includes(row.status);
export const quantity = pool => Object.values(pool || {}).reduce((a, n) => a + Math.max(0, finite(n)), 0);
export function poolBelow(pool, ceiling) {
  const out = {};
  for (const [id, max] of Object.entries(ceiling)) {
    const n = Math.floor(Math.max(0, Math.min(max, finite(pool?.[id]))));
    if (n > 0) out[id] = n;
  }
  return out;
}
export function freshIona() {
  return { schema: SCHEMA, revision: 0, active: -1, outcome: 'unsettled',
    retired: false, tug: { key: TUG_KEY, status: 'pending', sectorId: null, pose: null },
    appearances: [] };
}
export function beginAppearance(s, { index, sectorId, anchor, receiver }, now) {
  if (s.retired || s.tug.status === 'destroyed') return { ok: false, reason: 'retired' };
  if (!Number.isInteger(index) || index < 0 || index >= APPEARANCES.length
    || !text(sectorId) || !point(anchor) || !point(receiver)
    || Math.hypot(anchor.x - receiver.x, anchor.z - receiver.z) < 260
    || Math.hypot(anchor.x - receiver.x, anchor.z - receiver.z) > 2000
    || !Number.isFinite(now) || now < 0) return { ok: false, reason: 'invalid_placement' };
  if (s.appearances[index]) return { ok: true, duplicate: true };
  if (index !== s.appearances.length || (index > 0 && !s.appearances[index - 1].closed))
    return { ok: false, reason: 'previous_unresolved' };
  // One physical tug, one local route. Cross-sector travel is the world owner's job.
  if (s.tug.sectorId && s.tug.sectorId !== sectorId) return { ok: false, reason: 'tug_in_other_sector' };
  const def = APPEARANCES[index];
  s.appearances.push({ id: def.id, sectorId, anchor: point(anchor), receiver: point(receiver),
    openedAt: now, remainingGrace: LIMITS.graceS, lastAt: now, announced: false,
    agreement: 'none', closed: false, theft: false, damagedByPlayer: false, intervention: false,
    cooperation: false, winner: null, settledAt: null, missionId: null,
    bodies: def.bodies.map(b => ({ id: b.id, key: bodyKey(index, b.id), status: 'pending',
      claim: b.claimed ? 'iona' : 'open', pool: { ...b.pool }, pose: null,
      playerHandled: false, arrivalBy: null, dwell: 0, lastSampleAt: null })) });
  s.active = index; s.tug.sectorId = sectorId; s.revision++;
  return { ok: true };
}
export function currentAppearance(s) { return s.appearances[s.active] || null; }
export function chooseTerms(s, verb) {
  const a = currentAppearance(s);
  if (!a || a.closed || s.retired || !['cooperate', 'compete', 'yield'].includes(verb)
    || a.agreement !== 'none') return false;
  a.agreement = verb;
  // In the first encounter cooperation means the PLAYER returns her frame. Later she
  // carries her own load while the player carries the unclaimed instrument rack.
  if (s.active === 0 && verb === 'cooperate') a.bodies[0].claim = 'joint';
  s.revision++;
  return true;
}
export function recordTheft(s, key) {
  const a = s.appearances.find(a => a.bodies.some(row => row.key === key));
  const b = a?.bodies.find(row => row.key === key);
  if (!a || !b || b.claim !== 'iona' || a.theft) return false;
  a.theft = true; a.cooperation = false;
  if (s.outcome === 'alliance') s.outcome = 'lawful_rivalry';
  s.revision++; return true;
}
export function recordDamage(s, key, byPlayer) {
  const a = currentAppearance(s);
  if (!a || a.closed || !a.bodies.some(b => b.key === key) && key !== TUG_KEY) return false;
  if (byPlayer) a.damagedByPlayer = true;
  else a.intervention = true;
  s.revision++; return true;
}
export function loseBody(s, key, recovered = false) {
  const a = currentAppearance(s), b = a?.bodies.find(row => row.key === key);
  if (!b || terminal(b) || a.closed) return false;
  b.status = recovered ? 'recovered' : 'destroyed'; b.dwell = 0;
  s.revision++; return true;
}
// Observation is physical, never an NPC clock / dialogue / mission-completion assertion.
export function observeBody(s, key, sample, now) {
  const a = currentAppearance(s), b = a?.bodies.find(row => row.key === key);
  if (!a || a.closed || !b || terminal(b) || !sample || !point(sample.pos)
    || !Number.isFinite(now) || now < a.lastAt) return false;
  const def = APPEARANCES[s.active].bodies.find(row => row.id === b.id);
  b.status = 'live'; b.pose = capturePose(sample);
  b.pool = poolBelow(sample.pool, b.pool); // finite remainder can only decrease
  b.playerHandled ||= sample.playerLine === true;
  if (!quantity(b.pool)) { b.status = 'recovered'; s.revision++; return true; }
  const eligible = Math.hypot(sample.pos.x - a.receiver.x, sample.pos.z - a.receiver.z) <= LIMITS.receiverRadius
    && Math.hypot(finite(sample.vel?.x), finite(sample.vel?.z)) <= LIMITS.settleSpeed
    && finite(sample.hull) >= def.hull * 0.5;
  // Only contiguous near-sector samples accumulate. No credit for time spent away.
  const dt = b.lastSampleAt == null ? 0 : Math.min(0.25, Math.max(0, now - b.lastSampleAt));
  b.lastSampleAt = now;
  if (!eligible) b.dwell = 0;
  else b.dwell = Math.min(LIMITS.settleS, b.dwell + dt);
  if (b.dwell >= LIMITS.settleS) {
    b.status = 'staged'; b.arrivalBy = sample.playerLine ? 'player' : sample.rivalLine ? 'iona' : 'drift';
    s.revision++;
  }
  return true;
}
export function capturePose(entity) {
  return { pos: point(entity.pos), vel: point(entity.vel) || { x: 0, z: 0 },
    rot: finite(entity.rot), angVel: finite(entity.angVel), hull: Math.max(0, finite(entity.hull)) };
}
export function pauseIona(s) {
  const a = currentAppearance(s);
  if (a) { a.lastAt = null; for (const b of a.bodies) { b.lastSampleAt = null; b.dwell = 0; } }
}
export function stepIona(s, now, present) {
  const a = currentAppearance(s);
  if (!a || a.closed || s.retired || !Number.isFinite(now)) return false;
  if (!present) { pauseIona(s); return false; }
  if (a.lastAt != null && now < a.lastAt) return false;
  const dt = a.lastAt == null ? 0 : Math.min(0.25, now - a.lastAt);
  a.lastAt = now;
  a.remainingGrace = Math.max(0, a.remainingGrace - dt);
  if (!a.bodies.every(terminal)) return false;
  const frame = a.bodies[0], rack = a.bodies[1];
  a.cooperation = a.agreement === 'cooperate' && !a.theft && !a.damagedByPlayer
    && frame.status === 'staged' && (s.active === 0 ? frame.arrivalBy === 'player'
      : frame.arrivalBy === 'iona' && rack?.status === 'staged' && rack.arrivalBy === 'player');
  a.winner = a.cooperation ? 'joint' : frame.status === 'staged' ? frame.arrivalBy : 'neither';
  a.closed = true; a.settledAt = now; s.revision++;
  if (s.active === 2) {
    const first = s.appearances.slice(0, 2);
    s.outcome = first.every(row => row.cooperation) && a.cooperation ? 'alliance' : 'lawful_rivalry';
  }
  return true;
}

/** Strict bounded projection, not a spread of untrusted saved objects. Unknown versions
 * fail closed rather than silently resetting a spent source into fresh cargo. */
export function restoreIona(raw) {
  if (!raw || raw.schema !== SCHEMA || !Array.isArray(raw.appearances)
    || raw.appearances.length > 3) throw new TypeError('Unsupported Iona save');
  const s = freshIona();
  s.revision = Math.min(1e9, Math.max(0, Math.floor(finite(raw.revision))));
  if (!['pending', 'live', 'destroyed'].includes(raw.tug?.status)) throw new TypeError('Invalid tug state');
  s.tug = { key: TUG_KEY, status: 'pending', sectorId: text(raw.tug.sectorId), pose: restorePose(raw.tug.pose) };
  for (let i = 0; i < raw.appearances.length; i++) {
    const a = raw.appearances[i], def = APPEARANCES[i];
    if (a?.id !== def.id || !Array.isArray(a.bodies) || a.bodies.length !== def.bodies.length
      || i > 0 && !s.appearances[i - 1].closed) throw new TypeError('Invalid appearance sequence');
    const out = beginAppearance(s, { index: i, sectorId: a.sectorId, anchor: a.anchor, receiver: a.receiver },
      Math.max(0, finite(a.openedAt)));
    // Retired/destroyed state is restored after constructing the validated historical rows.
    if (!out.ok) throw new TypeError('Invalid Iona placement');
    const row = s.appearances[i];
    row.agreement = ['none', 'cooperate', 'compete', 'yield'].includes(a.agreement) ? a.agreement : 'none';
    for (const flag of ['closed', 'announced', 'theft', 'damagedByPlayer', 'intervention', 'cooperation']) row[flag] = a[flag] === true;
    row.winner = ['joint', 'player', 'iona', 'drift', 'neither'].includes(a.winner) ? a.winner : null;
    row.remainingGrace = Math.min(LIMITS.graceS, Math.max(0, finite(a.remainingGrace)));
    row.lastAt = null; row.settledAt = a.settledAt == null ? null : Math.max(0, finite(a.settledAt));
    row.missionId = text(a.missionId);
    row.bodies = a.bodies.map((b, k) => {
      const expected = row.bodies[k];
      if (b?.id !== expected.id || b.key !== expected.key || !states.has(b.status)
        || !b.pool || typeof b.pool !== 'object') throw new TypeError('Invalid Iona source');
      return { ...expected, status: b.status, pool: poolBelow(b.pool, def.bodies[k].pool),
        claim: ['iona', 'joint', 'open'].includes(b.claim) ? b.claim : expected.claim,
        pose: restorePose(b.pose), playerHandled: b.playerHandled === true,
        arrivalBy: ['player', 'iona', 'drift'].includes(b.arrivalBy) ? b.arrivalBy : null };
    });
  }
  if (raw.active !== s.appearances.length - 1) throw new TypeError('Invalid active appearance');
  s.active = raw.active;
  s.outcome = s.appearances[2]?.closed && ['alliance', 'lawful_rivalry'].includes(raw.outcome) ? raw.outcome : 'unsettled';
  s.retired = raw.retired === true; s.tug.status = raw.tug.status;
  s.revision = Math.min(1e9, Math.max(0, Math.floor(finite(raw.revision))));
  return s;
}
function restorePose(p) {
  if (p == null) return null;
  if (!point(p.pos) || !point(p.vel) || !Number.isFinite(p.hull) || p.hull < 0) throw new TypeError('Invalid Iona pose');
  return capturePose(p);
}
export function serializeIona(s) { return JSON.parse(JSON.stringify(s)); }
