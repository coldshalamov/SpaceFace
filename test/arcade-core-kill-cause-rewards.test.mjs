// AC-08: one honest kill-cause classifier and reward multiplier.
//
// The classifier is proved twice over: as a pure function against fabricated truth, and through the
// real collision route that produces that truth, so a passing unit bucket cannot hide a dead seam.
import assert from 'node:assert/strict';
import test from 'node:test';

import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import {
  applyStyleMultiplier,
  chainMultiplierForDepth,
  classifyKillCause,
  KILL_CAUSE_IDS,
  KILL_ZONE_ATMOSPHERE_BURN,
  KILL_ZONE_WELL_INNER,
  styleMultiplierOf,
} from '../src/combat/killCause.js';
import { createCombatCatalog, ensureCombatant } from '../src/combat/runtime.js';
import { COLLISION_TUMBLE_KIND, TUMBLE_STATUS_ID } from '../src/combat/tumbleStatus.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import {
  creditChipItemsOf,
  isCreditChipItem,
  materialItemsOf,
} from '../src/data/killRewards.js';
import { buildKillPresentationReceipt, combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { lootShardItemsFor, lootShards, scaleCreditChipItems } from '../src/systems/lootShards.js';
import { missions } from '../src/systems/missions.js';

const CATALOG = createCombatCatalog();

const AUTHORED_LOOT = Object.freeze({
  creditsRange: [500, 500],
  guaranteed: [{ id: 'cmdty_alloys', qtyRange: [3, 3] }],
});

// ---------------------------------------------------------------------------
// Pure classifier
// ---------------------------------------------------------------------------

test('the classifier resolves all five buckets with their authored multipliers', () => {
  assert.deepEqual(KILL_CAUSE_IDS, [
    'ordinary', 'terrain_smash', 'chain', 'well_collapse', 'burn_up',
  ]);

  const ordinary = classifyKillCause({
    victimId: 9, killerId: 1, cause: 'kinetic', tumbleState: { victim: false, source: false },
  });
  const terrain = classifyKillCause({
    victimId: 9, killerId: 1, cause: 'terrain_collision',
    tumbleState: { victim: true, source: false }, impactVelocity: 26,
  });
  const chain = classifyKillCause({
    victimId: 9, killerId: 1, cause: 'ship_collision',
    tumbleState: { victim: false, source: true }, chainDepth: 1,
  });
  const well = classifyKillCause({ victimId: 9, cause: 'kinetic', zone: KILL_ZONE_WELL_INNER });
  const burn = classifyKillCause({ victimId: 9, cause: 'generic', zone: KILL_ZONE_ATMOSPHERE_BURN });

  assert.deepEqual(
    [ordinary, terrain, chain, well, burn].map((style) => [style.id, style.multiplier]),
    [
      ['ordinary', 1],
      ['terrain_smash', 1.5],
      ['chain', 1.5],
      ['well_collapse', 1.5],
      ['burn_up', 2],
    ],
  );
  assert.equal(chain.chainDepth, 1);
  assert.equal(terrain.chainDepth, 0, 'non-chain buckets never carry a depth');
  for (const style of [ordinary, terrain, chain, well, burn]) {
    assert.equal(Object.isFrozen(style), true);
    assert.equal(style.version, 1);
    assert.throws(() => { style.multiplier = 99; }, TypeError);
  }
  // The zone identity is read from an explicit input; a lookalike string is not a zone.
  assert.equal(classifyKillCause({ zone: { id: KILL_ZONE_WELL_INNER } }).id, 'well_collapse');
  assert.equal(classifyKillCause({ zone: 'atmosphere' }).id, 'ordinary');
});

test('malformed and ambiguous input fails closed to ordinary', () => {
  const malformed = [
    null,
    undefined,
    {},
    [],
    'terrain_collision',
    42,
    { cause: 'terrain_collision' },
    // Real contact, but the threshold cannot be evaluated or is not met.
    { cause: 'terrain_collision', tumbleState: { victim: true }, impactVelocity: Number.NaN },
    { cause: 'terrain_collision', tumbleState: { victim: true }, impactVelocity: 17.9 },
    { cause: 'terrain_collision', tumbleState: { victim: true } },
    // A hull still under its own control that clipped a rock is not a smash, however hard it hit.
    { cause: 'terrain_collision', tumbleState: { victim: false }, impactVelocity: 400 },
    // Two ships flying into each other under power is an ordinary collision, not a chain.
    { cause: 'ship_collision', tumbleState: { victim: true, source: false }, chainDepth: 3 },
    // Unreadable tumble truth can never be upgraded into a richer bucket.
    { cause: 'terrain_collision', tumbleState: 'tumbling', impactVelocity: 400 },
    { cause: 'ship_collision', tumbleState: null, chainDepth: 4 },
    { cause: null, tumbleState: { victim: true, source: true }, impactVelocity: 400 },
    { zone: { id: 'not_a_zone' }, cause: 'kinetic' },
  ];
  for (const input of malformed) {
    const style = classifyKillCause(input);
    assert.equal(style.id, 'ordinary', `${JSON.stringify(input)} must fail closed`);
    assert.equal(style.multiplier, 1);
    assert.equal(style.chainDepth, 0);
  }
});

test('a tumbling ship shot dead in open space is an ordinary kill', () => {
  for (const cause of ['kinetic', 'explosive', 'generic']) {
    const style = classifyKillCause({
      victimId: 9,
      killerId: 1,
      cause,
      // Every physical fact a style kill would need — except a contact that caused the death.
      tumbleState: { victim: true, source: true },
      impactVelocity: 260,
      chainDepth: 4,
    });
    assert.equal(style.id, 'ordinary', `${cause} weapon death must stay ordinary`);
    assert.equal(style.multiplier, 1);
  }
});

test('chain links compound and stop at the authored ceiling', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 12].map(chainMultiplierForDepth),
    [1.5, 2.25, 3.375, 4, 4, 4],
  );
  // Structural chain truth with an unreadable depth resolves to the MINIMUM real link, never a
  // richer one — the bucket is established by physics, only its magnitude is unknown.
  for (const depth of [0, -3, Number.NaN, undefined, 'deep']) {
    assert.equal(chainMultiplierForDepth(depth), 1.5);
  }
  assert.equal(classifyKillCause({
    cause: 'ship_collision', tumbleState: { source: true }, chainDepth: Number.NaN,
  }).chainDepth, 1);
  assert.equal(classifyKillCause({
    cause: 'ship_collision', tumbleState: { source: true }, chainDepth: 40,
  }).multiplier, 4);
});

