import { successfulPickupAmount } from '../../core/pickupAcceptance.js';
import { WORLD_CUE_ACTION_RECIPE, resolveWorldCueReceipt } from './worldCueRecipes.js';
// Extra responses consume confirmed simulation receipts. Resolving a receipt here is
// cosmetic only: never discover collisions, change a body, or fabricate a successful action.
export const ADDITIONAL_ACTION_VFX_RECIPES = Object.freeze({
  'presentation:cue': WORLD_CUE_ACTION_RECIPE,
  'salvage:cutComplete': {verb:'grind',primitive:'deposition',color:0xf3c286,life:.85,surfaceWork:true,continuous:false},
  'salvage:completed': {verb:'harvest',primitive:'deposition',color:0xc9ba98,life:1.2,continuous:false},
  'pickup:collected': {verb:'transfer',primitive:'connection',color:0xb4e0c0,life:.58,continuous:false},
  'countermeasure:deployed': { verb:'fling', primitive:'pressure', color:0xdde7bb, life:1.15,
    variants:{
      chaff:{verb:'fling',primitive:'pressure',color:0xdde7bb,life:1.15},
      ecm:{verb:'disrupt',primitive:'induction',color:0xa791ff,life:.85},
      decoy:{verb:'vent',primitive:'compression',color:0xffb977,life:1.4},
    } },
  'charge:stuck': {verb:'catch',primitive:'capture',color:0xf1d394,life:.55},
  'charge:armed': {verb:'arm',primitive:'capture',color:0xffa557,life:.75},
  'massline:snareCaught': {verb:'latch',primitive:'connection',color:0x76efd1,life:.8},
  'tether:reelPump': {verb:'transfer',primitive:'connection',color:0x72cfff,life:.55},
  'tether:snapCatch': {verb:'catch',primitive:'capture',color:0x9effd3,life:.8},
  'weapons:inertialShunt': {verb:'shove',primitive:'pressure',color:0xc4d8ff,life:.8},
  'cargo:volatileCorrosive': {verb:'grind',primitive:'deposition',color:0xbdde6d,life:1.1},
  'cargo:volatileCryo': {verb:'cool',primitive:'deposition',color:0x8fe1fa,life:1.3},
  'cloak:engaged': {verb:'disrupt',primitive:'induction',color:0x7996bd,life:.85},
  'cloak:dropped': {verb:'cut',primitive:'connection',color:0xaac8ef,life:.65},
  'optic:contact': {verb:'disrupt',primitive:'induction',color:0xbbdbff,life:.5},
  'optic:rekindled': {verb:'harvest',primitive:'deposition',color:0xecf4ff,life:1},
  'beacon:deployed': {verb:'command',primitive:'induction',color:0x80ead8,life:1.1},
});

const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const body = (state,id) => state.entities?.get?.(id);
const copyPoint = p => ({x:p.x,z:p.z});

export function resolveAdditionalActionVfxReceipt(name,p,state) {
  if(name==='presentation:cue')return resolveWorldCueReceipt(p,state);
  if(name==='salvage:cutComplete'){
    const plate=body(state,p.payloadId),target=body(state,p.targetId);
    return {...p,sourceId:state.playerId,pos:plate?.pos??target?.pos,bodySurface:true,attachToTarget:true};
  }
  if(name==='salvage:completed')return {...p,targetId:p.wreckId,sourceId:state.playerId};
  if(name==='pickup:collected'){
    if(!(successfulPickupAmount(p)>0)||!point(p.pos))return null;
    const collector=body(state,p.collectorId??state.playerId);
    if(!point(collector?.pos))return null;
    const a=Math.atan2(p.pos.z-collector.pos.z,p.pos.x-collector.pos.x),r=collector.radius||6;
    return {...p,targetId:collector.id,sourceId:p.pickupId,sourcePos:copyPoint(p.pos),
      pos:{x:collector.pos.x+Math.cos(a)*r,z:collector.pos.z+Math.sin(a)*r,y:1.5},attachToTarget:true};
  }
  if (name === 'countermeasure:deployed') {
    const ship=body(state,p.shipId), effect=ship?.data?.cm?.effect;
    if (!ship || !effect || !Number.isFinite(effect.originX) || !Number.isFinite(effect.originZ)) return null;
    // Chaff/decoy originate at the actual seeker-diversion point behind the hull.
    // ECM instead follows its real transmitting hull. Receipt x/z is only hull centre.
    return {...p,targetId:ship.id,sourceId:ship.id,
      pos:{x:effect.originX,z:effect.originZ},attachToTarget:p.kind==='ecm',
      direction:{x:-Math.cos(ship.rot||0),z:-Math.sin(ship.rot||0)}};
  }
  if (name==='charge:stuck' || name==='charge:armed') {
    const charge=body(state,p.chargeId);
    return {...p,targetId:p.hostId??p.chargeId,sourceId:charge?.data?.ownerId,
      attachToTarget:true};
  }
  if (name==='massline:snareCaught') return {...p,sourceId:p.anchorId,attachToTarget:true};
  // These are player-only telemetry/tool publishers, unlike generic combat receipts.
  if (name==='tether:reelPump' || name==='tether:snapCatch') return {...p,sourceId:state.playerId};
  if (name==='cloak:engaged' || name==='cloak:dropped') return {...p,targetId:state.playerId};
  if (name==='weapons:inertialShunt') {
    const a=body(state,p.shunterId), b=body(state,p.targetId);
    if (!point(a?.pos) || !point(b?.pos)) return null;
    // The receipt has no manifold point. A directed body response is honest; an
    // invented exact contact or an outgoing projectile would not be.
    return {...p,sourceId:p.shunterId,direction:{x:b.pos.x-a.pos.x,z:b.pos.z-a.pos.z}};
  }
  if (name==='cargo:volatileCorrosive' || name==='cargo:volatileCryo') {
    return {...p,sourceId:p.podId};
  }
  if (name==='optic:contact') return {...p,sourceId:p.ownerId};
  if (name==='beacon:deployed') {
    const records=state.beacons;
    const record=Array.isArray(records)?records.find(b=>b.id===p.id):records?.get?.(p.id);
    const target=body(state,record?.entityId);
    return {...p,targetId:target?.id,pos:point(p.pos)?copyPoint(p.pos):target?.pos};
  }
  return p;
}
