import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CONTRACT_47A_B1_TAG,
  missions as missionsProto,
} from '../src/systems/missions.js';

function harness() {
  const state = createGameState(471);
  state.mode = 'flight';
  state.simTime = 20;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  let nextId = 10;
  const entities = [
    { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } },
    { id: 2, type: 'asteroid', alive: true, pos: { x: 160, z: -40 }, data: { typeId: 'ast_common_rock' } },
    { id: 3, type: 'station', alive: true, pos: { x: -400, z: 80 }, data: { stationId: 'station_helios', name: 'Helios Station' } },
  ];
  for (const entity of entities) {
    state.entities.set(entity.id, entity);
    if (entity.id !== 1) state.entityList.push(entity);
  }
  const bus = createBus();
  const credits = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  const helpers = {
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const entity = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    mulberry32: (seed) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let value = a;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  return { state, bus, missions, credits, asteroid: entities[1] };
}

function activeB1(h) {
  return h.state.missions.active.find((mission) => mission.storyTag === CONTRACT_47A_B1_TAG);
}

test('47-A settlement dispatches the sealed alloy run — §34.7 Book 1 first post', () => {
  const h = harness();
  h.bus.emit('mining:yield', {
    commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...h.asteroid.pos },
  });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
  const activeB1 = () => h.state.missions.active
    .find((mission) => mission.storyTag === 'campaign47a:b1:alloy_run');
  assert.equal(activeB1(), undefined, 'follow-up waits until the player departs the settlement dock');

  h.bus.emit('dock:undocked', {});
  const mission = activeB1();
  assert.ok(mission, 'undock dispatches the book’s first Honest Work contract');
  assert.equal(mission.type, 'cargo_delivery');
  // the receiving berth is Tethys (destStationId), so the title names the job, not a station
  assert.equal(mission.title, 'Weigh-In — sealed alloy delivery');
  assert.equal(mission.preloadedCargo, true, 'the crate is sealed aboard');
  assert.equal(mission.params.silentRecat, true);
  assert.equal(h.state.ui.trackedMissionId, mission.id);

  // The sealed crate settles its list step at Tycho — but Book 1 stays open:
  // Scale 4 and the furnace detail are still owed before the beat advances.
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(mission.status, 'completed');
  assert.equal(h.state.story.beatIndex, 1, 'the alloy run alone cannot close the book');
  const receipt = h.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.rewardCr, 600, 'the posted offer pays exactly once');
  assert.equal(h.credits.some((row) => row.reason === 'story:honest_work'), false, 'B1 reward only follows the whole list');
});