test('the payout edge rounds deterministically and every unclassified receipt pays x1', () => {
  assert.equal(applyStyleMultiplier(200, 1.5), 300);
  assert.equal(applyStyleMultiplier(3, 1.5), 5, 'half values round up, once, at the edge');
  assert.equal(applyStyleMultiplier(3, 2.25), 7);
  assert.equal(applyStyleMultiplier(500, 2), 1000);
  assert.equal(applyStyleMultiplier(0, 4), 0);
  assert.equal(applyStyleMultiplier(-40, 2), 0);
  assert.equal(applyStyleMultiplier(120, Number.NaN), 120);
  assert.equal(applyStyleMultiplier(120, 0), 120);
  assert.equal(Number.isInteger(applyStyleMultiplier(37, 3.375)), true);

  for (const style of [null, undefined, {}, { multiplier: 'x2' }, { multiplier: 0 }]) {
    assert.equal(styleMultiplierOf(style), 1);
  }
  assert.equal(styleMultiplierOf({ multiplier: 2.25 }), 2.25);
});

// ---------------------------------------------------------------------------
// Live seams: the receipt built from real physics
// ---------------------------------------------------------------------------

test('the presentation receipt consumes an explicit execution zone (the AC-13 seam is live)', () => {
  const victim = ship(9, { hull: 1 });
  const state = collisionState([ship(1, { team: 0, hull: 140, hullMax: 140 }), victim]);
  const weapon = {
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
    packet: { source: { kind: 'weapon', weaponId: 'wpn_autocannon_s' } },
  };

  const burn = buildKillPresentationReceipt(state, victim, state.playerId, {
    ...weapon, zone: KILL_ZONE_ATMOSPHERE_BURN,
  });
  assert.equal(burn.style.id, 'burn_up');
  assert.equal(burn.style.multiplier, 2);
  assert.equal(burn.cause, 'kinetic', 'the legacy VFX cause is never overwritten by the zone');

  // The damage packet source is the second live seam AC-13 can stamp.
  const well = buildKillPresentationReceipt(state, victim, state.playerId, {
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
    packet: { source: { kind: 'weapon', weaponId: 'wpn_autocannon_s', zone: KILL_ZONE_WELL_INNER } },
  });
  assert.equal(well.style.id, 'well_collapse');
  assert.equal(well.style.multiplier, 1.5);

  // Nothing on the current default routes produces a zone, so both stay unreachable until AC-13.
  assert.equal(buildKillPresentationReceipt(state, victim, state.playerId, weapon).style.id, 'ordinary');
});

