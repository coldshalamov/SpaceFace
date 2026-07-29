#!/usr/bin/env node
// Lead-5 heap verification probe (throwaway evidence probe).
//
// WHAT THIS EXISTS TO SETTLE
// -------------------------
// design/program/roadmap/MAKE_THE_GAME_FAST.md "Lead 5" records the FIRST heap measurement ever
// taken on this game: performance.memory sampled 1499 times across one probe run, the JS heap grew
// ~2.15 GB monotonically to ~2.19 GB, and ZERO collections were observed. That is a leak signature
// on its face — but it was measured with one instrument (Chrome's quantised performance.memory),
// once, with no positive control. Two things make that number unsafe to act on as-is:
//
//   1. performance.memory is QUANTISED to bucket boundaries, so a small GC that does not cross a
//      bucket is invisible — "0 collections" can be a quantisation artifact, not a real absence.
//   2. V8 on a large-RAM machine is LAZY about GC: it will let the heap grow far above the live set
//      before collecting, because it can. A heap that LOOKS like it leaks may simply be a heap that
//      V8 has not bothered to collect yet. The disambiguator is a FORCED full GC: if the growth
//      vanishes, it was lazy GC; if it stays, it is real retention.
//
// This probe answers three questions with numbers and a positive control:
//   (a) does the heap grow monotonically during idle flight, and at what MB/min?
//   (b) does forced GC reclaim that growth (lazy GC) or leave it (retention/leak)?
//   (c) do natural collections ever appear in the samples?
//
// It uses TWO instruments on the same page so they cross-validate:
//   - CDP Runtime.getHeapUsage  — V8's precise, UNquantised live heap (the growth signal).
//   - performance.memory         — the quantised instrument Lead 5 used (for direct comparison).
// A drop between two 500 ms samples in Runtime.getHeapUsage can only mean a GC occurred in that
// interval (without GC, live heap never shrinks). So the unquantised instrument also answers (c),
// and a disagreement with the quantised instrument IS the quantisation explanation for Lead 5.
//
// POSITIVE CONTROL (required before any verdict)
// ----------------------------------------------
// A heap instrument has the same silent-failure mode as every zero-budget counter: a dead sampler
// and a stable heap both report "no change". This probe therefore refuses to state a verdict unless
// it can first demonstrate the sampler is ALIVE: consecutive Runtime.getHeapUsage readings must show
// nonzero deltas, and the sim tick must advance. Two identical flat readings prove the sampler is
// dead, not that the heap is stable.
//
// This is a throwaway diagnostic. It writes only to the ignored artifact tree (.devshots) and to a
// single report under design/perf. It changes zero production files.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = parseArgs(process.argv.slice(2));

const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const INTERVAL_MS = Number(argv.interval || 500);
const PHASE_MS = Number(argv['phase-ms'] || 120_000);     // ~2 min of idle flight per phase
const SETTLE_MS = Number(argv['settle-ms'] || 5_000);     // let post-boot queues drain, no GC
const POST_GC_SETTLE_MS = Number(argv['post-gc-settle-ms'] || 250);
const HEADED = !!(argv.headed || argv.headless === 'false');
const LAUNCH_ATTEMPTS = 3;
const OUT = argv.out || '.devshots/perf/heap-verify.json';
const REPORT = argv.report || 'design/perf/lead5-heap-verify-REPORT.md';
const B_TO_MB = 1_000_000;        // decimal MB, matching Lead 5's ~2.19 GB framing (bytes/1e9)
const NATURAL_COLLECTION_FLOOR_MB = 1; // a drop > this between samples counts as a "significant" GC

// Per-sample and per-event accumulators live in the outer scope so that a crash mid-run still yields
// honest partial evidence in the output files.
const samples = [];
const events = [];
const pageErrors = [];
let environment = null;

let server = null;
let browser = null;
let context = null;
let exitCode = 0;
let stage = 'startup';
let diagnosticPage = null;

