import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { frontierRumorOffer, TETHYS_BLACK_MARKET_DISCOVERY } from '../src/data/frontierRumors.js';
import { DEFAULTS as INPUT_DEFAULTS } from '../src/systems/input.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { MAP_FOCUS } from '../src/ui/mapAuthority.js';
import {
  focusMapSelectionHandoff,
  pickMapTargetAt,
  resolveCourseTarget,
  resolveGalaxyMapPlotAction,
  resolveGalaxyMapPrimaryAction,
} from '../src/ui/galaxyMap.js';
import { frontierRumorMapReadouts, frontierRumorMapTarget } from '../src/ui/frontierRumorMapLayer.js';
import { openTethysRumorGuidanceMap, tethysRumorGuidance } from '../src/ui/station/screens/bar.js';

const DISCOVERY = TETHYS_BLACK_MARKET_DISCOVERY;

function stateWithPurchasedTethysRumor() {
  const state = createGameState(4811);
  state.mode = 'flight';
  state.settings.gameplay.tutorialHints = false;
  state.world.currentSectorId = DISCOVERY.sectorId;
  const offer = frontierRumorOffer(state, DISCOVERY.stationId);
  assert.ok(offer, 'the authored Tethys rumor is the default first purchasable lead');
  state.world.frontierRumors.byId[offer.id] = { ...offer };
  return { state, offer };
}

test('PQ-048.19 keeps the purchased Tethys rumor as an accessible manual map handoff without a plotted route', () => {
  const { state, offer } = stateWithPurchasedTethysRumor();
  const navBefore = JSON.parse(JSON.stringify(state.nav));
  assert.equal(state.settings.gameplay.tutorialHints, false, 'hints-off does not suppress the route');
  assert.equal(BINDINGS.localmap.code, 'KeyM', 'expert local-map access remains available');
  assert.equal(BINDINGS.starmap.code, 'KeyN', 'expert star-map access remains available');
  assert.ok(INPUT_DEFAULTS.BINDINGS.scanPulse.includes('KeyC'), 'expert scanner-pulse access remains available');

  const guidance = tethysRumorGuidance(state, DISCOVERY.stationId);
  assert.deepEqual(guidance, {
    rumorId: DISCOVERY.rumorId,
    sectorId: DISCOVERY.sectorId,
    label: 'Quiet Traffic Lead',
  });

  const bus = createBus();
  const events = [];
  bus.on('ui:pushScreen', (payload) => events.push(payload));
  assert.equal(openTethysRumorGuidanceMap({ state, bus }, DISCOVERY.stationId), true);
  assert.deepEqual(state.ui.mapOpenIntent, {
    focus: MAP_FOCUS.SYSTEM,
    sectorId: DISCOVERY.sectorId,
    missionId: null,
    stationId: null,
    pos: null,
    label: 'Quiet Traffic Lead',
    source: 'station-bar:tethys-rumor-guidance',
  }, 'the Bar opens the ordinary system map handoff only');
  assert.deepEqual(events, [{ id: 'galaxyMap' }]);
  assert.deepEqual(state.nav, navBefore, 'opening the map does not create a course, route, or waypoint');

  const [readout] = frontierRumorMapReadouts(state, DISCOVERY.sectorId);
  assert.equal(readout.rumorId, offer.id);
  assert.equal(readout.fixedPos, null);
  assert.equal(readout.courseTarget, null);
  assert.equal(readout.selectable, true);
  assert.equal(readout.manualSearch, true);
  assert.match(readout.objective, /manually.*No waypoint/i);

  const target = frontierRumorMapTarget(readout);
  assert.equal(target.kind, 'rumor');
  assert.equal(target.courseDisabled, true);
  assert.equal(resolveCourseTarget(target), null, 'the selected ring cannot resolve a navigation payload');
  assert.equal(resolveGalaxyMapPrimaryAction(state, target), null, 'the inspector has no course action');
  const plot = resolveGalaxyMapPlotAction(state, target);
  assert.equal(plot.available, false, 'the place action cannot plot a route to a rumor ring');
  assert.match(plot.reason, /manual.*scanner/i);
  assert.deepEqual(state.nav, navBefore, 'all map action resolvers leave navigation untouched');

  const ringHit = pickMapTargetAt([{ ...target, sx: 100, sy: 100, radiusPx: 18, ringRadiusPx: 60 }], 160, 100);
  assert.equal(ringHit?.rumorId, DISCOVERY.rumorId, 'the broad visual ring itself remains selectable');
});

test('PQ-048.19 keyboard rumor activation keeps focus on the persistent map dialog', () => {
  const { state } = stateWithPurchasedTethysRumor();
  const [readout] = frontierRumorMapReadouts(state, DISCOVERY.sectorId);
  const target = frontierRumorMapTarget(readout);
  const action = resolveGalaxyMapPrimaryAction(state, target);
  assert.equal(action, null, 'the manual rumor correctly has no primary navigation action');

  let rootFocusOptions = null;
  const mapRoot = {
    focus(options) { rootFocusOptions = options; },
  };
  const hiddenPrimary = {
    hidden: true,
    disabled: true,
    focus() { assert.fail('manual rumor selection must not focus the hidden course control'); },
  };
  assert.equal(focusMapSelectionHandoff({
    action,
    primaryControl: hiddenPrimary,
    mapRoot,
  }), true);
  assert.deepEqual(rootFocusOptions, { preventScroll: true },
    'refresh returns focus to the stable normal-map root instead of dropping it with the activated row');
});
