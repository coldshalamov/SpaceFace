import assert from 'node:assert/strict';

import { ContactKind } from '../src/ai/contracts.js';
import { canonicalStringify } from '../src/core/simSnapshot.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const DT = 1 / 60;

const direct = runDirectOwnerScenario();
const directReplay = runDirectOwnerScenario();
assert.deepEqual(directReplay, direct, 'direct encounter owner scenario should replay deterministically');

const tactical = runTacticalDirectorScenario();
const tacticalReplay = runTacticalDirectorScenario();
assert.deepEqual(tacticalReplay, tactical, 'tacticalAI encounter owner scenario should replay deterministically');

assert.equal(direct.spawned.length, 2, 'valid reinforcement package should spawn exactly two ships');
assert(direct.spawned.every((entry) => entry.packageId === 'fixture_wing_pair'), 'spawn records should preserve package id');
assert(direct.spawned.every((entry) => entry.owner === 'sg06'), 'spawned entities should be owned by the SG-06 encounter owner');
assert.equal(direct.pendingCombatReinforcements, null, 'encounter owner must not use legacy state.combat.pendingReinforcements');
assert.deepEqual(direct.storyAfter, direct.storyBefore, 'encounter owner must not mutate story state');
assert.deepEqual(direct.missionsAfter, direct.missionsBefore, 'encounter owner must not mutate mission state');
assert(direct.rejections.some((entry) => entry.reason === 'reinforcement_package_unknown'),
  'unknown reinforcement packages should be rejected by the encounter owner');
assert(direct.busEvents.includes('ai:reinforcementScheduled'), 'owner should emit scheduled reinforcement evidence');
assert(direct.busEvents.includes('ai:reinforcementSpawned'), 'owner should emit spawned reinforcement evidence');

assert(tactical.commands.some((command) => command.type === 'request_reinforcement'),
  'tacticalAI director should issue a reinforcement request through aiPorts');
assert.equal(tactical.spawned.length, 2, 'tacticalAI reinforcement request should be consumed by the encounter owner');
assert(tactical.spawned.every((entry) => entry.owner === 'sg06'), 'tacticalAI-spawned reinforcements should carry SG-06 ownership metadata');
assert.equal(tactical.pendingCombatReinforcements, null,
  'tacticalAI encounter owner path must not use legacy state.combat.pendingReinforcements');

console.log('SG-06 active encounter owner checks OK');

function runDirectOwnerScenario() {
  const harness = makeHarness(0x4706e001);
  const before = ownershipSnapshot(harness.state);

  const commands = [
    { tick: 10, type: 'phase', phase: 'build' },
    { tick: 11, type: 'request_reinforcement', packageId: 'fixture_wing_pair', budgetRemaining: 2 },
    { tick: 12, type: 'order_retreat', reason: 'owner_fixture' },
    { tick: 13, type: 'narrative_beat', beatIndex: 4 },
    { tick: 14, type: 'request_reinforcement', packageId: 'missing_package', budgetRemaining: 1 },
  ];
  for (const command of commands) {
    assert.equal(harness.helpers.aiEncounter.issue(command), true, `aiPorts should record command ${command.type}`);
  }

  harness.aiEncounter.update(DT, harness.state);
  assert.equal(harness.state.entityList.length, 1, 'owner should schedule reinforcements before the due tick, not spawn immediately');
  assert.equal(harness.state.aiEncounter.owner.pendingReinforcements.length, 2,
    'owner should schedule two pending reinforcements from the valid package');

  harness.core.preStep(DT, harness.state);
  harness.aiEncounter.update(DT, harness.state);

  const owner = harness.state.aiEncounter.owner;
  const after = ownershipSnapshot(harness.state);
  return {
    commands: harness.state.aiEncounter.commands.map(compactCommand),
    spawned: spawnedEntities(harness.state),
    owner: compactOwner(owner),
    rejections: owner.rejectedCommands.map(compactRecord),
    pendingCombatReinforcements: after.pendingCombatReinforcements,
    storyBefore: before.story,
    storyAfter: after.story,
    missionsBefore: before.missions,
    missionsAfter: after.missions,
    busEvents: harness.busEvents.map((entry) => entry.event).sort(),
  };
}

