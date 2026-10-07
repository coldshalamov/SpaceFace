// New reconstruction geometry authority. Physical units are authored metres (1 WU/m).
import { LATCH_GEOMETRY as G } from './latchNineGeometry.js';
export const LATCH_RADIUS = 13;
export const LATCH_BODY_ID = 'latch-nine:reconstructed-v1';
const normalized = (id,x,z,hx,hz,angleDeg=0) => ({kind:'obb',id,x:x/LATCH_RADIUS,z:z/LATCH_RADIUS,hx:hx/LATCH_RADIUS,hz:hz/LATCH_RADIUS,angleDeg});
export function latchPaddlePose(index,angle=0){
 const p=G.paddles[index];if(!p||!Number.isFinite(angle))return null;
 const a=Math.max(p.min,Math.min(p.max,angle)),distance=(p.length-.2)/2;
 return normalized('paddle-'+p.id,p.pivot[0]-Math.sin(a)*distance,p.pivot[2]+Math.cos(a)*distance,p.width/2,(p.length+.2)/2,a*180/Math.PI);
}
export function latchCollisionManifest(){return {schemaVersion:1,id:LATCH_BODY_ID,referenceRadius:'radius',primitives:[...G.staticSlabs.map(p=>normalized(p.id,p.center[0],p.center[2],p.size[0]/2,p.size[2]/2)),...G.paddles.map((p,i)=>latchPaddlePose(i))]};}
export function latchBodySpec(){return {schemaVersion:1,dynamic:true,mass:140,inertiaY:3800,radius:LATCH_RADIUS,ccd:true,material:'ship',shape:'compound',collisionProxyManifest:latchCollisionManifest()};}
const CANONICAL_PRIMITIVES=latchCollisionManifest().primitives;
export function isLatchBody(entity){
 const m=entity?.physicsBody?.collisionProxyManifest;
 return entity?.data?.role==='latch_nine' && entity.data.placeId==='place_latch_nine' && entity.physicsBody.dynamic===true && entity.physicsBody.mass>0 && m?.id===LATCH_BODY_ID && Array.isArray(m.primitives) && m.primitives.length===G.staticSlabs.length+3 && m.primitives.every((p,i)=>{const expected=CANONICAL_PRIMITIVES[i];return ['id','kind','x','z','hx','hz','angleDeg'].every(k=>p[k]===expected[k]);});
}
// Exact extrema of every blade corner over the interval: conservative continuous swept OBB.
export function latchPaddleSweep(index,from,to){
 const p=G.paddles[index],lo=Math.min(from,to),hi=Math.max(from,to),points=[];
 for(const x of [-p.width/2,p.width/2])for(const z of [-.2,p.length]){
  const angles=[lo,hi];
  // x(a)=x cos(a)-z sin(a); z(a)=x sin(a)+z cos(a).
  for(const root of [Math.atan2(-z,x),Math.atan2(x,z)])for(let k=-2;k<=2;k++){const a=root+k*Math.PI;if(a>lo&&a<hi)angles.push(a);}
  for(const a of angles)points.push([p.pivot[0]+x*Math.cos(a)-z*Math.sin(a),p.pivot[2]+x*Math.sin(a)+z*Math.cos(a)]);
 }
 const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
 return {x:(minX+maxX)/2,z:(minZ+maxZ)/2,hx:(maxX-minX)/2,hz:(maxZ-minZ)/2};
}
