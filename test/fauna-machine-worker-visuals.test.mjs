import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimHost, collectEntityVitals } from '../scripts/lib/simWorkerHost.mjs';
import { applyEntityVitals, createReadModel } from '../scripts/lib/simReadModel.mjs';
import { tickBolus } from '../src/systems/theBolus.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { buildMachineMesh } from '../src/render/machineVisuals.js';
import { render, disposeRendererOwnedResources } from '../src/render/renderer.js';

const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

async function workerLane(t) {
  const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  const worker = createSimHost();
  let deliver, pendingTick;
  const channelFactory = () => ({
    post(message) {
      if (message.kind === 'shutdown') return worker.shutdown();
      const operation = message.kind === 'init' ? worker.init({ ...message, scenarioContract }) : worker.tick(message);
      Promise.resolve(operation).then(reply => {
        const envelope = structuredClone({ kind: message.kind === 'init' ? 'ready' : 'tickDone', seq: message.seq, ...reply });
        deliver(envelope);
        if (message.kind === 'tick' && message.steps > 0 && pendingTick) {
          const pending = pendingTick; pendingTick = null; pending.resolve(envelope);
        }
      }, error => {
        deliver({ kind: 'error', seq: message.seq, message: String(error?.message || error) });
        if (pendingTick) { const pending = pendingTick; pendingTick = null; pending.reject(error); }
      });
    },
    onMessage(callback) { deliver = callback; },
    terminate() { worker.shutdown(); },
  });
  const state = createGameState(4242);
  const lane = createSimLaneRuntime({ state, registry: {}, bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false }, channelFactory });
  t.after(() => { lane.close(); worker.shutdown(); });
  await lane.readyPromise;
  return { state, worker, tick: () => new Promise((resolve, reject) => {
    pendingTick = { resolve, reject }; lane.runner.stepOnce();
  }) };
}

