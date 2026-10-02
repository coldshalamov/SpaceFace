import * as THREE from 'three';
import { fieldSignature, SURFACE_MATERIALS } from './catalog.js';
import { SweptSurfaceBatch, SURFACE_FLOATS } from './sweptSurfaceBatch.js';
import { FIELD_LIFECYCLES, FIELD_ROLE, sampleFieldLifecycle } from './effectLifecycle.js';
import { ForceParticleFlow } from '../vfx/forceParticleFlow.js';
import { FlowEnvironment } from './flowEnvironment.js';
import { BURST_STYLE, hullBurstFieldRecord, shapeOfFieldKind } from './hullBurstField.js';
export { FIELD_RELEASE_SECONDS } from './effectLifecycle.js';

export const FIELD_PRESENTATION_CAPACITY=7; // six simulation fields PLUS the published Seed
const TAU=Math.PI*2;
const clamp01=(v)=>Math.max(0,Math.min(1,v));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
// Stable per-deployment character, independent of sim RNG and render cadence.
function character(id, born) {
  const text=String(id);let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  h=Math.imul(h^Math.round(born*1000),0x45d9f3b);return (h>>>0)/4294967296;
}
const COLORS=new Map();
// Allocate colors once; recipes never parse CSS or allocate Color objects in the frame loop.
for(const value of [0x54e5ed,0xffc36c,0x58bdff,0xb9a2ff,0xffb766,0xffe1a4,0xb7f5ff,0x79f0c8,0xd9ffe0])COLORS.set(value,new THREE.Color(value));
// Hull-burst wedges draw with the cone recipe in their own tints (forceLanguage/hullBurstField.js).
for(const style of Object.values(BURST_STYLE)){COLORS.set(style.color,new THREE.Color(style.color));COLORS.set(style.accent,new THREE.Color(style.accent));}

// Field recipes are authored for hand-deployed tools (r <= ~150 WU). Arena/environmental
// machinery registers fields at 300-600+ WU, where full-strength working membranes blanket
// the whole combat frame in ribbon. Body surfaces fade toward the floor past
// FIELD_LANGUAGE_FULL_RADIUS; the physics boundary keeps full strength either way since
// the zone edge is the one thing the presentation must stay truthful about.
const FIELD_LANGUAGE_FULL_RADIUS = 170;
const FIELD_LANGUAGE_MIN_PRESENCE = 0.30;

/** One ring at a registered anchor. `fields:cleared` removes it. Not drawn for anchors the player cannot see. */
export function noteFieldAnchorRing(rings, payload) {
  if (!rings || !payload || payload.fieldId == null) return rings;
  const pos = payload.pos || null;
  rings.set(payload.fieldId, {
    fieldId: payload.fieldId,
    kind: payload.kind || null,
    radius: Number(payload.radius) || 0,
    x: pos && Number.isFinite(pos.x) ? pos.x : 0,
    z: pos && Number.isFinite(pos.z) ? pos.z : 0,
  });
  return rings;
}

export function bindFieldAnchorRings(bus, rings) {
  if (!bus || typeof bus.on !== 'function' || !rings) return () => {};
  const onRegistered = (payload) => {
    if (payload && payload.playerVisible === false) return;
    noteFieldAnchorRing(rings, payload);
  };
  const onCleared = (payload) => clearFieldAnchorRings(rings, payload);
  bus.on('fields:anchorRegistered', onRegistered);
  bus.on('fields:cleared', onCleared);
  return () => {
    if (typeof bus.off === 'function') {
      bus.off('fields:anchorRegistered', onRegistered);
      bus.off('fields:cleared', onCleared);
    }
  };
}

export function clearFieldAnchorRings(rings, payload) {
  if (!rings) return rings;
  if (payload && payload.fieldId != null) rings.delete(payload.fieldId);
  else rings.clear();
  return rings;
}

