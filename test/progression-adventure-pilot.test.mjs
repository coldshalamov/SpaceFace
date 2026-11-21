// Adventure has the Pilot Tree (progression lead 2026-11-20): XP from the world's sources levels a
// saved record on a slow curve, a level-up banks a point and announces itself without opening
// anything, the player spends points on any open node of the full tree, a station respec hands
// them back for a fee, and the record survives save and load.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { pilotHas } from '../src/data/pilotTree.js';
import {
  adventureLevelForXp,
  adventureRespecFee,
  adventureXpForLevel,
  normalizeAdventurePilot,
} from '../src/data/pilotAdventure.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save } from '../src/save/saveSystem.js';

function boot() {
  const state = createGameState(5);
  state.playerId = 1;
  const bus = createBus();
  const events = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (type, payload) => { events.push({ type, payload }); return origEmit(type, payload); };
  const sys = Object.create(runSession);
  sys.init({ state, bus });
  return { state, bus, events, sys };
}

test('the curve: ~10 points by hour 3, ~25 by hour 15, ~40 by hour 40', () => {
  // ~1,000-1,300 XP an hour from the world's sources.
  assert.equal(adventureLevelForXp(0), 1);
  assert.equal(adventureLevelForXp(100), 2, 'the first point arrives in the first minutes');
  const pointsAt = (xp) => adventureLevelForXp(xp) - 1;
  assert.ok(Math.abs(pointsAt(3_600) - 10) <= 1, `hour 3: ${pointsAt(3_600)}`);
  assert.ok(Math.abs(pointsAt(20_000) - 25) <= 1, `hour 15: ${pointsAt(20_000)}`);
  assert.ok(Math.abs(pointsAt(52_000) - 40) <= 1, `hour 40: ${pointsAt(52_000)}`);
  for (let l = 1; l < 60; l++) assert.ok(adventureXpForLevel(l + 1) > adventureXpForLevel(l));
});

test('XP levels the saved record and a level-up is a beat, not a menu', () => {
  const h = boot();
  h.bus.emit('pilot:xpEarned', { xp: 60, source: 'kill', label: 'Wasp' });
  assert.equal(h.state.player.pilot.xp, 60);
  assert.equal(h.state.player.pilot.level, 1);
  h.bus.emit('pilot:xpEarned', { xp: 60, source: 'job' });
  assert.equal(h.state.player.pilot.level, 2);
  assert.equal(h.state.player.pilot.banked, 1);
  const up = h.events.filter((e) => e.type === 'pilot:levelUp');
  assert.equal(up.length, 1);
  assert.deepEqual(up[0].payload, { door: 'adventure', level: 2, previousLevel: 1, banked: 1, entityId: 1 });
  assert.ok(!h.events.some((e) => e.type === 'ui:pushScreen'), 'nothing opens over the fight');
});

test('a point buys any open node of the full tree by id; closed nodes are refused', () => {
  const h = boot();
  h.bus.emit('pilot:xpEarned', { xp: 500, source: 'job' });
  assert.equal(h.state.player.pilot.banked, 3);
  h.bus.emit('pilot:nodeRequested', { nodeId: 'gunner_gold_thread' });
  assert.ok(h.events.some((e) => e.type === 'pilot:nodeRejected' && e.payload.reason === 'not_open'));
  h.bus.emit('pilot:nodeRequested', { nodeId: 'prospector_deep_bite' });
  assert.equal(pilotHas(h.state, 'prospector_deep_bite'), true, 'the work branches are Adventure\'s');
  h.bus.emit('pilot:nodeRequested', { nodeId: 'gunner_steady_hands' });
  assert.deepEqual(h.state.player.pilot.points, { prospector: 1, gunner: 1 });
  assert.equal(h.state.player.pilot.banked, 1);
  const taken = h.events.filter((e) => e.type === 'pilot:nodeTaken');
  assert.equal(taken.length, 2);
  assert.equal(taken[1].payload.door, 'adventure');
  assert.equal(taken[1].payload.branch, 'gunner');
});

