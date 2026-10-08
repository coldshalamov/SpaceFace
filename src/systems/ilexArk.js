import { ILEX_ARK as C, ILEX_VAULT_IDS, ILEX_START, ILEX_RECEIVER, ILEX_ROUTE,
  freshIlexArk, normalizeIlexArk, ilexOutcomeText, ilexReleasePose, validIlexOutcome } from '../data/ilexArk.js';
import { ILEX_ARK_RADIUS, ILEX_ARK_VISUAL_RADIUS, ILEX_VAULT_RADIUS, ilexArkPhysicalBody, ilexVaultPhysicalBody, ilexVaultSocket } from '../data/ilexArkBody.js';
import { makeShipEntitySpec } from './ships.js';
import { ManeuverPlanner } from '../ai/maneuver.js';
import { ManeuverKind } from '../ai/contracts.js';
import { getCombatKernel } from '../combat/kernel.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { attachmentBindsOccupant } from '../combat/attachments.js';
import { resolveDockRange } from '../core/dockRange.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../data/collisionProxyManifests.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';

const terminal=new Set(['delivered','destroyed','lost']);
const dist=(a,b)=>a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;
const pose=e=>({x:e.pos.x,z:e.pos.z,vx:e.vel.x,vz:e.vel.z,rot:e.rot||0,spin:e.angVel||0});
const clone=v=>structuredClone(v);
const owners=new WeakMap();
const key=id=>`${C.id}:${id}`;

