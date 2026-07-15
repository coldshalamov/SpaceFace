#!/usr/bin/env node
// Canonical public-route visual evidence for Depth Program K1.
//
// The capture boots a real authored-asset-gated New Game, reveals the saved Verge story phase,
// opens the shipped galaxy map, and stages each faction by entering its live sector through the
// registered world/factionPresence systems. Debug access compresses travel and camera placement;
// it does not replace production UI, entities, faction planners, renderers, or tactical backends.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'depth-program', 'k1');
const MANIFEST = path.join(OUT, 'k1-live-browser-evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const CAPTURE_SEED = 0x4b310047;
const MIN_PNG_BYTES = 20_000;
const START_TIMEOUT_MS = Number(process.env.SF_K1_CAPTURE_START_TIMEOUT_MS) || 180_000;

const CASES = Object.freeze([
  {
    factionId: 'faction_fulfillment',
    label: 'Fulfillment',
    sectorId: 'sector_tethys_junction',
    file: '02-fulfillment-fixed-route.png',
    expectedMin: 3,
  },
  {
    factionId: 'faction_understory',
    label: 'Understory',
    sectorId: 'sector_charon_expanse',
    file: '03-understory-afterwake.png',
    expectedMin: 1,
  },
  {
    factionId: 'faction_archive',
    label: 'Archive',
    sectorId: 'sector_pallas_drift',
    file: '04-archive-reading-courier.png',
    expectedMin: 1,
  },
  {
    factionId: 'faction_pitborn',
    label: 'Pitborn',
    sectorId: 'sector_ashfall_reach',
    file: '05-pitborn-yard-tender.png',
    expectedMin: 1,
  },
  {
    factionId: 'faction_verge_layers',
    label: 'Verge Layers',
    sectorId: 'sector_veil_nebula',
    file: '06-verge-awake-observers.png',
    expectedMin: 3,
  },
]);

function systemBrowserPath() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function waitForVisible(page, selector, label, timeout = 30_000) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0 && rect.width > 20 && rect.height > 10;
  }, selector, { timeout }).catch((error) => {
    throw new Error(`Timed out waiting for ${label}: ${error.message}`);
  });
}

async function bootCanonicalFlight(page, baseUrl) {
  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert(response && response.ok(), 'canonical game root must load');
  const current = new URL(page.url());
  const expected = new URL(baseUrl);
  assert.equal(current.origin, expected.origin);
  assert.equal(current.pathname, '/');
  assert.equal(current.search, '');
  assert.equal(current.hash, '');

  await page.waitForFunction(
    () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry && window.SF.ctx),
    null,
    { timeout: 30_000 },
  );
  await waitForVisible(page, '[data-screen="mainMenu"]', 'main menu', 45_000);
  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', {
      seed,
      name: 'K1 Acceptance Pilot',
      shipId: 'ship_kestrel',
      difficulty: 'standard',
    });
  }, CAPTURE_SEED);
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });

  return page.evaluate(async (seed) => {
    const sf = window.SF;
    const state = sf.state;
    sf.timeEffects.set('capture:k1', { scale: 0 });
    const player = state.entities.get(state.playerId);
    const { authoredCriticalVisualReadiness, isAuthoredPartLibraryUsable } = await import('/src/render/partsLibrary.js');
    const library = await state.render.authoredPartLibraryReady;
    return {
      seed: state.meta.seed,
      expectedSeed: seed,
      route: location.href,
      playerDefId: player.data && player.data.defId,
      backends: {
        flight: sf.registry.get('flight') && sf.registry.get('flight').name,
        ai: sf.registry.get('ai') && sf.registry.get('ai').name,
        physics: sf.registry.get('physics') && sf.registry.get('physics').name,
      },
      libraryUsable: isAuthoredPartLibraryUsable(library),
      criticalVisuals: authoredCriticalVisualReadiness(state),
    };
  }, CAPTURE_SEED);
}

