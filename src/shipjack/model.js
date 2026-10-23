// BLACK FLAG identity/custody facts. Owned hulls/fittings stay with ships, money with economy.
import { hash32 } from '../core/rng.js';
import { SHIPS } from '../data/ships.js';
import { sanitizeYardPersistence, inspectVessel } from './market.js';
import { witnessLineOfSight } from '../combat/lineOfSight.js';
import { occupantGenerationOf } from '../core/entity.js';
import { normalizeFleetPersistence } from './fleetPersistence.js';
import { fittedBlackFlagTool } from '../data/shipjackEquipment.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
export function registryOwnerLabel(owner){return ({player:'you',captain_mara_venn:'Mara Venn',corporate_blackbird_registry:'Blackbird corporate registry',ceres_shift_cooperative:'Ceres Shift Cooperative',reach_claimant_17:'Reach Recovery Office',forge_automation_pool:'Forge Automation Pool',pallas_salvage_claimants:'the Pallas claimants',unregistered:'no registered claimant'})[owner] || 'the registered claimant';}

export const SHIPJACK_VERSION = 1;
export const SHIPJACK_HANDOFF_RANGE_WU = 115;
export const SHIPJACK_LIMITS = Object.freeze({ vessels: 96, attempts: 8, receipts: 96, history: 12, claims: 32, terminals: 2048 });
const HULLS = new Map(SHIPS.map(row => [row.id, row]));
const TERMINAL = new Set(['destroyed', 'returned', 'sold', 'expired', 'escaped']);
const PHASES = new Set(['observed', 'probed', 'exposed', 'foothold', 'secured', 'transferring', 'aborted', 'escaped', 'destroyed', 'expired']);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
export const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const bounded = (value, min, max, fallback = min) => Math.max(min, Math.min(max, finite(value, fallback)));
const text = (value, max = 100) => typeof value === 'string' ? value.slice(0, max) : '';
export const currentSector = state => state.world?.currentSectorId || null;
export function isBlackFlagAdventure(state) {
  return !!state && (!state.run || state.run.kind === 'adventure')
    && !state.survival?.active && !state.racing?.active && !state.race?.active
    && !state.orbitalGallery?.active && !state.kineticLeague?.active
    && !state.tutorial?.active && !state.replay?.active && !state._ephemeralRacing
    && !state.physicsVenueSession && !state.physicsVenue?.active;
}
export function freshShipjack() {
  return { version: 1, counter: 0, operationCounter: 0, vesselsById: {}, custodyAttempts: {}, titleClaims: {}, yards: {}, operations: {}, receipts: [], retiredIds: [], encounters: {}, alerts: [] };
}
export function ensureShipjack(state) {
  const player = state.player || (state.player = {});
  if (!plain(player.shipjack) || player.shipjack.version !== SHIPJACK_VERSION) player.shipjack = freshShipjack();
  state.shipjack = player.shipjack; // runtime alias, serialized exactly once in the player envelope
  return player.shipjack;
}
export function peekShipjack(state) { return state?.player?.shipjack || state?.shipjack || null; }

