// test/ordinary-life-rhythm.test.mjs — PQ-143.01
//
// Outcome contract:
//   Between incidents the world does boring jobs on screen (inspections, transfers, repair,
//   waiting for resources/berths, a slow tug moving something enormous), so that when something
//   goes wrong the change is legible. The rhythm work -> travel -> opportunity -> tension ->
//   violence -> aftermath -> quiet is measurable in scene activity over a session.
//
// Tested surfaces:
//   1. Ordinary-life job lifecycle and waiting states (miner, hauler, yard tender, salvor, patrol, surveyor).
//   2. Progress retention across interruptions: transit/return progress is preserved across flee -> resume.
//   3. Violence reactivity: workers hold for ambient violence, a loaded hull keeps its load and leaves slowly, and empty hulls bolt from a real hostile.
//   4. Slow tug moving a real load: yard tender servicing a load, interruptible by player tether or fire.
//   5. Inspections and quiet receipts: patrol scans, seam surveys, and receipts without HUD narration spam.

import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../src/core/sim.js';
import {
  CERES_ACTIVITY_SECTOR_ID,
} from '../src/data/sectorActivityPockets.js';
import { NPC_JOB_KIND, NPC_JOB_PHASE, createJob, advance, interrupt, resume } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';

const SEED = 47;
const CERES = CERES_ACTIVITY_SECTOR_ID;

function makeMockShip(id, {
  role = 'miner',
  kind = NPC_JOB_KIND.MINER,
  worldRecordId = `ceres:test:${id}`,
  pos = { x: 0, z: 0 },
  vel = { x: 0, z: 0 },
  rot = 0,
  cargo = 0,
} = {}) {
  return {
    id,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { ...pos },
    vel: { ...vel },
    rot,
    radius: 8,
    hull: 100,
    hullMax: 100,
    mass: 20,
    maxSpeed: 30,
    data: {
      worldRecordId,
      trafficRole: role,
      jobKind: kind,
      jobId: `job:${worldRecordId}`,
      cargoManifest: cargo > 0 ? { totalQty: cargo, lines: [{ commodityId: 'cmdty_ore_iron', qty: cargo }] } : null,
      intent: { moveX: 0, moveZ: 0, boost: false, brake: false, fire: false, aimAngle: 0 },
    },
  };
}

// ── 1. Ordinary-life job lifecycle and waiting states ─────────────────────────────────────────────

test('ordinary-life rhythm: jobPhase and jobProgress reflect live work and waiting states on entity.data', () => {
  const runtime = Object.create(npcJobsRuntime);
  const ship = makeMockShip(50, { role: 'miner', kind: NPC_JOB_KIND.MINER });
  const route = [
    { id: 'wp_a', label: 'Face', pos: { x: 0, z: 0 } },
    { id: 'wp_b', label: 'Berth', pos: { x: 100, z: 0 } },
  ];
  const job = createJob({
    id: ship.data.jobId,
    kind: NPC_JOB_KIND.MINER,
    sectorId: CERES,
    route,
    speed: 20,
  });
  const entry = {
    job,
    kind: NPC_JOB_KIND.MINER,
    sectorId: CERES,
    worldRecordId: ship.data.worldRecordId,
    entityId: ship.id,
    lastAdvanceSimT: 0,
    control: null,
  };

  runtime.state = {
    mode: 'flight',
    simTime: 1.0,
    entities: new Map([[ship.id, ship]]),
    npcJobs: { byId: { [ship.data.jobId]: entry } },
    world: { currentSectorId: CERES, records: { byId: {} } },
  };

  // Step 1: initial commissioning/transit phase
  runtime.update(SIM_DT);
  assert.equal(ship.data.jobPhase, job.phase);
  assert.equal(typeof ship.data.jobProgress, 'number');

  // Advance into work phase
  job.phase = NPC_JOB_PHASE.WORK;
  job.progress = 0.5;
  runtime.update(SIM_DT);
  assert.equal(ship.data.jobPhase, 'work');
  assert.ok(ship.data.jobProgress >= 0.5, 'job progress reflects progress value and advances with work');

  // Advance into return leg
  job.phase = NPC_JOB_PHASE.RETURN;
  job.progress = 0.2;
  runtime.update(SIM_DT);
  assert.equal(ship.data.jobPhase, 'return');

  // Releasing the job cleans up job telemetry
  runtime.release(ship.data.jobId);
  assert.equal(ship.data.jobPhase, undefined, 'release deletes entity.data.jobPhase');
  assert.equal(ship.data.jobProgress, undefined, 'release deletes entity.data.jobProgress');
  assert.equal(ship.data.jobId, undefined, 'release deletes entity.data.jobId');
});

