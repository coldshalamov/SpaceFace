/** Pure XZ geometry. Shared by the live sim and its deterministic encounter bench. */
import { occupantGenerationOf } from '../core/entity.js';
import { RAVEL as C } from '../data/ravel.js';
export const finiteXZ = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export function spoolGoal(index, time, center = C.anchor, out = {}) {
  const a = index * Math.PI * 2 / 3 + time * C.orbitRate;
  out.x = center.x + Math.cos(a) * C.orbitRadius;
  out.z = center.z + Math.sin(a) * C.orbitRadius;
  return out;
}
export function boundedServo(entity, goal, dt, out = {}) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(entity?.vel) || !finiteXZ(goal)
      || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) return null;
  let x = (goal.x - entity.pos.x) * 1.9 - entity.vel.x * 2.3;
  let z = (goal.z - entity.pos.z) * 1.9 - entity.vel.z * 2.3;
  const n = Math.hypot(x, z), scale = n > C.returnAcceleration ? C.returnAcceleration / n : 1;
  out.x = x * scale * dt; out.z = z * scale * dt; return out;
}
/** Conservative swept contact between an expanding annular sector and a moving ship.
 * Solves |p0 + u*dp| = r0 + u*dr analytically: fast motion cannot tunnel through the front.
 * Endpoint and closest-distance candidates include the ship/crest thickness. A teleport larger
 * than the caller's plausible movement budget must be rejected BEFORE this function.
 */
export function sweptWaveHit(previous, current, origin, angle, radius0, radius1, bodyRadius = 0) {
  if (![previous,current,origin].every(finiteXZ)
      || ![angle,radius0,radius1,bodyRadius].every(Number.isFinite) || radius1 < radius0) return false;
  const x = previous.x-origin.x, z=previous.z-origin.z;
  const vx=current.x-previous.x, vz=current.z-previous.z, dr=radius1-radius0;
  const a=vx*vx+vz*vz-dr*dr, b=2*(x*vx+z*vz-radius0*dr), c=x*x+z*z-radius0*radius0;
  const candidates=[0,1];
  if(Math.abs(a)<1e-9) { if(Math.abs(b)>1e-9)candidates.push(-c/b); }
  else { const d=b*b-4*a*c; if(d>=0) {const s=Math.sqrt(d);candidates.push((-b-s)/(2*a),(-b+s)/(2*a));} }
  const vv=vx*vx+vz*vz; if(vv>1e-9)candidates.push(clamp(-(x*vx+z*vz)/vv,0,1));
  const pad=Math.max(0,bodyRadius)+C.waveThickness*0.5;
  for(const u of candidates) {
    if(u<0||u>1)continue;
    const px=x+vx*u,pz=z+vz*u,r=Math.hypot(px,pz),front=radius0+dr*u;
    if(Math.abs(r-front)>pad||r<C.coreRadius)continue;
    const angularPad=Math.asin(clamp(Math.max(0,bodyRadius)/Math.max(r,1),0,1));
    if(Math.abs(wrapAngle(Math.atan2(pz,px)-angle))<=C.waveHalfAngle+angularPad)return true;
  }
  return false;
}
/** The attachment kernel is authoritative; the previous-tick UI tether mirror is not. */
export function playerOwnsSpoolLine(state, spool) {
  const rows=state?.combat?.attachments?.byId;
  const player=state?.entities?.get(state.playerId);
  if(!rows||!spool?.alive||!player?.alive||state.entities.get(spool.id)!==spool)return false;
  for(const key of Object.keys(rows)) {
    const a=rows[key];
    if(a?.state==='active'&&a.ownerId===state.playerId&&a.targetId===spool.id
      &&(a.ownerGeneration==null||a.ownerGeneration===occupantGenerationOf(player))
      &&(a.targetGeneration==null||a.targetGeneration===occupantGenerationOf(spool)))return true;
  }
  return false;
}
