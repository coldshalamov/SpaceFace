import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSplitterPackage } from './lib/splitterCompiledPackage.mjs';
import { composeBroodMaterialForProbe } from '../src/render/partsLibrary.js';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
import { createBroodResidentCellOwner } from '../src/render/broodResidentCells.js';
import { createLodState } from '../src/render/lod.js';
import { createBroodPartitionLodOwner } from '../src/render/broodPartitionLod.js';
import { render as renderSystem } from '../src/render/renderer.js';

// The immutable lifecycle proof closure may be supplied alongside the newer renderer overlay.
// In an eventual composed repository this defaults to the normal repository root.
const lifecycleRoot = process.env.BROOD_LIFECYCLE_PROOF_ROOT
  ? pathToFileURL(path.resolve(process.env.BROOD_LIFECYCLE_PROOF_ROOT) + '/')
  : new URL('../', import.meta.url);
const fromLifecycle = file => import(new URL(file, lifecycleRoot));
const { bootRealPath } = await fromLifecycle('scripts/lib/bench/realPath.mjs');
const { spawnBudget } = await fromLifecycle('src/systems/spawnBudget.js');
const { survivalWave } = await fromLifecycle('src/systems/survivalWave.js');
const { combat, makeEnemySpawnSpec } = await fromLifecycle('src/systems/combat.js');
const { createRunState } = await fromLifecycle('src/core/runState.js');
const { scalarHitToDamagePacket } = await fromLifecycle('src/combat/damage.js');

test('real native lethal receipt transfers the already-drawn parent into three visible children before the next frame', async () => {
  const h = await bootRealPath({ seed: 927, systems: [spawnBudget, 'actions', survivalWave, 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: { x: 0, z: 0 } }] });
  const residency = createAssetResidencyRegistry({ now: () => 0 });
  const pkg = await loadSplitterPackage('brood-splitter', residency);
  let owner;
  try {
    h.state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 927 }), phase: 'active', wave: 17, arenaId: 'helios_core' };
    h.state.world.currentSectorId = null;
    const budget = h.runtime.getSystem('spawnBudget').api; budget.setMax(40);
    h.bus.emit('run:wavePlanned', { wave: 17, plan: { ok: true,
      schedule: [{ ownerId: 'survival-wave:17', enemyId: 'brood_splitter', level: 1,
        count: 1, gateGroup: 'front', atTick: 0, seed: 927, wave: 17, packageIndex: 0,
        batchIndex: 0, role: 'pressure', swarm: true, debut: true }],
      swarm: { killTarget: 4, concurrent: 3, roster: [{ enemyId: 'wasp_swarmer', role: 'mass', weight: 10, fromWave: 1 }] },
      completionRules: { blockingRoles: ['pressure'] } } });
    h.bus.emit('run:waveStarted', { wave: 17 });
    const wave = h.runtime.getSystem('survivalWave'), parent = [...wave._cohort.values()][0].entity;
    h.step(1);
    const built = composeBroodMaterialForProbe(pkg.record, { entity: parent });
    const { root, owner: boundary, scene } = built;
    boundary.position.set(parent.pos.x, 0, parent.pos.z); boundary.rotation.y = -parent.rot;
    boundary.userData.broodResidentLife = parent.occupantGeneration;
    boundary.userData.lod = createLodState(); boundary.userData.lod.adopt('lod2', 8);
    root.userData.updateLod('lod2'); scene.updateMatrixWorld(true);
    const matrices = new Map(); root.traverse(n => { if (n.isMesh && n.userData.spacefaceTags?.broodCell) matrices.set(n, n.matrixWorld.clone()); });
    const meshes = new Map([[parent, boundary]]);
    const retire = object => { object.removeFromParent(); object.userData.releaseAuthoredAssetResidency?.('real-death-end'); residency.releaseOwner(object, 'real-death-end'); };
    owner = createBroodResidentCellOwner({ state: h.state, residency, lookupMesh: e => meshes.get(e),
      ready: () => true, toLocal: p => p,
      bind(e, r) { meshes.set(e, r); scene.add(r); return true; },
      unbind(e, r) { if (meshes.get(e) === r) meshes.delete(e); r.removeFromParent(); }, retire });
    const lodOwner = createBroodPartitionLodOwner();
    boundary.userData.authoredVisualRoot = 'authored-root';
    lodOwner.resolve(parent, boundary.userData, 8);
    let prepared = false, receipt;
    h.bus.on('brood:partitioned', payload => { receipt = payload; lodOwner.handoff(payload); prepared = owner.prepare(payload); });
    let observedChildrenAtKill = -1;
    h.bus.on('entity:killed', payload => { if (payload.id === parent.id) observedChildrenAtKill = wave._cohort.size; });
    const damage = h.withFeatures(() => h.runtime.getSystem('combat').ensureKernel().routeDamage({
      attackerId: h.player.id, targetId: parent.id,
      packet: scalarHitToDamagePacket({ damage: 36, damageType: 'kinetic' }), origin: { kind: 'weapon', id: 'real-connected-death' } }));
    assert.ok(damage.ok && prepared);
    assert.equal(receipt.children.length, 3); assert.equal(observedChildrenAtKill, 3);
    assert.equal(budget.current(), 3); assert.equal(wave._cleared, false);
    retire(boundary); meshes.delete(parent);
    let published = false, firstFrameVisited = false;
    const presentation = {
      state: h.state, scene, _broodResidentCells: owner,
      _presentationPublisher: { consume() { published = true; return { rebuilt: false }; } },
      _bindPublishedPresentationMeshes() {},
      syncEntityViews() {
        assert.ok(published, 'completed-tick publication precedes child binding');
        assert.ok(receipt.children.every(child => meshes.has(child)), 'all children exist before the renderer visits its first frame');
        firstFrameVisited = true;
      },
      _syncAuthoredInstanceSubmission() {}, _syncShadowMapEnabled() {},
      _syncKeyLightShadowFrustum: () => false, _updateShadowFollow: () => false,
      _syncAsteroidInstanceSubmission() {},
    };
    assert.equal(renderSystem._publishOpeningFirstPicture.call(presentation), true);
    assert.ok(firstFrameVisited);
    assert.equal(owner.pendingCount(), 0);
    scene.updateMatrixWorld(true);
    for (const [node, matrix] of matrices) assert.ok(node.matrixWorld.elements.every((v, i) => Math.abs(v - matrix.elements[i]) < 2e-5), node.name);
    for (const child of receipt.children) {
      const mesh = meshes.get(child), visible = [];
      assert.equal(mesh.userData.residentMaterialSource.childLife, child.occupantGeneration);
      assert.equal(lodOwner.resolve(child, mesh.userData, 1000), 'lod2', 'birth frame keeps parent tier despite the child projected size');
      mesh.traverseVisible(n => { if (n.isMesh) visible.push(n); });
      assert.ok(visible.length && visible.every(n => n.userData.spacefaceTags.lod === 'lod2'));
      assert.ok(visible.every(n => n.userData.spacefaceTags.broodCell === child.data.broodBodyId));
      assert.notEqual(lodOwner.resolve(child, mesh.userData, 1000), 'lod2', 'later frames return to normal child LOD selection');
      retire(mesh);
    }
    assert.equal(pkg.decodeCount(), 1);
    assert.equal(owner.prepare(receipt), false, 'duplicate real partition receipt cannot transfer again');
  } finally { owner?.reset(); pkg.loader.dispose(); h.dispose(); }
});

