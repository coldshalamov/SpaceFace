import test from 'node:test';
import assert from 'node:assert/strict';
import { captureEntityRecord, spawnSpecFromRecord, RECORD_KIND } from '../src/world/worldRecords.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { PLANET_SITE } from '../src/data/planets.js';

function recordedWorker(role) {
  const canonical = makeShipEntitySpec('ship_mule', {
    team: 2, factionId: 'faction_mts', pos: { x: 14000, z: 6000 }, rot: 0.4,
    ai: { passive: true, archetype: 'passive' },
  });
  const entity = { ...canonical, id: 21, alive: true, vel: { x: 3, z: 8 }, angVel: 0.02,
    hull: 83, shield: 23, armorHp: 5,
    data: { ...canonical.data, worldRecordId: `anvil-restore-${role}`, named: true,
      itinerary: { kind: 'anvil_work', role, phase: role === 'collector' ? 'return' : 'receiving',
        sequence: 2, center: { x: 12000, z: 6000 }, deliveredQty: 4 },
      cargoManifest: { totalQty: 4, lines: [{ commodityId: PLANET_SITE.harvest.commodityShallow, qty: 4 }] } } };
  const record = captureEntityRecord(entity, { sectorId: PLANET_SITE.sectorId, kind: RECORD_KIND.CONVOY, tick: 720 });
  assert.ok(record);
  return { canonical, record };
}

for (const role of ['collector', 'receiver']) test(`restored Anvil ${role} keeps canonical Mule drive and physical dimensions`, () => {
  const { canonical, record } = recordedWorker(role);
  const spec = spawnSpecFromRecord(JSON.parse(JSON.stringify(record)));
  assert.equal(spec.mass, canonical.mass);
  assert.equal(spec.radius, canonical.radius);
  assert.equal(spec.flightClass, canonical.flightClass);
  assert.deepEqual(spec.flightModel, canonical.flightModel);
  assert.deepEqual(spec.propulsion, canonical.propulsion);
  assert.deepEqual(spec.data.derived, canonical.data.derived);
  assert.deepEqual(spec.data.weapons, []);
  assert.deepEqual(spec.data.fittings, canonical.data.fittings);
  assert.ok(spec.data.fittings.every(slot => slot === null));
});

for (const role of ['collector', 'receiver']) test(`Anvil ${role} hardware reconstruction preserves damage, motion and finite manifest`, () => {
  const { record } = recordedWorker(role);
  const before = JSON.stringify(record), spec = spawnSpecFromRecord(record);
  assert.equal(JSON.stringify(record), before);
  for (const key of ['pos', 'vel', 'rot', 'angVel', 'hull', 'hullMax', 'shield', 'shieldMax', 'armorHp', 'armorMax'])
    assert.deepEqual(spec[key], record[key], key);
  assert.deepEqual(spec.data.itinerary, record.itinerary);
  assert.deepEqual(spec.data.cargoManifest, record.cargoManifest);
  assert.equal(spec.data.worldRecordId, record.recordId);
});

test('Anvil hardware selection leaves unrelated durable ships on their existing shell path', () => {
  for (const change of [
    r => { r.itinerary.kind = 'ordinary_convoy'; },
    r => { r.itinerary.role = 'other'; },
    r => { r.sectorId = 'sector_ceres_orbit'; },
    r => { r.shipDefId = 'ship_kestrel'; },
    r => { r.kind = RECORD_KIND.NPC; },
  ]) {
    const { record } = recordedWorker('collector'); change(record);
    const spec = spawnSpecFromRecord(record);
    assert.equal(spec.mass, 20);
    assert.equal(spec.radius, 8);
    assert.equal(spec.propulsion, undefined);
  }
});

test('terminal Anvil records stay terminal during hardware reconstruction', () => {
  const { record } = recordedWorker('collector');
  record.alive = false; record.outcome = 'destroyed';
  assert.equal(spawnSpecFromRecord(record), null);
});

