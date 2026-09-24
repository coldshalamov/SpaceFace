// Read-only policy helpers. Call from the existing tactical owner; only that owner writes intent.
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
    forceLocal:{...(request.forceLocal||{}),forward:order.forward||0,strafe:0}};
  if(Number.isFinite(order.heading)) result.targetHeading=order.heading;
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
