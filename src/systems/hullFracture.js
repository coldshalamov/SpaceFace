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
// Same leak guard as the lethal-blow map below: a slammed ship that despawns never consumes
// its note, so victim keys would otherwise accumulate without bound across a long session.
export const PENDING_SLAM_KEY_CAP = 512;
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

// Stale notes past the freshness window can never satisfy consumePendingSlamIfFresh again, and
// while they linger they only suppress the arena shard they were supposed to yield — so insert
// time prunes them, keyed off the incoming note's own tick (deterministic, no wall clock).
function pruneStalePendingSlams(nowTick) {
  // Deleting during Map iteration is spec-safe: a deleted entry is simply not visited again.
  for (const [victimId, note] of pendingByVictimId) {
    if (Math.abs(nowTick - note.tick) > PENDING_SLAM_MAX_AGE_TICKS) pendingByVictimId.delete(victimId);
  }
}

export function notePendingSlam(target, slam = {}) {
  const closingSpeed = Number(slam.closingSpeed);
  if (!isSlamFractureCandidate(target, closingSpeed)) return false;
  const tick = Math.max(0, Math.trunc(finite(slam.tick)));
  pruneStalePendingSlams(tick);
  if (pendingByVictimId.size >= PENDING_SLAM_KEY_CAP) {
    const oldest = pendingByVictimId.keys().next();
    if (oldest && !oldest.done) pendingByVictimId.delete(oldest.value);
  }
  pendingByVictimId.set(target.id, {
    victimId: target.id,
    closingSpeed,
    tick,
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

function pieceSpec({ note, mass, radius, offset, seam, role, salvagePool, label, markerId, victimVisual, victimRadius, killedAt }) {
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
      // ANI-08: the victim's visual identity lets the render pass draw the spawned pieces as
      // authored fragments of the hull that died rather than generic aftermath debris.
      fractureVisual: victimVisual && typeof victimVisual === 'object' ? { ...victimVisual } : null,
      // The fragment GLBs are authored in intact-hull coordinates: the render pass fits each
      // piece to victimRadius x the fragment's authored share of that hull, not the mass-derived
      // collision radius (a 0.34-mass bow spans ~0.45 of hull length, not 0.70).
      fractureVictimRadius: Number.isFinite(victimRadius) && victimRadius > 0 ? victimRadius : null,
      // Kill-time stamp for the ember pass — without it the seam piece's torn edge stays cold
      // while the remainder flashes hot off its marker's killedAt.
      killedAt: Number.isFinite(killedAt) ? killedAt : 0,
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
    victimVisual: options.victimVisual,
    victimRadius: options.victimRadius,
    killedAt: Number(state.simTime) || 0,
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
    victimVisual: options.victimVisual,
    victimRadius: options.victimRadius,
    killedAt: Number(state.simTime) || 0,
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
    // The break voice. `hull:fractured` has no audioSystem subscriber of its own, so the seam
    // splitting a hull was a silent event; this is the existing authored brittle-fracture recipe
    // (audioSystem AUDIO_CUE_TO_RECIPE 'presentation.mining.fracture_break' ->
    // sfx_mining_fracture_break) that a world-site structural break already uses - a hull tearing
    // along a seam is that sound, not a combustion boom. No new recording, and the cue is world
    // scoped: gain scales down with distance so a far-away kill is felt, not heard in the ear.
    ctx.bus.emit('audio:cue', {
      id: 'presentation.mining.fracture_break',
      position: { x: note.pos.x, z: note.pos.z },
      gain: note.overkill === true ? 1 : 0.85,
    });
  }

  return { seam, pieces, hullClass: classId };
}

// --- Collision tear-off ----------------------------------------------------
// Sub-lethal hard contacts shed real plating shards as bounded debris bodies — not a second
// wreck, not a durable marker. Pieces inherit the struck hull's velocity plus a contact-axis
// fling, collide like ordinary debris, and die with the sector (homeSectorId ownership).
// collisionConsequences owns admission (damage applied, non-lethal, cooldowns, live cap);
// this file owns the body spec the same way it owns seam pieces.

const TEAROFF_PIECE_CAP = 2;
const TEAROFF_FLING_MIN = 8;
const TEAROFF_FLING_MAX = 42;
const TEAROFF_MASS_FRAC = 0.02;
const TEAROFF_RADIUS_MIN = 1.6;
const TEAROFF_RADIUS_MAX = 3.4;

function tearOffSpec({ note, dir, speed, mass, radius, sectorId }) {
  return {
    type: 'wreck',
    pos: { x: note.pos.x + dir.x * radius * 0.5, z: note.pos.z + dir.z * radius * 0.5 },
    vel: { x: note.vel.x + dir.x * speed, z: note.vel.z + dir.z * speed },
    angVel: note.angVel + (dir.x * 0.7 - dir.z * 0.7) * (2 + speed * 0.1),
    radius,
    mass,
    hull: 1,
    hullMax: 1,
    collides: true,
    physicsBody: wreckPhysicsBody(mass, radius),
    data: {
      parentType: 'ship',
      kind: 'wreck',
      label: 'Hull Debris',
      scanLabel: 'Hull Debris',
      name: 'Hull Debris',
      collisionTearOff: true,
      collisionTearOffOf: note.victimId != null ? note.victimId : null,
      homeSectorId: sectorId,
      persistenceOwner: 'collisionConsequences',
      proportions: WRECK_COLLIDER_PROPORTIONS,
      wreckClass: 'battlefield',
      loot: [],
      salvagePool: { cmdty_scrap_metal: 1 },
      salvageTimeLeft: 6,
    },
  };
}

export function spawnCollisionTearOff(ctx, note) {
  const state = ctx && ctx.state;
  const helpers = ctx && ctx.helpers;
  if (!state || !helpers || typeof helpers.spawnEntity !== 'function' || !note) return null;
  if (typeof state.rng !== 'function') return null;
  if (!note.pos || !Number.isFinite(note.pos.x) || !Number.isFinite(note.pos.z)) return null;
  const rng = state.rng;

  const victimMass = Math.max(0.1, finite(note.mass, 1));
  const victimRadius = Math.max(1, finite(note.radius, 7));
  // Solver normals are axes — the sign is a collider-order artifact — so a shard may leave on
  // either side of the contact axis; tangent spread keeps the spray off the contact line.
  const n = unitDir(note.normal);
  const tx = -n.z;
  const tz = n.x;
  const flingBase = TEAROFF_FLING_MIN + finite(note.closingSpeed, 0) * 0.18;
  const fling = Math.min(TEAROFF_FLING_MAX, Math.max(TEAROFF_FLING_MIN, flingBase));
  const count = Math.max(1, Math.min(TEAROFF_PIECE_CAP, Math.trunc(finite(note.count, 1))));
  const sectorId = note.sectorId != null
    ? note.sectorId
    : (state.world && state.world.currentSectorId) || null;

  const spawned = [];
  for (let i = 0; i < count; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const tangentJitter = (rng() - 0.5) * 1.4;
    const dir = unitDir({ x: n.x * side + tx * tangentJitter, z: n.z * side + tz * tangentJitter });
    const mass = Math.max(0.4, victimMass * TEAROFF_MASS_FRAC * (0.6 + rng() * 0.9));
    const radius = Math.min(TEAROFF_RADIUS_MAX,
      Math.max(TEAROFF_RADIUS_MIN, victimRadius * Math.cbrt(mass / victimMass)));
    const entity = helpers.spawnEntity(tearOffSpec({
      note, dir, speed: fling * (0.75 + rng() * 0.5), mass, radius, sectorId,
    }));
    if (entity) spawned.push(entity);
  }
  if (!spawned.length) return null;

  if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('collision:tearOff', {
      tick: Math.max(0, Math.trunc(finite(note.tick))),
      victimId: note.victimId,
      pieceIds: spawned.map((piece) => piece.id),
      pieceCount: spawned.length,
      pos: { x: note.pos.x, z: note.pos.z },
      momentum: finite(note.momentum, 0),
      closingSpeed: finite(note.closingSpeed, 0),
    });
    ctx.bus.emit('audio:cue', {
      id: 'sfx_hull_scrape',
      position: { x: note.pos.x, z: note.pos.z },
      gain: 0.55,
    });
  }
  return spawned;
}
