import { stableRecordId, RECORD_KIND } from '../world/worldRecords.js';
// B5's paperwork is a witnessed wreck record, never cargo, a reward, or a chain gate.
// aftermathWrecks owns capture, observation and persistence; UI reads these pure views.
const SECTOR = 'sector_charon_expanse';
const OWNER = 'VALE HOLDINGS LLC';
const CARGO = 'ADMINISTRATIVE RECORDS — 3 YEARS / SEALED';
const CAPTAINS = Object.freeze({ cap_sable_iask: 'Sable Iask', cap_redcut_sorrel: 'Redcut Sorrel' });
const TAGS = Object.freeze({ cap_sable_iask: 'campaign47a:b5:patrol:1', cap_redcut_sorrel: 'campaign47a:b5:patrol:2' });
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\x00-\x1f]/.test(value);

export function normalizePatrolPaperwork(input) {
  if (!input || input.version !== 1 || !Object.hasOwn(CAPTAINS, input.captainId)
    || input.storyTag !== TAGS[input.captainId] || !text(input.missionId)
    || input.owner !== OWNER || input.cargo !== CARGO) return null;
  return { version: 1, captainId: input.captainId, missionId: input.missionId,
    storyTag: input.storyTag, owner: OWNER, cargo: CARGO };
}

export function capturePatrolPaperwork(state, entity) {
  const data = entity?.data;
  if (!data || entity.type !== 'ship' || entity.alive !== false
    || state?.entities?.get(entity.id) !== entity || state.world?.currentSectorId !== SECTOR) return null;
  const mission = state.missions?.active?.find(row => row?.targetEntityIds?.includes(entity.id));
  const target = mission?.storyTarget, captainId = target?.namedCaptainId;
  if (!mission || mission.status !== 'active' || mission.type !== 'patrol_clear'
    || !Object.hasOwn(CAPTAINS, captainId) || target.id !== captainId
    || mission.storyTag !== TAGS[captainId] || mission.destSectorId !== SECTOR) return null;
  const key = `mission:${mission.id}:0`;
  if (data.identityKey !== key || data.worldRecordId !== stableRecordId(
    state.meta?.seed || 1, SECTOR, RECORD_KIND.MISSION_TARGET, key)
    || [data.missionId, data.missionTag].some(id => id != null && id !== mission.id)
    || data.missionTargetSlot != null && data.missionTargetSlot !== 0
    || data.storyTargetId != null && data.storyTargetId !== captainId
    || [entity.homeSectorId, data.homeSectorId, data.sectorId].some(id => id != null && id !== SECTOR)) return null;
  // worldRecords intentionally omits decorative stamps and sometimes slot. The exact durable
  // record + current target list identify the hull; its accepted contract supplies the label.
  return normalizePatrolPaperwork({ version: 1, captainId, missionId: mission.id,
    storyTag: mission.storyTag, owner: target.lastRegisteredOwner, cargo: target.salvageCargo });
}

export function normalizePatrolObservations(input) {
  const out = {};
  for (const id of Object.keys(CAPTAINS)) {
    const row = input?.[id], paper = normalizePatrolPaperwork(row);
    if (!paper || paper.captainId !== id || !text(row.markerId) || row.sectorId !== SECTOR
      || !Number.isFinite(row.observedAt) || row.observedAt < 0) continue;
    out[id] = { ...paper, markerId: row.markerId, sectorId: SECTOR, observedAt: row.observedAt };
  }
  return out;
}

export function patrolPaperworkText(paper) {
  const row = normalizePatrolPaperwork(paper);
  return row ? `${CAPTAINS[row.captainId]}: ${row.owner}; ${row.cargo}. The seal remains closed.` : '';
}

export function patrolPaperworkAction(state) {
  if (state?.story?.branch !== 'patrol' || state.story.beatIndex !== 5) return null;
  if (state.missions?.active?.some(m => m?.status === 'active' && /^campaign47a:b5:patrol:[12]$/.test(m.storyTag || ''))) return null;
  const observations = normalizePatrolObservations(state.aftermathWrecks?.patrolObservations);
  const pending = Object.values(state.aftermathWrecks?.bySector || {}).flat().find(marker =>
    normalizePatrolPaperwork(marker?.patrolPaperwork)
    && Object.values(marker.salvagePool || {}).some(qty => Number(qty) > 0) && !observations[marker.patrolPaperwork.captainId]);
  const caveat = state.story.flags?.weighing_receipt?.outcome === 'cleared_unverified'
    ? ' The Weighing remains unverified; this paperwork does not identify Helix.' : ' This paperwork does not identify Helix.';
  if (pending) return { tone: 'primary', label: 'WRECK RECORD',
    title: `Scan ${CAPTAINS[pending.patrolPaperwork.captainId]}’s wreck`,
    body: 'Find the defeated captain’s hulk in Charon Expanse. Fly within scanner range and pulse the scanner before stripping it. The next patrol contract remains available.' + caveat,
    meta: 'Optional evidence' };
  if (observations.cap_sable_iask) return { tone: 'primary', label: 'CHAIN', title: 'Take the next Patrol contract',
    body: 'Sable’s wreck record names Vale Holdings and three years of sealed administrative records. You read the label, not its contents. Return to Coalition for the next contract.' + caveat,
    meta: 'Wreck record observed' };
  return null;
}