function runTacticalDirectorScenario() {
  const harness = makeHarness(0x4706e002);
  const tacticalAI = createTacticalAISystem({
    seed: harness.state.meta.seed,
    sensors: { frameFor: tacticalSensorFrame },
    roster: { listSquads: () => tacticalRoster() },
    maneuver: { request: () => true },
    actionPortFactory: () => noopActions(),
    authoredEncounter: () => ({
      threatEnvelope: { min: 0.16, max: 0.76 },
      pressureBias: 0.3,
      reinforcementPackageId: 'fixture_wing_pair',
    }),
    config: {
      director: {
        respiteMinTicks: 0,
        respiteMaxTicks: 1,
        buildMinTicks: 999,
        buildMaxTicks: 999,
        peakMinTicks: 1,
        peakMaxTicks: 8,
        peakThreshold: 1,
        reinforceThreshold: 0.05,
        reinforcementCooldownTicks: 20,
        narrativeCooldownTicks: 999,
      },
      squad: { minTacticTicks: 1 },
      behavior: { minCommitTicks: 1 },
    },
  });
  tacticalAI.init(harness.ctx);

  for (let i = 0; i < 6; i++) {
    harness.core.preStep(DT, harness.state);
    tacticalAI.update(DT, harness.state);
    harness.aiEncounter.update(DT, harness.state);
  }

  return {
    commands: harness.state.aiEncounter.commands.map(compactCommand),
    spawned: spawnedEntities(harness.state),
    owner: compactOwner(harness.state.aiEncounter.owner),
    pendingCombatReinforcements: ownershipSnapshot(harness.state).pendingCombatReinforcements,
  };
}

function makeHarness(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const busEvents = [];
  const bus = createBus(busEvents);
  const helpers = {};
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  const runtime = {
    state,
    bus,
    busEvents,
    helpers,
    ctx,
    core: Object.create(core),
    aiPorts: Object.create(aiPorts),
    aiEncounter: Object.create(aiEncounter),
  };
  runtime.core.init(ctx);
  runtime.aiPorts.init(ctx);
  runtime.aiEncounter.init(ctx);
  const player = helpers.spawnEntity(makeShipSpec({ team: 0, x: 25, z: -15, role: 'player_anchor' }));
  state.playerId = player.id;
  state.spatialHash.rebuild(state.entityList);
  return runtime;
}

function tacticalRoster() {
  return [{
    id: 'sg06_owner_fixture_squad',
    doctrine: 'scavenger',
    faction: 'faction_vael',
    formation: 'wedge',
    formationSpacing: 72,
    formationBound: 170,
    members: [{
      id: 101,
      preferredRole: 'leader',
      capabilities: ['drive', 'weapon', 'sensor'],
    }],
  }];
}

function tacticalSensorFrame(_entityId, tick) {
  return {
    tick,
    self: {
      id: 101,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 12,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'weapon', 'sensor'],
      subsystemFractions: { subsystem_drive: 1, subsystem_weapon: 1, subsystem_sensor: 1 },
    },
    contacts: [{
      id: 1,
      kind: ContactKind.SHIP,
      team: 0,
      classification: 'player_ship_sensor_track',
      pos: { x: 260, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 14,
      confidence: 1,
      threat: 0.95,
      tags: ['armed'],
    }],
    events: [],
  };
}

function noopActions() {
  return Object.freeze({
    list() { return Object.freeze([]); },
    canStart() { return { ok: false, reason: 'encounter_owner_no_actions' }; },
    start() { return null; },
    status() { return 'failed'; },
    interrupt() { return false; },
  });
}

function ownershipSnapshot(state) {
  return {
    pendingCombatReinforcements: state.combat && state.combat.pendingReinforcements
      ? canonicalStringify(state.combat.pendingReinforcements)
      : null,
    story: canonicalStringify(state.story),
    missions: canonicalStringify(state.missions),
  };
}

function compactCommand(command) {
  const out = {};
  for (const key of Object.keys(command).sort()) out[key] = command[key];
  return out;
}

function compactOwner(owner) {
  return {
    phase: owner.phase,
    lastAppliedSeq: owner.lastAppliedSeq,
    pendingReinforcements: owner.pendingReinforcements.length,
    scheduled: owner.scheduled.map(compactRecord),
    spawned: owner.spawned.map(compactRecord),
  };
}

function compactRecord(record) {
  const out = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? compactRecord(value) : value;
  }
  return out;
}

function spawnedEntities(state) {
  return state.entityList
    .filter((entity) => entity.data && entity.data.encounter && entity.data.encounter.owner === 'sg06')
    .map((entity) => ({
      id: entity.id,
      type: entity.type,
      factionId: entity.factionId,
      squadId: entity.data.ai && entity.data.ai.squadId,
      owner: entity.data.encounter.owner,
      commandSeq: entity.data.encounter.commandSeq,
      packageId: entity.data.encounter.packageId,
      pos: { x: round3(entity.pos.x), z: round3(entity.pos.z) },
    }))
    .sort((a, b) => a.id - b.id);
}

function makeShipSpec({ team, x, z, role }) {
  return {
    type: 'ship',
    alive: true,
    collides: true,
    radius: 12,
    mass: 32,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    team,
    factionId: team === 0 ? 'faction_free' : 'faction_vael',
    hull: 150,
    hullMax: 150,
    armorHp: 40,
    armorMax: 40,
    armorFlat: 2,
    shield: 60,
    shieldMax: 60,
    cap: 100,
    capMax: 100,
    capRegen: 8,
    data: { role, combatProfileId: 'combat_profile_standard_ship' },
  };
}

function createBus(events) {
  const listeners = new Map();
  return {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      events.push(Object.freeze({ event, payload }));
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
    queue(event, payload) {
      this.emit(event, payload);
    },
    flush() {},
  };
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
