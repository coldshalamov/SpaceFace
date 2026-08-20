#!/usr/bin/env node
// Headed Electron runtime witness: fly a few seconds and write what actually happened.
// Agents should read .devshots/runtime-witness/report.md instead of guessing from source.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { classifyRuntimeWitness, formatRuntimeWitnessReport } from '../src/core/runtimeWitness.js';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const requireCjs = createRequire(import.meta.url);
const {
  readPlayerStoreKeysSync,
  resolvePlayerSaveDir,
} = requireCjs('./lib/playerSaveStore.cjs');
const OUT = path.join(ROOT, '.devshots', 'runtime-witness');
const SAMPLE_MS = Number(process.env.SPACEFACE_WITNESS_MS || 20_000);
const SAMPLE_EVERY_MS = 500;
const FIXED_SEED = 47;
const CONTINUE_ROUTE = process.argv.includes('--continue');
const SECTOR_ENTRY_ROUTE = process.argv.includes('--sector-entry');
const SHADOWS_OFF_DIAGNOSTIC = process.argv.includes('--shadows-off-diagnostic');
const OPAQUE_BATCH_OFF_DIAGNOSTIC = process.argv.includes('--opaque-batch-off-diagnostic');

await mkdir(OUT, { recursive: true });

const logs = [];
const consoleHits = [];
const pageErrors = [];
const snapshots = [];
const canvasFrames = [];
const loadingReadinessSamples = [];
let loadingProgressEvents = [];
let probeInstrumentation = null;
let finalHitchAttribution = null;
let finalRenderWork = null;
let finalSystemTiming = null;
let openingRenderWork = null;
let opaqueBatchDiagnostic = null;
let sectorTransitionTrace = null;

function log(line) {
  const text = `[${new Date().toISOString()}] ${line}`;
  logs.push(text);
  console.log(text);
}

const TABLE_CENSUS_FIELDS = Object.freeze([
  'glass',
  'runway',
  'beyond',
  'submitted',
  'resident',
  'landmarks',
]);
const BLOOM_PHASE_LABELS = Object.freeze([
  'bloomScene',
  'bloomDownsample',
  'bloomComposite',
]);

function summarizeTableCensus(samples) {
  const rows = samples
    .map((sample) => sample && sample.tableCensus)
    .filter((row) => row && row.available === true);
  if (rows.length === 0) return { available: false, sampleCount: 0 };
  const ranges = {};
  for (const field of TABLE_CENSUS_FIELDS) {
    const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
    ranges[field] = values.length > 0
      ? { min: Math.min(...values), max: Math.max(...values) }
      : { min: null, max: null };
  }
  return {
    available: true,
    sampleCount: rows.length,
    first: rows[0],
    last: rows[rows.length - 1],
    ranges,
  };
}

function formatTableCensusSection(summary, route) {
  const lines = [
    '',
    '## Tabletop census (PQ-129.01)',
    `- route: ${route.label}, held thrust, ${route.sampleMs} ms at ${route.sampleEveryMs} ms cadence`,
    `- sim delta: ${route.simDelta.toFixed(2)} s; executed-frame delta: ${route.executedFrameDelta}`,
    `- bounded instrumentation: renderWork ${route.instrumentation?.previousRenderWorkEnabled === true ? 'already on' : 'enabled for this probe only'}; prior state restored before shutdown: ${route.instrumentation?.restored === true}`,
  ];
  if (!summary.available) {
    lines.push('- census unavailable: the live renderer did not publish a probe-gated table sample');
    return lines.join('\n');
  }
  const last = summary.last;
  lines.push(
    `- last population: glass ${last.glass}, runway ${last.runway}, beyond ${last.beyond}, submitted ${last.submitted}, resident ${last.resident}, landmarks ${last.landmarks}`,
    `- policy envelope: glass half-extents ${last.glassHalfX} x ${last.glassHalfZ} WU; runway ${last.runwayWu} WU`,
    `- observed ranges: ${TABLE_CENSUS_FIELDS.map((field) => `${field} ${summary.ranges[field].min}–${summary.ranges[field].max}`).join('; ')}`,
    '- submitted is the tabletop policy population (glass + runway + forced roots), not WebGL draw calls.',
  );
  return lines.join('\n');
}

function formatHitchAttributionSection(histogram, route) {
  const counts = histogram && histogram.counts ? histogram.counts : {};
  const namedCounts = Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .map(([owner, count]) => `${owner} ${count}`)
    .join('; ');
  return [
    '',
    '## Live hitch attribution (PQ-129.02)',
    `- bounded instrumentation: classifier ${route.instrumentation?.previousHitchAttributionEnabled === true ? 'already on' : 'enabled for this probe only'}; prior state restored before shutdown: ${route.instrumentation?.restored === true}`,
    `- observed frames: ${histogram?.frames ?? 0}; hitches: ${histogram?.hitches ?? 0}; named: ${histogram?.named ?? 0}; unknown: ${histogram?.unknown ?? 0}`,
    `- hitch runs: first ${histogram?.firstHitches ?? 0}; echoes ${histogram?.echoHitches ?? 0}; longest streak ${histogram?.longestStreak ?? 0}`,
    `- named coverage: ${(Number(histogram?.coverage) || 0).toFixed(3)}`,
    `- owner counts: ${namedCounts || 'none'}`,
  ].join('\n');
}

