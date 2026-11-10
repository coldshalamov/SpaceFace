import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listAssetBank } from '../scripts/list-asset-bank.mjs';

const cli = fileURLToPath(new URL('../scripts/list-asset-bank.mjs', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'asset-bank-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function asset(root, id, category = 'structure', overrides = {}, folder = category) {
  const dir = path.join(root, folder);
  await mkdir(dir, { recursive: true });
  const row = { assetId: id, category, description: `Test ${id}`, unit: 'metre',
    source: 'tools/blender/forge/example.py', runtimeStatus: 'not registered',
    bounds: { min: [-2, 0, -1], max: [2, 3, 5] },
    sockets: [{ name: 'SOCKET_B' }, { name: 'SOCKET_A' }], tags: ['modular', 'Forge'],
    lods: [2, 0, 1].map(level => ({ level, file: `${id}_lod${level}.glb`, triangles: 100 - level * 20,
      draws: 2, bytes: 8 })), ...overrides };
  for (const lod of row.lods) {
    if (!/[\\/]/.test(lod.file)) await writeFile(path.join(dir, lod.file), 'fixture!');
  }
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(row));
  return row;
}

test('empty directory is an empty catalog; missing directory is a clear error', async t => {
  const root = await fixture(t);
  assert.deepEqual(await listAssetBank(root), []);
  await assert.rejects(listAssetBank(path.join(root, 'missing')), { code: 'ENOENT' });
  const output = spawnSync(process.execPath, [cli, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(output.status, 0);
  assert.deepEqual(JSON.parse(output.stdout), []);
});

test('reports actual sidecar fields and exported paths in deterministic order', async t => {
  const root = await fixture(t);
  await asset(root, 'zeta');
  await asset(root, 'beta', 'cargo');
  await asset(root, 'alpha');
  const rows = await listAssetBank(root);
  assert.deepEqual(rows.map(r => r.assetId), ['beta', 'alpha', 'zeta']);
  assert.deepEqual(rows[1], { assetId: 'alpha', category: 'structure', description: 'Test alpha',
    kind: 'authoring-library candidate', runtimeStatus: 'not registered', unit: 'metre',
    dimensions: [4, 3, 6], bounds: { min: [-2, 0, -1], max: [2, 3, 5] },
    socketNames: ['SOCKET_A', 'SOCKET_B'], tags: ['Forge', 'modular'],
    source: 'tools/blender/forge/example.py', metadataPath: 'structure/alpha.json',
    lods: [0, 1, 2].map(level => ({ level, path: `structure/alpha_lod${level}.glb`,
      triangles: 100 - level * 20, draws: 2, bytes: 8 })) });
  assert.deepEqual(await listAssetBank(root), rows);
  const output = spawnSync(process.execPath, [cli, `--root=${root}`, '--json'], { encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  assert.deepEqual(JSON.parse(output.stdout), rows);
});

test('exact category, ID and tag filters combine and exclude review evidence', async t => {
  const root = await fixture(t);
  await asset(root, 'alpha');
  await asset(root, 'beta', 'cargo', { tags: ['cargo'] });
  await asset(root, 'alpha', 'structure', {}, 'evidence');
  await writeFile(path.join(root, 'review.json'), JSON.stringify({ assets: [{ assetId: 'receipt' }] }));
  assert.deepEqual((await listAssetBank(root, { category: 'structure', id: 'alpha', tag: 'Forge' })).map(r => r.assetId), ['alpha']);
  assert.deepEqual(await listAssetBank(root, { id: 'alp' }), []);
  assert.deepEqual(await listAssetBank(root, { tag: 'forge' }), []);
  assert.equal((await listAssetBank(root)).length, 2);
});

test('duplicate IDs fail even when filters would hide them', async t => {
  const root = await fixture(t);
  await asset(root, 'alpha');
  await asset(root, 'alpha', 'cargo');
  await assert.rejects(listAssetBank(root, { category: 'absent' }), /duplicate asset ID alpha/);
});

test('rejects traversal and malformed metadata', async t => {
  for (const overrides of [
    { source: '../outside.py' }, { source: 'C:\\outside.py' },
    { source: '/outside.py' }, { source: 'tools/../outside.py' },
    { lods: [{ level: 0, file: '../outside.glb', triangles: 1, draws: 1, bytes: 1 }] },
    { lods: [{ level: 0, file: '..\\outside.glb', triangles: 1, draws: 1, bytes: 1 }] },
    { assetId: '../bad' }, { bounds: { min: [2, 0, 0], max: [1, 1, 1] } },
    { lods: [] },
  ]) {
    const root = await fixture(t);
    await asset(root, 'alpha', 'structure', overrides);
    await assert.rejects(listAssetBank(root), /unsafe|invalid|missing/);
  }
});

test('missing exports and symlinks cannot masquerade as exported pieces', async t => {
  const root = await fixture(t);
  await asset(root, 'alpha');
  const glb = path.join(root, 'structure/alpha_lod0.glb');
  await rm(glb);
  await assert.rejects(listAssetBank(root), { code: 'ENOENT' });
  await symlink(path.join(root, 'structure/alpha_lod1.glb'), glb);
  await assert.rejects(listAssetBank(root), /Symlinks/);
});

test('CLI errors go to stderr with nonzero exit, without partial JSON', async t => {
  const root = await fixture(t);
  for (const args of [['--root'], ['--surprise'], ['--root', root, '--root', root], ['--root', `${root}/missing`, '--json']]) {
    const output = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(output.status, 1);
    assert.equal(output.stdout, '');
    assert.match(output.stderr, /Asset bank catalog:/);
  }
});
