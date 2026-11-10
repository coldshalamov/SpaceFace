import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createIronKrakenDebris, IRON_KRAKEN_DEBRIS_CAPACITY,
  IRON_KRAKEN_DEBRIS_PER_DEATH, IRON_KRAKEN_DEBRIS_MAX_LIFE } from '../src/render/ironKrakenDebris.js';
import { createRenderFrameMembrane } from '../src/render/frameCoordinates.js';
import { allocateEntityId, stampOccupantGeneration } from '../src/core/entity.js';
import { createIronKrakenVisual } from '../src/render/ironKrakenVisuals.js';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { vfx } from '../src/render/vfx.js';

const receipt=(id=17,extra={})=>({id,type:'ship',lootTableId:'enemy_iron_kraken',
  pos:{x:40,z:80},presentation:{targetVelocity:{x:12,z:-6}},...extra});
const matrices=fx=>fx.group.children.map(mesh=>Array.from(mesh.instanceMatrix.array.slice(0,mesh.count*16)));
const count=fx=>fx.group.children.reduce((n,mesh)=>n+mesh.count,0);

test('only real Kraken identities admit death-only, opaque manufactured fragments',()=>{
  const scene=new THREE.Scene(),fx=createIronKrakenDebris(scene);
  assert.equal(fx.diagnostics().initialized,false);
  assert.equal(fx.group.children.length,0,'living units do not load a hidden debris interior');
  assert.equal(fx.spawn(receipt(1,{lootTableId:'wasp_swarmer'}),null,null,0),0);
  for(const reason of ['save_restore','reset','game_reset','sector_exit','unload','despawn'])
    assert.equal(fx.spawn(receipt(1,{reason}),null,null,0),0,reason);
  assert.equal(fx.spawn(receipt(1,{pos:{x:NaN,z:4}}),null,null,0),0);
  const entity=Object.freeze({id:17,pos:Object.freeze({x:40,z:80}),
    data:Object.freeze({lootTableId:'enemy_iron_kraken'})});
  assert.equal(fx.spawn(receipt(),entity,null,0),IRON_KRAKEN_DEBRIS_PER_DEATH);
  assert.equal(count(fx),24);
  assert.equal(fx.diagnostics().drawCalls,5);
  assert.deepEqual(fx.group.children.map(mesh=>mesh.count),[8,4,4,4,4],
    'four mantle shards replace the four oversized sleeves without adding fragments');
  for(const mesh of fx.group.children){
    assert.equal(mesh.isInstancedMesh,true);
    assert.equal(mesh.material.type,'MeshStandardMaterial');
    assert.equal(mesh.material.transparent,false);
    assert.equal(mesh.material.depthWrite,true);
    assert.equal(mesh.material.emissiveIntensity,0);
    assert.ok(mesh.geometry.boundingBox.max.y>mesh.geometry.boundingBox.min.y);
    assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
    assert.equal(mesh.castShadow,false);
  }
  let lights=0;scene.traverse(node=>{if(node.isLight)lights++;});
  assert.equal(lights,0);
  fx.dispose();
});

test('receipt identity and cosmetic seed remain deterministic without the source entity',()=>{
  const a=createIronKrakenDebris(new THREE.Scene()),b=createIronKrakenDebris(new THREE.Scene());
  a.spawn(receipt('kraken:31',{lootTableId:'enemy_iron_kraken_colossus'}),null,null,100);
  b.spawn(receipt('kraken:31',{lootTableId:'enemy_iron_kraken_colossus'}),null,null,100);
  a.update(101.25);b.update(101.25);
  assert.deepEqual(matrices(a),matrices(b));
  assert.equal(a.spawn(receipt('kraken:31',{lootTableId:'enemy_iron_kraken_colossus'}),null,null,101.25),0);
  assert.equal(a.diagnostics().deaths,1);
  a.update(106);
  assert.equal(a.spawn(receipt('kraken:31',{lootTableId:'enemy_iron_kraken_colossus'}),null,null,106),0,
    'expiry cannot make a repeated death pay another visual burst');
  a.dispose();b.dispose();
});

function spawnStampedKraken(state, overrides={}) {
  const entity={id:allocateEntityId(state),alive:false,type:'ship',pos:{x:40,z:80},vel:{x:0,z:0},
    mass:240,radius:28,data:{lootTableId:'enemy_iron_kraken',shipClass:'capital'},...overrides};
  stampOccupantGeneration(state,entity);
  state.entities.set(entity.id,entity);
  return entity;
}

