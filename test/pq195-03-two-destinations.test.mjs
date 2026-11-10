// PQ-195.03 — TWO DESTINATIONS FOR ONE BODY.
//
// The Third Shift is ONE accepted contract, ONE physical SP-07 assembly and ONE receiver family. The
// lawful catcher fork logs Concord's recovery; the Quiet fence is the illicit second destination on
// the SAME body through the SAME `prepareReceiverHandoff`/`commitReceiverHandoff` machinery. Two
// policies, not two implementations.
//
// Proven here: the lawful fork still pays base + condition bonus; a possession + `fence_contact`
// settles `fenced_success` at the fence's own flat `fencePayoutCr` with no condition grade; a settled
// run can never be paid twice at the other receiver; a latch alone is never a theft; the Capsule Run's
// terminal table and fence payout are byte-identical; and the fenced outcome is recorded for .04.
//
// The lawful delivery case drives the production Rapier owner (same technique as
// `breakaway-third-shift-route.test.mjs`). The fence handoff is a real `physics:impact` through the
// facility owner's own validation, exactly as `pq019c-heist-receiver-refusal.test.mjs` does.

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
import {
  BREAKAWAY_SP07,
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  HEIST_CAPSULE_RUN_VARIANT_ID,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
} from '../src/data/heistFacilities.js';
import {
  BREAKAWAY_CUE_TEXT,
  BREAKAWAY_HEIST_TUNING,
  BREAKAWAY_RECOVERY_TYPE,
  BREAKAWAY_TERMINAL_SETTLEMENT,
  HEIST_MISSION_POLICIES,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TYPE,
  PQ019C_HEIST_TUNING,
  PQ019C_TERMINAL_SETTLEMENT,
  buildBreakawayOffer,
  heistMissionPolicy,
} from '../src/data/heistMission.js';
import { HEIST_CUE_TEXT, heistMissionRuntime } from '../src/missions/heistMissionRuntime.js';
import { deliveryQuote } from '../src/physicalCargo/breakaway/payloadMath.js';

const SYSTEMS = [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions];

function roleEntities(state, role) {
  return state.entityList.filter((e) => e?.alive !== false && e.data?.heistFacilityRole === role);
}

function scene({ seed = 30303 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
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

  // The law owner is spied through its own public method, so "no theft reported" is observed at the
  // real seam rather than inferred from heat.
  const law = sim.registry.get('lawSecurity');
  const reports = [];
  const originalReport = law.reportIncident.bind(law);
  law.reportIncident = (request) => { reports.push(request); return originalReport(request); };

  const grants = [];
  const counts = { completed: 0, failed: 0, receiverCommits: 0 };
  const cues = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('mission:completed', () => { counts.completed++; });
  bus.on('mission:failed', () => { counts.failed++; });
  bus.on('heist:receiverCommitted', () => { counts.receiverCommits++; });
  bus.on('heist:missionCue', (p) => cues.push(p));

  const missionsSys = sim.registry.get('missions');
  const facilities = sim.registry.get('heistFacilities');
  const receiver = facilities._forkReceiver(heistLaunchVariant(BREAKAWAY_THIRD_SHIFT_VARIANT_ID));
  const t = {
    sim, state, bus, grants, counts, cues, reports, missionsSys, facilities, receiver,
    step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    board: () => missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID),
    /** Accept the row the shipped board actually posted, through the shipped accept intent. */
    acceptPosted(type = BREAKAWAY_RECOVERY_TYPE) {
      const row = t.board().slots.find((o) => o && o.type === type);
      assert.ok(row, `the Tethys board posts a ${type} row`);
      row.params.launchWindowS = 1;
      bus.emit('ui:acceptMission', { missionId: row.id });
      return t.mission();
    },
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    load: () => {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },
    stepToLaunch(max = 400) {
      for (let i = 0; i < max; i++) { t.step(1); if (t.load()) return true; }
      return false;
    },
    latch() { bus.emit('tether:latched', { targetId: t.load().id, type: 'tether_massline' }); },
    /** A real custody contact through the facility owner's own `physics:impact` validation. */
    fenceContact(tickOffset = 0) {
      const head = roleEntities(state, 'fence_receiver_head')[0];
      const load = t.load();
      assert.ok(head && load, 'contact needs a live fence head and payload');
      bus.emit('physics:impact', {
        tick: (state.tick | 0) + tickOffset, aId: load.id, bId: head.id, dp: 50,
        pos: { x: head.pos.x, z: head.pos.z },
      });
    },
    /** Initial condition of the new body in receiver-local terms, before its first physics step. */
    place(load, { depth, lateral = 0, vIn = 0 }) {
      const { x, z, nx, nz } = receiver;
      load.pos.x = x + nx * depth - nz * lateral;
      load.pos.z = z + nz * depth + nx * lateral;
      if (load.prevPos) { load.prevPos.x = load.pos.x; load.prevPos.z = load.pos.z; }
      load.vel.x = nx * vIn;
      load.vel.z = nz * vIn;
      load.angVel = 0;
    },
    stepUntil(done, max) {
      for (let i = 0; i < max; i++) { t.step(1); if (done()) return i + 1; }
      return max;
    },
    payouts: () => grants.filter((g) => String(g?.reason || '').startsWith('mission:')),
    cueMoments: () => cues.map((c) => c.moment),
  };
  return t;
}

