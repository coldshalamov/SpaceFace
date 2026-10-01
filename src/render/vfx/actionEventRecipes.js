import { successfulPickupAmount } from '../../core/pickupAcceptance.js';
import { WORLD_CUE_ACTION_RECIPE, resolveWorldCueReceipt } from './worldCueRecipes.js';

// Rescue is green, ransom amber, loss red. Lost is the sim outcome "abandoned".
const SURVIVOR_POD_RETIRE = Object.freeze({
  rescued: { verb: 'cool', primitive: 'deposition', color: 0x7dcea0, life: 0.72, continuous: false },
  ransomed: { verb: 'command', primitive: 'induction', color: 0xe2b15a, life: 0.72, continuous: false },
  abandoned: { verb: 'disrupt', primitive: 'induction', color: 0xc45b4a, life: 0.72, continuous: false },
});
export { SURVIVOR_POD_RETIRE };
// Extra responses consume confirmed simulation receipts. Resolving a receipt here is
// cosmetic only: never discover collisions, change a body, or fabricate a successful action.
export const ADDITIONAL_ACTION_VFX_RECIPES = Object.freeze({
  'presentation:cue': WORLD_CUE_ACTION_RECIPE,
  'ai:telegraph': {verb:'command',primitive:'induction',color:0xf4b484,life:1.6,continuous:false,
    variants:{
      engine_flare:{verb:'ignition',primitive:'compression',color:0xeac891,life:1.6},
      attach_spool:{verb:'catch',primitive:'capture',color:0x82cce6,life:1.6,surfaceCapture:true,surfaceWork:true},
      weapon_charge:{verb:'command',primitive:'induction',color:0xe8ae76,life:1.6,surfaceWork:true},
      // Fuse-lit kamikaze: a hot ignition burn on the hull itself, not a muzzle glow.
      detonator_fuse:{verb:'ignition',primitive:'compression',color:0xff5030,life:1.6,surfaceWork:true},
    }},
  'ai:flee': {verb:'vent',primitive:'compression',color:0xdcb99d,life:.85,continuous:false},
  'ai:formationBroken': {verb:'disrupt',primitive:'induction',color:0xe2a983,life:.8,surfaceWork:true,continuous:false},
  'player:scannedByPatrol': {verb:'command',primitive:'induction',color:0x85d0da,life:1,surfaceWork:true,continuous:false},
  // BREAK RANGE answers on the running hull: a drive flare at the exhaust, not the scan's
  // induction paint it interrupts.
  'customs:breakScan': {verb:'ignition',primitive:'compression',color:0xffc08a,life:.9,surfaceWork:true,continuous:false},
  'heat:changed': {verb:'catch',primitive:'capture',color:0xf1ac76,life:1,surfaceWork:true,surfaceCapture:true,continuous:false},
  // Route handoff: the travel drive yields to the local autopilot — a counter-thrust vent for a
  // direct brake, a re-lit mains burn when the solution calls for the flip. bestMode selects.
  'nav:routeBrake': {verb:'vent',primitive:'compression',color:0x9fc8ee,life:.8,surfaceWork:true,continuous:false,
    variants:{
      flipBurn:{verb:'ignition',primitive:'compression',color:0xffc08a,life:.9,surfaceWork:true},
    }},
  'salvage:cutComplete': {verb:'grind',primitive:'deposition',color:0xf3c286,life:.85,surfaceWork:true,continuous:false},
  'salvage:completed': {verb:'harvest',primitive:'deposition',color:0xc9ba98,life:1.2,continuous:false},
  'pickup:collected': {verb:'transfer',primitive:'connection',color:0xb4e0c0,life:.58,continuous:false},
  // A confirmed point-defence kill answers at the missile's own point — a brief disrupt/
  // induction contact spark, not a kill burst. The target is already dead when this lands.
  'pds:intercept': {verb:'disrupt',primitive:'induction',color:0xffd9a0,life:.22,continuous:false},
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
  // A fade-out is a slow shimmer. The pilot's drop stays the short cut above.
  'cloak:faded': {verb:'disrupt',primitive:'induction',color:0x6a7f9a,life:1.6,continuous:false},
  'weapons:momentumSinkPlanted': {verb:'catch',primitive:'capture',color:0xff9d48,life:.55,continuous:false},
  'weapons:momentumSinkReleased': {verb:'fling',primitive:'pressure',color:0xfff0bf,life:.4,continuous:false},
  'optic:contact': {verb:'disrupt',primitive:'induction',color:0xbbdbff,life:.5},
  'optic:rekindled': {verb:'harvest',primitive:'deposition',color:0xecf4ff,life:1},
  'beacon:deployed': {verb:'command',primitive:'induction',color:0x80ead8,life:1.1},
  // A warded shot's sheet lies on the aimed hull, along the hit that was absorbed.
  'combat:warded': {verb:'cool',primitive:'deposition',color:0x8fe1fa,life:.5,continuous:false},
  // The snap is a short cut on the mine. The shove is the blast that follows it.
  'mines:triggered': {verb:'cut',primitive:'connection',color:0xffe08a,life:.18,continuous:false},
  'mines:detonated': {verb:'shove',primitive:'pressure',color:0xff8a4a,life:.45,continuous:false},
  // The pod body is disposed in the same turn, so the mark is the receipt point, not the mesh.
  'survivorPod:resolved': {verb:'disrupt',primitive:'induction',color:SURVIVOR_POD_RETIRE.abandoned.color,life:.72,continuous:false,
    variants:{
      rescued:SURVIVOR_POD_RETIRE.rescued,
      ransomed:SURVIVOR_POD_RETIRE.ransomed,
      abandoned:SURVIVOR_POD_RETIRE.abandoned,
    }},
});