function enterStage(next) {
  stage = next;
  console.log(`[heap-verify] stage: ${next}`);
}

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const { chromium } = await loadPlaywright();

  browser = await launchWithRetry(chromium, LAUNCH_ATTEMPTS);
  context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) => { pageErrors.push(String(error?.message || error)); });
  diagnosticPage = page;

  // Skip the cinematic so boot reaches the menu deterministically. We deliberately do NOT arm the
  // production perf-counters seam here: that instrumentation allocates per frame and would perturb
  // the very heap we are measuring. We want the unmodified game's allocation behaviour.
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* private mode */ }
  });

  enterStage('navigate');
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await bootToFlight(page);

  // One CDP session serves the whole run. Both domains are idempotent to enable.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('HeapProfiler.enable');

  // Capture the exact shape of Runtime.getHeapUsage once, up front, so the normaliser below cannot
  // silently misread a field name and emit a vacuous zero. Printed to the log for transparency.
  const probeUsage = await cdp.send('Runtime.getHeapUsage');
  console.log(`[heap-verify] Runtime.getHeapUsage raw shape: ${JSON.stringify(probeUsage)}`);

  environment = await readEnvironment(page);

  // --- Settle: let post-boot work drain, but do NOT force GC. Phase 1 must measure the natural
  // post-boot heap evolution, exactly as Lead 5's first capture did. -------------------------
  enterStage('settle');
  events.push({ kind: 'settleStart', tMs: 0, ms: SETTLE_MS });
  await sleep(SETTLE_MS);

  // --- Phase 1: idle flight, natural GC only ------------------------------------------------
  enterStage('phase1-idle');
  const t0 = Date.now();
  await sampleFor(cdp, page, t0, PHASE_MS, 'phase1');
  const beforeGc1 = lastSample('phase1');
  events.push({ kind: 'phaseEnd', phase: 'phase1', tMs: beforeGc1?.tMs });

  // --- Forced GC #1 --------------------------------------------------------------------------
  enterStage('force-gc-1');
  const pre1 = await readHeap(cdp, page, t0, 'preGc1');
  await forceFullGc(cdp);
  await sleep(POST_GC_SETTLE_MS);
  const post1 = await readHeap(cdp, page, t0, 'postGc1');
  events.push({ kind: 'forcedGc', tag: 'gc1', pre: pre1, post: post1 });
  samples.push({ ...post1, phase: 'postGc1', forcedGc: true });

  // --- Phase 2: idle flight again, measured from the post-GC floor --------------------------
  enterStage('phase2-idle');
  const t1 = Date.now();
  await sampleFor(cdp, page, t1, PHASE_MS, 'phase2');
  const beforeGc2 = lastSample('phase2');
  events.push({ kind: 'phaseEnd', phase: 'phase2', tMs: beforeGc2?.tMs });

  // --- Forced GC #2 --------------------------------------------------------------------------
  enterStage('force-gc-2');
  const pre2 = await readHeap(cdp, page, t1, 'preGc2');
  await forceFullGc(cdp);
  await sleep(POST_GC_SETTLE_MS);
  const post2 = await readHeap(cdp, page, t1, 'postGc2');
  events.push({ kind: 'forcedGc', tag: 'gc2', pre: pre2, post: post2 });
  samples.push({ ...post2, phase: 'postGc2', forcedGc: true });

  // --- Final sample --------------------------------------------------------------------------
  enterStage('final');
  const finalSample = await readHeap(cdp, page, Date.now(), 'final');
  samples.push({ ...finalSample, phase: 'final' });

  const report = buildReport({ samples, events, environment, pageErrors, config: {
    intervalMs: INTERVAL_MS, phaseMs: PHASE_MS, settleMs: SETTLE_MS, postGcSettleMs: POST_GC_SETTLE_MS,
    headed: HEADED, viewport: VIEWPORT, naturalCollectionFloorMb: NATURAL_COLLECTION_FLOOR_MB,
    rtUsageShape: probeUsage,
  } });

  await writeOutputs(report);

  console.log('');
  console.log(`[heap-verify] environment: ${environment.unmaskedRenderer || '(masked)'} tier=${environment.gpuTier || '?'} software=${environment.software} heapLimitGB=${(environment.heapLimitBytes / 1e9).toFixed(2)}`);
  console.log(`[heap-verify] positive control: samplerAlive=${report.positiveControl.samplerAlive} gameAlive=${report.positiveControl.gameAlive} movingDeltas=${report.positiveControl.movingDeltaCount}/${report.positiveControl.totalDeltas}`);
  const p1 = report.phases.phase1.analysis;
  console.log(`[heap-verify] (a) phase1 growth: ${p1.startMB.toFixed(1)} -> ${p1.endMB.toFixed(1)} MB over ${p1.durationMin.toFixed(2)} min = ${p1.rateMBperMin.toFixed(1)} MB/min (slope ${p1.slopeMBperMin.toFixed(1)}); monotone? increases=${p1.increases} decreases=${p1.decreases} flats=${p1.flats}`);
  for (const gc of report.forcedGc) {
    console.log(`[heap-verify] (b) ${gc.tag}: ${gc.preMB.toFixed(1)} -> ${gc.postMB.toFixed(1)} MB, reclaimed ${gc.reclaimedMB.toFixed(1)} MB, reclaimOfGrowth=${gc.reclaimOfGrowth == null ? 'n/a' : (gc.reclaimOfGrowth * 100).toFixed(0) + '%'}`);
  }
  console.log(`[heap-verify] (c) natural collections in Runtime.getHeapUsage: ${p1.naturalCollectionCount} intervals (${p1.significantDropCount} > ${NATURAL_COLLECTION_FLOOR_MB}MB); in performance.memory: ${p1.perfMemDecreaseCount}`);
  console.log(`[heap-verify] VERDICT: ${report.verdict.classification}`);
  console.log(`[heap-verify] evidence: ${OUT}`);
  console.log(`[heap-verify] report:   ${REPORT}`);
} catch (error) {
  exitCode = 1;
  console.error(`[heap-verify] FAIL during stage "${stage}": ${error?.stack || error?.message || error}`);
  if (pageErrors.length) console.error(`[heap-verify] page errors:\n${pageErrors.join('\n')}`);
  // Still emit honest partial evidence: whatever samples/events were collected, plus the block.
  const partial = buildReport({ samples, events, environment, pageErrors, config: {
    intervalMs: INTERVAL_MS, phaseMs: PHASE_MS, settleMs: SETTLE_MS, postGcSettleMs: POST_GC_SETTLE_MS,
    headed: HEADED, viewport: VIEWPORT, naturalCollectionFloorMb: NATURAL_COLLECTION_FLOOR_MB,
  }, fatalError: { stage, message: String(error?.message || error) } });
  try { await writeOutputs(partial); } catch (writeErr) { console.error(`[heap-verify] could not write outputs: ${writeErr}`); }
  if (diagnosticPage) {
    const snapshot = await diagnosticPage.evaluate(() => {
      const state = window.SF?.state || null;
      return {
        hasSF: !!window.SF,
        mode: state?.mode ?? null,
        playerId: state?.playerId ?? null,
        tick: Number(state?.tick ?? -1),
        perfMemory: typeof performance !== 'undefined' && performance.memory
          ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
          : null,
      };
    }).catch((e) => ({ dumpFailed: String(e?.message || e) }));
    console.error(`[heap-verify] page snapshot: ${JSON.stringify(snapshot, null, 2)}`);
  }
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server?.close?.().catch(() => {});
}

