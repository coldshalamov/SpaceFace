import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { AUTHORED_SET_PIECES } from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';

function boot(t, pieceId) {
  const sim = createSimulation({ seed: 4242, systems: [missions], updateOrder: [] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  state.factions.faction_reach = { rep: 5 };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const completed = [];
  const popups = [];
  bus.on('mission:completed', (payload) => completed.push(payload));
  bus.on('comms:popup', (payload) => popups.push(payload));
  const system = sim.registry.get('missions');
  const definition = AUTHORED_SET_PIECES.find((row) => row.id === pieceId);
  state.world.currentSectorId = definition.destSectorId;
  const board = system.ensureBoard(definition.startStationId);
  const offer = board.slots.find((row) => row.params?.authoredSetPieceId === pieceId);
  assert.ok(offer, 'the authored job is available on the seed-4242 station board');
  assert.equal(system.acceptMission(offer.id), true);
  const mission = state.missions.active.find((row) => row.params?.authoredSetPieceId === pieceId);
  system._ensureMissionTargets(mission);
  const target = mission.targetEntityIds.map((id) => state.entities.get(id))
    .find((entity) => entity?.data?.physicalRole === definition.primaryRole);
  assert.ok(target, 'the job has a live physical target');
  const berth = sim.spawn({
    type: 'station', pos: { x: 80, z: 40 }, radius: 40,
    data: { stationId: mission.destStationId, dockRadius: 80 },
  });
  return { state, bus, system, player, mission, target, berth, completed, popups };
}

function latch(h) {
  h.state.player.tether = { targetId: h.target.id };
  h.bus.emit('tether:latched', { targetId: h.target.id });
}

function dock(h) {
  h.bus.emit('dock:docked', { stationId: h.mission.destStationId });
}

function solve(h, method) {
  if (method === 'tow_the_barge') {
    h.target.pos.x = h.berth.pos.x;
    h.target.pos.z = h.berth.pos.z;
    latch(h);
    dock(h);
  } else if (method === 'sling_the_barge') {
    h.target.pos.x = h.berth.pos.x;
    h.target.pos.z = h.berth.pos.z;
    h.bus.emit('massline:throw', { payloadId: h.target.id, aimTargetId: null });
  } else if (method === 'throw_the_deserter') {
    h.bus.emit('massline:throw', { payloadId: h.target.id, aimTargetId: h.target.id });
  } else {
    h.bus.emit('entity:killed', { id: h.target.id, killerId: h.player.id, type: 'ship' });
  }
}

for (const [pieceId, approaches] of [
  ['ore_barge_tow', [
    ['tow_the_barge', /towing the barge/i],
    ['sling_the_barge', /slinging the barge/i],
  ]],
  ['deserter_throw', [
    ['throw_the_deserter', /throwing the deserter/i],
    ['outgun_the_deserter', /outgunning the deserter/i],
  ]],
]) {
  for (const [method, phrase] of approaches) {
    test(`${pieceId}: ${method} settles once and debriefs the physical approach in plain words`, (t) => {
      const h = boot(t, pieceId);
      solve(h, method);
      assert.equal(h.completed.length, 1, 'the physical approach completes the job');
      assert.equal(h.completed[0].completionMethod, method);
      assert.equal(h.state.missions.active.includes(h.mission), false);
      const debrief = h.popups.find((popup) => popup.note?.startsWith('Paid '));
      assert.ok(debrief, 'the client emits the payment debrief');
      assert.match(debrief.text, phrase, 'the debrief describes how the pilot solved the job');
      assert.doesNotMatch(debrief.text, /_/, 'the debrief contains no raw method or station ids');
      const popupCount = h.popups.length;
      solve(h, approaches.find(([other]) => other !== method)[0]);
      assert.equal(h.completed.length, 1, 'the other approach cannot settle an already finished job');
      assert.equal(h.popups.length, popupCount, 'the other approach cannot repeat the debrief');
    });
  }
}

test('docking with the barge still latched 5,000 wu away does not deliver it', (t) => {
  const h = boot(t, 'ore_barge_tow');
  latch(h);
  h.target.pos.x = h.berth.pos.x + 5000;
  h.target.pos.z = h.berth.pos.z;
  dock(h);
  assert.equal(h.completed.length, 0, 'the barge itself must reach the berth');
  assert.equal(h.mission.status, 'active');
});

for (const event of ['tether:detached', 'tether:broken']) {
  test(`${event}: a dropped barge cannot be delivered using a stale latch`, (t) => {
    const h = boot(t, 'ore_barge_tow');
    latch(h);
    h.target.pos.x = h.berth.pos.x + 5000;
    h.target.pos.z = h.berth.pos.z;
    h.bus.emit(event, { ownerId: h.player.id + 1000, targetId: h.target.id });
    h.bus.emit(event, { ownerId: h.player.id, targetId: h.target.id + 1000 });
    assert.equal(h.mission.params.latchedTargetId, h.target.id,
      'another tether or target releasing does not clear the player latch');
    h.state.player.tether = null;
    h.bus.emit(event, { ownerId: h.player.id, targetId: h.target.id });
    dock(h);
    assert.equal(h.completed.length, 0, 'latching at spawn and dropping far away does not deliver');
    assert.equal(h.mission.params.latchedTargetId, null, 'release clears the saved latch pointer');
    h.target.pos.x = h.berth.pos.x;
    dock(h);
    assert.equal(h.completed.length, 0, 'a loose barge near the berth is not a tow-in delivery');
    latch(h);
    dock(h);
    assert.equal(h.completed.length, 1, 'reattaching at the berth completes the tow');
    assert.equal(h.completed[0].completionMethod, 'tow_the_barge');
  });
}

test('authored debriefs name every catalog approach without raw identifiers', (t) => {
  const h = boot(t, 'ore_barge_tow');
  for (const definition of AUTHORED_SET_PIECES) {
    for (const method of definition.methods) {
      const text = h.system._missionSuccessDebriefText({
        ...h.mission, title: definition.title, params: { completionMethod: method },
      });
      assert.doesNotMatch(text, /_/, `${method} must be translated for the pilot`);
    }
  }
  const text = h.system._missionSuccessDebriefText({
    ...h.mission, params: { completionMethod: 'future_physical_approach' },
  });
  assert.match(text, /future physical approach/, 'unlisted methods still have a readable fallback');
});
