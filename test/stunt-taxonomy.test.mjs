// test/stunt-taxonomy.test.mjs — Stunt grammar and trick taxonomy tests (PQ-146.00).
//
// Done when:
//   - >= 12 tricks detected deterministically in scenarios
//   - Each detected trick has a verified cause chain (who threw, what hit, what it hit next)
//   - False-positive rate < 5% on ordinary flight tapes

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStuntDetector,
  StuntDetector,
  STUNT_SCHEMA_VERSION,
  TrickRarity,
  TRICK_DEFINITIONS,
  KNOWN_TRICK_IDS,
  STUNT_CONSTANTS,
} from '../src/combat/stuntTaxonomy.js';
import { stuntGrammar, MAX_RECENT_TRICKS } from '../src/systems/stuntGrammar.js';
import { createBus } from '../src/core/eventBus.js';

test('stunt taxonomy exports and schema constants', () => {
  assert.equal(STUNT_SCHEMA_VERSION, 1);
  assert.ok(Array.isArray(KNOWN_TRICK_IDS));
  assert.ok(KNOWN_TRICK_IDS.length >= 12, `Must define >= 12 tricks, found ${KNOWN_TRICK_IDS.length}`);

  for (const id of KNOWN_TRICK_IDS) {
    const def = TRICK_DEFINITIONS[id];
    assert.ok(def, `Definition must exist for ${id}`);
    assert.equal(def.id, id);
    assert.ok(typeof def.name === 'string' && def.name.length > 0);
    assert.ok(typeof def.baseScore === 'number' && def.baseScore > 0);
    assert.ok(Object.values(TrickRarity).includes(def.rarity));
  }
});

test('detects Razor Release with verified cause chain', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  const tricks = detector.processEvent('tether:releaseRated', {
    tick: 120,
    sourceId: 'player',
    targetId: 'rock_99',
    classification: 'razor',
    releaseScore: 0.92,
    angularSpeed: 4.5,
    tangentialSpeed: 42.0,
  });

  assert.equal(tricks.length, 1);
  const trick = tricks[0];
  assert.equal(trick.trickId, 'razor_release');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'rock_99');
  assert.equal(trick.metrics.releaseScore, 0.92);
  assert.ok(trick.causeChain.length >= 2);
  assert.equal(trick.causeChain[0].type, 'tether_spin');
  assert.equal(trick.causeChain[1].type, 'razor_timing');
  assert.ok(Object.isFrozen(trick));
});

test('detects Wrecking Ball when slung mass impacts hostile', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  const tricks = detector.processEvent('tether:whipImpact', {
    tick: 240,
    sourceId: 'player',
    targetId: 'heavy_asteroid_1', // slung mass
    victimId: 'pirate_corvette',   // victim struck
    relSpeed: 58.5,
    mass: 45.0,
    momentum: 2632.5,
  });

  assert.equal(tricks.length, 1);
  const trick = tricks[0];
  assert.equal(trick.trickId, 'wrecking_ball');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'pirate_corvette');
  assert.deepEqual(trick.secondaryIds, ['heavy_asteroid_1']);
  assert.equal(trick.metrics.relSpeed, 58.5);
  assert.ok(trick.causeChain.length >= 2);
  assert.equal(trick.causeChain[0].step, 1);
  assert.equal(trick.causeChain[0].type, 'tether_whip');
  assert.equal(trick.causeChain[1].step, 2);
  assert.equal(trick.causeChain[1].type, 'whip_strike');
});

test('detects Clothesline when hostile crosses taut line', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  const tricks = detector.processEvent('massline:clothesline', {
    tick: 300,
    sourceId: 'player',
    victimId: 'scout_interceptor',
    anchorId: 'buoy_station',
    deltaV: 34.0,
  });

  assert.equal(tricks.length, 1);
  const trick = tricks[0];
  assert.equal(trick.trickId, 'clothesline');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'scout_interceptor');
  assert.deepEqual(trick.secondaryIds, ['buoy_station']);
  assert.equal(trick.metrics.deltaV, 34.0);
  assert.equal(trick.causeChain.length, 3);
  assert.equal(trick.causeChain[1].type, 'line_crossing');
  assert.equal(trick.causeChain[2].type, 'clothesline_arrest');
});

