// PQ-019B — the packet's owner-invariant list, encoded verbatim and measured across arbitration and
// all four owner seams, including reload and duplicate application.
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
// SCOPE HONESTY: mission wiring is PQ-019C. The `Consumer` below stands in for the mission owner and
// uses ONLY the public arbiter + seam APIs, so what is proven here is that those contracts make each
// count reachable exactly once — not that missions.js already does it. Where a count can be measured
// as a REAL side effect (receiver commits, heat mutations, live capsule entities, job claims, cargo,
// sector ownership) it is measured that way rather than from the journal that is supposed to bound it.

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
import { PQ019_CAPSULE, PQ019_HEIST_SECTOR_ID } from '../src/data/heistFacilities.js';
import {
  applyTransition,
  arbiterInvariants,
  commitTerminal,
  createArbiter,
  recordEffect,
  restoreArbiter,
  serializeArbiter,
  stepArbiter,
  submitCandidate,
} from '../src/missions/heistArbiter.js';

const MISSION = 'mission_pq019_heist';
const PAYLOAD = PQ019_CAPSULE.stableId;
const SCHEDULE = 'pq019b-invariants';

function roleEntities(state, role) {
  return state.entityList.filter((e) => e?.alive !== false && e.data?.heistFacilityRole === role);
}

function boot(seed = 19019) {
  const bus = createBus();
  const sim = createSimulation({
    seed, bus,
    systems: [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  return {
    sim, state, bus, player,
    facilities: sim.registry.get('heistFacilities'),
    law: sim.registry.get('lawSecurity'),
    heat: sim.registry.get('heat'),
    jobs: sim.registry.get('npcJobsRuntime'),
  };
}

/**
 * The whole world a heist runs in, plus every counter the packet names. Counts REAL effects: bus
 * commits, heat mutations, live capsule entities, live job claims, cargo and sector-ownership diffs.
 */
function scene(seed = 19019) {
  const t = boot(seed);
  const counts = {
    receiverCommitCount: 0,
    heatApplicationCount: 0,
    missionSettlementCount: 0,
    economyRewardCount: 0,
    factionOutcomeCount: 0,
    capsuleProjectionCount: 0,
  };
  t.bus.on('heist:receiverCommitted', () => { counts.receiverCommitCount++; });
  t.bus.on('heat:changed', (p) => {
    if (p && typeof p.reason === 'string' && p.reason.startsWith('law incident')) {
      counts.heatApplicationCount++;
    }
  });

  // Launch, then anchor the law fixture on the capsule's real position so jurisdiction and witnesses
  // are true facts about where the theft happens rather than hard-coded coordinates.
  t.facilities.requestLaunchSchedule({ scheduleId: SCHEDULE, launchAtSimT: t.state.simTime });
  t.sim.step(SIM_DT);
  const capsule = t.state.entities.get(t.state.heistFacilities.capsuleEntityId);
  assert.ok(capsule, 'the scene must launch a real capsule');
  const theftPos = { x: capsule.pos.x, z: capsule.pos.z };

  t.sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: theftPos.x + 120, z: theftPos.z }, radius: 42,
    data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
  });
  const patrolHull = t.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: theftPos.x + 200, z: theftPos.z + 60 }, radius: 9, hull: 100, hullMax: 100,
    data: { worldRecordId: 'wr_tethys_patrol', ai: { lawful: true, archetype: 'patrol_lawman' } },
  });
  const jobId = t.jobs.assign(patrolHull, {
    kind: NPC_JOB_KIND.PATROL,
    route: [
      { id: 'b0', pos: { x: theftPos.x + 200, z: theftPos.z } },
      { id: 'b1', pos: { x: theftPos.x, z: theftPos.z + 200 } },
    ],
    sectorId: PQ019_HEIST_SECTOR_ID,
    speed: 100, commissionS: 1, departS: 1, approachS: 1,
    workS: 2, loadS: 1, unloadS: 1, dwellS: 1,
  });
  assert.ok(jobId, 'the scene must own a real patrol job');

  const baseline = {
    cargo: JSON.stringify(t.state.player.cargo?.items || {}),
    sectors: JSON.stringify(t.state.world.sectors || {}),
  };
  const maxCapsules = { value: roleEntities(t.state, 'cargo_capsule').length };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      t.sim.step(SIM_DT);
      maxCapsules.value = Math.max(maxCapsules.value, roleEntities(t.state, 'cargo_capsule').length);
    }
  };

  return {
    ...t, counts, capsule, theftPos, patrolHull, jobId, baseline, maxCapsules, step,
    finalize() {
      counts.capsuleProjectionCount = maxCapsules.value;
      return {
        ...counts,
        playerCargoMutationCountForCapsule:
          JSON.stringify(t.state.player.cargo?.items || {}) === baseline.cargo ? 0 : 1,
        sectorOwnershipMutationCount:
          JSON.stringify(t.state.world.sectors || {}) === baseline.sectors ? 0 : 1,
        activeJobControlClaimsAfterTerminal: t.jobs.activeControlClaimCount(),
      };
    },
  };
}

