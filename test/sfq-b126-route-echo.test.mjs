import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { FAUNA_SPECIES, faunaSpeciesById } from '../src/data/alienFauna.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { tickAlienEcology } from '../src/systems/alienEcology.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { echoApplies, echoWord, stepEchoIndex } from '../src/data/faunaRouteEcho.js';
import { interactionClassLine } from '../src/data/entityInteractionProfiles.js';

const freighter = ALIEN_SITES.warm_freighter;
const eel = faunaSpeciesById('wake_eel');
const kite = faunaSpeciesById('mourning_kite');
const cyst = faunaSpeciesById('lantern_cyst');

function lanePoint(index) {
  const w = freighter.routeEcho.waypoints[index];
  return { x: freighter.center.x + w.x, z: freighter.center.z + w.z };
}

function fixture() {
  const state = {
    meta: { seed: 4242 }, simTime: 0, playerId: 1, entities: new Map(), entityList: [],
    rng: () => 0,
    player: { cargo: { items: {} } },
    world: { currentSectorId: freighter.sectorId, sectors: {} },
  };
  let next = 100;
  const world = {
    state,
    registry: { get: () => null },
    active: { dressing: [], pois: [] },
    _toGlobal: (p) => ({ x: p.x, z: p.z }),
    _toLocal: (p) => ({ x: p.x, z: p.z }),
    bus: { emit() {} },
    helpers: { spawnEntity() { return null; }, removeEntity() {} },
  };
  const player = {
    id: 1, type: 'player', alive: true, occupantGeneration: 1, radius: 10, rot: 0,
    pos: { x: 100000, z: 100000 }, vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  ensureAlienEcologyState(state).revelation = 0;
  function fauna(speciesId, pos, siteId) {
    const species = FAUNA_SPECIES[speciesId];
    const body = {
      id: next++, type: 'fauna', alive: true, occupantGeneration: 1, rot: 0,
      pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
      radius: species.radius, hull: 100, homeSectorId: freighter.sectorId,
      data: {
        ecology: {
          speciesId, siteId, faunaKey: `fixture:${speciesId}:${next}`,
          anchor: { x: pos.x, z: pos.z }, driveState: species.drives.idle,
          phase: 0, stim: {}, driveT: 0,
        },
      },
    };
    state.entities.set(body.id, body);
    state.entityList.push(body);
    return body;
  }
  return {
    state, world, player, fauna,
    tick(dt = 1) { state.simTime += dt; tickAlienEcology(world, dt); },
  };
}

test('only a dumb host on the recorded lane takes the fragment', () => {
  assert.equal(echoApplies(eel, freighter), true);
  assert.equal(echoApplies(kite, freighter), false);
  assert.equal(echoApplies(eel, ALIEN_SITES.cinder_nursery), false);
  assert.equal(echoApplies(null, freighter), false);
  assert.equal(freighter.routeEcho.waypoints.length, 3);
});

test('the fragment pointer wraps and the lane does not grow', () => {
  const points = freighter.routeEcho.waypoints.map((w) => ({ x: w.x, z: w.z }));
  const before = points.length;
  let index = stepEchoIndex({ x: 0, z: 0 }, points, 0);
  assert.equal(index, 0);
  index = stepEchoIndex(points[0], points, 0);
  assert.equal(index, 1);
  index = stepEchoIndex(points[1], points, index);
  assert.equal(index, 2);
  index = stepEchoIndex(points[2], points, index);
  assert.equal(index, 0);
  assert.equal(points.length, before);
  assert.equal(freighter.routeEcho.waypoints.length, 3);
});

test('a drifting eel at the freighter walks the lane and stays a drifter', () => {
  const f = fixture();
  const body = f.fauna('wake_eel', { ...freighter.center }, freighter.siteId);
  const count = f.state.entityList.length;
  const speed = eel.speed;
  f.tick();
  const first = lanePoint(0);
  const startD = Math.hypot(freighter.center.x - first.x, freighter.center.z - first.z);
  const nowD = Math.hypot(body.pos.x - first.x, body.pos.z - first.z);
  assert.ok(nowD < startD);
  assert.equal(body.data.ecology.driveState, 'drift');
  assert.equal(body.data.ecology.echo, 'lane');
  assert.equal(body.data.ecology.echoIndex, 0);
  assert.equal(eel.speed, speed);
  assert.equal(f.state.entityList.length, count);
  assert.equal(interactionClassLine(body), 'Fauna · quiet · repeating a lane');
  body.pos = { ...lanePoint(0), x: lanePoint(0).x + 10, z: lanePoint(0).z };
  f.tick();
  assert.equal(body.data.ecology.echoIndex, 1);
  assert.equal(freighter.routeEcho.waypoints.length, 3);
});

test('the same eel leaves the lane inside a precursor field', () => {
  const f = fixture();
  const pylon = MACHINE_SITES.charon_pylon_field;
  const body = f.fauna('wake_eel', { ...pylon.center }, freighter.siteId);
  body.data.ecology.echo = 'lane';
  body.data.ecology.echoIndex = 1;
  f.tick();
  const moved = Math.hypot(body.pos.x - pylon.center.x, body.pos.z - pylon.center.z);
  assert.ok(moved > 10);
  assert.equal(body.data.ecology.echo, null);
  assert.equal(body.data.ecology.echoIndex, 1);
  assert.equal(interactionClassLine(body), 'Fauna · quiet');
});

test('heat and a site with no lane do not invent the fragment', () => {
  const hot = fixture();
  const body = hot.fauna('lantern_cyst', { ...freighter.center }, freighter.siteId);
  const cystSpeed = cyst.speed;
  body.data.ecology.stim.heat = 1;
  hot.tick();
  assert.ok(body.pos.x > freighter.center.x);
  assert.equal(body.data.ecology.echo ?? null, null);
  assert.equal(body.data.ecology.driveState, 'drift');

  const plain = fixture();
  const other = plain.fauna('wake_eel', { x: 1700, z: -1400 }, 'cinder_nursery');
  plain.tick();
  assert.equal(other.data.ecology.echo ?? null, null);
  assert.notEqual(other.data.ecology.driveState, 'echo');
  assert.equal(cyst.speed, cystSpeed);
});

test('the lane word is only on an animal that is repeating it', () => {
  assert.equal(echoWord('lane'), 'repeating a lane');
  assert.equal(echoWord('story'), null);
  assert.equal(echoWord(null), null);
  const quiet = { type: 'fauna', data: { ecology: { driveState: 'drift' } } };
  const echoing = { type: 'fauna', data: { ecology: { driveState: 'drift', echo: 'lane' } } };
  const feeding = { type: 'fauna', data: { ecology: { driveState: 'feed', echo: 'story' } } };
  const ship = { type: 'ship', data: {} };
  assert.equal(interactionClassLine(quiet), 'Fauna · quiet');
  assert.equal(interactionClassLine(echoing), 'Fauna · quiet · repeating a lane');
  assert.equal(interactionClassLine(feeding), 'Fauna · feeding');
  assert.equal(interactionClassLine(ship), '');
});
