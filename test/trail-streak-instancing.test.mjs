import assert from 'node:assert/strict';
import * as THREE from 'three';
import { findLinkedProgramActiveAttributes } from '../scripts/lib/webglProgramEvidence.mjs';

const surfaces = await import('../src/render/engineTrailSurfaces.js');
const {
  vfx,
  createVfxPrecompileSalvo,
  runProjectileTrailEmissionSelfCheck,
} = await import('../src/render/vfx.js');

{
  const linkedTrailProgram = { id: 'trail' };
  const unrelatedProgram = { id: 'unrelated' };
  const attributesByProgram = new Map([
    [unrelatedProgram, ['position']],
    [linkedTrailProgram, ['instanceMatrix', 'position', 'aTrailColor', 'aTrailOpacity']],
  ]);
  const fakeGl = {
    ACTIVE_ATTRIBUTES: 0x8B89,
    getProgramParameter(program) {
      return attributesByProgram.get(program)?.length || 0;
    },
    getActiveAttrib(program, index) {
      const name = attributesByProgram.get(program)?.[index];
      return name ? { name } : null;
    },
  };
  assert.deepEqual(
    findLinkedProgramActiveAttributes(
      fakeGl,
      [{ program: unrelatedProgram }, { program: linkedTrailProgram }],
      ['instanceMatrix', 'aTrailColor', 'aTrailOpacity'],
    ),
    attributesByProgram.get(linkedTrailProgram),
    'linked-program evidence must survive a missing transient material.currentProgram pointer',
  );

  const cachedAttributes = {
    instanceMatrix: { location: 4 },
    position: { location: 0 },
    aTrailColor: { location: 8 },
    aTrailOpacity: { location: 9 },
  };
  assert.deepEqual(
    findLinkedProgramActiveAttributes(
      fakeGl,
      [{ program: { id: 'late-empty-handle' }, getAttributes: () => cachedAttributes }],
      ['instanceMatrix', 'aTrailColor', 'aTrailOpacity'],
    ),
    Object.keys(cachedAttributes),
    'linked-program evidence must prefer Three cached attributes when a later raw query is empty',
  );
}

const precompileSalvo = createVfxPrecompileSalvo();
const precompileRibbon = precompileSalvo.getObjectByName('SF_Precompile_RibbonTrail');
const liveRibbonScene = new THREE.Scene();
const liveRibbon = surfaces.createRibbonTrail(liveRibbonScene, '#7fe0ff', 30, 5).getMesh();
assert.deepEqual(Object.keys(precompileRibbon.geometry.attributes), Object.keys(liveRibbon.geometry.attributes),
  'precompile ribbon must carry the exact live position/aTrailUv geometry contract');

const uploadRibbonScene = new THREE.Scene();
const uploadRibbon = surfaces.createRibbonTrail(uploadRibbonScene, '#7fe0ff', 4, 2);
uploadRibbon.push(0, 0, 0);
uploadRibbon.push(3, -2, Math.PI * 0.25);
uploadRibbon.rebuild(0.8, 0.1, 1);
const uploadRibbonMesh = uploadRibbon.getMesh();
const positionVersionAtTwoSamples = uploadRibbonMesh.geometry.attributes.position.version;
const uvVersionAtTwoSamples = uploadRibbonMesh.geometry.attributes.aTrailUv.version;
const uvAtTwoSamples = Array.from(uploadRibbonMesh.geometry.attributes.aTrailUv.array);
uploadRibbon.rebuild(0.7, 0.2, 2);
assert.equal(uploadRibbonMesh.geometry.attributes.position.version, positionVersionAtTwoSamples + 1,
  'a live ribbon rebuild must continue publishing its moving positions');
assert.equal(uploadRibbonMesh.geometry.attributes.aTrailUv.version, uvVersionAtTwoSamples,
  'a stable ribbon sample count must not republish identical UV coordinates');
assert.deepEqual(Array.from(uploadRibbonMesh.geometry.attributes.aTrailUv.array), uvAtTwoSamples,
  'skipping the redundant UV upload must preserve the exact ribbon coordinates');
uploadRibbon.push(7, 1, Math.PI * 0.5);
uploadRibbon.rebuild(0.6, 0.3, 3);
assert.equal(uploadRibbonMesh.geometry.drawRange.count, 12,
  'three live ribbon points must draw exactly two quads, not the uninitialized capacity tail');

