import assert from 'node:assert/strict';
import test from 'node:test';import {readFileSync} from 'node:fs';
import {createSimulation} from '../src/core/sim.js';
import {combat} from '../src/systems/combat.js';import {spawnBudget} from '../src/systems/spawnBudget.js';import {encounterDirector} from '../src/systems/encounterDirector.js';import {aiPorts} from '../src/systems/aiPorts.js';import {physics} from '../src/core/physics.js';
import {runtime} from '../src/data/encounters/358-the-press-camp.js';
import {createPresentationJournal} from '../src/core/presentationJournal.js';
import {createSimHost} from '../scripts/lib/simWorkerHost.mjs';import {createReadModel,applySpawnInfos} from '../scripts/lib/simReadModel.mjs';
import {createVisualFactory} from '../src/render/visualFactory.js';import {installVisualOverrides} from '../src/render/visualOverrides.js';import {resolvePlaceFileForEntity} from '../src/render/partsLibrary.js';import {modelTruthPlaceDrawScale} from '../src/data/modelTruth.js';
function setup(stripBinding = false) {
  const sim = createSimulation({
    seed: 47,
    systems: [spawnBudget, encounterDirector, combat, aiPorts, physics]
  });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = 'sector_ceres_belt';
  s.playerId = sim.spawn({
    type: 'ship',
    team: 0,
    pos: {
      x: 9800,
      z: 9800
    },
    hull: 200,
    radius: 6
  }).id;
  const d = sim.registry.get('encounterDirector');
  let eventBase, journalBase;
  const journal = sim.registry.get('core').presentationJournal = createPresentationJournal();
  const recordSpawn = journal.recordSpawn;
  journal.recordSpawn = function(tick, e) { if(e.data?.baseKind==='pirate_base') journalBase=structuredClone(e); return recordSpawn.call(this,tick,e); };
  sim.bus.on('entity:spawned', ({entity:e})=>{if(e.data?.baseKind==='pirate_base') eventBase=structuredClone(e);});
  const spawn = d.helpers.spawnEntity;
  if(stripBinding) d.helpers.spawnEntity = spec => { if(spec.data?.baseKind==='pirate_base'){spec={...spec,data:{...spec.data}};delete spec.data.archetypeGlb;} return spawn(spec); };
  assert.equal(d.requestAuthoredEncounter({
    shapeId: 'press_camp_raid',
    encounterId: 'camp_test',
    sectorId: 'sector_ceres_belt',
    anchor: {
      x: 9200,
      z: 9200
    },
    zoneType: 'ambush_lane',
    zoneRadius: 500,
    force: true
  }).ok, true);
  const live = s.encounterDirector.live.camp_test;
  const base = s.entities.get(live.data.baseId),
    captive = s.entities.get(live.data.captiveId),
    guards = d.entsOf(live, 'raider');
  const grants = [],
    reps = [],
    outcomes = [];
  const originalGrant = d.grant.bind(d),
    originalRep = d.rep.bind(d);
  d.grant = (...args) => {
    grants.push(args);
    return originalGrant(...args);
  };
  d.rep = (...args) => {
    reps.push(args);
    return originalRep(...args);
  };
  sim.bus.on('encounter:resolved', p => outcomes.push(p.outcome));
  const tick = () => runtime.tick(d, live, s, s.simTime);
  return {
    eventBase, journalBase,
    sim,
    s,
    d,
    live,
    base,
    captive,
    guards,
    grants,
    reps,
    outcomes,
    tick
  };
}

test('camp authored Tradehub identity exists at first spawn and worker projection without changing its physical body',async(t)=>{
 const h=setup(),prior=setup(true);const oldStorage=globalThis.localStorage;const worker=createSimHost();
 t.after(()=>{worker.shutdown();for(const x of [h,prior]){x.sim.registry.get('physics')._sg02?.dispose();x.sim.dispose();}if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;});
 const physical=e=>({type:e.type,team:e.team,pos:e.pos,vel:e.vel,rot:e.rot,radius:e.radius,mass:e.mass,hull:e.hull,hullMax:e.hullMax,physicsBody:e.physicsBody,collisionProxy:e.data.collisionProxy,dockless:e.data.dockless,services:e.data.services,factionId:e.data.factionId,bountyCr:e.data.bountyCr});
 assert.deepEqual(physical(h.base),physical(prior.base));
 for(const x of [h,prior])await x.sim.registry.get('physics').prepareBackend(x.s);
 assert.deepEqual(physical(h.base),physical(prior.base));
 const native=x=>{const rec=x.sim.registry.get('physics')._sg02.records.get(x.base.id);assert.ok(rec?.body);return {colliderCount:rec.colliders.length,bodyType:rec.body.bodyType(),translation:rec.body.translation(),rotation:rec.body.rotation()};};
 assert.deepEqual(native(h),native(prior));assert.equal(native(h).colliderCount,22);
 const scenarioContract=JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url),'utf8'));
 await worker.init({profile:'production',seed:47,scenarioContract});
 const wb=worker.host.runtime.spawn({type:h.base.type,team:h.base.team,pos:{...h.base.pos},radius:h.base.radius,mass:h.base.mass,hull:h.base.hull,physicsBody:structuredClone(h.base.physicsBody),data:structuredClone(h.eventBase.data)});
 const reply=structuredClone(await worker.tick({steps:0,dt:1/60,seq:1}));const info=reply.spawnInfos.find(x=>x.entityId===wb.id);assert.ok(info);
 const model=createReadModel();applySpawnInfos(model,[info]);const mirrored=model.entities.get(wb.id);
 const vf=installVisualOverrides(createVisualFactory(),{releaseMode:true});let metadata;
 for(const e of [h.journalBase,h.eventBase,h.base,mirrored]){assert.equal(e.data.archetypeGlb,'place_station_trade_hub');assert.equal(resolvePlaceFileForEntity(e),'places/place_station_trade_hub.glb');assert.equal(e.data.dockless,true);assert.deepEqual(e.data.services,[]);const v=vf.build(e);assert.equal(v.userData.authoredAssetState,'awaiting-authored-admission');assert.equal(v.userData.placeId,'place_station_trade_hub');metadata=Object.fromEntries(['placeId','archetypeGlb','authoredAssetState','authoredVisualRoot','visualBounds','visualCenterOffset','boundaryResolvingStandInFile','boundaryResolvingStandInRecenter','boundaryResolvingStandInYawDeg'].map(k=>[k,v.userData[k]??null]));}
 assert.equal(resolvePlaceFileForEntity(prior.base),null);const before=vf.build(prior.base);assert.notEqual(before.userData.authoredAssetState,'awaiting-authored-admission');
 console.log('CAMP_VISUAL_PARITY',JSON.stringify({firstSpawn:true,workerProjection:true,native:native(h),radius:h.base.radius,collisionProxy:h.base.data.collisionProxy,drawScale:modelTruthPlaceDrawScale(mirrored),metadata}));
});
