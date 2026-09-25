import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  FIRST_TRADE_CONTRACT_SOURCE,
  buildFirstTradeOffer,
} from '../src/data/economyContractTemplates.js';
import {
  ONBOARDING_CHOICE_SOURCE,
  missions as missionsProto,
} from '../src/systems/missions.js';
import { BEATS, onboarding as onboardingProto } from '../src/systems/onboarding.js';

// The demo route docked and took a real delivery job while the rail still sat on beat 1, and
// the "n/12" status plus the stale derelict objective stayed up for the rest of the session.
// The rail's own recommended contract is the one accept that keeps it alive; any other job ends
// it through the same _finish() the choice beat uses.
const TETHER_BEAT = BEATS.findIndex((beat) => beat.key === 'tether');
const DOCK_BEAT = BEATS.findIndex((beat) => beat.key === 'dock');
const HELIOS = 'station_helios';

function freshOnboarding(currentBeat) {
  return {
    active: true,
    finished: false,
    currentBeat,
    beatDoneAt: {},
    firedFollowups: {},
    tutorialLog: [],
    oreCollected: 0,
    trainingOre: 0,
    tetherReeled: false,
    tetherBreaks: 0,
    beatAction: '',
    burstShots: 0,
    burstPeakHeat: 0,
    burstCooling: false,
  };
}

function makeHarness(currentBeat, seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'station';
  state.simTime = 720;
  state.world.currentSectorId = 'sector_helios_prime';
  state.ui.docked = true;
  state.ui.dockedStationId = HELIOS;
  state.player.credits = 20000;

  const bus = createBus();
  const helpers = {
    hash32,
    mulberry32,
    voice: { say: () => true },
  };
  const missions = Object.create(missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  const registry = { get: (name) => (name === 'missions' ? missions : null) };
  const onboarding = Object.create(onboardingProto);
  onboarding.init({ state, bus, helpers, registry });

  // init() does not replace an active tutorial bag, but keep the fixture explicit and pin the
  // stale objective marker the bug left on the glass.
  state.onboarding = freshOnboarding(currentBeat);
  state.nav.waypoint = {
    onboarding: true,
    label: 'Training Derelict',
    reason: 'Target the marked derelict.',
    markerId: 'onboarding:tether',
    pos: { x: 40, z: 0 },
  };
  const events = [];
  bus.on('tutorial:finished', (p) => events.push(p || {}));
  return { state, bus, missions, onboarding, tutorialFinished: events };
}

test('accepting a non-rail contract finishes the rail through _finish()', () => {
  const h = makeHarness(TETHER_BEAT);
  const board = h.missions.ensureBoard(HELIOS);
  const offer = board.slots.find((row) => row
    && row.source !== FIRST_TRADE_CONTRACT_SOURCE
    && row.source !== ONBOARDING_CHOICE_SOURCE);
  assert.ok(offer, 'the Helios board posts an ordinary contract alongside the rail');

  assert.equal(h.missions.acceptMission(offer.id), true);
  const ob = h.state.onboarding;
  assert.equal(ob.finished, true, 'a real job retires the rail');
  assert.equal(ob.active, false);
  assert.equal(h.tutorialFinished.length, 1, 'tutorial:finished fires once via _finish()');

  const accepted = h.state.missions.active.find((m) => m && m.status === 'active');
  assert.ok(accepted, 'the accepted contract is the live mission');
  assert.equal(h.state.ui.trackedMissionId, accepted.id,
    'the HUD objective slot follows the accepted job');
  assert.ok(!h.state.nav.waypoint || h.state.nav.waypoint.onboarding !== true,
    'the stale onboarding objective marker is cleared');
});

test('accepting the rail recommended contract keeps the rail going', () => {
  const h = makeHarness(DOCK_BEAT);
  const offer = buildFirstTradeOffer(4242);
  const board = h.missions.ensureBoard(HELIOS);
  board.slots.unshift(offer);

  assert.equal(h.missions.acceptMission(offer.id), true);
  const ob = h.state.onboarding;
  assert.equal(ob.finished, false, 'the authored first-trade contract is the rail\'s own job');
  assert.equal(ob.active, true);
  assert.equal(h.tutorialFinished.length, 0);

  const accepted = h.state.missions.active.find((m) => m && m.source === FIRST_TRADE_CONTRACT_SOURCE);
  assert.ok(accepted);
  assert.equal(ob.recommendedMissionId, accepted.id,
    'the dock beat tracks the recommended delivery as before');
});
