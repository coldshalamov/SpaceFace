import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { mining } from '../src/systems/mining.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';
import { heliosSharedCutRead } from '../src/systems/heliosSharedCut.js';
import { heliosCuttingCourtesyRead } from '../src/systems/heliosCuttingCourtesy.js';

const SECTOR = 'sector_helios_prime', DT = 1 / 60;
function prepare(s, jobs, spawn, p, atS = 300) {
  s.mode = 'flight'; s.ui.screenStack = []; s.world.currentSectorId = SECTOR; s.run.kind = 'adventure';
  s.onboarding = { active: false, finished: true }; s.simTime = atS; s.playerId = p.id;
  s.player.miningBeam = { tierId: 'beam_mk1', dps: 18, range: 240, directToCargo: false };
  const worker = spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 }, radius: 12,
    mass: 30, hull: 100, hullMax: 100, homeSectorId: SECTOR,
    data: { worldRecordId: 'shared-face-cutter', activityActorSlotId: 'helios_seam_miner',
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
  s.player.targetId = rock.id;
  return { worker, rock, entry };
}
function fixture({ voice = false } = {}) {
  const sim = createSimulation({ seed: 73319, systems: [mining, npcJobsRuntime, ...(voice ? [voiceArbiter] : [])] });
  const s = sim.state, p = sim.spawn({ type: 'ship', team: 0, isPlayer: true,
    pos: { x: 200, z: -150 }, radius: 12, mass: 30, hull: 100, hullMax: 100 });
  const jobs = sim.registry.get('npcJobsRuntime'), scene = prepare(s, jobs, x => sim.spawn(x), p);
  return { sim, s, p, jobs, ...scene,
    beam(on = true) { s.input.fireGroup = on ? 2 : 0; s.input.aimAngle = Math.atan2(scene.rock.pos.z-p.pos.z,scene.rock.pos.x-p.pos.x); },
    tick(n = 1) { for (let i = 0; i < n; i++) sim.step(DT); },
    close() { jobs._sharedCutCleanup?.(); jobs._cuttingCourtesyCleanup?.(); sim.dispose(); } };
}

test('successful player extraction gets the shared face, holding the same finite NPC work until a clear gap', () => {
  const f = fixture(); try {
    const ticks = [], awards = [];
    f.sim.bus.on('mining:tick', e => ticks.push(e));
    f.sim.bus.on('economy:grantCredits', e => awards.push(e));
    f.tick(30); assert.equal(f.worker.data.minerShiftActive, true);
    const before = { progress: f.entry.job.progress, beam: f.worker.data.minerShiftBeamS, ore: f.rock.data.oreHP };
    ticks.length = 0; f.beam(); f.tick(120);
    assert.ok(heliosSharedCutRead(f.s, f.worker));
    assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null, 'pilot is safely beside, not crossing the beam');
    assert.equal(f.worker.data.minerShiftActive, false);
    assert.equal(f.worker.data.minerShiftBeamS, before.beam);
    assert.equal(f.entry.job.progress, before.progress);
    assert.ok(f.rock.data.oreHP < before.ore);
    assert.equal(ticks.length, 120); assert.ok(ticks.every(e => e.sourceEntityId === f.p.id));
    f.beam(false); f.tick(30); assert.equal(f.entry.job.progress, before.progress);
    f.beam(); f.tick(); f.beam(false); f.tick(30);
    assert.equal(f.entry.job.progress, before.progress, 'another actual cut restarts the gap');
    f.tick(18); assert.equal(heliosSharedCutRead(f.s, f.worker), null);
    assert.equal(f.worker.data.minerShiftActive, true);
    assert.ok(f.entry.job.progress > before.progress); assert.equal(f.worker.data.minerShiftRockId, f.rock.id);
    f.tick(500); assert.equal(f.worker.data.minerShiftActive, false);
    assert.ok(f.worker.data.minerShiftBeamS < 6.05); assert.equal(awards.length, 0);
  } finally { f.close(); }
});

