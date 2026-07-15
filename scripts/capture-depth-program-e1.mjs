#!/usr/bin/env node
// Canonical public-route player-facing evidence for Depth Program E1/H1 and E1/H8.
//
// The capture boots the authored-asset-gated New Game route, then compresses sector travel,
// encounter eligibility, and evidence framing through window.SF. It does not inject replacement
// UI or fixture entities: both frames use the registered world/encounter systems, shipped choice
// prompt, one-voice floor, entity renderer, targeting surface, and live encounter data.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'depth-program', 'e1');
const MANIFEST = path.join(OUT, 'e1-live-browser-evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const CAPTURE_SEED = 0x45310047;
const START_TIMEOUT_MS = Number(process.env.SF_E1_CAPTURE_START_TIMEOUT_MS) || 180_000;
const MIN_PNG_BYTES = 20_000;

const CASES = Object.freeze([
  {
    programId: 'E1/H1',
    encounterId: 'e1_h1_browser_evidence',
    shapeId: 'depth_h1_distress_from_inside',
    sectorId: 'sector_helios_prime',
    title: 'THE DISTRESS FROM INSIDE',
    primaryLine: 'VOLS: Mayday. Tessera drive gone. Four souls. Anyone receiving.',
    choices: ['Listen', 'Board the wreck', 'Leave quietly'],
    file: '01-h1-mayday.png',
    targetKind: 'maydayWreck',
  },
  {
    programId: 'E1/H8',
    encounterId: 'e1_h8_browser_evidence',
    shapeId: 'depth_h8_echo_of_player',
    sectorId: 'sector_veil_nebula',
    title: 'THE ECHO OF THE PLAYER',
    primaryLine: 'TESSERA: your signature is ahead, flying your course backward.',
    choices: ['Answer your own hail', 'Break it'],
    file: '02-h8-mirror-contact.png',
    targetKind: 'playerEcho',
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
  assert(response && response.ok(), 'canonical game root must load');
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
      name: 'E1 Evidence Pilot',
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
    if (state.onboarding && typeof state.onboarding === 'object') {
      state.onboarding.active = false;
      state.onboarding.finished = true;
    }
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

async function dismissUntilStable(page, selector, maxRounds = 10) {
  let dismissed = 0;
  let emptyRounds = 0;
  for (let round = 0; round < maxRounds && emptyRounds < 4; round++) {
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
    sf.timeEffects.set('capture:e1', { scale: 0 });
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
    const postcard = sf.registry.get('sectorPostcard');
    if (postcard && typeof postcard._hide === 'function') postcard._hide();
    const voice = sf.registry.get('voiceArbiter');
    const voiceEntriesCleared = voice && voice.queue ? voice.queue.size : 0;
    if (voice && voice.queue && sf.helpers.voice) {
      for (let index = 0; index < 100 && voice.queue.size; index++) sf.helpers.voice.dismiss();
    }
    sf.bus.emit('voice:clear', {});
    return { voiceEntriesCleared };
  });
  let toastsDismissed = await dismissUntilStable(page, '#toasts .sf-toast:not(.sf-toast--out)');
  const commsDismissed = await dismissUntilStable(page, '#sf-comms .sf-comm:not(.sf-comm--out)');
  // Comms dismissal can schedule a final receipt toast; require another full quiet window.
  toastsDismissed += await dismissUntilStable(page, '#toasts .sf-toast:not(.sf-toast--out)');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({
    toastCount: document.querySelectorAll('#toasts .sf-toast:not(.sf-toast--out)').length,
    commsCount: document.querySelectorAll('#sf-comms .sf-comm:not(.sf-comm--out)').length,
    voiceFloorCount: document.querySelectorAll('#alerts .sf-alert--floor').length,
    sectorLawVisible: !!document.querySelector('#sf-sector-law:not([hidden])'),
    sectorPostcardVisible: !!document.getElementById('sf-sector-postcard'),
  }));
  assert.equal(after.toastCount, 0, 'E1 reset must clear prior toasts');
  assert.equal(after.commsCount, 0, 'E1 reset must clear prior comms cards');
  assert.equal(after.voiceFloorCount, 0, 'E1 reset must release the one-voice floor');
  assert.equal(after.sectorLawVisible, false, 'E1 reset must hide compressed sector-law evidence');
  assert.equal(after.sectorPostcardVisible, false, 'E1 reset must hide compressed sector postcards');
  return { ...runtime, toastsDismissed, commsDismissed, after };
}

async function enterSector(page, row) {
  return page.evaluate(({ sectorId }) => {
    const sf = window.SF;
    const state = sf.state;
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') throw new Error('world.enterSector unavailable');
    world.enterSector(sectorId, {
      fromJump: true,
      via: 'e1-browser-evidence',
      fromSectorId: state.world.currentSectorId,
    });
    return { currentSectorId: state.world.currentSectorId };
  }, row);
}

async function stageEncounter(page, row) {
  return page.evaluate(({ encounterId, shapeId, sectorId, targetKind }) => {
    const sf = window.SF;
    const state = sf.state;
    const director = sf.registry.get('encounterDirector');
    if (!director || typeof director.requestAuthoredEncounter !== 'function') {
      throw new Error('encounterDirector.requestAuthoredEncounter unavailable');
    }
    sf.timeEffects.clear('capture:e1');
    const player = state.entities.get(state.playerId);
    if (!player) throw new Error('capture player missing');
    const anchor = { x: player.pos.x, z: player.pos.z };
    const result = director.requestAuthoredEncounter({
      shapeId,
      encounterId,
      sectorId,
      anchor,
      force: true,
    });
    if (!result || !result.ok) throw new Error(`${shapeId} failed to fire: ${JSON.stringify(result)}`);

    const live = state.encounterDirector && state.encounterDirector.live
      && state.encounterDirector.live[encounterId];
    if (!live) throw new Error(`${shapeId} did not create a live production encounter`);
    let target = null;
    if (targetKind === 'maydayWreck') {
      target = [...state.entities.values()].find((entity) => entity && entity.alive !== false
        && entity.type === 'wreck' && entity.data && entity.data.encounterId === encounterId
        && entity.data.storyPropKind === 'vols_mayday_wreck');
    } else {
      target = [...state.entities.values()].find((entity) => entity && entity.alive !== false
        && entity.data && entity.data.echoOfPlayer === true
        && entity.data.ai && entity.data.ai.encounterId === encounterId);
    }
    if (!target) throw new Error(`${shapeId} production target entity missing`);

    if (targetKind === 'maydayWreck') {
      player.pos.x = target.pos.x - 28;
      player.pos.z = target.pos.z + 16;
      player.vel.x = 0;
      player.vel.z = 0;
    } else {
      target.pos.x = anchor.x + 18;
      target.pos.z = anchor.z;
      player.pos.x = anchor.x - 18;
      player.pos.z = anchor.z;
      player.vel.x = -12;
      player.vel.z = 0;
    }
    if (player.prevPos && typeof player.prevPos.copy === 'function') player.prevPos.copy(player.pos);
    if (target.prevPos && typeof target.prevPos.copy === 'function') target.prevPos.copy(target.pos);
    player.flags = player.flags || {};
    player.flags.noInterp = true;
    target.flags = target.flags || {};
    target.flags.noInterp = true;
    state.player.targetId = target.id;
    state.nav.waypoint = {
      x: target.pos.x,
      z: target.pos.z,
      label: targetKind === 'maydayWreck' ? 'Tessera mayday wreck' : 'Mirror-course contact',
    };
    sf.bus.emit('target:changed', { targetId: target.id, source: 'e1-browser-evidence' });
    const voice = sf.registry.get('voiceArbiter');
    if (!voice || typeof voice.update !== 'function') throw new Error('production voiceArbiter unavailable');
    voice.update(0, state);
    sf.timeEffects.set('capture:e1', { scale: 0 });
    return {
      request: result,
      currentSectorId: state.world.currentSectorId,
      encounterId: live.id,
      shapeId: live.shapeId,
      phase: live.phase,
      target: {
        id: target.id,
        type: target.type,
        defId: target.data && target.data.defId || null,
        encounterId: target.data && (target.data.encounterId
          || target.data.ai && target.data.ai.encounterId) || null,
        storyPropKind: target.data && target.data.storyPropKind || null,
        echoOfPlayer: !!(target.data && target.data.echoOfPlayer),
        pos: { x: target.pos.x, z: target.pos.z },
      },
      player: {
        id: player.id,
        defId: player.data && player.data.defId || null,
        pos: { x: player.pos.x, z: player.pos.z },
        targetId: state.player.targetId,
      },
      distance: Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z),
      presentationTick: 'production voiceArbiter.update(0, state), then fixed-step freeze',
    };
  }, row);
}

async function inspectShippedPresentation(page, row) {
  await waitForVisible(page, '#sf-encounter-choice', `${row.programId} shipped choice prompt`);
  await page.waitForFunction((expected) => {
    const floor = document.querySelector('#alerts .sf-alert--floor .sf-alert__text');
    return floor && floor.textContent && floor.textContent.replace(/\s+/g, ' ').trim() === expected;
  }, row.primaryLine, { timeout: 15_000 });

  const presentation = await page.evaluate(() => {
    const prompt = document.getElementById('sf-encounter-choice');
    const rect = prompt.getBoundingClientRect();
    return {
      promptText: (prompt.innerText || prompt.textContent || '').replace(/\s+/g, ' ').trim(),
      title: (document.getElementById('sf-encounter-choice-title').textContent || '').trim(),
      status: (document.getElementById('sf-encounter-choice-status').textContent || '').trim(),
      choices: [...prompt.querySelectorAll('button')].map((button) => ({
        id: button.dataset.choice,
        label: (button.textContent || '').replace(/^\d+\s*·\s*/, '').trim(),
        disabled: button.disabled,
        ariaLabel: button.getAttribute('aria-label'),
      })),
      role: prompt.getAttribute('role'),
      ariaModal: prompt.getAttribute('aria-modal'),
      ariaLabelledBy: prompt.getAttribute('aria-labelledby'),
      ariaDescribedBy: prompt.getAttribute('aria-describedby'),
      viewport: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        fullyVisible: rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth,
      },
      primaryLine: (document.querySelector('#alerts .sf-alert--floor .sf-alert__text').textContent || '').trim(),
      floorCount: document.querySelectorAll('#alerts .sf-alert--floor').length,
    };
  });
  assert.equal(presentation.title, row.title, `${row.programId}: canonical title must be visible`);
  assert.equal(presentation.primaryLine, row.primaryLine, `${row.programId}: canonical primary line must be visible`);
  assert.deepEqual(presentation.choices.map((choice) => choice.label), row.choices,
    `${row.programId}: shipped choice labels must be visible`);
  assert.equal(presentation.choices.every((choice) => !choice.disabled), true,
    `${row.programId}: every intended choice must be available`);
  assert.equal(presentation.role, 'dialog');
  assert.equal(presentation.ariaModal, 'false');
  assert.equal(presentation.viewport.fullyVisible, true, `${row.programId}: prompt must fit the viewport`);
  assert.equal(presentation.floorCount, 1, `${row.programId}: exactly one voice line may hold the floor`);
  return presentation;
}

