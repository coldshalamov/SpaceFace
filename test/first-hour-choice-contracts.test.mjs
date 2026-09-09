import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  FIRST_TRADE_CONTRACT_DEST_STATION_ID,
  FIRST_TRADE_CONTRACT_SOURCE,
  buildFirstTradeOffer,
} from '../src/data/economyContractTemplates.js';
import {
  ONBOARDING_CHOICE_LOOPS,
  ONBOARDING_CHOICE_SOURCE,
  missions as missionsProto,
} from '../src/systems/missions.js';
import { onboarding as onboardingProto } from '../src/systems/onboarding.js';
import {
  firstHourBoardOfferPresentation,
  missionBoardDispatchLabel,
} from '../src/ui/station/screens/contracts.js';

function freshOnboarding(currentBeat = 8) {
  return {
    active: true,
    finished: false,
    currentBeat,
    beatDoneAt: {},
    firedFollowups: {},
    tutorialLog: [],
    oreCollected: 3,
    trainingOre: 3,
    tetherReeled: true,
    tetherBreaks: 0,
    beatAction: '',
    burstShots: 3,
    burstPeakHeat: 0.5,
    burstCooling: true,
  };
}

function makeHarness(seed = 47) {
  const state = createGameState(seed);
  state.mode = 'station';
  state.simTime = 720;
  state.world.currentSectorId = 'sector_ceres_belt';
  state.ui.dockedStationId = FIRST_TRADE_CONTRACT_DEST_STATION_ID;
  // Fresh-run bankroll (5000) plus the authored first delivery (420).
  state.player.credits = 5420;
  state.onboarding = freshOnboarding();

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
  // init() does not replace the active tutorial bag, but keep the fixture explicit for future
  // initialization changes.
  state.onboarding = freshOnboarding();
  return { state, bus, missions, onboarding };
}

test('B4 waits for the authored recommended delivery to finish', () => {
  const h = makeHarness();

  h.bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'cmdty_ore_iron', qty: 3 });
  assert.equal(h.state.onboarding.beatDoneAt.dock, undefined,
    'selling training ore only surfaces the board; it cannot skip the complete contract loop');
  assert.equal(h.state.onboarding.beatAction, "Board's got one job for you.");

  const firstTrade = h.missions._instanceFromOffer(buildFirstTradeOffer(47));
  h.state.missions.active.push(firstTrade);
  h.state.ui.trackedMissionId = firstTrade.id;
  h.state.nav.waypoint = {
    onboarding: true,
    kind: 'mission-objective',
    label: 'Helios Station',
    reason: 'Helios. Dock when close.',
  };
  h.bus.emit('mission:accepted', {
    missionId: firstTrade.id,
    source: FIRST_TRADE_CONTRACT_SOURCE,
  });
  assert.equal(h.state.onboarding.recommendedMissionId, firstTrade.id);
  assert.equal(h.state.onboarding.beatAction, 'Complete the tracked delivery.');
  assert.equal(h.state.onboarding.beatDoneAt.dock, undefined);
  assert.equal(h.state.nav.waypoint.kind, 'mission');
  assert.equal(h.state.nav.waypoint.missionId, firstTrade.id);
  assert.equal(h.state.nav.waypoint.stationId, FIRST_TRADE_CONTRACT_DEST_STATION_ID,
    'the accepted delivery replaces the tutorial Helios marker with its real destination');
  const routed = structuredClone(h.state.nav.waypoint);
  h.onboarding._setObjectiveWaypoint(false);
  assert.deepEqual(h.state.nav.waypoint, routed,
    'the still-active tutorial cannot reclaim the delivery waypoint on its next update');

  h.bus.emit('mission:completed', {
    missionId: firstTrade.id,
    source: FIRST_TRADE_CONTRACT_SOURCE,
    type: 'cargo_delivery',
  });
  assert.ok(h.state.onboarding.beatDoneAt.dock != null,
    'the recommended delivery completion closes B4');
  assert.equal(h.state.onboarding.choiceStationId, FIRST_TRADE_CONTRACT_DEST_STATION_ID);
});

