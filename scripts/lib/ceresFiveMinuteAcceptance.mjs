// Candidate-bound Ceres five-minute acceptance contracts and public-route driver.
//
// The pure evaluators in this file deliberately separate machine truth from the human
// pacing judgment. A runtime proves that its longest zero-visible-activity interval is
// finite, internally consistent, and bound to exact evidence. It never decides that a
// particular duration is acceptable. That decision belongs to a candidate/runtime-bound
// KEEP or REVISE review.

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { ZONE_CERES_THROUGHLINE } from '../../src/data/authoredPlaces.js';
import {
  CERES_ACTIVITY_POCKETS_BY_ID,
  CERES_REFERENCE_ACCEPTANCE_ENTRY,
} from '../../src/data/sectorActivityPockets.js';
import { SECTOR_ANCHORS } from '../../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../../src/data/sectorCoordinates.js';
import { SECTOR_ZONES } from '../../src/data/sectorZones.js';

import {
  closeOwnedResources,
  createCanonicalUrlTracker,
  inspectCanonicalRootUrl,
} from './alphaLiveBaselineContracts.mjs';
import {
  assessElectronProcessHealth,
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './alphaLiveBaselineElectronContracts.mjs';
import { collectPageIssues, summarizeIssues } from './browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './electronTestIsolation.mjs';
import { provisionElectronRuntime } from './electronRuntimeProvisioning.mjs';
import { loadPlaywright } from './load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './playwrightCspPolling.mjs';
import {
  PQ020_ROUTE_TARGETS,
  pq020FunctionalRouteDrivers,
  readPq020FailureSnapshot,
} from './pq020CeresFunctionalRoute.mjs';
import {
  strictWorktreeFingerprint,
  validateArtifactFiles,
} from './releaseSoakContracts.mjs';
import {
  awaitElectronInitialCanonicalLoad,
  cleanupIsolatedElectronProfile,
  launchIsolatedElectronApplication,
} from './releaseSoakProbe.mjs';
import {
  computeGateDigestsFromManifest,
  readConsumedClaimLedgerEntry,
  requireBrokerClaimOrDiagnostic,
} from './validationBroker.mjs';
import { stableJson } from './validationFingerprint.mjs';
import { loadValidationManifestById } from './validationManifestRegistry.mjs';
import {
  readJsonIfPresent,
  writeJsonAtomically,
} from './validationAtomicWrite.mjs';
import { acquireVisualProbeServer } from './visualProbeServer.mjs';

export const CERES_FIVE_MINUTE_RUNTIME_SCHEMA =
  'spaceface.ceresFiveMinuteRuntimeEvidence.v1';
export const CERES_FIVE_MINUTE_HUMAN_REVIEW_SCHEMA =
  'spaceface.ceresFiveMinuteHumanReview.v1';
export const CERES_FIVE_MINUTE_ROUTE_ID = 'ceres_reference_pocket';
export const CERES_FIVE_MINUTE_FIXED_SEED = 47;
export const CERES_FIVE_MINUTE_TICK_RATE_HZ = 60;
export const CERES_FIVE_MINUTE_FIXED_TICKS = 18_000;
export const CERES_FIVE_MINUTE_SIMULATION_SECONDS = 300;
export const CERES_FIVE_MINUTE_VISIBILITY_SEMANTICS = 'world-camera-renderability-v1';
export const CERES_ORE_CYCLE_PRE_SAVE_CHUNK = 'pre_save';
export const CERES_ORE_CYCLE_POST_CONTINUE_CHUNK = 'post_continue';

export const CERES_FIVE_MINUTE_ACTOR_SLOT_IDS = Object.freeze([
  'ceres_refinery_hauler',
  'ceres_refinery_tender',
  'ceres_seam_miner',
  'ceres_seam_surveyor',
  'ceres_ambush_loaded_hauler',
  'ceres_ambush_escort',
  'ceres_cathedral_salvor',
  'ceres_cathedral_patrol',
  'ceres_cinder_service_hauler',
]);

// Ordered by pocket, matching CERES_FIVE_MINUTE_POCKET_IDS. The census gate compares a human-review
// document against this exact order, so a new slot belongs with its own pocket rather than appended.
export const CERES_FIVE_MINUTE_OBJECT_SLOT_IDS = Object.freeze([
  'ceres_refinery_cargo_pod',
  'ceres_refinery_disabled_hull',
  'ceres_seam_ore_clast',
  'ceres_ambush_distress_beacon',
  'ceres_ambush_bait_wreck',
  'ceres_cathedral_grave_shard',
]);

export const CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS = Object.freeze([
  'ceres_throughline_collision_anchor',
  'ceres_ambush_collision_anchor',
]);

export const CERES_FIVE_MINUTE_POCKET_IDS = Object.freeze([
  'ceres_refinery_pocket',
  'ceres_working_seam',
  'ceres_ambush_run',
  'ceres_cathedral_grave',
]);

const POCKET_ID_SET = new Set(CERES_FIVE_MINUTE_POCKET_IDS);
const DIGEST_RE = /^[a-f0-9]{64}$/i;
const PUBLIC_INPUT_ACTIONS = new Set([
  'thrustForward',
  'yawLeft',
  'yawRight',
  'boost',
]);
const EPSILON = 1e-9;
const CERES_AMBUSH_INNER_RADIUS_WU = 125;
const CERES_AMBUSH_OUTER_RADIUS_WU = 165;
const CERES_AMBUSH_ANCHOR_GLOBAL = Object.freeze(sectorLocalToGlobalForSector(
  ZONE_CERES_THROUGHLINE.center,
  'sector_ceres_belt',
));
const CERES_AMBUSH_PRESENCE_ZONE = SECTOR_ZONES.sector_ceres_belt
  ?.find((zone) => zone.id === 'zone_ceres_ambush');
assert.ok(CERES_AMBUSH_PRESENCE_ZONE?.presence?.spawnCenter,
  'authored Ceres ambush hostile spawn center is required');
const CERES_AMBUSH_HOSTILE_SPAWN_GLOBAL = Object.freeze(sectorLocalToGlobalForSector(
  CERES_AMBUSH_PRESENCE_ZONE.presence.spawnCenter,
  'sector_ceres_belt',
));
const CERES_POCKET_TARGETS = Object.freeze(Object.fromEntries(
  CERES_FIVE_MINUTE_POCKET_IDS.map((pocketId) => {
    const pocket = CERES_ACTIVITY_POCKETS_BY_ID[pocketId];
    return [pocketId, Object.freeze({
      pocketId,
      targetId: pocket.activityAnchor.id,
      targetName: pocket.label,
      targetPos: Object.freeze(sectorLocalToGlobalForSector(
        pocket.activityAnchor.localPos,
        CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
      )),
    })];
  }),
));
const CERES_TOOLKIT_CAMERA_BACKOUT_RADIUS_WU = 8;
const CERES_TOOLKIT_CAMERA_STAGE_RADIUS_WU = 20;
const CERES_TOOLKIT_CONFLICT_WAIT_TICKS = 50 * CERES_FIVE_MINUTE_TICK_RATE_HZ;
const CERES_TOOLKIT_CONFLICT_POLL_MS = 150;
// This is an infrastructure watchdog, not the simulation deadline. Software/browser execution can
// advance well under one simulation second per wall second, so retain ample headroom for 50 sim-s.
const CERES_TOOLKIT_CONFLICT_MAX_POLLS = 1_200;
// The fixed chase camera never follows hull yaw. After the collision receipt, first back out to the
// authored Throughline beacon, then move along the seed-47 corridor to a point 65 WU south of the
// authored hostile-presence center. The two collision-anchor centerlines retain >44 WU of physical
// clearance for the Hornet in the bound world fixture, while the exact hostile cohort is brought
// close enough for a real render projection instead of a fabricated yaw-to-frustum coupling.
const CERES_TOOLKIT_CAMERA_STAGE_GLOBAL = Object.freeze({
  x: CERES_AMBUSH_HOSTILE_SPAWN_GLOBAL.x,
  z: CERES_AMBUSH_HOSTILE_SPAWN_GLOBAL.z - 65,
});
const CERES_WORKING_SEAM_EGRESS_ARRIVAL_RADIUS_WU = 90;
const CERES_WORKING_SEAM_MIN_GUARANTEED_EGRESS_WU = CERES_WORKING_SEAM_EGRESS_ARRIVAL_RADIUS_WU;
const CERES_WORKING_SEAM_EGRESS_MIN_REMAINING_TICKS = 2_400;
// A station arrival is any point on Belt Outpost's public completion ring, so its bearing changes
// with lawful Flight V3 guidance and obstacle traffic. Use the authored station center as the fixed
// public-control corridor: its 90-WU completion shell remains outside the station collider and is
// regression-proven clear of the rocks that trapped the earlier extrapolated route. The variable
// live arrival remains evidence, not route geometry.
const CERES_BELT_OUTPOST_ANCHOR = SECTOR_ANCHORS[
  CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId
]?.stations?.find((station) => station.id === 'station_beltout');
assert.ok(CERES_BELT_OUTPOST_ANCHOR?.pos, 'authored Belt Outpost anchor is required');
const CERES_WORKING_SEAM_DEPARTURE_CORRIDOR_GLOBAL = Object.freeze(
  sectorLocalToGlobalForSector(
    CERES_BELT_OUTPOST_ANCHOR.pos,
    CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
  ),
);
const CERES_POCKET_NAVIGATION = Object.freeze({
  ceres_refinery_pocket: Object.freeze({ label: null, identity: 'station_ceres' }),
  ceres_working_seam: Object.freeze({ label: 'Belt Outpost', identity: 'station_beltout' }),
  ceres_ambush_run: Object.freeze({
    label: 'Throughline Weigh Beacon', identity: 'poi_ceres_throughline',
  }),
  ceres_cathedral_grave: Object.freeze({
    label: 'Wreck Cathedral', identity: 'world_site_wreck_cathedral',
  }),
});
const CERES_EXPECTED_POCKET_ORDER = CERES_FIVE_MINUTE_POCKET_IDS;
const CERES_MINUTE_BUCKET_TICKS = CERES_FIVE_MINUTE_TICK_RATE_HZ * 60;
const CERES_REQUIRED_ARTIFACT_KINDS = Object.freeze([
  'observation',
  'route-log',
  'pocket-screenshot',
  'accessibility-screenshot',
  'cleanup-receipt',
]);
const CERES_TOOLKIT_WEAPON_IDS = Object.freeze([
  ...CERES_REFERENCE_ACCEPTANCE_ENTRY.itemIds,
]);
const CERES_GRAVITY_MARKER_WEAPON_ID = 'wpn_gravity_marker_s';
const CERES_MOMENTUM_SINK_WEAPON_ID = 'wpn_momentum_sink_s';
const CERES_CONCUSSION_WEAPON_ID = 'wpn_concussion_cannon_m';
const CERES_LAWFUL_ACTOR_SLOT_IDS = new Set([
  'ceres_ambush_escort',
  'ceres_cathedral_patrol',
]);
const CERES_SERVICE_ACTOR_SLOT_ID = 'ceres_cinder_service_hauler';
const CERES_SERVICE_HOOK_ID = 'ceres_cinder_sluice_service';

export function countsTowardCeresPocketVisibility(slotId) {
  const id = String(slotId || '');
  if (id.startsWith('hostile:')) return id.length > 'hostile:'.length;
  if (CERES_FIVE_MINUTE_OBJECT_SLOT_IDS.includes(id)) return true;
  if (CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS.includes(id)) return true;
  return CERES_FIVE_MINUTE_ACTOR_SLOT_IDS.includes(id) && id !== CERES_SERVICE_ACTOR_SLOT_ID;
}

export function ceresLawfulServiceClassificationPass(rows) {
  if (!Array.isArray(rows) || rows.length !== CERES_FIVE_MINUTE_ACTOR_SLOT_IDS.length) return false;
  const bySlot = new Map();
  for (const row of rows) {
    if (!row || !CERES_FIVE_MINUTE_ACTOR_SLOT_IDS.includes(row.slotId)
        || bySlot.has(row.slotId) || !String(row.worldRecordId || '')
        || row.team !== 2 || row.passive !== true || !String(row.factionId || '')
        || (row.roe != null && row.roe !== 'hold_fire')) return false;
    const shouldBeLawful = CERES_LAWFUL_ACTOR_SLOT_IDS.has(row.slotId);
    if (row.lawful !== shouldBeLawful) return false;
    if (row.slotId === CERES_SERVICE_ACTOR_SLOT_ID
        && (row.serviceHookId !== CERES_SERVICE_HOOK_ID
          || row.ceresActivityJobOwned !== false || row.jobId != null)) return false;
    bySlot.set(row.slotId, row);
  }
  return bySlot.size === CERES_FIVE_MINUTE_ACTOR_SLOT_IDS.length;
}

export function ceresHostileOpportunityPass(rows) {
  if (!Array.isArray(rows) || rows.length < 1) return false;
  const entityIds = new Set();
  const recordIds = new Set();
  for (const row of rows) {
    if (!row || row.entityId == null || !String(row.worldRecordId || '')
        || entityIds.has(row.entityId) || recordIds.has(row.worldRecordId)
        || row.ceresActivityAmbushPhase !== 'conflict'
        || row.team !== 1 || row.factionId !== 'faction_reach'
        || row.lawful !== false
        || row.passive !== false || row.roe !== 'weapons_free'
        || row.spawnContext !== 'zone_hostile'
        || row.zoneId !== 'zone_ceres_ambush' || row.squadId !== 'zone_ceres_ambush') return false;
    entityIds.add(row.entityId);
    recordIds.add(row.worldRecordId);
  }
  return true;
}

export function ceresToolkitConflictAuthorityPass(baseline, prebound) {
  const initial = Array.isArray(baseline?.initialHostiles) ? baseline.initialHostiles : [];
  const bound = Array.isArray(prebound?.boundHostiles) ? prebound.boundHostiles : [];
  if (baseline?.playerEntityId == null || baseline.playerEntityId !== prebound?.playerEntityId
      || initial.length !== bound.length || !ceresHostileOpportunityPass(initial)) return false;
  const initialPairs = initial.map((row) => `${String(row.entityId)}\u0000${row.worldRecordId}`).sort();
  const boundPairs = bound.map((row) => `${String(row.entityId)}\u0000${row.worldRecordId}`).sort();
  return stableJson(initialPairs) === stableJson(boundPairs);
}

async function readCeresToolkitConflictBaseline(page, prebound) {
  return page.evaluate((authority) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const director = state?.encounterDirector || {};
    const encounterId = 'ceres:activity:throughline-ambush';
    const bound = new Map(authority.boundHostiles.map((row) => [row.entityId, row.worldRecordId]));
    const initialHostiles = (state?.entityList || []).filter((entity) => (
      entity?.alive !== false && entity?.type === 'ship'
      && bound.get(entity.id) === entity.data?.worldRecordId
      && entity.data?.ai?.zoneId === 'zone_ceres_ambush'
      && entity.data?.ai?.squadId === 'zone_ceres_ambush'
    )).map((entity) => ({
      entityId: entity.id,
      worldRecordId: entity.data.worldRecordId,
      ceresActivityAmbushPhase: entity.data?.ai?.ceresActivityAmbushPhase || null,
      team: entity.team ?? entity.data?.team ?? null,
      factionId: entity.factionId || entity.data?.factionId || null,
      lawful: entity.data?.ai?.lawful === true,
      passive: entity.data?.ai?.passive === true,
      roe: entity.data?.ai?.roe || null,
      spawnContext: entity.data?.ai?.spawnContext || null,
      zoneId: entity.data?.ai?.zoneId || null,
      squadId: entity.data?.ai?.squadId || null,
    })).sort((left, right) => String(left.worldRecordId).localeCompare(String(right.worldRecordId)));
    const live = director.live?.[encounterId] || null;
    const pending = (Array.isArray(director.pending) ? director.pending : [])
      .filter((item) => item?.encounterId === encounterId || item?.data?.ceresActivityAmbush === true)
      .slice(0, 4)
      .map((item) => ({
        encounterId: String(item.encounterId || ''),
        shapeId: String(item.shapeId || ''),
        zoneId: String(item.zoneId || ''),
        dueAt: Number.isFinite(Number(item.dueAt)) ? Number(item.dueAt) : null,
        defers: Number.isSafeInteger(Number(item.defers)) ? Number(item.defers) : null,
      }));
    return {
      startTick: Number(state?.tick),
      playerEntityId: player?.id ?? null,
      combatTraceStartSeq: Number(state?.combat?.trace?.nextSeq) || 1,
      initialHostiles,
      director: {
        tutorialHints: state?.settings?.gameplay?.tutorialHints ?? null,
        onboardingActive: state?.onboarding?.active === true,
        onboardingFinished: state?.onboarding?.finished === true,
        simTime: Number.isFinite(Number(state?.simTime)) ? Number(state.simTime) : null,
        durablePhase: String(director.stats?.ceresActivityAmbush?.phase || ''),
        pressureCombat: Number.isFinite(Number(director.pressure?.combat))
          ? Number(director.pressure.combat)
          : null,
        lastMeaningfulAt: Number.isFinite(Number(director.lastMeaningfulAt))
          ? Number(director.lastMeaningfulAt)
          : null,
        ambushCooldownAt: Number.isFinite(Number(director.cooldowns?.ambush_snare))
          ? Number(director.cooldowns.ambush_snare)
          : null,
        pending,
        live: live ? {
          id: String(live.id || ''),
          phase: String(live.phase || ''),
          startedAt: Number.isFinite(Number(live.startedAt)) ? Number(live.startedAt) : null,
          springAt: Number.isFinite(Number(live.data?.springAt)) ? Number(live.data.springAt) : null,
          deadlineAt: Number.isFinite(Number(live.deadlineAt)) ? Number(live.deadlineAt) : null,
          entityIds: (Array.isArray(live.ids) ? live.ids : []).slice(0, 8),
        } : null,
      },
    };
  }, prebound);
}

export async function waitForCeresToolkitConflictAuthority(page, prebound, endTick, options = {}) {
  if (!page || typeof page.evaluate !== 'function' || typeof page.waitForTimeout !== 'function') {
    throw new TypeError('toolkit conflict wait requires a live page');
  }
  if (!prebound || prebound.playerEntityId == null || !Array.isArray(prebound.boundHostiles)
      || prebound.boundHostiles.length < 1) {
    throw new TypeError('toolkit conflict wait requires exact prebound hostile authority');
  }
  if (!Number.isSafeInteger(endTick)) {
    throw new TypeError('toolkit conflict wait requires an integer route end tick');
  }
  const maxWaitTicks = options.maxWaitTicks ?? CERES_TOOLKIT_CONFLICT_WAIT_TICKS;
  const pollMs = options.pollMs ?? CERES_TOOLKIT_CONFLICT_POLL_MS;
  const maxPolls = options.maxPolls ?? CERES_TOOLKIT_CONFLICT_MAX_POLLS;
  if (!Number.isSafeInteger(maxWaitTicks) || maxWaitTicks <= 0
      || !Number.isFinite(pollMs) || pollMs <= 0
      || !Number.isSafeInteger(maxPolls) || maxPolls <= 0) {
    throw new TypeError('toolkit conflict wait options must be positive bounded values');
  }

  let waitStartTick = null;
  let deadlineTick = null;
  let baseline = null;
  let polls = 0;
  const fail = (message) => {
    const error = new Error(message);
    error.ceresToolkitConflictDiagnostic = {
      schema: 'spaceface.ceresToolkitConflictDiagnostic.v1',
      waitStartTick,
      deadlineTick,
      polls,
      final: baseline,
    };
    throw error;
  };

  while (polls < maxPolls) {
    baseline = await readCeresToolkitConflictBaseline(page, prebound);
    polls += 1;
    const tick = Number(baseline?.startTick);
    if (!Number.isSafeInteger(tick)) {
      fail('toolkit conflict authority returned an invalid simulation tick');
    }
    if (waitStartTick == null) {
      waitStartTick = tick;
      deadlineTick = Math.min(endTick - 120, waitStartTick + maxWaitTicks);
      if (deadlineTick <= waitStartTick) {
        fail('toolkit hostile classification exhausted the exact route horizon');
      }
    }
    if (tick < waitStartTick) {
      fail('toolkit conflict authority simulation tick moved backwards');
    }
    if (tick >= deadlineTick) {
      fail('toolkit hostile classification exhausted its bounded simulation window');
    }
    if (ceresToolkitConflictAuthorityPass(baseline, prebound)) {
      return {
        ...baseline,
        conflictAuthorityWait: {
          waitStartTick,
          deadlineTick,
          polls,
        },
      };
    }
    if (polls < maxPolls) await page.waitForTimeout(pollMs);
  }
  fail('toolkit exercise did not reach exact live Throughline conflict authority');
}

/**
 * Derive every closed zero-visible-activity interval inside the exact observation horizon.
 * A qualifying interval must have a visible sample on both sides so that the adjacent
 * authored-pocket transition is evidence rather than an inferred label.
 */
export function deriveZeroVisibleActivityIntervals(samples, bounds) {
  validateHorizon(bounds);
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new TypeError('visibility samples must contain at least two ordered observations');
  }

  const normalized = samples.map((sample, index) => normalizeVisibilitySample(sample, bounds, index));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].tick <= normalized[index - 1].tick) {
      throw new Error('visibility sample ticks must increase strictly');
    }
  }
  if (normalized[0].tick !== bounds.startTick || normalized.at(-1).tick !== bounds.endTick) {
    throw new Error('visibility samples must bind both exact horizon endpoints');
  }

  const intervals = [];
  let previousVisible = normalized[0].visibleActivityCount > 0 ? normalized[0] : null;
  let zeroStart = normalized[0].visibleActivityCount === 0 ? normalized[0] : null;
  for (let index = 1; index < normalized.length; index += 1) {
    const sample = normalized[index];
    if (sample.visibleActivityCount === 0) {
      if (!zeroStart) zeroStart = sample;
      continue;
    }

    if (zeroStart) {
      if (!previousVisible) {
        throw new Error('zero-visible interval is open at the beginning of the horizon');
      }
      const fromPocketId = previousVisible.nearestPocketId;
      const toPocketId = sample.nearestPocketId;
      if (!POCKET_ID_SET.has(fromPocketId) || !POCKET_ID_SET.has(toPocketId)) {
        throw new Error('zero-visible interval requires canonical adjacent pocket identities');
      }
      if (fromPocketId === toPocketId) {
        throw new Error('zero-visible interval must describe a transition between distinct pockets');
      }
      const durationTicks = sample.tick - zeroStart.tick;
      intervals.push(Object.freeze({
        startTick: zeroStart.tick,
        endTick: sample.tick,
        durationTicks,
        durationS: durationTicks / bounds.tickRateHz,
        adjacentPocketTransition: Object.freeze({ fromPocketId, toPocketId }),
      }));
      zeroStart = null;
    }
    previousVisible = sample;
  }
  if (zeroStart) throw new Error('zero-visible interval is open at the end of the horizon');

  return intervals.sort((left, right) => (
    right.durationTicks - left.durationTicks
    || left.startTick - right.startTick
    || left.adjacentPocketTransition.fromPocketId.localeCompare(
      right.adjacentPocketTransition.fromPocketId,
    )
    || left.adjacentPocketTransition.toPocketId.localeCompare(
      right.adjacentPocketTransition.toPocketId,
    )
  ));
}

export function canonicalGapProjection(interval) {
  if (!interval || typeof interval !== 'object') {
    throw new TypeError('a derived zero-visible interval is required');
  }
  const startTick = finiteInteger(interval.startTick, 'interval.startTick');
  const endTick = finiteInteger(interval.endTick, 'interval.endTick');
  const durationTicks = finiteInteger(interval.durationTicks, 'interval.durationTicks');
  const durationS = finiteNumber(interval.durationS, 'interval.durationS');
  if (endTick <= startTick || durationTicks !== endTick - startTick || durationS < 0) {
    throw new Error('zero-visible interval timing is inconsistent');
  }
  const fromPocketId = String(interval.adjacentPocketTransition?.fromPocketId || '');
  const toPocketId = String(interval.adjacentPocketTransition?.toPocketId || '');
  if (!POCKET_ID_SET.has(fromPocketId) || !POCKET_ID_SET.has(toPocketId)
      || fromPocketId === toPocketId) {
    throw new Error('zero-visible interval transition is invalid');
  }
  return {
    maxZeroVisibleActivityS: durationS,
    intervalStartTick: startTick,
    intervalEndTick: endTick,
    adjacentPocketTransition: { fromPocketId, toPocketId },
  };
}

export function gapMetricDigest(metric) {
  if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
    throw new TypeError('recorded zero-visible metric is required');
  }
  // Hash the exact claimed projection even when it is malformed. Validation happens
  // independently, so a corrupt claim cannot avoid a stable causal fingerprint merely
  // because one number is nonfinite or one endpoint is inconsistent.
  const canonical = {
    maxZeroVisibleActivityS: metric.maxZeroVisibleActivityS,
    intervalStartTick: metric.intervalStartTick,
    intervalEndTick: metric.intervalEndTick,
    adjacentPocketTransition: {
      fromPocketId: metric.adjacentPocketTransition?.fromPocketId,
      toPocketId: metric.adjacentPocketTransition?.toPocketId,
    },
  };
  return createHash('sha256').update(stableJson(canonical)).digest('hex');
}

export function evaluateZeroVisibilityMetric({ samples, bounds, recordedMetric } = {}) {
  const failures = [];
  let derivedIntervals = [];
  let derivedProjection = null;
  try {
    derivedIntervals = deriveZeroVisibleActivityIntervals(samples, bounds);
    if (derivedIntervals.length === 0) {
      failures.push('visibility trace contains no closed adjacent-pocket zero-visible interval');
    } else {
      derivedProjection = canonicalGapProjection(derivedIntervals[0]);
    }
  } catch (error) {
    failures.push(error.message || String(error));
  }

  let recordedProjection = null;
  if (!recordedMetric || typeof recordedMetric !== 'object' || Array.isArray(recordedMetric)) {
    failures.push('recorded zero-visible metric is required');
  } else {
    try {
      recordedProjection = canonicalRecordedGapProjection(recordedMetric);
      if (!DIGEST_RE.test(String(recordedMetric.metricDigest || ''))) {
        failures.push('recorded zero-visible metric digest is invalid');
      } else if (gapMetricDigest(recordedProjection) !== recordedMetric.metricDigest) {
        failures.push('recorded zero-visible metric digest does not bind its exact bytes');
      }
    } catch (error) {
      failures.push(error.message || String(error));
    }
  }

  if (derivedProjection && recordedProjection
      && stableJson(derivedProjection) !== stableJson(recordedProjection)) {
    failures.push('recorded zero-visible metric does not equal the re-derived maximum interval');
  }

  return {
    pass: failures.length === 0,
    failures,
    intervals: derivedIntervals,
    metric: recordedProjection,
  };
}

export function validatePublicInputReceipt(receipt) {
  const failures = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { pass: false, failures: ['public input receipt is required'] };
  }
  if (!PUBLIC_INPUT_ACTIONS.has(receipt.action)) failures.push('unsupported public input action');
  const ticks = {};
  for (const key of ['pressTick', 'observedTick', 'releaseTick', 'neutralTick']) {
    if (!Number.isSafeInteger(receipt[key]) || receipt[key] < 0) {
      failures.push(`${key} must be a nonnegative integer tick`);
    } else ticks[key] = receipt[key];
  }
  if (Object.keys(ticks).length === 4) {
    if (!(ticks.pressTick <= ticks.observedTick
      && ticks.observedTick <= ticks.releaseTick
      && ticks.releaseTick <= ticks.neutralTick)) {
      failures.push('public input receipt tick order is invalid');
    }
  }
  if (receipt.observedState?.active !== true) failures.push('public input was not observed active');
  if (receipt.neutralState?.active !== false) failures.push('public input did not return to neutral');
  if (receipt.motionObserved !== true) failures.push('public input has no later player-motion consequence');
  return { pass: failures.length === 0, failures };
}

function executableSourceForPolicy(source) {
  const input = String(source || '');
  let output = '';
  let mode = 'code';
  let quote = '';
  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];
    if (mode === 'line-comment') {
      if (current === '\n') {
        mode = 'code';
        output += '\n';
      } else output += ' ';
      continue;
    }
    if (mode === 'block-comment') {
      if (current === '*' && next === '/') {
        output += '  ';
        index += 1;
        mode = 'code';
      } else output += current === '\n' ? '\n' : ' ';
      continue;
    }
    if (mode === 'string') {
      if (current === '\\') {
        output += ' ';
        if (index + 1 < input.length) {
          output += input[index + 1] === '\n' ? '\n' : ' ';
          index += 1;
        }
      } else if (current === quote) {
        output += ' ';
        mode = 'code';
      } else output += current === '\n' ? '\n' : ' ';
      continue;
    }
    if (current === '/' && next === '/') {
      output += '  ';
      index += 1;
      mode = 'line-comment';
    } else if (current === '/' && next === '*') {
      output += '  ';
      index += 1;
      mode = 'block-comment';
    } else if (current === '"' || current === "'" || current === '`') {
      output += ' ';
      quote = current;
      mode = 'string';
    } else output += current;
  }
  return output;
}

