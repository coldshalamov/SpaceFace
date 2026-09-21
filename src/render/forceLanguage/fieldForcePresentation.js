import * as THREE from 'three';
import { fieldSignature, SURFACE_MATERIALS } from './catalog.js';
import { SweptSurfaceBatch, SURFACE_FLOATS } from './sweptSurfaceBatch.js';
import { FIELD_LIFECYCLES, FIELD_ROLE, sampleFieldLifecycle } from './effectLifecycle.js';
export { FIELD_RELEASE_SECONDS } from './effectLifecycle.js';

export const FIELD_PRESENTATION_CAPACITY=7; // six simulation fields PLUS the published Seed
const TAU=Math.PI*2;
const clamp01=(v)=>Math.max(0,Math.min(1,v));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const COLORS=new Map();
// Allocate colors once; recipes never parse CSS or allocate Color objects in the frame loop.
for(const value of [0x54e5ed,0xffc36c,0x58bdff,0xb9a2ff,0xffb766,0xffe1a4,0xb7f5ff,0x79f0c8,0xd9ffe0])COLORS.set(value,new THREE.Color(value));

/** A read-only adapter over fields.active and massSeed. No event listeners, forces or RNG. */
export class FieldForcePresentation {
  constructor(scene,{toLocal=null}={}){
    this.batch=new SweptSurfaceBatch(scene,{capacity:224,name:'SF_FieldForceLanguage'});
    this.mesh=this.batch.mesh;this.toLocal=toLocal;
    this.local={x:0,z:0};this.descriptor=new Float32Array(SURFACE_FLOATS);
    this.slots=Array.from({length:10},()=>({
      id:null,seedId:null,kind:null,born:0,lastSeen:0,release:-1,x:0,z:0,radius:0,angle:0,seen:false,reserved:false,
      // The producer REUSES its records. Keep value snapshots, not foreign record references,
      // so a retiring Well cannot become the Cone subsequently stored in the same array cell.
      field:{engaged:false,halfAngleRad:0.56,halfWidth:52},
      seed:{phase:'active',lockAt:0,activeAt:0,warnAt:0,expireAt:0},
    }));
    this.material=SURFACE_MATERIALS.plain;
    this.time=0;this.frame=0;this.disposed=false;
    this.frustum=new THREE.Frustum();this.clip=new THREE.Matrix4();this.sphere=new THREE.Sphere();
    this.stats={active:0,releasing:0,surfaces:0,dropped:0,unknown:0,culled:0};
  }
  _valid(field){
    return field && field.id!=null && Number.isFinite(field.center?.x) && Number.isFinite(field.center?.z)
      && Number.isFinite(field.radius) && field.radius>0;
  }
  _matches(slot,field,seedId){return slot.release<0 && slot.id===field.id && slot.kind===field.kind && (field.kind!=='seed'||slot.seedId===seedId);}
  _accept(field,state){
    if(!this._valid(field))return;
    if(!fieldSignature(field.kind)){this.stats.unknown++;return;}
    const seedId=state.massSeed?.seedId??null;
    let slot=null;
    for(const s of this.slots)if(this._matches(s,field,seedId)){slot=s;break;}
    if(!slot){
      // Never evict an active published field to accommodate decorative decay.
      for(const candidate of this.slots)if(candidate.id===null){slot=candidate;break;}
      if(!slot)for(const candidate of this.slots)if(candidate.release>=0){slot=candidate;break;}
      if(!slot)for(const candidate of this.slots)if(!candidate.reserved){slot=candidate;break;}
      if(!slot){this.stats.dropped++;return;}
      slot.id=field.id;slot.kind=field.kind;slot.seedId=seedId;slot.born=this.time;
    }
    slot.seen=true;slot.release=-1;slot.lastSeen=this.time;
    slot.field.engaged=field.engaged===true;
    slot.field.halfAngleRad=finite(field.halfAngleRad,0.56);
    slot.field.halfWidth=finite(field.halfWidth,52);
    if(field.kind==='seed'){
      const seed=state.massSeed;
      slot.seed.phase=seed?.phase||'active';
      slot.seed.lockAt=finite(seed?.lockAt,this.time);
      slot.seed.activeAt=finite(seed?.activeAt,this.time);
      slot.seed.warnAt=finite(seed?.warnAt,this.time);
      slot.seed.expireAt=finite(seed?.expireAt,this.time);
    }
    slot.x=field.center.x;slot.z=field.center.z;slot.radius=field.radius;
    const dx=finite(field.dir?.x,1),dz=finite(field.dir?.z);
    slot.angle=Math.abs(dx)+Math.abs(dz)>1e-6?Math.atan2(dz,dx):0;
    this.stats.active++;
  }
  update(dt,state={}){
    if(this.disposed)return this.stats;
    const clock=Number.isFinite(state.simTime)?state.simTime:this.time+Math.max(0,finite(dt));
    // A restored/new simulation may rewind the clock. Release old purely cosmetic identities.
    if(clock<this.time)for(const s of this.slots){s.id=null;s.release=-1;}
    this.time=clock;this.frame++;
    const video=state.settings?.video,a11y=state.settings?.accessibility;
    const motion=!!(video?.motionReduce||a11y?.reducedMotion||a11y?.motionReduce);
    const flash=!!(video?.flashReduce||a11y?.flashReduce||a11y?.reducedFlash);
    const stats=this.stats;stats.active=0;stats.releasing=0;stats.dropped=0;stats.unknown=0;stats.culled=0;
    const camera=state.render?.camera;
    const cull=!!(camera?.projectionMatrix&&camera?.matrixWorldInverse);
    if(cull)this.frustum.setFromProjectionMatrix(this.clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const list=state.fields?.active;
    const count=Array.isArray(list)?list.length:0;
    for(const s of this.slots){
      s.seen=false;s.reserved=false;
      for(let i=0;i<count;i++)if(this._valid(list[i])&&this._matches(s,list[i],state.massSeed?.seedId??null)){s.reserved=true;break;}
    }
    // Seed is appended by the simulation. Do not lose it to the six-field limit.
    for(let i=0;i<count;i++)if(list[i]?.kind==='seed'){this._accept(list[i],state);break;}
    let accepted=0;
    for(let i=0;i<count;i++){
      const f=list[i];if(f?.kind==='seed')continue;
      if(accepted>=6){stats.dropped++;continue;}
      const before=stats.active;this._accept(f,state);if(stats.active>before)accepted++;
    }
    this.batch.begin(this.time,motion,flash);
    for(const s of this.slots){
      if(s.id===null)continue;
      if(!s.seen){
        if(s.release<0)s.release=this.time;
        const releaseSeconds=FIELD_LIFECYCLES[s.kind].release;
        if(this.time-s.release>=releaseSeconds){s.id=null;continue;}
        stats.releasing++;
        // Keep the last visible body for a distinct breakup. The boundary disappears on this
        // very frame and the shader freezes live transport at releaseAt; only residue retires.
      }
      const sig=fieldSignature(s.kind);
      if(!sig)continue;
      this._position(s);
      if(cull){
        this.sphere.center.set(this.local.x,0.45,this.local.z);this.sphere.radius=s.radius*1.12;
        if(!this.frustum.intersectsSphere(this.sphere)){stats.culled++;continue;}
      }
      this.slot=s;this.cycle=FIELD_LIFECYCLES[s.kind];this.releasing=s.release>=0;
      this.tint=COLORS.get(sig.color);this.alpha=0.88+(s.field.engaged?0.12:0);
      this.reveal=1; // birth, geometric build, and release are owned by iLife in the shader
      this.orientation=s.angle;this.engaged=s.field.engaged===true;
      // `engaged` means a body was affected THIS TICK, not that the tool is switched on.
      // Empty-space tools remain alive. The shader's motion uniform handles accessibility.
      this.moving=true;this.flow=1;this.style=0;this.role=FIELD_ROLE.BODY;this.phaseOffset=0;
      this.material=SURFACE_MATERIALS.plain;this.radius=s.radius;
      switch(s.kind){
        case 'seed':this._seed(s,s.seed,motion);break;
        case 'well':this._well(s);break;
        case 'repulsor':this._repulsor(s);break;
        case 'cone':this._cone(s);break;
        case 'sheet':this._sheet(s);break;
      }
    }
    this.batch.end();stats.surfaces=this.batch.count;stats.dropped+=this.batch.dropped;
    return stats;
  }
  _position(slot){
    if(this.toLocal)this.toLocal(slot.x,slot.z,this.local);
    else {this.local.x=slot.x;this.local.z=slot.z;}
  }
  _surface(type,a0,a1,r0,r1,width,lift=0,bow=0,phase=0,travel=0,taper=1,alpha=1,x=0,z=0,flow=this.flow,style=this.style){
    // Positional recipe descriptors avoid per-surface option objects in the render loop.
    // Slots, geometry, float buffers and colors are allocated once at owner construction.
    const d=this.descriptor,c=this.tint;
    d[0]=this.local.x+x;d[1]=0.45;d[2]=this.local.z+z;d[3]=this.orientation;
    d[4]=type;d[5]=a0;d[6]=a1;d[7]=r0;
    d[8]=r1;d[9]=width;d[10]=lift;d[11]=bow;
    d[12]=c.r;d[13]=c.g;d[14]=c.b;d[15]=alpha*this.alpha;
    d[16]=flow;d[17]=phase;d[18]=travel;d[19]=style;
    d[20]=this.reveal;d[21]=taper;d[22]=1;d[23]=0;
    d[24]=this.slot.born;d[25]=this.cycle.attack;d[26]=this.slot.release;d[27]=this.cycle.release;
    d[28]=this.cycle.code;d[29]=this.role;d[30]=this.phaseOffset;d[31]=this.material.flex;
    d[32]=this.local.x;d[33]=this.local.z;d[34]=this.material.ribs;d[35]=this.material.heat;
    this.batch.add(d);
  }
  /** Select the authored member material. Retained table entries, so no per-strip allocation. */
  _member(name){this.material=SURFACE_MATERIALS[name]||SURFACE_MATERIALS.plain;}
  _rim(radius,width,segments=4,alpha=0.72,boundary=false,member=boundary?'truth':'frame'){
    if(boundary&&this.releasing)return;
    const saved=this.role,savedMaterial=this.material;
    this.role=boundary?FIELD_ROLE.BOUNDARY:FIELD_ROLE.CREST;this._member(member);
    for(let i=0;i<segments;i++){
      const a=i*TAU/segments;
      this._surface(0,a+0.13,a+TAU/segments-0.13,radius,radius,width,0,0,i/segments,0,0,alpha,0,0,0);
    }
    this.role=saved;this.material=savedMaterial;
  }
  _well(){
    const r=this.radius;this.orientation=0;
    // Outer edge is exactly the physics radius. Width lies INSIDE it, never outside the range.
    this._rim(r-r*0.009,r*0.009,4,0.68,true);
    // Five unequal scythes: working membrane, ribbed so the inward draw has something to run over.
    this._member('membrane');
    for(let i=0;i<5;i++){
      const a=i*TAU/5;this.phaseOffset=i/5;
      this._surface(0,a,a+1.8+(i%2)*0.3,r*0.96,r*0.082,r*(0.035+(i%2)*0.008),r*0.025,0,i*0.193,0,1,0.88);
      this._member('filament');
      this._surface(0,a+0.16,a+2.00,r*0.72,r*0.11,r*0.009,r*0.047,0,i*.19,0,1,0.78);
      this._member('membrane');
    }
    this.tint=COLORS.get(0xb9a2ff);
    // A machined collar around the empty throat. The throat stays EMPTY; the hardware ringing it
    // is what makes the absence read as a built aperture instead of a hole in the artwork.
    this._rim(r*0.075,r*0.012,3,0.95,false,'frame');
    this._member('spar');
    this._surface(0,0.4,2.45,r*.17,r*.17,r*.017,r*.028,0,0,0,1,.92,0,0,0);
    this._surface(0,3.15,5.65,r*.17,r*.17,r*.017,r*.028,0,0,0,1,.92,0,0,0);
  }
  _repulsor(){
    const r=this.radius;this.orientation=0;this.style=1;
    this._rim(r-r*.009,r*.009,4,.75,true);
    // Pressure fronts propagate whenever the tool exists, even with no affected targets.
    // INF-043: nested shells, each band running inner->outer, so the traveling crest physically
    // moves outward — the shared transport cue reads push without palette. Bands stay inside the
    // truth boundary and the throat (r<0.45r) carries no crest geometry, so covered victims stay
    // readable. This mirrors the Well scythes, which run outer->inner for the inward verb.
    this._member('membrane');
    for(let front=0;front<3;front++)for(let sector=0;sector<4;sector++){
      const a=sector*TAU/4+0.09+front*.19;this.phaseOffset=front/3+sector/4;
      const r0=r*(0.45+0.15*front),r1=r*(0.63+0.15*front);
      this._surface(0,a,a+1.19,r0,r1,r*.038,r*.05,0,front/3,this.moving?1:0,0,.92);
    }
    // The splayed ribs are the emitter's hardware: they hold the shells apart and do not breathe.
    this._member('spar');
    for(let i=0;i<4;i++){
      const a=i*TAU/4+.4;
      this._surface(0,a,a-.2,r*.08,r*.33,r*.045,r*.07,0,i*.25,0,1,.82);
    }
    this.tint=COLORS.get(0xffe1a4);this._rim(r*.07,r*.012,3,.95,false,'frame');
  }
  _cone(s){
    const r=this.radius,half=Math.max(.02,Math.min(1.5,finite(s.field.halfAngleRad,.56)));
    // Sector footprint, not an overshooting triangular end-cap. Banks end at radial R.
    for(let side=-1;side<=1;side+=2){
      if(!this.releasing){this.role=FIELD_ROLE.BOUNDARY;this._member('truth');
        this._surface(1,side*half,0,r*.025,r*.994,r*.005,0,0,0,0,0,.83,0,0,0);
        this.role=FIELD_ROLE.BODY;}
      this.phaseOffset=side*.21;this._member('membrane');
      this._surface(1,side*half*.83,0,r*.035,r*.95,r*.046,r*.023,0,side*.18,0,1,.9);
      this._member('filament');
      this._surface(1,side*half*.46,0,r*.065,r*.88,r*.024,r*.018,0,side*.32,0,1,.72);
    }
    if(!this.releasing){this.role=FIELD_ROLE.BOUNDARY;this._member('truth');
      this._surface(0,-half,half,r*.994,r*.994,r*.005,0,0,0,0,0,.72,0,0,0);
      this.role=FIELD_ROLE.BODY;}
    this._member('membrane');
    for(let i=0;i<3;i++){
      const rr=this.moving?r*.95:r*(.28+i*.28);
      this._surface(0,-half*.80,half*.80,rr,rr,r*.024,r*.018,0,i/3,this.moving?1:0,1,.76,0,0,this.flow,1);
    }
    this.tint=COLORS.get(0xb7f5ff);
    // Aperture throat: four short machined spars the transport curtain is extruded through.
    this._member('frame');
    for(let i=0;i<4;i++)this._surface(1,(i%2?1:-1)*.16,0,r*.02,r*.18,r*.009,0,0,i*.25,0,1,.86);
  }
  _sheet(s){
    const r=this.radius,w=Math.max(1,finite(s.field.halfWidth,52));
    const ca=Math.cos(this.orientation),sa=Math.sin(this.orientation);
    // True parallel rectangular banks; the ordinary cone visibly diverges, Skim does not.
    for(let side=-1;side<=1;side+=2){
      const shift=side*(w-Math.min(1,w*.018));
      if(!this.releasing){this.role=FIELD_ROLE.BOUNDARY;this._member('truth');
        this._surface(1,0,0,0,r,Math.min(1,w*.018),0,0,0,0,0,.88,-sa*shift,ca*shift,0);
        this.role=FIELD_ROLE.BODY;}
      const inner=side*w*.82;
      // The long bank is a ribbed rail — its structure is what proves the two banks stay parallel.
      this._member('spar');
      this._surface(1,0,0,r*.035,r*.965,w*.105,w*.10,0,0,0,1,.85,-sa*inner,ca*inner,0);
      this._member('membrane');
      for(let i=0;i<6;i++){
        // Cross-stream scoops point INWARD toward the axis, matching the published sheet kernel.
        const along=r*(.12+i*.14);
        const x=ca*along-sa*(side*w*.76),z=sa*along+ca*(side*w*.76);
        this.phaseOffset=i/6;
        this._surface(1,-side*Math.PI/2,0,0,w*.43,w*.09,w*.08,w*.16,i/6,2,1,.88,x,z);
      }
    }
    this.tint=COLORS.get(0xd9ffe0);
    if(!this.releasing){this.role=FIELD_ROLE.BOUNDARY;this._member('truth');
      for(let end=0;end<2;end++)this._surface(1,Math.PI/2,0,-w,w,w*.016,0,0,0,0,0,.6,ca*end*r,sa*end*r,0);
      this.role=FIELD_ROLE.BODY;}
  }
  _seed(s,seed,motion){
    const phase=seed?.phase||'active';this.style=2;this.flow=0;this.orientation=s.angle;
    const r=Math.min(s.radius*.33,14);
    const now=this.releasing?s.release:this.time;
    const lockSpan=Math.max(.001,finite(seed?.activeAt,now)-finite(seed?.lockAt,now));
    const progress=phase==='locking'?clamp01((now-finite(seed?.lockAt,now))/lockSpan):1;
    const open=phase==='travel'?1:phase==='locking'?(motion?0:1-progress):0;
    const warning=phase==='warning';
    const remaining=warning?clamp01((finite(seed?.expireAt,now)-now)/Math.max(.001,finite(seed?.expireAt,now)-finite(seed?.warnAt,now))):1;
    if(warning)this.tint=COLORS.get(0xffc36c);
    // Four lifted, rectangular clamp jaws. No circular reticle and no false ambient suction.
    for(let i=0;i<4;i++){
      this.phaseOffset=i/4;this.role=FIELD_ROLE.JAW;
      const a=i*Math.PI/2,ca=Math.cos(a),sa=Math.sin(a),rr=r*(1+open*.65),w=r*.28;
      const radialX=ca*rr,radialZ=sa*rr;
      this._member('plate');
      this._line(radialX+sa*w,radialZ-ca*w,radialX-sa*w,radialZ+ca*w,r*.115,r*.13);
      this._member('spar');
      for(let edge=-1;edge<=1;edge+=2){
        this._line(ca*rr*.68-sa*w*edge,sa*rr*.68+ca*w*edge,
          ca*rr-sa*w*edge,sa*rr+ca*w*edge,r*.072,r*.06);
      }
      // The inner tooth is the only hot member: it is what the warning phase drains.
      this._member('edge');
      const tooth=r*.48,span=r*.24*remaining;
      this._line(ca*tooth+sa*span,sa*tooth-ca*span,ca*tooth-sa*span,sa*tooth+ca*span,r*.06,r*.07);
    }
  }
  _line(x0,z0,x1,z1,width,lift=0,alpha=1){
    const ca=Math.cos(this.orientation),sa=Math.sin(this.orientation);
    this._surface(1,Math.atan2(z1-z0,x1-x0),0,0,Math.hypot(x1-x0,z1-z0),width,lift,0,this.phaseOffset,0,0,alpha,ca*x0-sa*z0,sa*x0+ca*z0);
  }

  inspect(){
    return {
      schema:'spaceface.force-language.lifecycle.v2', time:this.time, frame:this.frame,
      motionReduced:this.batch.material.uniforms.uMotion.value===0,
      stats:{...this.stats},
      instances:this.slots.filter(s=>s.id!==null).map(s=>({
        id:s.id,kind:s.kind,born:s.born,releaseAt:s.release,
        ...sampleFieldLifecycle(this.time,s.born,s.release,FIELD_LIFECYCLES[s.kind],{}),
      })),
    };
  }
  reproject(dx,dz){ this.batch.reproject(dx,dz); } // Also safe when the next simulation dt is zero.
  dispose(){if(this.disposed)return;this.disposed=true;this.batch.dispose();for(const s of this.slots){s.id=null;s.release=-1;}}
}
