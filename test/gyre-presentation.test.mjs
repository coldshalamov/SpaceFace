import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GyreSnarePresentation } from '../src/render/forceLanguage/gyreSnarePresentation.js';

function fixture() {
  const scene = new THREE.Scene();
  const view = new GyreSnarePresentation(scene, { toLocal: (x, z, out) => Object.assign(out, { x, z }) });
  const state = { simTime: 0, settings: {}, gyreSnare: {
    phase: 'beaming', nose: { x: 0, z: 0 }, maw: { x: 200, z: 0 }, endRadius: 86,
    corePos: { x: 204, z: 18 }, ballPos: { x: 204, z: 18 }, members: [], balls: [],
  } };
  const step = (frames = 1) => {
    for (let i = 0; i < frames; i++) { state.simTime += 1 / 60; view.update(1 / 60, state); }
  };
  return { scene, view, state, step };
}

test('empty Gyre intake stays open and its geometric parcels drain on release', () => {
  const { scene, view, state, step } = fixture();
  try {
    step(30);
    assert.equal(view._beam.visible, true);
    assert.equal(view._spiral.isMesh, true, 'nearby intake matter has a world-oriented surface');
    scene.traverse(object => assert.equal(!!object.isPoints || !!object.isSprite, false));
    const jaw = view._disc.geometry.attributes.position;
    for (let i = 0; i < jaw.count; i++) {
      assert.ok(Math.hypot(jaw.getX(i), jaw.getY(i)) > 0.4, 'the mouth keeps its center clear');
    }
    const clock = view._spiralMat.uniforms.uTime.value;
    step(12);
    assert.ok(view._spiralMat.uniforms.uTime.value > clock, 'empty space does not suspend intake transport');
    const frozen = view._spiralMat.uniforms.uTime.value;
    view.update(2, state);
    assert.equal(view._spiralMat.uniforms.uTime.value, frozen, 'display time cannot advance a paused effect');
    state.gyreSnare.phase = 'off';
    step();
    assert.ok(view._spiralMat.uniforms.uRelease.value >= 0, 'release cuts new parcel supply');
    step(60);
    assert.equal(view._beam.visible, false, 'all intake residue retires');
    const asleep = view.time;
    step(30);
    assert.equal(view.time, asleep, 'retired intake sleeps');
  } finally { view.dispose(); }
  assert.equal(scene.children.length, 0, 'disposal removes every owned scene attachment');
});

test('absorbed materials retain distinct opaque silhouettes through the bowling launch', () => {
  const { view, state, step } = fixture();
  try {
    const mirror = state.gyreSnare;
    Object.assign(mirror, { phase: 'holding', coreId: 1, clumpRadius: 22, clumpMass: 400, maxClumpMass: 1600,
      members: ['rock', 'metal', 'crystal', 'volatile'].map((material, i) => ({
        type: 'asteroid', typeId: `ast_${material}`, material, mass: 30, radius: 4,
        nx: Math.cos(i * Math.PI / 2), nz: Math.sin(i * Math.PI / 2),
      })) });
    const savedMirror = structuredClone(mirror);
    step(30);
    assert.deepEqual(mirror, savedMirror, 'drawing never rewrites the authoritative payload ledger');
    const lumps = view._lumps.filter(l => l.used);
    assert.equal(lumps.length, 4);
    assert.equal(new Set(lumps.map(l => l.mesh.material.color.getHex())).size, 4);
    assert.equal(new Set(lumps.map(l => l.mesh.geometry.type)).size, 4);
    for (const lump of lumps) {
      assert.equal(lump.mesh.material.transparent, false);
      assert.equal(lump.mesh.material.opacity, 1);
    }
    const geometries = lumps.map(l => l.mesh.geometry);
    Object.assign(mirror, { phase: 'launching', launchedId: 1, launchDir: { x: 1, z: 0 },
      launchWindup01: 1, launchBurst01: 0.2, thrownTick: 40, ballClumpRadius: 22,
      ballVx: 400, ballVz: 0, ballTtl01: 1, ballTtlLeftS: 8 });
    step(4);
    assert.deepEqual(view._lumps.filter(l => l.used).map(l => l.mesh.geometry), geometries);
    assert.equal(view._trail.visible, true, 'the actual throw gets its directional flight read');
    assert.ok(view._bursts.some(b => b.t < 1), 'launch creates a bounded release beat');
  } finally { view.dispose(); }
});

test('reduced motion and flash keep Gyre intake information without ongoing transport', () => {
  const { view, state, step } = fixture();
  try {
    state.settings = { video: { motionReduce: true, flashReduce: true } };
    step(30);
    const clock = view._spiralMat.uniforms.uTime.value;
    step(30);
    assert.equal(view._spiralMat.uniforms.uTime.value, clock);
    assert.equal(view._discMat.uniforms.uCalm.value, 0);
    assert.equal(view._beam.visible, true);
    assert.ok(view._spiralMat.uniforms.uFade.value > 0 && view._spiralMat.uniforms.uFade.value <= 0.55);
  } finally { view.dispose(); }
});
