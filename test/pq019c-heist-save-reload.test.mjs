// PQ-019C Phase E — save/reload at the packet's nine named points.
//
//   before launch · after launch · after possession · during pursuit · after escape ·
//   receiver prepared · terminal prepared · post-commit/pre-mission-event · missing projection
//
// WHAT A RELOAD ACTUALLY LOOKS LIKE HERE, and why these tests boot a FRESH world rather than
// re-deserializing into the same one: `state.heistFacilities` and `state.lawSecurity` are NOT in the
// save owner's capture plan (PQ-019B §4), and the capsule is a transient entity. After a real load
// there is therefore no schedule, no capsule, no custody candidate and no receiver handoff — only
// what the mission owner serialized. Deserializing into the same live scene would quietly keep the
// facility state the real game would have lost, and would prove nothing. Each test below boots a
// second, empty world and hands it only the bytes.
//
// THE RECONCILIATION RULE (heistMissionRuntime.restore), asserted point by point:
//   * a decided receipt        -> RESUME it. Selection never re-runs; only unapplied effect keys are
//                                 re-driven, because the journal records which already landed.
//   * phase `scheduled`, never launched -> RE-REQUEST the schedule; nothing physical existed yet.
//   * launched or later, no capsule     -> `unresolved_absent`.
//   * an arbiter record that fails closed (phase claims a decision, receipt unreadable)
//                              -> the same absent case, from a fresh arbiter.
//
// THE PAYOUT RULE. A `fenced_success` receipt that predates the save still pays exactly once on
// resume. That is not a fabrication: the terminal receipt is the proof the capsule was physically
// delivered, and resuming the same receipt is the packet's own "a crash after prepare resumes the
// same receipt" guarantee. What is never fabricated is a payout with NO decided receipt — every
// point below asserts that, and the three that reload mid-flight settle at zero.

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
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { missions } from '../src/systems/missions.js';
import { PQ019_CAPSULE, PQ019_HEIST_SECTOR_ID } from '../src/data/heistFacilities.js';
import {
  PQ019C_HEIST_TYPE,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TUNING,
  buildHeistOffer,
} from '../src/data/heistMission.js';
import { prepareTerminal } from '../src/missions/heistArbiter.js';

const SYSTEMS = [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions];

function roleEntities(state, role) {
  return state.entityList.filter((e) => e?.alive !== false && e.data?.heistFacilityRole === role);
}

function boot({ seed = 19019, withPatrol = true } = {}) {
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
  const settlements = { completed: 0, failed: 0, expired: 0 };
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('mission:completed', () => { settlements.completed++; });
  bus.on('mission:failed', () => { settlements.failed++; });
  bus.on('mission:expired', () => { settlements.expired++; });

  const maxCapsules = { value: 0 };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step(SIM_DT);
      maxCapsules.value = Math.max(maxCapsules.value, roleEntities(state, 'cargo_capsule').length);
    }
  };

  const anchor = (() => {
    const head = roleEntities(state, 'heist_launcher_head')[0];
    return head ? { x: head.pos.x, z: head.pos.z } : { x: 0, z: 0 };
  })();
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: anchor.x + 120, z: anchor.z }, radius: 42,
    data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
  });
  const jobs = sim.registry.get('npcJobsRuntime');
  if (withPatrol) {
    const hull = sim.spawn({
      type: 'ship', team: 2, factionId: 'faction_scn',
      pos: { x: anchor.x + 200, z: anchor.z + 60 }, radius: 9, hull: 100, hullMax: 100,
      data: { worldRecordId: 'wr_tethys_patrol', ai: { lawful: true, archetype: 'patrol_lawman' } },
    });
    jobs.assign(hull, {
      kind: NPC_JOB_KIND.PATROL,
      route: [
        { id: 'b0', pos: { x: anchor.x + 200, z: anchor.z } },
        { id: 'b1', pos: { x: anchor.x, z: anchor.z + 200 } },
      ],
      sectorId: PQ019_HEIST_SECTOR_ID,
      speed: 100, commissionS: 1, departS: 1, approachS: 1,
      workS: 2, loadS: 1, unloadS: 1, dwellS: 1,
    });
  }

  const t = {
    sim, state, bus, grants, settlements, step, jobs, maxCapsules,
    missionsSys: sim.registry.get('missions'),
    facilities: sim.registry.get('heistFacilities'),
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    capsule: () => {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },
    accept: ({ launchWindowS = 1, runWindowTicks = null } = {}) => {
      const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
      board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
      const offer = buildHeistOffer({ epoch: 0 });
      offer.params.launchWindowS = launchWindowS;
      if (runWindowTicks != null) offer.params.runWindowTicks = runWindowTicks;
      board.slots.unshift(offer);
      bus.emit('ui:acceptMission', { missionId: offer.id });
      return t.mission();
    },
    stepToLaunch: (max = 400) => {
      for (let i = 0; i < max; i++) { step(1); if (t.capsule()) return true; }
      return false;
    },
    latch: () => {
      const capsule = t.capsule();
      assert.ok(capsule, 'latch needs a live capsule');
      bus.emit('tether:latched', { targetId: capsule.id, type: 'tether_massline' });
    },
    contact: (facilityId, tickOffset = 1) => {
      const head = roleEntities(state, `${facilityId}_head`)[0];
      const capsule = t.capsule();
      assert.ok(head && capsule);
      bus.emit('physics:impact', {
        tick: (state.tick | 0) + tickOffset, aId: capsule.id, bId: head.id, dp: 50,
        pos: { x: head.pos.x, z: head.pos.z },
      });
    },
    /** The bytes a save would carry, and nothing else. */
    save: () => JSON.parse(JSON.stringify(t.missionsSys.serialize())),
    payouts: () => grants.filter((g) => String(g?.reason || '').startsWith('mission:')),
  };
  return t;
}

