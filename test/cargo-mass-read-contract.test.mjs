import test from 'node:test';
import assert from 'node:assert/strict';
import * as cargo from '../src/systems/cargoCustody.js';
import { massDeclarationForTarget } from '../src/systems/cargoCustody.js';

function fixture() {
  const target={id:7,alive:true,type:'asteroid',mass:40,
    data:{missionId:'audit-1',missionTargetSlot:0}};
  const mission={id:'audit-1',type:'tow_recovery',status:'active',sourceOfferId:'audit-offer',
    targetEntityIds:[7],destStationId:'station_helios',params:{massDeclaration:{version:1,
      kind:'weight_audit',declaredMassT:20,issuer:'Helios Variance Office',reference:'47-A',targetSlot:0}}};
  return {target,mission,state:{entities:new Map([[7,target]]),missions:{active:[mission]}}};
}

test('a retained old object cannot borrow the replacement occupant declaration',()=>{
  const {state,target}=fixture();state.entities.set(7,{...target,data:{...target.data}});
  assert.equal(massDeclarationForTarget(state,target),null);
  assert.ok(massDeclarationForTarget(state,state.entities.get(7)));
});

test('a stamped body outside the active mission target list carries no current declaration',()=>{
  const {state,target,mission}=fixture();mission.targetEntityIds=[];
  assert.equal(massDeclarationForTarget(state,target),null);
});

test('an exact live legacy durable-slot member retains its declaration without mutation',()=>{
  const {state,target,mission}=fixture();delete target.data.missionTargetSlot;
  target.data.identityKey='mission:audit-1:0';const before=JSON.stringify({target,mission});
  assert.equal(massDeclarationForTarget(state,target).targetSlot,0);
  assert.equal(JSON.stringify({target,mission}),before);
});


const { physicalMassT, massDiscrepancy, normalizeMassScaleState } = cargo;
function fixture2() {
 const target = { id: 7, alive: true, mass: 40, physicsBody: {}, data: { missionTag: 'mission-1', missionTargetSlot: 0 } };
 const mission = { id: 'mission-1', status: 'active', type: 'tow_recovery', sourceOfferId: 'eco_mass_scale_weight_audit_station_helios', stationId: 'station_helios', targetEntityIds: [7], params: { massU: 20, massDeclaration: { version: 1, kind: 'weight_audit', declaredMassT: 20, issuer: 'Helios Variance Office', reference: '47-A', targetSlot: 0 } } };
 return { target, mission, state: { entities: new Map([[7,target]]), missions: { active: [mission] } } };
}
function saved2() {
 const f=fixture2(), d=massDeclarationForTarget(f.state,f.target), slipId='mass-slip:'+d.sourceOfferId+':0';
 return { version:1, slips: { [slipId]: { ...d, slipId, ...massDiscrepancy(20,40), weighedTick:30, weighedSimTime:.5, filedAtStations: { station_helios:{outcome:'mass_discrepancy_filed',tick:31,simTime:.6} }, storyLine:true } }, completed: { [d.sourceOfferId]:true }, fenceOffers: { [slipId]:{offerId:'eco_mass_scale_fence_'+slipId,completed:true} }, pendingNotices:[{text:'WEIGHT SLIP FILED',statusText:'WEIGHT SLIP FILED'}] };
}
test('the four upstream imports exist and all eight shipment exports remain',()=>{
 for(const n of ['physicalMassT','massDeclarationForTarget','massDiscrepancy','normalizeMassScaleState','ensureShipment','shipmentUsed','shipmentQty','addToShipment','takeFromShipment','tradeFingerprint','commitShipmentSale','ensureCommittedIntents']) assert.equal(typeof cargo[n],'function',n);
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
};
for(const [name,alter] of Object.entries(invalids))test('declaration rejects '+name,()=>{const f=fixture2();alter(f);assert.equal(massDeclarationForTarget(f.state,f.target),null);});
test('legacy durable identity slot is accepted, never guessed from missing metadata',()=>{
 const f=fixture2();delete f.target.data.missionTargetSlot;f.target.data.identityKey='mission:mission-1:0';
 assert.equal(massDeclarationForTarget(f.state,f.target).targetSlot,0);
 f.target.data.identityKey='mission:foreign:0';assert.equal(massDeclarationForTarget(f.state,f.target),null);
});
test('malformed and unknown-version saves cannot become evidence',()=>{
 const empty={version:1,slips:{},completed:{},fenceOffers:{}};
 for(const raw of [null,undefined,[],{version:2}, {slips:{x:{slipId:'x'}},completed:'nope'}]) assert.deepEqual(normalizeMassScaleState(raw),empty);
 const raw=saved2();Object.values(raw.slips)[0].measuredMassT=Infinity;assert.deepEqual(normalizeMassScaleState(raw).slips,{});
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


