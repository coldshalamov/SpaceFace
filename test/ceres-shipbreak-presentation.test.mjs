import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CERES_SHIPBREAK_FILES, isCeresShipbreakSection } from '../src/render/ceresShipbreakVisuals.js';
import { buildAuthoredPlaceProp, resolvePlaceDrawScale, resolvePlaceFileForEntity, upgradeAuthoredPlaceBoundaryForProbe } from '../src/render/partsLibrary.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { wreckPackagedFile } from '../src/render/visualFactory.js';
const entity = id => ({ id, alive:true, type:id==='place_ceres_second_measure'?'fx':'wreck', radius:65,
  data:{placeId:id,placeScale:2,worldSiteStructural:id!=='place_ceres_second_measure',role:id==='place_ceres_second_measure'?'world_site_root':'world_site_payload'} });

test('Ceres sections select exact authored anatomy and never a generic wreck/canister',()=>{
  for(const [id,file] of Object.entries(CERES_SHIPBREAK_FILES)){
    const e=entity(id);assert.equal(resolvePlaceFileForEntity(e),file);
    if(e.type==='wreck'){
      assert.ok(isCeresShipbreakSection(e));assert.equal(wreckPackagedFile(e),file);
      let calls=0; const boundary=new THREE.Group(); const factory={build:()=>{throw new Error('random wreck fallback');}};
      installVisualOverrides(factory,{authoredPlaceBuilder:()=>{calls++;return boundary;}});
      assert.equal(factory.build(e),boundary);assert.equal(calls,1);
    }
  }
  assert.equal(isCeresShipbreakSection({...entity('place_ceres_second_measure_long_plate'),data:{placeId:'place_dead_hulk',worldSiteStructural:true}}),false);
});

test('all four Ceres assemblies keep source origin and scale2 under the real place composer',async()=>{
  for(const [id,file] of Object.entries(CERES_SHIPBREAK_FILES)){
    const e=entity(id),fallback=new THREE.Group();
    assert.equal(resolvePlaceDrawScale({...e.data,poi:true,placeTargetRadius:900},{targetRadius:900,authoredEnvelope:10,censusScale:999}),2);
    const boundary=buildAuthoredPlaceProp(e,{fallbackRoot:fallback,releaseMode:true});
    const scene=new THREE.Scene();scene.add(boundary);
    const record={assetId:id,url:file,slot:'place',bounds:{size:[180,40,99],center:[7,3,22]},primitives:[],
      markers:[{name:'SOCKET_OriginProof',matrix:new THREE.Matrix4().makeTranslation(-40,0,0),tags:{socket:true,socketRole:'attachment'},userData:{}}]};
    assert.equal(await upgradeAuthoredPlaceBoundaryForProbe(boundary,fallback,e,file,{},scene,{
      releaseMode:true,loadAuthoredPart:async()=>record,prepareAuthoredPipelines:async()=>({skipped:false}),
    }),true);
    scene.updateMatrixWorld(true);
    assert.deepEqual(boundary.getObjectByName('SOCKET_OriginProof').getWorldPosition(new THREE.Vector3()).toArray(),[-80,0,0]);
  }
});

test('all four real source/release/package chains retain structural sockets and isolated instances', async () => {
  const fs = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  const { createRenderPackageLoader } = await import('../src/render/renderPackageLoader.js');
  const { computeRenderPackageContentHash, computeRenderPackageRuntimeHash } = await import('../src/contracts/renderPackage.js');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const read = path => JSON.parse(fs.readFileSync(path));
  const pilots = read('assets/ships/render-packages/pilots.json').pilots;
  const releases = read('assets/ships/release/release_manifest.json').assets;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const [id, file] of Object.entries(CERES_SHIPBREAK_FILES)) {
    const source = fs.readFileSync(`assets/ships/parts/${file}`);
    const row = releases.find(r => r.id === id);
    assert.equal(row.sourceSha256, hash(source));
    const released = fs.readFileSync(row.release);
    const pilot = pilots.find(p => p.releaseAssetId === id);
    assert.equal(pilot.releaseSha256, hash(released));
    const gltf = JSON.parse(released.subarray(20, 20+released.readUInt32LE(12)));
    assert.equal(gltf.asset.extras.ceresSecondMeasure.sourceScale, 2);
    assert.ok(gltf.images.every(i => i.mimeType === 'image/ktx2'));
    assert.ok(gltf.extensionsRequired.includes('EXT_meshopt_compression'));
    const metadata = read(pilot.metadataUrl);
    assert.equal(metadata.contentHash, await computeRenderPackageContentHash(metadata, { digest: hash }));
    assert.equal(metadata.runtimeHash, await computeRenderPackageRuntimeHash(metadata, { digest: hash }));
    const renderPath = `${pilot.outputDir}/render.glb`;
    assert.equal(metadata.render.sha256, hash(fs.readFileSync(renderPath)));
    const doc = await io.read(renderPath);
    const convert = node => {
      const object = node.getMesh()
        ? new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()) : new THREE.Group();
      object.name = node.getName(); object.userData = { ...node.getExtras() };
      if (node.getMesh()) {
        const primitive = node.getMesh().listPrimitives()[0], position = primitive.getAttribute('POSITION');
        object.geometry.setAttribute('position', new THREE.BufferAttribute(position.getArray().slice(), position.getElementSize()));
        const indices = primitive.getIndices();
        if (indices) object.geometry.setIndex(new THREE.BufferAttribute(indices.getArray().slice(), 1));
      }
      object.position.fromArray(node.getTranslation()); object.quaternion.fromArray(node.getRotation()); object.scale.fromArray(node.getScale());
      for (const child of node.listChildren()) object.add(convert(child));
      return object;
    };
    const decoded = new THREE.Group();
    for (const node of doc.getRoot().listScenes()[0].listChildren()) decoded.add(convert(node));
    const loader = createRenderPackageLoader({ loadGlb: async () => ({ scene: decoded }) });
    const loaded = await loader.load(metadata, { expectedContentHash: metadata.contentHash, expectedRuntimeHash: metadata.runtimeHash });
    const first = loaded.createInstance(), second = loaded.createInstance();
    assert.notEqual(first.root, second.root);
    assert.ok(first.root.getObjectByName(id === 'place_ceres_second_measure' ? 'SOCKET_Section_LongPlate' : 'SOCKET_Recovery'));
    first.dispose(); second.dispose(); loader.dispose();
  }
});
