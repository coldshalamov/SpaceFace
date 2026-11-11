import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { mining } from '../src/systems/mining.js';
import { heliosCuttingCrossing, heliosCuttingCourtesyRead, clearHeliosCuttingCourtesy } from '../src/systems/heliosCuttingCourtesy.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

const SECTOR = 'sector_helios_prime', DT = 1 / 60;
function prepare(s, jobs, spawn, p) {
  s.mode = 'flight'; s.world.currentSectorId = SECTOR; s.run.kind = 'adventure';
  s.onboarding = { active: false, finished: true }; s.simTime = 300; s.playerId = p.id;
  const worker = spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 }, radius: 12,
    mass: 30, hull: 100, hullMax: 100, homeSectorId: SECTOR,
    data: { worldRecordId: 'courtesy-cutter', activityActorSlotId: 'helios_seam_miner',
      ai: { passive: true }, trafficRole: 'miner' } });
  const rock = spawn({ type: 'asteroid', pos: { x: 200, z: 0 }, radius: 25, mass: 400,
    hull: 600, hullMax: 600, physicsBody: { dynamic: false, radius: 25 }, homeSectorId: SECTOR,
    data: { typeId: 'ast_common_rock', fieldId: 'f_helios_starter', oreHP: 600, oreHPMax: 600, yieldU: 30 } });
  const id = jobs.assign(worker, { kind: 'miner', sectorId: SECTOR,
    route: [{ id: 'home:station_helios', pos: { x: 0, z: -300 } },
      { id: `field:${rock.id}`, pos: { ...rock.pos } }] });
  assert.ok(id); const entry = s.npcJobs.byId[id];
  Object.assign(entry.job, { phase: 'work', routeIndex: 1, progress: 0 });
  worker.data.minerShiftRockId = rock.id;
  jobs._heliosStarterMinerRecordId = worker.data.worldRecordId;
  jobs._heliosStarterRockId = rock.id;
  s.player.targetId = worker.id;
  return { worker, rock, entry };
}
function fixture({ voice = false } = {}) {
  const sim = createSimulation({ seed: 73319, systems: [npcJobsRuntime, mining, ...(voice ? [voiceArbiter] : [])] });
  const s = sim.state, p = sim.spawn({ type: 'ship', team: 0, isPlayer: true,
    pos: { x: 100, z: 0 }, radius: 12, mass: 30, hull: 100, hullMax: 100 });
  const jobs = sim.registry.get('npcJobsRuntime'), scene = prepare(s, jobs, x => sim.spawn(x), p);
  return { sim, s, p, jobs, ...scene, tick(n = 1) { for (let i = 0; i < n; i++) sim.step(DT); },
    close() { jobs._cuttingCourtesyCleanup?.(); sim.dispose(); } };
}

test('the ordinary job lowers the beam and holds finite cutting time while the pilot crosses', () => {
  const f = fixture(); try {
    const before = { ore: f.rock.data.oreHP, progress: f.entry.job.progress,
      cargo: structuredClone(f.s.player.cargo), credits: f.s.player.credits,
      worker: { ...f.worker.pos }, player: { ...f.p.pos } };
    const events = []; f.sim.bus.on('mining:yield', e => events.push(e));
    f.tick(180);
    assert.equal(f.rock.data.oreHP, before.ore, 'standing across the cutter must stop actual ore removal');
    assert.ok(heliosCuttingCourtesyRead(f.s, f.worker));
    assert.equal(f.worker.data.minerShiftActive, false);
    assert.equal(f.rock.data.oreHP, before.ore); assert.equal(f.entry.job.progress, before.progress);
    assert.equal(f.worker.data.minerShiftBeamS, undefined); assert.equal(events.length, 0);
    assert.deepEqual({ ...f.worker.pos }, before.worker); assert.deepEqual({ ...f.p.pos }, before.player);
    assert.deepEqual(f.s.player.cargo, before.cargo); assert.equal(f.s.player.credits, before.credits);
    f.p.pos.z = 100; f.tick(29);
    assert.equal(f.rock.data.oreHP, before.ore, 'continuous half-second clearance before relighting');
    f.p.pos.z = 0; f.tick(); f.p.pos.z = 100; f.tick(29);
    assert.equal(f.rock.data.oreHP, before.ore, 're-entering restarts the clearance');
    f.tick(3); assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null);
    assert.ok(f.rock.data.oreHP < before.ore); assert.ok(f.entry.job.progress > 0);
    assert.equal(f.worker.data.minerShiftRockId, f.rock.id);
    f.tick(500);
    assert.equal(f.worker.data.minerShiftActive, false);
    assert.ok(f.worker.data.minerShiftBeamS <= 6.05, `bounded beam ${f.worker.data.minerShiftBeamS}`);
  } finally { f.close(); }
});

