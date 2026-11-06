import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { createVisualFactory, hulkExemplarSpecsForShips, wreckPackagedFile } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { disposeDetachedObject, disposeDetachedObjectSteps } from '../src/render/partsLibrary.js';
import { createIronKrakenVisual, getIronKrakenVisualResources,
  getIronKrakenDistantArmResources } from '../src/render/ironKrakenVisuals.js';
import { IRON_KRAKEN_ARM_MOTION, ironKrakenArmRadius, sampleIronKrakenArm } from '../src/render/ironKrakenMotion.js';
import { createIronKrakenWreckVisual, ironKrakenWreckProfileFor,
  IRON_KRAKEN_WRECK_LINKS } from '../src/render/ironKrakenWreckVisuals.js';

const SECTOR = 'sector_helios_prime';
function deathWreck(variant='heavy') {
  const p=IRON_KRAKEN_PROFILES[variant],bus=createBus();
  const state={meta:{seed:4242},tick:470,simTime:47,playerId:1,world:{currentSectorId:SECTOR},
    entities:new Map(),entityList:[],rng(){throw new Error('cosmetic work consumed simulation RNG');}};
  const pos=sectorLocalToGlobalForSector(zonesForSector(SECTOR)[0].center,SECTOR);
  const victim={...makeEnemySpawnSpec(p.enemyId,1,pos),id:40,alive:false};
  state.entities.set(victim.id,victim);state.entityList.push(victim);
  const owner=Object.create(aftermathWrecks);
  owner.init({state,bus,helpers:{},registry:{get(){return null;}}});
  try {
    const receipt={id:victim.id,killerId:1,type:'ship',lootTableId:p.enemyId,victimClass:'capital',
      factionId:victim.factionId,pos:{...pos},sectorId:SECTOR};
    bus.emit('entity:killed',receipt);
    const markers=aftermathForSector(state,SECTOR);
    assert.equal(markers.length,1,'the canonical aftermath owner recorded this death');
    const plan=owner.immediateWreckPlan(receipt);
    assert.ok(plan?.spec,'the same plan the mining owner spawns must carry the hulk');
    return {...plan.spec,id:901,alive:true};
  } finally { owner.destroy(); }
}

function instanceSnapshot(root) {
  const rows=[];
  root.traverse(node=>{if(node.isInstancedMesh)rows.push([node.name,node.count,...node.instanceMatrix.array]);});
  return rows;
}

function visibleGeometryCost(root) {
  let draws=0,triangles=0;
  root.traverseVisible(node=>{if(node.geometry){
    draws++;
    triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);
  }});
  return {draws,triangles};
}

