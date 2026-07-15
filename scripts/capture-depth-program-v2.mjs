#!/usr/bin/env node
// Canonical live-presentation evidence for the eight V2 flavor packs that remain after A1 Band.
//
// Positive frames exercise shipped production carriers. Negative frames deliberately show the
// nearest shipped surface without injecting flavor copy; their manifest rows name the missing
// runtime seam. This script never creates replacement UI and never treats a direct bus injection as
// reachability proof.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FLAVOR_PACKS, FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'depth-program', 'v2-live');
const MANIFEST = path.join(OUT, 'v2-live-presentation-evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const CAPTURE_SEED = 0x5632_4c49;
const START_TIMEOUT_MS = Number(process.env.SF_V2_CAPTURE_START_TIMEOUT_MS) || 180_000;
const MIN_PNG_BYTES = 20_000;
const EXPECTED_FRAME_COUNT = 10;
const PACK_IDS = Object.freeze([
  'wreck_rumors',
  'ad_board',
  'graffiti',
  'roaming_events',
  'quiessence',
  'hush',
  'landmark_lore',
  'set_piece_missions',
]);

const REACHABILITY = Object.freeze({
  wreck_rumors: Object.freeze({
    status: 'partial-reachable',
    carrier: 'Helios arrival news headline is live; intended station Bar -> uniqueWreck:rumorHeard path is blocked',
    consumers: Object.freeze([
      'src/ui/uniqueWreckRumorSurface.js',
      'src/ui/screens/bar.js',
      'src/systems/uniqueWrecks.js',
    ]),
    missingSeam: 'The live headline carrier surfaces authored wreck copy, but stationApp forwards no stationId to createBarPanel.onShow, so the Bar renders zero contacts and its deliberate rumor/bearing path cannot be reached.',
  }),
  ad_board: Object.freeze({
    status: 'unreachable',
    carrier: 'intended dockside commerce notice/ad board',
    consumers: Object.freeze([]),
    missingSeam: 'No production module imports FLAVOR_PACKS.ad_board or selects its rows; stationHub has no ad-board presenter.',
  }),
  graffiti: Object.freeze({
    status: 'reachable',
    carrier: 'physical E1 encounter -> shipped choice button -> exact V2 graffiti -> comms bulkhead',
    consumers: Object.freeze([
      'src/systems/e1EncounterRuntime.js',
      'src/ui/comms.js',
    ]),
  }),
  roaming_events: Object.freeze({
    status: 'reachable',
    carrier: 'living freight route -> encounterDirector physical convoy -> encounter:spawned -> v2FlavorRuntime -> Band',
    consumers: Object.freeze([
      'src/systems/livingPoiBehaviors.js',
      'src/systems/encounterDirector.js',
      'src/systems/v2FlavorRuntime.js',
    ]),
  }),
  quiessence: Object.freeze({
    status: 'unreachable',
    carrier: 'intended landmark black-box census/scan surface',
    consumers: Object.freeze([]),
    missingSeam: 'v2FlavorRuntime can bind an explicitly identified Quiessence actor, but Pallas Drift spawns no physical entity stamped flavorTargetRef=landmark_c14_quiessence or quiessenceShipIndex, and no Band proximity producer exists.',
  }),
  hush: Object.freeze({
    status: 'unreachable',
    carrier: 'intended phased scanner-absence surface',
    consumers: Object.freeze([]),
    missingSeam: 'v2FlavorRuntime can bind an explicit Hush actor, but Eunomia Gulf spawns no physical entity stamped flavorSourceId=planet_hush, and no Band proximity producer exists.',
  }),
  landmark_lore: Object.freeze({
    status: 'partial-reachable',
    carrier: 'physical world POI -> proximity identification -> poi:identified -> v2FlavorRuntime scanner lore',
    consumers: Object.freeze([
      'src/systems/world.js',
      'src/systems/v2FlavorRuntime.js',
    ]),
    missingSeam: 'C6, C8, and C10 have physical POI carriers; the remaining sixteen authored landmark targetRefs do not yet have production physical carriers.',
  }),
  set_piece_missions: Object.freeze({
    status: 'state-only',
    carrier: 'missions.ensureBoard -> setPieceMissionOffers -> live Contracts board state; authored summary is not rendered',
    consumers: Object.freeze([
      'src/systems/setPieceMissionOffers.js',
      'src/systems/missions.js',
      'src/ui/station/screens/contracts.js',
    ]),
    missingSeam: 'The production offer owns the canonical instructionRef and authored summary, but the live Contracts dossier never renders offer.summary.',
  }),
});

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

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
}

function collectTexts(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (typeof value.text === 'string' && value.text.trim()) output.push(value.text.trim());
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => collectTexts(item, output));
    else if (child && typeof child === 'object') collectTexts(child, output);
  }
  return output;
}

async function runtimeSourceFiles(dir = path.join(ROOT, 'src')) {
  const rows = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    const rel = relative(file);
    if (entry.isDirectory()) {
      if (rel === 'src/data/flavor' || rel === 'src/localization') continue;
      rows.push(...await runtimeSourceFiles(file));
    } else if (/\.[cm]?js$/u.test(entry.name)) {
      rows.push(file);
    }
  }
  return rows;
}

