import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMODITIES } from '../src/data/commodities.js';
import * as missionData from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import { UNIQUE_WRECKS, uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missionReceiptFor, missions } from '../src/systems/missions.js';
import { RUMOR_EVENT_BY_CHANNEL, uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { missionCommandBrief, objectiveText } from '../src/ui/screens/missionLog.js';
import { missionPreflight, missionUpfrontCost } from '../src/ui/missionPreflight.js';

/**
 * SP1's intentionally small public seam:
 *
 * Data (`src/data/missions.js`)
 *   - SET_PIECE_MISSIONS: authored definitions using
 *       { id, title, commonStages, branches:[{ id, label, stages }] }.
 *   - validateSetPieceMissionCatalog(): structured validation result.
 *
 * Runtime (`src/systems/setPieceMissionOffers.js`)
 *   - SET_PIECE_MISSION_SOURCE === 'setPieceMission'.
 *   - buildSetPieceMissionOffers(state, cursor) -> one normal offer, or the two branch siblings.
 *       cursor = { archetypeId, startEpoch, stageIndex, branchId, attempt }.
 *   - advanceSetPieceMission(state, settledMission, settlement) ->
 *       { status, offers, receipt }, where settlement = { outcome, reason? }.
 *
 * Both runtime functions are deterministic and may inspect state, but do not create a parallel
 * persistent run object. Existing mission boards, active instances, causes, and receipts remain
 * the save authority. Tests deliberately avoid private methods of the new runtime helper.
 */

const EXPECTED_ARCHETYPES = new Set([
  'long_read',
  'witness_run',
  'hearing',
  'blockade_run',
  'investigation_chain',
]);
const STATION_TO_SECTOR = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) STATION_TO_SECTOR.set(station.id, sector.id);
}
const SECTOR_IDS = new Set(SECTORS.map((sector) => sector.id));
const MISSION_TYPE_IDS = new Set(missionData.MISSION_TYPES.map((entry) => entry.type));
const COMMODITY_IDS = new Set(COMMODITIES.map((entry) => entry.id));

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }

  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }

  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function baseState({ seed = 47, simTime = 0 } = {}) {
  return {
    meta: { seed, playtimeS: 0 },
    seed,
    tick: 0,
    simTime,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 500000,
      researchPoints: 0,
      cargo: {
        items: {},
        capVolume: 500,
        capMass: 500,
        usedVolume: 0,
        usedMass: 0,
      },
      stats: {},
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(missionData.MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: {
      faction_scn: { rep: 500 },
      faction_mts: { rep: 500 },
      faction_dmc: { rep: 500 },
      faction_free: { rep: 500 },
      faction_reach: { rep: 500 },
      faction_quiet: { rep: 500 },
    },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function missionHelpers() {
  return { hash32, mulberry32, voice: { say: () => true } };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function eventCount(bus, name, predicate = () => true) {
  return bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length;
}

function offerOnAnyBoard(state, offerId) {
  for (const board of Object.values(state.missions.boards || {})) {
    if ((board && board.slots || []).some((offer) => offer && offer.id === offerId)) return true;
  }
  return false;
}

let runtimePromise;
async function runtimeApi() {
  runtimePromise ||= import('../src/systems/setPieceMissionOffers.js');
  let api;
  try {
    api = await runtimePromise;
  } catch (error) {
    assert.fail(`SP1 requires src/systems/setPieceMissionOffers.js: ${error && error.message}`);
  }
  assert.equal(api.SET_PIECE_MISSION_SOURCE, 'setPieceMission');
  assert.equal(typeof api.buildSetPieceMissionOffers, 'function',
    'SP1 runtime exports buildSetPieceMissionOffers(state, cursor)');
  assert.equal(typeof api.advanceSetPieceMission, 'function',
    'SP1 runtime exports advanceSetPieceMission(state, settledMission, settlement)');
  return api;
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random forbidden in SP1 chain generation'); };
  Date.now = () => { throw new Error('Date.now forbidden in SP1 chain generation'); };
  try {
    return fn();
  } finally {
    Math.random = random;
    Date.now = now;
  }
}

function stageRows(definition) {
  return [
    ...(definition.commonStages || []),
    ...(definition.branches || []).flatMap((branch) => branch.stages || []),
  ];
}

function assertNormalOffer(offer, message) {
  assert.ok(offer && offer.id, `${message}: stable offer id`);
  assert.equal(offer.source, 'setPieceMission', `${message}: normal external mission source`);
  assert.ok(MISSION_TYPE_IDS.has(offer.type), `${message}: canonical mission type`);
  assert.ok(STATION_TO_SECTOR.has(offer.stationId), `${message}: real board station`);
  assert.ok(SECTOR_IDS.has(offer.destSectorId), `${message}: real destination sector`);
  if (offer.destStationId) {
    assert.equal(STATION_TO_SECTOR.get(offer.destStationId), offer.destSectorId,
      `${message}: destination station belongs to destination sector`);
  }
  assert.ok(offer.factionId, `${message}: offering faction`);
  assert.ok(Number.isInteger(offer.riskTier), `${message}: explicit stage risk`);
  assert.equal(Object.hasOwn(offer, 'minRep'), false,
    `${message}: standing derives from the normal risk ladder, never a chain waiver`);
  assert.ok(offer.cause && offer.cause.chainId && offer.cause.fingerprint,
    `${message}: seeded chain cause`);
  assert.equal(offer.cause.archetypeId != null, true, `${message}: archetype cause`);
  assert.ok(Number.isInteger(offer.cause.stageIndex), `${message}: stage index cause`);
  assert.ok(Number.isInteger(offer.cause.attempt), `${message}: retry attempt cause`);
}

function initialCursor(archetypeId, startEpoch = 4) {
  return { archetypeId, startEpoch, stageIndex: 0, branchId: null, attempt: 0 };
}

function chooseOffer(offers, branchId) {
  if (offers.length === 1) return offers[0];
  const selected = offers.find((offer) => offer.cause && offer.cause.branchId === branchId);
  assert.ok(selected, `branch ${branchId} is one of the two authored sibling offers`);
  return selected;
}

function walkRoute(api, state, definition, branchId, startEpoch = 4) {
  let offers = api.buildSetPieceMissionOffers(state, initialCursor(definition.id, startEpoch));
  const accepted = [];
  const transitions = [];
  let choiceMoments = 0;
  for (let guard = 0; guard < 8; guard++) {
    assert.ok(Array.isArray(offers) && (offers.length === 1 || offers.length === 2),
      `${definition.id}/${branchId}: each step yields one stage or exactly two branch siblings`);
    if (offers.length === 2) choiceMoments += 1;
    const selected = chooseOffer(offers, branchId);
    assertNormalOffer(selected, `${definition.id}/${branchId}/stage-${accepted.length}`);
    accepted.push(selected);
    const transition = api.advanceSetPieceMission(state, selected, { outcome: 'completed' });
    transitions.push(transition);
    assert.ok(transition && Array.isArray(transition.offers), 'advance returns an offer list');
    assert.ok(transition.receipt && typeof transition.receipt.houseText === 'string'
      && transition.receipt.houseText.trim().length >= 24,
    `${definition.id}/${branchId}: every completed stage has a house-voice receipt`);
    if (transition.status === 'completed') {
      assert.equal(transition.offers.length, 0, 'final stage does not create an extra mission');
      return { accepted, transitions, choiceMoments };
    }
    offers = transition.offers;
  }
  assert.fail(`${definition.id}/${branchId}: route did not resolve within the 3-4 stage contract`);
}

test('SP1 catalog has five authored archetypes, one branch point each, and ten valid 3-4 stage routes', () => {
  const definitions = missionData.SET_PIECE_MISSIONS;
  assert.ok(Array.isArray(definitions), 'missions data exports SET_PIECE_MISSIONS');
  assert.equal(definitions.length, 5);
  assert.deepEqual(new Set(definitions.map((entry) => entry.id)), EXPECTED_ARCHETYPES);
  assert.equal(typeof missionData.validateSetPieceMissionCatalog, 'function',
    'missions data exports validateSetPieceMissionCatalog()');
  const validation = missionData.validateSetPieceMissionCatalog();
  assert.equal(validation.ok, true, (validation.errors || []).join('\n'));
  assert.deepEqual(validation.errors || [], []);
  assert.equal(validation.archetypes, 5);
  assert.equal(validation.playableRoutes, 10);

  for (const definition of definitions) {
    assert.ok(definition.title && definition.title.length >= 8, `${definition.id}: authored title`);
    assert.ok(Array.isArray(definition.commonStages) && definition.commonStages.length >= 1,
      `${definition.id}: common approach before the choice`);
    assert.equal(definition.branches.length, 2, `${definition.id}: exactly one two-way branch`);
    assert.equal(new Set(definition.branches.map((branch) => branch.id)).size, 2,
      `${definition.id}: distinct branch identities`);
    for (const branch of definition.branches) {
      assert.ok(branch.label && branch.label.length >= 4, `${definition.id}/${branch.id}: visible choice label`);
      assert.ok(Array.isArray(branch.stages) && branch.stages.length >= 1,
        `${definition.id}/${branch.id}: chosen route has authored work`);
      assert.equal(Object.hasOwn(branch, 'branches'), false, `${definition.id}/${branch.id}: no nested second choice`);
      const route = [...definition.commonStages, ...branch.stages];
      assert.ok(route.length >= 3 && route.length <= 4, `${definition.id}/${branch.id}: 3-4 stages`);
      assert.ok(route.some((stage) => Array.isArray(stage.clauseIds) && stage.clauseIds.length > 0),
        `${definition.id}/${branch.id}: route rides the live contract-clause system`);
      assert.ok(branch.stages[0].collateralCr > 0,
        `${definition.id}/${branch.id}: branch failure has a recoverable economic stake`);
    }

    for (const stage of stageRows(definition)) {
      assert.ok(stage.id && MISSION_TYPE_IDS.has(stage.type), `${definition.id}: canonical stage type`);
      assert.ok(STATION_TO_SECTOR.has(stage.boardStationId), `${definition.id}/${stage.id}: real board station`);
      assert.ok(SECTOR_IDS.has(stage.destSectorId), `${definition.id}/${stage.id}: real destination sector`);
      if (stage.destStationId) {
        assert.equal(STATION_TO_SECTOR.get(stage.destStationId), stage.destSectorId,
          `${definition.id}/${stage.id}: station/sector truth`);
      }
      assert.ok(stage.factionId, `${definition.id}/${stage.id}: explicit standing authority`);
      assert.ok(Number.isInteger(stage.riskTier) && stage.riskTier >= 0 && stage.riskTier <= 4,
        `${definition.id}/${stage.id}: valid risk tier`);
      assert.equal(Object.hasOwn(stage, 'minRep'), false,
        `${definition.id}/${stage.id}: no chain-level standing override`);
      assert.ok(Number.isFinite(stage.rewardCr) && stage.rewardCr > 0,
        `${definition.id}/${stage.id}: real payout`);
      assert.ok(Number.isFinite(stage.collateralCr) && stage.collateralCr >= 0,
        `${definition.id}/${stage.id}: explicit stake`);
      assert.ok(stage.params && typeof stage.params === 'object', `${definition.id}/${stage.id}: objective params`);
      if (stage.params.cmdtyId) {
        assert.ok(COMMODITY_IDS.has(stage.params.cmdtyId), `${definition.id}/${stage.id}: real commodity`);
      }
      for (const refKey of ['instructionRef', 'successRef', 'failureRef', 'recoveryRef']) {
        const source = FLAVOR_SOURCE_BY_REF[stage[refKey]];
        assert.ok(source && typeof source.text === 'string' && source.text.trim().length >= 24,
          `${definition.id}/${stage.id}: ${refKey} resolves to authored copy`);
      }
    }
  }

  const longRead = definitions.find((entry) => entry.id === 'long_read');
  assert.ok(longRead.commonStages[0].upfrontCostCr > 0, 'The Long Read literally buys its rumor once');
  assert.equal(longRead.commonStages[0].params.setPieceObjective, 'long_read_rumor_survey',
    'the opening remains live through rumor purchase and a real bearing fix');
  assert.equal(longRead.commonStages[1].type, 'salvage_retrieval');
  assert.equal(longRead.commonStages[1].params.setPieceObjective, 'long_read_salvage',
    'the middle stage is literal salvage, not a patrol stand-in');
  assert.ok(longRead.branches.every((branch) => (
    branch.stages[0].params.setPieceObjective === 'long_read_fence'
      && !branch.stages[0].preloadedCargo
      && !branch.stages[0].params.cmdtyId
  )), 'the branch is a native wreck decision, not preloaded delivery cargo');
  assert.deepEqual(new Set(longRead.branches.map((branch) => branch.stages[0].params.wreckChoiceId)),
    new Set(['claim_hardware', 'authority_handover']));
  assert.ok(stageRows(longRead).every((stage) => Number.isFinite(stage.durationS) && stage.durationS > 0),
    'every Long Read obligation authors a reachable sim-clock deadline');
});

test('The Long Read executes rumor purchase, bearing survey, complicated salvage, and native fence choice', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 1047 });
  const bus = new Bus();
  const wreckSystem = { ...uniqueWrecks };
  wreckSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });

  const opening = api.buildSetPieceMissionOffers(state, initialCursor('long_read', 20))[0];
  const wreckId = opening && opening.cause && opening.cause.wreckId;
  const wreck = uniqueWreckById(wreckId);
  assert.ok(wreck, 'the seeded chain reserves one real unique wreck');
  assert.equal(opening.destSectorId, wreck.sectorId, 'the survey points at the reserved wreck sector');
  assert.equal(opening.sourceRef, wreck.bearingSourceRef, 'the paid rumor uses the native source');
  assert.equal(opening.channelId,
    wreck.rumorSources.find((source) => source.sourceRef === wreck.bearingSourceRef).channelId);

  bus.emit('mission:offered', clone(opening));
  assert.equal(missionSystem.acceptMission(opening.id), true);
  let active = state.missions.active[0];
  assert.equal(state.player.uniqueWrecks.bearings[wreckId].phase, 'rumored',
    'acceptance actually purchases and records the live rumor');
  assert.equal(active.params.rumorPurchased, true);
  assert.equal(active.objectiveProgress, 1);
  bus.emit('scan:completed', { targetId: null });
  assert.equal(state.missions.active[0].id, active.id,
    'generic recon progress cannot stand in for a unique-wreck bearing fix');

  state.player.uniqueWrecks.bearings[wreckId].phase = 'fixed';
  bus.emit('uniqueWreck:bearingFixed', { wreckId, sectorId: wreck.sectorId, phase: 'fixed' });
  assert.equal(state.missions.active.length, 0);
  const salvageOffer = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .find((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
      && offer.cause.stageIndex === 1);
  assert.ok(salvageOffer, 'bearing fix posts the literal salvage stage');
  assert.equal(salvageOffer.cause.wreckId, wreckId, 'target identity survives the chained offer');

  assert.equal(missionSystem.acceptMission(salvageOffer.id), true);
  active = state.missions.active[0];
  bus.emit('dock:docked', { stationId: salvageOffer.destStationId || salvageOffer.stationId });
  assert.equal(state.missions.active[0].id, active.id,
    'docking cannot stand in for recovering the authored wreck');
  bus.emit('uniqueWreck:decisionReady', { wreckId, sectorId: wreck.sectorId, phase: 'decision' });
  assert.equal(state.missions.active[0].id, active.id,
    'salvage cannot settle before the authored complication is live');
  bus.emit('uniqueWreck:complicationTriggered', { wreckId, kind: 'contract_test_complication' });
  bus.emit('uniqueWreck:decisionReady', { wreckId, sectorId: wreck.sectorId, phase: 'decision' });
  assert.equal(state.missions.active.length, 0);
  const fenceOffers = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .filter((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
      && offer.cause.stageIndex === 2);
  assert.equal(fenceOffers.length, 2, 'salvage opens exactly the two authored fence choices');
  assert.ok(fenceOffers.every((offer) => !offer.preloadedCargo && !offer.params.cmdtyId));

  const lawful = fenceOffers.find((offer) => offer.params.wreckChoiceId === 'authority_handover');
  assert.ok(lawful);
  state.player.uniqueWrecks.bearings[wreckId].phase = 'decision';
  assert.equal(missionSystem.acceptMission(lawful.id), true);
  assert.equal(state.missions.active.length, 0, 'the accepted fence row settles through uniqueWreck:resolved');
  assert.equal(state.player.uniqueWrecks.bearings[wreckId].phase, 'salvaged');
  assert.equal(state.player.uniqueWrecks.bearings[wreckId].choiceId, 'authority_handover');
  assert.equal(eventCount(bus, 'uniqueWreck:choose', (payload) => payload.wreckId === wreckId), 1);
  assert.equal(eventCount(bus, 'mission:completed', (payload) => payload.chainId === opening.cause.chainId), 3,
    'each of the three accepted obligations settles exactly once');
});

test('Investigation Chain black-box recovery requires native wreck salvage in the authored sector', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 4801 });
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });

  const offer = api.buildSetPieceMissionOffers(state, {
    archetypeId: 'investigation_chain',
    startEpoch: 48,
    stageIndex: 1,
    branchId: null,
    attempt: 0,
  })[0];
  assert.equal(offer.params.setPieceObjective, 'investigation_recover_box');
  bus.emit('mission:offered', clone(offer));
  assert.equal(missionSystem.acceptMission(offer.id), true);
  const activeId = state.missions.active[0].id;

  bus.emit('dock:docked', { stationId: offer.stationId });
  bus.emit('salvage:completed', { wreckId: 'missing_wreck', loot: { cmdty_salvage_electronics: 1 } });
  assert.equal(state.missions.active[0].id, activeId,
    'docking and an unbound salvage payload cannot settle physical recovery');

  const wreck = {
    id: 'investigation_duration_wreck',
    type: 'wreck',
    alive: true,
    pos: { x: 400, z: 0 },
    data: { salvagePool: { cmdty_salvage_electronics: 1 } },
  };
  state.entities.set(wreck.id, wreck);
  state.entityList.push(wreck);
  bus.emit('salvage:completed', { wreckId: wreck.id, loot: { cmdty_salvage_electronics: 1 } });
  assert.equal(state.missions.active[0].id, activeId,
    'wreck salvage outside the authored sector cannot settle recovery');

  state.world.currentSectorId = offer.destSectorId;
  bus.emit('salvage:completed', { wreckId: wreck.id, loot: { cmdty_salvage_electronics: 1 } });
  assert.equal(state.missions.active.length, 0,
    'native wreck salvage in the authored sector settles the black-box stage');
  assert.equal(state.missions.receipts.filter((receipt) => (
    receipt.causeFingerprint === offer.cause.fingerprint && receipt.outcome === 'completed'
  )).length, 1, 'the native salvage receipt settles exactly once');
  assert.equal(Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .filter((candidate) => candidate.cause && candidate.cause.chainId === offer.cause.chainId
      && candidate.cause.stageIndex === 2).length, 2,
  'black-box recovery opens the two authored disposition choices');
});

