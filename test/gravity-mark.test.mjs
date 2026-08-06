import assert from 'node:assert/strict';
import test from 'node:test';

import { createCombatKernel } from '../src/combat/kernel.js';
import { restoreCombatState, serializeCombatState } from '../src/combat/persistence.js';
import { couplingScale } from '../src/core/fields/fieldKernel.js';
import { createBus } from '../src/core/eventBus.js';
import {
  GRAVITY_MARK_STATUS_ID,
  STATUS_DEFS,
} from '../src/data/combatDefs.js';
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
  assert.equal(status.effects.multipliers.fieldCoupling, 1.9);
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
  assert.equal(runtime.multipliers.fieldCoupling, 1.9);

  const ordinaryProfile = fieldBodyProfile(target, { ...state, combat: { entities: {} } });
  const markedProfile = fieldBodyProfile(target, state);
  assert.ok(couplingScale(markedProfile) > couplingScale(ordinaryProfile));

  state.player.targetId = decoy.id;
  assert.equal(fieldBodyProfile(target, state).fieldResponseMult, 1.9,
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
