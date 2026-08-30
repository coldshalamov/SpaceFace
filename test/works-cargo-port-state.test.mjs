// PQ-131.09 — player-route Cargo Port ghost and launch-clear seams.
//
// Live G7 evidence at 06d11576 showed two false greens:
//   1. ghostPhase/ghostAuthored were true while the placement cell was empty.
//   2. a climb sample existed, but the captured frame was seated/idle with a yellow
//      board-plane capsule on the gallery floor.
// These tests pin the actual failed boundaries: drawn ghost meshes at the seat, crate-off/pod-on
// ghost presentation, launch-clear hold before reset, and authored vs procedural double-draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  bindAuthoredCargoPort,
  countDrawnWorksMeshes,
  createCargoPodLaunchClock,
  CARGO_POD_CLEAR_HOLD_S,
  CARGO_POD_RISE_S,
  presentAuthoredCargoPortGhost,
  shouldDrawProceduralCourierPod,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { CARGO_PORT_LAUNCH_CLEAR_WU } from '../src/ui/asteroid/worksPartLoader.js';

function cargoSource() {
  const root = new THREE.Group();
  const hooks = {};
  for (const name of ['crate_0', 'crate_1', 'crate_2', 'crate_3', 'crate_4', 'cradle', 'pod_root', 'pod_thruster']) {
    const node = new THREE.Object3D();
    node.name = name;
    root.add(node);
    hooks[name] = node;
  }
  hooks.pod_root.position.set(-0.22, 0.18, 0.04);
  hooks.pod_thruster.position.set(-0.44, 0.35, 0.08);
  hooks.pod_root.add(hooks.pod_thruster);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.4), new THREE.MeshStandardMaterial());
  body.name = 'LOD0_cargo_port';
  body.userData.worksLod = 'lod0';
  root.add(body);
  const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), new THREE.MeshStandardMaterial());
  cradle.name = 'LOD0_cradle';
  cradle.userData.worksLod = 'lod0';
  hooks.cradle.add(cradle);
  const pod = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), new THREE.MeshStandardMaterial());
  pod.name = 'LOD0_pod';
  pod.userData.worksLod = 'lod0';
  hooks.pod_root.add(pod);
  const thruster = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial());
  thruster.name = 'LOD0_pod_thruster';
  thruster.userData.worksLod = 'lod0';
  hooks.pod_thruster.add(thruster);
  for (let i = 0; i < 5; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
    crate.name = `LOD0_crate_${i}`;
    crate.userData.worksLod = 'lod0';
    hooks[`crate_${i}`].add(crate);
  }
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
  hidden.name = 'LOD1_cargo_port';
  hidden.userData.worksLod = 'lod1';
  hidden.visible = false;
  root.add(hidden);
  root.userData.worksHooks = hooks;
  return root;
}

test('placement ghost keeps drawn LOD0 meshes, hides crates, and retains the seated pod', () => {
  const source = cargoSource();
  const built = bindAuthoredCargoPort(source);
  built.dyn.setCrateStage(0);
  built.dyn.setPodVisible(true);
  const drawn = presentAuthoredCargoPortGhost(source);

  assert.ok(drawn >= 3, `ghost must draw the port/cradle/pod, got ${drawn}`);
  assert.equal(countDrawnWorksMeshes(built.group), drawn);
  for (let i = 0; i < 5; i++) {
    assert.equal(built.dyn.crates[i].visible, false, `ghost crate_${i} stays off until freight exists`);
  }
  assert.equal(built.dyn.pod.visible, true, 'the seated pod is part of the placement ghost');
  assert.equal(source.getObjectByName('LOD1_cargo_port').visible, false, 'LOD swaps stay in place');

  built.group.visible = false;
  assert.equal(countDrawnWorksMeshes(built.group), 0, 'hiding the mount hides every child mesh');
  built.group.visible = true;
  assert.ok(countDrawnWorksMeshes(built.group) >= 3);
});

test('stale ghost hide does not count as a drawn placement', () => {
  const source = cargoSource();
  bindAuthoredCargoPort(source);
  presentAuthoredCargoPortGhost(source);
  const mount = new THREE.Group();
  mount.name = 'authored_cargo_port_ghost_mount';
  const seat = source.parent;
  mount.add(seat);
  mount.visible = false;
  assert.equal(countDrawnWorksMeshes(mount), 0);
  mount.visible = true;
  assert.ok(countDrawnWorksMeshes(mount) > 0, 'a live ghost reports the meshes a capture can wait on');
});

test('authored Cargo Port launch holds 1.55 wu clear before reset; procedural capsule stays off', () => {
  const clock = createCargoPodLaunchClock();
  assert.deepEqual(clock.sample(), { phase: 'idle', pose: 0, visible: false });

  clock.notifyLaunch();
  const start = clock.sample();
  assert.equal(start.phase, 'rising');
  assert.equal(start.pose, 0);
  assert.equal(start.visible, true);

  const mid = clock.step(CARGO_POD_RISE_S * 0.5);
  assert.equal(mid.phase, 'rising');
  assert.ok(Math.abs(mid.pose - 0.5) < 1e-9);
  assert.equal(shouldDrawProceduralCourierPod(true), false, 'authored seat suppresses the yellow shaft capsule');

  const held = clock.step(CARGO_POD_RISE_S * 0.5);
  assert.equal(held.phase, 'holding');
  assert.equal(held.pose, 1);
  assert.equal(held.visible, true);

  const stillHeld = clock.step(CARGO_POD_CLEAR_HOLD_S * 0.5);
  assert.equal(stillHeld.phase, 'holding');
  assert.equal(stillHeld.pose, 1, 'launch-clear stays capturable through the hold');

  const done = clock.step(CARGO_POD_CLEAR_HOLD_S);
  assert.equal(done.phase, 'idle');
  assert.equal(done.pose, 0);
  assert.equal(done.visible, false);

  const reduced = createCargoPodLaunchClock();
  reduced.notifyLaunch();
  const snapped = reduced.step(1 / 60, { motionReduce: true });
  assert.equal(snapped.phase, 'holding');
  assert.equal(snapped.pose, 1);
});

test('launch-clear pose is the seated well plus 1.55 wu out of the collar, not a gallery-floor slide', () => {
  const source = cargoSource();
  const built = bindAuthoredCargoPort(source);
  const seated = built.dyn.pod.getWorldPosition(new THREE.Vector3());
  built.dyn.setPodLaunch(1);
  const clear = built.dyn.pod.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(clear.z - seated.z - CARGO_PORT_LAUNCH_CLEAR_WU) < 1e-4);
  assert.ok(Math.abs(clear.x - seated.x) < 1e-4);
  assert.ok(Math.abs(clear.y - seated.y) < 1e-4);
  assert.equal(shouldDrawProceduralCourierPod(false), true);
  assert.equal(shouldDrawProceduralCourierPod(true), false);
});