test('a native wreck choice made before fence acceptance keeps only the matching completable row', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 1048 });
  const bus = new Bus();
  const wreckSystem = { ...uniqueWrecks };
  wreckSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });

  const opening = api.buildSetPieceMissionOffers(state, initialCursor('long_read', 21))[0];
  const rumorEvent = RUMOR_EVENT_BY_CHANNEL[opening.channelId];
  bus.emit(rumorEvent, {
    sourceRef: opening.sourceRef,
    wreckId: opening.wreckId,
    channelId: opening.channelId,
    text: opening.summary,
  });
  const record = state.player.uniqueWrecks.bearings[opening.wreckId];
  assert.ok(record);
  record.phase = 'decision';
  record.fixedAtS = state.simTime;
  record.decisionReadyAtS = state.simTime;

  const salvage = api.advanceSetPieceMission(state, opening, { outcome: 'completed' }).offers[0];
  const fenceOffers = api.advanceSetPieceMission(state, salvage, { outcome: 'completed' }).offers;
  assert.equal(fenceOffers.length, 2);
  for (const offer of fenceOffers) bus.emit('mission:offered', clone(offer));
  const matching = fenceOffers.find((offer) => offer.params.wreckChoiceId === 'claim_hardware');
  const mismatch = fenceOffers.find((offer) => offer.params.wreckChoiceId !== 'claim_hardware');

  bus.emit('uniqueWreck:choose', { wreckId: opening.wreckId, choiceId: 'claim_hardware' });
  assert.equal(state.player.uniqueWrecks.bearings[opening.wreckId].phase, 'salvaged');
  assert.equal(offerOnAnyBoard(state, mismatch.id), false,
    'the already-impossible fence row is withdrawn when the native panel resolves');
  assert.equal(offerOnAnyBoard(state, matching.id), true,
    'the matching authored receipt remains a visible board action');
  assert.equal(missionSystem.acceptMission(mismatch.id), false, 'mismatched native outcome cannot activate');
  assert.equal(missionSystem.acceptMission(matching.id), true);
  assert.equal(state.missions.active.length, 0, 'matching pre-resolved fence completes on acceptance');
  assert.equal(eventCount(bus, 'uniqueWreck:choose', (payload) => payload.wreckId === opening.wreckId), 1,
    'mission reconciliation does not submit a second native choice');
  assert.equal(eventCount(bus, 'uniqueWreck:resolved', (payload) => payload.wreckId === opening.wreckId), 1,
    'unique wreck settlement remains exact-once');
  assert.equal(eventCount(bus, 'mission:completed', (payload) => payload.chainId === opening.cause.chainId), 1,
    'the matching fence receipt settles exactly once');
});

