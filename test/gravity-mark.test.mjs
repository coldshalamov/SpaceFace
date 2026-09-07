import assert from 'node:assert/strict';
import test from 'node:test';

import { createCombatKernel } from '../src/combat/kernel.js';
import { restoreCombatState, serializeCombatState } from '../src/combat/persistence.js';
import { couplingScale, normalizeField, projectFieldTrajectory } from '../src/core/fields/fieldKernel.js';
import { createBus } from '../src/core/eventBus.js';
import {
  GRAVITY_MARK_FIELD_COUPLING,
  GRAVITY_MARK_STATUS_ID,
  STATUS_DEFS,
} from '../src/data/combatDefs.js';
import { FIELD_COUPLING, FIELD_DEFS, FIELD_KINDS } from '../src/data/fields.js';
import { TECH_NODES } from '../src/data/tech.js';
import { WEAPONS } from '../src/data/weapons.js';
import { fieldBodyProfile } from '../src/systems/fields.js';
import { buildWeaponDamagePacket } from '../src/systems/weapons.js';
import { fillActiveGravityMarkTargets } from '../src/ui/gravityMarkOverlay.js';

const MARK_WEAPON_ID = 'wpn_gravity_marker_s';
const DT = 1 / 60;

test('Gravity Marker is a real small-slot field setup weapon, not free target selection', () => {
  const weapon = WEAPONS.find((entry) => entry.id === MARK_WEAPON_ID);
  const status = STATUS_DEFS.find((entry) => entry.id === GRAVITY_MARK_STATUS_ID);
  const graviton = TECH_NODES.find((entry) => entry.id === 'tech_graviton_drives');

  assert.ok(weapon, 'the outfitting catalog exposes the Gravity Marker');
  assert.equal(weapon.size, 'S', 'the Hitch can exchange its gun for the setup tool');
  assert.equal(weapon.requiresTech, 'tech_graviton_drives');
  assert.ok(weapon.dmg > 0 && weapon.dmg < 10, 'the mark is a hit-confirm, not a DPS weapon');
  assert.deepEqual(weapon.statuses, [{ id: GRAVITY_MARK_STATUS_ID, stacks: 1 }]);
  assert.ok(graviton.unlocks.modules.includes(MARK_WEAPON_ID), 'research names the buyable weapon');

  assert.ok(status);
  assert.equal(status.effects.multipliers.fieldCoupling, GRAVITY_MARK_FIELD_COUPLING);
  assert.equal(GRAVITY_MARK_FIELD_COUPLING, FIELD_COUPLING.markedMult);
  assert.equal(FIELD_COUPLING.markedCap, FIELD_COUPLING.markedMult,
    'markedCap must not clip the 3× well/sink pull');
  assert.ok(status.durationTicks >= 180, 'the setup window lasts long enough to exploit');

  const packet = buildWeaponDamagePacket({ defId: weapon.id }, weapon, weapon.dmg, weapon.damageType);
  assert.deepEqual(packet.statuses, weapon.statuses, 'the live projectile packet carries the mark');
  assert.notStrictEqual(packet.statuses, weapon.statuses, 'packet status rows are cloned per shot');
});

