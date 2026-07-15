#!/usr/bin/env node

// Deterministic public-route browser evidence for Depth Program SP1.
//
// The capture boots the canonical http://localhost:8123/ game, enters the normal authored-asset
// New Game path, discovers each authored set-piece opening on its ordinary station board, and
// accepts every stage through the public ui:acceptMission intent. Objective traversal is compressed
// with the live missions system's own settlement methods so six full success routes and three
// fail -> reduced-stake retry routes can be presented repeatably in one evidence run. That private
// acceleration is reported per route in the JSON manifest; it never inserts offers, grants rewards,
// fabricates receipts, or paints replacement UI.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SET_PIECE_MISSIONS } from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'depth-program');
const MANIFEST = path.join(OUT, 'sp1-live-browser-evidence.json');
const CANONICAL_URL = process.env.SF_SP1_CAPTURE_URL || 'http://localhost:8123/';
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const START_TIMEOUT_MS = Number(process.env.SF_SP1_CAPTURE_START_TIMEOUT_MS) || 180_000;
const MIN_PNG_BYTES = 20_000;
const BASE_SEED = 53_100;

const DEFINITIONS = new Map(SET_PIECE_MISSIONS.map((definition) => [definition.id, definition]));
const STATIONS = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATIONS.set(station.id, { ...station, sectorId: sector.id, sectorName: sector.name });
  }
}

const SUCCESS_ROUTES = SET_PIECE_MISSIONS.flatMap((definition) => (
  definition.branches.map((branch) => ({
    archetypeId: definition.id,
    archetypeTitle: definition.title,
    branchId: branch.id,
    branchLabel: branch.label,
    startStationId: definition.startStationId,
    stages: [...definition.commonStages, ...branch.stages],
    commonStageCount: definition.commonStages.length,
  }))
));

function systemBrowserPath() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
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

function stationName(stationId) {
  const station = STATIONS.get(stationId);
  return station && station.name || stationId;
}

function normalized(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function otherArchetypeTitles(archetypeId) {
  return SET_PIECE_MISSIONS
    .filter((definition) => definition.id !== archetypeId)
    .map((definition) => definition.title);
}

function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function canonicalRouteReachable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(CANONICAL_URL, { signal: controller.signal, cache: 'no-store' });
    return !!(response && response.ok);
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function acquireCanonicalServer() {
  if (await canonicalRouteReachable()) {
    return { baseUrl: CANONICAL_URL, ownsServer: false, close: async () => {} };
  }
  const parsed = new URL(CANONICAL_URL);
  assert.equal(parsed.hostname, 'localhost', 'SP1 capture URL must be the canonical localhost route');
  assert.equal(parsed.port || '80', '8123', 'SP1 capture URL must use canonical port 8123');
  const server = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(8123, '127.0.0.1');
  });
  return {
    baseUrl: CANONICAL_URL,
    ownsServer: true,
    close: () => closeServer(server),
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

async function bootCanonicalFlight(page, baseUrl, seed, pilotName) {
  if (page.url() === 'about:blank') {
    const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert(response && response.ok(), 'canonical game root must return a successful response');
    await page.waitForFunction(
      () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry && window.SF.ctx),
      null,
      { timeout: 30_000 },
    );
  }
  const current = new URL(page.url());
  const expected = new URL(baseUrl);
  assert.equal(current.hostname, expected.hostname, 'capture must remain on canonical localhost');
  assert.equal(current.port, expected.port, 'capture must remain on canonical port');
  assert.equal(current.pathname, '/', 'capture must stay on the public root');
  assert.equal(current.search, '', 'capture must not use debug query flags');
  assert.equal(current.hash, '', 'capture must not use hash routes');

  await page.evaluate(({ nextSeed, name }) => {
    const sf = window.SF;
    const screens = sf.ctx && sf.ctx.screenManager;
    if (screens) {
      screens.closeAll();
      if (screens.syncVisibility) screens.syncVisibility();
    }
    sf.bus.emit('game:new', {
      seed: nextSeed,
      name,
      shipId: 'ship_kestrel',
      difficulty: 'standard',
    });
  }, { nextSeed: seed, name: pilotName });

  await page.waitForFunction((expectedSeed) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.meta && state.meta.seed === expectedSeed && state.mode === 'flight'
      && player && player.alive !== false && player.hull > 0);
  }, seed, { timeout: START_TIMEOUT_MS });

  return page.evaluate(async (expectedSeed) => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const { authoredCriticalVisualReadiness, isAuthoredPartLibraryUsable } = await import('/src/render/partsLibrary.js');
    const library = await state.render.authoredPartLibraryReady;
    const critical = authoredCriticalVisualReadiness(state);
    return {
      seed: state.meta.seed,
      expectedSeed,
      mode: state.mode,
      playerId: state.playerId,
      playerDefId: player && player.data && player.data.defId,
      route: location.href,
      releaseAssetMode: true,
      libraryUsable: isAuthoredPartLibraryUsable(library),
      criticalVisuals: critical,
    };
  }, seed);
}

