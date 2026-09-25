// Wave F §22.8 row F6 — "Credit chips can be thrown."
//
// The credit reward of a hostile kill is a physical chip body, not a number that appears.
// A bounded count of chip pickups bursts out of the wreck on eject velocity; each chip is a
// light Massline-latchable body for a short life (finite despawn, never save-persisted).
// The Massline can latch, swing and release a chip; the credit amount is unchanged until
// the chip is collected, and the ledger pays exactly once however the receipt repeats.
//
// This fixture drives the real sim path end to end at a fixed seed:
//   combat.kill → lootShards kill burst (loot:drop) → mining._spawnLootBurstPickup
//   → physics integrate/contact → mining._collectCreditChip → economy:grantCredits.
// The latch/swing/release clause runs under the production SG-02 dynamic authority
// (mode 'rapier-dynamic'), the same runtime the live tether attachment service drives.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { physics } from '../src/core/physics.js';
import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import {
  CREDIT_CHIP_KIND,
  KILL_REWARD_RECIPES,
} from '../src/data/killRewards.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { lootShards } from '../src/systems/lootShards.js';
import { isMasslineLatchedPickup, mining } from '../src/systems/mining.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const SEED = 0xf601;
const DT = 1 / 60;

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

function chipPickupsOf(state) {
  return state.entityList.filter((e) => (
    e.type === 'pickup' && e.alive !== false && e.data && e.data.kind === CREDIT_CHIP_KIND
  ));
}

function creditChipGrants(grants) {
  return grants.filter((g) => String(g && g.reason || '').startsWith('kill:credit_chip'));
}

// The kill lands far outside the 800 WU magnet so the burst's flight is pure eject
// ballistics until the fixture chooses to bring a chip home.
function bootKill({ victimPos = { x: 900, z: 0 }, worldRecordId = 'wave-f6-victim' } = {}) {
  const sim = createSimulation({
    seed: SEED,
    systems: [economy, lootShards, mining, cargo, combat, physics],
  });
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  // Headless integrate() path (pos += vel*dt) for the free-flight phase; the production
  // rapier-dynamic authority is exercised directly for the latch/throw phase below.
  state.settings.gameplay.physicsBackend = 'custom';

  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 4, mass: 26, hull: 100, hullMax: 100,
    physicsBody: { schemaVersion: 1, radius: 4, mass: 26, inertiaY: 64, dynamic: true, ccd: true, revision: 0 },
    data: { defId: 'ship_kestrel', derived: { masslineHeadId: 'tractor' } },
  });
  state.playerId = player.id;
  registry.get('economy').newGame();
  state.player.credits = 0;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 0 };

  const grants = [];
  bus.on('economy:grantCredits', (p) => grants.push(structuredClone(p)));

  const victim = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x: victimPos.x, z: victimPos.z }, vel: { x: 80, z: 20 },
    hull: 40, hullMax: 40,
    data: { shipClass: 'fighter', encounter: true, worldRecordId },
  });
  withLootFlags(() => registry.get('combat').kill(victim, player.id));
  return { sim, state, bus, registry, player, victim, grants };
}

test('a kill throws a bounded count of physical credit chips that fly and settle into the ledger exactly once', () => {
  const { sim, state, bus, player, grants } = bootKill();

  // Bounded count, never per-credit: the light recipe throws exactly one chip body, and the
  // richest recipe on the table still throws at most three for a payout of hundreds.
  const chips = chipPickupsOf(state);
  assert.equal(chips.length, KILL_REWARD_RECIPES.light.creditChips.count);
  assert.ok(chips.length <= 3);
  assert.ok(Math.max(...Object.values(KILL_REWARD_RECIPES).map((r) => r.creditChips.count)) <= 3,
    'no payout size can mint an unbounded chip swarm');

  const chip = chips[0];
  const chipAmount = chip.data.credits;
  const light = KILL_REWARD_RECIPES.light.creditChips;
  assert.ok(chipAmount >= light.amountMin && chipAmount <= light.amountMax,
    `chip amount ${chipAmount} inside the recipe band`);
  assert.equal(chip.data.amount, chipAmount);

  // Nothing is paid at the kill: the reward is the body, not a ledger write.
  assert.equal(state.player.credits, 0);
  assert.equal(creditChipGrants(grants).length, 0);

  // A short life: finite despawn, and no save persistence flag — chips are world ephemera.
  assert.ok(Number.isFinite(chip.data.despawnAt), 'chip carries a finite despawn');
  assert.ok(!chip.flags || chip.flags.persistent !== true, 'chips are never persisted');

  // Light: far under the hull that would swing it.
  assert.ok(chip.mass < player.mass, `chip mass ${chip.mass} stays under ship mass ${player.mass}`);

  // Physical: eject velocity is real and positions move over sim ticks.
  const ejectSpeed = Math.hypot(chip.vel.x, chip.vel.z);
  assert.ok(ejectSpeed > 0, 'chip spawns with eject velocity');
  const before = { x: chip.pos.x, z: chip.pos.z };
  sim.runTicks(30);
  const travelled = Math.hypot(chip.pos.x - before.x, chip.pos.z - before.z);
  assert.ok(travelled > ejectSpeed * DT * 30 * 0.5,
    `chip flew ${travelled.toFixed(2)} WU under real integration`);
  assert.equal(chip.alive, true);
  assert.equal(state.player.credits, 0, 'still unpaid mid-flight');
  assert.equal(creditChipGrants(grants).length, 0);

  // The chip is a legal Massline target on arrival.
  assert.equal(isAttachable(chip, player.id), true);

  // Collection: bring the chip into scoop range and let the real contact/overlap path
  // terminate the body into the credit receipt.
  chip.pos.x = player.pos.x + 4;
  chip.pos.z = player.pos.z;
  chip.vel.x = 0;
  chip.vel.z = 0;
  sim.step();
  assert.equal(state.player.credits, chipAmount, 'the scoop settles the chip into the ledger');
  assert.equal(chip.alive, false, 'the body is consumed by collection');
  const chipGrants = creditChipGrants(grants);
  assert.equal(chipGrants.length, 1, 'exactly one chip grant');
  assert.equal(chipGrants[0].amount, chipAmount);
  assert.equal(chipGrants[0].reason, chip.data.grantReason);

  // The ledger lands exactly once: a repeated collection receipt cannot double-pay.
  bus.emit('pickup:collected', {
    pickupId: chip.id, collectorId: player.id, kind: CREDIT_CHIP_KIND,
    amount: chipAmount, credits: chipAmount,
    pos: { x: chip.pos.x, z: chip.pos.z },
  });
  sim.runTicks(5);
  assert.equal(state.player.credits, chipAmount);
  assert.equal(creditChipGrants(grants).length, 1);

  sim.dispose();
});