function formatSectorTransitionSection(trace) {
  const events = Array.isArray(trace?.events) ? trace.events : [];
  const stages = Array.isArray(trace?.stages) ? trace.stages : [];
  const lines = ['', '## Sector-transition phase ledger'];
  if (events.length < 2) {
    lines.push('- unavailable: no armed public jump event sequence was observed');
    return lines.join('\n');
  }
  for (let index = 1; index < events.length; index++) {
    const previous = events[index - 1];
    const current = events[index];
    const previousHitches = Number(previous?.hitch?.hitches) || 0;
    const currentHitches = Number(current?.hitch?.hitches) || 0;
    const ownerDeltas = [];
    const owners = new Set([
      ...Object.keys(previous?.hitch?.counts || {}),
      ...Object.keys(current?.hitch?.counts || {}),
    ]);
    for (const owner of owners) {
      const delta = (Number(current?.hitch?.counts?.[owner]) || 0)
        - (Number(previous?.hitch?.counts?.[owner]) || 0);
      if (delta > 0) ownerDeltas.push(`${owner} ${delta}`);
    }
    const elapsedMs = Math.max(0,
      (Number(current?.elapsedMs) || 0) - (Number(previous?.elapsedMs) || 0));
    lines.push(
      `- ${previous.label} -> ${current.label}: ${elapsedMs.toFixed(1)} ms; hitches +${Math.max(0, currentHitches - previousHitches)}; owners ${ownerDeltas.join(', ') || 'none'}; tick ${current.tick}; sim ${Number(current.simTime || 0).toFixed(2)}; sector ${current.sectorId || 'none'}; jump ${current.jumpState || 'none'}`,
    );
  }
  const settled = events[events.length - 1];
  lines.push(
    `- settled frame: dt ${(Number(settled?.frame?.frameDtMs) || 0).toFixed(1)} ms; simFrame ${(Number(settled?.frame?.simFrameMs) || 0).toFixed(1)} ms; presentation ${(Number(settled?.frame?.presentationMs) || 0).toFixed(1)} ms; steps ${Number(settled?.frame?.stepsThisFrame) || 0}; shed frames ${Number(settled?.frame?.shedBacklogFrames) || 0}`,
  );
  const stageTotals = new Map();
  for (const stage of stages) {
    const durationMs = Number(stage?.durationMs) || 0;
    if (durationMs <= 0) continue;
    const current = stageTotals.get(stage.label) || { count: 0, totalMs: 0, maxMs: 0 };
    current.count++;
    current.totalMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    stageTotals.set(stage.label, current);
  }
  const rankedStages = [...stageTotals.entries()]
    .sort((a, b) => b[1].totalMs - a[1].totalMs)
    .slice(0, 12);
  if (rankedStages.length > 0) {
    lines.push(`- synchronous owner stages: ${rankedStages.map(([label, stat]) => `${label} ${stat.totalMs.toFixed(1)} ms total/${stat.maxMs.toFixed(1)} ms max (${stat.count})`).join('; ')}`);
  }
  const listenerMetadata = Array.isArray(trace?.listenerMetadata) ? trace.listenerMetadata : [];
  const topListener = rankedStages.find(([label]) => label.startsWith('listener.sector:enter['));
  if (topListener) {
    const metadata = listenerMetadata.find((row) => row.label === topListener[0]);
    if (metadata?.sourceHint) lines.push(`- top sector:enter listener source: ${metadata.sourceHint}`);
  }
  return lines.join('\n');
}

function formatBloomPhaseSection(phases) {
  const lines = ['', '## Bloom subphases (PQ-129.03)'];
  for (const label of BLOOM_PHASE_LABELS) {
    const stat = phases?.[label];
    lines.push(`- ${label}: samples ${stat?.samples ?? 0}; p95 ${(Number(stat?.p95) || 0).toFixed(1)} ms; avg ${(Number(stat?.avg) || 0).toFixed(1)} ms; max ${(Number(stat?.max) || 0).toFixed(1)} ms`);
  }
  return lines.join('\n');
}

function formatOpeningRenderWorkSection(renderWork) {
  const lines = ['', '## Opening frame render subphases'];
  for (const label of BLOOM_PHASE_LABELS) {
    const stat = renderWork?.[label];
    lines.push(`- ${label}: samples ${stat?.samples ?? 0}; p95 ${(Number(stat?.p95) || 0).toFixed(1)} ms; avg ${(Number(stat?.avg) || 0).toFixed(1)} ms; max ${(Number(stat?.max) || 0).toFixed(1)} ms`);
  }
  return lines.join('\n');
}

function formatSystemTimingSection(systems) {
  const ranked = Object.entries(systems || {})
    .filter(([, stat]) => Number(stat?.samples) > 0)
    .sort((a, b) => (Number(b[1]?.p95) || 0) - (Number(a[1]?.p95) || 0))
    .slice(0, 12);
  const lines = ['', '## Sampled simulation systems'];
  if (!ranked.length) {
    lines.push('- unavailable: the bounded per-system sampler produced no samples');
    return lines.join('\n');
  }
  for (const [name, stat] of ranked) {
    lines.push(`- ${name}: samples ${stat.samples}; p95 ${(Number(stat.p95) || 0).toFixed(2)} ms; avg ${(Number(stat.avg) || 0).toFixed(2)} ms; max ${(Number(stat.max) || 0).toFixed(2)} ms`);
  }
  return lines.join('\n');
}