test('recycled numeric ids admit each real occupant while stale and cloned deaths remain once-only',()=>{
  const fx=createIronKrakenDebris(new THREE.Scene());
  const state={entities:new Map(),nextEntityId:17,freeIds:[]};
  const first=spawnStampedKraken(state),firstReceipt=receipt(first.id);
  assert.equal(fx.spawn(firstReceipt,first,null,0),24);
  state.entities.delete(first.id);state.freeIds.push(first.id);
  const second=spawnStampedKraken(state),secondReceipt=receipt(second.id);
  assert.equal(second.id,first.id,'the real allocator reused the released id');
  assert.notEqual(second.occupantGeneration,first.occupantGeneration);
  assert.equal(fx.spawn(secondReceipt,second,null,.1),24,'the new occupant deserves its own death');
  assert.equal(fx.spawn({...secondReceipt},second,null,.1),0);
  assert.equal(fx.spawn({...firstReceipt},first,null,.1),0);
  assert.equal(fx.spawn(receipt(first.id),null,null,.1),0,'an unknown lifetime cannot invent a second death');
  assert.equal(fx.diagnostics().deaths,2);assert.equal(fx.diagnostics().active,48);
  fx.update(6);
  state.entities.delete(second.id);state.freeIds.push(second.id);
  const third=spawnStampedKraken(state);
  assert.equal(fx.spawn(receipt(third.id),null,null,6,{occupantGeneration:third.occupantGeneration}),24,
    'the captured generation remains sufficient when a corpse was already removed');
  assert.equal(fx.spawn(receipt(second.id),null,null,6,{occupantGeneration:second.occupantGeneration}),0);
  assert.equal(Object.keys(first).includes('occupantGeneration'),false,'render never adds save-visible latches');
  fx.dispose();
});

test('mass deaths obey a global pool cap, expire, and leave an idle owner asleep',()=>{
  const fx=createIronKrakenDebris(new THREE.Scene());
  for(let i=0;i<20;i++)fx.spawn(receipt(i),null,null,0);
  assert.equal(fx.diagnostics().active,IRON_KRAKEN_DEBRIS_CAPACITY);
  assert.equal(count(fx),IRON_KRAKEN_DEBRIS_CAPACITY);
  assert.equal(fx.diagnostics().evicted,20*24-96);
  fx.update(IRON_KRAKEN_DEBRIS_MAX_LIFE+.01);
  assert.equal(fx.diagnostics().active,0);assert.equal(count(fx),0);assert.equal(fx.group.visible,false);
  const versions=fx.group.children.map(m=>m.instanceMatrix.version);
  fx.update(90);fx.update(91);
  assert.deepEqual(fx.group.children.map(m=>m.instanceMatrix.version),versions);
  fx.dispose();
});

test('sim pause, origin rebasing, rewind and accessibility retain the lifecycle contract',()=>{
  const fx=createIronKrakenDebris(new THREE.Scene());
  fx.spawn(receipt(),null,null,10,{frameOrigin:{x:100000,z:-50000}});
  fx.update(10.5);
  const before=matrices(fx),versions=fx.group.children.map(m=>m.instanceMatrix.version);
  for(let i=0;i<60;i++)fx.update(10.5);
  assert.deepEqual(matrices(fx),before);
  assert.deepEqual(fx.group.children.map(m=>m.instanceMatrix.version),versions);
  fx.reproject(120,-75);
  const after=matrices(fx);
  for(let family=0;family<after.length;family++)for(let i=0;i<after[family].length;i+=16){
    assert.ok(Math.abs(after[family][i+12]-before[family][i+12]-120)<.02);
    assert.ok(Math.abs(after[family][i+14]-before[family][i+14]+75)<.02);
  }
  fx.update(10.5);assert.deepEqual(matrices(fx),after,'same-clock reproject must not snap back');
  fx.update(10.5,{reducedMotion:true});
  const toggled=matrices(fx);
  for(let family=0;family<after.length;family++)for(let i=0;i<after[family].length;i++)
    assert.ok(Math.abs(toggled[family][i]-after[family][i])<.02,'accessibility changes keep the displayed pose');
  fx.update(9);assert.equal(fx.diagnostics().active,0,'rewind retires stale cosmetics');
  fx.spawn(receipt(),null,null,9,{reducedMotion:true,reducedFlash:true});
  fx.update(9.3,{reducedMotion:true,reducedFlash:true});
  const held=matrices(fx);
  fx.update(10,{reducedMotion:true,reducedFlash:true});
  assert.deepEqual(matrices(fx),held,'reduced motion holds separation and disables continued tumble');
  assert.equal(fx.diagnostics().reducedFlash,true);
  fx.update(15,{reducedMotion:true,reducedFlash:true});
  assert.equal(fx.diagnostics().active,0,'accessibility never prevents expiry');
  fx.dispose();
});

