// Reinforcement arrival tell + caller bark (INFERENCE-17).
//
// Two dead seams in the live aiEncounter owner, plus one dead data row:
//   1. `ai:reinforcementScheduled` dropped the caller id, so barkDirector's only
//      consumer (`_speakFromEvent` → 'reinforce') could never resolve a speaker.
//   2. `ai:reinforcementSpawned` had zero subscribers — squads materialized
//      silently. The first member of each squad now raises an annunciator line
//      and a toast (the alert event also carries its own audio recipe).
//   3. `reaver_pirate`'s authored reinforcements declared no packageId, so the
//      most common call beat never fired on the live route at all.
//
// Harness mirrors scripts/check-sg06-encounter-owner.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

const DT = 1 / 60;

function makeHarness(seed = 0x4706e010) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const busEvents = [];
  const listeners = new Map();
  const bus = {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      busEvents.push({ event, payload });
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
    queue(event, payload) { this.emit(event, payload); },
    flush() {},
  };
  const helpers = {};
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  const h = {
    state, bus, busEvents, helpers, ctx,
    core: Object.create(core),
    aiPorts: Object.create(aiPorts),
    aiEncounter: Object.create(aiEncounter),
    barkDirector: Object.create(barkDirector),
  };
  h.core.init(ctx);
  h.aiPorts.init(ctx);
  h.aiEncounter.init(ctx);
  const player = helpers.spawnEntity(makeShipSpec({ team: 0, x: 25, z: -15, role: 'player_anchor' }));
  state.playerId = player.id;
  state.spatialHash.rebuild(state.entityList);
  return h;
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

function step(h, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    h.core.preStep(DT, h.state);
    h.aiEncounter.update(DT, h.state);
  }
}

function eventsOf(h, name) {
  return h.busEvents.filter((e) => e.event === name);
}

test('the scheduled event names its caller, so the dead reinforce bark speaks again', () => {
  const h = makeHarness();
  // callerId only reaches the owner through the authored path — aiPorts.normalize
  // correctly strips it from externally issued commands. Drive the real seam.
  const caller = h.helpers.spawnEntity(makeShipSpec({ team: 1, x: 400, z: 0, role: 'sg06_caller' }));
  caller.data.reinforcements = { packageId: 'fixture_wing_pair', hullThreshold: 0.3 };
  caller.hull = Math.floor(caller.hullMax * 0.2);
  h.state.spatialHash.rebuild(h.state.entityList);
  const said = [];
  h.helpers.voice = { say: (msg) => { said.push(msg); return true; } };
  h.barkDirector.init(h.ctx);

  h.aiEncounter.update(DT, h.state);

  const scheduled = eventsOf(h, 'ai:reinforcementScheduled');
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].payload.entityId, caller.id, 'payload carries the caller for barkDirector');
  assert.equal(scheduled[0].payload.callerId, caller.id);

  const receipts = eventsOf(h, 'barkDirector:voice');
  assert.equal(receipts.length, 1, 'the caller barks on the live consumer path');
  assert.equal(receipts[0].payload.situation, 'reinforce');
  assert.equal(receipts[0].payload.entityId, caller.id);
  assert.equal(receipts[0].payload.factionId, 'faction_vael');
  assert.equal(said.length, 1);
  assert.equal(said[0].channel, 'bark');
});

test('arrival announces once per squad, not once per ship', () => {
  const h = makeHarness();
  h.helpers.aiEncounter.issue({ tick: 0, type: 'request_reinforcement', packageId: 'fixture_wing_pair' });
  h.aiEncounter.update(DT, h.state);
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 2);

  step(h, 1); // fixture delayTicks 1 → both members land this tick

  const spawned = eventsOf(h, 'ai:reinforcementSpawned');
  assert.equal(spawned.length, 2, 'the spawn event still fires per member');
  const arrived = eventsOf(h, 'alert').filter((e) => String(e.payload && e.payload.key || '').startsWith('reinforcements_arrived_'));
  assert.equal(arrived.length, 1, 'one annunciator line for the squad, not two');
  assert.equal(arrived[0].payload.sev, 'warn');
  const toasts = eventsOf(h, 'toast').filter((e) => e.payload && e.payload.text === 'Reinforcements have arrived.');
  assert.equal(toasts.length, 1);
});

