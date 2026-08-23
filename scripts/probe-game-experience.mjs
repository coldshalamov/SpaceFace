#!/usr/bin/env node
// probe-game-experience.mjs - live player-experience observability run.
//
// This is an evidence generator, not a balance golden. It boots the canonical player route, clicks
// through New Game, drives a short real input sequence, samples runtime state/DOM/telemetry/event
// trace, then docks through the same dock:docked seam used by runtime probes so station screens are
// observable in one artifact.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WIDTH = readPositiveIntArg('--width', 1440);
const HEIGHT = readPositiveIntArg('--height', 900);
const HEADLESS = !hasArg('--headed');
const STRICT_EXPERIENCE = hasArg('--strict-experience') || hasArg('--strict');
const START_TIMEOUT_MS = readPositiveIntArg('--start-timeout', 90000);
const OUT_DIR = join(ROOT, '.devshots', 'game-experience');
const REPORT_PATH = join(OUT_DIR, 'experience-report.json');
const { chromium } = await loadPlaywright();

const timeline = [];
let server = null;
let browser = null;

try {
  mkdirSync(OUT_DIR, { recursive: true });
  server = await startFreshServer();
  browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    try { localStorage.removeItem('sf_telemetry_v1'); } catch (_) {}
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'experience probe must use the canonical root URL with no query flags');
  // Headless boot is roughly TWICE as slow as a real GPU here, and not because the game is slow:
  // SwiftShader does not expose KHR_parallel_shader_compile, so THREE compiles every program
  // serially on the main thread. Measured on this machine: window.SF.ctx ready at 11,977 ms
  // headless against this 15,000 ms budget — an 80% margin that any load at all tips over, and
  // it did, intermittently, across five checks. A real GPU HAS the extension (verified), so
  // this is an environment allowance, not a behavioural assertion being loosened. Everything
  // these checks actually assert happens after boot and is untouched.
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');
  await waitForBootOverlayGone(page);
  await sample(page, 'main-menu', 'The canonical title route is loaded and interactive.');

  assert.equal(await clickButton(page, 'New Game'), true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"]', 15000, 'new game setup');
  await sample(page, 'new-game-setup', 'New Game setup, first-15 rail, starter ship, and launch controls.');

  assert.equal(await clickButton(page, 'Launch'), true, 'New Game setup should expose Launch');
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    if (window.SF && window.SF.eventTrace) window.SF.eventTrace.clear();
    if (window.SF && window.SF.telemetry && typeof window.SF.telemetry.reset === 'function') {
      window.SF.telemetry.reset(true);
    }
  });
  await sample(page, 'flight-start', 'Fresh flight after authored asset gates and the normal game:new path.');

  await runFlightInputSequence(page);
  await sample(page, 'flight-after-inputs', 'After W/Shift/Tab/fire/mine input sampling in live flight.');

  await exerciseMechanicsProbe(page);
  await sample(page, 'flight-mechanics-probe', 'Assisted live tether attachment and combat damage route through runtime systems.');

  const dockTarget = await dockAtFirstStation(page);
  await waitForVisible(page, '[data-screen="station"]', 15000, 'station hub');
  await page.waitForTimeout(500);
  await sample(page, 'station-hub', `Assisted dock through dock:docked at ${dockTarget.label}.`);

  await clickStationTab(page, 'market');
  await page.waitForTimeout(400);
  await sample(page, 'station-market', 'Station Market tab after real station-hub tab click.');

  await clickStationTab(page, 'missions');
  await page.waitForTimeout(400);
  await sample(page, 'station-missions', 'Station Missions tab after real station-hub tab click.');

  await clickStationTab(page, 'services');
  await page.waitForTimeout(400);
  await sample(page, 'station-services', 'Station Services tab after real station-hub tab click.');

  await page.evaluate(() => window.SF && window.SF.bus && window.SF.bus.emit('dock:undocked', {}));
  await page.waitForFunction(() => {
    const sf = window.SF;
    return !!(sf && sf.state && sf.state.mode === 'flight' && sf.state.ui && sf.state.ui.docked === false);
  }, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await sample(page, 'flight-after-undock', 'Returned to flight through dock:undocked after station inspection.');

  const finalIssues = issues.errorIssues();
  const warningIssues = issues.warningIssues();
  const summary = buildSummary(timeline, finalIssues, warningIssues);
  const report = {
    schema: 'spaceface.gameExperienceProbe.v1',
    generatedAt: new Date().toISOString(),
    route: server.baseUrl,
    headless: HEADLESS,
    viewport: { width: WIDTH, height: HEIGHT },
    pass: finalIssues.length === 0,
    summary,
    timeline,
    pageIssues: summarizeIssues(finalIssues),
    warningIssues: summarizeIssues(warningIssues),
    ignoredPageIssues: summarizeIssues(issues.ignoredIssues),
  };
  report.strictExperience = gradeExperience(report);
  if (STRICT_EXPERIENCE) report.pass = report.pass && report.strictExperience.failures.length === 0;

  writeJson(REPORT_PATH, report);
  assert.deepEqual(finalIssues, [], 'experience probe should not record runtime page errors');
  if (STRICT_EXPERIENCE) {
    assert.deepEqual(report.strictExperience.failures, [], 'strict experience grader should pass');
  }

  console.log('Game experience probe OK');
  console.log(`Report: ${toRepoPath(REPORT_PATH)}`);
  console.log(`Screenshots: ${toRepoPath(OUT_DIR)}`);
  if (report.strictExperience.failures.length || report.strictExperience.warnings.length) {
    console.log('Strict experience findings:');
    console.log(JSON.stringify(report.strictExperience, null, 2));
  }
  console.log(JSON.stringify(report.summary, null, 2));
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function runFlightInputSequence(page) {
  await page.mouse.move(Math.round(WIDTH * 0.64), Math.round(HEIGHT * 0.43));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1700);
  await page.keyboard.down('Shift');
  await page.waitForTimeout(900);
  await page.keyboard.up('Shift');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(900);
  await page.mouse.up({ button: 'left' });
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(700);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(1400);
}

