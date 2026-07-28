// PQ-019C — the packet's owner invariants, measured IN `missions.js`.
//
// PQ-019B proved each count was REACHABLE exactly once through the arbiter's effect journal, using a
// stand-in consumer. Its receipt says so explicitly and does not claim the mission layer. This suite
// is the row it left open: the same list, produced by the real mission owner settling through its
// own `_completeMission` / `_failMission` paths.
//
//   terminalReceiptCount == 1
//   capsuleProjectionCount <= 1
//   receiverCommitCount <= 1
//   missionSettlementCount == 1
//   economyRewardCount == (outcome == fenced_success ? 1 : 0)
//   factionOutcomeCount <= 1
//   heatApplicationCount == (validatedWitnessedTheft ? 1 : 0)
//   playerCargoMutationCountForCapsule == 0
//   sectorOwnershipMutationCount == 0
//   activeJobControlClaimsAfterTerminal == 0
//
// MEASUREMENT RULE, inherited from PQ-019B: where a count can be read as a REAL side effect it is
// read that way — bus emissions from missions.js, heat's durable applied-incident ledger, live
// capsule entities, live job claims, cargo and sector-ownership diffs — rather than from the journal
// that is supposed to bound it. The journal is asserted to AGREE, which is a second, independent
// reading rather than the only one.

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

const HEIST_SYSTEMS = [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions];

function roleEntities(state, role) {
  return state.entityList.filter((e) => e?.alive !== false && e.data?.heistFacilityRole === role);
}

/**
 * A real world with the real mission owner in it. Every count below is wired to a REAL emission or
 * a real durable ledger; nothing is inferred from the arbiter unless explicitly labelled.
 */