test('a landed mark boosts field coupling until expiry and retargeting cannot transfer it', () => {
  const attacker = combatShip(1, 0, 0);
  const target = combatShip(2, 1, 60);
  const decoy = combatShip(3, 1, 100);
  target.flags.persistent = true;
  const state = combatState(attacker, target, decoy);
  state.player = { targetId: target.id };
  const kernel = createCombatKernel({
    state,
    bus: createBus(),
    helpers: {},
    registry: { get: () => null },
  });
  const weapon = WEAPONS.find((entry) => entry.id === MARK_WEAPON_ID);
  const packet = buildWeaponDamagePacket({ defId: weapon.id }, weapon, weapon.dmg, weapon.damageType);

  const routed = kernel.routeDamage({
    attackerId: attacker.id,
    targetId: target.id,
    packet,
    origin: { kind: 'weapon', id: weapon.id, weaponId: weapon.id },
  });
  assert.equal(routed.ok, true);

  state.tick += 1;
  state.simTime += DT;
  kernel.prePhysics(DT);
  const runtime = state.combat.entities[String(target.id)];
  assert.ok(runtime.statuses[GRAVITY_MARK_STATUS_ID], 'the hit becomes a simulation-owned state');
  assert.equal(runtime.multipliers.fieldCoupling, GRAVITY_MARK_FIELD_COUPLING);

  const ordinaryProfile = fieldBodyProfile(target, { ...state, combat: { entities: {} } });
  const markedProfile = fieldBodyProfile(target, state);
  assert.ok(couplingScale(markedProfile) > couplingScale(ordinaryProfile));

  state.player.targetId = decoy.id;
  assert.equal(fieldBodyProfile(target, state).fieldResponseMult, GRAVITY_MARK_FIELD_COUPLING,
    'retargeting leaves the earned mark on the body that was hit');
  assert.equal(fieldBodyProfile(decoy, state).fieldResponseMult, 1,
    'merely selecting a new target grants no field bonus');

  state.tick = runtime.statuses[GRAVITY_MARK_STATUS_ID].expiresTick;
  state.simTime = state.tick * DT;
  kernel.prePhysics(DT);
  assert.equal(fieldBodyProfile(target, state).fieldResponseMult, 1, 'expiry restores ordinary coupling');
});

test('player-authored marks survive save on persistent bodies and drive a bounded world overlay', () => {
  const attacker = combatShip(1, 0, 0);
  const target = combatShip(2, 1, 60);
  target.flags.persistent = true;
  const state = combatState(attacker, target);
  state.player = { targetId: null };
  const kernel = createCombatKernel({
    state,
    bus: createBus(),
    helpers: {},
    registry: { get: () => null },
  });
  const weapon = WEAPONS.find((entry) => entry.id === MARK_WEAPON_ID);
  kernel.routeDamage({
    attackerId: attacker.id,
    targetId: target.id,
    packet: buildWeaponDamagePacket({ defId: weapon.id }, weapon, weapon.dmg, weapon.damageType),
    origin: { kind: 'weapon', id: weapon.id, weaponId: weapon.id },
  });
  state.tick += 1;
  state.simTime += DT;
  kernel.prePhysics(DT);

  const saved = serializeCombatState(state);
  const restoredAttacker = combatShip(1, 0, 0);
  const restoredTarget = combatShip(2, 1, 60);
  restoredTarget.flags.persistent = true;
  const restored = combatState(restoredAttacker, restoredTarget);
  restored.tick = state.tick;
  restored.simTime = state.simTime;
  restored.player = { targetId: null };
  const summary = restoreCombatState(restored, saved, (ref) => {
    if (ref && ref.kind === 'player') return restoredAttacker.id;
    if (ref && ref.kind === 'persistent' && ref.saveId === String(restoredTarget.id)) return restoredTarget.id;
    return null;
  });
  assert.equal(summary.restoredEntities, 2);
  assert.ok(restored.combat.entities[String(restoredTarget.id)].statuses[GRAVITY_MARK_STATUS_ID]);

  const overlays = [];
  fillActiveGravityMarkTargets(restored, restoredAttacker.id, overlays, 6);
  assert.deepEqual(overlays.map((entity) => entity.id), [restoredTarget.id]);
  assert.equal(restored.player.targetId, null, 'the marker is independent of target selection');
});

const WELL_GOLF_SEED = 26001;
const SCREEN_DEPTH_WU = 126; // FEEL_CONTRACT B3: cruise 105 WU/s × 1.2 s on-screen
const HORNET = Object.freeze({ mass: 24, radius: 16, name: 'Hornet medium' });
const WARDEN = Object.freeze({ mass: 150, radius: 26, name: 'Warden heavy' });

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

