// Plan 32 — pickup & vacuum VFX. Agent-closable metric: capture-wave stagger on a
// live mote-cloud + ace-ribbon loot:drop route, and the intake pool never exceeds 24.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { mining } from '../src/systems/mining.js';
import { vfx, LOOT_MAGNET_MAX_TRAILED } from '../src/render/vfx.js';
import {
  CREDIT_CHIP_KIND,
  KILL_BURST_BLOOM_MAX_S,
  KILL_BURST_BLOOM_MIN_S,
  killBurstBloomUntil,
  rollKillRewardItems,
} from '../src/data/killRewards.js';
import { pickupPresentationFor } from '../src/data/pickupPresentation.js';
import {
  CAPTURE_WAVE_SPACING_S,
  captureActivatedAt,
  isCaptureActive,
} from '../src/systems/pickupCaptureWave.js';

const DT = 1 / 60;

function makeRng(seed = 0.17) {
  let u = seed;
  return () => {
    u = (u * 1.61803398875) % 1;
    return u;
  };
}

function bootVacuum({ rng = makeRng(), simTime = 0 } = {}) {
  const player = {
    id: 1,
    alive: true,
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    rot: 0,
    flags: {},
  };
  const pickups = [];
  const entities = new Map([[player.id, player]]);
  let nextId = 200;
  const state = {
    playerId: player.id,
    entities,
    entityList: [player],
    player: {
      miningBeam: { tierId: 'beam_mk1' },
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 400 },
      credits: 0,
    },
    mode: 'flight',
    input: { fireGroup: 0 },
    simTime,
    rng,
  };
  const collected = [];
  const listeners = Object.create(null);
  const bus = {
    on(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
      return () => {};
    },
    emit(type, payload) {
      if (type === 'pickup:collected') collected.push(payload);
      for (const fn of listeners[type] || []) fn(payload);
    },
  };
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        id: nextId++,
        alive: true,
        flags: {},
        ...spec,
      };
      entities.set(entity.id, entity);
      state.entityList.push(entity);
      if (entity.type === 'pickup') pickups.push(entity);
      return entity;
    },
  };
  mining.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, player, pickups, collected, bus, helpers };
}

function livePickups(run) {
  return run.pickups.filter((e) => e.alive && e.type === 'pickup');
}

function makeStreamHarness(run) {
  const harness = Object.create(vfx);
  harness.state = run.state;
  harness.helpers = { player: () => run.player };
  harness._scene = new THREE.Scene();
  harness._t = 0.5;
  harness._frameMembrane = null;
  harness._spawnLocalXZ = { x: 0, z: 0 };
  harness._pickupStreams = new Map();
  harness._pickupStreamPool = [];
  harness._pickupStreamFree = [];
  harness._pickupStreamLocal = { x: 0, z: 0 };
  harness._pickupStreamSeen = new Set();
  harness._lootMagnetLive = 0;
  harness._tableVfxDrawWu = 4000;
  harness._lights = null;
  harness._spawnSprite = () => {};
  harness._spawnParticle = () => {};
  return harness;
}

test('kill-burst bloom delay sits in the authored 0.3–0.6 s window', () => {
  const t0 = 12;
  for (const u of [0, 0.5, 1]) {
    const until = killBurstBloomUntil(t0, () => u);
    assert.ok(until >= t0 + KILL_BURST_BLOOM_MIN_S - 1e-12);
    assert.ok(until <= t0 + KILL_BURST_BLOOM_MAX_S + 1e-12);
  }
  assert.ok(Math.abs(killBurstBloomUntil(t0, () => 0) - (t0 + KILL_BURST_BLOOM_MIN_S)) < 1e-12);
  assert.ok(Math.abs(killBurstBloomUntil(t0, () => 1) - (t0 + KILL_BURST_BLOOM_MAX_S)) < 1e-12);
});

test('a live kill-burst drop blooms before the vacuum claims it; overlap scoop still collects', () => {
  const run = bootVacuum({ rng: () => 0.5 });
  run.bus.emit('loot:drop', {
    source: 'kill_burst',
    pos: { x: 80, z: 0 },
    vel: { x: 0, z: 0 },
    items: [{ commodityId: 'cmdty_scrap_metal', qty: 1 }],
  });
  const drop = livePickups(run)[0];
  assert.ok(drop);
  const readyAt = drop.data.vacuumReadyAt;
  assert.ok(Number.isFinite(readyAt));
  assert.ok(readyAt >= run.state.simTime + KILL_BURST_BLOOM_MIN_S - 1e-12);
  assert.ok(readyAt <= run.state.simTime + KILL_BURST_BLOOM_MAX_S + 1e-12);

  const before = { x: drop.vel.x, z: drop.vel.z };
  mining.update(DT, run.state);
  assert.equal(run.state.miningRuntime.captureWave.entries.size, 0,
    'the magnet must not claim a blooming kill-burst drop');
  assert.deepEqual(drop.vel, before, 'blooming drop keeps its authored eject, not a magnet pull');

  const overlap = bootVacuum({ rng: () => 0.5 });
  overlap.bus.emit('loot:drop', {
    source: 'kill_burst',
    pos: { x: 40, z: 0 },
    vel: { x: 0, z: 0 },
    items: [{
      kind: CREDIT_CHIP_KIND,
      credits: 40,
      amount: 40,
      grantReason: 'kill:credit_chip:wr:bloom-scoop:0',
    }],
  });
  const chip = livePickups(overlap)[0];
  assert.ok(chip.data.vacuumReadyAt > overlap.state.simTime);
  chip.pos = { x: overlap.player.pos.x + 4, z: overlap.player.pos.z };
  chip.vel = { x: 0, z: 0 };
  mining.update(DT, overlap.state);
  assert.equal(chip.alive, false, 'overlap scoop must still collect during bloom');
  assert.equal(overlap.collected.length, 1);
});

