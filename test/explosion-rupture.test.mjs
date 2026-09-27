import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ExplosionRupture, explosionRuptureFamily, explosionSourceMaterial } from '../src/render/combat/explosionRupture.js';
import { PhasedExplosionLifecycle } from '../src/render/combat/phasedExplosions.js';
import { vfx } from '../src/render/vfx.js';

const entry = (extra = {}) => ({
  sourceType: 'ship', cause: 'generic', serial: 17, classId: 'ordinary',
  x: 20, z: -5, radius: 14, dirX: 1, dirZ: 0, targetVelocityX: 3, targetVelocityZ: -2, ...extra,
});
const make = options => new ExplosionRupture(new THREE.Scene(), options);

test('material source and cause select visibly different constructions, not a shared puff recipe', () => {
  const cases = [
    [entry({ sourceType: 'asteroid' }), 'mineral', new Set([0])],
    [entry({ cause: 'kinetic' }), 'armor', new Set([1])],
    [entry(), 'reactor', new Set([2])],
    [entry({ sourceType: 'volatile_asteroid' }), 'fuel', new Set([3])],
  ];
  for (const [receipt, family, kinds] of cases) {
    const owner = make();
    assert.equal(explosionRuptureFamily(receipt), family);
    assert.equal(owner.emitPhase('rupture', receipt), true);
    assert.deepEqual(new Set(owner.records.filter(r => r.alive).map(r => r.kind)), kinds);
    assert.ok(owner.records.some(r => r.alive && r.width > receipt.radius * 0.17), 'body-scale broad material, not a wire');
    assert.equal(owner.emitPhase('debris', receipt), false, 'existing solid debris retains its phase');
    owner.dispose();
  }
});

test('mineral and reactor releases transport short broad parcels from unequal seats and times', () => {
  for (const sourceType of ['asteroid', 'ship']) {
    const owner = make();
    const receipt = entry({ sourceType });
    owner.emitPhase('rupture', receipt);
    const parcels = owner.records.filter(r => r.alive);
    assert.ok(parcels.every(r => r.length < receipt.radius * 1.02), 'no hull-length petal or pressure rim');
    assert.ok(parcels.every(r => r.length / (r.width * 2) < 2.2), 'material occupies a broad cross-section');
    assert.ok(new Set(parcels.map(r => r.x)).size > 2, 'release seats are not a mirrored two-point fan');
    assert.ok(Math.max(...parcels.map(r => r.born)) > 0.10, 'late parcels arrive after the first throat opens');
    assert.ok(Math.max(...parcels.map(r => r.speed)) / Math.min(...parcels.map(r => r.speed)) > 1.2,
      'matter separates along unequal trajectories rather than moving as one object');
    owner.update(0.045);
    const early = owner.mesh.geometry.instanceCount;
    owner.update(0.24);
    assert.ok(early > 0 && early < owner.mesh.geometry.instanceCount, 'later releases survive the native clock');
    owner.dispose();
  }
});

test('capital pressure uses bounded local parcels while separate internal failures cover hull scale', () => {
  const owner = make();
  const receipt = entry({ classId: 'capital', radius: 200 });
  owner.emitPhase('internal-secondary', receipt);
  owner.emitPhase('rupture', receipt);
  const parcels = owner.records.filter(r => r.alive);
  assert.ok(parcels.every(r => r.kind === 2 && r.length < 50 && r.width < 20),
    'capital rupture cannot restore giant cyan rims or long armor-flame substitutes');
  const internal = parcels.filter(r => r.phase === 'internal-secondary');
  assert.ok(internal.some(r => Math.hypot(r.x - receipt.x, r.z - receipt.z) > 15),
    'large hulls fail at real source-scaled seats instead of magnifying each flame');
  owner.dispose();
});

test('stable receipt reconstructs the same silhouette; seed and direction alter its transport', () => {
  const a = make(), b = make(), c = make();
  a.emitPhase('rupture', entry()); b.emitPhase('rupture', entry());
  c.emitPhase('rupture', entry({ serial: 18, dirX: 0, dirZ: 1 }));
  a.update(0.2); b.update(0.2); c.update(0.2);
  for (let i = 0; i < a.attributes.length; i++) assert.deepEqual(a.attributes[i].array, b.attributes[i].array);
  assert.notDeepEqual(a.attributes[1].array, c.attributes[1].array);
  assert.notDeepEqual(a.attributes[3].array, c.attributes[3].array);
  for (const owner of [a,b,c]) owner.dispose();
});

