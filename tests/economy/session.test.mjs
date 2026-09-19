import test from 'node:test';
import assert from 'node:assert/strict';
import {runSession} from '../fixtures/session.mjs';
for(const seed of [4242,8008]) for(const career of ['miner','trader']) {
 test(`12h scheduled ${career}/${seed}: market runtime stays productive, not a gameplay proof`,()=>{
  const r=runSession({seed,career,hours:12});
  assert.equal(r.netByHour.length,12);assert.ok(r.netByHour.every(n=>n>0));
  assert.equal(r.skippedWork,0);assert.equal(r.completedWork,career==='miner'?240:180);
  assert.equal(r.netByHour.reduce((a,b)=>a+b,0),r.netCashFlowCr);
 });
}
for(const career of ['miner','trader']) {
 test(`12h scheduled ${career}/8008: genuine owner save/load at hour six is identical`,()=>{
  const uninterrupted=runSession({seed:8008,career,hours:12});
  const resumed=runSession({seed:8008,career,hours:12,reloadAtS:21600});
  assert.deepEqual(resumed.checkpoint,uninterrupted.checkpoint);
  assert.deepEqual(resumed.netByHour,uninterrupted.netByHour);
  assert.deepEqual(resumed.pulse,uninterrupted.pulse);
 });
}
test('fixed seed is reproducible and another seed changes observed cash flow',()=>{
 const a=runSession({seed:4242,career:'trader',hours:2}),b=runSession({seed:4242,career:'trader',hours:2});
 assert.deepEqual(a,b);assert.notDeepEqual(a.netByHour,runSession({seed:8008,career:'trader',hours:2}).netByHour);
});
