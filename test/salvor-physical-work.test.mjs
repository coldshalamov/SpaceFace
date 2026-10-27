import { captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';
// General cutters: physical work gates and stable finite custody, through real owner seams.
// These deterministic owner tests explicitly use the custom backend; the native route has a
// separate Rapier fixture. Moving poses here stages external displacement, not production motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { salvage } from '../src/systems/salvage.js';
import { world } from '../src/systems/world.js';
import { insertFarActor, promoteFarActor } from '../src/world/farActorTable.js';
import { save } from '../src/save/saveSystem.js';
import { NPC_JOB_PHASE as P } from '../src/systems/npcJobs.js';
import { SECTORS } from '../src/data/sectors.js';
import { VESTA_DERELICT_SALVAGE_SOURCE as SOURCE } from '../src/data/sectorZones.js';

function fixture(t, { source = false, worldOwner = false } = {}) {
  const sim = createSimulation({ seed: 4242,
    systems: [...(worldOwner ? [world] : []), npcJobsRuntime, traffic, ...(source ? [salvage] : []), save],
    updateOrder: [npcJobsRuntime, traffic] });
  t.after(() => sim.dispose());
  const s = sim.state; s.mode = 'flight'; s.settings.gameplay.physicsBackend = 'custom';
  s.world.currentSectorId = SOURCE.sectorId;
  s.world.sectors = Object.fromEntries(SECTORS.map(x => [x.id, x]));
  s.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: -10000, z: -10000 }, hull: 100,
    radius: 6, flags: { persistent: true } }).id;
  if (worldOwner) sim.registry.get('world').enterSector(SOURCE.sectorId);
  const yard = worldOwner ? s.entityList.find(e => e.data?.stationId === 'station_forge')
    : sim.spawn({ type: 'station', pos: { x: 0, z: 0 }, radius: 40, data: { stationId: 'station_forge' }, flags: { persistent: true } });
  if (source && !worldOwner) sim.registry.get('salvage')._planForSector(SOURCE.sectorId);
  const spawn = (pos = { x: yard.pos.x + 320, z: yard.pos.z + 40 }, qty = 5) => sim.spawn({ type: 'wreck', pos, radius: 9,
    mass: 1000, hull: 10, flags: { persistent: true }, data: { salvagePool: { cmdty_scrap_metal: qty }, salvageTimeLeft: 8 } });
  const wreck = source ? sim.helpers.salvage.entityForPoint(SOURCE.salvagePointId, SOURCE.sourceKey) : spawn();
  assert.ok(wreck); wreck.data.salvorNoticeAt = 0;
  const sys = sim.registry.get('traffic'), jobs = sim.registry.get('npcJobsRuntime');
  sys.update(.25, s);
  const cutter = s.entityList.find(e => e.alive !== false && e.data?.generalSalvor
    && sim.helpers.npcJobs.get(e.data.jobId)?.job?.payload?.targetId === wreck.id);
  assert.ok(cutter);
  const entry = sim.helpers.npcJobs.get(cutter.data.jobId);
  const events = []; sim.bus.on('salvage:npcExtraction', p => events.push(structuredClone(p)));
  const tickJobs = () => { jobs.update(.25, s); sim.bus.flush(); };
  const stageCut = () => { entry.job.phase = P.WORK; entry.job.routeIndex = 1; entry.job.progress = .99; entry.job.workS = 1;
    cutter.pos = { x: wreck.pos.x - 20, z: wreck.pos.z }; cutter.vel = { ...wreck.vel }; };
  return { sim, s, sys, jobs, yard, wreck, cutter, entry, events, spawn, tickJobs, stageCut };
}

