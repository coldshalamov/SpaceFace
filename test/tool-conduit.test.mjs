import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx, MINING_BEAM_RELEASE_S } from '../src/render/vfx.js';

function fixture() {
  const system = Object.create(vfx);
  const player = { id: 1, alive: true, pos: { x: 10020, z: -10000 }, radius: 6, rot: 0 };
  const target = { id: 2, alive: true, pos: { x: 10100, z: -10000 }, radius: 10, data: { typeId: 'iron' } };
  system._scene = new THREE.Scene();
  system.state = { settings: { video: {}, accessibility: {} } };
  system.helpers = { player: () => player };
  system._ent = id => id === 2 ? target : player;
  system._spawnLocalXZ = {}; system._entityLocalXZ = {};
  system._frameMembrane = { reset() {}, toLocal(source, out) { out.x = source.x - 10000; out.z = source.z + 10000; return out; } };
  system._c0 = new THREE.Color(); system._c1 = new THREE.Color();
  system._spawnParticle = system._spawnSprite = system._spawnProjectileTrailStreak = () => {};
  system._initMiningBeam();
  return { system, player, target, beam: system._miningBeam };
}

test('moving tool endpoints bind local uniforms without uploading new mesh vertices', () => {
  const { system, beam, target } = fixture();
  const position = beam.mesh.geometry.attributes.position;
  const initialVersion = position.version;
  system._onMiningStart({ targetId: 2, verb: 'extract' });
  system._updateMiningBeam(0.08);
  assert.ok(Math.abs(beam.shaderShared.start.value.x - 24.2) < 1e-8);
  assert.equal(beam.shaderShared.start.value.z, 0);
  assert.deepEqual(beam.shaderShared.end.value.toArray(), [90, 1.5, 0]);
  target.pos.x += 10;
  system._updateMiningBeam(0.016);
  assert.equal(beam.shaderShared.end.value.x, 100);
  assert.equal(position.version, initialVersion);
  assert.ok(position.count > 4);
  assert.equal(system._scene.children.length, 2);
});

test('tool verbs select distinct shapes and transport direction; reduced motion and flash reach both draws', () => {
  const { system, beam } = fixture();
  system.state.settings.video.motionReduce = true;
  system.state.settings.accessibility.flashReduce = true;
  for (const [index, verb] of ['extract', 'cut', 'repair', 'transfer'].entries()) {
    system._onMiningStart({ targetId: 2, verb });
    system._updateMiningBeam(0.1);
    assert.equal(beam.shaderShared.verb.value, index);
    assert.equal(beam.shaderShared.flow.value, index === 0 ? -1 : 1);
    assert.equal(beam.shaderShared.motion.value, 0);
    assert.equal(beam.shaderShared.power.value, 0.58);
    for (const mesh of [beam.mesh, beam.glow]) {
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
      mesh.material.onBeforeCompile(shader);
      assert.equal(shader.uniforms.uSfBeamVerb, beam.shaderShared.verb);
      assert.equal(shader.uniforms.uSfBeamMotion, beam.shaderShared.motion);
      assert.equal(shader.uniforms.uSfBeamPower, beam.shaderShared.power);
    }
  }
});

test('tool shutdown releases briefly, hides both draws and supports a new attack', () => {
  const { system, beam } = fixture();
  system._onMiningStart({ targetId: 2 }); system._updateMiningBeam(0.1);
  system._onMiningStop(); system._updateMiningBeam(MINING_BEAM_RELEASE_S * 0.5);
  assert.equal(beam.active, false); assert.equal(beam.mesh.visible, true);
  assert.equal(beam.shaderShared.power.value, 0.5);
  system.reprojectFrame(-100, 50);
  assert.equal(beam.shaderShared.end.value.x, -10);
  assert.equal(beam.shaderShared.end.value.z, 50);
  system._updateMiningBeam(MINING_BEAM_RELEASE_S);
  assert.equal(beam.mesh.visible, false); assert.equal(beam.glow.visible, false);
  system._onMiningStart({ targetId: 2 });
  assert.equal(beam.attack, 0);
});

test('every supported reduced-flash setting reaches both tool attack and release', () => {
  for (const settings of [
    { video: { flashReduce: true } },
    { accessibility: { flashReduce: true } },
    { accessibility: { reducedFlash: true } },
  ]) {
    const { system, beam } = fixture();
    system.state.settings = settings;
    system._onMiningStart({ targetId: 2, verb: 'repair' });
    system._updateMiningBeam(0.1);
    assert.equal(beam.shaderShared.power.value, 0.58);
    system._onMiningStop();
    system._updateMiningBeam(MINING_BEAM_RELEASE_S * 0.5);
    assert.equal(beam.shaderShared.power.value, 0.29);
  }
});