function wellGolfPull(hull, marked, seconds) {
  const profile = {
    mass: hull.mass,
    type: 'ship',
    fieldResponseMult: marked ? GRAVITY_MARK_FIELD_COUPLING : 1,
  };
  const startR = 90;
  const traj = projectFieldTrajectory(
    { x: startR, z: 0 },
    { x: 0, z: 0 },
    [authoredWell()],
    profile,
    { dt: 1 / 60, steps: Math.round(seconds * 60) },
  );
  const endR = Math.hypot(traj.end.x, traj.end.z);
  return {
    couple: couplingScale(profile),
    pullWu: startR - endR,
    hullRadii: (startR - endR) / hull.radius,
    screens: (startR - endR) / SCREEN_DEPTH_WU,
  };
}

test('a marked Hornet well-golfs 3× harder than an unmarked twin; a marked Warden bends', () => {
  // Status effects without visible motion: the mark must change a trajectory the player can see.
  const unmarked = wellGolfPull(HORNET, false, 1);
  const marked = wellGolfPull(HORNET, true, 1);
  const unmarked2s = wellGolfPull(HORNET, false, 2);
  const marked2s = wellGolfPull(HORNET, true, 2);
  const heavyU = wellGolfPull(WARDEN, false, 2);
  const heavyM = wellGolfPull(WARDEN, true, 2);

  console.log(`PQ-026.01 seed=${WELL_GOLF_SEED} Hornet 1s unmarkedPull=${unmarked.pullWu.toFixed(2)}WU (${unmarked.hullRadii.toFixed(2)} hulls, ${unmarked.screens.toFixed(3)} screens) markedPull=${marked.pullWu.toFixed(2)}WU (${marked.hullRadii.toFixed(2)} hulls, ${marked.screens.toFixed(3)} screens) couple=${unmarked.couple.toFixed(3)}→${marked.couple.toFixed(3)} ratio=${(marked.couple / unmarked.couple).toFixed(3)}`);
  console.log(`PQ-026.01 seed=${WELL_GOLF_SEED} Hornet 2s unmarkedPull=${unmarked2s.pullWu.toFixed(2)}WU markedPull=${marked2s.pullWu.toFixed(2)}WU pullRatio=${(marked2s.pullWu / unmarked2s.pullWu).toFixed(3)}`);
  console.log(`PQ-026.01 seed=${WELL_GOLF_SEED} Warden 2s unmarkedPull=${heavyU.pullWu.toFixed(2)}WU (${heavyU.hullRadii.toFixed(2)} hulls) markedPull=${heavyM.pullWu.toFixed(2)}WU (${heavyM.hullRadii.toFixed(2)} hulls) couple=${heavyU.couple.toFixed(3)}→${heavyM.couple.toFixed(3)} ratio=${(heavyM.couple / heavyU.couple).toFixed(3)}`);

  assert.equal(marked.couple / unmarked.couple, 3, 'a marked target is pulled 3× harder by wells');
  assert.equal(heavyM.couple / heavyU.couple, 3, 'a marked heavy also takes the 3×');
  assert.ok(marked.pullWu > unmarked.pullWu,
    'the gravity marker makes a target heavier to fields: the marked Hornet moves farther toward the well');
  assert.ok(marked.hullRadii >= 1.9,
    `well golf on a marked medium: marked Hornet falls ${marked.hullRadii.toFixed(2)} hull-radii in 1s, need ≥ 1.9`);
  assert.ok(marked.pullWu / unmarked.pullWu >= 1.8,
    `marked vs unmarked twin pull ${ (marked.pullWu / unmarked.pullWu).toFixed(3) }× at 1s (damping may compress 3× couple)`);
  assert.ok(heavyM.hullRadii >= 1,
    `marked heavies bend toward wells they would ignore: Warden ${heavyM.hullRadii.toFixed(2)} hull-radii vs unmarked ${heavyU.hullRadii.toFixed(2)}`);
  assert.ok(heavyU.hullRadii < 1, 'the unmarked heavy still shrugs (under one hull-radius in 2s)');
});

function combatState(...entities) {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  return {
    tick: 20,
    simTime: 20 * DT,
    mode: 'flight',
    playerId: 1,
    entities: byId,
    entityList: entities,
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 47 },
  };
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
    mass: 140,
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
