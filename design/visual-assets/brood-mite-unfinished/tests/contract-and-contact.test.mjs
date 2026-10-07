import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateMotionBank} from '/workspace/shared/SpaceFace-pr216-brood-final/src/contracts/motionBank.js';
import {BroodContactRuntime} from '/workspace/shared/SpaceFace-pr216-brood-final/src/combat/broodContact.js';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root))),hash=b=>createHash('sha256').update(b).digest('hex');
const base=read('contracts/frozen-mite-contract.json'),candidate=read('contracts/proposed-mite-contract.json');
const bytes=readFileSync(new URL('candidate-m7/brood_mite_v01.glb',root));
const glb=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),bank=read('candidate-m7/brood-mite.motion.json');
test('physical tuning, inertia-driving bounds and true contact reach unchanged',()=>{
 for(const k of ['mass','radius','centerOfMass','bounds','sourceScale','identity','assetId','partId','enemyId','productionCap','densityProbes'])assert.deepEqual(candidate[k],base[k],k);
 for(const n of ['SOCKET_BROOD_CONTACT_PORT','SOCKET_BROOD_CONTACT_STARBOARD'])assert.deepEqual(candidate.sockets[n],base.sockets[n]);
 assert.deepEqual(candidate.motion.poses,base.motion.poses);assert.deepEqual(candidate.motion.timings,base.motion.timings);
});
test('proposal is bounded, convex, well-formed, and explicitly not admitted to runtime',()=>{
 assert.equal(glb.asset.extras.runtimeAccepted,false);assert.equal(glb.asset.extras.reviewOnly,true);assert.equal(candidate.runtimeDependency.notImplementedHere,true);
 assert.equal(candidate.collision.primitives.length,24);
 for(const p of candidate.collision.primitives){
  assert.ok(p.vertices.length>=3&&p.vertices.length<=12);let sign=0;
  for(let i=0;i<p.vertices.length;i++){
   const a=p.vertices[i],b=p.vertices[(i+1)%p.vertices.length],c=p.vertices[(i+2)%p.vertices.length];
   assert.ok(Number.isFinite(a[0])&&Number.isFinite(a[1]));const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
   if(Math.abs(cross)>1e-8){if(!sign)sign=Math.sign(cross);assert.equal(Math.sign(cross),sign,p.id);}
  }
 }
});
test('source-bound motion bank retains four named phases and two meaningful pivots',()=>{
 validateMotionBank(bank);assert.equal(bank.sourceGlbSha256,hash(bytes));assert.equal(bank.rigId,'brood_mite');
 assert.deepEqual(bank.clips.map(c=>c.name),['brood_approach','brood_windup','brood_attack','brood_recovery']);
 assert.equal(bank.bindings.length,2);
 for(const b of bank.bindings){const n=glb.nodes.filter(n=>n.name===b.node);assert.equal(n.length,1);assert.deepEqual(n[0].translation,b.restPose.translation);assert.deepEqual(b.requiredAtLod,[0,1,2]);}
});
test('three opaque shared finishes, exactly two shared images, nine visible batches per tier',()=>{
 assert.equal(glb.materials.length,3);assert.equal(glb.images.length,2);
 for(const m of glb.materials){assert.equal(m.pbrMetallicRoughness.metallicFactor,0);assert.ok(!m.alphaMode||m.alphaMode==='OPAQUE');}
 for(let lod=0;lod<3;lod++){
  const meshes=glb.nodes.filter(n=>n.name?.startsWith(`LOD${lod}_`)&&n.mesh!==undefined).map(n=>glb.meshes[n.mesh]);
  assert.equal(meshes.reduce((n,m)=>n+m.primitives.length,0),9);
  const triangles=meshes.reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+glb.accessors[p.indices].count/3,0),0);
  assert.ok(triangles<=candidate.budget.trianglesByLod[lod],`${lod}: ${triangles}`);
 }
});
test('real unrelated impact spends a pass without remote damage to the locked player',()=>{
 const calls=[],events=[];const actor={id:'mite',alive:true,team:'brood',occupantGeneration:1,data:{broodBodyId:'brood_mite'}};
 const player={id:'player',alive:true,team:'player',occupantGeneration:3,data:{}};const rock={id:'rock',alive:true,team:'neutral',occupantGeneration:2,data:{}};
 const state={mode:'flight',tick:31,playerId:'player',entityList:[actor,player,rock],entities:new Map([actor,player,rock].map(e=>[e.id,e]))};
 const bus={on(){return()=>{}},emit(name,p){events.push({name,p})}};
 const rt=new BroodContactRuntime({state,bus,ensureKernel(){return {routeDamage(p){calls.push(p);return {ok:true}}}}});
 const arm=id=>{actor.data.broodAttack={role:'brood_mite',life:1,phase:'commit',phaseStartedTick:state.tick,targetId:'player',targetLife:3,attackId:id};delete actor.data.broodAttackInterruptedTick;};
 arm('first');rt.onImpact({aId:'mite',bId:'rock',tick:31,consequenceKernelVersion:1,impulse:1,pos:{x:0,z:0}});
 assert.equal(calls.length,0);assert.equal(actor.data.broodAttackInterruptedTick,31);
 rt.onImpact({aId:'mite',bId:'player',tick:31,consequenceKernelVersion:1,impulse:1,pos:{x:0,z:0}});assert.equal(calls.length,0,'spent pass cannot subsequently damage');
 state.tick=32;arm('second');rt.onImpact({aId:'mite',bId:'player',tick:32,consequenceKernelVersion:1,impulse:1,pos:{x:6,z:1.6}});
 assert.equal(calls.length,1);assert.equal(calls[0].targetId,'player');assert.equal(events.filter(e=>e.name==='brood:contact').length,1);
 rt.onImpact({aId:'mite',bId:'player',tick:32,consequenceKernelVersion:1,impulse:1,pos:{x:6,z:1.6}});assert.equal(calls.length,1);rt.destroy();
});
test('every distinct fixed-tick action fraction stays within bidirectional .12 WU geometry target',()=>{
 const forward=read('candidate-m7/lod-coverage-check.json'),reverse=read('candidate-m7/precise-boundary-check.json');
 assert.equal(forward.sourceGlbSha256,hash(bytes));assert.equal(reverse.sourceGlbSha256,hash(bytes));
 assert.equal(forward.uniqueFoldFractions,87);assert.equal(reverse.uniqueFoldFractions,87);
 for(const row of forward.lods){assert.equal(row.samples.length,87);for(const s of row.samples)assert.ok(s.visibleToProxyMaxWU+forward.quantizationAllowanceWU<=.12);}
 for(const row of reverse.lods){assert.equal(row.samples.length,87);assert.ok(row.maxBoundWU<=.12);}
});