test('a native choice made before a delayed complication boards only its saved matching fence', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 1049 });
  const bus = new Bus();
  const wreckSystem = { ...uniqueWrecks };
  wreckSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });

  const opening = api.buildSetPieceMissionOffers(state, {
    ...initialCursor('long_read', 22),
    wreckId: 'wreck_mts_silver_draft',
  })[0];
  bus.emit(RUMOR_EVENT_BY_CHANNEL[opening.channelId], {
    sourceRef: opening.sourceRef,
    wreckId: opening.wreckId,
    channelId: opening.channelId,
    text: opening.summary,
  });
  const record = state.player.uniqueWrecks.bearings[opening.wreckId];
  record.phase = 'decision';
  record.fixedAtS = state.simTime;
  record.decisionReadyAtS = state.simTime;
  const salvage = api.advanceSetPieceMission(state, opening, { outcome: 'completed' }).offers[0];
  bus.emit('mission:offered', clone(salvage));
  assert.equal(missionSystem.acceptMission(salvage.id), true);
  assert.equal(state.missions.active[0].params.salvageDecisionReady, true);
  assert.equal(state.missions.active[0].params.complicationObserved, false,
    'the salvage obligation remains live while its delayed complication is pending');

  bus.emit('uniqueWreck:choose', { wreckId: opening.wreckId, choiceId: 'claim_hardware' });
  assert.equal(record.phase, 'salvaged');
  assert.equal(state.missions.active.length, 1, 'native choice alone cannot skip the complication gate');
  bus.emit('uniqueWreck:complicationTriggered', { wreckId: opening.wreckId, kind: 'delayed_cleaner' });
  assert.equal(state.missions.active.length, 0);
  const fenceOffers = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .filter((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
      && offer.cause.stageIndex === 2);
  assert.equal(fenceOffers.length, 1, 'saved native truth filters the later branch transition');
  assert.equal(fenceOffers[0].params.wreckChoiceId, 'claim_hardware');
  assert.equal(missionSystem.acceptMission(fenceOffers[0].id), true);
  assert.equal(state.missions.active.length, 0);
  assert.equal(eventCount(bus, 'uniqueWreck:choose', (payload) => payload.wreckId === opening.wreckId), 1);
  assert.equal(eventCount(bus, 'uniqueWreck:resolved', (payload) => payload.wreckId === opening.wreckId), 1);
});

