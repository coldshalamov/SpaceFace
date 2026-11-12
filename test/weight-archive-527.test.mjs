// weight-archive-527 — W-ARCHIVE (build_map §34.5 row 527, bible 02 §12).
//
// Proves the row's done-when on the real data and the runtime owner:
//   data/factions/archive.js   the Redaction table, page drones, the reading-room spec,
//                              the Index Head, censor roster
//   systems/faction_archive.js the censor pulses engines+HUD dark; swinging clear of the
//                              radius lifts it early (E-29); page drones copy logs into
//                              trade-good records; the Index Head reads provenance
//
// Run: node --test test/weight-archive-527.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  archiveRedaction,
  ensureArchiveState,
  isRedacted,
  redactionBlackout,
} from '../src/systems/faction_archive.js';
import faction, {
  ARCHIVE_REDACTION,
  ARCHIVE_PAGE_DRONES,
  ARCHIVE_READING_ROOM,
  ARCHIVE_INDEX_HEAD,
} from '../src/data/factions/archive.js';

const SEED = 4242;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [archiveRedaction] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pallas_drift';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: {},
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

const censor = (sim, x, z) => sim.spawn({
  type: 'ship', team: 1, factionId: 'faction_archive',
  pos: { x, z }, radius: 20, mass: 80, hull: 500, hullMax: 500, collides: true,
  data: { censorFrigate: true, role: 'censor-frigate', name: 'Censor Frigate' },
});

test('data: redaction is engines+HUD dark, never destroy; roster and reading room', () => {
  assert.equal(ARCHIVE_REDACTION.enginesDark, true, 'engines go dark');
  assert.equal(ARCHIVE_REDACTION.hudDark, true, 'the HUD goes dark');
  assert.ok(ARCHIVE_REDACTION.durationS > 0 && ARCHIVE_REDACTION.pulseRadius > 0);
  assert.equal(faction.custom.neverDestroysOnlyRedacts, true, 'they never destroy');
  assert.ok(faction.shipRoles.some((r) => r.role === 'censor-frigate'));
  assert.ok(faction.shipRoles.some((r) => r.role === 'page-drone'));
  assert.equal(ARCHIVE_READING_ROOM.baseStationKind, 'station_research');
  assert.ok(ARCHIVE_READING_ROOM.services.includes('secret_trade'));
  assert.equal(ARCHIVE_INDEX_HEAD.id, 'head_index');
});

test('Redaction (E-29): the censor blacks out engines and HUD, escape by swinging', () => {
  const { sim, state, bus, player } = boot();
  try {
    const c = censor(sim, ARCHIVE_REDACTION.pulseRadius - 200, 0);
    const pulses = [];
    bus.on('archive:redacted', (p) => pulses.push(p));
    sim.step();
    assert.equal(pulses.length, 1, 'the pulse landed inside the field');
    assert.equal(isRedacted(state), true);
    const dark = redactionBlackout(state);
    assert.equal(dark.enginesDark, true, 'your engines are dark');
    assert.equal(dark.hudDark, true, 'your HUD is dark');
    assert.equal(player.data.redacted, true, 'the hull reads redacted');

    // Outside the censor's own field but still inside duration: a second pulse waits.
    const until = ensureArchiveState(state).redaction.untilSimTime;
    sim.runTicks(60);
    assert.equal(isRedacted(state), true, 'the dark holds inside its duration');

    // Swing out: past the field radius + bonus, the redaction lifts early.
    player.pos.x = c.pos.x + ARCHIVE_REDACTION.pulseRadius + ARCHIVE_REDACTION.escapeRadiusBonus + 50;
    sim.step();
    assert.equal(isRedacted(state), false, 'you swung out of the dark early');
    assert.equal(player.data.redacted, false);
    assert.ok(state.simTime < until, 'the escape beat the clock');

    // Ride the clock out instead: back inside the field, the censor re-pulses on its beat.
    player.pos.x = 0;
    sim.runTicks(Math.ceil(ARCHIVE_REDACTION.pulsePeriodS * 60) + 2);
    assert.equal(isRedacted(state), true, 'back inside, the censor re-pulses on its beat');
    // The dark cannot outlive its censor.
    c.alive = false;
    sim.step();
    assert.equal(isRedacted(state), false, 'a dead censor cannot hold the dark');
  } finally {
    sim.dispose();
  }
});

