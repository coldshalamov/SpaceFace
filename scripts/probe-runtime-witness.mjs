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
const OPENING_FIRST_TOUCH_OWNER_DIAGNOSTIC = process.argv.includes('--opening-first-touch-owner');
const OPENING_EXACT_OWNER_TOUCH_DIAGNOSTIC = process.argv.includes('--opening-exact-owner-touch');
const NO_SUBMIT_DIAGNOSTIC = process.argv.includes('--no-submit-diagnostic');

if (OPENING_FIRST_TOUCH_OWNER_DIAGNOSTIC && OPENING_EXACT_OWNER_TOUCH_DIAGNOSTIC) {
  throw new Error('Opening first-touch owner and exact-owner touch diagnostics are mutually exclusive');
}

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
let openingFirstTouchOwner = null;
let openingExactOwnerTouch = null;
let opaqueBatchDiagnostic = null;
let noSubmitDiagnostic = null;
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

function formatOpeningFirstTouchOwnerSection(diagnostic) {
  const lines = ['', '## Opening first-touch owner'];
  if (!diagnostic || diagnostic.enabled !== true) {
    lines.push('- disabled: pass `--opening-first-touch-owner` to arm the opt-in cold/warm owner capture');
    return lines.join('\n');
  }
  const resourceDeltaText = (delta) => {
    if (!delta) return 'programs ?; geometries ?; textures ?';
    return `programs ${delta.programs ?? '?'}; geometries ${delta.geometries ?? '?'}; textures ${delta.textures ?? '?'}`;
  };
  const runLine = (label, run) => (
    `- ${label}: ${run?.durationMs == null ? 'unknown' : `${Number(run.durationMs).toFixed(2)} ms`}; Δ ${resourceDeltaText(run?.resourceDelta)}; callbacks ${run?.callbackInvocations?.length ?? 0}; paired ${run?.records?.length ?? 0}`
  );
  const rankText = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return 'none';
    return rows.slice(0, 8).map((row) => (
      `${row.key || 'unknown'} ${Number(row.elapsedMs || 0).toFixed(1)} ms/${resourceDeltaText(row.resourceDelta)}`
    )).join(' | ');
  };
  const cohortText = (totals) => {
    const value = (key) => totals?.[key] || {};
    return ['member', 'nonMember', 'unknown']
      .map((key) => `${key === 'nonMember' ? 'non-cohort' : key} ${value(key).invocations ?? 0} / ${Number(value(key).elapsedMs || 0).toFixed(1)} ms / ${resourceDeltaText(value(key).resourceDelta)}`)
      .join('; ');
  };
  lines.push(
    `- status: ${diagnostic.status || 'unknown'}; hook ${diagnostic.hooks?.openingRestored === true ? 'restored' : 'not restored'}; warm hook ${diagnostic.hooks?.warmRestored === true ? 'restored' : 'not restored'}`,
    runLine('cold opening', diagnostic.cold),
    runLine('warm full-scene', diagnostic.warm),
    `- exact-root ranking (cold): ${rankText(diagnostic.cold?.aggregates?.exactRoots)}`,
    `- stable-family ranking (cold): ${rankText(diagnostic.cold?.aggregates?.stableFamilies)}`,
    `- exact-root ranking (warm): ${rankText(diagnostic.warm?.aggregates?.exactRoots)}`,
    `- stable-family ranking (warm): ${rankText(diagnostic.warm?.aggregates?.stableFamilies)}`,
    `- cohort totals (cold): ${cohortText(diagnostic.cold?.aggregates?.cohortTotals)}`,
    `- cohort totals (warm): ${cohortText(diagnostic.warm?.aggregates?.cohortTotals)}`,
    `- renderer-global residual: cold ${resourceDeltaText(diagnostic.cold?.conservation?.rendererGlobalResidual)}; warm ${resourceDeltaText(diagnostic.warm?.conservation?.rendererGlobalResidual)}`,
    `- conservation: cold ${diagnostic.cold?.conservation?.valid === true ? 'pass' : 'fail'}; warm ${diagnostic.warm?.conservation?.valid === true ? 'pass' : 'fail'}; cold-minus-warm ${resourceDeltaText(diagnostic.comparison?.resourceDelta)}`,
    `- capture/restoration/positive-control: ${diagnostic.capture?.cold === true && diagnostic.capture?.warm === true ? 'capture pass' : 'capture fail'} / ${diagnostic.restoration?.valid === true ? 'restoration pass' : 'restoration fail'} / ${diagnostic.positiveControl?.valid === true ? 'positive-control pass' : 'positive-control fail'}`,
  );
  const errors = Array.isArray(diagnostic.errors) ? diagnostic.errors : [];
  if (errors.length > 0) lines.push(`- fail-closed errors: ${errors.slice(0, 4).join(' | ')}`);
  return lines.join('\n');
}

function formatOpeningExactOwnerTouchSection(diagnostic) {
  const lines = ['', '## Opening exact-owner micro-raster'];
  if (!diagnostic || diagnostic.enabled !== true) {
    lines.push('- disabled: pass `--opening-exact-owner-touch` to arm the opt-in four-owner 64x64 cold touch');
    return lines.join('\n');
  }
  const delta = (value) => value
    ? `programs ${value.programs ?? '?'}; geometries ${value.geometries ?? '?'}; textures ${value.textures ?? '?'}`
    : 'programs ?; geometries ?; textures ?';
  lines.push(
    `- status: ${diagnostic.status || 'unknown'}; hooks ${diagnostic.restoration?.hooks === true ? 'restored' : 'not restored'}; render state ${diagnostic.restoration?.renderState === true ? 'restored' : 'not restored'}`,
    `- exact roots: ${(diagnostic.roots || []).map((root) => `${root.role}:${root.name || root.uuid || 'unknown'}`).join(' | ') || 'none'}`,
    `- T_touch: ${diagnostic.touch?.durationMs == null ? 'unknown' : `${Number(diagnostic.touch.durationMs).toFixed(1)} ms`}; delta ${delta(diagnostic.touch?.resourceDelta)}; forced renders ${diagnostic.touch?.renderCalls ?? 0}`,
    `- T_open: ${diagnostic.opening?.durationMs == null ? 'unknown' : `${Number(diagnostic.opening.durationMs).toFixed(1)} ms`}; residual ${delta(diagnostic.opening?.resourceDelta)}; renders ${diagnostic.opening?.renderCalls ?? 0}`,
    `- T_combined: ${diagnostic.combinedMs == null ? 'unknown' : `${Number(diagnostic.combinedMs).toFixed(1)} ms`}; New Game to input-responsive ${diagnostic.inputResponsiveWallMs == null ? 'unknown' : `${Number(diagnostic.inputResponsiveWallMs).toFixed(1)} ms`}`,
    `- total conservation: ${delta(diagnostic.totalResourceDelta)}; ${diagnostic.conservation?.valid === true ? 'pass' : 'fail'} (expected touch +16 programs, opening +2, total +18/+91/+2)`,
    `- positive controls: roots ${diagnostic.positiveControls?.roots === true ? 'pass' : 'fail'}; exact draw ${diagnostic.positiveControls?.touchRender === true ? 'pass' : 'fail'}; opening draw ${diagnostic.positiveControls?.openingRender === true ? 'pass' : 'fail'}; restoration ${diagnostic.positiveControls?.restoration === true ? 'pass' : 'fail'}`,
  );
  const errors = Array.isArray(diagnostic.errors) ? diagnostic.errors : [];
  if (errors.length > 0) lines.push(`- fail-closed errors: ${errors.slice(0, 6).join(' | ')}`);
  return lines.join('\n');
}

