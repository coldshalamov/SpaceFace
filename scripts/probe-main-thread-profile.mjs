#!/usr/bin/env node
// Whole-process main-thread profile for the live game.
//
// Why this exists, in one sentence: an in-engine hitch classifier can only attribute work that
// happens inside its own callbacks, so anything expensive living in a *different* rAF callback,
// timer, or observer is invisible to it and can only ever be reported as a gap. On 2026-09-10 that
// gap ("externalScheduling") was 75% of every frame, and it was a hidden ship-preview canvas
// resizing itself 1.25x per frame — 59% of the whole main thread. A plain V8 CPU profile named the
// owner on the first run. See design/perf/PERF_ROOT_CAUSE_2026-09-10.md.
//
// Use this when the runtime witness reports a large unattributed residual, or whenever a frame is
// slower than the sum of everything you can measure. It is a diagnosis instrument, not a gate.
//
//   node scripts/probe-main-thread-profile.mjs [--ms=20000]
//     A held-thrust window of steady flight.
//   node scripts/probe-main-thread-profile.mjs --from-launch [--flight-ms=10000]
//     From the New Game click through every loading stage and into the first seconds of flight: the
//     stage timeline, main-thread time per stage (busy JavaScript vs native vs idle), every long
//     task, and the bytes fetched before flight. This is the window a player calls "it takes
//     forever to load". A stage that is mostly idle is waiting on something off the main thread.
//   --label=NAME          write under .devshots/main-thread-profile/NAME/ instead of the root
//   --keep-profile=NAME   reuse one named evidence profile instead of a fresh temporary one. The
//                         first run is a cold start; a later run with the same NAME starts with the
//                         GPU program cache and HTTP cache a returning player has.
//   --launch-dwell-ms=N   with --from-launch, stay N ms on the New Game screen before clicking Launch,
//                         as a player picking a ship does. Without it Launch is clicked at once, while
//                         the stage hull may still be building its shaders. A diagnosis switch (it told
//                         the preview's own shader links apart from the loading cook), never the
//                         baseline for a before/after comparison.
//   --drop-profile=NAME   delete that kept profile and exit
//
// Writes .devshots/main-thread-profile/[NAME/]{profile.cpuprofile,report.md,canvas-census.json}.
// The .cpuprofile opens directly in Chrome DevTools' Performance panel (Load profile...).
//
// Conventions: isolated evidence Electron (never the player profile), writes only under the ignored
// .devshots tree, and always closes the app. Temporary profiles are removed; kept profiles only on
// --drop-profile.

import fs from 'node:fs';
import { renderTraceSummaryMarkdown, summarizeMainThread, traceEventsOf } from './lib/rendererTraceSummary.mjs';
import { frameGapStats, smoothnessMarkdown, summarizeLoadingSmoothness } from './lib/loadingSmoothness.mjs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import launchProtocol from './lib/electronLaunchProtocol.cjs';
import { buildIsolatedElectronEnv, createIsolatedElectronLaunch } from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const { electronEvidenceProfileRoot, inspectElectronEvidenceProfilePath } = launchProtocol;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argValue = (name) => {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
};
const safeName = (value, max) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^[-_]+/, '')
  .slice(0, max);

const FROM_LAUNCH = process.argv.includes('--from-launch');
const WINDOW_MS = Number(argValue('--ms') || process.env.SPACEFACE_PROFILE_MS || 20_000);
const FLIGHT_TAIL_MS = Number(argValue('--flight-ms') || 10_000);
const LAUNCH_DWELL_MS = Math.max(0, Number(argValue('--launch-dwell-ms')) || 0);
// --menu-dwell-ms waits on the title menu before the profile starts, the way a person reads it first: the boot-time background
// residency work finishes there, so New Game is not measured while it is still paying for the boot.
const MENU_DWELL_MS = Math.max(0, Number(argValue('--menu-dwell-ms')) || 0);
const LABEL = safeName(argValue('--label'), 48);
const KEEP_PROFILE = safeName(argValue('--keep-profile'), 40);
const DROP_PROFILE = safeName(argValue('--drop-profile'), 40);
const OUT_DIR = path.join(ROOT, '.devshots', 'main-thread-profile', ...(LABEL ? [LABEL] : []));
const FIXED_SEED = 47;
// --chromium-arg=--flag lets an A/B run change one browser behaviour (for example
// --chromium-arg=--force-prefers-reduced-motion to see what the loading backdrop costs).
const EXTRA_CHROMIUM_ARGS = process.argv
  .filter((arg) => arg.startsWith('--chromium-arg='))
  .map((arg) => arg.slice('--chromium-arg='.length))
  .filter(Boolean);
// --trace records a Chrome timeline alongside the CPU profile and writes trace-summary.md: the
// main-thread self time per event inside each loading stage, which names the non-JS "(program)" work.
const TRACE = process.argv.includes('--trace');
// --crucible profiles the swarm mode (seed 4242, default kit, drafts auto-answered) instead of open flight;
// --settle-ms=N flies N ms of that flight before the profile window starts (0 profiles the opening).
const CRUCIBLE = process.argv.includes('--crucible');
const SETTLE_MS = Math.max(0, Number(argValue('--settle-ms')) || 0);
// --gpu-timers turns the capability-gated GPU timer queries on for the profile window and prints the per-pass report
// (drawPreparedFrame, bloom passes): which GPU pass the frame is waiting on, where the main thread cannot see it.
const GPU_TIMERS = process.argv.includes('--gpu-timers');
// --eval-file=PATH runs a script in the page once the flight has settled (instead of the profile window): the file is
// one expression that evaluates to a Promise, and its resolved value is saved as eval-result.json. This is how a
// within-session A/B (alternating blocks in the same flight) controls for this machine's noisy background load.
const EVAL_FILE = argValue('--eval-file');
// --heap-sampling starts the V8 sampling heap profiler before New Game and, at the end of the held-thrust tail, writes
// which allocation sites still hold live memory (heap-sampling.json / heap-sampling.md), with the JS heap at each milestone.
const HEAP_SAMPLING = process.argv.includes('--heap-sampling');
// --hold-still skips the thrust during the flight tail, so scene content does not change with distance flown: a time-based
// startup cost then shows up as a cadence trend over the tail, a position-based one does not.
const HOLD_STILL = process.argv.includes('--hold-still');
// --sampling-us=N sets the CPU profiler's sampling interval in microseconds (default 500 for a launch, 200 for steady flight).
// A coarse interval (4000) keeps the profiler's own cost out of a loading-smoothness read.
const SAMPLING_US = Math.max(100, Number(argValue('--sampling-us')) || 0);
const TRACE_CATEGORIES = [
  '-*', 'toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'gpu',
];

