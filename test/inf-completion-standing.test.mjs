/**
 * inf-completion-standing — a completed job's standing move is named in the completion moment.
 *
 * Handing in a job used to count only the credits: "Mission complete: <title> +520 cr." The
 * world's actual answer — the standing the job moved with the offering faction — rode the same
 * tick invisibly, and the player connected a later rep screen to the job by guesswork. Now
 * factions' own applied receipt (`faction:repChanged`, reason 'complete_faction_mission') is
 * read back into the completion toast and the client's debrief note: `· +15 MERIDIAN standing`.
 * factions stays the sole rep writer; no receipt, nothing claimed.
 *
 * Owners = src/systems/missions.js (capture + composition) + src/systems/factions.js (the
 * canonical writer, unchanged). Seed 4242.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { missions } from '../src/systems/missions.js';
import { factions } from '../src/systems/factions.js';

function stubBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
      return () => {};
    },
    off() {},
    emit(name, payload) {
      for (const fn of [...(handlers.get(name) || [])]) fn(payload);
    },
  };
}

function stubState(tick = 60) {
  return {
    meta: { seed: 4242 },
    simTime: 100,
    tick,
    playerId: 1,
    entities: new Map(),
    player: {
      credits: 5000,
      cargo: { capVolume: 40, usedVolume: 0, items: {} },
      stats: {},
      researchPoints: 0,
      heat: 0,
    },
    ui: {},
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null },
    factions: {},
    world: {
      currentSectorId: 'sector_ceres_belt',
      activeSector: { id: 'sector_ceres_belt', stations: [] },
      sectors: {},
    },
    sectorSim: { sectors: {}, field: { nodes: {} } },
    rng: () => 0.5,
  };
}

const haul = { id: 'haul-4242', factionId: 'faction_mts', title: 'Crates for Tethys' };

test('the completion capture reads factions back: a real applied move names itself', () => {
  const bus = stubBus();
  const state = stubState();
  const system = { ...missions };
  system.init({ state, bus, helpers: { voice: { say() { return false; } } }, registry: { get: () => null } });
  // The canonical writer is in the loop: its mission-completion handler derives and applies rep.
  const fac = { ...factions };
  fac.init({ state, bus, helpers: {}, registry: { get: () => null } });

  bus.emit('mission:completed', { missionId: haul.id, type: 'cargo_delivery', factionId: haul.factionId, repMult: 1 });

  const applied = system._takeCompletionRepApplied(haul);
  assert.ok(applied, 'the completion receipt proves the move');
  assert.equal(applied.delta, 15, 'factions applied its own canonical 15*repMult');
  assert.equal(applied.label, 'MERIDIAN', 'the label is the offering faction');
  assert.equal(state.factions[haul.factionId].rep, 15, 'the book actually moved');

  assert.equal(system._completionStandingSuffix(applied), ' · +15 MERIDIAN standing');
  // Consumed: a second read (a second contract the same tick) claims nothing.
  assert.equal(system._takeCompletionRepApplied(haul), null);
});

test('no receipt, no claim: repMult 0, wrong faction, and stale ticks all stay silent', () => {
  const bus = stubBus();
  const state = stubState();
  const system = { ...missions };
  system.init({ state, bus, helpers: { voice: { say() { return false; } } }, registry: { get: () => null } });
  const fac = { ...factions };
  fac.init({ state, bus, helpers: {}, registry: { get: () => null } });

  // A story contract with repMult 0: factions applies nothing, nothing is named.
  bus.emit('mission:completed', { missionId: 'story-1', type: 'story', factionId: null, repMult: 0 });
  assert.equal(system._takeCompletionRepApplied({ id: 'story-1', factionId: null }), null);

  // A real move for a DIFFERENT faction does not speak for this contract.
  bus.emit('mission:completed', { missionId: 'other', type: 'cargo_delivery', factionId: 'faction_scn', repMult: 1 });
  assert.equal(system._takeCompletionRepApplied({ id: 'haul-x', factionId: 'faction_mts' }), null,
    'Concord\u2019s move never rides a Meridian contract\u2019s line');

  // A stale receipt (the player earned it last tick) is not this job's answer.
  bus.emit('mission:completed', { missionId: haul.id, type: 'cargo_delivery', factionId: haul.factionId, repMult: 1 });
  state.tick += 1;
  assert.equal(system._takeCompletionRepApplied({ ...haul }), null, 'a last-tick move is not this completion');

  // Zero and negative deltas never compose a standing clause.
  assert.equal(system._completionStandingSuffix(null), '');
  assert.equal(system._completionStandingSuffix({ delta: 0, label: 'MERIDIAN' }), '');
});

test('diminishing and the run seal are honored because the receipt is factions\u2019 own number', () => {
  const bus = stubBus();
  const state = stubState();
  const system = { ...missions };
  system.init({ state, bus, helpers: { voice: { say() { return false; } } }, registry: { get: () => null } });
  const fac = { ...factions };
  fac.init({ state, bus, helpers: {}, registry: { get: () => null } });

  // Push the book past the diminishing knee: the next gain applies softened, and the toast
  // names the softened number because it reads the receipt, never the formula.
  state.factions[haul.factionId] = { rep: 400 };
  bus.emit('mission:completed', { missionId: haul.id, type: 'cargo_delivery', factionId: haul.factionId, repMult: 1 });
  const applied = system._takeCompletionRepApplied(haul);
  assert.ok(applied && applied.delta > 0 && applied.delta < 15, `diminishing read honestly (delta ${applied && applied.delta})`);
  assert.match(system._completionStandingSuffix(applied), /\+\d+ MERIDIAN standing/);
});

test('the client\u2019s own note names the standing move; no move, no sentence', () => {
  const bus = stubBus();
  const state = stubState();
  const system = { ...missions };
  system.init({ state, bus, helpers: { voice: { say() { return false; } } }, registry: { get: () => null } });

  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const m = { ...haul, status: 'active', type: 'cargo_delivery', reward_cr: 520, params: { qty: 4 } };

  system._emitMissionDebrief(m, 'completed', null, {
    rewardCr: 520,
    standingApplied: { delta: 15, label: 'MERIDIAN' },
  });
  assert.equal(popups.length, 1);
  assert.match(popups[0].note, /\+15 MERIDIAN standing\./, 'the payer says the house book moved');
  assert.match(popups[0].note, /Paid 520 cr\./, 'the shipped payday line stays intact');

  // The shipped plain note keeps its byte-for-byte shape when no move applied.
  system._emitMissionDebrief(m, 'completed', null, { rewardCr: 520 });
  assert.equal(popups[1].note, 'Paid 520 cr.');
});
