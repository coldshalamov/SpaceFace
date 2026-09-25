// PQ-133.12 / PQ-175.01 — named library over the four live arena-law installers.
// Does not fork them. Each module is the same { phase, note, fields, mines, cover, toys } shape.
// Toys are usable: shutters cut lines, plates bank shots, crushers kill, relays conduct, currents carry.

import { TERRAIN_CRUMPLE_LAW } from '../combat/impulseKernel.js';
import { compileAttackSpec } from '../combat/attackSpec.js';
import { createLineage } from '../combat/attackLineage.js';
import { resolveRicochet } from '../combat/surfaceReflection.js';
import { surfaceContactFromBodies } from '../core/surfaceContact.js';
import { normalizeField, sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import {
  CINDER_ARENA_ID,
  CINDER_BOSS_ROLE,
  planCinderInstall,
} from '../systems/cinderSluiceArena.js';
import {
  CRYO_ARENA_ID,
  CRYO_BOSS_ROLE,
  planCryoInstall,
} from '../systems/cryoDriftArena.js';
import {
  LAGRANGE_ARENA_ID,
  LAGRANGE_BOSS_ROLE,
  planLagrangeInstall,
} from '../systems/lagrangeCrucible.js';
import {
  STORM_ARENA_ID,
  STORM_BOSS_ROLE,
  buildConductivityGraph,
  conductAlongGraph,
  createStormLineage,
  planStormInstall,
  stormGraphNodes,
} from '../systems/stormLatticeArena.js';
import { validateArenaModule } from '../contracts/contentFactory.js';

export const ARENA_TOY_KINDS = Object.freeze([
  'shutter', 'plate', 'crusher', 'relay', 'current', 'furnace', 'gate',
]);
export const ARENA_TOY_VERBS = Object.freeze({
  shutter: 'cut',
  plate: 'bank',
  crusher: 'kill',
  relay: 'conduct',
  current: 'carry',
  furnace: 'consume',
  // A gate is authored doorway geometry: it marks and blocks, it never acts — so it verbs nothing.
});
export const ARENA_TOY_HAZARDS = Object.freeze(['debris', 'debris_current', 'nebula']);
export const ARENA_TOY_MIN = 3;
export const ARENA_TOY_MAX = 12;
export const ARENA_TOY_DT = 1 / 60;
export const ARENA_TOY_LIGHT_MASS = 16;
export const ARENA_TOY_LIGHT_RADIUS = 6;
export const CRUSHER_CYCLE = Object.freeze({ warningS: 2, surgeS: 3.5, calmS: 6.5 });

export const ARENA_MODULE_LIBRARY = Object.freeze([
  Object.freeze({
    id: LAGRANGE_ARENA_ID,
    law: 'pull',
    bossRole: LAGRANGE_BOSS_ROLE,
    fieldBudget: 2,
    planInstall: planLagrangeInstall,
  }),
  Object.freeze({
    id: CINDER_ARENA_ID,
    law: 'current',
    bossRole: CINDER_BOSS_ROLE,
    fieldBudget: 2,
    planInstall: planCinderInstall,
  }),
  Object.freeze({
    id: CRYO_ARENA_ID,
    law: 'freeze',
    bossRole: CRYO_BOSS_ROLE,
    fieldBudget: 2,
    planInstall: planCryoInstall,
  }),
  Object.freeze({
    id: STORM_ARENA_ID,
    law: 'conduct',
    bossRole: STORM_BOSS_ROLE,
    fieldBudget: 2,
    planInstall: planStormInstall,
  }),
]);

export const ARENA_MODULE_BY_ID = Object.freeze(Object.fromEntries(
  ARENA_MODULE_LIBRARY.map((mod) => [mod.id, mod]),
));

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function vec(value, fallbackX = 0, fallbackZ = 0) {
  return {
    x: finite(value && value.x, fallbackX),
    z: finite(value && value.z, fallbackZ),
  };
}

function add(a, b) {
  return { x: finite(a && a.x) + finite(b && b.x), z: finite(a && a.z) + finite(b && b.z) };
}

function scale(a, s) {
  return { x: finite(a && a.x) * s, z: finite(a && a.z) * s };
}

function hypotOf(a) {
  return Math.hypot(finite(a && a.x), finite(a && a.z));
}

function norm(a) {
  const length = hypotOf(a);
  return length > 1e-9 ? { x: a.x / length, z: a.z / length } : { x: 1, z: 0 };
}

function perp(a) {
  return { x: -finite(a && a.z), z: finite(a && a.x) };
}

function mid(a, b) {
  return { x: (finite(a && a.x) + finite(b && b.x)) * 0.5, z: (finite(a && a.z) + finite(b && b.z)) * 0.5 };
}

function cross(ax, az, bx, bz) {
  return ax * bz - az * bx;
}

function segmentsIntersect(a1, a2, b1, b2) {
  const d1x = finite(a2 && a2.x) - finite(a1 && a1.x);
  const d1z = finite(a2 && a2.z) - finite(a1 && a1.z);
  const d2x = finite(b2 && b2.x) - finite(b1 && b1.x);
  const d2z = finite(b2 && b2.z) - finite(b1 && b1.z);
  const den = cross(d1x, d1z, d2x, d2z);
  if (Math.abs(den) < 1e-12) return false;
  const dx = finite(b1 && b1.x) - finite(a1 && a1.x);
  const dz = finite(b1 && b1.z) - finite(a1 && a1.z);
  const t = cross(dx, dz, d2x, d2z) / den;
  const u = cross(dx, dz, d1x, d1z) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function segmentHit(a1, a2, b1, b2) {
  const d1x = finite(a2 && a2.x) - finite(a1 && a1.x);
  const d1z = finite(a2 && a2.z) - finite(a1 && a1.z);
  const d2x = finite(b2 && b2.x) - finite(b1 && b1.x);
  const d2z = finite(b2 && b2.z) - finite(b1 && b1.z);
  const den = cross(d1x, d1z, d2x, d2z);
  if (Math.abs(den) < 1e-12) return null;
  const dx = finite(b1 && b1.x) - finite(a1 && a1.x);
  const dz = finite(b1 && b1.z) - finite(a1 && a1.z);
  const t = cross(dx, dz, d2x, d2z) / den;
  const u = cross(dx, dz, d1x, d1z) / den;
  if (!(t >= 0 && t <= 1 && u >= 0 && u <= 1)) return null;
  return { x: finite(a1 && a1.x) + d1x * t, z: finite(a1 && a1.z) + d1z * t, t };
}

function plateSegment(plate) {
  const n = norm(plate && plate.normal);
  const tangent = perp(n);
  const hw = Math.max(8, finite(plate && plate.halfWidth, 24));
  const pos = vec(plate && plate.pos);
  return {
    n,
    a: add(pos, scale(tangent, -hw)),
    b: add(pos, scale(tangent, hw)),
  };
}

function lightProfile(mass = ARENA_TOY_LIGHT_MASS) {
  return { mass, type: 'ship', fieldResponseMult: 1 };
}

function cycleOf(crusher) {
  const cycle = crusher && crusher.cycle ? crusher.cycle : CRUSHER_CYCLE;
  return {
    warningS: Math.max(0, finite(cycle.warningS, CRUSHER_CYCLE.warningS)),
    surgeS: Math.max(0, finite(cycle.surgeS, CRUSHER_CYCLE.surgeS)),
    calmS: Math.max(0, finite(cycle.calmS, CRUSHER_CYCLE.calmS)),
  };
}

export function listArenaToys(install) {
  return Array.isArray(install && install.toys) ? install.toys : [];
}

export function validateArenaToys(toys) {
  const issues = [];
  if (!Array.isArray(toys)) {
    return { ok: false, issues: [{ path: 'toys', rule: 'toys', message: 'toys must be an array' }] };
  }
  if (toys.length > ARENA_TOY_MAX) {
    issues.push({ path: 'toys', rule: 'budget', message: `at most ${ARENA_TOY_MAX} dynamic toys` });
  }
  const seen = new Set();
  for (let i = 0; i < toys.length; i++) {
    const toy = toys[i];
    const path = `toys[${i}]`;
    if (!toy || typeof toy !== 'object') {
      issues.push({ path, rule: 'type', message: 'toy must be an object' });
      continue;
    }
    if (typeof toy.id !== 'string' || toy.id.length === 0) {
      issues.push({ path: `${path}.id`, rule: 'id', message: 'id must be a non-empty string' });
    } else if (seen.has(toy.id)) {
      issues.push({ path: `${path}.id`, rule: 'id', message: `duplicate toy id ${toy.id}` });
    } else {
      seen.add(toy.id);
    }
    if (!ARENA_TOY_KINDS.includes(toy.kind)) {
      issues.push({
        path: `${path}.kind`,
        rule: 'kind',
        message: 'kind must be shutter, plate, crusher, relay, current, furnace, or gate',
      });
    }
    if (toy.hazardType === 'radiation') {
      issues.push({ path: `${path}.hazardType`, rule: 'hazard', message: 'hazard type radiation is forbidden' });
    } else if (!ARENA_TOY_HAZARDS.includes(toy.hazardType)) {
      issues.push({ path: `${path}.hazardType`, rule: 'hazard', message: 'hazard must be debris, debris_current, or nebula' });
    }
    const verb = ARENA_TOY_VERBS[toy.kind];
    if (verb && toy.verb !== verb) {
      issues.push({ path: `${path}.verb`, rule: 'verb', message: `${toy.kind} must verb ${verb}` });
    } else if (!verb && toy.verb != null) {
      // Verb-less kinds (gate) must stay verb-less: a doorway that claims an action is a lie.
      issues.push({ path: `${path}.verb`, rule: 'verb', message: `${toy.kind} carries no verb` });
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateArenaModuleLibrary(library = ARENA_MODULE_LIBRARY) {
  const issues = [];
  if (!Array.isArray(library) || library.length === 0) {
    return { ok: false, issues: [{ path: '', rule: 'library', message: 'library must be a non-empty array' }] };
  }
  for (let i = 0; i < library.length; i++) {
    const result = validateArenaModule(library[i]);
    if (!result.ok) {
      for (const item of result.issues) {
        issues.push({ ...item, path: `[${i}].${item.path}` });
      }
    }
    if (typeof library[i].planInstall === 'function') {
      try {
        const install = library[i].planInstall({
          arenaPhase: 'idle',
          at: { x: 0, z: 0 },
          lane: { x: 1, z: 0 },
          across: { x: 0, z: 1 },
        });
        const toys = listArenaToys(install);
        if (toys.length < ARENA_TOY_MIN) {
          issues.push({
            path: `[${i}].toys`,
            rule: 'toys.min',
            message: `${library[i].id} must author at least ${ARENA_TOY_MIN} toys`,
          });
        }
        const toyCheck = validateArenaToys(toys);
        if (!toyCheck.ok) {
          for (const item of toyCheck.issues) {
            issues.push({ ...item, path: `[${i}].${item.path}` });
          }
        }
      } catch (err) {
        issues.push({ path: `[${i}].planInstall`, rule: 'toys.throw', message: String(err && err.message) });
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

export function previewArenaModule(arenaId, arenaPhase = 'idle') {
  const mod = ARENA_MODULE_BY_ID[arenaId];
  if (!mod) {
    return { ok: false, issues: [{ path: 'id', rule: 'unknown', message: `unknown arena module ${arenaId}` }] };
  }
  const install = mod.planInstall({
    arenaPhase,
    at: { x: 0, z: 0 },
    lane: { x: 1, z: 0 },
    across: { x: 0, z: 1 },
    lean: { x: 1, z: 0 },
    spin: 0,
  });
  const toys = listArenaToys(install);
  return {
    ok: true,
    id: mod.id,
    law: mod.law,
    phase: install.phase,
    note: install.note,
    fieldCount: Array.isArray(install.fields) ? install.fields.length : 0,
    mineCount: Array.isArray(install.mines) ? install.mines.length : 0,
    cover: !!install.cover,
    toyCount: toys.length,
    toys,
    install,
  };
}

export function shutterCutsLine(shutter, from, to) {
  if (!shutter || shutter.kind !== 'shutter') return false;
  return segmentsIntersect(shutter.a, shutter.b, from, to);
}

/**
 * PQ-133.04 R3: plate bank acceptance is owned by the combat kernel (compiled AttackSpec +
 * lineage + a physics-issued surface receipt). This helper is a fail-closed GEOMETRY oracle for
 * authored plate layout — it never issues a receipt and never produces a velocity. A projectile
 * without an eligible bank-capable AttackSpec runtime is refused with 'no_spec'; an eligible one
 * gets contact geometry only, and the bounce itself belongs to resolveRicochet.
 */
export function bankShotOffPlate(plate, projectile) {
  if (!plate || plate.kind !== 'plate') return { ok: false, reason: 'no_plate' };
  if (!bankShotEligible(projectile)) return { ok: false, reason: 'no_spec' };
  const { n, a, b } = plateSegment(plate);
  const pos = vec(projectile && projectile.pos);
  const vel = vec(projectile && projectile.vel);
  const speed = hypotOf(vel);
  if (!(speed > 0)) return { ok: false, reason: 'no_velocity' };
  const look = add(pos, scale(norm(vel), 220));
  const hit = segmentHit(pos, look, a, b);
  if (!hit) return { ok: false, reason: 'miss' };
  return {
    ok: true,
    banked: true,
    point: { x: hit.x, z: hit.z },
    normal: n,
    material: typeof plate.material === 'string' && plate.material ? plate.material : 'plate',
    surfaceId: plate.id != null ? plate.id : null,
    projectileId: projectile && projectile.id != null ? projectile.id : null,
  };
}

/** An eligible bank runtime: a compiled spec that bounces, and a lineage with a bounce left. */
function bankShotEligible(projectile) {
  const spec = projectile && projectile.spec;
  const runtime = projectile && projectile.runtime;
  if (!spec || !runtime || typeof spec !== 'object' || typeof runtime !== 'object') return false;
  const bounces = spec.trajectory && spec.trajectory.bounces;
  if (!Number.isInteger(bounces) || bounces <= 0) return false;
  const remaining = runtime.remaining;
  return !!(remaining
    && Number.isInteger(remaining.bounces)
    && remaining.bounces > 0);
}

export function crusherPhase(crusher, elapsedS) {
  const cycle = cycleOf(crusher);
  const period = cycle.warningS + cycle.surgeS + cycle.calmS;
  const t = ((finite(elapsedS) % period) + period) % period;
  if (t < cycle.warningS) return { phase: 'warning', strength: 0, remainingS: cycle.warningS - t };
  if (t < cycle.warningS + cycle.surgeS) {
    return {
      phase: 'surge',
      strength: Math.max(0, finite(crusher && crusher.strength, 0)),
      remainingS: cycle.warningS + cycle.surgeS - t,
    };
  }
  return { phase: 'calm', strength: 0, remainingS: period - t };
}

export function stepCrusher(crusher, body, elapsedS, dt = ARENA_TOY_DT) {
  const clock = crusherPhase(crusher, elapsedS);
  const pos = vec(body && body.pos);
  const vel = vec(body && (body.vel || { x: body.vx, z: body.vz }));
  let ax = 0;
  let az = 0;
  if (clock.strength > 0) {
    const field = normalizeField({
      id: crusher && crusher.id ? String(crusher.id) : 'crusher',
      kind: crusher && crusher.fieldKind === 'sheet' ? 'sheet' : 'cone',
      center: vec(crusher && crusher.pos),
      dir: vec(crusher && crusher.dir, 1, 0),
      radius: Math.max(8, finite(crusher && crusher.radius, 72)),
      strength: clock.strength,
      falloff: Math.max(0.2, finite(crusher && crusher.falloff, 1.08)),
      halfAngleRad: Math.max(0.05, finite(crusher && crusher.halfAngleRad, 0.42)),
      edgeSoftRad: Math.max(0, finite(crusher && crusher.edgeSoftRad, 0.1)),
      halfWidth: Math.max(8, finite(crusher && crusher.halfWidth, 32)),
    });
    const acc = sampleFieldAcceleration(pos, vel, [field], elapsedS, lightProfile(finite(body && body.mass, ARENA_TOY_LIGHT_MASS)));
    ax = acc.ax;
    az = acc.az;
  }
  const step = Math.max(0, finite(dt, ARENA_TOY_DT));
  const vx = vel.x + ax * step;
  const vz = vel.z + az * step;
  const next = { x: pos.x + vx * step, z: pos.z + vz * step };
  const anvil = vec(crusher && crusher.anvil);
  const dist = Math.hypot(next.x - anvil.x, next.z - anvil.z);
  const speed = Math.hypot(vx, vz);
  const reach = Math.max(4, finite(crusher && crusher.anvilRadius, 22)) + Math.max(1, finite(body && body.radius, ARENA_TOY_LIGHT_RADIUS));
  const crushed = clock.phase === 'surge' && dist <= reach && speed >= TERRAIN_CRUMPLE_LAW.threshold;
  return { pos: next, vel: { x: vx, z: vz }, phase: clock.phase, speed, crushed, dist };
}

// ---------------------------------------------------------------------------------------------
// PQ-133.04 R3 Stage C — authored moving shutters. The Foundry room's shutters are dynamic
// physics bodies; the room may only command them through the SG-02 membrane
// (queuePhysicsImpulse / writePhysicsControl, consumed by sg02DynamicBodyOwner). These helpers
// carry the AUTHORitative pose/cycle math and stay pure like crusherPhase/stepCrusher: same
// shutter + same elapsed => same pose, same command, same jam verdict. No wall clock, no RNG.
// ---------------------------------------------------------------------------------------------

/** Warning/surge/calm shuttle, authored on the CRUSHER_CYCLE precedent. */
export const SHUTTER_CYCLE = Object.freeze({ warningS: 2, surgeS: 3.5, calmS: 6.5 });
/** How far the bar travels along dir during a surge, and the servo gains that drive it. */
export const SHUTTER_SURGE_DISTANCE = 96;
export const SHUTTER_SERVO = Object.freeze({ gainPos: 6, gainVel: 2.5, maxSpeed: 90 });
export const SHUTTER_MASS = 800;
/** Deterministic jam law: no fresh measured truth, or a surge that produces no measured
 * acceleration past a grace window, holds the shutter instead of pushing a welded body. */
export const SHUTTER_JAM = Object.freeze({ staleTicks: 45, accelEps: 0.05, graceS: 1 });

function shutterCycleOf(shutter) {
  const cycle = shutter && shutter.cycle ? shutter.cycle : SHUTTER_CYCLE;
  return {
    warningS: Math.max(0, finite(cycle.warningS, SHUTTER_CYCLE.warningS)),
    surgeS: Math.max(0, finite(cycle.surgeS, SHUTTER_CYCLE.surgeS)),
    calmS: Math.max(0, finite(cycle.calmS, SHUTTER_CYCLE.calmS)),
  };
}

/**
 * The authored clock: warning telegraphs at rest, surge drives out along dir, calm retracts.
 * Pure: phase, seconds elapsed inside the phase, seconds remaining, and the phase progress 0..1.
 */
export function shutterPhase(shutter, elapsedS) {
  const cycle = shutterCycleOf(shutter);
  const period = cycle.warningS + cycle.surgeS + cycle.calmS;
  const t = ((finite(elapsedS) % period) + period) % period;
  if (t < cycle.warningS) {
    return { phase: 'warning', phaseElapsedS: t, progress: 0, remainingS: cycle.warningS - t };
  }
  if (t < cycle.warningS + cycle.surgeS) {
    const inPhase = t - cycle.warningS;
    return {
      phase: 'surge',
      phaseElapsedS: inPhase,
      progress: cycle.surgeS > 0 ? inPhase / cycle.surgeS : 1,
      remainingS: cycle.warningS + cycle.surgeS - t,
    };
  }
  const inPhase = t - cycle.warningS - cycle.surgeS;
  return {
    phase: 'calm',
    phaseElapsedS: inPhase,
    progress: cycle.calmS > 0 ? inPhase / cycle.calmS : 1,
    remainingS: period - t,
  };
}

/** Surge offset along dir at a phase progress: out during surge, back during calm, rest otherwise. */
function shutterOffset(shutter, clock) {
  const distance = Math.max(0, finite(shutter && shutter.surgeDistance, SHUTTER_SURGE_DISTANCE));
  if (clock.phase === 'surge') return distance * clock.progress;
  if (clock.phase === 'calm') return distance * (1 - clock.progress);
  return 0;
}

/**
 * The authored pose of the whole bar at elapsedS: rest geometry translated along dir.
 * Continuous at every phase boundary, so the commanded motion never snaps.
 */
export function shutterPose(shutter, elapsedS) {
  const clock = shutterPhase(shutter, elapsedS);
  const dir = norm(shutter && shutter.dir);
  const offset = shutterOffset(shutter, clock);
  const shift = scale(dir, offset);
  return {
    phase: clock.phase,
    progress: clock.progress,
    pos: add(vec(shutter && shutter.pos), shift),
    a: add(vec(shutter && shutter.a), shift),
    b: add(vec(shutter && shutter.b), shift),
  };
}

/**
 * The membrane command that drives a dynamic shutter body toward the authored pose: a velocity
 * servo (force = mass * (gainPos * positionError + gainVel * velocityError)) — the room writes
 * this through writePhysicsControl; it never writes the body's motion itself.
 */
export function shutterCommand(shutter, elapsedS, body) {
  const clock = shutterPhase(shutter, elapsedS);
  const pose = shutterPose(shutter, elapsedS);
  const mass = Math.max(1, finite(body && body.mass, SHUTTER_MASS));
  const pos = vec(body && body.pos);
  const vel = vec(body && (body.vel || { x: body.vx, z: body.vz }));
  // Authored target velocity: the time derivative of the pose offset along dir.
  const cycle = shutterCycleOf(shutter);
  const distance = Math.max(0, finite(shutter && shutter.surgeDistance, SHUTTER_SURGE_DISTANCE));
  const rate = clock.phase === 'surge' && cycle.surgeS > 0
    ? distance / cycle.surgeS
    : (clock.phase === 'calm' && cycle.calmS > 0 ? -distance / cycle.calmS : 0);
  const dir = norm(shutter && shutter.dir);
  const gx = SHUTTER_SERVO.gainPos * (pose.pos.x - pos.x) + SHUTTER_SERVO.gainVel * (dir.x * rate - vel.x);
  const gz = SHUTTER_SERVO.gainPos * (pose.pos.z - pos.z) + SHUTTER_SERVO.gainVel * (dir.z * rate - vel.z);
  return {
    mode: `shutter_${clock.phase}`,
    phase: clock.phase,
    force: { x: mass * gx, z: mass * gz },
    targetPos: pose.pos,
    targetVel: { x: dir.x * rate, z: dir.z * rate },
  };
}

/**
 * Deterministic jam verdict from MEASURED truth only: telemetry missing or staler than
 * SHUTTER_JAM.staleTicks is a hold; a surge that has produced no measured acceleration past the
 * grace window is a welded body — hold it. Same inputs => same verdict, forever.
 */
export function shutterJammed(telemetry, context = {}) {
  if (!telemetry || typeof telemetry !== 'object') return true;
  const tick = Number.isInteger(context.tick) ? context.tick : null;
  if (tick != null && Number.isInteger(telemetry.tick)
    && telemetry.tick + SHUTTER_JAM.staleTicks < tick) return true;
  if (context.phase === 'surge'
    && Number.isFinite(context.phaseElapsedS)
    && context.phaseElapsedS > SHUTTER_JAM.graceS) {
    const accel = telemetry.linearAcceleration;
    const magnitude = Math.hypot(finite(accel && accel.x), finite(accel && accel.z));
    if (!(magnitude >= SHUTTER_JAM.accelEps)) return true;
  }
  return false;
}

export function currentCarry(current, body) {
  if (!current || current.kind !== 'current') return { ax: 0, az: 0 };
  const field = normalizeField({
    id: current.id ? String(current.id) : 'current',
    kind: 'cone',
    center: vec(current.center || current.pos),
    dir: vec(current.dir, 1, 0),
    radius: Math.max(8, finite(current.radius, 120)),
    strength: Math.max(0, finite(current.strength, 0)),
    falloff: Math.max(0.2, finite(current.falloff, 1.15)),
    halfAngleRad: Math.max(0.05, finite(current.halfAngleRad, 0.32)),
    edgeSoftRad: Math.max(0, finite(current.edgeSoftRad, 0.12)),
  });
  return sampleFieldAcceleration(
    vec(body && body.pos),
    vec(body && (body.vel || { x: body.vx, z: body.vz })),
    [field],
    0,
    lightProfile(finite(body && body.mass, ARENA_TOY_LIGHT_MASS)),
  );
}

function proveShutter(toy) {
  const a = vec(toy.a);
  const b = vec(toy.b);
  const center = mid(a, b);
  const n = norm(perp({ x: b.x - a.x, z: b.z - a.z }));
  const from = add(center, scale(n, 40));
  const to = add(center, scale(n, -40));
  const cut = shutterCutsLine(toy, from, to);
  const miss = shutterCutsLine(toy, add(from, scale(norm({ x: b.x - a.x, z: b.z - a.z }), 80)), add(to, scale(norm({ x: b.x - a.x, z: b.z - a.z }), 80)));
  return { cut, miss: !!miss, escaped: cut && !miss, from, to };
}

let _bankProofSpec = null;

/** The compiled bank-capable AttackSpec the plate proofs ride on (cached; compile is pure). */
function bankProofSpec() {
  if (_bankProofSpec) return _bankProofSpec;
  const result = compileAttackSpec({
    weaponId: 'wpn_pulse_laser_s',
    modifiers: [['mod_bank_shot', 1]],
  });
  if (!result || result.ok !== true) throw new Error('bank proof spec failed to compile');
  _bankProofSpec = result.spec;
  return _bankProofSpec;
}

/**
 * PQ-133.04 R3: plate acceptance runs through the kernel path — compiled bank spec + lineage +
 * a physics-shaped receipt from surfaceContactFromBodies + resolveRicochet. No fabricated
 * receipt, no helper-side reflection: if the kernel refuses, the plate is not bankable.
 */
function provePlate(toy) {
  const n = norm(toy.normal);
  const tangent = perp(n);
  const from = add(vec(toy.pos), add(scale(n, 36), scale(tangent, -36)));
  const vel = add(scale(n, -90), scale(tangent, 45));
  const spec = bankProofSpec();
  const runtime = createLineage({ spec });
  const body = { id: 'bank_shot', type: 'projectile', alive: true, radius: 0.7, pos: { ...from }, vel: { ...vel } };
  const geometry = bankShotOffPlate(toy, {
    id: 'bank_shot', type: 'projectile', spec, runtime, pos: { ...from }, vel: { ...vel },
  });
  if (!geometry.ok) return { banked: false, killed: false, reason: geometry.reason };
  const surface = {
    id: toy.id != null ? toy.id : 'plate',
    pos: vec(toy.pos),
    vel: { x: 0, z: 0 },
    angVel: 0,
    surfaceMaterial: typeof toy.material === 'string' && toy.material ? toy.material : 'plate',
  };
  const receipt = surfaceContactFromBodies(body, surface, {
    point: geometry.point,
    normal: geometry.normal,
    material: surface.surfaceMaterial,
    velocity: vel,
  }, 0);
  const result = resolveRicochet(runtime, spec, receipt, body);
  if (!result.ok || result.consume) {
    return { banked: true, killed: false, reflected: false, reason: result.reason || 'refused' };
  }
  const outgoing = result.velocity;
  const target = add(geometry.point, scale(norm(outgoing), 40));
  const straight = add(from, scale(norm(vel), 80));
  const missWithout = Math.hypot(straight.x - target.x, straight.z - target.z) > 18;
  return { banked: true, killed: missWithout, reflected: true, target, from, vel: outgoing };
}

function integrateCrusher(toy, elapsed0, ticks) {
  let body = {
    pos: add(vec(toy.pos), scale(norm(toy.dir), 4)),
    vel: { x: 0, z: 0 },
    mass: ARENA_TOY_LIGHT_MASS,
    radius: ARENA_TOY_LIGHT_RADIUS,
  };
  let last = null;
  for (let i = 0; i < ticks; i++) {
    last = stepCrusher(toy, body, elapsed0 + i * ARENA_TOY_DT, ARENA_TOY_DT);
    body = { ...body, pos: last.pos, vel: last.vel };
    if (last.crushed) return { ...last, ticks: i + 1 };
  }
  return { ...(last || { crushed: false, speed: 0, phase: 'calm' }), ticks };
}

function proveCrusher(toy) {
  const cycle = cycleOf(toy);
  const surge = integrateCrusher(toy, cycle.warningS + 0.2, 210);
  const calm = integrateCrusher(toy, cycle.warningS + cycle.surgeS + 0.2, 120);
  return {
    surgeKilled: !!surge.crushed,
    surgeSpeed: surge.speed,
    surgePhase: surge.phase,
    surgeTicks: surge.ticks,
    calmKilled: !!calm.crushed,
    calmSpeed: calm.speed,
    killed: !!surge.crushed && !calm.crushed,
  };
}

function proveCurrent(toy, toys) {
  const dir = norm(toy.dir);
  const start = add(vec(toy.center || toy.pos), scale(dir, 8));
  const acc = currentCarry(toy, { pos: start, vel: { x: 0, z: 0 }, mass: ARENA_TOY_LIGHT_MASS });
  const along = acc.ax * dir.x + acc.az * dir.z;
  let pos = start;
  let vel = { x: 0, z: 0 };
  for (let i = 0; i < 120; i++) {
    const step = currentCarry(toy, { pos, vel, mass: ARENA_TOY_LIGHT_MASS });
    vel = { x: vel.x + step.ax * ARENA_TOY_DT, z: vel.z + step.az * ARENA_TOY_DT };
    pos = { x: pos.x + vel.x * ARENA_TOY_DT, z: pos.z + vel.z * ARENA_TOY_DT };
  }
  const carried = (pos.x - start.x) * dir.x + (pos.z - start.z) * dir.z;
  const crusher = (toys || []).find((row) => row && row.kind === 'crusher');
  let fed = false;
  if (crusher) {
    const before = Math.hypot(start.x - crusher.pos.x, start.z - crusher.pos.z);
    const after = Math.hypot(pos.x - crusher.pos.x, pos.z - crusher.pos.z);
    fed = after + 8 < before;
  }
  return { carried, along, fed, killed: fed && along > 1 };
}

function proveRelay(install, toy) {
  const at = vec(install && install.at);
  const extras = [{
    id: 'wasp',
    kind: 'hostile',
    conductive: true,
    score: 4,
    pos: add(vec(toy.pos), { x: 42, z: 0 }),
  }];
  const nodes = stormGraphNodes(at, 0, extras);
  const graph = buildConductivityGraph(nodes, { at });
  const walk = conductAlongGraph(graph, toy.id, createStormLineage({ lineageProcBudget: 16, tick: 0 }));
  const reached = walk.hops.some((hop) => hop.toId === 'wasp' || hop.fromId === toy.id);
  const usedRelay = walk.hops.some((hop) => String(hop.fromId).startsWith('relay') || String(hop.toId).startsWith('relay'));
  return {
    hops: walk.hops.length,
    reached: reached || usedRelay,
    killed: walk.hops.length >= 1 && (reached || usedRelay),
  };
}

export function playArenaToyScenario(arenaId, seed = 17510) {
  const preview = previewArenaModule(arenaId, 'idle');
  const install = preview.install || {};
  const toys = listArenaToys(install);
  const proofs = [];
  let killed = 0;
  let escaped = 0;
  const used = [];
  for (let i = 0; i < toys.length; i++) {
    const toy = toys[i];
    let proof;
    if (toy.kind === 'shutter') {
      proof = proveShutter(toy);
      if (proof.escaped) escaped += 1;
    } else if (toy.kind === 'plate') {
      proof = provePlate(toy);
      if (proof.killed) killed += 1;
    } else if (toy.kind === 'crusher') {
      proof = proveCrusher(toy);
      if (proof.killed) killed += 1;
    } else if (toy.kind === 'current') {
      proof = proveCurrent(toy, toys);
      if (proof.killed) killed += 1;
    } else if (toy.kind === 'relay') {
      proof = proveRelay(install, toy);
      if (proof.killed) killed += 1;
    } else {
      proof = { skipped: true };
    }
    used.push(toy.id);
    proofs.push({ id: toy.id, kind: toy.kind, verb: toy.verb, hazardType: toy.hazardType, ...proof });
  }
  const hazards = toys.map((toy) => toy.hazardType);
  return {
    ok: used.length >= ARENA_TOY_MIN && (killed > 0 || escaped > 0) && !hazards.includes('radiation'),
    arenaId,
    seed,
    law: preview.law,
    used,
    killed,
    escaped,
    toyCount: toys.length,
    hazards,
    proofs,
  };
}