test('a wreck resolved before opening acceptance still reconciles all three Long Read obligations', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 1051 });
  const bus = new Bus();
  const wreckSystem = { ...uniqueWrecks };
  wreckSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  const opening = api.buildSetPieceMissionOffers(state, {
    ...initialCursor('long_read', 23),
    wreckId: 'wreck_smokesong',
  })[0];
  bus.emit(RUMOR_EVENT_BY_CHANNEL[opening.channelId], {
    sourceRef: opening.sourceRef,
    wreckId: opening.wreckId,
    channelId: opening.channelId,
    text: opening.summary,
  });
  const bearing = state.player.uniqueWrecks.bearings[opening.wreckId];
  Object.assign(bearing, {
    phase: 'salvaged',
    fixedAtS: state.simTime,
    decisionReadyAtS: state.simTime,
    salvagedAtS: state.simTime,
    resolvedAtS: state.simTime,
    choiceId: 'claim_hardware',
    outcome: 'claimed',
  });

  bus.emit('mission:offered', clone(opening));
  assert.equal(missionSystem.acceptMission(opening.id), true);
  const salvage = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .find((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
      && offer.cause.stageIndex === 1);
  assert.ok(salvage, 'pre-resolved native state does not erase the middle salvage receipt');
  assert.equal(missionSystem.acceptMission(salvage.id), true);
  const fences = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .filter((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
      && offer.cause.stageIndex === 2);
  assert.equal(fences.length, 1, 'saved disposition narrows only the actual branch-choice rows');
  assert.equal(fences[0].params.wreckChoiceId, 'claim_hardware');
  assert.equal(missionSystem.acceptMission(fences[0].id), true);
  assert.equal(eventCount(bus, 'mission:completed', (payload) => payload.chainId === opening.cause.chainId), 3,
    'opening, salvage, and disposition each reconcile exactly once');
});

test('a salvage failure after native choice retains stage-one recovery before the matching fence', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 1052 });
  const bus = new Bus();
  const wreckSystem = { ...uniqueWrecks };
  wreckSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  const opening = api.buildSetPieceMissionOffers(state, {
    ...initialCursor('long_read', 24),
    wreckId: 'wreck_mts_silver_draft',
  })[0];
  bus.emit(RUMOR_EVENT_BY_CHANNEL[opening.channelId], {
    sourceRef: opening.sourceRef,
    wreckId: opening.wreckId,
    channelId: opening.channelId,
    text: opening.summary,
  });
  const bearing = state.player.uniqueWrecks.bearings[opening.wreckId];
  bearing.phase = 'decision';
  bearing.fixedAtS = state.simTime;
  bearing.decisionReadyAtS = state.simTime;
  const salvage = api.advanceSetPieceMission(state, opening, { outcome: 'completed' }).offers[0];
  bus.emit('mission:offered', clone(salvage));
  assert.equal(missionSystem.acceptMission(salvage.id), true);
  bus.emit('uniqueWreck:choose', { wreckId: opening.wreckId, choiceId: 'authority_handover' });
  assert.equal(bearing.phase, 'salvaged');
  assert.equal(missionSystem.abandonMission(state.missions.active[0].id), true);
  const retry = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .find((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
      && offer.cause.stageIndex === 1 && offer.cause.attempt === 1);
  assert.ok(retry, 'failure recovery remains the same salvage obligation after native settlement');
  assert.equal(missionSystem.acceptMission(retry.id), true);
  bus.emit('uniqueWreck:complicationTriggered', { wreckId: opening.wreckId, kind: 'delayed_cleaner' });
  const fences = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .filter((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
      && offer.cause.stageIndex === 2);
  assert.equal(fences.length, 1);
  assert.equal(fences[0].params.wreckChoiceId, 'authority_handover');
});

test('repeatable Long Read uses every unsettled wreck before finite all-salvaged exhaustion', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 1050 });
  state.player.uniqueWrecks = {
    bearings: Object.fromEntries(UNIQUE_WRECKS.map((wreck) => [wreck.id, {
      wreckId: wreck.id,
      phase: 'rumored',
      sourceRef: wreck.bearingSourceRef,
      channelId: wreck.rumorSources.find((source) => source.sourceRef === wreck.bearingSourceRef).channelId,
    }])),
  };
  const reserved = new Set();
  for (let epoch = 0; epoch < 12; epoch++) {
    const offer = api.buildSetPieceMissionOffers(state, initialCursor('long_read', epoch))[0];
    assert.ok(offer, `epoch ${epoch}: another unsettled canon wreck remains contractible`);
    assert.ok(uniqueWreckById(offer.wreckId));
    assert.equal(reserved.has(offer.wreckId), false, 'one-per-save wreck identity never repeats');
    assert.equal(offer.params.rumorAlreadyKnown, true);
    assert.equal(offer.upfrontCostCr, 0, 'a known rumor is never sold to the player twice');
    assert.doesNotMatch(`${offer.title} ${offer.summary}`, /\b(?:buy|pay|purchase)\b/i,
      'known-bearing copy states reconciliation rather than a fake purchase');
    reserved.add(offer.wreckId);
    state.player.uniqueWrecks.bearings[offer.wreckId] = { phase: 'salvaged' };
  }
  assert.equal(reserved.size, 12, 'all twelve D-loop targets participate before exhaustion');
  assert.deepEqual(api.buildSetPieceMissionOffers(state, initialCursor('long_read', 12)), [],
    'the only terminal exhaustion is deliberate: all twelve one-per-save wrecks are settled');
});

