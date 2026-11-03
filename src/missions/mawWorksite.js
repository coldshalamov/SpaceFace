// A finite Ceres worksite owned by missions, using existing massline bodies and visuals.
// No ecology AI, inventory, rewards, or second world-record writer.
export const MAW_WORKSITE_VERSION = 1;
const OWNER = 'missionMawWorksite';
const TAG = 'campaign47a:b3:maw';
const SECTOR = 'sector_ceres_belt';
// Continue the existing infested-hauler worksite: furnaceWorksite.js places its hauler
// at (1880,1810). The Maw sits 330 WU farther out; the throw bank is 170 WU west.
// All four bodies stay outside the refinery's 150-WU growth ring and CR-FEED's 90-WU lip.
const LOCAL = Object.freeze([
  Object.freeze({ x: 1880, z: 2140 }),
  Object.freeze({ x: 1710, z: 2090 }),
  Object.freeze({ x: 1710, z: 2140 }),
  Object.freeze({ x: 1710, z: 2190 }),
]);
export function isMawWorksite(m) {
  return m?.storyTag === TAG && m.type === 'tow_recovery' && m.destSectorId === SECTOR
    && m.params?.mawWorksiteVersion === MAW_WORKSITE_VERSION;
}
export function isMawWorksiteBody(e) {
  return e?.type === 'asteroid' && e.data?.persistenceOwner === OWNER
    && e.data.mawWorksiteVersion === MAW_WORKSITE_VERSION && e.data.mawSlot === 0
    && e.data.missionStoryTag === TAG && typeof e.data.mawMissionId === 'string'
    && e.data.mawMissionId.length > 0 && e.data.furnaceMaw === true;
}
function belongs(e, m, slot) {
  return e?.data?.persistenceOwner === OWNER && e.data.mawWorksiteVersion === 1
    && e.data.mawMissionId === m.id && e.data.missionStoryTag === TAG
    && e.data.mawSlot === slot && e.type === (slot === 0 ? 'asteroid' : 'payload');
}
const finitePoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
export function restoreMawWorksite(m) {
  if (!isMawWorksite(m)) return;
  // deserialize spreads the mission row, not its params. Detach before normalization
  // or later sync writes so loading never changes the caller's saved payload.
  m.params = { ...m.params };
  if (m.params.mawBodies == null) {
    // No saved inventory may be reconstructed after a recorded stun.
    if (m.params.mawStuns != null && m.params.mawStuns !== 0) m.params.mawLedgerInvalid = true;
    return;
  }
  const rows = m.params.mawBodies;
  const valid = Array.isArray(rows) && rows.length === 4 && rows.every((row, slot) =>
    row?.slot === slot && finitePoint(row.pos) && finitePoint(row.vel)
    && Number.isFinite(row.hull) && row.hull >= 0 && row.hull <= 220
    && Number.isFinite(row.rot) && Number.isFinite(row.angVel)
    && typeof row.spent === 'boolean' && typeof row.lost === 'boolean'
    && !(row.spent && row.lost) && !(slot === 0 && row.spent));
  if (!valid) { m.params.mawLedgerInvalid = true; return; }
  m.params.mawBodies = rows.map(({ entityId, ...row }) => ({ ...row,
    pos: { ...row.pos }, vel: { ...row.vel }, lost: row.lost || (!row.spent && row.hull === 0) }));
  m.params.mawStuns = rows.slice(1).filter(row => row.spent).length;
}
export function snapshotMawWorksite(owner, m) {
  if (!isMawWorksite(m) || m.params.mawLedgerInvalid || !Array.isArray(m.params.mawBodies)) return;
  for (const row of m.params.mawBodies) {
    const e = owner.state.entities.get(row.entityId);
    if (row.spent || row.lost || row.entityId == null) continue;
    // Save may precede the deferred destroy event. Preserve that loss, never refill the slot.
    if (!belongs(e, m, row.slot) || e.alive === false || e.hull <= 0) { row.lost = true; continue; }
    row.pos = { x: e.pos.x, z: e.pos.z };
    row.vel = { x: e.vel?.x || 0, z: e.vel?.z || 0 };
    row.rot = e.rot || 0; row.angVel = e.angVel || 0; row.hull = e.hull;
  }
}
function specFor(m, row) {
  const maw = row.slot === 0;
  const radius = maw ? 24 : 12;
  return {
    type: maw ? 'asteroid' : 'payload', team: 2, homeSectorId: SECTOR, ttl: Infinity,
    pos: { ...row.pos }, vel: { ...row.vel }, rot: row.rot, angVel: row.angVel,
    radius, mass: maw ? 120 : 40, hull: row.hull, hullMax: 220, collides: true,
    physicsBody: { radius: maw ? radius * 1.16 : radius, mass: maw ? 120 : 40, dynamic: true, ccd: true },
    flags: { missionPinned: true },
    data: { persistenceOwner: OWNER, mawWorksiteVersion: 1, mawMissionId: m.id,
      mawSlot: row.slot, missionTag: m.id, missionId: m.id, missionStoryTag: TAG,
      missionPinned: true, homeSectorId: SECTOR, tetherable: true,
      physicalRole: maw ? 'slag_core' : 'maw_slag',
      scanLabel: maw ? 'FURNACE MAW' : `CERES TRAFFIC — hot slag ${row.slot}/3`,
      ...(maw ? { furnaceMaw: true, ecology: { speciesId: 'furnace_maw', driveState: 'drift' } }
        : { payloadType: 'furnace_ore_pod', tetherPayload: true }),
    },
  };
}
export function syncMawWorksite(owner, m, toGlobal) {
  if (!isMawWorksite(m)) return false;
  if (m.params.mawLedgerInvalid || m.params.mawBodies?.some?.(row => row.lost)) {
    owner._sayStoryLine?.('Ceres traffic: the worksite cannot settle. This detail is void; return to the board for a fresh attempt.', 7);
    const index = owner.state.missions.active.indexOf(m);
    if (index >= 0) owner._failMission(m, index, m.params.mawLedgerInvalid ? 'maw_record_invalid' : 'maw_slag_lost');
    return true;
  }
  if (owner.state.world?.currentSectorId !== SECTOR) return true;
  if (!Array.isArray(m.params.mawBodies)) {
    // Versioned new offers have no earlier stuns. Never convert a malformed ledger into fresh supply.
    m.params.mawBodies = LOCAL.map((pos, slot) => ({ slot, pos: toGlobal(pos, SECTOR),
      vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 220, spent: false, lost: false }));
    m.params.mawStuns = 0;
  }
  const ids = [];
  for (const row of m.params.mawBodies) {
    const matches = (owner.state.entityList || []).filter(e => e?.alive !== false && belongs(e, m, row.slot));
    const live = matches.find(e => e.id === row.entityId) || matches[0];
    for (const duplicate of matches) if (duplicate !== live || row.spent || row.lost) duplicate.alive = false;
    if (row.spent || row.lost) continue;
    // An issued slot may be awaiting its destruction receipt. Only an explicit exit/load
    // clears runtime ids; absence during an active visit never licenses another body.
    if (!live && row.entityId != null) continue;
    const e = live || owner.helpers?.spawnEntity?.(specFor(m, row));
    if (!e) continue;
    row.entityId = e.id;
    ids.push(e.id);
  }
  m.targetEntityIds = [...new Set([...ids, ...(m.targetEntityIds || []).filter(id =>
    m.params.mawBodies.some(row => row.entityId === id && !row.spent && !row.lost))])];
  snapshotMawWorksite(owner, m);
  return true;
}
export function acceptMawImpact(owner, m, p) {
  if (!isMawWorksite(m) || m.params.mawLedgerInvalid) return false;
  if (p?.rating !== 'solid' && p?.rating !== 'crushing') return false;
  const rows = m.params.mawBodies;
  const maw = owner.state.entities.get(p.victimId);
  const mass = owner.state.entities.get(p.targetId);
  if (!rows || !belongs(maw, m, 0) || maw.alive === false || rows[0].entityId !== maw.id) return false;
  const slot = mass?.data?.mawSlot;
  if (!Number.isInteger(slot) || slot < 1 || slot > 3 || !belongs(mass, m, slot)
    || mass.alive === false || rows[slot].entityId !== mass.id || rows[slot].spent || rows[slot].lost) return false;
  rows[slot].spent = true;
  m.params.mawStuns = rows.slice(1).filter(row => row.spent).length;
  // The actual impact spends the supplied hot lot, not a cargo receipt or an ore reward.
  mass.alive = false;
  m.targetEntityIds = m.targetEntityIds.filter(id => id !== mass.id);
  return true;
}
export function loseMawBody(owner, m, p) {
  if (!isMawWorksite(m) || !Array.isArray(m.params.mawBodies)) return false;
  const row = m.params.mawBodies.find(row => row.entityId === p?.id);
  if (!row || row.spent) return false;
  const e = p.entity || owner.state.entities.get(p.id);
  if (!belongs(e, m, row.slot)) return false;
  row.lost = true;
  // Three supplied lots, three stuns: a lost round cannot be manufactured by leaving/loading.
  return true;
}

