import assert from 'node:assert/strict';
import test from 'node:test';

import { meshBuildRetryDue } from '../src/render/renderer.js';

test('loading mesh retries use wall time while the simulation clock is frozen', () => {
  const entity = {
    _meshBuildRetryAtSim: 0.25,
    _meshBuildRetryAtWallMs: 1250,
  };
  const loading = { mode: 'loading', simTime: 0 };

  assert.equal(meshBuildRetryDue(entity, loading, 1249), false,
    'the loading retry remains bounded by its wall deadline');
  assert.equal(meshBuildRetryDue(entity, loading, 1250), true,
    'a frozen sim clock must not prevent the scheduled retry');
});

test('flight mesh retries retain the deterministic simulation deadline', () => {
  const entity = {
    _meshBuildRetryAtSim: 12.25,
    _meshBuildRetryAtWallMs: 1250,
  };
  const flight = { mode: 'flight', simTime: 12 };

  assert.equal(meshBuildRetryDue(entity, flight, 5000), false,
    'flight still waits for the simulation retry deadline');
  flight.simTime = 12.25;
  assert.equal(meshBuildRetryDue(entity, flight, 5000), true);
});
