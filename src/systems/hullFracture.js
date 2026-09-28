// PQ-154.00 — authored-seam hull fracture on wrecking-ball slams.
//
// collisionConsequences is the slam owner: it reads `physics:impact.preSolveClosingSpeed`.
// A closing-speed note is taken before impact damage routes so mining can yield the single-wreck
// spawn to two wreck pieces along one catalog seam. Not a general destruction solver.

import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import {
  fractureThresholdWU,
  hullClassForMass,
  OVERKILL_BLOW_MULT,
  OVERKILL_HULL_FRAC,
  OVERKILL_ORIGIN_KINDS,
  seamFor,
} from '../data/hullFractureSeams.js';

export { fractureThresholdWU, hullClassForMass, seamFor };

const pendingByVictimId = new Map();
// Last gun/bomb/mine blow per victim, fed from `combat:damage` (allowed-file plumbing:
// combat.js `entity:killed` carries no hull/overkill/origin fields, and damage.js clamps
// post-kill hull to zero, so depth must come from before.hull + the raw blow).
const lethalBlowByVictimId = new Map();
// Stale slam notes must not suppress the arena shard forever: aftermathWrecks (read-only)
// skips its shard while peekPendingSlam(victimId) is truthy, so a note whose kill never
// lands in-window has to age out instead of lingering.
export const PENDING_SLAM_MAX_AGE_TICKS = 12;
export const LETHAL_BLOW_MAX_AGE_TICKS = 2;
const LETHAL_BLOW_KEY_CAP = 512;
const FRACTURE_SPLIT_SPEED = 12;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function closingSpeedFromImpact(payload) {
  const closing = Number(payload && payload.preSolveClosingSpeed);
  return Number.isFinite(closing) ? closing : NaN;
}

export function isSlamFractureCandidate(target, closingSpeed) {
  if (!target || target.type !== 'ship' || target.alive === false) return false;
  return Number.isFinite(closingSpeed) && closingSpeed >= fractureThresholdWU;
}

export function notePendingSlam(target, slam = {}) {
  const closingSpeed = Number(slam.closingSpeed);
  if (!isSlamFractureCandidate(target, closingSpeed)) return false;
  pendingByVictimId.set(target.id, {
    victimId: target.id,
    closingSpeed,
    tick: Math.max(0, Math.trunc(finite(slam.tick))),
    pos: {
      x: finite(target.pos && target.pos.x),
      z: finite(target.pos && target.pos.z),
    },
    vel: {
      x: finite(target.vel && target.vel.x),
      z: finite(target.vel && target.vel.z),
    },
    angVel: finite(target.angVel),
    mass: Math.max(0.1, finite(target.mass, 1)),
    radius: Math.max(1, finite(target.radius, 7)),
  });
  return true;
}

export function peekPendingSlam(victimId) {
  return victimId == null ? null : pendingByVictimId.get(victimId) || null;
}

export function consumePendingSlam(victimId) {
  if (victimId == null) return null;
  const note = pendingByVictimId.get(victimId) || null;
  pendingByVictimId.delete(victimId);
  return note;
}

// Fresh-consume: a slam note is only good for the kill tick it was taken on
// (±PENDING_SLAM_MAX_AGE_TICKS). When the victim survives or the kill arrives
// later (stale note), drop the note and report null so the arena shard path
// stops being suppressed — a stale note must never eat a shard.
export function consumePendingSlamIfFresh(victimId, tick, maxAgeTicks = PENDING_SLAM_MAX_AGE_TICKS) {
  if (victimId == null) return null;
  const note = pendingByVictimId.get(victimId) || null;
  pendingByVictimId.delete(victimId);
  if (!note) return null;
  const now = Math.max(0, Math.trunc(finite(tick, note.tick)));
  const then = Math.max(0, Math.trunc(finite(note.tick)));
  const maxAge = Math.max(0, Math.trunc(finite(maxAgeTicks, PENDING_SLAM_MAX_AGE_TICKS)));
  return Math.abs(now - then) <= maxAge ? note : null;
}

export function clearPendingSlam(victimId) {
  if (victimId != null) pendingByVictimId.delete(victimId);
}

export function resetPendingSlams() {
  pendingByVictimId.clear();
  lethalBlowByVictimId.clear();
}