test('only the actual current Helios WORK corridor yields, never a hull beyond the rock or a leased worker', () => {
  for (const change of [f => f.p.pos.x = -100, f => f.p.pos.x = 300, f => f.p.pos.z = 100,
    f => f.entry.control = {}, f => f.entry.towAssist = {}, f => f.entry.job.phase = 'return',
    f => f.entry.job.materialized = false, f => f.entry.job.corrupt = true,
    f => f.worker.data.activityActorSlotId = 'other', f => f.entry.worldRecordId = 'other',
    f => f.worker.data.minerShiftRockId = -1, f => f.s.world.currentSectorId = 'sector_ceres_belt',
    f => f.p.homeSectorId = 'sector_ceres_belt', f => f.s.mode = 'menu', f => f.s.ui.docked = true,
    f => f.s.save.restoring = true, f => f.s.run.kind = 'survival', f => f.s.entities.delete(f.rock.id),
    f => f.rock.data.oreHP = 0, f => f.rock.pos.x = 1000, f => f.p.occupantGeneration = 0,
    f => f.p.pos.z = NaN]) {
    const f = fixture(); try { change(f); assert.equal(heliosCuttingCrossing(f.s, f.entry, f.worker, f.rock), false, String(change)); }
    finally { f.close(); }
  }
});

test('Continue boundaries, replacement lives and stale samples invalidate a held read before another owner tick', () => {
  for (const change of [f => f.worker.occupantGeneration++, f => f.p.occupantGeneration++,
    f => f.rock.occupantGeneration++, f => f.s.entities.delete(f.worker.id),
    f => f.s.npcJobs = structuredClone(f.s.npcJobs), f => f.entry.job = structuredClone(f.entry.job),
    f => f.s.world.enterSerial = 1, f => f.s.simTime += .51,
    f => f.sim.bus.emit('game:load'), f => f.sim.bus.emit('sim:pause'),
    f => f.sim.bus.emit('sector:exit'), f => f.s.ui.docked = true]) {
    const f = fixture(); try { f.tick(); assert.ok(heliosCuttingCourtesyRead(f.s, f.worker)); change(f);
      assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null, String(change)); }
    finally { f.close(); }
  }
});

test('real voice floor delays courtesy behind danger and drops it after clearance without consuming a heard receipt', () => {
  const f = fixture({ voice: true }); try {
    const spoken = []; f.sim.bus.on('voice:surface', e => { if (e.id?.startsWith('helios_cutting_courtesy:')) spoken.push(e); });
    f.sim.helpers.voice.say({ id: 'danger', channel: 'alert', text: 'Danger', ttl: 30 });
    f.tick(60); assert.equal(spoken.length, 0);
    f.p.pos.z = 100; f.tick(32); f.sim.helpers.voice.cancel('danger'); f.tick();
    assert.equal(spoken.length, 0);
    f.p.pos.z = 0; f.tick(); assert.equal(spoken.length, 1);
    assert.match(spoken[0].text, /Beam down.*same|Beam down.*finish this face/);
    f.p.pos.z = 100; f.tick(32); f.p.pos.z = 0; f.tick(60);
    assert.equal(spoken.length, 1, 'short repeated crossings stay quiet');
    assert.equal(f.rock.data.oreHP < 600, true, 'clearance resumed real extraction between crossings');
  } finally { f.close(); }
});

