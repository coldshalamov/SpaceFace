// Phase 2.2 — a wake is a short line behind the round, and a kill ring stays on the body.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARC_BODY_LENGTH_SCALE,
  fitArcLengthToBody,
  spawnCausalStructuralBurst,
} from '../src/render/combat/causalStructuralBurst.js';
import { WAKE_VISIBLE_ARC_WU, WeaponRibbonPool } from '../src/render/weapons/ribbonPool.js';

test('a wake longer than the visible arc stops drawing, and the stored path stays whole', () => {
  const ribbons = new WeaponRibbonPool(null);
  const id = 4;
  ribbons.spawn({ entityId: id, x: 0, y: 0.3, z: 0, width: 0.2, linger: 0.4 });
  const step = 20;
  const pushes = 8;
  for (let i = 1; i <= pushes; i++) ribbons.pushHead(id, i * step, 0.3, 0);
  const slot = ribbons.byEntity.get(id);
  assert.equal(ribbons.histLen[slot], pushes + 1);
  ribbons.update(0, { x: 0, y: 12, z: 40 });
  const seg = ribbons.segments;
  let drawn = 0;
  let hidden = 0;
  for (let s = 0; s < ribbons.histLen[slot]; s++) {
    const alpha = ribbons.alpha[(slot * seg + s) * 2];
    if (alpha > 0) drawn += 1;
    else hidden += 1;
  }
  assert.ok(drawn >= 1, 'the head of the wake is still there');
  assert.ok(hidden >= 1, 'the far tail is not drawn');
  assert.ok(WAKE_VISIBLE_ARC_WU <= 48);
  assert.ok(drawn * step <= WAKE_VISIBLE_ARC_WU + step);
});

test('an expanding kill ring is no longer than the body it marks', () => {
  const radius = 10;
  const arcs = [];
  const spec = {};
  function writeSpec(target, _priority, _life, _x, _y, _z, _vx, _vy, _vz, _drag, _g, _angle, _spin, _p, _ps, _r, _rs, length0, length1) {
    target.length0 = length0;
    target.length1 = length1;
  }
  const spawned = spawnCausalStructuralBurst({
    fx: {
      spawnBlade() { return false; },
      spawnArc(row) { arcs.push({ length0: row.length0, length1: row.length1 }); return true; },
      spawnShard() { return false; },
    },
    spec,
    writeSpec,
    presentation: { arcs: 4, blades: 0, shards: 0, layout: 'expand', lifeScale: 1, intensity: 1 },
    mixed: 3,
    phase: 1,
    baseAngle: 0.4,
    lx: 0,
    ly: 0.4,
    lz: 0,
    tvx: 0,
    tvy: 0,
    tvz: 0,
    radius,
    priority: 1,
    dv: 0,
    reduced: false,
    pattern01: () => 1,
    patternSigned: () => 0,
  });
  assert.equal(spawned, 4);
  const cap = radius * ARC_BODY_LENGTH_SCALE;
  for (const arc of arcs) {
    assert.ok(arc.length0 <= cap + 1e-6, `length0 ${arc.length0} exceeds ${cap}`);
    assert.ok(arc.length1 <= cap + 1e-6, `length1 ${arc.length1} exceeds ${cap}`);
  }
  assert.equal(fitArcLengthToBody(radius * 2.2, radius), cap);
});
