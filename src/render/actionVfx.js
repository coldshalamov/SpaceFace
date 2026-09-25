// Small physical answers to actions that previously only changed simulation state.
// Uses the already precompiled folded-surface program; one bounded draw, no new lights.
import * as THREE from 'three';
import { SweptSurfaceBatch } from './forceLanguage/sweptSurfaceBatch.js';

const recipe=(verb,color,life=.65)=>Object.freeze({verb,color:new THREE.Color(color),life});
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
});
export const ACTION_VFX_EVENTS=Object.freeze(Object.keys(ACTION_VFX_RECIPES));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const TAU=Math.PI*2;
function salt(id) {let h=2166136261;const s=String(id);for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0)/4294967296;}
function entity(state,id){return id==null?null:state.entities?.get?.(id);}
function valid(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.z);}
function field(state,id){const list=state.fields?.active; if(list)for(const f of list)if(f.id===id)return f;return null;}

export class ActionVfx {
  constructor(scene,toLocal=null){
    this.batch=new SweptSurfaceBatch(scene,{capacity:192,name:'SF_ActionAnswers'});
    this.mesh=this.batch.mesh;this.toLocal=toLocal;this.local={x:0,z:0};
    this.d=new Float32Array(24);this.time=0;this.serial=0;this.live=0;this.disposed=false;
    this.slots=Array.from({length:32},()=>({alive:false,event:null,id:null,sourceId:null,attached:false,born:0,last:0,
      x:0,z:0,sx:0,sz:0,radius:1,angle:0,seed:0,recipe:null}));
  }
  emit(name,p={},state={}){
    if(this.disposed)return false;
    const recipe=ACTION_VFX_RECIPES[name];if(!recipe)return false;
    const id=p.targetId??p.victimId??p.entityId??p.ownerId??p.sourceId??p.aId;
    const target=entity(state,id);
    const sourceId=p.ownerId??p.actorId??p.byId??p.sourceId??state.playerId;
    const source=entity(state,sourceId);
    const well=field(state,p.wellId??p.fieldId);
    const pos=valid(p.pos)?p.pos:target?.pos??well?.center??source?.pos;
    if(!valid(pos))return false;
    const now=finite(state.simTime);
    let slot=null;
    for(const s of this.slots)if(s.event===name&&s.id===id&&s.alive){slot=s;break;}
    // Continuous tools renew a single working contact. Same-tick duplicate receipts are silent.
    if(slot && now-slot.last<.14)return false;
    if(!slot)for(const s of this.slots)if(!s.alive){slot=s;break;}
    if(!slot)return false;
    const start=well?.center??source?.pos??pos;
    if(!slot.alive)this.live++;
    const sustained=slot.alive&&(recipe.verb==='repair'||recipe.verb==='transfer');
    slot.alive=true;slot.event=name;slot.id=id;slot.sourceId=sourceId;slot.recipe=recipe;
    // A receipted point is a contact snapshot (including sling-bomb combos), not the owner's hull.
    slot.attached=!valid(p.pos)&&recipe.verb!=='grind';
    if(!sustained)slot.born=now;
    slot.last=now;slot.x=pos.x;slot.z=pos.z;slot.sx=start.x;slot.sz=start.z;
    slot.radius=Math.max(2.5,Math.min(24,finite(target?.radius,5)));
    slot.angle=Math.atan2(finite(target?.vel?.z),finite(target?.vel?.x));
    if(Math.hypot(finite(target?.vel?.x),finite(target?.vel?.z))<1)slot.angle=finite(target?.rot);
    if(!sustained)slot.seed=salt(String(id)+':'+(++this.serial)+':'+Math.round(now*1000));
    return true;
  }
  _strip(s,x,z,angle,start,end,width,bow,phase,opacity,type=1,a1=0){
    const d=this.d,c=s.recipe.color;
    if(this.toLocal)this.toLocal(x,z,this.local);else{this.local.x=x;this.local.z=z;}
    d[0]=this.local.x;d[1]=.65;d[2]=this.local.z;d[3]=angle;
    d[4]=type;d[5]=0;d[6]=a1;d[7]=start;d[8]=end;d[9]=width;d[10]=width*.7;d[11]=bow;
    d[12]=c.r*1.65;d[13]=c.g*1.65;d[14]=c.b*1.65;d[15]=opacity;
    d[16]=1;d[17]=phase+s.seed;d[18]=0;d[19]=s.recipe.verb==='grind'?3:0;
    d[20]=1;d[21]=1;d[22]=1;d[23]=0;
    this.batch.add(d);
  }
  update(state={}){
    if(this.disposed)return 0;
    const now=finite(state.simTime,this.time);
    if(now<this.time)this.clear();this.time=now;
    if(!this.live)return 0;
    const video=state.settings?.video,a11y=state.settings?.accessibility;
    const reduced=!!(video?.motionReduce||a11y?.reducedMotion||a11y?.motionReduce);
    const flash=!!(video?.flashReduce||a11y?.flashReduce||a11y?.reducedFlash);
    this.batch.begin(now,reduced,flash);this.live=0;
    for(const s of this.slots){
      if(!s.alive)continue;
      const age=now-s.born,continuous=s.recipe.verb==='repair'||s.recipe.verb==='transfer';
      const t=(now-(continuous?s.last:s.born))/s.recipe.life;
      if(t>=1){s.alive=false;continue;}this.live++;
      const target=entity(state,s.id);
      // Attached work follows the actual body. Contact/grind snapshots stay at their true contact.
      if(s.attached&&target?.alive!==false&&valid(target?.pos)){s.x=target.pos.x;s.z=target.pos.z;}
      const r=s.radius,verb=s.recipe.verb;
      const u=reduced ? .35 : (continuous?age/s.recipe.life:Math.max(0,t)),attack=Math.min(1,age/.045);
      const cooling=continuous?1-Math.max(0,(t-.5)*2):1-t;
      const op=attack*cooling*(flash ? .4 : .92),turn=s.seed*TAU;
      if(verb==='transfer'||verb==='latch'||verb==='cut'){
        const source=entity(state,s.sourceId);
        if(valid(source?.pos)){s.sx=source.pos.x;s.sz=source.pos.z;}
        const dx=s.x-s.sx,dz=s.z-s.sz,len=Math.hypot(dx,dz);
        if(len>.01){
          const angle=Math.atan2(dz,dx),peel=verb==='cut'?1-u:1;
          for(let k=0;k<3;k++){
            const at=verb==='transfer'?((u*.8+k/3)%1):k*.28;
            this._strip(s,s.sx,s.sz,angle,len*at,len*(at+Math.min(1-at,.20)*peel),
              Math.min(1.3,r*.16),Math.min(4,len*.03)*Math.sin(k+turn+u*3),k/3,op);
          }
        }
      }else if(verb==='repair'||verb==='prime'||verb==='cool'){
        // Weld seams traverse the hull; priming clamps tighten and spent clamps fall away.
        for(let k=0;k<4;k++){
          const a=turn+k*TAU/4,rad=r*(verb==='repair'?1:verb==='cool'?1+u*.45:1.15-u*.3);
          const x=s.x+Math.cos(a)*rad,z=s.z+Math.sin(a)*rad;
          this._strip(s,x,z,a+Math.PI/2,-r*.45,r*.45,r*.11,verb==='repair'?r*.25*Math.sin(u*5+k):r*.08,k/4,op);
        }
      }else if(verb==='fling'||verb==='combo'||verb==='grind'){
        const angle=verb==='grind'?turn:s.angle;
        for(let k=0;k<5;k++){
          const spread=(k-2)*(verb==='grind'?.72:.17),reach=r*(.8+u*2.4)*(1+s.seed*.4);
          this._strip(s,s.x,s.z,angle+spread,r*.3,reach,r*(.08+k%2*.025),r*.13*Math.sin(k+u*4),k/5,op);
        }
      }else{
        // Capture draws curved jaws inward; disruption/command peels broken fronts outward.
        const inward=verb==='capture',reach=r*(inward?2.4-u*1.7:1+u*2.3);
        for(let k=0;k<5;k++)this._strip(s,s.x,s.z,turn+k*TAU/5,
          reach,reach*(inward?.48:1.12),r*.12,0,k/5,op,0,inward?.8:.43);
      }
    }
    this.batch.end();return this.live;
  }
  reproject(dx,dz){this.batch.reproject(dx,dz);}
  clear(){for(const s of this.slots)s.alive=false;this.live=0;this.batch.begin(this.time);this.batch.end();}
  dispose(){if(this.disposed)return;this.batch.dispose();this.disposed=true;this.live=0;}
}
