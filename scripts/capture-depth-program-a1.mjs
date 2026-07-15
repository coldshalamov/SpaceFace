#!/usr/bin/env node
// Canonical public-route player-facing evidence for Depth Program A1 — The Band.
//
// Boots the authored-asset-gated New Game route and exercises the shipped Shift+O tuner, compact
// Band HUD, production Band system, one-voice arbiter, and canonical unique-wreck bearing owner.
// Travel and waiting are compressed only through the live window.SF debug surface. No fixture UI,
// alternate route, replacement presenter, or synthetic wreck bearing is used.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BAND_CHANNEL_BY_ID, TUNABLE_BAND_CHANNEL_IDS } from '../src/data/bandRadio.js';
import { COMMS } from '../src/data/narrative.js';
import { SECTORS } from '../src/data/sectors.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { numbersBearingDue } from '../src/systems/bandRadio.js';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'depth-program', 'a1');
const MANIFEST = path.join(OUT, 'a1-live-browser-evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const CAPTURE_SEED = 0x41310047;
const START_TIMEOUT_MS = Number(process.env.SF_A1_CAPTURE_START_TIMEOUT_MS) || 180_000;
const MIN_PNG_BYTES = 20_000;
const STORY_ROW = COMMS.story.find((row) => row.id === 'story_vale_profit_100k');
assert(STORY_ROW, 'canonical Vale priority story line must exist');

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));
const TOUR = Object.freeze([
  tourRow('concord_bulletin', 'sector_helios_prime', 'Concord core owner and stations', '01-concord-bulletin.png'),
  tourRow('the_margin', 'sector_pallas_drift', 'Quiet Smuggler Den station', '02-the-margin.png'),
  tourRow('the_static', 'sector_sker_haven', 'Reach home sector and Bazaar', '03-the-static.png'),
  tourRow('ballad_line', 'sector_sker_haven', 'Reach frontier home sector', '04-ballad-line.png'),
  tourRow('choir_vespers', 'sector_vesta_forge', 'Choir Refuel Depot station', '05-choir-vespers.png'),
  tourRow('fulfillment_routing', 'sector_helios_prime', 'live Fulfillment fixed-route convoy', '06-fulfillment-routing.png'),
  tourRow('numbers_station', 'sector_pallas_drift', 'Quiet station plus numbers home sector', '07-quiet-numbers.png'),
]);

function tourRow(channelId, sectorId, homeEvidence, file) {
  const channel = BAND_CHANNEL_BY_ID[channelId];
  const sector = SECTOR_BY_ID.get(sectorId);
  assert(channel, `unknown Band channel ${channelId}`);
  assert(sector, `unknown sector ${sectorId}`);
  return Object.freeze({
    channelId,
    label: channel.label,
    sectorId,
    sectorName: sector.name,
    homeEvidence,
    file,
  });
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

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function normalized(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForVisible(page, selector, label, timeout = 30_000) {
  await page.waitForFunction((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
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
  const titleAtMenu = await page.title();
  assert(titleAtMenu && titleAtMenu.length > 0, 'canonical page must have a title');

  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', {
      seed,
      name: 'A1 Evidence Pilot',
      shipId: 'ship_kestrel',
      difficulty: 'standard',
    });
  }, CAPTURE_SEED);
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });
  await waitForVisible(page, '#sf-band-hud .sf-band-hud__button', 'shipped Band HUD', 30_000);

  return page.evaluate(async (seed) => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const { authoredCriticalVisualReadiness, isAuthoredPartLibraryUsable } = await import('/src/render/partsLibrary.js');
    const library = await state.render.authoredPartLibraryReady;
    const onboardingBefore = state.onboarding ? {
      active: !!state.onboarding.active,
      finished: !!state.onboarding.finished,
    } : null;
    if (state.onboarding && typeof state.onboarding === 'object') {
      state.onboarding.active = false;
      state.onboarding.finished = true;
    }
    if (state.ui) {
      state.ui.docked = false;
      state.ui.dockedStationId = null;
    }
    const screens = sf.ctx.screenManager;
    if (screens) {
      screens.closeAll();
      screens.syncVisibility && screens.syncVisibility();
    }
    sf.timeEffects.set('capture:a1', { scale: 0 });
    return {
      seed: state.meta && state.meta.seed,
      expectedSeed: seed,
      route: location.href,
      title: document.title,
      mode: state.mode,
      playerDefId: player && player.data && player.data.defId,
      bandSystem: sf.registry.get('bandRadio') && sf.registry.get('bandRadio').name,
      voiceSystem: sf.registry.get('voiceArbiter') && sf.registry.get('voiceArbiter').name,
      uniqueWreckSystem: sf.registry.get('uniqueWrecks') && sf.registry.get('uniqueWrecks').name,
      backends: {
        flight: sf.registry.get('flight') && sf.registry.get('flight').name,
        ai: sf.registry.get('ai') && sf.registry.get('ai').name,
        physics: sf.registry.get('physics') && sf.registry.get('physics').name,
      },
      releaseAssetMode: true,
      libraryUsable: isAuthoredPartLibraryUsable(library),
      criticalVisuals: authoredCriticalVisualReadiness(state),
      onboardingBefore,
      onboardingAfter: state.onboarding ? {
        active: !!state.onboarding.active,
        finished: !!state.onboarding.finished,
      } : null,
      compressions: [
        'disabled the completed first-flight onboarding overlay after authored New Game',
        'froze fixed-step time through timeEffects while preserving render updates',
        'closed modal screens and forced the live flight HUD visible',
      ],
    };
  }, CAPTURE_SEED);
}

