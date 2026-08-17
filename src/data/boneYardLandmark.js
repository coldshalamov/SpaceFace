// PR95 Plan 25 — The Bone Yard landmark contract.
//
// This is inert authored truth. Salvage owns the physical wrecks and conserved source pools;
// anomalyRuntime owns the scavenger wildlife; traffic owns NPC cutters and their claims.

import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

const SECTOR_ID = 'sector_charon_expanse';
const LOCAL_CENTER = Object.freeze({ x: 2450, z: 900 });
const GLOBAL_CENTER = Object.freeze(sectorLocalToGlobalForSector(LOCAL_CENTER, SECTOR_ID));
const RING_RADIUS = 690;
const SEGMENT_COUNT = 18;

function segment(slot) {
  const angle = (slot / SEGMENT_COUNT) * Math.PI * 2;
  const stagger = (slot % 3 - 1) * 26;
  const radius = RING_RADIUS + stagger;
  return Object.freeze({
    id: `bone-yard-segment-${String(slot + 1).padStart(2, '0')}`,
    slot,
    angle,
    radius: 48 + (slot % 4) * 7,
    rot: angle + Math.PI * 0.5 + ((slot % 2) ? 0.17 : -0.11),
    pos: Object.freeze({
      x: GLOBAL_CENTER.x + Math.cos(angle) * radius,
      z: GLOBAL_CENTER.z + Math.sin(angle) * radius,
    }),
  });
}

export const BONE_YARD_SEGMENTS = Object.freeze(
  Array.from({ length: SEGMENT_COUNT }, (_, slot) => segment(slot)),
);

const SOURCE_SLOTS = Object.freeze([0, 6, 12]);

export const BONE_YARD_SALVAGE_SOURCES = Object.freeze(SOURCE_SLOTS.map((slot, index) => {
  const segmentDef = BONE_YARD_SEGMENTS[slot];
  const salvagePointId = `zone_charon_bone_yard:sal${index}`;
  return Object.freeze({
    sourceKey: `salvage-point:${SECTOR_ID}:${salvagePointId}`,
    salvagePointId,
    sectorId: SECTOR_ID,
    zoneId: 'zone_charon_bone_yard',
    segmentId: segmentDef.id,
    pool: Object.freeze(index === 1
      ? { cmdty_scrap_metal: 5, cmdty_salvage_electronics: 3 }
      : { cmdty_scrap_metal: 7, cmdty_salvage_electronics: 1 }),
    pos: segmentDef.pos,
    homeStationId: 'station_expanse',
    wildlifeAnchor: index === 0,
  });
}));

export const BONE_YARD = Object.freeze({
  id: 'landmark_bone_yard',
  name: 'The Bone Yard',
  sectorId: SECTOR_ID,
  zoneId: 'zone_charon_bone_yard',
  mapTargetId: 'zone_charon_bone_yard',
  localCenter: LOCAL_CENTER,
  globalCenter: GLOBAL_CENTER,
  ringRadius: RING_RADIUS,
  revealRadius: 980,
  sourceStationId: 'station_expanse',
  rumorId: 'frontier-rumor:station_expanse:bone-yard',
  rumorText: 'Cinder crews say the old hulls make a moon-wide ring east of the refinery. Follow the broken bows until they curve back on themselves; the uncut plates draw scavengers and jump-claims.',
  salvageSources: BONE_YARD_SALVAGE_SOURCES,
});

export function boneYardSalvageSource(sourceKey) {
  return BONE_YARD_SALVAGE_SOURCES.find((source) => source.sourceKey === sourceKey) || null;
}

export default BONE_YARD;
