import assert from 'node:assert/strict';
import test from 'node:test';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { FIELD_DEFS, FIELD_FLAGS } from '../src/data/fields.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { TECH_NODES } from '../src/data/tech.js';
import { UNIQUE_WRECKS, validateUniqueWreckRegistry } from '../src/data/uniqueWrecks.js';
import { WEAPONS } from '../src/data/weapons.js';
import { synergiesForFittings } from '../src/data/synergies.js';
import { aiPorts, npcTargetPriorityMass } from '../src/systems/aiPorts.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { crafting } from '../src/systems/crafting.js';
import { economy } from '../src/systems/economy.js';
import { fields } from '../src/systems/fields.js';
import {
  fittingsFromDefaultModules,
  getDerivedStats,
} from '../src/systems/ships.js';
import { presentShopModuleDelta } from '../src/ui/presenters/engineeringPreview.js';

const MODULE_BY_ID = new Map(MODULES.map((row) => [row.id, row]));
const SHIP_BY_ID = new Map(SHIPS.map((row) => [row.id, row]));

function fittings(...moduleIds) {
  return fittingsFromDefaultModules('ship_drifter', moduleIds);
}

function derived(...moduleIds) {
  return getDerivedStats('ship_drifter', fittings(...moduleIds));
}

function shipSpec({ id, team = 0, x = 0, z = 0, mass = 30, derivedStats = null, fittings: fitted = [] } = {}) {
  return {
    id,
    type: 'ship', team, factionId: team === 0 ? 'faction_free' : 'faction_reach',
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 10, mass, hull: 200, hullMax: 200,
    shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, armorFlat: 0,
    cap: 200, capMax: 200, capRegen: 4, collides: true, flags: {},
    physicsBody: {
      schemaVersion: 1, radius: 10, mass, inertiaY: mass * 4,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: derivedStats || { damageReductionMult: 1 },
      fittings: fitted,
    },
  };
}

function withFieldsEnabled(t) {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  t.after(() => { FIELD_FLAGS.enabled = previous; });
}

test('Plan45 modules are real fits, tech/recovery reachable, and Outfitting shows their owner deltas', () => {
  const commonIds = [
    'mod_anchor_plates_m',
    'mod_gyro_dampeners_m',
    'mod_field_amplifier_m',
    'mod_inertial_comp_m',
    'mod_fuel_scoop_m',
    'mod_decoy_launcher_s',
  ];
  const forbiddenIds = [
    'mod_overcharge_coil_forbidden',
    'mod_mass_faker_forbidden',
    'mod_deadman_reactor_forbidden',
  ];
  for (const id of [...commonIds, ...forbiddenIds]) assert.ok(MODULE_BY_ID.has(id), `${id} is catalogued`);

  const unlocked = new Set(TECH_NODES.flatMap((node) => node.unlocks?.modules || []));
  for (const id of commonIds) assert.ok(unlocked.has(id), `${id} has an ordinary research route`);
  for (const id of forbiddenIds) {
    const def = MODULE_BY_ID.get(id);
    assert.equal(def.purchasable, false);
    assert.equal(def.salvageOnly, true);
    assert.equal(unlocked.has(id), false, `${id} cannot leak into ordinary research`);
    assert.ok(UNIQUE_WRECKS.some((wreck) => wreck.uniqueDrops.some((drop) => drop.id === id)),
      `${id} has a physical unique-wreck recovery route`);
  }
  assert.deepEqual(validateUniqueWreckRegistry(), { ok: true, errors: [] },
    'recovery registry remains coherent');

  const wreckingFit = fittings('mod_ram_plate', 'mod_anchor_plates_m');
  const wrecking = getDerivedStats('ship_drifter', wreckingFit);
  assert.equal(wrecking.couplingResistanceMult, 4);
  assert.equal(wrecking.ramDamageDealtMult, 1.8);
  assert.equal(wrecking.ramDamageTakenMult, 0.55);
  assert.ok(synergiesForFittings(wreckingFit).some((row) => row.id === 'wrecking_ball'));

  const gyro = derived('mod_gyro_dampeners_m');
  const inertial = derived('mod_inertial_comp_m');
  assert.equal(gyro.tumbleResistanceMult, 2.5);
  assert.equal(gyro.gyroRecoveryMult, 1.8);
  assert.equal(inertial.thrustResponseMult, 1.25);
  assert.ok(inertial.propulsion.mainAccel > gyro.propulsion.mainAccel * 1.2,
    'inertial compensation raises the V3 propulsion response');
  assert.equal(inertial.maxSpeed, gyro.maxSpeed,
    'equal-mass inertial and gyro fits prove response does not rewrite the speed ceiling');

  const preview = presentShopModuleDelta({
    defId: 'ship_drifter',
    fittings: fittings(),
    moduleId: 'mod_field_amplifier_m',
  });
  assert.equal(preview.ok, true);
  assert.ok(preview.chips.some((chip) => chip.key === 'fieldRadiusMult'));
  assert.ok(preview.chips.some((chip) => chip.key === 'fieldStrengthMult'));

  const ramPreview = presentShopModuleDelta({
    defId: 'ship_drifter',
    fittings: fittings(),
    moduleId: 'mod_ram_plate',
  });
  assert.equal(ramPreview.ok, true);
  assert.ok(ramPreview.chips.some((chip) => chip.key === 'ramDamageDealtMult'
    && chip.tone === 'better'));
  assert.ok(ramPreview.chips.some((chip) => chip.key === 'ramDamageTakenMult'
    && chip.tone === 'better'));

  const pd = WEAPONS.find((row) => row.id === 'wpn_flak_turret_s');
  assert.equal(pd?.intercepts, true,
    'the existing point-defense fit remains the physical interceptor-projectile route');
  assert.equal(SHIP_BY_ID.has('ship_drifter'), true);
});

