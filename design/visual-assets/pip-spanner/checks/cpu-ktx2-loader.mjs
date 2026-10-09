// Isolated Node fixture for KTX2's browser Worker boundary. Actual Basis WASM RGBA mip transcode.
// Production admission, package fetch/hash verification, runtime-table binding, and leases stay real.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {runInThisContext} from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(process.env.PIP_GAME_ROOT||process.cwd());
const THREE=await import(pathToFileURL(path.join(root,'node_modules/three/build/three.module.js')));
let basisPromise;
async function basisModule(){
 if(!basisPromise)basisPromise=(async()=>{
  const dir=path.join(root,'node_modules/three/examples/jsm/libs/basis');
  const source=await fs.readFile(path.join(dir,'basis_transcoder.js'),'utf8');
  const wasmBinary=await fs.readFile(path.join(dir,'basis_transcoder.wasm'));
  globalThis.__PIP_BASIS_REQUIRE__=createRequire(path.join(root,'package.json'));
  let factory;try{factory=runInThisContext(`(()=>{const require=globalThis.__PIP_BASIS_REQUIRE__;const __filename='basis_transcoder.js';const __dirname='.';${source}\nreturn BASIS;})()`,{filename:'pip-cpu-basis.js'});}finally{delete globalThis.__PIP_BASIS_REQUIRE__;}
  const module=await factory({wasmBinary});module.initializeBasis();return module;
 })();return basisPromise;
}
export class KTX2Loader {
 constructor(){
  this.workerConfig={};this.transcoderPath='';this.fixtureDisposed=false;
  const trace=globalThis.__PIP_KTX_CPU_TRACE__||=( {created:0,disposed:0,started:0,completed:0,textures:[]} );
  this.trace=trace;this.id=++trace.created;
  this.workerPool={setWorkerCreator(fn){this.creator=fn;},setWorkerLimit(){},dispose:()=>{this.fixtureDisposed=true;trace.disposed++;}};
 }
 setTranscoderPath(value){this.transcoderPath=value;return this;}
 detectSupport(){return this;}
 parse(buffer,onLoad,onError){
  this.trace.started++;
  (async()=>{
   await globalThis.__PIP_KTX_CPU_BEFORE_DECODE__?.();
   assert.equal(this.fixtureDisposed,false,'decoder remains physically owned through actual parse');
   const basis=await basisModule(),file=new basis.KTX2File(new Uint8Array(buffer));
   try{
    assert.ok(file.isValid());const width=file.getWidth(),height=file.getHeight(),levels=file.getLevels();
    assert.ok(width>0&&height>0&&levels>0);assert.equal(file.getFaces(),1);assert.ok(file.getLayers()<=1);assert.ok(file.startTranscoding());
    const mipmaps=[];
    for(let level=0;level<levels;level++){
     const info=file.getImageLevelInfo(level,0,0),data=new Uint8Array(file.getImageTranscodedSizeInBytes(level,0,0,13));
     assert.ok(file.transcodeImage(data,level,0,0,13,0,-1,-1));assert.equal(data.byteLength,info.origWidth*info.origHeight*4);
     mipmaps.push({data,width:info.origWidth,height:info.origHeight});
    }
    const texture=new THREE.DataTexture(mipmaps[0].data,width,height,THREE.RGBAFormat);texture.mipmaps=mipmaps;texture.generateMipmaps=false;texture.needsUpdate=true;
    this.trace.textures.push({width,height,levels});this.trace.completed++;return texture;
   }finally{file.close();file.delete();}
  })().then(onLoad,onError);
 }
}