test('known-rumor acceptance charges no service fee and posted or active chains reserve their wreck', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 1053 });
  const known = UNIQUE_WRECKS[0];
  const primary = known.rumorSources.find((source) => source.sourceRef === known.bearingSourceRef);
  state.player.uniqueWrecks = { bearings: {
    [known.id]: {
      wreckId: known.id,
      phase: 'rumored',
      sourceRef: known.bearingSourceRef,
      channelId: primary.channelId,
    },
  } };
  const knownOffer = api.buildSetPieceMissionOffers(state, {
    ...initialCursor('long_read', 25),
    wreckId: known.id,
  })[0];
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers() });
  bus.emit('mission:offered', clone(knownOffer));
  assert.equal(missionSystem.acceptMission(knownOffer.id), true);
  assert.equal(eventCount(bus, 'economy:chargeCredits', (payload) => (
    String(payload.reason || '').startsWith('mission_upfront:')
  )), 0, 'runtime does not charge the authored purchase fee for a known bearing');
  const knownActive = state.missions.active[0];
  assert.match(objectiveText(knownActive), /RUMOR KNOWN.*BEARING FIXED/,
    'active status identifies organic knowledge instead of inventing a purchase');
  const knownBrief = missionCommandBrief(knownActive, state);
  assert.match(knownBrief.how, /known bearing/i);
  assert.doesNotMatch(`${objectiveText(knownActive)} ${knownBrief.how} ${state.nav.waypoint.reason}`, /purchased/i);

  const reservationState = baseState({ seed: 1054 });
  reservationState.player.uniqueWrecks = { bearings: {} };
  const posted = api.buildSetPieceMissionOffers(reservationState, initialCursor('long_read', 26))[0];
  reservationState.missions.boards[posted.stationId] = { refreshEpoch: 26, slots: [clone(posted)] };
  const afterPosted = api.buildSetPieceMissionOffers(reservationState, initialCursor('long_read', 27))[0];
  assert.notEqual(afterPosted.wreckId, posted.wreckId, 'a posted chain owns its selected wreck');
  reservationState.missions.boards = {};
  reservationState.missions.active = [{ ...clone(posted), status: 'active' }];
  const afterActive = api.buildSetPieceMissionOffers(reservationState, initialCursor('long_read', 28))[0];
  assert.notEqual(afterActive.wreckId, posted.wreckId, 'an active chain keeps the same reservation');
});

test('a posted unknown-rumor offer reconciles its copy and station preflight when learned organically', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 1055 });
  state.player.credits = 0;
  const bus = new Bus();
  const wreckSystem = { ...uniqueWrecks };
  wreckSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  const posted = api.buildSetPieceMissionOffers(state, {
    ...initialCursor('long_read', 29),
    wreckId: 'wreck_smokesong',
  })[0];
  bus.emit('mission:offered', clone(posted));
  assert.equal(missionUpfrontCost(posted), 180);
  assert.match(missionPreflight(posted, state).blocker || '', /service fees/i,
    'the genuinely unknown rumor initially requires its authored purchase');

  bus.emit(RUMOR_EVENT_BY_CHANNEL[posted.channelId], {
    sourceRef: posted.sourceRef,
    wreckId: posted.wreckId,
    channelId: posted.channelId,
    text: posted.summary,
  });
  const reconciled = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .find((offer) => offer && offer.id === posted.id);
  assert.ok(reconciled, 'the original posted identity remains on its board');
  assert.equal(reconciled.params.rumorAlreadyKnown, true);
  assert.equal(reconciled.params.rumorPurchased, true);
  assert.equal(missionUpfrontCost(reconciled), 0);
  assert.doesNotMatch(`${reconciled.title} ${reconciled.summary}`, /\b(?:buy|pay|purchase)\b/i);
  const reconciledPreflight = missionPreflight(reconciled, state);
  assert.doesNotMatch(`${reconciledPreflight.blocker || ''} ${reconciledPreflight.chips.map((chip) => chip.text).join(' ')}`, /service fee/i,
    'station preflight no longer blocks a zero-credit player on a waived purchase');
  assert.equal(missionSystem.acceptMission(reconciled.id), true);
  assert.equal(eventCount(bus, 'economy:chargeCredits', (payload) => (
    String(payload.reason || '').startsWith('mission_upfront:')
  )), 0);
});

test('every compiled Long Read opening records its native carrier and reaches a fence', async () => {
  const api = await runtimeApi();
  for (const [index, wreck] of UNIQUE_WRECKS.entries()) {
    const state = baseState({ seed: 1100 + index });
    const bus = new Bus();
    const wreckSystem = { ...uniqueWrecks };
    wreckSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
    const missionSystem = { ...missions };
    missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });

    const opening = api.buildSetPieceMissionOffers(state, {
      ...initialCursor('long_read', 100 + index),
      wreckId: wreck.id,
    })[0];
    const primary = wreck.rumorSources.find((source) => source.sourceRef === wreck.bearingSourceRef);
    assert.ok(opening && primary, `${wreck.programSlot}: compiler preserves its canonical source`);
    bus.emit('mission:offered', clone(opening));
    assert.equal(missionSystem.acceptMission(opening.id), true, `${wreck.programSlot}: opening accepts`);
    const bearing = state.player.uniqueWrecks.bearings[wreck.id];
    assert.ok(bearing, `${wreck.programSlot}: acceptance records the native ${primary.channelId} carrier`);
    assert.equal(bearing.sourceRef, wreck.bearingSourceRef);
    assert.equal(bearing.channelId, primary.channelId);
    assert.equal(eventCount(bus, RUMOR_EVENT_BY_CHANNEL[primary.channelId], (payload) => (
      payload.wreckId === wreck.id && payload.sourceRef === wreck.bearingSourceRef
    )), 1, `${wreck.programSlot}: exact native carrier is emitted once`);

    bearing.phase = 'fixed';
    bearing.fixedAtS = state.simTime;
    if (wreck.reactor) bearing.reactorDueAt = state.simTime + wreck.reactor.timerS;
    bus.emit('uniqueWreck:bearingFixed', { wreckId: wreck.id, sectorId: wreck.sectorId, phase: 'fixed' });
    assert.equal(state.missions.active.length, 0, `${wreck.programSlot}: real bearing fixes the survey`);
    const salvage = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
      .find((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
        && offer.cause.stageIndex === 1);
    assert.ok(salvage, `${wreck.programSlot}: survey boards literal salvage`);
    assert.equal(missionSystem.acceptMission(salvage.id), true, `${wreck.programSlot}: salvage accepts`);

    bearing.phase = 'decision';
    bearing.decisionReadyAtS = state.simTime;
    if (wreck.id === 'wreck_mts_silver_draft') {
      bus.emit('uniqueWreck:complicationTriggered', { wreckId: wreck.id, kind: 'cleaner_pursuit' });
    }
    bus.emit('uniqueWreck:decisionReady', { wreckId: wreck.id, sectorId: wreck.sectorId, phase: 'decision' });
    assert.equal(state.missions.active.length, 0, `${wreck.programSlot}: authored complication and recovery settle`);
    const fences = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
      .filter((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
        && offer.cause.stageIndex === 2);
    assert.equal(fences.length, 2, `${wreck.programSlot}: both native disposition receipts become reachable`);
    const selected = fences[index % fences.length];
    const sibling = fences.find((offer) => offer.id !== selected.id);
    assert.equal(missionSystem.acceptMission(selected.id), true, `${wreck.programSlot}: disposition accepts`);
    assert.equal(state.missions.active.length, 0, `${wreck.programSlot}: terminal disposition settles`);
    assert.equal(offerOnAnyBoard(state, sibling.id), false, `${wreck.programSlot}: sibling is withdrawn`);
    assert.equal(state.player.uniqueWrecks.bearings[wreck.id].phase, 'salvaged');
    assert.equal(state.player.uniqueWrecks.bearings[wreck.id].choiceId, selected.params.wreckChoiceId);
    assert.equal(eventCount(bus, 'uniqueWreck:choose', (payload) => payload.wreckId === wreck.id), 1);
    assert.equal(eventCount(bus, 'uniqueWreck:resolved', (payload) => payload.wreckId === wreck.id), 1);
    assert.equal(eventCount(bus, 'mission:completed', (payload) => (
      payload.chainId === opening.cause.chainId && payload.stageIndex === 2
    )), 1, `${wreck.programSlot}: terminal mission event is exact-once`);
    assert.ok(state.missions.receipts.some((receipt) => (
      receipt.chainId === opening.cause.chainId && receipt.stageIndex === 2
        && receipt.outcome === 'completed'
    )), `${wreck.programSlot}: canonical terminal receipt persists`);
  }
});

