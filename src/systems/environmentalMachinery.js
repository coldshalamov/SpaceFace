import { ANVIL_ORCHARD, normalizeOrchardRecord, orchardHistoryFitsTick, orchardPhase, orchardLotId } from '../data/anvilOrchard.js';
import { ORCHARD_GEOMETRY as ORCHARD_G, orchardPodBodySpec } from '../data/anvilOrchardBody.js';
import { isOrchardFrame } from '../data/anvilOrchardIdentity.js';
// PQ-027 / SF-22 — Cinder Sluice runtime adapter, three Ceres kill machines, the
// Pallas Drift debris reef, Veil/Vesta weather, and the Ceres hangar aperture jam.
// World Site receipts are the durable Cinder Sluice state. The rest is authored furniture
// derived from the saved sim clock plus live occupancy for the jam. This adapter owns no
// saved timer and no movement state: it registers volumes into the ONE field kernel and
// emits hazard-language boundaries. The field kernel/physics membrane remains the only
// force writer. Death is the slam-law payoff against anvils or pinballed mass — never a
// hull-drain aura. The hangar jam holds reinforcements by moving mass, not by a spawn flag.

import { fieldsFlag } from '../data/fields.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import {
  ANVIL_ORCHARD_GUST_PROFILE,
  anvilOrchardGustGeometry,
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
  KILL_MACHINES,
  STARTER_FIELD_MACHINE,
  ALL_KILL_MACHINES,
  ALL_KILL_MACHINE_BY_ID,
  PALLAS_REEF_FIELD,
  PALLAS_REEF_SECTOR_ID,
  PALLAS_REEF_SITE_ID,
  APERTURE_FIELDS,
  APERTURE_ID,
  APERTURE_MOUTH,
  APERTURE_PLUG,
  APERTURE_RECEIVER,
  METRONOME_BEAM_DPS,
  METRONOME_FIELD,
  METRONOME_POI_ID,
  METRONOME_SECTOR_ID,
  aperturePoint,
  WEATHER_SECTOR_IDS,
  WEATHER_VOLUMES,
  VESTA_ORE_WINNOW,
  vestaWinnowPhase,
  aperturePhase,
  cinderSluicePhase,
  isApertureOccupant,
  killMachineFieldCenter,
  killMachineFieldDir,
  killMachinePhase,
  killMachinesForSector,
  metronomeBeamDir,
  metronomeBeamEtaAt,
  pallasReefPhase,
  pointInsideAperture,
  pointInsideApertureMouth,
  pointInsideCinderSluice,
  pointInsideKillMachine,
  pointInsideMetronomeBeam,
  pointInsidePallasReef,
  pointInsideWeatherVolume,
  weatherPhase,
  weatherVolumesForSector,
} from '../data/environmentalMachinery.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { writePickupRemainder } from '../core/pickupAcceptance.js';
import { NEAR_EXIT_PAD_WU } from '../world/activityClassification.js';
import {
  choosePowerPriority,
  commitReceiverAcceptance,
  createIndustryLedger,
  evaluateReceiverAcceptance,
  judgeKillMachineCollateral,
  offerSortingJob,
  openOutage,
  projectIndustrySiteResult,
  redirectFullDepot,
  reserveRepairOrder,
  resolveSortingJob,
  stepPowerPriority,
} from './worldSiteRuntime.js';

const HAZARD_TYPE = 'debris_current';

// The jam occupancy read only needs entities whose centers sit inside the small mouth rectangle.
// One circle covering that rectangle is the whole candidate set; the spatial hash answers it
// without walking the sector list, and the unchanged predicate keeps the exact semantics.
const APERTURE_MOUTH_QUERY = (() => {
  const alongMid = (APERTURE_MOUTH.alongMin + APERTURE_MOUTH.alongMax) * 0.5;
  const center = aperturePoint(alongMid, 0);
  const radius = Math.hypot((APERTURE_MOUTH.alongMax - APERTURE_MOUTH.alongMin) * 0.5, APERTURE_MOUTH.halfWidth) + 4;
  return Object.freeze({ x: center.x, z: center.z, radius });
})();
const APERTURE_OCCUPANT_SCRATCH = [];
const KILL_COLLATERAL_SCRATCH = [];
const EMPTY_LIST = [];
const KILL_MACHINE_SHUTDOWN_WORDS = Object.freeze({
  operator_died: 'stopped; its operator is down.',
  player_shutdown: 'switched off.',
  tower_destroyed: 'stopped; its control tower was destroyed.',
  machine_destroyed: 'stopped; its breaking plate was destroyed.',
});
// Verdict-flap embargo (L-2): a load dancing on the lip can re-derive a refusal sentence
// every few ticks. Warnings throttle to this sim-time gap; a committed delivery's success
// line is a booked fact and always speaks.
const APERTURE_WARN_TOAST_GAP_S = 3;

function apertureDeliveryBody(entity) {
  if (!entity || entity.alive === false || !entity.pos) return false;
  if (entity.data && entity.data.aperturePlugId) return false;
  const amount = Math.floor(Number(entity.data && entity.data.amount));
  if (!(Number.isFinite(amount) && amount > 0)) return false;
  return pointInsideAperture(entity.pos);
}

function industryContactRole(state, entity) {
  if (!entity) return 'unknown';
  if (state && entity.id === state.playerId) return 'player';
  if (entity.type === 'pickup' || entity.type === 'payload') return 'cargo';
  const data = entity.data || {};
  if (entity.type === 'ship' && (data.hostile === true || data.role === 'attacker')) return 'attacker';
  if (entity.type === 'ship' && (data.trafficRole || data.role === 'worker')) return 'worker';
  return 'unknown';
}

function apertureOccupantIsLive(state, entity) {
  if (!entity || entity.alive === false) return false;
  const entities = state && state.entities;
  if (entities && typeof entities.get === 'function' && entity.id != null) {
    if (entities.get(entity.id) === entity) return true;
  }
  const list = (state && state.entityList) || EMPTY_LIST;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === entity) return true;
  }
  const index = state && state.entityIndex;
  if (!(index && index.__spacefaceEntityIndexV1 && index.ready === true)) return false;
  const buckets = [index.ships, index.wrecks, index.asteroids];
  for (let b = 0; b < buckets.length; b++) {
    const bucket = buckets[b];
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i] === entity) return true;
    }
  }
  return false;
}

function simTimeOf(state) {
  return Number.isFinite(state && state.simTime)
    ? state.simTime
    : Math.max(0, Number(state && state.tick) || 0) / 60;
}

function acknowledgeRedirectWorker(ledger) {
  const worker = ledger && ledger.worker;
  if (!worker || worker.stage !== 'redirect' || !worker.ownerNotCalled) return ledger;
  const next = { ...worker };
  delete next.ownerNotCalled;
  return { ...ledger, worker: next };
}

function acknowledgeRepairOrder(ledger) {
  const repair = ledger && ledger.repair;
  if (!repair || repair.spawned === true) return ledger;
  const trafficIntent = { ...(repair.trafficIntent || {}) };
  delete trafficIntent.ownerNotCalled;
  return {
    ...ledger,
    repair: { ...repair, spawned: true, trafficIntent },
  };
}

// Only consumed data cells are retained. Unsupported accessors refuse without invocation;
// unrelated worker state stays under its existing owner.
function orchardCells(object,keys){
 if(!object)return null;const cells=[];
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(object,key);if(!d || !('value' in d))return null;cells.push([key,d]);}
 return {values:Object.fromEntries(cells.map(([key,d])=>[key,d.value])),current:()=>cells.every(([key,d])=>{const n=Object.getOwnPropertyDescriptor(object,key);return n && 'value' in n && n.value===d.value && n.writable===d.writable && n.configurable===d.configurable && n.enumerable===d.enumerable;})};
}
function orchardTree(value,seen=new Set()){
 if(value===null || ['number','string','boolean','undefined'].includes(typeof value))return ()=>true;
 if(!value || typeof value!=='object' || seen.has(value) || Object.getPrototypeOf(value)!==(Array.isArray(value)?Array.prototype:Object.prototype))return null;
 seen.add(value);const keys=Reflect.ownKeys(value),cells=orchardCells(value,keys),children=[];if(!cells)return null;
 for(const key of keys){if(typeof key!=='string')return null;const child=orchardTree(cells.values[key],seen);if(!child)return null;children.push(child);}
 seen.delete(value);return ()=>Reflect.ownKeys(value).length===keys.length && cells.current() && children.every(check=>check());
}