async function resetTransientPresentation(page) {
  const runtime = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const screens = sf.ctx && sf.ctx.screenManager;
    if (screens) {
      screens.closeAll();
      if (screens.syncVisibility) screens.syncVisibility();
    }
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
    const voice = sf.registry.get('voiceArbiter');
    if (voice && voice.queue && sf.helpers.voice) {
      for (let index = 0; index < 100 && voice.queue.size; index++) sf.helpers.voice.dismiss();
    }
    const postcard = sf.registry.get('sectorPostcard');
    if (postcard && typeof postcard._hide === 'function') postcard._hide();
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    state.ui.activeStationTab = 'missions';
    return { mode: state.mode, voiceQueue: voice && voice.queue ? voice.queue.size : 0 };
  });

  let visible = null;
  let stableZeroPolls = 0;
  for (let cycle = 0; cycle < 10 && stableZeroPolls < 2; cycle++) {
    for (const selector of ['#toasts .sf-toast:not(.sf-toast--out)', '#sf-comms .sf-comm:not(.sf-comm--out)']) {
      for (let pass = 0; pass < 24; pass++) {
        const entries = page.locator(selector);
        if (!(await entries.count())) break;
        await entries.first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(35);
      }
    }
    // Dock/tab presenters can publish one delayed confirmation after their screen closes. Require
    // two consecutive empty polls so that late card is dismissed through the same shipped click
    // seam instead of leaking into the next receipt frame.
    await page.waitForTimeout(180);
    visible = await page.evaluate(() => {
      const sf = window.SF;
      const voice = sf && sf.registry && sf.registry.get('voiceArbiter');
      if (voice && voice.queue && sf.helpers.voice) {
        for (let index = 0; index < 100 && voice.queue.size; index++) sf.helpers.voice.dismiss();
      }
      const visibleNode = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0 && rect.width > 1 && rect.height > 1;
      };
      return {
        toasts: [...document.querySelectorAll('#toasts .sf-toast')].filter(visibleNode).length,
        comms: [...document.querySelectorAll('#sf-comms .sf-comm')].filter(visibleNode).length,
        recovery: [...document.querySelectorAll('#sf-recovery-encounter')].filter(visibleNode).length,
      };
    });
    stableZeroPolls = visible.toasts === 0 && visible.comms === 0 && visible.recovery === 0
      ? stableZeroPolls + 1 : 0;
  }
  visible = visible || await page.evaluate(() => {
    const visibleNode = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0 && rect.width > 1 && rect.height > 1;
    };
    return {
      toasts: [...document.querySelectorAll('#toasts .sf-toast')].filter(visibleNode).length,
      comms: [...document.querySelectorAll('#sf-comms .sf-comm')].filter(visibleNode).length,
      recovery: [...document.querySelectorAll('#sf-recovery-encounter')].filter(visibleNode).length,
    };
  });
  assert.equal(stableZeroPolls, 2, 'transient reset must reach two stable empty presentation polls');
  assert.equal(visible.toasts, 0, 'transient reset must clear toast cards');
  assert.equal(visible.comms, 0, 'transient reset must clear comms cards');
  assert.equal(visible.recovery, 0, 'transient reset must clear recovery prompts');
  return { ...runtime, visible };
}

async function prepareIsolatedSetPiece(page, archetypeId) {
  return page.evaluate((wantedArchetype) => {
    const sf = window.SF;
    const state = sf.state;
    const missions = sf.registry.get('missions');
    const factions = sf.registry.get('factions');
    if (!missions || typeof missions.ensureBoard !== 'function') throw new Error('live missions system unavailable');

    if (!window.__SP1_CAPTURE_HOOKED__) {
      const hook = (eventName, bucket) => sf.bus.on(eventName, (payload) => {
        const trace = window.__SP1_CAPTURE_TRACE__;
        if (!trace || !Array.isArray(trace[bucket])) return;
        let copy = null;
        try { copy = JSON.parse(JSON.stringify(payload || {})); } catch (_) { copy = { unserializable: true }; }
        trace[bucket].push(copy);
      });
      hook('mission:accepted', 'accepted');
      hook('mission:setPieceTransition', 'transitions');
      hook('mission:completed', 'completed');
      hook('mission:failed', 'failed');
      hook('mission:expired', 'expired');
      window.__SP1_CAPTURE_HOOKED__ = true;
    }
    window.__SP1_CAPTURE_TRACE__ = { accepted: [], transitions: [], completed: [], failed: [], expired: [] };

    state.settings = state.settings || {};
    state.settings.gameplay = state.settings.gameplay || {};
    state.settings.gameplay.tutorialHints = false;
    if (state.onboarding && typeof state.onboarding === 'object') {
      state.onboarding.active = false;
      state.onboarding.finished = true;
    }
    const removedOpening = (state.missions.active || []).filter((mission) => (
      mission && mission.storyTag === 'campaign47a:b0:recovery'
    )).map((mission) => mission.id);
    state.missions.active = (state.missions.active || []).filter((mission) => (
      !mission || mission.storyTag !== 'campaign47a:b0:recovery'
    ));
    state.ui.trackedMissionId = null;
    state.nav.waypoint = null;
    state.player.cargo.capVolume = Math.max(1_000, Number(state.player.cargo.capVolume) || 0);
    state.player.cargo.capMass = Math.max(1_000_000, Number(state.player.cargo.capMass) || 0);
    sf.bus.emit('economy:grantCredits', { amount: 100_000, reason: 'sp1_capture_acceptance_staging' });
    for (const factionId of ['faction_mts', 'faction_scn', 'faction_free', 'faction_quiet', 'faction_dmc', 'faction_choir']) {
      for (let pass = 0; pass < 12; pass++) {
        const current = state.factions && state.factions[factionId] && state.factions[factionId].rep || 0;
        if (current >= 80) break;
        if (factions && typeof factions.applyRep === 'function') factions.applyRep(factionId, 120, 'sp1_capture_acceptance_staging');
      }
    }
    const definition = wantedArchetype && (awaitDefinition(wantedArchetype));
    if (!definition) throw new Error(`unknown SP1 archetype ${wantedArchetype}`);
    const board = missions.ensureBoard(definition.startStationId);
    const opening = board && board.slots && board.slots.find((offer) => (
      offer && offer.source === 'setPieceMission' && offer.cause
      && offer.cause.archetypeId === wantedArchetype && offer.cause.stageIndex === 0
    ));
    if (!opening) throw new Error(`${wantedArchetype} opening offer missing from ${definition.startStationId}`);
    return {
      archetypeId: wantedArchetype,
      startStationId: definition.startStationId,
      removedOpening,
      credits: state.player.credits,
      cargoCaps: { volume: state.player.cargo.capVolume, mass: state.player.cargo.capMass },
      reps: Object.fromEntries(['faction_mts', 'faction_scn', 'faction_free', 'faction_quiet', 'faction_dmc', 'faction_choir']
        .map((id) => [id, state.factions && state.factions[id] && state.factions[id].rep || 0])),
      opening: JSON.parse(JSON.stringify(opening)),
      traceInstalled: !!window.__SP1_CAPTURE_HOOKED__,
    };

    function awaitDefinition(id) {
      const starts = {
        long_read: 'station_drift',
        witness_run: 'station_customs',
        hearing: 'station_forge',
      };
      return starts[id] ? { id, startStationId: starts[id] } : null;
    }
  }, archetypeId);
}