test('detects Rock Discovery when player-concussed enemy hits terrain', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  // 1. Player lands a concussion impulse on hostile
  detector.processEvent('combat:hitstunImpulse', {
    tick: 100,
    actorId: 'player',
    victimId: 'raider_wasp',
    weaponId: 'hornet_concussion',
    tag: 'weapon_shove',
    deltaV: 28.0,
  });

  // 2. Hostile violently slams into asteroid face
  const tricks = detector.processEvent('combat:collisionConsequence', {
    tick: 125,
    targetId: 'raider_wasp',
    otherId: 'asteroid_titan_04',
    surface: 'terrain',
    deltaV: 32.5,
    exchangedMomentum: 1250,
    impactDamage: 85,
    provenance: { actorId: 'player', tag: 'weapon_shove' },
  });

  assert.equal(tricks.length, 1);
  const trick = tricks[0];
  assert.equal(trick.trickId, 'rock_discovery');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'raider_wasp');
  assert.deepEqual(trick.secondaryIds, ['asteroid_titan_04']);
  assert.equal(trick.metrics.deltaV, 32.5);
  assert.equal(trick.causeChain[0].type, 'kinetic_impulse');
  assert.equal(trick.causeChain[1].type, 'rock_slam');
});

test('detects Bolas when slung projectile entangles multiple targets', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  // Player releases slung object
  detector.processEvent('tether:releaseRated', {
    tick: 200,
    sourceId: 'player',
    targetId: 'weighted_cable',
    classification: 'clean',
    releaseScore: 0.75,
    tangentialSpeed: 38.0,
  });

  // Slung object strikes first hostile and then second hostile
  const tricks = detector.processEvent('combat:collisionConsequence', {
    tick: 215,
    targetId: 'drone_beta',
    otherId: 'weighted_cable',
    surface: 'craft',
    deltaV: 22.0,
    exchangedMomentum: 800,
    provenance: { actorId: 'player' },
  });

  assert.ok(tricks.some((t) => t.trickId === 'bolas'));
  const bolas = tricks.find((t) => t.trickId === 'bolas');
  assert.equal(bolas.actorId, 'player');
  assert.equal(bolas.targetId, 'drone_beta');
  assert.deepEqual(bolas.secondaryIds, ['weighted_cable']);
  assert.equal(bolas.causeChain[0].type, 'tether_sling');
  assert.equal(bolas.causeChain[1].type, 'chain_strike');
});

test('detects Collateral when launched hostile strikes another craft', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  // Player shoves primary hostile
  detector.processEvent('combat:hitstunImpulse', {
    tick: 400,
    actorId: 'player',
    victimId: 'hostile_primary',
    deltaV: 25.0,
  });

  // Primary hostile smashes into secondary hostile
  const tricks = detector.processEvent('combat:collisionConsequence', {
    tick: 420,
    targetId: 'hostile_secondary',
    otherId: 'hostile_primary',
    surface: 'craft',
    deltaV: 18.0,
    exchangedMomentum: 950,
    provenance: { actorId: 'player' },
  });

  assert.ok(tricks.some((t) => t.trickId === 'collateral'));
  const trick = tricks.find((t) => t.trickId === 'collateral');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'hostile_secondary');
  assert.deepEqual(trick.secondaryIds, ['hostile_primary']);
  assert.equal(trick.causeChain[0].type, 'primary_action');
  assert.equal(trick.causeChain[1].type, 'secondary_collision');
});

test('detects Tow Kill when trailing towed mass eliminates enemy', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  // 1. Establish active tow
  detector.processEvent('tether:attached', {
    tick: 500,
    sourceId: 'player',
    targetId: 'heavy_ore_pod',
    isTow: true,
    relSpeed: 10,
  });

  // 2. Kill entity while towing
  const tricks = detector.processEvent('entity:killed', {
    tick: 540,
    id: 'pursuer_scout',
    killerId: 'player',
    cause: 'ship_collision',
  });

  assert.equal(tricks.length, 1);
  const trick = tricks[0];
  assert.equal(trick.trickId, 'tow_kill');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'pursuer_scout');
  assert.deepEqual(trick.secondaryIds, ['heavy_ore_pod']);
  assert.equal(trick.causeChain[0].type, 'active_tow');
  assert.equal(trick.causeChain[1].type, 'tow_destruction');
});