async function dismissCards(page, selector, maxPasses = 16) {
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

async function dismissUntilStable(page, selector, maxRounds = 6) {
  let dismissed = 0;
  let emptyRounds = 0;
  for (let round = 0; round < maxRounds && emptyRounds < 2; round++) {
    dismissed += await dismissCards(page, selector);
    await page.waitForTimeout(220);
    if (await page.locator(selector).count()) emptyRounds = 0;
    else emptyRounds += 1;
  }
  return dismissed;
}

async function resetTransientPresentation(page) {
  const runtime = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    sf.timeEffects.set('capture:a1', { scale: 0 });
    const screens = sf.ctx.screenManager;
    if (screens) {
      screens.closeAll();
      screens.syncVisibility && screens.syncVisibility();
    }
    if (state.ui) {
      state.ui.docked = false;
      state.ui.dockedStationId = null;
      state.ui.sectorPostcard = null;
    }

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

    const voice = sf.registry.get('voiceArbiter');
    const voiceEntriesCleared = voice && voice.queue ? voice.queue.size : 0;
    if (voice && voice.queue && sf.helpers.voice) {
      for (let index = 0; index < 100 && voice.queue.size; index++) sf.helpers.voice.dismiss();
    }
    sf.bus.emit('voice:clear', {});
    return { hiddenPrompts, voiceEntriesCleared };
  });

  let toastsDismissed = await dismissUntilStable(page, '#toasts .sf-toast:not(.sf-toast--out)');
  const commsDismissed = await dismissUntilStable(page, '#sf-comms .sf-comm:not(.sf-comm--out)');
  // Sector transitions can schedule Autosaved after the first toast pass. Drain once more after
  // comms so no late production toast contaminates the next evidence frame.
  toastsDismissed += await dismissUntilStable(page, '#toasts .sf-toast:not(.sf-toast--out)');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const text = (element) => String(element && (element.innerText || element.textContent) || '')
      .replace(/\s+/g, ' ').trim();
    return {
      toastCount: document.querySelectorAll('#toasts .sf-toast:not(.sf-toast--out)').length,
      commsCount: document.querySelectorAll('#sf-comms .sf-comm:not(.sf-comm--out)').length,
      voiceFloorCount: document.querySelectorAll('#alerts .sf-alert--floor').length,
      sectorLawVisible: !!document.querySelector('#sf-sector-law:not([hidden])'),
      sectorPostcardVisible: !!document.getElementById('sf-sector-postcard'),
      newsTickerText: text(document.getElementById('sf-news-ticker')),
    };
  });
  assert.equal(after.toastCount, 0, 'A1 reset must clear prior toasts');
  assert.equal(after.commsCount, 0, 'A1 reset must clear prior comms cards');
  assert.equal(after.voiceFloorCount, 0, 'A1 reset must release the one-voice floor');
  assert.equal(after.sectorLawVisible, false, 'A1 reset must hide sector-law copy');
  assert.equal(after.sectorPostcardVisible, false, 'A1 reset must hide sector postcards');
  assert.equal(after.newsTickerText, '', 'A1 reset must clear market-news copy');
  return { ...runtime, toastsDismissed, commsDismissed, after };
}

