#!/usr/bin/env node
/**
 * CL-UI-04 browser gate — default public route proof for career ladder UI.
 *
 * One Game Path only (canonical public root, no query flags / alternate game).
 * Unlock via real framework APIs (noteSkillProof + offer). Accept proven through
 * the live Mission Log chip → bus → leaf. Map CTA, keyboard focus, and branch choices
 * stay on that mounted surface.
 * Screenshots under ignored .devshots/career-ladder-ui/.
 *
 * Evidence truth (fail-closed):
 *  - never fall back to dock:docked bus for docking
 *  - never pushScreen('station') / inject dock or screen state
 *  - never label a Market image as station rail
 *  - must AWAIT state.render.authoredPartLibraryReady promise before Launch; fail if false
 *  - public New Game / Launch, waypoint+autopilot, physical dock prompt + E
 *  - public station Hub navigation; public Mission Log ladder UI accept/decline
 *  - fail fast on game:startFailed
 *  - primaryClaims: public flight, physical dock, Mission Log offer+UI accept,
 *    mission-log chip, career map source (data-map-source careerLadder:*)
 *  - applySignal complete/fail only as supporting_framework_setup (not primaryClaims)
 *  - no owner mutation recoverReadyAtS / recover({force}) / accept({ignorePrereqs})
 *  - remove/ignore stale screenshots before report; hash current artifacts only
 *  - if no public Hub selector, fail with exact evidence (never inject)
 *
 * Asset publish lock (release.__lock / release.__building) → pending retry,
 * never soft-green.
 *
 * Does not edit package/production. Does not inspect SAFE-001.
 *
 * Run: node scripts/check-career-ladder-ui-browser.mjs
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { closeOwnedResources, createCanonicalUrlTracker } from './lib/alphaLiveBaselineContracts.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'career-ladder-ui');
const REPORT_PATH = path.join(OUT_DIR, 'browser-route.json');
const VIEWPORT = { width: 1440, height: 900 };
const FLIGHT_TIMEOUT_MS = 150_000;
const DOCK_TIMEOUT_MS = 120_000;
const ASSET_LOCK = path.join(ROOT, 'assets', 'ships', 'release.__lock');
const ASSET_BUILDING = path.join(ROOT, 'assets', 'ships', 'release.__building');

const SHOTS = Object.freeze({
  locked: '01-mission-log-locked.png',
  offered: '02-mission-log-offered.png',
  active: '03-mission-log-active.png',
  recovering: '04-mission-log-recovering.png',
  hunterChoice: '05-hunter-choice.png',
  haulerChoice: '05b-hauler-lane-tax-choice.png',
  missionLog: '06-mission-log-chip.png',
  mapHandoff: '07-map-handoff.png',
});

const CHIP_SEL = '[data-testid="mission-log-career-chip"]';
const HAULER_CHIP_SEL = CHIP_SEL + '[data-career-id="hauler"]';
const MAP_BTN_SEL = HAULER_CHIP_SEL + ' [data-career-act="openMap"]';

const PRIMARY_CLAIM_NAMES = Object.freeze([
  'public_flight',
  'physical_dock',
  'mission_log_offer_ui_accept',
  'mission_log_chip',
  'career_map_source',
]);

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findSystemBrowser() {
  return BROWSER_CANDIDATES.find(existsSync) || null;
}

function log(line) {
  console.log('[career-ladder-ui-browser] ' + line);
}

function assetPublishLockBusy() {
  const lock = existsSync(ASSET_LOCK);
  const building = existsSync(ASSET_BUILDING);
  return { busy: lock || building, lock, building };
}

function clearStaleScreenshots() {
  mkdirSync(OUT_DIR, { recursive: true });
  let removed = 0;
  // Wipe prior shot artifacts so hashes only cover this run.
  for (const name of Object.values(SHOTS)) {
    const full = path.join(OUT_DIR, name);
    if (existsSync(full)) {
      try { unlinkSync(full); removed += 1; } catch (_) { /* ignore */ }
    }
  }
  if (existsSync(OUT_DIR)) {
    for (const name of readdirSync(OUT_DIR)) {
      if (name === 'browser-route.json') continue;
      if (Object.values(SHOTS).includes(name)) continue;
      try {
        rmSync(path.join(OUT_DIR, name), { recursive: true, force: true });
        removed += 1;
      } catch (_) { /* ignore */ }
    }
  }
  return removed;
}

function hashFile(absPath) {
  const buf = readFileSync(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

function hashArtifacts() {
  const out = {};
  for (const name of Object.values(SHOTS)) {
    const full = path.join(OUT_DIR, name);
    if (existsSync(full)) out[name] = hashFile(full);
  }
  if (existsSync(REPORT_PATH)) out['browser-route.json'] = hashFile(REPORT_PATH);
  return out;
}

async function shot(page, name) {
  const dest = path.join(OUT_DIR, name);
  await page.screenshot({ path: dest, fullPage: true });
  assert.ok(existsSync(dest), 'screenshot missing: ' + name);
  log('shot ' + name + ' sha256=' + hashFile(dest).slice(0, 12));
  return dest;
}

/**
 * Scroll the live Mission Log career chip into view, assert viewport intersection, element-screenshot.
 * Used for offered/active/recovering/choice chip states (not the full map page shot).
 */
async function shotSubject(page, selector, name) {
  const dest = path.join(OUT_DIR, name);
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'attached', timeout: 15_000 });
  await loc.evaluate((el) => {
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) {
      try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (__) { /* ignore */ }
    }
  });
  await page.waitForTimeout(60);
  const probe = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const intersects = r.width > 2
      && r.height > 2
      && r.bottom > 0
      && r.right > 0
      && r.top < vh
      && r.left < vw;
    return {
      intersects,
      w: r.width,
      h: r.height,
      top: r.top,
      left: r.left,
      vw,
      vh,
      hidden: !!el.hidden,
    };
  });
  assert.equal(
    probe.intersects,
    true,
    'shotSubject subject not intersecting viewport: ' + selector + ' ' + JSON.stringify(probe),
  );
  await loc.screenshot({ path: dest });
  assert.ok(existsSync(dest), 'screenshot missing: ' + name);
  log('shotSubject ' + name + ' sel=' + selector + ' sha256=' + hashFile(dest).slice(0, 12));
  return dest;
}

/** Await the real state.render.authoredPartLibraryReady promise; fail closed if not ready. */
async function awaitAuthoredPartLibraryReady(page, timeoutMs = 120_000) {
  const result = await Promise.race([
    page.evaluate(async () => {
      const render = window.SF && window.SF.state && window.SF.state.render;
      if (!render) return { ready: false, reason: 'render_absent' };
      const ready = render.authoredPartLibraryReady;
      if (ready == null) return { ready: false, reason: 'promise_absent' };
      if (typeof ready.then !== 'function') {
        return {
          ready: ready === true,
          reason: ready === true ? 'boolean_true' : 'not_thenable',
        };
      }
      try {
        const value = await ready;
        // renderer preload catch resolves null on soft-fail — treat as not ready.
        if (value == null) return { ready: false, reason: 'resolved_null' };
        return { ready: true, reason: 'promise_resolved' };
      } catch (err) {
        return {
          ready: false,
          reason: 'rejected',
          error: (err && err.message) || String(err),
        };
      }
    }),
    new Promise((resolve) => {
      setTimeout(() => resolve({ ready: false, reason: 'timeout', timeoutMs }), timeoutMs);
    }),
  ]);
  if (!result || result.ready !== true) {
    throw new Error(
      'FAIL_CLOSED authoredPartLibraryReady promise not ready before public Launch: '
      + JSON.stringify(result),
    );
  }
  return result;
}

