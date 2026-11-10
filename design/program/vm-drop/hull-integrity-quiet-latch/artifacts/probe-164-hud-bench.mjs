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
const LABEL = safeName(argValue('--label'), 48);
const KEEP_PROFILE = safeName(argValue('--keep-profile'), 40);
const DROP_PROFILE = safeName(argValue('--drop-profile'), 40);
const OUT_DIR = path.join(ROOT, '.devshots', 'main-thread-profile', ...(LABEL ? [LABEL] : []));
const FIXED_SEED = 47;

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

  lines.push(...resourceLines(trace.resources, timeline.launchWallMs, timeline.flightWallMs));

  lines.push('## Renderer resources', '', '| moment | programs | geometries | textures | JS heap MB |', '|---|---:|---:|---:|---:|');
  for (const [moment, snapshot] of [['entering flight', atFlight], ['end of profile', atEnd]]) {
    lines.push(`| ${moment} | ${snapshot?.programs ?? '?'} | ${snapshot?.geometries ?? '?'} | ${snapshot?.textures ?? '?'} | ${snapshot?.heapMb ?? '?'} |`);
  }
  lines.push('');
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
    if (!trace) return { stages: [], longTasks: [], resources: [] };
    for (const observer of trace.observers) {
      try { observer.disconnect(); } catch { /* already gone */ }
    }
    try { trace.unsubscribe?.(); } catch { /* bus already torn down */ }
    delete window.__SF_PROFILE_LAUNCH__;
    return { stages: trace.stages, longTasks: trace.longTasks, resources: trace.resources };
  }).catch(() => ({ stages: [], longTasks: [], resources: [] }));
}

async function clickNewGameAndLaunch(page) {
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 60_000 });
  log(`New Game seed ${FIXED_SEED}`);
  try {
    await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 60_000 });
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

