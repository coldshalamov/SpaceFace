// PQ-133.06 / CRU-039 … CRU-041 — orbit nodes, Cryo Lock, Thermal Shock.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACK_TRAIT_BY_ID,
  validateAttackTraitCatalog,
} from '../src/data/attackTraits.js';
import { compileAttackSpec, digestAttackSpec } from '../src/combat/attackSpec.js';
import {
  PROC_COSTS,
  createLineage,
  lineageMetrics,
  resetLineageIds,
} from '../src/combat/attackLineage.js';
import {
  CRYO_LOCK_CONTROL_SCALE,
  CRYO_LOCK_STATUS_ID,
  applyCryoLock,
  cryoLockControlScale,
  tickCryoLockedMotion,
} from '../src/combat/cryoLock.js';
import { CRYO_LOCK_STATUS_ID as CATALOG_CRYO_LOCK_STATUS_ID, STATUS_DEFS } from '../src/data/combatDefs.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { validateCombatCatalog } from '../src/combat/validate.js';
import {
  BURNING_STATUS_ID,
  resolveThermalShock,
  resolveThermalShockField,
  thermalShockEligible,
} from '../src/combat/thermalShock.js';
import {
  ORBIT_NODE_CAP,
  ORBIT_NODE_TYPE,
  applyOrbitContacts,
  countOrbitFields,
  countOrbitNodes,
  createOrbitWorld,
  listOrbitNodeIdentities,
  orbitEfficacy,
  orbitNodePose,
  stepOrbitWorld,
  trySpawnOrbitNodes,
} from '../src/combat/orbitNodes.js';

function compile(weaponId, modifiers = []) {
  const result = compileAttackSpec({ weaponId, modifiers });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.spec;
}

function lineageFor(spec, overrides = {}) {
  return createLineage({ spec, createdTick: 10, sourceEntityId: 'player', ...overrides });
}

function assertMomentumPreserved(before, after) {
  assert.equal(after.vx, before.vx, 'Cryo Lock must not rewrite vx');
  assert.equal(after.vz, before.vz, 'Cryo Lock must not rewrite vz');
}

test('new traits validate and compile without disturbing a bare Pulse Laser', () => {
  const catalog = validateAttackTraitCatalog();
  assert.equal(catalog.ok, true, JSON.stringify(catalog.issues));
  assert.ok(ATTACK_TRAIT_BY_ID.mod_cryo_payload);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_cryo_gyros);
  assert.equal(ATTACK_TRAIT_BY_ID.mod_cryo_payload.payload[0].statusId, CRYO_LOCK_STATUS_ID);
  assert.equal(ATTACK_TRAIT_BY_ID.mod_cryo_gyros.cost.procBudgetPerOrbitNode, PROC_COSTS.orbitNode);

  const bare = compile('wpn_pulse_laser_s');
  const again = compile('wpn_pulse_laser_s');
  assert.equal(bare.digest, again.digest);
  assert.equal(digestAttackSpec(bare), bare.digest);
  assert.equal(bare.propagation.orbit, undefined);
  assert.equal(bare.payload.length, 1);
  assert.equal(bare.payload[0].kind, 'damage');

  const cryo = compile('wpn_pulse_laser_s', [['mod_cryo_payload', 1]]);
  const gyros = compile('wpn_pulse_laser_s', [['mod_cryo_gyros', 1]]);
  assert.ok(cryo.payload.some((row) => row.kind === 'status' && row.statusId === CRYO_LOCK_STATUS_ID));
  assert.equal(gyros.propagation.orbit.count, 2);
  assert.equal(gyros.propagation.orbit.radius, 48);
  assert.equal(gyros.propagation.orbit.effectRadius, 14);
  assert.notEqual(cryo.digest, bare.digest);
  assert.notEqual(gyros.digest, bare.digest);
  assert.throws(() => { gyros.propagation.orbit.count = 99; });
});

