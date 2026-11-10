import { BOMB_DEFS } from '../../src/data/bombs.js';

export const GAMEPLAY_BOMB_PAYLOADS=Object.freeze({
  radial:'bomb_frag',singularity:'bomb_singularity',goo:'bomb_goo',
  'bomb-concussion':'bomb_concussion','bomb-emp':'bomb_emp',
  'bomb-thermite':'bomb_thermite','bomb-scrambler':'bomb_scrambler',
  'bomb-anchor':'bomb_anchor','bomb-shot-down':'bomb_frag',
});
export const GAMEPLAY_BOMB_SCENARIOS=Object.freeze(Object.fromEntries(
  Object.entries(GAMEPLAY_BOMB_PAYLOADS).map(([name,id])=>
    [name,.82+(BOMB_DEFS[id]?.field?.durationS||0)+1.8])));

// Deterministic bomb inputs drive both native persistent presentation and the actual
// transient event subscribers. The last capture frame includes the empty aftermath.
export function createGameplayBombs({state,bomb,owner,start,target}) {
  let scenario='idle',detonated=false,ended=false,events=[];
  const emit=(name,payload)=>{owner.fireEvent(name,payload);events.push({name,at:state.simTime,payload});};
  function reset(id){scenario=id;detonated=ended=false;events=[];bomb.alive=false;}
  function update(){
    const payloadId=GAMEPLAY_BOMB_PAYLOADS[scenario];
    if(!payloadId)return false;
    const t=state.simTime,def=BOMB_DEFS[payloadId],resolve=scenario==='bomb-shot-down'?.56:.82;
    const fieldEnd=resolve+(def.field?.durationS||0),travel=Math.min(1,t/.82);
    bomb.prevPos={...bomb.pos};bomb.pos.x=start.x+(target.x-start.x)*travel;
    bomb.pos.z=start.z+(target.z-start.z)*travel;
    bomb.alive=t<resolve||!!def.field&&t<fieldEnd;
    Object.assign(bomb.data,{bombId:payloadId,ownerId:state.playerId,warningAt:.44,
      resolveAt:resolve,fieldStartedAt:resolve,fieldEndsAt:fieldEnd,
      phase:t<.44?'drift':t<resolve?'warning':bomb.alive?'field':'spent'});
    const receipt=()=>({schemaVersion:2,bombId:bomb.id,payloadId,ownerId:state.playerId,
      pos:{...bomb.pos},vel:{...bomb.vel},radius:def.radius,trigger:'proximity',
      hits:[2],shoves:[{id:2,dx:1,dz:.12,mag:def.impulse||0}]});
    if(t>=resolve&&!detonated){
      detonated=true;
      if(scenario==='bomb-shot-down')emit('bombs:destroyed',{
        bombId:bomb.id,payloadId,ownerId:state.playerId,shotBy:2,pos:{...bomb.pos},reason:'shot_down',trigger:'shot_down'});
      else emit('bombs:detonated',receipt());
    }
    if(def.field&&t>=fieldEnd&&!ended){
      ended=true;
      if(def.field.kind==='singularity')emit('bombs:detonated',{...receipt(),trigger:'collapse'});
      emit('bombs:fieldEnded',{schemaVersion:2,bombId:bomb.id,payloadId,ownerId:state.playerId,
        pos:{...bomb.pos},trigger:def.field.kind==='singularity'?'collapse':'expired'});
    }
    return true;
  }
  return {reset,update,inspect:()=>({scenario,events})};
}
