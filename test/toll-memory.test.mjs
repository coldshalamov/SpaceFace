// Toll crews remember (INF-U20, WF-09): a paid crew halves the next demand
// from the same faction, two consecutive pays wave the third stop through,
// and a run prices the next demand up. Paying clears the grudge; memory is
// per faction and expires.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { hash32 } from '../src/core/rng.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { pirateParley } from '../src/systems/pirateParley.js';
import { COMMODITIES } from '../src/data/commodities.js';

const SEED = 4701;
const VALUE = new Map(COMMODITIES.map((c) => [c.id, Number(c.basePrice) || 1]));

function stepSeconds(sim, seconds) {
  sim.runTicks(Math.max(1, Math.ceil(seconds / SIM_DT)));
}

// Squad ids whose priced demand is credits (mirrors chooseDemand's coin flip),
// so sequential stops price identically and memory is the only variable.
function creditSquadIds(seed, n) {
  const out = [];
  for (let i = 0; out.length < n && i < 2000; i++) {
    const id = `sq_mem_${i}`;
    if ((hash32(seed, id, 'demand_kind') & 1) === 0) out.push(id);
  }
  assert.ok(out.length >= n, 'enough credit-turn squad ids');
  return out;
}

function boot({ cargoItems = { cmdty_refined_metals: 18 }, credits = 50000 } = {}) {
  const voices = [];
  const sim = createSimulation({
    seed: SEED,
    systems: [economy, cargo, pirateParley],
    helpers: { voice: { say(payload) { voices.push(structuredClone(payload)); return true; } } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  state.world.sectors.sector_tethys_junction = {
    id: 'sector_tethys_junction',
    factionId: 'faction_reach',
    security: 0.25,
  };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200 });
  state.playerId = player.id;
  state.player.cargo.items = { ...cargoItems };
  state.player.credits = credits;
  sim.registry.get('cargo').recompute();
  const events = [];
  bus.on('pirateParley:demand', (payload) => events.push({ type: 'demand', payload: structuredClone(payload) }));
  bus.on('pirateParley:resolved', (payload) => events.push({ type: 'resolved', payload: structuredClone(payload) }));
  bus.on('pirateParley:voice', (payload) => events.push({ type: 'voice', payload: structuredClone(payload) }));
  return { sim, state, bus, player, events, voices };
}

function spawnSquad(ctx, squadId, factionId = 'faction_reach') {
  return ctx.sim.spawn({
    type: 'ship',
    team: 1,
    factionId,
    pos: { x: 140, z: 0 },
    hull: 100,
    hullMax: 100,
    data: {
      ai: { doctrine: 'toll', squadId, archetype: 'pirate_raider', spawnContext: 'ambient' },
      intent: { fire: true, moveX: 0, moveZ: 0 },
      combat: { targetId: ctx.player.id },
    },
  });
}

function demandFor(ctx, squadId) {
  const rec = ctx.state.pirateParley.squads[squadId];
  assert.ok(rec, `squad ${squadId} has a record`);
  assert.equal(rec.phase, 'demand', `squad ${squadId} is demanding`);
  assert.equal(rec.demand.kind, 'credits', 'credit-turn squad ids price credits');
  return rec;
}

function comply(ctx, squadId) {
  ctx.bus.emit('pirateParley:choose', { squadId, choice: 'comply' });
  const rec = ctx.state.pirateParley.squads[squadId];
  assert.equal(rec.outcome, 'complied', `squad ${squadId} takes the pay`);
  return rec;
}

function demandVoice(ctx, squadId) {
  return ctx.events.find((e) => e.type === 'voice'
    && e.payload.squadId === squadId && e.payload.situation === 'demand-cargo');
}

test('the second stop from a paid crew is recognized at half price', () => {
  const [sqA, sqB] = creditSquadIds(SEED, 2);
  const ctx = boot();
  spawnSquad(ctx, sqA);
  stepSeconds(ctx.sim, 2.5);
  const first = demandFor(ctx, sqA);
  const full = first.demand.amount;
  assert.ok(full > 1, 'a real price to halve');
  comply(ctx, sqA);
  spawnSquad(ctx, sqB);
  stepSeconds(ctx.sim, 2.5);
  const second = demandFor(ctx, sqB);
  assert.equal(second.recognized, true, 'the crew knows a payer');
  assert.equal(second.demand.amount, Math.max(1, Math.round(full / 2)), 'half today');
  const voice = demandVoice(ctx, sqB);
  assert.ok(voice && String(voice.payload.text).includes('half today'), 'the demand says so');
  const demandEvent = ctx.events.find((e) => e.type === 'demand' && e.payload.squadId === sqB);
  assert.equal(demandEvent.payload.recognized, true);
});

test('two consecutive pays wave the third stop through', () => {
  const [sqA, sqB, sqC] = creditSquadIds(SEED, 3);
  const ctx = boot();
  spawnSquad(ctx, sqA);
  stepSeconds(ctx.sim, 2.5);
  comply(ctx, sqA);
  spawnSquad(ctx, sqB);
  stepSeconds(ctx.sim, 2.5);
  demandFor(ctx, sqB);
  comply(ctx, sqB);
  spawnSquad(ctx, sqC);
  stepSeconds(ctx.sim, 2.5);
  const rec = ctx.state.pirateParley.squads[sqC];
  assert.equal(rec.outcome, 'waived', 'the third stop is free');
  assert.equal(rec.resolved, true);
  assert.ok(!ctx.events.some((e) => e.type === 'demand' && e.payload.squadId === sqC), 'no price named');
  const resolved = ctx.events.find((e) => e.type === 'resolved' && e.payload.squadId === sqC);
  assert.equal(resolved.payload.waived, true);
  const voice = ctx.events.find((e) => e.type === 'voice'
    && e.payload.squadId === sqC && e.payload.situation === 'waived');
  assert.ok(voice && /move along/.test(String(voice.payload.text)), 'waved through out loud');
});

test('running prices the next demand up with interest', () => {
  const [sqA, sqB] = creditSquadIds(SEED, 2);
  const ctx = boot();
  spawnSquad(ctx, sqA);
  stepSeconds(ctx.sim, 2.5);
  const first = demandFor(ctx, sqA);
  const full = first.demand.amount;
  ctx.player.pos.x = 5000; // clear the lane before the deadline
  stepSeconds(ctx.sim, 1);
  assert.equal(ctx.state.pirateParley.squads[sqA].outcome, 'evaded');
  ctx.player.pos.x = 0;
  spawnSquad(ctx, sqB);
  stepSeconds(ctx.sim, 2.5);
  const second = demandFor(ctx, sqB);
  assert.equal(second.grudged, true, 'the crew remembers the run');
  assert.equal(second.demand.amount, Math.max(1, Math.round(full * 1.5)), 'plus interest');
  const voice = demandVoice(ctx, sqB);
  assert.ok(voice && String(voice.payload.text).includes('interest'), 'the demand says so');
});

test('paying clears the grudge: interest, then half, then the streak', () => {
  const [sqA, sqB, sqC] = creditSquadIds(SEED, 3);
  const ctx = boot();
  spawnSquad(ctx, sqA);
  stepSeconds(ctx.sim, 2.5);
  const full = demandFor(ctx, sqA).demand.amount;
  ctx.player.pos.x = 5000;
  stepSeconds(ctx.sim, 1);
  ctx.player.pos.x = 0;
  spawnSquad(ctx, sqB);
  stepSeconds(ctx.sim, 2.5);
  assert.equal(demandFor(ctx, sqB).grudged, true);
  comply(ctx, sqB);
  spawnSquad(ctx, sqC);
  stepSeconds(ctx.sim, 2.5);
  const third = demandFor(ctx, sqC);
  assert.equal(third.grudged || false, false, 'the pay cleared it');
  assert.equal(third.recognized, true, 'and opened a streak');
  assert.equal(third.demand.amount, Math.max(1, Math.round(full / 2)));
});

test('memory is per faction and expires', () => {
  const [sqA, sqB, sqC] = creditSquadIds(SEED, 3);
  const ctx = boot();
  spawnSquad(ctx, sqA, 'faction_reach');
  stepSeconds(ctx.sim, 2.5);
  comply(ctx, sqA);
  spawnSquad(ctx, sqB, 'faction_vael');
  stepSeconds(ctx.sim, 2.5);
  const foreign = demandFor(ctx, sqB);
  assert.equal(foreign.recognized || false, false, 'another crew never met you');
  ctx.state.simTime += 1300; // past the memory window
  spawnSquad(ctx, sqC, 'faction_reach');
  stepSeconds(ctx.sim, 2.5);
  const stale = demandFor(ctx, sqC);
  assert.equal(stale.recognized || false, false, 'old pays are forgotten');
  assert.equal(stale.grudged || false, false);
});

test('a dumped bribe counts as a pay', () => {
  const [sqA, sqB] = creditSquadIds(SEED, 2);
  const ctx = boot({ cargoItems: { cmdty_refined_metals: 60 } });
  spawnSquad(ctx, sqA);
  stepSeconds(ctx.sim, 2.5);
  const rec = demandFor(ctx, sqA);
  // Bribe the credit demand with just enough dumped goods: the hold must keep
  // value or the next crew finds no profitable target at all.
  const unit = VALUE.get('cmdty_refined_metals');
  const need = Math.ceil(rec.demand.amount / unit);
  const cargoSys = ctx.sim.registry.get('cargo');
  assert.equal(cargoSys.jettison('cmdty_refined_metals', need), need);
  assert.equal(rec.outcome, 'complied', 'the dump covers a credit toll');
  assert.equal(rec.choice, 'bribe');
  spawnSquad(ctx, sqB);
  stepSeconds(ctx.sim, 2.5);
  // The hold is empty after the dump, so the second stop prices cargo — the
  // ledger stamp is what this test owns, not the credit arithmetic.
  const second = ctx.state.pirateParley.squads[sqB];
  assert.equal(second.phase, 'demand');
  assert.equal(second.recognized, true, 'the bribe stamps the ledger too');
  const voice = demandVoice(ctx, sqB);
  assert.ok(voice && String(voice.payload.text).includes('half today'));
});
