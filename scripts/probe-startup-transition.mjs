#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { CURRENT_VERSION } from '../src/save/migrations.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = parseArgs(process.argv.slice(2));
const out = resolve(ROOT, args.out || '.devshots/perf/startup-transition.json');
const shot = resolve(ROOT, args.shot || '.devshots/perf/startup-transition.png');
const flightShot = resolve(ROOT, args['flight-shot'] || shot.replace(/(\.[^.]+)$/, '-flight$1'));
const headless = args.headed !== true;
const timeoutMs = Number(args.timeout || 120000);
const route = args.route === 'continue' ? 'continue' : 'new-game';
const { chromium } = await loadPlaywright();

let server;
let browser;
try {
  server = await acquireVisualProbeServer({ explicitUrl: args.url || '', root: ROOT });
  browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  await page.addInitScript(({ route, currentVersion }) => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    try { localStorage.setItem('sf.firstRunIntroSeen', '1'); } catch (_) {}
    if (route === 'continue') installContinueFixture(currentVersion);
    const trace = window.__SF_STARTUP_TRACE__ = {
      marks: [],
      frames: [],
      longtasks: [],
      resources: [],
      loadingStates: [],
    };
    const mark = (name, detail = null) => trace.marks.push({ name, at: performance.now(), detail });
    window.__SF_STARTUP_MARK__ = mark;
    document.addEventListener('click', (event) => {
      const button = event.target && event.target.closest && event.target.closest('button');
      const text = button && (button.textContent || '').trim();
      if (text === 'Launch' || text === 'Continue') mark('startup-click', { route, label: text });
    }, true);
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          trace.longtasks.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch (_) {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!/\.(glb|ktx2|png|jpe?g)(\?|$)/i.test(entry.name)) continue;
          trace.resources.push({
            name: entry.name,
            start: entry.startTime,
            duration: entry.duration,
            transferSize: entry.transferSize || 0,
            decodedBodySize: entry.decodedBodySize || 0,
          });
        }
      }).observe({ entryTypes: ['resource'], buffered: true });
    } catch (_) {}
    let previous = performance.now();
    const frame = (now) => {
      const gap = now - previous;
      previous = now;
      if (gap >= 32 || trace.marks.some((entry) => entry.name === 'startup-click')) {
        trace.frames.push({ at: now, gap });
        if (trace.frames.length > 1200) trace.frames.shift();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    function installContinueFixture(version) {
      try {
        const slot = 'quick';
        const savedAt = '2026-07-19T00:00:00.000Z';
        const envelope = {
          fmt: 'spaceface-save', version, savedAt, playtimeS: 420, slot,
          data: {
            meta: { seed: 47, playtimeS: 420, createdAt: savedAt, lastSavedAt: savedAt },
            player: {
              credits: 5000,
              ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
              activeShipIndex: 0,
            },
            cargo: { items: {}, capVolume: 40, capMass: 60 },
            economy: {}, factions: {},
            world: { currentSectorId: 'sector_helios_prime', fuel: { current: 100, max: 100 } },
            entities: {
              player: {
                type: 'ship', alive: true, pos: { x: 0, z: 0 },
                data: { defId: 'ship_kestrel' },
                hull: 120, hullMax: 120, shield: 40, shieldMax: 40, cap: 140, capMax: 140,
              },
              persistent: [], simTime: 0, tick: 0,
            },
            missions: { boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } },
            automation: {}, crafting: { queues: {} }, settings: {},
          },
        };
        localStorage.setItem(`sf.save.${slot}`, JSON.stringify(envelope));
        localStorage.setItem('sf.save.index', JSON.stringify({
          [slot]: {
            slot, savedAt, playtimeS: 420, credits: 5000,
            sectorName: 'Helios Reach', shipName: 'ship_kestrel',
            objectiveSummary: 'Resume startup performance fixture', version,
          },
        }));
      } catch (_) {}
    }
  }, { route, currentVersion: CURRENT_VERSION });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.registry, null, { timeout: timeoutMs });
  await waitForVisible(page, '[data-screen="mainMenu"]', timeoutMs, 'main menu');
  if (route === 'new-game') {
    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    await waitForVisible(page, '[data-screen="newGame"]', timeoutMs, 'New Game screen');
  }

  await page.evaluate(() => {
    const sf = window.SF;
    const mark = window.__SF_STARTUP_MARK__;
    sf.bus.on('mode:changed', (payload) => mark(`mode:${payload && payload.mode}`, payload || null));
    sf.bus.on('game:loadingProgress', (payload) => mark('loading-progress', payload || null));
    sf.bus.on('game:startFailed', (payload) => mark('start-failed', payload || null));

    const trace = window.__SF_STARTUP_TRACE__;
    const observer = new MutationObserver(() => {
      const veil = document.querySelector('.sf-ng-warmup');
      const boot = document.getElementById('boot-overlay');
      const snapshot = {
        at: performance.now(),
        veilOpen: !!(veil && veil.classList.contains('open')),
        veilText: veil ? (veil.textContent || '').replace(/\s+/g, ' ').trim() : '',
        bootVisible: !!(boot && !boot.classList.contains('hidden') && getComputedStyle(boot).display !== 'none'),
        bootText: boot ? (boot.textContent || '').replace(/\s+/g, ' ').trim() : '',
      };
      const prior = trace.loadingStates[trace.loadingStates.length - 1];
      if (!prior || JSON.stringify({ ...prior, at: 0 }) !== JSON.stringify({ ...snapshot, at: 0 })) {
        trace.loadingStates.push(snapshot);
      }
    });
    observer.observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
    window.__SF_STARTUP_OBSERVER__ = observer;
  });

  await page.evaluate((route) => {
    const label = route === 'continue' ? 'Continue' : 'Launch';
    const selector = route === 'continue' ? '[data-screen="mainMenu"] button' : '[data-screen="newGame"] button';
    const button = [...document.querySelectorAll(selector)]
      .find((candidate) => (candidate.textContent || '').trim() === label);
    if (!button) throw new Error(`${label} button not found`);
    setTimeout(() => button.click(), 0);
  }, route);

  await page.waitForFunction(() => window.__SF_STARTUP_TRACE__?.marks?.some((entry) => (
    entry.name === 'loading-progress'
      && ['authored-library', 'authored-visuals', 'render-pipelines', 'gpu-resources'].includes(entry.detail?.id)
  )), null, { timeout: timeoutMs });
  mkdirSync(dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });

  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight', null, { timeout: timeoutMs });
  await page.waitForFunction(() => Number.isFinite(
    window.SF && window.SF.state && window.SF.state.render
      && window.SF.state.render.firstPlayableFrameAt,
  ), null, { timeout: timeoutMs });
  await page.screenshot({ path: flightShot });
  await page.waitForTimeout(250);
  const report = await page.evaluate(async (route) => {
    const sf = window.SF;
    const trace = window.__SF_STARTUP_TRACE__;
    if (window.__SF_STARTUP_OBSERVER__) window.__SF_STARTUP_OBSERVER__.disconnect();
    const click = trace.marks.find((entry) => entry.name === 'startup-click');
    const flight = [...trace.marks].reverse().find((entry) => entry.name === 'mode:flight');
    const firstPlayableFrameAt = sf.state.render.firstPlayableFrameAt;
    const afterClick = (entry) => !click || entry.at >= click.at;
    const frames = trace.frames.filter(afterClick);
    const longtasks = trace.longtasks.filter((entry) => !click || entry.start + entry.duration >= click.at);
    let readiness = null;
    try {
      const parts = await import('./src/render/partsLibrary.js');
      readiness = parts.authoredCriticalVisualReadiness(sf.state);
    } catch (_) {}
    return {
      schema: 'spaceface.startupTransitionProbe.v1',
      route,
      userAgent: navigator.userAgent,
      mode: sf.state.mode,
      entityCount: sf.state.entityList.length,
      timing: {
        clickAtMs: click && click.at,
        flightAtMs: flight && flight.at,
        clickToFlightMs: click && flight ? flight.at - click.at : null,
        clickToFirstFlightFrameMs: click && Number.isFinite(firstPlayableFrameAt)
          ? firstPlayableFrameAt - click.at
          : null,
        firstFrameAfterClickMs: frames.length && click ? frames[0].at - click.at : null,
        maxFrameGapMs: frames.length ? Math.max(...frames.map((entry) => entry.gap)) : null,
        longTaskTotalMs: longtasks.reduce((sum, entry) => sum + entry.duration, 0),
        maxLongTaskMs: longtasks.length ? Math.max(...longtasks.map((entry) => entry.duration)) : null,
      },
      marks: trace.marks.filter(afterClick),
      loadingStates: trace.loadingStates.filter(afterClick),
      longtasks,
      resources: trace.resources.filter((entry) => !click || entry.start + entry.duration >= click.at),
      readiness,
      gpu: sf.state.render.gpu || null,
      startupGpuResidency: sf.state.render.startupGpuResidency || null,
    };
  }, route);
  report.pageIssues = {
    errors: issues.errorIssues(),
    warnings: issues.warningIssues().slice(0, 20),
  };
  report.capture = { loading: shot, flight: flightShot };
  assert.equal(report.mode, 'flight', 'normal Launch route must reach flight');
  assert.deepEqual(report.pageIssues.errors, [], 'startup probe must not record page errors');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    out,
    loadingShot: shot,
    flightShot,
    timing: report.timing,
    loadingStates: report.loadingStates,
  }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index++;
    } else {
      result[key] = true;
    }
  }
  return result;
}

async function waitForVisible(page, selector, timeout, label) {
  await page.waitForFunction((value) => {
    const element = document.querySelector(value);
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 10;
  }, selector, { timeout }).catch((error) => {
    throw new Error(`Timed out waiting for ${label}: ${error.message}`);
  });
}
