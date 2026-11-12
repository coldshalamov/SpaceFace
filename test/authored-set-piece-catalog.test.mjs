// The authored set-piece catalog must give every far station a physical job of its own.
//
// Before 28d579f93dd, 11 authored pieces started at only six stations (3 of 11 at the single Belt
// Outpost) and not one started at Sker Bazaar, Io Reach, the Mercenary Outpost, the Expanse
// Refinery, Drift Market or Ash Cache. Dock out there and the board had no tow, jam or heist.
// Those six pieces landed; this file is the lock that keeps the far sectors served:
//   1. the catalog and its encounters validate, with a floor of fourteen pieces;
//   2. every station in the five far sectors, derived from the live sector table rather than
//      listed here, builds an authored offer and lists it on its seed-4242 board;
//   3. every piece ends in a follow-on (11 of 17 did before the far-out jobs got theirs);
//   4. a far-station offer survives the real save envelope, and a far-station job saved mid-run
//      still finishes into its follow-on after the restore.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import {
  AUTHORED_SET_PIECES,
  AUTHORED_SET_PIECE_MIN_COUNT,
  AUTHORED_SET_PIECE_SOURCE,
  AUTHORED_SET_PIECE_TYPE,
  buildAuthoredSetPieceOffer,
  validateAuthoredSetPieceCatalog,
} from '../src/data/missions.js';
import { missionConditionById } from '../src/data/missionConditions.js';
import {
  AUTHORED_SET_PIECE_ENCOUNTERS,
  validateAuthoredSetPieceEncounters,
} from '../src/data/encounters/set-piece-authored.js';
import { SECTORS } from '../src/data/sectors.js';
import { SET_PIECE_FOLLOW_ON_SOURCE, setPieceFollowOnOffer } from '../src/data/sandboxSetPieceFollowOns.js';
import { TETHYS_BLACK_MARKET_DISCOVERY, TETHYS_BLACK_MARKET_RUN } from '../src/data/frontierRumors.js';
import { missions } from '../src/systems/missions.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';

const SEED = 4242;
const FAR_SECTOR_IDS = Object.freeze([
  'sector_io_reach', 'sector_charon_expanse', 'sector_sker_haven', 'sector_ashfall_reach', 'sector_pallas_drift',
]);
const RAW_ID = /\b[a-z]+(?:_[a-z0-9]+)+\b|\b[a-z]+[A-Z][A-Za-z0-9]*\b/;

// Every station in the five far sectors, read from the live table.
const FAR_STATIONS = SECTORS
  .filter((sector) => FAR_SECTOR_IDS.includes(sector.id))
  .flatMap((sector) => (sector.stations || []).map((station) => ({ ...station, sectorId: sector.id })));

function piecesAt(stationId) {
  return AUTHORED_SET_PIECES.filter((row) => row.startStationId === stationId);
}

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [missions], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80,
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 100, z: -40 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  // The pilot a live berth would admit: the Den's private door is open, and the gated houses
  // (Reach, Vael, Quiet) already hold the standing that let this pilot read their boards.
  state.world.frontierRumors = {
    byId: {
      [TETHYS_BLACK_MARKET_DISCOVERY.rumorId]: {
        phase: 'contacted',
        contactId: TETHYS_BLACK_MARKET_DISCOVERY.contactId,
        entranceRun: { runId: TETHYS_BLACK_MARKET_RUN.runId, phase: 'delivered' },
      },
    },
  };
  state.factions = {
    ...(state.factions || {}),
    faction_reach: { rep: 5 },
    faction_vael: { rep: 5 },
    faction_quiet: { rep: 5 },
  };
  const failed = [];
  sim.bus.on('mission:failed', (payload) => failed.push(payload));
  const missionsSys = sim.registry.get('missions');
  // The live one-voice arbiter is not mounted in a bare sim; a recorder stands in for it.
  missionsSys.helpers.voice = { say() { return true; } };
  return { sim, state, failed, missionsSys };
}

function makeSaveHarness(sim) {
  const save = Object.create(saveDefinition);
  save.state = sim.state;
  save.bus = sim.bus;
  save.registry = { get: (name) => sim.registry.get(name) || null };
  save.helpers = sim.helpers;
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;
  return save;
}

function authoredSlot(board, pieceId) {
  return ((board && board.slots) || []).find((row) => (
    row && row.params && row.params.authoredSetPieceId === pieceId
  ));
}

// What the board promises the player about one authored offer, nothing else.
function offerShape(row) {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    stationId: row.stationId,
    stageId: row.stageId,
    reward_cr: row.reward_cr,
    authoredSetPieceId: row.params.authoredSetPieceId,
    completionMethods: row.params.completionMethods,
    twistClauseId: row.params.twistClauseId,
    encounterId: row.params.encounterId,
    primaryRole: row.params.primaryRole,
  };
}

