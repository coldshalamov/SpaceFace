import {cargo} from '../src/systems/cargo.js';
import assert from 'node:assert/strict';
import {bootRealPath} from '../scripts/lib/bench/realPath.mjs';
import {captureAndTransfer} from '../src/systems/shipControlTransfer.js';
import {AI_CONTRACT_VERSION} from '../src/ai/contracts.js';
import {consumePhysicsCommand} from '../src/core/physicsAuthority.js';
const h=await bootRealPath({seed:4242,systems:['aiPorts','physics',cargo],hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:0,z:0}},{hullId:'ship_hornet',pos:{x:60,z:0}}]});
try{
 h.step(1);const e=h.hulls[1];h.assertBodies([e]);const ports=h.runtime.getSystem('aiPorts');
 e.data.vesselId='tail:queue:probe';e.data.shipjackGeneration=1;h.state.run={kind:'adventure'};h.state.player.ownedShips=[{defId:'ship_wasp',vesselId:'player-original',fittings:[],fittedInstances:{}}];h.state.player.activeShipIndex=0;h.hulls[0].data.vesselId='player-original';
 e.data.ai||={};e.data.ai.activity={kind:'transit',reason:'salvage_tail:freight_pod_recovery',encounterId:'tail:queue:probe'};
 const lease=ports.helpers.aiManeuver.claimActivity(e,e.data.ai.activity);assert.ok(lease);
 let releases=0;ports.helpers.captureEncounterFreightControl=target=>target===e?()=>{assert.equal(ports.helpers.aiManeuver.cancelActivity(lease),true);e.data.ai.activity=null;releases++;}:null;
 h.bus.on('ship:controlChanging',()=>assert.equal(e.data.ai.activity,null));
 const request={version:AI_CONTRACT_VERSION,entityId:e.id,tick:h.state.tick,kind:'transit',forceLocal:{forward:1,right:0},torqueYaw:0,reason:'salvage_tail:freight_pod_recovery'};
 const accepted=h.withFeatures(()=>ports.helpers.aiManeuver.request(request));assert.equal(accepted,true);

 const owner={state:h.state,bus:h.bus,helpers:ports.helpers,validateTransferFittings:()=>true,nextInstanceId:()=>'tail:queue:instance',getTransferCargoCapacity:()=>100,recomputeEntity(){},publishActiveRoleContext(){}};
 const captured=captureAndTransfer(owner,{targetId:e.id,targetGeneration:1,vesselId:e.data.vesselId,operationId:'tail:queue:capture'});assert.equal(captured.ok,true,JSON.stringify(captured));assert.equal(releases,1);
 h.withFeatures(()=>ports.update(1/60,h.state));
 const command=consumePhysicsCommand(e);
 assert.equal(Math.hypot(command?.control?.force?.x||0,command?.control?.force?.z||0),0,'queued pre-capture NPC maneuver must not thrust newly owned hull');
}finally{h.dispose();}
