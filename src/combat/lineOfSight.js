// Segment-vs-body line-of-sight primitives shared by the PQ-146 observers. Leaf module: reads
// entity geometry and collision proxy manifests only; no journal, physics or state writes.
import { resolveCollisionProxyManifest, proxyWorldPrimitives } from '../data/collisionProxyManifests.js';
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
function pointSegmentDistance(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z, square=dx*dx+dz*dz;
  const t=square ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/square)) : 0;
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
function crossesBox(a,b,p) {
  const c=Math.cos(-p.rot),s=Math.sin(-p.rot);
  const rotate=v=>({x:(v.x-p.x)*c-(v.z-p.z)*s,z:(v.x-p.x)*s+(v.z-p.z)*c});
  const from=rotate(a),to=rotate(b); let low=0,high=1;
  for (const [axis,half] of [['x',p.hx],['z',p.hz]]) {
    const d=to[axis]-from[axis];
    if(Math.abs(d)<1e-9) { if(Math.abs(from[axis])>half)return false;continue; }
    const t1=(-half-from[axis])/d,t2=(half-from[axis])/d;
    low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return false;
  }
  return high>0&&low<1;
}
function segmentIntersects(a,b,c,d) {
  if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)
    ||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.max(c.z,d.z)<Math.min(a.z,b.z))return false;
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(r.x-p.x)*(q.z-p.z);
  return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
}
function primitiveBlocksSegment(a, b, p) {
  if (p.kind === 'circle' && p.r > 0 && pointSegmentDistance(p, a, b) < p.r) return true;
  if (p.kind === 'obb' && crossesBox(a, b, p)) return true;
  if (p.kind === 'capsule') {
    const start = { x: p.ax, z: p.az };
    const end = { x: p.bx, z: p.bz };
    if (segmentIntersects(a, b, start, end)
      || Math.min(
        pointSegmentDistance(start, a, b),
        pointSegmentDistance(end, a, b),
        pointSegmentDistance(a, start, end),
        pointSegmentDistance(b, start, end),
      ) < p.r) return true;
  }
  return false;
}

/** True when the segment crosses the entity's measured skin, or its gameplay ball when it has none. */
export function segmentHitsProxy(entity, a, b) {
  if (!entity || !point(entity.pos) || !point(a) || !point(b)) return false;
  const manifest = resolveCollisionProxyManifest(entity);
  const primitives = manifest
    ? proxyWorldPrimitives(entity, manifest)
    : [{ kind: 'circle', x: entity.pos.x, z: entity.pos.z, r: entity.physicsBody?.radius ?? entity.radius ?? entity.r ?? 0 }];
  for (const primitive of primitives) {
    if (primitiveBlocksSegment(a, b, primitive)) return true;
  }
  return false;
}

/** Uses the same station primitives as physics, preserving real gaps through compound geometry. */
export function witnessLineOfSight(state, observer, destination, ignored = []) {
  if (!point(observer?.pos)||!point(destination))return false;
  for (const entity of state.entities?.values?.() || []) {
    if(!entity?.alive||!entity.collides||entity.id===observer.id||ignored.includes(entity.id)||!point(entity.pos))continue;
    if(!['ship','station','asteroid','planet','wreck','debris'].includes(entity.type) && entity.data?.sensorBlocking!==true)continue;
    if (segmentHitsProxy(entity, observer.pos, destination)) return false;
  }
  return true;
}
