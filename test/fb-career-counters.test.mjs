// FB-102 (row 261) — the sim keeps the career numbers a statistics screen needs.
//
// Five career counters populated from real bus events on a fixed in-memory ledger:
// distance flown (odometer, sampled on the near clock — never per frame), kills by kill-cause
// family (the owner's own kill provenance), biggest throw (the massline release solution's
// speed), time per sector (world's enter/exit pair, on the sim clock), and the player's own
// hull losses. Plus the read-only careerStats() accessor FB-103's screen consumes, and the
// counters surviving save (the achievements profile bag) and a ledger reload.
//
// Payload shapes are copied from the live emit sites (economy.js economy:tick, combat.js
// entity:killed, masslineThrow.js massline:throw, world.js sector:enter/exit, combat.js
// player:death). Headless; deterministic; the wall clock is injected.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  careerStats,
  installAchievements,
  loadAchievementBag,
  resetAchievementsForTests,
  useAchievementClock,
} from '../src/systems/achievements.js';

const PLAYER = 1;

function mapStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function harness({ simTime = 100 } = {}) {
  const bus = createBus();
  const storage = mapStorage();
  const state = {
    playerId: PLAYER,
    simTime,
    onboarding: { active: false, finished: true },
    entities: new Map([[PLAYER, { id: PLAYER, pos: { x: 0, z: 0 } }]]),
  };
  const ledger = installAchievements({ bus, state, storage, shell: null, voice: false });
  return { bus, storage, state, ledger };
}

function movePlayer(state, x, z) {
  state.entities.get(PLAYER).pos.x = x;
  state.entities.get(PLAYER).pos.z = z;
}

test('the odometer folds displacement on the near clock and refuses teleports', () => {
  const { bus, state, ledger } = harness();
  try {
    bus.emit('economy:tick', { t: 0, ticksElapsed: 0 }); // baseline sample at the origin
    movePlayer(state, 100, 0);
    bus.emit('economy:tick', { t: 1, ticksElapsed: 60 });
    assert.equal(ledger.snapshot().counters.distanceFlownWu, 100);

    movePlayer(state, 100, 260);
    bus.emit('economy:tick', { t: 1.6, ticksElapsed: 96 });
    assert.equal(ledger.snapshot().counters.distanceFlownWu, 360, 'a sub-gate tick holds the baseline, the next one folds');

    // A jump arrival teleports the hull 1000 WU: not flown distance. The baseline resets.
    movePlayer(state, 1100, 260);
    bus.emit('sector:enter', { sectorId: 'sector_b', firstVisit: true });
    bus.emit('economy:tick', { t: 3, ticksElapsed: 180 });
    assert.equal(ledger.snapshot().counters.distanceFlownWu, 360);
  } finally {
    ledger.dispose({ flush: false });
    resetAchievementsForTests();
  }
});

test('kills land by the kill provenance the owner computed, under the stats.kills adjudication', () => {
  const { bus, ledger } = harness();
  try {
    bus.emit('entity:killed', {
      id: 'v1', killerId: PLAYER, type: 'ship',
      presentation: { cause: 'kinetic', playerCaused: true },
    });
    bus.emit('entity:killed', {
      id: 'v2', killerId: PLAYER, type: 'ship',
      presentation: { cause: 'explosive', playerCaused: true },
    });
    bus.emit('entity:killed', {
      id: 'v3', killerId: PLAYER, type: 'ship',
      presentation: { cause: 'mystery' }, // an unknown cause reads as generic, never dropped
    });
    // Same adjudication as stats.kills: other killers, non-ships, and the player's own death excluded.
    bus.emit('entity:killed', { id: 'v4', killerId: 'npc_7', type: 'ship', presentation: { cause: 'kinetic' } });
    bus.emit('entity:killed', { id: 'v5', killerId: PLAYER, type: 'asteroid', presentation: { cause: 'kinetic' } });

    const counters = ledger.snapshot().counters;
    assert.equal(counters['killsBy:kinetic'], 1);
    assert.equal(counters['killsBy:explosive'], 1);
    assert.equal(counters['killsBy:generic'], 1);
    assert.equal(counters['killsBy:mystery'], undefined);
    const stats = careerStats();
    assert.deepEqual(stats.killsByWeapon, { kinetic: 1, explosive: 1, generic: 1 });
  } finally {
    ledger.dispose({ flush: false });
    resetAchievementsForTests();
  }
});

