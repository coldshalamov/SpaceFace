// PQ-014 runtime WIRING tests — the adapter (npcJobsRuntime) that drives the pure npcJobs kernel
// into live entities. These pin the integration contract the kernel unit suite cannot:
//   • a producer-assigned job links to its hull and is advanced + steered while materialized
//   • save → restore round-trips the bag (kernel record + the runtime sidecar meta) and re-links
//   • sector exit → time away → re-entry preserves loop progress and advances it VIRTUALLY (no reset)
//   • the re-entry catch-up resumes across the kernel truncation cap (never silently drops transitions)
//   • exactly ONE intent writer per job hull per tick (traffic yields for jobId hulls)
//   • a terminal hauler hands its hull back on COMPLETE; a threatened job flees and resumes
//
// The harness boots the real registry via createSimulation with only the systems under test, and
// spawns plain entities — so these exercise the production code paths, not a mock of them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { save } from '../src/save/saveSystem.js';
import { NPC_JOB_PHASE, NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;

// ── route specs (short phases so a full cycle fits in a few seconds; mirrors the kernel suite) ──
const MINER_ROUTE = [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 600, z: 0 } }];
const HAULER_ROUTE = [{ id: 'origin', pos: { x: 0, z: 0 } }, { id: 'dest', pos: { x: 800, z: 0 } }];
const PATROL_ROUTE = [
  { id: 'b0', pos: { x: 200, z: 0 } }, { id: 'b1', pos: { x: 0, z: 200 } },
  { id: 'b2', pos: { x: -200, z: 0 } }, { id: 'b3', pos: { x: 0, z: -200 } },
];
const SHORT = { speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 2, loadS: 1, unloadS: 1, dwellS: 1 };
function minerSpec(o = {}) { return { kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, sectorId: 'sector_a', ...SHORT, ...o }; }
function haulerSpec(o = {}) { return { kind: NPC_JOB_KIND.HAULER, route: HAULER_ROUTE, sectorId: 'sector_a', ...SHORT, payload: { commodity: 'ore', units: 40 }, ...o }; }
function patrolSpec(o = {}) { return { kind: NPC_JOB_KIND.PATROL, route: PATROL_ROUTE, sectorId: 'sector_a', ...SHORT, ...o }; }
// tiny zero-length legs so phase durations floor at MIN_PHASE_S → a multi-second dt exceeds the cap.
const TINY_ROUTE = [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 0, z: 0 } }];
function tinyMinerSpec(o = {}) {
  return { kind: NPC_JOB_KIND.MINER, route: TINY_ROUTE, sectorId: 'sector_a', speed: 1,
    commissionS: 0.001, departS: 0.001, approachS: 0.001, workS: 0.001, loadS: 0.001, unloadS: 0.001, dwellS: 0.001, ...o };
}

