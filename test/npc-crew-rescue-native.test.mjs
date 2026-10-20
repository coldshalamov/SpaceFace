import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { crewRescueNativeFixture } from './fixtures/npc-crew-rescue-native.mjs';

// Authored actors and poses, real Rapier movement, production-order selected owners, including world residency updates. Damage is
// injected at the combat subsystem boundary, not a claim that a weapon struck the drive.
const request = entityId => ({ version: 1, entityId, tick: 1, kind: 'hold',
  forceLocal: { forward: 1, right: 0 }, torqueYaw: 0, boost: false, brake: false,
  targetHeading: 0, horizonTicks: 1, trajectory: [], reason: 'crew_queued_boundary_test' });
const ownedPaths = ['src/systems/npcJobsRuntime.js', 'src/systems/aiPorts.js',
  'src/combat/persistence.js', 'src/save/saveSystem.js'];

for (const restore of [false, true]) test(`native ordinary crew rescue ${restore ? 'survives full Continue' : 'flies to the casualty and really repairs'}`, async () => {
  const sourceHashes = Object.fromEntries(ownedPaths.map(path =>
    [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
  const f = await crewRescueNativeFixture({ worldTicks: true });
  try {
    const rt = f.sim.registry.get('npcJobsRuntime'), ports = f.sim.registry.get('aiPorts');
    let tender = f.state.entityList.find(e => e.data?.activityActorSlotId === 'ceres_refinery_tender');
    let casualty = f.state.entityList.find(e => e.data?.activityActorSlotId === 'ceres_seam_surveyor');
    const ids = { tender: tender.data.worldRecordId, casualty: casualty.data.worldRecordId };
    const originalCasualtyId = casualty.id, jobId = casualty.data.jobId;
    const route = JSON.stringify(rt._entryForEntity(casualty.id).job.route);
    const stages = [], checkpoints = [], repairs = [];
    const capture = label => checkpoints.push({ label, tick: f.state.tick, simTime: f.state.simTime,
      entities: [tender, casualty].map(e => ({ id: e.id, generation: e.occupantGeneration,
        worldRecordId: e.data.worldRecordId, slotId: e.data.activityActorSlotId,
        shipDefId: e.data.defId, jobId: e.data.jobId, pos: { ...e.pos }, vel: { ...e.vel },
        rotation: e.rot, radius: e.radius, data: JSON.parse(JSON.stringify(e.data)), driveDisabled: rt._crewDriveState(e.id) })) });
    f.sim.bus.on('npcjobs:crewResponse', p => {
      stages.push(p);
      if (['welding', 'welded', 'repaired'].includes(p.stage)) capture(p.stage);
    });
    f.sim.bus.on('combat:repairSubsystem', p => { if (p.reason === 'crew_field_repair') repairs.push(p); });
    assert.ok(Math.hypot(tender.pos.x - casualty.pos.x, tender.pos.z - casualty.pos.z) > 2000);
    const flush = ports.update, reject = ports._rejectManeuver;
    let flushing = false, rescueFlushDrops = 0;
    ports.update = function (...args) { flushing = true; try { return flush.apply(this, args); } finally { flushing = false; } };
    ports._rejectManeuver = function (reason) {
      if (flushing && reason === 'crew_response_owned') rescueFlushDrops++;
      return reject.call(this, reason);
    };
    assert.equal(ports._requestManeuver(request(tender.id)), true, 'pre-claim request accepted');
    f.disable(casualty); f.step(2);
    assert.equal(rt._crewDriveState(casualty.id), true);
    assert.ok(rescueFlushDrops > 0, 'a request queued before claim is rejected at actual flush');
    assert.equal(ports._requestManeuver(request(tender.id)), false, 'active exact rescue rejects AI overwrite');
    assert.equal(ports._diag.lastDropReason, 'crew_response_owned');
    assert.equal(ports._pendingManeuvers.has(String(tender.id)), false, 'queued pre-claim request flushed without ownership');
    f.step(1198); capture('native_approach');
    if (restore) {
      const cargoBefore = JSON.stringify(f.state.world.records.byId[ids.casualty].cargoManifest);
      const save = f.sim.registry.get('save');
      const envelope = JSON.parse(JSON.stringify(save.serialize('crew-mid-approach'))); delete envelope.checksum;
      assert.ok(envelope.data?.combat || envelope.combat, 'whole save envelope');
      assert.equal(save.loadEnvelope(envelope), true);
      f.physics._finishNativeRestore(); f.state.mode = 'flight';
      assert.equal(await f.physics.prepareBackend(f.state), true); f.step(2);
      const resolve = id => f.state.entityList.filter(e => e.alive && e.data?.worldRecordId === id);
      assert.equal(resolve(ids.tender).length, 1); assert.equal(resolve(ids.casualty).length, 1);
      [tender] = resolve(ids.tender); [casualty] = resolve(ids.casualty);
      assert.notEqual(casualty.id, originalCasualtyId);
      assert.equal(casualty.data.jobId, jobId);
      assert.equal(JSON.stringify(f.state.world.records.byId[ids.casualty].cargoManifest), cargoBefore);
      assert.equal(rt._crewDriveState(casualty.id), true, 'Continue must not silently heal the disabled NPC');
      assert.equal(JSON.stringify(rt._entryForEntity(casualty.id).job.route), route);
      assert.equal(Object.values(f.state.npcJobs.byId).filter(e => e.control?.holder === 'crewResponse').length, 1);
      capture('continued_disabled');
    }
    for (let i = 0; i < 180 * 60 && !stages.some(p => p.stage === 'repaired'); i++) f.step();
    assert.equal(stages.filter(p => p.stage === 'repaired').length, 1);
    assert.equal(repairs.length, 1, 'one real combat repair command');
    assert.equal(rt._crewDriveState(casualty.id), false);
    assert.equal(rt._crewResponse, null);
    assert.equal(Object.values(f.state.npcJobs.byId).filter(e => e.control?.holder === 'crewResponse').length, 0);
    assert.equal(ports._requestManeuver(request(tender.id)), true, 'release restores ordinary AI authority');
    f.step(120); capture('repaired_departure');
    const repairedEntry = rt._entryForEntity(casualty.id);
    assert.equal(repairedEntry.job.id, jobId);
    assert.equal(JSON.stringify(repairedEntry.job.route), route);
    const atRepair = { phase: repairedEntry.job.phase, progress: repairedEntry.job.progress };
    f.step(600);
    assert.ok(repairedEntry.job.phase !== atRepair.phase || repairedEntry.job.progress !== atRepair.progress,
      'the original shift advances after actual repair, rather than merely displaying a receipt');
    assert.equal(repairs.length, 1);
    assert.equal(stages.filter(p => p.stage === 'repaired').length, 1);
    if (!restore && process.env.CREW_RESCUE_POSES) {
      writeFileSync(process.env.CREW_RESCUE_POSES, JSON.stringify({
        label: 'Focused native Rapier rescue, selected production-order owners; not live game-camera acceptance',
        damageSetup: 'Combat drive health zero plus scheduled production subsystem transition',
        sourceHashes,
        stages, checkpoints
      }, null, 2));
    }
  } finally { f.close(); }
});
