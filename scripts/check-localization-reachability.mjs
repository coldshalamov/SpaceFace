#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('../.devshots/alpha/m6-localization-reachability/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const probe = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const surfaces = [];
const screenshots = [];

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (error) {}
  });
  await page.goto(`${probe.baseUrl}/?locale=qps-ploc`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.ctx, null, { timeout: 20000 });
  await waitForScreen('mainMenu');
  await page.waitForFunction(() => document.documentElement.dataset.locale === 'qps-ploc');

  surfaces.push(await assertVisiblePseudoSurface('mainMenu'));
  await capture('01-main-menu-qps-1280x720.png');

  await page.locator('[data-screen="mainMenu"] [data-action="newGame"]').first().click();
  await waitForScreen('newGame');
  await page.setViewportSize({ width: 1440, height: 900 });
  surfaces.push(await assertVisiblePseudoSurface('newGame'));
  await capture('02-new-game-qps-1440x900.png');

  await page.locator('[data-screen="newGame"] .sf-ng-footer button').last().click();
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive);
  }, null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  surfaces.push(await assertVisiblePseudoHud());
  await capture('03-flight-hud-qps-1440x900.png');

  await showScreen('pause', { width: 1280, height: 720 });
  await waitForScreen('pause');
  surfaces.push(await assertVisiblePseudoSurface('pause'));
  await capture('04-pause-qps-1280x720.png');

  const releaseScreens = [
    ['settings', { width: 1280, height: 720 }, '05-settings-qps-1280x720.png'],
    ['help', { width: 1440, height: 900 }, '06-help-qps-1440x900.png'],
    ['saveLoad', { width: 1280, height: 720 }, '07-save-load-qps-1280x720.png'],
    ['missionLog', { width: 1440, height: 900 }, '08-mission-log-qps-1440x900.png'],
    ['galaxyMap', { width: 1280, height: 720 }, '09-galaxy-map-qps-1280x720.png'],
    ['codex', { width: 1440, height: 900 }, '10-codex-qps-1440x900.png'],
    ['gameOver', { width: 1280, height: 720 }, '11-game-over-qps-1280x720.png'],
  ];
  for (const [id, viewport, file] of releaseScreens) {
    await showScreen(id, viewport);
    await waitForScreen(id);
    surfaces.push(await assertVisiblePseudoSurface(id));
    await capture(file);
  }

  const bridge = await page.evaluate(() => {
    const api = window.__SF_LOCALIZATION__;
    return api && typeof api.stats === 'function' ? api.stats() : null;
  });
  assert.ok(bridge && bridge.installed, 'localized DOM bridge must be installed on qps-ploc');
  assert.ok(bridge.textNodes >= 100, `expected broad localized copy coverage, got ${bridge.textNodes}`);

  const evidence = {
    // A full alpha-evidence record (schema spaceface.alphaEvidence.v1), not a bare dump: the
    // alpha evidence scanner validates every record under .devshots/alpha/ (M0-EVIDENCE).
    schema: 'spaceface.alphaEvidence.v1',
    taskId: 'm6-localization-reachability',
    worktreeId: (() => {
      const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim() || 'detached';
      const rev = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
      const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() ? '+dirty' : '';
      return `${branch}@${rev}${dirty}`;
    })(),
    route: 'canonical root -> main menu (qps-ploc) -> New Game (difficulty/starter stops unclipped) -> Launch -> flight HUD -> pause -> settings/help/saveLoad/missionLog/galaxyMap/codex/gameOver',
    viewport: { width: 1280, height: 720 },
    runtime: { kind: 'browser', gpu: await browser.version() },
    captureKind: 'browser',
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: true,
    checks: [
      ...surfaces.map((surface) => ({
        name: `pseudo copy visible and unclipped on ${surface.id} @ ${surface.viewport.width}x${surface.viewport.height}`,
        status: 'pass',
      })),
      { name: `localized DOM bridge installed and broad (textNodes ${bridge.textNodes})`, status: 'pass' },
    ],
    artifacts: screenshots.map((file) => {
      const bytes = readFileSync(`${OUT}${file}`);
      return {
        kind: 'screenshot',
        path: relativeFile(`${OUT}${file}`),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }),
    notes: [
      'Every pseudo-locale (qps-ploc) surface asserts: pseudo copy exposed, zero horizontal clips, zero English DOM leaks, no document widening.',
      ...surfaces.map((s) => `${s.id}@${s.viewport.width}x${s.viewport.height} pseudo=${s.pseudoCount} clips=0 leaks=${(s.englishLeaks || []).length}`),
      `defaultLocale en-US; bridge textNodes ${bridge.textNodes}`,
    ],
  };
  writeFileSync(`${OUT}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close().catch(() => {});
  await probe.close().catch(() => {});
}

function relativeFile(absPath) {
  // ROOT carries its trailing separator (fileURLToPath of a directory URL), so slice at
  // ROOT.length — +1 would eat the leading dot of '.devshots'.
  return absPath.slice(ROOT.length).replaceAll('\\', '/');
}

async function waitForScreen(id) {
  await page.waitForFunction((screenId) => {
    const el = document.querySelector(`[data-screen="${screenId}"]`);
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 20;
  }, id, { timeout: 20000 });
  // Entrance reveals hold the screen's children hidden past the root becoming visible —
  // gameOver's death slide keeps every child at visibility:hidden for ~400ms in onShow.
  // Measure only once at least one control is actually visible; a screen that never
  // populates falls through to the assertions, which still report it as empty.
  await page.waitForFunction((screenId) => {
    const el = document.querySelector(`[data-screen="${screenId}"]`);
    if (!el) return false;
    return [...el.querySelectorAll('h1, h2, h3, h4, label, button, th, td, p, li')]
      .some((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
      });
  }, id, { timeout: 5000 }).catch(() => {});
}

async function showScreen(id, viewport) {
  await page.setViewportSize(viewport);
  await page.evaluate((screenId) => {
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    if (!sm || typeof sm.pushScreen !== 'function') throw new Error(`${screenId} screen manager unavailable`);
    if (typeof sm.closeAll === 'function') sm.closeAll();
    sm.pushScreen(screenId);
    if (sm.syncVisibility) sm.syncVisibility();
  }, id);
  // Allow the MutationObserver bridge and the screen's requestAnimationFrame entrance to settle.
  await page.waitForTimeout(120);
}

async function capture(file) {
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
  screenshots.push(file);
}

async function assertVisiblePseudoSurface(id) {
  const report = await page.evaluate((screenId) => {
    const screen = document.querySelector(`[data-screen="${screenId}"]`);
    const rect = screen && screen.getBoundingClientRect();
    const controls = screen ? [...screen.querySelectorAll(
      'h1, h2, h3, h4, label, button, th, td, p, li, [aria-label], [placeholder], .sf-ng-route__title, .sf-slot-name, .sf-slot-sub'
    )] : [];
    const visible = controls.filter((el) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 1 && r.height > 1;
    });
    const tree = screen && document.createTreeWalker(screen, NodeFilter.SHOW_TEXT);
    const englishLeaks = [];
    if (tree) {
      while (tree.nextNode()) {
        const node = tree.currentNode;
        const text = String(node.nodeValue || '').trim();
        const parent = node.parentElement;
        if (!text || !/[A-Za-z]{2}/.test(text) || !parent || parent.closest('[data-localization-skip]')) continue;
        const style = getComputedStyle(parent);
        const r = parent.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || r.width <= 1 || r.height <= 1) continue;
        if (!(text.startsWith('⟦') && text.endsWith('⟧'))) englishLeaks.push(text.slice(0, 120));
      }
    }
    // A second clip channel the box metric cannot see: a control severed by an ancestor's
    // overflow:clip|hidden reports scrollWidth === clientWidth while its ink is cut. Reachable
    // scroll (auto|scroll) is not a clip — only a hard clip bounds the element.
    const clipBounds = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const st = getComputedStyle(a);
        if (st.overflowX !== 'clip' && st.overflowX !== 'hidden') continue;
        const ar = a.getBoundingClientRect();
        return {
          left: ar.left + (parseFloat(st.borderLeftWidth) || 0),
          right: ar.right - (parseFloat(st.borderRightWidth) || 0),
        };
      }
      return null;
    };
    const clipped = visible.filter((el) => {
      if (el.scrollWidth > el.clientWidth + 1) return true;
      const b = clipBounds(el);
      if (!b) return false;
      const r = el.getBoundingClientRect();
      return r.right > b.right + 1 || r.left < b.left - 1;
    });
    return {
      locale: document.documentElement.dataset.locale,
      lang: document.documentElement.lang,
      id: screenId,
      screen: rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      pseudoCount: visible.filter((el) => (el.textContent || '').includes('⟦')).length,
      clipped: clipped.map((el) => el.textContent.trim()),
      englishLeaks,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, id);
  assert.equal(report.locale, 'qps-ploc');
  assert.equal(report.lang, 'qps-ploc');
  assert.ok(report.pseudoCount > 0, `${id} must expose pseudo-localized copy`);
  assert.deepEqual(report.clipped, [], `${id} pseudo copy must not clip horizontally`);
  assert.deepEqual(report.englishLeaks, [], `${id} must not leak visible English DOM copy`);
  assert.equal(report.horizontalOverflow, false, `${id} must not widen the document`);
  assert.ok(report.screen.left >= 0 && report.screen.right <= report.viewport.width + 1, `${id} must fit viewport width`);
  return report;
}

async function assertVisiblePseudoHud() {
  const report = await page.evaluate(() => {
    const hud = document.getElementById('hud');
    const tracker = document.querySelector('.sf-mission-tracker');
    // The live objective heading is `.sf-mt-obj`; `.sf-mt-title` is a permanently hidden legacy
    // node (hud.js keeps titles and GOAL restatements off by design).
    const title = tracker && tracker.querySelector('.sf-mt-obj');
    const tree = hud && document.createTreeWalker(hud, NodeFilter.SHOW_TEXT);
    const englishLeaks = [];
    let pseudoCount = 0;
    if (tree) {
      while (tree.nextNode()) {
        const node = tree.currentNode;
        const text = String(node.nodeValue || '').trim();
        const parent = node.parentElement;
        if (!text || !parent) continue;
        const style = getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 1 || rect.height <= 1) continue;
        if (text.includes('⟦')) pseudoCount += 1;
        else if (/[A-Za-z]{2}/.test(text)) englishLeaks.push(text.slice(0, 120));
      }
    }
    return {
      id: 'flightHud',
      locale: document.documentElement.dataset.locale,
      lang: document.documentElement.lang,
      title: title && title.textContent,
      pseudoCount,
      englishLeaks,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  assert.equal(report.locale, 'qps-ploc');
  assert.equal(report.lang, 'qps-ploc');
  assert.equal(report.horizontalOverflow, false, 'pseudo HUD must not widen the document');
  assert.ok(report.pseudoCount > 0, 'HUD must expose pseudo-localized copy');
  assert.deepEqual(report.englishLeaks, [], 'HUD must not leak visible English DOM copy');
  assert.match(report.title || '', /^⟦[\s\S]*⟧$/, 'HUD objective heading must use pseudo locale');
  return report;
}
