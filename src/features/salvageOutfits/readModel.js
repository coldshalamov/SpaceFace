// Read-only projection. Stable slots keep the host-driven overlay allocation-free after init.
export const SALVAGE_OUTFITS_VIEW_CAPS = Object.freeze({ meetings: 3, crews: 6, cargo: 18 });

const CREW_NAMES = Object.freeze({ keel: 'Keel Union', latch: 'Latchkey', player: 'You' });
const STATUS_TEXT = Object.freeze({
  approach: 'Approaching', tow: 'Towing', stalled: 'Tow stalled', idle: 'Looking for work',
  departing: 'Heading home', departed: 'Departed', destroyed: 'Hull lost', live: 'Loose salvage', delivered: 'Recovered',
  salvaged: 'Stripped', working: 'Work in progress', complete: 'Job worked',
});

function slot() { return { pos: { x: 0, z: 0 }, targetPos: { x: 0, z: 0 } }; }
export function createSalvageOutfitsReadModel() {
  return {
    meetingCount: 0, crewCount: 0, cargoCount: 0,
    meetings: Array.from({ length: SALVAGE_OUTFITS_VIEW_CAPS.meetings }, slot),
    crews: Array.from({ length: SALVAGE_OUTFITS_VIEW_CAPS.crews }, slot),
    cargo: Array.from({ length: SALVAGE_OUTFITS_VIEW_CAPS.cargo }, slot),
    _near: Array.from({ length: SALVAGE_OUTFITS_VIEW_CAPS.meetings }, () => ({ meeting: null, distance: Infinity })),
  };
}

export function salvageOutfitEntity(state, record) {
  if (!record || !record.key) return null;
  const entity = state?.entities?.get?.(record.entityId);
  if (!entity || entity.alive === false || entity.data?.salvageOutfitKey !== record.key) return null;
  // Generation is runtime-only. A restored body acquires its newly materialized generation;
  // a same-key stale binding must never annotate the next occupant of a recycled numeric slot.
  const generation = record.generation ?? record.occupantGeneration;
  if (generation != null && entity.occupantGeneration !== generation) return null;
  return entity;
}

/** Continuous sector membership changes keep nearby native originals in the entity journal.
 * Home-sector metadata alone must neither hide these bodies nor conjure an absent meeting.
 */
export function salvageOutfitMeetingPresent(state, meeting) {
  for (const id in meeting?.crews) if (salvageOutfitEntity(state, meeting.crews[id])) return true;
  for (const id in meeting?.bodies) if (salvageOutfitEntity(state, meeting.bodies[id])) return true;
  return false;
}

function copyPos(out, pos) {
  out.x = Number.isFinite(pos?.x) ? pos.x : 0;
  out.z = Number.isFinite(pos?.z) ? pos.z : 0;
}

/** No mutation of the supplied state or entities. Unknown/recycled body IDs never acquire cues. */
export function writeSalvageOutfitsReadModel(state, out = createSalvageOutfitsReadModel()) {
  out.meetingCount = 0; out.crewCount = 0; out.cargoCount = 0;
  for (let i = 0; i < out._near.length; i++) {
    out._near[i].meeting = null; out._near[i].distance = Infinity;
  }
  const sectorId = state?.world?.currentSectorId;
  const player = state?.entities?.get?.(state.playerId);
  const px = Number(player?.pos?.x) || 0, pz = Number(player?.pos?.z) || 0;
  const meetings = state?.salvageOutfits?.meetings;
  for (const id in meetings) {
    const meeting = meetings[id];
    if (!meeting || meeting.sectorId !== sectorId && !salvageOutfitMeetingPresent(state, meeting)) continue;
    const distance = Math.hypot((meeting.anchor?.x || 0) - px, (meeting.anchor?.z || 0) - pz);
    for (let i = 0; i < out._near.length; i++) {
      const previous = out._near[i];
      // Finished sites must not crowd an active race out of the bounded view on repeat visits.
      const active = meeting.status === 'working', previousActive = previous.meeting?.status === 'working';
      if (previous.meeting && (previousActive && !active
        || previousActive === active && distance >= previous.distance)) continue;
      for (let j = out._near.length - 1; j > i; j--) {
        out._near[j].meeting = out._near[j - 1].meeting;
        out._near[j].distance = out._near[j - 1].distance;
      }
      out._near[i].meeting = meeting; out._near[i].distance = distance;
      break;
    }
  }
  for (let i = 0; i < out._near.length; i++) {
    const meeting = out._near[i].meeting;
    if (!meeting) continue;
    const mr = out.meetings[out.meetingCount++];
    mr.id = meeting.id; mr.status = meeting.status; mr.variant = meeting.variant;
    mr.distance = out._near[i].distance;
    mr.agreement = meeting.agreement?.type || null;
    mr.agreementStatus = meeting.agreement?.status || null;
    copyPos(mr.pos, meeting.receiver);
    for (const id in meeting.crews) {
      if (out.crewCount >= out.crews.length) break;
      const crew = meeting.crews[id], row = out.crews[out.crewCount++];
      const entity = salvageOutfitEntity(state, crew);
      const target = meeting.bodies?.[crew.targetId];
      const targetEntity = salvageOutfitEntity(state, target);
      row.id = crew.id || id; row.meetingId = meeting.id; row.crewId = id;
      row.entityId = entity?.id ?? null; row.materialized = !!entity;
      row.name = CREW_NAMES[id] || id; row.status = crew.status;
      row.statusText = STATUS_TEXT[crew.status] || crew.status;
      row.targetId = crew.targetId || null; row.targetLabel = target?.label || null;
      row.targetMaterialized = !!targetEntity;
      row.loaded = crew.status === 'tow';
      row.hasTarget = !!target && target.status === 'live';
      copyPos(row.pos, entity?.pos || crew.pos);
      copyPos(row.targetPos, targetEntity?.pos || target?.pos);
    }
    for (const id in meeting.bodies) {
      if (out.cargoCount >= out.cargo.length) break;
      const body = meeting.bodies[id], row = out.cargo[out.cargoCount++];
      const entity = salvageOutfitEntity(state, body);
      row.id = body.id || id; row.meetingId = meeting.id;
      row.entityId = entity?.id ?? null; row.materialized = !!entity;
      row.label = body.label; row.status = body.status;
      row.statusText = STATUS_TEXT[body.status] || body.status;
      row.claim = body.claim || null; row.claimLabel = CREW_NAMES[body.claim] || 'Unclaimed';
      row.selected = entity?.id != null && entity.id === state?.player?.targetId;
      copyPos(row.pos, entity?.pos || body.pos);
    }
  }
  return out;
}

export function getSalvageOutfitsReadModel(state) {
  return writeSalvageOutfitsReadModel(state);
}
