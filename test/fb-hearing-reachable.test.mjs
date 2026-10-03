// FB-041 — a promoted loss investigation reaches the authored `hearing` set piece.
//
// Contract under test (build_map row 247 law seam):
//   * `lossInvestigation:promoted` offers the authored `hearing` chain bound to the promoted
//     communicator's loss id — through the ordinary `mission:offered` adoption seam, so
//     missions stays the only mission writer (no parallel offer pipeline).
//   * exactly one loss-bound hearing per promotion, deterministic per loss on seed 4242.
//   * the loss rides the chain (`cause.lossId`/`cause.lossLabel`) into every stage receipt, so
//     the verdict names the real loss.
//   * the chain's terminal `mission:setPieceTransition` closes the loss entry.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { lossInvestigation } from '../src/systems/lossInvestigation.js';
import { missions } from '../src/systems/missions.js';
import { SET_PIECE_MISSION_SOURCE } from '../src/systems/setPieceMissionOffers.js';

const SEED = 4242;
const SECTOR = 'sector_vesta_forge';
const BOARD = 'station_forge';
const SECOND_SECTOR = 'sector_io_reach';

function boot(seed = SEED) {
  const sim = createSimulation({ seed, systems: [lossLedger, lossInvestigation, missions], updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.credits = 500000;
  state.world.currentSectorId = SECTOR;
  state.world.sectors[SECTOR] = { id: SECTOR, name: 'Vesta Forge', owner: 'faction_mts' };
  state.world.sectors[SECOND_SECTOR] = { id: SECOND_SECTOR, name: 'Io Reach', owner: 'faction_reach' };
  // The hearing's stages are faction contracts; give standing so the accept preflight is honest.
  state.factions.faction_dmc = { rep: 100 };
  state.factions.faction_choir = { rep: 100 };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const events = { offered: [], transitions: [], closed: [], completed: [] };
  bus.on('mission:offered', (p) => events.offered.push(structuredClone(p)));
  bus.on('mission:setPieceTransition', (p) => events.transitions.push(structuredClone(p)));
  bus.on('lossInvestigation:closed', (p) => events.closed.push(structuredClone(p)));
  bus.on('mission:completed', (p) => events.completed.push(structuredClone(p)));
  return { sim, state, bus, player, events, missionsSys: sim.registry.get('missions') };
}

function recordLoss(h, sectorId = SECTOR, assetId = 'hauler_7') {
  h.bus.emit('automation:assetLost', { kind: 'trader', id: assetId, value: 400, sectorId });
  const loss = (h.state.lossLedger.entries || []).find((entry) => (
    entry && entry.sectorId === sectorId && entry.assetId === assetId
  ));
  assert.ok(loss && loss.lossId, 'the ledger records the loss the hearing will name');
  return loss;
}

function placePoints(h, sectorId = SECTOR, count = 3) {
  if (!h.state.salvage || typeof h.state.salvage !== 'object') h.state.salvage = { points: [] };
  h.state.salvage.points = (h.state.salvage.points || []).concat(
    Array.from({ length: count }, (_, i) => ({
      id: `sp_${sectorId}_${i}`,
      sectorId,
      zoneId: `${sectorId}:z1`,
      pos: { x: 120 * i, z: 60 },
      entityId: null,
      offered: false,
    })),
  );
}

function hearingOffers(h) {
  return h.events.offered.filter((offer) => (
    offer && offer.source === SET_PIECE_MISSION_SOURCE
    && offer.cause && offer.cause.archetypeId === 'hearing'
  ));
}

function boundTo(h, lossId) {
  return hearingOffers(h).filter((offer) => offer.cause.lossId === lossId);
}

test('promotion offers exactly one loss-bound hearing and the authored board adopts it', () => {
  const h = boot();
  const loss = recordLoss(h);
  placePoints(h);
  h.bus.emit('salvage:placed', { sectorId: SECTOR });

  const promoted = h.state.lossInvestigation.promotedBySector[SECTOR];
  assert.ok(promoted && promoted.lossId === loss.lossId, 'the real loss promoted a communicator');

  const bound = boundTo(h, loss.lossId);
  assert.equal(bound.length, 1, 'exactly one hearing offer per promotion');
  const offer = bound[0];
  assert.equal(offer.stationId, BOARD, 'the offer posts at the authored start station');
  assert.equal(offer.cause.lossId, loss.lossId, 'the hearing is bound to the promoted loss id');
  assert.equal(offer.lossInvestigation.lossId, loss.lossId);
  assert.ok(offer.cause.lossLabel, 'the cause carries the case label the verdict will name');
  assert.ok(/^sp1_hearing_\d+_/.test(offer.cause.chainId), 'the bound chain keeps the sp1 id shape');

  // The canonical mission board (single writer) adopted the emitted offer.
  const board = h.state.missions.boards[BOARD];
  assert.ok(board, 'station_forge board exists');
  const rows = (board.slots || []).filter((row) => (
    row && row.cause && row.cause.lossId === loss.lossId
  ));
  assert.equal(rows.length, 1, 'the loss-bound hearing sits on the authored board once');

  // Re-promotion paths (duplicate promoted event, re-entry, re-place) mint nothing new.
  h.bus.emit('lossInvestigation:promoted', { ...promoted });
  h.bus.emit('sector:enter', { sectorId: SECTOR });
  h.bus.emit('salvage:placed', { sectorId: SECTOR });
  assert.equal(boundTo(h, loss.lossId).length, 1, 'one hearing per promotion, still');
  assert.equal(
    (h.state.missions.boards[BOARD].slots || []).filter((row) => (
      row && row.cause && row.cause.lossId === loss.lossId
    )).length,
    1,
    'the board still carries exactly one row for the loss',
  );
  h.sim.dispose();
});

test('each promoted loss binds its own hearing chain; uninvestigated losses get none', () => {
  const h = boot();
  const first = recordLoss(h, SECTOR, 'hauler_7');
  placePoints(h, SECTOR);
  h.bus.emit('salvage:placed', { sectorId: SECTOR });

  const second = recordLoss(h, SECOND_SECTOR, 'hauler_9');
  placePoints(h, SECOND_SECTOR);
  h.bus.emit('salvage:placed', { sectorId: SECOND_SECTOR });

  const all = hearingOffers(h);
  assert.equal(boundTo(h, first.lossId).length, 1);
  assert.equal(boundTo(h, second.lossId).length, 1);
  assert.notEqual(
    boundTo(h, first.lossId)[0].cause.chainId,
    boundTo(h, second.lossId).length && boundTo(h, second.lossId)[0].cause.chainId,
    'distinct losses mint distinct chains — no shared fingerprint collision',
  );

  // A recorded loss that never promoted offers nothing.
  h.bus.emit('automation:assetLost', { kind: 'fleet', id: 'patrol_3', value: 900, sectorId: 'sector_tethys_junction' });
  const unvisited = h.state.lossLedger.entries.find((entry) => entry && entry.assetId === 'patrol_3');
  assert.ok(unvisited, 'the third loss exists in the ledger');
  assert.equal(boundTo(h, unvisited.lossId).length, 0, 'no hearing without an investigation');
  h.sim.dispose();
});

test('completing the loss-bound hearing chain names the loss and closes the loss entry', () => {
  const h = boot();
  const loss = recordLoss(h);
  placePoints(h);
  h.bus.emit('salvage:placed', { sectorId: SECTOR });

  const offer = boundTo(h, loss.lossId)[0];
  assert.ok(h.missionsSys.acceptMission(offer.id), 'the loss-bound hearing accepts through the owner');
  let mission = h.state.missions.active.find((row) => row && row.cause && row.cause.lossId === loss.lossId);
  assert.ok(mission, 'the live chain carries the case');
  assert.equal(mission.cause.lossId, loss.lossId);

  // Drive the real owner settle seam stage by stage: compile + board is exactly what
  // _completeMission calls for set-piece chains — receipts, follow-on offers, and the
  // mission:setPieceTransition event are the genuine artifacts, only the physics terms
  // (dock/scan/kill) are asserted elsewhere.
  let lastTransition = null;
  for (let guard = 0; mission && guard < 12; guard++) {
    const transition = h.missionsSys._compileSetPieceTransition(mission, 'completed');
    assert.ok(transition && transition.receipt, 'each settled stage produces a house receipt');
    lastTransition = transition;
    h.missionsSys._boardSetPieceTransition(mission, transition);
    const idx = h.state.missions.active.findIndex((row) => row && row.id === mission.id);
    if (idx >= 0) h.state.missions.active.splice(idx, 1); // retire the settled instance
    mission = null;
    if (transition.status === 'completed') break;
    const row = h.state.lossInvestigation.hearingByLoss[loss.lossId];
    assert.equal(row.closed, false, 'intermediate stages leave the loss entry open');
    const next = (transition.offers || [])[0];
    assert.ok(next && next.cause && next.cause.lossId === loss.lossId,
      'provenance rides the follow-on stage offer');
    assert.ok(h.missionsSys.acceptMission(next.id), `stage ${next.cause.stageIndex} accepts`);
    mission = h.state.missions.active.find((row) => (
      row && row.cause && row.cause.chainId === next.cause.chainId
    ));
    assert.ok(mission, 'the follow-on stage is live');
  }
  assert.ok(lastTransition && lastTransition.status === 'completed', 'the chain reached its verdict');
  assert.equal(lastTransition.receipt.outcome, 'completed');

  // The verdict names the real loss — structured provenance plus the spoken receipt line.
  assert.equal(lastTransition.receipt.lossId, loss.lossId, 'the receipt carries the loss id');
  assert.match(lastTransition.receipt.houseText, /the file names/i);
  assert.match(lastTransition.receipt.houseText, /hauler_7/, 'the verdict names the real loss');
  const terminal = h.events.transitions.filter((p) => p.status === 'completed');
  assert.equal(terminal.length, 1, 'one terminal transition for the bound chain');
  assert.match(terminal[0].houseText, /hauler_7/);

  // Closure: the investigation row, the promoted record, and the ledger entry all read closed.
  const row = h.state.lossInvestigation.hearingByLoss[loss.lossId];
  assert.equal(row.closed, true, 'terminal hearing transition closes the loss entry');
  assert.equal(row.outcome, 'completed');
  assert.ok(row.missionId, 'the closing verdict cites the settling mission');
  const rec = h.state.lossInvestigation.promotedBySector[SECTOR];
  assert.equal(rec.closed, true);
  assert.equal(rec.hearingChainId, row.chainId);
  const entry = h.state.lossLedger.entries.find((e) => e && e.lossId === loss.lossId);
  assert.equal(entry.hearingResolution && entry.hearingResolution.outcome, 'completed',
    'the ledger loss entry carries its verdict');
  assert.equal(h.events.closed.length, 1, 'lossInvestigation:closed fired exactly once');
  assert.equal(h.events.closed[0].lossId, loss.lossId);
  h.sim.dispose();
});
