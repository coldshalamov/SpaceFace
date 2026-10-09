import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import * as THREE from 'three';
import{prepareRenderPackageBlueprint,assembleRenderPackageRecord}from'../src/render/assetLoader.js';import{loadMotionBank}from'../src/render/authoredMotion.js';
import{NodeIO}from'@gltf-transform/core';import{ALL_EXTENSIONS}from'@gltf-transform/extensions';import{dequantize}from'@gltf-transform/functions';import{MeshoptDecoder}from'meshoptimizer';
import{createRenderPackageLoader}from'../src/render/renderPackageLoader.js';import{computeRenderPackageContentHash,computeRenderPackageRuntimeHash}from'../src/contracts/renderPackage.js';
import{TALLY_THREE}from'../src/data/tallyThree.js';
import{installVisualOverrides}from'../src/render/visualOverrides.js';
const hash=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
async function packageFixture(){
 const p=read('assets/ships/render-packages/pilots.json').pilots.find(p=>p.key==='tally-three'),release=read('assets/ships/release/release_manifest.json').assets.find(r=>r.id==='place_tally_three');assert(p);assert.equal(release.sourceSha256,hash(fs.readFileSync('assets/ships/parts/places/place_tally_three.glb')));assert.equal(p.releaseSha256,hash(fs.readFileSync(release.release)));
 const m=read(p.metadataUrl);assert.equal(m.contentHash,await computeRenderPackageContentHash(m,{digest:hash}));assert.equal(m.runtimeHash,await computeRenderPackageRuntimeHash(m,{digest:hash}));assert.equal(m.render.sha256,hash(fs.readFileSync(`${p.outputDir}/render.glb`)));
 await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),d=await io.read(`${p.outputDir}/render.glb`);await d.transform(dequantize());
 // Decode actual compiled geometry and transforms; texture pixels/GPU are deliberately outside this CPU contract.
 const convert=n=>{const mesh=n.getMesh(),pr=mesh?.listPrimitives()[0],o=mesh?new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({emissive:0xffffff,emissiveIntensity:pr.getMaterial()?.getExtension('KHR_materials_emissive_strength')?.getEmissiveStrength()||1})):new THREE.Group();o.name=n.getName();if(pr)o.material.name=pr.getMaterial()?.getName()||'';o.userData={...n.getExtras()};if(pr){const a=pr.getAttribute('POSITION');o.geometry.setAttribute('position',new THREE.BufferAttribute(a.getArray().slice(),a.getElementSize()));if(pr.getIndices())o.geometry.setIndex(new THREE.BufferAttribute(pr.getIndices().getArray().slice(),1));}o.position.fromArray(n.getTranslation());o.quaternion.fromArray(n.getRotation());o.scale.fromArray(n.getScale());for(const c of n.listChildren())o.add(convert(c));return o;};
 const scene=new THREE.Group();for(const n of d.getRoot().listScenes()[0].listChildren())scene.add(convert(n));const loader=createRenderPackageLoader({loadGlb:async()=>({scene,asset:d.getRoot().getAsset()}),prepareDecoded:async(decoded,metadata,url,plan)=>{const prepared=prepareRenderPackageBlueprint(p,decoded,metadata,{plan});const motionBank=await loadMotionBank(metadata.runtime.motionBank,async uri=>{const b=fs.readFileSync(uri);return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};});return{...prepared,motionBank};}}),loaded=await loader.load(m,{expectedContentHash:m.contentHash,expectedRuntimeHash:m.runtimeHash});return{loader,loaded,record:assembleRenderPackageRecord(loaded,p.sourceUrl,p.assetId)};
}
test('actual packaged assessor mounts once at source origin and passes live state to its claim instruments',async()=>{
 const {buildAuthoredPlaceProp,upgradeAuthoredPlaceBoundaryForProbe,resolvePlaceFileForEntity}=await import('../src/render/partsLibrary.js');
 const pkg=await packageFixture(),scene=new THREE.Scene(),e={id:951,occupantGeneration:3,alive:true,type:'ship',radius:11.42,hull:100,data:{role:'claim_assessor',worldRecordId:TALLY_THREE.assessorId,placeId:'place_tally_three',archetypeGlb:'place_tally_three',tallyThree:{phase:'patrol',tick:0}}};
 let composed=0;const factory=installVisualOverrides({build:()=>new THREE.Group()},{directAuthoredMount:true,releaseMode:true,authoredPlaceBuilder:(entity,options)=>{composed++;return buildAuthoredPlaceProp(entity,options);}});
 const boundary=factory.build(e);e.mesh=boundary;scene.add(boundary);
 const state={entities:new Map([[e.id,e]]),entityList:[e],world:{currentSectorId:TALLY_THREE.sectorId},render:{scene},salvage:{sources:{[TALLY_THREE.sourceKey]:{}}}};
 try{assert.equal(composed,1);assert.equal(resolvePlaceFileForEntity(e),'places/place_tally_three.glb');
 const fallback=boundary.children[0];assert.equal(await upgradeAuthoredPlaceBoundaryForProbe(boundary,fallback,e,'places/place_tally_three.glb',{},scene,{releaseMode:true,loadAuthoredPart:async()=>pkg.record,prepareAuthoredPipelines:async()=>({skipped:false})}),true);
 const root=boundary.userData.authoredRoot||boundary.children.find(n=>n.userData.tallyThreeAuthoredSource);assert(root,'canonical source stamp is present');
 assert.equal(root.userData.authoredWorldScale,1);assert.equal(root.userData.tallyThreeAuthoredSource.assetId,'SF_PLACE_TALLY_3');
 const arm=root.getObjectByName('MOTION_TALLY_ARM_LEFT');assert(arm);boundary.userData.updateAuthoredMotion(e,1,{},state);const rest=arm.quaternion.clone();
 e.data.tallyThree={phase:'assess',tick:1};boundary.userData.updateAuthoredMotion(e,2,{},state);boundary.userData.updateAuthoredMotion(e,3,{},state);
 assert(arm.quaternion.angleTo(rest)>.4,'real state reaches the driver through the published place boundary');
 scene.remove(boundary);boundary.userData.updateAuthoredMotion(e,4,{},state);assert(arm.quaternion.angleTo(rest)<1e-6,'detached picture retires instrument motion');
 }finally{boundary.userData.dispose?.();pkg.loader.dispose();}
});