async function auditReachability() {
  assert.deepEqual(Object.keys(FLAVOR_PACKS), [
    'wreck_rumors', 'ad_board', 'graffiti', 'band', 'roaming_events',
    'quiessence', 'hush', 'landmark_lore', 'set_piece_missions',
  ], 'V2 flavor catalogue changed; update live proof routing');
  const files = await runtimeSourceFiles();
  const sourceRows = await Promise.all(files.map(async (file) => ({
    file: relative(file),
    text: await readFile(file, 'utf8'),
  })));
  const audit = [];
  for (const packId of PACK_IDS) {
    const pack = FLAVOR_PACKS[packId];
    assert(pack, `missing V2 pack ${packId}`);
    const texts = [...new Set(collectTexts(pack))];
    const sourceRefs = [];
    visit(pack);
    const exactRuntimeMatches = [];
    for (const row of sourceRows) {
      const matches = texts.filter((text) => row.text.includes(text));
      if (matches.length) exactRuntimeMatches.push({ file: row.file, lineCount: matches.length });
    }
    const expected = REACHABILITY[packId];
    if (expected.status === 'unreachable') {
      assert.deepEqual(exactRuntimeMatches, [], `${packId} unexpectedly gained an exact runtime copy consumer`);
      assert.equal(sourceRefs.length, 0, `${packId} unexpectedly gained an indexed sourceRef carrier`);
    }
    if (expected.status === 'state-only') {
      assert.deepEqual(exactRuntimeMatches, [], `${packId} authored copy should remain data-driven`);
      assert(sourceRefs.length > 0, `${packId} must retain indexed state carriers`);
    }
    for (const consumer of expected.consumers) {
      assert(sourceRows.some((row) => row.file === consumer), `${packId} consumer missing: ${consumer}`);
    }
    audit.push({
      packId,
      status: expected.status,
      description: pack.description,
      entryCount: pack.entries.length,
      authoredLineCount: texts.length,
      indexedSourceRefs: sourceRefs,
      exactRuntimeMatches,
      carrier: expected.carrier,
      consumers: [...expected.consumers],
      missingSeam: expected.missingSeam || null,
    });

    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (typeof node.sourceRef === 'string' && node.sourceRef) sourceRefs.push(node.sourceRef);
      for (const child of Object.values(node)) {
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child === 'object') visit(child);
      }
    }
  }
  return audit;
}

async function waitForVisible(page, selector, label, timeout = 15_000) {
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
  assert.equal(current.origin, expected.origin, 'capture must stay on the owned public origin');
  assert.equal(current.pathname, '/', 'capture must stay on the canonical root path');
  assert.equal(current.search, '', 'capture must not use query flags');
  assert.equal(current.hash, '', 'capture must not use hash routes');
  await page.waitForFunction(
    () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry && window.SF.ctx),
    null,
    { timeout: 20_000 },
  );
  await waitForVisible(page, '[data-screen="mainMenu"]', 'main menu', 45_000);
  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', {
      seed,
      name: 'V2 Live Presentation Pilot',
      shipId: 'ship_kestrel',
      difficulty: 'standard',
    });
  }, CAPTURE_SEED);
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf && sf.state && sf.state.entities && sf.state.entities.get(sf.state.playerId);
    return !!(sf && sf.state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
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
      title: document.title,
      mode: state.mode,
      playerDefId: player && player.data && player.data.defId,
      releaseAssetMode: true,
      libraryUsable: isAuthoredPartLibraryUsable(library),
      criticalVisuals: authoredCriticalVisualReadiness(state),
      systems: {
        missions: sf.registry.get('missions') && sf.registry.get('missions').name,
        uniqueWrecks: sf.registry.get('uniqueWrecks') && sf.registry.get('uniqueWrecks').name,
        ui: sf.registry.get('ui') && sf.registry.get('ui').name,
      },
    };
  }, CAPTURE_SEED);
}

async function prepareCapture(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const onboardingBefore = state.onboarding && {
      active: state.onboarding.active,
      finished: state.onboarding.finished,
    };
    if (state.onboarding) {
      state.onboarding.active = false;
      state.onboarding.finished = true;
    }
    state.player.credits = Math.max(10_000, Number(state.player.credits) || 0);
    state.player.targetId = null;
    state.nav.waypoint = null;
    state.ui.trackedMissionId = null;
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    sf.ctx.screenManager.closeAll();
    sf.ctx.screenManager.syncVisibility && sf.ctx.screenManager.syncVisibility();
    sf.timeEffects.set('capture:v2-live', { scale: 0 });
    clearVoice(sf);
    return {
      onboardingBefore,
      onboardingAfter: { active: state.onboarding.active, finished: state.onboarding.finished },
      simulationFrozen: true,
      compressions: [
        'disabled completed first-flight onboarding after authored New Game',
        'froze fixed-step simulation while preserving render/UI frames',
        'cleared transient nav/target state and closed modal screens',
      ],
    };

    function clearVoice(runtime) {
      const voice = runtime.registry.get('voiceArbiter');
      if (!voice || !voice.queue || !runtime.helpers.voice) return;
      for (let index = 0; index < 100 && voice.queue.size; index++) runtime.helpers.voice.dismiss();
    }
  });
}

async function dismissTransientCards(page) {
  for (const selector of ['#toasts .sf-toast:not(.sf-toast--out)', '#sf-comms .sf-comm:not(.sf-comm--out)']) {
    for (let pass = 0; pass < 20 && await page.locator(selector).count(); pass++) {
      await page.locator(selector).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(35);
    }
  }
  await page.evaluate(() => {
    const sf = window.SF;
    const voice = sf.registry.get('voiceArbiter');
    if (voice && voice.queue && sf.helpers.voice) {
      for (let index = 0; index < 100 && voice.queue.size; index++) sf.helpers.voice.dismiss();
    }
    const postcard = sf.registry.get('sectorPostcard');
    if (postcard && typeof postcard._hide === 'function') postcard._hide();
    const ui = sf.registry.get('ui');
    const comms = ui && ui.comms;
    for (const name of ['sectorLawPresenter', 'signalInvestigationPrompt', 'pirateParleyPrompt', 'contactHailPrompt']) {
      if (comms && comms[name] && typeof comms[name].hide === 'function') comms[name].hide();
    }
  });
  await page.waitForTimeout(260);
}

async function openStation(page, { caseId, sectorId, stationId, tabId }) {
  const staged = await page.evaluate(({ sectorId: sector, stationId: station, tabId: tab }) => {
    const sf = window.SF;
    const state = sf.state;
    const before = state.world.currentSectorId;
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') throw new Error('world.enterSector unavailable');
    world.enterSector(sector, { placePlayer: true, fromSectorId: before });
    state.ui.docked = true;
    state.ui.dockedStationId = station;
    state.ui.activeStationTab = tab;
    sf.bus.emit('dock:docked', { stationId: station, source: 'v2-live-capture' });
    const screens = sf.ctx.screenManager;
    screens.closeAll();
    screens.pushScreen('station');
    screens.syncVisibility && screens.syncVisibility();
    return {
      fromSectorId: before,
      currentSectorId: state.world.currentSectorId,
      stationId: station,
      tabId: tab,
      topScreen: screens.top(),
    };
  }, { sectorId, stationId, tabId });
  await waitForVisible(page, '[data-screen="station"]', `${caseId} station`);
  const tab = page.locator(`[data-nav="${tabId}"]`).first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(260);
  return {
    ...staged,
    compression: `called registered world.enterSector(${sectorId}) and staged canonical dock at ${stationId} instead of flying/docking the route`,
  };
}