function formatNoSubmitDiagnosticSection(diagnostic, hitchAttribution) {
  const lines = ['', '## No-submit scheduler A/B'];
  if (!diagnostic?.applied) {
    lines.push('- disabled: pass `--no-submit-diagnostic` to replace scene submission with a constant clear');
    return lines.join('\n');
  }
  const metric = (value) => `${value?.samples ?? 0} samples; p95 ${Number(value?.p95 || 0).toFixed(1)} ms; max ${Number(value?.max || 0).toFixed(1)} ms`;
  lines.push(
    `- hook restoration: ${diagnostic.restored === true ? 'pass' : 'fail'}`,
    `- rAF callback-entry interval: ${metric(diagnostic.callbackEntryInterval)}`,
    `- callback CPU duration: ${metric(diagnostic.callbackCpu)}`,
    `- constant clear submission: ${metric(diagnostic.drawSubmit)}`,
    `- long tasks: ${diagnostic.longTasks?.count ?? 0}; total ${Number(diagnostic.longTasks?.totalMs || 0).toFixed(1)} ms; max ${Number(diagnostic.longTasks?.maxMs || 0).toFixed(1)} ms`,
    `- externalScheduling hitches: ${hitchAttribution?.counts?.externalScheduling ?? 0}`,
  );
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

async function installOpeningFirstTouchOwnerWitness(targetPage) {
  return targetPage.evaluate(() => {
    const prior = window.__SF_OPENING_FIRST_TOUCH_OWNER__;
    try { prior?.restore?.(); } catch (_) {}

    const sf = window.SF;
    const state = sf?.state;
    const renderSystem = sf?.registry?.get?.('render');
    const trace = {
      enabled: true,
      status: 'installed',
      errors: [],
      hooks: {
        openingInstalled: false,
        openingRestored: false,
        warmInstalled: false,
        warmRestored: false,
      },
      cold: null,
      warm: null,
      currentRun: null,
      renderSystem,
      originalOpening: null,
      openingWrapper: null,
      originalPostRoute: null,
      warmWrapper: null,
      restoreCalled: false,
      nextRunId: 1,
      nextInvocationId: 1,
      nextPairId: 1,
    };
    window.__SF_OPENING_FIRST_TOUCH_OWNER__ = trace;

    const errorText = (error) => String(error?.stack || error?.message || error || 'unknown error');
    const pushError = (error, prefix = '') => {
      const value = `${prefix}${errorText(error)}`;
      trace.errors.push(value);
      return value;
    };
    const finite = (value) => value == null || value === ''
      ? null
      : (Number.isFinite(Number(value)) ? Number(value) : null);
    const cloneDelta = (delta) => delta ? {
      programs: delta.programs,
      geometries: delta.geometries,
      textures: delta.textures,
    } : null;
    const zeroDelta = () => ({ programs: 0, geometries: 0, textures: 0 });
    const addDelta = (left, right) => ({
      programs: Number(left?.programs || 0) + Number(right?.programs || 0),
      geometries: Number(left?.geometries || 0) + Number(right?.geometries || 0),
      textures: Number(left?.textures || 0) + Number(right?.textures || 0),
    });
    const subtractDelta = (left, right) => ({
      programs: Number(left?.programs || 0) - Number(right?.programs || 0),
      geometries: Number(left?.geometries || 0) - Number(right?.geometries || 0),
      textures: Number(left?.textures || 0) - Number(right?.textures || 0),
    });
    const deltaIsFinite = (delta) => !!delta
      && Number.isFinite(delta.programs)
      && Number.isFinite(delta.geometries)
      && Number.isFinite(delta.textures);
    const deltaEqual = (left, right) => deltaIsFinite(left) && deltaIsFinite(right)
      && Math.abs(left.programs - right.programs) < 0.001
      && Math.abs(left.geometries - right.geometries) < 0.001
      && Math.abs(left.textures - right.textures) < 0.001;

    const rendererInfoSnapshot = (renderer) => {
      const info = renderer?.info;
      const memory = info?.memory || {};
      const render = info?.render || {};
      const programs = Array.isArray(info?.programs)
        ? info.programs.length
        : finite(info?.programs);
      const snapshot = {
        available: Number.isFinite(programs)
          && Number.isFinite(finite(memory.geometries))
          && Number.isFinite(finite(memory.textures)),
        programs,
        geometries: finite(memory.geometries),
        textures: finite(memory.textures),
        calls: finite(render.calls),
        triangles: finite(render.triangles),
        points: finite(render.points),
        lines: finite(render.lines),
      };
      return snapshot;
    };
    const resourceDelta = (before, after) => {
      if (!before?.available || !after?.available) return null;
      return {
        programs: after.programs - before.programs,
        geometries: after.geometries - before.geometries,
        textures: after.textures - before.textures,
      };
    };

    const ancestorChain = (object) => {
      const chain = [];
      let current = object;
      let guard = 0;
      while (current && guard++ < 512) {
        chain.push(current);
        current = current.parent;
      }
      return chain;
    };
    const firstScalar = (chain, keys) => {
      for (const object of chain) {
        const userData = object?.userData || {};
        for (const key of keys) {
          const value = userData[key];
          if ((typeof value === 'string' || typeof value === 'number') && String(value) !== '') {
            return String(value);
          }
        }
      }
      return null;
    };
    const nestedScalar = (value, keys) => {
      if (!value || typeof value !== 'object') return null;
      for (const key of keys) {
        const candidate = value[key];
        if ((typeof candidate === 'string' || typeof candidate === 'number') && String(candidate) !== '') {
          return String(candidate);
        }
      }
      return null;
    };
    const entityFor = (object) => {
      const chain = ancestorChain(object);
      const id = firstScalar(chain, [
        'presentationEntityId',
        'entityId',
        'sfEntityId',
        'id',
      ]);
      if (!id) return null;
      let entity = null;
      try { entity = state?.entities?.get?.(id) || state?.entities?.get?.(Number(id)) || null; } catch (_) {}
      return {
        id,
        type: entity?.type || entity?.kind || null,
        defId: entity?.data?.defId || entity?.defId || null,
        role: entity?.data?.role || entity?.role || null,
      };
    };
    const packageFor = (object) => {
      const chain = ancestorChain(object);
      let assetId = null;
      let contentHash = null;
      let source = null;
      let route = null;
      let poolKey = null;
      let direct = false;
      for (const item of chain) {
        const userData = item?.userData || {};
        assetId = assetId || (typeof userData.assetId === 'string' ? userData.assetId : null);
        source = source || (typeof userData.spacefacePartUrl === 'string' ? userData.spacefacePartUrl : null);
        poolKey = poolKey || (typeof userData.spacefaceInstancePoolKey === 'string' ? userData.spacefaceInstancePoolKey : null);
        direct = direct || userData.spacefaceRenderPackageDirect === true;
        const packageData = userData.flightRenderPackage || userData.spacefaceRenderPackage || null;
        if (packageData && typeof packageData === 'object') {
          assetId = assetId || nestedScalar(packageData, ['assetId', 'id', 'key']);
          contentHash = contentHash || nestedScalar(packageData, ['contentHash', 'hash']);
          route = route || nestedScalar(packageData, ['route']);
        }
      }
      const key = contentHash
        ? `hash:${contentHash}`
        : (assetId ? `asset:${assetId}` : (source ? `source:${source}` : (poolKey ? `pool:${poolKey}` : null)));
      return { assetId, contentHash, source, route, poolKey, direct, key };
    };
    const rootFor = (object, scene) => {
      let root = object;
      let guard = 0;
      while (root?.parent && root.parent !== scene && guard++ < 512) root = root.parent;
      return root || scene || object;
    };
    const objectIdentity = (object) => ({
      uuid: object?.uuid || null,
      id: finite(object?.id),
      name: object?.name || null,
      type: object?.type || null,
      visible: object?.visible !== false,
      renderable: !!(object?.isMesh || object?.isSkinnedMesh || object?.isInstancedMesh
        || object?.isBatchedMesh || object?.isPoints || object?.isLine || object?.isSprite),
      assetId: typeof object?.userData?.assetId === 'string' ? object.userData.assetId : null,
      poolKey: typeof object?.userData?.spacefaceInstancePoolKey === 'string'
        ? object.userData.spacefaceInstancePoolKey
        : null,
    });
    const geometryIdentity = (geometry) => geometry ? {
      uuid: geometry.uuid || null,
      id: finite(geometry.id),
      name: geometry.name || null,
      type: geometry.type || null,
      batchKey: geometry.userData?.spacefaceBatchKey || geometry.userData?.spacefacePackageBatchKey || null,
    } : null;
    const textureUuidsFor = (value) => {
      const uuids = new Set();
      const seen = new Set();
      const visit = (candidate, depth) => {
        if (!candidate || typeof candidate !== 'object' || depth > 5 || seen.has(candidate)) return;
        if (candidate.isTexture === true) {
          if (candidate.uuid) uuids.add(String(candidate.uuid));
          return;
        }
        seen.add(candidate);
        if (Array.isArray(candidate)) {
          for (const item of candidate) visit(item, depth + 1);
          return;
        }
        let keys = [];
        try { keys = Object.keys(candidate); } catch (_) { return; }
        for (const key of keys) {
          if (key === 'userData' || key === 'image' || key === 'source' || key === 'data') continue;
          let child = null;
          try { child = candidate[key]; } catch (_) {}
          visit(child, depth + 1);
        }
      };
      visit(value, 0);
      return [...uuids].sort();
    };
    const materialIdentity = (material) => material ? {
      uuid: material.uuid || null,
      id: finite(material.id),
      name: material.name || null,
      type: material.type || null,
      transparent: material.transparent === true,
      depthWrite: material.depthWrite !== false,
      textureUuids: textureUuidsFor(material),
    } : null;
    const materialsFor = (object, callbackMaterial) => {
      const values = [];
      const source = Array.isArray(object?.material) ? object.material : [object?.material];
      for (const material of source) if (material) values.push(material);
      if (callbackMaterial && !values.includes(callbackMaterial)) values.push(callbackMaterial);
      return values.map(materialIdentity).filter(Boolean);
    };
    const cohortFor = (object, root, entity, packageData) => {
      const cohort = state?.render?.openingAdmissionCohort;
      const identities = Array.isArray(cohort?.identities)
        ? cohort.identities.map((value) => String(value))
        : [];
      if (!cohort || cohort.frozen !== true || !Array.isArray(cohort.identities)) {
        return { membership: 'unknown', matched: [], candidates: [] };
      }
      const candidates = new Set();
      for (const item of [object, root]) {
        if (!item) continue;
        if (item.uuid) candidates.add(`uuid:${item.uuid}`);
        if (item.id != null) candidates.add(`id:${item.id}`);
        if (item.name) candidates.add(`name:${item.name}`);
      }
      if (entity?.id) candidates.add(`entity:${entity.id}`);
      if (packageData?.assetId) candidates.add(`asset:${packageData.assetId}`);
      const matched = identities.filter((identity) => candidates.has(identity));
      return {
        membership: matched.length > 0 ? 'member' : 'nonMember',
        matched,
        candidates: [...candidates].sort(),
      };
    };
    const descriptionFor = (object, scene, callbackMaterial) => {
      const rootObject = rootFor(object, scene);
      const entity = entityFor(object) || entityFor(rootObject);
      const packageData = packageFor(object);
      const rootEntity = entityFor(rootObject) || entity;
      const rootPackage = packageFor(rootObject);
      const root = objectIdentity(rootObject);
      root.entityId = rootEntity?.id || null;
      root.assetId = root.assetId || rootPackage?.assetId || null;
      const exactRootKey = rootEntity?.id
        ? `entity:${rootEntity.id}`
        : (rootPackage?.key ? `${rootPackage.key}|root:${root.uuid || root.name || 'unknown'}` : `root:${root.uuid || root.name || 'unknown'}`);
      root.exactKey = exactRootKey;
      root.label = root.name || root.uuid || exactRootKey;
      const packageStable = rootPackage?.contentHash || rootPackage?.source || rootPackage?.poolKey || rootPackage?.direct;
      const stableFamily = packageStable && rootPackage?.key
        ? { key: rootPackage.key, stable: true }
        : (entity?.type && entity?.defId
          ? { key: `entity:${entity.type}:${entity.defId}`, stable: true }
          : { key: null, stable: false });
      const textureUuids = [...new Set([
        ...materialsFor(object, callbackMaterial).flatMap((material) => material.textureUuids || []),
      ])].sort();
      return {
        object: objectIdentity(object),
        geometry: geometryIdentity(object?.geometry),
        materials: materialsFor(object, callbackMaterial),
        root,
        entity,
        package: packageData,
        stableFamily,
        cohort: cohortFor(object, rootObject, entity, packageData),
        textureUuids,
      };
    };
    const precomputeIdentityCache = (object, scene) => {
      const knownMaterials = new Set();
      const ordinaryMaterials = Array.isArray(object?.material) ? object.material : [object?.material];
      for (const material of ordinaryMaterials) if (material) knownMaterials.add(material);
      for (const material of [object?.customDepthMaterial, object?.customDistanceMaterial]) {
        if (material) knownMaterials.add(material);
      }
      const defaultIdentity = descriptionFor(object, scene, null);
      const byMaterial = new Map();
      for (const material of knownMaterials) byMaterial.set(material, descriptionFor(object, scene, material));
      return { defaultIdentity, byMaterial };
    };
    const identityForCallback = (objectRecord, callbackMaterial) => {
      const cache = objectRecord.identityCache;
      const known = callbackMaterial ? cache?.byMaterial?.get(callbackMaterial) : cache?.defaultIdentity;
      const identity = known || cache?.defaultIdentity;
      if (!identity) throw new Error('opening first-touch owner identity cache was unavailable');
      return {
        ...identity,
        materialResolution: known
          ? 'precomputed'
          : (callbackMaterial ? 'conservative-default' : 'precomputed-default'),
      };
    };
    const passFor = (run, callbackName, args) => {
      const renderer = args?.[0] || run.renderer;
      const sceneArg = args?.[1] || null;
      let target = 'screen';
      try {
        const renderTarget = renderer?.getRenderTarget?.();
        if (renderTarget) target = renderTarget.texture?.name || renderTarget.name || 'render-target';
      } catch (_) {}
      return {
        route: run.route,
        callback: callbackName,
        target,
        scene: sceneArg?.uuid === run.sceneUuid ? 'full-scene' : (sceneArg?.name || sceneArg?.type || 'unknown-scene'),
      };
    };

    const isRenderable = (object) => !!object?.isObject3D && !!(
      object.isMesh || object.isSkinnedMesh || object.isInstancedMesh || object.isBatchedMesh
      || object.isPoints || object.isLine || object.isSprite || object.geometry
    );
    const callbackNames = ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow'];
    const callbackKind = (callbackName) => callbackName.includes('Shadow') ? 'shadow' : 'render';
    const callbackIsBefore = (callbackName) => callbackName.startsWith('onBefore');

    const beginCallback = (run, objectRecord, callbackName, args) => {
      const renderer = args?.[0] || run.renderer;
      const callbackMaterial = callbackName.includes('Shadow') ? args?.[5] : args?.[4];
      const identity = identityForCallback(objectRecord, callbackMaterial);
      const entry = {
        id: trace.nextInvocationId++,
        callback: callbackName,
        phase: callbackIsBefore(callbackName) ? 'before' : 'after',
        startedAt: performance.now(),
        before: rendererInfoSnapshot(renderer),
        after: null,
        elapsedMs: null,
        originalCalled: false,
        completed: false,
        error: null,
        pass: { route: run.route, callback: callbackName },
        ...identity,
      };
      run.callbackInvocations.push(entry);
      if (callbackIsBefore(callbackName)) objectRecord.stacks[callbackKind(callbackName)].push(entry);
      return entry;
    };
    const finishCallback = (run, objectRecord, callbackName, args, entry, error = null) => {
      if (!entry) return;
      const renderer = args?.[0] || run.renderer;
      entry.after = rendererInfoSnapshot(renderer);
      entry.elapsedMs = Math.max(0, performance.now() - entry.startedAt);
      entry.resourceDelta = resourceDelta(entry.before, entry.after);
      entry.completed = true;
      if (error) entry.error = errorText(error);
      if (callbackIsBefore(callbackName)) return;
      const stack = objectRecord.stacks[callbackKind(callbackName)];
      const beforeEntry = stack.pop() || null;
      if (!beforeEntry) {
        run.unmatchedAfter++;
        return;
      }
      const pair = {
        id: trace.nextPairId++,
        elapsedMs: Math.max(0, performance.now() - beforeEntry.startedAt),
        beforeInvocationId: beforeEntry.id,
        afterInvocationId: entry.id,
        callback: callbackKind(callbackName),
        pass: entry.pass,
        object: beforeEntry.object,
        geometry: beforeEntry.geometry,
        materials: beforeEntry.materials,
        root: beforeEntry.root,
        entity: beforeEntry.entity,
        package: beforeEntry.package,
        stableFamily: beforeEntry.stableFamily,
        cohort: beforeEntry.cohort,
        textureUuids: [...new Set([...(beforeEntry.textureUuids || []), ...(entry.textureUuids || [])])].sort(),
        before: beforeEntry.before,
        after: entry.after,
        resourceDelta: resourceDelta(beforeEntry.before, entry.after),
        callbackError: beforeEntry.error || entry.error || null,
        complete: beforeEntry.completed === true && entry.completed === true,
      };
      run.records.push(pair);
    };

    const restoreObjectCallbacks = (run) => {
      let valid = true;
      for (const objectRecord of [...run.objectRecords].reverse()) {
        for (const callbackRecord of [...objectRecord.callbacks].reverse()) {
          const { object, name, wrapper, original, hadOwn } = callbackRecord;
          try {
            if (object[name] === wrapper) {
              if (hadOwn) object[name] = original;
              else delete object[name];
            }
            const restored = hadOwn ? object[name] === original : object[name] === original;
            if (!restored) {
              valid = false;
              const message = pushError(`callback restoration mismatch for ${name} on ${object?.uuid || object?.name || 'unknown'}`);
              run.errors.push(message);
            }
          } catch (error) {
            valid = false;
            const message = pushError(error, `callback restoration failed for ${name}: `);
            run.errors.push(message);
          }
        }
        for (const stack of Object.values(objectRecord.stacks)) {
          if (stack.length > 0) {
            run.unmatchedBefore += stack.length;
            stack.length = 0;
          }
        }
      }
      run.callbacksRestored = valid;
      return valid;
    };
    const wrapSceneCallbacks = (run) => {
      const objects = [];
      run.scene.traverse((object) => { if (isRenderable(object)) objects.push(object); });
      run.sceneRenderableCount = objects.length;
      for (const object of objects) {
        const objectRecord = {
          object,
          identityCache: null,
          callbacks: [],
          stacks: { render: [], shadow: [] },
        };
        run.objectRecords.push(objectRecord);
        objectRecord.identityCache = precomputeIdentityCache(object, run.scene);
        for (const name of callbackNames) {
          const original = object[name];
          if (typeof original !== 'function') continue;
          const hadOwn = Object.prototype.hasOwnProperty.call(object, name);
          const callbackRecord = { object, name, original, hadOwn, wrapper: null };
          const wrapper = function wrappedOpeningFirstTouchCallback(...args) {
            let entry = null;
            try {
              entry = beginCallback(run, objectRecord, name, args);
            } catch (error) {
              const message = pushError(error, `callback capture failed for ${name}: `);
              run.errors.push(message);
            }
            if (entry) entry.originalCalled = true;
            try {
              return original.apply(this, args);
            } catch (error) {
              if (entry) entry.error = errorText(error);
              throw error;
            } finally {
              try { finishCallback(run, objectRecord, name, args, entry); } catch (error) {
                const message = pushError(error, `callback finish failed for ${name}: `);
                run.errors.push(message);
              }
            }
          };
          callbackRecord.wrapper = wrapper;
          try {
            object[name] = wrapper;
            if (object[name] !== wrapper) throw new Error(`callback assignment did not stick for ${name}`);
            objectRecord.callbacks.push(callbackRecord);
          } catch (error) {
            const message = pushError(error, `callback installation failed for ${name}: `);
            run.errors.push(message);
          }
        }
      }
      if (run.objectRecords.length === 0 || run.objectRecords.every((record) => record.callbacks.length === 0)) {
        throw new Error('opening first-touch owner found no renderable callbacks to wrap');
      }
    };

    const statFor = (map, key, record) => {
      if (!key) return null;
      let stat = map.get(key);
      if (!stat) {
        stat = {
          key,
          label: record?.root?.label || key,
          invocations: 0,
          elapsedMs: 0,
          resourceDelta: zeroDelta(),
          valid: true,
        };
        map.set(key, stat);
      }
      stat.invocations++;
      stat.elapsedMs += Number(record?.elapsedMs) || 0;
      if (deltaIsFinite(record?.resourceDelta)) stat.resourceDelta = addDelta(stat.resourceDelta, record.resourceDelta);
      else stat.valid = false;
      return stat;
    };
    const plainStats = (map, includeLabel = false) => [...map.values()]
      .sort((left, right) => (right.elapsedMs - left.elapsedMs) || (right.invocations - left.invocations) || left.key.localeCompare(right.key))
      .map((stat) => ({
        key: stat.key,
        ...(includeLabel ? { label: stat.label } : {}),
        invocations: stat.invocations,
        elapsedMs: stat.elapsedMs,
        resourceDelta: cloneDelta(stat.resourceDelta),
        valid: stat.valid,
      }));
    const aggregateRun = (run) => {
      const exactRoots = new Map();
      const stableFamilies = new Map();
      const cohortTotals = new Map([
        ['member', { invocations: 0, elapsedMs: 0, resourceDelta: zeroDelta(), valid: true }],
        ['nonMember', { invocations: 0, elapsedMs: 0, resourceDelta: zeroDelta(), valid: true }],
        ['unknown', { invocations: 0, elapsedMs: 0, resourceDelta: zeroDelta(), valid: true }],
      ]);
      for (const record of run.records) {
        statFor(exactRoots, record.root?.exactKey, record);
        if (record.stableFamily?.stable === true) statFor(stableFamilies, record.stableFamily.key, record);
        const membership = cohortTotals.has(record.cohort?.membership) ? record.cohort.membership : 'unknown';
        const total = cohortTotals.get(membership);
        total.invocations++;
        total.elapsedMs += Number(record.elapsedMs) || 0;
        if (deltaIsFinite(record.resourceDelta)) total.resourceDelta = addDelta(total.resourceDelta, record.resourceDelta);
        else total.valid = false;
      }
      return {
        exactRoots: plainStats(exactRoots, true),
        stableFamilies: plainStats(stableFamilies),
        cohortTotals: Object.fromEntries([...cohortTotals.entries()].map(([key, value]) => [key, {
          invocations: value.invocations,
          elapsedMs: value.elapsedMs,
          resourceDelta: cloneDelta(value.resourceDelta),
          valid: value.valid,
        }])),
      };
    };
    const finalizeRun = (run) => {
      run.afterInfo = run.afterInfo || rendererInfoSnapshot(run.renderer);
      run.resourceDelta = resourceDelta(run.beforeInfo, run.afterInfo);
      const attributed = zeroDelta();
      let attributedValid = true;
      for (const record of run.records) {
        if (deltaIsFinite(record.resourceDelta)) {
          attributed.programs += record.resourceDelta.programs;
          attributed.geometries += record.resourceDelta.geometries;
          attributed.textures += record.resourceDelta.textures;
        } else {
          attributedValid = false;
        }
      }
      const residual = deltaIsFinite(run.resourceDelta) ? subtractDelta(run.resourceDelta, attributed) : null;
      const residualNonNegative = deltaIsFinite(residual)
        && residual.programs >= -0.001
        && residual.geometries >= -0.001
        && residual.textures >= -0.001;
      run.conservation = {
        wholeDelta: cloneDelta(run.resourceDelta),
        attributedInvocationDelta: cloneDelta(attributed),
        rendererGlobalResidual: cloneDelta(residual),
        reconstructedDelta: deltaIsFinite(attributed) && deltaIsFinite(residual)
          ? cloneDelta(addDelta(attributed, residual))
          : null,
        valid: deltaIsFinite(run.resourceDelta)
          && attributedValid
          && deltaIsFinite(residual)
          && residualNonNegative
          && deltaEqual(addDelta(attributed, residual), run.resourceDelta),
      };
      run.aggregates = aggregateRun(run);
      run.valid = run.beforeInfo?.available === true
        && run.afterInfo?.available === true
        && Number.isFinite(run.durationMs)
        && run.callbackInvocations.length > 0
        && run.cohortAvailable === true
        && run.callbackInvocations.every((entry) => entry.completed === true && entry.originalCalled === true)
        && run.callbackInvocations.every((entry) => entry.error == null)
        && run.records.every((record) => record.complete === true && record.callbackError == null && deltaIsFinite(record.resourceDelta))
        && run.unmatchedAfter === 0
        && run.unmatchedBefore === 0
        && run.callbacksRestored === true
        && run.conservation.valid === true
        && run.error == null
        && run.errors.length === 0;
      return run;
    };
    const captureRun = (kind, scene, route, invoke) => {
      const run = {
        id: trace.nextRunId++,
        kind,
        route,
        scene,
        sceneUuid: scene?.uuid || null,
        renderer: renderSystem?.renderer || null,
        beforeInfo: null,
        afterInfo: null,
        resourceDelta: null,
        startedAt: null,
        endedAt: null,
        durationMs: null,
        sceneRenderableCount: 0,
        objectRecords: [],
        callbackInvocations: [],
        records: [],
        errors: [],
        unmatchedBefore: 0,
        unmatchedAfter: 0,
        callbacksRestored: false,
        cohortAvailable: state?.render?.openingAdmissionCohort?.frozen === true
          && Array.isArray(state?.render?.openingAdmissionCohort?.identities),
        error: null,
        valid: false,
      };
      trace.currentRun = run;
      try {
        if (!scene?.traverse) throw new Error(`${kind} capture received no traversable scene`);
        run.beforeInfo = rendererInfoSnapshot(run.renderer);
        wrapSceneCallbacks(run);
      } catch (error) {
        run.errors.push(pushError(error, `${kind} capture setup failed: `));
      }
      run.startedAt = performance.now();
      try {
        return invoke();
      } catch (error) {
        run.error = errorText(error);
        throw error;
      } finally {
        run.endedAt = performance.now();
        run.durationMs = Math.max(0, run.endedAt - run.startedAt);
        try { run.afterInfo = rendererInfoSnapshot(run.renderer); } catch (error) { run.errors.push(pushError(error, `${kind} after-capture failed: `)); }
        try { restoreObjectCallbacks(run); } catch (error) { run.errors.push(pushError(error, `${kind} callback restoration failed: `)); }
        try { finalizeRun(run); } catch (error) {
          run.errors.push(pushError(error, `${kind} finalization failed: `));
          run.valid = false;
        }
        if (kind === 'cold') trace.coldRun = run;
        if (kind === 'warm') trace.warmRun = run;
        trace.currentRun = null;
      }
    };

    const restoreHook = (target, name, original, wrapper) => {
      if (!target || typeof original !== 'function') return false;
      try {
        if (target[name] === wrapper) target[name] = original;
        return target[name] === original;
      } catch (error) {
        pushError(error, `hook restoration failed for ${name}: `);
        return false;
      }
    };
    const installOpeningHook = () => {
      const original = renderSystem?._renderOpeningPostFrame;
      if (typeof original !== 'function') {
        trace.status = 'invalid';
        pushError('render registry did not expose _renderOpeningPostFrame');
        return false;
      }
      trace.originalOpening = original;
      const wrapper = function openingFirstTouchOwnerHook(scene, camera) {
        if (trace.cold?.invocationStarted === true) return original.apply(this, arguments);
        trace.cold = trace.cold || {};
        trace.cold.invocationStarted = true;
        try {
          return captureRun('cold', scene, 'opening-post-frame', () => original.apply(this, arguments));
        } finally {
          trace.hooks.openingRestored = restoreHook(renderSystem, '_renderOpeningPostFrame', original, wrapper);
        }
      };
      trace.openingWrapper = wrapper;
      trace.cold = { invocationStarted: false, completed: false };
      renderSystem._renderOpeningPostFrame = wrapper;
      if (renderSystem._renderOpeningPostFrame !== wrapper) {
        trace.status = 'invalid';
        pushError('opening hook assignment did not stick');
        return false;
      }
      trace.hooks.openingInstalled = true;
      return true;
    };

    trace.armWarm = () => {
      if (trace.status === 'invalid') return trace.snapshot();
      if (trace.warm?.invocationStarted === true) return trace.snapshot();
      if (!trace.coldRun?.kind) {
        trace.status = 'invalid';
        pushError('opening hook did not complete before warm reference arm');
        return trace.snapshot();
      }
      const original = renderSystem?._renderPostRoute;
      if (typeof original !== 'function') {
        trace.status = 'invalid';
        pushError('render registry did not expose _renderPostRoute for warm reference');
        return trace.snapshot();
      }
      trace.originalPostRoute = original;
      const wrapper = function openingFirstTouchOwnerWarmHook(route, scene) {
        if (trace.warm?.invocationStarted === true) return original.apply(this, arguments);
        if (!scene || scene !== renderSystem.scene) return original.apply(this, arguments);
        trace.warm = trace.warm || {};
        trace.warm.invocationStarted = true;
        try {
          return captureRun('warm', scene, `ordinary-full-scene:${String(route || 'unknown')}`, () => original.apply(this, arguments));
        } finally {
          trace.hooks.warmRestored = restoreHook(renderSystem, '_renderPostRoute', original, wrapper);
        }
      };
      trace.warmWrapper = wrapper;
      trace.warm = { invocationStarted: false, completed: false };
      renderSystem._renderPostRoute = wrapper;
      if (renderSystem._renderPostRoute !== wrapper) {
        trace.status = 'invalid';
        pushError('warm route hook assignment did not stick');
        return trace.snapshot();
      }
      trace.hooks.warmInstalled = true;
      return trace.snapshot();
    };

    const serializeRun = (run) => {
      if (!run || !run.kind) return null;
      return {
        id: run.id,
        kind: run.kind,
        route: run.route,
        scene: run.scene ? {
          uuid: run.scene.uuid || null,
          name: run.scene.name || null,
          type: run.scene.type || null,
        } : null,
        beforeInfo: run.beforeInfo,
        afterInfo: run.afterInfo,
        durationMs: run.durationMs,
        resourceDelta: cloneDelta(run.resourceDelta),
        sceneRenderableCount: run.sceneRenderableCount,
        callbackInvocations: run.callbackInvocations,
        records: run.records,
        unmatchedBefore: run.unmatchedBefore,
        unmatchedAfter: run.unmatchedAfter,
        callbacksRestored: run.callbacksRestored,
        cohortAvailable: run.cohortAvailable,
        errors: run.errors,
        error: run.error,
        conservation: run.conservation,
        aggregates: run.aggregates,
        valid: run.valid,
      };
    };
    trace.snapshot = () => {
      const coldRun = trace.coldRun?.kind ? trace.coldRun : null;
      const warmRun = trace.warmRun?.kind ? trace.warmRun : null;
      const capture = {
        cold: !!coldRun,
        warm: !!warmRun,
      };
      const comparison = coldRun && warmRun ? {
        durationMs: coldRun.durationMs - warmRun.durationMs,
        resourceDelta: Number.isFinite(coldRun.durationMs)
          && Number.isFinite(warmRun.durationMs)
          && deltaIsFinite(coldRun.resourceDelta)
          && deltaIsFinite(warmRun.resourceDelta)
          ? subtractDelta(coldRun.resourceDelta, warmRun.resourceDelta)
          : null,
        valid: Number.isFinite(coldRun.durationMs)
          && Number.isFinite(warmRun.durationMs)
          && deltaIsFinite(coldRun.resourceDelta)
          && deltaIsFinite(warmRun.resourceDelta),
      } : null;
      const positiveControl = {
        coldCallbacks: coldRun?.callbackInvocations?.length || 0,
        warmCallbacks: warmRun?.callbackInvocations?.length || 0,
        coldOriginalCalls: coldRun?.callbackInvocations?.filter((entry) => entry.originalCalled === true).length || 0,
        warmOriginalCalls: warmRun?.callbackInvocations?.filter((entry) => entry.originalCalled === true).length || 0,
        valid: !!coldRun && !!warmRun
          && coldRun.callbackInvocations.length > 0
          && warmRun.callbackInvocations.length > 0
          && coldRun.callbackInvocations.every((entry) => entry.originalCalled === true)
          && warmRun.callbackInvocations.every((entry) => entry.originalCalled === true),
      };
      const restoration = {
        openingHook: trace.hooks.openingRestored === true,
        warmHook: trace.hooks.warmRestored === true,
        coldCallbacks: coldRun?.callbacksRestored === true,
        warmCallbacks: warmRun?.callbacksRestored === true,
        valid: trace.restoreCalled === true
          && trace.hooks.openingRestored === true
          && trace.hooks.warmRestored === true
          && coldRun?.callbacksRestored === true
          && warmRun?.callbacksRestored === true,
      };
      const valid = trace.status !== 'invalid'
        && coldRun?.valid === true
        && warmRun?.valid === true
        && comparison?.valid === true
        && positiveControl.valid === true
        && restoration.valid === true;
      return {
        enabled: true,
        status: valid ? 'valid' : 'invalid',
        errors: [...trace.errors],
        hooks: { ...trace.hooks },
        capture,
        restoration,
        positiveControl,
        cold: serializeRun(coldRun),
        warm: serializeRun(warmRun),
        comparison,
      };
    };
    trace.restore = () => {
      trace.restoreCalled = true;
      if (trace.currentRun) {
        try { restoreObjectCallbacks(trace.currentRun); } catch (error) { pushError(error, 'outer callback restoration failed: '); }
      }
      if (trace.originalOpening && trace.openingWrapper) {
        trace.hooks.openingRestored = restoreHook(
          renderSystem,
          '_renderOpeningPostFrame',
          trace.originalOpening,
          trace.openingWrapper,
        );
      } else if (!trace.hooks.openingInstalled) {
        trace.hooks.openingRestored = true;
      }
      if (trace.originalPostRoute && trace.warmWrapper) {
        trace.hooks.warmRestored = restoreHook(
          renderSystem,
          '_renderPostRoute',
          trace.originalPostRoute,
          trace.warmWrapper,
        );
      } else if (!trace.hooks.warmInstalled) {
        trace.hooks.warmRestored = true;
      }
      return trace.snapshot();
    };

    if (!renderSystem) {
      trace.status = 'invalid';
      pushError('window.SF.registry.get(\'render\') returned no RenderSystem');
      trace.hooks.openingRestored = true;
      trace.hooks.warmRestored = true;
      return trace.snapshot();
    }
    if (!installOpeningHook()) {
      trace.hooks.openingRestored = trace.hooks.openingRestored || !trace.hooks.openingInstalled;
    }
    return trace.snapshot();
  });
}

async function armOpeningFirstTouchOwnerWarmReference(targetPage) {
  return targetPage.evaluate(() => window.__SF_OPENING_FIRST_TOUCH_OWNER__?.armWarm?.() || null);
}

async function restoreOpeningFirstTouchOwnerWitness(targetPage) {
  return targetPage.evaluate(() => window.__SF_OPENING_FIRST_TOUCH_OWNER__?.restore?.() || null);
}

async function installOpeningExactOwnerTouchWitness(targetPage) {
  return targetPage.evaluate(() => {
    const prior = window.__SF_OPENING_EXACT_OWNER_TOUCH__;
    try { prior?.restore?.(); } catch (_) {}

    const sf = window.SF;
    const state = sf?.state;
    const renderSystem = sf?.registry?.get?.('render');
    const bloom = renderSystem?.bloom;
    const renderer = renderSystem?.renderer;
    const scene = renderSystem?.scene;
    const camera = state?.render?.camera;
    const EXPECTED_ASSET = 'GLTFKIT_ship_kestrel_deb0ac72';
    const trace = {
      enabled: true,
      status: 'installed',
      startedWallMs: Date.now(),
      inputResponsiveWallMs: null,
      errors: [],
      roots: [],
      touch: null,
      opening: null,
      hooks: {
        prepareInstalled: false,
        prepareRestored: false,
        openingInstalled: false,
        openingRestored: false,
      },
      restoration: { renderState: false, hooks: false },
      originalPrepare: null,
      prepareWrapper: null,
      originalOpening: null,
      openingWrapper: null,
    };
    window.__SF_OPENING_EXACT_OWNER_TOUCH__ = trace;

    const errorText = (error) => String(error?.stack || error?.message || error || 'unknown error');
    const pushError = (error, prefix = '') => {
      const message = `${prefix}${errorText(error)}`;
      trace.errors.push(message);
      trace.status = 'invalid';
      return message;
    };
    const resourceSnapshot = () => ({
      programs: Array.isArray(renderer?.info?.programs) ? renderer.info.programs.length : null,
      geometries: Number.isFinite(Number(renderer?.info?.memory?.geometries))
        ? Number(renderer.info.memory.geometries)
        : null,
      textures: Number.isFinite(Number(renderer?.info?.memory?.textures))
        ? Number(renderer.info.memory.textures)
        : null,
    });
    const resourceDelta = (before, after) => Object.fromEntries(
      ['programs', 'geometries', 'textures'].map((key) => {
        const priorValue = before?.[key];
        const nextValue = after?.[key];
        return [key, Number.isFinite(priorValue) && Number.isFinite(nextValue)
          ? nextValue - priorValue
          : null];
      }),
    );
    const validDelta = (value) => value
      && Number.isFinite(value.programs)
      && Number.isFinite(value.geometries)
      && Number.isFinite(value.textures);
    const vector4 = () => ({
      x: 0, y: 0, z: 0, w: 0,
      copy(value) {
        this.x = Number(value?.x) || 0;
        this.y = Number(value?.y) || 0;
        this.z = Number(value?.z) || 0;
        this.w = Number(value?.w) || 0;
        return this;
      },
      set(x, y, z, w) {
        this.x = Number(x) || 0;
        this.y = Number(y) || 0;
        this.z = Number(z) || 0;
        this.w = Number(w) || 0;
        return this;
      },
    });
    const vector2 = () => ({
      x: 0, y: 0,
      set(x, y) {
        this.x = Number(x) || 0;
        this.y = Number(y) || 0;
        return this;
      },
      floor() {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        return this;
      },
    });
    const sameVector4 = (a, b) => ['x', 'y', 'z', 'w'].every((key) => Number(a?.[key]) === Number(b?.[key]));
    const topLevelRoot = (object) => {
      let root = object;
      let guard = 0;
      while (root?.parent && root.parent !== scene && guard++ < 512) root = root.parent;
      return root?.parent === scene ? root : null;
    };
    const objectContainsAsset = (root) => {
      let found = false;
      root?.traverse?.((object) => {
        if (found) return;
        const userData = object?.userData || {};
        const packageData = userData.flightRenderPackage || userData.spacefaceRenderPackage || {};
        const values = [
          userData.assetId,
          packageData.assetId,
          packageData.id,
          packageData.key,
        ];
        if (values.some((value) => String(value || '') === EXPECTED_ASSET)) found = true;
      });
      return found;
    };
    const uniqueTopLevelNamed = (name) => {
      const matches = (scene?.children || []).filter((child) => child?.name === name);
      if (matches.length !== 1) throw new Error(`expected one top-level ${name}; found ${matches.length}`);
      return matches[0];
    };
    const resolveRoots = () => {
      const playerRoot = state?.render?.meshes?.get?.(state?.playerId) || null;
      if (!playerRoot) throw new Error('current player render boundary was unavailable');
      if (!objectContainsAsset(playerRoot)) throw new Error(`current player boundary did not contain ${EXPECTED_ASSET}`);
      const roots = [
        { role: 'player-kestrel', object: topLevelRoot(playerRoot) || playerRoot },
        { role: 'background', object: uniqueTopLevelNamed('SpaceBackground') },
        { role: 'parallax-far', object: uniqueTopLevelNamed('Parallax_FarDust') },
        { role: 'parallax-mid', object: uniqueTopLevelNamed('Parallax_MidDebris') },
      ];
      if (new Set(roots.map((entry) => entry.object)).size !== roots.length) {
        throw new Error('exact-owner roots were not unique');
      }
      trace.roots = roots.map((entry) => ({
        role: entry.role,
        name: entry.object?.name || null,
        uuid: entry.object?.uuid || null,
      }));
      return roots;
    };
    const restoreHook = (target, name, original, wrapper) => {
      if (!target || typeof original !== 'function') return false;
      try {
        if (target[name] === wrapper) target[name] = original;
        return target[name] === original;
      } catch (error) {
        pushError(error, `failed to restore ${name}: `);
        return false;
      }
    };

    const runTouch = async () => {
      const roots = resolveRoots();
      const keep = new Set(roots.map((entry) => entry.object));
      scene.traverse((object) => {
        if (!object?.isLight) return;
        const lightRoot = topLevelRoot(object);
        const targetRoot = topLevelRoot(object.target);
        if (lightRoot) keep.add(lightRoot);
        if (targetRoot) keep.add(targetRoot);
      });
      const visibility = (scene.children || []).map((object) => ({ object, visible: object.visible }));
      const previousViewport = renderer.getViewport(vector4());
      const previousScissor = renderer.getScissor(vector4());
      const previousScissorTest = renderer.getScissorTest();
      const shadowMap = renderer.shadowMap || null;
      const previousShadowAutoUpdate = shadowMap?.autoUpdate;
      const previousShadowNeedsUpdate = shadowMap?.needsUpdate;
      const previousRender = renderer.render;
      let renderCalls = 0;
      let renderWrapper = null;
      let renderStateRestored = false;
      const before = resourceSnapshot();
      const startedAt = performance.now();
      try {
        for (const entry of visibility) {
          if (!keep.has(entry.object)) entry.object.visible = false;
        }
        const size = renderer.getDrawingBufferSize(vector2());
        const width = Math.max(1, Math.min(64, Math.floor(size.x)));
        const height = Math.max(1, Math.min(64, Math.floor(size.y)));
        const left = Math.max(0, Math.floor((size.x - width) / 2));
        const bottom = Math.max(0, Math.floor((size.y - height) / 2));
        renderer.setScissor(left, bottom, width, height);
        renderer.setScissorTest(true);
        renderWrapper = function openingExactOwnerRender(...args) {
          if (args[0] === scene && args[1] === camera) renderCalls++;
          return previousRender.apply(this, args);
        };
        renderer.render = renderWrapper;
        await bloom.warmScenePipelines(scene, camera, scene);
      } finally {
        if (renderer.render === renderWrapper) renderer.render = previousRender;
        for (const entry of visibility) entry.object.visible = entry.visible;
        renderer.setViewport(previousViewport.x, previousViewport.y, previousViewport.z, previousViewport.w);
        renderer.setScissor(previousScissor.x, previousScissor.y, previousScissor.z, previousScissor.w);
        renderer.setScissorTest(previousScissorTest);
        if (shadowMap) {
          shadowMap.autoUpdate = previousShadowAutoUpdate;
          shadowMap.needsUpdate = previousShadowNeedsUpdate;
        }
        const currentViewport = renderer.getViewport(vector4());
        const currentScissor = renderer.getScissor(vector4());
        renderStateRestored = renderer.render === previousRender
          && visibility.every((entry) => entry.object.visible === entry.visible)
          && sameVector4(previousViewport, currentViewport)
          && sameVector4(previousScissor, currentScissor)
          && renderer.getScissorTest() === previousScissorTest
          && (!shadowMap || (shadowMap.autoUpdate === previousShadowAutoUpdate
            && shadowMap.needsUpdate === previousShadowNeedsUpdate));
        trace.restoration.renderState = renderStateRestored;
      }
      const after = resourceSnapshot();
      trace.touch = {
        durationMs: Math.max(0, performance.now() - startedAt),
        before,
        after,
        resourceDelta: resourceDelta(before, after),
        renderCalls,
      };
      if (renderCalls !== 1) pushError(`exact-owner touch issued ${renderCalls} scene renders; expected 1`);
      if (!renderStateRestored) pushError('exact-owner touch did not restore renderer or scene state');
    };

    if (!renderSystem || !bloom || !renderer || !scene || !camera) {
      pushError('live render system, bloom, renderer, scene, or camera was unavailable');
      return trace;
    }
    if (typeof bloom.prepareResources !== 'function' || typeof bloom.warmScenePipelines !== 'function') {
      pushError('bloom exact-target preparation seam was unavailable');
      return trace;
    }
    if (typeof renderSystem._renderOpeningPostFrame !== 'function') {
      pushError('opening post-frame seam was unavailable');
      return trace;
    }

    trace.originalPrepare = bloom.prepareResources;
    trace.prepareWrapper = async function openingExactOwnerPrepare(...args) {
      try {
        const result = await trace.originalPrepare.apply(this, args);
        try { await runTouch(); } catch (error) { pushError(error, 'exact-owner touch failed: '); }
        return result;
      } finally {
        trace.hooks.prepareRestored = restoreHook(
          bloom,
          'prepareResources',
          trace.originalPrepare,
          trace.prepareWrapper,
        );
      }
    };
    bloom.prepareResources = trace.prepareWrapper;
    trace.hooks.prepareInstalled = bloom.prepareResources === trace.prepareWrapper;

    trace.originalOpening = renderSystem._renderOpeningPostFrame;
    trace.openingWrapper = function openingExactOwnerOpening(sceneArg, cameraArg) {
      const before = resourceSnapshot();
      const previousRender = renderer.render;
      let renderCalls = 0;
      const renderWrapper = function openingExactOwnerOpeningRender(...args) {
        if (args[0] === sceneArg && args[1] === cameraArg) renderCalls++;
        return previousRender.apply(this, args);
      };
      const startedAt = performance.now();
      renderer.render = renderWrapper;
      try {
        return trace.originalOpening.apply(this, arguments);
      } finally {
        if (renderer.render === renderWrapper) renderer.render = previousRender;
        const after = resourceSnapshot();
        trace.opening = {
          durationMs: Math.max(0, performance.now() - startedAt),
          before,
          after,
          resourceDelta: resourceDelta(before, after),
          renderCalls,
        };
        trace.hooks.openingRestored = restoreHook(
          renderSystem,
          '_renderOpeningPostFrame',
          trace.originalOpening,
          trace.openingWrapper,
        );
      }
    };
    renderSystem._renderOpeningPostFrame = trace.openingWrapper;
    trace.hooks.openingInstalled = renderSystem._renderOpeningPostFrame === trace.openingWrapper;
    if (!trace.hooks.prepareInstalled || !trace.hooks.openingInstalled) {
      pushError('exact-owner hooks did not install');
    }

    trace.markInputResponsive = () => {
      trace.inputResponsiveWallMs = Date.now() - trace.startedWallMs;
      return trace.snapshot();
    };
    trace.snapshot = () => {
      const touchDelta = trace.touch?.resourceDelta || null;
      const openingDelta = trace.opening?.resourceDelta || null;
      const totalResourceDelta = trace.touch?.before && trace.opening?.after
        ? resourceDelta(trace.touch.before, trace.opening.after)
        : null;
      const hooksRestored = trace.hooks.prepareRestored === true && trace.hooks.openingRestored === true;
      trace.restoration.hooks = hooksRestored;
      const positiveControls = {
        roots: trace.roots.length === 4 && new Set(trace.roots.map((root) => root.uuid)).size === 4,
        touchRender: trace.touch?.renderCalls === 1,
        openingRender: trace.opening?.renderCalls === 1,
        restoration: trace.restoration.renderState === true && hooksRestored,
      };
      const conservation = {
        expected: { touchPrograms: 16, openingPrograms: 2, programs: 18, geometries: 91, textures: 2 },
        valid: validDelta(touchDelta)
          && validDelta(openingDelta)
          && validDelta(totalResourceDelta)
          && touchDelta.programs === 16
          && openingDelta.programs === 2
          && totalResourceDelta.programs === 18
          && totalResourceDelta.geometries === 91
          && totalResourceDelta.textures === 2,
      };
      const valid = trace.status !== 'invalid'
        && Object.values(positiveControls).every(Boolean)
        && conservation.valid === true
        && Number.isFinite(trace.inputResponsiveWallMs);
      return {
        enabled: true,
        status: valid ? 'valid' : 'invalid',
        errors: [...trace.errors],
        roots: [...trace.roots],
        touch: trace.touch,
        opening: trace.opening,
        combinedMs: Number.isFinite(trace.touch?.durationMs) && Number.isFinite(trace.opening?.durationMs)
          ? trace.touch.durationMs + trace.opening.durationMs
          : null,
        inputResponsiveWallMs: trace.inputResponsiveWallMs,
        totalResourceDelta,
        hooks: { ...trace.hooks },
        restoration: { ...trace.restoration },
        positiveControls,
        conservation,
      };
    };
    trace.restore = () => {
      trace.hooks.prepareRestored = restoreHook(
        bloom,
        'prepareResources',
        trace.originalPrepare,
        trace.prepareWrapper,
      );
      trace.hooks.openingRestored = restoreHook(
        renderSystem,
        '_renderOpeningPostFrame',
        trace.originalOpening,
        trace.openingWrapper,
      );
      return trace.snapshot();
    };
    return trace.snapshot();
  });
}

async function markOpeningExactOwnerInputResponsive(targetPage) {
  return targetPage.evaluate(() => window.__SF_OPENING_EXACT_OWNER_TOUCH__?.markInputResponsive?.() || null);
}

async function restoreOpeningExactOwnerTouchWitness(targetPage) {
  return targetPage.evaluate(() => window.__SF_OPENING_EXACT_OWNER_TOUCH__?.restore?.() || null);
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

async function installNoSubmitDiagnostic(targetPage) {
  return targetPage.evaluate(() => {
    const renderSystem = window.SF?.registry?.get?.('render');
    if (!renderSystem?.renderer
      || typeof renderSystem.drawPreparedFrame !== 'function'
      || typeof renderSystem._renderOpeningPostFrame !== 'function') {
      return { applied: false, reason: 'render-system-unavailable' };
    }
    const trace = {
      callbackIntervals: [],
      callbackCpu: [],
      drawSubmit: [],
      longTasks: [],
      previousDraw: renderSystem.drawPreparedFrame,
      previousOpening: renderSystem._renderOpeningPostFrame,
      previousRaf: window.requestAnimationFrame,
      observer: null,
    };
    let lastCallbackAt = null;
    window.requestAnimationFrame = function noSubmitMeasuredRaf(callback) {
      return trace.previousRaf.call(window, (timestamp) => {
        const enteredAt = performance.now();
        if (lastCallbackAt !== null) trace.callbackIntervals.push(enteredAt - lastCallbackAt);
        lastCallbackAt = enteredAt;
        try {
          return callback(timestamp);
        } finally {
          trace.callbackCpu.push(performance.now() - enteredAt);
        }
      });
    };
    const constantSubmit = function constantSubmit() {
      const startedAt = performance.now();
      this.renderer.setRenderTarget(null);
      this.renderer.clear(true, true, true);
      trace.drawSubmit.push(performance.now() - startedAt);
      if (this.state?.mode === 'flight' && !Number.isFinite(this.state?.render?.firstPlayableFrameAt)) {
        this.state.render.firstPlayableFrameAt = performance.now();
      }
      return true;
    };
    renderSystem.drawPreparedFrame = constantSubmit;
    renderSystem._renderOpeningPostFrame = constantSubmit;
    try {
      trace.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          trace.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
      });
      trace.observer.observe({ entryTypes: ['longtask'] });
    } catch (_) {
      trace.observer = null;
    }
    window.__SF_NO_SUBMIT_DIAGNOSTIC__ = trace;
    return { applied: true };
  });
}

