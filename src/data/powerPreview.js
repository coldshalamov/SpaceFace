// Row 493 (CRAFT-POWERS): the held-key preview. While a power's key is held, every body that
// letting go will move is outlined in the power's colour, with its predicted path; the shapes the
// power makes (a well ring, a blast ring, a throw line) are drawn with it. This module resolves
// that truth; src/render/powerPreview.js draws it.
//
// Faithful by construction (05_ASSET_ROSTER §7.2): every placement comes from the owner's own
// exported rule (the press and this preview call the same function), every force from the owner's
// own law — the field kernel's sampler behind production's velocity gate and wind-up, the charge's
// linear blast falloff, the bomb's surface falloff and drift integrator. Only what the release
// itself moves is outlined: Pin and the sticky charge set something up and get shapes, not outlines.
//
// Read-only: nothing here writes state. Body queries run with promote:false, the fields it moves
// are private copies, and the held power is read through powerVerbs.heldPower (a WeakMap, never
// state), so holding a key cannot change the simulation.
import { FIELD_DEFS, FIELD_COUPLING, fieldsFlag } from './fields.js';
import { BOMB_DRIFT, bombDef } from './bombs.js';
import { IMPULSE_CHARGES } from './impulseCharges.js';
import { GRAVITY_MARK_FIELD_COUPLING } from './combatDefs.js';
import {
  couplingScale, fieldAffectsBody, fieldContainsPoint, normalizeField, sampleFieldAcceleration,
} from '../core/fields/fieldKernel.js';
import { isAnchoredPhysicalBody } from '../core/physicalResponse.js';
import { isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { queryPhysicalBodies, resolvePhysicalImpulse } from '../combat/physicalEffects.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { bombRadialDirection, bombSurfaceFalloff, integrateBombDrift } from '../combat/bombDynamics.js';
import {
  activeFieldSnapshot, fieldBodyProfile, fieldEntityIsPrimed, fieldLifecyclePhase, fieldVelocityTermApplies,
  isForceableFieldBody, playerFieldSpec, pullMarkTargetEligible,
} from '../systems/fields.js';
import { massSeedLaunchPlan } from '../systems/massSeed.js';
import { chargeThrowPlan } from '../systems/impulseCharges.js';
import { bombDropPlan, proximityTriggerEligible } from '../systems/bombs.js';
import {
  POWER_VERBS, bombUsesCharge, heldPower, playerImpulseCharges, resolveRigTarget,
} from '../systems/powerVerbs.js';
import { indexedShipLikeScan, indexedTypeScan } from '../world/livingWorldViews.js';
import { readRailModel } from '../ui/powerRail.js';

/** Per-power preview tint (05 §7.2 — the same colour the rail and Cluster use). */
export const POWER_PREVIEW_TINT = Object.freeze({
  pull: 'amber', shove: 'red', pin: 'blue', bomb: 'orange', rig: 'white',
});

/**
 * How far from the ship each power's shape can reach, from the owners' own definitions. Kept for
 * readers that want a scale; the plan itself never uses a range — it asks each shape.
 */
export const POWER_PREVIEW_RANGE = Object.freeze({
  pull: FIELD_DEFS.well.deployRange + FIELD_DEFS.well.radius,
  shove: FIELD_DEFS.repulsor.radius,
  pin: 260 * 1.6 + FIELD_DEFS.seed.radius, // MASS_SEED_DEF travel (speed × time) + the lock ring
  bomb: IMPULSE_CHARGES.charge_standard.throwSpeed * 3 + IMPULSE_CHARGES.charge_standard.radius,
  rig: FIELD_DEFS.cone.originGap + FIELD_DEFS.cone.radius,
});

const STEP_S = 1 / 60;            // the sim's fixed step: a path is the sim's own semi-implicit Euler
const FIELD_HORIZON_S = 1.5;      // a field path shows where each body is 1.5 s after the release
const PATH_EVERY = 6;             // one path point per 0.1 s
const KICK_ARROW_S = 0.6;         // a blast arrow carries the kick's change of speed for 0.6 s
const KICK_ARROW_MAX_WU = 240;
const THROW_HORIZON_S = 3;        // a sticky charge still flying after 3 s draws its line to there
const MAX_MOVES = 24;             // the presenter's pool: the bodies nearest the power's centre
const BLAST_LOOKAHEAD_WU = 160;   // bodies this far outside a later blast may drift into it
// impulseCharges' stick law (private there): the plate sticks to hulls and rocks, or the live tow,
// at host radius + plate radius (1.2) + stickRadius, and never to its thrower for the first 0.35 s.
const STICK_TYPES = new Set(['ship', 'drone', 'asteroid']);
const CHARGE_RADIUS = 1.2;
const OWNER_STICK_LOCKOUT_S = 0.35;

const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const simNow = (state) => (Number.isFinite(state && state.simTime) ? state.simTime : ((state && state.tick) || 0) / 60);
// bombs.js: the blast shoves every body that has one, moving or anchored.
const blastShoveEligible = (e) => !!e && e.physicsBody !== false
  && (isDynamicPhysicsBodyEntity(e) || isAnchoredPhysicalBody(e));

/**
 * The power whose key is held right now, or null. input.js publishes the newest live grip through
 * powerVerbs.heldPower; a merged `state.input.actions[p].held` flag is read when no grip is
 * published (an input layer that writes one). The grip lives in the realm input runs in: every
 * player route runs the main lane (simLaneMain.resolveSimLaneFlags), so the renderer sees it; the
 * `?simLane=worker` diagnostic keeps it in the worker and draws no preview.
 */
export function powerHeld(state) {
  const grip = heldPower(state);
  if (grip) return grip;
  const acts = state && state.input && state.input.actions;
  if (!acts) return null;
  for (const p of POWER_VERBS) {
    const a = acts[p];
    if (a && (a.held === true || a === true)) return p;
  }
  return null;
}

function compareIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function massOf(e) {
  const m = Number(e && e.physicsBody && e.physicsBody.mass != null ? e.physicsBody.mass : e && e.mass);
  return Number.isFinite(m) && m > 0 ? m : 1;
}

// The mass the solver will move this body at (bombs.js effectiveMass: Pinned/Unmoored scale it).
function solverMass(state, e) {
  const scale = Number(state.combat && state.combat.entities && state.combat.entities[String(e.id)]
    && state.combat.entities[String(e.id)].physicsResponse
    && state.combat.entities[String(e.id)].physicsResponse.massScale) || 1;
  return massOf(e) * Math.max(0.25, Math.min(8, scale));
}

// A blast impulse as the change of speed it gives this body (environment/anchor scaling included).
function kickOf(state, e, jx, jz) {
  const j = resolvePhysicalImpulse(e, { x: jx, z: jz });
  const m = solverMass(state, e);
  return { dvx: j.x / m, dvz: j.z / m };
}

// Bodies the owners' own query finds, as read-only views. Resolving a body spec fills in
// `physicsBody` on the object it reads, so every predicate below reads a shallow copy — never the
// live body, never a dormant field rock (queryPhysicalBodies' readOnly mode does the same inside).
// A dormant rock is placed where it has drifted since its last exact catch-up (asteroidField's
// masslineObstacleXZ rule). ORIGINAL maps a view back for identity-keyed reads (primed lights).
const ORIGINAL = new WeakMap();
const _query = [];
function bodiesNear(state, center, radius, contains = null) {
  queryPhysicalBodies(state, center, radius, null, _query, contains ? { readOnly: true, contains } : { readOnly: true });
  const now = simNow(state);
  const out = new Array(_query.length);
  for (let i = 0; i < _query.length; i++) {
    const e = _query[i];
    const view = { ...e };
    const dormant = !(state.entities && typeof state.entities.get === 'function' && state.entities.get(e.id) === e);
    if (dormant && e.fieldResident === true && Number.isFinite(e.lastExactT) && now > e.lastExactT) {
      const dt = now - e.lastExactT;
      view.pos = { x: e.pos.x + finite(e.vel && e.vel.x) * dt, z: e.pos.z + finite(e.vel && e.vel.z) * dt };
    }
    ORIGINAL.set(view, e);
    out[i] = view;
  }
  _query.length = 0;
  return out;
}

function liveFields(state) {
  const snap = activeFieldSnapshot(state);
  const out = [];
  for (let i = 0; i < snap.length; i++) if (snap[i] && !snap[i].thermal) out.push(snap[i]);
  return out;
}

const _profile = {};
function profileFor(state, view, registry) {
  const p = fieldBodyProfile(view, state, _profile);
  p.primed = fieldEntityIsPrimed(registry, state, ORIGINAL.get(view) || view);
  return p;
}

const _P = { x: 0, z: 0 };
const _V = { x: 0, z: 0 };
const _A = { ax: 0, az: 0 };
const _inside = [];

/**
 * One body under the release's new field plus every live field, from its current velocity, with
 * production's velocity gate (fieldVelocityTermApplies) and the new field's wind-up. `own` is a
 * private normalized copy this module may ramp and move; `drift` carries a ship-attached rig's
 * centre with the ship. `kicks` ([{t, dvx, dvz}], time-ordered) adds blasts that land inside it.
 */
function fieldPath(e, profile, own, live, { now, baseStrength, expireS, drift = null, kicks = null }) {
  const gated = fieldVelocityTermApplies(e, profile);
  let px = e.pos.x, pz = e.pos.z;
  let vx = finite(e.vel && e.vel.x), vz = finite(e.vel && e.vel.z);
  const cx0 = own.center.x, cz0 = own.center.z;
  const path = [px, pz];
  const steps = Math.round(FIELD_HORIZON_S / STEP_S);
  let k = 0;
  for (let i = 0; i < steps; i++) {
    const t = i * STEP_S;
    own.strength = baseStrength * fieldLifecyclePhase(0, expireS, t).mult;
    if (drift) { own.center.x = cx0 + drift.x * t; own.center.z = cz0 + drift.z * t; }
    _inside.length = 0;
    if (fieldContainsPoint(own, px, pz)) _inside.push(own);
    for (let j = 0; j < live.length; j++) if (fieldContainsPoint(live[j], px, pz)) _inside.push(live[j]);
    _P.x = px; _P.z = pz; _V.x = vx; _V.z = vz;
    sampleFieldAcceleration(_P, gated ? _V : null, _inside, now + t, profile, _A);
    vx += _A.ax * STEP_S; vz += _A.az * STEP_S;
    while (kicks && k < kicks.length && kicks[k].t <= t) { vx += kicks[k].dvx; vz += kicks[k].dvz; k++; }
    px += vx * STEP_S; pz += vz * STEP_S;
    if ((i + 1) % PATH_EVERY === 0) path.push(px, pz);
  }
  own.center.x = cx0; own.center.z = cz0; own.strength = baseStrength;
  _inside.length = 0;
  return path;
}

function kickArrow(x, z, dvx, dvz) {
  let ex = dvx * KICK_ARROW_S, ez = dvz * KICK_ARROW_S;
  const len = Math.hypot(ex, ez);
  if (len > KICK_ARROW_MAX_WU) { const k = KICK_ARROW_MAX_WU / len; ex *= k; ez *= k; }
  return [x + ex, z + ez];
}

function moveRow(e, path, extra = null) {
  const n = path.length;
  const row = {
    id: e.id, x: e.pos.x, z: e.pos.z, radius: finite(e.radius, 10) || 10,
    path, toX: path[n - 2], toZ: path[n - 1], shrug: false, marked: false,
  };
  return extra ? Object.assign(row, extra) : row;
}

function sortAndCap(moves, cx, cz) {
  moves.sort((a, b) => ((a.x - cx) ** 2 + (a.z - cz) ** 2) - ((b.x - cx) ** 2 + (b.z - cz) ** 2) || compareIds(a.id, b.id));
  if (moves.length > MAX_MOVES) moves.length = MAX_MOVES;
  return moves;
}

function ring(role, x, z, r) { return { kind: 'ring', role, x, z, r }; }

function fieldArea(role, spec) {
  if (spec.kind === 'cone') {
    return { kind: 'wedge', role, x: spec.center.x, z: spec.center.z, dirX: spec.dir.x, dirZ: spec.dir.z, r: spec.radius, half: spec.halfAngleRad };
  }
  if (spec.kind === 'sheet') {
    return { kind: 'sheet', role, x: spec.center.x, z: spec.center.z, dirX: spec.dir.x, dirZ: spec.dir.z, length: spec.radius, halfWidth: spec.halfWidth };
  }
  return ring(role, spec.center.x, spec.center.z, spec.radius);
}

/**
 * Every body the new field will move, each with its path. `targetId` is the locked target a Pull
 * marks (×3 grip); `blasts` maps body id → kicks landing on it in the same release (Shove).
 */
function fieldMoves(state, player, spec, opts) {
  const { registry, live, drift = null, markTargetId = null, kicksById = null } = opts;
  const own = normalizeField({ ...spec, id: `preview:${spec.kind}` });
  const now = simNow(state);
  const envelope = own.kind === 'sheet' ? Math.hypot(own.radius, finite(own.halfWidth)) : own.radius;
  const bodies = bodiesNear(state, own.center, envelope, (e) => fieldContainsPoint(own, e.pos.x, e.pos.z));
  const moves = [];
  const seen = new Set();
  for (const e of bodies) {
    if (!e || e.id === player.id || !isForceableFieldBody(e)) continue;
    const profile = profileFor(state, e, registry);
    if (!fieldAffectsBody(own, profile)) continue;
    let marked = false;
    if (markTargetId != null && e.id === markTargetId
      && pullMarkTargetEligible(state, player, e, own.center.x, own.center.z, own.radius)) {
      // The gravity mark lands with the well: fieldCoupling ×3 on the hull's authored response.
      const authored = e.physicsBody && Number.isFinite(e.physicsBody.fieldResponseMult)
        ? Math.max(0, e.physicsBody.fieldResponseMult) : 1;
      profile.fieldResponseMult = Math.max(profile.fieldResponseMult, GRAVITY_MARK_FIELD_COUPLING * authored);
      marked = true;
    }
    const couple = couplingScale(profile);
    const shrug = profile.anchored === true || couple <= FIELD_COUPLING.minShipCouple + 1e-9;
    const kicks = kicksById ? kicksById.get(e.id) || null : null;
    const path = fieldPath(e, profile, own, live, {
      now, baseStrength: own.strength, expireS: finite(spec.durationS, Infinity), drift, kicks,
    });
    moves.push(moveRow(e, path, { shrug, marked }));
    seen.add(e.id);
  }
  return { moves, seen };
}

/**
 * A blast's victims as kicks: [{e, t, dvx, dvz, x, z}] at the body's position when it lands. The
 * player's own hull is one of them (blasts are friendly-fire: a plate or bomb next to you shoves
 * you too); field tugs leave the player out, since the pilot's thrust owns that path.
 */
function blastKicks(state, player, { x, z, radius, impulse, falloff, t = 0, excludeId = null, tangentRatio = 0 }) {
  const out = [];
  const reach = t > 0 ? radius + BLAST_LOOKAHEAD_WU : radius;
  const bodies = bodiesNear(state, { x, z }, reach);
  for (const e of bodies) {
    if (!e || e.id === excludeId || e.type === 'bomb') continue;
    if (!blastShoveEligible(e)) continue;
    const bx = e.pos.x + finite(e.vel && e.vel.x) * t;
    const bz = e.pos.z + finite(e.vel && e.vel.z) * t;
    const dx = bx - x, dz = bz - z;
    let dirX, dirZ, scale;
    if (falloff === 'surface') {
      const radial = bombRadialDirection(dx, dz, { x: 0, z: 0, dist: 0 });
      scale = bombSurfaceFalloff(radial.dist > 0 ? radial.dist : Math.hypot(dx, dz), e.radius, radius);
      dirX = radial.x; dirZ = radial.z;
      if (tangentRatio && (dirX !== 0 || dirZ !== 0)) {
        // Havoc bends its radial into a cross-current, same total impulse (bombs._blastVictims).
        const norm = Math.hypot(1, tangentRatio), ox = dirX;
        dirX = (dirX - dirZ * tangentRatio) / norm; dirZ = (dirZ + ox * tangentRatio) / norm;
      }
    } else {
      const dist = Math.hypot(dx, dz);
      scale = radius > 0 ? Math.max(0, 1 - dist / radius) : 0;
      dirX = dist > 1e-4 ? dx / dist : 0; dirZ = dist > 1e-4 ? dz / dist : 1;
    }
    if (!(scale > 0) || (dirX === 0 && dirZ === 0)) continue;
    const kick = kickOf(state, e, dirX * impulse * scale, dirZ * impulse * scale);
    out.push({ e, t, dvx: kick.dvx, dvz: kick.dvz, x: bx, z: bz });
  }
  return out;
}

// ── the five powers ─────────────────────────────────────────────────────────────────────────

function planPull(state, player, rail, opts) {
  if (!fieldsFlag('enabled')) return null; // a profile without fields: the press deploys nothing
  const spec = playerFieldSpec('well', player, state);
  const areas = [fieldArea('field', spec)];
  const slot = rail[1];
  if (slot && slot.state === 'cooling') return { center: spec.center, radius: spec.radius, areas, moves: [], blocked: slot.why };
  const targetId = state.player && state.player.targetId;
  const { moves } = fieldMoves(state, player, spec, { ...opts, live: liveFields(state), markTargetId: targetId });
  return { center: spec.center, radius: spec.radius, areas, moves: sortAndCap(moves, spec.center.x, spec.center.z), blocked: null };
}

function planShove(state, player, rail, opts) {
  const now = simNow(state);
  const areas = [];
  const kicks = [];
  // Every armed charge goes off now (impulseCharges._handleDetonate does not filter by owner).
  for (const c of indexedTypeScan(state, 'charges')) {
    if (!c || !c.alive || c.type !== 'charge' || !c.data || !c.data.armed || !c.pos) continue;
    const def = IMPULSE_CHARGES[c.data.chargeId] || IMPULSE_CHARGES.charge_standard;
    areas.push(ring('blast', c.pos.x, c.pos.z, def.radius));
    kicks.push(...blastKicks(state, player, {
      x: c.pos.x, z: c.pos.z, radius: def.radius, impulse: def.impulse, falloff: 'linear', excludeId: c.id,
    }));
  }
  // The player's armed drift bombs commit to the warning beat and go off ~0.18 s later where they
  // have drifted to (bombs.commandDetonate → _prime → resolveAt).
  const bombList = state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1 && state.entityIndex.ready === true
    && Array.isArray(state.entityIndex.bombs) ? state.entityIndex.bombs : (state.entityList || []);
  const drift = { x: 0, z: 0, vx: 0, vz: 0 };
  for (const b of bombList) {
    const d = b && b.data;
    if (!b || !b.alive || b.type !== 'bomb' || !d || d.ownerId !== player.id || d.phase !== 'drift' || d.retired) continue;
    if (!(now >= d.armedAt)) continue;
    const def = bombDef(d.bombId);
    const t = Math.max(0, Math.min(finite(d.detonateAt, now + BOMB_DRIFT.warningS), now + BOMB_DRIFT.warningS) - now);
    integrateBombDrift(drift, b.pos.x, b.pos.z, finite(b.vel && b.vel.x), finite(b.vel && b.vel.z), t, BOMB_DRIFT.dragPerS);
    if (def.field && def.field.kind === 'singularity') { areas.push(ring('field', drift.x, drift.z, def.radius)); continue; }
    areas.push(ring('blast', drift.x, drift.z, def.radius));
    kicks.push(...blastKicks(state, player, {
      x: drift.x, z: drift.z, radius: def.radius, impulse: def.impulse, falloff: 'surface', t,
      excludeId: b.id, tangentRatio: def.tangentRatio || 0,
    }));
  }
  const kicksById = new Map();
  for (const k of kicks) {
    const list = kicksById.get(k.e.id);
    if (list) list.push(k); else kicksById.set(k.e.id, [k]);
  }
  for (const list of kicksById.values()) list.sort((a, b) => a.t - b.t);

  const repOff = !fieldsFlag('enabled');
  const repCooling = !repOff && finite(state.fields && state.fields.cooldowns && state.fields.cooldowns.repulsor) > now;
  const center = { x: player.pos.x, z: player.pos.z };
  let moves = [];
  let seen = new Set();
  let note = null;
  if (!repCooling && !repOff) {
    const spec = playerFieldSpec('repulsor', player, state);
    areas.unshift(fieldArea('field', spec));
    ({ moves, seen } = fieldMoves(state, player, spec, { ...opts, live: liveFields(state), kicksById }));
  } else if (kicks.length || areas.length) {
    const slot = rail[2];
    note = `Repulsor recharging — ${Math.ceil(state.fields.cooldowns.repulsor - now)}s`;
    if (slot && slot.state === 'cooling') note = slot.why;
  }
  // A body the repulsor does not hold still takes its blast: a straight arrow from where it is
  // when the blast lands.
  for (const [id, list] of kicksById) {
    if (seen.has(id)) continue;
    const first = list[0];
    let dvx = 0, dvz = 0;
    for (const k of list) { dvx += k.dvx; dvz += k.dvz; }
    const path = first.t > 0 ? [first.e.pos.x, first.e.pos.z, first.x, first.z] : [first.x, first.z];
    path.push(...kickArrow(first.x, first.z, dvx, dvz));
    moves.push(moveRow(first.e, path));
  }
  if (repOff && !areas.length) return null;
  if (repCooling && !areas.length) {
    // Nothing armed and the repulsor recharging: the release does nothing. Show where the ring
    // would be (drawn dim) so the key still answers.
    const slot = rail[2];
    const spec = playerFieldSpec('repulsor', player, state);
    return {
      center, radius: FIELD_DEFS.repulsor.radius, areas: [fieldArea('field', spec)], moves: [],
      blocked: (slot && slot.why) || note || 'Recharging',
    };
  }
  return { center, radius: FIELD_DEFS.repulsor.radius, areas, moves: sortAndCap(moves, center.x, center.z), blocked: null, note };
}

function planPin(state, player, rail) {
  const { spawnPos, lockPos } = massSeedLaunchPlan(player, state);
  const areas = [
    { kind: 'route', role: 'route', points: [spawnPos.x, spawnPos.z, lockPos.x, lockPos.z] },
    ring('lock', lockPos.x, lockPos.z, FIELD_DEFS.seed.radius),
  ];
  const slot = rail[3];
  // Pin moves nothing: the seed flies as a ghost and locks into a fixed anchor the Line latches to.
  return {
    center: lockPos, radius: FIELD_DEFS.seed.radius, areas, moves: [],
    blocked: slot && slot.state === 'cooling' ? slot.why : null,
    note: 'Anchors here — the Line latches to it',
  };
}

function planChargeThrow(state, player) {
  const hull = player;
  const throwCd = Math.max(0, finite(hull.data && hull.data.impulseCharges && hull.data.impulseCharges.throwCdT));
  const blocked = playerImpulseCharges(state) <= 0 ? 'No impulse charges in cargo'
    : throwCd > 0 ? `Arming — ${Math.ceil(throwCd)}s` : null;
  const plan = chargeThrowPlan(state, player);
  const def = plan.def;
  if (plan.trap) {
    const areas = [ring('trap', plan.pos.x, plan.pos.z, finite(def.triggerRadius, def.radius)), ring('armed', plan.pos.x, plan.pos.z, def.radius)];
    return { center: plan.pos, radius: def.radius, areas, moves: [], blocked, note: 'Repulsion trap — it fires when a hull comes close' };
  }
  // The plate flies straight (no drag) until it touches a hull, a rock or the live tow.
  const vx = plan.vel.x, vz = plan.vel.z;
  const reach = Math.hypot(vx, vz) * THROW_HORIZON_S;
  const mid = { x: plan.pos.x + vx * THROW_HORIZON_S / 2, z: plan.pos.z + vz * THROW_HORIZON_S / 2 };
  const tether = state.player && state.player.tether;
  const towId = tether && tether.active && tether.targetId != null ? tether.targetId : null;
  // The owner's stick query (impulseCharges.stickCandidatesNear): the spatial hash, else the
  // collidables list. It reads positions only, so no view is needed.
  const index = state.entityIndex;
  const fallback = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.collidables)
    ? index.collidables : state.entityList;
  const near = queryNearbyEntities(state, mid, reach / 2 + 80, [], fallback) || [];
  const hosts = [];
  for (const h of near) {
    if (h && h.alive !== false && h.pos && (STICK_TYPES.has(h.type) || h.id === towId)) hosts.push(h);
  }
  const route = [plan.pos.x, plan.pos.z];
  let stuck = null, sx = plan.pos.x, sz = plan.pos.z;
  const steps = Math.round(THROW_HORIZON_S / STEP_S);
  for (let i = 1; i <= steps && !stuck; i++) {
    const t = i * STEP_S;
    sx = plan.pos.x + vx * t; sz = plan.pos.z + vz * t;
    let bestD = Infinity;
    for (const h of hosts) {
      if (h.id === player.id && t < OWNER_STICK_LOCKOUT_S) continue;
      const hx = h.pos.x + finite(h.vel && h.vel.x) * t, hz = h.pos.z + finite(h.vel && h.vel.z) * t;
      const dist = Math.hypot(sx - hx, sz - hz);
      if (dist <= finite(h.radius, 6) + CHARGE_RADIUS + def.stickRadius && dist < bestD) { bestD = dist; stuck = h; }
    }
    if (i % PATH_EVERY === 0 || stuck) route.push(sx, sz);
  }
  const areas = [{ kind: 'route', role: 'route', points: route }, ring('armed', sx, sz, def.radius)];
  const host = stuck ? { id: stuck.id, x: stuck.pos.x, z: stuck.pos.z, radius: finite(stuck.radius, 10) || 10 } : null;
  return { center: { x: sx, z: sz }, radius: def.radius, areas, moves: [], host, blocked, note: 'Sticks — Shove sets it off' };
}

