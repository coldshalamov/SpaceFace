import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';
import { createInstancedSpriteBuckets, resetInstancedSpriteBuckets, writeInstancedSpriteFields, commitInstancedSpriteBuckets } from '../src/render/combat/instancedSpritePool.js';
import { createVfxPrecompileSalvo } from '../src/render/vfx.js';

const write = buckets => writeInstancedSpriteFields(buckets, 'smoke', 1, 2, 3, 4, 4, 4, 0, 1, 1, 1, 0.5);

test('idle sprite materials leave the render list and reactivate without overriding scene isolation', () => {
  const scene=new THREE.Scene(), coordinator=createDynamicBufferCoordinator(scene);
  const buckets=createInstancedSpriteBuckets(scene,4), smoke=buckets.smoke;
  for(const b of [buckets.glow,buckets.ring,buckets.smoke,buckets.combustion]) {
    assert.equal(b.mesh.count,0);assert.equal(b.mesh.material.visible,false);assert.equal(b.mesh.visible,true);
  }
  resetInstancedSpriteBuckets(buckets);write(buckets);commitInstancedSpriteBuckets(buckets);
  assert.equal(smoke.mesh.count,1);assert.equal(smoke.mesh.material.visible,true);
  smoke.mesh.visible=false; // The VFX isolation owner controls this independently.
  resetInstancedSpriteBuckets(buckets);commitInstancedSpriteBuckets(buckets);
  assert.equal(smoke.mesh.material.visible,false);assert.equal(smoke.mesh.visible,false);
  resetInstancedSpriteBuckets(buckets);write(buckets);commitInstancedSpriteBuckets(buckets);
  assert.equal(smoke.mesh.count,1);assert.equal(smoke.mesh.material.visible,true);assert.equal(smoke.mesh.visible,false);
  smoke.mesh.visible=true;
  coordinator.handleContextLost();coordinator.handleContextRestored();
  const epoch=coordinator.arm();scene.onBeforeRender({},scene,new THREE.PerspectiveCamera(),null);
  assert.ok(smoke.position.updateRanges.length>0,'reactivated material is eligible for restored-context publication');
  coordinator.disarm(epoch);
  assert.equal(smoke.mesh.count,1);assert.equal(smoke.mesh.material.visible,true);
});

test('VFX warmup still makes every populated sprite shader visible', () => {
  const salvo=createVfxPrecompileSalvo(), batches=[];
  salvo.traverse(o=>{if(o.userData?.spacefaceVfxSpriteBatch)batches.push(o)});
  assert.equal(batches.length,4);
  assert.ok(batches.every(o=>o.count>0 && o.material.visible));
});

test('the browser flipbook buckets also wake and sleep independently', () => {
  const oldDocument=globalThis.document, oldImage=globalThis.Image, oldLoad=THREE.TextureLoader.prototype.load;
  try {
    globalThis.document={};globalThis.Image=class {};
    THREE.TextureLoader.prototype.load=function(){return new THREE.Texture()};
    const scene=new THREE.Scene(), buckets=createInstancedSpriteBuckets(scene,4);
    const flip=Object.values(buckets.flip);
    assert.equal(flip.length,5);assert.ok(flip.every(b=>!b.mesh.material.visible));
    resetInstancedSpriteBuckets(buckets);
    writeInstancedSpriteFields(buckets,'flipWisp',0,0,0,1,1,1,0,1,1,1,1);
    commitInstancedSpriteBuckets(buckets);
    assert.equal(buckets.flip.wisp.mesh.count,1);assert.equal(buckets.flip.wisp.mesh.material.visible,true);
    assert.ok(flip.filter(b=>b!==buckets.flip.wisp).every(b=>!b.mesh.material.visible));
    resetInstancedSpriteBuckets(buckets);commitInstancedSpriteBuckets(buckets);
    assert.ok(flip.every(b=>!b.mesh.material.visible));
  } finally {
    THREE.TextureLoader.prototype.load=oldLoad;
    if(oldDocument===undefined) delete globalThis.document; else globalThis.document=oldDocument;
    if(oldImage===undefined) delete globalThis.Image; else globalThis.Image=oldImage;
  }
});