// The production continuity seam keeps the current nozzle outside the cadence-sampled history.
// A long display-frame displacement is filled by bounded typed-array history, while replacement,
// teleport, and explicit boundary resets reseed rather than drawing a screen-crossing bridge.
const continuityScene = new THREE.Scene();
const continuity = surfaces.createRibbonTrail(continuityScene, '#39d0ff', 10, 2);
const continuityMesh = continuity.getMesh();
const positionsIdentity = continuityMesh.geometry.attributes.position.array;
const uvsIdentity = continuityMesh.geometry.attributes.aTrailUv.array;
const ownerA = { id: 77 };
const ownerB = { id: 77 };
continuity.follow(0, 0, 0, 1 / 60, ownerA, 3, 160, 1 / 30);
continuity.rebuild(0.8, 0.1, 1, 1.6);
assert.equal(continuityMesh.visible, false, 'a seed pose must not draw a degenerate card');
continuity.follow(20, 0, 0, 1 / 30, ownerA, 3, 160, 1 / 30);
continuity.rebuild(0.8, 0.2, 2, 1.6);
const filled = continuity.inspect();
assert.ok(filled.visiblePointCount >= 6,
  `a 20 WU gap should be filled by bounded history, got ${filled.visiblePointCount} points`);
assert.ok(filled.visiblePointCount <= surfaces.RIBBON_TRAIL_INTERPOLATION_CAP + 1,
  'one delayed frame must never exceed the interpolation cap plus its live head');
assert.equal(continuityMesh.visible, true);
assert.equal(continuityMesh.geometry.drawRange.count, (filled.visiblePointCount - 1) * 6);
assert.equal(continuityMesh.geometry.attributes.position.updateRanges[0].count,
  filled.visiblePointCount * 6,
  'a full history rebuild must upload only its written position components');
assert.equal(continuityMesh.geometry.attributes.aTrailUv.updateRanges[0].count,
  filled.visiblePointCount * 4,
  'a changed history count must upload only its written UV components');
const continuityPos = continuityMesh.geometry.attributes.position.array;
const headCenterX = (continuityPos[0] + continuityPos[3]) * 0.5;
assert.ok(Math.abs(headCenterX - 20) < 1e-6,
  `the rendered ribbon head must match the current nozzle, got ${headCenterX}`);
assert.strictEqual(continuityMesh.geometry.attributes.position.array, positionsIdentity,
  'continuity updates must retain the fixed position buffer');
assert.strictEqual(continuityMesh.geometry.attributes.aTrailUv.array, uvsIdentity,
  'continuity updates must retain the fixed UV buffer');

const rebuildsBeforeHeadSync = continuity.inspect().fullRebuildCount;
continuity.follow(24, 1, 0.05, 1 / 60, ownerA, 3, 160, 1 / 30);
assert.equal(continuity.syncHead(0.7, 0.25, 2.5, 1.5), true,
  'a cadence-reduced frame must update its live nozzle pair without rebuilding history');
const headSynced = continuity.inspect();
const syncedPositions = continuityMesh.geometry.attributes.position.array;
const syncedHeadX = (syncedPositions[0] + syncedPositions[3]) * 0.5;
const syncedHeadZ = (syncedPositions[2] + syncedPositions[5]) * 0.5;
assert.ok(Math.abs(syncedHeadX - 24) < 1e-6 && Math.abs(syncedHeadZ - 1) < 1e-6,
  `cadence-reduced head must stay socket-bound, got (${syncedHeadX}, ${syncedHeadZ})`);
assert.equal(headSynced.fullRebuildCount, rebuildsBeforeHeadSync,
  'head sync must not perform an O(history) geometry rebuild');
assert.equal(headSynced.headSyncCount, 1);
const headUpdateRange = continuityMesh.geometry.attributes.position.updateRanges[0];
assert.equal(headUpdateRange.start, 0);
assert.equal(headUpdateRange.count, 6,
  'cadence-reduced nozzle sync must upload only its two XYZ head vertices');
assert.equal(headUpdateRange.count * positionsIdentity.BYTES_PER_ELEMENT, 24,
  'cadence-reduced nozzle upload must remain exactly 24 bytes');
assert.ok(headUpdateRange.count * positionsIdentity.BYTES_PER_ELEMENT < positionsIdentity.byteLength,
  'head sync must not upload the full pooled position buffer');
assert.strictEqual(continuityMesh.geometry.attributes.position.array, positionsIdentity,
  'head sync must retain the pooled position buffer');

continuity.follow(21, 0, 0, 1 / 60, ownerB, 3, 160, 1 / 30);
continuity.rebuild(0.8, 0.3, 3, 1.6);
assert.equal(continuity.inspect().visiblePointCount, 1,
  'an entity object replacement reusing the same id must not inherit the old wake');
assert.equal(continuityMesh.visible, false);
continuity.follow(500, 0, 0, 1 / 60, ownerB, 3, 160, 1 / 30);
continuity.rebuild(0.8, 0.4, 4, 1.6);
assert.equal(continuity.inspect().visiblePointCount, 1,
  'a teleport/discontinuity must reseed instead of bridging the gap');
