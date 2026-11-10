// Public-route gameplay smoke and render-only A/B evidence; no simulation or save edits.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.NOCTURNE_EVIDENCE_DIR || path.join(root, 'artifacts/nocturne/gameplay'));
const assetCache = process.env.NOCTURNE_ASSET_CACHE || '/tmp/nocturne-assets';
const priorCache = process.env.NOCTURNE_PRIOR_ASSET_CACHE;
const base = '6a9eec796e3b25e2b08526cd4412503d32cccb12';
const require = createRequire(import.meta.url);
const run = promisify(execFile);
const { createGameServer } = require(path.join(root, 'scripts/lib/gameServer.cjs'));
const tree = await run('git', ['ls-tree', '-r', '-z', base, '--', 'assets', 'vendor'], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const expected = new Map(tree.stdout.split('\0').filter(Boolean).map(row => {
  const split = row.indexOf('\t'); return [row.slice(split + 1), row.slice(0, split).split(' ')[2]];
}));
const exact = (bytes, key) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') === expected.get(key);
await mkdir(out, { recursive: true });
await mkdir(assetCache, { recursive: true });
const report = { base, route: 'real main page / New Game / Launch', hardware: 'Chromium SwiftShader; software-only validation, not hardware GPU acceptance',
  errors: [], warnings: [], failures: [], downloaded: [], checkpoints: [], stage: 'boot' };
const seenErrors = new Set();
const cacheWork = new Map();
const server = createGameServer({ root, playerStoreDir: null }); // No playerStoreDir: isolated session, no user saves.
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, page;
const ticker = setInterval(() => console.log('progress', report.stage, 'assets', report.downloaded.length,
  'errors', report.errors.length, 'request failures', report.failures.length), 15000);
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff': 'font/woff',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.js': 'text/javascript', '.mjs': 'text/javascript' };

async function clickVisible(label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const buttons = page.getByRole('button', { name: label, exact: true });
    for (let i = 0, count = await buttons.count(); i < count; i++) {
      const button = buttons.nth(i);
      if (await button.isVisible() && await button.isEnabled()) {
        await button.focus({ timeout: 30000 });
        await page.keyboard.press('Enter'); return;
      }
    }
    if (report.errors.length && report.stage === 'boot') throw new Error('Main page failed before actionable title');
    if (report.stage === 'boot' && await page.getByText('STARTUP COULD NOT FINISH', { exact: true }).count())
      throw new Error('Game startup failure screen');
    await page.waitForTimeout(250);
  }
  throw new Error(`Visible ${label} button not available`);
}

