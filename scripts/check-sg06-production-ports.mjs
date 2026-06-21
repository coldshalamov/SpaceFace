import assert from 'node:assert/strict';

import { TacticalAIStack } from '../src/ai/stack.js';
import { AI_CONTRACT_VERSION } from '../src/ai/contracts.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { physics } from '../src/core/physics.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { flight } from '../src/systems/flight.js';
import { aiPorts } from '../src/systems/aiPorts.js';

const DT = 1 / 60;

const harness = makeHarness({ backend: 'rapier-dynamic' });
const { state, helpers } = harness;
const player = helpers.spawnEntity(makeShipSpec({ team: 0, x: -220, factionId: 'faction_free' }));
const wingA = helpers.spawnEntity(makeShipSpec({
  team: 1,
  x: 0,
  factionId: 'faction_scn',
  ai: { squadId: 'sg06_port_wing', doctrine: 'official', preferredRole: 'leader', capabilities: ['ranged', 'disable'] },
}));
const wingB = helpers.spawnEntity(makeShipSpec({
  team: 1,
  x: 84,
  factionId: 'faction_scn',
  ai: { squadId: 'sg06_port_wing', doctrine: 'official', preferredRole: 'tug', capabilities: ['tug', 'counter_tether_cut'] },
}));
helpers.spawnEntity(makeShipSpec({
  team: 1,
  x: 180,
  factionId: 'faction_mts',
  ai: { passive: true, squadId: 'traffic_should_not_join' },
}));
state.playerId = player.id;
harness.kernel = getCombatKernel(harness.ctx);
harness.rebuildSpatialHash();
poisonHiddenState(state, wingA);

const frame = helpers.aiSensors.frameFor(wingA.id, 7);
assertFrameWhitelist(frame);
assert.equal(frame.self.id, wingA.id, 'sensor self id should identify the requested entity');
assert.notEqual(frame.self.pos, wingA.pos, 'sensor frame must copy position, not expose entity refs');
assert(frame.contacts.some((contact) => contact.id === player.id), 'sensor frame should expose nearby hostile ship contacts');
for (const contact of frame.contacts) {
  assertNoForbiddenKeys(contact);
  if (contact.id === player.id) assert.notEqual(contact.pos, player.pos, 'contacts must copy positions');
}
assertNoForbiddenKeys(frame);
assert.equal(JSON.stringify(frame).includes('private'), false, 'sensor frame must not serialize poisoned private state');
assert(Object.isFrozen(frame), 'normalized sensor frame should be immutable');
assert(Object.isFrozen(frame.self), 'normalized sensor self should be immutable');

const rosterA = helpers.aiRoster.listSquads(8);
const rosterB = helpers.aiRoster.listSquads(8);
assert.deepEqual(rosterB, rosterA, 'unchanged production roster should be deterministic');
assert.equal(rosterA.length, 1, 'passive traffic should not enter the SG-06 tactical roster');
assert.equal(rosterA[0].members.length, 2, 'active tactical wing should contain both AI ships');
assertUniqueRosterMembers(rosterA);
for (const member of rosterA[0].members) {
  assert.deepEqual(member.capabilities, [...member.capabilities].sort(), 'member capabilities should be sorted');
}

const wingARuntime = combatRuntime(state, wingA.id);
const wingAOriginalCaps = { ...wingARuntime.capabilities };
wingARuntime.capabilities = { ...wingARuntime.capabilities, weapon: false, sensor: false };
const disabledFrame = helpers.aiSensors.frameFor(wingA.id, 9);
assert(!disabledFrame.self.capabilities.includes('weapon'), 'disabled weapon subsystem should be absent from sensor self capabilities');
assert(!disabledFrame.self.capabilities.includes('sensor'), 'disabled sensor subsystem should be absent from sensor self capabilities');
assert(!disabledFrame.self.capabilities.includes('ranged'), 'authored ranged tag must not override disabled weapon/sensor capability');
assert(!disabledFrame.self.capabilities.includes('disable'), 'authored disable tag must not override disabled weapon/sensor capability');
const disabledRoster = helpers.aiRoster.listSquads(9);
const disabledMember = disabledRoster[0].members.find((member) => member.id === wingA.id);
assert(disabledMember, 'disabled test ship should remain in the tactical roster');
assert(!disabledMember.capabilities.includes('ranged'), 'roster capabilities must reflect disabled weapon/sensor state');
assert(!disabledMember.capabilities.includes('disable'), 'roster capabilities must not re-add authored tags blocked by runtime capabilities');
wingARuntime.capabilities = wingAOriginalCaps;

const shadowManeuvers = [];
const stack = new TacticalAIStack({
  seed: state.meta.seed,
  ports: {
    sensors: helpers.aiSensors,
    roster: helpers.aiRoster,
    actions: noopActions(),
    maneuver: { request: (request) => { shadowManeuvers.push(request); return true; } },
  },
});
const rolesAt8 = roleMap(stack.update(8, authoredEnvelope()));
const rolesAt9 = roleMap(stack.update(9, authoredEnvelope()));
assert.deepEqual(rolesAt9, rolesAt8, 'stable production roster should preserve SG-06 roles across ticks');
assert(shadowManeuvers.length > 0, 'shadow SG-06 stack should emit maneuver requests through the port boundary');