test('detects Dead Mans Mass when propelled wreck crushes living enemy', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  // Player gives impulse to dead wreck
  detector.processEvent('combat:hitstunImpulse', {
    tick: 600,
    actorId: 'player',
    victimId: 'derelict_hulk_8',
    weaponId: 'concussion_cannon',
    deltaV: 20.0,
  });

  // Derelict wreck crushes active enemy
  const tricks = detector.processEvent('combat:collisionConsequence', {
    tick: 625,
    targetId: 'living_enemy_corvette',
    otherId: 'derelict_hulk_8',
    surface: 'debris',
    otherType: 'wreck',
    deltaV: 26.0,
    exchangedMomentum: 1800,
    provenance: { actorId: 'player' },
  });

  assert.ok(tricks.some((t) => t.trickId === 'dead_mans_mass'));
  const trick = tricks.find((t) => t.trickId === 'dead_mans_mass');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'living_enemy_corvette');
  assert.deepEqual(trick.secondaryIds, ['derelict_hulk_8']);
  assert.equal(trick.causeChain[0].type, 'wreck_propulsion');
  assert.equal(trick.causeChain[1].type, 'derelict_crush');
});

test('detects Well Golf when gravity singularity hurls entity into target', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  // Deploy gravity well
  detector.processEvent('well:fling', {
    tick: 700,
    actorId: 'player',
    wellId: 'singularity_vortex_1',
    targetId: 'propelled_rock',
  });

  // Flung entity slams into enemy
  const tricks = detector.processEvent('combat:collisionConsequence', {
    tick: 730,
    targetId: 'hostile_frigate',
    otherId: 'propelled_rock',
    surface: 'craft',
    deltaV: 35.0,
    exchangedMomentum: 2100,
    provenance: { actorId: 'player' },
  });

  assert.ok(tricks.some((t) => t.trickId === 'well_golf'));
  const trick = tricks.find((t) => t.trickId === 'well_golf');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'hostile_frigate');
  assert.equal(trick.causeChain[0].type, 'well_deploy');
  assert.equal(trick.causeChain[1].type, 'well_fling');
  assert.equal(trick.causeChain[2].type, 'target_impact');
});

test('detects Near Miss on high speed close obstacle pass', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  const tricks = detector.processEvent('flight:nearMiss', {
    tick: 800,
    actorId: 'player',
    obstacleId: 'station_spindle',
    speed: 72.0,
    clearance: 3.2,
  });

  assert.equal(tricks.length, 1);
  const trick = tricks[0];
  assert.equal(trick.trickId, 'near_miss');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'station_spindle');
  assert.equal(trick.metrics.speed, 72.0);
  assert.equal(trick.metrics.clearance, 3.2);
  assert.equal(trick.causeChain[0].type, 'high_speed_approach');
  assert.equal(trick.causeChain[1].type, 'clean_clearance');
});

test('detects Snap Catch on high speed reactive latch', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  const tricks = detector.processEvent('tether:snapCatch', {
    tick: 850,
    sourceId: 'player',
    targetId: 'incoming_missile_hull',
    relSpeed: 48.0,
  });

  assert.equal(tricks.length, 1);
  const trick = tricks[0];
  assert.equal(trick.trickId, 'snap_catch');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'incoming_missile_hull');
  assert.equal(trick.metrics.relSpeed, 48.0);
  assert.equal(trick.causeChain[0].type, 'incoming_fast_mass');
  assert.equal(trick.causeChain[1].type, 'reaction_latch');
});

