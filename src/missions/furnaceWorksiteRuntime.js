import { sectorMembershipAtGlobal } from '../data/sectorCoordinates.js';
// A subroutine of the existing mission owner, not another registered cargo/world owner.
import { furnaceDetail, authoredFurnaceWorksite, furnaceLots, furnaceLotSpec,
  furnaceMites, furnaceMiteClearance } from './furnaceWorksite.js';
function ownedBody(e, m, slot, allowDead = false) {
  return (allowDead || e?.alive !== false) && e?.type === 'payload'
    && e.data?.persistenceOwner === 'missionFurnaceWorksite' && e.data.furnaceLotVersion === 1
    && e.data.furnaceMissionId === m.id && e.data.furnaceLotSlot === slot;
}
export function snapshotFurnaceWorksite(owner, m) {
  if (!Array.isArray(m?.params?.furnaceLots)) return;
  for (const lot of m.params.furnaceLots) {
    const live = owner.state.entities?.get(lot.entityId);
    if (!ownedBody(live, m, lot.slot) || lot.received || lot.lost) continue;
    lot.pos = { x: live.pos.x, z: live.pos.z };
    lot.sectorId = sectorMembershipAtGlobal(live.pos);
    lot.vel = { x: live.vel?.x || 0, z: live.vel?.z || 0 };
    lot.rot = live.rot || 0; lot.angVel = live.angVel || 0; lot.hull = live.hull;
  }
}
export function retireFurnaceWorksite(owner, m) {
  // Settling a contract releases borrowed targets, not living bodies in another owner's
  // custody. The finite material ledger is retained by the mission aftermath path.
  snapshotFurnaceWorksite(owner, m);
  m.targetEntityIds = [];
  if (m.params?.furnaceWorksiteVersion === 1 && Array.isArray(m.params.furnaceLots)) {
    owner.state.missions.furnaceWorksiteAftermath = { version: 1, missionId: m.id, lots: m.params.furnaceLots, ...(m.params.furnaceLedgerInvalid ? { invalid: true } : {}) };
  }
}
export function syncFurnaceWorksite(owner, m) {
  if (!authoredFurnaceWorksite(m) && !m._furnaceAftermath) return false;
  const previous = owner.state.missions.furnaceWorksiteAftermath;
  if (authoredFurnaceWorksite(m) && previous) {
    for (const e of owner.state.entityList || []) {
      if (e?.data?.persistenceOwner === 'missionFurnaceWorksite' && e.data.furnaceMissionId === previous.missionId) e.data.furnaceMissionId = m.id;
    }
    m.params.furnaceLots = previous.lots;
    if (previous.invalid) m.params.furnaceLedgerInvalid = true;
    m.params.furnaceFeeds = previous.lots.filter(row => row.received).length;
    m.params.furnaceLosses = previous.lots.filter(row => row.lost && !row.received).length;
    delete owner.state.missions.furnaceWorksiteAftermath;
  }
  if (m.params.furnaceLedgerInvalid) {
    if (!m._furnaceInvalidAnnounced) {
      m._furnaceInvalidAnnounced = true;
      owner.bus.emit('toast', { kind: 'warn', ttl: 8, text: 'The saved refinery cargo ledger is invalid. This detail is paused; no replacement cargo or payment was created.' });
    }
    return true;
  }
  if (owner.state.world?.currentSectorId !== m.destSectorId && !Array.isArray(m.params.furnaceLots)) return true;
  for (const lot of furnaceLots(m)) {
    const matches = (owner.state.entityList || []).filter(e => ownedBody(e, m, lot.slot));
    const live = matches.find(e => e.id === lot.entityId) || matches[0];
    for (const extra of matches) if (extra !== live) owner.helpers.removeEntity?.(extra.id);
    if (lot.received || lot.lost) {
      if (live) owner.helpers.removeEntity?.(live.id);
      continue;
    }
    if (live) lot.entityId = live.id;
    else {
      lot.sectorId = sectorMembershipAtGlobal(lot.pos);
      if (lot.sectorId !== owner.state.world?.currentSectorId) continue;
      const body = owner.helpers.spawnEntity?.(furnaceLotSpec(m, lot));
      if (body) lot.entityId = body.id;
    }
  }
  snapshotFurnaceWorksite(owner, m);
  if (!authoredFurnaceWorksite(m)) return false; // Legacy active quota/progress is not migrated.
  // These are borrowed ecology references, never mission-tagged combatants. Ecology owns
  // their drive, harvest, death ledger and rematerialization; no generic quarry is spawned.
  m.targetEntityIds = furnaceMites(owner.state).map(e => e.id);
  const cleared = furnaceMiteClearance(owner.state);
  const prior = m.objectiveProgress;
  m.params.furnaceClearedKeys = cleared;
  m.objectiveProgress = Math.min(m.objectiveTarget, cleared.length);
  if (m.objectiveProgress >= m.objectiveTarget && owner._bookExtrasSatisfied(m)) {
    const index = owner.state.missions.active.indexOf(m);
    if (index >= 0) { prepareFurnaceSettlement(owner, m); owner._completeMission(m, index); }
  } else if (prior !== m.objectiveProgress) {
    owner.bus.emit('mission:updated', { missionId: m.id, objectiveProgress: m.objectiveProgress,
      source: 'refinery_clearance', playerKillCredit: false });
    owner._sayStoryLine?.(`Refinery worksite: ${cleared.length}/4 mite sites clear. Disposal lots: ${m.params.furnaceFeeds || 0}/3.`, 5);
  }
  return true;
}

