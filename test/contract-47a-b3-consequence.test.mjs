import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { getBeatStepStatus } from '../src/story/campaign47a/index.js';

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

// W-BOOKS-3-4 (§34.7 Book 3): B3 is now Slate's yard list — the berth delivery of
// VARIANCE ADJUSTMENT is still the long tow, but the tow alone no longer closes the
// book; Feed the Maw and the Foreman still owe. A hull buy never settles it.
test('47-A B3 opens on the berth tow, not a shipyard choice', () => {
  const h = harness();
  assert.equal(h.state.nav.waypoint.storyBeat, 3);
  assert.match(h.state.nav.waypoint.reason, /VARIANCE ADJUSTMENT/i);

  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  h.bus.emit('ship:purchased', { defId: 'ship_drifter', price: 9000, stationId: 'station_tethys' });
  assert.equal(h.state.story.beatIndex, 3, 'a hull buy cannot settle Bigger Boat');

  h.bus.emit('dock:undocked', {});
  const mission = h.state.missions.active.find((row) => row.storyTag === 'campaign47a:b3:berth');
  assert.ok(mission, 'departing Tethys dispatches the berth delivery');
  assert.equal(mission.type, 'tow_recovery');
  assert.equal(mission.title, 'Tow the slag core');

  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missions.spawnTargetsForSector(mission.destSectorId);
  h.missions._ensureMissionTargets(mission);
  const core = mission.targetEntityIds
    .map((id) => h.state.entities.get(id))
    .find((entity) => entity && entity.data && entity.data.physicalRole === 'slag_core');
  assert.ok(core, 'the slag core is a physical target');
  let berth = [...h.state.entities.values()].find((e) => (
    e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId
  ));
  if (!berth) {
    berth = {
      id: 81, type: 'station', alive: true, pos: { x: 80, z: 40 }, radius: 40,
      data: { stationId: mission.destStationId, dockRadius: 80 },
    };
    h.state.entities.set(berth.id, berth);
    h.state.entityList.push(berth);
  }
  h.bus.emit('tether:latched', { targetId: core.id });
  core.pos = { x: berth.pos.x, z: berth.pos.z };
  h.bus.emit('dock:docked', { stationId: mission.destStationId });

  assert.equal(mission.status, 'completed', 'the berth tow settles');
  assert.deepEqual(getBeatStepStatus(h.state, 3).completed, ['delivery'],
    'the delivery records as the yard list\u2019s first step');
  assert.equal(h.state.story.beatIndex, 3, 'the delivery alone cannot close the yard list');
  h.bus.emit('ship:purchased', { defId: 'ship_hornet', price: 12000 });
  assert.equal(h.state.story.beatIndex, 3, 'a second hull buy still cannot settle Bigger Boat');

  // The list re-posts its next job — Feed the Maw follows the delivery.
  const maw = h.missions.ensureBoard('station_tethys').slots
    .find((row) => row && row.storyTag === 'campaign47a:b3:maw');
  assert.ok(maw, 'the board posts Feed the Maw once the berth settles');
});
