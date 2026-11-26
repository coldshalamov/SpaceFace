// PQ-169.01 — Ghosts.
//
// Seed 16910. A shared Crucible pose tape must hash to the same uint32 on two
// machines. Arming that hash must play the same poses back. The sim never
// reads wall clock; recordedAt is bag metadata, not playback.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createCrucibleGhostPresentation, CRUCIBLE_GHOST_OPACITY } from '../src/render/crucibleGhost.js';
import {
  CRUCIBLE_META_STORAGE_KEY,
  armGhostPlayback,
  canonicalGhostTape,
  getGhostPlaybackTape,
  ghostHash,
  ghostPlaybackContract,
  ghostPoseAt,
  ghostRaceOffer,
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  sampleGhostPose,
  settleCrucibleRun,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import {
  clearQueuedChallenge,
  lastQueuedGhostHash,
  queueGhostPlayback,
} from '../src/systems/survivalMutators.js';
import { SURVIVAL_WAVE_INTRO_TICKS, survivalRun } from '../src/systems/survivalRun.js';
import { clearCrucibleSetup } from '../src/ui/crucibleLaunch.js';
import { crucibleResultsScreen, crucibleScreen } from '../src/ui/screens/crucible.js';
import { ghostShareTextForTape, importGhostShareText } from '../src/ui/screens/shareCode.js';
import { mountScreen, textLines } from './helpers/fake-dom.mjs';

const SEED = 16910;
const SHARED_HASH = 476914635;

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
    _map: map,
  };
}

function resetMeta() {
  resetCrucibleMetaForTests();
  clearQueuedChallenge();
}

function sharedTape() {
  return canonicalGhostTape({
    v: 1,
    seed: SEED,
    hullId: 'ship_kestrel',
    frames: [
      { t: 0, x: 0, z: 0, r: 0 },
      { t: 6, x: 6, z: 0, r: 0.5 },
      { t: 12, x: 12, z: 3, r: 1 },
    ],
  });
}

