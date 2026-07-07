#!/usr/bin/env node
// BP-13/B11 Pirate Promotion contract.
//
// A spared named ace returns after its aceMemory schedule with a bounded level bump, a bigger crew,
// and one callback taunt. Defeated aces never return.
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { aceById } from '../src/data/namedAces.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in pirate promotion path'); };
  Date.now = () => { throw new Error('Date.now in pirate promotion path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testScheduledAceReturnsBigger);
guarded(testDefeatedAceDoesNotReturn);
guarded(testPromotionIsDeterministicAndBounded);

console.log(`[check-pirate-promotion] PASS - ${sections} sections green`);

function boot(seed = 1112) {
  const sim = createSimulation({ seed, systems: [spawnBudget, aceMemory] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sker_haven';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 10, z: -20 },
    hull: 200,
    hullMax: 200,
    radius: 10,
  });
  state.playerId = player.id;
  const log = { requested: [], returned: [], voices: [] };
  bus.on('aceMemory:returnRequested', (p) => log.requested.push(p));
  bus.on('aceMemory:returnSpawned', (p) => log.returned.push(p));
  bus.on('aceMemory:voice', (p) => log.voices.push(p));
  return { sim, state, bus, player, log };
}

function stepPastReturn(t, aceId) {
  const rec = t.state.aceMemory[aceId];
  assert.ok(rec && rec.returnScheduled, 'test precondition: ace return is scheduled');
  t.state.simTime = Math.max(0, rec.returnAt - 0.25);
  t.sim.runTicks(Math.ceil(1 / SIM_DT));
}

function spawnedEntities(t) {
  const ev = t.log.returned[0];
  return (ev.spawnedIds || []).map((id) => t.state.entities.get(id)).filter(Boolean);
}

function testScheduledAceReturnsBigger() {
  const t = boot();
  const ace = aceById('ace_yara_no_cut');
  t.bus.emit('namedAce:fled', { aceId: ace.id, sectorId: 'sector_sker_haven' });
  const rec = t.state.aceMemory[ace.id];
  assert.equal(rec.returnScheduled, true, 'flee schedules a return before promotion');

  stepPastReturn(t, ace.id);

  assert.equal(t.log.requested.length, 1, 'return emits one request event');
  assert.equal(t.log.returned.length, 1, 'scheduled ace reappears once');
  const ev = t.log.returned[0];
  assert.equal(ev.aceId, ace.id, 'return event keeps ace id');
  assert.ok(ev.levelBand[0] > ev.previousLevelBand[0], 'return level band is bumped');
  assert.ok(ev.spawnedIds.length >= 2, 'ace returns with a bigger crew, not alone');
  assert.equal(t.state.aceMemory[ace.id].returnScheduled, false, 'successful return consumes schedule');
  assert.equal(t.state.aceMemory[ace.id].returned, true, 'record marks that the ace returned');
  assert.ok(t.state.spawnBudget.used >= ev.spawnedIds.length, 'return uses spawnBudget slots');

  const boss = spawnedEntities(t)[0];
  assert.equal(boss.data.encounterBoss, true, 'returned ace boss is tagged as encounterBoss');
  assert.equal(boss.data.ai.name, ace.name, 'returned boss carries the ace name');
  assert.equal(boss.data.ai.spawnContext, 'ace_return', 'returned boss uses ace_return context');
  assert.equal(boss.data.aceMemory.promoted, true, 'spawned boss is tagged as promoted ace memory');
  assert.equal(t.log.voices.filter((v) => v.situation === 'taunt').length, 1, 'return speaks one taunt');
  assert.match(t.log.voices.find((v) => v.situation === 'taunt').text, /should have finished/i,
    'taunt is a callback to sparing the ace');
  ok('a spared ace returns after the schedule with a bumped band, crew, and taunt');
}

function testDefeatedAceDoesNotReturn() {
  const t = boot(2223);
  const ace = aceById('ace_mako_broken_ring');
  t.bus.emit('namedAce:fled', { aceId: ace.id, sectorId: 'sector_sker_haven' });
  const scheduledAt = t.state.aceMemory[ace.id].returnAt;
  t.bus.emit('namedAce:defeated', { aceId: ace.id, sectorId: 'sector_sker_haven' });
  t.state.simTime = scheduledAt + 5;
  t.sim.runTicks(4);

  assert.equal(t.log.returned.length, 0, 'defeated ace does not return');
  assert.equal(t.state.aceMemory[ace.id].defeated, true, 'defeat remains recorded');
  assert.equal(t.state.aceMemory[ace.id].returnScheduled, false, 'defeat clears return schedule');
  ok('defeated aces never zombie-return');
}

function testPromotionIsDeterministicAndBounded() {
  const run = () => {
    const t = boot(3334);
    const ace = aceById('ace_toll_saint_venn');
    for (let i = 0; i < 6; i++) t.bus.emit('namedAce:fled', { aceId: ace.id, sectorId: 'sector_sker_haven' });
    stepPastReturn(t, ace.id);
    const ev = t.log.returned[0];
    const ships = spawnedEntities(t).map((e) => ({
      name: e.data.ai.name || null,
      archetype: e.data.ai.archetype,
      level: e.data.aceMemory.level,
      pos: {
        x: Number(e.pos.x.toFixed(2)),
        z: Number(e.pos.z.toFixed(2)),
      },
    }));
    return {
      returnTier: t.state.aceMemory[ace.id].returnTier,
      event: {
        aceId: ev.aceId,
        returnTier: ev.returnTier,
        levelBand: ev.levelBand,
        spawnedCount: ev.spawnedIds.length,
        taunt: t.log.voices.find((v) => v.situation === 'taunt').text,
      },
      ships,
    };
  };
  const first = run();
  const second = run();
  assert.equal(first.returnTier, 3, 'promotion tier is capped');
  assert.deepEqual(first, second, 'same seed and flee history produce identical return');
  ok('pirate promotion is deterministic and bounded');
}