test('clock pauses without uploads, retimes retirement analytically, and rewinds to empty', () => {
  const owner = make();
  owner.emitPhase('rupture', entry()); owner.update(0.3);
  const versions = owner.attributes.map(a => a.version);
  const snapshot = owner.attributes.map(a => a.array.slice());
  owner.update(0.3);
  assert.deepEqual(owner.attributes.map(a => a.version), versions);
  owner.attributes.forEach((a,i) => assert.deepEqual(a.array,snapshot[i]));
  owner.update(4);
  assert.equal(owner.activeCount,0); assert.equal(owner.mesh.geometry.instanceCount,0); assert.equal(owner.mesh.visible,false);
  const asleep = owner.attributes.map(a => a.version);
  owner.update(5); assert.deepEqual(owner.attributes.map(a => a.version),asleep);
  owner.emitPhase('ignition',entry()); owner.update(5.1); owner.update(0);
  assert.equal(owner.activeCount,0);
  owner.dispose();
});

test('localization and rebasing move anchors only, keeping age, shape and inherited motion', () => {
  const owner = make({ localize: (x,z,out) => {out.x=x-100;out.z=z+50;return out;} });
  owner.emitPhase('rupture',entry()); owner.update(0.1);
  const p = owner.attributes[0].array.slice(), age=owner.attributes[2].array.slice();
  const shape=owner.attributes[1].array.slice(), motion=owner.attributes[3].array.slice();
  owner.reproject(-30,12);
  for(let i=0;i<owner.mesh.geometry.instanceCount;i++) {
    assert.ok(Math.abs(owner.attributes[0].getX(i)-(p[i*3]-30))<1e-5);
    assert.ok(Math.abs(owner.attributes[0].getZ(i)-(p[i*3+2]+12))<1e-5);
  }
  assert.deepEqual(owner.attributes[1].array,shape);
  assert.deepEqual(owner.attributes[2].array,age);
  assert.deepEqual(owner.attributes[3].array,motion);
  owner.dispose();
});

test('unsigned collision axes are canonical and terrain sheets vent away from incoming motion', () => {
  const a=make(), b=make();
  const receipt=entry({cause:'terrain_collision',hasNormal:true,normalX:1,normalZ:0,targetVelocityX:25,targetVelocityZ:0});
  a.emitPhase('rupture',receipt);
  b.emitPhase('rupture',{...receipt,normalX:-1});
  a.update(0.2);b.update(0.2);
  assert.deepEqual(a.attributes[3].array,b.attributes[3].array,'normal sign does not invent another impact');
  assert.ok(a.records.filter(r=>r.alive).every(r=>Math.cos(r.angle)<0),'terrain material goes back out of the contact');
  a.dispose();b.dispose();
});

test('accessibility keeps causal body but lowers flash and travel; disposal is bounded and idempotent', () => {
  const owner = make({capacity:8});
  owner.emitPhase('rupture',entry()); owner.emitPhase('rupture',entry()); owner.emitPhase('rupture',entry());
  assert.equal(owner.activeCount,8);
  owner.update(0.2,{video:{motionReduce:true,flashReduce:true}});
  assert.ok(Math.abs(owner.attributes[2].getW(0)-0.24)<1e-6);
  assert.ok(owner.attributes[4].getX(0)<0.25);
  assert.equal(owner.mesh.material.depthWrite,false);
  assert.equal(owner.mesh.material.blending,THREE.NormalBlending,'dark material separates the hot lips');
  const scene=owner.mesh.parent;
  owner.dispose();owner.dispose();owner.update(1);
  assert.equal(scene.children.length,0);assert.equal(owner.activeCount,0);
});

test('actual cause schedules retire all matter and retain distinct phase choreography', () => {
  for(const cause of ['generic','kinetic','explosive','terrain_collision','ship_collision']) {
    const owner=make(), lifecycle=new PhasedExplosionLifecycle({capacity:2});
    lifecycle.start({classId:'ordinary',radius:14,sourceType:'ship',cause,direction:{x:1,z:0}});
    const seen=[];
    for(let frame=0;frame<300;frame++) {
      lifecycle.update(1/60,(phase,rec)=>{ seen.push(phase);owner.emitPhase(phase,rec); });
      owner.update((frame+1)/60);
    }
    assert.ok(seen.includes('rupture'));assert.ok(seen.includes('debris'));
    assert.equal(owner.activeCount,0,`${cause} has no orphaned material`);
    owner.dispose();
  }
});

