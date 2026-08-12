import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT, createSimulation } from '../src/core/sim.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../src/data/sectorActivityPockets.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { CERES_CAUSAL_CHAIN, traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';

const SEED = 0x4804;
const TENDER_SLOT_ID = 'ceres_refinery_tender';
const MINER_SLOT_ID = 'ceres_seam_miner';
const TENDER_EVENT = CERES_CAUSAL_CHAIN.find((entry) => entry.id === 'ev_tender_services_miner');

function liveActor(state, slotId) {
  const actor = state.entityList.find((entity) => entity && entity.alive !== false
    && entity.data && entity.data.activityActorSlotId === slotId);
  assert.ok(actor, `missing live ${slotId}`);
  return actor;
}

function driveRuntime(state, entity) {
  const drive = state.combat && state.combat.entities && state.combat.entities[String(entity.id)]
    && state.combat.entities[String(entity.id)].subsystems
    && state.combat.entities[String(entity.id)].subsystems.subsystem_drive;
  assert.ok(drive, `missing combat drive for ${entity.id}`);
  return drive;
}

function standoffDistance(tender, miner) {
  return Math.max(56, tender.radius + miner.radius + 12);
}

function distance(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
}

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    // `actions` runs the production combat prePhysics phase. That transition is material here:
    // traffic must not lease either job until combat has made the drive truly disabled.
    systems: [world, factionPresence, npcJobsRuntime, actions, combat, traffic],
  });
  sim.state.mode = 'flight';
  sim.registry.get('world').enterSector(CERES_ACTIVITY_SECTOR_ID, { placePlayer: false });
  const tender = liveActor(sim.state, TENDER_SLOT_ID);
  const miner = liveActor(sim.state, MINER_SLOT_ID);
  const trafficSystem = sim.registry.get('traffic');
  const jobs = sim.registry.get('npcJobsRuntime');
  return { sim, state: sim.state, tender, miner, traffic: trafficSystem, jobs, combat: sim.registry.get('combat') };
}

function beginAndDisable(ctx) {
  const { sim, state, traffic: trafficSystem, tender, miner, jobs } = ctx;
  const incident = trafficSystem._beginCeresTenderServiceIncident();
  assert.ok(incident, 'the existing faction tender and traffic miner are accepted as the one exact pair');

  // The first traffic pass routes only the non-lethal component packet. It must not treat a queued
  // transition as a disabled hull or seize either job early.
  sim.step(SIM_DT);
  let drive = driveRuntime(state, miner);
  assert.equal(incident.state, 'impair');
  assert.equal(miner.hull, miner.hullMax, 'the drive-only impairment does not attribute hull damage');
  assert.equal(drive.destroyed, false, 'the component transition has not happened yet');
  assert.equal(drive.effectiveDisabled, false);
  assert.equal(drive.pendingTransition && drive.pendingTransition.destroyed, true);
  assert.equal(jobs.controlClaim(miner.data.jobId), null, 'no miner lease before actual combat disable');
  assert.equal(jobs.controlClaim(tender.data.jobId), null, 'no tender lease before actual combat disable');

  // The next production prePhysics phase makes combat truth authoritative; only then may traffic
  // borrow the two existing jobs and steer the tender.
  sim.step(SIM_DT);
  drive = driveRuntime(state, miner);
  assert.equal(drive.destroyed, true);
  assert.equal(drive.effectiveDisabled, true);
  assert.equal(incident.state, 'approach');
  assert.ok(jobs.controlClaim(miner.data.jobId));
  assert.ok(jobs.controlClaim(tender.data.jobId));
  assert.equal(miner.data.intent.moveZ, 0);
  assert.equal(miner.data.intent.brake, true);
  assert.equal(tender.data.intent.moveZ, 1, 'traffic now physically drives the real tender toward the real miner');
  return incident;
}

function rematerialize(ctx, actor, newId) {
  const { state } = ctx;
  const replacement = {
    ...actor,
    id: newId,
    pos: { ...actor.pos },
    vel: { ...actor.vel },
    prevPos: actor.prevPos && typeof actor.prevPos.clone === 'function'
      ? actor.prevPos.clone()
      : actor.prevPos,
    data: {
      ...actor.data,
      intent: actor.data && actor.data.intent ? { ...actor.data.intent } : actor.data && actor.data.intent,
    },
  };
  state.entities.delete(actor.id);
  state.entities.set(replacement.id, replacement);
  state.entityList = state.entityList.map((entity) => entity === actor ? replacement : entity);
  const rec = state.traffic.freighters.find((row) => row && row.worldRecordId === actor.data.worldRecordId);
  if (rec) rec.id = replacement.id;
  delete state.combat.entities[String(actor.id)];
  return replacement;
}