function scene({ seed = 19019, launchWindowS = 1, withPatrol = true } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: HEIST_SYSTEMS });
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

  const missionsSys = sim.registry.get('missions');
  const jobs = sim.registry.get('npcJobsRuntime');

  const counts = {
    economyRewardCount: 0,
    economyChargeCount: 0,
    missionCompletedCount: 0,
    missionFailedCount: 0,
    missionExpiredCount: 0,
    factionRepDeltaCount: 0,
    receiverCommitCount: 0,
  };
  const grants = [];
  bus.on('economy:grantCredits', (p) => {
    grants.push(p);
    counts.economyRewardCount++;
  });
  bus.on('economy:chargeCredits', () => { counts.economyChargeCount++; });
  bus.on('mission:completed', () => { counts.missionCompletedCount++; });
  bus.on('mission:failed', () => { counts.missionFailedCount++; });
  bus.on('mission:expired', () => { counts.missionExpiredCount++; });
  bus.on('faction:repDelta', () => { counts.factionRepDeltaCount++; });
  bus.on('heist:receiverCommitted', () => { counts.receiverCommitCount++; });
  const cues = [];
  bus.on('heist:missionCue', (p) => cues.push(p));

  const maxCapsules = { value: 0 };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step(SIM_DT);
      maxCapsules.value = Math.max(maxCapsules.value, roleEntities(state, 'cargo_capsule').length);
    }
  };

  const baseline = {
    cargo: JSON.stringify(state.player.cargo?.items || {}),
    sectors: JSON.stringify(state.world.sectors || {}),
  };

  // A lawful station and a real patrol JOB, so jurisdiction, witnesses and responders are facts
  // about the world rather than fixtures the mission invented. Anchored on the launcher head so the
  // theft happens inside a real protection radius.
  const launcherHead = roleEntities(state, 'heist_launcher_head')[0];
  const anchor = launcherHead ? { x: launcherHead.pos.x, z: launcherHead.pos.z } : { x: 0, z: 0 };
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: anchor.x + 120, z: anchor.z }, radius: 42,
    data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
  });
  let jobId = null;
  let patrolHull = null;
  if (withPatrol) {
    patrolHull = sim.spawn({
      type: 'ship', team: 2, factionId: 'faction_scn',
      pos: { x: anchor.x + 200, z: anchor.z + 60 }, radius: 9, hull: 100, hullMax: 100,
      data: { worldRecordId: 'wr_tethys_patrol', ai: { lawful: true, archetype: 'patrol_lawman' } },
    });
    jobId = jobs.assign(patrolHull, {
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
    sim, state, bus, player, missionsSys, jobs, counts, grants, cues, step, baseline, maxCapsules,
    facilities: sim.registry.get('heistFacilities'),
    law: sim.registry.get('lawSecurity'),
    jobId,
    patrolHull,

    board() {
      return missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
    },

    /** Accept through the ORDINARY route: a board row plus the UI's own accept intent. */
    accept({ attempt = 0 } = {}) {
      const board = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
      // Post an authored row with a short launch window so a focused test does not have to step the
      // full authored countdown. The row is otherwise the shipped offer, on the shipped board, and
      // is accepted by the shipped `ui:acceptMission` intent.
      board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
      const offer = buildHeistOffer({ epoch: 0, attempt });
      offer.params.launchWindowS = launchWindowS;
      board.slots.unshift(offer);
      bus.emit('ui:acceptMission', { missionId: offer.id });
      return t.mission();
    },

    mission() {
      return (state.missions.active || []).find((m) => m && m.heist) || null;
    },

    capsule() {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },

    /** Step until the capsule is physically launched, or give up. */
    stepToLaunch(maxSteps = 400) {
      for (let i = 0; i < maxSteps; i++) {
        step(1);
        if (t.capsule()) return true;
      }
      return false;
    },

    /**
     * A real Rapier-shaped contact through the facility owner's own `physics:impact` handler, which
     * re-validates the collision mask, the static head, the schedule status and the capsule identity
     * before it will produce a custody receipt.
     */
    contact(facilityId, tickOffset = 1) {
      const head = roleEntities(state, `${facilityId}_head`)[0];
      const capsule = t.capsule();
      assert.ok(head && capsule, `contact needs a live ${facilityId} head and capsule`);
      bus.emit('physics:impact', {
        tick: (state.tick | 0) + tickOffset, aId: capsule.id, bId: head.id, dp: 50,
        pos: { x: head.pos.x, z: head.pos.z },
      });
    },

    /** Possession through the EXISTING tether latch event, not a mission-owned physics write. */
    latch() {
      const capsule = t.capsule();
      assert.ok(capsule, 'latch needs a live capsule');
      bus.emit('tether:latched', { targetId: capsule.id, type: 'tether_massline' });
    },

    /** Every packet counter for one settled run. */
    invariants(mission) {
      const record = mission?.heist || null;
      const arbiter = record?.arbiter || null;
      const receipt = arbiter?.receipt || null;
      const effects = arbiter?.effects || {};
      const journalled = (slot) => (receipt && effects[receipt.effectKeys[slot]] ? 1 : 0);
      const rewardGrants = grants.filter((g) => (
        typeof g?.reason === 'string' && g.reason.startsWith('mission:')
      )).length;
      return {
        terminalReceiptCount: receipt ? 1 : 0,
        terminalOutcome: receipt ? receipt.outcome : null,
        terminalStatus: receipt ? receipt.status : null,
        capsuleProjectionCount: maxCapsules.value,
        receiverCommitCount: counts.receiverCommitCount,
        // Measured from the mission owner's own settlement emissions, not the journal.
        missionSettlementCount: counts.missionCompletedCount + counts.missionFailedCount
          + counts.missionExpiredCount,
        economyRewardCount: rewardGrants,
        factionOutcomeCount: counts.missionCompletedCount + counts.factionRepDeltaCount,
        heatApplicationCount: Object.keys(state.player.heatIncidentsApplied || {}).length,
        playerCargoMutationCountForCapsule:
          JSON.stringify(state.player.cargo?.items || {}) === baseline.cargo ? 0 : 1,
        sectorOwnershipMutationCount:
          JSON.stringify(state.world.sectors || {}) === baseline.sectors ? 0 : 1,
        activeJobControlClaimsAfterTerminal: jobs.activeControlClaimCount(),
        journal: {
          missionSettlement: journalled('missionSettlement'),
          economyReward: journalled('economyReward'),
          factionOutcome: journalled('factionOutcome'),
          receiverCommit: journalled('receiverCommit'),
          heatApplication: journalled('heatApplication'),
          lawIncident: journalled('lawIncident'),
        },
      };
    },
  };
  return t;
}

/** The packet's list, asserted in full. `fenced` decides the one count that varies. */
function assertPacketInvariants(inv, { outcome, witnessedTheft }) {
  assert.equal(inv.terminalReceiptCount, 1, 'terminalReceiptCount == 1');
  assert.equal(inv.terminalOutcome, outcome);
  assert.equal(inv.terminalStatus, 'committed');
  assert.ok(inv.capsuleProjectionCount <= 1, 'capsuleProjectionCount <= 1');
  assert.ok(inv.receiverCommitCount <= 1, 'receiverCommitCount <= 1');
  assert.equal(inv.missionSettlementCount, 1, 'missionSettlementCount == 1');
  assert.equal(inv.economyRewardCount, outcome === 'fenced_success' ? 1 : 0,
    'economyRewardCount == (fenced ? 1 : 0)');
  assert.ok(inv.factionOutcomeCount <= 1, 'factionOutcomeCount <= 1');
  assert.equal(inv.heatApplicationCount, witnessedTheft ? 1 : 0,
    'heatApplicationCount == (validatedWitnessedTheft ? 1 : 0)');
  assert.equal(inv.playerCargoMutationCountForCapsule, 0);
  assert.equal(inv.sectorOwnershipMutationCount, 0);
  assert.equal(inv.activeJobControlClaimsAfterTerminal, 0);
  // Second, independent reading: the journal agrees with the real emissions.
  assert.equal(inv.journal.missionSettlement, 1);
  assert.equal(inv.journal.economyReward, outcome === 'fenced_success' ? 1 : 0);
  assert.equal(inv.journal.heatApplication, witnessedTheft ? 1 : 0);
}

// ── The ordinary board / accept / abandon route ─────────────────────────────────────────────────

test('the authored heist is boardable on Tethys and reachable only there', () => {
  const t = scene();
  const board = t.board();
  const rows = board.slots.filter((o) => o && o.type === PQ019C_HEIST_TYPE);
  assert.equal(rows.length, 1, 'exactly one authored heist row on the Tethys board');
  assert.equal(rows[0].source, 'heistContract');
  assert.equal(rows[0].collateral_cr, 0, 'no collateral: a refund would be a second economy grant');
  assert.equal(rows[0].duration_s, undefined, 'no mission deadline: expiry is arbitrated');

  // Every other station board carries none of it, at any epoch.
  for (const stationId of ['station_helios', 'station_drift', 'station_customs', 'station_forge']) {
    const other = t.missionsSys.ensureBoard(stationId);
    if (!other) continue;
    assert.equal(other.slots.filter((o) => o && o.type === PQ019C_HEIST_TYPE).length, 0,
      `${stationId} must not carry the authored heist`);
  }
});

test('procedural generation can never roll the authored heist type', () => {
  const t = scene();
  // Drive many station-epoch rolls and assert the type never appears from _generateOffers.
  let rolled = 0;
  for (const stationId of ['station_helios', 'station_drift', 'station_forge', 'station_depot3',
    'station_smuggler', 'station_customs']) {
    for (let epoch = 0; epoch < 40; epoch++) {
      const board = t.missionsSys.ensureBoard(stationId);
      if (!board) continue;
      rolled += board.slots.length;
      assert.equal(board.slots.filter((o) => o && o.type === PQ019C_HEIST_TYPE).length, 0);
      t.state.simTime += 601; // force the next board epoch
    }
  }
  assert.ok(rolled > 50, 'the sweep must actually have generated offers');
});

test('accepting the board row creates one active heist with an inert arbiter', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(m, 'the ordinary ui:acceptMission intent must create the instance');
  assert.equal(m.type, PQ019C_HEIST_TYPE);
  assert.equal(m.deadline_s, null, 'no mission-clock deadline');
  assert.equal(m.heist.schema, 'spaceface.heistMission.v1');
  assert.equal(m.heist.arbiter.phase, 'scheduled');
  assert.equal(m.heist.arbiter.receipt, null);
  assert.equal(t.counts.economyChargeCount, 0, 'no collateral or upfront charge');
  // The board row is consumed by acceptance, and no second one appears while it is active.
  const board = t.board();
  assert.equal(board.slots.filter((o) => o && o.type === PQ019C_HEIST_TYPE).length, 0);
});

