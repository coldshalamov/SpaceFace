// Verification-plan step 4: VFX entry harness — ribbon/particle/streak all use procedural trail GLSL.
// VP-220: player + near NPCs use production family plumes; overflow/far ships keep streak substrate.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';
import { FLEET_MAX_SHIPS } from '../src/render/thruster/systems/familyFleet.js';

const scene = new THREE.Scene();
const player = {
  id: 1, type: 'ship', alive: true,
  pos: { x: 0, z: 0 }, vel: { x: 50, z: 0 }, rot: 0, radius: 28,
  data: { defId: 'ship_kestrel' },
};
const npcVector = {
  id: 2, type: 'ship', alive: true,
  pos: { x: 40, z: 0 }, vel: { x: 40, z: 0 }, rot: 0, radius: 14,
  data: { defId: 'ship_wasp' },
};
// Fill the fleet to force at least one near ship onto the legacy streak substrate.
const extras = [];
for (let i = 0; i < FLEET_MAX_SHIPS; i++) {
  extras.push({
    id: 100 + i,
    type: 'ship',
    alive: true,
    pos: { x: 20 + i * 3, z: 5 },
    vel: { x: 25, z: 0 },
    rot: 0,
    radius: 10,
    data: { defId: 'ship_mule' },
    _flightFrame: { throttle: 1 },
  });
}
const entityList = [player, npcVector, ...extras];
const state = {
  playerId: player.id,
  entities: new Map(entityList.map((e) => [e.id, e])),
  entityList,
  settings: { video: { particleQuality: 'high', engineTrails: true } },
  render: { scene },
};
const system = Object.create(vfx);
system.init({ state, bus: { on() { return () => {}; } }, helpers: {} });
player._flightFrame = { throttle: 1 };
npcVector._flightFrame = { throttle: 1 };
for (let f = 0; f < 8; f++) system.update(1 / 60);

assert.equal(system._particleMat.type, 'ShaderMaterial');
assert(system._particleMat.fragmentShader.includes('trailSampleProcedural'));
assert(system._particleMat.uniforms.uTrailTime);
assert(!system._particleMat.uniforms.uTrailMap);

// Dual-family production (stronger than player-only streak ownership).
const fleet = system._energy && system._energy.fleet;
assert(fleet, 'production family fleet must be live');
const ion = fleet.familyPlume('engine_ion_small');
const vector = fleet.familyPlume('engine_vector');
assert(ion && ion.group.visible && ion.pool.activeCount > 0,
  'player ion production plume must be visible under throttle');
assert(vector && vector.group.visible && vector.pool.activeCount > 0,
  'near NPC vector production plume must be live simultaneously');
assert.equal(system._energy.engineProfileId, 'engine_ion_small');
assert.ok(ion.getActiveGeometryStats().vertexCount > 4, 'production geometry must be segmented');

// Overflow ships (beyond FLEET_MAX_SHIPS) retain the procedural streak substrate.
const streak = system._trailStreakPool.mesh.count > 0 ? system._trailStreakPool.mesh : null;
assert(streak, 'fleet overflow ships should keep the procedural streak mesh');
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
  productionFamilies: fleet.families.filter((f) => f.plume.group.visible).length,
  fleetShips: fleet.activeShipCount,
  engineProfileId: system._energy.engineProfileId,
  particleShader: system._particleMat.type,
  streakShader: streak.material.type,
  ribbonProcedural: ribbonChecked,
  segmentedVerts: ion.getActiveGeometryStats().vertexCount,
}));
