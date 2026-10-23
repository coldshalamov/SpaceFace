import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TITLE_ATTRACT_TAPE } from '../src/sim/titleAttractTapeData.js';
import { decodeTape } from '../src/sim/titleAttractTape.js';
import { buildTitleAttractStage, attractPlaybackTape } from '../src/render/titleAttractStage.js';
import { createReplayWeaponStage } from '../src/render/replayWeaponStage.js';
import { resolveWeaponRecipe } from '../src/render/weapons/recipes.js';

test('each 15-second chapter records catch, a real swing, release, measured collision and a field', () => {
  const tape = decodeTape(TITLE_ATTRACT_TAPE);
  assert.equal(tape.schema, 'spaceface.titleAttractTape.v2');
  assert.equal(tape.seconds, 60);
  assert.equal(tape.scenario, 'title.catch-swing-release-impact');
  for (let chapter = 0; chapter < 4; chapter++) {
    const lo = chapter * 900, events = tape.events.filter((e) => e.tick >= lo && e.tick < lo + 900);
    assert.deepEqual(events.map((e) => e.kind), ['catch', 'release', 'impact', 'field']);
    assert.ok(events[2].tick - lo < 1200, 'the complete throw occurs within twenty seconds');
    assert.ok(events[2].deltaV > 30, 'the solver changed the thrown hull velocity at contact');
    assert.equal(tape.forces[Math.floor((lo + 20) / 2)].lines.length, 0);
    const early = tape.forces[Math.floor((lo + 60) / 2)].lines[0];
    const late = tape.forces[Math.floor((lo + 240) / 2)].lines[0];
    assert.ok(early && late);
    assert.ok(Math.abs(Math.atan2(late.bz - late.az, late.bx - late.ax)
      - Math.atan2(early.bz - early.az, early.bx - early.ax)) > 1.2, 'swing exceeds a radian');
    assert.equal(tape.forces[Math.floor((lo + 300) / 2)].lines.length, 0);
    assert.ok(tape.forces.slice((lo + 570) / 2, (lo + 650) / 2).some((f) => f.fields.length));
  }
  assert.ok(tape.shots.weapons.every(Boolean), 'actual weapon identity survives the packed tape');
  assert.equal(attractPlaybackTape().ships.length, 20, 'recycled sim ids are separate recorded lives');
});

test('title uses the shared rope renderer and caps reduced flashes in the same stage as kill-cam', async () => {
  const geometry = new THREE.BoxGeometry(6, 2, 4), material = new THREE.MeshStandardMaterial();
  const io = { async loadPart() { return { primitives: [{ name: 'hull', geometry, material, matrix: new THREE.Matrix4() }] }; } };
  const built = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(42, 16 / 9), clock: 20 };
  const stage = await buildTitleAttractStage(built, io);
  try {
    assert.equal(stage.ready, true);
    stage.update(built, 1 / 60, { settings: {} });
    built.clock = 22;
    stage.update(built, 1 / 60, { settings: {} });
    const cables = stage.roots[0].getObjectByName('SF_NpcMasslineCables');
    assert.ok(cables.children.some((child) => child.visible));
    built.clock = 20 + 477 / 60 + 0.12;
    stage.update(built, 1 / 60, { settings: { video: { flashReduce: true } } });
    const flashes = stage.roots[0].getObjectByName('UiStageKillcamFlashes');
    assert.ok(flashes.count > 0);
    assert.ok(flashes.material.opacity <= 0.27 + 1e-9, 'reduced peak opacity is capped');
    built.clock = 20 + 477 / 60 + 0.25;
    stage.update(built, 1 / 60, { settings: { video: { flashReduce: true } } });
    assert.equal(flashes.count, 0, 'reduced flash is gone within 240 ms');
    built.clock = 82;
    stage.update(built, 1 / 60, { settings: {} });
    assert.ok(cables.children.some((child) => child.visible), 'loop wrap restores the first catch');
  } finally { stage.dispose(); geometry.dispose(); material.dispose(); }
});

test('replay bolts submit the production weapon-family variant and disable reduced-flash flicker', () => {
  const stage = createReplayWeaponStage(new THREE.Group());
  try {
    const camera = new THREE.PerspectiveCamera(42, 16 / 9);
    stage.begin(camera, 1 / 60, { video: { flashReduce: true } });
    stage.write(1, 'wpn_pulse_s', 0, 10, 20, 80, 0, 1 / 60);
    stage.end();
    assert.equal(stage.pool.size.getW(0), resolveWeaponRecipe('wpn_pulse_s').flight.boltVariant);
    assert.equal(stage.pool.material.uniforms.uBoltFlicker.value, 0);
  } finally { stage.dispose(); }
});
