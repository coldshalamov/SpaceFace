import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { pirateParley } from '../src/systems/pirateParley.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';
import { combatOutcome } from '../src/systems/combatOutcome.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';

function stepSeconds(sim, seconds) {
  sim.runTicks(Math.max(1, Math.ceil(seconds / SIM_DT)));
}

function bootParley({ cargoItems = { cmdty_refined_metals: 12 }, seed = 4701 } = {}) {
  const voices = [];
  const sim = createSimulation({
    seed,
    systems: [economy, cargo, pirateParley, pirateDisengage, combatOutcome],
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
  const pirate = sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 140, z: 0 },
    hull: 100,
    hullMax: 100,
    data: {
      ai: {
        doctrine: 'toll',
        squadId: 'sq_intentional_toll',
        archetype: 'pirate_raider',
        spawnContext: 'ambient',
      },
      intent: { fire: true, moveX: 0, moveZ: 0 },
      combat: { targetId: player.id },
    },
  });
  const events = [];
  bus.on('pirateParley:demand', (payload) => events.push({ type: 'demand', payload: structuredClone(payload) }));
  bus.on('pirateParley:resolved', (payload) => events.push({ type: 'resolved', payload: structuredClone(payload) }));
  return { sim, state, bus, player, pirate, events, voices };
}

function bootCombatant({
  seed = 4702,
  data = {},
  archetype = 'mercenary_interceptor',
  motive = 'contract_combat',
} = {}) {
  const voices = [];
  const sim = createSimulation({
    seed,
    systems: [pirateDisengage, combatOutcome],
    helpers: { voice: { say(payload) { voices.push(structuredClone(payload)); return true; } } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200 });
  state.playerId = player.id;
  const hostile = sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 180, z: 0 },
    hull: 100,
    hullMax: 100,
    data: {
      ...data,
      ai: {
        squadId: 'sq_ordinary_hostile',
        archetype,
        spawnContext: 'zone_hostile',
        motive,
        forcePlayerTarget: true,
        huntPlayer: true,
        hostileTeams: [0],
        ...(data.ai || {}),
      },
      intent: { fire: true, moveX: -1, moveZ: 0 },
      combat: { targetId: player.id, lockTarget: player.id },
    },
  });
  const events = { triggered: [], disengageVoice: [], surrendered: [], outcomes: [] };
  bus.on('pirateDisengage:triggered', (payload) => events.triggered.push(structuredClone(payload)));
  bus.on('pirateDisengage:voice', (payload) => events.disengageVoice.push(structuredClone(payload)));
  bus.on('combat:surrendered', (payload) => events.surrendered.push(structuredClone(payload)));
  bus.on('combat:outcome', (payload) => events.outcomes.push(structuredClone(payload)));
  sim.step(); // establish the live squad baseline while the combatant is healthy
  return { sim, state, bus, player, hostile, events, voices };
}

test('empty hold produces no robbery while valuable cargo produces a concrete demand', () => {
  const empty = bootParley({ cargoItems: {} });
  stepSeconds(empty.sim, 2.5);
  assert.equal(empty.events.length, 0);
  assert.equal(empty.pirate.data.ai.motive, 'no_profitable_target');
  assert.equal(empty.pirate.data.ai.passive, true);
  assert.equal(isHostileToPlayer(empty.pirate, 0, empty.state), false);

  const valuable = bootParley({ cargoItems: { cmdty_refined_metals: 18 } });
  stepSeconds(valuable.sim, 2.5);
  const demand = valuable.events.find((event) => event.type === 'demand')?.payload;
  assert.ok(demand, 'valuable cargo receives a demand before violence');
  assert.ok(demand.demand.amount > 0);
  assert.ok(demand.deadlineAt > valuable.state.simTime);
  assert.equal(valuable.pirate.data.ai.passive, true);
});

test('compliance ends the robbery and refusal creates explicit aggression', () => {
  const compliant = bootParley();
  stepSeconds(compliant.sim, 2.5);
  compliant.bus.emit('pirateParley:choose', { squadId: 'sq_intentional_toll', choice: 'comply' });
  const paid = compliant.events.find((event) => event.type === 'resolved')?.payload;
  assert.equal(paid?.outcome, 'complied');
  assert.equal(paid?.next, 'break-off');
  assert.equal(compliant.pirate.data.ai.passive, true);
  assert.equal(compliant.pirate.data.combat.targetId, null);

  const refused = bootParley();
  stepSeconds(refused.sim, 2.5);
  refused.bus.emit('pirateParley:choose', { squadId: 'sq_intentional_toll', choice: 'refuse' });
  const fight = refused.events.find((event) => event.type === 'resolved')?.payload;
  assert.equal(fight?.outcome, 'refused');
  assert.equal(fight?.next, 'violence');
  assert.equal(refused.pirate.data.ai.engagementTrigger, 'explicit_refusal');
  assert.equal(refused.pirate.data.combat.targetId, refused.player.id);
  assert.equal(isHostileToPlayer(refused.pirate, 0, refused.state), true);
});

