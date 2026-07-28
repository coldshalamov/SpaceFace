// PQ-019B seam (c) — NPC job control leases.
//
// The claim under test: a heist pursuit can borrow the hull of a REAL, already-flying patrol job
// without inventing a ship and without a second system writing its movement intent — and can always
// give it back, including when the hull dies underneath it.
//
// Harness mirrors test/npc-jobs-runtime-wiring.test.mjs: the real registry via createSimulation with
// only the systems under test, and plain spawned entities.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { save } from '../src/save/saveSystem.js';
import { NPC_JOB_KIND, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const PATROL_ROUTE = [
  { id: 'b0', pos: { x: 200, z: 0 } }, { id: 'b1', pos: { x: 0, z: 200 } },
  { id: 'b2', pos: { x: -200, z: 0 } }, { id: 'b3', pos: { x: 0, z: -200 } },
];
const SHORT = {
  speed: 100, commissionS: 1, departS: 1, approachS: 1,
  workS: 2, loadS: 1, unloadS: 1, dwellS: 1,
};
const CLAIM = 'heist:receipt:abc:jobControlRelease';

function patrolSpec(o = {}) {
  return { kind: NPC_JOB_KIND.PATROL, route: PATROL_ROUTE, sectorId: 'sector_a', ...SHORT, ...o };
}
function haulerSpec(o = {}) {
  return {
    kind: NPC_JOB_KIND.HAULER,
    route: [{ id: 'origin', pos: { x: 0, z: 0 } }, { id: 'dest', pos: { x: 40, z: 0 } }],
    sectorId: 'sector_a', ...SHORT, payload: { commodity: 'ore', units: 40 }, ...o,
  };
}

function boot(seed = 7, systems = [npcJobsRuntime]) {
  const sim = createSimulation({ seed, systems });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  return sim;
}

function hull(sim, worldRecordId, pos = { x: 0, z: 0 }) {
  const e = sim.spawn({
    type: 'ship', team: 2, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 6,
  });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = 'sector_a';
  return e;
}

function despawn(state, id) {
  const i = state.entityList.findIndex((e) => e.id === id);
  if (i >= 0) state.entityList.splice(i, 1);
  state.entities.delete(id);
}

function setup(spec = patrolSpec()) {
  const sim = boot();
  const runtime = sim.registry.get('npcJobsRuntime');
  const entity = hull(sim, 'wr_patrol_a');
  const jobId = runtime.assign(entity, spec);
  assert.ok(jobId, 'the fixture must produce a real job');
  return { sim, runtime, entity, jobId, state: sim.state };
}

/** Mark the hull's intent so any write by npcJobsRuntime is detectable. */
function sentinelIntent(entity) {
  entity.data.intent = {
    moveX: 7, moveZ: 7, boost: true, fire: false, fireGroup: null, aimAngle: 7,
  };
  return entity.data.intent;
}

// ── granting ────────────────────────────────────────────────────────────────────────────────────

test('a claim is granted over a live hull and records the job state at claim', () => {
  const { runtime, jobId, entity, sim } = setup();
  for (let i = 0; i < 30; i++) sim.step(DT);
  const phaseBefore = runtime._byId()[jobId].job.phase;

  const out = runtime.claimControl(jobId, { claimId: CLAIM, holder: 'lawSecurity' });
  assert.equal(out.granted, true);
  assert.equal(out.claim.claimId, CLAIM);
  assert.equal(out.claim.holder, 'lawSecurity');
  assert.equal(out.claim.claimedPhase, phaseBefore);
  assert.equal(out.claim.claimedEntityId, entity.id);
  assert.equal(runtime.activeControlClaimCount(), 1);
});

test('claiming is idempotent for the same key and refused for a different one', () => {
  const { runtime, jobId } = setup();
  const first = runtime.claimControl(jobId, { claimId: CLAIM });
  for (let i = 0; i < 4; i++) {
    const again = runtime.claimControl(jobId, { claimId: CLAIM });
    assert.equal(again.granted, true);
    assert.equal(again.resumed, true);
    assert.equal(again.claim, first.claim, 'the same claim record is returned');
  }
  const other = runtime.claimControl(jobId, { claimId: 'someone_else' });
  assert.equal(other.granted, false);
  assert.equal(other.reason, 'already_claimed');
  assert.equal(other.claim.claimId, CLAIM);
  assert.equal(runtime.activeControlClaimCount(), 1);
});

test('a claim over a missing job, an invalid key, or an absent hull is refused', () => {
  const { runtime, jobId, state, entity } = setup();
  assert.equal(runtime.claimControl('job:nope', { claimId: CLAIM }).reason, 'no_job');
  assert.equal(runtime.claimControl(jobId, { claimId: '' }).reason, 'invalid_claim_id');
  assert.equal(runtime.claimControl(jobId, {}).reason, 'invalid_claim_id');
  despawn(state, entity.id);
  assert.equal(runtime.claimControl(jobId, { claimId: CLAIM }).reason, 'hull_absent');
  assert.equal(runtime.activeControlClaimCount(), 0);
});

// ── the one-writer rule ─────────────────────────────────────────────────────────────────────────

test('while leased, npcJobsRuntime writes no movement intent for the hull', () => {
  const { runtime, jobId, entity, sim } = setup();
  for (let i = 0; i < 90; i++) sim.step(DT); // reach a transit phase where the job normally steers
  runtime.claimControl(jobId, { claimId: CLAIM });

  const sentinel = sentinelIntent(entity);
  for (let i = 0; i < 120; i++) sim.step(DT);
  assert.deepEqual(entity.data.intent, sentinel,
    'the controller is the only intent writer for a leased hull');
});

test('the kernel job keeps advancing while leased, so its clock never lies', () => {
  const { runtime, jobId, sim } = setup();
  runtime.claimControl(jobId, { claimId: CLAIM });
  const entry = runtime._byId()[jobId];
  const simTimeBefore = entry.job.simTime;
  for (let i = 0; i < 240; i++) sim.step(DT);
  assert.ok(entry.job.simTime > simTimeBefore,
    'suspending advance would break the offscreen-equals-onscreen convergence proof');
  assert.equal(entry.lastAdvanceSimT, sim.state.simTime);
});

test('control resumes normal steering immediately after release', () => {
  const { runtime, jobId, entity, sim } = setup();
  for (let i = 0; i < 90; i++) sim.step(DT);
  runtime.claimControl(jobId, { claimId: CLAIM });
  sentinelIntent(entity);
  for (let i = 0; i < 60; i++) sim.step(DT);

  const out = runtime.releaseControl(jobId, CLAIM);
  assert.equal(out.released, true);
  assert.equal(out.restored, true);
  // Fail safe: the controller's stale boost vector is neutralized at handback.
  assert.equal(entity.data.intent.boost, false);
  assert.equal(entity.data.intent.moveX, 0);
  assert.equal(entity.data.intent.moveZ, 0);

  for (let i = 0; i < 60; i++) sim.step(DT);
  assert.equal(runtime.activeControlClaimCount(), 0);
  assert.ok(entity.data.intent.aimAngle !== 7, 'the job is steering its own hull again');
});

// ── releasing ───────────────────────────────────────────────────────────────────────────────────

test('release is idempotent and cannot be performed by a different holder', () => {
  const { runtime, jobId } = setup();
  runtime.claimControl(jobId, { claimId: CLAIM });
  assert.equal(runtime.releaseControl(jobId, 'someone_else').reason, 'claim_mismatch');
  assert.equal(runtime.activeControlClaimCount(), 1, 'a foreign release must not steal the hull');

  assert.equal(runtime.releaseControl(jobId, CLAIM).released, true);
  for (let i = 0; i < 3; i++) {
    const again = runtime.releaseControl(jobId, CLAIM);
    assert.equal(again.released, false);
    assert.equal(again.reason, 'not_claimed');
  }
  assert.equal(runtime.activeControlClaimCount(), 0);
  assert.equal(runtime.releaseControl('job:nope', CLAIM).reason, 'no_job');
});

test('a hull destroyed under the controller still releases, and leaves no claim', () => {
  const { runtime, jobId, entity, state } = setup();
  runtime.claimControl(jobId, { claimId: CLAIM });
  despawn(state, entity.id);
  const out = runtime.releaseControl(jobId, CLAIM);
  assert.equal(out.released, true, 'a lease nobody can release is a permanently frozen patrol');
  assert.equal(out.reason, 'hull_absent');
  assert.equal(out.restored, false);
  assert.equal(runtime.activeControlClaimCount(), 0);
});

test('a job that completes while leased is not adopted by the ambient stepper until release', () => {
  const { sim, runtime, jobId, entity } = setup(haulerSpec());
  runtime.claimControl(jobId, { claimId: CLAIM });
  for (let i = 0; i < 2000; i++) sim.step(DT);

  const entry = runtime._byId()[jobId];
  assert.ok(entry, 'the entry must survive completion while leased');
  assert.equal(entry.job.phase, NPC_JOB_PHASE.COMPLETE);
  assert.equal(entity.data.jobId, jobId, 'dropping jobId here would hand the hull to a second writer');

  const out = runtime.releaseControl(jobId, CLAIM);
  assert.equal(out.released, true);
  assert.equal(out.reason, 'job_complete');
  assert.equal(runtime._byId()[jobId], undefined, 'the handback completes at release');
  assert.equal(entity.data.jobId, undefined);
  assert.equal(runtime.activeControlClaimCount(), 0);
});

test('destroying the hull of a leased job clears the whole entry, claim included', () => {
  const { sim, runtime, jobId, entity, state } = setup();
  runtime.claimControl(jobId, { claimId: CLAIM });
  despawn(state, entity.id);
  sim.bus.emit('entity:destroyed', { id: entity.id });
  assert.equal(runtime.activeControlClaimCount(), 0);
  assert.equal(runtime.controlClaim(jobId), null);
});

// ── save boundary ───────────────────────────────────────────────────────────────────────────────

test('a lease is deliberately not persisted, so no reload can restore an unreleasable claim', () => {
  const sim = boot(7, [npcJobsRuntime, save]);
  const runtime = sim.registry.get('npcJobsRuntime');
  const entity = hull(sim, 'wr_patrol_a');
  const jobId = runtime.assign(entity, patrolSpec());
  runtime.claimControl(jobId, { claimId: CLAIM });
  assert.equal(runtime.activeControlClaimCount(), 1);

  const snapshot = runtime.serialize();
  assert.equal(snapshot.byId[jobId].control, undefined,
    'the serializer whitelist must not carry a live relationship into a save');

  runtime.deserialize(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(runtime.activeControlClaimCount(), 0,
    'activeJobControlClaimsAfterTerminal is trivially 0 across any reload');
  assert.equal(runtime.controlClaim(jobId), null);
  // The job itself still restored normally.
  assert.ok(runtime._byId()[jobId], 'the JOB survives; only the lease does not');
  assert.equal(runtime._byId()[jobId].entityId, null);
});

test('the control field never materializes on a job that was never leased', () => {
  const { runtime, jobId, sim } = setup();
  for (let i = 0; i < 120; i++) sim.step(DT);
  assert.equal(
    Object.prototype.hasOwnProperty.call(runtime._byId()[jobId], 'control'), false,
    'no key may appear on the ordinary path',
  );
  assert.equal(runtime.activeControlClaimCount(), 0);
});
