/** Isolated validation scene. Uses production RAVEL, combat, attachments and Rapier;
 * only the bench ship input/spawn adapter is local. Never imported by the game. */
import { createRavel, RAVEL_GLOBAL_ANCHOR as O } from '../../src/systems/ravel.js';
import { RAVEL as C } from '../../src/data/ravel.js';
import { createBus } from '../../src/core/eventBus.js';
import { makeEntity, stampOccupantGeneration } from '../../src/core/entity.js';
import { createCombatKernel } from '../../src/combat/kernel.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, consumePhysicsCommand } from '../../src/core/physicsAuthority.js';
export function createRavelFixture(memory) {
  const events=[],bus=createBus();let nextId=0,seq=0,physics=null;
  const state={tick:0,simTime:0,mode:'flight',timeScale:1,run:{kind:'adventure'},ravel:memory,
    world:{currentSectorId:C.sectorId,frameOrigin:{...O},frameOriginSeq:1},render:{},
    entities:new Map(),entityList:[],player:{credits:333,cargo:{items:{}},tether:{}},runtime:{features:{}}};
  const helpers={sectorCookProviders:[],
    spawnEntity(spec){const e=makeEntity({...spec,id:++nextId});stampOccupantGeneration(state,e);
      state.entities.set(e.id,e);state.entityList.push(e);bus.emit('entity:spawned',{id:e.id,type:e.type,entity:e});return e;},
    removeEntity(id){const e=state.entities.get(id);if(e?.alive){e.alive=false;bus.emit('entity:destroyed',{id,type:e.type,entity:e});}},
    voice:{say(p){events.push(['comms',p]);return true;}}};
  const player=helpers.spawnEntity({type:'ship',team:0,isPlayer:true,radius:4,mass:18,hull:400,hullMax:400,
    shield:60,shieldMax:60,maxSpeed:250,pos:{x:O.x+170,z:O.z},vel:{x:0,z:0},
    physicsBody:{dynamic:true,shape:'ball',radius:4,mass:18,useMeasuredSkin:false,material:'ship',
      contact:{friction:.1,restitution:.1,angularDamping:.2}}});
  state.playerId=player.id;
  const system=createRavel();system.init({state,bus,helpers});
  const kernel=createCombatKernel({state,bus,helpers,registry:{get:()=>null}});
  for(const type of ['ravel:telegraph','ravel:cast','ravel:hit','ravel:voice','ravel:unthreaded','ravel:pacified','ravel:destroyed','audio:cue'])
    bus.on(type,p=>events.push([type,p]));
  function step(dt=1/60){
    if(state.timeScale===0)return;
    state.tick++;state.simTime+=dt;system.update(dt,state);
    kernel.prePhysics(dt);
    if(physics){physics.syncFromEntities(state.entityList);physics.step(dt);}
    else for(const e of state.entityList)consumePhysicsCommand(e); // No fake physics integration.
    kernel.postPhysics();bus.flush();
  }
  function scan(overrides={}){bus.emit('scan:pulse',{source:'player-scanner',scannerId:player.id,seq:++seq,
    pos:{x:player.pos.x,z:player.pos.z},radius:C.scanRadius,simTime:state.simTime,...overrides});}
  function damage(target,amount=45){return kernel.routeDamage({attackerId:player.id,targetId:target.id,
    packet:{channels:{kinetic:amount},flags:{},subsystemShare:0,hit:{pos:{x:target.pos.x,z:target.pos.z}}},origin:'ravel-bench:weapon'});}
  function grip(target){return kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:target.id,
    sourceWorld:{x:player.pos.x,z:player.pos.z},targetWorld:{x:target.pos.x,z:target.pos.z}});}
  function cut(){kernel.attachments.breakOwnedBy(player.id,'manual_cut');}
  function thrust(x,z,dt=1/60){const n=Math.hypot(x,z),v=player.vel,acc=75;
    queuePhysicsImpulse(player,{x:player.mass*((n?x/n*acc:0)-v.x*1.5)*dt,
      z:player.mass*((n?z/n*acc:0)-v.z*1.5)*dt},{source:'ravel-bench-input'});}
  async function enablePhysics(){physics=await createSg02DynamicBodyOwner({mode:'rapier-dynamic',fixedDt:1/60,publishTelemetry:false});
    helpers.combatPhysics=createSg02CombatPhysicsPort(physics);physics.syncFromEntities(state.entityList);return physics;}
  function destroy(){system.destroy();kernel.dispose();physics?.dispose();}
  step();return {state,player,system,helpers,kernel,bus,events,step,scan,damage,grip,cut,thrust,enablePhysics,destroy,get physics(){return physics;}};
}
