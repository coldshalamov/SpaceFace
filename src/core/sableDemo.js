// A disposable local bay, using the selected native flight and damage owners. No campaign
// state, entity, bus, wallet, fit or RNG is admitted to this simulation.
import { createGameState } from './gameState.js';
import { createSimulation } from './sim.js';
import { physics } from './physics.js';
import { flightV3 } from '../systems/flightV3.js';
import { combat } from '../systems/combat.js';
import { makeShipEntitySpec } from '../systems/ships.js';
import { classifyBuildIdentity } from '../systems/buildIdentity.js';
import { MODULES } from '../data/modules.js';

const MODULE_BY_ID=new Map(MODULES.map(m=>[m.id,m]));
function cancelled(signal){if(signal?.aborted){const error=new Error('Preview closed');error.name='AbortError';throw error;}}
export function sableDemoFamily(moduleId){const type=MODULE_BY_ID.get(moduleId)?.slotType;return type==='engine'||type==='thruster'?'drive':type==='shield'?'shield':null;}
export async function measureSableDemo({defId,beforeFittings,afterFittings,moduleId,player=null,signal=null,yieldControl=()=>Promise.resolve()}={}){
  const family=sableDemoFamily(moduleId);if(!family)return {ok:false,reason:'no-physical-demo',moduleId};
  const forecastPlayer=player?JSON.parse(JSON.stringify(player)):null;
  const runs=[];
  for(const [label,fittings] of [['current',beforeFittings],['proposed',afterFittings]]){
    cancelled(signal);
    const state=createGameState(811);state.mode='flight';state.ui.screenStack=[];
    const sim=createSimulation({state,seed:811,systems:[flightV3,physics,combat]});
    try{
      const spec=makeShipEntitySpec(defId,{fittings:[...(fittings||[])],player:forecastPlayer,isPlayer:true,pos:{x:0,z:0}});
      const ship=sim.spawn(spec);state.playerId=ship.id;state.ui.docked=false;
      if(!await sim.registry.get('physics').prepareBackend(state))return {ok:false,reason:'native-bay-unavailable',moduleId};
      cancelled(signal);
      const samples=[],impacts=[];let peakSpeed=0;
      for(let tick=0;tick<240;tick++){
        if(family==='drive'){state.input.moveZ=tick<90?1:0;state.input.brake=tick>=90;}
        if(family==='shield'&&tick>=30&&tick<=90&&tick%30===0){
          const before={shield:ship.shield,hull:ship.hull};
          sim.registry.get('combat').onHit({targetId:ship.id,ownerId:null,damage:30,damageType:'kinetic',pos:{x:ship.pos.x,z:ship.pos.z}});
          impacts.push({tick,shieldAbsorbed:before.shield-ship.shield,hullLost:before.hull-ship.hull});
        }
        sim.step(1/60);const speed=Math.hypot(ship.vel.x,ship.vel.z);peakSpeed=Math.max(peakSpeed,speed);
        if(tick%6===0||tick===239)samples.push({time:state.simTime,x:ship.pos.x,z:ship.pos.z,speed,shield:ship.shield,hull:ship.hull,cap:ship.cap});
        if(tick%24===23){await yieldControl();cancelled(signal);}
      }
      runs.push({label,mass:ship.mass,shieldMax:ship.shieldMax,capMax:ship.capMax,peakSpeed,stoppedSpeed:samples.at(-1).speed,
        samples,impacts,identity:classifyBuildIdentity(ship)});
    }finally{
      sim.registry.get('physics')._disableSg02DynamicAuthority?.();sim.dispose();
    }
  }
  return {ok:true,family,moduleId,duration:4,runs};
}