async function enterHomeSector(page, row) {
  return page.evaluate(({ sectorId, channelId }) => {
    const sf = window.SF;
    const state = sf.state;
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') throw new Error('world.enterSector unavailable');
    const fromSectorId = state.world.currentSectorId;
    if (fromSectorId !== sectorId) {
      world.enterSector(sectorId, {
        fromJump: true,
        via: 'a1-browser-evidence',
        fromSectorId,
      });
    }
    sf.timeEffects.set('capture:a1', { scale: 0 });
    const sector = state.world.sectors && state.world.sectors[sectorId];
    const activePresence = Object.values(state.factionPresence && state.factionPresence.active || {})
      .filter((entry) => entry && entry.sectorId === sectorId)
      .map((entry) => ({ factionId: entry.factionId, entityId: entry.entityId, routeId: entry.routeId || null }));
    return {
      fromSectorId,
      currentSectorId: state.world.currentSectorId,
      changedSector: fromSectorId !== sectorId,
      channelId,
      sectorFactionId: sector && (sector.factionId || sector.owner) || null,
      stationFactionIds: (sector && sector.stations || []).map((station) => station.factionId).filter(Boolean),
      activePresence,
      compression: fromSectorId === sectorId
        ? `retained live ${sectorId}; no travel compression needed`
        : `called registered world.enterSector(${sectorId}) instead of flying the route`,
    };
  }, row);
}

async function cycleThroughShippedShortcut(page, row, previousChannelId) {
  const before = await page.evaluate(() => window.SF.state.bandRadio && window.SF.state.bandRadio.channelId || null);
  assert.equal(before, previousChannelId, `${row.channelId}: tuner cycle must start at the prior shipped stop`);
  await page.keyboard.press('Shift+KeyO');
  await page.waitForFunction(
    (expectedChannelId) => window.SF.state.bandRadio && window.SF.state.bandRadio.channelId === expectedChannelId,
    row.channelId,
    { timeout: 10_000 },
  );
  return {
    input: 'Shift+KeyO',
    bindingLabel: 'Shift+O',
    beforeChannelId: before,
    afterChannelId: row.channelId,
    source: 'shipped uiInput -> band:cycle',
  };
}

async function stageBandLine(page, channelId, { directTune = false } = {}) {
  return page.evaluate(({ channelId, directTune }) => {
    const plain = (value) => JSON.parse(JSON.stringify(value));
    const sf = window.SF;
    const state = sf.state;
    const band = sf.registry.get('bandRadio');
    const voice = sf.registry.get('voiceArbiter');
    if (!band || typeof band.update !== 'function') throw new Error('production bandRadio unavailable');
    if (!voice || typeof voice.update !== 'function' || !voice.queue) throw new Error('production voiceArbiter unavailable');
    if (directTune) sf.bus.emit('band:tune', { channelId, source: 'a1-browser-evidence' });
    const own = state.bandRadio;
    if (!own || own.channelId !== channelId) throw new Error(`Band did not tune ${channelId}`);
    // Let the production carrier transition establish effectiveKey and surface its ident first.
    // Only after that real transition completes do we compress the wait to the rotating line.
    band.update(0, state);
    voice.update(0, state);
    const identVoice = voice.queue.active ? plain(voice.queue.active) : null;
    const identVoiceEntriesCleared = voice.queue.size;
    if (sf.helpers.voice) {
      for (let index = 0; index < 100 && voice.queue.size; index++) sf.helpers.voice.dismiss();
    }
    sf.bus.emit('voice:clear', {});
    own.identPending = false;
    own.nextLineAtS = Math.max(0, Number(state.simTime) || 0);
    band.update(0, state);
    voice.update(0, state);
    return {
      channelId: own.channelId,
      effectiveChannelId: own.effectiveChannelId,
      effectiveSourceId: own.effectiveSourceId,
      signalStrength: own.signalStrength,
      sequence: own.sequence,
      identVoice,
      lastLineId: own.lastLineIdByChannel[channelId] || null,
      heardLineIds: [...own.heardLineIds],
      activeVoice: voice.queue.active ? plain(voice.queue.active) : null,
      pendingVoiceCount: Array.isArray(voice.queue.pending) ? voice.queue.pending.length : 0,
      identVoiceEntriesCleared,
      bed: band._lastBedSignature ? JSON.parse(band._lastBedSignature) : null,
      compressions: [
        ...(directTune ? [`emitted live band:tune(${channelId}) to avoid replaying prior tuner stops`] : []),
        'allowed the registered Band and voice systems to surface the production carrier ident',
        'dismissed that carrier ident through the production voice helper',
        'skipped the natural 12-22 second cadence before the authored content line',
        'called the registered bandRadio and voiceArbiter updates once while fixed-step time was frozen',
      ],
    };
  }, { channelId, directTune });
}