test('detects Shove Bowling when concussion weapon launches enemy into another', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  detector.processEvent('combat:hitstunImpulse', {
    tick: 900,
    actorId: 'player',
    victimId: 'front_gunship',
    weaponId: 'hornet_concussion_shove',
    tag: 'weapon_shove',
    deltaV: 30.0,
  });

  const tricks = detector.processEvent('combat:collisionConsequence', {
    tick: 920,
    targetId: 'rear_gunship',
    otherId: 'front_gunship',
    surface: 'craft',
    deltaV: 24.0,
    exchangedMomentum: 1100,
    provenance: { actorId: 'player', weaponId: 'hornet_concussion_shove' },
  });

  assert.ok(tricks.some((t) => t.trickId === 'shove_bowling'));
  const trick = tricks.find((t) => t.trickId === 'shove_bowling');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'rear_gunship');
  assert.deepEqual(trick.secondaryIds, ['front_gunship']);
  assert.equal(trick.causeChain[0].type, 'concussion_shove');
  assert.equal(trick.causeChain[1].type, 'bowling_strike');
});

test('detects Bank Shot when slung projectile ricochets off terrain into enemy', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  // 1. Launch projectile
  detector.processEvent('tether:releaseRated', {
    tick: 1000,
    sourceId: 'player',
    targetId: 'dense_iron_slug',
    classification: 'clean',
    releaseScore: 0.7,
    tangentialSpeed: 40.0,
  });

  // 2. Slug bounces off terrain
  detector.processEvent('combat:collisionConsequence', {
    tick: 1020,
    targetId: 'dense_iron_slug',
    otherId: 'asteroid_canyon_wall',
    surface: 'terrain',
    deltaV: 18.0,
    exchangedMomentum: 900,
    provenance: { actorId: 'player' },
  });

  // 3. Slug ricochets into hostile hiding behind corner
  const tricks = detector.processEvent('combat:collisionConsequence', {
    tick: 1045,
    targetId: 'hidden_raider',
    otherId: 'dense_iron_slug',
    surface: 'craft',
    deltaV: 22.0,
    exchangedMomentum: 1100,
    provenance: { actorId: 'player' },
  });

  assert.ok(tricks.some((t) => t.trickId === 'bank_shot'));
  const trick = tricks.find((t) => t.trickId === 'bank_shot');
  assert.equal(trick.actorId, 'player');
  assert.equal(trick.targetId, 'hidden_raider');
  assert.deepEqual(trick.secondaryIds, ['dense_iron_slug', 'asteroid_canyon_wall']);
  assert.equal(trick.causeChain[0].type, 'sling_throw');
  assert.equal(trick.causeChain[1].type, 'wall_rebound');
  assert.equal(trick.causeChain[2].type, 'rebound_strike');
});

test('deterministic reproduction across repeat trace processing', () => {
  const sampleTrace = [
    { type: 'tether:releaseRated', tick: 50, sourceId: 'player', targetId: 'rock_A', classification: 'razor', releaseScore: 0.95, angularSpeed: 5.0, tangentialSpeed: 50.0 },
    { type: 'tether:whipImpact', tick: 70, sourceId: 'player', targetId: 'rock_A', victimId: 'enemy_1', relSpeed: 60.0, mass: 30.0, momentum: 1800.0 },
    { type: 'flight:nearMiss', tick: 120, actorId: 'player', obstacleId: 'asteroid_mega', speed: 80.0, clearance: 2.5 },
    { type: 'tether:snapCatch', tick: 180, sourceId: 'player', targetId: 'flung_pod', relSpeed: 35.0 },
    { type: 'combat:hitstunImpulse', tick: 240, actorId: 'player', victimId: 'enemy_2', weaponId: 'shove', deltaV: 25.0 },
    { type: 'combat:collisionConsequence', tick: 260, targetId: 'enemy_2', otherId: 'asteroid_wall', surface: 'terrain', deltaV: 28.0, exchangedMomentum: 1000, provenance: { actorId: 'player' } },
  ];

  const detector1 = createStuntDetector({ playerId: 'player' });
  const tricks1 = detector1.processTrace(sampleTrace);

  const detector2 = createStuntDetector({ playerId: 'player' });
  const tricks2 = detector2.processTrace(sampleTrace);

  assert.equal(tricks1.length, tricks2.length);
  assert.ok(tricks1.length >= 4);

  for (let i = 0; i < tricks1.length; i++) {
    assert.deepEqual(tricks1[i], tricks2[i], `Mismatch at index ${i}`);
  }
});