function attachCausalServiceLink(ctx, incident) {
  const { traffic: trafficSystem, state } = ctx;
  trafficSystem._resetCeresCausalChain('test_attach_service_link');
  const chain = trafficSystem._ensureCeresCausalChain('test_attach_service_link');
  assert.ok(chain);
  chain.nextIndex = CERES_CAUSAL_CHAIN.length - 1;
  chain.seeds.miner_wear = true;
  const live = trafficSystem._startCeresCausalEvent(TENDER_EVENT, state.simTime);
  assert.ok(live);
  assert.equal(live.serviceIncidentId, incident.incidentId, 'the causal event adopts the saved incident rather than creating another one');
  return chain;
}

test('PQ-048.04: one existing tender services one existing miner through combat truth, Continue, and a physical safe hold', () => {
  const ctx = boot();
  try {
    const { sim, state, traffic: trafficSystem, jobs } = ctx;
    const initialLiveCount = state.entityList.filter((entity) => entity && entity.alive !== false).length;
    const initialTenderId = ctx.tender.id;
    const initialMinerId = ctx.miner.id;
    const tenderWorldRecordId = ctx.tender.data.worldRecordId;
    const minerWorldRecordId = ctx.miner.data.worldRecordId;
    let incident = beginAndDisable(ctx);

    assert.equal(incident.tenderWorldRecordId, tenderWorldRecordId);
    assert.equal(incident.minerWorldRecordId, minerWorldRecordId);
    assert.equal(state.entityList.filter((entity) => entity && entity.alive !== false).length, initialLiveCount,
      'starting service adopts the two real actors and spawns no replacement prop or helper hull');
    assert.equal(state.entityList.filter((entity) => entity && entity.data
      && entity.data.activityActorSlotId === TENDER_SLOT_ID).length, 1);
    assert.equal(state.entityList.filter((entity) => entity && entity.data
      && entity.data.activityActorSlotId === MINER_SLOT_ID).length, 1);

    const trafficEnvelope = trafficSystem.serialize();
    assert.deepEqual(Object.keys(trafficEnvelope.ceresTenderServiceIncident).sort(), [
      'failureReason', 'holdStartedAtSimT', 'incidentId', 'minerWorldRecordId', 'schema', 'sequence',
      'startedAtSimT', 'state', 'tenderWorldRecordId', 'terminalAtSimT',
    ]);
    assert.equal(JSON.stringify(trafficEnvelope.ceresTenderServiceIncident).includes(String(initialTenderId)), false,
      'the persisted incident excludes the tender live id');
    assert.equal(JSON.stringify(trafficEnvelope.ceresTenderServiceIncident).includes(String(initialMinerId)), false,
      'the persisted incident excludes the miner live id');
    const jobEnvelope = jobs.serialize();

    // Continue rematerializes both durable bodies with new ids. Reuse the owners' real envelopes,
    // then let save:loaded perform the same stable-record relink that a game Continue uses.
    const continuedTender = rematerialize(ctx, ctx.tender, initialTenderId + 10000);
    const continuedMiner = rematerialize(ctx, ctx.miner, initialMinerId + 10000);
    trafficSystem.deserialize(trafficEnvelope);
    jobs.deserialize(jobEnvelope);
    sim.bus.emit('save:loaded', {});
    assert.equal(state.npcJobs.byId[`job:${tenderWorldRecordId}`].entityId, continuedTender.id);
    assert.equal(state.npcJobs.byId[`job:${minerWorldRecordId}`].entityId, continuedMiner.id);
    assert.equal(state.traffic.ceresTenderServiceIncident.incidentId, incident.incidentId);
    assert.equal(state.traffic.ceresTenderServiceIncident.tenderWorldRecordId, tenderWorldRecordId);
    assert.equal(state.traffic.ceresTenderServiceIncident.minerWorldRecordId, minerWorldRecordId);
    assert.equal(jobs.activeControlClaimCount(), 0, 'Continue releases transient leases before rebind');
    incident = state.traffic.ceresTenderServiceIncident;

    // The rematerialized combat runtime is clean, so traffic reapplies only this still-active drive
    // impairment. A second pass waits for the real combat transition before it reclaims control.
    sim.step(SIM_DT);
    let drive = driveRuntime(state, continuedMiner);
    assert.equal(drive.destroyed, false);
    assert.equal(drive.pendingTransition && drive.pendingTransition.destroyed, true);
    assert.equal(continuedMiner.hull, continuedMiner.hullMax);
    sim.step(SIM_DT);
    drive = driveRuntime(state, continuedMiner);
    assert.equal(drive.effectiveDisabled, true);
    assert.equal(jobs.activeControlClaimCount(), 2);

    const resumedTenderJob = state.npcJobs.byId[`job:${tenderWorldRecordId}`].job;
    const resumedMinerJob = state.npcJobs.byId[`job:${minerWorldRecordId}`].job;
    const chain = attachCausalServiceLink(ctx, incident);
    const standoff = standoffDistance(continuedTender, continuedMiner);
    continuedTender.pos = { x: continuedMiner.pos.x + standoff, y: continuedTender.pos.y, z: continuedMiner.pos.z };
    continuedTender.vel = { x: 0, y: 0, z: 0 };
    sim.step(SIM_DT);
    assert.equal(incident.state, 'holding');
    assert.ok(distance(continuedTender, continuedMiner) >= continuedTender.radius + continuedMiner.radius + 12,
      'the held position clears both collision radii');
    assert.equal(continuedTender.data.intent.moveZ, 0);
    assert.equal(continuedTender.data.intent.brake, true);

    sim.runTicks(190, SIM_DT);
    drive = driveRuntime(state, continuedMiner);
    assert.equal(incident.state, 'succeeded');
    assert.equal(drive.destroyed, false, 'repair waits for combat to actually re-enable the drive');
    assert.equal(drive.effectiveDisabled, false);
    assert.equal(jobs.controlClaim(continuedTender.data.jobId), null);
    assert.equal(jobs.controlClaim(continuedMiner.data.jobId), null);
    assert.equal(jobs.activeControlClaimCount(), 0);
    assert.equal(state.npcJobs.byId[`job:${tenderWorldRecordId}`].job, resumedTenderJob,
      'success returns the original tender job rather than substituting a service route');
    assert.equal(state.npcJobs.byId[`job:${minerWorldRecordId}`].job, resumedMinerJob,
      'success returns the original miner job rather than substituting a service route');
    sim.step(SIM_DT);
    assert.equal(continuedTender.data.jobId, `job:${tenderWorldRecordId}`);
    assert.equal(continuedMiner.data.jobId, `job:${minerWorldRecordId}`);

    const snapshot = trafficSystem.getCeresCausalChainSnapshot();
    assert.equal(snapshot.seeds.aftermath_open, undefined, 'a repaired miner never manufactures aftermath');
    assert.equal(snapshot.seeds.miner_serviced, true);
    assert.ok(snapshot.completed.includes('ev_cutter_strips_wreck'),
      'the cutter link is explicitly skipped after service success instead of opening a wreck branch');
  } finally {
    ctx.sim.dispose();
  }
});

test('PQ-048.04: either participant death terminalizes the one incident once and releases both job controls', () => {
  for (const role of ['miner', 'tender']) {
    const ctx = boot(SEED + (role === 'miner' ? 1 : 2));
    try {
      const incident = beginAndDisable(ctx);
      const victim = role === 'miner' ? ctx.miner : ctx.tender;
      const victimWorldRecordId = victim.data.worldRecordId;
      ctx.combat.kill(victim, null, {});
      assert.equal(incident.state, 'failed', `${role} death is terminal`);
      assert.equal(incident.failureReason, 'participant_destroyed');
      const terminalAt = incident.terminalAtSimT;
      ctx.traffic._onEntityKilled({ id: victim.id, worldRecordId: victimWorldRecordId });
      assert.equal(incident.terminalAtSimT, terminalAt, 'duplicate death delivery does not re-terminalize');
      assert.equal(ctx.jobs.activeControlClaimCount(), 0);
      assert.equal(ctx.jobs.controlClaim(`job:${incident.tenderWorldRecordId}`), null);
      assert.equal(ctx.jobs.controlClaim(`job:${incident.minerWorldRecordId}`), null);
      assert.notEqual(incident.state, 'succeeded');
    } finally {
      ctx.sim.dispose();
    }
  }
});
