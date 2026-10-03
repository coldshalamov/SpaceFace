import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { createHash } from 'node:crypto';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { RELEASE_MESHOPT_OPTIONS } from '../scripts/lib/releaseMeshoptProfile.mjs';
import { strictClearancePrecisionPolicy, releasePlaceGeometryCompression } from '../scripts/lib/releaseStrictClearancePrecision.mjs';
import { measureWorldSiteAssetChain } from '../scripts/lib/modelTruthWorldSite.mjs';
import { liveSolidGlbCatalog } from '../src/render/partsLibrary.js';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const source=fs.readFileSync(new URL('../assets/ships/parts/places/place_ceres_second_measure.glb',import.meta.url));
const certificate=JSON.parse(source.subarray(20,20+source.readUInt32LE(12))).asset.extras.ceresSecondMeasure;
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});

test('lossless POSITION policy is limited to the exact reviewed shell/clearance contract',()=>{
  assert.equal(strictClearancePrecisionPolicy('place_ceres_second_measure',certificate),'lossless-position');
  for(const id of ['ordinary','place_ceres_second_measure_long_plate','place_ceres_second_measure_crossbeam','place_ceres_second_measure_keel'])
    assert.equal(strictClearancePrecisionPolicy(id,certificate),'standard');
  assert.throws(()=>strictClearancePrecisionPolicy('place_ceres_second_measure',null),/certificate/);
  for(const mutate of [c=>c.part='crossbeam',c=>c.sourceScale=1,c=>c.collision.passages.pop(),c=>c.collision.clearExitRaysWU[2].x[1]=35.1,c=>c.sourceSha256='unknown']){
    const c=structuredClone(certificate);mutate(c);assert.throws(()=>strictClearancePrecisionPolicy('place_ceres_second_measure',c),/certificate/);
  }
});
function triangleDocument(){
  const d=new Document(),buffer=d.createBuffer();
  const position=d.createAccessor().setType('VEC3').setArray(new Float32Array([17.5,-2,39.8,17.5,3,40,18.2,4,40])).setBuffer(buffer);
  const normal=d.createAccessor().setType('VEC3').setArray(new Float32Array([0,1,0,0,1,0,0,1,0])).setBuffer(buffer);
  const uv=d.createAccessor().setType('VEC2').setArray(new Float32Array([0,0,0,1,1,1])).setBuffer(buffer);
  const primitive=d.createPrimitive().setAttribute('POSITION',position).setAttribute('NORMAL',normal).setAttribute('TEXCOORD_0',uv);
  d.createScene().addChild(d.createNode('LOD0_Armor').setMesh(d.createMesh().addPrimitive(primitive)));return d;
}
const positions=d=>{const p=d.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');return Array.from({length:p.getCount()},(_,i)=>p.getElement(i,[]).join(',')).sort();};
test('lossless branch preserves exact source Float32 positions while keeping required meshopt and quantized UVs',async()=>{
  const d=triangleDocument(),before=positions(d);
  await d.transform(releasePlaceGeometryCompression({assetId:'place_ceres_second_measure',certificate,encoder:MeshoptEncoder}));
  const bytes=await io.writeBinary(d),decoded=await io.readBinary(bytes);
  assert.deepEqual(positions(decoded),before);
  const p=decoded.getRoot().listMeshes()[0].listPrimitives()[0];assert.equal(p.getAttribute('POSITION').getComponentType(),5126);
  assert.equal(p.getAttribute('POSITION').getNormalized(),false);assert.equal(p.getAttribute('TEXCOORD_0').getNormalized(),true);
  assert.ok(decoded.getRoot().listExtensionsRequired().some(e=>e.extensionName==='EXT_meshopt_compression'));
});
test('every other asset retains byte-identical existing compression behavior',async()=>{
  const standard=triangleDocument(),policy=triangleDocument();
  await standard.transform(meshopt({encoder:MeshoptEncoder,...RELEASE_MESHOPT_OPTIONS}));
  await policy.transform(releasePlaceGeometryCompression({assetId:'place_ceres_second_measure_crossbeam',certificate:null,encoder:MeshoptEncoder}));
  assert.deepEqual(await io.writeBinary(policy),await io.writeBinary(standard));
});
test('rebuilt actual shell source/release/package preserves every strict passage at every LOD',async()=>{
  const row=liveSolidGlbCatalog().find(r=>r.id==='place_ceres_second_measure');
  const result=await measureWorldSiteAssetChain(root,row);
  for(const a of result.artifacts){assert.equal(a.clearVolumeIntersections,0,a.kind);assert.equal(a.outsideTriangles,0,a.kind);assert.equal(a.overTolerance,false,a.kind);}
  assert.equal(result.authoredClearVolumesPreserved,true);assert.equal(result.overTolerance,false);
});

function exactTriangleHash(document) {
  const triangles=[];
  for(const node of document.getRoot().listNodes()) {
    if(!node.getMesh())continue;
    const m=node.getWorldMatrix();
    for(const primitive of node.getMesh().listPrimitives()) {
      const p=primitive.getAttribute('POSITION'),idx=primitive.getIndices();
      assert.equal(p.getComponentType(),5126,'Every source/release/package POSITION stays Float32');
      const points=Array.from({length:p.getCount()},(_,i)=>{const v=p.getElement(i,[]);return [
        m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]].join(',');});
      const count=idx?.getCount()||p.getCount();
      for(let i=0;i<count;i+=3)triangles.push(node.getName()+':'+[0,1,2].map(j=>points[idx?idx.getScalar(i+j):i+j]).sort().join('|'));
    }
  }
  return createHash('sha256').update(triangles.sort().join('\n')).digest('hex');
}
test('actual shell release and package retain the exact source triangle coordinates at every LOD',async()=>{
  const sourceDoc=await io.readBinary(new Uint8Array(source)),expected=exactTriangleHash(sourceDoc);
  for(const file of ['assets/ships/release/parts/places/place_ceres_second_measure.glb','assets/ships/release/render-packages/ceres-second-measure/render.glb']){
    const doc=await io.read(root+file);assert.equal(exactTriangleHash(doc),expected,file);
  }
});
