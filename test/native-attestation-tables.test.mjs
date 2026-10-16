import test from 'node:test';import assert from 'node:assert/strict';
import {compactNativeAttestationTables as compact,expandNativeAttestationTables as expand,validateNativeAttestationTables as validate} from '../src/save/nativeAttestationTables.js';
const clone=x=>structuredClone(x);
function fixture(count=3){
 const contract={canSleep:false,collisionGroups:131079,manifest:{id:'shape',vertices:[0,1,-1]},material:{friction:0},proportions:null,proxyScale:null,spec:{mass:18,dynamic:true}};
 const native={angularDamping:0,centerOfMass:{x:0,y:0,z:0},colliders:[{shape:{type:0,radius:14}}],enabled:true,inertia:{x:0,y:1,z:0},inverseMass:{x:1,y:0,z:1},linearDamping:0,mass:18,type:0};
 const bodies={};for(let i=1;i<=count;i++)bodies[i]={handle:String(i),identity:{defId:'ship',optional:null},sourceLife:i,state:{x:i,z:0,vx:0,vz:0,yaw:0,wy:0},contract:clone(contract),native:clone(native),effectiveMass:18,effectiveInertiaY:1,bodyResponseMassScale:1,bodyResponseInertiaScale:1,tumbleMaterial:false,forcesDirty:false,createdCanSleep:false,sleepAllowed:null,contactEpisode:{lastTick:null,cumulativeDeltaV:0}};
 return {schema:3,backend:'rapier-dynamic',snapshot:'base64',bodies,bodyOrder:Object.keys(bodies),attachments:{},attachmentOrder:[],tick:1};
}
test('deterministic exact JSON roundtrip and independent reconstructed graphs',()=>{
 const source=fixture(),before=JSON.stringify(source),p=compact(source);assert.ok(p);assert.equal(p.attestations.contracts.length,1);assert.equal(p.attestations.native.length,1);assert.equal(JSON.stringify(expand(p)),before);assert.equal(JSON.stringify(compact(source)),JSON.stringify(p));assert.equal(JSON.stringify(source),before);
 const a=expand(p);a.bodies[1].contract.manifest.vertices[0]=77;a.bodies[1].native.colliders[0].shape.radius=8;assert.equal(a.bodies[2].contract.manifest.vertices[0],0);assert.equal(a.bodies[2].native.colliders[0].shape.radius,14);assert.equal(p.attestations.native[0].colliders[0].shape.radius,14);
});
test('legacy in-memory schema3 remains unchanged',()=>{const p=fixture();assert.equal(expand(p),p);assert.equal(validate(p).legacy,true);});
for(const [name,change] of Object.entries({fraction:p=>p.bodies[1].contractRef=.5,negative:p=>p.bodies[1].nativeRef=-1,outside:p=>p.bodies[1].nativeRef=3,missing:p=>delete p.attestations,mixed:p=>p.bodies[1].native={},unknown:p=>p.attestations.schema=2,duplicate:p=>p.attestations.native.push(clone(p.attestations.native[0])),unused:p=>p.attestations.native.push({...clone(p.attestations.native[0]),mass:19}),unknownBody:p=>p.bodies[1].extra=1,unknownTable:p=>p.attestations.native[0].extra=1,numericString:p=>p.attestations.native[0].mass='18',badOrder:p=>p.bodyOrder[1]=p.bodyOrder[0],nonfinite:p=>p.attestations.native[0].mass=Infinity,sparse:p=>delete p.attestations.native[0].colliders[0]}))test(`reject ${name} atomically`,()=>{const p=compact(fixture());change(p);assert.equal(validate(p).ok,false);assert.equal(expand(p),null);});
test('accessors, toJSON, cycles and prototype pollution refuse without execution',()=>{for(const kind of ['getter','toJSON','cycle','proto']){const p=compact(fixture());let calls=0;if(kind==='getter')Object.defineProperty(p.attestations.native[0],'mass',{enumerable:true,get(){calls++;return 18;}});if(kind==='toJSON')p.attestations.native[0].toJSON=()=>{calls++;return {};};if(kind==='cycle')p.attestations.native[0].colliders.push(p);if(kind==='proto')Object.defineProperty(p.attestations.native[0],'__proto__',{enumerable:true,value:{bad:true}});assert.equal(validate(p).ok,false);assert.equal(calls,0);}});
test('expanded node fanout is independently bounded',()=>{const p=compact(fixture(20));p.attestations.contracts[0].manifest.values=new Array(15000).fill(0);const result=validate(p);assert.equal(result.ok,false);assert.equal(result.reason,'native_attestation_expanded_nodes');});
test('expanded string bytes bounded before clone even with small node count',()=>{const p=compact(fixture(20));p.attestations.contracts[0].manifest.text='a'.repeat(700000);const result=validate(p);assert.equal(result.ok,false);assert.equal(result.reason,'native_attestation_expanded_bytes');});
test('strict null/absent/false/zero distinctions survive exact dedup',()=>{const f=fixture(3);f.bodies[2].contract.manifest.extra=null;f.bodies[3].contract.manifest.extra=false;const p=compact(f);assert.equal(p.attestations.contracts.length,3);assert.deepEqual(expand(p),f);});

