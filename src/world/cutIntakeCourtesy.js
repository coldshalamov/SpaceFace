// Cut's ore crews give a real delivery carrier a short approach window, not VIP status.
// npcJobsRuntime's existing berthHold owns the pause and steering. The one AI-record token
// survives the worker's normal job recommission and world-record/Save restore; it never
// becomes a second work clock, cargo ledger, payment, or source of identity.
import { describeMaterialization } from '../systems/npcJobs.js';
import { releasableContractUnits } from '../systems/cargo.js';
import { isPlayerWanted } from '../systems/heat.js';
import { COMMODITIES } from '../data/commodities.js';
import { hullEnvelopeWu, resolveCollisionProxyManifest, proxyOuterRadiusWu,
  resolveCorridorAxisWorld } from '../data/collisionProxyManifests.js';

const SECTOR = 'sector_hyperion_cut', CUT = 'station_hyperion_cut';
const NYX = 'station_nyx_march', HESPER = 'fence_hesper_quill', MEDICINE = 'cmdty_medical';
export const CUT_INTAKE_COURTESY_S = 30;
const CLEARANCE = 48, APPROACH_WU = 900, MAX_ROWS = 32;
const ores = new Set(COMMODITIES.filter(c => c.category === 'raw ore' && c.consumedBy.includes('refinery')).map(c => c.id));
const point = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const object = o => !!o && typeof o === 'object' && !Array.isArray(o);
const positive = n => Number.isSafeInteger(n) && n > 0;
const stamp = n => Number.isFinite(n) && n >= 0;

function missionForIntake(state, now) {
  const rows = state.missions?.active;
  // The mission owner normally permits eight. Malformed oversized state gets no priority.
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) return null;
  let selected = null;
  const ids = new Set();
  for (const m of rows) {
    if (m?.id && ids.has(m.id)) return null;
    ids.add(m?.id);
  }
  for (const m of rows) {
    if (!m || m.status !== 'active' || m.type !== 'cargo_delivery' || m.preloadedCargo !== true
      || typeof m.id !== 'string' || !m.id || m.id.length > 128
      || m.source !== 'economyContract' || m.stationId !== NYX || m.destStationId !== CUT
      || m.destSectorId !== SECTOR || m.params?.cmdtyId !== MEDICINE || !positive(m.params.qty)
      || !stamp(m.acceptedAt_s) || m.acceptedAt_s > now
      || !Number.isFinite(m.deadline_s) || m.deadline_s <= now) continue;
    const route = m.sourceOfferId === `fenceroute_${HESPER}_1`
      && m.cause?.tag === 'fence_route' && m.cause.fenceRoute?.fenceId === HESPER
      && m.cause.fenceRoute.leg === 1 && m.cause.fenceRoute.destStationId === CUT;
    const ordinary = typeof m.sourceOfferId === 'string'
      && /^eco_station_nyx_march_(0|[1-9]\d*)_deniable$/.test(m.sourceOfferId)
      && m.cause?.tag === 'wanted_deniable' && m.cause.deniable?.fenceId === HESPER
      && m.cause.deniable.fenceStationId === NYX;
    if ((!route && !ordinary) || releasableContractUnits(state, m) <= 0) continue;
    // Oldest actual obligation wins. Never switch between concurrent shipments each tick.
    if (!selected || m.acceptedAt_s < selected.acceptedAt_s
      || (m.acceptedAt_s === selected.acceptedAt_s && m.id < selected.id)) selected = m;
  }
  return selected;
}

function carriesOre(entity) {
  const manifest = entity.data?.cargoManifest;
  if (!object(manifest) || !positive(manifest.totalQty) || !Array.isArray(manifest.lines)
    || !manifest.lines.length || manifest.lines.length > MAX_ROWS) return false;
  let total = 0, ore = 0;
  for (const line of manifest.lines) {
    if (!object(line) || !positive(line.qty) || typeof line.commodityId !== 'string') return false;
    total += line.qty;
    if (ores.has(line.commodityId)) ore += line.qty;
  }
  return total === manifest.totalQty && ore > 0;
}

