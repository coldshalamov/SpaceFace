// BREAKAWAY — The Third Shift on the ORDINARY route, settled by the real mission owner.
//
// The shipped board posts the row, the shipped `ui:acceptMission` intent accepts it, the real launcher
// throws the SP-07 assembly, the production Rapier owner integrates it, the capture fork brakes and
// settles it, the arbiter decides, the receiver commits, and `_completeMission` pays — once.
//
// The only fixture liberties: a 1 s launch window instead of the authored 30 s, and placing the
// freshly launched load BEFORE its first physics step (an initial condition of a new body, the same
// technique as the fork physics suite) so a focused test does not have to fly a 2 km tow.

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
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
} from '../src/data/heistFacilities.js';
import {
  BREAKAWAY_CUE_TEXT,
  BREAKAWAY_HEIST_TUNING,
  BREAKAWAY_RECOVERY_TYPE,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TYPE,
} from '../src/data/heistMission.js';
import { deliveryQuote } from '../src/physicalCargo/breakaway/payloadMath.js';
import { createHeistRecord, heistMissionRuntime } from '../src/missions/heistMissionRuntime.js';

const SYSTEMS = [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions];

async function scene({ seed = 30303 } = {}) {
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
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);

  const law = sim.registry.get('lawSecurity');
  const reports = [];
  const originalReport = law.reportIncident.bind(law);
  law.reportIncident = (request) => { reports.push(request); return originalReport(request); };

  const grants = [];
  const toasts = [];
  const cues = [];
  const counts = { completed: 0, failed: 0, receiverCommits: 0 };
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('mission:completed', () => { counts.completed++; });
  bus.on('mission:failed', () => { counts.failed++; });
  bus.on('heist:receiverCommitted', () => { counts.receiverCommits++; });
  bus.on('heist:missionCue', (p) => cues.push(p));
  bus.on('toast', (p) => toasts.push(p));

  const missionsSys = sim.registry.get('missions');
  const facilities = sim.registry.get('heistFacilities');
  const receiver = facilities._forkReceiver(heistLaunchVariant(BREAKAWAY_THIRD_SHIFT_VARIANT_ID));
  const t = {
    sim, state, bus, grants, toasts, cues, counts, reports, missionsSys, facilities, receiver,
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

const fullQuote = () => deliveryQuote(
  BREAKAWAY_HEIST_TUNING.rewardCr, 1, BREAKAWAY_HEIST_TUNING.qualityBonusFraction,
).totalCredits;

// ── board and identity ──────────────────────────────────────────────────────────────────────────

test('the Tethys board posts one Third Shift row beside the unchanged capsule run', async () => {
  const t = await scene();
  const board = t.board();
  assert.equal(board.slots.filter((o) => o && o.type === BREAKAWAY_RECOVERY_TYPE).length, 1);
  assert.equal(board.slots.filter((o) => o && o.type === PQ019C_HEIST_TYPE).length, 1,
    'the capsule run keeps exactly its one row');
  const row = board.slots.find((o) => o && o.type === BREAKAWAY_RECOVERY_TYPE);
  assert.equal(row.params.heistVariantId, BREAKAWAY_THIRD_SHIFT_VARIANT_ID);
  assert.equal(row.collateral_cr, 0);
});

test('a capsule run record keeps its exact historical shape', () => {
  const record = createHeistRecord({ missionId: 'm_shape', tick: 0 });
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'variantId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'payloadStableId'), false);
  const variant = createHeistRecord({ missionId: 'm_shape2', tick: 0, variantId: BREAKAWAY_THIRD_SHIFT_VARIANT_ID });
  assert.equal(variant.payloadStableId, BREAKAWAY_SP07.stableId);
  assert.equal(variant.arbiter.payloadStableId, BREAKAWAY_SP07.stableId);
  const restored = heistMissionRuntime.restore(heistMissionRuntime.serialize(variant), { tick: 0 });
  assert.equal(restored.variantId, BREAKAWAY_THIRD_SHIFT_VARIANT_ID, 'the variant survives a save round-trip');
  assert.equal(restored.arbiter.payloadStableId, BREAKAWAY_SP07.stableId);
});

// ── deliveries ──────────────────────────────────────────────────────────────────────────────────

test('tow delivery: a latched assembly settles in the fork and Concord pays exactly once, with no theft', async () => {
  const t = await scene();
  const m = t.acceptPosted();
  assert.ok(m, 'accepted through the ordinary board intent');
  assert.equal(m.heist.variantId, BREAKAWAY_THIRD_SHIFT_VARIANT_ID);
  assert.ok(t.stepToLaunch(), 'the launcher throws the SP-07 assembly');
  const load = t.load();
  assert.equal(load.data.heistPayloadStableId, BREAKAWAY_SP07.stableId);

  t.latch();
  assert.equal(m.heist.possessed, true);
  assert.equal(t.state.nav.waypoint?.label?.endsWith('fork'), true, 'the marker points at the fork mouth');
  assert.match(t.state.nav.waypoint.reason, /under 100 WU\/s/);

  t.place(load, { depth: -60, vIn: 80 });
  t.stepUntil(() => !t.mission(), 900);

  assert.equal(t.mission(), null, 'the recovery settles');
  assert.equal(m.heist.arbiter.receipt.outcome, 'lawful_arrival_observed');
  assert.equal(t.counts.receiverCommits, 1, 'the fork consumed the load once');
  assert.equal(t.counts.completed, 1);
  assert.equal(t.counts.failed, 0);
  assert.deepEqual(t.payouts().map((g) => g.amount), [fullQuote()],
    'one payout: base plus the full condition bonus, through the ordinary completion');

  assert.equal(t.reports.length, 0, 'a lawful recovery never reports a theft');
  assert.equal(t.state.player.heat, 0, 'and never raises heat');
  const moments = t.cueMoments();
  assert.ok(moments.includes('capture_acquired'), 'the fork says when its rails have the load');
  assert.ok(moments.includes('lawful_arrival'));
  assert.equal(t.cues.find((c) => c.moment === 'lawful_arrival').text, BREAKAWAY_CUE_TEXT.lawful_arrival);
  assert.ok(!moments.includes('fenced') && !moments.some((mo) => mo.startsWith('theft_')));
  assert.equal(t.state.heistFacilities.schedule, null, 'the launcher is free for the next contract');
});

test('shove delivery: an assembly brought in without a latch is still the player\'s delivery', async () => {
  const t = await scene();
  const m = t.acceptPosted();
  assert.ok(t.stepToLaunch());
  t.place(t.load(), { depth: -40, vIn: 50 });
  t.stepUntil(() => !t.mission(), 900);
  assert.equal(t.mission(), null);
  assert.equal(m.heist.possessionEver, false);
  assert.equal(t.counts.completed, 1);
  assert.deepEqual(t.payouts().map((g) => g.amount), [fullQuote()]);
});

test('a battered assembly still pays its base, with a proportionally smaller bonus', async () => {
  const t = await scene();
  t.acceptPosted();
  assert.ok(t.stepToLaunch());
  const load = t.load();
  load.hull = load.hullMax * 0.5;
  t.place(load, { depth: -40, vIn: 50 });
  t.stepUntil(() => !t.mission(), 900);
  const expected = deliveryQuote(BREAKAWAY_HEIST_TUNING.rewardCr, 0.5, BREAKAWAY_HEIST_TUNING.qualityBonusFraction);
  assert.deepEqual(t.payouts().map((g) => g.amount), [expected.totalCredits]);
  assert.ok(expected.totalCredits > BREAKAWAY_HEIST_TUNING.rewardCr && expected.totalCredits < fullQuote());
});

// ── failures and refusals ───────────────────────────────────────────────────────────────────────

test('an overspeed pass is refused in words and pays nothing; the job stays open', async () => {
  const t = await scene();
  t.acceptPosted();
  assert.ok(t.stepToLaunch());
  t.place(t.load(), { depth: -40, vIn: 130 });
  t.step(240);
  assert.ok(t.mission(), 'a refused capture is not a mission failure');
  assert.equal(t.payouts().length, 0);
  assert.ok(t.cueMoments().includes('capture_refused_too_fast'), 'the player is told it was too fast');
});

test('an assembly destroyed before delivery fails the recovery with no payout', async () => {
  const t = await scene();
  const m = t.acceptPosted();
  assert.ok(t.stepToLaunch());
  t.sim.registry.ctx.helpers.removeEntity(t.load().id);
  t.stepUntil(() => !t.mission(), 60);
  assert.equal(t.mission(), null);
  assert.equal(m.heist.arbiter.receipt.outcome, 'payload_destroyed');
  assert.equal(t.counts.failed, 1);
  assert.equal(t.payouts().length, 0);
  assert.equal(t.cues.find((c) => c.moment === 'destroyed').text, BREAKAWAY_CUE_TEXT.destroyed);
});

test('the launcher refuses a second contract while a run is live, in words', async () => {
  const t = await scene();
  t.acceptPosted(BREAKAWAY_RECOVERY_TYPE);
  const capsuleRow = t.board().slots.find((o) => o && o.type === PQ019C_HEIST_TYPE);
  assert.ok(capsuleRow, 'the capsule run row is still on the board, so the refusal is really exercised');
  t.bus.emit('ui:acceptMission', { missionId: capsuleRow.id });
  const live = (t.state.missions.active || []).filter((m) => m && m.status === 'active' && m.heist);
  assert.equal(live.length, 1, 'still exactly one launcher run');
  assert.equal(live[0].type, BREAKAWAY_RECOVERY_TYPE, 'and it is the one that was accepted first');
  assert.ok(t.toasts.some((p) => /committed to another run/.test(p.text || '')),
    'the refusal is told, not silent');
});

// ── Accessibility properties (parity with the capsule run's cue contract) ──────────────────────

test('every Third Shift line carries its whole meaning in words', () => {
  for (const [moment, text] of Object.entries(BREAKAWAY_CUE_TEXT)) {
    assert.ok(typeof text === 'string' && text.length >= 20, `${moment} must read as a sentence, not a token`);
    assert.ok(/[a-z]/.test(text), `${moment} must not be an all-caps status token`);
    assert.ok(!/\b(red|green|amber|yellow|blue|orange)\b/i.test(text),
      `${moment} must not name a colour as its meaning`);
  }
});
