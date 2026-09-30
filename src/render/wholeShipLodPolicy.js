// Whole-ship separate-file LOD policy. Geometry lives in the family catalog; this module only
// decides whether a non-player ship may demote, and which resident file to admit first.
//
// Player ships stay LOD0. Distant traffic may spawn at LOD1/LOD2 so the opening cohort does not
// upload every authored triangle for a speck. Hysteresis stays in lod.js; spawn uses a one-shot
// projected-pixel pick without hysteresis.

import { LOD_THRESHOLDS } from './lod.js';

// OWNER RULING 2026-09-29 — the frame is sacred. SpaceFace is top-down: nothing on the glass is
// ever "far", and the separate-file demotion loaded a SECOND model for a ship the player was
// already looking at (full body arrives → per-frame selector demotes to LOD1 → LOD1 GLB decodes,
// composes, compiles and swaps on screen: three bodies in a few seconds, "the ship is a box and
// then it's a ship"). At the default zoom (144) LOD1 was the NORMAL state, so every ship paid the
// swap. Runtime demotion is off: a live ship keeps the body its admission built. The instant
// in-file LOD toggles (installAuthoredLod) and HLOD greeble hiding still shave detail when zoomed
// out without loading anything. The catalog, the file map and the pure transition resolver stay
// (tools and tests use them); only the live controller and prewarm read this flag.
export const WHOLE_SHIP_LOD_RUNTIME_DEMOTION = false;

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

/**
 * Separate-file LOD family swap. An in-flight demotion must not commit after the ship has already
 * returned to a resident level (close pass after a distant lod2 request).
 */
export function resolveWholeShipLodTransition(activeLevel, requestedLevel, options = {}) {
  const requested = normalizeRequestedLod(requestedLevel);
  const active = normalizeRequestedLod(activeLevel);
  if (options.attached === false) {
    return { action: 'drop', level: active, pendingLevel: null };
  }
  if (requested === active) {
    return { action: 'keep', level: active, pendingLevel: null };
  }
  if (options.residentReady === true) {
    return { action: 'swap', level: requested, pendingLevel: null };
  }
  const pending = options.pendingLevel == null ? null : normalizeRequestedLod(options.pendingLevel);
  if (pending === requested) {
    return { action: 'wait', level: requested, pendingLevel: pending };
  }
  return { action: 'load', level: requested, pendingLevel: requested };
}

/**
 * The live controller's transition: identical to resolveWholeShipLodTransition except that a
 * 'load' (a new file admitted on screen) becomes 'keep' while runtime demotion is off. Swapping
 * between levels that are ALREADY resident stays allowed — it is instant and loads nothing.
 */
export function resolveLiveWholeShipLodTransition(activeLevel, requestedLevel, options = {}) {
  const transition = resolveWholeShipLodTransition(activeLevel, requestedLevel, options);
  if (transition.action === 'load' && WHOLE_SHIP_LOD_RUNTIME_DEMOTION !== true) {
    return { action: 'keep', level: normalizeRequestedLod(activeLevel), pendingLevel: null };
  }
  return transition;
}

export function shouldCommitWholeShipLodLoad(pendingLevel, requestedLevel, attached) {
  return attached === true
    && pendingLevel != null
    && normalizeRequestedLod(pendingLevel) === normalizeRequestedLod(requestedLevel);
}

/** One-shot spawn/resident pick. Near contacts stay LOD0 so close quality does not change. */
export function selectSpawnLodLevel(projectedPx, thresholds = LOD_THRESHOLDS) {
  const px = Number(projectedPx);
  if (!Number.isFinite(px) || px <= 0) return 'lod2';
  if (px < Number(thresholds.LOD2_BELOW)) return 'lod2';
  if (px < Number(thresholds.LOD1_BELOW)) return 'lod1';
  return 'lod0';
}

/**
 * The level sector prewarm decodes for a live ship. Admission always builds LOD0 (its upgrade
 * options carry no lodLevel), so with runtime demotion off a prewarm that picked LOD2 for a far
 * hull decoded a file nobody would ever draw — and the LOD0 decode then ran late, inside the
 * serial admission lane, while the ship sat on the glass as a stand-in.
 */
export function selectPrewarmLodLevel(projectedPx, thresholds = LOD_THRESHOLDS) {
  if (WHOLE_SHIP_LOD_RUNTIME_DEMOTION !== true) return 'lod0';
  return selectSpawnLodLevel(projectedPx, thresholds);
}

export function wholeShipFamilyDefIds(familyByDefId = {}) {
  return Object.keys(familyByDefId).filter((defId) => hasWholeShipLodFamily({
    lodFamily: familyByDefId[defId],
  }));
}