function validToken(token, now) {
  return object(token) && typeof token.missionId === 'string' && token.missionId.length > 0 && token.missionId.length <= 128
    && stamp(token.acceptedAt_s) && stamp(token.startedAt_s) && token.startedAt_s <= now
    && token.acceptedAt_s <= token.startedAt_s
    && token.until_s === token.startedAt_s + CUT_INTAKE_COURTESY_S
    && point(token.offset) && Math.hypot(token.offset.x, token.offset.z) <= 5000;
}

// Only the compact ship lane is consulted. Saturated or stale indices receive normal
// arbitration, never a world scan. One existing carrier concession per visible shipment
// also avoids a chorus of station clearances or several ore hulls converging on one point.
function clearAdmission(index, entity, station, mission, offset, envelope) {
  const ships = index.shipLike;
  if (!Array.isArray(ships) || ships.length > 128) return false;
  const end = { x: station.pos.x + offset.x, z: station.pos.z + offset.z };
  const dx = end.x - entity.pos.x, dz = end.z - entity.pos.z, lengthSq = dx * dx + dz * dz;
  for (const other of ships) {
    if (!other || other === entity || other.alive === false) continue;
    if (other.data?.ai?.cutIntakeCourtesy?.missionId === mission.id) return false;
    if (!point(other.pos)) return false;
    const clearance = envelope + hullEnvelopeWu(other) + CLEARANCE;
    if (!Number.isFinite(clearance)) return false;
    const u = lengthSq ? Math.max(0, Math.min(1,
      ((other.pos.x - entity.pos.x) * dx + (other.pos.z - entity.pos.z) * dz) / lengthSq)) : 0;
    if (Math.hypot(entity.pos.x + dx * u - other.pos.x,
      entity.pos.z + dz * u - other.pos.z) < clearance) return false;
  }
  return true;
}