// Gun/bomb/mine overkill plumbing. damage.js clamps target.hull at zero, so the
// kill receipt cannot tell a graze from a hull driven deep past zero — remember
// the last authored blow's raw depth here (from `combat:damage` before/after)
// and let the kill path below score it against the shared seam catalog.
export function noteLethalBlow(targetId, blow = {}) {
  if (targetId == null) return false;
  const hullBefore = Number(blow.hullBefore);
  const hullMax = Number(blow.hullMax);
  const rawBlow = Number(blow.rawBlow);
  if (!(hullMax > 0) || !Number.isFinite(hullBefore) || !(rawBlow > 0)) return false;
  if (lethalBlowByVictimId.size >= LETHAL_BLOW_KEY_CAP) {
    const oldest = lethalBlowByVictimId.keys().next();
    if (oldest && !oldest.done) lethalBlowByVictimId.delete(oldest.value);
  }
  lethalBlowByVictimId.set(targetId, {
    victimId: targetId,
    hullBefore,
    hullMax,
    rawBlow,
    originKind: typeof blow.originKind === 'string' ? blow.originKind : null,
    tick: Math.max(0, Math.trunc(finite(blow.tick))),
  });
  return true;
}

export function consumeLethalBlow(victimId, tick, maxAgeTicks = LETHAL_BLOW_MAX_AGE_TICKS) {
  if (victimId == null) return null;
  const blow = lethalBlowByVictimId.get(victimId) || null;
  lethalBlowByVictimId.delete(victimId);
  if (!blow) return null;
  const now = Math.max(0, Math.trunc(finite(tick, blow.tick)));
  const then = Math.max(0, Math.trunc(finite(blow.tick)));
  const maxAge = Math.max(0, Math.trunc(finite(maxAgeTicks, LETHAL_BLOW_MAX_AGE_TICKS)));
  return Math.abs(now - then) <= maxAge ? blow : null;
}

// Overkill fracture eligibility: hull driven deep past zero
// (hullAfter ≈ before - blow <= -0.5 * hullMax) or the killing blow itself is
// massive (blow >= 2 * hullMax). Slam threshold (30) stays untouched.
export function isOverkillFractureCandidate(blow) {
  if (!blow) return false;
  if (!OVERKILL_ORIGIN_KINDS.includes(blow.originKind)) return false;
  if (!(blow.hullMax > 0) || !(blow.rawBlow > 0)) return false;
  const hullAfter = blow.hullBefore - blow.rawBlow;
  if (hullAfter <= -OVERKILL_HULL_FRAC * blow.hullMax) return true;
  return blow.rawBlow >= OVERKILL_BLOW_MULT * blow.hullMax;
}

export function overkillNoteForKill({ victim, blow } = {}) {
  // Victim is already dead when entity:killed fires (alive === false) — the
  // snapshot still carries pos/vel/mass/radius, which is all the seam split
  // needs. Only the hull class matters here, never liveness.
  if (!victim || victim.type !== 'ship') return null;
  if (!isOverkillFractureCandidate(blow)) return null;
  return {
    victimId: victim.id,
    closingSpeed: NaN,
    overkill: true,
    originKind: blow.originKind,
    blow: blow.rawBlow,
    tick: Math.max(0, Math.trunc(finite(blow.tick))),
    pos: {
      x: finite(victim.pos && victim.pos.x),
      z: finite(victim.pos && victim.pos.z),
    },
    vel: {
      x: finite(victim.vel && victim.vel.x),
      z: finite(victim.vel && victim.vel.z),
    },
    angVel: finite(victim.angVel),
    mass: Math.max(0.1, finite(victim.mass, 1)),
    radius: Math.max(1, finite(victim.radius, 7)),
  };
}

function unitDir(dir) {
  const x = finite(dir && dir.x);
  const z = finite(dir && dir.z);
  const length = Math.hypot(x, z);
  return length > 1e-9 ? { x: x / length, z: z / length } : { x: 0, z: -1 };
}

function wreckPhysicsBody(mass, radius) {
  return {
    schemaVersion: 1,
    shape: 'capsule',
    radius,
    mass,
    inertiaY: 0.5 * mass * radius * radius,
    dynamic: true,
    ccd: false,
    material: 'debris',
    revision: 0,
  };
}

