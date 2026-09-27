// Admitted status receivers keep their material between cadence pulses. Combat remains
// the sole source of duration, stacks and the Momentum Sink reference frame.
import * as THREE from 'three';
import { SHIPS } from '../../data/ships.js';
import { modelTruthRow } from '../../data/modelTruth.js';
import { mountDrawScale } from '../../data/modelTruthMounts.js';
import { MOMENTUM_SINK_STATUS_ID } from '../../data/combatDefs.js';
import { STATUS_ATTACHED_BURN_ID, STATUS_ATTACHED_GOO_ID } from '../statusAttachedVfx.js';
import { presentedAnchorXZ, presentedAnchorRot } from '../presentedAnchor.js';
import { SweptSurfaceBatch } from '../forceLanguage/sweptSurfaceBatch.js';
import { ActionPrimitiveComposer } from './actionPrimitives.js';
import { ForceParticleFlow } from './forceParticleFlow.js';

const TAU=Math.PI*2, STATUS_CAP=8, SINK_CAP=6;
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const SHAPES=new Map(SHIPS.map(row=>[row.id,row.visuals?.proportions]));
const RECIPES=Object.freeze({
  burn:Object.freeze({color:new THREE.Color(0xff823b),life:.32}),
  goo:Object.freeze({color:new THREE.Color(0x83aa3d),life:.48}),
  sink:Object.freeze({color:new THREE.Color(0xfeb669),life:.20}),
});
function seedOf(id,status){
  const value=String(id)+status;let h=2166136261;
  for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);
  return (h>>>0)/4294967296;
}
function getEntity(state,id){return state.entities?.get?.(id)||state.entities?.get?.(Number(id));}

