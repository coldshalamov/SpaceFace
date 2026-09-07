import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInstancedSpriteBuckets, resetInstancedSpriteBuckets,
  writeInstancedSpriteFields, commitInstancedSpriteBuckets } from '../src/render/combat/instancedSpritePool.js';

function make(capacity = 4) {
  const scene = new THREE.Scene();
  const texture = new THREE.Texture();
  return createInstancedSpriteBuckets(scene, capacity, texture, texture, texture, texture);
}

test('transient silhouette carriers occupy world-space depth instead of a camera-facing quad', () => {
  const buckets = make();
  for (const kind of ['glow', 'ring', 'smoke', 'combustion']) {
    const g = buckets[kind].mesh.geometry;
    g.computeBoundingBox();
    const extent = g.boundingBox.getSize(new THREE.Vector3());
    assert.ok(extent.x > 0 && extent.y > 0 && extent.z > 0, `${kind}: non-degenerate 3D support`);
  }
});

test('event progress and launch heading reach the resident GPU instance, independent of opacity', () => {
  const b = make();
  resetInstancedSpriteBuckets(b);
  writeInstancedSpriteFields(b, 'combustion', 2, 3, 4, 5, 6, 2, 0.1, 1, 0.2, 0.1, 0.6, 0.37, 0.24, Math.PI / 2);
  commitInstancedSpriteBuckets(b);
  const g = b.combustion.mesh.geometry;
  assert.ok(g.getAttribute('aSpritePhase'), 'explicit animation phase must not be inferred from alpha');
  assert.ok(Math.abs(g.getAttribute('aSpritePhase').getX(0) - 0.37) < 1e-6);
  assert.ok(Math.abs(g.getAttribute('aSpritePhase').getY(0) - 0.24) < 1e-6);
  assert.ok(Math.abs(g.getAttribute('aSpriteAxis').getX(0) - Math.PI / 2) < 1e-6);
});

test('field animation and support stay bounded at saturation and invalid numeric inputs', () => {
  const b = make(2);
  resetInstancedSpriteBuckets(b);
  for (let i = 0; i < 2; i++) {
    assert.equal(writeInstancedSpriteFields(b, 'smoke', 0, 0, 0, 2, 2, 2, 0, 1, 1, 1, 0.5, Infinity, NaN, NaN), true);
  }
  assert.equal(writeInstancedSpriteFields(b, 'smoke', 0, 0, 0, 2, 2, 2, 0, 1, 1, 1, 0.5), false);
  commitInstancedSpriteBuckets(b);
  const g = b.smoke.mesh.geometry;
  assert.equal(b.smoke.mesh.count, 2);
  for (const name of ['aSpritePhase', 'aSpriteAxis']) {
    assert.ok(g.getAttribute(name));
    assert.ok(g.getAttribute(name).array.every(Number.isFinite));
  }
});

import { createHash } from 'node:crypto';
import { DENSITY_FILM, decodeDensityFilm } from '../src/render/combat/densityVolumeData.js';
import { createTransientDensityTexture } from '../src/render/combat/transientVfxMaterials.js';
import { ArcadeStructuralFx } from '../src/render/combat/arcadeStructuralFx.js';

test('density film is an evolving bounded field, not one static mask with scrolling UVs', () => {
  const film = decodeDensityFilm();
  assert.equal(film.length, DENSITY_FILM.textureBytes);
  const frameBytes = 32 ** 3 * 2;
  const hashes = new Set();
  for (let f = 0; f < 12; f++) {
    hashes.add(createHash('sha256').update(film.subarray(f*frameBytes, (f+1)*frameBytes)).digest('hex'));
  }
  assert.equal(hashes.size, 12, 'each simulated frame has independent advected structure');
  let earlyHeat = 0, lateHeat = 0;
  for (let i = 1; i < frameBytes; i += 2) {
    earlyHeat += film[i]; lateHeat += film[11*frameBytes+i];
  }
  assert.ok(lateHeat < earlyHeat, 'the film cools rather than preserving a permanently hot body');
});

test('packed 3D film fits the portable WebGL2 dimension floor and retains every voxel', () => {
  const texture = createTransientDensityTexture();
  const { width, height, depth, data } = texture.image;
  assert.deepEqual([width,height,depth], [64,64,96]);
  assert.ok(Math.max(width,height,depth) <= 256);
  assert.equal(data.length, DENSITY_FILM.textureBytes);
  assert.equal(texture.format, THREE.RGFormat);
  assert.equal(texture.generateMipmaps, false);
  const film = decodeDensityFilm();
  for (let f = 0; f < 12; f++) {
    const cx=f%2,cy=Math.floor(f/2)%2,cz=Math.floor(f/4);
    for (let z=0;z<32;z++) for (let y=0;y<32;y++) {
      const source=((f*32+z)*32+y)*64;
      const target=(((cz*32+z)*64+cy*32+y)*64+cx*32)*2;
      assert.deepEqual(data.subarray(target,target+64),film.subarray(source,source+64));
    }
  }
  texture.dispose();
});

test('live transient pools share one density texture and do not add a back/front transparency pass', () => {
  const b=make();
  const a=b.smoke.mesh.material.uniforms.uDensityFilm.value;
  assert.equal(a,b.combustion.mesh.material.uniforms.uDensityFilm.value);
  for(const kind of ['glow','ring','smoke','combustion']) {
    const m=b[kind].mesh.material;
    assert.equal(m.forceSinglePass,true);
    assert.equal(m.depthWrite,false);
    assert.equal(m.depthTest,true);
  }
  assert.notEqual(a,make().smoke.mesh.material.uniforms.uDensityFilm.value,
    'independent lifecycles must not share a disposable texture object');
});

test('structural combat sheets have curved depth and independent lifetime animation', () => {
  const fx=new ArcadeStructuralFx();
  fx.spawnBlade({life:1,length:3,width:2,intensity:2});
  fx.spawnArc({life:1,length:2,width:2,intensity:2});
  fx.update(.04);
  for(const pool of [fx.blades,fx.arcs]) {
    pool.mesh.geometry.computeBoundingBox();
    assert.ok(pool.mesh.geometry.boundingBox.max.y-pool.mesh.geometry.boundingBox.min.y>0.01);
    assert.ok(Math.abs(pool.phase.getX(0)-.04)<1e-6);
    assert.equal(pool.mesh.material.forceSinglePass,true);
  }
  assert.equal(fx.shards.mesh.material.isMeshStandardMaterial,true,'physical matter remains opaque and lit');
  fx.dispose();
});