export function validateCeresPilotSources(sources = {}) {
  const failures = [];
  const routeSource = String(sources.routeSource || '');
  const checkerSource = String(sources.checkerSource || '');
  const joined = `${routeSource}\n${checkerSource}`;
  const executable = executableSourceForPolicy(joined);
  for (const required of [
    'Main Menu',
    'Settings',
    'Gameplay',
    'Tutorial hints',
    'Sandbox',
    'ceres_reference_pocket',
    'page.keyboard',
    'page.mouse',
  ]) {
    if (!routeSource.includes(required)) failures.push(`public pilot source is missing ${required}`);
  }
  const forbidden = [
    [/\b(?:window\.)?SF\s*\.\s*bus\s*\.\s*emit\s*\(/, 'direct event-bus emission'],
    [/\brequestSandboxGame\s*\(/, 'direct Sandbox launch invocation'],
    [/\b(?:lab|labBridge)\s*\.\s*(?:step|stepTicks|load)\s*\(/, 'lab stepping or loading'],
    [/\btimeScale\s*=|\.timeScale\s*=/, 'time-scale mutation'],
    [/\b(?:teleport|enterSector|relocatePlayerInSector)\s*\(/, 'direct position or sector mutation'],
    [/\bdispatchEvent\s*\(/, 'synthetic DOM/event injection'],
    [/\bstate\s*\.\s*player\s*\.\s*(?:pos|targetId)\b[^\n;]*=/, 'direct player-state assignment'],
    [/page\.evaluate\([^)]*=>[^\n]*\bstate\b[^\n]*=/, 'page-evaluated state assignment'],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(executable)) failures.push(`public pilot source contains ${label}`);
  }
  if (/["'`]game:new["'`]/.test(joined)) failures.push('public pilot source contains direct game:new invocation');
  return { pass: failures.length === 0, failures };
}

export async function disableCeresTutorialThroughPublicSettings(page) {
  if (!page || typeof page.getByRole !== 'function' || typeof page.getByLabel !== 'function') {
    throw new TypeError('Ceres tutorial setup requires a live public page');
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click({ timeout: 20_000 });
  await waitForVisibleScreen(page, 'settings', 20_000);
  await page.getByRole('tab', { name: 'Gameplay', exact: true }).click({ timeout: 20_000 });
  const toggle = page.getByLabel('Tutorial hints', { exact: true });
  const before = await toggle.getAttribute('aria-pressed');
  if (before !== 'true' && before !== 'false') {
    throw new Error('public Tutorial hints control lacks exact pressed state');
  }
  if (before !== 'false') await toggle.click({ timeout: 20_000 });
  await page.waitForFunction(() => (
    window.SF?.state?.settings?.gameplay?.tutorialHints === false
  ), null, { timeout: 20_000 });
  const observed = await page.evaluate(() => ({
    tutorialHints: window.SF?.state?.settings?.gameplay?.tutorialHints ?? null,
  }));
  await page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
  await waitForVisibleScreen(page, 'mainMenu', 20_000);
  if (observed.tutorialHints !== false) {
    throw new Error('public Settings did not disable onboarding before Ceres launch');
  }
  return {
    pass: true,
    source: 'public-settings-ui',
    changed: before !== 'false',
    tutorialHints: false,
    publicPath: ['Main Menu', 'Settings', 'Gameplay', 'Tutorial hints: Off', 'Back'],
  };
}

export function projectCeresActivityFrame(row = {}) {
  return {
    tick: row.tick,
    observedTick: row.observedTick,
    clippedFromObservedTick: row.clippedFromObservedTick ?? null,
    simTimeS: row.simTimeS,
    observedSimTimeS: row.observedSimTimeS,
    timeScale: row.timeScale,
    sectorId: row.sectorId,
    playerId: row.playerId,
    playerAlive: row.playerAlive,
    playerPos: row.playerPos,
    actorSlotIds: row.actorSlotIds,
    objectSlotIds: row.objectSlotIds,
    collisionAnchorSlotIds: row.collisionAnchorSlotIds,
    hostileIds: row.hostileIds,
    actorStates: row.actorStates,
    visibleActivityIds: row.visibleActivityIds,
    routePocketId: row.routePocketId,
    nearestPocketId: row.nearestPocketId,
    visibleActivityCount: row.visibleActivityCount,
    playerEconomy: row.playerEconomy,
    observerChunk: row.observerChunk ?? null,
    observerChunkIndex: row.observerChunkIndex ?? null,
    routePhase: row.routePhase ?? null,
  };
}

/**
 * Continue installs a fresh page observer whose local event sequence restarts at one. Bind the
 * combined route to one monotonic sequence after stable tick ordering while retaining each local
 * source sequence for diagnostics.
 */
export function normalizeCeresOreCycleEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((event, sourceIndex) => ({ event, sourceIndex }))
    .filter(({ event }) => [
      'mining:npcExtraction',
      'aiTrader:requestTrade',
      'freight:arrival',
      'freight:loss',
      'traffic:jobActionReceipt',
    ].includes(event?.event))
    .sort((left, right) => observerChunkOrder(left.event) - observerChunkOrder(right.event)
      || Number(left.event.tick) - Number(right.event.tick)
      || left.sourceIndex - right.sourceIndex)
    .map(({ event }, index) => ({
      ...event,
      sourceSeq: Number.isSafeInteger(event.seq) ? event.seq : null,
      seq: index + 1,
    }));
}

function observerChunkOrder(row) {
  if (Number.isSafeInteger(row?.observerChunkIndex)) return row.observerChunkIndex;
  if (row?.observerChunk === CERES_ORE_CYCLE_PRE_SAVE_CHUNK) return 0;
  if (row?.observerChunk === CERES_ORE_CYCLE_POST_CONTINUE_CHUNK) return 1;
  return 2;
}

/**
 * Re-derive the player-route contract from raw observations. Summary booleans are
 * treated only as redundant receipts; none of them can make missing raw evidence pass.
 */
export function evaluateCeresRouteObservations(observations, {
  route,
  authority,
  artifacts,
  cleanup,
  runtimeKind,
} = {}) {
  const failures = [];
  if (!observations || typeof observations !== 'object' || Array.isArray(observations)) {
    return { pass: false, failures: ['raw Ceres route observations are required'], projection: null };
  }
  if (observations.schema !== 'spaceface.ceresFiveMinuteObservation.v1') {
    failures.push('observation schema is unsupported');
  }

  validateHorizon(observations.bounds);
  if (observations.bounds.startTick !== route?.startTick
      || observations.bounds.endTick !== route?.endTick) {
    failures.push('observation horizon does not match the runtime route');
  }
  validatePocketArrivals(observations, route, failures);
  const frames = validateActivityFrames(observations, route, failures);
  validateVisibilityFrameProjection(observations, frames, failures);
  const movingJobProjection = validateMovingJobBuckets(observations, frames, route, failures);
  const ambushProjection = validateThroughlineAmbushObservation(observations, route, failures);
  const collisionProjection = validateAnchorCollisionObservation(observations, route, failures);
  const continueProjection = validateContinueObservation(observations, route, failures);
  const accessibilityProjection = validateAccessibilityObservation(observations, route, failures);
  validateToolkitObservation(observations, route, continueProjection, failures);
  validateObservationArtifactBindings(observations, authority, artifacts, runtimeKind, failures);
  validateObservationCleanup(observations, authority, artifacts, cleanup, failures);

  return {
    pass: failures.length === 0,
    failures,
    projection: {
      pocketSequence: [...CERES_EXPECTED_POCKET_ORDER],
      fixedTicks: route?.fixedTicks ?? null,
      movingJobBuckets: movingJobProjection.map((bucket) => ({
        bucket: bucket.bucket,
        startOffsetTicks: bucket.startTick - route.startTick,
        endOffsetTicks: bucket.endTick - route.startTick,
        movingJobIds: bucket.movingJobIds,
      })),
      ambush: ambushProjection,
      collision: collisionProjection,
      continue: continueProjection,
      accessibility: accessibilityProjection,
    },
  };
}

export function evaluateCeresFiveMinuteRuntime(document, { runtimeKind = null } = {}) {
  const failures = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { pass: false, machinePass: false, status: 'fail', failures: ['runtime evidence is required'] };
  }
  const expectedRuntime = runtimeKind || document.runtimeKind;
  if (document.schema !== CERES_FIVE_MINUTE_RUNTIME_SCHEMA) failures.push('runtime evidence schema is unsupported');
  if (!['browser', 'electron'].includes(expectedRuntime) || document.runtimeKind !== expectedRuntime) {
    failures.push('runtime kind does not match the locked wrapper');
  }
  const expectedScope = expectedRuntime === 'electron' ? 'source-native-electron' : 'source-browser';
  if (document.runtimeScope !== expectedScope) failures.push('runtime scope is not the declared source runtime');
  if (document.primaryAcceptance !== true || document.pass !== true) failures.push('runtime did not declare a primary machine pass');
  if (document.packagedElectronClaim !== false) failures.push('packaged Electron is outside this gate');
  if (document.controllerParityClaim !== false) failures.push('controller parity is outside this gate');
  if (document.r7CrimeLoopClaim !== false) failures.push('R7 crime-loop behavior is outside this gate');
  if (document.r8Claim !== false) failures.push('R8 presentation-range acceptance is outside this gate');
  if (document.g0ToG7Claim !== false) failures.push('G0-G7 acceptance is outside this gate');
  const gpu = document.gpu || {};
  if (gpu.available !== true || !String(gpu.vendor || '').trim()
      || !String(gpu.renderer || '').trim()
      || /SwiftShader|llvmpipe|software/i.test(`${gpu.vendor} ${gpu.renderer}`)) {
    failures.push('runtime lacks a hardware WebGL GPU receipt');
  }

  const route = document.route || {};
  if (route.id !== CERES_FIVE_MINUTE_ROUTE_ID) failures.push('route id is not the Ceres reference pocket');
  if (stableJson(route.publicPath) !== stableJson(['main_menu', 'sandbox', CERES_FIVE_MINUTE_ROUTE_ID])) {
    failures.push('route did not use the public Main Menu -> Sandbox -> Ceres card path');
  }
  if (route.seed !== CERES_FIVE_MINUTE_FIXED_SEED) failures.push('route seed must be 47');
  if (route.inputMode !== 'keyboard_mouse') failures.push('route input must be keyboard and mouse');
  if (route.shipId !== 'ship_hornet') failures.push('route active ship must be Hornet');
  if (route.loadoutId !== 'physics_toolkit') failures.push('route must use the named physics toolkit');
  if (route.cameraZoomWU !== 144) failures.push('route base camera zoom must be 144 WU');
  if (route.timeScale !== 1) failures.push('route must retain shipped timeScale=1');
  if (route.tickRateHz !== CERES_FIVE_MINUTE_TICK_RATE_HZ) failures.push('route tick rate must be 60 Hz');
  if (!Number.isSafeInteger(route.startTick) || !Number.isSafeInteger(route.endTick)
      || route.endTick - route.startTick !== CERES_FIVE_MINUTE_FIXED_TICKS
      || route.fixedTicks !== CERES_FIVE_MINUTE_FIXED_TICKS) {
    failures.push('route must bind exactly 18,000 fixed ticks');
  }
  if (route.simulationSeconds !== CERES_FIVE_MINUTE_SIMULATION_SECONDS) {
    failures.push('route must bind exactly 300 simulation seconds');
  }

  const census = document.census || {};
  compareExactOrderedIds(census.actorSlotIds, CERES_FIVE_MINUTE_ACTOR_SLOT_IDS, 'actor census', failures);
  compareExactOrderedIds(census.objectSlotIds, CERES_FIVE_MINUTE_OBJECT_SLOT_IDS, 'object census', failures);
  compareExactOrderedIds(
    census.collisionAnchorSlotIds,
    CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS,
    'collision-anchor census',
    failures,
  );
  if (census.lawfulActorsAndServicesPresent !== true) failures.push('lawful actor/service presence is missing');
  const ambush = census.throughlineAmbush || {};
  if (ambush.present !== true || ambush.kind !== 'hostile_criminal'
      || ambush.countedInAuthoredActorCensus !== false || ambush.injectedScenario !== false) {
    failures.push('ordinary hostile Throughline ambush evidence is missing or misclassified');
  }
  if (census.crimeLoopClaim !== false) failures.push('R7 crime-loop behavior is outside this gate');

  const visibility = evaluateZeroVisibilityMetric({
    samples: document.activityVisibility?.samples,
    bounds: document.activityVisibility?.bounds,
    recordedMetric: document.activityVisibility?.recordedMetric,
  });
  failures.push(...visibility.failures.map((failure) => `visibility: ${failure}`));
  if (document.activityVisibility?.semantics !== CERES_FIVE_MINUTE_VISIBILITY_SEMANTICS
      || document.observations?.visibilitySemantics !== CERES_FIVE_MINUTE_VISIBILITY_SEMANTICS) {
    failures.push('activity visibility semantics are not the frozen world-camera contract');
  }
  if (stableJson(document.activityVisibility?.samples)
        !== stableJson(document.observations?.visibilitySamples)
      || stableJson(document.activityVisibility?.bounds) !== stableJson(document.observations?.bounds)
      || stableJson(document.activityVisibility?.recordedMetric)
        !== stableJson(document.observations?.recordedMetric)) {
    failures.push('activity visibility summary is not bound to the raw route observations');
  }

  const input = validatePublicInputReceipt(document.publicInputReceipt);
  failures.push(...input.failures.map((failure) => `input: ${failure}`));
  validateRuntimeAuthority(document, expectedRuntime, failures);
  validateArtifactDescriptor(document.artifactIdentity, 'runtime artifact', failures);
  if (document.artifactIdentity?.kind !== 'ceres-five-minute-artifact-set'
      || !artifactPathWithinRoot(
        document.artifactIdentity?.path,
        document.authority?.artifactRoot,
      )) {
    failures.push('runtime artifact identity is not the candidate-bound artifact set');
  }
  if (!Array.isArray(document.artifacts)
      || !document.artifacts.some((entry) => sameArtifact(entry, document.artifactIdentity))) {
    failures.push('runtime artifact identity is not present in the verified artifact list');
  }
  const cleanup = document.cleanup || {};
  const profileCleanupValid = expectedRuntime === 'electron'
    ? cleanup.profileRequired === true && cleanup.profileRemoved === true
      && cleanup.profile?.required === true && cleanup.profile?.removed === true
      && !!String(cleanup.profile?.path || '')
    : cleanup.profileRequired === false && cleanup.profileRemoved == null
      && cleanup.profile?.required === false && cleanup.profile?.removed == null
      && cleanup.profile?.path == null;
  if (cleanup.pass !== true || cleanup.ownedProcessesExited !== true
      || cleanup.portsClosed !== true || !profileCleanupValid) {
    failures.push('owned runtime cleanup is incomplete');
  }
  let observationResult = { pass: false, failures: ['route observation evaluation did not run'], projection: null };
  try {
    observationResult = evaluateCeresRouteObservations(document.observations, {
      route,
      authority: document.authority,
      artifacts: document.artifacts,
      cleanup,
      runtimeKind: expectedRuntime,
    });
    failures.push(...observationResult.failures.map((failure) => `observations: ${failure}`));
  } catch (error) {
    failures.push(`observations: ${error.message || error}`);
  }

  return {
    pass: failures.length === 0,
    machinePass: failures.length === 0,
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
    runtimeKind: expectedRuntime,
    metric: visibility.metric,
    observationProjection: observationResult.projection,
  };
}

export function evaluateCeresHumanReview({ review, runtimeEvidence, verifiedArtifacts = [] } = {}) {
  const failures = [];
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    return {
      valid: false,
      closesAcceptanceRow: false,
      verdict: null,
      status: 'pending',
      failures: ['candidate-bound human review is missing'],
    };
  }
  if (review.schema !== CERES_FIVE_MINUTE_HUMAN_REVIEW_SCHEMA) failures.push('human review schema is unsupported');
  if (!['KEEP', 'REVISE'].includes(review.verdict)) failures.push('human review verdict must be KEEP or REVISE');
  if (!String(review.note || '').trim()) failures.push('human review note is required');
  if (!/brief intentional void/i.test(String(review.note || ''))) {
    failures.push('human review note must answer whether the longest gap reads as a brief intentional void');
  }
  if (typeof review.readsAsBriefIntentionalVoid !== 'boolean') {
    failures.push('human review must record an explicit brief-intentional-void judgment');
  } else if ((review.verdict === 'KEEP') !== review.readsAsBriefIntentionalVoid) {
    failures.push('human review verdict contradicts its brief-intentional-void judgment');
  }
  if (!String(review.reviewer || '').trim()
      || !Number.isFinite(Date.parse(String(review.reviewedAt || '')))) {
    failures.push('human review author and timestamp are required');
  }
  if (!runtimeEvidence || typeof runtimeEvidence !== 'object') {
    failures.push('runtime evidence is required to bind human review');
  } else {
    const metric = runtimeEvidence.activityVisibility?.recordedMetric || {};
    const authority = runtimeEvidence.authority || {};
    if (review.candidateHash !== authority.candidateHash) failures.push('human review candidate hash mismatch');
    if (review.candidateDigest !== authority.candidateDigest) failures.push('human review candidate digest mismatch');
    if (review.sourceCandidateDigest !== authority.sourceCandidateDigest) {
      failures.push('human review source candidate mismatch');
    }
    if (review.routeId !== runtimeEvidence.route?.id) failures.push('human review route mismatch');
    if (review.runtimeKind !== runtimeEvidence.runtimeKind) failures.push('human review runtime mismatch');
    if (review.seed !== runtimeEvidence.route?.seed) failures.push('human review seed mismatch');
    if (review.maxZeroVisibleActivityS !== metric.maxZeroVisibleActivityS) failures.push('human review gap value mismatch');
    if (review.gapMetricDigest !== metric.metricDigest) failures.push('human review gap metric mismatch');
    if (review.intervalStartTick !== metric.intervalStartTick
        || review.intervalEndTick !== metric.intervalEndTick
        || stableJson(review.adjacentPocketTransition)
          !== stableJson(metric.adjacentPocketTransition)) {
      failures.push('human review gap interval/transition mismatch');
    }
    if (!sameArtifact(review.artifactIdentity, runtimeEvidence.artifactIdentity)) {
      failures.push('human review artifact identity mismatch');
    }
  }
  if (!Array.isArray(verifiedArtifacts)
      || !verifiedArtifacts.some((entry) => sameArtifact(entry, review.artifactIdentity))) {
    failures.push('human review artifact is not in the verified runtime artifact set');
  }
  const valid = failures.length === 0;
  return {
    valid,
    closesAcceptanceRow: valid && review.verdict === 'KEEP',
    verdict: review.verdict || null,
    status: valid ? (review.verdict === 'KEEP' ? 'pass' : 'partial') : 'fail',
    failures,
  };
}

export function evaluateCeresFiveMinutePair({
  browser,
  electron,
  browserReview,
  ledgers = {},
  currentFingerprint,
} = {}) {
  const failures = [];
  const browserResult = evaluateCeresFiveMinuteRuntime(browser, { runtimeKind: 'browser' });
  const electronResult = evaluateCeresFiveMinuteRuntime(electron, { runtimeKind: 'electron' });
  failures.push(...browserResult.failures.map((failure) => `browser: ${failure}`));
  failures.push(...electronResult.failures.map((failure) => `electron: ${failure}`));

  const browserHuman = evaluateCeresHumanReview({
    review: browserReview,
    runtimeEvidence: browser,
    verifiedArtifacts: browser?.artifacts,
  });
  failures.push(...browserHuman.failures.map((failure) => `browser review: ${failure}`));
  const electronHuman = {
    valid: true,
    closesAcceptanceRow: false,
    verdict: null,
    status: 'not-required',
    failures: [],
  };

  if (browser && electron) {
    comparePairValue(
      browser.authority?.sourceCandidateDigest,
      electron.authority?.sourceCandidateDigest,
      'source candidate digest',
      failures,
    );
    comparePairValue(browser.route?.id, electron.route?.id, 'route id', failures);
    comparePairValue(browser.route?.seed, electron.route?.seed, 'fixed seed', failures);
    comparePairValue(browser.route?.fixedTicks, electron.route?.fixedTicks, 'fixed-tick horizon', failures);
    comparePairValue(browser.route?.simulationSeconds, electron.route?.simulationSeconds,
      'simulation-second horizon', failures);
    comparePairValue(browser.route?.inputMode, electron.route?.inputMode, 'input mode', failures);
    comparePairValue(
      stableJson(relativeGapProjection(browser)),
      stableJson(relativeGapProjection(electron)),
      'longest-gap duration/offset/transition',
      failures,
    );
    comparePairValue(
      stableJson(browser.census?.actorSlotIds),
      stableJson(electron.census?.actorSlotIds),
      'actor census order',
      failures,
    );
    comparePairValue(
      stableJson(browser.census?.objectSlotIds),
      stableJson(electron.census?.objectSlotIds),
      'object census order',
      failures,
    );
    comparePairValue(
      stableJson(browser.census?.collisionAnchorSlotIds),
      stableJson(electron.census?.collisionAnchorSlotIds),
      'collision-anchor census order',
      failures,
    );
    for (const [label, key] of [
      ['worktree digest', 'worktreeDigest'],
      ['scenario manifest digest', 'scenarioManifestDigest'],
      ['save manifest digest', 'saveDigest'],
      ['input tape digest', 'inputTapeDigest'],
      ['camera manifest digest', 'cameraManifestDigest'],
    ]) {
      const browserValue = key === 'worktreeDigest'
        ? browser.authority?.worktree?.digest : browser.authority?.digests?.[key];
      const electronValue = key === 'worktreeDigest'
        ? electron.authority?.worktree?.digest : electron.authority?.digests?.[key];
      comparePairValue(browserValue, electronValue, label, failures);
    }
    comparePairValue(
      stableJson(browserResult.observationProjection),
      stableJson(electronResult.observationProjection),
      'route observation contract',
      failures,
    );
    if (browser.authority?.candidateDigest === electron.authority?.candidateDigest) {
      failures.push('Browser and Electron candidate digests must remain runtime-distinct');
    }
    if (browser.authority?.digests?.profileDigest === electron.authority?.digests?.profileDigest) {
      failures.push('Browser and Electron runtime profile digests must remain distinct');
    }
    if (browser.authority?.digests?.runtimeManifestDigest
        === electron.authority?.digests?.runtimeManifestDigest) {
      failures.push('Browser and Electron manifest digests must remain distinct');
    }
    if (browser.authority?.artifactRoot === electron.authority?.artifactRoot) {
      failures.push('Browser and Electron artifact roots must remain distinct');
    }
  }

  validateConsumedLedger(browser, ledgers.browser, failures);
  validateConsumedLedger(electron, ledgers.electron, failures);
  const browserConsumedAt = Date.parse(String(ledgers.browser?.consumedAt || ''));
  const electronConsumedAt = Date.parse(String(ledgers.electron?.consumedAt || ''));
  if (!Number.isFinite(browserConsumedAt) || !Number.isFinite(electronConsumedAt)
      || browserConsumedAt >= electronConsumedAt) {
    failures.push('Electron acceptance claim was not consumed after Browser machine evidence');
  }
  if (!currentFingerprint || currentFingerprint.changedFileCount !== 0
      || currentFingerprint.id !== browser?.authority?.worktree?.id
      || currentFingerprint.digest !== browser?.authority?.worktree?.digest
      || currentFingerprint.head !== browser?.authority?.worktree?.head
      || currentFingerprint.branch !== browser?.authority?.worktree?.branch
      || currentFingerprint.id !== electron?.authority?.worktree?.id
      || currentFingerprint.digest !== electron?.authority?.worktree?.digest
      || currentFingerprint.head !== electron?.authority?.worktree?.head
      || currentFingerprint.branch !== electron?.authority?.worktree?.branch) {
    failures.push('current worktree fingerprint does not match the accepted pair');
  }
  if (!browserHuman.closesAcceptanceRow) failures.push('Browser intentional-void review is not KEEP');

  return {
    pass: failures.length === 0,
    status: failures.length === 0 ? 'pass' : (
      browserResult.pass && electronResult.pass && browserHuman.valid
        ? 'partial'
        : 'fail'
    ),
    failures,
    packagedElectronClaim: false,
    controllerParityClaim: false,
    runtimes: { browser: browserResult, electron: electronResult },
    reviews: { browser: browserHuman, electron: electronHuman },
  };
}

function relativeGapProjection(runtimeEvidence) {
  const metric = runtimeEvidence?.activityVisibility?.recordedMetric || {};
  const startTick = runtimeEvidence?.route?.startTick;
  return {
    maxZeroVisibleActivityS: metric.maxZeroVisibleActivityS,
    intervalStartOffsetTicks: Number.isSafeInteger(metric.intervalStartTick)
      && Number.isSafeInteger(startTick) ? metric.intervalStartTick - startTick : null,
    intervalEndOffsetTicks: Number.isSafeInteger(metric.intervalEndTick)
      && Number.isSafeInteger(startTick) ? metric.intervalEndTick - startTick : null,
    adjacentPocketTransition: metric.adjacentPocketTransition || null,
  };
}

/**
 * Drive the real source runtime through visible UI and public keyboard/pointer controls.
 * This function is intentionally runtime-agnostic: Browser and Electron provide the same page.
 */
export async function runCeresFiveMinutePublicRoute({
  page,
  outputDir,
  runtimeKind,
  fixedSeed = CERES_FIVE_MINUTE_FIXED_SEED,
  rootUrl,
  pageIssueTracker = null,
  oreCycleGate = null,
  log = () => {},
} = {}) {
  if (!page) throw new TypeError('Ceres five-minute route requires a Playwright page');
  if (!outputDir) throw new TypeError('Ceres five-minute route requires an output directory');
  if (!['browser', 'electron'].includes(runtimeKind)) throw new TypeError('Ceres route runtime is invalid');
  if (fixedSeed !== CERES_FIVE_MINUTE_FIXED_SEED) throw new Error('Ceres route seed must be 47');
  const oreCycleGateConfig = normalizeCeresOreCycleGateConfig(oreCycleGate);
  await mkdir(outputDir, { recursive: true });

  const screenshots = [];
  const routeLog = [];
  const traceChunks = [];
  const pocketArrivals = [];
  let phase = 'public-entry';
  let observerBounds = null;
  const mark = async (next, detail = {}) => {
    phase = next;
    const entry = { phase: next, at: new Date().toISOString(), ...detail };
    routeLog.push(entry);
    log(`${next}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`);
    await setCeresObserverPhase(page, next, detail.pocketId || null).catch(() => {});
  };
  const screenshot = async (name, { flightSurfaceOnly = false } = {}) => {
    const safe = String(name).replace(/[^a-z0-9._-]+/gi, '-');
    const absolute = path.join(outputDir, safe);
    await page.screenshot({
      path: absolute,
      ...(flightSurfaceOnly ? {
        // Accessibility comparison is captured while the public Pause screen owns the
        // fixed clock. Hide that modal for the screenshot only; game/UI state is untouched.
        style: '#screens, #cinematic-splash { visibility: hidden !important; }',
      } : {}),
    });
    screenshots.push(absolute);
    return absolute;
  };

  try {
    await page.bringToFront();
    await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry),
      null, { timeout: 60_000 });
    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) await page.keyboard.press('Space');
    await waitForVisibleScreen(page, 'mainMenu', 30_000);
    const tutorialSetup = await disableCeresTutorialThroughPublicSettings(page);
    await page.getByRole('button', { name: 'Sandbox', exact: true }).click({ timeout: 20_000 });
    await waitForVisibleScreen(page, 'sandbox', 20_000);
    await page.getByRole('button', { name: /^Ceres Reference Pocket\b/ }).click({ timeout: 20_000 });
    await waitForCeresFlight(page, fixedSeed, 180_000);

    const setup = {
      ...await readCeresRouteSnapshot(page),
      publicTutorialSettings: tutorialSetup,
    };
    assertCeresSetup(setup, fixedSeed);
    const gpu = await pq020FunctionalRouteDrivers.readGpu(page);
    assert.equal(gpu.available, true, 'Ceres acceptance requires WebGL');
    assert.doesNotMatch(String(gpu.renderer || ''), /SwiftShader|llvmpipe|software/i,
      `Ceres acceptance requires hardware GPU, got ${gpu.renderer}`);

    observerBounds = await installCeresRouteObserver(page, {
      fixedTicks: CERES_FIVE_MINUTE_FIXED_TICKS,
      tickRateHz: CERES_FIVE_MINUTE_TICK_RATE_HZ,
      simulationSeconds: CERES_FIVE_MINUTE_SIMULATION_SECONDS,
    }, 'ceres_refinery_pocket');
    pocketArrivals.push({
      pocketId: 'ceres_refinery_pocket',
      source: 'public-sandbox-entry',
      tick: observerBounds.startTick,
      physicalReceipt: physicalArrivalReceipt({
        ...CERES_POCKET_TARGETS.ceres_refinery_pocket,
        playerPos: { x: setup.player.x, z: setup.player.z },
        navigationLabel: null,
        navigationTargetIdentity: null,
        autopilotStatus: null,
      }),
    });
    await mark('ceres-entry-ready', { pocketId: 'ceres_refinery_pocket', tick: setup.tick });
    const inputReceipt = await provePublicFlightInput(page);
    await screenshot('01-refinery-default.png');

    const legs = [
      { target: PQ020_ROUTE_TARGETS.beltOutpost, method: 'pointer', pocketId: 'ceres_working_seam', slug: 'working-seam' },
      { target: PQ020_ROUTE_TARGETS.beacon, method: 'keyboard', pocketId: 'ceres_ambush_run', slug: 'throughline' },
      { target: PQ020_ROUTE_TARGETS.cathedral, method: 'pointer', pocketId: 'ceres_cathedral_grave', slug: 'cathedral' },
      { target: PQ020_ROUTE_TARGETS.refinery, method: 'keyboard', pocketId: 'ceres_refinery_pocket', slug: 'refinery' },
    ];

    let routeCycle = 0;
    let continueProof = null;
    let accessibility = null;
    let toolkit = null;
    let collisionProof = null;
    let oreCycleSaveGate = null;
    while ((await readTick(page)) < observerBounds.endTick) {
      const leg = legs[routeCycle % legs.length];
      const remaining = observerBounds.endTick - await readTick(page);
      if (remaining < 2_400) break;
      routeCycle += 1;
      await mark(`select-${leg.slug}`, { pocketId: leg.pocketId, cycle: routeCycle });
      await pq020FunctionalRouteDrivers.selectMapTarget(page, {
        ...leg.target,
        method: leg.method,
        activate: true,
        screenshot,
        screenshotName: `${String(routeCycle).padStart(2, '0')}-${leg.slug}-map.png`,
      });
      if (leg.target === PQ020_ROUTE_TARGETS.cathedral) {
        await pq020FunctionalRouteDrivers.waitForCathedralAdmission(page);
      }
      const arrival = await pq020FunctionalRouteDrivers.waitForAutopilotArrival(page, leg.target);
      if (leg.target.zoneId) {
        assert.equal(arrival.currentZone?.id, leg.target.zoneId,
          `${leg.target.name} public arrival entered ${arrival.currentZone?.id || 'no zone'}`);
      }
      if (leg.target === PQ020_ROUTE_TARGETS.cathedral) {
        await pq020FunctionalRouteDrivers.waitForShipSettled(page);
      }
      await drivePublicToPocketAnchor(page, leg.pocketId, observerBounds.endTick);
      await mark(`arrive-${leg.slug}`, { pocketId: leg.pocketId, cycle: routeCycle });
      const arrivalSnapshot = await readCeresRouteSnapshot(page);
      const physicalReceipt = await readAutopilotPhysicalReceipt(page, {
        pocketId: leg.pocketId,
      });
      pocketArrivals.push({
        pocketId: leg.pocketId,
        source: 'public-map-autopilot',
        tick: arrivalSnapshot.tick,
        physicalReceipt,
      });
      await screenshot(`${String(routeCycle).padStart(2, '0')}-${leg.slug}-flight.png`);
      routeLog.push({ phase: 'arrival', pocketId: leg.pocketId, target: leg.target.name, arrival });

      if (leg.pocketId === 'ceres_working_seam') {
        const egressTarget = planCeresWorkingSeamEgress(arrival, {
          minRemainingTicks: continueProof
            ? 120
            : CERES_WORKING_SEAM_EGRESS_MIN_REMAINING_TICKS,
        });
        await mark('egress-working-seam', {
          pocketId: leg.pocketId,
          targetId: egressTarget.targetId,
          guaranteedPublicEgressWU: egressTarget.guaranteedPublicEgressWU,
        });
        const egress = await drivePublicToCeresPoint(page, egressTarget, observerBounds.endTick);
        routeLog.push({
          phase: 'egress',
          pocketId: leg.pocketId,
          source: 'public-flight-controls',
          target: egressTarget,
          receipt: egress,
        });
      }

      if (leg.pocketId === 'ceres_ambush_run' && !toolkit) {
        collisionProof = await drivePublicAnchorCollision(page, observerBounds.endTick);
        toolkit = await exercisePublicPhysicsToolkit(page, observerBounds.endTick, collisionProof);
      }
      if (routeCycle >= legs.length && !continueProof) {
        if (oreCycleGateConfig) {
          await mark('ore-cycle-pre-save-gate', {
            pocketId: leg.pocketId,
            minPostContinueTicks: oreCycleGateConfig.minPostContinueTicks,
          });
          oreCycleSaveGate = await waitForCeresOreCycleSaveGate(page, {
            endTick: observerBounds.endTick,
            ...oreCycleGateConfig,
          });
          routeLog.push({ phase: 'ore-cycle-loaded-before-save', ...oreCycleSaveGate });
        }
        continueProof = await publicSaveAndContinue({
          page,
          rootUrl,
          pageIssueTracker,
          fixedSeed,
          toolkit,
          oreCycleGateReceipt: oreCycleSaveGate,
        });
        if (oreCycleGateConfig
            && continueProof.savedAtTick
              > observerBounds.endTick - oreCycleGateConfig.minPostContinueTicks) {
          throw new Error('CERES_ORE_CYCLE_POST_CONTINUE_HORIZON_EXHAUSTED');
        }
        continueProof.oreCycleSaveGate = oreCycleSaveGate;
        traceChunks.push({
          ...continueProof.traceChunk,
          observerChunk: CERES_ORE_CYCLE_PRE_SAVE_CHUNK,
        });
        await installCeresRouteObserver(page, observerBounds, leg.pocketId);
        await mark('continue-restored', { pocketId: leg.pocketId, tick: continueProof.after.tick });
        await pq020FunctionalRouteDrivers.waitForShipSettled(page);
        accessibility = await applyPublicReducedAccessibility(page, screenshot);
      }
    }

    await page.waitForFunction((targetTick) => Number(window.SF?.state?.tick) >= targetTick,
      observerBounds.endTick, { timeout: 480_000 });
    traceChunks.push({
      ...await stopCeresRouteObserver(page),
      observerChunk: continueProof
        ? CERES_ORE_CYCLE_POST_CONTINUE_CHUNK
        : CERES_ORE_CYCLE_PRE_SAVE_CHUNK,
    });
    const trace = normalizeCeresTrace(traceChunks, observerBounds);
    const finalSnapshot = await readCeresRouteSnapshot(page);
    const observations = summarizeCeresRouteObservations({
      trace,
      setup,
      finalSnapshot,
      continueProof,
      accessibility,
      toolkit,
      collisionProof,
      pocketArrivals,
    });
    const metricResult = evaluateZeroVisibilityMetric({
      samples: observations.visibilitySamples,
      bounds: observerBounds,
      recordedMetric: observations.recordedMetric,
    });
    assert.deepEqual(metricResult.failures, [],
      `Ceres visibility metric is incomplete: ${metricResult.failures.join('; ')}`);
    const issues = pageIssueTracker?.errorIssues?.()
      || pageIssueTracker?.errors?.()
      || [];
    assert.deepEqual(issues, [], `Ceres route emitted page/runtime issues: ${JSON.stringify(issues)}`);

    const tracePath = path.join(outputDir, 'observation.json');
    await writeFile(tracePath, `${JSON.stringify({
      schema: 'spaceface.ceresFiveMinuteObservation.v1',
      runtimeKind,
      fixedSeed,
      observerBounds,
      setup,
      finalSnapshot,
      routeLog,
      trace,
      observations,
      gpu,
      issues,
    }, null, 2)}\n`, 'utf8');
    const logPath = path.join(outputDir, 'run.log');
    await writeFile(logPath, `${routeLog.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
    return {
      pass: true,
      runtimeKind,
      fixedSeed,
      phase,
      setup,
      finalSnapshot,
      observerBounds,
      inputReceipt,
      trace,
      observations,
      gpu,
      issues,
      tracePath,
      logPath,
      screenshots,
      routeLog,
      continueProof,
      accessibility,
      toolkit,
    };
  } catch (error) {
    error.ceresRouteFailureSnapshot ||= await readPq020FailureSnapshot(page).catch(() => ({
      pageAvailable: false,
      snapshotError: 'failure snapshot unavailable',
    }));
    if (error.ceresRouteFailureSnapshot) {
      const diagnosticPath = path.join(outputDir, 'route-failure.json');
      const screenshotPath = path.join(outputDir, 'route-failure.png');
      const diagnostic = {
        schema: 'spaceface.ceresRouteFailure.v1',
        recordedAt: new Date().toISOString(),
        runtimeKind,
        fixedSeed,
        phase,
        snapshot: error.ceresRouteFailureSnapshot,
        toolkitConflict: error?.ceresToolkitConflictDiagnostic || null,
      };
      await writeFile(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8').catch(() => {});
      await page.screenshot({ path: screenshotPath }).catch(() => {});
      error.message = `${error.message}; diagnostic=${path.basename(diagnosticPath)}`;
    }
    if (error?.ceresFlightEntryDiagnostic) {
      const diagnosticPath = path.join(outputDir, 'public-entry-failure.json');
      const screenshotPath = path.join(outputDir, 'public-entry-failure.png');
      const diagnostic = {
        schema: 'spaceface.ceresPublicEntryFailure.v1',
        recordedAt: new Date().toISOString(),
        runtimeKind,
        fixedSeed,
        phase,
        condition: error.ceresFlightEntryDiagnostic,
        pageIssues: summarizeIssues(
          pageIssueTracker?.errorIssues?.()
            || pageIssueTracker?.errors?.()
            || [],
        ),
      };
      await writeFile(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8').catch(() => {});
      await page.screenshot({ path: screenshotPath }).catch(() => {});
      error.message = `${error.message}; diagnostic=${path.basename(diagnosticPath)}`;
    }
    if (error?.ceresPocketApproachDiagnostic) {
      const diagnosticPath = path.join(outputDir, 'pocket-approach-failure.json');
      const screenshotPath = path.join(outputDir, 'pocket-approach-failure.png');
      const diagnostic = {
        schema: 'spaceface.ceresPocketApproachFailure.v1',
        recordedAt: new Date().toISOString(),
        runtimeKind,
        fixedSeed,
        phase,
        approach: error.ceresPocketApproachDiagnostic,
      };
      await writeFile(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8').catch(() => {});
      await page.screenshot({ path: screenshotPath }).catch(() => {});
      error.message = `${error.message}; diagnostic=${path.basename(diagnosticPath)}`;
    }
    error.routePhase ||= phase;
    throw error;
  } finally {
    await stopCeresRouteObserver(page).catch(() => {});
    await releasePublicInput(page).catch(() => {});
  }
}

/**
 * Perform every known no-launch prerequisite before the broker reserves its one candidate attempt.
 * The acceptance runner repeats these checks because fast-gate success is evidence, not authority.
 */
export async function preflightCeresFiveMinuteRuntime({
  root,
  runtimeKind,
  manifest,
} = {}) {
  const repoRoot = path.resolve(String(root || ''));
  if (!path.isAbsolute(repoRoot) || !existsSync(path.join(repoRoot, 'package.json'))) {
    return blockedCeresResult('CERES_PREFLIGHT_REPOSITORY_ROOT_INVALID');
  }
  if (!manifest || manifest.runtimeKind !== runtimeKind
      || !['browser', 'electron'].includes(runtimeKind)
      || manifest.fixedSeed !== CERES_FIVE_MINUTE_FIXED_SEED) {
    return blockedCeresResult('CERES_PREFLIGHT_MANIFEST_INVALID');
  }
  try {
    const digests = await computeGateDigestsFromManifest({ root: repoRoot, manifest });
    const fingerprint = await strictWorktreeFingerprint(repoRoot);
    if (fingerprint.changedFileCount !== 0
        || fingerprint.digest !== digests.worktreeDigest
        || fingerprint.head !== digests.worktreeHead) {
      return blockedCeresResult('CERES_PREFLIGHT_CANDIDATE_NOT_CLEAN');
    }
    if (runtimeKind === 'browser') {
      if (!resolveSystemBrowserExecutable()) {
        return blockedCeresResult('CERES_BROWSER_PREREQUISITE_MISSING');
      }
    } else {
      const provisioning = provisionElectronRuntime({ root: repoRoot });
      if (provisioning.ready !== true) {
        return blockedCeresResult('CERES_ELECTRON_PREREQUISITE_NOT_READY');
      }
      const browser = await requireCurrentBrowserMachineEvidence({
        root: repoRoot,
        sourceCandidateDigest: digests.sourceCandidateDigest,
      });
      if (!browser.pass) return blockedCeresResult(browser.reason);
    }
    const finalDigests = await computeGateDigestsFromManifest({ root: repoRoot, manifest });
    const finalFingerprint = await strictWorktreeFingerprint(repoRoot);
    if (!sameCandidateAuthority(digests, finalDigests, fingerprint, finalFingerprint)) {
      return blockedCeresResult('CERES_PREFLIGHT_CANDIDATE_CHANGED');
    }
    return {
      pass: true,
      blocked: false,
      runtimeKind,
      candidateDigest: digests.candidateDigest,
      sourceCandidateDigest: digests.sourceCandidateDigest,
      worktreeDigest: fingerprint.digest,
    };
  } catch (error) {
    return blockedCeresResult(error.code || error.message || 'CERES_PREFLIGHT_FAILED');
  }
}

/**
 * Execute one broker-authorized source-runtime capture. The expensive runtime is
 * never opened until the one-use claim, clean candidate, runtime dependency, and
 * Browser-before-Electron ordering have all been proved.
 */
export async function runCeresFiveMinuteAcceptance({
  root,
  runtimeKind,
  manifest,
  mode = 'acceptance',
  outputRoot,
  brokerClaimToken = process.env.SF_BROKER_CLAIM || null,
  routeOptions = null,
  log = () => {},
} = {}) {
  const repoRoot = path.resolve(String(root || ''));
  const resolvedOutputRoot = path.resolve(repoRoot, String(outputRoot || manifest?.artifactRoot || ''));
  if (!path.isAbsolute(repoRoot) || !existsSync(path.join(repoRoot, 'package.json'))) {
    throw new TypeError('Ceres acceptance requires the repository root');
  }
  if (!manifest || manifest.runtimeKind !== runtimeKind
      || !['browser', 'electron'].includes(runtimeKind)) {
    throw new TypeError('Ceres acceptance runtime must match its manifest');
  }
  if (!['acceptance', 'diagnostic'].includes(mode)) {
    throw new TypeError('Ceres acceptance mode must be acceptance or diagnostic');
  }
  if (manifest.fixedSeed !== CERES_FIVE_MINUTE_FIXED_SEED) {
    throw new Error('Ceres acceptance manifest must own fixed seed 47');
  }
  if (resolvedOutputRoot !== path.resolve(repoRoot, manifest.artifactRoot)) {
    return blockedCeresResult('CERES_ARTIFACT_ROOT_MISMATCH');
  }

  await mkdir(resolvedOutputRoot, { recursive: true });
  const digests = await computeGateDigestsFromManifest({ root: repoRoot, manifest });
  const diagnostic = mode === 'diagnostic';
  const validatedAuthority = await requireBrokerClaimOrDiagnostic({
    outputRoot: resolvedOutputRoot,
    manifest,
    tokenOrPath: brokerClaimToken,
    diagnostic,
    explicitDiagnostic: diagnostic,
    root: repoRoot,
    digests,
    requiredMode: mode,
    requiredRuntimeKind: runtimeKind,
    consume: false,
  });
  if (!validatedAuthority.ok) {
    return blockedCeresResult(validatedAuthority.reason || 'broker-claim-rejected');
  }

  const startFingerprint = await strictWorktreeFingerprint(repoRoot);
  if (startFingerprint.changedFileCount !== 0
      || startFingerprint.digest !== digests.worktreeDigest
      || startFingerprint.head !== digests.worktreeHead) {
    return blockedCeresResult('candidate-worktree-is-not-the-clean-claimed-source');
  }

  let browserExecutable = null;
  let electronProvisioning = null;
  if (runtimeKind === 'browser') {
    browserExecutable = resolveSystemBrowserExecutable();
    if (!browserExecutable) return blockedCeresResult('CERES_BROWSER_PREREQUISITE_MISSING');
  } else {
    try {
      electronProvisioning = provisionElectronRuntime({ root: repoRoot });
      if (electronProvisioning.ready !== true) {
        return blockedCeresResult('CERES_ELECTRON_PREREQUISITE_NOT_READY');
      }
      const browserPredecessor = await requireCurrentBrowserMachineEvidence({
        root: repoRoot,
        sourceCandidateDigest: digests.sourceCandidateDigest,
      });
      if (!browserPredecessor.pass) return blockedCeresResult(browserPredecessor.reason);
    } catch (error) {
      return blockedCeresResult(error.code || error.message || 'CERES_ELECTRON_PREREQUISITE_FAILED');
    }
  }

  const consumeDigests = await computeGateDigestsFromManifest({ root: repoRoot, manifest });
  const consumeFingerprint = await strictWorktreeFingerprint(repoRoot);
  if (!sameCandidateAuthority(digests, consumeDigests, startFingerprint, consumeFingerprint)) {
    return blockedCeresResult('candidate-changed-before-claim-consumption');
  }

  const authority = await requireBrokerClaimOrDiagnostic({
    outputRoot: resolvedOutputRoot,
    manifest,
    tokenOrPath: brokerClaimToken,
    diagnostic,
    explicitDiagnostic: diagnostic,
    root: repoRoot,
    digests,
    requiredMode: mode,
    requiredRuntimeKind: runtimeKind,
    consume: mode === 'acceptance',
  });
  if (!authority.ok) return blockedCeresResult(authority.reason || 'broker-claim-consume-failed');

  const claimId = mode === 'acceptance' ? String(authority.claim?.claimId || '') : null;
  const consumedLedger = claimId
    ? await readConsumedClaimLedgerEntry(resolvedOutputRoot, claimId)
    : null;
  if (mode === 'acceptance' && !consumedLedger) {
    return {
      pass: false,
      blocked: false,
      primaryAcceptance: false,
      failures: ['consumed broker claim ledger could not be re-read'],
    };
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(6).toString('hex')}`;
  const runDir = path.join(resolvedOutputRoot, mode === 'acceptance' ? 'runs' : 'diagnostic', runId);
  await mkdir(runDir, { recursive: true });
  const launchDigests = await computeGateDigestsFromManifest({ root: repoRoot, manifest });
  const launchFingerprint = await strictWorktreeFingerprint(repoRoot);
  if (!sameCandidateAuthority(digests, launchDigests, startFingerprint, launchFingerprint)) {
    return {
      pass: false,
      blocked: false,
      primaryAcceptance: false,
      failures: ['candidate changed after claim consumption and before runtime launch'],
    };
  }
  const resources = { runtimeKind };
  let routeResult = null;
  let routeFingerprint = null;
  let cleanupReport = null;
  let profileRemoved = null;
  let runError = null;

  try {
    if (runtimeKind === 'browser') {
      await launchCeresBrowserRuntime({
        root: repoRoot,
        executablePath: browserExecutable,
        resources,
      });
    } else {
      await launchCeresElectronRuntime({ root: repoRoot, runId, resources });
    }
    routeResult = await runCeresFiveMinutePublicRoute({
      page: resources.page,
      outputDir: runDir,
      runtimeKind,
      fixedSeed: manifest.fixedSeed,
      rootUrl: resources.rootUrl,
      pageIssueTracker: resources.pageIssueTracker,
      oreCycleGate: routeOptions?.oreCycleGate ?? null,
      log,
    });
    routeFingerprint = await strictWorktreeFingerprint(repoRoot);
  } catch (error) {
    runError = error;
  } finally {
    try {
      if (runtimeKind === 'browser') {
        cleanupReport = await closeOwnedResources(resources);
      } else if (resources.electronApp) {
        try {
          cleanupReport = await closeOwnedElectronRuntime(resources);
        } catch (error) {
          cleanupReport = error.cleanupReport || cleanupReport || {
            pass: false,
            failures: [error.message || String(error)],
          };
          runError ||= error;
        }
        if (cleanupReport?.processExited === true
            && cleanupReport?.processCloseConfirmed === true) {
          profileRemoved = cleanupIsolatedElectronProfile(resources.isolatedLaunch, cleanupReport);
        } else {
          profileRemoved = false;
        }
      } else if (resources.isolatedLaunch) {
        // launchIsolatedElectronApplication cleans a rejected pre-ownership launch.
        profileRemoved = !existsSync(resources.isolatedLaunch.userDataDir);
      }
    } catch (error) {
      cleanupReport = error.cleanupReport || cleanupReport || {
        pass: false,
        failures: [error.message || String(error)],
      };
      runError ||= error;
    }
  }

  const endFingerprint = await strictWorktreeFingerprint(repoRoot);
  const portReceipts = await inspectOwnedPortClosures(resources);
  const cleanup = normalizeCeresCleanup(
    runtimeKind,
    cleanupReport,
    profileRemoved,
    resources,
    portReceipts,
  );
  const lifecycleFailures = [];
  if (runError) lifecycleFailures.push(`${runError.routePhase || 'runtime'}: ${runError.message || runError}`);
  if (!routeResult?.pass) lifecycleFailures.push('public five-minute Ceres route did not pass');
  if (routeFingerprint && !sameWorktreeFingerprint(startFingerprint, routeFingerprint)) {
    lifecycleFailures.push('worktree changed during the public route');
  }
  if (!sameWorktreeFingerprint(startFingerprint, endFingerprint)) {
    lifecycleFailures.push('worktree changed before owned cleanup completed');
  }
  if (!cleanup.pass) lifecycleFailures.push(...cleanup.failures.map((failure) => `cleanup: ${failure}`));

  if (lifecycleFailures.length > 0) {
    const failure = {
      schema: 'spaceface.ceresFiveMinuteFailure.v1',
      pass: false,
      primaryAcceptance: false,
      generatedAt: new Date().toISOString(),
      runtimeKind,
      mode,
      claimId,
      candidateDigest: digests.candidateDigest,
      sourceCandidateDigest: digests.sourceCandidateDigest,
      phase: runError?.routePhase || 'runtime-or-cleanup',
      failures: lifecycleFailures,
      failureSnapshot: runError?.ceresRouteFailureSnapshot || null,
      cleanup,
    };
    await writeJsonAtomically(path.join(resolvedOutputRoot, 'latest-failure.json'), failure);
    return { ...failure, blocked: false };
  }

  const cleanupReceiptPath = path.join(runDir, 'cleanup.json');
  await writeFile(cleanupReceiptPath, `${JSON.stringify({
    schema: 'spaceface.ceresFiveMinuteCleanup.v1',
    runtimeKind,
    claimId,
    candidateDigest: digests.candidateDigest,
    sourceCandidateDigest: digests.sourceCandidateDigest,
    worktreeDigest: startFingerprint.digest,
    cleanup,
  }, null, 2)}\n`, 'utf8');
  const retainedArtifactPaths = [
    routeResult.tracePath,
    routeResult.logPath,
    ...(routeResult.screenshots || []),
    cleanupReceiptPath,
  ];
  const retainedArtifacts = await Promise.all(retainedArtifactPaths.map((filePath) => (
    describeArtifact(repoRoot, filePath, artifactKindForPath(filePath))
  )));
  const artifactSetPath = path.join(runDir, 'artifact-set.json');
  await writeFile(artifactSetPath, `${JSON.stringify({
    schema: 'spaceface.ceresFiveMinuteArtifactSet.v1',
    runtimeKind,
    routeId: CERES_FIVE_MINUTE_ROUTE_ID,
    fixedSeed: CERES_FIVE_MINUTE_FIXED_SEED,
    candidateHash: startFingerprint.head,
    sourceCandidateDigest: digests.sourceCandidateDigest,
    metric: routeResult.observations.recordedMetric,
    artifacts: retainedArtifacts,
  }, null, 2)}\n`, 'utf8');
  const artifactIdentity = await describeArtifact(
    repoRoot,
    artifactSetPath,
    'ceres-five-minute-artifact-set',
  );
  const artifacts = [...retainedArtifacts, artifactIdentity];
  const cleanupArtifact = retainedArtifacts.find((entry) => entry.kind === 'cleanup-receipt');
  cleanup.receipt = {
    schema: 'spaceface.ceresFiveMinuteCleanup.v1',
    runtimeKind,
    candidateDigest: digests.candidateDigest,
    worktreeDigest: startFingerprint.digest,
    artifactIdentity: cleanupArtifact,
  };
  const verified = await validateArtifactFiles(repoRoot, artifacts, { requireClaims: true });
  if (!verified.pass) {
    return {
      pass: false,
      blocked: false,
      primaryAcceptance: false,
      failures: verified.failures.map((failure) => `artifact: ${failure}`),
    };
  }

  const evidence = createCeresRuntimeEvidence({
    runtimeKind,
    routeResult,
    digests,
    manifest,
    claimId: claimId || `diagnostic-${runId}`,
    fingerprint: startFingerprint,
    artifactIdentity,
    artifacts: verified.verified,
    cleanup,
    consumedLedger,
    electronProvisioning,
    primaryAcceptance: mode === 'acceptance',
  });
  const machineCandidate = mode === 'acceptance'
    ? evidence
    : { ...evidence, pass: true, primaryAcceptance: true };
  const machine = evaluateCeresFiveMinuteRuntime(machineCandidate, { runtimeKind });
  if (!machine.pass) {
    await writeJsonAtomically(path.join(resolvedOutputRoot, 'latest-failure.json'), {
      schema: 'spaceface.ceresFiveMinuteFailure.v1',
      pass: false,
      primaryAcceptance: false,
      generatedAt: new Date().toISOString(),
      runtimeKind,
      mode,
      claimId,
      candidateDigest: digests.candidateDigest,
      sourceCandidateDigest: digests.sourceCandidateDigest,
      phase: 'machine-evidence-validation',
      failures: machine.failures,
      cleanup,
    });
    return { ...machine, blocked: false, primaryAcceptance: false };
  }

  const evidencePath = mode === 'acceptance'
    ? canonicalRuntimeEvidencePath(resolvedOutputRoot, runtimeKind)
    : path.join(runDir, 'diagnostic-evidence.json');
  await writeJsonAtomically(evidencePath, evidence);
  if (runtimeKind === 'browser') {
    await writeHumanReviewTemplate({
      outputPath: path.join(runDir, 'human-review.template.json'),
      evidence,
    });
  }
  const reviewPath = canonicalHumanReviewPath(resolvedOutputRoot, runtimeKind);
  const existingReview = mode === 'acceptance' && runtimeKind === 'browser'
    ? await readJsonIfPresent(reviewPath)
    : null;
  const human = existingReview
    ? evaluateCeresHumanReview({
      review: existingReview,
      runtimeEvidence: evidence,
      verifiedArtifacts: verified.verified,
    })
    : runtimeKind === 'browser'
      ? { valid: false, closesAcceptanceRow: false, status: 'pending', failures: [] }
      : { valid: true, closesAcceptanceRow: false, status: 'not-required', failures: [] };
  return {
    pass: true,
    blocked: false,
    primaryAcceptance: mode === 'acceptance',
    humanReviewRequired: runtimeKind === 'browser',
    machinePass: true,
    humanReviewClosed: runtimeKind === 'browser' && human.closesAcceptanceRow === true,
    humanReviewStatus: human.status,
    evidencePath,
    runDir,
    runtimeKind,
    candidateDigest: digests.candidateDigest,
    sourceCandidateDigest: digests.sourceCandidateDigest,
  };
}

/** Read and validate already-published Browser/Electron evidence. Never launches. */
export async function checkCeresFiveMinuteEvidence({ root } = {}) {
  const repoRoot = path.resolve(String(root || ''));
  const manifests = {};
  const runtimeRows = [];
  const open = [];
  const failures = [];
  const documents = {};
  const reviews = {};
  const ledgers = {};
  const verifiedByRuntime = {};

  for (const runtimeKind of ['browser', 'electron']) {
    manifests[runtimeKind] = await loadValidationManifestById({
      root: repoRoot,
      id: `ceres-five-minute-${runtimeKind}`,
    });
    const outputRoot = path.resolve(repoRoot, manifests[runtimeKind].artifactRoot);
    const evidence = await readJsonIfPresent(canonicalRuntimeEvidencePath(outputRoot, runtimeKind));
    documents[runtimeKind] = evidence;
    if (!evidence) {
      runtimeRows.push({ runtimeKind, machineStatus: 'pending', reviewStatus: 'pending' });
      open.push(`${runtimeKind} machine evidence is missing`);
      continue;
    }
    const machine = evaluateCeresFiveMinuteRuntime(evidence, { runtimeKind });
    if (!machine.pass) failures.push(...machine.failures.map((failure) => `${runtimeKind}: ${failure}`));
    const artifactCheck = await validateArtifactFiles(repoRoot, evidence.artifacts, { requireClaims: true });
    verifiedByRuntime[runtimeKind] = artifactCheck.verified;
    if (!artifactCheck.pass) failures.push(...artifactCheck.failures.map((failure) => `${runtimeKind} artifact: ${failure}`));
    ledgers[runtimeKind] = await readConsumedClaimLedgerEntry(outputRoot, evidence.authority?.claimId);
    const ledgerFailures = [];
    validateConsumedLedger(evidence, ledgers[runtimeKind], ledgerFailures);
    if (ledgerFailures.length > 0) {
      failures.push(...ledgerFailures.map((failure) => `${runtimeKind} ledger: ${failure}`));
    }
    const review = runtimeKind === 'browser'
      ? await readJsonIfPresent(canonicalHumanReviewPath(outputRoot, runtimeKind))
      : null;
    reviews[runtimeKind] = review;
    const human = runtimeKind === 'browser' && review
      ? evaluateCeresHumanReview({
        review,
        runtimeEvidence: evidence,
        verifiedArtifacts: artifactCheck.verified,
      })
      : runtimeKind === 'browser'
        ? { valid: false, closesAcceptanceRow: false, status: 'pending', failures: [] }
        : { valid: true, closesAcceptanceRow: false, status: 'not-required', failures: [] };
    if (runtimeKind === 'browser' && review && !human.valid) {
      failures.push(...human.failures.map((failure) => `${runtimeKind} review: ${failure}`));
    }
    if (runtimeKind === 'browser' && !review) {
      open.push('browser candidate-bound intentional-void review is missing');
    } else if (runtimeKind === 'browser' && human.valid && !human.closesAcceptanceRow) {
      open.push('browser intentional-void review is REVISE');
    }
    runtimeRows.push({
      runtimeKind,
      machineStatus: machine.pass && artifactCheck.pass && ledgerFailures.length === 0
        ? 'pass'
        : 'fail',
      reviewStatus: human.status,
    });
  }

  if (!documents.browser || !documents.electron) {
    const presentRuntimeCount = Number(!!documents.browser) + Number(!!documents.electron);
    return {
      pass: false,
      status: failures.length > 0 ? 'fail' : (presentRuntimeCount > 0 ? 'partial' : 'pending'),
      failures,
      open,
      runtimes: runtimeRows,
    };
  }
  if (failures.length > 0) {
    return { pass: false, status: 'fail', failures, open, runtimes: runtimeRows };
  }
  const currentFingerprint = await strictWorktreeFingerprint(repoRoot);
  if (currentFingerprint.changedFileCount !== 0) {
    failures.push('current worktree is not clean and cannot resolve candidate-bound evidence');
    return { pass: false, status: 'fail', failures, open, runtimes: runtimeRows };
  }

  if (!reviews.browser) {
    return { pass: false, status: 'partial', failures, open, runtimes: runtimeRows };
  }
  const pair = evaluateCeresFiveMinutePair({
    browser: documents.browser,
    electron: documents.electron,
    browserReview: reviews.browser,
    ledgers,
    currentFingerprint,
  });
  return {
    ...pair,
    status: pair.pass ? 'pass' : (pair.status === 'partial' ? 'partial' : 'fail'),
    open,
    runtimes: runtimeRows,
  };
}

async function installCeresRouteObserver(page, bounds, initialPocketId) {
  return page.evaluate(({
    requestedContract,
    actors,
    objects,
    anchors,
    pockets,
    initialPocket,
    excludedPocketActorSlotId,
  }) => {
    const prior = window.__SF_CERES_FIVE_MINUTE_TRACE__;
    if (prior?.running) throw new Error('Ceres route observer is already active');
    const state = window.SF?.state;
    const bus = window.SF?.bus;
    if (!state || !bus) throw new Error('Ceres route observer requires the live game');
    const liveStartTick = Number(state.tick);
    const liveStartSimTimeS = Number(state.simTime);
    const contract = Number.isSafeInteger(requestedContract.startTick)
      && Number.isSafeInteger(requestedContract.endTick)
      ? requestedContract
      : {
        ...requestedContract,
        startTick: liveStartTick,
        endTick: liveStartTick + Number(requestedContract.fixedTicks),
        startSimTimeS: liveStartSimTimeS,
      };
    if (!Number.isSafeInteger(contract.startTick)
        || !Number.isSafeInteger(contract.endTick)
        || contract.endTick - contract.startTick !== contract.fixedTicks) {
      throw new Error('Ceres observer could not bind the exact live horizon');
    }
    const slotToPocket = {
      ceres_refinery_hauler: 'ceres_refinery_pocket',
      ceres_refinery_tender: 'ceres_refinery_pocket',
      ceres_refinery_cargo_pod: 'ceres_refinery_pocket',
      ceres_refinery_disabled_hull: 'ceres_refinery_pocket',
      ceres_seam_miner: 'ceres_working_seam',
      ceres_seam_surveyor: 'ceres_working_seam',
      ceres_seam_ore_clast: 'ceres_working_seam',
      ceres_ambush_loaded_hauler: 'ceres_ambush_run',
      ceres_ambush_escort: 'ceres_ambush_run',
      ceres_ambush_distress_beacon: 'ceres_ambush_run',
      ceres_ambush_bait_wreck: 'ceres_ambush_run',
      ceres_throughline_collision_anchor: 'ceres_ambush_run',
      ceres_ambush_collision_anchor: 'ceres_ambush_run',
      ceres_cathedral_salvor: 'ceres_cathedral_grave',
      ceres_cathedral_patrol: 'ceres_cathedral_grave',
      ceres_cathedral_grave_shard: 'ceres_cathedral_grave',
    };
    const trace = {
      schema: 'spaceface.ceresFiveMinuteFrameTrace.v1',
      bounds: contract,
      running: true,
      routePhase: 'ceres-entry-ready',
      routePocketId: initialPocket,
      samples: [],
      events: [],
      failures: [],
      unsubs: [],
      raf: 0,
      nextEventSeq: 1,
      lastSampleTick: null,
      startedAt: new Date().toISOString(),
    };
    window.__SF_CERES_FIVE_MINUTE_TRACE__ = trace;

    const projectCargoManifest = (manifest) => {
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
      const lines = Array.isArray(manifest.lines) ? manifest.lines.map((line) => ({
        commodityId: line?.commodityId ?? null,
        qty: Number.isFinite(line?.qty) ? Number(line.qty) : null,
      })) : [];
      return {
        manifestId: manifest.manifestId ?? null,
        lotId: manifest.lotId ?? null,
        lotSource: manifest.lotSource && typeof manifest.lotSource === 'object'
          ? { ...manifest.lotSource }
          : null,
        role: manifest.role ?? null,
        lines,
        totalQty: Number.isFinite(manifest.totalQty) ? Number(manifest.totalQty) : null,
        custody: manifest.custody && typeof manifest.custody === 'object'
          ? { ...manifest.custody }
          : null,
      };
    };
    const projectPlayerEconomy = (live) => {
      const player = live?.player || {};
      const cargo = player.cargo && typeof player.cargo === 'object' ? player.cargo : {};
      const items = cargo.items && typeof cargo.items === 'object' && !Array.isArray(cargo.items)
        ? Object.fromEntries(Object.entries(cargo.items).sort(([left], [right]) => left.localeCompare(right)))
        : {};
      return {
        credits: Number.isFinite(player.credits) ? Number(player.credits) : null,
        cargo: {
          items,
          usedVolume: Number.isFinite(cargo.usedVolume) ? Number(cargo.usedVolume) : null,
          usedMass: Number.isFinite(cargo.usedMass) ? Number(cargo.usedMass) : null,
          capVolume: Number.isFinite(cargo.capVolume) ? Number(cargo.capVolume) : null,
          capMass: Number.isFinite(cargo.capMass) ? Number(cargo.capMass) : null,
        },
      };
    };

    // The economy owner was registered during system initialization. Temporarily place this
    // read-only capture first while preserving every existing listener's relative order, then add
    // the normal trace listener last below. One event therefore binds the real value immediately
    // before owner mutation and the real value after all synchronous owner handlers return.
    const stockBeforeByTradePayload = new WeakMap();
    const captureMarketStockBeforeOwner = (payload) => {
      if (!payload || typeof payload !== 'object') return;
      const stationId = payload.stationId ?? null;
      const commodityId = payload.commodityId ?? payload.good ?? null;
      const stock = stationId && commodityId
        ? state.economy?.markets?.[stationId]?.[commodityId]?.stock
        : null;
      stockBeforeByTradePayload.set(payload, {
        stationId,
        commodityId,
        stock: Number.isFinite(stock) ? Number(stock) : null,
      });
    };
    const offMarketStockBefore = bus.on(
      'aiTrader:requestTrade',
      captureMarketStockBeforeOwner,
    );
    const tradeListeners = bus._listeners?.get?.('aiTrader:requestTrade');
    if (!(tradeListeners instanceof Set)) {
      offMarketStockBefore();
      throw new Error('Ceres observer cannot order the market owner receipt');
    }
    const priorTradeListeners = [...tradeListeners]
      .filter((listener) => listener !== captureMarketStockBeforeOwner);
    tradeListeners.clear();
    tradeListeners.add(captureMarketStockBeforeOwner);
    for (const listener of priorTradeListeners) tradeListeners.add(listener);
    trace.unsubs.push(offMarketStockBefore);

    const eventNames = [
      'encounter:telegraph', 'encounter:spawned', 'encounter:ended',
      'physics:impact', 'entity:killed', 'entity:destroyed',
      'tether:attached', 'tether:latched', 'tether:broken', 'tether:cut', 'tether:released',
      'massSeed:deployed', 'massSeed:locked', 'fields:deployed',
      'combat:fire', 'projectile:hit', 'combat:damage', 'combat:statusApplied',
      'save:completed', 'save:loaded',
      'mining:npcExtraction', 'aiTrader:requestTrade',
      'freight:arrival', 'freight:loss', 'traffic:jobActionReceipt',
      'npcjobs:commission', 'npcjobs:depart', 'npcjobs:transit', 'npcjobs:approach',
      'npcjobs:work', 'npcjobs:load', 'npcjobs:unload', 'npcjobs:return',
      'npcjobs:hold', 'npcjobs:cycle', 'npcjobs:arrived', 'npcjobs:complete',
    ];
    for (const event of eventNames) {
      const off = bus.on(event, (payload = {}) => {
        const sourceEntity = payload.sourceId != null
          ? state.entities?.get(payload.sourceId)
          : null;
        const targetEntityId = payload.targetId ?? payload.entityId ?? payload.id ?? null;
        const targetEntity = targetEntityId != null ? state.entities?.get(targetEntityId) : null;
        const eventActorId = payload.actorId ?? payload.minerId ?? payload.freighterId
          ?? payload.entityId ?? null;
        const eventActor = eventActorId != null ? state.entities?.get(eventActorId) : null;
        const stationId = payload.stationId ?? null;
        const commodityId = payload.commodityId ?? payload.good ?? null;
        const marketStockAfter = stationId && commodityId
          ? state.economy?.markets?.[stationId]?.[commodityId]?.stock
          : null;
        const marketBeforeReceipt = event === 'aiTrader:requestTrade'
          && payload && typeof payload === 'object'
          ? stockBeforeByTradePayload.get(payload)
          : null;
        trace.events.push({
          seq: trace.nextEventSeq++,
          event,
          tick: Number(window.SF?.state?.tick),
          routePhase: trace.routePhase,
          routePocketId: trace.routePocketId,
          id: payload.id ?? null,
          entityId: payload.entityId ?? payload.targetId ?? payload.id ?? null,
          targetId: payload.targetId ?? null,
          targetWorldRecordId: targetEntity?.data?.worldRecordId ?? null,
          actorId: payload.actorId ?? null,
          attackerId: payload.attackerId ?? null,
          killerId: payload.killerId ?? null,
          aId: payload.aId ?? null,
          bId: payload.bId ?? null,
          attachmentId: payload.attachmentId ?? null,
          encounterId: payload.encounterId ?? payload.id ?? null,
          jobId: payload.jobId ?? null,
          ownerId: payload.ownerId ?? null,
          sourceId: payload.sourceId ?? null,
          sourceOwnerId: sourceEntity?.ownerId ?? sourceEntity?.data?.ownerId ?? null,
          seedId: payload.seedId ?? null,
          fieldId: payload.fieldId ?? null,
          kind: payload.kind ?? null,
          weaponId: payload.weaponId ?? null,
          statusId: payload.statusId ?? null,
          previewMatched: payload.previewMatched ?? null,
          amount: Number.isFinite(payload.amount) ? payload.amount : null,
          applied: Number.isFinite(payload.applied) ? payload.applied : null,
          reason: payload.reason ?? null,
          worldRecordId: payload.worldRecordId ?? null,
          actorSlotId: payload.actorSlotId ?? eventActor?.data?.activityActorSlotId ?? null,
          actorWorldRecordId: eventActor?.data?.worldRecordId ?? null,
          actorJobId: payload.jobId ?? eventActor?.data?.jobId ?? null,
          actorRole: eventActor?.data?.trafficRole ?? eventActor?.data?.role ?? null,
          actorDefId: eventActor?.data?.defId ?? null,
          actorHull: Number.isFinite(eventActor?.hull) ? Number(eventActor.hull) : null,
          minerId: payload.minerId ?? null,
          freighterId: payload.freighterId ?? null,
          asteroidId: payload.asteroidId ?? null,
          fieldId: payload.fieldId ?? null,
          sectorId: payload.sectorId ?? null,
          stationId,
          commodityId,
          side: payload.side ?? null,
          qty: Number.isFinite(payload.qty) ? Number(payload.qty) : null,
          extractedU: Number.isFinite(payload.extractedU) ? Number(payload.extractedU) : null,
          workId: payload.workId ?? null,
          intentId: payload.intentId ?? null,
          receiptId: payload.receiptId ?? null,
          actionId: payload.actionId ?? null,
          action: payload.action ?? null,
          sequence: Number.isSafeInteger(payload.sequence) ? payload.sequence : null,
          kernelSequence: Number.isSafeInteger(payload.kernelSequence)
            ? payload.kernelSequence
            : null,
          effectType: payload.effectType ?? null,
          effectApplied: payload.effectApplied ?? null,
          manifestId: payload.manifestId ?? null,
          lotId: payload.lotId ?? null,
          lotSource: payload.lotSource && typeof payload.lotSource === 'object'
            ? { ...payload.lotSource }
            : null,
          trades: Array.isArray(payload.trades) ? payload.trades.map((trade) => ({
            stationId: trade?.stationId ?? null,
            commodityId: trade?.commodityId ?? null,
            side: trade?.side ?? null,
            qty: Number.isFinite(trade?.qty) ? Number(trade.qty) : null,
          })) : [],
          totalQty: Number.isFinite(payload.totalQty) ? Number(payload.totalQty) : null,
          marketStockBefore: Number.isFinite(marketBeforeReceipt?.stock)
            ? Number(marketBeforeReceipt.stock)
            : null,
          marketStockAfter: Number.isFinite(marketStockAfter) ? Number(marketStockAfter) : null,
          cargoManifestAfter: projectCargoManifest(eventActor?.data?.cargoManifest),
          playerEconomyAfter: projectPlayerEconomy(state),
        });
        if (marketBeforeReceipt) stockBeforeByTradePayload.delete(payload);
        if (trace.events.length > 4_000) trace.events.splice(0, trace.events.length - 4_000);
      });
      if (typeof off === 'function') trace.unsubs.push(off);
    }

    const isRenderVisible = (entity) => {
      const root = entity?.view?.root || entity?.mesh || null;
      const camera = state.render?.camera || null;
      if (!root || !camera || !root.matrixWorld?.elements
          || !camera.matrixWorldInverse?.elements || !camera.projectionMatrix?.elements) return false;
      let node = root;
      while (node) {
        if (node.visible === false) return false;
        node = node.parent || null;
      }
      const world = root.matrixWorld.elements;
      const view = camera.matrixWorldInverse.elements;
      const projection = camera.projectionMatrix.elements;
      const x = world[12]; const y = world[13]; const z = world[14];
      const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
      const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
      const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
      const vw = view[3] * x + view[7] * y + view[11] * z + view[15];
      const cx = projection[0] * vx + projection[4] * vy + projection[8] * vz + projection[12] * vw;
      const cy = projection[1] * vx + projection[5] * vy + projection[9] * vz + projection[13] * vw;
      const cz = projection[2] * vx + projection[6] * vy + projection[10] * vz + projection[14] * vw;
      const cw = projection[3] * vx + projection[7] * vy + projection[11] * vz + projection[15] * vw;
      if (!Number.isFinite(cw) || cw <= 0) return false;
      return Math.abs(cx / cw) <= 1 && Math.abs(cy / cw) <= 1 && Math.abs(cz / cw) <= 1;
    };

    const sample = (force = false) => {
      const live = window.SF?.state;
      const tick = Number(live?.tick);
      if (!Number.isSafeInteger(tick) || !trace.running) return;
      if (!force && trace.lastSampleTick != null && tick - trace.lastSampleTick < 6
          && tick < contract.endTick) return;
      trace.lastSampleTick = tick;
      const entities = Array.isArray(live.entityList) ? live.entityList : [];
      const byActor = new Map(); const byObject = new Map(); const byAnchor = new Map();
      const hostiles = [];
      for (const entity of entities) {
        if (!entity || entity.alive === false) continue;
        const data = entity.data || {};
        if (data.activityActorSlotId) byActor.set(data.activityActorSlotId, entity);
        if (data.activityObjectSlotId) byObject.set(data.activityObjectSlotId, entity);
        if (data.activityCollisionAnchorSlotId) byAnchor.set(data.activityCollisionAnchorSlotId, entity);
        if (entity.type === 'ship' && String(data.worldRecordId || '')
            && data.ai?.zoneId === 'zone_ceres_ambush'
            && data.ai?.squadId === 'zone_ceres_ambush') {
          hostiles.push(entity);
        }
      }
      const activity = [];
      for (const [slotId, entity] of [...byActor, ...byObject, ...byAnchor]) {
        if (slotId === excludedPocketActorSlotId) continue;
        activity.push({ slotId, entity, pocketId: slotToPocket[slotId] || null });
      }
      for (const entity of hostiles) {
        activity.push({ slotId: `hostile:${entity.data?.worldRecordId || entity.id}`, entity, pocketId: 'ceres_ambush_run' });
      }
      const visible = activity.filter((entry) => isRenderVisible(entry.entity));
      const player = live.entities?.get(live.playerId);
      const pocketPositions = Object.fromEntries(pockets.map((id) => [id, []]));
      for (const entry of activity) {
        const pos = entry.entity?.pos;
        if (entry.pocketId && Number.isFinite(pos?.x) && Number.isFinite(pos?.z)) {
          pocketPositions[entry.pocketId].push(pos);
        }
      }
      let nearestPocketId = trace.routePocketId;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const pocketId of pockets) {
        for (const pos of pocketPositions[pocketId]) {
          const distance = Math.hypot(Number(pos.x) - Number(player?.pos?.x), Number(pos.z) - Number(player?.pos?.z));
          if (distance < nearestDistance) { nearestDistance = distance; nearestPocketId = pocketId; }
        }
      }
      const actorStates = actors.map((slotId) => {
        const entity = byActor.get(slotId);
        return entity ? {
          slotId,
          entityId: entity.id,
          worldRecordId: entity.data?.worldRecordId || null,
          jobId: entity.data?.jobId || null,
          role: entity.data?.trafficRole || entity.data?.role || null,
          defId: entity.data?.defId || null,
          hull: Number.isFinite(entity.hull) ? Number(entity.hull) : null,
          hullMax: Number.isFinite(entity.hullMax) ? Number(entity.hullMax) : null,
          cargoManifest: projectCargoManifest(entity.data?.cargoManifest),
          team: entity.team ?? entity.data?.team ?? null,
          factionId: entity.factionId || entity.data?.factionId || null,
          lawful: entity.data?.ai?.lawful === true,
          passive: entity.data?.ai?.passive === true,
          roe: entity.data?.ai?.roe || null,
          serviceHookId: entity.data?.worldSiteTrafficHookId || null,
          ceresActivityJobOwned: entity.data?.ceresActivityJobOwned ?? null,
          x: Number(entity.pos?.x),
          z: Number(entity.pos?.z),
        } : { slotId, missing: true };
      });
      const playerAlive = !!player && player.alive !== false && Number(player.hull) > 0;
      const row = {
        observedTick: tick,
        tick: Math.min(Math.max(tick, contract.startTick), contract.endTick),
        simTimeS: Number(live.simTime),
        timeScale: Number(live.timeScale),
        sectorId: live.world?.currentSectorId || null,
        playerId: live.playerId ?? null,
        playerAlive,
        playerPos: { x: Number(player?.pos?.x), z: Number(player?.pos?.z) },
        routePhase: trace.routePhase,
        routePocketId: trace.routePocketId,
        nearestPocketId,
        visibleActivityCount: visible.length,
        visibleActivityIds: visible.map((entry) => entry.slotId).sort(),
        actorSlotIds: [...byActor.keys()].sort(),
        objectSlotIds: [...byObject.keys()].sort(),
        collisionAnchorSlotIds: [...byAnchor.keys()].sort(),
        hostileIds: hostiles.map((entity) => entity.id).sort((a, b) => String(a).localeCompare(String(b))),
        actorStates,
        playerEconomy: projectPlayerEconomy(live),
      };
      trace.samples.push(row);
      if (!playerAlive || row.sectorId !== 'sector_ceres_belt' || row.timeScale !== 1
          || !Number.isFinite(row.playerPos.x) || !Number.isFinite(row.playerPos.z)) {
        trace.failures.push({ tick, reason: 'route-health', row });
      }
      if (tick >= contract.endTick) trace.running = false;
    };
    trace.sample = sample;
    const frame = () => {
      sample(false);
      if (trace.running) trace.raf = requestAnimationFrame(frame);
    };
    sample(true);
    trace.raf = requestAnimationFrame(frame);
    return contract;
  }, {
    requestedContract: bounds,
    actors: CERES_FIVE_MINUTE_ACTOR_SLOT_IDS,
    objects: CERES_FIVE_MINUTE_OBJECT_SLOT_IDS,
    anchors: CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS,
    pockets: CERES_FIVE_MINUTE_POCKET_IDS,
    initialPocket: initialPocketId,
    excludedPocketActorSlotId: CERES_SERVICE_ACTOR_SLOT_ID,
  });
}

async function setCeresObserverPhase(page, routePhase, routePocketId) {
  await page.evaluate(({ phase, pocket }) => {
    const trace = window.__SF_CERES_FIVE_MINUTE_TRACE__;
    if (!trace) return;
    trace.routePhase = phase;
    if (pocket) trace.routePocketId = pocket;
  }, { phase: routePhase, pocket: routePocketId });
}

function normalizeCeresOreCycleGateConfig(config) {
  if (!config || config.enabled !== true) return null;
  const minPostContinueTicks = Number(config.minPostContinueTicks);
  const timeoutMs = Number(config.timeoutMs);
  if (!Number.isSafeInteger(minPostContinueTicks) || minPostContinueTicks < 600
      || minPostContinueTicks >= CERES_FIVE_MINUTE_FIXED_TICKS
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 240_000) {
    throw new TypeError('Ceres ore-cycle gate requires bounded post-Continue ticks and timeout');
  }
  return { enabled: true, minPostContinueTicks, timeoutMs };
}

export function evaluateCeresOreCycleSaveGateReceipt(
  receipt,
  { endTick, minPostContinueTicks } = {},
) {
  const failures = [];
  const deadlineTick = Number(endTick) - Number(minPostContinueTicks);
  const actor = receipt?.actor;
  const manifest = receipt?.manifest;
  const line = manifest?.lines?.[0];
  if (!Number.isSafeInteger(endTick) || !Number.isSafeInteger(minPostContinueTicks)
      || !Number.isSafeInteger(deadlineTick)) {
    failures.push('ore-cycle save gate horizon is invalid');
  }
  if (receipt?.status !== 'loaded' || receipt?.routePhase !== 'ore-cycle-pre-save-gate'
      || !Number.isSafeInteger(receipt?.tick) || receipt.tick > deadlineTick
      || receipt.deadlineTick !== deadlineTick
      || receipt.remainingTicks !== endTick - receipt.tick
      || receipt.remainingTicks < minPostContinueTicks) {
    failures.push('ore-cycle save gate did not reserve the required post-Continue horizon');
  }
  if (actor?.slotId !== 'ceres_seam_miner' || actor?.role !== 'ore_carrier'
      || actor?.defId !== 'ship_ironback' || actor?.entityId == null
      || !String(actor?.worldRecordId || '') || !String(actor?.jobId || '')) {
    failures.push('ore-cycle save gate did not observe the durable live Ore Barge');
  }
  if (!manifest || manifest.role !== 'ore_carrier'
      || !String(manifest.manifestId || '') || manifest.lotId !== manifest.manifestId
      || !Array.isArray(manifest.lines) || manifest.lines.length !== 1
      || !Number.isSafeInteger(manifest.totalQty) || manifest.totalQty <= 0
      || line?.qty !== manifest.totalQty || !String(line?.commodityId || '')
      || !String(manifest.lotSource?.workId || '')
      || manifest.lotSource?.asteroidId == null
      || manifest.lotSource?.fieldId !== 'f_ceres_1'
      || manifest.lotSource?.sectorId !== 'sector_ceres_belt'
      || manifest.custody?.holderKind !== 'traffic'
      || manifest.custody?.holderId !== actor?.worldRecordId
      || manifest.custody?.acquiredBy !== 'mining:npcExtraction') {
    failures.push('ore-cycle save gate did not observe a valid loaded extraction lot in Ore Barge custody');
  }
  return { pass: failures.length === 0, failures };
}

export function evaluateCeresPersistedOreCycleSaveReceipt(
  receipt,
  { gateReceipt } = {},
) {
  const failures = [];
  if (!receipt || receipt.schema !== 'spaceface.ceresPersistedOreCycleSave.v1'
      || receipt.source !== 'sf.save.quick'
      || receipt.envelope?.fmt !== 'spaceface-save'
      || receipt.envelope?.slot !== 'quick'
      || !Number.isSafeInteger(receipt.envelope?.version)
      || !String(receipt.envelope?.checksum || '')
      || !Number.isFinite(Date.parse(String(receipt.envelope?.savedAt || '')))) {
    failures.push('persisted quick-save envelope identity is invalid');
  }
  if (!Number.isSafeInteger(receipt?.savedAtTick)
      || receipt.savedAtTick !== receipt?.saveCompletedTick) {
    failures.push('persisted quick-save tick does not equal the synchronous save completion tick');
  }
  const savedActor = receipt?.actor;
  const gateActor = gateReceipt?.actor;
  if (savedActor?.worldRecordId !== gateActor?.worldRecordId
      || savedActor?.role !== 'ore_carrier'
      || savedActor?.defId !== 'ship_ironback'
      || !Number.isFinite(savedActor?.hull) || savedActor.hull <= 0) {
    failures.push('persisted quick-save does not contain the gated durable Ironback record');
  }
  if (receipt?.job?.jobId !== gateActor?.jobId
      || receipt?.job?.worldRecordId !== gateActor?.worldRecordId) {
    failures.push('persisted quick-save job does not bind the gated Ore Barge world record');
  }
  if (stableJson(receipt?.manifest) !== stableJson(gateReceipt?.manifest)) {
    failures.push('persisted quick-save Ore Barge lot differs from the loaded gate lot');
  }
  return { pass: failures.length === 0, failures };
}

const CERES_ORE_CYCLE_SAVE_GATE_RECEIPT_KEY = '__SF_CERES_ORE_CYCLE_SAVE_GATE_RECEIPT__';

export async function waitForCeresOreCycleSaveGate(page, {
  endTick,
  minPostContinueTicks,
  timeoutMs,
}) {
  const deadlineTick = endTick - minPostContinueTicks;
  const receiptKey = CERES_ORE_CYCLE_SAVE_GATE_RECEIPT_KEY;
  try {
    await page.evaluate(({ key }) => {
      delete window[key];
      return true;
    }, { key: receiptKey });
    await page.waitForFunction(({ deadline, key }) => {
      const trace = window.__SF_CERES_FIVE_MINUTE_TRACE__;
      if (trace?.sample) trace.sample(true);
      const latest = trace?.samples?.at?.(-1) || null;
      const actor = latest?.actorStates?.find?.((row) => row?.slotId === 'ceres_seam_miner');
      const manifest = actor?.cargoManifest;
      const line = manifest?.lines?.[0];
      const loaded = actor?.role === 'ore_carrier'
        && actor?.defId === 'ship_ironback'
        && actor?.entityId != null
        && !!actor?.worldRecordId
        && !!actor?.jobId
        && manifest?.role === 'ore_carrier'
        && !!manifest?.manifestId
        && manifest?.lotId === manifest?.manifestId
        && Array.isArray(manifest?.lines)
        && manifest.lines.length === 1
        && Number.isSafeInteger(manifest?.totalQty)
        && manifest.totalQty > 0
        && line?.qty === manifest.totalQty
        && !!line?.commodityId
        && !!manifest?.lotSource?.workId
        && manifest?.lotSource?.asteroidId != null
        && manifest?.lotSource?.fieldId === 'f_ceres_1'
        && manifest?.lotSource?.sectorId === 'sector_ceres_belt'
        && manifest?.custody?.holderKind === 'traffic'
        && manifest?.custody?.holderId === actor.worldRecordId
        && manifest?.custody?.acquiredBy === 'mining:npcExtraction';
      const tick = Number(latest?.observedTick);
      if (loaded) {
        window[key] = {
          status: 'loaded',
          tick,
          deadlineTick: deadline,
          remainingTicks: Number(trace?.bounds?.endTick) - tick,
          routePhase: latest.routePhase,
          actor: {
            slotId: actor.slotId,
            role: actor.role,
            defId: actor.defId,
            entityId: actor.entityId,
            worldRecordId: actor.worldRecordId,
            jobId: actor.jobId,
          },
          manifest: {
            manifestId: manifest.manifestId ?? null,
            lotId: manifest.lotId ?? null,
            lotSource: manifest.lotSource && typeof manifest.lotSource === 'object'
              ? { ...manifest.lotSource }
              : null,
            role: manifest.role ?? null,
            lines: manifest.lines.map((entry) => ({
              commodityId: entry?.commodityId ?? null,
              qty: Number.isFinite(entry?.qty) ? Number(entry.qty) : null,
            })),
            totalQty: Number(manifest.totalQty),
            custody: manifest.custody && typeof manifest.custody === 'object'
              ? { ...manifest.custody }
              : null,
          },
        };
        return true;
      }
      if (Number.isSafeInteger(tick) && tick >= deadline) {
        window[key] = { status: 'deadline', tick, deadlineTick: deadline };
        return true;
      }
      return false;
    }, { deadline: deadlineTick, key: receiptKey }, { timeout: timeoutMs });
    const receipt = await page.evaluate(({ key }) => window[key] ?? null, { key: receiptKey });
    const evaluated = evaluateCeresOreCycleSaveGateReceipt(receipt, {
      endTick,
      minPostContinueTicks,
    });
    if (!evaluated.pass) {
      throw new Error(`CERES_ORE_CYCLE_SAVE_GATE_FAILED: ${evaluated.failures.join('; ')}`);
    }
    return receipt;
  } catch (error) {
    if (String(error?.message || error).startsWith('CERES_ORE_CYCLE_SAVE_GATE_FAILED')) throw error;
    throw new Error(`CERES_ORE_CYCLE_SAVE_GATE_TIMEOUT: ${error?.message || error}`);
  } finally {
    await page.evaluate(({ key }) => {
      delete window[key];
      return true;
    }, { key: receiptKey }).catch(() => {});
  }
}

async function readPersistedCeresOreCycleSave(page, gateReceipt) {
  return page.evaluate((expected) => {
    const projectManifest = (manifest) => {
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
      return {
        manifestId: manifest.manifestId ?? null,
        lotId: manifest.lotId ?? null,
        lotSource: manifest.lotSource && typeof manifest.lotSource === 'object'
          ? { ...manifest.lotSource }
          : null,
        role: manifest.role ?? null,
        lines: Array.isArray(manifest.lines) ? manifest.lines.map((line) => ({
          commodityId: line?.commodityId ?? null,
          qty: Number.isFinite(line?.qty) ? Number(line.qty) : null,
        })) : [],
        totalQty: Number.isFinite(manifest.totalQty) ? Number(manifest.totalQty) : null,
        custody: manifest.custody && typeof manifest.custody === 'object'
          ? { ...manifest.custody }
          : null,
      };
    };
    let envelope = null;
    try { envelope = JSON.parse(localStorage.getItem('sf.save.quick') || 'null'); } catch (_) {}
    const record = envelope?.data?.world?.records?.byId?.[expected.worldRecordId] || null;
    const jobEntry = envelope?.data?.npcJobs?.byId?.[expected.jobId] || null;
    const saveEvent = (window.__SF_CERES_FIVE_MINUTE_TRACE__?.events || [])
      .filter((event) => event?.event === 'save:completed').at(-1) || null;
    return {
      schema: 'spaceface.ceresPersistedOreCycleSave.v1',
      source: 'sf.save.quick',
      envelope: envelope ? {
        fmt: envelope.fmt ?? null,
        version: envelope.version ?? null,
        slot: envelope.slot ?? null,
        savedAt: envelope.savedAt ?? null,
        checksum: envelope.checksum ?? null,
      } : null,
      savedAtTick: Number(envelope?.data?.entities?.tick),
      saveCompletedTick: Number(saveEvent?.tick),
      actor: record ? {
        worldRecordId: record.recordId ?? expected.worldRecordId,
        role: record.trafficRole ?? null,
        defId: record.shipDefId ?? null,
        hull: Number.isFinite(record.hull) ? Number(record.hull) : null,
      } : null,
      job: jobEntry ? {
        jobId: jobEntry.job?.id ?? null,
        worldRecordId: jobEntry.worldRecordId ?? null,
      } : null,
      manifest: projectManifest(record?.cargoManifest),
    };
  }, {
    worldRecordId: gateReceipt?.actor?.worldRecordId ?? null,
    jobId: gateReceipt?.actor?.jobId ?? null,
  });
}

async function stopCeresRouteObserver(page) {
  return page.evaluate(() => {
    const trace = window.__SF_CERES_FIVE_MINUTE_TRACE__;
    if (!trace) return { samples: [], events: [], failures: [], missing: true };
    if (trace.running && typeof trace.sample === 'function') trace.sample(true);
    trace.running = false;
    if (trace.raf) cancelAnimationFrame(trace.raf);
    for (const off of trace.unsubs || []) { try { off(); } catch (_) {} }
    trace.unsubs = [];
    trace.stoppedAt = new Date().toISOString();
    return {
      schema: trace.schema,
      bounds: trace.bounds,
      samples: trace.samples,
      events: trace.events,
      failures: trace.failures,
      startedAt: trace.startedAt,
      stoppedAt: trace.stoppedAt,
    };
  });
}

async function provePublicFlightInput(page) {
  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  const box = await canvas.boundingBox();
  assert(box && box.width > 100 && box.height > 100, 'flight canvas must expose a pointer target');
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.46);
  await canvas.focus();
  const before = await readInputSnapshot(page);
  let observed;
  let release;
  try {
    await page.keyboard.down('KeyW');
    await page.waitForFunction((tick) => {
      const state = window.SF?.state;
      return Number(state?.tick) > tick && Math.abs(Number(state?.input?.moveZ || 0)) > 0.5;
    }, before.tick, { timeout: 30_000 });
    observed = await readInputSnapshot(page);
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
  }
  await page.waitForFunction((tick) => {
    const state = window.SF?.state;
    return Number(state?.tick) > tick && Math.abs(Number(state?.input?.moveZ || 0)) < 0.02;
  }, observed.tick, { timeout: 30_000 });
  release = await readTick(page);
  await page.waitForFunction((tick) => Number(window.SF?.state?.tick) > tick,
    release, { timeout: 30_000 });
  const neutral = await readInputSnapshot(page);
  const distance = Math.hypot(neutral.pos.x - before.pos.x, neutral.pos.z - before.pos.z);
  const receipt = {
    action: 'thrustForward',
    pressTick: before.tick,
    observedTick: observed.tick,
    releaseTick: release,
    neutralTick: neutral.tick,
    observedState: { active: Math.abs(observed.moveZ) > 0.5 },
    neutralState: { active: Math.abs(neutral.moveZ) > 0.02 },
    motionObserved: distance > 0.01 || Math.abs(neutral.speed - before.speed) > 0.01,
    distance,
  };
  const validation = validatePublicInputReceipt(receipt);
  assert.deepEqual(validation.failures, [], `public input receipt failed: ${validation.failures.join('; ')}`);
  return receipt;
}

export function planCeresWorkingSeamEgress(beltOutpostArrival, {
  minRemainingTicks = 120,
} = {}) {
  const source = beltOutpostArrival?.player?.pos;
  const sourceX = Number(source?.x);
  const sourceZ = Number(source?.z);
  if (beltOutpostArrival?.sectorId !== CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId
      || beltOutpostArrival?.player?.alive !== true
      || !Number.isFinite(sourceX) || !Number.isFinite(sourceZ)) {
    throw new Error('Working Seam egress requires the live accepted Belt Outpost arrival');
  }
  if (!Number.isSafeInteger(minRemainingTicks) || minRemainingTicks < 120
      || minRemainingTicks >= CERES_FIVE_MINUTE_FIXED_TICKS) {
    throw new Error('Working Seam egress requires a valid fixed-tick reserve');
  }
  const seamAnchor = CERES_POCKET_TARGETS.ceres_working_seam.targetPos;
  const throughlineAnchor = CERES_POCKET_TARGETS.ceres_ambush_run.targetPos;
  const targetPos = CERES_WORKING_SEAM_DEPARTURE_CORRIDOR_GLOBAL;
  const pathDistanceWU = Math.hypot(targetPos.x - seamAnchor.x, targetPos.z - seamAnchor.z);
  const guaranteedPublicEgressWU = pathDistanceWU
    - CERES_WORKING_SEAM_EGRESS_ARRIVAL_RADIUS_WU * 2;
  if (guaranteedPublicEgressWU < CERES_WORKING_SEAM_MIN_GUARANTEED_EGRESS_WU) {
    throw new Error('Belt Outpost departure corridor cannot guarantee one public completion radius of escape');
  }
  const seamToThroughlineWU = Math.hypot(
    throughlineAnchor.x - seamAnchor.x,
    throughlineAnchor.z - seamAnchor.z,
  );
  const arrivalToThroughlineWU = Math.hypot(
    throughlineAnchor.x - targetPos.x,
    throughlineAnchor.z - targetPos.z,
  );
  const guaranteedThroughlineProgressWU = seamToThroughlineWU - arrivalToThroughlineWU
    - CERES_WORKING_SEAM_EGRESS_ARRIVAL_RADIUS_WU * 2;
  if (guaranteedThroughlineProgressWU < CERES_WORKING_SEAM_MIN_GUARANTEED_EGRESS_WU) {
    throw new Error('Belt Outpost departure corridor cannot guarantee one public completion radius toward Throughline');
  }
  return Object.freeze({
    pocketId: 'ceres_working_seam',
    targetId: 'station_beltout-departure-corridor',
    targetName: 'Belt Outpost departure corridor',
    targetPos,
    sourceArrivalPos: Object.freeze({ x: sourceX, z: sourceZ }),
    arrivalRadiusWU: CERES_WORKING_SEAM_EGRESS_ARRIVAL_RADIUS_WU,
    allowBoost: false,
    minRemainingTicks,
    pathDistanceWU,
    guaranteedPublicEgressWU,
    guaranteedThroughlineProgressWU,
  });
}

export function planCeresThroughlineToolkitReposition() {
  const throughlineBeacon = CERES_POCKET_TARGETS.ceres_ambush_run.targetPos;
  return Object.freeze({
    source: 'public-flight-controls',
    reason: 'fixed-camera-hostile-acquisition',
    waypoints: Object.freeze([
      Object.freeze({
        targetId: 'ceres-throughline-toolkit-backout',
        targetName: 'Throughline toolkit backout',
        targetPos: Object.freeze({
          x: throughlineBeacon.x,
          z: throughlineBeacon.z,
        }),
        arrivalRadiusWU: CERES_TOOLKIT_CAMERA_BACKOUT_RADIUS_WU,
        minRemainingTicks: 120,
        allowBoost: false,
      }),
      Object.freeze({
        targetId: 'ceres-throughline-toolkit-camera-stage',
        targetName: 'Throughline toolkit camera stage',
        targetPos: CERES_TOOLKIT_CAMERA_STAGE_GLOBAL,
        arrivalRadiusWU: CERES_TOOLKIT_CAMERA_STAGE_RADIUS_WU,
        minRemainingTicks: 120,
        allowBoost: false,
      }),
    ]),
  });
}

export function chooseCeresPocketApproachAction(status, {
  arrivalRadiusWU = 90,
  allowBoost = true,
} = {}) {
  const distanceWU = Number(status?.distanceWU);
  const headingError = Number(status?.headingError);
  const speed = Number(status?.speed);
  if (!Number.isFinite(distanceWU) || distanceWU < 0
      || !Number.isFinite(headingError)
      || !Number.isFinite(speed) || speed < 0
      || !Number.isFinite(arrivalRadiusWU) || arrivalRadiusWU <= 0) {
    return Object.freeze({ kind: 'invalid' });
  }
  if (distanceWU <= arrivalRadiusWU && speed <= 1) return Object.freeze({ kind: 'complete' });
  if (distanceWU <= arrivalRadiusWU && speed > 1) {
    return Object.freeze({
      kind: 'settle',
      key: 'Digit0',
      boost: false,
    });
  }
  if (Math.abs(headingError) > 0.08) {
    const turnMagnitude = Math.abs(headingError);
    return Object.freeze({
      kind: 'turn',
      key: headingError > 0 ? 'KeyD' : 'KeyA',
      durationMs: turnMagnitude > 0.45 ? 80 : turnMagnitude > 0.2 ? 40 : 20,
    });
  }
  if (distanceWU < 150 && speed > 45) {
    return Object.freeze({
      kind: 'decelerate',
      key: 'KeyS',
      durationMs: 100,
      boost: false,
    });
  }
  return Object.freeze({
    kind: 'thrust',
    key: 'KeyW',
    durationMs: 160,
    boost: allowBoost !== false && distanceWU > 220 && speed < 120,
  });
}

async function readCeresPocketApproachStatus(page, point, terminalTick) {
  return page.evaluate(({ targetPoint, routeEndTick }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!player?.pos) return { missing: true, tick: Number(state?.tick) };
    const dx = Number(targetPoint.x) - Number(player.pos.x);
    const dz = Number(targetPoint.z) - Number(player.pos.z);
    const desired = Math.atan2(dz, dx);
    let headingError = desired - Number(player.rot || 0);
    while (headingError > Math.PI) headingError -= Math.PI * 2;
    while (headingError < -Math.PI) headingError += Math.PI * 2;
    const distanceWU = Math.hypot(dx, dz);
    const velocity = {
      x: Number(player.vel?.x) || 0,
      z: Number(player.vel?.z) || 0,
    };
    const speed = Math.hypot(velocity.x, velocity.z);
    return {
      tick: Number(state.tick),
      terminalTick: routeEndTick,
      distanceWU,
      headingError,
      speed,
      radialSpeed: distanceWU > 0 ? (velocity.x * dx + velocity.z * dz) / distanceWU : 0,
      playerAlive: player.alive !== false && Number(player.hull) > 0,
      playerPos: { x: Number(player.pos.x), z: Number(player.pos.z) },
      playerVel: velocity,
      mode: state.mode || null,
      autopilot: state.nav?.autopilot ? {
        active: state.nav.autopilot.active === true,
        label: state.nav.autopilot.label || null,
        status: state.nav.autopilot.status || null,
      } : null,
      input: state.input ? {
        moveZ: Number(state.input.moveZ) || 0,
        turnIntent: Number(state.input.turnIntent) || 0,
        brake: state.input.brake === true,
      } : null,
    };
  }, { targetPoint: point, routeEndTick: terminalTick });
}