async function prepareMap(page) {
  await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    state.story = state.story || {};
    state.story.verge = {
      revealed: true,
      awake: true,
      valeGatesRevoked: true,
      playerUsedClosureProtocol: true,
      revocations: [{ evidenceId: 'k1-capture-revocation' }],
    };
    state.lossLedger = state.lossLedger || { entries: [], bySector: {} };
    state.lossLedger.bySector = state.lossLedger.bySector || {};
    const loss = {
      lossId: 'k1-capture-understory-loss',
      sectorId: 'sector_charon_expanse',
      shipDefId: 'ship_mule',
      factionId: 'faction_dmc',
      kind: 'ship',
      source: 'capture-staged-loss',
      t: state.simTime || 0,
    };
    state.lossLedger.entries = [loss];
    state.lossLedger.bySector.sector_charon_expanse = [loss];
    state.world.discovery = state.world.discovery || {};
    for (const sector of Object.values(state.world.sectors || {})) {
      const row = state.world.discovery[sector.id] || (state.world.discovery[sector.id] = {});
      row.discovered = true;
      row.visitedCount = Math.max(1, row.visitedCount | 0);
    }
    state.onboarding.active = false;
    state.onboarding.finished = true;
    const screens = sf.ctx.screenManager;
    if (screens) screens.closeAll();
  });
  await page.keyboard.press('KeyN');
  await waitForVisible(page, '#sf-galaxymap', 'galaxy map');
  const galaxyButton = page.locator('#sf-galaxymap button[data-focus="galaxy"]');
  if (await galaxyButton.count()) await galaxyButton.click();
  await page.waitForTimeout(500);
  const aria = await page.locator('#sf-galaxymap canvas').getAttribute('aria-label');
  for (const label of ['Fulfillment', 'Archive', 'Pitborn', 'Understory', 'Verge']) {
    assert.match(aria || '', new RegExp(label, 'i'), `galaxy map must expose ${label}: ${aria}`);
  }
  return aria;
}

async function dismissCards(page, selector, maxPasses = 12) {
  let dismissed = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const entries = page.locator(selector);
    if (!await entries.count()) break;
    await entries.first().click({ force: true }).catch(() => {});
    dismissed += 1;
    await page.waitForTimeout(40);
  }
  return dismissed;
}

async function resetTransientPresentation(page) {
  const runtime = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const ui = sf.registry.get('ui');
    const comms = ui && ui.comms;
    for (const name of [
      'recoveryEncounterPrompt',
      'sectorLawPresenter',
      'signalInvestigationPrompt',
      'pirateParleyPrompt',
      'contactHailPrompt',
    ]) {
      const prompt = comms && comms[name];
      if (prompt && typeof prompt.hide === 'function') prompt.hide();
    }
    if (comms && typeof comms.closeBacklog === 'function') comms.closeBacklog();

    if (state.ui && state.ui.marketNews) {
      if (Array.isArray(state.ui.marketNews.log)) state.ui.marketNews.log.length = 0;
      state.ui.marketNews.lastCard = null;
    }
    if (ui && ui.marketNews && typeof ui.marketNews.render === 'function') ui.marketNews.render();

    const postcard = sf.registry.get('sectorPostcard');
    if (postcard && typeof postcard._hide === 'function') postcard._hide();
    if (state.ui) state.ui.sectorPostcard = null;

    const voice = sf.registry.get('voiceArbiter');
    const voiceEntriesCleared = voice && voice.queue ? voice.queue.size : 0;
    if (voice && voice.queue && sf.helpers.voice) {
      for (let index = 0; index < 100 && voice.queue.size; index++) sf.helpers.voice.dismiss();
    }
    // The alert presenter can still hold a just-replaced floor for one DOM turn after the queue is
    // drained. Clear through its shipped event seam while the fixed-step clock is frozen so no new
    // narrative line can race into this deliberately isolated evidence frame.
    sf.bus.emit('voice:clear', {});
    return { voiceEntriesCleared };
  });

  const toastsDismissed = await dismissCards(page, '#toasts .sf-toast:not(.sf-toast--out)');
  const commsDismissed = await dismissCards(page, '#sf-comms .sf-comm:not(.sf-comm--out)');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    toastCount: document.querySelectorAll('#toasts .sf-toast:not(.sf-toast--out)').length,
    commsCount: document.querySelectorAll('#sf-comms .sf-comm:not(.sf-comm--out)').length,
    voiceFloorCount: document.querySelectorAll('#alerts .sf-alert--floor').length,
    sectorLawVisible: !!document.querySelector('#sf-sector-law:not([hidden])'),
    sectorPostcardVisible: !!document.getElementById('sf-sector-postcard'),
  }));
  assert.equal(after.toastCount, 0, 'K1 reset must clear prior toasts');
  assert.equal(after.commsCount, 0, 'K1 reset must clear prior comms cards');
  assert.equal(after.voiceFloorCount, 0, 'K1 reset must release the one-voice floor');
  assert.equal(after.sectorLawVisible, false, 'K1 reset must hide compressed sector-law evidence');
  assert.equal(after.sectorPostcardVisible, false, 'K1 reset must hide compressed sector postcards');
  return { ...runtime, toastsDismissed, commsDismissed, after };
}

