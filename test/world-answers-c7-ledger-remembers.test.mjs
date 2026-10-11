/**
 * THE WORLD ANSWERS — C7 follow-through: the ledger remembers who took the survivors you left.
 *
 * - a capture writes `captured_survivors` WITH the captor's faction (and hull id);
 * - a pod that expires while the player was never within hail of it writes nothing;
 * - a pod the player was near and left writes `abandoned_survivors`;
 * - the life ledger classifies the three cases and the finale's lives line phrases them;
 * - the record survives a save round-trip and old records without the new fields still read.
 *
 * Drives the real survivorPod system on createGameState(seed); no hand-built moral memory except for
 * the explicit legacy-record case.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ensureMoralMemory, rememberMoralDebt } from '../src/systems/moralMemory.js';
import { survivorPod, CAUSAL_POD_NOTICE_WU } from '../src/systems/survivorPod.js';
import { readLifeLedger } from '../src/story/endings/lifeLedger.js';
import { compileFinaleContent } from '../src/story/endings/finaleContent.js';

const DT = 1 / 60;
const SEEDS = [4242, 8008];

function boot(seed) {
  const bus = createBus();
  const state = createGameState(seed);
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_tethys_junction';
  state.playerId = 1;
  state.nextEntityId = 500;
  const add = (entity) => {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const player = add({
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 100,
    hull: 200, hullMax: 200, data: {}, flags: {},
  });
  state.player.tether = { active: false, targetId: null };
  survivorPod.init({ state, bus, helpers: {} });

  const pirate = ({ id, x, z, factionId = 'faction_reach' }) => add({
    id, type: 'ship', team: 1, factionId, alive: true,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 80, hull: 30, hullMax: 100,
    data: {
      ai: { archetype: 'pirate_raider', roe: 'weapons_free', forcePlayerTarget: true,
        activity: { kind: 'attack_run', reason: 'raid:attack:raider', targetId: player.id } },
      combat: { targetId: player.id, lockTarget: player.id },
      intent: { moveX: 0, moveZ: 0, fire: true, fireGroup: 0 },
    },
    flags: {},
  });
  const victim = (id, { x = 400, z = 0, factionId = 'faction_mts' } = {}) => add({
    id, type: 'ship', team: 2, factionId, alive: true,
    pos: { x, z }, vel: { x: 2, z: 1 }, rot: 0, radius: 14, mass: 160, hull: 0, hullMax: 100,
    data: { trafficRole: 'hauler', role: 'hauler', ai: { archetype: 'mule_trader', passive: true } },
    flags: {},
  });
  const eject = (v) => survivorPod._spawnCausalPod(state, v, { pos: v.pos, vel: v.vel });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { state.tick += 1; state.simTime += DT; survivorPod.update(DT, state); }
  };
  const debts = () => Object.values(ensureMoralMemory(state).debts);
  return { state, bus, player, pirate, victim, eject, step, debts };
}

const teardown = () => survivorPod.destroy();
const livesText = (state) => {
  const facts = readLifeLedger(state);
  const content = compileFinaleContent('A', facts);
  const beat = content.beats.find((b) => b.evidenceSlot === 'lives');
  return { facts, text: beat.text };
};

for (const seed of SEEDS) {
  test(`ledger [${seed}] a capture writes captured_survivors with the captor's faction and hull`, () => {
    const h = boot(seed);
    try {
      const raider = h.pirate({ id: 21, x: 260, z: 40, factionId: 'faction_reach' });
      const pod = h.eject(h.victim(30));
      raider.pos = { x: pod.pos.x + 8, z: pod.pos.z };
      h.step(2);
      const [debt] = h.debts();
      assert.equal(h.debts().length, 1);
      assert.equal(debt.cause, 'captured_survivors');
      assert.equal(debt.captorFactionId, 'faction_reach');
      assert.equal(debt.captorId, raider.id);
      assert.equal(debt.playerAnswered, undefined, 'a capture is not the player answering');
    } finally { teardown(); }
  });

  test(`ledger [${seed}] a pod that expires with the player never near writes nothing`, () => {
    const h = boot(seed);
    try {
      const far = CAUSAL_POD_NOTICE_WU * 3;
      const pod = h.eject(h.victim(30, { x: far, z: 0 }));
      const expired = [];
      h.bus.on('survivorPod:abandoned', (p) => expired.push(p));
      h.step(5);
      h.state.simTime = pod.data.survivorPodCausal.expireAt + 0.01;
      h.step(1);
      assert.equal(expired.length, 1, 'the pod still expires and is announced');
      assert.equal(h.debts().length, 0, 'but it is not the player\'s debt');
      assert.equal(readLifeLedger(h.state).survivorPods.total, 0);
    } finally { teardown(); }
  });

  test(`ledger [${seed}] a pod the player was near and left writes abandoned_survivors`, () => {
    const h = boot(seed);
    try {
      const pod = h.eject(h.victim(30, { x: CAUSAL_POD_NOTICE_WU - 50, z: 0 }));
      h.step(2);
      assert.ok(Number.isFinite(pod.data.survivorPodCausal.playerNoticedAt), 'the notice is stamped on the pod');
      // The player flies off; the pod runs out its clock.
      h.player.pos = { x: -5000, z: 0 };
      h.state.simTime = pod.data.survivorPodCausal.expireAt + 0.01;
      h.step(1);
      const [debt] = h.debts();
      assert.equal(h.debts().length, 1);
      assert.equal(debt.cause, 'abandoned_survivors');
    } finally { teardown(); }
  });

  test(`ledger [${seed}] the life ledger classifies and the finale phrases rescued, abandoned and captured pods`, () => {
    const h = boot(seed);
    try {
      // 1 rescued by the player's own tow, 1 abandoned (seen), 2 captured (one named, one legacy).
      const rescuedPod = h.eject(h.victim(30));
      const abandonedPod = h.eject(h.victim(31, { x: 300, z: 100 }));
      h.step(2);
      const own = h.state.survivorPod;
      survivorPod._resolveCausal(h.state, own, own.causal.byEntityId[rescuedPod.id], rescuedPod, 'rescued', {
        reason: 'station_delivery', stationId: 'st_x', authorityFactionId: 'faction_scn',
      });
      h.state.simTime = abandonedPod.data.survivorPodCausal.expireAt + 0.01;
      h.step(1);

      const raider = h.pirate({ id: 21, x: 260, z: 40, factionId: 'faction_reach' });
      const capturedPod = h.eject(h.victim(32, { x: 250, z: 20 }));
      raider.pos = { x: capturedPod.pos.x + 8, z: capturedPod.pos.z };
      h.step(2);
      // A record written before captorFactionId existed: still counts, names nobody.
      rememberMoralDebt(h.state, { id: 'survivor:legacy', name: 'Survivor Pod', cause: 'captured_survivors', factionId: 'faction_mts', t: 5 });

      const { facts, text } = livesText(h.state);
      assert.equal(facts.survivorPods.rescuedByPlayer, 1);
      assert.equal(facts.survivorPods.abandoned, 1);
      assert.equal(facts.survivorPods.captured, 2);
      assert.equal(facts.survivorPods.capturedUnknownCaptor, 1);
      assert.deepEqual(facts.survivorPods.captors, [{ factionId: 'faction_reach', count: 1 }]);
      assert.equal(facts.namedDebts.length, 0, 'nameless pods are not listed as named people');
      assert.equal(facts.explicitMercyCount, 0, 'pods are not the spared-opponent mercy count');

      assert.match(text, /POD REGISTER:/);
      assert.match(text, /1 survivor pod towed to a lawful hand-off by your hull/);
      assert.match(text, /1 survivor pod hailed inside your range and left to run out their air/);
      assert.match(text, /2 survivor pods left in the lane were taken by Crimson Reach, a hull the record did not name\. Present whereabouts: UNCONFIRMED\./);
      assert.doesNotMatch(text, /Survivor Pod:/i, 'no nameless "named entry" line');
    } finally { teardown(); }
  });

  test(`ledger [${seed}] a pod an ambient rescue hull took is not the player's mercy, and a quiet life adds no line`, () => {
    const h = boot(seed);
    try {
      const pod = h.eject(h.victim(30));
      h.step(1);
      const own = h.state.survivorPod;
      survivorPod._resolveCausal(h.state, own, own.causal.byEntityId[pod.id], pod, 'rescued', { reason: 'rescue_hull', rescueHullId: 77 });
      assert.equal(h.debts()[0].cause, 'rescued_survivors');
      assert.equal(h.debts()[0].playerAnswered, undefined);
      const { facts, text } = livesText(h.state);
      assert.equal(facts.survivorPods.total, 0);
      assert.doesNotMatch(text, /POD REGISTER/);
    } finally { teardown(); }
  });

  test(`ledger [${seed}] captorFactionId survives a save round-trip and still reads`, () => {
    const h = boot(seed);
    try {
      const raider = h.pirate({ id: 21, x: 260, z: 40, factionId: 'faction_reach' });
      const pod = h.eject(h.victim(30));
      raider.pos = { x: pod.pos.x + 8, z: pod.pos.z };
      h.step(2);
      const saved = JSON.parse(JSON.stringify({ story: h.state.story }));
      const reloaded = { story: saved.story };
      const memory = ensureMoralMemory(reloaded);
      const debt = Object.values(memory.debts)[0];
      assert.equal(debt.cause, 'captured_survivors');
      assert.equal(debt.captorFactionId, 'faction_reach');
      assert.equal(debt.captorId, raider.id);
      assert.deepEqual(readLifeLedger(reloaded).survivorPods.captors, [{ factionId: 'faction_reach', count: 1 }]);
      // A save with no moral memory at all reads as an empty pod register.
      assert.equal(readLifeLedger({ story: {} }).survivorPods.total, 0);
    } finally { teardown(); }
  });
}
