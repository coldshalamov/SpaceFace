import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {EmbeddedKtx2TexturePlugin} from '../src/render/embeddedKtx2Textures.js';
import {resetImageSourceDedupeForTests,sharedImageSourceUserCount} from '../src/render/imageSourceDedupe.js';

function firstImage(file) {
  const b=readFileSync(file), n=b.readUInt32LE(12), json=JSON.parse(b.subarray(20,20+n));
  const image=json.images.find(i=>i.mimeType==='image/ktx2'), view=json.bufferViews[image.bufferView];
  const start=20+n+8+(view.byteOffset||0);
  return b.subarray(start,start+view.byteLength);
}
function parser(bytes,loader,sampler) {
  return {json:{images:[{bufferView:0,mimeType:'image/ktx2'}],textures:[{sampler:0,extensions:{KHR_texture_basisu:{source:0}}}],samplers:[sampler]},
    options:{ktx2Loader:loader},sourceCache:{},textureCache:{},associations:new Map(),
    getDependency:()=>Promise.resolve(Uint8Array.from(bytes).buffer)};
}
test('simultaneous released ship textures share a single in-flight transcode and retain independent samplers and lifetimes', async()=>{
  resetImageSourceDedupeForTests();
  const a=firstImage('assets/ships/release/render-packages/drifter-production-v1/render.glb');
  const b=firstImage('assets/ships/release/render-packages/wasp/render.glb');
  assert.deepEqual(a,b,'the two released ships actually embed the same image');
  const callbacks=[],loader={parse(_bytes,onLoad){callbacks.push(onLoad)}};
  const p1=new EmbeddedKtx2TexturePlugin(parser(a,loader,{wrapS:33071})).loadTexture(0);
  const p2=new EmbeddedKtx2TexturePlugin(parser(b,loader,{wrapS:10497})).loadTexture(0);
  for(let i=0;i<100 && callbacks.length===0;i++) await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(callbacks.length,'a transcode started');
  await new Promise(resolve=>setTimeout(resolve,100));
  const count=callbacks.length;
  for(const cb of callbacks)cb(new THREE.CompressedTexture([{data:new Uint8Array(16),width:4,height:4}],4,4));
  const [x,y]=await Promise.all([p1,p2]);
  assert.equal(count,1,'identical simultaneous images require only one transcode');
  assert.notEqual(x,y);assert.equal(x.source,y.source);assert.equal(x.wrapS,THREE.ClampToEdgeWrapping);assert.equal(y.wrapS,THREE.RepeatWrapping);
  assert.equal(sharedImageSourceUserCount(x),2);x.dispose();assert.equal(sharedImageSourceUserCount(y),1);y.dispose();
});

test('a failed shared transcode does not poison a later retry', async()=>{
  resetImageSourceDedupeForTests();
  const bytes=firstImage('assets/ships/release/render-packages/wasp/render.glb');
  let calls=0, rejectFirst;
  const loader={parse(_bytes,onLoad,onError){calls++;if(calls===1)rejectFirst=onError;else onLoad(new THREE.CompressedTexture([{data:new Uint8Array(16),width:4,height:4}],4,4))}};
  const first=new EmbeddedKtx2TexturePlugin(parser(bytes,loader,{}));
  const second=new EmbeddedKtx2TexturePlugin(parser(bytes,loader,{}));
  const a=first.loadTexture(0),b=second.loadTexture(0);
  for(let i=0;i<100 && !rejectFirst;i++) await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(rejectFirst,'a transcode started');
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(calls,1,'both requests wait on the same transcode');
  rejectFirst(new Error('fixture transcode failure'));
  assert.deepEqual(await Promise.all([a,b]),[null,null]);
  for(const plugin of [first,second]) assert.match(plugin.textureFailures[0].message,/fixture transcode failure/);
  const result=await new EmbeddedKtx2TexturePlugin(parser(bytes,loader,{})).loadTexture(0);
  assert.ok(result);assert.equal(calls,2);result.dispose();
});
