// Unit contracts for PQ-146 moments. Paper arithmetic is not a measured gameplay proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';
import {createTimeEffects} from '../src/core/timeEffects.js';
import {bulletTime,rateMoment,MOMENT_EVENT} from '../src/systems/bulletTime.js';
function receipt(id='one_two',time=13,changes={}) {
  return {trickId:id,name:id,rarity:'rare',actorId:0,targetId:1,secondaryIds:[2],
    episodeId:`root:${id}:${time}`,rootId:`root:${id}:${time}`,rootTick:time*60-120,tick:time*60,
    causeChain:[{kind:'impulse',pos:{x:0,z:0}},{kind:'contact',pos:{x:10,z:0}}],
    consequence:{killed:true},sourceRadius:6,metrics:{availableMomentum:1500,referenceMomentum:400},
    modifiers:{collateralCount:1},...changes};
}
function boot(profile='cinematic',visible=true) {
  const state=createGameState(146);state.mode='flight';state.playerId=0;
  state.settings.gameplay.stuntMoments=profile;
  for(let id=0;id<3;id++)state.entities.set(id,{id,pos:{x:id*10,z:0},radius:6,vel:{x:0,z:0}});
  const bus=createBus(),effects=createTimeEffects(state),system=Object.create(bulletTime);
  const seen={moments:[],cues:[],amendments:[]};
  bus.on(MOMENT_EVENT,r=>seen.moments.push(r));bus.on('audio:cue',r=>seen.cues.push(r));bus.on('moment:amended',r=>seen.amendments.push(r));
  const helpers={worldToScreen:p=>({x:p.x*4+100,y:p.z*4+100,onScreen:visible})};
  system.init({state,bus,timeEffects:effects,helpers});
  return {state,bus,effects,system,seen,emit(r,event='stunt:trickDetected'){state.tick=r.tick;state.simTime=r.tick/60;bus.emit(event,r);},close(){system.destroy();bus.clear();}};
}
test('design arithmetic: 5.40 One-Two, 4.20 Collateral Bolas, 3.96 Kickstart; no adaptive normalizer',()=>{
  assert.equal(rateMoment(receipt()).score,5.4);
  const bolas=receipt('bolas',28,{rarity:'uncommon',metrics:{availableMomentum:960,referenceMomentum:400},modifiers:{collateralCount:2}});
  assert.ok(Math.abs(rateMoment(bolas).score-4.2)<1e-12);
  assert.equal(rateMoment(receipt('kickstart',49,{metrics:{availableMomentum:880,referenceMomentum:400}})).score,3.9600000000000004);
  assert.equal(rateMoment(receipt('rock_discovery',13,{rarity:'common'})).qualifies,false);
  assert.equal(rateMoment(receipt('one_two',13,{metrics:{exchangedMomentum:999999,speed:999999}})).qualifies,false);
});
test('first qualifying chronological consequence owns moment; amendments update peak without new cue',()=>{
  const h=boot();try{
    const r=receipt('bolas',28,{rarity:'uncommon',metrics:{availableMomentum:960,referenceMomentum:400},modifiers:{collateralCount:2}});
    h.emit(r);assert.equal(h.seen.moments.length,1);assert.equal(h.seen.cues.length,1);assert.equal(h.state.timeScale,.8);
    h.emit({...r,tick:1800,modifiers:{collateralCount:3}},'stunt:trickAmended');
    assert.equal(h.seen.moments.length,1);assert.equal(h.seen.cues.length,1);
    assert.ok(Math.abs(h.seen.amendments[0].peakScore-6.48)<1e-12);
    h.system.update(1/60,h.state);assert.equal(h.state.timeScale,1);
  }finally{h.close();}
});
test('Flow and reduced motion preserve recognition while skipping live time assist',()=>{
  for(const [profile,reduced] of [['flow',false],['cinematic',true]]) {
    const h=boot(profile);try{h.state.settings.video.motionReduce=reduced;h.emit(receipt());assert.equal(h.seen.moments.length,1);assert.equal(h.state.timeScale,1);}finally{h.close();}
  }
});
test('unknown camera, offscreen terminal, tiny causal object and nonconsequential release cannot emit a moment',()=>{
  for(const mutation of [h=>h.system.helpers={},h=>h.system.helpers.worldToScreen=p=>({x:0,y:0,onScreen:false}),h=>h.system.helpers.worldToScreen=p=>({x:0,y:0,onScreen:true})]) {
    const h=boot();try{mutation(h);h.emit(receipt());assert.equal(h.seen.moments.length,0);}finally{h.close();}
  }
  const h=boot();try{h.emit(receipt('razor_release',13,{consequence:{}}));assert.equal(h.seen.moments.length,0);}finally{h.close();}
});
test('twelve second cooldown, thirty second primary quiet and three per minute limits',()=>{
  const h=boot();try{
    for(const [id,time] of [['one_two',13],['bolas',14],['one_two',26],['bolas',28],['kickstart',49],['well_golf',62]])h.emit(receipt(id,time));
    assert.deepEqual(h.seen.moments.map(r=>r.simTime),[13,28,49]);
  }finally{h.close();}
});
test('serialized moment history prevents an already delivered root firing after restore',()=>{
  const h=boot();try{
    const r=receipt();h.emit(r);const saved=JSON.parse(JSON.stringify(h.state.stunts));
    h.bus.emit('save:restoring',{});h.state.stunts=saved;h.bus.emit('save:loaded',{});h.emit(r);
    assert.equal(h.seen.moments.length,1);assert.equal(h.state.timeScale,1);
  }finally{h.close();}
});