async function openFlight(page, { caseId, sectorId }) {
  const staged = await page.evaluate((sector) => {
    const sf = window.SF;
    const state = sf.state;
    const before = state.world.currentSectorId;
    const screens = sf.ctx.screenManager;
    screens.closeAll();
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    screens.syncVisibility && screens.syncVisibility();
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') throw new Error('world.enterSector unavailable');
    world.enterSector(sector, { placePlayer: true, fromSectorId: before });
    sf.bus.emit('mode:changed', { mode: 'flight', previousMode: 'flight', source: 'v2-live-capture' });
    const player = state.entities.get(state.playerId);
    if (player) {
      player.vel.set(0, 0, 0);
      player.prevPos.copy(player.pos);
      player.data.noInterp = true;
    }
    state.player.targetId = null;
    state.nav.waypoint = null;
    return { fromSectorId: before, currentSectorId: state.world.currentSectorId };
  }, sectorId);
  await dismissTransientCards(page);
  assert.equal(await page.locator('[data-screen="station"]:visible').count(), 0, `${caseId} must be in flight`);
  return {
    ...staged,
    compression: `called registered world.enterSector(${sectorId}) and returned to flight instead of flying the route`,
  };
}

async function clearVoiceFloor(page) {
  await page.evaluate(() => {
    const sf = window.SF;
    const voice = sf.registry.get('voiceArbiter');
    if (!voice || !voice.queue || !sf.helpers.voice) return;
    for (let index = 0; index < 100 && voice.queue.size; index++) sf.helpers.voice.dismiss();
  });
}

async function surfaceV2Voice(page, packId) {
  return page.evaluate((expectedPackId) => {
    const sf = window.SF;
    const voice = sf.registry.get('voiceArbiter');
    if (!voice || !voice.queue || typeof voice.update !== 'function' || !sf.helpers.voice) {
      throw new Error('registered voice arbiter control unavailable');
    }
    voice.update(0, sf.state);
    const traversed = [];
    for (let index = 0; index < 32; index++) {
      const active = voice.queue.active;
      const row = active && { id: active.id, kind: active.kind, channel: active.channel, text: active.text };
      traversed.push(row);
      if (active && active.kind === 'v2Flavor' && String(active.id || '').includes(`v2:${expectedPackId}:`)) return { active: row, traversed };
      if (!active && !voice.queue.size) break;
      sf.helpers.voice.dismiss();
    }
    throw new Error(`no ${expectedPackId} v2Flavor line reached the one-voice floor: ${JSON.stringify(traversed)}`);
  }, packId);
}

async function stagePhysicalE1Graffiti(page) {
  await clearVoiceFloor(page);
  const staged = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const director = sf.registry.get('encounterDirector');
    if (!director || typeof director.requestAuthoredEncounter !== 'function') {
      throw new Error('registered encounterDirector authored forcing seam unavailable');
    }
    const player = state.entities.get(state.playerId);
    if (!player) throw new Error('canonical player entity unavailable');
    const encounterId = 'v2-live-graffiti-h1';
    const request = director.requestAuthoredEncounter({
      shapeId: 'depth_h1_distress_from_inside',
      encounterId,
      sectorId: 'sector_helios_prime',
      anchor: { x: player.pos.x, z: player.pos.z },
      force: true,
    });
    const wreck = [...state.entities.values()].find((entity) => entity && entity.alive !== false
      && entity.type === 'wreck' && entity.data && entity.data.encounterId === encounterId
      && entity.data.storyPropKind === 'vols_mayday_wreck');
    return {
      request,
      encounterId,
      physicalWreck: wreck && {
        id: wreck.id,
        type: wreck.type,
        storyPropKind: wreck.data.storyPropKind,
      },
    };
  });
  assert.deepEqual(staged.request, { ok: true, encounterId: staged.encounterId });
  assert(staged.physicalWreck, 'H1 must materialize the physical Vols mayday wreck');
  await waitForVisible(page, '#sf-encounter-choice', 'H1 shipped choice prompt');
  const board = page.locator('#sf-encounter-choice button[data-choice="board"]').first();
  assert.equal(await board.count(), 1, 'H1 shipped Board choice must exist');
  await board.click();
  const presentation = await waitForPackLine(page, 'graffiti');
  const resolved = await page.evaluate((encounterId) => {
    const sf = window.SF;
    const state = sf.state;
    const director = sf.registry.get('encounterDirector');
    return {
      completion: state.story.depthProgramEncounters
        && state.story.depthProgramEncounters.completed.depth_h1_distress_from_inside || null,
      volsBlackBoxRecovered: state.story.flags.volsBlackBoxRecovered === true,
      persistentCargo: [...(state.story.persistentCargo || [])],
      liveEncounter: state.encounterDirector.live[encounterId] || null,
      blockedReplay: director.requestAuthoredEncounter({
        shapeId: 'depth_h1_distress_from_inside',
        encounterId: `${encounterId}:again`,
        sectorId: 'sector_helios_prime',
        anchor: { x: 0, z: 0 },
      }),
      bulkheadLine: (document.querySelector('#sf-bulkhead.sf-bulkhead--visible .sf-bulkhead__line')
        ?.textContent || '').trim(),
    };
  }, staged.encounterId);
  const volsLines = new Set(FLAVOR_PACKS.graffiti.entries
    .filter((entry) => entry.set === 'vols_hand').map((entry) => entry.text));
  assert.equal(resolved.completion && resolved.completion.outcome, 'boarded');
  assert.equal(resolved.volsBlackBoxRecovered, true);
  assert(resolved.persistentCargo.includes('depth_vols_black_box'));
  assert.equal(resolved.liveEncounter, null);
  assert.deepEqual(resolved.blockedReplay, { ok: false, reason: 'gated' });
  assert(volsLines.has(resolved.bulkheadLine), 'visible bulkhead must use the exact V2 Vols corpus');
  assert(presentation.exactPackLinesVisible.includes(resolved.bulkheadLine));
  return { ...staged, ...resolved, presentation };
}

