import test from 'node:test';
import assert from 'node:assert/strict';
import { yardWorkGuidance } from '../src/features/shipbreakingYard/guidance.js';
import { createYardLayout } from '../src/features/shipbreakingYard/layouts.js';
import { freshYardState, createYardJob, normalizeYardState } from '../src/features/shipbreakingYard/model.js';
import { shipbreakingYard } from '../src/features/shipbreakingYard/runtime.js';
function fixture(id) {
  const row = freshYardState(42); row.anchor = {x:0,z:0};
  const job = createYardJob(row,id), layout = createYardLayout(id,job.variant);
  row.jobs[job.id]=job;row.slots[id]=job.id;job.status='working';row.activeJobId=job.id;
  const bodies = Object.fromEntries(layout.modules.map(m=>[m.id,{alive:true,hull:m.maxHull,pos:{x:m.x,z:m.z},radius:m.radius}]));
  const owner={_layout:()=>layout,physics:{body:(_,id)=>bodies[id]}};
  const options={body:id=>bodies[id],couplingReason:c=>shipbreakingYard._couplingReason.call(owner,job,c)};
  return {row,job,layout,bodies,options,advice:()=>yardWorkGuidance(job,layout,options)};
}
test('LARK advice moves from release to original recovery and next work, without mutation',()=>{
  const f=fixture('lark'); const before=JSON.stringify(f.row);
  assert.equal(f.advice().moduleId,'engine');assert.equal(f.advice().kind,'release');
  assert.equal(JSON.stringify(f.row),before);
  f.job.couplings['engine-clamp'].status='released';
  assert.equal(f.advice().kind,'tow');assert.equal(f.advice().moduleId,'engine');
  f.job.modules.engine.status='delivered';
  assert.equal(f.advice().moduleId,'cargo');
  f.job.modules.cargo.status='lost';f.bodies.cargo.alive=false;
  assert.equal(f.advice().moduleId,'spar');
  f.job.status='complete';assert.equal(f.advice(),null);
});
test('BELLWETHER guides the two real releases before clearing the freed obstruction',()=>{
  const f=fixture('bellwether');
  assert.match(f.advice().detail,/Outer cassette saddle/);
  f.job.couplings['cargo-saddle'].status='released';
  assert.match(f.advice().detail,/Cargo cage crossbrace/);
  f.job.couplings['cage-crossbrace'].status='released';
  assert.equal(f.advice().kind,'tow');assert.equal(f.advice().moduleId,'cargo');
  assert.match(f.options.couplingReason(f.layout.couplings.find(c=>c.id==='pump-collar')),/clear/);
});
test('VESPER safe outer work precedes pressure advice, which never suggests live disconnection',()=>{
  const f=fixture('vesper');assert.equal(f.advice().moduleId,'recorder');
  f.job.couplings['recorder-clamp'].status='released';
  assert.equal(f.advice().moduleId,'recorder'); // remaining shared array saddle
  f.job.couplings['array-saddle'].status='released';
  assert.equal(f.advice().kind,'tow');
  f.job.modules.recorder.status='delivered';f.job.modules.array.status='delivered';
  assert.equal(f.advice().kind,'vent');assert.equal(f.advice().moduleId,'reactor');
  f.job.hazard.vented=true;
  assert.equal(f.advice().kind,'release');assert.match(f.advice().detail,/Pressurized coolant return/);
  f.job.couplings['coolant-return'].status='released';
  assert.equal(f.advice().kind,'tow');assert.equal(f.advice().moduleId,'coolant');
});
test('ordinary work ticket presents advice through existing inspection and survives normalization',()=>{
  const f=fixture('lark');f.job.couplings['engine-clamp'].status='released';f.job.modules.engine.status='free';
  const restored=normalizeYardState(f.row,42), job=restored.jobs[f.job.id];const offers=[];
  const owner={getJob:()=>job,_near:()=>true,_layout:()=>f.layout,_remainingValue:()=>400,
    _row:restored,physics:{body:(_,id)=>f.bodies[id]},_couplingReason:c=>f.options.couplingReason(c),
    bus:{emit:(_,p)=>offers.push(p)},_result:ok=>({ok})};
  assert.equal(shipbreakingYard.workTicket.call(owner,job.id).ok,true);
  assert.match(offers[0].detail,/is free/);
  assert.equal(offers[0].actions[0].id,'inspect-part');assert.equal(offers[0].actions[0].moduleId,'engine');
  assert.match(offers[0].actions[0].label,/FOREMAN/);
  f.bodies.engine.alive=false;
  assert.notEqual(yardWorkGuidance(job,f.layout,f.options).moduleId,'engine');
});