// Hard sector retirement is not a kill. Snapshot before removing exact-owned bodies, and
// detach runtime ids before the deferred destroyed lane observes their retirement.
export function parkMawWorksite(owner, m) {
  if (!isMawWorksite(m)) return false;
  snapshotMawWorksite(owner, m);
  for (const row of m.params.mawBodies || []) {
    const e = owner.state.entities.get(row.entityId);
    if (belongs(e, m, row.slot)) {
      e.alive = false;
      owner.helpers?.spawnBudget?.releaseEntity?.(e.id);
    }
    delete row.entityId;
  }
  m.targetEntityIds = [];
  return true;
}
export function mawWorksiteFocus(m, state, toGlobal) {
  if (!isMawWorksite(m)) return null;
  const at = slot => {
    const row = m.params.mawBodies?.[slot];
    const body = state.entities?.get(row?.entityId);
    return body?.alive !== false && belongs(body, m, slot) ? body : null;
  };
  const maw = at(0);
  const tether = state.player?.tether;
  const held = slot => tether?.active && at(slot)?.id === tether.targetId;
  if (m.params.mawLedgerInvalid) return { stationId: null, pos: toGlobal(LOCAL[0], SECTOR),
    label: 'Ceres worksite record unavailable', reason: 'The saved material record is invalid; no replacement supply or payment has been created.' };
  const stuns = m.params.mawStuns || 0;
  if (stuns >= 3 && held(0)) return { stationId: m.destStationId,
    label: 'Ceres yard — stunned Maw receiving berth', reason: 'Tow the stunned Maw to the yard, or sling it into the berth.' };
  const pending = m.params.mawBodies?.slice(1).filter(row => !row.spent && !row.lost) || [];
  const carryingSlag = pending.some(row => held(row.slot));
  const slot = stuns < 3 && !carryingSlag ? (pending[0]?.slot || 1) : 0;
  const body = at(slot);
  return { stationId: null, pos: body?.pos ? { x: body.pos.x, z: body.pos.z }
    : m.params.mawBodies?.[slot]?.pos || toGlobal(LOCAL[slot], SECTOR),
    presentationEntityId: body?.id || null,
    label: slot ? 'Ceres traffic — hot-slag staging' : 'Furnace Maw — refinery approach',
    reason: stuns >= 3 ? 'The Maw is stunned. Latch its body; Ceres yard will receive it.'
      : `${stuns}/3 stuns. ${carryingSlag ? 'Swing or sling the held hot-slag pod into the Maw for a solid hit.' : 'Latch a marked hot-slag pod. Swing or sling each of the three into the Maw; a lost pod voids the detail.'}` };
}