// Six source records; existing flight, native physics, attachment, missions and stock owners
// perform their own mutations. An accepted receiver never depends on a submitted count.
export const ilexArk={name:'ilexArk',init(ctx){
  this.ctx=ctx;this.state=ctx.state;this.bus=ctx.bus;this.helpers=ctx.helpers;this._bindings=new Map();this._subs=[];
  this._restoring=false;this._lastTick=-1;this._offerKey=null;this._busy=false;this._planner=new ManeuverPlanner();this._impactTicks=new WeakMap();this._retired=new WeakSet();
  this._row=normalizeIlexArk(ctx.state.ilexArk);ctx.state.ilexArk=this._row;owners.set(ctx.state,this);
  const on=(event,fn)=>this._subs.push(this.bus.on(event,fn));
  on('mission:completed',p=>{if(['cargo_delivery','salvage_retrieval'].includes(p?.type))this._row.eligible=true;});
  on('scan:completed',p=>{const e=this.state.entities.get(p?.targetId);if(e?.data?.ilexId===C.id)this.offer();});
  on('ilexArk:accept',p=>{const r=this.accept(p?.revision);if(!r.ok)this._say(`Escort refused — ${r.reason}.`);});
  on('ilexArk:deliver',()=>{const r=this.deliverVault();if(!r.ok)this._say(`Vault refused — ${r.reason}.`);});
  on('ilexArk:finish',p=>{const r=this.finish(p?.revision);if(!r.ok)this._say(`Voyage remains open — ${r.reason}.`);});
  on('ilexArk:course',()=>this.bus.emit('ui:setCourse',{pos:{...ILEX_RECEIVER},sectorId:C.destinationSectorId,label:'Ilex · Ceres seed receiver'}));
  on('combat:damage',p=>this._damage(p));on('physics:impact',p=>this._impact(p));
  on('entity:killed',p=>this._lost(p?.targetId??p?.entityId??p?.id,this.state.entities.get(p?.targetId??p?.entityId??p?.id)));
  on('entity:destroyed',p=>this._lost(p?.id,p?.entity));
  on('tether:broken',p=>{if(this._row.phase==='active'&&this.state.entities.get(p?.targetId)?.data?.ilexVaultId)
    this._say('The vault is free of your line. Its original body is still recoverable.');});
  on('save:restoring',()=>{this._restoring=true;this._bindings.clear();});
  on('save:loaded',()=>this.afterContinue());on('sector:enter',()=>{this._offerKey=null;});
},
_attached(){return ILEX_VAULT_IDS.filter(id=>this._row.vaults[id].status==='attached');},
_find(id){
  const old=this._bindings.get(id);if(old&&this.state.entities.get(old.entity.id)===old.entity
    &&old.entity.occupantGeneration===old.life&&old.entity.alive!==false&&old.entity.data?.ilexBodyKey===key(id)
    &&old.entity.data.persistenceOwner===C.persistenceOwner)return old.entity;
  if(old&&!this._restoring)this._lost(old.entity.id,old.entity);
  this._bindings.delete(id);let result=null;
  for(const e of this.state.entityList)if(e.alive!==false&&e.data?.ilexId===C.id&&e.data?.ilexBodyKey===key(id)&&e.data.persistenceOwner===C.persistenceOwner){
    if(result)return null;result=e;}
  if(result)this._bindings.set(id,{entity:result,life:result.occupantGeneration});return result;
},
_native(e){const p=this.ctx.registry?.get('physics');const r=p?._sg02?.records.get(e?.id);
  return !p?._nativeRestorePending&&!p?._nativeRestoreDeferred&&r?.entity===e&&r.body&&physicsBodyNativeReady(e)?r:null;},
_capture(){const carrier=this._find('carrier');if(carrier){this._row.carrierPose=pose(carrier);this._row.carrierHull=carrier.hull;}
  for(const id of ILEX_VAULT_IDS){const e=this._find(id);if(e&&this._row.vaults[id].status==='drifting'){
    this._row.vaults[id].pose=pose(e);this._row.vaults[id].hull=e.hull;}}
},
_spawnCarrier(){
  if(this._row.carrierStatus!=='live'||this._find('carrier'))return;
  if(this._row.phase==='waiting'&&this.state.world?.currentSectorId!==C.originSectorId)return;
  const budget=this.helpers.spawnBudget;if(!budget||budget.request(1,C.actorId)!==1)return;
  const saved=this._row.carrierPose,body=ilexArkPhysicalBody(this._attached(),this._row.revision);
  const e=this.helpers.spawnEntity({...makeShipEntitySpec('ship_hawser',{team:2,factionId:'faction_mts',
    pos:saved?{x:saved.x,z:saved.z}:{...ILEX_START},rot:saved?.rot??Math.PI,ai:{passive:true,holdFire:true}}),
    name:'Captain Ilex · Seed Ark',radius:ILEX_ARK_RADIUS,visualRadius:ILEX_ARK_VISUAL_RADIUS,mass:body.mass,hull:this._row.carrierHull,hullMax:460,shield:0,shieldMax:0,
    vel:saved?{x:saved.vx,z:saved.vz}:{x:0,z:0},angVel:saved?.spin||0,weapons:[],flags:{persistent:true,missionPinned:true},physicsBody:body,
    data:{ilexId:C.id,ilexBodyKey:key('carrier'),worldRecordId:C.actorId,identityKey:C.actorId,persistenceOwner:C.persistenceOwner,
      missionId:C.id,homeSectorId:C.originSectorId,sectorId:this.state.world.currentSectorId,authoredAssetId:'SF_SHIP_ILEX_ARK',defId:'ship_hawser',shipId:'ship_hawser',
      name:'Captain Ilex · Seed Ark',callsign:'SEED ARK',scannable:true,scanLabel:'Captain Ilex · six living botanical vaults',
      ai:{passive:true,holdFire:true},weapons:[],fittings:[],miningBeam:null},
    flightModel:{flightClass:'freighter',mass:body.mass,inertia:body.inertiaY,mainAccel:8,reverseAccel:7,strafeAccel:5,
      angularAccel:.8,angularBrake:2,maxYawRate:.55,maxSpeed:32,boostMult:1,boostMaxSpeedMult:1,normalMaxSpeedMult:1,
      linearDrag:0,lateralDrag:0,assistStrength:0,reverseBrake:2.4}});
  if(!e||!budget.bindEntity(e.id,C.actorId)){if(e)this.helpers.removeEntity(e.id);budget.release(C.actorId);return;}
  this._bindings.set('carrier',{entity:e,life:e.occupantGeneration});
},
_syncCarrier(e){if(!e)return;const body=ilexArkPhysicalBody(this._attached(),this._row.revision);
  if(e.physicsBody?.collisionProxyManifest?.id!==body.collisionProxyManifest.id||e.physicsBody?.revision!==body.revision){
    e.physicsBody=body;e.mass=body.mass;
    if(e.flightModel){e.flightModel.mass=body.mass;e.flightModel.inertia=body.inertiaY;}
    if(e.data?.derived?.flightModel){e.data.derived.flightModel.mass=body.mass;e.data.derived.flightModel.inertia=body.inertiaY;}
  }
},
_releaseReady(){const carrier=this._find('carrier');
  if(this.state.settings?.gameplay?.physicsBackend!=='rapier-dynamic')return true;
  const physics=this.ctx.registry?.get('physics');if(!physics?._sg02||physics._nativeRestorePending||physics._nativeRestoreDeferred)return false;
  if(!carrier){for(const r of physics._sg02.records.values())if(r.entity?.data?.ilexBodyKey===key('carrier'))return false;return true;}
  const r=this._native(carrier);return !!r&&r.proxyId===carrier.physicsBody.collisionProxyManifest.id&&r.revision===carrier.physicsBody.revision;
},
_materialize(){
  if(!this._row.eligible&&!this.state.missions?.completedLog?.some(r=>['cargo_delivery','salvage_retrieval'].includes(r.type)&&r.success>0))return;
  this._row.eligible=true;if(this._row.phase==='settled')return;
  this._spawnCarrier();const carrier=this._find('carrier');this._syncCarrier(carrier);
  for(const id of ILEX_VAULT_IDS){const v=this._row.vaults[id];if(terminal.has(v.status)||v.status==='attached'||this._find(id))continue;
    if(v.status==='releasing'&&!this._releaseReady())continue;
    const p=v.pose;if(!p){v.status='lost';continue;}
    const e=this.helpers.spawnEntity({type:'payload',team:2,factionId:'faction_mts',pos:{x:p.x,z:p.z},vel:{x:p.vx,z:p.vz},rot:p.rot,angVel:p.spin,
      mass:ilexVaultPhysicalBody(id).mass,radius:ILEX_VAULT_RADIUS,hull:v.hull,hullMax:85,shield:0,shieldMax:0,
      flags:{persistent:true,missionPinned:true},physicsBody:ilexVaultPhysicalBody(id),data:{ilexId:C.id,ilexBodyKey:key(id),ilexVaultId:id,
        identityKey:key(id),worldRecordId:key(id),persistenceOwner:C.persistenceOwner,missionId:C.id,homeSectorId:this.state.world.currentSectorId,
        authoredAssetId:'SF_PROP_ILEX_VAULT',authoredPayloadAssetId:'SF_PROP_ILEX_VAULT',name:`Ilex botanical ${id.replace('_',' ')}`,scannable:true,scanLabel:'Original seed vault · fragile living cargo',
        salvagePool:{},authoredSalvagePool:{},lifetimeS:Infinity}});
    if(e){v.status='drifting';this._bindings.set(id,{entity:e,life:e.occupantGeneration});}
  }
},
sever(id){const v=this._row.vaults[id],carrier=this._find('carrier');
  if(!v||v.status!=='attached'||!carrier)return {ok:false,reason:'vault_not_attached'};
  const socket=ilexVaultSocket(id);v.pose=ilexReleasePose(carrier,socket,this._native(carrier)?.body);v.status='releasing';
  this._row.revision++;this._syncCarrier(carrier);this._say(`${id.replace('_',' ')} is free. The ship continues; recovery is your choice.`);
  this.bus.emit('ilexArk:vaultReleased',{vaultId:id,revision:this._row.revision});return {ok:true};
},
_lost(entityId,entity){
  const e=entity||this.state.entities.get(entityId);if(!e||this._retired.has(e)||e.data?.ilexId!==C.id)return;
  const id=e.data.ilexVaultId||'carrier',binding=this._bindings.get(id);
  if(binding&&(binding.entity!==e||binding.life!==e.occupantGeneration))return;
  if(!binding&&this.state.entities.get(entityId)!==e)return;
  if(id==='carrier'){
    if(this._row.carrierStatus!=='live')return;
    // Capture and reserve all physical fates before any synchronous listener can retire/reenter.
    this._row.carrierPose=pose(e);this._row.carrierStatus='lost';this._row.carrierHull=0;
    for(const vid of this._attached()){const v=this._row.vaults[vid];v.pose=ilexReleasePose(e,ilexVaultSocket(vid),this._native(e)?.body);v.status='releasing';}
    this._row.revision++;this.helpers.spawnBudget?.releaseEntity(e.id,e);
    this._say('The carrier is lost. Surviving original vaults remain recoverable; the crew loss is recorded.');
  }else{const v=this._row.vaults[id];if(!v||terminal.has(v.status))return;v.status='destroyed';v.hull=0;this._row.revision++;
    this._say(`${id.replace('_',' ')} destroyed. Its seed line is lost.`);}
  this._bindings.delete(id);
},
_damage(p){const e=this.state.entities.get(p?.targetId);if(!e||e.data?.ilexId!==C.id||!(p.hullDamage>0))return;
  if(e.data.ilexVaultId){this._row.vaults[e.data.ilexVaultId].hull=e.hull;return;}
  if(this._row.carrierStatus!=='live'||!p.pos)return;
  let hit=null,best=7;for(const id of this._attached()){const q=ilexReleasePose(e,ilexVaultSocket(id)),d=dist(p.pos,q);if(d<best){hit=id;best=d;}}
  if(hit){const v=this._row.vaults[hit];v.collar=Math.max(0,v.collar-p.hullDamage);if(v.collar===0)this.sever(hit);}
},
_impact(p){if(!(p?.preSolveClosingSpeed>18))return;
  const e=[this.state.entities.get(p.aId),this.state.entities.get(p.bId)].find(e=>e?.data?.ilexVaultId&&e.alive);
  if(!e||this._impactTicks.get(e)===p.tick)return;this._impactTicks.set(e,p.tick);
  const packet=scalarHitToDamagePacket({damage:Math.min(100,(p.preSolveClosingSpeed-18)*4),damageType:'kinetic',pos:{...e.pos},source:{kind:'ilex_vault_shock'}});
  packet.flags={ignoreFriendlyFire:true,allowAnyTarget:true};getCombatKernel(this.ctx).routeDamage({targetId:e.id,packet,origin:{kind:'ilex_vault_shock',id:C.id}});
},
_player(){const p=this.state.entities.get(this.state.playerId);return p?.alive?p:null;},
_receiver(e){if(!e?.alive||Math.hypot(e.vel.x,e.vel.z)>C.receiverSpeed)return null;
  const r=resolveDockRange({...this.state,playerId:e.id});return r.stationId===C.stationId?r.station:null;},
_towGate(){const player=this._player(),receiver=this._receiver(player);if(!receiver)return {ok:false,reason:'pilot_outside_slow_receiver'};
  const attachments=getCombatKernel(this.ctx).attachments;
  for(const id of ILEX_VAULT_IDS){if(this._row.vaults[id].status!=='drifting')continue;const e=this._find(id);if(!e||this._receiver(e)!==receiver)continue;
    const line=attachments.listForEntity(player.id).find(a=>a.state==='active'&&a.defId==='attachment_massline'
      &&((a.ownerId===player.id&&a.targetId===e.id)||(a.targetId===player.id&&a.ownerId===e.id))
      &&attachmentBindsOccupant(a,player.id,player.occupantGeneration)&&attachmentBindsOccupant(a,e.id,e.occupantGeneration));
    if(!line)continue;
    if(this.state.settings?.gameplay?.physicsBackend==='rapier-dynamic'&&(!this._native(e)||!this._native(player)
      ||!this.helpers.combatPhysics?.getAttachmentTelemetry?.({attachmentId:line.id,physicsHandle:line.physicsHandle})))continue;
    return {ok:true,id,e,player,receiver,line,attachments};}
  return {ok:false,reason:'original_vault_native_line_required'};
},
accept(revision){if(this._restoring||this._row.phase!=='waiting'||revision!==this._row.revision||!this._row.eligible)return {ok:false,reason:'offer_changed'};
  const p=this._player(),e=this._find('carrier')||ILEX_VAULT_IDS.map(id=>this._find(id)).find(Boolean);
  if(!p||!e||dist(p.pos,e.pos)>C.offerRange)return {ok:false,reason:'source_out_of_range'};
  this._row.phase='active';this._row.acceptedAt=this.state.simTime;this._row.deadline=this.state.simTime+C.deadlineS;this._row.revision++;
  this._say('Six original vaults bound for Ceres. Protect the carrier or recover a loose vault. Partial arrival is accepted; lost cargo stays lost.');
  this.bus.emit('ilexArk:accepted',{missionId:C.id,deadline:this._row.deadline});return {ok:true};
},
_acceptCarrier(){const e=this._find('carrier');if(!e||this._row.phase!=='active'||!this._receiver(e))return false;
  if(this.state.settings?.gameplay?.physicsBackend==='rapier-dynamic'&&!this._native(e))return false;
  for(const id of this._attached())this._row.vaults[id].status='delivered';
  this._row.carrierStatus='received';this._row.revision++;
  this._retired.add(e);
  this.helpers.spawnBudget?.releaseEntity(e.id,e);this._bindings.delete('carrier');this.helpers.removeEntity(e.id);
  this._say(`${this._delivered().length}/6 original vaults at the greenhouse. Loose vaults remain recoverable until the voyage closes.`);return true;
},
deliverVault(){if(this._busy||this._restoring||this._row.phase!=='active')return {ok:false,reason:'voyage_not_active'};
  const gate=this._towGate();if(!gate.ok)return gate;this._busy=true;
  try{const again=this._towGate();if(!again.ok||again.e!==gate.e||again.line!==gate.line||again.receiver!==gate.receiver)return {ok:false,reason:'custody_changed'};
    // Reserve physical custody before cut/removal callbacks; these seeds can never be released again.
    this._row.vaults[gate.id].status='delivered';this._row.revision++;
    const cut=gate.attachments.cut(gate.line.id,gate.player.id,'ilex_receiver');
    if(!cut?.ok){this._row.vaults[gate.id].status='drifting';this._row.revision++;return {ok:false,reason:'line_cut_refused'};}
    this._retired.add(gate.e);this._bindings.delete(gate.id);this.helpers.removeEntity(gate.e.id);
    this.bus.emit('ilexArk:vaultDelivered',{id:key(gate.id),vaultId:gate.id,stationId:C.stationId});
    this._say(`${this._delivered().length}/6 original vaults accepted. The remaining lines are still open.`);return {ok:true,vaultId:gate.id};
  }finally{this._busy=false;}
},
_delivered(){return ILEX_VAULT_IDS.filter(id=>this._row.vaults[id].status==='delivered');},
finish(revision,expired=false){if(this._busy||this._restoring||this._row.phase!=='active'||(!expired&&revision!==this._row.revision))return {ok:false,reason:'outcome_changed'};
  if(!expired&&!this._receiver(this._player()))return {ok:false,reason:'return_to_ceres_receiver'};
  this._capture();this._row.phase='settled';
  for(const id of ILEX_VAULT_IDS)if(!terminal.has(this._row.vaults[id].status))this._row.vaults[id].status='lost';
  if(this._row.carrierStatus==='live')this._row.carrierStatus='lost';
  const at=this.state.simTime,ids=this._delivered();this._row.settlement={id:`${C.id}:outcome`,stationId:C.stationId,
    deliveredVaultIds:ids,at,harvestAt:at+C.harvestDelayS,rewardCr:ids.length?C.baseRewardCr+ids.length*C.vaultRewardCr:0,
    carrierAlive:this._row.carrierStatus==='received',reason:expired?'deadline':'filed'};this._row.revision++;
  this._removeBodies();this._say(ilexOutcomeText(ids,this._row.settlement.carrierAlive));this._settle();
  this.bus.emit('ilexArk:finished',clone(this._row.settlement));return {ok:true,receipt:clone(this._row.settlement)};
},
outcomeReceipt(id){return id===this._row.settlement?.id&&this._row.phase==='settled'&&validIlexOutcome(this._row.settlement)?clone(this._row.settlement):null;},
_settle(){const r=this._row.settlement;if(!r)return;
  this.ctx.registry?.get('missions')?.settleIlexArk?.(r.id);
  if(this.state.simTime>=r.harvestAt)this.ctx.registry?.get('economy')?.applyIlexSeedHarvest?.(r.id);
},
_routePoint(e){if(this._row.routeIndex<ILEX_ROUTE.length-1)return ILEX_ROUTE[this._row.routeIndex];
  const station=this.state.entityList.find(s=>s.alive&&s.type==='station'&&s.data?.stationId===C.stationId);
  const manifest=station&&resolveCollisionProxyManifest(station);return station&&resolveDockAnchor(station,manifest,e)||ILEX_ROUTE.at(-1);},
_motor(){const e=this._find('carrier');if(!e||!physicsBodyNativeReady(e)||!this.helpers.aiManeuver?.request)return;
  const active=this._row.phase==='active',target=active?this._routePoint(e):ILEX_START;
  if(active&&this._row.routeIndex<ILEX_ROUTE.length-1&&dist(e.pos,target)<140){this._row.routeIndex++;this._row.revision++;}
  const perception=this.helpers.aiSensors?.liveFrameFor?.(e.id,this.state.tick)||{self:{id:e.id,pos:{...e.pos},vel:{...e.vel},rot:e.rot,radius:e.radius},contacts:[],events:[]};
  const behavior={maneuver:{kind:active?ManeuverKind.FORMATION:ManeuverKind.HOLD,enemyMindOwned:true,
    formationSlot:target,formationVelocity:{x:0,z:0},formationBound:0,breakFormation:true,reason:'ilex-seed-voyage'}};
  const request=this._planner.plan({tick:this.state.tick,entityId:e.id,perception,behavior,
    directive:{formation:{slot:target,velocity:{x:0,z:0},bound:0,breakFormation:true}}});
  this.helpers.aiManeuver.request({...request,boost:false});
},
_incident(){if(this._row.phase!=='active'||this._row.incident||this._row.routeIndex<1)return;
  const carrier=this._find('carrier');if(!carrier||dist(this._player()?.pos,carrier.pos)>1200)return;
  const owner=`${C.id}:incident`,budget=this.helpers.spawnBudget;const grant=budget?.request(2,owner)||0;if(!grant)return;
  this._row.incident=true;
  for(let i=0;i<grant;i++){const e=this.helpers.spawnEntity(makeShipEntitySpec('ship_hornet',{team:1,factionId:'faction_reach',
    pos:{x:carrier.pos.x-360,z:carrier.pos.z+(i?290:-290)},rot:Math.PI,ai:{archetype:'raider',level:1}}));
    if(e&&!budget.bindEntity(e.id,owner))this.helpers.removeEntity(e.id);}
  this._say('Raiders on the vault collars. Cover the ship, or take a released vault clear of the attack.');
},
offer(){const p=this._player(),carrier=this._find('carrier'),source=carrier||ILEX_VAULT_IDS.map(id=>this._find(id)).find(Boolean);
  if(!p||(!this._receiver(p)&&(!source||dist(p.pos,source.pos)>C.offerRange)))return false;
  const n=this._delivered().length,tow=this._row.phase==='active'&&this._towGate().ok;
  this.bus.emit('ilexArk:offer',{revision:this._row.revision,canAccept:this._row.phase==='waiting'&&this._row.eligible,
    canDeliver:tow,canFinish:this._row.phase==='active'&&!!this._receiver(p),canCourse:this._row.phase==='active',delivered:n,
    status:`${n}/6 ARRIVED · ${this._row.carrierStatus==='lost'?'CARRIER LOST':'ORIGINAL VAULTS'}`,
    text:this._row.phase==='waiting'?'Ilex carries six seed lines that have never seen a sky. Escort is optional. A destroyed or abandoned vault cannot be replaced. Ceres pays for the arrived lines, and its greenhouse plants only those lines.':ilexOutcomeText(this._delivered(),this._row.carrierStatus!=='lost')});return true;
},
_say(text){if(this.helpers.voice?.say)this.helpers.voice.say({id:`${C.id}:r${this._row.revision}`,channel:'comms',text:`ILEX: ${text}`,priority:28,ttl:6});
  else this.bus.emit('toast',{text:`ILEX: ${text}`,kind:'info',ttl:6});},
update(_dt,state){if(this._restoring||state.mode!=='flight'||(state.run?.kind==='survival'&&state.run.phase!=='inactive')||state.tick===this._lastTick)return;
  this._lastTick=state.tick;this._capture();this._materialize();
  if(this._row.phase==='active'){this._acceptCarrier();if(state.simTime>=this._row.deadline)this.finish(this._row.revision,true);else{this._motor();this._incident();}}
  else if(this._row.phase==='waiting')this._motor();
  if(state.tick%60===0){this._settle();const p=this._player(),e=this._find('carrier');
    const trigger=`${this._row.phase}:${this._row.revision}:${this._towGate().ok}:${!!this._receiver(p)}:${dist(p?.pos,e?.pos)<=C.offerRange}`;
    if(trigger!==this._offerKey){this._offerKey=trigger;this.offer();}}
},
_removeBodies(){for(const e of [...this.state.entityList])if(e.data?.ilexId===C.id){this._retired.add(e);this.helpers.spawnBudget?.releaseEntity(e.id,e);this.helpers.removeEntity(e.id);}
  this._bindings.clear();},
serialize(){this._capture();return clone(this._row);},
deserialize(raw){this._bindings.clear();this._row=normalizeIlexArk(raw);this.state.ilexArk=this._row;this._lastTick=-1;this._offerKey=null;this._planner.byEntity.clear();},
afterContinue(){this._restoring=false;this._bindings.clear();this._lastTick=-1;this._offerKey=null;
  const e=this._find('carrier');if(e){const budget=this.helpers.spawnBudget;if(budget?.ownerForEntity(e.id)!==C.actorId){
    if(budget?.request(1,C.actorId)===1)budget.bindEntity(e.id,C.actorId);}}
},
newGame(){this._removeBodies();this.deserialize(null);this._restoring=false;},
destroy(){for(const off of this._subs||[])off();owners.delete(this.state);this._planner.byEntity.clear();this._bindings.clear();},
};

export function ilexArkPresentation(state,entity){const owner=owners.get(state);if(!owner||entity!==owner._find('carrier'))return null;
  const native=owner._native(entity);
  return {attachedVaultIds:owner._attached(),phase:owner._row.phase,revision:owner._row.revision,
    nativeBodyReady:!!native&&native.proxyId===entity.physicsBody.collisionProxyManifest.id&&native.revision===entity.physicsBody.revision};}
