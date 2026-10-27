// scripts/check-retail-boot.mjs - "it opened on my machine" gate for the RETAIL bundle (O24).
//
//   node scripts/check-retail-boot.mjs                  build the retail bundle, serve it, boot it
//   node scripts/check-retail-boot.mjs --use-existing   skip the build; serve the build/web already on disk
//   node scripts/check-retail-boot.mjs --dir=<path>     serve some other prebuilt retail folder (implies no build)
//   node scripts/check-retail-boot.mjs --dry-run        validate arguments, print the plan, launch nothing
//
// WHY THIS EXISTS. Every other browser check boots the raw-ES-module dev route (node server.js, importmap,
// window.SF exposed). The route players actually receive is the esbuild bundle in build/web: minified,
// code-split into hashed chunks, module workers rewritten, SF_DEBUG_ONLY statements dropped. A bundle that
// builds green but throws on its first line, 404s a chunk, or serves an empty page is invisible to every
// other gate. This one builds exactly what Vercel builds (npm run build:bundle), serves it the way Vercel
// serves it, loads it in headless Chromium on SOFTWARE GL (no GPU needed), and demands the title menu.
//
// Checks (one PASS/FAIL line each; exit 1 if any fails, exit 2 on bad arguments):
//   build               scripts/build-bundle.mjs exits 0                       (skipped with --use-existing / --dir)
//   bundle-shape        index.html loads ./main.js, no importmap / ./src/ refs, hashed chunks + release receipt exist
//   server              the static server is listening on an ephemeral loopback port
//   page-load           the document answered 200 and the page did not crash
//   menu                [data-screen="mainMenu"] with its New Game button is visible within --menu-timeout-ms
//   uncaught-exceptions the page threw nothing (window error / unhandled rejection)
//   console-errors      no console.error, HTTP >= 400, or failed request (known-benign classes excused by
//                       scripts/lib/browser-issues.mjs)
//   window.SF           the retail bundle must NOT expose the debug handle window.SF (SF_DEBUG_ONLY is stripped)
//
// DELIBERATE CHOICES.
//  * build-bundle.mjs publishes only to build/web (lock + atomic swap + path guards, Vercel-critical), so the
//    default mode builds THERE and serves it in place; evidence (report.json, retail-boot.png) goes to
//    .devshots/retail-boot/ (ignored). Nothing here edits or redirects the builder.
//  * A tiny static server, not scripts/lib/gameServer.cjs: that server adds COOP/COEP cross-origin isolation,
//    dev diagnostics and a player store, which the retail route does not have (vercel.json sets none of them).
//    Using it would boot the page down a different code path than a player gets. Plain files + Range + MIME only.
//  * Software GL is forced (SwiftShader) so a green run on a GPU workstation means the same as a green run on
//    a CI runner. Recent Chromium no longer falls back to SwiftShader silently, hence --enable-unsafe-swiftshader.
//  * Do NOT set VERCEL_URL when running this: it would pin chunk URLs to /_releases/<deployment>/ (see
//    scripts/lib/vercelReleaseBase.mjs) and the local server has no such rewrite.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_WEB_ROOT = join(ROOT, 'build', 'web');
const DEFAULT_OUT_DIR = join(ROOT, '.devshots', 'retail-boot');
const DEFAULT_MENU_TIMEOUT_MS = 240_000;
const DEFAULT_BUILD_TIMEOUT_MS = 1_800_000;
const POST_MENU_SETTLE_MS = 3_000;
const ERROR_GRACE_MS = 30_000;

export const MENU_SELECTOR = '[data-screen="mainMenu"]';
export const NEW_GAME_SELECTOR = '[data-screen="mainMenu"] button[data-action="newGame"]';
export const CHECK_NAMES = Object.freeze([
  'build', 'bundle-shape', 'server', 'page-load', 'menu', 'uncaught-exceptions', 'console-errors', 'window.SF',
]);
export const CHROMIUM_ARGS = Object.freeze([
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--enable-webgl', '--mute-audio',
]);

export class UsageError extends Error {}

const USAGE = [
  'usage: node scripts/check-retail-boot.mjs [options]',
  '  --use-existing           skip the build and serve the build/web already on disk',
  '  --dir=<path>             serve this prebuilt retail folder instead of build/web (implies --use-existing)',
  '  --out=<path>             evidence folder (default .devshots/retail-boot)',
  `  --menu-timeout-ms=<n>    wait this long for the title menu (default ${DEFAULT_MENU_TIMEOUT_MS})`,
  `  --build-timeout-ms=<n>   give the bundle build this long (default ${DEFAULT_BUILD_TIMEOUT_MS})`,
  '  --dry-run                validate arguments and print the plan; build, serve and launch nothing',
  '  --help                   this text',
].join('\n');