// Original SF20-14: worker weather response survives the same residency route.
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fields } from '../src/systems/fields.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { save } from '../src/save/saveSystem.js';
import { world } from '../src/systems/world.js';
import { anvilCollectorWorkStatus, anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { PLANET_FLAGS } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { orchardWorkerWeather, orchardWorkSegmentExposed } from '../src/world/anvilOrchardWorkWeather.js';
import { anvilOrchardGustGeometry, pointInsideAnvilOrchardGust } from '../src/data/environmentalMachinery.js';
const trafficWork={...traffic,update(dt,state){this._stepAnvilWork(dt,state);}};
const worldRecords={...world,update(){}};
function boot(offset=180) {
  PLANET_FLAGS.enabled=true;FIELD_FLAGS.enabled=true;
  const systems=[worldRecords,trafficWork,asteroidSites,fields,planetRuntime,flightV3,physics,environmentalMachinery,save];
  const updateOrder=PRODUCTION_UPDATE_ORDER.map(id=>systems.find(def=>def.name===(id==='flightSlot'?flightV3.name:id))).filter(Boolean);
  const sim=createSimulation({seed:424214,runtimeConfig:{profileId:'production',features:PRODUCTION_FEATURES},systems,updateOrder});
  const state=sim.state;state.mode='flight';state.world.currentSectorId=PLANET_SITE.sectorId;
  state.settings.gameplay.physicsBackend='rapier-dynamic';sim.step();
  const collector=state.entities.get(state.planet.witnessId),frame=state.entities.get(state.planet.orchardFrameId),owner=sim.registry.get('traffic');
  const geometry=anvilOrchardGustGeometry(frame);
  // Explicit disturbance setup before native admission. Measured flight never edits
  // worker poses, velocity, cargo or phase. This is not an ordinary New Game claim.
  collector.pos={x:geometry.center.x+geometry.dir.x*offset,z:geometry.center.z+geometry.dir.z*offset};
  collector.vel={x:0,z:0};collector.rot=frame.rot;collector.data.itinerary.phase='outbound';
  state.tick=state.sites.anvilOrchard.phaseAnchorTick+600;state.simTime=state.tick/60;
  const observer=sim.spawn({type:'ship',isPlayer:true,pos:{x:collector.pos.x+100,z:collector.pos.z+100},collides:false,hull:100,physicsBody:false});state.playerId=observer.id;
  return {sim,state,collector,frame,geometry,owner,observer};
}
const step=t=>t.owner._stepAnvilWork(SIM_DT,t.state);

test('segment clipping catches crossing, hull fringe and rotated cones without global weather',()=>{
  const g={center:{x:100,z:100},dir:{x:1,z:0}};
  assert.equal(orchardWorkSegmentExposed({x:500,z:100},{x:50,z:100},g),true);
  assert.equal(orchardWorkSegmentExposed({x:500,z:500},{x:50,z:500},g),false);
  assert.equal(orchardWorkSegmentExposed({x:465,z:100},{x:465,z:100},g,10),true);
  assert.equal(orchardWorkSegmentExposed({x:465,z:100},{x:465,z:100},g,0),false);
  assert.equal(orchardWorkSegmentExposed({x:100,z:500},{x:100,z:50},{...g,dir:{x:0,z:1}}),true);
});

test('exposed original collector clears the band rather than entering work during forecast',()=>{
  const t=boot();try{
    assert.equal(pointInsideAnvilOrchardGust(t.collector.pos,t.geometry),true);
    const prior=structuredClone(t.collector.data.cargoManifest);
    step(t);assert.equal(t.collector.data.itinerary.phase,'clear_band');
    assert.ok(Math.abs(t.collector.data.intent.aimAngle-t.frame.rot)<1e-8);
    assert.deepEqual(t.collector.data.cargoManifest,prior);
  }finally{t.sim.dispose();}
});

test('safe crossing worker holds through forecast and gust, then resumes same route on calm',()=>{
  const t=boot(600);try{
    t.collector.rot=Math.atan2(t.state.planet.center.z-t.collector.pos.z,t.state.planet.center.x+980-t.collector.pos.x);
    for(const tick of [600,719,720,1019]){
      t.state.tick=t.state.sites.anvilOrchard.phaseAnchorTick+tick;t.state.simTime=t.state.tick/60;
      step(t);assert.equal(t.collector.data.itinerary.phase,'outbound');assert.equal(t.collector.data.intent.brake,true);
      assert.equal(t.collector.data.intent.moveZ,0);
    }
    t.state.tick=t.state.sites.anvilOrchard.phaseAnchorTick+1020;
    t.collector.rot=Math.atan2(t.state.planet.center.z-t.collector.pos.z,t.state.planet.center.x+980-t.collector.pos.x);
    step(t);assert.equal(t.collector.data.intent.brake,false);assert.ok(t.collector.data.intent.moveZ>0);
  }finally{t.sim.dispose();}
});

test('worker weather matches the force owner through stale residency caches, but not absent sources',()=>{
  for(const mode of ['missing','destroyed','stale','away','removed','recycled']){
    const t=boot();try{
      if(mode==='missing')t.state.planet.orchardFrameId=null;
      if(mode==='destroyed')t.state.sites.anvilOrchard.frameStatus='destroyed';
      if(mode==='stale')t.state.planet.orchardFrameGeneration++;
      if(mode==='away')t.state.world.currentSectorId='sector_helios';
      if(mode==='removed')t.state.entities.delete(t.frame.id);
      if(mode==='recycled')t.state.planet.orchardFrameId=t.collector.id;
      const fact=orchardWorkerWeather(t.state,t.collector,t.frame.pos);
      if(['missing','stale','recycled'].includes(mode))assert.equal(fact?.exposed,true,mode);
      else assert.equal(fact,null,mode);
    }finally{t.sim.dispose();}
  }
});

for(const continued of [false,true])test(`native exposed collector retreats, berths and resumes work${continued?' through Continue':''}`,async()=>{
  const t=boot();try{
    const facade=t.sim.registry.get('physics');assert.equal(await facade.prepareBackend(t.state),true);
    const start={...t.collector.pos},phases=new Set();let escapedAt=null,berthedAt=null,resumedAt=null,sawGust=false,restored=false;
    for(let i=0;i<60*240;i++){
      t.observer.pos={x:t.collector.pos.x+100,z:t.collector.pos.z+100};
      if(continued&&!restored&&i===120){
        const recordId=t.collector.data.worldRecordId;
        const saver=t.sim.registry.get('save'),row=structuredClone(t.state.sites.anvilOrchard);
        const envelope=JSON.parse(JSON.stringify(saver.serialize('orchard-retreat-native')));
        assert.equal(saver.loadEnvelope(envelope),true);t.state.mode='flight';
        t.collector=t.state.entityList.find(e=>e.alive!==false&&e.data?.worldRecordId===recordId);
        t.observer=t.state.entities.get(t.state.playerId);assert.ok(t.collector&&t.observer);
        assert.deepEqual(t.state.sites.anvilOrchard,row);
        assert.equal(await facade.prepareBackend(t.state),true);restored=true;
      }
      t.sim.step(SIM_DT);
      sawGust ||= !!t.state.fields?.snapshot?.some(f=>f.id==='environment_tethys_anvil_storm_orchard_gust');
      const phase=t.collector.data.itinerary.phase;phases.add(phase);
      if(escapedAt===null&&!pointInsideAnvilOrchardGust(t.collector.pos,t.geometry))escapedAt=t.state.simTime;
      if(phase==='berthed'&&berthedAt===null)berthedAt=t.state.simTime;
      if(berthedAt!==null&&phase==='collect'){resumedAt=t.state.simTime;break;}
    }
    console.log(JSON.stringify({escapedAt,berthedAt,resumedAt,phases:[...phases],travel:Math.hypot(t.collector.pos.x-start.x,t.collector.pos.z-start.z),hull:t.collector.hull}));
    assert.ok(sawGust,'actual machinery admits its unchanged gust');assert.equal(restored,continued);
    assert.ok(escapedAt!==null);assert.ok(berthedAt!==null);assert.ok(resumedAt>berthedAt);
    assert.ok(t.collector.hull>0);assert.equal(t.collector.data.cargoManifest.totalQty,0);
    assert.equal(t.state.entityList.filter(e=>e.alive!==false&&e.data?.worldRecordId===anvilWorkerRecordId(t.state)).length,1);
  }finally{t.sim.registry.get('physics')._disableSg02DynamicAuthority();t.sim.dispose();}
});

test('real Continue preserves forecast hold and physical retreat without cargo or phase reset',()=>{
  for(const offset of [180,600]){
    const t=boot(offset);try{
      const id=t.collector.data.worldRecordId;step(t);
      const expectedPhase=t.collector.data.itinerary.phase;
      const record=structuredClone(t.state.sites.anvilOrchard);
      const manifest=structuredClone(t.collector.data.cargoManifest);
      const saver=t.sim.registry.get('save');
      const envelope=JSON.parse(JSON.stringify(saver.serialize('orchard-weather')));
      assert.equal(saver.loadEnvelope(envelope,'orchard-weather'),true);
      t.state.mode='flight';t.sim.step();
      const restored=t.state.entityList.find(e=>e.alive!==false&&e.data?.worldRecordId===id);
      assert.ok(restored);assert.equal(restored.data.itinerary.phase,expectedPhase);
      assert.deepEqual(t.state.sites.anvilOrchard,record);
      assert.deepEqual(restored.data.cargoManifest,manifest);
      if(offset===600)assert.equal(restored.data.intent.brake,true);
      else assert.ok(Math.abs(restored.data.intent.aimAngle-t.frame.rot)<1e-7);
    }finally{t.sim.dispose();}
  }
});


import { livingWorkStatusText, createContactHailResponse } from '../src/data/contactHail.js';
test('collector target and existing ROUTE reply explain local hold without changing unrelated traders', () => {
  const t = boot(600);
  try {
    step(t);
    assert.match(livingWorkStatusText(t.collector, { state: t.state }), /WORK · STORMSHIFT HOLD · LOCAL GUST FORECAST/);
    const offer = { kind: 'trader', targetId: t.collector.id };
    const response = createContactHailResponse(t.state, offer, 'route');
    assert.match(JSON.stringify(response), /ROUTE · STORMSHIFT HOLD · LOCAL GUST FORECAST/);
    t.state.tick = t.state.sites.anvilOrchard.phaseAnchorTick + 720;
    assert.equal(anvilCollectorWorkStatus(t.state, t.collector), 'STORMSHIFT HOLD · LOCAL GUST');
    t.state.tick = t.state.sites.anvilOrchard.phaseAnchorTick + 1020;
    assert.equal(anvilCollectorWorkStatus(t.state, t.collector), 'STORMSHIFT · OUTBOUND TO SHALLOW HARVEST');
    t.collector.data.itinerary.phase = 'return';
    assert.equal(anvilCollectorWorkStatus(t.state, t.collector), 'STORMSHIFT · RETURNING TO RECEIVING TENDER');
    for (const mode of ['foreign-job', 'replaced', 'forged']) {
      const original = t.collector.data.worldRecordId;
      if (mode === 'foreign-job') t.collector.data.jobId = 'other-owner';
      if (mode === 'replaced') t.state.entities.set(t.collector.id, { ...t.collector });
      if (mode === 'forged') t.collector.data.worldRecordId = 'not-the-original-worker';
      assert.equal(anvilCollectorWorkStatus(t.state, t.collector), null, mode);
      delete t.collector.data.jobId;
      t.state.entities.set(t.collector.id, t.collector);
      t.collector.data.worldRecordId = original;
    }
    t.collector.data.itinerary.phase = 'clear_band';
    assert.equal(anvilCollectorWorkStatus(t.state, t.collector), 'STORMSHIFT · CLEARING BAND', 'calm clearance is not called a gust escape');
    const duplicate = t.sim.spawn({ type: 'ship', hull: 100, pos: { ...t.collector.pos },
      data: { ...t.collector.data } });
    assert.equal(anvilCollectorWorkStatus(t.state, t.collector), null, 'ambiguous record cannot narrate as the original worker');
    duplicate.alive = false;
    const receiver = t.state.entityList.find(e => e.data?.itinerary?.role === 'receiver');
    assert.equal(anvilCollectorWorkStatus(t.state, receiver), null);
    assert.doesNotMatch(JSON.stringify(createContactHailResponse(t.state,
      { kind: 'trader', targetId: receiver.id }, 'route')), /STORMSHIFT HOLD/);
  } finally { t.sim.dispose(); }
});

test('native safe collector holds outside the forecast corridor and departs on the real calm boundary', async () => {
  const t = boot(600);
  try {
    t.collector.rot = Math.atan2(t.state.planet.center.z - t.collector.pos.z,
      t.state.planet.center.x + 980 - t.collector.pos.x);
    const facade = t.sim.registry.get('physics');
    assert.equal(await facade.prepareBackend(t.state), true);
    const snapshots = [];
    const capture = label => snapshots.push({ label, tick: t.state.tick, simTime: t.state.simTime,
      center: { ...t.state.planet.center }, status: anvilCollectorWorkStatus(t.state, t.collector),
      entities: [t.frame, t.collector, ...t.state.entityList.filter(e => e.data?.itinerary?.role === 'receiver')]
        .map(e => ({ id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, rot: e.rot,
          radius: e.radius, hull: e.hull, data: structuredClone(e.data) })) });
    capture('forecast-hold');
    const start = { ...t.collector.pos };
    for (let i = 0; i < 419; i++) {
      t.sim.step(SIM_DT);
      assert.equal(t.collector.data.itinerary.phase, 'outbound');
      assert.equal(t.collector.data.intent.brake, true);
      assert.equal(pointInsideAnvilOrchardGust(t.collector.pos, t.geometry), false);
    }
    capture('last-gust-hold');
    t.sim.step(SIM_DT);
    t.sim.step(SIM_DT); // traffic consumes the current calm tick after the normal boundary
    assert.equal(t.collector.data.intent.brake, false);
    assert.ok(t.collector.data.intent.moveZ > 0);
    capture('calm-departure');
    assert.equal(t.collector.data.cargoManifest.totalQty, 0);
    console.log(JSON.stringify({ nativeHoldTravel: Math.hypot(t.collector.pos.x - start.x,
      t.collector.pos.z - start.z), departureAt: t.state.simTime }));
    if (process.env.ORCHARD_WEATHER_SNAPSHOTS) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.ORCHARD_WEATHER_SNAPSHOTS, JSON.stringify(snapshots, null, 2));
    }
  } finally { t.sim.registry.get('physics')._disableSg02DynamicAuthority(); t.sim.dispose(); }
});
