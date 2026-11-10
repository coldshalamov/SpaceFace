import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { liveSolidGlbCatalog } from '../src/render/partsLibrary.js';
import { ceresShipbreakCollisionAuthority } from '../src/data/ceresShipbreakCollision.js';
import { CERES_SHIPBREAK_MANIFEST as manifest } from '../src/data/ceresShipbreak.js';
import { createWorldSiteRecord } from '../src/systems/worldSiteKernel.js';
import { syncWorldSiteMaterialization } from '../src/systems/worldSiteRuntime.js';
import { expandProxyPrimitives, resolveCollisionProxyManifest, proxyScaleFor } from '../src/data/collisionProxyManifests.js';
import { authoredWorldSiteMeasurement, verifyWorldSiteCertificate, triangleOutsideNativeArea,
  triangleHitsClearVolume, triangleEdgesCovered, measureWorldSiteTriangles, measureWorldSiteAssetChain } from '../scripts/lib/modelTruthWorldSite.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const rows = liveSolidGlbCatalog().filter(r => r.id.startsWith('place_ceres_second_measure'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const authorHash = hash(fs.readFileSync(resolve(root, 'tools/blender/forge/ceres_second_measure_kit.py')));
const gltf = row => { const b = fs.readFileSync(resolve(root, `assets/ships/parts/${row.file}`)); return JSON.parse(b.subarray(20,20+b.readUInt32LE(12))); };
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);

test('four live rows map the canonical five shell bodies and three independently owned sections', () => {
  assert.equal(rows.length,4);
  for(const row of rows){
    const m=authoredWorldSiteMeasurement(row),a=m.authority;
    assert.deepEqual(m.fit,{scale:2,offset:[0,0,0]});assert.equal(m.collider.id,null);
    const shell=a.certificatePart==='shell';
    assert.equal(a.bodies.length,shell?5:1);
    assert.equal(m.collider.primitives.length,a.certificatePart==='keel'?1:5);
    assert.ok(a.bodies.every(b=>b.worldRecordId.startsWith(manifest.worldObjectId+(shell?'/collision/':'/payload/'))));
    assert.equal(a.referenceState,shell?'stripped-shell':'released');
    assert.ok(a.bodies.every(b=>b.dynamic===!shell));
  }
  assert.equal(ceresShipbreakCollisionAuthority('ordinary'),null);
  assert.equal(authoredWorldSiteMeasurement({id:'ordinary',fit:'ship'}),null);
});

test('missing, wrong, recentered, inflated or borrowed world-site owners fail closed', () => {
  for(const row of rows){
    for(const mutate of [r=>delete r.collisionAuthority,r=>r.collisionAuthority.manifestId='another-site',
      r=>r.collisionAuthority.bodies[0].worldRecordId='another-owner',r=>r.collisionAuthority.referenceState='mounted',
      r=>r.collisionAuthority.bodies[0].primitives[0].hx+=1,r=>r.placeScale=1,
      r=>r.collisionAuthority.origin[0]=1]){
      const candidate=structuredClone(row);mutate(candidate);assert.throws(()=>authoredWorldSiteMeasurement(candidate),/owner\/origin\/state/);
    }
    assert.throws(()=>ceresShipbreakCollisionAuthority(row.id,null),/owner/);
    assert.throws(()=>ceresShipbreakCollisionAuthority(row.id,{...manifest,id:'wrong'}),/owner/);
  }
  assert.throws(()=>authoredWorldSiteMeasurement({id:'ordinary',colliderKind:'world-site-bodies'}),/owner/);
});

test('certificate verifies source author, exact asset identity, state and native XZ boxes', () => {
  for(const row of rows){
    const m=authoredWorldSiteMeasurement(row),extras=gltf(row).asset.extras,c=extras.ceresSecondMeasure;
    verifyWorldSiteCertificate(c,m,authorHash,extras.spacefaceAsset);
    for(const mutate of [c=>c.sourceSha256='0'.repeat(64),c=>c.part='wrong',c=>c.sourceScale=1,c=>c.states=[],
      c=>c.collision.boxes.pop(),c=>c.collision.boxes[0].sizeWU[0]+=1]){
      const copy=structuredClone(c);mutate(copy);assert.throws(()=>verifyWorldSiteCertificate(copy,m,authorHash,extras.spacefaceAsset));
    }
    assert.throws(()=>verifyWorldSiteCertificate(c,m,authorHash,{partId:'borrowed'}),/certificate/);
  }
});

