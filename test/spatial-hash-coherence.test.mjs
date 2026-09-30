import test from 'node:test';
import assert from 'node:assert/strict';

import { SpatialHash } from '../src/core/spatialHash.js';

function body(id, x, z, radius = 4) {
  return { id, pos: { x, z }, radius, alive: true, collides: true };
}

function ids(out) {
  return out.map((e) => e.id).sort((a, b) => a - b);
}

test('coherent query sees a static-layer replacement even when the dynamic owner never moved', () => {
  const hash = new SpatialHash(64);
  const ship = body(1, 0, 0);
  const oldRock = body(2, 8, 0);
  hash.rebuildLayers([oldRock], [ship], 1);
  const first = hash.queryRadiusCoherent('ship', 0, 0, 10, []);
  assert.deepEqual(ids(first), [1, 2]);

  oldRock.alive = false;
  const newRock = body(3, 8, 0);
  hash.rebuildLayers([newRock], [ship], 2);
  const out = hash.queryRadiusCoherent('ship', 0, 0, 10, []);
  assert.deepEqual(ids(out), [1, 3], 'the coherent record must not serve the retired static layer');
  assert.equal(out.includes(newRock), true);
  assert.equal(out.includes(oldRock), false);
});

test('coherent query picks up a static body added after the cache filled an empty static layer', () => {
  const hash = new SpatialHash(64);
  const ship = body(1, 0, 0);
  hash.rebuildLayers([], [ship], 1);
  assert.deepEqual(ids(hash.queryRadiusCoherent('ship', 0, 0, 10, [])), [1]);

  const rock = body(2, 8, 0);
  hash.rebuildLayers([rock], [ship], 2);
  const out = hash.queryRadiusCoherent('ship', 0, 0, 10, []);
  assert.deepEqual(ids(out), [1, 2], 'the spawned static body must appear in the next coherent query');
});

test('coherent query stops returning a static body the next layer revision removed', () => {
  const hash = new SpatialHash(64);
  const ship = body(1, 0, 0);
  const rock = body(2, 8, 0);
  hash.rebuildLayers([rock], [ship], 1);
  hash.queryRadiusCoherent('ship', 0, 0, 10, []);

  hash.rebuildLayers([], [ship], 2);
  const out = hash.queryRadiusCoherent('ship', 0, 0, 10, []);
  assert.deepEqual(ids(out), [1], 'the deleted static body must leave the candidate set');
  assert.equal(out.includes(rock), false);
});

test('same-id static replacement never returns the retired object from a coherent record', () => {
  const hash = new SpatialHash(64);
  const ship = body(1, 0, 0);
  const rockA = body(2, 8, 0);
  hash.rebuildLayers([rockA], [ship], 1);
  const first = hash.queryRadiusCoherent('ship', 0, 0, 10, []);
  assert.equal(first.includes(rockA), true);

  rockA.alive = false;
  const rockB = body(2, 8, 0);
  hash.rebuildLayers([rockB], [ship], 2);
  const out = hash.queryRadiusCoherent('ship', 0, 0, 10, []);
  assert.equal(out.includes(rockB), true);
  assert.equal(out.includes(rockA), false, 'the retired object must never leak through the coherent cache');
});

test('an unchanged static version plus unchanged dynamic membership still earns a coherent hit', () => {
  const hash = new SpatialHash(64);
  const ship = body(1, 0, 0);
  const rock = body(2, 8, 0);
  hash.rebuildLayers([rock], [ship], 1);
  hash.queryRadiusCoherent('ship', 0, 0, 10, []);
  hash.rebuildLayers([rock], [ship], 1);

  const hitsBefore = hash.diagnostics.coherentQueryHits;
  const out = hash.queryRadiusCoherent('ship', 0, 0, 10, []);
  assert.equal(hash.diagnostics.coherentQueryHits, hitsBefore + 1, 'identical footprint and versions must hit');
  assert.deepEqual(ids(out), [1, 2]);
});

test('a shrinking query footprint inside the recorded cell rectangle still returns superset candidates', () => {
  const hash = new SpatialHash(64);
  const ship = body(1, 0, 0);
  const nearRock = body(2, 8, 0);
  const farRock = body(3, 60, 0);
  hash.rebuildLayers([nearRock, farRock], [ship], 1);

  const wide = hash.queryRadiusCoherent('ship', 0, 0, 70, []);
  assert.deepEqual(ids(wide), [1, 2, 3]);

  const hitsBefore = hash.diagnostics.coherentQueryHits;
  const narrow = hash.queryRadiusCoherent('ship', 0, 0, 10, []);
  assert.equal(hash.diagnostics.coherentQueryHits, hitsBefore + 1, 'the narrow footprint stays inside the recorded cells: coherent hit');
  assert.equal(narrow.includes(farRock), true, 'coherent returns the broad-phase superset; consumers apply the exact circle test');
});