export class StatusMatterVfx {
  constructor(scene,{toLocal=null}={}){
    this.batch=new SweptSurfaceBatch(scene,{capacity:(STATUS_CAP+SINK_CAP)*8,name:'SF_StatusMatter',fieldVolume:true});
    this.mesh=this.batch.mesh;this.roots=[this.mesh];
    this.particles=new ForceParticleFlow(this.mesh,{capacity:128});
    this.composer=new ActionPrimitiveComposer(this.batch,this.particles,toLocal);
    this.toLocal=toLocal;this.local={x:0,z:0};this.pose={x:0,z:0};
    this.options={reducedMotion:false,reducedFlash:false};
    this.burst={kind:'heat',x:0,y:0,z:0,dx:1,dz:0,radius:3,seed:0,count:2,life:.25,strength:.7,deferUpload:true};
    this.slots=Array.from({length:STATUS_CAP+SINK_CAP},()=>({alive:false,id:null,entity:null,statusId:null,
      kind:null,recipe:null,seed:0,born:0,last:0,stopped:-1,expiresTick:0,stacks:1,particlePulse:-1,
      x:0,y:0,z:0,angle:0,hx:1,hz:1,top:0,axis:0,speed:0,opacity:1,truth:null}));
    this.live=0;this.time=0;this.disposed=false;
    this.stats={live:0,surfaces:0,particles:0,powered:0,dropped:0};
  }
  _touch(body,statusId,kind,active,state){
    if(this.disposed||!body||body.alive===false||!valid(body.pos)||!(active?.expiresTick>state.tick))return null;
    const now=finite(state.simTime,this.time);
    if(now<this.time){this.clear();this.time=now;}
    const first=kind==='sink'?STATUS_CAP:0,last=kind==='sink'?this.slots.length:STATUS_CAP;
    let slot=null,oldest=null;
    for(let i=first;i<last;i++){
      const s=this.slots[i];
      if(s.alive&&s.entity===body&&s.statusId===statusId){slot=s;break;}
      if(!s.alive&&!slot)slot=s;
      if(!oldest||s.last<oldest.last)oldest=s;
    }
    // Admission already selected these bodies. Replacing the oldest retained residue
    // preserves the existing hard cap when a newly nearby victim takes its place.
    if(!slot){slot=oldest;this.stats.dropped++;}
    if(!slot.alive||slot.entity!==body||slot.statusId!==statusId||slot.stopped>=0){
      if(!slot.alive)this.live++;
      slot.alive=true;slot.id=body.id;slot.entity=body;slot.statusId=statusId;slot.kind=kind;
      slot.recipe=RECIPES[kind];slot.seed=seedOf(body.id,statusId);slot.born=now;
      slot.stopped=-1;slot.particlePulse=-1;
    }
    slot.last=now;slot.expiresTick=active.expiresTick;slot.stacks=clamp(finite(active.stacks,1),1,3);
    const data=body.data;
    slot.truth=modelTruthRow(data?.defId)||modelTruthRow(data?.shipId)||modelTruthRow(data?.typeId)||modelTruthRow(body.id);
    this._pose(slot,state);
    return slot;
  }
  touchStatus(victim,state){
    const id=victim?.statusId,kind=id===STATUS_ATTACHED_BURN_ID?'burn':id===STATUS_ATTACHED_GOO_ID?'goo':null;
    if(!kind)return false;
    const body=getEntity(state,victim.entityId),active=state.combat?.entities?.[victim.entityId]?.statuses?.[id];
    return !!this._touch(body,id,kind,active,state);
  }
  touchMomentum(body,active,plan,state){
    if(!plan?.active)return false;
    const s=this._touch(body,MOMENTUM_SINK_STATUS_ID,'sink',active,state);if(!s)return false;
    s.axis=Math.atan2(plan.axisZ,plan.axisX);s.speed=finite(plan.relativeSpeed);
    s.opacity=clamp(finite(plan.opacity,.7),.15,1);return true;
  }
  _pose(s,state){
    const body=s.entity,alpha=finite(state.render?.interpolationAlpha,1);
    presentedAnchorXZ(body,alpha,this.pose);s.x=this.pose.x;s.z=this.pose.z;s.angle=presentedAnchorRot(body,alpha);
    const radius=Math.max(.25,finite(body.radius,6)),data=body.data;
    const root=state.render?.meshes?.get?.(body.id)||body.view?.root||body.mesh,hull=root?.userData?.hull;
    const bounds=hull?.userData?.visualBounds||root?.userData?.visualBounds,size=bounds?.size;
    if(size&&size[0]>0&&size[2]>0){
      s.hx=size[0]*.5;s.hz=size[2]*.5;s.top=finite(bounds.center?.[1])+finite(size[1])* .5;
    }else if(s.truth?.bounds?.size){
      const row=s.truth,scale=mountDrawScale(row,body),b=row.bounds;
      s.hx=b.size[0]*scale*.5;s.hz=b.size[2]*scale*.5;
      s.top=(finite(b.center?.[1])+finite(b.size[1])*.5)*scale+finite(row.drawOffset?.[1]);
      const cx=finite(b.center?.[0])*scale+finite(row.drawOffset?.[0]);
      const cz=finite(b.center?.[2])*scale+finite(row.drawOffset?.[2]);
      s.x+=Math.cos(s.angle)*cx-Math.sin(s.angle)*cz;s.z+=Math.sin(s.angle)*cx+Math.cos(s.angle)*cz;
    }else if(body.type==='ship'||body.type==='drone'){
      const p=data?.proportions||SHAPES.get(data?.defId)||SHAPES.get(data?.shipId);
      s.hx=radius*finite(p?.length,1.35)*.5;s.hz=radius*finite(p?.halfWidth,.42);
      s.top=radius*finite(p?.height,.30)*.5;
    }else{s.hx=radius;s.hz=radius;s.top=radius*.40;}
    s.y=s.top-.95;
  }
  _source(s,state,now){
    const body=getEntity(state,s.id);
    if(body!==s.entity||body?.alive===false||!valid(body?.pos))return false;
    const active=state.combat?.entities?.[s.id]?.statuses?.[s.statusId];
    if(!(active?.expiresTick>state.tick)||now-s.last>(s.kind==='sink'?.19:.27))return false;
    if(s.kind==='sink'){
      const frame=active.data?.frameVelocity;
      if(active.data?.frameKind!=='attacker_velocity'||active.data?.frameReady!==true||!valid(frame)||!valid(body.vel))return false;
      const dx=body.vel.x-frame.x,dz=body.vel.z-frame.z;s.speed=Math.hypot(dx,dz);
      if(s.speed<=.25)return false;
      s.axis=Math.atan2(-dz,-dx);
    }
    s.expiresTick=active.expiresTick;s.stacks=clamp(finite(active.stacks,1),1,3);return true;
  }
  _at(s,lx,lz){
    const c=Math.cos(s.angle),sn=Math.sin(s.angle);
    this.pose.x=s.x+c*lx-sn*lz;this.pose.z=s.z+sn*lx+c*lz;
  }
  _draw(s,now,reduced,flash){
    this.composer.slot=s;
    const age=Math.max(0,now-s.born),cold=s.stopped>=0;
    const retired=cold?clamp((now-s.stopped)/s.recipe.life):0;
    const clock=reduced?.31:age,seed=s.seed*TAU,scale=clamp(Math.min(s.hx,s.hz),1.6,18);
    const alpha=smooth(age/.065)*(1-smooth(retired))*(flash?.52:1);
    const heat=cold?.12*(1-retired):1;
    const p=this.composer;
    if(s.kind==='burn'){
      // Three fixed damage seats feed unequal rolling tongues. A tongue sheds its
      // downstream edge and renews locally; neither the hull mark nor the assembly spins.
      for(let i=0;i<3;i++){
        const side=i===1?-1:1,lx=s.hx*(-.40+i*.32),lz=s.hz*(side*(.26+s.seed*.18));
        this._at(s,lx,lz);const x=this.pose.x,z=this.pose.z;
        const arrival=clamp((age-i*.045)/.17),cut=cold?retired*(1.15+i*.1)-.1:-.1;
        p.piece(3,x,z,s.angle,-scale*.34,scale*.42,scale*.30,scale*.075,0,0,0,i*2.3,
          alpha*.84,arrival,cut,heat*.42);
        if(cold)continue;
        const body=s.entity,vx=finite(body.vel?.x),vz=finite(body.vel?.z),speed=Math.hypot(vx,vz);
        const wind=speed>3?Math.atan2(-vz,-vx):s.angle+Math.PI;
        const fold=Math.sin(clock*(2.8+i*.57)+seed+i*1.9);
        p.piece(1,x,z,wind+(i-1)*.26,-scale*.08,scale*(1.25+i*.23),
          scale*(.28+i*.035),scale*(.48+i*.07),scale*.21*fold,0,0,i*2.3,
          alpha*(.74+i*.07),arrival,-.1,1.20+fold*.14);
      }
    }else if(s.kind==='goo'){
      // Adjacent lenticular deposits have unequal wet rims and redistribute thickness
      // slowly. On cutoff, material drains through local seams in different directions.
      for(let i=0;i<3;i++){
        const side=i===1?-1:1;this._at(s,s.hx*(-.42+i*.36),s.hz*side*.25);
        const arrival=clamp((age-i*.06)/.29),drain=cold?smooth((retired-i*.07)/(1-i*.07)):0;
        const ripple=reduced?0:Math.sin(clock*(.82+i*.19)+seed+i*2.2);
        const width=scale*(.49+.075*s.stacks)*(1+ripple*.065);
        p.piece(3,this.pose.x,this.pose.z,s.angle+(i===1?Math.PI:0),-s.hx*.34,s.hx*.35,
          width,scale*(.15+i*.04)*(1+Math.sin(clock*.7+i)*.09),0,side*scale*.10*drain,0,i*2.3,
          alpha*.97,arrival,drain*(1.2+i*.05)-.1,cold?.03:.24);
        if(i<2)p.piece(2,this.pose.x,this.pose.z,s.angle+side*.75,-scale*.15,scale*.58,
          scale*.105,scale*.07,scale*.19,side*width*.71,0,i*2.6,
          alpha*.50,arrival,drain*1.4-.1,cold?.03:.18);
      }
    }else{
      // Loaded transverse ribs grip the resisting face of the actual hull ellipse.
      // Differential flex follows the signed stored-frame velocity; there is no halo.
      const local=s.axis-s.angle,c=Math.cos(local),sn=Math.sin(local);
      const reach=1/Math.sqrt(c*c/(s.hx*s.hx)+sn*sn/(s.hz*s.hz));
      const load=clamp(s.speed/90),axis=s.axis+Math.PI/2;
      for(let i=0;i<3;i++){
        const at=reach*(.34+i*.20),x=s.x+Math.cos(s.axis)*at,z=s.z+Math.sin(s.axis)*at;
        const flex=reduced?0:Math.sin(clock*(3.2+i*.67)+seed+i*2.1)*scale*.10*load;
        p.piece(6,x,z,axis,-scale*(.66-i*.08),scale*(.59-i*.04),scale*.105,scale*.17,
          scale*(.20+load*.12)+flex,0,0,i*2.1,alpha*s.opacity,
          clamp((age-i*.03)/.11),cold?retired*(1.27+i*.11)-.1:-.1,cold?.08:.7+load*.7);
      }
    }
    // Small hot parcels leave real burn seats only while the source is fed. Goo stays
    // on the body; sink stress lives in the ribs instead of a generic radial spray.
    if(s.kind==='burn'&&!cold&&!reduced&&age>.06){
      const pulse=Math.floor(age/.16);
      if(pulse>s.particlePulse){
        s.particlePulse=pulse;this._at(s,-s.hx*.23,s.hz*.30);
        if(this.toLocal)this.toLocal(this.pose.x,this.pose.z,this.local);else{this.local.x=this.pose.x;this.local.z=this.pose.z;}
        const b=this.burst;b.x=this.local.x;b.z=this.local.z;b.y=s.top+.25;
        b.dx=-Math.cos(s.angle);b.dz=-Math.sin(s.angle);b.radius=scale*.9;
        b.seed=s.seed+pulse*.381966;b.count=flash?1:2;b.life=.25;b.strength=flash?.32:.64;
        this.particles.emit(b);
      }
    }
  }
  update(state={}){
    if(this.disposed)return 0;
    const now=finite(state.simTime,this.time);if(now<this.time)this.clear();
    const dt=Math.max(0,now-this.time);this.time=now;
    if(!this.live&&!this.particles.live)return 0;
    const video=state.settings?.video,a11y=state.settings?.accessibility;
    const reduced=!!(video?.motionReduce||a11y?.reducedMotion||a11y?.motionReduce);
    const flash=!!(video?.flashReduce||a11y?.flashReduce||a11y?.reducedFlash);
    this.options.reducedMotion=reduced;this.options.reducedFlash=flash;
    if(reduced)this.particles.clear();else this.particles.update(dt,this.options);
    this.batch.begin(now,reduced,flash);this.live=0;this.stats.powered=0;
    for(const s of this.slots){
      if(!s.alive)continue;
      const body=getEntity(state,s.id),same=body===s.entity&&body?.alive!==false&&valid(body?.pos);
      if(s.stopped<0&&!this._source(s,state,now)){
        const expiredBy=Math.max(0,(finite(state.tick)-s.expiresTick)/60);
        s.stopped=Math.max(s.born,Math.min(now-expiredBy,s.last+(s.kind==='sink'?.19:.27)));
      }
      if(s.stopped>=0&&now-s.stopped>=s.recipe.life){s.alive=false;s.entity=null;continue;}
      if(same)this._pose(s,state);
      this.live++;if(s.stopped<0)this.stats.powered++;
      this._draw(s,now,reduced,flash);
    }
    this.batch.end();this.particles.publish();this.mesh.visible=this.batch.count>0||this.particles.live>0;
    this.stats.live=this.live;this.stats.surfaces=this.batch.count;this.stats.particles=this.particles.live;
    return this.live;
  }
  reproject(dx,dz){if(this.disposed||(!this.live&&!this.particles.live))return;this.batch.reproject(dx,dz);this.particles.reproject(dx,dz);}
  clear(){
    if(this.disposed)return;
    for(const s of this.slots){s.alive=false;s.entity=null;}
    this.live=0;this.particles.clear();this.batch.begin(this.time);this.batch.end();this.mesh.visible=false;
    this.stats.live=this.stats.surfaces=this.stats.particles=this.stats.powered=0;
  }
  dispose(){if(this.disposed)return;this.clear();this.particles.dispose();this.batch.dispose();this.disposed=true;}
}
