import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  bindEnvironmentToStandardMaterials,
  collectFirstFlightEffectRoots,
  collectFirstFlightLayerDrawables,
} from '../src/render/latePipelineAdmission.js';
import { shouldSubmitEntityMesh } from '../src/render/entityMeshVisibility.js';
import { isEntityRenderRelevant } from '../src/render/renderer.js';
import { cookLiveSceneGpu } from '../src/render/liveSceneCook.js';
import { waitForCurrentRenderPipelines, waitForOpeningGpuResources } from '../src/render/pipelineReadiness.js';

test('loading waitForCurrentRenderPipelines drains optional post-opening pipelines after the exact plan', async () => {
  const timeline = [];
  const state = {
    mode: 'loading',
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      captureOpeningSubmissionPlan: () => {
        timeline.push('exact:capture');
        return { complete: true, firstPlayablePipelineSet: { complete: true } };
      },
      drainOpeningSubmissionPlan: async () => {
        timeline.push('exact:drain');
      },
      preparePostOpeningPipelines: async () => {
        timeline.push('post-opening');
        return { skipped: false };
      },
    },
  };

  assert.equal(await waitForCurrentRenderPipelines(state, 1000), true);
  assert.deepEqual(timeline, ['exact:capture', 'exact:drain', 'post-opening']);
  assert.equal(typeof state.render.postOpeningPipelinesReady?.then, 'function');
  assert.equal(typeof state.render.liveSceneCookReady?.then, 'function');
  assert.equal(state.render.liveSceneCook.skipped, true);
  assert.equal(state.render.liveSceneCook.reason, 'no-live-scene');
});

test('cookLiveSceneGpu compiles and uploads the live scene subjects', async () => {
  const calls = [];
  const scene = { name: 'live-sector' };
  const camera = { name: 'flight-cam' };
  const state = {
    mode: 'loading',
    render: {
      renderer: {
        compileAsync: async (subject, cam) => {
          calls.push(['compile', subject.name, cam.name]);
        },
      },
      scene,
      camera,
    },
  };
  const result = await cookLiveSceneGpu(state, {
    prepareResidency: async (_renderer, subject) => {
      calls.push(['buffers', subject.name]);
      return { skipped: false, textures: 2 };
    },
  });
  assert.equal(result.liveScene, true);
  assert.equal(result.programs.method, 'compileAsync');
  assert.deepEqual(calls, [
    ['compile', 'live-sector', 'flight-cam'],
    ['buffers', 'live-sector'],
  ]);
});

test('loading cook uses the live scene programs and buffers, not a dummy catalog', async () => {
  const cooked = [];
  const state = {
    mode: 'loading',
    render: {
      cookLiveSceneGpu: async () => {
        cooked.push('live');
        return { skipped: false, liveScene: true };
      },
    },
  };
  const result = await cookLiveSceneGpu(state);
  assert.deepEqual(cooked, ['live']);
  assert.equal(result.liveScene, true);
  assert.equal(state.render.liveSceneCook.liveScene, true);
});

test('flight mode refuses a live-scene cook so dummy mid-flight prewarm stays dead', async () => {
  const result = await cookLiveSceneGpu({
    mode: 'flight',
    render: { scene: {}, renderer: {}, camera: {} },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'not-loading');
});

test('post-opening drain is optional so existing loading mocks without it still pass', async () => {
  const state = {
    mode: 'loading',
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      captureOpeningSubmissionPlan: () => ({
        complete: true,
        firstPlayablePipelineSet: { complete: true },
      }),
      drainOpeningSubmissionPlan: async () => {},
    },
  };
  assert.equal(await waitForCurrentRenderPipelines(state, 1000), true);
});

test('standard materials pick up the live PMREM so compile and first bloom share the env key', () => {
  const envMap = { isTexture: true, mapping: 306 };
  const painted = { isMeshStandardMaterial: true, envMap: null, needsUpdate: false };
  const shader = { isShaderMaterial: true, envMap: null, needsUpdate: false };
  const already = { isMeshStandardMaterial: true, envMap, needsUpdate: false };
  const scene = {
    material: painted,
    traverse(fn) {
      fn({ material: [painted, shader] });
      fn({ material: already });
    },
  };
  assert.equal(bindEnvironmentToStandardMaterials(scene, envMap), 1);
  assert.equal(painted.envMap, envMap);
  assert.equal(painted.needsUpdate, true);
  assert.equal(shader.envMap, null);
  assert.equal(already.needsUpdate, false);
});