test('a real terrain contact is a smash only for a body that was already tumbling', () => {
  withImpulseConsequences(() => {
    for (const alreadyTumbling of [true, false]) {
      const player = ship(1, { team: 0, hull: 140, hullMax: 140, x: 0, z: 0 });
      const victim = ship(9, { hull: 1, vx: 84, vz: -12 });
      const rock = {
        id: 90, type: 'asteroid', alive: true, pos: { x: 46, z: 6 },
        vel: { x: 0, z: 0 }, radius: 40, mass: 1e6, data: {},
      };
      const run = liveContactRun([player, victim, rock]);
      if (alreadyTumbling) makeTumbling(run.state, victim);
      recordImpulseProvenance(victim, {
        actorId: run.state.playerId, weaponId: 'wpn_concussion_cannon_m',
        tag: 'concussion_blast', appliedTick: run.state.tick, magnitude: 5000,
      });

      run.impact({ aId: victim.id, bId: rock.id, pos: { x: 45, z: 6 }, normal: { x: -1, z: 0 } });

      assert.equal(run.kills.length, 1);
      assert.equal(run.kills[0].presentation.cause, 'terrain_collision',
        'the low-level VFX cause is preserved for both outcomes');
      assert.deepEqual(run.kills[0].presentation.style, alreadyTumbling
        ? { version: 1, id: 'terrain_smash', multiplier: 1.5, chainDepth: 0 }
        : { version: 1, id: 'ordinary', multiplier: 1, chainDepth: 0 });
      run.dispose();
    }
  });
});

test('a real craft contact chains off an already-tumbling body and compounds to its ceiling', () => {
  withImpulseConsequences(() => {
    const player = ship(1, { team: 0, hull: 140, hullMax: 140, x: 0, z: 0 });
    // The bowled body. Heavy enough that the contacts it scores never damage or re-tumble it, so it
    // survives to carry the chain the way a real projectile through a wing does.
    const projectile = ship(21, { hull: 600, hullMax: 600, mass: 5000, vx: 60, x: 30, z: 0 });
    const victims = [9, 22, 23, 24].map((id, index) => ship(id, { hull: 1, x: 40 + index * 20, z: 0 }));
    const run = liveContactRun([player, projectile, ...victims]);
    makeTumbling(run.state, projectile);
    recordImpulseProvenance(projectile, {
      actorId: run.state.playerId, weaponId: 'wpn_concussion_cannon_m',
      tag: 'concussion_blast', appliedTick: run.state.tick, magnitude: 5000,
    });

    victims.forEach((victim, index) => run.impact({
      aId: victim.id, bId: projectile.id, tickOffset: index,
      pos: { x: victim.pos.x, z: 0 }, normal: { x: -1, z: 0 },
    }));

    assert.equal(run.kills.length, 4);
    assert.deepEqual(run.kills.map((kill) => kill.presentation.cause), Array(4).fill('ship_collision'));
    assert.deepEqual(run.kills.map((kill) => kill.presentation.style.id), Array(4).fill('chain'));
    assert.deepEqual(run.kills.map((kill) => kill.presentation.style.chainDepth), [1, 2, 3, 4]);
    assert.deepEqual(run.kills.map((kill) => kill.presentation.style.multiplier),
      [1.5, 2.25, 3.375, 4]);
    assert.equal(projectile.alive, true, 'the projectile survives to carry the chain');
    run.dispose();
  });
});