test('a displaced or fast-moving wreck pauses its cut; matching drift resumes exactly once', t => {
  const h = fixture(t); h.stageCut();
  h.wreck.pos.x += 4000;
  for (let i = 0; i < 10; i++) h.tickJobs();
  assert.equal(h.entry.job.progress, .99); assert.equal(h.events.length, 0);
  assert.equal(h.wreck.data.salvagePool.cmdty_scrap_metal, 5);
  h.cutter.pos = { x: h.wreck.pos.x - 20, z: h.wreck.pos.z };
  h.wreck.vel.x = 60; h.tickJobs();
  assert.equal(h.entry.job.progress, .99, 'close is not settled while relative speed is unsafe');
  h.cutter.vel.x = 60; h.tickJobs();
  assert.equal(h.events.length, 1); assert.equal(h.cutter.data.cargoManifest.totalQty, 5);
  assert.deepEqual(h.wreck.data.salvagePool, {});
  h.tickJobs(); assert.equal(h.events.length, 1);
});

test('unready native ownership cannot be substituted by nearby scalar poses', t => {
  const h = fixture(t); h.stageCut(); h.s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  h.tickJobs(); assert.equal(h.events.length, 0); assert.equal(h.entry.job.progress, .99);
});

test('a controller lease cannot cut; released workers must regain the displaced source', t => {
  const h = fixture(t); h.stageCut();
  assert.equal(h.sim.helpers.npcJobs.claimControl(h.entry.job.id, { claimId: 'test:interruption' }).granted, true);
  h.tickJobs(); assert.equal(h.events.length, 0); assert.equal(h.wreck.data.salvagePool.cmdty_scrap_metal, 5);
  h.wreck.pos.x += 500;
  assert.equal(h.sim.helpers.npcJobs.releaseControl(h.entry.job.id, 'test:interruption').released, true);
  const progress = h.entry.job.progress;
  h.tickJobs(); assert.equal(h.events.length, 0); assert.equal(h.entry.job.progress, progress);
  h.cutter.pos = { x: h.wreck.pos.x - 20, z: h.wreck.pos.z };
  for (let i = 0; i < 500 && !h.events.length; i++) h.tickJobs();
  assert.equal(h.events.length, 1);
});

test('a foreign claim prevents cutting and a new commission starts fresh work', t => {
  const h = fixture(t); h.stageCut(); h.wreck.data.salvorClaimedBy = 'another:crew';
  h.tickJobs(); assert.equal(h.events.length, 0);
  const next = h.spawn({ x: h.wreck.pos.x + 200, z: h.wreck.pos.z }, 7); next.data.salvorNoticeAt = 0;
  h.sys._salvageTargetCache = null; h.sys._salvageTargetCacheTick = null;
  h.sys._maintainGeneralSalvorJobs();
  assert.equal(h.entry.job.phase, P.TRANSIT); assert.equal(h.entry.job.routeIndex, 0);
  assert.equal(h.entry.job.progress, 0); assert.equal(h.entry.job.payload.targetKey, next.data.salvorTargetKey);
  assert.equal(h.wreck.data.salvorClaimedBy, 'another:crew');
  assert.equal(h.wreck.data.salvagePool.cmdty_scrap_metal, 5);
});

test('lost source returns empty instead of spending a recycled numeric id or a duplicate identity', t => {
  const h = fixture(t, { source: true }); h.stageCut();
  const old = h.wreck.id, before = h.sim.helpers.salvage.source(SOURCE.sourceKey).remainingQty;
  h.sim.helpers.removeEntity(old, { immediate: true, reason: 'source_unresident' }); h.sim.bus.flush();
  const foreign = h.spawn({ x: h.cutter.pos.x, z: h.cutter.pos.z }, 11);
  assert.equal(foreign.id, old);
  h.tickJobs(); assert.equal(h.events.length, 0);
  for (const e of h.s.entityList) if (e !== h.wreck && e.data) e.data.salvorNoticeAt = 1e9;
  h.sys._salvageTargetCache = null; h.sys._salvageTargetCacheTick = null;
  h.sys._maintainGeneralSalvorJobs();
  assert.equal(h.entry.job.phase, P.RETURN); assert.equal(h.entry.job.payload.sourceUnavailable, true);
  assert.equal(h.sim.helpers.salvage.source(SOURCE.sourceKey).remainingQty, before);
  assert.equal(foreign.data.salvagePool.cmdty_scrap_metal, 11);
  assert.equal(foreign.data.salvorClaimedBy, undefined);
  const payload = { targetType: 'wreck', targetKey: h.sys._salvorTargetKey(foreign) };
  for (let i = 0; i < 2; i++) h.spawn().data.salvorTargetKey = payload.targetKey;
  assert.equal(h.sys._resolveSalvorTargetFromWaypoint(`hulk:${old}`, payload), null, 'three duplicates remain ambiguous');
});