test('abandoning a heist settles through the arbiter, never behind its back', () => {
  const t = scene();
  const m = t.accept();
  t.step(2);
  t.bus.emit('ui:abandonMission', { missionId: m.id });
  assert.equal(m.heist.arbiter.receipt.outcome, 'abandoned');
  const inv = t.invariants(m);
  assertPacketInvariants(inv, { outcome: 'abandoned', witnessedTheft: false });
  assert.equal(t.counts.missionFailedCount, 1);
  assert.equal(t.mission(), null, 'the mission left the active list');
});

// ── Route matrix: every terminal outcome, with the full invariant list ──────────────────────────

test('lawful observe: an untouched capsule reaching the catcher pays nothing', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch(), 'the capsule must physically launch');
  t.contact('lawful_catcher');
  t.step(4);
  const inv = t.invariants(m);
  assertPacketInvariants(inv, { outcome: 'lawful_arrival_observed', witnessedTheft: false });
  assert.equal(t.counts.missionCompletedCount, 0, 'a lawful arrival is not a completion');
});

test('successful heist: possession, witnessed theft, fence delivery, exactly one payout', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  assert.equal(m.heist.possessionEver, true);
  assert.ok(m.heist.lawIncidentReceiptId, 'a witnessed theft must produce a law receipt');
  t.step(2);
  t.contact('fence_receiver');
  t.step(4);
  const inv = t.invariants(m);
  assertPacketInvariants(inv, { outcome: 'fenced_success', witnessedTheft: true });
  assert.equal(inv.receiverCommitCount, 1, 'the fence physically consumed the capsule');
  assert.equal(t.counts.missionCompletedCount, 1);
  const payout = t.grants.filter((g) => String(g.reason || '').startsWith('mission:'));
  assert.equal(payout.length, 1);
  assert.equal(payout[0].amount, PQ019C_HEIST_TUNING.payoutCr);
  assert.equal(t.capsule(), null, 'the capsule is gone: consumed, not duplicated');
});