test('a latched chip is not vacuumed, survives the swing, and still pays once on collection', async () => {
  const { sim, state, bus, player, grants } = bootKill({ worldRecordId: 'wave-f6-victim-throw' });
  const chip = chipPickupsOf(state)[0];
  assert.ok(chip, 'the kill must throw a chip');
  const chipAmount = chip.data.credits;
  assert.equal(state.player.credits, 0);

  // Bring it inside magnet range: a latched chip in the pull must not be vacuumed.
  chip.pos.x = player.pos.x + 100;
  chip.pos.z = player.pos.z;
  chip.vel.x = 0;
  chip.vel.z = 45;
  const speedBefore = Math.hypot(chip.vel.x, chip.vel.z);

  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([player, chip]);
    const policy = effectiveTetherPolicy(
      ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard'),
      player,
      PRODUCTION_FEATURES,
    );
    const handle = runtime.createAttachment({
      attachmentId: 'wave-f6-chip', defId: 'tether_standard',
      ownerId: player.id, targetId: chip.id,
      sourceWorld: player.pos, targetWorld: chip.pos,
      restLength: 80, spring: policy.spring, tick: state.tick,
    });
    assert.ok(handle, 'the Massline latches the chip body');

    // Mirror the latch into the combat-attachments authority the sim reads — production
    // writes this record through the attachment service on the same latch.
    state.combat = state.combat || {};
    state.combat.attachments = state.combat.attachments || { byId: {}, nextId: 1 };
    state.combat.attachments.byId['wave-f6-chip'] = {
      id: 'wave-f6-chip', ownerId: player.id, targetId: chip.id,
      state: 'active', defId: 'tether_standard',
    };
    assert.equal(isMasslineLatchedPickup(state, player, chip), true);

    // While roped, ordinary sim ticks neither vacuum nor collect it — the throw stays possible.
    sim.runTicks(10);
    assert.equal(chip.alive, true, 'a roped chip is not scooped out from under the line');
    assert.equal(state.player.credits, 0);
    assert.equal(creditChipGrants(grants).length, 0);

    // Swing and release under the production authority: the chip's speed must change.
    for (let tick = 0; tick < 60; tick += 1) runtime.step(DT);
    for (let i = 0; i < 10; i += 1) {
      runtime.setAttachmentReel({ attachmentId: 'wave-f6-chip', restLength: 80 - 50 * ((i + 1) / 10) });
      for (let tick = 0; tick < 12; tick += 1) runtime.step(DT);
    }
    for (let tick = 0; tick < 90; tick += 1) runtime.step(DT);
    runtime.cutAttachment({ attachmentId: 'wave-f6-chip' });
    for (let tick = 0; tick < 30; tick += 1) runtime.step(DT);

    const speedAfter = Math.hypot(chip.vel.x, chip.vel.z);
    assert.ok(Math.abs(speedAfter - speedBefore) >= 20,
      `the throw changes chip speed (got ${speedBefore.toFixed(1)} -> ${speedAfter.toFixed(2)})`);
    assert.equal(chip.alive, true, 'the throw does not destroy the chip');
    assert.equal(chip.data.credits, chipAmount, 'the chip keeps its value through the swing');
    assert.equal(state.player.credits, 0, 'a swung chip is still unpaid');
    assert.equal(creditChipGrants(grants).length, 0);
    console.log(`WAVE_F6_CHIP_THROW speedBefore=${speedBefore.toFixed(1)} speedAfter=${speedAfter.toFixed(2)} amount=${chipAmount}`);

    // Rope gone: the same body still settles into the ledger, exactly once.
    state.combat.attachments.byId['wave-f6-chip'].state = 'broken';
    assert.equal(isMasslineLatchedPickup(state, player, chip), false);
    chip.pos.x = player.pos.x + 4;
    chip.pos.z = player.pos.z;
    chip.vel.x = 0;
    chip.vel.z = 0;
    sim.step();
    assert.equal(state.player.credits, chipAmount);
    assert.equal(chip.alive, false);
    assert.equal(creditChipGrants(grants).length, 1);

    bus.emit('pickup:collected', {
      pickupId: chip.id, collectorId: player.id, kind: CREDIT_CHIP_KIND,
      amount: chipAmount, credits: chipAmount,
      pos: { x: chip.pos.x, z: chip.pos.z },
    });
    sim.runTicks(5);
    assert.equal(state.player.credits, chipAmount, 'a repeated receipt cannot double-pay');
    assert.equal(creditChipGrants(grants).length, 1);
  } finally {
    runtime.dispose();
    sim.dispose();
  }
});
