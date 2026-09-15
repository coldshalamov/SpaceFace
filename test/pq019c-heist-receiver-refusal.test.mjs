// PQ-019C × BREAKAWAY BW-01 — a delivery the physical receiver REFUSES can never pay.
//
// THE FAULT (reproduced before this fix): `settleTerminal` asked the receiver to prepare and commit,
// ignored a refusal, then released the launcher and called `settle('complete')` anyway. The live
// shape: the capsule touches the Quiet fence at tick T, is destroyed during tick T+1 before
// `missions.update`, the earliest-causal-fact rule still selects `fenced_success` (the destruction
// report is stamped T+1 and arrives after the decision), prepare answers `payload_absent` — and the
// mission paid 1800 cr for a capsule that no longer existed.
//
// THE RULE NOW: a delivery outcome settles `complete` only on a matching physical commit (or a
// matching durable commit on replay). A live-session refusal settles as a bounded FAILURE with the
// receiver's own reason: exactly one settlement, no reward, no success cue, launcher released.
//
// The one deliberate exception is the documented reload rule (`reconciled === 'resumed_receipt'`):
// the Capsule Run's capsule and facility memory are not durable, so a receipt decided before a save
// resumes as decided (pq019c-heist-save-reload save point 6). BREAKAWAY's durable load retires it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { missions } from '../src/systems/missions.js';
import { PQ019_HEIST_SECTOR_ID } from '../src/data/heistFacilities.js';
import {
  PQ019C_HEIST_TYPE,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TUNING,
  buildHeistOffer,
} from '../src/data/heistMission.js';
import * as runtime from '../src/missions/heistMissionRuntime.js';
import { prepareTerminal, effectApplied } from '../src/missions/heistArbiter.js';

const SYSTEMS = [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions];

function roleEntities(state, role) {
  return state.entityList.filter((e) => e?.alive !== false && e.data?.heistFacilityRole === role);
}

function scene({ seed = 19019 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  state.player.credits = 5000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);

  const grants = [];
  const counts = { completed: 0, failed: 0, receiverCommits: 0 };
  const failures = [];
  const cues = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('mission:completed', () => { counts.completed++; });
  bus.on('mission:failed', (p) => { counts.failed++; failures.push(p); });
  bus.on('heist:receiverCommitted', () => { counts.receiverCommits++; });
  bus.on('heist:missionCue', (p) => cues.push(p.moment));

  const missionsSys = sim.registry.get('missions');
  const t = {
    sim, state, bus, grants, counts, failures, cues, missionsSys,
    facilities: sim.registry.get('heistFacilities'),
    step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    accept() {
      const board = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
      board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
      const offer = buildHeistOffer({ epoch: 0 });
      offer.params.launchWindowS = 1;
      board.slots.unshift(offer);
      bus.emit('ui:acceptMission', { missionId: offer.id });
      return t.mission();
    },
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    capsule: () => {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },
    stepToLaunch(max = 400) {
      for (let i = 0; i < max; i++) { t.step(1); if (t.capsule()) return true; }
      return false;
    },
    latch() {
      bus.emit('tether:latched', { targetId: t.capsule().id, type: 'tether_massline' });
    },
    /** A real custody contact through the facility owner's own `physics:impact` validation. */
    contact(facilityId, tickOffset) {
      const head = roleEntities(state, `${facilityId}_head`)[0];
      const capsule = t.capsule();
      assert.ok(head && capsule, `contact needs a live ${facilityId} head and capsule`);
      bus.emit('physics:impact', {
        tick: (state.tick | 0) + tickOffset, aId: capsule.id, bId: head.id, dp: 50,
        pos: { x: head.pos.x, z: head.pos.z },
      });
    },
    payouts: () => grants.filter((g) => String(g?.reason || '').startsWith('mission:')),
  };
  return t;
}

test('a capsule destroyed the tick after touching the fence is never paid for', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch(), 'the fixture launches a real capsule');
  t.latch();
  t.step(2);

  // Tick T: a real custody contact at the fence, stamped now.
  t.contact('fence_receiver', 0);
  // ...and the capsule dies before the mission owner runs on tick T+1 (e.g. to weapons fire). Its
  // `entity:destroyed` is queued by the end-of-step sweep, i.e. AFTER the decision on T+1.
  t.sim.registry.ctx.helpers.removeEntity(t.capsule().id);
  t.step(4);

  assert.equal(t.mission(), null, 'the run reaches a bounded terminal instead of hanging');
  const receipt = m.heist.arbiter.receipt;
  assert.equal(receipt.outcome, 'fenced_success', 'the earliest physical fact still wins arbitration');
  assert.equal(receipt.status, 'committed', 'exactly one terminal receipt, frozen');

  assert.equal(t.payouts().length, 0, 'no credits for a capsule that no longer exists');
  assert.equal(t.counts.completed, 0, 'no mission completion without a physical commit');
  assert.equal(t.counts.failed, 1, 'exactly one settlement, through the ordinary failure path');
  assert.equal(t.counts.receiverCommits, 0);
  assert.equal(m.heist.receiverRefusal, 'payload_absent', 'the receiver\'s own reason is recorded');

  assert.ok(!t.cues.includes('fenced'), 'no success cue for a refused delivery');
  assert.ok(t.cues.includes('receiver_refused'), 'the player is told why nothing was paid');

  const keys = receipt.effectKeys;
  assert.equal(effectApplied(m.heist.arbiter, keys.missionSettlement), true);
  assert.equal(effectApplied(m.heist.arbiter, keys.economyReward), false, 'no reward is journalled');
  assert.equal(effectApplied(m.heist.arbiter, keys.receiverCommit), false);
  assert.equal(t.state.heistFacilities.schedule, null,
    'the launcher is released after the terminal failure, so the next contract can run');
});