function formatLoadingReadinessSection(events, samples) {
  const lines = ['', '## Continue loading readiness'];
  if (!events.length) {
    lines.push('- unavailable: no `game:loadingProgress` events were observed');
    return lines.join('\n');
  }
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const next = events[index + 1];
    const durationMs = next ? next.elapsedMs - event.elapsedMs : null;
    lines.push(`- ${(event.elapsedMs / 1000).toFixed(2)} s: ${event.id || 'unknown'}${durationMs == null ? '' : ` (${(durationMs / 1000).toFixed(2)} s until next stage)`}`);
  }
  const last = samples[samples.length - 1];
  if (last) {
    lines.push(
      `- last loading snapshot: stage ${last.stageId || 'unknown'}; player ${last.authored?.playerStatus || 'unknown'}; opening pending ${last.authored?.openingPending ?? 'unknown'}; pipeline pending ${last.authored?.openingPipelinePending ?? 'unknown'}; pipeline admissions ${last.pendingPipelineAdmissions ?? 'unknown'}; GPU admissions ${last.pendingAuthoredGpuResidency ?? 'unknown'}`,
    );
    const exact = last.promiseStates?.exactPipelineWarmupReady?.result;
    if (exact) {
      lines.push(`- captured pipeline receipt: ${exact.capturedCount ?? 'unknown'} completed; ${exact.remainingCount ?? 'unknown'} remaining`);
    }
    const gpu = last.startupGpuResidency;
    if (gpu) {
      lines.push(`- opening GPU receipt: ${gpu.textures ?? 'unknown'} textures (${gpu.uploadMs == null ? 'unknown' : gpu.uploadMs.toFixed(1)} ms blocking upload); opening frame ${gpu.openingFrame?.durationMs == null ? 'unknown' : gpu.openingFrame.durationMs.toFixed(1)} ms; roots ${gpu.openingCompositionRoots ?? 'unknown'} + VFX ${gpu.vfxRoots ?? 'unknown'}`);
    }
    const beforeOpening = [...samples].reverse().find((sample) => sample !== last);
    if (beforeOpening) {
      lines.push(`- opening scene delta: programs ${beforeOpening.programCount ?? 'unknown'} -> ${last.programCount ?? 'unknown'}; geometries ${beforeOpening.geometryCount ?? 'unknown'} -> ${last.geometryCount ?? 'unknown'}; renderer textures ${beforeOpening.rendererTextureCount ?? 'unknown'} -> ${last.rendererTextureCount ?? 'unknown'}`);
    }
  }
  return lines.join('\n');
}

async function installLoadingReadinessWitness(targetPage) {
  await targetPage.evaluate(() => {
    const prior = window.__SF_LOADING_READINESS_WITNESS__;
    if (prior && typeof prior.unsubscribe === 'function') prior.unsubscribe();
    const startedWallMs = Date.now();
    const trace = {
      startedWallMs,
      events: [],
      promiseRefs: {},
      promiseStates: {},
      unsubscribe: null,
    };
    const bus = window.SF?.bus;
    if (bus && typeof bus.on === 'function') {
      trace.unsubscribe = bus.on('game:loadingProgress', (payload = {}) => {
        const wallMs = Date.now();
        trace.events.push({
          wallMs,
          elapsedMs: wallMs - startedWallMs,
          id: String(payload.id || ''),
          progress: Number(payload.progress) || 0,
          label: String(payload.label || ''),
          detail: String(payload.detail || ''),
          transition: String(payload.transition || ''),
        });
      });
    }
    window.__SF_LOADING_READINESS_WITNESS__ = trace;
  });
}

async function armProbeInstrumentation(targetPage) {
  const instrumentation = await targetPage.evaluate(() => {
    const perf = window.SF?.state?.perfRuntime;
    const previousRenderWorkEnabled = perf?.renderWorkEnabled === true;
    const previousHitchAttributionEnabled = perf?.hitchAttributionEnabled === true;
    const previousSystemTimingEnabled = perf?.systemTimingEnabled === true;
    const available = typeof perf?.setRenderWorkEnabled === 'function'
      && typeof perf?.setHitchAttributionEnabled === 'function'
      && typeof perf?.setSystemTimingEnabled === 'function'
      && typeof perf?.reset === 'function'
      && typeof perf?.getHitchHistogram === 'function';
    if (available) {
      perf.reset();
      perf.setRenderWorkEnabled(true);
      perf.setHitchAttributionEnabled(true);
      perf.setSystemTimingEnabled(true);
    }
    return {
      available,
      previousRenderWorkEnabled,
      previousHitchAttributionEnabled,
      previousSystemTimingEnabled,
      renderWorkEnabled: perf?.renderWorkEnabled === true,
      hitchAttributionEnabled: perf?.hitchAttributionEnabled === true,
      systemTimingEnabled: perf?.systemTimingEnabled === true,
    };
  });
  if (instrumentation?.renderWorkEnabled !== true
      || instrumentation?.hitchAttributionEnabled !== true
      || instrumentation?.systemTimingEnabled !== true) {
    throw new Error('Runtime witness could not enable bounded census and hitch attribution');
  }
  return instrumentation;
}

