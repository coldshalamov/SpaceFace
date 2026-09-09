import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const ROUTE_BY_OUTCOME = Object.freeze({
  custody: Object.freeze({ stationId: 'station_helios', sectorId: 'sector_helios_prime' }),
  force: Object.freeze({ stationId: 'station_tethys', sectorId: 'sector_tethys_junction' }),
});

function harness(outcome) {
  const state = createGameState(outcome === 'custody' ? 473 : 474);
  state.mode = 'flight';
  state.simTime = 40;
  state.playerId = 1;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_charon_expanse';
  const entities = [
    { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } },
    { id: 2, type: 'station', alive: true, pos: { x: -900, z: 800 }, data: { stationId: 'station_helios', name: 'Helios Station' } },
    { id: 3, type: 'station', alive: true, pos: { x: 1100, z: 400 }, data: { stationId: 'station_tethys', name: 'Tethys Trade Hub' } },
  ];
  for (const entity of entities) {
    state.entities.set(entity.id, entity);
    if (entity.id !== state.playerId) state.entityList.push(entity);
  }
  const bus = createBus();
  const credits = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers: { voice: { say: () => true } }, registry: { get: () => null } });
  missions.newGame();
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.nav.waypoint = null;
  state.story.beatIndex = 3;
  state.story.flags.elroy_outcome = outcome;
  missions._syncCampaignSidecarAfterAdvance();
  missions._refreshNavigation({ forceStory: true, silent: true });
  return { state, bus, missions, credits };
}

function exerciseOutcome(outcome) {
  const h = harness(outcome);
  const route = ROUTE_BY_OUTCOME[outcome];
  const wrongStationId = outcome === 'custody' ? 'station_tethys' : 'station_helios';
  assert.equal(h.state.nav.waypoint.storyBeat, 3);
  assert.equal(h.state.nav.waypoint.stationId, route.stationId);
  assert.equal(h.state.nav.waypoint.sectorId, route.sectorId);
  assert.match(h.state.nav.waypoint.reason, /tier-two hull/i);

  h.bus.emit('dock:docked', { stationId: wrongStationId });
  h.bus.emit('ship:purchased', { defId: 'ship_mule', price: 4200 });
  assert.equal(h.state.story.beatIndex, 3, 'a tier-one hull cannot settle Bigger Boat');

  h.bus.emit('ship:purchased', { defId: 'ship_drifter', price: 9000 });
  assert.equal(h.state.story.beatIndex, 3, 'the wrong shipyard cannot settle the consequence');
  assert.equal(h.state.story.flags.bigger_boat_pending_hull, 'ship_drifter');

  h.bus.emit('dock:docked', { stationId: route.stationId });
  assert.equal(h.state.story.beatIndex, 4);
  assert.equal(h.state.story.flags.bigger_boat_route, outcome === 'custody' ? 'evidence_warrant' : 'combat_refit');
  assert.equal(h.state.story.flags.bigger_boat_pending_hull, undefined, 'route docking consumes the recovery marker');
  assert.equal(h.credits.filter((row) => row.amount === 1000).length, 1);

  h.bus.emit('ship:purchased', { defId: 'ship_hornet', price: 12000 });
  assert.equal(h.state.story.beatIndex, 4);
  assert.equal(h.credits.filter((row) => row.amount === 1000).length, 1, 'B3 reward is exact-once');
}

test('47-A B3 makes custody and force physical, distinct shipyard consequences', () => {
  exerciseOutcome('custody');
  exerciseOutcome('force');
});