test('a craft contact from a controlled hull is ordinary, and a dead body forgets its chain', () => {
  withImpulseConsequences(() => {
    const player = ship(1, { team: 0, hull: 140, hullMax: 140, x: 0, z: 0 });
    const rammer = ship(21, { hull: 600, hullMax: 600, mass: 5000, vx: 60, x: 30, z: 0 });
    const victim = ship(9, { hull: 1, x: 40, z: 0 });
    const run = liveContactRun([player, rammer, victim]);
    // No tumble on the incoming body: this is a ram under power, not a bowled projectile.
    recordImpulseProvenance(rammer, {
      actorId: run.state.playerId, weaponId: 'wpn_concussion_cannon_m',
      tag: 'concussion_blast', appliedTick: run.state.tick, magnitude: 5000,
    });

    run.impact({ aId: victim.id, bId: rammer.id, pos: { x: 40, z: 0 }, normal: { x: -1, z: 0 } });

    assert.equal(run.kills.length, 1);
    assert.equal(run.kills[0].presentation.cause, 'ship_collision');
    assert.deepEqual(run.kills[0].presentation.style,
      { version: 1, id: 'ordinary', multiplier: 1, chainDepth: 0 });
    // Transient chain truth lives outside the entity graph entirely.
    assert.equal(Object.hasOwn(victim.data, 'chainDepth'), false);
    assert.equal(Object.hasOwn(rammer.data, 'chainDepth'), false);
    run.dispose();
  });
});

// ---------------------------------------------------------------------------
// Reward channels
// ---------------------------------------------------------------------------

test('style multiplies credit chips, bounty, authored loot credits, and RP', () => {
  const plain = rewardOutcome();
  const styled = rewardOutcome(KILL_ZONE_ATMOSPHERE_BURN);

  // RP: the victim-scaled base for a gunship, doubled exactly once, at its sole writer.
  assert.equal(plain.research.length, 1);
  assert.equal(styled.research.length, 1);
  assert.equal(plain.research[0].amount, 3);
  assert.equal(styled.research[0].amount, 6);
  assert.equal(styled.research[0].source, 'hostile_kill');
  assert.equal(plain.researchPoints, 3);
  assert.equal(styled.researchPoints, 6);
  assert.equal(styled.xp, undefined, 'no parallel XP wallet appears');

  assert.deepEqual(plain.bounty, [200]);
  assert.deepEqual(styled.bounty, [400]);
  assert.deepEqual(plain.loot, [500]);
  assert.deepEqual(styled.loot, [1000]);

  const plainChips = creditChipItemsOf(plain.burst.items);
  const styledChips = creditChipItemsOf(styled.burst.items);
  assert.ok(plainChips.length > 0);
  assert.equal(styledChips.length, plainChips.length);
  for (let i = 0; i < plainChips.length; i++) {
    assert.equal(styledChips[i].credits, plainChips[i].credits * 2);
    assert.equal(styledChips[i].amount, styledChips[i].credits,
      'both value fields stay in step for the pickup reader');
    assert.equal(styledChips[i].grantReason, plainChips[i].grantReason,
      'the economy dedupe key is byte-identical');
  }
});

test('material quantities, item order, and the victim-local RNG never move', () => {
  const plain = rewardOutcome();
  const styled = rewardOutcome(KILL_ZONE_ATMOSPHERE_BURN);

  assert.equal(styled.burst.items.length, plain.burst.items.length);
  assert.deepEqual(materialItemsOf(styled.burst.items), materialItemsOf(plain.burst.items));
  for (let i = 0; i < plain.burst.items.length; i++) {
    assert.equal(isCreditChipItem(styled.burst.items[i]), isCreditChipItem(plain.burst.items[i]),
      'the item array keeps its exact length and order');
  }
  // The authored loot channel scales its credits and nothing else.
  assert.deepEqual(styled.authored.items, plain.authored.items);
  assert.equal(plain.authored.credits, 500);
  assert.equal(styled.authored.credits, 1000);

  // Scaling is a pure post-roll rewrite: it consumes no draw and shifts no material.
  const victim = { id: 11, type: 'ship', data: { shipClass: 'gunship', worldRecordId: 'ac08-rng' } };
  const rolled = lootShardItemsFor(0x47a, victim);
  for (const multiplier of [1, 1.5, 2, 2.25, 4]) {
    const scaled = scaleCreditChipItems(rolled, multiplier);
    assert.equal(scaled.length, rolled.length);
    assert.deepEqual(materialItemsOf(scaled), materialItemsOf(rolled));
    for (const chip of creditChipItemsOf(scaled)) assert.ok(Number.isInteger(chip.credits));
  }
  assert.deepEqual(lootShardItemsFor(0x47a, victim), rolled,
    'the victim-local stream is identical after any amount of scaling');
});