/**
 * Hand a save to a brand-new, empty world — no schedule, no capsule, no facility memory.
 *
 * `atTick` reproduces what the real save owner does: `saveSystem` restores `state.tick` from the
 * entity payload (saveSystem.js:2116), so a loaded game resumes on the same clock it was saved on.
 * A harness that left the clock at zero would put the world THOUSANDS of ticks behind the arbiter's
 * restored `decidedThroughTick`, and every restore-time report would sit ineligible until the world
 * caught up — a stall this test would then wrongly attribute to the runtime. (The runtime is
 * defended against the opposite ordering too: `restore` floors its stamp at the arbiter's own clock,
 * because whether `state.tick` is restored before `missions.deserialize` is the save owner's
 * ordering property, not something the mission layer can assume.)
 */
function reload(saved, atTick = 0, options = {}) {
  const t = boot(options);
  t.state.tick = atTick | 0;
  t.missionsSys.deserialize(saved);
  return t;
}

// ── 1. Before launch ────────────────────────────────────────────────────────────────────────────

test('save point 1 — before launch: the pending window is re-requested, one capsule follows', () => {
  const a = boot();
  const m = a.accept({ launchWindowS: 4 });
  a.step(2);
  assert.equal(m.heist.launchTick, null, 'nothing physical exists yet');
  const saved = a.save();

  const b = reload(saved, a.state.tick);
  const restored = b.mission();
  assert.equal(restored.heist.reconciled, 'reschedule');
  assert.equal(restored.heist.scheduleRequested, false, 'the schedule is re-requestable');
  assert.ok(b.stepToLaunch(600), 'the reloaded run produces exactly one real capsule');
  assert.equal(roleEntities(b.state, 'cargo_capsule').length, 1);
  assert.equal(b.payouts().length, 0);
});

// ── 2-5. Mid-flight: launched, possessed, pursued, escaped ─────────────────────────────────────
//
// All four reload into a world with no capsule, so all four reconcile to `unresolved_absent`. That
// is the honest answer, and it is stated once here rather than hidden behind four near-identical
// tests: the capsule is not durable, so a mid-flight reload cannot continue the run. The point of
// the tests is that each reaches a BOUNDED terminal with no payout and no phantom capsule — not
// that they differ.

for (const point of [
  { n: 2, name: 'after launch', possess: false, pursue: false },
  { n: 3, name: 'after possession', possess: true, pursue: false },
  { n: 4, name: 'during pursuit', possess: true, pursue: true },
]) {
  test(`save point ${point.n} — ${point.name}: reloads to a bounded unresolved_absent, no payout`, () => {
    const a = boot();
    const m = a.accept();
    assert.ok(a.stepToLaunch());
    if (point.possess) a.latch();
    if (point.pursue) {
      assert.equal(m.heist.responderAvailability, 'available');
      assert.ok(m.heist.leases.length >= 1, 'a real lease is live at the save boundary');
      a.step(3);
    }
    const saved = a.save();
    // The lease is deliberately NOT persisted (PQ-019B §2c): after a load there is no hull and no
    // controller, so a restored lease would name a permanently frozen patrol.
    assert.equal(saved.active[0].heist.leases, undefined, 'leases are not part of the snapshot');

    const b = reload(saved, a.state.tick);
    const restored = b.mission();
    assert.equal(restored.heist.reconciled, 'absent_after_reload');
    assert.equal(restored.heist.leases.length, 0);
    b.step(6);
    assert.equal(b.mission(), null, 'the run settles rather than stalling');
    assert.equal(b.settlements.failed, 1);
    assert.equal(b.payouts().length, 0, 'never fabricate a payout');
    assert.equal(b.jobs.activeControlClaimCount(), 0,
      'activeJobControlClaimsAfterTerminal == 0 across the reload');
    assert.equal(roleEntities(b.state, 'cargo_capsule').length, 0);
  });
}

