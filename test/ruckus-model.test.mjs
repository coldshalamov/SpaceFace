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

test('generated manifest routes the four deferred keys to their exact authored GLBs', async () => {
 const {renderRuckusMeshManifest}=await import('../tools/ruckus/meshManifest.mjs');
 const {RUCKUS_MESH_KEYS:keys,RUCKUS_MESH_ASSETS:assets}=await import('../src/render/characters/ruckusMeshData.js');
 const source=await readFile(new URL('../src/render/characters/ruckusMeshData.js',import.meta.url),'utf8');
 assert.equal(source,renderRuckusMeshManifest(keys));
 assert.deepEqual(Object.keys(assets),keys);
 assert.ok(Object.isFrozen(assets));
 assert.doesNotMatch(source,/import\s*\(/,'no JavaScript payload chunks remain');
 for(const key of keys){
  const file=assets[key].split('/').at(-1);
  const bytes=await readFile(new URL(`../assets/characters/ruckus/${file}`,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'glTF',key);
 }
 for(const invalid of [[],['body0','body0'],['../body0'],['body-0'],[null]])assert.throws(()=>renderRuckusMeshManifest(invalid),TypeError);
});

test('browser-shaped model import is cold and standalone Crucible skips its unreachable Ceres warm', async () => {
 const {execFileSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const code=`
  import assert from 'node:assert/strict';
  import {readFile} from 'node:fs/promises';
  const cold=await import('./src/render/characters/ruckusModel.js?node-cold-path');
  const {ruckusEntitySpec}=await import('./src/systems/ruckus.js');
  const coldRoot=cold.buildRuckusVisual(ruckusEntitySpec());
  let coldLod;coldRoot.traverse(o=>{if(o.isLOD)coldLod=o;});
  const coldMeshes=[];coldLod.levels[0].object.traverse(o=>{if(o.isMesh)coldMeshes.push(o);});
  globalThis.window={};
  globalThis.document={baseURI:'http://127.0.0.1:8123/index.html'};
  const nativeSetTimeout=globalThis.setTimeout.bind(globalThis);
  let warmSlices=0;
  let fetches=0, failCoreOnce=true;
  globalThis.fetch=async url=>{
   fetches++;
   const pathname=new URL(url).pathname;
   if(pathname.endsWith('/pressure-core.glb')&&failCoreOnce){failCoreOnce=false;return {ok:false,status:503};}
   const file=decodeURIComponent(pathname.split('/').at(-1));
   const bytes=await readFile(new URL('./assets/characters/ruckus/'+file,import.meta.url));
   return {ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  };
  globalThis.setTimeout=(fn,ms,...rest)=>{
   if((new Error().stack||'').includes('ruckusModel.js'))warmSlices++;
   return nativeSetTimeout(fn,ms,...rest);
  };
  const m=await import('./src/render/characters/ruckusModel.js?browser-glb-fetch-test');
  await new Promise(resolve=>nativeSetTimeout(resolve,80));
  assert.equal(warmSlices,0,'importing the production model requests no RU-7 payload or template slices');
  assert.equal(m.requiresRuckusWarmForNewGame({crucibleLaunch:true}),false,'standalone Crucible cannot enter Ceres');
  assert.equal(m.requiresRuckusWarmForNewGame({}),true,'ordinary Adventure keeps the pre-flight Ceres readiness gate');
  assert.equal(m.requiresRuckusWarmForNewGame({crucibleLaunch:true,startSectorId:'sector_ceres_belt'}),true,'an explicit Ceres start still warms');
  assert.equal(warmSlices,0,'classification alone does not request RU-7 data');
  assert.equal(fetches,0,'importing the production model makes no asset requests');
  const ready=m.warmRuckusModel();
  assert.strictEqual(m.warmRuckusModel(),ready,'repeated callers share one warm');
  await assert.rejects(ready,error=>error.message.includes('RU-7 asset fetch failed (503)'), 'a failed binary request rejects the shared warm');
  assert.equal(fetches,4,'the initial warm requests each exact GLB once');
  const retry=m.warmRuckusModel();
  assert.notStrictEqual(retry,ready,'a failed warm clears its memo and can be retried');
  assert.strictEqual(m.warmRuckusModel(),retry,'retry callers share the retry promise');
  await retry;
  assert.equal(fetches,8,'retry requests a complete consistent four-asset set');
  assert.ok(warmSlices>0,'demand warm fully decodes authored templates in bounded tasks');
  for(const part of [undefined,'core']){
   const root=m.buildRuckusVisual(ruckusEntitySpec(part));
   assert.equal(root.userData.authoredAssetState,'authored');
   if(part===undefined){
    let lod;root.traverse(o=>{if(o.isLOD)lod=o;});
    const runtimeMeshes=[];
    lod.levels[0].object.traverse(o=>{if(o.isMesh)runtimeMeshes.push(o);});
    const sameArray=(a,b)=>!!a&&!!b&&a.constructor===b.constructor&&a.length===b.length
     &&Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength));
    const sameGeometry=(a,b)=>{
     const aa=a.attributes,bb=b.attributes;
     return Object.keys(aa).length===Object.keys(bb).length&&Object.keys(aa).every(name=>sameArray(aa[name].array,bb[name].array))
      &&((a.index===null&&b.index===null)||(a.index!==null&&b.index!==null&&sameArray(a.index.array,b.index.array)));
    };
    assert.equal(runtimeMeshes.length,coldMeshes.length,'all fetched LOD0 meshes are present');
    for(const authored of coldMeshes)assert.ok(runtimeMeshes.some(runtime=>sameGeometry(runtime.geometry,authored.geometry)),'fetched vertex attributes and triangle indices match the Node-read authored GLB');
   }
   m.disposeRuckusVisual(root);
  }
  cold.disposeRuckusVisual(coldRoot);
  cold.clearRuckusModelCache();
  m.clearRuckusModelCache();
 `;
 execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:fileURLToPath(new URL('..',import.meta.url)),timeout:30000,stdio:'pipe'});
});
