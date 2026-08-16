import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { CombatDoctrineId, CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { SKITTER_ROCK_MOVE_THRESHOLD_WU } from '../src/ai/skitterCoverPolicy.js';
import { createSimulation } from '../src/core/sim.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { CREDIT_CHIP_KIND } from '../src/data/killRewards.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { cargo } from '../src/systems/cargo.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { activeFieldSnapshot, fields } from '../src/systems/fields.js';
import { lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';

const DT = 1 / 60;

function enableKillBursts(t) {
  const prior = {
    enabled: MASSLINE2_FLAGS.enabled,
    lootShards: MASSLINE2_FLAGS.lootShards,
  };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  t.after(() => {
    MASSLINE2_FLAGS.enabled = prior.enabled;
    MASSLINE2_FLAGS.lootShards = prior.lootShards;
  });
}

function bootRoute(t, enemyId, {
  seed,
  pos = { x: 240, z: 0 },
  systems = [],
  helpers = {},
} = {}) {
  enableKillBursts(t);
  const sim = createSimulation({
    seed,
    helpers,
    systems: [...systems, economy, lootShards, mining, cargo, combat],
  });
  t.after(() => sim.dispose());
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, mass: 24, hull: 100, hullMax: 100,
    armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    cap: 100, capMax: 100, collides: true,
    data: { defId: 'ship_kestrel', combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  registry.get('economy').newGame();
  state.player.credits = 0;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 1000, capMass: 1000,
  };

  const enemy = sim.spawn(makeEnemySpawnSpec(enemyId, 4, pos));
  enemy.data.worldRecordId = `counter-kill-route:${enemyId}`;
  enemy.data.encounter = true;
  const deaths = [];
  const drops = [];
  const collections = [];
  bus.on('entity:killed', (payload) => deaths.push(structuredClone(payload)));
  bus.on('loot:drop', (payload) => drops.push(structuredClone(payload)));
  bus.on('pickup:collected', (payload) => collections.push(payload));
  return { sim, state, bus, registry, player, enemy, deaths, drops, collections };
}

function physicalPickupsForBurst(route, items) {
  const candidates = route.state.entityList.filter((entity) => (
    entity.alive !== false && entity.type === 'pickup'
  ));
  const used = new Set();
  return items.map((item) => {
    const pickup = candidates.find((entity) => {
      if (used.has(entity.id)) return false;
      if (item.kind === CREDIT_CHIP_KIND) {
        return entity.data?.kind === CREDIT_CHIP_KIND
          && entity.data?.grantReason === item.grantReason
          && entity.data?.amount === item.credits;
      }
      return entity.data?.commodityId === item.commodityId
        && entity.data?.amount === item.qty;
    });
    assert.ok(pickup, `live pickup missing for ${item.kind || item.commodityId}`);
    used.add(pickup.id);
    return pickup;
  });
}

function killAndCollect(route, expected) {
  route.bus.emit('projectile:hit', {
    targetId: route.enemy.id,
    ownerId: route.player.id,
    damage: 10_000,
    damageType: 'kinetic',
    weaponId: 'wpn_pulse_laser_s',
    pos: { x: route.enemy.pos.x, z: route.enemy.pos.z },
  });

  assert.equal(route.enemy.alive, false, 'the production damage owner retires the physical actor');
  const death = route.deaths.find((receipt) => receipt.id === route.enemy.id);
  assert.ok(death, 'combat publishes the actor death');
  assert.equal(death.killerId, route.player.id);

  const burst = route.drops.find((drop) => drop.source === 'kill_burst');
  assert.ok(burst, 'the production hostile-kill listener publishes a physical burst');
  const chips = burst.items.filter((item) => item.kind === CREDIT_CHIP_KIND);
  const materials = burst.items.filter((item) => item.commodityId);
  assert.equal(chips.length, expected.chips);
  assert.deepEqual(
    [...new Set(materials.map((item) => item.commodityId))].sort(),
    expected.materials.slice().sort(),
  );

  const physical = physicalPickupsForBurst(route, burst.items);
  const creditsBeforePickup = route.state.player.credits;
  for (const [index, pickup] of physical.entries()) {
    pickup.pos.x = route.player.pos.x + 3 + index * 0.01;
    pickup.pos.z = route.player.pos.z;
    pickup.vel.x = 0;
    pickup.vel.z = 0;
    route.sim.step(DT);
    assert.equal(pickup.alive, false, 'each selected reward body settles through physical collection');
  }

  const expectedChipCredits = chips.reduce((sum, item) => sum + item.credits, 0);
  assert.equal(route.state.player.credits - creditsBeforePickup, expectedChipCredits);
  for (const commodityId of expected.materials) {
    const expectedQty = materials
      .filter((item) => item.commodityId === commodityId)
      .reduce((sum, item) => sum + item.qty, 0);
    assert.equal(route.state.player.cargo.items[commodityId], expectedQty);
  }
  assert.equal(
    route.collections.filter((payload) => physical.some((pickup) => pickup.id === payload.pickupId)).length,
    physical.length,
    'each authored reward body reaches the ordinary collection event',
  );
}

function dartDirective(playerId) {
  return {
    squadId: 'dart-counter-kill', tactic: 'focus_fire', focusTargetId: playerId,
    objective: { kind: ObjectiveKind.FOCUS, targetId: playerId, reason: 'counter_route' },
    formation: {
      slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170,
      breakFormation: true,
    },
  };
}

function dartPerception(route, targetZ) {
  return {
    self: {
      id: route.enemy.id, team: route.enemy.team,
      pos: { x: route.enemy.pos.x, z: route.enemy.pos.z },
      vel: { x: route.enemy.vel.x, z: route.enemy.vel.z }, rot: route.enemy.rot,
      radius: route.enemy.radius, hullFraction: 1, energyFraction: 1, heatFraction: 0,
      combatRoleId: route.enemy.data.lootTableId, maxSpeed: route.enemy.maxSpeed,
      operationalMassBand: 'light',
      activity: route.enemy.data.ai.activity, roe: route.enemy.data.ai.roe,
    },
    contacts: [{
      id: route.player.id, kind: ContactKind.SHIP, team: route.player.team,
      alive: true, valid: true, visible: true, confidence: 1, threat: 0.8, hostile: true,
      pos: { x: 400, z: targetZ }, vel: { x: 0, z: 0 }, radius: route.player.radius,
      operationalMassBand: 'medium', mobilityBand: 'medium', cargoBand: 'empty',
      tetherabilityBand: 'good', tags: [],
    }],
    events: [],
  };
}

test('Dart lane crossing continues through the physical payroll-chip kill read', (t) => {
  const route = bootRoute(t, 'dart_swarmer', { seed: 0xac1201 });
  const runtime = new CombatDoctrineRuntime({ seed: 0xac1201 });
  const directive = dartDirective(route.player.id);
  runtime.update({
    tick: 0, entityId: route.enemy.id, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: dartPerception(route, 0), directive,
  });
  const strike = runtime.update({
    tick: 30, entityId: route.enemy.id, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: dartPerception(route, 0), directive,
  });
  assert.equal(strike.phase, 'strike');
  assert.equal(strike.straightPass, true);
  const countered = runtime.update({
    tick: 31, entityId: route.enemy.id, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: dartPerception(route, 60), directive,
  });
  assert.equal(countered.outcome, 'lane_crossed');
  assert.equal(countered.phase, 'extend');

  killAndCollect(route, { chips: 2, materials: ['cmdty_scrap_metal'] });
});

test('displacing a live Flea anchor continues through its field-component kill read', (t) => {
  const priorFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  t.after(() => { FIELD_FLAGS.enabled = priorFields; });
  const route = bootRoute(t, 'flea_swarmer', {
    seed: 0xac1202,
    pos: { x: 80, z: 0 },
    systems: [fields],
  });
  route.bus.emit('ai:doctrinePhase', {
    entityId: route.enemy.id,
    targetId: route.player.id,
    doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER,
    phase: 'anchor_hold',
    tick: route.state.tick,
  });
  route.sim.step(DT);
  assert.deepEqual(activeFieldSnapshot(route.state).at(0)?.center, { x: 80, z: 0 });

  route.enemy.pos.x = 360;
  route.enemy.pos.z = 40;
  route.sim.step(DT);
  assert.deepEqual(
    activeFieldSnapshot(route.state).at(0)?.center,
    { x: 360, z: 40 },
    'shoving the physical hull takes its snare away from the player instead of leaving force behind',
  );

  killAndCollect(route, {
    chips: 1,
    materials: ['cmdty_comp_circuitry', 'cmdty_electronics'],
  });
  assert.equal(activeFieldSnapshot(route.state).length, 0, 'the dead anchor owns no lingering field');
});

test('moving a Skitter rock flushes the live ambusher into its mining-ore kill read', (t) => {
  const route = bootRoute(t, 'skitter_swarmer', {
    seed: 0xac1203,
    pos: { x: 1420, z: 0 },
    systems: [aiPorts],
  });
  for (let index = 0; index < 5; index++) {
    route.sim.spawn({
      type: 'asteroid', pos: { x: 1180 + index * 100, z: (index - 2) * 90 },
      vel: { x: 0, z: 0 }, radius: 42, mass: 900, hull: 300, hullMax: 300,
      alive: true, collides: true, data: {},
    });
  }
  const port = route.registry.get('aiPorts');
  assert.equal(port._listSquads(0, { freezeResults: false }).length, 0);
  const cover = route.enemy.data.ai.skitterCover;
  assert.equal(cover.phase, 'nested');
  const assignedRock = route.state.entities.get(cover.assignedRockId);
  assignedRock.pos.x += SKITTER_ROCK_MOVE_THRESHOLD_WU + 1;
  const roster = port._listSquads(1, { freezeResults: false });
  assert.equal(roster.some((squad) => squad.members.some((member) => member.id === route.enemy.id)), true);
  assert.equal(cover.phase, 'spring');
  assert.equal(cover.triggerReason, 'cover_moved');

  killAndCollect(route, {
    chips: 0,
    materials: ['cmdty_ore_iron', 'cmdty_silicate'],
  });
});

test('aiming an Ember cook-off at a nearby body continues through its scorched payroll kill read', (t) => {
  const impulses = [];
  const route = bootRoute(t, 'ember_swarmer', {
    seed: 0xac1204,
    pos: { x: 240, z: 0 },
    helpers: {
      combatPhysics: {
        applyImpulse(payload) {
          impulses.push(structuredClone(payload));
          return true;
        },
      },
    },
  });
  const aimedBody = route.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x: 265, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 20,
    hull: 100, hullMax: 100, alive: true, collides: true, data: {},
  });
  const clearBody = route.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 20,
    hull: 100, hullMax: 100, alive: true, collides: true, data: {},
  });

  killAndCollect(route, { chips: 2, materials: ['cmdty_scrap_metal'] });
  assert.equal(impulses.some((entry) => entry.entityId === aimedBody.id), true);
  assert.equal(impulses.some((entry) => entry.entityId === clearBody.id), false);
  assert.equal(aimedBody.hull, 100, 'the aimed cook-off stays impulse-only');
});
