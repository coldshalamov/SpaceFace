// inf-apron-flood — a docking station's apron is a lit PLACE, not a dark mouth.
//
// The windows glow (stationNightLights) and the approach speaks holo-green (dockApproachBeacons:
// the dock's signage), but the apron itself — the deck where ships taxi and park — stood dark.
// Now a rig pair of warm sodium floodlights stands at the berth-mouth flanks, elongated pools
// lie along the taxi deck, and the pad diamond holds a lit landing spot. The apron steps up
// while a corridor works and holds while berthed.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APRON_FLOOD_FLOOR,
  APRON_FLOOD_QUADS_PER_STATION,
  APRON_FLOOD_RIG_HEX,
  buildApronFloodLayout,
  createApronFloodGeometry,
  resolveApronFloodPlan,
  writeApronFloodGeometry,
} from '../src/render/apronFloodlights.js';

function row(overrides = {}) {
  return {
    stationId: 'st_apron_test',
    entityId: 77,
    pos: { x: 900, z: 200 },
    rot: 0.3,
    corridorBearingDeg: 90,
    berth: { x: 1030, z: 200 },
    corridor: { captureOuterRadius: 120, captureHalfWidth: 18 },
    ...overrides,
  };
}

test('the layout stands a rig pair flanking the berth mouth and pools down the taxi deck', () => {
  const layout = buildApronFloodLayout(row());
  assert.equal(layout.live, true);
  // Scale reconstruction: captureOuterRadius = 1.2 x scale -> scale 100; rig height 16, halfW 2.8.
  assert.ok(Math.abs(layout.rigY - 16) < 1e-9);
  assert.ok(Math.abs(layout.rigHalfW - 2.8) < 1e-9);
  // The rigs sit OFF the axis: their midpoint is the berth, and each is equidistant from it.
  assert.notEqual(layout.rigX[0], layout.rigX[1], 'the rig pair is a pair');
  const midX = (layout.rigX[0] + layout.rigX[1]) / 2;
  const midZ = (layout.rigZ[0] + layout.rigZ[1]) / 2;
  assert.ok(Math.abs(midX - 1030) < 1e-9 && Math.abs(midZ - 200) < 1e-9, 'the pair straddles the berth mouth');
  // Pools progress from the berth toward the outer gate on the axis.
  assert.ok(layout.poolAZ > layout.poolBZ || layout.poolAZ < layout.poolBZ, 'pools sit on the axis');
  // Pad diamond covers the berth.
  assert.equal(layout.padX, 1030);
  assert.equal(layout.padZ, 200);
});

test('an idle dock holds the work floor and breathes on its own phase', () => {
  const r = row();
  const a = resolveApronFloodPlan(r, null, 100, false, {});
  const b = resolveApronFloodPlan(r, null, 101.7, false, {});
  assert.equal(a.live, true);
  assert.equal(a.mode, 'running');
  assert.ok(a.rigGlow01 >= APRON_FLOOD_FLOOR, 'the work floor never goes dark');
  assert.ok(a.poolGlow01 > 0);
  assert.notEqual(a.rigGlow01, b.rigGlow01, 'the idle apron still breathes');
  // Deterministic: same clock, same glow — no wall time.
  assert.equal(a.rigGlow01, resolveApronFloodPlan(r, null, 100, false, {}).rigGlow01);
});

test('the apron works when the corridor works, and holds while berthed', () => {
  const r = row();
  const readout = { stationId: 'st_apron_test', phase: 'approach' };
  const working = resolveApronFloodPlan(r, readout, 100, false, {});
  assert.equal(working.mode, 'working');
  assert.ok(working.rigGlow01 > APRON_FLOOD_FLOOR + 0.4, 'a working apron steps the rig up');
  const idle = resolveApronFloodPlan(r, null, 100, false, {});
  assert.ok(working.rigGlow01 > idle.rigGlow01, 'working outranks idle');
  const berthed = resolveApronFloodPlan(r, { stationId: 'st_apron_test', phase: 'berthed' }, 100, false, {});
  assert.equal(berthed.mode, 'berthed');
  assert.ok(berthed.rigGlow01 > 0.85, 'an occupied pad holds lit');
  // Another station's corridor says nothing about this apron.
  const other = resolveApronFloodPlan(r, { stationId: 'st_other', phase: 'capture' }, 100, false, {});
  assert.equal(other.mode, 'running');
});