process.exit(exitCode);

// --- sampling ---------------------------------------------------------------------------------

async function sampleFor(cdp, page, t0Ms, durationMs, phase) {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    const reading = await readHeap(cdp, page, t0Ms, phase);
    samples.push(reading);
    // Sleep a fixed interval; the actual elapsed time is recorded per sample, so the rate math never
    // assumes a perfect 500 ms tick (real cadence = INTERVAL_MS + round-trip time).
    await sleep(INTERVAL_MS);
  }
}

async function readHeap(cdp, page, t0Ms, phase) {
  // Runtime.getHeapUsage first: it is the unquantised growth signal and does not enter the page
  // context, so it perturbs the heap least. performance.memory is read second for comparison; the
  // few-millisecond skew between them is negligible against a 500 ms cadence.
  const usage = await cdp.send('Runtime.getHeapUsage');
  const { used, total } = normalizeUsage(usage);
  const pm = await page.evaluate(() => {
    const m = (typeof performance !== 'undefined') ? performance.memory : null;
    const state = window.SF?.state;
    return {
      perfNowMs: typeof performance !== 'undefined' ? performance.now() : null,
      used: m ? Number(m.usedJSHeapSize) : null,
      total: m ? Number(m.totalJSHeapSize) : null,
      limit: m ? Number(m.jsHeapSizeLimit) : null,
      tick: Number(state?.tick ?? -1),
      mode: state?.mode ?? null,
      entities: Number(state?.entityList?.length ?? state?.entities?.size ?? -1),
    };
  });
  return {
    phase,
    tMs: Date.now() - t0Ms,
    tWallAbs: Date.now(),
    perfNowMs: pm.perfNowMs,
    rtUsed: used,
    rtTotal: total,
    perfMemUsed: pm.used,
    perfMemTotal: pm.total,
    perfMemLimit: pm.limit,
    tick: pm.tick,
    mode: pm.mode,
    entities: pm.entities,
  };
}

function normalizeUsage(usage) {
  // Runtime.getHeapUsage returns { usedSize, totalSize } per the CDP spec, but defend against a
  // renamed/aliased field so the probe never emits a vacuous zero from a misread key.
  const used = usage?.usedSize ?? usage?.used ?? usage?.usedJSHeapSize ?? null;
  const total = usage?.totalSize ?? usage?.total ?? usage?.totalJSHeapSize ?? null;
  return { used: Number.isFinite(used) ? Number(used) : null, total: Number.isFinite(total) ? Number(total) : null };
}

async function forceFullGc(cdp) {
  // Two passes, mirroring scripts/lib/releaseSoakProbe.mjs: a single collectGarbage may complete a
  // major cycle without finalizing/compacting everything; the second pass ensures a full sweep so
  // the post-GC reading is a real floor, not a half-finished collection.
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
}

function lastSample(phase) {
  for (let i = samples.length - 1; i >= 0; i--) if (samples[i].phase === phase) return samples[i];
  return null;
}

// --- boot recipe (mirrors scripts/probe-shader-compile-timeline.mjs) -------------------------

async function bootToFlight(page) {
  enterStage('boot:sf-global');
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.registry && window.SF?.bus), null, {
    timeout: 60_000,
  });
  enterStage('boot:main-menu');
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) await page.keyboard.press('Space');
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  enterStage('boot:new-game');
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  enterStage('boot:await-flight');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight' && player?.alive !== false && player?.hull > 0;
  }, null, { timeout: 180_000 });
  const begin = page.getByRole('button', { name: /begin/i }).first();
  if (await begin.isVisible().catch(() => false)) await begin.click();
}

