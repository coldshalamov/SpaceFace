import { createCombatCatalog, ensureCombatant } from '../combat/runtime.js';
import { hasOrchardWorkDamage, orchardDamageUnavailable, orchardSavedDriveOffline } from '../combat/orchardWorkDamage.js';
let orchardCombatCatalog;
import { orchardWorkerWeather } from '../world/anvilOrchardWorkWeather.js';
import { validateOrchardTowQuote, ORCHARD_TOW_HOLDER } from '../world/anvilOrchardTowAssist.js';
// Stormshift's first normal shift, mixed into the existing traffic owner. The itinerary and
// cargoManifest are existing world-record fields. No private inventory or offscreen production.
// Mule gameplay stats remain canonical; the collector role selects its authored body.
// The receiving Mule is interim service hardware until the separate cradle integration.
import { ensurePhysicsBodySpec } from '../core/physicsAuthority.js';
import { occupantGenerationOf } from '../core/entity.js';
import { STORMSHIFT_COLLECTOR_COLLISION } from '../data/stormshiftCollectorCollision.js';
import { PLANET_SITE } from '../data/planets.js';
import { makeShipEntitySpec } from './ships.js';
import { stableRecordId, RECORD_KIND } from '../world/worldRecords.js';
import { indexedWorldRecordEntity, indexedShipLikeScan } from '../world/livingWorldViews.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { resolveCollisionProxyManifest, resolveCorridorAxisWorld, proxyScaleFor, proxyOuterRadiusWu, hullEnvelopeWu } from '../data/collisionProxyManifests.js';
// Match Flight V3's authored docking orbit, without importing its runtime owner
// into contact-hail data (which would cycle back through scanner). Parity is tested.
const BUYER_ORBIT_RADIUS_MULT = 1.3;

export const ANVIL_WORK = Object.freeze({ kind: 'anvil_work', capacity: 12, receiverCapacity: 48,
  serviceEntryHull: 0.5, serviceReleaseHull: 0.75, radius: 980, berthRadius: 2800, speed: 70, transferRange: 72, transferSpeed: 8, buyerId: 'station_tethys' });
const KIND = ANVIL_WORK.kind;
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const live = (state, e) => !!e && e.alive !== false && e.hull > 0 && state.entities.get(e.id) === e;
const itinerary = (e) => e?.data?.itinerary;
const used = (e) => Math.max(0, finite(e?.data?.cargoManifest?.totalQty));
const finitePose = e => [e?.pos?.x, e?.pos?.z, e?.vel?.x, e?.vel?.z].every(Number.isFinite);
function workerDriveReady(state, e) {
  const combat = state.combat?.entities?.[String(e.id)];
  const drive = combat?.subsystems?.subsystem_drive;
  return !orchardDamageUnavailable(state, e) && (combat || !orchardSavedDriveOffline(state, e)) && combat?.capabilities?.drive !== false && drive?.effectiveDisabled !== true && drive?.destroyed !== true;
}


export function anvilWorkerRecordId(state, role = 'collector') {
  return stableRecordId(state.meta?.seed || 1, PLANET_SITE.sectorId, RECORD_KIND.CONVOY, `anvil:shift:${role}`);
}
function validManifest(m, capacity) {
  if (!m || !Number.isSafeInteger(m.totalQty) || m.totalQty < 0 || m.totalQty > capacity
    || !Array.isArray(m.lines)) return false;
  let total = 0;
  for (const line of m.lines) {
    if (!line || typeof line !== 'object' || Array.isArray(line)
      || line.commodityId !== PLANET_SITE.harvest.commodityShallow
      || !Number.isSafeInteger(line.qty) || line.qty <= 0) return false;
    total += line.qty;
  }
  return total === m.totalQty;
}
function actor(owner, role) {
  const id = anvilWorkerRecordId(owner.state, role);
  // indexedWorldRecordEntity already falls back to the same population (entities map, then
  // entityList) with the identical predicate, so a second find here only duplicated the walk.
  const e = indexedWorldRecordEntity(owner.state, id);
  if (!live(owner.state, e) || e.data?.worldRecordId !== id || itinerary(e)?.kind !== KIND || itinerary(e)?.role !== role) return null;
  // Reject superseded objects and ambiguous same-record incarnations, rather than harvesting
  // into whichever duplicate happened to win the entity index.
  if (secondLiveWorldRecordCarrier(owner.state, id, e)) return null;
  return e;
}

