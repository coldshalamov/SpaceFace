import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceIntent as request,advanceResourcePool,restoreResourceWork,serializeResourceWork} from '../../src/economy/economyResources.js';
import {ECONOMY_BALANCE as B} from '../../src/data/economyDerived.js';
const sectorId='sector_test',commodityId='cmdty_ore_iron';
const fresh=()=>({simTime:0,economy:{},player:{credits:100,cargo:{items:{}}}});
const reserve=(s,seq,qty=24,cid=commodityId)=>request(s,'reserve',{sectorId,commodityId:cid,seq,qty},{maxTier:4});
const settle=(s,l,qty=l.qty)=>request(s,'settle',{sectorId,leaseId:l.id,producedQty:qty});
test('reserve/settle touches no wallet, cargo, entity or mission owner',()=>{
 const s=fresh(),before=JSON.stringify(s.player),l=reserve(s,1);assert.equal(l.ok,true);assert.equal(l.maxTravelWu,2700);
 assert.equal(settle(s,l).ok,true);assert.equal(JSON.stringify(s.player),before);assert.equal(s.entities,undefined);
});
test('same reservation is idempotent; altered and retired sequence cannot be replayed',()=>{
 const s=fresh(),l=reserve(s,1),available=s.economy.resourceWork[sectorId].availableWorkS;
 assert.equal(reserve(s,1).duplicate,true);assert.equal(s.economy.resourceWork[sectorId].availableWorkS,available);
 assert.equal(reserve(s,1,25).reason,'sequence_conflict');settle(s,l);
 assert.equal(reserve(s,1).reason,'stale_sequence');assert.equal(settle(s,l).ok,false);
});
test('cancellation refunds only a still-live reservation, once',()=>{
 const s=fresh(),l=reserve(s,1);assert.equal(request(s,'cancel',{sectorId,leaseId:l.id}).ok,true);
 assert.equal(s.economy.resourceWork[sectorId].availableWorkS,B.resource.capacityWorkS);
 assert.equal(request(s,'cancel',{sectorId,leaseId:l.id}).ok,false);
});
test('partial publication consumes the published quantity, not the whole reservation',()=>{
 const s=fresh(),l=reserve(s,1);settle(s,l,8);
 assert.ok(Math.abs(s.economy.resourceWork[sectorId].availableWorkS-(B.resource.capacityWorkS-60))<1e-8);
});
test('expired uncertain publications burn their budget; no late settle or refund',()=>{
 const s=fresh(),l=reserve(s,1);s.simTime=900;
 assert.equal(settle(s,l).reason,'unknown_or_expired_lease');
 assert.ok(s.economy.resourceWork[sectorId].availableWorkS<B.resource.capacityWorkS);
 assert.equal(reserve(s,1).reason,'stale_sequence');
});
test('expiration integration does not depend on polling partition',()=>{
 const s=fresh();reserve(s,1);s.simTime=100;reserve(s,2);
 const a=structuredClone(s.economy.resourceWork[sectorId]),b=structuredClone(a);
 advanceResourcePool(a,2000);for(let t=101;t<=2000;t++)advanceResourcePool(b,t);
 assert.ok(Math.abs(a.availableWorkS-b.availableWorkS)<1e-7);assert.deepEqual(a.leases,b.leases);
});
test('twelve simulated hours of extraction do not exhaust the work reservoir',()=>{
 const s=fresh(),perHour=Array(12).fill(0);
 for(let seq=1;seq<=240;seq++) {
  const l=reserve(s,seq);assert.equal(l.ok,true);assert.equal(l.qty,24);settle(s,l);
  perHour[Math.floor(s.simTime/3600)]+=l.qty;s.simTime+=180;
 }
 assert.ok(perHour.every(q=>q===480));assert.ok(s.economy.resourceWork[sectorId].availableWorkS>0);
});
test('rare indivisible finds are not forbidden by a smaller preferred batch size',()=>{
 const s=fresh(),l=reserve(s,1,1,'cmdty_exotic_amazonite');assert.equal(l.ok,true);assert.equal(l.qty,1);assert.ok(l.workS>600);
 assert.equal(settle(s,l).ok,true);
});
test('multiple commodities share one sector budget; large requests cannot overdraw it',()=>{
 const s=fresh();let used=0;for(let i=1;i<50;i++){const l=reserve(s,i,1000000,i%2?'cmdty_ore_iron':'cmdty_scrap_metal');if(l.ok){used+=l.workS;settle(s,l);}}
 assert.ok(used<=B.resource.capacityWorkS+1e-8);assert.ok(s.economy.resourceWork[sectorId].availableWorkS>=0);
});
test('malformed requests and tier bypasses are refused',()=>{
 const s=fresh();for(const qty of [NaN,Infinity,-1,1.5])assert.equal(reserve(s,1,qty).ok,false);
 assert.equal(request(s,'reserve',{sectorId,commodityId:'cmdty_exotic_amazonite',qty:1,seq:1},{maxTier:0}).reason,'tier_unavailable');
 assert.equal(reserve(s,1,1,'cmdty_fuel_cells').reason,'not_extractable');
});
test('save/load preserves outstanding leases, renewal and replay protection',()=>{
 const s=fresh(),l=reserve(s,1);s.simTime=300;reserve(s,2);
 const t=structuredClone(s);t.economy.resourceWork=restoreResourceWork(serializeResourceWork(s.economy.resourceWork),[sectorId]);
 assert.deepEqual(t.economy.resourceWork,s.economy.resourceWork);
 assert.deepEqual(settle(t,l),settle(s,l));s.simTime=t.simTime=1000;
 assert.deepEqual(reserve(t,3),reserve(s,3));
 assert.deepEqual(t.economy.resourceWork,s.economy.resourceWork);
});
test('restored work state rejects unknown sectors and bounds hostile data',()=>{
 const restored=restoreResourceWork({[sectorId]:{availableWorkS:Infinity,updatedAt:-4,highWater:NaN,leases:{}},unknown:{availableWorkS:1e20}},[sectorId]);
 assert.equal(Object.keys(restored).length,1);assert.equal(restored[sectorId].availableWorkS,0);
});

test('prototype-named and malformed lease IDs cannot corrupt a resource pool',()=>{
 const s=fresh();reserve(s,1);const before=serializeResourceWork(s.economy.resourceWork);
 for(const leaseId of ['constructor','__proto__','toString',null,{},1]) {
  assert.equal(request(s,'cancel',{sectorId,leaseId}).ok,false);
  assert.equal(request(s,'settle',{sectorId,leaseId,producedQty:0}).ok,false);
 }
 assert.deepEqual(serializeResourceWork(s.economy.resourceWork),before);
});
