#!/usr/bin/env node
// Canonical public-route player-facing evidence for Depth Program V1.
//
// Boots the real root route and the authored-asset-gated New Game flow, then compresses only
// travel and content gates through window.SF. Every contact is reached through the production
// stationHub -> Bar presenter, and every register marker is produced by clicking one of that
// card's shipped first-contact choices. No fixture page, replacement DOM, or alternate asset mode.
//
// Outputs:
//   .devshots/depth-program/v1/01-g1-contact-yune.png ... 15-g15-contact-maera-vols.png
//   .devshots/depth-program/v1/v1-live-browser-evidence.json

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTACT_VOICE_REGISTERS } from '../src/data/barks.js';
import { SECTORS } from '../src/data/sectors.js';
import { DEPTH_PROGRAM_CONTACTS } from '../src/story/campaign47a/embodiedDialogue.js';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'depth-program', 'v1');
const MANIFEST = path.join(OUT, 'v1-live-browser-evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const CAPTURE_SEED = 0x56310047;
const START_TIMEOUT_MS = Number(process.env.SF_V1_CAPTURE_START_TIMEOUT_MS) || 180_000;
const MIN_PNG_BYTES = 20_000;

const STATION_TO_SECTOR = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_TO_SECTOR.set(station.id, { station, sector });
  }
}

const CASES = Object.freeze(DEPTH_PROGRAM_CONTACTS.map((contact, index) => {
  const voice = CONTACT_VOICE_REGISTERS[contact.id];
  assert(voice, `${contact.programId}/${contact.id}: missing voice register`);
  const choice = voice.firstContact && voice.firstContact.choices && voice.firstContact.choices[0];
  assert(choice, `${contact.programId}/${contact.id}: missing first-contact choice`);
  const lineIndexes = Array.isArray(choice.lineIndexes) && choice.lineIndexes.length
    ? choice.lineIndexes
    : [choice.lineIndex];
  const marker = voice.lines[lineIndexes[0]];
  assert(marker, `${contact.programId}/${contact.id}: missing visible register marker`);
  const stationId = contact.stationHints[0];
  const stationRow = STATION_TO_SECTOR.get(stationId);
  assert(stationRow, `${contact.programId}/${contact.id}: unknown station ${stationId}`);
  return Object.freeze({
    sequence: index + 1,
    programId: contact.programId,
    contactId: contact.id,
    name: contact.name,
    roleLabel: contact.roleLabel,
    blurb: contact.blurb,
    stationId,
    stationName: stationRow.station.name,
    sectorId: stationRow.sector.id,
    sectorName: stationRow.sector.name,
    voiceRegister: voice.register,
    choiceId: choice.id,
    choiceLabel: choice.label,
    expectedMarker: marker,
    file: `${String(index + 1).padStart(2, '0')}-${contact.programId.toLowerCase()}-${slug(contact.id)}.png`,
  });
}));

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function normalized(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function systemBrowserPath() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function waitForVisible(page, selector, label, timeout = 30_000) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return !el.hidden && style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0 && rect.width > 20 && rect.height > 10;
  }, selector, { timeout }).catch((error) => {
    throw new Error(`Timed out waiting for ${label}: ${error.message}`);
  });
}

async function bootCanonicalFlight(page, baseUrl) {
  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert(response && response.ok(), 'canonical game root must return a successful response');
  const current = new URL(page.url());
  const expected = new URL(baseUrl);
  assert.equal(current.origin, expected.origin, 'capture must remain on the owned public origin');
  assert.equal(current.pathname, '/', 'capture must use the canonical root path');
  assert.equal(current.search, '', 'capture must not use debug query routes');
  assert.equal(current.hash, '', 'capture must not use hash routes');

  await page.waitForFunction(
    () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry && window.SF.ctx),
    null,
    { timeout: 30_000 },
  );
  await waitForVisible(page, '[data-screen="mainMenu"]', 'main menu', 45_000);

  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', {
      seed,
      name: 'V1 Evidence Pilot',
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
    const player = state.entities.get(state.playerId);
    const { authoredCriticalVisualReadiness, isAuthoredPartLibraryUsable } = await import('/src/render/partsLibrary.js');
    const library = await state.render.authoredPartLibraryReady;
    return {
      seed: state.meta && state.meta.seed,
      expectedSeed: seed,
      route: location.href,
      mode: state.mode,
      playerDefId: player && player.data && player.data.defId,
      backends: {
        flight: sf.registry.get('flight') && sf.registry.get('flight').name,
        ai: sf.registry.get('ai') && sf.registry.get('ai').name,
        physics: sf.registry.get('physics') && sf.registry.get('physics').name,
      },
      releaseAssetMode: true,
      libraryUsable: isAuthoredPartLibraryUsable(library),
      criticalVisuals: authoredCriticalVisualReadiness(state),
    };
  }, CAPTURE_SEED);
}