test('real native compact adoption preserves exact bodies and refuses changed attestation atomically',{skip:process.env.COMPACT_PURE_ONLY === '1'},async()=>{
 const {createSg02DynamicBodyOwner}=await import('../src/core/sg02DynamicBodyOwner.js');
 const actor=(id,x)=>({id,type:'ship',alive:true,isPlayer:id===1,radius:3,mass:24,pos:{x,y:0,z:0},vel:{x:0,y:0,z:0},rot:0,angVel:0,data:{defId:'ship_kestrel'},flags:{},physicsBody:{schemaVersion:1,radius:3,mass:24,inertiaY:48,dynamic:true,shape:'ball',ccd:false,revision:0}});
 const entities=[actor(1,0),actor(2,50)],source=await createSg02DynamicBodyOwner({publishTelemetry:false}),target=await createSg02DynamicBodyOwner({publishTelemetry:false});
 try{source.syncFromEntities(entities);const raw=source.exportWorldSnapshot(),packed=compact(raw);assert.ok(packed);assert.equal(raw.schema,3);assert.equal(JSON.stringify(expand(packed)),JSON.stringify(raw));assert.equal(target.adoptWorldSnapshot(packed,clone(entities)),true);for(const id of [1,2]){assert.equal(target.records.get(id).body.mass(),source.records.get(id).body.mass());assert.equal(target.records.get(id).colliders.length,source.records.get(id).colliders.length);}
 const before={world:target.world,records:target.records,attachments:target.attachments};for(const kind of ['geometry','mass','invalid-ref','expanded-budget']){const bad=clone(packed);if(kind==='geometry')bad.attestations.native[0].colliders[0].shape.radius+=1;if(kind==='mass')bad.attestations.contracts[0].spec.mass+=1;if(kind==='invalid-ref')bad.bodies[1].nativeRef=.5;if(kind==='expanded-budget')bad.attestations.contracts[0].manifest={huge:'x'.repeat(7*1024*1024)};assert.equal(target.adoptWorldSnapshot(bad,clone(entities)),false,kind);assert.equal(target.world,before.world);assert.equal(target.records,before.records);assert.equal(target.attachments,before.attachments);}
 }finally{source.dispose();target.dispose();}
});

for(const [name,change] of Object.entries({extra:p=>p.bodies.extra=clone(p.bodies[1]),missing:p=>p.bodyOrder.pop(),duplicate:p=>p.bodyOrder[1]=p.bodyOrder[0],unknown:p=>p.bodyOrder[1]='unknown',numeric:p=>p.bodyOrder[1]=2,mixed:p=>p.bodies[1].contractRef=0}))test(`source encoder rejects ${name} without losing records`,()=>{const p=fixture(),before=JSON.stringify(p);change(p);const changed=JSON.stringify(p);assert.equal(compact(p),null);assert.equal(JSON.stringify(p),changed);assert.notEqual(changed,before);});

test('compact depth, prototype, symbol and nonenumerable attacks refuse',()=>{
 for(const kind of ['depth','prototype','symbol','hidden']){
  const p=compact(fixture());const target=p.attestations.contracts[0].manifest;
  if(kind==='depth'){let row=target;for(let i=0;i<64;i++)row=row.next={};}
  if(kind==='prototype')Object.setPrototypeOf(target,{inherited:1});
  if(kind==='symbol')target[Symbol('hidden')]=1;
  if(kind==='hidden')Object.defineProperty(target,'hidden',{value:1});
  assert.equal(validate(p).ok,false,kind);assert.equal(expand(p),null,kind);
 }
});
test('compact byte and node limits refuse before reconstruction',()=>{
 for(const kind of ['bytes','nodes']){const p=compact(fixture(1));const m=p.attestations.contracts[0].manifest;
  if(kind==='bytes')m.text='x'.repeat(12*1024*1024);else m.values=new Array(200001).fill(0);
  assert.equal(validate(p).ok,false);assert.equal(expand(p),null);
 }
});
test('JSON escape, unicode and negative zero semantics roundtrip exactly',()=>{
 const p=fixture();p.bodies[1].contract.manifest.text='\\"\n\t\u0000\ud800😀é';p.bodies[1].state.x=-0;
 assert.equal(JSON.stringify(expand(compact(p))),JSON.stringify(p));
});

test('body-count and first-use reference ordering stay bounded and canonical',()=>{
 assert.equal(compact(fixture(2049)),null);
 const f=fixture(2);f.bodies[2].contract.manifest.id='second';const p=compact(f);
 [p.attestations.contracts[0],p.attestations.contracts[1]]=[p.attestations.contracts[1],p.attestations.contracts[0]];
 p.bodies[1].contractRef=1;p.bodies[2].contractRef=0;
 assert.equal(validate(p).reason,'native_attestation_reference_order');assert.equal(expand(p),null);
});