async function startTrace(cdp) {
  await cdp.send('Tracing.start', {
    traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: TRACE_CATEGORIES },
    transferMode: 'ReturnAsStream',
    streamFormat: 'json',
  });
}

async function stopTraceToFile(cdp, file) {
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const { stream } = await complete;
  const fd = fs.openSync(file, 'w');
  try {
    for (;;) {
      const chunk = await cdp.send('IO.read', { handle: stream, size: 4 * 1024 * 1024 });
      fs.writeSync(fd, chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data);
      if (chunk.eof) break;
    }
  } finally {
    fs.closeSync(fd);
    await cdp.send('IO.close', { handle: stream }).catch(() => {});
  }
}

const log = (message) => console.log(`[main-thread-profile ${new Date().toISOString().slice(11, 19)}] ${message}`);

function keptProfileDir(name) {
  // The evidence-profile contract only accepts creator-issued names: probe-<task>-<6 chars>.
  return path.join(electronEvidenceProfileRoot(os.tmpdir()), `probe-keep-${name}-000000`);
}

if (DROP_PROFILE) {
  const dir = keptProfileDir(DROP_PROFILE);
  const inspected = inspectElectronEvidenceProfilePath(dir);
  if (inspected.pass) {
    fs.rmSync(dir, { recursive: true, force: true });
    log(`dropped kept profile ${dir}`);
  } else {
    log(`nothing to drop at ${dir}: ${inspected.failures.join('; ')}`);
  }
  process.exit(0);
}

function createKeptElectronLaunch(name, baseEnv) {
  const userDataDir = keptProfileDir(name);
  const existed = fs.existsSync(userDataDir);
  fs.mkdirSync(userDataDir, { recursive: true });
  return {
    options: { args: ['.'], cwd: ROOT, timeout: 180_000, env: buildIsolatedElectronEnv({ baseEnv, userDataDir }) },
    userDataDir,
    existed,
    cleanup: () => true, // kept on purpose; --drop-profile removes it
  };
}

/** Every canvas in the document, with the two facts that expose an orphaned render surface. */
function canvasCensusInPage() {
  return Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
    id: canvas.id || null,
    className: String(canvas.className || '') || null,
    backingWidth: canvas.width,
    backingHeight: canvas.height,
    clientWidth: canvas.clientWidth,
    clientHeight: canvas.clientHeight,
    display: getComputedStyle(canvas).display,
    connected: canvas.isConnected,
  }));
}

/** Renderer resource counts plus whatever the opening is still waiting on. */
function readGpuAndOpeningInPage() {
  const info = window.SF?.registry?.get?.('render')?.renderer?.info;
  let authored = null;
  try { authored = window.SF?.authoredVisualReadiness?.() || null; } catch { /* optional surface */ }
  return {
    programs: Array.isArray(info?.programs) ? info.programs.length : null,
    geometries: info?.memory?.geometries ?? null,
    textures: info?.memory?.textures ?? null,
    heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    disposeProbeRuns: window.SF?.registry?.get?.('render')?.renderer?.userData?.spacefaceDisposeProbeRuns ?? null,
    // Draws that waited on a driver link (src/render/shaderLinkReporter.js link-block ledger).
    linkBlocks: (() => {
      try {
        const ledger = window.SF?.registry?.get?.('render')?.renderer?.userData?.spacefaceLinkBlocks;
        if (!ledger) return null;
        const families = Object.entries(ledger.byName || {})
          .map(([name, row]) => ({ name, count: row.count, waits: row.waits, totalMs: Math.round(row.totalMs) }))
          .sort((a, b) => b.totalMs - a.totalMs).slice(0, 12);
        return {
          count: ledger.count, waits: ledger.waits, programs: ledger.programs,
          totalMs: Math.round(ledger.totalMs), maxMs: Math.round(ledger.maxMs),
          families,
          worst: (ledger.worst || []).slice(0, 8).map((row) => ({
            ms: Math.round(row.ms), name: row.name, stack: row.stack ? String(row.stack).slice(0, 700) : null,
          })),
        };
      } catch { return null; }
    })(),
    openingPending: Array.isArray(authored?.openingPending)
      ? authored.openingPending.slice(0, 12).map((entry) => (
        [entry.id, entry.status, entry.type, entry.defId].filter((bit) => bit != null && bit !== '').join(':')
      ))
      : null,
    // The loading-shell cook ledger (src/render/pipelineReadiness.js): one row per awaited step.
    openingCookLedger: (() => {
      try {
        const ledger = window.SF?.state?.render?.openingCookLedger
          ?? window.SF?.registry?.get?.('render')?.state?.render?.openingCookLedger;
        return Array.isArray(ledger) ? JSON.parse(JSON.stringify(ledger)) : null;
      } catch { return null; }
    })(),
  };
}