/** Import only finite, bounded facts. A malformed optional section cannot wipe a campaign. */
export function normalizeShipjack(input) {
  if (!plain(input) || input.version !== 1) return null;
  const out = freshShipjack();
  out.counter = Math.floor(bounded(input.counter, 0, 1e9));
  out.operationCounter = Math.floor(bounded(input.operationCounter, 0, 1e9));
  for (const [id, raw] of Object.entries(plain(input.vesselsById) ? input.vesselsById : {}).slice(0, SHIPJACK_LIMITS.vessels)) {
    if (!/^vessel:[a-zA-Z0-9:_-]{1,90}$/.test(id) || !plain(raw) || !HULLS.has(raw.defId)) continue;
    const location = plain(raw.location) ? raw.location : {};
    const vector = v => ({ x: bounded(v?.x, -1e7, 1e7, 0), z: bounded(v?.z, -1e7, 1e7, 0) });
    out.vesselsById[id] = {
      vesselId: id, version: 1, defId: raw.defId, name: text(raw.name) || HULLS.get(raw.defId).name,
      origin: text(raw.origin), originalOwner: text(raw.originalOwner), recognizedOwner: text(raw.recognizedOwner),
      materializationOwner:raw.materializationOwner==='shipjack'?'shipjack':'world',
      custodian: text(raw.custodian), title: ['clean','disputed','salvage','returned','sold'].includes(raw.title) ? raw.title : 'disputed',
      generation: text(raw.generation), revision: Math.floor(bounded(raw.revision, 0, 1e9)),
      location: { kind: ['active','field','tow','berth','remote','in_transit','missing','destroyed','sold','returned','impounded'].includes(location.kind) ? location.kind : 'remote',
        sectorId: text(location.sectorId), entityId: Number.isSafeInteger(location.entityId) ? location.entityId : null,
        stationId: text(location.stationId), pos: vector(location.pos), vel: vector(location.vel),
        rot: bounded(location.rot, -10000, 10000, 0), angVel: bounded(location.angVel, -100, 100, 0), at: bounded(location.at, 0, 1e10) },
      condition: { hull: bounded(raw.condition?.hull, 0, 1), driveMissing: raw.condition?.driveMissing === true },
      signature: { broadcast: text(raw.signature?.broadcast), frame: text(raw.signature?.frame), engine: text(raw.signature?.engine),
        forged: raw.signature?.forged === true, tamper: bounded(raw.signature?.tamper, 0, 10), repainted: raw.signature?.repainted === true, broadcastFlagged:raw.signature?.broadcastFlagged===true },
      profile: ['civilian','corporate','pirate','military','autonomous','derelict'].includes(raw.profile) ? raw.profile : 'civilian',
      crew: text(raw.crew), crewSafe: raw.crewSafe === true,proofRecorded:raw.proofRecorded===true, incidentId: text(raw.incidentId),
      lienCr: bounded(raw.lienCr, 0, 1e8), admittedAt: bounded(raw.admittedAt, 0, 1e10),
      beacon: raw.beacon === true, noticeAt: bounded(raw.noticeAt, 0, 1e10), salvageEligible:raw.salvageEligible===true,recoveryAuthorized:raw.recoveryAuthorized===true,claimResolved:raw.claimResolved===true,returnReward:bounded(raw.returnReward,0,1e5),
      freightReleaseOperationId:text(raw.freightReleaseOperationId,120),freightReleasePayloadId:Number.isSafeInteger(raw.freightReleasePayloadId)?raw.freightReleasePayloadId:null,
      history: (Array.isArray(raw.history) ? raw.history : []).slice(-SHIPJACK_LIMITS.history).filter(plain).map(h => ({ at: bounded(h.at,0,1e10), text: text(h.text,180), action: text(h.action,40) })),
    };
    // No serializable halfway handoff. A load safely reopens the physical contest instead.
    const attempt = input.custodyAttempts?.[id];
    if (plain(attempt) && Object.keys(out.custodyAttempts).length < SHIPJACK_LIMITS.attempts) {
      out.custodyAttempts[id] = { vesselId: id, phase: PHASES.has(attempt.phase) && attempt.phase !== 'transferring' ? attempt.phase : 'aborted',
        generation: text(attempt.generation), adaptation: bounded(attempt.adaptation,0,8), dwell: 0,
        windowUntil: bounded(attempt.windowUntil,0,1e10), deadline: bounded(attempt.deadline,0,1e10),
        alarmAt: bounded(attempt.alarmAt,0,1e10), method: text(attempt.method,40), endpoint: text(attempt.endpoint,40),
        surrendered: attempt.surrendered === true, scanned: attempt.scanned === true, tries: bounded(attempt.tries,0,20), lastActionAt: bounded(attempt.lastActionAt,0,1e10), };
    }
  }
  // Operations retain exact one-way terminal ids; never rotate a replay protection window.
  out.retiredIds = (Array.isArray(input.retiredIds) ? input.retiredIds : []).slice(0, SHIPJACK_LIMITS.terminals).filter(x => typeof x === 'string').map(x => x.slice(0,120));
  out.receipts = (Array.isArray(input.receipts) ? input.receipts : []).slice(-SHIPJACK_LIMITS.receipts).filter(plain).map(r => ({ operationId:text(r.operationId,120), action:text(r.action,40), vesselId:text(r.vesselId), ok:r.ok === true, reason:text(r.reason), at:bounded(r.at,0,1e10) }));
  for (const [id, value] of Object.entries(plain(input.encounters) ? input.encounters : {}).slice(0,24)) {
    if (/^[a-zA-Z0-9_-]{1,80}$/.test(id) && plain(value)) out.encounters[id] = { vesselId:text(value.vesselId), outcome:text(value.outcome), admitted:true, missionId:text(value.missionId), offered:value.offered === true };
  }
  Object.assign(out,sanitizeYardPersistence(input,out.vesselsById));
  for(const [id,v] of Object.entries(out.vesselsById)){
    const b=input.vesselsById[id].parkedBody;
    if(!plain(b))continue;
    const subsystems={};
    for(const [key,row] of Object.entries(plain(b.subsystems)?b.subsystems:{}).slice(0,16)){
      if(!/^subsystem_[a-z_]{1,50}$/.test(key)||!plain(row))continue;
      subsystems[key]={id:key,health:bounded(row.health,0,10000),maxHealth:bounded(row.maxHealth,1,10000,45),destroyed:row.destroyed===true,effectiveDisabled:row.effectiveDisabled===true,pendingTransition:null};
    }
    v.parkedBody={hull:bounded(b.hull,0,1e6),armorHp:bounded(b.armorHp,0,1e6),shield:bounded(b.shield,0,1e6),cap:bounded(b.cap,0,1e6),fittings:(Array.isArray(b.fittings)?b.fittings:[]).slice(0,32).map(x=>typeof x==='string'?x.slice(0,80):null),subsystems};
  }
  Object.assign(out,normalizeFleetPersistence(input,out.vesselsById));
  return out;
}

