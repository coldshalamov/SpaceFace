// Loaded receiver shoulders and the released body's short unloading wake. The native
// Massline owner still decides destination, rating, admission and physical trajectory.
import * as THREE from 'three';
import { SweptSurfaceBatch } from '../forceLanguage/sweptSurfaceBatch.js';
import { ActionPrimitiveComposer } from './actionPrimitives.js';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const seedFor=id=>{let h=2166136261;for(const c of String(id??'point'))h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/4294967296;};

export class MasslineReleaseMatter {
  constructor(scene,toLocal=null,name='SF_MasslineReleaseMatter'){
    this.batch=new SweptSurfaceBatch(scene,{capacity:12,name,fieldVolume:true});
    this.mesh=this.batch.mesh;this.composer=new ActionPrimitiveComposer(this.batch,null,toLocal);
    this.slot={x:0,y:1,z:0,born:0,seed:0,recipe:{life:1,color:new THREE.Color()}};
    this.active=false;this.age=0;this.life=.88;this.body=null;this.targetId=null;
    this.receiverActive=false;this.receiverBody=null;this.receiverId=null;
    this.receiverStage=null;this.receiverReleasedAt=0;
    this.axis=0;this.radius=1;this.score=0;this.disposed=false;
    this.box=new THREE.Box3();
  }
  _height(body,fallback=1){
    const root=body?.view?.root;if(!root)return fallback;
    root.updateWorldMatrix(true,true);this.box.setFromObject(root,true);
    // Work on the visible upper shoulder, never through an opaque receiver centre.
    return this.box.isEmpty()?fallback:this.box.max.y*.72+this.box.min.y*.28;
  }
  receiver(plan,body,now,fade=1){
    if(this.disposed)return false;
    if(!plan?.visible){this.clear();return false;}
    const s=this.slot,p=this.composer;
    if(!this.receiverActive||this.receiverId!==plan.targetId||this.receiverBody!==body){
      s.born=now;s.seed=seedFor(plan.targetId);s.y=this._height(body,plan.y);
      this.receiverId=plan.targetId;this.receiverBody=body;this.receiverActive=true;
      this.receiverStage=null;
    }
    if(plan.stage!==this.receiverStage){this.receiverStage=plan.stage;this.receiverReleasedAt=now;}
    s.x=plan.centerX;s.z=plan.centerZ;s.recipe.color.setRGB(plan.colorR,plan.colorG,plan.colorB);
    const age=Math.max(0,now-s.born),reduced=plan.reducedMotion||plan.reducedFlash;
    const motion=reduced?0:age,r=plan.radius,w=clamp(r*.15,1.4,2.7);
    const quality=plan.quality==='razor'?3:plan.quality==='clean'?2:plan.quality==='good'?1:0;
    const loaded=plan.windowOpen||plan.stage==='released';
    const alpha=fade*(plan.reducedFlash?.58:1)*(.62+plan.proximity*.24);
    const basis=Number.isFinite(body?.rot)?body.rot:plan.startAngle;
    this.batch.begin(now,reduced,plan.reducedFlash);p.slot=s;
    for(let i=0;i<3;i++){
      // Three unequal open seats occupy less than half the circumference. Their
      // folds carry current; there is no repeated tiled annulus or fake blast radius.
      const angle=basis+s.seed*.4+i*2.13,span=.72+i*.15+quality*.045;
      const feed=clamp((age-i*.055)/.20),lift=w*(.72+i*.18);
      const drift=reduced?0:Math.sin(motion*(1.5+i*.37)+i*2.1)*w*.15;
      const cutoff=plan.stage==='released'?clamp((now-this.receiverReleasedAt-.06-i*.035)/.27)-.1:-.1;
      p.piece(4,s.x,s.z,angle,-span*.5,span*.5,w*(.80-i*.10),lift,0,0,
        r+drift,i*2.3,alpha,feed,cutoff,loaded?1.15:.67);
      // Independently travelling charge seats meet the loaded lip, then discharge.
      const at=reduced?.34:(motion*(.39+i*.11)+s.seed+i*.29)%1;
      const a=angle-span*.46+span*.76*at;
      const x=s.x+Math.cos(a)*(r+w*.5),z=s.z+Math.sin(a)*(r+w*.5);
      p.piece(2,x,z,a+Math.PI/2,-w*.85,w*(1.15+i*.15),w*.55,lift*.55,w*.24,0,0,
        i*1.7,alpha*(.45+.45*Math.sin(Math.PI*at)),feed,cutoff+.12,loaded?1.45:.8);
    }
    this.batch.end();return this.mesh.visible;
  }
  release(body,now,score=0){
    if(this.disposed||body?.alive===false||!point(body?.pos)||!point(body?.vel))return false;
    if(Math.hypot(body.vel.x,body.vel.z)<1e-4)return false;
    this.clear();this.body=body;this.targetId=body.id;this.active=true;this.age=0;
    this.axis=Math.atan2(body.vel.z,body.vel.x);
    this.radius=Math.max(1,Number.isFinite(body.radius)?body.radius:1);
    this.score=clamp(score);this.slot.born=now;this.slot.seed=seedFor(body.id);
    this.slot.y=this._height(body,1);this.slot.recipe.color.setRGB(.49,.89,1);
    return true;
  }
  updateRelease(now,body,reduced=false,flash=false){
    if(this.disposed||!this.active)return false;
    const s=this.slot;this.age=now-s.born;
    if(this.age<0||this.age>=this.life||body!==this.body||body?.alive===false||!point(body?.pos)){
      this.clear();return false;
    }
    const p=this.composer,age=this.age,r=this.radius,w=clamp(r*.23,1.05,3.0);
    const speed=point(body.vel)?Math.hypot(body.vel.x,body.vel.z):0;
    if(speed>1e-4)this.axis=Math.atan2(body.vel.z,body.vel.x);
    const a=this.axis,c=Math.cos(a),sn=Math.sin(a),motion=reduced?0:age;
    s.x=body.pos.x;s.z=body.pos.z;
    this.batch.begin(now,reduced||flash,flash);p.slot=s;
    for(let i=0;i<3;i++){
      const delay=i*.045,elapsed=Math.max(0,age-delay),side=i===1?-1:1;
      const feed=clamp(elapsed/.11),cut=clamp((elapsed-.17-i*.025)/(.47-i*.04))-.10;
      const cool=1-smooth((elapsed-.37-i*.025)/.43),alpha=smooth(elapsed/.045)*cool*(flash?.58:1);
      if(alpha<.005)continue;
      // The wake leaves the real rear/side of the flying mass. Extent is a few
      // body radii, capped in world units; each fold peels and drains separately.
      const flank=side*r*(i===2?.48:.82),rear=r*(i===2?.88:.40);
      const x=s.x-c*rear-sn*flank,z=s.z-sn*rear+c*flank;
      const length=clamp(r*(1.45+i*.31),5,21);
      const peel=reduced?0:(1-Math.exp(-motion*(2.6+i*.7)))*w*side*(.55+i*.16);
      p.piece(1,x,z,a+Math.PI+side*(.12+i*.045),0,length,w*(1-i*.17),w*(.9-i*.14),
        side*w*(.44+i*.13),peel,0,i*2.1,alpha,feed,cut,1.25+this.score*.38-i*.15);
      p.piece(2,x,z,a+Math.PI+side*.20,length*.22,length*.62,w*.52,w*.42,side*w*.30,
        peel*.65,side,i*2.7,alpha*.78,clamp((elapsed-.06)/.10),cut+.13,1.55);
    }
    this.batch.end();return this.mesh.visible;
  }
  clear(){
    this.active=false;this.receiverActive=false;this.body=null;this.targetId=null;
    this.receiverBody=null;this.receiverId=null;
    if(!this.disposed){this.batch.begin();this.batch.end();}
  }
  reproject(dx,dz){this.batch.reproject(dx,dz);}
  dispose(){if(this.disposed)return;this.clear();this.disposed=true;this.batch.dispose();}
}
