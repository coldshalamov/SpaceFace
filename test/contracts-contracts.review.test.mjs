import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { inspectGlbReleaseCompression } from '../src/contracts/assetReleaseValidation.js';
import { validateSimScenario } from '../src/contracts/simScenarioSchema.js';

const SCENARIO = JSON.parse(readFileSync(
  new URL('../src/testing/scenarios/flight-fixed-input.scenario.json', import.meta.url),
  'utf8',
));

test('scenario validation rejects an infinite fixed timestep', () => {
  const result = validateSimScenario({ ...SCENARIO, dt: Infinity });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === '$.dt'));
});

test('release inspection requires every primitive to carry actual mesh compression', () => {
  const root = mkdtempSync(join(tmpdir(), 'spaceface-release-contract-'));
  try {
    writeFixture(root, 'declared-only.glb', {
      asset: { version: '2.0' },
      extensionsUsed: ['EXT_meshopt_compression'],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ bufferView: 0 }],
      bufferViews: [{}],
    });
    writeFixture(root, 'partially-compressed.glb', {
      asset: { version: '2.0' },
      extensionsUsed: ['KHR_draco_mesh_compression'],
      meshes: [{ primitives: [
        {
          attributes: { POSITION: 0 },
          extensions: {
            KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } },
          },
        },
        { attributes: { POSITION: 1 } },
      ] }],
      accessors: [{ bufferView: 1 }, { bufferView: 2 }],
      bufferViews: [{}, {}, {}],
    });
    writeFixture(root, 'fully-compressed.glb', {
      asset: { version: '2.0' },
      extensionsUsed: ['KHR_draco_mesh_compression'],
      meshes: [{ primitives: [0, 1].map((index) => ({
        attributes: { POSITION: index },
        extensions: {
          KHR_draco_mesh_compression: { bufferView: index, attributes: { POSITION: 0 } },
        },
      })) }],
      accessors: [{ bufferView: 2 }, { bufferView: 3 }],
      bufferViews: [{}, {}, {}, {}],
    });

    const declared = inspectGlbReleaseCompression('declared-only.glb', { root, releaseMode: true });
    const partial = inspectGlbReleaseCompression('partially-compressed.glb', { root, releaseMode: true });
    const full = inspectGlbReleaseCompression('fully-compressed.glb', { root, releaseMode: true });

    assert.equal(declared.releaseReady, false, 'declaring an extension does not compress geometry');
    assert.equal(partial.releaseReady, false, 'one compressed primitive cannot certify the whole mesh');
    assert.equal(full.releaseReady, true, 'fully Draco-compressed geometry remains accepted');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFixture(root, name, gltf) {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(12 + 8 + paddedLength, 0x20);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(paddedLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  writeFileSync(join(root, name), bytes);
}
