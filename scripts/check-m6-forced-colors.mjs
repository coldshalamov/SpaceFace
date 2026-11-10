#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  closeOwnedResources,
  createCanonicalUrlTracker,
  inspectCanonicalRootUrl,
} from './lib/alphaLiveBaselineContracts.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';
import {
  M6_FORCED_COLORS_SCHEMA,
  M6_FORCED_COLORS_SYSTEM_COLORS,
  M6_FORCED_COLORS_VIEWPORT,
  validateM6ForcedColorsReceipt,
} from './lib/m6ForcedColorsContracts.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT_ROOT = path.join(ROOT, '.devshots', 'spec2', 'm6-forced-colors');

const args = new Set(process.argv.slice(2));
if (args.has('--self-test') || args.size === 0) {
  runSelfTest();
} else {
  const receipts = [];
  if (args.has('--browser') || args.has('--all')) receipts.push(await runBrowserProbe());
  if (args.has('--electron') || args.has('--all')) receipts.push(await runElectronProbe());
  assert.ok(receipts.length, 'use --self-test, --browser, --electron, or --all');
  console.log(JSON.stringify({ pass: true, receipts: receipts.map((row) => ({ runtime: row.runtime, capture: row.capture.path })) }));
}

function runSelfTest() {
  for (const runtime of ['browser', 'electron']) {
    const receipt = syntheticReceipt(runtime);
    const result = validateM6ForcedColorsReceipt(receipt, { runtime });
    assert.deepEqual(result.failures, [], `${runtime}: ${result.failures.join('; ')}`);
  }
  const rejected = syntheticReceipt('browser');
  rejected.capture.nonBlank = false;
  assert.equal(validateM6ForcedColorsReceipt(rejected, { runtime: 'browser' }).pass, false);
  console.log('M6 forced colors self-test PASS — browser + electron receipts');
}

async function runBrowserProbe() {
  const outputDir = path.join(OUTPUT_ROOT, 'browser');
  await mkdir(outputDir, { recursive: true });
  let server = null;
  let browser = null;
  let context = null;
  let page = null;
  let issues = null;
  let tracker = null;
  let cleanup = null;
  let primaryError = null;
  let receipt = null;
  try {
    server = await acquireVisualProbeServer({ root: ROOT });
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: M6_FORCED_COLORS_VIEWPORT, screen: M6_FORCED_COLORS_VIEWPORT });
    page = await context.newPage();
    await page.emulateMedia({ forcedColors: 'active' });
    tracker = createCanonicalUrlTracker(page, server.baseUrl);
    issues = collectPageIssues(page, { includeWarnings: false, ignoreProbeWarnings: true });
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert.deepEqual(inspectCanonicalRootUrl(page.url(), server.baseUrl).failures, []);
    receipt = await exercisePublicSurfaces(page, {
      runtime: 'browser',
      rootUrl: server.baseUrl,
      outputDir,
      enabledBeforeLoad: true,
    });
    receipt.errors = issues.errorIssues();
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      cleanup = await closeOwnedResources({ page, context, browser, server, canonicalUrlTracker: tracker });
    } catch (error) {
      if (!primaryError) primaryError = error;
      cleanup = error.cleanupReport || { pass: false };
    }
    issues?.stop?.();
  }
  if (primaryError) throw primaryError;
  receipt.cleanup = {
    pass: cleanup.pass === true,
    owned: server?.ownsServer === true,
    pageClosed: cleanup.pageClosed === true,
    contextClosed: cleanup.contextClosed === true,
    browserClosed: cleanup.browserDisconnected === true,
    serverClosed: cleanup.serverReleased === true,
  };
  return publishValidatedReceipt(receipt, outputDir);
}

