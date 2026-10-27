// THE NEXT CHAMPION IS A NAMED GOAL, NOT A RUMOR.
//
// Fourteen champions rotate every tenth wave and nothing told the player which one was
// coming — deep-run content like the colossi was invisible until it arrived. swarmNextBossFor
// resolves the next rotation row at-or-after a wave (wrap-aware, so wave 147 already knows
// the Iron Maw returns at 150 wearing its numeral), and the combat net speaks it ONCE, at a
// fixed three-wave lead: "The Tendril waits at wave 80." Boss waves name themselves on
// arrival; every other wave stays quiet. A Circuit round carries its own boss contract, so
// the cadence preview never speaks there — a net that names a hull that is not coming
// teaches the player to ignore the net.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  MAX_LINES_PER_WAVE,
  survivalAnnounce,
} from '../src/systems/survivalAnnounce.js';
import {
  SWARM_BOSS_ROTATION,
  SWARM_CHAMPION_LEAD_WAVES,
  SWARM_RULESET,
  swarmBossFor,
  swarmNextBossFor,
} from '../src/data/swarmMode.js';

const ARENA = 'helios_core';
const SEED = 7;
const LINE_EVENTS = new Set(['voice:say', 'alert']);

function boot() {
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
  const run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  run.arenaId = ARENA;
  run.phase = 'active';
  state.run = run;
  survivalAnnounce.init({ state, bus, helpers: {} });
  return {
    state,
    bus,
    emitted,
    texts: () => emitted.filter((e) => LINE_EVENTS.has(e.event)).map((e) => e.payload.text),
    previewTexts: () => emitted
      .filter((e) => LINE_EVENTS.has(e.event))
      .map((e) => e.payload.text)
      .filter((t) => /waits at wave/.test(t)),
  };
}

