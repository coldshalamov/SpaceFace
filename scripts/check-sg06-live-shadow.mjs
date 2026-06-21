import assert from 'node:assert/strict';

import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const DT = 1 / 60;

const harness = makeHarness();
const { state, helpers } = harness;
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
    squadId: 'sg06_shadow_wing',
    doctrine: 'official',
    preferredRole: 'leader',
    capabilities: ['ranged'],
  },
}));

state.playerId = player.id;
harness.rebuildSpatialHash();

const legacyIntent = Object.freeze({ fire: false, sentinel: 'legacy-fsm-must-not-be-touched' });
actor.data.intent = legacyIntent;

const maneuverRequests = [];
const tacticalAI = createTacticalAISystem({
  seed: state.meta.seed,
  maneuver: Object.freeze({
    request(request) {
      maneuverRequests.push(request);
      return true;
    },
  }),
  authoredEncounter: () => ({ threatEnvelope: { min: 0.16, max: 0.76 } }),
});
tacticalAI.init(harness.ctx);

assert.equal(helpers.aiSensors.frameFor(actor.id, state.tick).contacts.some((contact) => contact.id === player.id), true,
  'production SG-06 sensors should see the hostile player ship');
assert.equal(helpers.aiRoster.listSquads(state.tick).length, 1,
  'production SG-06 roster should include the tactical wing');

for (let i = 0; i < 8; i++) stepShadowHarness(harness, tacticalAI);

const events = state.combat.trace.events;
const aiRequests = events.filter((event) =>
  event.kind === 'action.requested' &&
  event.actorId === actor.id &&
  event.actionId === 'action_burst' &&
  event.source &&
  event.source.kind === 'ai' &&
  event.source.controllerId === 'sg06');
const aiStarts = events.filter((event) =>
  event.kind === 'action.started' &&
  event.actorId === actor.id &&
  event.actionId === 'action_burst' &&
  event.source &&
  event.source.kind === 'ai' &&
  event.source.controllerId === 'sg06');
const aiEffects = events.filter((event) =>
  event.kind === 'action.effect' &&
  event.actorId === actor.id &&
  event.actionId === 'action_burst');

assert.equal(aiRequests.length, 1, 'SG-06 should submit exactly one canonical SG-03 action_burst request');
assert.equal(aiStarts.length, 1, 'SG-03 should start the AI action through the same ActionDef queue');
assert(aiEffects.length >= 1, 'SG-03 should own the action effect after the AI request starts');
assert.equal(aiRequests[0].target.entityId, player.id, 'AI action request should target the hostile ship through SG-03');
assert.equal(actor.data.intent, legacyIntent, 'SG-06 must not mutate the legacy AI intent contract');
assert.equal(actor.data.intent.fire, false, 'SG-06 must not request combat through legacy intent.fire');
assert.equal(maneuverRequests.length > 0, true, 'SG-06 should still emit maneuver requests through its port boundary');
assert.equal(maneuverRequests.every((request) => request.entityId === actor.id), true,
  'shadow maneuver capture should only observe the tactical AI actor');

const behaviorTrace = tacticalAI.inspect({ entityId: actor.id, trace: { layer: 'behavior', limit: 32 } }).trace;
assert(behaviorTrace.some((entry) =>
  entry.decision === 'execute_action_def' &&
  entry.selected &&
  entry.selected.decision === 'start' &&
  entry.selected.actionId === 'action_burst' &&
  entry.selected.status === 'running'),
  'SG-06 behavior trace should record starting the canonical SG-03 action');

harness.dispose();

console.log('SG-06 live shadow checks OK');

function makeHarness() {
  const state = createGameState(0x4706a11);
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
    actions: Object.create(actions),
    kernel: null,
    rebuildSpatialHash() {
      state.spatialHash.rebuild(state.entityList);
    },
    dispose() {
      if (runtime.kernel && typeof runtime.kernel.dispose === 'function') runtime.kernel.dispose();
    },
  };
  runtime.core.init(ctx);
  runtime.aiPorts.init(ctx);
  runtime.actions.init(ctx);
  runtime.kernel = getCombatKernel(ctx);
  return runtime;
}

function stepShadowHarness(harness, tacticalAI) {
  harness.core.preStep(DT, harness.state);
  harness.rebuildSpatialHash();
  tacticalAI.update(DT, harness.state);
  harness.actions.update(DT, harness.state);
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
