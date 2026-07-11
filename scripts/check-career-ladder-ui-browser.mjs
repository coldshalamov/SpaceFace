#!/usr/bin/env node
/**
 * CL-UI-04 browser gate — default public route proof for career ladder UI.
 *
 * One Game Path only (canonical public root, no query flags / alternate game).
 * Unlock via real framework APIs (noteSkillProof + offer). Accept proven through
 * UI → bus → leaf. Station rail, mission-log chip, map CTA, keyboard focus.
 * Screenshots under ignored .devshots/career-ladder-ui/.
 *
 * Evidence truth (fail-closed):
 *  - never fall back to dock:docked bus for docking
 *  - never pushScreen('station') / inject dock or screen state
 *  - never label a Market image as station rail
 *  - must AWAIT state.render.authoredPartLibraryReady promise before Launch; fail if false
 *  - public New Game / Launch, waypoint+autopilot, physical dock prompt + E
 *  - public station Hub navigation; public ladder UI accept; Mission Log CTA
 *  - fail fast on game:startFailed
 *  - primaryClaims: public flight, physical dock, station offer+UI accept,
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
import { closeOwnedResources } from './lib/alphaLiveBaselineContracts.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'career-ladder-ui');
const REPORT_PATH = path.join(OUT_DIR, 'browser-route.json');
const VIEWPORT = { width: 1440, height: 900 };
const FLIGHT_TIMEOUT_MS = 150_000;
const DOCK_TIMEOUT_MS = 120_000;
const ASSET_LOCK = path.join(ROOT, 'assets', 'ships', 'release.__lock');
const ASSET_BUILDING = path.join(ROOT, 'assets', 'ships', 'release.__building');

const SHOTS = Object.freeze({
  locked: '01-station-rail-locked.png',
  offered: '02-station-rail-offered.png',
  active: '03-station-rail-active.png',
  recovering: '04-station-rail-recovering.png',
  hunterChoice: '05-hunter-choice.png',
  haulerChoice: '05b-hauler-lane-tax-choice.png',
  missionLog: '06-mission-log-chip.png',
  mapHandoff: '07-map-handoff.png',
});

const RAIL_SEL = '[data-testid="career-ladder-rail"]';
const CHIP_SEL = '[data-testid="mission-log-career-chip"]';
const MAP_BTN_SEL = '[data-testid="career-ladder-map"]';
const MISSION_LOG_CTA_SEL = '[data-testid="career-ladder-mission-log"]';

const PRIMARY_CLAIM_NAMES = Object.freeze([
  'public_flight',
  'physical_dock',
  'station_offer_ui_accept',
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
 * Scroll a rail/chip into view, assert viewport intersection, element-screenshot.
 * Used for offered/active/recovering/choice rails and mission-log chip (not map page shot).
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
  await hit.click().catch(async () => { await page.keyboard.press('Enter'); });
  const setWaypointButton = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await setWaypointButton.waitFor({ state: 'visible', timeout: 12_000 });

  // Public pointer click to arm waypoint + autopilot (no synthetic nav writes).
  const box = await setWaypointButton.boundingBox();
  assert.ok(box && box.width > 2 && box.height > 2, 'Set Waypoint button must be visible for public pointer click');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => {
    const nav = window.SF && window.SF.state && window.SF.state.nav;
    const ap = nav && nav.autopilot;
    const wp = nav && nav.waypoint;
    const apOk = !!(ap && ap.active === true);
    const wpOk = !!(wp && (wp.stationId || wp.label || wp.pos));
    return apOk || wpOk;
  }, null, { timeout: 12_000 });
  log('helios waypoint/autopilot armed via public Set Waypoint');
  evidence.steps.push({ name: 'public_waypoint_autopilot', pass: true });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

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

  // Public station hub only — never pushScreen('station').
  const hubSelectors = [
    '[data-screen="station"]',
    '.st-hub',
    '.st-hub--os',
    '.st-hub--desk',
    '[data-testid="career-ladder-rail"]',
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
          || document.querySelector('.st-hub, .st-hub--os, .st-hub--desk')
          || (top === 'station' && document.querySelector('[data-testid="career-ladder-rail"]'))
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

async function waitForLadderRail(page, { timeout = 20_000 } = {}) {
  const rail = page.getByTestId('career-ladder-rail');
  await rail.waitFor({ state: 'attached', timeout });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="career-ladder-rail"]');
    if (!el || el.hidden) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 4
      && rect.height > 4;
  }, null, { timeout });
  return rail;
}

/** Assert the ladder rail is the station career rail — not a Market panel mislabel. */
async function assertStationLadderRailNotMarket(page) {
  const probe = await page.evaluate(() => {
    const rail = document.querySelector('[data-testid="career-ladder-rail"]');
    if (!rail) return { ok: false, reason: 'rail_missing' };
    const marketPanel = document.querySelector('.st-market, [data-panel="market"], .mk-root, .sf-market');
    const railInMarket = !!(marketPanel && marketPanel.contains(rail));
    const hasCareerChoice = !!rail.querySelector('[data-testid^="career-ladder-choice-"], [data-ladder-career]');
    const cls = rail.className || '';
    return {
      ok: !railInMarket && (hasCareerChoice || cls.includes('st-ladder-rail')),
      railInMarket,
      hasCareerChoice,
      className: cls,
      testid: rail.getAttribute('data-testid'),
    };
  });
  assert.equal(probe.ok, true, 'career rail must be station ladder rail, not Market chrome: ' + JSON.stringify(probe));
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
      const hub = document.querySelector('[data-screen="station"], .st-hub, .st-hub--os, .st-hub--desk');
      const rail = document.querySelector('[data-testid="career-ladder-rail"]');
      return {
        top,
        docked: !!(window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.docked),
        hubPresent: !!hub,
        railPresent: !!rail,
      };
    });
    if (last && last.docked && (last.hubPresent || last.top === 'station' || last.railPresent)) {
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

/** Public UI accept for a career branch (no ignorePrereqs owner API). */
async function publicUiAcceptCareer(page, careerId) {
  const choiceSel = '[data-testid="career-ladder-choice-' + careerId + '"]';
  await page.waitForSelector(choiceSel, { timeout: 10_000 });
  await domClickTestId(page, 'career-ladder-choice-' + careerId);
  await page.waitForFunction(() => {
    const btn = document.querySelector('[data-testid="career-ladder-accept"]');
    return !!(btn && !btn.disabled && !btn.hidden);
  }, null, { timeout: 10_000 });
  await domClickTestId(page, 'career-ladder-accept');
  await page.waitForFunction((id) => {
    const leaf = window.SF && window.SF.state && window.SF.state.careers
      && window.SF.state.careers.ladders && window.SF.state.careers.ladders[id];
    return !!(leaf && leaf.status === 'active');
  }, careerId, { timeout: 15_000 });
  return leafStatus(page, careerId);
}

async function assertNoBlockingDialog(page, phase) {
  const probe = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(
      '[role="alertdialog"], [role="dialog"], .sf-confirm, .sf-modal--confirm',
    ));
    const visible = nodes.filter((el) => {
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).map((el) => ({
      role: el.getAttribute('role'),
      className: el.className || '',
      text: ((el.textContent || '').trim().slice(0, 120)),
    }));
    return { blocking: visible.length > 0, visible };
  });
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
    const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* ignore */ }
    });

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert.equal(new URL(page.url()).search, '', 'browser must use canonical root without query flags');

    await bootPublicRouteAndDock(page, evidence);

    evidence.screenshots.locked = await shot(page, SHOTS.locked);
    const lockedProbe = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="career-ladder-rail"]');
      const leafH = window.SF && window.SF.state && window.SF.state.careers
        && window.SF.state.careers.ladders && window.SF.state.careers.ladders.hauler;
      return {
        railPresent: !!el,
        railHidden: !el || el.hidden === true,
        haulerStatus: leafH ? leafH.status : null,
      };
    });
    assert.ok(lockedProbe.railPresent, 'stationHub must mount career-ladder-rail even when hidden');
    evidence.steps.push({ name: 'locked_snapshot', ...lockedProbe });

    const unlock = await unlockAndOfferLadders(page);
    if (!unlock || unlock.ok !== true) {
      throw new Error(
        'FAIL_CLOSED unlock/offer: ' + ((unlock && unlock.reason) || 'empty') + ' ' + ((unlock && unlock.detail) || ''),
      );
    }
    assert.deepEqual([...unlock.registered].sort(), ['hauler', 'hunter', 'prospector']);
    evidence.steps.push({ name: 'station_offer', unlock });
    log('unlock ok registered=' + unlock.registered.join(','));

    await forceRefreshLadderUi(page);
    const rail = await waitForLadderRail(page, { timeout: 25_000 });
    await assertStationLadderRailNotMarket(page);
    evidence.screenshots.offered = await shotSubject(page, RAIL_SEL, SHOTS.offered);
    assert.equal(await rail.isVisible(), true, 'station ladder rail must be visible after offer');
    assert.ok(
      await page.locator('[data-testid^="career-ladder-choice-"]').count() >= 1,
      'offered rail must expose at least one career choice',
    );

    // Gamepad reachability seam: all branch controls tabbable (tabIndex >= 0).
    const tabProbe = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('[data-testid^="career-ladder-choice-"]'));
      return buttons.map((b) => ({
        id: b.getAttribute('data-ladder-career') || b.getAttribute('data-testid'),
        tabIndex: b.tabIndex,
        ariaPressed: b.getAttribute('aria-pressed'),
      }));
    });
    assert.ok(tabProbe.length >= 1, 'career branch controls must exist for tabbability probe');
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
      name: 'station_offer_ui_accept',
      careerId: 'hauler',
      before: beforeAccept,
      after: afterAccept,
      busSaw: true,
    });
    log('accept hauler → active stepId=' + afterAccept.stepId);

    await forceRefreshLadderUi(page);
    evidence.screenshots.active = await shotSubject(page, RAIL_SEL, SHOTS.active);

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid^="career-ladder-choice-"]');
      if (el) {
        try { el.scrollIntoView({ block: 'center' }); } catch (_) { /* ignore */ }
        el.focus();
      }
    });
    const focusBefore = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.getAttribute('data-testid') || el.getAttribute('data-ladder-career') : null;
    });
    assert.ok(focusBefore, 'keyboard focus must land on a ladder career control');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);
    const focusAfter = await page.evaluate(() => {
      const el = document.activeElement;
      const sel = document.querySelector('.st-ladder-choice.is-selected');
      return {
        testid: el ? el.getAttribute('data-testid') : null,
        career: el ? el.getAttribute('data-ladder-career') : null,
        selected: sel ? sel.getAttribute('data-ladder-career') : null,
      };
    });
    assert.ok(
      focusAfter.selected || focusAfter.career || focusAfter.testid,
      'ArrowRight must keep keyboard focus inside ladder career group',
    );
    evidence.steps.push({ name: 'keyboard_focus', focusBefore, focusAfter });
    log('keyboard focus ok');

    const mapBtn = page.getByTestId('career-ladder-map');
    await mapBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="career-ladder-map"]');
      return btn && !btn.disabled && !btn.hidden;
    }, null, { timeout: 10_000 });

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

    // Exactly one Escape/pop back to station after career map.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.waitForFunction(
      () => window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.docked === true,
      null,
      { timeout: 10_000 },
    );
    // Public restore only — never pushScreen('station').
    await waitForPublicStationHub(page, { timeout: 15_000 });
    await waitForLadderRail(page, { timeout: 15_000 });

    await assertNoBlockingDialog(page, 'mission_log_screenshot');

    // Require station career CTA; no KeyJ fallback. Require top===missionLog.
    const logBtnCount = await page.locator(MISSION_LOG_CTA_SEL).count();
    assert.ok(
      logBtnCount >= 1,
      'station career mission-log CTA required (no KeyJ fallback); count=' + logBtnCount,
    );
    await domClickTestId(page, 'career-ladder-mission-log');
    await page.waitForFunction(() => {
      const ui = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const mgr = ui && (ui.screenManager || ui.manager);
      const top = mgr && typeof mgr.top === 'function' ? mgr.top() : null;
      return top === 'missionLog';
    }, null, { timeout: 15_000 });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="mission-log-career-chip"]');
      if (!chip) return false;
      const rect = chip.getBoundingClientRect();
      return rect.width > 4 && rect.height > 4;
    }, null, { timeout: 15_000 });
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
      via: 'station_career_cta',
      top: missionTop,
    });
    log('mission log chip visible top=missionLog');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await waitForPublicStationHub(page, { timeout: 15_000 });
    await waitForLadderRail(page, { timeout: 15_000 });

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
    await domClickTestId(page, 'career-ladder-choice-hauler').catch(() => {});
    await forceRefreshLadderUi(page);
    await page.waitForFunction(() => {
      const railEl = document.querySelector('[data-testid="career-ladder-rail"]');
      if (!railEl || railEl.hidden) return false;
      const choices = railEl.querySelectorAll('[data-ladder-choice], [data-testid^="career-ladder-path-choice-"]');
      return choices.length >= 3;
    }, null, { timeout: 15_000 });
    for (const id of ['pay_toll', 'run_guns', 'veer_slip']) {
      const n = await page.locator(
        '[data-ladder-choice="' + id + '"], [data-testid="career-ladder-path-choice-' + id + '"]',
      ).count();
      assert.ok(n >= 1, 'hauler rail must show choice ' + id);
    }
    evidence.screenshots.haulerChoice = await shotSubject(page, RAIL_SEL, SHOTS.haulerChoice);
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
    evidence.screenshots.recovering = await shotSubject(page, RAIL_SEL, SHOTS.recovering);
    evidence.steps.push({
      name: 'recovering',
      evidenceClass: 'supporting',
      status: failResult.status,
    });
    log('recovering status=' + failResult.status);

    // Public UI must accept Hunter (no accept({ignorePrereqs:true})).
    await forceRefreshLadderUi(page);
    await waitForLadderRail(page, { timeout: 15_000 });
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
    await domClickTestId(page, 'career-ladder-choice-hunter').catch(() => {});
    await forceRefreshLadderUi(page);
    await page.waitForFunction(() => {
      const railEl = document.querySelector('[data-testid="career-ladder-rail"]');
      if (!railEl || railEl.hidden) return false;
      const capture = railEl.querySelector(
        '[data-ladder-choice="capture"], [data-testid="career-ladder-path-choice-capture"]',
      );
      const execute = railEl.querySelector(
        '[data-ladder-choice="execute"], [data-testid="career-ladder-path-choice-execute"]',
      );
      return !!(capture && execute);
    }, null, { timeout: 15_000 });
    evidence.screenshots.hunterChoice = await shotSubject(page, RAIL_SEL, SHOTS.hunterChoice);
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
      publicPath: 'New Game → Launch → waypoint/autopilot → physical dock prompt + E → public station hub',
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
      stationOfferUiAccept: afterAccept.status,
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
      await closeOwnedResources({ page, context, browser, server });
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