async function exerciseMechanicsProbe(page) {
  const tetherTarget = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const helpers = sf && sf.helpers;
    if (!state || !player || !helpers || typeof helpers.spawnEntity !== 'function') {
      throw new Error('Mechanics probe could not access runtime spawn helpers');
    }
    const pos = { x: player.pos.x + 100, z: player.pos.z };
    const target = helpers.spawnEntity({
      type: 'wreck',
      pos,
      vel: { x: 0, z: 0 },
      radius: 18,
      mass: 800,
      hull: 120,
      hullMax: 120,
      collides: true,
      data: { probe: 'experience-tether', parentType: 'ship' },
    });
    state.input = state.input || {};
    state.input.tetherMode = 'nearest';
    state.input.aimWorld = { x: pos.x, z: pos.z };
    state.input.aimAngle = Math.atan2(pos.z - player.pos.z, pos.x - player.pos.x);
    const screen = helpers.worldToScreen ? helpers.worldToScreen({ x: pos.x, y: 0, z: pos.z }) : null;
    return { id: target.id, screen, pos };
  });
  await moveMouseToWorldScreen(page, tetherTarget.screen, tetherTarget.pos);
  await page.evaluate((targetId) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const target = state && state.entities && state.entities.get(targetId);
    const combat = sf && sf.registry && typeof sf.registry.get === 'function'
      ? sf.registry.get('combat')
      : null;
    const kernel = combat && (combat.kernel || (typeof combat.ensureKernel === 'function' ? combat.ensureKernel() : null));
    if (!state || !player || !target || !kernel || !kernel.attachments || typeof kernel.attachments.create !== 'function') {
      throw new Error('Mechanics probe could not access live attachment service');
    }
    const result = kernel.attachments.create({
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: target.id,
      targetWorld: { x: target.pos.x, z: target.pos.z },
    });
    if (!result || !result.ok) throw new Error('Mechanics probe attachment create failed: ' + (result && result.reason || 'unknown'));
  }, tetherTarget.id);
  await waitForTrace(page, ['tether:attached'], 5000, 'tether attachment');
  await page.waitForTimeout(800);

  const combatTarget = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const helpers = sf && sf.helpers;
    if (!state || !player || !helpers || typeof helpers.spawnEntity !== 'function') {
      throw new Error('Mechanics probe could not access combat spawn helpers');
    }
    const pos = { x: player.pos.x + 180, z: player.pos.z };
    const target = helpers.spawnEntity({
      type: 'ship',
      factionId: 'faction_pirates',
      team: 2,
      pos,
      vel: { x: 0, z: 0 },
      rot: Math.PI,
      radius: 16,
      mass: 900,
      hull: 80,
      hullMax: 80,
      shield: 0,
      shieldMax: 0,
      armorHp: 0,
      armorMax: 0,
      cap: 0,
      capMax: 0,
      collides: true,
      data: {
        probe: 'experience-combat',
        shipDefId: 'ship_probe_target',
        ai: { archetype: 'probe_target', passive: true },
        combat: {},
      },
    });
    state.player.targetId = target.id;
    state.input = state.input || {};
    state.input.aimWorld = { x: pos.x, z: pos.z };
    state.input.aimAngle = Math.atan2(pos.z - player.pos.z, pos.x - player.pos.x);
    const screen = helpers.worldToScreen ? helpers.worldToScreen({ x: pos.x, y: 0, z: pos.z }) : null;
    return { id: target.id, screen, pos };
  });
  await moveMouseToWorldScreen(page, combatTarget.screen, combatTarget.pos);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(350);
  await page.mouse.up({ button: 'left' });
  await waitForTrace(page, ['combat:fire'], 5000, 'combat fire');
  await page.evaluate((targetId) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const target = state && state.entities && state.entities.get(targetId);
    if (!sf || !sf.bus || !state || !target) throw new Error('Mechanics probe combat target missing');
    sf.bus.emit('projectile:hit', {
      ownerId: state.playerId,
      targetId,
      damage: 18,
      damageType: 'energy',
      pos: { x: target.pos.x, z: target.pos.z },
      weaponId: 'experience_probe_projectile',
      origin: { x: target.pos.x - 80, z: target.pos.z },
    });
  }, combatTarget.id);
  await waitForTrace(page, ['combat:damage'], 5000, 'combat damage');
}