function positiveInt(flag, raw) {
  if (!/^\d+$/.test(String(raw))) throw new UsageError(`${flag} needs a whole number of milliseconds, got "${raw}"`);
  const value = Number(raw);
  if (value < 1000) throw new UsageError(`${flag} must be at least 1000 ms, got ${value}`);
  return value;
}

function pathFlag(flag, raw) {
  if (!raw) throw new UsageError(`${flag} needs a path`);
  return isAbsolute(raw) ? resolve(raw) : resolve(process.cwd(), raw);
}

/** Parse argv (without node + script). Throws UsageError on anything unknown or malformed. */
export function parseArgs(argv) {
  const options = {
    dryRun: false, help: false, build: true, webRoot: DEFAULT_WEB_ROOT, outDir: DEFAULT_OUT_DIR,
    menuTimeoutMs: DEFAULT_MENU_TIMEOUT_MS, buildTimeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
  };
  for (const arg of argv) {
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const value = eq === -1 ? null : arg.slice(eq + 1);
    const bare = (name) => {
      if (value !== null) throw new UsageError(`${name} takes no value`);
    };
    switch (flag) {
      case '--dry-run': bare(flag); options.dryRun = true; break;
      case '--help': case '-h': bare(flag); options.help = true; break;
      case '--use-existing': bare(flag); options.build = false; break;
      case '--dir': options.webRoot = pathFlag(flag, value); options.build = false; break;
      case '--out': options.outDir = pathFlag(flag, value); break;
      case '--menu-timeout-ms': options.menuTimeoutMs = positiveInt(flag, value); break;
      case '--build-timeout-ms': options.buildTimeoutMs = positiveInt(flag, value); break;
      default: throw new UsageError(`unknown argument "${arg}"`);
    }
  }
  return options;
}

const display = (path) => {
  const rel = relative(ROOT, path);
  return (rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : path).split(sep).join('/');
};

/** The lines --dry-run prints (and a real run prints as its header). Pure: touches nothing. */
export function buildPlan(options) {
  return [
    `mode: ${options.build ? 'build then boot' : 'boot an existing bundle (no build)'}`,
    options.build
      ? `build: node scripts/build-bundle.mjs -> build/web (about 900 MB, several minutes; limit ${options.buildTimeoutMs} ms)`
      : 'build: skipped',
    `serve: ${display(options.webRoot)} on an ephemeral 127.0.0.1 port (static files, Range, no COOP/COEP - like vercel.json)`,
    `browser: headless chromium on software GL (${CHROMIUM_ARGS.filter((a) => a !== '--mute-audio').join(' ')})`,
    `menu marker: ${NEW_GAME_SELECTOR} visible within ${options.menuTimeoutMs} ms`,
    'fails on: page error, console error, HTTP >= 400, failed request, window.SF defined, menu never visible',
    `evidence: ${display(options.outDir)}/report.json + retail-boot.png`,
    `checks: ${CHECK_NAMES.join(', ')}`,
  ];
}

// ---------------------------------------------------------------------------------------------
// Static server (faithful to how Vercel serves build/web: files only, correct MIME, Range for media)
// ---------------------------------------------------------------------------------------------

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.ktx2': 'image/ktx2', '.basis': 'application/octet-stream',
  '.bin': 'application/octet-stream', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
});

export function mimeTypeFor(filePath) {
  return MIME[extname(String(filePath)).toLowerCase()] || 'application/octet-stream';
}

/**
 * Map a request URL to a file under `root`, or null (missing, directory without index.html, NUL byte,
 * malformed escape, or traversal out of the root).
 */
