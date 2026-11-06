// Bounded course placement and measured receiver geometry. No motion writers.
import { CERES_WORKFLEET_CONTRACT as CERES } from '../../data/ceresWorkfleet.js';

export const COURSE_CLEARANCE_SHIFTS = Object.freeze([0, 180, -180, 360, -360]);

function pointSegmentDistance(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/Math.max(.0001,dx*dx+dz*dz)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}

/** All candidates obstructed is a refusal, never an occupied fallback. */
export function pickCourseShift(state, def, toWorld) {
  for (const z of COURSE_CLEARANCE_SHIFTS) {
    const clear = def.bodies.every(body => {
      const points=[body.local,...(body.itinerary?.waypoints || [])]
        .map(p=>toWorld({x:p.x,z:p.z+z}));
      if (body.itinerary) points.push(points[1] || points[0]);
      return !(state.entityList || []).some(e => {
        if (!e?.pos || e.alive===false || e.collides===false || (state.playerId!=null && e.id===state.playerId)) return false;
        // Packaged fit specifies max dimension, so the XZ diagonal may exceed
        // entity.radius. The complete itinerary must clear scenery, not just spawn.
        const clearance=Math.SQRT2*(body.radius+(e.radius || 0))+12;
        if (points.length===1) return Math.hypot(e.pos.x-points[0].x,e.pos.z-points[0].z)<clearance;
        return points.slice(1).some((p,i)=>pointSegmentDistance(e.pos,points[i],p)<clearance);
      });
    });
    if (clear) return { x: 0, z };
  }
  return null;
}

export function admissionResult(cohort, def, nativeReady) {
  const completeCohort = cohort instanceof Map && cohort.size === def.bodies.length
    && def.bodies.every(b => cohort.get(b.role)?.alive !== false && !!cohort.get(b.role));
  const ready = completeCohort && [...cohort.values()].every(nativeReady);
  return { status: !completeCohort ? 'failure' : ready ? 'ready' : 'pending',
    ready, pending: completeCohort && !ready, failure: !completeCohort, completeCohort,
    cohort, reason: !completeCohort ? 'incomplete_cohort' : ready ? null : 'native_pending' };
}

/** Same max-dimension fit as fitPackagedGroup; the source uses scale 2. */
export function cradleFit(radius) {
  const a = CERES.assets.cradle;
  const scale = radius * 2 / Math.max(a.dimensions.x, a.dimensions.y, a.dimensions.z);
  return { scale, minX: a.well.x[0]*scale, maxX: a.well.x[1]*scale,
    mouthZ: a.well.z[0]*scale, backZ: a.well.z[1]*scale,
    spineZ: 65*scale, keeperRanges: [[-10*scale,-4*scale],[4*scale,10*scale]] };
}

/** Outside the two central keepers the visible rear spine is the support. */
export function receiverBackZ(bounds, footprint) {
  return bounds.keeperRanges.some(([lo,hi])=>footprint.maxX>=lo && footprint.minX<=hi)
    ? bounds.backZ : bounds.spineZ;
}

export function receiverLocal(body, receiver, pos = body.pos) {
  const c = Math.cos(receiver.rot || 0), s = Math.sin(receiver.rot || 0);
  const x = pos.x-receiver.pos.x, z = pos.z-receiver.pos.z;
  return { x: c*x+s*z, z: -s*x+c*z };
}

/** Conservative complete native compound footprint in receiver coordinates. */
export function receiverFootprint(body, receiver) {
  const center = receiverLocal(body, receiver);
  const angle = (body.rot || 0)-(receiver.rot || 0), c = Math.cos(angle), s = Math.sin(angle);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const include = (x,z,hx=0,hz=hx) => {
    const px = center.x+c*x-s*z, pz = center.z+s*x+c*z;
    minX=Math.min(minX,px-hx); maxX=Math.max(maxX,px+hx);
    minZ=Math.min(minZ,pz-hz); maxZ=Math.max(maxZ,pz+hz);
  };
  const manifest = body.physicsBody?.collisionProxyManifest;
  const radius = body.radius;
  // SG-02 uses compactHull instead of the primitive fallback when available.
  // Keep its vertices so a keeper constrains only the part actually beside it.
  const polygon = manifest?.compactHull?.length >= 3 ? manifest.compactHull.map(p => ({
    x: center.x+c*p.x*radius-s*p.z*radius, z: center.z+s*p.x*radius+c*p.z*radius,
  })) : null;
  for (const p of polygon ? [] : manifest?.primitives || []) {
    if (p.kind === 'capsule') {
      include(p.ax*radius,p.az*radius,p.r*radius);
      include(p.bx*radius,p.bz*radius,p.r*radius);
    } else if (p.kind === 'circle') include(p.x*radius,p.z*radius,p.r*radius);
    else {
      const a = angle+(p.angle || 0), ca=Math.cos(a), sa=Math.sin(a);
      include(p.x*radius,p.z*radius,
        radius*(Math.abs(ca)*p.hx+Math.abs(sa)*p.hz),
        radius*(Math.abs(sa)*p.hx+Math.abs(ca)*p.hz));
    }
  }
  for (const p of polygon || []) {
    minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x);
    minZ=Math.min(minZ,p.z); maxZ=Math.max(maxZ,p.z);
  }
  if (!Number.isFinite(minX)) include(0,0,radius);
  return { minX,maxX,minZ,maxZ,...(polygon ? {polygon} : {}) };
}

function clipAtX(points, x, keepGreater) {
  const out=[];
  for (let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    const insideA=keepGreater ? a.x>=x : a.x<=x,insideB=keepGreater ? b.x>=x : b.x<=x;
    if (insideA) out.push(a);
    if (insideA!==insideB) {
      const t=(x-a.x)/(b.x-a.x);
      out.push({x,z:a.z+t*(b.z-a.z)});
    }
  }
  return out;
}

function keeperDepth(footprint,lo,hi) {
  if (footprint.maxX<lo || footprint.minX>hi) return -Infinity;
  if (!footprint.polygon) return footprint.maxZ;
  return Math.max(-Infinity,...clipAtX(clipAtX(footprint.polygon,lo,true),hi,false).map(p=>p.z));
}

/** Exact authored pockets remain deeper than the two narrow depth keepers. */
export function receiverContainsFootprint(bounds,footprint,tolerance=.08) {
  return footprint.minX>=bounds.minX-tolerance && footprint.maxX<=bounds.maxX+tolerance
    && footprint.minZ>=bounds.mouthZ-tolerance && footprint.maxZ<=bounds.spineZ+tolerance
    && bounds.keeperRanges.every(([lo,hi])=>keeperDepth(footprint,lo,hi)<=bounds.backZ+tolerance);
}

export function receiverSupportGap(bounds,footprint) {
  return Math.max(0,Math.min(bounds.spineZ-footprint.maxZ,
    ...bounds.keeperRanges.map(([lo,hi])=>bounds.backZ-keeperDepth(footprint,lo,hi))));
}

/** Swept open-mouth entry, with the full lateral footprint clear of both rails. */
export function crossedReceiverMouth(before, after, bounds) {
  if (!before || before.maxZ > bounds.mouthZ || after.maxZ <= bounds.mouthZ) return false;
  const t = (bounds.mouthZ-before.maxZ)/(after.maxZ-before.maxZ);
  const minX = before.minX+(after.minX-before.minX)*t;
  const maxX = before.maxX+(after.maxX-before.maxX)*t;
  return minX >= bounds.minX && maxX <= bounds.maxX;
}
