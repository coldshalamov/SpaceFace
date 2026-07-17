/**
 * Depth Package A — multi-stage mission shapes (blockade_run, investigation_chain).
 * Drives shipped set-piece APIs only: buildSetPieceMissionOffers + advanceSetPieceMission +
 * missions.serialize/deserialize for reload continuity and durable receipts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as missionData from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions } from '../src/systems/missions.js';
import {
  SET_PIECE_MISSION_SOURCE,
  buildSetPieceMissionOffers,
  advanceSetPieceMission,
} from '../src/systems/setPieceMissionOffers.js';
import { FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';

const DEPTH_SHAPES = ['blockade_run', 'investigation_chain'];

const STATION_TO_SECTOR = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) STATION_TO_SECTOR.set(station.id, sector.id);
}

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function baseState({ seed = 91, simTime = 0 } = {}) {
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
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 },
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
    story: { beatIndex: 2, branch: null, flags: {}, chainProgress: 0 },
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

function cursor(archetypeId, startEpoch = 40) {
  return {
    archetypeId,
    startEpoch,
    stageIndex: 0,
    branchId: null,
    attempt: 0,
  };
}

function stageTypeSequence(definition, branchId) {
  const branch = definition.branches.find((entry) => entry.id === branchId);
  return [...definition.commonStages, ...branch.stages].map((stage) => stage.type);
}

function runSuccessRoute(api, state, archetypeId, branchId) {
  const definition = missionData.SET_PIECE_MISSIONS.find((entry) => entry.id === archetypeId);
  let offers = api.buildSetPieceMissionOffers(state, cursor(archetypeId, 40));
  assert.equal(offers.length, 1, `${archetypeId}: opening offer`);
  assert.equal(offers[0].source, SET_PIECE_MISSION_SOURCE);
  const objectives = [];
  const transitions = [];
  let stageGuard = 0;
  while (stageGuard++ < 8) {
    assert.ok(offers.length === 1 || offers.length === 2, `${archetypeId}: 1 offer or branch pair`);
    let offer = offers[0];
    if (offers.length === 2) {
      offer = offers.find((row) => row.cause && row.cause.branchId === branchId)
        || offers.find((row) => row.cause && row.cause.branchLabel)
        || offers[0];
      // Branch siblings: pick the one whose branchId matches.
      const matched = offers.find((row) => row.cause && row.cause.branchId === branchId);
      assert.ok(matched, `${archetypeId}: branch ${branchId} posted as normal board sibling`);
      offer = matched;
    }
    assert.equal(typeof offer.summary, 'string');
    assert.ok(offer.summary.length >= 20, `${archetypeId}: stage summary/objective present`);
    objectives.push({
      stageId: offer.cause.stageId,
      type: offer.type,
      summary: offer.summary,
      stageIndex: offer.cause.stageIndex,
    });
    const settled = {
      ...offer,
      cause: { ...offer.cause },
    };
    const transition = api.advanceSetPieceMission(state, settled, {
      outcome: 'completed',
      reason: 'test_success',
    });
    transitions.push(transition);
    assert.ok(transition.receipt, `${archetypeId}: success receipt`);
    assert.equal(transition.receipt.outcome, 'completed');
    assert.ok(transition.receipt.houseText && transition.receipt.houseText.length >= 12);
    if (transition.status === 'completed' && transition.offers.length === 0) {
      return { objectives, transitions, chainId: offer.cause.chainId, finalReceipt: transition.receipt };
    }
    offers = transition.offers;
  }
  assert.fail(`${archetypeId}/${branchId}: did not complete within stage budget`);
}

test('depth shapes register as multi-stage non-isomorphic set-pieces with authored copy', () => {
  const validation = missionData.validateSetPieceMissionCatalog();
  assert.equal(validation.ok, true, (validation.errors || []).join('\n'));
  assert.ok(validation.archetypes >= 5);
  assert.ok(validation.playableRoutes >= 10);

  const sequences = new Map();
  for (const id of DEPTH_SHAPES) {
    const definition = missionData.SET_PIECE_MISSIONS.find((entry) => entry.id === id);
    assert.ok(definition, `missing shape ${id}`);
    assert.ok(definition.commonStages.length >= 2, `${id}: ≥2 common stages`);
    assert.equal(definition.branches.length, 2);
    for (const branch of definition.branches) {
      const routeLen = definition.commonStages.length + branch.stages.length;
      assert.ok(routeLen >= 3 && routeLen <= 4, `${id}/${branch.id}: 3-4 stages`);
      const seq = stageTypeSequence(definition, branch.id).join('>');
      sequences.set(`${id}/${branch.id}`, seq);
      assert.ok(!seq.split('>').every((type) => type === 'cargo_delivery'),
        `${id}/${branch.id}: not a pure cargo chain`);
    }
    for (const stage of [
      ...definition.commonStages,
      ...definition.branches.flatMap((branch) => branch.stages),
    ]) {
      assert.ok(STATION_TO_SECTOR.has(stage.boardStationId), `${stage.id}: real board station`);
      for (const key of ['instructionRef', 'successRef', 'failureRef', 'recoveryRef']) {
        const row = FLAVOR_SOURCE_BY_REF[stage[key]];
        assert.ok(row && row.text && row.text.trim().length >= 24, `${stage.id} ${key}`);
      }
      assert.ok(stage.params && stage.params.setPieceObjective,
        `${stage.id}: distinct setPieceObjective for presentation`);
    }
  }

  // Structural difference from each other and from a single-threshold delivery.
  assert.notEqual(
    sequences.get('blockade_run/pay_the_toll'),
    sequences.get('investigation_chain/file_public'),
  );
  assert.match(sequences.get('blockade_run/break_the_guns'), /patrol_clear/);
  assert.match(sequences.get('blockade_run/pay_the_toll'), /smuggling_run/);
  assert.match(sequences.get('investigation_chain/file_public'), /salvage_retrieval/);
  assert.match(sequences.get('investigation_chain/sell_quiet'), /smuggling_run/);
});

test('depth shapes accept→stage→complete through shipped advance API with updating objectives', () => {
  for (const id of DEPTH_SHAPES) {
    const definition = missionData.SET_PIECE_MISSIONS.find((entry) => entry.id === id);
    for (const branch of definition.branches) {
      const state = baseState({ seed: 1100 + hash32(id, branch.id) % 200 });
      const { objectives, transitions, finalReceipt } = runSuccessRoute(
        { buildSetPieceMissionOffers, advanceSetPieceMission },
        state,
        id,
        branch.id,
      );
      assert.ok(objectives.length >= 3, `${id}/${branch.id}: ≥3 stages walked`);
      const summaries = new Set(objectives.map((row) => row.summary));
      assert.ok(summaries.size >= 2, `${id}/${branch.id}: objectives change across stages`);
      const indices = objectives.map((row) => row.stageIndex);
      for (let i = 1; i < indices.length; i++) {
        assert.ok(indices[i] >= indices[i - 1], `${id}: stageIndex does not go backwards`);
      }
      assert.equal(finalReceipt.archetypeId, id);
      assert.equal(transitions[transitions.length - 1].status, 'completed');
      assert.equal(transitions[transitions.length - 1].offers.length, 0);
    }
  }
});

test('depth shapes failure opens one reduced-stake retry then terminal failure receipt', () => {
  for (const id of DEPTH_SHAPES) {
    const state = baseState({ seed: 2200 });
    const opening = buildSetPieceMissionOffers(state, cursor(id, 55))[0];
    assert.ok(opening);
    const fail = advanceSetPieceMission(state, opening, {
      outcome: 'failed',
      reason: 'test_fail',
    });
    assert.equal(fail.status, 'retry', `${id}: first failure posts retry`);
    assert.equal(fail.offers.length, 1);
    assert.ok(fail.receipt && fail.receipt.outcome === 'failed');
    assert.ok(fail.receipt.recoveryText && fail.receipt.recoveryText.length >= 12);
    assert.ok(fail.offers[0].cause.attempt === 1);
    assert.ok(
      fail.offers[0].reward_cr < opening.reward_cr
      || fail.offers[0].collateral_cr <= opening.collateral_cr,
      `${id}: retry is reduced stake`,
    );

    const secondFail = advanceSetPieceMission(state, fail.offers[0], {
      outcome: 'failed',
      reason: 'test_fail_again',
    });
    assert.equal(secondFail.status, 'completed', `${id}: second failure is terminal`);
    assert.equal(secondFail.offers.length, 0);
    assert.equal(secondFail.receipt.outcome, 'failed');
    assert.ok(secondFail.receipt.houseText.length >= 12);
    // Terminal failure does not post another recovery offer.
    assert.equal(secondFail.receipt.recoveryText, null);
  }
});

test('mid-chain save/reload preserves set-piece stage identity via mission serialize path', () => {
  const state = baseState({ seed: 3301 });
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });

  const opening = buildSetPieceMissionOffers(state, cursor('blockade_run', 77))[0];
  assert.ok(opening);
  // Accept into active list using the same cause the board would hand off.
  state.missions.active.push({
    id: 'm_depth_blockade_1',
    ...opening,
    status: 'active',
    progress: 0,
  });
  const afterFirst = advanceSetPieceMission(state, opening, {
    outcome: 'completed',
    reason: 'stage0_done',
  });
  assert.equal(afterFirst.status, 'advanced');
  assert.equal(afterFirst.offers.length, 1);
  const midOffer = afterFirst.offers[0];
  assert.equal(midOffer.cause.stageIndex, 1);
  assert.equal(midOffer.cause.archetypeId, 'blockade_run');
  assert.equal(midOffer.cause.chainId, opening.cause.chainId);

  // Durable settlement receipt pattern used by missions system.
  state.missions.setPieceSettlements = {
    blockade_run: {
      chainId: midOffer.cause.chainId,
      archetypeId: 'blockade_run',
      stageIndex: midOffer.cause.stageIndex,
      stageId: midOffer.cause.stageId,
      branchId: null,
      outcome: 'advanced',
      houseText: afterFirst.receipt.houseText,
    },
  };
  state.missions.receipts.push({
    source: SET_PIECE_MISSION_SOURCE,
    chainId: midOffer.cause.chainId,
    archetypeId: 'blockade_run',
    stageId: afterFirst.receipt.stageId,
    outcome: 'completed',
    houseText: afterFirst.receipt.houseText,
  });
  state.missions.active = [{
    id: 'm_depth_blockade_2',
    ...midOffer,
    status: 'active',
    progress: 0,
  }];

  const serialized = missionSystem.serialize();
  assert.ok(serialized.setPieceSettlements || serialized.receipts?.length,
    'save carries set-piece continuity fields');
  const restoredState = baseState({ seed: 3301 });
  const restoredSystem = { ...missions };
  restoredSystem.init({
    state: restoredState,
    bus: new Bus(),
    helpers: missionHelpers(),
    registry: { get: () => null },
  });
  restoredSystem.deserialize(serialized);

  assert.equal(
    restoredState.missions.setPieceSettlements?.blockade_run?.chainId,
    opening.cause.chainId,
  );
  assert.equal(
    restoredState.missions.setPieceSettlements?.blockade_run?.stageIndex,
    1,
  );
  const active = restoredState.missions.active.find((row) => row.cause?.chainId === opening.cause.chainId)
    || restoredState.missions.active[0];
  assert.ok(active);
  assert.equal(active.cause.stageIndex, 1);
  assert.equal(active.cause.archetypeId, 'blockade_run');
  assert.equal(active.cause.stageId, midOffer.cause.stageId);

  // Continuing from restored mid-stage still advances on the same chain.
  const continued = advanceSetPieceMission(restoredState, active, {
    outcome: 'completed',
    reason: 'post_reload',
  });
  assert.ok(continued.offers.length >= 1 || continued.status === 'branch_available'
    || continued.status === 'advanced' || continued.status === 'completed');
  if (continued.offers[0]) {
    assert.equal(continued.offers[0].cause.chainId, opening.cause.chainId);
    assert.ok(continued.offers[0].cause.stageIndex >= 1);
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function initMissions(state) {
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: missionHelpers(), registry: { get: () => null } });
  return { bus, missionSystem };
}

test('success and failure leave durable saveable receipts via real mission complete/fail', () => {
  // ── Success: accept opening from board, complete through shipped _completeMission ──
  const successState = baseState({ seed: 4403 });
  const { bus: successBus, missionSystem: successMissions } = initMissions(successState);
  const successOpening = buildSetPieceMissionOffers(successState, cursor('investigation_chain', 88))[0];
  assert.ok(successOpening);
  successBus.emit('mission:offered', clone(successOpening));
  assert.equal(successMissions.acceptMission(successOpening.id), true, 'accept via board offer id');
  const successActive = successState.missions.active[0];
  assert.ok(successActive);
  assert.equal(successActive.cause.archetypeId, 'investigation_chain');
  successMissions._completeMission(successActive, 0);

  assert.ok(Array.isArray(successState.missions.receipts) && successState.missions.receipts.length >= 1);
  const successReceipt = successState.missions.receipts.find((row) => (
    row && row.archetypeId === 'investigation_chain' && row.outcome === 'completed'
  ));
  assert.ok(successReceipt, 'saveable receipts[] holds completed set-piece settlement');
  assert.equal(successReceipt.chainId, successOpening.cause.chainId);
  assert.ok(successReceipt.houseText && successReceipt.houseText.length >= 12);
  assert.match(successReceipt.houseText, /WRECK|BOX|LOG|RECOVER|FILE|SCAN|SILENT|NAME|ISOLATED/i);
  assert.ok(successReceipt.repDelta > 0 || successReceipt.researchPoints > 0
    || successReceipt.rewardCr > 0, 'success settlement records durable payout/rep/RP fields');
  assert.equal(
    successState.missions.setPieceSettlements?.investigation_chain?.chainId,
    successOpening.cause.chainId,
    'setPieceSettlements persists archetype settlement for save',
  );
  assert.equal(successState.missions.setPieceSettlements.investigation_chain.outcome, 'completed');

  // Serialize proves save authority, not ephemeral transition objects.
  const successSave = successMissions.serialize();
  assert.ok(successSave.receipts?.some((r) => r.archetypeId === 'investigation_chain' && r.outcome === 'completed'));
  assert.equal(successSave.setPieceSettlements?.investigation_chain?.outcome, 'completed');

  // ── Failure: accept opening, abandon through shipped fail path ──
  const failState = baseState({ seed: 4402 });
  const { bus: failBus, missionSystem: failMissions } = initMissions(failState);
  const failOpening = buildSetPieceMissionOffers(failState, cursor('investigation_chain', 89))[0];
  failBus.emit('mission:offered', clone(failOpening));
  assert.equal(failMissions.acceptMission(failOpening.id), true);
  const failActive = failState.missions.active[0];
  assert.equal(failMissions.abandonMission(failActive.id), true);

  const failReceipt = failState.missions.receipts.find((row) => (
    row && row.archetypeId === 'investigation_chain' && row.outcome === 'failed'
  ));
  assert.ok(failReceipt, 'saveable receipts[] holds failed set-piece settlement');
  assert.equal(failReceipt.chainId, failOpening.cause.chainId);
  assert.ok(failReceipt.houseText && failReceipt.houseText.length >= 12);
  assert.ok(failReceipt.recoveryText && failReceipt.recoveryText.length >= 12);
  assert.ok(failReceipt.repDelta < 0 || failReceipt.collateralLostCr >= 0,
    'failure records rep penalty and/or collateral loss in saveable receipt');
  assert.equal(failState.missions.setPieceSettlements?.investigation_chain?.outcome, 'failed');
  assert.notEqual(successReceipt.houseText, failReceipt.houseText,
    'success vs failure durable house voice differs');
  assert.notEqual(successReceipt.outcome, failReceipt.outcome);

  // Retry offer must be boarded on the real mission board after fail.
  const retryOnBoard = Object.values(failState.missions.boards || {}).some((board) => (
    (board.slots || []).some((offer) => (
      offer && offer.source === SET_PIECE_MISSION_SOURCE
      && offer.cause?.chainId === failOpening.cause.chainId
      && offer.cause?.attempt === 1
    ))
  ));
  assert.equal(retryOnBoard, true, 'failure boards reduced-stake retry via production path');

  const failSave = failMissions.serialize();
  assert.equal(failSave.setPieceSettlements?.investigation_chain?.outcome, 'failed');
  assert.ok(failSave.receipts?.some((r) => r.outcome === 'failed' && r.archetypeId === 'investigation_chain'));
});

test('depth shapes seed on normal mission boards at their start stations', () => {
  const state = baseState({ seed: 5505 });
  const { missionSystem } = initMissions(state);

  // ensureBoard expects a stationId string (STATION_INFO key), not a station object.
  const customsBoard = missionSystem.ensureBoard('station_customs');
  const reachBoard = missionSystem.ensureBoard('station_reach');
  assert.ok(customsBoard && Array.isArray(customsBoard.slots), 'customs board materializes');
  assert.ok(reachBoard && Array.isArray(reachBoard.slots), 'reach board materializes');
  assert.ok(customsBoard.slots.length > 0, 'customs board has offers');
  assert.ok(reachBoard.slots.length > 0, 'reach board has offers');

  const blockade = customsBoard.slots.find((offer) => (
    offer
    && offer.source === SET_PIECE_MISSION_SOURCE
    && offer.cause
    && offer.cause.archetypeId === 'blockade_run'
    && offer.cause.stageIndex === 0
  ));
  const investigation = reachBoard.slots.find((offer) => (
    offer
    && offer.source === SET_PIECE_MISSION_SOURCE
    && offer.cause
    && offer.cause.archetypeId === 'investigation_chain'
    && offer.cause.stageIndex === 0
  ));
  assert.ok(blockade, 'station_customs board slots include blockade_run setPieceMission opening');
  assert.ok(investigation, 'station_reach board slots include investigation_chain setPieceMission opening');
  assert.equal(blockade.stationId, 'station_customs');
  assert.equal(investigation.stationId, 'station_reach');
  assert.ok(blockade.summary && blockade.summary.length >= 20);
  assert.ok(investigation.summary && investigation.summary.length >= 20);

  // Accept from the real board slot (not a free-floating compiler object).
  const { bus, missionSystem: acceptSystem } = initMissions(baseState({ seed: 5506 }));
  acceptSystem.ensureBoard('station_customs');
  const slot = acceptSystem.state.missions.boards.station_customs.slots.find((offer) => (
    offer?.cause?.archetypeId === 'blockade_run'
  ));
  assert.ok(slot);
  bus.emit('mission:offered', clone(slot)); // ensure external path is registered if needed
  // Offer is already on board from ensureBoard; accept by id.
  assert.equal(acceptSystem.acceptMission(slot.id), true,
    'player can accept depth shape from normal board slot');
  assert.equal(acceptSystem.state.missions.active[0].cause.archetypeId, 'blockade_run');
});