export function resolveStaticFile(root, requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(String(requestUrl).split(/[?#]/, 1)[0]); } catch { return null; }
  if (pathname.includes('\0')) return null;
  const base = resolve(root);
  let target = resolve(base, `.${pathname.startsWith('/') ? '' : '/'}${pathname}`);
  if (target !== base && !target.startsWith(base + sep)) return null;
  try {
    if (statSync(target).isDirectory()) target = join(target, 'index.html');
    return statSync(target).isFile() ? target : null;
  } catch { return null; }
}

/** Parse a single-range `Range: bytes=...` header against a file size. null = whole file, 'bad' = unsatisfiable. */
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (match[1] === '' && match[2] === '')) return 'bad';
  let start; let end;
  if (match[1] === '') {
    const tail = Number(match[2]);
    if (tail === 0) return 'bad';
    start = Math.max(0, size - tail); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return 'bad';
  return { start, end };
}

export function createStaticServer(root) {
  return createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return;
      }
      const file = resolveStaticFile(root, req.url || '/');
      if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return; }
      const { size } = await stat(file);
      const headers = {
        'Content-Type': mimeTypeFor(file), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
      };
      const range = parseRange(req.headers.range, size);
      if (range === 'bad') {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); res.end(); return;
      }
      if (range) {
        res.writeHead(206, {
          ...headers, 'Content-Length': range.end - range.start + 1,
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        });
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': size });
      }
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(file, range ? { start: range.start, end: range.end } : undefined);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500');
    }
  });
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      const address = server.address();
      resolveListen(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  // Chromium keep-alive sockets outlive the page; without this server.close waits for a drain that never comes.
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

// ---------------------------------------------------------------------------------------------
// Static bundle-shape check (no browser)
// ---------------------------------------------------------------------------------------------

/** Cheap structural facts about a retail folder. Returns the list of problems (empty = fine). */
export async function bundleShapeProblems(webRoot) {
  const problems = [];
  const indexPath = join(webRoot, 'index.html');
  if (!existsSync(indexPath)) return [`${display(indexPath)} is missing`];
  const html = await readFile(indexPath, 'utf8');
  if (!html.includes('<script type="module" src="./main.js"></script>')) {
    problems.push('index.html does not load the bundled ./main.js entry');
  }
  if (/importmap/i.test(html)) problems.push('index.html still carries an importmap (dev route leaked into retail)');
  if (/["'(]\s*\.\/src\//.test(html)) problems.push('index.html still references the raw ./src/ tree');
  if (!existsSync(join(webRoot, 'main.js'))) problems.push('main.js is missing');
  if (!existsSync(join(webRoot, 'spaceface-release-build.json'))) problems.push('spaceface-release-build.json (release receipt) is missing');
  const names = await readdir(webRoot);
  if (!names.some((name) => /-[A-Z0-9]{8}\.js$/.test(name))) problems.push('no content-hashed chunk (*-XXXXXXXX.js) found - not a code-split retail build');
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

function runBuild(timeoutMs) {
  return new Promise((resolveBuild) => {
    const env = { ...process.env };
    delete env.VERCEL_URL;        // would pin chunk URLs to /_releases/<deployment>/
    delete env.SPACEFACE_DEMO;    // retail, not the demo flavour
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'build-bundle.mjs')], { cwd: ROOT, env, stdio: 'inherit' });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.once('error', (error) => { clearTimeout(timer); resolveBuild({ ok: false, detail: `could not start the builder: ${error.message}` }); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) resolveBuild({ ok: false, detail: `build exceeded ${timeoutMs} ms and was stopped` });
      else if (code === 0) resolveBuild({ ok: true, detail: 'build/web produced by scripts/build-bundle.mjs' });
      else resolveBuild({ ok: false, detail: `build-bundle.mjs failed (${signal ? `signal ${signal}` : `exit ${code}`})` });
    });
  });
}

/**
 * A request the game cancelled itself: net::ERR_ABORTED on a file under /assets/. The streaming/LOD layer
 * (renderPackageLoader / assetLoader AbortControllers) drops loads it no longer needs - the first real run of
 * this gate saw two render.glb prefetches cancelled during a clean boot. scripts/check-game-playable.mjs makes
 * the same call: a cancelled asset is a note, not a failure. Anything else that was aborted (a JS chunk, a
 * worker, the document) stays a failure, and so does every HTTP >= 400.
 */
export function isCancelledAssetRequest(issue) {
  if (!issue || issue.type !== 'error') return false;
  const match = /^Request failed (\S+): net::ERR_ABORTED$/.exec(String(issue.text || '').trim());
  if (!match) return false;
  try { return new URL(match[1]).pathname.startsWith('/assets/'); } catch { return false; }
}

// ---------------------------------------------------------------------------------------------
// Browser run
// ---------------------------------------------------------------------------------------------

