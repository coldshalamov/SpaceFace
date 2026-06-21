import assert from 'node:assert/strict';

import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { physics } from '../src/core/physics.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const DT = 1 / 60;

const harness = makeHarness();
const { state, helpers, tacticalAI } = harness;

const player = helpers.spawnEntity(makeShipSpec({
  team: 0,
  x: 180,
  factionId: 'faction_free',
  role: 'player_probe_target',
}));
const actor = helpers.spawnEntity(makeShipSpec({
  team: 1,
  x: 0,
  factionId: 'faction_scn',
  ai: {
    squadId: 'sg06_registry_wing',
    doctrine: 'official',
    preferredRole: 'leader',
    capabilities: ['ranged'],
  },
}));
state.playerId = player.id;
state.spatialHash.rebuild(state.entityList);

const legacyIntent = Object.freeze({ fire: false, sentinel: 'registry-init-must-not-touch-legacy-intent' });
actor.data.intent = legacyIntent;

await ensureSg02Ready(harness);

for (let i = 0; i < 10; i++) stepHarness(harness);

const events = state.combat.trace.events;
const aiRequest = events.find((event) =>
  event.kind === 'action.requested' &&
  event.actorId === actor.id &&
  event.actionId === 'action_burst' &&
  event.source &&
  event.source.kind === 'ai' &&
  event.source.controllerId === 'sg06');
const aiStart = events.find((event) =>
  event.kind === 'action.started' &&
  event.actorId === actor.id &&
  event.actionId === 'action_burst' &&
  event.source &&
  event.source.kind === 'ai' &&
  event.source.controllerId === 'sg06');
const aiEffect = events.find((event) =>
  event.kind === 'action.effect' &&
  event.actorId === actor.id &&
  event.actionId === 'action_burst');
const portDiagnostics = harness.aiPorts.inspect();

assert(aiRequest, 'lazy registry-slot tacticalAI should submit canonical action_burst through SG-03');
assert(aiStart, 'SG-03 should start the lazy-bound AI action through the canonical queue');
assert(aiEffect, 'SG-03 should own the action effect after lazy tacticalAI starts it');
assert.equal(aiRequest.target.entityId, player.id, 'AI action request should target the hostile ship through SG-03');
assert.equal(actor.data.intent, legacyIntent, 'lazy tacticalAI must not mutate the legacy AI intent contract');
assert.equal(actor.data.intent.fire, false, 'lazy tacticalAI must not request combat through legacy intent.fire');
assert(portDiagnostics.acceptedManeuvers > 0, 'lazy tacticalAI should bind the production SG-06 maneuver port');
assert(portDiagnostics.flushedManeuvers > 0, 'aiPorts should flush lazy tacticalAI maneuver requests into SG-02');
assert.equal(portDiagnostics.lastDropReason, null, 'lazy tacticalAI maneuver requests should not be dropped');

const behaviorTrace = tacticalAI.inspect({ entityId: actor.id, trace: { layer: 'behavior', limit: 32 } }).trace;
assert(behaviorTrace.some((entry) =>
  entry.decision === 'execute_action_def' &&
  entry.selected &&
  entry.selected.decision === 'start' &&
  entry.selected.actionId === 'action_burst'),
  'lazy tacticalAI behavior trace should record starting the canonical SG-03 action');

harness.dispose();

console.log('SG-06 lazy registry-init checks OK');

function makeHarness() {
  const state = createGameState(0x4706c0de);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
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
    physics: Object.create(physics),
    aiPorts: Object.create(aiPorts),
    actions: Object.create(actions),
    tacticalAI: createTacticalAISystem({
      seed: state.meta.seed,
      authoredEncounter: () => ({ threatEnvelope: { min: 0.16, max: 0.76 } }),
    }),
    kernel: null,
    rebuildSpatialHash() {
      state.spatialHash.rebuild(state.entityList);
    },
    dispose() {
      if (runtime.kernel && typeof runtime.kernel.dispose === 'function') runtime.kernel.dispose();
      if (runtime.physics && typeof runtime.physics._disableSg02DynamicAuthority === 'function') {
        runtime.physics._disableSg02DynamicAuthority();
      }
    },
  };

  runtime.core.init(ctx);
  runtime.tacticalAI.init(ctx);
  assert.equal(runtime.tacticalAI.inspect(), null, 'tacticalAI should not require ports during init');
  runtime.physics.init(ctx);
  runtime.aiPorts.init(ctx);
  runtime.actions.init(ctx);
  runtime.kernel = getCombatKernel(ctx);
  assert(helpers.aiSensors && helpers.aiRoster && helpers.aiManeuver, 'production AI ports should install after tacticalAI init');
  assert(helpers.combatPhysics, 'physics should install SG-03 combatPhysics after tacticalAI init');
  return runtime;
}

async function ensureSg02Ready(harness) {
  harness.physics.update(DT, harness.state);
  if (harness.physics._sg02Init) await harness.physics._sg02Init;
  harness.physics.update(DT, harness.state);
  assert(harness.physics._sg02, 'SG-02 dynamic owner should initialize for lazy registry fixture');
  assert.equal(harness.state.physicsRuntime.diagnostics.sg02Ready, true, 'physics diagnostics should mark SG-02 ready');
}

function stepHarness(harness) {
  harness.core.preStep(DT, harness.state);
  harness.rebuildSpatialHash();
  harness.tacticalAI.update(DT, harness.state);
  harness.actions.update(DT, harness.state);
  harness.aiPorts.update(DT, harness.state);
  harness.physics.update(DT, harness.state);
  harness.actions.kernel.postPhysics(DT);
  harness.core.lifetimeSweep(DT, harness.state);
}

function makeShipSpec({ team, x, factionId, role = 'ship', ai = null }) {
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
    data: {
      role,
      combatProfileId: 'combat_profile_standard_ship',
      ...(ai ? { ai } : {}),
    },
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
