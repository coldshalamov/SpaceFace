import * as THREE from 'three';
import { SweptSurfaceBatch } from './sweptSurfaceBatch.js';
import { weaponSignature } from './catalog.js';
import { sampleDischargeLifecycle, sampleImpactLifecycle } from './effectLifecycle.js';

export const DISCHARGE_CAPACITY = 48;

/** Source events (muzzle ignition) and contact events (impact flash) share one retained pool so
 *  the weapon surface language has exactly one owner, one material and one admission budget. */
export const SURFACE_ROLE = Object.freeze({ SOURCE: 0, IMPACT: 1 });
export const IMPACT_KIND = Object.freeze({ HULL: 0, SHIELD: 1 });

const PALE = new THREE.Color(0xb9f4ff);
const BRASS = new THREE.Color(0xffc17a);
const VIOLET = new THREE.Color(0xc29aff);
const THERMAL = new THREE.Color(0xffb066);
const SHIELD_CYAN = new THREE.Color(0x9fe8ff);

/**
 * Impact beats are parameter tables, not tints: family changes blade count, fan angle, reach
 * and ring proportions, so a kinetic spall fan cannot read as a recoloured coherent slit.
 * `ribs` adds crossing panel seams (shield contact); hull gouges leave them off.
 */
const IMPACT_BEATS = Object.freeze({
  kinetic: Object.freeze({ style: 3, color: BRASS, blades: 3, spread: 0.46, reach: 1.0, bladeWidth: 0.24, ring: 0.85, ringWidth: 0.30, ribs: 0 }),
  coherent: Object.freeze({ style: 4, color: PALE, blades: 2, spread: 0.18, reach: 1.45, bladeWidth: 0.15, ring: 0.60, ringWidth: 0.13, ribs: 0 }),
  propulsion: Object.freeze({ style: 1, color: THERMAL, blades: 3, spread: 0.60, reach: 0.80, bladeWidth: 0.30, ring: 1.05, ringWidth: 0.36, ribs: 0 }),
  induction: Object.freeze({ style: 4, color: VIOLET, blades: 4, spread: 0.66, reach: 1.05, bladeWidth: 0.19, ring: 0.72, ringWidth: 0.15, ribs: 2 }),
  metric: Object.freeze({ style: 1, color: SHIELD_CYAN, blades: 3, spread: 0.52, reach: 0.90, bladeWidth: 0.24, ring: 1.00, ringWidth: 0.30, ribs: 2 }),
});
const DEFAULT_BEAT = IMPACT_BEATS.kinetic;

/** Deterministic per-instance salt so extents never end on one shared plane (B18). */
function salt(seed, k) {
  const x = Math.sin(seed * 91.7 + k * 47.3) * 43758.5453;
  return x - Math.floor(x);
}

function impactBeat(variant) {
  const signature = weaponSignature(variant);
  const beat = signature ? IMPACT_BEATS[signature.family] : null;
  return beat || DEFAULT_BEAT;
}

/** Source-only weapon geometry plus contact ignition. Existing flight, casings, contacts,
 *  scorch and light pools remain their own owners. */
