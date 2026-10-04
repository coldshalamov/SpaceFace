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
      // The remaining telegraph kinds (FB-016): each names the force that lands, on the same
      // vocabulary — repulsor push for the salted wake, a wells-capture spool for the anchor
      // field, shield-sheen for the curtain, a dim induction for the unseen lock.
      wake_mines:{verb:'fling',primitive:'pressure',color:0xffb98b,life:1.6},
      field_spool:{verb:'catch',primitive:'capture',color:0x39d0ff,life:1.6},
      pd_curtain:{verb:'cool',primitive:'deposition',color:0x83aefa,life:1.6,surfaceWork:true},
      sensor_ghost:{verb:'command',primitive:'induction',color:0x9db8d8,life:1.6},
      broadside_charge:{verb:'command',primitive:'induction',color:0xff8a5c,life:2.4,surfaceWork:true},
      swarmer_vent:{verb:'fling',primitive:'pressure',color:0xffb98b,life:2.0,surfaceWork:true},
      broadside_desperation:{verb:'command',primitive:'induction',color:0xff5c48,life:2.8,surfaceWork:true},
      pirate_stalk:{verb:'ignition',primitive:'compression',color:0xc97e5a,life:1.6},
      scan_sweep:{verb:'command',primitive:'induction',color:0x85d0da,life:1.6},
      return_fire_warning:{verb:'ignition',primitive:'compression',color:0xffc08a,life:1.4},
      attackRun:{verb:'ignition',primitive:'compression',color:0xeac891,life:1.6},
      alphaStrike:{verb:'command',primitive:'induction',color:0xe8ae76,life:1.6},
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
  // Departure is the cradle run backwards: a vent along the nose, not a second inbound chevron.
  'dock:undocked': {verb:'vent',primitive:'compression',color:0xc8dff5,life:.7,continuous:false},
  // Cargo leaves along the ship's impulse. The receipt supplies the point; the sim event does not.
  'cargo:jettisoned': {verb:'fling',primitive:'pressure',color:0xd8c49a,life:.55,continuous:false},
  'planet:plungeStage': {verb:'ignition',primitive:'compression',color:0xff8a5c,life:.8,continuous:false},
  'planet:recoveryBurn': {verb:'ignition',primitive:'compression',color:0xffb070,life:.7,continuous:false,
    variants:{ off:{verb:'cool',primitive:'deposition',color:0x8aa4c0,life:.4} }},
  'planet:collector': {verb:'harvest',primitive:'deposition',color:0xc9e6a0,life:.6,continuous:false,
    variants:{ off:{verb:'cool',primitive:'deposition',color:0x8aa4b8,life:.35} }},
  // A refused deposit is a cool surface, never a toast.
  'planet:harvestDenied': {verb:'cool',primitive:'deposition',color:0x9bb7c9,life:.45,continuous:false},
  // FB-009 — the signature verb's thirteen receipts reach the picture. One row per bus event the
  // Massline already emits, each naming the verb it already is (link, cut, end, share, snap,
  // rebound). No new physics, no new presentation channel: this table is auto-subscribed by
  // vfx.js via ACTION_VFX_EVENTS. Denials are FB-070's; these are the affirmative receipts.
  // The bridle link draws the shared filament between its two endpoints...
  'massline:bridleLinked': {verb:'latch',primitive:'connection',color:0x76efd1,life:.8,continuous:false},
  // ...a deliberate bridle cut flashes the severed pair...
  'massline:bridleCut': {verb:'cut',primitive:'connection',color:0xffd9a0,life:.4,continuous:false},
  // ...an ended bridle cools off the player's hull (the mirror is already gone when it fires)...
  'massline:bridleEnded': {verb:'cool',primitive:'deposition',color:0x9fc4d4,life:.6,continuous:false},
  // ...a selected bridle endpoint is a command mark on that body...
  'massline:bridleEndpointSelected': {verb:'command',primitive:'induction',color:0x85d0da,life:.7,continuous:false},
  // ...a setup that ends without linking withdraws quietly...
  'massline:bridleSetupEnded': {verb:'cool',primitive:'deposition',color:0x8aa4b8,life:.5,continuous:false},
  // ...the cadence phase change rides the reel-transfer family, kind = phase...
  'massline:cadenceChanged': {verb:'transfer',primitive:'connection',color:0x72cfff,life:.4,continuous:false},
  // ...NPC counterplay cuts with the cutter's own hostile amber...
  'massline:npcCounterplay': {verb:'cut',primitive:'connection',color:0xff8a5c,life:.5,continuous:false},
  // ...the player's sweep severing an NPC line flashes the authored contact point in the
  // sweep's teal; a hostile blade severing the player's line flashes the cut span amber...
  'massline:npcLineCut': {verb:'cut',primitive:'connection',color:0x9effd3,life:.45,continuous:false},
  'massline:playerLineCut': {verb:'cut',primitive:'connection',color:0xffb98b,life:.5,continuous:false},
  // ...a shared ΔV is a transfer bead along the rope...
  'chain:tetherShare': {verb:'transfer',primitive:'connection',color:0xb4e0c0,life:.5,continuous:false},
  // ...a whip snap flings the stored energy at the released mass...
  'tether:whipSnap': {verb:'fling',primitive:'pressure',color:0xfff0bf,life:.4,continuous:false},
  // ...a rebound is a short vent on the re-caught body...
  'tether:rebound': {verb:'vent',primitive:'compression',color:0x9ad0c4,life:.35,continuous:false},
  // ...and a web link runs a bead along the new strand.
  'web:linked': {verb:'latch',primitive:'connection',color:0x82cce6,life:.5,continuous:false},
  // FB-010 — the two deployable edges that had a voice-shaped hole in the picture: the snare's
  // arm tick on its anchor pair, and the seed's collapse warning on the seed itself (the body
  // despawns on `collapsed`; `collapsing` is the beat the player is standing on).
  'massline:snareArmed': {verb:'arm',primitive:'capture',color:0xffa557,life:.75,continuous:false},
  'massSeed:collapsing': {verb:'disrupt',primitive:'induction',color:0xff5030,life:.7,continuous:false},
  // FB-013 — the two heads whose defining moment had no receipt at all: the tractor's capture
  // (a catch on the taken body) and the frame coupler's rigid lock (a latch along the pair).
  'tether:tractorCapture': {verb:'catch',primitive:'capture',color:0x87caff,life:.6,surfaceCapture:true,continuous:false},
  'tether:couplerLock': {verb:'latch',primitive:'connection',color:0x9bdfff,life:.55,continuous:false},
});

