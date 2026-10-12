import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { Document, NodeIO } from '@gltf-transform/core';
import { repairReleaseShading } from '../scripts/repair-release-shading.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(t, { invalidSecondSource = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-shading-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const io = new NodeIO(), entries = [], releasePaths = [];
  for (const id of ['first', 'second']) {
    const document = new Document(), buffer = document.createBuffer();
    const prim = document.createPrimitive()
      .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1])).setBuffer(buffer))
      .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2, 0, 0, 1])).setBuffer(buffer));
    const scene = document.createScene().addChild(document.createNode('hull').setMesh(document.createMesh().addPrimitive(prim)));
    document.getRoot().setDefaultScene(scene);
    const source = `source/${id}.glb`, release = `assets/ships/release/parts/${id}.glb`;
    const releasePath = join(root, release);
    await mkdir(dirname(releasePath), { recursive: true });
    await mkdir(join(root, 'source'), { recursive: true });
    const bytes = await io.writeBinary(document);
    await writeFile(releasePath, bytes);
    if (id === 'second' && invalidSecondSource) scene.addChild(document.createNode('SOCKET_Required'));
    await writeFile(join(root, source), await io.writeBinary(document));
    entries.push({ id, source, release, releaseSha256: sha256(bytes), releaseBytes: bytes.length });
    releasePaths.push(releasePath);
  }
  const manifestPath = join(root, 'assets/ships/release/release_manifest.json');
  await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, assets: entries }));
  const paths = [...releasePaths, manifestPath];
  const before = await Promise.all(paths.map((path) => readFile(path)));
  return { root, paths, releasePaths, manifestPath, before };
}

async function unchanged(f) {
  assert.deepEqual(await Promise.all(f.paths.map((path) => readFile(path))), f.before);
  for (const directory of [dirname(f.manifestPath), dirname(f.releasePaths[0])]) {
    assert.equal((await readdir(directory)).some((name) => name.includes('sf-file-set') || name.endsWith('.repair.tmp')), false);
  }
}

test('a late staged validation failure preserves every live GLB and the release manifest', async (t) => {
  const f = await fixture(t, { invalidSecondSource: true });
  await assert.rejects(repairReleaseShading({ root: f.root }), /second: repaired release fails validation/);
  await unchanged(f);
});

test('a later publication failure rolls back already-promoted GLBs and metadata', async (t) => {
  const f = await fixture(t);
  await assert.rejects(repairReleaseShading({ root: f.root, fileOps: {
    async link(from, to) {
      if (from.endsWith('.tmp') && to === f.releasePaths[1]) throw new Error('later GLB promotion failed');
      await link(from, to);
    },
  } }), /later GLB promotion failed/);
  await unchanged(f);
});

test('successful repair publishes compressed GLBs and matching release hashes together', async (t) => {
  const f = await fixture(t);
  const report = await repairReleaseShading({ root: f.root });
  assert.equal(report.length, 2);
  const manifest = JSON.parse(await readFile(f.manifestPath, 'utf8'));
  for (const entry of manifest.assets) {
    const bytes = await readFile(join(f.root, entry.release));
    assert.equal(entry.releaseSha256, sha256(bytes));
    assert.equal(entry.releaseBytes, bytes.length);
    assert.ok(entry.meshoptBufferViews > 0);
  }
  const first = await readFile(f.manifestPath);
  assert.deepEqual(await repairReleaseShading({ root: f.root }), []);
  assert.deepEqual(await readFile(f.manifestPath), first, 'a no-op leaves the published manifest untouched');
});

test('dry repair measures the candidate while keeping all live bytes untouched', async (t) => {
  const f = await fixture(t);
  assert.equal((await repairReleaseShading({ root: f.root, dry: true })).length, 2);
  await unchanged(f);
});
