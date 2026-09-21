#!/usr/bin/env node
// PQ-205.00 look/feel + hitch instrument. The production mesh fixture is the visual bench;
// Crucible is the default-route drop walk. Stills stay in .devshots and are not committed.
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

process.env.SPACEFACE_PLAYER_STORE_DIR = '';
process.env.SPACEFACE_USER_CONTENT_DIR = '';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq-205-00');
const HEADLESS = process.argv.includes('--headless');
const SKIP_LIVE = process.argv.includes('--fixture-only');
const SKIP_FIXTURE = process.argv.includes('--live-only');

if (typeof os.setPriority === 'function') {
  try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* ignore */ }
}

function hostLoad() {
  const load = os.loadavg?.() || [];
  return {
    cpus: os.cpus()?.length || 0,
    load1: load[0] ?? null,
    idleMs: os.cpus()?.reduce((sum, cpu) => sum + (cpu.times?.idle || 0), 0) || null,
  };
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, type: 'png' });
  return file;
}

const { chromium } = await loadPlaywright();
await mkdir(OUT, { recursive: true });
const server = await acquireVisualProbeServer({ root: ROOT });
let browser = null;
const report = { host: hostLoad(), fixture: {}, live: null, shots: [] };
try {
  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1600,900',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(60_000);
  if (!SKIP_FIXTURE) {
  await page.goto(`${server.baseUrl}/test/fixtures/bomb-choreography/presentation.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction(() => window.probeReady === true, null, { timeout: 60_000 });

  const looks = [
    { name: 'fields-combat', mode: 'fields', zoom: 144, video: {} },
    { name: 'fields-close', mode: 'fields', zoom: 58, video: {} },
    { name: 'fields-wide', mode: 'fields', zoom: 330, video: {} },
    { name: 'fields-motion', mode: 'fields', zoom: 144, video: { motionReduce: true } },
    { name: 'fields-flash', mode: 'fields', zoom: 144, video: { flashReduce: true } },
    { name: 'warning-combat', mode: 'warning', zoom: 144, video: {} },
    { name: 'warning-wide', mode: 'warning', zoom: 330, video: {} },
    { name: 'drift-combat', mode: 'drift', zoom: 144, video: {} },
    { name: 'drift-wide', mode: 'drift', zoom: 330, video: {} },
    { name: 'six-combat', mode: 'six', zoom: 144, video: {} },
    { name: 'six-wide', mode: 'six', zoom: 330, video: {} },
    { name: 'stress-combat', mode: 'stress', zoom: 330, video: {} },
  ];
  for (const look of looks) {
    await page.evaluate(({ mode, zoom, video }) => window.drawProbe(mode, video, zoom), look);
    await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), 80);
    report.shots.push(await shot(page, look.name));
    report.fixture[look.name] = await page.evaluate(() => window.probeResult);
  }

  const occupancy = {};
  for (const [label, mode, zoom] of [
    ['zero', null, 144],
    ['six', 'six', 400],
    ['twentyFour', 'stress', 800],
  ]) {
    if (mode) await page.evaluate(({ m, z }) => window.drawProbe(m, {}, z), { m: mode, z: zoom });
    else {
      await page.evaluate(() => {
        window.drawProbe('fields', {}, 144);
        window.inspectState.entityList = [];
        window.inspectState.mode = 'flight';
      });
      await page.evaluate(async () => {
        const { releaseBombPresentation } = await import('/src/render/bombPresentation.js');
        releaseBombPresentation(window.inspectState);
      });
    }
    occupancy[label] = await page.evaluate(() => window.measurePacing(90));
  }
  report.fixture.occupancy = occupancy;
  }

  await page.close().catch(() => {});

  if (!SKIP_LIVE) {
    let live = null;
    const liveErrors = [];
    try {
      live = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      installCspSafePlaywrightPolling(live);
      live.setDefaultTimeout(180_000);
      live.on('pageerror', (error) => liveErrors.push(String(error).slice(0, 240)));
      await live.addInitScript(() => {
        try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ignore */ }
      });
      await live.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await live.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });
      const launched = await live.evaluate(async () => {
        const launch = await import('/src/ui/crucibleLaunch.js');
        const setup = launch.crucibleSetupFor({ seed: 4242 });
        if (!setup || !setup.ok) return false;
        return launch.requestCrucibleRun(window.SF.bus, setup.value, setup.ruleset) !== false;
      });
      if (!launched) throw new Error('Crucible run did not launch');
      await live.waitForFunction(() => {
        const state = window.SF && window.SF.state;
        return state && state.mode === 'flight'
          && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
      }, null, { timeout: 180_000 });
      await live.keyboard.press('KeyW');
      await live.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), 400);
      for (let i = 0; i < 6; i++) {
        await live.keyboard.press('Digit9');
        await live.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), 400);
        if (i < 5) {
          await live.keyboard.press('Comma');
          await live.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), 80);
        }
      }
      await live.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), 250);
      await live.keyboard.press('KeyR');
      await live.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), 450);
      report.shots.push(await shot(live, 'live-crucible-drops'));
      report.live = await live.evaluate(() => {
        const state = window.SF.state;
        const list = Array.isArray(state.entityList) ? state.entityList : [];
        const bombs = list.filter((e) => e && e.type === 'bomb' && e.alive);
        const phases = {};
        for (const bomb of bombs) {
          const phase = bomb.data && bomb.data.phase || 'unknown';
          phases[phase] = (phases[phase] || 0) + 1;
        }
        return {
          selected: state.bombs && state.bombs.selectedId,
          alive: bombs.length,
          phases,
          mode: state.mode,
          zoom: state.camera && state.camera.zoom,
        };
      });
      report.live.pageErrors = liveErrors;
      await live.close();
    } catch (err) {
      let dump = null;
      if (live) {
        dump = await live.evaluate(() => ({
          title: document.title,
          ready: document.readyState,
          hasSF: !!window.SF,
          text: String(document.body && document.body.innerText || '').slice(0, 280),
        })).catch(() => null);
        await live.close().catch(() => {});
      }
      report.live = {
        error: String(err && err.message || err).slice(0, 500),
        dump,
        pageErrors: liveErrors,
      };
    }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  out: OUT,
  occupancy: report.fixture.occupancy,
  live: report.live && (report.live.error
    ? { error: report.live.error }
    : { alive: report.live.alive, phases: report.live.phases, selected: report.live.selected }),
  host: report.host,
}, null, 2));
