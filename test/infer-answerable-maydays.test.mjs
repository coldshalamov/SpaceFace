/**
 * Answerable maydays — causal survivor pods speak and pay.
 *
 * Hail: one pod-scoped mayday per causal eject (voice when mounted, toast fallback otherwise),
 * naming the dying ship's hull/role when cheaply available.
 * Answer: a PLAYER-towed rescue (station_delivery / player_handoff_rescue_hull — the only
 * reasons _tickCausal resolves while the player tether holds the pod) emits one
 * economy:grantCredits 420 intent with reason `survivor_mayday:<podId>` plus the receipt.
 * Unattended AI rescue-hull claims stay rep-only. TTL expiry stays unpaid.
 *
 * Bootstrap mirrors test/survivor-pod-causal.test.mjs.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  isCausalSurvivorPod,
  shouldEjectCausalSurvivorPod,
  survivorPod,
} from '../src/systems/survivorPod.js';

const MAYDAY_FEE = 420;

function boot({ withVoice = true } = {}) {
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

  const voiceCalls = [];
  const toasts = [];
  const credits = [];
  const rep = [];
  const helpers = withVoice ? { voice: { say: (o) => voiceCalls.push(o) } } : {};

  survivorPod.init({ state, bus, helpers, registry: null });
  bus.on('toast', (p) => toasts.push(p));
  bus.on('economy:grantCredits', (p) => credits.push(p));
  bus.on('faction:repDelta', (p) => rep.push(p));

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

  /** Crewed victim whose (seed, id, identity) hash forces the deterministic 42% eject. */
  function ejectingVictim(tag, extraData = {}) {
    for (let n = 0; n < 200; n++) {
      const victim = spawnCrewed({
        pos: { x: 120 + n * 7, z: 40 },
        extraData: { worldRecordId: `wr_mayday_${tag}_${n}`, ...extraData },
      });
      if (shouldEjectCausalSurvivorPod(state, victim)) return victim;
      state.entities.delete(victim.id);
      state.entityList.splice(state.entityList.indexOf(victim), 1);
    }
    throw new Error(`no ejecting identity found for ${tag}`);
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

  /** Lawful Concord station bubble centered on the player (origin). */
  function addLawfulStation(id = 900) {
    return add({
      id,
      type: 'station',
      alive: true,
      factionId: 'faction_scn',
      pos: { x: 0, z: 0 },
      radius: 80,
      data: { stationId: `station_test_concord_${id}`, factionId: 'faction_scn' },
      flags: {},
    });
  }

  function addRescueHull(id, pos) {
    return add({
      id,
      type: 'ship',
      team: 2,
      alive: true,
      pos: { ...pos },
      vel: { x: 0, z: 0 },
      radius: 10,
      data: { trafficRole: 'rescue', role: 'rescue' },
      flags: {},
    });
  }

  function restore() {
    if (typeof survivorPod.destroy === 'function') survivorPod.destroy();
  }

  return {
    state, bus, player, add, spawnCrewed, ejectingVictim, kill, pods, latch,
    addLawfulStation, addRescueHull, restore,
    voiceCalls, toasts, credits, rep,
  };
}

test('crewed kill hails exactly one pod-scoped mayday naming the ship role', () => {
  const h = boot();
  try {
    const victim = h.ejectingVictim('voice');
    h.kill(victim);
    const live = h.pods();
    assert.equal(live.length, 1);
    const pod = live[0];

    assert.equal(h.voiceCalls.length, 1, 'exactly one mayday hail at eject');
    const call = h.voiceCalls[0];
    assert.equal(call.channel, 'bark');
    assert.equal(call.kind, 'survivorMayday');
    assert.equal(call.id, `survivorMayday:${pod.id}`, 'id scoped to the pod so it speaks once');
    assert.match(call.text, /Mayday, mayday — hauler going down, pod away\./);
    assert.equal(h.toasts.length, 0, 'voice mounted → no toast fallback');

    // No repeats while the pod drifts toward resolution.
    h.state.simTime += 1;
    survivorPod.update(1 / 60, h.state);
    h.state.simTime += 1;
    survivorPod.update(1 / 60, h.state);
    assert.equal(h.voiceCalls.length, 1, 'no repeat hails in the causal tick');
    // The save stamp carries the label for the later receipt.
    assert.equal(pod.data.survivorPodCausal.victimLabel, 'hauler');
  } finally {
    h.restore();
  }
});

