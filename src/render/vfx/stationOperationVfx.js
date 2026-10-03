// Receipted station work and validated Ceres job completions. Admission, trajectories,
// and operation lifetimes remain with the native owners; this only composes their matter.
import * as THREE from 'three';
import { SweptSurfaceBatch } from '../forceLanguage/sweptSurfaceBatch.js';
import { ForceParticleFlow } from './forceParticleFlow.js';
import { ActionPrimitiveComposer } from './actionPrimitives.js';
import { writeStationSideEventVfxFrame, createStationSideEventVfxFrameScratch } from '../stationSideEventVfx.js';
import { CERES_JOB_ACTION_VFX_PROFILES } from '../ceresJobActionVfx.js';
import { readFrameOrigin } from '../frameCoordinates.js';
import { shouldDrawTableVfx, tableLookAtDelta, tableVfxDrawWuFromState } from '../tabletopPolicy.js';
import { machineryPicture } from './effectsCause.js';

const STATIONS=6,JOBS=8,TAU=Math.PI*2;
const JOB_PROFILES=[CERES_JOB_ACTION_VFX_PROFILES.oreCut,CERES_JOB_ACTION_VFX_PROFILES.transfer,
  CERES_JOB_ACTION_VFX_PROFILES.survey,CERES_JOB_ACTION_VFX_PROFILES.salvage,
  CERES_JOB_ACTION_VFX_PROFILES.escort,CERES_JOB_ACTION_VFX_PROFILES.patrol];
const COLORS={hauler_dock:0xffbb72,patrol_launch:0x83caff,repair_drone:0x83e9ce,
  cargo_tractor:0x9ddfd0,sensor_sweep:0x8cbcf0,quiet_dock:0x799bae};
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const hash=id=>{let h=2166136261;for(const c of String(id))h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/4294967296;};
const bounds=()=>({body:null,x:0,z:0,cx:0,cz:0,hx:1,hz:1,y:0,rot:0,measured:false});
function slot(){return {alive:false,type:'',key:null,native:null,profile:null,born:0,last:0,seed:0,
  x:0,y:0,z:0,sx:0,sz:0,angle:0,radius:4,hasSource:true,particlePulse:-1,
  station:bounds(),source:bounds(),target:bounds(),frame:createStationSideEventVfxFrameScratch(),
  recipe:{verb:'transfer',primitive:'connection',life:1,continuous:false,color:new THREE.Color()},
  origin:{x:0,z:0},receiver:{x:0,z:0},routeX:0,routeZ:0};}

