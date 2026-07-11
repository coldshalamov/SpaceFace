#!/usr/bin/env node
// UIUX-MAP-AUTHORITY-IMPL-001 — galaxyMap is the single normal-player map surface.
// Covers keyboard N/M, gamepad View, touch Local/Star, Mission Log, station Plot Route,
// legacy starmap objective CTAs, and focus-data consumption by galaxyMap.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  MAP_FOCUS,
  MAP_SCREEN_ID,
  focusFromLegacyScreenId,
  isMapScreenId,
  mapHandoffAction,
  normalizeMapFocus,
  normalizeMapOpenIntent,
  openGalaxyMap,
  peekMapOpenIntent,
  setMapOpenIntent,
  takeMapOpenIntent,
} from '../src/ui/mapAuthority.js';
import {
  applyMapOpenIntentToView,
  galaxyMapScreen,
  levelForZoom,
  zoomForMapFocus,
  LEVEL_LOCAL_AT,
  LEVEL_SYSTEM_AT,
} from '../src/ui/galaxyMap.js';
import {
  missionMapAction,
  tradeRouteMapAction,
} from '../src/ui/screens/missionLog.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// Pure authority helpers
// ---------------------------------------------------------------------------
{
  assert.equal(normalizeMapFocus('local'), MAP_FOCUS.LOCAL);
  assert.equal(normalizeMapFocus('localmap'), MAP_FOCUS.LOCAL);
  assert.equal(normalizeMapFocus('starmap'), MAP_FOCUS.GALAXY);
  assert.equal(normalizeMapFocus('star'), MAP_FOCUS.GALAXY);
  assert.equal(normalizeMapFocus('system'), MAP_FOCUS.SYSTEM);
  assert.equal(focusFromLegacyScreenId('localmap'), MAP_FOCUS.LOCAL);
  assert.equal(focusFromLegacyScreenId('starmap'), MAP_FOCUS.GALAXY);
  assert.equal(isMapScreenId('galaxyMap'), true);
  assert.equal(isMapScreenId('localmap'), true);
  assert.equal(isMapScreenId('starmap'), true);
  assert.equal(isMapScreenId('missionLog'), false);

  const handoffLocal = mapHandoffAction({ focus: MAP_FOCUS.LOCAL, missionId: 'm1', sectorId: 's1' });
  assert.equal(handoffLocal.screenId, MAP_SCREEN_ID);
  assert.equal(handoffLocal.focus, MAP_FOCUS.LOCAL);
  assert.equal(handoffLocal.label, 'LOCAL MAP');
  assert.equal(handoffLocal.missionId, 'm1');

  const handoffStar = mapHandoffAction({ focus: MAP_FOCUS.GALAXY, sectorId: 's2' });
  assert.equal(handoffStar.screenId, MAP_SCREEN_ID);
  assert.equal(handoffStar.focus, MAP_FOCUS.GALAXY);
  assert.equal(handoffStar.label, 'STAR MAP');
}

// Intent set / take / open
{
  const state = { ui: { mapOpenIntent: null } };
  const pushed = [];
  const ctx = {
    state,
    bus: { emit() {} },
    screenManager: {
      pushScreen(id) { pushed.push(id); },
      top() { return null; },
    },
  };
  const ok = openGalaxyMap(ctx, {
    focus: MAP_FOCUS.LOCAL,
    missionId: 'm_open',
    sectorId: 'sector_helios_prime',
    pos: { x: 10, z: -4 },
    source: 'test',
  });
  assert.equal(ok, true);
  assert.deepEqual(pushed, [MAP_SCREEN_ID]);
  const peek = peekMapOpenIntent(state);
  assert.equal(peek.focus, MAP_FOCUS.LOCAL);
  assert.equal(peek.missionId, 'm_open');
  assert.equal(peek.pos.x, 10);
  const taken = takeMapOpenIntent(state);
  assert.equal(taken.focus, MAP_FOCUS.LOCAL);
  assert.equal(state.ui.mapOpenIntent, null);

  // Legacy screenId without focus derives LOCAL / GALAXY.
  const legacy = normalizeMapOpenIntent({ screenId: 'starmap', sectorId: 'sector_tethys_junction' });
  assert.equal(legacy.focus, MAP_FOCUS.GALAXY);
  assert.equal(legacy.sectorId, 'sector_tethys_junction');
}

