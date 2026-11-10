// PQ-026.01 — Gravity mark as a field multiplier.
// A marked target is pulled 3× harder by wells and sinks; marked heavies bend
// toward wells they would ignore. Status without visible motion fails.
// Node field tests must opt in: FIELD_FLAGS.enabled = true.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createCombatKernel } from '../src/combat/kernel.js';
import {
  couplingScale,
  normalizeField,
  projectFieldTrajectory,
  sampleFieldAcceleration,
} from '../src/core/fields/fieldKernel.js';
import { createBus } from '../src/core/eventBus.js';
import { SIM_DT } from '../src/core/sim.js';
import {
  GRAVITY_MARK_FIELD_COUPLING,
  GRAVITY_MARK_STATUS_ID,
  STATUS_DEFS,
} from '../src/data/combatDefs.js';
import { FIELD_COUPLING, FIELD_DEFS, FIELD_FLAGS, FIELD_KINDS } from '../src/data/fields.js';
import { WEAPONS } from '../src/data/weapons.js';
import { fieldBodyProfile } from '../src/systems/fields.js';
import { buildWeaponDamagePacket } from '../src/systems/weapons.js';

const SEED = 26001;
const MARK_WEAPON_ID = 'wpn_gravity_marker_s';
const SCREEN_DEPTH_WU = 126;
const HORNET = Object.freeze({ mass: 24, radius: 16, name: 'Hornet medium' });
const WARDEN = Object.freeze({ mass: 150, radius: 26, name: 'Warden heavy' });
const START_R = 90;

function withFieldsEnabled(fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    return fn();
  } finally {
    FIELD_FLAGS.enabled = prev;
  }
}

function authoredWell() {
  return normalizeField({
    id: 'pq-026-01-well',
    kind: FIELD_KINDS.WELL,
    center: { x: 0, z: 0 },
    radius: FIELD_DEFS.well.radius,
    strength: FIELD_DEFS.well.strength,
    damping: FIELD_DEFS.well.damping,
    falloff: FIELD_DEFS.well.falloff,
    createdAt: 0,
    durationS: FIELD_DEFS.well.durationS,
  });
}

function profileFor(hull, marked) {
  return {
    mass: hull.mass,
    type: 'ship',
    fieldResponseMult: marked ? GRAVITY_MARK_FIELD_COUPLING : 1,
  };
}

function wellGolfPull(hull, marked, seconds) {
  const profile = profileFor(hull, marked);
  const traj = projectFieldTrajectory(
    { x: START_R, z: 0 },
    { x: 0, z: 0 },
    [authoredWell()],
    profile,
    { dt: SIM_DT, steps: Math.round(seconds / SIM_DT), simTime: 0 },
  );
  const endR = Math.hypot(traj.end.x, traj.end.z);
  return {
    couple: couplingScale(profile),
    pullWu: START_R - endR,
    hullRadii: (START_R - endR) / hull.radius,
    screens: (START_R - endR) / SCREEN_DEPTH_WU,
  };
}

function restPullAccel(hull, marked) {
  const out = { ax: 0, az: 0 };
  sampleFieldAcceleration(
    { x: START_R, z: 0 },
    { x: 0, z: 0 },
    [authoredWell()],
    0,
    profileFor(hull, marked),
    out,
  );
  return Math.hypot(out.ax, out.az);
}

function combatShip(id, team, x) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: `faction_test_${team}`,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 10,
    mass: HORNET.mass,
    hull: 500,
    hullMax: 500,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    data: {
      derived: { damageReductionMult: 1 },
      combatProfileId: 'combat_profile_standard_ship',
    },
  };
}

function combatState(...entities) {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  return {
    tick: 20,
    simTime: 20 * SIM_DT,
    mode: 'flight',
    playerId: 1,
    entities: byId,
    entityList: entities,
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: SEED },
    rng: { next: () => 0.5 },
  };
}

function landGravityMark(target) {
  const attacker = combatShip(1, 0, 0);
  const state = combatState(attacker, target);
  const kernel = createCombatKernel({
    state,
    bus: createBus(),
    helpers: {},
    registry: { get: () => null },
  });
  const weapon = WEAPONS.find((entry) => entry.id === MARK_WEAPON_ID);
  const routed = kernel.routeDamage({
    attackerId: attacker.id,
    targetId: target.id,
    packet: buildWeaponDamagePacket({ defId: weapon.id }, weapon, weapon.dmg, weapon.damageType),
    origin: { kind: 'weapon', id: weapon.id, weaponId: weapon.id },
  });
  assert.equal(routed.ok, true, 'the marker hit must land');
  state.tick += 1;
  state.simTime += SIM_DT;
  kernel.prePhysics(SIM_DT);
  return state;
}

test('PQ-026.01 authored mark is a 3× well/sink multiplier, not a clipped status', () => {
  withFieldsEnabled(() => {
    const weapon = WEAPONS.find((entry) => entry.id === MARK_WEAPON_ID);
    const status = STATUS_DEFS.find((entry) => entry.id === GRAVITY_MARK_STATUS_ID);
    assert.ok(weapon, 'Gravity Marker S is in the catalog');
    assert.deepEqual(weapon.statuses, [{ id: GRAVITY_MARK_STATUS_ID, stacks: 1 }]);
    assert.equal(status.effects.multipliers.fieldCoupling, GRAVITY_MARK_FIELD_COUPLING);
    assert.equal(GRAVITY_MARK_FIELD_COUPLING, 3);
    assert.equal(FIELD_COUPLING.markedMult, 3);
    assert.equal(FIELD_COUPLING.markedCap, FIELD_COUPLING.markedMult,
      'markedCap must not clip the 3× well/sink pull');
    assert.equal(FIELD_FLAGS.enabled, true, 'Node field tests opt the kernel on');
  });
});