async function readEnvironment(page) {
  return page.evaluate(() => {
    const renderer = window.SF?.state?.render?.renderer || null;
    const gl = renderer?.getContext?.() || null;
    const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info') || null;
    const m = (typeof performance !== 'undefined') ? performance.memory : null;
    return {
      unmaskedRenderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '',
      unmaskedVendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : '',
      gpuTier: window.SF?.state?.render?.gpu?.tier || '',
      software: !!window.SF?.state?.render?.gpu?.software,
      heapLimitBytes: m ? Number(m.jsHeapSizeLimit) : null,
      userAgent: navigator.userAgent,
    };
  });
}

async function launchWithRetry(chromium, attempts) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      enterStage(`launch:${attempt}/${attempts}`);
      return await chromium.launch({
        headless: !HEADED,
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          // An occluded/backgrounded page has rAF throttled to ~1 Hz; without these the sim would
          // barely advance and "gameAlive" would falsely fail even though the page is fine.
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--ignore-gpu-blocklist',
          '--enable-webgl',
        ],
      });
    } catch (err) {
      lastErr = err;
      console.error(`[heap-verify] launch attempt ${attempt}/${attempts} failed: ${err?.message || err}`);
      await sleep(1500);
    }
  }
  throw new Error(`Chrome/Playwright launch failed after ${attempts} distinct attempts. Last error: ${lastErr?.stack || lastErr?.message || lastErr}`);
}

// --- analysis ---------------------------------------------------------------------------------

function buildReport({ samples, events, environment, pageErrors, config, fatalError = null }) {
  const phase1 = analyzePhase(samples, 'phase1');
  const phase2 = analyzePhase(samples, 'phase2');

  const forcedGc = [];
  for (const ev of events) {
    if (ev.kind !== 'forcedGc') continue;
    const phaseStart = firstSample(samples, ev.tag === 'gc1' ? 'phase1' : 'phase2');
    forcedGc.push(analyzeForcedGc(ev, phaseStart));
  }

  // Positive control. A dead sampler reports identical readings forever; a frozen game reports a
  // static tick. Either invalidates every downstream number, so this is evaluated first and the
  // verdict is forced to INCONCLUSIVE if it fails.
  const movingDeltaCount = phase1.analysis.deltas.filter((d) => d !== 0).length;
  const totalDeltas = phase1.analysis.deltas.length;
  const samplerAlive = totalDeltas > 0 && movingDeltaCount > 0;
  const gameAlive = phase1.first && phase1.last ? (phase1.last.tick - phase1.first.tick) > 0 : false;
  const positiveControl = {
    samplerAlive,
    gameAlive,
    movingDeltaCount,
    totalDeltas,
    tickAdvancePhase1: phase1.first && phase1.last ? (phase1.last.tick - phase1.first.tick) : null,
    note: samplerAlive && gameAlive
      ? 'sampler demonstrated moving (nonzero deltas) and sim advanced — readings are live'
      : 'SAMPLER DEAD or GAME FROZEN: identical flat readings prove the instrument is broken, not that the heap is stable',
  };

  const naturalCollectionsObserved = (phase1.analysis.naturalCollectionCount + phase2.analysis.naturalCollectionCount) > 0;
  const perfMemEverDecreased = (phase1.analysis.perfMemDecreaseCount + phase2.analysis.perfMemDecreaseCount) > 0;

  const verdict = classifyVerdict({ positiveControl, phase1, phase2, forcedGc });

  return {
    schema: 'spaceface.heapVerify.v1',
    generatedAt: new Date().toISOString(),
    claimUnderVerification: 'MAKE_THE_GAME_FAST.md Lead 5: ~2.15 GB monotonic heap growth, 0 collections, first measurement, no positive control',
    fatalError,
    environment,
    config,
    positiveControl,
    forcedGc,
    phases: { phase1, phase2 },
    naturalCollections: {
      observedInGetHeapUsage: naturalCollectionsObserved,
      getHeapUsageIntervalCount: phase1.analysis.naturalCollectionCount + phase2.analysis.naturalCollectionCount,
      getHeapUsageSignificantCount: phase1.analysis.significantDropCount + phase2.analysis.significantDropCount,
      observedInPerfMemory: perfMemEverDecreased,
      perfMemoryDecreaseCount: phase1.analysis.perfMemDecreaseCount + phase2.analysis.perfMemDecreaseCount,
      note: naturalCollectionsObserved && !perfMemEverDecreased
        ? 'Runtime.getHeapUsage shows collections that performance.memory does not — this is the quantisation explanation for Lead 5\'s "0 collections"'
        : null,
    },
    verdict,
    samples,
    events,
    pageErrors,
  };
}

