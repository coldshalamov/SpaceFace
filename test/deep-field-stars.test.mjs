import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STELLAR_FORMATIONS, rebuildDeepFieldStars, sampleStellarFormation, stellarFormationIndex } from '../src/render/deepFieldStars.js';
import { DEEP_FIELD_STRUCTURE_RECIPES } from '../src/render/deepFieldStructureRecipes.js';

const FAMILIES = STELLAR_FORMATIONS.length;

function makeBackground(recipeId = 'helios_orbital_void') {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 20000);
  camera.position.set(30, 125, -72); camera.lookAt(30, 0, 0); camera.updateMatrixWorld(true);
  const size = new THREE.Vector2(1440, 900);
  const renderer = { getDrawingBufferSize: out => out.copy(size), size };
  const background = { camera, renderer, group: new THREE.Group(), seed: 47, bgY: -264, H: 120,
    state: { world: { frameOrigin: { x: 0, z: 0 } } }, bgTime: 0, tierName: 'high', lowTier: false,
    deepFieldRecipe: { id: recipeId } };
  return background;
}

test('stellar populations have explicit distinct forms and reject unknown regional recipes', () => {
  assert.equal(stellarFormationIndex('not-a-region'), -1);
  assert.equal(new Set(STELLAR_FORMATIONS.map(s => s.name)).size, FAMILIES);
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

test('every authored deep-field recipe has a stellar formation, so no region sky is silently dark', () => {
  // "Four regional stellar compositions" left the DEFAULT_STRUCTURE fallback (core_trade_constellation,
  // the core-class sectors) and galactic_spur with no sky at all — a dark default on the default route.
  for (const id of Object.keys(DEEP_FIELD_STRUCTURE_RECIPES)) {
    assert.notEqual(stellarFormationIndex(id), -1, `recipe ${id} has no stellar formation`);
  }
});

test('stellar quality prefixes, transitions, rebases and rebuilds keep bounded static buffers', () => {
  const background = makeBackground();
  const { camera, renderer } = background;
  const record = rebuildDeepFieldStars(background);
  const geometry = record.points.geometry;
  const before = geometry.getAttribute('position').array.slice();
  const uploadedVersion = geometry.getAttribute('position').version; // the one fill, uploaded once
  record.points.onBeforeRender(renderer, null, camera);
  assert.equal(record.attributeBytes, 8192 * FAMILIES * 8 * 4);
  assert.equal(record.activeStars, 8192);
  assert.equal(geometry.drawRange.count, 8192 * FAMILIES);
  const u = record.points.material.uniforms;
  const phase = u.uPhaseX.value.slice();
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
  assert.equal(geometry.drawRange.count, 2048 * FAMILIES);
  assert.ok(u.uWeights.value[2] > 0.60 && u.uWeights.value[0] < 0.01);
  assert.deepEqual(geometry.getAttribute('position').array, before);
  assert.equal(geometry.getAttribute('position').version, uploadedVersion, 'frames never re-upload the buffer');
  assert.equal(background.group.children.length, 1, 'one formation layer on the root');
  background.stellarFormation.points.geometry.dispose();
  background.stellarFormation.points.material.dispose();
});

test('a rebuild with unchanged placement is free, and a resize refills in place without a recompile', () => {
  // A window drag calls _buildLayers per resize event. The first version disposed and recreated the
  // geometry AND the ShaderMaterial (a fresh GLSL compile plus ~1 MB of typed arrays) on every event —
  // the GC wall the flight-smoothness campaign measured. Placement inputs unchanged → no work at all;
  // changed → the same buffers and material are refilled.
  const background = makeBackground();
  const { camera, renderer } = background;
  const first = rebuildDeepFieldStars(background);
  let disposed = 0;
  first.points.geometry.addEventListener('dispose', () => disposed++);
  first.points.material.addEventListener('dispose', () => disposed++);
  const positionAttr = first.points.geometry.getAttribute('position');
  positionAttr.version = 0;

  const again = rebuildDeepFieldStars(background);
  assert.equal(again, first, 'same placement inputs return the same record');
  assert.equal(positionAttr.version, 0, 'no buffer upload when nothing changed');
  assert.equal(disposed, 0);

  // Carry a live crossfade into the resize: the weights must survive the refill.
  background.bgTime = 1;
  first.points.onBeforeRender(renderer, null, camera);
  const weightBefore = first.points.material.uniforms.uWeights.value[0];
  assert.ok(weightBefore > 0.5);
  const positionsBefore = positionAttr.array.slice();

  camera.aspect = 2.35; camera.updateProjectionMatrix();
  renderer.size.set(2560, 1080);
  const resized = rebuildDeepFieldStars(background);
  assert.equal(resized, first, 'a resize reuses the record, geometry and material');
  assert.equal(resized.refills, 1);
  assert.equal(resized.rebuilds, 1);
  assert.equal(disposed, 0, 'no dispose, no recompile on resize');
  assert.equal(positionAttr.version, 1, 'the refilled buffer is uploaded once');
  assert.notDeepEqual(positionAttr.array, positionsBefore, 'placement follows the new aspect');
  assert.equal(first.points.material.uniforms.uWeights.value[0], weightBefore, 'crossfade survives');
  assert.equal(background.group.children.length, 1, 'rebuild must not accumulate layers');

  background.camera = null;
  assert.equal(rebuildDeepFieldStars(background), null);
  assert.equal(disposed, 2, 'only a missing camera retires the layer');
  assert.equal(background.group.children.length, 0);
});

test('a region with no formation submits no vertices instead of 49k early-outs', () => {
  const background = makeBackground('not-a-region');
  const { camera, renderer } = background;
  const record = rebuildDeepFieldStars(background);
  record.points.onBeforeRender(renderer, null, camera);
  assert.equal(record.activeStars, 0);
  assert.equal(record.points.geometry.drawRange.count, 0, 'dark sky draws nothing');
  assert.ok(record.points.material.uniforms.uWeights.value.every((w) => w === 0));
  // The layer stays visible so onBeforeRender keeps running and can light up on the next recipe.
  assert.equal(record.points.visible, true);
  background.deepFieldRecipe.id = 'core_trade_constellation';
  background.bgTime = 0.5;
  record.points.onBeforeRender(renderer, null, camera);
  assert.ok(record.points.geometry.drawRange.count > 0, 'the core formation lights up');
  record.points.geometry.dispose(); record.points.material.dispose();
});