test('ordinary-life rhythm: miner-hauler handoff stamps readable waiting and delivery statuses', () => {
  const trafficSys = Object.create(traffic);
  const busEvents = [];
  const fakeBus = {
    on(name, fn) { /* noop */ },
    emit(name, payload) { busEvents.push({ name, payload }); },
  };

  const miner = makeMockShip(61, { role: 'miner', kind: NPC_JOB_KIND.MINER });
  const hauler = makeMockShip(62, { role: 'hauler', kind: NPC_JOB_KIND.HAULER });

  trafficSys.state = {
    simTime: 10,
    meta: { seed: SEED },
    world: { currentSectorId: CERES },
    entities: new Map([[miner.id, miner], [hauler.id, hauler]]),
    traffic: {
      freighters: [
        { id: miner.id, role: 'miner', worldRecordId: miner.data.worldRecordId, activityActorSlotId: 'ceres_seam_miner' },
        { id: hauler.id, role: 'hauler', worldRecordId: hauler.data.worldRecordId, activityActorSlotId: 'ceres_refinery_hauler' },
      ],
      appliedArrivalIds: [],
      appliedJobActionIds: [],
    },
  };
  trafficSys.bus = fakeBus;

  const handoff = {
    schema: 'spaceface.ceresMinerHaulerHandoff.v1',
    handoffId: 'test_handoff_1',
    state: 'requested',
    minerWorldRecordId: miner.data.worldRecordId,
    haulerWorldRecordId: hauler.data.worldRecordId,
  };

  // Stamp: waiting for hauler rendezvous
  trafficSys._stampCeresHandoffStatus(miner, handoff, 'HOLDING FOR HAULER', hauler);
  assert.equal(miner.data.ceresHandoffStatus, 'HOLDING FOR HAULER');
  assert.equal(miner.data.ceresHandoffTargetId, hauler.id);

  // Stamp: rendezvous inbound
  trafficSys._stampCeresHandoffStatus(hauler, handoff, 'RENDEZVOUS INBOUND', miner);
  assert.equal(hauler.data.ceresHandoffStatus, 'RENDEZVOUS INBOUND');

  // Stamp: ore transferred, heading for refinery
  trafficSys._stampCeresHandoffStatus(hauler, handoff, 'ORE TRANSFERRED — REFINERY BOUND');
  assert.equal(hauler.data.ceresHandoffStatus, 'ORE TRANSFERRED — REFINERY BOUND');

  // Stamp: approach and docking wait at refinery
  trafficSys._stampCeresHandoffStatus(hauler, handoff, 'REFINERY APPROACH — DOCKING');
  assert.equal(hauler.data.ceresHandoffStatus, 'REFINERY APPROACH — DOCKING');
});

// ── 2. Progress retention across interruptions and sector transitions ────────────────────────────

test('ordinary-life rhythm: transit and return legs preserve progress across violence interruptions', () => {
  const route = [
    { id: 'wp_start', label: 'Origin', pos: { x: 0, z: 0 } },
    { id: 'wp_end', label: 'Destination', pos: { x: 200, z: 0 } },
  ];
  const job = createJob({
    id: 'job:test:retention',
    kind: NPC_JOB_KIND.HAULER,
    sectorId: CERES,
    route,
    speed: 10,
  });

  // Advance into TRANSIT leg at 40% progress
  job.phase = NPC_JOB_PHASE.TRANSIT;
  job.progress = 0.40;
  job.routeIndex = 0;

  // Interruption occurs (gunfire or nearby threat)
  const threat = { entityId: 99, x: 50, z: 50 };
  interrupt(job, threat);

  assert.equal(job.phase, NPC_JOB_PHASE.FLEE);
  assert.equal(job.preInterruptPhase, NPC_JOB_PHASE.TRANSIT);
  assert.equal(job.progress, 0.40, 'interrupt() preserves exact progress');
  assert.equal(job.routeIndex, 0, 'interrupt() preserves routeIndex');

  // Advance while fleeing does not advance transit progress
  advance(job, 1.0);
  assert.equal(job.phase, NPC_JOB_PHASE.FLEE);
  assert.equal(job.progress, 0.40, 'advance() during flee does not mutate progress');

  // Resume when threat clears
  resume(job);
  assert.equal(job.phase, NPC_JOB_PHASE.TRANSIT, 'resume() restores preInterruptPhase');
  assert.equal(job.progress, 0.40, 'resume() retains exact progress');
  assert.equal(job.routeIndex, 0, 'resume() retains routeIndex');
  assert.equal(job.interrupted, false);
});

