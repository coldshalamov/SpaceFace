// Lifecycle and reporting for the EXISTING real-screen bench. No replacement UI or game startup.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseOptions, positiveInteger } from './agentLoopPlan.mjs';
import { isGenericResourceLoadConsoleError } from './browser-issues.mjs';

// Keep diagnostic state bounded per screen. A noisy page should produce a useful
// failure without allowing its event stream to become the workload under test.
const MAX_PAGE_REQUESTS = 10_000;
const MAX_OPTIONAL_RESPONSE_EVIDENCE = 64;
const MAX_PENDING_OPTIONAL_CONSOLE_ERRORS = 32;
// Playwright can deliver the console-side 404 before the matching response,
// including after the capture promise resolves. Give that one candidate a
// bounded event-drain window before declaring it unmatched.
const OPTIONAL_CONSOLE_MATCH_GRACE_MS = 100;

export function parseBenchArgs(argv) {
  const { options: o, positional } = parseOptions(argv, {
    list: 'boolean', walk: 'boolean', demo: 'boolean', phone: 'boolean', headed: 'boolean',
    shot: 'list', bg: 'value', out: 'value', query: 'value', probe: 'value', max: 'value',
    viewport: 'value', viewports: 'value', 'timeout-ms': 'value', 'baseline-source': 'value',
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

function optionalResource(url, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const request = new URL(url, base);
    if (request.origin !== base.origin) return null;
    if (request.pathname !== '/spaceface-release-build.json'
      && request.pathname !== '/favicon.ico'
      && request.pathname !== '/__spaceface_player_store') return null;
    return { href: request.href };
  } catch { return null; }
}

function responseMethod(response) {
  try {
    const request = typeof response?.request === 'function' ? response.request() : null;
    const method = typeof request?.method === 'function' ? request.method() : request?.method;
    const normalized = String(method || '').trim().toUpperCase();
    return normalized || null;
  } catch { return null; }
}

function consoleLocation(msg) {
  try {
    const location = typeof msg?.location === 'function' ? msg.location() : null;
    return location?.url || '';
  } catch { return ''; }
}

function consoleText(msg) {
  try { return typeof msg?.text === 'function' ? msg.text() : String(msg?.text || ''); }
  catch { return ''; }
}

function isResource404Console(msg) {
  const text = consoleText(msg);
  return isGenericResourceLoadConsoleError({ type: 'error', text }) && /\b404\b/.test(text);
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
    sourceOverlayManifest: args['baseline-source'] || null,
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
      let flushPendingOptionalConsole = () => {};
      let settlePendingOptionalConsole = async () => {};
      try {
        // Reuse the expensive browser process; isolate storage, listeners, focus and fixtures.
        context = await browser.newContext({ viewport,
          ...(args.phone ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
        const page = await context.newPage();
        page.setDefaultTimeout(args.timeoutMs);
        const pendingOptionalConsole = [];
        const optionalResponseCredits = new Map();
        const optionalConsoleWaiters = new Set();
        let optionalResponseCount = 0;
        const resolveOptionalConsoleWaiters = () => {
          if (pendingOptionalConsole.length) return;
          for (const resolve of optionalConsoleWaiters) resolve();
          optionalConsoleWaiters.clear();
        };
        const addOptionalResponseEvidence = href => {
          const pendingIndex = pendingOptionalConsole.findIndex(entry => entry.href === href);
          if (pendingIndex >= 0) {
            pendingOptionalConsole.splice(pendingIndex, 1);
            resolveOptionalConsoleWaiters();
            return;
          }
          if (optionalResponseCount >= MAX_OPTIONAL_RESPONSE_EVIDENCE) return;
          optionalResponseCredits.set(href, (optionalResponseCredits.get(href) || 0) + 1);
          optionalResponseCount++;
        };
        const consumeOptionalResponseEvidence = href => {
          const count = optionalResponseCredits.get(href) || 0;
          if (!count) return false;
          if (count === 1) optionalResponseCredits.delete(href);
          else optionalResponseCredits.set(href, count - 1);
          optionalResponseCount--;
          return true;
        };
        flushPendingOptionalConsole = () => {
          for (const entry of pendingOptionalConsole) errors.push({ ...entry.error, unmatchedOptional404: true });
          pendingOptionalConsole.length = 0;
          resolveOptionalConsoleWaiters();
        };
        settlePendingOptionalConsole = async () => {
          if (!pendingOptionalConsole.length) return;
          await new Promise(resolve => {
            let timer;
            const waiter = () => {
              clearTimeout(timer);
              optionalConsoleWaiters.delete(waiter);
              resolve();
            };
            timer = setTimeout(waiter, OPTIONAL_CONSOLE_MATCH_GRACE_MS);
            optionalConsoleWaiters.add(waiter);
          });
          flushPendingOptionalConsole();
        };
        page.on('pageerror', e => { if (collecting) errors.push({ kind: 'pageerror', message: e.message || String(e) }); });
        page.on('console', msg => {
          if (!collecting || msg.type() !== 'error') return;
          const url = consoleLocation(msg);
          const error = { kind: 'console', message: consoleText(msg), ...(url ? { url } : {}) };
          const resource = optionalResource(url, server.baseUrl);
          if (!resource || !isResource404Console(msg)) {
            errors.push(error);
            return;
          }
          if (consumeOptionalResponseEvidence(resource.href)) return;
          if (pendingOptionalConsole.length < MAX_PENDING_OPTIONAL_CONSOLE_ERRORS) {
            pendingOptionalConsole.push({ href: resource.href, error });
          } else {
            errors.push({ ...error, unmatchedOptional404: true });
          }
        });
        page.on('request', () => { cell.requests = Math.min(cell.requests + 1, MAX_PAGE_REQUESTS); });
        page.on('requestfailed', request => {
          if (collecting) errors.push({ kind: 'requestfailed', url: request.url(), message: request.failure()?.errorText || 'request failed' });
        });
        page.on('response', response => {
          const url = response.url();
          if (!collecting || response.status() < 400) return;
          const resource = optionalResource(url, server.baseUrl);
          const method = responseMethod(response);
          if (resource && response.status() === 404 && method === 'GET') {
            addOptionalResponseEvidence(resource.href);
            return;
          }
          errors.push({ kind: 'http', status: response.status(), url, method: method || 'unknown' });
        });
        const result = await timeout(shoot(page, id, folder, `${server.baseUrl}tools/ui-bench.html`),
          args.timeoutMs, `Cell ${id} exceeded ${args.timeoutMs}ms; remaining cells can still run`);
        // A Chrome resource error may arrive before its response event. Only a
        // response observed in this page can close that candidate. Keep the
        // page listeners alive for a short bounded drain after capture returns.
        await settlePendingOptionalConsole();
        Object.assign(cell, result, { ok: result?.ok === true && errors.length === 0 });
      } catch (error) {
        await settlePendingOptionalConsole();
        errors.push({ kind: 'harness', message: error?.message || String(error) });
      }
      finally {
        await settlePendingOptionalConsole();
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