test('the catalog and its encounters validate, with a floor of fourteen pieces', () => {
  const validation = validateAuthoredSetPieceCatalog();
  assert.equal(validation.ok, true, validation.errors.join('; '));
  assert.ok(AUTHORED_SET_PIECE_MIN_COUNT >= 14, 'the floor never drops below fourteen');
  assert.ok(validation.count >= 14, `at least fourteen authored pieces (found ${validation.count})`);
  assert.deepEqual(validateAuthoredSetPieceEncounters(), [], 'every piece has a sound encounter');
  for (const row of AUTHORED_SET_PIECES) {
    assert.ok(AUTHORED_SET_PIECE_ENCOUNTERS[row.id], `${row.id} has actors and a place`);
    assert.ok(missionConditionById(row.twistClauseId), `${row.id} twist clause ${row.twistClauseId} is registered`);
  }
});

test('the validator refuses a catalog that shrinks or a method that can never fire', () => {
  const shrunk = validateAuthoredSetPieceCatalog(AUTHORED_SET_PIECES.slice(0, 11));
  assert.equal(shrunk.ok, false, 'the original eleven are below the floor');
  assert.match(shrunk.errors.join(' '), /at least 14/);

  const [first, ...rest] = AUTHORED_SET_PIECES;
  const [firstMethod, secondMethod] = first.methods;
  const doubled = {
    ...first,
    methodHooks: {
      ...first.methodHooks,
      [secondMethod]: { ...first.methodHooks[firstMethod] },
    },
  };
  const bad = validateAuthoredSetPieceCatalog([doubled, ...rest]);
  assert.equal(bad.ok, false, 'two methods answering the same event on the same role is refused');
  assert.match(bad.errors.join(' '), /both answer/);
});

test('every station in the five far sectors builds an authored offer', () => {
  const ids = FAR_STATIONS.map((station) => station.id);
  assert.ok(FAR_STATIONS.length >= 7, `the live table lists the far stations (found ${ids.join(', ')})`);
  for (const must of ['station_drift', 'station_smuggler', 'station_reach', 'station_io_merc',
    'station_expanse', 'station_sker', 'station_ashcache']) {
    assert.ok(ids.includes(must), `${must} is a station in the five far sectors`);
  }
  const startsAtFar = new Set(AUTHORED_SET_PIECES.map((row) => row.startStationId));
  for (const station of FAR_STATIONS) {
    assert.ok((station.services || []).includes('missions'), `${station.id} has a mission board`);
    const defs = piecesAt(station.id);
    assert.ok(defs.length >= 1, `${station.id} posts at least one authored physical job`);
    assert.ok(startsAtFar.has(station.id));
    for (const def of defs) {
      const offer = buildAuthoredSetPieceOffer(def, 3);
      assert.ok(offer, `${def.id} builds an offer`);
      assert.equal(offer.stationId, station.id);
      assert.equal(offer.type, AUTHORED_SET_PIECE_TYPE);
      assert.equal(offer.source, AUTHORED_SET_PIECE_SOURCE);
      assert.equal(offer.params.authoredSetPieceId, def.id);
      assert.deepEqual(offer.params.completionMethods, [...def.methods]);
      assert.equal(offer.params.twistClauseId, def.twistClauseId);
      assert.equal(offer.params.encounterId, def.encounterId);
      assert.ok(offer.reward_cr > 0);
      for (const key of ['title', 'brief', 'summary']) {
        assert.ok(offer[key] && offer[key].trim().length > 8, `${def.id} ${key} has words`);
        assert.equal(RAW_ID.test(offer[key]), false, `${def.id} ${key} shows no raw id: ${offer[key]}`);
      }
    }
  }
  const farPieces = AUTHORED_SET_PIECES.filter((row) => ids.includes(row.startStationId));
  const nearPieces = AUTHORED_SET_PIECES.filter((row) => !ids.includes(row.startStationId));
  assert.ok(farPieces.length >= 7, `${farPieces.length} pieces start in the five far sectors`);
  assert.ok(nearPieces.length >= 1, 'the near-core pieces stay where they were');
});

test('on seed 4242 the live board at every far station lists its authored offers', () => {
  const a = boot();
  const b = boot();
  try {
    for (const station of FAR_STATIONS) {
      const boardA = a.missionsSys.ensureBoard(station.id);
      const boardB = b.missionsSys.ensureBoard(station.id);
      for (const def of piecesAt(station.id)) {
        const row = authoredSlot(boardA, def.id);
        assert.ok(row, `${def.id} is on the ${station.id} board`);
        assert.equal(row.stationId, station.id);
        assert.equal(row.type, AUTHORED_SET_PIECE_TYPE);
        assert.equal(row.source, AUTHORED_SET_PIECE_SOURCE);
        assert.deepEqual(row.params.completionMethods, [...def.methods]);
        assert.equal(row.params.twistClauseId, def.twistClauseId);
        // The same seed posts the same job: the board is not a dice roll.
        const twin = authoredSlot(boardB, def.id);
        assert.ok(twin, `${def.id} posts again on a second seed-4242 world`);
        assert.deepEqual(offerShape(twin), offerShape(row), `${def.id} is deterministic on seed 4242`);
        // And the board row is the catalog's own offer for that piece.
        const built = buildAuthoredSetPieceOffer(def, row.epochPosted);
        assert.equal(row.stageId, built.stageId);
        assert.equal(row.reward_cr, built.reward_cr);
        assert.equal(row.params.encounterId, built.params.encounterId);
      }
    }
  } finally {
    a.sim.dispose();
    b.sim.dispose();
  }
});