async function installSectorTransitionWitness(targetPage) {
  await targetPage.evaluate(() => {
    const prior = window.__SF_SECTOR_TRANSITION_WITNESS__;
    if (prior && Array.isArray(prior.unsubscribers)) {
      for (const unsubscribe of prior.unsubscribers) {
        if (typeof unsubscribe === 'function') unsubscribe();
      }
    }
    const sf = window.SF;
    const perf = sf?.state?.perfRuntime;
    const trace = {
      armed: false,
      startedPerformanceMs: 0,
      events: [],
      stages: [],
      listenerMetadata: [],
      unsubscribers: [],
      restorers: [],
      capture(label) {
        if (!trace.armed) return;
        const state = sf?.state;
        const now = performance.now();
        trace.events.push({
          label,
          elapsedMs: Math.max(0, now - trace.startedPerformanceMs),
          tick: Number(state?.tick) || 0,
          simTime: Number(state?.simTime) || 0,
          sectorId: String(state?.world?.currentSectorId || ''),
          jumpState: String(state?.jump?.state || ''),
          hitch: typeof perf?.getHitchHistogram === 'function'
            ? perf.getHitchHistogram()
            : null,
          frame: typeof perf?.readFrameSample === 'function'
            ? perf.readFrameSample({})
            : null,
        });
      },
      arm() {
        perf?.reset?.();
        trace.events.length = 0;
        trace.stages.length = 0;
        trace.startedPerformanceMs = performance.now();
        trace.armed = true;
        const world = sf?.registry?.get?.('world');
        for (const methodName of [
          'enterSector',
          '_applyResidencyPlan',
          '_stripSectorFullExtras',
          '_ensureSectorMaterialized',
          '_syncSectorTierContent',
          '_promoteSectorToFull',
          '_demoteSectorToRecordOnly',
          '_placePlayer',
          '_resolveShipModules',
          '_flushPendingSpawns',
        ]) {
          const original = world?.[methodName];
          if (typeof original !== 'function') continue;
          world[methodName] = function timedSectorTransitionMethod(...args) {
            const started = performance.now();
            try {
              return original.apply(this, args);
            } finally {
              trace.stages.push({
                label: `world.${methodName}`,
                durationMs: performance.now() - started,
              });
            }
          };
          trace.restorers.push(() => { world[methodName] = original; });
        }
        const traffic = sf?.registry?.get?.('traffic');
        for (const methodName of [
          '_cleanup',
          '_pruneDead',
          '_retireLegacyCeresTraffic',
          '_materializeCeresActivityCast',
          '_ensureNamedLaneContact',
          '_applyWorldSiteTrafficHooks',
          '_ensureCeresCausalChain',
          '_rebaseCeresCausalPhaseEnds',
        ]) {
          const original = traffic?.[methodName];
          if (typeof original !== 'function') continue;
          traffic[methodName] = function timedTrafficSectorEntryMethod(...args) {
            const started = performance.now();
            try {
              return original.apply(this, args);
            } finally {
              trace.stages.push({
                label: `traffic.${methodName}`,
                durationMs: performance.now() - started,
              });
            }
          };
          trace.restorers.push(() => { traffic[methodName] = original; });
        }
        const originalEmit = bus?.emit;
        if (typeof originalEmit === 'function') {
          const timedEvents = new Set(['sector:exit', 'world:membership', 'sector:enter']);
          bus.emit = function timedSectorTransitionEmit(eventName, ...args) {
            if (!timedEvents.has(eventName)) return originalEmit.call(this, eventName, ...args);
            const started = performance.now();
            try {
              return originalEmit.call(this, eventName, ...args);
            } finally {
              trace.stages.push({
                label: `bus.${eventName}`,
                durationMs: performance.now() - started,
              });
            }
          };
          trace.restorers.push(() => { bus.emit = originalEmit; });
        }
        const listenerMap = bus?._listeners;
        const originalSectorEnterListeners = listenerMap?.get?.('sector:enter');
        if (originalSectorEnterListeners instanceof Set) {
          const wrappedSectorEnterListeners = new Set();
          let listenerIndex = 0;
          for (const listener of originalSectorEnterListeners) {
            const label = `listener.sector:enter[${listenerIndex}] ${listener.name || 'anonymous'}`;
            trace.listenerMetadata.push({
              label,
              sourceHint: String(listener).replace(/\s+/g, ' ').slice(0, 180),
            });
            wrappedSectorEnterListeners.add(function timedSectorEnterListener(...args) {
              const started = performance.now();
              try {
                return listener.apply(this, args);
              } finally {
                trace.stages.push({ label, durationMs: performance.now() - started });
              }
            });
            listenerIndex++;
          }
          listenerMap.set('sector:enter', wrappedSectorEnterListeners);
          trace.restorers.push(() => { listenerMap.set('sector:enter', originalSectorEnterListeners); });
        }
        trace.capture('probe:armed');
      },
      restore() {
        while (trace.restorers.length > 0) trace.restorers.pop()();
        trace.armed = false;
      },
    };
    const bus = sf?.bus;
    if (bus && typeof bus.on === 'function') {
      for (const eventName of [
        'jump:chargeStart',
        'jump:start',
        'sector:exit',
        'sector:enter',
        'jump:arrive',
      ]) {
        trace.unsubscribers.push(bus.on(eventName, () => trace.capture(eventName)));
      }
    }
    window.__SF_SECTOR_TRANSITION_WITNESS__ = trace;
  });
}

async function armSectorTransitionWitness(targetPage) {
  const armed = await targetPage.evaluate(() => {
    const trace = window.__SF_SECTOR_TRANSITION_WITNESS__;
    if (!trace || typeof trace.arm !== 'function') return false;
    trace.arm();
    return trace.armed === true;
  });
  if (!armed) throw new Error('Runtime witness could not arm the sector-transition phase ledger');
}

async function collectSectorTransitionWitness(targetPage) {
  return targetPage.evaluate(() => {
    const trace = window.__SF_SECTOR_TRANSITION_WITNESS__;
    trace?.capture?.('post-entry+1500ms');
    const result = {
      startedPerformanceMs: Number(trace?.startedPerformanceMs) || 0,
      events: Array.isArray(trace?.events) ? trace.events : [],
      stages: Array.isArray(trace?.stages) ? trace.stages : [],
      listenerMetadata: Array.isArray(trace?.listenerMetadata) ? trace.listenerMetadata : [],
    };
    trace?.restore?.();
    return result;
  });
}

