import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  parseRefreshArgs, refreshedRootBinding, refreshRenderPackagePilots, selectPilots,
} from '../scripts/refresh-render-package-pilots.mjs';
import { derivePilotSemanticManifest } from '../scripts/build-render-package-pilots.mjs';
import { compileRenderPackage } from '../scripts/lib/renderPackageCompiler.mjs';
import { readGlbJson, sceneFromGlbJson } from '../scripts/lib/renderPackageRuntimeTable.mjs';
import { deriveAuthoredRuntimeTable } from '../src/render/assetLoader.js';
import { buildAuthoredPlaceProp, upgradeAuthoredPlaceBoundaryForProbe } from '../src/render/partsLibrary.js';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sf-pilot-refresh-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const doc = new Document();
  const scene = doc.createScene('SurveyedActiveScene');doc.getRoot().setDefaultScene(scene);
  scene.setExtras({ spacefaceAsset: { assetId: 'FIXTURE_REMMASTER', slot: 'place' } });
  doc.getRoot().getAsset().extras = { spacefaceAsset: { assetId: 'FIXTURE_REMMASTER', slot: 'place' } };
  const buffer = doc.createBuffer();
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer);
  const norm = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,1,0,0,1,0,0,1])).setBuffer(buffer);
  const material = doc.createMaterial('Material_Stone').setBaseColorFactor([.2,.3,.4,1]);
  const mesh = () => doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION',pos).setAttribute('NORMAL',norm).setMaterial(material));
  const old = doc.createNode('Old_LOD0_ROOT').addChild(doc.createNode('LOD0_Hull').setMesh(mesh()));
  scene.addChild(old);
  if (options.multiple !== false) {
    scene.addChild(doc.createNode('Remaster_BroadAssembly').setMesh(mesh()).setExtras({ spaceface: { lod:'lod0' } }));
    scene.addChild(doc.createNode('LOD1_ROOT').addChild(doc.createNode('EmbeddedLow').setMesh(mesh())));
    scene.addChild(doc.createNode('LOD2_ROOT').addChild(doc.createNode('EmbeddedLowest').setMesh(mesh())));
  }
  const sourcePath = join(dir,'released.glb');await new NodeIO().write(sourcePath,doc);
  const bytes = await readFile(sourcePath);
  const pilot = { key:'remaster', assetId:'sf.render.remaster', runtimeAssetId:'FIXTURE_REMMASTER',
    releaseAssetId:'place_remaster', sourceUrl:'released.glb', kind:'place', slot:'place',
    releaseSha256:'stale', releaseBytes:1, rootNode:'Old_LOD0_ROOT', dynamicNameIncludes:[],
    outputDir:'packages/remaster', metadataUrl:'packages/remaster/render-package.json', custom:{preserve:'yes'} };
  const untouched = { ...pilot,key:'untouched',assetId:'sf.render.untouched',releaseAssetId:'place_untouched',
    runtimeAssetId:'UNTOUCHED',sourceUrl:'not-read.glb',custom:{foreign:[1,2,3]} };
  const manifest = { schema:'spaceface.renderPackagePilots.v1', releaseManifest:'release.json',
    runtimeManifest:'not-written.js', custom:'preserved', pilots:[untouched,pilot] };
  const release = { assets:[{id:'place_remaster',release:'released.glb',releaseSha256:sha(bytes),releaseBytes:bytes.length}] };
  await writeFile(join(dir,'pilots.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(join(dir,'release.json'),JSON.stringify(release,null,2)+'\n');
  return {dir,sourcePath,manifest,release,pilot,untouched,options:{repoRoot:dir,manifestPath:'pilots.json',onlyIds:['remaster']}};
}

test('pilot selection is explicit, rejects ambiguity/duplicates, and retains catalog order', () => {
  const pilots=[{key:'a',releaseAssetId:'release_a',assetId:'sf.a'}, {key:'b',releaseAssetId:'release_b',assetId:'sf.b'}];
  assert.deepEqual(selectPilots(pilots,['sf.b','release_a']).map(p=>p.key),['a','b']);
  for (const bad of [undefined,[],[''],['missing'],['a','release_a']]) assert.throws(()=>selectPilots(pilots,bad));
  assert.throws(()=>selectPilots([...pilots,{key:'c',assetId:'sf.a'}],['sf.a']),/Ambiguous/);
  assert.throws(()=>parseRefreshArgs([]),/explicit/);
  assert.throws(()=>parseRefreshArgs(['--only=a','--only=b']),/Duplicate/);
  assert.deepEqual(parseRefreshArgs(['--only=a,b','--dry-run']),{onlyIds:['a','b'],dryRun:true});
});

test('root binding uses the active scene and keeps valid named/scene bindings', () => {
  const json={scene:1,scenes:[{nodes:[0,2]},{nodes:[1]}],nodes:[{name:'Inactive'},{name:'Current'},{name:'Unused'}]};
  assert.deepEqual(refreshedRootBinding({key:'x',rootNode:'Current'},json),{rootNode:'Current'});
  assert.deepEqual(refreshedRootBinding({key:'x',rootNode:'Old'},json),{rootNode:'Current'});
  assert.deepEqual(refreshedRootBinding({key:'x',sceneRoot:true},json),{sceneRoot:true});
  json.scenes[1].nodes.push(2);
  assert.deepEqual(refreshedRootBinding({key:'x',rootNode:'Current'},json),{sceneRoot:true});
});

test('scoped refresh updates exact bytes and root, preserving unrelated pilots and becoming a no-op', async (t) => {
  const f=await fixture(t);const releaseBefore=await readFile(join(f.dir,'release.json'));
  const result=await refreshRenderPackagePilots({...f.options,onlyIds:['place_remaster']});
  assert.deepEqual(result.selected,['remaster']);assert.equal(result.written,true);
  const output=JSON.parse(await readFile(join(f.dir,'pilots.json')));
  assert.deepEqual(output.pilots[0],f.untouched);assert.equal(output.custom,'preserved');
  const refreshed=output.pilots[1];assert.equal(refreshed.sceneRoot,true);assert.equal('rootNode' in refreshed,false);
  assert.equal(refreshed.releaseSha256,f.release.assets[0].releaseSha256);
  assert.equal(refreshed.releaseBytes,f.release.assets[0].releaseBytes);assert.deepEqual(refreshed.custom,f.pilot.custom);
  assert.deepEqual(await readFile(join(f.dir,'release.json')),releaseBefore);
  const stable=await readFile(join(f.dir,'pilots.json'));
  assert.equal((await refreshRenderPackagePilots(f.options)).written,false);
  assert.deepEqual(await readFile(join(f.dir,'pilots.json')),stable);
});

test('dry run is read-only and mismatched release metadata fails before publication', async (t) => {
  const f=await fixture(t);const before=await readFile(join(f.dir,'pilots.json'));
  const preview=await refreshRenderPackagePilots({...f.options,dryRun:true});
  assert.equal(preview.changes.length,1);assert.equal(preview.written,false);
  assert.deepEqual(await readFile(join(f.dir,'pilots.json')),before);
  f.release.assets[0].releaseSha256='wrong';await writeFile(join(f.dir,'release.json'),JSON.stringify(f.release));
  await assert.rejects(refreshRenderPackagePilots(f.options),/exact released GLB bytes/);
  assert.deepEqual(await readFile(join(f.dir,'pilots.json')),before);
});

test('compiled scene sibling survives while real runtime LOD selection hides embedded lower LODs', async (t) => {
  const f=await fixture(t);
  const before=await derivePilotSemanticManifest(f.pilot,f.sourcePath);
  assert.equal(before.semanticNodes.some(n=>n.node==='Remaster_BroadAssembly'),false,'old descendant binding loses the added assembly');
  await refreshRenderPackagePilots(f.options);
  const pilot=JSON.parse(await readFile(join(f.dir,'pilots.json'))).pilots[1];
  const semantics=await derivePilotSemanticManifest(pilot,f.sourcePath);
  assert.ok(semantics.semanticNodes.some(n=>n.node==='Remaster_BroadAssembly'));
  await compileRenderPackage({assetId:pilot.assetId,sourceGlbPath:f.sourcePath,
    semanticManifest:semantics,outputDir:join(f.dir,'compiled')});
  const compiled=await readFile(join(f.dir,'compiled/render.glb'));
  const json=readGlbJson(compiled);
  const runtime=deriveAuthoredRuntimeTable(sceneFromGlbJson(json),{slot:'place',assetId:pilot.runtimeAssetId});
  const tags=Object.fromEntries(runtime.primitives.map(p=>[p.name,p.tags.lod]));
  assert.deepEqual(tags,{LOD0_Hull:'lod0',Remaster_BroadAssembly:'lod0',EmbeddedLow:'lod1',EmbeddedLowest:'lod2'});
  const gltf=await new GLTFLoader().parseAsync(compiled.buffer.slice(compiled.byteOffset,compiled.byteOffset+compiled.byteLength),'');
  const record={url:pilot.sourceUrl,assetId:pilot.runtimeAssetId,slot:'place',bounds:{size:[1,1,1],center:[0,0,0]},markers:[],
    primitives:runtime.primitives.map(p=>({key:p.name,name:p.name,geometry:gltf.scene.getObjectByName(p.name).geometry,
      material:gltf.scene.getObjectByName(p.name).material,matrix:new THREE.Matrix4().fromArray(p.matrix),tags:p.tags}))};
  const entity={id:'refresh-lod-fixture',type:'asteroid',alive:true,radius:12,
    data:{placeId:'place_debris_chunk',placeTargetRadius:12,authoredGeologySkin:true}};
  const fallback=new THREE.Group();const boundary=buildAuthoredPlaceProp(entity,{fallbackRoot:fallback,releaseMode:true});
  const scene=new THREE.Scene();scene.add(boundary);
  assert.equal(await upgradeAuthoredPlaceBoundaryForProbe(boundary,fallback,entity,'places/place_debris_chunk.glb',{},scene,{
    releaseMode:true,loadAuthoredPart:async()=>record,prepareAuthoredPipelines:async()=>({skipped:false}),
  }),true);
  const visibility=()=>{
    const rows=[];boundary.traverse(o=>{if(o.userData?.spacefaceTags?.lod)rows.push([o.name,o.userData.spacefaceTags.lod,o.visible,
      (o.geometry?.index?.count ?? o.geometry?.getAttribute('position')?.count ?? 0)/3]);});
    return rows;
  };
  boundary.userData.updateLod('lod0');
  const near=visibility();
  assert.equal(near.filter(([,lod,visible])=>lod==='lod0'&&visible).reduce((sum,row)=>sum+row[3],0),2,
    'the production LOD0 batch contains both the original triangle and the added sibling triangle');
  assert.ok(near.some(([,lod])=>lod==='lod1'));assert.ok(near.some(([,lod])=>lod==='lod2'));
  assert.ok(near.filter(([,lod])=>lod!=='lod0').every(([, ,visible])=>visible===false));
  boundary.userData.updateLod('lod1');
  assert.ok(visibility().every(([,lod,visible])=>visible===(lod==='lod1')));
  scene.remove(boundary);
});
