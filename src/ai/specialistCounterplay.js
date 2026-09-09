// PQ-140.02 specialist verbs. Ports are injected so the sim owners stay the single writers.
// The player must see the doctrine telegraph before the verb lands — cut after attach_window,
// disrupt after fire_window. Hostiles are not the Massline owner, so the cut uses
// breakAttachment (cut() would fail not_attachment_owner).
import { specialistPlanByEnemyId } from './specialistPlans.js';

const CUT_COOLDOWN_TICKS = 90;
const DISRUPT_COOLDOWN_TICKS = 120;
const CUT_PHASES = new Set(['attach_window']);
const DISRUPT_PHASES = new Set(['fire_window']);

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
    const tether = state && state.player && state.player.tether;
    if (!tether || tether.active !== true || tether.attachmentId == null) return null;
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    const range = plan.cutRangeWu || 180;
    if (distSq(specialist.pos, player && player.pos) > range * range) return null;
    const result = specialistBreakLine(attachments, tether.attachmentId, specialist.id);
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
  return null;
}
