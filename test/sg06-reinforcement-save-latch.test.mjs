// D57: save/load inside a reinforcement call→arrival window used to drop the pending
// squad silently — and the caller's persisted _calledReinforcements latch meant it could
// never call again. The load pass now clears the latch only for callers whose call never
// produced a surviving squad (delivered stamp, caller-tagged member, or a member inside
// the leash for saves written before the tag), preserving the once-ever contract for
// callers whose squads did arrive.
//
// Harness mirrors test/sg06-reinforcement-arrival-tell.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { save } from '../src/save/saveSystem.js';

const DT = 1 / 60;

function makeHarness() {
  const state = createGameState(0x4706e057);
  state.mode = 'flight';
  const busEvents = [];
  const bus = {
    on() { return () => {}; },
    emit(event, payload) { busEvents.push({ event, payload }); },
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
  };
  h.core.init(ctx);
  h.aiPorts.init(ctx);
  h.aiEncounter.init(ctx);
  const player = h.helpers.spawnEntity(makeShipSpec({ team: 0, x: 25, z: -15, role: 'player_anchor' }));
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

function makeCaller(h, { x = 400, z = 0 } = {}) {
  const caller = h.helpers.spawnEntity(makeShipSpec({ team: 1, x, z, role: 'sg06_caller' }));
  caller.data.reinforcements = { packageId: 'fixture_wing_pair', hullThreshold: 0.3 };
  caller.hull = Math.floor(caller.hullMax * 0.2);
  h.state.spatialHash.rebuild(h.state.entityList);
  return caller;
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

function reconcile(state, remap = null) {
  const saver = Object.create(save);
  saver.state = state;
  saver._reconcileReinforcementLatches(remap);
}

test('a spawned squad member stamps its caller and carries the caller link', () => {
  const h = makeHarness();
  const caller = makeCaller(h);
  h.aiEncounter.update(DT, h.state); // authored scan: hull below threshold → the call fires
  step(h, 1); // fixture delayTicks 1 → squad lands

  assert.equal(caller.data.ai._reinforcementsDelivered, true, 'arrival stamps the caller');
  const member = h.state.entityList.find((e) => e.data && e.data.ai && e.data.ai.spawnContext === 'sg06_reinforcement');
  assert.ok(member, 'squad member exists');
  assert.equal(member.data.encounter.callerId, caller.id, 'the spawned member links back to its caller');
});

test('reconcile clears the latch only when the call produced no surviving squad', () => {
  const h = makeHarness();
  const lost = makeCaller(h, { x: 400 });
  lost.data.ai = { _calledReinforcements: true }; // announced, pending queue died in the rebuild

  const delivered = makeCaller(h, { x: 4000 });
  delivered.data.ai = { _calledReinforcements: true, _reinforcementsDelivered: true }; // squad arrived (and maybe died) before the save

  const tagged = makeCaller(h, { x: 8000 });
  tagged.data.ai = { _calledReinforcements: true };
  const oldTaggedId = 'save_id_of_tagged';
  const taggedMember = h.helpers.spawnEntity(makeShipSpec({ team: 1, x: 9999, z: 0, role: 'sg06_member' }));
  taggedMember.data.ai = { spawnContext: 'sg06_reinforcement' };
  taggedMember.data.encounter = { owner: 'sg06', commandSeq: 7, packageId: 'fixture_wing_pair', callerId: oldTaggedId };
  const remap = new Map([[String(oldTaggedId), tagged.id]]);

  const legacy = makeCaller(h, { x: 12000 });
  legacy.data.ai = { _calledReinforcements: true };
  const legacyMember = h.helpers.spawnEntity(makeShipSpec({ team: 1, x: 12050, z: 0, role: 'sg06_member' }));
  legacyMember.data.ai = { spawnContext: 'sg06_reinforcement' };
  legacyMember.data.encounter = { owner: 'sg06', commandSeq: 3, packageId: 'fixture_wing_pair' }; // pre-tag save: no callerId

  const far = makeCaller(h, { x: 20000 });
  far.data.ai = { _calledReinforcements: true };
  const farMember = h.helpers.spawnEntity(makeShipSpec({ team: 1, x: 20000 + 5000, z: 0, role: 'sg06_member' }));
  farMember.data.ai = { spawnContext: 'sg06_reinforcement' };
  farMember.data.encounter = { owner: 'sg06', commandSeq: 9, packageId: 'fixture_wing_pair' }; // untagged, outside leash

  h.state.spatialHash.rebuild(h.state.entityList);
  reconcile(h.state, remap);

  assert.equal(lost.data.ai._calledReinforcements, false, 'lost squad re-arms the call');
  assert.equal(delivered.data.ai._calledReinforcements, true, 'delivered stamp keeps the once-ever latch');
  assert.equal(tagged.data.ai._calledReinforcements, true, 'caller-tagged member counts through the id remap');
  assert.equal(legacy.data.ai._calledReinforcements, true, 'untagged member inside the leash counts (pre-tag saves)');
  assert.equal(far.data.ai._calledReinforcements, false, 'untagged member outside the leash does not count');
});

test('after load reconciliation a stranded caller calls again and the squad arrives', () => {
  const h = makeHarness();
  const caller = makeCaller(h);
  h.aiEncounter.update(DT, h.state);
  assert.equal(eventsOf(h, 'ai:reinforcementScheduled').length, 1, 'first call fires');
  assert.equal(caller.data.ai._calledReinforcements, true);

  // The save/load seam: pending queue and owner state are rebuilt transient.
  h.state.aiEncounter = { schemaVersion: 1, nextSeq: 1, commands: [] };
  reconcile(h.state, null);
  assert.equal(caller.data.ai._calledReinforcements, false, 'lost squad re-arms the caller');

  h.aiEncounter.update(DT, h.state);
  assert.equal(eventsOf(h, 'ai:reinforcementScheduled').length, 2, 'the caller calls again after the rebuild');
  step(h, 1);
  assert.equal(eventsOf(h, 'ai:reinforcementSpawned').length, 2, 'the re-called squad lands');
  assert.equal(caller.data.ai._reinforcementsDelivered, true);
});
