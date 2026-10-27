// One authored Book2 visit. Receipt authority is the encounter owner, never event payloads.
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
export const NEST_VISIT = Object.freeze({
  version: 1, encounterId: 'campaign47a:charon:nest:v1', sectorId: 'sector_charon_expanse',
  // Source-measured south-lane berth, clear of authored fields; dynamic occupancy is checked at admission.
  localPos: Object.freeze({ x: 200, z: -2800 }),
  approachOffset: Object.freeze({ x: 650, z: 0 }),
  arrivalRadius: 140, coreClearance: 200,
});
export const NEST_OUTCOMES = Object.freeze(['carrier_down', 'carrier_gutted', 'nest_emptied', 'carrier_escapes']);
export function nestPosition() { return sectorLocalToGlobalForSector(NEST_VISIT.localPos, NEST_VISIT.sectorId); }
export function nestApproach() {
  const p = nestPosition(); return { x: p.x + NEST_VISIT.approachOffset.x, z: p.z + NEST_VISIT.approachOffset.z };
}
const finitePos = p => p && Number.isFinite(p.x) && Number.isFinite(p.z)
  && Math.abs(p.x) < 1e8 && Math.abs(p.z) < 1e8 ? { x: p.x, z: p.z } : null;
export function normalizeNestVisit(raw) {
  if (!raw || raw.version !== 1 || !['waiting', 'active', 'terminal'].includes(raw.status)) return null;
  if (raw.status !== 'terminal' && raw.sectorId !== NEST_VISIT.sectorId) return null;
  const encounterId = typeof raw.encounterId === 'string' && raw.encounterId.length <= 160 ? raw.encounterId : NEST_VISIT.encounterId;
  const row = { version: 1, status: raw.status, encounterId,
    anchor: finitePos(raw.anchor) || nestPosition(), sectorId: NEST_VISIT.sectorId,
    snapshot: null, receipt: null };
  if (raw.status === 'terminal') {
    const r = raw.receipt;
    if (!r || r.sectorId !== NEST_VISIT.sectorId || r.encounterId !== encounterId || r.shape !== 'the_nest'
        || !NEST_OUTCOMES.includes(r.outcome) || !Number.isFinite(r.t) || r.t < 0) return null;
    row.receipt = { encounterId, shape: 'the_nest', outcome: r.outcome,
      sectorId: typeof r.sectorId === 'string' ? r.sectorId : NEST_VISIT.sectorId, t: r.t };
  } else if (raw.status === 'active') {
    // The runtime separately validates every actor field before admission. Keep no entity refs.
    try {
      const encoded = JSON.stringify(raw.snapshot);
      if (!encoded || encoded.length > 32768) return null;
      row.snapshot = JSON.parse(encoded);
      if (!row.snapshot || row.snapshot.version !== 1) return null;
    } catch { return null; }
  }
  return row;
}
export function nestOutcomeReceipt(state, payload = null) {
  const own = normalizeNestVisit(state?.encounterDirector?.nestVisit);
  if (!own || own.status !== 'terminal') return null;
  const r = own.receipt;
  if (payload && (payload.encounterId !== r.encounterId || payload.shape !== r.shape
      || payload.outcome !== r.outcome || (payload.sectorId != null && payload.sectorId !== r.sectorId))) return null;
  return { ...r };
}
export function nestWaypoint(state) {
  const own = normalizeNestVisit(state?.encounterDirector?.nestVisit);
  if (Object.prototype.hasOwnProperty.call(state?.encounterDirector || {}, 'nestVisit') && !own) {
    return { label: 'The Nest — visit record unavailable', reason: 'The saved visit cannot be reconstructed safely. No encounter victory or replacement cast is credited.',
      stationId: null, sectorId: NEST_VISIT.sectorId, targetEntityId: null, pos: null };
  }
  const live = own?.status === 'active' ? state?.encounterDirector?.live?.[own.encounterId] : null;
  const anchor = own?.status === 'active' ? finitePos(own.snapshot?.carrier?.pos) || own.anchor : nestPosition();
  const carrier = live?.data?.nest?.carrierId != null ? state.entities?.get(live.data.nest.carrierId) : null;
  const compact = (live?.data?.nest?.broodVariant || own?.snapshot?.broodVariant) === 'nursery_compact_v1';
  const handling = compact
    ? 'The compact 16t nursery Wasps fit Class I and a bare Line'
    : 'These standard 16t Wasps need Class I capacity AND current Line rating T1';
  return { label: own?.status === 'active' ? 'The Nest — cycling bays' : 'The Nest — south radiation-lane approach',
    reason: own?.status === 'waiting' && state.encounterDirector.nestVisit.waitReason
      ? 'Nursery signal acquired. Other lane traffic must clear first. Hold at the outside approach; do not fly into the berth. No victory or progress is being credited while admission waits.'
      : own?.status === 'active'
      ? `Watch GUARDED change to EXPOSED COUPLING. ${handling}: use the Line to drive one into the exposed coupling. Real contact is required; holding it nearby does nothing. The 400t salvaged blast baffles need Class III capacity AND current Line rating T1; guns or withdrawing alive remain valid.`
      : 'The garden growth is recorded. Approach the south-lane nursery from the east. A Reach carrier launches six compact 16t nursery Wasps; watch the exposed couplings, fight or withdraw alive. Ripping the salvaged blast baffles is optional, not a required upgrade.',
    stationId: null, sectorId: NEST_VISIT.sectorId,
    // Keep navigation outside the hull even during combat; selection remains an explicit action.
    targetEntityId: null, pos: carrier?.pos
      ? { x: carrier.pos.x + NEST_VISIT.approachOffset.x, z: carrier.pos.z }
      : { x: anchor.x + NEST_VISIT.approachOffset.x, z: anchor.z } };
}