async function moveMouseToWorldScreen(page, screen, fallbackWorld) {
  if (screen && Number.isFinite(screen.x) && Number.isFinite(screen.y) && screen.onScreen !== false) {
    await page.mouse.move(Math.round(screen.x), Math.round(screen.y));
    return;
  }
  await page.evaluate((world) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    if (!state || !player || !world) return;
    state.input = state.input || {};
    state.input.aimWorld = { x: world.x, z: world.z };
    state.input.aimAngle = Math.atan2(world.z - player.pos.z, world.x - player.pos.x);
  }, fallbackWorld);
  await page.mouse.move(Math.round(WIDTH * 0.58), Math.round(HEIGHT * 0.46));
}

async function waitForTrace(page, types, timeoutMs, label) {
  await page.waitForFunction((wanted) => {
    const sf = window.SF;
    const trace = sf && sf.eventTrace && typeof sf.eventTrace.snapshot === 'function'
      ? sf.eventTrace.snapshot()
      : [];
    return trace.some((entry) => entry && wanted.includes(entry.type));
  }, types, { timeout: timeoutMs }).catch((err) => {
    throw new Error('Timed out waiting for ' + label + ': ' + err.message);
  });
}

async function dockAtFirstStation(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const stations = state && Array.isArray(state.entityList)
      ? state.entityList.filter((e) => e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate)
      : [];
    if (!stations.length) throw new Error('No dockable station entity found for experience probe');
    stations.sort((a, b) => distance(a, player) - distance(b, player));
    const station = stations[0];
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return {
      stationId: station.data.stationId,
      label: station.data.name || station.data.stationName || station.data.stationId,
      distance: distance(station, player),
    };

    function distance(a, b) {
      if (!a || !b || !a.pos || !b.pos) return Number.POSITIVE_INFINITY;
      return Math.hypot((a.pos.x || 0) - (b.pos.x || 0), (a.pos.z || 0) - (b.pos.z || 0));
    }
  });
}

