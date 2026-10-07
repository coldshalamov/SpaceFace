import test from 'node:test';
import assert from 'node:assert/strict';
import { measureBroodSurface } from '../scripts/lib/broodSurfaceMetrics.mjs';

const polygon = (id, vertices) => ({id, kind:'convex', vertices});
const rectangle = (id,x0,x1,z0,z1) => polygon(id,[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]);
const body = primitives => ({collision:{primitives,outlineErrorMaxWU:.12},clearVolumes:[]});
const faces = primitives => primitives.flatMap(p => [0,1,2].flatMap(lod =>
  p.vertices.slice(1,-1).map((v,i) => ({lod,points:[p.vertices[0],v,p.vertices[i+2]].map(([x,z])=>({x,y:0,z}))}))));

test('convex reverse metric preserves separated solids, winding and exact source units', () => {
  const parts=[rectangle('port',-2,2,-2,-1),rectangle('starboard',-2,2,1,2)];
  parts[1].vertices.reverse();const original=structuredClone(parts);
  const anatomy=body(parts);anatomy.clearVolumes=[{id:'gap',min:[-2,-1,-.8],max:[2,1,.8]}];
  const result=measureBroodSurface(anatomy,faces(parts));
  assert.equal(result.ok,true);assert.equal(result.perPrimitive.length,2);
  assert.ok(result.coverage.exposedBoundarySamples>0);
  for(const part of result.perPrimitive) for(const row of part.byLod) assert.ok(row.maxDistanceWU<1e-12);
  assert.deepEqual(parts,original,'measurement must not mutate canonical input');
});

test('convex metric reports an actual missing surface and retained clear-volume crossing', () => {
  const part=rectangle('shell',0,2,0,2), smaller=rectangle('visible',.5,1.5,.5,1.5);
  assert.equal(measureBroodSurface(body([part]),faces([smaller])).ok,false);
  const anatomy=body([part]);anatomy.clearVolumes=[{id:'forbidden',min:[.5,-1,.5],max:[1.5,1,1.5]}];
  assert.ok(measureBroodSurface(anatomy,faces([part])).violations.some(v=>v.kind==='clear-volume-intersection'));
});

test('internal convex pieces have no invented exposed-boundary distance', () => {
  const outer=rectangle('outer',-2,2,-2,2), inner=rectangle('inner',-1,1,-1,1);
  const result=measureBroodSurface(body([outer,inner]),faces([outer]));
  assert.equal(result.ok,true);assert.equal(result.perPrimitive[1].exposedSampleCount,0);
});

test('convex schema fails closed for bad geometry, counts, IDs and missing tiers', () => {
  const invalid=[[],[[0,0],[1,0]],[[0,0],[1,0],[1,0],[0,1]],
    [[0,0],[2,0],[1,.5],[2,2],[0,2]],[[0,0],[1,0],[NaN,1]],
    [[0,0],[1,0],[0,1e7]],Array.from({length:13},(_,i)=>[Math.cos(i),Math.sin(i)])];
  for(const vertices of invalid) assert.throws(()=>measureBroodSurface(body([polygon('bad',vertices)]),[]));
  const one=rectangle('one',0,1,0,1);
  assert.throws(()=>measureBroodSurface(body(Array.from({length:33},(_,i)=>({...one,id:String(i)}))),[]));
  assert.throws(()=>measureBroodSurface(body([one,one]),faces([one])));
  const result=measureBroodSurface(body([one]),faces([one]).filter(f=>f.lod===0));
  assert.deepEqual(result.coverage.missingLods,[1,2]);assert.equal(result.ok,false);
});

test('legacy OBB and capsule measurements remain supported', () => {
  const parts=[{id:'box',kind:'obb',x:0,z:0,hx:1,hz:1,rot:0},
    {id:'capsule',kind:'capsule',ax:-.5,az:0,bx:.5,bz:0,r:.4}];
  assert.equal(measureBroodSurface(body(parts),faces([rectangle('visual',-1,1,-1,1)])).ok,true);
});
