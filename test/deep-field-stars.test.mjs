import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STELLAR_FORMATIONS, rebuildDeepFieldStars, sampleStellarFormation, stellarFormationIndex } from '../src/render/deepFieldStars.js';

test('stellar populations have explicit distinct forms and reject unknown regional recipes', () => {
  assert.equal(stellarFormationIndex('not-a-region'), -1);
  assert.equal(new Set(STELLAR_FORMATIONS.map(s => s.name)).size, 4);
  for (const [i, spec] of STELLAR_FORMATIONS.entries()) {
    assert.equal(stellarFormationIndex(spec.recipe), i);
    let seed = 47;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const scratch = [0, 0, 0];
    for (let n = 0; n < 256; n++) {
      assert.equal(sampleStellarFormation(spec.shape, random, scratch), scratch);
      assert.ok(scratch.every(Number.isFinite));
      assert.ok(Math.abs(scratch[0]) < 1.1 && Math.abs(scratch[1]) < 1.1);
    }
  }
});

test('stellar quality prefixes, transitions, rebases and rebuilds keep bounded static buffers', () => {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 20000);
  camera.position.set(30, 125, -72); camera.lookAt(30, 0, 0); camera.updateMatrixWorld(true);
  const renderer = { getDrawingBufferSize: out => out.set(1440, 900) };
  const background = { camera, renderer, group: new THREE.Group(), seed: 47, bgY: -264, H: 120,
    state: { world: { frameOrigin: { x: 0, z: 0 } } }, bgTime: 0, tierName: 'high', lowTier: false,
    deepFieldRecipe: { id: 'helios_orbital_void' } };
  const record = rebuildDeepFieldStars(background);
  const geometry = record.points.geometry;
  const before = geometry.getAttribute('position').array.slice();
  record.points.onBeforeRender(renderer, null, camera);
  assert.equal(record.attributeBytes, 1_048_576);
  assert.equal(record.activeStars, 8192);
  assert.equal(geometry.drawRange.count, 32768);
  const u = record.points.material.uniforms;
  const phase = u.uPhaseX.value.clone();
  background.state.world.frameOrigin.x = 8192; camera.position.x -= 8192;
  record.points.onBeforeRender(renderer, null, camera);
  assert.deepEqual(u.uPhaseX.value, phase, 'origin shift must not change stellar membership');
  background.lowTier = true;
  for (let i = 0; i < 100; i++) {
    background.bgTime += 1 / 60;
    background.deepFieldRecipe.id = 'fringe_tidal_filament';
    record.points.onBeforeRender(renderer, null, camera);
  }
  assert.equal(record.activeStars, 2048);
  assert.equal(geometry.drawRange.count, 8192);
  assert.ok(u.uWeights.value.z > 0.60 && u.uWeights.value.x < 0.01);
  assert.deepEqual(geometry.getAttribute('position').array, before);
  assert.equal(geometry.getAttribute('position').version, 0);
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  record.points.material.addEventListener('dispose', () => disposed++);
  rebuildDeepFieldStars(background);
  assert.equal(disposed, 2);
  assert.equal(background.group.children.length, 1, 'rebuild must not accumulate layers');
  background.stellarFormation.points.geometry.dispose();
  background.stellarFormation.points.material.dispose();
});