async function clickStationTab(page, tabId) {
  const ok = await page.evaluate((id) => {
    const tab = document.querySelector(`[data-screen="station"] [role="tab"][data-tab="${id}"]`)
      || document.querySelector(`[data-screen="station"] [data-tab="${id}"]`);
    if (!tab || tab.disabled) return false;
    tab.click();
    return true;
  }, tabId);
  assert.equal(ok, true, 'station tab should be clickable: ' + tabId);
}

async function sample(page, label, note) {
  const index = timeline.length + 1;
  const screenshotPath = join(OUT_DIR, `${String(index).padStart(2, '0')}-${label}.jpg`);
  await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 86 });
  const snapshot = await page.evaluate(({ label, note, screenshot }) => {
    const sf = window.SF || {};
    const state = sf.state || {};
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const trace = sf.eventTrace && typeof sf.eventTrace.snapshot === 'function' ? sf.eventTrace.snapshot() : [];
    const telemetry = sf.telemetry || window.__SF_TELEMETRY__ || null;
    const ships = entityList(state).filter((e) => e && e.type === 'ship' && e.alive !== false);
    const stations = entityList(state).filter((e) => e && e.type === 'station' && e.alive !== false);
    const asteroids = entityList(state).filter((e) => e && e.type === 'asteroid' && e.alive !== false);
    const contacts = entityList(state)
      .filter((e) => e && e.alive !== false && e.id !== state.playerId && (e.type === 'ship' || e.type === 'station' || e.type === 'asteroid' || e.type === 'drone'))
      .map((e) => summarizeContact(e, player, state))
      .sort((a, b) => a.distanceToPlayer - b.distanceToPlayer)
      .slice(0, 18);

    return {
      label,
      note,
      screenshot,
      url: location.href,
      mode: state.mode || null,
      tick: finite(state.tick),
      simTime: round2(state.simTime),
      timeScale: finite(state.timeScale, 0),
      player: summarizePlayer(player, state),
      world: summarizeWorld(state),
      counts: {
        entities: entityList(state).length,
        ships: ships.length,
        stations: stations.length,
        asteroids: asteroids.length,
        hostiles: ships.filter((ship) => isHostileToPlayer(ship, state)).length,
      },
      contacts,
      enemyVariety: summarizeEnemyVariety(ships, state),
      ui: summarizeUi(sf, state),
      station: summarizeStationUi(state),
      assets: summarizeAssets(state),
      recentTrace: trace.slice(-100),
      traceCounts: countBy(trace, (entry) => entry && entry.type || 'unknown'),
      telemetry: telemetry ? {
        funnel: safeCall(() => telemetry.getFunnel()),
        session: safeCall(() => telemetry.getSessionStats()),
        recentEvents: safeCall(() => telemetry.getRecentEvents(80)),
      } : null,
    };

    function entityList(s) {
      return Array.isArray(s.entityList) ? s.entityList : [];
    }

    function summarizePlayer(entity, s) {
      if (!entity) return null;
      return {
        id: entity.id,
        alive: entity.alive !== false,
        defId: entity.defId || entity.shipDefId || entity.data && (entity.data.defId || entity.data.shipDefId) || null,
        hull: round2(entity.hull),
        hullMax: round2(entity.hullMax),
        shield: round2(entity.shield),
        shieldMax: round2(entity.shieldMax),
        heat: round3(s.player && s.player.heat),
        credits: s.player && s.player.credits,
        cargoUsed: s.player && s.player.cargo ? round2(s.player.cargo.usedVolume) : null,
        cargoCap: s.player && s.player.cargo ? round2(s.player.cargo.capVolume) : null,
        pos: vec(entity.pos),
        vel: vec(entity.vel),
        speed: speed(entity),
        rot: round3(entity.rot),
        targetId: s.player && s.player.targetId != null ? s.player.targetId : null,
        activeShipIndex: s.player && s.player.activeShipIndex,
        activeShip: s.player && Array.isArray(s.player.ownedShips)
          ? scrub(s.player.ownedShips[s.player.activeShipIndex || 0])
          : null,
      };
    }

    function summarizeContact(entity, playerEntity, s) {
      const data = entity.data || {};
      const ai = data.ai || {};
      const combat = data.combat || {};
      return {
        id: entity.id,
        type: entity.type,
        label: entityLabel(entity),
        defId: entity.defId || data.defId || data.shipDefId || data.typeId || data.enemyTypeId || null,
        role: data.role || data.shipClass || ai.role || null,
        team: entity.team ?? null,
        factionId: entity.factionId || data.factionId || null,
        hostileToPlayer: isHostileToPlayer(entity, s),
        aiPassive: ai.passive === true,
        aiLawful: ai.lawful === true,
        scenarioActorId: data.scenarioActorId || null,
        distanceToPlayer: round2(distance(entity, playerEntity)),
        hull: round2(entity.hull),
        shield: round2(entity.shield),
        speed: speed(entity),
        targetId: combat.targetId ?? null,
        lockTarget: combat.lockTarget ?? null,
        firing: data.intent && data.intent.fire === true,
        weaponCount: Array.isArray(data.weapons) ? data.weapons.length : 0,
      };
    }

    function summarizeWorld(s) {
      const active = s.scenario && s.scenario.active || null;
      return {
        currentSectorId: s.world && s.world.currentSectorId || null,
        scenario: active ? {
          id: active.id,
          activeBeatId: active.activeBeatId,
          contractPath: active.contractPath,
        } : null,
        enteredBeatIds: s.scenario && Array.isArray(s.scenario.enteredBeatIds)
          ? s.scenario.enteredBeatIds.slice(-8)
          : [],
        navWaypoint: scrubWaypoint(s.nav && s.nav.waypoint),
        trackedMissionId: s.ui && s.ui.trackedMissionId || null,
        activeMissions: s.missions && Array.isArray(s.missions.active)
          ? s.missions.active.filter((m) => m && m.status === 'active').slice(0, 8).map((m) => ({
              id: m.id,
              title: m.title,
              type: m.type,
              status: m.status,
              objectiveProgress: m.objectiveProgress,
              objectiveTarget: m.objectiveTarget,
              reward_cr: m.reward_cr,
            }))
          : [],
      };
    }

    function summarizeEnemyVariety(shipsList, s) {
      const nonPlayerShips = shipsList.filter((ship) => ship && ship.id !== s.playerId);
      const hostileShips = nonPlayerShips.filter((ship) => isHostileToPlayer(ship, s));
      return {
        nonPlayerShipCount: nonPlayerShips.length,
        hostileShipCount: hostileShips.length,
        defIds: unique(nonPlayerShips.map((ship) => ship.defId || ship.data && (ship.data.defId || ship.data.shipDefId || ship.data.enemyTypeId || ship.data.typeId) || 'unknown')).slice(0, 20),
        roles: unique(nonPlayerShips.map((ship) => ship.data && (ship.data.role || ship.data.shipClass) || 'unknown')).slice(0, 20),
        factions: unique(nonPlayerShips.map((ship) => ship.factionId || ship.data && ship.data.factionId || 'unknown')).slice(0, 20),
        hostileDefIds: unique(hostileShips.map((ship) => ship.defId || ship.data && (ship.data.defId || ship.data.shipDefId || ship.data.enemyTypeId || ship.data.typeId) || 'unknown')).slice(0, 20),
      };
    }

    function summarizeUi(sfObj, s) {
      return {
        topScreen: sfObj.ctx && sfObj.ctx.screenManager && typeof sfObj.ctx.screenManager.top === 'function'
          ? sfObj.ctx.screenManager.top()
          : null,
        screenStack: s.ui && Array.isArray(s.ui.screenStack) ? s.ui.screenStack.slice() : [],
        docked: s.ui && s.ui.docked === true,
        activeStationTab: s.ui && s.ui.activeStationTab || null,
        visibleScreens: [...document.querySelectorAll('[data-screen]')]
          .filter(visible)
          .map((el) => ({
            screen: el.getAttribute('data-screen'),
            text: shortText(el.textContent, 900),
            rect: rect(el),
          })),
        visibleButtons: [...document.querySelectorAll('button')]
          .filter(visible)
          .slice(0, 36)
          .map((el) => ({
            text: shortText(el.textContent, 90),
            disabled: !!el.disabled,
            ariaLabel: el.getAttribute('aria-label') || null,
          })),
        missionTrackerText: shortText(document.querySelector('.sf-mission-tracker')?.textContent, 400),
        navReadoutText: shortText(document.querySelector('.sf-nav-readout')?.textContent, 300),
        targetPanelText: shortText((document.querySelector('.sf-target') || document.querySelector('.sf-target-panel'))?.textContent, 400),
        alertText: shortText(visibleText('.sf-alerts, .sf-alert, [role="alert"], [role="status"], .sf-toast, .toast'), 700),
        commsText: shortText(visibleText('.sf-comms, .sf-comms-log, .sf-caption, .sf-graffiti'), 900),
        bodyClasses: document.body ? document.body.className : '',
      };
    }

    function summarizeStationUi(s) {
      const root = document.querySelector('[data-screen="station"]');
      if (!root) return null;
      return {
        visible: visible(root),
        stationId: s.ui && s.ui.dockedStationId || null,
        activeTab: s.ui && s.ui.activeStationTab || null,
        tabs: [...root.querySelectorAll('[role="tab"][data-tab]')].map((tab) => ({
          id: tab.getAttribute('data-tab'),
          text: shortText(tab.textContent, 90),
          selected: tab.getAttribute('aria-selected') === 'true',
        })),
        departureChips: [...root.querySelectorAll('.st-departure-chip')].map((chip) => shortText(chip.textContent, 120)),
        missionRecommendText: shortText(root.querySelector('.st-mission-recommend')?.textContent, 700),
        panelText: shortText(root.querySelector('[role="tabpanel"]:not([hidden])')?.textContent || root.textContent, 1400),
      };
    }

    function summarizeAssets(s) {
      const render = s.render || {};
      const gpu = render.gpu || null;
      const loader = render.loaderDiagnostics || render.authoredAssets || null;
      return {
        gpu: gpu ? scrub(gpu) : null,
        loaderDiagnostics: loader ? scrub(loader) : null,
      };
    }

    function isHostileToPlayer(entity, s) {
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!entity || !player || entity.id === player.id) return false;
      if (entity.team == null || player.team == null) return false;
      return entity.team !== player.team;
    }

    function entityLabel(entity) {
      const data = entity && entity.data || {};
      return data.name || data.stationName || data.callsign || data.stationId || data.scenarioActorId || entity.type || 'entity';
    }

    function distance(a, b) {
      if (!a || !b || !a.pos || !b.pos) return Number.POSITIVE_INFINITY;
      return Math.hypot((a.pos.x || 0) - (b.pos.x || 0), (a.pos.z || 0) - (b.pos.z || 0));
    }

    function speed(entity) {
      return round2(Math.hypot(entity && entity.vel && entity.vel.x || 0, entity && entity.vel && entity.vel.z || 0));
    }

    function vec(v) {
      return { x: round2(v && v.x), z: round2(v && v.z) };
    }

    function scrubWaypoint(w) {
      if (!w) return null;
      return {
        label: w.label || null,
        reason: w.reason || null,
        kind: w.kind || null,
        stationId: w.stationId || null,
        missionId: w.missionId || null,
        pos: w.pos ? vec(w.pos) : null,
      };
    }

    function visible(el) {
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01
        && r.width > 4
        && r.height > 4;
    }

    function visibleText(selector) {
      return [...document.querySelectorAll(selector)]
        .filter(visible)
        .map((el) => el.textContent || '')
        .join(' | ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function rect(el) {
      const r = el.getBoundingClientRect();
      return { x: round2(r.x), y: round2(r.y), width: round2(r.width), height: round2(r.height) };
    }

    function shortText(text, max) {
      const value = String(text || '').replace(/\s+/g, ' ').trim();
      return value.length > max ? `${value.slice(0, max)}... [truncated ${value.length - max}]` : value;
    }

    function scrub(value, depth = 0) {
      if (value == null) return value;
      if (depth > 4) return '[depth]';
      if (typeof value === 'number') return round3(value);
      if (typeof value === 'string' || typeof value === 'boolean') return value;
      if (Array.isArray(value)) return value.slice(0, 40).map((entry) => scrub(entry, depth + 1));
      if (typeof value === 'object') {
        if (value.isObject3D || value.isMesh || value instanceof Map || value instanceof Set) return undefined;
        const out = {};
        for (const key of Object.keys(value).sort()) {
          if (/^(scene|renderer|camera|texture|material|geometry)$/i.test(key)) continue;
          const next = scrub(value[key], depth + 1);
          if (next !== undefined) out[key] = next;
        }
        return out;
      }
      return undefined;
    }

    function safeCall(fn) {
      try { return scrub(fn()); } catch (error) { return { error: String(error && error.message || error) }; }
    }

    function countBy(items, keyFn) {
      const out = {};
      for (const item of items || []) {
        const key = keyFn(item);
        out[key] = (out[key] || 0) + 1;
      }
      return out;
    }

    function unique(items) {
      return [...new Set((items || []).filter((item) => item != null && item !== ''))];
    }

    function finite(value, fallback = 0) {
      return Number.isFinite(Number(value)) ? Number(value) : fallback;
    }

    function round2(value) {
      return Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;
    }

    function round3(value) {
      return Number.isFinite(Number(value)) ? Math.round(Number(value) * 1000) / 1000 : 0;
    }
  }, { label, note, screenshot: toRepoPath(screenshotPath) });
  timeline.push(snapshot);
}