test('orbit nodes are bounded by the shared proc budget', () => {
  resetLineageIds(1);
  const spec = compile('wpn_pulse_laser_s', [['mod_cryo_gyros', 1]]);
  const parent = lineageFor(spec);
  const world = createOrbitWorld();
  const host = { id: 'player', x: 0, z: 0, vx: 40, vz: 0 };
  const first = trySpawnOrbitNodes(world, parent, spec, host, { tick: 10, simTime: 10 });
  assert.equal(first.spawned.length, 2);
  assert.equal(first.suppressed.length, 0);
  assert.equal(countOrbitNodes(world), 2);
  assert.equal(countOrbitFields(world.kernel), 2);
  const identities = listOrbitNodeIdentities(world);
  assert.equal(identities[0].type, ORBIT_NODE_TYPE);
  assert.equal(identities[0].index, 0);
  assert.equal(identities[1].index, 1);
  assert.equal(identities[0].hostId, 'player');
  assert.equal(world.kernel.list()[0].tag, ORBIT_NODE_TYPE);
  const metrics = lineageMetrics(parent);
  assert.equal(metrics.consumed, PROC_COSTS.orbitNode * 2);
  assert.equal(metrics.remaining, metrics.initial - PROC_COSTS.orbitNode * 2);

  const greedy = compile('wpn_pulse_laser_s', [['mod_cryo_gyros', 1]]);
  // Force a 3-node ask the budget cannot pay.
  const padded = { ...greedy, propagation: { ...greedy.propagation, orbit: { ...greedy.propagation.orbit, count: 3 } } };
  const poor = lineageFor(spec);
  poor.budget.remaining = PROC_COSTS.orbitNode * 2;
  poor.budget.initial = PROC_COSTS.orbitNode * 2;
  const world2 = createOrbitWorld();
  const second = trySpawnOrbitNodes(world2, poor, padded, host, { tick: 10, simTime: 10 });
  assert.equal(second.spawned.length, 2);
  assert.equal(second.suppressed.length, 1);
  assert.equal(second.suppressed[0].reason === 'proc_budget' || second.suppressed[0].suppressed === true, true);
  assert.equal(world2.kernel.list().length, 2);
});

test('orbit node cap refuses a third family beyond the hard bound', () => {
  resetLineageIds(20);
  const spec = compile('wpn_pulse_laser_s', [['mod_cryo_gyros', 1]]);
  const parent = lineageFor(spec);
  parent.budget.remaining = 500;
  parent.budget.initial = 500;
  const world = createOrbitWorld({ cap: 2 });
  const host = { id: 'player', x: 0, z: 0, vx: 40, vz: 0 };
  const result = trySpawnOrbitNodes(world, parent, {
    ...spec,
    propagation: { ...spec.propagation, orbit: { ...spec.propagation.orbit, count: 3 } },
  }, host, { tick: 10, simTime: 10 });
  assert.equal(result.spawned.length, 2);
  assert.ok(result.suppressed.some((row) => row.reason === 'orbit_cap'));
  assert.ok(result.spawned.length <= ORBIT_NODE_CAP);
});

test('orbit placement is deterministic in simTime and index, not insertion of targets', () => {
  const host = { id: 'player', x: 0, z: 0, vx: 30, vz: 0 };
  const a = orbitNodePose(host, 0, 2, 48, 45, 90);
  const b = orbitNodePose(host, 0, 2, 48, 45, 90);
  assert.equal(a.x, b.x);
  assert.equal(a.z, b.z);
  const other = orbitNodePose(host, 1, 2, 48, 45, 90);
  assert.notEqual(a.x, other.x);
});

test('parked host has zero orbit efficacy; flying a node onto a target is required', () => {
  const node = { x: 48, z: 0, effectRadius: 14 };
  const target = { id: 'e1', pos: { x: 48, z: 0 }, vx: 0, vz: 0 };
  const parked = { id: 'player', x: 0, z: 0, vx: 0, vz: 0 };
  assert.equal(orbitEfficacy(parked, node, target), 0);

  const presenting = { id: 'player', x: 0, z: 0, vx: 40, vz: 0 };
  assert.equal(orbitEfficacy(presenting, node, target), 1);

  const trailingNode = { x: -48, z: 0, effectRadius: 14 };
  const behind = { id: 'e2', pos: { x: -48, z: 0 } };
  assert.equal(orbitEfficacy(presenting, trailingNode, behind), 0);
});

test('Cryo Lock preserves translational momentum and reduces control authority', () => {
  const body = { vx: 40, vz: -12 };
  const locked = applyCryoLock(body, 1);
  assertMomentumPreserved(body, locked);
  assert.equal(locked.statusId, CRYO_LOCK_STATUS_ID);
  assert.ok(locked.controlScale < 1);
  assert.equal(locked.controlScale, CRYO_LOCK_CONTROL_SCALE);
  assert.ok(locked.controlScale > 0);
  assert.equal(cryoLockControlScale(0), 1);

  const coast = tickCryoLockedMotion({ ...locked }, { ax: 0, az: 0 }, 1 / 60);
  assert.equal(coast.vx, 40);
  assert.equal(coast.vz, -12);

  const steered = tickCryoLockedMotion({ vx: 40, vz: 0, controlScale: 1 }, { ax: 60, az: 0 }, 1);
  const lockedSteer = tickCryoLockedMotion({ vx: 40, vz: 0, controlScale: CRYO_LOCK_CONTROL_SCALE }, { ax: 60, az: 0 }, 1);
  assert.ok(lockedSteer.vx < steered.vx);
  assert.equal(lockedSteer.vz, 0);
});