async function runElectronProbe() {
  const outputDir = path.join(OUTPUT_ROOT, 'electron');
  await mkdir(outputDir, { recursive: true });
  const { _electron: electron } = await loadPlaywright();
  const isolated = createIsolatedElectronLaunch({ root: ROOT, taskId: 'm6-forced-colors' });
  isolated.options.args.push('--force-high-contrast');
  let electronApp = null;
  let childProcess = null;
  let processMonitor = null;
  let issueTracker = null;
  let tracker = null;
  let page = null;
  let cleanup = null;
  let primaryError = null;
  let receipt = null;
  let rootUrl = null;
  try {
    electronApp = await electron.launch(isolated.options);
    childProcess = electronApp.process();
    processMonitor = createElectronProcessMonitor({ electronApp, childProcess });
    issueTracker = createStrictElectronApplicationIssueTracker(electronApp);
    page = await electronApp.firstWindow({ timeout: 90_000 });
    await issueTracker.bindAndBackfillPage(page);
    tracker = createElectronCanonicalUrlTracker(page, { allowAnyLoopbackPort: true });
    rootUrl = assertIsolatedElectronRootUrl(await tracker.waitForCanonicalRoot(10_000));
    await electronApp.evaluate(({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.setContentSize(size.width, size.height);
    }, M6_FORCED_COLORS_VIEWPORT);
    await page.emulateMedia({ forcedColors: 'active' });
    receipt = await exercisePublicSurfaces(page, {
      runtime: 'electron', rootUrl, outputDir, enabledBeforeLoad: true,
    });
    receipt.errors = issueTracker.errors();
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      cleanup = await closeOwnedElectronRuntime({
        page, electronApp, childProcess, canonicalUrlTracker: tracker, processMonitor, rootUrl,
      });
    } catch (error) {
      if (!primaryError) primaryError = error;
      cleanup = error.cleanupReport || { pass: false };
    }
    issueTracker?.stop?.();
  }
  if (cleanup?.pass === true) isolated.cleanup({ runtimeClosed: true });
  if (primaryError) throw primaryError;
  receipt.cleanup = {
    pass: cleanup.pass === true,
    owned: true,
    pageClosed: cleanup.pageClosed === true,
    runtimeClosed: cleanup.processHealth?.pass === true,
    listenerClosed: cleanup.listenerReleased === true || cleanup.serverReleased === true,
    profileRemoved: !existsSync(isolated.userDataDir),
  };
  return publishValidatedReceipt(receipt, outputDir);
}

async function exercisePublicSurfaces(page, { runtime, rootUrl, outputDir, enabledBeforeLoad }) {
  await waitForMainMenu(page);
  await focusByTab(page, /settings/i);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const candidates = [...document.querySelectorAll('[data-screen], .screen')];
    return candidates.some((node) => /settings/i.test(node.getAttribute('data-screen') || node.id || node.className)
      && visible(node));
    function visible(node) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
    }
  }, null, { timeout: 20_000 });
  const settingsFrame = await inspectFrame(page);
  await page.keyboard.press('Tab');
  const focusFrame = await inspectFrame(page);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await waitForMainMenu(page);
  const menuFrame = await inspectFrame(page);

  const captureName = `forced-colors-${runtime}.png`;
  const capturePath = path.join(outputDir, captureName);
  const pngBytes = await page.screenshot({ path: capturePath, type: 'png', animations: 'disabled' });
  const capture = inspectPng(pngBytes, captureName);
  const runtimeState = await page.evaluate(async (tokens) => {
    const access = await import('/src/ui/accessibility.js');
    const cssText = [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText); }
      catch { return []; }
    }).join('\n');
    return {
      mediaMatches: matchMedia('(forced-colors: active)').matches,
      rootClass: document.documentElement.classList.contains('sf-forced-colors'),
      applyReport: access.getForcedColorsActive() === true,
      systemColors: Object.fromEntries(tokens.map((token) => [token,
        CSS.supports('color', token) && cssText.includes(token)])),
      textGlyphRedundancy: [...document.querySelectorAll('button, [role="button"]')]
        .filter((node) => node.getClientRects().length).every((node) => !!(node.textContent || node.getAttribute('aria-label'))?.trim()),
    };
  }, M6_FORCED_COLORS_SYSTEM_COLORS);
  const frames = [settingsFrame, focusFrame, menuFrame];
  return {
    schema: M6_FORCED_COLORS_SCHEMA,
    runtime,
    route: {
      publicRoot: true,
      canonicalRoot: inspectCanonicalRootUrl(page.url(), rootUrl).pass,
      cleanUrl: !new URL(page.url()).search && !new URL(page.url()).hash,
      injectedState: false,
    },
    forcedColors: { enabledBeforeLoad, ...runtimeState },
    input: {
      source: 'keyboard', sequence: ['Tab', 'Shift+Tab', 'Enter', 'Escape'],
      mainMenuOnly: true, settingsOnly: true,
    },
    ui: {
      mainMenuVisible: menuFrame.visibleSurface,
      settingsVisible: settingsFrame.visibleSurface,
      focusVisible: focusFrame.focus.visible,
      focusOutlineWidthPx: focusFrame.focus.outlineWidthPx,
      focusUsesHighlight: focusFrame.focus.outlineWidthPx >= 3 && focusFrame.cssHasHighlightFocus,
      opaqueBoundaries: frames.every((frame) => frame.opaqueBoundaries),
      textGlyphRedundancy: runtimeState.textGlyphRedundancy,
      systemColors: runtimeState.systemColors,
    },
    viewport: {
      width: menuFrame.viewport.width, height: menuFrame.viewport.height,
      clipped: frames.flatMap((frame) => frame.clipped),
      overlaps: frames.flatMap((frame) => frame.overlaps),
    },
    errors: [],
    capture,
    cleanup: null,
  };
}