test('save point 5 — after escape: escaped progress reloads to the same bounded absence', () => {
  const a = boot();
  const m = a.accept();
  assert.ok(a.stepToLaunch());
  a.latch();
  // Force the escape latch rather than flying it: the tuning's hold window is a balance number, and
  // what this point tests is the SAVE boundary at phase `escaped`, not the distance maths.
  m.heist.escapeHoldTicks = PQ019C_HEIST_TUNING.escapeHoldTicks;
  m.heist.leases = [];
  m.heist.escaped = true;
  m.heist.arbiter.phase = 'escaped';
  const saved = a.save();
  assert.equal(saved.active[0].heist.arbiter.phase, 'escaped');

  const b = reload(saved, a.state.tick);
  const restored = b.mission();
  assert.equal(restored.heist.reconciled, 'absent_after_reload');
  b.step(6);
  assert.equal(b.mission(), null);
  assert.equal(b.payouts().length, 0);
  assert.equal(b.settlements.failed, 1);
});

// ── 6-8. Mid-settlement ────────────────────────────────────────────────────────────────────────

test('save point 6 — receiver prepared: the reservation is lost, the decision is not, no double pay', () => {
  const a = boot();
  const m = a.accept();
  assert.ok(a.stepToLaunch());
  a.latch();
  a.step(2);
  a.contact('fence_receiver');
  a.step(1);
  // Reach a state the real world can produce: the arbiter has decided, and the receiver has been
  // RESERVED but not consumed — the exact window the two-phase handoff exists to make survivable.
  const prepared = prepareTerminal(m.heist.arbiter, (a.state.tick | 0) + 1);
  assert.ok(prepared.receipt || m.heist.arbiter.receipt, 'the terminal is decided at the boundary');
  const receipt = m.heist.arbiter.receipt;
  assert.equal(receipt.outcome, 'fenced_success');
  const reservation = a.facilities.prepareReceiverHandoff({
    receiptId: receipt.receiptId, facilityId: 'fence_receiver',
    payloadStableId: PQ019_CAPSULE.stableId,
  });
  assert.equal(reservation.prepared, true, 'prepare reserves without consuming');
  assert.ok(a.capsule(), 'the capsule is still physically there after prepare');
  assert.equal(receipt.status, 'prepared');
  const saved = a.save();

  const b = reload(saved, a.state.tick);
  const restored = b.mission();
  assert.equal(restored.heist.reconciled, 'resumed_receipt');
  assert.equal(restored.heist.arbiter.receipt.receiptId, receipt.receiptId,
    'the SAME receipt resumes; selection never re-runs');
  b.step(4);
  assert.equal(b.mission(), null);
  assert.equal(b.settlements.completed, 1, 'the decided delivery still settles');
  assert.equal(b.payouts().length, 1, 'exactly one payout, authorized by the resumed receipt');
  assert.equal(b.payouts()[0].amount, PQ019C_HEIST_TUNING.payoutCr);
});

test('save point 7 — terminal prepared, nothing applied: resumes the same outcome exactly once', () => {
  const a = boot();
  const m = a.accept();
  assert.ok(a.stepToLaunch());
  a.latch();
  a.step(2);
  a.contact('lawful_catcher');
  a.step(1);
  prepareTerminal(m.heist.arbiter, (a.state.tick | 0) + 1);
  const receipt = m.heist.arbiter.receipt;
  assert.equal(receipt.outcome, 'lawful_confiscation');
  assert.equal(Object.keys(m.heist.arbiter.effects).length, 0, 'no effect has landed yet');
  const saved = a.save();

  const b = reload(saved, a.state.tick);
  const restored = b.mission();
  assert.equal(restored.heist.arbiter.receipt.outcome, 'lawful_confiscation',
    'a reload cannot choose a different winner');
  b.step(4);
  assert.equal(b.settlements.failed, 1);
  assert.equal(b.payouts().length, 0, 'confiscation never pays, before or after a reload');
});