export const environmentalMachinery = {
  name: 'environmentalMachinery',

  init(ctx) {
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
    this.state = ctx.state;
    this._orchardHelpers=ctx.helpers;
    this._orchardEpoch=(this._orchardEpoch||0)+1;
    this.bus = ctx.bus;
    this.registry = ctx.registry || null;
    this._phaseOut = {};
    this._killPhaseOut = {};
    this._fieldPatch = { strength: 0 };
    this._fieldRegistered = false;
    this._fieldStrength = null;
    this._playerInside = false;
    this._lastPhase = null;
    this._lastRegulated = null;
    this._killFieldStrength = new Map();
    this._killPlayerInside = new Set();
    this._anvilsEnsured = new Set();
    this._mouthIds = new Map();
    this._reefPhaseOut = {};
    this._reefFieldPatch = { strength: 0 };
    this._reefFieldRegistered = false;
    this._reefFieldStrength = null;
    this._reefPlayerInside = false;
    this._reefEnsured = false;
    this._weatherFieldStrength = new Map();
    this._weatherPlayerInside = new Set();
    this._weatherPhaseOut = {};
    this._weatherLastPhase = new Map();
    this._winnowPhaseOut = {};
    this._winnowLastPhase = null;
    this._winnowBanksEnsured = new Set();
    this._aperturePhaseOut = {};
    this._apertureFieldStrength = new Map();
    this._aperturePlayerInside = false;
    this._apertureJammedAtS = null;
    this._aperturePlugEnsured = false;
    this._apertureLastPhase = null;
    this._apertureLastOccupant = null;
    this._apertureDeliveryCandidate = null;
    this._apertureLastWarnToastAt = null;
    this._industryLedger = null;
    this._industrySiteResult = null;
    this._killCollateral = new Map();
    this._orchardGeometry = { center: { x: 0, z: 0 }, dir: { x: 1, z: 0 } };
    this._orchardFieldPatch = { center: this._orchardGeometry.center, dir: this._orchardGeometry.dir };
    this._orchardFieldRegistered = false;
    this._orchardLastPhase = null;
    // The Metronome (Eris Margin): a rotating denial cone registered per-tick via one
    // dir patch — the field kernel renormalizes it, presentation reads field.dir live.
    this._metronomeRegistered = false;
    this._metronomePlayerInside = false;
    this._metronomeDirOut = { x: 1, z: 0 };
    this._metronomePatch = { dir: { x: 1, z: 0 } };
    // Perf: true once every machine region has been torn down and nothing is live. The per-tick
    // update() on a route with no environmental machinery (the default) otherwise re-ran the
    // whole _clear family at 60 Hz — dozens of field-system lookups and map ops that were all
    // no-ops. _clear sets it; any active branch clears it.
    this._clearSettled = false;
    if (this.bus && typeof this.bus.on === 'function') {
      const clear = (why) => this._clear(why);
      this._unsubs = [
        this.bus.on('entity:destroyed', (receipt) => this._onOrchardPodDestroyed(receipt)),
        this.bus.on('entity:killed', (receipt) => this._onKillMachineDeath(receipt)),
        this.bus.on('asteroid:destroyed', (receipt) => this._onKillMachineDeath(receipt)),
        this.bus.on('sector:exit', () => clear('sector_exit')),
        this.bus.on('game:new', () => clear('new_game')),
        this.bus.on('save:restoring', () => clear('save_restoring')),
        this.bus.on('save:loaded', () => clear('save_loaded')),
      ];
    }
  },

  destroy() {
    this._clear('destroy');
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
  },

  newGame() {
    this._clear('new_game');
  },

  /** Fixed insertion consumer. Frame acquisition and the harvest producer must be enabled
   * together only after their migration/physical release contracts are complete. */
  acceptOrchardNewPod(worker,options={}) {return this.acceptOrchardHarvest(worker,{...options,newOnly:true});},

  acceptOrchardHarvest(worker,{frame,socket,commodityId,qty,newOnly=false}={}) {
    const systemCells=orchardCells(this,['state','_orchardEpoch','_orchardHelpers','registry']);if(!systemCells)return 0;
    const state=systemCells.values.state,epoch=systemCells.values._orchardEpoch,helpers=systemCells.values._orchardHelpers;
    const stateCells=orchardCells(state,['mode','tick','entities','sites','world']);
    const workerCells=orchardCells(worker,['id','occupantGeneration','alive','hull','data','physicsBody']);
    const workerBody=workerCells && orchardTree(workerCells.values.physicsBody);
    const frameCells=orchardCells(frame,['id','occupantGeneration','alive','hull','data','pos','rot']);
    if(!stateCells || !workerCells || !workerBody || !frameCells || state.mode!=='flight' || !Number.isSafeInteger(state.tick) || state.tick<0
      || commodityId!==ANVIL_ORCHARD.commodityId || !Number.isSafeInteger(qty) || qty<=0)return 0;
    const {entities,sites,world}=stateCells.values,rowCells=orchardCells(sites,['anvilOrchard']),worldCells=orchardCells(world,['currentSectorId']);
    const workerData=orchardCells(worker.data,['anvilSlingWitness','itinerary']),itinerary=workerData && orchardCells(workerData.values.itinerary,['kind','role','phase']);
    if(!rowCells || !worldCells || world.currentSectorId!==ANVIL_ORCHARD.sectorId || !workerData || !itinerary
      || workerData.values.anvilSlingWitness!==true || itinerary.values.kind!=='anvil_work' || itinerary.values.role!=='collector' || itinerary.values.phase!=='collect')return 0;
    const prior=rowCells.values.anvilOrchard,tree=orchardTree(prior);if(!tree)return 0;
    const row=normalizeOrchardRecord(prior);
    if(socket===undefined && row)socket=row.sockets.find(s=>!newOnly && s.status==='stowed' && row.lots.find(l=>l.id===s.lotId)?.units<4)?.socket
      ?? row.sockets.find(s=>['empty','delivered','lost'].includes(s.status) && s.operation==='closed' && s.progress===0 && s.cycle<4)?.socket;
    const slot=Number.isInteger(socket) && socket>=0 && socket<3?row?.sockets[socket]:null,filling=!newOnly && slot?.status==='stowed';
    if(!row || !orchardHistoryFitsTick(row,state.tick) || row.frameStatus!=='intact' || orchardPhase(row,state.tick)?.phase!=='calm'
      || !slot || (!filling && !['empty','delivered','lost'].includes(slot.status)) || slot.operation!=='closed' || slot.progress!==0 || (!filling && slot.cycle>=4) || row.sourceRemaining<=0)return 0;
    const ledgerSlot=Object.getOwnPropertyDescriptor(sites,'anvilOrchard');if(!ledgerSlot?.writable)return 0;
    let nativeCurrent=()=>true;
    const current=()=>nativeCurrent() && systemCells.current() && this.state===state && this._orchardEpoch===epoch && this._orchardHelpers===helpers && stateCells.current() && worldCells.current() && rowCells.current() && tree()
      && workerCells.current() && workerBody() && workerData.current() && itinerary.current() && frameCells.current()
      && worker.alive===true && Number.isFinite(worker.hull) && worker.hull>0 && frame.alive===true && Number.isFinite(frame.hull) && frame.hull>0
      && Map.prototype.get.call(entities,worker.id)===worker && Map.prototype.get.call(entities,frame.id)===frame;
    if(!current())return 0;
    let facade;try{facade=systemCells.values.registry?.get?.('physics');}catch(_){return 0;}
    if(!current())return 0;
    const facadeCells=orchardCells(facade,['_sg02']),owner=facadeCells?.values._sg02;
    const ownerCells=orchardCells(owner,['world','records','_colliderOwners','_eventQueue']);if(!ownerCells)return 0;
    const nativeWorker=Map.prototype.get.call(ownerCells.values.records,workerCells.values.id),nativeCells=orchardCells(nativeWorker,['entity','body','spec','collider','colliders','revision']);
    if(!nativeCells || nativeCells.values.entity!==worker || !Array.isArray(nativeCells.values.colliders))return 0;
    const members=orchardCells(nativeCells.values.colliders,Reflect.ownKeys(nativeCells.values.colliders)),nativeSpec=orchardTree(nativeCells.values.spec);if(!members || !nativeSpec)return 0;
    const authoredBody=workerCells.values.physicsBody,resolvedBody=nativeCells.values.spec;
    if(!authoredBody || typeof authoredBody!=='object' || !resolvedBody || typeof resolvedBody!=='object' || authoredBody.enabled===false || !Number.isSafeInteger(authoredBody.revision) || authoredBody.revision<0
      || nativeCells.values.revision!==authoredBody.revision || resolvedBody.revision!==authoredBody.revision
      || !['schemaVersion','dynamic','mass','inertiaY','radius','shape','material','ccd'].every(key=>authoredBody[key]===resolvedBody[key]))return 0;
    nativeCurrent=()=>ownerCells.current() && nativeCells.current() && nativeSpec() && members.current() && Map.prototype.get.call(ownerCells.values.records,workerCells.values.id)===nativeWorker;
    if(!facadeCells || !current() || !owner || !facade.readOrchardFramePose(frame) || !current() || !facadeCells.current())return 0;
    const collars=frame.data.orchardCollars;
    if(!collars || collars.cycles[socket]!==slot.cycle || collars.progress[socket]!==0)return 0;
    if(filling){
      const lot=row.lots.find(l=>l.id===slot.lotId),accepted=Math.min(qty,ANVIL_ORCHARD.unitsPerPod-(lot?.units??4),row.sourceRemaining);if(!(accepted>0))return 0;
      let pod=null;
      for(const e of Map.prototype.values.call(entities)){const d=orchardCells(e,['data']);if(!d)continue;const identity=orchardCells(d.values.data,['worldRecordId']);if(identity?.values.worldRecordId===slot.lotId){if(pod)return 0;pod=e;}}
      const podCells=orchardCells(pod,['id','occupantGeneration','alive','data']),podData=podCells && orchardCells(podCells.values.data,['amount','commodityId']);
      const fillCurrent=()=>current() && facadeCells.current() && podCells?.current() && podData?.current() && Map.prototype.get.call(entities,podCells.values.id)===pod;
      if(!podCells || !podData || !fillCurrent() || podData.values.amount!==lot.units || podData.values.commodityId!==ANVIL_ORCHARD.commodityId)return 0;
      const next=normalizeOrchardRecord(prior);next.sourceRemaining-=accepted;next.lots.find(l=>l.id===slot.lotId).units+=accepted;if(!normalizeOrchardRecord(next))return 0;
      let prepared;
      try{prepared=owner.prepareOrchardPodFill(frame,pod,socket,accepted,state);
        if(!prepared || !fillCurrent() || !prepared.preflight() || !fillCurrent()){prepared?.abort();return 0;}
        if(!prepared.commit()){prepared.abort();return 0;}
        return accepted;
      }catch(_){if(prepared?.committed)return accepted;prepared?.abort();return 0;}
    }
    const accepted=Math.min(qty,ANVIL_ORCHARD.unitsPerPod,row.sourceRemaining),lotId=orchardLotId(socket,slot.cycle+1);
    const next=normalizeOrchardRecord(prior);next.sourceRemaining-=accepted;
    next.lots.push({id:lotId,socket,cycle:slot.cycle+1,units:accepted,outcome:'retained'});
    next.sockets[socket]={socket,cycle:slot.cycle+1,lotId,status:'stowed',operation:'closed',progress:0,handoff:'fixed',targetRevision:null,acceptedTick:null,completedTick:null,openedTick:null,readyTick:null,mountLostWork:0,mountLostTick:null};
    if(!normalizeOrchardRecord(next))return 0;
    const source=ORCHARD_G.pods[socket],c=Math.cos(frame.rot),s=Math.sin(frame.rot);
    let stage,prepared;
    try {
      stage=helpers.stageEntitySpawn({type:'payload',pos:{x:frame.pos.x+c*source.pos.x-s*source.pos.z,z:frame.pos.z+s*source.pos.x+c*source.pos.z},rot:frame.rot+source.yaw,
        radius:ORCHARD_G.pod.radius,hull:100,hullMax:100,flags:{persistent:true},physicsBody:orchardPodBodySpec(),data:{orchardId:ANVIL_ORCHARD.id,orchardKind:'pod',masslineTetherable:false,
        worldRecordId:lotId,identityKey:lotId,authoredAssetId:ORCHARD_G.pod.assetId,authoredPayloadAssetId:ORCHARD_G.pod.assetId,commodityId,amount:accepted}});
      if(!current() || !facadeCells.current()){stage.abort();return 0;}
      prepared=owner.prepareOrchardPodInsertion(frame,stage.entity,socket,state);
      if(!prepared || !current() || !facadeCells.current()){prepared?.abort();stage.abort();return 0;}
      stage.commit({preflight:()=>current() && facadeCells.current() && prepared.preflight() && current() && facadeCells.current(),
        commit:()=>{if(!current() || !facadeCells.current() || !prepared.commit())return false;
          // No callback after native commit: the retained ledger cell is the finite debit.
          return true;},abort:prepared.abort});
      return stage.committed?accepted:0;
    } catch(error) {
      // A presentation callback may throw after committed native/core/finite publication.
      // Accepted custody remains authoritative; never retry it as a refused harvest.
      if(stage?.committed)return accepted;
      prepared?.abort();stage?.abort();return 0;
    }
  },

  /** Accepted interaction entry. Interaction reach/offer wiring remains in its existing owner. */
  requestOrchardRelease(frame,socket) {
    const system=orchardCells(this,['state','_orchardEpoch','registry']);if(!system)return false;
    const state=system.values.state,cells=orchardCells(state,['mode','tick','entities','sites','world']);
    const actor=orchardCells(frame,['id','occupantGeneration','alive','hull','data','physicsBody']);
    const source=actor && orchardTree(actor.values.physicsBody);
    const current=()=>system.current() && cells?.current() && actor?.current() && source?.()
      && Map.prototype.get.call(cells.values.entities,actor.values.id)===frame;
    if(!cells || !actor || !source || !current())return false;
    let facade;try{facade=system.values.registry?.get?.('physics');}catch(_){return false;}
    if(!current())return false;
    const native=orchardCells(facade,['_sg02']);if(!native)return false;
    try{if(!facade.readOrchardFramePose(frame) || !current() || !native.current())return false;
      return native.values._sg02.requestOrchardFiniteRelease(frame,socket,state);
    }catch(_){return false;}
  },

  update(_dt, state) {
    // One native mechanism, prepared here before physics; the yard owns its job only.
    this.registry?.get?.('tethysSwitchyard')?.bindNative?.();
    this._industryDt = Number.isFinite(_dt) ? _dt : 0;
    const sectorId = state && state.world && state.world.currentSectorId;
    const inFlight = !!(state && state.mode === 'flight');
    const inOrchard = !!(inFlight && sectorId === ANVIL_ORCHARD.sectorId);
    const inCeres = !!(inFlight && sectorId === CINDER_SLUICE_SECTOR_ID);
    const inPallas = !!(inFlight && sectorId === PALLAS_REEF_SECTOR_ID);
    const inWeather = !!(inFlight && WEATHER_SECTOR_IDS.has(sectorId));
    const sectorMachines = inFlight ? killMachinesForSector(sectorId) : EMPTY_LIST;
    const inKill = sectorMachines.length > 0;
    const inMetronome = !!(inFlight && sectorId === METRONOME_SECTOR_ID);
    if (!fieldsFlag('enabled') || !(inCeres || inPallas || inWeather || inKill || inMetronome || inOrchard)) {
      if (this._clearSettled !== true) {
        this._clear(!(inCeres || inPallas || inWeather || inKill || inMetronome || inOrchard) ? 'inactive_route' : 'fields_disabled');
      }
      return;
    }
    this._clearSettled = false;

    if (inOrchard) this._updateOrchard(state);
    else this._clearOrchard('wrong_sector');

    if (inCeres) {
      this._updateCinder(state);
      this._updateAperture(state);
    } else {
      this._clearCinder('wrong_sector');
      this._clearAperture('wrong_sector');
    }
    if (inKill) this._updateKillMachines(state, sectorMachines);
    else this._clearKillMachines('wrong_sector');

    if (inPallas) this._updateReef(state);
    else this._clearReef('wrong_sector');

    if (inWeather) this._updateWeather(state);
    else this._clearWeather('wrong_sector');
    if (inFlight && sectorId === VESTA_ORE_WINNOW.sectorId) this._updateWinnow(state);
    else this._clearWinnow();

    if (inMetronome) this._updateMetronome(_dt, state);
    else this._clearMetronome('wrong_sector');
  },

  // The Metronome beam: one rotating denial cone. The sweep is pure simTime math —
  // the kernel patch turns the beam, hazard boundaries speak on edge, and the wedge
  // burns the player through the combat kernel's hazard-radiation origin while the
  // field's own force carries mass out of the sweep. NPC ships and projectiles take
  // the shove through the same field candidates — baiting a patrol into the beam is
  // the authored counterplay; hull burn is player-only, same as every hazard zone.
  _updateMetronome(dt, state) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const simTime = simTimeOf(state);
    const dir = metronomeBeamDir(simTime, this._metronomeDirOut);
    if (this._metronomeRegistered !== true || system.hasExternal(METRONOME_FIELD.id) !== true) {
      system.registerEnvironmental({
        ...METRONOME_FIELD,
        dir: { x: dir.x, z: dir.z },
        createdAt: simTime,
      });
      this._metronomeRegistered = true;
    } else if (typeof system.updateExternal === 'function') {
      const patch = this._metronomePatch;
      patch.dir.x = dir.x;
      patch.dir.z = dir.z;
      system.updateExternal(METRONOME_FIELD.id, patch);
    }
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const inside = !!(player && player.alive !== false && player.pos
      && pointInsideMetronomeBeam(player.pos, simTime));
    if (inside !== this._metronomePlayerInside) {
      this._emitHazardBoundary(inside, HAZARD_TYPE, METRONOME_FIELD.id, METRONOME_POI_ID, undefined, {
        phase: 'sweep',
        remainingS: inside ? 0
          : (player && player.pos ? metronomeBeamEtaAt(player.pos, simTime) : null),
      });
      this._metronomePlayerInside = inside;
    }
    if (inside) this._applyMetronomeBurn(state, player, dt);
  },

  // The authored "radiation damage through the hazard system": a thermal burn with a
  // hazard_radiation origin so the death log names the beam, through the combat
  // kernel's single damage writer. No kernel, no burn — a stub fields system in a
  // probe still gets the sweep without needing combat.
  _applyMetronomeBurn(state, player, dt) {
    const damage = METRONOME_BEAM_DPS * (Number(dt) || 0);
    if (!(damage > 0) || !player || player.alive === false) return;
    const combat = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('combat')
      : null;
    // Parity with the world radiation route: only route through a kernel bound to THIS state —
    // a divergent combat.state would silently reject the packet as target_missing.
    const live = state || this.state;
    if (!combat || combat.state !== live || typeof combat.ensureKernel !== 'function') return;
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'thermal',
      pos: player.pos,
      source: { kind: 'hazard_radiation', hazardId: METRONOME_FIELD.id },
    });
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    combat.ensureKernel().routeDamage({
      attackerId: null,
      targetId: player.id,
      packet,
      origin: { kind: 'hazard_radiation', id: METRONOME_FIELD.id },
    });
  },

  _clearMetronome(why) {
    const system = this._fieldsSystem();
    if (system && typeof system.hasExternal === 'function' && system.hasExternal(METRONOME_FIELD.id)
        && typeof system.unregisterExternal === 'function') {
      system.unregisterExternal(METRONOME_FIELD.id);
    }
    this._metronomeRegistered = false;
    if (this._metronomePlayerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, METRONOME_FIELD.id, METRONOME_POI_ID, why);
      this._metronomePlayerInside = false;
    }
  },

  _updateWinnow(state) {
    const machine = VESTA_ORE_WINNOW;
    const phase = vestaWinnowPhase(simTimeOf(state), this._winnowPhaseOut);
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    for (let i = 0; i < machine.fields.length; i++) {
      const field = machine.fields[i];
      const active = i === 0 ? phase.phase === 'gather'
        : phase.phase === 'warning' || phase.phase === 'discharge';
      const strength = phase.phase === 'warning' ? 0 : field.strength;
      if (!active) {
        if (system.hasExternal(field.id)) system.unregisterExternal(field.id);
      } else if (!system.hasExternal(field.id)) {
        system.registerEnvironmental({ ...field, strength, createdAt: simTimeOf(state) });
      } else if (this._winnowLastPhase !== phase.phase) {
        system.updateExternal(field.id, { strength });
      }
    }
    if (this._winnowLastPhase !== phase.phase) {
      this._emitPhaseChanged({ siteId: machine.id, kind: 'winnow',
        previous: this._winnowLastPhase, phase: phase.phase, remainingS: phase.remainingS });
      this._winnowLastPhase = phase.phase;
    }
    const active = state.world.activeSector;
    for (const bank of machine.furniture) {
      if (this._winnowBanksEnsured.has(bank.id) || !this.bus?.emit) continue;
      this.bus.emit('environmentalMachinery:ensureAnvil', {
        id: bank.id, machineId: machine.id, pos: bank.pos, radius: bank.radius, mass: 12000,
      });
      this._winnowBanksEnsured.add(bank.id);
    }
    const sector = state.world.sectors && state.world.sectors[machine.sectorId];
    const world = this.registry && this.registry.get('world');
    if (!active || state.world.currentSectorId !== machine.sectorId || !sector || !world?._spawnPlaceProp) return;
    for (const bank of machine.furniture) {
      // The active sector owns furniture lifetime. Docking clears forces, not its rows.
      if ((active.dressing || []).some((row) => row.environmentalMachineryId === bank.id)) continue;
      const entity = world._spawnPlaceProp(active, sector, bank.placeId, bank.pos, {
        rot: bank.rot, radius: bank.radius, name: 'Ore Winnow', worldOneOff: true,
      });
      if (entity) {
        const row = active.dressing.find((item) => item.id === entity.id);
        if (row) row.environmentalMachineryId = bank.id;
      }
    }
  },

  _clearWinnow() {
    const system = this._fieldsSystem();
    for (const field of VESTA_ORE_WINNOW.fields) {
      if (system && system.hasExternal(field.id)) system.unregisterExternal(field.id);
    }
    this._winnowLastPhase = null;
    this._winnowBanksEnsured.clear();
  },

  diagnostics(state = this.state) {
    const record = state && state.sites && state.sites.worldById
      && state.sites.worldById[CINDER_SLUICE_SITE_ID];
    const simTime = simTimeOf(state);
    const machines = ALL_KILL_MACHINES.map((machine) => {
      const phase = this._killMachinePhase(machine, state);
      const collateral = this._killCollateral && this._killCollateral.get(machine.id);
      return Object.freeze({
        id: machine.id,
        phase: phase.phase,
        fieldActive: phase.fieldActive,
        remainingS: phase.remainingS,
        playerInside: this._killPlayerInside.has(machine.id),
        ...(collateral ? { collateral } : {}),
      });
    });
    if (!record) {
      return Object.freeze({
        siteId: null,
        phase: null,
        machines,
        reef: this._reefDiagnostics(simTime),
        weather: this._weatherDiagnostics(state, simTime),
        aperture: this._apertureDiagnostics(state, simTime),
        metronome: this._metronomeDiagnostics(simTime),
      });
    }
    const phase = cinderSluicePhase(record, simTime);
    return Object.freeze({
      siteId: CINDER_SLUICE_SITE_ID,
      phase: phase.phase,
      regulated: phase.regulated,
      remainingS: phase.remainingS,
      fieldRegistered: this._fieldRegistered,
      playerInside: this._playerInside,
      machines,
      reef: this._reefDiagnostics(simTime),
      weather: this._weatherDiagnostics(state, simTime),
      aperture: this._apertureDiagnostics(state, simTime),
      metronome: this._metronomeDiagnostics(simTime),
    });
  },

  _metronomeDiagnostics(simTime) {
    const dir = metronomeBeamDir(simTime, this._metronomeDirOut);
    return Object.freeze({
      id: METRONOME_FIELD.id,
      beamBearingDeg: Math.round((Math.atan2(dir.z, dir.x) * 180 / Math.PI) * 10) / 10,
      fieldRegistered: this._metronomeRegistered === true,
      playerInside: this._metronomePlayerInside === true,
    });
  },

  _reefDiagnostics(simTime) {
    const phase = pallasReefPhase(simTime);
    return Object.freeze({
      siteId: PALLAS_REEF_SITE_ID,
      phase: phase.phase,
      fieldActive: phase.fieldActive,
      remainingS: phase.remainingS,
      fieldRegistered: this._reefFieldRegistered,
      playerInside: this._reefPlayerInside,
    });
  },

  _apertureDiagnostics(state, simTime) {
    const phase = aperturePhase(simTime, {
      occupied: this._apertureOccupied(state),
      jammedAtS: this._apertureJammedAtS,
    });
    return Object.freeze({
      id: APERTURE_ID,
      phase: phase.phase,
      fieldActive: phase.fieldActive,
      remainingS: phase.remainingS,
      fieldRegistered: this._apertureFieldStrength.size > 0,
      playerInside: this._aperturePlayerInside,
      jammedAtS: this._apertureJammedAtS,
      occupied: phase.occupied,
      ...(this._industrySiteResult ? { industry: this._industrySiteResult } : {}),
    });
  },

  _weatherDiagnostics(state, simTime) {
    const sectorId = state && state.world && state.world.currentSectorId;
    return Object.freeze(weatherVolumesForSector(sectorId).map((volume) => {
      const phase = weatherPhase(volume, simTime);
      return Object.freeze({
        id: volume.id,
        role: volume.role,
        phase: phase.phase,
        fieldActive: phase.fieldActive,
        remainingS: phase.remainingS,
        playerInside: this._weatherPlayerInside.has(volume.id),
      });
    }));
  },

  _fieldsSystem() {
    return this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('fields')
      : null;
  },

  _updateCinder(state) {
    const record = state && state.sites && state.sites.worldById
      && state.sites.worldById[CINDER_SLUICE_SITE_ID];
    if (!record) {
      this._clearCinder('site_missing');
      return;
    }

    const phase = cinderSluicePhase(record, simTimeOf(state), this._phaseOut);
    if (phase.fieldActive) this._upsertField(phase);
    else this._removeField();
    this._updatePlayerBoundary(state, phase.fieldActive);
    this._publishPhaseTransition(phase);
  },

  _killMachineShutdown(machine, state = this.state) {
    const record = state?.world?.discovery?.[machine.sectorId]?.machineShutdowns?.[machine.id];
    return record && Object.hasOwn(KILL_MACHINE_SHUTDOWN_WORDS, record.cause) ? record : null;
  },

  _killMachinePhase(machine, state, out = null) {
    const phase = killMachinePhase(machine, simTimeOf(state), out);
    if (this._killMachineShutdown(machine, state)) {
      phase.phase = 'shutdown';
      phase.fieldActive = false;
      phase.fieldStrengthScale = 0;
      phase.remainingS = 0;
    }
    return phase;
  },

  // The world discovery overlay already survives sector retirement and Continue. Keep the
  // stop there, rather than in visit-local field bookkeeping that clear() deliberately drops.
  shutdownKillMachine(machineId, cause) {
    const state = this.state;
    if (!Object.hasOwn(ALL_KILL_MACHINE_BY_ID, machineId)
      || !Object.hasOwn(KILL_MACHINE_SHUTDOWN_WORDS, cause) || state?.mode !== 'flight') return false;
    const machine = ALL_KILL_MACHINE_BY_ID[machineId];
    if (state.world?.currentSectorId !== machine.sectorId || this._killMachineShutdown(machine)) return false;
    const previous = killMachinePhase(machine, simTimeOf(state)).phase;
    const discovery = state.world.discovery || (state.world.discovery = {});
    const sector = discovery[machine.sectorId] || (discovery[machine.sectorId] = {
      discovered: false, visitedCount: 0, pois: {}, fieldsDepleted: {},
    });
    const shutdowns = sector.machineShutdowns || (sector.machineShutdowns = {});
    shutdowns[machine.id] = { cause, atS: simTimeOf(state) };
    this._removeKillMachineFields(machine);
    this._updateKillMachinePlayerBoundary(state, machine, null, false);
    this._killCollateral.delete(machine.id);
    this._emitPhaseChanged({ siteId: machine.id, kind: 'killMachine', previous,
      phase: 'shutdown', remainingS: 0, cause });
    this.bus?.emit('toast', {
      text: `${machine.mouth?.name || 'Industrial machine'} ${KILL_MACHINE_SHUTDOWN_WORDS[cause]}`,
      kind: 'success', ttl: 4,
    });
    return true;
  },

  _onKillMachineDeath(receipt) {
    const entity = this.state?.entities?.get(receipt?.id);
    const machine = ALL_KILL_MACHINE_BY_ID[entity?.data?.killMachineId];
    // Mining publishes before setting alive=false; depleted HP is the shared death fact.
    // An unrelated death or a sector unload must never be interpreted as a power cut.
    if (!machine || entity?.type !== 'asteroid' || !Number.isFinite(entity.hull) || entity.hull > 0
      || entity.data.killMachineAnvilId !== machine.anvil.id) return false;
    return this.shutdownKillMachine(machine.id, 'machine_destroyed');
  },

  _updateKillMachines(state, machines) {
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const live = machines || KILL_MACHINES;
    this._retireKillMachinesOutside(live);
    for (const machine of live) {
      const phase = this._killMachinePhase(machine, state, this._killPhaseOut);
      if (phase.fieldActive) this._upsertKillMachineFields(machine, phase);
      else this._removeKillMachineFields(machine);
      if (phase.phase !== 'shutdown') {
        this._ensureAnvil(machine);
        this._ensureMachineMouth(machine);
      }
      this._updateKillMachinePlayerBoundary(state, machine, player, phase.fieldActive);
      this._noteKillCollateral(state, machine, player, phase);
    }
  },

  _retireKillMachinesOutside(live) {
    const keep = new Set();
    for (const machine of live) keep.add(machine.id);
    for (const machine of ALL_KILL_MACHINES) {
      if (keep.has(machine.id)) continue;
      this._removeKillMachineFields(machine);
      if (this._killPlayerInside.has(machine.id)) {
        this._emitHazardBoundary(false, machine.hazardType, machine.id, machine.id, 'wrong_sector');
        this._killPlayerInside.delete(machine.id);
      }
      this._mouthIds.delete(machine.id);
    }
  },

  // The jaw is an existing kit body. World already knows how to place one; this adapter
  // asks once per visit for any machine that names a `mouth`, so Ceres mouths stay as they
  // are (their shells come from occupationalYardDressing.js, not this path).
  _ensureMachineMouth(machine) {
    if (!machine || !machine.mouth || this._mouthIds.has(machine.id)) return;
    const world = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('world')
      : null;
    const active = this.state && this.state.world && this.state.world.activeSector;
    const sector = this.state && this.state.world && this.state.world.sectors
      ? this.state.world.sectors[machine.sectorId]
      : null;
    if (!world || typeof world._spawnPlaceProp !== 'function' || !active || !sector) return;
    if (this.state.world.currentSectorId !== machine.sectorId) return;
    // A bare activeSector (headless harnesses and pre-entry boots hand the default gameState
    // bag, which carries no dressing table) is not a materialized visit — the mouth prop has no
    // live sector bag to track, so asking world to place it would orphan the row and crash on
    // the bag's missing dressing list. Reads below already tolerate the bare shape.
    if (!Array.isArray(active.dressing)) return;
    const existing = (active.dressing || []).find((row) => row.environmentalMachineryId === machine.id);
    if (existing) {
      this._mouthIds.set(machine.id, existing.id);
      return;
    }
    const ent = world._spawnPlaceProp(active, sector, machine.placeId, {
      x: machine.globalPos.x,
      z: machine.globalPos.z,
    }, {
      rot: machine.rot,
      name: machine.mouth.name,
      radius: machine.mouth.radius,
      worldOneOff: true,
    });
    if (ent && ent.id != null) {
      this._mouthIds.set(machine.id, ent.id);
      const row = (active.dressing || []).find((item) => item.id === ent.id);
      if (row) row.environmentalMachineryId = machine.id;
    }
  },

  _updateAperture(state) {
    const simTime = simTimeOf(state);
    const occupied = this._apertureOccupied(state);
    if (occupied) {
      if (this._apertureJammedAtS == null) this._apertureJammedAtS = simTime;
    } else if (this._apertureJammedAtS != null) {
      const hold = aperturePhase(simTime, {
        occupied: false,
        jammedAtS: this._apertureJammedAtS,
      });
      if (hold.phase !== 'jam') this._apertureJammedAtS = null;
    }
    const phase = aperturePhase(simTime, {
      occupied,
      jammedAtS: this._apertureJammedAtS,
    }, this._aperturePhaseOut);
    if (phase.fieldActive) this._upsertApertureFields(phase);
    else this._removeApertureFields();
    const wantPlug = phase.fieldActive && phase.fieldStrengthScale > 0 && !occupied;
    if (wantPlug) this._ensureAperturePlug();
    else this._releaseAperturePlug();
    this._publishAperturePhase(phase);
    this._updateAperturePlayerBoundary(state, phase);
    this._publishApertureIndustry(state, phase);
  },

  _apertureOccupied(state) {
    // The hash only holds activity-classified bodies, and the mouth is a fixed world point:
    // when the player is far enough away that the mouth lies outside the classify bubble, a
    // parked occupant is dormant and absent from the hash. Gate the query on coverage —
    // mouth circle inside the classify circle — and scan occupant-type buckets when it is not.
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const reach = state && state.activityRuntime && Number.isFinite(state.activityRuntime.physicsReachWu)
      ? state.activityRuntime.physicsReachWu + NEAR_EXIT_PAD_WU
      : 0;
    const mouthDist = player && player.pos
      ? Math.hypot(player.pos.x - APERTURE_MOUTH_QUERY.x, player.pos.z - APERTURE_MOUTH_QUERY.z)
      : Infinity;
    const covered = mouthDist + APERTURE_MOUTH_QUERY.radius <= reach;
    this._apertureDeliveryCandidate = null;
    if (covered) {
      const nearby = queryNearbyEntities(
        state,
        APERTURE_MOUTH_QUERY,
        APERTURE_MOUTH_QUERY.radius,
        APERTURE_OCCUPANT_SCRATCH,
      );
      let occupant = null;
      for (let i = 0; i < nearby.length; i++) {
        const entity = nearby[i];
        if (!occupant && isApertureOccupant(entity)) occupant = entity;
        if (!this._apertureDeliveryCandidate && apertureDeliveryBody(entity)) {
          this._apertureDeliveryCandidate = entity;
        }
      }
      this._apertureLastOccupant = occupant;
      return !!occupant;
    }
    // Off-hash: a parked occupant is dormant and missing from the classify bubble.
    // Do not walk rocks, FX, or projectiles — only the three occupant types.
    const last = this._apertureLastOccupant;
    if (last && isApertureOccupant(last) && apertureOccupantIsLive(state, last)) return true;
    this._apertureLastOccupant = null;
    const index = state && state.entityIndex;
    const ready = !!(index && index.__spacefaceEntityIndexV1 && index.ready === true);
    const buckets = ready
      ? [index.ships, index.wrecks, index.asteroids]
      : [(state && state.entityList) || EMPTY_LIST];
    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const entity = list[i];
        if (isApertureOccupant(entity)) {
          this._apertureLastOccupant = entity;
          return true;
        }
      }
    }
    return false;
  },

  _upsertApertureFields(phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const createdAt = simTimeOf(this.state);
    for (const field of APERTURE_FIELDS) {
      const strength = field.strength * phase.fieldStrengthScale;
      const live = typeof system.hasExternal === 'function'
        ? system.hasExternal(field.id)
        : this._apertureFieldStrength.has(field.id);
      if (!live) {
        system.registerEnvironmental({
          ...field,
          strength,
          createdAt,
        });
        this._apertureFieldStrength.set(field.id, strength);
        continue;
      }
      if (this._apertureFieldStrength.get(field.id) === strength) continue;
      if (typeof system.updateExternal === 'function') {
        system.updateExternal(field.id, { strength });
      }
      this._apertureFieldStrength.set(field.id, strength);
    }
  },

  _removeApertureFields() {
    const system = this._fieldsSystem();
    for (const field of APERTURE_FIELDS) {
      const live = system && typeof system.hasExternal === 'function'
        ? system.hasExternal(field.id)
        : this._apertureFieldStrength.has(field.id);
      if (live && typeof system.unregisterExternal === 'function') {
        system.unregisterExternal(field.id);
      }
      this._apertureFieldStrength.delete(field.id);
    }
  },

  _ensureAperturePlug() {
    if (this._aperturePlugEnsured) return;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('environmentalMachinery:ensureAperturePlug', {
      id: APERTURE_PLUG.id,
      pos: APERTURE_PLUG.pos,
      radius: APERTURE_PLUG.radius,
      mass: APERTURE_PLUG.mass,
    });
    this._aperturePlugEnsured = true;
  },

  _releaseAperturePlug() {
    if (!this._aperturePlugEnsured) return;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('environmentalMachinery:releaseAperturePlug', { id: APERTURE_PLUG.id });
    }
    this._aperturePlugEnsured = false;
  },

  _updateAperturePlayerBoundary(state, phase) {
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const watching = !!(player && player.alive !== false && pointInsideAperture(player.pos)
      && (phase.fieldActive || phase.phase === 'open' || phase.phase === 'jam'));
    if (watching === this._aperturePlayerInside) return;
    this._aperturePlayerInside = watching;
    this._emitHazardBoundary(watching, HAZARD_TYPE, APERTURE_ID, APERTURE_ID, undefined, {
      remainingS: phase.remainingS,
      phase: phase.phase,
    });
  },

  // One haul request for a new redirect or a new unspawned repair. Traffic fills `receipt`
  // only after a hauler job and its actor exist; a missed dispatch leaves the ledger marker.
  _emitIndustryHaul(spec) {
    if (!this.bus || typeof this.bus.emit !== 'function' || !spec) return null;
    const sourceId = typeof spec.sourceId === 'string' ? spec.sourceId : '';
    const destinationId = typeof spec.destinationId === 'string' ? spec.destinationId : '';
    const commodityId = typeof spec.commodityId === 'string' ? spec.commodityId : '';
    const qty = Math.floor(Number(spec.qty));
    if (!sourceId || !destinationId || !commodityId || !Number.isSafeInteger(qty) || qty <= 0) return null;
    const receipt = { jobId: null, entityId: null };
    this.bus.emit('industry:haulRequested', {
      kind: spec.kind,
      sourceId,
      destinationId,
      commodityId,
      qty,
      orderId: typeof spec.orderId === 'string' ? spec.orderId : null,
      workerId: typeof spec.workerId === 'string' ? spec.workerId : null,
      receipt,
    });
    if (typeof receipt.jobId !== 'string' || !receipt.jobId || receipt.entityId == null) return null;
    return receipt;
  },

  // Site-side receiver result for the hangar mouth. A jam records a repair-parts offer and a
  // sorting job; it does not spawn a hull. traffic.js remains the only convoy writer.
  _publishApertureIndustry(state, phase) {
    if (!phase) return;
    const jammed = phase.phase === 'jam';
    const pendingSort = !!(this._industryLedger && this._industryLedger.sorting
      && this._industryLedger.sorting.status === 'open');
    const candidate = jammed
      ? (this._apertureLastOccupant || this._apertureDeliveryCandidate)
      : this._apertureDeliveryCandidate;
    if (!candidate && !jammed && !pendingSort) return;
    if (!this._industryLedger) {
      this._industryLedger = createIndustryLedger({
        capacity: APERTURE_RECEIVER.capacity,
        powerBudget: APERTURE_RECEIVER.powerBudget,
        refineDemand: APERTURE_RECEIVER.refineDemand,
        sortDemand: APERTURE_RECEIVER.sortDemand,
        simTime: simTimeOf(state),
      });
    }
    let ledger = this._industryLedger;
    const data = candidate && candidate.data || {};
    const entered = !!(candidate && candidate.pos && pointInsideApertureMouth(candidate.pos));
    const inVolume = !!(candidate && candidate.pos && pointInsideAperture(candidate.pos));
    const contact = evaluateReceiverAcceptance({
      phase: phase.phase,
      occupied: jammed || phase.occupied === true,
      entered,
      lipContact: inVolume && !entered,
      relativeSpeed: candidate && candidate.vel
        ? Math.hypot(Number(candidate.vel.x) || 0, Number(candidate.vel.z) || 0)
        : 0,
      bodyRadius: Number(candidate && candidate.radius) || 0,
      mouthHalfWidth: APERTURE_MOUTH.halfWidth,
      damaged: data.damagedEnvelope === true,
      damagedHalfWidthScale: APERTURE_RECEIVER.damagedHalfWidthScale,
      quantity: data.amount,
      capacity: APERTURE_RECEIVER.capacity,
      stored: ledger.stored,
      cargoClass: data.cargoClass || null,
      acceptsClasses: APERTURE_RECEIVER.classes,
      intakeClass: APERTURE_RECEIVER.intakeClass,
      obstructClass: APERTURE_RECEIVER.obstructClass,
      commodityId: data.commodityId || null,
      alternateDestinationId: APERTURE_RECEIVER.repairSourceId,
      mass: candidate && candidate.mass,
      maxRelativeSpeed: APERTURE_RECEIVER.maxRelativeSpeed,
      lot: data.lot || null,
      payloadPos: candidate && candidate.pos,
    });
    let committedDelivery = false;
    if (candidate && candidate.id != null) {
      const committed = commitReceiverAcceptance(ledger, contact, candidate.id);
      if (committed.committed) {
        committedDelivery = true;
        ledger = committed.ledger;
        const data = candidate.data;
        if (data && !Object.isFrozen(data)) {
          const left = Math.max(0, Math.floor(Number(data.amount) || 0) - committed.acceptedQty);
          writePickupRemainder(data, left);
          if (left <= 0 && (candidate.type === 'pickup' || candidate.type === 'payload')) {
            candidate.alive = false;
          }
        }
      }
    }
    if (contact.redirect && (!ledger.worker || ledger.worker.stage !== 'redirect')) {
      const redirected = redirectFullDepot(ledger, contact);
      ledger = redirected.ledger;
      if (redirected.redirected && redirected.worker) {
        const assigned = this._emitIndustryHaul({
          kind: 'redirect',
          sourceId: APERTURE_ID,
          destinationId: redirected.worker.destinationId,
          commodityId: redirected.worker.commodityId,
          qty: redirected.worker.qty,
          workerId: redirected.worker.id,
        });
        if (assigned) ledger = acknowledgeRedirectWorker(ledger);
      }
    }
    if (!jammed && ledger.sorting && ledger.sorting.status === 'open' && !this._apertureLastOccupant) {
      const resolved = resolveSortingJob(ledger, {
        action: 'remove',
        cargoClass: ledger.sorting.obstructClass,
        receiptId: 'occupancy-cleared',
      });
      ledger = resolved.ledger;
    }
    if (jammed) {
      if (!ledger.repair) {
        const reserved = reserveRepairOrder(ledger, {
          orderId: 'aperture-repair',
          commodityId: APERTURE_RECEIVER.repairCommodityId,
          qty: APERTURE_RECEIVER.repairQty,
          sourceId: APERTURE_RECEIVER.repairSourceId,
          destId: APERTURE_ID,
          simTime: simTimeOf(state),
        });
        ledger = reserved.ledger;
        if (!reserved.duplicate && reserved.order && reserved.order.spawned !== true) {
          const assigned = this._emitIndustryHaul({
            kind: 'repair-parts',
            sourceId: reserved.order.sourceId,
            destinationId: reserved.order.destId,
            commodityId: reserved.order.commodityId,
            qty: reserved.order.qty,
            orderId: reserved.order.orderId,
          });
          if (assigned) ledger = acknowledgeRepairOrder(ledger);
        }
      }
      if (!ledger.sorting) {
        ledger = offerSortingJob(ledger, {
          workerId: 'aperture-hauler',
          obstructClass: APERTURE_RECEIVER.obstructClass,
          validClass: APERTURE_RECEIVER.intakeClass,
          obstructionId: candidate && candidate.id != null ? String(candidate.id) : 'aperture-obstruction',
        }).ledger;
      }
      if (!ledger.shortage) {
        ledger = openOutage(ledger, {
          cause: 'receiver-jam',
          missingCommodity: APERTURE_RECEIVER.intakeClass,
          remedy: 'sort-or-repair-parts',
        }).ledger;
      }
    }
    if (ledger.power && ledger.power.priorityId) {
      ledger = { ...ledger, power: stepPowerPriority(ledger.power, Number(this._industryDt) || 0) };
    }
    this._industryLedger = ledger;
    this._industrySiteResult = projectIndustrySiteResult(ledger, contact);
    if (candidate && candidate.data && !Object.isFrozen(candidate.data)
      && contact.scanSentence && candidate.data.scanSentence !== contact.scanSentence) {
      candidate.data.scanSentence = contact.scanSentence;
      // The mouth's verdict is a fact the pilot can act on — a receipt line, not an
      // instrument or a second voice. It rides the same `toast` channel every other
      // refusal/acceptance already uses, and only on a change: the body's stamp doubles
      // as the dedupe latch, so a held load reports once and a retried load reports
      // again only when the verdict itself moves.
      //
      // A success sentence announces a delivery, so it may ride the channel only when
      // the ledger actually committed one — a duplicate remainder re-entering the mouth
      // re-derives "Accepted N" from its shrunken amount while commitReceiverAcceptance
      // refuses the repeat receipt, and announcing it would report units that never
      // moved. Refusals state a fact regardless, but a flapping verdict cannot retell
      // a warning more often than the embargo allows.
      const toastKind = contact.reason ? 'warn' : 'success';
      const now = simTimeOf(state);
      const lastWarnAt = Number.isFinite(this._apertureLastWarnToastAt)
        ? this._apertureLastWarnToastAt
        : -Infinity;
      const warnFlap = toastKind === 'warn' && (now - lastWarnAt) < APERTURE_WARN_TOAST_GAP_S;
      if ((contact.successCredit !== true || committedDelivery) && !warnFlap
        && this.bus && typeof this.bus.emit === 'function') {
        if (toastKind === 'warn') this._apertureLastWarnToastAt = now;
        this.bus.emit('toast', {
          text: contact.scanSentence,
          kind: toastKind,
          ttl: 4,
        });
      }
    }
  },

  chooseAperturePower(priorityId) {
    if (!this._industryLedger) {
      this._industryLedger = createIndustryLedger({
        capacity: APERTURE_RECEIVER.capacity,
        powerBudget: APERTURE_RECEIVER.powerBudget,
        refineDemand: APERTURE_RECEIVER.refineDemand,
        sortDemand: APERTURE_RECEIVER.sortDemand,
      });
    }
    this._industryLedger = {
      ...this._industryLedger,
      power: choosePowerPriority(this._industryLedger.power, priorityId),
    };
    this._industrySiteResult = projectIndustrySiteResult(
      this._industryLedger,
      this._industrySiteResult && this._industrySiteResult.contact,
    );
    return this._industryLedger.power.priorityId;
  },

  // Names who is already inside the working volume. Force and anvil contact stay the
  // damage path; this record grants no credit and does not despawn collateral.
  _noteKillCollateral(state, machine, player, phase) {
    if (!player || player.alive === false || !player.pos || !phase || phase.phase !== 'surge') return;
    if (!pointInsideKillMachine(machine, player.pos)) return;
    const occupants = [{ id: player.id, role: 'player', inside: true }];
    const hash = state && state.spatialHash;
    if (hash && typeof hash.queryRadius === 'function' && hash.diagnostics && hash.diagnostics.activeBuckets > 0) {
      const found = queryNearbyEntities(state, player.pos, machine.hazardRadius, KILL_COLLATERAL_SCRATCH);
      for (let i = 0; i < found.length; i++) {
        const entity = found[i];
        if (!entity || entity === player || entity.alive === false || !entity.pos) continue;
        if (!pointInsideKillMachine(machine, entity.pos)) continue;
        occupants.push({ id: entity.id, role: industryContactRole(state, entity), inside: true });
      }
    }
    if (!this._killCollateral) this._killCollateral = new Map();
    this._killCollateral.set(machine.id, judgeKillMachineCollateral({ phase: phase.phase, occupants }));
  },

  _updateReef(state) {
    const phase = pallasReefPhase(simTimeOf(state), this._reefPhaseOut);
    if (phase.fieldActive) this._upsertReefField(phase);
    else this._removeReefField();
    this._ensureReef();
    this._updateReefPlayerBoundary(state, phase.fieldActive);
  },

  _upsertReefField(phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const live = typeof system.hasExternal === 'function'
      ? system.hasExternal(PALLAS_REEF_FIELD.id)
      : this._reefFieldRegistered;
    if (!live) {
      system.registerEnvironmental({
        ...PALLAS_REEF_FIELD,
        strength: phase.fieldStrength,
        createdAt: simTimeOf(this.state),
      });
      this._reefFieldRegistered = true;
      this._reefFieldStrength = phase.fieldStrength;
      return;
    }
    this._reefFieldRegistered = true;
    if (this._reefFieldStrength === phase.fieldStrength) return;
    this._reefFieldPatch.strength = phase.fieldStrength;
    if (typeof system.updateExternal === 'function') {
      system.updateExternal(PALLAS_REEF_FIELD.id, this._reefFieldPatch);
    }
    this._reefFieldStrength = phase.fieldStrength;
  },

  _removeReefField() {
    const system = this._fieldsSystem();
    const live = system && typeof system.hasExternal === 'function'
      ? system.hasExternal(PALLAS_REEF_FIELD.id)
      : this._reefFieldRegistered;
    if (live && typeof system.unregisterExternal === 'function') {
      system.unregisterExternal(PALLAS_REEF_FIELD.id);
    }
    this._reefFieldRegistered = false;
    this._reefFieldStrength = null;
  },

  _ensureReef() {
    if (this._reefEnsured) return;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('environmentalMachinery:ensureReef', {
      siteId: PALLAS_REEF_SITE_ID,
      sectorId: PALLAS_REEF_SECTOR_ID,
    });
    this._reefEnsured = true;
  },

  _updateReefPlayerBoundary(state, fieldActive) {
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const inside = !!(fieldActive && player && player.alive !== false
      && pointInsidePallasReef(player.pos));
    if (inside === this._reefPlayerInside) return;
    this._reefPlayerInside = inside;
    this._emitHazardBoundary(inside, HAZARD_TYPE, PALLAS_REEF_FIELD.id, PALLAS_REEF_SITE_ID);
  },

  _upsertField(phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const live = typeof system.hasExternal === 'function'
      ? system.hasExternal(CINDER_SLUICE_FIELD.id)
      : this._fieldRegistered;
    if (!live) {
      system.registerEnvironmental({
        ...CINDER_SLUICE_FIELD,
        strength: phase.fieldStrength,
        createdAt: phase.anchorS,
      });
      this._fieldRegistered = true;
      this._fieldStrength = phase.fieldStrength;
      return;
    }
    this._fieldRegistered = true;
    if (this._fieldStrength === phase.fieldStrength) return;
    this._fieldPatch.strength = phase.fieldStrength;
    system.updateExternal(CINDER_SLUICE_FIELD.id, this._fieldPatch);
    this._fieldStrength = phase.fieldStrength;
  },

  _removeField() {
    const system = this._fieldsSystem();
    const live = system && typeof system.hasExternal === 'function'
      ? system.hasExternal(CINDER_SLUICE_FIELD.id)
      : this._fieldRegistered;
    if (live && typeof system.unregisterExternal === 'function') {
      system.unregisterExternal(CINDER_SLUICE_FIELD.id);
    }
    this._fieldRegistered = false;
    this._fieldStrength = null;
  },

  _upsertKillMachineFields(machine, phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const createdAt = simTimeOf(this.state);
    for (const field of machine.fields) {
      const strength = field.strength * phase.fieldStrengthScale;
      const live = typeof system.hasExternal === 'function'
        ? system.hasExternal(field.id)
        : this._killFieldStrength.has(field.id);
      if (!live) {
        system.registerEnvironmental({
          id: field.id,
          kind: field.kind,
          center: killMachineFieldCenter(machine, field),
          dir: killMachineFieldDir(machine, field),
          radius: field.radius,
          strength,
          falloff: field.falloff,
          halfAngleRad: field.halfAngleRad,
          edgeSoftRad: field.edgeSoftRad,
          halfWidth: field.halfWidth,
          sourceId: machine.id,
          team: null,
          createdAt,
        });
        this._killFieldStrength.set(field.id, strength);
        continue;
      }
      if (this._killFieldStrength.get(field.id) === strength) continue;
      if (typeof system.updateExternal === 'function') {
        system.updateExternal(field.id, { strength });
      }
      this._killFieldStrength.set(field.id, strength);
    }
  },

  _removeKillMachineFields(machine) {
    const system = this._fieldsSystem();
    for (const field of machine.fields) {
      const live = system && typeof system.hasExternal === 'function'
        ? system.hasExternal(field.id)
        : this._killFieldStrength.has(field.id);
      if (live && typeof system.unregisterExternal === 'function') {
        system.unregisterExternal(field.id);
      }
      this._killFieldStrength.delete(field.id);
    }
  },

  _ensureAnvil(machine) {
    const anvilId = machine.anvil.id;
    if (this._anvilsEnsured.has(anvilId)) return;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('environmentalMachinery:ensureAnvil', {
      id: anvilId,
      machineId: machine.id,
      pos: machine.anvil.pos,
      radius: machine.anvil.radius,
      mass: machine.anvil.mass,
    });
    this._anvilsEnsured.add(anvilId);
  },

  _updatePlayerBoundary(state, fieldActive) {
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const inside = !!(fieldActive && player && player.alive !== false
      && pointInsideCinderSluice(player.pos));
    if (inside === this._playerInside) return;
    this._playerInside = inside;
    this._emitHazardBoundary(inside, HAZARD_TYPE, CINDER_SLUICE_FIELD.id, CINDER_SLUICE_SITE_ID);
  },

  _updateKillMachinePlayerBoundary(state, machine, player, fieldActive) {
    const inside = !!(fieldActive && player && player.alive !== false
      && pointInsideKillMachine(machine, player.pos));
    const wasInside = this._killPlayerInside.has(machine.id);
    if (inside === wasInside) return;
    if (inside) this._killPlayerInside.add(machine.id);
    else this._killPlayerInside.delete(machine.id);
    this._emitHazardBoundary(inside, machine.hazardType, machine.id, machine.id);
  },

  _emitHazardBoundary(inside, zoneType, zoneId, siteId, why, extras) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    if (inside) {
      this.bus.emit('hazard:enter', {
        zoneType,
        zoneId,
        siteId,
        remainingS: extras && Number.isFinite(extras.remainingS) ? extras.remainingS : null,
        phase: extras && extras.phase ? extras.phase : null,
      });
      return;
    }
    this.bus.emit('hazard:exit', { zoneType, zoneId, siteId, why });
  },

  _publishPhaseTransition(phase) {
    if (phase.phase === this._lastPhase && phase.regulated === this._lastRegulated) return;
    const previous = this._lastPhase;
    this._lastPhase = phase.phase;
    this._lastRegulated = phase.regulated;
    this._emitPhaseChanged({
      siteId: CINDER_SLUICE_SITE_ID,
      kind: 'current',
      previous,
      phase: phase.phase,
      regulated: phase.regulated,
      remainingS: phase.remainingS,
    });
  },

  _publishWeatherPhase(volume, phase) {
    const previous = this._weatherLastPhase.get(volume.id);
    if (previous === phase.phase) return;
    this._weatherLastPhase.set(volume.id, phase.phase);
    this._emitPhaseChanged({
      siteId: volume.id,
      kind: 'weather',
      role: volume.role,
      previous: previous || null,
      phase: phase.phase,
      remainingS: phase.remainingS,
    });
  },

  _publishAperturePhase(phase) {
    if (this._apertureLastPhase === phase.phase) return;
    const previous = this._apertureLastPhase;
    this._apertureLastPhase = phase.phase;
    this._emitPhaseChanged({
      siteId: APERTURE_ID,
      kind: 'aperture',
      previous,
      phase: phase.phase,
      remainingS: phase.remainingS,
      occupied: phase.occupied,
    });
  },

  _emitPhaseChanged(payload) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('environmentalMachinery:phaseChanged', payload);
  },

  _clearCinder(why) {
    this._removeField();
    if (this._playerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, CINDER_SLUICE_FIELD.id, CINDER_SLUICE_SITE_ID, why);
    }
    this._playerInside = false;
    this._lastPhase = null;
    this._lastRegulated = null;
  },

  _clearKillMachines(why) {
    for (const machine of ALL_KILL_MACHINES) {
      this._removeKillMachineFields(machine);
      if (this._killPlayerInside.has(machine.id)) {
        this._emitHazardBoundary(false, machine.hazardType, machine.id, machine.id, why);
      }
    }
    this._killPlayerInside.clear();
    this._killFieldStrength.clear();
    this._anvilsEnsured.clear();
    this._mouthIds.clear();
  },

  _clearAperture(why) {
    this._removeApertureFields();
    this._releaseAperturePlug();
    if (this._aperturePlayerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, APERTURE_ID, APERTURE_ID, why);
    }
    this._aperturePlayerInside = false;
    this._apertureJammedAtS = null;
    this._apertureLastPhase = null;
  },

  _clearReef(why) {
    this._removeReefField();
    if (this._reefPlayerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, PALLAS_REEF_FIELD.id, PALLAS_REEF_SITE_ID, why);
    }
    this._reefPlayerInside = false;
    this._reefEnsured = false;
  },

  _updateWeather(state) {
    const simTime = simTimeOf(state);
    const sectorId = state && state.world && state.world.currentSectorId;
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    for (const volume of weatherVolumesForSector(sectorId)) {
      const phase = weatherPhase(volume, simTime, this._weatherPhaseOut);
      if (phase.fieldActive) this._upsertWeatherField(volume, phase);
      else this._removeWeatherField(volume);
      this._publishWeatherPhase(volume, phase);
      this._updateWeatherPlayerBoundary(volume, player, phase);
    }
  },

  // Orchard weather follows only the existing durable row and resident frame. The gust is a
  // temporary field-kernel cone; calm/forecast have no registered force volume, and no saved
  // timer or direct velocity/impulse writer is introduced here.
  _updateOrchard(state) {
    const row = normalizeOrchardRecord(state?.sites?.anvilOrchard);
    if (!row || row.frameStatus === 'destroyed' || !orchardHistoryFitsTick(row, state.tick)) {
      this._removeOrchardField();
      this._orchardLastPhase = null;
      return;
    }
    const phase = orchardPhase(row, state.tick);
    const entities = state.entities;
    let frame = null;
    const residentId = state.planet?.orchardFrameId;
    if (entities && typeof entities.get === 'function' && residentId != null) frame = entities.get(residentId);
    if (!frame || frame.alive === false || !isOrchardFrame(frame)) {
      frame = null;
      if (entities && typeof entities.values === 'function') {
        for (const candidate of entities.values()) {
          if (candidate?.alive !== false && isOrchardFrame(candidate)
            && candidate.data?.worldRecordId === ORCHARD_G.worldRecordId) {
            frame = candidate;
            break;
          }
        }
      }
    }
    const exactFrame = frame && frame.data?.worldRecordId === ORCHARD_G.worldRecordId;
    if (exactFrame && phase?.phase === 'calm') {
      // Re-arm a native close only after ordinary service admission. This deliberately lives on
      // the normal route tick (never a deserialize/restore hook), so native owner validation sees
      // the current exact frame, finite row, and socket pose before it creates an intent.
      let facade;
      try { facade = this.registry?.get?.('physics'); } catch (_) { facade = null; }
      const nativeOwner = facade?._sg02;
      if (typeof nativeOwner?.requestOrchardFiniteClose === 'function') {
        for (const socket of row.sockets) {
          if ((socket.status === 'delivered' || socket.status === 'lost') && socket.handoff === 'ready'
            && (socket.operation === 'open' || socket.operation === 'closing')) {
            try { nativeOwner.requestOrchardFiniteClose(frame, socket.socket, state); } catch (_) {}
          }
        }
      }
    }
    if (phase?.phase === 'gust' && exactFrame) {
      this._upsertOrchardField(frame);
    } else {
      this._removeOrchardField();
    }
    this._orchardLastPhase = phase?.phase || null;
  },

  _upsertOrchardField(frame) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const geometry = anvilOrchardGustGeometry(frame, this._orchardGeometry);
    if (!geometry) { this._removeOrchardField(); return; }
    const id = ANVIL_ORCHARD_GUST_PROFILE.id;
    const live = typeof system.hasExternal === 'function'
      ? system.hasExternal(id)
      : this._orchardFieldRegistered;
    if (!live) {
      system.registerEnvironmental({
        id,
        kind: ANVIL_ORCHARD_GUST_PROFILE.kind,
        center: { x: geometry.center.x, z: geometry.center.z },
        dir: { x: geometry.dir.x, z: geometry.dir.z },
        radius: ANVIL_ORCHARD_GUST_PROFILE.radius,
        strength: ANVIL_ORCHARD_GUST_PROFILE.strength,
        falloff: ANVIL_ORCHARD_GUST_PROFILE.falloff,
        halfAngleRad: ANVIL_ORCHARD_GUST_PROFILE.halfAngleRad,
        edgeSoftRad: ANVIL_ORCHARD_GUST_PROFILE.edgeSoftRad,
        sourceId: ANVIL_ORCHARD_GUST_PROFILE.sourceId,
        team: ANVIL_ORCHARD_GUST_PROFILE.team,
        createdAt: simTimeOf(this.state),
      });
      this._orchardFieldRegistered = typeof system.hasExternal === 'function'
        ? system.hasExternal(id) : true;
      return;
    }
    this._orchardFieldRegistered = true;
    this._orchardFieldPatch.center.x = geometry.center.x;
    this._orchardFieldPatch.center.z = geometry.center.z;
    this._orchardFieldPatch.dir.x = geometry.dir.x;
    this._orchardFieldPatch.dir.z = geometry.dir.z;
    if (typeof system.updateExternal === 'function') system.updateExternal(id, this._orchardFieldPatch);
  },

  _removeOrchardField() {
    const system = this._fieldsSystem();
    const id = ANVIL_ORCHARD_GUST_PROFILE.id;
    const live = system && typeof system.hasExternal === 'function'
      ? system.hasExternal(id) : this._orchardFieldRegistered;
    if (live && typeof system?.unregisterExternal === 'function') system.unregisterExternal(id);
    this._orchardFieldRegistered = false;
  },

  _clearOrchard(_why) {
    this._removeOrchardField();
    this._orchardLastPhase = null;
  },

  _onOrchardPodDestroyed(receipt) {
    const entity = receipt?.entity;
    const data = entity?.data;
    const parts = typeof data?.worldRecordId === 'string' ? data.worldRecordId.split(':') : [];
    // Destruction is a positive lifecycle receipt; never infer loss from a missing resident.
    // Native owner still validates the current exact lease, saved lot, and destroyed entity.
    if (!entity || receipt.id !== entity.id || entity.alive !== false || entity.type !== 'payload'
      || data?.orchardId !== ANVIL_ORCHARD.id || data?.orchardKind !== 'pod'
      || data.identityKey !== data.worldRecordId || parts.length !== 3 || parts[0] !== ANVIL_ORCHARD.id
      || !['0', '1', '2'].includes(parts[1]) || !['1', '2', '3', '4'].includes(parts[2])
      || data.authoredAssetId !== ORCHARD_G.pod.assetId
      || data.authoredPayloadAssetId !== ORCHARD_G.pod.assetId) return false;
    const state = this.state;
    let frame = state?.entities?.get?.(state?.planet?.orchardFrameId);
    if (!frame || frame.alive === false || !isOrchardFrame(frame)) {
      frame = null;
      for (const candidate of state?.entities?.values?.() || []) {
        if (candidate?.alive !== false && isOrchardFrame(candidate)
          && candidate.data?.worldRecordId === ORCHARD_G.worldRecordId) { frame = candidate; break; }
      }
    }
    if (!frame) return false;
    let facade;
    try { facade = this.registry?.get?.('physics'); } catch (_) { return false; }
    const owner = facade?._sg02;
    if (typeof owner?.commitOrchardPodLoss !== 'function') return false;
    try { return owner.commitOrchardPodLoss(frame, entity, state, receipt) === true; } catch (_) { return false; }
  },

  _upsertWeatherField(volume, phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const field = volume.field;
    const strength = field.strength * phase.fieldStrengthScale;
    const live = typeof system.hasExternal === 'function'
      ? system.hasExternal(field.id)
      : this._weatherFieldStrength.has(field.id);
    if (!live) {
      system.registerEnvironmental({
        ...field,
        strength,
        createdAt: simTimeOf(this.state),
      });
      this._weatherFieldStrength.set(field.id, strength);
      return;
    }
    if (this._weatherFieldStrength.get(field.id) === strength) return;
    if (typeof system.updateExternal === 'function') {
      system.updateExternal(field.id, { strength });
    }
    this._weatherFieldStrength.set(field.id, strength);
  },

  _removeWeatherField(volume) {
    const system = this._fieldsSystem();
    const fieldId = volume.field.id;
    const live = system && typeof system.hasExternal === 'function'
      ? system.hasExternal(fieldId)
      : this._weatherFieldStrength.has(fieldId);
    if (live && typeof system.unregisterExternal === 'function') {
      system.unregisterExternal(fieldId);
    }
    this._weatherFieldStrength.delete(fieldId);
  },

  _updateWeatherPlayerBoundary(volume, player, phase) {
    const inside = !!(phase.fieldActive && player && player.alive !== false
      && pointInsideWeatherVolume(volume, player.pos));
    const wasInside = this._weatherPlayerInside.has(volume.id);
    if (inside === wasInside) return;
    if (inside) this._weatherPlayerInside.add(volume.id);
    else this._weatherPlayerInside.delete(volume.id);
    this._emitHazardBoundary(inside, volume.hazardType, volume.id, volume.id, undefined, {
      remainingS: phase.remainingS,
      phase: phase.phase,
    });
  },

  _clearWeather(why) {
    for (const volume of WEATHER_VOLUMES) {
      this._removeWeatherField(volume);
      if (this._weatherPlayerInside.has(volume.id)) {
        this._emitHazardBoundary(false, volume.hazardType, volume.id, volume.id, why);
      }
    }
    this._weatherPlayerInside.clear();
    this._weatherFieldStrength.clear();
    this._weatherLastPhase.clear();
  },

  _clear(why) {
    if(['new_game','destroy','save_restoring','save_loaded','sector_exit'].includes(why))this._orchardEpoch=(this._orchardEpoch||0)+1;
    this._removeOrchardField();
    this._orchardLastPhase = null;
    this._clearWinnow();
    this._clearCinder(why);
    this._clearKillMachines(why);
    this._clearAperture(why);
    this._clearReef(why);
    this._clearWeather(why);
    this._clearMetronome(why);
    if (why === 'new_game' || why === 'destroy') {
      this._industryLedger = null;
      this._industrySiteResult = null;
      if (this._killCollateral) this._killCollateral.clear();
    }
    this._clearSettled = true;
  },
};

export default environmentalMachinery;