test('selection, empty aim, denied work and another cutter do not reserve a face', () => {
  for (const mutate of [f => {}, f => { f.beam(); f.s.input.worldObjectTargetId = null; },
    f => { f.beam(); f.rock.data.siteAnchored = true; },
    f => { f.beam(); f.s.player.beamMode = 'repair'; },
    f => { f.sim.registry.get('mining').applyMining(f.rock.id, 18, DT, f.worker.id); },
    f => { f.sim.bus.emit('mining:tick', { sourceEntityId: f.p.id, targetId: f.rock.id }); }]) {
    const f = fixture(); try { mutate(f); f.tick(); assert.equal(heliosSharedCutRead(f.s, f.worker), null, String(mutate)); }
    finally { f.close(); }
  }
});

test('a real cut on a different rock does not stop this worker', () => {
  const f = fixture(); try {
    const other = f.sim.spawn({ type: 'asteroid', pos: { x: 200, z: -270 }, radius: 25, mass: 400,
      hull: 600, hullMax: 600, data: { typeId: 'ast_common_rock', oreHP: 600, oreHPMax: 600, yieldU: 30 } });
    f.s.player.targetId = other.id; f.s.input.fireGroup = 2; f.s.input.aimAngle = -Math.PI / 2;
    f.tick(30); assert.ok(other.data.oreHP < 600); assert.equal(heliosSharedCutRead(f.s, f.worker), null);
    assert.equal(f.worker.data.minerShiftActive, true);
  } finally { f.close(); }
});

test('stale participant, job, sector, save and pause boundaries immediately drop a shared face', () => {
  for (const change of [f => f.worker.occupantGeneration++, f => f.p.occupantGeneration++,
    f => f.rock.occupantGeneration++, f => f.s.entities.delete(f.rock.id),
    f => f.s.npcJobs = structuredClone(f.s.npcJobs), f => f.entry.job = structuredClone(f.entry.job),
    f => f.s.world.enterSerial = 1, f => f.s.world.currentSectorId = 'sector_ceres_belt',
    f => f.s.ui.docked = true, f => f.s.save.restoring = true, f => f.s.run.kind = 'survival',
    f => f.entry.control = {}, f => f.entry.towAssist = {}, f => f.entry.job.phase = 'return',
    f => f.entry.job.materialized = false, f => f.entry.job.corrupt = true, f => f.rock.data.oreHP = 0,
    f => f.rock.homeSectorId = 'sector_ceres_belt', f => f.p.alive = false,
    f => f.sim.bus.emit('game:new'), f => f.sim.bus.emit('game:load'), f => f.sim.bus.emit('save:loaded'),
    f => f.sim.bus.emit('sim:pause'), f => f.sim.bus.emit('sector:exit'), f => f.s.simTime += .75]) {
    const f = fixture(); try { f.beam(); f.tick(); assert.ok(heliosSharedCutRead(f.s, f.worker));
      change(f); assert.equal(heliosSharedCutRead(f.s, f.worker), null, String(change)); }
    finally { f.close(); }
  }
});

test('voice waits behind danger, cancels when the cut ends, and only heard courtesy starts its cooldown', () => {
  const f = fixture({ voice: true }); try {
    const spoken = []; f.sim.bus.on('voice:surface', e => { if (e.id?.startsWith('helios_shared_cut:')) spoken.push(e); });
    f.sim.helpers.voice.say({ id: 'danger', channel: 'alert', text: 'Danger', ttl: 30 });
    f.beam(); f.tick(60); assert.equal(spoken.length, 0);
    f.beam(false); f.tick(48); f.sim.helpers.voice.cancel('danger'); f.tick();
    assert.equal(spoken.length, 0);
    f.beam(); f.tick(); assert.equal(spoken.length, 1);
    assert.match(spoken[0].text, /You have that face.*beam is down.*iron you cut/);
    f.beam(false); f.tick(48); f.beam(); f.tick(60); assert.equal(spoken.length, 1);
  } finally { f.close(); }
});

