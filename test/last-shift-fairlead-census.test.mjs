import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { liveSolidGlbCatalog } from '../src/render/partsLibrary.js';
import { packagedConvexSpec, measurePackagedConvex, projectedTriangleDistance, sampledBoundaryResidual, assertSampledBoundaryContract } from '../scripts/lib/modelTruthPackagedConvex.mjs';
import { LAST_SHIFT_FAIRLEAD_PROXY as proxy } from '../src/data/lastShiftFairleadGeometry.js';
const rows=liveSolidGlbCatalog(),row=rows.find(r=>r.id==='place_last_shift_fairlead');
test('only exact Last Shift packaged runtime authority opts into convex measurement',()=>{
  assert.equal(packagedConvexSpec(row).proxy,proxy);
  for(const r of rows.filter(r=>r!==row))assert.equal(packagedConvexSpec(r),null,r.id);
  for(const change of [{id:'foreign'},{entityRadius:25},{fit:'authored-origin'},{runtimeCollisionAuthority:'foreign'},{colliderKind:'ball'}])
    assert.throws(()=>packagedConvexSpec({...row,...change}),/invalid packaged runtime convex authority/);
});
test('runtime census binds actual package fit and measures 17 convexes separately from 30 fallback strips',async()=>{
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  const result=await measurePackagedConvex(process.cwd(),row,io),e=result.evidence;
  assert.equal(e.nativePartCount,17);assert.equal(e.legacyQueryPrimitiveCount,30);
  assert.ok(e.coverageByLodWu.every(v=>v>0&&v<.05));
  assert.ok(e.faceCentroidCoverageWu>0&&e.faceCentroidCoverageWu<.05);
  assert.ok(e.boundarySampleResidualWu>.3&&e.boundarySampleResidualWu<.4);
  assert.equal(result.evaluated.stickWu,null);assert.equal(result.evaluated.overTolerance,false);
  assert.match(e.boundarySampleMetric,/diagnostic/);
  const saved=JSON.parse(fs.readFileSync('src/data/modelTruthCensus.json','utf8')).rows.find(r=>r.id===row.id);
  assert.equal(saved.collider.id,proxy.id);assert.equal(saved.gameplay.colliderKind,'proxy');assert.equal(saved.proposedSkin,null);
  assert.equal(saved.collider.packagedRuntimeEvidence.sourceGlbSha256,e.sourceGlbSha256);
  assert.equal(saved.collider.packagedRuntimeEvidence.nativePartCount,17);
  assert.equal(saved.collider.stickWu,null);assert.ok(!saved.reasons.includes('collider-gap'));
  console.log('PACKAGED_CONVEX_CENSUS',JSON.stringify({coverageByLodWu:e.coverageByLodWu,faceCentroidCoverageWu:e.faceCentroidCoverageWu,boundarySampleResidualWu:e.boundarySampleResidualWu}));
});
test('projected distance handles triangles and degenerate edges without filling missing space',()=>{
  const a={x:0,z:0},b={x:2,z:0},c={x:0,z:2};
  assert.equal(projectedTriangleDistance({x:.5,z:.5},a,b,c),0);
  assert.ok(projectedTriangleDistance({x:2,z:2},a,b,c)>1);
  assert.equal(projectedTriangleDistance({x:1,z:1},a,b,b),1);
});

test('an inflated proxy cannot pass solely by containing every rendered vertex',()=>{
  const a={x:0,z:0},b={x:1,z:0},c={x:1,z:1},d={x:0,z:1};
  const triangles=[[a,b,c],[a,c,d]];
  const inflated=[{points:[{x:-2,z:-2},{x:3,z:-2},{x:3,z:3},{x:-2,z:3}]}];
  const result=sampledBoundaryResidual(inflated,triangles);
  assert.ok(result.boundarySampleResidualWu>2);
  assert.throws(()=>assertSampledBoundaryContract(result.boundarySampleResidualWu),/exceeds 0.4/);
  assert.doesNotThrow(()=>assertSampledBoundaryContract(.3571));
});