test('save point 8 — post-commit, pre-mission-event: the settlement completes without re-consuming', () => {
  const a = boot();
  const m = a.accept();
  assert.ok(a.stepToLaunch());
  a.latch();
  a.step(2);
  a.contact('fence_receiver');
  a.step(1);
  prepareTerminal(m.heist.arbiter, (a.state.tick | 0) + 1);
  const receipt = m.heist.arbiter.receipt;
  a.facilities.prepareReceiverHandoff({
    receiptId: receipt.receiptId, facilityId: 'fence_receiver',
    payloadStableId: PQ019_CAPSULE.stableId,
  });
  const committed = a.facilities.commitReceiverHandoff(receipt.receiptId);
  assert.equal(committed.committed, true);
  // Journal the receiver commit the way settleTerminal would, then die before the mission event.
  m.heist.arbiter.effects[receipt.effectKeys.receiverCommit] = {
    key: receipt.effectKeys.receiverCommit, effectId: 'pre-reload', tick: 0, note: null,
  };
  assert.equal(a.settlements.completed, 0, 'the mission event has not fired yet');
  const saved = a.save();

  const b = reload(saved, a.state.tick);
  let receiverCommits = 0;
  b.bus.on('heist:receiverCommitted', () => { receiverCommits++; });
  b.step(4);
  assert.equal(receiverCommits, 0, 'the capsule is never consumed a second time');
  assert.equal(b.settlements.completed, 1, 'the pending mission settlement completes');
  assert.equal(b.payouts().length, 1, 'exactly one payout across the whole crash window');
});

// ── 9. Missing projection ──────────────────────────────────────────────────────────────────────

test('save point 9 — missing projection: a half-decided record fails closed, never pays', () => {
  const a = boot();
  const m = a.accept();
  assert.ok(a.stepToLaunch());
  a.latch();
  a.step(2);
  a.contact('fence_receiver');
  a.step(1);
  prepareTerminal(m.heist.arbiter, (a.state.tick | 0) + 1);
  const saved = a.save();
  // The projection is gone but the phase still claims a decision was reached — the exact shape that
  // would otherwise come back UNFROZEN and mint a SECOND receipt with new effect keys.
  assert.equal(saved.active[0].heist.arbiter.phase, 'resolution_pending');
  saved.active[0].heist.arbiter.receipt = null;

  const b = reload(saved, a.state.tick);
  const restored = b.mission();
  assert.equal(restored.heist.reconciled, 'arbiter_refused', 'restoreArbiter refuses the record');
  assert.equal(restored.heist.arbiter.receipt, null, 'no second receipt is minted');
  b.step(6);
  assert.equal(b.mission(), null);
  assert.equal(b.settlements.failed, 1, 'it settles as the unresolved case it actually is');
  assert.equal(b.payouts().length, 0, 'a lost projection never pays');
  assert.equal(roleEntities(b.state, 'cargo_capsule').length, 0);
});

test('a mangled heist subrecord never strands the mission or pays', () => {
  const a = boot();
  a.accept();
  a.step(2);
  const saved = a.save();
  saved.active[0].heist.arbiter = { schema: 'not.a.real.schema', candidates: 'nonsense' };
  saved.active[0].heist.launchTick = 12;

  const b = reload(saved, a.state.tick);
  b.step(8);
  assert.equal(b.mission(), null, 'a corrupt record still settles rather than stranding');
  assert.equal(b.payouts().length, 0);
  assert.equal(b.settlements.failed, 1);
});

test('reloading the same save twice reaches the identical outcome', () => {
  const a = boot();
  const m = a.accept();
  assert.ok(a.stepToLaunch());
  a.latch();
  a.step(2);
  a.contact('fence_receiver');
  a.step(1);
  prepareTerminal(m.heist.arbiter, (a.state.tick | 0) + 1);
  const saved = a.save();

  const first = reload(saved, a.state.tick);
  first.step(6);
  const second = reload(JSON.parse(JSON.stringify(saved)), a.state.tick);
  second.step(6);
  assert.equal(first.settlements.completed, second.settlements.completed);
  assert.equal(first.payouts().length, second.payouts().length);
  assert.equal(first.payouts()[0].amount, second.payouts()[0].amount);
  assert.equal(first.payouts().length, 1, 'each independent reload pays exactly once');
});