function boot(seed = 7, systems = [npcJobsRuntime]) {
  const sim = createSimulation({ seed, systems });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  return sim;
}
function hull(sim, worldRecordId, pos = { x: 0, z: 0 }, team = 2, sectorId = 'sector_a') {
  const e = sim.spawn({ type: 'ship', team, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = sectorId;
  return e;
}
function despawn(state, id) {
  const i = state.entityList.findIndex((e) => e.id === id);
  if (i >= 0) state.entityList.splice(i, 1);
  state.entities.delete(id);
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }
function stepSeconds(sim, s) { steps(sim, Math.round(s / DT)); }

// ═══ the sim clock actually advances (precondition for all continuity math) ═══════════════════════
test('precondition: sim.step advances state.simTime', () => {
  const sim = boot();
  const t0 = sim.state.simTime;
  steps(sim, 60);
  assert.ok(sim.state.simTime > t0, `simTime must advance (was ${t0}, now ${sim.state.simTime})`);
});

// ═══ natural-ish assign links a job and the bag records it ════════════════════════════════════════
test('assign: producer links a job to its hull and the bag records the runtime meta', () => {
  const sim = boot();
  const jobs = sim.registry.get('npcJobsRuntime');
  const e = hull(sim, 'rec-assign');
  const jobId = sim.helpers.npcJobs.assign(e, minerSpec());
  assert.equal(jobId, 'job:rec-assign', 'jobId derives from the stable worldRecordId');
  assert.equal(e.data.jobId, jobId, 'the hull carries its jobId');
  const entry = jobs._byId()[jobId];
  assert.ok(entry, 'bag has the entry');
  assert.equal(entry.kind, NPC_JOB_KIND.MINER);
  assert.equal(entry.worldRecordId, 'rec-assign');
  assert.equal(entry.entityId, e.id);
  assert.equal(entry.sectorId, 'sector_a');
  // a hull with no stable identity cannot carry a durable job
  const e2 = sim.spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  assert.equal(sim.helpers.npcJobs.assign(e2, minerSpec()), null, 'no worldRecordId → no job');
});

// ═══ a materialized job advances and STEERS its hull (single writer, civilian intent) ═════════════
test('materialized: the job advances phases and writes the civilian transit intent toward the target', () => {
  const sim = boot();
  const e = hull(sim, 'rec-drive');
  sim.helpers.npcJobs.assign(e, minerSpec());
  const jobs = sim.registry.get('npcJobsRuntime');
  const job = jobs._byId()['job:rec-drive'].job;
  assert.equal(job.phase, NPC_JOB_PHASE.COMMISSION, 'starts in commission');
  // Drive until the miner enters its first transit leg toward the field (+x).
  let guard = 0;
  while (job.phase !== NPC_JOB_PHASE.TRANSIT && guard++ < 600) sim.step(DT);
  assert.equal(job.phase, NPC_JOB_PHASE.TRANSIT, 'reached transit');
  sim.step(DT);
  assert.ok(e.data.intent, 'runtime wrote an intent');
  assert.equal(e.data.intent.moveZ, 1, 'thrust forward while transiting');
  assert.equal(e.data.intent.fire, false, 'civilian job hull never fires');
  assert.ok(Math.abs(e.data.intent.aimAngle) < 0.2, `aim toward field at +x (got ${e.data.intent.aimAngle})`);
});

// ═══ save → restore round trip (kernel record + sidecar meta), then re-link ═══════════════════════
test('save/restore: serialize→deserialize preserves the job + meta and re-links on re-entry', () => {
  const sim = boot();
  const e = hull(sim, 'rec-save');
  sim.helpers.npcJobs.assign(e, minerSpec());
  stepSeconds(sim, 10); // somewhere mid-loop
  const jobs = sim.registry.get('npcJobsRuntime');
  const before = jobs._byId()['job:rec-save'];
  const savedPhase = before.job.phase, savedIdx = before.job.routeIndex, savedProg = before.job.progress;
  const savedLoop = before.job.loopCount, savedLast = before.lastAdvanceSimT;

  const blob = JSON.parse(JSON.stringify(jobs.serialize())); // JSON round-trip like a real save
  // Load into a fresh sim (hulls are cleared on load → job restores VIRTUAL).
  const sim2 = boot(7);
  const jobs2 = sim2.registry.get('npcJobsRuntime');
  jobs2.deserialize(blob);
  const restored = jobs2._byId()['job:rec-save'];
  assert.ok(restored, 'job restored');
  assert.equal(restored.job.phase, savedPhase, 'phase survives');
  assert.equal(restored.job.routeIndex, savedIdx, 'routeIndex survives');
  assert.equal(restored.job.progress, savedProg, 'progress survives');
  assert.equal(restored.job.loopCount, savedLoop, 'loopCount survives');
  assert.equal(restored.lastAdvanceSimT, savedLast, 'lastAdvanceSimT (away-clock anchor) survives');
  assert.equal(restored.entityId, null, 'restored job is virtual until its hull re-materializes');
  assert.equal(restored.job.materialized, false);

  // Re-materialize the hull in-sector (same worldRecordId) with no elapsed → re-links with no jump.
  sim2.state.simTime = savedLast;
  const e2 = hull(sim2, 'rec-save');
  sim2.bus.emit('sector:enter', { sectorId: 'sector_a' });
  const relinked = jobs2._byId()['job:rec-save'];
  assert.equal(relinked.entityId, e2.id, 're-linked to the rematerialized hull by worldRecordId');
  assert.equal(e2.data.jobId, 'job:rec-save');
  assert.equal(relinked.job.phase, savedPhase, 'no time elapsed → phase unchanged (no spurious advance)');
});

// ═══ THE headline: sector exit → time away → re-entry preserves + virtually advances the loop ═════
test('continuity: a miner loop survives exit → away → re-entry, advanced virtually, never reset', () => {
  const sim = boot();
  const e = hull(sim, 'rec-cont');
  sim.helpers.npcJobs.assign(e, minerSpec());
  const jobs = sim.registry.get('npcJobsRuntime');
  stepSeconds(sim, 40); // several full loops
  const entry = jobs._byId()['job:rec-cont'];
  const loopAtExit = entry.job.loopCount;
  assert.ok(loopAtExit >= 1, `miner should have looped before exit (loopCount=${loopAtExit})`);

  // Hard exit: the sector demotes → jobs virtualize (record survives, link drops).
  sim.bus.emit('sector:exit', { sectorId: 'sector_a' });
  assert.equal(entry.entityId, null, 'job virtualized on exit');
  assert.equal(entry.job.materialized, false);
  assert.equal(e.data.jobId, undefined, 'the demoted hull no longer claims the job');
  despawn(sim.state, e.id);

  // Player is elsewhere; 300s pass. The virtual job is NOT stepped per-tick — it waits.
  sim.state.world.currentSectorId = 'sector_b';
  const awaySimT = entry.lastAdvanceSimT + 300;
  sim.state.simTime = awaySimT;

  // Re-enter: the hull rematerializes with the SAME worldRecordId; the job advances the away time.
  sim.state.world.currentSectorId = 'sector_a';
  const e2 = hull(sim, 'rec-cont');
  sim.bus.emit('sector:enter', { sectorId: 'sector_a' });
  const back = jobs._byId()['job:rec-cont'];
  assert.equal(back.entityId, e2.id, 're-linked to the rematerialized hull');
  assert.equal(e2.data.jobId, 'job:rec-cont');
  assert.equal(back.job.materialized, true, 'materialized again');
  assert.ok(back.job.loopCount > loopAtExit,
    `away time advanced the loop virtually (loopCount ${loopAtExit} → ${back.job.loopCount})`);
  assert.notEqual(back.job.phase, NPC_JOB_PHASE.COMPLETE, 'a miner never completes');
});

// ═══ the re-entry catch-up resumes across the kernel truncation cap ════════════════════════════════
test('truncation-resume: a huge away interval on a tiny-phase job is fully processed (no silent drop)', () => {
  const sim = boot();
  const e = hull(sim, 'rec-trunc');
  sim.helpers.npcJobs.assign(e, tinyMinerSpec());
  const jobs = sim.registry.get('npcJobsRuntime');
  steps(sim, 5); // materialize briefly
  sim.bus.emit('sector:exit', { sectorId: 'sector_a' });
  despawn(sim.state, e.id);
  const entry = jobs._byId()['job:rec-trunc'];
  const kernelSimBefore = entry.job.simTime;
  // 200s at ~thousands of transitions/s far exceeds the 100000-per-advance cap → forces truncation.
  sim.state.simTime = entry.lastAdvanceSimT + 200;
  const e2 = hull(sim, 'rec-trunc');
  sim.bus.emit('sector:enter', { sectorId: 'sector_a' });
  const back = jobs._byId()['job:rec-trunc'];
  assert.equal(back.entityId, e2.id, 're-linked after the truncating catch-up');
  assert.ok(back.job.simTime >= kernelSimBefore + 199,
    `the resume loop processed the WHOLE 200s (kernel simTime ${kernelSimBefore} → ${back.job.simTime}); a single truncated advance would freeze it short`);
  assert.ok(back.job.loopCount > 1000, `a tiny-phase miner loops thousands of times over 200s (got ${back.job.loopCount})`);
});

// ═══ exactly one intent writer per job hull per tick — traffic yields ══════════════════════════════
test('one writer: traffic yields (writes no intent) for a hull carrying a jobId', () => {
  const sim = boot(7, [npcJobsRuntime, traffic]);
  // a station so traffic.update proceeds past its no-stations guard
  sim.spawn({ type: 'station', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 30, hull: 1000, hullMax: 1000 });
  const jobHull = hull(sim, 'rec-job', { x: 300, z: 0 });
  const plainHull = hull(sim, 'rec-plain', { x: 500, z: 0 });
  sim.helpers.npcJobs.assign(jobHull, minerSpec());
  assert.equal(jobHull.data.jobId, 'job:rec-job');
  sim.state.traffic = sim.state.traffic || { freighters: [] };
  sim.state.traffic.freighters = [
    { id: jobHull.id, role: 'miner', targetId: null, waitT: 0, nextTradeT: 5, orbitPhase: 0, dockSeq: 0, manifest: null },
    { id: plainHull.id, role: 'hauler', targetId: null, waitT: 0, nextTradeT: 5, orbitPhase: 0, dockSeq: 0, manifest: null },
  ];
  delete jobHull.data.intent;
  delete plainHull.data.intent;
  const trafficSys = sim.registry.get('npcJobsRuntime') && sim.registry.get('traffic');
  trafficSys.update(DT, sim.state);
  assert.equal(jobHull.data.intent, undefined, 'traffic yields the job hull (no second intent writer)');
  assert.ok(plainHull.data.intent && typeof plainHull.data.intent === 'object', 'traffic still steers a non-job hull');
  // and the runtime IS the one writer for the job hull
  sim.registry.get('npcJobsRuntime').update(DT, sim.state);
  assert.ok(jobHull.data.intent && typeof jobHull.data.intent === 'object', 'npcJobsRuntime is the single writer for the job hull');
});

// ═══ a terminal hauler hands the hull back on COMPLETE ════════════════════════════════════════════
test('hauler terminal: on COMPLETE the job unlinks and drops from the bag (hull reverts to ambient)', () => {
  const sim = boot();
  const e = hull(sim, 'rec-haul');
  sim.helpers.npcJobs.assign(e, haulerSpec());
  const jobs = sim.registry.get('npcJobsRuntime');
  let guard = 0;
  while (jobs._byId()['job:rec-haul'] && guard++ < 60 * 60) sim.step(DT); // up to 60s
  assert.ok(guard < 60 * 60, 'hauler reached COMPLETE and was released within 60s');
  assert.equal(jobs._byId()['job:rec-haul'], undefined, 'bag no longer holds the completed hauler job');
  assert.equal(e.data.jobId, undefined, 'the hull no longer claims a job');
  assert.equal(e.alive, true, 'the hull itself survives (only the job ended)');
});

// ═══ threat → flee interrupt; clear → resume (ruling 3) ═══════════════════════════════════════════
test('flee: a nearby hostile interrupts the job into flee; removing it resumes the prior phase', () => {
  const sim = boot();
  const e = hull(sim, 'rec-flee', { x: 0, z: 0 });
  sim.helpers.npcJobs.assign(e, minerSpec());
  const jobs = sim.registry.get('npcJobsRuntime');
  const job = jobs._byId()['job:rec-flee'].job;
  while (job.phase !== NPC_JOB_PHASE.TRANSIT) sim.step(DT); // moving, so flee is observable
  // Spawn a hostile combat ship (team 1) right next to the miner.
  const threat = sim.spawn({ type: 'ship', team: 1, pos: { x: e.pos.x + 60, z: e.pos.z }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  sim.step(DT);
  assert.equal(job.phase, NPC_JOB_PHASE.FLEE, 'a nearby hostile interrupts the job into flee');
  assert.equal(e.data.intent.boost, true, 'the civilian bolts (boost) away from the threat');
  // Remove the threat; the job resumes its prior legal phase (never a reset).
  despawn(sim.state, threat.id);
  sim.step(DT);
  assert.notEqual(job.phase, NPC_JOB_PHASE.FLEE, 'with the threat gone the job resumes');
});

// ═══ THE REAL Continue path: saveSystem.serialize → loadEnvelope with the runtime REGISTERED ═══════
// The other save test round-trips the bag directly; this exercises the production save envelope +
// destructive restore end-to-end (the path the browser save→Continue capture will exercise).
test('save/Continue (real envelope): the live job persists through saveSystem.serialize + loadEnvelope, restored virtual', () => {
  const sim = createSimulation({ seed: 7, systems: [npcJobsRuntime, save] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  // A real save envelope requires a player entity (the loadEnvelope normalizer rejects `no_player`).
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6, flags: { persistent: true } });
  sim.state.playerId = player.id;
  const e = hull(sim, 'rec-continue');
  sim.helpers.npcJobs.assign(e, minerSpec());
  stepSeconds(sim, 8); // mid-loop
  const jobs = sim.registry.get('npcJobsRuntime');
  const beforePhase = jobs._byId()['job:rec-continue'].job.phase;
  const beforeLast = jobs._byId()['job:rec-continue'].lastAdvanceSimT;

  const saveSys = sim.registry.get('save');
  const envelope = saveSys.serialize('test-slot');
  assert.equal(envelope.version, 12, 'envelope stamped v12');
  assert.ok(envelope.data.npcJobs && envelope.data.npcJobs.byId, 'envelope carries the npcJobs bag');
  const savedJob = envelope.data.npcJobs.byId['job:rec-continue'];
  assert.ok(savedJob && savedJob.job, 'the LIVE job is serialized (registered runtime, not the {} unregistered fallback)');
  assert.equal(savedJob.job.kind, NPC_JOB_KIND.MINER);
  assert.equal(savedJob.lastAdvanceSimT, beforeLast, 'the away-clock anchor persists in the envelope');

  // Continue: destructive restore. Entities are cleared → the job comes back VIRTUAL to re-link later.
  const loaded = saveSys.loadEnvelope(JSON.parse(JSON.stringify(envelope)), 'test-continue');
  assert.equal(loaded, true, 'loadEnvelope succeeds');
  const back = jobs._byId()['job:rec-continue'];
  assert.ok(back, 'the job survived Continue');
  assert.equal(back.job.phase, beforePhase, 'phase preserved across Continue');
  assert.equal(back.entityId, null, 'restored virtual (re-links to the rematerialized hull on next enter)');
  assert.equal(back.job.materialized, false);
});

test('migration v11→v12 (real load): a pre-v12 envelope with no npcJobs loads to an empty bag (fail closed, no crash)', () => {
  const sim = createSimulation({ seed: 7, systems: [npcJobsRuntime, save] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6, flags: { persistent: true } });
  sim.state.playerId = player.id;
  const saveSys = sim.registry.get('save');
  const envelope = saveSys.serialize('test-slot');
  // Downgrade to a v11 save: strip the new key + set version 11; drop the checksum so the pre-migration
  // validator does not reject our synthetic old envelope (checksum is over the stored data shape).
  delete envelope.data.npcJobs;
  envelope.version = 11;
  delete envelope.checksum;
  const loaded = saveSys.loadEnvelope(envelope, 'test-old-save');
  assert.equal(loaded, true, 'an old (v11) save loads through the v11→v12 migration');
  const jobs = sim.registry.get('npcJobsRuntime');
  assert.deepEqual(jobs._byId(), {}, 'old save → empty job bag (migration seeded {byId:{}}, runtime deserialized cleanly)');
});