export async function settleCeresPocketApproach(page, {
  point,
  endTick,
  minRemainingTicks = 120,
  targetName = 'Ceres pocket',
} = {}) {
  if (!Number.isSafeInteger(endTick) || !Number.isSafeInteger(minRemainingTicks)
      || minRemainingTicks < 120 || minRemainingTicks >= endTick) {
    throw new Error('Ceres public settle requires a valid fixed-tick reserve');
  }
  await page.keyboard.down('Digit0');
  try {
    await page.waitForFunction(({ terminalTick, reserveTicks }) => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      if (!player?.pos) return true;
      const tick = Number(state.tick);
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      return speed <= 1 || !Number.isSafeInteger(tick) || tick >= terminalTick - reserveTicks;
    }, { terminalTick: endTick, reserveTicks: minRemainingTicks }, { timeout: 10_000 });
    const status = await readCeresPocketApproachStatus(page, point, endTick);
    if (status.missing) throw new Error(`${targetName} settle lost the player`);
    if (!Number.isSafeInteger(status.tick) || status.tick >= endTick - minRemainingTicks) {
      throw new Error(`${targetName} settle exhausted the exact route horizon`);
    }
    if (!Number.isFinite(status.speed) || status.speed > 1) {
      throw new Error(`${targetName} public brake did not settle the player`);
    }
    return status;
  } finally {
    await page.keyboard.up('Digit0').catch(() => {});
  }
}

