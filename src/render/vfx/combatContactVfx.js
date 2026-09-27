// Received contacts and subsystem transitions. This pool owns no forces, damage or bodies.
import * as THREE from 'three';
import { modelTruthRowForEntity, modelTruthHitVolume } from '../../data/modelTruth.js';
import { mountDrawScale } from '../../data/modelTruthMounts.js';
import { presentedAnchorXZ, presentedAnchorRot } from '../presentedAnchor.js';
import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';
import { SweptSurfaceBatch } from '../forceLanguage/sweptSurfaceBatch.js';
import { ActionPrimitiveComposer } from './actionPrimitives.js';

const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const recipe=(color,life)=>Object.freeze({color:new THREE.Color(color),life});
const RECIPES=Object.freeze({
  contact:recipe(0xc7b493,.62),consequence:recipe(0xafcbd8,1.05),
  bank:recipe(0xd49c60,.72),mirror:recipe(0xa1c8ec,.85),
  'subsystem.disabled':recipe(0xe79e52,1.35),'subsystem.restored':recipe(0x73c6bb,1.12),
});
function seedOf(value){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return(h>>>0)/4294967296;}

// Camera trauma is dimensionless. Size uses the struck body's real extent and the
// receipted closing speed; even a modest control loss has a readable contact seat.
export function combatContactExtent(radius,speed,consequence=false){
  const size=clamp(finite(radius,6),1,70),energy=clamp(Math.sqrt(Math.max(0,finite(speed))/150));
  return clamp(size*(consequence?.32:.16)+(consequence?2.0:.8)+energy*(consequence?4.5:2),
    consequence?3.4:1.6,consequence?17:8);
}

export function reflectedContactExtent(radius,speed){
  return clamp(Math.max(1,finite(radius,6))*.22+1.5+Math.sqrt(clamp(finite(speed)/150))*2,4,10);
}

