// Actual public lease/package admission, with filesystem transport and an isolated KTX2Loader CPU adapter.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'.'),sha256=b=>createHash('sha256').update(b).digest('hex');
assert.equal(path.resolve(process.env.PIP_GAME_ROOT||process.cwd()),root,'CPU adapter root must equal checked repo');
assert.notEqual(globalThis.__SF_DEV_SOURCE_ASSETS__,true);
const imports=rel=>import(pathToFileURL(path.join(root,rel)));
const THREE=await imports('node_modules/three/build/three.module.js');
const requests=[],old={fetch:globalThis.fetch,self:globalThis.self,window:globalThis.window,document:globalThis.document,raf:globalThis.requestAnimationFrame};
const renderers=[],frames=[];
globalThis.fetch=async(input,options={})=>{
 const url=String(input);if(options.signal?.aborted)throw options.signal.reason;
 let relative=url.replace(/^file:\/\//,'');if(path.isAbsolute(relative))relative=path.relative(root,relative);relative=relative.replace(/^\.\//,'');
 assert.ok(!relative.includes('..')&&!path.isAbsolute(relative),'local transport remains repo-bounded');
 let file;
 if(relative==='vendor/addons/libs/basis/basis_transcoder.wasm')file=path.join(root,'node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm');
 else{
  assert.ok(/^assets\/ships\/release\/render-packages\/pip-spanner\/(render\.glb|render-package\.json)$/.test(relative),`unexpected fetch (no source-route fallback): ${url}`);
  file=path.join(root,relative);
 }
 const bytes=await fs.readFile(file);requests.push({url:relative,sha256:sha256(bytes),bytes:bytes.length});
 return new Response(bytes,{status:200,headers:{'Content-Type':relative.endsWith('.json')?'application/json':'application/octet-stream'}});
};
globalThis.self=globalThis;
const context=new Proxy({canvas:{width:256,height:256},measureText:()=>({width:10}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>context,style:{},addEventListener(){}})};
globalThis.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
const scene=new THREE.Scene();globalThis.window={SF:{state:{mode:'loading',render:{scene,liveSectorGpuAdmission:true}}}};
const owner=await imports('src/render/assetLoader.js');
const {renderPackagePilotForSourceUrl}=await imports('src/render/renderPackageManifest.js');
const preview=await imports('src/ui/orrery/pipSpannerPreview.js');
const pilot=renderPackagePilotForSourceUrl(preview.PIT_CREW_ASSET);
assert.ok(pilot,'actual generated pilot binding must admit this release URL');assert.equal(pilot.key,'pip-spanner');
assert.equal(pilot.sourceSha256,'247a57ec9b5d9066b79c9d0f09d3197fd45c51c47ec469af988ad11cfd6245f0');
const metadata=JSON.parse(await fs.readFile(path.join(root,pilot.metadataUrl),'utf8'));
async function pumpUntil(predicate,label){const end=performance.now()+15000;while(!predicate()){for(const fn of frames.splice(0))fn(performance.now());assert.ok(performance.now()<end,`${label}: fixture exceeded15s`);await new Promise(resolve=>setTimeout(resolve,1));}}
async function settled(work,label){let done=false,value,error;Promise.resolve(work).then(v=>{value=v;done=true;},e=>{error=e;done=true;});await pumpUntil(()=>done,label);if(error)throw error;return value;}
function renderer(){const r={};renderers.push(r);globalThis.window.SF.state.render.renderer=r;return r;}
const r=renderer(),lease=owner.createAuthoredAssetLease(r,{ownerId:'pip-public-lease-proof',role:'preview'});
let instance, releasePendingDecode=null;
try{
 const missingUrl='assets/ships/release/parts/places/place_pip_spanner_unregistered_probe.glb';
 await assert.rejects(()=>lease.load(missingUrl,{slot:'place'}),error=>error?.name==='AssetContractError'&&/has no render package/.test(error.message),'public source-route guard remains fail-closed');
 const record=await settled(lease.load(preview.PIT_CREW_ASSET,{slot:'place'}),'public package load');
 assert.ok(record,JSON.stringify(await owner.getAuthoredAssetDiagnostic(r,preview.PIT_CREW_ASSET,'place')));
 assert.equal(record.report.renderPackage.route,'render-package');assert.equal(record.renderPackage.contentHash,pilot.expectedContentHash);
 assert.ok(metadata.runtime&&metadata.runtime.primitives.length===25,'compiled runtime table exists');
 assert.equal(record.primitives.length,25);assert.deepEqual(record.markers.map(m=>m.name).sort(),[...preview.PIT_CREW_PIVOTS].sort());
 assert.deepEqual(record.warnings||[],[]);assert.equal(record.url,preview.PIT_CREW_ASSET);
 assert.ok(owner.peekSettledAuthoredRecords(r).includes(record));
 instance=preview.instantiatePitCrew(record);instance.root.updateMatrixWorld(true);
 for(const p of record.primitives){const mesh=instance.root.getObjectByName(p.name);assert.ok(mesh);for(let i=0;i<16;i++)assert.ok(Math.abs(mesh.matrixWorld.elements[i]-p.matrix.elements[i])<1e-6,p.name);}
 // Compare the source release geometry as a read-only reference. The actual runtime load
 // above remains package-only; no source bytes are offered to the lease/decoder route.
 const require=createRequire(path.join(root,'package.json'));
 const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
 const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
 const {MeshoptDecoder}=await import(pathToFileURL(require.resolve('meshoptimizer')));await MeshoptDecoder.ready;
 const referenceBytes=await fs.readFile(path.join(root,pilot.sourceUrl));assert.equal(sha256(referenceBytes),pilot.sourceSha256);
 const reference=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).readBinary(referenceBytes);
 let sourceVertexCount=0,packageVertexCount=0,maxWorldVertexError=0,sourceMeshCount=0,orientedTriangleCount=0;
 const from=new THREE.Vector3(),to=new THREE.Vector3(),elements=[],tolerance=.00005;
 const triangleKey=values=>{const rotations=[values.join('|'),[values[1],values[2],values[0]].join('|'),[values[2],values[0],values[1]].join('|')];return rotations.sort()[0];};
 const counts=keys=>{const out=new Map();for(const key of keys)out.set(key,(out.get(key)||0)+1);return [...out.entries()].sort(([a],[b])=>a.localeCompare(b));};
 for(const node of reference.getRoot().listNodes()){
  const mesh=node.getMesh();if(!mesh)continue;sourceMeshCount++;
  const primitives=mesh.listPrimitives();assert.equal(primitives.length,1);
  const primitive=primitives[0],position=primitive.getAttribute('POSITION'),actual=instance.root.getObjectByName(node.getName());assert.ok(actual,node.getName());
  const current=actual.geometry.getAttribute('position');sourceVertexCount+=position.getCount();packageVertexCount+=current.count;
  const matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix()),buckets=new Map(),referenceKeys=[],actualKeys=[];
  const cell=v=>[Math.floor(v.x/tolerance),Math.floor(v.y/tolerance),Math.floor(v.z/tolerance)];
  for(let i=0;i<position.getCount();i++){
   position.getElement(i,elements);from.fromArray(elements).applyMatrix4(matrix);
   const key=[from.x,from.y,from.z].join(','),bucket=cell(from).join(',');referenceKeys.push(key);
   if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push({key,point:from.clone()});
  }
  for(let i=0;i<current.count;i++){
   to.fromBufferAttribute(current,i).applyMatrix4(actual.matrixWorld);const [x,y,z]=cell(to);let nearest=null,error=Infinity;
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const entry of buckets.get([x+dx,y+dy,z+dz].join(','))||[]){const distance=entry.point.distanceTo(to);if(distance<error){error=distance;nearest=entry;}}
   assert.ok(nearest&&error<tolerance,`${node.getName()} world vertex ${i} has no source match: ${error}`);
   actualKeys.push(nearest.key);maxWorldVertexError=Math.max(maxWorldVertexError,error);
  }
  const sourceIndices=primitive.getIndices(),currentIndices=actual.geometry.index;assert.equal(currentIndices.count,sourceIndices.getCount());
  const sourceTriangles=[],actualTriangles=[];
  for(let i=0;i<sourceIndices.getCount();i+=3){
   sourceTriangles.push(triangleKey([0,1,2].map(j=>referenceKeys[sourceIndices.getScalar(i+j)])));
   actualTriangles.push(triangleKey([0,1,2].map(j=>actualKeys[currentIndices.getX(i+j)])));orientedTriangleCount++;
  }
  assert.deepEqual(counts(actualTriangles),counts(sourceTriangles),`${node.getName()} oriented source triangles`);
 }
 assert.equal(sourceMeshCount,25);
 const sourceGeometryParity={sourceMeshCount,sourceVertexCount,packageVertexCount,orientedTriangleCount,maxWorldVertexError,toleranceMetres:tolerance,comparison:'oriented triangle surface parity; legal vertex welding/index reordering permitted'};
 const camera=new THREE.OrthographicCamera(-10.25,10.25,6.15,-6.15,.1,200);camera.position.set(-1.8,33,19);camera.lookAt(-1.8,.7,-1);camera.updateMatrixWorld(true);
 const point=new THREE.Vector3();instance.pivots.ITEM_CRADLE.getWorldPosition(point);point.project(camera);assert.ok(Math.abs((point.x+1)*180-233.561)<.01);assert.ok(Math.abs((1-point.y)*108-122.006)<.01);
 instance.pose({phase:'accepted',progress:1});assert.ok(instance.pivots.CLAW_L.quaternion.y<0);assert.ok(instance.pivots.CLAW_R.quaternion.y>0);
 instance.pose({phase:'accepted',service:'weld',progress:.5});assert.ok(instance.pivots.PIP_POINTER.quaternion.y<0);
 instance.pose({phase:'denied',progress:1});assert.equal(instance.pivots.CLAW_L.quaternion.y,0);
 const beforeFetch=requests.filter(x=>x.url.endsWith('/render.glb')).length;
 const peer=owner.createAuthoredAssetLease(r,{ownerId:'pip-peer',role:'preview'});lease.release('closed');assert.equal(lease.isActive(),false);assert.equal(await lease.load(preview.PIT_CREW_ASSET,{slot:'place'}),null);
 const reopened=await settled(peer.load(preview.PIT_CREW_ASSET,{slot:'place'}),'reopen');assert.equal(reopened,record);assert.equal(requests.filter(x=>x.url.endsWith('/render.glb')).length,beforeFetch);
 instance.dispose();instance=null;peer.release('closed');await settled(owner.disposeAuthoredAssetRuntime(r),'retirement');assert.equal(owner.peekSettledAuthoredRecords(r).length,0);
 const trace=globalThis.__PIP_KTX_CPU_TRACE__;assert.equal(trace.disposed,trace.created,'settled decoder ownership retires');
 // A departed preview returns to fallback immediately, but an issued CPU transcode still owns
 // the decoder. Exercise the same preview retirement helper against that actual public load.
 const decodeGate=new Promise(resolve=>{releasePendingDecode=resolve;});
 globalThis.__PIP_KTX_CPU_BEFORE_DECODE__=()=>decodeGate;
 const delayedRenderer=renderer(),retirementEvents=[];
 Object.assign(delayedRenderer,{info:{programs:[]},extensions:{has:()=>false},getContext:()=>({isContextLost:()=>false}),dispose(){retirementEvents.push('renderer');},forceContextLoss(){retirementEvents.push('context');}});
 const delayedLease=owner.createAuthoredAssetLease(delayedRenderer,{ownerId:'pip-deferred-close',role:'preview'}),abort=new AbortController();
 const startedBefore=trace.started,disposedBefore=trace.disposed;
 const loading=delayedLease.load(preview.PIT_CREW_ASSET,{slot:'place',signal:abort.signal}).catch(error=>{if(error?.name==='AbortError')return null;throw error;});
 await pumpUntil(()=>trace.started>startedBefore,'actual deferred texture decode starts');
 abort.abort(new DOMException('preview closed','AbortError'));
 const withdrawn=await settled(loading,'logical consumer withdrawal');assert.equal(withdrawn,null,'closed consumer cannot publish');
 let physicallyRetired=false;
 const retirement=preview.retirePitPreviewResources({loading,renderer:delayedRenderer,getModel:()=>null,lease:delayedLease}).then(()=>{physicallyRetired=true;});
 // Let logical withdrawal and retirement admission settle. Actual decode remains gated.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(physicallyRetired,false);assert.equal(trace.disposed,disposedBefore);
 assert.deepEqual(retirementEvents,[]);assert.equal(delayedLease.isActive(),true,'physical lease is retained until raw work settles');
 delete globalThis.__PIP_KTX_CPU_BEFORE_DECODE__;releasePendingDecode();releasePendingDecode=null;
 await settled(retirement,'physical deferred retirement');
 assert.equal(delayedLease.isActive(),false);assert.deepEqual(retirementEvents,['renderer','context']);
 assert.equal(owner.peekSettledAuthoredRecords(delayedRenderer).length,0);
 assert.equal(trace.disposed,trace.created,'all acquired decoder ownership retires after actual decode');
 const deferredClose={logicalResult:withdrawn,resourceReleaseBeforeDecode:false,physicalRetirementAfterDecode:physicallyRetired,retirementEvents};
 console.log(JSON.stringify({status:'PASS',scope:'Actual public createAuthoredAssetLease/loadAuthoredPart and generated package route, content verification/runtime-table bind, real Meshopt and a replacement KTX2Loader doing CPU Basis decode, source/package world-vertex parity, actual crew constructor/poses, lease close/reopen and physical retirement. Stock KTX2Loader parse/detectSupport/worker-pool scheduling, browser Worker messaging, WebGL and UI pixels are not exercised.',pilot,packageContentHash:metadata.contentHash,unregisteredReleaseRefused:true,sourceGeometryParity,deferredClose,primitiveCount:record.primitives.length,markers:record.markers.map(m=>m.name),requests,decoderTrace:trace,sourcePins:Object.fromEntries(await Promise.all(['src/render/assetLoader.js','src/render/renderPackageLoader.js','src/render/renderPackageManifest.js','src/ui/orrery/pipSpannerPreview.js'].map(async rel=>[rel,sha256(await fs.readFile(path.join(root,rel)))])))},null,2));
}finally{
 delete globalThis.__PIP_KTX_CPU_BEFORE_DECODE__;releasePendingDecode?.();
 instance?.dispose();lease.release('fixture-finally');for(const current of renderers)await owner.disposeAuthoredAssetRuntime(current);
 for(const [k,v]of Object.entries(old)){const key=k==='raf'?'requestAnimationFrame':k;if(v===undefined)delete globalThis[key];else globalThis[key]=v;}
}
