import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { applyDreadnoughtTurretLossPhases } from '../src/systems/tacticalAI.js';
import { destroyTurret, countTurretsLost } from '../src/combat/subsystems.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { mulberry32 } from '../src/core/rng.js';

test('FB-020: scripted turret kills produce phase edges at 4 and 10 turrets lost; hull damage produces no edges', () => {
  const rng = mulberry32(4242);
  const bus = createBus();
  const doctrinePhases = [];
  const telegraphs = [];
  const spawnRequests = [];

  bus.on('ai:doctrinePhase', (p) => doctrinePhases.push(p));
  bus.on('ai:telegraph', (p) => telegraphs.push(p));
  bus.on('swarm:spawnRequest', (p) => spawnRequests.push(p));

  const state = {
    tick: 100,
    simTime: 10.0,
    rng,
    spawnBudget: {
      request(req) { spawnRequests.push(req); },
    },
  };
  const ctxRef = { bus, state };

  const enemyDef = ENEMY_TYPES.find((e) => e.id === 'dreadnought_boss');
  assert.ok(enemyDef, 'dreadnought_boss def exists');
  assert.deepEqual(enemyDef.subsystems.phaseAtTurretsLost, [4, 10]);

  // Spawn dreadnought boss spec
  const boss = makeEnemySpawnSpec(enemyDef.id, { x: 0, z: 0 }, 1, { rng });
  boss.alive = true;
  boss.turnRate = 0.4;

  assert.equal(countTurretsLost(boss), 0);

  // 1. Hull-only damage ramp (turrets intact)
  boss.hull = 1500; // 50% damage
  applyDreadnoughtTurretLossPhases(boss, state, ctxRef, state.tick);

  boss.hull = 300; // 90% damage
  applyDreadnoughtTurretLossPhases(boss, state, ctxRef, state.tick);

  assert.equal(doctrinePhases.length, 0, 'hull-only damage ramp produces no phase edges');
  assert.equal(telegraphs.length, 0, 'hull-only damage ramp produces no telegraphs');
  assert.equal(spawnRequests.length, 0, 'no swarmers vented from hull damage');

  // Restore hull to untouched
  boss.hull = boss.hullMax;

  // 2. Destroy turrets 0..3 (4 turrets lost -> hits edge 1)
  for (let i = 0; i < 4; i++) {
    destroyTurret(boss, `turret_${i}`);
  }
  assert.equal(countTurretsLost(boss), 4);

  state.tick++;
  applyDreadnoughtTurretLossPhases(boss, state, ctxRef, state.tick);

  assert.equal(doctrinePhases.length, 1, 'first edge triggered at 4 turrets lost');
  assert.equal(doctrinePhases[0].edge, 1);
  assert.equal(doctrinePhases[0].turretsLost, 4);
  assert.equal(boss.data.turretLossPhase, 1);
  assert.equal(boss.data.broadsideShortened, true);
  assert.ok(spawnRequests.length >= 1, 'swarmers vented on first phase edge');

  // Repeated ticks in phase 1 do not re-trigger swarmers or phase edge
  const preCount = spawnRequests.length;
  state.tick++;
  applyDreadnoughtTurretLossPhases(boss, state, ctxRef, state.tick);
  assert.equal(spawnRequests.length, preCount, 'swarmers vented only once');
  assert.equal(doctrinePhases.length, 1);

  // 3. Destroy turrets 4..8 (9 total lost -> between thresholds)
  for (let i = 4; i < 9; i++) {
    destroyTurret(boss, `turret_${i}`);
  }
  assert.equal(countTurretsLost(boss), 9);
  state.tick++;
  applyDreadnoughtTurretLossPhases(boss, state, ctxRef, state.tick);
  assert.equal(doctrinePhases.length, 1, 'no new edge before threshold 10');

  // 4. Destroy turret 9 (10 total lost -> hits edge 2)
  destroyTurret(boss, 'turret_9');
  assert.equal(countTurretsLost(boss), 10);

  const prevTurnRate = boss.turnRate;
  state.tick++;
  applyDreadnoughtTurretLossPhases(boss, state, ctxRef, state.tick);

  assert.equal(doctrinePhases.length, 2, 'second edge triggered at 10 turrets lost');
  assert.equal(doctrinePhases[1].edge, 2);
  assert.equal(doctrinePhases[1].turretsLost, 10);
  assert.equal(boss.data.turretLossPhase, 2);
  assert.equal(boss.data.prowSurfaceOpen, true, 'prow surface exposed on edge 2');
  assert.equal(boss.turnRate, prevTurnRate * 0.5, 'turn authority halved on edge 2');
  assert.equal(boss.data.turnAuthorityScale, 0.5);
});