test('global receipt fallback projects identically in a far-away local frame',()=>{
  const a=createIronKrakenDebris(new THREE.Scene()),b=createIronKrakenDebris(new THREE.Scene());
  a.spawn(receipt(),null,null,0);
  b.spawn(receipt(17,{pos:{x:1000040,z:-499920}}),null,null,0,{frameOrigin:{x:1000000,z:-500000}});
  assert.deepEqual(matrices(a),matrices(b));
  a.dispose();b.dispose();
});

test('visible pieces capture nested instance world transforms, never parent-only transforms',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),body=new THREE.Group();
  root.position.set(17,4,-29);root.rotation.y=.65;body.scale.setScalar(28);body.rotation.x=.13;
  root.add(body);scene.add(root);
  const geo=new THREE.BoxGeometry(2,3,4),mat=new THREE.MeshStandardMaterial();
  const rig={body};
  for(const name of ['shell','armor','joints','suckers']){
    const mesh=new THREE.InstancedMesh(geo,mat,name==='shell'?8:176);body.add(mesh);rig[name]=mesh;
    for(let i=0;i<mesh.count;i++)mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i*.05,1,-.5));
  }
  root.userData.ironKrakenRig=rig;root.updateMatrixWorld(true);
  const expected=new THREE.Vector3().setFromMatrixPosition(
    rig.shell.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0,1,-.5)));
  const fx=createIronKrakenDebris(scene);fx.spawn(receipt(),null,root,0);
  const actual=new THREE.Vector3(),matrix=new THREE.Matrix4();
  fx.group.getObjectByName('sf-iron-kraken-debris-mantle').getMatrixAt(0,matrix);actual.setFromMatrixPosition(matrix);
  assert.ok(actual.distanceTo(expected)<.0001);
  assert.equal(fx.diagnostics().snapshots,20);
  root.position.set(999,999,999);root.updateMatrixWorld(true);
  const frozen=matrices(fx);fx.update(0);assert.deepEqual(matrices(fx),frozen,'debris copies pose, not source references');
  fx.dispose();geo.dispose();mat.dispose();
});

test('mantle fragments are thin curved closed panels that retain the real nested petal pose',()=>{
  for(const p of Object.values(IRON_KRAKEN_PROFILES)){
    const entity={id:31,type:'ship',pos:{x:17,z:-29},rot:.65,data:{lootTableId:p.enemyId}};
    const root=createIronKrakenVisual(entity),scene=new THREE.Scene(),fx=createIronKrakenDebris(scene);
    root.position.set(17,4,-29);root.rotation.set(.13,.65,-.17);scene.add(root);root.updateMatrixWorld(true);
    fx.spawn(receipt(entity.id,{lootTableId:p.enemyId}),entity,root,0);
    const mantle=fx.group.getObjectByName('sf-iron-kraken-debris-mantle'),source=root.userData.ironKrakenRig.shell;
    try {
      assert.equal(mantle.count,4);assert.equal(fx.diagnostics().snapshots,20);
      assert.notEqual(mantle.geometry,fx.group.getObjectByName('sf-iron-kraken-debris-armor').geometry);
      const positions=mantle.geometry.attributes.position,normals=mantle.geometry.attributes.normal;
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),cross=new THREE.Vector3();
      let signedVolume=0;const directions=new Set();
      for(let i=0;i<positions.count;i+=3){
        a.fromBufferAttribute(positions,i);b.fromBufferAttribute(positions,i+1);c.fromBufferAttribute(positions,i+2);
        signedVolume+=a.dot(cross.crossVectors(b,c))/6;
        directions.add([normals.getX(i),normals.getY(i),normals.getZ(i)].map(x=>Math.round(x*20)).join(','));
      }
      const size=mantle.geometry.boundingBox.getSize(new THREE.Vector3());
      const fill=Math.abs(signedVolume)/(size.x*size.y*size.z);
      assert.ok(fill>0 && fill<.10,`thin panel wall volume must stay below10% of its curved envelope: ${fill}`);
      assert.ok(directions.size>20,'the shard must retain dome curvature rather than becoming a flat card');
      const instance=new THREE.Matrix4(),world=new THREE.Matrix4(),fragment=new THREE.Matrix4();
      for(let i=0;i<4;i++){
        source.getMatrixAt(i*2,instance);world.multiplyMatrices(source.matrixWorld,instance);
        const expected=source.geometry.boundingBox.clone().applyMatrix4(world);
        mantle.getMatrixAt(i,fragment);
        const actual=mantle.geometry.boundingBox.clone().applyMatrix4(fragment);
        assert.ok(expected.min.distanceTo(actual.min)<.0001 && expected.max.distanceTo(actual.max)<.0001,
          `${p.variant} mantle shard must preserve sampled center, bank and body scale`);
      }
    } finally { fx.dispose();root.userData.disposeIronKraken(); }
  }
});

