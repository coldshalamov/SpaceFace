// Semantic vs deterministic-covered checkpoints.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  buildSemanticCheckpoint,
  buildDeterministicCoveredCheckpoint,
  buildCheckpoints,
  DETERMINISTIC_OMITTED,
  DETERMINISTIC_COVERED,
} from '../src/testing/lab/checkpoint.js';

test('deterministic-covered checkpoint has explicit omissions and is not named exact', () => {
  const state = createGameState(47);
  state.mode = 'flight';
  state.tick = 10;
  state.simTime = 10 / 60;
  state.playerId = 1;
  state.entityList = [{
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 1, z: 2 },
    vel: { x: 0.1, z: 0.2 },
    rot: 0.5,
    mass: 18,
    radius: 14,
    hull: 100,
    hullMax: 100,
    data: { defId: 'ship_kestrel' },
  }];
  state.entities = new Map([[1, state.entityList[0]]]);
  state.input = { moveX: 0, moveZ: 1, turnIntent: 0, boost: false, keys: { KeyW: true } };
  state.runtime = { profileId: 'production', profileHash: 'abc', manifestHash: 'def' };

  const det = buildDeterministicCoveredCheckpoint(state, {
    scenarioDigest: 'scen',
    inputDigest: 'inp',
  });

  assert.equal(det.hashKind, 'deterministic-covered');
  assert.notEqual(det.hashKind, 'exact');
  assert.ok(Array.isArray(det.omitted) && det.omitted.length > 0);
  assert.ok(det.omitted.includes('objectIdentity'));
  assert.ok(det.omitted.includes('wallTimestamps'));
  assert.ok(Array.isArray(det.covered) && det.covered.length > 0);
  assert.ok(det.covered.includes('entities.pose'));
  assert.equal(typeof det.hash, 'string');
  assert.ok(det.hash.length >= 32);
  assert.deepEqual(det.exactWithin.crossRuntime, false);
  assert.ok(DETERMINISTIC_OMITTED.length > 0);
  assert.ok(DETERMINISTIC_COVERED.length > 0);
});

test('semantic hash is distinct from deterministic-covered hash', () => {
  const state = createGameState(47);
  state.mode = 'flight';
  state.tick = 3;
  state.entityList = [];
  state.entities = new Map();
  state.input = { moveX: 0, moveZ: 0, turnIntent: 0, boost: false };

  const semantic = buildSemanticCheckpoint(state);
  const det = buildDeterministicCoveredCheckpoint(state, { scenarioDigest: 'x', inputDigest: 'y' });
  assert.equal(semantic.hashKind, 'semantic');
  assert.equal(det.hashKind, 'deterministic-covered');
  assert.notEqual(semantic.hash, det.hash);
  assert.notEqual(semantic.coverageVersion, det.coverageVersion);

  const both = buildCheckpoints(state, { scenarioDigest: 'x', inputDigest: 'y' });
  assert.equal(both.semantic.hash, semantic.hash);
  assert.equal(both.deterministicCovered.hash, det.hash);
});

test('deterministic-covered is stable for identical state', () => {
  const make = () => {
    const state = createGameState(99);
    state.tick = 5;
    state.mode = 'flight';
    state.entityList = [{
      id: 2, type: 'ship', alive: true, team: 0,
      pos: { x: 3, z: 4 }, vel: { x: 0, z: 1 }, rot: 0, mass: 10, radius: 5, hull: 50, hullMax: 50,
    }];
    state.entities = new Map([[2, state.entityList[0]]]);
    state.input = { moveX: 0, moveZ: 1, turnIntent: 0, boost: false, keys: {} };
    return state;
  };
  const a = buildDeterministicCoveredCheckpoint(make(), { scenarioDigest: 's', inputDigest: 'i' });
  const b = buildDeterministicCoveredCheckpoint(make(), { scenarioDigest: 's', inputDigest: 'i' });
  assert.equal(a.hash, b.hash);
});
