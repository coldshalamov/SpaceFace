import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCounterweightCircuitPresentation } from '../src/features/counterweightCircuit/presentation.js';
import { resultOfferSpec } from '../src/features/counterweightCircuit/readModel.js';

test('presentation only admits a complete same-life authored cohort', () => {
  const scene = new THREE.Scene(), events = [];
  const make = (id, generation, file, ready = true) => {
    const mesh = new THREE.Group(), child = new THREE.Group();
    mesh.userData.authoredAssetState = ready ? 'authored' : 'loading';
    mesh.userData.authoredPackageUrl = `/assets/ships/parts/${file}`;
    mesh.add(child); scene.add(mesh);
    return { id, occupantGeneration: generation, alive: true, mesh, pos: { x: 0, z: 0 } };
  };
  const a = make(1, 2, 'pods/a.glb'), b = make(2, 3, 'places/b.glb', false);
  const state = { mode: 'flight', entities: new Map([[1, a], [2, b]]), settings: { video: {} },
    render: { scene }, counterweightCircuitView: { eventId: 'soft_berth', attemptId: 7, phase: 'staged', marks: [],
      admission: { generation: 12, bodies: [{ id: 1, generation: 2, file: 'pods/a.glb' },
        { id: 2, generation: 3, file: 'places/b.glb' }] } } };
  const owner = createCounterweightCircuitPresentation({ state, scene, bus: { emit: (name, payload) => events.push({ name, payload }) } });
  try {
    owner.frame(); assert.equal(events.length, 0, 'a pending authored asset cannot admit the course');
    b.mesh.userData.authoredAssetState = 'authored'; b.occupantGeneration++;
    owner.frame(); assert.equal(events.length, 0, 'a recycled entity cannot satisfy an old admission');
    b.occupantGeneration--;
    b.mesh.userData.authoredPackageUrl = '/assets/ships/parts/places/wrong.glb';
    owner.frame(); assert.equal(events.length, 0, 'an authored but wrong body is not the selected asset');
    b.mesh.userData.authoredPackageUrl = '/assets/ships/parts/places/b.glb';
    owner.frame(); owner.frame();
    assert.deepEqual(events, [{ name: 'counterweightCircuit:presentationReady', payload: {
      attemptId: 7, generation: 12, bodies: [{ id: 1, generation: 2 }, { id: 2, generation: 3 }],
    } }]);
  } finally { owner.dispose(); }
});

test('result explains measured reason and only displays cash after acceptance', () => {
  const result = { outcome: 'complete', medal: 'silver', timeS: 48, reason: 'arrival_speed', reasonDetail: 3.2 };
  assert.match(resultOfferSpec(result).detail, /3\.2 u\/s/);
  assert.doesNotMatch(resultOfferSpec({ ...result, rewardStatus: 'wallet_full' }).detail, /\+60 CR/);
  assert.match(resultOfferSpec({ ...result, rewardStatus: 'wallet_full' }).detail, /wallet is full/);
  assert.match(resultOfferSpec({ ...result, rewardCr: 60 }).detail, /\+60 CR/);
  assert.match(resultOfferSpec({ ...result, reason: 'handling_damage', reasonDetail: .72 }).detail, /72% condition/);
});

test('three ordered baffle landmarks remain visible and emphasize the current gate', () => {
  const scene = new THREE.Scene();
  const state = { mode: 'flight', entities: new Map(), settings: { video: {} }, render: { scene },
    counterweightCircuitView: { phase: 'running', marks: ['a', 'b', 'c'].map((id, i) => ({
      shape: 'gate', gateId: id, active: id === 'b', ax: i * 10, az: 0, bx: i * 10, bz: 8,
    })) } };
  const owner = createCounterweightCircuitPresentation({ state, scene });
  try {
    owner.frame();
    assert.equal(owner._pool.gates.length, 3);
    assert.ok(owner._pool.gates.every(g => g.visible));
    assert.ok(owner._pool.gates[1].material.opacity > owner._pool.gates[0].material.opacity);
  } finally { owner.dispose(); }
});