test('NEGATIVE: a Cryo Lock that zeroes velocity fails the momentum invariant', () => {
  const before = { vx: 40, vz: -12 };
  const stun = (body) => ({ vx: 0, vz: 0, controlScale: 0.35 });
  assert.throws(() => assertMomentumPreserved(before, stun(before)));
  assertMomentumPreserved(before, applyCryoLock(before, 1));
});

test('presented orbit pass applies Cryo Lock without stealing velocity; ignored ring does not', () => {
  resetLineageIds(3);
  const spec = compile('wpn_pulse_laser_s', [['mod_cryo_gyros', 1]]);
  const parent = lineageFor(spec);
  const world = createOrbitWorld();
  const host = { id: 'player', x: 0, z: 0, vx: 40, vz: 0 };
  trySpawnOrbitNodes(world, parent, spec, host, { tick: 10, simTime: 0 });
  const pose = orbitNodePose(host, 0, 2, spec.propagation.orbit.radius, 0, spec.propagation.orbit.periodTicks);
  const target = {
    id: 'raider',
    pos: { x: pose.x, z: pose.z },
    score: 4,
    vx: 18,
    vz: -3,
    statuses: [],
  };
  const hit = applyOrbitContacts(world, host, [target]);
  assert.equal(hit.events.length, 1);
  assert.equal(hit.events[0].statusId, CRYO_LOCK_STATUS_ID);
  assert.equal(hit.events[0].vx, 18);
  assert.equal(hit.events[0].vz, -3);
  assert.ok(hit.events[0].controlScale < 1);

  const parked = { id: 'player', x: 0, z: 0, vx: 0, vz: 0 };
  const idle = applyOrbitContacts(world, parked, [target]);
  assert.equal(idle.events.length, 0);
  assert.ok(idle.ignored.length > 0);
});

test('orbit contact order is score / distance / id, not insertion order', () => {
  resetLineageIds(4);
  const spec = compile('wpn_pulse_laser_s', [['mod_cryo_gyros', 1]]);
  const parent = lineageFor(spec);
  const world = createOrbitWorld();
  const host = { id: 'player', x: 0, z: 0, vx: 40, vz: 0 };
  trySpawnOrbitNodes(world, parent, spec, host, { tick: 10, simTime: 0 });
  const pose = orbitNodePose(host, 0, 2, spec.propagation.orbit.radius, 0, spec.propagation.orbit.periodTicks);
  const field = [
    { id: 'c', pos: { x: pose.x + 1, z: pose.z }, score: 1, vx: 1, vz: 0 },
    { id: 'a', pos: { x: pose.x, z: pose.z }, score: 1, vx: 2, vz: 0 },
    { id: 'b', pos: { x: pose.x, z: pose.z }, score: 9, vx: 3, vz: 0 },
  ];
  const forward = applyOrbitContacts(world, host, field);
  const reversed = applyOrbitContacts(world, host, field.slice().reverse());
  const ids = (result) => result.events.filter((row) => row.nodeId === world.nodes[0].id).map((row) => row.targetId);
  assert.deepEqual(ids(forward), ids(reversed));
  assert.equal(ids(forward)[0], 'b');
});

test('NEGATIVE: insertion-order contact selection disagrees with score/distance/id', () => {
  const pose = { x: 48, z: 0 };
  const field = [
    { id: 'c', pos: { x: pose.x + 1, z: pose.z }, score: 1 },
    { id: 'a', pos: { x: pose.x, z: pose.z }, score: 1 },
    { id: 'b', pos: { x: pose.x, z: pose.z }, score: 9 },
  ];
  const byInsert = field.map((row) => row.id);
  const byScore = ['b', 'a', 'c'];
  assert.notDeepEqual(byInsert, byScore);
});

test('Thermal Shock reacts off Cryo Lock + Burning, consumes freeze, does not zero velocity', () => {
  const target = {
    id: 'e9',
    pos: { x: 10, z: 0 },
    vx: 20,
    vz: 4,
    statuses: [CRYO_LOCK_STATUS_ID, BURNING_STATUS_ID],
    score: 2,
  };
  assert.equal(thermalShockEligible(target.statuses), true);
  const shock = resolveThermalShock(target, { sourcePos: { x: 0, z: 0 } });
  assert.equal(shock.ok, true);
  assert.ok(shock.vx !== 0);
  assert.ok(Math.abs(shock.vx) > Math.abs(target.vx) - 1e-9);
  assert.ok(!shock.statuses.includes(CRYO_LOCK_STATUS_ID));
  assert.equal(shock.subsystemPulse.id, 'drive');
  assert.equal(shock.controlScale, 1);
  assert.equal(resolveThermalShock({ ...target, statuses: [CRYO_LOCK_STATUS_ID] }).ok, false);
});