/** A read-only adapter over fields.active and massSeed. No event listeners, forces or RNG. */
export class FieldForcePresentation {
  constructor(scene,{toLocal=null}={}){
    this.batch=new SweptSurfaceBatch(scene,{capacity:224,name:'SF_FieldForceLanguage',fieldVolume:true});
    this.mesh=this.batch.mesh;this.toLocal=toLocal;
    this.particles=new ForceParticleFlow(this.mesh,{capacity:360});
    this.particleOptions={reducedMotion:false,reducedFlash:false};
    this.particleBurst={kind:'well',x:0,z:0,y:.7,dx:1,dz:0,radius:1,seed:0,count:6,life:.65,strength:1,halfAngle:.56,halfWidth:52};
    this.local={x:0,z:0};this.descriptor=new Float32Array(SURFACE_FLOATS);
    this.slots=Array.from({length:10},(_,index)=>({
      index,ownerId:null,environment:new FlowEnvironment(),
      id:null,seedId:null,kind:null,born:0,character:0,lastSeen:0,release:-1,x:0,z:0,radius:0,angle:0,seen:false,reserved:false,particlePulse:0,
      // The producer REUSES its records. Keep value snapshots, not foreign record references,
      // so a retiring Well cannot become the Cone subsequently stored in the same array cell.
      field:{engaged:false,halfAngleRad:0.56,halfWidth:52},
      seed:{phase:'active',lockAt:0,activeAt:0,warnAt:0,expireAt:0},
    }));
    this.seedTint=new THREE.Color();
    this.material=SURFACE_MATERIALS.plain;
    this.presence=1;
    this.time=0;this.frame=0;this.disposed=false;
    this.frustum=new THREE.Frustum();this.clip=new THREE.Matrix4();this.sphere=new THREE.Sphere();
    this.stats={active:0,releasing:0,surfaces:0,dropped:0,unknown:0,culled:0};
    // Quiet settled flight: empty field-force still paid frustum rebuild +
    // 10-slot reserved walk + batch.begin/end commit(0) every tick after
    // surfaces already hidden. Latch after first empty publish; wake on
    // fields.active / residual releasing slots. Soft-GPU fps not claimed.
    this._quietEmpty=false;
  }
  _valid(field){
    return field && field.id!=null && Number.isFinite(field.center?.x) && Number.isFinite(field.center?.z)
      && Number.isFinite(field.radius) && field.radius>0;
  }
  _matches(slot,field,seedId){return slot.release<0 && slot.id===field.id && slot.kind===field.kind && (field.kind!=='seed'||slot.seedId===seedId);}
  _accept(field,state){
    if(!this._valid(field))return;
    if(!fieldSignature(shapeOfFieldKind(field.kind))){this.stats.unknown++;return;}
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
      slot.character=character(field.kind==='seed'?seedId:field.id,this.time);
      slot.particlePulse=0;
    }
    slot.seen=true;slot.release=-1;slot.lastSeen=this.time;
    slot.ownerId=field.ownerId??field.sourceId??null;
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
  // Cheap dirty wake for quiet field-force latch — active list, residual slot,
  // or a live release burst (particles did not exist when the latch shipped).
  // False-wake falls through to one full update and re-latches when empty.
  _quietMaybeAwake(state){
    const list=state&&state.fields&&state.fields.active;
    if(Array.isArray(list)&&list.length>0)return true;
    if(state&&state.hullBurst&&state.hullBurst.phase==='active')return true;
    for(let i=0;i<this.slots.length;i++)if(this.slots[i].id!==null)return true;
    if(this.particles&&this.particles.live>0)return true;
    return false;
  }
  update(dt,state={}){
    if(this.disposed)return this.stats;
    // Quiet settled flight: empty field-force still paid frustum rebuild +
    // slot reserved walk + batch.begin/end commit(0) every tick with no live
    // surfaces. Latch after first empty publish; cheap active/slot wake.
    // Soft-GPU fps not claimed. Release residue must keep updating until slots clear.
    if(this._quietEmpty){
      if(!this._quietMaybeAwake(state))return this.stats;
      this._quietEmpty=false;
    }
    const clock=Number.isFinite(state.simTime)?state.simTime:this.time+Math.max(0,finite(dt));
    // A restored/new simulation may rewind the clock. Release old purely cosmetic identities.
    const elapsed=Math.max(0,clock-this.time);
    if(clock<this.time){for(const s of this.slots){s.id=null;s.release=-1;}this.particles.clear();}
    this.time=clock;this.frame++;
    const video=state.settings?.video,a11y=state.settings?.accessibility;
    const motion=!!(video?.motionReduce||a11y?.reducedMotion||a11y?.motionReduce);
    const flash=!!(video?.flashReduce||a11y?.flashReduce||a11y?.reducedFlash);
    this.particleOptions.reducedMotion=motion;this.particleOptions.reducedFlash=flash;
    // Decorative transport stops in reduced motion; the stable force silhouette remains intact.
    if(motion)this.particles.clear();
    else this.particles.update(elapsed,this.particleOptions);
    const stats=this.stats;stats.active=0;stats.releasing=0;stats.dropped=0;stats.unknown=0;stats.culled=0;
    const camera=state.render?.camera;
    const cull=!!(camera?.projectionMatrix&&camera?.matrixWorldInverse);
    if(cull)this.frustum.setFromProjectionMatrix(this.clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let list=state.fields?.active;
    let count=Array.isArray(list)?list.length:0;
    // A live hull burst is one more field (the cone recipe, its own tint), first so the six-field limit
    // can never drop the wedge the player just lit. The merged list is a reused scratch array.
    const burst=hullBurstFieldRecord(state);
    if(burst){
      const merged=this._mergedList||(this._mergedList=[]);
      merged.length=0;merged.push(burst);
      for(let i=0;i<count;i++)merged.push(list[i]);
      list=merged;count=merged.length;
    }
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
        const releaseSeconds=FIELD_LIFECYCLES[shapeOfFieldKind(s.kind)].release;
        if(this.time-s.release>=releaseSeconds){s.id=null;continue;}
        stats.releasing++;
        // Keep the last visible body for a distinct breakup. The boundary disappears on this
        // very frame; already supplied parcels coast and retire without creating new fronts.
      }
      const sig=fieldSignature(shapeOfFieldKind(s.kind));
      if(!sig)continue;
      const style=BURST_STYLE[s.kind]||sig;
      this._position(s);
      this._environment(s,state);
      if(cull){
        this.sphere.center.set(this.local.x,0.45,this.local.z);this.sphere.radius=s.radius*1.12;
        if(!this.frustum.intersectsSphere(this.sphere)){stats.culled++;continue;}
      }
      this.slot=s;this.cycle=FIELD_LIFECYCLES[shapeOfFieldKind(s.kind)];this.releasing=s.release>=0;
      this.accent=style.accent;
      this.tint=COLORS.get(style.color);this.alpha=0.88+(s.field.engaged?0.12:0);
      this.reveal=1; // per-section arrival and retirement are owned by iLife in the shader
      this.orientation=s.angle;this.engaged=s.field.engaged===true;
      // `engaged` means a body was affected THIS TICK, not that the tool is switched on.
      // Empty-space tools remain alive. The shader's motion uniform handles accessibility.
      this.moving=true;this.flow=1;this.style=0;this.role=FIELD_ROLE.BODY;this.phaseOffset=0;
      this.material=SURFACE_MATERIALS.plain;this.radius=s.radius;
      this.presence=Math.min(1,Math.max(FIELD_LANGUAGE_MIN_PRESENCE,
        FIELD_LANGUAGE_FULL_RADIUS/Math.max(1,s.radius)));
      switch(shapeOfFieldKind(s.kind)){
        case 'seed':this._seed(s,s.seed,motion);break;
        case 'well':this._well(s);break;
        case 'repulsor':this._repulsor(s);break;
        case 'cone':this._cone(s);break;
        case 'sheet':this._sheet(s);break;
      }
      const pulse=Math.floor((this.time-s.born)/(.16+s.character*.045));
      if(!motion && !this.releasing && pulse>s.particlePulse){
        const p=this.particleBurst;s.particlePulse=pulse;
        p.kind=shapeOfFieldKind(s.kind)==='sheet'?'skim':shapeOfFieldKind(s.kind);p.x=this.local.x;p.z=this.local.z;
        p.dx=Math.cos(s.angle);p.dz=Math.sin(s.angle);p.radius=s.kind==='seed'?Math.min(s.radius*.33,14):s.radius;
        p.halfAngle=s.field.halfAngleRad;p.halfWidth=s.field.halfWidth;
        p.seed=s.character+Math.imul(pulse,2654435761)/4294967296;
        p.count=s.field.engaged?8:5;p.strength=s.field.engaged?1.12:.85;
        p.life=Math.min(.8,this.cycle.release*.85);
        p.environment=s.environment;
        this.particles.emit(p);
      }
    }
    this.batch.end();stats.surfaces=this.batch.count;stats.dropped+=this.batch.dropped;
    if(!stats.active&&!stats.releasing)this.particles.clear();
    this.mesh.visible=this.batch.count>0||this.particles.live>0;
    // Fully idle empty (no active fields, no residual releasing slots, batch empty,
    // no live particle residue) → quiet latch. Soft-GPU fps not claimed.
    const activeList=state&&state.fields&&state.fields.active;
    const hasActive=(Array.isArray(activeList)&&activeList.length>0)||!!burst;
    let slotLive=false;
    for(let i=0;i<this.slots.length;i++){if(this.slots[i].id!==null){slotLive=true;break;}}
    this._quietEmpty=!hasActive&&!slotLive&&this.batch.count===0&&!(this.particles&&this.particles.live>0);
    return stats;
  }
  _environment(slot,state){
    const env=slot.environment.update(state,this.local.x,this.local.z,slot.radius,slot.ownerId,
      finite(state.render?.interpolationAlpha,1));
    const bodies=this.batch.material.uniforms.uBodies.value;
    const velocities=this.batch.material.uniforms.uBodyVelocity.value;
    const base=slot.index*3;
    for(let i=0;i<3;i++){
      const body=i<env.count?env.records[i]:null;
      if(body){bodies[base+i].set(body.x,body.z,body.radius,finite(body.strength,1));
        velocities[base+i].set(finite(body.vx),finite(body.vz));}
      else {bodies[base+i].set(0,0,0,0);velocities[base+i].set(0,0);}
    }
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
    d[12]=c.r;d[13]=c.g;d[14]=c.b;
    d[15]=alpha*this.alpha*(this.role===FIELD_ROLE.BOUNDARY?1:this.presence);
    const working=this.role!==FIELD_ROLE.BOUNDARY;
    const variation=working?this.slot.character:0;
    d[16]=flow*(working?0.88+variation*0.24:1);d[17]=phase+variation;d[18]=travel;d[19]=style;
    d[20]=this.reveal;d[21]=taper;
    // Field-only shape limits occupy the legacy envelope/pitch channels. Legacy weapon
    // descriptors are unchanged; the lifecycle branch constrains the decorative volume
    // to its actual circle, sector or parallel intake rectangle after deformation.
    const shape=shapeOfFieldKind(this.slot.kind);
    d[22]=shape==='cone'?this.slot.field.halfAngleRad:shape==='sheet'?this.slot.field.halfWidth:1;
    d[23]=this.radius;
    d[24]=this.slot.born;d[25]=this.cycle.attack;d[26]=this.slot.release;d[27]=this.cycle.release;
    d[28]=this.cycle.code;d[29]=this.role;d[30]=this.phaseOffset+variation;d[31]=this.material.flex;
    d[32]=this.local.x;d[33]=this.local.z;d[34]=this.material.ribs+this.slot.index/16;d[35]=this.material.heat;
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
    // Reach comes from the force record; material thickness comes from ship scale.
    // A large radius must never turn the same current into a 50-WU cloth hose.
    const channel=Math.min(6.5,r*.048),underflow=Math.min(2.7,r*.022);
    const throat=Math.min(10,r*.075),collar=Math.min(18,r*.17);
    // Outer edge is exactly the physics radius. Width lies INSIDE it, never outside the range.
    this._rim(r-r*0.009,r*0.009,4,0.68,true);
    // Five deep accretion channels with overlapping lower currents, not ten wire spirals.
    this._member('membrane');
    for(let i=0;i<5;i++){
      const a=i*TAU/5;this.phaseOffset=i/5;
      this._surface(0,a,a+1.8+(i%2)*0.3,r*0.90,r*0.082,channel*(.86+(i%2)*.14),Math.min(5,r*.04),0,i*0.193,0,1,0.88);
      this._member('filament');
      this._surface(0,a+0.16,a+2.00,r*0.66,r*0.12,underflow,-Math.min(2,r*.018),0,i*.19,0,1,0.78);
      this._member('membrane');
    }
    this.tint=COLORS.get(0xb9a2ff);
    // A machined collar around the empty throat. The throat stays EMPTY; the hardware ringing it
    // is what makes the absence read as a built aperture instead of a hole in the artwork.
    this._rim(throat,Math.min(1.6,r*.016),3,0.62,false,'frame');
    this._member('spar');
    this._surface(0,0.4,2.45,collar,collar,Math.min(2.1,r*.021),Math.min(3,r*.033),0,0,0,1,.92,0,0,0);
    this._surface(0,3.15,5.65,collar,collar,Math.min(2.1,r*.021),Math.min(3,r*.033),0,0,0,1,.92,0,0,0);
  }
  _repulsor(){
    const r=this.radius;this.orientation=0;this.style=1;
    this._rim(r-r*.009,r*.009,4,.75,true);
    // Three separated bowed fronts cross the field. Each arc has a constant radius
    // along its length; radial travel moves the whole crest outward. A varying radius
    // along the arc made diagonal spiral cloth and incorrectly resembled suction.
    // Cross-section remains a thick pressure wall, sized against an actual hull.
    this._member('membrane');
    for(let front=0;front<3;front++)for(let sector=0;sector<4;sector++){
      const a=sector*TAU/4+0.22+front*.09;this.phaseOffset=front/3+sector/4;
      const reach=r*.91;
      this._surface(0,a,a+.87,reach,reach,Math.min(4.6,r*.035),Math.min(5.5,r*.045),0,
        front/3,this.moving?1:0,1,.86);
    }
    // The splayed ribs are the emitter's hardware: they hold the shells apart and do not breathe.
    this._member('spar');
    for(let i=0;i<4;i++){
      const a=i*TAU/4+.4;
      this._surface(0,a,a-.2,Math.min(9,r*.08),Math.min(24,r*.24),Math.min(2.6,r*.04),Math.min(3.5,r*.05),0,i*.25,0,1,.82);
    }
    this.tint=COLORS.get(0xffe1a4);this._rim(Math.min(9,r*.07),Math.min(1.8,r*.024),3,.72,false,'frame');
  }
  _cone(s){
    const r=this.radius,half=Math.max(.02,Math.min(1.5,finite(s.field.halfAngleRad,.56)));
    // Sector footprint, not an overshooting triangular end-cap. Banks end at radial R.
    for(let side=-1;side<=1;side+=2){
      if(!this.releasing){this.role=FIELD_ROLE.BOUNDARY;this._member('truth');
        this._surface(1,side*half,0,r*.025,r*.994,r*.005,0,0,0,0,0,.83,0,0,0);
        this.role=FIELD_ROLE.BODY;}
      this.phaseOffset=side*.21;this._member('membrane');
      this._surface(1,side*half*.83,0,r*.035,r*.95,Math.min(5.8,r*half*.23),Math.min(4.5,r*.04),0,side*.18,0,1,.9);
      this._member('filament');
      this._surface(1,side*half*.46,0,r*.065,r*.88,Math.min(2.7,r*half*.15),-Math.min(2,r*.018),0,side*.32,0,1,.72);
    }
    if(!this.releasing){this.role=FIELD_ROLE.BOUNDARY;this._member('truth');
      this._surface(0,-half,half,r*.994,r*.994,r*.005,0,0,0,0,0,.72,0,0,0);
      this.role=FIELD_ROLE.BODY;}
    this._member('membrane');
    for(let i=0;i<3;i++){
      const rr=this.moving?r*.95:r*(.28+i*.28);
      this._surface(0,-half*.80,half*.80,rr,rr,Math.min(3.4,r*.025),Math.min(4,r*.032),0,i/3,this.moving?1:0,1,.76,0,0,this.flow,1);
    }
    this.tint=COLORS.get(this.accent)||COLORS.get(0xb7f5ff);
    // Aperture throat: four short machined spars the transport curtain is extruded through.
    this._member('frame');
    for(let i=0;i<4;i++)this._surface(1,(i%2?1:-1)*.16,0,r*.02,Math.min(24,r*.18),Math.min(2.4,r*.024),0,0,i*.25,0,1,.86);
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
      this._surface(1,0,0,r*.035,r*.965,Math.min(4.6,w*.12),Math.min(4,w*.12),0,0,0,1,.85,-sa*inner,ca*inner,0);
      this._member('membrane');
      for(let i=0;i<6;i++){
        // Cross-stream scoops point INWARD toward the axis, matching the published sheet kernel.
        const along=r*(.12+i*.14);
        const x=ca*along-sa*(side*w*.76),z=sa*along+ca*(side*w*.76);
        this.phaseOffset=i/6;this._member(i%2?'filament':'membrane');
        this._surface(1,-side*Math.PI/2,0,0,w*.60,Math.min(4.4,w*.16),Math.min(4.8,w*.18),w*.16,i/6,2,1,.88,x,z);
      }
    }
    this.tint=COLORS.get(0xd9ffe0);
    if(!this.releasing){this.role=FIELD_ROLE.BOUNDARY;this._member('truth');
      for(let end=0;end<2;end++)this._surface(1,Math.PI/2,0,-w,w,w*.016,0,0,0,0,0,.6,ca*end*r,sa*end*r,0);
      this.role=FIELD_ROLE.BODY;}
  }
  _seed(s,seed,motion){
    const phase=seed?.phase||'active';this.style=2;this.flow=0;this.orientation=s.angle;
    const r=Math.min(s.radius*.43,20);
    const now=this.releasing?s.release:this.time;
    const lockSpan=Math.max(.001,finite(seed?.activeAt,now)-finite(seed?.lockAt,now));
    const progress=phase==='locking'?clamp01((now-finite(seed?.lockAt,now))/lockSpan):1;
    const open=phase==='travel'?1:phase==='locking'?(motion?0:1-progress):0;
    const warning=phase==='warning';
    const remaining=warning?clamp01((finite(seed?.expireAt,now)-now)/Math.max(.001,finite(seed?.expireAt,now)-finite(seed?.warnAt,now))):1;
    if(warning)this.tint=this.seedTint.copy(COLORS.get(0x54e5ed)).lerp(COLORS.get(0xffc36c),1-remaining);
    // Three unequal open load paths seat around the anchor. Avoid mirrored closed
    // flowers: each root has a different reach, rake and phase, with a missing side
    // through which the environment remains visible. Late cross-load bridges are
    // consequences of seating, not a permanently luminous central ring.
    for(let i=0;i<3;i++){
      const variation=Math.sin(s.character*17.3+i*2.17);
      const takeup=variation*.09;
      this.phaseOffset=i*.281+variation*.041;this.role=FIELD_ROLE.JAW;
      const a=i*TAU/3+(i===1?.28:i===2?-.17:0)+s.character*.45;
      const ca=Math.cos(a),sa=Math.sin(a);
      const rr=r*(1.04-i*.12+open*(.31+i*.07)+takeup),w=r*(.20+i*.025);
      this._member('spar');
      this._line(ca*rr*.12-sa*w*.34,sa*rr*.12+ca*w*.34,
        ca*rr-sa*w,sa*rr+ca*w,r*.18,r*.22,1,r*(.19+takeup),.72);
      this._member('plate');
      this.phaseOffset+=.139;
      this._line(ca*rr*.38+sa*w*.75,sa*rr*.38-ca*w*.75,
        ca*rr*.83+sa*w*.40,sa*rr*.83-ca*w*.40,
        r*.125,r*.27,.84,-r*.21,.82);
      this._member('edge');this.phaseOffset+=.117;this.role=FIELD_ROLE.CREST;
      this._line(ca*rr*.34+sa*w*.65,sa*rr*.34-ca*w*.65,
        ca*rr*.58-sa*w*.76,sa*rr*.58+ca*w*.76,
        r*.09,r*.29,(.22+.78*remaining),r*(.17+takeup),.78);
      // Short cross-load reaches towards the next seated root, with unequal
      // angles and lengths; it does not complete a closed geometric emblem.
      const next=a+1.25+i*.19;
      this.phaseOffset+=.183;this._member('membrane');
      this._line(ca*r*.19,sa*r*.19,Math.cos(next)*r*(.30+i*.07),Math.sin(next)*r*(.30+i*.07),
        r*.11,r*.25,.58*remaining,-r*.12,.80);
    }
  }
  _line(x0,z0,x1,z1,width,lift=0,alpha=1,bow=0,taper=0){
    const ca=Math.cos(this.orientation),sa=Math.sin(this.orientation);
    this._surface(1,Math.atan2(z1-z0,x1-x0),0,0,Math.hypot(x1-x0,z1-z0),width,lift,bow,this.phaseOffset,0,taper,alpha,ca*x0-sa*z0,sa*x0+ca*z0);
  }

  inspect(){
    return {
      schema:'spaceface.force-language.lifecycle.v2', time:this.time, frame:this.frame,
      motionReduced:this.batch.material.uniforms.uMotion.value===0,
      stats:{...this.stats,particles:this.particles.live},
      instances:this.slots.filter(s=>s.id!==null).map(s=>({
        id:s.id,kind:s.kind,born:s.born,releaseAt:s.release,
        ...sampleFieldLifecycle(this.time,s.born,s.release,FIELD_LIFECYCLES[shapeOfFieldKind(s.kind)],{}),
        choreography:'propagate-interact-detach',environmentBodies:s.environment.count,
      })),
    };
  }
  reproject(dx,dz){
    this.batch.reproject(dx,dz);this.particles.reproject(dx,dz);
    for(const body of this.batch.material.uniforms.uBodies.value)if(body.w>0){body.x+=dx;body.y+=dz;}
  } // Also safe when the next simulation dt is zero.
  dispose(){if(this.disposed)return;this.disposed=true;this._quietEmpty=false;this.particles.dispose();this.batch.dispose();for(const s of this.slots){s.id=null;s.release=-1;}}
}

