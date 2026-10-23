import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { ships, makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { shipjack } from '../src/systems/shipjack.js';
import { rockCore } from '../src/systems/rockCore.js';
import { surrenderRecovery, hasRecoveryTowConsent } from '../src/systems/surrenderRecovery.js';

const DT=1/60;
async function boot(t){
  const native=await createSg02DynamicBodyOwner({fixedDt:DT});
  const sim=createSimulation({seed:4242,systems:[ships,cargo,combat,tetherGameplay,shipjack,rockCore,surrenderRecovery],
    helpers:{combatPhysics:createSg02CombatPhysicsPort(native)},updateOrder:[]});
  t.after(()=>{native.dispose();sim.dispose();});
  const state=sim.state,get=name=>sim.registry.get(name);state.mode='flight';state.world.currentSectorId='sector_helios_prime';
  get('ships').newGame();
  const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:state.player,fittings:state.player.ownedShips[0].fittings}));state.playerId=player.id;
  const target=sim.spawn(makeShipEntitySpec('ship_mule',{team:2,pos:{x:80,z:0},fittings:fittingsFromDefaultModules('ship_mule',['mod_engine_ion_m','mod_cargo_pod_m','mod_cargo_scanner_s'])}));
  target.data.shipjackUncrewed=true;target.data.ai=null;target.shield=0;target.shieldRegenRate=0;
  native.syncFromEntities(state.entityList);get('combat').kernel.prePhysics(DT);
  state.player.targetId=target.id;state.input.aimWorld={x:80,z:0};state.input.aimAngle=0;
  const denials=[];sim.bus.on('tether:latchDenied',row=>denials.push(row));
  const jack=get('shipjack'),kernel=get('combat').kernel;
  const tick=()=>{state.tick++;state.simTime=state.tick*DT;};
  const press=()=>{
    // Let the production standing instrument's bounded refresh dwell publish the new state.
    for(let i=0;i<20;i++){tick();get('tetherGameplay').update(DT,state);}
    tick();state.input.actions={tetherFire:true,tetherCut:false,reelDelta:0};get('tetherGameplay').update(DT,state);state.input.actions.tetherFire=false;
    tick();get('tetherGameplay').update(DT,state);
  };
  const identify=()=>jack.command({action:'scan',targetId:target.id});
  const hail=()=>jack.command({action:'hail',targetId:target.id,generation:target.data.shipjackGeneration});
  const disable=()=>{assert.equal(sim.helpers.disableShipjackSubsystem({entityId:target.id,subsystemId:'subsystem_drive'}).ok,true);tick();kernel.prePhysics(DT);get('tetherGameplay').update(DT,state);};
  get('rockCore').update(DT,state);assert.equal(state.rockCore.tier,0);
  return {sim,state,get,native,player,target,jack,kernel,denials,press,identify,hail,disable,tick};
}

test('starter tier-zero line physically latches consenting drive-disabled Empty Seat through actual combat, hail and native attachment owners',async t=>{
  const h=await boot(t);assert.equal(h.identify().ok,true);
  h.press();assert.match(h.denials.at(-1).reason,/line tier 1 required/);assert.equal(h.native.attachments.size,0);
  assert.equal(h.hail().ok,true,'evacuated crew terms are explicit consent, not ownership');
  h.press();assert.equal(h.native.attachments.size,0,'consent cannot make powered machinery a tier-zero load');
  h.disable();
  const drive=h.state.combat.entities[h.target.id].subsystems.subsystem_drive;
  assert.equal(drive.destroyed,true);assert.equal(h.target.alive,true);
  assert.deepEqual(h.target.data.weapons,[],'unarmed civilian has no live hardpoints despite generic weapon subsystem');
  const before=JSON.stringify(h.state.rockCore);h.press();
  assert.equal(h.state.player.tether.active,true,JSON.stringify({denials:h.denials,preview:h.state.masslineAcquisition}));
  const line=h.kernel.attachments.get(h.state.player.tether.attachmentId);
  assert.equal(line.targetId,h.target.id);assert.equal(line.targetGeneration,h.target.occupantGeneration);
  assert.equal(h.native.attachments.size,1,'a genuine native Massline exists');
  assert.equal(JSON.stringify(h.state.rockCore),before,'eligibility did not grant or mutate Line progress');
  assert.equal(h.target.radius,18);assert.ok(h.target.mass>=55,'the real hauler geometry/mass remain');
});

