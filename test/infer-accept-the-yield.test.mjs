// Accept the yield — a surrendered pirate crew offers its take for passage, and the verb is real.
//
// Contract (deterministic, sim-time only):
//   1. a squad surrender emits ONE surrenderOffer for the squad with a bounded window;
//   2. ACCEPT dumps their take as ordinary scoopable jettisoned-cargo pods (stolen goods),
//      sends the crew fleeing cold, files combat:nonlethalResolution, remembers the mercy,
//      and resolves exactly once — a second verdict is a no-op;
//   3. REFUSE resolves without pods and leaves the crew exactly as surrender left it;
//   4. the deck surfacing helper gates on flight mode, dock state, and the window — not on
//      player cargo (nobody is robbing anyone).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';
import {
  shouldSurfaceYield,
  yieldReceiptText,
} from '../src/ui/pirateParleyPrompt.js';

const SEED = 4242;

function surrenderedSquad(sys, state, bus, seed = SEED) {
  const members = [1, 2].map((id) => ({
    id, alive: true, type: 'ship', team: 2, factionId: 'faction_reach',
    pos: { x: 100 * id, z: -50 * id }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 40, hull: 12, hullMax: 100,
    data: {},
  }));
  for (const m of members) state.entities.set(m.id, m);
  const rec = {
    squadId: 'sq_yield', patrolId: null, reason: 'damage-critical', outcome: 'fled',
    firstSeenAt: 0, triggerAt: 0, disengaged: false, spoken: false,
    memberIds: members.map((m) => m.id),
  };
  state.pirateDisengage = { squads: {}, baselines: {} };
  state.pirateDisengage.squads.sq_yield = rec;
  rec.outcome = 'surrendered';
  sys._surrender(rec, members, 10, state);
  return { rec, members };
}

function boot() {
  const state = {
    simTime: 10, tick: 600, mode: 'flight', meta: { seed: SEED }, playerId: 7,
    entities: new Map(), world: { currentSectorId: 'sector_ceres_belt' },
    player: { credits: 1000, cargo: { items: {} } },
    moralMemory: null,
  };
  const bus = createBus();
  const log = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { log.push({ event, payload }); return rawEmit(event, payload); };
  const spawned = [];
  const sys = Object.create(pirateDisengage);
  sys.helpers = {
    voice: { say: (line) => { log.push({ event: 'voice', payload: line }); return true; } },
    spawnEntity: (spec) => {
      const entity = { id: 100 + spawned.length, alive: true, ...spec, data: { ...(spec.data || {}) } };
      spawned.push(entity);
      return entity;
    },
  };
  sys.init({ state, bus, helpers: sys.helpers, registry: { get: () => null } });
  return { state, bus, log, spawned, sys };
}

test('a surrender offers the yield once, with a bounded window', () => {
  const t = boot();
  const { rec } = surrenderedSquad(t.sys, t.state, t.bus);
  const offers = t.log.filter((row) => row.event === 'pirateDisengage:surrenderOffer');
  assert.equal(offers.length, 1, 'one offer per squad surrender');
  assert.equal(offers[0].payload.squadId, 'sq_yield');
  assert.equal(offers[0].payload.offerUntil, 10 + 12, 'the window is bounded');
  assert.equal(rec.yieldState, 'offered');
});

test('accepting dumps stolen goods as ordinary pods and runs the crew clean — once', () => {
  const t = boot();
  const { members } = surrenderedSquad(t.sys, t.state, t.bus);
  t.bus.emit('pirateDisengage:verdict', { squadId: 'sq_yield', accept: true });

  const resolved = t.log.filter((row) => row.event === 'pirateDisengage:yieldResolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.accepted, true);
  assert.equal(resolved[0].payload.pods, 2, 'one pod per hull');

  assert.equal(t.spawned.length, 2, 'two physical pods');
  for (const pod of t.spawned) {
    assert.equal(pod.data.payloadType, JETTISONED_CARGO_PAYLOAD_TYPE, 'ordinary scoopable pod');
    const pool = pod.data.salvagePool || {};
    assert.ok((pool.cmdty_stolen_goods || 0) > 0, 'the take is stolen goods');
    assert.ok(pod.pos && Number.isFinite(pod.pos.x), 'the pod lands in the drift near a hull');
  }
  for (const m of members) {
    assert.equal(m.data.ai.fsm, 'flee', 'the crew runs cold after dumping');
    assert.equal(m.data.pirateDisengage.yieldDumped, true);
  }
  assert.ok(t.log.some((row) => row.event === 'combat:nonlethalResolution'),
    'provenance files a secured nonlethal resolution');
  const debt = t.state.story && t.state.story.moralMemory
    && t.state.story.moralMemory.debts['yield:sq_yield'];
  assert.ok(debt && debt.cause === 'accepted_surrender', 'moral memory remembers the mercy');
  assert.ok(debt.disposition === 'ally' || debt.disposition === 'vengeful',
    'the mercy rolls a future disposition');
  assert.ok(t.log.some((row) => row.event === 'voice' && /yield/i.test(row.payload.text)),
    'the crew speaks the departure line');

  // A second verdict (deck re-fire, stale broadcast) must be a no-op.
  t.bus.emit('pirateDisengage:verdict', { squadId: 'sq_yield', accept: true });
  assert.equal(t.log.filter((row) => row.event === 'pirateDisengage:yieldResolved').length, 1,
    'the yield resolves exactly once');
  assert.equal(t.spawned.length, 2, 'no double dump');
});

test('refusing resolves without pods and leaves the surrendered crew alone', () => {
  const t = boot();
  const { members } = surrenderedSquad(t.sys, t.state, t.bus);
  t.bus.emit('pirateDisengage:verdict', { squadId: 'sq_yield', accept: false });
  const resolved = t.log.filter((row) => row.event === 'pirateDisengage:yieldResolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.accepted, false);
  assert.equal(t.spawned.length, 0, 'no pods on refusal');
  for (const m of members) {
    assert.equal(m.data.ai.fsm, 'surrender', 'refusal changes nothing about their state');
  }
  assert.ok(!t.log.some((row) => row.event === 'combat:nonlethalResolution'));
});

test('verdicts for unknown or already-resolved squads are ignored', () => {
  const t = boot();
  t.bus.emit('pirateDisengage:verdict', { squadId: 'sq_ghost', accept: true });
  assert.equal(t.log.filter((row) => row.event === 'pirateDisengage:yieldResolved').length, 0);
  const { rec } = surrenderedSquad(t.sys, t.state, t.bus);
  rec.yieldState = 'accepted';
  t.bus.emit('pirateDisengage:verdict', { squadId: 'sq_yield', accept: true });
  assert.equal(t.log.filter((row) => row.event === 'pirateDisengage:yieldResolved').length, 0,
    'a resolved squad does not resolve again');
});

test('the deck surfaces the yield in flight regardless of hold, and receipts read honestly', () => {
  const t = boot();
  const offer = { squadId: 'sq_yield', offerUntil: 22 };
  assert.equal(shouldSurfaceYield(offer, t.state), true, 'an empty hold still gets the offer');
  t.state.ui = { docked: true };
  assert.equal(shouldSurfaceYield(offer, t.state), false, 'docked pilots hear nothing');
  t.state.ui = null;
  assert.equal(shouldSurfaceYield({ squadId: 'sq_yield', offerUntil: 5 }, t.state), false,
    'an expired window does not surface');
  assert.match(yieldReceiptText({ accepted: true, pods: 2 }), /YIELD TAKEN/);
  assert.match(yieldReceiptText({ accepted: false }), /LET GO/);
});
