#!/usr/bin/env node
// Deterministic public-route browser evidence for Depth Program R2.
//
// Boots the canonical game root and enters a real, authored-asset-gated New Game. The fixed-seed
// capture then uses the dev-only window.SF handle to stage travel distance while preserving the
// shipped runtime seams: native rumor carrier -> fuzzy bearing -> scan fix -> salvage completion ->
// named-wreck choice. Every screenshot is a normal player-facing flight/station frame; there are
// no fixture pages, alternate asset modes, or injected replacement UI.

// Outputs:
//   .devshots/depth-program/r2-d01-...-claimed.png (one per authored wreck)
//   .devshots/depth-program/r2-surface-{comms,news,bar}-....png
//   .devshots/depth-program/r2-live-browser-evidence.json

// This is acceptance evidence, not a substitute for normal gameplay traversal time. Page-evaluate
// staging is recorded in the manifest and is limited to the canonical public route + window.SF.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';
import { UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'depth-program');
const MANIFEST = path.join(OUT, 'r2-live-browser-evidence.json');
const CAPTURE_SEED = 48_200;
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const START_TIMEOUT_MS = Number(process.env.SF_R2_CAPTURE_START_TIMEOUT_MS) || 180_000;
const MIN_PNG_BYTES = 20_000;

function systemBrowserPath() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function primarySource(def) {
  const source = def.rumorSources.find((entry) => entry.sourceRef === def.bearingSourceRef);
  assert(source, `${def.programSlot} must have a primary rumor source`);
  return source;
}

function sourceText(sourceRef) {
  const source = FLAVOR_SOURCE_BY_REF[sourceRef];
  assert(source, `missing flavor source ${sourceRef}`);
  const text = (source.lines || [])
    .map((line) => line && line.text)
    .filter((line) => typeof line === 'string' && line.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  assert(text, `flavor source ${sourceRef} must contain authored text`);
  return text;
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function waitForVisible(page, selector, label, timeout = 15_000) {
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
  assert(response && response.ok(), 'canonical game root must return a successful response');
  const current = new URL(page.url());
  const expected = new URL(baseUrl);
  assert.equal(current.origin, expected.origin, 'capture must stay on the owned public origin');
  assert.equal(current.pathname, '/', 'capture must stay on the canonical root path');
  assert.equal(current.search, '', 'capture must not use debug query routes');
  assert.equal(current.hash, '', 'capture must not use hash routes');

  await page.waitForFunction(
    () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry && window.SF.ctx),
    null,
    { timeout: 20_000 },
  );
  await waitForVisible(page, '[data-screen="mainMenu"]', 'main menu', 45_000);

  // Fixed seed is the only difference from the New Game screen's Launch button. It reaches the
  // same canonical `game:new` handler and therefore preserves the authored asset/warmup gates.
  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', {
      seed,
      name: 'R2 Acceptance Pilot',
      shipId: 'ship_kestrel',
      difficulty: 'standard',
    });
  }, CAPTURE_SEED);

  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });

  return page.evaluate(async (seed) => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const { authoredCriticalVisualReadiness, isAuthoredPartLibraryUsable } = await import('/src/render/partsLibrary.js');
    const library = await state.render.authoredPartLibraryReady;
    const critical = authoredCriticalVisualReadiness(state);
    return {
      seed: state.meta && state.meta.seed,
      expectedSeed: seed,
      mode: state.mode,
      playerId: state.playerId,
      playerDefId: player && player.data && player.data.defId,
      currentSectorId: state.world && state.world.currentSectorId,
      releaseAssetMode: true,
      libraryUsable: isAuthoredPartLibraryUsable(library),
      criticalVisuals: critical,
      route: location.href,
    };
  }, CAPTURE_SEED);
}

