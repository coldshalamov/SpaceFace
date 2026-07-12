import assert from 'node:assert/strict';
import * as THREE from 'three';

const surfaces = await import('../src/render/engineTrailSurfaces.js');
const {
  vfx,
  createVfxPrecompileSalvo,
  runProjectileTrailEmissionSelfCheck,
} = await import('../src/render/vfx.js');

const precompileSalvo = createVfxPrecompileSalvo();
const precompileStreak = precompileSalvo.getObjectByName('SF_Precompile_TrailStreak');
assert(precompileStreak instanceof THREE.InstancedMesh,
  'precompile must stage the live instanced streak program, not the obsolete single-mesh material');
assert.equal(precompileStreak.count, 1, 'precompile must expose one initialized instance to the compiler');
assert(precompileStreak.geometry.getAttribute('aTrailColor'),
  'precompile geometry must carry the live per-instance color attribute');
assert(precompileStreak.geometry.getAttribute('aTrailOpacity'),
  'precompile geometry must carry the live per-instance opacity attribute');
assert(precompileStreak.material.vertexShader.includes('instanceMatrix'));

const railDiagnostic = runProjectileTrailEmissionSelfCheck().rail;
assert(railDiagnostic.width < 0.2,
  `rail diagnostics must report the active instance width, got ${railDiagnostic.width}`);
assert(railDiagnostic.length > 3,
  `rail diagnostics must report the active instance length, got ${railDiagnostic.length}`);

const scene = new THREE.Scene();
const pool = surfaces.initTrailStreakPool(scene, 96);

assert.equal(scene.children.length, 1, 'the trail pool must add one render object, not 96 meshes');
assert(pool.mesh instanceof THREE.InstancedMesh, 'the trail pool must own one InstancedMesh');
assert.equal(pool.capacity, 96, 'the instanced trail pool must preserve the 96-streak cap');
assert.equal(pool.mesh.count, 0, 'a new pool must draw no ghost instances');
assert.equal(pool.mesh.frustumCulled, false);
assert.equal(pool.mesh.renderOrder, 11);

const material = pool.mesh.material;
assert.equal(material.type, 'ShaderMaterial');
assert.equal(material.transparent, true);
assert.equal(material.depthWrite, false);
assert.equal(material.depthTest, true);
assert.equal(material.blending, THREE.AdditiveBlending);
assert.equal(material.side, THREE.DoubleSide);
assert(material.fragmentShader.includes('trailSampleProcedural'),
  'instancing must preserve the procedural trail shader math');
assert(material.vertexShader.includes('instanceMatrix'),
  'the trail vertex shader must apply each packed instance transform');
assert(material.vertexShader.includes('aTrailColor'));
assert(material.vertexShader.includes('aTrailOpacity'));
assert.equal(typeof surfaces.updateTrailStreakInstance, 'function');
assert.equal(typeof surfaces.commitTrailStreakInstances, 'function');
assert.equal(typeof surfaces.clearTrailStreakInstances, 'function');

surfaces.updateTrailStreakInstance(pool, 0, {
  x: 12, y: 0, z: -7, vx: 4, vz: 9,
  width: 2.5, length: 14, opacity: 0.72,
  color: { r: 0.1, g: 0.4, b: 0.9 },
});
surfaces.updateTrailStreakInstance(pool, 1, {
  x: -3, y: 1.25, z: 8, vx: -5, vz: 2,
  width: 0.4, length: 6, opacity: 0.33,
  color: { r: 0.8, g: 0.2, b: 0.05 },
});
surfaces.commitTrailStreakInstances(pool, 2, { scroll: 0.31, time: 4.75 });

assert.equal(pool.mesh.count, 2, 'commit must expose exactly the packed live count');
assert.equal(material.uniforms.uTrailScroll.value, 0.31);
assert.equal(material.uniforms.uTrailTime.value, 4.75);
assert.equal(pool.colorAttribute.getX(0), Math.fround(0.1));
assert.equal(pool.colorAttribute.getY(0), Math.fround(0.4));
assert.equal(pool.colorAttribute.getZ(0), Math.fround(0.9));
assert.equal(pool.opacityAttribute.getX(0), Math.fround(0.72));
assert.equal(pool.colorAttribute.getX(1), Math.fround(0.8));
assert.equal(pool.opacityAttribute.getX(1), Math.fround(0.33));

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const rotation = new THREE.Quaternion();
pool.mesh.getMatrixAt(0, matrix);
matrix.decompose(position, rotation, scale);
assert(Math.abs(position.x - 12) < 1e-6 && Math.abs(position.y - 0.4) < 1e-6
  && Math.abs(position.z + 7) < 1e-6, 'zero-y streaks must retain the existing 0.4 lift');
assert(Math.abs(scale.x - 2.5) < 1e-6);
assert(Math.abs(scale.y - 1) < 1e-6);
assert(Math.abs(scale.z - 14) < 1e-6);
const expectedYaw = Math.atan2(9, 4) - Math.PI * 0.5;
const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
assert(Math.abs(Math.atan2(forward.x, forward.z) - expectedYaw) < 1e-6,
  'instance yaw must match the former per-mesh yaw');