function planDriftBomb(state, player, rail) {
  const slot = rail[4];
  const rt = state.bombs || {};
  const id = rt.selectedId;
  const cells = rt.rack && Array.isArray(rt.rack.cells) ? rt.rack.cells : null;
  const loaded = !cells || cells.some((c) => c && c.id === id && c.count > 0);
  let blocked = slot && (slot.state === 'cooling' || slot.state === 'locked' || slot.state === 'empty') ? slot.why : null;
  if (!blocked && (!id || !loaded)) blocked = 'That bomb is not loaded';
  const def = bombDef(id);
  const drop = bombDropPlan(player);
  // Drift until the fuze or the first craft the proximity fuze takes after arming, then the
  // warning beat (bombs._tickBombs / _findTriggerVictim).
  const craft = [];
  const fuze = finite(def.fuzeS, 6);
  for (const e of indexedShipLikeScan(state)) {
    if (!e || !e.pos || !proximityTriggerEligible(e, { team: player.team }, player.id)) continue;
    craft.push(e);
  }
  const m = { x: drop.pos.x, z: drop.pos.z, vx: drop.vx, vz: drop.vz };
  const route = [m.x, m.z];
  let triggerAt = null, trigger = null;
  const steps = Math.round(fuze / STEP_S);
  for (let i = 1; i <= steps; i++) {
    integrateBombDrift(m, m.x, m.z, m.vx, m.vz, STEP_S, BOMB_DRIFT.dragPerS);
    const t = i * STEP_S;
    if (i % PATH_EVERY === 0) route.push(m.x, m.z);
    if (triggerAt == null && t >= BOMB_DRIFT.armS) {
      for (const e of craft) {
        const ex = e.pos.x + finite(e.vel && e.vel.x) * t, ez = e.pos.z + finite(e.vel && e.vel.z) * t;
        if (Math.hypot(ex - m.x, ez - m.z) <= def.triggerRadius + Math.max(0, finite(e.radius))) { triggerAt = t; trigger = e; break; }
      }
    }
    const detAt = triggerAt != null ? triggerAt + BOMB_DRIFT.warningS : fuze;
    if (t + 1e-9 >= detAt) break;
  }
  const tDet = triggerAt != null ? Math.min(fuze, triggerAt + BOMB_DRIFT.warningS) : fuze;
  route.push(m.x, m.z);
  const areas = [{ kind: 'route', role: 'route', points: route }];
  const center = { x: m.x, z: m.z };
  if (def.field && def.field.kind === 'singularity') {
    areas.push(ring('field', m.x, m.z, def.radius));
    return { center, radius: def.radius, areas, moves: [], blocked };
  }
  areas.push(ring('blast', m.x, m.z, def.radius));
  if (blocked) return { center, radius: def.radius, areas, moves: [], blocked };
  const moves = [];
  for (const k of blastKicks(state, player, {
    x: m.x, z: m.z, radius: def.radius, impulse: def.impulse, falloff: 'surface', t: tDet,
    tangentRatio: def.tangentRatio || 0,
  })) {
    const path = [k.e.pos.x, k.e.pos.z, k.x, k.z, ...kickArrow(k.x, k.z, k.dvx, k.dvz)];
    moves.push(moveRow(k.e, path, { trigger: trigger != null && k.e.id === trigger.id }));
  }
  return { center, radius: def.radius, areas, moves: sortAndCap(moves, m.x, m.z), blocked, etaS: tDet };
}