function triggerValve(creature) {
  const player = { id: 'probe-player', type: 'ship', alive: true, flags: {}, rot: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
  const state = { simTime: 0, playerId: player.id, world: { currentSectorId: 'sector_the_bolus' },
    player: { tether: { phase: 'loaded' }, cargo: { items: {}, capVolume: 100, usedVolume: 0, usedMass: 0 } },
    entities: new Map([[player.id, player], [creature.id, creature]]), entityList: [creature],
    combat: { attachments: { byId: { line: { state: 'active', ownerId: player.id, targetId: creature.id } } } } };
  const world = { state, bus: { emit() {} }, _sectorOrigin: () => ({ x: 0, z: 0 }) };
  for (let i = 0; i < 13; i++) tickBolus(world, 0.1);
}

test('the actual Bolus latch reaches a worker mirror and the renderer stages the suture', async (t) => {
  const { state, worker, tick } = await workerLane(t);
  const native = worker.host.runtime.spawn({ type: 'fauna', physicsBody: false, radius: 24,
    pos: { x: -480, z: 20 }, homeSectorId: 'sector_the_bolus', data: { name: 'Valve Lip',
      ecology: { speciesId: 'bolus_valve', driveState: 'drift' },
      bolus: { role: 'valve', key: 'bolus_valve_0', anchorX: -480, anchorZ: 20, phase: 0, hold: 0, spent: false } } });
  await tick();
  const view = state.entities.get(native.id);
  assert.ok(view);
  const ecology = view.data.ecology;
  const scene = new THREE.Scene(), nativeRenderer = {}, gate = deferred();
  state.mode = 'flight'; state.world.currentSectorId = 'sector_the_bolus';
  state.render = { scene, renderer: nativeRenderer, admissionRunGeneration: 1,
    compileObjectPipelines: () => gate.promise };
  const owner = Object.create(render);
  Object.assign(owner, { state, scene, renderer: nativeRenderer, _meshes: new Map(), _meshesVersion: 0,
    _meshResidencyShipCandidates: [], _meshResidencyOtherCandidates: [], _meshResidencySweep: {},
    _frameMembrane: { toLocal: pos => pos }, _shadowPolicyOptions: () => ({}),
    _presentationWorld: { handleForEntityId: id => ({ id }), bindMesh: () => true, unbindMesh: () => true },
    _persistentSubmitLanes: { reserve() {}, release() {} }, _meshReleaseBatchBegin() {}, _meshReleaseBatchEnd() {},
    vf: { build: buildFaunaMesh } });
  const original = buildFaunaMesh(view);
  scene.add(original); owner._meshes.set(view.id, original); owner._bindPresentationMesh(view, original);
  try {
    triggerValve(native);
    assert.equal(native.data.ecology.speciesId, 'bolus_suture');
    await tick();
    assert.equal(state.entities.get(native.id), view);
    assert.equal(view.data.ecology, ecology, 'visual observers retain the nested ecology object');
    assert.equal(ecology.speciesId, 'bolus_suture');
    // The renderer's residency poll needs the nearby player that makes this
    // retained root relevant; the in-memory worker fixture has no launch actor.
    const player = { id: -1, type: 'ship', alive: true, pos: { x: view.pos.x + 50, z: view.pos.z },
      vel: { x: 0, z: 0 }, flags: {} };
    state.entities.set(player.id, player); state.playerId = player.id;
    const poll = owner._reconcileMeshResidencySteps();
    for (let i = 0; i < 16 && !owner._appearanceReplacements?.has(view.id); i++) {
      if (poll.next().done) break;
    }
    poll.return();
    await flush();
    const pending = owner._appearanceReplacements?.get(view.id);
    assert.ok(pending, `the ordinary retained-root poll requests prepared replacement: ${JSON.stringify({
      currentMesh: view.mesh === original, mapMesh: owner._meshes.get(view.id) === original,
      alive: view.alive, type: view.type, presented: original.userData.speciesId,
      requested: view.data.ecology.speciesId, sector: state.world.currentSectorId,
      rootParent: original.parent === scene, rootVisible: original.visible, visits: owner._meshResidencySweep.meshVisits,
    })}`);
    assert.equal(view.mesh, original);
    assert.equal(original.visible, true);
    gate.resolve({ ready: true });
    assert.equal((await pending.completion).status, 'committed');
    assert.deepEqual(view.mesh.children.map(child => child.name), ['suture_strap', 'suture_stitch']);
  } finally { gate.resolve({ ready: true }); disposeRendererOwnedResources(owner); await flush(); }
});

test('worker mirrors creature and machine presentation flags and clears them in place', async (t) => {
  const { state, worker, tick } = await workerLane(t);
  const nativeFauna = worker.host.runtime.spawn({ type: 'fauna', physicsBody: false, radius: 12,
    pos: { x: 40, z: 0 }, data: { ecology: { speciesId: 'veil_ray', driveState: 'drift',
      nurseryMode: 'QUIET', visibleMembers: 8 } } });
  const kinds = ['surveyor_prism', 'auditor', 'executor', 'sleeping_jury', 'debris_sorter'];
  const machines = kinds.map((kind, i) => worker.host.runtime.spawn({ type: 'machine', physicsBody: false,
    radius: 12, pos: { x: 100 + i * 30, z: 0 }, data: { machine: { kind, sweepT: 0 } } }));
  await tick();
  const fauna = state.entities.get(nativeFauna.id), eco = fauna.data.ecology;
  const mirrored = machines.map(e => state.entities.get(e.id));
  const machineObjects = mirrored.map(e => e.data.machine);
  nativeFauna.data.ecology.driveState = 'flee';
  nativeFauna.data.ecology.nurseryMode = 'DISTURBED';
  nativeFauna.data.ecology.visibleMembers = 3;
  Object.assign(machines[0].data.machine, { sweepT: 12 });
  Object.assign(machines[1].data.machine, { interrogating: true });
  Object.assign(machines[2].data.machine, { awakened: true });
  Object.assign(machines[3].data.machine, { awake: true });
  Object.assign(machines[4].data.machine, { collectId: 123 });
  await tick();
  assert.equal(fauna.data.ecology, eco);
  assert.deepEqual([eco.driveState, eco.nurseryMode, eco.visibleMembers], ['flee', 'DISTURBED', 3]);
  assert.ok(mirrored.every((e, i) => e.data.machine === machineObjects[i]));
  assert.deepEqual([machineObjects[0].visualScanWinding, machineObjects[1].interrogating,
    machineObjects[2].awakened, machineObjects[3].awake, machineObjects[4].visualCollecting],
  [true, true, true, true, true]);
  const prism = buildMachineMesh(mirrored[0]);
  const auditor = buildMachineMesh(mirrored[1]);
  prism.userData.updateAuthoredMotion(1, mirrored[0]);
  auditor.userData.updateAuthoredMotion(1, mirrored[1]);
  assert.ok(prism.children.find(child => child.type === 'Group').rotation.x < 0, 'the scanner deploys');
  assert.equal(auditor.children.at(-1).visible, true, 'the audit bar deploys');
  nativeFauna.data.ecology.driveState = 'forage';
  nativeFauna.data.ecology.nurseryMode = 'RECOVERING';
  nativeFauna.data.ecology.visibleMembers = 0;
  Object.assign(machines[0].data.machine, { sweepT: 1 });
  Object.assign(machines[1].data.machine, { interrogating: false });
  Object.assign(machines[2].data.machine, { awakened: false });
  Object.assign(machines[3].data.machine, { awake: false });
  Object.assign(machines[4].data.machine, { collectId: null });
  await tick();
  assert.deepEqual([eco.driveState, eco.nurseryMode, eco.visibleMembers], ['forage', 'RECOVERING', 0]);
  assert.deepEqual([machineObjects[0].visualScanWinding, machineObjects[1].interrogating,
    machineObjects[2].awakened, machineObjects[3].awake, machineObjects[4].visualCollecting],
  [false, false, false, false, false]);
});

test('old occupant visual packets are rejected even when the numeric id is reused', () => {
  const model = createReadModel();
  const fauna = { id: 9, type: 'fauna', occupantGeneration: 2, data: { name: 'new',
    ecology: { speciesId: 'bolus_valve', driveState: 'drift' } } };
  model.entities.set(fauna.id, fauna);
  const stale = { ecologyVisualLife: 1, ecologyVisualSpeciesId: 'bolus_suture', ecologyVisualDriveState: 'charge',
    ecologyVisualNurseryMode: null, ecologyVisualMembers: null, ecologyName: 'old', ecologyDisguised: false };
  applyEntityVitals(model, [[fauna.id, stale]]);
  assert.equal(fauna.data.ecology.speciesId, 'bolus_valve');
  assert.equal(fauna.data.name, 'new');
  applyEntityVitals(model, [[fauna.id, { ...stale, ecologyVisualLife: 2 }]]);
  assert.equal(fauna.data.ecology.speciesId, 'bolus_suture');
  const machine = { id: 10, type: 'machine', occupantGeneration: 4, data: { machine: { kind: 'auditor' } } };
  model.entities.set(machine.id, machine);
  const packet = { machineVisualLife: 3, machineVisualInterrogating: true, machineVisualAwakened: false,
    machineVisualAwake: false, machineVisualScanning: false, machineVisualCollecting: false };
  applyEntityVitals(model, [[machine.id, packet]]);
  assert.equal(machine.data.machine.interrogating, undefined);
  applyEntityVitals(model, [[machine.id, { ...packet, machineVisualLife: 4 }]]);
  assert.equal(machine.data.machine.interrogating, true);
});

test('surveyor clock changes only publish the deployment threshold edge', () => {
  const machine = { id: 7, type: 'machine', occupantGeneration: 1, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { machine: { kind: 'surveyor_prism', sweepT: 0 } } };
  const state = { entityList: [machine], world: {} }, shadow = new Map();
  assert.equal(collectEntityVitals(state, shadow).length, 1);
  machine.data.machine.sweepT = 7;
  assert.equal(collectEntityVitals(state, shadow).length, 0);
  machine.data.machine.sweepT = 8;
  assert.equal(collectEntityVitals(state, shadow)[0][1].machineVisualScanning, true);
  machine.data.machine.sweepT = 10;
  assert.equal(collectEntityVitals(state, shadow).length, 0);
  machine.data.machine.sweepT = 0;
  assert.equal(collectEntityVitals(state, shadow)[0][1].machineVisualScanning, false);
});
