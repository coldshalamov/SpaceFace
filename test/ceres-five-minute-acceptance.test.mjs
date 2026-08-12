import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';

import {
  CERES_TOOLKIT_ROUTE_RESERVE_TICKS,
  CERES_TOOLKIT_TRANSIT_ESCAPE_RADIUS_WU,
  CERES_TOOLKIT_TRANSIT_HANDOFF_RESERVE_TICKS,
  accessibilityCheckpointIdentity,
  canonicalGapProjection,
  ceresPreContinueLegReserveTicks,
  ceresHostileOpportunityPass,
  ceresLawfulServiceClassificationPass,
  ceresToolkitConflictAuthorityPass,
  chooseCeresPocketApproachAction,
  countsTowardCeresPocketVisibility,
  createAccessibilityMatchedCheckpoint,
  deriveZeroVisibleActivityIntervals,
  disableCeresTutorialThroughPublicSettings,
  drivePublicAnchorCollision,
  drivePublicToCeresPoint,
  drivePublicToPocketAnchor,
  evaluateCeresToolkitCombatCompletion,
  evaluateCeresToolkitFinalReceipt,
  evaluateCeresToolkitTransitHandoff,
  evaluateCeresFiveMinutePair,
  evaluateCeresFiveMinuteRuntime,
  evaluateCeresHumanReview,
  evaluateZeroVisibilityMetric,
  gapMetricDigest,
  fireCeresPublicCombatVolley,
  normalizeCeresTrace,
  planCeresThroughlineToolkitReposition,
  planCeresToolkitTransitHandoff,
  planCeresWorkingSeamEgress,
  pointPublicAtCeresHostile,
  prepareCeresPublicTetherFireSurface,
  projectCeresRouteFailureDiagnostics,
  projectCeresActivityFrame,
  runCeresPreRepulsorCombatLoop,
  runCeresToolkitTransitHandoff,
  selectCeresHostilePointingStatus,
  selectCeresTetherCombatStatus,
  settleCeresPocketApproach,
  triggerCeresPublicFlightAction,
  validateCeresPilotSources,
  validatePublicInputReceipt,
  waitForCeresExactActiveTetherAuthority,
  waitForCeresHostileMasslineAcquisition,
  waitForCeresToolkitConflictAuthority,
} from '../scripts/lib/ceresFiveMinuteAcceptance.mjs';
import { ZONE_CERES_THROUGHLINE } from '../src/data/authoredPlaces.js';
import {
  CERES_ACTIVITY_POCKETS_BY_ID,
  CERES_REFERENCE_ACCEPTANCE_ENTRY,
} from '../src/data/sectorActivityPockets.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { combatFlag } from '../src/data/featureFlags.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { asteroidFormations } from '../src/systems/asteroidFormations.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { projectPilotFlightControls } from '../src/systems/input.js';
import { createMasslineInputGrammar } from '../src/systems/masslineInputGrammar.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';

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
    ceresActivityAmbushPhase: 'conflict',
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
    ceresActivityAmbushPhase: 'conflict',
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
const TOOLKIT_COMBAT_AUTHORITY = Object.freeze({
  targetEntityId: TOOLKIT_HOSTILES[0].entityId,
  targetWorldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
});
const TOOLKIT_WEAPON_IDS = Object.freeze([
  'wpn_concussion_cannon_m',
  'wpn_gravity_marker_s',
  'wpn_momentum_sink_s',
]);
const SEED47_REAVER_KILL_TICK_CEILING = 1_120;
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
    ['hostile loses adopted conflict marker', (rows) => { rows[0].ceresActivityAmbushPhase = 'offer'; }],
    ['hostile keeps only the zone half of the cohort identity', (rows) => { rows[0].squadId = null; }],
    ['hostile keeps only the squad half of the cohort identity', (rows) => { rows[0].zoneId = null; }],
  ]) {
    const candidate = structuredClone(hostiles);
    mutate(candidate);
    assert.equal(ceresHostileOpportunityPass(candidate), false, label);
  }

  const prebound = {
    playerEntityId: PLAYER_ENTITY_ID,
    boundHostiles: hostiles.map((row) => ({
      entityId: row.entityId,
      worldRecordId: row.worldRecordId,
    })),
  };
  const conflictBaseline = (initialHostiles) => ({
    playerEntityId: PLAYER_ENTITY_ID,
    initialHostiles,
    boundAuthority: prebound.boundHostiles.map((row) => ({
      ...row,
      exactPairAlive: true,
      terminalMissing: false,
    })),
    director: {
      durablePhase: 'revealed',
      live: {
        id: 'ceres:activity:throughline-ambush',
        phase: 'conflict',
        entityIds: prebound.boundHostiles.map((row) => row.entityId),
      },
    },
  });
  assert.equal(ceresToolkitConflictAuthorityPass(conflictBaseline(hostiles), prebound), true);
  const offered = structuredClone(hostiles);
  offered[0].ceresActivityAmbushPhase = 'offer';
  assert.equal(ceresToolkitConflictAuthorityPass(conflictBaseline(offered), prebound), false,
    'pre-reposition offer authority cannot freeze the toolkit receipt');
  const replacement = structuredClone(hostiles);
  replacement[0].entityId += 10_000;
  assert.equal(ceresToolkitConflictAuthorityPass(conflictBaseline(replacement), prebound), false,
    'post-reposition classification cannot replace the bound durable cohort');

  assert.equal(countsTowardCeresPocketVisibility('ceres_cinder_service_hauler'), false);
  assert.equal(countsTowardCeresPocketVisibility('ceres_throughline_collision_anchor'), true);
});

test('toolkit conflict authority is immediate, honestly deferred, and terminal-fast', async () => {
  const prebound = {
    playerEntityId: PLAYER_ENTITY_ID,
    boundHostiles: TOOLKIT_HOSTILES.map((row) => ({
      entityId: row.entityId,
      worldRecordId: row.worldRecordId,
    })),
  };
  const conflictPage = ({ phases, terminalMissingIndex = -1, initialTick = 1_000 }) => {
    let tick = initialTick;
    let reads = 0;
    let waits = 0;
    const page = {
      async evaluate(_callback, authority) {
        assert.deepEqual(authority, prebound);
        const phase = phases[Math.min(reads, phases.length - 1)];
        reads += 1;
        const conflict = phase === 'conflict';
        const done = phase === 'done';
        const initialHostiles = TOOLKIT_HOSTILES.flatMap((row, index) => (
          index === terminalMissingIndex ? [] : [{
            ...row,
            ceresActivityAmbushPhase: conflict ? 'conflict' : 'offer',
            passive: !conflict,
            roe: conflict ? 'weapons_free' : 'hold_fire',
          }]
        ));
        return {
          startTick: tick,
          playerEntityId: PLAYER_ENTITY_ID,
          combatTraceStartSeq: 1_200,
          initialHostiles,
          boundAuthority: prebound.boundHostiles.map((row, index) => ({
            ...row,
            exactPairAlive: index !== terminalMissingIndex,
            terminalMissing: index === terminalMissingIndex,
            durableAlive: index === terminalMissingIndex ? false : true,
            durableOutcome: index === terminalMissingIndex ? 'destroyed' : null,
          })),
          director: {
            simTime: tick / TICK_RATE_HZ,
            durablePhase: done ? 'done' : 'revealed',
            durableOutcome: done ? 'escaped' : null,
            pressureCombat: 44,
            lastMeaningfulAt: 0,
            ambushCooldownAt: null,
            pending: [],
            live: {
              id: 'ceres:activity:throughline-ambush',
              phase,
              startedAt: 990 / TICK_RATE_HZ,
              springAt: 1_009 / TICK_RATE_HZ,
              deadlineAt: 20_000 / TICK_RATE_HZ,
              entityIds: TOOLKIT_HOSTILES.map((row) => row.entityId),
            },
          },
        };
      },
      async waitForTimeout(durationMs) {
        assert.equal(durationMs, 150);
        waits += 1;
        tick += 9;
      },
    };
    return {
      page,
      get reads() { return reads; },
      get waits() { return waits; },
    };
  };

  const immediate = conflictPage({ phases: ['conflict'] });
  const immediateBaseline = await waitForCeresToolkitConflictAuthority(
    immediate.page, prebound, 5_000,
  );
  assert.equal(ceresToolkitConflictAuthorityPass(immediateBaseline, prebound), true);
  assert.deepEqual({ reads: immediate.reads, waits: immediate.waits }, { reads: 1, waits: 0 });

  const deferred = conflictPage({ phases: ['offer', 'conflict'] });
  const deferredBaseline = await waitForCeresToolkitConflictAuthority(
    deferred.page, prebound, 5_000,
  );
  assert.equal(ceresToolkitConflictAuthorityPass(deferredBaseline, prebound), true);
  assert.deepEqual({ reads: deferred.reads, waits: deferred.waits }, { reads: 2, waits: 1 },
    'one real authored offer frame requires exactly one honest poll defer');
  assert.deepEqual(deferredBaseline.conflictAuthorityWait, {
    waitStartTick: 1_000,
    deadlineTick: 4_000,
    polls: 2,
  }, 'the unchanged 50-second simulation window remains bound to the first observation');

  for (const [label, harness, pattern] of [
    ['durable done', conflictPage({
      phases: ['done'],
      initialTick: 5_880,
    }), /durable done \(escaped\)/],
    ['terminally missing exact pair', conflictPage({
      phases: ['offer'],
      terminalMissingIndex: 1,
    }), /lost an exact prebound hostile pair/],
  ]) {
    await assert.rejects(
      waitForCeresToolkitConflictAuthority(harness.page, prebound,
        label === 'durable done' ? 6_000 : 5_000),
      (error) => {
        assert.match(error.message, pattern);
        assert.equal(error.ceresToolkitConflictDiagnostic?.polls, 1);
        assert.equal(error.ceresToolkitConflictDiagnostic?.final?.director?.durableOutcome,
          label === 'durable done' ? 'escaped' : null);
        return true;
      },
      label,
    );
    assert.deepEqual({ reads: harness.reads, waits: harness.waits }, { reads: 1, waits: 0 },
      `${label} must stop after one diagnostic read without wall waits or public input`);
  }
});