async function stageRealConvoy(page) {
  await clearVoiceFloor(page);
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const sectorId = 'sector_ceres_belt';
    const encounterId = 'v2-live-convoy';
    const route = Object.values(state.livingPoiBehaviors && state.livingPoiBehaviors.activeByZone || {})
      .find((row) => row && row.familyId === 'convoy_industrial_route' && row.sectorId === sectorId);
    if (!route) throw new Error('Ceres Belt must own a live convoy_industrial_route carrier');
    const director = sf.registry.get('encounterDirector');
    const flavor = sf.registry.get('v2Flavor');
    if (!director || typeof director.requestAuthoredEncounter !== 'function') {
      throw new Error('registered encounterDirector authored forcing seam unavailable');
    }
    if (!flavor) throw new Error('registered v2Flavor runtime unavailable');

    const player = state.entities.get(state.playerId);
    player.pos.set(route.zoneCenter.x, 0, route.zoneCenter.z);
    player.prevPos.copy(player.pos);
    player.vel.set(0, 0, 0);
    player.data.noInterp = true;
    sf.bus.emit('band:tune', { channelId: 'concord_bulletin' });
    const request = director.requestAuthoredEncounter({
      shapeId: 'convoy_departure',
      encounterId,
      sectorId,
      zoneId: route.zoneId,
      zoneName: route.zoneName,
      zoneType: route.zoneType,
      zoneRadius: route.zoneRadius,
      anchor: { x: route.zoneCenter.x, z: route.zoneCenter.z },
      force: true,
    });
    const physicalEntities = (state.entityList || []).filter((entity) => {
      const ai = entity && entity.data && entity.data.ai;
      return entity && entity.alive !== false && ai
        && String(ai.encounterId || '') === encounterId
        && ai.sectorId === sectorId
        && ai.zoneId === route.zoneId;
    });
    const physicalEntityIds = physicalEntities.map((entity) => entity.id);
    const convoyCenter = physicalEntities.reduce((center, entity) => {
      center.x += entity.pos.x;
      center.z += entity.pos.z;
      return center;
    }, { x: 0, z: 0 });
    if (physicalEntities.length) {
      convoyCenter.x /= physicalEntities.length;
      convoyCenter.z /= physicalEntities.length;
    }
    const previousCameraZoom = state.camera.zoom;
    const proofCameraZoom = Math.max(132, previousCameraZoom);
    const proofStandoff = 74;
    player.pos.set(convoyCenter.x, 0, convoyCenter.z - proofStandoff);
    player.prevPos.copy(player.pos);
    player.data.noInterp = true;
    state.camera.zoom = proofCameraZoom;
    const record = state.v2Flavor && state.v2Flavor.roamingByEncounter
      && state.v2Flavor.roamingByEncounter[encounterId];
    return {
      request,
      route: {
        behaviorId: route.behaviorId,
        familyId: route.familyId,
        sectorId: route.sectorId,
        zoneId: route.zoneId,
        zoneName: route.zoneName,
        zoneType: route.zoneType,
        zoneRadius: route.zoneRadius,
        zoneCenter: { x: route.zoneCenter.x, z: route.zoneCenter.z },
        status: route.status,
      },
      physicalEntityIds,
      proofComposition: {
        convoyCenter,
        playerPos: { x: player.pos.x, z: player.pos.z },
        standoff: proofStandoff,
        cameraZoom: proofCameraZoom,
        previousCameraZoom,
      },
      record: record && { ...record },
      tunedChannelId: state.bandRadio && state.bandRadio.channelId,
      v2FlavorSystem: flavor.name,
    };
  });
}

async function identifyPhysicalLandmark(page, { sectorId, poiId, targetRef }) {
  await clearVoiceFloor(page);
  return page.evaluate(({ sectorId: expectedSectorId, poiId: expectedPoiId, targetRef: expectedTargetRef }) => {
    const sf = window.SF;
    const state = sf.state;
    const world = sf.registry.get('world');
    const flavor = sf.registry.get('v2Flavor');
    if (!world || typeof world.update !== 'function') throw new Error('registered world update unavailable');
    if (!flavor) throw new Error('registered v2Flavor runtime unavailable');
    if (state.world.currentSectorId !== expectedSectorId) throw new Error('landmark sector mismatch');
    const row = (state.world.activeSector && state.world.activeSector.pois || [])
      .find((poi) => poi && poi.poiId === expectedPoiId);
    const entity = row && state.entities.get(row.id);
    if (!row || !entity || entity.alive === false || !entity.data || entity.data.poiId !== expectedPoiId) {
      throw new Error(`physical POI carrier absent: ${expectedPoiId}`);
    }
    const player = state.entities.get(state.playerId);
    player.pos.copy(entity.pos);
    player.prevPos.copy(player.pos);
    player.vel.set(0, 0, 0);
    player.data.noInterp = true;
    world.update(0, state);
    const discovery = state.world.discovery && state.world.discovery[expectedSectorId];
    const record = discovery && discovery.pois && discovery.pois[expectedPoiId];
    const receipt = state.v2Flavor && state.v2Flavor.presentedReceipts
      && state.v2Flavor.presentedReceipts.find((value) => value === `landmark_lore:${expectedTargetRef}:scan`);
    return {
      poi: {
        id: row.id,
        poiId: row.poiId,
        type: row.type,
        entityAlive: entity.alive !== false,
        entityPoiId: entity.data.poiId,
        pos: { x: entity.pos.x, z: entity.pos.z },
      },
      discovery: record && { ...record },
      receipt: receipt || null,
      v2FlavorSystem: flavor.name,
    };
  }, { sectorId, poiId, targetRef });
}