// Focus → zoom consumption (galaxyMap pure apply)
{
  assert.ok(zoomForMapFocus(MAP_FOCUS.LOCAL) >= LEVEL_LOCAL_AT);
  assert.ok(zoomForMapFocus(MAP_FOCUS.SYSTEM) >= LEVEL_SYSTEM_AT);
  assert.ok(zoomForMapFocus(MAP_FOCUS.SYSTEM) < LEVEL_LOCAL_AT);
  assert.ok(zoomForMapFocus(MAP_FOCUS.GALAXY) < LEVEL_SYSTEM_AT);

  const viewLocal = applyMapOpenIntentToView(
    { zoom: 1, targetZoom: 1, cams: { galaxy: { cx: 0, cy: 0 }, system: { cx: 0, cy: 0 }, local: { cx: 0, cy: 0 } } },
    { focus: MAP_FOCUS.LOCAL, pos: { x: 120, z: -40 } },
    { playerId: 1, entities: new Map() },
  );
  assert.equal(levelForZoom(viewLocal.zoom), 'local');
  assert.equal(viewLocal.cams.local.cx, 120);
  assert.equal(viewLocal.cams.local.cy, -40);

  const viewGalaxy = applyMapOpenIntentToView(
    { zoom: 1, targetZoom: 1, cams: { galaxy: { cx: 0, cy: 0 }, system: { cx: 0, cy: 0 }, local: { cx: 0, cy: 0 } } },
    { focus: MAP_FOCUS.GALAXY, sectorId: 'sector_tethys_junction' },
    {
      world: { currentSectorId: 'sector_helios_prime' },
      content: {
        sectors: [
          { id: 'sector_helios_prime', position: { x: 0, y: 0 } },
          { id: 'sector_tethys_junction', position: { x: 400, y: -200 } },
        ],
      },
    },
  );
  assert.equal(levelForZoom(viewGalaxy.zoom), 'galaxy');
  assert.equal(viewGalaxy.cams.galaxy.cx, 400);
  assert.equal(viewGalaxy.cams.galaxy.cy, -200);

  // Screen onShow consumes intent headlessly.
  const showState = {
    ui: {},
    playerId: 0,
    entities: new Map(),
    world: { currentSectorId: 'sector_helios_prime' },
  };
  setMapOpenIntent(showState, { focus: MAP_FOCUS.LOCAL, pos: { x: 5, z: 9 }, source: 'test-show' });
  galaxyMapScreen.onShow({ state: showState });
  assert.equal(levelForZoom(galaxyMapScreen._zoom), 'local');
  assert.equal(showState.ui.mapOpenIntent, null, 'onShow must clear the one-shot intent');
  assert.equal(galaxyMapScreen._cams.local.cx, 5);
  assert.equal(galaxyMapScreen._cams.local.cy, 9);
  galaxyMapScreen.onHide();
}