test('mayday prefers the hull def name when the victim carries a defId', () => {
  const h = boot();
  try {
    const victim = h.ejectingVictim('defname', { defId: 'ship_mule' });
    h.kill(victim);
    assert.equal(h.pods().length, 1);
    assert.equal(h.voiceCalls.length, 1);
    assert.match(h.voiceCalls[0].text, /Mayday, mayday — Mule going down, pod away\./);
  } finally {
    h.restore();
  }
});

test('mayday falls back to a clean plain line without def/role data', () => {
  const h = boot();
  try {
    const victim = h.ejectingVictim('plain', { trafficRole: undefined, role: undefined });
    h.kill(victim);
    assert.equal(h.pods().length, 1);
    assert.equal(h.voiceCalls.length, 1);
    assert.equal(h.voiceCalls[0].text, 'Mayday, mayday — we are going down, pod away.');
  } finally {
    h.restore();
  }
});

test('without a voice helper the mayday surfaces as one toast instead', () => {
  const h = boot({ withVoice: false });
  try {
    const victim = h.ejectingVictim('toast');
    h.kill(victim);
    assert.equal(h.pods().length, 1);
    assert.equal(h.voiceCalls.length, 0);
    const maydayToasts = h.toasts.filter((t) => t.kind === 'survivorMayday');
    assert.equal(maydayToasts.length, 1);
    assert.match(maydayToasts[0].text, /Mayday, mayday — hauler going down, pod away\./);
  } finally {
    h.restore();
  }
});

test('player station delivery pays the 420 salvage fee once, keeps rep, and speaks the receipt', () => {
  const h = boot();
  try {
    const victim = h.ejectingVictim('paid');
    h.kill(victim);
    const pod = h.pods()[0];
    assert.ok(pod);
    h.addLawfulStation();
    pod.pos.x = 10;
    pod.pos.z = 5;

    h.latch(pod);
    survivorPod.update(1 / 60, h.state);

    assert.equal(h.pods().length, 0, 'pod resolved');
    assert.equal(h.credits.length, 1, 'exactly one grant');
    assert.equal(h.credits[0].amount, MAYDAY_FEE);
    assert.equal(h.credits[0].reason, `survivor_mayday:${pod.id}`);
    assert.equal(h.credits[0].entityId, pod.id);
    // Existing rep +3 for the rescue is untouched.
    assert.ok(h.rep.some((r) => r.reason === 'survivorPod:rescued' && r.delta === 3));
    // Receipt spoken once, distinct pod-scoped id.
    const paid = h.voiceCalls.filter((c) => c.kind === 'survivorMaydayPaid');
    assert.equal(paid.length, 1);
    assert.equal(paid[0].id, `survivorMaydayPaid:${pod.id}`);
    assert.match(paid[0].text, /SURVIVOR PAID · hauler is aboard — 420 cr salvage fee/);
  } finally {
    h.restore();
  }
});

test('player handoff to a rescue hull while latched is also player-attributed and paid', () => {
  const h = boot();
  try {
    const victim = h.ejectingVictim('handoff');
    h.kill(victim);
    const pod = h.pods()[0];
    assert.ok(pod);
    pod.pos.x = 40;
    pod.pos.z = 0;
    h.addRescueHull(902, { x: 45, z: 2 });

    h.latch(pod);
    survivorPod.update(1 / 60, h.state);

    assert.equal(h.credits.length, 1);
    assert.equal(h.credits[0].amount, MAYDAY_FEE);
    assert.equal(h.credits[0].reason, `survivor_mayday:${pod.id}`);
    assert.ok(h.rep.some((r) => r.reason === 'survivorPod:rescued' && r.delta === 3));
  } finally {
    h.restore();
  }
});

