#!/usr/bin/env node
// PROBE LOAD-TIME: cold and warm startup timing through the real browser route.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-load-time.mjs [--runs=3] [--no-flight] [--out=<dir>] [--source-overlay=<manifest>]
//
// --source-overlay serves a frozen source snapshot (scripts/create-source-baseline.mjs)
// instead of the working tree: interleave overlay/live invocations for cut attribution.
//
// Each run launches a FRESH Chromium profile (cold: no HTTP/V8/shader caches), navigates
// to a disposable bench server, and waits for the game's own boot timeline
// (window.__SF_BOOT_TIMELINE__) to reach `title-interactive`. It then reloads the same
// context (warm: HTTP cache + V8 code cache + shader cache hot) and measures again.
// On the warm leg it also drives the ordinary New Game route so the flight-leg marks
// (new-game-pressed -> first-flight-frame -> first-ship-frame -> upgrade-queue-drained)
// are collected in the same session.
//
// Prints the per-stage table (median across runs), the five slowest resources, and the
// five longest main-thread tasks during boot (plus the five hottest functions from a
// CDP CPU profile for attribution). JSON goes to .devshots/probe-load-time/<stamp>/.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { launchChromium, installSessionSignalGuard } from './player-truth/browser.mjs';
import { startBenchServer } from './lib/benchServer.mjs';
import { adventureToFlight } from './player-truth/routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const RUNS = Math.max(1, Number(argv.runs ?? 3));
const SOURCE_OVERLAY = argv['source-overlay'] ? String(argv['source-overlay']) : null;
// Human dwell between title-interactive and the New Game press. The title-dwell
// pipeline warm only earns back during real dwell; --dwell=0 keeps the honest
// instant-press floor.
const DWELL_MS = Math.max(0, Number(argv.dwell ?? 0));
const WITH_FLIGHT = argv.flight !== false && argv.flight !== 'false' && argv['no-flight'] === undefined;
const HEADED = argv.headed === true || argv.headed === 'true';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.resolve(String(argv.out || `.devshots/probe-load-time/${STAMP}`));
mkdirSync(OUT, { recursive: true });

const TITLE_MARK = 'title-interactive';
const FLIGHT_MARKS = ['new-game-pressed', 'world-built', 'flight-entered', 'first-flight-frame',
  'first-ship-frame', 'upgrade-queue-drained'];
const BOOT_TITLE_TIMEOUT_MS = Number(argv['title-timeout'] ?? 240000);
const BOOT_WARM_TIMEOUT_MS = Number(argv['warm-timeout'] ?? 120000);

// Collect resource timing, long tasks and paint entries from before the document's own
// scripts — index.html's inline timeline mint still runs first because init scripts run
// at document-start, before any page markup exists.
const INIT_SCRIPT = `(() => {
  const probe = window.__SF_PROBE__ = { resources: [], longtasks: [], paints: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        probe.resources.push({
          name: e.name.slice(0, 300), type: e.initiatorType || null,
          start: Math.round(e.startTime), dur: Math.round(e.duration),
          size: e.transferSize || e.encodedBodySize || 0,
        });
      }
    }).observe({ type: 'resource', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        probe.longtasks.push({ name: e.name, start: Math.round(e.startTime), dur: Math.round(e.duration) });
      }
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) probe.paints.push({ name: e.name, start: Math.round(e.startTime) });
    }).observe({ type: 'paint', buffered: true });
    // Deterministic title: the once-per-install cinematic defers the real menu until a
    // key lands; a probe never presses keys before it needs to measure the menu.
    try { localStorage.setItem('sf.cinematicSeen', '1'); sessionStorage.setItem('sf.cinematicSeen', '1'); } catch {}
  } catch {}
})()`;

function median(values) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  return xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
}

async function startCpuProfile(context, page) {
  try {
    const session = await context.newCDPSession(page);
    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: 500 });
    await session.send('Profiler.start');
    return session;
  } catch { return null; }
}

async function stopCpuProfile(session) {
  if (!session) return null;
  try {
    const { profile } = await session.send('Profiler.stop');
    // Aggregate self time per function+file: each node's samples accrue its own
    // hitCount * interval (samples are evenly spaced at the interval we set).
    const intervalUs = Number.isFinite(profile.samplingInterval) ? profile.samplingInterval : 500;
    const selfByFunc = new Map();
    for (const node of profile.nodes || []) {
      const us = (node.hitCount || 0) * intervalUs;
      if (us <= 0) continue;
      const frame = node.callFrame || {};
      const key = `${frame.functionName || '(anonymous)'} @ ${(frame.url || '(native)').split('/').slice(-2).join('/')}`;
      selfByFunc.set(key, (selfByFunc.get(key) || 0) + us);
    }
    return [...selfByFunc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([fn, us]) => ({ fn, ms: Math.round(us / 100) / 10 }));
  } catch { return null; }
}