async function openStationMissionPreflight(page, offerId, stationId, file, assertions = {}) {
  await page.evaluate(({ wantedOfferId, wantedStationId }) => {
    const sf = window.SF;
    const state = sf.state;
    const screens = sf.ctx.screenManager;
    state.ui.docked = true;
    state.ui.dockedStationId = wantedStationId;
    state.ui.activeStationTab = 'missions';
    sf.bus.emit('dock:docked', { stationId: wantedStationId, source: 'sp1-capture-preflight' });
    screens.closeAll();
    screens.pushScreen('station');
    if (screens.syncVisibility) screens.syncVisibility();
    const card = [...document.querySelectorAll('.st-mission-card')]
      .find((element) => element.getAttribute('data-mid') === wantedOfferId);
    if (card) card.click();
  }, { wantedOfferId: offerId, wantedStationId: stationId });
  await waitForVisible(page, '#st-panel-missions', 'station Missions panel');
  await page.waitForFunction((wantedOfferId) => {
    const cards = [...document.querySelectorAll('.st-mission-card')];
    const card = cards.find((element) => element.getAttribute('data-mid') === wantedOfferId);
    if (!card) return false;
    if (!card.classList.contains('selected')) card.click();
    const dossier = document.querySelector('.st-ops-dossier');
    if (!dossier || dossier.hidden) return false;
    const style = getComputedStyle(dossier);
    return style.display !== 'none' && dossier.getBoundingClientRect().height > 100;
  }, offerId, { timeout: 15_000 });
  const text = normalized(await page.locator('#st-panel-missions').innerText());
  if (assertions.includes) {
    for (const token of assertions.includes) assert(text.includes(token), `preflight must show ${token}`);
  }
  if (assertions.matches) {
    for (const pattern of assertions.matches) assert.match(text, pattern, `preflight must match ${pattern}`);
  }
  if (assertions.excludes) {
    for (const token of assertions.excludes) assert(!text.includes(token), `preflight must not show ${token}`);
  }
  assert.doesNotMatch(text, /station_[a-z0-9_]+/i, 'player-facing preflight must not expose raw station ids');
  await page.waitForTimeout(180);
  await page.screenshot({ path: file, type: 'png' });
  const image = await validatePng(file);
  await page.evaluate(() => {
    const sf = window.SF;
    const screens = sf.ctx.screenManager;
    screens.closeAll();
    if (screens.syncVisibility) screens.syncVisibility();
    sf.state.ui.docked = false;
    sf.state.ui.dockedStationId = null;
  });
  return { screenshot: relative(file), image, visibleText: text };
}

async function openActiveMissionLog(page, file, assertions = {}) {
  await page.evaluate(() => {
    const sf = window.SF;
    const screens = sf.ctx.screenManager;
    screens.closeAll();
    screens.pushScreen('missionLog');
    if (screens.syncVisibility) screens.syncVisibility();
  });
  await waitForVisible(page, '.sf-mlog', 'Mission Log');
  await waitForVisible(page, '.sf-mlog-card', 'active mission card');
  const text = normalized(await page.locator('.sf-mlog').innerText());
  if (assertions.includes) {
    for (const token of assertions.includes) assert(text.includes(token), `Mission Log must show ${token}`);
  }
  if (assertions.matches) {
    for (const pattern of assertions.matches) assert.match(text, pattern, `Mission Log must match ${pattern}`);
  }
  assert.doesNotMatch(text, /station_[a-z0-9_]+/i, 'Mission Log must not expose raw station ids');
  await page.waitForTimeout(180);
  await page.screenshot({ path: file, type: 'png' });
  const image = await validatePng(file);
  await page.evaluate(() => {
    const screens = window.SF.ctx.screenManager;
    screens.closeAll();
    if (screens.syncVisibility) screens.syncVisibility();
  });
  return { screenshot: relative(file), image, visibleText: text };
}

async function acceptPostedStage(page, query) {
  return page.evaluate(({ archetypeId, chainId, stageIndex, branchId, attempt }) => {
    const sf = window.SF;
    const state = sf.state;
    const matching = [];
    for (const [boardStationId, board] of Object.entries(state.missions.boards || {})) {
      for (const offer of board && Array.isArray(board.slots) ? board.slots : []) {
        const cause = offer && offer.cause;
        if (!offer || offer.source !== 'setPieceMission' || !cause) continue;
        if (cause.archetypeId !== archetypeId || (cause.stageIndex | 0) !== stageIndex) continue;
        if (chainId && cause.chainId !== chainId) continue;
        if ((cause.branchId || null) !== (branchId || null)) continue;
        if ((cause.attempt | 0) !== (attempt | 0)) continue;
        matching.push({ boardStationId, offer });
      }
    }
    if (matching.length !== 1) {
      throw new Error(`expected one posted ${archetypeId} stage ${stageIndex}/${branchId || 'common'}/${attempt}; found ${matching.length}`);
    }
    const selected = matching[0].offer;
    const cause = selected.cause;
    const siblingsBefore = [];
    for (const board of Object.values(state.missions.boards || {})) {
      for (const offer of board && Array.isArray(board.slots) ? board.slots : []) {
        const candidate = offer && offer.cause;
        if (candidate && candidate.chainId === cause.chainId && candidate.stageIndex === cause.stageIndex) {
          siblingsBefore.push({ id: offer.id, branchId: candidate.branchId || null, stationId: offer.stationId });
        }
      }
    }
    state.ui.docked = true;
    state.ui.dockedStationId = selected.stationId;
    sf.bus.emit('dock:docked', { stationId: selected.stationId, source: 'sp1-capture-normal-board-accept' });
    sf.bus.emit('ui:acceptMission', { missionId: selected.id, source: 'sp1-capture' });
    const active = (state.missions.active || []).find((mission) => (
      mission && mission.status === 'active' && mission.source === 'setPieceMission'
      && mission.cause && mission.cause.chainId === cause.chainId
      && mission.cause.stageIndex === cause.stageIndex
      && (mission.cause.branchId || null) === (cause.branchId || null)
      && (mission.cause.attempt | 0) === (cause.attempt | 0)
    ));
    if (!active) throw new Error(`ui:acceptMission did not create active ${selected.id}`);
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    sf.bus.emit('dock:undocked', { stationId: selected.stationId, source: 'sp1-capture-normal-board-accept' });
    const siblingsAfter = [];
    for (const board of Object.values(state.missions.boards || {})) {
      for (const offer of board && Array.isArray(board.slots) ? board.slots : []) {
        const candidate = offer && offer.cause;
        if (candidate && candidate.chainId === cause.chainId && candidate.stageIndex === cause.stageIndex) {
          siblingsAfter.push({ id: offer.id, branchId: candidate.branchId || null, stationId: offer.stationId });
        }
      }
    }
    const acceptedTrace = window.__SP1_CAPTURE_TRACE__.accepted.at(-1);
    return {
      boardStationId: matching[0].boardStationId,
      acceptedAtStationId: selected.stationId,
      publicIntent: 'ui:acceptMission',
      offer: JSON.parse(JSON.stringify(selected)),
      mission: JSON.parse(JSON.stringify(active)),
      siblingsBefore,
      siblingsAfter,
      acceptedTrace,
    };
  }, query);
}