async function checkpoint(label) {
  const data = await page.evaluate(() => {
    const sf = window.SF, state = sf?.state;
    const lights = [];
    state?.render?.scene?.traverse((o) => {
      if (o.isLight) lights.push({ type: o.type, name: o.name, visible: o.visible,
        intensity: o.intensity, x: o.position.x, y: o.position.y, z: o.position.z });
    });
    return { mode: state?.mode, playerId: state?.playerId, entityCount: state?.entities?.size,
      sector: state?.world?.currentSectorId, firstPlayableFrameAt: state?.render?.firstPlayableFrameAt,
      nocturne: state?.render?.nocturne?.getDiagnostics(),
      renderer: (() => { const r = state?.render?.renderer; if (!r) return null;
        const gl = r.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { programs: r.info.programs.length, calls: r.info.render.calls, triangles: r.info.render.triangles,
          memory: { ...r.info.memory }, device: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          gpuTimerAvailable: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
      })(),
      lights, body: document.body.innerText.slice(0, 4500),
      buttons: [...document.querySelectorAll('button')].filter((b) => b.getClientRects().length)
        .map((b) => ({ text: b.textContent.trim(), disabled: b.disabled })),
    };
  });
  report.checkpoints.push({ label, ...data });
  await page.screenshot({ path: path.join(out, `${label}.png`), timeout: 45000 });
  console.log('checkpoint', label, JSON.stringify({ mode: data.mode, sector: data.sector,
    entities: data.entityCount, lights: data.lights.length, practical: data.practicalDiagnostics,
    buttons: data.buttons.slice(0, 12) }));
}

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Sparse checkout assets are fulfilled only from their exact immutable base revision.
  // Production sources and assets are never replaced or modified by this probe.
  await context.route(/\/(assets|vendor)\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.continue();
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (relative.includes('..')) return route.continue();
    try { if ((await stat(path.join(root, relative))).isFile()) return route.continue(); } catch {}
    let work = cacheWork.get(relative);
    if (!work) {
      work = (async () => {
        const cache = path.join(assetCache, relative);
        try { const bytes = await readFile(cache); if (exact(bytes, relative)) return bytes; } catch {}
        if (priorCache) try { const bytes = await readFile(path.join(priorCache, relative));
          if (exact(bytes, relative)) { await mkdir(path.dirname(cache), { recursive: true }); await writeFile(cache, bytes); return bytes; }
        } catch {}
        const remote = `https://raw.githubusercontent.com/coldshalamov/SpaceFace/${base}/${relative}`;
        await mkdir(path.dirname(cache), { recursive: true });
        await run('curl', ['--fail', '--silent', '--show-error', '--max-time', '30', '--output', cache, remote]);
        const body = await readFile(cache);
        if (!exact(body, relative)) throw new Error(`Asset does not match pinned git tree: ${relative}`);
        report.downloaded.push({ path: relative, bytes: body.length });
        return body;
      })();
      cacheWork.set(relative, work);
    }
    try { const body = await work; await route.fulfill({ status: 200, body,
      contentType: mime[path.extname(relative)] || 'application/octet-stream' }); }
    catch (error) { report.failures.push(String(error)); await route.continue(); }
  });
  page = await context.newPage();
  page.on('pageerror', (error) => {
    if (!seenErrors.has(error.message)) { seenErrors.add(error.message); report.errors.push(error.message);
      console.log('pageerror', error.message.slice(0, 800)); }
  });
  page.on('console', (message) => {
    if ((message.type() === 'warning' || message.type() === 'error') && report.warnings.length < 100)
      report.warnings.push({ type: message.type(), text: message.text().slice(0, 1000) });
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && report.failures.length < 100) {
      report.failures.push({ status: response.status(), url: response.url() });
      console.log('HTTP error', response.status(), new URL(response.url()).pathname);
    }
  });
  await page.goto(origin, { waitUntil: 'commit', timeout: 120000 });
  await clickVisible('Play', 120000); // Observed first-run accessibility dialog, standard settings.
  await checkpoint('title');
  await clickVisible('New Game', 120000);
  report.stage = 'new-game';
  await checkpoint('new-game');
  await clickVisible('Launch', 60000);
  report.stage = 'launching';
  await page.waitForFunction(() => {
    const s = window.SF?.state;
    return s?.mode === 'flight' && s.entities?.get(s.playerId) && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: 180000 });
  report.stage = 'flight';
  await checkpoint('flight');
  await page.waitForTimeout(3000);
  await page.keyboard.down('w'); await page.waitForTimeout(1000); await page.keyboard.up('w');
  await page.keyboard.down('Space'); await page.waitForTimeout(350); await page.keyboard.up('Space');
  await checkpoint('after-controls');
  await page.waitForTimeout(3000);
  await checkpoint('settled');
  await page.evaluate(() => window.SF.state.render.nocturne.setEnabled(false));
  await page.waitForTimeout(1200);
  await checkpoint('lighting-off');
  await page.evaluate(() => window.SF.state.render.nocturne.setEnabled(true));
  await page.waitForTimeout(1200);
  await checkpoint('lighting-on');
  report.stage = 'complete'; report.reachedFlight = true;
  report.acceptance = 'main-game route exercised; GPU budget unmeasured on target hardware';
} catch (error) {
  report.obstacle = error.stack || String(error);
  console.log('smoke obstacle', report.obstacle);
  if (page) { try { await checkpoint('obstacle'); } catch (captureError) { report.captureError = String(captureError); } }
} finally {
  clearInterval(ticker);
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log('report', path.join(out, 'report.json'));
  if (!report.reachedFlight || report.errors.length) process.exitCode = 1;
}