/**
 * Stands in for the mission owner (PQ-019C). Every terminal effect is gated by the arbiter's effect
 * journal, so calling `applyTerminalEffects` any number of times must produce the same world.
 */
class Consumer {
  constructor(s) {
    this.s = s;
    this.arbiter = createArbiter({ missionId: MISSION, payloadStableId: PAYLOAD, createdAtTick: 0 });
    applyTransition(this.arbiter, 'launched');
  }

  reportTheft() {
    // The mission NEVER writes heat. It reports to law; law validates; heat listens.
    return this.s.law.reportIncident({
      reportId: `${MISSION}:theft`,
      kind: 'payload_theft',
      offenderStableId: 'player',
      offenderEntityId: this.s.state.playerId,
      payloadStableId: PAYLOAD,
      causalTick: this.s.state.tick | 0,
      pos: { ...this.s.theftPos },
    });
  }

  claimPatrol() {
    return this.s.jobs.claimControl(this.s.jobId, {
      claimId: `${MISSION}:pursuit`, holder: 'heistPursuit',
    });
  }

  contact(facilityId) {
    const head = roleEntities(this.s.state, `${facilityId}_head`)[0];
    const capsule = this.s.state.entities.get(this.s.state.heistFacilities.capsuleEntityId);
    this.s.bus.emit('physics:impact', {
      tick: this.s.state.tick + 1, aId: capsule.id, bId: head.id, dp: 50,
      pos: { x: head.pos.x, z: head.pos.z },
    });
  }

  submit(kind, sourceStableId, causalTick) {
    return submitCandidate(this.arbiter, {
      missionId: MISSION, payloadStableId: PAYLOAD, kind, sourceStableId, causalTick,
    });
  }

  decide(tick) {
    return stepArbiter(this.arbiter, tick);
  }

  /** Idempotent by construction: every effect is gated on a first-and-only journal grant. */
  applyTerminalEffects() {
    const receipt = this.arbiter.receipt;
    if (!receipt) return false;
    const keys = receipt.effectKeys;
    const s = this.s;

    // Receiver: only outcomes where the payload physically changes hands consume it.
    if (receipt.outcome === 'fenced_success' || receipt.outcome === 'lawful_confiscation') {
      if (recordEffect(this.arbiter, keys.receiverCommit, { tick: receipt.causalTick }).applied) {
        const facilityId = receipt.outcome === 'fenced_success' ? 'fence_receiver' : 'lawful_catcher';
        const prepared = s.facilities.prepareReceiverHandoff({
          receiptId: receipt.receiptId, facilityId, payloadStableId: PAYLOAD,
        });
        if (prepared.prepared) s.facilities.commitReceiverHandoff(receipt.receiptId);
      }
    }
    if (receipt.outcome === 'fenced_success'
      && recordEffect(this.arbiter, keys.economyReward, { tick: receipt.causalTick }).applied) {
      s.counts.economyRewardCount++;
    }
    if (recordEffect(this.arbiter, keys.factionOutcome, { tick: receipt.causalTick }).applied) {
      s.counts.factionOutcomeCount++;
    }
    if (recordEffect(this.arbiter, keys.jobControlRelease, { tick: receipt.causalTick }).applied) {
      s.jobs.releaseControl(s.jobId, `${MISSION}:pursuit`);
    }
    if (recordEffect(this.arbiter, keys.missionSettlement, { tick: receipt.causalTick }).applied) {
      s.counts.missionSettlementCount++;
    }
    commitTerminal(this.arbiter, receipt.receiptId);
    return true;
  }
}

