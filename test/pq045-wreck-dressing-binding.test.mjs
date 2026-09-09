/**
 * PQ-045.wreck-dressing — Ceres bait wreck and grave shard bind to authored-down place assets.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Ceres wreck slots bind to dressed place assets, not anonymous hulk/chunk stand-ins', async () => {
  const worldSrc = readFileSync(resolve(ROOT, 'src/systems/world.js'), 'utf8');
  assert.match(worldSrc, /ceres_ambush_bait_wreck:\s*Object\.freeze\(\{\s*placeId:\s*'place_ceres_bait_wreck'/s);
  assert.match(worldSrc, /ceres_cathedral_grave_shard:\s*Object\.freeze\(\{\s*placeId:\s*'place_ceres_grave_shard'/s);
  assert.match(worldSrc, /place_ceres_bait_wreck:\s*48/);
  assert.match(worldSrc, /place_ceres_grave_shard:\s*28/);
});

test('parts library admits the two dressed place files', async () => {
  const libSrc = readFileSync(resolve(ROOT, 'src/render/partsLibrary.js'), 'utf8');
  assert.match(libSrc, /places\/place_ceres_bait_wreck\.glb/);
  assert.match(libSrc, /places\/place_ceres_grave_shard\.glb/);
});

test('manifest, source, and release artifacts exist for both dressed places', async () => {
  const parts = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
  const release = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'));
  for (const id of ['place_ceres_bait_wreck', 'place_ceres_grave_shard']) {
    const part = parts.parts.find((row) => row.id === id);
    assert.ok(part, `parts_manifest row for ${id}`);
    assert.equal(part.category, 'places');
    assert.ok(part.tris > 0, `${id} has tris`);
    assert.ok(part.sockets?.length > 0, `${id} has sockets`);
    assert.ok(existsSync(resolve(ROOT, 'assets/ships/parts', part.file)), `${id} source GLB`);
    const rel = release.assets.find((row) => row.id === id);
    assert.ok(rel, `release_manifest row for ${id}`);
    assert.equal(rel.kind, 'part:places');
    assert.ok(rel.ktx2Textures > 0, `${id} release has KTX2 textures`);
    assert.ok(rel.meshoptBufferViews > 0, `${id} release has meshopt views`);
    assert.ok(existsSync(resolve(ROOT, rel.release)), `${id} release GLB`);
  }
});

test('author-down report records mesh reduction and strictly reducing LODs', async () => {
  const report = JSON.parse(readFileSync(
    resolve(ROOT, 'assets/incubator/wreck_aftermath_pack/evidence/author-down-report.json'),
    'utf8',
  ));
  assert.equal(report.rawPack.selectedMeshes, 185);
  assert.ok(report.authoredDown.selectedMeshesLod0 < report.rawPack.selectedMeshes);
  for (const place of Object.values(report.places)) {
    const t0 = place.lod.lod0.tris;
    const t1 = place.lod.lod1.tris;
    const t2 = place.lod.lod2.tris;
    assert.ok(t0 > t1 && t1 > t2, `${place.id} LOD tris strictly reduce`);
  }
});