export class CombatContactVfx {
  constructor(scene,{toLocal=null,capacity=24}={}){
    this.capacity=clamp(Math.floor(capacity),1,48);
    this.batch=new SweptSurfaceBatch(scene,{capacity:this.capacity*10,name:'SF_CombatContactMatter',fieldVolume:true});
    this.mesh=this.batch.mesh;this.roots=[this.mesh];
    this.composer=new ActionPrimitiveComposer(this.batch,null,toLocal);
    this.slots=Array.from({length:this.capacity},()=>({alive:false}));
    this.pose={x:0,z:0};this.time=0;this.live=0;this.dirty=false;this.disposed=false;
    this.boundsBox=new THREE.Box3();this.boundsCache=new WeakMap();
  }
  _surfaceTop(root,row,scale,radius){
    const hull=root?.userData?.hull,bounds=hull?.userData?.visualBounds||root?.userData?.visualBounds;
    if(bounds?.size)return finite(bounds.center?.[1])+bounds.size[1]*.5;
    if(row?.bounds?.size)return(finite(row.bounds.center?.[1])+row.bounds.size[1]*.5)*scale+finite(row.drawOffset?.[1]);
    // Non-ship authored bodies need their actual drawn height too. Measure an
    // unchanged root once; contacts never traverse model geometry in the frame loop.
    if(root?.isObject3D){
      let cached=this.boundsCache.get(root);const sy=root.scale.y,children=root.children.length;
      if(!cached||cached.hull!==hull||cached.sy!==sy||cached.children!==children){
        root.updateWorldMatrix(true,true);this.boundsBox.setFromObject(root);
        cached={hull,sy,children,top:this.boundsBox.isEmpty()?radius*.4:this.boundsBox.max.y-root.position.y};
        this.boundsCache.set(root,cached);
      }
      return cached.top+root.position.y;
    }
    return radius*.4;
  }
  emit(kind,p,state){
    if(this.disposed||!RECIPES[kind])return false;
    const subsystem=kind.startsWith('subsystem.'),id=p.targetId??p.aId??p.surfaceId;
    const body=state.entities?.get?.(id),pos=p.receipt?.point||p.position||p.pos||body?.pos;
    if(!point(pos)||subsystem&&(!body||body.alive===false))return false;
    const now=finite(state.simTime,this.time);if(now<this.time)this.clear();
    const key=`${kind}:${id}:${p.otherId??p.bId??p.projectileId??p.subsystemId??''}:${p.tick??state.tick??now}`;
    for(const s of this.slots)if(s.key===key&&now-s.born<.12)return true;
    let s=null;for(const item of this.slots)if(!item.alive){s=item;break;}if(!s)return true;
    const radius=Math.max(1,finite(body?.radius,6)),normal=p.receipt?.normal||p.normal;
    let nx=finite(normal?.x,1),nz=finite(normal?.z);const nl=Math.hypot(nx,nz)||1;nx/=nl;nz/=nl;
    if((kind==='contact'||kind==='consequence')&&(nx<0||nx===0&&nz<0)){nx=-nx;nz=-nz;}
    const angle=Math.atan2(nz,nx),rotation=finite(body?.rot);
    const reflected=kind==='bank'||kind==='mirror';
    const speed=reflected?Math.max(Math.hypot(finite(p.incoming?.x),finite(p.incoming?.z)),
      Math.hypot(finite(p.outgoing?.x),finite(p.outgoing?.z))):
      Math.max(0,finite(p.feelDeltaV,finite(p.preSolveClosingSpeed,finite(p.deltaV))));
    const row=body?modelTruthRowForEntity(body):null,scale=row?mountDrawScale(row,body):1;
    const root=state.render?.meshes?.get?.(id)||body?.view?.root||body?.mesh;
    const top=this._surfaceTop(root,row,scale,radius);
    let ox=pos.x-finite(body?.pos?.x),oz=pos.z-finite(body?.pos?.z);
    const cs=Math.cos(rotation),sn=Math.sin(rotation),localX=ox*cs+oz*sn,localZ=-ox*sn+oz*cs;
    ox=localX;oz=localZ;
    if(subsystem){
      const name=String(p.subsystemId||'');
      const volume=modelTruthHitVolume(body,name.startsWith('subsystem_')?name:`subsystem_${name}`);
      // A measured mount names the damaged component. Otherwise this is a hull-level
      // warning, centered on the receiver, never an invented component location.
      ox=volume?.center?volume.center[0]*radius:0;oz=volume?.center?volume.center[1]*radius:0;
    }
    Object.assign(s,{alive:true,key,kind,recipe:RECIPES[kind],born:now,seed:seedOf(key),
      x:pos.x,z:pos.z,y:kind==='consequence'?finite(pos.y,.15):Math.max(finite(pos.y,.15),top-.65),
      angle,body:subsystem?body:null,
      id,ox,oz,rotation,normalAngle:angle-rotation,
      radius:subsystem?clamp(radius*.34,3.6,11):reflected?reflectedContactExtent(radius,speed):
        combatContactExtent(radius,speed,kind==='consequence'),
      incoming:point(p.incoming)?Math.atan2(-p.incoming.z,-p.incoming.x):angle,
      outgoing:point(p.outgoing)?Math.atan2(p.outgoing.z,p.outgoing.x):null,
      strength:clamp(Math.sqrt(speed/150),.12,1),
    });
    this.live++;this.dirty=true;return true;
  }
  update(state){
    if(this.disposed)return;const now=finite(state.simTime,this.time);
    if(now<this.time){this.clear();this.time=now;return;}
    if(!this.live&&!this.dirty){this.time=now;return;}
    if(now===this.time&&!this.dirty)return;this.time=now;
    const acc=resolveVfxAccessibilityProfile(state.settings),reduced=acc.id.includes('motion');
    this.batch.begin(now,reduced,acc.flashOpacityScale<1);
    for(const s of this.slots){
      if(!s.alive)continue;const age=now-s.born;
      if(age>=s.recipe.life||s.body&&(state.entities?.get?.(s.id)!==s.body||s.body.alive===false)){
        s.alive=false;this.live--;continue;
      }
      if(s.body){
        const alpha=finite(state.render?.interpolationAlpha,1),a=presentedAnchorRot(s.body,alpha);
        presentedAnchorXZ(s.body,alpha,this.pose);const c=Math.cos(a),sn=Math.sin(a);
        s.x=this.pose.x+c*s.ox-sn*s.oz;s.z=this.pose.z+sn*s.ox+c*s.oz;s.angle=a;
      }
      this.composer.slot=s;this._draw(s,age,reduced,acc.flashOpacityScale,acc.flashSizeScale);
    }
    this.batch.end();this.dirty=false;
  }
  _draw(s,age,reduced,flash,size){
    const p=this.composer,r=s.radius*size,x=s.x,z=s.z,a=s.angle,t=age/s.recipe.life;
    const alpha=smooth(age/.025)*(1-smooth((t-.62)/.38))*flash;
    const heat=1-smooth((t-.10)/.75),cut=smooth((t-.34)/.65)*1.15-.1;
    const motion=age*(reduced?.25:1),phase=s.seed*6.28318;
    if(s.kind==='contact'||s.kind==='consequence'){
      const hard=s.kind==='consequence';
      // A solver normal is an unsigned axis. Both shoulders answer; the grazing
      // slip runs tangent to that axis, with independently delayed torn crests.
      for(let side=-1;side<=1;side+=2){
        const h=a+(side<0?Math.PI:0),reach=r*(.16+(1-Math.exp(-motion*5.4))*.88);
        p.piece(4,x,z,h,-.64,.69,r*.24,r*(hard?.34:.22),0,0,reach,phase+side,
          alpha*(hard?.85:.68),clamp(age/.07),cut,heat*.70);
        p.piece(3,x,z,a+Math.PI/2,-r*.68,r*.54,r*.13,r*.10,0,side*r*.15,0,
          phase+side,alpha*.70,clamp(age/.10),cut*.82,heat*.40);
        if(hard){
          const onset=smooth((age-.085)/.095),drift=(1-Math.exp(-motion*3.2))*r*.4;
          p.piece(1,x,z,a+side*Math.PI/2,0,r*1.05,r*.19,r*.21,side*r*.25,drift*side,0,
            phase+side*2.1,alpha*onset*.68,clamp((age-.06)/.12),cut+.09,heat*.60);
        }
      }
    }else if(s.kind==='bank'||s.kind==='mirror'){
      const mirror=s.kind==='mirror';
      // Both legs come only from the native reflected-velocity receipt. These
      // short surface paths explain the turn without inventing another projectile.
      p.piece(mirror?5:3,x,z,s.incoming,0,r*.85,r*(mirror?.14:.24),r*.15,r*.13,0,0,
        phase,alpha*(1-smooth((age-.12)/.23)),1,cut,heat*.65);
      if(s.outgoing!==null)p.piece(mirror?2:1,x,z,s.outgoing,0,r*(mirror?1.55:1.25),
        r*(mirror?.19:.24),r*.23,mirror?r*.06:r*.25,0,0,phase+2,
        alpha*smooth((age-.04)/.055),clamp((age-.03)/.13),cut+.05,heat*.8);
      p.piece(mirror?5:6,x,z,a+Math.PI/2,-r*.43,r*.47,r*.14,r*.20,0,0,0,
        phase+4,alpha*.72,clamp(age/.08),cut,heat*.55);
    }else{
      const failed=s.kind==='subsystem.disabled';
      // Failure separates loaded ribs and then lets charge die at each break.
      // Restoration bridges those seats in order before the material cools flat.
      for(let i=0;i<3;i++){
        const delay=i*.075,onset=smooth((age-delay)/.13),side=(i-1)*r*.36;
        const release=failed?(1-Math.exp(-motion*(2.2+i)))*r*.20:0;
        p.piece(failed?5:2,x,z,a+Math.PI/2,-r*(.34+i*.07),r*(.43-i*.04),r*.20,r*.29,
          failed?(i-1)*r*.19:r*.08,side+release*(i-1),0,phase+i*1.7,
          alpha*onset*.92,clamp((age-delay)/.22),cut+i*.08,heat*(failed?.8:.85));
      }
      p.piece(3,x,z,a,-r*.45,r*.5,r*.30,r*.075,0,0,0,phase,
        alpha*.48,clamp(age/.2),cut*.8,heat*.24);
    }
  }
  reproject(dx,dz){this.batch.reproject(dx,dz);if(this.live)this.dirty=true;}
  clear(){for(const s of this.slots){s.alive=false;s.key=null;}this.live=0;this.dirty=false;this.batch.begin(this.time);this.batch.end();}
  dispose(){if(this.disposed)return;this.clear();this.disposed=true;this.batch.dispose();}
}