test('reduced motion stretches the period and keeps the floors lit', () => {
  const r = row();
  const idle = resolveApronFloodPlan(r, null, 100, true, {});
  assert.ok(idle.rigGlow01 >= APRON_FLOOD_FLOOR);
  assert.ok(idle.poolGlow01 >= APRON_FLOOD_FLOOR * 0.8 - 1e-9);
  const normal = resolveApronFloodPlan(r, null, 100, false, {});
  assert.notEqual(normal.rigGlow01, idle.rigGlow01, 'reduced motion shifts the clock, never the floor');
});

test('missing rows or corridors fail closed — no apron without docking truth', () => {
  assert.equal(buildApronFloodLayout(null).live, false);
  assert.equal(buildApronFloodLayout({ pos: { x: 0, z: 0 } }).live, false);
  assert.equal(buildApronFloodLayout(row({ corridor: null })).live, false);
  assert.equal(buildApronFloodLayout(row({ corridor: { captureOuterRadius: 0, captureHalfWidth: 0 } })).live, false);
});

test('one station writes rig cards, two pools and the pad into the shared pool, capped', () => {
  const out = createApronFloodGeometry();
  assert.equal(out.quadCapacity, APRON_FLOOD_QUADS_PER_STATION * 4);
  const layout = buildApronFloodLayout(row());
  const plan = resolveApronFloodPlan(row(), null, 100, false, {});
  writeApronFloodGeometry(out, layout, plan, { gain: 1, base: 0 });
  assert.equal(out.indexCount, APRON_FLOOD_QUADS_PER_STATION * 6, 'rig x2 + pools x2 + pad x1');
  // A second station appends; the pool total grows.
  writeApronFloodGeometry(out, buildApronFloodLayout(row({ stationId: 'st_b', berth: { x: -900, z: -200 } })),
    resolveApronFloodPlan(row({ stationId: 'st_b' }), null, 100, false, {}), { gain: 1, base: out.indexCount / 6 });
  assert.equal(out.indexCount, APRON_FLOOD_QUADS_PER_STATION * 2 * 6);
  // Rig cards are vertical: two corners at y 0, two at rigY.
  const ys = [out.positions[1], out.positions[4], out.positions[7], out.positions[10]];
  assert.deepEqual(ys, [0, 0, layout.rigY, layout.rigY]);
});

test('capacity holds: extra stations stop emitting instead of overrunning the pool', () => {
  const out = createApronFloodGeometry();
  let base = 0;
  for (let i = 0; i < 8; i++) {
    const r = row({ stationId: `st_${i}` });
    writeApronFloodGeometry(out, buildApronFloodLayout(r), resolveApronFloodPlan(r, null, 100, false, {}),
      { gain: 1, base });
    base = out.indexCount / 6;
  }
  assert.ok(base <= out.quadCapacity);
});

test('the rig tint is warm sodium — a different language from the holo-green lane', () => {
  const out = createApronFloodGeometry();
  const layout = buildApronFloodLayout(row());
  const plan = resolveApronFloodPlan(row(), null, 100, false, {});
  writeApronFloodGeometry(out, layout, plan, { gain: 1, base: 0 });
  // Rig card 0, vertex 0: warm white-amber at the plan's brightness, red dominant, blue lowest.
  const r = out.colors[0], g = out.colors[1], b = out.colors[2];
  const bright = plan.rigGlow01;
  const cr = ((APRON_FLOOD_RIG_HEX >> 16) & 255) / 255;
  const cg = ((APRON_FLOOD_RIG_HEX >> 8) & 255) / 255;
  assert.ok(Math.abs(r - cr * bright) < 1e-6);
  assert.ok(Math.abs(g - cg * bright) < 1e-6);
  assert.ok(r > g && g > b);
});
