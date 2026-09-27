// Receipted action responses share one bounded surface batch and transported mesh matter.
// Source/contact ownership lives here; reusable physical constructions live in actionPrimitives.
import * as THREE from 'three';
import { SweptSurfaceBatch } from './forceLanguage/sweptSurfaceBatch.js';
import { ForceParticleFlow } from './vfx/forceParticleFlow.js';
import { ActionPrimitiveComposer, actionPrimitiveForVerb } from './vfx/actionPrimitives.js';
import { ADDITIONAL_ACTION_VFX_RECIPES, resolveAdditionalActionVfxReceipt } from './vfx/actionEventRecipes.js';
import { presentedAnchorXZ, presentedAnchorRot } from './presentedAnchor.js';
import { readFrameOrigin } from './frameCoordinates.js';
import { modelTruthNozzleOrigin, modelTruthPlumeSocketName, modelTruthSocketWorld } from '../data/modelTruth.js';

const recipe=(verb,color,life=.65,extra={})=>Object.freeze({verb,life,
  primitive:actionPrimitiveForVerb(verb),continuous:verb==='repair'||verb==='transfer',...extra,
  color:new THREE.Color(color)});
const additional={};
for(const [name,value] of Object.entries(ADDITIONAL_ACTION_VFX_RECIPES)){
  const variants={};
  for(const [kind,variant] of Object.entries(value.variants||{}))
    variants[kind]=recipe(variant.verb??value.verb,variant.color??value.color,variant.life??value.life,{...value,...variant,variants:undefined});
  additional[name]=recipe(value.verb,value.color,value.life,{...value,variants});
}
export const ACTION_VFX_RECIPES=Object.freeze({
  'well:capture':recipe('capture',0x87caff,.75),
  'well:fling':recipe('fling',0xb6e8ff,.6),
  'well:grind':recipe('grind',0xffbe74,.5),
  'fields:hitchLatched':recipe('latch',0x65eadb,.55),
  'fields:hitchCut':recipe('cut',0x9ad0c4,.55),
  'fields:specialistDisrupt':recipe('disrupt',0xbe9eff,.75),
  'chain:primed':recipe('prime',0xffb358,.8),
  'chain:primeEnded':recipe('cool',0x759cbb,.5),
  'charge:combo':recipe('combo',0xffdc93,.65),
  'beam:repaired':recipe('repair',0x84ffd2,.45),
  'beam:transferred':recipe('transfer',0x9bdfff,.45),
  'bombs:commanded':recipe('command',0xffca86,.55),
  'ship:boostPreKick':recipe('ignition',0xa9eaff,.24),
  'salvage:reactorVented':recipe('vent',0xffb271,1.15),
  'cargo:caughtByNet':recipe('catch',0x85e7cf,.65),
  'mining:richCoreCompleted':recipe('harvest',0xffdf96,.85),
  'mining:richCoreFizzle':recipe('cool',0x8cacca,.6),
  'weapons:mineArmed':recipe('arm',0x80d4ff,.75),
  'weapons:mineDetonated':recipe('shove',0xa1dcff,.6),
  ...additional,
});
export const ACTION_VFX_EVENTS=Object.freeze(Object.keys(ACTION_VFX_RECIPES));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
function salt(id) {let h=2166136261;const s=String(id);for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0)/4294967296;}
function entity(state,id){return id==null?null:state.entities?.get?.(id);}
function valid(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.z);}
function field(state,id){const list=state.fields?.active;if(list)for(const f of list)if(f.id===id)return f;return null;}
// These two receipts are published exclusively by the player-owned mining/repair tool.
// No other action may silently borrow the player's identity or position.
const PLAYER_TOOL_EVENTS=new Set(['beam:repaired','beam:transferred']);
function localOffset(pos,body,out,prefix){
  const a=finite(body.rot),c=Math.cos(a),s=Math.sin(a),dx=pos.x-body.pos.x,dz=pos.z-body.pos.z;
  out[prefix+'x']=c*dx+s*dz;out[prefix+'z']=-s*dx+c*dz;
}