const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const body = (state,id) => state.entities?.get?.(id);
const copyPoint = p => ({x:p.x,z:p.z});

export function resolveAdditionalActionVfxReceipt(name,p,state) {
  if(name==='presentation:cue')return resolveWorldCueReceipt(p,state);
  if(name==='ai:telegraph'||name==='ai:flee'){
    const source=body(state,p.entityId);if(!point(source?.pos)||source.alive===false)return null;
    if(name==='ai:telegraph'&&!['engine_flare','attach_spool','weapon_charge','detonator_fuse','shield_lance'].includes(p.kind))return null;
    const aft=name==='ai:flee'||p.kind==='engine_flare';
    const a=(source.rot||0)+(aft?Math.PI:0),r=source.radius||6;
    return {...p,targetId:source.id,sourceId:source.id,
      pos:name==='ai:flee'?{x:source.pos.x+Math.cos(a)*r*.9,z:source.pos.z+Math.sin(a)*r*.9}:undefined,
      bodySurface:!aft,attachToTarget:true,direction:{x:Math.cos(a),z:Math.sin(a)}};
  }
  if(name==='ai:formationBroken'){
    let member=body(state,p.leaderId);
    if(!member?.alive)member=null;
    const squadId=p.squadId??p.groupId;
    if(!member&&squadId!=null)for(const candidate of state.entities?.values?.()||[]){
      if(candidate.alive!==false&&candidate.data?.squadId===squadId){member=candidate;break;}
    }
    if(!point(member?.pos))return null;
    return {...p,targetId:member.id,sourceId:member.id,bodySurface:true,attachToTarget:true};
  }
  if(name==='player:scannedByPatrol'||name==='heat:changed'||name==='customs:breakScan'){
    if(name==='heat:changed'&&!p.wantedCrossed)return null;
    const ship=body(state,state.playerId);if(!point(ship?.pos)||ship.alive===false)return null;
    return {...p,targetId:ship.id,sourceId:ship.id,bodySurface:true,attachToTarget:true};
  }
  if(name==='nav:routeBrake'){
    const ship=body(state,state.playerId);if(!point(ship?.pos)||ship.alive===false)return null;
    return {...p,kind:p.bestMode,targetId:ship.id,sourceId:ship.id,bodySurface:true,attachToTarget:true};
  }
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
  if (name==='pds:intercept') {
    // The intercepted shot is already retired — anchor the spark to the receipted point.
    // A missing/non-finite point fabricates nothing rather than falling back onto the hull.
    if (!p || !point(p.pos)) return null;
    const out = {...p,pos:copyPoint(p.pos),sourceId:p.shipId,targetId:null,attachToTarget:false};
    if (point(p.dir)) out.direction = copyPoint(p.dir);
    return out;
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
  if (name==='cloak:faded') {
    const id = p.targetId ?? state.playerId;
    const ship = body(state, id);
    if (!point(ship?.pos)) return null;
    return {...p, targetId: id, sourceId: p.observerId ?? id, pos: copyPoint(ship.pos)};
  }
  if (name==='weapons:momentumSinkPlanted' || name==='weapons:momentumSinkReleased') {
    const id = p.targetId ?? p.ownerId;
    const ent = body(state, id);
    if (!point(ent?.pos)) return null;
    return {...p, targetId: ent.id, sourceId: p.ownerId, pos: copyPoint(ent.pos)};
  }
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
  if (name === 'survivorPod:resolved') {
    // Lost is the sim outcome "abandoned". A missing point must not flash at the origin.
    const variant = SURVIVOR_POD_RETIRE[p && p.outcome];
    if (!variant || !point(p.pos)) return null;
    return {...p, kind: p.outcome, pos: copyPoint(p.pos), targetId: null, sourceId: p.entityId, attachToTarget: false};
  }
  if (name === 'mines:triggered' || name === 'mines:detonated') {
    if (!point(p && p.pos)) return null;
    return {...p, pos: copyPoint(p.pos), sourceId: p.mineId, targetId: p.targetId, attachToTarget: false};
  }
  if (name === 'combat:warded') {
    const aimed = body(state, p && p.targetId);
    const normal = p && p.normal;
    const nx = Number(normal && normal.x);
    const nz = Number(normal && normal.z);
    if (!aimed || aimed.alive === false || !point(aimed.pos)) return null;
    if (!Number.isFinite(nx) || !Number.isFinite(nz) || Math.hypot(nx, nz) < 1e-8) return null;
    // No surfaceWork: that would replace this normal with the escort-to-target bearing.
    const out = {
      targetId: aimed.id,
      sourceId: p.escortId,
      escortId: p.escortId,
      attackerId: p.attackerId,
      normal: { x: nx, z: nz },
    };
    if (point(p.pos)) out.pos = copyPoint(p.pos);
    if (p.approach && Number.isFinite(Number(p.approach.x)) && Number.isFinite(Number(p.approach.z))) {
      out.approach = { x: Number(p.approach.x), z: Number(p.approach.z) };
    }
    return out;
  }
  return p;
}
