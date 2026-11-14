import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { derivePilotSemanticManifest } from '../scripts/build-render-package-pilots.mjs';
import { configureHullMultiroleStaticMerge } from '../scripts/lib/hullMultiroleStaticMerge.mjs';

const pilots = JSON.parse(await readFile(new URL('../assets/ships/render-packages/pilots.json', import.meta.url), 'utf8')).pilots;
const pilot = pilots.find(entry => entry.key === 'hull-multirole');
await MeshoptDecoder.ready;
const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(pilot.sourceUrl);
const nodes = document.getRoot().listNodes().filter(node => node.getMesh());

test('the current hull groups only same-material LOD0 leaves and keeps mounts and lower LODs', async () => {
  const manifest = await derivePilotSemanticManifest(pilot, pilot.sourceUrl);
  assert.equal(manifest.mergeGroups.length, 2);
  const groups = manifest.mergeGroups.map(group => group.nodeIds.map(id => manifest.semanticNodes.find(node => node.id === id).node));
  assert.deepEqual(groups[0], ['LOD0_HULL_MULTIROLE_MAIN', 'LOD0_DET_field_repair', 'LOD0_DET_mismatched_panel', 'LOD0_DET_salvage_patch']);
  assert.deepEqual(groups[1], ['LOD0_DET_antenna_jury', 'LOD0_DET_cargo_rig', 'LOD0_DET_jury_weld', 'LOD0_DET_smuggler_hatch']);
  assert.ok(manifest.semanticNodes.some(node => node.node === 'LOD1_HULL_MULTIROLE_SILHOUETTE'));
  assert.ok(manifest.semanticNodes.some(node => node.node === 'LOD2_HULL_MULTIROLE_SILHOUETTE'));
  assert.ok(manifest.anchors.some(node => node.node === 'SOCKET_Weapon_Front'));
});

test('changed semantics or another asset leaves every merge boundary untouched', async () => {
  const manifest = await derivePilotSemanticManifest(pilot, pilot.sourceUrl);
  const records = structuredClone(manifest.semanticNodes);
  for (const record of records) record.mergeBoundary = record.node;
  records.find(node => node.node === 'LOD0_DET_jury_weld').role = 'dynamic';
  const before = structuredClone(records), groups = [];
  assert.equal(configureHullMultiroleStaticMerge(pilot, records, nodes, groups), false);
  assert.deepEqual(records, before);
  assert.deepEqual(groups, []);
  assert.equal(configureHullMultiroleStaticMerge({ ...pilot, key: 'other' }, records, nodes, groups), false);
  assert.deepEqual(records, before);
  assert.deepEqual(groups, []);
});

test('unexpected LOD or tint metadata rejects the complete merge without partial changes', async () => {
  const manifest = await derivePilotSemanticManifest(pilot, pilot.sourceUrl);
  const records = structuredClone(manifest.semanticNodes);
  for (const record of records) record.mergeBoundary = record.node;
  const before = structuredClone(records), groups = [];
  const changed = nodes.find(node => node.getName() === 'LOD0_DET_jury_weld');
  const extras = changed.getExtras();
  try {
    changed.setExtras({ ...extras, spaceface: { ...extras.spaceface, lod: 'lod1' } });
    assert.equal(configureHullMultiroleStaticMerge(pilot, records, nodes, groups), false);
    assert.deepEqual(records, before);
    assert.deepEqual(groups, []);
  } finally {
    changed.setExtras(extras);
  }
});
