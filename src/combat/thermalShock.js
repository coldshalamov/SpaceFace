// Thermal Shock (PQ-133.06 / CRU-041).
// Heat meeting Cryo Lock: consume the freeze, reduce burn, bounded impulse, subsystem pulse.
// Impulse adds to velocity. It never zeroes the body first.

import { PROC_COSTS, tryConsumeProc } from './attackLineage.js';
import { selectTargets } from './attackTargeting.js';
import { CRYO_LOCK_STATUS_ID, hasCryoLock } from './cryoLock.js';

export const BURNING_STATUS_ID = 'status_burning';
export const THERMAL_SHOCK_IMPULSE = 80;
export const THERMAL_SHOCK_SUBSYSTEM = 'drive';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function statusList(value) {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === 'object') return Object.keys(value).filter((key) => value[key]);
  return [];
}

export function thermalShockEligible(statusIds) {
  const list = statusList(statusIds);
  return hasCryoLock(list) && list.includes(BURNING_STATUS_ID);
}

function dropStatus(list, statusId) {
  return list.filter((id) => id !== statusId);
}

function reduceBurning(list) {
  const out = [];
  let dropped = false;
  for (let i = 0; i < list.length; i++) {
    if (!dropped && list[i] === BURNING_STATUS_ID) {
      dropped = true;
      continue;
    }
    out.push(list[i]);
  }
  return { statuses: out, reduced: dropped };
}

function impulseDelta(target, sourcePos) {
  const tx = finite(target && target.pos && target.pos.x, finite(target && target.x));
  const tz = finite(target && target.pos && target.pos.z, finite(target && target.z));
  let dx = tx - finite(sourcePos && sourcePos.x);
  let dz = tz - finite(sourcePos && sourcePos.z);
  let len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    dx = finite(target && target.vx);
    dz = finite(target && target.vz);
    len = Math.hypot(dx, dz);
  }
  if (len < 1e-6) {
    dx = 1;
    dz = 0;
    len = 1;
  }
  const k = THERMAL_SHOCK_IMPULSE / len;
  return { x: dx * k, z: dz * k };
}

/**
 * Resolve Thermal Shock on one target. Pays the shared reaction proc when a lineage is supplied.
 */
export function resolveThermalShock(target, options = {}) {
  const statuses = statusList(target && target.statuses);
  if (!thermalShockEligible(statuses)) {
    return { ok: false, reason: 'not_eligible', statuses };
  }
  const lineage = options.lineage || null;
  if (lineage) {
    const paid = tryConsumeProc(lineage, PROC_COSTS.statusReactionChild, 'thermal_shock');
    if (!paid.ok) {
      return { ok: false, reason: paid.reason || 'proc_budget', suppressed: true, statuses };
    }
  }
  const withoutCryo = dropStatus(statuses, CRYO_LOCK_STATUS_ID);
  const burned = reduceBurning(withoutCryo);
  const kick = impulseDelta(target, options.sourcePos || { x: 0, z: 0 });
  return {
    ok: true,
    targetId: target && target.id != null ? target.id : null,
    vx: finite(target && target.vx) + kick.x,
    vz: finite(target && target.vz) + kick.z,
    impulse: kick,
    statuses: burned.statuses,
    consumed: [CRYO_LOCK_STATUS_ID, BURNING_STATUS_ID],
    subsystemPulse: { id: THERMAL_SHOCK_SUBSYSTEM, pulse: 1 },
    controlScale: 1,
  };
}

/**
 * Resolve every eligible body in score / distance / id order. Never insertion order.
 */
export function resolveThermalShockField(targets, options = {}) {
  const list = Array.isArray(targets) ? targets : [];
  const eligible = [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || row.id == null) continue;
    if (!thermalShockEligible(row.statuses)) continue;
    eligible.push({
      id: row.id,
      pos: row.pos || { x: finite(row.x), z: finite(row.z) },
      score: Number.isFinite(row.score) ? row.score : 0,
      statuses: statusList(row.statuses),
      valid: row.valid !== false,
      vx: finite(row.vx),
      vz: finite(row.vz),
    });
  }
  const ordered = selectTargets(eligible, {
    count: Math.max(1, eligible.length),
    sourcePos: options.sourcePos || { x: 0, z: 0 },
  });
  const shocks = [];
  const suppressed = [];
  for (let i = 0; i < ordered.length; i++) {
    const result = resolveThermalShock(ordered[i], options);
    if (result.ok) shocks.push(result);
    else suppressed.push({ id: ordered[i].id, reason: result.reason });
  }
  return { shocks, suppressed };
}