// Mission Log policy → galaxyMap + focus (not legacy screens)
{
  function mission(overrides = {}) {
    return {
      id: 'mission_delivery',
      status: 'active',
      type: 'cargo_delivery',
      title: 'Deliver provisions',
      destStationId: 'station_helios',
      destSectorId: 'sector_helios_prime',
      objectiveProgress: 0,
      objectiveTarget: 1,
      ...overrides,
    };
  }
  function state(overrides = {}) {
    return {
      world: { currentSectorId: 'sector_helios_prime' },
      ui: { trackedMissionId: 'mission_delivery' },
      nav: { route: null, waypoint: null },
      ...overrides,
    };
  }

  const local = missionMapAction(state({
    nav: {
      waypoint: {
        kind: 'mission',
        missionId: 'mission_delivery',
        sectorId: 'sector_helios_prime',
        pos: { x: 180, z: -40 },
      },
    },
  }), mission(), true);
  assert.equal(local.screenId, MAP_SCREEN_ID);
  assert.equal(local.focus, MAP_FOCUS.LOCAL);
  assert.equal(local.label, 'LOCAL MAP');
  assert.equal(local.missionId, 'mission_delivery');
  assert.ok(local.pos && local.pos.x === 180);

  const star = missionMapAction(state({
    nav: {
      waypoint: {
        kind: 'mission',
        missionId: 'mission_delivery',
        sectorId: 'sector_tethys_junction',
      },
    },
  }), mission({ destSectorId: 'sector_tethys_junction', destStationId: 'station_tethys' }), true);
  assert.equal(star.screenId, MAP_SCREEN_ID);
  assert.equal(star.focus, MAP_FOCUS.GALAXY);
  assert.equal(star.label, 'STAR MAP');
  assert.equal(star.sectorId, 'sector_tethys_junction');

  const tradeLocal = tradeRouteMapAction(state({
    ui: { trackedMissionId: null },
    nav: {
      waypoint: {
        kind: 'trade',
        stationId: 'station_helios',
        commodityId: 'cmdty_food',
        sectorId: 'sector_helios_prime',
        pos: { x: 12, z: 24 },
      },
    },
  }));
  assert.equal(tradeLocal.screenId, MAP_SCREEN_ID);
  assert.equal(tradeLocal.focus, MAP_FOCUS.LOCAL);

  const tradeStar = tradeRouteMapAction(state({
    ui: { trackedMissionId: null },
    nav: {
      waypoint: {
        kind: 'trade',
        stationId: 'station_tethys',
        commodityId: 'cmdty_food',
        sectorId: 'sector_tethys_junction',
      },
    },
  }));
  assert.equal(tradeStar.screenId, MAP_SCREEN_ID);
  assert.equal(tradeStar.focus, MAP_FOCUS.GALAXY);
}

// ---------------------------------------------------------------------------
// Source wiring: keyboard / gamepad / touch / mission / station / starmap / bus
// ---------------------------------------------------------------------------
const uiInputSrc = read('src/ui/input.js');
const missionLogSrc = read('src/ui/screens/missionLog.js');
const stationHubSrc = read('src/ui/screens/stationHub.js');
const starmapSrc = read('src/ui/screens/starmap.js');
const uiRootSrc = read('src/ui/uiRoot.js');
const galaxyMapSrc = read('src/ui/galaxyMap.js');
const mapAuthSrc = read('src/ui/mapAuthority.js');

assert.match(mapAuthSrc, /export function openGalaxyMap/, 'mapAuthority must export openGalaxyMap');
assert.match(galaxyMapSrc, /takeMapOpenIntent|applyMapOpenIntentToView/,
  'galaxyMap must consume map-authority open intent');
assert.match(galaxyMapSrc, /export function applyMapOpenIntentToView/,
  'galaxyMap must expose pure focus application for checks');