const wingC = helpers.spawnEntity(makeShipSpec({
  team: 1,
  x: 140,
  factionId: 'faction_scn',
  ai: { squadId: 'sg06_port_wing', doctrine: 'official', preferredRole: 'screen', capabilities: ['screen'] },
}));
harness.rebuildSpatialHash();
const rosterC = helpers.aiRoster.listSquads(10);
assert.notEqual(JSON.stringify(rosterC), JSON.stringify(rosterA), 'roster signature should change when tactical membership changes');
assert(rosterC[0].members.some((member) => member.id === wingC.id), 'new tactical member should enter the roster');

assert.throws(() => {
  const duplicateStack = new TacticalAIStack({
    seed: 1,
    ports: {
      sensors: helpers.aiSensors,
      roster: { listSquads: () => [{ ...rosterA[0], members: [rosterA[0].members[0], rosterA[0].members[0]] }] },
      actions: noopActions(),
      maneuver: { request: () => true },
    },
  });
  duplicateStack.update(0, authoredEnvelope());
}, /appears in more than one squad/, 'SG-06 stack should reject duplicate roster membership');

await ensureSg02Ready(harness);
wingA.pos.x = 0;
wingA.pos.z = 0;
wingA.vel.x = 0;
wingA.vel.z = 0;
wingA.rot = 0;
wingA.angVel = 0;
wingA.data.intent = null;
harness.flight.update(DT, state);
const request = {
  version: AI_CONTRACT_VERSION,
  entityId: wingA.id,
  tick: state.tick,
  kind: 'intercept',
  forceLocal: { forward: 1, right: 0.25 },
  torqueYaw: 0.5,
  boost: false,
  brake: false,
  targetHeading: 0.5,
  horizonTicks: 45,
  trajectory: [{ x: 80, z: 12, tick: state.tick + 45 }],
  reason: 'sg06_production_port_fixture',
};
assert.equal(helpers.aiManeuver.request(request), true, 'SG-06 maneuver port should accept when SG-02 is ready');
harness.aiPorts.update(DT, state);
assert.equal(wingA.pos.x, 0, 'aiManeuver should not move entities before physics consumes the command');
assert.equal(wingA.vel.x, 0, 'aiManeuver should not mutate velocity directly');
harness.physics.update(DT, state);
const telemetry = readPhysicsTelemetry(wingA);
assert(telemetry, 'SG-02 should publish telemetry after consuming an AI maneuver');
assert.equal(telemetry.mode, 'rapier-dynamic', 'AI maneuver should flow through the rapier-dynamic owner');
assert(telemetry.force.x > 0, 'AI maneuver should apply positive forward force through SG-02');
assert(telemetry.torque.y > 0, 'AI maneuver should apply yaw torque through SG-02');
assert(wingA.pos.x > 0, 'craft should move only after the SG-02 physics step');
assert.equal(harness.aiPorts.inspect().flushedManeuvers > 0, true, 'aiPorts diagnostics should report flushed maneuvers');

const customHarness = makeHarness({ backend: 'custom' });
const customShip = customHarness.helpers.spawnEntity(makeShipSpec({ team: 1, x: 0, factionId: 'faction_scn', ai: { squadId: 'custom' } }));
customHarness.state.playerId = 0;
assert.equal(customHarness.helpers.aiManeuver.request({ ...request, entityId: customShip.id }), false,
  'AI maneuver must fail closed outside rapier-dynamic');
assert.equal(customShip.data.intent, undefined, 'AI maneuver must not fall back to legacy intent');
customHarness.aiPorts.update(DT, customHarness.state);
customHarness.physics.update(DT, customHarness.state);
assert.equal(readPhysicsTelemetry(customShip), null, 'custom backend must not produce SG-02 telemetry');
assert.equal(customShip.pos.x, 0, 'custom-backend rejected maneuver should not move the craft');

disposeHarness(customHarness);
disposeHarness(harness);

console.log('SG-06 production port checks OK');

function makeHarness({ backend }) {
  const state = createGameState(0x4706);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = backend;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  const runtime = {
    state,
    bus,
    helpers,
    ctx,
    core: Object.create(core),
    physics: Object.create(physics),
    flight: Object.create(flight),
    aiPorts: Object.create(aiPorts),
    kernel: null,
    rebuildSpatialHash() {
      state.spatialHash.rebuild(state.entityList);
    },
  };
  runtime.core.init(ctx);
  runtime.physics.init(ctx);
  runtime.aiPorts.init(ctx);
  runtime.flight.init(ctx);
  return runtime;
}

