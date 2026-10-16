import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { tickAlienEcology, serializeAlienEcologyState, deserializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { ECHO_REACH } from '../src/data/faunaRouteEcho.js';
import { HUMAN_DOCK_CHART, CHART_FINDING, chartMatches, chartPlace } from '../src/data/routeChart.js';

const freighter = ALIEN_SITES.warm_freighter;
const eel = FAUNA_SPECIES.wake_eel;

function lanePoint(index) {
  const w = freighter.routeEcho.waypoints[index];
  return { x: freighter.center.x + w.x, z: freighter.center.z + w.z };
}

test('the old note matches the repeated lane and a shifted note does not', () => {
  assert.equal(chartMatches(freighter.routeEcho.waypoints, HUMAN_DOCK_CHART), true);
  const shifted = {
    marks: HUMAN_DOCK_CHART.marks.map((m, i) => (i === 2 ? { x: m.x + 80, z: m.z } : { x: m.x, z: m.z })),
  };
  assert.equal(chartMatches(freighter.routeEcho.waypoints, shifted), false);
  const place = chartPlace(freighter, HUMAN_DOCK_CHART);
  const last = lanePoint(2);
  assert.equal(place.text, CHART_FINDING);
  assert.equal(place.x, last.x);
  assert.equal(place.z, last.z);
  assert.equal(chartPlace(freighter, shifted), null);
  assert.equal(freighter.routeEcho.waypoints.length, 3);
});

function fixture() {
  const state = {
    meta: { seed: 4242 }, simTime: 0, playerId: 1, entities: new Map(), entityList: [],
    rng: () => 0,
    player: { cargo: { items: {} } },
    world: { currentSectorId: freighter.sectorId, sectors: {} },
  };
  const events = [];
  let next = 100;
  const world = {
    state,
    registry: { get: () => null },
    active: { dressing: [], pois: [] },
    _toGlobal: (p) => ({ x: p.x, z: p.z }),
    _toLocal: (p) => ({ x: p.x, z: p.z }),
    bus: { emit: (type, payload) => events.push({ type, payload }) },
    helpers: {
      spawnEntity(spec) {
        const body = {
          id: next++, alive: true, type: spec.type, name: spec.name,
          pos: { x: spec.pos.x, z: spec.pos.z }, radius: spec.radius || 8,
          scanLabel: spec.scanLabel, data: {},
        };
        state.entities.set(body.id, body);
        state.entityList.push(body);
        return body;
      },
      removeEntity() {},
    },
  };
  const player = {
    id: 1, type: 'player', alive: true, occupantGeneration: 1, radius: 10, rot: 0,
    pos: { x: 100000, z: 100000 }, vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  ensureAlienEcologyState(state).revelation = 0;
  function fauna(pos) {
    const body = {
      id: next++, type: 'fauna', alive: true, occupantGeneration: 1, rot: 0,
      pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
      radius: eel.radius, hull: 100, homeSectorId: freighter.sectorId,
      data: {
        ecology: {
          speciesId: 'wake_eel', siteId: freighter.siteId, faunaKey: `fixture:eel:${next}`,
          anchor: { ...freighter.center }, driveState: eel.drives.idle,
          phase: 0, stim: {}, driveT: 0,
        },
      },
    };
    state.entities.set(body.id, body);
    state.entityList.push(body);
    return body;
  }
  return {
    state, world, events, fauna,
    tick(dt = 1) { state.simTime += dt; tickAlienEcology(world, dt); },
  };
}

test('standing on the last mark leaves one dock mark, and a reload does not leave another', () => {
  const f = fixture();
  const before = eel.speed;
  const idle = f.fauna({ ...freighter.center });
  f.tick();
  assert.equal(f.state.entityList.filter((e) => e.type === 'beacon').length, 0);
  idle.alive = false;
  const body = f.fauna(lanePoint(2));
  const count = f.state.entityList.length;
  f.tick();
  const marks = f.state.entityList.filter((e) => e.type === 'beacon');
  assert.equal(marks.length, 1);
  assert.ok(Math.hypot(marks[0].pos.x - lanePoint(2).x, marks[0].pos.z - lanePoint(2).z) <= ECHO_REACH);
  assert.equal(marks[0].scanLabel, CHART_FINDING);
  const finding = ensureAlienEcologyState(f.state).chartFindings[freighter.siteId];
  assert.equal(finding.text, CHART_FINDING);
  assert.equal(finding.entityId, marks[0].id);
  f.tick();
  assert.equal(f.state.entityList.filter((e) => e.type === 'beacon').length, 1);
  assert.equal(freighter.routeEcho.waypoints.length, 3);
  assert.equal(body.data.ecology.echo, 'lane');
  assert.equal(eel.speed, before);
  assert.ok(f.state.entityList.length >= count);
  const saved = serializeAlienEcologyState(f.state);
  const restored = { world: {} };
  deserializeAlienEcologyState(restored, JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.world.alienEcology.chartFindings[freighter.siteId].text, CHART_FINDING);
  const again = fixture();
  again.state.world.alienEcology = restored.world.alienEcology;
  again.fauna(lanePoint(2));
  again.tick();
  assert.equal(again.state.entityList.filter((e) => e.type === 'beacon').length, 0);
});