test('first-flight effect roots are the live plume, plasma, combat pools, and 47-A spindle', () => {
  const scene = {
    traverse(fn) {
      fn({ name: 'plume-system:family_industrial_main_plume', userData: { continuousPlume: true } });
      fn({ name: 'rcs-system:hitch_kestrel_rcs_impulse', userData: {} });
      fn({ name: 'sf-liquid-plasma-root', userData: {} });
      fn({ name: 'sf-retro-volume-root', userData: {} });
      fn({ name: 'SF_RibbonTrail', userData: {} });
      fn({ name: 'Evidence_Spindle_47A', userData: {} });
      fn({ name: 'SF_VFX_ParticleShardStreaks', userData: {} });
      fn({ name: 'SF_TrailStreakInstances', userData: {} });
      fn({ name: 'SF_VFX_glow_sprite_instances', userData: {} });
      fn({ name: 'ShipNavLight_Pool', userData: { shipAuxPool: 'navLight' } });
      fn({ name: 'SF_WeaponEnergyBolts', userData: {} });
      fn({ name: 'SF_ArcadeBladePool', userData: {} });
      fn({ name: 'sf-combat-beam-core-pool', userData: {} });
      fn({ name: 'SF_QuarksBatchedRenderer', userData: {} });
      fn({ name: 'SF_Precompile_Hitch_Main_Plume', userData: { precompileStaging: true } });
      fn({ name: 'SF_Precompile_TrailStreak', userData: { precompileStaging: true } });
      fn({ name: 'SF_Precompile_WeaponEnergyBolts', userData: { precompileStaging: true } });
    },
  };
  const roots = collectFirstFlightEffectRoots(scene);
  assert.deepEqual(roots.map((root) => root.name), [
    'plume-system:family_industrial_main_plume',
    'rcs-system:hitch_kestrel_rcs_impulse',
    'sf-liquid-plasma-root',
    'sf-retro-volume-root',
    'SF_RibbonTrail',
    'Evidence_Spindle_47A',
    'SF_VFX_ParticleShardStreaks',
    'SF_TrailStreakInstances',
    'SF_VFX_glow_sprite_instances',
    'ShipNavLight_Pool',
    'SF_WeaponEnergyBolts',
    'SF_ArcadeBladePool',
    'sf-combat-beam-core-pool',
    'SF_QuarksBatchedRenderer',
  ]);
});

test('first-flight layer drawables include count-0 and drawRange-0 meshes', () => {
  const hiddenStrip = {
    name: 'snake',
    isMesh: true,
    geometry: { drawRange: { start: 0, count: 0 } },
  };
  const emptyPlume = {
    name: 'plume-layer:core',
    isInstancedMesh: true,
    count: 0,
    geometry: { uuid: 'high' },
  };
  const root = {
    name: 'sf-liquid-plasma-root',
    traverse(fn) {
      fn(this);
      fn(hiddenStrip);
      fn(emptyPlume);
    },
  };
  assert.deepEqual(
    collectFirstFlightLayerDrawables([root]).map((object) => object.name),
    ['snake', 'plume-layer:core'],
  );
});

test('GPU-stage loading builds the on-table 47-A spindle, not the far wreck', () => {
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 } };
  const spindle = {
    id: 2, type: 'payload', alive: true, pos: { x: 92, z: 0 },
    data: { scenarioActorId: 'evidence_spindle_47a', assetRef: 'asset.slice.47a_spindle' },
  };
  const nearbyWreck = {
    id: 3, type: 'wreck', alive: true, pos: { x: 340, z: 220 },
    data: { assetRef: 'asset.slice.bourse_carrier_wreck' },
  };
  const loading = {
    mode: 'loading',
    playerId: 1,
    entities: new Map([[1, player], [2, spindle], [3, nearbyWreck]]),
    camera: { zoom: 144 },
    render: {},
  };
  assert.equal(isEntityRenderRelevant(spindle, loading), false);
  assert.equal(isEntityRenderRelevant(nearbyWreck, loading), false);
  loading.render.liveSectorGpuAdmission = true;
  assert.equal(isEntityRenderRelevant(spindle, loading), true);
  assert.equal(isEntityRenderRelevant(nearbyWreck, loading), false);
});

test('uncompiled ordinary roots are held; protected roots still submit', () => {
  assert.equal(shouldSubmitEntityMesh({ pipelinesPending: true }), false);
  assert.equal(shouldSubmitEntityMesh({ isPlayer: true, pipelinesPending: true }), true);
});