const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const body = (state,id) => state.entities?.get?.(id);
const copyPoint = p => ({x:p.x,z:p.z});

export function resolveAdditionalActionVfxReceipt(name,p,state) {
  if(name==='presentation:cue')return resolveWorldCueReceipt(p,state);
  if(name==='ai:telegraph'||name==='ai:flee'){
    const source=body(state,p.entityId);if(!point(source?.pos)||source.alive===false)return null;
    if(name==='ai:telegraph'&&!['engine_flare','attach_spool','weapon_charge','detonator_fuse','shield_lance','wake_mines','field_spool','pd_curtain','sensor_ghost','broadside_charge','swarmer_vent','broadside_desperation','pirate_stalk','scan_sweep','return_fire_warning','attackRun','alphaStrike'].includes(p.kind))return null;
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
  if (name === 'dock:undocked' || name === 'cargo:jettisoned') {
    const ship = body(state, state && state.playerId);
    if (!point(ship && ship.pos) || ship.alive === false) return null;
    const heading = ship.rot || 0;
    let dx = Math.cos(heading);
    let dz = Math.sin(heading);
    if (name === 'cargo:jettisoned') {
      const vx = ship.vel && ship.vel.x;
      const vz = ship.vel && ship.vel.z;
      if (Math.hypot(vx || 0, vz || 0) > 1) { dx = vx; dz = vz; }
      else { dx = -dx; dz = -dz; }
    }
    return {...p, targetId: ship.id, sourceId: ship.id, pos: copyPoint(ship.pos),
      direction: { x: dx, z: dz }, attachToTarget: false};
  }
  if (name === 'planet:plungeStage') {
    const ent = body(state, p && p.id);
    if (!point(ent && ent.pos)) return null;
    const vx = ent.vel && ent.vel.x;
    const vz = ent.vel && ent.vel.z;
    const moving = Math.hypot(vx || 0, vz || 0) > 1;
    return {...p, targetId: ent.id, sourceId: ent.id, pos: copyPoint(ent.pos), attachToTarget: false,
      direction: moving ? { x: vx, z: vz } : { x: Math.cos(ent.rot || 0), z: Math.sin(ent.rot || 0) }};
  }
  if (name === 'planet:recoveryBurn' || name === 'planet:collector' || name === 'planet:harvestDenied') {
    const ship = body(state, state && state.playerId);
    if (!point(ship && ship.pos) || ship.alive === false) return null;
    const aft = name === 'planet:recoveryBurn';
    const a = (ship.rot || 0) + (aft ? Math.PI : 0);
    const kind = name === 'planet:harvestDenied' ? undefined : (p && p.on ? 'on' : 'off');
    return {...p, kind, targetId: ship.id, sourceId: ship.id, pos: copyPoint(ship.pos),
      direction: { x: Math.cos(a), z: Math.sin(a) }, attachToTarget: false};
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
  // ── FB-009: the Massline's thirteen receipts resolve to the bodies they name. ──
  // A missing endpoint fabricates nothing: a dead endpoint means no line, so no picture.
  if (name === 'massline:bridleLinked' || name === 'massline:bridleCut') {
    const a = body(state, p.sourceId), b = body(state, p.targetId);
    if (!point(a?.pos) || !point(b?.pos)) return null;
    return { ...p, sourceId: a.id, targetId: b.id, attachToTarget: true };
  }
  // The bridle mirror is already cleared when the line ends; the rope was the player's
  // controlled attachment, so the withdrawal reads off the player's hull.
  if (name === 'massline:bridleEnded') {
    const ship = body(state, state.playerId);
    if (!point(ship?.pos) || ship.alive === false) return null;
    return { ...p, targetId: ship.id, sourceId: ship.id, bodySurface: true, attachToTarget: true };
  }
  if (name === 'massline:bridleEndpointSelected') {
    const endpoint = body(state, p.sourceId);
    if (!point(endpoint?.pos)) return null;
    return { ...p, targetId: endpoint.id, sourceId: state.playerId, attachToTarget: true };
  }
  // A cancelled setup cools on the endpoint it had, or on the player when none survived. A
  // fallback that names a hull which is itself gone fabricates nothing.
  if (name === 'massline:bridleSetupEnded') {
    const endpoint = body(state, p.sourceId);
    const ship = body(state, state.playerId);
    const targetId = endpoint && point(endpoint.pos) ? endpoint.id
      : ship && point(ship.pos) && ship.alive !== false ? state.playerId : null;
    if (targetId == null) return null;
    return { ...p, targetId, sourceId: state.playerId, bodySurface: targetId === state.playerId };
  }
  if (name === 'massline:cadenceChanged') {
    const ship = body(state, p.sourceId ?? state.playerId);
    if (!point(ship?.pos) || ship.alive === false) return null;
    return { ...p, kind: p.phase, targetId: ship.id, sourceId: ship.id, bodySurface: true, attachToTarget: true };
  }
  if (name === 'massline:npcCounterplay') {
    const actor = body(state, p.actorId);
    if (!point(actor?.pos)) return null;
    return { ...p, targetId: actor.id, sourceId: actor.id, bodySurface: true, attachToTarget: true };
  }
  // The player's blade cutting an NPC line: the authored contact point is the receipt.
  if (name === 'massline:npcLineCut') {
    if (!point(p.contact)) return null;
    return { ...p, pos: copyPoint(p.contact), sourceId: state.playerId,
      targetId: p.ownerId ?? null, attachToTarget: false };
  }
  // A hostile blade severing one of the player's lines: flash the severed span's midpoint,
  // falling back to the player's hull when the endpoints are already gone.
  if (name === 'massline:playerLineCut') {
    const a = body(state, p.ownerId), b = body(state, p.targetId);
    if (point(a?.pos) && point(b?.pos)) {
      return { ...p, sourceId: p.cutterId ?? a.id, targetId: a.id, attachToTarget: true,
        pos: { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 } };
    }
    const ship = body(state, state.playerId);
    if (!point(ship?.pos)) return null;
    return { ...p, sourceId: p.cutterId ?? null, targetId: ship.id, bodySurface: true, attachToTarget: true };
  }
  if (name === 'chain:tetherShare') {
    const a = body(state, p.fromId), b = body(state, p.toId);
    if (!point(a?.pos) || !point(b?.pos)) return null;
    return { ...p, sourceId: a.id, targetId: b.id, attachToTarget: true };
  }
  if (name === 'tether:whipSnap') {
    const target = body(state, p.targetId);
    if (!point(target?.pos)) return null;
    return { ...p, targetId: target.id, sourceId: state.playerId, attachToTarget: true };
  }
  if (name === 'tether:rebound') {
    const target = body(state, p.targetId ?? p.ownerId);
    if (!point(target?.pos)) return null;
    return { ...p, targetId: target.id,
      sourceId: p.actorId ?? p.controllerId ?? state.playerId, attachToTarget: true };
  }
  if (name === 'web:linked') {
    const a = body(state, p.ownerId), b = body(state, p.targetId);
    if (!point(a?.pos) || !point(b?.pos)) return null;
    return { ...p, sourceId: a.id, targetId: b.id, attachToTarget: true };
  }
  // ── FB-010: the deployables' arm/collapse edges resolve to their own bodies. ──
  if (name === 'massline:snareArmed') {
    const a = body(state, p.sourceId), b = body(state, p.targetId);
    if (!point(a?.pos) || !point(b?.pos)) return null;
    return { ...p, sourceId: a.id, targetId: b.id, attachToTarget: true };
  }
  if (name === 'massSeed:collapsing') {
    const seed = body(state, p.seedId);
    if (!point(seed?.pos)) return null;
    return { ...p, pos: copyPoint(seed.pos), targetId: seed.id, sourceId: seed.id, attachToTarget: true };
  }
  // FB-013 — the tractor's capture lands on the taken body; the coupler's lock spans its pair.
  if (name === 'tether:tractorCapture') {
    const target = body(state, p.targetId);
    if (!point(target?.pos)) return null;
    return { ...p, targetId: target.id, sourceId: p.sourceId ?? state.playerId, attachToTarget: true };
  }
  if (name === 'tether:couplerLock') {
    const a = body(state, p.sourceId ?? state.playerId), b = body(state, p.targetId);
    if (!point(a?.pos) || !point(b?.pos)) return null;
    return { ...p, sourceId: a.id, targetId: b.id, attachToTarget: true };
  }
  return p;
}
