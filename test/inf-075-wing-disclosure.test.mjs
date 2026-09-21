// INF-075 — one rival adaptation readable and counterable. The wing refit (the secondary
// counter-kit) used to arrive undisclosed while the primary was announced, voiced, and
// panelled. Now the arrival cue names both refits with their tells and counters, and both
// come only from evidence the memory legitimately stores — no secondary without two
// observed episodes, no confidence the plan does not carry, no omniscience.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { nemesis } from '../src/systems/nemesis.js';
import { prepareNemesisPlan } from '../src/nemesis/learning.js';
import { counts } from '../src/nemesis/model.js';
import { NEMESIS_KITS, NEMESIS_STYLES } from '../src/data/nemesisRival.js';

function episode(styles, id) {
  const c = counts();
  for (const [style, units] of Object.entries(styles)) c[style] = units;
  const total = NEMESIS_STYLES.reduce((sum, s) => sum + c[s], 0);
  return { id, at: 0, outcome: null, counts: c, total, sources: { direct: total, report: 0 }, contradicted: false };
}

function boot(memoryPatch = {}) {
  const state = createGameState(75);
  state.mode = 'flight';
  state.simTime = 1000;
  state.tick = 60000;
  state.world.currentSectorId = 'sector_helios_prime';
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    rot: 0, hull: 100, hullMax: 100, radius: 6, team: 0, factionId: 'faction_free',
    flags: {}, data: {},
  };
  state.playerId = player.id;
  state.nextEntityId = 2;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const bus = createBus();
  const traffic = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { traffic.push({ event, payload }); return rawEmit(event, payload); };
  nemesis.init({ state, bus, helpers: {} });
  Object.assign(state.nemesis, {
    nextContactAt: 0, nextCheckAt: 0, progress: 2, completed: 2, lastPrimary: 'open',
    ...memoryPatch,
  });
  return { state, bus, traffic };
}

const RICH = {
  episodes: [episode({ tether: 10, gunnery: 4 }, 'ep-a'), episode({ tether: 10, gunnery: 4 }, 'ep-b')],
  progress: 2, completed: 2, lastPrimary: 'open',
};

test('the planner earns its secondary only from stored evidence', () => {
  const rich = prepareNemesisPlan({ episodes: RICH.episodes, progress: 2, completed: 2, lastPrimary: 'open' });
  assert.notEqual(rich.primary, 'open', 'sustained tether play commits a primary');
  assert.ok(rich.secondary, 'two observed episodes earn the wing refit');
  assert.ok(rich.evidenceEpisodes >= 2, 'the gate counts episodes, not vibes');
  const thin = prepareNemesisPlan({ episodes: [episode({ tether: 10, gunnery: 4 }, 'ep-a')], progress: 2, completed: 2, lastPrimary: 'open' });
  assert.equal(thin.secondary, null, 'one episode never wings the refit');
});

test('the arrival cue names both refits with tells and counters', () => {
  const harness = boot(RICH);
  harness.state.nemesis.nextContactAt = 0;
  nemesis.update(0.25, harness.state);
  const announced = harness.traffic.filter(({ event }) => event === 'nemesis:announced');
  assert.equal(announced.length, 1, 'one arrival cue');
  const plan = harness.state.nemesis.pending.plan;
  assert.ok(plan.secondary, 'the pending plan carries the wing');
  assert.equal(announced[0].payload.secondary, plan.secondary, 'the cue carries the wing kit id');
  const wing = NEMESIS_KITS[plan.secondary];
  assert.ok(wing.tell && wing.opening, 'the table holds the wing tell and its counter');
});

test('the wing states its own reason on arrival, citing counted evidence', () => {
  const harness = boot(RICH);
  nemesis.update(0.25, harness.state);
  const pending = harness.state.nemesis.pending;
  assert.ok(pending, 'a pending request waits');
  pending.dispatched = true; // the encounter host acknowledges deployment
  pending.requestedAt = harness.state.simTime;
  // Acknowledge deployment with a live, tagged boss hull.
  const boss = {
    id: 50, type: 'ship', alive: true, hull: 80, hullMax: 100, radius: 8, team: 1,
    pos: { x: 100, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { nemesis: { encounterId: pending.id } },
  };
  harness.state.entities.set(boss.id, boss);
  harness.state.entityList.push(boss);
  harness.bus.emit('nemesis:encounterStarted', { requestId: pending.id, bossId: boss.id, crewIds: [] });
  const voices = harness.traffic.filter(({ event }) => event === 'nemesis:voice');
  const predictions = voices.filter(({ payload }) => payload.situation === 'prediction');
  assert.ok(predictions.length >= 2, 'primary and wing both speak');
  const wingVoice = predictions.find(({ payload }) => payload.evidence && payload.evidence.secondary);
  assert.ok(wingVoice, 'the wing has its own prediction line');
  assert.match(wingVoice.payload.text, /^ORRA \(wing\):/, 'spoken as the wing, not the helm');
  assert.equal(wingVoice.payload.evidence.units, pending.plan.evidenceUnits, 'cites the counted units');
  assert.equal(wingVoice.payload.evidence.episodes, pending.plan.evidenceEpisodes, 'cites the counted episodes');
  assert.ok(!('confidence' in wingVoice.payload.evidence), 'never a confidence the plan does not store');
  assert.ok(wingVoice.payload.evidence.tell && wingVoice.payload.evidence.opening, 'tell and counter included');
});

test('no wing without evidence: thin memory stays single-voiced', () => {
  const harness = boot({ episodes: [episode({ tether: 10, gunnery: 4 }, 'ep-a')], progress: 2, completed: 2, lastPrimary: 'open' });
  nemesis.update(0.25, harness.state);
  const announced = harness.traffic.filter(({ event }) => event === 'nemesis:announced');
  assert.equal(announced.length, 1, 'the arrival still cues');
  assert.equal(announced[0].payload.secondary, null, 'no wing id without two episodes');
});
