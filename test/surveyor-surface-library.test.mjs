import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createSurveyorSurfaceLibrary, SURVEYOR_SURFACE_URL, preloadSurveyorSurface} from '../src/render/surveyorSurfaceLibrary.js';
import {createVisualFactory} from '../src/render/visualFactory.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function renderer(){return {domElement:new EventTarget(),uploads:0,lost:false,fail:false,
  getContext(){return {isContextLost:()=>this.lost};},initTexture(){this.uploads++;if(this.fail)throw Error('upload failure');}};}
const texture=()=>new THREE.Texture();

test('optional Surveyor map keeps fallback, retries bounded failures and warms each renderer separately',async()=>{
  let time=0,loads=0,missing=true;
  const lib=createSurveyorSurfaceLibrary({now:()=>time,loadTexture:async()=>{loads++;if(missing)throw Error('404');return texture();}});
  const a=renderer(),b=renderer(),ma=new THREE.MeshStandardMaterial(),mb=new THREE.MeshStandardMaterial();
  assert.equal(await lib.preload(a),null);lib.apply(a,ma);lib.apply(b,mb);
  assert.equal(ma.map,lib.getFallback());assert.equal(mb.map,ma.map);assert.equal(loads,1);
  time=1000;missing=false;const ready=await lib.preload(a);lib.apply(a,ma);
  assert.equal(ma.map,ready);assert.equal(b.uploads,0);assert.equal(mb.map,lib.getFallback());
  b.fail=true;assert.equal(await lib.preload(b),null);assert.equal(b.uploads,1);
  await lib.preload(b);assert.equal(b.uploads,1);time=2000;b.fail=false;
  assert.equal(await lib.preload(b),ready);assert.equal(b.uploads,2);assert.equal(loads,2);
  lib.apply(b,mb);assert.equal(mb.map,ready);
  assert.equal(ma.map.colorSpace,lib.getFallback().colorSpace);assert.equal(ma.map.wrapS,lib.getFallback().wrapS);
});

test('context epochs, restoration, destroy and recreation cannot share stale upload receipts',async()=>{
  const pending=deferred(),scheduled=[];
  const lib=createSurveyorSurfaceLibrary({loadTexture:()=>pending.promise,defer:fn=>scheduled.push(fn)});
  const a=renderer(),b=renderer(),m=new THREE.MeshStandardMaterial();
  const old=lib.preload(a);lib.lifecycle(a,'context-lost');a.lost=true;
  pending.resolve(texture());assert.equal(await old,null);assert.equal(a.uploads,0);
  a.lost=false;a.domElement.dispatchEvent(new Event('webglcontextrestored'));assert.equal(scheduled.length,1);
  scheduled.shift()();await lib.preload(a);lib.apply(a,m);assert.notEqual(m.map,lib.getFallback());
  assert.equal(a.uploads,1);lib.lifecycle(a,'renderer-destroyed');
  assert.equal(await lib.preload(a),null);a.domElement.dispatchEvent(new Event('webglcontextrestored'));assert.equal(scheduled.length,0);
  await lib.preload(b);assert.equal(b.uploads,1);
  const delayed=deferred(),late=createSurveyorSurfaceLibrary({loadTexture:()=>delayed.promise});
  const c=renderer(),p=late.preload(c);late.lifecycle(c,'renderer-destroyed');delayed.resolve(texture());
  assert.equal(await p,null);assert.equal(c.uploads,0);
});

test('optional failure stops its retry burst and explicit retry can recover',async()=>{
  let time=0,loads=0,fail=true;
  const lib=createSurveyorSurfaceLibrary({now:()=>time,loadTexture:async()=>{loads++;if(fail)throw Error('missing');return texture();}}),r=renderer();
  for(let i=0;i<3;i++){await lib.preload(r);time+=10000;}
  await lib.preload(r);assert.equal(loads,3);fail=false;assert.ok(await lib.preload(r,{retry:true}));assert.equal(loads,4);
});

test('shipped Surveyor surface matches its provenance and calibration package',()=>{
  const file=new URL('..'+SURVEYOR_SURFACE_URL,import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('../assets/ships/release/surfaces/surveyor-prism/manifest.json',import.meta.url)));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),manifest.files[0].sha256);
  assert.equal(manifest.files[0].width,256);assert.equal(manifest.files[0].height,256);
  assert.ok(manifest.reference.startsWith('tools/art/source_assets/surveyor-prism/'));
  const reference=new URL('../'+manifest.reference,import.meta.url);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(reference)).digest('hex'),manifest.referenceSha256);
});

test('real visual-factory cleanup seam preserves its cache behavior and retires pending Surveyor uploads',async()=>{
  const previousDocument=globalThis.document,previousLoader=THREE.TextureLoader.prototype.loadAsync;
  const pending=deferred(),clears=[],a=renderer(),b=renderer();
  globalThis.document={};
  THREE.TextureLoader.prototype.loadAsync=function(url){return url===SURVEYOR_SURFACE_URL?pending.promise:Promise.reject(Error('unrelated optional map not requested by this test'));};
  let second;
  try {
    const first=createVisualFactory({renderer:a,readyPackagedBodies:{clear:reason=>clears.push(reason)}});
    const loading=preloadSurveyorSurface(a);
    first.clearReadyPackagedBodies('game-new');
    first.clearReadyPackagedBodies('renderer-destroyed');
    pending.resolve(texture());assert.equal(await loading,null);assert.equal(a.uploads,0);
    assert.deepEqual(clears,['game-new','renderer-destroyed']);
    second=createVisualFactory({renderer:b,readyPackagedBodies:{clear:reason=>clears.push(reason)}});
    assert.ok(await preloadSurveyorSurface(b));assert.equal(b.uploads,1);
    second.clearReadyPackagedBodies('mode-menu');assert.ok(await preloadSurveyorSurface(b));assert.equal(b.uploads,1);
    second.clearReadyPackagedBodies('context-lost');assert.equal(await preloadSurveyorSurface(b),null);
    b.domElement.dispatchEvent(new Event('webglcontextrestored'));
    assert.ok(await preloadSurveyorSurface(b));assert.equal(b.uploads,2);
    assert.deepEqual(clears,['game-new','renderer-destroyed','mode-menu','context-lost']);
  } finally {
    second?.clearReadyPackagedBodies('renderer-destroyed');
    THREE.TextureLoader.prototype.loadAsync=previousLoader;
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  }
});