test('clear permits a new world to reuse ids; dispose releases only its owned geometry and material',()=>{
  const scene=new THREE.Scene(),fx=createIronKrakenDebris(scene);
  fx.spawn(receipt(),null,null,0);
  let geometries=0,materials=0;
  for(const mesh of fx.group.children)mesh.geometry.addEventListener('dispose',()=>geometries++);
  fx.group.children[0].material.addEventListener('dispose',()=>materials++);
  fx.clear();assert.equal(fx.diagnostics().active,0);
  assert.equal(fx.spawn(receipt(),null,null,0),24);
  fx.dispose();fx.dispose();
  assert.equal(geometries,5);assert.equal(materials,1);assert.equal(scene.children.length,0);
  assert.equal(fx.spawn(receipt(99),null,null,2),0);
});

function makeAdapter() {
  const system=Object.create(vfx),handlers=new Map(),state={simTime:2,entities:new Map(),
    world:{frameOrigin:{x:1000,z:2000},frameOriginSeq:1},settings:{video:{}},render:{}};
  Object.assign(system,{state,_scene:new THREE.Scene(),_t:2,_subs:[],helpers:{},
    _frameMembrane:createRenderFrameMembrane().reset(state),_beamDamageCueNext:new Map(),
    _explosions:{clear(){}},scheduled:0,cues:0});
  system.bus={on(name,fn,options){const list=handlers.get(name)||[];list.push({fn,options});handlers.set(name,list);return()=>{};}};
  system._scheduleDetonation=()=>system.scheduled++;
  system._emitJuiceCue=()=>system.cues++;
  // Other pre-existing VFX lanes are outside this focused adapter; keep the real registration,
  // kill, membrane, owner roots and Kraken lifecycle methods under test.
  for(const name of ['_forgetMomentumSinkEntity','_markEntityCacheDirty','_onChainEntityKilled',
    '_clearWorldTransientMatter','_resetDamagedPortVfx','_retireEventLightSlot','_findSustainedEventLight',
    '_releaseTransientEventLights','_resetMasslineChainReadout','_markProjectileCacheDirty',
    '_clearTrailStreaks','_resetRibbonTrails','_resetMomentumSinkPresentation','_resetCollisionPresentation',
    '_clearStationSideEvents','_clearCeresJobActionVfx','_clearLawHeatTelegraph','_resetMasslineReleaseArc',
    '_resetMasslineSwingTrace','_resetMonofilamentBlade','_resetApexFlare','_resetPendingDetonations',
    '_resetDockingCradle','_resetEnergyForBoundary','_releaseDoctrineTells']) system[name]=()=>{};
  system._subscribe();
  return {system,handlers,emit:(name,p)=>{for(const {fn} of handlers.get(name)||[])fn(p);}};
}

test('production entity:killed route admits removed victims once and clears every world/save boundary',()=>{
  const {system,emit}=makeAdapter();
  const p=receipt(31,{pos:{x:1040,z:2080}});
  emit('entity:killed',p);
  assert.equal(system._ironKrakenDebris.diagnostics().active,24);
  emit('entity:killed',{...p});
  assert.equal(system._ironKrakenDebris.diagnostics().active,24);
  assert.equal(system.scheduled,1,'duplicate Kraken receipts cannot replay the generic explosion either');
  const before=matrices(system._ironKrakenDebris);
  system.state.world.frameOrigin={x:1300,z:1900};system.state.world.frameOriginSeq++;
  system._syncFrameMembrane();
  const after=matrices(system._ironKrakenDebris);
  assert.ok(Math.abs(after[0][12]-before[0][12]+300)<.001);
  assert.ok(Math.abs(after[0][14]-before[0][14]-100)<.001);
  for(const name of ['sector:exit','sector:enter','game:new','game:newGame','game:exitToMenu','save:restoring','save:loaded']){
    emit(name,{});assert.equal(system._ironKrakenDebris.diagnostics().active,0,name);
    emit('entity:killed',receipt(31,{pos:{x:1040,z:2080}}));
    assert.equal(system._ironKrakenDebris.diagnostics().active,24,`${name} permits a new identity epoch`);
  }
  system._ironKrakenDebris.dispose();
});