/** Assert the packet's list, verbatim, for one finished route. */
function assertInvariants(s, arbiter, { outcome, validatedWitnessedTheft }) {
  const measured = s.finalize();
  const journal = arbiterInvariants(arbiter);

  assert.equal(journal.terminalReceiptCount, 1, 'terminalReceiptCount == 1');
  assert.equal(journal.terminalOutcome, outcome);
  assert.ok(measured.capsuleProjectionCount <= 1, 'capsuleProjectionCount <= 1');
  assert.ok(measured.receiverCommitCount <= 1, 'receiverCommitCount <= 1');
  assert.equal(measured.missionSettlementCount, 1, 'missionSettlementCount == 1');
  assert.equal(measured.economyRewardCount, outcome === 'fenced_success' ? 1 : 0,
    'economyRewardCount == (outcome == fenced_success ? 1 : 0)');
  assert.ok(measured.factionOutcomeCount <= 1, 'factionOutcomeCount <= 1');
  assert.equal(measured.heatApplicationCount, validatedWitnessedTheft ? 1 : 0,
    'heatApplicationCount == (validatedWitnessedTheft ? 1 : 0)');
  assert.equal(measured.playerCargoMutationCountForCapsule, 0,
    'playerCargoMutationCountForCapsule == 0');
  assert.equal(measured.sectorOwnershipMutationCount, 0, 'sectorOwnershipMutationCount == 0');
  assert.equal(measured.activeJobControlClaimsAfterTerminal, 0,
    'activeJobControlClaimsAfterTerminal == 0');
  return measured;
}

// ── routes ──────────────────────────────────────────────────────────────────────────────────────

test('fenced_success: theft, pursuit, fence handoff — every invariant holds', () => {
  const s = scene();
  const c = new Consumer(s);

  const incident = c.reportTheft();
  assert.equal(incident.accepted, true);
  assert.equal(c.claimPatrol().granted, true);
  applyTransition(c.arbiter, 'possessed');
  s.step(4);

  c.contact('fence_receiver');
  c.submit('fenced_success', 'fence_receiver', s.state.tick | 0);
  const decided = c.decide((s.state.tick | 0) + 1);
  assert.equal(decided.receipt.outcome, 'fenced_success');

  // Applied repeatedly on purpose: duplicate delivery must not double anything.
  for (let i = 0; i < 4; i++) c.applyTerminalEffects();
  s.step(2);

  const measured = assertInvariants(s, c.arbiter, {
    outcome: 'fenced_success', validatedWitnessedTheft: true,
  });
  assert.equal(measured.receiverCommitCount, 1, 'the payload was physically delivered exactly once');
  assert.equal(roleEntities(s.state, 'cargo_capsule').length, 0, 'and consumed');
});

test('lawful_arrival_observed: no theft is reported, so no heat and no reward', () => {
  const s = scene();
  const c = new Consumer(s);
  s.step(4);

  c.contact('lawful_catcher');
  c.submit('lawful_arrival_observed', 'lawful_catcher', s.state.tick | 0);
  assert.equal(c.decide((s.state.tick | 0) + 1).receipt.outcome, 'lawful_arrival_observed');
  for (let i = 0; i < 3; i++) c.applyTerminalEffects();

  const measured = assertInvariants(s, c.arbiter, {
    outcome: 'lawful_arrival_observed', validatedWitnessedTheft: false,
  });
  assert.equal(measured.receiverCommitCount, 0, 'a lawful arrival is not a receiver handoff');
  assert.equal(s.state.player.heat, 0, 'watching a delivery arrive is not a crime');
});