async function installStartFailedWatcher(page) {
  await page.evaluate(() => {
    window.__SF_START_FAILED__ = null;
    const bus = window.SF && window.SF.bus;
    if (bus && typeof bus.on === 'function') {
      bus.on('game:startFailed', (payload) => {
        window.__SF_START_FAILED__ = payload || { saw: true };
      });
    }
  });
}

async function assertNoStartFailed(page, phase) {
  const failed = await page.evaluate(() => window.__SF_START_FAILED__);
  if (failed) {
    throw new Error('FAIL_CLOSED game:startFailed during ' + phase + ': ' + JSON.stringify(failed));
  }
}

/**
 * Read the live target and control owned by the visible Galaxy Map inspector.
 *
 * The map keeps one persistent action node and resolves its payload only when the player clicks
 * it. Keeping this probe on the same root as the action prevents a cached/hidden screen wrapper
 * from being mistaken for the active map, and gives a useful failure record when a search result
 * did not actually become the intended station selection.
 */
async function readPublicHeliosMapSelection(page) {
  return page.evaluate(() => {
    const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
    const mgr = ui && (ui.screenManager || ui.manager);
    const screen = mgr && typeof mgr.getActiveScreenDef === 'function'
      ? mgr.getActiveScreenDef()
      : null;
    const target = screen && screen._selectedTarget;
    const root = document.querySelector('#sf-galaxymap');
    const button = root && root.querySelector('#gm-set-course-btn');
    const buttonRect = button && button.getBoundingClientRect();
    const rootRect = root && root.getBoundingClientRect();
    const selected = target && {
      id: target.id ?? null,
      kind: target.kind ?? null,
      name: target.name ?? target.courseLabel ?? null,
      stationId: target.stationId ?? null,
      entityId: target.entityId ?? target.targetEntityId ?? null,
      x: Number.isFinite(target.x) ? target.x : null,
      z: Number.isFinite(target.z) ? target.z : null,
    };
    return {
      top: mgr && typeof mgr.top === 'function' ? mgr.top() : null,
      mapRoot: !!root,
      mapRootVisible: !!(root && rootRect && rootRect.width > 10 && rootRect.height > 10),
      selected: selected || null,
      inspectorText: root ? ((root.querySelector('.gm-inspector-details')?.innerText || '').trim()) : '',
      button: button ? {
        hidden: !!button.hidden,
        disabled: !!button.disabled,
        text: (button.textContent || '').trim(),
        width: buttonRect ? buttonRect.width : 0,
        height: buttonRect ? buttonRect.height : 0,
      } : null,
    };
  });
}

/**
 * Activate the map's real Set Waypoint control and wait for the exact nav state it owns.
 *
 * A headed pointer can land between display frames while the map is repainting. Retry the public
 * pointer action for a short bounded window, sampling the resulting state after each click. This
 * never writes nav state or invokes the world handler directly; it only repeats the same visible
 * action a pilot can take. The final snapshot makes a selector/action mismatch actionable.
 */
async function clickPublicHeliosWaypoint(page, locator, expectedTarget) {
  const attempts = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const visible = await locator.isVisible().catch(() => false);
    const enabled = await locator.isEnabled().catch(() => false);
    if (!visible || !enabled) {
      attempts.push({ attempt, visible, enabled, reason: 'button_not_actionable' });
      break;
    }

    // The wide map inspector is independently scrollable. Bring the scoped action into its
    // scrollport, then let locator.click perform the public actionability and hit-test checks.
    let scrollError = null;
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 3_000 });
    } catch (error) {
      scrollError = { name: error && error.name, message: error && error.message };
    }
    const box = await locator.boundingBox().catch(() => null);
    const pointerTarget = box && box.width > 2 && box.height > 2
      ? await page.evaluate(({ px, py }) => {
        const hit = document.elementFromPoint(px, py);
        const button = hit && hit.closest ? hit.closest('#sf-galaxymap #gm-set-course-btn') : null;
        return {
          tag: hit && hit.tagName || null,
          id: hit && hit.id || null,
          className: hit && typeof hit.className === 'string' ? hit.className : null,
          isButton: !!button,
        };
      }, {
        px: Math.round(box.x + box.width / 2),
        py: Math.round(box.y + box.height / 2),
      }).catch(() => null)
      : null;
    let clickError = null;
    let armed = false;
    try {
      // Locator click is the only action: it auto-scrolls and hit-tests the real nested control.
      await locator.click({ timeout: 3_000 });
      armed = await page.waitForFunction((expected) => {
        const nav = window.SF?.state?.nav;
        const ap = nav?.autopilot;
        const wp = nav?.waypoint;
        if (!ap || ap.active !== true || !wp || !wp.pos) return false;
        const expectedId = expected && expected.entityId != null ? String(expected.entityId) : null;
        const actualId = ap.targetEntityId != null ? String(ap.targetEntityId) : null;
        const targetMatches = expectedId == null || actualId === expectedId;
        const apLabel = String(ap.label || '');
        const wpLabel = String(wp.label || wp.reason || '');
        return targetMatches
          && /Helios Station/i.test(apLabel)
          && /Helios Station/i.test(wpLabel)
          && Number.isFinite(Number(wp.pos.x))
          && Number.isFinite(Number(wp.pos.z));
      }, expectedTarget || {}, { timeout: 750 }).then(() => true, () => false);
    } catch (error) {
      clickError = { name: error && error.name, message: error && error.message };
    }

    const nav = await page.evaluate(() => {
      const stateNav = window.SF?.state?.nav;
      const autopilot = stateNav?.autopilot;
      const waypoint = stateNav?.waypoint;
      return {
        autopilot: autopilot ? {
          active: autopilot.active === true,
          status: autopilot.status || null,
          targetEntityId: autopilot.targetEntityId ?? null,
          label: autopilot.label || null,
        } : null,
        waypoint: waypoint ? {
          kind: waypoint.kind || null,
          targetEntityId: waypoint.targetEntityId ?? null,
          label: waypoint.label || null,
          pos: waypoint.pos && Number.isFinite(Number(waypoint.pos.x)) && Number.isFinite(Number(waypoint.pos.z))
            ? { x: waypoint.pos.x, z: waypoint.pos.z }
            : null,
        } : null,
      };
    }).catch(() => null);
    attempts.push({ attempt, box, pointerTarget, nav, armed, clickError, scrollError });
    if (armed) return;

    // A second click is allowed only when the same visible enabled control remains actionable
    // and the first click produced no qualifying navigation state. Never mask a close/detach.
    const remainsActionable = await locator.isVisible().catch(() => false)
      && await locator.isEnabled().catch(() => false)
      && !!(await locator.boundingBox().catch(() => null));
    if (!remainsActionable) break;
    if (attempt === 0) await page.waitForTimeout(50);
  }
  const final = await readPublicHeliosMapSelection(page).catch(() => null);
  throw new Error(
    'FAIL_CLOSED visible Helios Set Waypoint did not arm exact autopilot; '
    + JSON.stringify({ expectedTarget, attempts, final }),
  );
}