/** The cook ledger as a table: which awaited step owned the loading time and how each one ended. */
function cookLedgerLines(ledger, timeline) {
  if (!Array.isArray(ledger) || ledger.length < 2) return [];
  const head = ledger[0]?.step === 'begin' ? ledger[0] : null;
  const lines = ['## Opening cook ledger', ''];
  const afterLaunch = (wallMs) => ((wallMs - timeline.launchWallMs) / 1000).toFixed(1);
  if (head && Number.isFinite(head.wallMs)) {
    lines.push(`The ${head.kind} cook began ${afterLaunch(head.wallMs)} s after Launch; flight began at ${afterLaunch(timeline.flightWallMs)} s. \`t\` is ms from the cook's start to the end of the step.`, '');
  }
  lines.push('| step | ms | outcome | t ms | detail |', '|---|---:|---|---:|---|');
  for (const row of ledger) {
    if (row === head) continue;
    const { step, ms, outcome, t, ...detail } = row;
    const text = Object.entries(detail)
      .map(([key, value]) => `${key}=${value !== null && typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join(' ')
      .replace(/\|/g, '/');
    lines.push(`| ${step} | ${ms} | ${outcome} | ${t} | ${text} |`);
  }
  lines.push('');
  return lines;
}

const NATIVE_BUCKETS = new Set(['(program)', '(idle)', '(garbage collector)', '(root)']);

function profileIndex(profile) {
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) {
    for (const childId of node.children || []) parentOf.set(childId, node.id);
  }
  // Microseconds from the profile start at which each sample was taken.
  const offsets = new Float64Array(profile.samples.length);
  let elapsed = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    elapsed += Math.max(0, profile.timeDeltas?.[i] || 0);
    offsets[i] = elapsed;
  }
  return { nodesById, parentOf, offsets };
}

function nodeLabel(node) {
  const frame = node.callFrame;
  const url = String(frame.url || '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^file:\/\/.*?([^/\\]+)$/, '$1');
  return `${frame.functionName || '(anonymous)'} @ ${url || 'native'}:${frame.lineNumber + 1}`;
}

function nodeFile(node) {
  const frame = node.callFrame;
  const url = String(frame.url || '').replace(/^https?:\/\/[^/]+\//, '').replace(/[?#].*$/, '');
  if (url) return url;
  return NATIVE_BUCKETS.has(frame.functionName) ? frame.functionName : '(native)';
}

/**
 * Self time per call frame, inclusive time per top-level entry point, and self time per source
 * file, optionally restricted to samples taken in [fromMicros, toMicros) of the profile.
 * The entry table is the one that names an owner: a parasite shows up as a top-level entry that is
 * not the game's own presentation frame.
 */
function summarizeProfile(profile, index, fromMicros = 0, toMicros = Infinity) {
  const { nodesById, parentOf, offsets } = index;
  const selfMicros = new Map();
  let totalMicros = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    if (offsets[i] < fromMicros || offsets[i] >= toMicros) continue;
    const delta = Math.max(0, profile.timeDeltas?.[i] || 0);
    totalMicros += delta;
    const id = profile.samples[i];
    selfMicros.set(id, (selfMicros.get(id) || 0) + delta);
  }

  const self = [...selfMicros.entries()]
    .map(([id, micros]) => ({ micros, node: nodesById.get(id) }))
    .filter((row) => row.node)
    .sort((a, b) => b.micros - a.micros);

  const entryMicros = new Map();
  const fileMicros = new Map();
  const buckets = { program: 0, idle: 0, gc: 0 };
  for (const [id, micros] of selfMicros) {
    const node = nodesById.get(id);
    const name = node?.callFrame?.functionName;
    if (name === '(program)') buckets.program += micros;
    else if (name === '(idle)') buckets.idle += micros;
    else if (name === '(garbage collector)') buckets.gc += micros;
    if (node) {
      const file = nodeFile(node);
      fileMicros.set(file, (fileMicros.get(file) || 0) + micros);
    }
    const chain = [];
    for (let cursor = id; cursor != null; cursor = parentOf.get(cursor)) chain.push(cursor);
    const entryId = chain.length >= 2 ? chain[chain.length - 2] : chain[chain.length - 1];
    const entryNode = nodesById.get(entryId);
    const key = entryNode ? nodeLabel(entryNode) : '(root)';
    entryMicros.set(key, (entryMicros.get(key) || 0) + micros);
  }

  return {
    totalMicros,
    self,
    buckets,
    entries: [...entryMicros.entries()].sort((a, b) => b[1] - a[1]),
    files: [...fileMicros.entries()].sort((a, b) => b[1] - a[1]),
  };
}

const pct = (micros, total) => `${((100 * micros) / (total || 1)).toFixed(1)}%`;
const msOf = (micros) => (micros / 1000).toFixed(1);
const sOf = (micros) => (micros / 1e6).toFixed(2);

function entryTable(summary, limit) {
  return [
    '## Top-level entry points (inclusive)',
    '',
    'The owner of the frame. Anything here that is not the game\'s own presentation frame is work',
    'the in-engine hitch classifier cannot see.',
    '',
    '| ms | share | entry |',
    '|---:|---:|---|',
    ...summary.entries.slice(0, limit)
      .map(([key, micros]) => `| ${msOf(micros)} | ${pct(micros, summary.totalMicros)} | \`${key}\` |`),
    '',
  ];
}

function selfTable(summary, rows, limit, heading) {
  return [
    heading,
    '',
    '| ms | share | function |',
    '|---:|---:|---|',
    ...rows.slice(0, limit)
      .map((row) => `| ${msOf(row.micros)} | ${pct(row.micros, summary.totalMicros)} | \`${nodeLabel(row.node)}\` |`),
    '',
  ];
}

function fileTable(summary, limit, heading) {
  return [
    heading,
    '',
    '| ms | share | source |',
    '|---:|---:|---|',
    ...summary.files.slice(0, limit)
      .map(([file, micros]) => `| ${msOf(micros)} | ${pct(micros, summary.totalMicros)} | \`${file}\` |`),
    '',
  ];
}

function censusLines(census, heading) {
  return [
    heading,
    '',
    'A canvas that is still `connected` with a zero client size is not in layout and cannot be seen.',
    'If its backing store is large, or grows between runs, it is an orphaned render surface.',
    '',
    '| id / class | backing store | client | display | connected |',
    '|---|---|---|---|---|',
    ...census.map((row) => `| ${row.id || row.className || '(none)'} | ${row.backingWidth}x${row.backingHeight} `
      + `| ${row.clientWidth}x${row.clientHeight} | ${row.display} | ${row.connected} |`),
    '',
  ];
}