test('ordinary-life rhythm: sector exit and enter retain job state and relink cleanly', () => {
  const runtime = Object.create(npcJobsRuntime);
  const ship = makeMockShip(81, { role: 'miner', kind: NPC_JOB_KIND.MINER, worldRecordId: 'ceres:miner:81' });
  const route = [
    { id: 'wp_a', label: 'A', pos: { x: 0, z: 0 } },
    { id: 'wp_b', label: 'B', pos: { x: 100, z: 0 } },
  ];
  const job = createJob({
    id: ship.data.jobId,
    kind: NPC_JOB_KIND.MINER,
    sectorId: CERES,
    route,
    speed: 20,
  });
  job.phase = NPC_JOB_PHASE.TRANSIT;
  job.progress = 0.65;

  const entry = {
    job,
    kind: NPC_JOB_KIND.MINER,
    sectorId: CERES,
    worldRecordId: ship.data.worldRecordId,
    entityId: ship.id,
    lastAdvanceSimT: 10,
    control: null,
  };

  runtime.state = {
    simTime: 10,
    entities: new Map([[ship.id, ship]]),
    entityList: [ship],
    npcJobs: { byId: { [ship.data.jobId]: entry } },
    world: { currentSectorId: CERES, records: { byId: {} } },
  };

  // Player departs sector
  runtime._onSectorExit({ sectorId: CERES });
  assert.equal(entry.job.materialized, false, 'job is virtualized on exit');
  assert.equal(entry.entityId, null, 'live entityId unlinked on exit');
  assert.equal(ship.data.jobId, undefined, 'entity data cleared on exit');
  assert.equal(ship.data.jobPhase, undefined, 'entity jobPhase cleared on exit');
  assert.equal(entry.job.progress, 0.65, 'progress retained across exit');

  // Player returns to sector
  runtime.state.simTime = 10.5;
  runtime._onSectorEnter({ sectorId: CERES });

  assert.equal(entry.job.materialized, true, 'job is rematerialized on enter');
  assert.equal(entry.entityId, ship.id, 'entity relinked on enter');
  assert.equal(ship.data.jobId, 'job:ceres:miner:81', 'entity data relinked');
  assert.equal(ship.data.jobPhase, entry.job.phase, 'jobPhase restored on enter');
  assert.ok(entry.job.progress >= 0.65, 'progress advanced truthfully with elapsed time');
});

// ── 3. Violence reactivity: ambient workers hold, loaded hulls leave slowly, empty hulls bolt ─────

test('ordinary-life rhythm: worker hull without cargo holds position when alarmed by violence', () => {
  const runtime = Object.create(npcJobsRuntime);
  const miner = makeMockShip(91, { role: 'miner', kind: NPC_JOB_KIND.MINER, cargo: 0 });
  const entry = {
    job: { phase: NPC_JOB_PHASE.FLEE, corrupt: false },
    kind: NPC_JOB_KIND.MINER,
    entityId: miner.id,
    worldRecordId: miner.data.worldRecordId,
    threatId: null,
    violenceHold: false,
    violenceSlow: false,
    violenceX: 50,
    violenceZ: 0,
  };

  runtime.state = {
    simTime: 5,
    entities: new Map([[miner.id, miner]]),
    npcJobs: { byId: { [miner.data.jobId]: entry } },
    world: { currentSectorId: CERES, records: { byId: {} } },
  };

  runtime._drive(entry, miner);
  assert.equal(miner.data.intent.moveZ, 0, 'worker holds throttle');
  assert.equal(miner.data.intent.boost, false, 'worker does not boost');
  assert.equal(miner.data.intent.brake, true, 'worker brakes to hold station');
});

