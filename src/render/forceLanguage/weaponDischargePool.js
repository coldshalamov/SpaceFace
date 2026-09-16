import * as THREE from 'three';
import { SweptSurfaceBatch } from './sweptSurfaceBatch.js';
import { weaponSignature } from './catalog.js';
import { sampleDischargeLifecycle } from './effectLifecycle.js';

export const DISCHARGE_CAPACITY=48;
const SUPPORTED=new Set(['machined-burst','rail-shear','split-aperture','thermal-lobes','circuit-fork']);
const PALE=new THREE.Color(0xb9f4ff),BRASS=new THREE.Color(0xffc17a),VIOLET=new THREE.Color(0xc29aff);

/** Source-only weapon geometry. Existing flight, casings, contacts, scorch and light pools remain. */
export class WeaponDischargePool {
  constructor(scene,{capacity=DISCHARGE_CAPACITY}={}){
    this.batch=new SweptSurfaceBatch(scene,{capacity:capacity*8,name:'SF_WeaponDischargeSurfaces'});
    this.mesh=this.batch.mesh;this.time=0;this.sequence=0;this.disposed=false;this.dropped=0;
    this.slots=Array.from({length:capacity},()=>({alive:false,age:0,life:0,x:0,y:0,z:0,angle:0,pitch:0,width:0,length:0,opacity:1,source:null,variant:null,ownerId:null,priority:0,seed:0}));
    this.descriptor=new Float32Array(24);
    this.envelope={length:1,width:1,opacity:1};
  }
  spawn(recipe,pose,ownerId,flash,priority=0.45){
    if(this.disposed)return false;
    const signature=weaponSignature(recipe?.variant);
    if(!signature||!SUPPORTED.has(signature.source))return false;
    // Coalesce rapid same-owner source shots; no additive pileup into a glowing ball.
    let slot=null;
    for(const s of this.slots)if(s.alive&&s.ownerId===ownerId&&ownerId!=null&&s.variant===recipe.variant){slot=s;break;}
    if(!slot)for(const s of this.slots)if(!s.alive){slot=s;break;}
    if(!slot){
      // Decorative enemy sources may be dropped. Never displace a live player cue with one.
      for(const s of this.slots)if(s.priority<=priority&&(!slot||s.age/s.life>slot.age/slot.life))slot=s;
    }
    if(!slot){this.dropped++;return true;} // handled, not permission to stack the old flash fallback
    slot.alive=true;slot.age=0;slot.life=Math.max(.035,flash.life);
    slot.x=pose.x;slot.y=pose.y;slot.z=pose.z;slot.angle=Math.atan2(pose.az,pose.ax);
    slot.pitch=Math.atan2(pose.ay||0,Math.hypot(pose.ax,pose.az));
    slot.width=Math.max(.55,flash.size0);slot.length=Math.max(2.8,flash.size1*2.1);
    slot.opacity=Math.min(1,flash.opacity0/1.35);slot.source=signature.source;slot.variant=recipe.variant;
    slot.ownerId=ownerId;slot.priority=priority;slot.seed=(this.sequence++%17)/17;
    return true;
  }
  _strip(s,a0,a1,r0,r1,width,type=1,offset=0,lift=0){
    const d=this.descriptor,c=this.color;
    const ca=Math.cos(s.angle),sa=Math.sin(s.angle);
    d[0]=s.x-sa*offset;d[1]=s.y;d[2]=s.z+ca*offset;d[3]=s.angle;
    d[4]=type;d[5]=a0;d[6]=a1;d[7]=r0;d[8]=r1;d[9]=width;d[10]=lift;d[11]=0;
    d[12]=c.r;d[13]=c.g;d[14]=c.b;d[15]=this.opacity;
    d[16]=0;d[17]=s.seed;d[18]=0;d[19]=this.style;
    d[20]=1;d[21]=1;d[22]=1;d[23]=s.pitch;
    this.batch.add(d);
  }
  update(dt,poseForOwner=null,a11y=null){
    if(this.disposed)return 0;
    this.time+=Math.max(0,Number.isFinite(dt)?dt:0);
    this.batch.begin(this.time,true,a11y?.id?.includes('flash')===true);
    let live=0;
    for(const s of this.slots){
      if(!s.alive)continue;
      s.age+=Math.max(0,Number.isFinite(dt)?dt:0);
      if(s.age>=s.life){s.alive=false;continue;}
      if(poseForOwner&&s.ownerId!=null){
        const pose=poseForOwner(s.ownerId);
        // A missing/dead owner's muzzle must not stick in mid-air.
        if(!pose){s.alive=false;continue;}
        s.x=pose.x;s.y=pose.y;s.z=pose.z;
        s.angle=Math.atan2(pose.az,pose.ax);s.pitch=Math.atan2(pose.ay||0,Math.hypot(pose.ax,pose.az));
      }
      live++;const age=s.age/s.life;
      const e=sampleDischargeLifecycle(s.age,s.life,a11y?.id?.includes('motion')===true,this.envelope);
      this.opacity=s.opacity*e.opacity;
      const length=s.length*e.length,w=s.width*e.width;
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
      }
    }
    this.batch.end();return live;
  }
  reproject(dx,dz){for(const s of this.slots)if(s.alive){s.x+=dx;s.z+=dz;}this.batch.reproject(dx,dz);}
  dispose(){if(this.disposed)return;this.disposed=true;this.batch.dispose();for(const s of this.slots)s.alive=false;}
}
