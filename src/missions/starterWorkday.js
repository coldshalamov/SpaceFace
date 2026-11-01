import { occupantGenerationOf } from '../core/entity.js';
import { activeOwnedShip, shipCarriesModule } from '../data/starterJobs.js';
import { forEachFieldRock } from '../world/livingWorldViews.js';

// Authored places, not another mission owner. Existing mission targets own custody,
// destruction, delivery, payment and durable reattachment.
export const STARTER_WORKDAY_VERSION = 1;
export const STARTER_WORK_SITES = Object.freeze({
  starter_hitch: Object.freeze([
    { label: 'Inner claim — first iron', pos: { x: 600, z: -300 }, radius: 260,
      brief: 'Cut 2u iron for the berth repairs. Inner claim marked; any Helios iron you cut counts.' },
    { label: 'Claim rim — replacement stock', pos: { x: 830, z: -180 }, radius: 300,
      brief: 'Two more iron for replacement rails. Work the claim rim, or find your own Helios face.' },
    { label: 'Outer seam — yard order', pos: { x: -900, z: 640 }, radius: 380,
      brief: 'The yard needs 2u iron. Outer seam marked; your own Helios cut is equally good.' },
  ]),
  starter_pelican: Object.freeze([
    { label: '44-C loose lane buoy', pos: { x: 310, z: -35 }, mass: 40, drift: { x: 0, z: 0 },
      brief: '44-C broke its mooring beside the first lane pin. Winch the lit buoy to Helios.' },
    { label: 'Claim-rim loose lane buoy', pos: { x: 1000, z: 30 }, mass: 65, drift: { x: 0, z: 2 },
      brief: 'A heavier buoy is drifting off the claim rim. Catch it and winch it back to Helios.' },
    { label: 'Outer-yard loose lane buoy', pos: { x: -1560, z: -1100 }, mass: 90, drift: { x: 1, z: -1 },
      brief: 'The outer yard lost its approach light. Bring the heavy buoy back; keep the hulk clear.' },
  ]),
});
export function starterWorkSite(jobId, step) {
  const row = STARTER_WORK_SITES[jobId]?.[Number(step) - 1];
  return row ? JSON.parse(JSON.stringify(row)) : null;
}
export function authoredStarterSite(m) {
  if (m?.params?.starterWorkdayVersion !== STARTER_WORKDAY_VERSION
    || m.destSectorId !== 'sector_helios_prime') return null;
  return starterWorkSite(m.params.starterJobId, m.params.starterStep);
}
export function starterMiningReceiptMatches(m, receipt, state) {
  if (!authoredStarterSite(m)) return true; // old saves and ordinary work keep their contract
  return receipt?.minerId === state.playerId
    && state.world?.currentSectorId === m.destSectorId
    && Number.isFinite(receipt.qty) && receipt.qty > 0;
}
export function starterMiningFocus(m, entities, toGlobal, asteroidDefs = []) {
  const site = authoredStarterSite(m);
  if (!site || m.type !== 'mining_quota') return null;
  const center = toGlobal(site.pos, m.destSectorId);
  let best = null, distance = Infinity;
  for (const e of entities || []) {
    if (e?.alive === false || e?.type !== 'asteroid' || !e.pos || e.data?.missionTag) continue;
    if (e.data?.oreHP != null && e.data.oreHP <= 0) continue;
    // Use the same type definition as mining; never label ice or crystal as an iron face.
    const def = asteroidDefs.find((row) => row.id === e.data?.typeId)
      || asteroidDefs.find((row) => row.id === 'ast_common_rock');
    if (!(def?.oreTable?.[m.params?.cmdtyId || 'cmdty_ore_iron'] > 0)) continue;
    const d = Math.hypot(e.pos.x - center.x, e.pos.z - center.z);
    if (d <= site.radius && d < distance) { best = e; distance = d; }
  }
  // A worked-out face is not a lock: the ordinary nearest-rock fallback remains available.
  return best ? { label: site.label, pos: { x: best.pos.x, z: best.pos.z }, targetEntityId: best.id,
    reason: site.brief } : null;
}

/** Existing field-owner view: nearest eligible live or dormant resource face, without materializing it. */
export function nearestMiningResourceFace(state, { sectorId, center, commodityId }, asteroidDefs, accept = null) {
  let face = null, distance = Infinity;
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.z)) return { face, distance };
  forEachFieldRock(state, (e) => {
    const data = e?.data || {};
    if (e?.alive !== true || e.type !== 'asteroid' || !Number.isFinite(e.pos?.x)
      || !Number.isFinite(e.pos?.z) || data.missionTag || data.respawnAt != null
      || !Number.isFinite(data.oreHP) || data.oreHP <= 0) return;
    if (e.fieldResident && (state.world?.asteroidField?.schema !== 'spaceface.asteroidField.v1'
      || e.liveEntityId != null || state.entities?.get(e.id))) return;
    if (!e.fieldResident && state.entities?.get(e.id) !== e) return;
    if (data.siteAnchored || (typeof data.opticStructureId === 'string' && data.opticStructureId)) return;
    const chunkMass = Math.max(0, Number(data.bulkMassU ?? data.yieldU ?? e.mass) || 0);
    if (data.isChunk && chunkMass > 20) return;
    if ([e.sectorId, e.homeSectorId, data.sectorId, data.homeSectorId]
      .some((id) => id && id !== sectorId)) return;
    const def = asteroidDefs.find((row) => row.id === data.typeId);
    if (!Number.isFinite(def?.oreTable?.[commodityId]) || def.oreTable[commodityId] <= 0) return;
    const d = Math.hypot(e.pos.x - center.x, e.pos.z - center.z);
    if (!(d < distance) || (accept && !accept(e))) return;
    face = e;
    distance = d;
  });
  return { face, distance };
}

