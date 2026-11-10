import test from 'node:test';
import assert from 'node:assert/strict';
import {StuntFlightObserver,interceptSeconds} from '../src/combat/stuntFlightEvidence.js';
import {bindStuntEvidence,unbindStuntEvidence,observeAppliedImpulse} from '../src/combat/stuntEvidence.js';
import {classifyStuntEvidence} from '../src/combat/stuntRecognition.js';

function evasion({hostile=true,retain=true,damage=false}={}) {
  // Launch speeds re-derived against the restored fast ceilings: kickstart classifies only above
  // 1.25 governed cruise (1.25 x 210 = 262.5 for the kestrel profile), so the scripted blast
  // crosses it (271 WU/s) where the pre-restore tune crossed 1.25 x 105.
  const ship=(id,x,z)=>({id,type:'ship',alive:true,team:id===0?0:1,pos:{x,z},vel:{x:220,z:0},mass:18,radius:6,hull:100,hullMax:100,data:{defId:'ship_kestrel',encounter:{id:'escape-test'}}});
  const player=ship(0,0,0),owner=ship(1,500,500);
  const shot={id:2,type:'projectile',alive:true,ownerId:hostile?1:0,team:hostile?1:0,pos:{x:120,z:0},vel:{x:-100,z:0},radius:1,mass:.1,data:{}};
  const state={playerId:0,tick:0,entities:new Map([[0,player],[1,owner],[2,shot]]),input:{},settings:{}};
  bindStuntEvidence(state);const observer=new StuntFlightObserver(),receipts=[];
  for(let tick=0;tick<180;tick++) {
    state.tick=tick;
    if(tick===2){const before={...player.vel};player.vel={x:260,z:78};observeAppliedImpulse(player,before,player.vel,{actorId:0},tick,'impulse_charge',state);}
    if(tick===20&&!retain)player.vel={x:30,z:10};
    if(tick===35&&damage)observer.damage(tick);
    for(const e of [player,shot]){e.pos.x+=e.vel.x/60;e.pos.z+=e.vel.z/60;}
    receipts.push(...observer.update(state));
  }
  unbindStuntEvidence(state);return receipts;
}
test('trajectory observer measures intercept, retained launch and completed escape without final receipt injection',()=>{
  assert.equal(interceptSeconds({x:100,z:0},{x:-100,z:0},10),.9);
  const receipts=evasion();assert.equal(receipts.length,1);
  assert.deepEqual(classifyStuntEvidence(receipts[0]),['kickstart']);
  assert.ok(receipts[0].escape.separationGain>=24);assert.ok(receipts[0].escape.damageFreeTicks>=60);
});
test('safe self-blast, discarded speed and intervening hostile damage do not qualify Kickstart',()=>{
  assert.equal(evasion({hostile:false}).length,0);
  assert.ok(evasion({retain:false}).every(r=>!classifyStuntEvidence(r).includes('kickstart')));
  assert.equal(evasion({damage:true}).length,0);
});