/**
 * Public boot → flight → Helios waypoint/autopilot → physical dock + E → public station hub.
 * Never emits dock:docked. Never pushScreen('station'). Never injects ui.docked.
 */
async function bootPublicRouteAndDock(page, evidence) {
  evidence.syntheticDock = false;
  evidence.syntheticScreen = false;
  evidence.publicRoute = true;
  evidence.noSyntheticDockOrScreen = true;

  await page.waitForFunction(
    () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry),
    null,
    { timeout: 30_000 },
  );
  await installStartFailedWatcher(page);

  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  // Await the actual authoredPartLibraryReady promise before public Launch (do not inject).
  const libraryReady = await awaitAuthoredPartLibraryReady(page, 120_000);
  evidence.steps.push({
    name: 'authoredPartLibraryReady_await',
    ready: true,
    detail: libraryReady,
  });
  log('authoredPartLibraryReady promise ready reason=' + libraryReady.reason);
  await assertNoStartFailed(page, 'pre_launch');

  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(() => {
    if (window.__SF_START_FAILED__) return true;
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: FLIGHT_TIMEOUT_MS });
  await assertNoStartFailed(page, 'launch');
  log('flight ready on default public route');
  evidence.steps.push({ name: 'public_flight', pass: true, url: page.url() });
  assert.equal(new URL(page.url()).search, '', 'flight must stay on canonical root');

  await page.keyboard.press('KeyN');
  await page.waitForFunction(() => {
    const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
    const mgr = ui && (ui.screenManager || ui.manager);
    const top = mgr && typeof mgr.top === 'function' ? mgr.top() : null;
    return top === 'galaxyMap'
      || !!document.querySelector('.gm-search-input')
      || !!document.querySelector('.gm-root')
      || !!document.querySelector('[data-screen="galaxyMap"]');
  }, null, { timeout: 20_000 });
  const mapRoot = page.locator('#sf-galaxymap');
  await mapRoot.waitFor({ state: 'visible', timeout: 20_000 });

  await page.keyboard.press('/');
  await page.waitForTimeout(100);
  const search = page.locator('.gm-search-input');
  if (await search.count()) {
    await search.fill('Helios Station');
  } else {
    await page.keyboard.type('Helios Station');
  }
  const hit = page.locator('.gm-search-item-name', { hasText: 'Helios Station' }).first();
  await hit.waitFor({ state: 'visible', timeout: 12_000 });
  await hit.click().catch(async () => {
    await search.focus().catch(() => {});
    await page.keyboard.press('Enter');
  });

  // Search rows are presentation only; the map's active screen owns the selected target. Prove
  // that the row selected the live Helios station before touching the persistent action button.
  await page.waitForFunction(() => {
    const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
    const mgr = ui && (ui.screenManager || ui.manager);
    const screen = mgr && typeof mgr.getActiveScreenDef === 'function'
      ? mgr.getActiveScreenDef()
      : null;
    const target = screen && screen._selectedTarget;
    return !!(target
      && target.kind === 'station'
      && /Helios Station/i.test(String(target.name || target.courseLabel || ''))
      && (target.stationId === 'station_helios' || target.id === 'station_helios'));
  }, null, { timeout: 12_000 });
  const mapSelection = await readPublicHeliosMapSelection(page);
  assert.ok(
    mapSelection.selected
      && mapSelection.selected.kind === 'station'
      && /Helios Station/i.test(String(mapSelection.selected.name || '')),
    'search must select the live Helios Station target: ' + JSON.stringify(mapSelection),
  );
  assert.equal(
    mapSelection.selected.stationId || mapSelection.selected.id,
    'station_helios',
    'search selection must carry canonical station_helios identity: ' + JSON.stringify(mapSelection),
  );
  evidence.steps.push({ name: 'helios_map_selection', ...mapSelection });

  const setWaypointButton = mapRoot.locator('#gm-set-course-btn');
  await setWaypointButton.waitFor({ state: 'visible', timeout: 12_000 });
  await page.waitForFunction((sel) => {
    const btn = document.querySelector(sel);
    return !!(btn && !btn.hidden && !btn.disabled);
  }, '#sf-galaxymap #gm-set-course-btn', { timeout: 12_000 });

  // Public pointer click to arm waypoint + autopilot (no synthetic nav writes).
  await clickPublicHeliosWaypoint(page, setWaypointButton, mapSelection.selected);
  log('helios waypoint/autopilot armed via public Set Waypoint');
  const armedNavigation = await page.evaluate(() => {
    const nav = window.SF?.state?.nav;
    return {
      autopilot: nav?.autopilot ? {
        active: nav.autopilot.active === true,
        status: nav.autopilot.status || null,
        targetEntityId: nav.autopilot.targetEntityId ?? null,
        label: nav.autopilot.label || null,
      } : null,
      waypoint: nav?.waypoint ? {
        kind: nav.waypoint.kind || null,
        targetEntityId: nav.waypoint.targetEntityId ?? null,
        label: nav.waypoint.label || null,
        pos: nav.waypoint.pos && { x: nav.waypoint.pos.x, z: nav.waypoint.pos.z },
      } : null,
    };
  });
  evidence.steps.push({ name: 'public_waypoint_autopilot', pass: true, navigation: armedNavigation });

  // A local Set Waypoint commits the fix and closes the chart. Escape here would open Pause
  // and cancel the very approach this driver is meant to observe.
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 10_000 });

  const dockPrompt = page.locator('.sf-alert--dock');
  const dockDeadline = Date.now() + DOCK_TIMEOUT_MS;
  let lastApproach = null;
  while (Date.now() < dockDeadline) {
    lastApproach = await page.evaluate(() => {
      const st = window.SF && window.SF.state;
      const player = st && st.entities && st.entities.get(st.playerId);
      const ap = st && st.nav && st.nav.autopilot;
      return {
        mode: st && st.mode,
        docked: !!(st && st.ui && st.ui.docked),
        alive: !!(player && player.alive !== false),
        pos: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
        apActive: !!(ap && ap.active),
        apLabel: (ap && ap.label) || null,
      };
    });
    if (lastApproach && lastApproach.alive === false) {
      throw new Error('FAIL_CLOSED player died during public autopilot approach: ' + JSON.stringify(lastApproach));
    }
    if (await dockPrompt.isVisible().catch(() => false)) break;
    await page.waitForTimeout(300);
  }

  const promptVisible = await dockPrompt.isVisible().catch(() => false);
  if (!promptVisible) {
    throw new Error(
      'FAIL_CLOSED public autopilot did not reach physical dock prompt; '
      + 'no dock:docked bus fallback allowed. last=' + JSON.stringify(lastApproach),
    );
  }
  const dockPromptText = (await dockPrompt.innerText().catch(() => '')).trim();
  log('physical dock prompt visible text=' + JSON.stringify(dockPromptText));
  await page.keyboard.press('KeyE');
  log('docked via public E binding');
  evidence.steps.push({ name: 'physical_dock', mode: 'public_E', promptText: dockPromptText });

  await page.waitForFunction(
    () => window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.docked === true,
    null,
    { timeout: 20_000 },
  );
  await assertNoStartFailed(page, 'dock');

  // Public station hub only — never pushScreen('station'). The station adapter mounts `.sx-app`
  // inside the ScreenManager's `[data-screen="station"]` root.
  const hubSelectors = [
    '[data-screen="station"]',
    '.sx-app',
    '.sx-workspace',
  ];
  const hubDeadline = Date.now() + 25_000;
  let hubEvidence = null;
  while (Date.now() < hubDeadline) {
    hubEvidence = await page.evaluate((sels) => {
      const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const mgr = ui && (ui.screenManager || ui.manager);
      const top = mgr && typeof mgr.top === 'function' ? mgr.top() : null;
      const found = {};
      for (const s of sels) {
        const el = document.querySelector(s);
        if (!el) { found[s] = null; continue; }
        const r = el.getBoundingClientRect();
        found[s] = { present: true, w: r.width, h: r.height, hidden: !!el.hidden };
      }
      return {
        top,
        docked: !!(window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.docked),
        found,
        hasPublicHub: !!(
          document.querySelector('[data-screen="station"]')
          || document.querySelector('.sx-app, .sx-workspace')
          || (top === 'station' && document.querySelector('.sx-screen'))
        ),
      };
    }, hubSelectors);
    if (hubEvidence && hubEvidence.hasPublicHub) break;
    await page.waitForTimeout(200);
  }

  if (!hubEvidence || !hubEvidence.hasPublicHub) {
    throw new Error(
      'FAIL_CLOSED no public station Hub selector after public dock; '
      + 'refusing to inject pushScreen(station) or dock state. evidence='
      + JSON.stringify(hubEvidence),
    );
  }
  log('station hub ready via public dock path');
  evidence.steps.push({
    name: 'public_route_docked',
    pass: true,
    dockMode: 'public_E',
    syntheticDock: false,
    syntheticScreen: false,
    hub: hubEvidence,
  });
}