test('ordinary-life rhythm: worker bolts from a materialized hostile even when it would hold for ambient violence', () => {
  const runtime = Object.create(npcJobsRuntime);
  const miner = makeMockShip(94, { role: 'miner', kind: NPC_JOB_KIND.MINER, cargo: 0 });
  const hostile = {
    id: 904,
    type: 'ship',
    team: 3,
    alive: true,
    pos: { x: 100, z: 0 },
    data: { hostile: true },
  };
  const entry = {
    job: { phase: NPC_JOB_PHASE.FLEE, corrupt: false },
    kind: NPC_JOB_KIND.MINER,
    entityId: miner.id,
    worldRecordId: miner.data.worldRecordId,
    threatId: hostile.id,
    violenceHold: false,
    violenceSlow: false,
    violenceX: 50,
    violenceZ: 0,
  };

  runtime.state = {
    simTime: 5,
    entities: new Map([[miner.id, miner], [hostile.id, hostile]]),
    npcJobs: { byId: { [miner.data.jobId]: entry } },
    world: { currentSectorId: CERES, records: { byId: {} } },
  };

  runtime._drive(entry, miner);
  assert.equal(miner.data.intent.moveZ, 1, 'worker leaves the real hostile');
  assert.equal(miner.data.intent.boost, true, 'empty worker boosts away from a real hostile');
  assert.equal(miner.data.intent.brake, false, 'worker releases brake while fleeing');
});

test('ordinary-life rhythm: cargo-carrying hull keeps the load and leaves slowly', () => {
  const runtime = Object.create(npcJobsRuntime);
  const loadedHauler = makeMockShip(92, { role: 'hauler', kind: NPC_JOB_KIND.HAULER, cargo: 24 });
  const entry = {
    job: { phase: NPC_JOB_PHASE.FLEE, corrupt: false },
    kind: NPC_JOB_KIND.HAULER,
    entityId: loadedHauler.id,
    worldRecordId: loadedHauler.data.worldRecordId,
    threatId: null,
    violenceHold: false,
    violenceSlow: true,
    violenceX: 100,
    violenceZ: 0,
  };

  runtime.state = {
    simTime: 5,
    entities: new Map([[loadedHauler.id, loadedHauler]]),
    npcJobs: { byId: { [loadedHauler.data.jobId]: entry } },
    world: { currentSectorId: CERES, records: { byId: {} } },
  };

  runtime._drive(entry, loadedHauler);
  assert.equal(loadedHauler.data.intent.moveZ, 1, 'loaded hull moves away from violence');
  assert.equal(loadedHauler.data.intent.boost, false, 'loaded hull leaves SLOWLY without boost');
  assert.equal(loadedHauler.data.intent.brake, false);
});

test('ordinary-life rhythm: empty hauler bolts with boost when alarmed by violence', () => {
  const runtime = Object.create(npcJobsRuntime);
  const emptyHauler = makeMockShip(93, { role: 'hauler', kind: NPC_JOB_KIND.HAULER, cargo: 0 });
  const entry = {
    job: { phase: NPC_JOB_PHASE.FLEE, corrupt: false },
    kind: NPC_JOB_KIND.HAULER,
    entityId: emptyHauler.id,
    worldRecordId: emptyHauler.data.worldRecordId,
    threatId: null,
    violenceHold: false,
    violenceSlow: false,
    violenceX: 100,
    violenceZ: 0,
  };

  runtime.state = {
    simTime: 5,
    entities: new Map([[emptyHauler.id, emptyHauler]]),
    npcJobs: { byId: { [emptyHauler.data.jobId]: entry } },
    world: { currentSectorId: CERES, records: { byId: {} } },
  };

  runtime._drive(entry, emptyHauler);
  assert.equal(emptyHauler.data.intent.moveZ, 1, 'empty hauler flees');
  assert.equal(emptyHauler.data.intent.boost, true, 'empty hauler bolts WITH boost');
});

// ── 4. Slow tug moving a real load and player interruptibility ───────────────────────────────────

