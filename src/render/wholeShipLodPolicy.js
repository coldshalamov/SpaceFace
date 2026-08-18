// Whole-ship separate-file LOD policy. Geometry lives in the family catalog; this module only
// decides whether a non-player ship may demote, and which resident file to admit first.
//
// Player ships stay LOD0. Distant traffic may spawn at LOD1/LOD2 so the opening cohort does not
// upload every authored triangle for a speck. Hysteresis stays in lod.js; spawn uses a one-shot
// projected-pixel pick without hysteresis.

import { LOD_THRESHOLDS } from './lod.js';

export function normalizeRequestedLod(level) {
  if (level === 'lod1' || level === 'lod2' || level === 'lod0') return level;
  return 'lod0';
}

export function hasWholeShipLodFamily(selection) {
  const family = selection && selection.lodFamily;
  if (!family || !family.lod0) return false;
  return !!(family.lod1 || family.lod2);
}

/** Any non-player ship with a real LOD1/2 sibling may demote. Wasp is no longer a special case. */
export function canInstallWholeShipLodFamily(entity, selection) {
  if (!entity || entity.isPlayer === true) return false;
  return hasWholeShipLodFamily(selection);
}

export function lodFileFromFamily(family, level, fallback = null) {
  if (!family) return fallback;
  const key = normalizeRequestedLod(level);
  return family[key] || family.lod0 || fallback;
}

/** One-shot spawn/resident pick. Near contacts stay LOD0 so close quality does not change. */
export function selectSpawnLodLevel(projectedPx, thresholds = LOD_THRESHOLDS) {
  const px = Number(projectedPx);
  if (!Number.isFinite(px) || px <= 0) return 'lod2';
  if (px < Number(thresholds.LOD2_BELOW)) return 'lod2';
  if (px < Number(thresholds.LOD1_BELOW)) return 'lod1';
  return 'lod0';
}

export function wholeShipFamilyDefIds(familyByDefId = {}) {
  return Object.keys(familyByDefId).filter((defId) => hasWholeShipLodFamily({
    lodFamily: familyByDefId[defId],
  }));
}