test('receipt falls back to a toast when no voice helper is mounted', () => {
  const h = boot({ withVoice: false });
  try {
    const victim = h.ejectingVictim('receipttoast');
    h.kill(victim);
    const pod = h.pods()[0];
    h.addLawfulStation();
    pod.pos.x = 10;
    pod.pos.z = 5;
    h.latch(pod);
    survivorPod.update(1 / 60, h.state);

    assert.equal(h.credits.length, 1);
    const paidToasts = h.toasts.filter((t) => t.kind === 'survivorMaydayPaid');
    assert.equal(paidToasts.length, 1);
    assert.match(paidToasts[0].text, /SURVIVOR PAID · hauler is aboard — 420 cr salvage fee/);
  } finally {
    h.restore();
  }
});

test('unattended AI rescue-hull claim rescues for rep alone and pays nothing', () => {
  const h = boot();
  try {
    const victim = h.ejectingVictim('aiclaim');
    h.kill(victim);
    const pod = h.pods()[0];
    assert.ok(pod);
    pod.pos.x = 40;
    pod.pos.z = 0;
    h.addRescueHull(903, { x: 45, z: 2 });

    survivorPod.update(1 / 60, h.state);

    assert.equal(h.pods().length, 0);
    assert.equal(h.credits.length, 0, 'no player involvement → no fee');
    assert.equal(h.voiceCalls.filter((c) => c.kind === 'survivorMaydayPaid').length, 0);
    assert.equal(h.toasts.filter((t) => t.kind === 'survivorMaydayPaid').length, 0);
    assert.ok(h.rep.some((r) => r.reason === 'survivorPod:rescued' && r.delta === 3),
      'rep +3 still granted');
  } finally {
    h.restore();
  }
});

test('a resolved pod cannot pay twice on a duplicate resolution attempt', () => {
  const h = boot();
  try {
    const victim = h.ejectingVictim('double');
    h.kill(victim);
    const pod = h.pods()[0];
    h.addLawfulStation();
    pod.pos.x = 10;
    pod.pos.z = 5;

    const rec = h.state.survivorPod.causal.byEntityId[pod.id];
    assert.ok(rec, 'coordinator record exists before resolution');

    h.latch(pod);
    survivorPod.update(1 / 60, h.state);
    assert.equal(h.credits.length, 1);

    // Duplicate survivorPod:resolved — the guard rejects the already-resolved record.
    const again = survivorPod._resolveCausal(
      h.state, h.state.survivorPod, rec, pod, 'rescued', { reason: 'station_delivery' },
    );
    assert.equal(again, false);
    assert.equal(h.credits.length, 1, 'no double payment');
    assert.equal(h.voiceCalls.filter((c) => c.kind === 'survivorMaydayPaid').length, 1,
      'no duplicate receipt');
  } finally {
    h.restore();
  }
});

test('TTL expiry abandons unchanged: no payment, no receipt', () => {
  const h = boot();
  try {
    const victim = h.spawnCrewed({ extraData: { worldRecordId: 'wr_mayday_ttl' } });
    const pod = survivorPod._spawnCausalPod(h.state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod);
    // The mayday itself fired at spawn — exactly once.
    assert.equal(h.voiceCalls.filter((c) => c.kind === 'survivorMayday').length, 1);

    const abandoned = [];
    h.bus.on('survivorPod:abandoned', (p) => abandoned.push(p));
    h.state.simTime = (pod.data.survivorPodCausal.expireAt || 0) + 0.01;
    survivorPod.update(1 / 60, h.state);

    assert.equal(abandoned.length, 1);
    assert.equal(h.pods().length, 0);
    assert.equal(h.credits.length, 0, 'expiry pays nothing');
    assert.equal(h.voiceCalls.filter((c) => c.kind === 'survivorMaydayPaid').length, 0);
    assert.equal(h.toasts.filter((t) => t.kind === 'survivorMaydayPaid').length, 0);
    assert.equal(h.rep.length, 0);
  } finally {
    h.restore();
  }
});