export class WeaponDischargePool {
  constructor(scene,{capacity=DISCHARGE_CAPACITY}={}){
    this.batch=new SweptSurfaceBatch(scene,{capacity:capacity*8,name:'SF_WeaponDischargeSurfaces'});
    this.mesh=this.batch.mesh;this.time=0;this.sequence=0;this.disposed=false;this.dropped=0;
    this.slots=Array.from({length:capacity},()=>({
      alive:false,role:SURFACE_ROLE.SOURCE,kind:IMPACT_KIND.HULL,
      age:0,life:0,x:0,y:0,z:0,angle:0,pitch:0,width:0,length:0,opacity:1,
      source:null,variant:null,ownerId:null,targetId:null,attached:false,slant:0,
      tr:1,tg:1,tb:1,priority:0,seed:0,
    }));
    this.descriptor=new Float32Array(24);
    this.envelope={length:1,width:1,opacity:1};
    this.color=BRASS;
    // Impact tint scratch: never mutate the shared family constants through `this.color`.
    this.impactTint=new THREE.Color();
    this.style=0;
  }
  spawn(recipe,pose,ownerId,flash,priority=0.45){
    if(this.disposed)return false;
    const signature=weaponSignature(recipe?.variant);
    // An unregistered variant still gets a designed source beat; the migrated route has no
    // card fallback to keep, so a missing signature must not silently delete the muzzle.
    const source=signature?signature.source:'machined-burst';
    // Coalesce rapid same-owner source shots; no additive pileup into a glowing ball.
    let slot=null;
    for(const s of this.slots)if(s.alive&&s.role===SURFACE_ROLE.SOURCE&&s.ownerId===ownerId&&ownerId!=null&&s.variant===recipe.variant){slot=s;break;}
    if(!slot)for(const s of this.slots)if(!s.alive){slot=s;break;}
    if(!slot){
      // Decorative enemy sources may be dropped. Never displace a live player cue with one.
      for(const s of this.slots)if(s.priority<=priority&&(!slot||s.age/s.life>slot.age/slot.life))slot=s;
    }
    if(!slot){this.dropped++;return true;} // saturating the pool is handled, not a license to stack cards
    slot.alive=true;slot.role=SURFACE_ROLE.SOURCE;slot.age=0;slot.life=Math.max(.035,flash.life);
    slot.x=pose.x;slot.y=pose.y;slot.z=pose.z;slot.angle=Math.atan2(pose.az,pose.ax);
    slot.pitch=Math.atan2(pose.ay||0,Math.hypot(pose.ax,pose.az));
    slot.width=Math.max(.55,flash.size0);slot.length=Math.max(2.8,flash.size1*2.1);
    slot.opacity=Math.min(1,flash.opacity0/1.35);slot.source=source;slot.variant=recipe.variant;
    slot.ownerId=ownerId;slot.priority=priority;slot.seed=(this.sequence++%17)/17;
    return true;
  }
  /**
   * Contact ignition: contact slit, family spall fan and a partial pressure ring. `pose` carries
   * the contact axis (outward normal) and, when attached, target-local coordinates that the
   * resolver re-lifts every frame. Reduced-flash/flash-scale already arrive through `flash`.
   */
  spawnImpact(pose,kind,variant,flash,priority=0.45){
    if(this.disposed)return false;
    let slot=null;
    for(const s of this.slots)if(!s.alive){slot=s;break;}
    if(!slot){
      for(const s of this.slots)if(s.priority<=priority&&(!slot||s.age/s.life>slot.age/slot.life))slot=s;
    }
    if(!slot){this.dropped++;return false;}
    slot.alive=true;slot.role=SURFACE_ROLE.IMPACT;slot.kind=kind;
    slot.age=0;slot.life=Math.max(.06,flash.life);
    slot.x=pose.x;slot.y=pose.y;slot.z=pose.z;
    slot.angle=Math.atan2(pose.az,pose.ax);
    slot.pitch=Math.atan2(pose.ay||0,Math.hypot(pose.ax,pose.az));
    slot.width=Math.max(.6,flash.size0);slot.length=Math.max(1.6,flash.size1*1.8);
    slot.opacity=Math.min(1,flash.opacity0/1.2);
    slot.source=null;slot.variant=variant;
    slot.targetId=pose.targetId!=null?pose.targetId:null;
    slot.attached=pose.attached===true;
    slot.slant=Number.isFinite(pose.slant)?pose.slant:0;
    slot.tr=Number.isFinite(flash.r)?flash.r:1;
    slot.tg=Number.isFinite(flash.g)?flash.g:1;
    slot.tb=Number.isFinite(flash.b)?flash.b:1;
    slot.ownerId=null;slot.priority=priority;slot.seed=(this.sequence++%17)/17;
    return true;
  }
  _strip(s,a0,a1,r0,r1,width,type=1,offset=0,lift=0,frontMode=0,phase=-1){
    const d=this.descriptor,c=this.color;
    const ca=Math.cos(s.angle),sa=Math.sin(s.angle);
    d[0]=s.x-sa*offset;d[1]=s.y;d[2]=s.z+ca*offset;d[3]=s.angle;
    d[4]=type;d[5]=a0;d[6]=a1;d[7]=r0;d[8]=r1;d[9]=width;d[10]=lift;d[11]=0;
    d[12]=c.r;d[13]=c.g;d[14]=c.b;d[15]=this.opacity;
    d[16]=0;d[17]=phase>=0?phase:s.seed;d[18]=frontMode;d[19]=this.style;
    d[20]=1;d[21]=1;d[22]=1;d[23]=s.pitch;
    this.batch.add(d);
  }
  _sourceStrips(s,w,length){
    this.style=3;this.color=BRASS;
    if(s.source==='machined-burst'){
      const spread=s.variant==='flak'?.27:.12;
      this._strip(s,-spread,0,.1,length*.86,w*.21);
      this._strip(s,spread*.7,0,.05,length,w*.29);
      this._strip(s,spread*1.5,0,.1,length*.65,w*.14);
      this._strip(s,-1.17,0,.08,w*1.95,w*.19);
      this._strip(s,1.06,0,.08,w*1.57,w*.24);
      this._strip(s,.04,0,.1,length*1.07,w*.09);
    }else if(s.source==='rail-shear'){
      this.color=PALE;
      this._strip(s,0,0,0,length*1.8,w*.15);
      this._strip(s,0,0,.1,length*.84,w*.08,1,w*.29);
      this._strip(s,0,0,.1,length*.84,w*.08,1,-w*.29);
      this.color=BRASS;
      this._strip(s,-1.44,0,0,w*2.0,w*.16);
      this._strip(s,1.44,0,0,w*2.0,w*.16);
    }else if(s.source==='split-aperture'){
      this.style=4;this.color=PALE;
      this._strip(s,-1.12,-.12,w*.72,w*.72,w*.16,0);
      this._strip(s,.12,1.12,w*.72,w*.72,w*.16,0);
      this._strip(s,0,0,w*.18,length,w*.14,1,w*.27);
      this._strip(s,0,0,w*.18,length*.88,w*.14,1,-w*.27);
      this._strip(s,0,0,w*.6,length*.78,w*.07);
    }else if(s.source==='thermal-lobes'){
      this.style=0;
      for(let j=0;j<3;j++)this._strip(s,(j-1)*.2,(j-1)*.4,.05,length*(.65+j*.12),w*(.36-j*.055),0,0,w*.2);
    }else if(s.source==='circuit-fork'){
      this.style=4;this.color=VIOLET;
      for(let j=0;j<3;j++){
        const a=(j-1)*.53;
        this._strip(s,a,0,.05,length*.58,w*.15);
        this._strip(s,a+.21,0,length*.50,length*.85,w*.12);
      }
    }else if(s.source==='staged-launch'){
      // Eject first: material is thrown back out of the tube as a hard bowl while the motor
      // lights forward. No soft smoke card, no single plume cone.
      this.style=1;this.color=THERMAL;
      this._strip(s,-1.35,1.35,w*.35,w*1.25,w*.4,0);
      this.style=0;this.color=PALE;
      this._strip(s,-.06,0,-w*1.1,-w*2.4,w*.16);
      this._strip(s,.05,0,.1,length*.55,w*.13);
      this.style=3;this.color=BRASS;
      this._strip(s,-.5,0,.05,length*.28,w*.12);
      this._strip(s,.62,0,.05,length*.22,w*.09);
    }else if(s.source==='heavy-launch'){
      this.style=1;this.color=THERMAL;
      this._strip(s,-1.5,1.5,w*.3,w*1.6,w*.5,0);
      this._strip(s,-.5,.4,w*.7,w*.7,w*.22,0);
      this.style=0;this.color=PALE;
      this._strip(s,.02,0,.12,length*.72,w*.11);
      this._strip(s,-.1,0,-w*1.4,-w*3.1,w*.2);
      this.style=3;this.color=BRASS;
      this._strip(s,-.7,0,.05,length*.34,w*.14);
      this._strip(s,.8,0,.05,length*.26,w*.1);
    }else if(s.source==='latched-aperture'){
      // Coherent: two parallel jaws bracket one long collimated core; the latch ring is the
      // only closed shape, and it never becomes a glowing ball.
      this.style=4;this.color=PALE;
      this._strip(s,0,0,.05,length*1.45,w*.085);
      this._strip(s,0,0,w*.25,length*.9,w*.06,1,w*.34);
      this._strip(s,0,0,w*.25,length*.9,w*.06,1,-w*.34);
      this._strip(s,Math.PI*.5,0,w*.4,w*.4,w*.1,0);
      this.style=0;
      this._strip(s,0,0,.04,length*.5,w*.14);
    }else if(s.source==='shaped-deploy'){
      // Metric: outward pressure bowls and rails, never inward suction.
      this.style=1;this.color=SHIELD_CYAN;
      this._strip(s,-1.2,1.2,w*.4,w*1.45,w*.34,0);
      this._strip(s,-.55,.55,w*.9,w*1.05,w*.16,0);
      this.style=0;this.color=PALE;
      this._strip(s,-.22,0,.1,length*.42,w*.12);
      this._strip(s,.26,0,.1,length*.36,w*.1);
      this.style=3;this.color=BRASS;
      this._strip(s,0,0,.05,length*.2,w*.09);
    }else{
      // Defensive default: one hard kernel, never a soft card.
      this._strip(s,0,0,.08,length*.7,w*.18);
    }
  }
  _impactStrips(s,w,length){
    const beat=impactBeat(s.variant);
    this.style=beat.style;
    this.color=this.impactTint.setRGB(s.tr,s.tg,s.tb);
    const lean=Math.max(-1,Math.min(1,s.slant))*.55;
    const shield=s.kind===IMPACT_KIND.SHIELD;
    // Contact first: one short hard slit exactly at the surface point. It is the sharp impulse;
    // everything after it is aftermath and must not share its terminal plane.
    this._strip(s,lean*.25,0,.05,length*(beat.style===4?.42:.34),w*(beat.style===4?.10:.15));
    for(let k=0;k<beat.blades;k++){
      const fan=beat.blades===1?0:(k/(beat.blades-1)-.5)*2;
      const reach=(.42+.58*salt(s.seed,k))*beat.reach;
      const lift=(salt(s.seed,k+5)-.5)*w*.3;
      this._strip(s,lean+fan*beat.spread,0,.10+w*.06,length*reach,
        w*beat.bladeWidth*(.7+.6*salt(s.seed,k+9)),1,0,lift);
    }
    // Partial pressure ring, age-driven outward front — not a full circle, not a bubble.
    const ringWidth=shield?Math.max(beat.ringWidth,.22):beat.ringWidth;
    this._strip(s,-.85+lean*.4,.85+lean*.4,w*beat.ring*.45,w*beat.ring,ringWidth,0,0,0,1,s.age/s.life);
    // Shield contact is a designed panel response: crossed seams over the local patch.
    const ribs=shield?Math.max(2,beat.ribs):beat.ribs;
    for(let r=0;r<ribs;r++){
      const a=lean+Math.PI*.5*(r%2?1:-1)*(.85+.12*salt(s.seed,r+21));
      this._strip(s,a,0,w*.2,w*(1.05+.12*salt(s.seed,r+31)),w*.09,1,0,w*.18*(r%2?1:-1));
    }
  }
  update(dt,resolvePose=null,a11y=null){
    if(this.disposed)return 0;
    const step=Math.max(0,Number.isFinite(dt)?dt:0);
    this.time+=step;
    const reducedMotion=a11y?.id?.includes('motion')===true;
    const reducedFlash=a11y?.id?.includes('flash')===true;
    this.batch.begin(this.time,reducedMotion,reducedFlash);
    let live=0;
    for(const s of this.slots){
      if(!s.alive)continue;
      s.age+=step;
      if(s.age>=s.life){s.alive=false;continue;}
      if(resolvePose){
        const pose=resolvePose(s);
        // A missing/dead owner or detached target must not stick a surface in mid-air.
        if(!pose){s.alive=false;continue;}
        s.x=pose.x;s.y=pose.y;s.z=pose.z;
        s.angle=Math.atan2(pose.az,pose.ax);s.pitch=Math.atan2(pose.ay||0,Math.hypot(pose.ax,pose.az));
      }
      live++;
      if(s.role===SURFACE_ROLE.IMPACT){
        const e=sampleImpactLifecycle(s.age,s.life,reducedMotion,this.envelope);
        this.opacity=s.opacity*e.opacity;
        this._impactStrips(s,s.width*e.width,s.length*e.length);
      }else{
        const e=sampleDischargeLifecycle(s.age,s.life,reducedMotion,this.envelope);
        this.opacity=s.opacity*e.opacity;
        this._sourceStrips(s,s.width*e.width,s.length*e.length);
      }
    }
    this.batch.end();return live;
  }
  reproject(dx,dz){for(const s of this.slots)if(s.alive){s.x+=dx;s.z+=dz;}this.batch.reproject(dx,dz);}
  dispose(){if(this.disposed)return;this.disposed=true;this.batch.dispose();for(const s of this.slots)s.alive=false;}
}
