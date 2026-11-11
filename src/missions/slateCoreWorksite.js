// Called only by the mission owner. One finite material lot, no new reward or world writer.
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
export const SLATE_SECTOR = 'sector_ceres_belt';
const TAG = 'campaign47a:b3:berth';
const OWNER = 'missionSlateCore';
export function isSlateCore(m) {
  return m?.storyTag === TAG && m.type === 'tow_recovery' && m.destSectorId === SLATE_SECTOR
    && m.params?.slateCoreVersion === 1;
}
export function slateCoreLayout() {
  return { staging: sectorLocalToGlobalForSector({ x: -670, z: 980 }, SLATE_SECTOR),
    receiver: sectorLocalToGlobalForSector({ x: -780, z: 980 }, SLATE_SECTOR), radius: 70, maxSpeed: 18, mass: 36 };
}
const point = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const owned = (e, m) => e?.data?.persistenceOwner === OWNER && e.data.slateMissionId === m.id
  && e.data.slateSlot === 'core' && e.data.materialFragment !== true;
export function slateCoreBody(owner, m) {
  const e = owner.state.entities.get(m.params?.slateCore?.entityId);
  return owned(e, m) && e.alive !== false && e.hull > 0 ? e : null;
}
export function snapshotSlateCore(owner, m) {
  if (!isSlateCore(m) || !m.params.slateCore) return;
  const row = m.params.slateCore;
  if (row.entityId == null || row.lost) return;
  const e = owner.state.entities.get(row.entityId);
  if (!owned(e, m) || e.alive === false || e.hull <= 0) { row.lost = true; return; }
  Object.assign(row, { pos: { ...e.pos }, vel: { x: e.vel?.x || 0, z: e.vel?.z || 0 }, hull: e.hull, rot: e.rot || 0 });
}
export function restoreSlateCore(m) {
  if (!isSlateCore(m)) return;
  m.params = { ...m.params };
  const r = m.params.slateCore;
  if (r == null) { if (m.status === 'completed') m.params.slateInvalid = true; return; }
  if (!point(r.pos) || !point(r.vel) || !Number.isFinite(r.hull) || r.hull < 0 || r.hull > 220
      || !Number.isFinite(r.rot) || typeof r.lost !== 'boolean' || typeof r.handled !== 'boolean') {
    m.params.slateInvalid = true; return;
  }
  const { entityId, ...saved } = r;
  m.params.slateCore = { ...saved, pos: { ...r.pos }, vel: { ...r.vel }, lost: r.lost || r.hull === 0 };
}
export function slateCoreAtReceiver(owner, m, e) {
  if (!isSlateCore(m) || m.params.slateInvalid || !owned(e, m) || e.alive === false || !(e.hull > 0)
      || e.id !== m.params.slateCore?.entityId
      || owner.state.world?.currentSectorId !== SLATE_SECTOR || !m.params.slateCore?.handled) return false;
  const l = slateCoreLayout();
  return point(e.pos) && point(e.vel) && Math.hypot(e.pos.x-l.receiver.x, e.pos.z-l.receiver.z) <= l.radius
    && Math.hypot(e.vel.x, e.vel.z) <= l.maxSpeed;
}
export function validSlateAftermath(m) {
  const receipt = m?.params?.slateReceipt, row = m?.params?.slateCore;
  const layout = slateCoreLayout();
  return isSlateCore(m) && m.status === 'completed' && !m.params.slateInvalid
    && row && point(row.pos) && point(row.vel) && Number.isFinite(row.hull) && row.hull >= 0 && row.hull <= 220
    && Number.isFinite(row.rot) && typeof row.lost === 'boolean' && row.handled === true
    && receipt?.version === 1 && receipt.missionId === m.id && receipt.mass === 36
    && ['tow_in', 'sling_in'].includes(receipt.method) && receipt.sectorId === SLATE_SECTOR
    && point(receipt.pos) && point(receipt.receiver) && receipt.receiver.x === layout.receiver.x
    && receipt.receiver.z === layout.receiver.z && Number.isFinite(receipt.speed)
    && receipt.speed >= 0 && receipt.speed <= layout.maxSpeed && Number.isFinite(receipt.atS)
    && Math.hypot(receipt.pos.x-layout.receiver.x, receipt.pos.z-layout.receiver.z) <= layout.radius;
}
export function syncSlateCore(owner, m) {
  if (!isSlateCore(m)) return false;
  if (m.status === 'completed' && !validSlateAftermath(m)) return true;
  if (owner.state.world?.currentSectorId !== SLATE_SECTOR) return true;
  snapshotSlateCore(owner, m);
  if (m.params.slateInvalid || m.params.slateCore?.lost) {
    const i = owner.state.missions.active.indexOf(m);
    if (i >= 0) owner._failMission(m, i, m.params.slateInvalid ? 'slate_record_invalid' : 'core_lost');
    return true;
  }
  const layout = slateCoreLayout();
  const row = m.params.slateCore ||= { pos: layout.staging, vel: { x: 0, z: 0 }, hull: 220, rot: 0, lost: false, handled: false };
  const matches = (owner.state.entityList || []).filter(e => owned(e, m) && e.alive !== false);
  let e = matches.find(e => e.id === row.entityId) || matches[0];
  for (const duplicate of matches) if (duplicate !== e) owner.helpers.removeEntity?.(duplicate.id);
  if (!e) e = owner.helpers.spawnEntity?.({ type: 'payload', team: 2, pos: { ...row.pos }, vel: { ...row.vel },
    rot: row.rot, radius: 16, mass: 36, hull: row.hull, hullMax: 220, collides: true, ttl: Infinity,
    homeSectorId: SLATE_SECTOR, physicsBody: { radius: 16, mass: 36, dynamic: true, ccd: true },
    flags: { missionPinned: true }, data: { persistenceOwner: OWNER, slateMissionId: m.id, slateSlot: 'core',
      missionTag: m.id, missionId: m.id, missionStoryTag: TAG, missionPinned: true,
      homeSectorId: SLATE_SECTOR, physicalRole: 'slag_core', tetherable: true, tetherPayload: true,
      payloadType: 'furnace_ore_pod', scanLabel: 'SLATE — 36t slag core' } });
  if (e) { row.entityId = e.id; m.targetEntityIds = [e.id]; }
  // A non-solid named beacon uses existing payload presentation, never a second cargo lot.
  const beacon = (owner.state.entityList || []).find(e => e.alive !== false && e.data?.persistenceOwner === OWNER
    && e.data.slateMissionId === m.id && e.data.slateSlot === 'receiver');
  if (!beacon) owner.helpers.spawnEntity?.({ type: 'payload', team: 2, pos: layout.receiver, vel: { x: 0, z: 0 },
    radius: 8, mass: 1, hull: 1, hullMax: 1, collides: false, ttl: Infinity, homeSectorId: SLATE_SECTOR,
    data: { persistenceOwner: OWNER, slateMissionId: m.id, slateSlot: 'receiver', tetherable: false,
      scanLabel: 'SLATE RECEIVING — within 70 WU, below 18 WU/s' } });
  m.needsTargets = true;
  if (m.status === 'active' && slateCoreAtReceiver(owner, m, e)) {
    const tether = owner.state.player?.tether;
    owner._completePhysical(m, owner.state.missions.active.indexOf(m), tether?.active && tether.targetId === e.id ? 'tow_in' : 'sling_in');
  }
  return true;
}
export function prepareSlateReceipt(owner, m, method) {
  if (!isSlateCore(m)) return true;
  const e = slateCoreBody(owner, m);
  if (!['tow_in','sling_in'].includes(method) || !slateCoreAtReceiver(owner, m, e)) return false;
  snapshotSlateCore(owner, m);
  m.params.slateReceipt = { version: 1, missionId: m.id, mass: 36, method, sectorId: SLATE_SECTOR,
    receiver: { ...slateCoreLayout().receiver }, pos: { ...e.pos }, speed: Math.hypot(e.vel.x,e.vel.z), atS: owner.state.simTime || 0 };
  return true;
}
export function retireSlateCore(owner, m) {
  if (!isSlateCore(m)) return false;
  if (m.status !== 'completed' || !m.params.slateReceipt) {
    for (const e of owner.state.entityList || []) if (e.data?.persistenceOwner === OWNER
        && e.data.slateMissionId === m.id && e.data.slateSlot === 'receiver') owner.helpers.removeEntity?.(e.id);
    return false; // Generic cleanup still owns the failed core.
  }
  snapshotSlateCore(owner, m);
  owner.state.missions.slateCoreAftermath = { id: m.id, type: m.type, storyTag: TAG, destSectorId: SLATE_SECTOR,
    status: 'completed', params: JSON.parse(JSON.stringify(m.params)) };
  m.targetEntityIds = [];
  owner._sayStoryLine?.('Slate: Thirty-six tonnes received. Mind its drift. The refinery approach is the next job.', 7);
  return true;
}
export function parkSlateCore(owner, m) {
  if (!isSlateCore(m)) return false;
  snapshotSlateCore(owner, m);
  for (const e of owner.state.entityList || []) if (owned(e, m) || (e.data?.persistenceOwner === OWNER
      && e.data.slateMissionId === m.id && e.data.slateSlot === 'receiver' && e.data.materialFragment !== true)) {
    e.alive = false; owner.helpers?.spawnBudget?.releaseEntity?.(e.id);
  }
  if (m.params.slateCore) delete m.params.slateCore.entityId;
  m.targetEntityIds = [];
  return true;
}
export function materializeSlateAftermath(owner) {
  const m = owner.state.missions.slateCoreAftermath;
  if (m) syncSlateCore(owner, m);
}