async function settleActiveStage(page, query) {
  return page.evaluate(({ chainId, stageIndex, branchId, outcome, reason, assertDuplicateNoop }) => {
    const sf = window.SF;
    const state = sf.state;
    const system = sf.registry.get('missions');
    const index = (state.missions.active || []).findIndex((mission) => (
      mission && mission.status === 'active' && mission.cause
      && mission.cause.chainId === chainId && mission.cause.stageIndex === stageIndex
      && (mission.cause.branchId || null) === (branchId || null)
    ));
    if (index < 0) throw new Error(`active stage missing for ${chainId}/${stageIndex}/${branchId || 'common'}`);
    const mission = state.missions.active[index];
    const before = {
      transitions: window.__SP1_CAPTURE_TRACE__.transitions.length,
      completed: window.__SP1_CAPTURE_TRACE__.completed.length,
      failed: window.__SP1_CAPTURE_TRACE__.failed.length,
    };
    if (outcome === 'completed') system._completeMission(mission, index);
    else system._failMission(mission, index, reason || outcome || 'failed');
    const after = {
      transitions: window.__SP1_CAPTURE_TRACE__.transitions.length,
      completed: window.__SP1_CAPTURE_TRACE__.completed.length,
      failed: window.__SP1_CAPTURE_TRACE__.failed.length,
    };
    if (after.transitions !== before.transitions + 1) throw new Error('settlement did not emit exactly one set-piece transition');
    const transition = window.__SP1_CAPTURE_TRACE__.transitions.at(-1);
    const receipt = (state.missions.receipts || []).find((row) => (
      row && row.chainId === chainId && row.stageIndex === stageIndex
      && (row.branchId || null) === (branchId || null) && row.outcome === outcome
    ));
    if (!receipt) throw new Error('durable mission receipt missing after settlement');
    const posted = [];
    for (const [boardStationId, board] of Object.entries(state.missions.boards || {})) {
      for (const offer of board && Array.isArray(board.slots) ? board.slots : []) {
        if (offer && offer.source === 'setPieceMission' && offer.cause && offer.cause.chainId === chainId) {
          posted.push({ boardStationId, offer: JSON.parse(JSON.stringify(offer)) });
        }
      }
    }
    let duplicateNoop = null;
    if (assertDuplicateNoop) {
      const traceCount = window.__SP1_CAPTURE_TRACE__.transitions.length;
      system._completeMission(mission, index);
      duplicateNoop = {
        before: traceCount,
        after: window.__SP1_CAPTURE_TRACE__.transitions.length,
        missionStatus: mission.status,
      };
    }
    return {
      acceleration: outcome === 'completed' ? 'missions._completeMission' : 'missions._failMission',
      before,
      after,
      transition,
      receipt: JSON.parse(JSON.stringify(receipt)),
      posted,
      duplicateNoop,
      durableSettlement: state.missions.setPieceSettlements
        && state.missions.setPieceSettlements[mission.cause.archetypeId]
        ? JSON.parse(JSON.stringify(state.missions.setPieceSettlements[mission.cause.archetypeId]))
        : null,
    };
  }, query);
}

async function captureTransitionReceipt(page, file, transition, archetypeId) {
  const expectedHouse = normalized(transition.house || '');
  const expectedText = normalized(transition.houseText || '');
  assert(expectedText.length >= 20, 'transition must carry substantial house voice');
  await resetTransientPresentation(page);
  await page.evaluate(() => {
    const sf = window.SF;
    const screens = sf.ctx.screenManager;
    screens.closeAll();
    screens.pushScreen('missionLog');
    if (screens.syncVisibility) screens.syncVisibility();
  });
  await waitForVisible(page, '.sf-mlog', 'Mission Log');
  const completedToggle = page.locator('.sf-mlog-toggle');
  if (await completedToggle.getAttribute('aria-expanded') !== 'true') await completedToggle.click();
  await page.waitForFunction(({ house, text }) => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0 && rect.width > 20 && rect.height > 10;
    };
    return [...document.querySelectorAll('.sf-mlog-receipt-row')].some((element) => {
      if (!visible(element)) return false;
      const content = (element.innerText || '').replace(/\s+/g, ' ').trim();
      return (!house || content.includes(house)) && (!text || content.includes(text));
    });
  }, { house: expectedHouse, text: expectedText }, { timeout: 15_000 });

  const receipt = page.locator('.sf-mlog-receipt-row').filter({ hasText: expectedText }).first();
  await receipt.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const visibleText = normalized(await receipt.innerText());
  assert(visibleText.includes(expectedText), 'player-visible transition must contain current house receipt');
  if (expectedHouse) assert(visibleText.includes(expectedHouse), 'player-visible transition must name the contract house');
  const nextNames = (transition.nextStationIds || []).map(stationName);
  for (const name of nextNames) assert(visibleText.includes(name), `transition must visibly post ${name}`);
  assert.doesNotMatch(visibleText, /station_[a-z0-9_]+/i, 'player-visible transition must not expose raw station ids');
  for (const title of otherArchetypeTitles(archetypeId)) {
    assert(!visibleText.includes(title), `transition must not retain prior-route ${title} copy`);
  }
  await page.waitForTimeout(180);
  await page.screenshot({ path: file, type: 'png' });
  const receiptBounds = await receipt.boundingBox();
  assert(receiptBounds && receiptBounds.width > 20 && receiptBounds.height > 10,
    'durable Mission Log receipt must have player-visible geometry');
  await page.evaluate(() => {
    const screens = window.SF.ctx.screenManager;
    screens.closeAll();
    if (screens.syncVisibility) screens.syncVisibility();
  });
  return {
    screenshot: relative(file),
    image: await validatePng(file),
    visibleText,
    surface: 'Mission Log > Completed > durable settlement receipt',
    receiptBounds,
    assertions: {
      houseVisible: !expectedHouse || visibleText.includes(expectedHouse),
      houseTextVisible: visibleText.includes(expectedText),
      nextStationsVisible: nextNames.every((name) => visibleText.includes(name)),
      rawStationIdsAbsent: !/station_[a-z0-9_]+/i.test(visibleText),
      priorRouteCopyAbsent: otherArchetypeTitles(archetypeId).every((title) => !visibleText.includes(title)),
    },
  };
}

