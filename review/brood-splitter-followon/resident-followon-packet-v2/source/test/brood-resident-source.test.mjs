// Sealed source geometry through real loader-table and batch owners. CPU proof, not a GPU claim.
import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import * as THREE from 'three';
import { splitterSourceGraph } from './lib/splitterV12Graph.mjs';
import { deriveAuthoredRuntimeTable,bindAuthoredRuntimeTable } from '../src/render/assetLoader.js';
import { composeBroodMaterialForProbe } from '../src/render/partsLibrary.js';
import { broodModelForRoot } from '../src/render/broodVisualContract.js';
import { broodCellBatchKey } from '../src/render/broodCellIdentity.js';
import { loadSplitterPackage } from './lib/splitterCompiledPackage.mjs';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
const dir=process.env.BROOD_V12_SOURCE_DIR||'assets/ships/parts/wholeships';
test('exact v12 raw source survives canonical runtime tables and final cell-separated batching',async()=>{
 const file=path.join(dir,'brood_splitter_v01.glb'),g=await splitterSourceGraph(file);
 assert.equal(g.sha256,'6bf7ef85ab3d4a13e0d73e9dfa03bcdc476efeae268807eec12c7a2b25b9d9d1');
 const url='assets/ships/parts/wholeships/brood_splitter_v01.glb';
 const table=deriveAuthoredRuntimeTable(g.scene,{url,slot:'hull',assetId:'SF_BROOD_SPLITTER_V01'});
 assert.equal(table.primitives.length,36);assert.ok(table.primitives.every(p=>p.tags.broodCell&&p.tags.broodContractId==='brood_splitter'));
 const plan={entries:[]};g.scene.traverse(source=>plan.entries.push({source}));
 const record=bindAuthoredRuntimeTable(url,{scene:g.scene,asset:g.asset},'hull',JSON.parse(JSON.stringify(table)),plan);
 const composed=composeBroodMaterialForProbe(record);assert.ok(broodModelForRoot(composed.root,composed.entity));
 const cells=new Map();composed.root.traverse(n=>{if(n.isMesh&&n.userData.spacefaceTags?.broodCell){const key=n.userData.spacefaceTags.broodCell;let rows=cells.get(key);if(!rows){rows=[];cells.set(key,rows);}rows.push(n);assert.equal(n.userData.keepSeparate,true);}});
 assert.equal(cells.size,3);for(const rows of cells.values())assert.deepEqual(new Set(rows.map(n=>n.userData.spacefaceTags.lod)),new Set(['lod0','lod1','lod2']));
 console.log('v12 canonical composed cells',JSON.stringify([...cells].map(([id,rows])=>({id,meshes:rows.length,triangles:rows.reduce((s,n)=>s+(n.geometry.index?.count||n.geometry.attributes.position.count)/3,0)}))));
});
test('unrelated copied part tags retain ordinary batching and cannot mint a sealed runtime identity',()=>{
 const scene=new THREE.Group(),part=new THREE.Group();part.name='PART_SPLITTER_PORT';scene.add(part);const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.name='LOD0_FOREIGN';part.add(mesh);
 const table=deriveAuthoredRuntimeTable(scene,{assetId:'UNRELATED',slot:'hull'});
 assert.equal(table.primitives[0].tags.broodCell,undefined);assert.equal(broodCellBatchKey('ordinary',{broodCell:'brood_splitter_port'}),'ordinary');
});

for (const key of ['brood-splitter','brood-splitter-axial','brood-splitter-port','brood-splitter-starboard']) {
 test(`real compiled ${key} binds its exact table, sealed bank and normal ship composition`,async()=>{
  const residency=createAssetResidencyRegistry({now:()=>0});
  const pkg=await loadSplitterPackage(key,residency);
  try {
   assert.equal(pkg.decodeCount(),1);
   const composed=composeBroodMaterialForProbe(pkg.record,{entityId:key});
   assert.ok(broodModelForRoot(composed.root,composed.entity));
   assert.equal(composed.composed.fallbackParts.length,0);
   assert.equal(composed.composed.packagePoolAdmissions.length,0,'sealed cells keep movable per-life render ownership');
   const nodes=[];composed.root.traverse(n=>{if(n.isMesh&&n.userData.spacefaceTags?.broodCell)nodes.push(n);});
   assert.equal(nodes.length,pkg.record.primitives.length,'every packaged material primitive is retained');
   assert.ok(nodes.every(n=>!n.isInstancedMesh&&!n.isBatchedMesh));
   assert.deepEqual(new Set(nodes.map(n=>n.userData.spacefaceTags.lod)),new Set(['lod0','lod1','lod2']));
   composed.root.userData.releaseAuthoredAssetResidency?.('probe-end');
   residency.releaseOwner(composed.owner,'probe-end');
  } finally { pkg.loader.dispose(); }
 });
}