test('lawful_confiscation: the catcher takes the payload back, and nobody is paid', () => {
  const s = scene();
  const c = new Consumer(s);
  assert.equal(c.reportTheft().accepted, true);
  assert.equal(c.claimPatrol().granted, true);
  applyTransition(c.arbiter, 'possessed');
  s.step(4);

  c.contact('lawful_catcher');
  c.submit('lawful_confiscation', 'lawful_catcher', s.state.tick | 0);
  assert.equal(c.decide((s.state.tick | 0) + 1).receipt.outcome, 'lawful_confiscation');
  for (let i = 0; i < 3; i++) c.applyTerminalEffects();
  s.step(2);

  const measured = assertInvariants(s, c.arbiter, {
    outcome: 'lawful_confiscation', validatedWitnessedTheft: true,
  });
  assert.equal(measured.receiverCommitCount, 1);
  assert.equal(measured.economyRewardCount, 0, 'losing the cargo pays nothing');
  assert.ok(s.state.player.heat > 0, 'the crime still happened');
});

test('payload_destroyed: the crime still counts, the receiver never commits', () => {
  const s = scene();
  const c = new Consumer(s);
  assert.equal(c.reportTheft().accepted, true);
  assert.equal(c.claimPatrol().granted, true);
  applyTransition(c.arbiter, 'possessed');
  s.step(4);

  c.submit('payload_destroyed', 'combat', s.state.tick | 0);
  assert.equal(c.decide((s.state.tick | 0) + 1).receipt.outcome, 'payload_destroyed');
  for (let i = 0; i < 3; i++) c.applyTerminalEffects();

  const measured = assertInvariants(s, c.arbiter, {
    outcome: 'payload_destroyed', validatedWitnessedTheft: true,
  });
  assert.equal(measured.receiverCommitCount, 0);
  assert.equal(measured.economyRewardCount, 0);
});

test('an unwitnessed theft applies no heat, and the route still settles exactly once', () => {
  const s = scene();
  const c = new Consumer(s);
  // Report from somewhere the law has no jurisdiction: an explicit denial, not a silent skip.
  const denial = s.law.reportIncident({
    reportId: `${MISSION}:theft`, kind: 'payload_theft', offenderStableId: 'player',
    offenderEntityId: s.state.playerId, payloadStableId: PAYLOAD,
    causalTick: s.state.tick | 0, pos: { x: 900000, z: 900000 },
  });
  assert.equal(denial.accepted, false);
  applyTransition(c.arbiter, 'possessed');
  s.step(4);

  c.contact('fence_receiver');
  c.submit('fenced_success', 'fence_receiver', s.state.tick | 0);
  c.decide((s.state.tick | 0) + 1);
  for (let i = 0; i < 3; i++) c.applyTerminalEffects();
  s.step(2);

  assertInvariants(s, c.arbiter, { outcome: 'fenced_success', validatedWitnessedTheft: false });
  assert.equal(s.state.player.heat, 0, 'no validated incident, no heat');
});

// ── competition, reload, replay ─────────────────────────────────────────────────────────────────

test('competing same-tick candidates still settle exactly once', () => {
  const s = scene();
  const c = new Consumer(s);
  assert.equal(c.reportTheft().accepted, true);
  assert.equal(c.claimPatrol().granted, true);
  applyTransition(c.arbiter, 'possessed');
  s.step(4);

  const tick = s.state.tick | 0;
  c.contact('fence_receiver');
  // Everyone reports at once, several of them twice.
  for (const [kind, source] of [
    ['fenced_success', 'fence_receiver'], ['payload_destroyed', 'combat'],
    ['lawful_confiscation', 'patrol_a'], ['fenced_success', 'fence_receiver'],
    ['expired', 'clock'], ['payload_destroyed', 'combat'],
  ]) c.submit(kind, source, tick);

  assert.equal(c.decide(tick + 1).receipt.outcome, 'payload_destroyed', 'destroyed outranks all');
  for (let i = 0; i < 5; i++) c.applyTerminalEffects();
  s.step(2);

  assertInvariants(s, c.arbiter, {
    outcome: 'payload_destroyed', validatedWitnessedTheft: true,
  });
});