function buildSummary(samples, errorIssues, warningIssues) {
  const labels = samples.map((entry) => entry.label);
  const lastFlight = [...samples].reverse().find((entry) => entry.mode === 'flight') || null;
  const maxSpeed = Math.max(0, ...samples.map((entry) => entry.player && entry.player.speed || 0));
  const allTraceCounts = {};
  for (const sampleEntry of samples) {
    for (const [type, count] of Object.entries(sampleEntry.traceCounts || {})) {
      allTraceCounts[type] = Math.max(allTraceCounts[type] || 0, count);
    }
  }
  const latestVariety = [...samples].reverse().find((entry) => entry.enemyVariety) || {};
  return {
    sampledMoments: labels,
    screenshots: samples.map((entry) => entry.screenshot),
    finalMode: lastFlight && lastFlight.mode || samples.at(-1)?.mode || null,
    maxObservedPlayerSpeed: maxSpeed,
    observedTraceTypes: Object.keys(allTraceCounts).sort(),
    combatFireEvents: allTraceCounts['combat:fire'] || 0,
    damageEvents: allTraceCounts['combat:damage'] || 0,
    tetherEvents: (allTraceCounts['tether:attached'] || 0) +
      (allTraceCounts['tether:latched'] || 0) +
      (allTraceCounts['tether:released'] || 0) +
      (allTraceCounts['tether:broken'] || 0),
    enemyVariety: latestVariety.enemyVariety || null,
    finalPlayer: lastFlight && lastFlight.player || null,
    pageErrorCount: errorIssues.length,
    warningCount: warningIssues.length,
  };
}

