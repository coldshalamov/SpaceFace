import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TETHYS_BLACK_MARKET_DISCOVERY } from '../src/data/frontierRumors.js';
import { DEFAULTS as INPUT_DEFAULTS } from '../src/systems/input.js';
import { BINDINGS } from '../src/ui/bindings.js';
import {
  clearCodexDiscoveryRequest,
  codexScreen,
  consumeCodexDiscoveryRequest,
  focusCodexDiscoveryEntry,
  openTethysCodexReturn,
  requestCodexDiscovery,
  tethysCodexReturnIntent,
} from '../src/ui/screens/codex.js';
import { tethysCodexTargetForCompletion } from '../src/ui/signalInvestigationPrompt.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const DISCOVERY = TETHYS_BLACK_MARKET_DISCOVERY;

function contactedTethysState() {
  const state = createGameState(4811);
  state.mode = 'flight';
  state.simTime = 42;
  state.settings.gameplay.tutorialHints = false;
  state.world.currentSectorId = DISCOVERY.sectorId;
  state.world.discovery[DISCOVERY.sectorId] = {
    discovered: true,
    visitedCount: 1,
    fieldsDepleted: {},
    pois: {
      [DISCOVERY.poiId]: {
        discovered: true,
        identified: true,
        investigated: true,
        investigatedAt: state.simTime,
      },
    },
  };
  state.world.frontierRumors = {
    ...(state.world.frontierRumors || {}),
    byId: {
      ...((state.world.frontierRumors && state.world.frontierRumors.byId) || {}),
      [DISCOVERY.rumorId]: {
        phase: 'contacted',
        contactId: DISCOVERY.contactId,
        opportunity: {
          type: DISCOVERY.opportunityType,
          stationId: DISCOVERY.stationId,
          status: 'available',
        },
      },
    },
  };
  return state;
}

function restoredState(state) {
  const restored = createGameState(4811);
  restored.mode = state.mode;
  restored.simTime = state.simTime;
  restored.settings.gameplay.tutorialHints = state.settings.gameplay.tutorialHints;
  restored.world.currentSectorId = state.world.currentSectorId;
  restored.world.discovery = structuredClone(state.world.discovery);
  restored.world.frontierRumors = structuredClone(state.world.frontierRumors);
  return restored;
}

