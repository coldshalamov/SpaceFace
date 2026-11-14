import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {createVisualFactory} from '../src/render/visualFactory.js';
import {installVisualOverrides, packagedPropSpec} from '../src/render/visualOverrides.js';
import {commodityPresentationFor} from '../src/data/commodities.js';
import {renderPackagePilotForSourceUrl} from '../src/render/renderPackageManifest.js';
import {createRenderPackageLoader} from '../src/render/renderPackageLoader.js';
import {prepareRenderPackageBlueprint, loadAuthoredRenderPackagePilot} from '../src/render/assetLoader.js';
import {getAssetResidency} from '../src/render/assetResidency.js';
import {disposeDetachedObject} from '../src/render/partsLibrary.js';
import {createOrdnanceMotionTracker, resolveJettisonClaimBurn} from '../src/render/ordnanceMotionPresentation.js';

const SOURCE='assets/ships/release/parts/pods/pod_cargo_container.glb';
const disk=path=>readFile(new URL('../'+path,import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const entity=(id,commodityId,data={})=>({id,type:'payload',alive:true,radius:4,pos:{x:0,z:0},rot:0,
  data:{kind:'cargo',payloadType:'jettisoned_cargo',...(commodityId?{commodityId}:{}),...data}});
const factory=()=>installVisualOverrides(createVisualFactory(),{releaseMode:true});
function material(root,name){let found;root.traverse(o=>{if(o.isMesh&&o.material?.name===name)found=o.material;});return found;}
async function fixture(){
  const pilot=renderPackagePilotForSourceUrl(SOURCE),metadata=JSON.parse(await disk(pilot.metadataUrl)),renderer={};
  const loader=createRenderPackageLoader({
    residency:getAssetResidency(renderer),contentDigest:digest,
    fetchImpl:async()=>({ok:true,json:async()=>structuredClone(metadata)}),
    loadGlb:async(url,accepted)=>{
      const bytes=await disk(String(url).replace(/^\.\//,''));assert.equal(digest(bytes),accepted.render.sha256);
      const parser=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      parser.register(()=>({name:'KHR_texture_basisu',loadTexture:()=>Promise.resolve(null)}));
      await MeshoptDecoder.ready;
      return parser.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    },
    prepareDecoded:(decoded,accepted,url,plan)=>prepareRenderPackageBlueprint(pilot,decoded,accepted,{renderer,plan}),
  });
  const runtime={assets:new Map(),failures:new Map(),retiring:false,renderPackages:loader};
  let record;
  const load=async(url,options={})=>{assert.equal(url,SOURCE);record=await loadAuthoredRenderPackagePilot(runtime,pilot,url,options);return record;};
  return {renderer,load,record:()=>record,close:()=>loader.dispose()};
}

test('actual generic cargo package swap preserves family bands, sharing and authored material hooks',async()=>{
  const f=await fixture(),scene=new THREE.Scene(),roots=[];
  try{
    const bodies=[entity(901,'cmdty_ore_iron'),entity(902,'cmdty_food'),entity(903,'cmdty_food'),entity(904,null),entity(905,'not-a-known-commodity'),
      entity(906,'cmdty_food',{packagedPropFile:'pods/pod_cargo_container.glb'})];
    for(const e of bodies){
      const before=JSON.stringify(e),root=factory().build(e);roots.push(root);scene.add(root);
      const motion={pickupRole:root.userData.pickupRole,animated:root.userData.animated,kind:root.userData.kind};
      assert.equal(await root.userData.requestAuthoredUpgrade(f.renderer,scene,{loadAuthoredPart:f.load}),true);
      assert.equal(root.userData.authoredAssetState,'authored');
      assert.equal(JSON.stringify(e),before,'the swap never writes cargo, physics or identity');
      assert.deepEqual({pickupRole:root.userData.pickupRole,animated:root.userData.animated,kind:root.userData.kind},motion);
      const body=root.getObjectByName('payload_PackagedBody');assert.ok(body);
      body.updateWorldMatrix(true,true,true);
      const size=new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
      assert.ok(Math.abs(Math.max(size.x,size.y,size.z)-2*e.radius)<1e-4,'existing authored collision-envelope fit remains');
      const frame=root.getObjectByName('ProceduralPropScaleFrame');
      frame?.traverse(o=>{if(o.isMesh)assert.equal(o.visible,false,'the assertion examines the authored replacement, not a visible precursor');});
    }
    const bands=roots.map(r=>material(r.getObjectByName('payload_PackagedBody'),'Material_Accent'));
    const source=f.record().primitives.find(p=>p.material.name==='Material_Accent').material;
    for(const i of [0,1,2,4])assert.equal(bands[i].color.getHexString(),commodityPresentationFor(bodies[i].data.commodityId).color.slice(1));
    assert.equal(bands[1],bands[2],'same family shares one variant');assert.notEqual(bands[0],bands[1]);
    assert.equal(bands[3],source,'missing commodity retains authored defaults');
    assert.equal(bands[5],source,'explicit same-file recipe remains authoritative');
    assert.notEqual(source.color.getHexString(),bands[1].color.getHexString(),'shared package material is never recolored');
    assert.equal(bands[1].onBeforeCompile,source.onBeforeCompile);assert.equal(bands[1].customProgramCacheKey,source.customProgramCacheKey);
    assert.equal(bands[1].roughness,source.roughness);assert.equal(bands[1].metalness,source.metalness);
    assert.equal(bands[1].map,source.map);assert.equal(bands[1].normalMap,source.normalMap);
    const signals=roots.map(r=>material(r.getObjectByName('payload_PackagedBody'),'Material_Emissive_Cyan'));
    const sourceSignal=f.record().primitives.find(p=>p.material.name==='Material_Emissive_Cyan').material;
    assert.equal(signals[0],signals[1]);assert.equal(signals[1],signals[2],'ordinary generic signals share across families');
    assert.equal(signals[5],sourceSignal,'explicit recipes retain authored signal intensity');
    assert.equal(signals[0].emissiveIntensity,0.12);assert.ok(sourceSignal.emissiveIntensity>signals[0].emissiveIntensity);
    assert.equal(signals[0].onBeforeCompile,sourceSignal.onBeforeCompile);assert.equal(signals[0].map,sourceSignal.map);
    let signalDisposed=0;signals[0].addEventListener('dispose',()=>signalDisposed++);
    let disposed=0;bands[1].addEventListener('dispose',()=>disposed++);
    bands[1].dispose();assert.equal(disposed,0,'one pod teardown cannot dispose the shared family material');
    scene.remove(roots[1]);disposeDetachedObject(roots[1]);
    assert.equal(disposed,0,'despawning one live pod retains the shared variant used by its sibling');
    assert.equal(signalDisposed,0,'signal cache also survives an individual pod teardown');
    assert.equal(material(roots[2].getObjectByName('payload_PackagedBody'),'Material_Accent'),bands[1]);
    assert.equal(bands[1].color.getHexString(),commodityPresentationFor('cmdty_food').color.slice(1));
    for(const root of roots){root.userData.releaseAuthoredAssetResidency?.('cargo-family-test');scene.remove(root);}
    f.close();assert.equal(disposed,1,'source package retirement releases its cached family material exactly once');
    assert.equal(signalDisposed,1,'source package retirement releases shared signal exactly once');
  }finally{for(const root of roots)root.userData.releaseAuthoredAssetResidency?.('cargo-family-cleanup');f.close();}
});

test('player claim burn drives a visible private authored lamp after the actual swap',async()=>{
  const f=await fixture(),scene=new THREE.Scene(),roots=[];
  try{
    const own=entity(970,'cmdty_food',{playerJettisonOrigin:{version:1,ownerId:1},pickupEmbargoUntil:10});
    const other=entity(971,'cmdty_food');
    for(const e of [own,other]){const root=factory().build(e);roots.push(root);scene.add(root);assert.equal(await root.userData.requestAuthoredUpgrade(f.renderer,scene,{loadAuthoredPart:f.load}),true);}
    const [root,ordinary]=roots,claim=root.userData.jettisonClaimLamp;
    const lamp=material(root.getObjectByName('payload_PackagedBody'),'Material_Emissive_Cyan');
    const ordinaryLamp=material(ordinary.getObjectByName('payload_PackagedBody'),'Material_Emissive_Cyan');
    assert.equal(claim.material,lamp,'the live animation record must target the visible authored lamp');
    assert.notEqual(lamp,ordinaryLamp,'claim burn is per pod, never a shared lamp mutation');
    assert.equal(lamp.onBeforeCompile,ordinaryLamp.onBeforeCompile);
    const ordinaryBase=ordinaryLamp.emissiveIntensity,tracker=createOrdnanceMotionTracker();
    tracker.updateOrdnanceMotion(own,root,1,1/60,null,{reducedFlash:true});
    assert.equal(lamp.emissiveIntensity,resolveJettisonClaimBurn(1,-1,10,true,claim.base));
    assert.equal(ordinaryLamp.emissiveIntensity,ordinaryBase);
    tracker.updateOrdnanceMotion(own,root,11,1/60,null,{reducedFlash:true});
    assert.equal(root.userData.jettisonClaimLamp,undefined);assert.equal(lamp.emissiveIntensity,claim.base);
    let disposed=0;lamp.addEventListener('dispose',()=>disposed++);
    scene.remove(root);disposeDetachedObject(root);assert.equal(disposed,1,'private authored lamp dies with the pod');
  }finally{for(const root of roots)root.userData.releaseAuthoredAssetResidency?.('cargo-claim-cleanup');f.close();}
});

test('volatile generic cargo keeps the existing bottle, while explicit recipes keep priority',()=>{
  for(const [i,volatileClass] of ['explosive','corrosive','superdense','cryogenic'].entries()){
    const e=entity(920+i,'cmdty_food',{volatileClass}),before=JSON.stringify(e),root=factory().build(e);
    assert.equal(packagedPropSpec(e),null);assert.equal(root.userData.requestAuthoredUpgrade,undefined);
    assert.ok(root.getObjectByName('VolatilePod_Bottle')?.visible);assert.equal(JSON.stringify(e),before);
    const explicit={...e,data:{...e.data,packagedPropFile:'places/place_cargo_pod_standard.glb'}};
    assert.equal(packagedPropSpec(explicit).file,explicit.data.packagedPropFile);
    const authored={...e,data:{...e.data,authoredPayloadAssetId:'pod_cargo_container'}};
    assert.equal(packagedPropSpec(authored),null);
    assert.equal(factory().build(authored).userData.authoredAssetState,'awaiting-authored-admission');
  }
});

test('claim publication never revives an expired claim or steals the fallback lamp on failure',async()=>{
  for(const fail of [false,true]){
    const f=await fixture(),scene=new THREE.Scene();
    const e=entity(fail?981:980,'cmdty_food',{playerJettisonOrigin:{version:1,ownerId:1},pickupEmbargoUntil:10});
    const root=factory().build(e),previous=root.userData.jettisonClaimLamp;scene.add(root);
    let detachedLamp,disposed=0;
    try{
      const result=await root.userData.requestAuthoredUpgrade(f.renderer,scene,{
        loadAuthoredPart:f.load,
        prepareAuthoredPipelines:async detached=>{
          detachedLamp=material(detached,'Material_Emissive_Cyan');
          assert.notEqual(detachedLamp,previous.material);
          assert.equal(root.userData.jettisonClaimLamp,previous,'preparation must not redirect live animation');
          detachedLamp.addEventListener('dispose',()=>disposed++);
          if(fail)throw new Error('test cargo preparation failure');
          createOrdnanceMotionTracker().updateOrdnanceMotion(e,root,11,1/60,null,{reducedFlash:true});
          assert.equal(root.userData.jettisonClaimLamp,undefined);
          return {skipped:false};
        },
      });
      assert.equal(result,!fail);
      if(fail){
        assert.equal(root.userData.jettisonClaimLamp,previous);
        assert.equal(detachedLamp.userData.spacefaceSharedAsset,false,'abandoned private lamp remains eligible for the paced teardown');
      }
      else{assert.equal(root.userData.jettisonClaimLamp,undefined);assert.equal(disposed,0);}
    }finally{scene.remove(root);disposeDetachedObject(root);f.close();}
  }
});

test('missing generic package keeps the original commodity-colored fallback visible',async()=>{
  const e=entity(950,'cmdty_food'),root=factory().build(e),scene=new THREE.Scene();scene.add(root);
  assert.equal(await root.userData.requestAuthoredUpgrade({},scene,{loadAuthoredPart:async()=>null}),false);
  let visibleFamily=false;root.traverse(o=>{if(o.isMesh&&o.visible&&o.material?.color?.getHexString()===commodityPresentationFor('cmdty_food').color.slice(1))visibleFamily=true;});
  assert.ok(visibleFamily);assert.equal(root.getObjectByName('payload_PackagedBody'),undefined);
});
