// Plan 02 — deployed Well inner-band capture is a live physical kill producer.
import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { FIELD_DEFS, FIELD_FLAGS } from '../src/data/fields.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { creditChipItemsOf, materialItemsOf } from '../src/data/killRewards.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { fields } from '../src/systems/fields.js';
import { lootShardItemsFor, lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';

function shipSpec({ team, x, z, hull, mass, worldRecordId = null }) {
  return {
    type: 'ship', team,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 6, collides: true, hull, hullMax: hull,
    armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
    flightModel: { inertia: mass * 2 },
    physicsBody: {
      schemaVersion: 1, radius: 6, mass, inertiaY: mass * 2,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      shipClass: 'fighter',
      encounter: team === 1,
      worldRecordId,
    },
  };
}

function distanceTo(point, entity) {
  return Math.hypot(entity.pos.x - point.x, entity.pos.z - point.z);
}

test('a real Well pulls a hostile into its inner band, kills silently, and pays the styled chip on collection', async () => {
  const prior = {
    fields: FIELD_FLAGS.enabled,
    massline2: MASSLINE2_FLAGS.enabled,
    lootShards: MASSLINE2_FLAGS.lootShards,
  };
  FIELD_FLAGS.enabled = true;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  const seed = 0xac0202;
  const sim = createSimulation({
    seed,
    systems: [economy, cargo, fields, physics, combat, lootShards, mining],
  });
  const { state, bus } = sim;
  const physicsSystem = sim.registry.get('physics');
  let prepared = false;
  try {
    state.mode = 'flight';
    state.input.actions = {};
    const player = sim.spawn(shipSpec({ team: 0, x: 0, z: 0, hull: 200, mass: 28 }));
    state.playerId = player.id;
    state.player.credits = 0;
    state.player.cargo = {
      items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 200,
    };
    const hostile = sim.spawn(shipSpec({
      team: 1, x: 300, z: 90, hull: 12, mass: 6,
      worldRecordId: 'plan02-well-collapse-victim',
    }));
    const friendly = sim.spawn(shipSpec({ team: 0, x: 300, z: 10, hull: 30, mass: 6 }));
    const baseItems = lootShardItemsFor(seed, hostile);

    let deployed = null;
    const damage = [];
    const kills = [];
    const drops = [];
    const grants = [];
    bus.on('fields:deployed', (payload) => { if (payload?.kind === 'well') deployed = structuredClone(payload); });
    bus.on('combat:damage', (payload) => {
      if (payload?.targetId === hostile.id) {
        damage.push({ ...structuredClone(payload), radius: deployed ? distanceTo(deployed.center, hostile) : Infinity });
      }
    });
    bus.on('entity:killed', (payload) => { if (payload?.id === hostile.id) kills.push(structuredClone(payload)); });
    bus.on('loot:drop', (payload) => { if (payload?.source === 'kill_burst') drops.push(structuredClone(payload)); });
    bus.on('economy:grantCredits', (payload) => grants.push(structuredClone(payload)));

    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    prepared = await physicsSystem.prepareBackend(state, { reset: true });
    assert.equal(prepared, true, 'the live SG-02 owner starts');

    state.input.aimWorld = { x: 300, z: 0 };
    state.input.actions.deployWell = true;
    sim.step(SIM_DT);
    assert.ok(deployed, 'the normal deploy input creates the Well');
    assert.equal(state.input.actions.deployWell, false);

    const startDistance = distanceTo(deployed.center, hostile);
    let minDistance = startDistance;
    while (hostile.alive !== false && state.simTime < 6) {
      sim.step(SIM_DT);
      minDistance = Math.min(minDistance, distanceTo(deployed.center, hostile));
    }
    assert.equal(hostile.alive, false,
      `the field-created trajectory reaches a terminal capture (minimum radius ${minDistance.toFixed(2)} WU, `
      + `hull ${hostile.hull}, damage receipts ${damage.length})`);
    assert.ok(startDistance > FIELD_DEFS.well.innerBandRadius);
    assert.ok(minDistance <= FIELD_DEFS.well.innerBandRadius,
      `the body physically enters the authored inner band (${minDistance.toFixed(2)} WU)`);
    assert.equal(damage.length, 1, 'one inner-band entry owns one crush pulse');
    assert.ok(damage[0].radius <= FIELD_DEFS.well.innerBandRadius);
    assert.equal(damage[0].origin.kind, 'field_well');
    assert.equal(friendly.hull, 30, 'the player Well does not damage a friendly body in the same core');

    assert.equal(kills.length, 1);
    assert.equal(kills[0].killerId, player.id);
    assert.equal(kills[0].presentation.style.id, 'well_collapse');
    assert.equal(kills[0].presentation.style.multiplier, 1.5);
    assert.equal(drops.length, 1);
    assert.deepEqual(materialItemsOf(drops[0].items), materialItemsOf(baseItems),
      'the cause changes value, never material substance');
    const baseChip = creditChipItemsOf(baseItems)[0];
    const styledChip = creditChipItemsOf(drops[0].items)[0];
    assert.equal(styledChip.credits, Math.round(baseChip.credits * 1.5));
    assert.equal(grants.length, 0, 'credits remain physical at death');

    const chip = state.entityList.find((entity) => (
      entity.type === 'pickup' && entity.data?.kind === 'credit_chip' && entity.alive !== false
    ));
    assert.ok(chip, 'the style payout exists as a physical chip');
    player.pos.x = chip.pos.x + 4;
    player.pos.z = chip.pos.z;
    player.vel.x = 0;
    player.vel.z = 0;
    sim.step(SIM_DT);
    assert.equal(chip.alive, false, 'the ordinary pickup owner settles the chip');
    assert.equal(state.player.credits, styledChip.credits);
    assert.equal(grants.length, 1);
  } finally {
    if (prepared && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
    FIELD_FLAGS.enabled = prior.fields;
    MASSLINE2_FLAGS.enabled = prior.massline2;
    MASSLINE2_FLAGS.lootShards = prior.lootShards;
  }
});
