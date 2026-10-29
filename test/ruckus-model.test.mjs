import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildRuckusVisual,disposeRuckusVisual,clearRuckusModelCache} from '../src/render/characters/ruckusModel.js';
import {ruckusEntitySpec} from '../src/systems/ruckus.js';
const spec=()=>ruckusEntitySpec();
test('synchronous production visual contains all rigid joints, three LODs, no fetch or placeholder',()=>{
 const e=spec(),root=buildRuckusVisual(e),joints=[];root.traverse(o=>{if(o.userData.ru7Joint)joints.push(o.userData.ru7Joint);});
 for(const name of ['Body','JawL','JawR','Tail','Drum'])assert.ok(joints.includes(name),name);
 let lod;root.traverse(o=>{if(o.isLOD)lod=o;});assert.equal(lod.levels.length,3);assert.equal(root.userData.authoredAssetState,'authored');
 assert.ok(new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).x>40);disposeRuckusVisual(root);
});
test('runtime geometry matches Blender GLB bounds, not an approximation of the authoring model',async()=>{
 const bytes=await readFile(new URL('../assets/characters/ruckus/ruckus-lod0.glb',import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const model=buildRuckusVisual(spec());
 model.traverse(o=>{if(o.userData.baseQuaternion)o.quaternion.copy(o.userData.baseQuaternion);});
 const a=new THREE.Box3().setFromObject(gltf.scene),b=new THREE.Box3().setFromObject(model);
 for(const axis of ['x','y','z']){assert.ok(Math.abs(a.min[axis]-b.min[axis])<.01,axis+' min');assert.ok(Math.abs(a.max[axis]-b.max[axis])<.01,axis+' max');}
 disposeRuckusVisual(model);gltf.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});
test('presentation uses simulation time, honors reduced motion, and never mutates the entity',()=>{
 const e=spec(),root=buildRuckusVisual(e);Object.assign(e.data.ruckusPose,{phase:'chase',simTime:4,bond:3,speed:60});
 const before=JSON.stringify(e);root.userData.updateAuthoredMotion(e,100);let tail;root.traverse(o=>{if(!tail&&o.userData.ru7Joint==='Tail')tail=o;});
 const q=tail.quaternion.clone();root.userData.updateAuthoredMotion(e,9999);assert.deepEqual(tail.quaternion.toArray(),q.toArray());assert.equal(JSON.stringify(e),before);
 root.userData.updateAuthoredMotion(e,0,{reducedMotion:true,reducedFlash:true});assert.deepEqual(tail.quaternion.toArray(),tail.userData.baseQuaternion.toArray());disposeRuckusVisual(root);
});
test('shared immutable geometry survives instance disposal; materials remain per instance',()=>{
 const a=buildRuckusVisual(spec()),b=buildRuckusVisual(spec());let ma,mb;a.traverse(o=>{if(o.isMesh&&!ma)ma=o;});b.traverse(o=>{if(o.isMesh&&!mb)mb=o;});
 assert.equal(ma.geometry,mb.geometry);assert.notEqual(ma.material,mb.material);let freed=false;ma.geometry.addEventListener('dispose',()=>freed=true);
 disposeRuckusVisual(a);assert.equal(freed,false);disposeRuckusVisual(b);clearRuckusModelCache();assert.equal(freed,true);
});
test('core warning and pulse are bounded volume meshes, with non-flashing accessibility mode',()=>{
 for(const part of ['core','pulse','memorial']){const e=ruckusEntitySpec(part);Object.assign(e.data.ruckusPose,{simTime:5,charge:1,countdown:.6,pulseAge:.4});
  const root=buildRuckusVisual(e);root.userData.updateAuthoredMotion(e,0,{reducedFlash:true,reducedMotion:true});
  root.traverse(o=>{assert.equal(!!o.isSprite,false);assert.equal(!!o.isPoints,false);});
  assert.ok(new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).length()<450);disposeRuckusVisual(root);
 }
});

test('every deferred RUCKUS payload has a literal path from the default game graph', async () => {
 const {collectReachable}=await import('../scripts/check-src-reachability.mjs');
 const {fileURLToPath}=await import('node:url');
 const {RUCKUS_MESH_KEYS}=await import('../src/render/characters/ruckusMeshData.js');
 const reachable=collectReachable();
 for(const key of RUCKUS_MESH_KEYS)assert.ok(reachable.has(fileURLToPath(new URL(`../src/render/characters/ruckusMeshData/${key}.js`,import.meta.url))),key);
});

test('generated lazy manifest is reproducible and loaders retain exact authored payloads', async () => {
 const {renderRuckusMeshManifest}=await import('../tools/ruckus/meshManifest.mjs');
 const {RUCKUS_MESH_KEYS:keys,RUCKUS_MESH_LOADERS:loaders}=await import('../src/render/characters/ruckusMeshData.js');
 const source=await readFile(new URL('../src/render/characters/ruckusMeshData.js',import.meta.url),'utf8');
 assert.equal(source,renderRuckusMeshManifest(keys));
 assert.deepEqual(Object.keys(loaders),keys);
 assert.ok(Object.isFrozen(loaders));
 assert.doesNotMatch(source,/^import\s/m,'no eager payload imports');
 for(const key of keys){
  const loaded=await loaders[key]();
  const original=await import(`../src/render/characters/ruckusMeshData/${key}.js`);
  assert.equal(loaded.default,original.default,key);
 }
 for(const invalid of [[],['body0','body0'],['../body0'],['body-0'],[null]])assert.throws(()=>renderRuckusMeshManifest(invalid),TypeError);
});

test('browser-shaped model import is cold and standalone Crucible skips its unreachable Ceres warm', async () => {
 const {execFileSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const code=`
  import assert from 'node:assert/strict';
  globalThis.window={};
  const nativeSetTimeout=globalThis.setTimeout.bind(globalThis);
  let warmSlices=0;
  globalThis.setTimeout=(fn,ms,...rest)=>{
   if((new Error().stack||'').includes('ruckusModel.js'))warmSlices++;
   return nativeSetTimeout(fn,ms,...rest);
  };
  const m=await import('./src/render/characters/ruckusModel.js');
  const {ruckusEntitySpec}=await import('./src/systems/ruckus.js');
  await new Promise(resolve=>nativeSetTimeout(resolve,80));
  assert.equal(warmSlices,0,'importing the production model requests no RU-7 payload or template slices');
  assert.equal(m.requiresRuckusWarmForNewGame({crucibleLaunch:true}),false,'standalone Crucible cannot enter Ceres');
  assert.equal(m.requiresRuckusWarmForNewGame({}),true,'ordinary Adventure keeps the pre-flight Ceres readiness gate');
  assert.equal(m.requiresRuckusWarmForNewGame({crucibleLaunch:true,startSectorId:'sector_ceres_belt'}),true,'an explicit Ceres start still warms');
  assert.equal(warmSlices,0,'classification alone does not request RU-7 chunks');
  const ready=m.warmRuckusModel();
  assert.strictEqual(m.warmRuckusModel(),ready,'repeated callers share one warm');
  await ready;
  assert.ok(warmSlices>0,'demand warm advances authored templates in bounded tasks');
  for(const part of [undefined,'core']){
   const root=m.buildRuckusVisual(ruckusEntitySpec(part));
   assert.equal(root.userData.authoredAssetState,'authored');
   m.disposeRuckusVisual(root);
  }
  m.clearRuckusModelCache();
 `;
 execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:fileURLToPath(new URL('..',import.meta.url)),timeout:30000,stdio:'pipe'});
});
