import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureActivityClassified, entityNeedsPhysics } from '../src/world/activityRuntime.js';

function fixture(attachmentState) {
  const player={id:1,type:'ship',isPlayer:true,alive:true,collides:true,radius:8,pos:{x:0,z:0},vel:{x:0,z:0},data:{},flags:{}};
  const payload={id:2,type:'payload',alive:true,collides:true,radius:10,pos:{x:5000,z:0},vel:{x:0,z:0},data:{tetherPayload:true},flags:{persistent:true},physicsBody:{schemaVersion:1,radius:10,mass:960,inertiaY:1200,dynamic:true,material:'sensor'}};
  const state={tick:10,simTime:10,playerId:1,mode:'flight',camera:{zoom:144},settings:{video:{fov:50}},entities:new Map([[1,player],[2,payload]]),entityList:[player,payload],player:{},combat:{attachments:{byId: attachmentState ? {att:{id:'att',ownerId:1,targetId:2,state:attachmentState}} : {}}}};
  ensureActivityClassified(state);
  return {state,payload};
}
for (const status of ['broken','cut','dead',null]) test(`${status ?? 'discarded'} attachment does not pin remote payload`,()=>{
  const {payload}=fixture(status);
  assert.equal(payload.activity.pinnedExact,false);
  assert.equal(entityNeedsPhysics(payload),false);
});
test('active attachment still pins remote payload and breaking releases it after normal grace',()=>{
  const {state,payload}=fixture('active');
  assert.equal(payload.activity.pinnedExact,true);
  assert.equal(entityNeedsPhysics(payload),true);
  state.combat.attachments.byId.att.state='broken';
  for(let i=0;i<240;i++){state.tick++;state.simTime+=1/60;ensureActivityClassified(state);}
  assert.equal(payload.activity.pinnedExact,false);
  assert.equal(entityNeedsPhysics(payload),false);
});
