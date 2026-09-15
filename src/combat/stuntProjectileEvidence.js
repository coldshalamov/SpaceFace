// PQ-146 projectile observations. Emission, physical reflection and damage share exact body-life IDs.
// This observer never changes motion or damage. A verified hostile redirect transfers combat ownership.
import { journalFor, bodyLife, angleBetween, EVIDENCE_REVISION, EVIDENCE_LIMITS } from './stuntEvidence.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { isSurfaceContactReceipt, surfaceResponseFor, SURFACE_RESPONSE } from '../core/surfaceContact.js';
import { witnessLineOfSight } from './stuntWitnesses.js';
import { readTumbleStatus } from './tumbleStatus.js';
const LIMITS={shots:64,contacts:32,surfaces:8,history:121};
const STATES=new WeakMap();
const point=p=>({x:p.x,z:p.z});
const valid=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
const length=v=>Math.hypot(v.x,v.z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const same=(a,b)=>valid(a)&&valid(b)&&distance(a,b)<=1e-4*Math.max(1,length(a),length(b));
const clone=v=>structuredClone(v);
const materialSurface=e=>surfaceResponseFor(e.surfaceMaterial??e.surfaceKind??e.data?.surfaceMaterial??e.data?.surfaceKind)===SURFACE_RESPONSE.reflect;
function own(state){const j=journalFor(state);if(!j)return null;STATES.set(j,state);return j.projectiles||=( {revision:2,shots:{},contacts:{},playerHistory:[],surfaceHistory:{},surfaceTorques:{},lastTick:-1} );}
export function observeAppliedSurfaceTorque(entity,before,after,evidence){const state=STATES.get(journalFor());if(!state||!entity||state.entities.get(entity.id)!==entity||!materialSurface(entity)||!Number.isFinite(before)||!Number.isFinite(after)||before===after)return;
const record=own(state),life=bodyLife(entity,state);record.surfaceTorques||={};
if(evidence?.provenance?.actorId!==state.playerId||evidence.tick!==state.tick){delete record.surfaceTorques[life.id];return;}
record.surfaceTorques[life.id]={lifeId:life.id,id:entity.id,tick:state.tick,rot:entity.rot||0,lastRot:entity.rot||0,before,after,delta:after-before,ownedDegrees:0};}
function shotFor(state,projectile){return own(state)?.shots[bodyLife(projectile,state)?.id];}
function addNode(j,root,node){if(root.nodes.length>=32){root.truncated=true;j.withheld++;return false;}root.nodes.push({...node,id:`edge:${++j.sequence}`});return true;}
function recent(root,tick){return root&&!root.truncated&&tick>=root.tick&&tick-root.tick<=480;}
function isHostile(state,entity){const p=state.entities.get(state.playerId);return !!(p&&entity&&isHostileForAI(state,entity,p));}
function approach(origin,velocity,target,radius,seconds=2){const dx=target.pos.x-origin.x,dz=target.pos.z-origin.z,vx=velocity.x-target.vel.x,vz=velocity.z-target.vel.z;const speed=vx*vx+vz*vz;const time=speed?Math.max(0,Math.min(seconds,(dx*vx+dz*vz)/speed)):0;return {time,clearance:Math.hypot(dx-vx*time,dz-vz*time)-radius};}
function emissionNode(shot){return {kind:'projectile_emission',tick:shot.tick,entityId:shot.id,lifeId:shot.lifeId,ownerId:shot.ownerId,ownerLife:shot.ownerLife,pos:point(shot.pos),velocity:point(shot.velocity)};}
function createRoot(state,body,shot,before,after,kind,tick){const j=journalFor(state),life=bodyLife(body,state),player=bodyLife(state.entities.get(state.playerId),state);if(!j||!life||!player||j.roots.size>=EVIDENCE_LIMITS.episodes)return null;
const root={id:`root:${++j.sequence}`,actorId:state.playerId,sourceId:body.id,sourceLife:life.id,sourceType:body.type,sourceDeathTick:null,sourceName:life.name,tick,kind,
weaponId:body.data?.weaponId??null,pos:point(body.pos),before:point(before),after:point(after),dv:{x:after.x-before.x,z:after.z-before.z},reference:{mass:life.mass,hull:life.hull,cruise:life.cruise,radius:life.radius,length:life.length},playerMass:player.dryMass,playerLength:player.length,encounterId:player.encounterId??shot.encounterId,
sceneReferenceMass:j.referenceMass,referenceMomentum:.2*j.referenceMass*j.referenceCruise,nodes:[],terminals:[],truncated:false};
j.roots.set(root.id,root);j.bodies.set(life.id,{rootId:root.id,lastTick:tick,edges:0,useful:point(root.dv),other:{x:0,z:0},origin:{pos:point(body.pos),before:point(before),tick}});addNode(j,root,emissionNode(shot));return root;}
function flightSolution(state,history,player){const life=bodyLife(player,state);if(!life)return null;for(const frame of history){if(frame.lifeId!==life.id||state.tick-frame.tick>120||state.tick<frame.tick)continue;const displacement=distance(frame.pos,player.pos),turn=angleBetween(frame.velocity,player.vel);if(displacement>=life.length&&turn>=25)return {solutionTick:frame.tick,playerDisplacement:displacement,playerTurn:turn};}return null;}
function surfaceSolution(state,entity,history){const j=journalFor(state),life=bodyLife(entity,state),influence=j?.bodies.get(life?.id),root=influence&&j.roots.get(influence.rootId);
const linear=recent(root,state.tick)&&root.actorId===state.playerId&&state.tick-root.tick<=120;
const torque=own(state)?.surfaceTorques?.[life?.id],angular=torque&&state.tick-torque.tick<=120&&torque.ownedDegrees>=20;
if(!linear&&!angular)return null;
const startTick=linear?root.tick:torque.tick,first=history?.frames?.find(f=>f.tick>=startTick&&state.tick-f.tick<=120);if(!first)return null;
const width=Math.max(0,2*(entity.radius??0)),displacement=linear?distance(root.pos,entity.pos):0,turn=angular?Math.min(torque.ownedDegrees,Math.abs(Math.atan2(Math.sin((entity.rot||0)-torque.rot),Math.cos((entity.rot||0)-torque.rot)))*180/Math.PI):0;
if(!(width>0&&(displacement>=width||turn>=20)))return null;
return {solutionTick:startTick,surfaceDisplacement:displacement,surfaceTurn:turn,surfaceWidth:width,surfaceLife:life.id,surfaceId:entity.id,rootId:root?.id??null,priorPos:point(first.pos),priorRot:first.rot};}
export function sampleProjectileEvidence(state,bus){const record=own(state);if(!record||state.mode!=='flight'||record.lastTick===state.tick)return;record.lastTick=state.tick;
const player=state.entities.get(state.playerId);if(player?.alive&&valid(player.pos)&&valid(player.vel)){const life=bodyLife(player,state);record.playerHistory.push({tick:state.tick,lifeId:life.id,pos:point(player.pos),velocity:point(player.vel)});if(record.playerHistory.length>121)record.playerHistory.shift();
let count=0;for(const entity of state.entities.values()){if(count>=8)break;if(!entity.alive||!entity.collides||!valid(entity.pos)||!materialSurface(entity)||distance(entity.pos,player.pos)>600)continue;const life=bodyLife(entity,state);const row=record.surfaceHistory[life.id]||={id:entity.id,lifeId:life.id,frames:[]};row.frames.push({tick:state.tick,pos:point(entity.pos),rot:entity.rot||0});if(row.frames.length>121)row.frames.shift();count++;}}
for(const [id,row] of Object.entries(record.surfaceHistory))if(state.tick-(row.frames.at(-1)?.tick??-Infinity)>120)delete record.surfaceHistory[id];
for(const [id,torque] of Object.entries(record.surfaceTorques||{})){const entity=state.entities.get(torque.id);if(!entity||bodyLife(entity,state)?.id!==id||state.tick-torque.tick>120){delete record.surfaceTorques[id];continue;}const turn=Math.atan2(Math.sin((entity.rot||0)-torque.lastRot),Math.cos((entity.rot||0)-torque.lastRot)),spin=entity.angVel||0;
if(turn*torque.delta>0)torque.ownedDegrees+=Math.abs(turn)*180/Math.PI*Math.min(1,Math.abs(torque.delta)/Math.max(Math.abs(torque.after),Math.abs(spin),1e-6));torque.lastRot=entity.rot||0;}
for(const [lifeId,shot] of Object.entries(record.shots)){const body=state.entities.get(shot.id),pending=Object.values(record.contacts).some(c=>c.projectileLife===lifeId&&!c.emitted&&state.tick-c.tick<=180);if(state.tick-shot.tick>480||(!body&&!pending)||(body&&bodyLife(body,state)?.id!==lifeId)){delete record.shots[lifeId];continue;}if(body?.alive&&state.tick>(shot.velocitySyncTick??-1)&&valid(body.vel)&&!same(body.vel,shot.expectedVelocity))shot.invalid=true;}
for(const [id,contact] of Object.entries(record.contacts)){if(state.tick-contact.tick>180){delete record.contacts[id];continue;}if(contact.emitted||!contact.damage)continue;const target=state.entities.get(contact.targetId);if(!target||bodyLife(target,state)?.id!==contact.targetLife)continue;const tumble=readTumbleStatus(state,target);const active=tumble?.data&&tumble.applyTick>=contact.tick&&tumble.applyTick<=state.tick&&state.simTime<tumble.data.until;
if(active){contact.helmTicks=contact.lastHelmTick===state.tick-1?(contact.helmTicks||0)+1:1;contact.lastHelmTick=state.tick;}else if(!contact.death)contact.helmTicks=0;
if(contact.helmTicks>=60)publishConsequence(state,contact,bus);}}
/** Called only after a real weapon spawned this exact body. No root is allocated for ordinary fire. */
export function observeProjectileEmission(state,projectile,owner,{parent=null}={}){const record=own(state);if(!record||!projectile||!owner||!valid(projectile.pos)||!valid(projectile.vel))return null;
if(owner.id!==state.playerId&&!isHostile(state,owner))return null;
const life=bodyLife(projectile,state),ownerLife=bodyLife(owner,state);if(!life||!ownerLife||Object.keys(record.shots).length>=64)return null;
// A split is a descendant of its actual projectile, not a new root or fresh emission by the owner.
if(parent){projectile.data ||= {};delete projectile.data.stuntProjectile;return null;}
const surfaces={};for(const [id,row] of Object.entries(record.surfaceHistory)){const entity=state.entities.get(row.id);if(!entity||bodyLife(entity,state)?.id!==id)continue;const solution=surfaceSolution(state,entity,row);if(solution)surfaces[id]=solution;}
const shot={id:projectile.id,lifeId:life.id,tick:state.tick,ownerId:owner.id,ownerLife:ownerLife.id,ownerHostile:isHostile(state,owner),pos:point(projectile.pos),velocity:point(projectile.vel),expectedVelocity:point(projectile.vel),ownerPos:point(owner.pos),encounterId:ownerLife.encounterId,
flight:owner.id===state.playerId?flightSolution(state,record.playerHistory,owner):null,surfaces,rootId:null,reflections:[],invalid:false};
record.shots[life.id]=shot;projectile.data ||= {};projectile.data.stuntProjectile={revision:2,lifeId:life.id,originalOwnerId:owner.id,originalOwnerLife:ownerLife.id,emissionTick:state.tick};return shot;}
/** Called from the actual applied-impulse observer, never from action/hitstun notifications. */
export function observeProjectileRedirect(state,{entity,before,after,provenance,tick,kind,root}){if(entity?.type!=='projectile'||!valid(before)||!valid(after)||same(before,after))return;
const shot=shotFor(state,entity);if(!shot||shot.invalid||tick<shot.tick||tick-shot.tick>480)return;
const actorId=provenance?.actorId??provenance?.field?.ownerId;
if(kind==='collision'||actorId!==state.playerId){shot.invalid=true;return;}
if(!shot.ownerHostile||shot.ownerId===state.playerId)return;
const owner=state.entities.get(shot.ownerId),ownerLife=bodyLife(owner,state);if(!owner?.alive||ownerLife?.id!==shot.ownerLife||!isHostile(state,owner)){shot.invalid=true;return;}
if(!recent(root,tick)){root=createRoot(state,entity,shot,before,after,kind==='field'?'projectile_field_redirect':'projectile_redirect',tick);if(!root)return;addNode(journalFor(state),root,{kind:'projectile_redirect',tick,entityId:entity.id,lifeId:shot.lifeId,pos:point(entity.pos),before:point(before),after:point(after),fieldId:provenance?.field?.id??null});}
if(!root.nodes.some(n=>n.kind==='projectile_emission')){if(root.nodes.length>=32){root.truncated=true;return;}root.nodes.unshift(emissionNode(shot));}
root.after=point(after);root.dv={x:after.x-root.before.x,z:after.z-root.before.z};
root.projectileOwnerId=shot.ownerId;root.projectileOwnerLife=shot.ownerLife;
const ownerSnapshot=root.originalOwnerAtRedirect||=( {pos:point(owner.pos),vel:point(owner.vel)} ),radius=(entity.radius||0)+(owner.radius||0);
root.originalMissesOwner=approach(root.pos,root.before,ownerSnapshot,radius).clearance>=.25*radius;
root.redirectAngle=angleBetween(root.before,root.after);root.redirectTick=tick;
shot.rootId=root.id;shot.expectedVelocity=point(after);shot.velocitySyncTick=tick+1;
if(root.redirectAngle>=60&&root.originalMissesOwner){entity.ownerId=state.playerId;entity.team=state.entities.get(state.playerId)?.team??entity.team;
entity.data.ownerId=state.playerId;entity.data.stuntProjectile.redirectRootId=root.id;entity.data.stuntProjectile.redirectTick=tick;}
}
/** The surface resolver calls this only after applying its physics receipt's actual reflection. */
export function observeProjectileReflection(state,body,surface,receipt,reflected,outgoing){const shot=shotFor(state,body),j=journalFor(state);if(!shot||shot.invalid||!j||!isSurfaceContactReceipt(receipt)||receipt.projectileId!==body.id||receipt.surfaceId!==surface?.id||receipt.tick!==state.tick||receipt.response!=='reflect')return null;
if(!same(reflected,outgoing)||!same(receipt.velocity,shot.expectedVelocity)){shot.invalid=true;return null;}
const angle=angleBetween(receipt.velocity,reflected);shot.expectedVelocity=point(outgoing);
const surfaceLife=bodyLife(surface,state),savedSolution=shot.surfaces[surfaceLife?.id];
const effective=s=>s&&((s.surfaceDisplacement>=s.surfaceWidth&&s.surfaceWidth>0)||(s.surfaceTurn>=20&&receipt.orientationSensitive===true));
const solution=effective(savedSolution)?savedSolution:shot.flight;
let root=shot.rootId&&j.roots.get(shot.rootId);
if(!root&&shot.ownerHostile&&angle>=60){
  const moved=surfaceSolution(state,surface,own(state).surfaceHistory[surfaceLife.id]);
  const radius=(surface.radius||0)+(body.radius||0);
  const oldMiss=moved&&approach(shot.pos,shot.velocity,{pos:moved.priorPos,vel:{x:0,z:0}},radius).clearance>=.25*radius;
  if(effective(moved)&&state.tick-moved.solutionTick<=60&&oldMiss){
    root=createRoot(state,body,shot,receipt.velocity,outgoing,'moving_plate_redirect',state.tick);
    if(root){addNode(j,root,{kind:'surface_reposition',tick:moved.solutionTick,entityId:surface.id,lifeId:surfaceLife.id,...moved});
      observeProjectileRedirect(state,{entity:body,before:receipt.velocity,after:outgoing,provenance:{actorId:state.playerId},tick:state.tick,kind:'moving_plate_redirect',root});}
  }
}
if(!root&&shot.ownerId===state.playerId&&solution&&angle>=25){root=createRoot(state,body,shot,shot.velocity,shot.velocity,'projectile_emission',shot.tick);if(root)root.pos=point(shot.pos);}
if(!recent(root,state.tick)||shot.reflections.length>=4)return null;
const reflection={kind:'reflection',tick:state.tick,entityId:body.id,lifeId:shot.lifeId,surfaceId:surface.id,surfaceLife:surfaceLife.id,normal:point(receipt.normal),pos:point(receipt.point),before:point(receipt.velocity),after:point(outgoing),angle,
solutionTick:solution?.solutionTick??null,playerDisplacement:solution?.playerDisplacement??0,playerTurn:solution?.playerTurn??0,surfaceDisplacement:solution?.surfaceDisplacement??0,surfaceTurn:receipt.orientationSensitive===true?(solution?.surfaceTurn??0):0,surfaceWidth:solution?.surfaceWidth??0,targets:[]};
for(const target of state.entities.values()){if(reflection.targets.length>=8)break;if(!target.alive||target.id===body.id||!valid(target.pos)||!valid(target.vel)||!isHostile(state,target))continue;const radius=(body.radius||0)+(target.radius||0),snapshot={pos:point(target.pos),vel:point(target.vel)};
if(approach(receipt.point,outgoing,snapshot,radius).clearance>0)continue;const miss=approach(receipt.point,receipt.velocity,snapshot,radius).clearance;
const directOccluded=!witnessLineOfSight(state,{id:shot.ownerId,pos:shot.pos},target.pos,[target.id,body.id]);
reflection.targets.push({lifeId:bodyLife(target,state).id,id:target.id,pos:snapshot.pos,velocity:snapshot.vel,unreflectedMiss:miss>=.25*radius,directOccluded,combinedRadius:radius});}
if(!addNode(j,root,reflection))return null;shot.reflections.push(reflection);shot.rootId=root.id;
const influence=j.bodies.get(shot.lifeId);if(influence){influence.lastTick=state.tick;influence.edges=shot.reflections.length;}
return reflection;}
/** Bind physical target contact to the later routed damage. No actor/weapon/position guessing. */
export function prepareProjectileContact(state,payload){const record=own(state),body=state.entities?.get(payload?.projectileId),target=state.entities?.get(payload?.targetId);if(!record||!body||!target||!valid(payload.projectileVelocity)||!valid(payload.targetVelocity)||!valid(payload.pos)||!valid(payload.normal))return null;
const shot=shotFor(state,body),root=shot?.rootId&&journalFor(state).roots.get(shot.rootId);if(!shot||shot.invalid||!recent(root,state.tick)||!isHostile(state,target)||!same(payload.projectileVelocity,shot.expectedVelocity)||Object.keys(record.contacts).length>=32)return null;
const targetLife=bodyLife(target,state),id=`projectile-contact:${shot.lifeId}:${targetLife.id}:${state.tick}`;if(record.contacts[id])return record.contacts[id];
const radius=(body.radius||0)+(target.radius||0);if(distance(payload.pos,target.pos)>radius+.1)return null;
const contact={id,tick:state.tick,projectileId:body.id,projectileLife:shot.lifeId,targetId:target.id,targetLife:targetLife.id,rootId:root.id,point:point(payload.pos),normal:point(payload.normal),beforeA:point(payload.projectileVelocity),beforeB:point(payload.targetVelocity),aPos:point(body.pos),bPos:point(target.pos),aRef:{...bodyLife(body,state),entity:undefined},bRef:{...targetLife,entity:undefined},hostile:true,damage:null,death:null,emitted:false};
record.contacts[id]=contact;
addNode(journalFor(state),root,{kind:'contact',tick:contact.tick,sourceId:shot.id,sourceLife:shot.lifeId,targetId:contact.targetId,targetLife:contact.targetLife,pos:point(contact.point),normal:point(contact.normal),beforeA:point(contact.beforeA),beforeB:point(contact.beforeB)});
payload.origin={...(payload.origin||{kind:'weapon',id:payload.weaponId??body.data?.weaponId??null}),stuntProjectileContactId:id,projectileLifeId:shot.lifeId};return contact;}
export function observeProjectileDamage(state,payload,bus){const record=own(state),id=payload?.origin?.stuntProjectileContactId,contact=record?.contacts[id];if(!contact||contact.emitted||contact.tick!==state.tick||payload.targetId!==contact.targetId||payload.origin.projectileLifeId!==contact.projectileLife||!(payload.before?.hull>0)||!(payload.hullDamage>0))return null;
const target=state.entities.get(contact.targetId);if(bodyLife(target,state)?.id!==contact.targetLife)return null;
contact.damage={hullDamage:payload.hullDamage,before:clone(payload.before),after:clone(payload.after),attackerId:payload.attackerId};
if(contact.death)publishConsequence(state,contact,bus);return contact;}
export function observeProjectileDeath(state,payload,bus){const record=own(state);if(!record)return;const target=state.entities?.get(payload.id??payload.targetId??payload.victimId),life=bodyLife(target,state);if(!target||target.alive!==false||!life)return;
for(const contact of Object.values(record.contacts)){if(contact.emitted||contact.targetLife!==life.id||contact.tick!==state.tick)continue;contact.death={id:`death:${life.id}`,tick:state.tick};publishConsequence(state,contact,bus);}}
function publishConsequence(state,contact,bus){if(!contact.damage||contact.emitted||!contact.death&&!(contact.helmTicks>=60))return null;const j=journalFor(state),record=own(state),shot=record.shots[contact.projectileLife],root=j.roots.get(contact.rootId);if(!shot||shot.invalid||!recent(root,state.tick))return null;
if(!contact.death&&(contact.damage.hullDamage<.25*contact.bRef.hull))return null;
const reflected=shot.reflections.at(-1),proof=reflected?.targets.find(t=>t.lifeId===contact.targetLife);
if(reflected){if(contact.tick-reflected.tick>120||contact.tick-reflected.tick<0)return null;
if(proof){const seconds=(contact.tick-reflected.tick)/60,predicted={x:proof.pos.x+proof.velocity.x*seconds,z:proof.pos.z+proof.velocity.z*seconds};if(distance(predicted,contact.bPos)>.25*proof.combinedRadius)return null;}}
if(root.projectileOwnerId!=null&&(root.projectileOwnerId!==contact.targetId||root.projectileOwnerLife!==contact.targetLife||contact.tick-root.tick>120))return null;
const edges=shot.reflections.length+1;if(edges>4||root.terminals.length>=8&&!root.terminals.includes(contact.targetLife))return null;
if(!root.terminals.includes(contact.targetLife))root.terminals.push(contact.targetLife);
const snapshot=clone(root);for(const n of snapshot.nodes)if(n.kind==='reflection'){const p=n.targets?.find(t=>t.lifeId===contact.targetLife);n.unreflectedMiss=p?.unreflectedMiss===true;n.directOccluded=p?.directOccluded===true;n.bankCorridorId=`${n.surfaceLife}:${Math.round(n.normal.x*100)}:${Math.round(n.normal.z*100)}`;}
const closingSpeed=Math.max(0,-((contact.beforeA.x-contact.beforeB.x)*contact.normal.x+(contact.beforeA.z-contact.beforeB.z)*contact.normal.z));
const receipt={id:contact.id,tick:contact.tick,targetId:contact.targetId,targetName:contact.bRef.name,targetHostile:true,targetKilled:!!contact.death,damageApplied:true,hullDamage:contact.damage.hullDamage,targetHullMax:contact.bRef.hull,helmLossSeconds:(contact.helmTicks||0)/60,
victimLife:{lifeId:contact.targetLife,threatClass:state.entities.get(contact.targetId)?.data?.stuntThreat?.threatClass??'none',dead:!!contact.death},surface:'projectile',
stuntEvidence:{revision:EVIDENCE_REVISION,root:snapshot,path:{tick:reflected?.tick??root.tick,edges,closingSpeed,usefulDeltaV:length(root.dv),momentum:contact.aRef.mass*closingSpeed},contact:{aId:shot.id,bId:contact.targetId,aPos:contact.aPos,bPos:contact.bPos,aRef:contact.aRef,bRef:contact.bRef,beforeA:contact.beforeA,beforeB:contact.beforeB,normal:contact.normal}}};
contact.emitted=true;bus?.emit?.('combat:projectileConsequence',receipt);return receipt;}
export function serializeProjectileEvidence(state){return own(state)?clone(own(state)):null;}
export function restoreProjectileEvidence(state,raw,remap=null){const j=journalFor(state);if(!j||raw?.revision!==2)return;const data=clone(raw),mapped=id=>remap?.get(String(id))??id;
for(const [id,shot] of Object.entries(data.shots||{})){shot.id=mapped(shot.id);shot.ownerId=mapped(shot.ownerId);const body=state.entities.get(shot.id),owner=state.entities.get(shot.ownerId);if(bodyLife(body,state)?.id!==shot.lifeId||bodyLife(owner,state)?.id!==shot.ownerLife||state.tick-shot.tick>480){delete data.shots[id];continue;}for(const n of shot.reflections||[]){n.entityId=mapped(n.entityId);n.surfaceId=mapped(n.surfaceId);for(const t of n.targets||[])t.id=mapped(t.id);}}
for(const [id,c] of Object.entries(data.contacts||{})){c.projectileId=mapped(c.projectileId);c.targetId=mapped(c.targetId);if(!data.shots[c.projectileLife]||bodyLife(state.entities.get(c.targetId),state)?.id!==c.targetLife)delete data.contacts[id];}
data.playerHistory=[];data.surfaceHistory={};data.lastTick=-1;j.projectiles=data;}
export function pendingProjectileBodyIds(state){const record=own(state),ids=new Set();for(const shot of Object.values(record?.shots||{})){ids.add(shot.id);ids.add(shot.ownerId);for(const reflection of shot.reflections||[]){ids.add(reflection.surfaceId);for(const target of reflection.targets||[])ids.add(target.id);}}for(const c of Object.values(record?.contacts||{}))ids.add(c.targetId);return ids;}
