// Focused review fixture, using the existing UI bench and real Crucible screen modules.
// Run only after other GPU captures finish. This does not update any budget or golden.
// From the repository: node scripts/capture-swarm-specialist-previews.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const repo = path.resolve(arg('repo', fileURLToPath(new URL('../', import.meta.url))));
const out = path.resolve(arg('out', path.join(repo, '.devshots/swarm-specialist-previews')));
const width = Number(arg('width', '1280'));
const height = Number(arg('height', '720'));
const headed = process.argv.includes('--headed');
const localImport = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { startBenchServer } = await localImport('scripts/lib/benchServer.mjs');
const { loadPlaywright } = await localImport('scripts/lib/load-playwright.mjs');
const { SWARM_SPECIALIST_BRIEFS } = await localImport('src/data/swarmSpecialists.js');
mkdirSync(out, { recursive: true });

const cases = [
  { wave: 5, next: 6, enemyId: 'mine_layer_jackal' },
  { wave: 8, next: 9, enemyId: 'warden_escort' },
  { wave: 21, next: 22, enemyId: 'field_anchor_controller' },
];
const surfaces = [
  { shot: 'crucible-draft', screenId: 'crucibleDraft' },
  { shot: 'crucible-refit-swarm', screenId: 'crucibleRefit' },
];
const receipt = {
  scope: 'Seeded UI-bench fixture with real Crucible screen modules; no ordinary-route or performance acceptance.',
  setup: 'Existing Swarm bench state; the private fixture run wave, arena and seed are adjusted, its real preparation owner reopens the corresponding phase, then __benchRefresh is called.',
  viewport: { width, height }, headed, captures: [], pageErrors: [], captureComplete: false,
};
let server, browser;
try {
  const { chromium } = await loadPlaywright();
  const suppliedBase = arg('base-url', null);
  server = suppliedBase ? null : await startBenchServer();
  const baseUrl = suppliedBase || server.baseUrl;
  browser = await chromium.launch({ headless: !headed,
    ...(process.env.SF_CHROMIUM ? { executablePath: process.env.SF_CHROMIUM } : {}) });
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => receipt.pageErrors.push(String(error)));
  for (const surface of surfaces) {
    const url = new URL('tools/ui-bench.html', baseUrl);
    url.searchParams.set('screen', surface.shot);
    url.searchParams.set('ruleset', 'swarm');
    url.searchParams.set('chrome', '0');
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__BENCH_READY === true, null, { timeout: 60000 });
    await page.locator(`[data-screen="${surface.screenId}"]`).waitFor({ state: 'visible' });
    for (const spec of cases) {
      const seeded = await page.evaluate(async ({ wave, screenId }) => {
        const state = window.__BENCH_STATE;
        if (!state?.run || state.run.ruleset !== 'swarm' || typeof window.__benchRefresh !== 'function') {
          throw new Error('Expected existing Swarm UI-bench fixture and refresh hook');
        }
        state.run.wave = wave;
        state.run.seed = 4242;
        state.run.arenaId = 'helios_core';
        const screens = await import('/src/ui/screens/crucibleDraft.js');
        const mounted = screenId === 'crucibleDraft' ? screens.crucibleDraftScreen : screens.crucibleRefitScreen;
        const owner = mounted._ctx?.registry?.get('survivalDraft');
        if (!owner) throw new Error('Expected the existing real preparation owner');
        // The armory reads its owner's committed wave, not an arbitrary run-wave mutation.
        // Reopen through that same owner so the fixture's offers and preview agree.
        if (screenId === 'crucibleDraft') owner._openDraft();
        else owner._openRefit();
        const screen = window.__benchRefresh();
        return { wave: state.run.wave, ownerWave: owner.currentWave(), ruleset: state.run.ruleset, phase: state.run.phase, screen };
      }, { ...spec, screenId: surface.screenId });
      const preview = page.locator(`[data-screen="${surface.screenId}"] .sf-cru-preview`);
      await preview.waitFor({ state: 'visible' });
      const brief = SWARM_SPECIALIST_BRIEFS[spec.enemyId];
      const text = await preview.innerText();
      assert.ok(text.includes(`Prepare for ${brief.name}: ${brief.threat} ${brief.counter}`),
        `${surface.shot}: expected the actual next-${spec.next} specialist wording; saw ${JSON.stringify(text)}`);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await preview.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const css = getComputedStyle(element);
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
          overflowX: css.overflowX, overflowY: css.overflowY,
          horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
          clippedVertically: element.scrollHeight > element.clientHeight + 1
            && ['hidden', 'clip'].includes(css.overflowY),
          withinViewport: rect.x >= -1 && rect.right <= innerWidth + 1
            && rect.y >= -1 && rect.bottom <= innerHeight + 1 };
      });
      const filename = `${surface.shot}-next${String(spec.next).padStart(2, '0')}-${width}.png`;
      await page.screenshot({ path: path.join(out, filename), fullPage: false });
      receipt.captures.push({ surface: surface.shot, enemyId: spec.enemyId,
        nextWave: spec.next, seeded, text, geometry, screenshot: filename });
      assert.equal(geometry.horizontalOverflow, false, `${filename}: preview text overflows horizontally`);
      assert.equal(geometry.clippedVertically, false, `${filename}: preview text is clipped vertically`);
      assert.equal(geometry.withinViewport, true, `${filename}: preview is outside the viewport`);
      console.log(`${surface.shot} next ${spec.next}: ${filename}`);
    }
  }
  assert.deepEqual(receipt.pageErrors, [], 'UI bench emitted uncaught page errors');
  receipt.captureComplete = true;
} catch (error) {
  receipt.failure = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  writeFileSync(path.join(out, 'preview-capture.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  if (browser) await browser.close();
  if (server) await server.close();
}
console.log(JSON.stringify({ captureComplete: receipt.captureComplete, captures: receipt.captures.length,
  pageErrors: receipt.pageErrors, out, reviewRequired: true }, null, 2));
