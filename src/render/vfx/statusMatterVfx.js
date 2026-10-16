// Admitted status receivers keep their material between cadence pulses. Combat remains
// the sole source of duration, stacks and the Momentum Sink reference frame.
import * as THREE from 'three';
import { SHIPS } from '../../data/ships.js';
import { modelTruthRow } from '../../data/modelTruth.js';
import { mountDrawScale } from '../../data/modelTruthMounts.js';
import { MOMENTUM_SINK_STATUS_ID } from '../../data/combatDefs.js';
import {
  STATUS_ATTACHED_BURN_ID, STATUS_ATTACHED_GOO_ID, STATUS_ATTACHED_GRAVITY_ID,
  STATUS_ATTACHED_PINNED_ID, STATUS_ATTACHED_UNMOORED_ID,
  STATUS_ATTACHED_VENT_ID, matterKindForStatusId,
} from '../statusAttachedVfx.js';
import { presentedAnchorXZ, presentedAnchorRot } from '../presentedAnchor.js';
import { SweptSurfaceBatch } from '../forceLanguage/sweptSurfaceBatch.js';
import { ActionPrimitiveComposer } from './actionPrimitives.js';
import { ForceParticleFlow } from './forceParticleFlow.js';
import { queryAsteroidField } from '../../world/asteroidField.js';

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
  gravity:Object.freeze({color:new THREE.Color(0x7ee7ff),life:.42}),
  pinned:Object.freeze({color:new THREE.Color(0x3d63d6),life:.5}),
  unmoored:Object.freeze({color:new THREE.Color(0xffd9a0),life:.5}),
  crystalHeat:Object.freeze({color:new THREE.Color(0xb0e5ee),life:.38}),
  fuelHeat:Object.freeze({color:new THREE.Color(0xf7a14f),life:.46}),
  metalHeat:Object.freeze({color:new THREE.Color(0xdc7d48),life:.38}),
  // PIC-31 — hurt-hull vent gas: pale steel, exhaled not burning.
  vent:Object.freeze({color:new THREE.Color(0xcfe0ee),life:.7}),
});
function seedOf(id,status){
  const value=String(id)+status;let h=2166136261;
  for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);
  return (h>>>0)/4294967296;
}
function getEntity(state,id){return state.entities?.get?.(id)||state.entities?.get?.(Number(id))||state.world?.asteroidField?.byId?.get?.(id);}
const HEAT_STATUS='environment_heat';
const HEAT_ACTIVE=Object.freeze({expiresTick:Infinity,stacks:1});
// PIC-31 — the vent latch carries no expiry of its own; admission plus the
// _source branch below bound it to the live hull band instead.
const VENT_ACTIVE=Object.freeze({expiresTick:Infinity,stacks:1});
const materialHeat=body=>Math.max(0,finite(body?.data?.materialCondition?.heat,finite(body?.data?.heat)));