continuity.clear();
assert.equal(continuityMesh.visible, false, 'explicit sector/save/origin reset must hide history');
assert.equal(continuityMesh.geometry.drawRange.count, 0);
assert.equal(uploadRibbonMesh.geometry.attributes.aTrailUv.version, uvVersionAtTwoSamples + 1,
  'a changed ribbon sample count must republish its new taper coordinates');
uploadRibbon.dispose();

const precompileStreak = precompileSalvo.getObjectByName('SF_Precompile_TrailStreak');
assert(precompileStreak instanceof THREE.InstancedMesh,
  'precompile must stage the live instanced streak program, not the obsolete single-mesh material');
assert.equal(precompileStreak.count, 1, 'precompile must expose one initialized instance to the compiler');
assert(precompileStreak.geometry.getAttribute('aTrailColor'),
  'precompile geometry must carry the live per-instance color attribute');
assert(precompileStreak.geometry.getAttribute('aTrailOpacity'),
  'precompile geometry must carry the live per-instance opacity attribute');
assert(precompileStreak.material.vertexShader.includes('instanceMatrix'));

const precompileSeams = precompileSalvo.getObjectByName('SF_Precompile_SeamMarkers');
assert(precompileSeams instanceof THREE.InstancedMesh,
  'precompile must stage the seam-marker instanced program before a nearby asteroid wakes it');
assert.equal(precompileSeams.count, 1,
  'precompile must expose one seam-marker instance to the driver compiler');
const seamSystem = Object.create(vfx);
seamSystem._scene = new THREE.Scene();
seamSystem._initSeamMarkers();
const liveSeams = seamSystem._seamMarkers.mesh;
assert.deepEqual(Object.keys(precompileSeams.geometry.attributes), Object.keys(liveSeams.geometry.attributes));
assert.equal(precompileSeams.geometry.index.count, liveSeams.geometry.index.count);
assert.equal(precompileSeams.instanceColor.itemSize, liveSeams.instanceColor.itemSize);
for (const property of [
  'type', 'transparent', 'opacity', 'depthWrite', 'blending', 'side', 'forceSinglePass',
]) assert.equal(precompileSeams.material[property], liveSeams.material[property], property);

const railDiagnostic = runProjectileTrailEmissionSelfCheck().rail;
assert.equal(railDiagnostic.mode, 'energy-card');
assert(railDiagnostic.width < 1.2,
  `rail diagnostics must report the energy-card width, got ${railDiagnostic.width}`);
assert(railDiagnostic.length > 12,
  `rail diagnostics must report the energy-card length, got ${railDiagnostic.length}`);

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

const trailShip = {
  id: 2,
  type: 'ship',
  alive: true,
  pos: { x: 24, z: 8 },
  vel: { x: 60, z: 0 },
  rot: 0,
  radius: 10,
  maxSpeed: 120,
  flags: {},
  data: {},
};
const bookkeepingScene = new THREE.Scene();
const bookkeepingState = {
  playerId: 1,
  entities: new Map([[trailShip.id, trailShip]]),
  entityList: [trailShip],
  settings: { video: { particleQuality: 'high' } },
  render: { scene: bookkeepingScene },
};
const bookkeepingSystem = Object.create(vfx);
bookkeepingSystem.init({
  state: bookkeepingState,
  bus: { on() { return () => {}; } },
  helpers: {},
});
const trailDiagIdentity = bookkeepingSystem._trailBudgetDiag;
const trailSpawnRecords = [];
const recordTrailBudget = bookkeepingSystem._recordTrailBudget;
bookkeepingSystem._recordTrailBudget = function recordTrailBudgetIdentity(tier, spawned) {
  trailSpawnRecords.push(spawned);
  return recordTrailBudget.call(this, tier, spawned);
};
bookkeepingSystem._emitTrails(0.016);
const firstTrailDiag = { ...bookkeepingSystem._trailBudgetDiag };
bookkeepingSystem._emitTrails(0.016);

assert.strictEqual(bookkeepingSystem._trailBudgetDiag, trailDiagIdentity,
  'trail diagnostics must reset in place instead of allocating one record per render tick');
assert.equal(trailSpawnRecords.length, 2, 'the moving legacy ship must emit on both trail ticks');
assert.strictEqual(trailSpawnRecords[0], trailSpawnRecords[1],
  'engine-trail spawn counts must reuse one VFX-owned result record');
assert.deepEqual(bookkeepingSystem._trailBudgetDiag, firstTrailDiag,
  'retained trail bookkeeping must reset rather than accumulate between identical ticks');

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