async function unlockAndOfferLadders(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    if (!sf || !sf.registry || !sf.state || !sf.bus) {
      return { ok: false, reason: 'runtime_seam_absent' };
    }
    const ladders = sf.registry.get('careerLadders');
    if (!ladders || ladders.name !== 'careerLadders') {
      return { ok: false, reason: 'careerLadders_absent' };
    }
    const ids = ['hauler', 'hunter', 'prospector'];
    const registered = ids.filter((id) => !!ladders.getDefinition(id));
    if (registered.length !== 3) {
      return {
        ok: false,
        reason: 'defs_not_registered',
        registered,
        detail: 'liveCareerLadderBranches must register hauler/hunter/prospector on default route',
      };
    }

    ladders.noteSkillProof('cargo_delivery_complete', 1);
    ladders.noteSkillProof('bounty_hunt_complete', 1);
    ladders.noteSkillProof('mining_yield_u', 3);

    const offers = {};
    for (const id of ids) {
      const r = ladders.offer(id);
      offers[id] = { ok: !!(r && r.ok), reason: (r && r.reason) || null };
      if (!r || !r.ok) {
        const leaf = sf.state.careers && sf.state.careers.ladders && sf.state.careers.ladders[id];
        if (leaf && (leaf.status === 'offered' || leaf.status === 'active')) {
          offers[id] = { ok: true, reason: 'already_' + leaf.status };
        } else if (leaf && leaf.status === 'latent') {
          const r2 = ladders.offer(id, { ignorePrereqs: false });
          offers[id] = { ok: !!(r2 && r2.ok), reason: (r2 && r2.reason) || null };
        }
      }
    }

    // Refresh ladder UI via career bus events only — never re-emit dock:docked.
    if (typeof sf.bus.emit === 'function') {
      sf.bus.emit('career:ladder:offered', { nonBinding: true });
      sf.bus.emit('career:ladder:progress', { nonBinding: true, simTime: sf.state.simTime || 0 });
    }

    const view = ladders.getOfferView();
    return {
      ok: true,
      registered,
      offers,
      offerView: ((view && view.offers) || []).map((o) => ({
        careerId: o.careerId,
        status: o.status,
        canAccept: o.canAccept,
        nonBinding: o.nonBinding,
      })),
      mode: sf.state.mode,
      docked: !!(sf.state.ui && sf.state.ui.docked),
    };
  });
}

async function waitForMissionLogChip(page, { timeout = 20_000, careerId = null } = {}) {
  const selector = careerId
    ? CHIP_SEL + '[data-career-id="' + careerId + '"]'
    : CHIP_SEL;
  const chip = page.locator(selector).first();
  await chip.waitFor({ state: 'attached', timeout });
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.hidden) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 4
      && rect.height > 4;
  }, selector, { timeout });
  return chip;
}

async function openMissionLog(page, { timeout = 15_000, chip = false } = {}) {
  // J is the shipped Mission Log binding for the docked station and flight routes.
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => {
    const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
    const mgr = ui && (ui.screenManager || ui.manager);
    return !!(mgr && typeof mgr.top === 'function' && mgr.top() === 'missionLog');
  }, null, { timeout });
  if (chip) return waitForMissionLogChip(page, { timeout });
  return page.getByTestId('mission-log-career-chip').first();
}

/** Assert the live chip is a Mission Log career surface — not a station/Market panel mislabel. */
async function assertLiveMissionLogChip(page) {
  const probe = await page.evaluate(() => {
    const chip = document.querySelector('[data-testid="mission-log-career-chip"]');
    if (!chip) return { ok: false, reason: 'chip_missing' };
    const missionLog = chip.closest('[data-screen="missionLog"]');
    const hasCareerAction = !!chip.querySelector('[data-career-act][data-career-id]');
    const cls = chip.className || '';
    return {
      ok: !!missionLog && hasCareerAction && cls.includes('sf-mlog-career'),
      missionLogPresent: !!missionLog,
      hasCareerAction,
      className: cls,
      testid: chip.getAttribute('data-testid'),
    };
  });
  assert.equal(probe.ok, true, 'career chip must be mounted in Mission Log with live actions: ' + JSON.stringify(probe));
  return probe;
}