test('real unreserved parent fallback keeps the whole resident material and exact corpse life receipt', async () => {
  const h = await bootRealPath({ seed: 927, systems: [spawnBudget, 'actions', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: { x: 0, z: 0 } }] });
  const residency = createAssetResidencyRegistry({ now: () => 0 });
  const pkg = await loadSplitterPackage('brood-splitter', residency);
  let owner;
  try {
    const parent = h.runtime.spawn(makeEnemySpawnSpec('brood_splitter', 1, { x: 90, z: 0 }));
    h.step(1);
    const built = composeBroodMaterialForProbe(pkg.record, { entity: parent });
    const { root, owner: boundary, scene } = built;
    boundary.position.set(parent.pos.x, 0, parent.pos.z); boundary.rotation.y = -parent.rot;
    boundary.userData.broodResidentLife = parent.occupantGeneration;
    boundary.userData.lod = createLodState(); boundary.userData.lod.adopt('lod2', 8);
    root.userData.updateLod('lod2'); scene.updateMatrixWorld(true);
    const before = new Map(); root.traverse(n => { if (n.isMesh && n.userData.spacefaceTags?.broodCell) before.set(n, n.matrixWorld.clone()); });
    const meshes = new Map([[parent, boundary]]);
    const retire = object => { object.removeFromParent(); object.userData.releaseAuthoredAssetResidency?.('fallback-end'); residency.releaseOwner(object, 'fallback-end'); };
    owner = createBroodResidentCellOwner({ state: h.state, residency, lookupMesh: e => meshes.get(e),
      ready: () => true, toLocal: p => p,
      bind(e, r) { meshes.set(e, r); scene.add(r); return true; },
      unbind(e, r) { meshes.delete(e); r.removeFromParent(); }, retire });
    let receipt, prepared = false;
    h.bus.on('brood:partitionFailed', payload => { receipt = payload; prepared = owner.prepare(payload); });
    const result = h.withFeatures(() => h.runtime.getSystem('combat').ensureKernel().routeDamage({
      attackerId: h.player.id, targetId: parent.id,
      packet: scalarHitToDamagePacket({ damage: 36, damageType: 'kinetic' }), origin: { kind: 'weapon', id: 'real-fallback' } }));
    assert.ok(result.ok && prepared);
    assert.equal(receipt.corpse.physicsBody.mass, 42);
    assert.deepEqual(receipt.corpse.data.splitterCorpse, { sourceId: parent.id, sourceLife: parent.occupantGeneration });
    assert.equal(receipt.cancelled, 0);
    retire(boundary); meshes.delete(parent);
    assert.equal(owner.flush(), 1); scene.updateMatrixWorld(true);
    for (const [node, matrix] of before) assert.ok(node.matrixWorld.elements.every((v, i) => Math.abs(v - matrix.elements[i]) < 2e-5));
    const corpseMesh = meshes.get(receipt.corpse), visible = [];
    corpseMesh.traverseVisible(n => { if (n.isMesh) visible.push(n); });
    assert.equal(new Set(visible.map(n => n.userData.spacefaceTags.broodCell)).size, 3);
    assert.ok(visible.every(n => n.userData.spacefaceTags.lod === 'lod2'));
    assert.equal(pkg.decodeCount(), 1); assert.equal(owner.prepare(receipt), false);
    retire(corpseMesh);
  } finally { owner?.reset(); pkg.loader.dispose(); h.dispose(); }
});
