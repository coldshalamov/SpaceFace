import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { StationNightLightLayer, STATION_NIGHT_GAIN, STATION_NIGHT_STATION_CAP } from '../src/render/vfx/stationNightLights.js';
import { vfx } from '../src/render/vfx.js';

// Decode released station geometry on the CPU. The texture loader is a stub because this
// checks actual mesh surfaces, transforms and materials, not texture appearance or a GPU frame.
async function releasedStation() {
  globalThis.self ||= globalThis;
  const buffer = fs.readFileSync(new URL('../assets/ships/release/parts/places/place_station_trade_hub.glb', import.meta.url));
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .setKTX2Loader({load(_url, done) { done(new THREE.Texture()); }})
    .parseAsync(bytes, '')).scene;
}
function find(root, suffix) { let found; root.traverse(n => { if (!found && n.isMesh && n.name === suffix) found=n; }); return found; }
function station(id, root) { return { id, type:'station', alive:true, pos:{x:id*100,z:0}, rot:id*.3, view:{root} }; }

test('released window and berth meshes retain actual geometry and get isolated steady emissive readability', async () => {
  const first=await releasedStation(), second=first.clone(true);
  first.position.set(14, 2, -8); first.rotation.y=.4; first.updateMatrixWorld(true);
  second.position.set(-90, 5, 35); second.rotation.y=-.7; second.updateMatrixWorld(true);
  const a=find(first,'LOD0_Lights_Warm'), b=find(second,'LOD0_Lights_Warm');
  const nav=find(first,'LOD0_HOOK_NAV_PORT'), hull=find(first,'LOD0_Hull');
  assert.ok(a && b && nav && hull,'the actual release contains named solid surfaces');
  a.geometry.computeBoundingBox(); const bounds=a.geometry.boundingBox.clone();
  const transform=a.matrixWorld.clone(), original=a.material, shared=b.material, hullMaterial=hull.material;
  const shaderHook = () => {}; original.onBeforeCompile = shaderHook; original.customProgramCacheKey = () => 'station-hook';
  assert.equal(original,shared,'the test starts with shared authored material');
  const layer=new StationNightLightLayer(), state={simTime:10,world:{currentSectorId:'sector_helios_prime'},settings:{accessibility:{motionReduce:true,flashReduce:true}}};
  const stations=[station(1,first),station(2,second)];
  assert.equal(layer.update(stations,state),2);
  assert.notEqual(a.material,original); assert.notEqual(b.material,shared); assert.notEqual(a.material,b.material);
  assert.equal(a.material.onBeforeCompile, shaderHook); assert.equal(a.material.customProgramCacheKey(), 'station-hook');
  assert.ok(Math.abs(a.material.emissiveIntensity-original.emissiveIntensity*STATION_NIGHT_GAIN)<1e-6);
  assert.equal(hull.material,hullMaterial,'hull materials are untouched');
  assert.ok(a.geometry.boundingBox.equals(bounds)); assert.ok(a.matrixWorld.equals(transform));
  assert.ok(nav.material.emissiveIntensity>3,'authored navigation surface is strengthened');
  const retained=a.material; state.simTime+=.1; layer.update(stations,state);
  assert.equal(a.material,retained,'no frame-by-frame material creation or blink');
  assert.equal(retained.emissiveIntensity, original.emissiveIntensity*STATION_NIGHT_GAIN);
  layer.dispose(); assert.equal(a.material,original);assert.equal(b.material,shared);assert.equal(hull.material,hullMaterial);
});

test('VFX owner updates multiple live station roots, admits later grafts, and restores on dispose', async () => {
  const one=await releasedStation(), two=one.clone(true);
  const target1=find(one,'LOD0_Lights_Warm'), target2=find(two,'LOD0_Lights_Warm');
  const original1=target1.material, original2=target2.material;
  const e1=station(1,one), e2=station(2,two);
  const state={simTime:1,world:{currentSectorId:'sector_helios_prime'},entityList:[e1,e2]};
  const owner=Object.create(vfx); owner.state=state; owner._stationNightLights=null;
  assert.equal(owner._updateStationNightLights(),2);
  assert.notEqual(target1.material,original1); assert.notEqual(target2.material,original2);
  const graft=target1.clone(); graft.name='LOD0_Lights_Cyan'; graft.material=original1; one.add(graft);
  state.simTime+=1.1; owner._updateStationNightLights(); assert.notEqual(graft.material,original1);
  e1.alive=false; owner._updateStationNightLights(); assert.equal(target1.material,original1);assert.equal(graft.material,original1);
  owner._stationNightLightsDispose(); assert.equal(target2.material,original2);
});

test('station admission is bounded and sector changes release old surfaces', async () => {
  const source=await releasedStation(); const stations=[];
  for(let i=0;i<STATION_NIGHT_STATION_CAP+2;i++) stations.push(station(i+1,source.clone(true)));
  const first=find(stations[0].view.root,'LOD0_Lights_Warm');const original=first.material;
  const layer=new StationNightLightLayer(),state={simTime:1,world:{currentSectorId:'a'}};
  assert.equal(layer.update(stations,state),STATION_NIGHT_STATION_CAP);
  assert.equal(layer.slots.size,STATION_NIGHT_STATION_CAP);
  state.world.currentSectorId='b';layer.update([],state);
  assert.equal(layer.slots.size,0); assert.equal(first.material,original);
  layer.dispose();
});