test('Anchor and gyro fits alter the live Rapier body response without falsifying entity mass', async () => {
  const d = derived('mod_anchor_plates_m', 'mod_gyro_dampeners_m');
  const entity = shipSpec({ id: 'anchored', mass: 30, derivedStats: d });
  const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  try {
    owner.syncFromEntities([entity]);
    owner.step(SIM_DT);
    const body = owner.records.get(entity.id).body;
    assert.ok(Math.abs(body.mass() - 120) < 1e-4,
      'anchor plates multiply the solver mass used by physical shoves');
    assert.ok(Math.abs(body.principalInertia().y - 960) < 1e-4,
      'anchor plus gyro reach the bounded eight-times solver inertia');
    assert.equal(entity.mass, 30);
    assert.equal(entity.physicsBody.mass, 30, 'the save/catalog mass stays authored');
  } finally {
    owner.dispose();
  }
});

test('Field amplifier scales the deployed production field and Overcharge spends three real charges', (t) => {
  withFieldsEnabled(t);
  const sim = createSimulation({ seed: 0x4501, systems: [cargo, fields, crafting] });
  try {
    const { state, bus, registry } = sim;
    state.mode = 'flight';
    state.ui.docked = false;
    state.ui.screenStack = [];
    state.input.actions = {};
    state.input.aimWorld = { x: 240, z: 0 };
    state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
    const amplifier = derived('mod_field_amplifier_m');
    const player = sim.spawn(shipSpec({ id: 'field-player', derivedStats: amplifier }));
    state.playerId = player.id;
    const deployed = [];
    bus.on('fields:deployed', (receipt) => deployed.push(receipt));

    state.input.actions.deployWell = true;
    sim.step(SIM_DT);
    assert.equal(deployed.length, 1);
    assert.equal(deployed[0].radius, FIELD_DEFS.well.radius * amplifier.fieldRadiusMult);
    assert.equal(deployed[0].strength, FIELD_DEFS.well.strength * amplifier.fieldStrengthMult);

    player.data.derived = derived('mod_overcharge_coil_forbidden');
    state.mode = 'paused';
    state.fields.cooldowns.well = state.simTime + 8;
    addCargo(state, 'cmdty_field_emitter_charge', 3);
    const result = registry.get('crafting').useFieldSupply('cmdty_field_emitter_charge', { kind: 'well' });
    assert.equal(result.ok, true);
    assert.equal(result.quantityConsumed, 3);
    assert.equal(state.player.cargo.items.cmdty_field_emitter_charge, undefined);
    assert.equal(state.fields.cooldowns.well, state.simTime);
  } finally {
    sim.dispose();
  }
});

test('Fuel scoop skims the economy fuel owner only beside a slow physical gas body', () => {
  const sim = createSimulation({ seed: 0x4502, systems: [economy] });
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    state.ui.docked = false;
    state.fuel = { current: 10, max: 100 };
    const scoop = derived('mod_fuel_scoop_m');
    const player = sim.spawn(shipSpec({ id: 'scoop-player', x: 0, derivedStats: scoop }));
    state.playerId = player.id;
    const cloud = sim.spawn({
      id: 'gas-cloud', type: 'asteroid', alive: true, collides: true,
      pos: { x: 70, z: 0 }, vel: { x: 0, z: 0 }, radius: 18, mass: 300,
      data: { typeId: 'ast_gas_cloud' },
    });
    const receipts = [];
    bus.on('fuel:scooped', (receipt) => receipts.push(receipt));
    for (let i = 0; i < 30; i++) sim.step(SIM_DT);
    assert.ok(state.fuel.current >= 10.25);
    assert.equal(receipts.at(-1)?.sourceId, cloud.id);

    const before = state.fuel.current;
    player.vel.x = scoop.fuelScoopMaxRelativeSpeed + 1;
    for (let i = 0; i < 30; i++) sim.step(SIM_DT);
    assert.equal(state.fuel.current, before, 'a fast pass cannot silently mint fuel');
    assert.deepEqual(state.player.cargo.items, {}, 'fuel skimming never creates cargo');
  } finally {
    sim.dispose();
  }
});