function pieceSpec({ note, mass, radius, offset, seam, role, salvagePool, label, markerId }) {
  return {
    type: 'wreck',
    pos: { x: note.pos.x + offset.x, z: note.pos.z + offset.z },
    vel: { x: note.vel.x, z: note.vel.z },
    angVel: note.angVel,
    radius,
    mass,
    hull: 1,
    hullMax: 1,
    collides: true,
    physicsBody: wreckPhysicsBody(mass, radius),
    data: {
      parentType: 'ship',
      kind: 'wreck',
      label,
      scanLabel: label,
      name: label,
      fractureSeamId: seam.id,
      fracturePiece: role,
      // The shard correlator consumers read alongside markerId/provenance:
      // the seam offcut keeps pointing at the remainder's durable marker.
      // bindAftermath's identity merge (aftermathWrecks, read-only) assigns
      // marker/provenance onto the remainder only — this stamp must survive
      // it, so the stranded seam piece still names its marker.
      fractureOf: markerId != null ? markerId : null,
      proportions: WRECK_COLLIDER_PROPORTIONS,
      loot: [],
      salvagePool: salvagePool || { cmdty_scrap_metal: 1 },
      salvageTimeLeft: 6,
    },
  };
}

export function spawnFracturePieces(ctx, note, options = {}) {
  const state = ctx && ctx.state;
  const helpers = ctx && ctx.helpers;
  if (!state || !helpers || typeof helpers.spawnEntity !== 'function' || !note) return null;
  if (typeof state.rng !== 'function') return null;

  const classId = hullClassForMass(note.mass);
  const seam = seamFor(classId, state.rng);
  if (!seam) return null;

  const markerId = options.markerId != null ? options.markerId
    : note.markerId != null ? note.markerId : null;
  const dir = unitDir(seam.impulseDir);
  const seamMass = Math.max(0.1, note.mass * finite(seam.massFrac, 0.34));
  const remMass = Math.max(0.1, note.mass - seamMass);
  const hullMass = Math.max(note.mass, seamMass + remMass);
  const seamRadius = Math.max(2, note.radius * Math.cbrt(seamMass / hullMass));
  const remRadius = Math.max(2, note.radius * Math.cbrt(remMass / hullMass));
  const split = Math.max(2, note.radius * 0.35);
  const salvagePool = options.salvagePool && typeof options.salvagePool === 'object'
    ? options.salvagePool
    : { cmdty_scrap_metal: 2 };

  const seamEntity = helpers.spawnEntity(pieceSpec({
    note,
    mass: seamMass,
    radius: seamRadius,
    offset: { x: dir.x * split, z: dir.z * split },
    seam,
    role: 'seam',
    salvagePool: { cmdty_scrap_metal: 1 },
    label: seam.label || 'Hull Fragment',
    markerId,
  }));
  const remEntity = helpers.spawnEntity(pieceSpec({
    note,
    mass: remMass,
    radius: remRadius,
    offset: { x: -dir.x * split, z: -dir.z * split },
    seam,
    role: 'remainder',
    salvagePool,
    label: 'Salvage Wreck',
    markerId,
  }));

  const pieces = [seamEntity, remEntity].filter(Boolean);
  for (const piece of pieces) {
    const sign = piece.data && piece.data.fracturePiece === 'remainder' ? -1 : 1;
    const mag = Math.max(0.1, finite(piece.mass, 1)) * FRACTURE_SPLIT_SPEED;
    queuePhysicsImpulse(piece, { x: dir.x * mag * sign, y: 0, z: dir.z * mag * sign });
  }

  if (typeof options.bindAftermath === 'function' && remEntity) {
    options.bindAftermath(remEntity);
  }

  if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('hull:fractured', {
      victimId: note.victimId,
      seamId: seam.id,
      hullClass: classId,
      closingSpeed: note.closingSpeed,
      overkill: note.overkill === true,
      originKind: typeof note.originKind === 'string' ? note.originKind : null,
      pieceIds: pieces.map((piece) => piece.id),
      pieceCount: pieces.length,
    });
  }

  return { seam, pieces, hullClass: classId };
}
