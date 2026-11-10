import { COMMODITIES } from '../data/commodities.js';
import { occupantGenerationOf } from '../core/entity.js';
import { pickupCustodyIdentity } from '../core/pickupCustody.js';
import { indexedTypeScan } from '../world/livingWorldViews.js';

// The packaged sweeper has its forward tool socket at source x=9.448. The whole-ship fit
// is 1.72 radii over its approximately 20.17-unit length; its visible nose is about .81R.
// Keep the mouth finite in width and require the ordinary pickup collector's actual overlap.
export const SWEEPER_MOUTH_X = 0.806;
export const SWEEPER_MOUTH_HALF_WIDTH = 0.28;
export const SWEEPER_MOUTH_DEPTH = 0.25;
export const SWEEPER_MAX_PICKUP_SPEED = 8;
export const SWEEPER_CAPACITY = 8;
const commodityIds = new Set(COMMODITIES.map(row => row.id));

export function isScrapSweeperJob(entry, entity) {
  return !!(entry?.job?.kind === 'salvor' && entry.job.payload?.role === 'sweeper'
    && entity?.data?.trafficRole === 'sweeper' && entity.data.jobId === entry.job.id
    && entry.entityId === entity.id && (!entry.entityRef || entry.entityRef === entity));
}

export function isSweeperEligiblePickup(state, pickup) {
  const d = pickup?.data, flags = pickup?.flags;
  if (!pickup || pickup.type !== 'pickup' || pickup.alive !== true || pickup.collides !== true
    || state?.entities?.get(pickup.id) !== pickup || !pickup.pos || !d
    || !['cargo', 'ore'].includes(d.kind) || !commodityIds.has(d.commodityId)
    || !Number.isSafeInteger(d.amount) || d.amount < 1 || d.amount > SWEEPER_CAPACITY
    || !Number.isFinite(pickup.radius) || pickup.radius <= 0 || pickup.radius > 4
    || occupantGenerationOf(pickup) == null || pickupCustodyIdentity(d)
    || flags?.missionPinned || flags?.tethered || d.missionPinned || d.missionId || d.contractId
    || d.playerCollectOnly || d.reservedBy || d.worldSiteId || d.worldObjectId
    || d.orchardId || d.lotId || d.lotSource || d.richLotSource || d.combatLoot
    || d.persistenceOwner || d.spillNoticed || d.salvageSourceKey || d.salvagePool
    || d.masslineLatched || d.latched || d.tethered || d.tetherPayload
    || state.player?.tether?.targetId === pickup.id && state.player.tether.active !== false) return false;
  const sector = state.world?.currentSectorId;
  return !((d.sectorId && sector && d.sectorId !== sector)
    || (pickup.homeSectorId && sector && pickup.homeSectorId !== sector));
}

/** Bind a live object, never a recyclable numeric slot. The transient reference is not saved. */
export function bindSweeperPickup(state, entry, pickup) {
  if (!entry?.job || !isSweeperEligiblePickup(state, pickup)) return false;
  entry._sweeperPickup = { entity: pickup, life: occupantGenerationOf(pickup) };
  return true;
}

export function resolveSweeperPickup(state, entry) {
  const binding = entry?._sweeperPickup, pickup = binding?.entity;
  if (!binding || !pickup || binding.life !== occupantGenerationOf(pickup)
    || entry.job?.payload?.targetId !== pickup.id || !isSweeperEligiblePickup(state, pickup)) return null;
  return pickup;
}