// One physical worksite, not a mission-history cache. Only this owner writes these slots.
export function normalizeFurnaceAftermath(raw) {
  if (raw?.version === 1 && typeof raw.missionId === 'string' && raw.missionId && raw.invalid === true) return { version: 1, missionId: raw.missionId, invalid: true, lots: [] };
  if (raw?.version !== 1 || typeof raw.missionId !== 'string' || !raw.missionId
    || !Array.isArray(raw.lots) || raw.lots.length !== 3) return null;
  const lots = [];
  for (let slot = 0; slot < 3; slot++) {
    const row = raw.lots[slot];
    if (row?.slot !== slot || !Number.isFinite(row.pos?.x) || !Number.isFinite(row.pos?.z)
      || !Number.isFinite(row.hull) || row.hull < 0 || row.hull > 220
      || (row.received != null && typeof row.received !== 'boolean')
      || (row.lost != null && typeof row.lost !== 'boolean')
      || (row.received === true && row.lost === true)) return null;
    lots.push({ slot, sectorId: sectorMembershipAtGlobal(row.pos), received: row.received === true, lost: row.lost === true || (!row.received && row.hull === 0),
      pos: { x: row.pos.x, z: row.pos.z },
      vel: { x: Number.isFinite(row.vel?.x) ? row.vel.x : 0, z: Number.isFinite(row.vel?.z) ? row.vel.z : 0 },
      rot: Number.isFinite(row.rot) ? row.rot : 0, angVel: Number.isFinite(row.angVel) ? row.angVel : 0,
      hull: row.hull });
  }
  return { version: 1, missionId: raw.missionId, lots };
}
function aftermathMission(record) {
  return { id: record.missionId, status: 'active', storyTag: 'campaign47a:b1:infested',
    _furnaceAftermath: true, destSectorId: 'sector_ceres_belt', params: { furnaceFeedsNeeded: 3, furnaceLots: record.lots, furnaceLedgerInvalid: record.invalid === true } };
}
export function snapshotFurnaceAftermath(owner) {
  const record = owner.state.missions.furnaceWorksiteAftermath;
  if (record) snapshotFurnaceWorksite(owner, aftermathMission(record));
}
export function restoreFurnaceAftermath(owner, raw) {
  const record = normalizeFurnaceAftermath(raw);
  if (record) owner.state.missions.furnaceWorksiteAftermath = record;
  else if (raw != null) owner.state.missions.furnaceWorksiteAftermath = { version: 1, missionId: typeof raw.missionId === 'string' && raw.missionId ? raw.missionId : 'invalid_refinery_record', invalid: true, lots: [] };
  else delete owner.state.missions.furnaceWorksiteAftermath;
}
export function materializeFurnaceAftermath(owner, sectorId) {
  const record = owner.state.missions.furnaceWorksiteAftermath;
  if (!record || !sectorId) return;
  // Active retry adopts this singleton first; never materialize two writers for one site.
  const active = owner.state.missions.active?.find(authoredFurnaceWorksite);
  if (active) { syncFurnaceWorksite(owner, active); return; }
  syncFurnaceWorksite(owner, aftermathMission(record));
}
export function recordFurnaceAftermathFact(owner, p, kind) {
  const record = owner.state.missions.furnaceWorksiteAftermath;
  if (!record) return false;
  const e = owner.state.entities?.get(kind === 'received' ? p.entityId : p.id);
  if (!e || (p.entity && p.entity !== e) || (kind === 'lost' && e.alive !== false)) return false;
  const lot = record.lots.find(row => ownedBody(e, { id: record.missionId }, row.slot, true)
    && row.entityId === e.id && !row.received && !row.lost);
  if (!lot || (kind === 'received' && (!e._furnaceTaken || p.missionId !== record.missionId
    || p.lotSlot !== lot.slot || p.sectorId !== 'sector_ceres_belt'))) return false;
  if (kind === 'lost' && e._furnaceTaken) return false;
  lot[kind] = true;
  return true;
}

export function prepareFurnaceSettlement(owner, m) {
  if (!authoredFurnaceWorksite(m)) return;
  const received = furnaceLots(m).filter(row => row.received).length;
  const lost = furnaceLots(m).filter(row => row.lost && !row.received).length;
  if (received + lost !== 3 || m.objectiveProgress < 4) return;
  const p = m.params;
  p.furnaceFeeds = received; p.furnaceLosses = lost;
  if (!Number.isFinite(p.furnaceRewardBase)) p.furnaceRewardBase = Math.max(0, Number(m.reward_cr) || 0);
  m.reward_cr = Math.floor(p.furnaceRewardBase * received / 3);
  p.furnaceOutcome = lost === 3 ? 'clearance_only_cargo_lost' : lost ? 'partial_disposal' : 'full_disposal';
  if (lost) m.title = `Refinery cleared — ${received} pods received, ${lost} lost`;
  if (!p.furnaceSettlementAnnounced) {
    p.furnaceSettlementAnnounced = true;
    owner.bus.emit('toast', { kind: lost ? 'warn' : 'success', ttl: 7,
      text: `Refinery site cleared. CR-FEED received ${received}/3 pods; ${lost} destroyed. Disposal payment: ${m.reward_cr} cr.` });
  }
}
