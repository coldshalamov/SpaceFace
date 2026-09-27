// Native bomb handoffs. The bomb presenter owns live fields and true force boundaries;
// this owner only carries the short material release, received contacts and cooling residue.
import * as THREE from 'three';
import { BOMB_DEFS } from '../../data/bombs.js';
import { SweptSurfaceBatch } from '../forceLanguage/sweptSurfaceBatch.js';
import { presentedAnchorXZ, presentedAnchorRot } from '../presentedAnchor.js';
import { ForceParticleFlow } from './forceParticleFlow.js';
import { ActionPrimitiveComposer, createActionPrimitivePrecompileMesh } from './actionPrimitives.js';

const TAU=Math.PI*2, CONTACTS=6, PIECES_PER_EVENT=24;
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const entity=(state,id)=>id==null?null:state.entities?.get?.(id);
function seedOf(id,payload,mode){
  let h=2166136261;const value=String(id)+payload+mode;
  for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);
  return (h>>>0)/4294967296;
}
function recipe(color,life){return Object.freeze({color:new THREE.Color(color),life});}
const RECIPES=Object.freeze({
  bomb_frag:recipe(0xffa354,1.05),bomb_concussion:recipe(0x8cd4ef,1.15),
  bomb_singularity:recipe(0x72bde8,.74),bomb_goo:recipe(0x99bc43,.88),
  bomb_emp:recipe(0xa092ec,.75),bomb_thermite:recipe(0xff8034,1.45),
  bomb_scrambler:recipe(0xdb7cbd,1.12),bomb_anchor:recipe(0x74cab9,1.02),
});
export const BOMB_TRANSIENT_EVENTS=Object.freeze(['bombs:detonated','bombs:fieldEnded','bombs:destroyed']);