test('positive control: a capsule still present at the fence commits and pays exactly once', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.contact('fence_receiver', 0);
  t.step(4);
  assert.equal(t.mission(), null);
  assert.equal(m.heist.receiverRefusal ?? null, null);
  assert.equal(t.counts.receiverCommits, 1);
  assert.equal(t.counts.completed, 1);
  assert.equal(t.payouts().length, 1);
  assert.equal(t.payouts()[0].amount, PQ019C_HEIST_TUNING.payoutCr);
  assert.ok(t.cues.includes('fenced'));
});

// ── Fault injection on the REAL runtime and arbiter (the packet probe's shape) ───────────────────

function injected(failure) {
  const record = runtime.createHeistRecord({ missionId: 'breakaway_fault_probe', tick: 0 });
  runtime.submitHeistCandidate(record, {
    kind: 'fenced_success', causalTick: 1, sourceStableId: 'test:receiver',
  });
  const terminal = prepareTerminal(record.arbiter, 2).receipt;
  const calls = [];
  const facilities = {
    prepareReceiverHandoff: () => {
      calls.push('prepare');
      return { prepared: failure !== 'prepare_refused', reason: 'injected_refusal', handoff: null };
    },
    commitReceiverHandoff: () => { calls.push('commit'); return { committed: false, reason: 'injected_refusal' }; },
    abortReceiverHandoff: () => { calls.push('abort'); return { aborted: true }; },
    releaseSchedule: () => { calls.push('release'); return { released: true }; },
  };
  const ctx = {
    state: { tick: 2, entities: new Map() },
    registry: { get: (name) => (name === 'heistFacilities' ? facilities : null) },
    helpers: {},
  };
  runtime.heistMissionRuntime.settleTerminal(ctx, record, terminal, (settlement, reason) => {
    calls.push(`settle:${settlement}:${reason}`);
  });
  return { record, terminal, calls };
}

for (const failure of ['prepare_refused', 'commit_refused']) {
  test(`${failure}: the real runtime settles a bounded failure, never a completion`, () => {
    const { record, terminal, calls } = injected(failure);
    assert.ok(!calls.some((c) => c.startsWith('settle:complete')), calls.join(','));
    assert.ok(calls.includes('settle:fail:receiver_refused'), calls.join(','));
    assert.equal(calls.filter((c) => c.startsWith('settle:')).length, 1, 'exactly one settlement');
    assert.equal(record.settled, true);
    assert.equal(record.receiverRefusal, 'injected_refusal');
    assert.equal(effectApplied(record.arbiter, terminal.effectKeys.economyReward), false);
    assert.equal(effectApplied(record.arbiter, terminal.effectKeys.receiverCommit), false);
    if (failure === 'commit_refused') {
      assert.ok(calls.indexOf('abort') > calls.indexOf('commit'), 'a prepared reservation is released');
    }
    // A replayed settle on the same record is a no-op.
    const again = [];
    runtime.heistMissionRuntime.settleTerminal({ state: { tick: 3 } }, record, terminal, () => again.push(1));
    assert.equal(again.length, 0);
  });
}

test('a matching durable commit on an idempotent replay still settles complete', () => {
  const record = runtime.createHeistRecord({ missionId: 'breakaway_replay_probe', tick: 0 });
  runtime.submitHeistCandidate(record, {
    kind: 'fenced_success', causalTick: 1, sourceStableId: 'test:receiver',
  });
  const terminal = prepareTerminal(record.arbiter, 2).receipt;
  const handoff = {
    receiptId: terminal.receiptId, facilityId: 'fence_receiver',
    payloadStableId: record.arbiter.payloadStableId, status: 'committed',
  };
  const facilities = {
    prepareReceiverHandoff: () => ({ prepared: false, reason: 'already_committed', handoff }),
    commitReceiverHandoff: () => assert.fail('an already-committed handoff is never committed twice'),
    abortReceiverHandoff: () => assert.fail('a committed handoff is never aborted'),
    releaseSchedule: () => ({ released: true }),
  };
  const settled = [];
  runtime.heistMissionRuntime.settleTerminal({
    state: { tick: 2, entities: new Map() },
    registry: { get: (name) => (name === 'heistFacilities' ? facilities : null) },
  }, record, terminal, (settlement) => settled.push(settlement));
  assert.deepEqual(settled, ['complete']);
  assert.equal(effectApplied(record.arbiter, terminal.effectKeys.receiverCommit), true);
});