test('Ceres reference launch disables onboarding through public Settings before Sandbox', async () => {
  let screen = 'mainMenu';
  let activeTab = null;
  let tutorialHints = true;
  const actions = [];
  const page = {
    getByRole(role, options) {
      assert.equal(role, options?.name === 'Gameplay' ? 'tab' : 'button');
      return {
        async click() {
          const name = options?.name;
          actions.push(`click:${name}`);
          if (name === 'Settings') screen = 'settings';
          else if (name === 'Gameplay') activeTab = 'Gameplay';
          else if (name === 'Back') screen = 'mainMenu';
          else assert.fail(`unexpected public setup control ${name}`);
        },
      };
    },
    getByLabel(label, options) {
      assert.equal(label, 'Tutorial hints');
      assert.equal(options?.exact, true);
      return {
        async getAttribute(name) {
          assert.equal(name, 'aria-pressed');
          return String(tutorialHints);
        },
        async click() {
          assert.equal(screen, 'settings');
          assert.equal(activeTab, 'Gameplay');
          actions.push('click:Tutorial hints');
          tutorialHints = false;
        },
      };
    },
    async waitForFunction(_callback, argument) {
      if (typeof argument === 'string') assert.equal(screen, argument);
      else assert.equal(tutorialHints, false);
    },
    async evaluate() {
      return { tutorialHints };
    },
  };

  const receipt = await disableCeresTutorialThroughPublicSettings(page);
  assert.deepEqual(receipt, {
    pass: true,
    source: 'public-settings-ui',
    changed: true,
    tutorialHints: false,
    publicPath: ['Main Menu', 'Settings', 'Gameplay', 'Tutorial hints: Off', 'Back'],
  });
  assert.deepEqual(actions, [
    'click:Settings',
    'click:Gameplay',
    'click:Tutorial hints',
    'click:Back',
  ]);

  actions.length = 0;
  activeTab = null;
  const unchanged = await disableCeresTutorialThroughPublicSettings(page);
  assert.equal(unchanged.changed, false);
  assert.deepEqual(actions, ['click:Settings', 'click:Gameplay', 'click:Back'],
    'an already-disabled public setting remains idempotent');
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
  assert.equal(observations.toolkit.cameraReposition.source, 'public-flight-controls');
  assert.equal(observations.toolkit.cameraReposition.anchorImpactSeq,
    observations.anchorCollision.impacts[0].seq);
  assert.equal(observations.toolkit.cameraReposition.anchorImpactTick,
    observations.anchorCollision.impacts[0].tick);
  assert.equal(observations.toolkit.cameraReposition.impacts.every((impact) => (
    impact.aId === observations.toolkit.playerEntityId
      && impact.bId === observations.anchorCollision.anchorEntityId
  )), true);
  assert.deepEqual(observations.toolkit.initialHostiles, TOOLKIT_HOSTILES);
  assert.deepEqual(observations.toolkit.events.map((entry) => entry.event), [
    'tether:attached',
    'tether:latched',
    'tether:broken',
    'tether:cut',
    'tether:released',
    'massSeed:deployed',
    'massSeed:locked',
    'tether:attached',
    'tether:latched',
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
    'fields:deployed',
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

test('fresh anchor selection permits repeated truthful Rapier contacts in the route ledger', () => {
  const document = runtimeFixture('browser');
  const selected = document.observations.anchorCollision.impacts[0];
  const repeated = {
    ...structuredClone(selected),
    seq: selected.seq + 1,
    tick: document.observations.toolkit.cameraReposition.movementEndTick,
  };
  document.observations.anchorCollision.impacts.push(structuredClone(repeated));
  document.observations.playerImpactCapture.impacts.push(structuredClone(repeated));
  assert.equal(evaluateCeresFiveMinuteRuntime(document, { runtimeKind: 'browser' }).pass, true,
    'a residual exact-anchor contact at camera movement completion remains authorized');
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
    ['selected anchor impact loses event-time slot identity in both ledgers', (doc) => {
      doc.observations.anchorCollision.impacts[0].bAnchorSlotId = null;
      doc.observations.playerImpactCapture.impacts[0].bAnchorSlotId = null;
    }],
    ['fresh collision action receipt is missing', (doc) => {
      delete doc.observations.anchorCollision.action;
    }],
    ['collision action selects an old impact', (doc) => {
      doc.observations.anchorCollision.action.startTick =
        doc.observations.anchorCollision.action.selectedImpactTick + 1;
    }],
    ['same-tick collision predates the fresh event cursor', (doc) => {
      doc.observations.anchorCollision.action.startSeq =
        doc.observations.anchorCollision.action.selectedImpactSeq + 1;
    }],
    ['collision action completion overlaps camera movement', (doc) => {
      doc.observations.anchorCollision.action.completionTick =
        doc.observations.toolkit.cameraReposition.startTick + 1;
    }],
    ['fresh anchor impact is missing from its collision ledger', (doc) => {
      doc.observations.anchorCollision.impacts = [];
    }],
    ['exact anchor contact resumes after camera movement', (doc) => {
      const selected = doc.observations.anchorCollision.impacts[0];
      const late = {
        ...structuredClone(selected),
        seq: Math.max(...doc.observations.playerImpactCapture.impacts.map((impact) => impact.seq)) + 1,
        tick: doc.observations.toolkit.cameraReposition.movementEndTick + 1,
      };
      doc.observations.anchorCollision.impacts.push(structuredClone(late));
      doc.observations.playerImpactCapture.impacts.push(structuredClone(late));
    }],
    ['whole-route player-impact capture is missing', (doc) => {
      delete doc.observations.playerImpactCapture;
    }],
    ['Cathedral collision is appended to both impact ledgers', (doc) => {
      const impact = {
        seq: 2,
        event: 'physics:impact',
        tick: START_TICK + 10_900,
        aId: 1,
        bId: 777,
      };
      doc.observations.playerImpactCapture.impacts.push(structuredClone(impact));
      doc.observations.anchorCollision.impacts.push(structuredClone(impact));
    }],
    ['whole-route player-impact event list is omitted', (doc) => {
      delete doc.observations.playerImpactCapture.impacts;
    }],
    ['old-page observer stops without a public simulation pause', (doc) => {
      delete doc.observations.continueProof.preReloadPause;
    }],
    ['old-page observer claims a pause while simulation remains live', (doc) => {
      doc.observations.continueProof.preReloadPause.timeScale = 1;
    }],
    ['old-page pause lies beyond the original route horizon', (doc) => {
      doc.observations.continueProof.preReloadPause.tick = END_TICK + 1;
    }],
    ['post-Continue impact observer is not armed before the public transition', (doc) => {
      delete doc.observations.continueProof.postContinueObserverBridge;
    }],
    ['post-Continue impact observer begins after the loaded snapshot', (doc) => {
      doc.observations.continueProof.postContinueObserverBridge.firstFlightSampleTick =
        doc.observations.continueProof.loadedAtTick + 1;
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
  const exactEndpointResult = evaluateCeresFiveMinuteRuntime(exactEndpoint, { runtimeKind: 'browser' });
  assert.equal(exactEndpointResult.pass, true,
    `a genuinely exact endpoint remains valid: ${exactEndpointResult.failures.join(' | ')}`);
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
  const attachmentRows = toolkit.events.filter((entry) => entry.event === 'tether:attached');
  const latchRows = toolkit.events.filter((entry) => entry.event === 'tether:latched');
  assert.equal(attachmentRows.length, 2, 'combat must reacquire the same hostile with a second Massline');
  assert.equal(latchRows.length, 2);
  const combatAttached = attachmentRows[1];
  const combatLatched = latchRows[1];
  assert.equal(combatAttached.targetId, attached.targetId);
  assert.equal(combatAttached.targetWorldRecordId, attached.targetWorldRecordId);
  assert.notEqual(combatAttached.attachmentId, attached.attachmentId);
  assert.equal(combatLatched.targetId, combatAttached.targetId);
  assert.equal(combatLatched.previewMatched, true);
  assert.ok(lockedSeed.seq < combatAttached.seq && combatAttached.seq < combatLatched.seq);

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

test('pre-Repulsor combat closes from a fresh tombstone receipt before reacquisition', async () => {
  const routeStartTick = START_TICK;
  const deadlineTick = END_TICK - CERES_TOOLKIT_ROUTE_RESERVE_TICKS;
  const complete = structuredClone(runtimeFixture('browser').observations.toolkit);
  removeToolkitEvent(complete, 'fields:deployed');
  complete.endTick = START_TICK + 7_425;
  const staged = evaluateCeresToolkitCombatCompletion(complete, {
    routeStartTick,
    deadlineTick,
    ...TOOLKIT_COMBAT_AUTHORITY,
  });
  assert.equal(staged.pass, true, staged.failures.join('; '));
  assert.equal(evaluateCeresToolkitCombatCompletion(complete, {
    routeStartTick: complete.startTick,
    deadlineTick,
    ...TOOLKIT_COMBAT_AUTHORITY,
  }).pass, false,
  'the camera/collision receipt must be validated against the real route start, not toolkit start');

  const moveTargetConsequences = (receipt, from, to) => {
    for (const event of receipt.events) {
      if (event.targetId === from.entityId) event.targetId = to.entityId;
      if (event.entityId === from.entityId && event.event === 'entity:killed') {
        event.entityId = to.entityId;
      }
      if (event.targetWorldRecordId === from.worldRecordId) {
        event.targetWorldRecordId = to.worldRecordId;
      }
    }
    for (const event of receipt.combatTrace) {
      if (event.targetId === from.entityId) event.targetId = to.entityId;
    }
    receipt.destroyedRecordIds = [to.worldRecordId];
    return receipt;
  };
  const hostileB = TOOLKIT_HOSTILES[1];
  const forgedFullB = moveTargetConsequences(
    structuredClone(runtimeFixture('browser').observations.toolkit),
    TOOLKIT_HOSTILES[0],
    hostileB,
  );
  assert.equal(evaluateCeresToolkitFinalReceipt(forgedFullB, {
    routeStartTick,
    deadlineTick,
  }).pass, true,
  'the general final evaluator may prove the complete toolkit against any exact initial hostile');
  const forgedStagedB = structuredClone(forgedFullB);
  removeToolkitEvent(forgedStagedB, 'fields:deployed');
  forgedStagedB.endTick = START_TICK + 7_425;
  const exactTargetEvaluation = evaluateCeresToolkitCombatCompletion(forgedStagedB, {
    routeStartTick,
    deadlineTick,
    ...TOOLKIT_COMBAT_AUTHORITY,
  });
  assert.equal(exactTargetEvaluation.pass, false,
    'hostile B cannot close the staged loop while its exact fire-control authority remains A');
  assert.ok(exactTargetEvaluation.failures.some((failure) => failure.includes('exact combat target')),
    exactTargetEvaluation.failures.join('; '));

  let forgedReceiptReads = 0;
  let forgedPointingReads = 0;
  let forgedVolleys = 0;
  const recoveredFromHostileB = await runCeresPreRepulsorCombatLoop({
    routeStartTick,
    deadlineTick,
    ...TOOLKIT_COMBAT_AUTHORITY,
    readReceipt: async () => {
      forgedReceiptReads += 1;
      return forgedReceiptReads === 1 ? forgedStagedB : complete;
    },
    readPointingStatus: async () => {
      forgedPointingReads += 1;
      return {
        tick: forgedStagedB.endTick,
        candidates: [{
          id: TOOLKIT_HOSTILES[0].entityId,
          worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
          pointable: true,
          ndcX: 0,
          ndcY: 0,
        }],
        target: {
          id: TOOLKIT_HOSTILES[0].entityId,
          worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
          ndcX: 0,
          ndcY: 0,
        },
      };
    },
    fireVolley: async () => {
      forgedVolleys += 1;
      return { neutralTick: forgedStagedB.endTick + 26 };
    },
  });
  assert.equal(recoveredFromHostileB.evaluation.pass, true);
  assert.equal(forgedReceiptReads, 2,
    'the loop must consume a later exact-A receipt instead of returning on hostile B');
  assert.equal(forgedPointingReads, 1);
  assert.equal(forgedVolleys, 1);

  const lateSecondKill = structuredClone(runtimeFixture('browser').observations.toolkit);
  const repulsor = findToolkitEvent(lateSecondKill, 'fields:deployed');
  const secondHostile = TOOLKIT_HOSTILES[1];
  lateSecondKill.events.push({
    seq: repulsor.seq + 1,
    event: 'entity:killed',
    tick: repulsor.tick + 1,
    entityId: secondHostile.entityId,
    targetWorldRecordId: secondHostile.worldRecordId,
    killerId: PLAYER_ENTITY_ID,
  });
  lateSecondKill.destroyedRecordIds.push(secondHostile.worldRecordId);
  const finalWithLateKill = evaluateCeresToolkitFinalReceipt(lateSecondKill, {
    routeStartTick,
    deadlineTick,
  });
  assert.equal(finalWithLateKill.pass, true, finalWithLateKill.failures.join('; '));

  const lateTrace = structuredClone(runtimeFixture('browser').observations.toolkit);
  const lateTraceRepulsor = findToolkitEvent(lateTrace, 'fields:deployed');
  findCombatTrace(lateTrace, 'physics.impulse').tick = lateTraceRepulsor.tick + 1;
  findCombatTrace(lateTrace, 'momentumSink.frameBound').tick = lateTraceRepulsor.tick + 2;
  assert.equal(evaluateCeresToolkitFinalReceipt(lateTrace, {
    routeStartTick,
    deadlineTick,
  }).pass, false, 'Repulsor cannot precede a required production combat-trace consequence');

  const atDeadline = structuredClone(runtimeFixture('browser').observations.toolkit);
  atDeadline.endTick = deadlineTick;
  assert.equal(evaluateCeresToolkitFinalReceipt(atDeadline, {
    routeStartTick,
    deadlineTick,
  }).pass, false, 'the durable receipt must preserve the full post-toolkit route reserve');

  const incomplete = structuredClone(complete);
  incomplete.destroyedRecordIds = [];
  removeToolkitEvent(incomplete, 'entity:killed');
  incomplete.endTick = START_TICK + 7_400;
  let receiptReads = 0;
  let pointingReads = 0;
  let volleys = 0;
  const result = await runCeresPreRepulsorCombatLoop({
    routeStartTick,
    deadlineTick,
    ...TOOLKIT_COMBAT_AUTHORITY,
    readReceipt: async () => {
      receiptReads += 1;
      return receiptReads === 1 ? incomplete : complete;
    },
    readPointingStatus: async () => {
      pointingReads += 1;
      return {
        tick: incomplete.endTick,
        candidates: [{
          id: TOOLKIT_HOSTILES[0].entityId,
          worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
          distanceWU: 118,
          speed: 6,
          pointable: true,
          ndcX: 0.2,
          ndcY: -0.1,
        }],
        target: {
          id: TOOLKIT_HOSTILES[0].entityId,
          worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
          ndcX: 0.2,
          ndcY: -0.1,
        },
      };
    },
    fireVolley: async () => {
      volleys += 1;
      return { neutralTick: incomplete.endTick + 26 };
    },
  });
  assert.equal(result.evaluation.pass, true);
  assert.equal(result.volleyCount, 1);
  assert.equal(receiptReads, 2,
    'the second iteration must consume the delayed tombstone before any target lookup');
  assert.equal(pointingReads, 1);
  assert.equal(volleys, 1);

  let killRaceReads = 0;
  let killRacePointingReads = 0;
  const killRace = await runCeresPreRepulsorCombatLoop({
    routeStartTick,
    deadlineTick,
    ...TOOLKIT_COMBAT_AUTHORITY,
    readReceipt: async () => {
      killRaceReads += 1;
      return killRaceReads === 1 ? incomplete : complete;
    },
    readPointingStatus: async () => {
      killRacePointingReads += 1;
      return { tick: incomplete.endTick, candidates: [], target: null };
    },
    fireVolley: async () => assert.fail('a tombstone that lands during authority lookup needs no extra fire'),
  });
  assert.equal(killRace.evaluation.pass, true);
  assert.equal(killRace.volleyCount, 0);
  assert.equal(killRaceReads, 2,
    'authority loss must get one terminal durable-receipt read before it is classified as failure');
  assert.equal(killRacePointingReads, 1);

  let slowVolleyCount = 0;
  const slowReceipt = structuredClone(incomplete);
  slowReceipt.endTick = deadlineTick - 61;
  await assert.rejects(
    runCeresPreRepulsorCombatLoop({
      routeStartTick,
      deadlineTick,
      ...TOOLKIT_COMBAT_AUTHORITY,
      readReceipt: async () => slowReceipt,
      readPointingStatus: async () => ({
        tick: deadlineTick - 61,
        candidates: [{
          id: TOOLKIT_HOSTILES[0].entityId,
          worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
          pointable: true,
          ndcX: 0,
          ndcY: 0,
        }],
        target: {
          id: TOOLKIT_HOSTILES[0].entityId,
          worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
          ndcX: 0,
          ndcY: 0,
        },
      }),
      fireVolley: async () => {
        slowVolleyCount += 1;
        return { neutralTick: deadlineTick };
      },
    }),
    (error) => error?.ceresToolkitCombatDiagnostic?.reason === 'deadline',
  );
  assert.equal(slowVolleyCount, 1,
    'a slow volley is rejected from its observed neutral tick, not assumed wall duration');

  let boundaryPointingReads = 0;
  const boundary = structuredClone(incomplete);
  boundary.endTick = deadlineTick - 60;
  await assert.rejects(
    runCeresPreRepulsorCombatLoop({
      routeStartTick,
      deadlineTick,
      ...TOOLKIT_COMBAT_AUTHORITY,
      readReceipt: async () => boundary,
      readPointingStatus: async () => {
        boundaryPointingReads += 1;
        return { tick: deadlineTick - 60, candidates: [], target: null };
      },
      fireVolley: async () => assert.fail('deadline rejection must precede fire input'),
    }),
    (error) => error?.ceresToolkitCombatDiagnostic?.reason === 'deadline',
  );
  assert.equal(boundaryPointingReads, 0,
    'the final one-second volley reserve rejects before projection or public input');

  let unpointableError = null;
  try {
    await runCeresPreRepulsorCombatLoop({
      routeStartTick,
      deadlineTick,
      ...TOOLKIT_COMBAT_AUTHORITY,
      readReceipt: async () => incomplete,
      readPointingStatus: async () => ({
        tick: incomplete.endTick,
        candidates: [{
          id: TOOLKIT_HOSTILES[0].entityId,
          worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
          pos: { x: -4_575, z: 0 },
          vel: { x: -110, z: 0 },
          speed: 110,
          distanceWU: 4_575,
          pointable: false,
          ndcX: null,
          ndcY: null,
        }],
        target: null,
      }),
      fireVolley: async () => assert.fail('an unpointable target must not consume fire input'),
    });
  } catch (error) {
    unpointableError = error;
  }
  assert.equal(unpointableError?.ceresToolkitCombatDiagnostic?.reason, 'unpointable');
  assert.equal(
    unpointableError.ceresToolkitCombatDiagnostic.pointing.candidates[0].distanceWU,
    4_575,
  );

  const cameraFailureAfterTombstone = structuredClone(complete);
  cameraFailureAfterTombstone.cameraReposition.impactCapture.endSeq = 1_191;
  cameraFailureAfterTombstone.cameraReposition.impacts.push({
    seq: 1_191,
    event: 'physics:impact',
    tick: cameraFailureAfterTombstone.cameraReposition.movementEndTick,
    aId: PLAYER_ENTITY_ID,
    bId: 229,
    aType: 'ship',
    aWorldRecordId: null,
    aAnchorSlotId: null,
    bType: 'asteroid',
    bWorldRecordId: null,
    bAnchorSlotId: null,
    phase: 'movement',
  });
  let terminalReceiptReads = 0;
  let terminalPointingReads = 0;
  let terminalVolleys = 0;
  await assert.rejects(
    runCeresPreRepulsorCombatLoop({
      routeStartTick,
      deadlineTick,
      ...TOOLKIT_COMBAT_AUTHORITY,
      readReceipt: async () => {
        terminalReceiptReads += 1;
        return cameraFailureAfterTombstone;
      },
      readPointingStatus: async () => {
        terminalPointingReads += 1;
        return { tick: cameraFailureAfterTombstone.endTick, candidates: [], target: null };
      },
      fireVolley: async () => {
        terminalVolleys += 1;
        return { neutralTick: cameraFailureAfterTombstone.endTick + 1 };
      },
    }),
    (error) => error?.ceresToolkitCombatDiagnostic?.reason === 'invalid-receipt'
      && error.ceresToolkitCombatDiagnostic.receiptFailures.some((failure) => (
        failure.includes('camera reposition')
      )),
  );
  assert.equal(terminalReceiptReads, 1,
    'a durable exact-target tombstone makes the first red aggregate receipt terminal');
  assert.equal(terminalPointingReads, 0,
    'a terminal tombstone must reject the retained receipt failure before projection');
  assert.equal(terminalVolleys, 0,
    'a terminal tombstone must never fire another volley');
  const offscreenTetherAuthority = {
    targetId: TOOLKIT_HOSTILES[0].entityId,
    worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
    attachmentId: 'att_player_701_combat',
  };
  const tetheredOffscreen = selectCeresTetherCombatStatus({
    tick: incomplete.endTick,
    gunTargetId: TOOLKIT_HOSTILES[0].entityId,
    tether: {
      active: true,
      targetId: TOOLKIT_HOSTILES[0].entityId,
      attachmentId: offscreenTetherAuthority.attachmentId,
    },
    candidates: [{
      id: TOOLKIT_HOSTILES[0].entityId,
      worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
      alive: true,
      type: 'ship',
      zoneId: 'zone_ceres_ambush',
      squadId: 'zone_ceres_ambush',
      distanceWU: 388.72,
      speed: 112,
      pointable: false,
    }],
  }, offscreenTetherAuthority);
  assert.equal(tetheredOffscreen.target?.id, TOOLKIT_HOSTILES[0].entityId,
    'an exact active Massline keeps fire-control authority after the moving hull leaves the camera');
  assert.equal(tetheredOffscreen.target?.pointable, false);
  assert.equal(selectCeresTetherCombatStatus({
    ...tetheredOffscreen,
    gunTargetId: TOOLKIT_HOSTILES[0].entityId,
    tether: { active: true, targetId: TOOLKIT_HOSTILES[0].entityId, attachmentId: 'wrong' },
  }, offscreenTetherAuthority).target, null,
  'combat must fail closed if the exact second attachment is lost');

  const librarySource = readFileSync(
    new URL('../scripts/lib/ceresFiveMinuteAcceptance.mjs', import.meta.url),
    'utf8',
  );
  const seedIndex = librarySource.indexOf("key: 'Digit4'", librarySource.indexOf(
    'async function exercisePublicPhysicsToolkit',
  ));
  const combatRelatchIndex = librarySource.indexOf('const combatAttachedAction', seedIndex);
  const combatIndex = librarySource.indexOf('runCeresPreRepulsorCombatLoop({', seedIndex);
  const fixedVolleyIndex = librarySource.indexOf(
    'fireCeresPublicCombatVolley(page, fireControlTarget, box, {', combatIndex,
  );
  const repulsorIndex = librarySource.indexOf("key: 'Digit6'", combatIndex);
  assert.ok(seedIndex >= 0 && combatRelatchIndex > seedIndex && combatIndex > combatRelatchIndex
    && fixedVolleyIndex > combatIndex
    && repulsorIndex > fixedVolleyIndex,
    'the public route must lock Mass Seed, relatch the exact hostile, complete combat, then deploy Repulsor');
  assert.match(librarySource.slice(fixedVolleyIndex, repulsorIndex), /movePointer: false/,
    'off-screen Massline fire must retain the actionability-checked canvas point');
  assert.match(librarySource.slice(fixedVolleyIndex, repulsorIndex),
    /expectedFireOwnerId: firstCombatFire \? baseline\.playerEntityId : null/,
    'the first retained-pointer hold must prove a fresh player-owned production fire receipt');
});

test('toolkit transit handoff is exact, Cathedralward, and fails closed at every owned boundary', () => {
  const toolkit = toolkitReceiptFixture(TOOLKIT_HOSTILES[0].worldRecordId);
  const handoff = toolkit.transitHandoff;
  const deadlineTick = END_TICK - CERES_TOOLKIT_ROUTE_RESERVE_TICKS;
  const result = evaluateCeresToolkitTransitHandoff(handoff, {
    toolkitReceipt: toolkit,
    deadlineTick,
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.survivingHostiles, [{
    entityId: TOOLKIT_HOSTILES[1].entityId,
    worldRecordId: TOOLKIT_HOSTILES[1].worldRecordId,
  }]);
  assert.ok(result.cathedralProgressWU > 2_500,
    'the real stage-to-handoff receipt must remove more than 2,500 WU from the Cathedral leg');
  const plan = planCeresToolkitTransitHandoff();
  assert.equal(plan.corridorDistanceWU, 2_800);
  assert.equal(plan.allowBoost, false);
  assert.equal(plan.controlClock, 'fixed-tick');
  assert.ok(plan.guaranteedThroughlineClearanceWU > 180);
  assert.ok(plan.guaranteedCathedralProgressWU > 2_500);

  for (const [label, mutate] of [
    ['deadline endpoint', (candidate) => { candidate.endTick = deadlineTick; candidate.end.tick = deadlineTick; }],
    ['nonfinite handoff distance', (candidate) => { candidate.end.handoffDistanceWU = null; }],
    ['nonfinite zone clearance', (candidate) => { candidate.end.throughlineZoneClearanceWU = null; }],
    ['wrong Repulsor field authority', (candidate) => { candidate.repulsorFieldIds[0] = 'field_other'; }],
    ['wrong Mass Seed start authority', (candidate) => { candidate.start.massSeed.seedId = 9_999; }],
    ['missing Mass Seed start authority', (candidate) => { candidate.start.massSeed.active = false; }],
    ['Repulsor still active', (candidate) => {
      candidate.end.repulsorFields = [{ fieldId: 'field_repulsor_1_1', emitterId: null }];
    }],
    ['Mass Seed still active', (candidate) => { candidate.end.massSeed.active = true; }],
    ['Massline still active', (candidate) => { candidate.end.tether.active = true; }],
    ['input not neutral', (candidate) => { candidate.end.input.neutral = false; }],
    ['NaN input cannot sanitize to neutral', (candidate) => { candidate.end.input.moveX = NaN; }],
    ['player not settled', (candidate) => { candidate.end.player.speed = 1.01; }],
    ['NaN velocity cannot sanitize to settled', (candidate) => { candidate.end.player.speed = NaN; }],
    ['survivor replaced', (candidate) => {
      candidate.end.survivors[0].observedWorldRecordId = 'wr_replacement';
    }],
    ['survivor killed', (candidate) => { candidate.end.survivors[0].alive = false; }],
    ['survivor outside old shell but inside escape radius without receipt', (candidate) => {
      candidate.end.survivors[0].distanceWU = 600;
      delete candidate.encounterResolution;
    }],
    ['missing escape receipt', (candidate) => { delete candidate.encounterResolution; }],
    ['wrong escape encounter', (candidate) => {
      candidate.encounterResolution.encounterId = 'ceres:activity:other';
    }],
    ['wrong escape outcome', (candidate) => { candidate.encounterResolution.outcome = 'cleared'; }],
    ['escape tick before handoff', (candidate) => {
      candidate.encounterResolution.tick = candidate.startTick - 1;
    }],
    ['escape tick after handoff', (candidate) => {
      candidate.encounterResolution.tick = candidate.endTick + 1;
    }],
    ['escape sequence before handoff', (candidate) => {
      candidate.encounterResolution.seq = candidate.start.nextEventSeq - 1;
    }],
    ['handoff cursor overlaps toolkit events', (candidate) => {
      candidate.start.nextEventSeq = Math.max(...toolkit.events.map((event) => event.seq));
    }],
    ['escape sequence after handoff', (candidate) => {
      candidate.encounterResolution.seq = candidate.end.nextEventSeq;
    }],
    ['missing approach receipt', (candidate) => { candidate.approaches.shift(); }],
    ['approach receipts reordered', (candidate) => { candidate.approaches.reverse(); }],
    ['final approach begins before transient cleanup', (candidate) => {
      candidate.approaches[1].startTick = candidate.transientClearTick - 1;
    }],
    ['wall-clock approach receipt', (candidate) => {
      candidate.approaches[0].source = 'public-keyboard-wall-time';
      candidate.approaches[0].controlClock = 'wall-time';
    }],
    ['wrong approach identity', (candidate) => {
      candidate.approaches[1].targetId = 'ceres-other-waypoint';
    }],
    ['NaN approach velocity cannot sanitize to settled', (candidate) => {
      candidate.approaches[0].playerVel.x = NaN;
    }],
    ['NaN approach input cannot sanitize to valid controls', (candidate) => {
      candidate.approaches[1].input.moveZ = NaN;
    }],
    ['approach deadline changed', (candidate) => {
      candidate.approaches[0].deadlineTick -= 1;
    }],
    ['missing manual tether cut', (candidate) => { delete candidate.tetherCutAction; }],
    ['missing manual tether key-up tick', (candidate) => {
      delete candidate.tetherCutAction.keyUpTick;
    }],
    ['manual tether key-up precedes held sample', (candidate) => {
      candidate.tetherCutAction.keyUpTick = candidate.tetherCutAction.heldTick - 1;
    }],
    ['manual tether event precedes key-up', (candidate) => {
      candidate.tetherCutAction.eventTick = candidate.tetherCutAction.keyUpTick;
      candidate.tetherCutAction.event.tick = candidate.tetherCutAction.keyUpTick;
    }],
    ['manual tether cut reordered after approach', (candidate) => {
      candidate.tetherCutAction.neutralTick = candidate.approaches[0].startTick + 1;
    }],
    ['wall-clock tether cut', (candidate) => {
      candidate.tetherCutAction.source = 'public-keyboard-wall-time';
    }],
    ['wrong tether cut identity', (candidate) => {
      candidate.tetherCutAction.event.targetId = TOOLKIT_HOSTILES[1].entityId;
    }],
    ['cut fabricated for inactive start tether', (candidate) => {
      candidate.start.tether = { active: false, targetId: null, attachmentId: null };
    }],
    ['player killed', (candidate) => { candidate.end.player.alive = false; }],
    ['no Cathedral headroom', (candidate) => {
      candidate.end.cathedralDistanceWU = candidate.start.cathedralDistanceWU - 2_099;
    }],
    ['wall-time pulse contract', (candidate) => { candidate.waypoint.controlClock = 'wall-time'; }],
  ]) {
    const candidate = structuredClone(handoff);
    mutate(candidate);
    assert.equal(evaluateCeresToolkitTransitHandoff(candidate, {
      toolkitReceipt: toolkit,
      deadlineTick,
    }).pass, false, label);
  }

  const lateToolkit = structuredClone(toolkit);
  lateToolkit.endTick = deadlineTick - CERES_TOOLKIT_TRANSIT_HANDOFF_RESERVE_TICKS;
  lateToolkit.transitHandoff.startTick = lateToolkit.endTick + 1;
  lateToolkit.transitHandoff.start.tick = lateToolkit.endTick + 1;
  assert.equal(evaluateCeresToolkitTransitHandoff(lateToolkit.transitHandoff, {
    toolkitReceipt: lateToolkit,
    deadlineTick,
  }).pass, false, 'the durable evaluator must retain the entire handoff reserve before transit');

  const alreadyInactive = structuredClone(handoff);
  alreadyInactive.start.tether = { active: false, targetId: null, attachmentId: null };
  alreadyInactive.tetherCutAction = null;
  assert.equal(evaluateCeresToolkitTransitHandoff(alreadyInactive, {
    toolkitReceipt: toolkit,
    deadlineTick,
  }).pass, true, 'an already-inactive start tether requires no fabricated public cut');
});

test('public route orders fixed-tick transit after Repulsor and before the Cathedral leg', () => {
  const source = readFileSync(
    new URL('../scripts/lib/ceresFiveMinuteAcceptance.mjs', import.meta.url),
    'utf8',
  );
  const routeStart = source.indexOf('export async function runCeresFiveMinutePublicRoute');
  const routeEnd = source.indexOf('/**\n * Perform every known no-launch prerequisite', routeStart);
  const route = source.slice(routeStart, routeEnd);
  const legsIndex = route.indexOf('const legs = [');
  const throughlineIndex = route.indexOf('PQ020_ROUTE_TARGETS.beacon', legsIndex);
  const cathedralIndex = route.indexOf('PQ020_ROUTE_TARGETS.cathedral', throughlineIndex);
  const toolkitIndex = route.indexOf('const toolkitReceipt = await exercisePublicPhysicsToolkit', cathedralIndex);
  const handoffIndex = route.indexOf('const transitHandoff = await runCeresToolkitTransitHandoff', toolkitIndex);
  const markIndex = route.indexOf("await mark('toolkit-transit-handoff'", handoffIndex);
  assert.ok(legsIndex >= 0 && throughlineIndex > legsIndex && cathedralIndex > throughlineIndex
    && toolkitIndex > cathedralIndex && handoffIndex > toolkitIndex && markIndex > handoffIndex,
  'the Throughline loop must close toolkit, run its transit handoff, then advance to Cathedral');

  const toolkitStart = source.indexOf('async function exercisePublicPhysicsToolkit');
  const toolkitEnd = source.indexOf('async function waitForCeresBusEvent', toolkitStart);
  const toolkitSource = source.slice(toolkitStart, toolkitEnd);
  const repulsorIndex = toolkitSource.indexOf("key: 'Digit6'");
  const finalReceiptIndex = toolkitSource.indexOf('const receipt = await readCeresToolkitReceipt', repulsorIndex);
  const returnIndex = toolkitSource.indexOf('return receipt;', finalReceiptIndex);
  assert.ok(repulsorIndex >= 0 && finalReceiptIndex > repulsorIndex && returnIndex > finalReceiptIndex,
    'Repulsor and final toolkit proof must close before the route can begin transit');

  const driverStart = source.indexOf('export async function drivePublicToCeresPoint');
  const driverEnd = source.indexOf('export async function repositionPublicForCeresToolkit', driverStart);
  const driver = source.slice(driverStart, driverEnd);
  assert.match(driver,
    /target\.controlClock === 'fixed-tick'[\s\S]*waitForCeresFixedTicks\(page, ticks/,
    'the handoff controller must hold real public keys for fixed simulation ticks');
  assert.doesNotMatch(source.slice(source.indexOf('export function planCeresToolkitTransitHandoff'),
    source.indexOf('export function chooseCeresPocketApproachAction')),
  /allowBoost: true|controlClock: 'wall-time'/,
  'the transit plan cannot silently re-enable dash or wall-time pulse authority');
  assert.match(source, /'encounter:telegraph', 'encounter:spawned', 'encounter:resolved'/,
    'the observer must subscribe to the encounter director resolution event');
  assert.match(source, /outcome: payload\.outcome \?\? null/,
    'the observer must retain the authoritative resolution outcome');
  assert.doesNotMatch(source, /encounter:ended/,
    'the observer cannot depend on a nonexistent encounter ending event');

  assert.match(route,
    /const legDeadlineTick = observerBounds\.endTick - legReserveTicks[\s\S]*waitForCathedralAdmission\(page, \{[\s\S]*deadlineTick: legDeadlineTick[\s\S]*waitForAutopilotArrival\(page, leg\.target, \{[\s\S]*deadlineTick: legDeadlineTick[\s\S]*waitForShipSettled\(page, \{[\s\S]*deadlineTick: legDeadlineTick/,
    'the exact Cathedral reserve boundary must reach admission, autopilot, and settle');
});

test('Continue freezes the old observer and arms the next before either page can advance unobserved', () => {
  const source = readFileSync(
    new URL('../scripts/lib/ceresFiveMinuteAcceptance.mjs', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('async function publicSaveAndContinue');
  const end = source.indexOf('async function applyPublicReducedAccessibility', start);
  assert.ok(start >= 0 && end > start);
  const producer = source.slice(start, end);
  const pause = producer.indexOf("await page.keyboard.press('Escape')");
  const freeze = producer.indexOf("source: 'public-pause-before-observer-stop'", pause);
  const oldSnapshot = producer.indexOf('const preReload = await readCeresRouteSnapshot', freeze);
  const stop = producer.indexOf('const traceChunk = await stopCeresRouteObserver', oldSnapshot);
  const reload = producer.indexOf('await page.reload(', stop);
  const arm = producer.indexOf('await installCeresRouteObserver(page, observerBounds, observerPocketId, {');
  const defer = producer.indexOf('deferSamplesUntilFlight: true', arm);
  const click = producer.indexOf("getByRole('button', { name: 'Continue', exact: true }).click", defer);
  const flight = producer.indexOf('await waitForCeresFlight(page, fixedSeed', click);
  const loadedSnapshot = producer.indexOf('const after = await readCeresRouteSnapshot', flight);
  assert.ok(pause >= 0 && freeze > pause && oldSnapshot > freeze && stop > oldSnapshot
      && reload > stop && arm > reload && defer > arm && click > defer
      && flight > click && loadedSnapshot > flight,
  'the old page must freeze before teardown and the new page must subscribe before Continue');
});

test('public transit driver cuts Massline, outlives exact fields, and settles on fixed ticks', async (t) => {
  const toolkit = toolkitReceiptFixture(TOOLKIT_HOSTILES[0].worldRecordId);
  const harness = toolkitTransitHandoffPage(toolkit);
  const deadlineTick = END_TICK - CERES_TOOLKIT_ROUTE_RESERVE_TICKS;
  const receipt = await runCeresToolkitTransitHandoff(harness.page, {
    toolkitReceipt: toolkit,
    deadlineTick,
  });
  assert.equal(receipt.evaluation.pass, true);
  assert.ok(receipt.startTick > toolkit.endTick);
  assert.ok(receipt.endTick < deadlineTick);
  assert.ok(receipt.endTick - receipt.startTick < CERES_TOOLKIT_TRANSIT_HANDOFF_RESERVE_TICKS);
  assert.deepEqual(receipt.repulsorFieldIds, ['field_repulsor_1_1']);
  assert.equal(receipt.massSeedId, 9_001);
  assert.equal(receipt.start.repulsorFields[0]?.emitterId, 9_002,
    'exact event-bound field authority survives a missing emitter entity');
  assert.deepEqual(receipt.end.repulsorFields, []);
  assert.equal(receipt.end.massSeed.active, false);
  assert.equal(receipt.end.tether.active, false);
  assert.equal(receipt.end.input.neutral, true);
  assert.ok(receipt.end.player.speed <= 1);
  assert.deepEqual(receipt.approaches.map((approach) => ({
    schema: approach.schema,
    source: approach.source,
    targetId: approach.targetId,
    controlClock: approach.controlClock,
    deadlineTick: approach.deadlineTick,
  })), [0, 1].map(() => ({
    schema: 'spaceface.ceresPublicPointApproachReceipt.v1',
    source: 'public-keyboard-fixed-tick',
    targetId: receipt.waypoint.targetId,
    controlClock: 'fixed-tick',
    deadlineTick,
  })));
  assert.ok(receipt.startTick < receipt.approaches[0].completionTick
    && receipt.approaches[0].completionTick <= receipt.transientClearTick
    && receipt.transientClearTick <= receipt.approaches[1].startTick
    && receipt.approaches[1].completionTick < receipt.endTick);
  assert.equal(receipt.tetherCutAction.event.targetId, receipt.start.tether.targetId);
  assert.equal(receipt.tetherCutAction.event.attachmentId, receipt.start.tether.attachmentId);
  assert.ok(receipt.tetherCutAction.neutralTick <= receipt.approaches[0].startTick);
  assert.ok(receipt.end.handoffDistanceWU <= receipt.waypoint.arrivalRadiusWU);
  assert.ok(receipt.end.survivors[0].distanceWU >= CERES_TOOLKIT_TRANSIT_ESCAPE_RADIUS_WU);
  assert.deepEqual({
    event: receipt.encounterResolution.event,
    encounterId: receipt.encounterResolution.encounterId,
    outcome: receipt.encounterResolution.outcome,
  }, {
    event: 'encounter:resolved',
    encounterId: 'ceres:activity:throughline-ambush',
    outcome: 'escaped',
  });
  assert.ok(receipt.encounterResolution.tick >= receipt.startTick
    && receipt.encounterResolution.tick <= receipt.endTick);
  assert.ok(receipt.encounterResolution.seq >= receipt.start.nextEventSeq
    && receipt.encounterResolution.seq < receipt.end.nextEventSeq);
  assert.equal(harness.wallWaits, 0,
    'the transit controller cannot translate wall milliseconds into steering distance');
  assert.ok(harness.fixedTickWaits > 20,
    'the executable route must repeatedly hold public controls against simulation ticks');
  assert.equal(harness.heldKeys.size, 0);
  assert.ok(harness.events.some((event) => event.event === 'tether:broken'));
  assert.ok(harness.events.some((event) => event.event === 'tether:released'));
  assert.ok(harness.events.some((event) => event.event === 'encounter:resolved'
    && event.encounterId === 'ceres:activity:throughline-ambush'
    && event.outcome === 'escaped'));
  t.diagnostic(JSON.stringify({
    fullHandoffTicks: receipt.endTick - receipt.startTick,
    escapeResolutionTick: receipt.encounterResolution.tick,
    escapeResolutionSeq: receipt.encounterResolution.seq,
    survivorDistanceWU: receipt.end.survivors[0].distanceWU,
    cathedralDistanceWU: receipt.end.cathedralDistanceWU,
  }));
});

test('physics-toolkit evaluator rejects summary shortcuts and broken causal identity', () => {
  const mutations = [
    ['toolkit receipt drops one member of the exact prebound pair', (toolkit) => {
      toolkit.initialHostiles.pop();
      toolkit.cameraReposition.boundHostiles.pop();
    }],
    ['camera reposition receipt is missing', (toolkit) => {
      delete toolkit.cameraReposition;
    }],
    ['camera reposition impact observation is missing', (toolkit) => {
      delete toolkit.cameraReposition.impacts;
    }],
    ['camera reposition impact capture bound is missing', (toolkit) => {
      delete toolkit.cameraReposition.impactCapture;
    }],
    ['camera reposition hits a non-anchor body', (toolkit) => {
      toolkit.cameraReposition.impactCapture.endSeq = 1_191;
      toolkit.cameraReposition.impacts.push({
        seq: 1_191,
        event: 'physics:impact',
        tick: toolkit.cameraReposition.movementEndTick,
        aId: toolkit.playerEntityId,
        bId: 229,
      });
    }],
    ['camera reposition is not bound to the anchor impact', (toolkit) => {
      toolkit.cameraReposition.anchorImpactTick += 1;
    }],
    ['camera reposition is bound to the wrong same-tick impact', (toolkit) => {
      toolkit.cameraReposition.anchorImpactSeq += 1;
    }],
    ['camera stage silently disables its bounded boost capability', (toolkit) => {
      toolkit.cameraReposition.waypoints[0].allowBoost = false;
    }],
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
    ['combat Massline relatch is missing', (toolkit) => {
      const attachments = toolkit.events.filter((event) => event.event === 'tether:attached');
      toolkit.events.splice(toolkit.events.indexOf(attachments[1]), 1);
    }],
    ['combat Massline switches durable targets', (toolkit) => {
      const attachments = toolkit.events.filter((event) => event.event === 'tether:attached');
      attachments[1].targetId = TOOLKIT_HOSTILES[1].entityId;
      attachments[1].targetWorldRecordId = TOOLKIT_HOSTILES[1].worldRecordId;
    }],
    ['combat Massline breaks before the proof kill', (toolkit) => {
      const attachments = toolkit.events.filter((event) => event.event === 'tether:attached');
      const killIndex = toolkit.events.findIndex((event) => event.event === 'entity:killed');
      toolkit.events.splice(killIndex, 0, {
        seq: 0,
        event: 'tether:broken',
        tick: toolkit.events[killIndex].tick - 1,
        actorId: toolkit.playerEntityId,
        targetId: attachments[1].targetId,
        targetWorldRecordId: attachments[1].targetWorldRecordId,
        attachmentId: attachments[1].attachmentId,
        reason: 'physics_break',
      });
      toolkit.events.forEach((event, index) => { event.seq = 1_201 + index; });
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
    ['repulsor scatters the proof target before combat completes', (toolkit) => {
      const events = toolkit.events;
      const repulsorIndex = events.findIndex((event) => event.event === 'fields:deployed');
      const [repulsor] = events.splice(repulsorIndex, 1);
      const seedLockIndex = events.findIndex((event) => event.event === 'massSeed:locked');
      repulsor.tick = events[seedLockIndex].tick + 1;
      events.splice(seedLockIndex + 1, 0, repulsor);
      for (const [index, event] of events.entries()) event.seq = 1_201 + index;
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

  const appendCameraHostileImpact = (document, overrides = {}) => {
    const toolkit = document.observations.toolkit;
    const camera = toolkit.cameraReposition;
    const hostile = TOOLKIT_HOSTILES[0];
    const raw = {
      seq: 1_191,
      event: 'physics:impact',
      tick: camera.movementEndTick,
      aId: toolkit.playerEntityId,
      bId: hostile.entityId,
      aType: 'ship',
      aWorldRecordId: null,
      aAnchorSlotId: null,
      bType: 'ship',
      bWorldRecordId: hostile.worldRecordId,
      bAnchorSlotId: null,
      ...overrides,
    };
    camera.impactCapture.endSeq = raw.seq;
    camera.impacts.push({
      ...raw,
      otherEntityId: raw.bId,
      otherType: raw.bType,
      otherWorldRecordId: raw.bWorldRecordId,
      otherAnchorSlotId: raw.bAnchorSlotId,
      phase: raw.tick <= camera.movementEndTick
        ? 'movement'
        : 'post-movement-conflict-wait',
    });
    document.observations.playerImpactCapture.impacts.push(raw);
    return { toolkit, camera, raw };
  };

  const exactBoundContact = runtimeFixture('electron');
  appendCameraHostileImpact(exactBoundContact);
  const exactBoundResult = evaluateCeresFiveMinuteRuntime(
    exactBoundContact,
    { runtimeKind: 'electron' },
  );
  assert.equal(exactBoundResult.pass, true, exactBoundResult.failures.join('; '));

  for (const [label, overrides] of [
    ['unknown event-time record', { bWorldRecordId: null }],
    ['wrong event-time record', { bWorldRecordId: TOOLKIT_HOSTILES[1].worldRecordId }],
    ['non-cohort event-time identity', { bId: 229, bWorldRecordId: 'wr_npc_outsider' }],
    ['non-ship body using a cohort id', { bType: 'asteroid' }],
    ['exact hostile outside movement window', {
      tick: START_TICK + 7_200,
    }],
  ]) {
    const document = runtimeFixture('electron');
    appendCameraHostileImpact(document, overrides);
    const rejection = evaluateCeresFiveMinuteRuntime(document, { runtimeKind: 'electron' });
    assert.equal(rejection.pass, false, label);
    assert.ok(rejection.failures.some((failure) => failure.includes('impact')),
      `${label} must retain the exact impact failure`);
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

test('public toolkit actions cross fixed ticks and reject stale observer events', async () => {
  const missedGrammar = createMasslineInputGrammar();
  assert.equal(missedGrammar.step(1 / 60, {
    held: false,
    attached: false,
    source: null,
  }).latch, false,
  'a down/up pair completed between fixed updates is indistinguishable from neutral input');
  const sampledGrammar = createMasslineInputGrammar();
  assert.equal(sampledGrammar.step(1 / 60, {
    held: true,
    attached: false,
    source: 'keyboard',
  }).latch, true, 'a fixed tick that samples Space held publishes the latch edge');
  assert.equal(sampledGrammar.step(1 / 60, {
    held: false,
    attached: true,
    source: null,
  }).cut, false, 'the latch press release is published before beginning a distinct cut press');
  assert.equal(sampledGrammar.step(1 / 60, {
    held: true,
    attached: true,
    source: 'keyboard',
  }).cut, false, 'the cut press must remain held for a sampled attached tick');
  assert.equal(sampledGrammar.step(1 / 60, {
    held: false,
    attached: true,
    source: null,
  }).cut, true, 'the following sampled release publishes the exact cut edge');

  const harness = fixedTickToolkitActionPage();
  const attached = await triggerCeresPublicFlightAction(harness.page, {
    key: 'Space',
    deadlineTick: 710,
    expectedEvent: {
      event: 'tether:attached',
      actorId: PLAYER_ENTITY_ID,
      targetId: TOOLKIT_HOSTILES[0].entityId,
    },
  });
  assert.deepEqual(attached.receipt, {
    source: 'public-keyboard-fixed-tick',
    key: 'Space',
    trigger: 'press',
    expectedEvent: 'tether:attached',
    pressTick: 700,
    heldTick: 701,
    keyUpTick: 701,
    eventTick: 701,
    minEventSeq: 80,
    eventSeq: 80,
    neutralTick: 702,
  });
  assert.equal(attached.event.seq, 80,
    'the same-tick stale event before the action cursor must not satisfy the latch');

  const cut = await triggerCeresPublicFlightAction(harness.page, {
    key: 'Space',
    trigger: 'release',
    deadlineTick: 710,
    expectedEvent: {
      event: 'tether:broken',
      actorId: PLAYER_ENTITY_ID,
      targetId: TOOLKIT_HOSTILES[0].entityId,
      reason: 'tether_cut',
    },
  });
  assert.equal(cut.receipt.pressTick, 702);
  assert.equal(cut.receipt.heldTick, 703,
    'the cut down-state must be sampled for one exact fixed tick');
  assert.equal(cut.receipt.keyUpTick, 703,
    'the cut key-up is recorded at the actual post-sample fixed tick');
  assert.equal(cut.receipt.eventTick, 704,
    'the cut event must follow the sampled key release');
  assert.equal(cut.receipt.neutralTick, 705);

  const seed = await triggerCeresPublicFlightAction(harness.page, {
    key: 'Digit4',
    deadlineTick: 710,
    expectedEvent: { event: 'massSeed:deployed', ownerId: PLAYER_ENTITY_ID },
  });
  const repulsor = await triggerCeresPublicFlightAction(harness.page, {
    key: 'Digit6',
    deadlineTick: 710,
    expectedEvent: {
      event: 'fields:deployed',
      kind: 'repulsor',
      sourceOwnerId: PLAYER_ENTITY_ID,
    },
  });
  assert.equal(seed.receipt.eventTick, 706);
  assert.equal(seed.receipt.neutralTick, 707);
  assert.equal(repulsor.receipt.eventTick, 708);
  assert.equal(repulsor.receipt.neutralTick, 709);

  const deadlineHarness = fixedTickToolkitActionPage();
  await assert.rejects(
    triggerCeresPublicFlightAction(deadlineHarness.page, {
      key: 'Digit6',
      deadlineTick: 700,
      expectedEvent: { event: 'fields:deployed', kind: 'repulsor' },
    }),
    /exhausted the toolkit deadline before input/,
  );
  assert.equal(deadlineHarness.log.some((entry) => entry.kind === 'down'), false,
    'the exact toolkit deadline rejects before keydown');

  const pressBoundary = fixedTickToolkitActionPage();
  await assert.rejects(
    triggerCeresPublicFlightAction(pressBoundary.page, {
      key: 'Digit4',
      deadlineTick: 702,
      expectedEvent: { event: 'massSeed:deployed', ownerId: PLAYER_ENTITY_ID },
    }),
    /exhausted the toolkit deadline before input/,
  );
  assert.equal(pressBoundary.log.some((entry) => entry.kind === 'down'), false,
    'a press action reserves both its event and neutral fixed ticks before keydown');

  const releaseBoundary = fixedTickToolkitActionPage();
  await assert.rejects(
    triggerCeresPublicFlightAction(releaseBoundary.page, {
      key: 'Space',
      trigger: 'release',
      deadlineTick: 703,
      expectedEvent: { event: 'tether:broken', reason: 'tether_cut' },
    }),
    /exhausted the toolkit deadline before input/,
  );
  assert.equal(releaseBoundary.log.some((entry) => entry.kind === 'down'), false,
    'a release action reserves held, event, and neutral fixed ticks before keydown');

  const eventHolds = harness.log.filter((row) => row.kind === 'event')
    .map((row) => [row.event, row.held]);
  assert.deepEqual(eventHolds, [
    ['tether:attached', ['Space']],
    ['tether:broken', []],
    ['massSeed:deployed', ['Digit4']],
    ['fields:deployed', ['Digit6']],
  ], 'press-trigger actions stay held through their event; cut fires only after release');

  await assert.rejects(triggerCeresPublicFlightAction(harness.page, {
    key: 'Digit4',
    expectedEvent: { event: 'never:arrives' },
    timeout: 25,
  }), /public toolkit event never:arrives did not arrive/);
  assert.equal(harness.heldKeys.size, 0, 'a failed public action must still release its key');

  const delayedFreshPress = fixedTickToolkitActionPage({
    deferPressEventUntilObserver: true,
  });
  await assert.rejects(
    triggerCeresPublicFlightAction(delayedFreshPress.page, {
      key: 'Digit4',
      deadlineTick: 710,
      expectedEvent: { event: 'massSeed:deployed', ownerId: PLAYER_ENTITY_ID },
    }),
    /lacks ordered fixed-tick event authority/,
  );
  assert.deepEqual(delayedFreshPress.log.filter((row) => (
    row.kind === 'up' || row.kind === 'event'
  )).map((row) => ({ kind: row.kind, tick: row.tick })), [
    { kind: 'up', tick: 701 },
    { kind: 'event', tick: 702 },
  ], 'a fresh same-shape press event emitted after key-up remains causally invalid');
});

test('press-trigger toolkit input releases after one sampled tick despite delayed event observation', async () => {
  const harness = delayedToolkitObserverPage({ observerDelayTicks: 35 });
  const attached = await triggerCeresPublicFlightAction(harness.page, {
    key: 'Space',
    deadlineTick: 780,
    expectedEvent: {
      event: 'tether:attached',
      actorId: PLAYER_ENTITY_ID,
      targetId: TOOLKIT_HOSTILES[0].entityId,
    },
  });

  assert.equal(attached.event.tick, 701,
    'the exact attach edge occurs on the first fixed tick that samples Space held');
  assert.equal(attached.receipt.heldTick, 701);
  assert.deepEqual(harness.log.filter((row) => row.kind === 'up').at(0), {
    kind: 'up', key: 'Space', tick: 701,
  }, 'Playwright observer latency cannot extend the public key hold beyond one sampled tick');

  const latched = harness.trace.events.find((event) => event.event === 'tether:latched'
    && event.targetId === TOOLKIT_HOSTILES[0].entityId);
  const exactTetherAuthority = {
    playerEntityId: PLAYER_ENTITY_ID,
    targetId: TOOLKIT_HOSTILES[0].entityId,
    targetWorldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
    attachmentId: 'att_delayed_1',
    latchedTick: latched.tick,
    latchedSeq: latched.seq,
  };
  const authorityReceipt = await waitForCeresExactActiveTetherAuthority(
    harness.page,
    exactTetherAuthority,
    { deadlineTick: 780 },
  );
  assert.equal(authorityReceipt.pass, true);
  assert.equal(authorityReceipt.targetWorldRecordId, TOOLKIT_HOSTILES[0].worldRecordId);

  const cut = await triggerCeresPublicFlightAction(harness.page, {
    key: 'Space',
    trigger: 'release',
    deadlineTick: 780,
    exactTetherAuthority,
    expectedEvent: {
      event: 'tether:broken',
      actorId: PLAYER_ENTITY_ID,
      targetId: TOOLKIT_HOSTILES[0].entityId,
      attachmentId: 'att_delayed_1',
      reason: 'tether_cut',
    },
  });
  assert.equal(cut.event.reason, 'tether_cut');
  assert.ok(harness.trace.events.some((event) => event.event === 'tether:cut'
    && event.targetId === TOOLKIT_HOSTILES[0].entityId));
  assert.ok(harness.trace.events.some((event) => event.event === 'tether:released'
    && event.targetId === TOOLKIT_HOSTILES[0].entityId));
  assert.equal(harness.heldKeys.size, 0);
});

test('exact tether authority waits beyond the latch tick for the owner mirror', async () => {
  const harness = delayedToolkitObserverPage({ observerDelayTicks: 0 });
  await harness.page.keyboard.down('Space');
  harness.advanceFixedTick();
  await harness.page.keyboard.up('Space');
  const attached = harness.trace.events.find((event) => event.event === 'tether:attached');
  const latched = harness.trace.events.find((event) => event.event === 'tether:latched');
  assert.equal(attached.tick, 701);
  assert.equal(latched.tick, 701);
  assert.deepEqual(harness.state.player.tether, {
    active: false, targetId: null, attachmentId: null,
  }, 'the player-facing mirror remains inactive on the production latch tick');
  assert.deepEqual(harness.state.combat.attachments.byId.att_delayed_1, {
    id: 'att_delayed_1',
    state: 'active',
    ownerId: PLAYER_ENTITY_ID,
    targetId: TOOLKIT_HOSTILES[0].entityId,
  }, 'the backing attachment owner is already active on the latch tick');

  const receipt = await waitForCeresExactActiveTetherAuthority(harness.page, {
    playerEntityId: PLAYER_ENTITY_ID,
    targetId: TOOLKIT_HOSTILES[0].entityId,
    targetWorldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
    attachmentId: 'att_delayed_1',
    latchedTick: latched.tick,
    latchedSeq: latched.seq,
  }, { deadlineTick: 780 });
  assert.equal(receipt.observedTick, 702,
    'exact authority becomes valid only on the distinct owner-mirror update');
  assert.deepEqual(harness.log.filter((row) => row.kind === 'authority-poll'), [
    { kind: 'authority-poll', tick: 701, accepted: false },
    { kind: 'authority-poll', tick: 702, accepted: true },
  ]);
});

test('manual cut preflight rejects lost exact tether authority before a second keydown', async () => {
  const harness = delayedToolkitObserverPage({ observerDelayTicks: 1 });
  const attached = await triggerCeresPublicFlightAction(harness.page, {
    key: 'Space',
    deadlineTick: 780,
    expectedEvent: {
      event: 'tether:attached',
      actorId: PLAYER_ENTITY_ID,
      targetId: TOOLKIT_HOSTILES[0].entityId,
    },
  });
  const latched = harness.trace.events.find((event) => event.event === 'tether:latched'
    && event.targetId === TOOLKIT_HOSTILES[0].entityId);
  const exactTetherAuthority = {
    playerEntityId: PLAYER_ENTITY_ID,
    targetId: TOOLKIT_HOSTILES[0].entityId,
    targetWorldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
    attachmentId: attached.event.attachmentId,
    latchedTick: latched.tick,
    latchedSeq: latched.seq,
  };
  await waitForCeresExactActiveTetherAuthority(harness.page, exactTetherAuthority, {
    deadlineTick: 780,
  });
  harness.scheduleTargetLossAfterTicks(1);
  harness.advanceFixedTick();
  assert.equal(harness.trace.events.at(-1)?.reason, 'target_lost',
    'target loss is a separately scheduled owner event, not a Space-hold side effect');
  const downCount = harness.log.filter((row) => row.kind === 'down').length;

  await assert.rejects(
    triggerCeresPublicFlightAction(harness.page, {
      key: 'Space',
      trigger: 'release',
      deadlineTick: 780,
      exactTetherAuthority,
      expectedEvent: {
        event: 'tether:broken',
        actorId: PLAYER_ENTITY_ID,
        targetId: TOOLKIT_HOSTILES[0].entityId,
        attachmentId: 'att_delayed_1',
        reason: 'tether_cut',
      },
    }),
    (error) => error?.code === 'target_lost-before-release'
      && error?.ceresToolkitActionDiagnostic?.reason === 'target_lost-before-release'
      && error?.ceresToolkitActionDiagnostic?.timeoutMs === 0,
  );
  assert.equal(harness.log.filter((row) => row.kind === 'down').length, downCount,
    'lost authority fails before the second public input gesture begins');
});

test('public combat volleys hold fire through exact fixed ticks and neutralize before deadline', async () => {
  const target = { ndcX: 0.2, ndcY: -0.1 };
  const box = { x: 10, y: 20, width: 100, height: 50 };
  const harness = fixedTickToolkitActionPage();
  const receipt = await fireCeresPublicCombatVolley(harness.page, target, box, {
    deadlineTick: 800,
  });
  assert.deepEqual(receipt, {
    source: 'public-mouse-fixed-tick',
    startTick: 700,
    heldTick: 718,
    neutralTick: 726,
  });
  assert.deepEqual(harness.log.filter((row) => row.kind.startsWith('mouse')), [
    { kind: 'mouse-move', x: 70, y: 47.5, tick: 700 },
    { kind: 'mouse-down', tick: 700 },
    { kind: 'mouse-up', tick: 718 },
  ]);
  assert.equal(harness.log.find((row) => row.kind === 'fixed-tick')?.mouseHeld, true,
    'the 18-tick hold interval samples public primary fire as held');
  assert.equal(harness.log.filter((row) => row.kind === 'fixed-tick').at(-1)?.mouseHeld, false,
    'the final 8-tick interval proves neutral public primary fire');
  assert.equal(harness.mouseHeld, false);

  const retained = fixedTickToolkitActionPage({ emitCombatFireOwnerId: PLAYER_ENTITY_ID });
  const canvas = {
    async hover(options) {
      retained.log.push({ kind: 'canvas-hover', ...options, tick: 700 });
    },
  };
  const surface = await prepareCeresPublicTetherFireSurface(canvas, retained.page, box, {
    deadlineTick: 800,
  });
  assert.deepEqual(surface, {
    source: 'public-canvas-hover',
    position: { x: 50, y: 25 },
    startTick: 700,
    readyTick: 701,
  });
  const retainedReceipt = await fireCeresPublicCombatVolley(retained.page, {
    id: TOOLKIT_HOSTILES[0].entityId,
    worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
  }, box, {
    deadlineTick: 800,
    movePointer: false,
    expectedFireOwnerId: PLAYER_ENTITY_ID,
  });
  assert.equal(retainedReceipt.source, 'public-mouse-fixed-tick-retained-canvas');
  assert.equal(retainedReceipt.fireEvent.ownerId, PLAYER_ENTITY_ID);
  assert.ok(retainedReceipt.fireEvent.tick > retainedReceipt.startTick
    && retainedReceipt.fireEvent.tick <= retainedReceipt.neutralTick,
  'the actionability-checked first hold must produce a fresh player-owned combat fire receipt');
  assert.equal(retained.log.filter((row) => row.kind === 'mouse-move').length, 0,
    'Massline fire control must not chase an off-screen hull with cursor movement');
  assert.equal(retained.log.filter((row) => row.kind === 'canvas-hover').length, 1,
    'Playwright actionability must bind primary fire to the canvas instead of an overlapping HUD row');
  assert.equal(retained.mouseHeld, false);

  const swallowedByOverlay = fixedTickToolkitActionPage();
  await assert.rejects(fireCeresPublicCombatVolley(swallowedByOverlay.page, target, box, {
    deadlineTick: 800,
    expectedFireOwnerId: PLAYER_ENTITY_ID,
  }), /did not produce a fresh player-owned fire receipt/,
  'a sampled mouse hold without a production fire event cannot count as a combat volley');
  assert.equal(swallowedByOverlay.mouseHeld, false);

  const boundary = fixedTickToolkitActionPage();
  await assert.rejects(
    fireCeresPublicCombatVolley(boundary.page, target, box, { deadlineTick: 726 }),
    /exhausted the toolkit deadline before input/,
  );
  assert.equal(boundary.log.some((row) => row.kind === 'mouse-down'), false,
    'an insufficient fixed-tick envelope rejects before mouse input');

  const failure = fixedTickToolkitActionPage();
  const originalWait = failure.page.waitForFunction;
  let firstWait = true;
  failure.page.waitForFunction = async (...args) => {
    if (firstWait) {
      firstWait = false;
      throw new Error('synthetic fixed-tick failure');
    }
    return originalWait(...args);
  };
  await assert.rejects(
    fireCeresPublicCombatVolley(failure.page, target, box, { deadlineTick: 800 }),
    /synthetic fixed-tick failure/,
  );
  assert.equal(failure.mouseHeld, false, 'failure cleanup must release public primary fire');
  assert.equal(failure.log.at(-1)?.kind, 'mouse-up');
});

test('public hostile acquisition waits for a fresh exact ready Massline receipt', async () => {
  const target = {
    id: TOOLKIT_HOSTILES[0].entityId,
    worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
  };
  const valid = hostileMasslineAcquisitionPage();
  const receipt = await waitForCeresHostileMasslineAcquisition(valid.page, target, {
    afterTick: 900,
  });
  assert.deepEqual(receipt, {
    tick: 901,
    simTime: 15.016666666666667,
    aimIntentActive: true,
    pointerActive: true,
    autoAimTargetId: null,
    schemaVersion: 1,
    receiptId: 'massline-acquisition:44',
    publishedTick: 901,
    validUntil: 15.516666666666667,
    targetId: target.id,
    worldRecordId: target.worldRecordId,
    targetAlive: true,
    targetType: 'ship',
    zoneId: 'zone_ceres_ambush',
    squadId: 'zone_ceres_ambush',
    status: 'ready',
    context: 'precision-pick',
    expectedWorldRecordId: target.worldRecordId,
  });
  const liveIntercept = hostileMasslineAcquisitionPage({ context: 'hostile-flyby' });
  assert.equal((await waitForCeresHostileMasslineAcquisition(liveIntercept.page, target, {
    afterTick: 900,
  })).context, 'hostile-flyby',
  'the live INTERCEPT context is valid when it binds the same exact ready durable target');

  const atDeadline = hostileMasslineAcquisitionPage({ stateTick: 902, publishedTick: 902 });
  await assert.rejects(waitForCeresHostileMasslineAcquisition(atDeadline.page, target, {
    afterTick: 900,
    deadlineTick: 902,
  }), /public cursor did not publish the exact ready hostile Massline acquisition/,
  'an acquisition published at the absolute toolkit deadline is too late');

  for (const [label, options] of [
    ['stale receipt', { publishedTick: 900 }],
    ['replacement entity', { selectedTargetId: target.id + 1 }],
    ['replacement durable record', { worldRecordId: 'wr_npc_replacement' }],
    ['denied acquisition', { status: 'blocked' }],
    ['weapon-synthesized aim', { autoAimTargetId: target.id }],
  ]) {
    const harness = hostileMasslineAcquisitionPage(options);
    await assert.rejects(waitForCeresHostileMasslineAcquisition(harness.page, target, {
      afterTick: 900,
      timeout: 25,
    }), (error) => {
      assert.match(error.message, /public cursor did not publish the exact ready hostile Massline acquisition/);
      assert.equal(error.ceresToolkitActionDiagnostic?.schema,
        'spaceface.ceresToolkitActionDiagnostic.v1');
      assert.equal(error.ceresToolkitActionDiagnostic?.expectedEvent,
        'massline:acquisitionReady');
      assert.equal(error.ceresToolkitActionDiagnostic?.snapshot?.authority?.targetId, target.id);
      assert.equal(error.ceresToolkitActionDiagnostic?.snapshot?.authority?.worldRecordId,
        target.worldRecordId);
      return true;
    }, label);
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
  }).durationMs, 80, 'large corrections retain the established full public turn pulse');
  assert.equal(chooseCeresPocketApproachAction({
    distanceWU: 280,
    headingError: 0.3,
    speed: 0.8,
  }).durationMs, 40, 'medium corrections avoid crossing the narrow alignment window');
  assert.equal(chooseCeresPocketApproachAction({
    distanceWU: 280,
    headingError: -0.12,
    speed: 0.8,
  }).durationMs, 20, 'near-aligned corrections use one fixed-step-scale pulse');
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
    distanceWU: 95,
    headingError: 0,
    speed: 0.8,
  }, { arrivalRadiusWU: 100 }).kind, 'complete',
  'the public point driver must honor the target completion radius');
  assert.equal(chooseCeresPocketApproachAction({
    distanceWU: Number.NaN,
    headingError: 0,
    speed: 0,
  }).kind, 'invalid');
  assert.equal(chooseCeresPocketApproachAction({
    distanceWU: null,
    headingError: 0,
    speed: 0,
  }).kind, 'invalid', 'missing distance cannot coerce to a completed zero-distance approach');
});

test('Working Seam egress disables dash-shaped boost without changing generic approaches', () => {
  const alignedShortCorridor = {
    distanceWU: 278.78177829171545,
    headingError: 0,
    speed: 0.8,
  };
  const generic = chooseCeresPocketApproachAction(alignedShortCorridor);
  assert.equal(generic.kind, 'thrust');
  assert.equal(generic.boost, true, 'ordinary long approaches retain their existing boost policy');

  const dashSafe = chooseCeresPocketApproachAction(alignedShortCorridor, {
    arrivalRadiusWU: 90,
    allowBoost: false,
  });
  assert.deepEqual(dashSafe, {
    kind: 'thrust',
    key: 'KeyW',
    durationMs: 160,
    boost: false,
  }, 'the short station-center corridor must not emit a dash-shaped Shift tap');
});

test('fixed-tick boosted public approach samples a neutral release edge', async () => {
  const target = {
    targetId: 'ceres-throughline-toolkit-camera-stage',
    targetName: 'Throughline toolkit camera stage',
    targetPos: { x: 2_000, z: 0 },
    arrivalRadiusWU: 23,
    minRemainingTicks: 7_200,
    allowBoost: true,
    controlClock: 'fixed-tick',
  };
  const heldKeys = new Set();
  const fixedTickSamples = [];
  const player = {
    id: PLAYER_ENTITY_ID,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
  };
  const state = {
    tick: 1_000,
    mode: 'flight',
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
  const page = {
    isClosed() { return false; },
    locator() {
      return {
        async waitFor() {},
        async focus() {},
      };
    },
    keyboard: {
      async down(key) { heldKeys.add(key); },
      async up(key) { heldKeys.delete(key); },
    },
    mouse: { async up() {} },
    async evaluate(callback, argument) {
      return runInPage(callback, argument);
    },
    async waitForFunction(callback, argument) {
      assert.ok(Number.isSafeInteger(argument?.tick));
      assert.ok(Number.isSafeInteger(argument?.deltaTicks));
      state.tick = argument.tick + argument.deltaTicks;
      fixedTickSamples.push({ tick: state.tick, held: [...heldKeys].sort() });
      if (heldKeys.has('KeyW')) {
        player.pos.x = target.targetPos.x - 10;
        player.vel.x = 0.8;
      }
      assert.equal(runInPage(callback, argument), true);
    },
  };

  const receipt = await drivePublicToCeresPoint(page, target, 18_000);
  assert.equal(receipt.pass, true);
  assert.deepEqual(fixedTickSamples.map((sample) => sample.held), [
    ['KeyW', 'Shift'],
    [],
  ], 'the dash hold must be followed by one public neutral fixed tick after both key-up edges');
  assert.equal(receipt.completionTick, fixedTickSamples.at(-1).tick,
    'completion must be sampled only after the neutral release edge');
});

test('anchor collision ignores stale impacts and owns fixed-tick public input', async () => {
  const player = {
    id: PLAYER_ENTITY_ID,
    alive: true,
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: {},
  };
  const anchor = {
    id: 9,
    alive: true,
    type: 'asteroid',
    pos: { x: 100, z: 0 },
    mass: 1,
    collides: true,
    data: { activityCollisionAnchorSlotId: 'ceres_throughline_collision_anchor' },
  };
  const state = {
    tick: 1_000,
    playerId: player.id,
    entities: new Map([[player.id, player], [anchor.id, anchor]]),
    entityList: [player, anchor],
  };
  const trace = {
    nextEventSeq: 10,
    events: [
      {
        seq: 8,
        event: 'physics:impact',
        tick: 999,
        aId: player.id,
        bId: anchor.id,
        aType: 'ship',
        aAnchorSlotId: null,
        bType: 'asteroid',
        bWorldRecordId: null,
        bAnchorSlotId: 'ceres_throughline_collision_anchor',
      },
      {
        seq: 9,
        event: 'physics:impact',
        tick: 1_000,
        aId: player.id,
        bId: anchor.id,
        aType: 'ship',
        aAnchorSlotId: null,
        bType: 'asteroid',
        bWorldRecordId: null,
        bAnchorSlotId: 'ceres_throughline_collision_anchor',
      },
    ],
  };
  const heldKeys = new Set();
  const fixedTickSamples = [];
  let thrustHolds = 0;
  let wallWaits = 0;
  const runInPage = (callback, argument) => {
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const previousWindow = globalThis.window;
    globalThis.window = {
      SF: { state },
      __SF_CERES_FIVE_MINUTE_TRACE__: trace,
    };
    try {
      return callback(argument);
    } finally {
      if (hadWindow) globalThis.window = previousWindow;
      else delete globalThis.window;
    }
  };
  const page = {
    isClosed() { return false; },
    locator() {
      return { async waitFor() {}, async focus() {} };
    },
    keyboard: {
      async down(key) { heldKeys.add(key); },
      async up(key) { heldKeys.delete(key); },
    },
    mouse: { async up() {} },
    async evaluate(callback, argument) {
      return runInPage(callback, argument);
    },
    async waitForFunction(callback, argument) {
      state.tick = argument.tick + argument.deltaTicks;
      fixedTickSamples.push({ tick: state.tick, held: [...heldKeys].sort() });
      if (heldKeys.has('KeyW')) {
        const exactEventTimeIdentity = thrustHolds > 0;
        trace.events.push({
          seq: trace.nextEventSeq++,
          event: 'physics:impact',
          tick: state.tick,
          aId: player.id,
          bId: anchor.id,
          aType: 'ship',
          aAnchorSlotId: null,
          bType: 'asteroid',
          bWorldRecordId: null,
          bAnchorSlotId: exactEventTimeIdentity
            ? 'ceres_throughline_collision_anchor'
            : 'ceres_ambush_collision_anchor',
        });
        thrustHolds += 1;
      }
      assert.equal(runInPage(callback, argument), true);
    },
    async waitForTimeout() { wallWaits += 1; },
  };

  const receipt = await drivePublicAnchorCollision(page, 10_000, {
    minRemainingTicks: 120,
  });
  assert.equal(receipt.schema, 'spaceface.ceresAnchorCollisionReceipt.v1');
  assert.equal(receipt.controlClock, 'fixed-tick');
  assert.equal(receipt.startTick, 1_000);
  assert.equal(receipt.startSeq, 10);
  assert.equal(receipt.selectedImpactSeq, 11);
  assert.equal(receipt.selectedImpactTick, receipt.impact.tick);
  assert.equal(receipt.impact.seq, 11,
    'the collision proof must reject old/same-tick cursors and wrong event-time anchor metadata');
  assert.equal(receipt.impact.tick >= receipt.startTick, true);
  assert.equal(receipt.pulses, 2);
  assert.equal(receipt.boostPulses, 2);
  assert.ok(receipt.completionTick > receipt.selectedImpactTick,
    'the boosted collision receipt completes only after its public neutral release tick');
  assert.equal(wallWaits, 0, 'collision steering cannot translate wall time into route distance');
  assert.deepEqual(fixedTickSamples.map((sample) => sample.held), [
    ['KeyW', 'Shift'],
    [],
    ['KeyW', 'Shift'],
    [],
  ]);
  assert.equal(heldKeys.size, 0);
});

test('anchor collision preflights every fixed pulse and rejects deadline-edge impacts', async () => {
  const makeHarness = ({
    tick,
    anchorPos,
    playerVel = { x: 0, z: 0 },
    lateStatusTick = null,
    lateImpactTick = null,
  }) => {
    const player = {
      id: PLAYER_ENTITY_ID,
      alive: true,
      type: 'ship',
      pos: { x: 0, z: 0 },
      vel: { ...playerVel },
      rot: 0,
      data: {},
    };
    const anchor = {
      id: 9,
      alive: true,
      type: 'asteroid',
      pos: { ...anchorPos },
      mass: 1,
      collides: true,
      data: { activityCollisionAnchorSlotId: 'ceres_throughline_collision_anchor' },
    };
    const state = {
      tick,
      playerId: player.id,
      entities: new Map([[player.id, player], [anchor.id, anchor]]),
      entityList: [player, anchor],
    };
    const trace = { nextEventSeq: 10, events: [] };
    let evaluateCalls = 0;
    let keydowns = 0;
    let fixedWaits = 0;
    const runInPage = (callback, argument) => {
      const hadWindow = Object.hasOwn(globalThis, 'window');
      const previousWindow = globalThis.window;
      globalThis.window = {
        SF: { state },
        __SF_CERES_FIVE_MINUTE_TRACE__: trace,
      };
      try {
        return callback(argument);
      } finally {
        if (hadWindow) globalThis.window = previousWindow;
        else delete globalThis.window;
      }
    };
    return {
      page: {
        isClosed() { return false; },
        locator() { return { async waitFor() {}, async focus() {} }; },
        keyboard: {
          async down() { keydowns += 1; },
          async up() {},
        },
        mouse: { async up() {} },
        async evaluate(callback, argument) {
          evaluateCalls += 1;
          if (evaluateCalls === 2 && Number.isSafeInteger(lateStatusTick)) {
            state.tick = lateStatusTick;
            trace.events.push({
              seq: trace.nextEventSeq++,
              event: 'physics:impact',
              tick: lateImpactTick,
              aId: player.id,
              bId: anchor.id,
              aType: 'ship',
              aAnchorSlotId: null,
              bType: 'asteroid',
              bWorldRecordId: null,
              bAnchorSlotId: 'ceres_throughline_collision_anchor',
            });
          }
          return runInPage(callback, argument);
        },
        async waitForFunction(callback, argument) {
          fixedWaits += 1;
          state.tick = argument.tick + argument.deltaTicks;
          assert.equal(runInPage(callback, argument), true);
        },
      },
      get keydowns() { return keydowns; },
      get fixedWaits() { return fixedWaits; },
    };
  };

  for (const [label, harness] of [
    ['turn pulse', makeHarness({ tick: 1_075, anchorPos: { x: 0, z: 100 } })],
    ['thrust pulse', makeHarness({
      tick: 1_075,
      anchorPos: { x: 20, z: 0 },
      playerVel: { x: 100, z: 0 },
    })],
    ['boost plus neutral pulse', makeHarness({ tick: 1_068, anchorPos: { x: 100, z: 0 } })],
  ]) {
    await assert.rejects(
      drivePublicAnchorCollision(harness.page, 1_200, { minRemainingTicks: 120 }),
      /exhausted the five-minute horizon/,
      label,
    );
    assert.equal(harness.keydowns, 0, `${label} must fail before public keydown`);
    assert.equal(harness.fixedWaits, 0, `${label} must fail before advancing a fixed tick`);
  }

  for (const [label, harness] of [
    ['late selected impact', makeHarness({
      tick: 1_070,
      anchorPos: { x: 20, z: 0 },
      lateStatusTick: 1_080,
      lateImpactTick: 1_080,
    })],
    ['late completion', makeHarness({
      tick: 1_070,
      anchorPos: { x: 20, z: 0 },
      lateStatusTick: 1_080,
      lateImpactTick: 1_079,
    })],
  ]) {
    await assert.rejects(
      drivePublicAnchorCollision(harness.page, 1_200, { minRemainingTicks: 120 }),
      /exhausted the five-minute horizon/,
      label,
    );
    assert.equal(harness.keydowns, 0);
    assert.equal(harness.fixedWaits, 0);
  }

  const nonfinite = makeHarness({
    tick: 1_000,
    anchorPos: { x: Number.NaN, z: 0 },
  });
  await assert.rejects(
    drivePublicAnchorCollision(nonfinite.page, 1_200, { minRemainingTicks: 120 }),
    /nonfinite motion telemetry/,
  );
  assert.equal(nonfinite.keydowns, 0,
    'nonfinite collision telemetry must fail before public keydown');
  assert.equal(nonfinite.fixedWaits, 0);
});

test('pre-Continue route reserves preserve toolkit, Cathedral, and save horizons', () => {
  assert.equal(ceresPreContinueLegReserveTicks('ceres_ambush_run'), 7_200);
  assert.equal(ceresPreContinueLegReserveTicks('ceres_cathedral_grave'), 4_800);
  assert.equal(ceresPreContinueLegReserveTicks('ceres_refinery_pocket'), 2_400);
  assert.equal(ceresPreContinueLegReserveTicks('ceres_working_seam'), 2_400);
  assert.equal(ceresPreContinueLegReserveTicks('ceres_ambush_run', {
    continueCompleted: true,
  }), 2_400, 'post-Continue observation retains only the exact final evidence horizon');

  const librarySource = readFileSync(
    new URL('../scripts/lib/ceresFiveMinuteAcceptance.mjs', import.meta.url),
    'utf8',
  );
  assert.match(librarySource,
    /ceresPreContinueLegReserveTicks\(leg\.pocketId,[\s\S]*minRemainingTicks: legReserveTicks/,
    'the leg selector must flow its reserve into the physical pocket driver');
  assert.match(librarySource,
    /drivePublicAnchorCollision\(page, observerBounds\.endTick, \{[\s\S]*minRemainingTicks: CERES_TOOLKIT_ROUTE_RESERVE_TICKS/,
    'the collision proof must preserve the full toolkit and downstream route reserve');
  assert.match(librarySource,
    /const toolkitDeadlineTick = endTick - CERES_TOOLKIT_ROUTE_RESERVE_TICKS/,
    'every toolkit sub-action must share the absolute 7,200-tick deadline');
});

test('public toolkit acquisition stages before conflict and never treats yaw as camera motion', async () => {
  const nearestOffscreen = {
    id: 202,
    worldRecordId: 'wr_npc_b41fdf37',
    alive: true,
    distanceWU: 276.1269,
    headingError: -1.049,
    pointable: false,
    ndcX: null,
    ndcY: null,
  };
  const fartherPointable = {
    id: 203,
    worldRecordId: 'wr_npc_farther',
    alive: true,
    distanceWU: 310,
    headingError: -0.2,
    pointable: true,
    ndcX: 0.42,
    ndcY: -0.1,
  };
  const selected = selectCeresHostilePointingStatus({
    tick: 6_834,
    candidates: [nearestOffscreen, fartherPointable],
  });
  assert.equal(selected.nearest.id, nearestOffscreen.id,
    'distance ordering remains diagnostic even when the nearest actor is outside the frustum');
  assert.deepEqual(selected.candidates.map((row) => row.id), [nearestOffscreen.id, fartherPointable.id],
    'bounded combat diagnostics must preserve every exact projected cohort candidate');
  assert.deepEqual(selected.target, {
    id: fartherPointable.id,
    worldRecordId: fartherPointable.worldRecordId,
    alive: true,
    ndcX: fartherPointable.ndcX,
    ndcY: fartherPointable.ndcY,
  }, 'a farther exact cohort member must not be hidden by the nearest off-screen actor');

  const plan = planCeresThroughlineToolkitReposition();
  assert.equal(plan.source, 'public-flight-controls');
  const hostileSpawn = sectorLocalToGlobalForSector(
    SECTOR_ZONES.sector_ceres_belt.find((zone) => zone.id === 'zone_ceres_ambush')
      .presence.spawnCenter,
    CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
  );
  assert.deepEqual(plan.waypoints.map((waypoint) => ({
    targetPos: waypoint.targetPos,
    arrivalRadiusWU: waypoint.arrivalRadiusWU,
    minRemainingTicks: waypoint.minRemainingTicks,
    allowBoost: waypoint.allowBoost,
    controlClock: waypoint.controlClock,
  })), [
    {
      targetPos: { x: AMBUSH_ZONE_GLOBAL.x - 27, z: AMBUSH_ZONE_GLOBAL.z - 12 },
      arrivalRadiusWU: 23,
      minRemainingTicks: CERES_TOOLKIT_ROUTE_RESERVE_TICKS,
      allowBoost: true,
      controlClock: 'fixed-tick',
    },
    {
      targetPos: { x: hostileSpawn.x - 40, z: hostileSpawn.z + 20 },
      arrivalRadiusWU: 23,
      minRemainingTicks: CERES_TOOLKIT_ROUTE_RESERVE_TICKS,
      allowBoost: true,
      controlClock: 'fixed-tick',
    },
  ], 'the route uses exact canonical clearance and view stages before conflict and toolkit input');

  const boundHostiles = [{
    entityId: nearestOffscreen.id,
    worldRecordId: nearestOffscreen.worldRecordId,
  }];
  const events = [];
  let tick = 6_834;
  const page = {
    keyboard: {
      async down(key) { assert.fail(`projection wait must not press ${key}`); },
      async up(key) { assert.fail(`projection wait must not release ${key}`); },
    },
    async evaluate(_callback, authorityRows) {
      assert.deepEqual(authorityRows, boundHostiles,
        'every projection poll stays bound to exact entity and durable record identity');
      return {
        tick,
        candidates: [{
          ...nearestOffscreen,
        }],
      };
    },
    async waitForTimeout(durationMs) {
      events.push(`wait:${durationMs}`);
      assert.equal(durationMs, 150);
      tick += 9;
    },
  };
  const acquired = await pointPublicAtCeresHostile(page, boundHostiles, END_TICK, {
    maxAttempts: 2,
  });
  assert.equal(acquired, null,
    'stationary yaw telemetry cannot turn an off-screen world actor into a pointable target');
  assert.deepEqual(events, ['wait:150'],
    'two attempts require only the one wait between their projection samples');

  let horizonKeydowns = 0;
  const horizonPage = {
    keyboard: {
      async down() { horizonKeydowns += 1; },
      async up() {},
    },
    async evaluate() {
      return {
        tick: END_TICK - 120,
        candidates: [nearestOffscreen],
      };
    },
    async waitForTimeout() { assert.fail('horizon rejection must not wait or pulse a key'); },
  };
  await assert.rejects(
    pointPublicAtCeresHostile(horizonPage, boundHostiles, END_TICK),
    /exhausted the exact route horizon/,
  );
  assert.equal(horizonKeydowns, 0, 'the exact reserve boundary rejects before public input');

  const librarySource = readFileSync(
    new URL('../scripts/lib/ceresFiveMinuteAcceptance.mjs', import.meta.url),
    'utf8',
  );
  const repositionIndex = librarySource.indexOf(
    'const cameraReposition = await repositionPublicForCeresToolkit(page, endTick, {',
  );
  const conflictIndex = librarySource.indexOf(
    'waitForCeresToolkitConflictAuthority(page, prebound, endTick, {', repositionIndex,
  );
  const pointIndex = librarySource.indexOf(
    'const target = await pointPublicAtCeresHostile(page, baseline.initialHostiles, endTick, {',
  );
  assert.ok(repositionIndex >= 0 && conflictIndex > repositionIndex && pointIndex > conflictIndex,
    'the public view stage must precede live conflict classification and render-projection acquisition');
});

test('production toolkit fixture scopes field/runtime cleanup around every setup step', () => {
  const source = runSeed47ToolkitCameraReposition.toString();
  const enableIndex = source.indexOf('FIELD_FLAGS.enabled = true;');
  const tryIndex = source.indexOf('try {', enableIndex);
  const runtimeIndex = source.indexOf('runtime = createAuthoritativeRuntime({', tryIndex);
  const sectorIndex = source.indexOf("enterSector('sector_ceres_belt'", runtimeIndex);
  const sg02Index = source.indexOf('if (physicsSystem._sg02Init)', sectorIndex);
  const directorIndex = source.indexOf("_seedCeresActivityAmbush('sector_ceres_belt')", sg02Index);
  const finallyIndex = source.indexOf('} finally {', directorIndex);
  const disposeIndex = source.indexOf('runtime?.dispose();', finallyIndex);
  const restoreIndex = source.indexOf('FIELD_FLAGS.enabled = previousFieldFlag;', finallyIndex);
  assert.ok(enableIndex >= 0 && tryIndex > enableIndex && runtimeIndex > tryIndex,
    'the cleanup boundary must open before authoritative runtime creation');
  assert.ok(sectorIndex > runtimeIndex && sg02Index > sectorIndex && directorIndex > sg02Index,
    'sector, SG-02, and director setup must remain inside the cleanup boundary');
  assert.ok(finallyIndex > directorIndex && disposeIndex > finallyIndex && restoreIndex > disposeIndex,
    'the outer finally must dispose any created runtime before restoring the global field flag');
});

test('seed-47 Hornet traverses the toolkit camera corridor with production Flight V3 and Rapier', async (t) => {
  const fieldFlagBeforeFixture = FIELD_FLAGS.enabled;
  const result = await runSeed47ToolkitCameraReposition();
  assert.equal(FIELD_FLAGS.enabled, fieldFlagBeforeFixture,
    'the production fixture must restore the process-global field feature flag');
  assert.deepEqual(result.runtime, {
    evidenceClass: 'production-manifest',
    aiBackend: 'sg06-tactical',
    flightBackend: 'v3',
  }, 'the stage fixture must run through the authoritative production manifest');
  assert.deepEqual(result.physics, {
    backend: 'rapier-dynamic',
    sg02Ready: true,
    weaponImpulseConsequences: true,
    captureContactImpacts: true,
  }, 'impact assertions are admissible only while production Rapier contact capture is active');
  assert.equal(result.collisionReceipt.pass, true);
  assert.equal(result.collisionReceipt.source, 'public-keyboard-fixed-tick');
  assert.equal(result.collisionReceipt.controlClock, 'fixed-tick');
  assert.ok(result.collisionReceipt.pulses > 0 && result.collisionReceipt.pulses <= 40,
    `fresh collision exceeded its bounded public pulse margin: ${result.collisionReceipt.pulses}`);
  assert.ok(result.collisionReceipt.selectedImpactSeq >= result.collisionReceipt.startSeq);
  assert.ok(result.collisionReceipt.selectedImpactTick >= result.collisionReceipt.startTick);
  assert.equal(result.collisionReceipt.anchorEntityId,
    result.collisionReceipt.impact.aId === result.playerEntityId
      ? result.collisionReceipt.impact.bId : result.collisionReceipt.impact.aId);
  assert.deepEqual(result.receipts.map((receipt) => receipt.pass), [true, true]);
  assert.ok(result.receipts.reduce((sum, receipt) => sum + receipt.pulses, 0) <= 90,
    'the canonical two-waypoint stage retains margin around the measured 86-pulse route');
  assert.equal(result.boostPulses, 0,
    'the measured collision exit needs no dash while preserving boost-capable public controls');
  assert.ok(result.elapsedTicks <= 520,
    'the canonical stage retains margin around the measured 494-tick route');
  assert.ok(result.receipts.at(-1).distanceWU <= 23);
  assert.ok(result.receipts.at(-1).speed <= 1);
  assert.ok(result.playerHull > 0 && result.playerHull <= 260);
  assert.deepEqual(result.boundHostilesBeforeReposition.map((row) => row.worldRecordId).sort(),
    TOOLKIT_HOSTILES.map((row) => row.worldRecordId).sort(),
  'the real adopted hostile cohort must exist before the first camera-control tick');
  const exactAnchorImpact = (impact) => {
    const playerIsA = impact.aId === result.playerEntityId;
    const otherType = playerIsA ? impact.bType : impact.aType;
    const otherWorldRecordId = playerIsA ? impact.bWorldRecordId : impact.aWorldRecordId;
    const otherAnchorSlotId = playerIsA ? impact.bAnchorSlotId : impact.aAnchorSlotId;
    return otherType === 'asteroid' && otherWorldRecordId == null
      && otherAnchorSlotId === 'ceres_throughline_collision_anchor';
  };
  assert.ok(result.collisionPlayerImpactEvents.length >= 1
    && result.collisionPlayerImpactEvents.every(exactAnchorImpact),
  `the fresh collision pulse may contact only the exact authored Throughline anchor: ${JSON.stringify(result.collisionPlayerImpactEvents)}`);
  assert.ok(result.stagePlayerImpactEvents.every(exactAnchorImpact),
    'residual stage contacts may retain only the exact required Throughline anchor identity');
  assert.equal(result.stagePlayerImpactEvents.some((impact) => (
    (impact.aId === result.playerEntityId ? impact.bAnchorSlotId : impact.aAnchorSlotId)
      === 'ceres_ambush_collision_anchor'
  )), false, 'the clearance dogleg must reject every second-anchor contact');
  assert.ok(result.stageMinimumHullGaps.secondAnchor > 10,
    `second-anchor hull gap lost its hard margin: ${result.stageMinimumHullGaps.secondAnchor}`);
  assert.ok(result.stageMinimumHullGaps.traffic1 > 100
    && result.stageMinimumHullGaps.traffic2 > 100,
  `traffic hull gap lost its route margin: ${JSON.stringify(result.stageMinimumHullGaps)}`);
  assert.ok(result.stageMinimumHullGaps.hostile1 > 30
    && result.stageMinimumHullGaps.hostile2 > 30,
  `live cohort hull gap lost its route margin: ${JSON.stringify(result.stageMinimumHullGaps)}`);

  assert.equal(result.conflictSnapshot.durablePhase, 'revealed');
  assert.equal(result.conflictSnapshot.durableOutcome, null);
  assert.equal(result.conflictSnapshot.livePhase, 'conflict');
  assert.equal(result.conflictSnapshot.boundHostiles.length, 2);
  assert.ok(result.conflictSnapshot.boundHostiles.every((hostile) => (
    hostile.alive === true && hostile.phase === 'conflict'
      && hostile.passive === false && hostile.roe === 'weapons_free'
      && hostile.targetId === result.playerEntityId
  )), 'the first post-stage conflict read must retain the exact live player-bound pair');
  const pointable = result.conflictSnapshot.boundHostiles.filter((hostile) => (
    hostile.distanceWU <= 320
      && Math.abs(hostile.projection.x) <= 0.98
      && Math.abs(hostile.projection.y) <= 0.98
  ));
  assert.ok(pointable.length >= 1,
    'at least one live exact cohort member must be Massline-ready at stage completion');
  assert.ok(pointable.some((hostile) => (
    hostile.entityId === result.selectedPointable.entityId
      && hostile.worldRecordId === result.selectedPointable.worldRecordId
  )), 'the fixture continuation must remove an exact actor chosen by live pointability');
  assert.equal(result.selectedTargetAliveAfter, false,
    'the live pointable Massline target must be the combat victim before transit');
  assert.equal(result.repulsor?.kind, 'repulsor');
  assert.equal(result.repulsor?.ownerId, result.playerEntityId);
  assert.ok(result.repulsor?.tick < result.transitStartTick,
    'the public Repulsor release edge must complete before Cathedralward transit starts');
  assert.deepEqual(result.postCameraPlayerImpactEvents, [],
    'the exact post-camera Repulsor and whole transit window must stay impact-free');

  const recordedHostile = { x: -8972.711669921875, z: 7237.062744140625 };
  const preReposition = projectThroughSettledChaseCamera(
    { x: -9_295, z: 7_267 },
    recordedHostile,
  );
  const postReposition = projectThroughSettledChaseCamera(result.playerPos, recordedHostile);
  assert.ok(Math.abs(preReposition.x) > 0.98,
    'the exact failed hostile begins outside the fixed camera frustum');
  assert.ok(Math.abs(postReposition.x) <= 0.98 && Math.abs(postReposition.y) <= 0.98,
    'the same durable hostile projects inside the settled fixed camera after public translation');
  const stage = planCeresThroughlineToolkitReposition().waypoints.at(-1);
  let maxCompletionShellNdc = 0;
  for (let bearing = 0; bearing < 360; bearing += 1) {
    const radians = bearing * Math.PI / 180;
    const endpoint = {
      x: stage.targetPos.x + Math.cos(radians) * stage.arrivalRadiusWU,
      z: stage.targetPos.z + Math.sin(radians) * stage.arrivalRadiusWU,
    };
    const projection = projectThroughSettledChaseCamera(endpoint, recordedHostile);
    maxCompletionShellNdc = Math.max(
      maxCompletionShellNdc,
      Math.abs(projection.x),
      Math.abs(projection.y),
    );
    assert.ok(Math.abs(projection.x) <= 0.98 && Math.abs(projection.y) <= 0.98,
      `the full public completion shell keeps the recorded hostile pointable at bearing ${bearing}`);
  }
  assert.ok(maxCompletionShellNdc <= 0.95,
    `the full completion shell must retain the measured NDC margin, got ${maxCompletionShellNdc}`);

  assert.equal(result.transitReceipt.pass, true);
  assert.ok(result.transitReceipt.distanceWU <= result.transitPlan.arrivalRadiusWU);
  assert.ok(result.transitReceipt.speed <= 1);
  assert.ok(result.transitReceipt.pulses < 220,
    'the full fixed-tick no-boost handoff must fit the public controller pulse budget');
  assert.ok(result.transitTicks < CERES_TOOLKIT_TRANSIT_HANDOFF_RESERVE_TICKS,
    'the production Flight V3/Rapier handoff must fit its durable pre-end-7200 reserve');
  assert.equal(result.survivorAlive, true);
  assert.notEqual(result.survivorEntityId, result.selectedPointable.entityId);
  assert.notEqual(result.survivorWorldRecordId, result.selectedPointable.worldRecordId);
  assert.ok(TOOLKIT_HOSTILES.some((row) => row.worldRecordId === result.survivorWorldRecordId));
  assert.deepEqual(result.encounterInitialRecordIds, TOOLKIT_HOSTILES
    .map((row) => row.worldRecordId).sort(),
  'the production encounter starts from the real two-hostile durable cohort');
  assert.ok(result.survivorDistanceWU >= CERES_TOOLKIT_TRANSIT_ESCAPE_RADIUS_WU,
    'the settled handoff must cross the director-authored escape radius');
  assert.deepEqual(result.encounterResolution && {
    encounterId: result.encounterResolution.encounterId,
    outcome: result.encounterResolution.outcome,
  }, {
    encounterId: 'ceres:activity:throughline-ambush',
    outcome: 'escaped',
  }, 'the production encounter director must resolve the exact adopted ambush as escaped');
  assert.ok(result.encounterResolution.tick >= result.transitStartTick
    && result.encounterResolution.tick <= result.transitEndTick,
  'the production escape resolution must occur inside the measured handoff');
  assert.ok(result.remainingCathedralDistanceWU <= 1_850,
    'the authored 2,800-WU corridor must leave materially less than half the center leg');
  assert.equal(result.cathedralArrived, true,
    `the remaining Cathedral leg did not arrive within ${result.cathedralTicks} ticks`);
  assert.ok(result.cathedralTicks < 2_300,
    'the deterministic remaining Cathedral leg must fit the 2,400-tick route boundary with margin');
  assert.deepEqual(result.transitPlayerImpactTicks, [],
    `the measured Cathedralward corridor must not trade route headroom for a collision: ${JSON.stringify(result.transitPlayerImpactEvents)}`);
  t.diagnostic(JSON.stringify({
    stageTicks: result.elapsedTicks,
    collisionTick: result.collisionReceipt.selectedImpactTick,
    collisionPulses: result.collisionReceipt.pulses,
    stagePulses: result.receipts.reduce((sum, receipt) => sum + receipt.pulses, 0),
    stageBoostPulses: result.boostPulses,
    maxCompletionShellNdc,
    transitStartTick: result.transitStartTick,
    transitEndTick: result.transitEndTick,
    transitTicks: result.transitTicks,
    transitPulses: result.transitReceipt.pulses,
    escapeResolutionTick: result.encounterResolution.tick,
    survivorDistanceWU: result.survivorDistanceWU,
    escapeMarginWU: result.survivorDistanceWU - CERES_TOOLKIT_TRANSIT_ESCAPE_RADIUS_WU,
    remainingCathedralDistanceWU: result.remainingCathedralDistanceWU,
    remainingCathedralTicks: result.cathedralTicks,
    playerImpactTicks: result.transitPlayerImpactTicks,
    pointableRecordIds: pointable.map((hostile) => hostile.worldRecordId),
  }));
});

test('seed-47 production Massline relatch retains and leads the Reaver through off-frustum fire', async () => {
  const result = await runSeed47OffFrustumMasslineCombat();

  assert.deepEqual(result.runtime, {
    evidenceClass: 'production-manifest',
    aiBackend: 'sg06-tactical',
    flightBackend: 'v3',
  });
  assert.deepEqual(result.physics, { backend: 'rapier-dynamic', sg02Ready: true });
  assert.equal(result.targetWorldRecordId, 'wr_npc_b41fdf37');

  assert.equal(result.attachedEvents.length, 2,
    'the public attach, cut, and relatch sequence must create exactly two physical lines');
  assert.deepEqual(result.attachedEvents.map((event) => event.targetId), [result.targetId, result.targetId]);
  assert.notEqual(result.attachedEvents[0].attachmentId, result.attachedEvents[1].attachmentId,
    'relatch must create a fresh physical attachment rather than revive the cut line');
  assert.equal(result.latchedEvents.length, 2);
  assert.ok(result.latchedEvents.every((event) => event.previewMatched === true),
    'each public press must consume the exact preview that was published on the prior tick');
  assert.ok(result.latchedEvents.every((event) => event.selectionReceiptId),
    'each public press must carry a fresh cursor-acquisition receipt');
  assert.notEqual(result.latchedEvents[0].selectionReceiptId, result.latchedEvents[1].selectionReceiptId);
  const firstCut = result.brokenEvents.find(
    (event) => event.attachmentId === result.attachedEvents[0].attachmentId,
  );
  assert.equal(firstCut?.reason, 'tether_cut');
  assert.ok(firstCut.seq < result.attachedEvents[1].seq,
    'the first physical line must be publicly cut before the fresh relatch');
  assert.ok(result.tombstone,
    `full-health Reaver survived the ${SEED47_REAVER_KILL_TICK_CEILING}-tick fixed-pointer ceiling`);
  assert.equal(result.brokenEvents.some((event) => (
    event.attachmentId === result.attachedEvents[1].attachmentId
      && event.seq < result.tombstone.seq
  )), false, 'the second line must remain unbroken until the exact target is tombstoned');

  assert.ok(result.offFrustumFire.seq > result.latchedEvents[1].seq,
    'the accepted fire must be fresh evidence after the second latch');
  assert.ok(Math.abs(result.offFrustumFire.projection.x) > 0.98
    || Math.abs(result.offFrustumFire.projection.y) > 0.98,
    'the exact target must already be outside the fixed camera when the accepted round leaves');
  assert.equal(result.offFrustumFire.targetId, result.targetId);
  assert.equal(result.offFrustumFire.gunTargetId, result.targetId);
  assert.equal(result.offFrustumFire.tetherActive, true);
  assert.equal(result.offFrustumFire.attachmentId, result.attachedEvents[1].attachmentId);
  assert.ok(Number.isInteger(result.offFrustumFire.projectileId),
    'the off-frustum fire receipt must bind the fresh projectile it spawned');
  assert.ok(Math.abs(result.offFrustumFire.leadRad) > 0.04,
    'the Massline firing solution must lead the crossing target by more than weapon spread');

  assert.ok(result.exactHit.seq > result.offFrustumFire.seq);
  assert.ok(result.exactHit.tick > result.offFrustumFire.tick);
  assert.equal(result.exactHit.projectileId, result.offFrustumFire.projectileId,
    'the exact projectile spawned by the off-frustum fire receipt must land the hit');
  assert.equal(result.exactHit.ownerId, result.playerId);
  assert.equal(result.exactHit.targetId, result.targetId);
  assert.equal(result.exactHit.weaponId, result.offFrustumFire.weaponId);
  assert.equal(result.exactHit.tetherActive, true);
  assert.equal(result.exactHit.attachmentId, result.attachedEvents[1].attachmentId);
  assert.equal(result.exactHit.lineState, 'active');
  assert.equal(result.targetAliveAtHit, true);
  assert.ok(result.firstHitCombatTicks <= 240,
    'the first exact off-frustum hit must retain its original bounded route guarantee');

  assert.ok(result.tombstone.seq > result.exactHit.seq);
  assert.equal(result.tombstone.id, result.targetId);
  assert.equal(result.tombstone.worldRecordId, result.targetWorldRecordId);
  assert.equal(result.tombstone.killerId, result.playerId,
    'the exact captured Reaver tombstone must belong to the public player weapon route');
  assert.equal(result.tombstone.tetherActive, true);
  assert.equal(result.tombstone.attachmentId, result.attachedEvents[1].attachmentId);
  assert.equal(result.tombstone.lineState, 'active');
  assert.equal(result.secondLineStayedActiveBeforeKill, true);
  assert.equal(result.targetAliveAfterLoop, false);
  assert.ok(result.maxDistanceWU <= 390,
    'the captured Reaver must stay inside the canonical standard-Massline length');
  assert.ok(result.combatTicks <= SEED47_REAVER_KILL_TICK_CEILING,
    'fixed-pointer fire must tombstone the full-health Reaver inside the measured TTK ceiling');
  assert.ok(result.targetHitCount > 11,
    'the regression must continue materially beyond the Browser hit-only fingerprint');
  assert.deepEqual(result.finalAimPoint, result.fixedAimPoint,
    'the harness cursor must remain fixed after relatch instead of privately following the Reaver');
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

  const invalidMotion = pocketSettlePage({
    tick: 1_000,
    endTick: 2_000,
    distanceWU: 80,
    pollSpeeds: [NaN],
  });
  await assert.rejects(
    settleCeresPocketApproach(invalidMotion.page, {
      point: { x: 0, z: 0 },
      endTick: 2_000,
      targetName: 'Working Seam',
    }),
    /Working Seam (?:settle observed invalid navigation telemetry|public brake did not settle the player)/,
    'NaN velocity terminates the wait only to a fail-closed status check',
  );
  assert.equal(invalidMotion.events.at(-1), 'up:Digit0',
    'invalid motion still releases the public brake');

  const nextLegHorizon = pocketSettlePage({
    tick: 18_023 - 2_400,
    endTick: 18_023,
    distanceWU: 80,
    pollSpeeds: [78],
  });
  await assert.rejects(
    settleCeresPocketApproach(nextLegHorizon.page, {
      point: { x: 0, z: 0 },
      endTick: 18_023,
      minRemainingTicks: 2_400,
      targetName: 'Belt Outpost departure corridor',
    }),
    /settle exhausted the exact route horizon/,
  );
  assert.equal(nextLegHorizon.events.at(-1), 'up:Digit0',
    'the next-leg reserve failure must release the public brake');
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

test('Working Seam evidence publicly restages to the fixed Belt Outpost departure corridor', async () => {
  const sectorId = CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId;
  const liveAcceptedArrival = Object.freeze({
    x: -11_495.697937011719,
    z: 7_342.5372314453125,
  });
  const authoredBeltOutpost = SECTOR_ANCHORS[sectorId].stations
    .find((station) => station.id === 'station_beltout');
  const fixedDeparture = Object.freeze(sectorLocalToGlobalForSector(
    authoredBeltOutpost.pos,
    sectorId,
  ));
  const throughline = sectorLocalToGlobalForSector(
    CERES_ACTIVITY_POCKETS_BY_ID.ceres_ambush_run.activityAnchor.localPos,
    sectorId,
  );
  const target = planCeresWorkingSeamEgress({
    sectorId,
    player: { alive: true, pos: liveAcceptedArrival },
  }, { minRemainingTicks: 2_400 });
  const targetToThroughline = Math.hypot(
    throughline.x - target.targetPos.x,
    throughline.z - target.targetPos.z,
  );
  assert.deepEqual(target.targetPos, fixedDeparture,
    'the public return targets the authored station center instead of a variable station ring point');
  assert.deepEqual(target.sourceArrivalPos, liveAcceptedArrival,
    'the plan must retain the live accepted-arrival evidence separately from its fixed target');
  assert.notEqual(target.sourceArrivalPos, target.targetPos,
    'live evidence and the fixed corridor must not share mutable identity');
  assert.equal(target.allowBoost, false,
    'the fixed station-center corridor must explicitly suppress manual dash taps');
  assert.ok(Math.abs(target.guaranteedPublicEgressWU - 188.78177829171545) < 1e-6,
    `both 90-WU completion circles must be deducted, got ${target.guaranteedPublicEgressWU}`);
  assert.equal(target.minRemainingTicks, 2_400,
    'the seam return must preserve the next public navigation leg');
  assert.ok(Math.abs(target.guaranteedThroughlineProgressWU - 109.42126295372827) < 1e-6,
    `both completion circles must be deducted from Throughline progress, got ${target.guaranteedThroughlineProgressWU}`);
  assert.ok(Math.abs(targetToThroughline - 2_260.088493842664) < 1e-6,
    'the fixed route geometry must remain bound to the authored Belt Outpost center');

  const seamAnchor = sectorLocalToGlobalForSector(
    CERES_ACTIVITY_POCKETS_BY_ID.ceres_working_seam.activityAnchor.localPos,
    sectorId,
  );
  const pathX = fixedDeparture.x - seamAnchor.x;
  const pathZ = fixedDeparture.z - seamAnchor.z;
  const pathDistanceWU = Math.hypot(pathX, pathZ);
  const collisionPocket = [
    { id: 121, radius: 11.41481447708793, pos: { x: -11_483.771515911701, z: 7_320.0985105152195 } },
    { id: 106, radius: 13.57198176253587, pos: { x: -11_489.171003410438, z: 7_369.322458417971 } },
  ];
  const trappedArrival = liveAcceptedArrival;
  const failedExtendedTarget = Object.freeze({ x: -11_130.966289293183, z: 7_193.515077392905 });
  assert.ok(Math.abs(Math.hypot(
    failedExtendedTarget.x - trappedArrival.x,
    failedExtendedTarget.z - trappedArrival.z,
  ) - 394.00098635142723) < 1e-6,
  'the failed planner required another 394 WU after reaching the proven arrival');
  for (const rock of collisionPocket) {
    const capturedArrivalGapWU = Math.hypot(
      trappedArrival.x - rock.pos.x,
      trappedArrival.z - rock.pos.z,
    ) - 16 - rock.radius;
    assert.ok(capturedArrivalGapWU < -2 && capturedArrivalGapWU > -2.01,
      `the failed route must retain rock ${rock.id}'s captured contact fingerprint`);
    let minimumHandoffGapWU = Number.POSITIVE_INFINITY;
    for (let sample = 0; sample < 3_600; sample += 1) {
      const angle = sample * Math.PI / 1_800;
      const possibleSeamReceipt = {
        x: seamAnchor.x + Math.cos(angle) * 90,
        z: seamAnchor.z + Math.sin(angle) * 90,
      };
      const approachX = fixedDeparture.x - possibleSeamReceipt.x;
      const approachZ = fixedDeparture.z - possibleSeamReceipt.z;
      const approachDistanceWU = Math.hypot(approachX, approachZ);
      const handoff = {
        x: fixedDeparture.x - (approachX / approachDistanceWU) * target.arrivalRadiusWU,
        z: fixedDeparture.z - (approachZ / approachDistanceWU) * target.arrivalRadiusWU,
      };
      minimumHandoffGapWU = Math.min(
        minimumHandoffGapWU,
        Math.hypot(handoff.x - rock.pos.x, handoff.z - rock.pos.z) - 16 - rock.radius,
      );
    }
    assert.ok(minimumHandoffGapWU > 48,
      `every sampled seam-circle approach must hand off before rock ${rock.id}, got gap ${minimumHandoffGapWU}`);
  }
  const seamHandoff = {
    x: seamAnchor.x + (pathX / pathDistanceWU) * 90,
    z: seamAnchor.z + (pathZ / pathDistanceWU) * 90,
  };
  const harness = pocketApproachTwoPhasePage({
    targetPoint: target.targetPos,
    endTick: 18_023,
    tick: 5_836,
    initialPos: seamHandoff,
    initialSpeed: 0,
    initialRot: 0,
    simulateTrajectory: true,
    // A 160ms gravimetric pulse from the fake's 40 WU/s trimmed state travels about 7.7 WU
    // (40t + 0.5*105t^2). Keep the fake production-scale so it cannot teleport through the
    // 90-WU completion shell or the station collider.
    thrustStepWU: 8,
  });
  const receipt = await drivePublicToCeresPoint(harness.page, target, 18_023);
  assert.deepEqual(harness.startPos, seamHandoff,
    'the fake begins on the conservative arrival-facing edge of the Working Seam receipt circle');
  assert.ok(receipt.distanceWU <= 90);
  const stationHullGapWU = receipt.distanceWU - 16 - 26;
  assert.ok(stationHullGapWU > 30,
    `the production-scale public trajectory must stop clear of Belt Outpost, got gap ${stationHullGapWU}`);
  assert.equal(receipt.speed, 0.8);
  assert.equal(harness.sequence[0], 'turn');
  assert.equal(harness.sequence.includes('decelerate'), true);
  assert.equal(harness.sequence.at(-1), 'settle');
  assert.ok(harness.sequence.filter((action) => action !== 'settle').length < 220,
    'the full diagonal egress remains inside the unchanged steering budget');
  assert.ok(receipt.tick < 18_023 - 2_400,
    'the full egress completes before the next-leg fixed-tick reserve');
  assert.equal(harness.heldKeys.size, 0, 'the public restage releases every flight key before map selection');

  assert.throws(() => planCeresWorkingSeamEgress({
    sectorId: 'sector_helios_prime',
    player: { alive: true, pos: liveAcceptedArrival },
  }), /live accepted Belt Outpost arrival/);
  for (const alternateArrival of [
    // A legitimate west-ring arrival that reproduces the 26808d70 planner rejection class.
    { x: -11_598, z: 7_252 },
    // The previously accepted PQ-020 Belt Outpost arrival on the opposite public ring bearing.
    { x: -11_427.297119140625, z: 7_212.444274902344 },
  ]) {
    const alternate = planCeresWorkingSeamEgress({
      sectorId,
      player: { alive: true, pos: alternateArrival },
    }, { minRemainingTicks: 2_400 });
    assert.equal(alternate.targetPos, target.targetPos,
      'every public Belt Outpost arrival bearing must resolve to the same fixed corridor');
    assert.deepEqual(alternate.sourceArrivalPos, alternateArrival,
      'the variable public arrival remains bound as evidence');
    assert.equal(alternate.guaranteedPublicEgressWU, target.guaranteedPublicEgressWU);
    assert.equal(alternate.guaranteedThroughlineProgressWU, target.guaranteedThroughlineProgressWU);
  }
  assert.throws(() => planCeresWorkingSeamEgress({
    sectorId,
    player: { alive: false, pos: liveAcceptedArrival },
  }), /live accepted Belt Outpost arrival/);
  assert.equal(planCeresWorkingSeamEgress({
    sectorId,
    player: { alive: true, pos: liveAcceptedArrival },
  }).minRemainingTicks, 120,
  'optional post-Continue seam repeats retain the generic 120-tick route horizon');

  const routeSource = readFileSync(
    new URL('../scripts/lib/ceresFiveMinuteAcceptance.mjs', import.meta.url),
    'utf8',
  );
  const routeStart = routeSource.indexOf('export async function runCeresFiveMinutePublicRoute');
  const routeEnd = routeSource.indexOf('/**\n * Perform every known no-launch prerequisite', routeStart);
  const route = routeSource.slice(routeStart, routeEnd);
  assert.match(route,
    /await screenshot\([^;]+;[\s\S]*leg\.pocketId === 'ceres_working_seam'[\s\S]*planCeresWorkingSeamEgress\(arrival, \{[\s\S]*continueProof[\s\S]*CERES_WORKING_SEAM_EGRESS_MIN_REMAINING_TICKS[\s\S]*drivePublicToCeresPoint\(page, egressTarget, observerBounds\.endTick\)/,
    'seam arrival evidence must be recorded before the public departure restage');
  assert.match(route,
    /const legs = \[[\s\S]*PQ020_ROUTE_TARGETS\.beltOutpost[\s\S]*PQ020_ROUTE_TARGETS\.beacon, method: 'keyboard'[\s\S]*\];/,
    'the next normal leg after the seam return must publicly keyboard-select Throughline');
  assert.doesNotMatch(route, /player\.pos\s*=|state\.nav\.autopilot\s*=/,
    'the route may observe live state but cannot teleport or privately arm navigation');
  assert.match(route,
    /ceresRouteFailureSnapshot \|\|= await readPq020FailureSnapshot\(page\)[\s\S]*route-failure\.json/,
    'a failed route must preserve one bounded live snapshot before page cleanup');
  assert.match(routeSource, /failureSnapshot: runError\?\.ceresRouteFailureSnapshot \|\| null/,
    'the durable latest failure must carry the bounded route snapshot');
});

test('public pilot source uses menu/card and Playwright input while private shortcuts fail closed', () => {
  const validSources = actualPilotSources();
  assert.equal(validateCeresPilotSources(validSources).pass, true);
  const routeStart = validSources.routeSource.indexOf(
    'export async function runCeresFiveMinutePublicRoute',
  );
  const tutorialSetupIndex = validSources.routeSource.indexOf(
    'disableCeresTutorialThroughPublicSettings(page)', routeStart,
  );
  const sandboxIndex = validSources.routeSource.indexOf(
    "getByRole('button', { name: 'Sandbox', exact: true })", routeStart,
  );
  const setupAssertionIndex = validSources.routeSource.indexOf(
    'assertCeresSetup(setup, fixedSeed)', sandboxIndex,
  );
  assert.ok(routeStart >= 0 && tutorialSetupIndex > routeStart
    && sandboxIndex > tutorialSetupIndex && setupAssertionIndex > sandboxIndex,
  'public Settings must disable onboarding before Sandbox and live setup must verify the result');

  const toolkitStart = validSources.routeSource.indexOf(
    'async function exercisePublicPhysicsToolkit', routeStart,
  );
  const toolkitEnd = validSources.routeSource.indexOf(
    'async function waitForCeresBusEvent', toolkitStart,
  );
  const toolkitSource = validSources.routeSource.slice(toolkitStart, toolkitEnd);
  assert.ok(toolkitStart > routeStart && toolkitEnd > toolkitStart,
    'source audit must isolate the public physics toolkit route');
  assert.doesNotMatch(toolkitSource,
    /keyboard\.press\((?:'|")(?:Space|Digit4|Digit6)(?:'|")\)/,
    'fixed-tick flight actions cannot use zero-duration Playwright presses');
  assert.match(toolkitSource,
    /page\.mouse\.move[\s\S]*waitForCeresHostileMasslineAcquisition\(page, target[\s\S]*triggerCeresPublicFlightAction\(page, \{[\s\S]*key: 'Space'/,
    'the exact fresh rendered hostile receipt must precede the public Massline press');
  assert.match(toolkitSource,
    /const lockedSeed[\s\S]*const combatAttachedAction[\s\S]*prepareCeresPublicTetherFireSurface[\s\S]*runCeresPreRepulsorCombatLoop/,
    'combat must relatch the exact released hostile before fixed-tick fire begins');
  for (const marker of [
    "key: 'Space'",
    "trigger: 'release'",
    "key: 'Digit4'",
    "key: 'Digit6'",
  ]) {
    assert.ok(toolkitSource.includes(marker), `toolkit source must retain ${marker}`);
  }
  assert.match(validSources.routeSource,
    /'Space', 'Digit4', 'Digit6'/,
    'global public-input cleanup must release every toolkit flight key');

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

  for (const missing of [
    'Main Menu',
    'Settings',
    'Gameplay',
    'Tutorial hints',
    'Sandbox',
    'ceres_reference_pocket',
    'page.keyboard',
    'page.mouse',
  ]) {
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

test('route failures retain bounded transit and approach diagnostics in both failure artifacts', () => {
  const rows = Array.from({ length: 100 }, (_, seq) => ({ seq, detail: `row-${seq}` }));
  const projected = projectCeresRouteFailureDiagnostics({
    ceresToolkitTransitDiagnostic: {
      events: rows,
      invalidDistanceWU: NaN,
      detail: 'x'.repeat(3_000),
    },
    ceresPocketApproachDiagnostic: {
      decisionTail: rows,
    },
    ceresToolkitCombatDiagnostic: {
      cameraWindow: { startTick: 6_900, movementEndTick: 7_100, endTick: 7_200 },
      cameraImpacts: rows.map((row) => ({
        ...row,
        otherType: 'ship',
        otherWorldRecordId: `wr_npc_${row.seq}`,
      })),
    },
  });
  assert.deepEqual(Object.keys(projected), [
    'ceresToolkitTransitDiagnostic',
    'ceresPocketApproachDiagnostic',
    'ceresToolkitCombatDiagnostic',
  ]);
  assert.equal(projected.ceresToolkitTransitDiagnostic.events.length, 24);
  assert.equal(projected.ceresToolkitTransitDiagnostic.events[0].seq, 76,
    'bounded failure telemetry retains the most recent causal tail');
  assert.equal(projected.ceresPocketApproachDiagnostic.decisionTail.length, 24);
  assert.equal(projected.ceresToolkitTransitDiagnostic.invalidDistanceWU, null);
  assert.equal(projected.ceresToolkitTransitDiagnostic.detail.length, 2_048);
  assert.deepEqual(projected.ceresToolkitCombatDiagnostic.cameraWindow,
    { startTick: 6_900, movementEndTick: 7_100, endTick: 7_200 });
  assert.equal(projected.ceresToolkitCombatDiagnostic.cameraImpacts.length, 24);
  assert.equal(projected.ceresToolkitCombatDiagnostic.cameraImpacts[0].otherWorldRecordId,
    'wr_npc_76');

  const source = readFileSync(
    new URL('../scripts/lib/ceresFiveMinuteAcceptance.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source,
    /const routeDiagnostics = projectCeresRouteFailureDiagnostics\(error\);[\s\S]*?\.\.\.routeDiagnostics,/,
    'route-failure.json must carry both bounded diagnostic keys');
  assert.match(source,
    /const boundedRouteDiagnostics = runError\?\.ceresRouteDiagnostics[\s\S]*?\.\.\.boundedRouteDiagnostics,/,
    'latest-failure.json must retain the same bounded diagnostic projection');
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
  const anchorImpact = {
    seq: 1,
    event: 'physics:impact',
    tick: START_TICK + 7_180,
    aId: 1,
    bId: 9,
    aType: 'ship',
    aWorldRecordId: null,
    aAnchorSlotId: null,
    bType: 'asteroid',
    bWorldRecordId: null,
    bAnchorSlotId: 'ceres_throughline_collision_anchor',
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
    playerImpactCapture: {
      startTick: START_TICK,
      endTick: END_TICK,
      playerEntityIds: [1],
      impacts: [structuredClone(anchorImpact)],
    },
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
      impacts: [structuredClone(anchorImpact)],
      action: {
        schema: 'spaceface.ceresAnchorCollisionReceipt.v1',
        source: 'public-keyboard-fixed-tick',
        controlClock: 'fixed-tick',
        startTick: START_TICK + 7_170,
        startSeq: 1,
        completionTick: START_TICK + 7_180,
        pulses: 14,
        boostPulses: 1,
        selectedImpactSeq: anchorImpact.seq,
        selectedImpactTick: anchorImpact.tick,
      },
    },
    continueProof: {
      pass: true,
      source: 'public-save-continue',
      publicPath: ['F5', 'pause', 'reload', 'main_menu', 'continue'],
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
      preReloadPause: {
        source: 'public-pause-before-observer-stop',
        tick: START_TICK + 12_800,
        timeScale: 0,
        mode: 'flight',
      },
      postContinueObserverBridge: {
        source: 'observer-armed-before-public-continue',
        installationPhase: 'main-menu-before-public-continue',
        startTick: START_TICK,
        endTick: END_TICK,
        firstFlightSampleTick: START_TICK + 12_860,
        firstFlightPlayerId: 1,
        active: true,
      },
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
  const combatAttachmentId = 'att_player_701_2';
  const seedId = 9_001;
  const cameraPlan = planCeresThroughlineToolkitReposition();
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
      event: 'tether:attached',
      tick: START_TICK + 7_260,
      actorId: PLAYER_ENTITY_ID,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      attachmentId: combatAttachmentId,
    },
    {
      seq: 1_209,
      event: 'tether:latched',
      tick: START_TICK + 7_260,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      previewMatched: true,
    },
    weaponEvent({ seq: 1_210, event: 'combat:fire', tick: START_TICK + 7_300,
      weaponId: 'wpn_concussion_cannon_m', target }),
    weaponEvent({ seq: 1_211, event: 'combat:damage', tick: START_TICK + 7_310,
      weaponId: 'wpn_concussion_cannon_m', target }),
    weaponEvent({ seq: 1_212, event: 'projectile:hit', tick: START_TICK + 7_310,
      weaponId: 'wpn_concussion_cannon_m', target }),
    weaponEvent({ seq: 1_213, event: 'combat:fire', tick: START_TICK + 7_340,
      weaponId: 'wpn_gravity_marker_s', target }),
    weaponEvent({ seq: 1_214, event: 'combat:damage', tick: START_TICK + 7_350,
      weaponId: 'wpn_gravity_marker_s', target }),
    {
      seq: 1_215,
      event: 'combat:statusApplied',
      tick: START_TICK + 7_350,
      attackerId: PLAYER_ENTITY_ID,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      statusId: 'status_gravity_marked',
    },
    weaponEvent({ seq: 1_216, event: 'projectile:hit', tick: START_TICK + 7_350,
      weaponId: 'wpn_gravity_marker_s', target }),
    weaponEvent({ seq: 1_217, event: 'combat:fire', tick: START_TICK + 7_380,
      weaponId: 'wpn_momentum_sink_s', target }),
    weaponEvent({ seq: 1_218, event: 'combat:damage', tick: START_TICK + 7_390,
      weaponId: 'wpn_momentum_sink_s', target }),
    {
      seq: 1_219,
      event: 'combat:statusApplied',
      tick: START_TICK + 7_390,
      attackerId: PLAYER_ENTITY_ID,
      targetId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      statusId: 'status_momentum_sink',
    },
    weaponEvent({ seq: 1_220, event: 'projectile:hit', tick: START_TICK + 7_390,
      weaponId: 'wpn_momentum_sink_s', target }),
    {
      seq: 1_221,
      event: 'entity:killed',
      tick: START_TICK + 7_420,
      entityId: target.entityId,
      targetWorldRecordId: target.worldRecordId,
      killerId: PLAYER_ENTITY_ID,
    },
    {
      seq: 1_222,
      event: 'fields:deployed',
      tick: START_TICK + 7_430,
      fieldId: 'field_repulsor_1_1',
      kind: 'repulsor',
      sourceId: 9_002,
      sourceOwnerId: PLAYER_ENTITY_ID,
    },
  ];
  const receipt = {
    schema: 'spaceface.ceresFiveMinuteToolkitReceipt.v1',
    inputSource: 'public-keyboard-mouse',
    startTick: START_TICK + 7_200,
    endTick: START_TICK + 8_000,
    playerEntityId: PLAYER_ENTITY_ID,
    cameraReposition: {
      pass: true,
      source: cameraPlan.source,
      reason: cameraPlan.reason,
      startTick: START_TICK + 7_180,
      movementEndTick: START_TICK + 7_199,
      endTick: START_TICK + 7_200,
      playerEntityId: PLAYER_ENTITY_ID,
      anchorEntityId: 9,
      anchorImpactSeq: 1,
      anchorImpactTick: START_TICK + 7_180,
      boundHostiles: TOOLKIT_HOSTILES.map(({ entityId, worldRecordId }) => ({
        entityId,
        worldRecordId,
      })),
      impactCaptureStartSeq: 1_190,
      impactCapture: {
        startTick: START_TICK + 7_180,
        endTick: START_TICK + 7_200,
        startSeq: 1_190,
        endSeq: 1_190,
      },
      waypoints: structuredClone(cameraPlan.waypoints),
      receipts: [
        {
          tick: START_TICK + 7_190,
          distanceWU: 21.5,
          speed: 0.7,
          playerAlive: true,
          mode: 'flight',
        },
        {
          tick: START_TICK + 7_199,
          distanceWU: 22.25,
          speed: 0.6,
          playerAlive: true,
          mode: 'flight',
        },
      ],
      impacts: [],
    },
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
  receipt.transitHandoff = toolkitTransitHandoffFixture(receipt);
  return receipt;
}

function toolkitTransitHandoffFixture(toolkitReceipt) {
  const waypoint = planCeresToolkitTransitHandoff();
  const startPos = planCeresThroughlineToolkitReposition().waypoints.at(-1).targetPos;
  const cathedral = sectorLocalToGlobalForSector(
    CERES_ACTIVITY_POCKETS_BY_ID.ceres_cathedral_grave.activityAnchor.localPos,
    CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
  );
  const survivingHostile = TOOLKIT_HOSTILES.find((row) => (
    !toolkitReceipt.destroyedRecordIds.includes(row.worldRecordId)
  ));
  const survivor = (distanceWU) => ({
    entityId: survivingHostile.entityId,
    worldRecordId: survivingHostile.worldRecordId,
    observedWorldRecordId: survivingHostile.worldRecordId,
    alive: true,
    distanceWU,
  });
  const player = (pos, speed = 0.5) => ({
    entityId: PLAYER_ENTITY_ID,
    alive: true,
    hull: 250,
    pos: { ...pos },
    speed,
  });
  const input = {
    moveX: 0,
    moveZ: 0,
    turnIntent: 0,
    boost: false,
    brake: false,
    fire: false,
    tetherFire: false,
    tetherCut: false,
    deployMassSeed: false,
    deployRepulsor: false,
    neutral: true,
  };
  const snapshot = ({ tick, pos, start = false }) => ({
    tick,
    nextEventSeq: start ? 1_300 : 1_305,
    simTime: tick / TICK_RATE_HZ,
    player: player(pos),
    input: { ...input },
    tether: start
      ? { active: true, targetId: TOOLKIT_HOSTILES[0].entityId, attachmentId: 'att_player_701_2' }
      : { active: false, targetId: null, attachmentId: null },
    massSeed: start
      ? { active: true, seedId: 9_001, ownerId: PLAYER_ENTITY_ID, phase: 'active', expireAt: 170 }
      : { active: false, seedId: null, ownerId: null, phase: 'idle', expireAt: null },
    repulsorFields: start
      ? [{ fieldId: 'field_repulsor_1_1', emitterId: 9_002, expireAt: 150 }]
      : [],
    survivors: [survivor(start ? 92 : 2_900)],
    handoffDistanceWU: Math.hypot(waypoint.targetPos.x - pos.x, waypoint.targetPos.z - pos.z),
    cathedralDistanceWU: Math.hypot(cathedral.x - pos.x, cathedral.z - pos.z),
    throughlineZoneClearanceWU: start
      ? Math.hypot(
          pos.x - AMBUSH_ZONE_GLOBAL.x,
          pos.z - AMBUSH_ZONE_GLOBAL.z,
        ) - Number(ZONE_CERES_THROUGHLINE.radius)
      : waypoint.guaranteedThroughlineClearanceWU + waypoint.arrivalRadiusWU,
  });
  const startTick = toolkitReceipt.endTick + 1;
  const endTick = END_TICK - CERES_TOOLKIT_ROUTE_RESERVE_TICKS - 300;
  const deadlineTick = END_TICK - CERES_TOOLKIT_ROUTE_RESERVE_TICKS;
  const firstApproachCompletionTick = startTick + 1_000;
  const transientClearTick = endTick - 3;
  const finalApproachCompletionTick = endTick - 2;
  const approach = ({ approachStartTick, completionTick, pulses }) => ({
    schema: 'spaceface.ceresPublicPointApproachReceipt.v1',
    pass: true,
    source: 'public-keyboard-fixed-tick',
    targetId: waypoint.targetId,
    targetName: waypoint.targetName,
    targetPos: { ...waypoint.targetPos },
    arrivalRadiusWU: waypoint.arrivalRadiusWU,
    allowBoost: false,
    controlClock: 'fixed-tick',
    deadlineTick,
    terminalTick: deadlineTick,
    minRemainingTicks: waypoint.minRemainingTicks,
    startTick: approachStartTick,
    completionTick,
    tick: completionTick,
    pulses,
    distanceWU: 40,
    speed: 0.5,
    headingError: 0,
    radialSpeed: -0.5,
    playerPos: { x: waypoint.targetPos.x + 40, z: waypoint.targetPos.z },
    playerVel: { x: 0.5, z: 0 },
    input: { moveZ: 0, turnIntent: 0, brake: false },
    playerAlive: true,
    mode: 'flight',
  });
  return {
    schema: 'spaceface.ceresToolkitTransitHandoff.v1',
    pass: true,
    source: 'public-keyboard-read-only-observation',
    startTick,
    endTick,
    deadlineTick,
    playerEntityId: PLAYER_ENTITY_ID,
    massSeedId: 9_001,
    repulsorFieldIds: ['field_repulsor_1_1'],
    survivingHostiles: [{
      entityId: survivingHostile.entityId,
      worldRecordId: survivingHostile.worldRecordId,
    }],
    waypoint: structuredClone(waypoint),
    tetherCutAction: {
      source: 'public-keyboard-fixed-tick',
      key: 'Space',
      trigger: 'release',
      expectedEvent: 'tether:broken',
      pressTick: startTick,
      heldTick: startTick + 1,
      keyUpTick: startTick + 1,
      eventTick: startTick + 2,
      minEventSeq: 1_300,
      eventSeq: 1_300,
      neutralTick: startTick + 3,
      event: {
        seq: 1_300,
        event: 'tether:broken',
        tick: startTick + 2,
        actorId: PLAYER_ENTITY_ID,
        targetId: TOOLKIT_HOSTILES[0].entityId,
        attachmentId: 'att_player_701_2',
        reason: 'tether_cut',
      },
    },
    encounterResolution: {
      seq: 1_304,
      event: 'encounter:resolved',
      tick: endTick - 4,
      encounterId: 'ceres:activity:throughline-ambush',
      outcome: 'escaped',
    },
    approaches: [
      approach({
        approachStartTick: startTick + 3,
        completionTick: firstApproachCompletionTick,
        pulses: 160,
      }),
      approach({
        approachStartTick: transientClearTick,
        completionTick: finalApproachCompletionTick,
        pulses: 0,
      }),
    ],
    transientClearTick,
    start: snapshot({ tick: startTick, pos: startPos, start: true }),
    end: snapshot({ tick: endTick, pos: waypoint.targetPos }),
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
    playerId: 1,
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

function fixedTickToolkitActionPage({
  emitCombatFireOwnerId = null,
  deferPressEventUntilObserver = false,
} = {}) {
  const heldKeys = new Set();
  const log = [];
  let mouseHeld = false;
  const state = {
    tick: 700,
    simTime: 700 / 60,
    playerId: PLAYER_ENTITY_ID,
    player: {},
    input: { actions: {} },
  };
  const trace = {
    nextEventSeq: 80,
    events: [{
      seq: 79,
      event: 'tether:attached',
      tick: 700,
      actorId: PLAYER_ENTITY_ID,
      targetId: TOOLKIT_HOSTILES[0].entityId,
    }],
  };
  const runInPage = (callback, argument) => {
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const previousWindow = globalThis.window;
    globalThis.window = {
      SF: { state },
      __SF_CERES_FIVE_MINUTE_TRACE__: trace,
    };
    try {
      return callback(argument);
    } finally {
      if (hadWindow) globalThis.window = previousWindow;
      else delete globalThis.window;
    }
  };
  const page = {
    keyboard: {
      async down(key) {
        heldKeys.add(key);
        log.push({ kind: 'down', key, tick: state.tick });
      },
      async up(key) {
        heldKeys.delete(key);
        log.push({ kind: 'up', key, tick: state.tick });
      },
    },
    mouse: {
      async move(x, y) {
        log.push({ kind: 'mouse-move', x, y, tick: state.tick });
      },
      async down() {
        mouseHeld = true;
        log.push({ kind: 'mouse-down', tick: state.tick });
      },
      async up() {
        mouseHeld = false;
        log.push({ kind: 'mouse-up', tick: state.tick });
      },
    },
    async evaluate(callback, argument) {
      return runInPage(callback, argument);
    },
    async waitForFunction(callback, argument) {
      const eventCriteria = argument?.criteria ?? argument;
      if (eventCriteria?.event) {
        if (eventCriteria.event === 'never:arrives') throw new Error('fake event timeout');
        if (!runInPage(callback, argument)) {
          state.tick += 1;
          state.simTime = state.tick / 60;
          const event = Object.fromEntries(Object.entries(eventCriteria)
            .filter(([key]) => key !== 'minTick' && key !== 'minSeq'));
          event.seq = trace.nextEventSeq;
          trace.nextEventSeq += 1;
          event.tick = state.tick;
          trace.events.push(event);
          log.push({
            kind: 'event',
            event: event.event,
            tick: state.tick,
            held: [...heldKeys].sort(),
          });
        }
        assert.equal(runInPage(callback, argument), true,
          'the exact post-cursor event must satisfy the condition');
        return;
      }
      assert.ok(Number.isSafeInteger(argument?.tick)
        && Number.isSafeInteger(argument?.deltaTicks));
      state.tick = Math.max(state.tick, argument.tick + argument.deltaTicks);
      state.simTime = state.tick / 60;
      let pressEvent = null;
      if (!deferPressEventUntilObserver && heldKeys.has('Space')
          && !trace.events.some((event) => event.seq >= 80 && event.event === 'tether:attached')) {
        pressEvent = {
          event: 'tether:attached',
          actorId: PLAYER_ENTITY_ID,
          targetId: TOOLKIT_HOSTILES[0].entityId,
        };
      } else if (!deferPressEventUntilObserver && heldKeys.has('Digit4')) {
        pressEvent = { event: 'massSeed:deployed', ownerId: PLAYER_ENTITY_ID };
      } else if (!deferPressEventUntilObserver && heldKeys.has('Digit6')) {
        pressEvent = {
          event: 'fields:deployed',
          kind: 'repulsor',
          sourceOwnerId: PLAYER_ENTITY_ID,
        };
      }
      if (pressEvent) {
        pressEvent.seq = trace.nextEventSeq++;
        pressEvent.tick = state.tick;
        trace.events.push(pressEvent);
        log.push({
          kind: 'event',
          event: pressEvent.event,
          tick: state.tick,
          held: [...heldKeys].sort(),
        });
      }
      if (mouseHeld && emitCombatFireOwnerId != null
          && !trace.events.some((event) => event.event === 'combat:fire'
            && event.ownerId === emitCombatFireOwnerId)) {
        trace.events.push({
          seq: trace.nextEventSeq++,
          event: 'combat:fire',
          tick: state.tick,
          ownerId: emitCombatFireOwnerId,
          weaponId: 'wpn_concussion_cannon_m',
        });
      }
      log.push({
        kind: 'fixed-tick',
        tick: state.tick,
        held: [...heldKeys].sort(),
        mouseHeld,
      });
      assert.equal(runInPage(callback, argument), true);
    },
  };
  return {
    page,
    heldKeys,
    log,
    get mouseHeld() { return mouseHeld; },
  };
}

function delayedToolkitObserverPage({ observerDelayTicks = 35 } = {}) {
  const heldKeys = new Set();
  const log = [];
  const target = {
    id: TOOLKIT_HOSTILES[0].entityId,
    type: 'ship',
    alive: true,
    hull: 40,
    data: {
      worldRecordId: TOOLKIT_HOSTILES[0].worldRecordId,
      ai: { zoneId: 'zone_ceres_ambush', squadId: 'zone_ceres_ambush' },
    },
  };
  const player = { id: PLAYER_ENTITY_ID, type: 'ship', alive: true, data: {} };
  const state = {
    tick: 700,
    simTime: 700 / TICK_RATE_HZ,
    playerId: player.id,
    player: {
      tether: { active: false, targetId: null, attachmentId: null },
    },
    entities: new Map([[player.id, player], [target.id, target]]),
    entityList: [player, target],
    combat: { attachments: { byId: {} } },
    input: { actions: {} },
  };
  const trace = { nextEventSeq: 80, events: [] };
  let firstAttachTick = null;
  let mirrorActivationTick = null;
  let pendingManualCut = false;
  let scheduledTargetLossTick = null;

  const runInPage = (callback, argument) => {
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const previousWindow = globalThis.window;
    globalThis.window = {
      SF: { state },
      __SF_CERES_FIVE_MINUTE_TRACE__: trace,
    };
    try {
      return callback(argument);
    } finally {
      if (hadWindow) globalThis.window = previousWindow;
      else delete globalThis.window;
    }
  };
  const emit = (event, payload) => {
    trace.events.push({ seq: trace.nextEventSeq++, event, tick: state.tick, ...payload });
  };
  const step = () => {
    state.tick += 1;
    state.simTime = state.tick / TICK_RATE_HZ;
    if (scheduledTargetLossTick != null && state.tick >= scheduledTargetLossTick
        && target.alive === true) {
      target.alive = false;
      const attachment = state.combat.attachments.byId.att_delayed_1;
      if (attachment) {
        attachment.state = 'broken';
        attachment.breakReason = 'target_lost';
      }
      state.player.tether = { active: false, targetId: null, attachmentId: null };
      emit('tether:broken', {
        actorId: player.id,
        targetId: target.id,
        attachmentId: 'att_delayed_1',
        reason: 'target_lost',
      });
      scheduledTargetLossTick = null;
    } else if (pendingManualCut) {
      const payload = {
        actorId: player.id,
        targetId: target.id,
        attachmentId: 'att_delayed_1',
        reason: 'tether_cut',
      };
      emit('tether:broken', payload);
      emit('tether:cut', payload);
      emit('tether:released', payload);
      state.player.tether = { active: false, targetId: null, attachmentId: null };
      state.combat.attachments.byId.att_delayed_1.state = 'broken';
      pendingManualCut = false;
    }
    if (mirrorActivationTick != null && state.tick >= mirrorActivationTick
        && target.alive === true
        && state.combat.attachments.byId.att_delayed_1?.state === 'active') {
      state.player.tether = {
        active: true,
        targetId: target.id,
        attachmentId: 'att_delayed_1',
      };
      mirrorActivationTick = null;
    }
    if (heldKeys.has('Space') && firstAttachTick == null) {
      firstAttachTick = state.tick;
      state.combat.attachments.byId.att_delayed_1 = {
        id: 'att_delayed_1', state: 'active', ownerId: player.id, targetId: target.id,
      };
      emit('tether:attached', {
        actorId: player.id,
        targetId: target.id,
        attachmentId: 'att_delayed_1',
      });
      emit('tether:latched', { targetId: target.id, previewMatched: true });
      mirrorActivationTick = state.tick + 1;
    }
    log.push({
      kind: 'fixed-tick',
      tick: state.tick,
      held: [...heldKeys].sort(),
      mirrorActive: state.player.tether.active === true,
      attachmentState: state.combat.attachments.byId.att_delayed_1?.state || null,
      targetAlive: target.alive === true,
    });
  };

  const page = {
    keyboard: {
      async down(key) {
        heldKeys.add(key);
        log.push({ kind: 'down', key, tick: state.tick });
      },
      async up(key) {
        heldKeys.delete(key);
        if (key === 'Space' && state.player.tether.active === true
            && state.tick > firstAttachTick) pendingManualCut = true;
        log.push({ kind: 'up', key, tick: state.tick });
      },
    },
    async evaluate(callback, argument) {
      return runInPage(callback, argument);
    },
    async waitForFunction(callback, argument) {
      if (argument?.criteria?.event) {
        let guard = 0;
        while (!runInPage(callback, argument) && guard < 100) {
          step();
          guard += 1;
        }
        if (!runInPage(callback, argument)) throw new Error('fake event timeout');
        if (argument.criteria.event === 'tether:attached') {
          for (let index = 0; index < observerDelayTicks; index += 1) step();
        }
        return;
      }
      if (argument?.targetWorldRecordId && Number.isSafeInteger(argument?.latchedSeq)) {
        let guard = 0;
        let accepted = runInPage(callback, argument);
        log.push({ kind: 'authority-poll', tick: state.tick, accepted });
        while (!accepted && guard < 10) {
          step();
          guard += 1;
          accepted = runInPage(callback, argument);
          log.push({ kind: 'authority-poll', tick: state.tick, accepted });
        }
        if (!accepted) throw new Error('fake tether authority timeout');
        return;
      }
      assert.ok(Number.isSafeInteger(argument?.tick)
        && Number.isSafeInteger(argument?.deltaTicks));
      while (state.tick < argument.tick + argument.deltaTicks) step();
      assert.equal(runInPage(callback, argument), true);
    },
  };
  return {
    page,
    heldKeys,
    log,
    state,
    target,
    trace,
    advanceFixedTick: step,
    scheduleTargetLossAfterTicks(deltaTicks = 1) {
      assert.ok(Number.isSafeInteger(deltaTicks) && deltaTicks >= 1);
      scheduledTargetLossTick = state.tick + deltaTicks;
      return scheduledTargetLossTick;
    },
  };
}

function hostileMasslineAcquisitionPage({
  stateTick = 901,
  publishedTick = 901,
  selectedTargetId = TOOLKIT_HOSTILES[0].entityId,
  worldRecordId = TOOLKIT_HOSTILES[0].worldRecordId,
  status = 'ready',
  context = 'precision-pick',
  autoAimTargetId = null,
} = {}) {
  const state = {
    tick: 900,
    simTime: 15,
    input: {
      aimIntentActive: false,
      pointerScreen: { active: false },
      autoAim: null,
    },
    entities: new Map([[TOOLKIT_HOSTILES[0].entityId, {
      id: TOOLKIT_HOSTILES[0].entityId,
      type: 'ship',
      alive: true,
      data: {
        worldRecordId,
        ai: { zoneId: 'zone_ceres_ambush', squadId: 'zone_ceres_ambush' },
      },
    }]]),
    masslineAcquisition: null,
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
    page: {
      async waitForFunction(callback, argument) {
        assert.equal(runInPage(callback, argument), false,
          'the pre-move/stale frame cannot satisfy acquisition authority');
        state.tick = stateTick;
        state.simTime = state.tick / 60;
        state.input.aimIntentActive = true;
        state.input.pointerScreen.active = true;
        state.input.autoAim = autoAimTargetId == null ? null : { targetId: autoAimTargetId };
        state.masslineAcquisition = {
          schemaVersion: 1,
          id: 'massline-acquisition:44',
          publishedTick,
          validUntil: state.simTime + 0.5,
          selected: {
            targetId: selectedTargetId,
            status,
            context,
          },
        };
        if (!runInPage(callback, argument)) {
          throw new Error('fake acquisition condition remained false');
        }
      },
      async evaluate(callback, argument) {
        return runInPage(callback, argument);
      },
    },
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
  initialPos = null,
  initialSpeed = 78,
  initialRot = -0.7,
  turnConverges = true,
  simulateTrajectory = false,
  thrustStepWU = 60,
  tickPerPulse = 10,
}) {
  const heldKeys = new Set();
  const sequence = [];
  const settleStartDistances = [];
  const player = {
    id: 1,
    pos: initialPos
      ? { x: initialPos.x, z: initialPos.z }
      : { x: targetPoint.x - initialDistanceWU, z: targetPoint.z },
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
    heldKeys,
    startPos: { ...player.pos },
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
        player.vel.z = 0;
        assert.equal(runInPage(callback, argument), true);
      },
      async waitForTimeout(durationMs) {
        state.tick += tickPerPulse;
        if (heldKeys.has('KeyA') || heldKeys.has('KeyD')) {
          assert.equal(durationMs, 80);
          sequence.push('turn');
          if (turnConverges) {
            player.rot = simulateTrajectory
              ? Math.atan2(targetPoint.z - player.pos.z, targetPoint.x - player.pos.x)
              : 0;
          }
        } else if (heldKeys.has('KeyS')) {
          assert.equal(durationMs, 100);
          sequence.push('decelerate');
          if (!simulateTrajectory) player.pos.x = targetPoint.x - 132;
          player.vel.x = 40;
          player.vel.z = 0;
        } else if (heldKeys.has('KeyW')) {
          assert.equal(durationMs, 160);
          sequence.push('thrust');
          if (simulateTrajectory) {
            const dx = targetPoint.x - player.pos.x;
            const dz = targetPoint.z - player.pos.z;
            const distance = Math.hypot(dx, dz);
            const step = Math.min(thrustStepWU, Math.max(0, distance));
            player.pos.x += distance > 0 ? (dx / distance) * step : 0;
            player.pos.z += distance > 0 ? (dz / distance) * step : 0;
            player.vel.x = distance > 0 && step > 0 ? (dx / distance) * 78 : 0;
            player.vel.z = distance > 0 && step > 0 ? (dz / distance) * 78 : 0;
            player.rot = Math.atan2(dz, dx);
          } else {
            player.pos.x = targetPoint.x - 80;
            player.vel.x = 78;
            player.rot = 0;
          }
        } else assert.fail('two-phase approach emitted an unexpected control pulse');
      },
    },
  };
  return harness;
}

function toolkitTransitHandoffPage(toolkitReceipt) {
  const waypoint = planCeresToolkitTransitHandoff();
  const startPos = planCeresThroughlineToolkitReposition().waypoints.at(-1).targetPos;
  const targetDirection = Math.atan2(
    waypoint.targetPos.z - startPos.z,
    waypoint.targetPos.x - startPos.x,
  );
  const heldKeys = new Set();
  const player = {
    id: PLAYER_ENTITY_ID,
    type: 'ship',
    alive: true,
    hull: 260,
    radius: 16,
    pos: { ...startPos },
    vel: { x: 0, z: 0 },
    rot: targetDirection,
    data: {},
  };
  const survivor = {
    id: TOOLKIT_HOSTILES[1].entityId,
    type: 'ship',
    alive: true,
    hull: 60,
    pos: { x: startPos.x + 70, z: startPos.z + 15 },
    vel: { x: 0, z: 0 },
    data: { worldRecordId: TOOLKIT_HOSTILES[1].worldRecordId },
  };
  const entities = new Map([
    [player.id, player],
    [survivor.id, survivor],
  ]);
  const state = {
    tick: toolkitReceipt.endTick,
    simTime: toolkitReceipt.endTick / TICK_RATE_HZ,
    mode: 'flight',
    playerId: player.id,
    entities,
    entityList: [...entities.values()],
    player: {
      tether: {
        active: true,
        targetId: TOOLKIT_HOSTILES[0].entityId,
        attachmentId: 'att_player_701_2',
      },
    },
    input: {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      boost: false,
      brake: false,
      fire: false,
      actions: {},
    },
    massSeed: {
      schemaVersion: 1,
      phase: 'active',
      seedId: 9_001,
      ownerId: player.id,
      expireAt: (toolkitReceipt.endTick + 900) / TICK_RATE_HZ,
    },
    fields: {
      schemaVersion: 1,
      deployed: {
        field_repulsor_1_1: {
          fieldId: 'field_repulsor_1_1',
          kind: 'repulsor',
          // Deliberately absent from entities: exact fieldId authority must not turn a missing
          // emitter lookup into a false "already inactive" result.
          emitterId: 9_002,
          expireAt: (toolkitReceipt.endTick + 420) / TICK_RATE_HZ,
        },
      },
      active: [{ id: 'field_repulsor_1_1', kind: 'repulsor' }],
    },
  };
  const trace = {
    nextEventSeq: Math.max(...toolkitReceipt.events.map((event) => event.seq)) + 1,
    events: toolkitReceipt.events.map((event) => ({ ...event })),
  };
  const seedExpireTick = toolkitReceipt.endTick + 900;
  const repulsorExpireTick = toolkitReceipt.endTick + 420;
  let pendingTetherCut = null;
  let encounterResolved = false;
  let wallWaits = 0;
  let fixedTickWaits = 0;

  const runInPage = (callback, argument) => {
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const previousWindow = globalThis.window;
    globalThis.window = {
      SF: { state },
      __SF_CERES_FIVE_MINUTE_TRACE__: trace,
    };
    try {
      return callback(argument);
    } finally {
      if (hadWindow) globalThis.window = previousWindow;
      else delete globalThis.window;
    }
  };
  const emit = (event, payload) => {
    trace.events.push({
      seq: trace.nextEventSeq,
      event,
      tick: state.tick,
      ...payload,
    });
    trace.nextEventSeq += 1;
  };
  const step = () => {
    state.tick += 1;
    state.simTime = state.tick / TICK_RATE_HZ;
    if (pendingTetherCut && state.tick > pendingTetherCut.afterTick) {
      const payload = {
        actorId: player.id,
        targetId: pendingTetherCut.targetId,
        attachmentId: pendingTetherCut.attachmentId,
        reason: 'tether_cut',
      };
      emit('tether:broken', payload);
      emit('tether:cut', {
        targetId: pendingTetherCut.targetId,
        attachmentId: pendingTetherCut.attachmentId,
      });
      emit('tether:released', {
        targetId: pendingTetherCut.targetId,
        attachmentId: pendingTetherCut.attachmentId,
      });
      state.player.tether = { active: false, targetId: null, attachmentId: null };
      pendingTetherCut = null;
    }
    if (state.tick >= repulsorExpireTick) {
      delete state.fields.deployed.field_repulsor_1_1;
      state.fields.active = [];
    }
    if (state.tick >= seedExpireTick) {
      state.massSeed = {
        schemaVersion: 1,
        phase: 'idle',
        seedId: null,
        ownerId: null,
        expireAt: 0,
      };
    }

    const yaw = (heldKeys.has('KeyD') ? 1 : 0) - (heldKeys.has('KeyA') ? 1 : 0);
    player.rot += yaw * 0.04;
    const speedBefore = Math.hypot(player.vel.x, player.vel.z);
    let speed = speedBefore;
    if (heldKeys.has('KeyS') || heldKeys.has('Digit0')) {
      speed = Math.max(0, speed - 6);
      if (speedBefore > 0) {
        player.vel.x *= speed / speedBefore;
        player.vel.z *= speed / speedBefore;
      }
    } else if (heldKeys.has('KeyW')) {
      player.vel.x += Math.cos(player.rot) * 4;
      player.vel.z += Math.sin(player.rot) * 4;
      speed = Math.hypot(player.vel.x, player.vel.z);
      if (speed > 168) {
        player.vel.x *= 168 / speed;
        player.vel.z *= 168 / speed;
      }
    }
    player.pos.x += player.vel.x / TICK_RATE_HZ;
    player.pos.z += player.vel.z / TICK_RATE_HZ;
    if (!encounterResolved && Math.hypot(
      survivor.pos.x - player.pos.x,
      survivor.pos.z - player.pos.z,
    ) >= CERES_TOOLKIT_TRANSIT_ESCAPE_RADIUS_WU) {
      emit('encounter:resolved', {
        encounterId: 'ceres:activity:throughline-ambush',
        outcome: 'escaped',
      });
      encounterResolved = true;
    }
    state.input.moveX = 0;
    state.input.moveZ = heldKeys.has('KeyW') ? 1 : heldKeys.has('KeyS') ? -1 : 0;
    state.input.turnIntent = yaw;
    state.input.boost = heldKeys.has('Shift');
    state.input.brake = heldKeys.has('Digit0') || heldKeys.has('KeyS');
    state.input.fire = false;
    state.input.actions = {
      tetherFire: false,
      tetherCut: false,
      deployMassSeed: false,
      deployRepulsor: false,
    };
  };

  const page = {
    isClosed() { return false; },
    locator(selector) {
      assert.equal(selector, '#gl-canvas');
      return {
        async waitFor({ state: expectedState }) { assert.equal(expectedState, 'visible'); },
        async focus() {},
      };
    },
    keyboard: {
      async down(key) { heldKeys.add(key); },
      async up(key) {
        const wasHeld = heldKeys.delete(key);
        if (key === 'Space' && wasHeld && state.player.tether.active) {
          pendingTetherCut = {
            afterTick: state.tick,
            targetId: state.player.tether.targetId,
            attachmentId: state.player.tether.attachmentId,
          };
        }
      },
    },
    mouse: {
      async up() {},
    },
    async evaluate(callback, argument) {
      return runInPage(callback, argument);
    },
    async waitForFunction(callback, argument) {
      if (Number.isSafeInteger(argument?.deltaTicks)) fixedTickWaits += 1;
      for (let poll = 0; poll < 8_000; poll += 1) {
        if (runInPage(callback, argument)) return true;
        step();
      }
      throw new Error('fake public transit wait exceeded its deterministic poll budget');
    },
    async waitForTimeout() {
      wallWaits += 1;
      throw new Error('fixed-tick transit attempted a wall-time steering pulse');
    },
  };
  return {
    page,
    heldKeys,
    events: trace.events,
    get wallWaits() { return wallWaits; },
    get fixedTickWaits() { return fixedTickWaits; },
  };
}

async function runSeed47ToolkitCameraReposition() {
  const dt = 1 / 60;
  const previousFieldFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  let runtime = null;
  let physicsSystem = null;
  try {
    runtime = createAuthoritativeRuntime({
      profileId: 'production',
      nodeSafeOnly: true,
      seed: 47,
    });
    const { state, bus } = runtime;
  state.mode = 'flight';
  state.aceMemory ||= {};
  state.aceMemory.ace_rust_lord_orro = {
    id: 'ace_rust_lord_orro',
    fled: true,
  };
  const player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
    isPlayer: true,
    player: state.player,
    pos: { x: -9_295.344, z: 7_266.908 },
    // The captured arrival omitted hull rotation. Its measured velocity is authoritative, so the
    // production fixture reconstructs the terminal heading from atan2(velocity.z, velocity.x).
    rot: 0.1080208501048273,
    fittings: [],
  }));
  player.vel = { x: 5.204785346984863, z: 0.5644223690032959 };
  player.angVel = 0;
  player.collides = true;
  state.playerId = player.id;
  runtime.getSystem('world').enterSector('sector_ceres_belt', {
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  const startTick = 4_481;
  // No generic director row participates in this focused production fixture. The exact authored
  // Throughline encounter is seeded after its durable two-ship cohort exists below.
  state.encounterDirector.pending = [];
  const trafficEntities = [];
  for (const traffic of [
    {
      worldRecordId: 'wr_convoy_cb57b215',
      pos: { x: -9030.272705078125, z: 7187.342346191406 },
      radius: 14,
    },
    {
      worldRecordId: 'wr_convoy_743b2d60',
      pos: { x: -8937.385009765625, z: 7156.213134765625 },
      radius: 18,
    },
  ]) {
    const existing = state.entityList.find((entity) => (
      entity?.alive !== false && entity.data?.worldRecordId === traffic.worldRecordId
    ));
    assert.ok(existing,
      `production world must materialize captured traffic ${traffic.worldRecordId}`);
    existing.pos = { ...traffic.pos };
    existing.vel = { x: 0, z: 0 };
    existing.angVel = 0;
    existing.radius = traffic.radius;
    existing.collides = true;
    trafficEntities.push(existing);
  }
  const makeThroughlineHostile = (defId, worldRecordId, pos) => {
    const spec = makeEnemySpawnSpec(
      defId,
      3,
      pos,
      { startedTick: startTick, zoneId: 'zone_ceres_ambush' },
    );
    spec.vel = { x: 0, z: 0 };
    spec.data.worldRecordId = worldRecordId;
    Object.assign(spec.data.ai, {
      squadId: 'zone_ceres_ambush',
      zoneId: 'zone_ceres_ambush',
      ceresActivityAmbushPhase: 'offer',
      passive: true,
      roe: 'hold_fire',
      spawnContext: 'zone_hostile',
    });
    return runtime.spawn(spec);
  };
  const destroyed = makeThroughlineHostile(
    'reaver_pirate',
    TOOLKIT_HOSTILES[0].worldRecordId,
    { x: -8972.711669921875, z: 7237.062744140625 },
  );
  const survivor = makeThroughlineHostile(
    'wasp_swarmer',
    TOOLKIT_HOSTILES[1].worldRecordId,
    { x: -8908, z: 7267 },
  );
  let tick = startTick;
  state.tick = startTick;
  state.simTime = startTick * dt;
  physicsSystem = runtime.getSystem('physics');
  // The authoritative runtime binds production feature maps only while stepping. Start SG-02 in
  // that bound frame, await its async owner, then publish readiness in a second bound frame.
  runtime.step(dt);
  if (physicsSystem._sg02Init) await physicsSystem._sg02Init;
  runtime.step(dt);
  const ready = state.physicsRuntime?.diagnostics?.sg02Ready === true;
  assert.equal(ready, true, 'toolkit reposition fixture requires production Rapier authority');
  player.pos = { x: -9_295.344, z: 7_266.908 };
  player.vel = { x: 5.204785346984863, z: 0.5644223690032959 };
  player.rot = 0.1080208501048273;
  player.angVel = 0;
  state.tick = startTick;
  state.simTime = startTick * dt;
  state.nav.autopilot = { active: false, status: 'arrived' };
  state.input.actions = { autopursuit: false, brake: false };
  state.settings.gameplay.tutorialHints = false;
  state.onboarding ||= {};
  state.onboarding.active = false;
  state.onboarding.finished = true;
  state.aceMemory.ace_rust_lord_orro = {
    id: 'ace_rust_lord_orro',
    fled: true,
  };

  const directorSystem = runtime.getSystem('encounterDirector');
  const dir = state.encounterDirector;
  // Continuous sector entry also schedules unrelated culture beats. Isolate this production
  // route to the exact authored encounter before asking the real pacing owner to fire it.
  dir.pending = [];
  dir.live = {};
  assert.equal(directorSystem._seedCeresActivityAmbush('sector_ceres_belt'), true,
    'production fixture must adopt the exact durable Throughline cohort before reposition');
  assert.equal(directorSystem._queueCeresActivityAmbush(), true,
    'production fixture must queue the authored Throughline encounter before reposition');
  dir.pressure.combat = 140;
  dir.lastMeaningfulAt = 0;
  dir.lastMajorAt = -1e9;
  dir.window = [];
  dir.cooldowns = {};
  let live = null;

  const playerImpactEvents = [];
  const encounterResolutions = [];
  const deployedFields = [];
  let playerImpactSeq = 1;
  bus.on('physics:impact', (event) => {
    if (event.aId !== player.id && event.bId !== player.id) return;
    const projectParticipant = (entityId) => {
      const entity = state.entities.get(entityId);
      return {
        type: entity?.type ?? null,
        worldRecordId: entity?.data?.worldRecordId ?? null,
        anchorSlotId: entity?.data?.activityCollisionAnchorSlotId ?? null,
      };
    };
    const a = projectParticipant(event.aId);
    const b = projectParticipant(event.bId);
    playerImpactEvents.push({
      seq: playerImpactSeq++,
      tick: state.tick,
      aId: event.aId,
      bId: event.bId,
      aType: a.type,
      aWorldRecordId: a.worldRecordId,
      aAnchorSlotId: a.anchorSlotId,
      bType: b.type,
      bWorldRecordId: b.worldRecordId,
      bAnchorSlotId: b.anchorSlotId,
    });
  });
  bus.on('encounter:resolved', (event) => {
    encounterResolutions.push({ ...event, tick: state.tick });
  });
  bus.on('fields:deployed', (event) => {
    const source = state.entities.get(event.sourceId);
    deployedFields.push({
      ...event,
      ownerId: source?.ownerId ?? source?.data?.ownerId ?? null,
      tick: state.tick,
    });
  });
  const inputSystem = runtime.getSystem('input');
  let stageClearanceTracking = false;
  let stageClearanceTargets = [];
  const stageMinimumHullGaps = Object.create(null);
  const applyPublicControls = (controls) => {
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Digit0', 'Digit6', 'ShiftLeft']) {
      inputSystem._keys[key] = false;
    }
    if (Number(controls.moveZ) > 0) inputSystem._keys.KeyW = true;
    if (Number(controls.moveZ) < 0) inputSystem._keys.KeyS = true;
    if (Number(controls.turnIntent) < 0) inputSystem._keys.KeyA = true;
    if (Number(controls.turnIntent) > 0) inputSystem._keys.KeyD = true;
    if (controls.brake === true && Number(controls.moveZ) === 0) {
      inputSystem._keys.Digit0 = true;
    }
    if (controls.boost === true) inputSystem._keys.ShiftLeft = true;
    if (controls.deployRepulsor === true) inputSystem._keys.Digit6 = true;
  };
  const step = (count, input = {}) => {
    for (let index = 0; index < count; index += 1) {
      applyPublicControls(input);
      state.tick = tick;
      state.simTime = tick * dt;
      tick += 1;
      runtime.step(dt);
      if (stageClearanceTracking) {
        for (const { key, entity } of stageClearanceTargets) {
          const gap = Math.hypot(
            entity.pos.x - player.pos.x,
            entity.pos.z - player.pos.z,
          ) - Number(player.radius) - Number(entity.radius);
          stageMinimumHullGaps[key] = Math.min(
            stageMinimumHullGaps[key] ?? Number.POSITIVE_INFINITY,
            gap,
          );
        }
      }
    }
  };
  const status = (target) => {
    const dx = target.targetPos.x - player.pos.x;
    const dz = target.targetPos.z - player.pos.z;
    let headingError = Math.atan2(dz, dx) - player.rot;
    while (headingError > Math.PI) headingError -= Math.PI * 2;
    while (headingError < -Math.PI) headingError += Math.PI * 2;
    return {
      distanceWU: Math.hypot(dx, dz),
      headingError,
      speed: Math.hypot(player.vel.x, player.vel.z),
    };
  };
  let boostPulses = 0;
  const drive = (target) => {
    let pulses = 0;
    for (; pulses < 220;) {
      const current = status(target);
      const action = chooseCeresPocketApproachAction(current, {
        arrivalRadiusWU: target.arrivalRadiusWU,
        allowBoost: target.allowBoost,
      });
      if (action.kind === 'complete') {
        return { pass: true, pulses, ...current };
      }
      if (action.kind === 'settle') {
        for (let index = 0; index < 600 && status(target).speed > 1; index += 1) {
          step(1, projectPilotFlightControls({ brakeHeld: true }));
        }
        continue;
      }
      pulses += 1;
      const pulseTicks = Math.max(1, Math.round(action.durationMs / 1_000 / dt));
      if (action.kind === 'turn') {
        step(pulseTicks, projectPilotFlightControls({
          yawRight: action.key === 'KeyD',
          yawLeft: action.key === 'KeyA',
        }));
      } else if (action.kind === 'decelerate') {
        step(pulseTicks, projectPilotFlightControls({ reverse: true }));
      } else if (action.kind === 'thrust') {
        if (action.boost) boostPulses += 1;
        step(pulseTicks, projectPilotFlightControls({
          forward: true,
          boost: action.boost,
        }));
        if (action.boost) step(1);
      } else {
        assert.fail(`unexpected toolkit reposition action ${action.kind}`);
      }
    }
    return { pass: false, pulses, ...status(target) };
  };

  const collisionAnchor = state.entityList.find((entity) => (
    entity?.alive !== false
      && entity.data?.activityCollisionAnchorSlotId === 'ceres_throughline_collision_anchor'
  ));
  assert.ok(collisionAnchor && collisionAnchor.collides !== false && collisionAnchor.mass > 0,
    'production fixture requires the authored Throughline collision body');
  const secondCollisionAnchor = state.entityList.find((entity) => (
    entity?.alive !== false
      && entity.data?.activityCollisionAnchorSlotId === 'ceres_ambush_collision_anchor'
  ));
  assert.ok(secondCollisionAnchor,
    'production fixture requires the second authored collision body');
  const driveFreshAnchorCollision = () => {
    const collisionStartTick = tick;
    const collisionStartSeq = playerImpactSeq;
    let pulses = 0;
    let collisionBoostPulses = 0;
    const selectedImpact = () => playerImpactEvents.find((impact) => (
      impact.seq >= collisionStartSeq
        && impact.tick >= collisionStartTick
        && ((impact.aId === player.id && impact.bId === collisionAnchor.id)
          || (impact.bId === player.id && impact.aId === collisionAnchor.id))
        && (impact.aId === player.id ? impact.aType : impact.bType) === 'ship'
        && (impact.aId === player.id ? impact.bType : impact.aType) === 'asteroid'
        && (impact.aId === player.id ? impact.bWorldRecordId : impact.aWorldRecordId) == null
        && (impact.aId === player.id ? impact.bAnchorSlotId : impact.aAnchorSlotId)
          === 'ceres_throughline_collision_anchor'
    ));
    for (; pulses < 220;) {
      const impact = selectedImpact();
      if (impact) {
        return {
          pass: true,
          source: 'public-keyboard-fixed-tick',
          controlClock: 'fixed-tick',
          playerEntityId: player.id,
          anchorEntityId: collisionAnchor.id,
          startTick: collisionStartTick,
          startSeq: collisionStartSeq,
          completionTick: tick,
          pulses,
          boostPulses: collisionBoostPulses,
          selectedImpactSeq: impact.seq,
          selectedImpactTick: impact.tick,
          impact,
        };
      }
      const target = {
        targetPos: collisionAnchor.pos,
      };
      const current = status(target);
      pulses += 1;
      if (Math.abs(current.headingError) > 0.09) {
        step(Math.max(1, Math.round(90 / 1_000 / dt)), projectPilotFlightControls({
          yawRight: current.headingError > 0,
          yawLeft: current.headingError < 0,
        }));
        continue;
      }
      const boost = current.distanceWU > 45 && current.speed < 90;
      if (boost) collisionBoostPulses += 1;
      step(Math.max(1, Math.round(
        (current.distanceWU > 30 ? 180 : 80) / 1_000 / dt,
      )), projectPilotFlightControls({ forward: true, boost }));
      if (boost) step(1);
    }
    return {
      pass: false,
      source: 'public-keyboard-fixed-tick',
      controlClock: 'fixed-tick',
      startTick: collisionStartTick,
      startSeq: collisionStartSeq,
      completionTick: tick,
      pulses,
      boostPulses: collisionBoostPulses,
      ...status({ targetPos: collisionAnchor.pos }),
    };
  };

    const collisionImpactStart = playerImpactEvents.length;
    const collisionReceipt = driveFreshAnchorCollision();
    const collisionPlayerImpactEvents = playerImpactEvents.slice(collisionImpactStart);
    stageClearanceTargets = [
      { key: 'secondAnchor', entity: secondCollisionAnchor },
      ...trafficEntities.map((entity, index) => ({ key: `traffic${index + 1}`, entity })),
      { key: 'hostile1', entity: destroyed },
      { key: 'hostile2', entity: survivor },
    ];
    stageClearanceTracking = true;
    const stageStartTick = tick;
    const stageImpactStart = playerImpactEvents.length;
    const receipts = [];
    for (const waypoint of planCeresThroughlineToolkitReposition().waypoints) {
      const receipt = drive(waypoint);
      receipts.push(receipt);
      if (!receipt.pass) break;
      step(2);
    }
    stageClearanceTracking = false;
    const cameraPlayerPos = { x: player.pos.x, z: player.pos.z };
    const cameraPlayerHull = player.hull;
    const cameraElapsedTicks = tick - stageStartTick;
    const stagePlayerImpactEvents = playerImpactEvents.slice(stageImpactStart);
    live = dir.live['ceres:activity:throughline-ambush'] || null;
    const conflictSnapshot = {
      tick,
      durablePhase: dir.stats?.ceresActivityAmbush?.phase || null,
      durableOutcome: dir.stats?.ceresActivityAmbush?.outcome || null,
      livePhase: live?.phase || null,
      boundHostiles: [destroyed, survivor].map((entity) => ({
        entityId: entity.id,
        worldRecordId: entity.data?.worldRecordId || null,
        alive: entity.alive !== false,
        phase: entity.data?.ai?.ceresActivityAmbushPhase || null,
        passive: entity.data?.ai?.passive ?? null,
        roe: entity.data?.ai?.roe || null,
        targetId: entity.data?.ai?.activity?.targetId ?? null,
        distanceWU: Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z),
        projection: projectThroughSettledChaseCamera(player.pos, entity.pos),
      })),
    };
    const postCameraImpactStart = playerImpactEvents.length;
    const selectedPointable = conflictSnapshot.boundHostiles.filter((hostile) => (
      hostile.alive === true && hostile.distanceWU <= 320
        && Math.abs(hostile.projection.x) <= 0.98
        && Math.abs(hostile.projection.y) <= 0.98
    )).sort((left, right) => (
      left.distanceWU - right.distanceWU
        || String(left.entityId).localeCompare(String(right.entityId))
    ))[0] || null;
    assert.ok(selectedPointable,
      'production stage must expose a live exact pointable cohort member');
    const combatVictim = [destroyed, survivor]
      .find((entity) => entity.id === selectedPointable.entityId);
    const escapingSurvivor = [destroyed, survivor]
      .find((entity) => entity.id !== selectedPointable.entityId);
    assert.ok(combatVictim && escapingSurvivor,
      'pointable selection must partition the exact two-actor cohort');
    const transitPlan = planCeresToolkitTransitHandoff();
    combatVictim.alive = false;
    step(1, { deployRepulsor: true });
    step(1);
    const repulsor = deployedFields.find((event) => (
      event.kind === 'repulsor' && event.ownerId === player.id
    )) || null;
    const transitStartTick = tick;
    const transitImpactStart = playerImpactEvents.length;
    const transitReceipt = drive(transitPlan);
    step(2);
    const transitEndTick = tick;
    const transitTicks = tick - transitStartTick;
    const transitPlayerImpactEvents = playerImpactEvents.slice(transitImpactStart);
    const postCameraPlayerImpactEvents = playerImpactEvents.slice(postCameraImpactStart);
    const survivorDistanceWU = Math.hypot(
      escapingSurvivor.pos.x - player.pos.x,
      escapingSurvivor.pos.z - player.pos.z,
    );
    const encounterResolution = encounterResolutions.find((event) => (
      event.encounterId === 'ceres:activity:throughline-ambush' && event.outcome === 'escaped'
    )) || null;
    const cathedral = sectorLocalToGlobalForSector(
      CERES_ACTIVITY_POCKETS_BY_ID.ceres_cathedral_grave.activityAnchor.localPos,
      CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
    );
    const remainingCathedralDistanceWU = Math.hypot(
      cathedral.x - player.pos.x,
      cathedral.z - player.pos.z,
    );
    state.nav.autopilot = {
      active: true,
      target: { ...cathedral },
      targetEntityId: null,
      label: 'Wreck Cathedral',
      arrivalRadius: 48,
      initialDistance: remainingCathedralDistanceWU,
      status: 'armed',
    };
    let cathedralTicks = 0;
    for (; cathedralTicks < 2_300 && state.nav.autopilot.status !== 'arrived'; cathedralTicks += 1) {
      step(1);
    }
    return {
      runtime: {
        evidenceClass: runtime.manifest.evidenceClass,
        aiBackend: runtime.manifest.selectedSlots.aiBackend,
        flightBackend: runtime.manifest.selectedSlots.flightBackend,
      },
      physics: {
        backend: state.physicsRuntime?.diagnostics?.backend || null,
        sg02Ready: state.physicsRuntime?.diagnostics?.sg02Ready === true,
        weaponImpulseConsequences: combatFlag(
          'weaponImpulseConsequences',
          runtime.config.features,
        ),
        captureContactImpacts: physicsSystem._sg02?.captureContactImpacts === true,
      },
      receipts,
      boostPulses,
      collisionReceipt,
      collisionPlayerImpactEvents,
      stagePlayerImpactEvents,
      stageMinimumHullGaps: { ...stageMinimumHullGaps },
      conflictSnapshot,
      postCameraPlayerImpactEvents,
      selectedPointable,
      selectedTargetAliveAfter: combatVictim.alive !== false,
      repulsor,
      playerEntityId: player.id,
      boundHostilesBeforeReposition: [destroyed, survivor].map((entity) => ({
        entityId: entity.id,
        worldRecordId: entity.data?.worldRecordId || null,
      })),
      playerHull: cameraPlayerHull,
      playerPos: cameraPlayerPos,
      playerImpactEvents: playerImpactEvents.slice(0, transitImpactStart),
      playerImpactTicks: playerImpactEvents.slice(0, transitImpactStart)
        .map((event) => event.tick),
      elapsedTicks: cameraElapsedTicks,
      transitPlan,
      transitReceipt,
      transitStartTick,
      transitEndTick,
      transitTicks,
      transitPlayerImpactEvents,
      transitPlayerImpactTicks: transitPlayerImpactEvents.map((event) => event.tick),
      survivorEntityId: escapingSurvivor.id,
      survivorAlive: escapingSurvivor.alive !== false,
      survivorWorldRecordId: escapingSurvivor.data?.worldRecordId || null,
      survivorDistanceWU,
      encounterInitialRecordIds: [destroyed, survivor]
        .map((entity) => entity.data?.worldRecordId || null).sort(),
      encounterResolution,
      remainingCathedralDistanceWU,
      cathedralArrived: state.nav.autopilot.status === 'arrived',
      cathedralTicks,
    };
  } finally {
    try {
      if (typeof physicsSystem?._disableSg02DynamicAuthority === 'function') {
        physicsSystem._disableSg02DynamicAuthority();
      }
    } finally {
      try {
        runtime?.dispose();
      } finally {
        FIELD_FLAGS.enabled = previousFieldFlag;
      }
    }
  }
}

async function runSeed47OffFrustumMasslineCombat() {
  const dt = 1 / 60;
  const maxCombatTicks = SEED47_REAVER_KILL_TICK_CEILING;
  const hostileStart = { x: -8972.711669921875, z: 7237.062744140625 };
  let aimPoint = { ...hostileStart };
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: 47,
    helpers: {
      raycastToPlane() { return { ...aimPoint }; },
    },
  });
  const { state, bus } = runtime;
  const attachedEvents = [];
  const latchedEvents = [];
  const brokenEvents = [];
  let evidenceSeq = 0;
  let player = null;
  let target = null;
  let secondAttachmentId = null;
  let offFrustumFire = null;
  let exactHit = null;
  let tombstone = null;
  let secondLineStayedActiveBeforeKill = true;
  let targetAliveAtHit = false;
  let firstHitCombatTicks = null;
  let playerFireCount = 0;
  let targetHitCount = 0;
  let combatTicks = 0;
  let maxDistanceWU = 0;
  let fixedAimPoint = null;

  const lineSnapshot = () => {
    const line = secondAttachmentId == null
      ? null
      : state.combat?.attachments?.byId?.[secondAttachmentId];
    return {
      attachmentId: line?.id ?? null,
      lineState: line?.state ?? null,
      lineTargetId: line?.targetId ?? null,
    };
  };
  const tetherSnapshot = () => ({
    tetherActive: state.player?.tether?.active === true,
    attachmentId: state.player?.tether?.attachmentId ?? null,
    tetherTargetId: state.player?.tether?.targetId ?? null,
    gunTargetId: state.player?.gunTargetId ?? null,
  });

  bus.on('tether:attached', (payload) => {
    attachedEvents.push({ seq: ++evidenceSeq, tick: state.tick, ...payload });
  });
  bus.on('tether:latched', (payload) => {
    latchedEvents.push({ seq: ++evidenceSeq, tick: state.tick, ...payload });
  });
  bus.on('tether:broken', (payload) => {
    brokenEvents.push({ seq: ++evidenceSeq, tick: state.tick, ...payload });
  });
  bus.on('combat:fire', (payload) => {
    if (!player || !target || payload.ownerId !== player.id) return;
    playerFireCount += 1;
    if (offFrustumFire) return;
    const projection = projectThroughSettledChaseCamera(player.pos, target.pos);
    if (Math.abs(projection.x) <= 0.98 && Math.abs(projection.y) <= 0.98) return;
    const projectile = state.entityList.at(-1);
    if (!projectile || projectile.type !== 'projectile'
      || projectile.ownerId !== player.id
      || projectile.data?.weaponId !== payload.weaponId) return;
    const bearing = Math.atan2(target.pos.z - player.pos.z, target.pos.x - player.pos.x);
    const leadRad = Math.atan2(
      Math.sin(payload.dir - bearing),
      Math.cos(payload.dir - bearing),
    );
    offFrustumFire = {
      seq: ++evidenceSeq,
      tick: state.tick,
      ownerId: payload.ownerId,
      weaponId: payload.weaponId,
      dir: payload.dir,
      projectileId: projectile.id,
      targetId: target.id,
      projection,
      bearing,
      leadRad,
      distanceWU: Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z),
      ...tetherSnapshot(),
      ...lineSnapshot(),
    };
  });
  bus.on('projectile:hit', (payload) => {
    if (!player || !target || payload.ownerId !== player.id || payload.targetId !== target.id) return;
    targetHitCount += 1;
    if (!offFrustumFire || exactHit || payload.weaponId !== offFrustumFire.weaponId) return;
    const projectile = state.entities.get(offFrustumFire.projectileId);
    if (!projectile || projectile.alive === false
      || Math.hypot(projectile.pos.x - payload.pos.x, projectile.pos.z - payload.pos.z) > 1e-9) return;
    exactHit = {
      seq: ++evidenceSeq,
      tick: state.tick,
      projectileId: projectile.id,
      ownerId: payload.ownerId,
      targetId: payload.targetId,
      weaponId: payload.weaponId,
      distanceWU: Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z),
      ...tetherSnapshot(),
      ...lineSnapshot(),
    };
    targetAliveAtHit = target.alive !== false;
    firstHitCombatTicks = combatTicks + 1;
  });
  bus.on('entity:killed', (payload) => {
    if (!player || !target || tombstone || payload.id !== target.id) return;
    tombstone = {
      seq: ++evidenceSeq,
      tick: state.tick,
      id: payload.id,
      killerId: payload.killerId,
      worldRecordId: target.data?.worldRecordId ?? null,
      distanceWU: Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z),
      ...tetherSnapshot(),
      ...lineSnapshot(),
    };
  });

  try {
    state.mode = 'flight';
    state.tick = 6_834;
    state.simTime = state.tick * dt;
    state.world.currentSectorId = 'sector_ceres_belt';

    player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
      isPlayer: true,
      player: state.player,
      pos: { x: -8982.0283203125, z: 7171.980773925781 },
      rot: -1.471084233247489,
      fittings: [...TOOLKIT_WEAPON_IDS],
    }));
    player.vel = { x: 0, z: 0 };
    player.angVel = 0;
    player.collides = true;
    state.playerId = player.id;

    const targetSpec = makeEnemySpawnSpec('reaver_pirate', 3, hostileStart, {
      startedTick: 6_000,
      zoneId: 'zone_ceres_ambush',
    });
    targetSpec.vel = { x: -targetSpec.maxSpeed, z: 0 };
    targetSpec.rot = Math.PI;
    targetSpec.data.worldRecordId = 'wr_npc_b41fdf37';
    Object.assign(targetSpec.data.ai, {
      squadId: 'zone_ceres_ambush',
      zoneId: 'zone_ceres_ambush',
      ceresActivityAmbushPhase: 'conflict',
      passive: false,
      roe: 'weapons_free',
      forcePlayerTarget: true,
      huntPlayer: true,
      spawnContext: 'zone_hostile',
    });
    targetSpec.data.combat = {
      targetId: player.id,
      lockTarget: player.id,
      lockProgress: 1,
    };
    target = runtime.spawn(targetSpec);

    const physicsSystem = runtime.getSystem('physics');
    const ready = await physicsSystem.prepareBackend(state, { reset: true });
    assert.equal(ready, true, 'off-frustum Massline fixture requires production Rapier authority');
    const physicsDiagnostics = state.physicsRuntime?.diagnostics;
    assert.equal(physicsDiagnostics?.backend, 'rapier-dynamic');
    assert.equal(physicsDiagnostics?.sg02Ready, true);

    const inputSystem = runtime.getSystem('input');
    inputSystem._screen.active = true;
    inputSystem._screen.x = 720;
    inputSystem._screen.y = 450;
    const step = (count) => {
      for (let index = 0; index < count; index += 1) runtime.step(dt);
    };
    const tapMassline = () => {
      step(1);
      inputSystem._keys.Space = true;
      step(1);
      inputSystem._keys.Space = false;
      step(2);
    };

    tapMassline();
    inputSystem._keys.Space = true;
    step(1);
    inputSystem._keys.Space = false;
    step(2);
    step(16);
    aimPoint = { x: target.pos.x, z: target.pos.z };
    tapMassline();
    secondAttachmentId = attachedEvents.at(-1)?.attachmentId ?? null;
    fixedAimPoint = { x: player.pos.x, z: player.pos.z };
    aimPoint = { ...fixedAimPoint };

    inputSystem._m0 = true;
    while (combatTicks < maxCombatTicks && !tombstone) {
      runtime.step(dt);
      combatTicks += 1;
      const distanceWU = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
      maxDistanceWU = Math.max(maxDistanceWU, distanceWU);
      if (!tombstone) {
        const line = lineSnapshot();
        if (line.lineState !== 'active' || line.lineTargetId !== target.id
          || state.player?.tether?.active !== true
          || state.player?.tether?.attachmentId !== secondAttachmentId) {
          secondLineStayedActiveBeforeKill = false;
        }
      }
    }

    return {
      runtime: {
        evidenceClass: runtime.manifest.evidenceClass,
        aiBackend: runtime.manifest.selectedSlots.aiBackend,
        flightBackend: runtime.manifest.selectedSlots.flightBackend,
      },
      physics: {
        backend: physicsDiagnostics.backend,
        sg02Ready: physicsDiagnostics.sg02Ready,
      },
      playerId: player.id,
      targetId: target.id,
      targetWorldRecordId: target.data.worldRecordId,
      attachedEvents,
      latchedEvents,
      brokenEvents,
      offFrustumFire,
      exactHit,
      tombstone,
      targetAliveAtHit,
      targetAliveAfterLoop: target.alive !== false,
      secondLineStayedActiveBeforeKill,
      firstHitCombatTicks,
      playerFireCount,
      targetHitCount,
      maxDistanceWU,
      combatTicks,
      fixedAimPoint,
      finalAimPoint: { ...aimPoint },
    };
  } finally {
    const inputSystem = runtime.getSystem('input');
    if (inputSystem) {
      inputSystem._m0 = false;
      inputSystem._keys.Space = false;
    }
    runtime.dispose();
  }
}

function projectThroughSettledChaseCamera(focus, worldPoint) {
  const zoomWU = 144 * 0.88;
  const tilt = 60 * Math.PI / 180;
  const fov = 50 * Math.PI / 180;
  const aspect = 1440 / 900;
  const near = 1;
  const far = 14_000;
  const dx = worldPoint.x - focus.x;
  const dz = worldPoint.z - focus.z;
  const depth = zoomWU + Math.cos(tilt) * dz;
  if (!(depth > 0)) return { x: Infinity, y: Infinity, z: Infinity };
  const halfHeight = depth * Math.tan(fov / 2);
  return {
    // Three's fixed chase camera faces world +Z, so camera-right is world -X.
    x: -dx / (halfHeight * aspect),
    y: Math.sin(tilt) * dz / halfHeight,
    z: (far + near) / (far - near) - (2 * far * near) / ((far - near) * depth),
  };
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