test('a censor never redacts what it cannot reach — standoff keeps you lit', () => {
  const { sim, state, player } = boot();
  try {
    censor(sim, ARCHIVE_REDACTION.pulseRadius + 400, 0);
    player.pos.x = -100;
    sim.runTicks(Math.ceil(ARCHIVE_REDACTION.pulsePeriodS * 60) + 30);
    assert.equal(isRedacted(state), false, 'outside the field, no pulse lands');
  } finally {
    sim.dispose();
  }
});

test('page drones close in, copy your logs, and the copies become trade goods', () => {
  const { sim, state, player } = boot();
  try {
    const drone = sim.spawn({
      type: 'drone', team: 1, factionId: 'faction_archive',
      pos: { x: player.pos.x + 300, z: player.pos.z }, radius: 5, mass: 2,
      hull: 10, hullMax: 10, collides: true, data: { pageDrone: true },
    });
    // Approach leg.
    sim.runTicks(Math.ceil(200 / ARCHIVE_PAGE_DRONES.approachSpeed * 60) + 30);
    const d = Math.hypot(drone.pos.x - player.pos.x, drone.pos.z - player.pos.z);
    assert.ok(d <= ARCHIVE_PAGE_DRONES.copyRange + 10, `the drone held at ${d.toFixed(0)}`);
    // Copy leg.
    sim.runTicks(Math.ceil(ARCHIVE_PAGE_DRONES.copyTimeS * 60) + 2);
    const a = ensureArchiveState(state);
    assert.equal(a.copiedLogs.length, 1, 'one page copied');
    assert.equal(a.copiedLogs[0].tradeGoodId, ARCHIVE_PAGE_DRONES.copiedTradeGoodId,
      'your secrets are now trade goods');
    assert.equal(a.droneCopies, 1);
    // It takes a second page, then departs.
    sim.runTicks(Math.ceil(ARCHIVE_PAGE_DRONES.copyTimeS * 60) + 2);
    assert.equal(a.droneCopies, 2);
    assert.equal(drone.data.departing, true, 'a full drone leaves');
  } finally {
    sim.dispose();
  }
});

test('Index Head: hold the Line and the object reads its whole provenance', () => {
  const { sim, state, bus, player } = boot();
  try {
    player.data = { ...(player.data || {}), lineHeadId: ARCHIVE_INDEX_HEAD.id };
    const relic = sim.spawn({
      type: 'payload', team: 0, pos: { x: 40, z: 0 }, radius: 6, mass: 12,
      hull: 10, hullMax: 10, collides: true,
      data: { name: 'Sealed Folio', provenance: { owners: ['faction_archive', 'npc_brother_index'], summary: 'Sealed record' } },
    });
    state.player.tether = { active: true, targetId: relic.id };
    const reads = [];
    bus.on('archive:indexRead', (p) => reads.push(p));
    sim.runTicks(Math.ceil(ARCHIVE_INDEX_HEAD.scanTimeS * 60) + 2);
    assert.equal(reads.length, 1, 'the scan resolved on the held object');
    const rec = reads[0].record;
    assert.equal(rec.entityId, relic.id);
    assert.deepEqual(rec.owners.sort(), ['faction_archive', 'npc_brother_index'].sort());
    assert.equal(rec.mass, 12, 'the mass record reads true');
    assert.equal(rec.provenance, 'Sealed record');
  } finally {
    sim.dispose();
  }
});