test('ordinary-life rhythm: yard tender recovery is interruptible by player tether or salvage claim', () => {
  const trafficSys = Object.create(traffic);
  const tender = makeMockShip(101, { role: 'tender', kind: NPC_JOB_KIND.TENDER, worldRecordId: 'ceres:tender:101' });
  const disabledHauler = makeMockShip(102, { role: 'hauler', kind: NPC_JOB_KIND.HAULER, cargo: 16, worldRecordId: 'ceres:hauler:102' });

  const incident = {
    schema: 'spaceface.ceresDisabledHaulerRecovery.v1',
    incidentId: 'ceres-disabled-hauler:inc_1:man_1',
    handoffId: 'ho_1',
    haulerWorldRecordId: disabledHauler.data.worldRecordId,
    responderWorldRecordId: tender.data.worldRecordId,
    manifestId: 'man_1',
    state: 'responder_approach',
    choice: null,
  };

  let releasedRole = null;
  trafficSys.state = {
    simTime: 50,
    traffic: { ceresDisabledHaulerIncident: incident },
    entities: new Map([[tender.id, tender], [disabledHauler.id, disabledHauler]]),
  };
  trafficSys._activeCeresDisabledHaulerIncident = () => incident;
  trafficSys._ceresDisabledHaulerActor = (inc, role) => {
    if (role === 'hauler') return { entity: disabledHauler, rec: null };
    if (role === 'responder') return { entity: tender, rec: null };
    return null;
  };
  trafficSys._releaseCeresDisabledHaulerControl = (inc, role) => {
    releasedRole = role;
  };

  // Player fires massline / tethers the disabled hauler
  const claimPayload = {
    entityId: disabledHauler.id,
    manifestId: 'man_1',
  };
  const claimed = trafficSys._onCeresDisabledHaulerPlayerClaim(claimPayload);

  assert.equal(claimed, true, 'player tether claim accepted');
  assert.equal(incident.choice, 'recover', 'incident choice becomes player recovery');
  assert.equal(incident.state, 'player_recovery', 'incident transitions to player_recovery state');
  assert.equal(releasedRole, 'responder', 'yard tender control is released so tug backs off');
  assert.equal(disabledHauler.data.ceresDisabledHauler.state, 'player_recovery', 'hauler stamps recovery state');
});

// ── 5. Inspections and quiet receipts without HUD narration ──────────────────────────────────────

test('ordinary-life rhythm: patrol scan and seam survey emit detached typed receipts without HUD spam', () => {
  const trafficSys = Object.create(traffic);
  const receipts = [];
  trafficSys.bus = {
    emit(event, payload) {
      receipts.push({ event, payload });
    },
  };
  trafficSys.state = {
    traffic: {
      appliedJobActionIds: [],
    },
  };
  trafficSys._pendingJobActionIds = new Set(['act_test_1']);
  trafficSys._pendingJobActionTokens = new Map([['act_test_1', 1]]);
  trafficSys._causalReservationIsCurrent = () => true;
  trafficSys._releaseCausalReservation = () => {};

  const context = {
    receiptId: 'act_test_1',
    receiptAuthority: {
      routeId: 'ceres_cathedral_patrol_perimeter',
      jobId: 'job:ceres:patrol',
      jobKind: 'patrol',
      action: 'hold',
      sequence: 3,
      kernelSequence: 3,
      actorSlotId: 'ceres_cathedral_patrol',
      actorId: 42,
      targetRef: 'activity:grave-perimeter-b',
      targetKind: 'activity',
      targetId: null,
      simTime: 125,
    },
  };

  // Record cathedral patrol inspection receipt
  const recorded = trafficSys._recordCeresActivityAction(context, 1, null, false);
  assert.equal(recorded, true);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].event, 'traffic:jobActionReceipt');
  assert.equal(receipts[0].payload.schema, 'spaceface.trafficJobActionReceipt.v1');
  assert.equal(receipts[0].payload.actorSlotId, 'ceres_cathedral_patrol');
  assert.equal(receipts[0].payload.action, 'hold');

  // Receipts remain detached data; no UI/HUD notification events are pushed
  const hudEvents = receipts.filter((r) => r.event.startsWith('ui:') || r.event.startsWith('hud:') || r.event.startsWith('narrative:'));
  assert.equal(hudEvents.length, 0, 'quiet work generates zero HUD narration spam');
});