function readWitnessInPage() {
  const witness = window.__SF_WITNESS__;
  const s = window.SF?.state;
  let sample = null;
  if (witness && typeof witness.snapshot === 'function') sample = witness.snapshot();
  const d = window.SF?.loop?.getDiagnostics?.() || {};
  const p = s?.entities?.get?.(s.playerId);
  const info = s?.render?.renderer?.info?.render || null;
  const completedInfo = s?.render?.diagnostics?.info || null;
  if (!sample) sample = {
    wallMs: Date.now(),
    mode: s?.mode || null,
    simTime: Number(s?.simTime) || 0,
    tick: Number(s?.tick) || 0,
    timeScale: Number(s?.timeScale) || 0,
    hasPos: !!(p?.pos),
    posX: Number(p?.pos?.x) || 0,
    posZ: Number(p?.pos?.z) || 0,
    speed: p?.vel ? Math.hypot(Number(p.vel.x) || 0, Number(p.vel.z) || 0) : 0,
    lifecycle: window.SF?.loop?.getLifecycleState?.() || d.lifecycleState || null,
    suspended: window.SF?.loop?.isSuspended?.() === true,
    documentHidden: document.hidden === true,
    executedFrames: d.executedFrames || 0,
    renderUpdates: d.renderUpdates || 0,
    rendererFrame: Number(info?.frame),
    rendererFrameObserved: Number.isFinite(Number(info?.frame)),
    drawCalls: Number(completedInfo?.calls) || Number(info?.calls) || 0,
    contextLost: s?.render?.contextLost === true,
    lastFrameError: d.lastFrameError || null,
    frameErrorCount: d.frameErrorCount || 0,
    hitch: false,
    costs: [],
  };
  const loadingTrace = window.__SF_LOADING_READINESS_WITNESS__;
  if (loadingTrace) {
    const render = s?.render || {};
    const summarizeReadinessResult = (value) => {
      if (!value || typeof value !== 'object') return value ?? null;
      return {
        skipped: value.skipped === true,
        reason: value.reason || null,
        watermark: Number.isFinite(value.watermark) ? value.watermark : null,
        capturedCount: Number.isFinite(value.capturedCount) ? value.capturedCount : null,
        remainingCount: Number.isFinite(value.remainingCount) ? value.remainingCount : null,
        textures: Number.isFinite(value.textures) ? value.textures : null,
        uploads: Array.isArray(value.uploads) ? value.uploads.length : null,
        uploadMs: Array.isArray(value.uploads)
          ? value.uploads.reduce((total, upload) => total + (Number(upload?.durationMs) || 0), 0)
          : null,
        openingCompositionRoots: Number.isFinite(value.openingCompositionRoots)
          ? value.openingCompositionRoots
          : null,
        vfxRoots: Number.isFinite(value.vfxRoots) ? value.vfxRoots : null,
        vfxTextures: Number.isFinite(value.vfxTextures) ? value.vfxTextures : null,
        openingFrame: value.openingFrame && typeof value.openingFrame === 'object'
          ? {
              durationMs: Number(value.openingFrame.durationMs) || 0,
              roots: Number(value.openingFrame.roots) || 0,
            }
          : null,
      };
    };
    const promiseNames = [
      'pipelinePrecompileReady',
      'exactPipelineWarmupReady',
      'authoredGpuAdmissionReady',
      'openingGpuResidencyReady',
    ];
    for (const name of promiseNames) {
      const value = render[name];
      if (value && typeof value.then === 'function' && loadingTrace.promiseRefs[name] !== value) {
        loadingTrace.promiseRefs[name] = value;
        loadingTrace.promiseStates[name] = { status: 'pending', observedWallMs: Date.now() };
        Promise.resolve(value).then(
          (result) => {
            loadingTrace.promiseStates[name] = {
              status: 'fulfilled',
              settledWallMs: Date.now(),
              result: summarizeReadinessResult(result),
            };
          },
          (error) => { loadingTrace.promiseStates[name] = { status: 'rejected', settledWallMs: Date.now(), error: String(error) }; },
        );
      }
    }
    let authored = null;
    try { authored = window.SF?.authoredVisualReadiness?.() || null; } catch (_) {}
    const lastProgress = loadingTrace.events[loadingTrace.events.length - 1] || null;
    sample.loadingReadiness = {
      wallMs: Date.now(),
      elapsedMs: Date.now() - loadingTrace.startedWallMs,
      stageId: lastProgress?.id || null,
      authored: authored ? {
        ready: authored.ready === true,
        pipelineReady: authored.pipelineReady === true,
        playerStatus: authored.playerStatus || null,
        startingHubStatus: authored.startingHubStatus || null,
        openingPending: Array.isArray(authored.openingPending) ? authored.openingPending.length : null,
        openingPipelinePending: Array.isArray(authored.openingPipelinePending)
          ? authored.openingPipelinePending.length
          : null,
      } : null,
      pendingPipelineAdmissions: typeof render.pendingPipelineAdmissions === 'function'
        ? render.pendingPipelineAdmissions()
        : null,
      pendingAuthoredGpuResidency: typeof render.pendingAuthoredGpuResidency === 'function'
        ? render.pendingAuthoredGpuResidency()
        : null,
      programCount: Array.isArray(render.renderer?.info?.programs)
        ? render.renderer.info.programs.length
        : null,
      geometryCount: Number.isFinite(render.renderer?.info?.memory?.geometries)
        ? render.renderer.info.memory.geometries
        : null,
      rendererTextureCount: Number.isFinite(render.renderer?.info?.memory?.textures)
        ? render.renderer.info.memory.textures
        : null,
      promiseStates: { ...loadingTrace.promiseStates },
      startupGpuResidency: summarizeReadinessResult(render.startupGpuResidency),
      partLoads: Array.isArray(s?.diagnostics?.partLoads)
        ? s.diagnostics.partLoads.slice(-5).map((entry) => ({
            id: entry?.id ?? entry?.partId ?? null,
            status: entry?.status ?? entry?.state ?? null,
            error: entry?.error ? String(entry.error) : null,
          }))
        : [],
    };
  }
  const table = s?.render?.entityViewSync || null;
  const landmarkCount = Array.isArray(s?.entityList)
    ? s.entityList.reduce((count, entity) => (
      entity
        && entity.alive !== false
        && (entity.type === 'station' || entity.type === 'planet' || entity.type === 'fx')
        ? count + 1
        : count
    ), 0)
    : null;
  const numberOrNull = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  sample.tableCensus = {
    available: !!table
      && Number.isFinite(Number(table.tableGlass))
      && Number.isFinite(Number(table.tableRunway))
      && Number.isFinite(Number(table.tableBeyond)),
    glass: numberOrNull(table?.tableGlass),
    runway: numberOrNull(table?.tableRunway),
    beyond: numberOrNull(table?.tableBeyond),
    submitted: numberOrNull(table?.tableSubmitted),
    resident: numberOrNull(table?.tableResident),
    landmarks: numberOrNull(table?.tableLandmarks ?? landmarkCount),
    glassHalfX: numberOrNull(table?.glassHalfX),
    glassHalfZ: numberOrNull(table?.glassHalfZ),
    runwayWu: numberOrNull(table?.runwayWu),
    renderWorkEnabled: s?.perfRuntime?.renderWorkEnabled === true,
    hitchAttributionEnabled: s?.perfRuntime?.hitchAttributionEnabled === true,
  };
  sample.hitchAttribution = typeof s?.perfRuntime?.getHitchHistogram === 'function'
    ? s.perfRuntime.getHitchHistogram()
    : null;
  return sample;
}

