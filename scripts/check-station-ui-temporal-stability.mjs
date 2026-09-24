// Live temporal contract for the station UI.
// Unlike a screenshot check, this holds the pointer still across repeated animation frames and
// detects node replacement, hover loss, geometry drift, style oscillation, and mutation sources.
import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'station-temporal-stability');
const FRAMES = 120;
const TABS = [
  ['market', '.sx-mkt', '.sx-mkt-row:not(.is-active)'],
  ['shipworks', '.sx-sw', '.sx-hardpoint[data-spatial-slot]'],
  ['industry', '.sx-ind', '.sx-ind-row:not(.is-active)'],
  ['contracts', '.sx-ct', '.sx-ct-row:not(.is-active)'],
  ['factions', '.sx-fac', '.sx-fac-row:not(.is-active)'],
  ['bar', '.sx-bar', '.sx-bar-row:not(.is-active)'],
];
const TAB_FILTER = String(process.env.SF_STABILITY_TAB || '').trim();

mkdirSync(OUT, { recursive: true });
const server = await startServer();
const { chromium } = await loadPlaywright();
let browser;
const failures = [];

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  // Event-rendered pages stop producing frames once idle; Playwright's default rAF polling then
  // never runs and waits time out on true predicates (established fix: check-electron-new-game-launch).
  installCspSafePlaywrightPolling(page);
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* optional */ }
  });
  // Navigation and boot waits are wall-clock bounds on a contended host, not assertions; the
  // env override lets a loaded box take longer without weakening what the probe measures.
  const navTimeoutMs = Number(process.env.SF_STABILITY_NAV_TIMEOUT_MS || 60_000);
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: Math.max(30_000, navTimeoutMs) });
  await page.evaluate(() => {
    const state = window.SF.state;
    // This probe owns station DOM timing, not authored flight-asset readiness. Seed the minimum
    // ordinary player inventory needed by Shipworks and enter through the real dock event.
    state.player.credits = 10_000;
    state.player.ownedShips = [{ defId: 'ship_kestrel', name: 'Kestrel', fittings: [] }];
    state.player.activeShipIndex = 0;
    // Standing with the docked faction squeezes the player one crew over the yard's posted
    // limit (stationServices effCrews), so the repair/refuel chips' timed jobs start on the
    // next tick instead of queueing behind a seeded NPC rush window for up to ~110 s. The
    // probe asserts the service delivers, not that a full yard makes it wait.
    state.factions = state.factions || {};
    state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 150 };
    // The yard only works a berthed hull: job activation requires player.padIdx >= 0, and a
    // seeded NPC rush window can hold all seven Helios pads for ~190 s. Pre-berth the probe so
    // the departure-chip waits measure service delivery, not hangar congestion.
    state.stationServices = state.stationServices || {};
    state.stationServices.player = { stationId: 'station_helios', padIdx: 0, dockedAt: 0, jobs: [], _lastHoldingEmit: -Infinity };
    const playerShip = {
      id: 9_900_001, type: 'ship', alive: true,
      hull: 40, hullMax: 100, armorHp: 0, armorMax: 0,
    };
    state.playerId = playerShip.id;
    state.entities.set(playerShip.id, playerShip);
    state.entityList.push(playerShip);
    state.fuel = state.fuel || {};
    state.fuel.current = 20;
    state.fuel.max = 100;
    window.SF.bus.emit('dock:docked', { stationId: 'station_helios' });
    // The probe seeds a dock from the menu route, where boot holds sim time at scale 0
    // (runtime:boot-menu). Clearing it lets the pre-dock frames run normally; once docked the
    // designed ui:pausing-screen request takes over and the yard runs on the keepalive path.
    window.SF.timeEffects?.clear('runtime:boot-menu');
    // Docking holds ui:pausing-screen (scale 0) by design: the yard is delivered by
    // registry.keepalive, which presentationRunner only calls from inside a produced frame
    // (shouldSkipFullTickSystems && timeScale <= 0 → keepalive(0, frameDt)). On this idle
    // event-rendered page the compositor stops issuing frames once the screen settles, so the
    // keepalive — and every timed yard job — starves. A 1px compositor animation keeps
    // BeginFrames coming so the real per-frame keepalive path runs; the element lives on
    // document.body outside .sx-app so the mutation audit never sees it.
    const keep = document.createElement('div');
    keep.id = 'sf-probe-keepalive-frames';
    keep.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;'
      + 'pointer-events:none;opacity:0.01;animation:sfProbeFrames 1s linear infinite;';
    const sheet = document.createElement('style');
    sheet.textContent = '@keyframes sfProbeFrames{from{transform:translateX(0)}to{transform:translateX(1px)}}';
    document.head.appendChild(sheet);
    document.body.appendChild(keep);
  });
  // .sx-app is a display:contents wrapper (no box of its own); the dock is the shell's first visible region.
  // Mount pulls the lazy station chunk graph; on a contended host that alone can pass 15 s.
  await waitVisible(page, '[data-screen="station"] .sx-dock', Math.max(15_000, navTimeoutMs));

  const report = { tabs: {}, global: {} };
  // Playwright click/hover actionability polls animation frames; the idle event-rendered station
  // produces none and the wait starves with no timeout (D33). DOM clicks dispatch the same click
  // handlers synchronously without the frame dependency.
  const domClick = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`domClick found no element for ${s}`);
    el.click();
  }, sel);
  const depchipClick = (source) => page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('.sx-pop--dep .sx-depchip')]
      .find((node) => rx.test(node.textContent || ''));
    if (!el) throw new Error(`departure chip not found: ${src}`);
    el.click();
  }, source);
  const visibleBox = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, sel);
  for (const [tab, rootSelector, hoverSelector] of TABS.filter(([tab]) => !TAB_FILTER || tab === TAB_FILTER)) {
    await domClick(`[data-nav="${tab}"]`);
    await waitVisible(page, rootSelector, tab === 'shipworks' ? 30_000 : 10_000);
    if (tab === 'shipworks') {
      // previewReady flips before the authored asset is admitted and the pipelines compile; the
      // projection drifts sub-pixels while those settle (measured: 1.3px during compile). Sample
      // only the settled preview, or the drift check measures the loader, not the hover.
      // The settled terminal is host-dependent: 'authored' where a second preview context may
      // run, 'authored-plate' where it may not (secondaryPreviewWebGlBlocked — Intel/ANGLE, the
      // blocked host this probe runs on). Both are the designed final picture, so the gate is the
      // screen's own settled contract, not one specific asset outcome.
      await page.waitForFunction(() => {
        const c = document.querySelector('.sx-sw__canvas');
        return !!c && c.dataset.previewReady === 'true' && c.dataset.previewReveal === 'settled'
          && !['', 'empty', 'loading', 'procedural-fallback'].includes(c.dataset.previewAssetState || '');
      }, null, { timeout: 30_000 });
    }
    await page.waitForTimeout(tab === 'shipworks' ? 900 : 420);
    const hoverBox = await visibleBox(hoverSelector);
    if (hoverBox) {
      // locator.hover()'s actionability wait polls on animation frames; on the idle station none
      // are produced and the wait starves (D33). A raw pointer move hits :hover without it.
      await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2);
      await page.waitForTimeout(240);
      report.tabs[tab] = await sampleFrames(page, hoverSelector, FRAMES);
      checkStable(report.tabs[tab], `${tab} stationary hover`);
      check(report.tabs[tab].mutations.screenChildList === 0,
        `${tab} rebuilt its active screen ${report.tabs[tab].mutations.screenChildList} times while idle`);
    } else {
      report.tabs[tab] = { skipped: `No target matched ${hoverSelector}` };
    }
  }

  await page.mouse.move(3, 3);
  await page.waitForTimeout(240);
  report.global.idle = await sampleFrames(page, '.sx-screen__body > :first-child', FRAMES, { requireHover: false });
  check(report.global.idle.mutations.screenChildList === 0,
    `the active station screen rebuilt ${report.global.idle.mutations.screenChildList} times while idle`);

  const holdBox = await visibleBox('[data-hold]');
  if (holdBox) {
    await page.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2);
    await page.waitForTimeout(240);
    report.global.hold = await sampleFrames(page, '[data-hold]', FRAMES);
    checkStable(report.global.hold, 'Hold readout stationary hover');
  }

  const handoffBox = await visibleBox('.sxb-handoff:not([hidden]) .sxb-next');
  if (handoffBox) {
    await page.mouse.move(handoffBox.x + handoffBox.width / 2, handoffBox.y + handoffBox.height / 2);
    await page.waitForTimeout(240);
    report.global.handoff = await sampleFrames(page, '.sxb-handoff:not([hidden]) .sxb-next', FRAMES);
    checkStable(report.global.handoff, 'First Dock Handoff stationary hover');
  }

  // Departure Check entries are shortcuts, not inert warnings. Services execute immediately;
  // stateful/complex checks open their owning station surface. Departure is readiness-gated: a
  // READY ship launches directly with no popover, and the repair/refuel chips below restore
  // readiness — so force a not-ready state each time to exercise the popover deterministically.
  report.global.departureActions = {};
  const openDeparture = async () => {
    await page.evaluate(() => {
      const f = window.SF.state.fuel;
      if (f && f.max) f.current = Math.max(1, Math.round(f.max * 0.2));
      // The repair chip renders disabled ("Hull OK") on a full-hull ship, so the probe must
      // arrive damaged — fuel alone leaves the repair wait unpassable forever.
      const p = window.SF.state.entities.get(window.SF.state.playerId);
      if (p && p.hullMax > 0) p.hull = Math.max(1, Math.round(p.hullMax * 0.5));
    });
    await domClick('[data-act="undock"]');
    await waitVisible(page, '.sx-pop--dep:not([hidden])', 3_000);
  };
  await openDeparture();
  const hullBefore = await page.evaluate(() => window.SF.state.entities.get(window.SF.state.playerId)?.hull || 0);
  await depchipClick('hull|repair');
  // Repair is a timed yard job (stationServices), not an instant fill: on a production dock the
  // chip books a job the docked keepalive tick delivers over wall-clock seconds — the sim clock
  // itself is frozen while docked. The contract to assert is acceptance + delivery — hull rises
  // on the job's first delta once active — so the bound covers the worst seeded wait, not a
  // fixed wall-clock slice.
  await page.waitForFunction((before) => window.SF.state.entities.get(window.SF.state.playerId)?.hull > before,
    hullBefore, { timeout: 150_000 });
  report.global.departureActions.repair = true;

  await openDeparture();
  const fuelBefore = await page.evaluate(() => window.SF.state.fuel.current);
  await depchipClick('fuel|refuel');
  await page.waitForFunction((before) => window.SF.state.fuel.current > before, fuelBefore, { timeout: 150_000 });
  report.global.departureActions.refuel = true;

  await openDeparture();
  // The Hold chip's shortcut opens the cargo manifest directly (departureChipIntent maps
  // hold/cargo to the hold surface); the mission chip only exists when a mission is actually
  // tracked, which this probe does not set up.
  await depchipClick('hold|cargo');
  await waitVisible(page, '.sx-pop--hold:not([hidden])', 3_000);
  report.global.departureActions.hold = 'manifest';

  report.global.runningAnimations = await page.evaluate(() => [...document.querySelectorAll('.sx-app *')]
    .flatMap((node) => node.getAnimations().map((animation) => ({
      node: node.className && typeof node.className === 'string' ? node.className : node.tagName,
      name: animation.animationName || animation.effect?.getKeyframes?.()[0]?.easing || 'anonymous',
      iterations: animation.effect?.getTiming?.().iterations,
      duration: animation.effect?.getTiming?.().duration,
    })))
    .filter((entry) => entry.iterations === Infinity));
  check(!report.global.runningAnimations.some((entry) => /attention|commit-pulse/i.test(entry.name)),
    `station attention state still pulses indefinitely (${JSON.stringify(report.global.runningAnimations)})`);

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Station temporal report:', JSON.stringify(report));
  assert.deepEqual(failures, [], `Station temporal failures:\n- ${failures.join('\n- ')}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function checkStable(sample, label) {
  check(sample.sameNodeFrames === sample.frames, `${label} replaced the hovered element`);
  check(sample.hoverFrames === sample.frames, `${label} repeatedly lost :hover`);
  check(sample.hitFrames === sample.frames, `${label} moved out from under the stationary pointer`);
  check(sample.maxGeometryDrift <= 0.5, `${label} moved ${sample.maxGeometryDrift.toFixed(2)}px`);
  check(sample.styleStates.length === 1, `${label} oscillated through ${sample.styleStates.length} visual states`);
}

async function sampleFrames(page, selector, frames, { requireHover = true } = {}) {
  return page.evaluate(async ({ selector: sel, frames: count, requireHover: hoverExpected }) => {
    const initial = document.querySelector(sel);
    if (!initial) throw new Error(`Missing temporal target: ${sel}`);
    // The pointer point is the element's center at sample start; the drift baseline is the
    // first SAMPLED frame, not this rect — a tab's entrance transition can still be settling
    // when evaluate() begins, and a baseline outside the measured window measures the loader,
    // not the hover (the same class of false read as the pre-settle preview gate).
    const point = (() => {
      const r = initial.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })();
    let baselineRect = null;
    const mutations = { screenChildList: 0, readoutsChildList: 0, handoffChildList: 0, dockAttributes: 0, other: 0, details: [] };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (mutations.details.length < 40) mutations.details.push({
          type: record.type,
          attribute: record.attributeName || '',
          node: node?.className && typeof node.className === 'string' ? node.className : node?.tagName || '',
        });
        if (record.type === 'childList' && node?.closest('.sx-screen__body')) mutations.screenChildList += 1;
        else if (record.type === 'childList' && node?.closest('.sx-readouts')) mutations.readoutsChildList += 1;
        else if (record.type === 'childList' && node?.closest('.sxb-handoff')) mutations.handoffChildList += 1;
        else if (record.type === 'attributes' && node?.closest('.sx-dock')) mutations.dockAttributes += 1;
        else mutations.other += 1;
      }
    });
    observer.observe(document.querySelector('.sx-app'), {
      subtree: true, childList: true, attributes: true, characterData: true,
    });
    let sameNodeFrames = 0;
    let hoverFrames = 0;
    let hitFrames = 0;
    let maxGeometryDrift = 0;
    const styleStates = new Set();
    const geometryStates = new Set();
    const previewStates = new Set();
    for (let frame = 0; frame < count; frame += 1) {
      // An idle event-rendered page produces no compositor frames, so an unbounded rAF wait
      // starves the whole probe (D33's ten-minute stall). Sample per produced frame when frames
      // exist and per a bounded timer when they do not — the assertions read DOM state, not
      // frame indices.
      await new Promise((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(done);
        setTimeout(done, 34);
      });
      const current = document.querySelector(sel);
      if (current === initial) sameNodeFrames += 1;
      if (!hoverExpected || initial.matches(':hover')) hoverFrames += 1;
      const hit = document.elementFromPoint(point.x, point.y);
      if (!hoverExpected || hit === initial || initial.contains(hit)) hitFrames += 1;
      const rect = initial.getBoundingClientRect();
      if (baselineRect === null) baselineRect = rect;
      geometryStates.add([rect.left, rect.top, rect.width, rect.height].map((value) => value.toFixed(2)).join('|'));
      maxGeometryDrift = Math.max(maxGeometryDrift,
        Math.abs(rect.left - baselineRect.left), Math.abs(rect.top - baselineRect.top),
        Math.abs(rect.width - baselineRect.width), Math.abs(rect.height - baselineRect.height));
      const style = getComputedStyle(initial);
      const preview = document.querySelector('.sx-sw__canvas');
      if (preview) previewStates.add([
        preview.dataset.previewReady || '', preview.dataset.previewAssetState || '',
        preview.dataset.previewReveal || '', document.querySelector('.sx-sw__stage')?.className || '',
      ].join('|'));
      styleStates.add([style.opacity, style.visibility, style.transform, style.filter,
        style.backgroundColor, style.borderColor, style.boxShadow].join('|'));
    }
    observer.disconnect();
    return {
      frames: count, sameNodeFrames, hoverFrames, hitFrames,
      maxGeometryDrift, geometryStates: [...geometryStates], styleStates: [...styleStates],
      previewStates: [...previewStates], mutations,
    };
  }, { selector, frames, requireHover });
}

async function startServer() {
  const port = await freePort();
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    gameServer.once('error', reject);
    gameServer.once('listening', resolve);
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// page.waitForSelector polls on animation frames, and an idle event-rendered page makes none; this
// visibility wait polls on the timer shim like every other wait here (installCspSafePlaywrightPolling).
async function waitVisible(page, selector, timeout) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }, selector, { timeout });
}