test('a live Swarm run takes no Adventure XP and never reads the Adventure record', () => {
  const h = boot();
  h.bus.emit('pilot:xpEarned', { xp: 200 });
  h.bus.emit('pilot:nodeRequested', { nodeId: 'gunner_steady_hands' });
  h.state.run = { ...h.state.run, kind: 'survival', phase: 'active', pilot: { points: {}, nodes: [], banked: 0, offer: null } };
  h.bus.emit('pilot:xpEarned', { xp: 5000 });
  assert.equal(h.state.player.pilot.xp, 200);
  assert.equal(pilotHas(h.state, 'gunner_steady_hands'), false);
});

test('respec: docked, for a fee the economy takes, every point comes back', () => {
  const h = boot();
  let charged = null;
  h.bus.on('economy:chargeCredits', (req) => {
    if (h.state.player.credits < req.amount || req.expectedCredits !== h.state.player.credits) return;
    if (req.commit() !== true) return;
    h.state.player.credits -= req.amount;
    charged = req.amount;
    req.result = true;
  });
  h.bus.emit('pilot:xpEarned', { xp: 500 });
  h.bus.emit('pilot:nodeRequested', { nodeId: 'gunner_steady_hands' });
  h.bus.emit('pilot:nodeRequested', { nodeId: 'gunner_hollow_point' });
  h.bus.emit('pilot:respecRequested', {});
  assert.ok(h.events.some((e) => e.type === 'pilot:respecRejected' && e.payload.reason === 'not_docked'));
  h.state.player.flags = { ...(h.state.player.flags || {}), docked: true };
  const fee = adventureRespecFee(h.state.player.pilot);
  h.state.player.credits = fee - 1;
  h.bus.emit('pilot:respecRequested', {});
  assert.equal(h.state.player.pilot.nodes.length, 2, 'short of the fee: nothing refunded');
  h.state.player.credits = fee + 10;
  h.bus.emit('pilot:respecRequested', {});
  assert.equal(charged, fee);
  assert.deepEqual(h.state.player.pilot.nodes, []);
  assert.equal(h.state.player.pilot.banked, 3, 'every point is back to spend');
  assert.equal(h.state.player.credits, 10);
});

test('save: the record round-trips through the player envelope; v25→v26 normalizes it', () => {
  const h = boot();
  h.bus.emit('pilot:xpEarned', { xp: 400 });
  h.bus.emit('pilot:nodeRequested', { nodeId: 'ghost_cloak' });
  const saver = Object.assign(Object.create(save), { state: h.state });
  const record = JSON.parse(JSON.stringify(saver._serializePlayer()));
  const g = boot();
  const loader = Object.assign(Object.create(save), { state: g.state });
  loader._restorePlayer(record);
  assert.deepEqual(g.state.player.pilot, h.state.player.pilot);
  assert.equal(pilotHas(g.state, 'ghost_cloak'), true);

  assert.equal(CURRENT_VERSION, 26);
  const step = MIGRATIONS.find((m) => m.from === 25 && m.to === 26);
  const old = { player: { credits: 5 } };
  step.fn(old);
  assert.equal(Object.hasOwn(old.player, 'pilot'), false, 'a v25 save earned nothing: no record');
  const stray = { player: { pilot: { xp: 250, nodes: ['gunner_drum', 'gunner_drum', 7], points: { gunner: 1, bad: -2 } } } };
  step.fn(stray);
  assert.deepEqual(stray.player.pilot, normalizeAdventurePilot({ xp: 250, nodes: ['gunner_drum'], points: { gunner: 1 } }));
});