test('stale-generation consent, armed/automated defenders and obstruction remain denied at starter tier',async t=>{
  for(const kind of ['generation','armed','automated','blocked']){
    const h=await boot(t);h.identify();h.disable();h.hail();
    if(kind==='generation')h.state.player.shipjack.custodyAttempts[h.target.data.vesselId].generation='obsolete';
    if(kind==='armed')h.target.data.weapons=[{defId:'wpn_pulse_laser_s'}];
    if(kind==='automated')h.state.player.shipjack.vesselsById[h.target.data.vesselId].crew='automated';
    if(kind==='blocked')h.sim.helpers.isMasslineObstructed=()=>true;
    h.press();assert.equal(h.native.attachments.size,0,kind);assert.equal(h.state.rockCore.tier,0,kind);
    assert.match(h.denials.at(-1).reason,kind==='blocked'?/blocked/:/line tier 1 required/,kind);
  }
});

test('canonical surrendered recovery consent is bound to the live body and cannot survive numeric-id recycling',async t=>{
  const h=await boot(t);h.target.data.shipjackUncrewed=false;h.target.data.ai={fsm:'surrender',passive:true};
  h.disable();h.sim.bus.emit('combat:surrendered',{entityId:h.target.id});
  assert.equal(hasRecoveryTowConsent(h.state,h.target),true);
  h.press();assert.equal(h.native.attachments.size,1);
  const annotation=h.target.data.surrenderRecovery;
  const recycled={...h.target,occupantGeneration:h.target.occupantGeneration+1,data:{...h.target.data,surrenderRecovery:{...annotation}}};
  h.state.entities.set(h.target.id,recycled);
  assert.equal(hasRecoveryTowConsent(h.state,recycled),false,'copied annotation lacks canonical recovery instance identity');
});

test('Ctrl-nearest enforces ordinary tier limits and permits only the same consenting disabled recovery load',async t=>{
  const h=await boot(t);h.state.input.tetherMode='nearest';
  h.press();assert.match(h.denials.at(-1).reason,/line tier 1 required/);assert.equal(h.native.attachments.size,0);
  h.identify();h.hail();h.disable();h.press();
  assert.equal(h.native.attachments.size,1);assert.equal(h.state.player.tether.targetId,h.target.id);
  assert.equal(h.state.rockCore.tier,0);
});

test('ordinary boulders retain their tier gate and temporary modes cannot use recovery consent',async t=>{
  const h=await boot(t);h.sim.helpers.removeEntity(h.target.id);
  const rock=h.sim.spawn({type:'asteroid',pos:{x:80,z:0},radius:18,mass:100,hull:100,hullMax:100,data:{}});
  h.native.syncFromEntities(h.state.entityList);h.state.player.targetId=rock.id;h.state.input.tetherMode='nearest';
  h.press();assert.match(h.denials.at(-1).reason,/line tier 1 required/);assert.equal(h.native.attachments.size,0);
  const other=await boot(t);other.identify();other.disable();other.hail();other.state.run={kind:'crucible'};
  other.press();assert.equal(other.native.attachments.size,0);assert.equal(other.state.rockCore.tier,0);
});

test('existing scripted powered teaching catch remains available at tier zero in scored and nearest input',async t=>{
  for(const mode of [null,'nearest']){
    const h=await boot(t);h.target.data.onboarding=true;h.state.input.tetherMode=mode;
    assert.equal(h.state.combat.entities[h.target.id].subsystems.subsystem_drive.destroyed,false);
    h.press();assert.equal(h.native.attachments.size,1,String(mode));
    assert.equal(h.state.player.tether.targetId,h.target.id);assert.equal(h.state.rockCore.tier,0);
    assert.equal(h.state.player.shipjack,undefined,'teaching exception needs no fabricated capture consent');
  }
});
