import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL}from'node:url';import crypto from'node:crypto';
const R=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=process.env.SPACEFACE_RUNTIME_ROOT||path.resolve(R,'../splitter-runtime-candidate');
const read=p=>JSON.parse(fs.readFileSync(path.join(R,p),'utf8'));
const body=read('contracts/proposed-charger-contract.json'),old=read('contracts/frozen-charger-contract.json'),bank=read('candidate-c6/brood-charger.motion.json');
const raw=fs.readFileSync(path.join(R,'candidate-c6/brood_charger_v01.glb'));const glb=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString());
const {BROOD_ATTACK_PROFILES}=await import(pathToFileURL(path.join(runtime,'src/data/broodAttackProfiles.js')));
const {validateMotionBank}=await import(pathToFileURL(path.join(runtime,'src/contracts/motionBank.js')));
const {normalizeConvexProxyVertices}=await import(pathToFileURL(path.join(runtime,'src/core/convexProxyGeometry.js')));
const near=(a,b,e=2e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} differs from ${b}`);
test('physical tuning, inertia envelope and contact reach remain unchanged',()=>{
 for(const k of['mass','radius','centerOfMass','bounds'])assert.deepEqual(body[k],old[k]);
 for(const k of['SOCKET_BROOD_CONTACT_PORT','SOCKET_BROOD_CONTACT_STARBOARD'])assert.deepEqual(body.sockets[k],old.sockets[k]);
 assert.deepEqual(BROOD_ATTACK_PROFILES.brood_charger,read('contracts/frozen-charger-attack.json'));
 assert.deepEqual(body.motion.poses,old.motion.poses);assert.deepEqual(body.motion.timings,old.motion.timings);
 for(let i=0;i<3;i++)for(const k of['node','pivot','foldRadians','translation'])assert.deepEqual(body.motion.rigs[i][k],old.motion.rigs[i][k]);
});
test('all three tiers fit existing triangle, draw, material and pivot budgets',()=>{
 const a=read('candidate-c6/assembly.json');assert.equal(a.images,2);assert.equal(a.materials.length,3);assert.equal(Object.keys(a.motionPivots).length,3);
 for(const l of a.lods){assert.ok(l.triangles<=old.budget.trianglesByLod[l.lod]);assert.ok(l.draws<=old.budget.drawsByLod[l.lod]);}
 assert.equal(glb.animations?.length||0,0);assert.equal(glb.materials.length,3);
 for(const m of glb.materials){assert.equal(m.alphaMode||'OPAQUE','OPAQUE');assert.equal(m.pbrMetallicRoughness.metallicFactor,0);}
});
test('strict bounded convex proposal and exact empty head fork',()=>{
 const p=read('contracts/convex-proxy-proposal.json');assert.equal(p.pieceCount,19);assert.ok(p.pieces.length<=32);
 for(const piece of p.pieces){assert.ok(piece.vertices.length<=12);assert.ok(piece.minimumSupportWidthWU>=.01);assert.ok(normalizeConvexProxyVertices(piece.vertices));}
 const f=read('candidate-c6/footprint-check.json');assert.equal(f.uniqueFractions,138);assert.equal(f.forkNativeArea,0);
 for(const lod of f.lods){assert.ok(lod.passed);assert.ok(lod.maxBoundWU<=.12);assert.equal(lod.forkAreaWU2,0);assert.equal(lod.samples.length,138);}
});
test('Forge motion bank binds actual cold GLB nodes and rest poses',()=>{
 validateMotionBank(bank);assert.equal(bank.sourceGlbSha256,crypto.createHash('sha256').update(raw).digest('hex'));
 for(const b of bank.bindings){const n=glb.nodes.find(n=>n.name===b.node);assert.ok(n);assert.deepEqual(b.restPose.translation,n.translation||[0,0,0]);assert.deepEqual(b.restPose.rotation,n.rotation||[0,0,0,1]);assert.deepEqual(b.requiredAtLod,[0,1,2]);}
});
test('all 60 Hz motion keys exactly mirror actual Charger driver curves',()=>{
 const smooth=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x)};
 const phases={approach:[1,t=>0],windup:[45,t=>smooth(t/45)],attack:[144,t=>1+(.08-1)*smooth(t/8)],recovery:[84,t=>t<8?.08+(.65-.08)*smooth(t/8):.65*(1-smooth((t-8)/76))]};
 for(const [name,[ticks,fn]]of Object.entries(phases)){
  const clip=bank.clips.find(c=>c.name==='brood_'+name);near(clip.durationS,ticks/60);
  for(const ch of clip.channels){assert.equal(ch.times.length,ticks+1);for(let t=0;t<=ticks;t++){near(ch.times[t],t/60);const f=fn(t);if(ch.path==='translation'){near(ch.values[t*3],.8*f);near(ch.values[t*3+1],0);near(ch.values[t*3+2],0);}else{const sign=ch.group.endsWith('_port')?1:-1;near(ch.values[t*4],Math.sin(sign*.42*f/2));near(ch.values[t*4+1],0);near(ch.values[t*4+2],0);near(ch.values[t*4+3],Math.cos(sign*.42*f/2));}}}
 }
});
test('all editable source tiers are finite closed anatomical meshes',()=>{
 for(const l of read('candidate-c6/source-geometry-check.json')){assert.ok(l.topologyPassed);for(const m of l.meshes){assert.equal(m.nonManifoldEdges,0);assert.equal(m.zeroAreaFaces,0);assert.ok(m.finite);}}
});
