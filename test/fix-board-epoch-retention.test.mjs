/**
 * Epoch rebuild (every refreshSec) must carry one-shot contract classes forward: Lost Coils
 * (`uniqueWreck`), aftermath remedies (`encounterAftermath`), `blackFlag` jobs, the Book-4
 * DOUBLED interdiction row, and every ghost-convoy lane row — plus Quiet Passage's durable
 * completion latch. Ordinary procedural churn must still roll over.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { QUIET_PASSAGE } from '../src/data/heatLure.js';

const STATION = 'station_tethys';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [missions] });
  const { state } = sim;
  state.mode = 'flight';
  state.simTime = 100;
  state.onboarding = { active: false, finished: true };
  return { sim, state, desk: sim.registry.get('missions') };
}

const row = (id, extra) => ({
  id, type: 'recon_scan', stationId: STATION, factionId: 'faction_scn', destSectorId: 'sector_phoebe_echo',
  params: {}, reward_cr: 100, collateral_cr: 0, riskTier: 1, minRep: -1000, distance: 100, ...extra,
});

test('epoch rebuild keeps uniqueWreck, aftermath, blackFlag, doubled and every ghost-convoy row', () => {
  const { sim, state, desk } = boot();
  try {
    const board = desk.ensureBoard(STATION);
    const keep = [
      row('unique-wreck:the-lost-coils:v1', { source: 'uniqueWreck', storyTag: 'mission.the_lost_coils' }),
      row('aftermath_1', { source: 'encounterAftermath' }),
      row('blackflag_1', { source: 'blackFlag' }),
      row('ghost_a', { source: 'ghostConvoyRumor' }),
      row('ghost_b', { source: 'ghostConvoyRumor' }),
    ];
    board.slots.push(...keep);
    const churn = board.slots.filter((o) => !keep.includes(o) && !o.source).map((o) => o.id);
    state.simTime += state.missions.config.refreshSec;
    const next = desk.ensureBoard(STATION);
    assert.notEqual(next, board, 'rebuild produced a new board');
    for (const o of keep) {
      assert.ok(next.slots.some((s) => s.id === o.id), `${o.id} survives the epoch rebuild`);
    }
    // Ordinary churn still rolls: at least one generated id from the old epoch is gone.
    if (churn.length) {
      assert.ok(churn.some((id) => !next.slots.some((s) => s.id === id)), 'procedural rows still churn');
    }
    assert.equal(next.slots.filter((o) => o.source === 'ghostConvoyRumor').length, 2);
  } finally { sim.dispose(); }
});

test('epoch rebuild keeps the live Book-4 DOUBLED row and drops it once the book closes', () => {
  const { sim, state, desk } = boot();
  try {
    state.story.beatIndex = 4;
    const board = desk.ensureBoard(STATION);
    const doubled = row('mo_47a_b4_doubled_x_0', { source: 'campaign47a', storyTag: 'campaign47a:b4:doubled' });
    board.slots.push(doubled);
    state.simTime += state.missions.config.refreshSec;
    const next = desk.ensureBoard(STATION);
    assert.ok(next.slots.some((s) => s.id === doubled.id), 'DOUBLED row retained through rebuild');
    // Book closes: the strip pass removes the stranded row.
    state.story.beatIndex = 5;
    desk._syncDoubledInterdictionOffer();
    assert.ok(!next.slots.some((s) => s.storyTag === 'campaign47a:b4:doubled'));
  } finally { sim.dispose(); }
});

test('Quiet Passage completion latches the durable story flag before the receipt ring evicts it', () => {
  const { sim, state, desk } = boot();
  try {
    const first = desk.ensureBoard(QUIET_PASSAGE.stationId);
    assert.ok(first.slots.some((o) => o.id === QUIET_PASSAGE.id), 'posts before completion');
    first.slots = first.slots.filter((o) => o.id !== QUIET_PASSAGE.id);
    state.missions.receipts = [{ missionId: QUIET_PASSAGE.id, outcome: 'completed',
      source: QUIET_PASSAGE.source, sourceOfferId: QUIET_PASSAGE.id }];
    state.simTime += state.missions.config.refreshSec;
    desk.ensureBoard(QUIET_PASSAGE.stationId);
    assert.equal(state.story.flags[QUIET_PASSAGE.id], true, 'latched while the receipt exists');
    // Ten later settlements push the receipt out of the ring.
    state.missions.receipts = [];
    state.simTime += state.missions.config.refreshSec;
    const later = desk.ensureBoard(QUIET_PASSAGE.stationId);
    assert.ok(!later.slots.some((o) => o.id === QUIET_PASSAGE.id), 'never reposts after eviction');
  } finally { sim.dispose(); }
});

test('Quiet Passage latch fires from any desk read, not only a Tethys visit', () => {
  const { sim, state, desk } = boot();
  try {
    const otherStation = 'station_helios';
    assert.notEqual(otherStation, QUIET_PASSAGE.stationId);
    state.missions.receipts = [{ missionId: QUIET_PASSAGE.id, outcome: 'completed',
      source: QUIET_PASSAGE.source, sourceOfferId: QUIET_PASSAGE.id }];
    desk.ensureBoard(otherStation);
    assert.equal(state.story.flags[QUIET_PASSAGE.id], true, 'a dock elsewhere latches the completion');
    state.missions.receipts = [];
    const home = desk.ensureBoard(QUIET_PASSAGE.stationId);
    assert.ok(!home.slots.some((o) => o.id === QUIET_PASSAGE.id), 'Tethys never reposts the settled run');
  } finally { sim.dispose(); }
});