test('shipping phase dispatch replaces legacy ball layers and retains event illumination', () => {
  const owner=make(), legacy=[], lights=[];
  const harness=Object.create(vfx);
  harness._explosionRupture=owner;
  harness.state={settings:{video:{}}};
  harness.bus={emit:()=>{}};
  harness._spawnSprite=(...args)=>legacy.push(args);
  harness._flashLight=(...args)=>lights.push(args);
  for(const phase of ['ignition','internal','rupture','pressure','residue']) harness._emitExplosionPhase(phase,entry());
  assert.equal(legacy.length,0,'primary destruction cannot stamp the former combustion/smoke ball envelope');
  assert.ok(owner.activeCount>0);assert.equal(lights.length,2);
  owner.dispose();
});

test('explosive weapon cause never converts known rock into fuel; source substance survives deletion', () => {
  const stone={type:'asteroid',cause:'explosive',entity:{type:'asteroid',data:{typeId:'ast_common_rock'}}};
  const hydrogen={type:'asteroid',cause:'explosive',entity:{type:'asteroid',data:{typeId:'ast_gas_cloud',commodityId:'cmdty_gas_hydrogen'}}};
  const material=explosionSourceMaterial(stone);
  assert.equal(material,'rock');
  assert.equal(explosionRuptureFamily(entry({sourceType:'asteroid',cause:'explosive',materialId:material})),'mineral');
  assert.equal(explosionSourceMaterial(hydrogen),'fuel');
  assert.equal(explosionRuptureFamily(entry({sourceType:'asteroid',cause:'explosive',materialId:'fuel'})),'fuel');
  assert.equal(explosionSourceMaterial({type:'asteroid',entity:{data:{typeId:'ast_icy',commodityId:'cmdty_volatiles'}}}),'ice','corrosive volatiles are not combustible fuel');
  assert.equal(explosionRuptureFamily(entry({sourceType:'ship',cause:'explosive',materialId:'hull'})),'reactor');
  assert.equal(explosionRuptureFamily(entry({sourceType:null,cause:'explosive',materialId:'unknown'})),'fuel','cause is only a fallback for an unknown source');
});

test('native destruction routes rocks into mineral chips and bounds capital panels independently of hull radius', () => {
  const calls=[];
  const structure=[];
  const harness=Object.create(vfx);
  harness.state={settings:{video:{}},entities:new Map(),playerId:1};
  harness._scene=new THREE.Scene();
  harness._explosions=new PhasedExplosionLifecycle();
  harness._explosionRupture={};
  harness._posFrom=p=>p.pos;
  harness._ent=()=>null;
  harness._spawnLocalXZ={x:0,z:0};
  harness._toLocalXZ=(x,z,out)=>{out.x=x;out.z=z;return out;};
  harness._admitAndSpawnArcadeStructural=(_event,_payload,emitStructure)=>structure.push(emitStructure);
  harness._composeImpact=(...args)=>calls.push(['panels',args[9]]);
  harness._weaponPresenter={quarks:{
    spawnCollisionSpall:(...args)=>calls.push(['stone',args.at(-1)]),
    spawnExplosion:()=>calls.push(['hull']),
  }};
  harness._queueExplosion({id:2,type:'asteroid',pos:{x:0,z:0},radius:11,cause:'explosive',entity:{data:{typeId:'ast_common_rock'}}},'ordinary');
  assert.deepEqual(calls,[['stone','rock']]);
  assert.equal(harness._explosions.entries[0].materialId,'rock');
  assert.equal(structure.at(-1),false,'mineral spall replaces generic hull shards');
  calls.length=0;
  harness._queueExplosion({id:3,type:'ship',pos:{x:0,z:0},radius:200},'capital');
  assert.equal(calls[0][0],'panels');assert.ok(calls[0][1]<15,'capital debris uses a bounded material-piece radius');
  assert.equal(calls[1][0],'hull');
  assert.equal(structure.at(-1),true,'hull breakup retains its structural fragments');
  calls.length=0;
  harness._queueExplosion({id:4,type:'asteroid',pos:{x:0,z:0},radius:18,entity:{data:{typeId:'ast_gas_cloud'}}},'ordinary');
  assert.equal(harness._explosions.entries[2].materialId,'fuel');
  assert.equal(calls.length,0,'gas fuel does not invent hull panels or mineral blocks');
  assert.equal(structure.at(-1),false,'gas fuel also suppresses generic causal kill shards while preserving audio admission');
});
