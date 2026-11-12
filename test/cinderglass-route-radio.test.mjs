// Pure owner/control fixtures, not rendered or earned-flight acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cinderglassJobStepConvoy } from '../src/features/cinderglassJob/convoy.js';
import { cinderglassJobRevisit } from '../src/features/cinderglassJob/contact.js';
import { createCinderglassJobState } from '../src/features/cinderglassJob/operation.js';
import { serializeCinderglassJob, normalizeCinderglassJob } from '../src/features/cinderglassJob/persistence.js';
import { CINDERGLASS_JOB_POINTS, CINDERGLASS_JOB_ROLES, CINDERGLASS_JOB_TEXT } from '../src/features/cinderglassJob/definition.js';
function fixture() {
  const st = createCinderglassJobState();
  Object.assign(st, { operationId: 'radio-fixture', phase: 'recon', captainAlive: true });
  st.entities.carrierId = 7; st.entities.carrierJobId = 'job:radio';
  const carrier = { id: 7, alive: true, pos: { ...CINDERGLASS_JOB_POINTS.pullOff }, vel: { x: 0, z: 0 },
    data: { cinderglassOperationId: st.operationId, worldRecordId: CINDERGLASS_JOB_ROLES.carrierId.worldRecordId, cinderglassRole: CINDERGLASS_JOB_ROLES.carrierId.role } };
  const entry = { entityId: 7, entityRef: carrier, worldRecordId: carrier.data.worldRecordId, job: { routeIndex: 1 } };
  let claim = null;
  const jobs = { controlClaim: () => claim, heaveToEntity: () => { claim = { claimId: 'cinderglassJob:inspection', holder: 'cinderglassJob' }; return { granted: true }; }, releaseControl: () => { claim = null; } };
  const state = { simTime: 10, entities: new Map([[7, carrier]]), npcJobs: { byId: { 'job:radio': entry } } };
  const sys = { _cg: st, helpers: { npcJobs: jobs } };
  return { st, state, sys, entry, jobs, step: () => cinderglassJobStepConvoy(sys, state) };
}
test('inspection records one fact, survives saved feature state, and does not grant scan or money', () => {
  const t = fixture(); t.step();
  assert.equal(t.st.rememberedFacts.length, 1);
  assert.equal(t.st.rememberedFacts[0].id, 'inspection_arrived');
  const restored = normalizeCinderglassJob(serializeCinderglassJob(t.st));
  // Rebinding native roles belongs to runtime; retain just this fixture binding.
  restored.entities = t.st.entities; t.sys._cg = restored; t.step();
  assert.deepEqual(restored.rememberedFacts, t.st.rememberedFacts);
  assert.equal(restored.scanDone, false); assert.equal(restored.depositPaid, false);
  assert.equal(restored.custody, 'carried');
});
test('lease expiry alone is not an outbound radio; actual next leg is required', () => {
  const t = fixture(); t.step(); t.st.laybyRemainingS = 0; t.step();
  assert.equal(t.st.laybyDone, true);
  assert.equal(t.st.rememberedFacts.length, 1);
  t.entry.job.routeIndex = 2; t.step(); t.step();
  assert.deepEqual(t.st.rememberedFacts.map(f => f.id), ['inspection_arrived', 'inspection_departed']);
  assert.match(cinderglassJobRevisit(t.st, 'dask').line, /Inspection is over/);
});
test('no arrival radio from refused control or missing identity; no delivery threat after release', () => {
  const t = fixture(); t.jobs.heaveToEntity = () => ({ granted: false }); t.step();
  assert.equal(t.st.rememberedFacts.length, 0);
  t.entry.entityId = 99; t.step(); assert.equal(t.st.rememberedFacts.length, 0);
  t.entry.entityId = 7; t.st.laybyDone = true; t.entry.job.routeIndex = 2; t.st.custody = 'released'; t.step();
  assert.equal(t.st.rememberedFacts.length, 0);
  assert.doesNotMatch(cinderglassJobRevisit(t.st, 'dask').line, /Inspection is over/);
});
test('terms disclose finite original and settled captain takes precedence over outbound memory', () => {
  assert.match(CINDERGLASS_JOB_TEXT.offerDetail, /closes for this campaign/);
  const t = fixture(); t.st.laybyDone = true; t.st.actors.dask.dealAccepted = true;
  assert.match(cinderglassJobRevisit(t.st, 'dask').line, /inspection deposit/);
  t.st.outcome = 'returned_tala';
  assert.match(cinderglassJobRevisit(t.st, 'dask').line, /receipt closes/);
});

test('hostile inspection does not invite negotiation and finished run never points back to layby', () => {
  const t = fixture(); t.st.suspicion = 3; t.step();
  assert.match(t.st.rememberedFacts[0].text, /will not release/);
  assert.match(cinderglassJobRevisit(t.st, 'dask').line, /will not release/);
  t.st.outcome = 'consignment_delivered';
  assert.match(cinderglassJobRevisit(t.st, 'dask').line, /no longer a release/);
});
test('arrival remains historical while current contact responds to rising suspicion', () => {
  const t = fixture(); t.step();
  const arrival = structuredClone(t.st.rememberedFacts[0]);
  t.st.suspicion = 3; t.state.simTime += 1; t.step();
  assert.deepEqual(t.st.rememberedFacts, [arrival]);
  assert.match(cinderglassJobRevisit(t.st, 'dask').line, /will not release/);
});