test('B5 posts three normal starter-risk offers and accepts exactly one choice', () => {
  const h = makeHarness();
  h.state.onboarding.currentBeat = 9;
  h.onboarding._openChoice();

  const choices = h.missions.ensureOnboardingChoiceOffers(FIRST_TRADE_CONTRACT_DEST_STATION_ID);
  assert.deepEqual(choices.map((offer) => offer.type), ONBOARDING_CHOICE_LOOPS.map((loop) => loop.type));
  assert.deepEqual(choices.map((offer) => offer.onboardingChoice.label), ['HAUL', 'BOUNTY', 'SURVEY']);
  assert.ok(choices.every((offer) => offer.source === ONBOARDING_CHOICE_SOURCE));
  assert.ok(choices.every((offer) => offer.riskTier <= 1),
    'every first-hour choice must come from a normal starter-risk roll');
  assert.ok(choices.every((offer) => offer.reward_cr <= 10000),
    'first-hour choices must not surface jackpot-scale exotic trade rolls');
  assert.ok(choices.every((offer) => offer.collateral_cr <= 2000),
    'each choice must remain accept-ready inside the earned first-hour bankroll');
  assert.equal(new Set(choices.map((offer) => offer.id)).size, 3);

  const board = h.state.missions.boards[FIRST_TRADE_CONTRACT_DEST_STATION_ID];
  assert.deepEqual(board.slots.slice(0, 3).map((offer) => offer.id), choices.map((offer) => offer.id),
    'the three choices stay adjacent at the head of the horizontal mission rail');
  const ordinaryCount = board.slots.filter((offer) => offer.source !== ONBOARDING_CHOICE_SOURCE).length;
  assert.ok(ordinaryCount > 0, 'the ordinary station board remains available after the choice rail');

  const again = h.missions.ensureOnboardingChoiceOffers(FIRST_TRADE_CONTRACT_DEST_STATION_ID);
  assert.deepEqual(again, choices, 're-entering B5 is idempotent within the same run');

  h.bus.emit('mission:accepted', { missionId: 'unrelated', source: 'economyContract' });
  h.bus.emit('ship:purchased', { shipId: 'ship_lark' });
  assert.equal(h.state.onboarding.finished, false,
    'unrelated missions and ship purchases cannot end the tutorial choice');

  assert.equal(h.missions.acceptMission(choices[0].id), true);
  assert.equal(h.state.onboarding.finished, true, 'accepting one posted B5 offer ends onboarding');
  assert.equal(h.state.onboarding.active, false);
  assert.equal(board.slots.some((offer) => offer.source === ONBOARDING_CHOICE_SOURCE), false,
    'the two unchosen tutorial siblings withdraw atomically');
  const active = h.state.missions.active.find((mission) => mission.source === ONBOARDING_CHOICE_SOURCE);
  assert.ok(active && active.type === 'bulk_trade', 'the selected choice remains an ordinary active mission');
});

test('first-hour mission rail labels the recommendation and all three choices', () => {
  const h = makeHarness();
  const firstTrade = { id: 'first_trade', source: FIRST_TRADE_CONTRACT_SOURCE };
  assert.deepEqual(firstHourBoardOfferPresentation(h.state, firstTrade), {
    label: 'RECOMMENDED', rank: -1, kind: 'recommended',
  });

  h.state.onboarding.currentBeat = 9;
  const choices = h.missions.ensureOnboardingChoiceOffers(FIRST_TRADE_CONTRACT_DEST_STATION_ID);
  assert.deepEqual(
    choices.map((offer) => firstHourBoardOfferPresentation(h.state, offer).label),
    ['HAUL', 'BOUNTY', 'SURVEY'],
  );
  assert.equal(
    missionBoardDispatchLabel(h.state, FIRST_TRADE_CONTRACT_DEST_STATION_ID, 3),
    'FIRST FLIGHT / PICK ONE · HAUL / BOUNTY / SURVEY',
  );
});

test('B5 offer identities and terms reproduce from the run seed', () => {
  const a = makeHarness(2026);
  const b = makeHarness(2026);
  a.state.onboarding.currentBeat = 9;
  b.state.onboarding.currentBeat = 9;
  const left = a.missions.ensureOnboardingChoiceOffers(FIRST_TRADE_CONTRACT_DEST_STATION_ID);
  const right = b.missions.ensureOnboardingChoiceOffers(FIRST_TRADE_CONTRACT_DEST_STATION_ID);
  assert.deepEqual(left, right);
});
