import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  accessibilityCheckpointIdentity,
  canonicalGapProjection,
  ceresHostileOpportunityPass,
  ceresLawfulServiceClassificationPass,
  chooseCeresPocketApproachAction,
  countsTowardCeresPocketVisibility,
  createAccessibilityMatchedCheckpoint,
  deriveZeroVisibleActivityIntervals,
  drivePublicToPocketAnchor,
  evaluateCeresFiveMinutePair,
  evaluateCeresFiveMinuteRuntime,
  evaluateCeresHumanReview,
  evaluateZeroVisibilityMetric,
  gapMetricDigest,
  normalizeCeresTrace,
  projectCeresActivityFrame,
  settleCeresPocketApproach,
  validateCeresPilotSources,
  validatePublicInputReceipt,
} from '../scripts/lib/ceresFiveMinuteAcceptance.mjs';
import { ZONE_CERES_THROUGHLINE } from '../src/data/authoredPlaces.js';
import {
  CERES_ACTIVITY_POCKETS_BY_ID,
  CERES_REFERENCE_ACCEPTANCE_ENTRY,
} from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const RUNTIME_SCHEMA = 'spaceface.ceresFiveMinuteRuntimeEvidence.v1';
const REVIEW_SCHEMA = 'spaceface.ceresFiveMinuteHumanReview.v1';
const TICK_RATE_HZ = 60;
const FIXED_TICKS = 18_000;
const SIMULATION_SECONDS = 300;
const START_TICK = 600;
const END_TICK = START_TICK + FIXED_TICKS;
const SOURCE_CANDIDATE_DIGEST = digest('a');
const WORKTREE_DIGEST = digest('d');
const GIT_HEAD = '5a67a2368368fda5b06fe5aeb11d9bb7818cc153';
const ARTIFACT_ROOT_PREFIX = '.devshots/physics-as-spectacle/ceres-five-minute';

