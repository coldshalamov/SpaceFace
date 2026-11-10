// Read-only policy helpers. Call from the existing tactical owner; only that owner writes intent.
import { ironKrakenProfileFor } from '../data/ironKraken.js';
import { resolveFlightProfile } from '../core/flightDynamics.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export const capitalOrderKey = id => `${typeof id}:${String(id)}`;
export function capitalBossOrder(state,entityId) {
  return state?.capitalBossEncounters?.orders?.[capitalOrderKey(entityId)] || null;
}
export function capitalScoreControls(state,entityId) {
  return capitalBossOrder(state,entityId)?.scoreOwnsAttacks === true;
}
export function shapeCapitalBossManeuverRequest(request,state) {
  if(!request) return request;
  const order=capitalBossOrder(state,request.entityId);
  if(!order?.scoreOwnsAttacks) return request; // Wings retain the real squad commander.
  const result={...request,brake:order.brake===true,
    forceLocal:{...(request.forceLocal||{}),forward:order.forward||0,right:0}};
  if(Number.isFinite(order.heading)) result.targetHeading=order.heading;
  const actor=state?.entities?.get(request.entityId);
  if(ironKrakenProfileFor(actor)) {
    // targetHeading is diagnostic at the native maneuver port: actual physics consumes
    // torqueYaw. Reusing the stock broadside torque made the body turn off its locked attack
    // while the renderer alone appeared to face the target. Author the real bounded servo.
    const flight=resolveFlightProfile(actor,state);
    const angularAccel=Math.max(.01,flight.angularAccel),yaw=Number(actor.angVel)||0;
    const error=Number.isFinite(order.heading)?wrap(order.heading-(Number(actor.rot)||0)):0;
    const desiredYaw=Math.sign(error)*Math.min(flight.maxYawRate,
      Math.sqrt(2*Math.max(.01,flight.angularBrake)*Math.abs(error)),Math.abs(error)*3);
    result.torqueYaw=clamp((desiredYaw-yaw)/(.22*angularAccel),-1,1);
    result.boost=false;
    const velocity=order.velocity;
    if(velocity&&Number.isFinite(velocity.x)&&Number.isFinite(velocity.z)&&!result.brake) {
      const c=Math.cos(actor.rot||0),s=Math.sin(actor.rot||0);
      const ex=velocity.x-(Number(actor.vel?.x)||0),ez=velocity.z-(Number(actor.vel?.z)||0);
      const forward=(ex*c+ez*s)*2.5,right=(-ex*s+ez*c)*2.5;
      result.forceLocal.forward=clamp(forward/Math.max(.01,forward>=0?flight.mainAccel:flight.reverseAccel),-1,1);
      // The canonical maneuver port applies its documented 0.75 strafe scale.
      result.forceLocal.right=clamp(right/Math.max(.01,flight.strafeAccel*.75),-1,1);
    }
  }
  // Preserve non-enumerable normalization markers used by the thrust owner.
  for(const name of Object.getOwnPropertyNames(request)) {
    if(!Object.prototype.propertyIsEnumerable.call(request,name))
      Object.defineProperty(result,name,Object.getOwnPropertyDescriptor(request,name));
  }
  return result;
}
export function applyCapitalBossFireGate(state,entities,clearIntent) {
  if(typeof clearIntent!=='function') throw new TypeError('Use the tactical owner clearAIFiringIntent');
  for(const e of entities||[]) {
    if(capitalBossOrder(state,e.id)?.suppressStockFire && e.data?.intent)
      clearIntent(e.data.intent,'capital_score');
  }
}
const OFFENSIVE_ACTIONS=new Set(['action_burst','action_attach','action_reel','action_sling']);
/** Wrap both predictive admission AND actual submission; blocking list() alone leaks queued starts. */
export function guardCapitalBossActionPort(port,stateProvider) {
  if(!port || typeof port.canStart!=='function'||typeof port.start!=='function') throw new TypeError('SG-03 action port required');
  const denied=(id,actionId)=>{
    const order=capitalBossOrder(stateProvider(),id);
    return !!order && (order.scoreOwnsAttacks || (order.suppressStockFire&&OFFENSIVE_ACTIONS.has(actionId)));
  };
  return Object.freeze({...port,
    canStart(id,actionId,request) {return denied(id,actionId)?{ok:false,reason:'capital_score_gate'}:port.canStart(id,actionId,request);},
    start(id,actionId,request) {return denied(id,actionId)?null:port.start(id,actionId,request);},
  });
}
