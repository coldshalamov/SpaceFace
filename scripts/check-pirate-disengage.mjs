#!/usr/bin/env node
// BP-13/B8 Break-Off-When-Patrol-Arrives contract.
//
// A lawful patrol entering the local radius makes active pirate squads break off into flee behavior
// after a short deterministic nerve delay. No patrol means no change; one squad gets one flee bark.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/pirateDisengage.js', import.meta.url)),
  'src/systems/pirateDisengage.js exists');

const sysMod = await import('../src/systems/pirateDisengage.js');
const pirateDisengage = sysMod.pirateDisengage || sysMod.default;
assert.ok(pirateDisengage && pirateDisengage.name === 'pirateDisengage',
  'pirateDisengage system exports the registry object');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in pirate disengage path'); };
  Date.now = () => { throw new Error('Date.now in pirate disengage path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testPatrolTriggersFleeAfterNerveDelay);
guarded(testNoPatrolNoFalseDisengage);
guarded(testNonLawfulShipDoesNotTrigger);
guarded(testOneVoicePerSquad);
guarded(testDeterminism);

console.log(`[check-pirate-disengage] PASS - ${sections} sections green`);

function boot({ withPatrol = true, lawful = true, patrolPos = { x: 220, z: 0 }, seed = 808 } = {}) {
  const sim = createSimulation({ seed, systems: [pirateDisengage, voiceArbiter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
  });
  state.playerId = player.id;

  const pirates = [];
  for (let i = 0; i < 2; i++) {
    pirates.push(sim.spawn({
      type: 'ship',
      team: 1,
      factionId: 'faction_reach',
      pos: { x: 90 + i * 20, z: 10 + i * 5 },
      hull: 90,
      hullMax: 90,
      data: {
        ai: {
          doctrine: 'thief',
          squadId: 'sq_raiders',
          archetype: 'pirate_raider',
          spawnContext: 'encounter',
          forcePlayerTarget: true,
          hostileTeams: [0],
        },
        intent: { moveX: 0, moveZ: 0, fire: true },
        combat: { targetId: player.id },
      },
    }));
  }

  const patrol = withPatrol
    ? sim.spawn({
      type: 'ship',
      team: 2,
      factionId: lawful ? 'faction_scn' : 'faction_reach',
      pos: patrolPos,
      hull: 120,
      hullMax: 120,
      data: {
        ai: {
          lawful,
          doctrine: lawful ? 'official' : 'thief',
          archetype: lawful ? 'patrol_lawman' : 'pirate_raider',
          spawnContext: lawful ? 'patrol' : 'encounter',
        },
        intent: { moveX: 0, moveZ: 0, fire: false },
        combat: { targetId: null },
      },
    })
    : null;

  const log = { triggered: [], voices: [], toasts: [] };
  bus.on('pirateDisengage:triggered', (p) => log.triggered.push(p));
  bus.on('pirateDisengage:voice', (p) => log.voices.push(p));
  bus.on('toast', (p) => log.toasts.push(p));
  return { sim, state, bus, player, pirates, patrol, log };
}

function stepFor(sim, seconds) {
  sim.runTicks(Math.max(1, Math.ceil(seconds / SIM_DT)));
}

function livePirates(t) {
  return t.pirates.map((e) => t.state.entities.get(e.id)).filter(Boolean);
}

function assertStillFighting(t) {
  assert.equal(t.log.triggered.length, 0, 'no disengage event yet');
  for (const e of livePirates(t)) {
    assert.notEqual(e.data.ai.fsm, 'flee', 'pirate is not fleeing yet');
    assert.equal(e.data.intent.fire, true, 'pirate fire intent still present before disengage');
    assert.equal(e.data.combat.targetId, t.player.id, 'pirate target still present before disengage');
  }
}

function assertFleeing(t) {
  assert.equal(t.log.triggered.length, 1, 'squad emits one disengage event');
  assert.equal(t.log.voices.length, 1, 'squad emits one flee voice');
  assert.equal(t.log.voices[0].situation, 'flee', 'voice uses flee bark');
  assert.ok(t.log.toasts.length >= 1, 'voice arbiter surfaced the flee bark');
  for (const e of livePirates(t)) {
    assert.equal(e.data.ai.fsm, 'flee', 'pirate enters flee fsm');
    assert.equal(e.data.intent.fire, false, 'fleeing pirate stops firing');
    assert.equal(e.data.combat.targetId, null, 'fleeing pirate drops player target');
    assert.equal(e.data.pirateDisengage.phase, 'flee', 'entity records disengage phase');
    assert.ok(e.data.intent.moveX < 0, 'pirate immediate intent moves away from patrol on +x');
  }
}

function testPatrolTriggersFleeAfterNerveDelay() {
  const t = boot();
  stepFor(t.sim, 0.4);
  assertStillFighting(t);
  stepFor(t.sim, 1.0);
  assertFleeing(t);
  ok('lawful patrol triggers flee after a readable nerve delay');
}

function testNoPatrolNoFalseDisengage() {
  const t = boot({ withPatrol: false });
  stepFor(t.sim, 2.2);
  assertStillFighting(t);
  ok('without a patrol, pirates keep their normal behavior');
}

function testNonLawfulShipDoesNotTrigger() {
  const t = boot({ lawful: false });
  stepFor(t.sim, 2.2);
  assertStillFighting(t);
  ok('nearby non-lawful ships do not spoof law-on-horizon disengage');
}

function testOneVoicePerSquad() {
  const t = boot();
  stepFor(t.sim, 2.0);
  stepFor(t.sim, 4.0);
  assertFleeing(t);
  assert.equal(t.log.triggered.length, 1, 'continued patrol proximity does not retrigger');
  assert.equal(t.log.voices.length, 1, 'continued patrol proximity does not repeat flee bark');
  ok('disengage trigger is sticky and voice-capped per squad');
}

function testDeterminism() {
  const run = () => {
    const t = boot({ seed: 919 });
    stepFor(t.sim, 1.5);
    return {
      triggered: t.log.triggered,
      voices: t.log.voices.map((v) => ({ situation: v.situation, text: v.text })),
      pirates: livePirates(t).map((e) => ({
        fsm: e.data.ai.fsm,
        fire: e.data.intent.fire,
        targetId: e.data.combat.targetId,
        moveX: Number(e.data.intent.moveX.toFixed(4)),
        moveZ: Number(e.data.intent.moveZ.toFixed(4)),
      })),
    };
  };
  assert.deepEqual(run(), run(), 'same seed and geometry produce identical disengage result');
  ok('pirate disengage is deterministic');
}