async function inspectBandPresentation(page, row, staged) {
  await page.waitForFunction(({ label }) => {
    const chip = document.querySelector('#sf-band-hud .sf-band-hud__button');
    const floor = document.querySelector('#alerts .sf-alert--floor .sf-alert__text');
    return chip && floor && chip.textContent.toLowerCase().includes(label.toLowerCase())
      && floor.textContent.trim().length > 0;
  }, { label: row.label }, { timeout: 10_000 });

  const presentation = await page.evaluate(() => {
    const text = (element) => String(element && (element.innerText || element.textContent) || '')
      .replace(/\s+/g, ' ').trim();
    const content = (element) => String(element && element.textContent || '').replace(/\s+/g, ' ').trim();
    const root = document.getElementById('sf-band-hud');
    const chip = root && root.querySelector('.sf-band-hud__button');
    const floor = document.querySelector('#alerts .sf-alert--floor .sf-alert__text');
    const rect = chip.getBoundingClientRect();
    return {
      chipText: text(chip),
      ariaLabel: chip.getAttribute('aria-label'),
      ariaKeyshortcuts: chip.getAttribute('aria-keyshortcuts'),
      title: chip.getAttribute('title'),
      dataOff: chip.getAttribute('data-off'),
      effectiveChannel: chip.getAttribute('data-effective-channel'),
      hidden: !!root.hidden,
      viewport: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        fullyVisible: rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth,
      },
      floorText: content(floor),
      floorRenderedText: text(floor),
      floorCount: document.querySelectorAll('#alerts .sf-alert--floor').length,
      frameworkOverlayCount: document.querySelectorAll('vite-error-overlay, nextjs-portal, #webpack-dev-server-client-overlay').length,
      bodyTextLength: text(document.body).length,
    };
  });
  const authoredLines = new Set(BAND_CHANNEL_BY_ID[row.channelId].lines
    .filter((line) => line.role !== 'unique_wreck_bearing')
    .map((line) => line.text));
  assert.match(presentation.chipText, new RegExp(escapeRegex(row.label), 'i'));
  assert.equal(presentation.ariaKeyshortcuts, 'Shift+O');
  assert.match(presentation.title || '', /Shift\+O/);
  assert.equal(presentation.dataOff, 'false');
  assert.equal(presentation.effectiveChannel, row.channelId);
  assert.equal(presentation.hidden, false);
  assert.equal(presentation.viewport.fullyVisible, true, `${row.channelId}: Band HUD must fit the viewport`);
  assert.equal(presentation.floorCount, 1, `${row.channelId}: exactly one voice floor is allowed`);
  assert.equal(staged.activeVoice && staged.activeVoice.channel, 'band');
  assert.equal(staged.activeVoice && normalized(staged.activeVoice.text), presentation.floorText);
  assert.equal(authoredLines.has(presentation.floorText), true,
    `${row.channelId}: floor must use an authored channel line, got ${presentation.floorText}`);
  assert.ok(staged.signalStrength >= 0.45,
    `${row.channelId}: home-region signal must be readable, got ${staged.signalStrength}`);
  assert.equal(staged.bed && staged.bed.active, true, `${row.channelId}: production audio bed must be active`);
  assert.equal(presentation.frameworkOverlayCount, 0, `${row.channelId}: no framework overlay allowed`);
  assert.ok(presentation.bodyTextLength > 100, `${row.channelId}: page must not be blank`);
  return presentation;
}

