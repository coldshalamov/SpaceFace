// inf-reinforce-tell — a mid-wave reinforcement arrival says where it is coming from while the
// pack is still on approach. The pressure hold already telegraphs a big top-up a breath before
// the spend (FIGHT-10), but the GATE is only drawn when the batch materializes, so until now no
// line ever named the bearing a reinforcement was arriving on — the receipt carried the gate and
// nobody read it. The combat net now speaks the materialization receipt: the count and the world
// bearing, one line per gap, a small count per wave, inside the same hard budget as every other
// voice line. A rate-limited or budget-starved tell falls through to the counter hint instead of
// swallowing it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  survivalAnnounce,
  MAX_REINFORCE_LINES_PER_WAVE,
  REINFORCE_TELL_GAP_S,
  MAX_LINES_PER_WAVE,
} from '../src/systems/survivalAnnounce.js';
import { GATE_BEARINGS } from '../src/systems/waveMaterialization.js';
import { playerBearingName } from '../src/core/playerCompass.js';

const SEED = 4242;
const bearingWord = (gateGroup) => `the ${playerBearingName(GATE_BEARINGS[gateGroup].x, GATE_BEARINGS[gateGroup].z)}`;

function boot({ wave = 2 } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const run = createRunState({ kind: 'survival', seed: SEED });
  run.ruleset = 'swarm';
  run.phase = 'active';
  run.wave = wave;
  state.run = run;
  state.tick = 100;
  state.simTime = 30;

  survivalAnnounce.init({ state, bus, helpers: {} });
  bus.emit('run:waveStarted', { wave });

  return {
    state,
    bus,
    emitted,
    reinforceAlerts: () => emitted.filter((e) => e.event === 'alert'
      && typeof e.payload?.key === 'string' && e.payload.key.startsWith('reinforce:')),
    allAlerts: () => emitted.filter((e) => e.event === 'alert'),
    say: (text) => emitted.filter((e) => e.event === 'voice:say' && e.payload?.text === text),
  };
}

function receipt(h, over = {}) {
  h.bus.emit('run:waveMaterialized', {
    wave: 2, enemyId: 'wasp_swarmer', gateGroup: 'front', role: 'swarmer',
    atTick: 1800, requested: 3, admitted: 3, rejected: 0, tick: 1800,
    reinforcement: true, ...over,
  });
}

test('a reinforcement receipt speaks one count-and-bearing line while the pack is on approach', () => {
  const h = boot();
  receipt(h);
  const lines = h.reinforceAlerts();
  assert.equal(lines.length, 1, 'exactly one arrival line for one receipt');
  assert.equal(lines[0].payload.sev, 'warn', 'a warn alert, above chatter, below danger');
  assert.match(lines[0].payload.text, /Three more inbound/);
  assert.ok(lines[0].payload.text.includes(bearingWord('front')),
    `the line must name the world bearing (${lines[0].payload.text})`);
  assert.ok(Number.isFinite(lines[0].payload.ttl) && lines[0].payload.ttl > 0
    && lines[0].payload.ttl < Infinity, 'finite ttl only — never a persistent pill');
});

test('the tell paces itself: one per gap, a small count per wave', () => {
  const h = boot();
  receipt(h, { tick: 1800 });
  receipt(h, { tick: 1801 });
  assert.equal(h.reinforceAlerts().length, 1, 'a burst of receipts is one line, never a chorus');
  h.state.simTime += REINFORCE_TELL_GAP_S + 0.1;
  receipt(h, { tick: 2300 });
  assert.equal(h.reinforceAlerts().length, 2, 'after the gap the next arrival speaks again');
  h.state.simTime += REINFORCE_TELL_GAP_S + 0.1;
  receipt(h, { tick: 2900 });
  assert.equal(h.reinforceAlerts().length, MAX_REINFORCE_LINES_PER_WAVE,
    'the per-wave cap is hard');
});

test('a rate-limited tell falls through to the counter hint instead of swallowing it', () => {
  const h = boot();
  receipt(h, { tick: 1800 }); // first receipt speaks and consumes the gap
  const taught = h.allAlerts().length;
  // An untaught archetype lands inside the gap: its hint must still reach the player.
  h.bus.emit('run:waveMaterialized', {
    wave: 2, enemyId: 'lancer_sniper', gateGroup: 'ne', role: 'sniper',
    atTick: 1810, requested: 2, admitted: 2, rejected: 0, tick: 1810,
    reinforcement: true,
  });
  const lines = h.emitted.filter((e) => e.event === 'voice:say');
  assert.ok(lines.some((e) => /standoff band/.test(e.payload?.text)),
    'the counter hint speaks even while the arrival tell is cooling');
  assert.ok(h.reinforceAlerts().length >= taught - h.allAlerts().length
    ? h.reinforceAlerts().length === 1 : true, 'no second arrival line inside the gap');
});

test('an opening burst or a non-reinforcement materialization never speaks this line', () => {
  const h = boot();
  receipt(h, { reinforcement: false, tick: 1700 });
  receipt(h, { reinforcement: undefined, tick: 1710 });
  assert.equal(h.reinforceAlerts().length, 0, 'only true mid-wave top-ups carry the tell');
});

test('the wave budget bounds the tell like every other line', () => {
  const h = boot();
  // Spend the whole wave budget on five surge lines (the hard MAX_LINES_PER_WAVE).
  for (let i = 0; i < MAX_LINES_PER_WAVE; i++) {
    h.bus.emit('swarm:pressureTelegraph', { wave: 2, stored: 2, tick: 100 + i });
  }
  const before = h.allAlerts().length;
  receipt(h, { tick: 1800 });
  assert.equal(h.reinforceAlerts().length, 0,
    'a spent budget cannot crowdfund one more line');
  assert.equal(h.allAlerts().length, before, 'and it spent nothing trying');
});

test('silence outside a live run', () => {
  const h = boot();
  h.state.run.phase = 'inactive';
  receipt(h, { tick: 1800 });
  assert.equal(h.reinforceAlerts().length, 0, 'no arrival voice in a dead run');
});

test('an unknown gate still tells the count, without inventing a bearing', () => {
  const h = boot();
  receipt(h, { gateGroup: undefined, tick: 1800 });
  const lines = h.reinforceAlerts();
  assert.equal(lines.length, 1);
  assert.match(lines[0].payload.text, /Three more inbound, on approach\./,
    'no bearing is claimed when the receipt names no gate');
});