function analyzePhase(allSamples, phase) {
  const s = allSamples.filter((x) => x.phase === phase && x.rtUsed != null);
  if (!s.length) return { analysis: emptyAnalysis(), first: null, last: null };

  const first = s[0];
  const last = s[s.length - 1];
  const durationMin = (last.tMs - first.tMs) / 60_000;
  const deltas = [];
  const drops = [];
  let perfMemDecreaseCount = 0;
  for (let i = 1; i < s.length; i++) {
    const d = s[i].rtUsed - s[i - 1].rtUsed;
    deltas.push(d);
    if (d < 0) {
      drops.push({ i, tMs: s[i].tMs, fromMB: s[i - 1].rtUsed / B_TO_MB, toMB: s[i].rtUsed / B_TO_MB, dropMB: (-d) / B_TO_MB });
    }
    if (s[i].perfMemUsed != null && s[i - 1].perfMemUsed != null && s[i].perfMemUsed < s[i - 1].perfMemUsed) {
      perfMemDecreaseCount++;
    }
  }
  let increases = 0, decreases = 0, flats = 0;
  for (const d of deltas) { if (d > 0) increases++; else if (d < 0) decreases++; else flats++; }

  const startMB = first.rtUsed / B_TO_MB;
  const endMB = last.rtUsed / B_TO_MB;
  const netGrowthMB = endMB - startMB;
  const rateMBperMin = durationMin > 0 ? netGrowthMB / durationMin : 0;
  const significantDrops = drops.filter((d) => d.dropMB > NATURAL_COLLECTION_FLOOR_MB);

  return {
    analysis: {
      sampleCount: s.length,
      startMB,
      endMB,
      netGrowthMB,
      durationMin,
      rateMBperMin,
      slopeMBperMin: leastSquaresSlope(s) ?? rateMBperMin,
      increases,
      decreases,
      flats,
      deltas,
      naturalCollectionCount: drops.length,
      significantDropCount: significantDrops.length,
      naturalCollectionDrops: drops,
      perfMemDecreaseCount,
      firstTick: first.tick,
      lastTick: last.tick,
      modeTransitions: countModeTransitions(s),
    },
    first,
    last,
  };
}

function analyzeForcedGc(ev, phaseStart) {
  const pre = ev.pre, post = ev.post;
  const preMB = (pre?.rtUsed ?? 0) / B_TO_MB;
  const postMB = (post?.rtUsed ?? 0) / B_TO_MB;
  const reclaimedMB = preMB - postMB;
  const grown = phaseStart && pre ? pre.rtUsed - phaseStart.rtUsed : 0;
  const reclaimOfGrowth = grown > 0 ? clamp01(reclaimedMB / (grown / B_TO_MB)) : null;
  return {
    tag: ev.tag,
    preMB,
    postMB,
    reclaimedMB,
    reclaimOfGrowth,
    postGcFloorVsPhaseStartMB: phaseStart ? postMB - (phaseStart.rtUsed / B_TO_MB) : null,
    pre: stripReading(pre),
    post: stripReading(post),
  };
}

function classifyVerdict({ positiveControl, phase1, phase2, forcedGc }) {
  const reasons = [];
  if (!positiveControl.samplerAlive || !positiveControl.gameAlive) {
    return {
      classification: 'INCONCLUSIVE_SAMPLER_OR_GAME_DEAD',
      reclaimOfGrowth1: null,
      reclaimOfGrowth2: null,
      naturalCollectionsObserved: null,
      reasons: ['positive control failed — no verdict can be stated from a dead sampler / frozen sim'],
    };
  }

  const r1 = forcedGc[0]?.reclaimOfGrowth ?? null;
  const r2 = forcedGc[1]?.reclaimOfGrowth ?? null;
  const avgReclaim = [r1, r2].filter((x) => x != null);
  const meanReclaim = avgReclaim.length ? avgReclaim.reduce((a, b) => a + b, 0) / avgReclaim.length : null;

  let classification;
  if (meanReclaim == null) {
    classification = 'INCONCLUSIVE_NO_GROWTH';
    reasons.push('no measurable growth occurred in the sampled window, so there was nothing for forced GC to reclaim');
  } else if (meanReclaim >= 0.8) {
    classification = 'LAZY_GC_NOT_LEAK';
    reasons.push(`forced GC reclaimed ~${(meanReclaim * 100).toFixed(0)}% of the growth — the heap was reclaimable, consistent with V8 lazy collection on a large-RAM machine, not hard retention`);
  } else if (meanReclaim >= 0.4) {
    classification = 'PARTIALLY_RECLAIMABLE';
    reasons.push(`forced GC reclaimed ~${(meanReclaim * 100).toFixed(0)}% of the growth — some is reclaimable, some is retained; a retained-set investigation is warranted`);
  } else {
    classification = 'RETENTION_LEAK_SIGNATURE';
    reasons.push(`forced GC reclaimed only ~${(meanReclaim * 100).toFixed(0)}% of the growth — the growth is retained and behaves like a leak`);
  }

  const naturalCollectionsObserved = (phase1.analysis.naturalCollectionCount + phase2.analysis.naturalCollectionCount) > 0;
  reasons.push(naturalCollectionsObserved
    ? 'natural collections WERE observed in Runtime.getHeapUsage — Lead 5\'s "0 collections" does not hold under an unquantised instrument'
    : 'no natural collections observed in either instrument during the sampled window');

  if (phase1.analysis.rateMBperMin < 1 && phase2.analysis.rateMBperMin < 1) {
    reasons.push('growth rate is < 1 MB/min in both phases — small in absolute terms over a 4-minute window');
  }

  return {
    classification,
    reclaimOfGrowth1: r1,
    reclaimOfGrowth2: r2,
    meanReclaimOfGrowth: meanReclaim,
    naturalCollectionsObserved,
    reasons,
  };
}