test('confiscation: a stolen capsule recovered at the catcher pays nothing but still charged heat', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.contact('lawful_catcher');
  t.step(4);
  const inv = t.invariants(m);
  assertPacketInvariants(inv, { outcome: 'lawful_confiscation', witnessedTheft: true });
  assert.equal(inv.economyRewardCount, 0, 'confiscation never pays');
});

test('destruction: a destroyed capsule is arbitrated, not silently failed', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  const capsule = t.capsule();
  // What a lethal hit leaves behind: no hull, and the end-of-step sweep collects it. The player is
  // still in the sector, so this is destruction rather than absence.
  capsule.hull = 0;
  capsule.alive = false;
  t.step(4);
  const inv = t.invariants(m);
  assertPacketInvariants(inv, { outcome: 'payload_destroyed', witnessedTheft: true });
});

test('expiry: the run window closes as a candidate, never as a mission deadline', () => {
  const t = scene();
  const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
  const offer = buildHeistOffer({ epoch: 0 });
  offer.params.launchWindowS = 1;
  offer.params.runWindowTicks = 12;
  board.slots.unshift(offer);
  t.bus.emit('ui:acceptMission', { missionId: offer.id });
  const m = t.mission();
  assert.ok(t.stepToLaunch());
  t.step(20);
  const inv = t.invariants(m);
  assertPacketInvariants(inv, { outcome: 'expired', witnessedTheft: false });
  assert.equal(t.counts.missionExpiredCount, 0,
    '_expireMission must never run: it would settle with zero terminal receipts');
  assert.equal(t.counts.missionFailedCount, 1);
});

test('absence: a capsule that leaves the field resolves unresolved_absent with no payout', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(1);
  // Sector exit removes the transient capsule without a destruction event — the facility owner's
  // own dematerialize path, not a synthetic delete.
  t.bus.emit('sector:exit', { sectorId: PQ019_HEIST_SECTOR_ID });
  t.step(6);
  const inv = t.invariants(m);
  assertPacketInvariants(inv, { outcome: 'unresolved_absent', witnessedTheft: true });
  assert.equal(inv.economyRewardCount, 0, 'absence never fabricates a payout');
});