test('Building: the basic kit is open, advanced machines open by skill, old saves keep what they built', async () => {
  const { builderMachineLock, builderSkillsCovering } = await import('../src/data/pilotWork.js');
  const fresh = { run: { kind: 'adventure', phase: 'inactive' }, player: {} };
  for (const basic of ['sm_massline_core', 'sm_extractor', 'sm_cargo_port', 'sm_refinery', 'sm_relay']) {
    assert.equal(builderMachineLock(fresh, basic), null, `${basic} is in the basic kit`);
  }
  const lock = builderMachineLock(fresh, 'sm_fabricator');
  assert.equal(lock.nodeId, 'builder_foundations');
  assert.equal(lock.line, 'Learn Foundations (Building) in the Pilot Tree to build this.');
  const skilled = { ...fresh, player: { pilot: { nodes: ['builder_foundations'], points: { builder: 1 } } } };
  assert.equal(builderMachineLock(skilled, 'sm_fabricator'), null);
  assert.equal(builderMachineLock(skilled, 'sm_mass_driver').nodeId, 'builder_yard_hand');

  assert.deepEqual(builderSkillsCovering(['sm_extractor', 'sm_charge_press']), ['builder_foundations', 'builder_tight_packing']);
  const step = MIGRATIONS.find((m) => m.from === 25 && m.to === 26);
  const save = { player: {}, sites: { byId: { site_1: { machines: [{ defId: 'sm_massline_core' }, { defId: 'sm_charge_press' }] } } } };
  step.fn(save);
  assert.deepEqual(save.player.pilot.nodes, ['builder_foundations', 'builder_tight_packing']);
  assert.deepEqual(save.player.pilot.granted, ['builder_foundations', 'builder_tight_packing']);
  assert.equal(save.player.pilot.banked, 0, 'granted free: no points owed');
  assert.equal(save.player.pilot.level, 1);
  const later = normalizeAdventurePilot({ ...save.player.pilot, xp: 200 });
  assert.equal(later.banked, 1, 'the first earned point is still the player\'s to spend');
});

test('Trading: the chart names no trend without Market Sense; Long Memory doubles the window', async () => {
  const { traderTrendLine, traderHistorySpanS, traderHasBestBuyer } = await import('../src/data/pilotWork.js');
  const { marketQuoteHtml } = await import('../src/ui/views/marketPresentation.js');
  const plain = { run: { kind: 'adventure', phase: 'inactive' }, player: {} };
  const reader = { ...plain, player: { pilot: { nodes: ['trader_market_sense', 'trader_long_memory', 'trader_best_buyer'], points: { trader: 3 } } } };
  const climbing = { kind: 'climb', elapsed: 725 };
  assert.equal(traderTrendLine(plain, climbing), '', 'no skill: the player reads the shape');
  assert.equal(traderTrendLine(reader, climbing), 'Climbing for 12 min');
  assert.equal(traderHistorySpanS(plain), 600);
  assert.equal(traderHistorySpanS(reader), 1200);
  assert.equal(traderHasBestBuyer(plain), false);
  assert.equal(traderHasBestBuyer(reader), true);
  const hist = [{ t: 0, mid: 10 }, { t: 15, mid: 11 }];
  const longKey = marketQuoteHtml({ id: 'x', name: 'X', buy: 10, sell: 9, avg: 10, hist, now: 15, historyWord: 'Last twenty minutes' });
  assert.match(longKey, /Last twenty minutes/);
});

test('Building: a loaded game holds (free) the skills its built machines need, every load', () => {
  const h = boot();
  h.state.sites = { byId: { s1: { machines: [{ defId: 'sm_fabricator' }] } }, order: ['s1'] };
  h.bus.emit('save:loaded', {});
  assert.deepEqual(h.state.player.pilot.granted, ['builder_foundations']);
  assert.equal(h.state.player.pilot.banked, 0);
  h.bus.emit('save:loaded', {});
  assert.deepEqual(h.state.player.pilot.nodes, ['builder_foundations'], 'idempotent');
});