test('an offered Best Line ghost follows saved poses after worker launch and same-seed Retry', async () => {
  resetMeta();
  clearCrucibleSetup();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  settleCrucibleRun({ storage, result: { outcome: 'defeat', seed: SEED, ruleset: 'swarm', arenaId: 'helios_core',
    score: 100, bestLine: { points: 50, acts: [{ episodeId: 'practice-line', trickId: 'bolas', name: 'Bolas',
      tick: 180, evidence: [{ kind: 'collision', victimLifeId: 'life:1' }] }] } } });
  const tape = canonicalGhostTape({ seed: SEED, hullId: 'ship_hornet', frames: [
    { t: 0, x: 10, z: 20, r: 0 }, { t: 600, x: 610, z: 20, r: 0 },
  ] });
  const imported = importGhostShareText(ghostShareTextForTape(tape), storage);
  assert.ok(imported.ok);
  const lane = createSimHost();
  const door = Object.create(crucibleScreen);
  const debrief = Object.create(crucibleResultsScreen);
  const scene = new THREE.Scene();
  const source = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const ghost = createCrucibleGhostPresentation();
  const oldDocument = globalThis.document;
  const click = (mounted, label) => {
    const button = mounted.buttons.find(b => b.textContent === label);
    assert.ok(button, `missing action ${label}`);
    globalThis.document = mounted.doc;
    try { button.listeners.click[0](); } finally { globalThis.document = oldDocument; }
  };
  const launchRequest = (mounted) => {
    const event = mounted.emitted.find(e => e.event === 'game:new');
    assert.ok(event, 'launch uses the ordinary New Game request');
    return structuredClone(event.payload);
  };
  try {
    const match = mountScreen(door, { ctx: { state: createGameState(SEED) } });
    click(match, 'Practice this line');
    assert.match(textLines(match.root).join(' '), /Your ghost for this seed is loaded/);
    click(match, 'Launch Swarm');
    const original = launchRequest(match);
    const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));
    const init = await lane.init({ profile: 'production', seed: SEED, scenarioContract });
    const { state, registry } = lane.host;
    const domains = new Map();
    const mutableNodes = new WeakSet();
    const mirror = reply => {
      for (const update of reply.domainUpdates || []) applyDomainPathUpdate(domains, structuredClone(update), mutableNodes);
    };
    mirror(init);
    let tick = 0;
    let ackEnd = init.initRebuild?.end ?? 0;
    async function send(commands, steps = 0) {
      const ring = createSimCommandRing();
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps, ackEnd, commands: ring.drain() });
      ackEnd = reply.rebuild?.end ?? ackEnd;
      mirror(reply);
      return reply;
    }
    async function fly(opts) {
      clearQueuedChallenge(); // The worker does not receive page module globals.
      const reply = await send([{ kind: 'mode', mode: 'loading' },
        { kind: 'rpc', id: 'ghost-boot', op: 'newGameBoot', args: { opts } }]);
      assert.equal(reply.rpcAcks.find(r => r.id === 'ghost-boot')?.ok, true);
      await send([{ kind: 'mode', mode: 'flight' },
        { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } }], SURVIVAL_WAVE_INTRO_TICKS + 2);
      assert.equal(state.run.phase, 'active');
      assert.equal(state.run.seed, SEED);
    }
    ghost.attach(scene);
    const sync = () => {
      armGhostPlayback(null); // Real presentation has no access to worker-local runtime tape.
      ghost.sync({ tick: state.tick, run: domains.get('run') }, source);
      return scene.children.find(node => node.userData?.crucibleGhost && node.visible);
    };
    function assertGhost() {
      assert.equal(state.run.practice, true);
      assert.equal(domains.get('run').telemetry.ghostHash, imported.hash);
      const hull = sync();
      assert.ok(hull?.isMesh, 'a visible ghost hull was added to the scene');
      assert.equal(hull.position.x, 10 + state.tick);
      assert.equal(hull.position.z, 20);
    }
    await fly(original);
    assertGhost();
    await send([], 2);
    assertGhost();
    registry.get('combat').kill(state.entities.get(state.playerId), null, { context: 'collision_terrain' });
    const owner = registry.get('survivalResults');
    assert.equal(owner.lastResult().recordRules.mode, 'practice');
    const result = mountScreen(debrief, { ctx: { state }, registryGet: name => name === 'survivalResults' ? owner : null });
    click(result, 'Run it again — same seed');
    await fly(launchRequest(result));
    assertGhost();

    const ordinaryDoor = Object.create(crucibleScreen);
    try {
      const ordinary = mountScreen(ordinaryDoor, { ctx: { state: createGameState(SEED) } });
      click(ordinary, 'Launch Swarm');
      await fly(launchRequest(ordinary));
      assert.equal(state.run.practice, false);
      assert.equal(domains.get('run').telemetry.ghostHash, undefined);
      assert.equal(sync(), undefined, 'a later flight of the same seed has no unselected ghost');
    } finally { ordinaryDoor.dispose(); }
  } finally {
    lane.shutdown();
    ghost.dispose();
    source.geometry.dispose();
    source.material.dispose();
    door.dispose();
    debrief.dispose();
    clearCrucibleSetup();
    resetMeta();
  }
});

function recordSharedTape() {
  sampleGhostPose({ tick: 0, x: 0, z: 0, r: 0, seed: SEED, hullId: 'ship_kestrel' });
  sampleGhostPose({ tick: 6, x: 6, z: 0, r: 0.5, seed: SEED, hullId: 'ship_kestrel' });
  sampleGhostPose({ tick: 12, x: 12, z: 3, r: 1, seed: SEED, hullId: 'ship_kestrel' });
}

function settleShared(storage) {
  return settleCrucibleRun({
    result: {
      outcome: 'defeat',
      seed: SEED,
      arenaId: 'helios_core',
      wave: 4,
      deepestWave: 4,
      wavesCleared: 4,
      kills: 8,
      score: SEED,
      credits: 0,
      xp: 0,
      picks: [],
    },
    run: { kind: 'survival', seed: SEED, arenaId: 'helios_core', ruleset: 'swarm' },
    storage,
  });
}

function bindBus() {
  const raw = createBus();
  return {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit: raw.emit.bind(raw),
  };
}

