// inf-dock-approach-beacons — the station says where its dock is and whether it is open.
//
// Two rings out, a docking station was dark about its own approach: the authored ring-gap pylons
// carried generic nav blinkers (same rhythm as every other hull light, silent about dock state),
// and the berth pad hologram only fades in inside the far-quiet band. Now every station that
// publishes a docking proxy row carries a gate pair + inbound lane + threshold bar in the
// cradle's holo-green language, and the read is the same dockingCorridor truth the pad consumes:
// calm green when open, an inbound walking pulse while your corridor works it, the
// anti-collision double-flash on capture, a steady hold when you are berthed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DOCK_APPROACH_COLORS,
  DOCK_APPROACH_FLOOR,
  DOCK_APPROACH_LAN_DASHES,
  DOCK_APPROACH_QUADS,
  DOCK_APPROACH_STATION_CAP,
  buildDockApproachLayout,
  createDockApproachGeometry,
  dockApproachPhase,
  resolveDockApproachPlan,
  writeDockApproachGeometry,
} from '../src/render/dockApproachBeacons.js';

// A consistent helios-scale row: scale 90 → capture outer 108, berth at 64.8 along the axis.
const ROW = {
  stationId: 'helios',
  pos: { x: 500, z: -220 },
  rot: 0.5,
  corridorBearingDeg: 135,
  berth: (() => {
    const a = 0.5 + 135 * Math.PI / 180;
    return { x: 500 + Math.cos(a) * 64.8, z: -220 + Math.sin(a) * 64.8 };
  })(),
  corridor: { mouthRadius: 121.5, captureOuterRadius: 108, captureHalfWidth: 37.8 },
};

test('a dock nobody is working runs calm green with a lit floor, never dark', () => {
  let min = 2, max = 0;
  for (let t = 0; t < 9; t += 0.05) {
    const plan = resolveDockApproachPlan(ROW, null, t, false, {});
    assert.equal(plan.mode, 'running');
    assert.equal(plan.colorHex, DOCK_APPROACH_COLORS.running);
    assert.ok(plan.gateGlow01 >= DOCK_APPROACH_FLOOR, 'the gate pair never reads as a dead light');
    assert.ok(plan.laneGlow01 >= DOCK_APPROACH_FLOOR, 'the lane never goes fully dark');
    min = Math.min(min, plan.gateGlow01);
    max = Math.max(max, plan.gateGlow01);
  }
  assert.ok(max > min + 0.1, 'the running pair breathes; it is not a steady floodlight');
});

test('another station being engaged leaves this dock in its calm running read', () => {
  const plan = resolveDockApproachPlan(ROW, { stationId: 'other-station', phase: 'capture' }, 12, false, {});
  assert.equal(plan.mode, 'running');
});

test('your own approach walks the lane inward from the outer gate to the berth', () => {
  const readout = { stationId: 'helios', phase: 'approach' };
  // Sample the walk phase across one period; it must run from near the gate toward the berth.
  const seen = [];
  for (let t = 0; t < 2.6; t += 0.05) {
    const plan = resolveDockApproachPlan(ROW, readout, t, false, {});
    assert.equal(plan.mode, 'guide');
    seen.push(plan.walk01);
  }
  assert.ok(Math.max(...seen) > 0.9, 'the walk starts at the outer gate');
  assert.ok(Math.min(...seen) < 0.15, 'the walk reaches the berth end of the lane');
  // Monotone within one cycle: each new sample never jumps back toward the gate by much.
  let wraps = 0;
  for (let i = 1; i < seen.length; i++) {
    if (seen[i] > seen[i - 1] + 0.2) wraps += 1;
  }
  assert.ok(wraps <= 1, `one walk period wraps once (saw ${wraps} jumps)`);
});

test('corridor phase walks the lane faster than the approach phase', () => {
  const sweep = (phase) => {
    let jumps = 0;
    let prev = null;
    for (let t = 0; t < 3; t += 0.02) {
      const w = resolveDockApproachPlan(ROW, { stationId: 'helios', phase }, t, false, {}).walk01;
      if (prev != null && w > prev + 0.2) jumps += 1;
      prev = w;
    }
    return jumps;
  };
  assert.ok(sweep('corridor') > sweep('approach'), 'a working corridor walks its lane faster');
});

test('capture runs the anti-collision double-flash at the gate pair', () => {
  const readout = { stationId: 'helios', phase: 'capture' };
  let peaks = 0;
  let inPulse = false;
  for (let t = 0; t < 2.2; t += 0.005) {
    const plan = resolveDockApproachPlan(ROW, readout, t, false, {});
    assert.equal(plan.mode, 'acquire');
    assert.equal(plan.colorHex, DOCK_APPROACH_COLORS.acquire);
    const hot = plan.gateGlow01 > DOCK_APPROACH_FLOOR + 0.3;
    if (hot && !inPulse) { peaks++; inPulse = true; }
    if (!hot) inPulse = false;
  }
  // ~2.4 periods sampled; a double-flash yields two peaks per period.
  assert.ok(peaks >= 4, `capture flashes in pairs (saw ${peaks} peaks over 2.2 s)`);
});

