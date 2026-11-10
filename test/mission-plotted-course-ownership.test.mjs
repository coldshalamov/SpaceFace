import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionOwner, CONTRACT_47A_B1_TAG } from '../src/systems/missions.js';
import { world as worldOwner } from '../src/systems/world.js';

function fixture(storyTag = CONTRACT_47A_B1_TAG) {
  const state = createGameState(4711), bus = createBus();
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.settings.gameplay.tutorialHints = false;
  const owner = Object.create(missionOwner);
  owner.init({ state, bus, registry: { get: () => null }, helpers: {
    voice: { say: () => true }, mulberry32: () => () => 0.5,
  } });
  const mission = { id: 'alloy-run', type: 'cargo_delivery', status: 'active', storyTag,
    title: 'Sealed alloys', stationId: 'station_helios', destStationId: 'station_tethys',
    destSectorId: 'sector_tethys_junction', params: { cmdtyId: 'alloys', qty: 6 } };
  state.missions.active = [mission];
  state.ui.trackedMissionId = mission.id;
  // Isolate planning graph search: the real world course owner still handles each intent.
  const world = Object.create(worldOwner);
  world.state = state; world.bus = bus;
  world.computeRoute = target => ({ legs: [{ from: state.world.currentSectorId, to: target }] });
  const orders = [];
  bus.on('ui:setCourse', payload => { orders.push(payload); world._onSetCourse(payload); });
  return { state, bus, owner, mission, orders };
}

test('passive mission refresh preserves a plotted and engaged player detour', () => {
  for (const storyTag of [CONTRACT_47A_B1_TAG, null]) {
    const { state, bus, owner, orders } = fixture(storyTag);
    bus.emit('ui:setCourse', { type: 'sector', sectorId: 'sector_vesta_forge' });
    const route = state.nav.route;
    const executor = state.nav.executor = { engaged: true, legs: structuredClone(route.legs),
      destinationSectorId: 'sector_vesta_forge' };
    orders.length = 0;
    owner._refreshNavigation({ silent: true });
    owner._refreshNavigation({ silent: true });
    assert.equal(state.nav.route, route, 'mission progress must not replace the committed course');
    assert.equal(state.nav.executor, executor);
    assert.equal(executor.engaged, true);
    assert.deepEqual(orders, [], 'passive refresh sends no replacement course intent');
    assert.equal(state.nav.waypoint.missionId, 'alloy-run', 'tracking remains informative');
  }
});

test('explicit Track can replace a detour with the selected mission course', () => {
  const { state, bus, owner, mission, orders } = fixture();
  assert.equal(owner.trackMission(mission.id), true);
  bus.emit('ui:setCourse', { type: 'sector', sectorId: 'sector_vesta_forge' });
  orders.length = 0;
  assert.equal(owner.trackMission(mission.id), true);
  assert.equal(state.nav.route.legs.at(-1).to, 'sector_tethys_junction');
  assert.equal(orders.length, 1);
});

test('an unplotted tracked mission still offers its cross-sector course', () => {
  const { state, owner, orders } = fixture();
  state.nav.route = null;
  owner._refreshNavigation({ silent: true });
  assert.equal(state.nav.route.legs.at(-1).to, 'sector_tethys_junction');
  assert.equal(orders.length, 1);
});

test('mission and forced story refresh preserve an explicit local station approach', () => {
  for (const withMission of [true, false]) {
    const { state, bus, owner, orders } = fixture();
    if (!withMission) state.missions.active = [];
    state.story.beatIndex = 1;
    bus.emit('ui:setCourse', { pos: { x: 170, z: -40 }, label: 'Forge Foundry', autopilot: true });
    const waypoint = state.nav.waypoint, autopilot = state.nav.autopilot;
    orders.length = 0;
    owner._refreshNavigation({ forceStory: true, silent: true });
    assert.equal(state.nav.waypoint, waypoint);
    assert.equal(state.nav.autopilot, autopilot);
    assert.equal(autopilot.active, true);
    assert.equal(state.nav.route, null);
    assert.deepEqual(orders, []);
  }
});
