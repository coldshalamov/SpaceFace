import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONTRACT_URL = new URL('../scripts/lib/m6ForcedColorsContracts.mjs', import.meta.url);
const CHECK_URL = new URL('../scripts/check-m6-forced-colors.mjs', import.meta.url);

assert.ok(existsSync(CONTRACT_URL), 'forced-colors receipt contract module must exist');
assert.ok(existsSync(CHECK_URL), 'forced-colors check script must exist');

const {
  M6_FORCED_COLORS_SCHEMA,
  M6_FORCED_COLORS_VIEWPORT,
  validateM6ForcedColorsReceipt,
} = await import(CONTRACT_URL);

function validReceipt(runtime = 'browser') {
  return {
    schema: M6_FORCED_COLORS_SCHEMA,
    runtime,
    route: {
      publicRoot: true,
      canonicalRoot: true,
      cleanUrl: true,
      injectedState: false,
    },
    forcedColors: {
      enabledBeforeLoad: true,
      mediaMatches: true,
      rootClass: true,
      applyReport: true,
    },
    input: {
      source: 'keyboard',
      sequence: ['Tab', 'Shift+Tab', 'Enter', 'Escape'],
      mainMenuOnly: true,
      settingsOnly: true,
    },
    ui: {
      mainMenuVisible: true,
      settingsVisible: true,
      focusVisible: true,
      focusOutlineWidthPx: 3,
      focusUsesHighlight: true,
      opaqueBoundaries: true,
      textGlyphRedundancy: true,
      systemColors: {
        Canvas: true,
        CanvasText: true,
        ButtonFace: true,
        ButtonText: true,
        Highlight: true,
        HighlightText: true,
        GrayText: true,
      },
    },
    viewport: {
      ...M6_FORCED_COLORS_VIEWPORT,
      clipped: [],
      overlaps: [],
    },
    errors: [],
    capture: {
      path: `forced-colors-${runtime}.png`,
      bytes: 4096,
      nonBlank: true,
      uniqueColors: 3,
    },
    cleanup: runtime === 'browser'
      ? { pass: true, owned: true, pageClosed: true, contextClosed: true, browserClosed: true, serverClosed: true }
      : { pass: true, owned: true, pageClosed: true, runtimeClosed: true, listenerClosed: true, profileRemoved: true },
  };
}

test('pure validator accepts complete browser and Electron receipts', () => {
  for (const runtime of ['browser', 'electron']) {
    const result = validateM6ForcedColorsReceipt(validReceipt(runtime), { runtime });
    assert.equal(result.pass, true, `${runtime}: ${result.failures.join('; ')}`);
    assert.deepEqual(result.failures, []);
  }
});

test('pure validator rejects every required evidence-family omission', () => {
  const cases = [
    ['public route', (r) => { r.route.publicRoot = false; }],
    ['state injection', (r) => { r.route.injectedState = true; }],
    ['preload forced colors', (r) => { r.forcedColors.enabledBeforeLoad = false; }],
    ['active media', (r) => { r.forcedColors.mediaMatches = false; }],
    ['runtime report', (r) => { r.forcedColors.applyReport = false; }],
    ['focus ring', (r) => { r.ui.focusOutlineWidthPx = 2; }],
    ['system color', (r) => { r.ui.systemColors.GrayText = false; }],
    ['clipping', (r) => { r.viewport.clipped.push('#settings'); }],
    ['overlap', (r) => { r.viewport.overlaps.push(['#a', '#b']); }],
    ['runtime error', (r) => { r.errors.push('pageerror'); }],
    ['blank capture', (r) => { r.capture.nonBlank = false; }],
    ['cleanup', (r) => { r.cleanup.pass = false; }],
  ];
  for (const [label, mutate] of cases) {
    const receipt = validReceipt('browser');
    mutate(receipt);
    const result = validateM6ForcedColorsReceipt(receipt, { runtime: 'browser' });
    assert.equal(result.pass, false, label);
    assert.ok(result.failures.length > 0, label);
  }
});

