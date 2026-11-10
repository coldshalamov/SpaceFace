#!/usr/bin/env node
/** Deterministic evidence, not a synthetic substitute for a Crucible win-rate result. */
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMasslineInputGrammar as oldGrammar } from '../test/massline-cadence/baseline/masslineInputGrammar.js';
import { createMasslineInputGrammar as newGrammar } from '../src/systems/masslineInputGrammar.js';
import { solveThrowSolution as oldSolve, sampleThrowSolution as oldSample } from '../test/massline-cadence/baseline/tetherFireControl.js';
import { baselineReelDelta, rateRelease as oldRate } from '../test/massline-cadence/baseline/gameplayMethods.js';
import { solveThrowSolution as newSolve, sampleThrowSolution as newSample } from '../src/combat/tetherFireControl.js';
import { createCadenceWinch, stepCadenceWinch, readCadencePair, rateCadenceTechnique } from '../src/systems/masslineControlLaw.js';
import { createFixture, stepFixture, measureFixture, seeded, DT } from './lib/masslineCadenceFixture.mjs';

// Independent constant-velocity oracle: project relative separation onto relative velocity,
// clamp to the finite observation interval, then compare the physical disk radii.
function oracle(p, a) {
  const x=a.pos.x-p.pos.x,z=a.pos.z-p.pos.z,u=a.vel.x-p.vel.x,w=a.vel.z-p.vel.z;
  const q=u*u+w*w,t=q>0?Math.max(0,Math.min(6,-(x*u+z*w)/q)):0;
  return Math.hypot(x+u*t,z+w*t)<=p.radius+a.radius;
}
function matrix() { return {truePositive:0,trueNegative:0,falsePositive:0,falseNegative:0}; }
function count(m,pred,truth) { m[truth?(pred?'truePositive':'falseNegative'):(pred?'falsePositive':'trueNegative')]++; }
function geometry(seed, cases=3000) {
  const rng=seeded(seed),old=matrix(),cadence=matrix();
  for(let i=0;i<cases;i++){
    const heading=rng()*Math.PI*2, speed=20+rng()*200, bearing=heading+(rng()-.5)*1.5, distance=30+rng()*570;
    const p={pos:{x:(rng()-.5)*10000,z:(rng()-.5)*10000},vel:{x:Math.cos(heading)*speed,z:Math.sin(heading)*speed},radius:2+rng()*24};
    const a={pos:{x:p.pos.x+Math.cos(bearing)*distance,z:p.pos.z+Math.sin(bearing)*distance},
      vel:{x:(rng()-.5)*200,z:(rng()-.5)*200},radius:3+rng()*26};
    const truth=oracle(p,a);count(old,oldSolve(p,a).onSolution,truth);count(cadence,newSolve(p,a).onSolution,truth);
  }
  assert.equal(cadence.falsePositive+cadence.falseNegative,0);
  return {seed,cases,baseline:old,cadence};
}
function grammarTape(make) {
  let longHoldCuts=0,ghostTicks=0;
  for(const duration of [10,11,30,60,120,600]){
    const g=make();for(let i=0;i<duration;i++)g.step(DT,{held:true,attached:true});
    longHoldCuts+=Number(g.step(DT,{held:false,attached:true}).cut);
  }
  const g=make();for(let i=0;i<20;i++)g.step(DT,{held:true,attached:true,lineLength:-1});
  for(let i=0;i<30;i++)ghostTicks+=Number(g.step(DT,{held:true,attached:true,lineLength:0}).lineLength!==0);
  return {longHoldCases:6,longHoldCuts,neutralGhostTicks:ghostTicks,neutralGhostMilliseconds:ghostTicks*DT*1000};
}
function motorTape() {
  let runtime=createCadenceWinch(),rest=160,oldRest=160,oldRate=0,newRate=0;
  const samples=[];
  for(let tick=0;tick<90;tick++){
    const axis=tick<20?-1:tick<30?0:tick<50?1:tick<70?-1:0;
    const opts={axis,dt:DT,minLength:22,maxLength:230,reelRate:60};
    const before=oldRest,oldDelta=baselineReelDelta({...opts,restLength:oldRest});oldRest+=oldDelta;
    const next=stepCadenceWinch(runtime,{...opts,restLength:rest});rest+=next.delta;runtime=next.runtime;
    samples.push({tick,axis,baselineRate:oldDelta/DT,cadenceRate:next.delta/DT,
      baselineRateJump:Math.abs(oldDelta/DT-oldRate),cadenceRateJump:Math.abs(next.delta/DT-newRate)});
    oldRate=(oldRest-before)/DT;newRate=next.delta/DT;
  }
  return {firstTickRate:{baseline:samples[0].baselineRate,cadence:samples[0].cadenceRate},
    maxCommandRateJump:{baseline:Math.max(...samples.map(x=>x.baselineRateJump)),cadence:Math.max(...samples.map(x=>x.cadenceRateJump))},samples};
}
function cachedHeadingStress() {
  const p={pos:{x:0,z:0},vel:{x:0,z:100},radius:3},a={pos:{x:0,z:100},vel:{x:0,z:0},radius:8};
  const old={},current={};oldSample(old,p,a,{tick:0,identity:'same'});newSample(current,p,a,{tick:0,identity:'same'});
  p.vel={x:100,z:0};
  const b=oldSample(old,p,a,{tick:1,identity:'same',omega:0}),c=newSample(current,p,a,{tick:1,identity:'same',omega:0});
  assert.equal(c.onSolution,false);
  return {physicalHit:oracle(p,a),baselineSaysHit:b.onSolution,cadenceSaysHit:c.onSolution};
}
function reducedRun(seed,variant) {
  const s=createFixture(seed,variant),initial=measureFixture(s),trace=[];
  for(let t=0;t<480;t++){
    const reel=t<60?0:t<120?-1:t<210?0:t<240?1:t<300?-1:0;
    stepFixture(s,{reel,pump:t>=240&&t<300});
    if(t%6===0)trace.push(measureFixture(s));
  }
  const final=measureFixture(s);
  return {variant,initial,final,peakTension:Math.max(...trace.map(x=>x.tension)),trace};
}
const phaseShot=(theta,omega=1.0)=>({pos:{x:60*Math.cos(theta),z:60*Math.sin(theta)},
  vel:{x:-60*omega*Math.sin(theta),z:60*omega*Math.cos(theta)},radius:10});
