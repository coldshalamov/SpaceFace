import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  applyEntityMeshVisibility,
  shouldSubmitEntityMesh,
} from '../src/render/entityMeshVisibility.js';

test('player and forced roots stay submitted; off-runway roots do not', () => {
  assert.equal(shouldSubmitEntityMesh({ isPlayer: true, hidden: true }), true);
  assert.equal(shouldSubmitEntityMesh({ forceRender: true, hidden: true }), true);
  assert.equal(shouldSubmitEntityMesh({ neverCull: true, hidden: true }), true);
  assert.equal(shouldSubmitEntityMesh({ hidden: true }), false);
  assert.equal(shouldSubmitEntityMesh({ hidden: false }), true);
  assert.equal(shouldSubmitEntityMesh({ middleBand: true }), false);
  assert.equal(shouldSubmitEntityMesh({ middleBand: true, allowShadowCast: true }), true);
});

test('visibility helper only writes when the flag changes', () => {
  const mesh = { visible: true };
  assert.equal(applyEntityMeshVisibility(mesh, false), true);
  assert.equal(mesh.visible, false);
  assert.equal(applyEntityMeshVisibility(mesh, false), false);
  assert.equal(applyEntityMeshVisibility(mesh, true), true);
  assert.equal(mesh.visible, true);
});

test('authored station and place commits merge static plates before freeze', async () => {
  const source = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(source, /optimizeStaticBatchesForRoot\(stationed\)/);
  assert.match(source, /optimizeStaticBatchesForRoot\(placed\)/);
  assert.match(source, /optimizeStaticBatchesForRoot\(authored\.root\)/);
});

test('live entity view sync hides off-runway roots through the helper', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /applyEntityMeshVisibility\(mesh,\s*shouldSubmitEntityMesh\(/);
  assert.match(source, /hidden:\s*true/);
  assert.match(source, /hidden:\s*false/);
  assert.match(source, /middleBand:\s*viewBand === 'middle'/);
});
