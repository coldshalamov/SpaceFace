import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateScene, placeBody } from './cinderglass-job-fixture.mjs';
import { CINDERGLASS_JOB_POINTS as POINTS } from '../src/features/cinderglassJob/definition.js';
import { cinderglassJobStepConvoy } from '../src/features/cinderglassJob/convoy.js';

async function ready() {
  const t = await candidateScene(); await t.accept();
  const c = t.body('carrierId'), delta = { x: POINTS.pullOff.x-c.pos.x, z: POINTS.pullOff.z-c.pos.z };
  for (const key of ['carrierId','podId','latchId']) {
    const e=t.body(key); placeBody(t,e,{x:e.pos.x+delta.x,z:e.pos.z+delta.z});
  }
  const entry=t.state.npcJobs.byId[t.cg().entities.carrierJobId];
  entry.job.routeIndex=1; entry.job.phase='transit'; entry.job.progress=0;
  placeBody(t,t.player,{x:POINTS.pullOff.x-100,z:POINTS.pullOff.z});
  t.cg().scanDone=true; t.cg().phase='decide';
  cinderglassJobStepConvoy(t.sys,t.state); assert.equal(t.cg().atLayby,true);
  return t;
}

test('inspection card explains physical departure deadline without continuously rebuilding controls',async()=>{
  const t=await ready(),st=t.cg(),published=[];
  t.bus.on('cinderglassJob:servicePrompt',p=>published.push(p));
  st.laybyRemainingS=30; t.sys._publishApproachPrompts();
  assert.match(st.approachPrompt.headline,/thirty seconds or less/);
  assert.match(st.approachPrompt.detail,/Dask resumes the paid delivery/);
  const choices=JSON.stringify(st.approachPrompt.choices), revision=st.promptRevision;
  for (const seconds of [29,24,16]) { st.laybyRemainingS=seconds; t.sys._publishApproachPrompts(); }
  assert.equal(published.length,1);
  st.laybyRemainingS=15; t.sys._publishApproachPrompts();
  assert.match(st.approachPrompt.headline,/fifteen seconds or less/);
  st.laybyRemainingS=5; t.sys._publishApproachPrompts();
  assert.match(st.approachPrompt.headline,/five seconds or less/);
  assert.equal(JSON.stringify(st.approachPrompt.choices),choices);
  assert.equal(st.promptRevision,revision); assert.equal(st.laybyRemainingS,5);
});
test('one-time extension immediately updates honest remaining-window copy',async()=>{
  const t=await ready(),st=t.cg(); st.laybyRemainingS=5;
  t.sys._publishApproachPrompts();
  assert.equal(t.action('extendInspection',{revision:st.promptRevision}).ok,true);
  t.sys._publishApproachPrompts();
  assert.match(st.approachPrompt.headline,/more than thirty seconds/);
  assert.match(st.approachPrompt.detail,/already included/);
  assert.equal(st.laybyRemainingS,35);
});
test('closing the card stays closed through urgency boundaries and does not prolong inspection',async()=>{
  const t=await ready(),st=t.cg(); st.laybyRemainingS=20; t.sys._publishApproachPrompts();
  assert.equal(t.action('leave').ok,true);
  st.laybyRemainingS=5; t.sys._publishApproachPrompts();
  assert.equal(st.approachPrompt,null); assert.equal(st.laybyRemainingS,5);
  st.laybyRemainingS=0; cinderglassJobStepConvoy(t.sys,t.state); t.sys._publishApproachPrompts();
  assert.equal(st.laybyHoldActive,false); assert.equal(st.atLayby,false);
  assert.equal(st.approachPrompt,null); assert.equal(st.custody,'carried');
});