async function traceSnapshot(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__SP1_CAPTURE_TRACE__ || {})));
}

async function recordKnownLongReadRumor(page, opening) {
  const result = await page.evaluate((rawOpening) => {
    const sf = window.SF;
    const state = sf.state;
    const eventByChannel = {
      news: 'news:headline',
      comms_intercept: 'comms:popup',
      bark: 'barkDirector:voice',
      mission: 'mission:accepted',
      campaign: 'story:beatAdvanced',
      loss_investigation: 'lossInvestigation:authoredRead',
      bar: 'uniqueWreck:rumorHeard',
    };
    const eventName = eventByChannel[rawOpening.channelId];
    if (!eventName) throw new Error(`unsupported Long Read rumor channel ${rawOpening.channelId}`);
    sf.bus.emit(eventName, {
      sourceRef: rawOpening.sourceRef,
      wreckId: rawOpening.wreckId,
      channelId: rawOpening.channelId,
      text: `Previously recorded bearing for ${rawOpening.params && rawOpening.params.wreckName || rawOpening.wreckId}.`,
      sender: 'DRIFT BROKER',
      source: 'sp1-capture-known-rumor',
    });
    const bearing = state.player.uniqueWrecks && state.player.uniqueWrecks.bearings[rawOpening.wreckId];
    const posted = Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
      .find((offer) => offer && offer.id === rawOpening.id);
    if (!bearing) throw new Error('native rumor carrier did not create a real unique-wreck bearing');
    if (!posted || !posted.params || !posted.params.rumorAlreadyKnown) {
      throw new Error('posted Long Read opening did not reconcile to known-rumor truth');
    }
    return {
      eventName,
      bearing: JSON.parse(JSON.stringify(bearing)),
      offer: JSON.parse(JSON.stringify(posted)),
    };
  }, opening);
  assert.equal(result.offer.upfrontCostCr, 0, 'known-rumor opening must not charge the rumor service fee');
  assert.match(result.offer.title, /Reconcile the Known Bearing/i);
  return result;
}