test('every authored piece ends in a follow-on contract', () => {
  const missing = [];
  for (const def of AUTHORED_SET_PIECES) {
    const offer = setPieceFollowOnOffer(def.id, {
      id: `m-${def.id}`,
      type: AUTHORED_SET_PIECE_TYPE,
      destStationId: def.destStationId,
      destSectorId: def.destSectorId,
      params: { authoredSetPieceId: def.id },
    }, 1);
    if (!offer) {
      missing.push(def.id);
      continue;
    }
    assert.equal(offer.source, SET_PIECE_FOLLOW_ON_SOURCE);
    assert.equal(offer.stationId, def.destStationId, `${def.id} follows at the station it was worked`);
  }
  assert.deepEqual(missing, [], 'a piece with no follow-on is a job that ends in silence');
});

test('a far-station offer round-trips the real save envelope, and a job saved mid-run still finishes into its follow-on', () => {
  const h = boot();
  let b = null;
  try {
    const farPieces = FAR_STATIONS.flatMap((station) => piecesAt(station.id));
    assert.ok(farPieces.length >= 7);
    for (const station of FAR_STATIONS) h.missionsSys.ensureBoard(station.id);

    // Accept one far-station job (the Drift Market gate) so the envelope carries a live
    // contract beside the unaccepted board rows.
    const live = AUTHORED_SET_PIECES.find((row) => row.id === 'toll_gate_ram');
    assert.equal(live.startStationId, 'station_drift');
    const offer = authoredSlot(h.state.missions.boards[live.startStationId], live.id);
    assert.ok(offer, 'the gate job is posted at Drift Market');
    offer.collateral_cr = 0;
    assert.equal(h.missionsSys.acceptMission(offer.id), true, 'the gate job accepts');
    const accepted = h.state.missions.active.find((row) => (
      row && row.params && row.params.authoredSetPieceId === live.id
    ));
    assert.ok(accepted && accepted.status === 'active');

    // The REAL envelope: serialize, stringify, validate checksum + migrations + normalization.
    const saveA = makeSaveHarness(h.sim);
    const envelope = saveA.serialize('quick');
    const raw = JSON.stringify(envelope);
    const prepared = saveA._prepareEnvelopeString(raw);
    assert.equal(prepared.ok, true, `the envelope validates (${prepared.reason || 'ok'})`);
    assert.ok(prepared.data && prepared.data.missions, 'the missions slice is on the envelope');

    // Restore into a fresh seed-4242 world at the same moment.
    b = boot();
    b.state.simTime = h.state.simTime;
    b.state.tick = h.state.tick;
    const saveB = makeSaveHarness(b.sim);
    saveB._restoreMissions(JSON.parse(JSON.stringify(prepared.data.missions)));

    for (const def of farPieces) {
      if (def.id === live.id) continue; // accepted: it left the board for the active list
      const before = authoredSlot(h.state.missions.boards[def.startStationId], def.id);
      const after = authoredSlot(b.state.missions.boards[def.startStationId], def.id);
      assert.ok(before, `${def.id} was on the saved board`);
      assert.ok(after, `${def.id} survives the envelope on the ${def.startStationId} board`);
      assert.deepEqual(offerShape(after), offerShape(before), `${def.id} comes back identical`);
      assert.equal(after.stationId, def.startStationId);
    }

    const restored = b.state.missions.active.find((row) => row && row.id === accepted.id);
    assert.ok(restored, 'the accepted far-station job survives the envelope');
    assert.equal(restored.type, AUTHORED_SET_PIECE_TYPE);
    assert.equal(restored.status, 'active');
    assert.equal(restored.params.authoredSetPieceId, live.id);
    assert.deepEqual(restored.params.completionMethods, [...live.methods]);
    assert.equal(restored.params.twistClauseId, live.twistClauseId);
    assert.equal(restored.params.encounterId, live.encounterId);

    // Finish the restored job through the real completion path: its follow-on boards.
    const index = b.state.missions.active.indexOf(restored);
    assert.equal(b.missionsSys._completePhysical(restored, index, live.methods[0]), true);
    const next = ((b.missionsSys.ensureBoard(live.destStationId).slots) || []).find((row) => (
      row && row.source === SET_PIECE_FOLLOW_ON_SOURCE && row.params && row.params.fromSetPieceId === live.id
    ));
    assert.ok(next, 'the restored job still ends in a consequence at Drift Market');
    assert.equal(next.stationId, 'station_drift');
    assert.equal(b.failed.length, 0, 'restoring and finishing fails nothing');
  } finally {
    h.sim.dispose();
    if (b) b.sim.dispose();
  }
});
