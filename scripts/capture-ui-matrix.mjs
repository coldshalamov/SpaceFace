#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { CAPTURE_SURFACES, IMPLEMENTED_ENTRY_KINDS, orderForOneBoot } from './ui-grammar-surfaces.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUTPUT_DIR = path.join(ROOT, '.devshots', 'ui-matrix');
export const UI_FRAME_REFERENCE_DIR = path.join(ROOT, 'test', 'ui-frame-references');

const FLIGHT_SETTLE_MS = 1500;
const SURFACE_SETTLE_MS = 1500;
const SHIP_STAGE_SETTLE_MS = 6000;
const MAIN_MENU_TIMEOUT_MS = 90_000;
const NEW_GAME_TIMEOUT_MS = 45_000;

export const MATRIX_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 2560, height: 1080 }),
  Object.freeze({ width: 1920, height: 1080 }),
  Object.freeze({ width: 1280, height: 720 }),
]);

const STANDARD_MODES = Object.freeze([
  Object.freeze({
    id: 'default',
    emulate: Object.freeze({ reducedMotion: 'no-preference', forcedColors: 'none' }),
  }),
  Object.freeze({
    id: 'reduced-motion',
    emulate: Object.freeze({ reducedMotion: 'reduce', forcedColors: 'none' }),
  }),
  Object.freeze({
    id: 'forced-colors',
    emulate: Object.freeze({ reducedMotion: 'no-preference', forcedColors: 'active' }),
  }),
]);

const PSEUDO_MODE = Object.freeze({
  id: 'pseudo-localized',
  emulate: Object.freeze({ reducedMotion: 'no-preference', forcedColors: 'none' }),
  locale: 'qps-ploc',
});

// Per-surface settle overrides. Everything else takes SURFACE_SETTLE_MS. The ship stage waits
// longest because its WebGL preview streams a hull before it is worth photographing.
const SETTLE_OVERRIDES = Object.freeze({
  flight: FLIGHT_SETTLE_MS,
  ship: SHIP_STAGE_SETTLE_MS,
});

// PQ-180 .03: the capture surface list is no longer hand-written here — it is the manifest in
// scripts/ui-grammar-surfaces.mjs, so a surface added to the matrix is captured by construction and
// the two can never drift. The five original ids (flight/ship/footprint/range/chart) keep their
// names, so the committed reference PNGs for them stay valid byte-for-byte.
export const MATRIX_SURFACES = Object.freeze(CAPTURE_SURFACES.map((surface) => Object.freeze({
  id: surface.id,
  key: surface.entry.kind === 'key' ? surface.entry.key : null,
  entry: surface.entry,
  screenId: surface.screenId || null,
  archetype: surface.archetype,
  selectors: Object.freeze([...(surface.root || [])]),
  settleMs: SETTLE_OVERRIDES[surface.id] || SURFACE_SETTLE_MS,
  destructive: surface.destructive === true,
  // 'element' crops to the surface's own box — the right frame for an overlay that lives inside the
  // flight picture (the Power Rail, the radials). Anything else is the whole viewport.
  captureMode: surface.captureMode === 'element' ? 'element' : 'viewport',
})));

const SURFACE_BY_ID = new Map(MATRIX_SURFACES.map((surface) => [surface.id, surface]));

/** Pre-launch surfaces (title, new game) live before Launch and are captured in the menu phase. */
const PRE_LAUNCH_KINDS = new Set(['boot', 'boot-nested']);
// Ordered by scripts/ui-grammar-surfaces.mjs `orderForOneBoot`: a fixture changes the session, so
// key-entry flight surfaces come first, push-screen fixtures next, docking after that. A destructive
// surface would end the run for every mode sharing this boot, so it is photographed in its own boot
// (DESTRUCTIVE_SURFACES below) rather than being dropped from the plan.
const IN_FLIGHT_SURFACES = Object.freeze(orderForOneBoot(
  MATRIX_SURFACES.filter((s) => !PRE_LAUNCH_KINDS.has(s.entry.kind) && s.id !== 'flight' && !s.destructive),
));
const DESTRUCTIVE_SURFACES = Object.freeze(MATRIX_SURFACES.filter((s) => s.destructive));

export function buildFramePlan() {
  const out = [];
  for (const viewport of MATRIX_VIEWPORTS) {
    for (const mode of [...STANDARD_MODES, PSEUDO_MODE]) {
      for (const surface of MATRIX_SURFACES) {
        out.push(Object.freeze({
          surface: surface.id,
          mode: mode.id,
          viewport: `${viewport.width}x${viewport.height}`,
          width: viewport.width,
          height: viewport.height,
        }));
      }
    }
  }
  return out;
}

