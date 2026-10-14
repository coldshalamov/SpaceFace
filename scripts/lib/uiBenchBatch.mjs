// Lifecycle and reporting for the EXISTING real-screen bench. No replacement UI or game startup.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseOptions, positiveInteger } from './agentLoopPlan.mjs';

export function parseBenchArgs(argv) {
  const { options: o, positional } = parseOptions(argv, {
    list: 'boolean', walk: 'boolean', demo: 'boolean', phone: 'boolean', headed: 'boolean',
    shot: 'list', bg: 'value', out: 'value', query: 'value', probe: 'value', max: 'value',
    viewport: 'value', viewports: 'value', 'timeout-ms': 'value',
  });
  if (o.viewport && o.viewports) throw new Error('Use --viewport or --viewports, not both');
  const viewports = (o.viewports || o.viewport || (o.phone ? '390x844' : '1920x1080')).split(',').map(value => {
    const m = /^(\d+)x(\d+)$/.exec(value.trim());
    if (!m) throw new Error(`Invalid viewport: ${value}`);
    return { width: positiveInteger(m[1], 1920, 16384), height: positiveInteger(m[2], 1080, 16384) };
  });
  const unique = [...new Map(viewports.map(v => [`${v.width}x${v.height}`, v])).values()];
  return { ...o, shots: [...new Set([...(o.shot || []), ...positional].flatMap(s => s.split(',')).map(s => s.trim()).filter(Boolean))],
    max: positiveInteger(o.max, 24, 1000), viewport: unique[0], viewports: unique,
    timeoutMs: positiveInteger(o['timeout-ms'], 300_000, 300_000) };
}

function optionalRequest(url) {
  try {
    const pathname = new URL(url, 'http://bench.invalid').pathname;
    return pathname === '/spaceface-release-build.json' || pathname === '/favicon.ico';
  } catch { return false; }
}

function timeout(promise, ms, message) {
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export async function runUiBenchBatch({ args, root, loadPlaywright, startServer, shoot }) {
  const out = path.resolve(root, args.out || '.devshots/ui-bench');
  mkdirSync(out, { recursive: true });
  const started = performance.now();
  const summary = { schema: 'spaceface.uiBenchBatch.v1', nonPromoting: true, gameBoots: 0,
    browserLaunches: 0, ok: false, cells: [], errors: [],
    note: 'Real screen modules over fixture state. Inspect PNGs. Fixture actions do not prove live game transitions, asset loading or performance.' };
  let server, browser;
  const save = () => writeFileSync(path.join(out, 'report.json'), JSON.stringify(summary, null, 2) + '\n');
  try {
    server = await startServer();
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: !args.headed, executablePath: args.executablePath });
    summary.browserLaunches = 1;
    for (const viewport of args.viewports) for (const id of args.shots) {
      const cellStart = performance.now(), errors = [];
      const cell = { id, viewport, ok: false, errors, requests: 0 };
      const folder = args.viewports.length > 1 ? path.join(out, `${viewport.width}x${viewport.height}`) : out;
      mkdirSync(folder, { recursive: true });
      let context, collecting = true;
      try {
        // Reuse the expensive browser process; isolate storage, listeners, focus and fixtures.
        context = await browser.newContext({ viewport,
          ...(args.phone ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
        const page = await context.newPage();
        page.setDefaultTimeout(args.timeoutMs);
        page.on('pageerror', e => { if (collecting) errors.push({ kind: 'pageerror', message: e.message || String(e) }); });
        page.on('console', msg => { if (collecting && msg.type() === 'error' && !optionalRequest(msg.location?.()?.url || '')) errors.push({ kind: 'console', message: msg.text() }); });
        page.on('request', () => { cell.requests++; });
        page.on('requestfailed', request => { if (collecting && !optionalRequest(request.url())) errors.push({ kind: 'requestfailed', url: request.url(), message: request.failure()?.errorText || 'request failed' }); });
        page.on('response', response => {
          const url = response.url();
          if (collecting && response.status() >= 400 && !optionalRequest(url)) {
            errors.push({ kind: 'http', status: response.status(), url });
          }
        });
        const result = await timeout(shoot(page, id, folder, `${server.baseUrl}tools/ui-bench.html`),
          args.timeoutMs, `Cell ${id} exceeded ${args.timeoutMs}ms; remaining cells can still run`);
        Object.assign(cell, result, { ok: result?.ok === true && errors.length === 0 });
      } catch (error) { errors.push({ kind: 'harness', message: error?.message || String(error) }); }
      finally {
        collecting = false; // Context teardown cancels pending requests; that is not a screen defect.
        if (context) {
          try { await timeout(context.close(), 5000, 'Context cleanup timed out'); }
          catch (error) { errors.push({ kind: 'cleanup', message: error.message }); cell.ok = false; }
        }
        cell.durationMs = performance.now() - cellStart;
        summary.cells.push(cell); save();
      }
    }
  } catch (error) { summary.errors.push(error?.message || String(error)); }
  finally {
    if (browser) {
      try { await timeout(browser.close(), 5000, 'Browser cleanup timed out'); }
      catch (error) { summary.errors.push(error.message); }
    }
    if (server) {
      try { await timeout(server.close(), 5000, 'Server cleanup timed out'); }
      catch (error) { summary.errors.push(error.message); }
    }
    summary.durationMs = performance.now() - started;
    summary.ok = summary.errors.length === 0 && summary.cells.length === args.shots.length * args.viewports.length
      && summary.cells.length > 0 && summary.cells.every(c => c.ok && c.errors.length === 0);
    save();
  }
  return summary;
}