async function restoreNoSubmitDiagnostic(targetPage) {
  return targetPage.evaluate(() => {
    const trace = window.__SF_NO_SUBMIT_DIAGNOSTIC__;
    const renderSystem = window.SF?.registry?.get?.('render');
    if (!trace || !renderSystem) return { applied: false, restored: false };
    const summarize = (values) => {
      const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
      const at = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0;
      return {
        samples: sorted.length,
        p95: at(0.95),
        max: sorted.length ? sorted[sorted.length - 1] : 0,
      };
    };
    renderSystem.drawPreparedFrame = trace.previousDraw;
    renderSystem._renderOpeningPostFrame = trace.previousOpening;
    window.requestAnimationFrame = trace.previousRaf;
    try { trace.observer?.disconnect?.(); } catch (_) {}
    const restored = renderSystem.drawPreparedFrame === trace.previousDraw
      && renderSystem._renderOpeningPostFrame === trace.previousOpening
      && window.requestAnimationFrame === trace.previousRaf;
    const result = {
      applied: true,
      restored,
      callbackEntryInterval: summarize(trace.callbackIntervals),
      callbackCpu: summarize(trace.callbackCpu),
      drawSubmit: summarize(trace.drawSubmit),
      longTasks: {
        count: trace.longTasks.length,
        totalMs: trace.longTasks.reduce((sum, entry) => sum + Number(entry.duration || 0), 0),
        maxMs: trace.longTasks.reduce((max, entry) => Math.max(max, Number(entry.duration || 0)), 0),
      },
    };
    delete window.__SF_NO_SUBMIT_DIAGNOSTIC__;
    return result;
  });
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
    if (OPENING_FIRST_TOUCH_OWNER_DIAGNOSTIC) {
      openingFirstTouchOwner = await installOpeningFirstTouchOwnerWitness(page);
      if (openingFirstTouchOwner?.hooks?.openingInstalled !== true) {
        throw new Error('Opening first-touch owner diagnostic could not install before Continue');
      }
    }
    if (OPENING_EXACT_OWNER_TOUCH_DIAGNOSTIC) {
      openingExactOwnerTouch = await installOpeningExactOwnerTouchWitness(page);
      if (openingExactOwnerTouch?.hooks?.prepareInstalled !== true
        || openingExactOwnerTouch?.hooks?.openingInstalled !== true) {
        throw new Error('Opening exact-owner touch diagnostic could not install before Continue');
      }
    }
    probeInstrumentation = await armProbeInstrumentation(page);
    if (NO_SUBMIT_DIAGNOSTIC) {
      noSubmitDiagnostic = await installNoSubmitDiagnostic(page);
      if (noSubmitDiagnostic?.applied !== true) throw new Error('No-submit diagnostic could not install before Continue');
      routeInfo.label += ' [diagnostic: no scene submit]';
    }
    log(`continue from read-only player save slots=${save.slots.join(',')}`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 30_000 });
    entered = await waitUntilFlight(page, 'Continue');
  } else {
    log('new game');
    await installLoadingReadinessWitness(page);
    if (OPENING_FIRST_TOUCH_OWNER_DIAGNOSTIC) {
      openingFirstTouchOwner = await installOpeningFirstTouchOwnerWitness(page);
      if (openingFirstTouchOwner?.hooks?.openingInstalled !== true) {
        throw new Error('Opening first-touch owner diagnostic could not install before New Game');
      }
    }
    if (OPENING_EXACT_OWNER_TOUCH_DIAGNOSTIC) {
      openingExactOwnerTouch = await installOpeningExactOwnerTouchWitness(page);
      if (openingExactOwnerTouch?.hooks?.prepareInstalled !== true
        || openingExactOwnerTouch?.hooks?.openingInstalled !== true) {
        throw new Error('Opening exact-owner touch diagnostic could not install before New Game');
      }
    }
    probeInstrumentation = await armProbeInstrumentation(page);
    if (NO_SUBMIT_DIAGNOSTIC) {
      noSubmitDiagnostic = await installNoSubmitDiagnostic(page);
      if (noSubmitDiagnostic?.applied !== true) throw new Error('No-submit diagnostic could not install before New Game');
      routeInfo.label += ' [diagnostic: no scene submit]';
    }
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
  let openingInputBaseline = null;
  if (OPENING_FIRST_TOUCH_OWNER_DIAGNOSTIC || OPENING_EXACT_OWNER_TOUCH_DIAGNOSTIC) {
    await page.bringToFront();
    await page.locator('#gl-canvas').click({ timeout: 10_000 });
    openingInputBaseline = await page.evaluate(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state?.playerId);
      const diagnostics = window.SF?.loop?.getDiagnostics?.() || {};
      return {
        mode: state?.mode || null,
        executedFrames: Number(diagnostics.executedFrames) || 0,
        posX: Number(player?.pos?.x) || 0,
        posZ: Number(player?.pos?.z) || 0,
        speed: player?.vel ? Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0) : 0,
      };
    });
  }
  await page.keyboard.down('KeyW');
  if (OPENING_FIRST_TOUCH_OWNER_DIAGNOSTIC || OPENING_EXACT_OWNER_TOUCH_DIAGNOSTIC) {
    const inputResponded = await page.waitForFunction((baseline) => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state?.playerId);
      const diagnostics = window.SF?.loop?.getDiagnostics?.() || {};
      if (state?.mode !== 'flight') return false;
      const executedFrames = Number(diagnostics.executedFrames) || 0;
      const posX = Number(player?.pos?.x) || 0;
      const posZ = Number(player?.pos?.z) || 0;
      const speed = player?.vel ? Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0) : 0;
      const acceptedInput = Number(state?.input?.moveZ) > 0.05 || Number(state?.input?.throttle) > 0.05;
      const moved = Math.hypot(posX - Number(baseline?.posX || 0), posZ - Number(baseline?.posZ || 0)) > 0.25;
      const accelerated = speed > Number(baseline?.speed || 0) + 0.05;
      return executedFrames > Number(baseline?.executedFrames || 0) + 2
        && (acceptedInput || moved || accelerated);
    }, openingInputBaseline, { timeout: 30_000 }).then(() => true).catch(() => false);
    if (!inputResponded) throw new Error('Opening diagnostic saw no observable public KeyW flight response');
    if (OPENING_EXACT_OWNER_TOUCH_DIAGNOSTIC) {
      openingExactOwnerTouch = await markOpeningExactOwnerInputResponsive(page);
    }
    if (OPENING_FIRST_TOUCH_OWNER_DIAGNOSTIC) {
      const warmArmed = await armOpeningFirstTouchOwnerWarmReference(page);
      if (warmArmed?.hooks?.warmInstalled !== true) {
        throw new Error('Opening first-touch owner diagnostic could not arm its warm full-scene route after input response');
      }
      await page.waitForFunction(() => (
        window.__SF_OPENING_FIRST_TOUCH_OWNER__?.warmRun?.kind === 'warm'
      ), null, { timeout: 30_000 });
    }
  }
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
  if (page && OPENING_FIRST_TOUCH_OWNER_DIAGNOSTIC) {
    const restored = await restoreOpeningFirstTouchOwnerWitness(page).catch(() => null);
    if (restored) openingFirstTouchOwner = restored;
    if (!openingFirstTouchOwner) {
      openingFirstTouchOwner = {
        enabled: true,
        status: 'invalid',
        errors: ['opening first-touch owner trace was unavailable during cleanup'],
        restoration: { valid: false },
      };
    }
    if (openingFirstTouchOwner?.status !== 'valid' && !primaryError && !cleanupError) {
      cleanupError = new Error('Opening first-touch owner diagnostic failed closed: capture, conservation, or restoration invalid');
    }
  }
  if (page && OPENING_EXACT_OWNER_TOUCH_DIAGNOSTIC) {
    const restored = await restoreOpeningExactOwnerTouchWitness(page).catch(() => null);
    if (restored) openingExactOwnerTouch = restored;
    if (!openingExactOwnerTouch) {
      openingExactOwnerTouch = {
        enabled: true,
        status: 'invalid',
        errors: ['opening exact-owner touch trace was unavailable during cleanup'],
        restoration: { hooks: false, renderState: false },
      };
    }
    if (openingExactOwnerTouch?.status !== 'valid' && !primaryError && !cleanupError) {
      cleanupError = new Error('Opening exact-owner touch diagnostic failed closed: owner split, conservation, or restoration invalid');
    }
  }
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
  if (page && NO_SUBMIT_DIAGNOSTIC && noSubmitDiagnostic?.applied === true) {
    const restored = await restoreNoSubmitDiagnostic(page).catch(() => null);
    noSubmitDiagnostic = restored || { applied: true, restored: false };
    if (noSubmitDiagnostic.restored !== true && !cleanupError) {
      cleanupError = new Error('Runtime witness failed to restore the no-submit diagnostic');
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
const runtimeVerdict = classifyRuntimeWitness(moving, { canvasHashes });
const openingFirstTouchOwnerInvalid = OPENING_FIRST_TOUCH_OWNER_DIAGNOSTIC
  && openingFirstTouchOwner?.status !== 'valid';
const openingExactOwnerTouchInvalid = OPENING_EXACT_OWNER_TOUCH_DIAGNOSTIC
  && openingExactOwnerTouch?.status !== 'valid';
const diagnosticInvalidity = {};
if (openingFirstTouchOwnerInvalid) {
  diagnosticInvalidity.openingFirstTouchOwner = {
    status: openingFirstTouchOwner?.status || 'missing',
    expected: 'valid',
    reason: 'opening-first-touch-owner-invalid',
  };
}
if (openingExactOwnerTouchInvalid) {
  diagnosticInvalidity.openingExactOwnerTouch = {
    status: openingExactOwnerTouch?.status || 'missing',
    expected: 'valid',
    reason: 'opening-exact-owner-touch-invalid',
  };
}
const verdict = (openingFirstTouchOwnerInvalid || openingExactOwnerTouchInvalid)
  ? {
      ...runtimeVerdict,
      ok: false,
      diagnosticInvalidity,
    }
  : runtimeVerdict;
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
  noSubmitDiagnostic,
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
  })}${formatLoadingReadinessSection(loadingProgressEvents, loadingReadinessSamples)}${formatOpeningRenderWorkSection(openingRenderWork)}${formatOpeningFirstTouchOwnerSection(openingFirstTouchOwner)}${formatOpeningExactOwnerTouchSection(openingExactOwnerTouch)}${formatNoSubmitDiagnosticSection(noSubmitDiagnostic, hitchAttribution)}${formatTableCensusSection(tableCensus, route)}${formatSectorTransitionSection(sectorTransitionTrace)}${formatHitchAttributionSection(hitchAttribution, route)}${formatBloomPhaseSection(bloomPhases)}${formatSystemTimingSection(finalSystemTiming)}\n`;
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
  openingFirstTouchOwner,
  openingExactOwnerTouch,
  noSubmitDiagnostic,
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
