import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_ashline_v2');
const RECEIPT = resolve(
  FAMILY,
  'evidence/material_truth_v2/eligible_artifacts_lode.json',
);
const SOURCE = resolve(FAMILY, 'source/wholeships/ashline_v2_lode.glb');
const RENDERER = resolve(ROOT, 'tools/blender/render_m4_ashline_lode_material_truth.py');

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

test('Lode material-truth images bind to the exact source and ship-specific renderer', async () => {
  const rendererSource = readFileSync(RENDERER, 'utf8');
  assert.equal(
    rendererSource.includes('--receipt-only'),
    false,
    'a receipt must only be written by a complete exact-source rerender',
  );
  assert.match(
    rendererSource,
    /written = render_lode\(source, output_dir\)/u,
    'renderer must generate every eligible artifact before binding its receipt',
  );
  const receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  const sourceSha256 = sha256(SOURCE);
  const rendererSha256 = sha256(RENDERER);

  assert.equal(receipt.schema, 'spaceface.ashlineMaterialTruthArtifacts.v1');
  assert.equal(receipt.shipKey, 'lode');
  assert.equal(
    receipt.source,
    'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_lode.glb',
  );
  assert.equal(receipt.sourceSha256, sourceSha256);
  assert.deepEqual(receipt.producer, {
    path: 'tools/blender/render_m4_ashline_lode_material_truth.py',
    sha256: rendererSha256,
  });
  assert.equal(receipt.artifacts.length, 10);

  const expectedDimensions = new Map([
    ['neutral_front34.png', [1280, 720]],
    ['neutral_rear34.png', [1280, 720]],
    ['casemate_close.png', [1280, 720]],
    ['breech_recoil_close.png', [1280, 720]],
    ['torch_close.png', [1280, 720]],
    ['hard_grazing.png', [1280, 720]],
    ['top_ortho.png', [1280, 720]],
    ['emission_off.png', [1280, 720]],
    ['game_120px.png', [120, 120]],
    ['game_45px.png', [45, 45]],
  ]);
  for (const artifact of receipt.artifacts) {
    assert.ok(
      artifact.path.startsWith(
        'assets/ships/m4_ashline_v2/evidence/material_truth_v2/lode/',
      ),
      artifact.path,
    );
    assert.deepEqual(artifact.inputBindings, [{
      shipKey: 'lode',
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