export async function drivePublicToCeresPoint(page, target, endTick) {
  if (!target?.targetPos || !Number.isFinite(Number(target.targetPos.x))
      || !Number.isFinite(Number(target.targetPos.z)) || !target.targetName) {
    throw new Error('Ceres public point approach requires a finite named target');
  }
  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  await canvas.focus();
  const diagnostic = createCeresPocketApproachDiagnostic(target, endTick);
  const arrivalRadiusWU = target.arrivalRadiusWU == null
    ? 90
    : Number(target.arrivalRadiusWU);
  const minRemainingTicks = target.minRemainingTicks == null
    ? 120
    : Number(target.minRemainingTicks);
  if (!Number.isSafeInteger(minRemainingTicks) || minRemainingTicks < 120
      || !Number.isSafeInteger(endTick) || minRemainingTicks >= endTick
      || !Number.isFinite(arrivalRadiusWU) || arrivalRadiusWU <= 0) {
    throw new Error('Ceres public point approach requires a valid fixed-tick reserve');
  }
  let approachPulses = 0;
  try {
    for (; approachPulses < 220;) {
      const status = await readCeresPocketApproachStatus(page, target.targetPos, endTick);
      if (status.missing) throw new Error(`${target.targetName} approach lost the player`);
      const action = chooseCeresPocketApproachAction(status, {
        arrivalRadiusWU,
        allowBoost: target.allowBoost !== false,
      });
      recordCeresPocketApproachDecision(diagnostic, status, action.kind);
      if (action.kind === 'invalid') {
        throw new Error(`${target.targetName} approach produced invalid navigation telemetry`);
      }
      if (!Number.isSafeInteger(status.tick) || status.tick >= endTick - minRemainingTicks) {
        throw new Error(`${target.targetName} approach exhausted the exact route horizon`);
      }
      if (action.kind === 'complete') return status;
      if (action.kind === 'settle') {
        diagnostic.counts.settleHolds += 1;
        const settled = await settleCeresPocketApproach(page, {
          point: target.targetPos,
          endTick,
          minRemainingTicks,
          targetName: target.targetName,
        });
        recordCeresPocketApproachDecision(diagnostic, settled, 'settle-result');
        if (settled.distanceWU <= arrivalRadiusWU) return settled;
        continue;
      }
      approachPulses += 1;
      diagnostic.counts.totalPulses += 1;
      if (action.kind === 'turn') {
        diagnostic.counts.turnPulses += 1;
        await page.keyboard.down(action.key);
        try {
          await page.waitForTimeout(action.durationMs);
        } finally {
          await page.keyboard.up(action.key).catch(() => {});
        }
      } else {
        if (action.kind === 'decelerate') diagnostic.counts.deceleratePulses += 1;
        else diagnostic.counts.thrustPulses += 1;
        if (action.boost) diagnostic.counts.boostPulses += 1;
        await page.keyboard.down(action.key);
        try {
          if (action.boost) await page.keyboard.down('Shift');
          await page.waitForTimeout(action.durationMs);
        } finally {
          await page.keyboard.up('Shift').catch(() => {});
          await page.keyboard.up(action.key).catch(() => {});
        }
      }
    }
    throw new Error(`public controls did not enter ${target.targetName}`);
  } catch (error) {
    const snapshot = snapshotCeresPocketApproachDiagnostic(diagnostic);
    error.ceresPocketApproachDiagnostic ||= snapshot;
    throw error;
  } finally {
    await releasePublicInput(page).catch(() => {});
  }
}

export async function repositionPublicForCeresToolkit(page, endTick, {
  playerEntityId,
  anchorEntityId,
  anchorImpactTick,
} = {}) {
  if (playerEntityId == null || anchorEntityId == null
      || !Number.isSafeInteger(anchorImpactTick)) {
    throw new Error('toolkit camera reposition requires the exact collision authority');
  }
  const start = await page.evaluate(({ expectedPlayerId, expectedAnchorId }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(expectedPlayerId);
    const anchor = state?.entities?.get(expectedAnchorId);
    return {
      tick: Number(state?.tick),
      nextEventSeq: Number(window.__SF_CERES_FIVE_MINUTE_TRACE__?.nextEventSeq),
      playerEntityId: player?.id ?? null,
      anchorEntityId: anchor?.data?.activityCollisionAnchorSlotId
        === 'ceres_throughline_collision_anchor' ? anchor.id : null,
    };
  }, { expectedPlayerId: playerEntityId, expectedAnchorId: anchorEntityId });
  if (!Number.isSafeInteger(start.tick) || !Number.isSafeInteger(start.nextEventSeq)
      || start.nextEventSeq < 1 || start.tick < anchorImpactTick
      || start.playerEntityId !== playerEntityId || start.anchorEntityId !== anchorEntityId) {
    throw new Error('toolkit camera reposition lost the exact collision authority');
  }
  const plan = planCeresThroughlineToolkitReposition();
  const receipts = [];
  for (const waypoint of plan.waypoints) {
    receipts.push(await drivePublicToCeresPoint(page, waypoint, endTick));
  }
  const completedAtTick = Number(receipts.at(-1)?.tick);
  if (!Number.isSafeInteger(completedAtTick) || completedAtTick < start.tick) {
    throw new Error('toolkit camera reposition lacks an ordered completion tick');
  }
  return Object.freeze({
    pass: true,
    source: plan.source,
    reason: plan.reason,
    startTick: start.tick,
    movementEndTick: completedAtTick,
    playerEntityId,
    anchorEntityId,
    anchorImpactTick,
    impactCaptureStartSeq: start.nextEventSeq,
    waypoints: plan.waypoints,
    receipts: Object.freeze(receipts.map((receipt) => Object.freeze({ ...receipt }))),
  });
}

export async function drivePublicToPocketAnchor(page, pocketId, endTick) {
  const target = CERES_POCKET_TARGETS[pocketId];
  if (!target) throw new Error(`unknown Ceres pocket ${pocketId}`);
  return drivePublicToCeresPoint(page, target, endTick);
}

function createCeresPocketApproachDiagnostic(target, endTick) {
  return {
    schema: 'spaceface.ceresPocketApproachDiagnostic.v1',
    pocketId: target.pocketId,
    targetId: target.targetId,
    targetName: target.targetName,
    targetPos: { ...target.targetPos },
    endTick,
    startTick: null,
    bestDistanceWU: null,
    lastAction: null,
    lastStatus: null,
    counts: {
      totalPulses: 0,
      turnPulses: 0,
      thrustPulses: 0,
      boostPulses: 0,
      deceleratePulses: 0,
      settleHolds: 0,
    },
    decisionTail: [],
  };
}

function recordCeresPocketApproachDecision(diagnostic, status, action) {
  const compact = {
    tick: status.tick,
    action,
    distanceWU: status.distanceWU,
    speed: status.speed,
    radialSpeed: status.radialSpeed,
    headingError: status.headingError,
  };
  diagnostic.startTick ??= Number.isSafeInteger(status.tick) ? status.tick : null;
  if (Number.isFinite(status.distanceWU)) {
    diagnostic.bestDistanceWU = diagnostic.bestDistanceWU == null
      ? status.distanceWU : Math.min(diagnostic.bestDistanceWU, status.distanceWU);
  }
  diagnostic.lastAction = action;
  diagnostic.lastStatus = {
    ...compact,
    playerAlive: status.playerAlive,
    playerPos: status.playerPos,
    playerVel: status.playerVel,
    mode: status.mode,
    autopilot: status.autopilot,
    input: status.input,
  };
  diagnostic.decisionTail.push(compact);
  if (diagnostic.decisionTail.length > 16) diagnostic.decisionTail.shift();
}