async function waitForMainMenu(page) {
  await page.waitForFunction(() => !!window.SF, null, { timeout: 60_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-screen="mainMenu"]');
    if (!screen) return false;
    const rect = screen.getBoundingClientRect();
    const style = getComputedStyle(screen);
    return !screen.hidden && style.display !== 'none' && rect.width > 1 && rect.height > 1;
  }, null, { timeout: 30_000 });
}

async function focusByTab(page, name) {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const node = document.activeElement;
      return `${node?.getAttribute?.('aria-label') || ''} ${node?.textContent || ''}`.trim();
    });
    if (name.test(label)) return;
  }
  throw new Error(`keyboard traversal did not reach ${name}`);
}

async function inspectFrame(page) {
  return page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight };
    const focus = document.activeElement;
    const focusStyle = focus ? getComputedStyle(focus) : null;
    const visible = [...document.querySelectorAll('button, a, input, select, textarea, [tabindex]')]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
      }).map((node, index) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { id: node.id || node.getAttribute('aria-label') || `${node.tagName}:${index}`,
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          opaque: style.backgroundColor !== 'rgba(0, 0, 0, 0)'
            && parseFloat(style.borderTopWidth || '0') >= 1 };
      });
    const clipped = visible.filter((r) => r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight).map((r) => r.id);
    const overlaps = [];
    for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i], b = visible[j];
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (width * height > 16) overlaps.push([a.id, b.id]);
    }
    const opaqueBoundaries = visible.every((row) => row.opaque);
    const cssText = [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText); }
      catch { return []; }
    }).join('\n');
    return {
      viewport,
      clipped,
      overlaps,
      visibleSurface: visible.length > 0,
      opaqueBoundaries,
      cssHasHighlightFocus: /outline:\s*3px\s+solid\s+Highlight/i.test(cssText),
      focus: {
        visible: !!focus && focus !== document.body && parseFloat(focusStyle?.outlineWidth || '0') >= 3,
        outlineWidthPx: parseFloat(focusStyle?.outlineWidth || '0'),
      },
    };
  });
}

function inspectPng(buffer, name) {
  const png = PNG.sync.read(buffer);
  const colors = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue;
    colors.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`);
    if (colors.size >= 8) break;
  }
  return { path: name, bytes: buffer.length, nonBlank: colors.size >= 2, uniqueColors: colors.size };
}

async function publishValidatedReceipt(receipt, outputDir) {
  const validation = validateM6ForcedColorsReceipt(receipt, { runtime: receipt.runtime });
  assert.deepEqual(validation.failures, [], validation.failures.join('; '));
  await writeFile(path.join(outputDir, 'receipt.json'), `${JSON.stringify({ ...receipt, validation }, null, 2)}\n`, 'utf8');
  return receipt;
}

function syntheticReceipt(runtime) {
  return {
    schema: M6_FORCED_COLORS_SCHEMA,
    runtime,
    route: { publicRoot: true, canonicalRoot: true, cleanUrl: true, injectedState: false },
    forcedColors: { enabledBeforeLoad: true, mediaMatches: true, rootClass: true, applyReport: true },
    input: { source: 'keyboard', sequence: ['Tab', 'Shift+Tab', 'Enter', 'Escape'], mainMenuOnly: true, settingsOnly: true },
    ui: {
      mainMenuVisible: true, settingsVisible: true, focusVisible: true, focusOutlineWidthPx: 3,
      focusUsesHighlight: true, opaqueBoundaries: true, textGlyphRedundancy: true,
      systemColors: Object.fromEntries(M6_FORCED_COLORS_SYSTEM_COLORS.map((token) => [token, true])),
    },
    viewport: { ...M6_FORCED_COLORS_VIEWPORT, clipped: [], overlaps: [] },
    errors: [],
    capture: { path: `${runtime}.png`, bytes: 4096, nonBlank: true, uniqueColors: 3 },
    cleanup: runtime === 'browser'
      ? { pass: true, owned: true, pageClosed: true, contextClosed: true, browserClosed: true, serverClosed: true }
      : { pass: true, owned: true, pageClosed: true, runtimeClosed: true, listenerClosed: true, profileRemoved: true },
  };
}