test('actual worker vitals stop both cutting render paths but keep the work lamp, including reduced motion', async () => {
  const { createNpcJobSignatureMethods } = await import('../src/render/vfx/npcJobSignatureMethods.js');
  const { resolveNpcJobSignature, createNpcJobSignatureFrameScratch, writeNpcJobSignatureFrame } = await import('../src/render/npcJobSignatureVfx.js');
  const { createReadModel, applySpawnInfos, applyEntityVitals, canonicalClone } = await import('../scripts/lib/simReadModel.mjs');
  const { collectEntityVitals, entityVitalsOf } = await import('../scripts/lib/simWorkerHost.mjs');
  for (const reduced of [false, true]) {
    const f = fixture(); try {
      // Use a near working face so both actual renderer paths have visible contact.
      f.rock.pos.x = 100; f.p.pos.x = 50; f.p.pos.z = 100; f.tick();
      assert.equal(f.worker.data.minerShiftActive, true);
      const model = createReadModel(), shadow = new Map();
      applySpawnInfos(model, [f.worker, f.rock].map(e => ({ v: 2, entityId: e.id, type: e.type,
        occupantGeneration: e.occupantGeneration,
        alive: e.alive, team: e.team, x: e.pos.x, z: e.pos.z,
        data: canonicalClone(e.data), vitals: entityVitalsOf(e) })));
      collectEntityVitals({ entityList: [f.worker] }, shadow);
      const actor = model.entities.get(f.worker.id), job = structuredClone(f.entry.job), emitted = [];
      const profile = resolveNpcJobSignature('miner', 'work', false);
      const slot = { elapsed: 1, deploy: 1, frame: writeNpcJobSignatureFrame(profile, 1, 0, 0, 0, 1, reduced, createNpcJobSignatureFrameScratch()) };
      const host = Object.assign({ state: { ...f.s, entities: model.entities }, _ent: id => model.entities.get(id),
        _spawnStationSideEventStreak(...args) { emitted.push(['streak', args]); return 1; },
        _spawnSprite(...args) { emitted.push(['sprite', args]); return 1; },
        _spawnJobLamp(...args) { emitted.push(['lamp', args]); return 1; } },
      createNpcJobSignatureMethods({ SPR_FLASH: 1, SPR_PUFF: 2, SPR_RING: 3 }));
      const picture = () => {
        emitted.length = 0;
        const signature = host._emitNpcJobSignature(slot, profile, actor, job, reduced);
        const contact = host._emitNpcJobContact(slot, profile, actor, job, reduced);
        return { signature, contact, kinds: emitted.map(e => e[0]) };
      };
      assert.ok(picture().contact > 0);
      f.p.pos.z = 0; f.tick(); assert.ok(heliosCuttingCourtesyRead(f.s, f.worker));
      applyEntityVitals(model, JSON.parse(JSON.stringify(collectEntityVitals({ entityList: [f.worker] }, shadow))));
      assert.equal(actor.data.minerShiftActive, false);
      const before = JSON.stringify(actor);
      assert.deepEqual(picture(), { signature: 1, contact: 0, kinds: ['sprite'] });
      assert.ok(emitted[0][1].includes('#ff6a5c'), 'the remaining sprite is the existing flank lamp');
      assert.equal(JSON.stringify(actor), before, 'presentation remains read-only');
      actor.data.activityActorSlotId = 'pallas_seam_miner';
      assert.ok(picture().contact > 0, 'other workers keep their existing picture');
      actor.data.activityActorSlotId = f.worker.data.activityActorSlotId;
      f.p.pos.z = 100; f.tick(32);
      applyEntityVitals(model, JSON.parse(JSON.stringify(collectEntityVitals({ entityList: [f.worker] }, shadow))));
      assert.equal(actor.data.minerShiftActive, true); assert.ok(picture().contact > 0);
    } finally { f.close(); }
  }
});

