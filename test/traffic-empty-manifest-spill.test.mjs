import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { ANVIL_WORK, anvilWorkerRecordId, anvilBuyerApproach } from '../src/systems/anvilWork.js';
import { PLANET_SITE } from '../src/data/planets.js';

const commodityId = PLANET_SITE.harvest.commodityShallow;
const stationId = ANVIL_WORK.buyerId;
function boot(extraSystems = []) {
  const sim = createSimulation({ seed: 47, systems: [{ ...world, update() {} }, { ...traffic, update() {} }, economy, ...extraSystems] });
  const state = sim.state; state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  const owner = sim.registry.get('traffic'), econ = sim.registry.get('economy');
  owner.ensureAnvilWorker(state, sim.spawn, { x: 14000, z: 6000 });
  const receiver = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
  const collector = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'collector'));
  const station = sim.spawn({ type: 'station', hull: 1000, radius: 120, pos: { x: 13000, z: 9500 }, data: { stationId, collisionProxy: 'skin:place_station_trade_hub', dockRadius: 90 } });
  econ.ensureMarket(stationId);
  return { sim, state, owner, econ, receiver, collector, station };
}
function load(t, qty = 7) {
  t.owner._setTrafficManifest(t.receiver, t.state.traffic.freighters.find(r => r.id === t.receiver.id),
    t.owner._buildMinerManifest(t.receiver, 0, commodityId, qty));
  t.receiver.data.itinerary.phase = 'delivery';
  t.receiver.pos = anvilBuyerApproach(t.receiver, t.station); t.receiver.vel = { x: 0, z: 0 };
}


const cases=['fresh-empty','delivered-empty','malformed','zero-amount','entity-empty-record-loaded','entity-malformed-record-loaded','record-empty','record-malformed','absent-finite'];
for(const mode of cases)test(`finite ${mode} refuses legacy cargo synthesis`,()=>{
 const t=boot();try{
 const rec=t.state.traffic.freighters.find(r=>r.id===t.receiver.id);
 if(mode==='delivered-empty'){load(t,1);assert.equal(t.owner._deliverAnvilReceiver(t.receiver,t.station),true);}
 if(mode==='malformed'||mode==='entity-malformed-record-loaded')t.receiver.data.cargoManifest={lines:[{commodityId,qty:2}],totalQty:1};
 if(mode==='zero-amount')t.receiver.data.cargoManifest={lines:[{commodityId,qty:0}],totalQty:0};
 if(mode.endsWith('record-loaded'))rec.manifest={manifestId:'loaded',lines:[{commodityId,qty:8}],totalQty:8};
 if(mode.startsWith('record-')){delete t.receiver.data.cargoManifest;rec.manifest=mode==='record-empty'?{lines:[],totalQty:0}:{lines:[{commodityId,qty:-1}],totalQty:-1};}
 if(mode==='absent-finite'){delete t.receiver.data.cargoManifest;delete rec.manifest;}
 // Conflicting legacy cargo must never overrule the authoritative finite record.
 t.receiver.data.cargo={[commodityId]:20};rec.carrying=true;t.receiver.data.carrying=true;
 const before=structuredClone({data:t.receiver.data.cargoManifest,rec:rec.manifest});
 let events=0;t.sim.bus.on('freight:cargoSpilled',()=>events++);
 assert.equal(t.owner._spillHaulerCargoFromViolence(t.receiver,null,'panic_jettison'),null);
 assert.deepEqual({data:t.receiver.data.cargoManifest,rec:rec.manifest},before);assert.equal(events,0);
 }finally{t.sim.dispose();}
});
for(const mode of ['explicit-cargo','carrying-fallback'])test(`ordinary manifestless legacy ${mode} remains supported`,()=>{
 const t=boot();try{
 const h=t.sim.spawn({type:'ship',hull:100,radius:8,pos:{x:14000,z:6000},vel:{x:0,z:0},data:{trafficRole:'hauler',carrying:true,name:'Legacy hauler',...(mode==='explicit-cargo'?{cargo:{[commodityId]:8}}:{})}});
 const pod=t.owner._spillHaulerCargoFromViolence(h,null,'panic_jettison');
 assert.equal(pod.data.amount,mode==='explicit-cargo'?2:4);assert.equal(h.data.cargoManifest.totalQty,mode==='explicit-cargo'?6:12);
 }finally{t.sim.dispose();}
});
