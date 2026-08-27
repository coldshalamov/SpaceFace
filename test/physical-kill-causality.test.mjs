import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { combat } from '../src/systems/combat.js';
import { combatOutcome, combatOutcomeForEntity } from '../src/systems/combatOutcome.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { wingMorale } from '../src/systems/wingMorale.js';

function ship(id, team, options = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: options.factionId || `faction_${team}`,
    pos: { x: options.x ?? 0, z: options.z ?? 0 },
    prevPos: { x: options.x ?? 0, z: options.z ?? 0 },
    vel: { x: options.vx ?? 0, z: options.vz ?? 0 },
    rot: 0,
    angVel: 0,
    radius: options.radius ?? 8,
    mass: options.mass ?? 20,
    hull: options.hull ?? 80,
    hullMax: options.hullMax ?? options.hull ?? 80,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    data: {
      name: options.name || `Ship ${id}`,
      shipClass: options.shipClass || 'fighter',
      combatProfileId: 'combat_profile_standard_ship',
      combat: { targetId: options.targetId ?? null },
      intent: { fire: true },
      ai: {
        hostileTeams: team === 0 ? [] : [0],
        archetype: team === 0 ? null : 'pirate_raider',
        squadId: options.squadId || null,
        preferredRole: options.role || null,
      },
      derived: {
        damageReductionMult: 1,
        ramDamageDealtMult: options.ramDamageDealtMult ?? 0,
      },
    },
  };
}

function harness() {
  const player = ship(1, 0, {
    name: 'Kestrel',
    hull: 140,
    hullMax: 140,
    vx: 90,
    ramDamageDealtMult: 1.8,
  });
  const leader = ship(19, 1, {
    name: 'Hammer Lead',
    hull: 1,
    hullMax: 1,
    x: 12,
    targetId: player.id,
    squadId: 'ram_wing',
    role: 'leader',
  });
  const wingmate = ship(20, 1, {
    name: 'Hammer Two',
    hull: 80,
    hullMax: 80,
    x: 30,
    targetId: player.id,
    squadId: 'ram_wing',
    role: 'support',
  });
  const entities = new Map([
    [player.id, player],
    [leader.id, leader],
    [wingmate.id, wingmate],
  ]);
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: player.id,
    player: { targetId: leader.id },
    meta: { seed: 47 },
    settings: {
      gameplay: { difficulty: 'standard' },
      video: { particleQuality: 'low', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    content: {},
    combat: { entities: {}, beams: [] },
    world: { currentSectorId: 'sector_causality_test' },
    entities,
    entityList: [...entities.values()],
  };
  return { state, player, leader, wingmate };
}

test('a direct Ram-Plate kill propagates exact physical causality into outcomes and morale', () => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;

  const { state, player, leader, wingmate } = harness();
  const bus = createBus();
  const kills = [];
  const outcomes = [];
  const breaks = [];
  bus.on('entity:killed', (payload) => kills.push(payload));
  bus.on('combat:outcome', (payload) => outcomes.push(payload));
  bus.on('wingMorale:broken', (payload) => breaks.push(payload));

  const combatSystem = Object.create(combat);
  const outcomeSystem = Object.create(combatOutcome);
  const moraleSystem = Object.create(wingMorale);
  const collisionSystem = Object.create(collisionConsequences);
  const combatRegistry = {
    get(name) { return name === 'combat' ? combatSystem : null; },
  };

  try {
    combatSystem.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
    outcomeSystem.init({ state, bus, helpers: {} });
    moraleSystem.init({ state, bus, helpers: {} });
    collisionSystem.init({ state, bus, helpers: {}, registry: combatRegistry });

    // Both production physics backends publish this exact actor field after comparing each body's
    // pre-contact contribution along the contact normal. Collision consequences must preserve it.
    bus.emit('physics:impact', {
      consequenceKernelVersion: 1,
      tick: state.tick,
      aId: leader.id,
      bId: player.id,
      causalActorId: player.id,
      impulse: 5000,
      pos: { x: 12, z: -3 },
      normal: { x: 1, z: 0 },
    });

    assert.equal(kills.length, 1, 'the authoritative combat owner emits one lethal receipt');
    assert.equal(kills[0].killerId, player.id, 'the direct-contact actor survives damage routing');
    assert.deepEqual(kills[0].presentation, {
      version: 1,
      cause: 'ship_collision',
      position: { x: 12, z: -3 },
      direction: { x: 1, z: 0 },
      normal: { x: 1, z: 0 },
      surface: 'craft',
      targetVelocity: { x: 0, z: 0 },
      playerCaused: true,
      impact: kills[0].presentation.impact,
    });
    assert.ok(kills[0].presentation.impact.impactDamage > 0);

    assert.equal(outcomes.length, 2,
      'the physical kill records the leader death and the resulting wingmate flight');
    const leaderOutcomes = outcomes.filter((record) => record.entityId === leader.id);
    const wingmateOutcomes = outcomes.filter((record) => record.entityId === wingmate.id);
    assert.equal(leaderOutcomes.length, 1, 'the leader receives exactly one terminal outcome');
    assert.equal(leaderOutcomes[0].outcome, 'killed');
    assert.equal(wingmateOutcomes.length, 1, 'the morale break produces one survivor outcome');
    assert.equal(wingmateOutcomes[0].outcome, 'fled');
    assert.equal(wingmateOutcomes[0].reason, 'ai:flee');

    const outcome = combatOutcomeForEntity(state, leader.id);
    assert.deepEqual(outcome.destruction, {
      version: 1,
      cause: 'ship_collision',
      playerCaused: true,
      surface: 'craft',
    }, 'durable combat truth retains semantics but not render telemetry');
    for (const transient of ['position', 'direction', 'normal', 'targetVelocity', 'impact']) {
      assert.equal(Object.hasOwn(outcome.destruction, transient), false,
        `${transient} remains transient presentation data`);
    }

    assert.equal(breaks.length, 1, 'the leader death breaks its surviving formation once');
    assert.equal(breaks[0].shockMultiplier, 1.35,
      'a deliberate craft collision produces stronger shock than ordinary weapons fire');
    assert.ok(Math.abs(breaks[0].duration - 8.1) < 1e-12);
    assert.equal(breaks[0].destruction.cause, 'ship_collision');
    assert.equal(wingmate.data.ai.forceFlee, true);
    assert.equal(wingmate.data.ai.wingMorale.destructionCause, 'ship_collision');
    assert.equal(wingmate.data.ai.wingMorale.shockMultiplier, 1.35);
  } finally {
    collisionSystem.destroy();
    moraleSystem.destroy();
    outcomeSystem.destroy();
    combatSystem.destroy?.();
    bus.clear();
    COMBAT_FLAGS.weaponImpulseConsequences = previous;
  }
});