function emptyAnalysis() {
  return { sampleCount: 0, startMB: null, endMB: null, netGrowthMB: null, durationMin: null, rateMBperMin: null, slopeMBperMin: null };
}

function firstSample(allSamples, phase) {
  return allSamples.find((x) => x.phase === phase) || null;
}

function countModeTransitions(s) {
  let n = 0;
  for (let i = 1; i < s.length; i++) if (s[i].mode !== s[i - 1].mode) n++;
  return n;
}

function leastSquaresSlope(s) {
  const n = s.length;
  if (n < 2) return null;
  const xs = s.map((x) => x.tMs / 60_000);
  const ys = s.map((x) => x.rtUsed / B_TO_MB);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? null : num / den;
}

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function stripReading(r) { return r ? { tMs: r.tMs, rtUsed: r.rtUsed, rtTotal: r.rtTotal, perfMemUsed: r.perfMemUsed, perfMemTotal: r.perfMemTotal, tick: r.tick } : null; }

// --- output -----------------------------------------------------------------------------------

async function writeOutputs(report) {
  const jsonPath = resolve(ROOT, OUT);
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const mdPath = resolve(ROOT, REPORT);
  await mkdir(dirname(mdPath), { recursive: true });
  await writeFile(mdPath, renderMarkdown(report), 'utf8');
}