function materialize(record) {
  const state={entities:new Map(),entityList:[],freeIds:[],simTime:0,tick:0,world:{currentSectorId:'sector_ceres_belt'}};
  const helpers={spawnEntity(spec){const entity={id:state.entities.size+1,alive:true,flags:{},...spec};state.entities.set(entity.id,entity);state.entityList.push(entity);return entity;},removeEntity(id){state.entities.get(id).alive=false;}};
  return syncWorldSiteMaterialization({state,helpers,manifest,record}).entities;
}
test('mapping matches actual production materialization in mounted and released/moved states', () => {
  for(const released of [false,true]){
    const record=createWorldSiteRecord(manifest);
    if(released)for(const p of manifest.payloads){record.payloads[p.id].status='released';record.payloads[p.id].motion={pos:{x:700,z:-900},vel:{x:2,z:1},rot:1.1,angVel:.2};record.components[p.structural.supportComponentId].status='released';}
    const entities=materialize(record);
    const rootEntity=entities.find(e=>e.data.worldRecordId===`${manifest.worldObjectId}/root`);
    assert.ok(!rootEntity.physicsBody,'Visual root is not one pretend shell body');assert.equal(rootEntity.collides,false);
    for(const row of rows){const a=authoredWorldSiteMeasurement(row).authority;
      for(const body of a.bodies){
        const entity=entities.find(e=>e.data.worldRecordId===body.worldRecordId);assert.ok(entity,body.worldRecordId);
        const native=resolveCollisionProxyManifest(entity);assert.equal(native.id,body.colliderId);
        const ps=expandProxyPrimitives(native),scale=proxyScaleFor(entity,native);
        assert.equal(ps.length,body.primitives.length);
        assert.equal(entity.physicsBody.dynamic,a.certificatePart==='shell'?false:released);
        for(let i=0;i<ps.length;i++){
          const expected=body.primitives[i],p=ps[i],shell=a.certificatePart==='shell';
          near(p.x*scale+(shell?entity.pos.x-manifest.placement.pos.x:0),expected.x);
          near(p.z*scale+(shell?entity.pos.z-manifest.placement.pos.z:0),expected.z);
          near(p.hx*scale,expected.hx);near(p.hz*scale,expected.hz);
        }
      }
    }
  }
});

test('actual triangle area/edges catch bridges missed by forward vertex coverage', () => {
  const points=[{x:-2,y:0,z:-1},{x:-2,y:0,z:1},{x:2,y:0,z:0}];
  const boxes=[{x:-2,z:0,hx:.5,hz:2},{x:2,z:0,hx:.5,hz:2}];
  const measured=measureWorldSiteTriangles([{points}],{collider:{primitives:boxes}},[{x:[-1,1],z:[-1,1]}]);
  assert.equal(measured.coverageWu,0);assert.ok(measured.outsideTriangles>0);assert.ok(measured.clearVolumeIntersections>0);assert.equal(measured.overTolerance,true);
  assert.equal(measured.stickWu,null);assert.match(measured.reverseMetric,/not volumetric/);
  assert.ok(triangleOutsideNativeArea(points,boxes)>0);
  const vertical=[{x:-2,y:-1,z:0},{x:-2,y:1,z:0},{x:2,y:0,z:0}];
  assert.equal(triangleOutsideNativeArea(vertical,boxes),0);
  assert.equal(triangleEdgesCovered(vertical,boxes),false);
  assert.equal(triangleHitsClearVolume(vertical,{x:[-1,1],z:[-1,1]}),true);
});

test('all four actual source/release/package triangle chains have hash-bound native owners', async () => {
  for(const row of rows){
    const result=await measureWorldSiteAssetChain(root,row);
    assert.deepEqual(result.artifacts.map(a=>a.kind),['source','release','package']);
    assert.ok(result.sourceCompoundParity);assert.match(result.scope,/No full-corpus or GPU/);
    const source=result.artifacts[0];assert.equal(source.overTolerance,false);assert.equal(source.clearVolumeIntersections,0);
    for(const artifact of result.artifacts){assert.ok(artifact.triangles>0);assert.equal(artifact.outsideTriangles,0);assert.ok(artifact.coverageWu<.05);assert.deepEqual(artifact.reverseProjectionSamples.map(l=>l.lod),[0,1,2]);}
    // The pre-precision shell release really intrudes into the strict keel exit.
    // Do not hide this behind the 0.05 WU forward-distance allowance.
    assert.equal(result.overTolerance,result.artifacts.some(a=>a.clearVolumeIntersections>0));
    if(row.id!=='place_ceres_second_measure')assert.equal(result.overTolerance,false);
  }
});