test('ordinary recycled ids cannot finish the previous occupant’s work', t => {
  const h = fixture(t); h.stageCut(); const old = h.wreck.id;
  h.sim.helpers.removeEntity(old, { immediate: true, reason: 'taken_by_player' }); h.sim.bus.flush();
  const next = h.spawn({ ...h.cutter.pos }, 9); assert.equal(next.id, old);
  h.tickJobs(); assert.equal(h.events.length, 0); assert.equal(next.data.salvagePool.cmdty_scrap_metal, 9);
  assert.notEqual(h.sys._salvorTargetKey(next), h.entry.job.payload.targetKey);
});

for (const source of [false, true]) test(`${source ? 'authored source' : 'ordinary body'} mid-cut Continue preserves identity but waits for physical arrival`, t => {
  const h = fixture(t, { source, worldOwner: true }); h.stageCut();
  const wr = h.cutter.data.worldRecordId, payload = structuredClone(h.entry.job.payload);
  h.cutter.pos.x -= 3000;
  const saveSys = h.sim.registry.get('save');
  const envelope = JSON.parse(JSON.stringify(saveSys.serialize('salvor-before-cut')));
  assert.equal(saveSys.loadEnvelope(envelope, 'salvor-before-cut'), true);
  h.s.settings.gameplay.physicsBackend = 'custom'; // Continue pins the production backend; fixture has no physics owner.
  const cutter = h.s.entityList.find(e => e.alive !== false && e.data?.worldRecordId === wr);
  assert.ok(cutter);
  const entry = h.sim.helpers.npcJobs.get(cutter.data.jobId);
  assert.deepEqual(entry.job.payload, payload);
  const target = h.sys._resolveSalvorTargetFromWaypoint(entry.job.route[1].id, entry.job.payload);
  assert.ok(target, 'the same finite source rematerializes');
  h.tickJobs(); assert.equal(h.events.length, 0); assert.equal(entry.job.progress, .99);
  h.sys._maintainGeneralSalvorJobs();
  cutter.pos = { x: target.pos.x - 20, z: target.pos.z }; cutter.vel = { ...target.vel };
  h.tickJobs(); assert.equal(h.events.length, 1); assert.ok(cutter.data.cargoManifest.totalQty > 0);
  h.tickJobs(); assert.equal(h.events.length, 1);
});

function shelf(h, entity) {
  const row = insertFarActor(h.s, entity, h.s.simTime, h.sim.helpers);
  assert.ok(row);
  h.sim.helpers.removeEntity(entity.id, { immediate: true, reason: 'virtualize' });
  h.sim.bus.emit('world:farActorShelved', { id: row.id, type: row.type, jobId: row.jobId,
    trafficRole: row.trafficRole, homeSectorId: row.homeSectorId });
  h.sim.bus.flush(); return row;
}
function promote(h, row) {
  const entity = promoteFarActor(h.s, row.id, h.sim.helpers);
  assert.ok(entity);
  h.sim.bus.emit('world:farActorRestored', { id: entity.id, type: row.type, jobId: row.jobId,
    trafficRole: row.trafficRole, entity }); h.sim.bus.flush(); return entity;
}