export function frameFileName({ surface, mode, width, height }) {
  return `${surface}-${mode}-${width}x${height}.png`;
}

export async function captureUiMatrix(options = {}) {
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const updateReferences = options.updateReferences === true;
  const printTable = options.printTable !== false;
  const quiet = options.quiet === true;
  const plan = buildFramePlan();
  const byName = new Map(plan.map((entry) => [frameFileName(entry), entry]));

  mkdirSync(outputDir, { recursive: true });
  if (updateReferences) mkdirSync(UI_FRAME_REFERENCE_DIR, { recursive: true });

  const { chromium } = await loadPlaywright();
  // Server first, browser second, and the server is torn down if the browser never starts — a
  // stranded node server would hold its port for every later run.
  const server = await startFreshServer();
  let browser = null;
  try {
    browser = await chromium.launch({ headless: options.headed !== true });
  } catch (error) {
    server.kill();
    throw new Error(`chromium.launch failed (server torn down): ${error.message}`);
  }

  const captures = [];
  // A surface that could not be opened is an EXPLICIT missing/error entry, never a silently short
  // plan: PQ-180 .03 covers every surface, and a gap has to be visible to be assigned.
  const failures = [];
  let bootCount = 0;

  try {
    for (const viewport of MATRIX_VIEWPORTS) {
      const primaryBoot = await openBootWithRetry({
        browser,
        baseUrl: server.baseUrl,
        viewport,
        locale: null,
        menuPhase: makeMenuPhaseCapture({ modes: STANDARD_MODES, outputDir, captures, failures, viewport }),
      });
      bootCount += 1;
      try {
        for (const mode of STANDARD_MODES) {
          await captureModeSet({
            page: primaryBoot.page,
            viewport,
            mode,
            outputDir,
            captures,
            failures,
          });
        }
      } finally {
        await primaryBoot.close();
      }

      const pseudoBoot = await openBootWithRetry({
        browser,
        baseUrl: server.baseUrl,
        viewport,
        locale: PSEUDO_MODE.locale,
        menuPhase: makeMenuPhaseCapture({ modes: [PSEUDO_MODE], outputDir, captures, failures, viewport }),
      });
      bootCount += 1;
      try {
        await captureModeSet({
          page: pseudoBoot.page,
          viewport,
          mode: PSEUDO_MODE,
          outputDir,
          captures,
          failures,
          expectedLocale: PSEUDO_MODE.locale,
        });
      } finally {
        await pseudoBoot.close();
      }

      // Destructive surfaces end the run, so each gets its own boot per mode. Sharing one would
      // make every frame after it in that boot a picture of a dead session.
      for (const surface of DESTRUCTIVE_SURFACES) {
        for (const mode of [...STANDARD_MODES, PSEUDO_MODE]) {
          const isolated = await openBootWithRetry({
            browser, baseUrl: server.baseUrl, viewport, locale: mode.locale || null,
          });
          bootCount += 1;
          try {
            await isolated.page.emulateMedia(mode.emulate);
            const opened = await openSurface(isolated.page, surface);
            if (!opened.ok) {
              failures.push({ surface: surface.id, mode: mode.id, viewport, reason: opened.reason });
            } else {
              await isolated.page.waitForTimeout(surface.settleMs);
              await captureSurfaceScreenshot({
                page: isolated.page, outputDir, captures, surface, modeId: mode.id, viewport,
              });
            }
          } catch (error) {
            failures.push({ surface: surface.id, mode: mode.id, viewport, reason: error.message });
          } finally {
            await isolated.close().catch(() => {});
          }
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }

  if (captures.length !== plan.length && !quiet) {
    console.warn(
      `\ncapture coverage: ${captures.length}/${plan.length} planned frames produced; `
      + `${failures.length} explicit failure(s) recorded (see the table below).`,
    );
  }

  if (updateReferences) {
    const expectedNames = new Set();
    for (const capture of captures) {
      expectedNames.add(capture.name);
      copyFileSync(capture.path, path.join(UI_FRAME_REFERENCE_DIR, capture.name));
    }
    pruneStaleReferencePngs(expectedNames);
  }

  const enriched = captures
    .map((capture) => ({
      ...capture,
      bytes: statSync(capture.path).size,
      plan: byName.get(capture.name) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

  const totalBytes = enriched.reduce((sum, row) => sum + row.bytes, 0);

  if (printTable && !quiet) {
    printCaptureTable({
      rows: enriched,
      outputDir,
      updateReferences,
      bootCount,
      totalBytes,
    });
    printCaptureFailures(failures, plan.length, enriched.length);
  }

  return {
    outputDir,
    bootCount,
    totalBytes,
    captures: enriched,
    failures,
    referenceDir: UI_FRAME_REFERENCE_DIR,
    frames: plan.length,
    renderer: options.headed === true
      ? 'headed Chromium (host GPU)'
      : 'headless Chromium (SwiftShader software rendering — not performance acceptance evidence)',
  };
}

/** Named, per-frame reasons — a plan entry with no PNG must say why, or it is just silence. */
function printCaptureFailures(failures, planned, produced) {
  console.log(`\ncapture coverage: ${produced}/${planned} planned frames produced`);
  if (!failures.length) return;
  console.log(`${failures.length} frame(s) could not be captured:`);
  const bySurface = new Map();
  for (const f of failures) {
    const bucket = bySurface.get(f.surface) || [];
    bucket.push(`${f.mode}@${f.viewport.width}x${f.viewport.height}: ${f.reason}`);
    bySurface.set(f.surface, bucket);
  }
  for (const [surface, reasons] of bySurface) {
    console.log(`  ${surface} (${reasons.length})`);
    console.log(`    ${reasons[0]}`);
  }
}

function pruneStaleReferencePngs(expectedNames) {
  for (const name of readdirSync(UI_FRAME_REFERENCE_DIR)) {
    if (!/\.png$/i.test(name)) continue;
    if (expectedNames.has(name)) continue;
    rmSync(path.join(UI_FRAME_REFERENCE_DIR, name), { force: true });
  }
}

async function captureModeSet({
  page,
  viewport,
  mode,
  outputDir,
  captures,
  failures,
  expectedLocale = null,
}) {
  await page.emulateMedia(mode.emulate);
  await ensureFlightIdle(page);
  if (expectedLocale) {
    await page.waitForFunction(
      (locale) => document.documentElement.dataset.locale === locale,
      expectedLocale,
      { timeout: 20_000 },
    );
  }

  await waitForSimTicks(page, 90, 45_000, FLIGHT_SETTLE_MS);
  // The intro live-screen fence fades the comms panel in as it clears; capture after the fade
  // so the flight frame does not show half-faded instrument text.
  await page.waitForFunction(() => !document.body.classList.contains('ui-live-screen'), null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(400);
  await captureSurfaceScreenshot({
    page,
    outputDir,
    captures,
    surface: SURFACE_BY_ID.get('flight'),
    modeId: mode.id,
    viewport,
  });

  for (const surface of IN_FLIGHT_SURFACES) {
    try {
      const opened = await openSurface(page, surface);
      if (!opened.ok) {
        failures.push({ surface: surface.id, mode: mode.id, viewport, reason: opened.reason });
      } else {
        await page.waitForTimeout(surface.settleMs);
        await stabilizeSurfaceForCapture(page, surface.id);
        await captureSurfaceScreenshot({
          page,
          outputDir,
          captures,
          surface,
          modeId: mode.id,
          viewport,
        });
      }
    } catch (error) {
      failures.push({ surface: surface.id, mode: mode.id, viewport, reason: error.message });
    }
    // Recovery is mandatory and VERIFIED, not best-effort: a radial or drawer left open would be
    // photographed on top of the next surface — and it would eat the Escape that opens pause — so
    // every later frame in this mode would show a defect that is really this one.
    const closed = await closeSurface(page, surface).catch((error) => ({ ok: false, reason: error.message }));
    if (!closed.ok) {
      failures.push({
        surface: surface.id, mode: mode.id, viewport,
        reason: `${closed.reason} — remaining surfaces in this mode were skipped`,
      });
      return;
    }
    try {
      await ensureFlightIdle(page);
    } catch (error) {
      failures.push({
        surface: surface.id, mode: mode.id, viewport,
        reason: `could not return to idle flight after this surface: ${error.message} — remaining surfaces in this mode were skipped`,
      });
      return;
    }
  }
}

/**
 * Return to the menu stage after opening something from it. `closeOpenScreens` can never succeed
 * here: the title screen is ITSELF an open screen, so "close the open screen" would loop through
 * twelve Escapes and then throw. One Escape, then wait for the stage to be back.
 */
async function returnToStage(page, stage) {
  for (let i = 0; i < 8; i += 1) {
    if (await anyVisible(page, stage.selectors)) return { ok: true };
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  return { ok: false, reason: `could not return to "${stage.id}" in the menu phase` };
}

/**
 * Open one manifest surface the way its entry route says to. Returns { ok, reason } instead of
 * throwing, so an unreachable surface becomes an explicit red cell in the grammar matrix rather
 * than an aborted run. Never force-injects DOM or instantiates a screen object directly — a
 * surface that cannot be reached through a control or a NAMED fixture is reported as unreachable.
 */
export async function openSurface(page, surface, context = {}) {
  const entry = surface.entry || {};
  if (!IMPLEMENTED_ENTRY_KINDS.includes(entry.kind)) {
    return { ok: false, reason: `no opener implemented for entry kind "${entry.kind}": ${entry.detail || ''}` };
  }
  try {
    switch (entry.kind) {
      case 'default':
        await ensureFlightIdle(page);
        break;
      case 'key':
        await ensureFlightIdle(page);
        await page.keyboard.press(normalizeKey(entry.key));
        break;
      case 'nested': {
        const parent = SURFACE_BY_ID.get(entry.parent) || null;
        if (!parent) return { ok: false, reason: `parent surface "${entry.parent}" is not in the capture set` };
        const parentOpened = await openSurface(page, parent, context);
        if (!parentOpened.ok) return { ok: false, reason: `parent ${entry.parent}: ${parentOpened.reason}` };
        await page.waitForTimeout(300);
        const clicked = await clickControl(page, entry);
        if (!clicked.ok) return { ok: false, reason: clicked.reason };
        break;
      }
      case 'fixture': {
        const applied = await applyFixture(page, entry.fixture);
        if (!applied.ok) return applied;
        break;
      }
      case 'boot':
        // The stage itself is already on screen during the menu phase; there is nothing to press.
        if (context.stage !== surface.id) {
          return { ok: false, reason: 'pre-launch surface: only openable during the menu phase of a boot' };
        }
        break;
      case 'boot-nested': {
        if (context.stage !== entry.parent) {
          return { ok: false, reason: `pre-launch surface: only openable while "${entry.parent}" is on screen` };
        }
        const clicked = await clickControl(page, entry);
        if (!clicked.ok) return { ok: false, reason: clicked.reason };
        break;
      }
      default:
        return { ok: false, reason: `no automatable entry (${entry.kind}): ${entry.detail || ''}` };
    }

    const selectors = surfaceSelectors(surface);
    if (!selectors.length) return { ok: true, route: entry.kind };
    await waitForAnyVisible(page, selectors, 20_000, `${surface.id} visible`);
    return { ok: true, route: entry.kind };
  } catch (error) {
    return { ok: false, reason: error && error.message ? error.message : String(error) };
  }
}

/**
 * Press the manifest key VERBATIM. The manifest stores the BINDINGS `.key` value (`l`, `z`, `m`…)
 * and `matchesBinding` in src/ui/input.js accepts `ev.key === binding.key`, so the lowercase press
 * always matches. Upper-casing would rely on the binding also declaring a `.label`, which not every
 * binding does — and it asks the browser for a shifted key the player never presses.
 */
function normalizeKey(key) {
  return key;
}

/**
 * Click the control named by an entry. When the entry names `text`, the label is matched after
 * stripping pseudo-localization decoration (accents, wrapping punctuation, padding), so the SAME
 * public route works in the qps-ploc pass instead of being written off as unreachable there.
 */
// Both callers pass a surface: the capture harness passes its own MATRIX_SURFACES record
// (`selectors`, `key`), the grammar matrix passes the manifest entry (`root`, `entry.key`). One
// normalizer so neither caller has to reshape, and neither silently reads `undefined` — which would
// skip the visibility wait and measure a surface that had not opened yet.
function surfaceSelectors(surface) {
  if (surface.selectors && surface.selectors.length) return surface.selectors;
  return surface.root || [];
}

function surfaceKey(surface) {
  if (surface.key) return surface.key;
  return surface.entry && surface.entry.kind === 'key' ? surface.entry.key : null;
}

/**
 * Close ONE surface and prove it closed. `closeOpenScreens` only knows about the screen stack, so a
 * radial or a drawer — which are not stack screens — would survive it silently, still be on screen
 * when the next surface is photographed, and eat the Escape that should have opened the pause menu.
 * Every later row would then report a defect that is really this one.
 *
 * Returns { ok, reason }; the caller records a failure rather than proceeding on a dirty page.
 */
export async function closeSurface(page, surface) {
  const selectors = surfaceSelectors(surface);
  const key = surfaceKey(surface);
  const isOverlay = surface.archetype === 'OVERLAY';

  // An overlay toggles off with its own key first, then Escape; a stack screen goes through the
  // manager. Either way we VERIFY, and "always mounted" surfaces have nothing to close.
  if (surface.entry && surface.entry.kind === 'default') return { ok: true };

  if (isOverlay && key) {
    await page.keyboard.press(normalizeKey(key));
    await page.waitForTimeout(200);
  }
  if (await anyVisible(page, selectors)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  if (await anyVisible(page, selectors)) {
    if (!isOverlay) {
      try { await closeOpenScreens(page); } catch (error) { return { ok: false, reason: error.message }; }
    }
  }
  for (let i = 0; i < 12; i += 1) {
    if (!(await anyVisible(page, selectors))) return { ok: true };
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  return { ok: false, reason: `"${surface.id}" is still on screen after its close route; the next surface would be measured through it` };
}

async function anyVisible(page, selectors) {
  if (!selectors || !selectors.length) return false;
  return page.evaluate((items) => items.some((selector) => {
    const node = document.querySelector(selector);
    if (!node) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return !node.hidden
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && parseFloat(style.opacity || '1') > 0.01
      && rect.width > 4 && rect.height > 4;
  }), selectors);
}

async function clickControl(page, entry, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await page.evaluate(({ selector, text }) => {
      function normalize(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')      // pseudo-loc accents
          .replace(/[^a-z0-9]/gi, '')            // brackets, padding, punctuation
          .toLowerCase();
      }
      const nodes = [...document.querySelectorAll(selector)];
      if (!nodes.length) return { ok: false, reason: 'no node matched', seen: [] };
      const wanted = normalize(text);
      const seen = [];
      for (const node of nodes) {
        const label = node.textContent || '';
        seen.push(label.trim().slice(0, 24));
        if (wanted && !normalize(label).includes(wanted)) continue;
        if (node.disabled) return { ok: false, reason: 'control found but disabled', seen };
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return { ok: false, reason: 'control found but hidden', seen };
        }
        node.click();
        return { ok: true };
      }
      return { ok: false, reason: wanted ? 'no control matched the label' : 'no enabled control', seen };
    }, { selector: entry.selector, text: entry.text || null });
    if (result.ok) return { ok: true };
    if (i === attempts - 1) {
      return {
        ok: false,
        reason: `${result.reason} for ${entry.selector}${entry.text ? ` text="${entry.text}"` : ''}`
          + `${result.seen && result.seen.length ? ` (labels present: ${result.seen.join(' | ')})` : ''}`,
      };
    }
    await page.waitForTimeout(250);
  }
  return { ok: false, reason: `control never became clickable: ${entry.selector}` };
}

/**
 * Named runtime fixtures. Each one puts the game in a state the harness cannot yet FLY to; it
 * unlocks measurement and never counts as reachability evidence (see ui-grammar-surfaces.mjs).
 * The dock fixture is the same `dock:docked` route check-station-tab-navigation-runtime uses.
 */
export async function applyFixture(page, name) {
  const result = await page.evaluate((fixture) => {
    const sf = window.SF;
    if (!sf || !sf.bus || !sf.state) return { ok: false, reason: 'SF bus not available' };
    switch (fixture) {
      case 'dock': {
        const station = (sf.state.entityList || []).find((e) => e && e.data && e.data.stationId);
        if (!station) return { ok: false, reason: 'no dockable station in the first-session sector' };
        sf.bus.emit('dock:docked', { stationId: station.data.stationId });
        return { ok: true };
      }
      case 'crucible-door':
        sf.bus.emit('ui:pushScreen', { id: 'crucible', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'crucible-draft':
        sf.bus.emit('ui:pushScreen', { id: 'crucibleDraft', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'crucible-refit':
        sf.bus.emit('ui:pushScreen', { id: 'crucibleRefit', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'crucible-results':
        sf.bus.emit('ui:pushScreen', { id: 'crucibleResults', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'automation':
        sf.bus.emit('ui:pushScreen', { id: 'automation', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'player-death': {
        // The after-action screen is opened by the `game:over` subscription in uiRoot.js (~1004),
        // NOT by an entity-destroyed event. It also returns early during a live Survival run, so the
        // fixture refuses rather than silently producing a picture of the wrong thing.
        const run = sf.state.run;
        if (run && run.kind === 'survival' && run.phase !== 'inactive') {
          return { ok: false, reason: 'a Survival run is live; game:over routes to the Crucible results instead' };
        }
        sf.bus.emit('game:over', { cause: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      }
      default:
        return { ok: false, reason: `unknown fixture "${fixture}"` };
    }
  }, name);
  if (!result || !result.ok) {
    return { ok: false, reason: `fixture "${name}": ${(result && result.reason) || 'failed'}` };
  }
  await page.waitForTimeout(500);
  return { ok: true };
}

/**
 * The title and the new-game screens only exist before Launch, so they are photographed in every
 * mode during the menu phase of the same boot — no second server, no forced re-entry.
 */
function makeMenuPhaseCapture({ modes, outputDir, captures, failures, viewport }) {
  return async (page, stageId) => {
    const stage = SURFACE_BY_ID.get(stageId);
    // Surfaces reached by a button ON this stage — the Crucible door hangs off the title screen and
    // exists nowhere else, so it is photographed here or not at all.
    const children = MATRIX_SURFACES.filter((s) => s.entry.kind === 'boot-nested' && s.entry.parent === stageId);
    for (const mode of modes) {
      await page.emulateMedia(mode.emulate);
      for (const surface of [stage, ...children]) {
        if (!surface) continue;
        try {
          if (surface !== stage) {
            const opened = await openSurface(page, surface, { stage: stageId });
            if (!opened.ok) {
              failures.push({ surface: surface.id, mode: mode.id, viewport, reason: opened.reason });
              continue;
            }
          }
          await waitForAnyVisible(page, surface.selectors, 20_000, `${surface.id} visible`);
          await page.waitForTimeout(surface.settleMs);
          await captureSurfaceScreenshot({ page, outputDir, captures, surface, modeId: mode.id, viewport });
        } catch (error) {
          failures.push({ surface: surface.id, mode: mode.id, viewport, reason: error.message });
        } finally {
          if (surface !== stage && stage) await returnToStage(page, stage).catch(() => {});
        }
      }
    }
    await page.emulateMedia(modes[0].emulate);
  };
}

async function captureSurfaceScreenshot({
  page,
  outputDir,
  captures,
  surface,
  modeId,
  viewport,
}) {
  const entry = {
    surface: surface.id,
    mode: modeId,
    width: viewport.width,
    height: viewport.height,
  };
  const name = frameFileName(entry);
  const dest = path.join(outputDir, name);
  if (surface.captureMode === 'element') {
    // Crop to the overlay's own box. Playwright's element screenshot is the honest frame for a
    // surface that sits inside the flight picture: a full viewport would just be the HUD again.
    const handle = await firstVisibleHandle(page, surface.selectors);
    if (!handle) throw new Error(`element capture: no visible root for "${surface.id}"`);
    await handle.screenshot({ path: dest, animations: 'disabled' });
  } else {
    await page.screenshot({ path: dest, fullPage: false, animations: 'disabled' });
  }
  captures.push({ name, path: dest });
}

async function firstVisibleHandle(page, selectors) {
  for (const selector of selectors || []) {
    const handle = await page.$(selector);
    if (!handle) continue;
    if (await handle.isVisible().catch(() => false)) return handle;
  }
  return null;
}

/**
 * Boot the game through the real title flow. `menuPhase(page, stageId)` is called while the title
 * and the new-game screens are on screen — that is the only moment those two surfaces exist, so
 * pre-launch capture and measurement hook in there rather than trying to reach them from flight.
 */
export async function openBoot({ browser, baseUrl, viewport, locale = null, menuPhase = null }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });

    const rootUrl = locale
      ? `${baseUrl}?locale=${encodeURIComponent(locale)}`
      : baseUrl;

    await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(
      () => !!(window.SF && window.SF.state && window.SF.ctx && window.SF.bus),
      null,
      { timeout: 120_000 },
    );
    await waitForAnyVisible(page, ['[data-screen="mainMenu"]'], MAIN_MENU_TIMEOUT_MS, 'main menu');
    if (menuPhase) await menuPhase(page, 'title');

    if (!(await clickMainMenuNewGame(page))) throw new Error('main menu New Game button missing or disabled');
    await waitForAnyVisible(page, ['[data-screen="newGame"]'], NEW_GAME_TIMEOUT_MS, 'new game screen');
    if (menuPhase) await menuPhase(page, 'new-game');
    if (!(await clickNewGameLaunch(page))) throw new Error('new game Launch button missing or disabled');

    await page.waitForFunction(() => {
      const state = window.SF && window.SF.state;
      const player = state && state.entities && state.entities.get(state.playerId);
      return !!(state && state.mode === 'flight' && player && player.alive);
    }, null, { timeout: 120_000 });
    await waitForSimTicks(page, 120, 60_000, 2000);

    return {
      page,
      close: async () => {
        await context.close().catch(() => {});
      },
    };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

export async function openBootWithRetry(params, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await openBoot(params);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 4000 * attempt));
    }
  }
  throw new Error(`boot failed after ${attempts} attempt(s): ${lastError && lastError.message ? lastError.message : String(lastError)}`);
}

// Escape alone cannot leave every screen. The station is the clear case: dismissing it is an
// implicit Back that must route through the station-exit owner (`station:exitRequest`) so the
// transient clean and confirm run before a committed undock — and while the hull is still docked,
// closing the panel would not restore flight anyway. Crucible run screens are similar: they are
// advanced by a choice, not dismissed by a key.
//
// So escalate through the UI's OWN exit paths rather than pressing Escape harder. Before this, the
// probe pressed Escape twenty times and then measured the next surface through whatever was still
// on screen, which is how a whole pass of station rows became unusable as evidence.
// Escape only. Three programmatic escalations were tried on 2026-09-04 to get the capture past a
// station screen, and each was measured and rejected rather than left in:
//
//   - `screenManager.closeAll()` — tears the panel down but leaves `state.ui.docked` true, so the
//     manager's own pause request stays raised and the sim strands in `paused` with an EMPTY stack
//     and nothing left to close. Strictly worse than being stuck on the panel.
//   - `bus.emit('station:exitRequest', …)` from the probe — the station exit is a clean → confirm →
//     committed-undock flow; an emit with no real opener never reaches the committed step, so the
//     screen simply stays open.
//   - Both, dock-aware and in either order — same two dead ends.
//
// So the real blocker is that undocking cannot be driven from outside its confirm flow, which is a
// product-level question, not a probe tweak. Escape is kept because it is the honest, unchanged
// behaviour; the failure it produces is now self-describing (see ensureFlightIdle) so the next
// agent starts from the diagnosis rather than rediscovering it.
async function escalateScreenExit(page) {
  await page.keyboard.press('Escape');
}

export async function ensureFlightIdle(page) {
  let status = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    status = await readUiStatus(page);
    if (status.mode === 'flight' && status.screenOpen === false) return;
    if (status.screenOpen) {
      await escalateScreenExit(page);
      await page.waitForTimeout(200);
      continue;
    }
    await page.waitForTimeout(200);
  }
  // Say what was actually on screen. "Unable to return to idle flight" with no observation sent
  // three separate investigations after the wrong cause; the mode and the top screen id are the
  // whole diagnosis and they were already in hand.
  const seen = status
    ? `mode=${status.mode === null ? 'null' : status.mode} screenOpen=${status.screenOpen} top=${status.top === null || status.top === undefined ? 'none' : status.top}`
    : 'no status could be read';
  throw new Error(`Unable to return to idle flight state for capture — last observed ${seen}`);
}

export async function closeOpenScreens(page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await readUiStatus(page);
    if (!status.screenOpen) return;
    await escalateScreenExit(page);
    await page.waitForTimeout(200);
  }
  throw new Error('Escape did not close active screen');
}

async function stabilizeSurfaceForCapture(page, surfaceId) {
  if (surfaceId === 'ship') {
    await waitForShipPreviewReady(page);
    return;
  }
  if (surfaceId === 'range') {
    await stabilizeRangeScreen(page);
    return;
  }
  // Both chart focuses are the same animated screen; both need the scan/iris animation parked or
  // the 0.5% repeatability floor flakes on paint timing.
  if (surfaceId === 'chart' || surfaceId === 'chart-galaxy') {
    await stabilizeChartScreen(page);
  }
}

async function waitForShipPreviewReady(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-screen="ship"] .sx-sw__canvas');
    if (!canvas) return false;
    const ready = String(canvas.dataset.previewReady || '').toLowerCase();
    const state = String(canvas.dataset.previewAssetState || '').toLowerCase();
    return ready === 'true' && state !== 'loading';
  }, null, { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function stabilizeRangeScreen(page) {
  await page.evaluate(() => {
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    const def = sm && typeof sm.getActiveScreenDef === 'function' ? sm.getActiveScreenDef() : null;
    if (!def || def.id !== 'range') return false;
    if (def._rafId) {
      cancelAnimationFrame(def._rafId);
      def._rafId = 0;
    }
    if (!def._sim || typeof def._stepSimulation !== 'function' || typeof def._render !== 'function') return false;
    const STEP_S = 1 / 120;
    const STEPS = Math.round(1.5 / STEP_S);
    def._accumS = 0;
    def._lastTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (let i = 0; i < STEPS; i += 1) def._stepSimulation(STEP_S);
    def._render();
    return true;
  });
  await page.waitForTimeout(50);
}

async function stabilizeChartScreen(page) {
  await page.evaluate(() => {
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    const def = sm && typeof sm.getActiveScreenDef === 'function' ? sm.getActiveScreenDef() : null;
    if (!def || def.id !== 'galaxyMap') return false;
    if (def._animFrame != null) {
      cancelAnimationFrame(def._animFrame);
      def._animFrame = null;
    }
    def._scanRings = [];
    def._iris = null;
    def._scanSweepUntil = 0;
    def._localLiveContacts = 0;
    def._scanPhase = 0;
    def._targetZoom = def._zoom;
    def._lastTime = typeof def._nowMs === 'function'
      ? def._nowMs()
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    def._animT = 0;
    if (typeof def._draw === 'function') def._draw();
    if (typeof def._updateInspector === 'function') def._updateInspector();
    return true;
  });
  await page.waitForTimeout(50);
}

async function readUiStatus(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const sm = sf && sf.ctx && sf.ctx.screenManager;
    const mode = state && state.mode ? state.mode : null;
    const screenOpen = !!(sm && typeof sm.isOpen === 'function' && sm.isOpen());
    const top = sm && typeof sm.top === 'function' ? sm.top() : null;
    return { mode, screenOpen, top };
  });
}

export async function waitForAnyVisible(page, selectors, timeout, description) {
  await page.waitForFunction((items) => {
    function visible(node) {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.hidden
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.01
        && rect.width > 4
        && rect.height > 4;
    }
    return items.some((selector) => visible(document.querySelector(selector)));
  }, selectors, { timeout }).catch((error) => {
    throw new Error(`${description} timeout (${timeout}ms): ${error.message}`);
  });
}

async function waitForSimTicks(page, deltaTicks, timeoutMs, fallbackMs) {
  const startTick = await page.evaluate(() => {
    const state = window.SF && window.SF.state;
    return state && Number.isFinite(state.tick) ? state.tick : null;
  });
  if (!Number.isFinite(startTick)) {
    await page.waitForTimeout(fallbackMs);
    return;
  }
  await page.waitForFunction(({ start, delta }) => {
    const state = window.SF && window.SF.state;
    return !!(state && Number.isFinite(state.tick) && state.tick >= start + delta);
  }, { start: startTick, delta: Math.max(1, deltaTicks) }, { timeout: timeoutMs })
    .catch(async () => {
      await page.waitForTimeout(fallbackMs);
    });
}

async function clickMainMenuNewGame(page) {
  for (let i = 0; i < 360; i += 1) {
    const clicked = await page.evaluate(() => {
      const button = document.querySelector('[data-screen="mainMenu"] .sf-col > button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    });
    if (clicked) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function clickNewGameLaunch(page) {
  for (let i = 0; i < 240; i += 1) {
    const clicked = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[data-screen="newGame"] .sf-ng-footer button')];
      const launch = buttons[buttons.length - 1];
      if (!launch || launch.disabled) return false;
      launch.click();
      return true;
    });
    if (clicked) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

function printCaptureTable({
  rows,
  outputDir,
  updateReferences,
  bootCount,
  totalBytes,
}) {
  console.log('\nUI matrix capture table');
  console.log('surface      mode             viewport      bytes      file');
  for (const row of rows) {
    const plan = row.plan || {};
    const surface = String(plan.surface || '').padEnd(12);
    const mode = String(plan.mode || '').padEnd(16);
    const viewport = String(plan.viewport || '').padEnd(13);
    const bytes = String(row.bytes).padStart(9);
    console.log(`${surface} ${mode} ${viewport} ${bytes}  ${row.name}`);
  }
  console.log(`\nframes: ${rows.length}   boots: ${bootCount}   total bytes: ${totalBytes}`);
  console.log(`devshots: ${outputDir}`);
  if (updateReferences) console.log(`references updated: ${UI_FRAME_REFERENCE_DIR}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 160; port += 1) {
    const free = await new Promise((resolve) => {
      const socket = createNetServer();
      socket.once('error', () => resolve(false));
      socket.once('listening', () => socket.close(() => resolve(true)));
      socket.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free probe port');
}

export async function startFreshServer() {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const seedPort = 16000 + Math.floor(Math.random() * 32000);
    const port = await findFreePort(seedPort);
    const baseUrl = `http://127.0.0.1:${port}/`;
    const child = spawn(process.execPath, ['server.js', String(port)], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });

    let alive = true;
    child.once('exit', () => { alive = false; });

    for (let i = 0; i < 120; i += 1) {
      if (!alive || child.exitCode != null) break;
      try {
        const response = await fetch(baseUrl);
        if (response.ok) {
          return {
            baseUrl,
            kill: () => {
              try { child.kill(); } catch (_) {}
            },
          };
        }
      } catch (_) {
        // keep probing
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    try { child.kill(); } catch (_) {}
  }
  throw new Error('server did not become reachable after 6 attempts');
}

function parseArgs(argv) {
  return {
    updateReferences: argv.includes('--update'),
    headed: argv.includes('--headed'),
    quiet: argv.includes('--quiet'),
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const result = await captureUiMatrix({
    outputDir: DEFAULT_OUTPUT_DIR,
    updateReferences: args.updateReferences,
    headed: args.headed,
    printTable: true,
    quiet: args.quiet,
  });
  console.log(`capture:ui-matrix complete — ${result.frames} frames`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