async function runSteadyFlightProfile(page, cdp) {
  await clickNewGameAndLaunch(page);
  await waitForFlight(page, 180_000, 1000);

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

  log(`profiling ${WINDOW_MS} ms of held-thrust flight`);
  await cdp.send('Profiler.start');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(WINDOW_MS);
  await page.keyboard.up('KeyW').catch(() => {});
  const { profile } = await cdp.send('Profiler.stop');

  const bench = await page.evaluate(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const mod = await import('/src/ui/views/hullIntegrity.js');
    const live = document.querySelector('.sf-integrity');
    const parent = live?.parentNode || document.body;
    const st = window.SF?.state; const livePlayer = st?.entities?.get?.(st.playerId) || null;
    const defId = livePlayer?.data?.defId || 'ship_kestrel';
    const snap = { id: 'bench', hull: livePlayer?.hull ?? 86, hullMax: livePlayer?.hullMax ?? 100,
      shield: livePlayer?.shield ?? 78, shieldMax: livePlayer?.shieldMax ?? 100, data: { defId } };
    const host = document.createElement('div');
    host.className = 'sf-schematic sf-integrity';
    host.innerHTML = mod.shipConditionMarkup(defId, 'bench164');
    parent.appendChild(host);
    const N = 4000, ROUNDS = 11;
    const quiet = (on) => { mod.setHullIntegrityQuietLatchForBench(on); const t = performance.now();
      for (let i = 0; i < N; i++) mod.updateShipCondition(host, snap, 1 / 60, false, false);
      return (performance.now() - t) * 1000 / N; };
    const live2 = (on) => { mod.setHullIntegrityQuietLatchForBench(on); const t = performance.now();
      for (let i = 0; i < N; i++) { snap.hull = (i & 1) ? 60 : 61; mod.updateShipCondition(host, snap, 1 / 60, false, false); }
      snap.hull = 60; for (let i = 0; i < 400; i++) mod.updateShipCondition(host, snap, 0, false, false);
      return (performance.now() - t) * 1000 / N; };
    for (let w = 0; w < 6; w++) { quiet(true); quiet(false); live2(true); live2(false); await raf(); }
    const hull = { on: [], off: [], liveOn: [], liveOff: [] };
    for (let r = 0; r < ROUNDS; r++) {
      if (r & 1) { hull.off.push(quiet(false)); hull.on.push(quiet(true)); }
      else { hull.on.push(quiet(true)); hull.off.push(quiet(false)); }
      await raf();
      if (r & 1) { hull.liveOff.push(live2(false)); hull.liveOn.push(live2(true)); }
      else { hull.liveOn.push(live2(true)); hull.liveOff.push(live2(false)); }
      await raf();
    }
    // Per-frame cadence (the production shape: one call per presented frame, cold caches).
    const FRH = 600; const pf = { on: 0, off: 0, n: 0 };
    for (let f = 0; f < FRH * 2; f++) {
      await raf(); const on = (f & 1) === 0; mod.setHullIntegrityQuietLatchForBench(on);
      const t = performance.now(); mod.updateShipCondition(host, snap, 1 / 60, false, false); const d = performance.now() - t;
      if (on) pf.on += d; else pf.off += d;
    }
    hull.perFrameOnUs = pf.on * 1000 / FRH; hull.perFrameOffUs = pf.off * 1000 / FRH; hull.perFrameFrames = FRH;
    // Is the live ship quiet? Count frames where any input to the latch moved on the real player.
    let changed = 0, prev = null;
    for (let f = 0; f < 300; f++) { await raf(); const s2 = window.SF?.state; const p = s2?.entities?.get?.(s2.playerId); const k = p ? [p.hull, p.shield, p.hullMax, p.shieldMax, p.data?.defId].join('|') : 'none'; if (prev !== null && k !== prev) changed++; prev = k; }
    hull.liveInputChangedFrames = changed; hull.liveFramesObserved = 300; hull.liveKey = prev;
    mod.setHullIntegrityQuietLatchForBench(true);
    host.remove();
    // Patch A: the per-frame heap sample. Before = performance.memory read each frame (tier-1 off,
    // value discarded); after = the isEnabled() gate only. Tight loop + per-frame cadence.
    const tier1 = { isEnabled: () => false, sampleHeap() {} };
    let sink = 0;
    const memBefore = () => { const t = performance.now(); for (let i = 0; i < N; i++) { sink += globalThis.performance?.memory?.usedJSHeapSize || 0; } return (performance.now() - t) * 1000 / N; };
    const memAfter = () => { const t = performance.now(); for (let i = 0; i < N; i++) { if (tier1 && (typeof tier1.isEnabled !== 'function' || tier1.isEnabled())) sink += globalThis.performance?.memory?.usedJSHeapSize || 0; } return (performance.now() - t) * 1000 / N; };
    for (let w = 0; w < 4; w++) { memBefore(); memAfter(); await raf(); }
    const mem = { before: [], after: [], perFrameBeforeUs: 0, perFrameFrames: 0 };
    for (let r = 0; r < ROUNDS; r++) { if (r & 1) { mem.after.push(memAfter()); mem.before.push(memBefore()); } else { mem.before.push(memBefore()); mem.after.push(memAfter()); } await raf(); }
    let acc = 0; const FR = 240;
    for (let f = 0; f < FR; f++) { await raf(); const t = performance.now(); sink += performance.memory?.usedJSHeapSize || 0; acc += performance.now() - t; }
    mem.perFrameBeforeUs = acc * 1000 / FR; mem.perFrameFrames = FR;
    const med = (x) => { const y = x.slice().sort((a, b) => a - b); return y[Math.floor(y.length / 2)]; };
    return { defId, hull, mem, sink: sink > 0,
      hullQuietMedOnUs: med(hull.on), hullQuietMedOffUs: med(hull.off), hullLiveMedOnUs: med(hull.liveOn), hullLiveMedOffUs: med(hull.liveOff),
      memMedBeforeUs: med(mem.before), memMedAfterUs: med(mem.after) };
  }).catch((e) => ({ err: String(e && e.stack || e) }));
  log(`BENCH164 ${JSON.stringify(bench)}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'bench164.json'), JSON.stringify(bench, null, 1), 'utf8');

  const census = await page.evaluate(canvasCensusInPage).catch(() => []);
  const longTasks = await page.evaluate(() => window.__SF_PROFILE_LONGTASKS__ || []).catch(() => []);
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

async function runLaunchProfile(page, cdp, profileNote) {
  // window.SF and its bus exist only once boot finishes; the title screen's New Game button is the
  // public signal. Subscribing at domcontentloaded silently misses every loading stage.
  await page.getByRole('button', { name: 'New Game', exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
  await page.waitForFunction(() => typeof window.SF?.bus?.on === 'function', null, { timeout: 60_000 })
    .catch(() => log('window.SF.bus never appeared; the loading-stage timeline will be empty'));
  await installLaunchObservers(page);
  await cdp.send('Profiler.start');
  const profileStartWallMs = Date.now();

  const newGameWallMs = Date.now();
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 60_000 });
  log(`New Game seed ${FIXED_SEED}`);
  if (LAUNCH_DWELL_MS > 0) {
    await page.getByRole('button', { name: /^Launch$/i }).waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
    log(`staying ${LAUNCH_DWELL_MS} ms on the New Game screen before Launch`);
    await page.waitForTimeout(LAUNCH_DWELL_MS);
  }
  try {
    await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 60_000 });
  } catch {
    log('no Launch button on this route; continuing');
  }
  const launchWallMs = Date.now();

  const flightWallMs = await waitForFlight(page, 240_000, 250);
  const atFlight = await page.evaluate(readGpuAndOpeningInPage).catch(() => null);
  log(`entered flight ${((flightWallMs - launchWallMs) / 1000).toFixed(1)} s after Launch; holding thrust ${FLIGHT_TAIL_MS} ms`);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(FLIGHT_TAIL_MS);
  await page.keyboard.up('KeyW').catch(() => {});
  const { profile } = await cdp.send('Profiler.stop');
  const endWallMs = Date.now();

  const atEnd = await page.evaluate(readGpuAndOpeningInPage).catch(() => null);
  const census = await page.evaluate(canvasCensusInPage).catch(() => []);
  const trace = await collectLaunchObservers(page);
  const timeline = { profileStartWallMs, newGameWallMs, launchWallMs, flightWallMs, endWallMs };

  writeLaunchReport({ profile, trace, timeline, atFlight, atEnd, census, profileNote });
  fs.writeFileSync(path.join(OUT_DIR, 'profile.cpuprofile'), JSON.stringify(profile), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'canvas-census.json'), JSON.stringify(census, null, 1), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'launch-trace.json'), JSON.stringify({ timeline, stages: trace.stages, longTasks: trace.longTasks, atFlight, atEnd }, null, 1), 'utf8');
  log(`stages: ${trace.stages.map((stage) => `${stage.id}@${((stage.wallMs - launchWallMs) / 1000).toFixed(1)}s`).join(' ')}`);
  log(`long tasks: ${trace.longTasks.length}; resources observed: ${trace.resources.length}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const { _electron: electron } = await loadPlaywright();
const baseEnv = { ...process.env, SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' };
const launch = KEEP_PROFILE
  ? createKeptElectronLaunch(KEEP_PROFILE, baseEnv)
  : createIsolatedElectronLaunch({ root: ROOT, taskId: 'main-thread-profile', timeout: 180_000, baseEnv });
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
  await cdp.send('Profiler.setSamplingInterval', { interval: FROM_LAUNCH ? 500 : 200 });

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