// Read-only projection for the existing Hail/target surface, using the same actor
// identity and corridor decision as work. It grants no movement or cargo authority.
export function anvilCollectorWorkStatus(state, entity, { detail = false } = {}) {
  if (state?.mode !== 'flight' || state.world?.currentSectorId !== PLANET_SITE.sectorId
    || entity?.data?.worldRecordId !== anvilWorkerRecordId(state, 'collector')
    || actor({ state }, 'collector') !== entity || entity?.data?.jobId) return null;
  if (orchardDamageUnavailable(state, entity)) return 'STORMSHIFT · DAMAGE RECORD UNAVAILABLE · WORK HOLD';
  const route = itinerary(entity), center = route?.center;
  if (!center || ![center.x, center.z].every(Number.isFinite)) return null;
  if (route.serviceRequired === true || (entity.hull > 0 && entity.hull < entity.hullMax * ANVIL_WORK.serviceEntryHull)) {
    const receiver = actor({ state }, 'receiver');
    const retained = !receiver && retainedReceiver({ state });
    const away = (receiver && (!receiverAtHome(receiver) || receiver.data.jobId))
      || (retained && retained.itinerary.phase !== 'receiving');
    const held = route.phase === 'service_hold' || route.phase === 'berthed';
    const driveReady = workerDriveReady(state, entity);
    const hullPercent = Math.floor(100 * Math.max(0, Math.min(1, entity.hull / entity.hullMax)));
    const targetPercent = driveReady ? ANVIL_WORK.serviceReleaseHull * 100 : 100;
    const action = held
      ? `REPAIR HOLD · HULL ${hullPercent}% / ${targetPercent}%${driveReady ? '' : ' · DRIVE DISABLED'} · KEEP LINE TAUT`
      : 'INJURED · RETURNING FOR REPAIR';
    const status = `STORMSHIFT ${action}${!receiver && !retained ? ' · TENDER UNAVAILABLE' : away ? ' · TENDER AWAY' : ''}`;
    // Action names, not hardware keys: bindings remain the input owner's authority.
    // Only the full Hail reply teaches the sequence; target/work labels stay compact.
    return detail && held ? `${status}. Aim at this collector and attach Massline. Brake to keep the line taut. If slack, hold Massline + Reel In gently. Release the hold to keep the line; tap Massline separately to cut.` : status;
  }
  if (route.phase === 'berthed') {
    const receiver = actor({ state }, 'receiver');
    const retained = !receiver && retainedReceiver({ state });
    if ((receiver && (!receiverAtHome(receiver) || receiver.data.jobId))
      || (retained && retained.itinerary.phase !== 'receiving'))
      return 'STORMSHIFT HOLD · RECEIVING TENDER AWAY';
  }
  if (route.phase === 'outbound') {
    const weather = orchardWorkerWeather(state, entity, { x: center.x + ANVIL_WORK.radius, z: center.z });
    if (weather?.crossing && !weather.exposed) {
      return weather.phase === 'forecast' ? 'STORMSHIFT HOLD · LOCAL GUST FORECAST'
        : 'STORMSHIFT HOLD · LOCAL GUST';
    }
    return 'STORMSHIFT · OUTBOUND TO SHALLOW HARVEST';
  }
  if (route.phase === 'clear_band') {
    const weather = orchardWorkerWeather(state, entity, entity.pos);
    if (weather?.exposed) return weather.phase === 'forecast'
      ? 'STORMSHIFT · CLEARING FORECAST GUST CORRIDOR' : 'STORMSHIFT · CLEARING GUST CORRIDOR';
    return 'STORMSHIFT · CLEARING BAND';
  }
  return ({ collect: 'STORMSHIFT · COLLECTING SHALLOW GAS',
    return: 'STORMSHIFT · RETURNING TO RECEIVING TENDER',
    berthed: 'STORMSHIFT · AT RECEIVING BERTH' })[route.phase] || null;
}

export function anvilReceiverWorkStatus(state, entity) {
  if (state?.mode !== 'flight' || state.world?.currentSectorId !== PLANET_SITE.sectorId
    || entity?.data?.worldRecordId !== anvilWorkerRecordId(state, 'receiver')
    || actor({ state }, 'receiver') !== entity || entity.data.jobId) return null;
  if (orchardDamageUnavailable(state, entity)) return 'STORMSHIFT · DAMAGE RECORD UNAVAILABLE · WORK HOLD';
  if (!workerDriveReady(state, entity)) {
    const hullPercent = Math.floor(100 * Math.max(0, Math.min(1, entity.hull / entity.hullMax)));
    return `STORMSHIFT · DRIVE OFFLINE · ${used(entity)} GAS HELD · HULL ${hullPercent}% / 100% · REPAIR LINE TAUT`;
  }
  if (itinerary(entity)?.phase === 'return_berth' && itinerary(entity).interruption === 'empty_load')
    return 'STORMSHIFT · EMPTY HOLD · RETURNING TO COLLECTOR BERTH';
  return ({ receiving: 'STORMSHIFT · RECEIVING SHALLOW GAS',
    delivery: 'STORMSHIFT · GAS ABOARD · TETHYS TRADE HUB',
    return_berth: 'STORMSHIFT · RETURNING TO COLLECTOR BERTH' })[itinerary(entity)?.phase] || null;
}
function homeBerth(route) {
  const c = route?.center;
  return c && Number.isFinite(c.x) && Number.isFinite(c.z)
    ? { x: c.x + ANVIL_WORK.berthRadius, z: c.z } : null;
}
function receiverAtHome(receiver) {
  const home = homeBerth(itinerary(receiver));
  return !!home && itinerary(receiver).phase === 'receiving'
    && Math.hypot(receiver.pos.x - home.x, receiver.pos.z - home.z) <= ANVIL_WORK.transferRange;
}
// The inner service point keeps the next inward departure away from the tender.
// Outer-side arrivals first clear a lateral lane; never cut a chord through its hull.
export function anvilServicePoint(receiver) {
  const center = itinerary(receiver)?.center;
  if (!center || !finitePose(receiver)) return null;
  const dx = receiver.pos.x - center.x, dz = receiver.pos.z - center.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) return null;
  return { x: receiver.pos.x - dx / length * 60, z: receiver.pos.z - dz / length * 60 };
}
function serviceReady(e, receiver) {
  const point = anvilServicePoint(receiver);
  return !!point && finitePose(e)
    && Math.hypot(e.pos.x - point.x, e.pos.z - point.z) <= 12
    && Math.hypot(e.vel.x - receiver.vel.x, e.vel.z - receiver.vel.z) <= ANVIL_WORK.transferSpeed;
}
function steerService(owner, e, receiver) {
  const point = anvilServicePoint(receiver);
  if (!point || !finitePose(e)) { hold(e); return; }
  const ux = (receiver.pos.x - point.x) / 60, uz = (receiver.pos.z - point.z) / 60;
  const dx = e.pos.x - receiver.pos.x, dz = e.pos.z - receiver.pos.z;
  const outward = dx * ux + dz * uz, side = -dx * uz + dz * ux;
  let target = point;
  if (outward > -48) {
    const lateral = (side < 0 ? -1 : 1) * 160;
    // Preserve the current radial coordinate while clearing sideways, including
    // partially inward old saves. Forcing it outward would cross the tender.
    const radial = Math.abs(side) < 120 ? outward : -60;
    target = { x: receiver.pos.x + ux * radial - uz * lateral,
      z: receiver.pos.z + uz * radial + ux * lateral };
  }
  steer(owner, e, target, 12, 20);
}
// Use the buyer's existing authored exterior corridor mouth, not a centre-radius
// approach that crosses its station billboard. A physically settled ingress uses
// the existing orbit radius before the clear chord to that authored mouth.
export function anvilBuyerApproach(receiver, station) {
  const center = itinerary(receiver)?.center;
  const proxy = resolveCollisionProxyManifest(station);
  if (!center || !station?.pos || !proxy?.docking) return null;
  const axis = resolveCorridorAxisWorld(station, proxy);
  const radius = proxy.docking.corridor.mouthRadius * proxyScaleFor(station, proxy);
  const target = { x: station.pos.x + axis.x * radius, z: station.pos.z + axis.z * radius };
  return Math.hypot(target.x - center.x, target.z - center.z) > PLANET_SITE.bands.influence ? target : null;
}
export function anvilBuyerIngress(receiver, station) {
  const proxy = resolveCollisionProxyManifest(station);
  if (!proxy?.docking) return null;
  const axis = resolveCorridorAxisWorld(station, proxy), center = itinerary(receiver)?.center;
  if (!center) return null;
  let nx = -axis.z, nz = axis.x;
  if (nx * (station.pos.x - center.x) + nz * (station.pos.z - center.z) < 0) { nx = -nx; nz = -nz; }
  const radius = proxy.docking.corridor.mouthRadius * proxyScaleFor(station, proxy) * BUYER_ORBIT_RADIUS_MULT;
  return { x: station.pos.x + nx * radius, z: station.pos.z + nz * radius };
}
function inBuyerForecourt(receiver, station) {
  const route = itinerary(receiver);
  // Only a reached service chord (or an old accepted-return record without that
  // marker) can require reversing it. Proximity alone is not route authority.
  if (route?.buyerIngressReached !== true
    && !(route?.buyerIngressReached == null && route?.deliveredQty > 0)) return false;
  const ingress = station && anvilBuyerIngress(receiver, station);
  // The existing corridor orbit plus the accepted mouth handoff's32 WU envelope.
  // This migrates only nearby old return saves; a far tender never flies back here.
  return !!ingress && Math.hypot(receiver.pos.x - station.pos.x, receiver.pos.z - station.pos.z)
    <= Math.hypot(ingress.x - station.pos.x, ingress.z - station.pos.z) + 32;
}
function steerOutsideBand(owner, e, target, reach = 24, speed = ANVIL_WORK.speed, radius = ANVIL_WORK.berthRadius, terminalSpeed = speed) {
  const center = itinerary(e).center;
  const angle = Math.atan2(e.pos.z - center.z, e.pos.x - center.x);
  const targetAngle = Math.atan2(target.z - center.z, target.x - center.x);
  const delta = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));
  // Follow a broad outer arc whenever a direct route would cross the occupied bands.
  // Both directions use ordinary Flight V3 and the same planetary fields as the player.
  if (Math.abs(delta) > 0.35) {
    const next = angle + Math.sign(delta) * 0.22;
    steer(owner, e, { x: center.x + Math.cos(next) * radius,
      z: center.z + Math.sin(next) * radius }, 0, speed);
    return false;
  }
  return steer(owner, e, target, reach, terminalSpeed);
}