test('all three Long Read phases expose semantic objective, authored brief, and nav guidance', async () => {
  const api = await runtimeApi();
  const compilerState = baseState({ seed: 1177 });
  const opening = api.buildSetPieceMissionOffers(compilerState, {
    ...initialCursor('long_read', 40),
    wreckId: 'wreck_smokesong',
  })[0];
  const salvage = api.advanceSetPieceMission(compilerState, opening, { outcome: 'completed' }).offers[0];
  const fence = api.advanceSetPieceMission(compilerState, salvage, { outcome: 'completed' }).offers
    .find((offer) => offer.params.wreckChoiceId === 'authority_handover');
  const phases = [
    {
      offer: opening,
      flags: { rumorPurchased: true, bearingFixed: false },
      objective: /RUMOR PURCHASED.*BEARING FIXED/,
      nav: /purchased.*bearing|fix.*bearing/i,
    },
    {
      offer: salvage,
      flags: { complicationObserved: false, salvageDecisionReady: false },
      objective: /COMPLICATION LIVE.*WRECK RECOVERED/,
      nav: /recover.*wreck|recover.*Smokesong/i,
    },
    {
      offer: fence,
      flags: {},
      objective: /CONFIRM DISPOSITION/,
      nav: /confirm.*handover|disposition/i,
    },
  ];

  for (const phase of phases) {
    const state = baseState({ seed: 1177 });
    const missionSystem = { ...missions };
    missionSystem.init({ state, bus: new Bus(), helpers: missionHelpers() });
    const active = missionSystem._instanceFromOffer(clone(phase.offer));
    Object.assign(active.params, phase.flags);
    state.missions.active.push(active);
    assert.equal(missionSystem.trackMission(active.id), true);
    const brief = missionCommandBrief(active, state);
    assert.match(objectiveText(active), phase.objective, `${active.params.setPieceObjective}: semantic status`);
    assert.equal(brief.why, active.summary, `${active.params.setPieceObjective}: authored summary is retained`);
    assert.doesNotMatch(brief.how, /cargo|hold space|deliver/i,
      `${active.params.setPieceObjective}: guidance never invents a cargo handoff`);
    assert.doesNotMatch(brief.how, /authored/i,
      `${active.params.setPieceObjective}: player guidance contains no developer jargon`);
    assert.match(state.nav.waypoint.reason, phase.nav, `${active.params.setPieceObjective}: nav states the real verb`);
  }
});
test('seed and board epoch determine stable chain and offer identities without random or wall-clock input', async () => {
  const api = await runtimeApi();
  guarded(() => {
    const state = baseState({ seed: 991 });
    const cursor = initialCursor('long_read', 7);
    const a = api.buildSetPieceMissionOffers(state, cursor);
    const b = api.buildSetPieceMissionOffers(state, clone(cursor));
    assert.deepEqual(a, b, 'same save seed and board epoch produce byte-equivalent offers');
    assert.equal(a.length, 1);
    assertNormalOffer(a[0], 'deterministic opening');

    const laterEpoch = api.buildSetPieceMissionOffers(state, { ...cursor, startEpoch: 8 });
    assert.notEqual(laterEpoch[0].cause.chainId, a[0].cause.chainId,
      'next board epoch creates the next repeatable chain id');
    const differentSave = api.buildSetPieceMissionOffers(baseState({ seed: 992 }), cursor);
    assert.notEqual(differentSave[0].cause.chainId, a[0].cause.chainId,
      'different save seed creates a different chain id');
    assert.match(a[0].cause.chainId, /^sp1_long_read_7_[a-z0-9]+$/,
      'chain id is explicit, seeded, and inspectable');
  });
});

test('all three archetypes complete both branches exactly once in their authored 3-4 stage shape', async () => {
  const api = await runtimeApi();
  const definitions = missionData.SET_PIECE_MISSIONS || [];
  guarded(() => {
    for (const definition of definitions) {
      for (const branch of definition.branches) {
        const result = walkRoute(api, baseState({ seed: 300 + definition.id.length }), definition, branch.id);
        assert.equal(result.accepted.length, definition.commonStages.length + branch.stages.length);
        assert.equal(result.choiceMoments, 1, `${definition.id}/${branch.id}: exactly one branch choice`);
        assert.equal(result.transitions.filter((row) => row.status === 'completed').length, 1,
          `${definition.id}/${branch.id}: one terminal settlement`);
        const selectedBranchStages = result.accepted.filter((offer) => offer.cause.branchId != null);
        assert.ok(selectedBranchStages.length >= 1);
        assert.ok(selectedBranchStages.every((offer) => offer.cause.branchId === branch.id),
          `${definition.id}/${branch.id}: sibling never reopens after selection`);
      }
    }
  });
});

test('failure, expiry, and abandon each yield one deterministic reduced-pay retry on the same selected branch', async () => {
  const api = await runtimeApi();
  const definition = (missionData.SET_PIECE_MISSIONS || []).find((entry) => entry.id === 'witness_run');
  assert.ok(definition, 'Witness Run exists');
  const branchId = definition.branches[0].id;
  guarded(() => {
    const state = baseState({ seed: 710 });
    let offers = api.buildSetPieceMissionOffers(state, initialCursor(definition.id, 11));
    let selected;
    for (let i = 0; i < 6; i++) {
      if (offers.length === 2) {
        selected = chooseOffer(offers, branchId);
        break;
      }
      const transition = api.advanceSetPieceMission(state, offers[0], { outcome: 'completed' });
      offers = transition.offers;
    }
    assert.ok(selected, 'test reached the authored mid-run choice');

    const cases = [
      { outcome: 'failed', reason: 'mission_failed' },
      { outcome: 'expired', reason: 'deadline' },
      { outcome: 'failed', reason: 'abandoned' },
    ];
    for (const settlement of cases) {
      const transition = api.advanceSetPieceMission(state, selected, settlement);
      const repeated = api.advanceSetPieceMission(state, clone(selected), clone(settlement));
      assert.deepEqual(repeated, transition, `${settlement.reason}: repeated settlement compiles the same dedupe key`);
      assert.equal(transition.status, 'retry');
      assert.equal(transition.offers.length, 1, `${settlement.reason}: one recovery offer, never both branches`);
      const retry = transition.offers[0];
      assert.equal(retry.cause.chainId, selected.cause.chainId);
      assert.equal(retry.cause.stageIndex, selected.cause.stageIndex);
      assert.equal(retry.cause.branchId, selected.cause.branchId);
      assert.equal(retry.cause.attempt, selected.cause.attempt + 1);
      assert.notEqual(retry.id, selected.id);
      assert.ok(retry.reward_cr < selected.reward_cr, `${settlement.reason}: recovery payout is reduced`);
      assert.ok(retry.collateral_cr < selected.collateral_cr, `${settlement.reason}: recovery stake is reduced`);
      assert.ok(transition.receipt.houseText && transition.receipt.recoveryText,
        `${settlement.reason}: failure and recovery both keep house voice`);
    }
  });
});

test('public failure observers see the promised SP1 retry already boarded', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 755 });
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers() });
  const opening = api.buildSetPieceMissionOffers(state, initialCursor('long_read', 14))[0];
  bus.emit('mission:offered', clone(opening));
  assert.equal(missionSystem.acceptMission(opening.id), true);
  const active = state.missions.active[0];
  assert.ok(active);

  let observed = null;
  bus.on('mission:failed', (payload) => {
    const retryPresent = Object.values(state.missions.boards || {}).some((board) => (
      (board && board.slots || []).some((offer) => (
        offer && offer.source === 'setPieceMission'
        && offer.cause && offer.cause.chainId === payload.chainId
        && offer.cause.stageIndex === payload.stageIndex
        && offer.cause.attempt === 1
      ))
    ));
    observed = { nextStationId: payload.nextStationId, retryPresent };
  });

  assert.equal(missionSystem.abandonMission(active.id), true);
  assert.deepEqual(observed, { nextStationId: opening.stationId, retryPresent: true },
    'mission:failed is a truthful synchronous receipt: its named recovery row already exists');
  const recoveryPopup = bus.log.filter((entry) => entry.name === 'comms:popup').at(-1);
  assert.equal(recoveryPopup.payload.note, 'Follow-up posted: Drift Market',
    'player-facing transition copy names the station while event payloads retain canonical ids');
  assert.equal(recoveryPopup.payload.note.includes('station_drift'), false);
  assert.equal(state.missions.active.length, 0);
});