test('two machines that hold the same shared tape get the same ghost hash', () => {
  resetMeta();
  const json = JSON.stringify(sharedTape());
  const storageA = memoryStorage();
  const storageB = memoryStorage();
  assert.notEqual(storageA._map, storageB._map);

  useCrucibleMetaClock(() => '2026-09-08T12:00:00.000Z');
  const tapeA = canonicalGhostTape(JSON.parse(json));
  const tapeB = canonicalGhostTape(JSON.parse(json));
  const hashA = ghostHash(tapeA);
  const hashB = ghostHash(tapeB);
  assert.equal(hashA, hashB);
  assert.equal(hashA, SHARED_HASH);
  assert.ok(hashA >= 0 && hashA <= 0xffffffff);
  assert.notEqual(tapeA.frames, tapeB.frames);

  useCrucibleMetaStorage(storageA);
  recordSharedTape();
  const settledA = settleShared(storageA);
  assert.equal(settledA.result.ghostHash, SHARED_HASH);

  const bag = storageA.getItem(CRUCIBLE_META_STORAGE_KEY);
  assert.ok(bag);
  storageB.setItem(CRUCIBLE_META_STORAGE_KEY, bag);
  const other = loadCrucibleMeta(storageB);
  const row = other.ghosts.byHash[String(SHARED_HASH)];
  assert.ok(row);
  assert.equal(row.hash, SHARED_HASH);
  assert.equal(row.seed, SEED);
  assert.equal(row.frameCount, 3);
  assert.equal(ghostHash({
    v: 1,
    seed: row.seed,
    hullId: row.hullId,
    frames: row.frames,
  }), SHARED_HASH);
  assert.equal(ghostRaceOffer(other, SEED).hash, SHARED_HASH);

  console.log(`HASH_MATCH=1 SEED=${SEED} HASH=${SHARED_HASH} FRAMES=3`);
});

test('arming the shared hash replays the same poses', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => '2026-09-08T12:00:00.000Z');
  useCrucibleMetaStorage(storage);
  recordSharedTape();
  const settled = settleShared(storage);
  assert.equal(settled.result.ghostHash, SHARED_HASH);

  queueGhostPlayback(SHARED_HASH);
  const armed = armGhostPlayback(SHARED_HASH);
  assert.ok(armed);
  assert.equal(ghostHash(armed), SHARED_HASH);
  assert.equal(getGhostPlaybackTape(), armed);

  const atSix = ghostPoseAt(armed, 6);
  assert.equal(atSix.x, 6);
  assert.equal(atSix.z, 0);
  assert.equal(atSix.r, 0.5);
  const mid = ghostPoseAt(armed, 3);
  assert.equal(mid.x, 3);
  assert.equal(mid.z, 0);
  assert.ok(Math.abs(mid.r - 0.25) < 1e-9);

  const spec = ghostPlaybackContract(armed, 6);
  assert.equal(spec.kind, 'ghost');
  assert.equal(spec.hasRapierBody, false);
  assert.deepEqual(spec.weapons, []);
  assert.equal(spec.writesCampaignCredits, false);
  assert.equal(spec.isCombatant, false);
  assert.equal(CRUCIBLE_GHOST_OPACITY, 0.32);

  const mutated = canonicalGhostTape({
    ...sharedTape(),
    frames: sharedTape().frames.map((frame, i) => (i === 1 ? { ...frame, x: frame.x + 1 } : frame)),
  });
  assert.notEqual(ghostHash(mutated), SHARED_HASH);

  console.log(`PLAYBACK_MATCH=1 SEED=${SEED} HASH=${SHARED_HASH} POSE6=x6z0r0.5`);
});

test('a live survival start arms leftover playback only when the hash is queued', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => '2026-09-08T12:00:00.000Z');
  useCrucibleMetaStorage(storage);
  recordSharedTape();
  settleShared(storage);
  queueGhostPlayback(SHARED_HASH);

  const state = createGameState(SEED);
  state.run.kind = 'survival';
  state.run.phase = 'active';
  state.run.seed = SEED;
  state.run.arenaId = 'helios_core';
  const bus = bindBus();
  survivalRun.init({ state, bus });
  bus.emit('run:started', { kind: 'survival', phase: 'active' });
  const tape = getGhostPlaybackTape();
  assert.ok(tape);
  assert.equal(ghostHash(tape), SHARED_HASH);
  assert.equal(lastQueuedGhostHash(), null);
  survivalRun.destroy();
});
