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
//
// Writes .devshots/main-thread-profile/{profile.cpuprofile,report.md,canvas-census.json}.
// The .cpuprofile opens directly in Chrome DevTools' Performance panel (Load profile...).
//
// Conventions: isolated evidence Electron (never the player profile), writes only under the ignored
// .devshots tree, and always closes the app and removes its temporary profile directory.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIsolatedElectronLaunch } from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, '.devshots', 'main-thread-profile');
const WINDOW_MS = Number(
  process.argv.find((a) => a.startsWith('--ms='))?.slice(5) || process.env.SPACEFACE_PROFILE_MS || 20_000,
);
const FIXED_SEED = 47;

const log = (message) => console.log(`[main-thread-profile ${new Date().toISOString().slice(11, 19)}] ${message}`);

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

/**
 * Self time per call frame and inclusive time per top-level entry point.
 * The second table is the one that names an owner: a parasite shows up as a top-level entry that
 * is not the game's own presentation frame.
 */
function summarizeProfile(profile) {
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) {
    for (const childId of node.children || []) parentOf.set(childId, node.id);
  }

  const selfMicros = new Map();
  let totalMicros = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const delta = Math.max(0, profile.timeDeltas?.[i] || 0);
    totalMicros += delta;
    const id = profile.samples[i];
    selfMicros.set(id, (selfMicros.get(id) || 0) + delta);
  }

  const label = (node) => {
    const frame = node.callFrame;
    const url = String(frame.url || '')
      .replace(/^https?:\/\/[^/]+\//, '')
      .replace(/^file:\/\/.*?([^/\\]+)$/, '$1');
    return `${frame.functionName || '(anonymous)'} @ ${url || 'native'}:${frame.lineNumber + 1}`;
  };

  const self = [...selfMicros.entries()]
    .map(([id, micros]) => ({ micros, node: nodesById.get(id) }))
    .filter((row) => row.node)
    .sort((a, b) => b.micros - a.micros);

  const entryMicros = new Map();
  for (const [id, micros] of selfMicros) {
    const chain = [];
    for (let cursor = id; cursor != null; cursor = parentOf.get(cursor)) chain.push(cursor);
    const entryId = chain.length >= 2 ? chain[chain.length - 2] : chain[chain.length - 1];
    const entryNode = nodesById.get(entryId);
    const key = entryNode ? label(entryNode) : '(root)';
    entryMicros.set(key, (entryMicros.get(key) || 0) + micros);
  }

  return { totalMicros, self, label, entries: [...entryMicros.entries()].sort((a, b) => b[1] - a[1]) };
}

function writeReport({ totalMicros, self, label, entries }, census, longTasks) {
  const pct = (micros) => `${((100 * micros) / (totalMicros || 1)).toFixed(1)}%`;
  const ms = (micros) => (micros / 1000).toFixed(1);
  const lines = [
    '# Main-thread profile',
    '',
    `Window: ${ms(totalMicros)} ms of flight. Long tasks recorded in the window: **${longTasks.length}**.`,
    '',
    '## Top-level entry points (inclusive)',
    '',
    'The owner of the frame. Anything here that is not the game\'s own presentation frame is work',
    'the in-engine hitch classifier cannot see.',
    '',
    '| ms | share | entry |',
    '|---:|---:|---|',
    ...entries.slice(0, 15).map(([key, micros]) => `| ${ms(micros)} | ${pct(micros)} | \`${key}\` |`),
    '',
    '## Top self time',
    '',
    '| ms | share | function |',
    '|---:|---:|---|',
    ...self.slice(0, 25).map((row) => `| ${ms(row.micros)} | ${pct(row.micros)} | \`${label(row.node)}\` |`),
    '',
    '## Canvas census during flight',
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
  if (longTasks.length) {
    lines.push('## Long tasks in the window', '', '| start ms | duration ms |', '|---:|---:|');
    for (const task of longTasks.slice(0, 20)) {
      lines.push(`| ${Math.round(task.startTime)} | ${Math.round(task.duration)} |`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), lines.join('\n'), 'utf8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const { _electron: electron } = await loadPlaywright();
const launch = createIsolatedElectronLaunch({
  root: ROOT,
  taskId: 'main-thread-profile',
  timeout: 180_000,
  baseEnv: { ...process.env, SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' },
});

let app = null;
let runtimeClosed = false;
try {
  log('launching isolated Electron');
  app = await electron.launch(launch.options);
  const page = await app.firstWindow({ timeout: 180_000 });
  await page.waitForLoadState('domcontentloaded');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });

  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 60_000 });
  log(`New Game seed ${FIXED_SEED}`);
  try {
    await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 60_000 });
  } catch {
    log('no Launch button on this route; continuing');
  }

  const deadline = Date.now() + 180_000;
  let mode = null;
  while (Date.now() < deadline) {
    mode = await page
      .evaluate(() => {
        try { return window.__SF_WITNESS__?.verdict?.()?.facts?.mode ?? null; } catch { return null; }
      })
      .catch(() => null);
    if (mode === 'flight') break;
    await page.waitForTimeout(1000);
  }
  if (mode !== 'flight') throw new Error(`never entered flight (mode=${mode})`);

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

  const census = await page.evaluate(canvasCensusInPage).catch(() => []);
  const longTasks = await page.evaluate(() => window.__SF_PROFILE_LONGTASKS__ || []).catch(() => []);
  await page
    .evaluate(() => {
      try { window.__SF_PROFILE_LONGTASK_OBSERVER__?.disconnect(); } catch { /* already gone */ }
      delete window.__SF_PROFILE_LONGTASK_OBSERVER__;
      delete window.__SF_PROFILE_LONGTASKS__;
    })
    .catch(() => {});

  const summary = summarizeProfile(profile);
  fs.writeFileSync(path.join(OUT_DIR, 'profile.cpuprofile'), JSON.stringify(profile), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'canvas-census.json'), JSON.stringify(census, null, 1), 'utf8');
  writeReport(summary, census, longTasks);

  const top = summary.entries[0];
  log(`top-level owner: ${top ? `${top[0]} (${((100 * top[1]) / summary.totalMicros).toFixed(1)}%)` : 'none'}`);
  log(`long tasks in window: ${longTasks.length}`);
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