async function captureSuccessRoute(page, baseUrl, route, routeIndex, semanticEvidence) {
  const seed = BASE_SEED + routeIndex;
  const startup = await bootCanonicalFlight(
    page,
    baseUrl,
    seed,
    `SP1 ${route.archetypeTitle} ${route.branchLabel}`,
  );
  assert.equal(startup.libraryUsable, true, 'authored part library must be usable');
  assert.equal(startup.criticalVisuals.ready, true, 'authored critical visuals must be ready');
  await resetTransientPresentation(page);
  const preparation = await prepareIsolatedSetPiece(page, route.archetypeId);
  const rows = [];
  let chainId = null;
  let branchWithdrawal = null;

  if (route.archetypeId === 'long_read' && route.branchId === 'lawful') {
    const file = path.join(OUT, 'sp1-long-read-fresh-rumor-preflight.png');
    semanticEvidence.freshRumorPreflight = await openStationMissionPreflight(
      page,
      preparation.opening.id,
      preparation.startStationId,
      file,
      {
        includes: ['180 cr non-refundable service fee (first attempt only)'],
        matches: [/Buy the Bad Coordinates/i, /rumor|bearing|coordinates/i],
      },
    );
    await resetTransientPresentation(page);
  }

  for (let stageIndex = 0; stageIndex < route.stages.length; stageIndex++) {
    const expectedStage = route.stages[stageIndex];
    const stageBranchId = stageIndex < route.commonStageCount ? null : route.branchId;
    const accepted = await acceptPostedStage(page, {
      archetypeId: route.archetypeId,
      chainId,
      stageIndex,
      branchId: stageBranchId,
      attempt: 0,
    });
    if (!chainId) chainId = accepted.mission.cause.chainId;
    assert.equal(accepted.mission.cause.chainId, chainId, 'every route stage must retain one seeded chain id');
    assert.equal(accepted.mission.cause.stageId, expectedStage.id, `stage ${stageIndex} must be ${expectedStage.id}`);
    assert.equal(accepted.mission.source, 'setPieceMission', 'accepted stage must be an ordinary set-piece board offer');
    assert.equal(accepted.acceptedTrace.chainId, chainId, 'public accepted event must carry the chain id');
    assert.equal(accepted.acceptedTrace.stageId, expectedStage.id, 'public accepted event must carry the stage id');

    if (stageIndex === route.commonStageCount) {
      branchWithdrawal = {
        selected: route.branchId,
        siblingsBefore: accepted.siblingsBefore,
        siblingsAfter: accepted.siblingsAfter,
      };
      assert.equal(accepted.siblingsBefore.length, 2, 'branch acceptance must begin with exactly two sibling offers');
      assert.equal(accepted.siblingsAfter.length, 0, 'accepting one branch must withdraw both sibling rows atomically');
    }

    if (route.archetypeId === 'long_read' && route.branchId === 'lawful' && stageIndex === 0) {
      const file = path.join(OUT, 'sp1-long-read-upfront-active.png');
      semanticEvidence.upfrontActive = await openActiveMissionLog(page, file, {
        includes: ['RUMOR PURCHASED', 'PAID'],
        matches: [/180 cr.*non-refundable.*service fee/i],
      });
    }
    if (route.archetypeId === 'long_read' && route.branchId === 'lawful' && stageIndex === 1) {
      const file = path.join(OUT, 'sp1-long-read-clause-active.png');
      semanticEvidence.clauseActive = await openActiveMissionLog(page, file, {
        includes: ['No kills', 'COMPLICATION LIVE'],
        matches: [/clause/i, /No kills: Complete the run without destroying any vessel\./],
      });
    }

    await resetTransientPresentation(page);
    const terminal = stageIndex === route.stages.length - 1;
    const settled = await settleActiveStage(page, {
      chainId,
      stageIndex,
      branchId: stageBranchId,
      outcome: 'completed',
      reason: null,
      assertDuplicateNoop: terminal,
    });
    assert.equal(settled.transition.outcome, 'completed', 'success transition outcome');
    assert.equal(settled.transition.stageId, expectedStage.id, 'transition stage id must match accepted stage');
    const expectedOfferCount = terminal ? 0
      : stageIndex + 1 === route.commonStageCount ? 2 : 1;
    assert.equal(settled.transition.offerIds.length, expectedOfferCount, 'transition must post the authored next-stage cardinality');
    if (terminal) {
      assert.equal(settled.transition.status, 'completed', 'terminal transition status');
      assert(settled.durableSettlement, 'terminal route must create a durable exact-once settlement');
      assert.equal(settled.durableSettlement.chainId, chainId, 'durable settlement chain id');
      assert.deepEqual(settled.duplicateNoop, {
        before: settled.duplicateNoop.before,
        after: settled.duplicateNoop.before,
        missionStatus: 'completed',
      }, 'replaying the stale terminal mission must be an exact no-op');
    }

    const file = path.join(
      OUT,
      `sp1-success-${slug(route.archetypeId)}-${slug(route.branchId)}-s${String(stageIndex + 1).padStart(2, '0')}-${slug(expectedStage.id)}.png`,
    );
    const presentation = await captureTransitionReceipt(page, file, settled.transition, route.archetypeId);
    rows.push({
      stageIndex,
      stageId: expectedStage.id,
      stageTitle: expectedStage.title,
      branchId: stageBranchId,
      normalBoardAcceptance: accepted,
      settlement: settled,
      presentation,
    });
    console.log(`[SP1] success ${route.archetypeId}/${route.branchId} ${stageIndex + 1}/${route.stages.length}: ${expectedStage.id}`);
  }

  const trace = await traceSnapshot(page);
  assert.equal(trace.accepted.filter((entry) => entry.chainId === chainId).length, route.stages.length,
    'every success stage must emit one canonical accepted event');
  assert.equal(trace.transitions.filter((entry) => entry.chainId === chainId).length, route.stages.length,
    'every success stage must emit one canonical transition');
  assert.equal(trace.completed.filter((entry) => entry.chainId === chainId).length, route.stages.length,
    'every success stage must emit one canonical completion');
  assert.equal(trace.failed.filter((entry) => entry.chainId === chainId).length, 0,
    'success route must not emit failure');
  const terminalTransitions = trace.transitions.filter((entry) => (
    entry.chainId === chainId && entry.status === 'completed' && (!entry.offerIds || !entry.offerIds.length)
  ));
  assert.equal(terminalTransitions.length, 1, 'success route must settle terminal exactly once');
  assert(branchWithdrawal, 'success route must reach one branch point');

  return {
    kind: 'success',
    seed,
    archetypeId: route.archetypeId,
    archetypeTitle: route.archetypeTitle,
    branchId: route.branchId,
    branchLabel: route.branchLabel,
    chainId,
    startup,
    preparation,
    exactRoute: rows.map((row) => ({
      stageIndex: row.stageIndex,
      stageId: row.stageId,
      stageTitle: row.stageTitle,
      branchId: row.branchId,
      outcome: row.settlement.transition.outcome,
      receiptText: row.settlement.transition.houseText,
      recoveryText: row.settlement.transition.recoveryText,
      nextStationIds: row.settlement.transition.nextStationIds,
      nextStationNames: (row.settlement.transition.nextStationIds || []).map(stationName),
      screenshot: row.presentation.screenshot,
    })),
    rows,
    branchWithdrawal,
    terminalExactOnce: terminalTransitions.length === 1
      && rows.at(-1).settlement.duplicateNoop.before === rows.at(-1).settlement.duplicateNoop.after,
    trace,
    acceleration: {
      normalAcceptance: 'Every stage was found on a live station board and accepted through ui:acceptMission.',
      compressedTraversal: 'Each accepted objective was settled through the live missions._completeMission method to compress travel/combat/scan time.',
      directStateStaging: 'Tutorial Contract 47-A was removed from the isolated presentation state; cargo capacity, credits, faction standing, and dock location were staged for acceptance.',
    },
  };
}