// ── (a) the lawful fork is unchanged: base + condition bonus ─────────────────────────────────────

test('(a) a lawful fork delivery still pays the base plus the condition bonus', async () => {
  const t = scene();
  assert.equal(await t.sim.registry.get('physics').prepareBackend(t.state), true,
    'proven against the production Rapier owner');
  const m = t.acceptPosted();
  assert.ok(t.stepToLaunch(), 'the launcher throws the SP-07 assembly');
  t.latch();
  t.place(t.load(), { depth: -60, vIn: 80 });
  t.stepUntil(() => !t.mission(), 900);

  assert.equal(t.mission(), null);
  assert.equal(m.heist.arbiter.receipt.outcome, 'lawful_arrival_observed');
  assert.equal(t.counts.completed, 1);
  assert.equal(t.counts.failed, 0);
  assert.ok(Number.isFinite(m.heist.deliveredCondition), 'the fork measured the condition at custody');
  const expected = deliveryQuote(
    BREAKAWAY_HEIST_TUNING.rewardCr, m.heist.deliveredCondition,
    BREAKAWAY_HEIST_TUNING.qualityBonusFraction,
  ).totalCredits;
  assert.deepEqual(t.payouts().map((g) => g.amount), [expected],
    'one payout: base plus the bounded condition bonus');
  assert.ok(expected >= BREAKAWAY_HEIST_TUNING.rewardCr);
});

// ── (b) the Quiet fence is a real second destination at the fence's own terms ─────────────────────

test('(b) a possession run handed to the Quiet fence completes at fencePayoutCr, no bonus', () => {
  const t = scene();
  const m = t.acceptPosted();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  assert.equal(m.heist.possessionEver, true, 'the fence requires real custody');

  t.fenceContact(0);
  t.stepUntil(() => !t.mission(), 30);

  assert.equal(t.mission(), null, 'the illicit handoff is a bounded terminal');
  assert.equal(m.heist.arbiter.receipt.outcome, 'fenced_success');
  assert.equal(t.counts.completed, 1);
  assert.equal(t.counts.failed, 0);
  assert.equal(t.counts.receiverCommits, 1, 'the fence receiver consumed the body once');
  assert.deepEqual(t.payouts().map((g) => g.amount), [BREAKAWAY_HEIST_TUNING.fencePayoutCr],
    'the fence pays its own flat premium, not the lawful reward and not the lawful bonus');
  assert.notEqual(BREAKAWAY_HEIST_TUNING.fencePayoutCr, BREAKAWAY_HEIST_TUNING.rewardCr);
  assert.ok(BREAKAWAY_HEIST_TUNING.fencePayoutCr > BREAKAWAY_HEIST_TUNING.rewardCr,
    'the Quiet pay a premium over the lawful base');
  assert.ok(BREAKAWAY_HEIST_TUNING.fencePayoutCr < 1320,
    'and stay below the best honest tier-3 board contract (1320), so the illicit lane is no free win');
  assert.equal(m.heist.deliveredCondition, undefined,
    'the Quiet does not grade condition — no quality quote is recorded for a fence handoff');

  // (f) the fenced outcome is recorded on the record for leaf .04.
  assert.equal(m.heist.settledOutcome, 'fenced_success');
  const fenced = t.cues.find((c) => c.moment === 'fenced');
  assert.ok(fenced, 'the fenced outcome speaks its own line');
  assert.equal(fenced.text, BREAKAWAY_CUE_TEXT.fenced);
  assert.notEqual(BREAKAWAY_CUE_TEXT.fenced, HEIST_CUE_TEXT.fenced,
    'the breakaway line is its own, never the capsule run\'s');
});

test('a fence fluke without custody is refused (no possession, no payout)', () => {
  const t = scene();
  t.acceptPosted();
  assert.ok(t.stepToLaunch());
  t.fenceContact(0);
  t.step(10);
  assert.ok(t.mission(), 'the run stays live without possession');
  assert.equal(t.payouts().length, 0);
});

// ── (c) one assembly is never paid for twice ─────────────────────────────────────────────────────

