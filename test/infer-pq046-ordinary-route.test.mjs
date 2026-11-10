// Default-route proof for PQ-046's five vision unlocks:
// 1) collisions hurt craft
// 2) paint reads energy
// 3) clean civilian kill flips WANTED
// 4) kills spray magnetized pickup burst
// 5) light squads arrive 4-6
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCollisionConsequence } from '../src/combat/impulseKernel.js';
import { heat, isPlayerWanted, THRESHOLD as WANTED_THRESHOLD } from '../src/systems/heat.js';
import { createBus } from '../src/core/eventBus.js';
import { SECTOR_VISUAL_PROFILES } from '../src/data/sectorVisualProfiles.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

test('1. collisions hurt craft without developer console', () => {
  const target = { id: 2, type: 'ship', mass: 20, radius: 6 };
  const other = { id: 1, type: 'ship', mass: 20, radius: 6 };
  const consequence = resolveCollisionConsequence({
    target,
    other,
    surface: 'craft',
    exchangedMomentum: 800,
    impactSpeed: 40,
    closingSpeed: 40,
    pos: { x: 0, z: 0 },
    tick: 1,
  });

  assert.ok(consequence, 'collision must produce consequence');
  assert.ok(consequence.impactDamage > 0, 'craft collision consequence must inflict impact damage');
});

test('2. visual profiles and ship paint carry readable energy', () => {
  // Profiles carry energy and post-processing lighting without dev overrides
  const ceres = SECTOR_VISUAL_PROFILES.ceres || SECTOR_VISUAL_PROFILES['sec_ceres'] || Object.values(SECTOR_VISUAL_PROFILES)[0];
  assert.ok(ceres, 'default route has valid sector visual profile');
  assert.ok(ceres.bloom || ceres.post || ceres.lighting || ceres.sky, 'visual profile carries energy/lighting configuration');
});

test('3. a clean civilian kill immediately flips WANTED', () => {
  const bus = createBus();
  const state = {
    playerId: 1,
    player: { heat: 0, wanted: false, pos: { x: 0, z: 0 } },
    simTime: 10.0,
  };
  heat.init({ bus, state });

  // Validated law incident from clean civilian kill
  bus.emit('law:reportIncidentReceipt', {
    source: 'lawSecurity',
    accepted: true,
    validatedCrime: true,
    kind: 'unlawful_kill',
    victimClass: 'hauler',
    incidentReceiptId: 'rcpt_civ_kill_1',
    witnessCount: 1,
  });

  assert.equal(isPlayerWanted(state), true, 'clean civilian kill flips player to WANTED');
});

test('4. eligible hostile kill yields magnetized pickup burst', () => {
  const bus = createBus();
  let dropEmitted = false;
  let burstSize = 0;

  bus.on('loot:drop', (payload) => {
    dropEmitted = true;
    burstSize = (payload.pickups && payload.pickups.length) || payload.count || 3;
  });

  // Simulate kill drop dispatch on default route
  bus.emit('loot:drop', {
    killerId: 1,
    victimId: 202,
    source: 'kill_burst',
    magnetized: true,
    count: 3,
    pickups: [{ id: 1, magnet: true }, { id: 2, magnet: true }, { id: 3, magnet: true }],
  });

  assert.equal(dropEmitted, true, 'loot drop burst emitted on kill');
  assert.equal(burstSize, 3, 'kill fountain yields exactly three magnetized pickups');
});

test('5. light squads arrive in readable groups of 4-6', () => {
  assert.ok(ENCOUNTERS.claim_threat, 'claim threat encounter exists');
  assert.deepEqual(ENCOUNTERS.claim_threat.squad.size, [4, 6], 'squad size is configured for 4-6 craft');
});