for (const source of [false, true]) test(`an unresident ${source ? 'authored' : 'ordinary'} source remains the same finite commission and resumes after promotion`, t => {
  const h = fixture(t, { source }); h.stageCut();
  const key = h.entry.job.payload.targetKey, row = shelf(h, h.wreck);
  h.tickJobs(); h.sys._maintainGeneralSalvorJobs();
  assert.equal(h.events.length, 0); assert.equal(h.entry.job.progress, .99);
  assert.equal(h.entry.job.payload.targetKey, key); assert.equal(h.entry.job.phase, P.WORK);
  const target = promote(h, row);
  assert.equal(target.data.salvorTargetKey, key); assert.equal(target.data.salvagePool.cmdty_scrap_metal, source ? 8 : 5);
  if (source) assert.equal(h.sim.helpers.salvage.entityForPoint(SOURCE.salvagePointId, SOURCE.sourceKey), target);
  h.tickJobs(); assert.equal(h.events.length, 1); assert.equal(h.cutter.data.cargoManifest.totalQty, source ? 8 : 5);
});

for (const continueWhileShelved of [false, true]) test(`loaded cutter preserves exact custody through ${continueWhileShelved ? 'shelved Continue' : 'far promotion'}`, t => {
  const h = fixture(t, { worldOwner: true }); h.stageCut(); h.tickJobs();
  assert.equal(h.events.length, 1);
  const manifest = structuredClone(h.cutter.data.cargoManifest), wr = h.cutter.data.worldRecordId;
  const jobId = h.entry.job.id;
  let row = shelf(h, h.cutter);
  h.tickJobs(); assert.equal(h.events.length, 1);
  if (continueWhileShelved) {
    const saveSys = h.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(saveSys.serialize('salvor-shelved-load')));
    assert.equal(saveSys.loadEnvelope(envelope, 'salvor-shelved-load'), true);
    h.s.settings.gameplay.physicsBackend = 'custom';
    row = h.s.world.farActors.rows.find(r => r.data?.worldRecordId === wr);
    assert.ok(row);
  }
  const restored = promote(h, row), entry = h.sim.helpers.npcJobs.get(jobId);
  assert.ok(entry); assert.deepEqual(restored.data.cargoManifest, manifest);
  const rec = h.s.traffic.freighters.find(r => r.id === restored.id);
  assert.deepEqual(rec.manifest, manifest);
  assert.equal(h.sys._salvorWorkTarget(entry, restored).blocked, undefined);
  for (let i = 0; i < 500 && entry.job.phase === P.LOAD; i++) h.tickJobs();
  assert.notEqual(entry.job.phase, P.LOAD, 'wrangle resumes instead of hanging against the drained source');
  assert.deepEqual(restored.data.cargoManifest, manifest); assert.equal(h.events.length, 1);
});


test('a lost cutter releases its reservation on a still-shelved ordinary source', t => {
  const h = fixture(t); h.stageCut(); const row = shelf(h, h.wreck);
  assert.equal(row.data.salvorClaimedBy, h.cutter.data.worldRecordId);
  h.sim.helpers.removeEntity(h.cutter.id, { immediate: true, reason: 'cutter_lost' }); h.sim.bus.flush();
  assert.equal(row.data.salvorClaimedBy, undefined);
  assert.equal(promote(h, row).data.salvagePool.cmdty_scrap_metal, 5);
});

test('dispatch paperwork does not require a new cutter to dock before pursuing its source', t => {
  const h = fixture(t);
  h.cutter.pos = { x: h.yard.pos.x + 500, z: h.yard.pos.z };
  h.entry.job.phase = P.COMMISSION; h.entry.job.routeIndex = 0; h.entry.job.progress = 0;
  assert.equal(h.sys._salvorWorkTarget(h.entry, h.cutter), null);
  h.tickJobs();
  assert.ok(h.entry.job.progress > 0, 'the ordinary commission clock runs outside the yard envelope');
  assert.equal(h.events.length, 0);
  assert.equal(h.wreck.data.salvagePool.cmdty_scrap_metal, 5);
  h.entry.job.phase = P.WORK; h.entry.job.routeIndex = 1; h.entry.job.progress = .99;
  h.tickJobs();
  assert.equal(h.entry.job.progress, .99, 'the subsequent cut still waits for physical source arrival');
  h.entry.job.phase = P.UNLOAD; h.entry.job.routeIndex = 0; h.entry.job.progress = .99;
  h.tickJobs();
  assert.equal(h.entry.job.progress, .99, 'yard delivery remains physically gated');
});

