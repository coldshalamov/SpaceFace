import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SHIPS } from '../src/data/ships.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { resolveHitstunLaw } from '../src/combat/impulseKernel.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

// INF-026: the Corsair Raider is a throwable light again. It flies a ship_hornet interceptor
// hull (mass 24) but was authored at mass 64 — gunship ballast that put it below every
// ammunition threshold: the reference concussion shove never broke the helm-loss floor, and a
// throw-floor swing overloaded the production line. Retuned to hull + fittings (lancer standard).

const CONCUSSION_IMPULSE = 920; // wpn_concussion_cannon_m impulsePerHit, live weapon data
const MIDGAME_ATTACKER_MASS = 100; // representative gunship shooter, not the projectile

function def(id) {
  return ENEMY_TYPES.find((e) => e.id === id);
}

function helmLoss(mass, cruise, attackerMass) {
  const deltaV = CONCUSSION_IMPULSE / Math.max(0.1, mass);
  const law = resolveHitstunLaw({
    deltaV,
    victimCruise: cruise,
    attackerMass,
    victimMass: mass,
  });
  return { deltaV, law, coastWu: deltaV * law.durationS };
}

test('the corsair spawns at its interceptor mass, not gunship ballast', () => {
  const hornet = SHIPS.find((s) => s.id === 'ship_hornet');
  assert.equal(hornet.mass, 24);
  const corsair = def('corsair_raider');
  assert.equal(corsair.shipId, 'ship_hornet');
  assert.equal(corsair.mass, 32, 'hull 24 + 8 for the permanent autocannon M (lancer standard)');
  const spec = makeEnemySpawnSpec('corsair_raider', 4, { x: 0, z: 0 });
  assert.equal(spec.mass, 32, 'the spawn seam carries the tuned mass onto the body');
});

test('the reference shove breaks helm control on the retuned corsair, as before it never did', () => {
  const corsair = def('corsair_raider');
  const now = helmLoss(corsair.mass, corsair.maxSpeed, MIDGAME_ATTACKER_MASS);
  assert.ok(now.law.durationS > 0.3, `tumbles uncontrolled, got ${now.law.durationS}s`);
  assert.ok(now.coastWu > 25, `coasts ballistically into another body, got ${now.coastWu}wu`);

  const before = helmLoss(64, corsair.maxSpeed, MIDGAME_ATTACKER_MASS);
  assert.equal(before.law.durationS, 0, 'at mass 64 the same shove never broke the u-floor');
  assert.equal(before.coastWu, 0);
});

test('the same shove is still a shrug to a heavy', () => {
  const foreman = def('mirrorjaw_foreman');
  const heavy = helmLoss(foreman.mass, foreman.maxSpeed, MIDGAME_ATTACKER_MASS);
  assert.equal(heavy.law.durationS, 0, '420 mass never loses the helm to the reference shove');
  assert.ok(heavy.deltaV < 3, `heavy barely moves, got ${heavy.deltaV}wu/s`);
});

test('a throw-floor swing holds the production line at interceptor mass and snapped it at ballast', () => {
  const line = ATTACHMENT_DEFS.find((d) => d.id === 'attachment_massline');
  const budget = line.break.maxTension;
  assert.ok(budget > 0, 'live break budget');
  // Steady-swing line load estimate T = m v^2 / r at a throw-floor wind (130wu/s on an 80wu line).
  const load = (mass) => mass * 130 * 130 / 80;
  assert.ok(load(64) > budget, `mass 64 snaps the line (${load(64)} > ${budget})`);
  assert.ok(load(32) < budget / 1.4, `mass 32 holds with margin (${load(32)} < ${budget})`);
});

test('helm loss is deterministic: the same shove always yields the same window', () => {
  const corsair = def('corsair_raider');
  const first = helmLoss(corsair.mass, corsair.maxSpeed, MIDGAME_ATTACKER_MASS);
  const second = helmLoss(corsair.mass, corsair.maxSpeed, MIDGAME_ATTACKER_MASS);
  assert.deepEqual(
    { durationS: first.law.durationS, coastWu: first.coastWu },
    { durationS: second.law.durationS, coastWu: second.coastWu },
  );
});