export function sweeperMouthContact(entity, pickup) {
  if (!entity?.pos || !pickup?.pos || !Number.isFinite(entity.radius) || entity.radius <= 0
    || !Number.isFinite(pickup.radius) || pickup.radius <= 0 || !Number.isFinite(entity.rot)) return false;
  const dx = pickup.pos.x - entity.pos.x, dz = pickup.pos.z - entity.pos.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  const c = Math.cos(entity.rot), s = Math.sin(entity.rot);
  const forward = dx * c + dz * s, side = -dx * s + dz * c;
  const relativeSpeed = Math.hypot((pickup.vel?.x || 0) - (entity.vel?.x || 0),
    (pickup.vel?.z || 0) - (entity.vel?.z || 0));
  const radius = entity.radius, pieceRadius = pickup.radius;
  return Math.hypot(dx, dz) <= radius + pieceRadius
    && Math.abs(forward - SWEEPER_MOUTH_X * radius) <= SWEEPER_MOUTH_DEPTH * radius + pieceRadius
    && Math.abs(side) <= SWEEPER_MOUTH_HALF_WIDTH * radius + pieceRadius
    && relativeSpeed <= SWEEPER_MAX_PICKUP_SPEED;
}

/** Synchronous pickup receipt: only the existing manifest owner takes the physical quantity. */
export function acceptSweeperPickup(traffic, receipt) {
  const state = traffic?.state;
  const entity = state?.entities?.get(receipt?.collectorId);
  if (entity?.type !== 'ship' || entity.data?.trafficRole !== 'sweeper' || entity.id === state.playerId) return false;
  // A generic NPC contact defaults to full consumption. Every NPC Sweeper must refuse first,
  // including idle/borrowed hulls; only its validated booking may take a physical quantity.
  // A player flying this hull still uses the player cargo owner's acceptance contract.
  receipt.acceptedAmount = 0;
  receipt.rejectedAmount = Number.isSafeInteger(receipt.amount) ? receipt.amount : 0;
  const entry = entity.data.jobId && traffic.helpers?.npcJobs?.get(entity.data.jobId);
  if (!isScrapSweeperJob(entry, entity)) return false;
  const target = resolveSweeperPickup(state, entry);
  const rec = state.traffic?.freighters?.find(row => row?.id === entity.id
    && (row.worldRecordId == null || row.worldRecordId === entry.worldRecordId));
  const job = entry.job, payload = job.payload;
  if (!target || target.id !== receipt.pickupId || !rec || entry.entityId !== entity.id
    || entry.control || entity.alive !== true || entity.data.worldRecordId !== entry.worldRecordId
    || job.phase === 'flee' || job.phase === 'return' || job.phase === 'unload' || payload.sourceUnavailable
    || receipt.commodityId !== target.data.commodityId || receipt.amount !== target.data.amount
    || receipt.kind !== target.data.kind || payload.extracted === true
    || (entity.data.cargoManifest?.totalQty || rec.manifest?.totalQty || 0) > 0
    || !sweeperMouthContact(entity, target)
    || typeof traffic._buildSalvorManifest !== 'function' || typeof traffic._setTrafficManifest !== 'function') return false;
  const seq = Number.isSafeInteger(job.sequence) && job.sequence >= 0 ? job.sequence : 0;
  const workId = `npc-sweeper:${entry.worldRecordId}:${job.id}:${seq}:${target.id}:${occupantGenerationOf(target)}:${state.tick}`;
  const manifest = traffic._buildSalvorManifest(entity, seq, { [receipt.commodityId]: receipt.amount }, null, workId);
  if (!manifest || manifest.totalQty !== receipt.amount || manifest.lines?.length !== 1
    || manifest.lines[0].commodityId !== receipt.commodityId || manifest.lines[0].qty !== receipt.amount
    || traffic._setTrafficManifest(entity, rec, manifest) !== true) return false;
  payload.extracted = true;
  payload.totalQty = receipt.amount;
  payload.salvageManifestId = manifest.manifestId;
  payload.salvageLotId = manifest.lotId;
  receipt.acceptedAmount = receipt.amount;
  receipt.rejectedAmount = 0;
  return true;
}