async function prepareDeterministicCapture(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const unique = sf.registry.get('uniqueWrecks');
    assertRuntime(unique && typeof unique.newGame === 'function', 'uniqueWrecks runtime unavailable');
    unique.newGame();

    state.player.moduleInventory = [];
    state.player.flags = state.player.flags && typeof state.player.flags === 'object'
      ? state.player.flags
      : {};
    state.player.flags.uniqueWrecksVisited = [];
    state.player.cargo.capVolume = 1000;
    state.player.cargo.capMass = 1e9;
    state.player.credits = Math.max(5000, Number(state.player.credits) || 0);
    state.player.targetId = null;
    state.ui.trackedMissionId = null;
    state.nav.waypoint = null;
    if (state.onboarding && typeof state.onboarding === 'object') {
      // Presentation-only staging: prevent the tutorial attention gate from holding the authored
      // comms intercept offscreen. The R2 state machine remains untouched.
      state.onboarding.active = false;
      state.onboarding.finished = true;
    }
    if (state.ui.marketNews && Array.isArray(state.ui.marketNews.log)) state.ui.marketNews.log.length = 0;

    const screens = sf.ctx.screenManager;
    if (screens) {
      screens.closeAll();
      screens.syncVisibility && screens.syncVisibility();
    }
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    sf.bus.emit('mode:changed', { mode: 'flight', previousMode: 'flight', source: 'r2-capture-prepare' });

    // Freeze simulation time while render/UI frames continue. This keeps the six-sim-second named
    // receipt visible until its screenshot has been written and makes the evidence repeatable.
    sf.timeEffects.set('capture:r2', { scale: 0 });
    clearVoiceFloor(sf);
    return {
      mode: state.mode,
      seed: state.meta.seed,
      uniqueStateSchema: state.player.uniqueWrecks && state.player.uniqueWrecks.schemaVersion,
      timeScale: state.timeScale,
      playerId: state.playerId,
    };

    function clearVoiceFloor(runtime) {
      const voice = runtime.registry.get('voiceArbiter');
      if (!voice || !voice.queue || !runtime.helpers.voice) return;
      for (let index = 0; index < 100 && voice.queue.size; index++) runtime.helpers.voice.dismiss();
    }

    function assertRuntime(condition, message) {
      if (!condition) throw new Error(message);
    }
  });
}

async function dismissCards(page, selector, maxPasses) {
  let dismissed = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const entries = page.locator(selector);
    const count = await entries.count();
    if (!count) break;
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
    const promptNames = [
      'recoveryEncounterPrompt',
      'sectorLawPresenter',
      'signalInvestigationPrompt',
      'pirateParleyPrompt',
      'contactHailPrompt',
    ];
    const hiddenPrompts = [];
    for (const name of promptNames) {
      const prompt = comms && comms[name];
      if (prompt && typeof prompt.hide === 'function') {
        prompt.hide();
        hiddenPrompts.push(name);
      }
    }
    if (comms && typeof comms.closeBacklog === 'function') comms.closeBacklog();

    const marketNewsEntriesCleared = state.ui && state.ui.marketNews
      && Array.isArray(state.ui.marketNews.log) ? state.ui.marketNews.log.length : 0;
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

    state.player.targetId = null;
    state.nav.waypoint = null;
    state.ui.trackedMissionId = null;
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    const screens = sf.ctx.screenManager;
    if (screens) {
      screens.closeAll();
      screens.syncVisibility && screens.syncVisibility();
    }
    return { hiddenPrompts, marketNewsEntriesCleared, voiceEntriesCleared };
  });

  // Use the shipped click-to-dismiss behavior so the presenters' own live arrays stay in sync with
  // the DOM. Waiting past both exit animations prevents an outgoing prior card entering the frame.
  const toastsDismissed = await dismissCards(page, '#toasts .sf-toast:not(.sf-toast--out)', 12);
  const commsDismissed = await dismissCards(page, '#sf-comms .sf-comm:not(.sf-comm--out)', 12);
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({
    toastCount: document.querySelectorAll('#toasts .sf-toast').length,
    commsCount: document.querySelectorAll('#sf-comms .sf-comm').length,
    voiceFloorCount: document.querySelectorAll('#alerts .sf-alert--floor').length,
    recoveryVisible: !!document.querySelector('#sf-recovery-encounter:not([hidden])'),
    sectorPostcardVisible: !!document.getElementById('sf-sector-postcard'),
    newsTickerText: (document.getElementById('sf-news-ticker') && document.getElementById('sf-news-ticker').innerText || '')
      .replace(/\s+/g, ' ').trim(),
  }));
  assert.equal(after.toastCount, 0, 'transient reset must clear shipped toasts');
  assert.equal(after.commsCount, 0, 'transient reset must clear live comms cards');
  assert.equal(after.voiceFloorCount, 0, 'transient reset must release the one-voice floor');
  assert.equal(after.recoveryVisible, false, 'transient reset must hide the prior recovery card');
  assert.equal(after.sectorPostcardVisible, false, 'transient reset must hide the prior sector postcard');
  assert.equal(after.newsTickerText, '', 'transient reset must clear the prior market-news ticker');
  return { ...runtime, toastsDismissed, commsDismissed, after };
}