function retainedReceiver(owner) {
  const state = owner.state, id = anvilWorkerRecordId(state, 'receiver');
  // Residency may shelf a healthy tender while the collector is still local. Its retained
  // record preserves cargo and availability only; custody still requires the live actor.
  const resident = indexedWorldRecordEntity(state, id);
  if (resident && resident.alive !== false && state.entities.get(resident.id) === resident) return null;
  const rec = state.world?.records?.byId?.[id];
  if (!rec || rec.recordId !== id || rec.kind !== RECORD_KIND.CONVOY
    || rec.sectorId !== PLANET_SITE.sectorId || rec.shipDefId !== 'ship_mule'
    || rec.alive !== true || !(rec.hull > 0) || rec.jobId
    || rec.itinerary?.kind !== KIND || rec.itinerary.role !== 'receiver'
    || !Number.isFinite(rec.pos?.x) || !Number.isFinite(rec.pos?.z)
    || !validManifest(rec.cargoManifest, ANVIL_WORK.receiverCapacity)) return null;
  return rec;
}

/**
 * True when another LIVE entity besides `except` carries the same worldRecordId — the
 * ambiguity verdict actor() rejects on. The entity index's `byWorldRecordIdCount`
 * (coreSystem append/remove bookkeeping) answers "no second carrier" in O(1): every
 * stamp site registers, so count <= 1 proves uniqueness the same way mining's
 * claim-jump resolution reads it. Count > 1 still walks the full list — the walk is
 * live-only and a soft-dead carrier (alive=false before index removal) keeps its
 * count slot, so the old verdict must stay exact exactly when the count is stale.
 * No ready index/count map: the walk is the authority, as before.
 */