test('style never opens a reward path that was closed', () => {
  for (const options of [
    { missionTarget: true, bountyCr: 200, loot: AUTHORED_LOOT },
    { hostile: false },
    { playerKill: false, bountyCr: 200, loot: AUTHORED_LOOT },
  ]) {
    const run = bootRewardKill({ ...options, zone: KILL_ZONE_ATMOSPHERE_BURN });
    assert.equal(run.research.length, 0, `${JSON.stringify(options)} must grant no RP`);
    assert.equal(run.grants.length, 0, `${JSON.stringify(options)} must grant no credits`);
    assert.equal(run.state.player.researchPoints, 0);
    assert.equal(burstDropOf(run), null, 'no physical chip burst appears');
    run.sim.dispose();
  }
});

test('authored kill-style metadata on the victim cannot buy a multiplier', () => {
  const run = bootRewardKill({
    shipClass: 'gunship',
    bountyCr: 200,
    loot: AUTHORED_LOOT,
    extraData: {
      killStyle: 'ram',
      style: 'terrain_smash',
      styleMultiplier: 4,
      chainDepth: 9,
      presentation: { cause: 'terrain_collision', multiplier: 3, style: { id: 'chain', multiplier: 4 } },
    },
  });
  assert.deepEqual(creditsFor(run, 'bounty'), [200], 'a claimed style pays nothing extra');
  assert.deepEqual(creditsFor(run, 'loot'), [500]);
  assert.equal(run.research[0].amount, 3);
  run.sim.dispose();
});

test('no style, multiplier, or chain metadata is written onto entity data', () => {
  const run = bootRewardKill({
    shipClass: 'gunship', bountyCr: 200, loot: AUTHORED_LOOT, zone: KILL_ZONE_ATMOSPHERE_BURN,
  });
  for (const key of [
    'style', 'killStyle', 'styleMultiplier', 'rewardMultiplier',
    'killCause', 'chainDepth', 'presentation',
  ]) {
    assert.equal(Object.hasOwn(run.target.data, key), false,
      `${key} must never be stamped on serialized entity data`);
    assert.equal(Object.hasOwn(run.target, key), false);
  }
  assert.equal(Object.hasOwn(run.state.player, 'styleMultiplier'), false);
  run.sim.dispose();
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function withImpulseConsequences(fn) {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try { return fn(); }
  finally { COMBAT_FLAGS.weaponImpulseConsequences = previous; }
}

function withLootFlags(fn) {
  const prior = { enabled: MASSLINE2_FLAGS.enabled, lootShards: MASSLINE2_FLAGS.lootShards };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  try { return fn(); }
  finally {
    MASSLINE2_FLAGS.enabled = prior.enabled;
    MASSLINE2_FLAGS.lootShards = prior.lootShards;
  }
}

function ship(id, options = {}) {
  const team = options.team ?? 1;
  const x = options.x ?? 10;
  const z = options.z ?? -4;
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: `faction_${team}`,
    pos: { x, z },
    prevPos: { x, z },
    vel: { x: options.vx ?? 0, z: options.vz ?? 0 },
    rot: 0,
    angVel: 0,
    radius: options.radius ?? 8,
    mass: options.mass ?? 20,
    hull: options.hull ?? 1,
    hullMax: options.hullMax ?? options.hull ?? 1,
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
      combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1, ramDamageDealtMult: 0 },
    },
  };
}