test('berthed holds steady — no walk, no flicker, a lit lane', () => {
  const readout = { stationId: 'helios', phase: 'berthed' };
  const glows = new Set();
  for (let t = 0; t < 5; t += 0.1) {
    const plan = resolveDockApproachPlan(ROW, readout, t, false, {});
    assert.equal(plan.mode, 'berthed');
    assert.equal(plan.walk01, 0);
    glows.add(plan.gateGlow01.toFixed(4));
    assert.ok(plan.laneGlow01 >= 0.4, 'the lane holds lit under the berthed ship');
  }
  assert.equal(glows.size, 1, 'the held pair does not flicker');
});

test('reduced motion stretches the flash and the walk; it never silences them', () => {
  const countGatePeaks = (readout, reduced) => {
    let peaks = 0, inPulse = false;
    for (let t = 0; t < 6; t += 0.01) {
      const hot = resolveDockApproachPlan(ROW, readout, t, reduced, {}).gateGlow01 > DOCK_APPROACH_FLOOR + 0.3;
      if (hot && !inPulse) { peaks++; inPulse = true; }
      if (!hot) inPulse = false;
    }
    return peaks;
  };
  const capture = { stationId: 'helios', phase: 'capture' };
  const full = countGatePeaks(capture, false);
  const reduced = countGatePeaks(capture, true);
  assert.ok(reduced < full / 2, `reduced stretches the flash (full ${full}, reduced ${reduced})`);
  assert.ok(reduced >= 2, 'slowed, never silenced');
  // The calm dock under reduced motion keeps its floor across a whole stretched period.
  for (let t = 0; t < 12; t += 0.05) {
    const plan = resolveDockApproachPlan(ROW, null, t, true, {});
    assert.ok(plan.gateGlow01 >= DOCK_APPROACH_FLOOR);
    assert.ok(plan.laneGlow01 >= DOCK_APPROACH_FLOOR);
  }
  // The inbound walk still runs, just slower: it completes within a stretched period.
  let sawStart = false, sawEnd = false;
  for (let t = 0; t < 8; t += 0.05) {
    const w = resolveDockApproachPlan(ROW, { stationId: 'helios', phase: 'approach' }, t, true, {}).walk01;
    if (w > 0.9) sawStart = true;
    if (w < 0.15) sawEnd = true;
  }
  assert.ok(sawStart && sawEnd, 'the slowed walk still leads the pilot in');
});

test('plans are deterministic off station id and sim time, and stations de-phase', () => {
  const a = resolveDockApproachPlan(ROW, null, 42.5, false, {});
  const b = resolveDockApproachPlan(ROW, null, 42.5, false, {});
  assert.equal(a.gateGlow01, b.gateGlow01);
  assert.equal(dockApproachPhase('helios'), dockApproachPhase('helios'));
  assert.notEqual(dockApproachPhase('helios'), dockApproachPhase('vesta'));
});

test('the layout sits on the corridor axis with the cradle axis convention', () => {
  const layout = buildDockApproachLayout(ROW, {});
  assert.ok(layout.live);
  const base = ROW.rot + ROW.corridorBearingDeg * Math.PI / 180;
  const scale = ROW.corridor.captureOuterRadius / 1.2;
  const gateR = ROW.corridor.captureOuterRadius * (0.8 / 1.2);
  const spread = 25 * Math.PI / 180;
  for (const [k, sign] of [[0, -1], [1, 1]]) {
    const a = base + sign * spread;
    assert.ok(Math.abs(layout.gateX[k] - (ROW.pos.x + Math.cos(a) * gateR)) < 1e-9);
    assert.ok(Math.abs(layout.gateZ[k] - (ROW.pos.z + Math.sin(a) * gateR)) < 1e-9);
  }
  // Dashes ride the axis between the berth and the outer gate.
  assert.equal(layout.dashX.length, DOCK_APPROACH_LAN_DASHES);
  const ax = Math.cos(base), az = Math.sin(base);
  for (let k = 0; k < layout.dashX.length; k++) {
    const dx = layout.dashX[k] - ROW.berth.x;
    const dz = layout.dashZ[k] - ROW.berth.z;
    const along = dx * ax + dz * az;
    const lateral = Math.abs(dx * -az + dz * ax);
    assert.ok(along > scale * 0.6 && along < scale * 1.2, `dash ${k} sits on the lane (along ${along.toFixed(1)})`);
    assert.ok(lateral < 0.01, `dash ${k} is on the axis (lateral ${lateral.toExponential(1)})`);
  }
  // The threshold bar crosses the lane at the outer gate, perpendicular to the axis.
  const bx = layout.barX - ROW.berth.x, bz = layout.barZ - ROW.berth.z;
  assert.ok(Math.abs(bx * ax + bz * az - ROW.corridor.captureOuterRadius) < 1e-6);
  assert.ok(Math.abs(layout.barDX * ax + layout.barDZ * az) < 1e-9, 'the bar runs across the lane');
});

