// Forced authored admission; actual director cadence and native actor factory. Not a natural scheduler/campaign proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import encounter, { runtime, spec } from '../src/data/encounters/913-scene-pilgrim-lamp-walk.js';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { save } from '../src/save/saveSystem.js';
import { pickLivedVignette } from '../src/systems/livedWorldDirector.js';
import { economy } from '../src/systems/economy.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

test('actual Choir archetype factory, late acceptance and native escort', {timeout:120000}, async()=>{
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');
 const hullId=ENEMY_TYPES.find(x=>x.id==='choir_zealot').shipId;
 assert.equal(hullId,'ship_wasp');
 const evidence=[];
 for(const [acceptAt,ux,uz] of [[20,1,0]]){
  const h=await bootRealPath({seed:913,systems:['tacticalAI','flightV3','aiPorts','physics',economy,encounterDirector],
   hulls:[{hullId,isPlayer:true,rot:Math.atan2(uz,ux),pos:{x:-290*ux,z:-290*uz}}]});
  try{
   h.state.world.currentSectorId='sector_phoebe_echo';
   const d=h.runtime.getSystem('encounterDirector');
   const fired=d.requestAuthoredEncounter({shapeId:encounter.id,encounterId:'native-real-choir',sectorId:'sector_phoebe_echo',anchor:{x:0,z:0},force:true,data:{sceneAxis:{ux,uz}}});
   assert.equal(fired.ok,true,JSON.stringify(fired));
   const l=h.state.encounterDirector.live['native-real-choir'];
   assert.equal(l.shape,encounter,'registry uses candidate913');
   const grants=[],reps=[];let contacts=0,firstHold=null,acceptedAt=null,lastStart=null;
   h.bus.on('physics:impact',()=>contacts++);
   h.bus.on('economy:grantCredits',p=>grants.push(p.amount));
   h.bus.on('faction:repDelta',p=>reps.push({faction:p.factionId||p.faction,delta:p.delta}));
   const entities=()=>l.ids.map(id=>h.state.entities.get(id)).filter(Boolean);
   const original=[...l.ids];assert.equal(original.length,3);console.log('ACTOR_IDENTITIES',JSON.stringify(entities().map(e=>({id:e.id,hull:e.hull,hullMax:e.hullMax,archetype:e.data.archetype,ai:e.data.ai.archetype,scanLabel:e.data.scanLabel}))));
   for(let n=0;n<3600&&l.phase!=='done';n++){
    if(l.phase==='offer'&&h.state.simTime>=acceptAt){
     assert.equal(grants.length,0);acceptedAt=h.state.simTime;
     assert.ok(Math.hypot(entities()[2].pos.x+180*ux,entities()[2].pos.z+180*uz)<.01,'waiting is not a completed trip');
     runtime.choose(d,l,h.state,'a');assert.equal(grants.length,0);
    }
    const last=entities()[2],p=h.player;
    // Test pilot flies the actual scene bearing using the same input packet as controls.
    // Positions, velocities, native bodies and NPC intent are never written by this pilot.
    const vx=last.vel.x+(last.pos.x-110*ux-p.pos.x)*.5;
    const vz=last.vel.z+(last.pos.z-110*uz-p.pos.z)*.5;
    const ax=(vx-p.vel.x)*.12,az=(vz-p.vel.z)*.12;
    const cx=Math.cos(p.rot),sz=Math.sin(p.rot);
    writeRealPathInput(h.state,{moveZ:ax*cx+az*sz,moveX:-ax*sz+az*cx,turnIntent:0});
    // Production encounterDirector samples scripts once per accumulated second.
    if(n%60===0){
     if(l.vars.vAwait?.holdSince!=null)firstHold=l.vars.vAwait.holdSince;
     if(l.vars.vAwait?.entityStarts[last.id])lastStart={...l.vars.vAwait.entityStarts[last.id]};
    }
    h.step(1);
   }
   assert.deepEqual(l.ids,original);assert.equal(l.outcome,'a');
   assert.deepEqual(grants,[30]);assert.equal(h.state.player.credits,30);runtime.choose(d,l,h.state,'a');assert.deepEqual(grants,[30]);assert.equal(h.state.encounterDirector.receipts.filter(r=>r.shape===encounter.id&&r.outcome==='a').length,1);assert.deepEqual(reps,[{faction:'faction_choir',delta:2}]);
   console.log('NATIVE_SETTLEMENT_TIMING',JSON.stringify({now:h.state.simTime,firstHold,acceptedAt,outcome:l.outcome,contacts,vars:l.vars}));assert.ok(h.state.simTime-firstHold>=8-1e-9);assert.ok(h.state.simTime-acceptedAt>=9);
   const last=entities()[2],start=lastStart;assert.ok(start);
   assert.ok(Math.hypot(last.pos.x-start.x,last.pos.z-start.z)>=100);
   assert.ok(h.player.pos.x*ux+h.player.pos.z*uz>-190,'player actually follows by native input');
   assert.equal(entities().length,original.length,'all original pilgrims remain present');assert.ok(entities().every(e=>e.alive!==false&&e.hull>0));h.assertBodies(entities());assert.equal(h.proof().backend,'rapier-dynamic');
   assert.equal(h.proof().sg02Ready,true);assert.equal(h.proof().contactCaptureEnabled,true);assert.equal(contacts,0);
   evidence.push({acceptAt,axis:[ux,uz],completedAt:h.state.simTime,holdFrom:firstHold,contacts,
    lastProgress:Math.hypot(last.pos.x-start.x,last.pos.z-start.z),playerX:h.player.pos.x});
  }finally{h.dispose();}
 }
 console.log('PILGRIM_REAL_ARCHETYPE '+JSON.stringify(evidence));
});