function collisionState(list) {
  const entities = new Map(list.map((entity) => [entity.id, entity]));
  return {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: list[0].id,
    player: { targetId: null },
    meta: { seed: 47 },
    settings: {
      gameplay: { difficulty: 'standard' },
      video: { particleQuality: 'low', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    content: {},
    combat: { entities: {}, beams: [] },
    entities,
    entityList: [...entities.values()],
  };
}

/** A live combat + collisionConsequences pair over one hand-built contact table. */
function liveContactRun(list) {
  const state = collisionState(list);
  const bus = createBus();
  const kills = [];
  bus.on('entity:killed', (payload) => kills.push(payload));
  const combatSystem = Object.create(combat);
  combatSystem.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const contacts = Object.create(collisionConsequences);
  contacts.init({
    state,
    bus,
    registry: { get(name) { return name === 'combat' ? combatSystem : null; } },
  });
  return {
    state,
    bus,
    kills,
    impact({ aId, bId, pos, normal, tickOffset = 0 }) {
      bus.emit('physics:impact', {
        consequenceKernelVersion: 1,
        tick: state.tick + tickOffset,
        aId,
        bId,
        impulse: 5000,
        pos,
        normal,
      });
    },
    dispose() {
      contacts.destroy();
      bus.clear();
    },
  };
}

/** Put a body into a real, readable tumble episode through the shared status owner. */
function makeTumbling(state, entity, { startedAt = 0, until = 4 } = {}) {
  const runtime = ensureCombatant(state, entity, CATALOG);
  if (!runtime.statuses || typeof runtime.statuses !== 'object') runtime.statuses = {};
  runtime.statuses[TUMBLE_STATUS_ID] = {
    id: TUMBLE_STATUS_ID,
    stacks: 1,
    expiresTick: Math.ceil(until * 60),
    data: {
      kind: COLLISION_TUMBLE_KIND,
      source: 'collision',
      cause: 'terrain',
      startedAt,
      until,
      spin: 2.2,
    },
  };
  return runtime;
}

function bootRewardKill({
  zone = null,
  shipClass = 'gunship',
  bountyCr = 0,
  loot = null,
  hostile = true,
  playerKill = true,
  missionTarget = false,
  extraData = {},
} = {}) {
  const sim = createSimulation({ seed: 0xac08, systems: [missions, lootShards, combat] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';

  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel', fittings: [] },
  });
  state.playerId = player.id;
  state.player.researchPoints = 0;

  const target = sim.spawn({
    type: 'ship', team: hostile ? 1 : 2, factionId: 'faction_reach',
    pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, hull: 40, hullMax: 40,
    data: {
      shipClass,
      encounter: hostile,
      worldRecordId: `ac08-${shipClass}`,
      ...(bountyCr ? { bountyCr } : {}),
      ...(loot ? { loot } : {}),
      ...(missionTarget ? { missionId: 'ac08_reserved', missionPinned: true } : {}),
      ...extraData,
    },
  });

  const grants = [];
  const drops = [];
  const research = [];
  bus.on('economy:grantCredits', (payload) => grants.push(structuredClone(payload)));
  bus.on('loot:drop', (payload) => drops.push(structuredClone(payload)));
  bus.on('research:grant', (payload) => research.push(structuredClone(payload)));

  const killer = playerKill ? player : sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 20, z: 0 },
    hull: 20, hullMax: 20, data: { encounter: true },
  });
  withLootFlags(() => registry.get('combat').kill(target, killer.id, zone ? { zone } : {}));

  return { sim, state, bus, registry, player, target, grants, drops, research };
}

/**
 * One reward kill, fully extracted before its simulation is disposed. Never leaves two live sims
 * over the same module-singleton systems, so a comparison reads two independent, settled results.
 */
function rewardOutcome(zone = null) {
  const run = bootRewardKill({
    shipClass: 'gunship', bountyCr: 200, loot: AUTHORED_LOOT, zone,
  });
  const outcome = {
    research: run.research.map((grant) => ({ ...grant })),
    researchPoints: run.state.player.researchPoints,
    xp: run.state.player.xp,
    bounty: creditsFor(run, 'bounty'),
    loot: creditsFor(run, 'loot'),
    burst: burstDropOf(run),
    authored: authoredDropOf(run),
  };
  run.sim.dispose();
  assert.ok(outcome.burst, 'a player-earned hostile kill must produce the physical chip burst');
  assert.ok(outcome.authored, 'the authored loot receipt must be published');
  return outcome;
}

function creditsFor(run, reason) {
  return run.grants.filter((grant) => grant.reason === reason).map((grant) => grant.amount);
}

/** The AC-01 physical burst — the only drop carrying credit chips. */
function burstDropOf(run) {
  return run.drops.find((drop) => (
    Array.isArray(drop.items) && drop.items.some(isCreditChipItem)
  )) || null;
}

/** The authored combat loot receipt — the only drop carrying a top-level credits field. */
function authoredDropOf(run) {
  return run.drops.find((drop) => drop.credits != null) || null;
}