function gradeExperience(report) {
  const failures = [];
  const warnings = [];
  const notes = [];
  const samples = Array.isArray(report.timeline) ? report.timeline : [];
  const summary = report.summary || {};
  const byLabel = new Map(samples.map((entry) => [entry.label, entry]));
  const required = [
    'main-menu',
    'new-game-setup',
    'flight-start',
    'flight-after-inputs',
    'flight-mechanics-probe',
    'station-hub',
    'station-market',
    'station-missions',
    'station-services',
    'flight-after-undock',
  ];

  for (const label of required) {
    if (!byLabel.has(label)) failures.push(`missing-sample:${label}`);
  }

  const visibleText = samples
    .flatMap((entry) => {
      const ui = entry && entry.ui || {};
      const screens = Array.isArray(ui.visibleScreens) ? ui.visibleScreens.map((s) => s.text || '') : [];
      const buttons = Array.isArray(ui.visibleButtons) ? ui.visibleButtons.map((b) => b.text || '') : [];
      return [
        entry && entry.label || '',
        ui.missionTrackerText || '',
        ui.navReadoutText || '',
        ui.targetPanelText || '',
        ui.alertText || '',
        ui.commsText || '',
        ...(entry && entry.station ? [entry.station.panelText || ''] : []),
        ...screens,
        ...buttons,
      ];
    })
    .join(' ')
    .replace(/\s+/g, ' ');

  const bannedCopy = [
    /shared browser\/desktop route/i,
    /trade\s*&\s*combat sandbox/i,
    /baseline SpaceFace experience/i,
  ];
  for (const pattern of bannedCopy) {
    if (pattern.test(visibleText)) failures.push(`out-of-fiction-copy:${pattern.source}`);
  }

  const finalPlayer = summary.finalPlayer || null;
  const targetPanelSamples = samples.filter((entry) => entry && entry.ui && entry.ui.targetPanelText);
  if (finalPlayer && finalPlayer.targetId != null && targetPanelSamples.length === 0) {
    failures.push('target-selected-but-target-panel-empty');
  }

  const hostileCount = summary.enemyVariety && summary.enemyVariety.hostileShipCount || 0;
  if (hostileCount > 0 && targetPanelSamples.length === 0) {
    failures.push('hostiles-present-but-no-target-panel-text');
  }
  if ((summary.combatFireEvents || 0) > 0 && (summary.damageEvents || 0) === 0) {
    failures.push('combat-fired-without-observed-damage');
  }
  if ((summary.tetherEvents || 0) === 0) {
    failures.push('no-tether-events-observed');
  }

  const stationSamples = samples.filter((entry) => entry && entry.label && entry.label.startsWith('station-'));
  for (const entry of stationSamples) {
    const cargoUsed = entry.player && entry.player.cargoUsed;
    const stationText = ((entry.station && entry.station.panelText) || '') + ' ' +
      ((entry.ui && entry.ui.visibleScreens || []).map((screen) => screen.text || '').join(' '));
    if (cargoUsed === 0 && /sell (the )?(sample|mined cargo)|sample cleared/i.test(stationText)) {
      failures.push(`empty-hold-sell-copy:${entry.label}`);
      break;
    }
  }

  const missionRecommendText = (byLabel.get('station-missions') && byLabel.get('station-missions').station &&
    byLabel.get('station-missions').station.missionRecommendText) || '';
  if (/recommended/i.test(missionRecommendText) && /risk\s*[234]/i.test(missionRecommendText)) {
    warnings.push('recommended-risk-2-plus-visible-on-first-dock');
  }

  const coldStartObserved = /KAEL|TESSERA|VHL-4471-T|7741|cold start/i.test(visibleText);
  if (!coldStartObserved) warnings.push('cold-start-fiction-not-visible-in-sampled-surfaces');

  if (summary.pageErrorCount === 0) notes.push('no-page-errors');
  if (summary.finalMode) notes.push(`final-mode:${summary.finalMode}`);
  if (hostileCount > 0) notes.push(`hostiles-observed:${hostileCount}`);

  return {
    pass: failures.length === 0,
    mode: STRICT_EXPERIENCE ? 'strict' : 'informational',
    failures,
    warnings,
    notes,
  };
}

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => {
    throw new Error('Timed out waiting for ' + label + ': ' + err.message);
  });
}

async function waitForBootOverlayGone(page, timeoutMs = 90000) {
  await page.waitForFunction(() => {
    const o = document.getElementById('boot-overlay');
    if (!o) return true;
    const s = getComputedStyle(o);
    return o.classList.contains('hidden') || s.pointerEvents === 'none' || s.display === 'none' || s.visibility === 'hidden';
  }, null, { timeout: timeoutMs });
}

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const exact = [...document.querySelectorAll('button')]
      .find((b) => normalize(b.textContent) === normalize(wanted));
    const button = exact || [...document.querySelectorAll('button')]
      .find((b) => normalize(b.textContent).includes(normalize(wanted)));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
}

async function startFreshServer() {
  const port = await findFreePort(8140);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await sleep(250);
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for game experience probe');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasArg(name) {
  return process.argv.includes(name);
}

function readPositiveIntArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  const value = Number.parseInt(process.argv[index + 1], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function toRepoPath(path) {
  return relative(ROOT, path).split(sep).join('/');
}
