import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {derivePilotSemanticManifest} from '../scripts/build-render-package-pilots.mjs';
import {configureCockpitDomeStaticMerge} from '../scripts/lib/cockpitDomeStaticMerge.mjs';

const pilots=JSON.parse(await readFile(new URL('../assets/ships/render-packages/pilots.json',import.meta.url),'utf8')).pilots;
const pilot=pilots.find((entry)=>entry.key==='cockpit-dome');
await MeshoptDecoder.ready;
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({'meshopt.decoder':MeshoptDecoder}).read(pilot.sourceUrl);
const nodes=doc.getRoot().listNodes().filter((node)=>node.getMesh());

test('the reviewed static cockpit hardware forms one semantic merge group',async()=>{
  const manifest=await derivePilotSemanticManifest(pilot,pilot.sourceUrl);
  assert.equal(manifest.mergeGroups.length,1);
  const selected=manifest.mergeGroups[0].nodeIds.map((id)=>manifest.semanticNodes.find((node)=>node.id===id).node);
  assert.deepEqual(new Set(selected),new Set(['DET_frame_rib_L','DET_frame_rib_R','DET_mount_bolt','DET_mount_bolt.001']));
  assert.ok(manifest.semanticNodes.filter((node)=>selected.includes(node.node)).every((node)=>node.role==='immutable'));
});

test('changed dynamic semantics or source ownership leaves the original groups untouched',async()=>{
  const manifest=await derivePilotSemanticManifest(pilot,pilot.sourceUrl);
  const records=structuredClone(manifest.semanticNodes);
  records.find((node)=>node.node==='DET_frame_rib_L').role='dynamic';
  const before=structuredClone(records),groups=[];
  assert.equal(configureCockpitDomeStaticMerge(pilot,records,nodes,groups),false);
  assert.deepEqual(records,before);
  assert.deepEqual(groups,[]);
  const unrelated={...pilot,key:'another-cockpit'};
  assert.equal(configureCockpitDomeStaticMerge(unrelated,records,nodes,groups),false);
  assert.deepEqual(groups,[]);
});