export class StationOperationVfx {
  constructor(scene,toLocal=null){
    this.batch=new SweptSurfaceBatch(scene,{capacity:160,name:'SF_StationOperations',fieldVolume:true});
    this.mesh=this.batch.mesh;this.particles=new ForceParticleFlow(this.mesh,{capacity:128});
    this.composer=new ActionPrimitiveComposer(this.batch,this.particles,toLocal);
    this.slots=Array.from({length:STATIONS+JOBS},slot);this.time=0;this.live=0;this.disposed=false;
    this.box=new THREE.Box3();this.center=new THREE.Vector3();this.origin={x:0,z:0};
    this.a={x:0,z:0,y:0,angle:0};this.b={x:0,z:0,y:0,angle:0};this.look={x:0,z:0};
    this.particleOptions={reducedMotion:false,reducedFlash:false};
  }
  _measure(body,out,state){
    out.body=body||null;out.x=finite(body?.pos?.x);out.z=finite(body?.pos?.z);out.rot=finite(body?.rot);
    out.cx=out.cz=0;out.hx=out.hz=Math.max(1,finite(body?.radius,3));out.y=0;out.measured=false;
    const root=body?.view?.root;if(!root)return;
    root.updateWorldMatrix(true,true);this.box.setFromObject(root,true);if(this.box.isEmpty())return;
    readFrameOrigin(state,this.origin);this.box.getCenter(this.center);
    out.cx=this.center.x+this.origin.x-out.x;out.cz=this.center.z+this.origin.z-out.z;
    out.hx=Math.max(.1,(this.box.max.x-this.box.min.x)*.5);
    out.hz=Math.max(.1,(this.box.max.z-this.box.min.z)*.5);
    out.y=this.box.min.y+(this.box.max.y-this.box.min.y)*.68;out.measured=true;
  }
  _surface(body,x,z,out,follow=false){
    const e=follow?body.body:null,angle=e?finite(e.rot)-body.rot:0,c=Math.cos(angle),s=Math.sin(angle);
    const cx=(e?.pos?.x??body.x)+c*body.cx-s*body.cz,cz=(e?.pos?.z??body.z)+s*body.cx+c*body.cz;
    let dx=x-cx,dz=z-cz,len=Math.hypot(dx,dz);if(len<1e-5){dx=1;dz=0;len=1;}
    const ax=(c*dx+s*dz)/len,az=(-s*dx+c*dz)/len;
    const tx=Math.abs(ax)>1e-6?body.hx/Math.abs(ax):Infinity;
    const tz=Math.abs(az)>1e-6?body.hz/Math.abs(az):Infinity,d=Math.min(tx,tz);
    out.x=cx+dx/len*(d+.35);out.z=cz+dz/len*(d+.35);out.y=body.y;
    out.angle=angle+(tx<=tz?(ax<0?Math.PI:0):(az<0?-Math.PI/2:Math.PI/2));return out;
  }
  _claim(type,key,native){
    const from=type==='station'?0:STATIONS,to=type==='station'?STATIONS:this.slots.length;
    for(let i=from;i<to;i++)if(this.slots[i].alive&&this.slots[i].key===key)return null;
    for(let i=from;i<to;i++){
      const s=this.slots[i];if(s.alive&&s.native?.alive&&s.native!==native)continue;
      if(!s.alive)this.live++;
      s.alive=true;s.type=type;s.key=key;s.native=native;s.seed=hash(key);s.particlePulse=-1;return s;
    }return null;
  }
  acceptStation(native,state){
    if(this.disposed||!native?.alive||!native.profile||!Object.hasOwn(COLORS,native.kind))return false;
    const s=this._claim('station',native.eventId??native,native);if(!s)return false;
    s.profile=native.profile;s.born=finite(state.simTime)-native.age;s.last=s.born;
    s.recipe.life=native.duration;s.recipe.continuous=true;s.recipe.color.setHex(COLORS[native.kind]);
    this._measure(state.entities?.get?.(native.stationId),s.station,state);
    const mover=state.entities?.get?.(native.entityId);this._measure(mover,s.source,state);
    s.radius=clamp(finite(mover?.radius,4),3,9);return true;
  }
  acceptJob(native,receipt,state){
    const profile=JOB_PROFILES[native?.profileIndex];
    if(this.disposed||!native?.alive||!profile||native.receiptId!==receipt?.receiptId)return false;
    const s=this._claim('job',native.receiptId,native);if(!s)return false;
    s.profile=profile;s.born=finite(state.simTime)-native.age;s.last=s.born;
    s.recipe.life=profile.durationS;s.recipe.continuous=false;s.recipe.color.set(profile.color);
    const actor=state.entities?.get?.(receipt.actorId),target=state.entities?.get?.(receipt.targetId);
    this._measure(actor,s.source,state);this._measure(target,s.target,state);
    // The validator's detached coordinates are the authority. Entity bounds merely move
    // an actor/receiver centre to the visible face while the synchronous receipt is live.
    s.sx=native.sourceX;s.sz=native.sourceZ;s.x=native.targetX;s.z=native.targetZ;
    s.routeX=native.routeX;s.routeZ=native.routeZ;s.radius=clamp(finite(actor?.radius,5),3,8);
    if(actor){this._surface(s.source,s.x,s.z,this.a);s.sx=this.a.x;s.sz=this.a.z;}
    s.y=Math.max(s.source.y,s.target.y);
    if(target){this._surface(s.target,s.sx,s.sz,this.a);s.x=this.a.x;s.z=this.a.z;s.angle=this.a.angle;}
    else s.angle=Math.atan2(s.z-s.sz,s.x-s.sx);
    s.origin.x=s.sx;s.origin.z=s.sz;s.receiver.x=s.x;s.receiver.z=s.z;return true;
  }
  _visible(s,state){
    const player=state.entities?.get?.(state.playerId);if(!point(player?.pos))return true;
    tableLookAtDelta(state,player.pos,s,this.look);
    return shouldDrawTableVfx(this.look.x,this.look.z,tableVfxDrawWuFromState(state));
  }
  _connection(s,x,z,tx,tz,width,alpha,feed,cutoff,heat=1){
    const len=Math.hypot(tx-x,tz-z);if(len<.2)return;
    const angle=Math.atan2(tz-z,tx-x),age=Math.max(0,this.time-s.born),p=this.composer;
    for(let side=-1;side<=1;side+=2)p.piece(2,x,z,angle,0,len,width,width*.6,width*.18,0,side,side*2,
      alpha,feed,cutoff+(side+1)*.04,heat);
    const at=this.particleOptions.reducedMotion?.43:(age*.68+s.seed*.3)%1,from=clamp(at),to=Math.min(1,from+.23);
    p.piece(2,x,z,angle,len*from,len*to,width*.7,width*.5,0,0,0,3,
      alpha*Math.sin(Math.PI*from),feed,-.1,heat*1.25);
  }
  _station(s,now,reduced,flash,state){
    const n=s.native;
    const motion=machineryPicture(n,state?.paused===true||state?.simTimeScale===0,reduced);
    if(!motion.advance){if(s._heldAge==null)s._heldAge=Math.max(0,now-s.born);}
    else s._heldAge=null;
    const age=s._heldAge!=null?s._heldAge:now-s.born,duration=s.recipe.life,progress=clamp(age/duration);
    const held=reduced||!motion.advance;
    const f=writeStationSideEventVfxFrame(s.profile,age,duration,n.fromX,n.fromZ,n.toX,n.toZ,
      n.centerX,n.centerZ,n.bearing,held,s.frame);
    const mover=state.entities?.get?.(n.entityId);
    if(n.entityId!=null&&(!mover||mover.alive===false||!point(mover.pos)))return;
    if(mover){f.x=mover.pos.x;f.z=mover.pos.z;const a=finite(mover.rot);f.dirX=Math.cos(a);f.dirZ=Math.sin(a);}
    s.x=f.x;s.z=f.z;s.y=Math.max(1,s.station.y);s.angle=Math.atan2(f.dirZ,f.dirX);
    if(!this._visible(s,state))return;
    const p=this.composer,w=clamp(s.radius*.35,1.25,2.7),a=s.angle;
    const feed=clamp(age/.18),cut=clamp((age-(duration-.48))/.42)-.1;
    let alpha=smooth(age/.10)*(1-smooth((progress-.87)/.13))*(flash?.64:1);
    if(motion.silhouette==='dark-arm')alpha*=.22;
    else if(motion.silhouette==='bound-arm')alpha*=.55;
    p.slot=s;
    if(n.kind==='hauler_dock'||n.kind==='quiet_dock'){
      const quiet=n.kind==='quiet_dock',light=alpha*(quiet?.40:.84);
      for(let side=-1;side<=1;side+=2){
        p.piece(6,s.x,s.z,a,-w*1.2,w*1.2,w*.35,w*.32,-w*.40,side*w*.8,0,side*2,
          light,feed,cut+(side+1)*.055,quiet?.42:.80);
        p.piece(1,s.x,s.z,a+Math.PI,0,w*3.2,w*.58,w*.48,w*.28,side*w*.6,0,side+3,
          light*.72,feed,cut,.65);
      }
      if(!quiet&&progress>.55){this._surface(s.station,s.x,s.z,this.a,true);
        this._connection(s,s.x,s.z,this.a.x,this.a.z,w*.58,alpha*smooth((progress-.55)/.13),feed,cut,.7);}
    }else if(n.kind==='patrol_launch'){
      if(mover){this._surface(s.source,s.x-f.dirX*100,s.z-f.dirZ*100,this.a,true);s.x=this.a.x;s.z=this.a.z;s.y=this.a.y;}
      for(let i=0;i<3;i++)p.piece(1,s.x,s.z,a+Math.PI+(i-1)*.12,0,w*(3.2+i*.55),w*(.80-i*.14),
        w*(.66-i*.12),w*(i-1)*.40,(i-1)*w*.65,0,i*2.3,alpha,clamp(feed-i*.09),cut+i*.06,1.05);
    }else if(n.kind==='repair_drone'){
      this._surface(s.station,s.x,s.z,this.a,true);
      const dx=this.a.x,dz=this.a.z,normal=this.a.angle;s.y=this.a.y;
      this._connection(s,s.x,s.z,dx,dz,w*.50,alpha,feed,cut,.8);
      for(let i=0;i<2;i++)p.piece(3,dx,dz,normal+Math.PI/2,-w*1.4,w*1.4,w*.70,w*.30,0,(i-.5)*w*.7,0,
        i*2.8,alpha,clamp(feed-i*.16),cut+i*.12,.75);
      const scan=held?.5:.5+.5*Math.sin(age*4.2+s.seed*TAU);
      p.piece(5,dx,dz,normal+Math.PI/2,-w+w*scan,w*.4+w*scan,w*.35,w*.3,w*.25,0,0,2,alpha,feed,cut,1.2);
    }else if(n.kind==='cargo_tractor'){
      this._surface(s.station,s.x,s.z,this.a,true);this._connection(s,this.a.x,this.a.z,s.x,s.z,w*.68,alpha,feed,cut,.9);
      for(let side=-1;side<=1;side+=2)p.piece(6,s.x,s.z,a,-w,w,w*.4,w*.35,w*.4,side*w*.7,0,side,
        alpha,clamp(feed-.13),cut+(side+1)*.08,.7);
    }else if(n.kind==='sensor_sweep'){
      this._surface(s.station,s.x,s.z,this.a,true);s.x=this.a.x;s.z=this.a.z;s.y=this.a.y;
      const axis=Math.atan2(f.z-s.z,f.x-s.x),scan=held?0:Math.sin(age*1.8+s.seed)*.18;
      for(let i=0;i<3;i++)p.piece(5,s.x,s.z,axis+scan+(i-1)*.30,0,w*(3.2+i*.8),w*(.43-i*.05),w*.35,
        w*(i-1)*.4,0,0,i*2.2,alpha*.77,clamp(feed-i*.12),cut+i*.09,.9);
      p.piece(3,s.x,s.z,axis+Math.PI/2,-w,w,w*.65,w*.28,0,0,0,3,alpha*.70,feed,cut,.5);
    }
    if(n.kind!=='quiet_dock')p._matter(s,age,reduced,n.kind==='repair_drone'?'repair':'transfer',a,s.radius*2);
  }
  _job(s,now,reduced,flash){
    const p=this.composer,age=now-s.born,progress=clamp(age/s.recipe.life),w=clamp(s.radius*.25,1.3,2.2);
    const feed=clamp(age/.12),cut=clamp((progress-.64)/.34)-.1;
    const alpha=smooth(age/.045)*(1-smooth((progress-.56)/.44))*(flash?.64:1);
    s.x=s.receiver.x;s.z=s.receiver.z;s.sx=s.origin.x;s.sz=s.origin.z;p.slot=s;
    const a=Math.atan2(s.z-s.sz,s.x-s.sx);
    if(s.profile.id==='transfer'||s.profile.id==='ore-cut'){
      const cadence=reduced?s.profile.reducedCadenceHz:s.profile.cadenceHz;
      const bite=Math.max(0,finite(s.native.pulse,1)-1),sinceBite=Math.max(0,age-bite/cadence);
      const supply=s.profile.id==='ore-cut'?(.22+.78*Math.exp(-sinceBite*16)):1;
      this._connection(s,s.sx,s.sz,s.x,s.z,w*.74,alpha*supply,feed,cut,s.profile.id==='ore-cut'?1.2:.95);
      if(s.profile.id==='transfer'){
        for(let side=-1;side<=1;side+=2)p.piece(6,s.x,s.z,s.angle+Math.PI/2,-w,w,w*.42,w*.35,-w*.30,
          side*w*.6,0,side,alpha,clamp(feed-.18),cut+(side+1)*.1,.72);
      }else{
        p.piece(3,s.x,s.z,s.angle+Math.PI/2,-w*1.3,w*1.3,w*.9,w*.32,0,0,0,0,alpha,feed,cut,.75);
        const work=reduced?.4:.5+.5*Math.sin(age*9);
        p.piece(5,s.x,s.z,s.angle+Math.PI/2,-w+w*work,w*.3+w*work,w*.36,w*.32,w*.3,0,0,2,
          alpha,feed,cut,1.3);
      }
    }else if(s.profile.id==='salvage'){
      for(let i=0;i<2;i++)p.piece(3,s.x,s.z,s.angle+Math.PI/2,-w*1.8,w*1.8,w*.8,w*.32,0,
        (i-.5)*w,0,i*2.7,alpha,clamp(feed-i*.17),cut+i*.13,.65);
      for(let i=0;i<2;i++)p.piece(5,s.x,s.z,s.angle+Math.PI/2+(i-.5)*.65,-w*1.6,w*1.6,w*.4,w*.37,
        w*(i?1:-1)*.45,0,0,i*2,alpha,feed,cut+i*.09,1.2);
    }else if(s.profile.id==='survey'){
      s.x=s.sx;s.z=s.sz;
      for(let i=0;i<3;i++){const travel=reduced?.45:1-Math.exp(-age*(3.4-i*.55));
        p.piece(4,s.x,s.z,a+(i-1)*.18,-.45,.45,w*.46,w*.57,0,0,w*(.8+travel*(3.0+i*.8)),
          i*2.2,alpha*.8,clamp(feed-i*.12),cut+i*.08,.86);}
    }else if(s.profile.id==='escort'){
      s.x=s.sx;s.z=s.sz;
      for(let side=-1;side<=1;side+=2)p.piece(6,s.x,s.z,a+side*.65,0,w*2.8,w*.45,w*.48,w*.6,side*w*.8,0,
        side*2,alpha,clamp(feed-(side+1)*.12),cut+(side+1)*.08,.86);
      p.piece(1,s.x,s.z,a+Math.PI,0,w*2.8,w*.62,w*.48,w*.25,0,0,3,alpha*.64,feed,cut,.72);
    }else{
      // A patrol watches the receipted route bearing, rather than drawing a spinning ring.
      s.x=s.sx;s.z=s.sz;
      for(let i=0;i<3;i++)p.piece(5,s.x,s.z,a+(i-1)*.48,0,w*(2.3+i*.55),w*.44,w*.40,w*(i-1)*.38,0,0,
        i*2.1,alpha,clamp(feed-i*.20),cut+i*.10,.88);
    }
    p._matter(s,age,reduced,s.profile.id==='salvage'||s.profile.id==='ore-cut'?'heat':'transfer',a,s.radius*1.7);
  }
  update(state){
    if(this.disposed)return 0;const now=finite(state.simTime,this.time),dt=Math.max(0,now-this.time);
    if(now<this.time)this.clear();this.time=now;if(!this.live&&!this.particles.live)return 0;
    const video=state.settings?.video,a11y=state.settings?.accessibility;
    const reduced=!!(video?.motionReduce||a11y?.reducedMotion||a11y?.motionReduce||a11y?.motionPreference==='reduce');
    const flash=!!(video?.flashReduce||a11y?.reducedFlash||a11y?.flashReduce);
    this.particleOptions.reducedMotion=reduced;this.particleOptions.reducedFlash=flash;
    if(reduced)this.particles.clear();else this.particles.update(dt,this.particleOptions);
    this.batch.begin(now,reduced,flash);this.live=0;
    for(const s of this.slots){
      if(!s.alive)continue;const n=s.native,key=s.type==='station'?(n?.eventId??n):n?.receiptId;
      if(!n?.alive||key!==s.key||now-s.born>=s.recipe.life){s.alive=false;continue;}
      this.live++;
      if(s.type==='station')this._station(s,now,reduced,flash,state);
      else if(this._visible(s,state))this._job(s,now,reduced,flash);
    }
    this.batch.end();this.mesh.visible=this.batch.count>0||this.particles.live>0;return this.live;
  }
  clear(type=null){
    for(const s of this.slots)if(!type||s.type===type)s.alive=false;
    this.live=this.slots.reduce((n,s)=>n+(s.alive?1:0),0);
    this.particles.clear();this.batch.begin(this.time);this.batch.end();
  }
  reproject(dx,dz){this.batch.reproject(dx,dz);this.particles.reproject(dx,dz);}
  inspect(){return{active:this.live,surfaces:this.batch.count,particles:this.particles.live,capacity:this.slots.length,
    instances:this.slots.filter(s=>s.alive).map(s=>({type:s.type,key:s.key,kind:s.profile.id,x:s.x,y:s.y,z:s.z,
      sourceX:s.sx,sourceZ:s.sz,born:s.born,life:s.recipe.life,measured:s.station.measured||s.target.measured}))};}
  dispose(){if(this.disposed)return;this.clear();this.particles.dispose();this.batch.dispose();this.disposed=true;}
}