/** Called only by the existing job owner, before its ordinary NPC-to-NPC berth arbitration. */
export function applyCutIntakeCourtesy(runtime, entry, entity, now) {
  const state = runtime.state, job = entry?.job, data = entity?.data;
  if (!state || !entry || state.mode !== 'flight' || state.world?.currentSectorId !== SECTOR
    || state.ui?.docked || !stamp(now) || entry.control || entry.threatId != null
    || !job || job.corrupt || job.interrupted || job.kind !== 'hauler' || job.phase !== 'transit'
    || entry.sectorId !== SECTOR || !entity || entity.alive === false || entity.type !== 'ship'
    || !point(entity.pos) || !data || data.trafficRole !== 'hauler' || data.ceresCausalDisabled
    || (data.activityActorSlotId != null && data.activityActorSlotId !== 'hyperion_yard_hauler')
    || data.towAttachmentId != null || entry.towAttachmentId != null || job.payload?.role === 'tug'
    || data.jobId !== job.id || data.worldRecordId !== entry.worldRecordId
    || typeof entry.worldRecordId !== 'string' || !entry.worldRecordId
    || state.entities?.get(entity.id) !== entity || entry.entityId !== entity.id
    || state.npcJobs?.byId?.[job.id] !== entry || !carriesOre(entity)
    || !object(data.ai) || isPlayerWanted(state)) return false;
  const route = job.route;
  if (!Array.isArray(route) || route.length < 2 || route.length > MAX_ROWS) return false;
  const targetId = describeMaterialization(job)?.targetId;
  const target = route.find(w => w?.id === targetId);
  if (!target || (target.id !== `dest:${CUT}` && target.targetRef !== `dest:${CUT}`)) return false;
  const index = state.entityIndex;
  // The production station index is the owner; no full world scan on a per-worker tick.
  if (!index?.__spacefaceEntityIndexV1 || index.ready !== true || !(index.byStationId instanceof Map)) return false;
  const station = index.byStationId.get(CUT);
  const player = state.entities.get(state.playerId);
  if (!station || station.alive === false || station.type !== 'station' || station.data?.stationId !== CUT
    || state.entities.get(station.id) !== station || !point(station.pos)
    || !player || player.alive === false || player.type !== 'ship' || !point(player.pos)) return false;
  const stock = state.economy?.markets?.[CUT]?.[MEDICINE];
  if (!object(stock) || !Number.isFinite(stock.stock) || stock.stock < 0
    || !Number.isFinite(stock.baseEq) || stock.baseEq <= 0 || stock.stock >= stock.baseEq) return false;
  const workerDistance = Math.hypot(entity.pos.x - station.pos.x, entity.pos.z - station.pos.z);
  if (workerDistance > APPROACH_WU || Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z) > APPROACH_WU) return false;
  const mission = missionForIntake(state, now);
  if (!mission) return false;
  let token = data.ai.cutIntakeCourtesy;
  // A malformed remembered token is not a fresh permission. Normal play never clears it.
  if (token != null && !validToken(token, now)) return false;
  if (token && token.missionId !== mission.id && mission.acceptedAt_s <= token.acceptedAt_s) return false;
  if (token?.missionId === mission.id
    && (token.acceptedAt_s !== mission.acceptedAt_s || now >= token.until_s)) return false;
  const proxy = resolveCollisionProxyManifest(station);
  const outer = Math.max(station.radius || 0, station.data.dockRadius || 0,
    proxy ? proxyOuterRadiusWu(proxy, station) : 0);
  const envelope = hullEnvelopeWu(entity);
  if (!Number.isFinite(outer) || !Number.isFinite(envelope) || outer <= 0 || envelope <= 0) return false;
  const safeRadius = outer + envelope + CLEARANCE;
  let admitted = false;
  if (!token || token.missionId !== mission.id) {
    // Do not make a worker already inside the dock turn across its structure.
    if (workerDistance <= safeRadius) return false;
    const outward = { x: (entity.pos.x - station.pos.x) / workerDistance,
      z: (entity.pos.z - station.pos.z) / workerDistance };
    const axis = proxy ? resolveCorridorAxisWorld(station, proxy)
      : { x: (player.pos.x - station.pos.x) / Math.max(1, Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z)),
        z: (player.pos.z - station.pos.z) / Math.max(1, Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z)) };
    const side = outward.x * -axis.z + outward.z * axis.x < 0 ? -1 : 1;
    // Both endpoints lie in the worker's outward half-plane. The straight segment cannot
    // cut through the station; the final point also clears its entire approach axis.
    const offset = { x: outward.x * (workerDistance + CLEARANCE) - axis.z * side * safeRadius,
      z: outward.z * (workerDistance + CLEARANCE) + axis.x * side * safeRadius };
    token = { missionId: mission.id, acceptedAt_s: mission.acceptedAt_s,
      startedAt_s: now, until_s: now + CUT_INTAKE_COURTESY_S, offset };
    if (!validToken(token, now)) return false;
    admitted = true;
  }
  // A released worker may have resumed into the berth before the carrier returns.
  // Reusing time permission never skips geometric admission from its CURRENT position.
  if (workerDistance <= safeRadius || Math.hypot(token.offset.x, token.offset.z) < safeRadius) return false;
  const hx = station.pos.x + token.offset.x, hz = station.pos.z + token.offset.z;
  const dx = hx - entity.pos.x, dz = hz - entity.pos.z, lengthSq = dx * dx + dz * dz;
  const u = lengthSq ? Math.max(0, Math.min(1,
    ((station.pos.x - entity.pos.x) * dx + (station.pos.z - entity.pos.z) * dz) / lengthSq)) : 0;
  if (Math.hypot(entity.pos.x + dx * u - station.pos.x,
    entity.pos.z + dz * u - station.pos.z) < safeRadius
    || !clearAdmission(index, entity, station, mission, token.offset, envelope)) return false;
  if (admitted) data.ai.cutIntakeCourtesy = token;
  // Pulling aside also relinquishes the old queue claim: other ordinary haulers keep their turn.
  entry.berthWaitSince = null;
  entry.berthHold = true;
  entry.berthHoldPoint = { x: station.pos.x + token.offset.x, z: station.pos.z + token.offset.z,
    berthId: `dest:${CUT}`, reason: 'medical_intake' };
  // Emit after actual admission only. Saved/reentered/recommissioned workers stay quiet.
  if (admitted) runtime.bus?.emit('toast', { text: 'Cut intake: Delivery carrier, take the approach. One ore hauler is holding outside.', kind: 'info', ttl: 4 });
  return true;
}
