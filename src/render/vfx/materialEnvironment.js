import { fieldRawAcceleration } from '../../core/fields/fieldKernel.js';
import { FIELD_MAX_ACCEL } from '../../data/fields.js';

// Read-only scene snapshots, never field registration or a second force implementation.
const environments = new WeakMap();
const KINDS = ['well', 'repulsor', 'cone', 'sheet'];
const LIMIT = 8;
const finite = (v, fallback=0) => Number.isFinite(v) ? v : fallback;
function createRecord() {
  return {kind:'well',center:{x:0,z:0},dir:{x:1,z:0},radius:0,strength:0,falloff:1.5,
    halfAngleRad:.56,edgeSoftRad:.12,halfWidth:48,innerRadius:0,innerSoft:0,damping:0};
}
/** Copy the published kernel values once per owner update. toLocal preserves the frame membrane. */
export function publishMaterialFields(scene, state, toLocal=null) {
  if(!scene?.isScene)return;
  const source=state?.fields?.snapshot || state?.fields?.active || [];
  let env=environments.get(scene);
  if(!env && !source.length)return;
  if(!env){env={records:Array.from({length:LIMIT},createRecord),count:0,scratch:{ax:0,az:0},local:{x:0,z:0}};environments.set(scene,env);}
  env.count=0;
  for(let i=0;i<Math.min(32,source.length)&&env.count<LIMIT;i++){
    const f=source[i];
    if(!f || !KINDS.includes(f.kind) || !Number.isFinite(f.center?.x) || !Number.isFinite(f.center?.z)
      || !Number.isFinite(f.radius) || !(f.radius>0) || !Number.isFinite(f.strength) || !(f.strength>0))continue;
    const r=env.records[env.count++];r.kind=f.kind;
    if(toLocal){toLocal(f.center.x,f.center.z,env.local);r.center.x=env.local.x;r.center.z=env.local.z;}
    else {r.center.x=f.center.x;r.center.z=f.center.z;}
    const dx=finite(f.dir?.x,1),dz=finite(f.dir?.z),length=Math.hypot(dx,dz);
    r.dir.x=length>1e-8?dx/length:1;r.dir.z=length>1e-8?dz/length:0;
    r.radius=f.radius;r.strength=f.strength;r.falloff=Math.max(.01,finite(f.falloff,1.5));
    r.halfAngleRad=Math.max(.001,finite(f.halfAngleRad,.56));r.edgeSoftRad=Math.max(0,finite(f.edgeSoftRad,.12));
    r.halfWidth=Math.max(.001,finite(f.halfWidth,48));r.innerRadius=Math.max(0,finite(f.innerRadius));r.innerSoft=Math.max(0,finite(f.innerSoft));
  }
}
export function materialFieldsForScene(scene){return environments.get(scene)||null;}
/** Apply the actual field kernel's acceleration to free matter, in normalized emitter units. */
export function advectMaterialEnvironment(m,s,life,step,env){
  if(!env?.count)return;
  // Bonded work stays on its authoritative endpoint/substrate. This is ambient free matter,
  // not a replacement for the force visualisation or for gameplay projectile physics.
  if(m[0]===7||m[0]===8||m[0]===9||m[0]===12||m[0]===15)return;
  const R=m[6],c=m[4],sn=m[5],wx=m[1]+R*(c*s[0]-sn*s[2]),wz=m[3]+R*(sn*s[0]+c*s[2]);
  let ax=0,az=0;
  for(let i=0;i<env.count;i++){
    const f=env.records[i];
    // A field's own particles already encode its verb; do not apply its force twice.
    if(m[0]<4&&KINDS[m[0]]===f.kind&&Math.abs(m[1]-f.center.x)<.001&&Math.abs(m[3]-f.center.z)<.001)continue;
    const a=fieldRawAcceleration(f,wx,wz,env.scratch);
    ax+=a.ax;az+=a.az;
  }
  const length=Math.hypot(ax,az),cap=length>FIELD_MAX_ACCEL?FIELD_MAX_ACCEL/length:1;
  const scale=step*life/R*cap;
  s[3]+=(c*ax+sn*az)*scale;s[5]+=(-sn*ax+c*az)*scale;
}
