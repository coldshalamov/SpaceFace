import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionOwner, CONTRACT_47A_B1_TAG } from '../src/systems/missions.js';
import { world as worldOwner } from '../src/systems/world.js';
import { emitGalaxyMapPrimaryAction, getSearchTargets, resolveGalaxyMapPrimaryAction } from '../src/ui/galaxyMap.js';
import { captureEntitySelection } from '../src/ui/sim/stableSelection.js';

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

function movingGoal() {
  const f = fixture();
  const { state, mission } = f;
  state.world.currentSectorId = 'sector_ceres_belt';
  mission.storyTag = 'campaign47a:b1:infested';
  mission.destSectorId = state.world.currentSectorId;
  const mite = { id: 91, type: 'fauna', name: 'Marked mite', alive: true, occupantGeneration: 4,
    pos: { x: -10617, z: 9983 }, data: {} };
  state.entities.set(mite.id, mite);
  const marker = state.nav.waypoint = { kind: 'mission', missionId: mission.id, missionTitle: mission.title,
    label: 'Refinery hauler — repair-mite clearance', reason: 'Clear four marked repair-mite sites with frag blasts.',
    sectorId: state.world.currentSectorId, pos: { ...mite.pos }, targetEntityId: mite.id,
    stable: captureEntitySelection(mite) };
  mite.pos.x += 1;
  const goal = getSearchTargets(state, 'local', state.world.currentSectorId).find(row => row.id === 'active-map-goal');
  const action = resolveGalaxyMapPrimaryAction(state, goal);
  assert.equal(action.label, 'Track Waypoint');
  return { ...f, mite, marker, action };
}

test('tracking a moving mission goal keeps its guidance and uses the current body pose', () => {
  const { state, bus, mission, mite, marker, action } = movingGoal();
  assert.equal(action.coursePayload.missionId, mission.id);
  mite.pos.x += 3;
  assert.ok(emitGalaxyMapPrimaryAction(bus, action));
  assert.equal(state.nav.waypoint.kind, 'mission');
  assert.equal(state.nav.waypoint.missionId, mission.id);
  assert.equal(state.nav.waypoint.missionTitle, marker.missionTitle);
  assert.equal(state.nav.waypoint.reason, marker.reason);
  assert.deepEqual(state.nav.waypoint.pos, mite.pos);
  assert.equal(state.nav.autopilot.active, true);
  assert.equal(state.nav.autopilot.targetEntityId, mite.id);
  assert.deepEqual(state.nav.autopilot.target, mite.pos);
});

test('a local detour, another body, and a reused id cannot inherit moving mission guidance', () => {
  for (const changed of ['detour', 'other body', 'new generation']) {
    const { state, bus, owner, mite, action } = movingGoal();
    const payload = { ...action.coursePayload };
    if (changed === 'detour') {
      payload.pos = { x: payload.pos.x + 160, z: payload.pos.z };
      delete payload.targetEntityId;
      delete payload.stable;
    } else {
      const other = { ...mite, id: changed === 'other body' ? 92 : mite.id, occupantGeneration: 5 };
      state.entities.set(other.id, other);
      if (changed === 'other body') {
        payload.targetEntityId = other.id;
        payload.stable = captureEntitySelection(other);
      }
    }
    bus.emit('ui:setCourse', payload);
    const detour = state.nav.waypoint;
    assert.equal(detour.kind, 'local', changed);
    assert.equal(detour.missionId, undefined, changed);
    if (changed === 'new generation') assert.equal(state.nav.autopilot.targetEntityId, null);
    owner._refreshNavigation({ silent: true });
    assert.equal(state.nav.waypoint, detour, changed);
  }
});