async function stageFaction(page, row) {
  return page.evaluate(({ factionId, label, sectorId, expectedMin }) => {
    const sf = window.SF;
    const state = sf.state;
    const world = sf.registry.get('world');
    const presence = sf.registry.get('factionPresence');
    if (!world || typeof world.enterSector !== 'function') throw new Error('world.enterSector unavailable');
    if (!presence) throw new Error('factionPresence runtime unavailable');
    const screens = sf.ctx.screenManager;
    if (screens) screens.closeAll();
    sf.timeEffects.clear('capture:k1');

    world.enterSector(sectorId, {
      fromJump: true,
      via: 'capture',
      fromSectorId: state.world.currentSectorId,
    });
    presence.update(1 / 60, state);

    const activeRows = Object.values(state.factionPresence && state.factionPresence.active || {})
      .filter((entry) => entry && entry.sectorId === sectorId && entry.factionId === factionId);
    const actors = activeRows
      .map((entry) => state.entities.get(entry.entityId))
      .filter((entity) => entity && entity.alive !== false
        && entity.data && entity.data.factionPresence
        && entity.data.factionPresence.factionId === factionId);
    if (actors.length < expectedMin) {
      throw new Error(`${label} expected ${expectedMin} live actors, got ${actors.length}`);
    }
    actors.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const focus = actors[Math.floor(actors.length / 2)];
    const player = state.entities.get(state.playerId);
    if (!player) throw new Error('capture player missing');
    const xs = actors.map((actor) => actor.pos.x);
    const zs = actors.map((actor) => actor.pos.z);
    const center = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
    if (player.pos && typeof player.pos.set === 'function') player.pos.set(center.x - 95, 0, center.z + 65);
    else player.pos = { x: center.x - 95, y: 0, z: center.z + 65 };
    if (player.prevPos && typeof player.prevPos.copy === 'function') player.prevPos.copy(player.pos);
    if (player.vel && typeof player.vel.set === 'function') player.vel.set(0, 0, 0);
    else player.vel = { x: 0, y: 0, z: 0 };
    player.flags = player.flags || {};
    player.flags.noInterp = true;
    state.player.targetId = focus.id;
    state.nav.waypoint = { x: focus.pos.x, z: focus.pos.z, label: `${label} presence` };
    sf.bus.emit('target:changed', { targetId: focus.id, source: 'k1-capture' });
    sf.timeEffects.set('capture:k1', { scale: 0 });
    return {
      factionId,
      label,
      sectorId: state.world.currentSectorId,
      actorCount: actors.length,
      actorIds: actors.map((actor) => actor.id),
      defIds: actors.map((actor) => actor.data && actor.data.defId),
      formations: [...new Set(actors.map((actor) => actor.data.ai && actor.data.ai.formation).filter(Boolean))],
      doctrines: [...new Set(actors.map((actor) => actor.data.ai && actor.data.ai.combatDoctrineId).filter(Boolean))],
      targetId: state.player.targetId,
      center,
    };
  }, row);
}