test('PQ-026.01 a landed mark writes 3× coupling the field profile reads', () => {
  withFieldsEnabled(() => {
    const target = combatShip(2, 1, START_R);
    target.flags.persistent = true;
    const state = landGravityMark(target);
    const runtime = state.combat.entities[String(target.id)];
    assert.ok(runtime.statuses[GRAVITY_MARK_STATUS_ID], 'the hit becomes a simulation-owned state');
    assert.equal(runtime.multipliers.fieldCoupling, GRAVITY_MARK_FIELD_COUPLING);

    const unmarked = fieldBodyProfile(target, { ...state, combat: { entities: {} } });
    const marked = fieldBodyProfile(target, state);
    assert.equal(marked.fieldResponseMult, 3);
    assert.equal(unmarked.fieldResponseMult, 1);
    assert.equal(couplingScale(marked) / couplingScale(unmarked), 3,
      'the earned mark is a 3× field multiplier vs the unmarked twin');
  });
});

test('PQ-026.01 seed 26001 marked twin is pulled 3× harder; marked heavy bends', () => {
  withFieldsEnabled(() => {
    const unmarkedAccel = restPullAccel(HORNET, false);
    const markedAccel = restPullAccel(HORNET, true);
    const accelRatio = markedAccel / unmarkedAccel;
    const heavyAccelU = restPullAccel(WARDEN, false);
    const heavyAccelM = restPullAccel(WARDEN, true);
    const heavyAccelRatio = heavyAccelM / heavyAccelU;

    const unmarked = wellGolfPull(HORNET, false, 1);
    const marked = wellGolfPull(HORNET, true, 1);
    const heavyU = wellGolfPull(WARDEN, false, 2);
    const heavyM = wellGolfPull(WARDEN, true, 2);

    console.log(`PQ-026.01 seed=${SEED} Hornet restAccel unmarked=${unmarkedAccel.toFixed(3)} marked=${markedAccel.toFixed(3)} ratio=${accelRatio.toFixed(3)}`);
    console.log(`PQ-026.01 seed=${SEED} Hornet 1s unmarkedPull=${unmarked.pullWu.toFixed(2)}WU (${unmarked.hullRadii.toFixed(2)} hulls, ${unmarked.screens.toFixed(3)} screens) markedPull=${marked.pullWu.toFixed(2)}WU (${marked.hullRadii.toFixed(2)} hulls, ${marked.screens.toFixed(3)} screens) couple=${unmarked.couple.toFixed(3)}→${marked.couple.toFixed(3)} ratio=${(marked.couple / unmarked.couple).toFixed(3)}`);
    console.log(`PQ-026.01 seed=${SEED} Warden restAccel unmarked=${heavyAccelU.toFixed(3)} marked=${heavyAccelM.toFixed(3)} ratio=${heavyAccelRatio.toFixed(3)}`);
    console.log(`PQ-026.01 seed=${SEED} Warden 2s unmarkedPull=${heavyU.pullWu.toFixed(2)}WU (${heavyU.hullRadii.toFixed(2)} hulls) markedPull=${heavyM.pullWu.toFixed(2)}WU (${heavyM.hullRadii.toFixed(2)} hulls) couple=${heavyU.couple.toFixed(3)}→${heavyM.couple.toFixed(3)} ratio=${(heavyM.couple / heavyU.couple).toFixed(3)}`);

    assert.equal(FIELD_FLAGS.enabled, true);
    assert.equal(marked.couple / unmarked.couple, 3, 'a marked target is pulled 3× harder by wells');
    assert.equal(heavyM.couple / heavyU.couple, 3, 'a marked heavy also takes the 3×');
    assert.ok(Math.abs(accelRatio - 3) < 1e-9,
      `Hornet rest pull accel must be 3× vs the unmarked twin, got ${accelRatio.toFixed(6)}`);
    assert.ok(Math.abs(heavyAccelRatio - 3) < 1e-9,
      `Warden rest pull accel must be 3× vs the unmarked twin, got ${heavyAccelRatio.toFixed(6)}`);
    assert.ok(marked.pullWu > unmarked.pullWu,
      'status without visible motion fails: the marked Hornet must fall farther toward the well');
    assert.ok(marked.hullRadii >= 1.9,
      `well golf on a marked medium: marked Hornet falls ${marked.hullRadii.toFixed(2)} hull-radii in 1s`);
    assert.ok(heavyM.hullRadii >= 1,
      `marked heavies bend toward wells they would ignore: Warden ${heavyM.hullRadii.toFixed(2)} hull-radii`);
    assert.ok(heavyU.hullRadii < 1,
      `the unmarked heavy still shrugs (${heavyU.hullRadii.toFixed(2)} hull-radii in 2s)`);
  });
});
