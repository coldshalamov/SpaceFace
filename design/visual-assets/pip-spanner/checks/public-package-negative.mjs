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
 let bytes=await fs.readFile(file); if(process.env.PIP_NEGATIVE_CASE==='runtime' && relative.endsWith('/render-package.json')) {const m=JSON.parse(bytes);m.runtimeHash='0'.repeat(64);bytes=Buffer.from(JSON.stringify(m));} if(process.env.PIP_NEGATIVE_CASE==='render' && relative.endsWith('/render.glb')) {bytes=Buffer.from(bytes);bytes[bytes.length-1]^=1;} requests.push({url:relative,sha256:sha256(bytes),bytes:bytes.length});
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

const r=renderer(),lease=owner.createAuthoredAssetLease(r,{ownerId:'pip-negative-proof',role:'preview'});
try {
 const record=await settled(lease.load(preview.PIT_CREW_ASSET,{slot:'place'}),'corrupt package');
 assert.equal(record,null,'corrupt package must not admit a record');
 const diagnostic=await owner.getAuthoredAssetDiagnostic(r,preview.PIT_CREW_ASSET,'place');
 const json=diagnostic?.message || JSON.stringify(diagnostic);
 assert.match(json, process.env.PIP_NEGATIVE_CASE==='runtime' ? /runtime hash mismatch/i : /SHA-256 mismatch/i);
 assert.equal(owner.peekSettledAuthoredRecords(r).length,0);
 console.log(JSON.stringify({status:'PASS',case:process.env.PIP_NEGATIVE_CASE,record,diagnostic:json,requests},null,2));
}finally {lease.release('negative-complete');await owner.disposeAuthoredAssetRuntime(r);}