test('(c) after a fence settle the lawful receiver produces no second settlement or payout', () => {
  const t = scene();
  const m = t.acceptPosted();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.fenceContact(0);
  t.stepUntil(() => !t.mission(), 30);
  assert.deepEqual(t.payouts().map((g) => g.amount), [BREAKAWAY_HEIST_TUNING.fencePayoutCr]);

  // A later lawful custody contact on the SAME record is refused by the settled gate.
  const ctx = t.missionsSys._heistCtx();
  const accepted = heistMissionRuntime.onFacilityCandidate(ctx, m.heist, {
    kind: 'capture_settled', scheduleId: m.heist.scheduleId,
    payloadStableId: BREAKAWAY_SP07.stableId, facilityId: 'lawful_catcher', tick: t.state.tick + 1,
  });
  assert.equal(accepted, false, 'a settled run never re-arbitrates');
  t.step(10);
  assert.equal(t.counts.completed, 1);
  assert.equal(t.payouts().length, 1, 'exactly one payout for the one assembly');
});

test('(c) after a lawful settle the fence produces no second settlement or payout', async () => {
  const t = scene();
  assert.equal(await t.sim.registry.get('physics').prepareBackend(t.state), true);
  const m = t.acceptPosted();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.place(t.load(), { depth: -60, vIn: 80 });
  t.stepUntil(() => !t.mission(), 900);
  assert.equal(t.payouts().length, 1);

  const ctx = t.missionsSys._heistCtx();
  const accepted = heistMissionRuntime.onFacilityCandidate(ctx, m.heist, {
    kind: 'fence_contact', scheduleId: m.heist.scheduleId,
    payloadStableId: BREAKAWAY_SP07.stableId, facilityId: 'fence_receiver', tick: t.state.tick + 1,
  });
  assert.equal(accepted, false, 'a settled run never re-arbitrates');
  assert.equal(t.payouts().length, 1);
  assert.equal(t.counts.completed, 1);
});

// ── (d) permission is not possession: a latch is never a theft ───────────────────────────────────

test('(d) latching the breakaway assembly never reports a theft and never raises WANTED', () => {
  const t = scene();
  const m = t.acceptPosted();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(5);
  assert.equal(m.heist.possessionEver, true);
  assert.equal(t.reports.length, 0, 'no law incident is reported for the breakaway variant');
  assert.equal(m.heist.lawIncidentReceiptId, null);
  assert.equal(m.heist.lawReportId, null);
  assert.equal(t.state.player.heat, 0, 'and no WANTED heat is raised');
  assert.equal(heistMissionPolicy(BREAKAWAY_THIRD_SHIFT_VARIANT_ID).reportsTheft, false);
});

// ── (e) Capsule Run semantics are untouched ──────────────────────────────────────────────────────

test('(e) the Capsule Run terminal table and policy are unchanged', () => {
  assert.deepEqual(PQ019C_TERMINAL_SETTLEMENT.fenced_success,
    { settlement: 'complete', reason: null });
  assert.equal(heistMissionPolicy(HEIST_CAPSULE_RUN_VARIANT_ID).fencePayoutCr, 0);
  assert.equal(HEIST_MISSION_POLICIES[HEIST_CAPSULE_RUN_VARIANT_ID].fencePayoutCr, 0);
  assert.equal(HEIST_MISSION_POLICIES[HEIST_CAPSULE_RUN_VARIANT_ID].qualityBonusFraction, 0,
    'the capsule never folds in a condition bonus');
  // And the breakaway mapping is the new complete policy.
  assert.equal(BREAKAWAY_TERMINAL_SETTLEMENT.fenced_success.settlement, 'complete');
  assert.equal(BREAKAWAY_TERMINAL_SETTLEMENT.fenced_success.reason, 'fenced');
});

test('(e) a capsule fence run still pays its matrix-selected reward', () => {
  const t = scene();
  const m = t.acceptPosted(PQ019C_HEIST_TYPE);
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.fenceContact(0);
  t.stepUntil(() => !t.mission(), 30);
  assert.equal(t.mission(), null);
  assert.equal(m.heist.arbiter.receipt.outcome, 'fenced_success');
  assert.deepEqual(t.payouts().map((g) => g.amount), [PQ019C_HEIST_TUNING.payoutCr],
    'the capsule run\'s fence payout is byte-identical');
  assert.ok(t.cueMoments().includes('fenced'));
});

// ── the offer acknowledges the choice ────────────────────────────────────────────────────────────

test('the Third Shift offer names the Quiet destination and the open lawful log', () => {
  const offer = buildBreakawayOffer();
  assert.match(offer.description, /Quiet/);
  assert.match(offer.description, /log/i);
  assert.equal(offer.reward_cr, BREAKAWAY_HEIST_TUNING.rewardCr);
});