export class ActionVfx {
  constructor(scene,toLocal=null){
    this.batch=new SweptSurfaceBatch(scene,{capacity:256,name:'SF_ActionAnswers',fieldVolume:true});
    this.mesh=this.batch.mesh;this.toLocal=toLocal;
    this.particles=new ForceParticleFlow(this.mesh,{capacity:192});
    this.particleOptions={reducedMotion:false,reducedFlash:false};
    this.composer=new ActionPrimitiveComposer(this.batch,this.particles,toLocal);
    this.anchor={x:0,z:0};this.origin={x:0,z:0};this.socketWorld=new THREE.Vector3();
    this.time=0;this.serial=0;this.live=0;this.disposed=false;
    this.slots=Array.from({length:32},()=>({alive:false,event:null,kind:null,id:null,sourceId:null,attached:false,born:0,last:0,
      x:0,y:0,z:0,sx:0,sz:0,radius:1,angle:0,angleOffset:0,seed:0,recipe:null,particlePulse:-1,
      tx:0,tz:0,ox:0,oz:0,target:null,source:null,socket:null,sourceSocket:null,hasSource:false,
      provenance:'none',sourceProvenance:'none'}));
  }
  emit(name,p={},state={}){
    if(this.disposed)return false;
    p=resolveAdditionalActionVfxReceipt(name,p,state);if(!p)return false;
    const entry=ACTION_VFX_RECIPES[name];if(!entry)return false;
    const recipe=entry.variants?.[p.kind]??entry;
    const id=p.targetId??p.victimId??p.entityId??p.shipId??p.podId??p.asteroidId??p.mineId??p.wreckId??p.ownerId??p.sourceId??p.aId;
    const target=entity(state,id);
    const sourceId=p.sourceId??p.ownerId??p.actorId??p.byId??p.minerId??p.netId
      ??(PLAYER_TOOL_EVENTS.has(name)?state.playerId:null);
    const source=entity(state,sourceId),well=field(state,p.wellId??p.fieldId);
    const contact=valid(p.contactPoint)?p.contactPoint:valid(p.pos)?p.pos:valid(p.position)?p.position:null;
    let pos=contact??target?.pos??well?.center??source?.pos;
    if(!valid(pos))return false;
    const now=finite(state.simTime);
    let slot=null;
    for(const s of this.slots)if(s.event===name&&s.kind===(p.kind??null)&&s.id===id&&s.alive){slot=s;break;}
    if(slot&&now-slot.last<.14)return false;
    if(!slot)for(const s of this.slots)if(!s.alive){slot=s;break;}
    if(!slot)return false;
    const sustained=slot.alive&&recipe.continuous;
    if(!slot.alive)this.live++;
    slot.alive=true;slot.event=name;slot.kind=p.kind??null;slot.id=id;slot.sourceId=sourceId;slot.recipe=recipe;
    slot.target=target;slot.source=source;slot.socket=slot.sourceSocket=null;
    slot.attached=!!target&&(!contact||p.attachToTarget===true)&&recipe.verb!=='grind';
    if(!sustained){slot.born=now;slot.particlePulse=-1;slot.seed=salt(String(id)+':'+name+':'+(p.kind??'')+':'+(++this.serial)+':'+Math.round(now*1000));}
    slot.last=now;slot.radius=Math.max(2.5,Math.min(24,finite(target?.radius,5)));
    if(recipe.verb==='arm')slot.radius=Math.max(6,slot.radius*1.5);
    if(recipe.verb==='shove')slot.radius=Math.max(8,Math.min(24,finite(p.blastRadius,100)*.14));
    const heading=valid(p.direction)?p.direction:valid(p.dir)?p.dir:valid(p.normal)?p.normal:null;
    slot.angle=heading?Math.atan2(heading.z,heading.x):Math.hypot(finite(target?.vel?.x),finite(target?.vel?.z))>1
      ?Math.atan2(target.vel.z,target.vel.x):finite(target?.rot,finite(source?.rot));
    slot.provenance=contact?'receipt':target?'body':'field';
    // A real source socket is kept as an object, so rotation and authored offsets follow the
    // drawn port. Census data supplies the fitted port only when its scene object is absent.
    if(target&&recipe.verb==='ignition'){
      const socketName=p.socketName??modelTruthPlumeSocketName(target);
      slot.socket=socketName?target.view?.root?.getObjectByName?.(socketName):null;
      const nozzle=!contact?modelTruthNozzleOrigin(target):null;
      if(nozzle){pos=nozzle;slot.provenance='measured-nozzle';}
      else if(!contact){
        this.anchor.x=target.pos.x-Math.cos(finite(target.rot))*slot.radius*.85;
        this.anchor.z=target.pos.z-Math.sin(finite(target.rot))*slot.radius*.85;pos=this.anchor;slot.provenance='aft-body-port';
      }
      slot.angle=heading?slot.angle:finite(target.rot)+Math.PI;
    }
    // Missing contact coordinates resolve to the body-facing surface, not a hull-wide flash.
    // Receipted contacts are never changed. Source-less actions retain one small local patch.
    if(!contact&&target&&['repair','grind','harvest','cool','vent'].includes(recipe.verb)){
      let a=heading?slot.angle:valid(source?.pos)&&source!==target?Math.atan2(source.pos.z-target.pos.z,source.pos.x-target.pos.x):finite(target.rot)+Math.PI*.5;
      this.anchor.x=target.pos.x+Math.cos(a)*slot.radius*.82;
      this.anchor.z=target.pos.z+Math.sin(a)*slot.radius*.82;pos=this.anchor;
      slot.angle=a;slot.provenance='body-surface';
    }
    slot.x=pos.x;slot.y=finite(pos.y);slot.z=pos.z;
    slot.tx=slot.tz=slot.ox=slot.oz=0;
    if(slot.attached)localOffset(pos,target,slot,'t');
    slot.angleOffset=slot.angle-finite(target?.rot);
    const sourcePoint=valid(p.sourcePos)?p.sourcePos:valid(p.socketPos)?p.socketPos:null;
    const sourceName=p.sourceSocketName;
    slot.sourceSocket=source&&sourceName?source.view?.root?.getObjectByName?.(sourceName):null;
    const measured=source&&sourceName&&!sourcePoint?modelTruthSocketWorld(source,sourceName):null;
    let start=sourcePoint??measured??well?.center??source?.pos;
    slot.hasSource=!!valid(start);
    slot.sourceProvenance=sourcePoint?'receipt':measured||slot.sourceSocket?'socket':well?'field':source?'body':'none';
    if(!start)start=pos;
    slot.sx=start.x;slot.sz=start.z;
    if(source&&valid(source.pos)){
      // With no authored source port, meet the nearer hull surface rather than originate
      // inside its centre. This approximation is bounded and follows its actual body.
      if(!sourcePoint&&!measured&&!well&&source!==target){
        const a=Math.atan2(pos.z-source.pos.z,pos.x-source.pos.x),r=finite(source.radius,0)*.82;
        slot.sx+=Math.cos(a)*r;slot.sz+=Math.sin(a)*r;
      }
      this.anchor.x=slot.sx;this.anchor.z=slot.sz;localOffset(this.anchor,source,slot,'o');
    }
    return true;
  }
  _follow(s,state){
    const alpha=finite(state.render?.interpolationAlpha,1);
    const target=entity(state,s.id);
    if(s.attached&&target===s.target&&target?.alive!==false&&valid(target?.pos)){
      const rot=presentedAnchorRot(target,alpha),c=Math.cos(rot),a=Math.sin(rot);
      presentedAnchorXZ(target,alpha,this.anchor);
      s.x=this.anchor.x+c*s.tx-a*s.tz;s.z=this.anchor.z+a*s.tx+c*s.tz;
      s.angle=rot+s.angleOffset;
      s.radius=Math.max(2.5,Math.min(24,finite(target.radius,s.radius)))*(s.recipe.verb==='arm'?1.5:1);
      if(s.socket?.parent){
        s.socket.updateWorldMatrix(true,false);s.socket.getWorldPosition(this.socketWorld);
        s.x=this.socketWorld.x+this.origin.x;s.z=this.socketWorld.z+this.origin.z;s.y=this.socketWorld.y;
      }
    }
    const source=entity(state,s.sourceId);
    if(source===s.source&&source?.alive!==false&&valid(source?.pos)&&s.sourceProvenance!=='field'){
      const rot=presentedAnchorRot(source,alpha),c=Math.cos(rot),a=Math.sin(rot);
      presentedAnchorXZ(source,alpha,this.anchor);
      s.sx=this.anchor.x+c*s.ox-a*s.oz;s.sz=this.anchor.z+a*s.ox+c*s.oz;
      if(s.sourceSocket?.parent){
        s.sourceSocket.updateWorldMatrix(true,false);s.sourceSocket.getWorldPosition(this.socketWorld);
        s.sx=this.socketWorld.x+this.origin.x;s.sz=this.socketWorld.z+this.origin.z;
      }
    }
  }
  update(state={}){
    if(this.disposed)return 0;
    const now=finite(state.simTime,this.time),elapsed=Math.max(0,now-this.time);
    if(now<this.time)this.clear();this.time=now;
    if(!this.live&&!this.particles.live)return 0;
    const video=state.settings?.video,a11y=state.settings?.accessibility;
    const reduced=!!(video?.motionReduce||a11y?.reducedMotion||a11y?.motionReduce);
    const flash=!!(video?.flashReduce||a11y?.flashReduce||a11y?.reducedFlash);
    this.particleOptions.reducedMotion=reduced;this.particleOptions.reducedFlash=flash;
    if(reduced)this.particles.clear();else this.particles.update(elapsed,this.particleOptions);
    readFrameOrigin(state,this.origin);this.batch.begin(now,reduced,flash);this.live=0;
    for(const s of this.slots){
      if(!s.alive)continue;
      const since=now-(s.recipe.continuous?s.last:s.born);
      if(since>=s.recipe.life){s.alive=false;continue;}
      this.live++;this._follow(s,state);this.composer.render(s,now,reduced,flash);
    }
    this.batch.end();this.mesh.visible=this.batch.count>0||this.particles.live>0;return this.live;
  }
  inspect(){return {schema:'spaceface.action-primitives.v1',time:this.time,active:this.live,
    surfaces:this.batch.count,particles:this.particles.live,capacity:this.slots.length,
    instances:this.slots.filter(s=>s.alive).map(s=>({event:s.event,kind:s.kind,id:s.id,sourceId:s.sourceId,
      primitive:s.recipe.primitive,provenance:s.provenance,sourceProvenance:s.sourceProvenance,
      born:s.born,last:s.last,x:s.x,y:s.y,z:s.z,sx:s.sx,sz:s.sz,angle:s.angle}))};}
  reproject(dx,dz){this.batch.reproject(dx,dz);this.particles.reproject(dx,dz);}
  clear(){for(const s of this.slots)s.alive=false;this.live=0;this.particles.clear();this.batch.begin(this.time);this.batch.end();}
  dispose(){if(this.disposed)return;this.particles.dispose();this.batch.dispose();this.disposed=true;this.live=0;}
}
