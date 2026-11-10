// inf-salvage-lamp — a wreck whose salvagePool still pays is something you can SEE.
//
// A fresh kill worth thousands and a worked-out husk were identical wrecks in the picture: the
// salvage pool truth lived on `data.salvagePool` and no renderer read it, so the player had to
// beam every hulk to learn which one was worth a stop. Now a paying wreck wears a slow amber
// work-lamp (the dock-sodium family tint) and a stripped husk goes dark.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSalvageLampGeometry,
  SALVAGE_LAMP_CAP,
  SALVAGE_LAMP_FLOOR,
  SALVAGE_LAMP_PERIOD_S,
  SALVAGE_LAMP_QUADS_PER_WRECK,
  SALVAGE_LAMP_REDUCED_PERIOD_MUL,
  salvageLampGlow01,
  salvageLampHalfWidthWu,
  salvageLampLive,
  salvageLampPhase,
  writeSalvageLampQuads,
} from '../src/render/salvageLamp.js';

test('a wreck with any live pool entry pays — the same truth the beam and aftermath read', () => {
  assert.equal(salvageLampLive({ cmdty_scrap_metal: 4 }), true);
  assert.equal(salvageLampLive({ cmdty_scrap_metal: 0, cmdty_refined_metals: 0.5 }), true);
  // Worked out: every entry drained.
  assert.equal(salvageLampLive({ cmdty_scrap_metal: 0 }), false);
  // Set dressing and env husks carry no pool at all.
  assert.equal(salvageLampLive(null), false);
  assert.equal(salvageLampLive(undefined), false);
  assert.equal(salvageLampLive('not a pool'), false);
});

test('the lamp breathes on sim time with a per-wreck phase, and never drops below its floor', () => {
  const samples = [];
  for (let t = 0; t < 8; t += 0.05) samples.push(salvageLampGlow01('wreck_7', t, false));
  const lo = Math.min(...samples);
  const hi = Math.max(...samples);
  assert.ok(lo >= SALVAGE_LAMP_FLOOR - 1e-9, 'a paying lamp keeps a lit floor');
  assert.ok(hi > lo + 0.3, 'the breath is visible, not a flat glow');
  // Two wrecks never pulse in lockstep.
  const a = salvageLampGlow01('wreck_7', 3.3, false);
  const b = salvageLampGlow01('wreck_11', 3.3, false);
  assert.notEqual(a, b);
  // The clock is the sim clock: a frozen sim holds the breath still.
  assert.equal(salvageLampGlow01('wreck_7', 5, false), salvageLampGlow01('wreck_7', 5, false));
});

test('reduced motion stretches the breath period and never darkens the lamp', () => {
  const reduced = [];
  for (let t = 0; t < 72; t += 0.1) reduced.push(salvageLampGlow01('wreck_3', t, true));
  const lo = Math.min(...reduced);
  const hi = Math.max(...reduced);
  assert.ok(lo >= SALVAGE_LAMP_FLOOR - 1e-9, 'the floor survives reduced motion');
  assert.ok(hi > lo + 0.3, 'reduced motion slows the breath, it does not silence it');
  assert.equal(
    salvageLampGlow01('wreck_3', 600, true),
    salvageLampGlow01('wreck_3', 600 + SALVAGE_LAMP_PERIOD_S * SALVAGE_LAMP_REDUCED_PERIOD_MUL, true),
    'the reduced period is the authored multiple',
  );
  // And the same instant reads differently under the two clocks — the breath really is slower.
  assert.notEqual(salvageLampGlow01('wreck_3', 0.3, false), salvageLampGlow01('wreck_3', 0.3, true));
});

test('lamp size follows the wreck radius, NaN-safe', () => {
  assert.equal(salvageLampHalfWidthWu(8), 8 * 0.95);
  assert.equal(salvageLampHalfWidthWu(0), 7 * 0.95, 'a bodyless radius falls back to the wreck default');
  assert.equal(salvageLampHalfWidthWu(NaN), 7 * 0.95);
  assert.equal(salvageLampHalfWidthWu(40), 40 * 0.95, 'a capital husk wears a bigger halo');
});

test('phases are deterministic and spread across wrecks', () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(salvageLampPhase(`wreck_${i}`));
  assert.equal(seen.size, 40);
  assert.equal(salvageLampPhase('wreck_7'), salvageLampPhase('wreck_7'), 'same id, same phase — no wall time');
});

test('one wreck writes exactly its diamond + core into the shared pool, appends, and reports the pool total', () => {
  const out = createSalvageLampGeometry();
  assert.equal(out.quadCapacity, SALVAGE_LAMP_CAP * SALVAGE_LAMP_QUADS_PER_WRECK);
  writeSalvageLampQuads(out, 100, -40, 8, 0.7, 0);
  assert.equal(out.indexCount, SALVAGE_LAMP_QUADS_PER_WRECK * 6);
  // A second wreck appends; the reported count is the pool total, not one wreck's share.
  writeSalvageLampQuads(out, -200, 500, 6, 0.5, out.indexCount / 6);
  assert.equal(out.indexCount, 2 * SALVAGE_LAMP_QUADS_PER_WRECK * 6);
  // The diamond corners lie flat on the play plane around the wreck center.
  const o = 0;
  const p = out.positions;
  assert.ok(Math.abs(p[o + 1] - 0.45) < 1e-6);
  assert.ok(Math.abs(p[o + 0] - (100 - 8)) < 1e-5);
  assert.ok(Math.abs(p[o + 2] - -40) < 1e-5);
  // Brightness rides the vertex colors, and the tint is sodium amber (red over green over blue).
  assert.ok(out.colors[o] > out.colors[o + 1] && out.colors[o + 1] > out.colors[o + 2],
    'the lamp wears the dock-sodium family tint');
});

test('a dark lamp writes nothing — the pool total is unchanged', () => {
  const out = createSalvageLampGeometry();
  writeSalvageLampQuads(out, 100, -40, 8, 0, 0);
  assert.equal(out.indexCount, 0);
  writeSalvageLampQuads(out, 100, -40, 8, NaN, 0);
  assert.equal(out.indexCount, 0);
  writeSalvageLampQuads(out, 100, -40, 0, 0.7, 0);
  assert.equal(out.indexCount, 0, 'a zero-width diamond is no lamp at all');
});

test('capacity holds: an eleventh hour furball cannot overflow the pool', () => {
  const out = createSalvageLampGeometry();
  let quads = 0;
  for (let i = 0; i < SALVAGE_LAMP_CAP + 6; i++) {
    writeSalvageLampQuads(out, i * 10, 0, 5, 0.6, quads);
    quads = out.indexCount / 6;
  }
  assert.ok(quads <= out.quadCapacity, 'emission stops at capacity instead of overrunning');
});
