import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createRenderPackageLoader } from '/src/render/renderPackageLoader.js';
import { prepareRenderPackageBlueprint, assembleRenderPackageRecord } from '/src/render/assetLoader.js';
import { renderPackagePilotForAssetId } from '/src/render/renderPackageManifest.js';
import { getAssetResidency } from '/src/render/assetResidency.js';
import { composeBroodMaterialForProbe } from '/src/render/partsLibrary.js';
import { createBroodResidentCellOwner } from '/src/render/broodResidentCells.js';
import { createLodState } from '/src/render/lod.js';
import { loadMotionBank } from '/src/render/authoredMotion.js';
import { BROOD_SPLITTER_BODIES } from '/src/data/broodSplitterBodies.js';
import { partitionKinematics } from '/src/core/bodyPartition.js';
const check = (v,why) => { if (!v) throw new Error(why); };
try {
 const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
 renderer.setSize(768,512); renderer.setPixelRatio(1); document.body.append(renderer.domElement);
 const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
 const gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
 const residency=getAssetResidency(renderer);
 const ktx2=new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer);
 const gltf=new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
 const pilot=renderPackagePilotForAssetId('sf.render.brood-splitter');check(pilot,'real packaged-live row missing');
 let decodes=0;
 const loader=createRenderPackageLoader({renderer,loadGlb:async url=>{decodes++;return gltf.loadAsync(url);},
  prepareDecoded:async(decoded,metadata,url,plan)=>{
   const record=prepareRenderPackageBlueprint(pilot,decoded,metadata,{renderer,plan});
   const motionBank=metadata.runtime.motionBank?await loadMotionBank(metadata.runtime.motionBank):null;
   return Object.freeze({...record,motionBank});
  }});
 const loaded=await loader.load(pilot.metadataUrl,{expectedContentHash:pilot.expectedContentHash});
 const record=assembleRenderPackageRecord(loaded,pilot.sourceUrl);
 const built=composeBroodMaterialForProbe(record,{entityId:'gpu-parent'});
 const {entity:parent,root,owner:boundary,scene}=built;
 scene.background=new THREE.Color('#10131a');
 scene.add(new THREE.HemisphereLight(0xe6f0ff,0x515567,3));
 const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,10,5);scene.add(light);
 const camera=new THREE.OrthographicCamera(-10.5,10.5,7,-7,.1,100);camera.position.set(6,18,12);camera.lookAt(0,0,0);
 parent.rot=.31;parent.vel={x:0,z:0};parent.angVel=0;
 boundary.rotation.y=-parent.rot;
 boundary.userData.broodResidentLife=parent.occupantGeneration;
 boundary.userData.lod=createLodState();boundary.userData.lod.adopt('lod2',8);
 boundary.userData.authoredVisualRoot='authored-root';
 root.userData.updateLod('lod2');scene.updateMatrixWorld(true);
 const target=new THREE.WebGLRenderTarget(768,512,{depthBuffer:true});
 const draw=()=>{renderer.setRenderTarget(target);renderer.render(scene,camera);const pixels=new Uint8Array(768*512*4);renderer.readRenderTargetPixels(target,0,0,768,512,pixels);const stats={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs.length};renderer.setRenderTarget(null);renderer.render(scene,camera);return {pixels,stats};};
 await renderer.compileAsync(scene,camera);
 const before=draw();
 const cellBodies=BROOD_SPLITTER_BODIES.brood_splitter.splitterCells;
 parent.data.splitterFamily={schema:1,id:'gpu-family',parentLife:parent.occupantGeneration};
 const children=cellBodies.map((cell,i)=>({...partitionKinematics(parent,{x:cell.center[0],z:cell.center[2]},cell.yaw),id:'gpu-child-'+i,alive:true,occupantGeneration:2+i,data:{broodBodyId:cell.bodyId,splitterChild:{familyId:'gpu-family',parentLife:parent.occupantGeneration,ordinal:i}}}));
 const state={entities:new Map([parent,...children].map(e=>[e.id,e]))},meshes=new Map([[parent,boundary]]);
 const retire=r=>{r.removeFromParent();r.userData.releaseAuthoredAssetResidency?.('gpu-proof-end');residency.releaseOwner(r,'gpu-proof-end');};
 const owner=createBroodResidentCellOwner({state,residency,lookupMesh:e=>meshes.get(e),ready:()=>true,toLocal:p=>p,
  bind(e,r){meshes.set(e,r);scene.add(r);return true;},unbind(e,r){meshes.delete(e);r.removeFromParent();},retire});
 let transferred=false,after=null;
 window.takeSplitFrame=()=>{
  check(!transferred,'already split');transferred=true;parent.alive=false;parent.data.splitterMaterialTransferred=true;
  check(owner.prepare({parent,children}),'resident source refusal');retire(boundary);meshes.delete(parent);
  check(owner.flush()===3,'children not all ready');scene.updateMatrixWorld(true);after=draw();
  let changedPixels=0,maxChannelDelta=0;
  for(let p=0;p<before.pixels.length;p+=4){let changed=false;for(let c=0;c<3;c++){const d=Math.abs(before.pixels[p+c]-after.pixels[p+c]);maxChannelDelta=Math.max(maxChannelDelta,d);changed ||= d>0;}if(changed)changedPixels++;}
  const visible=children.map(e=>{const rows=[];meshes.get(e).traverseVisible(n=>{if(n.isMesh)rows.push(n);});return {id:e.data.broodBodyId,meshes:rows.length,tiers:[...new Set(rows.map(n=>n.userData.spacefaceTags.lod))]};});
  check(visible.every(r=>r.meshes>0&&r.tiers.length===1&&r.tiers[0]==='lod2'),'first-frame tier/visibility failure');
  check(decodes===1,'child decode occurred');
  check(before.stats.triangles===after.stats.triangles,'material triangles changed at birth');
  check(before.stats.programs===after.stats.programs,'new first-frame shader program');
  check(before.stats.geometries===after.stats.geometries,'new first-frame GPU geometry');
  check(before.stats.textures===after.stats.textures,'new first-frame GPU texture');
  check(changedPixels===0,'first-frame pixels changed');
  window.proofResult={ok:true,gpu,decodes,changedPixels,maxChannelDelta,before:before.stats,after:after.stats,visible,scope:'isolated actual compiled package + KTX2 + real WebGL draw; no default-route or artwork approval'};
  return window.proofResult;
 };
 window.proofReady={gpu,before:before.stats};
} catch(error) {window.proofError={message:error.message,stack:error.stack};console.error(error);}
