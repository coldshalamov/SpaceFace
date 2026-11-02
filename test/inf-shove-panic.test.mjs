// INFERENCE WF-02 — shoved enemies panic and call for help.
// A hull the pilot tosses rattles: guns cold for a beat, one mayday over the band, and an
// authored reinforcement caller whose only triggers used to be hull/turret thresholds now
// calls its screen when the pilot throws it. Focused owner checks, no render, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createTacticalAISystem, applyShovePanicFireGate } from '../src/systems/tacticalAI.js';
import { stepShovePanicRestores } from '../src/systems/tacticalAI.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import {
  SHOVE_PANIC_TAIL_S,
  shovePanicLive,
  shovePanicBreakActivity,
} from '../src/ai/shovePanic.js';

function makeHostile(state, id, over = {}) {
  const entity = {
    id, type: 'ship', alive: true, team: 3,
    pos: { x: 400, z: -220 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 120, hullMax: 120, radius: 12,
    factionId: 'faction_reach',
    data: {
      ai: {
        roe: 'weapons_free',
        activity: { kind: 'attack_run', reason: 'raid_run', targetId: state.playerId,
          preferredRange: 260, startedTick: 0 },
        combatDoctrineId: 'interceptor_flyby',
      },
      combat: { targetId: state.playerId },
      intent: { fire: true, fireGroup: 'main' },
    },
    ...over,
  };
  state.entities.set(id, entity);
  return entity;
}

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 100;
  state.tick = 6000;
  const bus = createBus();
  const player = { id: 'pilot', type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set('pilot', player);
  state.playerId = 'pilot';
  return { state, bus, player };
}

test('a pilot-caused tumble rattles the crew: panic stamp, break-off record, one mayday', () => {
  const { state, bus } = boot();
  const victim = makeHostile(state, 7);
  const ai = victim.data.ai;
  const baseActivity = ai.activity;
  const system = createTacticalAISystem({ seed: 4242 });
  system.init({ state, bus, helpers: {}, registry: null });

  const maydays = [];
  bus.on('ai:mayday', (p) => maydays.push(p));
  const barks = [];
  system.init({ state, bus, helpers: { voice: { say: (b) => barks.push(b) } }, registry: null });

  bus.emit('combat:tumbled', {
    victimId: 7, attackerId: 'pilot', source: 'weapon_hitstun', cause: 'ram',
    deltaV: 140, dirX: 1, dirZ: 0, startedAt: 100, until: 101.4, time: 100, tick: 6000,
  });

  assert.ok(shovePanicLive(ai, state.simTime), 'panic window is live right after the tumble');
  assert.equal(maydays.length, 1, 'exactly one mayday event');
  assert.equal(maydays[0].entityId, 7);
  assert.ok(maydays[0].text && maydays[0].text.length > 3, 'the mayday carries a spoken line');
  assert.equal(barks.length, 1, 'the mayday reaches the voice arbiter');
  assert.equal(ai.activity.kind, 'reposition', 'the crew breaks off while rattled');
  assert.equal(ai.activity.reason, 'shove_panic');
  assert.equal(ai.shovePanicBase, baseActivity, 'the authored activity is stashed for handback');
  assert.ok(ai.shovePanic.until > 101.4, 'panic outlives the tumble itself');
  assert.ok(ai.shovePanic.until <= 101.4 + SHOVE_PANIC_TAIL_S + 1e-9, 'and only by its tail');
});

test('the rattle expires: guns come back, the authored activity is handed back once', () => {
  const { state } = boot();
  const victim = makeHostile(state, 9);
  const ai = victim.data.ai;
  ai.shovePanic = { until: state.simTime + SHOVE_PANIC_TAIL_S, startedAt: state.simTime };
  const base = ai.activity;
  ai.shovePanicBase = base;
  ai.activity = { ...ai.activity, kind: 'reposition', reason: 'shove_panic' };

  // Still live: the fire gate holds the guns, the record stands.
  applyShovePanicFireGate(victim, state);
  assert.equal(victim.data.intent.fire, false);
  assert.equal(victim.data.intent.fireBlockReason, 'shove_panic');

  // The break is still live too: the restore pass leaves it alone.
  stepShovePanicRestores(state, [victim]);
  assert.equal(ai.activity.reason, 'shove_panic');

  state.simTime += SHOVE_PANIC_TAIL_S + 0.1;
  stepShovePanicRestores(state, [victim]);
  assert.equal(ai.activity, base, 'the authored attack run is handed back');
  assert.equal(ai.shovePanicBase, undefined, 'the stash is spent exactly once');
  assert.equal(shovePanicLive(ai, state.simTime), false, 'the window self-expires');

  victim.data.intent.fire = true;
  applyShovePanicFireGate(victim, state);
  assert.equal(victim.data.intent.fire, true, 'guns return after the rattle');
});

test('authored contracts are exempt: bosses, aces and crews already fleeing never rattle', () => {
  const { state, bus } = boot();
  const boss = makeHostile(state, 11, { data: { isBoss: true, ai: { roe: 'weapons_free' }, intent: {} } });
  const fleeing = makeHostile(state, 12);
  fleeing.data.ai.fsm = 'flee';
  const system = createTacticalAISystem({ seed: 4242 });
  system.init({ state, bus, helpers: {}, registry: null });

  const announcement = (victimId) => ({
    victimId, attackerId: 'pilot', source: 'weapon_hitstun', deltaV: 140,
    startedAt: 100, until: 101, time: 100, tick: 6000,
  });
  bus.emit('combat:tumbled', announcement(11));
  bus.emit('combat:tumbled', announcement(12));
  assert.equal(shovePanicLive(boss.data.ai, state.simTime), false, 'a boss keeps its authored contract');
  assert.equal(shovePanicLive(fleeing.data.ai, state.simTime), false, 'a fleeing crew owes no mayday');
});

test('only the pilot’s shove rattles: an NPC-on-NPC tumble buys no panic', () => {
  const { state, bus } = boot();
  const victim = makeHostile(state, 13);
  const system = createTacticalAISystem({ seed: 4242 });
  system.init({ state, bus, helpers: {}, registry: null });
  bus.emit('combat:tumbled', {
    victimId: 13, attackerId: 99, source: 'weapon_hitstun', deltaV: 140,
    startedAt: 100, until: 101, time: 100, tick: 6000,
  });
  assert.equal(shovePanicLive(victim.data.ai, state.simTime), false);
  assert.equal(victim.data.ai.activity.reason, 'raid_run', 'the authored record stands');
});

test('a rattled reinforcement caller calls its screen at full hull — once', () => {
  const { state, bus, player } = boot();
  state.combat = { entities: {} };
  state.entityList = [player];
  const caller = makeHostile(state, 21);
  state.entityList.push(caller);
  // The live authored package from the roster: the Reaver's screen.
  caller.data.reinforcements = { packageId: 'reaver_swarm_screen', hullThreshold: 0.3 };
  const encounter = { nextSeq: 1, commands: [] };
  aiEncounter.init({ state, bus, helpers: {}, registry: null });

  // Full hull, no rattle: the authored threshold holds.
  aiEncounter._queueAuthoredReinforcements(encounter, state);
  assert.equal(encounter.commands.length, 0, 'a healthy caller holds its fire for the beat');

  // The pilot throws the caller: the mayday admits the call above the hull threshold.
  const ai = caller.data.ai;
  ai.shovePanic = { until: state.simTime + SHOVE_PANIC_TAIL_S, startedAt: state.simTime };
  aiEncounter._queueAuthoredReinforcements(encounter, state);
  assert.equal(encounter.commands.length, 1, 'the rattled caller calls the screen');
  assert.equal(encounter.commands[0].packageId, 'reaver_swarm_screen');
  assert.equal(ai._calledReinforcements, true, 'the once-ever latch holds');

  aiEncounter._queueAuthoredReinforcements(encounter, state);
  assert.equal(encounter.commands.length, 1, 'one package per caller, whichever beat fired it');
});