export class BombDetonationVfx {
  constructor(scene,{toLocal=null,capacity=24}={}){
    this.capacity=clamp(Math.floor(finite(capacity,24)),1,48);
    this.batch=new SweptSurfaceBatch(scene,{capacity:this.capacity*PIECES_PER_EVENT,
      name:'SF_BombReleaseMatter',fieldVolume:true});
    this.mesh=this.batch.mesh;this.particles=new ForceParticleFlow(this.mesh,{capacity:256});
    this.composer=new ActionPrimitiveComposer(this.batch,this.particles,toLocal);
    this.toLocal=toLocal;this.local={x:0,z:0};this.pose={x:0,z:0};
    this.options={reducedMotion:false,reducedFlash:false};
    this.burst={kind:'heat',x:0,y:.8,z:0,dx:1,dz:0,radius:10,seed:0,count:6,life:.6,strength:1,deferUpload:true};
    this.slots=Array.from({length:this.capacity},()=>({alive:false,id:null,event:null,mode:null,payload:null,
      x:0,y:0,z:0,angle:0,radius:1,born:0,life:1,seed:0,recipe:null,particlePulse:-1,
      targetCount:0,directionCount:0,
      targets:Array.from({length:CONTACTS},()=>({id:null,entity:null,x:0,z:0,ox:0,oz:0,radius:1})),
      directions:Array.from({length:CONTACTS},()=>({id:null,angle:0,weight:1})),
    }));
    this.time=0;this.live=0;this.disposed=false;this.roots=[this.mesh];
    this.stats={live:0,surfaces:0,particles:0,contacts:0,dropped:0};
  }
  emit(event,p={},state={}){
    if(this.disposed||!BOMB_TRANSIENT_EVENTS.includes(event))return false;
    const payload=p.payloadId,base=RECIPES[payload];
    if(!base||!valid(p.pos))return false;
    const now=finite(state.simTime,this.time);
    if(now<this.time){this.clear();this.time=now;}
    // Expiry of a singularity already publishes a separate collapse detonation. Never
    // manufacture a second release from the subsequent fieldEnded receipt.
    if(event==='bombs:fieldEnded'&&payload==='bomb_singularity'&&p.trigger==='collapse')return true;
    const mode=event==='bombs:destroyed'?'interrupt':event==='bombs:fieldEnded'?'settle':
      payload==='bomb_singularity'?(p.trigger==='collapse'?'collapse':'open'):'burst';
    for(const s of this.slots)if(s.id===p.bombId&&s.event===event&&s.mode===mode&&
      s.payload===payload&&now-s.born<3&&s.recipe)return true;
    let s=null;for(const item of this.slots)if(!item.alive){s=item;break;}
    if(!s){this.stats.dropped++;return true;}
    s.alive=true;s.id=p.bombId;s.event=event;s.mode=mode;s.payload=payload;s.recipe=base;
    s.born=now;s.life=mode==='interrupt'?.52:mode==='settle'?.75:mode==='collapse'?1.12:base.life;
    s.x=p.pos.x;s.z=p.pos.z;s.y=.15;s.seed=seedOf(p.bombId??now,payload,mode);s.particlePulse=-1;
    s.radius=clamp(Math.sqrt(Math.max(1,finite(p.radius,BOMB_DEFS[payload].radius)))*1.8,7,24);
    const vx=finite(p.vel?.x),vz=finite(p.vel?.z);
    s.angle=Math.hypot(vx,vz)>.01?Math.atan2(vz,vx):s.seed*TAU;
    s.targetCount=0;s.directionCount=0;
    const hits=Array.isArray(p.hits)?p.hits:[];
    for(let i=0;i<hits.length&&s.targetCount<CONTACTS;i++){
      const id=hits[i],body=entity(state,id);if(!valid(body?.pos))continue;
      let duplicate=false;for(let j=0;j<s.targetCount;j++)if(s.targets[j].id===id)duplicate=true;
      if(duplicate)continue;
      const t=s.targets[s.targetCount++],dx=s.x-body.pos.x,dz=s.z-body.pos.z;
      const distance=Math.hypot(dx,dz),radius=Math.max(.1,finite(body.radius,1));
      // Receipt names a body, not a mesh triangle. Use its known facing surface; retain
      // the local offset so the short deposition remains attached while that body turns.
      const reach=Math.min(radius,distance*.8),nx=distance>.001?dx/distance:1,nz=distance>.001?dz/distance:0;
      const angle=finite(body.rot),c=Math.cos(angle),sn=Math.sin(angle);
      t.id=id;t.entity=body;t.radius=radius;t.ox=(nx*c+nz*sn)*reach;t.oz=(-nx*sn+nz*c)*reach;
      t.x=body.pos.x+nx*reach;t.z=body.pos.z+nz*reach;
    }
    const shoves=Array.isArray(p.shoves)?p.shoves:[];
    for(let i=0;i<shoves.length&&s.directionCount<CONTACTS;i++){
      const row=shoves[i],dx=finite(row?.dx),dz=finite(row?.dz),length=Math.hypot(dx,dz);
      if(length<.001||!(row.mag>0))continue;
      const d=s.directions[s.directionCount++];d.id=row.id;d.angle=Math.atan2(dz,dx);
      d.weight=clamp(Math.sqrt(row.mag)/35,.45,1.4);
    }
    this.live++;return true;
  }
  _piece(kind,x,z,angle,start,end,width,height,bow,side,reach,phase,opacity,arrival=1,cutoff=-.1,heat=1){
    this.composer._piece(kind,x,z,angle,start,end,width,height,bow,side,reach,phase,opacity,arrival,cutoff,heat);
  }
  _contacts(s,state){
    const alpha=finite(state.render?.interpolationAlpha,1);
    for(let i=0;i<s.targetCount;i++){
      const t=s.targets[i],body=entity(state,t.id);
      if(body!==t.entity||body?.alive===false||!valid(body?.pos))continue;
      presentedAnchorXZ(body,alpha,this.pose);const a=presentedAnchorRot(body,alpha),c=Math.cos(a),sn=Math.sin(a);
      t.x=this.pose.x+c*t.ox-sn*t.oz;t.z=this.pose.z+sn*t.ox+c*t.oz;
    }
  }
  _parcels(s,age,reduced,kind,angle,reach,source=s){
    if(reduced||age<.045||age>s.life*.42||s.mode==='settle'||s.mode==='interrupt')return;
    const pulse=Math.floor(age/.18);if(pulse<=s.particlePulse)return;s.particlePulse=pulse;
    const p=this.burst;if(this.toLocal)this.toLocal(source.x,source.z,this.local);else{this.local.x=source.x;this.local.z=source.z;}
    p.x=this.local.x;p.z=this.local.z;p.dx=Math.cos(angle);p.dz=Math.sin(angle);p.radius=reach;
    p.kind=kind;p.seed=s.seed+pulse*.381966;p.count=s.payload==='bomb_frag'?9:6;p.life=Math.min(.78,s.life*.65);
    p.strength=s.payload==='bomb_goo'?.7:1;this.particles.emit(p);
  }
  _front(s,angle,radius,width,height,phase,alpha,arrival=1,cutoff=-.1,arc=.78){
    this._piece(4,s.x,s.z,angle,-arc,arc*.82,width,height,0,0,radius,phase,alpha,arrival,cutoff,1.05);
  }
  _draw(s,now,reduced,flash){
    this.composer.slot=s;
    const age=Math.max(0,now-s.born),progress=clamp(age/s.life),r=s.radius;
    const clock=reduced?.19:age,seed=s.seed*TAU,a=s.angle;
    const opacity=smooth(age/.045)*(1-smooth((progress-.52)/.48))*(flash?.62:1);
    const cut=clamp((progress-.54)/.45)*1.16-.1;
    if(s.mode==='interrupt'||s.mode==='settle'){
      // A shot-down canister and a spent field do not perform a fresh powered detonation.
      // Two unequal remnants lose material from opposite edges at the existing origin.
      for(let k=0;k<2;k++)this._piece(s.payload==='bomb_goo'?3:5,s.x,s.z,a+k*.91,
        -r*.25,r*.34,r*(k?.12:.22),r*.07,r*.09*(k?1:-1),0,0,seed+k*2.2,
        opacity*.7,1,clamp(progress*(1.25+k*.18))-.1,.23);
      return;
    }
    if(s.payload==='bomb_frag'){
      // A short axial tearing cavity hands off to two differently timed broken skirts;
      // the hot parcels are reaction matter, not another physical ship-fragment owner.
      for(let k=0;k<3;k++){
        const fill=clamp((age-k*.037)/.14),direction=a+(k-1)*.46;
        this._piece(1,s.x,s.z,direction,-r*.18,r*(1.05+k*.24),r*(.26-k*.045),r*.20,
          r*(k-1)*.19,0,0,seed+k*2.1,opacity,fill,cut+k*.07,1.45-k*.2);
      }
      for(let k=0;k<2;k++){
        const t=Math.max(0,clock-.065-k*.075),distance=r*(.33+(1-Math.exp(-t*(4.3-k)))*(1.5+k*.8));
        this._front(s,a+(k?2.1:-.4),distance,r*.17,r*.24,seed+k*3,
          opacity*smooth((age-.065-k*.075)/.06),1,cut+k*.1,k?.92:.64);
      }
      this._parcels(s,age,reduced,'heat',a,r*2.4);
    }else if(s.payload==='bomb_concussion'){
      // Broad bowed compression walls carry signed shove directions. In empty space,
      // three unequal open sectors form an interrupted pressure shell, not repeated spokes.
      const count=s.directionCount||3;
      for(let k=0;k<count;k++){
        const dir=s.directionCount?s.directions[k].angle:a+k*2.17;
        const weight=s.directionCount?s.directions[k].weight:.9+k*.11;
        for(let layer=0;layer<2;layer++){
          const delay=k*.026+layer*.10,t=Math.max(0,clock-delay),front=r*(.28+(1-Math.exp(-t*(4.1-layer)))*(2+layer*.6))*weight;
          this._front(s,dir+(layer?.13:0),front,r*(layer?.18:.26),r*(layer?.24:.34),seed+k*1.9+layer,
            opacity*smooth((age-delay)/.075)*(layer?.65:1),1,cut+k*.018,layer?.59:.84);
        }
      }
      this._parcels(s,age,reduced,'repulsor',a,r*2.7);
    }else if(s.payload==='bomb_singularity'){
      const collapse=s.mode==='collapse';
      // Opening is only an unequal inlet handoff, leaving the persistent throat to
      // BombPresentation. Collapse pinches separate reaches before the real shove escapes.
      for(let k=0;k<3;k++){
        const dir=a+k*2.13,delay=k*.048,travel=smooth((age-delay)/.32);
        const x=s.x+Math.cos(dir)*r*.75,z=s.z+Math.sin(dir)*r*.75;
        this._piece(1,x,z,dir+Math.PI,0,r*.78,r*.22,r*.18,r*(k%2?.31:-.23),0,0,
          seed+k*1.8,opacity*smooth((age-delay)/.065),travel,collapse?cut:clamp((progress-.30)*1.65)-.1,.78);
      }
      if(collapse)for(let k=0;k<Math.min(3,s.directionCount);k++){
        const t=Math.max(0,clock-.19-k*.05);
        this._front(s,s.directions[k].angle,r*(.2+(1-Math.exp(-t*4))*2.3),r*.19,r*.25,seed+k*2,
          opacity*smooth((age-.19-k*.05)/.07),1,cut,.66);
      }
      this._parcels(s,age,reduced,'well',a,r*1.2);
    }else if(s.payload==='bomb_goo'){
      // Local wet lobes land at different times; actual victims receive a small deposit.
      // No second full-area goo basin is layered on the persistent field.
      for(let k=0;k<3;k++){
        const dir=a+k*2.26,delay=k*.047;
        this._piece(3,s.x+Math.cos(dir)*r*.17,s.z+Math.sin(dir)*r*.17,dir,-r*.12,r*.55,
          r*(.28-k*.035),r*.09,0,0,0,seed+k*2.5,opacity*.84,clamp((age-delay)/.22),cut+k*.1,.25);
      }
      for(let k=0;k<s.targetCount;k++){
        const t=s.targets[k],dir=Math.atan2(t.z-s.z,t.x-s.x),w=clamp(t.radius*.27,1.3,4);
        this._piece(3,t.x,t.z,dir+Math.PI/2,-w,w*1.2,w,w*.26,0,0,0,seed+k,
          opacity*.78,clamp((age-.07-k*.028)/.20),cut,.28);
      }
      this._parcels(s,age,reduced,'goo',a,r*.9);
    }else if(s.payload==='bomb_emp'){
      const count=s.targetCount||3;
      for(let k=0;k<count;k++){
        const target=s.targetCount?s.targets[k]:null;
        const dir=target?Math.atan2(target.z-s.z,target.x-s.x):a+k*2.19;
        const length=target?Math.hypot(target.x-s.x,target.z-s.z):r*(.8+k*.16);
        const fill=clamp((age-k*.028)/.16),width=clamp(r*.13,1,2.9);
        this._piece(5,s.x,s.z,dir,0,length,width,width*.8,(k%2?1:-1)*length*.10,0,0,
          seed+k*2,opacity,fill,cut+k*.05,1.3);
        const jx=s.x+Math.cos(dir)*length*.48,jz=s.z+Math.sin(dir)*length*.48;
        this._piece(5,jx,jz,dir+(k%2?.67:-.56),0,length*.23,width*.65,width*.6,
          width*.9,0,0,seed+k*3.4,opacity*smooth((age-.10-k*.018)/.055),fill,cut+.16,1.15);
      }
      this._parcels(s,age,reduced,'current',a,r*1.7);
    }else if(s.payload==='bomb_thermite'){
      const count=s.directionCount||2;
      for(let k=0;k<count;k++){
        const dir=s.directionCount?s.directions[k].angle:a+(k?1.13:-.28),delay=k*.039;
        const t=Math.max(0,clock-delay),run=r*(.24+1.38*(1-Math.exp(-t*3.6)));
        this._piece(1,s.x,s.z,dir,run*.16,run,r*.19,r*.15,r*.18*(k%2?1:-1),0,0,
          seed+k*2.2,opacity,clamp((age-delay)/.15),cut,.95);
      }
      for(let k=0;k<s.targetCount;k++){
        const t=s.targets[k],dir=Math.atan2(t.z-s.z,t.x-s.x)+Math.PI/2,w=clamp(t.radius*.24,1.1,4.2);
        this._piece(3,t.x,t.z,dir,-w,w*1.1,w,w*.3,0,0,0,seed+k*2.3,
          opacity*smooth((age-.12-k*.025)/.10),1,cut+k*.06,1.4);
      }
      this._parcels(s,age,reduced,'heat',a,r*1.9);
    }else if(s.payload==='bomb_scrambler'){
      // Sheared sectors fold sideways at different rates. Their late counterfolds
      // develop after the first fronts arrive, rather than spinning the entire object.
      const count=s.directionCount||3;
      for(let k=0;k<count;k++){
        const base=s.directionCount?s.directions[k].angle:a+k*2.09,delay=k*.043;
        const t=Math.max(0,clock-delay),travel=1-Math.exp(-t*(3.6-k*.13));
        const dir=base+(k%2?-1:1)*.39*Math.sin(travel*Math.PI*.82),front=r*(.38+travel*(1.7+k*.09));
        this._front(s,dir,front,r*.22,r*.29,seed+k*2.5,opacity*smooth((age-delay)/.09),1,cut,.64);
        this._piece(1,s.x,s.z,dir+.73,r*.4,r*1.5,r*.17,r*.22,-r*.57,0,0,seed+k,
          opacity*.7*smooth((age-.15-delay)/.10),1,cut+.12,.65);
      }
      this._parcels(s,age,reduced,'skim',a,r*2.1);
    }else if(s.payload==='bomb_anchor'){
      // Every strand terminates on a real p.hits body. No hits means no claimed
      // recipient: only the local source unloading remains visible.
      for(let k=0;k<s.targetCount;k++){
        const t=s.targets[k],dx=t.x-s.x,dz=t.z-s.z,length=Math.hypot(dx,dz),dir=Math.atan2(dz,dx);
        const width=clamp(t.radius*.22,1.15,3.2),delay=k*.025,feed=clamp((age-delay)/.23);
        if(length>.01)this._piece(2,s.x,s.z,dir,0,length,width,width*.73,length*.028,0,0,seed+k*1.9,
          opacity*.82,feed,clamp((progress-.36)*1.85)-.1,.73);
        const arrive=smooth((age-.19-delay)/.09);
        for(let side=-1;side<=1;side+=2)this._piece(6,t.x,t.z,dir+Math.PI/2,-width*1.6,width*1.4,
          width*.54,width*.6,width*.58,side*width*(.62+(1-arrive)*.7),0,seed+k+side,
          opacity*arrive,1,cut+side*.045,.75);
      }
      this._piece(6,s.x,s.z,a,-r*.21,r*.18,r*.14,r*.14,r*.09,0,0,seed,
        opacity*.72,clamp(age/.13),cut,.45);
      // No directionless radial spark spray: anchor receivers carry the consequence.
    }
  }
  update(state={}){
    if(this.disposed)return 0;
    const now=finite(state.simTime,this.time);if(now<this.time)this.clear();
    const dt=Math.max(0,now-this.time);this.time=now;
    const video=state.settings?.video,a11y=state.settings?.accessibility;
    const reduced=!!(video?.motionReduce||a11y?.reducedMotion||a11y?.motionReduce);
    const flash=!!(video?.flashReduce||a11y?.flashReduce||a11y?.reducedFlash);
    this.options.reducedMotion=reduced;this.options.reducedFlash=flash;
    if(reduced)this.particles.clear();else this.particles.update(dt,this.options);
    this.batch.begin(now,reduced,flash);this.live=0;this.stats.contacts=0;
    for(const s of this.slots){
      if(!s.alive)continue;
      if(now-s.born>=s.life){s.alive=false;continue;}
      this.live++;this._contacts(s,state);this.stats.contacts+=s.targetCount;this._draw(s,now,reduced,flash);
    }
    this.batch.end();this.particles.publish();this.mesh.visible=this.batch.count>0||this.particles.live>0;
    this.stats.live=this.live;this.stats.surfaces=this.batch.count;this.stats.particles=this.particles.live;
    return this.live;
  }
  reproject(dx,dz){if(this.disposed)return;this.batch.reproject(dx,dz);this.particles.reproject(dx,dz);}
  clear(){
    if(this.disposed)return;
    for(const s of this.slots){s.alive=false;s.recipe=null;s.targetCount=0;}
    this.live=0;this.particles.clear();this.batch.begin(this.time);this.batch.end();
    this.stats.live=this.stats.surfaces=this.stats.particles=this.stats.contacts=0;
  }
  dispose(){if(this.disposed)return;this.clear();this.particles.dispose();this.batch.dispose();this.disposed=true;}
}

// The action and bomb owners deliberately use the exact same linked program.
export function createBombDetonationPrecompileMesh(){
  const mesh=createActionPrimitivePrecompileMesh();mesh.name='SF_Precompile_BombReleaseMatter';return mesh;
}