async function inspectPresentation(page, packId) {
  const texts = collectTexts(FLAVOR_PACKS[packId]);
  return page.evaluate(({ packTexts }) => {
    const text = (document.body.innerText || document.body.textContent || '').replace(/\s+/g, ' ').trim();
    const normalized = text.toLocaleLowerCase('en-US');
    const matches = packTexts.filter((line) => normalized.includes(
      String(line).replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US'),
    ));
    const overlays = [...document.querySelectorAll([
      '#vite-error-overlay', 'vite-error-overlay', '#webpack-dev-server-client-overlay',
      'nextjs-portal', '[data-nextjs-dialog-overlay]', '.runtime-error',
    ].join(','))].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    return {
      visibleTextLength: text.length,
      exactPackLinesVisible: matches,
      frameworkOverlayCount: overlays.length,
      topScreen: window.SF.ctx.screenManager.top(),
      mode: window.SF.state.mode,
      sectorId: window.SF.state.world.currentSectorId,
      docked: window.SF.state.ui.docked,
      dockedStationId: window.SF.state.ui.dockedStationId,
    };
  }, { packTexts: texts });
}

async function waitForPackLine(page, packId, timeout = 12_000) {
  const texts = collectTexts(FLAVOR_PACKS[packId]);
  await page.waitForFunction((packTexts) => {
    const normalized = (document.body.innerText || document.body.textContent || '')
      .replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
    return packTexts.some((line) => normalized.includes(
      String(line).replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US'),
    ));
  }, texts, { timeout });
  return inspectPresentation(page, packId);
}