test('slow completion across a refresh epoch advances one chain without seeding a duplicate opening', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 756 });
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers() });
  const opening = api.buildSetPieceMissionOffers(state, initialCursor('hearing', 0))[0];
  bus.emit('mission:offered', clone(opening));
  assert.equal(missionSystem.acceptMission(opening.id), true);
  const active = state.missions.active[0];
  state.simTime = missionData.MISSION_TUNING.refreshSec + 1;
  missionSystem._completeMission(active, 0);

  const rows = Object.values(state.missions.boards || {}).flatMap((board) => board.slots || [])
    .filter((offer) => offer && offer.source === 'setPieceMission'
      && offer.cause && offer.cause.archetypeId === 'hearing');
  assert.equal(rows.filter((offer) => offer.cause.chainId === opening.cause.chainId
    && offer.cause.stageIndex === 1).length, 2, 'the original chain posts its two choice rows');
  assert.equal(rows.filter((offer) => offer.cause.stageIndex === 0).length, 0,
    'ensureBoard cannot seed a new-epoch opening during the old chain transition');
});

test('normal mission save/load preserves active and between-stage causes without setPieceRuns state', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 812 });
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers() });
  const opening = api.buildSetPieceMissionOffers(state, initialCursor('hearing', 5))[0];
  bus.emit('mission:offered', clone(opening));
  assert.ok(offerOnAnyBoard(state, opening.id), 'normal mission board accepts the opening');
  bus.emit('ui:acceptMission', { missionId: opening.id });
  assert.equal(state.missions.active.length, 1);
  assert.deepEqual(state.missions.active[0].cause, opening.cause);
  const activeSave = JSON.parse(JSON.stringify(missionSystem.serialize()));
  assert.equal(Object.hasOwn(activeSave, 'setPieceRuns'), false);
  assert.equal(Object.hasOwn(state.missions, 'setPieceRuns'), false);
  assert.deepEqual(activeSave.active[0].cause, opening.cause);

  const next = api.advanceSetPieceMission(state, opening, { outcome: 'completed' }).offers[0];
  const boardState = baseState({ seed: 812 });
  const boardBus = new Bus();
  const boardMissionSystem = { ...missions };
  boardMissionSystem.init({ state: boardState, bus: boardBus, helpers: missionHelpers() });
  boardBus.emit('mission:offered', clone(next));
  const boardSave = JSON.parse(JSON.stringify(boardMissionSystem.serialize()));
  assert.ok(Object.values(boardSave.boards).some((board) =>
    (board.slots || []).some((offer) => offer.id === next.id && offer.cause.chainId === next.cause.chainId)),
  'between-stage offer survives JSON through the canonical board');
  assert.equal(Object.hasOwn(boardSave, 'setPieceRuns'), false);

  const restored = baseState({ seed: 812 });
  const restoredSystem = { ...missions };
  restoredSystem.init({ state: restored, bus: new Bus(), helpers: missionHelpers() });
  restoredSystem.deserialize(boardSave);
  assert.ok(offerOnAnyBoard(restored, next.id));
  assert.equal(Object.hasOwn(restored.missions, 'setPieceRuns'), false);
});

test('same-epoch settlement identity survives receipt eviction, save/load, migration, and new game', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 815 });
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers() });
  const opening = api.buildSetPieceMissionOffers(state, initialCursor('hearing', 0))[0];
  const settlement = api.advanceSetPieceMission(state, opening, { outcome: 'completed' });
  const terminalMission = { ...clone(opening), id: 'm_sp1_epoch_terminal', sourceOfferId: opening.id };
  const originalReceipt = missionSystem._recordMissionReceipt(terminalMission, 'completed', null, {
    setPieceReceipt: settlement.receipt,
  });
  for (let index = 0; index < 10; index++) {
    missionSystem._recordMissionReceipt({
      id: `m_later_${index}`,
      type: 'cargo_delivery',
      title: `Later settlement ${index}`,
      source: 'ordinary',
    }, 'completed', null);
  }
  assert.equal(state.missions.receipts.some((receipt) => receipt.chainId === opening.cause.chainId), false,
    'the bounded presentation list really did evict the original chain receipt');
  state.missions.boards = {};

  const save = JSON.parse(JSON.stringify(missionSystem.serialize()));
  assert.equal(save.setPieceSettlements.hearing.chainId, opening.cause.chainId,
    'the compact identity marker serializes independently from presentation receipts');
  const restored = baseState({ seed: 815 });
  const restoredSystem = { ...missions };
  restoredSystem.init({ state: restored, bus: new Bus(), helpers: missionHelpers() });
  restoredSystem.deserialize(save);
  const board = restoredSystem.ensureBoard(opening.stationId);
  assert.equal((board.slots || []).some((offer) => offer && offer.cause
    && offer.cause.chainId === opening.cause.chainId && offer.cause.stageIndex === 0), false,
  'same-epoch ensureBoard cannot resurrect an evicted settled chain');

  const legacy = clone(save);
  delete legacy.setPieceSettlements;
  legacy.receipts = [originalReceipt];
  const migrated = baseState({ seed: 815 });
  const migratedSystem = { ...missions };
  migratedSystem.init({ state: migrated, bus: new Bus(), helpers: missionHelpers() });
  migratedSystem.deserialize(legacy);
  assert.equal(migratedSystem.serialize().setPieceSettlements.hearing.chainId, opening.cause.chainId,
    'an older save with a surviving canonical receipt migrates into the compact marker');

  restoredSystem.newGame();
  assert.equal(Object.hasOwn(restored.missions, 'setPieceSettlements'), false,
    'newGame clears settlement identity from the prior save');
});

test('authored SP1 deadlines survive save/load and expire into a truthful retry receipt', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 813, simTime: 37 });
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers() });
  const opening = api.buildSetPieceMissionOffers(state, initialCursor('long_read', 5))[0];
  assert.ok(opening.duration_s > 0, 'the authored duration reaches the ordinary offer');
  bus.emit('mission:offered', clone(opening));
  assert.equal(missionSystem.acceptMission(opening.id), true);
  const deadline = state.missions.active[0].deadline_s;
  assert.equal(deadline, state.simTime + opening.duration_s);

  const save = JSON.parse(JSON.stringify(missionSystem.serialize()));
  const restored = baseState({ seed: 813, simTime: 37 });
  const restoredBus = new Bus();
  const restoredSystem = { ...missions };
  restoredSystem.init({ state: restored, bus: restoredBus, helpers: missionHelpers() });
  restoredSystem.deserialize(save);
  assert.equal(restored.missions.active[0].deadline_s, deadline, 'absolute sim deadline survives JSON');
  restored.simTime = deadline;
  restoredSystem.update(0, restored);
  assert.equal(restored.missions.active.length, 0);
  const retry = Object.values(restored.missions.boards).flatMap((board) => board.slots || [])
    .find((offer) => offer && offer.cause && offer.cause.chainId === opening.cause.chainId
      && offer.cause.stageIndex === 0 && offer.cause.attempt === 1);
  assert.ok(retry, 'expiry posts the promised reduced-stake retry');
  const receipt = restored.missions.receipts.find((row) => row.missionId === save.active[0].id
    && row.outcome === 'expired');
  assert.equal(receipt.nextStationId, opening.stationId);
  assert.equal(receipt.reason, 'deadline');
});