function planFor(wave) {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans`);
  return plan;
}

/** Drive a wave from planned → started, as survivalRun does. */
function openWave(h, wave, plan = planFor(wave)) {
  if (h.state.run && typeof h.state.run === 'object' && !Array.isArray(h.state.run)) {
    h.state.run.wave = wave;
  }
  h.bus.emit('run:wavePlanned', { wave, plan });
  h.bus.emit('run:waveStarted', { wave, tick: 1 });
  return plan;
}

// ── 1. The helper: right row, right cycle, right distance ─────────────────────────────────────

test('the next champion is the boss wave at-or-after the wave asked', () => {
  assert.equal(SWARM_CHAMPION_LEAD_WAVES, 3, 'the authored lead stays three waves');
  const first = swarmNextBossFor(1);
  assert.equal(first.id, 'iron_maw');
  assert.equal(first.wave, 10);
  assert.equal(first.distance, 9);
  assert.equal(first.cycle, undefined, 'the first pass wears no numeral');

  assert.equal(swarmNextBossFor(7).distance, 3, 'wave 7 is exactly at the lead');
  const onTheBossWave = swarmNextBossFor(10);
  assert.equal(onTheBossWave.id, 'iron_maw', 'asking on the boss wave names the fight on the field');
  assert.equal(onTheBossWave.wave, 10);
  assert.equal(onTheBossWave.distance, 0);
  assert.equal(swarmNextBossFor(11).id, 'mirrorjaw_foreman');
  assert.equal(swarmNextBossFor(11).wave, 20);
  assert.equal(swarmNextBossFor(80).id, 'brood_tendril', 'the colossus rows answer too');
});

test('the wrap rides along — wave 150 previews Iron Maw II, numeral and cycle included', () => {
  const next = swarmNextBossFor(147);
  assert.equal(next.id, 'iron_maw');
  assert.equal(next.wave, 150);
  assert.equal(next.distance, 3);
  assert.equal(next.cycle, 1, 'the preview carries the pass');
  assert.equal(next.label, `${SWARM_BOSS_ROTATION[0].label} II`);
  assert.equal(next.label, swarmBossFor(150).label, 'the preview names what the wave will field');
  assert.equal(swarmNextBossFor(150).cycle, 1);
  assert.equal(swarmNextBossFor(289).label, `${SWARM_BOSS_ROTATION[0].label} III`, 'deeper passes too');
});

test('junk input and the last boss wave are honest, and the answer is deterministic', () => {
  assert.equal(swarmNextBossFor(0).wave, 10, 'junk clamps to wave 1');
  assert.equal(swarmNextBossFor('x').wave, 10);
  assert.equal(swarmNextBossFor(990).id, 'iron_maw', 'wave 990 is the last legal boss wave');
  assert.equal(swarmNextBossFor(991), null, 'no champion is promised past the ceiling');
  assert.equal(swarmNextBossFor(999), null);
  assert.deepEqual(swarmNextBossFor(77), swarmNextBossFor(77), 'pure: same input, same answer');
});

// ── 2. The surface: one forward-mention at the authored lead ───────────────────────────────────

test('wave 7 names the wave-10 champion once — label, target wave and authored line', () => {
  const h = boot();
  openWave(h, 7);
  const previews = h.previewTexts();
  assert.equal(previews.length, 1, 'exactly one forward-mention at the lead');
  const boss = swarmNextBossFor(7);
  assert.equal(
    previews[0],
    `${boss.label} waits at wave ${boss.wave}. ${boss.line}`,
  );
  assert.match(previews[0], /Iron Maw/, 'the authored name reaches the player');
  assert.match(previews[0], /Throw the pack into the flank berm\./, 'the authored line rides along');
  const say = h.emitted.find((e) => e.event === 'voice:say' && /waits at wave/.test(e.payload.text));
  assert.equal(say.payload.channel, 'objective');
  assert.ok(Number.isFinite(say.payload.ttl) && say.payload.ttl > 0);
  survivalAnnounce.destroy();
});

test('deep runs name deep champions — The Tendril waits at wave 80', () => {
  const h = boot();
  openWave(h, 77);
  const previews = h.previewTexts();
  assert.equal(previews.length, 1);
  assert.match(previews[0], /^The Tendril waits at wave 80\./);
  assert.match(previews[0], /put a rock on the line\./);
  survivalAnnounce.destroy();
});

test('the wrap is announced as the escalation it is — Iron Maw II waits at wave 150', () => {
  const h = boot();
  openWave(h, 147);
  const previews = h.previewTexts();
  assert.equal(previews.length, 1);
  assert.match(previews[0], /Iron Maw' II waits at wave 150\./);
  survivalAnnounce.destroy();
});

test('repeated wave events never repeat the mention', () => {
  const h = boot();
  const plan = planFor(7);
  openWave(h, 7, plan);
  h.bus.emit('run:wavePlanned', { wave: 7, plan });
  h.bus.emit('run:waveStarted', { wave: 7, tick: 2 });
  assert.equal(h.previewTexts().length, 1, 'one mention per wave however many events land');
  survivalAnnounce.destroy();
});

// ── 3. Quiet everywhere else ──────────────────────────────────────────────────────────────────

test('non-champion-adjacent waves stay quiet — no countdown, no chorus', () => {
  const h = boot();
  for (const wave of [1, 5, 6, 8, 9, 11, 12, 19, 21, 76, 78, 79, 148, 149]) {
    h.emitted.length = 0;
    openWave(h, wave);
    assert.equal(h.previewTexts().length, 0, `wave ${wave} must not look forward`);
  }
  survivalAnnounce.destroy();
});

test('the boss wave itself stays quiet — it names itself on arrival', () => {
  const h = boot();
  for (const wave of [10, 20, 80, 150]) {
    h.emitted.length = 0;
    openWave(h, wave);
    assert.equal(h.previewTexts().length, 0, `boss wave ${wave} previews nothing`);
    assert.ok(h.texts().some((t) => t.startsWith(`Wave ${wave}.`)), `wave ${wave} still opens`);
  }
  survivalAnnounce.destroy();
});

test('one mention per champion across the whole zone', () => {
  const h = boot();
  for (const wave of [7, 8, 9, 10]) openWave(h, wave);
  assert.equal(h.previewTexts().length, 1, 'waves 7–10 produce exactly the wave-7 mention');
  survivalAnnounce.destroy();
});

test('a Circuit round never hears the cadence preview — its boss contract is its own', () => {
  const h = boot();
  const plan = planFor(7);
  plan.swarm.circuit = { stage: 1, localRound: 7, kind: 'survive' };
  openWave(h, 7, plan);
  assert.equal(h.previewTexts().length, 0, 'the cadence champion may never come on a Circuit round');
  survivalAnnounce.destroy();
});

test('the arc never borrows the preview — a non-swarm plan stays quiet', () => {
  const h = boot();
  const arcPlan = planWave({ seed: SEED, arenaId: ARENA, wave: 7 });
  assert.ok(!arcPlan.swarm, 'the arc plan carries no swarm block');
  openWave(h, 7, arcPlan);
  assert.equal(h.previewTexts().length, 0);
  assert.ok(h.texts().length > 0, 'the arc opener still speaks');
  survivalAnnounce.destroy();
});

test('the mention lives inside the per-wave line budget', () => {
  const h = boot();
  openWave(h, 7);
  const lines = h.emitted.filter((e) => LINE_EVENTS.has(e.event)).length;
  assert.ok(lines <= MAX_LINES_PER_WAVE, `wave 7 produced ${lines} lines`);
  survivalAnnounce.destroy();
});