test('GPU residency recooks the live scene with a real present after maps land', async () => {
  const timeline = [];
  const state = {
    mode: 'loading',
    render: {
      prepareOpeningGpuResources: async () => {
        timeline.push('gpu');
        return { skipped: false };
      },
      cookLiveSceneGpu: async (options) => {
        timeline.push(['present-cook', options.present, options.skipBuffers]);
        return { skipped: false, liveScene: true, present: { skipped: false } };
      },
    },
  };
  assert.equal(await waitForOpeningGpuResources(state, 1000), true);
  assert.deepEqual(timeline, ['gpu', ['present-cook', true, true]]);
  assert.equal(typeof state.render.liveScenePresentReady?.then, 'function');
});

test('pipeline warmup does not whole-scene 1x1 when prepareLiveSectorBeforeFlight will cook', async () => {
  const cooked = [];
  const state = {
    mode: 'loading',
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      captureOpeningSubmissionPlan: () => ({
        complete: true,
        firstPlayablePipelineSet: { complete: true },
      }),
      drainOpeningSubmissionPlan: async () => {},
      prepareLiveSectorBeforeFlight: async () => ({ skipped: false }),
      cookLiveSceneGpu: async () => {
        cooked.push('warmup-whole-scene');
        return { skipped: false, liveScene: true };
      },
    },
  };
  assert.equal(await waitForCurrentRenderPipelines(state, 1000), true);
  assert.deepEqual(cooked, []);
});

test('GPU residency prefers a live-sector upgrade drain before the present cook', async () => {
  const timeline = [];
  const state = {
    mode: 'loading',
    render: {
      prepareOpeningGpuResources: async () => {
        timeline.push('gpu');
        return { skipped: false };
      },
      prepareLiveSectorBeforeFlight: async () => {
        timeline.push('live-sector');
        return { skipped: false };
      },
    },
  };
  assert.equal(await waitForOpeningGpuResources(state, 1000), true);
  assert.deepEqual(timeline, ['gpu', 'live-sector']);
});

test('GPU residency still cooks the live sector when opening prepare times out', async () => {
  const timeline = [];
  const state = {
    mode: 'loading',
    render: {
      prepareOpeningGpuResources: () => new Promise(() => {
        timeline.push('gpu-hang');
      }),
      prepareLiveSectorBeforeFlight: async () => {
        timeline.push('live-sector');
        return { skipped: false };
      },
    },
  };
  assert.equal(await waitForOpeningGpuResources(state, 20), true);
  assert.ok(timeline.includes('live-sector'));
});

test('same-sector F9 recook skips the opening GPU 1x1 and still cooks the live sector', async () => {
  const timeline = [];
  const state = {
    mode: 'loading',
    world: { currentSectorId: 'sector_helios_prime' },
    render: {
      sessionLiveSectorCookedId: 'sector_helios_prime',
      prepareOpeningGpuResources: async () => {
        timeline.push('gpu');
        return { skipped: false };
      },
      prepareLiveSectorBeforeFlight: async () => {
        timeline.push('live-sector');
        return { skipped: false };
      },
    },
  };
  assert.equal(await waitForOpeningGpuResources(state, 1000), true);
  assert.deepEqual(timeline, ['live-sector']);
});

