#!/usr/bin/env node
// T8a/BP-12 career profile proof.
//
// This is a verification-only gate over shipped telemetry/economy contracts. It proves the local
// career profile reads real economy/combat/mining/mission events without creating a second economy
// model or double-counting trade totals as money.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTelemetry } from '../src/systems/telemetry.js';

assert.equal(typeof window, 'undefined', 'career profile check must run headless');
assert.ok(existsSync(new URL('../src/systems/telemetry.js', import.meta.url)),
  'src/systems/telemetry.js exists');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

testCareerAggregatesFromRealEvents();
testSourceContracts();

console.log(`[check-career-profile] PASS - ${sections} sections green`);

function testCareerAggregatesFromRealEvents() {
  const bus = createBus();
  const state = createGameState(1401);
  state.mode = 'flight';
  state.playerId = 42;
  const telemetry = createTelemetry(bus, state);
  try {
    bus.emit('game:started', {});
    bus.emit('economy:tradeCompleted', {
      side: 'sell',
      commodityId: 'cmdty_ore_common',
      qty: 5,
      total: 20000,
      profit: 1200,
      stationId: 'station_helios',
    });
    bus.emit('credits:changed', { delta: 750, reason: 'trade:sell:cmdty_ore_common' });
    bus.emit('credits:changed', { delta: 300, reason: 'mission:completed' });
    bus.emit('credits:changed', { delta: -120, reason: 'service:repair' });
    bus.emit('mining:yield', { commodityId: 'cmdty_ore_common', qty: 12 });
    bus.emit('mission:accepted', { missionId: 'm_career_1', type: 'cargo_delivery' });
    bus.emit('mission:completed', { missionId: 'm_career_1', type: 'cargo_delivery', factionId: 'faction_scn' });
    bus.emit('entity:killed', { killerId: state.playerId, type: 'ship', victimClass: 'fighter', factionId: 'faction_reach' });
    bus.emit('entity:killed', { killerId: 999, type: 'ship', victimClass: 'fighter', factionId: 'faction_reach' });
    bus.emit('dock:docked', { stationId: 'station_helios' });
    bus.emit('jump:arrive', { sectorId: 'sector_tethys_junction' });
    bus.emit('tech:researched', { nodeId: 'tech_cargo_racks' });
    bus.emit('faction:repChanged', { factionId: 'faction_scn', tierChanged: true, newTier: 'trusted' });

    const session = telemetry.getSessionStats();
    const career = telemetry.getCareerStats();

    assert.equal(session.trades.sell, 1, 'tradeCompleted increments sell trade count');
    assert.equal(session.trades.byCommodity.cmdty_ore_common.sell, 1, 'trade commodity sell bucket increments');
    assert.equal(session.trades.byCommodity.cmdty_ore_common.qty, 5, 'trade commodity qty is recorded');
    assert.equal(session.credits.earned, 1050, 'credits earned comes only from credits:changed');
    assert.equal(session.credits.spent, 120, 'credits spent comes only from credits:changed');
    assert.equal(session.credits.byReason['trade:sell:cmdty_ore_common'].earned, 750,
      'trade credit reason is preserved');
    assert.equal(session.credits.earned < 20000, true,
      'economy:tradeCompleted total is not double-counted as career credits');
    assert.equal(session.ore.unitsTotal, 12, 'mining yield records ore units');
    assert.equal(session.missions.accepted, 1, 'mission accepted count increments');
    assert.equal(session.missions.completed, 1, 'mission completed count increments');
    assert.equal(session.kills.total, 1, 'only player kills count toward career kills');
    assert.equal(session.navigation.docks, 1, 'dock event increments navigation career stat');
    assert.equal(session.navigation.jumps, 1, 'jump event increments navigation career stat');
    assert.equal(session.progression.techResearched, 1, 'tech research increments progression stat');
    assert.equal(session.progression.factionTierUps, 1, 'faction tier-up increments progression stat');

    const funnel = telemetry.getFunnel();
    const reached = new Map(funnel.map((entry) => [entry.step, entry.reached]));
    for (const step of ['firstTrade', 'firstMine', 'firstKill', 'firstMissionAccept', 'firstMissionComplete', 'firstJump', 'firstTierUp', 'first1000cr']) {
      assert.equal(reached.get(step), true, `${step} funnel milestone is reached from real events`);
    }

    assert.equal(career.sessions, 1, 'headless career contains the live session');
    assert.deepEqual(career.trades, { buy: 0, sell: 1 }, 'career trade aggregate mirrors session');
    assert.equal(career.credits.earned, 1050, 'career earned credits mirror session');
    assert.equal(career.ore.unitsTotal, 12, 'career ore units mirror session');
    assert.equal(career.missions.completed, 1, 'career mission completion mirrors session');
    assert.equal(career.kills, 1, 'career kill total mirrors player-only session kills');
    ok('career profile aggregates economy, mining, mission, combat, progression, and navigation events');
  } finally {
    telemetry.dispose();
  }
}

function testSourceContracts() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:career-profile'], 'node scripts/check-career-profile.mjs',
    'package exposes check:career-profile');

  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const telemetrySrc = readFileSync(new URL('../src/systems/telemetry.js', import.meta.url), 'utf8');
  const economySrc = readFileSync(new URL('../src/systems/economy.js', import.meta.url), 'utf8');
  const gameStateSrc = readFileSync(new URL('../src/core/gameState.js', import.meta.url), 'utf8');

  assert.match(mainSrc, /createTelemetry\(bus, state\)/,
    'main boot wires the telemetry sink to the live bus/state');
  assert.match(telemetrySrc, /function getCareerStats\(\)/,
    'telemetry exposes getCareerStats');
  assert.match(telemetrySrc, /sub\('credits:changed'/,
    'career credits use the sole credits:changed channel');
  assert.match(telemetrySrc, /sub\('economy:tradeCompleted'/,
    'career trade volume listens to economy:tradeCompleted');
  assert.match(telemetrySrc, /session\.credits\.earned >= 1000/,
    'first1000cr milestone is based on cumulative earned credits');
  assert.doesNotMatch(telemetrySrc, /fetch\(|XMLHttpRequest|sendBeacon/,
    'telemetry remains local-only and sends no network data');

  assert.match(gameStateSrc, /stats: \{ lifetimeProfit: 0, tradesCount: 0, biggestSingleProfit: 0, smuggledValue: 0/,
    'player career stats default in game state');
  assert.match(economySrc, /stats\.tradesCount = \(stats\.tradesCount \|\| 0\) \+ 1/,
    'economy increments player trade count');
  assert.match(economySrc, /stats\.lifetimeProfit = \(stats\.lifetimeProfit \|\| 0\) \+ profit/,
    'economy records lifetime profit on sell settlements');
  assert.match(economySrc, /stats\.biggestSingleProfit/,
    'economy records biggest single profit');
  assert.match(economySrc, /stats\.smuggledValue = \(stats\.smuggledValue \|\| 0\) \+ Math\.abs\(total\)/,
    'economy records smuggled-value career stat from restricted goods');
  ok('source contracts pin live telemetry wiring and economy career stats');
}