for (let i = 2; i < 96; i++) {
  surfaces.updateTrailStreakInstance(pool, i, {
    x: i, y: 0.5, z: -i, vx: 1, vz: 0,
    width: 1, length: 3, opacity: 0.5,
    color: { r: i / 96, g: 0.2, b: 0.3 },
  });
}
surfaces.commitTrailStreakInstances(pool, 96, { scroll: 0.9, time: 9 });
assert.equal(pool.mesh.count, 96, 'the full historical streak cap must remain drawable');
assert.throws(() => surfaces.updateTrailStreakInstance(pool, 96, {
  x: 0, y: 0, z: 0, vx: 0, vz: 0, width: 1, length: 1, opacity: 1,
  color: { r: 1, g: 1, b: 1 },
}), /capacity|index/i, 'writes beyond the fixed cap must fail loudly');
surfaces.clearTrailStreakInstances(pool);
assert.equal(pool.mesh.count, 0, 'clearing must prevent stale slots from rendering as ghosts');

const runtimeScene = new THREE.Scene();
const runtimeState = {
  playerId: 1,
  entities: new Map(),
  entityList: [],
  settings: { video: { particleQuality: 'high' } },
  render: { scene: runtimeScene },
};
const system = Object.create(vfx);
system.init({ state: runtimeState, bus: { on() { return () => {}; } }, helpers: {} });

for (let i = 0; i < 96; i++) {
  system._spawnProjectileTrailStreak(i, 0, -i, 1, 0.2, 5, 0.6,
    i === 0 ? '#123456' : '#88aaff', 10, 0);
}
assert.equal(system._liveTrailStreakCount, 96, 'spawn must preserve all 96 live CPU slots');
assert.equal(system._trailStreakPool.mesh.count, 96, 'spawn must publish the full packed draw count');
assert.equal(runtimeScene.children.filter((child) => child === system._trailStreakPool.mesh).length, 1,
  'the runtime must submit one trail draw object');

system._spawnProjectileTrailStreak(999, 0, 999, 1, 0.3, 7, 0.8, '#ff2200', -3, 2);
assert.equal(system._liveTrailStreakCount, 96, 'spawn at capacity must recycle instead of growing');
assert.equal(system._trailStreakPool.mesh.count, 96, 'recycling must retain a packed 96-instance draw');
assert.equal(system._trailStreakPool.colorAttribute.getX(0), 1,
  'recycling must propagate the replacement color into the reused packed slot');

system._integrateTrailStreaks(2);
assert.equal(system._liveTrailStreakCount, 0, 'expired streaks must all retire');
assert.equal(system._trailStreakPool.mesh.count, 0, 'retirement must leave no ghost instance slots');

const repackScene = new THREE.Scene();
const repackSystem = Object.create(vfx);
repackSystem.init({
  state: { ...runtimeState, render: { scene: repackScene } },
  bus: { on() { return () => {}; } },
  helpers: {},
});
repackSystem._spawnProjectileTrailStreak(10, 0, 20, 1, 0.2, 4, 0.5, '#ff0000', 1, 0);
repackSystem._spawnProjectileTrailStreak(30, 0, 40, 0.01, 0.3, 5, 0.6, '#00ff00', 1, 0);
repackSystem._spawnProjectileTrailStreak(50, 0, 60, 1, 0.4, 6, 0.7, '#0000ff', 1, 0);
repackSystem._integrateTrailStreaks(0.02);
assert.equal(repackSystem._liveTrailStreakCount, 2, 'mid-list expiry must retain both survivors');
assert.equal(repackSystem._trailStreakPool.mesh.count, 2, 'survivors must repack into a dense live draw');
const survivor0 = new THREE.Matrix4();
const survivor1 = new THREE.Matrix4();
repackSystem._trailStreakPool.mesh.getMatrixAt(0, survivor0);
repackSystem._trailStreakPool.mesh.getMatrixAt(1, survivor1);
assert(Math.abs(new THREE.Vector3().setFromMatrixPosition(survivor0).x - 10.02) < 1e-5,
  'the first survivor must remain in packed slot zero');
assert(Math.abs(new THREE.Vector3().setFromMatrixPosition(survivor1).x - 50.02) < 1e-5,
  'the last survivor must move into the retired middle slot');
assert.equal(repackSystem._trailStreakPool.colorAttribute.getX(0), 1);
assert.equal(repackSystem._trailStreakPool.colorAttribute.getZ(1), 1,
  'survivor repacking must carry the moved instance color with its transform');

const materialSet = new Set([system._trailStreakPool.mesh.material]);
assert.equal(materialSet.size, 1, 'all streaks must share one material');

console.log('trail-streak-instancing: spawn, recycle, cap, packing, attributes, and retirement PASS');