test('the physical crossing remains authoritative while the player shares the face', () => {
  const f = fixture(); try {
    f.p.pos = { x: 100, z: 0 }; f.beam(); f.tick(30);
    assert.ok(heliosSharedCutRead(f.s, f.worker)); assert.ok(heliosCuttingCourtesyRead(f.s, f.worker));
    f.beam(false); f.tick(60);
    assert.equal(heliosSharedCutRead(f.s, f.worker), null); assert.ok(heliosCuttingCourtesyRead(f.s, f.worker));
    assert.equal(f.worker.data.minerShiftActive, false); assert.equal(f.entry.job.progress, 0);
    f.p.pos.z = -150; f.tick(32); assert.equal(f.worker.data.minerShiftActive, true);
  } finally { f.close(); }
});

test('job serialization preserves spent work and never persists a temporary ore claim', () => {
  const f = fixture(); try {
    f.tick(30); f.beam(); f.tick(60); const progress = f.entry.job.progress;
    const saved = JSON.parse(JSON.stringify(f.jobs.serialize()));
    assert.equal(saved.byId[f.entry.job.id].job.progress, progress);
    assert.doesNotMatch(JSON.stringify(saved), /lastCutAt|sharedCut|helios_shared_cut/);
    f.jobs.deserialize(saved); assert.equal(heliosSharedCutRead(f.s, f.worker), null);
    assert.equal(f.s.npcJobs.byId[f.entry.job.id].job.progress, progress);
  } finally { f.close(); }
});

test('native Hitch cuts while moving beside the same face, then releases the tool and the original worker resumes', { timeout: 120000 }, async () => {
  const { bootRealPath, writeRealPathInput } = await import('../scripts/lib/bench/realPath.mjs');
  const h = await bootRealPath({ seed: 73319,
    systems: [mining, npcJobsRuntime, 'aiPorts', 'flightV3', 'physics'],
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: { x: 200, z: -170 }, rot: Math.PI / 2 }] });
  try {
    const s = h.state, jobs = h.runtime.getSystem('npcJobsRuntime');
    const { worker, rock, entry } = prepare(s, jobs, spec => h.runtime.spawn(spec), h.player);
    await h.runtime.getSystem('physics').prepareBackend(s);
    const impacts = [], awards = [], cuts = [], start = { ...h.player.pos }, progress = entry.job.progress;
    h.bus.on('physics:impact', e => { if ([e.aId, e.bId].includes(h.player.id)) impacts.push(e); });
    h.bus.on('economy:grantCredits', e => awards.push(e)); h.bus.on('mining:tick', e => cuts.push(e));
    let heldFrames = 0;
    for (let i = 0; i < 360; i++) {
      const p = h.player, dx = 200-p.pos.x, dz = -110-p.pos.z;
      const scale = Math.min(.6,18/Math.max(1,Math.hypot(dx,dz)));
      const ax = (dx*scale-p.vel.x)*.12, az = (dz*scale-p.vel.z)*.12;
      const co = Math.cos(p.rot), sn = Math.sin(p.rot);
      writeRealPathInput(s, { moveZ:ax*co+az*sn, moveX:-ax*sn+az*co });
      s.input.fireGroup=2; s.input.aimAngle=Math.atan2(rock.pos.z-p.pos.z,rock.pos.x-p.pos.x);
      h.step(1);
      if (heliosSharedCutRead(s,worker)) heldFrames++;
      assert.equal(worker.data.minerShiftActive,false); assert.equal(entry.job.progress,progress);
      assert.equal(heliosCuttingCourtesyRead(s,worker),null);
    }
    assert.equal(heldFrames,360); assert.equal(cuts.length,360);
    assert.ok(cuts.every(e=>e.sourceEntityId===h.player.id)); assert.ok(rock.data.oreHP<600);
    const cutOre=rock.data.oreHP;
    writeRealPathInput(s,{brake:true}); s.input.fireGroup=0; h.step(40);
    assert.equal(entry.job.progress,progress); assert.equal(rock.data.oreHP,cutOre);
    h.step(20); assert.equal(heliosSharedCutRead(s,worker),null);
    assert.ok(entry.job.progress>progress); assert.equal(worker.data.minerShiftActive,true);
    assert.ok(cuts.slice(360).length>0&&cuts.slice(360).every(e=>e.sourceEntityId===worker.id), 'resumed ore stays attributed to the same worker');
    assert.equal(worker.data.minerShiftRockId,rock.id); assert.ok(rock.data.oreHP<cutOre);
    assert.equal(impacts.length,0); assert.equal(awards.length,0);
    const travel=Math.hypot(h.player.pos.x-start.x,h.player.pos.z-start.z);assert.ok(travel>30);
    console.log('SHARED_CUT_NATIVE',JSON.stringify({heldFrames,travel,playerCutCount:360,
      oreAfterPlayer:cutOre,oreAfterResume:rock.data.oreHP,npcBeamS:worker.data.minerShiftBeamS,
      impacts:impacts.length,grants:awards.length}));
  } finally { h.runtime.getSystem('npcJobsRuntime')._sharedCutCleanup?.();
    h.runtime.getSystem('npcJobsRuntime')._cuttingCourtesyCleanup?.();h.dispose(); }
});

