import test from 'node:test';
import assert from 'node:assert/strict';
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