// Read only the nearby compact grid plus already materialized bodies, once per admission
// cadence. No new environment scan runs in the per-frame geometry loop.
export function collectHeatedMaterialBodies(state,out,rocks){
  out.length=0;
  const player=getEntity(state,state.playerId),pos=player?.pos;
  if(!valid(pos))return out;
  const admit=body=>{
    if(!valid(body?.pos)||body.alive===false||body.data?.materialCondition?.reacted||materialHeat(body)<.5)return;
    if(!['asteroid','wreck','prop','payload','cargo_pod','pickup'].includes(body.type))return;
    if(Math.hypot(body.pos.x-pos.x,body.pos.z-pos.z)>650+finite(body.radius))return;
    if(out.includes(body))return;
    out.push(body);
  };
  for(const body of state.entityList||[])admit(body);
  queryAsteroidField(state,pos,650,rocks);for(const body of rocks)admit(body);
  out.sort((a,b)=>Math.hypot(a.pos.x-pos.x,a.pos.z-pos.z)-Math.hypot(b.pos.x-pos.x,b.pos.z-pos.z));
  out.length=Math.min(STATUS_CAP,out.length);return out;
}

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
      x:0,y:0,z:0,angle:0,hx:1,hz:1,top:0,axis:0,speed:0,opacity:1,truth:null,
      ventSide:0,ventLx:0,ventLz:0}));
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
    const id=victim?.statusId,kind=matterKindForStatusId(id);
    if(!kind)return false;
    const body=getEntity(state,victim.entityId);
    // PIC-31 — the vent is not a status-bag entry: its latch lives on the
    // combat runtime (owned by src/combat/damage.js). Admit it while latched;
    // the per-frame _source branch below keeps it truthful to the hull band.
    if(id===STATUS_ATTACHED_VENT_ID){
      const vent=state.combat?.entities?.[victim.entityId]?.hullVent;
      if(!vent||typeof vent!=='object')return false;
      const slot=this._touch(body,id,kind,VENT_ACTIVE,state);
      if(!slot)return false;
      // Stamp the hit seat in hull-local frame so the draw breathes from where
      // the hull was actually hurt, even as the ship turns.
      const c=Math.cos(slot.angle),sn=Math.sin(slot.angle);
      const wx=(Number(vent.x)||0)-slot.x,wz=(Number(vent.z)||0)-slot.z;
      slot.ventSide=vent.side===-1?-1:1;
      slot.ventLx=c*wx+sn*wz;slot.ventLz=-sn*wx+c*wz;
      return !!slot;
    }
    const active=state.combat?.entities?.[victim.entityId]?.statuses?.[id];
    return !!this._touch(body,id,kind,active,state);
  }
  touchMomentum(body,active,plan,state){
    if(!plan?.active)return false;
    const s=this._touch(body,MOMENTUM_SINK_STATUS_ID,'sink',active,state);if(!s)return false;
    s.axis=Math.atan2(plan.axisZ,plan.axisX);s.speed=finite(plan.relativeSpeed);
    s.opacity=clamp(finite(plan.opacity,.7),.15,1);return true;
  }
  touchMaterial(body,state){
    const load=materialHeat(body);if(load<.5||body.data?.materialCondition?.reacted)return false;
    const material=body.data?.material,kind=material==='crystal'?'crystalHeat':material==='volatile'||material==='debris'?'fuelHeat':'metalHeat';
    const s=this._touch(body,HEAT_STATUS,kind,HEAT_ACTIVE,state);if(!s)return false;
    s.opacity=clamp(load/(material==='crystal'?48:36),.10,1);return true;
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
    // PIC-31 — the vent stays truthful to the live hull, not to a status
    // expiry: latched, alive, and still sitting below the damaged-band edge.
    // Repair above the band and death both end it here (death also clears the
    // latch in damage.js). Same rule the collectors pin.
    if(s.statusId===STATUS_ATTACHED_VENT_ID){
      const vent=state.combat?.entities?.[s.id]?.hullVent;
      if(!vent||typeof vent!=='object')return false;
      const max=finite(body.hullMax,0);
      if(!(max>0)||(Math.max(0,finite(body.hull))/max)>=0.55)return false;
      if(now-s.last>.27)return false;
      return true;
    }
    if(s.statusId===HEAT_STATUS){
      if(body.data?.materialCondition?.reacted||materialHeat(body)<.5||now-s.last>.27)return false;
      s.opacity=clamp(materialHeat(body)/(body.data?.material==='crystal'?48:36),.10,1);return true;
    }
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
    }else if(s.kind==='gravity'){
      // Two staggered paired jaws contract across the visible hull, communicating
      // increased coupling before another field arrives. They are body-seated loads,
      // not a target UI ring or a false area of effect. Cutoff unloads each jaw outward.
      for(let i=0;i<2;i++){
        const phase=seed+i*2.4,stroke=reduced?.5:.5+.5*Math.sin(clock*(1.8+i*.31)+phase);
        const close=.70+.17*stroke,release=cold?retired*scale*.30:0;
        const at=s.hx*(i===0?-.34:.36),arrival=clamp((age-i*.055)/.24);
        for(let side=-1;side<=1;side+=2){
          this._at(s,at,side*(s.hz*close+release));
          p.piece(6,this.pose.x,this.pose.z,s.angle,-s.hx*.20,s.hx*.23,
            scale*.16,scale*.22,side*scale*(.20+.08*stroke),0,0,phase+side,
            alpha*.82,arrival,cold?retired*(1.2+i*.18)-.1:-.1,cold?.09:.68);
        }
      }
    }else if(s.kind==='pinned'){
      // A Well makes the hull heavy: broad flat platens bear down across the plating from both
      // flanks and hold there, one slow settling stroke and no release until the field lets go.
      // Cutoff unloads each platen outward. Cool deep blue, nothing rises.
      for(let i=0;i<3;i++){
        const phase=seed+i*1.7,settle=reduced?.5:.5+.5*Math.sin(clock*(.55+i*.09)+phase);
        const at=s.hx*(-.40+i*.40),arrival=smooth((age-i*.07)/.34),release=cold?retired*scale*.34:0;
        for(let side=-1;side<=1;side+=2){
          this._at(s,at,side*(s.hz*(.60+.05*settle)+release));
          p.piece(6,this.pose.x,this.pose.z,s.angle,-s.hx*.20,s.hx*.20,
            scale*.26,scale*.12,side*scale*.07*settle,0,0,phase+side,
            alpha*.88,arrival,cold?retired*(1.2+i*.12)-.1:-.1,cold?.07:.52);
        }
      }
    }else if(s.kind==='unmoored'){
      // A Repulsor makes the hull light: loose lobes shed off the flanks and drift outward and
      // away, each on its own slow cycle, so the ship reads buoyant and un-tied. Warm pale.
      for(let i=0;i<2;i++){
        const at=s.hx*(i===0?-.30:.32);
        for(let side=-1;side<=1;side+=2){
          const lap=reduced?.35:(clock*(.34+i*.07)+seed+i*.43+(side<0?.5:0))%1,drift=lap*lap*(3-2*lap);
          this._at(s,at+s.hx*.10*drift,side*(s.hz*(.74+.60*drift)));
          p.piece(2,this.pose.x,this.pose.z,s.angle+side*(1.1+.35*drift),-scale*.10,scale*(.46+.14*drift),
            scale*.11,scale*.08,side*scale*.20*drift,0,0,seed+i*2.1+side,
            alpha*(reduced?.52:.68*(1-drift*.78)),smooth((age-i*.06)/.22),cold?retired*1.3-.1:-.1,cold?.05:.34);
        }
      }
    }else if(s.kind==='vent'){
      // PIC-31 — a hurt hull breathes pale gas from the stamped hit seat: two
      // parcels peel outward along the wound direction on staggered cycles and
      // fade, so a loaded vent reads before it is repaired. Reduced motion
      // holds one dim seat mark. Cutoff (repair/death) retires through the
      // same fade every other kind uses. Hull-seated geometry, never a halo.
      for(let i=0;i<2;i++){
        const lap=reduced?.45:(clock*(.5+i*.13)+seed+i*.47)%1,drift=lap*lap*(3-2*lap);
        this._at(s,s.ventLx*(1+drift*.8),s.ventLz*(1+drift*.8));
        p.piece(2,this.pose.x,this.pose.z,s.angle+(s.ventSide<0?-1:1)*(.5+.3*drift),-scale*.10,scale*(.5+.22*drift),
          scale*.11,scale*.08,(s.ventSide<0?-1:1)*scale*.16*drift,0,0,seed+i*2.1,
          alpha*(reduced?.42:.62*(1-drift*.72)),smooth((age-i*.06)/.22),cold?retired*1.3-.1:-.1,cold?.05:.3);
      }
    }else if(s.statusId===HEAT_STATUS){
      // Loaded seams remain seated on the heated body: crystal separates pale fracture
      // planes; fuel develops hot rolling lips. This advertises a real approaching reaction.
      const crystal=s.kind==='crystalHeat',load=s.opacity,cut=cold?retired*1.25-.1:-.1;
      for(let i=0;i<3;i++){
        this._at(s,s.hx*(-.45+i*.40),s.hz*(i===1?-.42:.37));
        const ripple=reduced?0:Math.sin(clock*(1.4+i*.27)+seed+i*2.1);
        p.piece(crystal?6:3,this.pose.x,this.pose.z,s.angle+(i===1?.62:-.42),
          -scale*.5,scale*.65,scale*(crystal?.11:.30)*(0.75+load*.45),
          scale*(crystal?.16:.13),scale*.13*ripple,0,0,seed+i*2.1,
          alpha*(.27+load*.67),clamp((age-i*.04)/.22),cut,cold?.07:.30+load*.9);
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
