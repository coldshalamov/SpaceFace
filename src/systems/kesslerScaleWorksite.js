// Scale 4 is the existing Tethys receiver, not a new station or a Tycho alias.
// Furniture flanks an OPEN measuring volume. No platform crosses the 90 WU ring.
// These are ordinary registered place bodies; the adapter uses the same measured
// skin/draw-scale owner as world dressing, never a hand-sized ball collider.
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { KESSLER_SCALE } from '../data/kessler.js';

const APPROACH = Object.freeze({ x: 330 / Math.hypot(330, 1360), z: 1360 / Math.hypot(330, 1360) });
export const KESSLER_WORKSITE = Object.freeze([
  Object.freeze({ key: 'freight', placeId: 'place_freight_platform', across: -138, along: 15, radius: 56, name: 'Scale 4 · freight apron' }),
  Object.freeze({ key: 'inspection', placeId: 'place_inspection_platform', across: 132, along: 10, radius: 20, name: 'Scale 4 · inspection desk' }),
  Object.freeze({ key: 'tally', placeId: 'place_tally_post', across: 0, along: -128, radius: 16, name: 'Scale 4 · tally' }),
  Object.freeze({ key: 'rack', placeId: 'place_container_rack', across: -102, along: -122, radius: 32, name: 'Scale 4 · counted freight rack' }),
]);

export function kesslerPadPosition() {
  return sectorLocalToGlobalForSector(KESSLER_SCALE.pad, KESSLER_SCALE.sectorId);
}

export function kesslerWorksiteSpecs() {
  const pad = kesslerPadPosition();
  return KESSLER_WORKSITE.map((part) => ({
    pos: {
      x: pad.x + APPROACH.z * part.across + APPROACH.x * part.along,
      z: pad.z - APPROACH.x * part.across + APPROACH.z * part.along,
    },
    rot: Math.atan2(-APPROACH.x, APPROACH.z),
    radius: part.radius, homeSectorId: KESSLER_SCALE.sectorId,
    data: {
      kesslerWorksite: part.key, placeId: part.placeId,
      worldDressing: true, everydaySpaceKit: true, paletteClass: 'core',
      placeScale: 1, placeRadius: part.radius, visualRadius: part.radius,
      homeSectorId: KESSLER_SCALE.sectorId, sectorId: KESSLER_SCALE.sectorId,
      name: part.name,
    },
  }));
}

export function kesslerReceiptLabel(plate, honest) {
  return `Scale 4 · plate ${plate.toFixed(1)}t / stamp ${honest.toFixed(1)}t · freight retained`;
}

/** Only the recorded alloy handoff opens this ordinary Book 1 task. Legacy beat
 * numbers/variance flags alone do not invent an uncompleted modern contract. */
export function kesslerScalePending(state) {
  if (state?.story?.beatIndex !== 1) return false;
  const completed = state.story.campaign47a?.stepProgress?.['1']?.completed;
  return Array.isArray(completed) && completed.includes('alloy_run')
    && !completed.includes('scale_4') && !completed.includes('infested');
}

export function kesslerScaleWaypoint(state) {
  if (!kesslerScalePending(state)) return null;
  return {
    kind: 'story', storyBeat: 1, label: 'Scale 4 · weigh your own freight',
    sectorId: KESSLER_SCALE.sectorId, sectorName: 'Tethys Junction',
    stationId: null, pos: kesslerPadPosition(),
    reason: 'Use any fresh jettisoned cargo pod; the delivered alloys are not required. Buy or mine unreserved cargo if needed, jettison a lot from your hold, then bring that pod inside the Scale 4 ring and settle it at 8 WU/s or below. Read plate against stamp; keep your freight.',
  };
}