// ── Pursuit ────────────────────────────────────────────────────────────────────────────────────

test('pursuit borrows a real patrol job and hands every hull back at terminal', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  assert.equal(m.heist.responderAvailability, 'available');
  assert.ok(m.heist.leases.length >= 1, 'a real, already-flying patrol job was leased');
  assert.ok(m.heist.leases.length <= PQ019C_HEIST_TUNING.responderLeaseCap);
  assert.equal(t.jobs.activeControlClaimCount(), m.heist.leases.length);
  t.step(2);
  t.contact('fence_receiver');
  t.step(4);
  assert.equal(t.jobs.activeControlClaimCount(), 0, 'activeJobControlClaimsAfterTerminal == 0');
  assert.equal(m.heist.leases.length, 0);
});

test('no patrol in range is a recorded outcome, not permission to spawn one', () => {
  const t = scene({ withPatrol: false });
  const before = t.state.entityList.length;
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  assert.equal(m.heist.responderAvailability, 'none_in_range');
  assert.equal(m.heist.leases.length, 0, 'no lease is taken when nobody can be steered');
  const lawful = t.state.entityList.filter((e) => e?.data?.ai?.archetype === 'patrol_lawman');
  assert.equal(lawful.length, 0, 'the mission must never manufacture a responder');
  assert.ok(t.state.entityList.length <= before + 1, 'only the capsule was added');
  // The law owner records the absence in its own visible ledger.
  const rows = (t.state.lawSecurity.receipts || []).filter((r) => r && r.outcome === 'dispatch_unavailable');
  assert.ok(rows.length >= 1, 'law records "no patrol in range" as a visible row');
});

// ── Adversarial: duplicates, stale reports, replay ──────────────────────────────────────────────

test('duplicate and stale facility contacts cannot settle twice or change the outcome', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.contact('fence_receiver');
  t.contact('fence_receiver');            // exact duplicate, same tick
  t.step(4);
  const receiptId = m.heist.arbiter.receipt.receiptId;
  // A late, higher-precedence report arrives after the journal froze. It must be REFUSED, not
  // allowed to overturn a decided outcome.
  const before = JSON.stringify(m.heist.arbiter.receipt);
  t.bus.emit('heist:facilityCandidate', {
    scheduleId: m.heist.scheduleId, kind: 'lawful_catch_contact',
    payloadStableId: PQ019_CAPSULE.stableId, facilityId: 'lawful_catcher',
    receiptId: 'forged', tick: (t.state.tick | 0) + 1,
  });
  t.step(3);
  assert.equal(JSON.stringify(m.heist.arbiter.receipt), before, 'the terminal receipt is immutable');
  assert.equal(m.heist.arbiter.receipt.receiptId, receiptId);
  const inv = t.invariants(m);
  assertPacketInvariants(inv, { outcome: 'fenced_success', witnessedTheft: true });
});

test('re-driving a settled record applies nothing a second time', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.contact('fence_receiver');
  t.step(4);
  const snapshot = t.invariants(m);
  // Replay the settlement path directly, the way a duplicate callback or a resumed crash would.
  for (let i = 0; i < 3; i++) {
    t.missionsSys._driveHeist(m, 0);
  }
  const after = t.invariants(m);
  assert.deepEqual(after, snapshot, 'a replayed settlement is a no-op in every counter');
});

test('a forged theft report cannot reach heat without a law-signed receipt', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  const heatBefore = t.state.player.heat;
  // A hand-rolled "receipt" that never went through lawSecurity.
  t.bus.emit('law:reportIncidentReceipt', {
    accepted: true, incidentReceiptId: 'forged:incident', kind: 'payload_theft',
    validatedWitnessedTheft: true, source: 'not_lawSecurity',
  });
  t.step(2);
  assert.equal(t.state.player.heat, heatBefore, 'heat only opens for a law-signed receipt');
  assert.equal(Object.keys(t.state.player.heatIncidentsApplied || {}).length, 0);
  void m;
});
