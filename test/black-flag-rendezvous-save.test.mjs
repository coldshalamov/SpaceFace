import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { cargo } from '../src/systems/cargo.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { fnv1a } from '../src/save/checksum.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

function boot(t){
  const sim=createSimulation({seed:4242,systems:[ships,cargo,flightV3,save],updateOrder:[]});
  t.after(()=>sim.dispose());const state=sim.state,get=name=>sim.registry.get(name);
  state.mode='flight';state.world.currentSectorId='sector_helios_prime';state.meta.createdAt='rendezvous-save-4242';
  get('ships').newGame();
  const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:state.player,fittings:state.player.ownedShips[0].fittings}));state.playerId=player.id;
  const target=sim.spawn(makeShipEntitySpec('ship_mule',{pos:{x:1473,z:-258},fittings:[]}));
  const navigation=Object.create(world);navigation.state=state;navigation.bus=sim.bus;
  const messages=[];sim.bus.on('toast',row=>messages.push(row.text));
  const roundTrip=()=>{const env=JSON.parse(JSON.stringify(get('save').serialize('rendezvous')));assert.equal(get('save').loadEnvelope(env,'rendezvous'),true);return env;};
  return {sim,state,get,player,target,navigation,messages,roundTrip};
}

test('actual moving rendezvous save/load disengages instead of becoming a boosted fixed-point course',t=>{
  const h=boot(t);
  h.navigation._onSetCourse({pos:{x:1473,z:-258},targetEntityId:h.target.id,label:'Empty Seat',rendezvous:true});
  assert.equal(h.state.nav.autopilot.active,true);assert.equal(h.state.nav.autopilot.rendezvous,true);
  const env=JSON.parse(JSON.stringify(h.get('save').serialize('moving-recovery')));
  assert.equal(h.state.nav.autopilot.active,true,'capturing a save does not seize the live helm');
  assert.equal(env.data.nav.autopilot.active,false);
  assert.equal(env.data.nav.autopilot.rendezvous,true);
  assert.equal(env.data.nav.autopilot.target,null);assert.equal(env.data.nav.waypoint,null);
  assert.equal(h.get('save').loadEnvelope(env,'moving-recovery'),true);
  assert.equal(h.state.nav.autopilot.active,false);assert.equal(h.state.nav.autopilot.status,'rendezvous-replot');
  assert.equal(h.state.nav.autopilot.targetEntityId,null);assert.equal(h.state.nav.autoTravel,false);
  assert.equal(h.state.nav.waypoint,null,'stale numeric-body position is not shown as a live recovery marker');
  assert.ok(h.messages.some(text=>/Replot the recovery course/.test(text)));
  h.state.mode='flight';const restored=h.state.entities.get(h.state.playerId);
  h.get('flight')._stepCraft(restored,h.state.input,1/60,h.state,true);
  const command=consumePhysicsCommand(restored);
  assert.equal(command.control.force.x,0);assert.equal(command.control.force.z,0);
  assert.equal(restored.flags.boosting,false,'the production controller does not resume the old burn');
});

test('legacy already-sanitized rendezvous status cannot reactivate a stale fix after checksum-valid restore',t=>{
  const h=boot(t),env=JSON.parse(JSON.stringify(h.get('save').serialize('legacy-moving')));
  env.data.nav={route:{legs:[{from:'sector_helios_prime',to:'sector_ceres_belt'}]},autoTravel:true,
    waypoint:{kind:'local',label:'Empty Seat',pos:{x:1473,z:-258}},
    autopilot:{active:true,status:'rendezvous-holding',targetEntityId:null,target:{x:1473,z:-258},label:'Empty Seat',arrivalRadius:36}};
  env.checksum=fnv1a(JSON.stringify(env.data));
  assert.equal(h.get('save').loadEnvelope(env,'legacy-moving'),true);
  assert.equal(h.state.nav.autopilot.active,false);assert.equal(h.state.nav.autopilot.target,null);
  assert.equal(h.state.nav.route,null);assert.equal(h.state.nav.autoTravel,false);assert.equal(h.state.nav.waypoint,null);
});

test('ordinary static and durable-body navigation keep their existing save/restore semantics',t=>{
  for(const durable of [false,true]){
    const h=boot(t);
    if(durable){h.target.data.worldRecordId='traffic:durable-courier';h.target.flags.persistent=true;}
    h.navigation._onSetCourse({pos:{x:1473,z:-258},targetEntityId:durable?h.target.id:null,label:durable?'Working courier':'Station fix'});
    h.state.nav.route={legs:[{from:'sector_helios_prime',to:'sector_ceres_belt'}]};h.state.nav.autoTravel=true;
    const env=h.roundTrip();
    assert.equal(h.state.nav.autopilot.active,true);assert.deepEqual(h.state.nav.autopilot.target,{x:1473,z:-258});
    assert.equal(h.state.nav.autopilot.rendezvous,undefined);assert.equal(h.state.nav.autoTravel,true);
    assert.deepEqual(h.state.nav.route,env.data.nav.route);assert.deepEqual(h.state.nav.waypoint.pos,{x:1473,z:-258});
    if(durable){
      assert.equal(h.state.nav.autopilot.targetWorldRecordId,'traffic:durable-courier');
      assert.equal(h.state.nav.autopilot.stable.key,'record:traffic:durable-courier');
      assert.equal(h.state.nav.waypoint.stable.durable,true);
    }
    assert.equal(h.messages.some(text=>/Replot the recovery course/.test(text)),false);
  }
});