test('applyAccessibility bridges live forced-colors media without mutating settings', async () => {
  const queries = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = {
    matchMedia(query) {
      if (!queries.has(query)) {
        const listeners = [];
        queries.set(query, {
          media: query,
          matches: query === '(forced-colors: active)',
          listeners,
          addEventListener(type, fn) { if (type === 'change') listeners.push(fn); },
          removeEventListener(type, fn) {
            if (type !== 'change') return;
            const i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
          },
        });
      }
      return queries.get(query);
    },
  };
  const names = new Set();
  const root = {
    classList: {
      add(name) { names.add(name); },
      remove(name) { names.delete(name); },
      toggle(name, force) { force ? names.add(name) : names.delete(name); },
      contains(name) { return names.has(name); },
    },
    style: { setProperty() {} },
  };
  const settings = {
    video: { motionReduce: false },
    accessibility: { motionPreference: 'full', captions: true },
  };
  const before = structuredClone(settings);
  try {
    const module = await import(`../src/ui/accessibility.js?m6-forced-colors=${Date.now()}`);
    const first = module.applyAccessibility(settings, root);
    const second = module.applyAccessibility(settings, root);
    assert.equal(first.forcedColorsActive, true);
    assert.equal(second.forcedColorsActive, true);
    assert.equal(module.getForcedColorsActive(), true);
    assert.equal(names.has('sf-forced-colors'), true);
    assert.equal(queries.get('(forced-colors: active)').listeners.length, 1, 'listener binding is idempotent');
    assert.deepEqual(settings, before, 'forced-colors bridge does not write settings');

    const forcedQuery = queries.get('(forced-colors: active)');
    forcedQuery.matches = false;
    for (const listener of [...forcedQuery.listeners]) listener({ matches: false });
    assert.equal(module.getForcedColorsActive(), false);
    assert.equal(names.has('sf-forced-colors'), false);
    assert.deepEqual(settings, before);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('forced-colors CSS uses opaque system colors and preserves only the world canvas', () => {
  const css = readFileSync(new URL('../styles/accessibility.css', import.meta.url), 'utf8');
  const mediaAt = css.indexOf('@media (forced-colors: active)');
  assert.ok(mediaAt >= 0, 'forced-colors media block missing');
  const nextSection = css.indexOf('   UI SCALE —', mediaAt);
  const block = css.slice(mediaAt, nextSection > mediaAt ? nextSection : undefined);
  for (const token of ['Canvas', 'CanvasText', 'ButtonFace', 'ButtonText', 'Highlight', 'HighlightText', 'GrayText']) {
    assert.match(block, new RegExp(`\\b${token}\\b`), token);
  }
  assert.match(block, /:focus-visible[\s\S]*outline:\s*3px\s+solid\s+Highlight/i);
  assert.doesNotMatch(block, /rgba\(|hsla\(|transparent|gradient\(|backdrop-filter:\s*blur|box-shadow:(?!\s*none)/i);
  const adjustments = [...css.matchAll(/forced-color-adjust\s*:\s*none/g)];
  assert.equal(adjustments.length, 1, 'only the world canvas may opt out of forced colors');
  assert.match(block, /#gl-canvas\s*\{[^}]*forced-color-adjust:\s*none/i);
});

test('probe source uses shared isolation, preload activation, real keys, and no state injection', () => {
  const source = readFileSync(CHECK_URL, 'utf8');
  assert.match(source, /acquireVisualProbeServer/);
  assert.match(source, /loadPlaywright/);
  assert.match(source, /createIsolatedElectronLaunch/);
  assert.match(source, /closeOwnedResources/);
  assert.match(source, /closeOwnedElectronRuntime/);
  assert.match(source, /emulateMedia\(\{\s*forcedColors:\s*['"]active['"]\s*\}\)/);
  assert.ok(source.indexOf("emulateMedia({ forcedColors: 'active' })") < source.indexOf('page.goto('),
    'browser must enable forced colors before navigation');
  assert.match(source, /--force-high-contrast/);
  for (const key of ["'Tab'", "'Shift+Tab'", "'Enter'", "'Escape'"]) {
    assert.match(source, new RegExp(`keyboard\\.press\\(${key.replace('+', '\\+')}\\)`), key);
  }
  assert.doesNotMatch(source, /window\.SF\s*=|SF\.state\s*=|state\.[A-Za-z0-9_$.[\]]+\s*=/);
  assert.doesNotMatch(source, /station|dock:docked|game:new/i);
});

test('headless self-test exercises browser and Electron receipts', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(CHECK_URL), '--self-test'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /M6 forced colors self-test PASS/i);
  assert.match(run.stdout, /browser/i);
  assert.match(run.stdout, /electron/i);
});
