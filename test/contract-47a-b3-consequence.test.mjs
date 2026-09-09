import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { CONTRACT_47A_B3_TAG, missions as missionsProto } from '../src/systems/missions.js';

function harness() {
  const state = createGameState(473);
  state.mode = 'flight';
  state.simTime = 40;
  state.playerId = 1;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_tethys_junction';
  let nextId = 10;
  const entities = [
    { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } },
    { id: 2, type: 'station', alive: true, pos: { x: 1100, z: 400 }, data: { stationId: 'station_tethys', name: 'Tethys Trade Hub' } },
    { id: 3, type: 'station', alive: true, pos: { x: 80, z: 40 }, data: { stationId: 'station_ceres', name: 'Ceres Yard', dockRadius: 80 } },
  ];
  for (const entity of entities) {
    state.entities.set(entity.id, entity);
    if (entity.id !== state.playerId) state.entityList.push(entity);
  }
  const bus = createBus();
  const credits = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  const missions = Object.assign({}, missionsProto);
  missions.init({
    state,
    bus,
    helpers: {
      hash32,
      mulberry32,
      voice: { say: () => true },
      spawnEntity: (spec) => {
        const entity = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        return entity;
      },
    },
    registry: { get: () => null },
  });
  missions.newGame();
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.nav.waypoint = null;
  state.story.beatIndex = 3;
  missions._syncCampaignSidecarAfterAdvance();
  missions._refreshEmbodiedStoryBoards();
  missions._refreshNavigation({ forceStory: true, silent: true });
  return { state, bus, missions, credits };
}

test('47-A B3 is the long tow, not a shipyard choice', () => {
  const h = harness();
  assert.equal(h.state.nav.waypoint.storyBeat, 3);
  assert.match(h.state.nav.waypoint.reason, /tow the slag core/i);

  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  h.bus.emit('ship:purchased', { defId: 'ship_drifter', price: 9000, stationId: 'station_tethys' });
  assert.equal(h.state.story.beatIndex, 3, 'a hull buy cannot settle Bigger Boat');

  h.bus.emit('dock:undocked', {});
  const mission = h.state.missions.active.find((row) => row.storyTag === CONTRACT_47A_B3_TAG);
  assert.ok(mission, 'departing Tethys dispatches the long tow');
  assert.equal(mission.type, 'tow_recovery');
  assert.equal(mission.title, 'Tow the slag core');

  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  const core = mission.targetEntityIds
    .map((id) => h.state.entities.get(id))
    .find((entity) => entity && entity.data && entity.data.physicalRole === 'slag_core');
  assert.ok(core, 'the slag core is a physical target');
  h.bus.emit('tether:latched', { targetId: core.id });
  h.bus.emit('dock:docked', { stationId: mission.destStationId });

  assert.equal(h.state.story.beatIndex, 4);
  assert.equal(h.credits.filter((row) => row.amount === 1000).length, 1);
  h.bus.emit('ship:purchased', { defId: 'ship_hornet', price: 12000 });
  assert.equal(h.state.story.beatIndex, 4);
  assert.equal(h.credits.filter((row) => row.amount === 1000).length, 1, 'B3 reward is exact-once');
});
