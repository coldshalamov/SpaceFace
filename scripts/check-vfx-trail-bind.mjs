// Verification-plan step 4: VFX entry harness — ribbon/particle/streak all use procedural trail GLSL.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

const scene = new THREE.Scene();
const player = {
  id: 1, type: 'ship', alive: true,
  pos: { x: 0, z: 0 }, vel: { x: 50, z: 0 }, rot: 0, radius: 28,
};
const state = {
  playerId: player.id,
  entities: new Map([[player.id, player]]),
  entityList: [player],
  settings: { video: { particleQuality: 'high' } },
  render: { scene },
};
const system = Object.create(vfx);
system.init({ state, bus: { on() { return () => {}; } }, helpers: {} });
player._flightFrame = { throttle: 1 };
for (let f = 0; f < 6; f++) system.update(1 / 60);

assert.equal(system._particleMat.type, 'ShaderMaterial');
assert(system._particleMat.fragmentShader.includes('trailSampleProcedural'));
assert(system._particleMat.uniforms.uTrailTime);
assert(!system._particleMat.uniforms.uTrailMap);

const streak = system._trailStreakPool.mesh.count > 0 ? system._trailStreakPool.mesh : null;
assert(streak, 'streak mesh should be visible under throttle');
assert(streak.isInstancedMesh, 'streak pool should submit one instanced draw');
assert.equal(streak.material.type, 'ShaderMaterial');
assert(streak.material.fragmentShader.includes('trailSampleProcedural'));
assert(streak.material.uniforms.uTrailTime);

let ribbonChecked = false;
for (const [, trail] of system._ribbonTrails || []) {
  const mat = trail.getMaterial();
  assert.equal(mat.type, 'ShaderMaterial');
  assert(mat.fragmentShader.includes('trailSampleProcedural'));
  ribbonChecked = true;
  break;
}
assert(ribbonChecked, 'large ship should create ribbon trail with procedural shader');

const inspect = system.inspect();
console.log('VFX trail bind harness OK', JSON.stringify({
  particles: inspect.trails.trailParticlesSpawned,
  streakMeshes: inspect.trails.trailStreaksSpawned,
  liveTrailStreakMeshes: system._liveTrailStreakCount,
  particleShader: system._particleMat.type,
  streakShader: streak.material.type,
  ribbonProcedural: ribbonChecked,
}));
