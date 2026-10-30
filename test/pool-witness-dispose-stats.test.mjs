import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { disposePoolChunkDirectVariantWitness, installPoolWitnessStats } from '../src/render/partsLibrary.js';

function chunkWithWitness() {
  const source = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const chunk = new THREE.InstancedMesh(source, material, 4);
  const view = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) view.setAttribute(name, source.attributes[name]);
  view.setIndex(source.index);
  view.setDrawRange(0, 0);
  const witness = new THREE.Mesh(view, material);
  witness.userData = { spacefacePoolDirectVariantWitness: true };
  chunk.add(witness);
  return { source, chunk, view, witness };
}

test('teardown disposes the witness view without handing the shared pool attributes to three', () => {
  const { source, chunk, view, witness } = chunkWithWitness();
  let seen = null;
  view.addEventListener('dispose', (e) => {
    // what WebGLGeometries.onGeometryDispose would remove from the GPU
    seen = { attrs: Object.keys(e.target.attributes), index: e.target.index };
  });
  let sourceDisposed = false;
  source.addEventListener('dispose', () => { sourceDisposed = true; });
  assert.equal(disposePoolChunkDirectVariantWitness(chunk), 1);
  assert.deepEqual(seen, { attrs: [], index: null });
  assert.equal(sourceDisposed, false);
  assert.ok(source.attributes.position && source.index, 'pool geometry keeps its attributes');
  assert.equal(witness.parent, null);
  assert.equal(chunk.children.length, 0);
  assert.equal(disposePoolChunkDirectVariantWitness(chunk), 0, 'idempotent');
});

test('chunk teardown calls the witness dispose before the chunk mesh dispose', () => {
  const src = readFileSync(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(src, /disposePoolChunkDirectVariantWitness\(chunk\.mesh\);\n\s*chunk\.mesh\.dispose\(\);/);
});

test('witness stats are opt-in and count draws, shadow draws and program switches', () => {
  delete globalThis.__sfPoolWitnessStats;
  const a = chunkWithWitness().witness;
  installPoolWitnessStats(a);
  assert.equal(a.onBeforeRender, THREE.Object3D.prototype.onBeforeRender, 'off by default');
  const stats = {}; globalThis.__sfPoolWitnessStats = stats;
  const w = chunkWithWitness().witness;
  installPoolWitnessStats(w);
  const gl = { useProgram() {} };
  const renderer = { getContext: () => gl };
  w.onBeforeRender(renderer); gl.useProgram(1); w.onAfterRender(renderer);
  w.onBeforeRender(renderer); w.onAfterRender(renderer);
  w.onBeforeShadow();
  assert.equal(stats.witnesses, 1);
  assert.equal(stats.draws, 2);
  assert.equal(stats.shadowDraws, 1);
  assert.equal(stats.programSwitchesIn, 1);
  assert.equal(stats.glUseProgram.calls, 1);
  delete globalThis.__sfPoolWitnessStats;
});