function planRig(state, player, rail, opts) {
  if (!fieldsFlag('enabled')) return null;
  const target = resolveRigTarget(state);
  const kind = target === 'skim' ? 'skim' : 'cone';
  const spec = playerFieldSpec(kind, player, state);
  const slot = rail[5];
  if (slot && slot.state === 'armed') {
    // A rig that is on folds first: the release turns it off and moves nothing.
    return { center: spec.center, radius: spec.radius, areas: [fieldArea('fold', spec)], moves: [], blocked: null, note: slot.why };
  }
  const drift = { x: finite(player.vel && player.vel.x), z: finite(player.vel && player.vel.z) };
  const { moves } = fieldMoves(state, player, spec, { ...opts, live: liveFields(state), drift });
  return {
    center: spec.center, radius: spec.radius, areas: [fieldArea('field', spec)],
    moves: sortAndCap(moves, spec.center.x, spec.center.z), blocked: null,
  };
}

/**
 * The preview plan for the held power (or `power`), or null:
 *   { power, tint, center, radius, areas, moves, blocked, note, host, etaS }
 * `areas` are the shapes the release makes — {kind:'ring'|'wedge'|'sheet'|'route', role, …}; role
 * 'field' is the power's own field, 'blast' a blast the release sets off, 'armed' one a later
 * Shove sets off, 'lock' the Pin anchor, 'trap', 'fold' a rig the release turns off.
 * `moves` are the bodies the release moves: {id, x, z, radius, path:[x0,z0,x1,z1,…], toX, toZ,
 * shrug, marked} — `shrug` a heavy the field barely moves, `marked` the locked target a Pull grips
 * ×3. `blocked` is the rail's reason when releasing would do nothing (recharging, empty, locked).
 * `host` is the body a thrown plate will stick to; `etaS` how long a dropped bomb drifts before it
 * goes off (0 when the release acts at once).
 * Deterministic: owner rules, fixed steps, bodies ordered nearest-first then by id.
 * `opts.registry` lets the primed-light check ask impulseCharges directly (tests, probes).
 */
export function powerPreviewPlan(state, power, opts = {}) {
  const p = power === undefined || power === null ? powerHeld(state) : power;
  if (!p || !POWER_VERBS.includes(p)) return null;
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos || player.alive === false) return null;
  const rail = readRailModel(state, simNow(state));
  const o = { registry: opts.registry || null };
  let plan;
  if (p === 'pull') plan = planPull(state, player, rail, o);
  else if (p === 'shove') plan = planShove(state, player, rail, o);
  else if (p === 'pin') plan = planPin(state, player, rail);
  else if (p === 'bomb') plan = bombUsesCharge(state) ? planChargeThrow(state, player) : planDriftBomb(state, player, rail);
  else plan = planRig(state, player, rail, o);
  if (!plan) return null;
  return Object.freeze({
    power: p,
    tint: POWER_PREVIEW_TINT[p],
    center: plan.center,
    radius: plan.radius,
    areas: Object.freeze(plan.areas),
    moves: Object.freeze(plan.moves),
    blocked: plan.blocked || null,
    note: plan.note || null,
    host: plan.host || null,
    etaS: Number.isFinite(plan.etaS) ? plan.etaS : 0,
  });
}