test('native first ticket pays once from the pilot’s shared-face cut, without minting extra ore or extending the NPC shift', { timeout: 120000 }, async () => {
  const { bootRealPath, writeRealPathInput } = await import('../scripts/lib/bench/realPath.mjs');
  const { missions } = await import('../src/systems/missions.js');
  const { economy } = await import('../src/systems/economy.js');
  const h = await bootRealPath({ seed:73319,systems:[mining,npcJobsRuntime,missions,economy,'aiPorts','flightV3','physics'],
    hulls:[{hullId:'ship_kestrel',isPlayer:true,pos:{x:200,z:-150},rot:Math.PI/2}] });
  try {
    const s=h.state,jobs=h.runtime.getSystem('npcJobsRuntime');
    const {worker,rock,entry}=prepare(s,jobs,spec=>h.runtime.spawn(spec),h.player,0);
    s.player.ownedShips=[{defId:'ship_kestrel',fittings:['mod_drill_amp','mod_mining_laser_s']}];s.player.activeShipIndex=0;
    const owner=h.runtime.getSystem('missions'),offer=owner.ensureBoard('station_helios').slots.find(m=>m.params?.starterJobId==='starter_hitch');
    assert.ok(offer); assert.equal(owner.acceptMission(offer.id),true);
    const mission=s.missions.active.find(m=>m.params?.starterJobId==='starter_hitch');
    const awards=[],yields=[],cuts=[];h.bus.on('economy:grantCredits',e=>awards.push(e));
    h.bus.on('mining:yield',e=>yields.push(e));h.bus.on('mining:tick',e=>cuts.push(e));
    await h.runtime.getSystem('physics').prepareBackend(s);
    let frames=0;
    for(;frames<3000&&rock.alive&&rock.data.oreHP>0;frames++){
      writeRealPathInput(s,{brake:true});s.input.fireGroup=2;
      s.input.aimAngle=Math.atan2(rock.pos.z-h.player.pos.z,rock.pos.x-h.player.pos.x);h.step(1);
      assert.equal(worker.data.minerShiftActive,false);if(rock.data.oreHP>0)assert.equal(entry.job.progress,0);
    }
    assert.ok(frames<3000);s.input.fireGroup=0;h.step(60);
    assert.equal(mission.status,'completed');assert.equal(s.missions.starterJobStep.starter_hitch,1);
    assert.equal(awards.filter(e=>e.amount===420).length,1,JSON.stringify(awards));
    assert.equal(awards.length,1);assert.ok(cuts.every(e=>e.sourceEntityId===h.player.id));
    const quantity=yields.reduce((n,e)=>n+e.qty,0);assert.ok(quantity>0&&quantity<=30,JSON.stringify(yields));
    assert.equal(heliosSharedCutRead(s,worker),null);assert.equal(worker.data.minerShiftActive,false);
    assert.equal(worker.data.minerShiftBeamS,undefined,'no NPC extraction was spent or replayed');
    console.log('SHARED_CUT_TICKET_NATIVE',JSON.stringify({frames,quantity,starterStep:s.missions.starterJobStep.starter_hitch,
      awards:awards.map(e=>({amount:e.amount,reason:e.reason})),npcProgress:entry.job.progress}));
  }finally{h.runtime.getSystem('npcJobsRuntime')._sharedCutCleanup?.();
    h.runtime.getSystem('npcJobsRuntime')._cuttingCourtesyCleanup?.();h.dispose();}
});