async function waitForPublicStationHub(page, { timeout = 15_000 } = {}) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(() => {
      const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const mgr = ui && (ui.screenManager || ui.manager);
      const top = mgr && typeof mgr.top === 'function' ? mgr.top() : null;
      const hub = document.querySelector('[data-screen="station"], .sx-app, .sx-workspace');
      const app = document.querySelector('.sx-app, .sx-workspace');
      return {
        top,
        docked: !!(window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.docked),
        hubPresent: !!hub,
        stationAppPresent: !!app,
      };
    });
    if (last && last.docked && (last.hubPresent || last.stationAppPresent || last.top === 'station')) {
      return last;
    }
    await page.waitForTimeout(150);
  }
  throw new Error(
    'FAIL_CLOSED public station hub not restored (no pushScreen inject). last=' + JSON.stringify(last),
  );
}

async function domClick(page, selector) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) { /* ignore */ }
    el.click();
    return true;
  }, selector);
  assert.equal(ok, true, 'domClick missing selector: ' + selector);
  await page.waitForTimeout(80);
}

async function domClickTestId(page, testId) {
  await domClick(page, '[data-testid="' + testId + '"]');
}

async function leafStatus(page, careerId) {
  return page.evaluate((id) => {
    const leaf = window.SF && window.SF.state && window.SF.state.careers
      && window.SF.state.careers.ladders && window.SF.state.careers.ladders[id];
    return leaf
      ? { status: leaf.status, stepId: leaf.stepId, stepIndex: leaf.stepIndex }
      : null;
  }, careerId);
}

async function forceRefreshLadderUi(page) {
  await page.evaluate(() => {
    const sf = window.SF;
    if (!sf || !sf.bus) return;
    sf.bus.emit('career:ladder:progress', {
      nonBinding: true,
      simTime: (sf.state && sf.state.simTime) || 0,
    });
    sf.bus.emit('mission:updated', {});
  });
  await page.waitForTimeout(150);
}

/**
 * Supporting framework setup only: advance an already-public-UI-accepted active leaf
 * via applySignal({kind:'complete'}). Never accept({ignorePrereqs}), never mutate
 * recoverReadyAtS, never recover({force:true}).
 */
async function advanceToStep(page, careerId, targetStepId, maxCompletes = 6) {
  return page.evaluate(({ careerId: id, targetStepId: target, maxCompletes: max }) => {
    const ladders = window.SF && window.SF.registry && window.SF.registry.get('careerLadders');
    if (!ladders) return { ok: false, reason: 'no_ladders' };
    let leaf = window.SF.state.careers && window.SF.state.careers.ladders && window.SF.state.careers.ladders[id];
    if (!leaf || leaf.status !== 'active') {
      return {
        ok: false,
        reason: 'leaf_not_active_public_ui_must_accept',
        status: leaf ? leaf.status : null,
        evidenceClass: 'supporting_framework_setup',
      };
    }

    let guard = 0;
    while (guard < max) {
      leaf = window.SF.state.careers.ladders[id];
      if (leaf && leaf.stepId === target) {
        return {
          ok: true,
          stepId: leaf.stepId,
          stepIndex: leaf.stepIndex,
          completes: guard,
          evidenceClass: 'supporting_framework_setup',
        };
      }
      const r = ladders.applySignal(id, { kind: 'complete' });
      if (!r || !r.ok) {
        return {
          ok: false,
          reason: 'complete_failed',
          detail: r && r.reason,
          stepId: leaf && leaf.stepId,
          completes: guard,
          evidenceClass: 'supporting_framework_setup',
        };
      }
      guard += 1;
    }
    leaf = window.SF.state.careers.ladders[id];
    return {
      ok: !!(leaf && leaf.stepId === target),
      stepId: leaf && leaf.stepId,
      completes: guard,
      reason: leaf && leaf.stepId === target ? null : 'step_not_reached',
      evidenceClass: 'supporting_framework_setup',
    };
  }, { careerId, targetStepId, maxCompletes });
}

/** Public Mission Log UI accept for a career branch (no ignorePrereqs owner API). */
async function publicUiAcceptCareer(page, careerId) {
  const acceptSel = CHIP_SEL + '[data-career-id="' + careerId + '"]'
    + ' [data-career-act="ladderAccept"]';
  const accept = page.locator(acceptSel).first();
  await accept.waitFor({ state: 'visible', timeout: 10_000 });
  await accept.click();
  await page.waitForFunction((id) => {
    const leaf = window.SF && window.SF.state && window.SF.state.careers
      && window.SF.state.careers.ladders && window.SF.state.careers.ladders[id];
    return !!(leaf && leaf.status === 'active');
  }, careerId, { timeout: 15_000 });
  return leafStatus(page, careerId);
}