function snapshotCeresPocketApproachDiagnostic(diagnostic) {
  return {
    ...diagnostic,
    counts: { ...diagnostic.counts },
    lastStatus: diagnostic.lastStatus ? { ...diagnostic.lastStatus } : null,
    decisionTail: diagnostic.decisionTail.map((row) => ({ ...row })),
  };
}

async function readAutopilotPhysicalReceipt(page, { pocketId }) {
  const target = CERES_POCKET_TARGETS[pocketId];
  const navigation = CERES_POCKET_NAVIGATION[pocketId];
  if (!target || !navigation) throw new Error(`unknown Ceres pocket ${pocketId}`);
  const receipt = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const autopilot = state?.nav?.autopilot;
    const targetEntity = autopilot?.targetEntityId != null
      ? state?.entities?.get(autopilot.targetEntityId) : null;
    const data = targetEntity?.data || {};
    if (!player?.pos || !autopilot) return null;
    return {
      playerPos: { x: Number(player.pos.x), z: Number(player.pos.z) },
      navigationLabel: String(autopilot.label || ''),
      navigationTargetEntityId: autopilot.targetEntityId ?? null,
      navigationTargetIdentity: data.stationId || data.poiId || data.worldSiteId
        || data.worldObjectId || null,
      navigationTargetPos: finitePoint(autopilot.target || targetEntity?.pos),
      autopilotStatus: autopilot.status || null,
    };
    function finitePoint(value) {
      return value && Number.isFinite(value.x) && Number.isFinite(value.z)
        ? { x: Number(value.x), z: Number(value.z) } : null;
    }
  });
  if (!receipt) throw new Error(`${target.targetName} lacks a retained public autopilot target`);
  return physicalArrivalReceipt({ ...target, ...navigation, ...receipt });
}

function physicalArrivalReceipt({
  targetId,
  targetName,
  targetPos,
  playerPos,
  navigationLabel = null,
  navigationTargetEntityId = null,
  navigationTargetIdentity = null,
  navigationTargetPos = null,
  label = null,
  identity = null,
  autopilotStatus,
}) {
  const distanceWU = finiteXZ(targetPos) && finiteXZ(playerPos)
    ? Math.hypot(playerPos.x - targetPos.x, playerPos.z - targetPos.z)
    : NaN;
  const navigationPass = label == null
    ? navigationLabel == null && navigationTargetEntityId == null
    : navigationLabel === label && navigationTargetIdentity === identity
      && finiteXZ(navigationTargetPos) && autopilotStatus === 'arrived';
  return {
    pass: !!String(targetId || '') && !!String(targetName || '')
      && Number.isFinite(distanceWU) && distanceWU <= CERES_AMBUSH_OUTER_RADIUS_WU
      && navigationPass,
    targetId,
    targetName,
    playerPos,
    targetPos,
    distanceWU,
    navigationLabel,
    navigationTargetEntityId,
    navigationTargetIdentity,
    navigationTargetPos,
    autopilotStatus,
  };
}

async function drivePublicAnchorCollision(page, endTick) {
  const slotId = 'ceres_throughline_collision_anchor';
  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  await canvas.focus();
  const setup = await page.evaluate((targetSlotId) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const anchor = (state?.entityList || []).find((entity) => (
      entity?.alive !== false && entity.data?.activityCollisionAnchorSlotId === targetSlotId
    ));
    return player && anchor ? {
      playerId: player.id,
      anchorEntityId: anchor.id,
      collides: anchor.collides !== false && Number(anchor.mass) > 0,
    } : null;
  }, slotId);
  if (!setup || setup.collides !== true) throw new Error('Throughline collision anchor is not a live collider');

  try {
    for (let attempt = 0; attempt < 220; attempt += 1) {
      const status = await page.evaluate(({ targetSlotId, playerId, anchorEntityId }) => {
        const state = window.SF?.state;
        const player = state?.entities?.get(playerId);
        const anchor = (state?.entityList || []).find((entity) => (
          entity?.alive !== false
            && entity.id === anchorEntityId
            && entity.data?.activityCollisionAnchorSlotId === targetSlotId
        ));
        const impact = (window.__SF_CERES_FIVE_MINUTE_TRACE__?.events || []).find((event) => (
          event.event === 'physics:impact'
            && ((event.aId === playerId && event.bId === anchorEntityId)
              || (event.bId === playerId && event.aId === anchorEntityId))
        ));
        if (!player || !anchor) return { missing: true, tick: Number(state?.tick) };
        const dx = Number(anchor.pos?.x) - Number(player.pos?.x);
        const dz = Number(anchor.pos?.z) - Number(player.pos?.z);
        const desired = Math.atan2(dz, dx);
        let headingError = desired - Number(player.rot || 0);
        while (headingError > Math.PI) headingError -= Math.PI * 2;
        while (headingError < -Math.PI) headingError += Math.PI * 2;
        return {
          tick: Number(state.tick),
          impact,
          distanceWU: Math.hypot(dx, dz),
          headingError,
          speed: Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0),
        };
      }, { targetSlotId: slotId, ...setup });
      if (status.impact) {
        return {
          pass: true,
          inputSource: 'public-keyboard-mouse',
          slotId,
          playerEntityId: setup.playerId,
          anchorEntityId: setup.anchorEntityId,
          impact: status.impact,
        };
      }
      if (status.missing) throw new Error('Throughline collision target disappeared before impact');
      if (!Number.isSafeInteger(status.tick) || status.tick >= endTick - 120) {
        throw new Error('Throughline collision attempt exhausted the five-minute horizon');
      }
      if (Math.abs(status.headingError) > 0.09) {
        const key = status.headingError > 0 ? 'KeyD' : 'KeyA';
        await page.keyboard.down(key);
        await page.waitForTimeout(90);
        await page.keyboard.up(key);
      } else {
        await page.keyboard.down('KeyW');
        if (status.distanceWU > 45 && status.speed < 90) await page.keyboard.down('Shift');
        await page.waitForTimeout(status.distanceWU > 30 ? 180 : 80);
        await page.keyboard.up('Shift').catch(() => {});
        await page.keyboard.up('KeyW');
      }
    }
  } finally {
    await releasePublicInput(page).catch(() => {});
  }
  throw new Error('public flight controls did not produce an exact Throughline-anchor impact');
}

async function exercisePublicPhysicsToolkit(page, endTick, collisionProof) {
  const canvas = page.locator('#gl-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('toolkit exercise requires the flight canvas');
  await canvas.focus();
  const prebound = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const boundHostiles = (state?.entityList || []).filter((entity) => (
      entity?.alive !== false && entity?.type === 'ship'
      && String(entity.data?.worldRecordId || '') && (
        entity.data?.ai?.zoneId === 'zone_ceres_ambush'
          && entity.data?.ai?.squadId === 'zone_ceres_ambush'
      )
    )).map((entity) => ({
      entityId: entity.id,
      worldRecordId: entity.data.worldRecordId,
    })).sort((left, right) => String(left.worldRecordId).localeCompare(String(right.worldRecordId)));
    return {
      playerEntityId: player?.id ?? null,
      boundHostiles,
    };
  });
  if (prebound.playerEntityId == null || prebound.boundHostiles.length < 1) {
    throw new Error('toolkit exercise requires the live player and durable Throughline hostiles');
  }

  if (collisionProof?.pass !== true || collisionProof.playerEntityId == null
      || collisionProof.anchorEntityId == null
      || !Number.isSafeInteger(collisionProof.impact?.tick)) {
    throw new Error('toolkit exercise requires the exact preceding collision receipt');
  }
  const cameraReposition = await repositionPublicForCeresToolkit(page, endTick, {
    playerEntityId: collisionProof.playerEntityId,
    anchorEntityId: collisionProof.anchorEntityId,
    anchorImpactTick: collisionProof.impact.tick,
  });
  const baseline = await waitForCeresToolkitConflictAuthority(page, prebound, endTick);
  baseline.cameraReposition = cameraReposition;
  let target = await pointPublicAtCeresHostile(page, baseline.initialHostiles, endTick);
  if (!target || !baseline.initialHostiles.some((row) => row.entityId === target.id
      && row.worldRecordId === target.worldRecordId)) {
    throw new Error('toolkit exercise could not point at a declared Throughline hostile');
  }
  await page.mouse.move(
    box.x + (target.ndcX + 1) * 0.5 * box.width,
    box.y + (1 - (target.ndcY + 1) * 0.5) * box.height,
  );

  await page.keyboard.press('Space');
  const attached = await waitForCeresBusEvent(page, {
    event: 'tether:attached',
    minTick: baseline.startTick,
    actorId: baseline.playerEntityId,
    targetId: target.id,
  });
  await waitForCeresBusEvent(page, {
    event: 'tether:latched',
    minTick: attached.tick,
    targetId: target.id,
  });
  await page.keyboard.press('Space');
  const broken = await waitForCeresBusEvent(page, {
    event: 'tether:broken',
    minTick: attached.tick,
    actorId: baseline.playerEntityId,
    targetId: target.id,
    attachmentId: attached.attachmentId,
    reason: 'tether_cut',
  });
  await waitForCeresBusEvent(page, {
    event: 'tether:cut',
    minTick: broken.tick,
    targetId: target.id,
  });
  await waitForCeresBusEvent(page, {
    event: 'tether:released',
    minTick: broken.tick,
    targetId: target.id,
  });

  await page.keyboard.press('Digit4');
  const seed = await waitForCeresBusEvent(page, {
    event: 'massSeed:deployed',
    minTick: baseline.startTick,
    ownerId: baseline.playerEntityId,
  });
  await waitForCeresBusEvent(page, {
    event: 'massSeed:locked',
    minTick: seed.tick,
    seedId: seed.seedId,
  }, 30_000);

  await page.keyboard.press('Digit6');
  await waitForCeresBusEvent(page, {
    event: 'fields:deployed',
    minTick: baseline.startTick,
    kind: 'repulsor',
    sourceOwnerId: baseline.playerEntityId,
  });

  let receipt = null;
  try {
    for (let iteration = 0; iteration < 120; iteration += 1) {
      if (await readTick(page) >= endTick - 60) break;
      target = await projectNearestCeresHostile(page, baseline.initialHostiles);
      if (!target) {
        target = await pointPublicAtCeresHostile(page, baseline.initialHostiles, endTick);
        if (!target) {
          await page.waitForTimeout(200);
          continue;
        }
      }
      await page.mouse.move(
        box.x + (target.ndcX + 1) * 0.5 * box.width,
        box.y + (1 - (target.ndcY + 1) * 0.5) * box.height,
      );
      await page.mouse.down();
      await page.waitForTimeout(300);
      await page.mouse.up();
      await page.waitForTimeout(120);
      receipt = await readCeresToolkitReceipt(page, baseline);
      const failures = [];
      validateToolkitReceiptCore(receipt, {
        startTick: baseline.startTick,
        endTick: Math.min(endTick, receipt.endTick),
      }, failures);
      if (failures.length === 0 && receipt.destroyedRecordIds.length > 0) break;
    }
  } finally {
    await releasePublicInput(page).catch(() => {});
  }
  receipt = await readCeresToolkitReceipt(page, baseline);
  const failures = [];
  validateToolkitReceiptCore(receipt, {
    startTick: baseline.startTick,
    endTick: Math.min(endTick, receipt.endTick),
  }, failures);
  if (failures.length > 0 || receipt.destroyedRecordIds.length < 1) {
    throw new Error(`public physics toolkit receipts are incomplete: ${[
      ...failures,
      ...(receipt.destroyedRecordIds.length < 1 ? ['no initial hostile reached a durable tombstone'] : []),
    ].join('; ')}`);
  }
  return receipt;
}

async function waitForCeresBusEvent(page, expected, timeout = 20_000) {
  await page.waitForFunction((criteria) => {
    const rows = window.__SF_CERES_FIVE_MINUTE_TRACE__?.events || [];
    return rows.some((row) => Object.entries(criteria).every(([key, value]) => (
      key === 'minTick' ? Number(row.tick) >= Number(value) : row[key] === value
    )));
  }, expected, { timeout });
  return page.evaluate((criteria) => {
    const rows = window.__SF_CERES_FIVE_MINUTE_TRACE__?.events || [];
    const row = rows.find((entry) => Object.entries(criteria).every(([key, value]) => (
      key === 'minTick' ? Number(entry.tick) >= Number(value) : entry[key] === value
    )));
    return row ? { ...row } : null;
  }, expected);
}

async function readCeresToolkitReceipt(page, baseline) {
  return page.evaluate((authority) => {
    const state = window.SF?.state;
    const routeTrace = window.__SF_CERES_FIVE_MINUTE_TRACE__;
    const routeEvents = routeTrace?.events || [];
    const records = state?.world?.records?.byId || {};
    const destroyedRecordIds = authority.initialHostiles.map((row) => row.worldRecordId)
      .filter((recordId) => {
        const record = records instanceof Map ? records.get(recordId) : records[recordId];
        return record?.alive === false
          && (record.outcome === 'destroyed' || record.outcome === 'defeated');
      }).sort();
    const cameraReposition = authority.cameraReposition ? (() => {
      const captureStartSeq = Number(authority.cameraReposition.impactCaptureStartSeq);
      const captureEndSeq = Number(routeTrace?.nextEventSeq) - 1;
      return {
        ...authority.cameraReposition,
        endTick: authority.startTick,
        impactCapture: {
          startTick: authority.cameraReposition.startTick,
          endTick: authority.startTick,
          startSeq: captureStartSeq,
          endSeq: captureEndSeq,
        },
        impacts: routeEvents.filter((event) => event?.event === 'physics:impact'
          && Number(event.seq) >= captureStartSeq && Number(event.seq) <= captureEndSeq
          && Number(event.tick) >= Number(authority.cameraReposition.startTick)
          && Number(event.tick) <= Number(authority.startTick)
          && (event.aId === authority.playerEntityId || event.bId === authority.playerEntityId))
          .map((event) => ({
            seq: Number(event.seq),
            event: event.event,
            tick: Number(event.tick),
            aId: event.aId,
            bId: event.bId,
          })),
      };
    })() : null;
    return {
      schema: 'spaceface.ceresFiveMinuteToolkitReceipt.v1',
      inputSource: 'public-keyboard-mouse',
      startTick: authority.startTick,
      endTick: Number(state?.tick),
      playerEntityId: authority.playerEntityId,
      initialHostiles: authority.initialHostiles,
      cameraReposition,
      events: routeEvents
        .filter((event) => Number(event.tick) >= authority.startTick)
        .map((event) => ({ ...event })),
      combatTrace: (state?.combat?.trace?.events || [])
        .filter((event) => Number(event.seq) >= authority.combatTraceStartSeq)
        .map((event) => ({ ...event })),
      destroyedRecordIds,
    };
  }, baseline);
}

async function readCeresHostilePointingSnapshot(page, boundHostiles) {
  return page.evaluate((authorityRows) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const camera = state?.render?.camera;
    if (!state || !player || !camera) {
      return { tick: Number(state?.tick), candidates: [] };
    }
    const bound = new Map((authorityRows || []).map((row) => [row.entityId, row.worldRecordId]));
    const candidates = (state.entityList || []).filter((entity) => (
      entity?.alive !== false
        && entity?.type === 'ship'
        && bound.get(entity.id) === entity.data?.worldRecordId
        && (entity.data?.ai?.zoneId === 'zone_ceres_ambush'
          && entity.data?.ai?.squadId === 'zone_ceres_ambush')
    )).map((hostile) => {
      const dx = Number(hostile.pos?.x) - Number(player.pos?.x);
      const dz = Number(hostile.pos?.z) - Number(player.pos?.z);
      const desired = Math.atan2(dz, dx);
      let headingError = desired - Number(player.rot || 0);
      while (headingError > Math.PI) headingError -= Math.PI * 2;
      while (headingError < -Math.PI) headingError += Math.PI * 2;
      const row = {
        id: hostile.id,
        worldRecordId: hostile.data?.worldRecordId || null,
        alive: hostile.alive !== false,
        distanceWU: Math.hypot(dx, dz),
        headingError,
        pointable: false,
        ndcX: null,
        ndcY: null,
      };
      const root = hostile?.view?.root || hostile?.mesh;
      if (!root?.matrixWorld?.elements
          || !camera.matrixWorldInverse?.elements || !camera.projectionMatrix?.elements) return row;
      let node = root;
      while (node) {
        if (node.visible === false) return row;
        node = node.parent || null;
      }
      const world = root.matrixWorld.elements;
      const view = camera.matrixWorldInverse.elements;
      const projection = camera.projectionMatrix.elements;
      const x = world[12]; const y = world[13]; const z = world[14];
      const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
      const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
      const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
      const vw = view[3] * x + view[7] * y + view[11] * z + view[15];
      const cx = projection[0] * vx + projection[4] * vy + projection[8] * vz + projection[12] * vw;
      const cy = projection[1] * vx + projection[5] * vy + projection[9] * vz + projection[13] * vw;
      const cw = projection[3] * vx + projection[7] * vy + projection[11] * vz + projection[15] * vw;
      if (!Number.isFinite(cw) || cw <= 0) return row;
      row.ndcX = cx / cw;
      row.ndcY = cy / cw;
      row.pointable = Number.isFinite(row.ndcX) && Number.isFinite(row.ndcY)
        && Math.abs(row.ndcX) <= 0.98 && Math.abs(row.ndcY) <= 0.98;
      return row;
    });
    return { tick: Number(state.tick), candidates };
  }, (boundHostiles || []).map((row) => ({
    entityId: row.entityId,
    worldRecordId: row.worldRecordId,
  })));
}

export function selectCeresHostilePointingStatus(snapshot) {
  const candidates = (Array.isArray(snapshot?.candidates) ? snapshot.candidates : [])
    .filter((row) => row?.id != null && String(row.worldRecordId || '')
      && Number.isFinite(Number(row.distanceWU)) && Number(row.distanceWU) >= 0
      && Number.isFinite(Number(row.headingError)))
    .sort((left, right) => Number(left.distanceWU) - Number(right.distanceWU)
      || String(left.worldRecordId).localeCompare(String(right.worldRecordId)));
  const pointable = candidates.find((row) => row.pointable === true
    && Number.isFinite(Number(row.ndcX)) && Math.abs(Number(row.ndcX)) <= 0.98
    && Number.isFinite(Number(row.ndcY)) && Math.abs(Number(row.ndcY)) <= 0.98) || null;
  return Object.freeze({
    tick: Number(snapshot?.tick),
    nearest: candidates[0] || null,
    target: pointable ? Object.freeze({
      id: pointable.id,
      worldRecordId: pointable.worldRecordId,
      alive: pointable.alive !== false,
      ndcX: Number(pointable.ndcX),
      ndcY: Number(pointable.ndcY),
    }) : null,
  });
}

async function projectNearestCeresHostile(page, boundHostiles) {
  return selectCeresHostilePointingStatus(
    await readCeresHostilePointingSnapshot(page, boundHostiles),
  ).target;
}

export async function pointPublicAtCeresHostile(page, boundHostiles, endTick, {
  maxAttempts = 40,
} = {}) {
  if (!Array.isArray(boundHostiles) || boundHostiles.length < 1
      || !Number.isSafeInteger(endTick) || !Number.isSafeInteger(maxAttempts)
      || maxAttempts < 1 || maxAttempts > 40) {
    throw new Error('public hostile pointing requires bound identities and a fixed horizon');
  }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = selectCeresHostilePointingStatus(
      await readCeresHostilePointingSnapshot(page, boundHostiles),
    );
    if (!Number.isSafeInteger(status.tick) || status.tick >= endTick - 120) {
      throw new Error('public hostile pointing exhausted the exact route horizon');
    }
    if (status.target) return status.target;
    if (!status.nearest) return null;
    await page.waitForTimeout(150);
  }
  return null;
}

async function publicSaveAndContinue({
  page,
  rootUrl,
  pageIssueTracker,
  fixedSeed,
  toolkit,
  oreCycleGateReceipt = null,
}) {
  const initialHostileWorldRecordIds = sortedStrings(
    (toolkit?.initialHostiles || []).map((row) => row?.worldRecordId),
  );
  await page.keyboard.press('F5');
  await page.waitForFunction(() => !!localStorage.getItem('sf.save.quick')
    && (window.__SF_CERES_FIVE_MINUTE_TRACE__?.events || [])
      .some((event) => event.event === 'save:completed'), null, { timeout: 30_000 });
  const persistedOreCycleSave = oreCycleGateReceipt
    ? await readPersistedCeresOreCycleSave(page, oreCycleGateReceipt)
    : null;
  if (oreCycleGateReceipt) {
    const persisted = evaluateCeresPersistedOreCycleSaveReceipt(persistedOreCycleSave, {
      gateReceipt: oreCycleGateReceipt,
    });
    if (!persisted.pass) {
      throw new Error(`CERES_ORE_CYCLE_PERSISTED_SAVE_INVALID: ${persisted.failures.join('; ')}`);
    }
  }
  const savedAtTick = persistedOreCycleSave?.savedAtTick ?? await readTick(page);
  const preReload = await readCeresRouteSnapshot(page, initialHostileWorldRecordIds);
  const traceChunk = await stopCeresRouteObserver(page);

  const navigationToken = pageIssueTracker?.beginExpectedNavigation?.('ceres-five-minute-continue') ?? null;
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  } finally {
    if (navigationToken != null) pageIssueTracker?.endExpectedNavigation?.(navigationToken);
  }
  assert.deepEqual(inspectCanonicalRootUrl(page.url(), rootUrl).failures, [],
    'Continue reload left the canonical source root');
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 60_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) await page.keyboard.press('Space');
  await waitForVisibleScreen(page, 'mainMenu', 30_000);
  await page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 20_000 });
  await waitForCeresFlight(page, fixedSeed, 180_000);
  const after = await readCeresRouteSnapshot(page, initialHostileWorldRecordIds);
  const projectActors = (rows) => rows.map((row) => ({
    slotId: row.slotId,
    worldRecordId: row.worldRecordId,
    jobId: row.jobId,
  })).sort((left, right) => left.slotId.localeCompare(right.slotId));
  const projectAnchors = (rows) => rows.map((row) => ({
    slotId: row.slotId,
    entityId: row.entityId,
    collides: row.collides,
  })).sort((left, right) => left.slotId.localeCompare(right.slotId));
  const projectObjects = (rows) => rows.map((row) => ({
    slotId: row.slotId,
    entityId: row.entityId,
    worldRecordId: row.worldRecordId || null,
  })).sort((left, right) => left.slotId.localeCompare(right.slotId));
  const beforeActorRecords = projectActors(preReload.census.actors);
  const afterActorRecords = projectActors(after.census.actors);
  const objectRecordsBefore = projectObjects(preReload.census.objectEntities);
  const objectRecordsAfter = projectObjects(after.census.objectEntities);
  const objectSlotIdsBefore = objectRecordsBefore.map((row) => row.slotId);
  const objectSlotIdsAfter = objectRecordsAfter.map((row) => row.slotId);
  const collisionAnchorsBefore = projectAnchors(preReload.census.anchors);
  const collisionAnchorsAfter = projectAnchors(after.census.anchors);
  const hostileTombstonesBefore = [...preReload.census.hostileTombstones].sort();
  const hostileTombstonesAfter = [...after.census.hostileTombstones].sort();
  const liveHostileWorldRecordIdsAfter = after.census.hostiles
    .map((row) => row.worldRecordId).filter(Boolean).sort();
  const expectedTombstones = sortedStrings(toolkit?.destroyedRecordIds);
  const expectedLiveHostileWorldRecordIdsAfter = initialHostileWorldRecordIds
    .filter((recordId) => !expectedTombstones.includes(recordId));
  const replacementWorldRecordIds = liveHostileWorldRecordIdsAfter
    .filter((recordId) => !expectedLiveHostileWorldRecordIdsAfter.includes(recordId));
  const missingWorldRecordIds = expectedLiveHostileWorldRecordIdsAfter
    .filter((recordId) => !liveHostileWorldRecordIdsAfter.includes(recordId));
  const actorWorldRecordIds = new Set(beforeActorRecords.map((row) => row.worldRecordId));
  const actorHostileIdentityOverlap = initialHostileWorldRecordIds
    .filter((recordId) => actorWorldRecordIds.has(recordId));
  const replacementSpawnCount = replacementWorldRecordIds.length;
  return {
    pass: stableJson(beforeActorRecords) === stableJson(afterActorRecords)
      && stableJson(objectRecordsBefore) === stableJson(objectRecordsAfter)
      && stableJson(collisionAnchorsBefore) === stableJson(collisionAnchorsAfter)
      && hostileTombstonesBefore.length > 0
      && stableJson(hostileTombstonesBefore) === stableJson(hostileTombstonesAfter)
      && expectedTombstones.length > 0
      && expectedTombstones.every((recordId) => hostileTombstonesAfter.includes(recordId))
      && initialHostileWorldRecordIds.length > expectedTombstones.length
      && stableJson(liveHostileWorldRecordIdsAfter)
        === stableJson(expectedLiveHostileWorldRecordIdsAfter)
      && missingWorldRecordIds.length === 0
      && actorHostileIdentityOverlap.length === 0
      && replacementSpawnCount === 0
      && after.tick >= savedAtTick && after.seed === fixedSeed,
    source: 'public-save-continue',
    publicPath: ['F5', 'reload', 'main_menu', 'continue'],
    savedAtTick,
    loadedAtTick: after.tick,
    preReload,
    after,
    actorRecordsBefore: beforeActorRecords,
    actorRecordsAfter: afterActorRecords,
    objectRecordsBefore,
    objectRecordsAfter,
    objectSlotIdsBefore,
    objectSlotIdsAfter,
    collisionAnchorsBefore,
    collisionAnchorsAfter,
    hostileTombstonesBefore,
    hostileTombstonesAfter,
    initialHostileWorldRecordIds,
    destroyedHostileWorldRecordIds: expectedTombstones,
    expectedLiveHostileWorldRecordIdsAfter,
    liveHostileWorldRecordIdsAfter,
    replacementWorldRecordIds,
    missingWorldRecordIds,
    actorHostileIdentityOverlap,
    replacementSpawnCount,
    seedBefore: preReload.seed,
    seedAfter: after.seed,
    persistedOreCycleSave,
    traceChunk,
  };
}

async function applyPublicReducedAccessibility(page, screenshot) {
  if (typeof screenshot !== 'function') throw new TypeError('matched accessibility capture requires screenshots');
  const defaultArtifactName = '20-accessibility-default.png';
  const reducedArtifactName = '21-reduced-motion-flash.png';
  await page.keyboard.press('Escape');
  await waitForVisibleScreen(page, 'pause', 20_000);
  const before = await readAccessibilitySnapshot(page);
  await screenshot(defaultArtifactName, { flightSurfaceOnly: true });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await waitForVisibleScreen(page, 'settings', 20_000);
  await page.getByRole('button', { name: 'Access', exact: true }).click();
  await page.getByLabel('Motion effects', { exact: true }).selectOption('reduce');
  const flashing = page.getByLabel('Reduce flashing', { exact: true });
  if (!await flashing.isChecked()) await flashing.check();
  await page.waitForFunction(() => {
    const settings = window.SF?.state?.settings;
    return settings?.accessibility?.motionPreference === 'reduce'
      && settings?.accessibility?.flashReduce === true
      && settings?.video?.motionReduce === true;
  }, null, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await waitForVisibleScreen(page, 'pause', 20_000);
  const reduced = await readAccessibilitySnapshot(page);
  await screenshot(reducedArtifactName, { flightSurfaceOnly: true });
  const matchedCheckpoint = createAccessibilityMatchedCheckpoint(
    before,
    defaultArtifactName,
    reducedArtifactName,
  );
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const postToggleInputReceipt = await provePublicFlightInput(page);
  await page.waitForFunction((tick) => Number(window.SF?.state?.tick) >= tick + 6,
    postToggleInputReceipt.neutralTick, { timeout: 30_000 });
  const postToggleCompleteFrameTick = await readTick(page);
  return {
    pass: reduced.motionReduce && reduced.flashReduce,
    source: 'public-settings-ui',
    before,
    reduced,
    matchedCheckpoint,
    postToggleInputReceipt,
    postToggleCompleteFrameTick,
  };
}

async function readAccessibilitySnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const entities = (state?.entityList || []).filter((entity) => entity?.alive !== false);
    const actorSlotIds = entities.filter((entity) => entity.data?.activityActorSlotId)
      .map((entity) => entity.data.activityActorSlotId).sort();
    const objectSlotIds = entities.filter((entity) => entity.data?.activityObjectSlotId)
      .map((entity) => entity.data.activityObjectSlotId).sort();
    const collisionAnchorSlotIds = entities
      .filter((entity) => entity.data?.activityCollisionAnchorSlotId)
      .map((entity) => entity.data.activityCollisionAnchorSlotId).sort();
    const player = state?.entities?.get(state.playerId);
    const activityIdentities = entities.flatMap((entity) => {
      const data = entity.data || {};
      const slotId = data.activityActorSlotId
        || data.activityObjectSlotId
        || data.activityCollisionAnchorSlotId;
      if (!slotId) return [];
      return [{ slotId, entityId: entity.id }];
    }).sort((left, right) => left.slotId.localeCompare(right.slotId));
    const hostileWorldRecordIds = entities.filter((entity) => (
      entity.type === 'ship' && String(entity.data?.worldRecordId || '')
      && entity.data?.ai?.zoneId === 'zone_ceres_ambush'
        && entity.data?.ai?.squadId === 'zone_ceres_ambush'
    )).map((entity) => entity.data?.worldRecordId).filter(Boolean).sort();
    return {
      tick: Number(state?.tick),
      motionReduce: state?.settings?.video?.motionReduce === true,
      motionPreference: state?.settings?.accessibility?.motionPreference || null,
      flashReduce: state?.settings?.accessibility?.flashReduce === true,
      actorSlotIds,
      objectSlotIds,
      collisionAnchorSlotIds,
      playerEntityId: player?.id ?? null,
      playerPos: { x: Number(player?.pos?.x), z: Number(player?.pos?.z) },
      playerVel: { x: Number(player?.vel?.x), z: Number(player?.vel?.z) },
      playerRot: Number(player?.rot),
      cameraZoomWU: Number(state?.camera?.zoom),
      activityIdentities,
      hostileWorldRecordIds,
      playerAlive: !!player && player.alive !== false && Number(player.hull) > 0,
    };
  });
}

export function accessibilityCheckpointIdentity(snapshot) {
  return {
    playerEntityId: snapshot?.playerEntityId ?? null,
    playerPos: snapshot?.playerPos || null,
    playerVel: snapshot?.playerVel || null,
    playerRot: snapshot?.playerRot ?? null,
    cameraZoomWU: snapshot?.cameraZoomWU ?? null,
    actorSlotIds: sortedStrings(snapshot?.actorSlotIds),
    objectSlotIds: sortedStrings(snapshot?.objectSlotIds),
    collisionAnchorSlotIds: sortedStrings(snapshot?.collisionAnchorSlotIds),
    activityIdentities: Array.isArray(snapshot?.activityIdentities)
      ? [...snapshot.activityIdentities].sort((left, right) => String(left?.slotId).localeCompare(String(right?.slotId)))
      : [],
    hostileWorldRecordIds: sortedStrings(snapshot?.hostileWorldRecordIds),
  };
}

export function createAccessibilityMatchedCheckpoint(
  snapshot,
  defaultArtifactName = '20-accessibility-default.png',
  reducedArtifactName = '21-reduced-motion-flash.png',
) {
  return {
    defaultArtifactName,
    reducedArtifactName,
    captureMethod: 'public-pause-flight-surface-v1',
    tick: snapshot?.tick ?? null,
    identity: accessibilityCheckpointIdentity(snapshot),
  };
}

async function readCeresRouteSnapshot(page, expectedHostileWorldRecordIds = []) {
  return page.evaluate((expectedHostileIds) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const active = state?.player?.ownedShips?.[state.player.activeShipIndex] || null;
    const entities = (state?.entityList || []).filter((entity) => entity?.alive !== false);
    const actors = entities.filter((entity) => entity.data?.activityActorSlotId).map((entity) => ({
      slotId: entity.data.activityActorSlotId,
      entityId: entity.id,
      worldRecordId: entity.data.worldRecordId || null,
      jobId: entity.data.jobId || null,
      ceresActivityAmbushPhase: entity.data?.ai?.ceresActivityAmbushPhase || null,
      team: entity.team ?? entity.data?.team ?? null,
      factionId: entity.factionId || entity.data?.factionId || null,
      lawful: entity.data?.ai?.lawful === true,
      passive: entity.data?.ai?.passive === true,
      roe: entity.data?.ai?.roe || null,
      serviceHookId: entity.data?.worldSiteTrafficHookId || null,
      ceresActivityJobOwned: entity.data?.ceresActivityJobOwned ?? null,
      x: Number(entity.pos?.x),
      z: Number(entity.pos?.z),
    })).sort((left, right) => left.slotId.localeCompare(right.slotId));
    const objectEntities = entities.filter((entity) => entity.data?.activityObjectSlotId)
      .map((entity) => ({
        slotId: entity.data.activityObjectSlotId,
        entityId: entity.id,
        worldRecordId: entity.data.worldRecordId || null,
      })).sort((left, right) => left.slotId.localeCompare(right.slotId));
    const objects = objectEntities.map((row) => row.slotId);
    const anchors = entities.filter((entity) => entity.data?.activityCollisionAnchorSlotId).map((entity) => ({
      slotId: entity.data.activityCollisionAnchorSlotId,
      entityId: entity.id,
      collides: entity.collides !== false && Number(entity.mass) > 0,
    })).sort((left, right) => left.slotId.localeCompare(right.slotId));
    const hostiles = entities.filter((entity) => (
      entity.type === 'ship' && String(entity.data?.worldRecordId || '')
      && entity.data?.ai?.zoneId === 'zone_ceres_ambush'
      && entity.data?.ai?.squadId === 'zone_ceres_ambush'
    )).map((entity) => ({
      entityId: entity.id,
      worldRecordId: entity.data?.worldRecordId || null,
      ceresActivityAmbushPhase: entity.data?.ai?.ceresActivityAmbushPhase || null,
      team: entity.team ?? null,
      factionId: entity.factionId || entity.data?.factionId || null,
      lawful: entity.data?.ai?.lawful === true,
      passive: entity.data?.ai?.passive === true,
      roe: entity.data?.ai?.roe || null,
      spawnContext: entity.data?.ai?.spawnContext || null,
      zoneId: entity.data?.ai?.zoneId || null,
      squadId: entity.data?.ai?.squadId || null,
    }));
    const recordBag = state?.world?.records || state?.world?.entityRecords || state?.worldRecords || {};
    const records = recordBag?.byId && typeof recordBag.byId === 'object'
      ? recordBag.byId
      : recordBag;
    const recordValues = records instanceof Map ? [...records.values()] : Object.values(records || {});
    const expectedHostileIdSet = new Set((expectedHostileIds || []).filter((recordId) => (
      typeof recordId === 'string' && recordId.length > 0
    )));
    const hostileTombstones = recordValues.filter((record) => {
      if (!record || record.alive !== false
          || (record.outcome !== 'destroyed' && record.outcome !== 'defeated')) return false;
      const recordId = record.recordId || record.id || record.worldRecordId;
      return expectedHostileIdSet.size > 0
        ? expectedHostileIdSet.has(recordId)
        : (record.ai?.zoneId === 'zone_ceres_ambush'
          && record.ai?.squadId === 'zone_ceres_ambush');
    }).map((record) => record.recordId || record.id || record.worldRecordId).sort();
    return {
      mode: state?.mode || null,
      tick: Number(state?.tick),
      simTime: Number(state?.simTime),
      timeScale: Number(state?.timeScale),
      seed: state?.meta?.seed ?? null,
      tutorialHints: state?.settings?.gameplay?.tutorialHints ?? null,
      onboarding: state?.onboarding ? {
        active: state.onboarding.active === true,
        finished: state.onboarding.finished === true,
        currentBeat: Number.isSafeInteger(Number(state.onboarding.currentBeat))
          ? Number(state.onboarding.currentBeat)
          : null,
      } : null,
      sectorId: state?.world?.currentSectorId || null,
      currentZone: state?.world?.currentZone ? {
        id: state.world.currentZone.id || null,
        name: state.world.currentZone.name || null,
      } : null,
      playerId: state?.playerId ?? null,
      player: player ? {
        alive: player.alive !== false && Number(player.hull) > 0,
        hull: Number(player.hull),
        x: Number(player.pos?.x),
        z: Number(player.pos?.z),
        vx: Number(player.vel?.x),
        vz: Number(player.vel?.z),
      } : null,
      activeShipDefId: active?.defId || null,
      fittedItemIds: Array.isArray(active?.fittings) ? active.fittings.slice().sort() : [],
      cameraZoomWU: Number(state?.camera?.zoom),
      census: { actors, objects, objectEntities, anchors, hostiles, hostileTombstones },
    };
  }, expectedHostileWorldRecordIds);
}

