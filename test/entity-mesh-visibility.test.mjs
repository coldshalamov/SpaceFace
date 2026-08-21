import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  applyEntityMeshVisibility,
  shouldSubmitEntityMesh,
} from '../src/render/entityMeshVisibility.js';

test('player and forced roots stay submitted; only true off-screen roots drop', () => {
  assert.equal(shouldSubmitEntityMesh({ isPlayer: true, hidden: true }), true);
  assert.equal(shouldSubmitEntityMesh({ forceRender: true, hidden: true }), true);
  assert.equal(shouldSubmitEntityMesh({ neverCull: true, hidden: true }), true);
  assert.equal(shouldSubmitEntityMesh({ hidden: true }), false);
  assert.equal(shouldSubmitEntityMesh({ hidden: false }), true);
  // Middle band is still in the query picture. LOD1 traffic and stations that no
  // longer cast realtime shadows must stay visible.
  assert.equal(shouldSubmitEntityMesh({ middleBand: true }), true);
  assert.equal(shouldSubmitEntityMesh({ middleBand: true, allowShadowCast: false, type: 'ship' }), true);
  assert.equal(shouldSubmitEntityMesh({ middleBand: true, allowShadowCast: false, type: 'station' }), true);
  assert.equal(shouldSubmitEntityMesh({ projectedPx: 4, type: 'ship' }), true);
  assert.equal(shouldSubmitEntityMesh({ projectedPx: 4, type: 'station' }), true);
  assert.equal(shouldSubmitEntityMesh({ presentationTier: 'R1_RUNWAY' }), false,
    'runway packages stay resident but are not submitted');
  assert.equal(shouldSubmitEntityMesh({ isPlayer: true, presentationTier: 'R1_RUNWAY' }), true);
  assert.equal(shouldSubmitEntityMesh({ presentationTier: 'R0_GLASS' }), true);
});

test('missing fenced poses retain protected roots but fail closed for ordinary roots', () => {
  assert.equal(shouldSubmitEntityMesh({ isPlayer: true, snapshotMissing: true }), true);
  assert.equal(shouldSubmitEntityMesh({ forceRender: true, snapshotMissing: true }), true);
  assert.equal(shouldSubmitEntityMesh({ neverCull: true, snapshotMissing: true }), true);
  assert.equal(shouldSubmitEntityMesh({ entityId: 7, snapshotMissing: true }), false);
});

test('the completed activity frame owns glass submission while runway stays resident-only', () => {
  const activityFrame = {
    complete: true,
    renderGlassIds: new Set([7]),
    renderRunwayIds: new Set([8]),
  };
  assert.equal(shouldSubmitEntityMesh({ activityFrame, entityId: 7 }), true);
  assert.equal(shouldSubmitEntityMesh({ activityFrame, entityId: 8 }), false);
  assert.equal(shouldSubmitEntityMesh({ activityFrame, entityId: 9 }), false,
    'metadata/unloaded entities outside the frame do not keep an Object3D submitted');
  assert.equal(shouldSubmitEntityMesh({ activityFrame, entityId: 7, snapshotMissing: true }), false,
    'an ordinary stale root stays hidden until the fenced snapshot contains its entity');
  assert.equal(shouldSubmitEntityMesh({ activityFrame, entityId: 7, isPlayer: true, snapshotMissing: true }), true,
    'the player keeps its last safe visibility through a fenced-pose gap');
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

test('default video settings still request full picture quality', async () => {
  const source = await readFile(new URL('../src/core/gameState.js', import.meta.url), 'utf8');
  assert.match(source, /renderScale:\s*1(?:\.0)?/);
  assert.match(source, /bloom:\s*true/);
  assert.match(source, /shadows:\s*true/);
  assert.match(source, /pixelRatioCap:\s*2/);
  assert.match(source, /particleQuality:\s*'medium'/);
});

test('live entity view sync hides off-runway roots through the helper', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /applyEntityMeshVisibility\(mesh,\s*shouldSubmitEntityMesh\(/);
  assert.match(source, /hidden:\s*true/);
  assert.match(source, /hidden:\s*false/);
  assert.match(source, /snapshotMissing:\s*!posed/);
  assert.match(source, /let posed = this\._hasCompletedPresentationPose\(slot,\s*entityId\)/,
    'clean roots derive pose validity from the latest completed fence');
  assert.match(source, /snapshotIndexOf\(snapshot,\s*entityId\)/,
    'ordinary roots fail closed when the completed fence has no matching identity');
  assert.match(source, /middleBand:\s*viewBand === 'middle'/);
});