test('player cut holds only the commissioned worker and resumes same finite job', () => {
  const f = fixture(); try {
    const other = f.sim.spawn({type:'ship',team:2,pos:{x:-100,z:100},radius:12,mass:30,hull:100,hullMax:100,homeSectorId:SECTOR,data:{worldRecordId:'independent-miner',activityActorSlotId:'other_miner',ai:{passive:true},trafficRole:'miner'}});
    const id=f.jobs.assign(other,{kind:'miner',sectorId:SECTOR,route:[{id:'home:station_helios',pos:{x:0,z:-300}},{id:`field:${f.rock.id}`,pos:{...f.rock.pos}}]});
    const entry=f.s.npcJobs.byId[id]; Object.assign(entry.job,{phase:'work',routeIndex:1,progress:0});
    f.tick(30); const before=f.entry.job.progress, otherBefore=entry.job.progress;
    f.beam(); f.tick(120);
    assert.equal(f.entry.job.progress,before);
    assert.ok(entry.job.progress>otherBefore);
    assert.equal(heliosSharedCutRead(f.s,other),null);
    f.beam(false); f.tick(48);
    assert.ok(f.entry.job.progress>before);
  } finally {f.close();}
});
test('shared-cut receipt reaches actual worker bridge and both renderer paths, including reduced motion', async () => {
  const { createNpcJobSignatureMethods } = await import('../src/render/vfx/npcJobSignatureMethods.js');
  const { resolveNpcJobSignature, createNpcJobSignatureFrameScratch, writeNpcJobSignatureFrame } = await import('../src/render/npcJobSignatureVfx.js');
  const { createReadModel, applySpawnInfos, applyEntityVitals, canonicalClone } = await import('../scripts/lib/simReadModel.mjs');
  const { collectEntityVitals, entityVitalsOf } = await import('../scripts/lib/simWorkerHost.mjs');
  for (const reduced of [false, true]) {
    const f = fixture(); try {
      // Use a near working face so both actual renderer paths have visible contact.
      f.rock.pos.x = 100; f.p.pos.x = 100; f.p.pos.z = -150; f.tick();
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
      f.beam(); f.tick(); assert.ok(heliosSharedCutRead(f.s, f.worker)); assert.equal(heliosCuttingCourtesyRead(f.s,f.worker), null);
      applyEntityVitals(model, JSON.parse(JSON.stringify(collectEntityVitals({ entityList: [f.worker] }, shadow))));
      assert.equal(actor.data.minerShiftActive, false);
      const before = JSON.stringify(actor);
      assert.deepEqual(picture(), { signature: 1, contact: 0, kinds: ['sprite'] });
      assert.ok(emitted[0][1].includes('#ff6a5c'), 'the remaining sprite is the existing flank lamp');
      assert.equal(JSON.stringify(actor), before, 'presentation remains read-only');
      actor.data.activityActorSlotId = 'pallas_seam_miner';
      assert.ok(picture().contact > 0, 'other workers keep their existing picture');
      actor.data.activityActorSlotId = f.worker.data.activityActorSlotId;
      f.beam(false); f.tick(48);
      applyEntityVitals(model, JSON.parse(JSON.stringify(collectEntityVitals({ entityList: [f.worker] }, shadow))));
      assert.equal(actor.data.minerShiftActive, true); assert.ok(picture().contact > 0);
    } finally { f.close(); }
  }
});