const ACTOR_SLOT_IDS = Object.freeze([
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

const OBJECT_SLOT_IDS = Object.freeze([
  'ceres_refinery_cargo_pod',
  'ceres_refinery_disabled_hull',
  'ceres_seam_ore_clast',
  'ceres_ambush_distress_beacon',
  'ceres_ambush_bait_wreck',
  'ceres_cathedral_grave_shard',
]);

const COLLISION_ANCHOR_SLOT_IDS = Object.freeze([
  'ceres_throughline_collision_anchor',
  'ceres_ambush_collision_anchor',
]);

const PLAYER_ENTITY_ID = 1;
const TOOLKIT_HOSTILES = Object.freeze([
  Object.freeze({
    entityId: 701,
    worldRecordId: 'wr_npc_b64ae208',
    ceresActivityAmbush: true,
    team: 1,
    factionId: 'faction_reach',
    lawful: false,
    passive: false,
    roe: 'weapons_free',
    spawnContext: 'zone_hostile',
    zoneId: 'zone_ceres_ambush',
    squadId: 'zone_ceres_ambush',
  }),
  Object.freeze({
    entityId: 702,
    worldRecordId: 'wr_npc_cc9f0184',
    ceresActivityAmbush: true,
    team: 1,
    factionId: 'faction_reach',
    lawful: false,
    passive: false,
    roe: 'weapons_free',
    spawnContext: 'zone_hostile',
    zoneId: 'zone_ceres_ambush',
    squadId: 'zone_ceres_ambush',
  }),
]);
const TOOLKIT_WEAPON_IDS = Object.freeze([
  'wpn_concussion_cannon_m',
  'wpn_gravity_marker_s',
  'wpn_momentum_sink_s',
]);
const POCKET_NAVIGATION = Object.freeze({
  ceres_refinery_pocket: null,
  ceres_working_seam: Object.freeze({
    label: 'Belt Outpost',
    identity: 'station_beltout',
    entityId: 3_102,
    localPos: Object.freeze({ x: 780, z: -940 }),
  }),
  ceres_ambush_run: Object.freeze({
    label: 'Throughline Weigh Beacon',
    identity: 'poi_ceres_throughline',
    entityId: 3_103,
    localPos: CERES_ACTIVITY_POCKETS_BY_ID.ceres_ambush_run.activityAnchor.localPos,
  }),
  ceres_cathedral_grave: Object.freeze({
    label: 'Wreck Cathedral',
    identity: 'world_site_wreck_cathedral',
    entityId: 3_104,
    localPos: CERES_ACTIVITY_POCKETS_BY_ID.ceres_cathedral_grave.activityAnchor.localPos,
  }),
});
const AMBUSH_ZONE_GLOBAL = Object.freeze(sectorLocalToGlobalForSector(
  ZONE_CERES_THROUGHLINE.center,
  CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
));

test('raw lawful/service and hostile-opportunity classifiers fail closed on live identity', () => {
  const actors = observationFrame(0, START_TICK, false).actorStates;
  assert.equal(ceresLawfulServiceClassificationPass(actors), true);
  for (const [label, mutate] of [
    ['lawful actor becomes hostile team', (rows) => { rows[0].team = 1; }],
    ['lawful actor becomes active fire', (rows) => { rows[0].passive = false; }],
    ['lawful actor carries weapons-free ROE', (rows) => { rows[0].roe = 'weapons_free'; }],
    ['authored escort loses lawful authority', (rows) => {
      rows.find((row) => row.slotId === 'ceres_ambush_escort').lawful = false;
    }],
    ['service loses its exact hook', (rows) => {
      rows.find((row) => row.slotId === 'ceres_cinder_service_hauler').serviceHookId = null;
    }],
    ['service acquires a fabricated job', (rows) => {
      rows.find((row) => row.slotId === 'ceres_cinder_service_hauler').jobId = 'job:fake';
    }],
  ]) {
    const candidate = structuredClone(actors);
    mutate(candidate);
    assert.equal(ceresLawfulServiceClassificationPass(candidate), false, label);
  }

  const hostiles = TOOLKIT_HOSTILES.map((row) => ({ ...row }));
  assert.equal(ceresHostileOpportunityPass(hostiles), true);
  for (const [label, mutate] of [
    ['hostile loses Reach faction authority', (rows) => { rows[0].factionId = 'faction_free'; }],
    ['hostile becomes passive', (rows) => { rows[0].passive = true; }],
    ['hostile loses weapons-free ROE', (rows) => { rows[0].roe = 'hold_fire'; }],
    ['hostile becomes lawful', (rows) => { rows[0].lawful = true; }],
    ['hostile loses adopted cohort marker', (rows) => { rows[0].ceresActivityAmbush = false; }],
  ]) {
    const candidate = structuredClone(hostiles);
    mutate(candidate);
    assert.equal(ceresHostileOpportunityPass(candidate), false, label);
  }

  assert.equal(countsTowardCeresPocketVisibility('ceres_cinder_service_hauler'), false);
  assert.equal(countsTowardCeresPocketVisibility('ceres_throughline_collision_anchor'), true);
});

test('zero-visible intervals are re-derived and deliberately carry no numeric pass threshold', () => {
  for (const durationS of [1, 200]) {
    const samples = visibilitySamples(durationS);
    const intervals = deriveZeroVisibleActivityIntervals(samples, horizon());
    assert.equal(intervals.length, 1, `${durationS}s fixture should contain one empty interval`);

    const interval = intervals[0];
    assert.equal(interval.startTick, START_TICK + TICK_RATE_HZ);
    assert.equal(interval.endTick, START_TICK + TICK_RATE_HZ + durationS * TICK_RATE_HZ);
    assert.equal(interval.durationTicks, durationS * TICK_RATE_HZ);
    assert.equal(interval.durationS, durationS);
    assert.deepEqual(interval.adjacentPocketTransition, {
      fromPocketId: 'ceres_refinery_pocket',
      toPocketId: 'ceres_working_seam',
    });

    const metric = recordedGapMetric(canonicalGapProjection(interval));
    assert.equal(metric.maxZeroVisibleActivityS, durationS);
    assert.equal(metric.intervalStartTick, interval.startTick);
    assert.equal(metric.intervalEndTick, interval.endTick);
    assert.deepEqual(metric.adjacentPocketTransition, interval.adjacentPocketTransition);
    assert.match(metric.metricDigest, /^[a-f0-9]{64}$/);

    const result = evaluateZeroVisibilityMetric({
      samples,
      bounds: horizon(),
      recordedMetric: metric,
    });
    assert.equal(result.pass, true, `${durationS}s is technically valid: ${result.failures?.join('; ')}`);
  }
});

test('gap metric digest binds exact interval and adjacent-pocket transition identity', () => {
  const interval = deriveZeroVisibleActivityIntervals(visibilitySamples(1), horizon())[0];
  const projection = canonicalGapProjection(interval);
  const baseline = gapMetricDigest(projection);
  assert.match(baseline, /^[a-f0-9]{64}$/);
  assert.equal(gapMetricDigest(structuredClone(projection)), baseline);

  const changedEnd = structuredClone(projection);
  changedEnd.intervalEndTick += 1;
  assert.notEqual(gapMetricDigest(changedEnd), baseline);

  const changedTransition = structuredClone(projection);
  changedTransition.adjacentPocketTransition.toPocketId = 'ceres_ambush_run';
  assert.notEqual(gapMetricDigest(changedTransition), baseline);
});

test('missing, nonfinite, and internally inconsistent visibility metrics fail closed', () => {
  const samples = visibilitySamples(1);
  const projection = canonicalGapProjection(
    deriveZeroVisibleActivityIntervals(samples, horizon())[0],
  );
  const mutations = [
    ['missing metric', () => null],
    ['nonfinite maximum', (metric) => { metric.maxZeroVisibleActivityS = Number.NaN; }],
    ['wrong maximum', (metric) => { metric.maxZeroVisibleActivityS = 2; }],
    ['wrong interval start', (metric) => { metric.intervalStartTick += 60; }],
    ['wrong interval end', (metric) => { metric.intervalEndTick += 60; }],
    ['reversed interval', (metric) => {
      metric.intervalStartTick = metric.intervalEndTick + 1;
    }],
    ['wrong transition source', (metric) => {
      metric.adjacentPocketTransition.fromPocketId = 'ceres_cathedral_grave';
    }],
    ['wrong transition destination', (metric) => {
      metric.adjacentPocketTransition.toPocketId = 'ceres_ambush_run';
    }],
    ['missing transition', (metric) => { delete metric.adjacentPocketTransition; }],
  ];

  for (const [label, mutate] of mutations) {
    let altered = structuredClone(projection);
    const replacement = mutate(altered);
    if (replacement === null) altered = null;
    const recordedMetric = altered ? recordedGapMetric(altered) : altered;
    const result = evaluateZeroVisibilityMetric({
      samples,
      bounds: horizon(),
      recordedMetric,
    });
    assert.equal(result.pass, false, label);
    assert.ok(result.failures.length > 0, `${label} must explain the failure`);
  }

  const badDigest = recordedGapMetric(projection);
  badDigest.metricDigest = digest('9');
  assert.equal(evaluateZeroVisibilityMetric({
    samples,
    bounds: horizon(),
    recordedMetric: badDigest,
  }).pass, false, 'a digest cannot be reused for different metric bytes');
});

test('runtime evidence requires the exact five-minute horizon and the 9/6/2 Ceres census', () => {
  for (const runtimeKind of ['browser', 'electron']) {
    const document = runtimeFixture(runtimeKind);
    assert.equal(document.r7CrimeLoopClaim, false);
    assert.equal(document.r8Claim, false);
    assert.equal(document.g0ToG7Claim, false);
    assert.equal(document.gpu.available, true);
    assert.ok(document.gpu.vendor.trim());
    assert.doesNotMatch(`${document.gpu.vendor} ${document.gpu.renderer}`,
      /SwiftShader|llvmpipe|software/i);
    assert.equal(document.authority.artifactRoot, `${ARTIFACT_ROOT_PREFIX}/${runtimeKind}`);
    assert.equal(document.artifactIdentity.kind, 'ceres-five-minute-artifact-set');
    if (runtimeKind === 'electron') {
      assert.deepEqual(document.cleanup.profile, {
        required: true,
        path: '.tmp/ceres-five-minute/electron',
        removed: true,
      });
    } else {
      assert.deepEqual(document.cleanup.profile, {
        required: false,
        path: null,
        removed: null,
      });
    }
    const result = evaluateCeresFiveMinuteRuntime(document, { runtimeKind });
    assert.equal(result.pass, true, `${runtimeKind}: ${result.failures?.join('; ')}`);
  }

  const mutations = [
    ['17,999 fixed ticks', (doc) => { doc.route.fixedTicks = 17_999; }],
    ['not 300 simulation seconds', (doc) => { doc.route.simulationSeconds = 299.99; }],
    ['horizon end mismatch', (doc) => { doc.route.endTick -= 1; }],
    ['time acceleration', (doc) => { doc.route.timeScale = 2; }],
    ['wrong fixed seed', (doc) => { doc.route.seed = 48; }],
    ['wrong ship', (doc) => { doc.route.shipId = 'ship_kestrel'; }],
    ['wrong loadout', (doc) => { doc.route.loadoutId = 'starter'; }],
    ['wrong camera envelope', (doc) => { doc.route.cameraZoomWU = 145; }],
    ['controller substitution', (doc) => { doc.route.inputMode = 'controller'; }],
    ['eight actors', (doc) => { doc.census.actorSlotIds.pop(); }],
    ['duplicate actor', (doc) => { doc.census.actorSlotIds[8] = doc.census.actorSlotIds[0]; }],
    ['five logical objects', (doc) => { doc.census.objectSlotIds.pop(); }],
    ['one collision anchor', (doc) => { doc.census.collisionAnchorSlotIds.pop(); }],
    ['ambush counted as a lawful actor', (doc) => {
      doc.census.throughlineAmbush.countedInAuthoredActorCensus = true;
    }],
    ['packaged Electron overclaim', (doc) => { doc.packagedElectronClaim = true; }],
    ['controller parity overclaim', (doc) => { doc.controllerParityClaim = true; }],
    ['R7 crime-loop overclaim', (doc) => { doc.r7CrimeLoopClaim = true; }],
    ['missing exact-false R7 claim', (doc) => { delete doc.r7CrimeLoopClaim; }],
    ['R8 showcase overclaim', (doc) => { doc.r8Claim = true; }],
    ['null exact-false R8 claim', (doc) => { doc.r8Claim = null; }],
    ['G0-G7 overclaim', (doc) => { doc.g0ToG7Claim = true; }],
    ['missing exact-false G0-G7 claim', (doc) => { delete doc.g0ToG7Claim; }],
    ['missing hardware GPU receipt', (doc) => { delete doc.gpu; }],
    ['unavailable WebGL', (doc) => { doc.gpu.available = false; }],
    ['missing hardware vendor identity', (doc) => { delete doc.gpu.vendor; }],
    ['empty hardware vendor identity', (doc) => { doc.gpu.vendor = '   '; }],
    ['missing hardware renderer identity', (doc) => { delete doc.gpu.renderer; }],
    ['empty hardware renderer identity', (doc) => { doc.gpu.renderer = ''; }],
    ['software GPU substitution', (doc) => { doc.gpu.renderer = 'Google SwiftShader'; }],
    ['wrong runtime artifact root', (doc) => {
      doc.authority.artifactRoot = '.devshots/ceres-five-minute/browser';
    }],
    ['runtime artifact is not the bound artifact set', (doc) => {
      doc.artifactIdentity.kind = 'ceres-five-minute-runtime-evidence';
    }],
  ];

  for (const [label, mutate] of mutations) {
    const document = runtimeFixture('browser');
    mutate(document);
    const result = evaluateCeresFiveMinuteRuntime(document, { runtimeKind: 'browser' });
    assert.equal(result.pass, false, label);
    assert.ok(result.failures.length > 0, `${label} must explain the failure`);
  }
});

test('runtime machine proof accepts both short and long finite gaps without inventing 12 seconds', () => {
  const oneSecond = runtimeFixture('browser', { gapS: 1 });
  const twoHundredSeconds = runtimeFixture('browser', { gapS: 200 });
  assert.equal(evaluateCeresFiveMinuteRuntime(oneSecond, { runtimeKind: 'browser' }).pass, true);
  assert.equal(evaluateCeresFiveMinuteRuntime(twoHundredSeconds, { runtimeKind: 'browser' }).pass, true,
    'machine truth records 200s but human review decides whether it reads as intentional');

  for (const document of [oneSecond, twoHundredSeconds]) {
    assert.equal(Object.hasOwn(document.activityVisibility, 'maximumAllowedZeroVisibleActivityS'), false);
    assert.equal(Object.hasOwn(document.activityVisibility, 'passThresholdS'), false);
  }
});

test('cleanup treats Browser profile removal as not applicable and Electron profile removal as required', () => {
  const browser = runtimeFixture('browser');
  assert.equal(browser.cleanup.profileRemoved, null);
  assert.equal(browser.cleanup.profileRequired, false);
  assert.equal(browser.cleanup.profile.required, false);
  assert.equal(browser.observations.cleanupExpectations.profileRequired, false);
  assert.equal(browser.observations.cleanupExpectations.profileRemoved, null);

  const electron = runtimeFixture('electron');
  assert.equal(electron.cleanup.profileRemoved, true);
  assert.equal(electron.cleanup.profileRequired, true);
  assert.equal(electron.cleanup.profile.required, true);
  assert.equal(electron.observations.cleanupExpectations.profileRequired, true);
  assert.equal(electron.observations.cleanupExpectations.profileRemoved, true);

  const mutations = [
    ['Browser invents a profile-removal claim', 'browser', (doc) => {
      doc.cleanup.profileRemoved = true;
      doc.cleanup.profile = { required: false, path: null, removed: true };
      doc.observations.cleanupExpectations.profileRemoved = true;
    }],
    ['Electron profile is not required', 'electron', (doc) => {
      doc.cleanup.profileRequired = false;
      doc.cleanup.profile.required = false;
      doc.observations.cleanupExpectations.profileRequired = false;
    }],
    ['Electron profile path is missing', 'electron', (doc) => {
      doc.cleanup.profile.path = null;
    }],
    ['Electron profile was not removed', 'electron', (doc) => {
      doc.cleanup.profileRemoved = false;
      doc.cleanup.profile.removed = false;
      doc.observations.cleanupExpectations.profileRemoved = false;
    }],
    ['Browser debug port cleanup is missing', 'browser', (doc) => {
      doc.cleanup.ports = doc.cleanup.ports.filter((entry) => entry.kind !== 'debug');
    }],
    ['Electron invents a Browser debug-port owner', 'electron', (doc) => {
      doc.cleanup.ports.push({ kind: 'debug', port: 64_412, closed: true });
    }],
    ['owned page remains open', 'browser', (doc) => {
      doc.cleanup.pageClosed = false;
    }],
  ];
  for (const [label, runtimeKind, mutate] of mutations) {
    const document = runtimeFixture(runtimeKind);
    mutate(document);
    assert.equal(evaluateCeresFiveMinuteRuntime(document, { runtimeKind }).pass, false, label);
  }
});

test('runtime evidence requires raw five-minute route observations, not summary pass flags', () => {
  const document = runtimeFixture('browser');
  const observations = document.observations;
  assert.deepEqual(observations.pocketSequence, [
    'ceres_refinery_pocket',
    'ceres_working_seam',
    'ceres_ambush_run',
    'ceres_cathedral_grave',
  ]);
  assert.equal(observations.arrivals.every((entry) => entry.physicalReceipt?.pass === true), true);
  for (const arrival of observations.arrivals) {
    const pocket = CERES_ACTIVITY_POCKETS_BY_ID[arrival.pocketId];
    const targetPos = sectorLocalToGlobalForSector(
      pocket.activityAnchor.localPos,
      CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
    );
    assert.equal(arrival.physicalReceipt.targetId, pocket.activityAnchor.id);
    assert.equal(arrival.physicalReceipt.targetName, pocket.label);
    assert.deepEqual(arrival.physicalReceipt.targetPos, targetPos);
  }
  const seamArrival = observations.arrivals[1].physicalReceipt;
  assert.equal(seamArrival.targetId, 'zone_ceres_belt');
  assert.equal(seamArrival.navigationLabel, 'Belt Outpost');
  assert.equal(seamArrival.navigationTargetIdentity, 'station_beltout');
  assert.equal(observations.completeActivityFrameSequence, true);
  assert.equal(observations.frames[0].tick, START_TICK);
  assert.equal(observations.frames.at(-1).tick, END_TICK);
  assert.ok(observations.frames.at(-1).observedTick < END_TICK);
  assert.equal(
    observations.frames.at(-1).clippedFromObservedTick,
    observations.frames.at(-1).observedTick,
    'a bracketed endpoint must carry only the last in-horizon state, never post-horizon state',
  );
  assert.equal(observations.frames.every((frame) => (
    frame.playerAlive === true
      && frame.sectorId === 'sector_ceres_belt'
      && frame.timeScale === 1
      && frame.actorSlotIds.length === 9
      && frame.objectSlotIds.length === 6
      && frame.collisionAnchorSlotIds.length === 2
  )), true);
  assert.deepEqual(observations.movingJobBuckets.map((bucket) => ({
    startTick: bucket.startTick,
    endTick: bucket.endTick,
    movingJobIds: bucket.movingJobIds,
  })), Array.from({ length: 5 }, (_, bucket) => ({
    startTick: START_TICK + bucket * 3_600,
    endTick: START_TICK + (bucket + 1) * 3_600,
    movingJobIds: ['ceres_job_refinery_freight', 'ceres_job_seam_extraction'],
  })));
  assert.equal(observations.throughlineAmbush.sweep.segmentCrossesZone, true);
  assert.deepEqual(observations.throughlineAmbush.sweep.zone.center, AMBUSH_ZONE_GLOBAL);
  for (const row of observations.throughlineAmbush.sweep.path) {
    const frame = observations.frames.find((entry) => entry.tick === row.tick);
    assert.ok(frame);
    assert.deepEqual(row.pos, frame.playerPos);
  }
  assert.equal(observations.anchorCollision.slotId, 'ceres_throughline_collision_anchor');
  assert.equal(observations.continueProof.hostileTombstonesBefore.length, 1);
  assert.deepEqual(
    observations.continueProof.hostileTombstonesAfter,
    observations.continueProof.hostileTombstonesBefore,
  );
  assert.equal(observations.accessibility.source, 'public-settings-ui');
  assert.equal(observations.accessibility.reduced.motionReduce, true);
  assert.equal(observations.accessibility.reduced.flashReduce, true);
  assert.equal(validatePublicInputReceipt(observations.accessibility.postToggleInputReceipt).pass, true);
  assert.equal(Object.hasOwn(observations.toolkit, 'pass'), false);
  assert.equal(Object.hasOwn(observations.toolkit, 'masslinePressed'), false);
  assert.equal(Object.hasOwn(observations.toolkit, 'massSeedPressed'), false);
  assert.equal(Object.hasOwn(observations.toolkit, 'repulsorPressed'), false);
  assert.equal(Object.hasOwn(observations.toolkit, 'primaryFireAttempted'), false);
  assert.deepEqual(observations.toolkit.initialHostiles, TOOLKIT_HOSTILES);
  assert.deepEqual(observations.toolkit.events.map((entry) => entry.event), [
    'tether:attached',
    'tether:latched',
    'tether:broken',
    'tether:cut',
    'tether:released',
    'massSeed:deployed',
    'massSeed:locked',
    'fields:deployed',
    'combat:fire',
    'combat:damage',
    'projectile:hit',
    'combat:fire',
    'combat:damage',
    'combat:statusApplied',
    'projectile:hit',
    'combat:fire',
    'combat:damage',
    'combat:statusApplied',
    'projectile:hit',
    'entity:killed',
  ]);
  assert.deepEqual(observations.toolkit.combatTrace.map((entry) => entry.kind), [
    'physics.impulse',
    'momentumSink.frameBound',
  ]);
  const destroyedWorldRecordId = observations.toolkit.destroyedRecordIds[0];
  assert.equal(TOOLKIT_HOSTILES.some((hostile) => (
    hostile.worldRecordId === destroyedWorldRecordId
  )), true);
  assert.equal(observations.continueProof.hostileTombstonesAfter.includes(
    destroyedWorldRecordId,
  ), true);
  assert.equal(observations.artifactBindings.requiredArtifacts.length, 9);
  assert.deepEqual(observations.cleanupExpectations.aliveOwnedPids, []);
  assert.equal(evaluateCeresFiveMinuteRuntime(document, { runtimeKind: 'browser' }).pass, true);
});

test('route frame projection retains exact and clipped observer time authority', () => {
  const clipped = projectCeresActivityFrame({
    tick: END_TICK,
    observedTick: END_TICK - 3,
    clippedFromObservedTick: END_TICK - 3,
    simTimeS: SIMULATION_SECONDS,
    observedSimTimeS: SIMULATION_SECONDS - 3 / TICK_RATE_HZ,
    sectorId: 'sector_ceres_belt',
  });
  assert.equal(clipped.tick, END_TICK);
  assert.equal(clipped.observedTick, END_TICK - 3);
  assert.equal(clipped.clippedFromObservedTick, END_TICK - 3);
  assert.equal(clipped.simTimeS, SIMULATION_SECONDS);
  assert.equal(clipped.observedSimTimeS, SIMULATION_SECONDS - 3 / TICK_RATE_HZ);

  const exact = projectCeresActivityFrame({
    tick: END_TICK,
    observedTick: END_TICK,
    simTimeS: SIMULATION_SECONDS,
    observedSimTimeS: SIMULATION_SECONDS,
  });
  assert.equal(exact.clippedFromObservedTick, null);
  assert.equal(exact.observedSimTimeS, SIMULATION_SECONDS);
});

test('matched accessibility producer retains the live public checkpoint tick', () => {
  const snapshot = accessibilitySnapshot({ tick: START_TICK + 12_900 });
  const checkpoint = createAccessibilityMatchedCheckpoint(snapshot);
  assert.equal(checkpoint.tick, snapshot.tick);
  assert.deepEqual(checkpoint.identity, accessibilityCheckpointIdentity(snapshot));
  assert.equal(checkpoint.defaultArtifactName, '20-accessibility-default.png');
  assert.equal(checkpoint.reducedArtifactName, '21-reduced-motion-flash.png');
  assert.equal(checkpoint.captureMethod, 'public-pause-flight-surface-v1');
});

test('accessibility producer pauses before both matched flight-surface captures', () => {
  const librarySource = readFileSync(
    new URL('../scripts/lib/ceresFiveMinuteAcceptance.mjs', import.meta.url),
    'utf8',
  );
  const start = librarySource.indexOf('async function applyPublicReducedAccessibility');
  const end = librarySource.indexOf('async function readAccessibilitySnapshot', start);
  assert.ok(start >= 0 && end > start);
  const producer = librarySource.slice(start, end);
  const pause = producer.indexOf("await page.keyboard.press('Escape')");
  const before = producer.indexOf('const before = await readAccessibilitySnapshot(page)');
  const defaultCapture = producer.indexOf('await screenshot(defaultArtifactName, { flightSurfaceOnly: true })');
  const reduced = producer.indexOf('const reduced = await readAccessibilitySnapshot(page)');
  const reducedCapture = producer.indexOf('await screenshot(reducedArtifactName, { flightSurfaceOnly: true })');
  const resume = producer.indexOf("await page.getByRole('button', { name: 'Resume', exact: true }).click()");
  assert.ok(pause >= 0
    && pause < before
    && before < defaultCapture
    && defaultCapture < reduced
    && reduced < reducedCapture
    && reducedCapture < resume,
  'the fixed clock must remain publicly paused through both matched captures');
});

test('bracketed endpoint conservatively retains the last in-horizon state', () => {
  const trace = normalizeCeresTrace([{
    samples: [
      {
        observedTick: START_TICK,
        simTimeS: 0,
        visibleActivityCount: 2,
        visibleActivityIds: ['ceres_refinery_hauler', 'ceres_refinery_tender'],
        nearestPocketId: 'ceres_refinery_pocket',
      },
      {
        observedTick: END_TICK - 3,
        simTimeS: SIMULATION_SECONDS - 3 / TICK_RATE_HZ,
        visibleActivityCount: 0,
        visibleActivityIds: [],
        nearestPocketId: null,
      },
      {
        observedTick: END_TICK + 3,
        simTimeS: SIMULATION_SECONDS + 3 / TICK_RATE_HZ,
        visibleActivityCount: 2,
        visibleActivityIds: ['ceres_seam_miner', 'ceres_seam_ore_clast'],
        nearestPocketId: 'ceres_working_seam',
      },
    ],
    events: [],
    failures: [],
  }], horizon());
  const terminal = trace.samples.at(-1);
  assert.deepEqual(trace.samples.map((row) => row.tick), [
    START_TICK,
    END_TICK - 3,
    END_TICK,
  ], 'ordinary in-horizon samples must retain their exact ticks');
  assert.equal(terminal.tick, END_TICK);
  assert.equal(terminal.observedTick, END_TICK - 3);
  assert.equal(terminal.clippedFromObservedTick, END_TICK - 3);
  assert.equal(terminal.visibleActivityCount, 0,
    'post-horizon visibility cannot close an in-horizon gap');
  assert.deepEqual(terminal.visibleActivityIds, []);
  assert.equal(trace.bracket.after, END_TICK + 3);
});

test('machine evaluation rejects missing or forged route observations despite top-level pass flags', () => {
  const mutations = [
    ['missing observations', (doc) => { delete doc.observations; }],
    ['wrong pocket order', (doc) => {
      [doc.observations.pocketSequence[1], doc.observations.pocketSequence[2]] =
        [doc.observations.pocketSequence[2], doc.observations.pocketSequence[1]];
    }],
    ['self-labeled arrival without a physical receipt', (doc) => {
      doc.observations.arrivals[1].physicalReceipt = null;
    }],
    ['navigation waypoint substitutes for the Working Seam activity anchor', (doc) => {
      const seam = doc.observations.arrivals[1].physicalReceipt;
      seam.targetId = 'station_beltout';
      seam.targetName = 'Belt Outpost';
      seam.targetPos = structuredClone(seam.navigationTargetPos);
      seam.playerPos = { x: seam.targetPos.x + 24, z: seam.targetPos.z };
    }],
    ['arrival target drifts from its canonical activity anchor', (doc) => {
      doc.observations.arrivals[2].physicalReceipt.targetPos.x += 1;
    }],
    ['forged complete-frame boolean with a missing actor', (doc) => {
      doc.observations.completeActivityFrameSequence = true;
      doc.observations.frames[3].actorSlotIds.pop();
      doc.observations.frames[3].actorStates.pop();
    }],
    ['lawful actor flips to hostile team inside a raw frame', (doc) => {
      doc.observations.frames[3].actorStates[0].team = 1;
    }],
    ['lawful actor flips to weapons-free ROE inside a raw frame', (doc) => {
      doc.observations.frames[3].actorStates[0].roe = 'weapons_free';
    }],
    ['Throughline opportunity is passive despite its summary label', (doc) => {
      doc.observations.throughlineAmbush.hostiles[0].passive = true;
    }],
    ['Throughline opportunity loses Reach faction authority', (doc) => {
      doc.observations.throughlineAmbush.hostiles[0].factionId = 'faction_free';
    }],
    ['external Cinder service masquerades as pocket visibility', (doc) => {
      const frame = doc.observations.frames.find((row) => row.nearestPocketId === 'ceres_working_seam');
      frame.visibleActivityIds = ['ceres_cinder_service_hauler'];
      frame.visibleActivityCount = 1;
    }],
    ['one visible activity substitutes for a two-object pocket checkpoint', (doc) => {
      for (const frame of doc.observations.frames) {
        if (frame.nearestPocketId !== 'ceres_cathedral_grave') continue;
        frame.visibleActivityIds = frame.visibleActivityIds.slice(0, 1);
        frame.visibleActivityCount = 1;
      }
    }],
    ['activity visibility semantics are missing', (doc) => {
      delete doc.observations.visibilitySemantics;
    }],
    ['activity frame simulation time freezes while ticks advance', (doc) => {
      doc.observations.frames[3].simTimeS = doc.observations.frames[2].simTimeS;
    }],
    ['clipped endpoint drops its observed-tick marker', (doc) => {
      const end = doc.observations.frames.at(-1);
      end.clippedFromObservedTick = null;
    }],
    ['clipped endpoint falsely claims an exact observed tick', (doc) => {
      doc.observations.frames.at(-1).observedTick = END_TICK;
    }],
    ['trace bracket falsely claims an exact end sample', (doc) => {
      doc.observations.traceBracket = {
        before: END_TICK,
        after: END_TICK,
        exactStart: START_TICK,
        exactEnd: END_TICK,
        endWasClipped: false,
      };
    }],
    ['one moving job in one minute', (doc) => {
      const bucket = doc.observations.movingJobBuckets[2];
      bucket.movingJobIds.pop();
      const removed = bucket.tracks.pop();
      const endFrame = doc.observations.frames.find((frame) => frame.tick === bucket.endTick - 1);
      const actor = endFrame.actorStates.find((row) => row.jobId === 'ceres_job_seam_extraction');
      actor.x = removed.start.x;
      actor.z = removed.start.z;
    }],
    ['non-swept same-side ambush', (doc) => {
      const sweep = doc.observations.throughlineAmbush.sweep;
      for (const [index, row] of sweep.path.entries()) {
        row.pos = {
          x: sweep.zone.center.x - (220 - index * 20),
          z: sweep.zone.center.z,
        };
        const frame = doc.observations.frames.find((entry) => entry.tick === row.tick);
        frame.playerPos = structuredClone(row.pos);
      }
      sweep.before = structuredClone(sweep.path[0]);
      sweep.after = structuredClone(sweep.path.at(-1));
      sweep.segmentCrossesZone = true;
    }],
    ['ambush sweep path is not backed by route frames', (doc) => {
      doc.observations.throughlineAmbush.sweep.path[1].pos.x += 1;
    }],
    ['wrong anchor collision participant', (doc) => {
      doc.observations.anchorCollision.impacts[0].bId = 42;
    }],
    ['vacuous tombstone proof', (doc) => {
      doc.observations.continueProof.hostileTombstonesBefore = [];
      doc.observations.continueProof.hostileTombstonesAfter = [];
      doc.observations.continueProof.pass = true;
    }],
    ['direct-state accessibility shortcut', (doc) => {
      doc.observations.accessibility.source = 'direct-state-assignment';
    }],
    ['matched reduced checkpoint drifts from the default player pose', (doc) => {
      doc.observations.accessibility.reduced.playerPos.x += 1;
    }],
    ['matched default screenshot is missing', (doc) => {
      const rows = doc.observations.artifactBindings.requiredArtifacts;
      rows.splice(rows.findIndex((entry) => /20-accessibility-default\.png$/.test(entry.path)), 1);
    }],
    ['missing observation artifact despite verified summary', (doc) => {
      doc.observations.artifactBindings.requiredArtifacts.shift();
      doc.observations.artifactBindings.allVerified = true;
    }],
    ['cleanup claims pass with a live owned pid', (doc) => {
      doc.observations.cleanupExpectations.aliveOwnedPids = [29_628];
      doc.cleanup.pass = true;
      doc.cleanup.ownedProcessesExited = true;
    }],
  ];

  for (const [label, mutate] of mutations) {
    const document = runtimeFixture('browser');
    mutate(document);
    const result = evaluateCeresFiveMinuteRuntime(document, { runtimeKind: 'browser' });
    assert.equal(result.pass, false, label);
    assert.ok(result.failures.length > 0, `${label} must explain the failure`);
  }

  const exactEndpoint = runtimeFixture('browser');
  const exactFrame = exactEndpoint.observations.frames.at(-1);
  exactFrame.observedTick = END_TICK;
  exactFrame.clippedFromObservedTick = null;
  exactFrame.observedSimTimeS = exactFrame.simTimeS;
  exactEndpoint.observations.traceBracket = {
    before: END_TICK,
    after: END_TICK,
    exactStart: START_TICK,
    exactEnd: END_TICK,
    endWasClipped: false,
  };
  assert.equal(
    evaluateCeresFiveMinuteRuntime(exactEndpoint, { runtimeKind: 'browser' }).pass,
    true,
    'a genuinely exact endpoint remains valid',
  );
});

test('physics-toolkit proof is an ordered causal trace against initial Throughline identities', () => {
  const document = runtimeFixture('electron');
  const toolkit = document.observations.toolkit;
  const initialEntityIds = new Set(toolkit.initialHostiles.map((entry) => entry.entityId));
  const initialWorldRecordIds = new Set(toolkit.initialHostiles.map((entry) => entry.worldRecordId));

  const attached = findToolkitEvent(toolkit, 'tether:attached');
  const latched = findToolkitEvent(toolkit, 'tether:latched');
  const broken = findToolkitEvent(toolkit, 'tether:broken');
  const cut = findToolkitEvent(toolkit, 'tether:cut');
  const released = findToolkitEvent(toolkit, 'tether:released');
  assert.equal(attached.actorId, PLAYER_ENTITY_ID);
  assert.equal(initialEntityIds.has(attached.targetId), true);
  assert.equal(latched.targetId, attached.targetId);
  assert.equal(latched.previewMatched, true);
  assert.equal(broken.attachmentId, attached.attachmentId);
  assert.equal(broken.reason, 'tether_cut');
  assert.equal(cut.targetId, attached.targetId);
  assert.equal(released.targetId, attached.targetId);
  assert.deepEqual(
    [attached, latched, broken, cut, released].map((entry) => entry.seq),
    [...[attached, latched, broken, cut, released].map((entry) => entry.seq)].sort((a, b) => a - b),
  );
  assert.equal(toolkit.events.every((entry, index, rows) => (
    index === 0 || rows[index - 1].seq < entry.seq
  )), true);

  const deployedSeed = findToolkitEvent(toolkit, 'massSeed:deployed');
  const lockedSeed = findToolkitEvent(toolkit, 'massSeed:locked');
  assert.equal(deployedSeed.ownerId, PLAYER_ENTITY_ID);
  assert.equal(lockedSeed.seedId, deployedSeed.seedId);
  assert.ok(deployedSeed.tick < lockedSeed.tick);

  const repulsor = findToolkitEvent(toolkit, 'fields:deployed');
  assert.equal(repulsor.kind, 'repulsor');
  assert.equal(repulsor.sourceOwnerId, PLAYER_ENTITY_ID);
  assert.ok(String(repulsor.fieldId) && repulsor.sourceId != null);

  for (const weaponId of TOOLKIT_WEAPON_IDS) {
    const fire = findToolkitEvent(toolkit, 'combat:fire', weaponId);
    const hit = findToolkitEvent(toolkit, 'projectile:hit', weaponId);
    const damage = findToolkitEvent(toolkit, 'combat:damage', weaponId);
    assert.equal(fire.ownerId, PLAYER_ENTITY_ID, weaponId);
    assert.equal(hit.ownerId, PLAYER_ENTITY_ID, weaponId);
    assert.equal(damage.attackerId, PLAYER_ENTITY_ID, weaponId);
    assert.equal(initialEntityIds.has(hit.targetId), true, weaponId);
    assert.equal(damage.targetId, hit.targetId, weaponId);
    assert.ok(fire.tick < hit.tick && hit.tick === damage.tick, weaponId);
    assert.ok(toolkit.events.indexOf(damage) < toolkit.events.indexOf(hit),
      `${weaponId} must exercise the nested damage-before-outer-hit observer order`);
  }

  const gravityStatus = findToolkitStatus(toolkit, 'status_gravity_marked');
  assert.equal(gravityStatus.statusId, 'status_gravity_marked');
  assert.equal(gravityStatus.attackerId, PLAYER_ENTITY_ID);
  assert.equal(gravityStatus.tick,
    findToolkitEvent(toolkit, 'projectile:hit', 'wpn_gravity_marker_s').tick);
  const momentumStatus = findToolkitStatus(toolkit, 'status_momentum_sink');
  assert.equal(momentumStatus.statusId, 'status_momentum_sink');
  assert.equal(momentumStatus.attackerId, PLAYER_ENTITY_ID);
  assert.equal(momentumStatus.tick,
    findToolkitEvent(toolkit, 'projectile:hit', 'wpn_momentum_sink_s').tick);

  const concussionImpulse = toolkit.combatTrace.find((entry) => entry.kind === 'physics.impulse');
  assert.equal(concussionImpulse.provenance, 'concussion_slug');
  assert.equal(concussionImpulse.reason, 'weapon_hit');
  assert.equal(concussionImpulse.weaponId, 'wpn_concussion_cannon_m');
  assert.equal(concussionImpulse.actorId, PLAYER_ENTITY_ID);
  assert.equal(initialEntityIds.has(concussionImpulse.targetId), true);
  assert.ok(Math.hypot(concussionImpulse.impulse.x, concussionImpulse.impulse.z) > 0);
  const frameBound = toolkit.combatTrace.find((entry) => entry.kind === 'momentumSink.frameBound');
  assert.equal(frameBound.frameKind, 'attacker_velocity');
  assert.equal(frameBound.actorId, PLAYER_ENTITY_ID);
  assert.equal(initialEntityIds.has(frameBound.targetId), true);
  assert.equal(Number.isFinite(frameBound.frameVelocity.x), true);
  assert.equal(Number.isFinite(frameBound.frameVelocity.z), true);

  const destroyedWorldRecordId = toolkit.destroyedRecordIds[0];
  assert.equal(initialWorldRecordIds.has(destroyedWorldRecordId), true);
  assert.deepEqual(toolkit.destroyedRecordIds, [destroyedWorldRecordId]);
  assert.equal(document.observations.continueProof.hostileTombstonesBefore.includes(
    destroyedWorldRecordId,
  ), true);
  assert.equal(document.observations.continueProof.hostileTombstonesAfter.includes(
    destroyedWorldRecordId,
  ), true);

  const result = evaluateCeresFiveMinuteRuntime(document, { runtimeKind: 'electron' });
  assert.equal(result.pass, true, result.failures?.join('; '));
});

test('physics-toolkit evaluator rejects summary shortcuts and broken causal identity', () => {
  const mutations = [
    ['missing tether attachment', (toolkit) => removeToolkitEvent(toolkit, 'tether:attached')],
    ['tether attachment is not player-owned', (toolkit) => {
      findToolkitEvent(toolkit, 'tether:attached').actorId = 404;
    }],
    ['latch targets a non-ambush entity', (toolkit) => {
      const latch = findToolkitEvent(toolkit, 'tether:latched');
      latch.targetId = 999;
      latch.targetWorldRecordId = 'wr_npc_not_initial';
    }],
    ['latch contradicts the rendered Massline candidate', (toolkit) => {
      findToolkitEvent(toolkit, 'tether:latched').previewMatched = false;
    }],
    ['latch is ordered before attachment', (toolkit) => {
      const attachment = findToolkitEvent(toolkit, 'tether:attached');
      findToolkitEvent(toolkit, 'tether:latched').seq = attachment.seq - 1;
    }],
    ['break is not a manual tether cut', (toolkit) => {
      findToolkitEvent(toolkit, 'tether:broken').reason = 'physics_break';
    }],
    ['break names the wrong attachment', (toolkit) => {
      findToolkitEvent(toolkit, 'tether:broken').attachmentId = 'attachment_other';
    }],
    ['manual cut receipt is missing', (toolkit) => {
      removeToolkitEvent(toolkit, 'tether:cut');
    }],
    ['manual cut targets another entity', (toolkit) => {
      findToolkitEvent(toolkit, 'tether:cut').targetId = 999;
    }],
    ['release precedes break', (toolkit) => {
      findToolkitEvent(toolkit, 'tether:released').tick =
        findToolkitEvent(toolkit, 'tether:broken').tick - 1;
    }],
    ['seed lock names another seed', (toolkit) => {
      findToolkitEvent(toolkit, 'massSeed:locked').seedId = 9_999;
    }],
    ['seed lock precedes deployment', (toolkit) => {
      findToolkitEvent(toolkit, 'massSeed:locked').tick =
        findToolkitEvent(toolkit, 'massSeed:deployed').tick - 1;
    }],
    ['repulsor is another field kind', (toolkit) => {
      findToolkitEvent(toolkit, 'fields:deployed').kind = 'well';
    }],
    ['repulsor source is not player-owned', (toolkit) => {
      findToolkitEvent(toolkit, 'fields:deployed').sourceOwnerId = 702;
    }],
    ['one exact weapon never fired', (toolkit) => {
      removeToolkitEvent(toolkit, 'combat:fire', 'wpn_gravity_marker_s');
    }],
    ['weapon hit belongs to an unowned projectile', (toolkit) => {
      findToolkitEvent(toolkit, 'projectile:hit', 'wpn_concussion_cannon_m').ownerId = 702;
    }],
    ['weapon hit precedes its fire receipt', (toolkit) => {
      const fire = findToolkitEvent(toolkit, 'combat:fire', 'wpn_concussion_cannon_m');
      findToolkitEvent(toolkit, 'projectile:hit', 'wpn_concussion_cannon_m').tick = fire.tick - 1;
    }],
    ['weapon damage targets a non-initial hostile', (toolkit) => {
      const damage = findToolkitEvent(toolkit, 'combat:damage', 'wpn_momentum_sink_s');
      damage.targetId = 999;
      damage.targetWorldRecordId = 'wr_npc_not_initial';
    }],
    ['outer projectile hit is observed before nested damage', (toolkit) => {
      const damageIndex = toolkit.events.findIndex((entry) => entry.event === 'combat:damage'
        && entry.weaponId === 'wpn_concussion_cannon_m');
      const hitIndex = toolkit.events.findIndex((entry) => entry.event === 'projectile:hit'
        && entry.weaponId === 'wpn_concussion_cannon_m');
      const lowerSeq = toolkit.events[damageIndex].seq;
      [toolkit.events[damageIndex], toolkit.events[hitIndex]] =
        [toolkit.events[hitIndex], toolkit.events[damageIndex]];
      toolkit.events[damageIndex].seq = lowerSeq;
      toolkit.events[hitIndex].seq = lowerSeq + 1;
    }],
    ['gravity status is missing', (toolkit) => {
      removeToolkitStatus(toolkit, 'status_gravity_marked');
    }],
    ['gravity status targets a non-initial hostile', (toolkit) => {
      findToolkitStatus(toolkit, 'status_gravity_marked').targetId = 999;
    }],
    ['momentum status is missing', (toolkit) => {
      removeToolkitStatus(toolkit, 'status_momentum_sink');
    }],
    ['momentum status has the wrong provenance identity', (toolkit) => {
      const status = findToolkitStatus(toolkit, 'status_momentum_sink');
      status.attackerId = 702;
    }],
    ['momentum frame kind is fabricated', (toolkit) => {
      findCombatTrace(toolkit, 'momentumSink.frameBound').frameKind = 'target_velocity';
    }],
    ['momentum frame receipt is missing', (toolkit) => {
      removeCombatTrace(toolkit, 'momentumSink.frameBound');
    }],
    ['momentum frame velocity is nonfinite', (toolkit) => {
      findCombatTrace(toolkit, 'momentumSink.frameBound').frameVelocity.x = Number.NaN;
    }],
    ['momentum frame binds another attacker', (toolkit) => {
      findCombatTrace(toolkit, 'momentumSink.frameBound').actorId = 702;
    }],
    ['momentum frame binds another target', (toolkit) => {
      findCombatTrace(toolkit, 'momentumSink.frameBound').targetId = 999;
    }],
    ['momentum frame predates its weapon/status receipts', (toolkit) => {
      const fire = findToolkitEvent(toolkit, 'combat:fire', 'wpn_momentum_sink_s');
      findCombatTrace(toolkit, 'momentumSink.frameBound').tick = fire.tick - 1;
    }],
    ['concussion impulse is zero', (toolkit) => {
      findCombatTrace(toolkit, 'physics.impulse').impulse = { x: 0, z: 0 };
    }],
    ['concussion impulse receipt is missing', (toolkit) => {
      removeCombatTrace(toolkit, 'physics.impulse');
    }],
    ['concussion impulse is nonfinite', (toolkit) => {
      findCombatTrace(toolkit, 'physics.impulse').impulse.z = Number.POSITIVE_INFINITY;
    }],
    ['concussion impulse uses another provenance tag', (toolkit) => {
      findCombatTrace(toolkit, 'physics.impulse').provenance = 'damage';
    }],
    ['concussion impulse targets a non-initial hostile', (toolkit) => {
      findCombatTrace(toolkit, 'physics.impulse').targetId = 999;
    }],
    ['concussion impulse predates its weapon receipt', (toolkit) => {
      const fire = findToolkitEvent(toolkit, 'combat:fire', 'wpn_concussion_cannon_m');
      findCombatTrace(toolkit, 'physics.impulse').tick = fire.tick - 1;
    }],
    ['tombstone was not one of the initial hostiles', (toolkit) => {
      toolkit.destroyedRecordIds = ['wr_npc_not_initial'];
    }],
    ['tombstone proof is missing', (toolkit) => {
      toolkit.destroyedRecordIds = [];
    }],
    ['tombstone kill belongs to another killer', (toolkit) => {
      findToolkitEvent(toolkit, 'entity:killed').killerId = 702;
    }],
    ['tombstone kill omits killer authority', (toolkit) => {
      delete findToolkitEvent(toolkit, 'entity:killed').killerId;
    }],
    ['tombstone kill mismatches its initial durable identity', (toolkit) => {
      findToolkitEvent(toolkit, 'entity:killed').entityId = TOOLKIT_HOSTILES[1].entityId;
    }],
  ];

  for (const [label, mutate] of mutations) {
    const document = runtimeFixture('electron');
    mutate(document.observations.toolkit);
    const result = evaluateCeresFiveMinuteRuntime(document, { runtimeKind: 'electron' });
    assert.equal(result.pass, false, label);
    assert.ok(result.failures.length > 0, `${label} must explain the failure`);
  }

  const legacyShortcut = runtimeFixture('electron');
  legacyShortcut.observations.toolkit = {
    pass: true,
    inputSource: 'public-keyboard-mouse',
    startTick: START_TICK + 7_200,
    endTick: START_TICK + 8_000,
    masslinePressed: true,
    massSeedPressed: true,
    repulsorPressed: true,
    primaryFireAttempted: true,
    hostileTombstoneWorldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
  };
  const result = evaluateCeresFiveMinuteRuntime(legacyShortcut, { runtimeKind: 'electron' });
  assert.equal(result.pass, false, 'trusted pass/pressed booleans cannot substitute for causal receipts');
});

test('Continue, accessibility, and artifact evidence bind exact identities rather than booleans', () => {
  const mutations = [
    ['Continue changes an actor job', (doc) => {
      doc.observations.continueProof.actorRecordsAfter[0].jobId = 'replacement_job';
    }],
    ['Continue drops a logical object', (doc) => {
      doc.observations.continueProof.objectSlotIdsAfter.pop();
      doc.observations.continueProof.objectRecordsAfter.pop();
    }],
    ['Continue replaces a collision anchor entity', (doc) => {
      doc.observations.continueProof.collisionAnchorsAfter[0].entityId = 99_999;
    }],
    ['Continue replaces the tombstoned hostile', (doc) => {
      doc.observations.continueProof.liveHostileWorldRecordIdsAfter.push(
        doc.observations.continueProof.hostileTombstonesAfter[0],
      );
      doc.observations.continueProof.replacementSpawnCount = 1;
    }],
    ['reduced accessibility loses one actor', (doc) => {
      doc.observations.accessibility.reduced.actorSlotIds.pop();
    }],
    ['reduced accessibility kills the player', (doc) => {
      doc.observations.accessibility.reduced.playerAlive = false;
    }],
    ['reduced accessibility has no post-toggle input consequence', (doc) => {
      doc.observations.accessibility.postToggleInputReceipt.motionObserved = false;
    }],
    ['cleanup receipt is not candidate-bound', (doc) => {
      doc.observations.cleanupExpectations.receipt.candidateDigest = digest('9');
    }],
  ];
  for (const [label, mutate] of mutations) {
    const document = runtimeFixture('electron');
    mutate(document);
    const result = evaluateCeresFiveMinuteRuntime(document, { runtimeKind: 'electron' });
    assert.equal(result.pass, false, label);
  }
});

test('candidate-bound KEEP closes human review while REVISE truthfully keeps the row open', () => {
  const runtimeEvidence = runtimeFixture('browser');
  const keep = humanReview(runtimeEvidence, {
    verdict: 'KEEP',
    note: 'The measured gap reads as a brief intentional void between the refinery and seam pockets.',
  });
  const accepted = evaluateCeresHumanReview({
    review: keep,
    runtimeEvidence,
    verifiedArtifacts: runtimeEvidence.artifacts,
  });
  assert.equal(accepted.valid, true, accepted.failures?.join('; '));
  assert.equal(accepted.closesAcceptanceRow, true);
  assert.equal(keep.readsAsBriefIntentionalVoid, true);

  const revise = humanReview(runtimeEvidence, {
    verdict: 'REVISE',
    note: 'The measured gap does not read as a brief intentional void; revise route pacing.',
  });
  const open = evaluateCeresHumanReview({
    review: revise,
    runtimeEvidence,
    verifiedArtifacts: runtimeEvidence.artifacts,
  });
  assert.equal(open.valid, true, open.failures?.join('; '));
  assert.equal(open.closesAcceptanceRow, false);
  assert.equal(open.verdict, 'REVISE');
  assert.equal(revise.readsAsBriefIntentionalVoid, false);
});

test('human judgment cannot be reused across candidate, route, runtime, metric, or artifact identity', () => {
  const runtimeEvidence = runtimeFixture('browser');
  const mutations = [
    ['empty note', (review) => { review.note = '   '; }],
    ['unrecognized verdict', (review) => { review.verdict = 'PASS'; }],
    ['missing structured void judgment', (review) => { delete review.readsAsBriefIntentionalVoid; }],
    ['KEEP contradicts a negative void judgment', (review) => {
      review.readsAsBriefIntentionalVoid = false;
      review.note = 'The longest gap does not read as a brief intentional void.';
    }],
    ['candidate hash mismatch', (review) => { review.candidateHash = '0'.repeat(40); }],
    ['candidate digest mismatch', (review) => { review.candidateDigest = digest('9'); }],
    ['source candidate mismatch', (review) => { review.sourceCandidateDigest = digest('6'); }],
    ['route mismatch', (review) => { review.routeId = 'different_route'; }],
    ['runtime mismatch', (review) => { review.runtimeKind = 'electron'; }],
    ['seed mismatch', (review) => { review.seed = 48; }],
    ['gap metric mismatch', (review) => { review.gapMetricDigest = digest('8'); }],
    ['gap value mismatch', (review) => { review.maxZeroVisibleActivityS += 1; }],
    ['gap endpoint mismatch', (review) => { review.intervalEndTick += 1; }],
    ['gap transition mismatch', (review) => {
      review.adjacentPocketTransition.toPocketId = 'ceres_cathedral_grave';
    }],
    ['artifact path mismatch', (review) => { review.artifactIdentity.path = 'different/evidence.json'; }],
    ['artifact digest mismatch', (review) => { review.artifactIdentity.sha256 = digest('7'); }],
    ['missing reviewer', (review) => { review.reviewer = ''; }],
    ['missing reviewed timestamp', (review) => { review.reviewedAt = null; }],
  ];

  for (const [label, mutate] of mutations) {
    const review = humanReview(runtimeEvidence);
    mutate(review);
    const result = evaluateCeresHumanReview({
      review,
      runtimeEvidence,
      verifiedArtifacts: runtimeEvidence.artifacts,
    });
    assert.equal(result.valid, false, label);
    assert.equal(result.closesAcceptanceRow, false, label);
    assert.ok(result.failures.length > 0, `${label} must explain the failure`);
  }
});

test('paired source Browser and source Electron evidence requires exact route and source parity', () => {
  const pair = pairFixture();
  const result = evaluateCeresFiveMinutePair(pair);
  assert.equal(result.pass, true, result.failures?.join('; '));
  assert.equal(result.packagedElectronClaim, false);
  assert.equal(result.controllerParityClaim, false);
  assert.equal(result.reviews.electron.status, 'not-required');

  const mutations = [
    ['source candidate drift', (input) => {
      input.electron.authority.sourceCandidateDigest = digest('9');
    }],
    ['route drift', (input) => { input.electron.route.id = 'different_route'; }],
    ['seed drift', (input) => { input.electron.route.seed = 48; }],
    ['longest-gap transition drift', (input) => {
      const samples = input.electron.activityVisibility.samples;
      samples[0].nearestPocketId = 'ceres_working_seam';
      samples[2].nearestPocketId = 'ceres_ambush_run';
      const interval = deriveZeroVisibleActivityIntervals(samples, input.electron.activityVisibility.bounds)[0];
      input.electron.activityVisibility.recordedMetric = recordedGapMetric(
        canonicalGapProjection(interval),
      );
    }],
    ['longest-gap duration and relative endpoints drift', (input) => {
      input.electron = runtimeFixture('electron', { gapS: 200 });
      input.ledgers.electron = consumedLedger(input.electron);
    }],
    ['horizon drift', (input) => { input.electron.route.endTick -= 1; }],
    ['census drift', (input) => { input.electron.census.actorSlotIds.reverse(); }],
    ['input route drift', (input) => { input.electron.route.inputMode = 'controller'; }],
    ['candidate digest alias', (input) => {
      input.electron.authority.candidateDigest = input.browser.authority.candidateDigest;
      input.ledgers.electron.candidateDigest = input.ledgers.browser.candidateDigest;
    }],
    ['artifact-root alias', (input) => {
      input.electron.authority.artifactRoot = input.browser.authority.artifactRoot;
    }],
    ['unconsumed Electron claim', (input) => { delete input.ledgers.electron.consumedAt; }],
    ['Electron claim predates Browser', (input) => {
      input.ledgers.electron.consumedAt = '2026-08-08T11:59:59.000Z';
    }],
    ['claim identity mismatch', (input) => { input.ledgers.browser.claimId = 'wrong-claim'; }],
    ['current worktree drift', (input) => { input.currentFingerprint.digest = digest('0'); }],
    ['current worktree is dirty', (input) => { input.currentFingerprint.changedFileCount = 1; }],
    ['current branch drift', (input) => { input.currentFingerprint.branch = 'codex/other'; }],
    ['Browser human REVISE', (input) => { input.browserReview.verdict = 'REVISE'; }],
  ];

  for (const [label, mutate] of mutations) {
    const input = pairFixture();
    mutate(input);
    const evaluated = evaluateCeresFiveMinutePair(input);
    assert.equal(evaluated.pass, false, label);
  }
});

test('public input receipt proves one press-observe-release-neutral keyboard action', () => {
  const valid = publicInputReceipt();
  assert.equal(validatePublicInputReceipt(valid).pass, true);

  const mutations = [
    ['unsupported action', (receipt) => { receipt.action = 'controllerAxis'; }],
    ['observation before press', (receipt) => { receipt.observedTick = receipt.pressTick - 1; }],
    ['release before observation', (receipt) => { receipt.releaseTick = receipt.observedTick - 1; }],
    ['neutral before release', (receipt) => { receipt.neutralTick = receipt.releaseTick - 1; }],
    ['action never active', (receipt) => { receipt.observedState.active = false; }],
    ['action remains active', (receipt) => { receipt.neutralState.active = true; }],
    ['no motion consequence', (receipt) => { receipt.motionObserved = false; }],
  ];
  for (const [label, mutate] of mutations) {
    const receipt = publicInputReceipt();
    mutate(receipt);
    const result = validatePublicInputReceipt(receipt);
    assert.equal(result.pass, false, label);
    assert.ok(result.failures.length > 0, `${label} must explain the failure`);
  }
});

test('public pocket approach completes only after the hull is settled inside the anchor', () => {
  assert.equal(chooseCeresPocketApproachAction({
    distanceWU: 80,
    headingError: 0.01,
    speed: 0.8,
  }).kind, 'complete');
  const observedHandoff = chooseCeresPocketApproachAction({
    distanceWU: 80,
    headingError: 0.7,
    speed: 78,
  });
  assert.equal(observedHandoff.kind, 'settle',
    'the observed working-seam handoff must settle instead of returning at 78 WU/s');
  assert.equal(observedHandoff.key, 'Digit0', 'the route uses the public zero-thrust brake');
  assert.equal(chooseCeresPocketApproachAction({
    distanceWU: 140,
    headingError: 0.7,
    speed: 78,
  }).kind, 'turn', 'outside the entry circle the proven controller corrects heading first');
  const approachBrake = chooseCeresPocketApproachAction({
    distanceWU: 140,
    headingError: 0.01,
    speed: 78,
  });
  assert.equal(approachBrake.kind, 'decelerate');
  assert.equal(approachBrake.key, 'KeyS');
  assert.equal(approachBrake.durationMs, 100);
  assert.equal(chooseCeresPocketApproachAction({
    distanceWU: 2_000,
    headingError: 0.01,
    speed: 70,
  }).kind, 'thrust');
  assert.equal(chooseCeresPocketApproachAction({
    distanceWU: Number.NaN,
    headingError: 0,
    speed: 0,
  }).kind, 'invalid');
});

test('public pocket settle holds the brake to the speed condition outside the steering budget', async () => {
  const settled = pocketSettlePage({
    tick: 1_000,
    endTick: 2_000,
    distanceWU: 80,
    pollSpeeds: [78, 35, 0.8],
  });
  const receipt = await settleCeresPocketApproach(settled.page, {
    point: { x: 0, z: 0 },
    endTick: 2_000,
    targetName: 'Working Seam',
  });
  assert.equal(receipt.speed, 0.8);
  assert.equal(receipt.distanceWU, 80);
  assert.deepEqual(settled.events, [
    'down:Digit0',
    'wait:speed-or-horizon:10000',
    'poll:78:false',
    'poll:35:false',
    'poll:0.8:true',
    'read:settled-status',
    'up:Digit0',
  ]);

  const horizon = pocketSettlePage({
    tick: 1_880,
    endTick: 2_000,
    distanceWU: 80,
    pollSpeeds: [78],
  });
  await assert.rejects(
    settleCeresPocketApproach(horizon.page, {
      point: { x: 0, z: 0 },
      endTick: 2_000,
      targetName: 'Working Seam',
    }),
    /Working Seam settle exhausted the exact route horizon/,
  );
  assert.equal(horizon.events.at(-1), 'up:Digit0', 'failure must release the public brake');
});

test('public pocket driver trims outside the circle and holds full brake only after entry', async () => {
  const pocket = CERES_ACTIVITY_POCKETS_BY_ID.ceres_working_seam;
  const targetPoint = sectorLocalToGlobalForSector(
    pocket.activityAnchor.localPos,
    CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
  );
  const harness = pocketApproachTwoPhasePage({ targetPoint, endTick: 5_000 });
  const receipt = await drivePublicToPocketAnchor(
    harness.page,
    'ceres_working_seam',
    5_000,
  );
  assert.equal(receipt.distanceWU, 80);
  assert.equal(receipt.speed, 0.8);
  assert.deepEqual(harness.sequence, ['turn', 'decelerate', 'thrust', 'settle']);
  assert.deepEqual(harness.settleStartDistances, [80],
    'the condition-held Digit0 brake is unreachable before the 90-WU entry circle');

  const expired = pocketApproachTwoPhasePage({
    targetPoint,
    endTick: 5_000,
    tick: 4_880,
    initialDistanceWU: 80,
    initialSpeed: 0.8,
    initialRot: 0,
  });
  await assert.rejects(
    drivePublicToPocketAnchor(expired.page, 'ceres_working_seam', 5_000),
    (error) => {
      assert.match(error.message, /Working Seam approach exhausted the exact route horizon/);
      assert.equal(error.ceresPocketApproachDiagnostic?.counts?.totalPulses, 0);
      assert.ok(error.ceresPocketApproachDiagnostic?.decisionTail?.length <= 16);
      return true;
    },
  );
  assert.deepEqual(expired.sequence, [], 'an expired settled sample cannot issue a control pulse');

  const stuck = pocketApproachTwoPhasePage({
    targetPoint,
    endTick: 5_000,
    initialDistanceWU: 200,
    initialSpeed: 0,
    initialRot: -0.7,
    turnConverges: false,
  });
  await assert.rejects(
    drivePublicToPocketAnchor(stuck.page, 'ceres_working_seam', 5_000),
    (error) => {
      const diagnostic = error.ceresPocketApproachDiagnostic;
      assert.equal(diagnostic?.counts?.totalPulses, 220);
      assert.equal(diagnostic?.counts?.turnPulses, 220);
      assert.equal(diagnostic?.decisionTail?.length, 16,
        'failure telemetry retains only the bounded decision tail');
      return /public controls did not enter Working Seam/.test(error.message);
    },
  );
});

test('public pilot source uses menu/card and Playwright input while private shortcuts fail closed', () => {
  const validSources = actualPilotSources();
  assert.equal(validateCeresPilotSources(validSources).pass, true);

  const forbidden = [
    "SF.bus.emit('game:new', { seed: 47 })",
    'requestSandboxGame({ scenarioId: \'ceres_reference_pocket\' })',
    'lab.step(18_000)',
    'state.timeScale = 4',
    'state.player.pos.x = destination.x',
    'teleport(player, destination)',
    "dispatchEvent(new CustomEvent('game:new'))",
    "page.evaluate(() => window.__SPACEFACE__.state.player.targetId = 'injected')",
  ];
  for (const shortcut of forbidden) {
    const sources = actualPilotSources();
    sources.routeSource += `\n${shortcut};`;
    const result = validateCeresPilotSources(sources);
    assert.equal(result.pass, false, shortcut);
    assert.ok(result.failures.length > 0, `${shortcut} must explain the source-policy failure`);
  }

  for (const missing of ['Main Menu', 'Sandbox', 'ceres_reference_pocket', 'page.keyboard', 'page.mouse']) {
    const sources = actualPilotSources();
    sources.routeSource = sources.routeSource.replaceAll(missing, 'omitted');
    assert.equal(validateCeresPilotSources(sources).pass, false, `missing ${missing}`);
  }
});

test('public entry timeout preserves clause-level state and a screenshot before cleanup', () => {
  const { routeSource } = actualPilotSources();
  for (const marker of [
    'spaceface.ceresPublicEntryFailure.v1',
    'public-entry-failure.json',
    'public-entry-failure.png',
    'activeShipDefId',
    'visibleScreens',
    'modalClosed',
    'pageIssues',
  ]) {
    assert.ok(routeSource.includes(marker), `public-entry failure evidence must retain ${marker}`);
  }
});

function runtimeFixture(runtimeKind, { gapS = 1 } = {}) {
  const candidateDigest = runtimeKind === 'browser' ? digest('b') : digest('c');
  const claimId = `ceres-five-minute-${runtimeKind}-claim`;
  const samples = visibilitySamples(gapS);
  const interval = deriveZeroVisibleActivityIntervals(samples, horizon())[0];
  const recordedMetric = recordedGapMetric(canonicalGapProjection(interval));
  const artifactIdentity = {
    kind: 'ceres-five-minute-artifact-set',
    path: `${ARTIFACT_ROOT_PREFIX}/${runtimeKind}/artifact-set.json`,
    bytes: 4096,
    sha256: runtimeKind === 'browser' ? digest('4') : digest('5'),
  };
  const observations = routeObservationsFixture(runtimeKind, candidateDigest, samples, recordedMetric);
  return {
    schema: RUNTIME_SCHEMA,
    pass: true,
    primaryAcceptance: true,
    runtimeKind,
    runtimeScope: runtimeKind === 'browser' ? 'source-browser' : 'source-native-electron',
    packagedElectronClaim: false,
    controllerParityClaim: false,
    r7CrimeLoopClaim: false,
    r8Claim: false,
    g0ToG7Claim: false,
    route: {
      id: 'ceres_reference_pocket',
      publicPath: ['main_menu', 'sandbox', 'ceres_reference_pocket'],
      seed: 47,
      inputMode: 'keyboard_mouse',
      shipId: 'ship_hornet',
      loadoutId: 'physics_toolkit',
      cameraZoomWU: 144,
      timeScale: 1,
      tickRateHz: TICK_RATE_HZ,
      startTick: START_TICK,
      endTick: END_TICK,
      fixedTicks: FIXED_TICKS,
      simulationSeconds: SIMULATION_SECONDS,
    },
    census: {
      actorSlotIds: [...ACTOR_SLOT_IDS],
      objectSlotIds: [...OBJECT_SLOT_IDS],
      collisionAnchorSlotIds: [...COLLISION_ANCHOR_SLOT_IDS],
      lawfulActorsAndServicesPresent: true,
      throughlineAmbush: {
        present: true,
        kind: 'hostile_criminal',
        countedInAuthoredActorCensus: false,
        injectedScenario: false,
      },
      crimeLoopClaim: false,
    },
    activityVisibility: {
      semantics: 'world-camera-renderability-v1',
      samples: structuredClone(observations.visibilitySamples),
      bounds: horizon(),
      recordedMetric: structuredClone(observations.recordedMetric),
    },
    observations,
    publicInputReceipt: publicInputReceipt(),
    authority: {
      claimId,
      candidateHash: GIT_HEAD,
      candidateDigest,
      sourceCandidateDigest: SOURCE_CANDIDATE_DIGEST,
      artifactRoot: `${ARTIFACT_ROOT_PREFIX}/${runtimeKind}`,
      digests: {
        routeDigest: digest('e'),
        inputDigest: digest('f'),
        activityContractDigest: digest('1'),
        runtimeManifestDigest: runtimeKind === 'browser' ? digest('2') : digest('3'),
        profileDigest: runtimeKind === 'browser' ? digest('a') : digest('b'),
        regressionDigest: digest('c'),
        harnessDigest: digest('d'),
        scenarioManifestDigest: digest('1'),
        saveDigest: digest('2'),
        inputTapeDigest: digest('3'),
        cameraManifestDigest: digest('4'),
      },
      worktree: {
        id: 'clean-candidate',
        digest: WORKTREE_DIGEST,
        head: GIT_HEAD,
        branch: 'master',
      },
    },
    artifactIdentity: structuredClone(artifactIdentity),
    artifacts: [artifactIdentity, ...structuredClone(observations.artifactBindings.requiredArtifacts)],
    gpu: {
      available: true,
      vendor: 'NVIDIA Corporation',
      renderer: 'ANGLE (NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)',
    },
    cleanup: {
      pass: true,
      ownedProcessesExited: true,
      portsClosed: true,
      pageClosed: true,
      runtimeClosed: true,
      serverClosed: true,
      profileRequired: runtimeKind === 'electron',
      profileRemoved: runtimeKind === 'electron' ? true : null,
      ownedPids: [runtimeKind === 'browser' ? 31_001 : 31_101],
      aliveOwnedPids: [],
      ports: [
        { kind: 'app', port: runtimeKind === 'browser' ? 64_401 : 64_411, closed: true },
        ...(runtimeKind === 'browser'
          ? [{ kind: 'debug', port: 64_402, closed: true }]
          : []),
      ],
      profile: runtimeKind === 'electron'
        ? {
            required: true,
            path: '.tmp/ceres-five-minute/electron',
            removed: true,
          }
        : {
            required: false,
            path: null,
            removed: null,
          },
      receipt: structuredClone(observations.cleanupExpectations.receipt),
    },
  };
}

function routeObservationsFixture(runtimeKind, candidateDigest, samples, recordedMetric) {
  const frames = observationFrames(samples);
  const endpoint = frames.at(-1);
  endpoint.observedTick = END_TICK - 3;
  endpoint.clippedFromObservedTick = endpoint.observedTick;
  endpoint.observedSimTimeS = endpoint.simTimeS - 3 / TICK_RATE_HZ;
  const minuteJobBuckets = movingJobBuckets(frames);
  const ambushSweepPath = [
    START_TICK + 7_100,
    START_TICK + 7_120,
    START_TICK + 7_160,
  ].map((tick) => {
    const frame = frames.find((entry) => entry.tick === tick);
    assert.ok(frame, `fixture is missing Ambush sweep frame ${tick}`);
    return { tick, pos: structuredClone(frame.playerPos) };
  });
  const actorRecords = ACTOR_SLOT_IDS.map((slotId, index) => ({
    slotId,
    worldRecordId: `wr_npc_${String(index + 1).padStart(8, '0')}`,
    jobId: index === 0
      ? 'ceres_job_refinery_freight'
      : index === 1 ? 'ceres_job_seam_extraction' : `ceres_job_${slotId}`,
  }));
  const collisionAnchors = [
    { slotId: 'ceres_throughline_collision_anchor', entityId: 9, collides: true },
    { slotId: 'ceres_ambush_collision_anchor', entityId: 38, collides: true },
  ];
  const objectRecords = OBJECT_SLOT_IDS.map((slotId, index) => ({
    slotId,
    entityId: 801 + index,
    worldRecordId: null,
  }));
  const hostileTombstone = TOOLKIT_HOSTILES[0].worldRecordId;
  const requiredArtifacts = [
    artifactDescriptor(runtimeKind, 'observation', 'observation.json', 16_384, '6'),
    artifactDescriptor(runtimeKind, 'route-log', 'run.log', 2_048, '7'),
    artifactDescriptor(runtimeKind, 'pocket-screenshot', '01-refinery-default.png', 8_192, '8'),
    artifactDescriptor(runtimeKind, 'pocket-screenshot', '02-working-seam-flight.png', 8_193, '9'),
    artifactDescriptor(runtimeKind, 'pocket-screenshot', '03-throughline-flight.png', 8_194, 'a'),
    artifactDescriptor(runtimeKind, 'pocket-screenshot', '04-cathedral-flight.png', 8_195, 'b'),
    artifactDescriptor(runtimeKind, 'accessibility-screenshot', '20-accessibility-default.png', 8_196, 'c'),
    artifactDescriptor(runtimeKind, 'accessibility-screenshot', '21-reduced-motion-flash.png', 8_197, 'e'),
    artifactDescriptor(runtimeKind, 'cleanup-receipt', 'cleanup.json', 1_024, 'd'),
  ];
  const postToggleInputReceipt = {
    ...publicInputReceipt(),
    pressTick: START_TICK + 13_300,
    observedTick: START_TICK + 13_301,
    releaseTick: START_TICK + 13_320,
    neutralTick: START_TICK + 13_321,
  };
  return {
    schema: 'spaceface.ceresFiveMinuteObservation.v1',
    visibilitySemantics: 'world-camera-renderability-v1',
    bounds: horizon(),
    visibilitySamples: frames.map((frame) => ({
      tick: frame.tick,
      visibleActivityCount: frame.visibleActivityCount,
      nearestPocketId: frame.visibleActivityCount > 0 ? frame.nearestPocketId : null,
    })),
    recordedMetric: structuredClone(recordedMetric),
    pocketSequence: [
      'ceres_refinery_pocket',
      'ceres_working_seam',
      'ceres_ambush_run',
      'ceres_cathedral_grave',
    ],
    arrivals: [
      physicalArrival('ceres_refinery_pocket', START_TICK),
      physicalArrival('ceres_working_seam', START_TICK + 3_600),
      physicalArrival('ceres_ambush_run', START_TICK + 7_200),
      physicalArrival('ceres_cathedral_grave', START_TICK + 10_800),
    ],
    completeActivityFrameSequence: true,
    frames,
    traceFailures: [],
    traceBracket: {
      before: endpoint.observedTick,
      after: END_TICK + 3,
      exactStart: START_TICK,
      exactEnd: null,
      endWasClipped: true,
    },
    movingJobBuckets: minuteJobBuckets,
    throughlineAmbush: {
      pass: true,
      encounterId: 'ceres:activity:throughline-ambush',
      injected: false,
      sweep: {
        before: structuredClone(ambushSweepPath[0]),
        after: structuredClone(ambushSweepPath.at(-1)),
        path: ambushSweepPath,
        zone: { center: structuredClone(AMBUSH_ZONE_GLOBAL), radiusWU: 165 },
        bothEndpointsOutside: true,
        segmentCrossesZone: true,
      },
      events: [
        { event: 'encounter:telegraph', tick: START_TICK + 7_120, encounterId: 'ceres:activity:throughline-ambush' },
        { event: 'encounter:spawned', tick: START_TICK + 7_140, encounterId: 'ceres:activity:throughline-ambush' },
      ],
      hostileWorldRecordIds: TOOLKIT_HOSTILES.map((entry) => entry.worldRecordId),
      hostiles: TOOLKIT_HOSTILES.map((entry) => ({ ...entry })),
      liveHostiles: [
        {
          ...TOOLKIT_HOSTILES[1],
          passive: true,
          roe: 'hold_fire',
        },
      ],
    },
    anchorCollision: {
      pass: true,
      slotId: 'ceres_throughline_collision_anchor',
      anchorEntityId: 9,
      playerEntityId: 1,
      collides: true,
      setupAnchors: structuredClone(collisionAnchors),
      finalAnchors: structuredClone(collisionAnchors),
      impacts: [{
        event: 'physics:impact',
        tick: START_TICK + 7_300,
        aId: 1,
        bId: 9,
      }],
    },
    continueProof: {
      pass: true,
      source: 'public-save-continue',
      publicPath: ['F5', 'reload', 'main_menu', 'continue'],
      savedAtTick: START_TICK + 12_800,
      loadedAtTick: START_TICK + 12_860,
      actorRecordsBefore: structuredClone(actorRecords),
      actorRecordsAfter: structuredClone(actorRecords),
      objectRecordsBefore: structuredClone(objectRecords),
      objectRecordsAfter: structuredClone(objectRecords),
      objectSlotIdsBefore: [...OBJECT_SLOT_IDS],
      objectSlotIdsAfter: [...OBJECT_SLOT_IDS],
      collisionAnchorsBefore: structuredClone(collisionAnchors),
      collisionAnchorsAfter: structuredClone(collisionAnchors),
      hostileTombstonesBefore: [hostileTombstone],
      hostileTombstonesAfter: [hostileTombstone],
      initialHostileWorldRecordIds: TOOLKIT_HOSTILES.map((entry) => entry.worldRecordId),
      destroyedHostileWorldRecordIds: [hostileTombstone],
      expectedLiveHostileWorldRecordIdsAfter: [TOOLKIT_HOSTILES[1].worldRecordId],
      liveHostileWorldRecordIdsAfter: [TOOLKIT_HOSTILES[1].worldRecordId],
      replacementWorldRecordIds: [],
      missingWorldRecordIds: [],
      actorHostileIdentityOverlap: [],
      replacementSpawnCount: 0,
      seedBefore: 47,
      seedAfter: 47,
    },
    accessibility: (() => {
      const before = accessibilitySnapshot({ tick: START_TICK + 12_900 });
      const reduced = accessibilitySnapshot({
        tick: before.tick,
        motionPreference: 'reduce',
        motionReduce: true,
        flashReduce: true,
      });
      return {
      pass: true,
      source: 'public-settings-ui',
      before,
      reduced,
      matchedCheckpoint: {
        defaultArtifactName: '20-accessibility-default.png',
        reducedArtifactName: '21-reduced-motion-flash.png',
        captureMethod: 'public-pause-flight-surface-v1',
        tick: before.tick,
        identity: accessibilityCheckpointIdentity(before),
      },
      postToggleInputReceipt,
      postToggleCompleteFrameTick: START_TICK + 13_400,
      };
    })(),
    toolkit: toolkitReceiptFixture(hostileTombstone),
    artifactBindings: {
      allVerified: true,
      candidateDigest,
      runtimeKind,
      requiredArtifacts,
    },
    cleanupExpectations: {
      allOwnedProcessesExited: true,
      aliveOwnedPids: [],
      portsClosed: true,
      profileRequired: runtimeKind === 'electron',
      profileRemoved: runtimeKind === 'electron' ? true : null,
      receipt: {
        schema: 'spaceface.ceresFiveMinuteCleanup.v1',
        runtimeKind,
        candidateDigest,
        worktreeDigest: WORKTREE_DIGEST,
        artifactIdentity: structuredClone(requiredArtifacts.at(-1)),
      },
    },
  };
}

function toolkitReceiptFixture(destroyedWorldRecordId) {
  const target = TOOLKIT_HOSTILES[0];
  const attachmentId = 'att_player_701_1';
  const seedId = 9_001;
  const events = [
    {
      seq: 1_201,
      event: 'tether:attached',
      tick: START_TICK + 7_220,
      actorId: PLAYER_ENTITY_ID,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      attachmentId,
    },
    {
      seq: 1_202,
      event: 'tether:latched',
      tick: START_TICK + 7_220,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      previewMatched: true,
    },
    {
      seq: 1_203,
      event: 'tether:broken',
      tick: START_TICK + 7_230,
      actorId: PLAYER_ENTITY_ID,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      attachmentId,
      reason: 'tether_cut',
    },
    {
      seq: 1_204,
      event: 'tether:cut',
      tick: START_TICK + 7_230,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      velocity: { x: 32, z: -6 },
      speed: Math.hypot(32, -6),
    },
    {
      seq: 1_205,
      event: 'tether:released',
      tick: START_TICK + 7_230,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
    },
    {
      seq: 1_206,
      event: 'massSeed:deployed',
      tick: START_TICK + 7_240,
      seedId,
      ownerId: PLAYER_ENTITY_ID,
    },
    {
      seq: 1_207,
      event: 'massSeed:locked',
      tick: START_TICK + 7_252,
      seedId,
    },
    {
      seq: 1_208,
      event: 'fields:deployed',
      tick: START_TICK + 7_260,
      fieldId: 'field_repulsor_1_1',
      kind: 'repulsor',
      sourceId: 9_002,
      sourceOwnerId: PLAYER_ENTITY_ID,
    },
    weaponEvent({ seq: 1_209, event: 'combat:fire', tick: START_TICK + 7_300,
      weaponId: 'wpn_concussion_cannon_m', target }),
    weaponEvent({ seq: 1_210, event: 'combat:damage', tick: START_TICK + 7_310,
      weaponId: 'wpn_concussion_cannon_m', target }),
    weaponEvent({ seq: 1_211, event: 'projectile:hit', tick: START_TICK + 7_310,
      weaponId: 'wpn_concussion_cannon_m', target }),
    weaponEvent({ seq: 1_212, event: 'combat:fire', tick: START_TICK + 7_340,
      weaponId: 'wpn_gravity_marker_s', target }),
    weaponEvent({ seq: 1_213, event: 'combat:damage', tick: START_TICK + 7_350,
      weaponId: 'wpn_gravity_marker_s', target }),
    {
      seq: 1_214,
      event: 'combat:statusApplied',
      tick: START_TICK + 7_350,
      attackerId: PLAYER_ENTITY_ID,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      statusId: 'status_gravity_marked',
    },
    weaponEvent({ seq: 1_215, event: 'projectile:hit', tick: START_TICK + 7_350,
      weaponId: 'wpn_gravity_marker_s', target }),
    weaponEvent({ seq: 1_216, event: 'combat:fire', tick: START_TICK + 7_380,
      weaponId: 'wpn_momentum_sink_s', target }),
    weaponEvent({ seq: 1_217, event: 'combat:damage', tick: START_TICK + 7_390,
      weaponId: 'wpn_momentum_sink_s', target }),
    {
      seq: 1_218,
      event: 'combat:statusApplied',
      tick: START_TICK + 7_390,
      attackerId: PLAYER_ENTITY_ID,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      statusId: 'status_momentum_sink',
    },
    weaponEvent({ seq: 1_219, event: 'projectile:hit', tick: START_TICK + 7_390,
      weaponId: 'wpn_momentum_sink_s', target }),
    {
      seq: 1_220,
      event: 'entity:killed',
      tick: START_TICK + 7_420,
      entityId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      killerId: PLAYER_ENTITY_ID,
    },
  ];
  return {
    schema: 'spaceface.ceresFiveMinuteToolkitReceipt.v1',
    inputSource: 'public-keyboard-mouse',
    startTick: START_TICK + 7_200,
    endTick: START_TICK + 8_000,
    playerEntityId: PLAYER_ENTITY_ID,
    initialHostiles: TOOLKIT_HOSTILES.map((entry) => ({ ...entry })),
    events,
    combatTrace: [
      {
        seq: 901,
        kind: 'physics.impulse',
        tick: START_TICK + 7_310,
        actorId: PLAYER_ENTITY_ID,
        targetId: target.entityId,
        weaponId: 'wpn_concussion_cannon_m',
        reason: 'weapon_hit',
        provenance: 'concussion_slug',
        impulse: { x: 400, z: -20 },
      },
      {
        seq: 902,
        kind: 'momentumSink.frameBound',
        tick: START_TICK + 7_390,
        actorId: PLAYER_ENTITY_ID,
        targetId: target.entityId,
        frameKind: 'attacker_velocity',
        frameVelocity: { x: 42, z: -8 },
      },
    ],
    destroyedRecordIds: [destroyedWorldRecordId],
  };
}

function weaponEvent({ seq, event, tick, weaponId, target }) {
  return {
    seq,
    event,
    tick,
    weaponId,
    ...(event === 'combat:fire'
      ? { ownerId: PLAYER_ENTITY_ID }
      : event === 'projectile:hit'
        ? {
            ownerId: PLAYER_ENTITY_ID,
            targetId: target.entityId,
            targetWorldRecordId: target.worldRecordId,
          }
        : {
            attackerId: PLAYER_ENTITY_ID,
            targetId: target.entityId,
            targetWorldRecordId: target.worldRecordId,
            amount: 3,
            applied: 3,
          }),
  };
}

function findToolkitEvent(toolkit, event, weaponId = null) {
  const row = toolkit.events.find((entry) => (
    entry.event === event && (weaponId == null || entry.weaponId === weaponId)
  ));
  assert.ok(row, `fixture is missing ${event}${weaponId ? ` for ${weaponId}` : ''}`);
  return row;
}

function removeToolkitEvent(toolkit, event, weaponId = null) {
  const index = toolkit.events.findIndex((entry) => (
    entry.event === event && (weaponId == null || entry.weaponId === weaponId)
  ));
  assert.notEqual(index, -1, `fixture is missing removable ${event}`);
  toolkit.events.splice(index, 1);
}

function findToolkitStatus(toolkit, statusId) {
  const row = toolkit.events.find((entry) => (
    entry.event === 'combat:statusApplied' && entry.statusId === statusId
  ));
  assert.ok(row, `fixture is missing status ${statusId}`);
  return row;
}

function removeToolkitStatus(toolkit, statusId) {
  const index = toolkit.events.findIndex((entry) => (
    entry.event === 'combat:statusApplied' && entry.statusId === statusId
  ));
  assert.notEqual(index, -1, `fixture is missing removable status ${statusId}`);
  toolkit.events.splice(index, 1);
}

function findCombatTrace(toolkit, kind) {
  const row = toolkit.combatTrace.find((entry) => entry.kind === kind);
  assert.ok(row, `fixture is missing combat trace ${kind}`);
  return row;
}

function removeCombatTrace(toolkit, kind) {
  const index = toolkit.combatTrace.findIndex((entry) => entry.kind === kind);
  assert.notEqual(index, -1, `fixture is missing removable combat trace ${kind}`);
  toolkit.combatTrace.splice(index, 1);
}

function observationFrames(visibilityAuthority = visibilitySamples(1)) {
  const frames = [];
  for (let bucket = 0; bucket < 5; bucket += 1) {
    const startTick = START_TICK + bucket * 3_600;
    const endTick = bucket === 4 ? END_TICK : startTick + 3_599;
    frames.push(observationFrame(bucket, startTick, false));
    frames.push(observationFrame(bucket, endTick, true));
  }
  frames.push(
    observationFrame(1, START_TICK + 7_100, true, {
      x: AMBUSH_ZONE_GLOBAL.x - 220,
      z: AMBUSH_ZONE_GLOBAL.z,
    }),
    observationFrame(1, START_TICK + 7_120, true, {
      x: AMBUSH_ZONE_GLOBAL.x,
      z: AMBUSH_ZONE_GLOBAL.z,
    }),
    observationFrame(1, START_TICK + 7_160, true, {
      x: AMBUSH_ZONE_GLOBAL.x + 220,
      z: AMBUSH_ZONE_GLOBAL.z,
    }),
  );
  for (const sample of visibilityAuthority) {
    if (frames.some((frame) => frame.tick === sample.tick)) continue;
    const bucket = Math.min(4, Math.max(0, Math.floor((sample.tick - START_TICK) / 3_600)));
    frames.push(observationFrame(bucket, sample.tick, true));
  }
  const emptyStartTick = visibilityAuthority.find((sample) => sample.visibleActivityCount === 0)?.tick;
  const emptyEndSample = visibilityAuthority.find((sample) => (
    Number.isSafeInteger(emptyStartTick) && sample.tick > emptyStartTick
      && sample.visibleActivityCount > 0
  ));
  const emptyEndTick = emptyEndSample?.tick ?? null;
  const bySampleTick = new Map(visibilityAuthority.map((sample) => [sample.tick, sample]));
  for (const frame of frames) {
    if (Number.isSafeInteger(emptyStartTick) && Number.isSafeInteger(emptyEndTick)
        && frame.tick >= emptyStartTick && frame.tick < emptyEndTick) {
      frame.visibleActivityIds = [];
      frame.visibleActivityCount = 0;
      continue;
    }
    const sample = bySampleTick.get(frame.tick);
    if (!sample) continue;
    frame.nearestPocketId = sample.nearestPocketId;
    frame.visibleActivityIds = visibleIdsForPocket(sample.nearestPocketId)
      .slice(0, sample.visibleActivityCount);
    frame.visibleActivityCount = sample.visibleActivityCount;
  }
  const orderedPockets = [
    'ceres_refinery_pocket',
    'ceres_working_seam',
    'ceres_ambush_run',
    'ceres_cathedral_grave',
  ];
  for (const [index, pocketId] of orderedPockets.entries()) {
    if (frames.some((frame) => frame.nearestPocketId === pocketId
        && frame.visibleActivityCount >= 2)) continue;
    const tick = Math.min(END_TICK - 10, Number(emptyEndTick || START_TICK) + 10 + index * 10);
    const bucket = Math.min(4, Math.max(0, Math.floor((tick - START_TICK) / 3_600)));
    const frame = observationFrame(bucket, tick, true, pocketFramePosition(
      orderedPockets.indexOf(pocketId),
    ));
    frame.nearestPocketId = pocketId;
    frame.visibleActivityIds = visibleIdsForPocket(pocketId);
    frame.visibleActivityCount = frame.visibleActivityIds.length;
    frames.push(frame);
  }
  return frames.sort((left, right) => left.tick - right.tick);
}

function observationFrame(bucket, tick, moved, playerPos = null) {
  const actorStates = ACTOR_SLOT_IDS.map((slotId, index) => {
    const jobId = slotId === 'ceres_cinder_service_hauler'
      ? null
      : index === 0
      ? 'ceres_job_refinery_freight'
      : index === 1 ? 'ceres_job_seam_extraction' : `ceres_job_${slotId}`;
    const baseX = bucket * 100 + index * 3;
    const baseZ = bucket * -40 + index * 2;
    return {
      slotId,
      worldRecordId: `wr_npc_${String(index + 1).padStart(8, '0')}`,
      jobId,
      team: 2,
      factionId: slotId === 'ceres_refinery_tender' ? 'faction_pitborn' : 'faction_free',
      lawful: slotId === 'ceres_ambush_escort' || slotId === 'ceres_cathedral_patrol',
      passive: true,
      roe: null,
      serviceHookId: slotId === 'ceres_cinder_service_hauler'
        ? 'ceres_cinder_sluice_service'
        : null,
      ceresActivityJobOwned: slotId === 'ceres_cinder_service_hauler' ? false : null,
      x: baseX + (moved && index === 0 ? 12 : 0),
      z: baseZ + (moved && index === 1 ? 9 : 0),
    };
  });
  const nearestPocketId = playerPos ? 'ceres_ambush_run' : pocketIdForBucket(bucket);
  const visibleActivityIds = visibleIdsForPocket(nearestPocketId);
  return {
    tick,
    observedTick: tick,
    clippedFromObservedTick: null,
    sectorId: 'sector_ceres_belt',
    timeScale: 1,
    playerAlive: true,
    playerPos: playerPos || pocketFramePosition(bucket),
    simTimeS: (tick - START_TICK) / TICK_RATE_HZ,
    actorSlotIds: [...ACTOR_SLOT_IDS],
    objectSlotIds: [...OBJECT_SLOT_IDS],
    collisionAnchorSlotIds: [...COLLISION_ANCHOR_SLOT_IDS],
    actorStates,
    nearestPocketId,
    visibleActivityIds: [...visibleActivityIds],
    visibleActivityCount: visibleActivityIds.length,
  };
}

function visibleIdsForPocket(pocketId) {
  return [...({
    ceres_refinery_pocket: ['ceres_refinery_hauler', 'ceres_refinery_tender'],
    ceres_working_seam: ['ceres_seam_miner', 'ceres_seam_ore_clast'],
    ceres_ambush_run: ['ceres_ambush_loaded_hauler', 'ceres_throughline_collision_anchor'],
    ceres_cathedral_grave: ['ceres_cathedral_salvor', 'ceres_cathedral_grave_shard'],
  }[pocketId] || [])];
}

function pocketFramePosition(bucket) {
  const pocketId = pocketIdForBucket(bucket);
  const pocket = CERES_ACTIVITY_POCKETS_BY_ID[pocketId];
  return sectorLocalToGlobalForSector(
    pocket.activityAnchor.localPos,
    CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
  );
}

function pocketIdForBucket(bucket) {
  return [
    'ceres_refinery_pocket',
    'ceres_working_seam',
    'ceres_ambush_run',
    'ceres_cathedral_grave',
    'ceres_refinery_pocket',
  ][bucket];
}

function movingJobBuckets(frames) {
  return Array.from({ length: 5 }, (_, bucket) => {
    const startTick = START_TICK + bucket * 3_600;
    const endTick = startTick + 3_600;
    const startFrame = frames.find((frame) => frame.tick === startTick);
    const endFrame = frames.find((frame) => frame.tick === (bucket === 4 ? END_TICK : endTick - 1));
    const jobIds = ['ceres_job_refinery_freight', 'ceres_job_seam_extraction'];
    const tracks = jobIds.map((jobId) => {
      const start = startFrame.actorStates.find((row) => row.jobId === jobId);
      const end = endFrame.actorStates.find((row) => row.jobId === jobId);
      return {
        jobId,
        slotId: start.slotId,
        start: { tick: startFrame.tick, x: start.x, z: start.z },
        end: { tick: endFrame.tick, x: end.x, z: end.z },
      };
    });
    return { bucket, startTick, endTick, movingJobIds: jobIds, tracks };
  });
}

function physicalArrival(pocketId, tick) {
  const pocket = CERES_ACTIVITY_POCKETS_BY_ID[pocketId];
  assert.ok(pocket, `fixture is missing canonical pocket ${pocketId}`);
  const targetPos = sectorLocalToGlobalForSector(
    pocket.activityAnchor.localPos,
    CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
  );
  const navigation = POCKET_NAVIGATION[pocketId];
  const navigationTargetPos = navigation
    ? sectorLocalToGlobalForSector(
        navigation.localPos,
        CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
      )
    : null;
  return {
    pocketId,
    tick,
    source: pocketId === 'ceres_refinery_pocket'
      ? 'public-sandbox-entry'
      : 'public-map-autopilot',
    physicalReceipt: {
      pass: true,
      targetId: pocket.activityAnchor.id,
      targetName: pocket.label,
      playerPos: { x: targetPos.x + 24, z: targetPos.z },
      targetPos,
      distanceWU: 24,
      navigationLabel: navigation?.label ?? null,
      navigationTargetEntityId: navigation?.entityId ?? null,
      navigationTargetIdentity: navigation?.identity ?? null,
      navigationTargetPos,
      autopilotStatus: navigation ? 'arrived' : null,
    },
  };
}

function accessibilitySnapshot({
  tick,
  motionPreference = 'full',
  motionReduce = false,
  flashReduce = false,
}) {
  return {
    tick,
    motionPreference,
    motionReduce,
    flashReduce,
    playerAlive: true,
    playerEntityId: PLAYER_ENTITY_ID,
    playerPos: { x: 3_040, z: -920 },
    playerVel: { x: 0, z: 0 },
    playerRot: 0.25,
    cameraZoomWU: 144,
    actorSlotIds: [...ACTOR_SLOT_IDS],
    objectSlotIds: [...OBJECT_SLOT_IDS],
    collisionAnchorSlotIds: [...COLLISION_ANCHOR_SLOT_IDS],
    activityIdentities: [
      ...ACTOR_SLOT_IDS.map((slotId, index) => ({ slotId, entityId: 100 + index })),
      ...OBJECT_SLOT_IDS.map((slotId, index) => ({ slotId, entityId: 200 + index })),
      ...COLLISION_ANCHOR_SLOT_IDS.map((slotId, index) => ({ slotId, entityId: 300 + index })),
    ].sort((left, right) => left.slotId.localeCompare(right.slotId)),
    hostileWorldRecordIds: [TOOLKIT_HOSTILES[1].worldRecordId],
  };
}

function artifactDescriptor(runtimeKind, kind, name, bytes, digestCharacter) {
  return {
    kind,
    path: `${ARTIFACT_ROOT_PREFIX}/${runtimeKind}/${name}`,
    bytes,
    sha256: digest(digestCharacter),
  };
}

function pairFixture() {
  const browser = runtimeFixture('browser');
  const electron = runtimeFixture('electron');
  return {
    browser,
    electron,
    browserReview: humanReview(browser),
    ledgers: {
      browser: consumedLedger(browser),
      electron: consumedLedger(electron),
    },
    currentFingerprint: {
      id: 'clean-candidate',
      digest: WORKTREE_DIGEST,
      head: GIT_HEAD,
      branch: 'master',
      changedFileCount: 0,
    },
  };
}

function consumedLedger(runtimeEvidence) {
  return {
    schema: 'spaceface.validation-broker-claim-consumed.v1',
    consumedAt: runtimeEvidence.runtimeKind === 'browser'
      ? '2026-08-08T12:00:00.000Z'
      : '2026-08-08T12:10:00.000Z',
    mode: 'acceptance',
    claimId: runtimeEvidence.authority.claimId,
    runtimeKind: runtimeEvidence.runtimeKind,
    candidateDigest: runtimeEvidence.authority.candidateDigest,
    digests: {
      sourceCandidateDigest: runtimeEvidence.authority.sourceCandidateDigest,
      worktreeDigest: runtimeEvidence.authority.worktree.digest,
    },
  };
}

function humanReview(runtimeEvidence, overrides = {}) {
  const metric = runtimeEvidence.activityVisibility.recordedMetric;
  const verdict = overrides.verdict || 'KEEP';
  return {
    schema: REVIEW_SCHEMA,
    verdict,
    readsAsBriefIntentionalVoid: verdict === 'KEEP',
    note: 'The measured gap reads as a brief intentional void between adjacent authored pockets.',
    candidateHash: runtimeEvidence.authority.candidateHash,
    candidateDigest: runtimeEvidence.authority.candidateDigest,
    sourceCandidateDigest: runtimeEvidence.authority.sourceCandidateDigest,
    routeId: runtimeEvidence.route.id,
    runtimeKind: runtimeEvidence.runtimeKind,
    seed: runtimeEvidence.route.seed,
    maxZeroVisibleActivityS: metric.maxZeroVisibleActivityS,
    gapMetricDigest: metric.metricDigest,
    intervalStartTick: metric.intervalStartTick,
    intervalEndTick: metric.intervalEndTick,
    adjacentPocketTransition: structuredClone(metric.adjacentPocketTransition),
    artifactIdentity: structuredClone(runtimeEvidence.artifactIdentity),
    reviewedAt: '2026-08-08T12:30:00.000Z',
    reviewer: 'candidate-bound-visual-reviewer',
    ...overrides,
  };
}

function visibilitySamples(durationS) {
  const emptyStart = START_TICK + TICK_RATE_HZ;
  const emptyEnd = emptyStart + durationS * TICK_RATE_HZ;
  assert.ok(emptyEnd < END_TICK, 'fixture gap must fit inside the exact five-minute horizon');
  return [
    {
      tick: START_TICK,
      visibleActivityCount: 2,
      nearestPocketId: 'ceres_refinery_pocket',
    },
    {
      tick: emptyStart,
      visibleActivityCount: 0,
      nearestPocketId: null,
    },
    {
      tick: emptyEnd,
      visibleActivityCount: 1,
      nearestPocketId: 'ceres_working_seam',
    },
    {
      tick: END_TICK,
      visibleActivityCount: 2,
      nearestPocketId: 'ceres_cathedral_grave',
    },
  ];
}

function recordedGapMetric(projection) {
  return {
    ...structuredClone(projection),
    metricDigest: gapMetricDigest(projection),
  };
}

function horizon() {
  return {
    startTick: START_TICK,
    endTick: END_TICK,
    fixedTicks: FIXED_TICKS,
    tickRateHz: TICK_RATE_HZ,
    simulationSeconds: SIMULATION_SECONDS,
  };
}

function publicInputReceipt() {
  return {
    action: 'thrustForward',
    pressTick: START_TICK + 10,
    observedTick: START_TICK + 11,
    releaseTick: START_TICK + 30,
    neutralTick: START_TICK + 31,
    observedState: { active: true },
    neutralState: { active: false },
    motionObserved: true,
  };
}

function pocketSettlePage({ tick, endTick, distanceWU, pollSpeeds }) {
  const events = [];
  const heldKeys = new Set();
  const speeds = [...pollSpeeds];
  const state = {
    tick,
    playerId: 1,
    entities: new Map([[1, {
      id: 1,
      pos: { x: distanceWU, z: 0 },
      vel: { x: speeds[0], z: 0 },
      rot: Math.PI,
    }]]),
  };
  const runInPage = (callback, argument) => {
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const previousWindow = globalThis.window;
    globalThis.window = { SF: { state } };
    try {
      return callback(argument);
    } finally {
      if (hadWindow) globalThis.window = previousWindow;
      else delete globalThis.window;
    }
  };
  return {
    events,
    page: {
      keyboard: {
        async down(key) {
          heldKeys.add(key);
          events.push(`down:${key}`);
        },
        async up(key) {
          heldKeys.delete(key);
          events.push(`up:${key}`);
        },
      },
      async waitForFunction(callback, argument, options) {
        events.push(`wait:speed-or-horizon:${options.timeout}`);
        assert.equal(argument.terminalTick, endTick);
        assert.equal(heldKeys.has('Digit0'), true, 'the public brake stays held while polling');
        let terminal = false;
        for (const speed of speeds) {
          state.entities.get(state.playerId).vel.x = speed;
          terminal = runInPage(callback, argument);
          events.push(`poll:${speed}:${terminal}`);
          if (terminal) break;
        }
        assert.equal(terminal, true,
          'the fake frames must satisfy the exact speed-or-horizon terminal predicate');
      },
      async evaluate(callback, argument) {
        assert.equal(heldKeys.has('Digit0'), true, 'the final status is read while braking remains held');
        events.push('read:settled-status');
        return runInPage(callback, argument);
      },
    },
  };
}

function pocketApproachTwoPhasePage({
  targetPoint,
  endTick,
  tick = 1_000,
  initialDistanceWU = 140,
  initialSpeed = 78,
  initialRot = -0.7,
  turnConverges = true,
}) {
  const heldKeys = new Set();
  const sequence = [];
  const settleStartDistances = [];
  const player = {
    id: 1,
    pos: { x: targetPoint.x - initialDistanceWU, z: targetPoint.z },
    vel: { x: initialSpeed, z: 0 },
    rot: initialRot,
  };
  const state = {
    tick,
    playerId: player.id,
    entities: new Map([[player.id, player]]),
  };
  const runInPage = (callback, argument) => {
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const previousWindow = globalThis.window;
    globalThis.window = { SF: { state } };
    try {
      return callback(argument);
    } finally {
      if (hadWindow) globalThis.window = previousWindow;
      else delete globalThis.window;
    }
  };
  const harness = {
    sequence,
    settleStartDistances,
    page: {
      isClosed() { return false; },
      locator() {
        return {
          async waitFor() {},
          async focus() {},
        };
      },
      mouse: { async up() {} },
      keyboard: {
        async down(key) { heldKeys.add(key); },
        async up(key) { heldKeys.delete(key); },
      },
      async evaluate(callback, argument) {
        return runInPage(callback, argument);
      },
      async waitForFunction(callback, argument, options) {
        assert.equal(options.timeout, 10_000);
        assert.equal(argument.terminalTick, endTick);
        assert.equal(heldKeys.has('Digit0'), true);
        sequence.push('settle');
        settleStartDistances.push(Math.hypot(
          targetPoint.x - player.pos.x,
          targetPoint.z - player.pos.z,
        ));
        player.vel.x = 0.8;
        assert.equal(runInPage(callback, argument), true);
      },
      async waitForTimeout(durationMs) {
        if (heldKeys.has('KeyA') || heldKeys.has('KeyD')) {
          assert.equal(durationMs, 80);
          sequence.push('turn');
          if (turnConverges) player.rot = 0;
        } else if (heldKeys.has('KeyS')) {
          assert.equal(durationMs, 100);
          sequence.push('decelerate');
          player.pos.x = targetPoint.x - 132;
          player.vel.x = 40;
        } else if (heldKeys.has('KeyW')) {
          assert.equal(durationMs, 160);
          sequence.push('thrust');
          player.pos.x = targetPoint.x - 80;
          player.vel.x = 78;
          player.rot = 0;
        } else assert.fail('two-phase approach emitted an unexpected control pulse');
      },
    },
  };
  return harness;
}

function actualPilotSources() {
  const librarySource = readFileSync(
    new URL('../scripts/lib/ceresFiveMinuteAcceptance.mjs', import.meta.url),
    'utf8',
  );
  const validatorStart = librarySource.indexOf('export function validateCeresPilotSources');
  const validatorEnd = librarySource.indexOf('export function projectCeresActivityFrame', validatorStart);
  assert.ok(validatorStart >= 0 && validatorEnd > validatorStart,
    'actual-source audit must isolate only its own forbidden-pattern declarations');
  return {
    routeSource: `${librarySource.slice(0, validatorStart)}\n${librarySource.slice(validatorEnd)}`,
    checkerSource: readFileSync(
      new URL('../scripts/check-ceres-five-minute.mjs', import.meta.url),
      'utf8',
    ),
  };
}

function digest(character) {
  return character.repeat(64);
}
