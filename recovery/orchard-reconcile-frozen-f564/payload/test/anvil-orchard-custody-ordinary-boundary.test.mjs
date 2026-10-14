import test from 'node:test';
import assert from 'node:assert/strict';
import {orchardRestoreInputsRequired} from '../src/core/anvilOrchardNative.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {ORCHARD_FRAME_BODY_ID,ORCHARD_POD_BODY_ID} from '../src/data/anvilOrchardBody.js';
import {ready} from './fixtures/anvil-orchard-custody-ready.mjs';

test('descriptor classification omits the Orchard gate only for absent Orchard inputs',()=>{
 const ordinary=[{data:{defId:'ship_kestrel'},physicsBody:{shape:'ball'}}];
 for(const state of [{},{sites:undefined},{sites:null},{sites:{}},{sites:{anvilOrchard:null}},{sites:{anvilOrchard:undefined}}])assert.equal(orchardRestoreInputsRequired(state,ordinary),false);
 assert.equal(orchardRestoreInputsRequired({sites:{anvilOrchard:{}}},ordinary),true);
 for(const kind of ['frame','pod'])assert.equal(orchardRestoreInputsRequired({},[{data:{orchardId:'anvil_storm_orchard',orchardKind:kind}}]),true);
 assert.equal(orchardRestoreInputsRequired({},[{data:{orchardCollars:{}}}]),true);
 for(const id of [ORCHARD_FRAME_BODY_ID,ORCHARD_POD_BODY_ID])assert.equal(orchardRestoreInputsRequired({},[{physicsBody:{collisionProxyManifest:{id}}}]),true);
 let calls=0;const accessor=()=>{calls++;throw Error('classification invoked a getter');};
 const state={};Object.defineProperty(state,'sites',{get:accessor});assert.equal(orchardRestoreInputsRequired(state,ordinary),true);
 const sites={};Object.defineProperty(sites,'anvilOrchard',{get:accessor});assert.equal(orchardRestoreInputsRequired({sites},ordinary),true);
 const entity={};Object.defineProperty(entity,'data',{get:accessor});assert.equal(orchardRestoreInputsRequired({},[entity]),true);
 const data={};Object.defineProperty(data,'orchardId',{get:accessor});assert.equal(orchardRestoreInputsRequired({},[{data}]),true);
 assert.equal(calls,0);
});

test('dormant Orchard membership requires a plan outside admitted activity without getter dispatch',()=>{
 let calls=0;const getter=()=>{calls++;throw Error('classification invoked a getter');};
 for(const id of [ORCHARD_FRAME_BODY_ID,ORCHARD_POD_BODY_ID]){
  const dormant={physicsBody:{collisionProxyManifest:{id}}},entities=new Map([['dormant',dormant]]);
  Object.defineProperty(entities,'forEach',{get:getter});Object.defineProperty(entities,Symbol.iterator,{get:getter});
  assert.equal(orchardRestoreInputsRequired({entities},[]),true);
 }
 const ordinary=new Map([['ordinary',{data:{defId:'ship_kestrel'},physicsBody:{shape:'ball'}}]]);
 Object.defineProperty(ordinary,'forEach',{get:getter});Object.defineProperty(ordinary,Symbol.iterator,{get:getter});
 assert.equal(orchardRestoreInputsRequired({entities:ordinary},[]),false);
 const state={};Object.defineProperty(state,'entities',{get:getter});assert.equal(orchardRestoreInputsRequired(state,[]),true);
 assert.equal(calls,0);
});

for(const supplied of [false,true])test(`actual Orchard cold restore rejects an injected owner with ${supplied?'wrong':'missing'} private capability`,async()=>{
 const h=await ready(),original=h.facade._sg02;
 const foreign=await createSg02DynamicBodyOwner(supplied?{orchardRestoreCapability:Object.freeze({})}:{});
 try{
  const payload=original.exportWorldSnapshot(),world=foreign.world;assert.ok(payload);
  h.facade._sg02=foreign;h.facade.deserialize(payload,{deferNative:true});h.facade.completeRestore({});
  assert.equal(h.facade._nativeRestorePending,true);assert.equal(foreign.world,world);assert.equal(foreign.records.size,0);
  assert.equal(foreign.readOrchardPodReady(h.pod,h.sim.state),null);
 }finally{h.facade._sg02=original;foreign.dispose();h.close();}
});