test('false-positive rate on ordinary flight tapes is strictly below 5% (0% verified)', () => {
  const detector = createStuntDetector({ playerId: 'player' });

  // Generate 1,000 ordinary flight events:
  // - Cruising speed (15 - 25 wu/s)
  // - Low-speed clearances (> 15 wu clearance or slow speed < 30 wu/s)
  // - Minor scrapes / bumps (deltaV < 5 wu/s, low momentum)
  // - Standard messy or good unlatching (not razor)
  // - Mining beam tick events
  // - Ordinary traffic passing by
  const ordinaryFlightEvents = [];
  for (let tick = 1; tick <= 1000; tick++) {
    if (tick % 50 === 0) {
      // Normal minor bump on asteroid while docking/mining
      ordinaryFlightEvents.push({
        type: 'combat:collisionConsequence',
        tick,
        targetId: 'player',
        otherId: `asteroid_dock_${tick}`,
        surface: 'terrain',
        deltaV: 1.5 + (tick % 3), // 1.5 - 3.5 wu/s, gentle
        exchangedMomentum: 40 + tick % 20,
        provenance: { actorId: 'player', tag: 'direct_contact' },
      });
    }

    if (tick % 40 === 0) {
      // Normal flight passing an asteroid at regular speed (20 wu/s)
      ordinaryFlightEvents.push({
        type: 'flight:nearMiss',
        tick,
        actorId: 'player',
        obstacleId: `rock_${tick}`,
        speed: 18.0 + (tick % 5), // cruising, well below high-speed threshold
        clearance: 12.0,          // wide clearance
      });
    }

    if (tick % 100 === 0) {
      // Ordinary unlatch of a cargo box at a station
      ordinaryFlightEvents.push({
        type: 'tether:releaseRated',
        tick,
        sourceId: 'player',
        targetId: `cargo_pallet_${tick}`,
        classification: 'messy',
        releaseScore: 0.22,
        angularSpeed: 0.1,
        tangentialSpeed: 4.0,
      });
    }

    if (tick % 75 === 0) {
      // Two NPC traffic haulers passing each other
      ordinaryFlightEvents.push({
        type: 'combat:collisionConsequence',
        tick,
        targetId: `traffic_freighter_${tick}`,
        otherId: `traffic_miner_${tick}`,
        surface: 'craft',
        deltaV: 0.8,
        exchangedMomentum: 50,
        provenance: { actorId: null, tag: 'environment' },
      });
    }
  }

  const detected = detector.processTrace(ordinaryFlightEvents);
  const falsePositiveCount = detected.length;
  const falsePositiveRate = falsePositiveCount / ordinaryFlightEvents.length;

  assert.equal(
    falsePositiveCount,
    0,
    `Ordinary flight must produce 0 false-positive tricks, found ${falsePositiveCount}`,
  );
  assert.ok(
    falsePositiveRate < 0.05,
    `False positive rate must be < 5%, measured ${(falsePositiveRate * 100).toFixed(2)}%`,
  );
});

test('stuntGrammar system observes bus events and records recent tricks', () => {
  const bus = createBus();
  const state = {
    playerId: 'player_hero',
    stunts: null,
  };

  stuntGrammar.init({ bus, state });
  stuntGrammar.update(state, 0.016);

  assert.ok(state.stunts);
  assert.equal(state.stunts.totalTricksDetected, 0);
  assert.equal(state.stunts.recentTricks.length, 0);

  let busEmitReceived = null;
  bus.on('stunt:trickDetected', (trick) => {
    busEmitReceived = trick;
  });

  // Emit a razor release on the bus
  bus.emit('tether:releaseRated', {
    tick: 60,
    sourceId: 'player_hero',
    targetId: 'asteroid_gem',
    classification: 'razor',
    releaseScore: 0.90,
    angularSpeed: 4.2,
    tangentialSpeed: 45.0,
  });

  assert.ok(busEmitReceived);
  assert.equal(busEmitReceived.trickId, 'razor_release');
  assert.equal(busEmitReceived.actorId, 'player_hero');
  assert.equal(state.stunts.totalTricksDetected, 1);
  assert.equal(state.stunts.recentTricks.length, 1);
  assert.equal(state.stunts.recentTricks[0].trickId, 'razor_release');

  stuntGrammar.destroy();
});