function writeSteadyReport(profile, census, longTasks) {
  const summary = summarizeProfile(profile, profileIndex(profile));
  const lines = [
    '# Main-thread profile',
    '',
    `Window: ${msOf(summary.totalMicros)} ms of flight. Long tasks recorded in the window: **${longTasks.length}**.`,
    '',
    ...entryTable(summary, 15),
    ...selfTable(summary, summary.self, 25, '## Top self time'),
    ...fileTable(summary, 15, '## Self time by source'),
    ...censusLines(census, '## Canvas census during flight'),
  ];
  if (longTasks.length) {
    lines.push('## Long tasks in the window', '', '| start ms | duration ms |', '|---:|---:|');
    for (const task of longTasks.slice(0, 20)) {
      lines.push(`| ${Math.round(task.startTime)} | ${Math.round(task.duration)} |`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), lines.join('\n'), 'utf8');
  return summary;
}

/** Launch -> each loading stage -> flight -> end, as contiguous wall-clock phases. */
function buildLaunchPhases(timeline, stages) {
  const phases = [{ name: 'New Game screen (to Launch click)', from: timeline.newGameWallMs, to: timeline.launchWallMs }];
  const loading = stages.filter((stage) => stage.wallMs >= timeline.launchWallMs && stage.wallMs < timeline.flightWallMs);
  if (loading.length && loading[0].wallMs - timeline.launchWallMs > 50) {
    phases.push({ name: 'Launch click to first loading stage', from: timeline.launchWallMs, to: loading[0].wallMs });
  }
  loading.forEach((stage, i) => {
    phases.push({
      name: `loading: ${stage.id || '(unnamed)'}`,
      from: stage.wallMs,
      to: i + 1 < loading.length ? loading[i + 1].wallMs : timeline.flightWallMs,
    });
  });
  if (!loading.length) phases.push({ name: 'loading (no stage events seen)', from: timeline.launchWallMs, to: timeline.flightWallMs });
  phases.push({ name: 'first seconds of flight', from: timeline.flightWallMs, to: timeline.endWallMs });
  return phases.filter((phase) => Number.isFinite(phase.from) && Number.isFinite(phase.to) && phase.to > phase.from);
}

function resourceLines(resources, from, to) {
  const inWindow = resources.filter((entry) => entry.wallMs >= from && entry.wallMs < to);
  const heading = '## Fetched between Launch and flight';
  if (!inWindow.length) return [heading, '', 'No resource entries were observed in the loading window.', ''];
  const mb = (bytes) => (bytes / 1048576).toFixed(2);
  const extOf = (name) => {
    const match = /\.([a-z0-9]+)$/i.exec(String(name).replace(/[?#].*$/, ''));
    return match ? match[1].toLowerCase() : '(none)';
  };
  const groups = new Map();
  const delivery = { cache: 0, revalidated: 0, network: 0 };
  for (const entry of inWindow) {
    const ext = extOf(entry.name);
    const group = groups.get(ext) || { count: 0, encoded: 0, transfer: 0 };
    group.count += 1;
    group.encoded += entry.encodedBodySize || 0;
    group.transfer += entry.transferSize || 0;
    groups.set(ext, group);
    const transfer = entry.transferSize || 0;
    const encoded = entry.encodedBodySize || 0;
    if (transfer === 0 && encoded > 0) delivery.cache += 1;
    else if (transfer > 0 && transfer < encoded) delivery.revalidated += 1;
    else delivery.network += 1;
  }
  const totalEncoded = inWindow.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0);
  const totalTransfer = inWindow.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
  const lines = [
    heading,
    '',
    `${inWindow.length} requests; ${mb(totalEncoded)} MB of bodies; ${mb(totalTransfer)} MB actually transferred. `
      + `Delivery: ${delivery.network} over the network, ${delivery.revalidated} revalidated (304), ${delivery.cache} straight from cache.`,
    '',
    '| type | requests | body MB | transferred MB |',
    '|---|---:|---:|---:|',
    ...[...groups.entries()].sort((a, b) => b[1].encoded - a[1].encoded)
      .map(([ext, group]) => `| ${ext} | ${group.count} | ${mb(group.encoded)} | ${mb(group.transfer)} |`),
    '',
    '| largest bodies | MB | transferred MB | fetch ms |',
    '|---|---:|---:|---:|',
    ...[...inWindow].sort((a, b) => (b.encodedBodySize || 0) - (a.encodedBodySize || 0)).slice(0, 15)
      .map((entry) => `| \`${String(entry.name).replace(/^https?:\/\/[^/]+\//, '')}\` | ${mb(entry.encodedBodySize || 0)} `
        + `| ${mb(entry.transferSize || 0)} | ${Math.round(entry.duration || 0)} |`),
    '',
  ];
  return lines;
}

/** The link-block ledger: how long draws waited on a driver link, by shader family, with the worst stacks. */
function linkBlockLines(blocks) {
  if (!blocks) return ['Link-block ledger unavailable (renderer.userData.spacefaceLinkBlocks missing).', ''];
  const lines = ['## Draws that waited on a driver link', '',
    `${blocks.waits} waits of 1 ms or more across ${blocks.programs} programs (${blocks.count} draw-path calls), ${(blocks.totalMs / 1000).toFixed(1)} s on the main thread, longest ${blocks.maxMs} ms.`, '',
    '| shader family | waits (>= 1 ms) | total ms |', '|---|---:|---:|'];
  for (const row of blocks.families || []) lines.push(`| ${row.name} | ${row.waits} | ${row.totalMs} |`);
  lines.push('');
  for (const row of blocks.worst || []) {
    lines.push(`- ${row.ms} ms \`${row.name}\`${row.stack ? ` — ${row.stack}` : ''}`);
  }
  lines.push('');
  return lines;
}

function writeLaunchReport({ profile, trace, timeline, atFlight, atEnd, census, profileNote }) {
  const index = profileIndex(profile);
  const toMicros = (wallMs) => Math.max(0, (wallMs - timeline.profileStartWallMs) * 1000);
  const phases = buildLaunchPhases(timeline, trace.stages);
  const secondsBetween = (a, b) => ((b - a) / 1000).toFixed(1);
  const lines = [
    '# Launch-to-flight main-thread profile',
    '',
    `Profile: ${profileNote}. New Game seed ${FIXED_SEED}.`,
    '',
    `**Launch click to flight: ${secondsBetween(timeline.launchWallMs, timeline.flightWallMs)} s.** `
      + `New Game click to flight: ${secondsBetween(timeline.newGameWallMs, timeline.flightWallMs)} s. `
      + `The profile continues ${secondsBetween(timeline.flightWallMs, timeline.endWallMs)} s into held-thrust flight.`,
    '',
    '## Where the time went, by phase',
    '',
    'Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript',
    '(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on',
    'something off the main thread: driver shader compiles, network, decoding workers, timers.',
    '',
    '| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const phase of phases) {
    const summary = summarizeProfile(profile, index, toMicros(phase.from), toMicros(phase.to));
    phase.summary = summary;
    const busy = summary.totalMicros - summary.buckets.idle;
    const js = busy - summary.buckets.program - summary.buckets.gc;
    const tasks = trace.longTasks.filter((task) => task.wallMs >= phase.from && task.wallMs < phase.to);
    const taskMs = tasks.reduce((sum, task) => sum + task.duration, 0);
    lines.push(`| ${phase.name} | ${((phase.to - phase.from) / 1000).toFixed(2)} | ${sOf(busy)} | ${sOf(js)} `
      + `| ${sOf(summary.buckets.program)} | ${sOf(summary.buckets.idle)} | ${sOf(summary.buckets.gc)} `
      + `| ${tasks.length} / ${Math.round(taskMs)} |`);
  }
  lines.push('');

  for (const phase of phases) {
    if (phase.to - phase.from < 400) continue;
    const summary = phase.summary;
    const busyRows = summary.self.filter((row) => row.node.callFrame.functionName !== '(idle)');
    lines.push(`## ${phase.name} — ${((phase.to - phase.from) / 1000).toFixed(2)} s`, '');
    lines.push(...selfTable(summary, busyRows, 14, '### Top self time (idle excluded)'));
    lines.push(...fileTable(summary, 10, '### Self time by source'));
  }

  const phaseOf = (wallMs) => phases.find((phase) => wallMs >= phase.from && wallMs < phase.to)?.name || 'outside the profile';
  const tasks = [...trace.longTasks].sort((a, b) => a.wallMs - b.wallMs);
  lines.push('## Long tasks from New Game to the end of the profile', '');
  if (tasks.length) {
    lines.push('| at s (after Launch) | duration ms | during |', '|---:|---:|---|');
    for (const task of tasks.filter((entry) => entry.wallMs >= timeline.newGameWallMs).slice(0, 60)) {
      lines.push(`| ${secondsBetween(timeline.launchWallMs, task.wallMs)} | ${Math.round(task.duration)} | ${phaseOf(task.wallMs)} |`);
    }
  } else {
    lines.push('None observed.');
  }
  lines.push('');

  if (trace.rafStamps?.length) {
    const toPerf = (wallMs) => wallMs - trace.timeOrigin;
    const windows = phases.map((phase) => ({ id: phase.name, fromMs: toPerf(phase.from), toMs: toPerf(phase.to) }));
    lines.push(...smoothnessMarkdown(summarizeLoadingSmoothness({
      rafStamps: trace.rafStamps, loaf: trace.loaf, video: trace.video, windows,
    })));
  }

  if (trace.rafStamps?.length && timeline.endWallMs > timeline.flightWallMs) {
    lines.push('## Flight cadence by two-second bucket', '', '| seconds into flight | fps | p95 ms | worst ms | frames > 50 ms |', '|---|---:|---:|---:|---:|');
    for (let at = 0; timeline.flightWallMs + at * 1000 < timeline.endWallMs; at += 2) {
      const from = timeline.flightWallMs + at * 1000 - trace.timeOrigin;
      const to = Math.min(timeline.endWallMs, timeline.flightWallMs + (at + 2) * 1000) - trace.timeOrigin;
      const g = frameGapStats(trace.rafStamps, from, to);
      lines.push(`| ${at}-${at + 2} | ${g.fps.toFixed(1)} | ${g.p95.toFixed(1)} | ${g.worst.toFixed(0)} | ${g.over50} |`);
    }
    lines.push('');
  }

  lines.push(...resourceLines(trace.resources, timeline.launchWallMs, timeline.flightWallMs));

  lines.push('## Renderer resources', '', '| moment | programs | geometries | textures | JS heap MB |', '|---|---:|---:|---:|---:|');
  for (const [moment, snapshot] of [['entering flight', atFlight], ['end of profile', atEnd]]) {
    lines.push(`| ${moment} | ${snapshot?.programs ?? '?'} | ${snapshot?.geometries ?? '?'} | ${snapshot?.textures ?? '?'} | ${snapshot?.heapMb ?? '?'} |`);
  }
  lines.push('');
  lines.push(`Dispose-registration probe renders: ${atFlight?.disposeProbeRuns ?? '?'} at flight, ${atEnd?.disposeProbeRuns ?? '?'} at end of profile (once per context generation is right).`, '');
  lines.push(...linkBlockLines(atEnd?.linkBlocks || atFlight?.linkBlocks));
  if (atFlight?.openingPending?.length) {
    lines.push(`Opening work still pending when flight began: ${atFlight.openingPending.map((id) => `\`${id}\``).join(', ')}.`, '');
  }
  try {
    lines.push(...cookLedgerLines(atEnd?.openingCookLedger || atFlight?.openingCookLedger, timeline));
  } catch (error) {
    lines.push(`Opening cook ledger could not be formatted: ${error?.message}`, '');
  }

  lines.push(...entryTable(summarizeProfile(profile, index), 12));
  lines.push(...censusLines(census, '## Canvas census at the end of the profile'));
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), lines.join('\n'), 'utf8');
}

async function installLaunchObservers(page) {
  await page.evaluate(() => {
    const trace = { stages: [], longTasks: [], resources: [], observers: [], unsubscribe: null };
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          trace.longTasks.push({ startTime: entry.startTime, duration: entry.duration, wallMs: performance.timeOrigin + entry.startTime });
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
      trace.observers.push(longTaskObserver);
    } catch { /* long-task observation is best-effort */ }
    try {
      // An observer, not getEntriesByType: the resource timing buffer holds only 250 entries.
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          trace.resources.push({
            name: entry.name,
            initiatorType: entry.initiatorType,
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
            duration: entry.duration,
            wallMs: performance.timeOrigin + entry.startTime,
          });
        }
      });
      resourceObserver.observe({ type: 'resource' });
      trace.observers.push(resourceObserver);
    } catch { /* resource observation is best-effort */ }
    // What the player sees: the page's own frame cadence, long animation frames (with the scripts that held
    // them) and the backdrop video's dropped frames. Read by scripts/lib/loadingSmoothness.mjs.
    trace.rafStamps = [];
    trace.loaf = [];
    trace.video = [];
    trace.timeOrigin = performance.timeOrigin;
    let rafActive = true;
    const rafTick = (now) => {
      if (!rafActive) return;
      if (trace.rafStamps.length < 60000) trace.rafStamps.push(now);
      requestAnimationFrame(rafTick);
    };
    requestAnimationFrame(rafTick);
    trace.observers.push({ disconnect() { rafActive = false; } });
    try {
      const loafObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (trace.loaf.length >= 800) break;
          trace.loaf.push({
            startTime: entry.startTime,
            duration: entry.duration,
            blockingDuration: entry.blockingDuration,
            scripts: (entry.scripts || []).slice(0, 8).map((script) => ({
              sourceURL: script.sourceURL,
              sourceFunctionName: script.sourceFunctionName,
              invoker: script.invoker,
              duration: script.duration,
              forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration,
            })),
          });
        }
      });
      loafObserver.observe({ type: 'long-animation-frame', buffered: true });
      trace.observers.push(loafObserver);
    } catch { /* long-animation-frame needs Chrome 123+; absent means no attribution rows */ }
    const videoTimer = setInterval(() => {
      const video = document.querySelector('video');
      const quality = video && typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;
      if (quality) trace.video.push({ t: performance.now(), total: quality.totalVideoFrames, dropped: quality.droppedVideoFrames });
    }, 250);
    trace.observers.push({ disconnect() { clearInterval(videoTimer); } });
    const bus = window.SF?.bus;
    if (bus && typeof bus.on === 'function') {
      trace.unsubscribe = bus.on('game:loadingProgress', (payload = {}) => {
        const id = String(payload.id || '');
        const last = trace.stages[trace.stages.length - 1];
        if (!last || last.id !== id) trace.stages.push({ id, wallMs: Date.now() });
      });
    }
    window.__SF_PROFILE_LAUNCH__ = trace;
  });
}

async function collectLaunchObservers(page) {
  return page.evaluate(() => {
    const trace = window.__SF_PROFILE_LAUNCH__;
    if (!trace) return { stages: [], longTasks: [], resources: [], rafStamps: [], loaf: [], video: [], timeOrigin: 0 };
    for (const observer of trace.observers) {
      try { observer.disconnect(); } catch { /* already gone */ }
    }
    try { trace.unsubscribe?.(); } catch { /* bus already torn down */ }
    delete window.__SF_PROFILE_LAUNCH__;
    return {
      stages: trace.stages,
      longTasks: trace.longTasks,
      resources: trace.resources,
      rafStamps: trace.rafStamps || [],
      loaf: trace.loaf || [],
      video: trace.video || [],
      timeOrigin: trace.timeOrigin || 0,
    };
  }).catch(() => ({ stages: [], longTasks: [], resources: [] }));
}

/**
 * A visible button by its text, found with a plain DOM query. Playwright's role locators build an ARIA tree of the page
 * inside the page's main thread (isElementHiddenForAria, getAriaRole, queryRole) and run actionability polls: that showed
 * up as 50-100 ms long tasks on the New Game screen and at the Launch click, in the very windows being measured.
 */
async function findButtonCenter(page, pattern) {
  return page.evaluate(([source, flags]) => {
    const re = new RegExp(source, flags);
    for (const button of document.querySelectorAll('button')) {
      if (!re.test((button.textContent || '').trim())) continue;
      const rect = button.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    return null;
  }, [pattern.source, pattern.flags]);
}

async function waitForButton(page, pattern, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const center = await findButtonCenter(page, pattern).catch(() => null);
    if (center) return center;
    if (Date.now() > deadline) return null;
    await page.waitForTimeout(150);
  }
}

async function clickButton(page, pattern, timeoutMs = 60_000) {
  const center = await waitForButton(page, pattern, timeoutMs);
  if (!center) throw new Error(`button ${pattern} never appeared`);
  await page.mouse.click(center.x, center.y);
}

async function clickNewGameAndLaunch(page) {
  await clickButton(page, /^New Game$/);
  log(`New Game seed ${FIXED_SEED}`);
  try {
    await clickButton(page, /^Launch$/i);
  } catch {
    log('no Launch button on this route; continuing');
  }
}

async function waitForFlight(page, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  let mode = null;
  while (Date.now() < deadline) {
    mode = await page
      .evaluate(() => {
        try { return window.__SF_WITNESS__?.verdict?.()?.facts?.mode ?? null; } catch { return null; }
      })
      .catch(() => null);
    if (mode === 'flight') return Date.now();
    await page.waitForTimeout(pollMs);
  }
  throw new Error(`never entered flight (mode=${mode})`);
}

/** The Crucible button's own route (default kit, fixed seed); every armory draft is answered with 'keep'. */
async function launchCrucible(page) {
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });
  const launched = await page.evaluate(async () => {
    const launch = await import('/src/ui/crucibleLaunch.js');
    const setup = launch.crucibleSetupFor({ seed: 4242 });
    if (!setup || !setup.ok) return false;
    window.__SF_PROFILE_DRAFT_ANSWER__ = setInterval(() => {
      const st = window.SF && window.SF.state;
      if (st && st.run && st.run.phase === 'draft') window.SF.bus.emit('run:draftPickRequested', { offerId: null });
    }, 250);
    return launch.requestCrucibleRun(window.SF.bus, setup.value, setup.ruleset) !== false;
  });
  if (!launched) throw new Error('Crucible run did not launch');
  log('Crucible run requested (seed 4242, default kit)');
}

async function runSteadyFlightProfile(page, cdp) {
  if (CRUCIBLE) await launchCrucible(page); else await clickNewGameAndLaunch(page);
  await waitForFlight(page, 180_000, 1000);
  if (SETTLE_MS > 0) { log(`flying ${SETTLE_MS} ms before the profile window`); await page.waitForTimeout(SETTLE_MS); }
  if (EVAL_FILE) {
    const source = fs.readFileSync(path.resolve(EVAL_FILE), 'utf8');
    log(`running ${EVAL_FILE} in the page`);
    const result = await page.evaluate(source);
    fs.writeFileSync(path.join(OUT_DIR, 'eval-result.json'), JSON.stringify(result, null, 1), 'utf8');
    log(`eval result: ${JSON.stringify(result).slice(0, 3000)}`);
    fs.writeFileSync(path.join(OUT_DIR, 'report.md'), ['# Eval run', '', 'See eval-result.json.', ''].join('\n'), 'utf8');
    return;
  }

  await page.evaluate(() => {
    window.__SF_PROFILE_LONGTASKS__ = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__SF_PROFILE_LONGTASKS__.push({ startTime: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      window.__SF_PROFILE_LONGTASK_OBSERVER__ = observer;
    } catch { /* longtask observation is best-effort */ }
  });

  if (GPU_TIMERS) {
    const gpuOn = await page.evaluate(() => {
      const timers = window.SF?.state?.render?.gpuTimers;
      if (!timers || typeof timers.setEnabled !== 'function') return 'no gpuTimers on state.render';
      timers.setEnabled(true);
      return timers.getCapability ? JSON.stringify(timers.getCapability()) : 'enabled';
    }).catch((error) => String(error));
    log(`gpu timers: ${gpuOn}`);
  }
  log(`profiling ${WINDOW_MS} ms of held-thrust flight`);
  await cdp.send('Profiler.start');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(WINDOW_MS);
  await page.keyboard.up('KeyW').catch(() => {});
  const { profile } = await cdp.send('Profiler.stop');

  const census = await page.evaluate(canvasCensusInPage).catch(() => []);
  const longTasks = await page.evaluate(() => window.__SF_PROFILE_LONGTASKS__ || []).catch(() => []);
  // The flight-footage recorder (a JPEG ring behind the Moment clips) must still fill and decode.
  const footage = await page.evaluate(async () => {
    const module = await import('/src/ui/screens/flightFootage.js');
    const active = module.getFlightFootage();
    if (!active) return { installed: false };
    const frames = active.ring.frames;
    const last = frames.at(-1);
    let decoded = null;
    if (last) {
      try { const bitmap = await createImageBitmap(last.blob); decoded = { width: bitmap.width, height: bitmap.height }; bitmap.close(); }
      catch (error) { decoded = { error: String(error) }; }
    }
    return { installed: true, ...active.status(), lastBytes: last ? last.blob.size : 0, decoded };
  }).catch((error) => ({ error: String(error) }));
  log(`flight footage: ${JSON.stringify(footage)}`);
  if (GPU_TIMERS) {
    const report = await page.evaluate(() => {
      const timers = window.SF?.state?.render?.gpuTimers;
      return timers && typeof timers.getReport === 'function' ? timers.getReport() : null;
    }).catch(() => null);
    if (report) {
      fs.writeFileSync(path.join(OUT_DIR, 'gpu-timers.json'), JSON.stringify(report, null, 1), 'utf8');
      log(`gpu timers report: ${JSON.stringify(report).slice(0, 1800)}`);
    } else log('gpu timers: no report');
  }
  await page
    .evaluate(() => {
      try { window.__SF_PROFILE_LONGTASK_OBSERVER__?.disconnect(); } catch { /* already gone */ }
      delete window.__SF_PROFILE_LONGTASK_OBSERVER__;
      delete window.__SF_PROFILE_LONGTASKS__;
    })
    .catch(() => {});

  const summary = writeSteadyReport(profile, census, longTasks);
  fs.writeFileSync(path.join(OUT_DIR, 'profile.cpuprofile'), JSON.stringify(profile), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'canvas-census.json'), JSON.stringify(census, null, 1), 'utf8');

  const top = summary.entries[0];
  log(`top-level owner: ${top ? `${top[0]} (${((100 * top[1]) / summary.totalMicros).toFixed(1)}%)` : 'none'}`);
  log(`long tasks in window: ${longTasks.length}`);
}

/** Main-thread self time per trace event, cut into the same windows as the stage table. */
function writeTraceSummary(traceFile, clockSyncWallMs, timeline, stages) {
  let events;
  try {
    events = traceEventsOf(JSON.parse(fs.readFileSync(traceFile, 'utf8')));
  } catch (error) {
    log(`trace unreadable (${error?.message}); no trace summary`);
    return;
  }
  const sync = events.find((event) => event.name === 'sf-clock-sync');
  if (!sync) { log('trace has no clock-sync mark; no trace summary'); return; }
  const toTrace = (wallMs) => sync.ts + (wallMs - clockSyncWallMs) * 1000;
  const windows = [{ id: 'New Game screen', fromUs: toTrace(timeline.newGameWallMs), toUs: toTrace(timeline.launchWallMs) }];
  const staged = [...stages].sort((a, b) => a.wallMs - b.wallMs);
  staged.forEach((stage, index) => {
    const next = staged[index + 1];
    windows.push({
      id: `loading: ${stage.id}`,
      fromUs: toTrace(stage.wallMs),
      toUs: toTrace(next ? next.wallMs : timeline.flightWallMs),
    });
  });
  windows.push({ id: 'first seconds of flight', fromUs: toTrace(timeline.flightWallMs), toUs: toTrace(timeline.endWallMs) });
  const summary = summarizeMainThread(events, { windows: windows.filter((w) => w.toUs > w.fromUs) });
  fs.writeFileSync(path.join(OUT_DIR, 'trace-summary.md'), renderTraceSummaryMarkdown(summary), 'utf8');
  log(`trace summary ${path.join(OUT_DIR, 'trace-summary.md')} (${events.length} events)`);
}

/** Live allocation sites from V8's sampling heap profiler, rolled up by function and by source file. */
async function writeHeapSampling(cdp, heapMarks) {
  // stopSampling returns the profile of objects still alive when it is called.
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const byFunction = new Map();
  const byFile = new Map();
  let total = 0;
  const shortUrl = (url) => String(url || '(native)').replace(/^.*\/(src|vendor|scripts)\//, '$1/').replace(/^.*SpaceFace\//, '');
  const walk = (node) => {
    const self = node.selfSize || 0;
    if (self > 0) {
      const frame = node.callFrame || {};
      const file = shortUrl(frame.url);
      const fn = `${frame.functionName || '(anonymous)'} @ ${file}:${(frame.lineNumber ?? 0) + 1}`;
      byFunction.set(fn, (byFunction.get(fn) || 0) + self);
      byFile.set(file, (byFile.get(file) || 0) + self);
      total += self;
    }
    for (const child of node.children || []) walk(child);
  };
  walk(profile.head);
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([name, bytes]) => ({ name, mb: +(bytes / 1048576).toFixed(1) }));
  const result = { liveSampledMB: +(total / 1048576).toFixed(1), heapMarks, byFile: top(byFile, 25), byFunction: top(byFunction, 40) };
  fs.writeFileSync(path.join(OUT_DIR, 'heap-sampling.json'), JSON.stringify(result, null, 1), 'utf8');
  const rows = (list) => list.map((row) => `| ${row.mb} | \`${row.name}\` |`).join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'heap-sampling.md'), [
    '# Live heap by allocation site (V8 sampling profiler, 16 KB interval)', '',
    `Sampled live total: ${result.liveSampledMB} MB. JS heap at milestones: ${heapMarks.map((m) => `${m.label} ${m.usedMB} MB`).join(', ')}.`, '',
    '## By source file', '', '| MB | file |', '|---:|---|', rows(result.byFile), '',
    '## By function', '', '| MB | function |', '|---:|---|', rows(result.byFunction), '',
  ].join('\n'), 'utf8');
  log(`heap sampling: ${result.liveSampledMB} MB live sampled; ${heapMarks.map((m) => `${m.label} ${m.usedMB} MB`).join(', ')}`);
}