async function capturePng(page, fileName) {
  const file = path.join(OUT, fileName);
  await page.waitForTimeout(300);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.screenshot({ path: file, type: 'png' });
  const info = await stat(file);
  assert(info.isFile(), `${relative(file)} must be a file`);
  assert(info.size >= MIN_PNG_BYTES, `${relative(file)} is too small (${info.size} bytes)`);
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative(file)} must be PNG`);
  return {
    file: relative(file),
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function captureListeningTour(page) {
  const captures = [];
  let previousChannelId = null;
  for (const row of TOUR) {
    const beforeReset = await resetTransientPresentation(page);
    const travel = await enterHomeSector(page, row);
    assert.equal(travel.currentSectorId, row.sectorId);
    await page.waitForTimeout(300);
    const postTravelReset = await resetTransientPresentation(page);
    const shortcut = await cycleThroughShippedShortcut(page, row, previousChannelId);
    const staged = await stageBandLine(page, row.channelId);
    const presentation = await inspectBandPresentation(page, row, staged);
    const image = await capturePng(page, row.file);
    captures.push({
      kind: 'listening-tour',
      channelId: row.channelId,
      label: row.label,
      sectorId: row.sectorId,
      sectorName: row.sectorName,
      homeEvidence: row.homeEvidence,
      shortcut,
      travel,
      reset: { before: beforeReset, postTravel: postTravelReset },
      staged,
      presentation,
      image,
      compressions: [travel.compression, ...staged.compressions],
      assertions: {
        shippedShiftOShortcut: true,
        shippedBandHud: true,
        realHomeRegion: true,
        authoredChannelLine: true,
        readableSignal: true,
        singleVoiceFloor: true,
        productionBedActive: true,
      },
    });
    previousChannelId = row.channelId;
  }
  return captures;
}

async function stagePriorityYield(page, kind) {
  const beforeReset = await resetTransientPresentation(page);
  const row = { channelId: 'ballad_line', sectorId: 'sector_sker_haven' };
  const travel = await enterHomeSector(page, row);
  await page.waitForTimeout(250);
  const postTravelReset = await resetTransientPresentation(page);
  const stagedBand = await stageBandLine(page, row.channelId, { directTune: true });
  assert.equal(stagedBand.activeVoice && stagedBand.activeVoice.channel, 'band');

  const priority = await page.evaluate(({ kind, storyText, storyId }) => {
    const plain = (value) => JSON.parse(JSON.stringify(value));
    const sf = window.SF;
    const state = sf.state;
    const voice = sf.registry.get('voiceArbiter');
    const band = sf.registry.get('bandRadio');
    const before = voice.queue.active ? plain(voice.queue.active) : null;
    if (kind === 'story') {
      sf.helpers.voice.say({
        id: `a1-browser-evidence:${storyId}`,
        channel: 'story',
        kind: 'story',
        priority: 90,
        ttl: 60,
        text: storyText,
      });
    } else {
      sf.bus.emit('alert', {
        key: 'a1-browser-evidence-shields-down',
        sev: 'danger',
        ttl: 60,
        text: 'SHIELDS DOWN',
      });
    }
    voice.update(0, state);
    band.update(0, state);
    return {
      before,
      after: voice.queue.active ? plain(voice.queue.active) : null,
      pendingCount: Array.isArray(voice.queue.pending) ? voice.queue.pending.length : 0,
      bed: band._lastBedSignature ? JSON.parse(band._lastBedSignature) : null,
    };
  }, { kind, storyText: STORY_ROW.text, storyId: STORY_ROW.id });

  const expectedText = kind === 'story' ? STORY_ROW.text : 'SHIELDS DOWN';
  const expectedChannel = kind === 'story' ? 'story' : 'alert';
  await page.waitForFunction((text) => {
    const floor = document.querySelector('#alerts .sf-alert--floor .sf-alert__text');
    return floor && floor.textContent.trim() === text;
  }, expectedText, { timeout: 10_000 });
  const presentation = await page.evaluate(() => {
    const text = (element) => String(element && (element.innerText || element.textContent) || '')
      .replace(/\s+/g, ' ').trim();
    return {
      floorText: text(document.querySelector('#alerts .sf-alert--floor .sf-alert__text')),
      floorCount: document.querySelectorAll('#alerts .sf-alert--floor').length,
      chipText: text(document.querySelector('#sf-band-hud .sf-band-hud__button')),
      bandVisible: !!document.querySelector('#sf-band-hud:not([hidden]) .sf-band-hud__button'),
    };
  });
  assert.equal(priority.before && priority.before.channel, 'band');
  assert.equal(priority.after && priority.after.channel, expectedChannel);
  assert.equal(normalized(priority.after && priority.after.text), expectedText);
  assert.equal(priority.bed && priority.bed.active, false);
  assert.equal(priority.bed && priority.bed.reason, 'voice-floor-busy');
  assert.equal(presentation.floorText, expectedText);
  assert.equal(presentation.floorCount, 1);
  assert.equal(presentation.bandVisible, true);
  assert.match(presentation.chipText, /Ballad Line/i);
  const image = await capturePng(page, kind === 'story' ? '08-band-yields-to-story.png' : '09-band-yields-to-urgent.png');
  return {
    kind: `${kind}-priority-yield`,
    expectedChannel,
    expectedText,
    sourceRef: kind === 'story'
      ? `src/data/narrative.js#${STORY_ROW.id}`
      : 'src/ui/alerts.js#danger-floor',
    travel,
    reset: { before: beforeReset, postTravel: postTravelReset },
    stagedBand,
    priority,
    presentation,
    image,
    compressions: [
      travel.compression,
      ...stagedBand.compressions,
      kind === 'story'
        ? 'enqueued one canonical narrative row through the production story-priority voice helper'
        : 'emitted the shipped danger alert SHIELDS DOWN through the production alert event seam',
      'called the registered voiceArbiter and bandRadio updates once while time was frozen',
    ],
    assertions: {
      bandHeldFloorFirst: true,
      higherPriorityPreemptedBand: true,
      exactlyOneVisibleFloor: true,
      bandHudRemainedVisible: true,
      bandBedYielded: true,
    },
  };
}