test('Thermal Shock order is score / distance / id across shuffled insertion', () => {
  resetLineageIds(8);
  const spec = compile('wpn_pulse_laser_s');
  const lineage = lineageFor(spec);
  const bodies = [
    { id: 'z', pos: { x: 4, z: 0 }, vx: 1, vz: 0, score: 0, statuses: [CRYO_LOCK_STATUS_ID, BURNING_STATUS_ID] },
    { id: 'm', pos: { x: 2, z: 0 }, vx: 1, vz: 0, score: 5, statuses: [CRYO_LOCK_STATUS_ID, BURNING_STATUS_ID] },
    { id: 'a', pos: { x: 2, z: 0 }, vx: 1, vz: 0, score: 5, statuses: [CRYO_LOCK_STATUS_ID, BURNING_STATUS_ID] },
  ];
  const forward = resolveThermalShockField(bodies, { sourcePos: { x: 0, z: 0 }, lineage });
  resetLineageIds(8);
  const lineage2 = lineageFor(spec);
  const reversed = resolveThermalShockField(bodies.slice().reverse(), { sourcePos: { x: 0, z: 0 }, lineage: lineage2 });
  assert.deepEqual(forward.shocks.map((row) => row.targetId), reversed.shocks.map((row) => row.targetId));
  assert.deepEqual(forward.shocks.map((row) => row.targetId), ['a', 'm', 'z']);
});

test('Thermal Shock pays the shared reaction proc and stops when it cannot', () => {
  resetLineageIds(9);
  const spec = compile('wpn_pulse_laser_s');
  const lineage = lineageFor(spec);
  lineage.budget.remaining = PROC_COSTS.statusReactionChild;
  lineage.budget.initial = PROC_COSTS.statusReactionChild;
  const bodies = [
    { id: 'a', pos: { x: 1, z: 0 }, vx: 1, vz: 0, score: 2, statuses: [CRYO_LOCK_STATUS_ID, BURNING_STATUS_ID] },
    { id: 'b', pos: { x: 2, z: 0 }, vx: 1, vz: 0, score: 1, statuses: [CRYO_LOCK_STATUS_ID, BURNING_STATUS_ID] },
  ];
  const result = resolveThermalShockField(bodies, { sourcePos: { x: 0, z: 0 }, lineage });
  assert.equal(result.shocks.length, 1);
  assert.equal(result.suppressed.length, 1);
  assert.equal(result.shocks[0].targetId, 'a');
});

test('Cryo Lock is a real status in the combat catalog', () => {
  assert.equal(CATALOG_CRYO_LOCK_STATUS_ID, CRYO_LOCK_STATUS_ID);
  const def = STATUS_DEFS.find((row) => row.id === CRYO_LOCK_STATUS_ID);
  assert.ok(def, 'the status catalog must know Cryo Lock exists');
  assert.equal(def.durationTicks, 90);
  assert.equal(def.stacking.maxStacks, 3);
  assert.deepEqual(def.effects, {});
  assert.equal(def.cueId, 'combat.status.cryo_lock');
  const catalog = validateCombatCatalog(createCombatCatalog());
  assert.equal(catalog.ok, true, JSON.stringify(catalog.errors));
  assert.ok(createCombatCatalog().statuses.has(CRYO_LOCK_STATUS_ID));
});

test('untraited weapons and unfielded ships do nothing in the orbit kernel', () => {
  resetLineageIds(11);
  const spec = compile('wpn_pulse_laser_s');
  const parent = lineageFor(spec);
  const world = createOrbitWorld();
  const host = { id: 'player', x: 0, z: 0, vx: 40, vz: 0 };
  const spawn = trySpawnOrbitNodes(world, parent, spec, host, { tick: 10, simTime: 10 });
  assert.equal(spawn.spawned.length, 0);
  assert.equal(lineageMetrics(parent).consumed, 0);
  const stepped = stepOrbitWorld(world, host, 10, [{ id: 'e', pos: { x: 10, z: 0 }, vx: 1, vz: 0 }]);
  assert.equal(stepped.events.length, 0);
  assert.equal(world.kernel.list().length, 0);
});
