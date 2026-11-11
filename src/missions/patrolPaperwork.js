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

// A briefing is a view of what this pilot actually scanned, not a promise about Sorrel's hold.
export function patrolContractBrief(state, mission) {
  if (mission?.type !== 'patrol_clear' || mission.storyTag !== TAGS.cap_redcut_sorrel
    || mission.storyTarget?.namedCaptainId !== 'cap_redcut_sorrel') return null;
  const sable = normalizePatrolObservations(state?.aftermathWrecks?.patrolObservations).cap_sable_iask;
  return {
    how: 'Track Redcut Sorrel in Charon Expanse and clear the marked hull. After the fight, you can scan the wreck before stripping it. The scan is optional.',
    why: sable
      ? 'Sable’s label named Vale Holdings and three years of sealed administrative records. Sorrel is the second Patrol contract. If his wreck survives, compare its label yourself. Clearing the lane pays; a matching label would still not open either seal.'
      : 'Sorrel is the second Patrol contract. Clearing his marked hull finishes the chain. A surviving wreck may carry a readable label; scanning it is optional, and its contents remain sealed.',
  };
}

export function patrolPaperworkComparison(state) {
  const rows = normalizePatrolObservations(state?.aftermathWrecks?.patrolObservations);
  const sable = rows.cap_sable_iask, sorrel = rows.cap_redcut_sorrel;
  if (!sable || !sorrel || sable.missionId === sorrel.missionId
    || sable.markerId === sorrel.markerId) return ''; // Two labels must identify two independent hulls.
  return 'Two defeated hulls. The same owner: VALE HOLDINGS LLC. Sable and Sorrel both carried labels for three years of sealed administrative records. You read both labels, not the records inside. This does not identify Helix.';
}

export function patrolPaperworkAction(state) {
  const beat = state?.story?.beatIndex;
  if (state?.story?.branch !== 'patrol' || (beat !== 5 && beat !== 6)) return null;
  if (state.missions?.active?.some(m => m?.status === 'active' && /^campaign47a:b5:patrol:[12]$/.test(m.storyTag || ''))) return null;
  const observations = normalizePatrolObservations(state.aftermathWrecks?.patrolObservations);
  const pending = Object.values(state.aftermathWrecks?.bySector || {}).flat().find(marker =>
    normalizePatrolPaperwork(marker?.patrolPaperwork)
    && Object.values(marker.salvagePool || {}).some(qty => Number(qty) > 0) && !observations[marker.patrolPaperwork.captainId]);
  const caveat = state.story.flags?.weighing_receipt?.outcome === 'cleared_unverified'
    ? ' The Weighing remains unverified; this paperwork does not identify Helix.' : ' This paperwork does not identify Helix.';
  if (pending) return { tone: 'primary', label: 'WRECK RECORD',
    title: `Scan ${CAPTAINS[pending.patrolPaperwork.captainId]}’s wreck`,
    body: 'Find the defeated captain’s hulk in Charon Expanse. Fly within scanner range and pulse the scanner before stripping it. '
      + (beat === 5 ? 'The next patrol contract remains available.' : 'Patrol is complete. This scan is optional; you can leave and deploy your first income asset.') + caveat,
    meta: 'Optional evidence' };
  if (beat === 6) {
    const comparison = patrolPaperworkComparison(state);
    if (!comparison && !observations.cap_sable_iask && !observations.cap_redcut_sorrel) return null;
    const record = comparison || `${observations.cap_sable_iask ? 'Sable’s' : 'Sorrel’s'} wreck label names Vale Holdings and three years of sealed administrative records. You have no second observed label to compare. The contents remain sealed.`;
    return { tone: 'primary', label: 'ASSET', title: 'Carry the record forward',
      body: record + ' Patrol is complete. Deploy a drone, trader, or outpost to start earning while you fly.'
        + (state.story.flags?.weighing_receipt?.outcome === 'cleared_unverified' ? ' The Weighing remains unverified.' : ''),
      meta: comparison ? 'Two labels observed · contents sealed' : 'One label observed · contents sealed' };
  }
  if (observations.cap_sable_iask) return { tone: 'primary', label: 'CHAIN', title: 'Take the next Patrol contract',
    body: 'Sable’s wreck record names Vale Holdings and three years of sealed administrative records. You read the label, not its contents. Return to Coalition for the next contract.' + caveat,
    meta: 'Wreck record observed' };
  return null;
}
