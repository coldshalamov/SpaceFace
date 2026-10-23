import test from 'node:test';
import assert from 'node:assert/strict';
import * as cargo from '../src/systems/cargoCustody.js';
const { physicalMassT, massDeclarationForTarget, massDiscrepancy, normalizeMassScaleState } = cargo;
function fixture() {
 const target = { id: 7, alive: true, mass: 40, physicsBody: {}, data: { missionTag: 'mission-1', missionTargetSlot: 0 } };
 const mission = { id: 'mission-1', status: 'active', type: 'tow_recovery', sourceOfferId: 'eco_mass_scale_weight_audit_station_helios', stationId: 'station_helios', targetEntityIds: [7], params: { massU: 20, massDeclaration: { version: 1, kind: 'weight_audit', declaredMassT: 20, issuer: 'Helios Variance Office', reference: '47-A', targetSlot: 0 } } };
 return { target, mission, state: { entities: new Map([[7,target]]), missions: { active: [mission] } } };
}
function saved() {
 const f=fixture(), d=massDeclarationForTarget(f.state,f.target), slipId='mass-slip:'+d.sourceOfferId+':0';
 return { version:1, slips: { [slipId]: { ...d, slipId, ...massDiscrepancy(20,40), weighedTick:30, weighedSimTime:.5, filedAtStations: { station_helios:{outcome:'mass_discrepancy_filed',tick:31,simTime:.6} }, storyLine:true } }, completed: { [d.sourceOfferId]:true }, fenceOffers: { [slipId]:{offerId:'eco_mass_scale_fence_'+slipId,completed:true} }, pendingNotices:[{text:'WEIGHT SLIP FILED',statusText:'WEIGHT SLIP FILED'}] };
}
test('the four upstream imports exist and all eight shipment exports remain',()=>{
 for(const n of ['physicalMassT','massDeclarationForTarget','massDiscrepancy','normalizeMassScaleState','ensureShipment','shipmentUsed','shipmentQty','addToShipment','takeFromShipment','tradeFingerprint','commitShipmentSale','ensureCommittedIntents']) assert.equal(typeof cargo[n],'function',n);
});
test('physical mass follows actual body then entity, never declared cargo or fallback1',()=>{
 assert.equal(physicalMassT({mass:40,physicsBody:{mass:50}}),50);
 assert.equal(physicalMassT({mass:40,physicsBody:{}}),40);
 for(const value of [undefined,null,0,-1,NaN,Infinity,'40']) assert.equal(physicalMassT({mass:value}),null);
 assert.equal(physicalMassT({mass:40,alive:false}),null);
 assert.equal(physicalMassT({data:{mass:40},massU:20}),null);
 assert.equal(physicalMassT({mass:40,physicsBody:{mass:NaN}}),40);
});
test('all authored declaration kinds resolve without mutating their owner',()=>{
 for(const kind of ['weight_audit','sealed_recovery','carrier_frame']) {
 const f=fixture(); f.mission.params.massDeclaration.kind=kind;
 const before=JSON.stringify(f.mission),d=massDeclarationForTarget(f.state,f.target);
 assert.equal(d.kind,kind); assert.equal(d.declaredMassT,20); assert.equal(d.issuingStationId,'station_helios'); assert.equal(d.missionId,'mission-1');assert.equal(JSON.stringify(f.mission),before);
 d.issuer='changed';assert.equal(f.mission.params.massDeclaration.issuer,'Helios Variance Office');
 }
});
const invalids={
 dead:f=>f.target.alive=false,
 unregistered:f=>f.state.entities.delete(7),
 copiedEntity:f=>f.state.entities.set(7,{...f.target}),
 inactive:f=>f.mission.status='completed',
 wrongType:f=>f.mission.type='cargo_delivery',
 noMembership:f=>f.mission.targetEntityIds=[],
 wrongTag:f=>f.target.data.missionTag='different',
 conflictingTag:f=>f.target.data.missionId='different',
 wrongSlot:f=>f.target.data.missionTargetSlot=1,
 missingSlot:f=>delete f.target.data.missionTargetSlot,
 fractionalSlot:f=>f.target.data.missionTargetSlot=.5,
 invalidDeclaration:f=>f.mission.params.massDeclaration.declaredMassT=0,
 stringMass:f=>f.mission.params.massDeclaration.declaredMassT='20',
 futureVersion:f=>f.mission.params.massDeclaration.version=2,
 unknownKind:f=>f.mission.params.massDeclaration.kind='other',
 duplicateMission:f=>f.state.missions.active.push({...f.mission}),
 noSource:f=>delete f.mission.sourceOfferId,
};
for(const [name,alter] of Object.entries(invalids))test('declaration rejects '+name,()=>{const f=fixture();alter(f);assert.equal(massDeclarationForTarget(f.state,f.target),null);});
test('legacy durable identity slot is accepted, never guessed from missing metadata',()=>{
 const f=fixture();delete f.target.data.missionTargetSlot;f.target.data.identityKey='mission:mission-1:0';
 assert.equal(massDeclarationForTarget(f.state,f.target).targetSlot,0);
 f.target.data.identityKey='mission:foreign:0';assert.equal(massDeclarationForTarget(f.state,f.target),null);
});
test('discrepancy is finite, absolute and reflects the real measured/declared ratio',()=>{
 assert.deepEqual(massDiscrepancy(20,40),{declaredMassT:20,measuredMassT:40,deltaMassT:20,ratio:2,discrepant:true});
 assert.equal(massDiscrepancy(40,20).deltaMassT,20);assert.equal(massDiscrepancy(40,20).ratio,.5);
 assert.equal(massDiscrepancy(20,20).discrepant,false);
 assert.equal(massDiscrepancy(20,20+1e-7).discrepant,false);
 for(const bad of [0,-1,NaN,Infinity,'20',null,undefined]) {assert.equal(massDiscrepancy(bad,40),null);assert.equal(massDiscrepancy(20,bad),null);}
 assert.equal(massDiscrepancy(Number.MIN_VALUE,Number.MAX_VALUE),null);
 assert.equal(massDiscrepancy(Number.MAX_VALUE,Number.MIN_VALUE),null);
 assert.equal(massDiscrepancy(20,20+2e-6).discrepant,true);
});
test('full owner-written slice round-trips detached and idempotent',()=>{
 const raw=saved(), copy=JSON.stringify(raw),n=normalizeMassScaleState(raw);
 assert.deepEqual(n,raw);assert.deepEqual(normalizeMassScaleState(n),n);assert.equal(JSON.stringify(raw),copy);
 n.pendingNotices[0].text='changed';Object.values(n.slips)[0].filedAtStations.station_helios.outcome='changed';
 assert.equal(JSON.stringify(raw),copy);
});
test('malformed and unknown-version saves cannot become evidence',()=>{
 const empty={version:1,slips:{},completed:{},fenceOffers:{}};
 for(const raw of [null,undefined,[],{version:2}, {slips:{x:{slipId:'x'}},completed:'nope'}]) assert.deepEqual(normalizeMassScaleState(raw),empty);
 const raw=saved();Object.values(raw.slips)[0].measuredMassT=Infinity;assert.deepEqual(normalizeMassScaleState(raw).slips,{});
});
test('normalizer rejects forged identity and non-finite fields while bounding notices',()=>{
 const raw=saved(),s=Object.values(raw.slips)[0];s.slipId='forged';assert.deepEqual(normalizeMassScaleState(raw).slips,{});
 const good=saved();Object.values(good.slips)[0].weighedTick=Infinity;Object.values(good.slips)[0].weighedSimTime=NaN;
 good.pendingNotices=Array.from({length:12},()=>({text:'notice'}));const n=normalizeMassScaleState(good);assert.equal(n.pendingNotices.length,8);assert.equal(Object.values(n.slips)[0].weighedTick,null);assert.equal(Object.values(n.slips)[0].weighedSimTime,null);assert.deepEqual(normalizeMassScaleState(n),n);
});
test('prototype keys never enter saved dictionaries',()=>{
 const raw=JSON.parse('{"completed":{"__proto__":true},"fenceOffers":{"__proto__":{"offerId":"eco_mass_scale_fence___proto__","completed":true}}}');
 assert.deepEqual(normalizeMassScaleState(raw),{version:1,slips:{},completed:{},fenceOffers:{}});assert.equal({}.completed,undefined);
});
test('existing shipment sale remains once-only with collision and custody protection',()=>{
 const g={id:'worker'};assert.equal(cargo.addToShipment(g,'ore',5,10),5);assert.equal(cargo.shipmentUsed(g),5);
 const p={intentId:'sale1',stationId:'station',good:'ore',quantity:3,unitPrice:10,total:30,quoteVersion:1};let paid=0;
 assert.equal(cargo.commitShipmentSale(g,p,()=>{paid++;return 30}).ok,true);assert.equal(cargo.shipmentQty(g,'ore'),2);
 assert.equal(cargo.commitShipmentSale(g,p,()=>{paid++;return 30}).duplicate,true);assert.equal(paid,1);
 assert.equal(cargo.commitShipmentSale(g,{...p,quantity:1},()=>0).reason,'receipt_id_collision');
 assert.equal(cargo.commitShipmentSale(g,{...p,intentId:'sale2'},()=>0).reason,'insufficient_stock');
});


test('saved derived quantities are recomputed and optional queues keep their shape',()=>{const raw=saved(),s=Object.values(raw.slips)[0];s.ratio=999;s.deltaMassT=0;s.discrepant=false;raw.pendingNotices=[{text:'notice',statusText:null}];const n=normalizeMassScaleState(raw),r=Object.values(n.slips)[0];assert.equal(r.ratio,2);assert.equal(r.deltaMassT,20);assert.equal(r.discrepant,true);assert.deepEqual(n.pendingNotices,raw.pendingNotices);raw.pendingNotices=[];assert.deepEqual(normalizeMassScaleState(raw).pendingNotices,[]);});