async function captureCanvasFrame(targetPage, shotPath, elapsedMs) {
  await targetPage.locator('#gl-canvas').screenshot({
    path: shotPath,
    type: 'png',
    style: '#ui-root { visibility: hidden !important; }',
  });
  const hash = createHash('sha256').update(await readFile(shotPath)).digest('hex');
  canvasFrames.push({ elapsedMs, path: shotPath, hash });
  return hash;
}

async function dismissCinematic(targetPage) {
  const splash = targetPage.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await targetPage.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }
}

async function waitUntilFlight(targetPage, routeLabel, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await targetPage.evaluate(readWitnessInPage).catch((error) => ({ dumpError: String(error) }));
    if (status.mode === 'flight') {
      if (status.loadingReadiness) loadingReadinessSamples.push(status.loadingReadiness);
      loadingProgressEvents = await targetPage.evaluate(() => (
        window.__SF_LOADING_READINESS_WITNESS__?.events || []
      )).catch(() => []);
      return status;
    }
    if (status.mode === 'loading') {
      if (status.loadingReadiness) loadingReadinessSamples.push(status.loadingReadiness);
      log(`loading stage=${status.loadingReadiness?.stageId || 'unknown'} sim=${status.simTime} frames=${status.executedFrames}`);
    }
    await targetPage.waitForTimeout(1000);
  }
  throw new Error(`${routeLabel} never entered flight`);
}

async function launchUntilFlight(targetPage, timeoutMs = 120_000) {
  await targetPage.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  return waitUntilFlight(targetPage, 'New Game', timeoutMs);
}

function readContinueSaveSnapshot() {
  const dir = resolvePlayerSaveDir(process.env);
  const all = readPlayerStoreKeysSync(dir);
  const pairs = Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith('sf.save.')));
  const slots = Object.keys(pairs)
    .filter((key) => key !== 'sf.save.index')
    .map((key) => key.slice('sf.save.'.length))
    .sort();
  if (slots.length === 0 || !pairs['sf.save.index']) {
    throw new Error(`Continue witness found no indexed player save in ${dir}`);
  }
  return { dir, pairs, slots };
}

async function jumpToCeres(targetPage) {
  await targetPage.keyboard.press('KeyN');
  const map = targetPage.locator('[data-screen="galaxyMap"]').first();
  await map.waitFor({ state: 'visible', timeout: 30_000 });
  await targetPage.keyboard.press('/');
  const search = targetPage.locator('.gm-search-input');
  await search.waitFor({ state: 'visible', timeout: 10_000 });
  await search.fill('Ceres Belt');
  const names = targetPage.locator('.gm-search-item-name');
  await names.first().waitFor({ state: 'visible', timeout: 15_000 });
  const labels = (await names.allTextContents()).map((value) => String(value || '').trim());
  const index = labels.findIndex((label) => label.toLowerCase() === 'ceres belt');
  if (index < 0) throw new Error(`public map search did not expose Ceres Belt: ${labels.join(' | ')}`);
  await targetPage.locator('.gm-search-item').nth(index).click();
  const action = targetPage.locator('#gm-set-course-btn');
  await action.waitFor({ state: 'visible', timeout: 15_000 });
  const actionLabel = String(await action.textContent() || '').replace(/\s+/g, ' ').trim();
  if (actionLabel !== 'Set Course & Jump') {
    throw new Error(`Ceres Belt exposed '${actionLabel}' instead of Set Course & Jump`);
  }
  await action.click();
  await map.waitFor({ state: 'hidden', timeout: 30_000 });
  await targetPage.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    return state?.world?.currentSectorId === 'sector_ceres_belt'
      && state?.jump?.state === 'IDLE'
      && state?.mode === 'flight'
      && player?.alive !== false;
  }, null, { timeout: 180_000 });
}

let app = null;
let childProcess = null;
let page = null;
let launch = null;
let processMonitor = null;
let canonicalUrlTracker = null;
let rootUrl = null;
let primaryError = null;
let cleanupReport = null;
let cleanupError = null;
let gpu = null;
let shadowDiagnostic = null;
let routeInfo = {
  kind: 'new-game',
  label: `New Game seed ${FIXED_SEED}`,
  saveDir: null,
  saveSlots: [],
};

