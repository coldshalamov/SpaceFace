// U3 (WF-05): Tideline whole-wreck tractor skips picked-clean husks, unstable reactor
// wrecks, berth-consigned hulks, and wrecks currently latched on the player's Massline;
// repulsion-trap / heat-lure / charge-rack utility resolvers also read entity-level
// fittings when ownedShips is absent (Crucible / Swarm draft hulls) without leaking parked
// hulls.
import assert from 'node:assert/strict';
import test from 'node:test';

import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createSimulation } from '../src/core/sim.js';
import {
  heatLureFitted,
  repulsionTrapFitted,
  resolveImpulseChargeCapacity,
} from '../src/systems/impulseCharges.js';
import {
  isTidelineWholeWreckEligible,
  TIDELINE_MAGNET_ACCEL,
  uniqueLootAbilities,
} from '../src/systems/uniqueLootAbilities.js';

function bootTideline() {
  const sim = createSimulation({ seed: 4242, systems: [uniqueLootAbilities] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 10,
    mass: 40,
    hull: 100,
    hullMax: 100,
    data: {
      defId: 'ship_drifter',
      fittings: ['unique_tideline_tractor'],
    },
  });
  state.playerId = player.id;
  return { sim, state, player };
}

test('Tideline whole-wreck tractor pulls only salvage-bearing, non-reactor, non-berth, unlatched wrecks', () => {
  const { sim, state } = bootTideline();
  const richSmall = sim.spawn({
    type: 'wreck', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 80,
    data: { parentType: 'ship', salvagePool: { cmdty_scrap_metal: 3 } },
  });
  const pickedClean = sim.spawn({
    type: 'wreck', pos: { x: 400, z: 40 }, vel: { x: 0, z: 0 }, radius: 8, mass: 80,
    data: { parentType: 'ship', salvagePool: { cmdty_scrap_metal: 0 } },
  });
  const reactorWreck = sim.spawn({
    type: 'wreck', pos: { x: 400, z: -40 }, vel: { x: 0, z: 0 }, radius: 8, mass: 80,
    data: { parentType: 'reactor', unstableReactor: true, salvagePool: { cmdty_alloys: 2 } },
  });
  const berthHulk = sim.spawn({
    type: 'wreck', pos: { x: 400, z: 80 }, vel: { x: 0, z: 0 }, radius: 8, mass: 80,
    data: { parentType: 'ship', berthConsign: { berthId: 'berth_pitborn_consign_line' }, salvagePool: { cmdty_alloys: 2 } },
  });
  const latchedWreck = sim.spawn({
    type: 'wreck', pos: { x: 350, z: -80 }, vel: { x: 0, z: 0 }, radius: 8, mass: 80,
    data: { parentType: 'ship', salvagePool: { cmdty_scrap_metal: 2 } },
  });
  state.player.tether = { active: true, targetId: latchedWreck.id };

  assert.equal(isTidelineWholeWreckEligible(richSmall), true);
  assert.equal(isTidelineWholeWreckEligible(pickedClean), false, 'picked-clean husk is not pulled');
  assert.equal(isTidelineWholeWreckEligible(reactorWreck), false, 'unstable reactor is not pulled into the hull');
  assert.equal(isTidelineWholeWreckEligible(berthHulk), false, 'berth-consigned hulk is not pulled');

  sim.step(0.5);
  const richCmd = consumePhysicsCommand(richSmall);
  assert.ok(richCmd && richCmd.impulses && richCmd.impulses.length === 1);
  assert.ok(Math.abs(richCmd.impulses[0].x - (-TIDELINE_MAGNET_ACCEL * richSmall.mass * 0.5)) < 1e-4);
  assert.equal(consumePhysicsCommand(pickedClean), null, 'picked-clean husk gets no impulse');
  assert.equal(consumePhysicsCommand(reactorWreck), null, 'unstable reactor gets no impulse');
  assert.equal(consumePhysicsCommand(berthHulk), null, 'berth hulk gets no impulse');
  assert.equal(consumePhysicsCommand(latchedWreck), null, 'Massline-latched wreck is not fought by passive tractor');

  // Releasing the Massline allows the unlatched salvage-bearing wreck to be pulled on the next step
  state.player.tether = { active: false, targetId: null };
  sim.step(0.5);
  const unlatchedCmd = consumePhysicsCommand(latchedWreck);
  assert.ok(unlatchedCmd && unlatchedCmd.impulses && unlatchedCmd.impulses.length === 1,
    'once unlatched, the salvage-bearing small wreck is tractored normally');
});

test('repulsion trap, heat lure, and charge rack resolvers read entity-fitted draft hulls without leaking parked ships', () => {
  // Arena / draft hull where fittings live on the player entity (ownedShips empty)
  const draftState = {
    playerId: 7,
    player: { ownedShips: [] },
    entities: new Map([
      [7, { id: 7, type: 'ship', alive: true, data: { fittings: ['mod_repulsion_trap_s', 'mod_heat_lure_s', 'mod_charge_rack'] } }],
    ]),
  };
  assert.equal(repulsionTrapFitted(draftState), true);
  assert.equal(heatLureFitted(draftState), true);
  assert.equal(resolveImpulseChargeCapacity(draftState), 8);

  // Campaign hull where ownedShips[0] is bare and ownedShips[1] is parked with the modules
  const campaignParkedState = {
    playerId: 7,
    player: {
      activeShipIndex: 0,
      ownedShips: [
        { id: 'flown', fittings: [] },
        { id: 'parked', fittings: ['mod_repulsion_trap_s', 'mod_heat_lure_s', 'mod_charge_rack'] },
      ],
    },
    entities: new Map([
      [7, { id: 7, type: 'ship', alive: true, data: { fittings: [] } }],
    ]),
  };
  assert.equal(repulsionTrapFitted(campaignParkedState), false);
  assert.equal(heatLureFitted(campaignParkedState), false);
  assert.equal(resolveImpulseChargeCapacity(campaignParkedState), 4);
});