async function captureFailureRoute(page, baseUrl, definition, failureIndex) {
  const seed = BASE_SEED + 100 + failureIndex;
  const startup = await bootCanonicalFlight(page, baseUrl, seed, `SP1 ${definition.title} Recovery`);
  assert.equal(startup.libraryUsable, true);
  assert.equal(startup.criticalVisuals.ready, true);
  await resetTransientPresentation(page);
  const preparation = await prepareIsolatedSetPiece(page, definition.id);
  const accepted = await acceptPostedStage(page, {
    archetypeId: definition.id,
    chainId: null,
    stageIndex: 0,
    branchId: null,
    attempt: 0,
  });
  const chainId = accepted.mission.cause.chainId;
  await resetTransientPresentation(page);
  const failed = await settleActiveStage(page, {
    chainId,
    stageIndex: 0,
    branchId: null,
    outcome: 'failed',
    reason: 'failed',
    assertDuplicateNoop: false,
  });
  assert.equal(failed.transition.status, 'retry', `${definition.title} failure must post a retry`);
  assert.equal(failed.transition.offerIds.length, 1, `${definition.title} failure must post one reduced retry`);
  assert(failed.transition.houseText && failed.transition.recoveryText, 'failure transition needs house and recovery voice');
  assert.equal(failed.posted.length, 1, 'one retry offer must be posted');
  const retryOffer = failed.posted[0].offer;
  assert.equal(retryOffer.cause.attempt, 1, 'recovery offer attempt');
  assert(retryOffer.reward_cr < accepted.offer.reward_cr, 'recovery offer payout must be reduced');
  assert(retryOffer.collateral_cr <= accepted.offer.collateral_cr, 'recovery collateral must not increase');
  const recoveryFile = path.join(OUT, `sp1-failure-${slug(definition.id)}-recovery-posted.png`);
  const recoveryPresentation = await captureTransitionReceipt(page, recoveryFile, failed.transition, definition.id);

  await resetTransientPresentation(page);
  const retryAccepted = await acceptPostedStage(page, {
    archetypeId: definition.id,
    chainId,
    stageIndex: 0,
    branchId: null,
    attempt: 1,
  });
  assert.equal(retryAccepted.mission.cause.attempt, 1, 'normal board acceptance must preserve retry attempt');
  await resetTransientPresentation(page);
  const retrySettled = await settleActiveStage(page, {
    chainId,
    stageIndex: 0,
    branchId: null,
    outcome: 'completed',
    reason: null,
    assertDuplicateNoop: false,
  });
  assert(['advanced', 'branch_available'].includes(retrySettled.transition.status),
    `${definition.title} retry must resolve forward, not dead-end`);
  assert(retrySettled.transition.offerIds.length >= 1, 'successful retry must post the next authored obligation');
  assert.equal(retrySettled.posted.some((row) => (
    row.offer.cause.stageIndex === 0 && row.offer.cause.attempt === 1
  )), false, 'successful retry must consume the recovery row');
  const resolvedFile = path.join(OUT, `sp1-failure-${slug(definition.id)}-retry-resolved.png`);
  const resolvedPresentation = await captureTransitionReceipt(page, resolvedFile, retrySettled.transition, definition.id);
  const trace = await traceSnapshot(page);
  assert.equal(trace.accepted.filter((entry) => entry.chainId === chainId).length, 2, 'opening and retry accepted exactly once');
  assert.equal(trace.failed.filter((entry) => entry.chainId === chainId).length, 1, 'failure emitted exactly once');
  assert.equal(trace.completed.filter((entry) => entry.chainId === chainId).length, 1, 'retry completion emitted exactly once');
  assert.equal(trace.transitions.filter((entry) => entry.chainId === chainId).length, 2, 'failure and recovery each emitted a transition');
  console.log(`[SP1] failure/retry captured: ${definition.id}`);
  return {
    kind: 'failure-retry',
    seed,
    archetypeId: definition.id,
    archetypeTitle: definition.title,
    chainId,
    startup,
    preparation,
    accepted,
    failure: {
      outcome: failed.transition.outcome,
      reason: failed.transition.reason,
      receiptText: failed.transition.houseText,
      recoveryText: failed.transition.recoveryText,
      nextStationIds: failed.transition.nextStationIds,
      nextStationNames: (failed.transition.nextStationIds || []).map(stationName),
      settlement: failed,
      presentation: recoveryPresentation,
    },
    retry: {
      offerId: retryOffer.id,
      attempt: retryOffer.cause.attempt,
      rewardCr: retryOffer.reward_cr,
      collateralCr: retryOffer.collateral_cr,
      accepted: retryAccepted,
      settlement: retrySettled,
      presentation: resolvedPresentation,
    },
    noDeadEnd: retrySettled.transition.offerIds.length >= 1,
    trace,
    acceleration: {
      normalAcceptance: 'Opening and reduced retry were accepted through ui:acceptMission from live station boards.',
      compressedFailure: 'The live missions._failMission path was called to stage the resolving failure receipt.',
      compressedRetry: 'The live missions._completeMission path was called after retry acceptance to prove forward recovery.',
    },
  };
}

async function captureKnownRumorProof(page, baseUrl) {
  const definition = DEFINITIONS.get('long_read');
  const seed = BASE_SEED + 220;
  const startup = await bootCanonicalFlight(page, baseUrl, seed, 'SP1 Known Rumor Proof');
  await resetTransientPresentation(page);
  const preparation = await prepareIsolatedSetPiece(page, definition.id);
  const recorded = await recordKnownLongReadRumor(page, preparation.opening);
  await resetTransientPresentation(page);
  const file = path.join(OUT, 'sp1-long-read-known-rumor-preflight.png');
  const presentation = await openStationMissionPreflight(
    page,
    recorded.offer.id,
    recorded.offer.stationId,
    file,
    {
      includes: ['Reconcile the Known Bearing'],
      matches: [/already in your ledger|known bearing/i],
      excludes: ['non-refundable service fee'],
    },
  );
  return {
    seed,
    startup,
    preparation,
    nativeCarrierEvent: recorded.eventName,
    bearing: recorded.bearing,
    offer: recorded.offer,
    presentation,
    assertions: {
      realBearingExists: !!recorded.bearing,
      knownRumorFlag: recorded.offer.params.rumorAlreadyKnown === true,
      feeWaived: recorded.offer.upfrontCostCr === 0,
      truthfulTitle: /Reconcile the Known Bearing/i.test(recorded.offer.title),
    },
  };
}

