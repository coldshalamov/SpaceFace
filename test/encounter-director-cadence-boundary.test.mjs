import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {encounterDirector} from '../src/systems/encounterDirector.js';

function boot(){
 const sim=createSimulation({seed:913,systems:[encounterDirector]});
 const {state}=sim;state.mode='flight';state.runtime={profileId:'production'};
 const d=sim.registry.get('encounterDirector'),work=[],accrual=[];
 const accrue=d._accrue,tick=d._tickLive;
 d._accrue=function(dir,s,dt){accrual.push(dt);return accrue.call(this,dir,s,dt);};
 d._tickLive=function(dir,s,now){work.push(now);return tick.call(this,dir,s,now);};
 return {sim,state,d,work,accrual,at(now){state.simTime=now;d.update(1/60,state);}};
}

test('production calendar retains nominal one-second work across accumulated 1/60 boundaries',()=>{
 const h=boot();try{
  for(let i=0;i<1800;i++)h.sim.step(1/60);
  assert.ok(h.work.length>=29,JSON.stringify(h.work));
  for(let i=1;i<h.work.length;i++){
   if(h.work[i-1]<2)continue; // First calendar straddle may start off the owner's baseline.
   const gap=h.work[i]-h.work[i-1];
   assert.ok(gap>=1-1e-9&&gap<=1+1e-9,`work gap ${gap} after ${h.work[i-1]}`);
  }
  const total=h.accrual.reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(total-h.work.at(-1))<1e-9,'elapsed time is conserved, not rounded up');
 }finally{h.sim.dispose();}
});

test('initial rhythm publishes immediately, genuinely early and paused calls do not do work',()=>{
 const h=boot();try{
  h.at(0);assert.equal(h.work.length,1);assert.ok(h.state.encounterDirector.sessionRhythm);
  h.at(.5);h.at(.99999);assert.equal(h.work.length,1);
  h.at(1);assert.equal(h.work.length,2);
  for(let i=0;i<10;i++)h.at(1);
  assert.equal(h.work.length,2);assert.deepEqual(h.accrual,[0,1]);
 }finally{h.sim.dispose();}
});

test('a long elapsed delta accrues once without redesigning remainder or catch-up semantics',()=>{
 const h=boot();try{
  h.at(0);h.at(9.25);h.at(9.25);h.at(9.75);
  assert.deepEqual(h.accrual,[0,9.25]);
  h.at(10.25);assert.deepEqual(h.accrual,[0,9.25,1]);
  assert.equal(h.accrual.reduce((a,b)=>a+b,0),10.25);
 }finally{h.sim.dispose();}
});
