// What this alphabet adds, and the accounting rules the step follows.
// Existing owners stay the writers for credits, asteroid cook-off, combat
// dipoles, and the massline winch.

import { REACTIVE_BUDGETS, REACTIVE_STEP_ORDER } from '../../data/reactiveMatter/budgets.js';

export const REACTIVE_MATTER_INVENTORY = Object.freeze({
  novel: Object.freeze([
    'Ferromagnetic cargo couples to an authored magnetic machine well. emergentPrimitives dipoleImpulse remains the combat charge-pair law.',
    'A volatile container crosses a heat or impact threshold, spends once, and emits a bounded chemical impulse plus debris. volatileExposure and lootShards keep explosive commodity pods.',
    'A brittle cryo structure fractures into shards, which changes collision radius and retargets or drops a hitch. hullFracture keeps plating tear-off.',
    'Elastic cargo stores a bounded contact impulse and returns a fraction along the contact normal.',
  ]),
  reused: Object.freeze([
    'Volatile ignition heat and crystal fracture heat from src/data/environmentMaterials.js.',
    'Player external impulse scale, budget, window, and acceleration cap from PLAYER_EXTERNAL_RESPONSE.',
    'Massline maxImpulse, reel speed, and length limits from DEFAULT_MASSLINE_DEF, witness hitch only.',
    'mulberry32 continuation from src/core/rng.js.',
    'Rapier remains the integrator. This module returns impulses; it does not step positions.',
  ]),
  stepOrder: REACTIVE_STEP_ORDER,
  momentum: Object.freeze({
    ferroAnchored: 'Impulse on the cargo; equal opposite recorded as machine anchor recoil.',
    ferroFree: 'Equal-opposite impulse on the machine body when one exists.',
    elastic: 'Absorb and release are equal-opposite. The unreturned fraction is dissipated, not a one-sided push. A player clamp scales the whole pair.',
    volatileDebris: 'Three debris velocities sit 120 degrees apart so their relative momentum sums to zero. Shell mass plus debris mass equals the parent mass.',
    volatileChemical: 'Radial impulses on neighbors are a logged chemical injection, capped, and are not cancelled against the shell.',
    brittle: 'Shard masses sum to the parent mass and inherit the parent velocity. The parent collider radius becomes 0.',
    player: 'stepReactiveMatter emits raw impulses. The witness and, later, queuePhysicsImpulse apply the player external budget.',
  }),
  performance: Object.freeze({
    hz: 60,
    maxBodies: REACTIVE_BUDGETS.maxBodies,
    maxMachines: REACTIVE_BUDGETS.maxMachines,
    maxReactionsPerTick: REACTIVE_BUDGETS.maxReactionsPerTick,
    maxChainDepth: REACTIVE_BUDGETS.maxChainDepth,
    maxDebrisAlive: REACTIVE_BUDGETS.maxDebrisAlive,
    note: 'An inert picture (no family laws) performs zero law evaluations. A crowded ferromagnetic picture evaluates every cargo-machine pair and no more.',
  }),
});
