import assert from 'node:assert/strict';
import test from 'node:test';

import {
  forEachJobInteractable,
  forEachLivingWorldActor,
  isLivingWorldActor,
  livingWorldActorSeenTypes,
} from '../src/world/livingWorldViews.js';
import { barkDirector } from '../src/systems/barkDirector.js';

function fatState() {
  const ship = {
    id: 1, type: 'ship', alive: true, isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, data: { ai: {} }, flags: {},
  };
  const station = {
    id: 2, type: 'station', alive: true, pos: { x: 10, z: 0 },
    data: { stationId: 'station_test', lawful: true }, flags: {},
  };
  const rock = {
    id: 3, type: 'asteroid', alive: true, pos: { x: 4, z: 0 }, radius: 8,
    data: { oreHP: 10, lawWitness: true }, flags: {},
  };
  const fx = {
    id: 4, type: 'fx', alive: true, pos: { x: 5, z: 0 },
    data: { poi: true, lawWitness: true }, flags: {},
  };
  const wreck = {
    id: 5, type: 'wreck', alive: true, pos: { x: 6, z: 0 }, data: {}, flags: {},
  };
  const list = [ship, station, rock, fx, wreck];
  const map = new Map(list.map((e) => [e.id, e]));
  return {
    tick: 1,
    simTime: 1,
    mode: 'flight',
    playerId: 1,
    entities: map,
    entityList: list,
    ship, station, rock, fx, wreck,
  };
}

test('living-world helper never yields asteroids or dressing FX', () => {
  const state = fatState();
  const seen = [];
  forEachLivingWorldActor(state, (entity) => seen.push(entity.type));
  assert.deepEqual(seen.sort(), ['ship', 'station', 'wreck']);
  assert.deepEqual(livingWorldActorSeenTypes(state), ['ship', 'station', 'wreck']);
  assert.equal(isLivingWorldActor(state.rock), false);
  assert.equal(isLivingWorldActor(state.fx), false);
  const jobSeen = [];
  forEachJobInteractable(state, (entity) => jobSeen.push(entity.type));
  assert.ok(!jobSeen.includes('asteroid'));
  assert.ok(!jobSeen.includes('fx'));
});

test('bark director update does not walk rocks or dressing', () => {
  const state = fatState();
  const visited = [];
  const original = state.entityList[Symbol.iterator].bind(state.entityList);
  // Presence of entityIndex buckets is the production path; fat master list still exists.
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    shipLike: [state.ship],
    stations: [state.station],
    wrecks: [state.wreck],
    payloads: [],
    pickups: [],
    asteroids: [state.rock],
  };
  Object.defineProperty(state.entityList, Symbol.iterator, {
    configurable: true,
    value: function* () {
      visited.push('master-list');
      yield* original();
    },
  });
  barkDirector.init({
    state,
    bus: { on() { return () => {}; }, emit() {} },
    helpers: {},
  });
  barkDirector.update(1 / 60, state);
  assert.deepEqual(visited, []);
});