async function validatePng(file) {
  const info = await stat(file);
  assert(info.isFile(), `${relative(file)} must be a file`);
  assert(info.size >= MIN_PNG_BYTES, `${relative(file)} is too small (${info.size} bytes)`);
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative(file)} must be PNG`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.deepEqual({ width, height }, VIEWPORT, `${relative(file)} dimensions`);
  return {
    file: relative(file),
    width,
    height,
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function captureFrame(page, { index, packId, caseId = packId, status, surface, assertions, compression }) {
  const presentation = await inspectPresentation(page, packId);
  assert.equal(presentation.frameworkOverlayCount, 0, `${packId} must not show a framework overlay`);
  if (status !== 'reachable' && status !== 'partial-reachable') {
    assert.deepEqual(presentation.exactPackLinesVisible, [], `${packId} negative frame must not fake authored copy`);
  } else {
    assert(presentation.exactPackLinesVisible.length > 0, `${packId} positive frame must visibly carry authored copy`);
  }
  const file = path.join(OUT, `${String(index).padStart(2, '0')}-${caseId.replace(/_/g, '-')}.png`);
  await page.screenshot({ path: file, type: 'png' });
  return {
    packId,
    caseId,
    status,
    surface,
    presentation,
    image: await validatePng(file),
    compression,
    assertions,
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const audit = await auditReachability();
  assert.deepEqual(audit.map((row) => row.packId), [...PACK_IDS], 'audit pack order');
  assert.deepEqual(audit.filter((row) => row.status === 'reachable').map((row) => row.packId),
    ['graffiti', 'roaming_events'], 'known live presentation pack set');
  assert.deepEqual(audit.filter((row) => row.status === 'partial-reachable').map((row) => row.packId),
    ['wreck_rumors', 'landmark_lore'], 'known partial live presentation pack set');
  assert.deepEqual(audit.filter((row) => row.status === 'state-only').map((row) => row.packId),
    ['set_piece_missions'], 'known state-only presentation pack set');

  const executablePath = systemBrowserPath();
  assert(executablePath, 'Chrome or Edge is required for V2 live presentation capture');
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
  const httpErrors = [];
  const requestFailures = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push({ status: response.status(), url: response.url() });
  });
  page.on('requestfailed', (request) => requestFailures.push({
    url: request.url(),
    errorText: request.failure() && request.failure().errorText || 'unknown request failure',
  }));

  try {
    const startup = await bootCanonicalFlight(page, probe.baseUrl);
    assert.equal(startup.seed, CAPTURE_SEED, 'canonical New Game seed');
    assert.equal(startup.mode, 'flight', 'canonical New Game must reach flight');
    assert.equal(startup.libraryUsable, true, 'authored part library must be usable');
    assert.equal(startup.criticalVisuals.ready, true, 'critical authored visuals must be ready');
    const staging = await prepareCapture(page);
    const compressionLedger = staging.compressions.map((detail) => ({ case: 'startup', kind: 'state/pacing', detail }));
    const frames = [];

    const adTravel = await openStation(page, {
      caseId: 'ad_board', sectorId: 'sector_helios_prime', stationId: 'station_helios', tabId: 'market',
    });
    compressionLedger.push({ case: 'ad_board', kind: 'travel/state', detail: adTravel.compression });
    frames.push(await captureFrame(page, {
      index: 1,
      packId: 'ad_board',
      status: 'unreachable',
      surface: 'Helios Prime shipped station Market/dockside hub',
      compression: [adTravel.compression],
      assertions: { stationHubVisible: true, authoredAdCopyAbsent: true, replacementUiInjected: false },
    }));

    const graffitiTravel = await openFlight(page, {
      caseId: 'graffiti', sectorId: 'sector_helios_prime',
    });
    compressionLedger.push({ case: 'graffiti', kind: 'travel/state', detail: graffitiTravel.compression });
    const graffiti = await stagePhysicalE1Graffiti(page);
    const graffitiCompression = 'called encounterDirector.requestAuthoredEncounter for the physical H1 mayday, then clicked the shipped Board choice; no encounter choice or graffiti event was injected';
    compressionLedger.push({ case: 'graffiti', kind: 'encounter/choice', detail: graffitiCompression });
    frames.push(await captureFrame(page, {
      index: 2,
      packId: 'graffiti',
      status: 'reachable',
      surface: 'Helios physical Vols mayday wreck -> shipped Board choice -> persistent bulkhead graffiti',
      compression: [graffitiTravel.compression, graffitiCompression],
      assertions: {
        physicalWreckCarrier: graffiti.physicalWreck,
        completionOutcome: graffiti.completion.outcome,
        persistentBlackBox: graffiti.persistentCargo.includes('depth_vols_black_box'),
        blockedReplay: graffiti.blockedReplay,
        exactAuthoredVolsLine: graffiti.bulkheadLine,
        shippedChoiceButtonClicked: true,
        encounterChoiceInjected: false,
        graffitiEventInjected: false,
      },
    }));

    const wreckTravel = await openStation(page, {
      caseId: 'wreck_rumors', sectorId: 'sector_helios_prime', stationId: 'station_helios', tabId: 'bar',
    });
    compressionLedger.push({ case: 'wreck_rumors', kind: 'travel/state', detail: wreckTravel.compression });
    await waitForVisible(page, '.st-bar', 'Helios Bar');
    const barState = await page.evaluate(() => ({
      contactCount: document.querySelectorAll('.st-bar [data-contact]').length,
      rumorChoiceCount: document.querySelectorAll('.st-bar [data-choice="rumors"]').length,
      silverDraftBearing: window.SF.state.player.uniqueWrecks
        && window.SF.state.player.uniqueWrecks.bearings.wreck_mts_silver_draft || null,
    }));
    assert.deepEqual(barState, { contactCount: 0, rumorChoiceCount: 0, silverDraftBearing: null },
      'live station Bar integration currently loses stationId and must not be mislabeled reachable');
    await page.waitForTimeout(160);
    frames.push(await captureFrame(page, {
      index: 3,
      packId: 'wreck_rumors',
      status: 'partial-reachable',
      surface: 'authored Helios wreck headline remains live while protected stationApp renders no Bar contacts or rumor choices',
      compression: [wreckTravel.compression],
      assertions: {
        shippedBarVisible: true,
        liveContactCount: barState.contactCount,
        liveRumorChoiceCount: barState.rumorChoiceCount,
        canonicalBearingCreated: false,
        authoredHeadlineVisible: true,
        authoredBarReplyVisible: false,
        protectedStationDefect: 'stationApp does not pass stationId to createBarPanel.onShow',
      },
    }));

    const roamingTravel = await openFlight(page, { caseId: 'roaming_events', sectorId: 'sector_ceres_belt' });
    compressionLedger.push({ case: 'roaming_events', kind: 'travel/state', detail: roamingTravel.compression });
    const convoy = await stageRealConvoy(page);
    assert.deepEqual(convoy.request, { ok: true, encounterId: 'v2-live-convoy' },
      `authored convoy forcing seam must materialize the production encounter: ${JSON.stringify(convoy.request)}`);
    assert.equal(convoy.route.familyId, 'convoy_industrial_route', 'live route family');
    assert.equal(convoy.route.sectorId, 'sector_ceres_belt', 'live route sector');
    assert.equal(convoy.route.zoneId, 'zone_ceres_refinery', 'deterministic live route zone');
    assert(convoy.physicalEntityIds.length > 0, 'real convoy encounter must spawn physical stamped entities');
    assert.equal(convoy.proofComposition.standoff, 74, 'convoy proof standoff');
    assert(convoy.proofComposition.cameraZoom >= 132, 'convoy proof camera must frame the formation');
    assert(convoy.record && ['event_insolvent', 'event_slow_fleet'].includes(convoy.record.eventId),
      'v2Flavor must bind the physical encounter to an authored roaming event');
    assert.equal(convoy.tunedChannelId, 'concord_bulletin', 'Band carrier must be tuned before spawn');
    assert.equal(convoy.v2FlavorSystem, 'v2Flavor', 'production v2Flavor system must be registered');
    const roamingVoice = await surfaceV2Voice(page, 'roaming_events');
    await waitForPackLine(page, 'roaming_events');
    await page.waitForTimeout(700);
    const convoyCompression = 'moved the real player to the live Ceres freight-route anchor, called the registered encounterDirector.requestAuthoredEncounter deterministic forcing seam, then backed off 74 world units and widened the chase proof to frame the physical convoy; no encounter event was injected';
    compressionLedger.push({ case: 'roaming_events', kind: 'encounter/time', detail: convoyCompression });
    const roamingVoiceCompression = 'advanced the registered one-voice arbiter once and dismissed competing authored encounter lines until the queued v2Flavor Band line held the floor';
    compressionLedger.push({ case: 'roaming_events', kind: 'presentation/time', detail: roamingVoiceCompression });
    frames.push(await captureFrame(page, {
      index: 4,
      packId: 'roaming_events',
      status: 'reachable',
      surface: 'Ceres Belt live industrial freight route -> physical convoy -> shipped Band presentation',
      compression: [roamingTravel.compression, convoyCompression, roamingVoiceCompression],
      assertions: {
        registeredV2FlavorRuntime: true,
        liveRoute: convoy.route,
        authoredEncounterRequest: convoy.request,
        physicalEncounterEntityIds: convoy.physicalEntityIds,
        proofComposition: convoy.proofComposition,
        boundRoamingRecord: convoy.record,
        tunedBandChannel: convoy.tunedChannelId,
        oneVoiceFloor: roamingVoice.active,
        oneVoiceTraversal: roamingVoice.traversed,
        authoredRoamingCopyVisible: true,
        encounterEventInjected: false,
      },
    }));
    await page.evaluate((zoom) => { window.SF.state.camera.zoom = zoom; }, convoy.proofComposition.previousCameraZoom);
    await page.waitForTimeout(220);

    const quiessenceTravel = await openFlight(page, { caseId: 'quiessence', sectorId: 'sector_pallas_drift' });
    compressionLedger.push({ case: 'quiessence', kind: 'travel/state', detail: quiessenceTravel.compression });
    await page.keyboard.press('KeyM');
    await waitForVisible(page, '[data-screen="galaxyMap"]', 'Pallas local map');
    const quiessenceRuntime = await page.evaluate(() => ({
      proximitySourcePresent: !!(window.SF.state.bandRadio && window.SF.state.bandRadio.proximitySources
        && window.SF.state.bandRadio.proximitySources.landmark_quiessence),
      physicalActorIds: (window.SF.state.entityList || []).filter((entity) => entity && entity.alive !== false
        && entity.data && (entity.data.flavorTargetRef === 'landmark_c14_quiessence'
          || entity.data.quiessenceShipIndex != null)).map((entity) => entity.id),
      v2FlavorSystem: window.SF.registry.get('v2Flavor') && window.SF.registry.get('v2Flavor').name,
    }));
    assert.equal(quiessenceRuntime.proximitySourcePresent, false);
    assert.deepEqual(quiessenceRuntime.physicalActorIds, []);
    assert.equal(quiessenceRuntime.v2FlavorSystem, 'v2Flavor');
    frames.push(await captureFrame(page, {
      index: 5,
      packId: 'quiessence',
      status: 'unreachable',
      surface: 'shipped Pallas Drift Local Map; v2Flavor binding exists but its physical Quiessence actor is absent',
      compression: [quiessenceTravel.compression],
      assertions: { localMapVisible: true, registeredV2FlavorRuntime: true, noPhysicalQuiessenceActor: true, noProximityProducerState: true, authoredCensusCopyAbsent: true },
    }));

    const hushTravel = await openFlight(page, { caseId: 'hush', sectorId: 'sector_eunomia_gulf' });
    compressionLedger.push({ case: 'hush', kind: 'travel/state', detail: hushTravel.compression });
    const hushRuntime = await page.evaluate(() => ({
      proximitySourcePresent: !!(window.SF.state.bandRadio && window.SF.state.bandRadio.proximitySources
        && window.SF.state.bandRadio.proximitySources.planet_hush),
      hushEntities: (window.SF.state.entityList || []).filter((entity) => entity && entity.alive !== false
        && entity.data && entity.data.flavorSourceId === 'planet_hush').map((entity) => entity.id),
      scannerSystem: window.SF.registry.get('scanner') && window.SF.registry.get('scanner').name,
      v2FlavorSystem: window.SF.registry.get('v2Flavor') && window.SF.registry.get('v2Flavor').name,
    }));
    assert.equal(hushRuntime.proximitySourcePresent, false);
    assert.deepEqual(hushRuntime.hushEntities, []);
    assert(hushRuntime.scannerSystem, 'shipped scanner system must exist for negative carrier evidence');
    assert.equal(hushRuntime.v2FlavorSystem, 'v2Flavor');
    frames.push(await captureFrame(page, {
      index: 6,
      packId: 'hush',
      status: 'unreachable',
      surface: 'shipped Eunomia Gulf flight scanner/HUD; v2Flavor binding exists but its physical Hush actor is absent',
      compression: [hushTravel.compression],
      assertions: { scannerSystemRegistered: true, registeredV2FlavorRuntime: true, noPhysicalHushActor: true, noProximityProducerState: true, authoredHushCopyAbsent: true },
    }));

    const landmarkCases = [{ index: 7, caseId: 'landmark_lore_c6', slot: 'C6', sectorId: 'sector_hyperion_cut', poiId: 'poi_hyperion_driller', targetRef: 'landmark_c6_caved_shaft' }, { index: 8, caseId: 'landmark_lore_c8', slot: 'C8', sectorId: 'sector_kepler_scar', poiId: 'poi_kepler_hulk', targetRef: 'landmark_c8_flight_deck' }];
    landmarkCases.push({ index: 9, caseId: 'landmark_lore_c10', slot: 'C10', sectorId: 'sector_proteus_well', poiId: 'poi_proteus_hulk', targetRef: 'landmark_c10_funnel' });
    for (const spec of landmarkCases) {
      const landmarkTravel = await openFlight(page, { caseId: spec.caseId, sectorId: spec.sectorId });
      compressionLedger.push({ case: spec.caseId, kind: 'travel/state', detail: landmarkTravel.compression });
      const landmark = await identifyPhysicalLandmark(page, spec);
      assert.equal(landmark.poi.poiId, spec.poiId, `${spec.slot} physical POI identity`);
      assert.equal(landmark.poi.entityAlive, true, `${spec.slot} physical POI must be alive`);
      assert.equal(landmark.discovery && landmark.discovery.identified, true,
        `${spec.slot} production proximity scan identification`);
      assert.equal(landmark.receipt, `landmark_lore:${spec.targetRef}:scan`,
        `${spec.slot} v2Flavor presentation receipt`);
      assert.equal(landmark.v2FlavorSystem, 'v2Flavor', `${spec.slot} production v2Flavor system`);
      const landmarkVoice = await surfaceV2Voice(page, 'landmark_lore');
      await waitForPackLine(page, 'landmark_lore');
      const landmarkCompression = `moved the real player to the physical ${spec.poiId} scan radius and called the registered world.update(0, state) once to exercise normal POI proximity identification`;
      compressionLedger.push({ case: spec.caseId, kind: 'proximity/time', detail: landmarkCompression });
      const landmarkVoiceCompression = 'advanced the registered one-voice arbiter so the queued v2Flavor scanner-lore line held the presentation floor';
      compressionLedger.push({ case: spec.caseId, kind: 'presentation/time', detail: landmarkVoiceCompression });
      frames.push(await captureFrame(page, {
        index: spec.index,
        packId: 'landmark_lore',
        caseId: spec.caseId,
        status: 'partial-reachable',
        surface: `${spec.slot} physical ${spec.poiId} -> production proximity identification -> shipped scanner-lore presentation`,
        compression: [landmarkTravel.compression, landmarkCompression, landmarkVoiceCompression],
        assertions: {
          programSlot: spec.slot,
          targetRef: spec.targetRef,
          registeredV2FlavorRuntime: true,
          physicalPoiCarrier: landmark.poi,
          productionDiscoveryRecord: landmark.discovery,
          presentationReceipt: landmark.receipt,
          oneVoiceFloor: landmarkVoice.active,
          oneVoiceTraversal: landmarkVoice.traversed,
          authoredLandmarkLoreVisible: true,
          poiIdentifiedEventInjected: false,
        },
      }));
    }

    await openFlight(page, { caseId: 'set_piece_missions-prep', sectorId: 'sector_pallas_drift' });
    const setPiecePrep = await page.evaluate(() => {
      const missions = window.SF.registry.get('missions');
      if (!missions || typeof missions.ensureBoard !== 'function') throw new Error('missions.ensureBoard unavailable');
      const board = missions.ensureBoard('station_drift');
      const offer = board && board.slots && board.slots.find((row) => row && row.source === 'setPieceMission');
      return offer && {
        id: offer.id,
        title: offer.title,
        summary: offer.summary,
        source: offer.source,
        instructionRef: offer.cause && offer.cause.instructionRef,
        archetypeId: offer.cause && offer.cause.archetypeId,
      };
    });
    assert(setPiecePrep, 'station_drift must receive a production set-piece opening offer');
    assert.equal(setPiecePrep.instructionRef, 'mission.sp1.long_read.rumor_survey.instruction');
    assert.equal(setPiecePrep.summary, FLAVOR_SOURCE_BY_REF[setPiecePrep.instructionRef].text);
    const setPieceTravel = await openStation(page, {
      caseId: 'set_piece_missions', sectorId: 'sector_pallas_drift', stationId: 'station_drift', tabId: 'contracts',
    });
    compressionLedger.push({ case: 'set_piece_missions', kind: 'travel/state', detail: setPieceTravel.compression });
    await waitForVisible(page, '.sx-ct', 'Drift Market live Contracts board');
    const offerCard = page.locator('.sx-ct-row').filter({ hasText: setPiecePrep.title }).first();
    assert.equal(await offerCard.count(), 1, 'set-piece offer card must be visible');
    await offerCard.click();
    await waitForVisible(page, '.sx-ct__dossier', 'live contract dossier');
    const setPiecePresentation = await page.evaluate((authoredSummary) => ({
      visibleBrief: (document.querySelector('.sx-ct__dossier')?.textContent || '').replace(/\s+/g, ' ').trim(),
      authoredSummaryVisible: (document.body.innerText || '').includes(authoredSummary),
    }), setPiecePrep.summary);
    assert.equal(setPiecePresentation.authoredSummaryVisible, false,
      'set-piece board must not be mislabeled positive while live Contracts drops offer.summary');
    assert(setPiecePresentation.visibleBrief.length > 20, 'live Contracts dossier must remain visible');
    frames.push(await captureFrame(page, {
      index: 10,
      packId: 'set_piece_missions',
      status: 'state-only',
      surface: 'Pallas Drift -> Drift Market -> live Contracts dossier',
      compression: [setPieceTravel.compression],
      assertions: {
        missionsSystemCompiledOffer: true,
        canonicalInstructionRef: setPiecePrep.instructionRef,
        authoredInstructionPresentInOfferState: true,
        authoredInstructionVisible: false,
        genericVisibleBrief: setPiecePresentation.visibleBrief,
        shippedContractPreflightVisible: true,
      },
    }));

    assert.equal(frames.length, EXPECTED_FRAME_COUNT, 'ten evidence frames across eight non-Band V2 packs');
    assert.equal(new Set(frames.map((row) => row.image.file)).size, EXPECTED_FRAME_COUNT, 'unique frame files');
    assert.equal(new Set(frames.map((row) => row.image.sha256)).size, EXPECTED_FRAME_COUNT, 'unique frame hashes');
    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join('\n')}`);
    assert.deepEqual(httpErrors, [], `HTTP errors: ${JSON.stringify(httpErrors)}`);
    assert.deepEqual(requestFailures, [], `request failures: ${JSON.stringify(requestFailures)}`);

    const evidence = {
      schema: 'spaceface.depthProgram.v2LivePresentationEvidence.v1',
      program: 'SpaceFace Depth Program V2 live presentation',
      result: 'partial-reachability-defect',
      generatedAt: new Date().toISOString(),
      deterministicSeed: CAPTURE_SEED,
      runner: {
        automation: 'Playwright',
        browser: 'system Chrome/Chromium channel',
        executablePath,
        headless: true,
        browserPluginClassification: 'invocation failed',
        browserPluginFailure: 'Cannot redefine property: process',
        fallbackAuthorization: 'V2 evidence task explicitly authorized system Chrome fallback after the documented plugin bootstrap failure.',
      },
      route: {
        canonicalRoot: true,
        url: startup.route,
        queryFlags: false,
        fixturePage: false,
        alternateAssetMode: false,
      },
      startup,
      staging,
      packCount: PACK_IDS.length,
      reachableCount: audit.filter((row) => row.status === 'reachable').length,
      partialReachableCount: audit.filter((row) => row.status === 'partial-reachable').length,
      stateOnlyCount: audit.filter((row) => row.status === 'state-only').length,
      unreachableCount: audit.filter((row) => row.status === 'unreachable').length,
      reachabilityAudit: audit,
      compressionLedger,
      frames,
      validation: {
        expectedFrames: EXPECTED_FRAME_COUNT,
        capturedFrames: frames.length,
        uniqueScreenshots: new Set(frames.map((row) => row.image.file)).size,
        uniqueImageHashes: new Set(frames.map((row) => row.image.sha256)).size,
        viewport: VIEWPORT,
        minimumPngBytes: MIN_PNG_BYTES,
        everyNonPositiveFrameFreeOfInjectedPackCopy: frames
          .filter((row) => !['reachable', 'partial-reachable'].includes(row.status))
          .every((row) => row.presentation.exactPackLinesVisible.length === 0),
        pageErrors,
        consoleErrors,
        httpErrors,
        requestFailures,
      },
      limitations: [
        'Travel and dock time are compressed through window.SF on the canonical public route and itemized above.',
        'Protected station evidence also exposes the current Market Buy/base-fallback versus Sell/lastSell quote mismatch; this runner reports but does not patch it.',
        'Negative frames show the nearest shipped surface without injected corpus copy; their absence findings are corroborated by the runtime import/exact-copy audit.',
        'graffiti is live through the physical H1 mayday and the shipped Board choice; the capture forces encounter eligibility but injects neither the choice nor the graffiti event.',
        'roaming_events is live; landmark_lore is live for physical C6/C8/C10 carriers and absent for its other sixteen targets.',
        'wreck_rumors is partial because its Helios headline is live while its deliberate Bar rumor/bearing carrier is blocked.',
        'Its deliberate rumor/bearing path remains blocked because live stationApp omits stationId when showing createBarPanel.',
        'Quiessence and Hush fail closed because their explicit physical actors/proximity producers are absent; set_piece_missions reaches live Contracts state but its dossier hides the authored summary.',
      ],
    };
    await writeFile(MANIFEST, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`V2 live presentation capture complete: ${frames.length}/${EXPECTED_FRAME_COUNT} frames; reachable=2, partial=2, state-only=1, unreachable=3`);
    console.log(`Evidence: ${MANIFEST}`);
  } finally {
    await browser.close().catch(() => {});
    await probe.close().catch(() => {});
  }
}

await main();
