import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';

const body = (x, recordId=null) => ({type:'ship',alive:true,radius:3,mass:24,pos:{x,y:0,z:0},vel:{x:0,y:0,z:0},rot:0,angVel:0,hull:100,hullMax:100,data:{defId:'ship_kestrel',...(recordId ? {worldRecordId:recordId} : {})},flags:{persistent:true},physicsBody:{schemaVersion:1,radius:3,mass:24,inertiaY:48,dynamic:true,shape:'ball',ccd:false,revision:0}});

test('save keeps duplicate-record collapse and native remap rejects many saved bodies onto one carrier', async()=>{
 const sim=createSimulation({seed:47,systems:[physics,save]});
 sim.state.mode='flight';
 const player=sim.spawn({...body(0),isPlayer:true});sim.state.playerId=player.id;
 sim.spawn(body(50,'record_duplicate'));sim.spawn(body(100,'record_duplicate'));
 const system=sim.registry.get('physics'),saver=sim.registry.get('save');
 try {
  assert.equal(await system.prepareBackend(sim.state),true);
  const envelope=saver.serialize('duplicate-record');
  assert.equal(Object.keys(envelope.data.physics.bodies).length,3);
  assert.equal(saver.loadEnvelope(envelope,'duplicate-record'),true);
  const carriers=sim.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId==='record_duplicate');
  assert.equal(carriers.length,1,'newer save ownership still collapses duplicated durable records');
  assert.deepEqual(sim.state.physicsRuntime.nativeRestore,{mode:'scalar',exact:false,reason:'identity_or_contract_changed'});
  assert.equal(system._sg02.records.size,2);
  assert.equal(sim.state.restoreEnvelopeRecordIds,undefined,'restore ownership deferral is closed');
 } finally {sim.dispose();}
});