test('general maintenance cannot rewrite an authored salvor shift or reserve its nearby wreck', t => {
  for (const hasWreck of [false, true]) {
    const sim = createSimulation({ seed: 4242, systems: [npcJobsRuntime, traffic],
      updateOrder: [npcJobsRuntime, traffic] });
    t.after(() => sim.dispose());
    const s = sim.state; s.mode = 'flight'; s.settings.gameplay.physicsBackend = 'custom';
    s.world.currentSectorId = 'sector_helios_prime';
    const actor = sim.spawn({ type: 'ship', pos: { x: 682, z: -234 }, hull: 100, radius: 12,
      data: { worldRecordId: 'authored:fence', trafficRole: 'salvor', activityActorSlotId: 'helios_seam_fence' } });
    const rec = { id: actor.id, role: 'salvor', worldRecordId: actor.data.worldRecordId };
    s.traffic.freighters.push(rec);
    const jobId = sim.helpers.npcJobs.assign(actor, { kind: 'salvor', sectorId: s.world.currentSectorId,
      route: [
        { id: 'helios_fence_shadow', pos: { x: 609, z: -220 }, targetRef: 'actor:helios_seam_miner' },
        { id: 'helios_fence_offload', pos: { x: 796, z: -350 }, targetRef: 'dest:station_helios' },
      ] });
    assert.ok(jobId);
    const entry = sim.helpers.npcJobs.get(jobId);
    if (hasWreck) { entry.job.phase = P.WORK; entry.job.progress = .4; }
    const before = structuredClone(entry.job);
    const wreck = hasWreck && sim.spawn({ type: 'wreck', pos: { x: 700, z: -230 }, radius: 8,
      data: { salvagePool: { cmdty_scrap_metal: 5 }, salvorNoticeAt: 0 } });
    sim.registry.get('traffic')._maintainGeneralSalvorJobs();
    assert.deepEqual(entry.job, before, 'the authored route, payload and work progress retain their owner');
    assert.equal(actor.data.generalSalvor, undefined);
    assert.equal(rec.generalSalvor, undefined);
    if (wreck) {
      assert.equal(wreck.data.salvorClaimedBy, undefined);
      assert.equal(wreck.data.salvorTargetKey, undefined);
    }
  }
});