async function collectRun(page, label) {
  const data = await page.evaluate(() => {
    const timeline = window.__SF_BOOT_TIMELINE__ || null;
    const nav = performance.getEntriesByType('navigation')[0] || null;
    const probe = window.__SF_PROBE__ || { resources: [], longtasks: [], paints: [] };
    return {
      marks: timeline ? timeline.marks.map((m) => ({ name: m.name, t: Math.round(m.t), detail: m.detail })) : null,
      line: timeline ? timeline.line() : null,
      nav: nav ? {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
        load: Math.round(nav.loadEventEnd),
        responseEnd: Math.round(nav.responseEnd),
      } : null,
      resources: probe.resources,
      longtasks: probe.longtasks,
      paints: probe.paints,
      ledger: window.SF?.state?.render?.openingCookLedger || null,
    };
  }).catch(() => null);
  return { label, ...(data || {}) };
}

async function waitForMark(page, name, timeoutMs) {
  await page.waitForFunction(
    (wanted) => Array.isArray(window.__SF_BOOT_TIMELINE__?.marks)
      && window.__SF_BOOT_TIMELINE__.marks.some((m) => m.name === wanted),
    name, { timeout: timeoutMs, polling: 250 },
  );
}

async function measureNavigation(page, url, timeoutMs) {
  const session = await startCpuProfile(page.context(), page);
  const t0 = Date.now();
  let markError = null;
  await page.goto(url, { waitUntil: 'commit', timeout: timeoutMs });
  try {
    await waitForMark(page, TITLE_MARK, timeoutMs);
  } catch (error) {
    markError = String(error && error.message || error);
  }
  const profileTop = await stopCpuProfile(session);
  const data = await collectRun(page);
  return { ...data, profileTop, navWaitMs: Date.now() - t0, markError };
}

