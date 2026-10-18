import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { materializeAlienEcology } from '../src/systems/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { targetDisplayName } from '../src/ui/targetPanel.js';
import * as THREE from 'three';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { livingHullWithScar } from '../src/core/livingHull.js';
import { render, disposeRendererOwnedResources } from '../src/render/renderer.js';
import { createRenderEntityFrame } from '../src/render/renderEntityFrame.js';
import { createPersistentSubmitLanes } from '../src/render/persistentSubmitLanes.js';

async function workerLane(t) {
  const scenarioContract = JSON.parse(readFileSync(
    new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
  ));
  const worker = createSimHost();
  let deliver;
  let pendingTick;
  const channelFactory = () => ({
    post(message) {
      if (message.kind === 'shutdown') return worker.shutdown();
      const operation = message.kind === 'init'
        ? worker.init({ ...message, scenarioContract }) : worker.tick(message);
      Promise.resolve(operation).then((reply) => {
        const envelope = structuredClone({
          kind: message.kind === 'init' ? 'ready' : 'tickDone', seq: message.seq, ...reply,
        });
        deliver(envelope);
        if (message.kind === 'tick' && message.steps > 0 && pendingTick) {
          const pending = pendingTick;
          pendingTick = null;
          pending.resolve(envelope);
        }
      }, (error) => {
        deliver({ kind: 'error', seq: message.seq, message: String(error?.message || error) });
        if (pendingTick) {
          const pending = pendingTick;
          pendingTick = null;
          pending.reject(error);
        }
      });
    },
    onMessage(callback) { deliver = callback; },
    terminate() { worker.shutdown(); },
  });
  const state = createGameState(4242);
  const lane = createSimLaneRuntime({
    state, registry: {}, bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false }, channelFactory,
  });
  t.after(() => { lane.close(); worker.shutdown(); });
  await lane.readyPromise;
  return {
    state, worker, lane,
    tick: () => new Promise((resolve, reject) => {
      pendingTick = { resolve, reject };
      lane.runner.stepOnce();
    }),
  };
}

test('resident fauna target names and sail disguises follow revelation through cloned worker vitals', async (t) => {
  const { state, worker, lane, tick } = await workerLane(t);
  const nativeState = worker.host.state;
  const world = worker.host.registry.get('world');
  const site = ALIEN_SITES.towed_moonlet;
  nativeState.world.currentSectorId = site.sectorId;
  materializeAlienEcology(world, { id: site.sectorId }, { dressing: [], pois: [] }, [site]);
  ensureAlienEcologyState(nativeState).sites[site.siteId].state = 'awake';
  const natives = nativeState.entityList.filter((e) => e.type === 'fauna' && e.data.siteId === site.siteId);
  const sail = natives.find((e) => e.data.ecology.speciesId === 'black_sail');
  const fauna = natives.find((e) => !e.data.ecology.disguised);
  assert.ok(sail && fauna, 'the production ecology materializer casts a sail and ordinary fauna');
  await tick();
  const target = state.entities.get(fauna.id);
  const sailTarget = state.entities.get(sail.id);
  assert.notEqual(target.data, fauna.data, 'target names consume structured-cloned entities');
  assert.equal(targetDisplayName(target), targetDisplayName(fauna));
  assert.equal(targetDisplayName(sailTarget), 'debris');
  const initialName = targetDisplayName(target);
  const generation = lane.journal.getRebuildGeneration();

  worker.host.bus.emit('scan:completed', { sectorId: site.sectorId, found: true });
  assert.notEqual(fauna.data.name, initialName, 'the registered world scan raises the reveal ladder');
  await tick();
  assert.equal(targetDisplayName(target), targetDisplayName(fauna),
    'an already received contact must show its newly revealed target name');
  assert.equal(target.data.scanLabel, fauna.data.scanLabel);
  assert.equal(targetDisplayName(sailTarget), 'debris', 'sector scans leave the untargeted sail disguised');

  worker.host.bus.emit('scan:completed', { targetId: sail.id, sectorId: site.sectorId, found: true });
  assert.equal(sail.data.ecology.disguised, false, 'the registered scan owner reveals the targeted sail');
  await tick();
  assert.equal(targetDisplayName(sailTarget), targetDisplayName(sail), 'targeted scanning replaces the resident debris name');
  assert.equal(sailTarget.data.scanLabel, sail.data.scanLabel);
  assert.equal(sailTarget.data.scannerSignalKind, 'anomaly');
  assert.equal(sailTarget.data.ecology.disguised, false, 'the renderer receives the broadside disguise flag');
  assert.equal(state.entities.get(sail.id), sailTarget, 'revealing keeps the resident facade');

  worker.host.bus.emit('alienEcology:blackBoxRecovered', { siteId: site.siteId });
  await tick();
  assert.equal(target.data.name, FAUNA_SPECIES[fauna.data.ecology.speciesId].name,
    'species-level revelation reaches the same target');
  assert.equal(sailTarget.data.name, FAUNA_SPECIES.black_sail.name);
  assert.equal(targetDisplayName(target), targetDisplayName(fauna));
  assert.equal(targetDisplayName(sailTarget), targetDisplayName(sail));
  assert.equal(lane.journal.getRebuildGeneration(), generation, 'label changes use vitals without rematerialization');
  const steady = await tick();
  assert.ok(!steady.entityVitals.some(([id]) => id === sail.id || id === fauna.id),
    'unchanged public labels do not send another vitals row');
});