test('a callerless director command announces the arrival but speaks no bark', () => {
  const h = makeHarness();
  const said = [];
  h.helpers.voice = { say: (msg) => { said.push(msg); return true; } };
  h.barkDirector.init(h.ctx);

  h.helpers.aiEncounter.issue({ tick: 0, type: 'request_reinforcement', packageId: 'fixture_wing_pair' });
  h.aiEncounter.update(DT, h.state);

  const scheduled = eventsOf(h, 'ai:reinforcementScheduled');
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].payload.entityId, null, 'a director-paced call has no speaker');
  assert.equal(said.length, 0, 'no bark when there is no caller entity');
  assert.equal(eventsOf(h, 'barkDirector:voice').length, 0);

  step(h, 1);
  const arrived = eventsOf(h, 'alert').filter((e) => String(e.payload && e.payload.key || '').startsWith('reinforcements_arrived_'));
  assert.equal(arrived.length, 1, 'the squad still announces itself to the player');
});

test('an authored reaver caller reaches the live route: hull drop calls the swarm screen', () => {
  const h = makeHarness();
  const spec = makeEnemySpawnSpec('reaver_pirate', 4, { x: 300, z: 0 });
  const reaver = h.helpers.spawnEntity(spec);
  h.state.spatialHash.rebuild(h.state.entityList);
  h.aiEncounter.update(DT, h.state);
  assert.equal(eventsOf(h, 'ai:reinforcementScheduled').length, 0, 'healthy caller does not call');

  reaver.hull = Math.floor(reaver.hullMax * 0.2); // under the authored 0.3 threshold
  h.aiEncounter.update(DT, h.state);

  const scheduled = eventsOf(h, 'ai:reinforcementScheduled');
  assert.equal(scheduled.length, 1, 'the authored call now fires on the live owner');
  assert.equal(scheduled[0].payload.packageId, 'reaver_swarm_screen');
  assert.equal(scheduled[0].payload.entityId, reaver.id);
  assert.ok(eventsOf(h, 'alert').some((e) => /CALLING REINFORCEMENTS/.test(e.payload && e.payload.text || '')),
    'the authored call keeps its existing danger banner');

  step(h, 91); // package delayTicks 90 → the screen lands
  const spawned = eventsOf(h, 'ai:reinforcementSpawned');
  assert.ok(spawned.length >= 1 && spawned.length <= 2, 'authored [1,2] count range');
  assert.ok(spawned.every((e) => e.payload.packageId === 'reaver_swarm_screen'));
  const arrivals = eventsOf(h, 'alert').filter((e) => String(e.payload && e.payload.key || '').startsWith('reinforcements_arrived_'));
  assert.equal(arrivals.length, 1, 'the screen announces once when it lands');
  const secondCall = eventsOf(h, 'ai:reinforcementScheduled');
  assert.equal(secondCall.length, 1, 'the caller latches after one call');
});

test('the announce path replays deterministically', () => {
  const run = () => {
    const h = makeHarness(0x4706e011);
    const caller = h.helpers.spawnEntity(makeShipSpec({ team: 1, x: 400, z: 0, role: 'sg06_caller' }));
    h.helpers.aiEncounter.issue({ tick: 0, type: 'request_reinforcement', packageId: 'fixture_wing_pair', callerId: caller.id });
    h.aiEncounter.update(DT, h.state);
    step(h, 2);
    return h.busEvents.map((e) => e.event);
  };
  assert.deepEqual(run(), run());
});