function assertCeresSetup(snapshot, fixedSeed) {
  assert.equal(snapshot.mode, 'flight');
  assert.equal(snapshot.seed, fixedSeed);
  assert.equal(snapshot.sectorId, 'sector_ceres_belt');
  assert.equal(snapshot.player?.alive, true);
  assert.equal(snapshot.activeShipDefId, 'ship_hornet');
  for (const itemId of [
    'wpn_concussion_cannon_m',
    'wpn_gravity_marker_s',
    'wpn_momentum_sink_s',
  ]) assert.ok(snapshot.fittedItemIds.includes(itemId), `Hornet is missing ${itemId}`);
  assert.equal(snapshot.cameraZoomWU, 144);
  assert.equal(snapshot.timeScale, 1);
  assert.equal(snapshot.tutorialHints, false,
    'Ceres acceptance must disable the first-session tutorial through public Settings');
  assert.equal(snapshot.onboarding?.active === true && snapshot.onboarding?.finished !== true, false,
    'Ceres acceptance cannot start while onboarding blocks the encounter director');
  assert.equal(snapshot.publicTutorialSettings?.pass, true);
  assert.equal(snapshot.publicTutorialSettings?.source, 'public-settings-ui');
  assert.equal(typeof snapshot.publicTutorialSettings?.changed, 'boolean');
  assert.equal(snapshot.publicTutorialSettings?.tutorialHints, false);
  assert.deepEqual(snapshot.publicTutorialSettings?.publicPath,
    ['Main Menu', 'Settings', 'Gameplay', 'Tutorial hints: Off', 'Back']);
  assert.deepEqual(snapshot.census.actors.map((row) => row.slotId).sort(),
    [...CERES_FIVE_MINUTE_ACTOR_SLOT_IDS].sort());
  assert.equal(ceresLawfulServiceClassificationPass(snapshot.census.actors), true,
    'Ceres entry lacks truthful lawful/service actor classification');
  assert.deepEqual(snapshot.census.objects, [...CERES_FIVE_MINUTE_OBJECT_SLOT_IDS].sort());
  assert.deepEqual(snapshot.census.anchors.map((row) => row.slotId),
    [...CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS].sort());
  assert.equal(snapshot.census.anchors.every((row) => row.collides), true);
}

export function normalizeCeresTrace(chunks, bounds) {
  const rows = chunks.flatMap((chunk, observerChunkIndex) => (
    (chunk?.samples || []).map((row, observerSourceIndex) => ({
      ...row,
      observerChunk: chunk?.observerChunk ?? row?.observerChunk ?? null,
      observerChunkIndex,
      observerSourceIndex,
    }))
  )).sort((left, right) => Number(left.observedTick) - Number(right.observedTick)
    || left.observerChunkIndex - right.observerChunkIndex
    || left.observerSourceIndex - right.observerSourceIndex);
  const byObservedTick = new Map();
  for (const row of rows) byObservedTick.set(Number(row.observedTick), row);
  const rawSamples = [...byObservedTick.values()].sort((left, right) => left.observedTick - right.observedTick);
  const oreCycleSampleMap = new Map();
  for (const row of rows) {
    const tick = Number(row.observedTick);
    if (tick < bounds.startTick || tick > bounds.endTick) continue;
    oreCycleSampleMap.set(`${row.observerChunkIndex}:${tick}`, {
      ...row,
      tick,
      observedSimTimeS: Number(row.simTimeS),
      clippedFromObservedTick: null,
    });
  }
  const oreCycleSamples = [...oreCycleSampleMap.values()].sort((left, right) => (
    left.observerChunkIndex - right.observerChunkIndex
      || left.observedTick - right.observedTick
  ));
  const exactStart = rawSamples.find((row) => row.observedTick === bounds.startTick);
  const exactEnd = rawSamples.find((row) => row.observedTick === bounds.endTick);
  const beforeOrAt = rawSamples.filter((row) => row.observedTick <= bounds.endTick);
  const afterOrAt = rawSamples.find((row) => row.observedTick >= bounds.endTick);
  if (!exactStart) throw new Error('Ceres trace missed the exact live start sample');
  if (!afterOrAt) throw new Error('Ceres trace never observed the live state at/after the exact end tick');
  const exact = rawSamples.filter((row) => (
    row.observedTick >= bounds.startTick && row.observedTick < bounds.endTick
  ));
  const terminalSource = exactEnd || beforeOrAt.at(-1);
  if (!terminalSource) throw new Error('Ceres trace has no in-horizon terminal state');
  exact.push(terminalSource);
  const projected = exact.map((row, index) => {
    const clipped = index === exact.length - 1 && row.observedTick !== bounds.endTick;
    return {
      ...row,
      tick: clipped ? bounds.endTick : row.observedTick,
      observedSimTimeS: Number(row.simTimeS),
      simTimeS: clipped
        ? Number(exactStart.simTimeS) + CERES_FIVE_MINUTE_SIMULATION_SECONDS
        : Number(row.simTimeS),
      // A render frame can bracket the exact fixed-tick endpoint without sampling it. In that
      // case carry the last in-horizon state forward conservatively; never borrow post-horizon
      // visibility/pose merely because the next rAF observed it.
      clippedFromObservedTick: clipped ? row.observedTick : null,
    };
  });
  const deduped = [];
  for (const row of projected) {
    if (deduped.at(-1)?.tick === row.tick) deduped[deduped.length - 1] = row;
    else deduped.push(row);
  }
  return {
    schema: 'spaceface.ceresFiveMinuteFrameTrace.v1',
    bounds,
    samples: deduped,
    oreCycleSamples,
    rawSampleCount: rawSamples.length,
    events: chunks.flatMap((chunk, observerChunkIndex) => (
      (chunk?.events || []).map((event, observerSourceIndex) => ({
        ...event,
        observerChunk: chunk?.observerChunk ?? event?.observerChunk ?? null,
        observerChunkIndex,
        observerSourceIndex,
      }))
    )).sort((left, right) => left.observerChunkIndex - right.observerChunkIndex
      || Number(left.tick) - Number(right.tick)
      || left.observerSourceIndex - right.observerSourceIndex),
    failures: chunks.flatMap((chunk) => chunk?.failures || []),
    bracket: {
      before: beforeOrAt.at(-1)?.observedTick ?? null,
      after: afterOrAt?.observedTick ?? null,
      exactStart: exactStart.observedTick,
      exactEnd: exactEnd?.observedTick ?? null,
      endWasClipped: !exactEnd,
    },
  };
}

function summarizeCeresRouteObservations({
  trace,
  setup,
  finalSnapshot,
  continueProof,
  accessibility,
  toolkit,
  collisionProof,
  pocketArrivals,
}) {
  const visibilitySamples = trace.samples.map((row) => ({
    tick: row.tick,
    visibleActivityCount: row.visibleActivityCount,
    nearestPocketId: row.visibleActivityCount > 0 ? row.nearestPocketId : null,
  }));
  const intervals = deriveZeroVisibleActivityIntervals(visibilitySamples, trace.bounds);
  if (!intervals.length) throw new Error('Ceres route produced no closed adjacent-pocket activity gap');
  const projection = canonicalGapProjection(intervals[0]);
  const recordedMetric = { ...projection, metricDigest: gapMetricDigest(projection) };
  const bucketTicks = CERES_FIVE_MINUTE_TICK_RATE_HZ * 60;
  const movingJobBuckets = [];
  for (let bucket = 0; bucket < 5; bucket += 1) {
    const startTick = trace.bounds.startTick + bucket * bucketTicks;
    const endTick = startTick + bucketTicks;
    const rows = trace.samples.filter((row) => row.tick >= startTick
      && (bucket === 4 ? row.tick <= endTick : row.tick < endTick));
    const tracks = new Map();
    for (const row of rows) {
      for (const actor of row.actorStates || []) {
        if (!actor?.jobId || !Number.isFinite(actor.x) || !Number.isFinite(actor.z)) continue;
        const track = tracks.get(actor.jobId) || {
          jobId: actor.jobId,
          slotId: actor.slotId,
          start: { tick: row.tick, x: actor.x, z: actor.z },
          end: { tick: row.tick, x: actor.x, z: actor.z },
          maxDisplacement: 0,
        };
        track.end = { tick: row.tick, x: actor.x, z: actor.z };
        track.maxDisplacement = Math.max(track.maxDisplacement, Math.hypot(
          actor.x - track.start.x,
          actor.z - track.start.z,
        ));
        tracks.set(actor.jobId, track);
      }
    }
    const movingTracks = [...tracks.values()].filter((track) => track.maxDisplacement > EPSILON)
      .sort((left, right) => left.jobId.localeCompare(right.jobId));
    movingJobBuckets.push({
      bucket,
      startTick,
      endTick,
      movingJobIds: movingTracks.map((track) => track.jobId),
      tracks: movingTracks.map(({ jobId, slotId, start, end }) => ({ jobId, slotId, start, end })),
    });
  }
  const anchorBySlot = new Map(setup.census.anchors.map((row) => [row.slotId, row.entityId]));
  const targetAnchorId = anchorBySlot.get('ceres_throughline_collision_anchor');
  const anchorImpacts = trace.events.filter((event) => event.event === 'physics:impact'
    && (event.aId === targetAnchorId || event.bId === targetAnchorId)
    && (event.aId === setup.playerId || event.bId === setup.playerId));
  const ambushEvents = trace.events.filter((event) => (
    ['encounter:telegraph', 'encounter:spawned'].includes(event.event)
      && event.encounterId === 'ceres:activity:throughline-ambush'
  ));
  const pocketSequence = [];
  for (const arrival of pocketArrivals || []) {
    const pocketId = arrival?.pocketId;
    if (POCKET_ID_SET.has(pocketId) && !pocketSequence.includes(pocketId)) pocketSequence.push(pocketId);
    if (pocketSequence.length === CERES_FIVE_MINUTE_POCKET_IDS.length) break;
  }
  const completeFrames = trace.failures.length === 0
    && trace.samples[0]?.tick === trace.bounds.startTick
    && trace.samples.at(-1)?.tick === trace.bounds.endTick
    && trace.samples.every((row) => (
    stableJson(row.actorSlotIds) === stableJson([...CERES_FIVE_MINUTE_ACTOR_SLOT_IDS].sort())
      && stableJson(row.objectSlotIds) === stableJson([...CERES_FIVE_MINUTE_OBJECT_SLOT_IDS].sort())
      && stableJson(row.collisionAnchorSlotIds)
        === stableJson([...CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS].sort())
  ));
  const activityFrames = trace.samples.map(projectCeresActivityFrame);
  const oreCycleFrames = (trace.oreCycleSamples || trace.samples).map(projectCeresActivityFrame);
  const oreCycleEvents = normalizeCeresOreCycleEvents(trace.events);
  const ambushCrossing = deriveAmbushCrossingReceipt(trace);
  const setupAnchors = setup.census.anchors.map((row) => ({
    slotId: row.slotId,
    entityId: row.entityId,
    collides: row.collides,
  }));
  const finalAnchors = finalSnapshot.census.anchors.map((row) => ({
    slotId: row.slotId,
    entityId: row.entityId,
    collides: row.collides,
  }));
  const continueProjection = continueProof ? {
    pass: continueProof.pass,
    source: continueProof.source,
    publicPath: continueProof.publicPath,
    savedAtTick: continueProof.savedAtTick,
    loadedAtTick: continueProof.loadedAtTick,
    actorRecordsBefore: continueProof.actorRecordsBefore,
    actorRecordsAfter: continueProof.actorRecordsAfter,
    objectRecordsBefore: continueProof.objectRecordsBefore,
    objectRecordsAfter: continueProof.objectRecordsAfter,
    objectSlotIdsBefore: continueProof.objectSlotIdsBefore,
    objectSlotIdsAfter: continueProof.objectSlotIdsAfter,
    collisionAnchorsBefore: continueProof.collisionAnchorsBefore,
    collisionAnchorsAfter: continueProof.collisionAnchorsAfter,
    hostileTombstonesBefore: continueProof.hostileTombstonesBefore,
    hostileTombstonesAfter: continueProof.hostileTombstonesAfter,
    initialHostileWorldRecordIds: continueProof.initialHostileWorldRecordIds,
    destroyedHostileWorldRecordIds: continueProof.destroyedHostileWorldRecordIds,
    expectedLiveHostileWorldRecordIdsAfter: continueProof.expectedLiveHostileWorldRecordIdsAfter,
    liveHostileWorldRecordIdsAfter: continueProof.liveHostileWorldRecordIdsAfter,
    replacementWorldRecordIds: continueProof.replacementWorldRecordIds,
    missingWorldRecordIds: continueProof.missingWorldRecordIds,
    actorHostileIdentityOverlap: continueProof.actorHostileIdentityOverlap,
    replacementSpawnCount: continueProof.replacementSpawnCount,
    seedBefore: continueProof.seedBefore,
    seedAfter: continueProof.seedAfter,
    oreCycleSaveGate: continueProof.oreCycleSaveGate || null,
    persistedOreCycleSave: continueProof.persistedOreCycleSave || null,
  } : null;
  const toolkitProjection = toolkit ? { ...toolkit } : null;
  return {
    schema: 'spaceface.ceresFiveMinuteObservation.v1',
    visibilitySemantics: CERES_FIVE_MINUTE_VISIBILITY_SEMANTICS,
    bounds: trace.bounds,
    visibilitySamples,
    recordedMetric,
    frames: activityFrames,
    oreCycleFrames,
    oreCycleEvents,
    traceFailures: trace.failures,
    traceBracket: trace.bracket,
    arrivals: pocketArrivals,
    pocketSequence,
    completeActivityFrameSequence: completeFrames,
    movingJobBuckets,
    anchorCollision: {
      pass: anchorImpacts.length > 0 && collisionProof?.pass === true,
      impacts: anchorImpacts,
      slotId: 'ceres_throughline_collision_anchor',
      anchorEntityId: targetAnchorId ?? null,
      playerEntityId: setup.playerId,
      collides: setupAnchors.find((row) => row.slotId === 'ceres_throughline_collision_anchor')?.collides === true,
      setupAnchors,
      finalAnchors,
    },
    throughlineAmbush: {
      pass: ambushEvents.some((event) => event.event === 'encounter:telegraph')
        && ambushEvents.some((event) => event.event === 'encounter:spawned')
        && ((toolkit?.initialHostiles?.length || 0) > 0
          || finalSnapshot.census.hostiles.length > 0),
      encounterId: 'ceres:activity:throughline-ambush',
      events: ambushEvents,
      hostileIds: finalSnapshot.census.hostiles.map((row) => row.entityId),
      hostileWorldRecordIds: [...new Set([
        ...(toolkit?.initialHostiles || []).map((row) => row.worldRecordId).filter(Boolean),
        ...finalSnapshot.census.hostiles.map((row) => row.worldRecordId).filter(Boolean),
      ])].sort(),
      hostiles: toolkit?.initialHostiles || [],
      liveHostiles: finalSnapshot.census.hostiles,
      sweep: ambushCrossing,
      injected: false,
    },
    continueProof: continueProjection,
    accessibility,
    toolkit: toolkitProjection,
    hostileTombstones: finalSnapshot.census.hostileTombstones,
  };
}

function deriveAmbushCrossingReceipt(trace) {
  const telegraph = trace.events.find((event) => (
    event.event === 'encounter:telegraph'
      && event.encounterId === 'ceres:activity:throughline-ambush'
  ));
  if (!telegraph || !Number.isSafeInteger(telegraph.tick)) return null;
  const ordered = trace.samples.filter((row) => (
    Number.isFinite(row.playerPos?.x) && Number.isFinite(row.playerPos?.z)
  ));
  let beforeIndex = -1;
  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    if (row.tick < telegraph.tick && ceresAmbushRangeBand(row.playerPos) === 'outer') {
      beforeIndex = index;
    }
  }
  let afterIndex = -1;
  for (let index = beforeIndex + 1; index < ordered.length; index += 1) {
    const row = ordered[index];
    if (row.tick > telegraph.tick && ceresAmbushRangeBand(row.playerPos) === 'outer') {
      afterIndex = index;
      break;
    }
  }
  if (beforeIndex < 0 || afterIndex <= beforeIndex) return null;
  const pathRows = ordered.slice(beforeIndex, afterIndex + 1);
  const path = pathRows.map((row) => ({
    tick: row.tick,
    pos: { x: row.playerPos.x, z: row.playerPos.z },
  }));
  const segmentCrossesZone = path.some((row) => (
    Math.hypot(
      row.pos.x - CERES_AMBUSH_ANCHOR_GLOBAL.x,
      row.pos.z - CERES_AMBUSH_ANCHOR_GLOBAL.z,
    ) <= CERES_AMBUSH_OUTER_RADIUS_WU
  )) || path.some((row, index) => index > 0 && segmentCrossesCircle(
    path[index - 1].pos,
    row.pos,
    CERES_AMBUSH_ANCHOR_GLOBAL,
    CERES_AMBUSH_OUTER_RADIUS_WU,
  ));
  const before = path[0];
  const after = path.at(-1);
  return {
    before,
    after,
    path,
    zone: {
      center: { ...CERES_AMBUSH_ANCHOR_GLOBAL },
      radiusWU: CERES_AMBUSH_OUTER_RADIUS_WU,
    },
    bothEndpointsOutside: true,
    segmentCrossesZone,
    telegraphTick: telegraph.tick,
  };
}

function segmentCrossesCeresAmbushBand(previous, current) {
  const previousBand = ceresAmbushRangeBand(previous);
  const currentBand = ceresAmbushRangeBand(current);
  return previousBand !== currentBand
    || segmentCrossesCircle(
      previous,
      current,
      CERES_AMBUSH_ANCHOR_GLOBAL,
      CERES_AMBUSH_INNER_RADIUS_WU,
    )
    || segmentCrossesCircle(
      previous,
      current,
      CERES_AMBUSH_ANCHOR_GLOBAL,
      CERES_AMBUSH_OUTER_RADIUS_WU,
    );
}

function ceresAmbushRangeBand(position) {
  const distance = Math.hypot(
    position.x - CERES_AMBUSH_ANCHOR_GLOBAL.x,
    position.z - CERES_AMBUSH_ANCHOR_GLOBAL.z,
  );
  if (distance <= CERES_AMBUSH_INNER_RADIUS_WU) return 'inner';
  if (distance <= CERES_AMBUSH_OUTER_RADIUS_WU) return 'band';
  return 'outer';
}

function segmentCrossesCircle(previous, current, center, radius) {
  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  const lengthSquared = dx * dx + dz * dz;
  if (!(lengthSquared > 0)) return false;
  const projection = Math.max(0, Math.min(1, (
    (center.x - previous.x) * dx + (center.z - previous.z) * dz
  ) / lengthSquared));
  const closestX = previous.x + projection * dx;
  const closestZ = previous.z + projection * dz;
  return (closestX - center.x) ** 2 + (closestZ - center.z) ** 2 <= radius ** 2;
}

async function waitForCeresFlight(page, fixedSeed, timeout) {
  try {
    await page.waitForFunction((seed) => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      const active = state?.player?.ownedShips?.[state.player.activeShipIndex];
      return state?.mode === 'flight'
        && state.world?.currentSectorId === 'sector_ceres_belt'
        && state.meta?.seed === seed
        && active?.defId === 'ship_hornet'
        && player && player.alive !== false && Number(player.hull) > 0
        && !document.body.classList.contains('ui-modal-open');
    }, fixedSeed, { timeout });
  } catch (error) {
    error.ceresFlightEntryDiagnostic = await page.evaluate((seed) => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state?.playerId) || null;
      const activeShipIndex = state?.player?.activeShipIndex;
      const active = state?.player?.ownedShips?.[activeShipIndex] || null;
      const visibleScreens = [...document.querySelectorAll('[data-screen]')]
        .filter((element) => {
          if (element.hidden) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden'
            && Number(style.opacity || 1) > 0.01 && rect.width > 20 && rect.height > 10;
        })
        .map((element) => element.getAttribute('data-screen'))
        .filter(Boolean)
        .sort();
      const actual = {
        documentReadyState: document.readyState,
        href: location.href,
        stateReady: !!state,
        mode: state?.mode ?? null,
        sectorId: state?.world?.currentSectorId ?? null,
        seed: state?.meta?.seed ?? null,
        playerId: state?.playerId ?? null,
        playerFound: !!player,
        playerAlive: player ? player.alive !== false : null,
        playerHull: player ? Number(player.hull) : null,
        activeShipIndex: Number.isSafeInteger(activeShipIndex) ? activeShipIndex : null,
        activeShipDefId: active?.defId ?? null,
        ownedShipDefIds: Array.isArray(state?.player?.ownedShips)
          ? state.player.ownedShips.map((ship) => ship?.defId ?? null)
          : [],
        modalOpen: document.body.classList.contains('ui-modal-open'),
        bodyClasses: [...document.body.classList].sort(),
        visibleScreens,
      };
      return {
        expected: {
          mode: 'flight',
          sectorId: 'sector_ceres_belt',
          seed,
          activeShipDefId: 'ship_hornet',
          playerAlive: true,
          playerHullPositive: true,
          modalOpen: false,
        },
        actual,
        clauses: {
          mode: actual.mode === 'flight',
          sectorId: actual.sectorId === 'sector_ceres_belt',
          seed: actual.seed === seed,
          activeShipDefId: actual.activeShipDefId === 'ship_hornet',
          playerAlive: actual.playerFound && actual.playerAlive === true,
          playerHullPositive: Number.isFinite(actual.playerHull) && actual.playerHull > 0,
          modalClosed: actual.modalOpen === false,
        },
      };
    }, fixedSeed).catch((diagnosticError) => ({
      diagnosticError: diagnosticError?.message || String(diagnosticError),
    }));
    throw error;
  }
}

async function waitForVisibleScreen(page, id, timeout) {
  await page.waitForFunction((screenId) => {
    const element = document.querySelector(`[data-screen="${screenId}"]`);
    if (!element || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0.01 && rect.width > 20 && rect.height > 10;
  }, id, { timeout });
}

async function readInputSnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return {
      tick: Number(state?.tick),
      moveZ: Number(state?.input?.moveZ || 0),
      speed: Math.hypot(Number(player?.vel?.x || 0), Number(player?.vel?.z || 0)),
      pos: { x: Number(player?.pos?.x), z: Number(player?.pos?.z) },
    };
  });
}

async function readTick(page) {
  return page.evaluate(() => Number(window.SF?.state?.tick));
}

async function releasePublicInput(page) {
  if (!page || page.isClosed()) return;
  await page.mouse.up().catch(() => {});
  for (const key of ['KeyW', 'KeyA', 'KeyD', 'KeyS', 'Digit0', 'Shift', 'Space']) {
    await page.keyboard.up(key).catch(() => {});
  }
}

async function launchCeresBrowserRuntime({ root, executablePath, resources }) {
  const ownedServer = await acquireVisualProbeServer({ root });
  resources.server = ownedServer;
  resources.rootUrl = ownedServer.baseUrl;
  const { chromium } = await loadPlaywright();
  resources.browserServer = await chromium.launchServer({
    headless: false,
    executablePath,
    args: [
      '--incognito',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--window-size=1440,900',
      '--force-device-scale-factor=1',
    ],
  });
  resources.browserChildProcess = resources.browserServer.process();
  assert(resources.browserChildProcess, 'Browser acceptance requires its exact child process');
  const browserDebugUrl = new URL(resources.browserServer.wsEndpoint());
  resources.browserDebugHost = browserDebugUrl.hostname;
  resources.browserDebugPort = Number(browserDebugUrl.port);
  assert(Number.isSafeInteger(resources.browserDebugPort) && resources.browserDebugPort > 0,
    'Browser acceptance requires its exact BrowserServer debug port');
  resources.browser = await chromium.connect(resources.browserServer.wsEndpoint());
  resources.context = await resources.browser.newContext({
    viewport: { width: 1440, height: 900 },
    screen: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'dark',
  });
  resources.page = await resources.context.newPage();
  installCspSafePlaywrightPolling(resources.page);
  resources.pageIssueTracker = collectPageIssues(resources.page, { includeWarnings: true });
  resources.canonicalUrlTracker = createCanonicalUrlTracker(
    resources.page,
    ownedServer.baseUrl,
  );
  await resources.page.goto(ownedServer.baseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  assert.deepEqual(
    inspectCanonicalRootUrl(resources.page.url(), ownedServer.baseUrl).failures,
    [],
    'Browser acceptance did not enter the canonical source root',
  );
}

async function launchCeresElectronRuntime({ root, runId, resources }) {
  const { _electron: electron } = await loadPlaywright();
  resources.isolatedLaunch = createIsolatedElectronLaunch({
    root,
    taskId: `ceres-five-minute-${runId}`,
  });
  resources.electronApp = await launchIsolatedElectronApplication(
    electron,
    resources.isolatedLaunch,
  );
  resources.childProcess = resources.electronApp.process();
  resources.processMonitor = createElectronProcessMonitor({
    electronApp: resources.electronApp,
    childProcess: resources.childProcess,
  });
  resources.childProcess = resources.processMonitor.childProcess;
  assert(resources.childProcess, 'Electron acceptance requires its exact child process');
  resources.pageIssueTracker = createStrictElectronApplicationIssueTracker(resources.electronApp);
  resources.page = await resources.electronApp.firstWindow({ timeout: 90_000 });
  installCspSafePlaywrightPolling(resources.page);
  resources.canonicalUrlTracker = createElectronCanonicalUrlTracker(resources.page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  await resources.pageIssueTracker.bindAndBackfillPage(resources.page);
  resources.rootUrl = assertIsolatedElectronRootUrl(
    await resources.canonicalUrlTracker.waitForCanonicalRoot(10_000),
  );
  await awaitElectronInitialCanonicalLoad(
    resources.page,
    resources.electronApp,
    resources.rootUrl,
  );
}

async function requireCurrentBrowserMachineEvidence({ root, sourceCandidateDigest }) {
  const manifest = await loadValidationManifestById({
    root,
    id: 'ceres-five-minute-browser',
  });
  const outputRoot = path.resolve(root, manifest.artifactRoot);
  const evidence = await readJsonIfPresent(canonicalRuntimeEvidencePath(outputRoot, 'browser'));
  if (!evidence) return { pass: false, reason: 'CERES_BROWSER_MACHINE_EVIDENCE_REQUIRED' };
  const machine = evaluateCeresFiveMinuteRuntime(evidence, { runtimeKind: 'browser' });
  if (!machine.pass) return { pass: false, reason: 'CERES_BROWSER_MACHINE_EVIDENCE_INVALID' };
  if (evidence.authority?.sourceCandidateDigest !== sourceCandidateDigest) {
    return { pass: false, reason: 'CERES_BROWSER_MACHINE_EVIDENCE_STALE_SOURCE' };
  }
  const currentFingerprint = await strictWorktreeFingerprint(root);
  if (currentFingerprint.changedFileCount !== 0
      || !sameWorktreeFingerprint(evidence.authority?.worktree, currentFingerprint)) {
    return { pass: false, reason: 'CERES_BROWSER_MACHINE_EVIDENCE_STALE_WORKTREE' };
  }
  const artifactCheck = await validateArtifactFiles(root, evidence.artifacts, { requireClaims: true });
  if (!artifactCheck.pass) return { pass: false, reason: 'CERES_BROWSER_MACHINE_ARTIFACTS_INVALID' };
  const ledger = await readConsumedClaimLedgerEntry(outputRoot, evidence.authority?.claimId);
  const ledgerFailures = [];
  validateConsumedLedger(evidence, ledger, ledgerFailures);
  if (ledgerFailures.length > 0) return { pass: false, reason: 'CERES_BROWSER_CLAIM_LEDGER_INVALID' };
  return { pass: true, evidence };
}

function resolveSystemBrowserExecutable() {
  const candidates = process.platform === 'win32'
    ? [
      path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]
    : process.platform === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}

async function inspectOwnedPortClosures(resources = {}) {
  const candidates = [];
  try {
    const root = new URL(resources.rootUrl);
    const port = Number(root.port);
    if (Number.isSafeInteger(port) && port > 0) {
      candidates.push({ kind: 'app', host: root.hostname || '127.0.0.1', port });
    }
  } catch (_) {}
  if (Number.isSafeInteger(resources.browserDebugPort) && resources.browserDebugPort > 0) {
    candidates.push({
      kind: 'debug',
      host: resources.browserDebugHost || '127.0.0.1',
      port: resources.browserDebugPort,
    });
  }
  const unique = new Map(candidates.map((entry) => [`${entry.host}:${entry.port}`, entry]));
  return Promise.all([...unique.values()].map(async (entry) => ({
    kind: entry.kind,
    port: entry.port,
    closed: await tcpPortIsClosed(entry.host, entry.port),
  })));
}

function tcpPortIsClosed(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (closed) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(closed);
    };
    socket.setTimeout(1_000, () => finish(false));
    socket.once('connect', () => finish(false));
    socket.once('error', (error) => finish(error?.code === 'ECONNREFUSED'));
  });
}

function normalizeCeresCleanup(
  runtimeKind,
  report,
  profileRemoved,
  resources = {},
  portReceipts = [],
) {
  const failures = [];
  if (!report || report.pass !== true) {
    const raw = report?.failures || ['owned cleanup report is missing'];
    for (const failure of raw) {
      failures.push(typeof failure === 'string'
        ? failure
        : `${failure?.name || 'cleanup'}: ${failure?.error?.message || 'failed'}`);
    }
  }
  const ownedProcessesExited = runtimeKind === 'electron'
    ? report?.processExited === true && report?.processCloseConfirmed === true
    : report?.browserProcessExited === true && report?.browserDisconnected === true;
  const listenerReleased = runtimeKind === 'electron'
    ? report?.listenerReleased === true
    : report?.serverReleased === true;
  if (!ownedProcessesExited) failures.push('owned process exit was not proved');
  const expectedPortKinds = runtimeKind === 'browser' ? ['app', 'debug'] : ['app'];
  const ports = Array.isArray(portReceipts) ? portReceipts : [];
  const portsClosed = listenerReleased && expectedPortKinds.every((kind) => (
    ports.some((entry) => entry?.kind === kind && entry.closed === true)
  ));
  if (!portsClosed) failures.push('every owned listener port was not proved closed');
  const profileRequired = runtimeKind === 'electron';
  if (profileRequired && profileRemoved !== true) {
    failures.push('owned Electron runtime profile was not removed after process exit');
  }
  const pid = Number(runtimeKind === 'electron'
    ? resources.childProcess?.pid
    : resources.browserChildProcess?.pid);
  const ownedPids = Number.isSafeInteger(pid) && pid > 0 ? [pid] : [];
  if (ownedPids.length === 0) failures.push('owned runtime pid was not retained');
  if (ports.length !== expectedPortKinds.length) failures.push('owned runtime port set is incomplete');
  return {
    pass: failures.length === 0,
    ownedProcessesExited,
    portsClosed,
    profileRequired,
    profileRemoved: profileRequired ? profileRemoved === true : null,
    ownedPids,
    aliveOwnedPids: ownedProcessesExited ? [] : ownedPids,
    ports,
    profile: {
      path: runtimeKind === 'electron' ? resources.isolatedLaunch?.userDataDir || null : null,
      required: profileRequired,
      removed: profileRequired ? profileRemoved === true : null,
    },
    pageClosed: report?.pageClosed === true,
    runtimeClosed: runtimeKind === 'electron'
      ? report?.appCloseCompleted === true
      : report?.browserDisconnected === true,
    serverClosed: portsClosed,
    failures: [...new Set(failures)],
    report,
  };
}