async function runLaunchProfile(page, cdp, profileNote) {
  // window.SF and its bus exist only once boot finishes; the title screen's New Game button is the
  // public signal. Subscribing at domcontentloaded silently misses every loading stage.
  if (!(await waitForButton(page, /^New Game$/, 120_000))) throw new Error('the title menu never showed New Game');
  await page.waitForFunction(() => typeof window.SF?.bus?.on === 'function', null, { timeout: 60_000 })
    .catch(() => log('window.SF.bus never appeared; the loading-stage timeline will be empty'));
  if (MENU_DWELL_MS > 0) { log(`reading the title menu for ${MENU_DWELL_MS} ms first`); await page.waitForTimeout(MENU_DWELL_MS); }
  await installLaunchObservers(page);
  const heapMarks = [];
  const markHeap = async (label) => {
    const used = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null)).catch(() => null);
    heapMarks.push({ label, usedMB: used == null ? null : Math.round(used / 1048576) });
  };
  if (HEAP_SAMPLING) {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384 });
    await markHeap('before New Game');
  }
  await cdp.send('Profiler.start');
  if (TRACE) await startTrace(cdp);
  // One user-timing mark on both clocks: the trace's monotonic microseconds <-> Date.now().
  const clockSync = TRACE ? await page.evaluate(() => { performance.mark('sf-clock-sync'); return Date.now(); }) : null;
  const profileStartWallMs = Date.now();

  const newGameWallMs = Date.now();
  await clickButton(page, /^New Game$/);
  log(`New Game seed ${FIXED_SEED}`);
  if (LAUNCH_DWELL_MS > 0) {
    await waitForButton(page, /^Launch$/i, 60_000);
    log(`staying ${LAUNCH_DWELL_MS} ms on the New Game screen before Launch`);
    await page.waitForTimeout(LAUNCH_DWELL_MS);
  }
  try {
    await clickButton(page, /^Launch$/i);
  } catch {
    log('no Launch button on this route; continuing');
  }
  const launchWallMs = Date.now();

  const flightWallMs = await waitForFlight(page, 240_000, 250);
  if (HEAP_SAMPLING) await markHeap('first flight frame');
  const atFlight = await page.evaluate(readGpuAndOpeningInPage).catch(() => null);
  log(`entered flight ${((flightWallMs - launchWallMs) / 1000).toFixed(1)} s after Launch; ${HOLD_STILL ? 'holding still' : 'holding thrust'} ${FLIGHT_TAIL_MS} ms`);

  if (!HOLD_STILL) await page.keyboard.down('KeyW');
  await page.waitForTimeout(FLIGHT_TAIL_MS);
  if (!HOLD_STILL) await page.keyboard.up('KeyW').catch(() => {});
  const { profile } = await cdp.send('Profiler.stop');
  const endWallMs = Date.now();
  if (HEAP_SAMPLING) {
    await markHeap('end of flight tail');
    await writeHeapSampling(cdp, heapMarks);
  }
  const traceFile = TRACE ? path.join(OUT_DIR, 'trace.json') : null;
  if (TRACE) await stopTraceToFile(cdp, traceFile);

  const atEnd = await page.evaluate(readGpuAndOpeningInPage).catch(() => null);
  const census = await page.evaluate(canvasCensusInPage).catch(() => []);
  const trace = await collectLaunchObservers(page);
  const timeline = { profileStartWallMs, newGameWallMs, launchWallMs, flightWallMs, endWallMs };

  writeLaunchReport({ profile, trace, timeline, atFlight, atEnd, census, profileNote });
  fs.writeFileSync(path.join(OUT_DIR, 'profile.cpuprofile'), JSON.stringify(profile), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'canvas-census.json'), JSON.stringify(census, null, 1), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'launch-trace.json'), JSON.stringify({ timeline, stages: trace.stages, longTasks: trace.longTasks, atFlight, atEnd }, null, 1), 'utf8');
  if (TRACE) writeTraceSummary(traceFile, clockSync, timeline, trace.stages);
  log(`stages: ${trace.stages.map((stage) => `${stage.id}@${((stage.wallMs - launchWallMs) / 1000).toFixed(1)}s`).join(' ')}`);
  log(`long tasks: ${trace.longTasks.length}; resources observed: ${trace.resources.length}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const { _electron: electron } = await loadPlaywright();
const baseEnv = { ...process.env, SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' };
const launch = KEEP_PROFILE
  ? createKeptElectronLaunch(KEEP_PROFILE, baseEnv)
  : createIsolatedElectronLaunch({ root: ROOT, taskId: 'main-thread-profile', timeout: 180_000, baseEnv });
if (EXTRA_CHROMIUM_ARGS.length) launch.options.args = [...(launch.options.args || []), ...EXTRA_CHROMIUM_ARGS];
const profileNote = KEEP_PROFILE
  ? `kept evidence profile \`${path.basename(launch.userDataDir)}\` (${launch.existed ? 'reused: warm GPU program and HTTP caches' : 'new: cold start'})`
  : 'fresh temporary evidence profile (cold GPU program cache and HTTP cache)';

let app = null;
let runtimeClosed = false;
try {
  log(`launching isolated Electron; ${profileNote}`);
  app = await electron.launch(launch.options);
  const page = await app.firstWindow({ timeout: 180_000 });
  await page.waitForLoadState('domcontentloaded');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  // A launch window runs ~60 s; half-millisecond sampling keeps the profile a manageable size.
  await cdp.send('Profiler.setSamplingInterval', { interval: SAMPLING_US > 100 ? SAMPLING_US : (FROM_LAUNCH ? 500 : 200) });

  if (FROM_LAUNCH) await runLaunchProfile(page, cdp, profileNote);
  else await runSteadyFlightProfile(page, cdp);
  log(`report ${path.join(OUT_DIR, 'report.md')}`);
} finally {
  try {
    await app?.close();
    runtimeClosed = true;
  } catch { /* the app may already be gone */ }
  try {
    launch.cleanup({ runtimeClosed });
  } catch (error) {
    console.warn('[main-thread-profile] isolated profile cleanup failed:', error?.message);
  }
}