function renderMarkdown(report) {
  const pc = report.positiveControl;
  const p1 = report.phases.phase1.analysis;
  const p2 = report.phases.phase2.analysis;
  const v = report.verdict;
  const env = report.environment || {};
  const gc1 = report.forcedGc[0];
  const gc2 = report.forcedGc[1];
  const fmt = (x) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(1));
  const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
  const lines = [];
  lines.push('<!-- LIFETIME: EPHEMERAL --><!-- One-use verification receipt for MAKE_THE_GAME_FAST.md Lead 5. Diagnostic, not policy. -->');
  lines.push('# Lead 5 heap verification — ' + (report.fatalError ? 'BLOCKED' : v.classification));
  lines.push('');
  lines.push('Verification of the claim in `design/program/roadmap/MAKE_THE_GAME_FAST.md` "Lead 5": a prior');
  lines.push('capture saw `performance.memory` grow ~2.15 GB monotonically to ~2.19 GB over 1499 samples with');
  lines.push('ZERO observed collections. That was the first heap measurement here, with no positive control.');
  lines.push('This report either confirms or refutes it using two cross-validating instruments and a forced GC.');
  lines.push('');
  lines.push('- **Probe:** `scripts/probe-heap-verify.mjs` (throwaway; zero `src/` changes)');
  lines.push('- **Raw samples + events:** `.devshots/perf/heap-verify.json`');
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push(`- **Renderer:** ${env.unmaskedRenderer || '(masked)'}`);
  lines.push(`- **GPU tier:** ${env.gpuTier || '?'} (software=${env.software}); **heap limit:** ${env.heapLimitBytes ? (env.heapLimitBytes / 1e9).toFixed(2) + ' GB' : 'n/a'}`);
  lines.push(`- **Window:** headless=${report.config.headed ? 'false' : 'true'}; ${fmt(report.config.phaseMs / 1000)}s per phase, sampled every ${report.config.intervalMs} ms`);
  lines.push('');
  lines.push('## Positive control (evaluated before any verdict)');
  lines.push('');
  lines.push('A heap instrument has the same silent-failure mode as a zero-budget counter: a dead sampler and a');
  lines.push('stable heap both report "no change". So the verdict is withheld unless the sampler demonstrably moves.');
  lines.push('');
  lines.push(`- **Sampler alive:** ${pc.samplerAlive ? 'YES' : 'NO'} — ${pc.movingDeltaCount}/${pc.totalDeltas} consecutive `);
  lines.push(`  \`Runtime.getHeapUsage\` readings had nonzero deltas.`);
  lines.push(`- **Game alive:** ${pc.gameAlive ? 'YES' : 'NO'} — sim tick advanced by ${pc.tickAdvancePhase1 ?? 'n/a'} ticks in phase 1.`);
  lines.push('');
  if (!pc.samplerAlive || !pc.gameAlive) {
    lines.push('> WARNING: Positive control FAILED. Identical flat readings prove the sampler is dead or the');
    lines.push('> sim is frozen, not that the heap is stable. No verdict is stated below; the numbers are retained');
    lines.push('> raw only.');
    lines.push('');
  }
  lines.push('## (a) Does the heap grow monotonically during idle flight?');
  lines.push('');
  lines.push('| phase | start MB | end MB | net growth | duration | rate (endpoints) | slope (least-sq) | inc/dec/flat |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  pushPhaseRow(lines, 'phase 1 (pre-GC)', p1);
  pushPhaseRow(lines, 'phase 2 (post-GC1)', p2);
  lines.push('');
  const monotone1 = p1.decreases === 0 && p1.sampleCount > 1;
  const monotone2 = p2.decreases === 0 && p2.sampleCount > 1;
  lines.push(`Phase 1 is **${monotone1 ? 'strictly monotone' : 'NOT strictly monotone'}** (decreases=${p1.decreases}). Phase 2 is **${monotone2 ? 'strictly monotone' : 'NOT strictly monotone'}** (decreases=${p2.decreases}).`);
  lines.push(`Idle-flight growth rate (phase 1 slope): **${fmt(p1.slopeMBperMin)} MB/min**.`);
  if (Number.isFinite(p1.slopeMBperMin) && p1.slopeMBperMin > 0) {
    lines.push(`At that rate, reaching the claimed ~2.19 GB from a typical post-boot floor (~${fmt(p1.startMB / 1000)} GB) would take roughly ${(((2190 - p1.startMB) / p1.slopeMBperMin) / 60).toFixed(1)} hours — i.e. the 2.15 GB figure is only reachable on a very long run, not a 4-minute window.`);
  }
  lines.push('');
  lines.push('## (b) Does forced GC reclaim the growth (lazy GC) or leave it (leak)?');
  lines.push('');
  lines.push('| forced GC | before MB | after MB | reclaimed MB | reclaim of growth | floor vs phase start |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  pushGcRow(lines, gc1, 'GC #1');
  pushGcRow(lines, gc2, 'GC #2');
  lines.push('');
  lines.push(`Mean reclaim-of-growth across both forced GCs: **${pct(v.meanReclaimOfGrowth)}**.`);
  lines.push('');
  if (gc1 && gc2 && gc1.reclaimOfGrowth != null && gc2.reclaimOfGrowth != null
      && Math.abs(gc1.reclaimOfGrowth - gc2.reclaimOfGrowth) > 0.3) {
    lines.push('> Note: the two forced-GC ratios differ widely. Phase 1 begins straight off boot, so its growth');
    lines.push('> mixes idle-flight allocation with post-boot working-set establishment (JIT warming, late asset');
    lines.push('> residency); GC #1 therefore reclaims less. Phase 2 begins from a clean post-GC floor, so **GC #2');
    lines.push('> is the cleaner steady-state test** and is the better predictor of whether idle flight itself leaks.');
    lines.push('');
  }
  lines.push(`**Interpretation:** ${v.reasons[0] ?? 'see verdict reasons.'}`);
  lines.push('');
  lines.push('## (c) Do natural collections ever appear in the samples?');
  lines.push('');
  lines.push(`- \`Runtime.getHeapUsage\` (unquantised): ${report.naturalCollections.getHeapUsageIntervalCount} sample intervals contained a collection (${report.naturalCollections.getHeapUsageSignificantCount} dropped > ${report.config.naturalCollectionFloorMb} MB).`);
  lines.push(`- \`performance.memory\` (quantised, Lead 5\'s instrument): ${report.naturalCollections.perfMemoryDecreaseCount} sample intervals showed a decrease.`);
  lines.push('');
  if (report.naturalCollections.note) lines.push(`**${report.naturalCollections.note}.**`);
  lines.push('');
  lines.push('A drop between two `Runtime.getHeapUsage` samples can only mean a GC ran in that interval (without GC,');
  lines.push('live heap never shrinks). So this is a direct test of Lead 5\'s "0 collections" claim under an instrument');
  lines.push('that is not quantised.');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`**${v.classification}**`);
  lines.push('');
  for (const r of v.reasons) lines.push(`- ${r}`);
  lines.push('');
  lines.push('## Caveats');
  lines.push('');
  lines.push('- This run is a **4-minute idle-flight window** in a (likely headless, software-rendering) probe. Lead');
  lines.push('  5\'s 2.15 GB was accumulated over a full long probe run; this probe measures the *rate* and the');
  lines.push('  *reclaimability*, not the absolute peak. Do not expect to see 2.19 GB here.');
  lines.push('- `performance.memory` is quantised; `Runtime.getHeapUsage` is not. Where they disagree on collections,');
  lines.push('  the unquantised reading is authoritative.');
  lines.push('- V8 is lazy on a large-RAM machine: it will hold a heap far above the live set before collecting. A');
  lines.push('  reclaimable big heap is still **GC pressure** (a 2 GB heap means long major-GC pauses when they do');
  lines.push('  fire), so "lazy GC, not a leak" does NOT mean "harmless" — it means the fix shape is different.');
  lines.push('');
  lines.push('## What should happen next');
  lines.push('');
  lines.push(nextSteps(v.classification, report));
  if (report.fatalError) {
    lines.push('');
    lines.push('## Capture failure');
    lines.push('');
    lines.push(`The probe was blocked at stage \`${report.fatalError.stage}\`: ${report.fatalError.message}`);
    lines.push('No verdict above should be treated as measured; it reflects only whatever partial data was captured.');
  }
  if (report.pageErrors?.length) {
    lines.push('');
    lines.push('## Page errors during capture');
    lines.push('');
    lines.push('```');
    for (const e of report.pageErrors) lines.push(e);
    lines.push('```');
  }
  return `${lines.join('\n')}\n`;
}

