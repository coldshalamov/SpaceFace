import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { planAssetBankScene } from '../scripts/plan-asset-bank-scene.mjs';

const cli = fileURLToPath(new URL('../scripts/plan-asset-bank-scene.mjs', import.meta.url));
async function fixture(t, overrides = {}) {
  const temp = await mkdtemp(path.join(tmpdir(), 'asset-bank-scene-'));
  t.after(() => rm(temp, { force: true, recursive: true }));
  const root = path.join(temp, 'bank');
  await mkdir(root);
  const asset = { assetId: 'beam', category: 'structure', source: 'tools/blender/forge/example.py',
    unit: 'metre', sockets: [], tags: [], bounds: { min: [0, 0, 0], max: [2, 1, 3] },
    lods: [0, 1].map(level => ({ level, file: `beam_lod${level}.glb`, triangles: 120 - 40 * level, draws: 3 - level, bytes: 8 })),
    ...overrides };
  await writeFile(path.join(root, 'beam.json'), JSON.stringify(asset));
  for (const lod of asset.lods) if (!/[\\/]/.test(lod.file)) await writeFile(path.join(root, lod.file), 'fixture!');
  return { root, temp };
}
const placement = overrides => ({ assetId: 'beam', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], ...overrides });
function near(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-10, `${value} != ${expected[i]} at ${i}`));
}

test('repeated occurrences retain input order, selected LODs and per-instance costs', async t => {
  const { root } = await fixture(t);
  const spec = { placements: [placement({ instanceId: 'first', position: [-5, 0, 0] }), placement({ lod: 1, position: [5, 0, 0] }), placement({ lod: 1 })] };
  const result = await planAssetBankScene(spec, { root });
  assert.deepEqual(result.totals, { instances: 3, triangles: 280, draws: 7 });
  assert.deepEqual(result.placements.map(p => p.instanceId), ['first', 'placement-000002', 'placement-000003']);
  assert.deepEqual(result.placements.map(p => p.lod.path), ['beam_lod0.glb', 'beam_lod1.glb', 'beam_lod1.glb']);
  assert.deepEqual(result.bounds, { min: [-5, 0, 0], max: [7, 1, 3] });
  assert.equal(result.placements[0].source, 'tools/blender/forge/example.py');
  assert.equal(result.placements[0].metadataPath, 'beam.json');
  assert.match(result.kind, /not runtime registration/);
  assert.deepEqual(await planAssetBankScene(spec, { root }), result);
});

test('rotated nonuniform scaling transforms all corners, not just min/max endpoints', async t => {
  const { root } = await fixture(t);
  const result = await planAssetBankScene({ placements: [placement({
    position: [10, 20, 30], rotation: [0, 0, Math.PI / 4], scale: [2, 3, 4],
  })] }, { root });
  const bounds = result.placements[0].bounds;
  near(bounds.min, [10 - 3 / Math.sqrt(2), 20, 30]);
  near(bounds.max, [10 + 4 / Math.sqrt(2), 20 + 7 / Math.sqrt(2), 42]);
  assert.deepEqual(result.bounds, bounds);
});

test('multi-axis rotations obey fixed X then Y then Z with a column-major matrix', async t => {
  const { root } = await fixture(t);
  const result = await planAssetBankScene({ placements: [placement({
    position: [10, 20, 30], rotation: [Math.PI / 2, Math.PI / 2, Math.PI / 2], scale: [2, 3, 4],
  })] }, { root });
  near(result.bounds.min, [10, 20, 26]);
  near(result.bounds.max, [22, 23, 30]);
  near(result.placements[0].matrix, [0, 0, -2, 0, 0, 3, 0, 0, 4, 0, 0, 0, 10, 20, 30, 1]);
});

test('negative scale mirrors asymmetric bounds; empty plans have null bounds', async t => {
  const { root } = await fixture(t);
  const result = await planAssetBankScene({ placements: [placement({ scale: [-2, 1, 1] })] }, { root });
  assert.deepEqual(result.bounds, { min: [-4, 0, 0], max: [0, 1, 3] });
  const empty = await planAssetBankScene({ placements: [] }, { root });
  assert.equal(empty.bounds, null);
  assert.deepEqual(empty.totals, { instances: 0, triangles: 0, draws: 0 });
});

test('rejects missing IDs, invalid transforms, unknown paths, and conflicting identities', async t => {
  const { root } = await fixture(t);
  for (const overrides of [
    { assetId: 'missing' }, { assetId: '../beam' }, { assetId: 'a\\beam' },
    { position: [1, 2] }, { position: [1, Infinity, 3] }, { position: ['1', 2, 3] },
    { rotation: [0, NaN, 0] }, { rotation: null }, { scale: [1, 0, 1] },
    { scale: [1, 2, 3, 4] }, { scale: undefined }, { lod: -1 }, { lod: 9 },
    { lod: 0.5 }, { lod: null }, { instanceId: null }, { instanceId: '../instance' }, { path: '../asset.glb' },
    { position: [Number.MAX_VALUE, 0, 0], scale: [Number.MAX_VALUE, 1, 1] },
  ]) await assert.rejects(planAssetBankScene({ placements: [placement(overrides)] }, { root }));
  await assert.rejects(planAssetBankScene({ placements: [placement({ instanceId: 'same' }), placement({ instanceId: 'same' })] }, { root }), /duplicate instanceId/);
  await assert.rejects(planAssetBankScene({ placements: [], root: '../elsewhere' }, { root }), /unknown field/);
  await assert.rejects(planAssetBankScene({ schemaVersion: 2, placements: [] }, { root }), /schemaVersion/);
});

test('catalog validation still rejects unsafe sidecar paths and incompatible units', async t => {
  for (const overrides of [
    { source: '../outside.py' }, { unit: 'foot' },
    { lods: [{ level: 0, file: '../outside.glb', triangles: 1, draws: 1, bytes: 1 }] },
  ]) {
    const { root } = await fixture(t, overrides);
    await assert.rejects(planAssetBankScene({ placements: [placement()] }, { root }), /unsafe|metre/);
  }
});

test('occurrence cost overflow is rejected rather than rounded', async t => {
  const { root } = await fixture(t, { lods: [{ level: 0, file: 'beam_lod0.glb', triangles: Number.MAX_SAFE_INTEGER, draws: 1, bytes: 8 }] });
  await assert.rejects(planAssetBankScene({ placements: [placement(), placement()] }, { root }), /safe integer/);
});

test('CLI produces deterministic JSON and errors without partial output', async t => {
  const { root, temp } = await fixture(t);
  const file = path.join(temp, 'scene.json');
  await writeFile(file, JSON.stringify({ placements: [placement()] }));
  const args = [cli, '--scene', file, `--root=${root}`];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.deepEqual(JSON.parse(first.stdout).totals, { instances: 1, triangles: 120, draws: 3 });
  await writeFile(file, JSON.stringify({ placements: [placement({ assetId: 'missing' })] }));
  const failed = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /missing asset/);
});
