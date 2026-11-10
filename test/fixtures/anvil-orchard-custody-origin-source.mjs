import assert from 'node:assert/strict';
import {createSimulation} from '../../src/core/sim.js';
import {physics} from '../../src/core/physics.js';
import {save} from '../../src/save/saveSystem.js';
import {asteroidSites} from '../../src/systems/asteroidSites.js';
import {environmentalMachinery} from '../../src/systems/environmentalMachinery.js';
import {createOrchardMotorState} from '../../src/core/anvilOrchardNative.js';
import {ORCHARD_GEOMETRY as G,orchardFrameBodySpec} from '../../src/data/anvilOrchardBody.js';
import {ANVIL_ORCHARD,createOrchardRecord,normalizeOrchardRecord} from '../../src/data/anvilOrchard.js';
export async function setup(){
 const sim=createSimulation({systems:[asteroidSites,physics,environmentalMachinery,save]});sim.state.mode='flight';sim.state.world.currentSectorId=ANVIL_ORCHARD.sectorId;
 const worker=sim.spawn({type:'ship',pos:{x:14000,z:9000},radius:6,hull:100,data:{defId:'ship_kestrel',fittings:[],anvilSlingWitness:true,itinerary:{kind:'anvil_work',role:'collector',phase:'collect'}}});sim.state.playerId=worker.id;
 const frame=sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:.713,radius:G.radius,hull:300,flags:{persistent:true},physicsBody:orchardFrameBodySpec(),data:{orchardId:ANVIL_ORCHARD.id,orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}});
 const facade=sim.registry.get('physics');assert.equal(await facade.prepareBackend(sim.state),true);sim.state.sites.anvilOrchard=createOrchardRecord(0);
 const machine=sim.registry.get('environmentalMachinery');return{sim,facade,machine,worker,frame,owner:facade._sg02,accept(qty=4,socket=1){return machine.acceptOrchardNewPod(worker,{frame,socket,qty,commodityId:ANVIL_ORCHARD.commodityId});},close(){sim.dispose();}};
}
