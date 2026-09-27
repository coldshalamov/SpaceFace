// Moving, rotating released hulls exercise the polled production status owners.
import { MOMENTUM_SINK_STATUS_ID } from '../../src/data/combatDefs.js';
export const GAMEPLAY_STATUS_SCENARIOS=Object.freeze({
  'status-burn':3.2,'status-goo':3.2,'status-momentum-sink':3.2,'damage-venting':4,
});
export function createGameplayStatuses({state,shipMesh}) {
  let scenario='idle',base=null,oldCombat,oldHp,oldMaxHp;
  function reset(id='idle'){
    const ship=state.entities.get(state.playerId);
    if(base&&ship){Object.assign(ship.pos,base.pos);Object.assign(ship.prevPos,base.pos);
      ship.rot=base.rot;ship.prevRot=base.rot;Object.assign(ship.vel,base.vel);
      ship.hp=oldHp;ship.maxHp=oldMaxHp;state.combat=oldCombat;
      shipMesh.position.set(ship.pos.x,0,ship.pos.z);shipMesh.rotation.y=-ship.rot;}
    scenario=id;base=null;
    if(!GAMEPLAY_STATUS_SCENARIOS[id])return;
    base={pos:{...ship.pos},vel:{...ship.vel},rot:ship.rot};
    oldCombat=state.combat;oldHp=ship.hp;oldMaxHp=ship.maxHp;
    state.combat={
      entities:{
        [ship.id]:{
          statuses:{},
          subsystems:id==='damage-venting'?{
            subsystem_drive:{health:45,maxHealth:45,destroyed:false,effectiveDisabled:false},
            subsystem_weapon:{health:38,maxHealth:38,destroyed:false,effectiveDisabled:false},
          }:{},
        }
      },
      statusNextPendingSeq:1
    };
    ship.view={root:shipMesh};ship.hp=80;ship.maxHp=100;
  }
  function update(){
    if(!base)return;
    const ship=state.entities.get(state.playerId),t=state.simTime;
    state.tick=Math.round(t*60);
    Object.assign(ship.prevPos,ship.pos);ship.prevRot=ship.rot;
    ship.pos.x=base.pos.x+Math.sin(t*.85)*7;
    ship.pos.z=base.pos.z+Math.sin(t*.63)*5;
    ship.rot=base.rot+t*.25;ship.vel.x=7*.85*Math.cos(t*.85);ship.vel.z=5*.63*Math.cos(t*.63);
    shipMesh.position.set(ship.pos.x,0,ship.pos.z);shipMesh.rotation.y=-ship.rot;shipMesh.updateMatrixWorld(true);
    if(scenario==='damage-venting'){
      const subs=state.combat.entities[ship.id]?.subsystems;
      const rupturing=t>=.2&&t<2.2;
      ship.hp=rupturing?24:80;
      if(subs){
        subs.subsystem_drive.destroyed=rupturing;
        subs.subsystem_drive.effectiveDisabled=rupturing;
        subs.subsystem_drive.health=rupturing?0:45;
        subs.subsystem_weapon.effectiveDisabled=rupturing;
      }
      return;
    }
    const id=scenario==='status-burn'?'status_burning':scenario==='status-goo'?'status_goo':MOMENTUM_SINK_STATUS_ID;
    const bag=state.combat.entities[ship.id].statuses;
    if(t>=.2&&t<2.2&&!bag[id]){
      bag[id]={expiresTick:132,stacks:2,data:id===MOMENTUM_SINK_STATUS_ID?
        {frameKind:'attacker_velocity',frameReady:true,frameVelocity:{x:-12,z:0}}:{}};
      state.combat.statusNextPendingSeq++;
    }
    if(t>=2.2&&bag[id]){delete bag[id];state.combat.statusNextPendingSeq++;}
  }
  return {reset,update,inspect:()=>({scenario,sourceActive:state.simTime>=.2&&state.simTime<2.2})};
}