// NXB-010 — presentation ledger of which sim field owns which anchor ring. The picture stores
// the contributor (kind, footprint, anchor pos) and never a second copy of the force it made:
// acceleration stays owned by core/fields/fieldKernel.js, so a stored `ax`/`az` here would be a
// force source that escapes the kernel's ordering and cap rules.
export function noteFieldAnchorRing(rings, spec){
  if(!rings||typeof rings.set!=='function'||!spec)return false;
  const fieldId=spec.fieldId!=null?String(spec.fieldId):(spec.id!=null?String(spec.id):null);
  if(!fieldId)return false;
  const pos=spec.pos||{};
  rings.set(fieldId,{
    fieldId,
    kind:typeof spec.kind==='string'?spec.kind:null,
    radius:Number.isFinite(spec.radius)?spec.radius:0,
    pos:{x:Number.isFinite(pos.x)?pos.x:0,z:Number.isFinite(pos.z)?pos.z:0},
  });
  return true;
}

export function clearFieldAnchorRings(rings, spec){
  if(!rings||typeof rings.delete!=='function')return false;
  const fieldId=spec!=null&&typeof spec==='object'?(spec.fieldId!=null?String(spec.fieldId):(spec.id!=null?String(spec.id):null)):(spec!=null?String(spec):null);
  return fieldId!=null?rings.delete(fieldId):false;
}