test('the biggest throw is a max, not a sum, and holds the release solution speed', () => {
  const { bus, ledger } = harness();
  try {
    bus.emit('massline:throw', { payloadSpeed: 42.7, releaseId: 'massline:throw:1:p1' });
    bus.emit('massline:throw', { payloadSpeed: 31.2, releaseId: 'massline:throw:2:p2' });
    bus.emit('massline:throw', { payloadSpeed: 58, releaseId: 'massline:throw:3:p3' });
    assert.equal(ledger.snapshot().counters.biggestThrowSpeed, 58);
    assert.equal(careerStats().biggestThrowSpeed, 58);
  } finally {
    ledger.dispose({ flush: false });
    resetAchievementsForTests();
  }
});

test('time per sector stamps on enter and settles on exit, on the sim clock', () => {
  const { bus, state, ledger } = harness({ simTime: 100 });
  try {
    bus.emit('sector:enter', { sectorId: 'sector_helios_prime', firstVisit: true });
    state.simTime = 160; // 60 s of residence
    bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
    bus.emit('sector:enter', { sectorId: 'sector_ceres' });
    state.simTime = 190; // 30 s more in Ceres, unexited
    ledger.flush();

    const stats = careerStats();
    assert.equal(stats.timeBySector.sector_helios_prime, 60);
    assert.equal(stats.timeBySector.sector_ceres, 30);
  } finally {
    ledger.dispose({ flush: false });
    resetAchievementsForTests();
  }
});

test('hulls lost count the player\'s own defeats once each', () => {
  const { bus, ledger } = harness();
  try {
    bus.emit('player:death', { recoverable: true, origin: { kind: 'ship_collision' } });
    bus.emit('player:death', { recoverable: false, reason: 'ironman_death' });
    assert.equal(ledger.snapshot().counters.shipsLost, 2);
    assert.equal(careerStats().shipsLost, 2);
  } finally {
    ledger.dispose({ flush: false });
    resetAchievementsForTests();
  }
});

test('the five counters persist through the achievements bag and a ledger reload', () => {
  const { bus, state, ledger, storage } = harness({ simTime: 10 });
  try {
    bus.emit('economy:tick', { t: 10, ticksElapsed: 0 });
    movePlayer(state, 0, 120);
    bus.emit('economy:tick', { t: 11, ticksElapsed: 60 });
    bus.emit('entity:killed', { id: 'v1', killerId: PLAYER, type: 'ship', presentation: { cause: 'kinetic' } });
    bus.emit('massline:throw', { payloadSpeed: 44, releaseId: 'massline:throw:1:p1' });
    bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    state.simTime = 70;
    bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
    bus.emit('player:death', { recoverable: true });
    ledger.flush();

    const persisted = loadAchievementBag(storage).counters;
    assert.equal(persisted.distanceFlownWu, 120);
    assert.equal(persisted['killsBy:kinetic'], 1);
    assert.equal(persisted.biggestThrowSpeed, 44);
    assert.equal(persisted['sectorTime:sector_helios_prime'], 60);
    assert.equal(persisted.shipsLost, 1);

    // A cold shell (no live ledger) reads the same career truth from the stored bag.
    resetAchievementLedgerOnly();
    const stats = careerStats(storage);
    assert.equal(stats.distanceFlownWu, 120);
    assert.equal(stats.biggestThrowSpeed, 44);
    assert.equal(stats.shipsLost, 1);
    assert.deepEqual(stats.killsByWeapon, { kinetic: 1 });
    assert.deepEqual(stats.timeBySector, { sector_helios_prime: 60 });
    assert.equal(stats.counters.distanceFlownWu, 120, 'the raw counter bag rides along for other readers');
  } finally {
    resetAchievementsForTests();
  }
});

function resetAchievementLedgerOnly() {
  // A cold read wants no active ledger: dispose happens via the module-level reset below.
  resetAchievementsForTests();
  useAchievementClock(null);
}
