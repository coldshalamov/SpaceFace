import assert from 'node:assert/strict';

import { canonicalStringify } from '../src/core/simSnapshot.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const DT = 1 / 60;
const ALLOWED_TYPES = new Set(['phase', 'request_reinforcement', 'order_retreat', 'narrative_beat']);

const first = runScenario();
const second = runScenario();

assert.deepEqual(second.commands, first.commands, 'encounter command recording should replay deterministically');
assert.deepEqual(second.busCommands, first.busCommands, 'encounter command events should replay deterministically');
assert.deepEqual(first.afterOwnership, first.beforeOwnership,
  'encounter sink must not mutate spawn, reinforcement, mission, or story ownership');
assert(first.commands.every((command) => ALLOWED_TYPES.has(command.type)),
  'encounter sink should record only whitelisted director command types');
assert(first.directCommands.every((command) => Object.isFrozen(command)),
  'recorded encounter commands should be frozen snapshots');
assert(first.aiCommandCount > 0, 'tacticalAI should issue at least one command through the production encounter sink');
assert(first.rejectedEncounterCommands >= 3, 'invalid encounter commands should fail closed');

console.log('SG-06 encounter sink checks OK');

function runScenario() {
  const harness = makeHarness();
  const beforeOwnership = ownershipSnapshot(harness.state);
  const directCommands = issueDirectCommands(harness);
  const directCount = directCommands.length;
  const rejectedBefore = harness.helpers.inspectAIPorts().rejectedEncounterCommands;

  assert.equal(harness.helpers.aiEncounter.issue({ type: 'spawn', packageId: 'forbidden' }), false,
    'encounter sink must reject spawn-shaped commands');
  assert.equal(harness.helpers.aiEncounter.issue({ type: 'phase', phase: 'bogus' }), false,
    'encounter sink must reject invalid director phases');
  assert.equal(harness.helpers.aiEncounter.issue(null), false,
    'encounter sink must reject non-object commands');

  const tacticalAI = createTacticalAISystem({
    seed: harness.state.meta.seed,
    config: {
      director: {
        respiteMinTicks: 0,
        respiteMaxTicks: 3,
        buildMinTicks: 1,
        buildMaxTicks: 3,
        peakMinTicks: 1,
        peakMaxTicks: 3,
        retreatMinTicks: 1,
        reinforcementCooldownTicks: 4,
        narrativeCooldownTicks: 3,
      },
    },
    actionPortFactory: () => noopActions(),
    maneuver: Object.freeze({ request: () => true }),
  });
  tacticalAI.init(harness.ctx);

  for (let i = 0; i < 8; i++) {
    harness.core.preStep(DT, harness.state);
    tacticalAI.update(DT, harness.state);
    harness.core.lifetimeSweep(DT, harness.state);
  }

  const commands = harness.state.aiEncounter.commands.map(compactCommand);
  const busCommands = harness.busEvents
    .filter((entry) => entry.event === 'ai:encounterCommand')
    .map((entry) => compactCommand(entry.payload));
  const rejectedEncounterCommands = harness.helpers.inspectAIPorts().rejectedEncounterCommands;

  assert.deepEqual(busCommands, commands, 'ai:encounterCommand events should mirror the recorded ring');
  assert.equal(harness.busEvents.some((entry) => entry.event === 'spawn:request' || entry.event === 'entity:spawned'), false,
    'encounter sink must not request or perform spawns');
  assert(commands.slice(0, directCount).some((command) => command.type === 'request_reinforcement'),
    'direct sink proof should include reinforcement requests without spawning');
  assert(commands.slice(directCount).some((command) => command.type === 'narrative_beat' || command.type === 'phase'),
    'tacticalAI director should issue timing or phase commands through the production sink');
  assert(rejectedEncounterCommands >= rejectedBefore + 3,
    'invalid encounter commands should increment rejection diagnostics');

  return {
    beforeOwnership,
    afterOwnership: ownershipSnapshot(harness.state),
    directCommands,
    commands,
    busCommands,
    aiCommandCount: commands.length - directCount,
    rejectedEncounterCommands,
  };
}

function issueDirectCommands(harness) {
  const helper = harness.helpers.aiEncounter;
  const commands = [
    { tick: 11, type: 'phase', phase: 'build' },
    { tick: 12, type: 'request_reinforcement', packageId: 'fixture_wing_pair', budgetRemaining: 2 },
    { tick: 13, type: 'order_retreat', reason: 'director_fixture' },
    { tick: 14, type: 'narrative_beat', beatIndex: 3 },
  ];
  for (const command of commands) assert.equal(helper.issue(command), true, `encounter command should be accepted: ${command.type}`);
  return harness.state.aiEncounter.commands.slice(0, commands.length);
}

function makeHarness() {
  const state = createGameState(0x4706e0);
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
  };
  runtime.core.init(ctx);
  runtime.aiPorts.init(ctx);
  return runtime;
}

function ownershipSnapshot(state) {
  return Object.freeze({
    entityCount: state.entityList.length,
    pendingReinforcements: canonicalStringify(state.combat && state.combat.pendingReinforcements || null),
    missions: canonicalStringify(state.missions),
    story: canonicalStringify(state.story),
  });
}

function compactCommand(command) {
  const out = {};
  for (const key of Object.keys(command).sort()) out[key] = command[key];
  return out;
}

function noopActions() {
  return Object.freeze({
    list() { return Object.freeze([]); },
    canStart() { return { ok: false, reason: 'encounter_sink_no_actions' }; },
    start() { return null; },
    status() { return 'failed'; },
    interrupt() { return false; },
  });
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
