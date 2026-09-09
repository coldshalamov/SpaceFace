import { performance } from 'node:perf_hooks';
import { createCombatKernel } from '../src/combat/kernel.js';

const iterations = Number(process.argv[2]) || 25_000;
const attacker = ship(1, 0, 0);
const target = ship(2, 1, 50);
target.hull = target.hullMax = 1e12;
target.shield = target.shieldMax = 1e12;
target.armorHp = target.armorMax = 1e12;
const state = {
  tick: 0, simTime: 0, mode: 'flight', playerId: 1,
  entities: new Map([[1, attacker], [2, target]]), entityList: [attacker, target],
  combat: { beams: [], threatTables: new Map() }, meta: { seed: 1 },
};
const bus = { on: () => () => {}, emit: () => {} };
const kernel = createCombatKernel({ state, bus, helpers: {}, registry: { get: () => null } });
state.combat.trace.capacity = 64;
const packet = {
  channels: { kinetic: 8, thermal: 5, ion: 2, plasma: 3, phase: 1 },
  penetration: 0.18, heat: 0, statuses: [], hit: { pos: { x: 50, z: 0 } },
};

const started = performance.now();
for (let i = 0; i < iterations; i++) {
  state.tick = i;
  kernel.routeDamage({ attackerId: 1, targetId: 2, packet, origin: { kind: 'bench', id: i } });
}
const elapsedMs = performance.now() - started;
const operationsPerSecond = iterations / (elapsedMs / 1000);
console.log(JSON.stringify({
  benchmark: 'SG-03 routeDamage',
  iterations,
  elapsedMs: Math.round(elapsedMs * 100) / 100,
  operationsPerSecond: Math.round(operationsPerSecond),
  traceDigest: state.combat.trace.digest,
}));

function ship(id, team, x) {
  return {
    id, type: 'ship', alive: true, team, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 10, hull: 100, hullMax: 100, shield: 100, shieldMax: 100,
    armorHp: 100, armorMax: 100, armorFlat: 2, cap: 100, capMax: 100,
    flags: {}, data: { combatProfileId: 'combat_profile_standard_ship', derived: { damageReductionMult: 1 } },
  };
}
