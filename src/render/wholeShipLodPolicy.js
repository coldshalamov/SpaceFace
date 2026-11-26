// Whole-ship separate-file LOD policy. Geometry lives in the family catalog; this module only
// decides whether a non-player ship may demote, and which resident file to admit first.
//
// Player ships stay LOD0. Distant traffic may spawn at LOD1/LOD2 so the opening cohort does not
// upload every authored triangle for a speck. Hysteresis stays in lod.js; spawn uses a one-shot
// projected-pixel pick without hysteresis.

import { SHIP_LOD_THRESHOLDS } from './lod.js';

// Runtime demotion is on for ordinary whole-ship families (DRAW-COST-1). The first rollout was
// disabled in 9505170f18 after visible on-screen rebuilds: the selector demoted a presented body
// before its sibling was resident, so ships played "box then ship" on the glass. The controller
// now composes and compiles the sibling hidden and swaps in a single frame, so that failure mode
// cannot recur — the flag records that the safe-swap machinery is the only path a demotion takes.
export const WHOLE_SHIP_LOD_RUNTIME_DEMOTION = true;

// Limit the first default rollout to anonymous hostile ships. Named, mission and interactive
// hulls keep their close-detail presentation even if they share an ordinary family.
export function isOrdinaryLodShip(entity) {
  if (!entity || entity.type !== 'ship' || entity.isPlayer || entity.alive === false || entity.team !== 1) return false;
  const d = entity.data || {}, ai = d.ai || {}, flags = entity.flags || {};
  return !(d.isBoss || d.encounterBoss || d.missionBoss || d.bossId || d.bossDressing
    || d.champion || d.namedAceId || d.aceId || d.aceMemory || d.promotedPilot
    || d.storyTargetId || d.missionTag || d.missionId || d.trafficRole || d.name || d.callsign
    || d.interactive || d.missionCritical || ai.isBoss || ai.namedAceId || ai.aceId
    || ai.ace || ai.fanatic || ai.name || ai.encounterRole === 'boss'
    || flags.missionCritical || flags.interactive || flags.hero || flags.boss);
}

// A missing, stale or invalid projection must never choose a cheap initial body — the fail-safe
// first admission is always LOD0. A ship that spawns small or far admits the tier the live
// selector would put it on, so a speck never uploads full authored geometry nobody can read.
export function initialShipLodFromProjection(px, protectedBody = false) {
  if (protectedBody || !Number.isFinite(px) || px <= 0) return 'lod0';
  return selectSpawnLodLevel(px, SHIP_LOD_THRESHOLDS);
}

// Publish-time recheck for the initial pick: if the ship grew past the promote boundary while
// admission ran, the cheap tier is stale — publishing it would resolve a promotion (and a wasted
// load) on the ship's first visible frames.
export function initialShipLodStillSafe(level, px, protectedBody = false) {
  if (level === 'lod0') return true;
  if (protectedBody || !Number.isFinite(px) || px <= 0) return false;
  return level === 'lod2' ? px <= SHIP_LOD_THRESHOLDS.LOD2_ABOVE : px <= SHIP_LOD_THRESHOLDS.LOD0_ABOVE;
}

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
 * 'load' becomes 'keep' unless the caller explicitly owns a prepared family transition.
 * Swapping between levels that are ALREADY resident stays allowed.
 */
export function resolveLiveWholeShipLodTransition(activeLevel, requestedLevel, options = {}) {
  const transition = resolveWholeShipLodTransition(activeLevel, requestedLevel, options);
  if (transition.action === 'load' && options.allowLoad !== true) {
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
export function selectSpawnLodLevel(projectedPx, thresholds = SHIP_LOD_THRESHOLDS) {
  const px = Number(projectedPx);
  if (!Number.isFinite(px) || px <= 0) return 'lod2';
  if (px < Number(thresholds.LOD2_BELOW)) return 'lod2';
  if (px < Number(thresholds.LOD1_BELOW)) return 'lod1';
  return 'lod0';
}

/**
 * The level sector prewarm decodes for a live ship: the tier admission will actually build for
 * this projection. An unknown projection still decodes LOD0 — that is what the fail-safe initial
 * pick admits — so a stale sample never pays a file nobody will draw.
 */
export function selectPrewarmLodLevel(projectedPx, thresholds = SHIP_LOD_THRESHOLDS) {
  const px = Number(projectedPx);
  if (WHOLE_SHIP_LOD_RUNTIME_DEMOTION !== true || !Number.isFinite(px) || px <= 0) return 'lod0';
  return selectSpawnLodLevel(px, thresholds);
}

export function wholeShipFamilyDefIds(familyByDefId = {}) {
  return Object.keys(familyByDefId).filter((defId) => hasWholeShipLodFamily({
    lodFamily: familyByDefId[defId],
  }));
}