function createCeresRuntimeEvidence({
  runtimeKind,
  routeResult,
  digests,
  manifest,
  claimId,
  fingerprint,
  artifactIdentity,
  artifacts,
  cleanup,
  consumedLedger,
  electronProvisioning,
  primaryAcceptance,
}) {
  const observations = {
    ...routeResult.observations,
    artifactBindings: {
      allVerified: true,
      candidateDigest: digests.candidateDigest,
      runtimeKind,
      requiredArtifacts: artifacts.filter((entry) => entry.kind !== 'ceres-five-minute-artifact-set'),
    },
    cleanupExpectations: {
      allOwnedProcessesExited: cleanup.ownedProcessesExited === true,
      aliveOwnedPids: cleanup.aliveOwnedPids,
      portsClosed: cleanup.portsClosed === true,
      profileRequired: cleanup.profileRequired === true,
      profileRemoved: cleanup.profileRemoved,
      receipt: cleanup.receipt,
    },
  };
  return {
    schema: CERES_FIVE_MINUTE_RUNTIME_SCHEMA,
    pass: primaryAcceptance === true,
    machinePass: true,
    primaryAcceptance: primaryAcceptance === true,
    generatedAt: new Date().toISOString(),
    runtimeKind,
    runtimeScope: runtimeKind === 'electron' ? 'source-native-electron' : 'source-browser',
    packagedElectronClaim: false,
    controllerParityClaim: false,
    r7CrimeLoopClaim: false,
    r8Claim: false,
    g0ToG7Claim: false,
    route: {
      id: CERES_FIVE_MINUTE_ROUTE_ID,
      publicPath: ['main_menu', 'sandbox', CERES_FIVE_MINUTE_ROUTE_ID],
      seed: CERES_FIVE_MINUTE_FIXED_SEED,
      inputMode: 'keyboard_mouse',
      shipId: 'ship_hornet',
      loadoutId: 'physics_toolkit',
      cameraZoomWU: 144,
      timeScale: 1,
      tickRateHz: CERES_FIVE_MINUTE_TICK_RATE_HZ,
      startTick: routeResult.observerBounds.startTick,
      endTick: routeResult.observerBounds.endTick,
      fixedTicks: CERES_FIVE_MINUTE_FIXED_TICKS,
      simulationSeconds: CERES_FIVE_MINUTE_SIMULATION_SECONDS,
      pocketSequence: observations.pocketSequence,
    },
    census: {
      actorSlotIds: [...CERES_FIVE_MINUTE_ACTOR_SLOT_IDS],
      objectSlotIds: [...CERES_FIVE_MINUTE_OBJECT_SLOT_IDS],
      collisionAnchorSlotIds: [...CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS],
      lawfulActorsAndServicesPresent: ceresLawfulServiceClassificationPass(
        routeResult.finalSnapshot.census.actors,
      ),
      throughlineAmbush: {
        present: observations.throughlineAmbush.pass === true
          && ceresHostileOpportunityPass(observations.throughlineAmbush.hostiles),
        kind: ceresHostileOpportunityPass(observations.throughlineAmbush.hostiles)
          ? 'hostile_criminal'
          : 'unverified',
        countedInAuthoredActorCensus: false,
        injectedScenario: false,
      },
      crimeLoopClaim: false,
    },
    activityVisibility: {
      semantics: CERES_FIVE_MINUTE_VISIBILITY_SEMANTICS,
      samples: observations.visibilitySamples,
      bounds: routeResult.observerBounds,
      recordedMetric: observations.recordedMetric,
    },
    observations,
    publicInputReceipt: routeResult.inputReceipt,
    authority: {
      claimId,
      candidateHash: fingerprint.head,
      candidateDigest: digests.candidateDigest,
      sourceCandidateDigest: digests.sourceCandidateDigest,
      artifactRoot: manifest.artifactRoot,
      digests: {
        routeDigest: digests.routeDigest,
        inputDigest: digests.inputDigest,
        activityContractDigest: digests.scenarioManifestDigest,
        runtimeManifestDigest: digests.manifestDigest,
        profileDigest: digests.profileDigest,
        regressionDigest: digests.regressionDigest,
        harnessDigest: digests.harnessDigest,
        scenarioManifestDigest: digests.scenarioManifestDigest,
        saveDigest: digests.saveDigest,
        inputTapeDigest: digests.inputTapeDigest,
        cameraManifestDigest: digests.cameraManifestDigest,
      },
      worktree: {
        id: fingerprint.id,
        digest: fingerprint.digest,
        head: fingerprint.head,
        branch: fingerprint.branch,
      },
      consumedLedgerSchema: consumedLedger?.schema || null,
      validationManifestId: manifest.id || null,
    },
    artifactIdentity,
    artifacts,
    cleanup,
    gpu: routeResult.gpu,
    issues: summarizeIssues(routeResult.issues),
    electronProvisioning: electronProvisioning ? {
      ready: electronProvisioning.ready,
      packageVersion: electronProvisioning.packageVersion,
      runtimeVersion: electronProvisioning.runtimeVersion,
      provisioned: electronProvisioning.provisioned,
    } : null,
  };
}

async function describeArtifact(root, absolutePath, kind) {
  const resolved = path.resolve(String(absolutePath || ''));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`artifact path escapes the repository: ${absolutePath}`);
  }
  const metadata = await stat(resolved);
  if (!metadata.isFile() || metadata.size < 1) throw new Error(`artifact is not a nonempty file: ${relative}`);
  const contents = await readFile(resolved);
  return {
    kind,
    path: relative.replaceAll('\\', '/'),
    bytes: contents.length,
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
}

function artifactKindForPath(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase();
  if (base === 'observation.json') return 'observation';
  if (base === 'run.log') return 'route-log';
  if (base === 'cleanup.json') return 'cleanup-receipt';
  if (/(?:accessibility-default|reduced-motion-flash)\.png$/i.test(base)) return 'accessibility-screenshot';
  const extension = path.extname(String(filePath || '')).toLowerCase();
  if (extension === '.png') return 'pocket-screenshot';
  return 'route-support';
}

async function writeHumanReviewTemplate({ outputPath, evidence }) {
  const metric = evidence.activityVisibility.recordedMetric;
  await writeJsonAtomically(outputPath, {
    schema: CERES_FIVE_MINUTE_HUMAN_REVIEW_SCHEMA,
    verdict: null,
    readsAsBriefIntentionalVoid: null,
    note: '',
    question: 'Does the longest gap read as a brief intentional void?',
    candidateHash: evidence.authority.candidateHash,
    candidateDigest: evidence.authority.candidateDigest,
    sourceCandidateDigest: evidence.authority.sourceCandidateDigest,
    routeId: evidence.route.id,
    runtimeKind: evidence.runtimeKind,
    seed: evidence.route.seed,
    maxZeroVisibleActivityS: metric.maxZeroVisibleActivityS,
    gapMetricDigest: metric.metricDigest,
    intervalStartTick: metric.intervalStartTick,
    intervalEndTick: metric.intervalEndTick,
    adjacentPocketTransition: metric.adjacentPocketTransition,
    artifactIdentity: evidence.artifactIdentity,
    reviewedAt: null,
    reviewer: null,
  });
}

function canonicalRuntimeEvidencePath(outputRoot, runtimeKind) {
  return path.join(outputRoot, runtimeKind, 'evidence.json');
}

function canonicalHumanReviewPath(outputRoot, runtimeKind) {
  return path.join(outputRoot, runtimeKind, 'human-review.json');
}

function sameWorktreeFingerprint(left, right) {
  return !!left && !!right
    && left.id === right.id
    && left.digest === right.digest
    && left.head === right.head
    && left.branch === right.branch
    && right.changedFileCount === 0;
}

function sameCandidateAuthority(leftDigests, rightDigests, leftFingerprint, rightFingerprint) {
  if (!sameWorktreeFingerprint(leftFingerprint, rightFingerprint)) return false;
  const digestKeys = [
    'routeDigest',
    'regressionDigest',
    'productionDigest',
    'harnessDigest',
    'scenarioDigest',
    'inputDigest',
    'profileDigest',
    'manifestDigest',
    'candidateDigest',
    'buildDigest',
    'sourceCandidateDigest',
    'worktreeDigest',
    'worktreeHead',
    'worktreeBranch',
    'worktreeChangedFileCount',
    'scenarioManifestDigest',
    'saveDigest',
    'inputTapeDigest',
    'cameraManifestDigest',
    'candidateSourceDigestMode',
    'candidateSourcePathCount',
  ];
  if (!leftDigests || !rightDigests
      || !digestKeys.every((key) => leftDigests[key] === rightDigests[key])) {
    return false;
  }
  return leftDigests.worktreeChangedFileCount === 0
    && rightDigests.worktreeChangedFileCount === 0
    && leftDigests.worktreeDigest === leftFingerprint.digest
    && rightDigests.worktreeDigest === rightFingerprint.digest
    && leftDigests.worktreeHead === leftFingerprint.head
    && rightDigests.worktreeHead === rightFingerprint.head
    && leftDigests.worktreeBranch === leftFingerprint.branch
    && rightDigests.worktreeBranch === rightFingerprint.branch;
}

function blockedCeresResult(reason) {
  return {
    pass: false,
    blocked: true,
    primaryAcceptance: false,
    reason,
    failures: [String(reason || 'Ceres acceptance is blocked')],
  };
}

function normalizeVisibilitySample(sample, bounds, index) {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    throw new TypeError(`visibility sample ${index} is invalid`);
  }
  const tick = finiteInteger(sample.tick, `visibility sample ${index}.tick`);
  if (tick < bounds.startTick || tick > bounds.endTick) {
    throw new Error(`visibility sample ${index} is outside the exact horizon`);
  }
  const visibleActivityCount = finiteInteger(
    sample.visibleActivityCount,
    `visibility sample ${index}.visibleActivityCount`,
  );
  if (visibleActivityCount < 0) throw new Error('visible activity count cannot be negative');
  const nearestPocketId = sample.nearestPocketId == null ? null : String(sample.nearestPocketId);
  if (visibleActivityCount > 0 && !POCKET_ID_SET.has(nearestPocketId)) {
    throw new Error('visible activity sample requires a canonical nearest pocket id');
  }
  return { tick, visibleActivityCount, nearestPocketId };
}

function validateHorizon(bounds) {
  if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) {
    throw new TypeError('exact visibility horizon is required');
  }
  const startTick = finiteInteger(bounds.startTick, 'bounds.startTick');
  const endTick = finiteInteger(bounds.endTick, 'bounds.endTick');
  if (bounds.tickRateHz !== CERES_FIVE_MINUTE_TICK_RATE_HZ
      || bounds.fixedTicks !== CERES_FIVE_MINUTE_FIXED_TICKS
      || bounds.simulationSeconds !== CERES_FIVE_MINUTE_SIMULATION_SECONDS
      || endTick - startTick !== CERES_FIVE_MINUTE_FIXED_TICKS) {
    throw new Error('visibility horizon must be exactly 18,000 ticks / 300 simulation seconds at 60 Hz');
  }
}

function canonicalRecordedGapProjection(metric) {
  if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
    throw new TypeError('recorded zero-visible metric is required');
  }
  const maxZeroVisibleActivityS = finiteNumber(
    metric.maxZeroVisibleActivityS,
    'maxZeroVisibleActivityS',
  );
  const intervalStartTick = finiteInteger(metric.intervalStartTick, 'intervalStartTick');
  const intervalEndTick = finiteInteger(metric.intervalEndTick, 'intervalEndTick');
  if (maxZeroVisibleActivityS < 0 || intervalEndTick <= intervalStartTick) {
    throw new Error('recorded zero-visible interval timing is invalid');
  }
  const fromPocketId = String(metric.adjacentPocketTransition?.fromPocketId || '');
  const toPocketId = String(metric.adjacentPocketTransition?.toPocketId || '');
  if (!POCKET_ID_SET.has(fromPocketId) || !POCKET_ID_SET.has(toPocketId)
      || fromPocketId === toPocketId) {
    throw new Error('recorded zero-visible transition is invalid');
  }
  const durationS = (intervalEndTick - intervalStartTick) / CERES_FIVE_MINUTE_TICK_RATE_HZ;
  if (Math.abs(durationS - maxZeroVisibleActivityS) > EPSILON) {
    throw new Error('recorded zero-visible duration does not match its tick endpoints');
  }
  return {
    maxZeroVisibleActivityS,
    intervalStartTick,
    intervalEndTick,
    adjacentPocketTransition: { fromPocketId, toPocketId },
  };
}

function validateRuntimeAuthority(document, runtimeKind, failures) {
  const authority = document.authority || {};
  if (!String(authority.claimId || '')) failures.push('consumed broker claim id is missing');
  if (!/^[a-f0-9]{40}$/i.test(String(authority.candidateHash || ''))) failures.push('candidate hash is invalid');
  for (const [label, digest] of [
    ['candidate', authority.candidateDigest],
    ['source candidate', authority.sourceCandidateDigest],
    ['worktree', authority.worktree?.digest],
    ['route', authority.digests?.routeDigest],
    ['input', authority.digests?.inputDigest],
    ['activity contract', authority.digests?.activityContractDigest],
    ['runtime manifest', authority.digests?.runtimeManifestDigest],
    ['runtime profile', authority.digests?.profileDigest],
    ['regression', authority.digests?.regressionDigest],
    ['harness', authority.digests?.harnessDigest],
    ['scenario manifest', authority.digests?.scenarioManifestDigest],
    ['save manifest', authority.digests?.saveDigest],
    ['input tape', authority.digests?.inputTapeDigest],
    ['camera manifest', authority.digests?.cameraManifestDigest],
  ]) {
    if (!DIGEST_RE.test(String(digest || ''))) failures.push(`${label} digest is invalid`);
  }
  const normalizedArtifactRoot = String(authority.artifactRoot || '')
    .replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
  const manifestId = String(authority.validationManifestId
    || `ceres-five-minute-${runtimeKind}`);
  const expectedArtifactRoot = manifestId === `ceres-five-minute-${runtimeKind}`
    ? `.devshots/physics-as-spectacle/ceres-five-minute/${runtimeKind}`
    : manifestId === 'pq048-ore-cycle-browser' && runtimeKind === 'browser'
      ? '.devshots/pq048-ore-cycle/browser'
      : null;
  if (normalizedArtifactRoot !== expectedArtifactRoot) {
    failures.push('artifact root does not match the exact runtime manifest root');
  }
  if (!String(authority.worktree?.id || '')
      || authority.worktree?.head !== authority.candidateHash
      || !String(authority.worktree?.branch || '')) {
    failures.push('worktree identity/head/branch is missing or inconsistent');
  }
}

function validateArtifactDescriptor(descriptor, label, failures) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    failures.push(`${label} descriptor is missing`);
    return;
  }
  if (!String(descriptor.kind || '') || !String(descriptor.path || '')) {
    failures.push(`${label} kind/path is missing`);
  }
  if (!Number.isSafeInteger(descriptor.bytes) || descriptor.bytes <= 0) {
    failures.push(`${label} byte count is invalid`);
  }
  if (!DIGEST_RE.test(String(descriptor.sha256 || ''))) failures.push(`${label} digest is invalid`);
}

function validateConsumedLedger(runtimeEvidence, ledger, failures) {
  const prefix = runtimeEvidence?.runtimeKind || 'unknown runtime';
  if (!ledger || ledger.schema !== 'spaceface.validation-broker-claim-consumed.v1'
      || !Number.isFinite(Date.parse(String(ledger.consumedAt || '')))
      || ledger.mode !== 'acceptance') {
    failures.push(`${prefix} broker claim was not consumed`);
    return;
  }
  const authority = runtimeEvidence?.authority || {};
  for (const [label, actual, expected] of [
    ['claim id', ledger.claimId, authority.claimId],
    ['runtime kind', ledger.runtimeKind, runtimeEvidence?.runtimeKind],
    ['candidate digest', ledger.candidateDigest, authority.candidateDigest],
    ['source candidate digest', ledger.digests?.sourceCandidateDigest, authority.sourceCandidateDigest],
    ['worktree digest', ledger.digests?.worktreeDigest, authority.worktree?.digest],
  ]) {
    if (actual !== expected) failures.push(`${prefix} consumed-ledger ${label} mismatch`);
  }
}

/**
 * Validate one consumed broker entry against the exact runtime authority it admitted.
 *
 * The paired Ceres publisher historically validates the common candidate/worktree fields above.
 * PQ-derived publications also need an exported, read-only validator for the exact consumed entry,
 * including the manifest digest that selected the route contract.
 */
export function evaluateCeresConsumedClaimLedger({ runtimeEvidence, ledger } = {}) {
  const failures = [];
  validateConsumedLedger(runtimeEvidence, ledger, failures);
  const expectedManifestDigest = runtimeEvidence?.authority?.digests?.runtimeManifestDigest;
  if (!String(expectedManifestDigest || '')
      || ledger?.digests?.manifestDigest !== expectedManifestDigest) {
    failures.push(`${runtimeEvidence?.runtimeKind || 'unknown runtime'} consumed-ledger manifest digest mismatch`);
  }
  return { pass: failures.length === 0, failures };
}

function validatePocketArrivals(observations, route, failures) {
  compareExactOrderedIds(observations.pocketSequence, CERES_EXPECTED_POCKET_ORDER,
    'physical pocket route', failures);
  const arrivals = observations.arrivals;
  if (!Array.isArray(arrivals) || arrivals.length < CERES_EXPECTED_POCKET_ORDER.length) {
    failures.push('four physical pocket-arrival receipts are required');
    return;
  }
  for (let index = 0; index < CERES_EXPECTED_POCKET_ORDER.length; index += 1) {
    const arrival = arrivals[index];
    const expectedPocketId = CERES_EXPECTED_POCKET_ORDER[index];
    if (!arrival || arrival.pocketId !== expectedPocketId) {
      failures.push(`arrival ${index} is not ${expectedPocketId}`);
      continue;
    }
    if (!Number.isSafeInteger(arrival.tick)
        || arrival.tick < route.startTick || arrival.tick > route.endTick
        || (index > 0 && arrival.tick <= arrivals[index - 1]?.tick)) {
      failures.push(`${expectedPocketId} arrival tick is outside the ordered horizon`);
    }
    const source = index === 0 ? 'public-sandbox-entry' : 'public-map-autopilot';
    if (arrival.source !== source) failures.push(`${expectedPocketId} arrival source is not public`);
    const receipt = arrival.physicalReceipt;
    const expectedTarget = CERES_POCKET_TARGETS[expectedPocketId];
    const expectedNavigation = CERES_POCKET_NAVIGATION[expectedPocketId];
    if (!receipt || receipt.pass !== true
        || receipt.targetId !== expectedTarget.targetId
        || receipt.targetName !== expectedTarget.targetName
        || !finiteXZ(receipt.playerPos) || !finiteXZ(receipt.targetPos)
        || !Number.isFinite(receipt.distanceWU) || receipt.distanceWU < 0) {
      failures.push(`${expectedPocketId} physical arrival receipt is incomplete`);
      continue;
    }
    if (Math.hypot(
      receipt.targetPos.x - expectedTarget.targetPos.x,
      receipt.targetPos.z - expectedTarget.targetPos.z,
    ) > 1e-6) {
      failures.push(`${expectedPocketId} arrival target is not its canonical activity anchor`);
    }
    const derivedDistance = Math.hypot(
      receipt.playerPos.x - receipt.targetPos.x,
      receipt.playerPos.z - receipt.targetPos.z,
    );
    if (Math.abs(derivedDistance - receipt.distanceWU) > 1e-6
        || derivedDistance > CERES_AMBUSH_OUTER_RADIUS_WU) {
      failures.push(`${expectedPocketId} physical arrival distance is inconsistent`);
    }
    if (index === 0) {
      if (receipt.navigationLabel != null || receipt.navigationTargetEntityId != null
          || receipt.navigationTargetIdentity != null || receipt.autopilotStatus != null) {
        failures.push('refinery Sandbox entry fabricated an autopilot identity');
      }
    } else if (receipt.autopilotStatus !== 'arrived'
        || receipt.navigationLabel !== expectedNavigation.label
        || receipt.navigationTargetIdentity !== expectedNavigation.identity
        || receipt.navigationTargetEntityId == null || !finiteXZ(receipt.navigationTargetPos)) {
      failures.push(`${expectedPocketId} navigation target identity is not the live public waypoint`);
    }
  }
}

function validateActivityFrames(observations, route, failures) {
  const frames = observations.frames;
  if (!Array.isArray(frames) || frames.length < 2) {
    failures.push('raw activity-frame sequence is missing');
    return [];
  }
  if (observations.completeActivityFrameSequence !== true) {
    failures.push('activity-frame sequence was not declared complete');
  }
  if (Array.isArray(observations.traceFailures) && observations.traceFailures.length > 0) {
    failures.push('activity trace contains route-health failures');
  } else if (!Array.isArray(observations.traceFailures)) {
    failures.push('activity trace failure ledger is missing');
  }
  if (frames[0]?.tick !== route.startTick || frames.at(-1)?.tick !== route.endTick) {
    failures.push('activity frames do not cover the exact start/end horizon');
  }
  if (!Number.isFinite(frames[0]?.simTimeS) || !Number.isFinite(frames.at(-1)?.simTimeS)
      || Math.abs((frames.at(-1).simTimeS - frames[0].simTimeS)
        - CERES_FIVE_MINUTE_SIMULATION_SECONDS) > 1e-6) {
    failures.push('activity frames do not span exactly 300 simulation seconds');
  }
  const bracket = observations.traceBracket;
  if (!bracket || !Number.isSafeInteger(bracket.before) || !Number.isSafeInteger(bracket.after)
      || bracket.before > route.endTick || bracket.after < route.endTick
      || bracket.exactStart !== route.startTick
      || (bracket.after === route.endTick
        ? bracket.exactEnd !== route.endTick || bracket.endWasClipped !== false
        : bracket.exactEnd != null || bracket.endWasClipped !== true)) {
    failures.push('activity trace does not contain a truthful exact-start/bracketed-end horizon');
  }
  const expectedActors = [...CERES_FIVE_MINUTE_ACTOR_SLOT_IDS].sort();
  const expectedObjects = [...CERES_FIVE_MINUTE_OBJECT_SLOT_IDS].sort();
  const expectedAnchors = [...CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS].sort();
  let previousTick = null;
  let previousSimTime = null;
  const routeStartSimTime = frames[0]?.simTimeS;
  const actorIdentityBySlot = new Map();
  const twoVisiblePocketCheckpoints = new Set();
  for (const [index, frame] of frames.entries()) {
    if (!frame || !Number.isSafeInteger(frame.tick)
        || frame.tick < route.startTick || frame.tick > route.endTick
        || (previousTick != null && frame.tick <= previousTick)) {
      failures.push(`activity frame ${index} tick is not strictly ordered in-horizon`);
      continue;
    }
    previousTick = frame.tick;
    const terminal = index === frames.length - 1;
    const exactObservation = frame.observedTick === frame.tick
      && frame.clippedFromObservedTick == null;
    const truthfulTerminalClip = terminal
      && frame.tick === route.endTick
      && Number.isSafeInteger(frame.observedTick)
      && frame.observedTick < frame.tick
      && frame.clippedFromObservedTick === frame.observedTick
      && Number.isFinite(frame.observedSimTimeS)
      && frame.observedSimTimeS <= frame.simTimeS + EPSILON;
    if (!exactObservation && !truthfulTerminalClip) {
      failures.push(`activity frame ${index} observation/clipping identity is invalid`);
    }
    if (!Number.isFinite(frame.simTimeS)
        || (previousSimTime != null && frame.simTimeS + EPSILON < previousSimTime)) {
      failures.push(`activity frame ${index} simulation time is invalid`);
    } else if (!Number.isFinite(routeStartSimTime)
        || Math.abs((frame.simTimeS - routeStartSimTime)
          - (frame.tick - route.startTick) / CERES_FIVE_MINUTE_TICK_RATE_HZ) > 1e-6) {
      failures.push(`activity frame ${index} simulation time does not match its fixed tick`);
    }
    if (truthfulTerminalClip
        && Math.abs((frame.observedSimTimeS - frame.simTimeS)
          - (frame.observedTick - frame.tick) / CERES_FIVE_MINUTE_TICK_RATE_HZ) > 1e-6) {
      failures.push('activity terminal observed simulation time does not match its tick bracket');
    }
    previousSimTime = frame.simTimeS;
    if (frame.sectorId !== 'sector_ceres_belt' || frame.timeScale !== 1
        || frame.playerAlive !== true || !finiteXZ(frame.playerPos)) {
      failures.push(`activity frame ${index} is not a live timeScale=1 Ceres frame`);
    }
    compareSortedIds(frame.actorSlotIds, expectedActors, `activity frame ${index} actor slots`, failures);
    compareSortedIds(frame.objectSlotIds, expectedObjects, `activity frame ${index} object slots`, failures);
    compareSortedIds(frame.collisionAnchorSlotIds, expectedAnchors,
      `activity frame ${index} collision anchors`, failures);
    const actorStates = Array.isArray(frame.actorStates) ? frame.actorStates : [];
    const bySlot = new Map();
    const worldRecordIds = new Set();
    const jobOwners = new Map();
    for (const actor of actorStates) {
      if (!actor || !expectedActors.includes(actor.slotId) || bySlot.has(actor.slotId)
          || !String(actor.worldRecordId || '') || !finiteXZ(actor)) continue;
      bySlot.set(actor.slotId, actor);
      worldRecordIds.add(actor.worldRecordId);
      if (actor.slotId !== 'ceres_cinder_service_hauler' && !String(actor.jobId || '')) continue;
      if (actor.jobId) {
        const priorOwner = jobOwners.get(actor.jobId);
        if (priorOwner && priorOwner !== actor.slotId) {
          failures.push(`activity frame ${index} reuses job ${actor.jobId} across actor slots`);
        }
        jobOwners.set(actor.jobId, actor.slotId);
      }
    }
    if (bySlot.size !== expectedActors.length || worldRecordIds.size !== expectedActors.length) {
      failures.push(`activity frame ${index} does not contain nine unique record-backed actors`);
    }
    if (!ceresLawfulServiceClassificationPass(actorStates)) {
      failures.push(`activity frame ${index} has untruthful lawful/service classification`);
    }
    for (const slotId of expectedActors) {
      const actor = bySlot.get(slotId);
      if (!actor || (slotId !== 'ceres_cinder_service_hauler' && !String(actor.jobId || ''))) {
        failures.push(`activity frame ${index} is missing the durable job contract for ${slotId}`);
        continue;
      }
      const identity = `${actor.worldRecordId}\u0000${actor.jobId || ''}`;
      const prior = actorIdentityBySlot.get(slotId);
      if (prior == null) actorIdentityBySlot.set(slotId, identity);
      else if (prior !== identity) {
        failures.push(`activity frame ${index} changed actor record/job identity for ${slotId}`);
      }
    }
    const visibleIds = Array.isArray(frame.visibleActivityIds) ? frame.visibleActivityIds : [];
    const uniqueVisibleIds = new Set(visibleIds);
    if (uniqueVisibleIds.size !== visibleIds.length
        || visibleIds.some((slotId) => !countsTowardCeresPocketVisibility(slotId))
        || !Number.isSafeInteger(frame.visibleActivityCount) || frame.visibleActivityCount < 0
        || frame.visibleActivityCount !== visibleIds.length) {
      failures.push(`activity frame ${index} visible-activity identity/count is invalid`);
    }
    if (frame.visibleActivityCount >= 2 && POCKET_ID_SET.has(frame.nearestPocketId)) {
      twoVisiblePocketCheckpoints.add(frame.nearestPocketId);
    }
  }
  for (const pocketId of CERES_EXPECTED_POCKET_ORDER) {
    if (!twoVisiblePocketCheckpoints.has(pocketId)) {
      failures.push(`${pocketId} lacks a two-distinct-visible-activity checkpoint`);
    }
  }
  const terminalFrame = frames.at(-1);
  const expectedTerminalObservedTick = bracket?.endWasClipped === true
    ? bracket?.before
    : bracket?.after;
  if (terminalFrame?.observedTick !== expectedTerminalObservedTick
      || (bracket?.endWasClipped === true) !== (terminalFrame?.clippedFromObservedTick != null)) {
    failures.push('activity terminal frame does not match its observed end bracket');
  }
  return frames;
}

function validateVisibilityFrameProjection(observations, frames, failures) {
  const samples = observations.visibilitySamples;
  if (!Array.isArray(samples) || samples.length !== frames.length) {
    failures.push('visibility samples do not cover the complete raw activity-frame sequence');
    return;
  }
  for (const [index, sample] of samples.entries()) {
    const frame = frames[index];
    const expectedPocketId = frame?.visibleActivityCount > 0 ? frame.nearestPocketId : null;
    if (!sample || sample.tick !== frame?.tick
        || sample.visibleActivityCount !== frame?.visibleActivityCount
        || sample.nearestPocketId !== expectedPocketId) {
      failures.push(`visibility sample ${index} is not the raw activity-frame projection`);
    }
  }
  const metric = evaluateZeroVisibilityMetric({
    samples,
    bounds: observations.bounds,
    recordedMetric: observations.recordedMetric,
  });
  failures.push(...metric.failures.map((failure) => `raw visibility: ${failure}`));
}

function validateMovingJobBuckets(observations, frames, route, failures) {
  const recorded = observations.movingJobBuckets;
  if (!Array.isArray(recorded) || recorded.length !== 5) {
    failures.push('five exact 60-second moving-job buckets are required');
    return [];
  }
  const projection = [];
  for (let bucket = 0; bucket < 5; bucket += 1) {
    const startTick = route.startTick + bucket * CERES_MINUTE_BUCKET_TICKS;
    const endTick = startTick + CERES_MINUTE_BUCKET_TICKS;
    const bucketFrames = frames.filter((frame) => frame.tick >= startTick
      && (bucket === 4 ? frame.tick <= endTick : frame.tick < endTick));
    const tracks = new Map();
    for (const frame of bucketFrames) {
      for (const actor of frame.actorStates || []) {
        if (!String(actor?.jobId || '') || !finiteXZ(actor)) continue;
        const prior = tracks.get(actor.jobId);
        if (prior && prior.slotId !== actor.slotId) {
          failures.push(`minute ${bucket + 1} reuses job ${actor.jobId} across actors`);
          continue;
        }
        const track = prior || {
          jobId: actor.jobId,
          slotId: actor.slotId,
          start: { tick: frame.tick, x: actor.x, z: actor.z },
          end: { tick: frame.tick, x: actor.x, z: actor.z },
          maxDisplacement: 0,
        };
        track.end = { tick: frame.tick, x: actor.x, z: actor.z };
        track.maxDisplacement = Math.max(track.maxDisplacement, Math.hypot(
          actor.x - track.start.x,
          actor.z - track.start.z,
        ));
        tracks.set(actor.jobId, track);
      }
    }
    const moving = [...tracks.values()].filter((track) => track.maxDisplacement > EPSILON)
      .sort((left, right) => left.jobId.localeCompare(right.jobId));
    const actual = recorded[bucket];
    if (!actual || actual.bucket !== bucket || actual.startTick !== startTick || actual.endTick !== endTick) {
      failures.push(`minute ${bucket + 1} moving-job bucket bounds are invalid`);
    }
    const movingJobIds = moving.map((track) => track.jobId);
    if (movingJobIds.length < 2) failures.push(`minute ${bucket + 1} has fewer than two moving jobs`);
    compareSortedIds(actual?.movingJobIds, movingJobIds,
      `minute ${bucket + 1} moving-job ids`, failures);
    const reportedTracks = Array.isArray(actual?.tracks) ? actual.tracks : [];
    for (const track of moving) {
      const receipt = reportedTracks.find((entry) => entry?.jobId === track.jobId);
      if (!receipt || receipt.slotId !== track.slotId
          || stableJson(receipt.start) !== stableJson(track.start)
          || stableJson(receipt.end) !== stableJson(track.end)) {
        failures.push(`minute ${bucket + 1} moving-job track ${track.jobId} is inconsistent`);
      }
    }
    projection.push({ bucket, startTick, endTick, movingJobIds });
  }
  return projection;
}

function validateThroughlineAmbushObservation(observations, route, failures) {
  const ambush = observations.throughlineAmbush;
  const projection = {
    encounterId: ambush?.encounterId || null,
    hostileWorldRecordIds: sortedStrings(ambush?.hostileWorldRecordIds),
  };
  if (!ambush || ambush.pass !== true
      || ambush.encounterId !== 'ceres:activity:throughline-ambush'
      || ambush.injected !== false) {
    failures.push('ordinary Throughline ambush observation is incomplete or injected');
    return projection;
  }
  const sweep = ambush.sweep;
  const before = sweep?.before;
  const after = sweep?.after;
  const zone = sweep?.zone;
  if (!finiteXZ(zone?.center) || !(Number.isFinite(zone?.radiusWU) && zone.radiusWU > 0)) {
    failures.push('Throughline sweep zone authority is invalid');
    return projection;
  }
  if (stableJson(zone.center) !== stableJson(CERES_AMBUSH_ANCHOR_GLOBAL)
      || zone.radiusWU !== CERES_AMBUSH_OUTER_RADIUS_WU) {
    failures.push('Throughline sweep zone does not match the canonical zone authority');
  }
  const beforeDistance = finiteXZ(before?.pos) && finiteXZ(zone?.center)
    ? Math.hypot(before.pos.x - zone.center.x, before.pos.z - zone.center.z) : NaN;
  const afterDistance = finiteXZ(after?.pos) && finiteXZ(zone?.center)
    ? Math.hypot(after.pos.x - zone.center.x, after.pos.z - zone.center.z) : NaN;
  const path = Array.isArray(sweep?.path) ? sweep.path : [];
  let priorTick = null;
  let crossed = false;
  for (const [index, row] of path.entries()) {
    if (!Number.isSafeInteger(row?.tick) || !finiteXZ(row?.pos)
        || (priorTick != null && row.tick <= priorTick)
        || !observations.frames?.some((frame) => frame.tick === row.tick
          && stableJson(frame.playerPos) === stableJson(row.pos))) {
      failures.push(`Throughline sweep path row ${index} is not a real ordered route sample`);
      continue;
    }
    if (Math.hypot(row.pos.x - zone?.center?.x, row.pos.z - zone?.center?.z) <= zone?.radiusWU) {
      crossed = true;
    }
    if (index > 0 && segmentCrossesCircle(path[index - 1].pos, row.pos, zone.center, zone.radiusWU)) {
      crossed = true;
    }
    priorTick = row.tick;
  }
  if (!Number.isSafeInteger(before?.tick) || !Number.isSafeInteger(after?.tick)
      || before.tick < route.startTick || after.tick > route.endTick || before.tick >= after.tick
      || !(beforeDistance > zone?.radiusWU) || !(afterDistance > zone?.radiusWU)
      || path.length < 2 || stableJson(path[0]) !== stableJson(before)
      || stableJson(path.at(-1)) !== stableJson(after)
      || sweep.bothEndpointsOutside !== true || sweep.segmentCrossesZone !== true || !crossed) {
    failures.push('Throughline ambush lacks an outer-to-outer swept crossing receipt');
  }
  const events = Array.isArray(ambush.events) ? ambush.events : [];
  const telegraph = events.find((event) => event?.event === 'encounter:telegraph'
    && event.encounterId === ambush.encounterId);
  const spawned = events.find((event) => event?.event === 'encounter:spawned'
    && event.encounterId === ambush.encounterId);
  if (!Number.isSafeInteger(telegraph?.tick) || !Number.isSafeInteger(spawned?.tick)
      || telegraph.tick <= before?.tick || telegraph.tick >= after?.tick
      || telegraph.tick > spawned.tick
      || spawned.tick > route.endTick || spawned.tick < route.startTick) {
    failures.push('Throughline ambush telegraph/spawn order is invalid');
  }
  if (projection.hostileWorldRecordIds.length < 1) {
    failures.push('Throughline ambush has no durable hostile identity');
  }
  if (!ceresHostileOpportunityPass(ambush.hostiles)) {
    failures.push('Throughline ambush lacks raw live hostile-criminal classification');
  }
  compareSortedIds(ambush.hostiles?.map((row) => row?.worldRecordId),
    projection.hostileWorldRecordIds, 'Throughline hostile record identity', failures);
  const finalLiveRecordIds = sortedStrings(ambush.liveHostiles?.map((row) => row?.worldRecordId));
  if (finalLiveRecordIds.some((recordId) => !projection.hostileWorldRecordIds.includes(recordId))) {
    failures.push('final Throughline hostile lifecycle contains an unknown replacement identity');
  }
  return projection;
}