async function stageV1Gates(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    state.story = state.story || { flags: {} };
    state.story.flags = state.story.flags || {};
    state.story.beatIndex = 7;
    state.player.flags = state.player.flags || {};
    state.player.flags.uniqueWrecksVisited = [
      'wreck_isc_vigilant',
      'wreck_dmc_ironsong',
      'wreck_choir_tender',
    ];
    if (state.onboarding && typeof state.onboarding === 'object') {
      state.onboarding.active = false;
      state.onboarding.finished = true;
    }
    const quiet = state.factions && state.factions.faction_quiet;
    const beforeQuietRep = Number(quiet && quiet.rep) || 0;
    if (beforeQuietRep < 30) {
      sf.bus.emit('faction:repDelta', {
        factionId: 'faction_quiet',
        delta: 30 - beforeQuietRep,
        reason: 'v1-capture-gate-compression',
      });
    }
    sf.timeEffects.set('capture:v1', { scale: 0 });
    const screens = sf.ctx.screenManager;
    if (screens) screens.closeAll();
    return {
      beatIndex: state.story.beatIndex,
      quietRep: Number(state.factions && state.factions.faction_quiet && state.factions.faction_quiet.rep) || 0,
      uniqueWrecksVisited: [...state.player.flags.uniqueWrecksVisited],
      timeScale: state.timeScale,
      compression: [
        'story beat set to 7',
        'Quiet reputation raised through faction:repDelta owner intent',
        'three real unique-wreck ids marked visited',
        'travel compressed through world.enterSector',
      ],
    };
  });
}

async function dismissCards(page, selector, maxPasses = 16) {
  let dismissed = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const entries = page.locator(selector);
    if (!await entries.count()) break;
    await entries.first().click({ force: true }).catch(() => {});
    dismissed++;
    await page.waitForTimeout(40);
  }
  return dismissed;
}

async function dismissUntilStable(page, selector, maxRounds = 5) {
  let dismissed = 0;
  let emptyRounds = 0;
  for (let round = 0; round < maxRounds && emptyRounds < 2; round++) {
    dismissed += await dismissCards(page, selector);
    await page.waitForTimeout(220);
    if (await page.locator(selector).count()) emptyRounds = 0;
    else emptyRounds++;
  }
  return dismissed;
}