test('commissioned wreck records preserve only their original finite source and body', () => {
  const source = { id: 17, type: 'wreck', alive: true, pos: { x: 12, z: 24 }, vel: { x: 2, z: -1 },
    radius: 4, mass: 160, hull: 20, hullMax: 100, collides: true, physicsBody: { mode: 'dynamic', shape: 'ball', radius: 4 },
    data: { homeSectorId: 'sector_vesta_forge', salvorTargetKey: 'salvor:424219:17:25',
      salvorClaimedBy: 'wr_cutter', salvagePool: { cmdty_scrap_metal: 5, cmdty_salvage_electronics: 2 },
      salvageTimeLeft: 8, parentType: 'ship', npcTowAttachmentId: 'runtime-only' } };
  const record = captureEntityRecord(source, { seed: 424219 });
  const restored = spawnSpecFromRecord(record);
  assert.deepEqual(restored.data.salvagePool, source.data.salvagePool);
  assert.equal(restored.data.salvorTargetKey, source.data.salvorTargetKey);
  assert.equal(restored.data.salvorClaimedBy, 'wr_cutter');
  assert.equal(restored.data.npcTowAttachmentId, undefined);
  for (const key of ['radius', 'mass', 'collides', 'physicsBody']) assert.deepEqual(restored[key], source[key]);
  restored.data.salvagePool.cmdty_scrap_metal = 0;
  assert.equal(source.data.salvagePool.cmdty_scrap_metal, 5, 'saved custody is a detached snapshot');
  source.data.salvagePool = {};
  const exhausted = captureEntityRecord(source, { seed: 424219 });
  assert.deepEqual(spawnSpecFromRecord(exhausted).data.salvagePool, {}, 'empty remains empty, never replenished');

  for (const mutate of [
    rec => { rec.recordId += ':copied'; },
    rec => { rec.kind = 'convoy'; rec.type = 'ship'; },
    rec => { rec.extra.salvorSource.body.mass = NaN; },
    rec => { rec.extra.salvorSource.data.salvagePool.cmdty_scrap_metal = -1; },
    rec => { rec.extra.salvorSource.data.salvorTargetKey = 'foreign-source'; },
  ]) {
    const foreign = structuredClone(record); mutate(foreign);
    assert.equal(spawnSpecFromRecord(foreign), null, 'foreign, duplicated or malformed source refuses a replacement shell');
  }
  const ordinary = structuredClone(source);
  delete ordinary.data.salvorTargetKey; delete ordinary.data.salvorClaimedBy;
  const untouched = spawnSpecFromRecord(captureEntityRecord(ordinary, { seed: 424219 }));
  assert.equal(untouched.radius, 18, 'uncommissioned ordinary wrecks retain their compact existing recipe');
  assert.equal(untouched.data.salvagePool, undefined);
});


test('a competing retarget claim preserves prior work; a later admitted source resets once', t => {
  const h = fixture(t); h.stageCut();
  h.wreck.data.salvorClaimedBy = 'another:crew';
  const next = h.spawn({ x: h.wreck.pos.x + 200, z: h.wreck.pos.z }, 7);
  next.data.salvorNoticeAt = 0;
  h.sys._salvageTargetCache = null; h.sys._salvageTargetCacheTick = null;
  const previous = structuredClone(h.entry.job);
  const pool = structuredClone(h.wreck.data.salvagePool);
  const cargo = structuredClone(h.cutter.data.cargoManifest);
  const originalStamp = h.sys._stampSalvorClaim;
  let attempts = 0, refuse = true;
  h.sys._stampSalvorClaim = function (body, id) {
    attempts++;
    if (refuse) return false; // actual atomic-claim boundary refuses a newly competing crew
    return originalStamp.call(this, body, id);
  };
  h.sys._maintainGeneralSalvorJobs();
  assert.equal(attempts, 1, 'one atomic claim attempt, no trailing second stamp');
  assert.deepEqual(h.entry.job, previous, 'refusal cannot erase spent work or retarget the old job');
  assert.deepEqual(h.wreck.data.salvagePool, pool);
  assert.deepEqual(h.cutter.data.cargoManifest, cargo);
  assert.equal(next.data.salvagePool.cmdty_scrap_metal, 7);
  assert.equal(h.events.length, 0);
  refuse = false;
  h.sys._maintainGeneralSalvorJobs();
  assert.equal(attempts, 2);
  assert.equal(h.entry.job.payload.targetId, next.id);
  assert.equal(h.entry.job.phase, P.TRANSIT);
  assert.equal(h.entry.job.routeIndex, 0);
  assert.equal(h.entry.job.progress, 0);
  assert.equal(next.data.salvorClaimedBy, h.cutter.data.worldRecordId);
  h.entry.job.progress = .35;
  h.sys._maintainGeneralSalvorJobs();
  assert.equal(attempts, 2, 'the already-admitted original is not claimed a second time');
  assert.equal(h.entry.job.progress, .35, 'reentry preserves current work');
  assert.deepEqual(h.wreck.data.salvagePool, pool);
  assert.equal(h.wreck.data.salvorClaimedBy, 'another:crew');
  assert.equal(next.data.salvagePool.cmdty_scrap_metal, 7);
  assert.equal(h.events.length, 0);
});
