// AL-HF-09 — a ghost that latched the Quarry Hook draws that line. Tapes saved
// before the line still validate and draw the hull alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { racingLoadoutCategory } from '../src/systems/racingSteer.js';
import {
  observeRacingGhost, readRacingGhost, validateRacingGhost, sampleRacingGhostLine,
} from '../src/systems/racingGhosts.js';
import { createRacingGhostView } from '../src/render/racingGhostView.js';

const SEED = 4242;

function storage() {
  const rows = new Map();
  return { getItem: (key) => rows.get(key) || null, setItem: (key, value) => rows.set(key, value) };
}

function fixture({ hook = false } = {}) {
  const store = storage();
  const params = {
    racingContractId: 'contract_ghost_hook', courseId: 'circuit_helios_belt', courseRevision: 1,
    courseSectorId: 'sector_helios_prime', gates: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }],
    laps: 1, raceStartSimS: 0, gridUntilSimS: 0,
  };
  const player = {
    id: 1, alive: true, pos: { x: 100000, y: 3, z: -200000 }, vel: { x: 100, z: 0 }, rot: 0, mass: 10,
    data: { shipDefId: 'ship_kestrel' },
  };
  const hookBody = {
    id: 9, alive: true, name: 'Quarry Hook', pos: { x: 100040, y: 0, z: -199920 },
    data: { name: 'Quarry Hook', raceSetPiece: { id: 'quarry_hook', kind: 'anchor' } },
  };
  const state = {
    mode: 'flight', simTime: 0, meta: { seed: SEED }, playerId: 1,
    entities: new Map([[1, player], [9, hookBody]]),
    player: { alive: true, tether: { active: false, targetId: null } },
    input: { flightMode: 'assisted' }, settings: { gameplay: {} },
    world: { currentSectorId: 'sector_helios_prime', frameOrigin: { x: 0, z: 0 } },
    render: { interpolationAlpha: 1 },
  };
  params.raceCategory = racingLoadoutCategory(state, player);
  let result;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    state.simTime = t;
    player.pos.x = 100000 + t * 100;
    const latched = hook && i >= 10 && i <= 40;
    state.player.tether.active = latched;
    state.player.tether.targetId = latched ? hookBody.id : null;
    const events = i === 1 ? [{ lap: 0, gateIndex: 0, elapsedS: t }]
      : i === 30 ? [{ lap: 0, gateIndex: 1, elapsedS: t }]
        : i === 60 ? [{ lap: 0, gateIndex: 2, elapsedS: t, finished: true }] : [];
    if (i === 60) params.raceClean = true;
    result = observeRacingGhost(params, player, state, { events, finish: i === 60, storage: store });
  }
  const tape = readRacingGhost(store, params, state);
  return { store, params, player, state, hookBody, tape, result };
}

function admitHull(player) {
  const source = new THREE.Group();
  source.userData.authoredAssetState = 'authored';
  source.matrixAutoUpdate = false;
  const geometry = new THREE.BoxGeometry(10, 2, 5);
  const material = new THREE.MeshStandardMaterial({ color: 0xe0f0ff });
  source.add(new THREE.Mesh(geometry, material));
  player.mesh = source;
  const scene = new THREE.Scene();
  scene.add(source);
  return { source, scene, geometry, material };
}

test('seed 4242: the ghost keeps its Quarry Hook line and older tapes stay valid', () => {
  const plain = fixture({ hook: false });
  assert.equal(plain.result.reason, 'saved');
  assert.equal(Object.hasOwn(plain.tape, 'tethers'), false);
  assert.equal(validateRacingGhost(plain.tape), true);
  assert.equal(sampleRacingGhostLine(plain.tape, 0.3), null);

  const latched = fixture({ hook: true });
  assert.equal(latched.result.reason, 'saved');
  assert.equal(validateRacingGhost(latched.tape), true);
  assert.ok(latched.tape.tethers.length >= 1);
  const hook = sampleRacingGhostLine(latched.tape, 0.3);
  assert.equal(hook.hook, 'quarry_hook');
  assert.ok(Math.abs(hook.x - latched.hookBody.pos.x) < 0.02);
  assert.ok(Math.abs(hook.z - latched.hookBody.pos.z) < 0.02);
  const older = JSON.parse(JSON.stringify(latched.tape));
  delete older.tethers;
  assert.equal(validateRacingGhost(older), true);
  assert.equal(sampleRacingGhostLine(older, 0.3), null);
  const extra = JSON.parse(JSON.stringify(latched.tape));
  extra.extra = 'untrusted';
  assert.equal(validateRacingGhost(extra), false);
});

test('seed 4242: the ghost view draws the Quarry Hook line and hides it on an older tape', () => {
  const latched = fixture({ hook: true });
  const hull = admitHull(latched.player);
  latched.state.simTime = 0.3;
  const race = { type: 'race', status: 'active', params: latched.params };
  const view = createRacingGhostView(hull.scene, latched.state, { storage: latched.store });
  view.frame(race);
  const line = view.root.getObjectByName('Quarry Hook line');
  assert.equal(line.visible, true);
  assert.equal(line.parent, view.root);
  assert.equal(hull.scene.children.length, 2);
  assert.deepEqual(view.root.userData, { racingGhost: true, presentationOnly: true });
  const end = line.geometry.attributes.position.array;
  assert.equal(end[0], 0);
  assert.ok(Math.abs(end[3] - 10) < 0.05);
  assert.ok(Math.abs(end[5] - 80) < 0.05);
  const geometry = line.geometry;
  view.frame(race);
  assert.equal(view.root.getObjectByName('Quarry Hook line').geometry, geometry);
  latched.state.simTime = 0.05;
  view.frame(race);
  assert.equal(view.root.getObjectByName('Quarry Hook line').visible, false);
  view.dispose();

  const plain = fixture({ hook: false });
  const oldHull = admitHull(plain.player);
  plain.state.simTime = 0.3;
  const oldView = createRacingGhostView(oldHull.scene, plain.state, { storage: plain.store });
  oldView.frame({ type: 'race', status: 'active', params: plain.params });
  assert.equal(oldView.root.visible, true);
  assert.equal(oldView.root.getObjectByName('Quarry Hook line'), undefined);
  assert.equal(oldView.root.children.length, 1);
  assert.equal(oldHull.scene.children.length, 2);
  oldView.dispose();
  hull.geometry.dispose();
  hull.material.dispose();
  oldHull.geometry.dispose();
  oldHull.material.dispose();
});