async function ensureSg02Ready(harness) {
  harness.physics.update(DT, harness.state);
  if (harness.physics._sg02Init) await harness.physics._sg02Init;
  harness.physics.update(DT, harness.state);
  assert(harness.physics._sg02, 'SG-02 owner should initialize for production port fixture');
  assert.equal(harness.state.physicsRuntime.diagnostics.sg02Ready, true, 'physics diagnostics should mark SG-02 ready');
}

function makeShipSpec({ team, x, factionId, ai = null }) {
  return {
    type: 'ship',
    alive: true,
    collides: true,
    radius: 12,
    mass: 32,
    thrust: 90,
    turnRate: 3,
    drag: 1.2,
    maxSpeed: 140,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    team,
    factionId,
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
    flightModel: { inertia: 88 },
    data: ai ? {
      ai,
      weapons: [{ id: 'wpn_fixture', projSpeed: 360 }],
      combatProfileId: 'combat_profile_standard_ship',
    } : {
      combatProfileId: 'combat_profile_standard_ship',
    },
  };
}

function poisonHiddenState(state, entity) {
  Object.defineProperty(state, 'player', {
    configurable: true,
    enumerable: true,
    get() { throw new Error('hidden player state read'); },
  });
  Object.defineProperty(state, 'render', {
    configurable: true,
    enumerable: true,
    get() { throw new Error('renderer state read'); },
  });
  Object.defineProperty(entity.data, 'privateMissionState', {
    configurable: true,
    enumerable: true,
    get() { throw new Error('private entity data read'); },
  });
}

function assertFrameWhitelist(frame) {
  assertExactKeys(frame, ['contacts', 'events', 'self', 'tick'], 'SensorFrame');
  assertExactKeys(frame.self, [
    'capabilities', 'disabled', 'energyFraction', 'heatFraction', 'hullFraction', 'id',
    'pos', 'radius', 'rot', 'subsystemFractions', 'team', 'tethered', 'vel',
  ], 'SensorFrame.self');
  assertExactKeys(frame.self.pos, ['x', 'z'], 'SensorFrame.self.pos');
  assertExactKeys(frame.self.vel, ['x', 'z'], 'SensorFrame.self.vel');
  for (const contact of frame.contacts) {
    assertExactKeys(contact, [
      'attachmentId', 'classification', 'confidence', 'disabled', 'exposed', 'id', 'kind',
      'massClass', 'objectiveValue', 'ownedBySelf', 'ownerId', 'pos', 'radius', 'sourceSocketId',
      'tags', 'targetId', 'targetSocketId', 'team', 'tethered', 'threat', 'vel',
    ], 'SensorFrame.contact');
    assertExactKeys(contact.pos, ['x', 'z'], 'SensorFrame.contact.pos');
    assertExactKeys(contact.vel, ['x', 'z'], 'SensorFrame.contact.vel');
  }
  for (const event of frame.events) {
    assertExactKeys(event, ['magnitude', 'sourceId', 'tags', 'targetId', 'type'], 'SensorFrame.event');
  }
}

function assertExactKeys(value, keys, label) {
  assert.deepEqual(Object.keys(value).sort(), keys.slice().sort(), `${label} should expose only the SG-06 whitelist`);
}

function assertNoForbiddenKeys(value) {
  const forbidden = new Set(['camera', 'data', 'entity', 'mesh', 'player', 'render', 'state', 'ui', 'view']);
  visit(value, (node) => {
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      assert.equal(forbidden.has(key), false, `forbidden key leaked through SG-06 port: ${key}`);
    }
  });
}

function visit(value, fn, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  fn(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) visit(item, fn, seen);
}

function assertUniqueRosterMembers(roster) {
  const seen = new Set();
  for (const squad of roster) {
    for (const member of squad.members) {
      const key = String(member.id);
      assert.equal(seen.has(key), false, `duplicate roster member ${key}`);
      seen.add(key);
    }
  }
}

function combatRuntime(state, entityId) {
  const runtime = state.combat && state.combat.entities && state.combat.entities[String(entityId)];
  assert(runtime, `expected SG-03 combat runtime for entity ${entityId}`);
  return runtime;
}

function roleMap(result) {
  const out = {};
  for (const squad of result.squads) {
    for (const directive of squad.directives) out[`${directive.squadId}:${directive.memberId}`] = directive.role;
  }
  return out;
}

function noopActions() {
  return Object.freeze({
    list() { return Object.freeze([]); },
    canStart() { return { ok: false, reason: 'no_actions_in_port_fixture' }; },
    start() { return null; },
    status() { return 'failed'; },
    interrupt() { return false; },
  });
}

function authoredEnvelope() {
  return { threatEnvelope: { min: 0.16, max: 0.76 } };
}

function disposeHarness(harness) {
  if (harness.kernel && typeof harness.kernel.dispose === 'function') harness.kernel.dispose();
  if (harness.physics && typeof harness.physics._disableSg02DynamicAuthority === 'function') {
    harness.physics._disableSg02DynamicAuthority();
  }
}

function createBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
    queue(event, payload) {
      this.emit(event, payload);
    },
    flush() {},
  };
}