for (const variant of ['heavy','colossus']) {
  test(`${variant} real aftermath hulk metadata reaches a static Kraken through production overrides`,()=>{
    const wreck=deathWreck(variant),before=JSON.stringify(wreck.data);
    assert.equal(wreck.data.hulkVisual.lootTableId,IRON_KRAKEN_PROFILES[variant].enemyId);
    assert.equal(wreck.data.lootTableId,undefined,'the real wreck stores identity only in hulkVisual');
    assert.equal(wreckPackagedFile(wreck),null,'a Kraken corpse must not request the backing Bastion GLB');
    const factory=createVisualFactory();installVisualOverrides(factory,{directAuthoredMount:true,authoredShips:true});
    const root=factory.build(wreck);
    const living=createIronKrakenVisual({id:40,...makeEnemySpawnSpec(IRON_KRAKEN_PROFILES[variant].enemyId,1,{x:0,z:0})});
    try {
      assert.equal(root.userData.ironKrakenWreck.variant,variant);
      assert.equal(root.userData.authoredVisualRoot,'iron-kraken-static-wreck');
      assert.equal(root.userData.kind,'wreck');assert.equal(wreck.presentationAdmission,'ready');
      assert.equal(root.userData.animated,false);
      assert.equal(root.userData.ironKrakenRig,undefined,'there is no retained live attack rig');
      assert.equal(root.userData.updateAuthoredMotion,undefined);
      assert.equal(root.userData.updateLod,undefined,'the persistent corpse never adds an animated detail driver');
      assert.equal(root.userData.requestAuthoredUpgrade,undefined);
      assert.equal(root.userData.authoredPackageUrl,undefined);
      assert.equal(JSON.stringify(wreck.data),before,'the render seam cannot alter persistence or simulation');
      let lights=0;
      root.traverseVisible(node=>{
        if(node.isLight)lights++;
        if(!node.geometry)return;
        assert.equal(node.material.transparent,false);
        assert.equal(node.material.emissiveIntensity,0,'the dead optics cannot carry a charge or attack flash');
        assert.ok(node.geometry.userData.spacefaceSharedAsset);
        if(node.isInstancedMesh){
          assert.equal(node.instanceMatrix.usage,THREE.StaticDrawUsage);
          assert.ok(node.instanceMatrix.array.every(Number.isFinite));
          assert.ok(node.count<=IRON_KRAKEN_WRECK_LINKS);
        }
      });
      const deadCost=visibleGeometryCost(root),liveCost=visibleGeometryCost(living);
      assert.equal(lights,0);
      assert.ok(deadCost.draws<liveCost.draws,'the corpse submits fewer material batches than the current live asset');
      assert.ok(deadCost.triangles<liveCost.triangles,'missing limbs and petals remove actual geometry without an arbitrary art ceiling');
      const {geometries:g}=getIronKrakenVisualResources(),armGeometry=getIronKrakenDistantArmResources(),parts=[];
      root.traverse(node=>{if(node.geometry)parts.push(node);});
      for(const key of ['armor','joint','sucker','suckerCore','hardware','jointMetal','jointRed']){
        const part=parts.find(node=>node.geometry===armGeometry[key]);
        assert.ok(part?.isInstancedMesh,`the static arm shares the reduced ${key} mechanism`);
        assert.equal(part.count,IRON_KRAKEN_WRECK_LINKS);
      }
      for(const key of Object.keys(armGeometry))
        assert.ok(!parts.some(node=>node.geometry===g[key]),'persistent arms do not retain a second full-detail draw');
      for(const key of ['stripe','sleeveDetail'])
        assert.ok(!parts.some(node=>node.geometry===armGeometry[key]),'empty micro-detail families have no instance allocation');
      for(const key of ['hullMetal','shellMetal','wreckEyeDark','wreckEyeMetal','wreckEyeOrange','lens'])
        assert.ok(parts.some(node=>node.geometry===g[key]),`the recognizable ${key} shape is shared, not rebuilt`);
      assert.ok(!parts.some(node=>node.geometry===g.shellGlass),'broken inspection panes do not keep a transparent draw');
      assert.equal(root.getObjectByName('reveal_only_pump'),undefined,'a dead shell never builds the live reveal mechanism');
      assert.equal(root.userData.ironKrakenWreck.links,88);
      assert.equal(root.userData.ironKrakenWreck.survivingArms,4);
      assert.equal(root.userData.ironKrakenWreck.brokenRoots,4);
    } finally { root?.userData.disposeIronKrakenWreck?.();living.userData.disposeIronKraken(); }
  });
}

test('the paired suction cups face away from the barrel and dead proximal links retain their manufactured pitch',()=>{
  const root=createIronKrakenWreckVisual(deathWreck());
  try {
    const armor=root.getObjectByName('broken_arm_armor'),cups=root.getObjectByName('dead_suction_cups');
    const joints=root.getObjectByName('broken_arm_joints');
    const a=new THREE.Matrix4(),b=new THREE.Matrix4();
    const dorsal=new THREE.Vector3(),outward=new THREE.Vector3(),offset=new THREE.Vector3();
    for(let i=0;i<armor.count;i++){
      armor.getMatrixAt(i,a);cups.getMatrixAt(i,b);
      dorsal.setFromMatrixColumn(a,2).normalize();outward.setFromMatrixColumn(b,2).normalize();
      offset.setFromMatrixPosition(b).sub(new THREE.Vector3().setFromMatrixPosition(a));
      assert.ok(outward.dot(dorsal)<-.9999,'local +Z cup faces point toward the arm underside');
      assert.ok(offset.dot(dorsal)<0,'cup mounts sit outside the underside, not inside the sleeve');
    }
    const points=new Float32Array((IRON_KRAKEN_ARM_MOTION.links+1)*3);
    for(const [arm,firstLink] of [0,18,22,40,44,62,66,84].entries()){
      sampleIronKrakenArm(arm,{reducedMotion:true},points);
      for(let link=0;link<IRON_KRAKEN_ARM_MOTION.proximalLinks;link++){
        armor.getMatrixAt(firstLink+link,a);
        const length=new THREE.Vector3().setFromMatrixColumn(a,1).length();
        const radius=new THREE.Vector3().setFromMatrixColumn(a,0).length();
        const point=link*3,next=point+3;
        const livePitch=Math.hypot(points[next]-points[point],points[next+1]-points[point+1],points[next+2]-points[point+2]);
        assert.ok(Math.abs(radius-ironKrakenArmRadius(link))<1e-6,'dead shoulder diameters retain the shared macro anatomy');
        assert.ok(Math.abs(length-livePitch*.64)<1e-6,'shortening the fine tail never shrinks the four large shoulder barrels');
        assert.ok(length/(radius*2)>.75&&length/(radius*2)<1.3,'the shoulder remains a broad barrel rather than a pancake ring');
        joints.getMatrixAt(firstLink+link,b);
        const jointLength=new THREE.Vector3().setFromMatrixColumn(b,1).length();
        assert.ok(Math.abs(jointLength-livePitch*.4)<1e-6,'exposed hydraulic bays keep the same large shoulder pitch');
      }
    }
  } finally { root.userData.disposeIronKrakenWreck(); }
});