async function presentationSnapshot(page) {
  return page.evaluate(() => {
    const selectors = [
      '#sf-recovery-encounter:not([hidden])',
      '#toasts .sf-toast:not(.sf-toast--out)',
      '#alerts .sf-alert',
      '#sf-comms .sf-comm:not(.sf-comm--out)',
      '#sf-sector-postcard',
      '#sf-news-ticker',
      '#sf-sector-law:not([hidden])',
      '#sf-signal-investigation:not([hidden])',
      '#sf-pirate-parley:not([hidden])',
      '#sf-contact-hail:not([hidden])',
    ];
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.hidden && style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const regions = [];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (!isVisible(el)) continue;
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) regions.push({ selector, text });
      }
    }
    return {
      regions,
      visibleText: regions.map((entry) => entry.text).join(' | '),
    };
  });
}

async function beginWreck(page, def, source, { deferBarUi = false } = {}) {
  const text = sourceText(source.sourceRef);
  return page.evaluate(async ({ wreckId, sectorId, sourceRef, channelId, text, deferBarUi }) => {
    const sf = window.SF;
    const state = sf.state;
    const bus = sf.bus;
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') throw new Error('world.enterSector unavailable');
    clearVoiceFloor(sf);
    state.nav.waypoint = null;
    state.ui.trackedMissionId = null;

    // Canonical sector membership + public sector:enter. D2 and D6 intentionally publish their
    // native intercept/news rumor from this shipped entry handler.
    world.enterSector(sectorId, { placePlayer: true, fromSectorId: state.world.currentSectorId });
    let record = state.player.uniqueWrecks && state.player.uniqueWrecks.bearings[wreckId];
    let rumorPath = record ? 'sector-entry-native' : 'carrier-event-native';
    if (!record && !(deferBarUi && channelId === 'bar')) {
      const eventByChannel = {
        news: 'news:publish',
        comms_intercept: 'comms:popup',
        bark: 'barkDirector:voice',
        mission: 'mission:accepted',
        campaign: 'story:beatAdvanced',
        loss_investigation: 'lossInvestigation:authoredRead',
        bar: 'uniqueWreck:rumorHeard',
      };
      const event = eventByChannel[channelId];
      if (!event) throw new Error(`unsupported rumor channel ${channelId}`);
      const payload = {
        wreckId,
        authoredWreckId: wreckId,
        sectorId,
        sourceRef,
        channelId,
        text,
        headline: text,
        sender: senderFor(channelId),
        kind: 'wreck_rumor',
        followup: false,
        receiptId: `depth-r2:capture:${wreckId}:first-read`,
      };
      bus.emit(event, payload);
      record = state.player.uniqueWrecks && state.player.uniqueWrecks.bearings[wreckId];
    }
    if (!record && deferBarUi && channelId === 'bar') {
      return {
        rumorPath: 'bar-ui-deferred',
        sourceRef,
        channelId,
        phase: null,
        sectorId,
        radius: null,
        bearingCenter: null,
        exactPos: null,
        sourceText: text,
      };
    }
    if (!record) throw new Error(`${wreckId} rumor did not create a bearing`);

    // Let the one-voice presenter surface news immediately even though capture time is frozen.
    const voice = sf.registry.get('voiceArbiter');
    if (voice && typeof voice.update === 'function') voice.update(0, state);
    return {
      rumorPath,
      sourceRef,
      channelId,
      phase: record.phase,
      sectorId: record.sectorId,
      radius: record.radius,
      bearingCenter: { ...record.bearingCenter },
      exactPos: { ...record.exactPos },
      sourceText: text,
    };

    function senderFor(channel) {
      if (channel === 'news') return 'RECOVERY DESK';
      if (channel === 'comms_intercept') return 'QUIET CUT-LANE INTERCEPT';
      if (channel === 'bar') return 'BAR RUMOR';
      if (channel === 'campaign') return 'CAMPAIGN THREAD';
      if (channel === 'loss_investigation') return 'LOSS INVESTIGATION';
      if (channel === 'mission') return 'MISSION CLIENT';
      return 'UNKNOWN SIGNAL';
    }

    function clearVoiceFloor(runtime) {
      const voice = runtime.registry.get('voiceArbiter');
      if (!voice || !voice.queue || !runtime.helpers.voice) return;
      for (let index = 0; index < 100 && voice.queue.size; index++) runtime.helpers.voice.dismiss();
    }
  }, {
    wreckId: def.id,
    sectorId: def.sectorId,
    sourceRef: source.sourceRef,
    channelId: source.channelId,
    text,
    deferBarUi,
  });
}