async function clearTransientPresentation(page, { closeScreens = false } = {}) {
  const runtime = await page.evaluate((shouldCloseScreens) => {
    const sf = window.SF;
    const state = sf.state;
    const ui = sf.registry.get('ui');
    const comms = ui && ui.comms;
    const hiddenPrompts = [];
    for (const name of [
      'recoveryEncounterPrompt',
      'sectorLawPresenter',
      'signalInvestigationPrompt',
      'pirateParleyPrompt',
      'contactHailPrompt',
    ]) {
      const prompt = comms && comms[name];
      if (prompt && typeof prompt.hide === 'function') {
        prompt.hide();
        hiddenPrompts.push(name);
      }
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
    sf.bus.emit('voice:clear', {});

    if (shouldCloseScreens) {
      const screens = sf.ctx.screenManager;
      if (screens) {
        screens.closeAll();
        screens.syncVisibility && screens.syncVisibility();
      }
      state.ui.docked = false;
      state.ui.dockedStationId = null;
    }
    return { hiddenPrompts, voiceEntriesCleared, closeScreens: shouldCloseScreens };
  }, closeScreens);

  // Docking also requests an async autosave. Let its completion acknowledgement arrive before
  // draining; otherwise an "Autosaved" card can appear after an apparently empty first pass.
  if (!closeScreens) await page.waitForTimeout(2_200);
  // Dock/sector presenters can enqueue one final card on the next UI turn. Require two empty
  // rounds so the following screenshot cannot inherit late arrival copy from the prior case.
  let toastsDismissed = await dismissUntilStable(page, '#toasts .sf-toast:not(.sf-toast--out)');
  const commsDismissed = await dismissUntilStable(page, '#sf-comms .sf-comm:not(.sf-comm--out)');
  // Autosave completion can land while the comms channel is being drained; make toast cleanup the
  // terminal pass so the assertion samples the final presentation channel, not a race midpoint.
  toastsDismissed += await dismissUntilStable(page, '#toasts .sf-toast:not(.sf-toast--out)');
  const after = await page.evaluate(() => ({
    toastCount: document.querySelectorAll('#toasts .sf-toast:not(.sf-toast--out)').length,
    toastTexts: [...document.querySelectorAll('#toasts .sf-toast:not(.sf-toast--out)')]
      .map((element) => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim()),
    commsCount: document.querySelectorAll('#sf-comms .sf-comm:not(.sf-comm--out)').length,
    voiceFloorCount: document.querySelectorAll('#alerts .sf-alert--floor').length,
    recoveryVisible: !!document.querySelector('#sf-recovery-encounter:not([hidden])'),
    sectorLawVisible: !!document.querySelector('#sf-sector-law:not([hidden])'),
    sectorPostcardVisible: !!document.getElementById('sf-sector-postcard'),
    newsTickerText: (document.getElementById('sf-news-ticker')
      && (document.getElementById('sf-news-ticker').innerText
        || document.getElementById('sf-news-ticker').textContent)
      || '').replace(/\s+/g, ' ').trim(),
  }));
  assert.equal(after.toastCount, 0, `V1 transient reset must clear prior toasts: ${after.toastTexts.join(' | ')}`);
  assert.equal(after.commsCount, 0, 'V1 transient reset must clear prior comms cards');
  assert.equal(after.voiceFloorCount, 0, 'V1 transient reset must release the one-voice floor');
  assert.equal(after.recoveryVisible, false, 'V1 transient reset must hide recovery copy');
  assert.equal(after.sectorLawVisible, false, 'V1 transient reset must hide sector-law copy');
  assert.equal(after.sectorPostcardVisible, false, 'V1 transient reset must hide sector postcard copy');
  assert.equal(after.newsTickerText, '', 'V1 transient reset must clear prior news ticker copy');
  return { ...runtime, toastsDismissed, commsDismissed, after };
}

async function openProductionBar(page, row) {
  const staged = await page.evaluate(({ stationId, sectorId }) => {
    const sf = window.SF;
    const state = sf.state;
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') throw new Error('world.enterSector unavailable');
    world.enterSector(sectorId, {
      fromJump: true,
      via: 'v1-capture',
      fromSectorId: state.world.currentSectorId,
    });

    state.ui.docked = true;
    state.ui.dockedStationId = stationId;
    state.ui.activeStationTab = 'bar';
    sf.bus.emit('dock:docked', { stationId, source: 'v1-capture' });
    const screens = sf.ctx.screenManager;
    if (!screens) throw new Error('screenManager unavailable');
    screens.closeAll();
    screens.pushScreen('station');
    screens.syncVisibility && screens.syncVisibility();
    const stationScreen = screens.getActiveScreenDef && screens.getActiveScreenDef();
    if (!stationScreen || stationScreen.id !== 'station') throw new Error('production station screen unavailable');
    if (typeof stationScreen.setTab === 'function') stationScreen.setTab('bar');
    return {
      top: screens.top(),
      screenId: stationScreen.id,
      activeTab: state.ui.activeStationTab,
      dockedStationId: state.ui.dockedStationId,
      currentSectorId: state.world.currentSectorId,
    };
  }, row);
  assert.equal(staged.top, 'station');
  assert.equal(staged.screenId, 'station');
  assert.equal(staged.activeTab, 'bar');
  assert.equal(staged.dockedStationId, row.stationId);
  assert.equal(staged.currentSectorId, row.sectorId);
  await waitForVisible(page, '.st-bar', `${row.programId} production Bar`);
  await waitForVisible(page, `.st-bar [data-contact="${row.contactId}"]`, `${row.programId} contact card`);
  return staged;
}

async function captureContact(page, row) {
  const betweenCaseReset = await clearTransientPresentation(page, { closeScreens: true });
  const staged = await openProductionBar(page, row);
  const postTravelReset = await clearTransientPresentation(page, { closeScreens: false });

  const card = page.locator(`.st-bar [data-contact="${row.contactId}"]`);
  assert.equal(await card.count(), 1, `${row.programId}: expected one production card`);
  assert.equal(await page.locator('.st-bar-reply.show').count(), 0,
    `${row.programId}: prior dialogue copy must be cleared before the next case`);

  const nameText = normalized(await card.locator('.st-bar-name').innerText());
  const roleText = normalized(await card.locator('.st-bar-role').innerText());
  const blurbText = normalized(await card.locator('.st-bar-line').innerText());
  assert.match(nameText, new RegExp(escapeRegex(row.name)), `${row.programId}: canonical name must be visible`);
  assert.ok(roleText.toLocaleLowerCase('en-US').includes(row.roleLabel.toLocaleLowerCase('en-US')),
    `${row.programId}: canonical role must be visible`);
  assert.equal(blurbText, row.blurb, `${row.programId}: canon blurb must render before interaction`);

  const choice = card.locator(`[data-choice="${row.choiceId}"]`);
  assert.equal(await choice.count(), 1, `${row.programId}: shipped first-contact choice must exist`);
  assert.equal(await choice.isVisible(), true, `${row.programId}: shipped first-contact choice must be visible`);
  await choice.click();

  const reply = card.locator('.st-bar-reply.show');
  await reply.waitFor({ state: 'visible', timeout: 10_000 });
  const registerMarker = normalized(await reply.innerText());
  assert.equal(registerMarker, row.expectedMarker,
    `${row.programId}: visible reply must come from the ${row.voiceRegister} register`);
  assert.doesNotMatch(registerMarker, /No answer\./, `${row.programId}: must not use fallback dialogue`);

  await card.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  // Let the station content scroll and Chrome's compositor settle before preserving
  // evidence. A discarded first capture forces any newly exposed tiles to paint;
  // without it, headless Chrome can intermittently leave black tiles in the PNG.
  await page.waitForTimeout(500);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.screenshot({ type: 'png' });
  await page.waitForTimeout(250);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const viewportProof = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      display: style.display,
      visibility: style.visibility,
      inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
    };
  });
  assert.equal(viewportProof.inViewport, true, `${row.programId}: card must be in the captured viewport`);

  const file = path.join(OUT, row.file);
  await page.screenshot({ path: file, type: 'png' });
  const image = await validatePng(file);
  const visibleCardText = normalized(await card.innerText());
  assert.match(visibleCardText, new RegExp(escapeRegex(row.name)));
  assert.match(visibleCardText, new RegExp(escapeRegex(row.expectedMarker)));

  return {
    programId: row.programId,
    contactId: row.contactId,
    name: row.name,
    roleLabel: row.roleLabel,
    voiceRegister: row.voiceRegister,
    stationId: row.stationId,
    stationName: row.stationName,
    sectorId: row.sectorId,
    sectorName: row.sectorName,
    choice: { id: row.choiceId, label: row.choiceLabel },
    expectedMarker: row.expectedMarker,
    visible: { nameText, roleText, blurbText, registerMarker, cardText: visibleCardText },
    route: staged,
    reset: { betweenCase: betweenCaseReset, postTravel: postTravelReset },
    viewport: viewportProof,
    screenshot: relative(file),
    image,
    assertions: {
      productionStationScreen: true,
      productionBarPanel: true,
      canonicalNameVisible: true,
      canonicalBlurbVisible: true,
      shippedChoiceClicked: true,
      registerMarkerVisible: true,
      priorTransientCopyCleared: true,
    },
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function validatePng(file) {
  const info = await stat(file);
  assert(info.isFile(), `${relative(file)} must be a file`);
  assert(info.size >= MIN_PNG_BYTES, `${relative(file)} is too small (${info.size} bytes)`);
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative(file)} must be PNG`);
  return { width: VIEWPORT.width, height: VIEWPORT.height, bytes: info.size };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();
  const executablePath = systemBrowserPath();
  const probe = await acquireVisualProbeServer({
    explicitUrl: process.env.SF_V1_CAPTURE_URL || '',
    root: ROOT,
  });
  const browser = await chromium.launch({
    headless: process.env.SF_V1_HEADED !== '1',
    ...(executablePath ? { executablePath } : {}),
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const pageErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  const requestFailures = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push({ status: response.status(), url: response.url() });
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    requestFailures.push({ url: request.url(), error: failure && failure.errorText || 'request failed' });
  });

  try {
    const startup = await bootCanonicalFlight(page, probe.baseUrl);
    assert.equal(startup.seed, CAPTURE_SEED);
    assert.equal(startup.playerDefId, 'ship_kestrel');
    assert.equal(startup.backends.flight, 'flight');
    assert.equal(startup.backends.ai, 'tacticalAI');
    assert.equal(startup.backends.physics, 'physics');
    assert.equal(startup.libraryUsable, true, 'authored part library must be usable');
    assert.equal(startup.criticalVisuals.ready, true, 'authored critical visuals must be ready');
    const gateStaging = await stageV1Gates(page);
    assert.equal(gateStaging.beatIndex, 7);
    assert.ok(gateStaging.quietRep >= 25, `Quiet gate must be open, got rep ${gateStaging.quietRep}`);
    assert.ok(gateStaging.uniqueWrecksVisited.length >= 3);

    const captures = [];
    for (const row of CASES) captures.push(await captureContact(page, row));

    assert.equal(captures.length, 15);
    assert.deepEqual(captures.map((entry) => entry.contactId), CASES.map((entry) => entry.contactId));
    assert.deepEqual(pageErrors, [], pageErrors.join('\n'));
    assert.deepEqual(consoleErrors, [], consoleErrors.join('\n'));
    assert.deepEqual(httpErrors, [], JSON.stringify(httpErrors, null, 2));
    assert.deepEqual(requestFailures, [], JSON.stringify(requestFailures, null, 2));

    const evidence = {
      schema: 'spaceface.depthProgram.v1LiveBrowserEvidence.v1',
      program: 'SpaceFace Depth Program V1 — The Fifteen',
      result: 'passed',
      generatedAt: new Date().toISOString(),
      deterministicSeed: CAPTURE_SEED,
      runner: {
        automation: 'Playwright',
        browser: executablePath ? 'system Chrome/Chromium channel' : 'bundled Chromium',
        executablePath: executablePath || null,
        headless: process.env.SF_V1_HEADED !== '1',
      },
      route: {
        canonicalRoot: true,
        url: startup.route,
        authoredNewGame: true,
        queryFlags: false,
        hashRoute: false,
        fixturePage: false,
        replacementUi: false,
        alternateAssetMode: false,
        presenter: 'production stationHub -> Bar -> depth contact dialogue',
      },
      startup,
      gateStaging,
      captures,
      validation: {
        expectedContacts: CASES.length,
        capturedContacts: captures.length,
        uniqueContacts: new Set(captures.map((entry) => entry.contactId)).size,
        uniqueScreenshots: new Set(captures.map((entry) => entry.screenshot)).size,
        viewport: VIEWPORT,
        minimumPngBytes: MIN_PNG_BYTES,
        pageErrors,
        consoleErrors,
        httpErrors,
        requestFailures,
      },
      limitations: [
        'Story beat, Quiet reputation, visited-wreck count, and travel are compressed after the canonical authored New Game gate.',
        'Each frame uses the shipped station screen, Bar panel, contact card data, first-contact choice, and reply presenter; no fixture or replacement UI is injected.',
        'The capture proves player-facing reachability and register rendering, not the later mission chains intentionally outside V1.',
      ],
    };
    await writeFile(MANIFEST, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`V1 live-browser capture OK: ${captures.length}/15 production contact cards`);
    console.log(`Evidence: ${MANIFEST}`);
  } finally {
    await browser.close().catch(() => {});
    await probe.close().catch(() => {});
  }
}

await main();