test('rows without docking truth carry no beacons', () => {
  const out = {};
  assert.equal(buildDockApproachLayout(null, out).live, false);
  assert.equal(buildDockApproachLayout({ ...ROW, corridor: null }, out).live, false);
  assert.equal(buildDockApproachLayout({ ...ROW, berth: null }, out).live, false);
  assert.equal(buildDockApproachLayout({ ...ROW, pos: { x: NaN, z: 0 } }, out).live, false);
  assert.equal(buildDockApproachLayout({ ...ROW, corridor: { captureOuterRadius: 0.2, captureHalfWidth: 0.01 } }, out).live,
    false, 'a scale-less row cannot dress an approach');
  const plan = resolveDockApproachPlan({ ...ROW, berth: null }, null, 1, false, {});
  assert.equal(plan.live, false);
});

test('one pool draws every station within the quad budget; cards stand, dashes lie flat', () => {
  const scratch = createDockApproachGeometry();
  const rows = [ROW, { ...ROW, stationId: 'vesta', rot: 1.1, corridorBearingDeg: 20 }];
  const readout = { stationId: 'vesta', phase: 'capture' };
  let base = 0;
  for (const row of rows) {
    const layout = buildDockApproachLayout(row, {});
    const plan = resolveDockApproachPlan(row, readout, 3.3, false, {});
    writeDockApproachGeometry(scratch, layout, plan, { gain: 1, base });
    base = scratch.indexCount / 6;
  }
  const quads = scratch.indexCount / 6;
  assert.ok(quads > 11 && quads <= DOCK_APPROACH_QUADS, `both stations drew (${quads} quads)`);
  assert.ok(quads <= 22, 'each station stays within its 11-quad budget');
  for (let v = 0; v < (scratch.indexCount / 6) * 4; v++) {
    const o = v * 3;
    assert.ok(Number.isFinite(scratch.positions[o]), 'no NaN positions reach the mesh');
  }
  // Gate cards are vertical (a tall y span per quad); deck dashes and the threshold lip hold
  // near-deck height.
  let verticals = 0, flats = 0;
  for (let q = 0; q < quads; q++) {
    const ys = [0, 3, 6, 9].map((i) => scratch.positions[q * 12 + i + 1]);
    const span = Math.max(...ys) - Math.min(...ys);
    if (span > 1) verticals++; else flats++;
  }
  assert.ok(verticals === 8, `two stations × gate pair × two crossed cards stand up (got ${verticals})`);
  assert.ok(flats === quads - verticals, 'the lane and threshold dressing lies flat on the deck');
});

test('an exhausted pool stops emitting instead of overrunning the buffers', () => {
  const tight = createDockApproachGeometry(16);
  const layout = buildDockApproachLayout(ROW, {});
  const plan = resolveDockApproachPlan(ROW, null, 1, false, {});
  writeDockApproachGeometry(tight, layout, plan, { gain: 1 });
  assert.ok(tight.indexCount / 6 <= 16, 'emits stop at the capacity');
  assert.ok(tight.indexCount > 0);
});

test('gain zero draws nothing (accessibility can dim the dressing to silence)', () => {
  const scratch = createDockApproachGeometry();
  const layout = buildDockApproachLayout(ROW, {});
  const plan = resolveDockApproachPlan(ROW, null, 1, false, {});
  writeDockApproachGeometry(scratch, layout, plan, { gain: 0 });
  assert.equal(scratch.indexCount, 0);
});

test('the live owner is wired: one mesh, one frame walk, the cradle readout as its truth', () => {
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(vfx, /import \{\s*buildDockApproachLayout,/, 'the adapter imports the layout builder');
  assert.match(vfx, /this\._initDockApproach\(\);/, 'the layer allocates once at vfx init');
  assert.match(vfx, /sub\.dockApproachBeacons = this\._updateDockApproach\(\) \? 1 : 0;/,
    'the frame update walks the layer next to the cradle');
  assert.match(vfx, /resolveDockApproachPlan\(row, readout, now, reduced, da\.plan\)/,
    'the plan consumes the same dockingCorridor readout the cradle does');
  assert.match(vfx, /disposeVfxRoot\(this\._dockApproach && this\._dockApproach\.mesh, disposeState\);/,
    'the mesh is disposed with the scene');
});

test('the station cap and quad budget are bounded for one draw call', () => {
  assert.ok(DOCK_APPROACH_STATION_CAP >= 1 && DOCK_APPROACH_STATION_CAP <= 6,
    'a handful of docking stations per sector is the honest population');
  assert.ok(DOCK_APPROACH_QUADS >= DOCK_APPROACH_STATION_CAP * 11,
    'the pool fits every capped station full budget');
  assert.ok(DOCK_APPROACH_QUADS <= 96, 'the pool stays a single small draw');
});