async function captureCanonicalBearing(page) {
  const beforeReset = await resetTransientPresentation(page);
  const row = { channelId: 'numbers_station', sectorId: 'sector_pallas_drift' };
  const travel = await enterHomeSector(page, row);
  await page.waitForTimeout(250);
  const postTravelReset = await resetTransientPresentation(page);
  const framing = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities && state.entities.get(state.playerId);
    if (!player || !player.pos) throw new Error('capture player missing for bearing framing');
    const from = { x: player.pos.x, z: player.pos.z };
    if (typeof player.pos.set === 'function') player.pos.set(from.x + 1600, 0, from.z + 1200);
    else {
      player.pos.x = from.x + 1600;
      player.pos.y = 0;
      player.pos.z = from.z + 1200;
    }
    if (player.prevPos && typeof player.prevPos.copy === 'function') player.prevPos.copy(player.pos);
    if (player.vel && typeof player.vel.set === 'function') player.vel.set(0, 0, 0);
    player.flags = player.flags || {};
    player.flags.noInterp = true;
    state.player.targetId = null;
    return { from, to: { x: player.pos.x, z: player.pos.z }, offset: { x: 1600, z: 1200 } };
  });
  await page.waitForTimeout(250);
  let dueSequence = 0;
  while (!numbersBearingDue(CAPTURE_SEED, dueSequence) && dueSequence < 10_000) dueSequence += 1;
  assert.ok(dueSequence < 10_000, 'deterministic numbers-station bearing sequence must exist');

  const staged = await page.evaluate(({ dueSequence }) => {
    const plain = (value) => JSON.parse(JSON.stringify(value));
    const sf = window.SF;
    const state = sf.state;
    const band = sf.registry.get('bandRadio');
    const voice = sf.registry.get('voiceArbiter');
    if (!band || !voice || !voice.queue) throw new Error('registered Band/voice systems unavailable');
    sf.bus.emit('band:tune', { channelId: 'numbers_station', source: 'a1-browser-evidence-bearing' });
    const own = state.bandRadio;
    // Complete the real retune/ident transition before moving to the deterministic rare-drop slot.
    band.update(0, state);
    voice.update(0, state);
    const identVoice = voice.queue.active ? plain(voice.queue.active) : null;
    if (sf.helpers.voice) {
      for (let index = 0; index < 100 && voice.queue.size; index++) sf.helpers.voice.dismiss();
    }
    sf.bus.emit('voice:clear', {});
    own.sequence = dueSequence;
    own.identPending = false;
    own.nextLineAtS = Math.max(0, Number(state.simTime) || 0);
    band.update(0, state);
    band.update(0, state);
    voice.update(0, state);
    const receipt = own.numbersReceipt ? plain(own.numbersReceipt) : null;
    const bearing = receipt && state.player.uniqueWrecks && state.player.uniqueWrecks.bearings
      ? state.player.uniqueWrecks.bearings[receipt.wreckId]
      : null;
    const bandBearings = Object.values(state.player.uniqueWrecks && state.player.uniqueWrecks.bearings || {})
      .filter((record) => record && record.channelId === 'band');
    return {
      dueSequence,
      identVoice,
      receipt,
      bearing: bearing ? plain(bearing) : null,
      bandBearingCount: bandBearings.length,
      activeVoice: voice.queue.active ? plain(voice.queue.active) : null,
      pendingRequest: own.pendingBearingRequest ? plain(own.pendingBearingRequest) : null,
      pendingAnnouncement: own.pendingBearingAnnouncement ? plain(own.pendingBearingAnnouncement) : null,
      signalStrength: own.signalStrength,
      bed: band._lastBedSignature ? JSON.parse(band._lastBedSignature) : null,
    };
  }, { dueSequence });
  assert(staged.receipt, 'numbers station must receive a canonical bearing receipt');
  assert.equal(staged.receipt.canonical, true);
  assert.match(staged.receipt.bearingLabel, /^\d{3}-\d{3}$/);
  const wreck = uniqueWreckById(staged.receipt.wreckId);
  assert(wreck, `receipt must name a registered unique wreck: ${staged.receipt.wreckId}`);
  assert.equal(staged.receipt.sourceRef, wreck.bearingSourceRef);
  assert(staged.bearing, 'canonical unique-wreck owner must create the actual map bearing');
  assert.equal(staged.bearing.phase, 'rumored');
  assert.equal(staged.bearing.channelId, 'band');
  assert.equal(staged.bandBearingCount, 1, 'numbers station must mint exactly one Band bearing');
  assert.equal(staged.pendingRequest, null);
  assert.equal(staged.pendingAnnouncement, null);
  assert.equal(staged.activeVoice && staged.activeVoice.channel, 'band');
  const expectedText = `BEARING ${staged.receipt.bearingLabel}. REPEAT. BEARING ${staged.receipt.bearingLabel}.`;
  assert.equal(normalized(staged.activeVoice && staged.activeVoice.text), expectedText);

  await page.waitForFunction((text) => {
    const floor = document.querySelector('#alerts .sf-alert--floor .sf-alert__text');
    return floor && floor.textContent.trim() === text;
  }, expectedText, { timeout: 10_000 });
  const presentation = await page.evaluate(() => {
    const text = (element) => String(element && (element.innerText || element.textContent) || '')
      .replace(/\s+/g, ' ').trim();
    return {
      floorText: text(document.querySelector('#alerts .sf-alert--floor .sf-alert__text')),
      floorCount: document.querySelectorAll('#alerts .sf-alert--floor').length,
      chipText: text(document.querySelector('#sf-band-hud .sf-band-hud__button')),
      ariaKeyshortcuts: document.querySelector('#sf-band-hud .sf-band-hud__button').getAttribute('aria-keyshortcuts'),
    };
  });
  assert.equal(presentation.floorText, expectedText);
  assert.equal(presentation.floorCount, 1);
  assert.match(presentation.chipText, /Quiet Numbers/i);
  assert.equal(presentation.ariaKeyshortcuts, 'Shift+O');
  const image = await capturePng(page, '10-canonical-numbers-bearing.png');
  return {
    kind: 'canonical-numbers-bearing',
    channelId: 'numbers_station',
    sectorId: row.sectorId,
    expectedText,
    wreck: {
      id: wreck.id,
      name: wreck.name,
      sourceRef: wreck.bearingSourceRef,
      sectorId: wreck.sectorId,
    },
    travel,
    framing,
    reset: { before: beforeReset, postTravel: postTravelReset },
    staged,
    presentation,
    image,
    compressions: [
      travel.compression,
      'offset the player 1600x1200 world units from the Pallas arrival geometry for unobstructed evidence framing',
      'emitted live band:tune(numbers_station) to focus the canonical carrier',
      'allowed and dismissed the production Quiet Numbers carrier ident before the rare-drop slot',
      `advanced deterministic Band sequence to the next due slot (${dueSequence})`,
      'skipped the carrier ident and natural cadence, then called registered Band updates twice',
      'allowed registered uniqueWrecks to synchronously authorize and own the real bearing receipt',
    ],
    assertions: {
      canonicalResolver: true,
      registeredUniqueWreck: true,
      actualMapBearingCreated: true,
      onePerSaveBandReceipt: true,
      bearingVisibleOnOneVoiceFloor: true,
      shippedBandHudVisible: true,
    },
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();
  const executablePath = systemBrowserPath();
  const probe = await acquireVisualProbeServer({
    explicitUrl: process.env.SF_A1_CAPTURE_URL || '',
    root: ROOT,
  });
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: process.env.SF_A1_HEADED !== '1',
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

    const startup = await bootCanonicalFlight(page, probe.baseUrl);
    assert.equal(startup.seed, CAPTURE_SEED);
    assert.equal(startup.playerDefId, 'ship_kestrel');
    assert.equal(startup.bandSystem, 'bandRadio');
    assert.equal(startup.voiceSystem, 'voiceArbiter');
    assert.equal(startup.uniqueWreckSystem, 'uniqueWrecks');
    assert.equal(startup.libraryUsable, true, 'authored part library must be usable');
    assert.equal(startup.criticalVisuals.ready, true, 'authored critical visuals must be ready');

    const listeningTour = await captureListeningTour(page);
    const storyYield = await stagePriorityYield(page, 'story');
    const urgentYield = await stagePriorityYield(page, 'urgent');
    const bearing = await captureCanonicalBearing(page);
    const captures = [...listeningTour, storyYield, urgentYield, bearing];
    assert.equal(listeningTour.length, TUNABLE_BAND_CHANNEL_IDS.length);
    assert.deepEqual(listeningTour.map((entry) => entry.channelId), TUNABLE_BAND_CHANNEL_IDS);
    assert.equal(captures.length, 10);
    assert.equal(new Set(captures.map((entry) => entry.image.file)).size, captures.length);
    assert.equal(new Set(captures.map((entry) => entry.image.sha256)).size, captures.length,
      'every evidence PNG must be visually distinct');
    assert.deepEqual(pageErrors, [], pageErrors.join('\n'));
    assert.deepEqual(consoleErrors, [], consoleErrors.join('\n'));
    assert.deepEqual(httpErrors, [], JSON.stringify(httpErrors, null, 2));
    assert.deepEqual(requestFailures, [], JSON.stringify(requestFailures, null, 2));

    const compressionLedger = [
      ...startup.compressions.map((detail) => ({ case: 'startup', kind: 'state/pacing', detail })),
      ...captures.flatMap((capture) => capture.compressions.map((detail) => ({
        case: capture.channelId || capture.kind,
        kind: detail.includes('world.enterSector') ? 'travel'
          : detail.includes('cadence') || detail.includes('sequence') ? 'pacing'
            : detail.includes('emitted') || detail.includes('enqueued') ? 'intent'
              : 'state/presentation',
        detail,
      }))),
    ];
    const evidence = {
      schema: 'spaceface.depthProgram.a1LiveBrowserEvidence.v1',
      program: 'SpaceFace Depth Program A1 — The Band',
      result: 'passed',
      generatedAt: new Date().toISOString(),
      deterministicSeed: CAPTURE_SEED,
      runner: {
        automation: 'Playwright',
        browser: executablePath ? 'system Chrome/Chromium channel' : 'bundled Chromium',
        executablePath: executablePath || null,
        headless: process.env.SF_A1_HEADED !== '1',
        browserPluginClassification: 'invocation failed',
        browserPluginFailure: 'Cannot redefine property: process',
        fallbackAuthorization: 'A1 evidence task explicitly permitted system Chrome fallback after the evidenced plugin bootstrap failure.',
      },
      route: {
        canonicalRoot: true,
        url: startup.route,
        title: startup.title,
        authoredNewGame: true,
        queryFlags: false,
        hashRoute: false,
        fixturePage: false,
        replacementUi: false,
        alternateAssetMode: false,
        presenter: 'production Band HUD + bandRadio + voiceArbiter + uniqueWrecks',
      },
      startup,
      compressionLedger,
      listeningTour,
      priorityYields: [storyYield, urgentYield],
      canonicalBearing: bearing,
      captures,
      validation: {
        expectedChannels: TUNABLE_BAND_CHANNEL_IDS.length,
        capturedChannels: listeningTour.length,
        expectedFrames: 10,
        capturedFrames: captures.length,
        uniqueScreenshots: new Set(captures.map((entry) => entry.image.file)).size,
        uniqueImageHashes: new Set(captures.map((entry) => entry.image.sha256)).size,
        viewport: VIEWPORT,
        minimumPngBytes: MIN_PNG_BYTES,
        pageErrors,
        consoleErrors,
        httpErrors,
        requestFailures,
      },
      limitations: [
        'Flight time, route traversal, carrier idents, cadence waits, and the deterministic rare-drop sequence are compressed and itemized above.',
        'Every visible tuner chip, channel line, priority floor, audio-bed state, and bearing receipt is produced by the shipped production systems.',
        'The run proves the seven ordinary carriers, story/urgent arbitration, and one canonical bearing; future proximity-only Quiessence/Hush entities remain outside this player-facing A1 tour.',
      ],
    };
    await writeFile(MANIFEST, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`A1 live-browser capture OK: ${listeningTour.length}/7 channels, ${captures.length}/10 frames`);
    console.log(`Evidence: ${MANIFEST}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await probe.close().catch(() => {});
  }
}

await main();
