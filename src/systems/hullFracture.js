// PQ-154.00 — authored-seam hull fracture on wrecking-ball slams.
//
// collisionConsequences is the slam owner: it reads `physics:impact.preSolveClosingSpeed`.
// A closing-speed note is taken before impact damage routes so mining can yield the single-wreck
// spawn to two wreck pieces along one catalog seam. Not a general destruction solver.

import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import {
  fractureThresholdWU,
  hullClassForMass,
  seamFor,
} from '../data/hullFractureSeams.js';

export { fractureThresholdWU, hullClassForMass, seamFor };

const pendingByVictimId = new Map();
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

export function clearPendingSlam(victimId) {
  if (victimId != null) pendingByVictimId.delete(victimId);
}

export function resetPendingSlams() {
  pendingByVictimId.clear();
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
    radius,
    mass,
    inertiaY: 0.5 * mass * radius * radius,
    dynamic: true,
    ccd: false,
    material: 'debris',
    revision: 0,
  };
}

function pieceSpec({ note, mass, radius, offset, seam, role, salvagePool, label }) {
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
      pieceIds: pieces.map((piece) => piece.id),
      pieceCount: pieces.length,
    });
  }

  return { seam, pieces, hullClass: classId };
}