export function secondLiveWorldRecordCarrier(state, worldRecordId, exceptEntity) {
  if (worldRecordId == null) return false;
  const list = state && state.entityList;
  if (!Array.isArray(list)) return false;
  const index = state.entityIndex;
  const counted = index && index.__spacefaceEntityIndexV1 === true && index.ready === true
    && index.byWorldRecordIdCount instanceof Map
    ? (index.byWorldRecordIdCount.get(worldRecordId) || 0)
    : null;
  if (counted != null && counted <= 1) return false;
  for (let i = 0; i < list.length; i++) {
    const other = list[i];
    if (other === exceptEntity || other?.alive === false) continue;
    if (other?.data?.worldRecordId === worldRecordId) return true;
  }
  return false;
}
function bindCollectorCollision(e) {
  if (e.physicsBody?.collisionProxyManifest?.id === STORMSHIFT_COLLECTOR_COLLISION.id) return;
  const body = ensurePhysicsBodySpec(e);
  e.physicsBody = { ...body, collisionProxyManifest: STORMSHIFT_COLLECTOR_COLLISION,
    revision: Math.max(0, finite(e.physicsBody?.revision)) + 1 };
}
function persist(owner, e) { owner._registry?.get?.('world')?.upsertWorldRecord?.(e); }
function recFor(owner, e) { return owner.state.traffic?.freighters?.find(r => r.id === e.id) || null; }
function bindWorkerIdentity(owner, e, role) {
  if (!e || actor(owner, role) !== e) return;
  // World residency keeps the stable actor and itinerary, but its compact data need
  // not retain presentation names or the newly adopted traffic row's stable key.
  // Rebind this original authored identity before existing violence/spill readers run.
  const name = role === 'collector' ? 'Stormshift Collector' : 'Stormshift Receiving Tender';
  e.data.name = name; e.data.named = true; e.data.trafficLabel = name;
  const rec = recFor(owner, e);
  if (rec) rec.worldRecordId = e.data.worldRecordId;
}
function hold(e) {
  e.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null,
    aimAngle: finite(e.rot), brake: true };
}
// Civilian work owns its intent instead of the combat maneuver planner. Yield to a
// physically converging ship, regardless of faction/target, using current motion.
// This is a bounded braking decision, not collision immunity or a route planner.
function trafficHullEnvelope(e) {
  const proxy = resolveCollisionProxyManifest(e);
  return Math.max(hullEnvelopeWu(e), proxy ? proxyOuterRadiusWu(proxy, e) : 0);
}
export function anvilTrafficYield(state, worker) {
  if (!finitePose(worker)) return null;
  const ownRadius = trafficHullEnvelope(worker);
  const propulsion = resolvePropulsionProfile(worker, state);
  const horizon = Math.min(4, 0.75 + Math.hypot(worker.vel.x, worker.vel.z)
    / Math.max(1, finite(propulsion.reverseAccel)));
  let nearest = null;
  for (const other of indexedShipLikeScan(state)) {
    if (other === worker || other.type !== 'ship' || !live(state, other)
      || other.collides === false || !finitePose(other)) continue;
    const dx = other.pos.x - worker.pos.x, dz = other.pos.z - worker.pos.z;
    const vx = other.vel.x - worker.vel.x, vz = other.vel.z - worker.vel.z;
    const closing = dx * vx + dz * vz, speed2 = vx * vx + vz * vz;
    if (closing >= 0 || speed2 < 0.01) continue; // separating/parallel ships do not hold the lane
    const t = -closing / speed2;
    const clearance = ownRadius + trafficHullEnvelope(other) + 12;
    const miss2 = (dx + vx * t) ** 2 + (dz + vz * t) ** 2;
    if (miss2 >= clearance * clearance) continue;
    // First envelope entry, not just closest approach: a long hull may arrive
    // during stopping while its center's closest approach is still further away.
    const entry = Math.max(0, t - Math.sqrt((clearance * clearance - miss2) / speed2));
    if (entry > horizon) continue;
    if (!nearest || entry < nearest.timeToEntry) nearest = { targetId: other.id,
      timeToEntry: entry, timeToClosest: t, clearance };
  }
  return nearest;
}
function counterFieldThrottle(owner, e, p) {
  const accel = owner._registry?.get?.('fields')?.readAcceptedFieldAcceleration?.(e,
    owner._anvilFieldAccel ||= { ax: 0, az: 0 });
  if (!accel) return 0;
  const rot = finite(e.rot);
  return Math.max(0, -accel.ax * Math.cos(rot) - accel.az * Math.sin(rot))
    / Math.max(1, finite(p.mainAccel));
}
// Uses Flight V3's civilian intent, never writes velocity/position. Arrive is speed-limited
// with the same braking-distance contract as the existing Helios ore-carrier approach.
function steer(owner, e, target, reach = 24, speed = ANVIL_WORK.speed) {
  if (anvilTrafficYield(owner.state, e)) { hold(e); return false; }
  const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
  const distance = Math.hypot(dx, dz), aim = Math.atan2(dz, dx);
  const p = resolvePropulsionProfile(e, owner.state);
  const accel = Math.max(1, p.reverseAccel || 0, (p.mainAccel || 0) * 0.72);
  const closing = Math.max(0, (finite(e.vel?.x) * dx + finite(e.vel?.z) * dz) / Math.max(1, distance));
  const desired = Math.min(speed, Math.max(0, distance - reach) * 0.4,
    Math.sqrt(2 * accel * Math.max(0, distance - reach)));
  const brake = distance <= reach || Math.cos(aim - finite(e.rot)) < 0.85
    || Math.hypot(finite(e.vel?.x), finite(e.vel?.z)) > desired + 3
    || closing * closing / (2 * accel) >= distance - reach;
  const governedSpeed = Math.max(1, p.combatSpeed || e.maxSpeed || 100);
  // A speed fraction also limits main-thruster force. Counter the last accepted opposing
  // field force, retaining the authored speed and brakes; fields owns upcoming admission.
  e.data.intent = { moveX: 0, moveZ: brake ? 0 : Math.min(1,
    Math.max((p.assist?.deadInput || 0.025) + 0.001, desired / governedSpeed)
      + counterFieldThrottle(owner, e, p)),
  boost: false, fire: false, fireGroup: null, aimAngle: aim, brake };
  return distance <= reach;
}
function manifest(owner, e, qty, prior = null) {
  const next = owner._buildMinerManifest(e, itinerary(e).sequence, PLANET_SITE.harvest.commodityShallow, qty);
  next.lotId = prior?.lotId || `lot:${e.data.worldRecordId}:${itinerary(e).sequence}`;
  next.custody = { holderKind: 'traffic', holderId: e.data.worldRecordId, acquiredBy: 'planet:npcHarvest' };
  return next;
}