function timingSweep(seed) {
  const rng=seeded(seed),rows=[],cases=[];
  for(let i=0;i<200;i++){
    const omega=.65+rng()*.7,theta=rng()*Math.PI*2,p=phaseShot(theta,omega),flight=.8+rng()*2;
    const av={x:(rng()-.5)*14,z:(rng()-.5)*14};
    cases.push({omega,theta,target:{pos:{x:p.pos.x+(p.vel.x-av.x)*flight,z:p.pos.z+(p.vel.z-av.z)*flight},vel:av,radius:6+rng()*12}});
  }
  for(const offsetMs of [-300,-150,-75,0,75,150,300]){
    let hits=0;
    for(const item of cases){
      const dt=offsetMs/1000,shot=phaseShot(item.theta+item.omega*dt,item.omega),target=structuredClone(item.target);
      target.pos.x+=target.vel.x*dt;target.pos.z+=target.vel.z*dt;hits+=Number(oracle(shot,target));
    }
    rows.push({offsetMs,hits,cases:cases.length});
  }
  return {seed,design:'The same 200 cases are reused at every offset. Targets intersect a reference release by construction: timing sensitivity, NOT a blind agent contest.',rows};
}

const ordinary={player:{masslineTelemetry:{strain:.0001,tangentialSpeed:100,radialSpeed:0}}};
const pair=readCadencePair({pos:{x:0,z:0},vel:{x:0,z:0},mass:100},{pos:{x:100,z:0},vel:{x:0,z:100},mass:100},100);
const report={schema:'spaceface.masslineCadence.evidence.v1',baselineCommit:'de9f3f1fc12fb8ef579f6ea83e02846ac00aabe8',
  scope:'Component and reduced-mechanics evidence only. No full-game Crucible, production Rapier, hardware performance or human fun claim.',
  input:{baseline:grammarTape(oldGrammar),cadence:grammarTape(newGrammar)},motor:motorTape(),
  technique:{sameTautPair:{tangentialSpeed:100,radialSpeed:0,strain:.0001},baseline:oldRate(ordinary,'payload'),cadence:rateCadenceTechnique(pair,{phase:'loaded'})},
  headingChange:cachedHeadingStress(),geometry:[4242,8008,19237].map(seed=>geometry(seed)),
  reducedMechanics:[4242,8008].map(seed=>({seed,runs:['baseline','cadence'].map(v=>reducedRun(seed,v))})),
  timingSensitivity:timingSweep(91926),
  notMeasured:['Crucible kills or win rate','human learning curve','production collision-shape equivalence','production HUD integration','Intel integrated-GPU performance']};
assert.equal(report.input.cadence.longHoldCuts,0);assert.equal(report.input.cadence.neutralGhostTicks,0);
const arg=process.argv.indexOf('--out');
if(arg>=0){const path=resolve(process.argv[arg+1]||'massline-cadence.json');mkdirSync(resolve(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({scope:report.scope,input:report.input,motor:{firstTickRate:report.motor.firstTickRate,maxCommandRateJump:report.motor.maxCommandRateJump},
  technique:{baseline:report.technique.baseline.classification,cadence:report.technique.cadence.classification},headingChange:report.headingChange,
  geometry:report.geometry,timingSensitivity:report.timingSensitivity.rows},null,2));
