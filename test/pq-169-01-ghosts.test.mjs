// PQ-169.01 — Ghosts.
//
// Seed 16910. A shared Crucible pose tape must hash to the same uint32 on two
// machines. Arming that hash must play the same poses back. The sim never
// reads wall clock; recordedAt is bag metadata, not playback.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { CRUCIBLE_GHOST_OPACITY } from '../src/render/crucibleGhost.js';
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
import { survivalRun } from '../src/systems/survivalRun.js';

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