async function surfaceD11ThroughBar(page, def, source) {
  const result = await page.evaluate(({ wreckId, stationId }) => {
    const sf = window.SF;
    const state = sf.state;
    state.ui.docked = true;
    state.ui.dockedStationId = stationId;
    state.ui.activeStationTab = 'bar';
    sf.bus.emit('dock:docked', { stationId, source: 'r2-capture' });
    const screens = sf.ctx.screenManager;
    screens.closeAll();
    screens.pushScreen('station');
    screens.syncVisibility && screens.syncVisibility();
    return {
      top: screens.top(),
      dockedStationId: state.ui.dockedStationId,
      hasBearing: !!(state.player.uniqueWrecks && state.player.uniqueWrecks.bearings[wreckId]),
    };
  }, { wreckId: def.id, stationId: 'station_helios' });
  assert.equal(result.top, 'station', 'D11 Bar capture must open the shipped station screen');
  await waitForVisible(page, '.st-bar', 'station Bar');

  const click = await page.evaluate((wreckId) => {
    const bearing = () => window.SF.state.player.uniqueWrecks
      && window.SF.state.player.uniqueWrecks.bearings[wreckId];
    const buttons = [...document.querySelectorAll('.st-bar [data-choice="rumors"]')];
    const attempts = [];
    for (const button of buttons) {
      const card = button.closest('[data-contact]');
      attempts.push(card && card.getAttribute('data-contact'));
      button.click();
      if (bearing()) {
        const reply = card && card.querySelector('.st-bar-reply');
        return {
          ok: true,
          contactId: card && card.getAttribute('data-contact'),
          reply: reply && reply.textContent.replace(/\s+/g, ' ').trim(),
          attempts,
        };
      }
    }
    return { ok: false, attempts, buttonCount: buttons.length };
  }, def.id);
  assert.equal(click.ok, true, `D11 Bar rumor must be reachable: ${JSON.stringify(click)}`);
  assert.match(click.reply || '', /Silver-Draft/i, 'D11 Bar reply must name Silver-Draft');
  await page.waitForTimeout(120);

  const file = path.join(OUT, 'r2-surface-bar-d11-silver-draft.png');
  await page.screenshot({ path: file, type: 'png' });
  const image = await validatePng(file);

  await page.evaluate(() => {
    const sf = window.SF;
    sf.state.ui.docked = false;
    sf.state.ui.dockedStationId = null;
    const screens = sf.ctx.screenManager;
    screens.closeAll();
    screens.syncVisibility && screens.syncVisibility();
    sf.bus.emit('mode:changed', { mode: 'flight', previousMode: 'flight', source: 'r2-capture-undock' });
  });
  return {
    kind: 'bar',
    sourceRef: source.sourceRef,
    screenshot: relative(file),
    image,
    contactId: click.contactId,
    reply: click.reply,
    assertions: {
      shippedStationScreenVisible: true,
      barRumorButtonCreatedBearing: true,
      authoredSilverDraftReplyVisible: true,
    },
  };
}

