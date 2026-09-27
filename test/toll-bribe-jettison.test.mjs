import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { pirateParley } from '../src/systems/pirateParley.js';
import { COMMODITIES } from '../src/data/commodities.js';

const VALUE = new Map(COMMODITIES.map((c) => [c.id, Number(c.basePrice) || 1]));

function stepSeconds(sim, seconds) {
  sim.runTicks(Math.max(1, Math.ceil(seconds / SIM_DT)));
}

function bootBribe({ cargoItems = { cmdty_refined_metals: 18 }, seed = 4701, pirates = 1 } = {}) {
  const voices = [];
  const sim = createSimulation({
    seed,
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
  sim.registry.get('cargo').recompute();
  const crew = [];
  for (let i = 0; i < pirates; i += 1) {
    crew.push(sim.spawn({
      type: 'ship',
      team: 1,
      factionId: 'faction_reach',
      pos: { x: i === 0 ? 140 : -140, z: 0 },
      hull: 100,
      hullMax: 100,
      data: {
        ai: {
          doctrine: 'toll',
          squadId: i === 0 ? 'sq_toll_bribe' : 'sq_toll_bribe_b',
          archetype: 'pirate_raider',
          spawnContext: 'ambient',
        },
        intent: { fire: true, moveX: 0, moveZ: 0 },
        combat: { targetId: player.id },
      },
    }));
  }
  const events = [];
  bus.on('pirateParley:demand', (payload) => events.push({ type: 'demand', payload: structuredClone(payload) }));
  bus.on('pirateParley:resolved', (payload) => events.push({ type: 'resolved', payload: structuredClone(payload) }));
  bus.on('pirateParley:voice', (payload) => events.push({ type: 'voice', payload: structuredClone(payload) }));
  return { sim, state, bus, player, pirate: crew[0], crew, events, voices };
}

function demandRec(ctx, squadId = 'sq_toll_bribe') {
  return ctx.state.pirateParley.squads[squadId];
}

function outstandingOf(rec) {
  if (rec.demand && rec.demand.kind === 'credits') return Math.max(0, Math.floor(Number(rec.demand.amount) || 0));
  const qty = Math.max(0, Math.floor(Number(rec.tithe.qty) || 0));
  return qty * (VALUE.get(rec.tithe.commodityId) || 1);
}

test('dumping enough value during demand bribes the toll without braking', () => {
  const ctx = bootBribe();
  stepSeconds(ctx.sim, 2.5);
  const rec = demandRec(ctx);
  assert.equal(rec.phase, 'demand');
  const outstanding = outstandingOf(rec);
  assert.ok(outstanding > 0, 'demand names a price');
  const unit = VALUE.get('cmdty_refined_metals');
  const need = Math.ceil(outstanding / unit);
  const before = ctx.sim.state.entityList.length;
  const dumped = ctx.sim.registry.get('cargo').jettison('cmdty_refined_metals', need);
  assert.equal(dumped, need);
  // Deal closes at once (receipt out), crew mills over the goods, record closes later.
  assert.equal(rec.phase, 'scooping');
  assert.equal(rec.choice, 'bribe');
  assert.equal(rec.outcome, 'complied');
  assert.ok(ctx.sim.state.entityList.length > before, 'bribe goods float in space as pods');
  const resolved = ctx.events.find((event) => event.type === 'resolved')?.payload;
  assert.equal(resolved?.outcome, 'complied');
  assert.equal(resolved?.next, 'break-off');
  assert.equal(resolved?.payment?.kind, 'cargo');
  assert.equal(ctx.pirate.data.ai.passive, true);
  assert.equal(ctx.pirate.data.combat.targetId, null);
  const voice = ctx.events.find((event) => event.type === 'voice' && event.payload.situation === 'bribe-taken');
  assert.ok(voice, 'bribe speaks on the voice seam');
  stepSeconds(ctx.sim, 11);
  assert.equal(rec.phase, 'break-off');
  assert.equal(rec.resolved, true);
  assert.equal(ctx.pirate.data.ai.fsm, 'flee');
  assert.equal(ctx.pirate.data.ai.activity?.kind, 'disengage');
  assert.equal(ctx.events.filter((event) => event.type === 'resolved').length, 1, 'one receipt');
});

test('a short dump holds fire a little longer and names the shortfall', () => {
  const ctx = bootBribe({ cargoItems: { cmdty_refined_metals: 40 } });
  stepSeconds(ctx.sim, 2.5);
  const rec = demandRec(ctx);
  const deadline = rec.deadlineAt;
  ctx.sim.registry.get('cargo').jettison('cmdty_refined_metals', 1);
  assert.equal(rec.resolved, false);
  assert.equal(rec.phase, 'demand');
  assert.ok((rec.bribeValue || 0) > 0, 'partial dump is remembered');
  assert.ok(Math.abs(rec.deadlineAt - (deadline + 2)) < 1e-6, 'watched dump pushes the deadline');
  assert.ok(ctx.voices.some((v) => String(v.text || '').includes('Still short')), 'crew names the shortfall');
  assert.equal(ctx.events.filter((event) => event.type === 'resolved').length, 0);
});

test('deadline push caps so dumping cannot stall forever', () => {
  const ctx = bootBribe({ cargoItems: { cmdty_refined_metals: 40 } });
  stepSeconds(ctx.sim, 2.5);
  const rec = demandRec(ctx);
  const deadline = rec.deadlineAt;
  const cargoSys = ctx.sim.registry.get('cargo');
  for (let i = 0; i < 5; i += 1) cargoSys.jettison('cmdty_refined_metals', 1);
  assert.equal(rec.phase, 'demand', 'five units still short of a 40-hold tithe');
  assert.equal(rec.bribeExtension, 6);
  assert.ok(Math.abs(rec.deadlineAt - (deadline + 6)) < 1e-6);
});

test('one rich dump overflows oldest-first across two gangs', () => {
  const ctx = bootBribe({ cargoItems: { cmdty_refined_metals: 40 }, pirates: 2 });
  stepSeconds(ctx.sim, 2.5);
  const a = demandRec(ctx, 'sq_toll_bribe');
  const b = demandRec(ctx, 'sq_toll_bribe_b');
  assert.equal(a.phase, 'demand');
  assert.equal(b.phase, 'demand');
  const unit = VALUE.get('cmdty_refined_metals');
  const need = Math.ceil(outstandingOf(a) / unit) + Math.ceil(outstandingOf(b) / unit);
  ctx.sim.registry.get('cargo').jettison('cmdty_refined_metals', need);
  assert.equal(a.choice, 'bribe');
  assert.equal(b.choice, 'bribe');
  assert.equal(a.phase, 'scooping');
  assert.equal(b.phase, 'scooping');
});

test('dumps before the demand and after violence are ignored', () => {
  const early = bootBribe();
  early.sim.registry.get('cargo').jettison('cmdty_refined_metals', 4);
  stepSeconds(early.sim, 2.5);
  const rec = demandRec(early);
  assert.equal(rec.phase, 'demand');
  assert.equal(rec.bribeValue || 0, 0, 'pre-demand dumps are not bribes');

  const violent = bootBribe();
  stepSeconds(violent.sim, 2.5);
  violent.bus.emit('pirateParley:choose', { squadId: 'sq_toll_bribe', choice: 'refuse' });
  const vrec = demandRec(violent);
  assert.equal(vrec.outcome, 'refused');
  violent.sim.registry.get('cargo').jettison('cmdty_refined_metals', 18);
  assert.equal(vrec.outcome, 'refused', 'post-escalation dumps change nothing');
  assert.equal(vrec.bribeValue || 0, 0);
});

test('brake-comply settlement is not mistaken for a bribe', () => {
  const ctx = bootBribe();
  stepSeconds(ctx.sim, 2.5);
  ctx.bus.emit('pirateParley:choose', { squadId: 'sq_toll_bribe', choice: 'comply' });
  const rec = demandRec(ctx);
  assert.equal(rec.outcome, 'complied');
  assert.equal(rec.choice, 'comply');
  assert.equal(rec.bribeValue || 0, 0, 'settlement dump is suppressed from the bribe ledger');
  assert.equal(ctx.events.filter((event) => event.type === 'resolved').length, 1);
});

test('dumped goods also satisfy a credit demand at fair value', () => {
  const ctx = bootBribe({ cargoItems: { cmdty_refined_metals: 30 } });
  stepSeconds(ctx.sim, 2.5);
  const rec = demandRec(ctx);
  rec.demand = { kind: 'credits', amount: 120, commodityId: null, qty: 0, percent: 0 };
  const unit = VALUE.get('cmdty_refined_metals');
  const need = Math.ceil(120 / unit);
  ctx.sim.registry.get('cargo').jettison('cmdty_refined_metals', need);
  assert.equal(rec.phase, 'scooping');
  assert.equal(rec.choice, 'bribe');
  const resolved = ctx.events.find((event) => event.type === 'resolved')?.payload;
  assert.equal(resolved?.outcome, 'complied');
  assert.equal(resolved?.payment?.kind, 'cargo');
  stepSeconds(ctx.sim, 11);
  assert.equal(rec.resolved, true);
});

test('hot goods bribe above face value', () => {
  const ctx = bootBribe({ cargoItems: { cmdty_narcotics: 30 } });
  stepSeconds(ctx.sim, 2.5);
  const rec = demandRec(ctx);
  assert.equal(rec.tithe.commodityId, 'cmdty_narcotics');
  const base = VALUE.get('cmdty_narcotics');
  const fairNeed = Math.ceil(outstandingOf(rec) / base);
  const hotNeed = Math.ceil(outstandingOf(rec) / (base * 1.5));
  assert.ok(hotNeed < fairNeed, 'premium means fewer units');
  ctx.sim.registry.get('cargo').jettison('cmdty_narcotics', hotNeed);
  assert.equal(rec.choice, 'bribe');
  assert.equal(rec.phase, 'scooping');
});

test('the paid crew mills at the dump site before leaving', () => {
  const ctx = bootBribe();
  stepSeconds(ctx.sim, 2.5);
  const rec = demandRec(ctx);
  const unit = VALUE.get('cmdty_refined_metals');
  ctx.sim.registry.get('cargo').jettison('cmdty_refined_metals', Math.ceil(outstandingOf(rec) / unit));
  const activity = ctx.pirate.data.ai.activity;
  assert.equal(activity?.kind, 'loiter');
  assert.equal(activity?.reason, 'pirate_parley:scoop_bribe');
  assert.deepEqual({ x: activity?.anchor?.x, z: activity?.anchor?.z }, { x: 0, z: 0 });
});