export function starterBuoySpec(m, toGlobal) {
  const site = authoredStarterSite(m);
  if (!site || m.type !== 'tow_recovery' || m.params.starterJobId !== 'starter_pelican') return null;
  return {
    type: 'payload', team: 2, pos: toGlobal(site.pos, m.destSectorId), vel: { ...site.drift },
    rot: 0, radius: 10, mass: site.mass, hull: 220, hullMax: 220, collides: true,
    physicsBody: { radius: 10, mass: site.mass, dynamic: true, ccd: true },
    data: { missionTag: m.id, name: site.label, scanLabel: site.label.toUpperCase(),
      tetherable: true, tetherPayload: true, placeId: 'place_lane_beacon',
      packagedPropFile: 'places/place_lane_beacon.glb', packagedPropSlot: 'place',
      packagedPropRadius: 10, starterJobId: m.params.starterJobId, starterStep: m.params.starterStep, starterWorkdayVersion: STARTER_WORKDAY_VERSION },
  };
}

// Only this known authored body may cross the durable-record seam. Never deserialize a spec.
export function starterBuoyRecordMarker(entity) {
  const d = entity?.data;
  if (entity?.type !== 'payload' || d?.physicalRole !== 'slag_core'
    || d.starterWorkdayVersion !== STARTER_WORKDAY_VERSION
    || d.starterJobId !== 'starter_pelican' || !Number.isInteger(d.starterStep)
    || d.starterStep < 1 || d.starterStep > 3) return null;
  return { version: STARTER_WORKDAY_VERSION, jobId: d.starterJobId, step: d.starterStep, role: 'slag_core' };
}
export function isStarterBuoyRecord(rec) {
  const marker = rec?.extra?.starterWorkdayBuoy;
  return rec?.kind === 'mission_target' && rec.type === 'payload'
    && rec.sectorId === 'sector_helios_prime' && !!rec.missionId
    && rec.identityKey === `mission:${rec.missionId}:0`
    && marker?.version === STARTER_WORKDAY_VERSION && marker.jobId === 'starter_pelican'
    && marker.role === 'slag_core' && Number.isInteger(marker.step) && marker.step >= 1 && marker.step <= 3;
}
export function starterBuoyFromRecord(rec) {
  if (!isStarterBuoyRecord(rec)) return null;
  const marker = rec.extra.starterWorkdayBuoy;
  const m = { id: rec.missionId, type: 'tow_recovery', destSectorId: rec.sectorId,
    params: { starterWorkdayVersion: marker.version, starterJobId: marker.jobId, starterStep: marker.step } };
  const spec = starterBuoySpec(m, () => ({ ...rec.pos }));
  spec.vel = { ...rec.vel }; spec.rot = rec.rot; spec.angVel = rec.angVel;
  if (Number.isFinite(rec.hull)) spec.hull = rec.hull;
  if (Number.isFinite(rec.hullMax)) spec.hullMax = rec.hullMax;
  spec.flags = { missionPinned: true };
  Object.assign(spec.data, { physicalRole: marker.role, worldRecordId: rec.recordId,
    identityKey: rec.identityKey, missionId: rec.missionId, missionPinned: true,
    homeSectorId: rec.homeSectorId, sectorId: rec.sectorId, durable: true });
  return spec;
}


// Mission-owned, transient admission of this exact living occupant. A saved marker is
// reconstructed through the normal record owner, then reacquired/stamped by missions.
// It grants no privilege to a recycled id or to a lookalike carrying copied data.
const starterTowLeases = new WeakMap();
function activeStarterBuoyMission(state, entity) {
  if (!entity || entity.alive !== true || !(entity.hull > 0)
    || state?.entities?.get(entity.id) !== entity
    || state.world?.currentSectorId !== 'sector_helios_prime') return null;
  const marker=starterBuoyRecordMarker(entity),data=entity.data;
  if (!marker || (entity.homeSectorId || data.homeSectorId) !== 'sector_helios_prime'
    || data.missionTargetSlot !== 0 || !data.worldRecordId) return null;
  const mission=state.missions?.active?.find(m=>m.status==='active'&&m.type==='tow_recovery'
    &&m.id===data.missionId&&m.id===data.missionTag&&m.destSectorId==='sector_helios_prime'
    &&m.params?.starterWorkdayVersion===marker.version&&m.params.starterJobId===marker.jobId
    &&m.params.starterStep===marker.step&&m.params.requiredModule==='mod_winch_hd');
  if (!mission || data.identityKey!==`mission:${mission.id}:0`) return null;
  const site=authoredStarterSite(mission);
  return site && entity.radius===10 && entity.mass===site.mass
    && data.packagedPropFile==='places/place_lane_beacon.glb' ? mission : null;
}
export function registerStarterBuoyTow(state, entity, mission) {
  const generation=occupantGenerationOf(entity);
  if (generation == null || activeStarterBuoyMission(state,entity)!==mission) return false;
  starterTowLeases.set(entity,{state,generation,missionId:mission.id,recordId:entity.data.worldRecordId,identity:entity.data.identityKey});
  return true;
}
export function isOriginalStarterBuoyTow(state, entity) {
  const lease=entity&&starterTowLeases.get(entity),mission=activeStarterBuoyMission(state,entity);
  const ship=activeOwnedShip(state);
  return !!(lease&&mission&&lease.state===state&&lease.generation===occupantGenerationOf(entity)
    &&lease.missionId===mission.id&&lease.recordId===entity.data.worldRecordId
    &&lease.identity===entity.data.identityKey&&mission.targetEntityIds?.includes(entity.id)
    &&ship?.defId==='ship_pelican'&&shipCarriesModule(ship,'mod_winch_hd'));
}