async function captureNativeSurface(page, kind, def, source) {
  const selector = kind === 'comms' ? '#sf-comms .sf-comm--in' : '#alerts .sf-alert--floor';
  await waitForVisible(page, selector, `${kind} rumor surface`, 10_000);
  const visibleText = await page.locator(selector).first().innerText();
  // The shipped intercept copy says "Ironsing" while the registry name is "Ironsong". Preserve
  // that source verbatim in this evidence lane and accept either spelling here.
  const expectedToken = def.programSlot === 'D2' ? /Iron(?:sing|song)/i : /Tideline|Gulf|fed/i;
  assert.match(visibleText, expectedToken, `${kind} surface must visibly carry the authored rumor`);
  const file = path.join(OUT, `r2-surface-${kind}-${def.programSlot.toLowerCase()}-${slug(def.name)}.png`);
  await page.screenshot({ path: file, type: 'png' });
  return {
    kind,
    sourceRef: source.sourceRef,
    screenshot: relative(file),
    image: await validatePng(file),
    visibleText: visibleText.replace(/\s+/g, ' ').trim(),
    assertions: {
      nativeSurfaceVisible: true,
      authoredRumorTokenVisible: true,
    },
  };
}

async function settleAndCaptureWreck(page, def, source, rumor, priorReceipts) {
  const staged = await page.evaluate(async ({ wreckId, scanRequirement }) => {
    const sf = window.SF;
    const state = sf.state;
    const bus = sf.bus;
    const record = state.player.uniqueWrecks && state.player.uniqueWrecks.bearings[wreckId];
    if (!record || record.phase !== 'rumored') throw new Error(`${wreckId} did not begin as a fuzzy rumor`);
    const trail = [record.phase];

    if (scanRequirement && !(state.player.moduleInventory || []).some((item) => item && item.defId === scanRequirement)) {
      state.player.moduleInventory.push({
        instanceId: `r2-capture:${wreckId}:${scanRequirement}`,
        defId: scanRequirement,
      });
    }

    const [{ movingRadiationGate }, { uniqueWreckById }] = await Promise.all([
      import('/src/core/uniqueWreckComplications.js'),
      import('/src/data/uniqueWrecks.js'),
    ]);
    const def = uniqueWreckById(wreckId);
    if (!def) throw new Error(`${wreckId} definition missing in browser runtime`);
    for (let simTime = 0; simTime <= 900; simTime += 1) {
      state.simTime = simTime;
      if (movingRadiationGate(state, record, def).allowed) break;
    }

    // Reach the named signal in normal galactic-global space and keep it inside the live camera.
    const player = state.entities.get(state.playerId);
    if (!player) throw new Error('capture player missing');
    player.pos.set(record.exactPos.x - 82, 0, record.exactPos.z + 58);
    player.prevPos.copy(player.pos);
    player.vel.set(0, 0, 0);
    state.nav.waypoint = { x: record.exactPos.x, z: record.exactPos.z, label: record.name };

    bus.emit('scan:pulse', { pos: { ...record.exactPos }, source: 'r2-capture' });
    if (record.phase !== 'fixed') throw new Error(`${wreckId} scan did not fix the bearing`);
    trail.push(record.phase);
    // A real travel-and-scan cadence naturally dismisses the five-second sector-law entry card
    // before recovery. Compressed capture staging must exercise that shipped dismissal seam too,
    // otherwise it manufactures an overlay collision that normal play would not show.
    bus.emit('signal:scanResults', { wreckId, source: 'r2-capture', results: [] });

    const wreck = state.entityList.find((entity) => entity && entity.alive !== false
      && entity.data && entity.data.uniqueWreckId === wreckId);
    if (!wreck) throw new Error(`${wreckId} did not materialize`);
    const distance = Math.hypot(wreck.pos.x - player.pos.x, wreck.pos.z - player.pos.z);
    state.player.targetId = wreck.id;
    bus.emit('salvage:completed', { wreckId: wreck.id, loot: {}, source: 'r2-capture' });
    if (record.phase !== 'decision') throw new Error(`${wreckId} salvage did not open a decision`);
    trail.push(record.phase);

    const choice = def.decision.choices.find((entry) => entry.uniqueDrop);
    if (!choice) throw new Error(`${wreckId} has no unique claim branch`);
    bus.emit('uniqueWreck:choose', { wreckId, choiceId: choice.id, source: 'r2-capture' });
    if (record.phase !== 'salvaged') throw new Error(`${wreckId} claim did not settle`);
    trail.push(record.phase);

    // Resolution publishes follow-up news. Keep the receipt card on top by clearing the voice floor;
    // the named toast and target panel remain normal shipped UI.
    const voice = sf.registry.get('voiceArbiter');
    if (voice && typeof voice.update === 'function') voice.update(0, state);
    return {
      phaseTrail: trail,
      finalPhase: record.phase,
      reached: {
        sectorId: state.world.currentSectorId,
        playerPos: { x: player.pos.x, z: player.pos.z },
        wreckPos: { x: wreck.pos.x, z: wreck.pos.z },
        distanceWU: Math.round(distance * 10) / 10,
        wreckEntityId: wreck.id,
        targetId: state.player.targetId,
      },
      bearing: {
        coordSpace: record.coordSpace,
        radius: record.radius,
        fixedPos: { ...record.fixedPos },
      },
      choiceId: choice.id,
      grants: {
        uniqueDropId: record.rewardReceipt && record.rewardReceipt.uniqueDropId,
        uniqueDropIds: record.rewardReceipt && [...record.rewardReceipt.uniqueDropIds] || [],
        storyRewardIds: record.rewardReceipt && [...record.rewardReceipt.storyRewardIds] || [],
        cargo: record.rewardReceipt && { ...record.rewardReceipt.cargo } || {},
      },
      receipt: record.rewardReceipt ? JSON.parse(JSON.stringify(record.rewardReceipt)) : null,
      sectorLawHidden: !document.getElementById('sf-sector-law')
        || document.getElementById('sf-sector-law').hidden,
      receiptDom: document.getElementById('sf-recovery-encounter')
        && document.getElementById('sf-recovery-encounter').textContent.replace(/\s+/g, ' ').trim(),
    };
  }, { wreckId: def.id, scanRequirement: def.scanRequirement || null });

  assert.deepEqual(staged.phaseTrail, ['rumored', 'fixed', 'decision', 'salvaged'], `${def.programSlot} phase trail`);
  assert.equal(staged.reached.sectorId, def.sectorId, `${def.programSlot} must be reached in its authored sector`);
  assert(staged.reached.distanceWU <= 110, `${def.programSlot} player must physically reach the wreck`);
  assert(staged.receipt, `${def.programSlot} must produce a durable receipt`);
  assert.equal(staged.sectorLawHidden, true,
    `${def.programSlot} final receipt must not be obscured by compressed sector-entry evidence`);
  assert(staged.receipt.uniqueDropId || staged.receipt.storyRewardIds.length,
    `${def.programSlot} must grant its singular claim reward`);

  // Hardware claims may carry an authored negative standing consequence, which deliberately uses
  // the red `sf-recovery--failed` treatment even though the exact-once claim itself succeeded.
  await waitForVisible(page, '#sf-recovery-encounter:not([hidden])', `${def.programSlot} named receipt`);
  const receiptText = (await page.locator('#sf-recovery-encounter').innerText()).replace(/\s+/g, ' ').trim();
  assert(receiptText.includes(staged.receipt.title), `${def.programSlot} screenshot must show its receipt title`);
  const receiptActionsHidden = await page.locator('#sf-recovery-encounter [data-k="actions"]').evaluate((element) => (
    element.hidden && getComputedStyle(element).display === 'none'
  ));
  assert.equal(receiptActionsHidden, true, `${def.programSlot} settled receipt must hide obsolete choice buttons`);
  const receiptClass = await page.locator('#sf-recovery-encounter').getAttribute('class');
  await page.waitForTimeout(180);

  const presentation = await presentationSnapshot(page);
  const normalizedPresentation = presentation.visibleText.toLocaleLowerCase('en-US');
  const currentReceiptTitleVisible = normalizedPresentation.includes(
    String(staged.receipt.title || '').toLocaleLowerCase('en-US'),
  );
  const priorReceiptTitlesPresent = priorReceipts
    .map((entry) => entry.title)
    .filter((token) => token && normalizedPresentation.includes(String(token).toLocaleLowerCase('en-US')));
  const priorReceiptDetailsPresent = priorReceipts
    .map((entry) => entry.detail)
    .filter((token) => token && normalizedPresentation.includes(String(token).toLocaleLowerCase('en-US')));
  assert.equal(currentReceiptTitleVisible, true, `${def.programSlot} visible presentation must name its current receipt`);
  assert.deepEqual(priorReceiptTitlesPresent, [], `${def.programSlot} must not show a prior receipt title`);
  assert.deepEqual(priorReceiptDetailsPresent, [], `${def.programSlot} must not show a prior receipt detail`);
  const presentationAssertions = {
    currentReceiptTitleVisible,
    priorReceiptTitlesAbsent: priorReceiptTitlesPresent.length === 0,
    priorReceiptDetailsAbsent: priorReceiptDetailsPresent.length === 0,
    receiptActionsHidden,
    sectorLawHidden: staged.sectorLawHidden,
    forbiddenPriorReceiptCount: priorReceipts.length,
    priorReceiptTitlesPresent,
    priorReceiptDetailsPresent,
    regions: presentation.regions,
  };

  const file = path.join(OUT, `r2-${def.programSlot.toLowerCase()}-${slug(def.name)}-claimed.png`);
  await page.screenshot({ path: file, type: 'png' });
  return {
    slot: def.programSlot,
    wreckId: def.id,
    name: def.name,
    sectorId: def.sectorId,
    rumor,
    ...staged,
    receiptText,
    receiptClass,
    presentationAssertions,
    screenshot: relative(file),
    image: await validatePng(file),
  };
}