async function announceFaction(page, row) {
  await page.evaluate(({ label, sectorId }) => {
    window.SF.bus.emit('toast', {
      text: `${label.toUpperCase()} PRESENCE — ${sectorId.replace(/^sector_/, '').replace(/_/g, ' ')}`,
      assertive: false,
      shape: 'faction-presence',
    });
  }, row);
}

async function assertImage(file) {
  const info = await stat(file);
  assert(info.isFile());
  assert(info.size >= MIN_PNG_BYTES, `${relative(file)} is too small (${info.size} bytes)`);
  return info.size;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();
  const executablePath = systemBrowserPath();
  const probe = await acquireVisualProbeServer({ root: ROOT });
  const browser = await chromium.launch({
    headless: process.env.SF_K1_HEADED !== '1',
    ...(executablePath ? { executablePath } : {}),
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const pageErrors = [];
  const consoleErrors = [];
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  try {
    const startup = await bootCanonicalFlight(page, probe.baseUrl);
    assert.equal(startup.backends.flight, 'flight');
    assert.equal(startup.backends.ai, 'tacticalAI');
    assert.equal(startup.backends.physics, 'physics');
    assert.equal(startup.libraryUsable, true);
    assert.equal(startup.criticalVisuals.ready, true);

    const mapAria = await prepareMap(page);
    const mapFile = path.join(OUT, '01-five-faction-galaxy-map.png');
    await page.screenshot({ path: mapFile });
    const mapBytes = await assertImage(mapFile);

    const rows = [];
    for (const entry of CASES) {
      await resetTransientPresentation(page);
      const staged = await stageFaction(page, entry);
      const transientReset = await resetTransientPresentation(page);
      await announceFaction(page, entry);
      await page.waitForTimeout(500);
      const file = path.join(OUT, entry.file);
      await page.screenshot({ path: file });
      rows.push({ ...staged, transientReset, screenshot: relative(file), bytes: await assertImage(file) });
    }

    assert.deepEqual(pageErrors, [], pageErrors.join('\n'));
    assert.deepEqual(consoleErrors, [], consoleErrors.join('\n'));
    const evidence = {
      schema: 'spaceface.depthProgram.k1LiveBrowserEvidence.v1',
      program: 'SpaceFace Depth Program K1',
      result: 'passed',
      deterministicSeed: CAPTURE_SEED,
      route: {
        canonicalRoot: true,
        url: startup.route,
        queryFlags: false,
        fixturePage: false,
        alternateAssetMode: false,
      },
      startup,
      map: { ariaLabel: mapAria, screenshot: relative(mapFile), bytes: mapBytes },
      encounters: rows,
      validation: { viewport: VIEWPORT, minimumPngBytes: MIN_PNG_BYTES, pageErrors, consoleErrors },
      limitations: [
        'Travel, story reveal, and camera placement are compressed through window.SF after the canonical authored New Game gate.',
        'The frames prove shipped map/UI/render/entity integration and live factionPresence planning; behavior distributions remain proven by the separate deterministic K1 replay artifact.',
      ],
    };
    await writeFile(MANIFEST, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`K1 live-browser capture OK: map + ${rows.length} faction encounters`);
    console.log(`Evidence: ${MANIFEST}`);
  } finally {
    await browser.close().catch(() => {});
    await probe.close().catch(() => {});
  }
}

await main();
