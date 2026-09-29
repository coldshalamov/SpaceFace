// PRO-11: a dossier route verb reaches the route follower only when that
// focus is the destination already plotted. Unroutable dossiers do not engage
// and do not replace the plotted route.
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeFollower } from '../src/systems/routeFollower.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';

const ATLAS = buildAtlasIndex();

function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    of(name) {
      return events.filter((e) => e.name === name);
    },
  };
}

function findRoutableChain() {
  const start = 'sector_helios_prime';
  const seen = new Set([start]);
  let frontier = [[start]];
  for (let depth = 0; depth < 6; depth++) {
    const next = [];
    for (const path of frontier) {
      const tail = path[path.length - 1];
      for (const neighbor of ATLAS.sectorNeighbors(tail)) {
        if (seen.has(neighbor)) continue;
        const extended = [...path, neighbor];
        const station = ATLAS.nodesInSector(neighbor).find((n) => n.kind === 'station');
        if (extended.length >= 3 && station) return { chain: extended, station };
        seen.add(neighbor);
        next.push(extended);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return null;
}

function routeFromChain(chain) {
  const legs = [];
  for (let i = 0; i < chain.length - 1; i++) {
    legs.push({ from: chain[i], to: chain[i + 1] });
  }
  return { legs, totalHops: legs.length };
}

function makeHarness(route) {
  const state = {
    nav: {
      route,
      autoTravel: true,
      waypoint: null,
      autopilot: { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' },
    },
    world: { currentSectorId: FOUND.chain[0] },
  };
  const bus = makeBus();
  const sys = Object.create(routeFollower);
  sys.init({ state, bus, atlas: ATLAS });
  return { state, bus, sys };
}

const FOUND = findRoutableChain();

test('a plotted destination engages from the dossier, and anything else leaves the route alone', () => {
  assert.ok(FOUND, 'authored atlas must contain a multi-hop route ending at a station');
  const { chain, station } = FOUND;
  const dest = chain[chain.length - 1];
  const earlier = chain[1];
  assert.notEqual(earlier, dest);
  assert.equal(station.sectorId, dest);
  const otherStation = ATLAS.nodesOfKind('station').find((n) => n.sectorId !== dest);
  assert.ok(otherStation, 'atlas must contain a station outside the plotted destination');

  const plotted = routeFromChain(chain);
  const quiet = makeHarness(plotted);
  const sameRoute = quiet.state.nav.route;
  const ignored = [
    { ref: 'hull:courier', route: { screen: 'ship', focus: 'hull:courier' } },
    { ref: 'module:laser', route: { screen: 'ship', focus: 'module:laser' } },
    { ref: 'commodity:ore', route: { screen: 'chart', focus: 'commodity:ore' } },
    null,
    { route: null },
    { route: { screen: 'chart', focus: '' } },
    { route: { screen: 'chart', focus: '   ' } },
    { route: { screen: 'chart', focus: 'sector:' } },
    { ref: 'sector:' + dest, route: { screen: 'chart', focus: 'sector:' + chain[0] } },
    { ref: 'sector:' + dest, route: { screen: 'chart', focus: 'sector:' + earlier } },
    { ref: 'station:' + otherStation.id, route: { screen: 'chart', focus: 'station:' + otherStation.id } },
    { ref: 'sector:' + dest, route: { screen: 'chart', focus: 'commodity:ore' } },
  ];
  for (const payload of ignored) {
    quiet.bus.emit('ui:entityRoute', payload);
    assert.equal(quiet.bus.of('nav:engageRoute').length, 0);
    assert.equal(quiet.state.nav.route, sameRoute);
    assert.equal(quiet.state.nav.executor, undefined);
  }

  const bySector = makeHarness(plotted);
  const sectorRoute = bySector.state.nav.route;
  bySector.bus.emit('ui:entityRoute', {
    ref: 'faction:not-the-destination',
    route: { screen: 'chart', focus: 'sector:' + dest },
  });
  assert.equal(bySector.bus.of('nav:engageRoute').length, 1);
  assert.equal(bySector.state.nav.route, sectorRoute);
  assert.equal(bySector.state.nav.executor && bySector.state.nav.executor.engaged, true);
  assert.equal(bySector.state.nav.executor.destinationSectorId, dest);

  const byStation = makeHarness(routeFromChain(chain));
  const stationRoute = byStation.state.nav.route;
  byStation.bus.emit('ui:entityRoute', {
    ref: 'contract:not-a-station',
    route: { screen: 'chart', focus: 'station:' + station.id },
  });
  assert.equal(byStation.bus.of('nav:engageRoute').length, 1);
  assert.equal(byStation.state.nav.route, stationRoute);
  assert.equal(byStation.state.nav.executor && byStation.state.nav.executor.engaged, true);
  assert.equal(byStation.state.nav.executor.destinationSectorId, station.sectorId);

  const unplotted = makeHarness(null);
  unplotted.bus.emit('ui:entityRoute', {
    ref: 'sector:' + dest,
    route: { screen: 'chart', focus: 'sector:' + dest },
  });
  assert.equal(unplotted.bus.of('nav:engageRoute').length, 0);
  assert.equal(unplotted.state.nav.route, null);
});