function pushPhaseRow(lines, label, a) {
  if (!a || a.sampleCount === 0) { lines.push(`| ${label} | n/a | n/a | n/a | n/a | n/a | n/a | n/a |`); return; }
  lines.push(`| ${label} | ${a.startMB.toFixed(1)} | ${a.endMB.toFixed(1)} | ${(a.netGrowthMB >= 0 ? '+' : '')}${a.netGrowthMB.toFixed(1)} | ${a.durationMin.toFixed(2)} min | ${a.rateMBperMin.toFixed(1)} MB/min | ${(a.slopeMBperMin ?? 0).toFixed(1)} MB/min | ${a.increases}/${a.decreases}/${a.flats} |`);
}

function pushGcRow(lines, gc, label) {
  if (!gc) { lines.push(`| ${label} | n/a | n/a | n/a | n/a | n/a |`); return; }
  const fmt = (x) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(1));
  const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
  lines.push(`| ${label} | ${fmt(gc.preMB)} | ${fmt(gc.postMB)} | ${fmt(gc.reclaimedMB)} | ${pct(gc.reclaimOfGrowth)} | ${fmt(gc.postGcFloorVsPhaseStartMB)} MB |`);
}

function nextSteps(classification, report) {
  const out = [];
  out.push('1. **Re-run headed on the real GPU.** Step 0 of MAKE_THE_GAME_FAST.md first: confirm `software=false`');
  out.push('   on a real headed browser (`--headed`). The headless software-rendering environment measured here is');
  out.push('   comparable to Lead 5\'s original capture but is not the player\'s machine.');
  if (classification === 'LAZY_GC_NOT_LEAK') {
    out.push('2. **The growth is reclaimable, so this is GC pressure, not a retained leak.** The first-rank action is');
    out.push('   to cut *per-frame allocation* (the thing inflating the heap and triggering long major GCs): Leads 1,');
    out.push('   3 and 4 (sprite-material dispose/relink, bufferFullUploads spikes, and the 13.6 DOM attribute');
    out.push('   mutations/frame) are exactly the allocation sources that bloat a heap like this.');
    out.push('3. **Confirm the floor is stable, not creeping.** Run the probe for 20-30 minutes (raise `--phase-ms`)');
    out.push('   and force several GC cycles: if each post-GC floor is higher than the last, there IS a slow leak');
    out.push('   hiding under the lazy-GC behaviour, and a heap-snapshot diff (DevTools Memory → snapshot before/after)');
    out.push('   is the next step. If the floors plateau, there is no leak.');
    out.push('4. **Do not ship a `--expose-gc` / periodic forced-GC hack.** Forcing GC on a schedule trades the big');
    out.push('   lazy pauses for more frequent smaller ones and does not reduce allocation.');
  } else if (classification === 'PARTIALLY_RECLAIMABLE' || classification === 'RETENTION_LEAK_SIGNATURE') {
    out.push('2. **The growth is at least partly retained.** Take two heap snapshots in DevTools (Memory panel) on a');
    out.push('   headed real-GPU session — one at the start of idle flight, one after several minutes — and diff');
    out.push('   them. The retained-by retained-dominators view names the exact object types accumulating.');
    out.push('3. Suspect the same sources Leads 1/3/4 point at (disposed-but-referenced materials, per-frame');
    out.push('   intermediate arrays, unbounded caches). A retained object that should have been freed is the leak.');
    out.push('4. Re-run this probe after the fix: the post-GC floor should stop creeping and the rate should drop.');
  } else if (classification === 'INCONCLUSIVE_NO_GROWTH') {
    out.push('2. No growth was observed in this 4-minute window. Either the prior 2.15 GB was an artifact of a much');
    out.push('   longer run with stimulus, or this environment does not reproduce it. Re-run with a longer');
    out.push('   `--phase-ms` (e.g. 600000) and with the scripted stimulus from `probe:shader-timeline` applied.');
  } else {
    out.push('2. The positive control failed, so no measurement was possible. Fix the sampler/launch (see the');
    out.push('   capture-failure section) before any heap claim can be made.');
  }
  return out.join('\n');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq > -1) out[token.slice(2, eq)] = token.slice(eq + 1);
    else if (args[i + 1] && !args[i + 1].startsWith('--')) out[token.slice(2)] = args[++i];
    else out[token.slice(2)] = true;
  }
  return out;
}
