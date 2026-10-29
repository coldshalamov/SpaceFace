// A shove answers morale (seed: "enemies that react to being shoved"). The live perception
// already carries self.tumbling (aiPorts reads isTumbling); the mind never read it — a hull with
// its helm torn loose kept flying parade formation as if nothing happened. Now the tumble feeds
// fear, and a mid-fight shove breaks an undisciplined pilot over the panic reflex. Drive the real
// EnemyMindRuntime: no mocks of the decision path.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEnemyMindState, EnemyMindRuntime } from '../src/ai/enemyMind/runtime.js';

function rng() {
  let s = 4242;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function perception(tick, { hullFraction = 1, tumbling = false, targeted = true } = {}) {
  return {
    tick,
    self: { id: 'e1', team: 'pirate', pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, rot: 0,
      radius: 12, hullFraction, energyFraction: 1, heatFraction: 0, disabled: false,
      tumbling, tethered: false },
    contacts: [{
      id: 't1', kind: 'ship', hostile: true, team: 'concord', alive: true, valid: true,
      visible: true, ageTicks: 0, confidence: 1,
      pos: { x: 300, z: 0 }, vel: { x: 0, z: 0 },
      targetId: targeted ? 'e1' : null,
    }],
    events: [],
  };
}

const DIRECTIVE = Object.freeze({
  objective: { kind: 'engage', targetId: 't1', targetObserved: true },
  formation: { slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 140 },
});

function makeRuntime(discipline = 0.3) {
  return new EnemyMindRuntime({
    profile: 'rookie',
    traitsByEntity: { e1: { discipline, courage: 0.5 } },
  });
}

function step(runtime, memory, clock, { hullFraction = 0.55, tumbling = false } = {}) {
  clock.t += 0.1; clock.k += 6;
  return runtime.step({
    memory,
    rng: clock.rng,
    simTime: clock.t,
    tick: clock.k,
    roster: [{ id: 'sq1', members: [{ id: 'e1', alive: true, combatDoctrineId: 'raider' }] }],
    perceptionsByEntity: new Map([['e1', perception(clock.k, { hullFraction, tumbling })]]),
    directivesByEntity: new Map([['e1', DIRECTIVE]]),
  });
}

function drive(runtime, opts, steps = 12) {
  const memory = createEnemyMindState();
  const clock = { rng: rng(), t: 0, k: 0 };
  let output = null;
  for (let i = 0; i < steps; i++) output = step(runtime, memory, clock, opts);
  return { output, memory };
}

test('a mid-fight shove breaks an undisciplined pilot: panic within the tumble window', () => {
  const { output } = drive(makeRuntime(0.3), { hullFraction: 0.55, tumbling: true });
  assert.equal(output.get('e1').verb, 'panic',
    `a tumbled, hurt, low-discipline pilot panics — got ${output.get('e1').verb}`);
});

test('the same hurt pilot without the shove holds the line (the shove is the tipping weight)', () => {
  const { output } = drive(makeRuntime(0.3), { hullFraction: 0.55, tumbling: false });
  const mind = output.get('e1');
  assert.notEqual(mind.verb, 'panic', `untumbled control must not panic — got ${mind.verb}`);
  assert.ok(mind.fear < 0.79, `fear stays under the panic floor — got ${mind.fear}`);
});

test('discipline holds through the shove (a veteran does not break)', () => {
  const { output } = drive(makeRuntime(0.8), { hullFraction: 0.55, tumbling: true });
  assert.notEqual(output.get('e1').verb, 'panic',
    `a disciplined pilot rides the shove out — got ${output.get('e1').verb}`);
});

test('a clean hull spooks but does not break off a single shove', () => {
  const { output } = drive(makeRuntime(0.3), { hullFraction: 1, tumbling: true });
  const mind = output.get('e1');
  assert.notEqual(mind.verb, 'panic',
    `one shove on a full hull is a spook, not a rout — got ${mind.verb}`);
});