export function vesselHistory(state, vessel, action, line) {
  vessel.history ||= [];
  vessel.history.push({ at: finite(state.simTime), action, text: line });
  if (vessel.history.length > SHIPJACK_LIMITS.history) vessel.history.splice(0, vessel.history.length - SHIPJACK_LIMITS.history);
  vessel.revision = (vessel.revision || 0) + 1;
}
export function vesselForEntity(state, entity) {
  const own = peekShipjack(state);
  return own?.vesselsById?.[entity?.data?.vesselId] || null;
}
export function admitVessel(state, entity, options = {}) {
  if (!entity || entity.alive === false || !HULLS.has(entity.data?.defId) || !isBlackFlagAdventure(state)) return null;
  const own = ensureShipjack(state);
  const existing = vesselForEntity(state, entity);
  if (existing) {
    const previous=state.entities?.get(existing.location?.entityId);
    if(existing.generation!==entity.data?.shipjackGeneration)return null;
    if(previous?.alive&&previous!==entity&&previous.data?.vesselId===existing.vesselId)return null;
    return existing;
  }
  if (Object.keys(own.vesselsById).length >= SHIPJACK_LIMITS.vessels) return null;
  const origin = options.origin || entity.data?.activityActorSlotId || entity.data?.trafficId || `encounter:${entity.id}:${entity.occupantGeneration ?? state.tick}`;
  const counter = ++own.counter;
  const vesselId = options.vesselId || `vessel:${hash32(state.meta?.seed || 1, origin, counter).toString(16)}:${counter}`;
  if (own.vesselsById[vesselId] || own.retiredIds.includes(vesselId)) return null;
  const generation = `${vesselId}:${counter}`;
  entity.data ||= {};
  entity.data.vesselId = vesselId;
  entity.data.shipjackGeneration = generation;
  const playerOwned = options.playerOwned === true;
  const owner = options.ownerId || entity.factionId || 'unregistered';
  const record = own.vesselsById[vesselId] = {
    version: 1, vesselId, defId: entity.data.defId, name: options.name || entity.data.name || HULLS.get(entity.data.defId).name,
    origin, originalOwner: owner, recognizedOwner: owner, custodian: playerOwned ? 'player' : owner,materializationOwner:playerOwned?'shipjack':'world',
    title: playerOwned ? 'clean' : options.legalCategory === 'unregistered' ? 'salvage' : 'disputed',
    generation, revision: 0, admittedAt: finite(state.simTime),
    location: {kind: playerOwned ? 'active' : 'field', sectorId:currentSector(state),entityId:entity.id,pos:globalToSectorLocalForSector(entity.pos,currentSector(state)),vel:{x:entity.vel.x,z:entity.vel.z},rot:entity.rot,angVel:finite(entity.angVel),at:finite(state.simTime)},
    condition: {hull: bounded(entity.hull / (entity.hullMax || 1),0,1)},
    signature: {broadcast:`REG-${hash32(origin, 'reg').toString(16).toUpperCase()}`,frame:`FRAME-${hash32(origin,'frame').toString(16)}`,engine:`DRIVE-${hash32(origin,'drive').toString(16)}`,forged:false,tamper:0},
    profile: options.profile || (entity.team === 1 ? 'pirate' : 'civilian'), crew: options.crew || 'crew aboard', crewSafe: false,
    incidentId:null,lienCr:options.lienCr || 0,history:[],
  };
  vesselHistory(state,record,'identified',playerOwned ? 'Your hull entered the working registry.' : `${record.name}: registry identified; possession is not title.`);
  return record;
}
export function captureReadiness(state, target, attempt = null) {
  const player = state.entities?.get(state.playerId);
  const reasons = [];
  const runtime = state.combat?.entities?.[String(target?.id)];
  const sub = runtime?.subsystems || {};
  const disabled = id => sub[id]?.effectiveDisabled === true || sub[id]?.destroyed === true
    || runtime?.capabilities?.[id==='subsystem_drive'?'drive':id==='subsystem_weapon'?'weapon':'power']===false;
  const possessed = target?.data?.shipjackParked === true;
  const surrendered = target?.data?.ai?.fsm === 'surrender' || attempt?.surrendered === true || possessed;
  const distance = player && target ? Math.hypot(player.pos.x-target.pos.x,player.pos.z-target.pos.z) : Infinity;
  const relativeSpeed = player && target ? Math.hypot(player.vel.x-target.vel.x,player.vel.z-target.vel.z) : Infinity;
  const line = state.player?.tether;
  const attachment=state.combat?.attachments?.byId?.[line?.attachmentId];
  const tethered = !!(line?.active && line.targetId === target?.id && attachment
    && attachment.state==='active' && attachment.ownerId===player?.id && attachment.targetId===target?.id
    && attachment.ownerGeneration===occupantGenerationOf(player) && attachment.targetGeneration===occupantGenerationOf(target));
  if (!player?.alive || !target?.alive) reasons.push('A living pilot and intact target are required.');
  if (distance > 115) reasons.push('Close within 115 WU.');
  if (relativeSpeed > (attempt?.dwell > 0 ? 18 : 14)) reasons.push('Match velocity below 14 WU/s.');
  if (Math.abs(finite(target?.angVel)) > .65) reasons.push('Stabilize the target’s spin.');
  if (player && target && distance<=350 && !witnessLineOfSight(state,player,target.pos,[player.id,target.id])) reasons.push('Terrain blocks the service link. Approach around it.');
  if (finite(target?.shield) > 1 && !surrendered) reasons.push('Shields deny the service link.');
  if (!disabled('subsystem_drive') && !surrendered && !target?.data?.shipjackUncrewed) reasons.push('Defender retains propulsion. Disable drive or negotiate.');
  if (!disabled('subsystem_weapon') && !surrendered && !target?.data?.shipjackUncrewed && attempt?.endpoint !== 'port') reasons.push('Live weapons guard the port. Isolate power or expose a service port.');
  if (!tethered && !surrendered) reasons.push('Attach the Massline to hold a physical approach.');
  return {ready:reasons.length === 0,reasons,distance,relativeSpeed,spin:Math.abs(finite(target?.angVel)),tethered,dwell:finite(attempt?.dwell),driveDisabled:disabled('subsystem_drive'),weaponsDisabled:disabled('subsystem_weapon'),surrendered};
}
export function queryShipjack(state, targetId = state.player?.targetId) {
  if (!isBlackFlagAdventure(state)) return {eligible:false,actions:[]};
  const target = state.entities?.get(targetId);
  const def = HULLS.get(target?.data?.defId);
  const excluded = !def || target?.type !== 'ship' || target?.id === state.playerId || target?.data?.questCritical || target?.data?.capitalBossId || def.role === 'capital'
    || !!target?.data?.missionId && !target?.data?.shipjackEncounterId || target?.flags?.missionPinned===true;
  if (excluded || target?.alive === false) return {eligible:false,reason:'This structure or protected command hull has no transferable helm.',actions:[]};
  const own = peekShipjack(state);
  const vessel = vesselForEntity(state,target);
  const attempt = own?.custodyAttempts?.[vessel?.vesselId];
  const readiness = captureReadiness(state,target,attempt);
  const stage = attempt?.phase || 'observed';
  const actions = [];
  const add = (action,label,enabled=true,reason='') => actions.push({action,label,enabled,reason});
  if(attempt?.transferStartedAt){
    add('abort','Abort airlock crossing');
  } else if (vessel?.custodian === 'player' && !TERMINAL.has(vessel.location.kind)) {
    add('transfer','Assume control',readiness.distance <=115 && readiness.relativeSpeed <=18,'Match velocity and close to your parked hull.');
    if(vessel.location.kind==='tow'||attempt?.phase==='secured')add('tow','Tow to receiver',readiness.tethered,'Attach Massline to this exact hull.');
    add('beacon','Set recovery beacon');
    add('release','Release custody');
  } else if (!attempt?.scanned) {
    add('scan','Identify vessel',readiness.distance <= 1200,'Scan within 1,200 WU.');
    add('hail','Hail captain',readiness.distance <= 1200);
  } else if (stage === 'secured') {
    add('transfer','Assume control',readiness.ready && readiness.dwell >=1.5,readiness.reasons[0] || 'Hold stable for 1.5 seconds.');
    add('tow','Tow to receiver',readiness.tethered,'Attach Massline to this exact hull.'); add('abort','Leave the prize');
  } else if (stage === 'foothold') {
    add('helm','Claim helm',readiness.ready,'Secure a stable physical approach.');
    add('shutdown','Safe shutdown',readiness.distance<=115); add('cargo','Release freight',readiness.distance<=115);
  } else if (stage === 'exposed') {
    add('port','Reach service port',readiness.ready,'Match motion, lower shields, secure Massline.');
    add('shutdown','Interrupt propulsion',readiness.distance<=115); add('abort','Break link');
  } else {
    add('hail','Negotiate crew passage',readiness.distance<=1200);
    add('probe','Probe maintenance signal',readiness.distance<=350,'Close within 350 WU.');
    add('isolator','Pulse exposed drive',readiness.distance<=180 && finite(target?.shield)<=1,'Lower shields and close within 180 WU.');
    add('drone','Launch service pod · 45 cr',readiness.distance<=300,'A live pod must reach the aft port.');
  }
  const forensic=attempt?.scanned&&vessel&&fittedBlackFlagTool(state,'mod_signature_reader_s')?inspectVessel(vessel,{grade:2}):null;
  return {eligible:true,targetId:target.id,generation:target.data.shipjackGeneration ?? target.occupantGeneration ?? null,vesselId:vessel?.vesselId || null,revision:vessel?.revision || 0,name:vessel?.name || target.data.name || def.name,defId:def.id,stage,stageLabel:attempt?.transferStartedAt?'AIRLOCK CROSSING':'',transferPending:!!attempt?.transferStartedAt,transferUntil:attempt?.transferUntil || null,titleStatus:vessel?.title || 'unconfirmed',custody:vessel?.custodian || 'unconfirmed',readiness,actions,
    detail:attempt?.scanned ? `${readiness.driveDisabled?'Drive disabled':'Drive live'} · ${readiness.weaponsDisabled?'weapons isolated':'weapons live'} · ${vessel?.profile || 'unknown'} security. ${forensic?.findings.join('; ') || readiness.reasons[0] || 'Physical approach stable.'}` : 'Identify the registry and observe machinery; hull damage alone does not grant custody.'};
}
