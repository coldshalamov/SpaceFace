// Whole-ship separate-file LOD policy. Geometry lives in the family catalog; this module only
// decides whether a non-player ship may demote, and which resident file to admit first.
//
// Player ships stay LOD0. Distant traffic may spawn at LOD1/LOD2 so the opening cohort does not
// upload every authored triangle for a speck. Hysteresis stays in lod.js; spawn uses a one-shot
// projected-pixel pick without hysteresis.

import { LOD_THRESHOLDS } from './lod.js';

// The old blanket demotion was disabled after visible on-screen rebuilds and swap thrashing.
// Bulk catalog warming remains off; the ordinary-ship controller requests exact siblings and
// prepares each one before publication. Other body classes keep the previous policy.
export const WHOLE_SHIP_LOD_RUNTIME_DEMOTION = false;

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

// A missing, stale or invalid projection must never choose a cheap initial body.
//
// Top-down camera: the player sees the whole engagement, so there is no distant-traffic band to
// degrade. Only a true speck (< 32 CSS px) may start on the low-detail sibling to avoid uploading
// a full hull nobody can read; everything else admits the authored LOD0 body. LOD1 is not selected
// on the live route while runtime demotion is off — it exists for the authored family/tests.
export function initialShipLodFromProjection(px, protectedBody = false) {
  if (protectedBody || !Number.isFinite(px) || px <= 0) return 'lod0';
  return px < 32 ? 'lod2' : 'lod0';
}

export function initialShipLodStillSafe(level, px, protectedBody = false) {
  if (level === 'lod0') return true;
  if (protectedBody || !Number.isFinite(px) || px <= 0) return false;
  return level === 'lod2' ? px <= 56 : px <= 128;
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