test('Helios cutting-only vitals fold independently, reject stale lives/jobs and explicitly clear unknown state', async () => {
  const { createReadModel, applySpawnInfos, applyEntityVitals } = await import('../scripts/lib/simReadModel.mjs');
  const { collectEntityVitals, entityVitalsOf } = await import('../scripts/lib/simWorkerHost.mjs');
  const f = fixture(); try {
    f.tick(); const model = createReadModel(), e = f.worker;
    applySpawnInfos(model, [{ v: 2, entityId: e.id, type: e.type, alive: true,
      occupantGeneration: e.occupantGeneration, data: { ...e.data }, vitals: entityVitalsOf(e) }]);
    const row = model.entities.get(e.id), fields = { heliosCuttingActive: true,
      heliosCuttingLife: e.occupantGeneration, heliosCuttingJobId: e.data.jobId,
      heliosCuttingRecordId:e.data.worldRecordId, heliosCuttingSlotId:e.data.activityActorSlotId };
    assert.equal(row.data.minerShiftActive, false);
    applyEntityVitals(model, [[e.id, fields]]); assert.equal(row.data.minerShiftActive, true);
    for (const changed of [{ heliosCuttingLife: e.occupantGeneration + 1 }, { heliosCuttingJobId: 'foreign' },
      { heliosCuttingActive: 'false' }]) {
      applyEntityVitals(model, [[e.id, { ...fields, heliosCuttingActive: false, ...changed }]]);
      assert.equal(row.data.minerShiftActive, true);
    }
    applyEntityVitals(model, [[e.id, { ...fields, heliosCuttingActive: false }]]);
    assert.equal(row.data.minerShiftActive, false);
    applyEntityVitals(model, [[e.id, { ...fields, heliosCuttingActive: null }]]);
    assert.equal(row.data.minerShiftActive, undefined);
    for (const key of Object.keys(fields)) assert.equal(Object.hasOwn(row, key), false);
    const shadow = new Map(); collectEntityVitals({ entityList: [e] }, shadow);
    assert.equal(collectEntityVitals({ entityList: [e] }, shadow).length, 0);
    delete e.data.minerShiftActive;
    assert.equal(collectEntityVitals({ entityList: [e] }, shadow)[0][1].heliosCuttingActive, null);
    e.data.activityActorSlotId = 'other';
    assert.equal(entityVitalsOf(e).heliosCuttingActive, undefined);
  } finally { f.close(); }
});

test('the real job save owner retains spent cutting time and drops transient clearance on restore', () => {
  const f = fixture(); try {
    f.p.pos.z = 100; f.tick(60); f.p.pos.z = 0; f.tick(120);
    assert.ok(heliosCuttingCourtesyRead(f.s, f.worker));
    const saved = JSON.parse(JSON.stringify(f.jobs.serialize())), id = f.entry.job.id;
    assert.equal(saved.byId[id].job.progress, f.entry.job.progress);
    assert.doesNotMatch(JSON.stringify(saved), /"(?:clearS|voiceId|workerLife|cuttingCourtesy)":/);
    const ore = f.rock.data.oreHP, credits = f.s.player.credits;
    f.jobs.deserialize(saved);
    assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null);
    const restored = f.s.npcJobs.byId[id];
    assert.equal(restored.job.progress, saved.byId[id].job.progress);
    assert.equal(restored.entityId, null); assert.equal(restored.job.materialized, false);
    assert.equal(f.rock.data.oreHP, ore); assert.equal(f.s.player.credits, credits);
  } finally { f.close(); }
});

