import {readFileSync} from 'node:fs';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';import {createGameState} from '../src/core/gameState.js';
import {PRODUCTION_INIT_ORDER,PRODUCTION_UPDATE_ORDER} from '../src/runtime/authoritativeSystemManifest.js';
import {flightV3} from '../src/systems/flightV3.js';import {physics as physicsSystem} from '../src/core/physics.js';
import {combat} from '../src/systems/combat.js';import {asteroidSites} from '../src/systems/asteroidSites.js';
import {npcJobsRuntime} from '../src/systems/npcJobsRuntime.js';import {traffic} from '../src/systems/traffic.js';import {world} from '../src/systems/world.js';
import {CERES_WORKFLEET_CONTRACT as C,ceresWorkfleetPose as compose} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetHardwareSpec,reconcileCeresWorkfleetPresentation,ceresWorkfleetWorldPose as worldPose,
 ceresWorkfleetReceiverTransferReady} from '../src/systems/ceresWorkfleet.js';
import {captureEntityRecord,spawnSpecFromRecord} from '../src/world/worldRecords.js';import {save} from '../src/save/saveSystem.js';
import {serializeCombatState} from '../src/combat/persistence.js';
const clone=v=>JSON.parse(JSON.stringify(v));
function selected(state){const wo={name:'world',init(c){this.state=c.state;},upsertWorldRecord:world.upsertWorldRecord};const modules={flightSlot:flightV3,physics:physicsSystem,combat,asteroidSites,npcJobsRuntime,traffic,world:wo};return createSimulation({state,seed:47,systems:PRODUCTION_INIT_ORDER.filter(id=>modules[id]).map(id=>modules[id]),updateOrder:PRODUCTION_UPDATE_ORDER.filter(id=>modules[id]).map(id=>modules[id])});}
export function pose(e){return {pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},rot:e.rot,angVel:e.angVel};}
function refs(role){return role==='section'?{kind:'worldSite',siteId:C.siteId,payloadId:'long_plate',worldObjectId:C.identities.payload}:{kind:'worldRecord',recordId:C.identities[role==='breaker'?'worker':role]};}
export async function restore(wire,{playerPosition=null}={}){
 const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;state.tick=wire.tick;state.simTime=wire.simTime;state.nextEntityId=700;state.world.frameOrigin={x:-12288,z:8192};state.world.frameOriginSeq=1;state.world.records=clone(wire.records);
 const sim=selected(state),sites=sim.registry.get('asteroidSites');sites.deserialize(clone(wire.sites));sites._syncWorldSites();for(const record of Object.values(state.world.records.byId))sim.spawn(spawnSpecFromRecord(record));
 const player=sim.spawn({type:'ship',team:0,pos:playerPosition||{x:C.sitePlacement.pos.x+2000,z:C.sitePlacement.pos.z-900},radius:6,mass:100,hull:100});state.playerId=player.id;
 sim.registry.get('npcJobsRuntime').deserialize(clone(wire.jobs));const saver=Object.assign(Object.create(save),{state,bus:sim.bus,_restoreSequence:1,_runEpoch:1});saver._restoreCombat(clone(wire.combat),new Map());saver._resumeCeresAttachmentRestore();
 const physics=sim.registry.get('physics');await physics.prepareBackend(state);assert.equal(physics._sg02.captureContactImpacts,true,'reduced fixture uses production contact consequences');reconcileCeresWorkfleetPresentation({state});
 const bodies=state.entityList.filter(e=>e.alive&&Object.values(C.identities).includes(e.data?.worldRecordId));assert.equal(bodies.length,4);const b=Object.fromEntries(bodies.map(e=>[e.data.ceresWorkfleetRole||'section',e]));
 const owner=sim.registry.get('npcJobsRuntime');
 return {state,sim,sites,saver,physics,owner,b,job:()=>state.npcJobs.ceresWorkfleet,service:sim.registry.get('combat').kernel.attachments,close(){saver.destroy();sim.dispose();}};
}
export function capture(h){const records={byId:{},order:[]};for(const e of [h.b.breaker,h.b.cutterHead,h.b.cradle]){const r=captureEntityRecord(e,{sectorId:C.sectorId,tick:h.state.tick});records.byId[r.recordId]=r;records.order.push(r.recordId);}return clone({records,sites:h.sites.serialize(),jobs:h.owner.serialize(),combat:serializeCombatState(h.state),tick:h.state.tick,simTime:h.state.simTime});}



const stage=worldPose(C.route.extraction.breakerTo);
export function initialRecoveryWire({yaw=0,velocity=0,spin=0}={}){
 const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;
 const sim=createSimulation({state,seed:47,systems:[asteroidSites]}),sites=sim.registry.get('asteroidSites');sites._syncWorldSites();
 for(const [componentId,verb,amount,requestSequence]of[['long_plate_clamp','repair',24,1],['long_plate','cut',54,2],['long_plate_clamp','cut',18,3]])assert.equal(sites.applyWorldSiteBeamOperation({siteId:C.siteId,componentId,verb,amount,requestStreamId:'player-industrial-beam',requestSequence}).ok,true);
 const siteSave=sites.serialize();sim.dispose();
 // Constructed quiet displaced-state fixture. Only position comes from the historical
 // tick30000 observation; yaw/zero momentum are explicit independent test inputs.
 siteSave.worldById[C.siteId].payloads.long_plate.motion={pos:{x:-12938.895446777344,z:9488.7041015625},vel:{x:velocity,z:0},rot:yaw,angVel:spin};
 const records={byId:{},order:[]};for(const [i,role]of['breaker','cutterHead','cradle'].entries()){
  const spec=ceresWorkfleetHardwareSpec(role),p=role==='breaker'?stage:role==='cutterHead'?compose(stage,C.assets.breaker.headMountedPose):{...spec.pos,rot:spec.rot};
  Object.assign(spec,{pos:{x:p.x,z:p.z},rot:p.rot,vel:{x:0,z:0},angVel:0});const record=captureEntityRecord({id:i+1,...spec},{sectorId:C.sectorId,tick:100});records.byId[record.recordId]=record;records.order.push(record.recordId);
 }
 const job={id:'job:ceres:second_measure:long_plate',worker:C.identities.worker,head:C.identities.cutterHead,section:C.identities.payload,cradle:C.identities.cradle,phase:'extract',phaseTick:100,updatedTick:100,index:3,sequence:0,mountId:'att_000004',towId:'att_000005',receiverId:null};
 const byId={att_000004:{id:'att_000004',defId:'attachment_transport_clamp',ownerRef:refs('cutterHead'),targetRef:refs('breaker'),sourceSocketId:'SOCKET_Mount',targetSocketId:'SOCKET_Cutter_Dock',sourceAnchorLocal:{x:-8,z:0},targetAnchorLocal:{x:-46,z:30},restLength:.026060374168755757},att_000005:{id:'att_000005',defId:'tether_standard',ownerRef:refs('breaker'),targetRef:refs('section'),sourceSocketId:'SOCKET_Tether_Massline',targetSocketId:'socket_tether_anchor',sourceAnchorLocal:{x:-46,z:0},targetAnchorLocal:{x:0,z:-55},restLength:211}};
 for(const line of Object.values(byId))Object.assign(line,{state:'active',controlMode:'ceres_workfleet',createdTick:100,brokenTick:null,breakReason:null,lastTension:0,lastImpulse:0});
 return {records,sites:siteSave,jobs:{ceresWorkfleet:job},combat:{attachments:{byId}},tick:100,simTime:100/60};
}