test('admission queues compiles during loading and retries the starting sector after the exact plan', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const readiness = await readFile(new URL('../src/render/pipelineReadiness.js', import.meta.url), 'utf8');
  const parts = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(renderer, /state\.mode === 'loading'[\s\S]{0,700}?opening-submission-plan-owns-first-picture/,
    'loading still bypasses the broad authored-root watermark');
  assert.match(renderer, /if \(subject\) void admitSubjectPipelines\(subject\)/);
  assert.match(renderer, /_pendingPostOpeningSector/);
  assert.match(renderer, /preparePostOpeningPipelines/);
  assert.match(renderer, /live-scene-cook-owns-next-sector/);
  assert.match(renderer, /cookLiveSceneGpu/);
  assert.match(renderer, /revealSubjectForCompile/);
  assert.match(renderer, /per-subject-touch/);
  assert.match(renderer, /prepareLiveSectorBeforeFlight/);
  assert.match(renderer, /waitForOpeningCompositionSettled/);
  assert.match(renderer, /warmupLiveFlightEffects/);
  assert.doesNotMatch(renderer, /openingSubmissionValidation\?\.ok !== false/);
  assert.match(renderer, /hold-deferred-through-first-flight/);
  assert.match(renderer, /holdFirstFlightStreaming/);
  assert.match(renderer, /holdAuthoredUpgradeQueueForFirstFlight/);
  assert.match(renderer, /resumeAuthoredUpgradeQueueForLoadingHulls/);
  assert.match(renderer, /session-recook-hold-leftover-fx/);
  assert.match(renderer, /held-first-flight/);
  assert.match(renderer, /prepareLiveSectorAfterJump/);
  assert.match(renderer, /sectorShellAdmission/);
  assert.match(renderer, /firstFlightResidencyHoldUntil/);
  assert.match(renderer, /collectFirstFlightEffectRoots/);
  assert.match(renderer, /collectVfxGpuResidencyRoots/);
  assert.match(renderer, /Count-0 combat pools|first and leave count-0 combat pools/);
  assert.match(renderer, /bindEnvironmentToStandardMaterials/);
  assert.match(renderer, /enqueueMissingMeshBuilds/);
  assert.match(renderer, /releaseOpeningGraphPublication/);
  assert.match(renderer, /collectPreparedAuthoredCompileRoots/);
  assert.match(renderer, /Do not touchSubjectOnExactTarget\(scene\)/);
  assert.match(renderer, /framebuffer\/texture feedback loop/);
  assert.match(parts, /requestOpeningCompositionUpgrades/);
  assert.match(parts, /waitForOpeningCompositionSettled/);
  assert.match(parts, /compiling !== true/);
  assert.match(parts, /holdAuthoredUpgradeQueueForFirstFlight/);
  assert.match(parts, /pumpAuthoredUpgradeQueue/);
  assert.match(parts, /collectPreparedAuthoredCompileRoots/);
  assert.match(parts, /collectFirstFlightCookEntities/);
  assert.match(renderer, /pumpAuthoredUpgradeQueue/);
  assert.match(renderer, /liveSectorGpuAdmission/);
  assert.match(renderer, /isFirstFlightCookEntity/);
  assert.match(renderer, /collectFirstFlightCookEntities/);
  assert.match(renderer, /first-flight-cook/);
  assert.match(renderer, /firstFlightBufferRoots/);
  assert.match(renderer, /for \(const root of firstFlightRoots\) addFirstFlightBufferRoot/);
  assert.match(renderer, /1x1 of firstFlightRoots on F9 TDR'd Intel/);
  assert.match(renderer, /session-recook-skip-bloom-touch/);
  assert.match(renderer, /holdFirstFlightShadow/);
  assert.match(renderer, /collectFirstFlightLayerDrawables/);
  assert.match(renderer, /Nearby opening ships first-drew mule\/wasp LOD0/);
  assert.match(renderer, /collectVfxGpuResidencyRoots\(\)/);
  assert.match(renderer, /Count-0 \/ drawRange-0 effect drawables/);
  assert.match(renderer, /restLiveFlightEffectsAfterCook/);
  const bloom = await readFile(new URL('../src/render/bloom.js', import.meta.url), 'utf8');
  assert.match(bloom, /unstampedVisible/);
  assert.match(bloom, /spacefaceGpuResident/);
  assert.doesNotMatch(renderer, /SF_LiveSectorShadowDepthAdmission/);
  assert.match(renderer, /compileAsteroid/);
  assert.match(renderer, /asteroidInstancePool/);
  assert.match(renderer, /liveSectorGpuAdmission/);
  assert.match(renderer, /FIRST_FLIGHT_ROCK_COOK_CAP/);
  assert.match(renderer, /geometryPending/);
  assert.match(renderer, /spacefaceGeometryResident/);
  assert.doesNotMatch(renderer, /gpu-residency-already-prepared/);
  assert.doesNotMatch(renderer, /includeGlobalPipelines:\s*true/);
  assert.doesNotMatch(renderer, /precompilePipelines\(/);
  assert.match(renderer, /pipelinesPending = pending === true/);
  assert.match(readiness, /preparePostOpeningPipelines/);
  assert.match(readiness, /liveScenePresentReady/);
  assert.match(readiness, /prepareLiveSectorBeforeFlight/);
  assert.match(readiness, /typeof render.prepareLiveSectorBeforeFlight !== 'function'/);
  assert.match(readiness, /Same-sector F9 recook skips the opening 1x1/);
  assert.match(readiness, /Recapturing first-picture compiled 37 extra programs/);
  assert.match(renderer, /session-recook-keep-gpu/);
  assert.match(renderer, /reattachResidentGpuMeshes/);
  assert.match(renderer, /restored hulls showed status missing/);
  assert.doesNotMatch(renderer, /session-recook-opening-buffers/);
  assert.match(renderer, /session-recook-visuals-already-ready/);
  assert.match(renderer, /hulls-only-hold-leftover-fx/);
  assert.doesNotMatch(renderer, /deferredStartupPrecompile|backgroundPipelinePrecompileReady/);
  assert.doesNotMatch(renderer, /scheduleUpgradeFrame/,
    'must not relitigate upgrade-frame scheduling');
});