function validateAnchorCollisionObservation(observations, route, failures) {
  const collision = observations.anchorCollision;
  const projection = {
    slotId: collision?.slotId || null,
    anchorEntityId: collision?.anchorEntityId ?? null,
  };
  if (!collision || collision.pass !== true
      || collision.slotId !== 'ceres_throughline_collision_anchor'
      || collision.anchorEntityId == null || collision.playerEntityId == null
      || collision.anchorEntityId === collision.playerEntityId || collision.collides !== true) {
    failures.push('exact Throughline collision-anchor receipt is incomplete');
    return projection;
  }
  for (const [label, rows] of [
    ['setup', collision.setupAnchors],
    ['final', collision.finalAnchors],
  ]) {
    if (!Array.isArray(rows) || rows.length !== CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS.length) {
      failures.push(`${label} collision-anchor census is incomplete`);
      continue;
    }
    const target = rows.find((row) => row?.slotId === collision.slotId);
    if (!target || target.entityId !== collision.anchorEntityId || target.collides !== true) {
      failures.push(`${label} collision-anchor identity changed`);
    }
  }
  const impacts = Array.isArray(collision.impacts) ? collision.impacts : [];
  const matched = impacts.some((impact) => impact?.event === 'physics:impact'
    && Number.isSafeInteger(impact.tick)
    && impact.tick >= route.startTick && impact.tick <= route.endTick
    && ((impact.aId === collision.playerEntityId && impact.bId === collision.anchorEntityId)
      || (impact.bId === collision.playerEntityId && impact.aId === collision.anchorEntityId)));
  if (!matched) failures.push('player never physically impacted the exact Throughline anchor');
  return projection;
}

function validateContinueObservation(observations, route, failures) {
  const receipt = observations.continueProof;
  const projection = {
    tombstones: sortedStrings(receipt?.hostileTombstonesAfter),
    actorRecords: receipt?.actorRecordsAfter || [],
  };
  if (!receipt || receipt.pass !== true || receipt.source !== 'public-save-continue') {
    failures.push('public Save/Continue receipt is missing');
    return projection;
  }
  if (!Number.isSafeInteger(receipt.savedAtTick) || !Number.isSafeInteger(receipt.loadedAtTick)
      || receipt.savedAtTick < route.startTick || receipt.savedAtTick > route.endTick
      || receipt.loadedAtTick < receipt.savedAtTick || receipt.loadedAtTick > route.endTick) {
    failures.push('Save/Continue ticks are outside the route horizon');
  }
  if (stableJson(receipt.publicPath) !== stableJson(['F5', 'reload', 'main_menu', 'continue'])) {
    failures.push('Continue did not use the public quick-save/reload/menu route');
  }
  const beforeActors = canonicalActorRecords(receipt.actorRecordsBefore, failures, 'before Continue');
  const afterActors = canonicalActorRecords(receipt.actorRecordsAfter, failures, 'after Continue');
  if (stableJson(beforeActors) !== stableJson(afterActors)) failures.push('Continue changed actor record/job identity');
  const beforeObjects = canonicalObjectRecords(receipt.objectRecordsBefore, failures, 'before Continue');
  const afterObjects = canonicalObjectRecords(receipt.objectRecordsAfter, failures, 'after Continue');
  if (stableJson(beforeObjects) !== stableJson(afterObjects)) failures.push('Continue replaced an activity object');
  const beforeAnchors = canonicalAnchorRecords(receipt.collisionAnchorsBefore, failures, 'before Continue');
  const afterAnchors = canonicalAnchorRecords(receipt.collisionAnchorsAfter, failures, 'after Continue');
  if (stableJson(beforeAnchors) !== stableJson(afterAnchors)) failures.push('Continue replaced a collision anchor');
  const beforeTombstones = sortedStrings(receipt.hostileTombstonesBefore);
  const afterTombstones = sortedStrings(receipt.hostileTombstonesAfter);
  const initialHostiles = sortedStrings(receipt.initialHostileWorldRecordIds);
  const destroyedHostiles = sortedStrings(receipt.destroyedHostileWorldRecordIds);
  const expectedLive = initialHostiles.filter((recordId) => !destroyedHostiles.includes(recordId));
  const recordedExpectedLive = sortedStrings(receipt.expectedLiveHostileWorldRecordIdsAfter);
  const liveAfterRows = sortedStrings(receipt.liveHostileWorldRecordIdsAfter);
  const replacements = sortedStrings(receipt.replacementWorldRecordIds);
  const missing = sortedStrings(receipt.missingWorldRecordIds);
  const actorOverlap = sortedStrings(receipt.actorHostileIdentityOverlap);
  if (initialHostiles.length < 1 || destroyedHostiles.length < 1
      || destroyedHostiles.length >= initialHostiles.length
      || destroyedHostiles.some((recordId) => !initialHostiles.includes(recordId))) {
    failures.push('Continue initial/destroyed hostile identity set is invalid');
  }
  if (beforeTombstones.length < 1 || stableJson(beforeTombstones) !== stableJson(afterTombstones)
      || destroyedHostiles.some((recordId) => !afterTombstones.includes(recordId))) {
    failures.push('Continue tombstone proof is vacuous or changed');
  }
  if (stableJson(recordedExpectedLive) !== stableJson(expectedLive)
      || stableJson(liveAfterRows) !== stableJson(expectedLive)
      || replacements.length > 0 || missing.length > 0 || actorOverlap.length > 0
      || receipt.replacementSpawnCount !== replacements.length) {
    failures.push('Continue replaced a tombstoned Throughline hostile');
  }
  const actorRecordIds = new Set(beforeActors.map((row) => row.worldRecordId));
  if (initialHostiles.some((recordId) => actorRecordIds.has(recordId))) {
    failures.push('authored activity actors overlap hostile ambush identities');
  }
  if (receipt.seedBefore !== CERES_FIVE_MINUTE_FIXED_SEED
      || receipt.seedAfter !== CERES_FIVE_MINUTE_FIXED_SEED) {
    failures.push('Continue changed the fixed seed');
  }
  return projection;
}

function validateAccessibilityObservation(observations, route, failures) {
  const receipt = observations.accessibility;
  const projection = { source: receipt?.source || null, reduced: false };
  if (!receipt || receipt.pass !== true || receipt.source !== 'public-settings-ui') {
    failures.push('reduced-settings evidence did not use the public Settings UI');
    return projection;
  }
  validateAccessibilityCensus(receipt.before, { reduced: false }, failures);
  validateAccessibilityCensus(receipt.reduced, { reduced: true }, failures);
  const defaultIdentity = accessibilityCheckpointIdentity(receipt.before);
  const reducedIdentity = accessibilityCheckpointIdentity(receipt.reduced);
  if (stableJson(defaultIdentity) !== stableJson(reducedIdentity)
      || stableJson(receipt.matchedCheckpoint?.identity) !== stableJson(defaultIdentity)
      || receipt.before?.tick !== receipt.reduced?.tick
      || receipt.matchedCheckpoint?.tick !== receipt.before?.tick
      || receipt.matchedCheckpoint?.captureMethod !== 'public-pause-flight-surface-v1'
      || receipt.matchedCheckpoint?.defaultArtifactName !== '20-accessibility-default.png'
      || receipt.matchedCheckpoint?.reducedArtifactName !== '21-reduced-motion-flash.png') {
    failures.push('default/reduced accessibility evidence is not a matched scene checkpoint');
  }
  const input = validatePublicInputReceipt(receipt.postToggleInputReceipt);
  failures.push(...input.failures.map((failure) => `post-toggle input: ${failure}`));
  if (!Number.isSafeInteger(receipt.postToggleCompleteFrameTick)
      || receipt.postToggleCompleteFrameTick <= receipt.postToggleInputReceipt?.neutralTick
      || receipt.postToggleCompleteFrameTick > route.endTick
      || !observations.frames?.some((frame) => frame.tick >= receipt.postToggleCompleteFrameTick
        && frame.playerAlive === true)) {
    failures.push('reduced settings lack a complete post-toggle flight frame');
  }
  projection.reduced = receipt.reduced?.motionReduce === true && receipt.reduced?.flashReduce === true;
  return projection;
}

function validateToolkitObservation(observations, route, continueProjection, failures) {
  const receipt = observations.toolkit;
  const before = failures.length;
  const projection = validateToolkitReceiptCore(receipt, route, failures);
  if (failures.length !== before) return;
  const collision = observations.anchorCollision;
  const camera = projection.cameraReposition;
  const boundAnchorImpact = (Array.isArray(collision?.impacts) ? collision.impacts : [])
    .some((impact) => impact?.event === 'physics:impact'
      && impact.tick === camera.anchorImpactTick
      && ((impact.aId === camera.playerEntityId && impact.bId === camera.anchorEntityId)
        || (impact.bId === camera.playerEntityId && impact.aId === camera.anchorEntityId)));
  if (camera.playerEntityId !== collision?.playerEntityId
      || camera.anchorEntityId !== collision?.anchorEntityId || !boundAnchorImpact) {
    failures.push('toolkit camera reposition is not bound to the exact preceding anchor impact');
  }
  for (const recordId of projection.destroyedRecordIds) {
    if (!continueProjection.tombstones.includes(recordId)) {
      failures.push(`toolkit hostile tombstone ${recordId} is not preserved through Continue`);
    }
  }
}

function validateToolkitReceiptCore(receipt, route, failures) {
  const projection = {
    destroyedRecordIds: [],
    targetRecordIds: [],
    cameraReposition: null,
  };
  if (!receipt || receipt.schema !== 'spaceface.ceresFiveMinuteToolkitReceipt.v1'
      || receipt.inputSource !== 'public-keyboard-mouse'
      || !Number.isSafeInteger(receipt.startTick) || !Number.isSafeInteger(receipt.endTick)
      || receipt.startTick < route.startTick || receipt.endTick > route.endTick
      || receipt.startTick >= receipt.endTick || receipt.playerEntityId == null) {
    failures.push('public physics-toolkit receipt identity/horizon is incomplete');
    return projection;
  }
  const initial = Array.isArray(receipt.initialHostiles) ? receipt.initialHostiles : [];
  if (!ceresHostileOpportunityPass(initial)) {
    failures.push('toolkit receipt lacks raw live hostile-criminal classification');
  }
  projection.cameraReposition = validateToolkitCameraReposition(receipt, route, failures);
  const initialByEntity = new Map();
  const initialRecordIds = new Set();
  for (const row of initial) {
    if (!row || row.entityId == null || !String(row.worldRecordId || '')
        || initialByEntity.has(row.entityId) || initialRecordIds.has(row.worldRecordId)) continue;
    initialByEntity.set(row.entityId, row.worldRecordId);
    initialRecordIds.add(row.worldRecordId);
  }
  if (initialByEntity.size < 1 || initialByEntity.size !== initial.length) {
    failures.push('toolkit receipt lacks unique durable initial Throughline hostiles');
  }
  const events = Array.isArray(receipt.events) ? receipt.events : [];
  const trace = Array.isArray(receipt.combatTrace) ? receipt.combatTrace : [];
  if (events.some((event, index) => !Number.isSafeInteger(event?.tick)
      || !Number.isSafeInteger(event?.seq) || event.seq < 1
      || (index > 0 && event.seq <= events[index - 1].seq)
      || (index > 0 && event.tick < events[index - 1].tick)
      || event.tick < receipt.startTick || event.tick > receipt.endTick)) {
    failures.push('toolkit bus events escape the owned receipt horizon');
  }
  if (trace.some((event, index) => !Number.isSafeInteger(event?.tick)
      || !Number.isSafeInteger(event?.seq) || event.seq < 1
      || (index > 0 && event.seq <= trace[index - 1].seq)
      || (index > 0 && event.tick < trace[index - 1].tick)
      || event.tick < receipt.startTick || event.tick > receipt.endTick)) {
    failures.push('toolkit combat trace escapes the owned receipt horizon');
  }
  const targetMatchesInitial = (event) => initialByEntity.has(event?.targetId)
    && event.targetWorldRecordId === initialByEntity.get(event.targetId);
  const findAfter = (startIndex, predicate) => {
    for (let index = Math.max(0, startIndex + 1); index < events.length; index += 1) {
      if (predicate(events[index])) return index;
    }
    return -1;
  };
  const attachedIndex = findAfter(-1, (event) => event.event === 'tether:attached'
    && event.actorId === receipt.playerEntityId && targetMatchesInitial(event)
    && String(event.attachmentId || ''));
  const attached = events[attachedIndex];
  const latchedIndex = findAfter(attachedIndex, (event) => event.event === 'tether:latched'
    && event.targetId === attached?.targetId && targetMatchesInitial(event)
    && event.previewMatched === true);
  const brokenIndex = findAfter(latchedIndex, (event) => event.event === 'tether:broken'
    && event.actorId === receipt.playerEntityId && event.targetId === attached?.targetId
    && event.attachmentId === attached?.attachmentId && event.reason === 'tether_cut');
  const cutIndex = findAfter(brokenIndex, (event) => event.event === 'tether:cut'
    && event.targetId === attached?.targetId);
  const releasedIndex = findAfter(cutIndex, (event) => event.event === 'tether:released'
    && event.targetId === attached?.targetId);
  if (attachedIndex < 0 || latchedIndex < 0 || brokenIndex < 0
      || cutIndex < 0 || releasedIndex < 0) {
    failures.push('Massline lacks an ordered attach/latch/manual-cut/release receipt on an initial hostile');
  }

  const deployedSeedIndex = findAfter(-1, (event) => event.event === 'massSeed:deployed'
    && event.ownerId === receipt.playerEntityId && event.seedId != null);
  const lockedSeedIndex = findAfter(deployedSeedIndex, (event) => event.event === 'massSeed:locked'
    && event.seedId === events[deployedSeedIndex]?.seedId);
  if (deployedSeedIndex < 0 || lockedSeedIndex < 0) {
    failures.push('Mass Seed lacks an ordered player deploy/same-seed lock receipt');
  }
  const repulsorIndex = findAfter(-1, (event) => event.event === 'fields:deployed'
    && event.kind === 'repulsor' && event.sourceOwnerId === receipt.playerEntityId);
  if (repulsorIndex < 0) failures.push('Repulsor lacks an exact player-owned deployment receipt');

  const damageTargetByWeapon = new Map();
  const damageTickByWeapon = new Map();
  for (const weaponId of CERES_TOOLKIT_WEAPON_IDS) {
    const fireIndex = findAfter(-1, (event) => event.event === 'combat:fire'
      && event.ownerId === receipt.playerEntityId && event.weaponId === weaponId);
    const hitIndex = findAfter(fireIndex, (event) => event.event === 'projectile:hit'
      && event.ownerId === receipt.playerEntityId && event.weaponId === weaponId
      && targetMatchesInitial(event));
    const hit = events[hitIndex];
    const damageIndex = findAfter(fireIndex, (event) => event.event === 'combat:damage'
      && event.attackerId === receipt.playerEntityId && event.weaponId === weaponId
      && event.targetId === hit?.targetId && targetMatchesInitial(event));
    const damage = events[damageIndex];
    if (fireIndex < 0 || hitIndex < 0 || damageIndex < 0
        || !(fireIndex < damageIndex && damageIndex < hitIndex)
        || damage?.tick !== hit?.tick) {
      failures.push(`${weaponId} lacks ordered player fire/hit/damage receipts on an initial hostile`);
    } else {
      damageTargetByWeapon.set(weaponId, hit.targetId);
      damageTickByWeapon.set(weaponId, damage.tick);
      projection.targetRecordIds.push(initialByEntity.get(hit.targetId));
    }
  }
  const gravityTarget = damageTargetByWeapon.get(CERES_GRAVITY_MARKER_WEAPON_ID);
  const gravityDamageTick = damageTickByWeapon.get(CERES_GRAVITY_MARKER_WEAPON_ID);
  const gravityStatusIndex = findAfter(-1, (event) => event.event === 'combat:statusApplied'
      && event.attackerId === receipt.playerEntityId && event.targetId === gravityTarget
      && event.statusId === 'status_gravity_marked'
      && Number.isSafeInteger(gravityDamageTick) && event.tick >= gravityDamageTick);
  if (gravityStatusIndex < 0) {
    failures.push('Gravity Marker lacks a truthful player-owned gravity status receipt');
  }
  const momentumTarget = damageTargetByWeapon.get(CERES_MOMENTUM_SINK_WEAPON_ID);
  const momentumDamageTick = damageTickByWeapon.get(CERES_MOMENTUM_SINK_WEAPON_ID);
  const momentumStatusIndex = findAfter(-1, (event) => event.event === 'combat:statusApplied'
      && event.attackerId === receipt.playerEntityId && event.targetId === momentumTarget
      && event.statusId === 'status_momentum_sink'
      && Number.isSafeInteger(momentumDamageTick) && event.tick >= momentumDamageTick);
  if (momentumStatusIndex < 0) {
    failures.push('Momentum Sink lacks a truthful player-owned status receipt');
  }
  const concussionTarget = damageTargetByWeapon.get(CERES_CONCUSSION_WEAPON_ID);
  const concussionDamageTick = damageTickByWeapon.get(CERES_CONCUSSION_WEAPON_ID);
  const concussionImpulse = trace.find((event) => event?.kind === 'physics.impulse'
    && event.actorId === receipt.playerEntityId && event.targetId === concussionTarget
    && event.weaponId === CERES_CONCUSSION_WEAPON_ID && event.provenance === 'concussion_slug'
    && Number.isSafeInteger(concussionDamageTick) && event.tick >= concussionDamageTick
    && finiteXZ(event.impulse) && Math.hypot(event.impulse.x, event.impulse.z) > EPSILON);
  if (!concussionImpulse) failures.push('Concussion lacks a nonzero concussion_slug impulse receipt');
  const momentumStatusTick = events[momentumStatusIndex]?.tick;
  const momentumFrame = trace.find((event) => event?.kind === 'momentumSink.frameBound'
    && event.actorId === receipt.playerEntityId && event.targetId === momentumTarget
    && event.frameKind === 'attacker_velocity'
    && Number.isSafeInteger(momentumStatusTick) && event.tick >= momentumStatusTick
    && finiteXZ(event.frameVelocity));
  if (!momentumFrame) failures.push('Momentum Sink lacks a finite attacker_velocity frame receipt');

  projection.destroyedRecordIds = sortedStrings(receipt.destroyedRecordIds);
  if (projection.destroyedRecordIds.length < 1
      || projection.destroyedRecordIds.some((recordId) => !initialRecordIds.has(recordId))) {
    failures.push('toolkit tombstone is absent or does not belong to an initial Throughline hostile');
  }
  const playerOwnedKilledRecordIds = sortedStrings(events.filter((event) => (
    event?.event === 'entity:killed'
      && event.killerId === receipt.playerEntityId
      && initialByEntity.has(event.entityId)
      && event.targetWorldRecordId === initialByEntity.get(event.entityId)
  )).map((event) => event.targetWorldRecordId));
  for (const recordId of projection.destroyedRecordIds) {
    if (!playerOwnedKilledRecordIds.includes(recordId)) {
      failures.push(`toolkit tombstone ${recordId} lacks an exact player-owned entity:killed receipt`);
    }
  }
  projection.targetRecordIds = sortedStrings(projection.targetRecordIds);
  return projection;
}

function validateToolkitCameraReposition(receipt, route, failures) {
  const camera = receipt?.cameraReposition;
  const projection = {
    playerEntityId: camera?.playerEntityId ?? null,
    anchorEntityId: camera?.anchorEntityId ?? null,
    anchorImpactTick: camera?.anchorImpactTick ?? null,
  };
  if (!camera || camera.pass !== true || camera.source !== 'public-flight-controls'
      || camera.reason !== 'fixed-camera-hostile-acquisition'
      || camera.playerEntityId !== receipt.playerEntityId || camera.anchorEntityId == null
      || !Number.isSafeInteger(camera.anchorImpactTick)
      || !Number.isSafeInteger(camera.startTick) || !Number.isSafeInteger(camera.movementEndTick)
      || !Number.isSafeInteger(camera.endTick)
      || camera.anchorImpactTick < route.startTick || camera.anchorImpactTick > camera.startTick
      || camera.startTick < route.startTick || camera.startTick >= camera.movementEndTick
      || camera.movementEndTick > camera.endTick || camera.endTick !== receipt.startTick
      || camera.endTick > route.endTick) {
    failures.push('toolkit camera reposition identity/order is incomplete');
    return projection;
  }
  const expectedWaypoints = planCeresThroughlineToolkitReposition().waypoints.map((waypoint) => ({
    targetId: waypoint.targetId,
    targetName: waypoint.targetName,
    targetPos: waypoint.targetPos,
    arrivalRadiusWU: waypoint.arrivalRadiusWU,
    minRemainingTicks: waypoint.minRemainingTicks,
    allowBoost: waypoint.allowBoost,
  }));
  const actualWaypoints = (Array.isArray(camera.waypoints) ? camera.waypoints : []).map((waypoint) => ({
    targetId: waypoint?.targetId,
    targetName: waypoint?.targetName,
    targetPos: waypoint?.targetPos,
    arrivalRadiusWU: waypoint?.arrivalRadiusWU,
    minRemainingTicks: waypoint?.minRemainingTicks,
    allowBoost: waypoint?.allowBoost,
  }));
  if (stableJson(actualWaypoints) !== stableJson(expectedWaypoints)) {
    failures.push('toolkit camera reposition changed its exact public waypoint contract');
  }
  const receipts = Array.isArray(camera.receipts) ? camera.receipts : [];
  if (receipts.length !== expectedWaypoints.length || receipts.some((row, index) => (
    !Number.isSafeInteger(row?.tick)
      || row.tick < camera.startTick || row.tick > camera.movementEndTick
      || (index > 0 && row.tick < receipts[index - 1].tick)
      || !Number.isFinite(Number(row.distanceWU))
      || Number(row.distanceWU) > expectedWaypoints[index].arrivalRadiusWU
      || !Number.isFinite(Number(row.speed)) || Number(row.speed) > 1
      || row.playerAlive !== true || row.mode !== 'flight'
  )) || receipts.at(-1)?.tick !== camera.movementEndTick) {
    failures.push('toolkit camera reposition lacks settled ordered waypoint receipts');
  }
  const capture = camera.impactCapture;
  const impacts = camera.impacts;
  if (!capture || !Array.isArray(impacts)
      || !Number.isSafeInteger(capture.startTick) || capture.startTick !== camera.startTick
      || !Number.isSafeInteger(capture.endTick) || capture.endTick !== camera.endTick
      || !Number.isSafeInteger(capture.startSeq) || capture.startSeq < 1
      || capture.startSeq !== camera.impactCaptureStartSeq
      || !Number.isSafeInteger(capture.endSeq) || capture.endSeq < capture.startSeq - 1) {
    failures.push('toolkit camera reposition lacks bounded player-impact capture authority');
    return projection;
  }
  if (impacts.some((impact, index) => !Number.isSafeInteger(impact?.seq) || impact.seq < 1
      || impact.seq < capture.startSeq || impact.seq > capture.endSeq
      || !Number.isSafeInteger(impact?.tick)
      || impact.tick < camera.startTick || impact.tick > camera.endTick
      || (index > 0 && impact.seq <= impacts[index - 1].seq)
      || impact.event !== 'physics:impact'
      || !((impact.aId === camera.playerEntityId && impact.bId === camera.anchorEntityId)
        || (impact.bId === camera.playerEntityId && impact.aId === camera.anchorEntityId)))) {
    failures.push('toolkit camera reposition contains a non-anchor player impact');
  }
  return projection;
}

function validateObservationArtifactBindings(
  observations,
  authority,
  artifacts,
  runtimeKind,
  failures,
) {
  const binding = observations.artifactBindings;
  if (!binding || binding.allVerified !== true
      || binding.candidateDigest !== authority?.candidateDigest
      || binding.runtimeKind !== runtimeKind) {
    failures.push('observation artifact binding is incomplete');
    return;
  }
  const required = Array.isArray(binding.requiredArtifacts) ? binding.requiredArtifacts : [];
  const paths = new Set();
  const kinds = new Set();
  let pocketScreenshots = 0;
  for (const descriptor of required) {
    validateArtifactDescriptor(descriptor, 'required observation artifact', failures);
    if (paths.has(descriptor?.path)) failures.push('required observation artifact path is duplicated');
    paths.add(descriptor?.path);
    kinds.add(descriptor?.kind);
    if (descriptor?.kind === 'pocket-screenshot') pocketScreenshots += 1;
    if (!Array.isArray(artifacts) || !artifacts.some((entry) => sameArtifact(entry, descriptor))) {
      failures.push(`required observation artifact ${descriptor?.path || 'unknown'} is not verified`);
    }
    if (!artifactPathWithinRoot(descriptor?.path, authority?.artifactRoot)) {
      failures.push(`required observation artifact ${descriptor?.path || 'unknown'} escapes its runtime root`);
    }
  }
  for (const kind of CERES_REQUIRED_ARTIFACT_KINDS) {
    if (!kinds.has(kind)) failures.push(`required ${kind} artifact is missing`);
  }
  if (pocketScreenshots < CERES_FIVE_MINUTE_POCKET_IDS.length) {
    failures.push('four pocket screenshots are required');
  }
  if (!required.some((entry) => entry.kind === 'accessibility-screenshot'
      && /21-reduced-motion-flash\.png$/i.test(entry.path))) {
    failures.push('reduced-motion/reduced-flash screenshot is missing');
  }
  if (!required.some((entry) => entry.kind === 'accessibility-screenshot'
      && /20-accessibility-default\.png$/i.test(entry.path))) {
    failures.push('matched default accessibility screenshot is missing');
  }
}

function validateObservationCleanup(observations, authority, artifacts, cleanup, failures) {
  const expectation = observations.cleanupExpectations;
  const receipt = expectation?.receipt;
  const runtimeKind = observations.artifactBindings?.runtimeKind;
  const profileRequired = runtimeKind === 'electron';
  const expectedPortKinds = profileRequired ? ['app'] : ['app', 'debug'];
  if (!expectation || expectation.allOwnedProcessesExited !== true
      || !Array.isArray(expectation.aliveOwnedPids) || expectation.aliveOwnedPids.length !== 0
      || expectation.portsClosed !== true
      || expectation.profileRequired !== profileRequired
      || (profileRequired ? expectation.profileRemoved !== true : expectation.profileRemoved != null)
      || !receipt || receipt.schema !== 'spaceface.ceresFiveMinuteCleanup.v1'
      || receipt.runtimeKind !== runtimeKind
      || receipt.candidateDigest !== authority?.candidateDigest
      || receipt.worktreeDigest !== authority?.worktree?.digest) {
    failures.push('candidate-bound cleanup expectation is incomplete');
  }
  const receiptArtifact = receipt?.artifactIdentity;
  if (!receiptArtifact || receiptArtifact.kind !== 'cleanup-receipt'
      || !Array.isArray(artifacts)
      || !artifacts.some((entry) => sameArtifact(entry, receiptArtifact))) {
    failures.push('cleanup receipt artifact identity is not verified');
  }
  const ports = Array.isArray(cleanup?.ports) ? cleanup.ports : [];
  const portKinds = ports.map((entry) => entry?.kind).sort();
  const expectedKinds = [...expectedPortKinds].sort();
  const profileValid = profileRequired
    ? cleanup?.profileRequired === true && cleanup?.profileRemoved === true
      && cleanup?.profile?.required === true && cleanup?.profile?.removed === true
      && !!String(cleanup?.profile?.path || '')
    : cleanup?.profileRequired === false && cleanup?.profileRemoved == null
      && cleanup?.profile?.required === false && cleanup?.profile?.removed == null
      && cleanup?.profile?.path == null;
  if (!cleanup || cleanup.pass !== true || cleanup.ownedProcessesExited !== true
      || cleanup.portsClosed !== true || !profileValid
      || cleanup.pageClosed !== true || cleanup.runtimeClosed !== true || cleanup.serverClosed !== true
      || !Array.isArray(cleanup.ownedPids) || cleanup.ownedPids.length < 1
      || !Array.isArray(cleanup.aliveOwnedPids) || cleanup.aliveOwnedPids.length !== 0
      || stableJson(portKinds) !== stableJson(expectedKinds)
      || ports.some((entry) => !Number.isSafeInteger(entry?.port) || entry.port <= 0
        || entry.closed !== true)
      || stableJson(cleanup.receipt) !== stableJson(receipt)) {
    failures.push('runtime cleanup receipt does not match the observation contract');
  }
}

function validateAccessibilityCensus(snapshot, { reduced }, failures) {
  if (!snapshot || !Number.isSafeInteger(snapshot.tick) || snapshot.playerAlive !== true) {
    failures.push(`${reduced ? 'reduced' : 'default'} accessibility checkpoint is incomplete`);
    return;
  }
  compareSortedIds(snapshot.actorSlotIds, CERES_FIVE_MINUTE_ACTOR_SLOT_IDS,
    `${reduced ? 'reduced' : 'default'} accessibility actors`, failures);
  compareSortedIds(snapshot.objectSlotIds, CERES_FIVE_MINUTE_OBJECT_SLOT_IDS,
    `${reduced ? 'reduced' : 'default'} accessibility objects`, failures);
  compareSortedIds(snapshot.collisionAnchorSlotIds, CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS,
    `${reduced ? 'reduced' : 'default'} accessibility anchors`, failures);
  if (snapshot.playerEntityId == null || !finiteXZ(snapshot.playerPos) || !finiteXZ(snapshot.playerVel)
      || !Number.isFinite(snapshot.playerRot) || !Number.isFinite(snapshot.cameraZoomWU)
      || !Array.isArray(snapshot.activityIdentities)
      || snapshot.activityIdentities.length !== CERES_FIVE_MINUTE_ACTOR_SLOT_IDS.length
        + CERES_FIVE_MINUTE_OBJECT_SLOT_IDS.length
        + CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS.length
      || !Array.isArray(snapshot.hostileWorldRecordIds)) {
    failures.push(`${reduced ? 'reduced' : 'default'} accessibility scene identity is incomplete`);
  }
  if (reduced) {
    if (snapshot.motionPreference !== 'reduce' || snapshot.motionReduce !== true
        || snapshot.flashReduce !== true) failures.push('reduced accessibility settings are incomplete');
  } else if (snapshot.motionPreference === 'reduce' || snapshot.motionReduce === true
      || snapshot.flashReduce === true) {
    failures.push('default accessibility checkpoint is already reduced');
  }
}

function canonicalActorRecords(rows, failures, label) {
  if (!Array.isArray(rows) || rows.length !== CERES_FIVE_MINUTE_ACTOR_SLOT_IDS.length) {
    failures.push(`${label} actor record census is incomplete`);
    return [];
  }
  const projected = rows.map((row) => ({
    slotId: String(row?.slotId || ''),
    worldRecordId: String(row?.worldRecordId || ''),
    jobId: row?.jobId == null ? null : String(row.jobId),
  })).sort((left, right) => left.slotId.localeCompare(right.slotId));
  compareSortedIds(projected.map((row) => row.slotId), CERES_FIVE_MINUTE_ACTOR_SLOT_IDS,
    `${label} actor slots`, failures);
  if (new Set(projected.map((row) => row.worldRecordId)).size !== projected.length
      || projected.some((row) => !row.worldRecordId
        || (row.slotId !== 'ceres_cinder_service_hauler' && !row.jobId))) {
    failures.push(`${label} actor record/job identity is invalid`);
  }
  return projected;
}

function canonicalObjectRecords(rows, failures, label) {
  if (!Array.isArray(rows) || rows.length !== CERES_FIVE_MINUTE_OBJECT_SLOT_IDS.length) {
    failures.push(`${label} object record census is incomplete`);
    return [];
  }
  const projected = rows.map((row) => ({
    slotId: String(row?.slotId || ''),
    entityId: row?.entityId ?? null,
    worldRecordId: row?.worldRecordId == null ? null : String(row.worldRecordId),
  })).sort((left, right) => left.slotId.localeCompare(right.slotId));
  compareSortedIds(projected.map((row) => row.slotId), CERES_FIVE_MINUTE_OBJECT_SLOT_IDS,
    `${label} object slots`, failures);
  if (projected.some((row) => row.entityId == null)) {
    failures.push(`${label} object entity identity is invalid`);
  }
  return projected;
}

function canonicalAnchorRecords(rows, failures, label) {
  if (!Array.isArray(rows) || rows.length !== CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS.length) {
    failures.push(`${label} anchor census is incomplete`);
    return [];
  }
  const projected = rows.map((row) => ({
    slotId: String(row?.slotId || ''),
    entityId: row?.entityId ?? null,
    collides: row?.collides === true,
  })).sort((left, right) => left.slotId.localeCompare(right.slotId));
  compareSortedIds(projected.map((row) => row.slotId), CERES_FIVE_MINUTE_COLLISION_ANCHOR_SLOT_IDS,
    `${label} anchor slots`, failures);
  if (projected.some((row) => row.entityId == null || row.collides !== true)) {
    failures.push(`${label} anchor identity/collider is invalid`);
  }
  return projected;
}

function compareSortedIds(actual, expected, label, failures) {
  const left = Array.isArray(actual) ? actual.map(String).sort() : null;
  const right = [...expected].map(String).sort();
  if (!left || stableJson(left) !== stableJson(right)) {
    failures.push(`${label} must equal the exact canonical id set`);
  }
}

function sortedStrings(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || '')).filter(Boolean).sort();
}

function artifactPathWithinRoot(filePath, artifactRoot) {
  const file = String(filePath || '').replaceAll('\\', '/').replace(/^\.\//, '');
  const root = String(artifactRoot || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return !!root && file.startsWith(`${root}/`) && !file.split('/').includes('..');
}

function finiteXZ(value) {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.z);
}

function compareExactOrderedIds(actual, expected, label, failures) {
  if (!Array.isArray(actual) || stableJson(actual) !== stableJson(expected)) {
    failures.push(`${label} must equal the exact canonical ordered id set`);
  }
}

function comparePairValue(left, right, label, failures) {
  if (left !== right) failures.push(`paired ${label} mismatch`);
}

function sameArtifact(left, right) {
  return !!left && !!right
    && left.kind === right.kind
    && left.path === right.path
    && left.bytes === right.bytes
    && left.sha256 === right.sha256;
}

function finiteInteger(value, label) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a finite safe integer`);
  return value;
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}