async function validatePng(file) {
  const info = await stat(file);
  assert(info.isFile(), `${relative(file)} must be a file`);
  assert(info.size >= MIN_PNG_BYTES, `${relative(file)} is too small to be meaningful (${info.size} bytes)`);
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative(file)} must be PNG`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(width, VIEWPORT.width, `${relative(file)} width`);
  assert.equal(height, VIEWPORT.height, `${relative(file)} height`);
  return { bytes: info.size, width, height };
}

async function main() {
  assert.equal(UNIQUE_WRECKS.length, 12, 'R2 live capture remains a twelve-wreck contract');
  await mkdir(OUT, { recursive: true });
  const executablePath = systemBrowserPath();
  assert(executablePath, 'Chrome or Edge is required for the live R2 capture');
  const probe = await acquireVisualProbeServer({ root: ROOT });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  try {
    const startup = await bootCanonicalFlight(page, probe.baseUrl);
    assert.equal(startup.seed, CAPTURE_SEED, 'canonical New Game must use the fixed capture seed');
    assert.equal(startup.mode, 'flight', 'canonical asset-gated launch must reach flight');
    assert.equal(startup.libraryUsable, true, 'authored part library must be usable');
    assert.equal(startup.criticalVisuals.ready, true, 'critical player/starting-hub visuals must be authored');
    const staging = await prepareDeterministicCapture(page);

    const rows = [];
    const surfaces = [];
    for (const def of UNIQUE_WRECKS) {
      const transientReset = await resetTransientPresentation(page);
      const source = primarySource(def);
      const rumor = await beginWreck(page, def, source, { deferBarUi: def.programSlot === 'D11' });

      if (def.programSlot === 'D2') {
        surfaces.push(await captureNativeSurface(page, 'comms', def, source));
      } else if (def.programSlot === 'D6') {
        surfaces.push(await captureNativeSurface(page, 'news', def, source));
      } else if (def.programSlot === 'D11') {
        // Re-run D11 from a clean unique-wreck state because its actual station Bar click is the
        // evidence. The initial direct carrier above deliberately has not fired for bar sources.
        surfaces.push(await surfaceD11ThroughBar(page, def, source));
      }

      const liveRumor = await page.evaluate((wreckId) => {
        const record = window.SF.state.player.uniqueWrecks
          && window.SF.state.player.uniqueWrecks.bearings[wreckId];
        return record && {
          phase: record.phase,
          sourceRef: record.sourceRef,
          channelId: record.channelId,
          radius: record.radius,
          exactPos: { ...record.exactPos },
        };
      }, def.id);
      assert(liveRumor, `${def.programSlot} live rumor missing before salvage`);
      assert.equal(liveRumor.sourceRef, source.sourceRef, `${def.programSlot} source ref`);
      assert.equal(liveRumor.channelId, source.channelId, `${def.programSlot} source channel`);
      const priorReceipts = rows.map((row) => ({
        title: row.receipt && row.receipt.title,
        detail: row.receipt && row.receipt.detail,
      }));
      rows.push(await settleAndCaptureWreck(
        page,
        def,
        source,
        { ...rumor, ...liveRumor, transientReset },
        priorReceipts,
      ));
      console.log(`[R2] ${def.programSlot}/12 captured: ${def.name}`);
    }

    assert.equal(rows.length, 12, 'one live row per R2 wreck');
    assert.equal(new Set(rows.map((row) => row.screenshot)).size, 12, 'every wreck must have a unique screenshot');
    assert.equal(rows.every((row) => row.finalPhase === 'salvaged'), true, 'all wrecks must finish salvaged');
    assert.deepEqual([...new Set(surfaces.map((entry) => entry.kind))].sort(), ['bar', 'comms', 'news'],
      'live surface set must cover Bar, comms, and news');
    assert.deepEqual(pageErrors, [], `public route must have no page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `public route must have no console errors: ${consoleErrors.join('\n')}`);
    const semanticIsolation = {
      everyCurrentReceiptTitleVisible: rows.every((row) => row.presentationAssertions.currentReceiptTitleVisible),
      everyPriorReceiptTitleAbsent: rows.every((row) => row.presentationAssertions.priorReceiptTitlesAbsent),
      everyPriorReceiptDetailAbsent: rows.every((row) => row.presentationAssertions.priorReceiptDetailsAbsent),
      everySettledReceiptHidesActions: rows.every((row) => row.presentationAssertions.receiptActionsHidden),
      everyFinalReceiptClearsSectorLaw: rows.every((row) => row.presentationAssertions.sectorLawHidden),
      transientResetBetweenEveryCase: rows.every((row) => {
        const after = row.rumor && row.rumor.transientReset && row.rumor.transientReset.after;
        return after && after.toastCount === 0 && after.commsCount === 0
          && after.voiceFloorCount === 0 && !after.recoveryVisible
          && !after.sectorPostcardVisible && after.newsTickerText === '';
      }),
    };
    assert.equal(Object.values(semanticIsolation).every(Boolean), true,
      `every claim frame must be semantically isolated: ${JSON.stringify(semanticIsolation)}`);

    const evidence = {
      schema: 'spaceface.depthProgram.r2LiveBrowserEvidence.v1',
      program: 'SpaceFace Depth Program R2',
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
      staging: {
        ...staging,
        method: 'canonical game:new plus window.SF travel-distance staging',
        simulationFrozenDuringCapture: true,
        tutorialAttentionGateDisabledForCommsVisibility: true,
        introCinematicMarkedSeen: true,
      },
      surfaces,
      count: rows.length,
      rows,
      validation: {
        viewport: VIEWPORT,
        minimumPngBytes: MIN_PNG_BYTES,
        everyImageNontrivial: true,
        semanticIsolation,
        pageErrors,
        consoleErrors,
      },
      limitations: [
        'Travel time and salvage hold duration are compressed through window.SF on the normal public route.',
        'Screenshots prove the shipped browser UI, authored startup gate, R2 carrier/state/reward seams, and player-facing receipts; they are not an unassisted twelve-route playtime recording.',
      ],
    };
    await writeFile(MANIFEST, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`R2 live-browser capture OK: ${rows.length}/12 claimed; surfaces=${surfaces.map((entry) => entry.kind).join(',')}`);
    console.log(`Evidence: ${MANIFEST}`);
  } finally {
    await browser.close().catch(() => {});
    await probe.close().catch(() => {});
  }
}

await main();