try {
  const { _electron: electron } = await loadPlaywright();
  launch = createIsolatedElectronLaunch({
    root: ROOT,
    taskId: 'runtime-witness',
    timeout: 180_000,
    baseEnv: {
      ...process.env,
      SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1',
    },
  });
  log('launching isolated Electron');
  app = await electron.launch(launch.options);
  childProcess = app.process();
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
  page = await app.firstWindow({ timeout: 180_000 });
  installCspSafePlaywrightPolling(page);
  const urlDeadline = Date.now() + 20_000;
  while (Date.now() < urlDeadline) {
    const liveUrl = page.url();
    if (liveUrl === 'about:blank' || /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(liveUrl)) break;
    await page.waitForTimeout(75);
  }
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  rootUrl = assertIsolatedElectronRootUrl(
    await canonicalUrlTracker.waitForCanonicalRoot(20_000),
  );
  page.on('console', (msg) => {
    const text = msg.text();
    if (
      msg.type() === 'error'
      || /\[loop\]|context lost|frame error|WebGL|GPU/i.test(text)
    ) {
      consoleHits.push(`[console.${msg.type()}] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err && err.stack || err));
  });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000 });
  await dismissCinematic(page);
  gpu = await page.evaluate(() => window.SF?.state?.render?.gpu
    ? { renderer: window.SF.state.render.gpu.renderer, tier: window.SF.state.render.gpu.tier }
    : null);

  let entered;
  if (CONTINUE_ROUTE) {
    const save = readContinueSaveSnapshot();
    routeInfo = {
      kind: 'continue',
      label: `Continue from read-only player save (${save.slots.join(', ')})`,
      saveDir: save.dir,
      saveSlots: save.slots,
    };
    await page.addInitScript((pairs) => {
      try {
        for (const [key, value] of Object.entries(pairs)) localStorage.setItem(key, value);
      } catch (_) {}
    }, save.pairs);
    await page.evaluate((pairs) => {
      for (const [key, value] of Object.entries(pairs)) localStorage.setItem(key, value);
    }, save.pairs);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000 });
    await dismissCinematic(page);
    await installLoadingReadinessWitness(page);
    probeInstrumentation = await armProbeInstrumentation(page);
    log(`continue from read-only player save slots=${save.slots.join(',')}`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 30_000 });
    entered = await waitUntilFlight(page, 'Continue');
  } else {
    log('new game');
    await installLoadingReadinessWitness(page);
    probeInstrumentation = await armProbeInstrumentation(page);
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
    await page.fill('#sf-ng-seed', String(FIXED_SEED));
    entered = await launchUntilFlight(page);
  }
  log(`entered flight ${JSON.stringify({ mode: entered.mode, simTime: entered.simTime })}`);
  openingRenderWork = await page.evaluate(() => (
    window.SF?.state?.perfRuntime?.getReport?.().renderWork || null
  ));
  await page.evaluate(() => window.SF?.state?.perfRuntime?.reset?.());

  if (OPAQUE_BATCH_OFF_DIAGNOSTIC) {
    opaqueBatchDiagnostic = await page.evaluate(() => {
      const renderSystem = window.SF?.registry?.get?.('render');
      if (!renderSystem || typeof renderSystem._opaqueBatchEnabled !== 'boolean') {
        return { applied: false, previous: null };
      }
      const previous = renderSystem._opaqueBatchEnabled;
      renderSystem._opaqueBatchEnabled = false;
      return {
        applied: renderSystem._opaqueBatchEnabled === false,
        previous,
      };
    });
    if (opaqueBatchDiagnostic?.applied !== true) {
      throw new Error('Runtime witness could not apply the isolated opaque-batch-off diagnostic');
    }
    routeInfo.label += ' [diagnostic: opaque batch off]';
    routeInfo.opaqueBatchOffDiagnostic = true;
    log('diagnostic only: live opaque material batching disabled inside isolated profile');
  }

  await page.waitForTimeout(250);

  await page.locator('#gl-canvas').click({ timeout: 10_000 }).catch(() => {});
  if (SECTOR_ENTRY_ROUTE) {
    await installSectorTransitionWitness(page);
    await armSectorTransitionWitness(page);
    log('public sector entry to Ceres Belt with hitch attribution armed');
    await jumpToCeres(page);
    await page.waitForTimeout(1500);
    sectorTransitionTrace = await collectSectorTransitionWitness(page);
    await page.evaluate(() => window.SF?.state?.perfRuntime?.reset?.());
    routeInfo.label += ' -> public Ceres Belt sector entry';
    routeInfo.sectorEntry = 'sector_ceres_belt';
  } else {
    await page.evaluate(() => window.SF.state.perfRuntime.reset());
  }
  if (SHADOWS_OFF_DIAGNOSTIC) {
    shadowDiagnostic = await page.evaluate(() => {
      const sf = window.SF;
      const video = sf?.state?.settings?.video;
      if (!sf?.bus || !video) return { applied: false, previous: null };
      const previous = video.shadows;
      video.shadows = false;
      sf.bus.emit('settings:changed', {
        section: 'video',
        key: 'shadows',
        value: false,
        diagnostic: true,
      });
      return { applied: video.shadows === false, previous };
    });
    if (shadowDiagnostic?.applied !== true) {
      throw new Error('Runtime witness could not apply the isolated shadows-off diagnostic');
    }
    routeInfo.label += ' [diagnostic: shadows off]';
    routeInfo.shadowsOffDiagnostic = true;
    log('diagnostic only: live shadows disabled inside isolated profile');
    await page.waitForTimeout(250);
    await page.evaluate(() => window.SF.state.perfRuntime.reset());
  }
  await page.keyboard.down('KeyW');
  const started = Date.now();
  let shotIndex = 0;
  while (Date.now() - started < SAMPLE_MS) {
    const elapsedMs = Date.now() - started;
    const row = await page.evaluate(readWitnessInPage).catch((error) => ({
      wallMs: Date.now(),
      evaluateError: String(error && error.message || error),
    }));
    row.elapsedMs = elapsedMs;
    snapshots.push(row);
    if (elapsedMs >= shotIndex * (SAMPLE_MS / 2)) {
      const shotPath = path.join(OUT, `t${String(shotIndex).padStart(2, '0')}.png`);
      await captureCanvasFrame(page, shotPath, elapsedMs).catch((err) => log(`screenshot failed: ${err}`));
      shotIndex += 1;
    }
    await page.waitForTimeout(SAMPLE_EVERY_MS);
  }
  const finalPerfReport = await page.evaluate(() => window.SF.state.perfRuntime.getReport());
  finalHitchAttribution = finalPerfReport.hitchAttribution;
  finalRenderWork = finalPerfReport.renderWork;
  finalSystemTiming = finalPerfReport.systems;
  await page.keyboard.up('KeyW').catch(() => {});
  const finalShot = path.join(OUT, 't-final.png');
  await captureCanvasFrame(page, finalShot, Date.now() - started).catch(() => {});
} catch (error) {
  primaryError = error;
  log(`probe failed: ${error && error.stack ? error.stack : error}`);
} finally {
  await page?.keyboard.up('KeyW').catch(() => {});
  if (page && opaqueBatchDiagnostic?.applied === true) {
    const restored = await page.evaluate((previous) => {
      const renderSystem = window.SF?.registry?.get?.('render');
      if (!renderSystem || typeof renderSystem._opaqueBatchEnabled !== 'boolean') return false;
      renderSystem._opaqueBatchEnabled = previous;
      return renderSystem._opaqueBatchEnabled === previous;
    }, opaqueBatchDiagnostic.previous).catch(() => false);
    opaqueBatchDiagnostic.restored = restored === true;
    if (!opaqueBatchDiagnostic.restored && !cleanupError) {
      cleanupError = new Error('Runtime witness failed to restore the opaque batch diagnostic');
    }
  }
  if (page && shadowDiagnostic?.applied === true) {
    const restored = await page.evaluate((previous) => {
      const sf = window.SF;
      const video = sf?.state?.settings?.video;
      if (!sf?.bus || !video) return false;
      video.shadows = previous;
      sf.bus.emit('settings:changed', {
        section: 'video',
        key: 'shadows',
        value: previous,
        diagnostic: true,
      });
      return video.shadows === previous;
    }, shadowDiagnostic.previous).catch(() => false);
    shadowDiagnostic.restored = restored === true;
    if (!shadowDiagnostic.restored && !cleanupError) {
      cleanupError = new Error('Runtime witness failed to restore isolated shadow settings');
    }
  }
  if (page && probeInstrumentation?.available === true) {
    const restoredState = await page.evaluate((previous) => {
      const perf = window.SF?.state?.perfRuntime;
      perf?.setRenderWorkEnabled?.(previous.renderWorkEnabled === true);
      perf?.setHitchAttributionEnabled?.(previous.hitchAttributionEnabled === true);
      perf?.setSystemTimingEnabled?.(previous.systemTimingEnabled === true);
      return {
        renderWorkEnabled: perf?.renderWorkEnabled === true,
        hitchAttributionEnabled: perf?.hitchAttributionEnabled === true,
        systemTimingEnabled: perf?.systemTimingEnabled === true,
      };
    }, {
      renderWorkEnabled: probeInstrumentation.previousRenderWorkEnabled,
      hitchAttributionEnabled: probeInstrumentation.previousHitchAttributionEnabled,
      systemTimingEnabled: probeInstrumentation.previousSystemTimingEnabled,
    }).catch(() => null);
    probeInstrumentation.restored = !!restoredState
      && restoredState.renderWorkEnabled === probeInstrumentation.previousRenderWorkEnabled
      && restoredState.hitchAttributionEnabled === probeInstrumentation.previousHitchAttributionEnabled
      && restoredState.systemTimingEnabled === probeInstrumentation.previousSystemTimingEnabled;
    if (probeInstrumentation.restored !== true && !cleanupError) {
      cleanupError = new Error('Runtime witness failed to restore bounded performance instrumentation');
    }
  }
  if (app) {
    try {
      cleanupReport = await closeOwnedElectronRuntime({
        page,
        electronApp: app,
        childProcess,
        canonicalUrlTracker,
        processMonitor,
        rootUrl,
      });
      if (cleanupReport?.pass !== true) {
        cleanupError = new Error(`Electron cleanup failed: ${(cleanupReport?.failures || []).join('; ')}`);
      }
    } catch (error) {
      cleanupError = error;
    }
  }
  if (launch && typeof launch.cleanup === 'function' && cleanupReport?.pass === true) {
    try { launch.cleanup({ runtimeClosed: true }); } catch (error) { cleanupError = error; }
  }
}

const moving = snapshots.filter((row) => !row.evaluateError);
const canvasHashes = canvasFrames.map((frame) => frame.hash);
const verdict = classifyRuntimeWitness(moving, { canvasHashes });
const tableCensus = summarizeTableCensus(moving);
const firstMoving = moving[0] || null;
const lastMoving = moving[moving.length - 1] || null;
const hitchAttribution = finalHitchAttribution || {
  frames: 0,
  hitches: 0,
  named: 0,
  unknown: 0,
  firstHitches: 0,
  echoHitches: 0,
  longestStreak: 0,
  coverage: 0,
  counts: {},
};
const bloomPhases = Object.fromEntries(BLOOM_PHASE_LABELS.map((label) => [
  label,
  finalRenderWork?.[label] || null,
]));
const route = {
  ...routeInfo,
  opaqueBatchDiagnostic,
  shadowDiagnostic,
  seed: FIXED_SEED,
  sampleMs: SAMPLE_MS,
  sampleEveryMs: SAMPLE_EVERY_MS,
  simDelta: (Number(lastMoving?.simTime) || 0) - (Number(firstMoving?.simTime) || 0),
  executedFrameDelta: (Number(lastMoving?.executedFrames) || 0) - (Number(firstMoving?.executedFrames) || 0),
  instrumentation: probeInstrumentation,
};
const markdown = `${formatRuntimeWitnessReport({
  verdict,
  samples: moving,
  canvasHashes,
  consoleHits,
  pageErrors,
  gpu,
  })}${formatLoadingReadinessSection(loadingProgressEvents, loadingReadinessSamples)}${formatOpeningRenderWorkSection(openingRenderWork)}${formatTableCensusSection(tableCensus, route)}${formatSectorTransitionSection(sectorTransitionTrace)}${formatHitchAttributionSection(hitchAttribution, route)}${formatBloomPhaseSection(bloomPhases)}${formatSystemTimingSection(finalSystemTiming)}\n`;
const report = {
  schema: 'spaceface.runtimeWitness.probe.v1',
  verdict,
  sampleCount: snapshots.length,
  first: snapshots[0] || null,
  last: snapshots[snapshots.length - 1] || null,
  canvasFrames,
  pageErrors,
  consoleHits,
  logs,
  gpu,
  route,
  loadingReadiness: {
    events: loadingProgressEvents,
    samples: loadingReadinessSamples,
  },
  openingRenderWork,
  sectorTransition: sectorTransitionTrace,
  tableCensus,
  hitchAttribution,
  bloomPhases,
  systemTiming: finalSystemTiming,
  error: primaryError ? String(primaryError && primaryError.stack || primaryError) : null,
  cleanupError: cleanupError ? String(cleanupError && cleanupError.stack || cleanupError) : null,
};
await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(OUT, 'report.md'), markdown);
log(markdown);
log(`report ${path.join(OUT, 'report.md')}`);

if (primaryError || cleanupError) process.exitCode = 1;
else if (verdict.ok !== true) process.exitCode = 2;