test('Decoy launcher redirects a live hostile missile through the existing countermeasure owner', () => {
  const sim = createSimulation({ seed: 0x4503, systems: [countermeasures] });
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    state.ui.screenStack = [];
    state.rng = () => 0;
    const player = sim.spawn(shipSpec({
      id: 'decoy-player',
      fittings: ['mod_decoy_launcher_s'],
    }));
    state.playerId = player.id;
    const missile = sim.spawn({
      id: 'hostile-missile', type: 'projectile', alive: true, collides: true,
      team: 1, ownerId: 'attacker', pos: { x: 40, z: 0 }, vel: { x: -80, z: 0 },
      radius: 1, mass: 0.1, data: { kind: 'missile', targetId: player.id, armed: true },
    });
    const deployed = [];
    bus.on('countermeasure:deployed', (receipt) => deployed.push(receipt));
    state.input.deployCountermeasure = true;
    sim.step(SIM_DT);
    assert.equal(deployed.at(-1)?.kind, 'decoy');
    assert.ok(String(missile.data.targetId).startsWith(`cm_decoy_${player.id}_`));
    assert.equal(missile.data.diverted, true);
    assert.equal(missile.alive, true, 'the owner redirects rather than inventing a damage kill');
  } finally {
    sim.dispose();
  }
});

test('Mass Faker changes NPC sensor priority while physical mass stays exact', () => {
  const sim = createSimulation({ seed: 0x4504, systems: [aiPorts] });
  try {
    const { state, helpers } = sim;
    state.mode = 'flight';
    const player = sim.spawn(shipSpec({ id: 'faker-player', team: 0, x: 100, mass: 30 }));
    state.playerId = player.id;
    const observer = sim.spawn(shipSpec({ id: 'observer', team: 1, x: 0, mass: 35 }));
    observer.data.ai = { retaliationTargetId: player.id };

    const before = helpers.aiSensors.frameFor(observer.id, state.tick)
      .contacts.find((contact) => contact.id === player.id);
    player.data.derived = derived('mod_mass_faker_forbidden');
    state.tick++;
    const after = helpers.aiSensors.frameFor(observer.id, state.tick)
      .contacts.find((contact) => contact.id === player.id);
    assert.equal(npcTargetPriorityMass(player), 1200);
    assert.ok(after.massClass > before.massClass);
    assert.ok(after.threat > before.threat);
    assert.equal(player.mass, 30);
    assert.equal(player.physicsBody.mass, 30);
  } finally {
    sim.dispose();
  }
});

test('Dead-Man Reactor fires once from the real player-death edge through bounded combat physics', () => {
  const applied = [];
  const sim = createSimulation({
    seed: 0x4505,
    helpers: {
      combatPhysics: {
        applyImpulse(request) { applied.push(structuredClone(request)); return true; },
      },
    },
    systems: [combat],
  });
  try {
    const { state, bus, registry } = sim;
    state.mode = 'flight';
    state.settings.gameplay.ironman = true;
    const player = sim.spawn(shipSpec({
      id: 'deadman-player', team: 0, x: 0,
      derivedStats: derived('mod_deadman_reactor_forbidden'),
    }));
    state.playerId = player.id;
    const attacker = sim.spawn(shipSpec({ id: 'deadman-attacker', team: 1, x: -100 }));
    const witness = sim.spawn(shipSpec({ id: 'deadman-witness', team: 1, x: 25 }));
    const receipts = [];
    bus.on('combat:emberCookOff', (receipt) => receipts.push(receipt));
    const witnessHull = witness.hull;

    registry.get('combat').kill(player, attacker.id, {
      origin: { kind: 'weapon', id: 'wpn_autocannon_m', weaponId: 'wpn_autocannon_m' },
    });
    assert.equal(player.alive, false);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].provenance, 'dead_man_reactor');
    assert.ok(applied.some((request) => request.entityId === witness.id
      && request.reason === 'dead_man_reactor'));
    assert.equal(witness.hull, witnessHull, 'the forbidden tradeoff stays impulse-only');

    registry.get('combat').kill(player, attacker.id, {});
    assert.equal(receipts.length, 1, 'the ordinary dead-player guard prevents a duplicate blast');
  } finally {
    sim.dispose();
  }
});
