// The Hive's law dressing — the room the survivalArena installs is alive, and its breath (the
// centred pull) gets an anchor a player can read. These tests pin the BUG-SWEEP-1 fix: the Hive
// was missing from the dressing list, so the arena installed with no room machinery at all.
//
// They prove: every law arena id the game can launch (the sim-side LAW_ARENA_IDS) dresses a
// room; the Hive's fields grow hearts, not industrial pylons; the pull reads brood-cold and the
// shove ember-hot, keeping the drags-cold/shoves-hot room grammar; the pheromone cone is a
// small vent on the lane; strength-0 occupancy markers never grow anything.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { WORKS_FURNACE_HEAT } from '../src/render/industrialMaterialFamilies.js';
import { LAW_ARENA_IDS } from '../src/systems/survivalArena.js';
import { HIVE_ARENA_ID, planHiveInstall } from '../src/systems/theHiveArena.js';

const BROOD_HEX = '#6cff9a';

function installPayload(arenaId, install) {
  return {
    arenaId,
    installedAtSim: 10,
    fieldSpecs: (install && install.fields) || [],
    toySpecs: [],
  };
}

function hiveInstall(phase, args = {}) {
  return planHiveInstall({ arenaPhase: phase, at: { x: 0, z: 0 }, lane: { x: 1, z: 0 }, ...args });
}

test('every law arena the game can launch gets its room dressed', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  const spec = { kind: 'well', center: { x: 0, z: 0 }, radius: 500, strength: 100 };
  for (const arenaId of LAW_ARENA_IDS) {
    dressing.handleReleased();
    const count = dressing.handleInstall(
      { arenaId, installedAtSim: 0, fieldSpecs: [spec], toySpecs: [] }, scene);
    assert.ok(dressing.peekRoom(), `${arenaId} installs a dressing room`);
    assert.ok(count >= 1, `${arenaId} dresses its law field`);
  }
});

test("the Hive's breath dresses as a living heart, not an industrial pylon", () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  const count = dressing.handleInstall(installPayload(HIVE_ARENA_ID, hiveInstall('idle')), scene);
  assert.equal(count, 1, 'one heart for the one breath');
  const room = dressing.peekRoom();
  const heart = room.parts[0].root;
  assert.equal(heart.name, 'hive_heart');
  assert.equal(heart.position.x, 0);
  assert.equal(heart.position.z, 0);
  assert.ok(heart.getObjectByName('hive_heart_pod'), 'the clutch is there');
  assert.ok(heart.getObjectByName('hive_heart_vein'), 'the vein ring is there');
  assert.ok(!heart.getObjectByName('law_pylon_base'), 'no industrial base on a living room');
  // The pull reads brood-cold: the Hive's own authored hue.
  const pod = heart.getObjectByName('hive_heart_pod');
  assert.equal(`#${pod.material.emissive.getHexString()}`, BROOD_HEX);
});

test("the queen chamber dresses the breath cold and the berm hot", () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  const install = hiveInstall('boss', { lean: { x: 0, z: 1 } });
  assert.equal(install.fields.length, 2, 'breath + berm');
  const count = dressing.handleInstall(installPayload(HIVE_ARENA_ID, install), scene);
  assert.equal(count, 2);
  const room = dressing.peekRoom();
  const [breath, berm] = room.parts;
  assert.equal(breath.root.name, 'hive_heart');
  assert.equal(berm.root.name, 'hive_heart');
  assert.equal(`#${breath.root.getObjectByName('hive_heart_pod').material.emissive.getHexString()}`, BROOD_HEX);
  assert.equal(`#${berm.root.getObjectByName('hive_heart_pod').material.emissive.getHexString()}`,
    `#${new THREE.Color(WORKS_FURNACE_HEAT.emberHex).getHexString()}`);
  // The berm stands off the lean axis, not on the breath's centre.
  assert.ok(Math.abs(berm.root.position.z - 320) < 1e-6);
});

test('the pheromone cone is a smaller vent on the lane', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  const install = hiveInstall('shutter_lane_close', { across: { x: 0, z: 1 } });
  const cone = install.fields.find((f) => f.kind === 'cone');
  assert.ok(cone, 'lane_close plans a cone');
  dressing.handleInstall(installPayload(HIVE_ARENA_ID, { fields: [cone] }), scene);
  const vent = dressing.peekRoom().parts[0].root;
  assert.equal(vent.name, 'hive_heart');
  assert.equal(vent.position.x, 280, 'stands down the arrival lane');
  // A vent, not a full heart: the vein ring carries the 0.55 scale.
  const vein = vent.getObjectByName('hive_heart_vein');
  assert.ok(Math.abs(vein.scale.x - 11) < 1e-6);
});

test('a heart breathes on the room clock and holds still under reduced motion', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall(installPayload(HIVE_ARENA_ID, hiveInstall('idle')), scene);
  const pod = dressing.peekRoom().parts[0].root.getObjectByName('hive_heart_pod');
  dressing.updateRoom(10, 0, {});
  const swellAt = pod.scale.y;
  dressing.updateRoom(10 + 9 / 4, 0, {}); // a quarter inhale later (~2.25 s of the ~9 s breath)
  assert.notEqual(pod.scale.y, swellAt, 'the clutch swells with the breath');

  dressing.updateRoom(11, 1, { reducedMotion: true, reducedFlash: true });
  const still = pod.scale.y;
  dressing.updateRoom(13, 2, { reducedMotion: true, reducedFlash: true });
  assert.equal(pod.scale.y, still, 'reduced motion holds the breath mid-swell');
  assert.equal(pod.material.emissiveIntensity, 0.8, 'calm flash caps the glow');
});

test('a strength-0 occupancy marker never grows a heart', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  const count = dressing.handleInstall(installPayload(HIVE_ARENA_ID, {
    fields: [{ kind: 'well', center: { x: 0, z: 0 }, radius: 580, strength: 0 }],
  }), scene);
  // The room root still stands (cryo/storm markers dress from roomSpec) — but no organ grows.
  assert.equal(count, 0);
  assert.equal(dressing.peekRoom().parts.length, 0);
});
