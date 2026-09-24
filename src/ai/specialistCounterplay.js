// PQ-140.02 specialist verbs. Ports are injected so the sim owners stay the single writers.
// The player must see the doctrine telegraph before the verb lands — cut after attach_window,
// disrupt after fire_window. Hostiles are not the Massline owner, so the cut uses
// breakAttachment (cut() would fail not_attachment_owner).
import { specialistPlanByEnemyId } from './specialistPlans.js';

const CUT_COOLDOWN_TICKS = 90;
const DISRUPT_COOLDOWN_TICKS = 120;
const CUT_PHASES = new Set(['attach_window']);
const DISRUPT_PHASES = new Set(['fire_window']);
const ANCHOR_RADIUS_WU = 235;
const WARD_ID = 'warden_escort';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function shipsOf(state) {
  if (!state) return [];
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

function enemyTypeId(entity) {
  const data = entity && entity.data;
  return (data && (data.lootTableId || data.enemyTypeId)) || null;
}

/** Distance from a point to the segment AB, in the XZ plane. */
export function pointSegmentDistance(point, a, b) {
  if (!point || !a || !b) return Infinity;
  const ax = finite(a.x);
  const az = finite(a.z);
  const bx = finite(b.x);
  const bz = finite(b.z);
  const px = finite(point.x);
  const pz = finite(point.z);
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-8) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

/**
 * The warden is the only specialist who stands on the shot. A hit aimed at a
 * packmate is taken by the escort when the escort's body is on that segment.
 * Cutters, disruptors, and anchors do not screen.
 */
export function wardScreenTarget(state, attacker, target, origin) {
  const kind = origin && origin.kind;
  if (kind !== 'weapon' && kind !== 'action') return null;
  if (!attacker || !target || attacker.id === target.id) return null;
  if (!attacker.pos || !target.pos) return null;
  if (target.type !== 'ship') return null;
  if (enemyTypeId(target) === WARD_ID) return null;
  let best = null;
  let bestDist = Infinity;
  for (const ent of shipsOf(state)) {
    if (!ent || ent.alive === false || !ent.pos || ent.id === target.id) continue;
    if (enemyTypeId(ent) !== WARD_ID) continue;
    if (target.team == null || ent.team !== target.team) continue;
    const radius = finite(ent.collisionRadius, 21) + 6;
    const dist = pointSegmentDistance(ent.pos, attacker.pos, target.pos);
    if (dist > radius || dist >= bestDist) continue;
    best = ent;
    bestDist = dist;
  }
  return best;
}

function distSq(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x || 0) - (b.x || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return dx * dx + dz * dz;
}

function specialistBreakLine(attachments, attachmentId, specialistId) {
  if (!attachments) return null;
  if (typeof attachments.breakAttachment === 'function') {
    return attachments.breakAttachment(attachmentId, 'specialist_cut', specialistId);
  }
  if (typeof attachments.cut === 'function') {
    return attachments.cut(attachmentId, null, 'specialist_cut');
  }
  return null;
}

export function applySpecialistCounterplay({
  state,
  specialist,
  enemyId,
  doctrinePhase,
  tick,
  attachments,
  fields,
}) {
  const id = enemyId
    || (specialist && specialist.data && (specialist.data.lootTableId || specialist.data.enemyTypeId))
    || null;
  const plan = specialistPlanByEnemyId(id);
  if (!plan || !specialist || specialist.alive === false) return null;
  const data = specialist.data || (specialist.data = {});
  const last = Number.isFinite(data._pq140LastVerbTick) ? data._pq140LastVerbTick : -Infinity;
  if (plan.verb === 'cut_line') {
    if (!CUT_PHASES.has(doctrinePhase)) return null;
    if (tick - last < CUT_COOLDOWN_TICKS) return null;
    const player = state && state.entities && state.entities.get && state.playerId != null
      ? state.entities.get(state.playerId)
      : null;
    if (!player) return null;
    const activeLine = attachments && typeof attachments.listForEntity === 'function'
      ? attachments.listForEntity(player.id).find((a) => a && a.id != null)
      : null;
    if (!activeLine) return null;
    const range = plan.cutRangeWu || 180;
    if (distSq(specialist.pos, player.pos) > range * range) return null;
    const result = specialistBreakLine(attachments, activeLine.id, specialist.id);
    if (result && result.ok) data._pq140LastVerbTick = tick;
    return result && result.ok ? { verb: 'cut_line', ok: true } : null;
  }
  if (plan.verb === 'disrupt_field') {
    if (!DISRUPT_PHASES.has(doctrinePhase)) return null;
    if (tick - last < DISRUPT_COOLDOWN_TICKS) return null;
    if (!fields || typeof fields.disruptNear !== 'function') return null;
    const range = plan.disruptRangeWu || 780;
    const n = fields.disruptNear(state, specialist.pos, range, specialist.id);
    if (n > 0) data._pq140LastVerbTick = tick;
    return n > 0 ? { verb: 'disrupt_field', ok: true, count: n } : null;
  }
  if (plan.verb === 'snare_field') {
    const player = state && state.entities && state.entities.get && state.playerId != null
      ? state.entities.get(state.playerId)
      : null;
    if (!player || !player.pos || !specialist.pos) return null;
    const anchor = specialist.data && specialist.data.fieldAnchor;
    const radius = finite(anchor && anchor.radius, ANCHOR_RADIUS_WU);
    if (distSq(specialist.pos, player.pos) > radius * radius) return null;
    return { verb: 'snare_field', ok: true, radius };
  }
  if (plan.verb === 'ward_screen') {
    const player = state && state.entities && state.entities.get && state.playerId != null
      ? state.entities.get(state.playerId)
      : null;
    if (!player) return null;
    for (const ent of shipsOf(state)) {
      if (!ent || ent.alive === false || ent.id === specialist.id || ent.id === player.id) continue;
      if (ent.team != null && specialist.team != null && ent.team !== specialist.team) continue;
      const blocked = wardScreenTarget(state, player, ent, { kind: 'weapon' });
      if (blocked && blocked.id === specialist.id) return { verb: 'ward_screen', ok: true, targetId: ent.id };
    }
    return null;
  }
  return null;
}