test('expiry removes sealed contract cargo and records the cleanup before public observers run', async () => {
  const api = await runtimeApi();
  const definition = missionData.SET_PIECE_MISSIONS.find((entry) => entry.id === 'witness_run');
  const state = baseState({ seed: 814, simTime: 5 });
  let offers = api.buildSetPieceMissionOffers(state, initialCursor(definition.id, 6));
  while (offers.length === 1) offers = api.advanceSetPieceMission(state, offers[0], { outcome: 'completed' }).offers;
  const cargoOffer = offers.find((offer) => offer.preloadedCargo);
  assert.ok(cargoOffer);

  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers() });
  for (const offer of offers) bus.emit('mission:offered', clone(offer));
  assert.equal(missionSystem.acceptMission(cargoOffer.id), true);
  const active = state.missions.active[0];
  const commodityId = active.params.cmdtyId;
  const quantity = active.params.qty;
  assert.equal(state.player.cargo.items[commodityId], quantity);
  active.deadline_s = state.simTime + 1;

  let observer = null;
  bus.on('mission:expired', (payload) => {
    const receipt = state.missions.receipts.find((row) => row.missionId === payload.missionId
      && row.outcome === 'expired');
    observer = {
      cargo: state.player.cargo.items[commodityId] || 0,
      removed: receipt && receipt.contractCargoRemoved,
      retryPresent: offerOnAnyBoard(state, Object.values(state.missions.boards)
        .flatMap((board) => board.slots || [])
        .find((offer) => offer && offer.cause && offer.cause.chainId === cargoOffer.cause.chainId
          && offer.cause.stageIndex === cargoOffer.cause.stageIndex
          && offer.cause.attempt === 1)?.id),
    };
  });
  state.simTime = active.deadline_s;
  missionSystem.update(0, state);
  assert.deepEqual(observer, { cargo: 0, removed: quantity, retryPresent: true });
});

test('every compiled stage uses the normal standing ladder before any credit, cargo, or board mutation', async () => {
  const api = await runtimeApi();
  const compiled = new Map();
  for (const definition of missionData.SET_PIECE_MISSIONS || []) {
    for (const branch of definition.branches) {
      const route = walkRoute(api, baseState({ seed: 920 + definition.id.length }), definition, branch.id, 12);
      for (const offer of route.accepted) {
        const key = [offer.cause.archetypeId, offer.cause.stageIndex, offer.cause.branchId || 'common'].join(':');
        compiled.set(key, offer);
      }
    }
  }
  assert.ok(compiled.size >= 9, 'acceptance exercises every common and branch stage');

  for (const [key, rawOffer] of compiled) {
    const offer = clone(rawOffer);
    const threshold = missionData.missionMinRepForRisk(offer.riskTier);
    const state = baseState({ seed: 921 });
    state.factions[offer.factionId] = { rep: threshold - 1 };
    state.missions.boards[offer.stationId] = { refreshEpoch: offer.cause.startEpoch, slots: [offer] };
    const bus = new Bus();
    const missionSystem = { ...missions };
    missionSystem.init({ state, bus, helpers: missionHelpers() });
    const creditsBefore = state.player.credits;
    const cargoBefore = clone(state.player.cargo);
    assert.equal(missionSystem.acceptMission(offer.id), false, `${key}: threshold - 1 is blocked`);
    assert.equal(state.player.credits, creditsBefore, `${key}: blocked standing does not write credits`);
    assert.deepEqual(state.player.cargo, cargoBefore, `${key}: blocked standing does not preload cargo`);
    assert.equal(state.missions.active.length, 0, `${key}: blocked standing does not activate`);
    assert.ok(offerOnAnyBoard(state, offer.id), `${key}: blocked standing leaves the offer posted`);
    assert.equal(eventCount(bus, 'economy:chargeCredits'), 0, `${key}: no collateral/service charge before standing`);

    state.factions[offer.factionId].rep = threshold;
    assert.equal(missionSystem.acceptMission(offer.id), true, `${key}: exact threshold accepts`);
    assert.equal(state.missions.active.length, 1);
  }
});

test('accepting one Long Read fence branch removes its sibling before the native choice is emitted', async () => {
  const api = await runtimeApi();
  const definition = (missionData.SET_PIECE_MISSIONS || []).find((entry) => entry.id === 'long_read');
  assert.ok(definition);
  const stateForOffers = baseState({ seed: 1047 });
  let offers = api.buildSetPieceMissionOffers(stateForOffers, initialCursor(definition.id, 20));
  for (let i = 0; i < 6 && offers.length !== 2; i++) {
    offers = api.advanceSetPieceMission(stateForOffers, offers[0], { outcome: 'completed' }).offers;
  }
  assert.equal(offers.length, 2, 'The Long Read reaches exactly two fence siblings');
  const selected = offers.find((offer) => offer.params && offer.params.wreckChoiceId);
  assert.ok(selected, 'selected fence route carries a native unique-wreck choice');
  const sibling = offers.find((offer) => offer.id !== selected.id);

  const state = baseState({ seed: 1047 });
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers() });
  for (const offer of offers) bus.emit('mission:offered', clone(offer));
  assert.ok(offerOnAnyBoard(state, selected.id) && offerOnAnyBoard(state, sibling.id),
    'both choices are visible before selection');

  let choiceObserved = false;
  bus.on('uniqueWreck:choose', (payload) => {
    choiceObserved = true;
    assert.equal(payload.wreckId, selected.cause.wreckId);
    assert.equal(payload.choiceId, selected.params.wreckChoiceId);
    assert.equal(offerOnAnyBoard(state, sibling.id), false,
      'unchosen sibling is withdrawn atomically before the live decision event');
  });
  assert.equal(missionSystem.acceptMission(selected.id), true);
  assert.equal(choiceObserved, true);
  assert.equal(offerOnAnyBoard(state, sibling.id), false);
  assert.equal(state.missions.active[0].cause.branchId, selected.cause.branchId);
  assert.equal(Object.keys(state.player.cargo.items).length, 0, 'fence selection does not fabricate cargo');
});

test('canonical receipts retain seeded chain identity and house voice alongside payout facts', async () => {
  const api = await runtimeApi();
  const state = baseState({ seed: 1211 });
  const offer = api.buildSetPieceMissionOffers(state, initialCursor('long_read', 31))[0];
  const transition = api.advanceSetPieceMission(state, offer, { outcome: 'completed' });
  assert.ok(transition.receipt.houseText && transition.receipt.houseText.length >= 24);
  const receipt = missionReceiptFor(
    { ...clone(offer), id: 'm_sp1_receipt' },
    'completed',
    null,
    { rewardCr: offer.reward_cr, at_s: 44, setPieceReceipt: transition.receipt },
  );
  assert.equal(receipt.chainId, offer.cause.chainId);
  assert.equal(receipt.archetypeId, offer.cause.archetypeId);
  assert.equal(receipt.stageIndex, offer.cause.stageIndex);
  assert.equal(receipt.branchId, offer.cause.branchId || null);
  assert.equal(receipt.attempt, offer.cause.attempt);
  assert.equal(receipt.houseText, transition.receipt.houseText);
  assert.equal(receipt.rewardCr, offer.reward_cr, 'house copy supplements rather than replaces payout facts');

  const failed = api.advanceSetPieceMission(state, offer, { outcome: 'failed', reason: 'abandoned' });
  assert.ok(failed.receipt.houseText && failed.receipt.recoveryText,
    'failure receipt carries both settlement and recovery voice');
});