test('PQ-048.20 hands the exact Tethys completion to its persisted Codex plate once', async () => {
  clearCodexDiscoveryRequest();
  const state = contactedTethysState();
  const payload = {
    signalId: `signal:poi:${DISCOVERY.poiId}`,
    sectorId: DISCOVERY.sectorId,
    sourceId: DISCOVERY.poiId,
  };
  const target = tethysCodexTargetForCompletion(state, payload);
  assert.deepEqual(target, { sectorId: DISCOVERY.sectorId, poiId: DISCOVERY.poiId });

  const [plate] = explorationDiscoveryPlates(state).filter((entry) => entry.poiId === DISCOVERY.poiId);
  assert.ok(plate, 'the existing world record projects an actual Codex plate');
  assert.equal(plate.id, `${DISCOVERY.sectorId}:${DISCOVERY.poiId}`);
  assert.equal(plate.title, 'Black Market Contact', 'the handoff does not manufacture a Codex entry');

  assert.equal(requestCodexDiscovery(target), true);
  assert.equal(consumeCodexDiscoveryRequest(state)?.id, plate.id, 'the valid request resolves the stable plate');
  assert.equal(consumeCodexDiscoveryRequest(state), null, 'the request is one-shot');

  const previousScreen = {
    activeTab: codexScreen._activeTab,
    query: codexScreen._query,
    requestedDiscoveryId: codexScreen._requestedDiscoveryId,
    body: codexScreen._body,
    visible: codexScreen._visible,
  };
  try {
    codexScreen._body = null;
    codexScreen._activeTab = 'Story';
    codexScreen._query = 'stale search';
    assert.equal(requestCodexDiscovery(target), true);
    codexScreen.onShow({ state });
    assert.equal(codexScreen._activeTab, 'Discoveries', 'the one-shot target selects the real evidence tab');
    assert.equal(codexScreen._query, '', 'a prior search cannot hide the focused plate');
    assert.equal(codexScreen._requestedDiscoveryId, plate.id);
    await Promise.resolve();
    assert.equal(codexScreen._requestedDiscoveryId, null, 'focus identity is discarded after the show pass');
  } finally {
    Object.assign(codexScreen, previousScreen);
  }

  assert.equal(requestCodexDiscovery({ sectorId: DISCOVERY.sectorId, poiId: 'missing-poi' }), true);
  assert.equal(consumeCodexDiscoveryRequest(state), null, 'a stale or invalid projected plate fails closed');

  let focusOptions = null;
  assert.equal(focusCodexDiscoveryEntry({ focus(options) { focusOptions = options; } }), true);
  assert.deepEqual(focusOptions, { preventScroll: true }, 'the target has a non-scrolling programmatic focus path');

  const restored = restoredState(state);
  assert.equal(restored.settings.gameplay.tutorialHints, false, 'hints-off persists independently of the discovery');
  assert.deepEqual(
    explorationDiscoveryPlates(restored).filter((entry) => entry.poiId === DISCOVERY.poiId),
    [plate],
    'Continue reconstructs the same evidence from world state without a persisted UI request',
  );
  assert.deepEqual(tethysCodexTargetForCompletion(restored, payload), target);
  clearCodexDiscoveryRequest();
});

test('PQ-048.20 return action selects Tethys through the normal map without creating a route or offer', () => {
  const state = contactedTethysState();
  const plate = explorationDiscoveryPlates(state).find((entry) => entry.poiId === DISCOVERY.poiId);
  const navBefore = structuredClone(state.nav);
  const creditsBefore = state.player.credits;

  assert.equal(state.settings.gameplay.tutorialHints, false, 'hints-off does not suppress the discovery return');
  assert.equal(BINDINGS.codex.code, 'KeyK', 'the normal keyboard Codex binding remains the handoff path');
  assert.ok(INPUT_DEFAULTS.BINDINGS.scanPulse.includes('KeyC'), 'expert scan access remains unchanged');

  assert.deepEqual(tethysCodexReturnIntent(state, plate), {
    focus: 'system',
    sectorId: DISCOVERY.sectorId,
    stationId: DISCOVERY.stationId,
    label: 'Tethys Trade Hub',
    source: 'codex:tethys-black-market-return',
  });
  assert.equal(tethysCodexReturnIntent(state, { ...plate, id: 'forged:plate' }), null,
    'the return action remains bound to the existing projected discovery identity');

  const bus = createBus();
  const pushes = [];
  bus.on('ui:pushScreen', (payload) => pushes.push(payload));
  assert.equal(openTethysCodexReturn({ state, bus }, plate), true);
  assert.deepEqual(state.ui.mapOpenIntent, {
    focus: 'system',
    sectorId: DISCOVERY.sectorId,
    missionId: null,
    stationId: DISCOVERY.stationId,
    pos: null,
    label: 'Tethys Trade Hub',
    source: 'codex:tethys-black-market-return',
  });
  assert.deepEqual(pushes, [{ id: 'galaxyMap' }]);
  assert.deepEqual(state.nav, navBefore, 'the return action does not create a course, route, or waypoint');
  assert.equal(state.player.credits, creditsBefore, 'the return action does not write economy state');

  state.world.frontierRumors.byId[DISCOVERY.rumorId].phase = 'rumored';
  assert.equal(tethysCodexReturnIntent(state, plate), null, 'a non-contacted lead gets no fabricated return action');
  assert.equal(openTethysCodexReturn({ state, bus }, plate), false);
});