test('a restored hulk retains its static broken pose despite a newly allocated entity id',()=>{
  const wreck=deathWreck(),restored=JSON.parse(JSON.stringify(wreck));restored.id=2007;
  const a=createIronKrakenWreckVisual(wreck),b=createIronKrakenWreckVisual(restored);
  try {
    assert.deepEqual(instanceSnapshot(a),instanceSnapshot(b));
    const before=instanceSnapshot(a);
    a.position.set(170,0,-310);a.rotation.set(.2,.7,-.3);a.updateMatrixWorld(true);
    assert.deepEqual(instanceSnapshot(a),before,'ordinary wreck movement cannot restart a live arm animation');
    const live=getIronKrakenVisualResources();
    const liveColors=Object.fromEntries(Object.entries(live.materials).map(([key,m])=>[key,m.color.getHex()]));
    a.traverse(node=>{if(node.material){
      assert.ok(node.material.userData.spacefaceSharedAsset);
      assert.ok(!Object.values(live.materials).includes(node.material),'deadening never mutates a living unit\'s palette');
    }});
    assert.deepEqual(Object.fromEntries(Object.entries(live.materials).map(([key,m])=>[key,m.color.getHex()])),liveColors);
  } finally { a.userData.disposeIronKrakenWreck();b.userData.disposeIronKrakenWreck(); }
});

test('the colossus wreck preserves scale and shared shapes; teardown frees only instance storage',()=>{
  const a=createIronKrakenWreckVisual(deathWreck()),b=createIronKrakenWreckVisual(deathWreck('colossus'));
  let sharedDisposed=0,instanceDisposed=0,instanceCount=0;
  const resources=new Set(),listeners=[];
  a.traverse(node=>{
    if(node.geometry)resources.add(node.geometry);
    if(node.material)resources.add(node.material);
    if(node.isInstancedMesh){instanceCount++;node.addEventListener('dispose',()=>instanceDisposed++);}
  });
  for(const resource of resources){const listener=()=>sharedDisposed++;resource.addEventListener('dispose',listener);listeners.push([resource,listener]);}
  try {
    const boxA=new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3());
    const boxB=new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());
    for(const axis of ['x','y','z'])assert.ok(Math.abs(boxB[axis]/boxA[axis]-1.85)<1e-6);
    b.traverse(node=>{if(node.geometry)assert.ok(resources.has(node.geometry));if(node.material)assert.ok(resources.has(node.material));});
    disposeDetachedObject(a);disposeDetachedObject(a);
    assert.equal(sharedDisposed,0);assert.equal(instanceDisposed,instanceCount);
    let steppedInstances=0;
    b.traverse(node=>{if(node.isInstancedMesh)node.addEventListener('dispose',()=>steppedInstances++);});
    for(const _ of disposeDetachedObjectSteps(b)) { /* canonical paced teardown */ }
    assert.equal(steppedInstances,instanceCount,'paced detached teardown releases every private GPU instance buffer');
    assert.equal(sharedDisposed,0);
  } finally {
    for(const [resource,listener] of listeners)resource.removeEventListener('dispose',listener);
    a.userData.disposeIronKrakenWreck();b.userData.disposeIronKrakenWreck();
  }
});

test('fracture pieces and ordinary Bastion hulks retain their existing render owners',()=>{
  const wreck=deathWreck();
  for(const stamp of [{fracturePiece:'remainder'},{collisionTearOff:true},{arenaShardOf:'marker'},
    {fractureVisual:{partId:'capital_plate'}}]){
    const piece={...wreck,data:{...wreck.data,...stamp}};
    assert.equal(ironKrakenWreckProfileFor(piece),null);
    assert.throws(()=>createIronKrakenWreckVisual(piece),/hulkVisual/);
  }
  const ordinary={...wreck,data:{hulkOfDefId:'ship_bastion',hulkVisual:{defId:'ship_bastion'}}};
  assert.equal(ironKrakenWreckProfileFor(ordinary),null);
  assert.equal(wreckPackagedFile(ordinary),'wholeships/bastion_production_v1.glb');
});

test('roster warm admits the static character hulk separately from its backing ship package',()=>{
  const ships=[{id:1,type:'ship',radius:28,data:{defId:'ship_bastion'}},
    ...Object.values(IRON_KRAKEN_PROFILES).map((p,index)=>({id:index+2,...makeEnemySpawnSpec(p.enemyId,1,{x:0,z:0})}))];
  const specs=hulkExemplarSpecsForShips(ships);
  assert.equal(specs.filter(spec=>ironKrakenWreckProfileFor(spec)).length,1,'shared wreck geometry needs one warm exemplar');
  assert.equal(specs.filter(spec=>wreckPackagedFile(spec)==='wholeships/bastion_production_v1.glb').length,1);
});
