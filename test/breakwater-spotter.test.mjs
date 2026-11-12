import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {physics} from '../src/core/physics.js';
import {combat} from '../src/systems/combat.js';
import {ships,makeShipEntitySpec} from '../src/systems/ships.js';
import {createBreakwaterSpurSystem} from '../src/features/breakwaterSpur/runtime.js';
import {BREAKWATER_SITE_LOCAL,BREAKWATER_SECTOR_ID,breakwaterRecordId} from '../src/features/breakwaterSpur/definition.js';
import {sectorLocalToGlobalForSector} from '../src/data/sectorCoordinates.js';
// Staged snapshot tests, not ordinary towing or completed restoration.
async function fixture(){
 const sim=createSimulation({seed:42,systems:[ships,combat,physics,createBreakwaterSpurSystem()]});
 const s=sim.state;s.mode='flight';s.world.currentSectorId=BREAKWATER_SECTOR_ID;s.ui.docked=false;s.settings.gameplay.physicsBackend='rapier-dynamic';
 sim.registry.get('ships').newGame();
 const p=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,pos:sectorLocalToGlobalForSector(BREAKWATER_SITE_LOCAL,BREAKWATER_SECTOR_ID),fittings:[]}));s.playerId=p.id;
 await sim.registry.get('physics').prepareBackend(s);
 const owner=sim.registry.get('breakwaterSpur'),row=s.world.breakwaterSpur;row.phase='restoring';row.surveyed={socket_drive:true,socket_drum:true,console:true};
 for(let i=0;i<4;i++)sim.step(1/60);owner._sync(row);
 const e=owner.physical.cartridgeEntity(row,'drive'), cradle=owner.physical.findByRecordId(breakwaterRecordId('structure_shelf_drive'));
 return {sim,s,owner,row,e,cradle};
}
test('near-cradle spotter distinguishes skew and motion without promising contact from a stale watch without changing state',async()=>{
 const f=await fixture();const {sim,owner,row,e,cradle}=f;
 try{
 e.pos={x:cradle.pos.x,z:cradle.pos.z-25};e.rot=cradle.rot+Math.PI/2;e.vel={x:0,z:0};e.angVel=0;
 const before=JSON.stringify(row);
 assert.match(owner.physical.restorationGuidance(row,'drive'),/skewed/);
 e.rot=cradle.rot;e.vel.x=5;assert.match(owner.physical.restorationGuidance(row,'drive'),/drifting or turning/);
 e.vel.x=0;assert.match(owner.physical.restorationGuidance(row,'drive'),/Proximity alone/);
 assert.equal(JSON.stringify(row),before);
 row.seatWatch.drive={entityId:e.id,generation:e.occupantGeneration,since:.7};assert.match(owner.physical.restorationGuidance(row,'drive'),/until Seat is offered/);
 row.seatWatch.drive.since=1.5;assert.doesNotMatch(owner.physical.restorationGuidance(row,'drive'),/Choose Seat|contact.*good/);
 }finally{sim.dispose();}
});
test('spotter does not reveal distant, lost, seated or inactive originals',async()=>{
 const {sim,owner,row,e,cradle}=await fixture();try{
 assert.equal(owner.physical.restorationGuidance(row,'drive'),null);
 e.pos={x:cradle.pos.x,z:cradle.pos.z-25};e.rot=cradle.rot;e.vel={x:0,z:0};e.angVel=0;
 for(const status of ['lost','seated','unconfirmed']){row.cartridges.drive.status=status;assert.equal(owner.physical.restorationGuidance(row,'drive'),null);}
 row.cartridges.drive.status='loose';row.phase='failed';assert.equal(owner.physical.restorationGuidance(row,'drive'),null);
 }finally{sim.dispose();}
});
test('existing restoration offer carries measured guidance without granting actions or replaying radio',async()=>{
 const {sim,s,owner,row,e,cradle}=await fixture();try{
 row.surveyed={socket_drive:true,socket_drum:true,console:true};e.pos={x:cradle.pos.x,z:cradle.pos.z-25};e.rot=cradle.rot+Math.PI/2;e.vel={x:0,z:0};e.angVel=0;
 let voices=0;sim.bus.on('voice:say',()=>voices++);const before=JSON.stringify(row);
 owner._offer();assert.match(s.breakwaterSpurOffer.detail,/skewed/);assert.ok(!s.breakwaterSpurOffer.actions.some(a=>a.id==='seat:drive'));
 owner._offer();assert.equal(voices,0);assert.equal(JSON.stringify(row),before);
 }finally{sim.dispose();}
});
