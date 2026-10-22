// Authored planar footprint of the torn deck, not a sphere around its small roller.
// Forge XY becomes glTF X,-Z. Coordinates retain the production fit's complete
// package bounds (all LODs), never a separate refit of the deck or its hardware.
export const LAST_SHIFT_FAIRLEAD_GEOMETRY = Object.freeze({
  url: 'assets/ships/release/render-packages/last-shift-fairlead/render.glb',
  sha256: 'a0218fcba0b6bf6bf26be9d6a550b2c7b2b6dacb321488a4377898b047f3ad7a',
  center: Object.freeze({ x: -0.05224645137786865, z: 0.04999995231628418 }),
  fitScale: 6.763143859977272,
});
const G = LAST_SHIFT_FAIRLEAD_GEOMETRY;
const point = ([x, y]) => Object.freeze({ x: (x-G.center.x)*G.fitScale/26, z: (-y-G.center.z)*G.fitScale/26 });
// Pre-bevel deck contour from the authored source. The compiled bevel is checked
// against this footprint in the mesh test; no generic census skin is adopted.
const outline = [[-3.9,0],[-3.3,-1.5],[-2.9,-2.1],[2.5,-2.1],[3.25,-1.82],
  [3.02,-1.3],[3.5,-.72],[3.8,0],[2.95,-.5],[3.15,.12],[2.72,.39],
  [3.55,1.21],[2.6,2],[-2.9,2],[-3.3,1.45]].map(point);
// Ear decomposition, not an origin fan: the torn edge is not star-shaped.
const triangles = [[1,0,14],[14,13,12],[12,11,10],[10,9,8],[8,7,6],[5,4,3],
  [3,2,1],[1,14,12],[8,6,5],[5,3,1],[1,12,10],[10,8,5],[5,1,10]];
const parts = triangles.map((indices,i)=>Object.freeze({ id:`deck-${i}`, points:Object.freeze(indices.map(i=>outline[i])) }));
// The raised buckled lip overhangs the torn edge. The roller and its apparent
// throat sit over solid deck: they do not make a passable hole in the XZ plane.
parts.push(Object.freeze({id:'buckled-lip',points:Object.freeze([[2.65,.72],[3.7,.72],[3.7,1.0],[2.65,1.0]].map(point))}));
// Underside ribs and crossmember reach beyond the tapered plate at its rear corners.
for (const [id,x0,x1,y0,y1] of [
  ['rib-port',-3.3,2.1,-1.745,-1.555], ['rib-starboard',-3.3,2.1,1.455,1.645],
  ['crossmember',-2.94,-2.66,-2,2],
]) parts.push(Object.freeze({id,points:Object.freeze([[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(point))}));
// Legacy query fallback only. Native SG-02 uses the exact convex pieces above.
// Thin strips avoid bringing back the obsolete radius-26 sphere's empty sides.
const primitives=[];
for(let i=0;i<26;i++) {
  const lo=-2.1+i*4.1/26, hi=lo+4.1/26;
  const hits=[];
  for(const y of [lo+1e-8,(lo+hi)/2,hi-1e-8]) {
    for(let j=0;j<outline.length;j++) {
      const a=outline[j],b=outline[(j+1)%outline.length], z=(-y-G.center.z)*G.fitScale/26;
      if(z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z)&&a.z!==b.z) hits.push(a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z));
    }
  }
  if(hits.length) {const min=Math.min(...hits),max=Math.max(...hits),mid=point([0,(lo+hi)/2]);
    primitives.push(Object.freeze({id:`deck-strip-${i}`,kind:'obb',x:(min+max)/2,z:mid.z,hx:(max-min)/2,hz:(hi-lo)*G.fitScale/52,angleDeg:0}));}
}
for(const part of parts.slice(triangles.length)) {
  const p=part.points;
  primitives.push(Object.freeze({id:part.id,kind:'obb',x:(p[0].x+p[2].x)/2,z:(p[0].z+p[2].z)/2,
    hx:(p[2].x-p[0].x)/2,hz:(p[0].z-p[2].z)/2,angleDeg:0}));
}
export const LAST_SHIFT_FAIRLEAD_PROXY = Object.freeze({schemaVersion:1,id:'last-shift:fairlead:deck:v1',
  flags:Object.freeze({collides:true,renderable:false,targetable:false,radarVisible:false}),
  convexParts:Object.freeze(parts),primitives:Object.freeze(primitives)});
