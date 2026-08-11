/**
 * U09 Stage 2 — causal survivor-pod eject loop.
 * Stage 1 cut: massSeed + asteroid latch already cover deployable-anchor decisions.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { interactionProfileForEntity } from '../src/data/entityInteractionProfiles.js';
import { ensureMoralMemory } from '../src/systems/moralMemory.js';
import {
  CAUSAL_EJECT_CHANCE_PCT,
  CAUSAL_POD_TTL_S,
  CAUSAL_SURVIVOR_PAYLOAD_TYPE,
  MAX_CAUSAL_SURVIVOR_PODS,
  causalSurvivorPodsGatedOut,
  countLiveCausalSurvivorPods,
  enforceCausalSurvivorPodCap,
  isCausalSurvivorPod,
  isCrewedHullForPodEject,
  shouldEjectCausalSurvivorPod,
  survivorPod,
} from '../src/systems/survivorPod.js';

function boot() {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 20,
    simTime: 30,
    playerId: 1,
    meta: { seed: 9001 },
    nextEntityId: 500,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_tethys_junction' },
    player: { tether: { active: false, targetId: null } },
    story: { flags: {} },
    ui: {},
  };

  function add(entity) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  }

  const player = add({
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 12,
    mass: 100,
    hull: 200,
    hullMax: 200,
    data: {},
    flags: {},
  });

  survivorPod.init({ state, bus, helpers: {}, registry: null });

  function spawnCrewed({ id, pos = { x: 80, z: 20 }, extraData = {} } = {}) {
    const eid = id != null ? id : (state.nextEntityId = (state.nextEntityId || 500) + 1);
    return add({
      id: eid,
      type: 'ship',
      team: 2,
      factionId: 'faction_mts',
      alive: true,
      pos: { ...pos },
      vel: { x: 4, z: -1 },
      radius: 14,
      mass: 160,
      hull: 10,
      hullMax: 100,
      data: {
        trafficRole: 'hauler',
        role: 'hauler',
        ai: { archetype: 'mule_trader', passive: true },
        ...extraData,
      },
      flags: {},
    });
  }

  function kill(victim, { killerId = player.id } = {}) {
    victim.alive = false;
    bus.emit('entity:killed', {
      id: victim.id,
      killerId,
      type: victim.type,
      pos: { x: victim.pos.x, z: victim.pos.z },
      vel: { x: victim.vel.x, z: victim.vel.z },
      factionId: victim.factionId,
      data: victim.data,
    });
  }

  function pods() {
    return state.entityList.filter(isCausalSurvivorPod);
  }

  function latch(pod) {
    state.player.tether = { active: true, targetId: pod.id };
    bus.emit('tether:latched', { targetId: pod.id, ownerId: player.id });
  }

  function restore() {
    if (typeof survivorPod.destroy === 'function') survivorPod.destroy();
  }

  return { state, bus, player, add, spawnCrewed, kill, pods, latch, restore };
}

test('Stage-1 cut evidence helpers stay pure', () => {
  assert.equal(typeof CAUSAL_EJECT_CHANCE_PCT, 'number');
  assert.ok(CAUSAL_EJECT_CHANCE_PCT > 0 && CAUSAL_EJECT_CHANCE_PCT < 100);
  assert.equal(CAUSAL_SURVIVOR_PAYLOAD_TYPE, 'survivor_pod');
  assert.equal(MAX_CAUSAL_SURVIVOR_PODS, 4);
});

test('crewed hull gate rejects drones/wingmen/uncrewed', () => {
  assert.equal(isCrewedHullForPodEject({ type: 'ship', alive: true, data: {} }), true);
  assert.equal(isCrewedHullForPodEject({ type: 'drone', alive: true, data: {} }), false);
  assert.equal(isCrewedHullForPodEject({ type: 'ship', alive: true, data: { uncrewed: true } }), false);
  assert.equal(isCrewedHullForPodEject({ type: 'ship', alive: true, data: { isWingman: true } }), false);
  assert.equal(isCrewedHullForPodEject({ type: 'ship', alive: true, data: { scenarioActorId: 'a' } }), false);
});

test('scenario gate matches salvor-style golden exclusion', () => {
  assert.equal(causalSurvivorPodsGatedOut({}), false);
  assert.equal(causalSurvivorPodsGatedOut({ scenario: { active: null } }), false);
  assert.equal(causalSurvivorPodsGatedOut({ scenario: { active: { id: '47a' } } }), true);
  assert.equal(causalSurvivorPodsGatedOut({ scenario: { scenarioId: 'contract_x' } }), true);
});

test('eject roll is deterministic for seed+identity', () => {
  const state = { meta: { seed: 42 } };
  const a = { id: 7, data: { worldRecordId: 'wr_a' } };
  const b = { id: 7, data: { worldRecordId: 'wr_a' } };
  const c = { id: 8, data: { worldRecordId: 'wr_a' } };
  assert.equal(shouldEjectCausalSurvivorPod(state, a), shouldEjectCausalSurvivorPod(state, b));
  // Different identity may or may not differ — only require pure repeatability of a.
  assert.equal(typeof shouldEjectCausalSurvivorPod(state, c), 'boolean');
});

test('crewed death can eject one tetherable persistent pod', () => {
  const h = boot();
  try {
    // Brute-force a few identities until the deterministic roll accepts one (chance 42%).
    let pod = null;
    for (let i = 0; i < 40 && !pod; i++) {
      const victim = h.spawnCrewed({
        pos: { x: 100 + i * 5, z: 30 },
        extraData: { worldRecordId: `wr_eject_${i}` },
      });
      h.kill(victim);
      const live = h.pods();
      if (live.length) pod = live[live.length - 1];
    }
    assert.ok(pod, 'expected at least one eject across 40 deterministic identities');
    assert.equal(pod.type, 'payload');
    assert.equal(pod.data.payloadType, CAUSAL_SURVIVOR_PAYLOAD_TYPE);
    assert.equal(pod.flags.persistent, true);
    assert.equal(pod.data.masslineTetherable, true);
    assert.equal(interactionProfileForEntity(pod).tetherable, true);
    assert.ok(pod.mass >= 20);
    assert.ok(pod.data.survivorPodCausal);
    assert.equal(pod.data.survivorPodCausal.phase, 'adrift');
  } finally {
    h.restore();
  }
});

test('scenario-active runs never eject pods', () => {
  const h = boot();
  try {
    h.state.scenario = { active: { id: '47a', name: 'golden' } };
    for (let i = 0; i < 30; i++) {
      const victim = h.spawnCrewed({
        pos: { x: 50 + i, z: 10 },
        extraData: { worldRecordId: `wr_gate_${i}` },
      });
      h.kill(victim);
    }
    assert.equal(h.pods().length, 0);
  } finally {
    h.restore();
  }
});

test('live cap disposes oldest excess pods', () => {
  const h = boot();
  try {
    // Force-spawn past the cap via the private seam (roll-independent).
    for (let i = 0; i < MAX_CAUSAL_SURVIVOR_PODS + 2; i++) {
      const victim = h.spawnCrewed({
        pos: { x: 200 + i * 12, z: 0 },
        extraData: { worldRecordId: `wr_cap_${i}` },
      });
      // Force stamp so _spawnCausalPod is reachable even if roll would deny.
      survivorPod._spawnCausalPod(h.state, victim, { pos: victim.pos, vel: victim.vel });
    }
    assert.equal(countLiveCausalSurvivorPods(h.state), MAX_CAUSAL_SURVIVOR_PODS);
    assert.equal(enforceCausalSurvivorPodCap(h.state, h.bus), 0);
  } finally {
    h.restore();
  }
});

test('TTL expiry abandons with moralMemory note', () => {
  const h = boot();
  try {
    const victim = h.spawnCrewed({ extraData: { worldRecordId: 'wr_ttl' } });
    const pod = survivorPod._spawnCausalPod(h.state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod);
    const abandoned = [];
    h.bus.on('survivorPod:abandoned', (p) => abandoned.push(p));
    h.state.simTime = (pod.data.survivorPodCausal.expireAt || 0) + 0.01;
    survivorPod.update(1 / 60, h.state);
    assert.equal(h.pods().length, 0);
    assert.equal(abandoned.length, 1);
    const memory = ensureMoralMemory(h.state);
    assert.ok(memory.order.length >= 1);
    const debt = memory.debts[memory.order[memory.order.length - 1]];
    assert.equal(debt.cause, 'abandoned_survivors');
  } finally {
    h.restore();
  }
});

test('player tow into lawful station rescues without minting credits', () => {
  const h = boot();
  try {
    const victim = h.spawnCrewed({ extraData: { worldRecordId: 'wr_rescue' } });
    const pod = survivorPod._spawnCausalPod(h.state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod);
    // Place lawful Concord station at origin (player already there).
    h.add({
      id: 900,
      type: 'station',
      alive: true,
      factionId: 'faction_scn',
      pos: { x: 0, z: 0 },
      radius: 80,
      data: { stationId: 'station_test_concord', factionId: 'faction_scn' },
      flags: {},
    });
    // Move pod next to player inside handoff range.
    pod.pos.x = 10;
    pod.pos.z = 5;
    h.player.pos.x = 0;
    h.player.pos.z = 0;

    const rescued = [];
    const rep = [];
    const credits = [];
    h.bus.on('survivorPod:rescued', (p) => rescued.push(p));
    h.bus.on('faction:repDelta', (p) => rep.push(p));
    h.bus.on('economy:grantCredits', (p) => credits.push(p));

    h.latch(pod);
    survivorPod.update(1 / 60, h.state);

    assert.equal(rescued.length, 1, 'pod rescued at lawful station');
    assert.equal(rescued[0].reason, 'station_delivery');
    assert.ok(rep.some((r) => r.reason === 'survivorPod:rescued' && r.delta > 0));
    assert.equal(credits.length, 0, 'causal path must not mint credits');
    assert.equal(h.pods().length, 0);
    const memory = ensureMoralMemory(h.state);
    const debt = Object.values(memory.debts).find((d) => d.cause === 'rescued_survivors');
    assert.ok(debt);
  } finally {
    h.restore();
  }
});

test('fence-adjacent handoff ransoms with moralMemory only', () => {
  const h = boot();
  try {
    const victim = h.spawnCrewed({ extraData: { worldRecordId: 'wr_ransom' } });
    const pod = survivorPod._spawnCausalPod(h.state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod);
    h.add({
      id: 901,
      type: 'station',
      alive: true,
      factionId: 'faction_reach',
      pos: { x: 0, z: 0 },
      radius: 60,
      data: { stationId: 'station_fence', stationType: 'blackmarket', factionId: 'faction_reach' },
      flags: {},
    });
    pod.pos.x = 8;
    pod.pos.z = 4;
    const ransomed = [];
    const credits = [];
    h.bus.on('survivorPod:ransomed', (p) => ransomed.push(p));
    h.bus.on('economy:grantCredits', (p) => credits.push(p));
    h.latch(pod);
    survivorPod.update(1 / 60, h.state);
    assert.equal(ransomed.length, 1);
    assert.equal(credits.length, 0);
    const memory = ensureMoralMemory(h.state);
    assert.ok(Object.values(memory.debts).some((d) => d.cause === 'ransomed_survivors'));
    assert.equal(h.pods().length, 0);
  } finally {
    h.restore();
  }
});

test('rescue hull auto-claims unattended pod', () => {
  const h = boot();
  try {
    const victim = h.spawnCrewed({ extraData: { worldRecordId: 'wr_hull' } });
    const pod = survivorPod._spawnCausalPod(h.state, victim, { pos: { x: 40, z: 0 }, vel: victim.vel });
    assert.ok(pod);
    pod.pos.x = 40;
    pod.pos.z = 0;
    h.add({
      id: 902,
      type: 'ship',
      team: 2,
      alive: true,
      pos: { x: 45, z: 2 },
      vel: { x: 0, z: 0 },
      radius: 10,
      data: { trafficRole: 'rescue', role: 'rescue' },
      flags: {},
    });
    const rescued = [];
    h.bus.on('survivorPod:rescued', (p) => rescued.push(p));
    survivorPod.update(1 / 60, h.state);
    assert.equal(rescued.length, 1);
    assert.equal(rescued[0].reason, 'rescue_hull');
    assert.equal(h.pods().length, 0);
  } finally {
    h.restore();
  }
});

test('save/Continue entity stamp re-adopts causal coordinator', () => {
  const h = boot();
  try {
    const victim = h.spawnCrewed({ extraData: { worldRecordId: 'wr_save' } });
    const pod = survivorPod._spawnCausalPod(h.state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod);
    const stamp = JSON.parse(JSON.stringify(pod.data.survivorPodCausal));
    // Simulate save:loaded wiping coordinator then restoring the persistent body.
    survivorPod.newGame();
    assert.equal(Object.keys(h.state.survivorPod.causal.byEntityId).length, 0);
    // Entity still live with stamp.
    pod.data.survivorPodCausal = stamp;
    survivorPod.update(1 / 60, h.state);
    assert.ok(h.state.survivorPod.causal.byEntityId[pod.id]);
    assert.equal(h.state.survivorPod.causal.byEntityId[pod.id].victimId, stamp.victimId);
  } finally {
    h.restore();
  }
});

test('TTL constant is finite and positive', () => {
  assert.ok(CAUSAL_POD_TTL_S > 0);
});
