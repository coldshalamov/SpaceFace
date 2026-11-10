import test from 'node:test';
import assert from 'node:assert/strict';
import { bindStuntEvidence, unbindStuntEvidence } from '../src/combat/stuntEvidence.js';
import {
  StuntFlightObserver,
  setStuntFlightHistoryQuietSkipForBench,
} from '../src/combat/stuntFlightEvidence.js';

function makeQuietState() {
  const player = {
    id: 0, type: 'ship', alive: true, isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 },
    mass: 18, radius: 6, hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel' }, collides: true,
  };
  const traffic = {
    id: 1, type: 'ship', alive: true, team: 1,
    pos: { x: 400, z: 0 }, vel: { x: -5, z: 0 },
    mass: 14, radius: 5, hull: 80, hullMax: 80,
    data: { ai: { passive: true }, combat: {} }, collides: true,
  };
  const ships = [player, traffic];
  const movables = [player, traffic];
  return {
    mode: 'flight', tick: 0, simTime: 0, playerId: 0,
    entities: new Map([[0, player], [1, traffic]]),
    entityList: [player, traffic],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      ships,
      drones: [],
      projectiles: [],
      shipLike: ships,
      movables,
      spatialDynamics: movables,
      collidables: movables,
    },
    input: {},
    settings: {},
    combat: {},
  };
}

test('quiet history skip: no nearby-body frames while tracks empty and projectile lane empty', () => {
  setStuntFlightHistoryQuietSkipForBench(true);
  const state = makeQuietState();
  bindStuntEvidence(state);
  const observer = new StuntFlightObserver();
  for (let t = 0; t < 30; t++) {
    state.tick = t;
    state.simTime = t / 60;
    observer.update(state);
  }
  assert.equal(observer.tracks.size, 0);
  assert.equal(observer.history.length, 0);
  unbindStuntEvidence(state);
});

test('bench toggle off still records history on quiet ticks', () => {
  setStuntFlightHistoryQuietSkipForBench(false);
  const state = makeQuietState();
  bindStuntEvidence(state);
  const observer = new StuntFlightObserver();
  for (let t = 0; t < 30; t++) {
    state.tick = t;
    state.simTime = t / 60;
    observer.update(state);
  }
  assert.equal(observer.tracks.size, 0);
  assert.ok(observer.history.length >= 20, `expected history, got ${observer.history.length}`);
  unbindStuntEvidence(state);
  setStuntFlightHistoryQuietSkipForBench(true);
});

test('live projectile lane keeps history recording even with no open tracks', () => {
  setStuntFlightHistoryQuietSkipForBench(true);
  const state = makeQuietState();
  const shot = {
    id: 2, type: 'projectile', alive: true, ownerId: 1, team: 1,
    pos: { x: 300, z: 0 }, vel: { x: -50, z: 0 },
    radius: 1, mass: 0.1, data: {}, collides: true,
  };
  state.entities.set(2, shot);
  state.entityList.push(shot);
  state.entityIndex.projectiles.push(shot);
  state.entityIndex.movables.push(shot);
  state.entityIndex.spatialDynamics.push(shot);
  bindStuntEvidence(state);
  const observer = new StuntFlightObserver();
  for (let t = 0; t < 20; t++) {
    state.tick = t;
    state.simTime = t / 60;
    observer.update(state);
  }
  assert.ok(observer.history.length >= 15, `expected history with live ammo, got ${observer.history.length}`);
  unbindStuntEvidence(state);
});