export const anvilTrafficMethods = {
  requestOrchardTowAssist(worker, quote) {
    if (actor(this,'receiver') !== worker || worker.data.jobId
      || this.state.npcJobs?.byId?.[`job:${worker.data.worldRecordId}`]) return { granted:false, reason:'crew_busy' };
    const physics=this._registry?.get?.('physics'), jobs=this._registry?.get?.('npcJobsRuntime');
    const pod=validateOrchardTowQuote(this.state,worker,quote,physics);
    if (!pod || !jobs?.assign || !jobs?.requestTowAssist) return { granted:false, reason:'orchard_quote_expired' };
    if (!(this.state.player?.credits >= quote.feeCr)) return { granted:false, reason:'insufficient_credits' };
    const pos={x:worker.pos.x,z:worker.pos.z};
    const jobId=jobs.assign(worker,{kind:'tender',sectorId:PLANET_SITE.sectorId,
      route:[{id:'orchard-berth',pos},{id:'orchard-service',pos:{...pos}}]});
    if(!jobId)return {granted:false,reason:'no_job'};
    const entry=this.state.npcJobs?.byId?.[jobId];
    entry.orchardAssist=true;entry.orchardWorkerRef=worker;entry.orchardWorkerLife=worker.occupantGeneration;
    const result=jobs.requestTowAssist(worker.id,pod.id,quote.destination,{holder:ORCHARD_TOW_HOLDER,
      claimId:`orchard-tow:${quote.lotId}:${quote.targetGeneration}`,feeCr:quote.feeCr,
      deliverW:quote.deliverW,orchardQuote:quote});
    if(!result?.granted)jobs.release(jobId);
    persist(this,worker);
    return result || {granted:false,reason:'crew_unavailable'};
  },

  ensureAnvilWorker(state, spawnEntity, center) {
    if (state !== this.state || state.world?.currentSectorId !== PLANET_SITE.sectorId) return null;
    this._ensureState();
    for (const role of ['collector', 'receiver']) {
      let e = actor(this, role);
      const recordId = anvilWorkerRecordId(state, role);
      if (!e) {
        // A stored body, including a dead one, belongs to world residency. Never replace it.
        if (state.world?.records?.byId?.[recordId]) continue;
        if (state.entityList?.some(row => row?.data?.worldRecordId === recordId)) continue;
        const pos = { x: center.x + ANVIL_WORK.berthRadius - (role === 'collector' ? 100 : 0), z: center.z };
        // Adopt the old witness if a live route already registered one before this owner loaded.
        e = role === 'collector' ? state.entityList?.find(row => live(state, row)
          && row.data?.anvilSlingWitness === true && !row.data.worldRecordId) : null;
        if (!e) {
          const spec = makeShipEntitySpec('ship_mule', { team: 2, factionId: 'faction_mts', pos,
            rot: role === 'collector' ? Math.PI : 0, ai: { passive: true, archetype: 'passive' } });
          spec.vel = { x: 0, z: 0 };
          e = spawnEntity(spec);
        }
        if (!e) continue;
        Object.assign(e.data, { worldRecordId: recordId, named: true,
          name: role === 'collector' ? 'Stormshift Collector' : 'Stormshift Receiving Tender',
          itinerary: { kind: KIND, role, phase: role === 'collector' ? 'outbound' : 'receiving',
            sequence: 0, center: { ...center }, deliveredQty: 0 }, durable: true });
        this._stampTrafficDurableIdentity(e, PLANET_SITE.sectorId, role === 'collector' ? 'stormshift_collector' : 'hauler', { label: e.data.name }, 0);
        this._setTrafficManifest(e, null, manifest(this, e, 0));
        persist(this, e);
      }
      e.data.anvilSlingWitness = role === 'collector';
      if (role === 'collector') bindCollectorCollision(e);
      if (!recFor(this, e)) {
        state.traffic.freighters.push({ id: e.id, role: e.data.trafficRole, manifest: e.data.cargoManifest, dockSeq: 0 });
        this._active.push(e.id);
      }
      bindWorkerIdentity(this, e, role);
    }
    return actor(this, 'collector');
  },

  acceptAnvilHarvest(e, { siteId, commodityId, qty } = {}) {
    if (actor(this, 'collector') !== e || itinerary(e).phase !== 'collect'
      || siteId !== PLANET_SITE.id || commodityId !== PLANET_SITE.harvest.commodityShallow
      || !Number.isSafeInteger(qty) || qty <= 0
      || !validManifest(e?.data?.cargoManifest, ANVIL_WORK.capacity)) return 0;
    const amount = Math.min(qty, Math.max(0, ANVIL_WORK.capacity - used(e)));
    if (!amount) return 0;
    this._setTrafficManifest(e, recFor(this, e), manifest(this, e, used(e) + amount, used(e) > 0 ? e.data.cargoManifest : null));
    persist(this, e);
    return amount;
  },

  _transferAnvilLoad(e, receiver) {
    if (actor(this, 'collector') !== e || actor(this, 'receiver') !== receiver
      || orchardDamageUnavailable(this.state, e) || orchardDamageUnavailable(this.state, receiver)
      || itinerary(e).phase !== 'return' || e.data.jobId || receiver.data.jobId
      || !receiverAtHome(receiver) || !serviceReady(e, receiver)
      || !validManifest(e?.data?.cargoManifest, ANVIL_WORK.capacity)
      || !validManifest(receiver?.data?.cargoManifest, ANVIL_WORK.receiverCapacity)) return 0;
    const distance = Math.hypot(e.pos.x - receiver.pos.x, e.pos.z - receiver.pos.z);
    const relativeSpeed = Math.hypot(finite(e.vel?.x) - finite(receiver.vel?.x), finite(e.vel?.z) - finite(receiver.vel?.z));
    if (distance > ANVIL_WORK.transferRange || relativeSpeed > ANVIL_WORK.transferSpeed) return 0;
    const source = e.data.cargoManifest, target = receiver.data.cargoManifest;
    const amount = Math.min(used(e), Math.max(0, ANVIL_WORK.receiverCapacity - used(receiver)));
    if (!(amount > 0)) return 0;
    // Synchronous manifest writes commit custody before any event can re-enter this transfer.
    this._setTrafficManifest(e, recFor(this, e), manifest(this, e, used(e) - amount, source));
    const received = manifest(this, receiver, used(receiver) + amount, used(receiver) > 0 ? target : null);
    received.custody.acquiredBy = 'traffic:anvilTransfer';
    this._setTrafficManifest(receiver, recFor(this, receiver), received);
    itinerary(e).deliveredQty += amount;
    if (!used(e)) { itinerary(e).phase = 'berthed'; itinerary(e).sequence++; }
    persist(this, e); persist(this, receiver);
    this.bus.emit('traffic:anvilTransfer', { sourceId: e.id, receiverId: receiver.id,
      commodityId: PLANET_SITE.harvest.commodityShallow, qty: amount, lotId: source.lotId });
    return amount;
  },

  _deliverAnvilReceiver(receiver, station) {
    if (actor(this, 'receiver') !== receiver || receiver.data.jobId
      || orchardDamageUnavailable(this.state, receiver)
      || itinerary(receiver).phase !== 'delivery' || !live(this.state, station)
      || station.type !== 'station' || station.data?.stationId !== ANVIL_WORK.buyerId
      || !validManifest(receiver.data.cargoManifest, ANVIL_WORK.receiverCapacity)) return false;
    const target = anvilBuyerApproach(receiver, station);
    if (!target || !finitePose(receiver) || !finitePose(station)
      || Math.hypot(receiver.pos.x - target.x, receiver.pos.z - target.z) > 32
      || Math.hypot(finite(receiver.vel?.x) - finite(station.vel?.x),
        finite(receiver.vel?.z) - finite(station.vel?.z)) > ANVIL_WORK.transferSpeed) return false;
    const stationPos = { ...station.pos }, stationGeneration = occupantGenerationOf(station);
    const source = receiver.data.cargoManifest, qty = source.totalQty, route = itinerary(receiver);
    if (!(qty > 0) || !Number.isSafeInteger(route.sequence) || route.sequence < 0) return false;
    const economy = this._registry?.get?.('economy');
    if (typeof economy?.applyFreightDelivery !== 'function') return false;
    const receiptId = `anvil-delivery:${receiver.data.worldRecordId}:${route.sequence}`;
    const run = this.state.traffic, offered = JSON.stringify(source), generation = occupantGenerationOf(receiver);
    let committed = false;
    const payload = { receiptId, stationId: ANVIL_WORK.buyerId,
      commodityId: PLANET_SITE.harvest.commodityShallow, qty, source: 'anvil_work' };
    Object.defineProperty(payload, 'commitCustody', { value: result => {
      const currentApproach = anvilBuyerApproach(receiver, station);
      if (committed || this.state.traffic !== run || actor(this, 'receiver') !== receiver
        || occupantGenerationOf(receiver) !== generation || receiver.data.jobId
        || orchardDamageUnavailable(this.state, receiver)
        || itinerary(receiver) !== route || route.phase !== 'delivery'
        || receiver.data.cargoManifest !== source || JSON.stringify(source) !== offered
        || !finitePose(receiver) || !finitePose(station)
        || !live(this.state, station) || station.type !== 'station'
        || station.data?.stationId !== ANVIL_WORK.buyerId
        || !currentApproach || currentApproach.x !== target.x || currentApproach.z !== target.z
        || occupantGenerationOf(station) !== stationGeneration
        || station.pos.x !== stationPos.x || station.pos.z !== stationPos.z
        || this.state.world?.currentSectorId !== PLANET_SITE.sectorId
        || Math.hypot(receiver.pos.x - target.x, receiver.pos.z - target.z) > 32
        || Math.hypot(finite(receiver.vel?.x) - finite(station.vel?.x),
          finite(receiver.vel?.z) - finite(station.vel?.z)) > ANVIL_WORK.transferSpeed
        || !result?.ok || result.receiptId !== receiptId
        || result.stationId !== ANVIL_WORK.buyerId || result.commodityId !== payload.commodityId
        || result.qty !== qty || result.acceptedLines?.length !== 1
        || result.acceptedLines[0].commodityId !== payload.commodityId
        || result.acceptedLines[0].qty !== qty) return false;
      // Same traffic manifest owner as harvesting/transfer; no payout or replacement lot.
      const rec = recFor(this, receiver), previousTracked = rec?.manifest;
      const next = manifest(this, receiver, 0);
      try {
        if (this._setTrafficManifest(receiver, rec, next) !== true) throw new Error('manifest_refused');
      } catch {
        receiver.data.cargoManifest = source;
        if (rec) rec.manifest = previousTracked;
        return false;
      }
      route.sequence++; route.deliveredQty = Math.max(0, finite(route.deliveredQty)) + qty;
      route.destinationStationId = null; route.buyerExitRequired = true;
      route.phase = 'return_berth';
      committed = true;
      return true;
    } });
    try { economy.applyFreightDelivery(payload); } catch {
      // A failed custody callback leaves the hold intact. An observer throwing after
      // settlement cannot restore already accepted cargo or repeat its stock effect.
    }
    // Receipt/stock are committed before persistence can notify or fail. Save captures
    // the live manifest; a persistence failure must not resurrect accepted goods.
    if (committed) { try { persist(this, receiver); } catch { /* next capture retries */ } }
    return committed;
  },

  _stepAnvilReceiver(receiver) {
    if (actor(this, 'receiver') !== receiver || !receiver || receiver.data.jobId) return;
    if (!this.state.combat?.entities?.[receiver.id] && hasOrchardWorkDamage(this.state, receiver))
      ensureCombatant(this.state, receiver, orchardCombatCatalog ||= createCombatCatalog());
    const route = itinerary(receiver), home = homeBerth(route);
    if (!home || !finitePose(receiver) || !validManifest(receiver.data.cargoManifest, ANVIL_WORK.receiverCapacity)) { hold(receiver); return; }
    const station = this._sectorStations().find(e => live(this.state, e)
      && e.data?.stationId === ANVIL_WORK.buyerId);
    // Loss of real propulsion pauses movement, not ownership or intake. A settled
    // disabled tender can still accept cargo, or unload at the existing buyer;
    // neither operation requires thrust. Keep the exact route for genuine repair.
    // No hull threshold, invented intake subsystem, offscreen repair or replacement.
    if (!workerDriveReady(this.state, receiver)) {
      hold(receiver);
      if (!orchardDamageUnavailable(this.state, receiver) && route.phase === 'delivery' && station) this._deliverAnvilReceiver(receiver, station);
      return;
    }
    const approach = station && anvilBuyerApproach(receiver, station);
    const transitRadius = approach ? Math.max(ANVIL_WORK.berthRadius,
      Math.hypot(approach.x - route.center.x, approach.z - route.center.z) + 100) : ANVIL_WORK.berthRadius;
    if (route.phase === 'receiving') {
      // The first finished handoff is a real load, not a clock or fabricated convoy.
      if (!used(receiver) || !station) { steer(this, receiver, home, 8, 20); return; }
      route.phase = 'delivery'; route.destinationStationId = ANVIL_WORK.buyerId;
      route.buyerIngressReached = false; route.buyerExitRequired = false; route.interruption = null; persist(this, receiver);
    }
    if (route.phase === 'delivery' && route.destinationStationId !== ANVIL_WORK.buyerId) {
      route.destinationStationId = ANVIL_WORK.buyerId; persist(this, receiver);
    }
    if (route.phase === 'delivery' && !used(receiver)) {
      // Existing combat/panic jettison owns any lost cargo and its physical pod.
      // An empty trip earns no receipt, stock or delivered quantity. Retire its
      // generation once, then return under the same physical steering as a sale.
      route.sequence++; route.phase = 'return_berth';
      route.destinationStationId = null; route.interruption = 'empty_load';
      route.buyerExitRequired = inBuyerForecourt(receiver, station);
      persist(this, receiver);
    }
    if (route.phase === 'delivery') {
      const target = approach;
      if (!target) { hold(receiver); return; }
      if (!route.buyerIngressReached) {
        const ingress = anvilBuyerIngress(receiver, station);
        // Slow at the outer-arc handover, well before the authored forecourt: carrying
        // 55 WU/s into a tight ingress arrival swept west through the Parts Rack.
        // Settle at the outward side of the authored station orbit before its moving
        // mouth approach takes over. Carrying planet-arc tangential speed through
        // the forecourt cut its billboard; the orbit carrot also crossed its Parts Rack.
        // This settled ingress-to-mouth chord clears both real authored fixtures.
        if (steerOutsideBand(this, receiver, ingress, 8, 55, transitRadius, 20)
          && Math.hypot(receiver.vel.x, receiver.vel.z) <= ANVIL_WORK.transferSpeed) {
          route.buyerIngressReached = true; persist(this, receiver);
        }
        return;
      }
      steer(this, receiver, target, 20, 35);
      this._deliverAnvilReceiver(receiver, station);
      return;
    }
    if (route.phase === 'return_berth') {
      if (typeof route.buyerExitRequired !== 'boolean') {
        route.buyerExitRequired = inBuyerForecourt(receiver, station); persist(this, receiver);
      }
      if (route.buyerExitRequired) {
        const exit = station && anvilBuyerIngress(receiver, station);
        if (!exit) { hold(receiver); return; }
        // Reverse the clear service chord and physically settle outside the station
        // before joining the original district orbit. No station-body shortcut.
        if (steer(this, receiver, exit, 8, 20)
          && Math.hypot(receiver.vel.x, receiver.vel.z) <= ANVIL_WORK.transferSpeed) {
          route.buyerExitRequired = false; persist(this, receiver);
        }
        return;
      }
      // Station approach radius is not a safe planet-wide lane: its tracking sweep
      // clips Nereid's gate. Use the authored2800 work orbit after clearing forecourt.
      if (steerOutsideBand(this, receiver, home, 20, 35, ANVIL_WORK.berthRadius, 55)
        && Math.hypot(finite(receiver.vel?.x), finite(receiver.vel?.z)) <= ANVIL_WORK.transferSpeed) {
        route.phase = 'receiving'; persist(this, receiver);
      }
      return;
    }
    hold(receiver);
  },

  _stepAnvilWork(dt, state) {
    if (!(dt > 0) || state.world?.currentSectorId !== PLANET_SITE.sectorId) return;
    const e = actor(this, 'collector'), receiver = actor(this, 'receiver');
    bindWorkerIdentity(this, e, 'collector'); bindWorkerIdentity(this, receiver, 'receiver');
    this._stepAnvilReceiver(receiver);
    if (!e || e.data.jobId) return; // another existing movement owner wins
    if (orchardDamageUnavailable(state, e)) { hold(e); return; }
    if (!state.combat?.entities?.[e.id] && hasOrchardWorkDamage(state, e))
      ensureCombatant(state, e, orchardCombatCatalog ||= createCombatCatalog());
    e.data.anvilSlingWitness = true;
    bindCollectorCollision(e);
    if (state.planet?.active) {
      state.planet.witnessId = e.id;
      state.planet.witnessGeneration = occupantGenerationOf(e);
    }
    const route = itinerary(e), center = route.center;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) { hold(e); return; }
    // Existing latch repair alone changes hull. This itinerary latch only controls
    // when the same injured worker may leave for another shift; it grants no healing.
    if ((e.hull < e.hullMax * ANVIL_WORK.serviceEntryHull || route.phase === 'service_hold') && route.serviceRequired !== true) {
      route.serviceRequired = true; persist(this, e);
    }
    if (route.serviceRequired === true && e.hull >= e.hullMax * ANVIL_WORK.serviceReleaseHull
      && workerDriveReady(state, e)) {
      route.serviceRequired = false;
      if (route.phase === 'service_hold') route.phase = 'berthed';
      persist(this, e);
    }
    if (route.serviceRequired === true && route.phase === 'berthed') {
      route.phase = 'service_hold'; persist(this, e);
    }
    if (route.serviceRequired === true && route.phase === 'outbound') {
      route.phase = 'clear_band'; persist(this, e);
    }
    const availableReceiver = receiver && receiverAtHome(receiver) && !receiver.data.jobId ? receiver : null;
    const retained = !receiver && retainedReceiver(this);
    const berth = availableReceiver || ((receiver || retained)
      ? { pos: homeBerth(route), cargoManifest: (receiver?.data || retained).cargoManifest } : null);
    if (!berth) { hold(e); return; } // retain finite cargo if berth was destroyed or removed
    if (route.phase === 'service_hold') {
      // The existing exterior lay-by stays clear of the receiving approach even
      // while the tender is absent. Arrive through ordinary thrust and brakes.
      const home = homeBerth(route);
      // From the inner service point, first clear laterally. A direct diagonal
      // to the outer lay-by would cross the original tender's envelope.
      const target = e.pos.z < home.z + 120 && e.pos.x < home.x + 60
        ? { x: Math.min(e.pos.x, home.x - 60), z: home.z + 160 }
        : { x: home.x + 180, z: home.z + 160 };
      steer(this, e, target, 20, 20);
      return;
    }
    const heat = state.planet?.ships?.[e.id]?.heat || 0;
    if (route.phase === 'berthed') {
      if (!availableReceiver) {
        // Clear the receiving approach while the same tender makes its buyer leg.
        // This exterior lay-by is reached with ordinary thrust, not a parking snap.
        const home = homeBerth(route);
        steer(this, e, { x: home.x + 180, z: home.z + 160 }, 20, 35);
        return;
      }
      const receivedQty = receiver ? used(receiver) : berth.cargoManifest.totalQty;
      if (receivedQty >= ANVIL_WORK.receiverCapacity || heat > 0.1) { hold(e); return; }
      if (!serviceReady(e, availableReceiver)) { steerService(this, e, availableReceiver); return; }
      route.phase = 'outbound';
    }
    if (route.phase === 'outbound') {
      const target = { x: center.x + ANVIL_WORK.radius, z: center.z };
      const weather = orchardWorkerWeather(state, e, target);
      if (weather?.exposed) {
        // Never wait inside the local gust. Clear the band through the existing
        // physical return route, retaining the same finite load and actor.
        route.phase = 'clear_band'; persist(this, e);
      } else if (weather?.crossing) {
        hold(e); return; // a safe worker waits for this corridor, not a global storm
      }
      if (route.phase === 'outbound' && steer(this, e, target, 25, 55)) {
        route.phase = 'collect'; persist(this, e);
      }
      if (route.phase === 'outbound' || route.phase === 'collect') return;
    }
    if (route.phase === 'collect') {
      // Work clockwise through the open shallow band, away from the authored Dione gate.
      // The identical target drives both local weather lookahead and physical steering.
      const angle = Math.atan2(e.pos.z - center.z, e.pos.x - center.x) - 0.22;
      const target = { x: center.x + Math.cos(angle) * ANVIL_WORK.radius,
        z: center.z + Math.sin(angle) * ANVIL_WORK.radius };
      if (orchardWorkerWeather(state, e, target) || used(e) >= ANVIL_WORK.capacity
        || heat >= 0.58 || e.hull < e.hullMax * 0.5) {
        route.phase = 'clear_band'; persist(this, e);
      } else {
        steer(this, e, target, 0);
        return;
      }
    }
    if (route.phase === 'clear_band') {
      const angle = Math.atan2(e.pos.z - center.z, e.pos.x - center.x);
      if (steer(this, e, { x: center.x + Math.cos(angle) * ANVIL_WORK.berthRadius,
        z: center.z + Math.sin(angle) * ANVIL_WORK.berthRadius }, 40)) {
        route.phase = 'return'; persist(this, e);
      }
      return;
    }
    if (route.phase === 'return') {
      // Follow the outer arc until the receiver's radial approach is safe. A direct chord
      // across the opposite limb would cut through the planet rather than return a load.
      const angle = Math.atan2(e.pos.z - center.z, e.pos.x - center.x);
      const targetAngle = Math.atan2(berth.pos.z - center.z, berth.pos.x - center.x);
      const delta = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));
      if (Math.abs(delta) > 0.35) {
        const next = angle + Math.sign(delta) * 0.22;
        steer(this, e, { x: center.x + Math.cos(next) * ANVIL_WORK.berthRadius,
          z: center.z + Math.sin(next) * ANVIL_WORK.berthRadius }, 0);
      } else {
        if (availableReceiver) steerService(this, e, availableReceiver);
        else steer(this, e, berth.pos, ANVIL_WORK.transferRange * 0.65, 40);
        if (!availableReceiver) return; // no chase or remote custody while the tender is away
        this._transferAnvilLoad(e, receiver);
        // An empty return still has to physically arrive. Otherwise a heat-aborted
        // collection pass can restart from hundreds of units away from the tender.
        const distance = Math.hypot(e.pos.x - receiver.pos.x, e.pos.z - receiver.pos.z);
        const relativeSpeed = Math.hypot(finite(e.vel?.x) - finite(receiver.vel?.x),
          finite(e.vel?.z) - finite(receiver.vel?.z));
        if (!used(e) && route.phase === 'return'
          && serviceReady(e, receiver)
          && distance <= ANVIL_WORK.transferRange && relativeSpeed <= ANVIL_WORK.transferSpeed) {
          route.phase = 'berthed'; persist(this, e);
        }
      }
    }
  },
};
