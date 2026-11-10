import test from 'node:test';
import assert from 'node:assert/strict';
import { flightDestinationSurface, resolveFlightObjectiveCommand, objectiveTravelReadout,
  objectiveBearingGlyph, objectiveBearingDeg } from '../src/ui/hud.js';
import { resolveRadarObjective } from '../src/ui/radar.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';

function stateFor(waypoint) {
  return {
    world: { currentSectorId: CERES }, simTime: 10,
    entities: new Map([[1, { pos: { x: 0, z: 0 }, vel: { x: 30, z: 0 } }]]), playerId: 1,
    ui: { trackedMissionId: '47a' }, nav: { waypoint },
    missions: { active: [{ id: '47a', status: 'active', title: 'Contract 47A', deadline_s: 310 }] },
  };
}

test('a tracked objective in another sector names the route instead of a false local bearing', () => {
  const waypoint = { kind: 'mission', missionId: '47a', sectorId: HELIOS,
    reason: 'Target the marked derelict.', pos: { x: 11400, z: 0 } };
  const state = stateFor(waypoint);
  const navBefore = structuredClone(state.nav);
  const destination = flightDestinationSurface(state, resolveFlightObjectiveCommand(state));
  assert.match(destination.line, /Target the marked derelict/);
  assert.match(destination.line, /Plot route to Helios Prime/);
  assert.match(destination.line, /Star Map/);
  assert.match(destination.line, /5m 00s/, 'the active mission timer remains visible');
  assert.doesNotMatch(destination.line, /11\.4|→|ETA/);
  assert.equal(objectiveTravelReadout(state, waypoint).distanceWu, null);
  assert.equal(objectiveBearingGlyph(state, waypoint), '');
  assert.equal(objectiveBearingDeg(state, waypoint), null);
  assert.equal(resolveRadarObjective(state), null, 'foreign coordinates must not point on the local radar');
  assert.deepEqual(state.nav, navBefore, 'presentation never replaces the selected course');

  state.nav.route = { legs: [{ from: CERES, to: HELIOS }], totalHops: 1, totalFuel: 10 };
  assert.match(flightDestinationSurface(state, resolveFlightObjectiveCommand(state)).line, /Next jump: Helios Prime/);
  state.nav.route = { legs: [{ from: CERES, to: 'sector_tethys_junction' },
    { from: 'sector_tethys_junction', to: HELIOS }] };
  const multiHop = flightDestinationSurface(state, resolveFlightObjectiveCommand(state)).line;
  assert.match(multiHop, /Next jump: Tethys Junction/);
  assert.match(multiHop, /To Helios Prime/);

  state.world.currentSectorId = HELIOS;
  const local = flightDestinationSurface(state, resolveFlightObjectiveCommand(state));
  assert.match(local.line, /11\.4k u/);
  assert.doesNotMatch(local.line, /Plot route|Next jump/);
  assert.deepEqual(resolveRadarObjective(state).waypointPos, waypoint.pos);
});

test('an explicitly selected local course owns the display without changing tracked mission', () => {
  const waypoint = { kind: 'local', sectorId: CERES, label: 'Ceres worksite', pos: { x: 100, z: 0 } };
  const state = stateFor(waypoint);
  const command = resolveFlightObjectiveCommand(state);
  assert.equal(command.owner, 'navigation');
  const destination = flightDestinationSurface(state, command);
  assert.match(destination.line, /Ceres worksite/);
  assert.match(destination.line, /100 u/);
  assert.doesNotMatch(destination.line, /Helios Prime|47a/);
  assert.equal(state.ui.trackedMissionId, '47a');
  assert.equal(state.nav.waypoint, waypoint);
  assert.deepEqual(resolveRadarObjective(state).waypointPos, waypoint.pos);
});