async function validatePng(file) {
  const info = await stat(file);
  assert(info.isFile(), `${relative(file)} must be a file`);
  assert(info.size >= MIN_PNG_BYTES, `${relative(file)} is too small (${info.size} bytes)`);
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative(file)} must be PNG`);
  return {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function inspectRenderIdentity(page, targetId) {
  return page.evaluate((entityId) => {
    const render = window.SF.registry.get('render');
    const entity = window.SF.state.entities.get(entityId)
      || [...window.SF.state.entities.values()].find((candidate) => String(candidate.id) === String(entityId));
    const meshEntry = render && render._meshes
      && [...render._meshes.entries()].find(([id]) => String(id) === String(entityId));
    const root = meshEntry && meshEntry[1] || entity && (entity.mesh || entity.view && entity.view.root);
    const assetIds = [];
    const nodeNames = [];
    if (root && typeof root.traverse === 'function') {
      root.traverse((node) => {
        const assetId = node && node.userData && node.userData.assetId;
        if (assetId) assetIds.push(String(assetId));
        if (node && node.name && (assetId || /kestrel|meridian|trader/i.test(node.name))) {
          nodeNames.push(String(node.name));
        }
      });
    }
    return {
      meshFound: !!root,
      entityFound: !!entity,
      entityId: entity && entity.id || null,
      meshRegistryId: meshEntry && meshEntry[0] || null,
      rootName: root && root.name || null,
      rootAssetId: root && root.userData && root.userData.assetId || null,
      assetIds: [...new Set(assetIds)],
      identityNodeNames: [...new Set(nodeNames)].slice(0, 24),
    };
  }, targetId);
}

async function inspectTargetRoster(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.sf-overview-row.selected');
    return {
      found: !!row,
      name: row && (row.querySelector('.sf-overview-row__name')?.textContent || '').trim() || null,
      state: row && (row.querySelector('.sf-overview-row__state')?.textContent || '').trim() || null,
      text: row && (row.innerText || row.textContent || '').replace(/\s+/g, ' ').trim() || null,
    };
  });
}

async function captureEncounter(page, row) {
  const betweenEncounterReset = await resetTransientPresentation(page);
  const travel = await enterSector(page, row);
  assert.equal(travel.currentSectorId, row.sectorId);
  await page.waitForTimeout(350);
  const postTravelReset = await resetTransientPresentation(page);
  const staged = await stageEncounter(page, row);
  assert.equal(staged.currentSectorId, row.sectorId);
  assert.equal(staged.shapeId, row.shapeId);
  assert.equal(staged.encounterId, row.encounterId);
  assert.equal(staged.target.encounterId, row.encounterId);
  assert.equal(staged.player.targetId, staged.target.id);
  if (row.targetKind === 'maydayWreck') {
    assert.equal(staged.target.type, 'wreck');
    assert.equal(staged.target.storyPropKind, 'vols_mayday_wreck');
  } else {
    assert.equal(staged.target.echoOfPlayer, true);
    assert.equal(staged.target.defId, staged.player.defId, 'H8 contact must mirror the player ship definition');
  }

  const presentation = await inspectShippedPresentation(page, row);
  await page.evaluate(() => window.SF.timeEffects.set('capture:e1', { scale: 0 }));
  await page.waitForFunction((entityId) => {
    const sf = window.SF;
    const entity = sf.state.entities.get(entityId)
      || [...sf.state.entities.values()].find((candidate) => String(candidate.id) === String(entityId));
    const render = sf.registry.get('render');
    const registryMesh = render && render._meshes
      && [...render._meshes.entries()].some(([id, root]) => String(id) === String(entityId) && !!root);
    return !!(registryMesh || entity && (entity.mesh || entity.view && entity.view.root));
  }, staged.target.id, { timeout: 15_000 });
  await page.waitForTimeout(250);
  const renderIdentity = await inspectRenderIdentity(page, staged.target.id);
  assert.equal(renderIdentity.meshFound, true, `${row.programId}: physical target must own a live render mesh`);
  const targetRoster = await inspectTargetRoster(page);
  assert.equal(targetRoster.found, true, `${row.programId}: selected target must appear in the shipped contact roster`);
  const file = path.join(OUT, row.file);
  await page.screenshot({ path: file, type: 'png' });
  const image = await validatePng(file);
  return {
    programId: row.programId,
    encounterId: row.encounterId,
    shapeId: row.shapeId,
    sectorId: row.sectorId,
    reset: { betweenEncounter: betweenEncounterReset, postTravel: postTravelReset },
    staged,
    presentation,
    renderIdentity,
    targetRoster,
    screenshot: relative(file),
    image,
    assertions: {
      productionEncounterDirector: true,
      shippedChoicePrompt: true,
      shippedVoiceFloor: true,
      physicalTargetEntity: true,
      canonicalCopyVisible: true,
      targetSelected: true,
    },
  };
}

async function resolveH1ThroughShippedUi(page) {
  const listen = page.locator('#sf-encounter-choice button[data-choice="listen"]');
  assert.equal(await listen.count(), 1, 'H1 shipped Listen choice must be available');
  await listen.click();
  await page.waitForFunction(() => document.getElementById('sf-encounter-choice').hidden === true, null, {
    timeout: 10_000,
  });
  return page.evaluate(() => {
    const memory = window.SF.state.story && window.SF.state.story.depthProgramEncounters;
    const completed = memory && memory.completed && memory.completed.depth_h1_distress_from_inside;
    return {
      source: 'shipped #sf-encounter-choice button[data-choice="listen"]',
      outcome: completed && completed.outcome || null,
    };
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();
  const executablePath = systemBrowserPath();
  const probe = await acquireVisualProbeServer({
    explicitUrl: process.env.SF_E1_CAPTURE_URL || '',
    root: ROOT,
  });
  const browser = await chromium.launch({
    headless: process.env.SF_E1_HEADED !== '1',
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

    const captures = [];
    captures.push(await captureEncounter(page, CASES[0]));
    const h1Resolution = await resolveH1ThroughShippedUi(page);
    assert.equal(h1Resolution.outcome, 'listen');
    captures.push(await captureEncounter(page, CASES[1]));

    const h8RenderAssets = captures[1].renderIdentity.assetIds;
    const h8HasStaleMeridianVisual = h8RenderAssets.includes('SF_MTS_MERIDIAN_HAULER');
    const h8MirrorVisualMatches = captures[1].staged.target.defId === captures[1].staged.player.defId
      && !h8HasStaleMeridianVisual
      && captures[1].targetRoster.name === 'Tessera Echo'
      && captures[1].targetRoster.state === 'ECHO';
    const visualReview = {
      status: h8MirrorVisualMatches ? 'passed' : 'finding',
      h1MaydayFrame: 'accepted — mayday voice, physical wreck target, and three shipped choices are legible',
      h8MirrorFrame: h8MirrorVisualMatches
        ? 'accepted — the selected physical echo uses the player Kestrel visual identity'
        : 'finding — state mirrors ship_kestrel, but the render tree retains a non-Kestrel spawn identity',
      h8MirrorVisualMatches,
      h8RenderAssets,
      h8HasStaleMeridianVisual,
    };

    assert.notEqual(captures[0].image.sha256, captures[1].image.sha256,
      'H1 and H8 evidence frames must be distinct image bytes');
    assert.deepEqual(pageErrors, [], pageErrors.join('\n'));
    assert.deepEqual(consoleErrors, [], consoleErrors.join('\n'));
    assert.deepEqual(httpErrors, [], JSON.stringify(httpErrors, null, 2));
    assert.deepEqual(requestFailures, [], JSON.stringify(requestFailures, null, 2));

    const evidence = {
      schema: 'spaceface.depthProgram.e1LiveBrowserEvidence.v1',
      program: 'SpaceFace Depth Program E1 — The Galaxy Keeps Receipts',
      result: h8MirrorVisualMatches ? 'passed' : 'capture-complete-with-visual-finding',
      generatedAt: new Date().toISOString(),
      deterministicSeed: CAPTURE_SEED,
      runner: {
        automation: 'repo Playwright capture runner',
        browser: executablePath ? 'system Chrome/Chromium channel' : 'bundled Chromium',
        executablePath: executablePath || null,
        headless: process.env.SF_E1_HEADED !== '1',
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
        presenter: 'production encounterDirector -> one-voice floor + encounter choice prompt',
      },
      startup,
      compression: {
        throughWindowSf: true,
        operations: [
          'disable onboarding after the canonical authored New Game gate',
          'compress travel through registered world.enterSector calls',
          'bypass eligibility only through encounterDirector.requestAuthoredEncounter({ force: true })',
          'place the live player and production encounter target at readable spacing while preserving H8 mirror symmetry, then select that target',
          'advance the production voice arbiter once, then freeze sim time after each shipped prompt and primary line are surfaced',
          'clear prior transient presentation between frames without injecting replacement UI',
        ],
      },
      transition: { h1Resolution },
      captures,
      visualReview,
      validation: {
        expectedFrames: CASES.length,
        capturedFrames: captures.length,
        uniqueScreenshots: new Set(captures.map((entry) => entry.screenshot)).size,
        uniqueImageHashes: new Set(captures.map((entry) => entry.image.sha256)).size,
        viewport: VIEWPORT,
        minimumPngBytes: MIN_PNG_BYTES,
        pageErrors,
        consoleErrors,
        httpErrors,
        requestFailures,
      },
      limitations: [
        'Travel, story eligibility, player/camera placement, and encounter timing are compressed through window.SF after the canonical authored New Game gate.',
        'The frames prove shipped browser UI, voice, target entities, and encounter/render integration; they do not claim unassisted trigger timing or human-duration travel.',
      ],
    };
    await writeFile(MANIFEST, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`E1 live-browser capture OK: ${captures.length}/${CASES.length} required frames`);
    console.log(`Evidence: ${MANIFEST}`);
  } finally {
    await browser.close().catch(() => {});
    await probe.close().catch(() => {});
  }
}

await main();