test('native Hitch flies across the actual cutting segment, pauses the original beam, then clears the same face', { timeout: 120000 }, async () => {
  const { bootRealPath, writeRealPathInput } = await import('../scripts/lib/bench/realPath.mjs');
  const h = await bootRealPath({ seed: 73319,
    systems: [npcJobsRuntime, mining, 'aiPorts', 'flightV3', 'physics'],
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: { x: 100, z: -65 }, rot: Math.PI / 2 }] });
  try {
    const s = h.state, jobs = h.runtime.getSystem('npcJobsRuntime');
    const { worker, rock, entry } = prepare(s, jobs, spec => h.runtime.spawn(spec), h.player);
    await h.runtime.getSystem('physics').prepareBackend(s);
    const impacts = [], awards = [], start = { ...h.player.pos }, credits = s.player.credits;
    h.bus.on('physics:impact', e => { if ([e.aId, e.bId].includes(h.player.id)) impacts.push(e); });
    h.bus.on('economy:grantCredits', e => awards.push(e));
    let heldFrames = 0, resumed = false, firstHeldOre, heldBeamS;
    const sample = () => {
      const before = rock.data.oreHP, progress = entry.job.progress;
      h.step(1);
      if (heliosCuttingCourtesyRead(s, worker)) {
        heldFrames++; firstHeldOre ??= before; heldBeamS ??= worker.data.minerShiftBeamS;
        assert.equal(worker.data.minerShiftActive, false);
        assert.equal(rock.data.oreHP, before); assert.equal(entry.job.progress, progress);
      } else if (heldFrames && worker.data.minerShiftActive) resumed = true;
    };
    const fly = target => {
      for (let i = 0; i < 1800; i++) {
        const p = h.player, dx = 100 - p.pos.x, dz = target - p.pos.z;
        const scale = Math.min(.6, 24 / Math.max(1, Math.hypot(dx, dz)));
        const ax = (dx * scale - p.vel.x) * .12, az = (dz * scale - p.vel.z) * .12;
        const co = Math.cos(p.rot), sn = Math.sin(p.rot);
        writeRealPathInput(s, { moveZ: ax * co + az * sn, moveX: -ax * sn + az * co });
        sample();
        if (Math.hypot(dx, dz) < 3 && Math.hypot(p.vel.x, p.vel.z) < 2) return;
      }
      assert.fail(`pilot did not reach ${target}: ${JSON.stringify(h.player.pos)}`);
    };
    fly(0); assert.ok(heliosCuttingCourtesyRead(s, worker));
    writeRealPathInput(s, { brake: true }); for (let i = 0; i < 120; i++) sample();
    assert.equal(rock.data.oreHP, firstHeldOre);
    fly(120); writeRealPathInput(s, { brake: true }); for (let i = 0; i < 480; i++) sample();
    assert.ok(heldFrames >= 120); assert.equal(resumed, true);
    assert.equal(worker.data.minerShiftRockId, rock.id);
    assert.ok(worker.data.minerShiftBeamS > heldBeamS);
    assert.ok(worker.data.minerShiftBeamS <= 6.05);
    assert.equal(impacts.length, 0); assert.equal(awards.length, 0); assert.equal(s.player.credits, credits);
    assert.ok(Math.hypot(h.player.pos.x - start.x, h.player.pos.z - start.z) > 170);
    console.log('CUTTING_COURTESY_NATIVE', JSON.stringify({ heldFrames, beamS: worker.data.minerShiftBeamS,
      oreBefore: 600, oreAfter: rock.data.oreHP, travel: Math.hypot(h.player.pos.x - start.x, h.player.pos.z - start.z),
      duration: s.simTime - 300, impacts: impacts.length, grants: awards.length }));
  } finally { h.runtime.getSystem('npcJobsRuntime')._cuttingCourtesyCleanup?.(); h.dispose(); }
});


test('a previously spawned traffic hull receives its late Helios job only through matching life and record', async () => {
  const { createReadModel, applySpawnInfos, applyEntityVitals, canonicalClone } = await import('../scripts/lib/simReadModel.mjs');
  const { collectEntityVitals, entityVitalsOf } = await import('../scripts/lib/simWorkerHost.mjs');
  const e = {id:700, type:'ship', team:2, alive:true, occupantGeneration:1,
    data:{worldRecordId:'late-cutter'}};
  const model=createReadModel(), shadow=new Map();
  applySpawnInfos(model,[{v:2,entityId:e.id,type:e.type,team:2,alive:true,occupantGeneration:1,
    data:canonicalClone(e.data),vitals:entityVitalsOf(e)}]);
  collectEntityVitals({entityList:[e]},shadow);
  Object.assign(e.data,{jobId:'job:late-cutter',activityActorSlotId:'helios_starter_cutter',minerShiftActive:false});
  const update=collectEntityVitals({entityList:[e]},shadow), row=model.entities.get(e.id);
  for(const changed of [{heliosCuttingRecordId:'foreign'}, {heliosCuttingJobId:'foreign'},
    {heliosCuttingLife:2}, {heliosCuttingSlotId:'other'}, {heliosCuttingActive:'false'}]) {
    applyEntityVitals(model,[[e.id,{...update[0][1],...changed}]]);
    assert.equal(row.data.jobId,undefined); assert.equal(row.data.minerShiftActive,undefined);
  }
  applyEntityVitals(model,update);
  assert.equal(row.data.jobId,e.data.jobId);assert.equal(row.data.activityActorSlotId,e.data.activityActorSlotId);
  assert.equal(row.data.minerShiftActive,false);assert.equal(collectEntityVitals({entityList:[e]},shadow).length,0);
  e.data.minerShiftActive=true;applyEntityVitals(model,collectEntityVitals({entityList:[e]},shadow));
  assert.equal(row.data.minerShiftActive,true);
});
