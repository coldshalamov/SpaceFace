import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3, Ray, DoubleSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ORCHARD_GEOMETRY as G } from '../src/data/anvilOrchardBody.js';

const document=await new NodeIO().read(G.sourceGlbPath);
const nodes=document.getRoot().listNodes();
const ancestry=node=>{const result=[];for(let p=node;p;p=p.getParentNode())result.push(p);return result;};
function triangles(selected) {
  const vertices=[];
  for(const node of selected) {
    const matrix=new Matrix4().fromArray(node.getWorldMatrix());
    for(const primitive of node.getMesh()?.listPrimitives()||[]) {
      const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices();
      assert.equal(primitive.getMode(),4,'only actual rendered triangles');
      const count=indices?.getCount()??positions.getCount();
      for(let i=0;i<count;i++) {
        const index=indices?indices.getElement(i,[])[0]:i;
        const v=new Vector3().fromArray(positions.getElement(index,[])).applyMatrix4(matrix);
        vertices.push(v.x,v.y,v.z);
      }
    }
  }
  assert.ok(vertices.length);
  const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(vertices,3));
  geometry.boundsTree=new MeshBVH(geometry);
  return geometry;
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function projectedTriangleRadius(a,b,c) {
  const zero=[0,0],signs=[cross(a,b,zero),cross(b,c,zero),cross(c,a,zero)];
  if((signs.every(x=>x>=0)||signs.every(x=>x<=0))&&Math.abs(cross(a,b,c))>1e-15)return 0;
  let result=Infinity;
  for(const [p,q] of [[a,b],[b,c],[c,a]]) {
    const dx=q[0]-p[0],dz=q[1]-p[1],length=dx*dx+dz*dz;
    const t=length?Math.max(0,Math.min(1,-(p[0]*dx+p[1]*dz)/length)):0;
    result=Math.min(result,Math.hypot(p[0]+t*dx,p[1]+t*dz));
  }
  return result;
}
// Clip actual 3D triangles by an XZ half-plane without adding synthetic cap faces.
function clip3(poly,axis,bound,sign) {
  const out=[];
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound);
    if(da>=0)out.push(a);
    if((da>=0)!==(db>=0)) {const f=da/(da-db);out.push(a.map((v,k)=>v+f*(b[k]-v)));}
  }
  return out;
}
function boxFragment(poly,box) {
  for(const [axis,bound,sign] of [[0,box.minX,1],[0,box.maxX,-1],[2,box.minZ,1],[2,box.maxZ,-1]]) {
    if(!poly.length)break;poly=clip3(poly,axis,bound,sign);
  }
  return poly;
}
function minimumRotatingX(x,z,angle) {
  const lo=Math.min(0,angle),hi=Math.max(0,angle),angles=[lo,hi],phase=Math.atan2(z,x);
  for(let k=-2;k<=2;k++)if(phase+k*Math.PI>=lo&&phase+k*Math.PI<=hi)angles.push(phase+k*Math.PI);
  return Math.min(...angles.map(a=>x*Math.cos(a)+z*Math.sin(a)));
}
const triangleRows=geometry=> {
  const pos=geometry.getAttribute('position'),idx=geometry.index,rows=[];
  for(let i=0;i<idx.count;i+=3)rows.push([0,1,2].map(j=>{const k=idx.getX(i+j);return [pos.getX(k),pos.getY(k),pos.getZ(k)];}));
  return rows;
};
const SOURCE_ENVELOPE_RESERVE=.025;
function pointPartDistance(v,part) {
  const p=[v[0],v[2]],poly=part.points;
  if(poly.every((a,i)=>cross(a,poly[(i+1)%poly.length],p)>=0))return 0;
  let result=Infinity;
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const f=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));
    result=Math.min(result,Math.hypot(p[0]-a[0]-f*dx,p[1]-a[1]-f*dz));
  }
  return result;
}
function assertCoveredTriangles(rows,parts,label) {
  const bounded=parts.map(part=>({part,minX:Math.min(...part.points.map(p=>p[0]))-SOURCE_ENVELOPE_RESERVE,
    maxX:Math.max(...part.points.map(p=>p[0]))+SOURCE_ENVELOPE_RESERVE,
    minZ:Math.min(...part.points.map(p=>p[1]))-SOURCE_ENVELOPE_RESERVE,
    maxZ:Math.max(...part.points.map(p=>p[1]))+SOURCE_ENVELOPE_RESERVE}));
  for(const row of rows)assert.ok(bounded.some(b=>row.every(v=>v[0]>=b.minX&&v[0]<=b.maxX&&v[2]>=b.minZ&&v[2]<=b.maxZ)
    &&row.every(v=>pointPartDistance(v,b.part)<=SOURCE_ENVELOPE_RESERVE)),`${label}: source triangle leaves every individual convex envelope`);
  // A convex polygon expanded by a Euclidean ball is convex. Covering all three
  // vertices by the SAME part's expansion covers the entire actual triangle.
}
for(const level of [0,1,2])test(`decoded LOD${level} has real captive sleeve bores and continuous three-dimensional bearing material clearance`,t=>{
  const atLevel=nodes.filter(n=>n.getName().startsWith(`LOD${level}_`)&&n.getMesh());
  const fixed=triangles(atLevel.filter(n=>!ancestry(n).some(p=>p.getName().startsWith('MOTION_'))));
  const fixedRows=triangleRows(fixed);
  assertCoveredTriangles(fixedRows,G.parts.filter(p=>!p.moving),`LOD${level} fixed`);
  let overall=Infinity;
  for(const rig of G.rigs) {
    const moving=triangles(atLevel.filter(n=>ancestry(n).some(p=>p.getName()===rig.node)));
    const rows=triangleRows(moving),pos=moving.getAttribute('position');
    assertCoveredTriangles(rows,[G.parts.find(p=>p.id===rig.partId)],rig.id);
    let bore=Infinity,minY=Infinity,maxY=-Infinity,minX=Infinity;
    for(let i=0;i<pos.count;i++) {
      minY=Math.min(minY,pos.getY(i));maxY=Math.max(maxY,pos.getY(i));
      minX=Math.min(minX,rig.pivot.x+minimumRotatingX(pos.getX(i)-rig.pivot.x,pos.getZ(i)-rig.pivot.z,rig.signedOpenRadians));
    }
    for(const row of rows)bore=Math.min(bore,projectedTriangleRadius(...row.map(v=>[v[0]-rig.pivot.x,v[2]-rig.pivot.z])));
    // No material triangle may bridge the bore. This catches the old solid hub,
    // including containment cases that a surface intersection test would miss.
    assert.ok(bore>.27,`${rig.id} actual decoded open bore radius ${bore}`);
    const domain=G.bearingDomains.find(d=>d.id===rig.bearingDomainId);
    assert.ok(domain);let count=0,minimum=Infinity;
    // Extend the material proof beyond the native domain by more than the
    // measured per-triangle envelope reserve. Any remaining source point's
    // nearest proxy point must then lie outside the native bearing domain.
    const box={minX:domain.planarBox.minX-.03,maxX:domain.planarBox.maxX+.03,
      minZ:domain.planarBox.minZ-.03,maxZ:domain.planarBox.maxZ+.03};
    for(const row of fixedRows) {
      const fragment=boxFragment(row,box);if(fragment.length<3)continue;
      const ys=fragment.map(v=>v[1]),xs=fragment.map(v=>v[0]);
      const radius=Math.max(...fragment.map(v=>Math.hypot(v[0]-rig.pivot.x,v[2]-rig.pivot.z)));
      // Each actual fixed surface fragment must have a separating radial or
      // axial interval, or lie behind the analytic full-arc X support. Rotation
      // preserves the bore and Y bounds. These inequalities cover EVERY angle,
      // not just sampled poses. Outside this exact box the separate source
      // proxy/coverage test certifies the complete geometry with a strict gap.
      const gap=Math.max(minY-Math.max(...ys),Math.min(...ys)-maxY,minX-Math.max(...xs),bore-radius)-.0001;
      assert.ok(gap>.04,`${rig.id} actual material fragment gap ${gap}: ${JSON.stringify(fragment)}`);
      minimum=Math.min(minimum,gap);count++;
    }
    assert.ok(count>0,`${rig.id}: real bearing material was measured`);
    // Decoded fixed-material winding confirms the lowered support and retained
    // pin exist, including their overlap at the load path. Merely adding an
    // empty bore or detached decorative caps cannot satisfy these probes.
    const direction=new Vector3(.713,.391,.582).normalize();
    const probes=[[rig.pivot.x-1.21,-1.1,rig.pivot.z],[rig.pivot.x-.6,-1.1,rig.pivot.z],
      [rig.pivot.x,-1.1,rig.pivot.z],[rig.pivot.x,0,rig.pivot.z],
      [rig.pivot.x+.30,1.05,rig.pivot.z],[rig.pivot.x+.30,-.95,rig.pivot.z]];
    for(const p of probes) {
      const hits=fixed.boundsTree.raycast(new Ray(new Vector3(...p),direction),DoubleSide);
      const winding=hits.reduce((sum,h)=>sum+(h.face.normal.dot(direction)>0?1:-1),0);
      assert.ok(winding>0,`${rig.id}: actual fixed support missing at ${p}`);
    }
    // The pin must terminate INSIDE its retaining cap. Near-coincident top
    // faces quantized to one plane in v6, producing a dark/z-fighting disk.
    const capHits=fixed.boundsTree.raycast(new Ray(new Vector3(rig.pivot.x+.10,2,rig.pivot.z+.037),new Vector3(0,-1,0)),DoubleSide)
      .filter(h=>h.point.y>.8).sort((a,b)=>b.point.y-a.point.y);
    assert.ok(capHits.length>=2,`${rig.id}: actual cap and retained pin surfaces`);
    assert.ok(capHits[0].point.y-capHits[1].point.y>.07,`${rig.id}: coincident pin/cap exterior faces`);
    overall=Math.min(overall,minimum);
    t.diagnostic(`${rig.id}: decoded bore ${bore.toFixed(6)}, analytic full-arc material gap ${minimum.toFixed(6)} WU`);
    moving.dispose();
  }
  fixed.dispose();
  t.diagnostic(`LOD${level} minimum continuous bearing material clearance: ${overall.toFixed(6)} WU`);
});
