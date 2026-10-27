// Explicit runtime-owned packaged footprint. This is not an authored-origin
// certificate and never infers or adopts a silhouette collider.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { LAST_SHIFT_FAIRLEAD_GEOMETRY as geometry, LAST_SHIFT_FAIRLEAD_PROXY as proxy } from '../../src/data/lastShiftFairleadGeometry.js';
import { boundsOfPoints, drawFit } from '../../src/data/modelTruthMath.js';

export function packagedConvexSpec(row) {
  if (row.runtimePackagedConvex === undefined) return null;
  if (row.id !== 'place_last_shift_fairlead' || row.runtimePackagedConvex !== proxy.id
    || row.fit !== 'packaged-radius' || row.entityRadius !== 26 || row.colliderKind !== 'proxy'
    || row.runtimeCollisionAuthority !== 'lastShift.physicsBody' || row.runtimeColliderFixed !== true) {
    throw new Error(`${row.id}: invalid packaged runtime convex authority`);
  }
  return { geometry, proxy };
}

export function projectedTriangleDistance(p, a, b, c) {
  const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
  const signs=[cross(a,b,p),cross(b,c,p),cross(c,a,p)];
  if (Math.abs(cross(a,b,c))>1e-10 && (signs.every(v=>v>=-1e-9)||signs.every(v=>v<=1e-9))) return 0;
  return Math.min(...[[a,b],[b,c],[c,a]].map(([a,b])=>{
    const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
  }));
}
const triangleDistance=(p,triangles)=>{
  let distance=Infinity;
  for (const t of triangles) { distance=Math.min(distance,projectedTriangleDistance(p,...t)); if(distance===0)break; }
  return distance;
};
export function sampledBoundaryResidual(parts, rendered) {
  let boundarySampleResidualWu=0,boundarySamples=0;
  for(const part of parts)for(let i=0;i<part.points.length;i++)for(let j=0;j<=12;j++){
    const a=part.points[i],b=part.points[(i+1)%part.points.length];
    boundarySampleResidualWu=Math.max(boundarySampleResidualWu,triangleDistance({x:a.x+(b.x-a.x)*j/12,z:a.z+(b.z-a.z)*j/12},rendered));boundarySamples++;
  }
  return {boundarySampleResidualWu,boundarySamples};
}
export function assertSampledBoundaryContract(residual) {
  // Same bounded bevel residual as the focused physical geometry test. This
  // checks sampled reverse coverage, not a complete boundary-equivalence proof.
  if(!Number.isFinite(residual)||residual>=.4)throw new Error('runtime convex sampled reverse residual exceeds 0.4 WU physical contract');
}
export async function measurePackagedConvex(root, row, io) {
  const spec=packagedConvexSpec(row);
  if (!spec) return null;
  const bytes=readFileSync(resolve(root,geometry.url));
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==geometry.sha256)throw new Error(`${row.id}: runtime package hash mismatch`);
  const doc=await io.read(resolve(root,geometry.url));
  const points=[],byLod=[[],[],[]],triangles=[];
  for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()||[]) {
    const attr=primitive.getAttribute('POSITION'); if(!attr)continue;
    const matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix()),local=[];
    for(let i=0;i<attr.getCount();i++) {
      const v=[];attr.getElement(i,v);const p=new THREE.Vector3(...v).applyMatrix4(matrix);local.push(p);points.push(p);
    }
    const match=/^LOD([012])_/.exec(node.getName());
    if(!match) {
      if(node.getName()==='COLLISION_HULL')continue; // participates in production Box3 fit, not visible coverage
      throw new Error(`${row.id}: unclassified runtime mesh ${node.getName()}`);
    }
    const lod=Number(match[1]);byLod[lod].push(...local);
    if(lod===0){const indices=primitive.getIndices()?.getArray()||local.map((_,i)=>i);
      for(let i=0;i<indices.length;i+=3)triangles.push([local[indices[i]],local[indices[i+1]],local[indices[i+2]]]);}
  }
  if(byLod.some(p=>!p.length))throw new Error(`${row.id}: incomplete runtime LOD evidence`);
  const bounds=boundsOfPoints(points),fit=drawFit(row.fit,bounds,{entityRadius:row.entityRadius});
  if(Math.abs(bounds.center[0]-geometry.center.x)>1e-9 || Math.abs(bounds.center[2]-geometry.center.z)>1e-9
    || Math.abs(fit.scale-geometry.fitScale)>1e-9)throw new Error(`${row.id}: production package fit mismatch`);
  const project=p=>({x:p.x*fit.scale+fit.offset[0],z:p.z*fit.scale+fit.offset[2]});
  const convexPartsWU=proxy.convexParts.map(part=>({id:part.id,points:part.points.map(p=>({x:p.x*26,z:p.z*26}))}));
  const nativeTriangles=convexPartsWU.flatMap(part=>part.points.slice(1,-1).map((p,i)=>[part.points[0],p,part.points[i+2]]));
  const coverageByLodWu=byLod.map(points=>Math.max(...points.map(p=>triangleDistance(project(p),nativeTriangles))));
  const rendered=triangles.map(t=>t.map(project));
  const faceCentroidCoverageWu=Math.max(...rendered.map(t=>triangleDistance({x:t.reduce((s,p)=>s+p.x,0)/3,z:t.reduce((s,p)=>s+p.z,0)/3},nativeTriangles)));
  const {boundarySampleResidualWu,boundarySamples}=sampledBoundaryResidual(convexPartsWU,rendered);
  assertSampledBoundaryContract(boundarySampleResidualWu);
  const coverageWu=Math.max(...coverageByLodWu,faceCentroidCoverageWu);
  return { fit, bounds, collider:{kind:'proxy',id:proxy.id,primitives:[],factor:null},
    evaluated:{coverageWu,stickWu:null,gapWu:coverageWu,overTolerance:coverageWu>.05,throatSealed:false},
    evidence:{sourceGlbPath:geometry.url,sourceGlbSha256:hash,fit,convexPartsWU,nativePartCount:convexPartsWU.length,
      legacyQueryPrimitiveCount:proxy.primitives.length,coverageByLodWu,faceCentroidCoverageWu,
      coverageMetric:'all-LOD-visible-vertices-to-runtime-XZ-convex-union',boundarySampleResidualWu,boundarySamples,boundarySampleLimitWu:.4,
      boundarySampleMetric:'13 samples per convex-part edge to LOD0 projected triangle union; diagnostic, not a surface-equivalence proof'},
  };
}
