import { createLayout, SITE_ID } from './layout.mjs';
import { createRecord, restoreRecord, commandRecord, stepRecord, machinery, readout } from './model.mjs';
const OWNER='nacreSluice';
const clone=x=>JSON.parse(JSON.stringify(x));
/** Canonical ports are supplied by runtime.js. Tests can drive the identical adapter
 * against a measured-body owner without importing the renderer or Rapier WASM. */
export function createAdapter(ctx, ports) {
  const {state,helpers}=ctx;
  if(!state?.entities || !helpers?.spawnEntity || !helpers?.removeEntity) throw new TypeError('Nacre requires entity lifetime owner');
  for(const name of ['impulse','nativeReady','attachments','refresh']) if(typeof ports[name]!=='function') throw new TypeError(`Missing Nacre port ${name}`);
  let record=createRecord(),layout=createLayout(),origin={x:0,z:0},sectorId=null;
  let epoch=0,active=false,disposed=false,lastTime=null;
  const bound=new Map();
  const world=p=>({x:p.x+origin.x,z:p.z+origin.z});
  const local=p=>({x:p.x-origin.x,z:p.z-origin.z});
  const identity=id=>`${SITE_ID}/${id}`;
  const owns=e=>e?.data?.persistenceOwner===OWNER && e.data.nacreSiteId===SITE_ID;
  function live(binding) {
    const e=binding?.entity;
    return e && state.entities.get(e.id)===e && e.occupantGeneration===binding.generation
      && owns(e) && e.data.worldRecordId===identity(binding.role) && e.alive!==false && e.hull>0;
  }
  function entity(id) {const b=bound.get(id);return live(b)?b.entity:null;}
  function measured() {
    const out={};
    for(const [role,b] of bound) if(live(b)) {
      const e=b.entity;out[role]={pos:local(e.pos),vel:{x:e.vel.x,z:e.vel.z},radius:e.radius,hull:e.hull,alive:true};
    }
    return out;
  }
  function capture() {
    for(const [role,b] of bound) {
      const e=b.entity,old=record.rows[role];
      if(!live(b)) {record.rows[role]={...(old||{x:0,z:0,vx:0,vz:0,rot:0,spin:0}),hull:0,dead:true};continue;}
      const p=local(e.pos);
      record.rows[role]={x:p.x,z:p.z,vx:e.vel.x,vz:e.vel.z,rot:e.rot||0,spin:e.angVel||0,hull:e.hull,dead:false};
    }
  }
  function retire(b, reason) {
    const e=b.entity;
    if(state.entities.get(e.id)!==e || e.occupantGeneration!==b.generation || !owns(e)) return;
    for(const line of ports.attachments().listForEntity(e.id)) ports.attachments().cut(line.id,null,reason);
    helpers.removeEntity(e.id,{immediate:true,reason});
  }
  function enter(options) {
    if(disposed) return {ok:false,reason:'disposed'};
    if(active) return {ok:false,reason:'already_active',epoch};
    if(!Number.isFinite(options?.origin?.x)||!Number.isFinite(options?.origin?.z)||typeof options?.sectorId!=='string') return {ok:false,reason:'site_address_required'};
    origin={...options.origin};sectorId=options.sectorId;
    if(state.world?.currentSectorId!==sectorId) return {ok:false,reason:'wrong_sector'};
    if(options.save!=null) {const next=restoreRecord(options.save);record=next;}
    else if(!Object.keys(record.rows).length && !record.accepted) {
      const random=state.rng; if(typeof random!=='function') throw new TypeError('Nacre requires state.rng');
      record.variant=Math.floor(random()*4294967296)>>>0;
    }
    layout=createLayout(record.variant);epoch++;lastTime=state.simTime;active=true;
    // Bounded reconciliation once per entry, never a sector walk in step().
    const existing=[...state.entities.values()].filter(owns);
    for(const spec of layout.bodies) {
      const matches=existing.filter(e=>e.data.worldRecordId===identity(spec.id));
      if(matches.length>1) {active=false;bound.clear();return {ok:false,reason:'duplicate_original',role:spec.id};}
    }
    for(const spec of layout.bodies) {
      const saved=record.rows[spec.id], existingBody=existing.find(e=>e.data.worldRecordId===identity(spec.id));
      const terminal=spec.id==='core'&&record.coreDelivered || spec.id==='salvage'&&record.salvageDelivered;
      if(saved?.dead || terminal) {if(existingBody) retire({entity:existingBody,generation:existingBody.occupantGeneration},'nacre_terminal');continue;}
      const p=world(saved?{x:saved.x,z:saved.z}:spec);
      const e=existingBody || helpers.spawnEntity({type:'payload',_noMesh:true,pos:p,
        vel:{x:saved?.vx||0,z:saved?.vz||0},rot:saved?.rot||0,angVel:saved?.spin||0,
        radius:spec.radius,mass:spec.mass,hull:saved?.hull??spec.hull,hullMax:spec.hull,ttl:Infinity,
        collides:false,flags:{missionPinned:true,masslineTetherable:false},
        physicsBody:{schemaVersion:1,revision:1,dynamic:!spec.fixed,shape:'ball',radius:spec.radius,
          mass:spec.mass,inertiaY:spec.mass*spec.radius*spec.radius*.5,ccd:true,material:'massline_sensor',anchorRecoil:false,impactDamageScale:0},
        data:{persistenceOwner:OWNER,nacreSiteId:SITE_ID,nacreRole:spec.id,worldRecordId:identity(spec.id),
          identityKey:identity(spec.id),homeSectorId:sectorId,sectorId,transientSector:false,
          combatProfileId:'combat_profile_tether_anchor',placeId:spec.assetId,placeTargetRadius:spec.radius,
          physicalCustodyOnly:true,masslineTetherable:false,worldSiteTargetable:false,
          name:spec.id==='core'?'Nacre / stranded catalyst core':`Nacre / ${spec.id}`,
          salvagePool:{},authoredSalvagePool:{},loot:[]}});
      if(e) bound.set(spec.id,{role:spec.id,entity:e,generation:e.occupantGeneration,admitted:false});
    }
    return {ok:bound.size===layout.bodies.filter(s=>!record.rows[s.id]?.dead && !(s.id==='core'&&record.coreDelivered) && !(s.id==='salvage'&&record.salvageDelivered)).length,epoch};
  }
  /** Called only by the view owner after the exact original's authored asset is visible.
   * Numeric id + occupant generation + visit epoch prevent delayed asset callbacks
   * from admitting a new pooled occupant or the next visit. */
  function admit({role,id,generation,epoch:visit}) {
    const b=bound.get(role);
    if(!active||visit!==epoch||!live(b)||b.entity.id!==id||b.generation!==generation) return false;
    if(b.admitted) return true;
    const e=b.entity;b.admitted=true;e.collides=true;e.flags.masslineTetherable=true;
    e.data.masslineTetherable=true;e.data.worldSiteTargetable=true;
    e.physicsBody={...e.physicsBody,material:'payload',revision:e.physicsBody.revision+1};ports.refresh(e);
    return true;
  }
  function ready() {
    if(!active || state.world?.currentSectorId!==sectorId) return false;
    return layout.bodies.every(spec=>{
      if(record.rows[spec.id]?.dead || spec.id==='core'&&record.coreDelivered || spec.id==='salvage'&&record.salvageDelivered) return true;
      const b=bound.get(spec.id);return !!b && (!live(b)||b.admitted&&ports.nativeReady(b.entity));
    });
  }
  function command(request) {
    if(!ready()||request?.epoch!==epoch) return {ok:false,reason:'inactive_or_stale'};
    const pilot=state.entities.get(state.playerId);
    if(request.actorId!==state.playerId || request.actorGeneration!==pilot?.occupantGeneration) return {ok:false,reason:'stale_actor'};
    return commandRecord(record,request,pilot?{...pilot,pos:local(pilot.pos)}:null,measured());
  }
  function applyImpulse(e,x,z,reason,dt) {
    ports.impulse(e,{x,z},{source:OWNER,reason,tick:state.tick,continuous:true,dt,
      externalEffect:true,isPlayerTarget:e.id===state.playerId});
  }
  function step() {
    if(!active||disposed) return [];
    const now=state.simTime;
    if(!Number.isFinite(now)||lastTime===now) return [];
    const dt=now-lastTime;lastTime=now;
    if(state.mode!=='flight'||state.run && state.run.kind!=='adventure'||state.ui?.docked||state.timeScale===0 || !ready() || dt<=0||dt>.1) return [];
    capture();
    const delivered=stepRecord(record,dt,measured(),layout),m=machinery(record,layout);
    if(record.accepted) {
      // Servo drives real dynamic bodies. A tow can oppose the motor; no pose is snapped.
      for(const [id,target] of Object.entries(m.targets)) {
        const e=entity(id);if(!e) continue;
        const p=world(target);let x=(p.x-e.pos.x)*1.8-e.vel.x*2.5,z=(p.z-e.pos.z)*1.8-e.vel.z*2.5;
        const scale=Math.min(1,12/(Math.hypot(x,z)||1));
        applyImpulse(e,x*scale*e.mass*dt,z*scale*e.mass*dt,'machinery_servo',dt);
      }
      // Spatial owner query is required. Fixed banks, stations and other features are not
      // driven. Cap candidates at the query boundary, and refuse an overfull hazard.
      if(m.jet>0) for(const jet of layout.jets) {
        const center=world(jet),near=helpers.queryRadius(center,Math.hypot(jet.halfX,jet.halfZ)+32);
        if(!Array.isArray(near)||near.length>64) continue;
        for(const e of near) {
          if(!e||e.alive===false||e.collides===false||state.entities.get(e.id)!==e||!ports.nativeReady(e)||!['ship','payload','wreck','drone'].includes(e.type)||e.physicsBody?.dynamic===false) continue;
          const p=local(e.pos);
          if(Math.abs(p.x-jet.x)>jet.halfX||Math.abs(p.z-jet.z)>jet.halfZ) continue;
          const mass=Math.max(1,Number(e.mass)||1);
          applyImpulse(e,jet.dx*mass*10*m.jet*dt,jet.dz*mass*10*m.jet*dt,`pressure_${jet.id}`,dt);
        }
      }
    }
    for(const result of delivered) {
      const b=bound.get(result.role);if(b) retire(b,'nacre_received');bound.delete(result.role);
    }
    return delivered;
  }
  function serialize() {if(active) capture();return clone(record);}
  function deserialize(raw) {
    const next=restoreRecord(raw); // validate BEFORE retiring live originals
    if(active) leave({force:true});record=next;layout=createLayout(record.variant);return true;
  }
  function leave({force=false}={}) {
    if(!active) return {ok:true};
    if(!force && [...bound.values()].some(b=>live(b)&&ports.attachments().listForEntity(b.entity.id).some(l=>l.state==='active' && (l.ownerId===state.playerId||l.targetId===state.playerId||l.controllerId===state.playerId)))) return {ok:false,reason:'player_line_active'};
    capture();for(const b of bound.values()) retire(b,'nacre_suspend');bound.clear();active=false;epoch++;lastTime=null;
    return {ok:true};
  }
  function view() {
    return {...readout(record),active,epoch,origin:{...origin},sectorId,layout:clone(layout),
      bodies:[...bound.values()].filter(live).map(b=>({role:b.role,id:b.entity.id,generation:b.generation,
        pos:{x:b.entity.pos.x,z:b.entity.pos.z},radius:b.entity.radius,assetId:layout.bodies.find(s=>s.id===b.role).assetId,admitted:b.admitted}))};
  }
  // The mission owner consumes this stable query, records its own idempotent receipt and
  // then acknowledges it. No event invents currency or forces a generic mission complete.
  function settlement() {return record.coreDelivered?{key:'mission_nacre_sluice/core/v1',core:true,salvage:record.salvageDelivered,acknowledged:record.settlementAcknowledged}:null;}
  function acknowledge(key) {if(key!=='mission_nacre_sluice/core/v1'||!record.coreDelivered)return false;record.settlementAcknowledged=true;return true;}
  return Object.freeze({enter,admit,step,command,serialize,deserialize,leave,view,settlement,acknowledge,
    dispose(){if(disposed)return;leave({force:true});disposed=true;},
    // Safe owner query; never expose mutable bindings or the authoritative record.
    bodyHandle(role){const b=bound.get(role);return live(b)?{id:b.entity.id,generation:b.generation}:null;}});
}