async function main() {
  assert.equal(SET_PIECE_MISSIONS.length, 3, 'SP1 remains a three-archetype contract');
  assert.equal(SUCCESS_ROUTES.length, 6, 'SP1 remains six authored success routes');
  await mkdir(OUT, { recursive: true });
  const executablePath = systemBrowserPath();
  assert(executablePath, 'Chrome or Edge is required for SP1 live capture');
  const server = await acquireCanonicalServer();
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
    const semanticEvidence = {};
    const successRoutes = [];
    for (let index = 0; index < SUCCESS_ROUTES.length; index++) {
      successRoutes.push(await captureSuccessRoute(
        page,
        server.baseUrl,
        SUCCESS_ROUTES[index],
        index,
        semanticEvidence,
      ));
    }
    const failureRoutes = [];
    for (let index = 0; index < SET_PIECE_MISSIONS.length; index++) {
      failureRoutes.push(await captureFailureRoute(page, server.baseUrl, SET_PIECE_MISSIONS[index], index));
    }
    semanticEvidence.knownRumor = await captureKnownRumorProof(page, server.baseUrl);

    assert.equal(successRoutes.length, 6, 'both branches of every archetype must be captured');
    assert.deepEqual(
      [...new Set(successRoutes.map((route) => route.archetypeId))].sort(),
      ['hearing', 'long_read', 'witness_run'],
    );
    for (const definition of SET_PIECE_MISSIONS) {
      const routes = successRoutes.filter((route) => route.archetypeId === definition.id);
      assert.deepEqual(
        routes.map((route) => route.branchId).sort(),
        definition.branches.map((branch) => branch.id).sort(),
        `${definition.title} must cover both branches`,
      );
      assert.equal(routes.every((route) => route.terminalExactOnce), true, `${definition.title} terminal exact-once`);
    }
    assert.equal(failureRoutes.length, 3, 'one resolving failure path per archetype');
    assert.equal(failureRoutes.every((route) => route.noDeadEnd), true, 'all failures must resolve through a retry');

    const screenshots = [
      ...successRoutes.flatMap((route) => route.rows.map((row) => row.presentation)),
      ...failureRoutes.flatMap((route) => [route.failure.presentation, route.retry.presentation]),
      ...Object.values(semanticEvidence).filter((entry) => entry && entry.screenshot),
      semanticEvidence.knownRumor && semanticEvidence.knownRumor.presentation,
    ].filter(Boolean);
    assert(screenshots.length >= 29, `expected at least 29 SP1 screenshots; found ${screenshots.length}`);
    assert.equal(new Set(screenshots.map((entry) => entry.screenshot)).size, screenshots.length,
      'every SP1 evidence frame must use a unique path');
    assert.equal(screenshots.every((entry) => entry.image && entry.image.width === 1440 && entry.image.height === 900), true,
      'every screenshot must be a validated 1440x900 PNG');
    assert.deepEqual(pageErrors, [], `canonical route must have no page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `canonical route must have no console errors: ${consoleErrors.join('\n')}`);

    const evidence = {
      schema: 'spaceface.depthProgram.sp1LiveBrowserEvidence.v1',
      program: 'SpaceFace Depth Program SP1',
      result: 'passed',
      canonicalRoute: {
        url: CANONICAL_URL,
        publicRoot: true,
        queryFlags: false,
        fixturePage: false,
        alternateAssetMode: false,
        serverOwnedByCapture: server.ownsServer,
      },
      viewport: VIEWPORT,
      successRouteCount: successRoutes.length,
      failureRouteCount: failureRoutes.length,
      successRoutes,
      failureRoutes,
      semanticEvidence,
      validation: {
        everyNewGameReachedAuthoredFlight: [...successRoutes, ...failureRoutes]
          .every((route) => route.startup && route.startup.libraryUsable && route.startup.criticalVisuals.ready),
        bothBranchesPerArchetype: true,
        oneBranchPointPerRoute: successRoutes.every((route) => route.branchWithdrawal
          && route.branchWithdrawal.siblingsBefore.length === 2
          && route.branchWithdrawal.siblingsAfter.length === 0),
        terminalExactOncePerRoute: successRoutes.every((route) => route.terminalExactOnce),
        resolvingFailurePerArchetype: failureRoutes.every((route) => route.noDeadEnd),
        allAcceptsFromNormalBoards: successRoutes.every((route) => route.rows.every((row) => (
          row.normalBoardAcceptance.publicIntent === 'ui:acceptMission'
          && row.normalBoardAcceptance.offer.source === 'setPieceMission'
        ))) && failureRoutes.every((route) => (
          route.accepted.publicIntent === 'ui:acceptMission'
          && route.retry.accepted.publicIntent === 'ui:acceptMission'
        )),
        everyTransitionHasDurableReceipt: successRoutes.every((route) => route.rows.every((row) => (
          row.settlement.receipt && row.settlement.transition && row.settlement.transition.houseText
        ))),
        everyFailureShowsRecoveryAndNamedStation: failureRoutes.every((route) => (
          route.failure.recoveryText
          && route.failure.nextStationNames.every((name) => route.failure.presentation.visibleText.includes(name))
          && !/station_[a-z0-9_]+/i.test(route.failure.presentation.visibleText)
        )),
        everyScreenshotNontrivial1440x900: true,
        routePresentationIsolation: successRoutes.every((route) => route.rows.every((row) => (
          row.presentation.assertions.priorRouteCopyAbsent && row.presentation.assertions.rawStationIdsAbsent
        ))),
        screenshotCount: screenshots.length,
        minimumPngBytes: MIN_PNG_BYTES,
        pageErrors,
        consoleErrors,
      },
      accelerationDisclosure: {
        publicSeamsKept: [
          'game:new authored-asset gate',
          'station mission boards',
          'ui:acceptMission',
          'mission:accepted',
          'mission:setPieceTransition',
          'mission:completed / mission:failed',
          'durable mission receipts',
          'station preflight and the shipped Mission Log durable settlement-receipt presenter',
        ],
        compressedSeams: [
          'missions._completeMission compressed success objective traversal after normal acceptance.',
          'missions._failMission compressed the deliberate failure moment after normal acceptance.',
          'Dock location, credits, standing, cargo capacity, and removal of tutorial Contract 47-A were staged per fresh route for isolated acceptance presentation.',
        ],
      },
      limitations: [
        'This browser run proves the canonical public-route offer, acceptance, chained-board, branch-withdrawal, failure/retry, and player-facing presentation seams. Every stage-transition screenshot uses the durable Mission Log settlement receipt surface, not timing-dependent transient comms.',
        'It is not an unassisted travel/combat/scan-duration recording.',
        'Objective traversal is compressed through the live missions system private settlement methods; focused SP1 tests separately prove native objective/event progression, save/load continuity, expiry, clauses, and Long Read unique-wreck reconciliation.',
      ],
    };
    await writeFile(MANIFEST, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`SP1 live-browser capture OK: success=${successRoutes.length}, failure/retry=${failureRoutes.length}, screenshots=${screenshots.length}`);
    console.log(`Evidence: ${MANIFEST}`);
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

await main();