test('a sliced kill from the previous world cannot resurrect debris after boundary cleanup',()=>{
  const {system,handlers,emit}=makeAdapter();
  const p=receipt(91),killHandlers=handlers.get('entity:killed');
  for(const entry of killHandlers)if(!entry.options?.presentation)entry.fn(p);
  emit('save:restoring',{});
  for(const entry of killHandlers)if(entry.options?.presentation)entry.fn(p);
  assert.equal(system._ironKrakenDebris,undefined);
  assert.equal(system.scheduled,0);
  emit('entity:killed',p);
  emit('entity:killed',{...p});
  assert.equal(system.scheduled,0,'a replay cannot relabel the outgoing receipt with the new epoch');
  emit('entity:killed',receipt(92,{reason:'save_restore'}));
  emit('entity:killed',receipt(93,{reason:'reset'}));
  assert.equal(system._ironKrakenDebris,undefined);
  assert.equal(system.scheduled,0);
});

test('the real killed subscription captures generation before removal and never borrows a recycled model',()=>{
  const {system,handlers,emit}=makeAdapter();
  Object.assign(system.state,{nextEntityId:17,freeIds:[]});
  const first=spawnStampedKraken(system.state),firstReceipt=receipt(first.id);
  const killHandlers=handlers.get('entity:killed');
  for(const entry of killHandlers)if(!entry.options?.presentation)entry.fn(firstReceipt);
  system.state.entities.delete(first.id);system.state.freeIds.push(first.id);
  const root=new THREE.Group(),geo=new THREE.BoxGeometry(1,1,1),mat=new THREE.MeshStandardMaterial();
  const source=new THREE.InstancedMesh(geo,mat,176);root.add(source);
  for(let i=0;i<source.count;i++)source.setMatrixAt(i,new THREE.Matrix4().makeTranslation(1000,0,1000));
  root.userData.ironKrakenRig={shell:source,armor:source,joints:source,suckers:source};
  const second=spawnStampedKraken(system.state,{alive:true,mesh:root});
  assert.equal(second.id,first.id);
  for(const entry of killHandlers)if(entry.options?.presentation)entry.fn(firstReceipt);
  assert.equal(system._ironKrakenDebris.diagnostics().snapshots,0,
    'the delayed old death cannot harvest the new live occupant\'s arm transforms');
  assert.equal(system.scheduled,1);
  emit('entity:killed',receipt(second.id));
  assert.equal(system.scheduled,1,'a dead receipt naming a currently live occupant is stale');
  second.alive=false;
  emit('entity:killed',receipt(second.id));
  assert.equal(system._ironKrakenDebris.diagnostics().active,48);
  assert.equal(system._ironKrakenDebris.diagnostics().deaths,2);
  assert.equal(system._ironKrakenDebris.diagnostics().snapshots,20);
  assert.equal(system.scheduled,2,'both genuine occupants keep their ordinary explosion schedule');
  emit('entity:killed',{...firstReceipt});
  assert.equal(system.scheduled,2,'an old clone still names the old lifetime after id reuse');
  system._ironKrakenDebris.dispose();geo.dispose();mat.dispose();
});

test('Kraken fragments replace generic death spall while the original phased explosion remains',()=>{
  const {system}=makeAdapter();
  let explosions=0,spall=0,breakups=0,structural=null;
  system._explosions={start(){explosions++;return {};}};
  system._explosionRupture={};
  system._admitAndSpawnArcadeStructural=(_event,_p,emit)=>{structural=emit;};
  system._composeImpact=()=>{breakups++;};
  system._weaponPresenter={quarks:{spawnExplosion(){spall++;}}};
  assert.equal(system._queueExplosion(receipt(), 'capital',28),true);
  assert.equal(explosions,1);assert.equal(structural,false);assert.equal(spall,0);assert.equal(breakups,0);
  assert.equal(system._queueExplosion(receipt(2,{lootTableId:'wasp_swarmer'}),'ordinary',12),true);
  assert.equal(explosions,2);assert.equal(structural,true);assert.equal(spall,1);assert.equal(breakups,1);
});
