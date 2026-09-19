import test from 'node:test';
import assert from 'node:assert/strict';
import * as before from './baseline/tetherFireControl.js';
import * as after from '../../src/combat/tetherFireControl.js';
import { seeded } from '../../scripts/lib/masslineCadenceFixture.mjs';
test('all legacy fire-control exports remain available',()=>assert.deepEqual(Object.keys(after),Object.keys(before)));
test('unchanged gunnery, pair kinematics and ownership match baseline in 1000 fixed-seed cases',()=>{
  const random=seeded(5150),number=()=>random()*400-200;
  for(let i=0;i<1000;i++){
    const body=id=>({id,type:i%2?'ship':'asteroid',alive:true,pos:{x:number(),z:number()},vel:{x:number(),z:number()},mass:10+random()*400,radius:3+random()*15});
    const a=body('pilot'),b=body('target'),speed=30+random()*500,angle=number(),tether={active:true,targetId:b.id};
    for(const [name,args] of [
      ['tetherPairKinematics',[a,b]],['orbitalConstraintState',[a,b]],
      ['aimTrueProjectileVelocity',[angle,speed,a.vel]],['solveTetherLeadSolution',[a,b,speed]],
      ['masslineOwnsGuns',[tether,b,i%3!==0]],['solutionToleranceRad',[b.radius,speed]],
    ])assert.deepEqual(after[name](...args),before[name](...args),`${name}, case ${i}`);
  }
});