async function oneIteration(index, server, withFlight, chromium) {
  const { browser } = await launchChromium(chromium, {
    headless: !HEADED,
    args: ['--mute-audio', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await context.addInitScript(INIT_SCRIPT);
    // COLD: fresh browser profile — empty HTTP cache, no V8 code cache, no shader cache.
    const cold = await measureNavigation(page, server.baseUrl, BOOT_TITLE_TIMEOUT_MS);
    cold.mode = 'cold'; cold.run = index;
    // WARM: a fresh page in the same context — HTTP cache, V8 code cache and shader
    // cache hot. Close the cold page first or its idle menu work competes with
    // the warm navigation on the same renderer budget.
    await page.close().catch(() => {});
    const warmPage = await context.newPage();
    const warm = await measureNavigation(warmPage, server.baseUrl, BOOT_WARM_TIMEOUT_MS);
    warm.mode = 'warm'; warm.run = index;
    // FLIGHT leg: the ordinary New Game route on the warm session. A human
    // dwell before the press lets title-idle warmup actually run; instant
    // press (default) keeps the worst case measured.
    let flight = null;
    if (withFlight) {
      try {
        const step = () => {};
        if (DWELL_MS > 0) await warmPage.waitForTimeout(DWELL_MS);
        await adventureToFlight(warmPage, step, {});
        // Let the drain witness run a few seconds beyond first flight control.
        await warmPage.waitForFunction(
          () => {
            const marks = window.__SF_BOOT_TIMELINE__?.marks || [];
            return marks.some((m) => m.name === 'upgrade-queue-drained')
              || marks.some((m) => m.name === 'first-ship-frame');
          }, null, { timeout: 30000, polling: 500 },
        ).catch(() => {});
        flight = await collectRun(warmPage, 'flight');
        flight.mode = 'flight'; flight.run = index;
      } catch (error) {
        flight = { mode: 'flight', run: index, error: String(error && error.message || error) };
      }
    }
    return { cold, warm, flight };
  } finally {
    await browser.close().catch(() => {});
  }
}

function markMs(run, name) {
  const hit = run && Array.isArray(run.marks) ? run.marks.filter((m) => m.name === name).pop() : null;
  return hit ? hit.t : null;
}

function printTable(results) {
  const names = [];
  for (const r of results) {
    for (const m of (r.marks || [])) if (!names.includes(m.name)) names.push(m.name);
  }
  const coldRuns = results.filter((r) => r.mode === 'cold');
  const warmRuns = results.filter((r) => r.mode === 'warm');
  console.log('\n=== Boot timeline (median ms since navigation start) ===');
  console.log(`${'stage'.padEnd(28)} ${'cold'.padStart(10)} ${'warm'.padStart(10)}  cold runs / warm runs`);
  for (const name of names) {
    const cold = median(coldRuns.map((r) => markMs(r, name)));
    const warm = median(warmRuns.map((r) => markMs(r, name)));
    const coldN = coldRuns.filter((r) => markMs(r, name) != null).length;
    const warmN = warmRuns.filter((r) => markMs(r, name) != null).length;
    console.log(`${name.padEnd(28)} ${String(cold ?? '—').padStart(10)} ${String(warm ?? '—').padStart(10)}  ${coldN}/${coldRuns.length} · ${warmN}/${warmRuns.length}`);
  }
  const coldTitle = median(coldRuns.map((r) => markMs(r, TITLE_MARK)));
  const warmTitle = median(warmRuns.map((r) => markMs(r, TITLE_MARK)));
  console.log(`\nTitle interactive: cold ${coldTitle != null ? (coldTitle / 1000).toFixed(1) + 's' : '?'} · warm ${warmTitle != null ? (warmTitle / 1000).toFixed(1) + 's' : '?'}${coldTitle && warmTitle ? ` · ratio ${(coldTitle / warmTitle).toFixed(2)}x` : ''}`);
}

function printSlowestResources(results) {
  // Dedupe by name; worst observed duration across runs. Cold runs only — warm cache
  // answers most of them locally and hides the real fetchers.
  const worst = new Map();
  for (const r of results.filter((x) => x.mode === 'cold')) {
    for (const res of r.resources || []) {
      const cur = worst.get(res.name);
      if (!cur || res.dur > cur.dur) worst.set(res.name, res);
    }
  }
  const top = [...worst.values()].sort((a, b) => b.dur - a.dur).slice(0, 5);
  console.log('\n=== Slowest 5 resources (cold) ===');
  for (const r of top) {
    const short = r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 110);
    console.log(`${String(r.dur).padStart(8)}ms  ${String(Math.round(r.size / 1024)).padStart(7)}kB  ${r.type || '?'}  ${short}`);
  }
}

function printLongestTasks(results) {
  const all = [];
  for (const r of results.filter((x) => x.mode === 'cold')) for (const t of r.longtasks || []) all.push(t);
  const top = all.sort((a, b) => b.dur - a.dur).slice(0, 5);
  console.log('\n=== Longest 5 main-thread tasks during boot (cold) ===');
  for (const t of top) console.log(`${String(t.dur).padStart(8)}ms  at ${t.start}ms  ${t.name}`);
  const hot = new Map();
  for (const r of results.filter((x) => x.mode === 'cold')) {
    for (const f of r.profileTop || []) hot.set(f.fn, Math.max(hot.get(f.fn) || 0, f.ms));
  }
  const fns = [...hot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('--- hottest functions (CDP CPU profile, worst cold run each) ---');
  for (const [fn, ms] of fns) console.log(`${String(ms).padStart(8)}ms  ${fn.slice(0, 120)}`);
}

function printFlight(results) {
  const legs = results.filter((r) => r.mode === 'flight' && r.marks);
  if (!legs.length) return;
  const mark = (name) => median(legs.map((r) => markMs(r, name)));
  const pressed = mark('new-game-pressed');
  const firstFrame = mark('first-flight-frame');
  const ship = mark('first-ship-frame');
  const drain = mark('upgrade-queue-drained');
  const rel = (v) => (v != null && pressed != null ? `${((v - pressed) / 1000).toFixed(1)}s` : '—');
  console.log('\n=== New Game -> first control (median, from new-game-pressed) ===');
  console.log(`world-built ${rel(mark('world-built'))} · flight-entered ${rel(mark('flight-entered'))} · first-flight-frame ${rel(firstFrame)} · first-ship-frame ${rel(ship)} · upgrade-queue-drained ${rel(drain)}`);
}

async function main() {
  installSessionSignalGuard(process);
  const { chromium } = await loadPlaywright();
  const server = await startBenchServer(SOURCE_OVERLAY ? { sourceOverlay: SOURCE_OVERLAY } : {});
  if (SOURCE_OVERLAY) console.log(`[probe] serving frozen source overlay: ${SOURCE_OVERLAY}`);
  const results = [];
  try {
    for (let i = 1; i <= RUNS; i++) {
      console.log(`\n[probe] run ${i}/${RUNS} (fresh browser: cold, then reload: warm${WITH_FLIGHT ? ', then New Game' : ''})`);
      try {
        const { cold, warm, flight } = await oneIteration(i, server, WITH_FLIGHT, chromium);
        results.push(cold, warm); if (flight) results.push(flight);
        const coldTitle = markMs(cold, TITLE_MARK);
        const warmTitle = markMs(warm, TITLE_MARK);
        console.log(`[probe] run ${i}: title cold ${coldTitle != null ? (coldTitle / 1000).toFixed(1) + 's' : 'timeout/absent'} · warm ${warmTitle != null ? (warmTitle / 1000).toFixed(1) + 's' : 'timeout/absent'}`);
        if (flight && flight.marks) {
          const pressed = markMs(flight, 'new-game-pressed');
          const frame = markMs(flight, 'first-flight-frame');
          if (pressed != null && frame != null) {
            console.log(`[probe] run ${i}: New Game -> first flight frame ${((frame - pressed) / 1000).toFixed(1)}s`);
          }
        }
      } catch (error) {
        console.error(`[probe] run ${i} failed:`, error && error.message || error);
        results.push({ mode: 'cold', run: i, error: String(error && error.message || error) });
      }
    }
  } finally {
    await server.close().catch(() => {});
  }
  printTable(results);
  printSlowestResources(results);
  printLongestTasks(results);
  printFlight(results);
  const out = path.join(OUT, 'runs.json');
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), runs: results }, null, 1));
  console.log(`\n[probe] wrote ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
}

main().catch((error) => {
  console.error('[probe] harness failure:', error);
  process.exitCode = 1;
});