// Uses the existing traffic update cadence and an existing ambient hull; never spawns a lot or ship.
export function dispatchSweeperWork(traffic, stations, sectorId) {
  const state = traffic?.state, jobs = traffic?.helpers?.npcJobs;
  if (!state || state.mode !== 'flight' || !sectorId || !Array.isArray(stations)
    || !jobs?.assign || !jobs?.get || !jobs?.release) return false;
  const now = Number(state.simTime) || 0;
  if (traffic._sweeperDispatchAt != null && now >= traffic._sweeperDispatchAt - 2
    && now < traffic._sweeperDispatchAt) return false;
  traffic._sweeperDispatchAt = now + 2;
  const rows = state.traffic?.freighters || [];
  if (rows.some(row => {
    const entity = state.entities?.get(row?.id);
    return entity && isScrapSweeperJob(jobs.get(entity.data?.jobId), entity);
  })) return false;
  const economy = traffic._registry?.get?.('economy');
  if (typeof economy?.quoteNpcSalvageIntake !== 'function') return false;
  for (const rec of rows) {
    if (rec?.role !== 'sweeper') continue;
    const entity = state.entities?.get(rec.id), data = entity?.data;
    if (!entity?.alive || !entity.pos || !data?.worldRecordId || data.trafficRole !== 'sweeper'
      || data.worldSiteTrafficHookId || data.claimTravelTrafficHookId
      || (data.cargoManifest?.totalQty || rec.manifest?.totalQty || 0) > 0) continue;
    const old = data.jobId && jobs.get(data.jobId);
    if (data.jobId && (!old || old.job?.kind !== 'miner' || jobs.controlClaim?.(data.jobId))) continue;
    let choice = null;
    for (const pickup of indexedTypeScan(state, 'pickups')) {
      if (!isSweeperEligiblePickup(state, pickup)) continue;
      const distance = Math.hypot(pickup.pos.x - entity.pos.x, pickup.pos.z - entity.pos.z);
      if (distance > 900 || (choice && distance >= choice.distance)) continue;
      for (const yard of stations) {
        const stationId = yard?.data?.stationId;
        if (!yard?.alive || !yard.pos || !stationId
          || Math.hypot(yard.pos.x - pickup.pos.x, yard.pos.z - pickup.pos.z) > 1600) continue;
        const quote = economy.quoteNpcSalvageIntake(stationId,
          [{ commodityId: pickup.data.commodityId, qty: pickup.data.amount }]);
        if (quote?.ok) { choice = { pickup, yard, stationId, distance }; break; }
      }
    }
    if (!choice) continue;
    if (old && !jobs.release(data.jobId)) continue;
    const id = jobs.assign(entity, { kind: 'salvor', sectorId, speed: 35, unloadS: 2,
      route: [{ id: `yard:${choice.stationId}`, pos: { ...choice.yard.pos }, label: 'Salvage intake' },
        { id: `pickup:${choice.pickup.id}`, pos: { ...choice.pickup.pos }, label: 'Loose scrap' }],
      payload: { role: 'sweeper', targetId: choice.pickup.id, extracted: false } });
    const entry = id && jobs.get(id);
    if (!entry || !bindSweeperPickup(state, entry, choice.pickup)) {
      if (id) jobs.release(id);
      continue;
    }
    data.jobKind = 'salvor';
    return true;
  }
  return false;
}

// The cycle follows the ordinary unload handler. A rejected load is still on the hull.
export function finishSweeperCycle(traffic, intent) {
  const jobs = traffic?.helpers?.npcJobs, entry = jobs?.get?.(intent?.jobId);
  const entity = entry?.entityId != null ? traffic.state?.entities?.get(entry.entityId) : null;
  if (!isScrapSweeperJob(entry, entity) || entry.control || !intent?.completed && intent?.event !== 'npcjobs:cycle'
    || !(entry.job.payload.extracted || entry.job.payload.sourceUnavailable)
    || entry.job.payload.salvageIntakeWait || entity.data.cargoManifest?.salvageIntakeHeld
    || (entity.data.cargoManifest?.totalQty || 0) > 0) return false;
  return jobs.release(intent.jobId) === true;
}