async function assertNoBlockingDialog(page, phase, { allowActiveMissionLog = false } = {}) {
  const probe = await page.evaluate((allowMissionLog) => {
    const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
    const mgr = ui && (ui.screenManager || ui.manager);
    const activeTop = mgr && typeof mgr.top === 'function' ? mgr.top() : null;
    const nodes = Array.from(document.querySelectorAll(
      '[role="alertdialog"], [role="dialog"], [aria-modal="true"], .sf-confirm, .sf-modal--confirm',
    ));
    const visible = nodes.filter((el) => {
      if (!el || el.hidden) return false;
      // Mission Log is the intended mounted screen after the map route and uses role=dialog
      // for its accessible surface. Keep real alert/confirm overlays fail-closed.
      if (allowMissionLog && activeTop === 'missionLog'
        && el.matches('.sf-mlog')
        && !el.matches('.sf-confirm, .sf-modal--confirm')) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).map((el) => ({
      role: el.getAttribute('role'),
      className: el.className || '',
      text: ((el.textContent || '').trim().slice(0, 120)),
    }));
    return { blocking: visible.length > 0, visible, activeTop };
  }, allowActiveMissionLog);
  assert.equal(
    probe.blocking,
    false,
    'no confirm/alertdialog allowed before ' + phase + ': ' + JSON.stringify(probe),
  );
  return probe;
}

async function main() {
  const lockInfo = assetPublishLockBusy();
  if (lockInfo.busy) {
    mkdirSync(OUT_DIR, { recursive: true });
    const pending = {
      schema: 'spaceface.careerLadderUiBrowser.v1',
      generatedAt: new Date().toISOString(),
      route: 'browser_public_default',
      pass: false,
      softGreen: false,
      pendingRetry: true,
      reason: 'asset_publish_lock_busy',
      lock: lockInfo,
      noSyntheticDockOrScreen: true,
      note: 'Browser route skipped while assets/ships/release.__lock or release.__building is present. Never fake green.',
    };
    writeFileSync(REPORT_PATH, JSON.stringify(pending, null, 2) + '\n');
    console.log('[career-ladder-ui-browser] PENDING_RETRY asset publish lock busy ' + JSON.stringify(lockInfo));
    console.log('[career-ladder-ui-browser] report: ' + path.relative(ROOT, REPORT_PATH));
    process.exitCode = 2;
    return;
  }

  const removedStale = clearStaleScreenshots();
  log('cleared stale screenshots count=' + removedStale);

  let server = null;
  let browser = null;
  let context = null;
  let page = null;
  let canonicalUrlTracker = null;
  const evidence = {
    screenshots: {},
    steps: [],
    syntheticDock: false,
    syntheticScreen: false,
    noSyntheticDockOrScreen: true,
    publicRoute: true,
  };

  try {
    server = await acquireVisualProbeServer({ root: ROOT });
    assert.equal(server.ownsServer, true, 'browser route must own ephemeral loopback server');
    const rootUrl = new URL(server.baseUrl);
    assert.equal(rootUrl.hostname, '127.0.0.1', 'browser server must bind IPv4 loopback');
    assert.equal(rootUrl.search, '', 'browser base URL must not carry query flags');

    const executablePath = findSystemBrowser();
    assert(executablePath, 'headed Chrome or Edge is required for career-ladder UI browser proof');

    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({
      headless: false,
      executablePath,
      args: [
        '--incognito',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--window-size=' + VIEWPORT.width + ',' + VIEWPORT.height,
        '--force-device-scale-factor=1',
      ],
    });
    context = await browser.newContext({
      viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    page = await context.newPage();
    canonicalUrlTracker = createCanonicalUrlTracker(page, server.baseUrl);
    const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* ignore */ }
    });

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert.equal(new URL(page.url()).search, '', 'browser must use canonical root without query flags');

    await bootPublicRouteAndDock(page, evidence);

    await openMissionLog(page, { timeout: 15_000 });
    evidence.screenshots.locked = await shot(page, SHOTS.locked);
    const lockedProbe = await page.evaluate(() => {
      const chips = document.querySelectorAll('[data-testid="mission-log-career-chip"]');
      const careerList = document.querySelector('.sf-mlog-career-list');
      const ladderStarts = document.querySelectorAll(
        '[data-testid="mission-log-career-chip"] [data-career-act="ladderAccept"]',
      );
      const leafH = window.SF && window.SF.state && window.SF.state.careers
        && window.SF.state.careers.ladders && window.SF.state.careers.ladders.hauler;
      return {
        chipCount: chips.length,
        ladderStartCount: ladderStarts.length,
        careerListPresent: !!careerList,
        careerListHidden: !careerList || careerList.hidden === true,
        haulerStatus: leafH ? leafH.status : null,
      };
    });
    assert.equal(lockedProbe.ladderStartCount, 0, 'locked path must not mount a Mission Log ladder START PATH');
    evidence.steps.push({ name: 'locked_snapshot', ...lockedProbe });

    const unlock = await unlockAndOfferLadders(page);
    if (!unlock || unlock.ok !== true) {
      throw new Error(
        'FAIL_CLOSED unlock/offer: ' + ((unlock && unlock.reason) || 'empty') + ' ' + ((unlock && unlock.detail) || ''),
      );
    }
    assert.deepEqual([...unlock.registered].sort(), ['hauler', 'hunter', 'prospector']);
    evidence.steps.push({ name: 'mission_log_offer', unlock });
    log('unlock ok registered=' + unlock.registered.join(','));

    await forceRefreshLadderUi(page);
    const offeredChip = await waitForMissionLogChip(page, { timeout: 25_000 });
    await assertLiveMissionLogChip(page);
    evidence.screenshots.offered = await shotSubject(page, CHIP_SEL, SHOTS.offered);
    assert.equal(await offeredChip.isVisible(), true, 'Mission Log career chip must be visible after offer');
    assert.ok(
      await page.locator('[data-career-act="ladderAccept"]').count() >= 1,
      'offered Mission Log chip must expose START PATH',
    );
    assert.ok(
      await page.locator('[data-career-act="ladderDecline"]').count() >= 1,
      'offered Mission Log chip must expose NOT NOW',
    );

    // Gamepad reachability seam: all branch controls tabbable (tabIndex >= 0).
    const tabProbe = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('[data-testid="mission-log-career-chip"] button[data-career-act]'));
      return buttons.map((b) => ({
        id: b.getAttribute('data-career-id') || b.getAttribute('data-career-act'),
        tabIndex: b.tabIndex,
        ariaPressed: b.getAttribute('aria-pressed'),
      }));
    });
    assert.ok(tabProbe.length >= 1, 'Mission Log career controls must exist for tabbability probe');
    for (const row of tabProbe) {
      assert.ok(row.tabIndex >= 0, 'career branch must be tabbable for gamepad: ' + JSON.stringify(row));
    }
    evidence.steps.push({ name: 'gamepad_tabbability', tabProbe });

    const beforeAccept = await leafStatus(page, 'hauler');
    assert.ok(beforeAccept, 'hauler leaf must exist after unlock');
    assert.notEqual(beforeAccept.status, 'active', 'hauler must not already be active before UI accept');

    await page.evaluate(() => {
      window.__SF_LADDER_ACCEPT_PROBE__ = { saw: false, payload: null };
      const bus = window.SF.bus;
      bus.on('career:ladder:accept', (payload) => {
        if (payload && payload.careerId === 'hauler') {
          window.__SF_LADDER_ACCEPT_PROBE__.saw = true;
          window.__SF_LADDER_ACCEPT_PROBE__.payload = { careerId: payload.careerId };
        }
      });
    });

    await publicUiAcceptCareer(page, 'hauler');

    await page.waitForFunction(() => {
      const probe = window.__SF_LADDER_ACCEPT_PROBE__;
      return !!(probe && probe.saw);
    }, null, { timeout: 5_000 });

    const acceptProbe = await page.evaluate(() => window.__SF_LADDER_ACCEPT_PROBE__);
    assert.equal(acceptProbe.saw, true, 'career:ladder:accept must fire on the bus from UI accept');
    assert.equal(acceptProbe.payload && acceptProbe.payload.careerId, 'hauler');
    const afterAccept = await leafStatus(page, 'hauler');
    assert.equal(afterAccept.status, 'active', 'accept must change hauler leaf to active via system');
    assert.ok(afterAccept.stepId, 'active leaf must have stepId');
    evidence.steps.push({
      name: 'mission_log_offer_ui_accept',
      careerId: 'hauler',
      before: beforeAccept,
      after: afterAccept,
      busSaw: true,
    });
    log('accept hauler → active stepId=' + afterAccept.stepId);

    await forceRefreshLadderUi(page);
    evidence.screenshots.active = await shotSubject(page, CHIP_SEL + '[data-career-id="hauler"]', SHOTS.active);

    // Repaint the live Mission Log career list while a CTA owns focus. The screen's
    // semantic token must restore the same action, then its arrow navigation keeps focus
    // within the mounted career group.
    const focusSelector = CHIP_SEL + '[data-career-id="hunter"]'
      + ' [data-career-act="ladderDecline"]';
    const focusBtn = page.locator(focusSelector).first();
    await focusBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await focusBtn.focus();
    const readFocus = () => page.evaluate(() => {
      const el = document.activeElement;
      const career = el && el.closest && el.closest('.sf-mlog-career-list');
      return {
        inside: !!career,
        act: el ? el.getAttribute('data-career-act') : null,
        careerId: el ? el.getAttribute('data-career-id') : null,
        choiceId: el ? el.getAttribute('data-choice-id') : null,
      };
    });
    const focusBefore = await readFocus();
    assert.equal(focusBefore.inside, true, 'keyboard focus must land inside Mission Log career group');
    assert.equal(focusBefore.act, 'ladderDecline', 'focus probe must use a live ladder CTA');
    await forceRefreshLadderUi(page);
    const focusAfterRefresh = await readFocus();
    assert.deepEqual(
      focusAfterRefresh,
      focusBefore,
      'Mission Log repaint must restore the focused career CTA by semantic token',
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);
    const focusAfter = await readFocus();
    assert.equal(focusAfter.inside, true, 'ArrowRight must keep focus inside Mission Log career group');
    evidence.steps.push({ name: 'keyboard_focus', focusBefore, focusAfterRefresh, focusAfter });
    log('keyboard focus ok');

    const mapBtn = page.locator(MAP_BTN_SEL).first();
    await mapBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForFunction((sel) => {
      const btn = document.querySelector(sel);
      return btn && !btn.disabled && !btn.hidden;
    }, MAP_BTN_SEL, { timeout: 10_000 });

    // Read data-map-source BEFORE click; require careerLadder: unconditionally (no soft OR).
    const mapSourceBeforeClick = await page.evaluate((sel) => {
      const btn = document.querySelector(sel);
      if (!btn) return null;
      return btn.getAttribute('data-map-source');
    }, MAP_BTN_SEL);
    assert.ok(
      mapSourceBeforeClick && String(mapSourceBeforeClick).startsWith('careerLadder:'),
      'career map button data-map-source must start with careerLadder: before click; got '
      + JSON.stringify(mapSourceBeforeClick),
    );

    await mapBtn.click();

    await page.waitForFunction(() => {
      const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const mgr = ui && (ui.screenManager || ui.manager);
      const top = mgr && typeof mgr.top === 'function' ? mgr.top() : null;
      if (top === 'galaxyMap') return true;
      const gm = document.querySelector('.gm-root, .gm-map, [data-screen="galaxyMap"]');
      if (!gm) return false;
      const rect = gm.getBoundingClientRect();
      return rect.width > 10 && rect.height > 10;
    }, null, { timeout: 15_000 });

    const mapTop = await page.evaluate(() => {
      const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const mgr = ui && (ui.screenManager || ui.manager);
      return mgr && typeof mgr.top === 'function' ? mgr.top() : null;
    });
    const mapScreenVisible = await page.locator('.gm-root, .gm-map').first().isVisible().catch(() => false);
    assert.ok(
      mapTop === 'galaxyMap' || mapScreenVisible,
      'galaxyMap must be visible after career map click; top=' + mapTop + ' visible=' + mapScreenVisible,
    );
    // Map may stay full-page shot.
    evidence.screenshots.mapHandoff = await shot(page, SHOTS.mapHandoff);
    evidence.steps.push({
      name: 'career_map_source',
      dataMapSource: mapSourceBeforeClick,
      top: mapTop,
      galaxyMapVisible: mapScreenVisible,
    });
    log('map CTA ok top=' + mapTop + ' data-map-source=' + mapSourceBeforeClick);

    // Exactly one Escape/pop back to the live Mission Log after career map.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.waitForFunction(() => {
      const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const mgr = ui && (ui.screenManager || ui.manager);
      return !!(mgr && typeof mgr.top === 'function' && mgr.top() === 'missionLog');
    }, null, { timeout: 15_000 });
    await waitForMissionLogChip(page, { timeout: 15_000, careerId: 'hauler' });

    await assertNoBlockingDialog(page, 'mission_log_screenshot', { allowActiveMissionLog: true });

    // The Mission Log remains the live owner after returning from the map; its mounted
    // career chip is the direct player-facing route and needs no retired station CTA.
    const chip = page.getByTestId('mission-log-career-chip');
    assert.equal(await chip.first().isVisible(), true, 'mission-log-career-chip must be visible');
    const missionTop = await page.evaluate(() => {
      const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const mgr = ui && (ui.screenManager || ui.manager);
      return mgr && typeof mgr.top === 'function' ? mgr.top() : null;
    });
    assert.equal(missionTop, 'missionLog', 'mission log screen top must be missionLog');
    evidence.screenshots.missionLog = await shotSubject(page, CHIP_SEL, SHOTS.missionLog);
    evidence.steps.push({
      name: 'mission_log_chip',
      visible: true,
      via: 'mission_log_live_surface',
      top: missionTop,
    });
    log('mission log chip visible top=missionLog');

    // Supporting framework setup: applySignal complete only (not primary claim).
    const haulerAdvance = await advanceToStep(page, 'hauler', 'risk_lane_tax', 4);
    if (!haulerAdvance.ok) {
      throw new Error('FAIL_CLOSED hauler advance to risk_lane_tax: ' + JSON.stringify(haulerAdvance));
    }
    evidence.steps.push({
      name: 'hauler_advance_applySignal_complete',
      evidenceClass: 'supporting_framework_setup',
      ...haulerAdvance,
    });
    await forceRefreshLadderUi(page);
    await page.waitForFunction((selector) => {
      const chip = document.querySelector(selector);
      if (!chip || chip.hidden) return false;
      return chip.querySelectorAll('[data-career-act="choose"][data-choice-id]').length >= 3;
    }, HAULER_CHIP_SEL, { timeout: 15_000 });
    for (const id of ['pay_toll', 'run_guns', 'veer_slip']) {
      const n = await page.locator(
        HAULER_CHIP_SEL + ' [data-career-act="choose"][data-choice-id="' + id + '"]',
      ).count();
      assert.ok(n >= 1, 'hauler Mission Log chip must show choice ' + id);
    }
    evidence.screenshots.haulerChoice = await shotSubject(page, HAULER_CHIP_SEL, SHOTS.haulerChoice);
    evidence.steps.push({
      name: 'hauler_lane_tax_choices',
      evidenceClass: 'supporting',
      stepId: haulerAdvance.stepId,
    });
    log('hauler lane-tax choices visible');

    const failResult = await page.evaluate(() => {
      const ladders = window.SF.registry.get('careerLadders');
      const r = ladders.applySignal('hauler', { kind: 'fail', code: 'probe_fail' });
      return {
        ok: !!(r && r.ok),
        reason: r && r.reason,
        status: window.SF.state.careers.ladders.hauler && window.SF.state.careers.ladders.hauler.status,
        evidenceClass: 'supporting_framework_setup',
      };
    });
    assert.equal(failResult.ok, true, 'fail signal must succeed: ' + JSON.stringify(failResult));
    evidence.steps.push({
      name: 'hauler_fail_applySignal',
      evidenceClass: 'supporting_framework_setup',
      ...failResult,
    });
    await forceRefreshLadderUi(page);
    await page.waitForFunction(() => {
      const st = window.SF && window.SF.state && window.SF.state.careers
        && window.SF.state.careers.ladders && window.SF.state.careers.ladders.hauler
        && window.SF.state.careers.ladders.hauler.status;
      return st === 'recovering' || st === 'step_failed';
    }, null, { timeout: 10_000 });
    evidence.screenshots.recovering = await shotSubject(page, HAULER_CHIP_SEL, SHOTS.recovering);
    evidence.steps.push({
      name: 'recovering',
      evidenceClass: 'supporting',
      status: failResult.status,
    });
    log('recovering status=' + failResult.status);

    // Public UI must accept Hunter (no accept({ignorePrereqs:true})).
    await forceRefreshLadderUi(page);
    await waitForMissionLogChip(page, { timeout: 15_000, careerId: 'hunter' });
    const hunterBefore = await leafStatus(page, 'hunter');
    assert.ok(hunterBefore, 'hunter leaf must exist after unlock');
    if (hunterBefore.status !== 'active') {
      await publicUiAcceptCareer(page, 'hunter');
    }
    const hunterAfterAccept = await leafStatus(page, 'hunter');
    assert.equal(hunterAfterAccept.status, 'active', 'hunter must be active via public UI accept');
    evidence.steps.push({
      name: 'hunter_ui_accept',
      evidenceClass: 'supporting',
      before: hunterBefore,
      after: hunterAfterAccept,
    });
    log('accept hunter → active stepId=' + hunterAfterAccept.stepId);

    const hunterAdvance = await advanceToStep(page, 'hunter', 'capture_window', 6);
    if (!hunterAdvance.ok) {
      throw new Error('FAIL_CLOSED hunter advance to capture_window: ' + JSON.stringify(hunterAdvance));
    }
    evidence.steps.push({
      name: 'hunter_advance_applySignal_complete',
      evidenceClass: 'supporting_framework_setup',
      ...hunterAdvance,
    });
    await forceRefreshLadderUi(page);
    await page.waitForFunction((selector) => {
      const chip = document.querySelector(selector);
      if (!chip || chip.hidden) return false;
      const capture = chip.querySelector('[data-career-act="choose"][data-choice-id="capture"]');
      const execute = chip.querySelector('[data-career-act="choose"][data-choice-id="execute"]');
      return !!(capture && execute);
    }, CHIP_SEL + '[data-career-id="hunter"]', { timeout: 15_000 });
    evidence.screenshots.hunterChoice = await shotSubject(
      page,
      CHIP_SEL + '[data-career-id="hunter"]',
      SHOTS.hunterChoice,
    );
    evidence.steps.push({
      name: 'hunter_capture_choices',
      evidenceClass: 'supporting',
      stepId: hunterAdvance.stepId,
    });
    log('hunter capture choices visible');

    const ledgerProbe = await page.evaluate(() => {
      const def = window.SF.registry.get('careerLadders').getDefinition('hunter');
      const step = def && def.steps && def.steps.find((s) => s.id === 'ledger_choice');
      const ids = ((step && step.choices) || []).map((c) => c.id);
      return { ids, hasFileLaw: ids.includes('file_law'), hasSellDark: ids.includes('sell_dark') };
    });
    assert.equal(ledgerProbe.hasFileLaw, true, 'hunter ledger must define file_law');
    assert.equal(ledgerProbe.hasSellDark, true, 'hunter ledger must define sell_dark');
    evidence.steps.push({ name: 'hunter_ledger_defs', evidenceClass: 'supporting', ...ledgerProbe });

    const errorIssues = issues.errorIssues();
    assert.deepEqual(
      errorIssues,
      [],
      'browser page errors: ' + JSON.stringify(summarizeIssues(errorIssues)),
    );

    for (const name of Object.values(SHOTS)) {
      assert.ok(existsSync(path.join(OUT_DIR, name)), 'required screenshot missing: ' + name);
    }

    const artifactHashes = {};
    for (const name of Object.values(SHOTS)) {
      artifactHashes[name] = hashFile(path.join(OUT_DIR, name));
    }

    const primaryClaims = PRIMARY_CLAIM_NAMES.map((name) => {
      const step = evidence.steps.find((s) => s.name === name);
      return { name, pass: true, step: step || null };
    });

    const supportingFrameworkSetup = evidence.steps.filter(
      (s) => s.evidenceClass === 'supporting_framework_setup',
    );
    const supportingShots = {
      haulerChoice: artifactHashes[SHOTS.haulerChoice],
      hunterChoice: artifactHashes[SHOTS.hunterChoice],
      recovering: artifactHashes[SHOTS.recovering],
    };

    const report = {
      schema: 'spaceface.careerLadderUiBrowser.v1',
      generatedAt: new Date().toISOString(),
      route: 'browser_public_default',
      baseUrl: server.baseUrl,
      pass: true,
      softGreen: false,
      // Explicit evidence-truth statement required by CL-UI-04 browser gate.
      noSyntheticDockOrScreen: true,
      syntheticDock: false,
      syntheticScreen: false,
      publicPath: 'New Game → Launch → waypoint/autopilot → physical dock prompt + E → public station hub → J Mission Log',
      primaryClaims,
      supporting: {
        advancedChoiceRecoveryShots: supportingShots,
        frameworkSetup: supportingFrameworkSetup,
      },
      screenshots: Object.values(SHOTS).map((n) => '.devshots/career-ladder-ui/' + n),
      artifactHashes,
      evidence,
      pageErrors: [],
      ignoredPageIssues: summarizeIssues(issues.ignoredIssues),
    };
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
    report.artifactHashes = hashArtifacts();
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
    report.artifactHashes = hashArtifacts();
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

    console.log('[career-ladder-ui-browser] PASS ' + JSON.stringify({
      primaryClaims: PRIMARY_CLAIM_NAMES,
      publicFlight: true,
      physicalDock: true,
      missionLogOfferUiAccept: afterAccept.status,
      missionLogChip: true,
      careerMapSource: mapSourceBeforeClick,
      noSyntheticDockOrScreen: true,
      supportingShots: Object.keys(supportingShots),
      screenshots: Object.values(SHOTS),
      artifactHashes: report.artifactHashes,
      report: path.relative(ROOT, REPORT_PATH),
    }));
    console.log('[career-ladder-ui-browser] report: ' + path.relative(ROOT, REPORT_PATH));
    console.log('[career-ladder-ui-browser] evidence: no synthetic dock/screen; public route only');
  } catch (error) {
    try {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(REPORT_PATH, JSON.stringify({
        schema: 'spaceface.careerLadderUiBrowser.v1',
        generatedAt: new Date().toISOString(),
        route: 'browser_public_default',
        pass: false,
        softGreen: false,
        noSyntheticDockOrScreen: true,
        syntheticDock: false,
        syntheticScreen: false,
        primaryClaims: PRIMARY_CLAIM_NAMES,
        error: {
          name: error && error.name,
          message: error && error.message,
          stack: error && error.stack,
        },
        evidence,
      }, null, 2) + '\n');
    } catch (_) { /* ignore */ }
    console.error('[career-ladder-ui-browser] FAIL: ' + ((error && error.stack) || error));
    process.exitCode = 1;
  } finally {
    try {
      await closeOwnedResources({ page, context, browser, server, canonicalUrlTracker });
    } catch (cleanupErr) {
      console.error(
        '[career-ladder-ui-browser] CLEANUP FAIL: '
        + ((cleanupErr && cleanupErr.stack) || cleanupErr),
      );
      process.exitCode = 1;
    }
  }
}

await main();