function residentRival(state, entity) {
  const mesh = new THREE.Group();
  const scene = new THREE.Scene();
  mesh.userData.authoredAssetState = 'authored';
  scene.add(mesh);
  const world = {
    handleForEntityId: (id) => ({ id }), bindMesh: () => true, unbindMesh: () => true,
    alive: [1], slotGenerations: [1], meshRefs: [mesh], entityIds: [entity.id],
    flags: [0], entityRefs: [entity], dirtyMasks: [0], radii: [entity.radius], boundCount: 1,
    refreshVisibleEntity() {}, clearDirty() {}, poseHasDelta: () => false,
  };
  state.render = {};
  const view = Object.assign(Object.create(render), {
    state, scene, _meshes: new Map([[entity.id, mesh]]),
    _frameMembrane: { toLocal: (pos) => pos, origin: { x: 0, z: 0 } },
    _presentationWorld: world, _presentationQueryOptions: {},
    _presentationQueries: { query: () => ({ visibleCount: 1, visibleSlots: [0], visibleGenerations: [1],
      hiddenCount: 0, candidateCount: 1, culledCount: 0 }) },
    _entityViewCullBounds: () => ({ x: 0, z: 0, halfX: 10000, halfZ: 10000 }),
    _hasCompletedPresentationPose: () => true, _syncShadowCasterPolicyChecked: () => null,
    _entityFrame: createRenderEntityFrame(), _persistentSubmitLanes: createPersistentSubmitLanes(),
    _entityViewDiagnostics: {}, _hlodDiagnostics: {}, viewport: { width: 1280, height: 720 },
    _presentationFrameDt: 0,
  });
  assert.equal(view._bindPresentationMesh(entity, mesh), true);
  return { view, mesh };
}

test('a returning rival receives a new scar on its resident mesh through cloned worker vitals', async (t) => {
  const { state, worker, lane, tick } = await workerLane(t);
  const nativeState = worker.host.state;
  const player = worker.host.runtime.spawn({
    ...makeShipEntitySpec('ship_kestrel', { isPlayer: true, pos: { x: 0, z: 0 } }), physicsBody: false,
  });
  nativeState.playerId = player.id;
  nativeState.mode = 'flight';
  nativeState.world.currentSectorId = 'sector_helios_prime';
  nativeState.onboarding = { active: false, finished: true };
  nativeState.simTime = 200;
  nativeState.tick = 12000;
  const nemesis = worker.host.registry.get('nemesis');
  const encounter = worker.host.registry.get('nemesisEncounter');
  const retained = livingHullWithScar(null, {
    id: 'weapon:600:bow', cause: 'weapon', facing: 'bow', band: 'crushing', tick: 600,
  }, 10);
  nemesis.deserialize({
    ...nemesis.serialize(), completed: 1, nextContactAt: 200,
    defeatRecord: { encounterId: 'previous-defeat', at: 10, outcome: 'rival_escaped', scars: retained.scars },
  });
  nemesis.update(1 / 60, nativeState);
  assert.ok(nativeState.nemesis.pending, 'the real pacing owner admits the returning rival');
  nativeState.simTime = nativeState.nemesis.pending.notBefore + 1;
  nativeState.tick = Math.round(nativeState.simTime * 60);
  nemesis.update(1 / 60, nativeState);
  encounter.update(1 / 60, nativeState);
  assert.ok(nativeState.nemesis.active, 'the production encounter owner deploys the returning catalogue hull');
  const native = nativeState.entities.get(nativeState.nemesis.active.bossId);
  assert.equal(native.data.livingHull.scars.length, 1, 'the native arrival wears the saved defeat scar');
  nativeState.mode = 'menu';
  await tick();
  const rival = state.entities.get(native.id);
  assert.ok(rival, 'the returned hull arrives through the production lane');
  assert.notEqual(rival.data.livingHull, native.data.livingHull, 'the renderer consumes a cloned hull record');
  const shown = residentRival(state, rival);
  t.after(() => disposeRendererOwnedResources(shown.view));
  const marks = shown.mesh.getObjectByName('LivingHull_HeatScorch');
  assert.equal(marks.count, 1, 'the retained scar is visible on arrival');
  const generation = lane.journal.getRebuildGeneration();

  worker.host.bus.emit('combat:damage', {
    targetId: native.id, attackerId: player.id, hullDamage: 22, armorDamage: 0,
    before: { hullMax: 100, armorMax: 40 }, pos: { x: native.pos.x - 12, z: native.pos.z },
  });
  assert.equal(native.data.livingHull.scars.length, 2, 'the registered damage owner admits the second wound');
  await tick();
  shown.view.syncEntityViews(1);
  assert.equal(marks.count, 2, 'the ordinary frame must present the transported second wound');
  assert.equal(shown.mesh.getObjectByName('LivingHull_HeatScorch'), marks, 'the mesh stays resident');
  assert.equal(state.entities.get(native.id), rival, 'the facade stays resident');
  assert.equal(lane.journal.getRebuildGeneration(), generation, 'the wound needs no journal rebuild');
  const record = rival.data.livingHull;
  const steady = await tick();
  assert.ok(!steady.entityVitals.some(([id]) => id === native.id), 'unchanged rival scars send no new vitals row');
  assert.equal(rival.data.livingHull, record, 'unchanged replies retain the presented record');
  native.hull -= 1;
  await tick();
  assert.equal(rival.data.livingHull, record, 'unrelated hull vitals preserve the scar record and array identity');
  native.data.livingHull = structuredClone(native.data.livingHull);
  const equalRecord = await tick();
  assert.ok(!equalRecord.entityVitals.some(([id]) => id === native.id),
    'a replacement with unchanged history values does not send another vitals row');

  native.data.livingHull = null;
  await tick();
  shown.view.syncEntityViews(1);
  assert.equal(marks.count, 0, 'clearing native hull history also clears resident marks');
});