// Keyboard N = LOCAL, M = GALAXY
assert.match(uiInputSrc, /BINDINGS\.localmap\.key[\s\S]*openGalaxyMap\([\s\S]*MAP_FOCUS\.LOCAL/,
  'Keyboard N must open galaxyMap at LOCAL focus');
assert.match(uiInputSrc, /BINDINGS\.starmap\.key[\s\S]*openGalaxyMap\([\s\S]*MAP_FOCUS\.GALAXY/,
  'Keyboard M must open galaxyMap at GALAXY focus');
assert.doesNotMatch(uiInputSrc, /case BINDINGS\.localmap\.key:[\s\S]{0,120}pushScreen\('localmap'\)/,
  'Keyboard localmap binding must not push the legacy localmap screen');
assert.doesNotMatch(uiInputSrc, /case BINDINGS\.starmap\.key:[\s\S]{0,120}pushScreen\('starmap'\)/,
  'Keyboard starmap binding must not push the legacy starmap screen');

// Gamepad View opens galaxyMap; toggles closed when map surface is topmost
assert.match(uiInputSrc, /gp\.actions\.map[\s\S]*openGalaxyMap\([\s\S]*MAP_FOCUS\.GALAXY[\s\S]*source:\s*'gamepad'/,
  'Gamepad View/map must open galaxyMap at GALAXY focus');
assert.match(uiInputSrc, /isMapScreenId\(top\)[\s\S]*gp\.actions\.map[\s\S]*popScreen/,
  'Gamepad View/map must close when a map surface is already topmost');
assert.doesNotMatch(uiInputSrc, /pushScreen\('starmap'\)/,
  'Gamepad path must not push legacy starmap as the normal-player map');

// Touch Local/Star → galaxyMap with matching focus
assert.match(uiInputSrc, /action === 'localmap'[\s\S]*openMapFromTouch\(MAP_FOCUS\.LOCAL\)/,
  'Touch localmap action must open galaxyMap at LOCAL focus');
assert.match(uiInputSrc, /action === 'starmap'[\s\S]*openMapFromTouch\(MAP_FOCUS\.GALAXY\)/,
  'Touch starmap action must open galaxyMap at GALAXY focus');
assert.match(uiInputSrc, /function openMapFromTouch\(focus\)[\s\S]*openGalaxyMap/,
  'Touch map helper must route through openGalaxyMap');

// Mission Log
assert.match(missionLogSrc, /mapHandoffAction|openGalaxyMap/,
  'Mission Log must use map authority helpers');
assert.match(missionLogSrc, /data-map-focus/,
  'Mission Log map buttons must carry explicit focus data');
assert.match(missionLogSrc, /openMapScreen\(ctx, mapOpenIntentFromButton/,
  'Mission Log openMap must pass full focus/target intent');
assert.doesNotMatch(missionLogSrc, /screenId:\s*'localmap'/,
  'Mission Log policy must not hand off to legacy localmap screen id');
assert.doesNotMatch(missionLogSrc, /screenId:\s*'starmap'/,
  'Mission Log policy must not hand off to legacy starmap screen id');

// Station Plot Route
assert.match(stationHubSrc, /openGalaxyMap\(ctx,[\s\S]*MAP_FOCUS\.LOCAL[\s\S]*MAP_FOCUS\.GALAXY[\s\S]*source:\s*'stationHub'/,
  'Station Plot Route must open galaxyMap with LOCAL/GALAXY focus and station source');
assert.doesNotMatch(stationHubSrc, /ui:pushScreen',\s*\{\s*id:\s*local \? 'localmap'/,
  'Station Plot Route must not emit legacy localmap/starmap screen ids');

// Legacy starmap objective CTA
assert.match(starmapSrc, /objective-localmap[\s\S]*openGalaxyMap[\s\S]*MAP_FOCUS\.LOCAL/,
  'Legacy starmap Local Map CTA must open galaxyMap at LOCAL focus');
assert.doesNotMatch(starmapSrc, /objective-localmap[\s\S]{0,200}pushScreen\(this\._ctx, 'localmap'\)/,
  'Legacy starmap Local Map CTA must not push the legacy localmap screen');

// Bus-level catch-all
assert.match(uiRootSrc, /isMapScreenId\(id\)[\s\S]*openGalaxyMap/,
  'ui:pushScreen must route map ids through openGalaxyMap');

// Legacy screens still registered (not deleted this packet)
assert.match(uiRootSrc, /screens\/starmap\.js/, 'legacy starmap screen module must remain registered');
assert.match(uiRootSrc, /screens\/localmap\.js/, 'legacy localmap screen module must remain registered');
assert.match(uiRootSrc, /galaxyMap\.js/, 'galaxyMap must remain the live map module');

// Do not edit systems/input.js for this packet (authority is UI-owned).
const systemsInput = read('src/systems/input.js');
assert.ok(systemsInput.length > 100, 'systems/input.js remains present (UI map authority does not own it)');

console.log('Map authority OK — galaxyMap is the single normal-player map surface with LOCAL/GALAXY focus intent.');