test('mote-cloud plus ace-ribbon: stagger is present and the intake pool never exceeds 24', () => {
  const run = bootVacuum({ rng: makeRng(0.31) });
  for (let i = 0; i < 20; i++) {
    run.bus.emit('loot:drop', {
      source: 'kill_burst',
      pos: { x: 80 + i * 8, z: 0 },
      vel: { x: 0, z: 0 },
      items: [{ commodityId: 'cmdty_scrap_metal', qty: 1 }],
    });
  }
  const aceItems = rollKillRewardItems(() => 0.5, {
    id: 99,
    type: 'ship',
    data: { shipClass: 'ace', worldRecordId: 'plan32-ace' },
  });
  assert.ok(aceItems.length >= 10, 'an ace ribbon is a long burst, not a single mote');
  assert.equal(aceItems.some((item) => item.kind === 'rp' || item.kind === 'reputation'), false,
    'RP is a grant (AC-03), not a violet pickup mote on the kill route');
  run.bus.emit('loot:drop', {
    source: 'kill_burst',
    pos: { x: 260, z: 0 },
    vel: { x: 0, z: 0 },
    items: aceItems,
  });

  const cloud = livePickups(run);
  assert.ok(cloud.length > LOOT_MAGNET_MAX_TRAILED,
    `stress route must exceed the pool cap (got ${cloud.length})`);
  for (const drop of cloud) {
    assert.ok(Number.isFinite(drop.data.vacuumReadyAt), 'every kill-burst drop blooms');
  }

  const families = new Map();
  for (const drop of cloud) {
    const id = pickupPresentationFor(drop.data).id;
    families.set(id, (families.get(id) || 0) + 1);
  }
  assert.ok(families.get('ore') >= 20, 'mote scrap plus ace scrap must read as ore');
  assert.ok(families.get('credits') >= 1, 'ace credit chips must read gold');
  assert.ok(families.get('refined') >= 1, 'ace alloys must read silver');
  assert.ok(families.get('component') >= 1, 'ace electronics must read cyan');
  assert.ok(families.get('munitions') >= 1, 'ace munitions must read red-orange');

  const readyAt = Math.max(...cloud.map((drop) => drop.data.vacuumReadyAt));
  mining.update(DT, run.state);
  assert.equal(run.state.miningRuntime.captureWave.entries.size, 0,
    'the vacuum stays quiet while the stress cloud is still blooming');

  run.state.simTime = readyAt;
  mining.update(DT, run.state);
  const wave = run.state.miningRuntime.captureWave;
  assert.equal(wave.entries.size, cloud.length, 'once bloom ends, the whole stress cloud is scheduled');

  const activations = cloud
    .map((drop) => captureActivatedAt(wave, drop.id))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  assert.equal(activations.length, cloud.length);
  const unique = new Set(activations.map((t) => t.toFixed(4)));
  assert.ok(unique.size > 8, 'capture-wave stagger must be present, not one-frame');
  for (let i = 1; i < activations.length; i++) {
    assert.ok(
      Math.abs((activations[i] - activations[i - 1]) - CAPTURE_WAVE_SPACING_S) < 1e-9,
      `live nearest-first stagger is 40 ms (gap ${activations[i] - activations[i - 1]})`,
    );
  }
  assert.ok(activations[activations.length - 1] - activations[0] >= CAPTURE_WAVE_SPACING_S * 8,
    'mote-cloud plus ace must stream, not snap');

  run.state.simTime = activations[activations.length - 1] + DT;
  for (const drop of cloud) {
    assert.equal(isCaptureActive(wave, drop.id, run.state.simTime), true);
    drop.vel.x = -80;
    drop.vel.z = 0;
  }

  const harness = makeStreamHarness(run);
  let peak = 0;
  for (let i = 0; i < 6; i++) {
    harness._updateLootMagnet(1 / 24);
    peak = Math.max(peak, harness._pickupStreams.size);
    assert.ok(harness._pickupStreamPool.length <= LOOT_MAGNET_MAX_TRAILED,
      'the allocation pool must never grow past 24');
  }
  assert.equal(peak, LOOT_MAGNET_MAX_TRAILED);
  assert.equal(harness._lootMagnetLive, LOOT_MAGNET_MAX_TRAILED);
});
