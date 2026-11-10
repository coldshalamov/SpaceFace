import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {physics} from '../src/core/physics.js';
import {ships,makeShipEntitySpec} from '../src/systems/ships.js';
import {cargo} from '../src/systems/cargo.js';
import {economy} from '../src/systems/economy.js';
import {stationServices} from '../src/systems/stationServices.js';
import {npcJobsRuntime} from '../src/systems/npcJobsRuntime.js';
import {traffic} from '../src/systems/traffic.js';
import {flightV3} from '../src/systems/flightV3.js';
import {combat} from '../src/systems/combat.js';
import {tetherGameplay} from '../src/systems/tetherGameplay.js';
import {world} from '../src/systems/world.js';
import {save} from '../src/save/saveSystem.js';
import {createBreakwaterSpurSystem} from '../src/features/breakwaterSpur/runtime.js';
import {BREAKWATER_SUPPLY_LOAD,BREAKWATER_SECTOR_ID,breakwaterRecordId} from '../src/features/breakwaterSpur/definition.js';
import {sectorLocalToGlobalForSector} from '../src/data/sectorCoordinates.js';

// Starting charter and player placement are fixture admission, not earned campaign progress.
// After spawn all movement is from flight input, tether and native physics.
test('the original reserve load travels from its authored pocket to real shelf custody', {timeout:60000}, async()=>{
 const sim=createSimulation({seed:42,systems:[ships,world,cargo,economy,stationServices,npcJobsRuntime,traffic,flightV3,combat,tetherGameplay,physics,createBreakwaterSpurSystem(),save]});
 try {
  const s=sim.state;s.mode='flight';s.world.currentSectorId=BREAKWATER_SECTOR_ID;s.settings.gameplay.physicsBackend='rapier-dynamic';s.ui.docked=false;
  sim.registry.get('ships').newGame();s.player.credits=1000;
  sim.registry.get('world').enterSector(BREAKWATER_SECTOR_ID);
  const pocket=sectorLocalToGlobalForSector(BREAKWATER_SUPPLY_LOAD.pocketLocal,BREAKWATER_SECTOR_ID);
  let player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,pos:{x:pocket.x-6,z:pocket.z+20},fittings:[]}));s.playerId=player.id;
  const native=sim.registry.get('physics'),owner=sim.registry.get('breakwaterSpur');await native.prepareBackend(s);
  let row=s.world.breakwaterSpur;row.phase='operating';row.charter='cooperative';row.commission.status='paid';
  for(let i=0;i<4;i++)sim.step(1/60);
  const admission=owner.freight.stageSupplyLoad(row);assert.equal(admission.ok,true,admission.reason);
  let load=admission.entity;assert.equal(load.mass,18);assert.equal(load.physicsBody.mass,18);
  for(let i=0;i<5;i++)sim.step(1/60);
  const attach=sim.registry.get('combat').kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:load.id});assert.equal(attach.ok,true,JSON.stringify({reason:attach.reason,playerPos:player.pos,loadPos:load.pos,playerLive:s.entities.get(player.id)===player,loadLive:s.entities.get(load.id)===load,playerNative:!!native._sg02.records.get(player.id),loadNative:!!native._sg02.records.get(load.id),playerFailure:player.physicsNativeFailure,loadFailure:load.physicsNativeFailure}));
  let shelf=owner.physical.findByRecordId(breakwaterRecordId('structure_shelf_drive'));
  const goal={x:shelf.pos.x+6,z:shelf.pos.z-15}, startLoad={x:load.pos.x,z:load.pos.z};
  for(let i=0;i<9000;i++){
    const dx=goal.x-player.pos.x,dz=goal.z-player.pos.z,d=Math.hypot(dx,dz),ang=Math.atan2(dz,dx);
    let err=(ang-player.rot+Math.PI)%(2*Math.PI);if(err<0)err+=2*Math.PI;err-=Math.PI;
    s.input.turnIntent=Math.max(-1,Math.min(1,err*2-player.angVel*.7));
    const speed=Math.hypot(player.vel.x,player.vel.z);
    s.input.moveZ=Math.abs(err)<.4&&d>12&&speed<7?.22:0;s.input.moveX=0;
    s.input.brake=d<18||speed>8;sim.step(1/60);
    if(i===600){
      const recordId=row.looseLoad.worldRecordId, savedPos={x:load.pos.x,z:load.pos.z};
      assert.ok(Math.hypot(savedPos.x-startLoad.x,savedPos.z-startLoad.z)>10,'the real tether moved the original before Save');
      const envelope=JSON.parse(JSON.stringify(sim.registry.get('save').serialize('supply-under-tow')));
      assert.equal(sim.registry.get('save').loadEnvelope(envelope,'supply-under-tow'),true);
      row=s.world.breakwaterSpur;player=s.entities.get(s.playerId);
      load=owner.physical.findByRecordId(recordId);shelf=owner.physical.findByRecordId(breakwaterRecordId('structure_shelf_drive'));
      assert.ok(load&&player&&shelf);assert.ok(Math.hypot(load.pos.x-savedPos.x,load.pos.z-savedPos.z)<2);
      assert.equal(s.entityList.filter(e=>e.alive && e.data?.worldRecordId===recordId).length,1,'Continue retains the sole original');
    }
    if(Math.hypot(load.pos.x-shelf.pos.x,load.pos.z-shelf.pos.z)<35&&Math.hypot(load.vel.x,load.vel.z)<4)break;
  }
  const before=s.player.credits, stock=row.coop.stock.repair, recordId=row.looseLoad.worldRecordId;
  let delivered=owner.freight.tryDeliverSupply(row);if(!delivered.ok){sim.step(1/60);delivered=owner.freight.tryDeliverSupply(row);}
  assert.equal(delivered.ok,true,JSON.stringify({reason:delivered.reason,player:player.pos,load:load.pos,velocity:load.vel,shelf:shelf.pos}));
  assert.equal(s.player.credits,before+160);assert.equal(row.coop.jobs.supply.status,'done');
  const receipt=sim.registry.get('cargo').getBreakwaterFreightReceipt('supply');assert.equal(receipt.worldRecordId,recordId);
  const newStock=row.coop.stock.repair;assert.ok(newStock>stock);
  const paid=JSON.parse(JSON.stringify(sim.registry.get('save').serialize('supply-paid')));
  assert.equal(sim.registry.get('save').loadEnvelope(paid,'supply-paid'),true);
  row=s.world.breakwaterSpur;assert.equal(row.coop.jobs.supply.status,'done');assert.equal(row.coop.stock.repair,newStock);
  assert.equal(s.player.credits,before+160);assert.equal(owner.freight.tryDeliverSupply(row).ok,false);
 } finally {sim.dispose();}
});
