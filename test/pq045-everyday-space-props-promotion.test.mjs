/**
 * PQ-045.prop-promotion — focused promotion contract for the sixteen selected
 * Everyday Space props. Does not claim runtime scatter, G1–G7 visual acceptance,
 * or performance.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const SELECTED = [
  'cargo_pod_standard', 'container_rack', 'freight_platform', 'transfer_arm',
  'radiator_bank', 'slurry_tank', 'drill_platform', 'conveyor_truss',
  'extraction_mast', 'worklight_tower', 'transponder_gate', 'interdiction_buoy',
  'sensor_mast', 'scrap_cage', 'improvised_dock', 'maintenance_gantry',
];

function placeId(propId) {
  return `place_${propId}`;
}

describe('PQ-045 everyday space prop promotion', () => {
  const buildReport = JSON.parse(readFileSync(
    resolve(ROOT, 'assets/incubator/everyday_space_kit/production/evidence/build-report.json'),
    'utf8',
  ));
  const partsManifest = JSON.parse(readFileSync(
    resolve(ROOT, 'assets/ships/parts/parts_manifest.json'),
    'utf8',
  ));
  const releaseManifest = JSON.parse(readFileSync(
    resolve(ROOT, 'assets/ships/release/release_manifest.json'),
    'utf8',
  ));
  const byBuild = new Map((buildReport.assets || []).map((row) => [row.id, row]));
  const byPart = new Map((partsManifest.parts || []).map((row) => [row.id, row]));
  const byRelease = new Map((releaseManifest.assets || []).map((row) => [row.id, row]));

  it('covers exactly the ledger §4.2 sixteen', () => {
    assert.equal(SELECTED.length, 16);
    assert.equal(buildReport.assets?.length, 16);
    for (const id of SELECTED) assert.ok(byBuild.has(id), `missing build row ${id}`);
  });

  it('authors strictly reducing LOD0 > LOD1 > LOD2 for every prop', () => {
    for (const id of SELECTED) {
      const lod = byBuild.get(id).lodTriangles;
      assert.ok(lod.lod0 > lod.lod1 && lod.lod1 > lod.lod2 && lod.lod2 > 0,
        `${id} lod not strictly reducing: ${JSON.stringify(lod)}`);
      assert.equal(byBuild.get(id).lodStrictlyReducing, true, id);
    }
  });

  it('promotes source + release GLBs and manifest rows for each place id', () => {
    for (const propId of SELECTED) {
      const id = placeId(propId);
      const source = resolve(ROOT, 'assets/ships/parts/places', `${id}.glb`);
      const release = resolve(ROOT, 'assets/ships/release/parts/places', `${id}.glb`);
      assert.ok(existsSync(source), `missing source ${id}`);
      assert.ok(existsSync(release), `missing release ${id}`);
      assert.ok(byPart.has(id), `missing parts_manifest row ${id}`);
      assert.ok(byRelease.has(id), `missing release_manifest row ${id}`);
      const part = byPart.get(id);
      assert.equal(part.category, 'places');
      assert.equal(part.file, `places/${id}.glb`);
      assert.ok(part.tris > 0, id);
      const rel = byRelease.get(id);
      assert.equal(rel.kind, 'part:places');
      assert.match(rel.sourceSha256, /^[0-9a-f]{64}$/);
      assert.match(rel.releaseSha256, /^[0-9a-f]{64}$/);
      assert.ok(rel.ktx2Textures > 0, `${id} expected KTX2 textures`);
      assert.ok(rel.meshoptBufferViews > 0, `${id} expected meshopt views`);
    }
  });

  it('records vertex-tight box collision on every production row', () => {
    for (const id of SELECTED) {
      const c = byBuild.get(id).collision;
      assert.equal(c.kind, 'box');
      assert.equal(c.source, 'evaluated_lod0_vertices');
      assert.equal(c.halfExtentsM.length, 3);
      assert.ok(c.halfExtentsM.every((v) => Number.isFinite(v) && v > 0), id);
    }
  });
});