const withTimeout = (promise, ms, label) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, rejectTimeout) => { timer = setTimeout(() => rejectTimeout(new Error(`${label} timed out after ${ms} ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
};

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function inspectMenu() {
  const visible = (element) => {
    if (!element || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const menu = document.querySelector('[data-screen="mainMenu"]');
  const newGame = document.querySelector('[data-screen="mainMenu"] button[data-action="newGame"]');
  const motionFull = [...document.querySelectorAll('[data-screen="motionAsk"] button')]
    .find((element) => /^Full/i.test(element.textContent || '')) || null;
  return {
    readyState: document.readyState,
    mainMenuVisible: visible(menu),
    newGameVisible: visible(newGame),
    motionFullVisible: visible(motionFull),
    cinematicBeginVisible: visible(document.querySelector('#cinematic-splash .cine-begin')),
  };
}

/** Poll for the title menu, answering the same first-run gates a player answers (cinematic begin, motion ask). */
async function waitForMenu(page, timeoutMs, state) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.crashed || page.isClosed()) return { ok: false, reason: 'the page crashed or closed before the menu appeared' };
    if (state.firstErrorAt && Date.now() - state.firstErrorAt > ERROR_GRACE_MS) {
      return { ok: false, reason: `the page threw and the menu did not appear within ${ERROR_GRACE_MS / 1000}s of the first error` };
    }
    let seen = null;
    try { seen = await withTimeout(page.evaluate(inspectMenu), 8_000, 'menu inspection'); } catch { /* main thread busy; poll again */ }
    if (seen) {
      state.lastMenu = seen;
      if (seen.mainMenuVisible && seen.newGameVisible) return { ok: true };
      if (seen.cinematicBeginVisible) await page.locator('#cinematic-splash .cine-begin').first().click({ timeout: 3_000 }).catch(() => {});
      if (seen.motionFullVisible) await page.locator('[data-screen="motionAsk"] button').filter({ hasText: /^Full/i }).first().click({ timeout: 3_000 }).catch(() => {});
    }
    await sleep(1_000);
  }
  return { ok: false, reason: `the title menu did not become visible within ${timeoutMs} ms (last observation: ${JSON.stringify(state.lastMenu)})` };
}

async function bootInBrowser({ baseUrl, options, record }) {
  const { loadPlaywright } = await import('./lib/load-playwright.mjs');
  let browser = null;
  const state = { crashed: false, firstErrorAt: 0, lastMenu: null };
  const observed = { windowSf: null, menu: null, navigation: null };
  try {
    try {
      const { chromium } = await loadPlaywright();
      browser = await chromium.launch({ headless: true, args: [...CHROMIUM_ARGS] });
    } catch (error) {
      record('page-load', false, `could not launch headless Chromium (${String(error.message || error).split('\n')[0]}); run: npx playwright install chromium`);
      return observed;
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const watcher = collectPageIssues(page, { playerStoreMounted: false });
    page.on('crash', () => { state.crashed = true; });
    page.on('pageerror', () => { state.firstErrorAt ||= Date.now(); });
    page.on('console', (message) => { if (message.type() === 'error') state.firstErrorAt ||= Date.now(); });

    let response = null;
    try {
      response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    } catch (error) {
      record('page-load', false, `navigation failed: ${String(error.message || error).split('\n')[0]}`);
    }
    if (response) {
      observed.navigation = response.status();
      const ok = response.ok();
      // A crash is only knowable after the boot has run; page-load is recorded with the menu verdict below.
      observed.pendingPageLoad = ok ? null : `document answered HTTP ${response.status()}`;
    }

    observed.menu = response ? await waitForMenu(page, options.menuTimeoutMs, state) : { ok: false, reason: 'no document to wait on' };
    if (observed.menu.ok) await sleep(POST_MENU_SETTLE_MS); // let errors that fire right after the menu paint surface

    if (response) {
      const problem = observed.pendingPageLoad || (state.crashed ? 'the page crashed' : null);
      record('page-load', !problem, problem || `document answered ${observed.navigation}, page stayed alive`);
    }
    record('menu', observed.menu.ok, observed.menu.ok ? `${NEW_GAME_SELECTOR} visible` : observed.menu.reason);

    const issues = watcher.issues.filter((issue) => issue.type === 'error' || issue.type === 'pageerror');
    const uncaught = issues.filter((issue) => issue.type === 'pageerror');
    const cancelledAssets = issues.filter(isCancelledAssetRequest);
    const consoleErrors = issues.filter((issue) => issue.type === 'error' && !isCancelledAssetRequest(issue));
    record('uncaught-exceptions', uncaught.length === 0,
      uncaught.length ? `${uncaught.length} uncaught: ${JSON.stringify(summarizeIssues(uncaught).slice(0, 3))}` : 'none thrown');
    record('console-errors', consoleErrors.length === 0,
      consoleErrors.length ? `${consoleErrors.length} error(s): ${JSON.stringify(summarizeIssues(consoleErrors).slice(0, 3))}`
        : `no console errors, HTTP >= 400, or failed requests${cancelledAssets.length ? ` (${cancelledAssets.length} game-cancelled asset load(s) noted, not failures)` : ''}`);
    observed.issues = { uncaught: summarizeIssues(uncaught), consoleErrors: summarizeIssues(consoleErrors), cancelledAssets: summarizeIssues(cancelledAssets), ignoredCount: watcher.ignoredIssues.length };

    try {
      observed.windowSf = await withTimeout(page.evaluate(() => (typeof window.SF === 'undefined' ? null : Object.keys(window.SF || {}).slice(0, 12))), 10_000, 'window.SF read');
      record('window.SF', observed.windowSf === null, observed.windowSf === null
        ? 'undefined, as the retail bundle requires'
        : `window.SF is defined (keys: ${observed.windowSf.join(', ') || 'none'}) - the debug handle leaked into retail`);
    } catch (error) {
      record('window.SF', false, `could not read window.SF: ${String(error.message || error).split('\n')[0]}`);
    }

    await mkdir(options.outDir, { recursive: true });
    await withTimeout(page.screenshot({ path: join(options.outDir, 'retail-boot.png'), timeout: 20_000 }), 25_000, 'screenshot').catch(() => {});
  } finally {
    if (browser) await withTimeout(browser.close(), 15_000, 'browser close').catch(() => {});
  }
  return observed;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.help) { console.log(USAGE); return 0; }
    if (!options.build && !existsSync(join(options.webRoot, 'index.html'))) {
      throw new UsageError(`no retail bundle at ${display(options.webRoot)} (index.html missing); run "npm run build:bundle" or drop --use-existing/--dir`);
    }
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`[retail-boot] ${error.message}`);
    console.error(USAGE);
    return 2;
  }

  for (const line of buildPlan(options)) console.log(`[retail-boot] plan ${line}`);
  if (options.dryRun) {
    console.log('[retail-boot] dry-run OK: arguments valid, nothing built, served or launched');
    return 0;
  }

  const results = [];
  const record = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`[retail-boot] ${ok ? 'PASS' : 'FAIL'} ${name} - ${detail}`);
  };
  const startedAt = Date.now();
  let server = null;
  let observed = null;
  try {
    if (options.build) {
      const built = await runBuild(options.buildTimeoutMs);
      record('build', built.ok, built.detail);
      if (!built.ok) return finish(results, options, startedAt, observed);
    } else {
      console.log('[retail-boot] SKIP build - serving the bundle already on disk');
    }

    const problems = await bundleShapeProblems(options.webRoot);
    record('bundle-shape', problems.length === 0, problems.length ? problems.join('; ') : 'index.html -> ./main.js, no importmap, hashed chunks and release receipt present');
    if (problems.length) return finish(results, options, startedAt, observed);

    server = createStaticServer(options.webRoot);
    const baseUrl = await listen(server);
    record('server', true, `${display(options.webRoot)} at ${baseUrl}`);

    observed = await bootInBrowser({ baseUrl, options, record });
  } catch (error) {
    record('harness', false, String(error && error.stack || error).split('\n').slice(0, 3).join(' | '));
  } finally {
    if (server) await closeServer(server);
  }
  return finish(results, options, startedAt, observed);
}

async function finish(results, options, startedAt, observed) {
  const failed = results.filter((entry) => !entry.ok);
  try {
    await mkdir(options.outDir, { recursive: true });
    await writeFile(join(options.outDir, 'report.json'), `${JSON.stringify({
      pass: failed.length === 0, elapsedMs: Date.now() - startedAt, webRoot: display(options.webRoot),
      built: options.build, chromiumArgs: CHROMIUM_ARGS, results, observed,
    }, null, 2)}\n`, 'utf8');
  } catch { /* evidence is best-effort; the verdict stands without it */ }
  console.log(failed.length
    ? `[retail-boot] FAIL ${failed.length} of ${results.length} check(s): ${failed.map((entry) => entry.name).join(', ')}`
    : `[retail-boot] PASS all ${results.length} checks in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  return failed.length ? 1 : 0;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then((code) => process.exit(code), (error) => {
    console.error('[retail-boot] FAILED:', error);
    process.exit(1);
  });
}
