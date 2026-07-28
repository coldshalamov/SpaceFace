import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_ashline_v2');
const RECEIPT = resolve(FAMILY, 'evidence/material_truth_v2/eligible_artifacts.json');
const SOURCE = resolve(FAMILY, 'source/wholeships/ashline_v2_dart.glb');
const RENDERER = resolve(ROOT, 'tools/blender/render_m4_ashline_material_truth.py');

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

test('Dart material-truth images are bound to the exact source and registered renderer', async () => {
  const receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  const sourceSha256 = sha256(SOURCE);
  const rendererSha256 = sha256(RENDERER);

  assert.equal(receipt.schema, 'spaceface.ashlineMaterialTruthArtifacts.v1');
  assert.equal(receipt.shipKey, 'dart');
  assert.equal(
    receipt.source,
    'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_dart.glb',
  );
  assert.equal(receipt.sourceSha256, sourceSha256);
  assert.deepEqual(receipt.producer, {
    path: 'tools/blender/render_m4_ashline_material_truth.py',
    sha256: rendererSha256,
  });
  assert.equal(receipt.artifacts.length, 8);

  const expectedDimensions = new Map([
    ['neutral_front34.png', [1280, 720]],
    ['neutral_rear34.png', [1280, 720]],
    ['drive_close.png', [1280, 720]],
    ['projector_close.png', [1280, 720]],
    ['projector_grazing.png', [1280, 720]],
    ['top_ortho.png', [1280, 720]],
    ['game_120px.png', [120, 120]],
    ['game_45px.png', [45, 45]],
  ]);
  for (const artifact of receipt.artifacts) {
    assert.ok(
      artifact.path.startsWith(
        'assets/ships/m4_ashline_v2/evidence/material_truth_v2/dart/',
      ),
      artifact.path,
    );
    assert.deepEqual(artifact.inputBindings, [{
      shipKey: 'dart',
      sourceSha256,
    }]);
    assert.deepEqual(artifact.producer, receipt.producer);
    const fileName = artifact.path.split('/').at(-1);
    const expected = expectedDimensions.get(fileName);
    assert.ok(expected, `unexpected artifact ${artifact.path}`);
    const metadata = await sharp(resolve(ROOT, artifact.path)).metadata();
    assert.deepEqual([metadata.width, metadata.height], expected);
  }
});