test('a critically damaged ordinary combatant surrenders with one readable receipt', () => {
  const t = bootCombatant();
  t.hostile.hull = 14;
  stepSeconds(t.sim, 1.25);

  assert.equal(t.events.triggered.length, 1);
  assert.equal(t.events.triggered[0].reason, 'damage-critical');
  assert.equal(t.events.triggered[0].outcome, 'surrendered');
  assert.equal(t.events.surrendered.length, 1);
  assert.equal(t.hostile.data.ai.fsm, 'surrender');
  assert.equal(t.hostile.data.ai.passive, true);
  assert.equal(t.hostile.data.intent.fire, false);
  assert.equal(t.hostile.data.combat.targetId, null);
  assert.equal(t.events.outcomes.length, 1);
  assert.equal(t.events.outcomes[0].outcome, 'surrendered');
  assert.match(t.events.disengageVoice[0].text, /yield|surrender|weapons cold/i);

  stepSeconds(t.sim, 5);
  assert.equal(t.events.triggered.length, 1, 'terminal decision does not retrigger');
  assert.equal(t.events.disengageVoice.length, 1, 'retreat bark is not spammed');
  assert.equal(t.events.surrendered.length, 1, 'surrender receipt is exactly once');
  assert.equal(t.events.outcomes.length, 1, 'combat outcome is exactly once');
});

test('the live combat-kernel targetId shape records a disabled outcome', () => {
  const t = bootCombatant({ seed: 4711 });
  t.bus.emit('combat:subsystemDisabled', {
    attackerId: t.player.id,
    targetId: t.hostile.id,
    subsystemId: 'subsystem_drive',
  });

  assert.equal(t.events.outcomes.length, 1);
  assert.equal(t.events.outcomes[0].entityId, t.hostile.id);
  assert.equal(t.events.outcomes[0].outcome, 'disabled');
  assert.equal(t.events.outcomes[0].reason, 'subsystem_drive');
});

test('a damaged ordinary combatant retreats, but healthy and authored boss combatants do not', () => {
  const damaged = bootCombatant({ seed: 4703 });
  damaged.hostile.hull = 26;
  stepSeconds(damaged.sim, 1.25);
  assert.equal(damaged.events.triggered.length, 1);
  assert.equal(damaged.events.triggered[0].reason, 'damage-retreat');
  assert.equal(damaged.events.triggered[0].outcome, 'fled');
  assert.equal(damaged.hostile.data.ai.fsm, 'flee');

  const healthy = bootCombatant({ seed: 4704 });
  stepSeconds(healthy.sim, 2);
  assert.equal(healthy.events.triggered.length, 0, 'healthy dangerous-space combatant keeps fighting');
  assert.equal(healthy.hostile.data.intent.fire, true);

  const boss = bootCombatant({
    seed: 4705,
    archetype: 'miniboss_capital',
    data: { isBoss: true, encounterBoss: true, ai: { role: 'boss' } },
  });
  boss.hostile.hull = 5;
  stepSeconds(boss.sim, 2);
  assert.equal(boss.events.triggered.length, 0, 'authored boss is morale-exempt even at critical hull');
  assert.equal(boss.hostile.data.ai.passive, undefined);
  assert.equal(boss.hostile.data.intent.fire, true);
});

test('losing half a damaged wing causes one deterministic break-off', () => {
  function run(seed) {
    const t = bootCombatant({ seed });
    const wingmates = [];
    for (let i = 0; i < 2; i++) {
      wingmates.push(t.sim.spawn({
        type: 'ship',
        team: 1,
        factionId: 'faction_reach',
        pos: { x: 200 + i * 20, z: 20 },
        hull: 100,
        hullMax: 100,
        data: {
          ai: {
            squadId: 'sq_ordinary_hostile',
            archetype: 'mercenary_interceptor',
            spawnContext: 'zone_hostile',
            motive: 'contract_combat',
            forcePlayerTarget: true,
            hostileTeams: [0],
          },
          intent: { fire: true, moveX: -1, moveZ: 0 },
          combat: { targetId: t.player.id },
        },
      }));
    }
    t.sim.step(); // record a three-ship baseline
    wingmates[0].alive = false;
    wingmates[1].alive = false;
    t.hostile.hull = 58;
    stepSeconds(t.sim, 1.25);
    return {
      triggers: t.events.triggered.map(({ reason, outcome, memberIds }) => ({ reason, outcome, memberIds })),
      voices: t.events.disengageVoice.map(({ situation, reason, text }) => ({ situation, reason, text })),
      fsm: t.hostile.data.ai.fsm,
      passive: t.hostile.data.ai.passive,
    };
  }

  const first = run(4706);
  assert.deepEqual(first.triggers, [{ reason: 'wing-loss', outcome: 'fled', memberIds: [2] }]);
  assert.equal(first.fsm, 'flee');
  assert.equal(first.passive, true);
  assert.match(first.voices[0].text, /wing broken|pulling out/i);
  assert.deepEqual(run(4706), first, 'same seed and attrition tape produce the same exit decision');
});

test('ace, fanatic, and authored mission-target flags remain morale-exempt', () => {
  const cases = [
    { seed: 4707, data: { aceMemory: { aceId: 'ace_vanta' } } },
    { seed: 4708, data: { ai: { fanatic: true } } },
    { seed: 4709, data: { missionTag: 'mission_named_captain', storyTargetId: 'cap_sable_iask' } },
    { seed: 4710, data: { aiArchetype: 'miniboss_capital' } },
  ];
  for (const entry of cases) {
    const t = bootCombatant(entry);
    t.hostile.hull = 1;
    stepSeconds(t.sim, 2);
    assert.equal(t.events.triggered.length, 0);
    assert.equal(t.hostile.data.intent.fire, true);
  }
});
