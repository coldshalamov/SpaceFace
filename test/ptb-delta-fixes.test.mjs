// Director fix-forward for the agy2 delta review of the landed Pilot Tree chain (2026-11-20).
import test from 'node:test';
import assert from 'node:assert/strict';

import { weapons } from '../src/systems/weapons.js';
import { fields } from '../src/systems/fields.js';

function wrap(a) { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x <= -Math.PI) x += 2 * Math.PI; return x; }

function crossTurret(arcRad, fromRel, toRel) {
  const e = { rot: 0.3 };
  const w = { gimbalArc: arcRad, _turretAngle: e.rot + fromRel };
  const half = arcRad / 2;
  let reachedAt = null;
  for (let i = 0; i < 60 * 6; i++) {
    weapons._stepTurretBearing(e, w, {}, e.rot + toRel, 1 / 60);
    const rel = wrap(w._turretAngle - e.rot);
    assert.ok(rel <= half + 1e-9 && rel >= -half - 1e-9, `the cradle stays inside its stops (rel ${rel})`);
    if (reachedAt == null && Math.abs(rel - toRel) < 1e-6) reachedAt = i / 60;
  }
  return reachedAt;
}

test('a 180-degree turret crosses from its starboard stop to port through the bow, never locking', () => {
  const t = crossTurret(Math.PI, Math.PI / 2, -Math.PI / 2);
  assert.ok(t != null, 'the battery reached the port-beam solution');
  assert.ok(t <= Math.PI / 1.5 + 0.05, `at the 1.5 rad/s slew (${t} s)`);
});

test('a 240-degree turret crosses +110 to -110 degrees inside its arc', () => {
  const deg = Math.PI / 180;
  const t = crossTurret(240 * deg, 110 * deg, -110 * deg);
  assert.ok(t != null, 'the battery reached the far aft-quarter solution');
});

test('a full-ring turret still takes the short way round', () => {
  const e = { rot: 0 };
  const w = { gimbalArc: 2 * Math.PI, _turretAngle: 3.0 };
  weapons._stepTurretBearing(e, w, {}, -3.0, 1 / 60);
  assert.ok(w._turretAngle > 3.0, 'it stepped across the stern (short way), not back across the bow');
});

test('a loaded world inherits no queued Combo, Combo ledger or Echo', () => {
  fields._comboQueue = [{ body: { id: 1, alive: true, pos: { x: 0, z: 0 } } }];
  fields._comboTouches = new Map([[1, {}]]);
  fields._pilotEcho = [{ power: 'pull' }];
  for (const _ of fields.deserializeChunked({ revision: 0 })) { /* drain */ }
  assert.equal(fields._comboQueue.length, 0);
  assert.equal(fields._comboTouches.size, 0);
  assert.equal(fields._pilotEcho.length, 0);
});
