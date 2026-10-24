import assert from 'node:assert/strict';
import {bootRealPath} from '../scripts/lib/bench/realPath.mjs';
import {AI_CONTRACT_VERSION} from '../src/ai/contracts.js';
import {consumePhysicsCommand,writePhysicsControl,queuePhysicsImpulse} from '../src/core/physicsAuthority.js';
const h=await bootRealPath({seed:4242,systems:['aiPorts','physics'],hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:0,z:0}},{hullId:'ship_hornet',pos:{x:200,z:0}}]});
try{
h.step(1);const e=h.hulls[1],p=h.runtime.getSystem('aiPorts');h.assertBodies([e]);const api=p.helpers.aiManeuver;
const flush=()=>h.withFeatures(()=>p.update(1/60,h.state)), req=()=>h.withFeatures(()=>api.request({version:AI_CONTRACT_VERSION,entityId:e.id,tick:h.state.tick,kind:'transit',forceLocal:{forward:1,right:0},torqueYaw:0,reason:'custody'}));
const claim=()=>{e.data.ai||={};e.data.ai.activity={kind:'transit',reason:'custody'};return api.claimActivity(e,e.data.ai.activity);};
const force=()=>{const c=consumePhysicsCommand(e);return Math.hypot(c?.control?.force.x||0,c?.control?.force.z||0);};
let l=claim();assert.ok(req());assert.equal(api.cancelActivity(l),true);flush();assert.equal(force(),0);
l=claim();assert.ok(req());flush();assert.equal(api.cancelActivity(l),true);assert.equal(force(),0);
l=claim();assert.ok(req());flush();const sameControl=structuredClone(consumePhysicsCommand(e).control);assert.ok(req());flush();writePhysicsControl(e,sameControl);queuePhysicsImpulse(e,{x:2,z:3});assert.equal(api.cancelActivity(l),true);let c=consumePhysicsCommand(e);assert.deepEqual(c.control,sameControl);assert.equal(c.impulses.length,1);
l=claim();assert.ok(req());flush();assert.ok(force()>0);api.cancelActivity(l);h.state.tick++;h.state.simCatchupIndex=1;flush();assert.equal(force(),0);h.state.simCatchupIndex=0;
l=claim();assert.ok(req());flush();const replacement=api.claimActivity(e,e.data.ai.activity);assert.notEqual(l,replacement);assert.equal(api.cancelActivity(l),false);assert.equal(api.cancelActivity(replacement),true);assert.equal(force(),0);
l=claim();assert.ok(req());const replacementPending=api.claimActivity(e,e.data.ai.activity);flush();assert.equal(force(),0);api.cancelActivity(replacementPending);
l=claim();assert.ok(req());e.data.ai.activity={kind:'transit',reason:'foreign'};assert.ok(req());assert.equal(api.cancelActivity(l),true);flush();assert.ok(force()>0);assert.equal(e.data.ai.activity.reason,'foreign');
l=claim();assert.ok(req());e.occupantGeneration=(e.occupantGeneration||0)+1;assert.equal(api.cancelActivity(l),false);flush();assert.equal(force(),0);
l=claim();assert.ok(req());flush();e.data.ai.activity={kind:'transit',reason:'changed'};const changed=api.claimActivity(e,e.data.ai.activity);assert.equal(force(),0,'reclaim retires old receipt despite changed activity');api.cancelActivity(changed);
e.data.ai.activity={kind:'transit',reason:'stock'};assert.ok(req());flush();assert.ok(force()>0);h.state.tick++;h.state.simCatchupIndex=1;flush();assert.ok(force()>0);h.state.simCatchupIndex=0;
console.log('LEASE_API_PASS',JSON.stringify({cases:10,diag:p.inspect(),proof:h.proof()}));
}finally{h.dispose();}