test('a reload between prepare and commit replays every effect without doubling one', () => {
  const s = scene();
  const c = new Consumer(s);
  assert.equal(c.reportTheft().accepted, true);
  assert.equal(c.claimPatrol().granted, true);
  applyTransition(c.arbiter, 'possessed');
  s.step(4);

  c.contact('fence_receiver');
  c.submit('fenced_success', 'fence_receiver', s.state.tick | 0);
  const receipt = c.decide((s.state.tick | 0) + 1).receipt;
  assert.equal(receipt.status, 'prepared');

  // First pass: the receiver actually commits, then the process "dies".
  c.applyTerminalEffects();
  assert.equal(s.counts.receiverCommitCount, 1);

  // The mission owner's durable subrecord is the ONLY thing that survives.
  const durable = JSON.parse(JSON.stringify(serializeArbiter(c.arbiter)));
  const resumed = restoreArbiter(durable);
  assert.equal(resumed.receipt.receiptId, receipt.receiptId);
  c.arbiter = resumed;

  // Replay everything, twice. Nothing may fire a second time.
  for (let i = 0; i < 2; i++) c.applyTerminalEffects();
  s.step(2);

  const measured = assertInvariants(s, c.arbiter, {
    outcome: 'fenced_success', validatedWitnessedTheft: true,
  });
  assert.equal(measured.receiverCommitCount, 1);
  assert.equal(arbiterInvariants(resumed).terminalStatus, 'committed');

  // The heat ledger is durable too: replaying the theft report cannot re-charge it.
  const heatBefore = s.state.player.heat;
  c.reportTheft();
  assert.equal(s.state.player.heat, heatBefore);
  assert.equal(measured.heatApplicationCount, 1);
});

test('a patrol hull destroyed mid-pursuit still leaves zero claims at terminal', () => {
  const s = scene();
  const c = new Consumer(s);
  assert.equal(c.reportTheft().accepted, true);
  assert.equal(c.claimPatrol().granted, true);
  applyTransition(c.arbiter, 'possessed');
  s.step(4);

  // The borrowed patrol dies while the heist is still running.
  s.sim.registry.ctx.helpers.removeEntity(s.patrolHull.id);
  s.step(2);

  c.contact('fence_receiver');
  c.submit('fenced_success', 'fence_receiver', s.state.tick | 0);
  c.decide((s.state.tick | 0) + 1);
  for (let i = 0; i < 3; i++) c.applyTerminalEffects();
  s.step(2);

  assertInvariants(s, c.arbiter, { outcome: 'fenced_success', validatedWitnessedTheft: true });
});

test('exactly one capsule exists at any moment across a whole route', () => {
  const s = scene();
  const c = new Consumer(s);
  assert.equal(c.reportTheft().accepted, true);
  applyTransition(c.arbiter, 'possessed');
  s.step(30);
  assert.equal(s.maxCapsules.value, 1, 'capsuleProjectionCount <= 1 while the route runs');

  // A duplicate schedule request cannot mint a second capsule.
  s.facilities.requestLaunchSchedule({ scheduleId: SCHEDULE, launchAtSimT: s.state.simTime });
  s.facilities.requestLaunchSchedule({ scheduleId: 'another-route', launchAtSimT: s.state.simTime });
  s.step(30);

  c.contact('fence_receiver');
  c.submit('fenced_success', 'fence_receiver', s.state.tick | 0);
  c.decide((s.state.tick | 0) + 1);
  for (let i = 0; i < 2; i++) c.applyTerminalEffects();
  s.step(2);

  assertInvariants(s, c.arbiter, { outcome: 'fenced_success', validatedWitnessedTheft: true });
});
