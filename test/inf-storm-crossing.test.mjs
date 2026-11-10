// inf-storm-crossing — the storm you are dying in finally reads on the hull.
//
// The player story: hazard zones (the Ashfall Roaming Burn, radiation shadows, nebula fields,
// debris runs) damage the hull every tick, and the world said so only through HUD alerts — the
// sim publishes hazard:enter/exit with zone type and intensity and keeps state.world.hazardPresence,
// and no render path read either. Crossing into the storm that kills you was invisible. Now the
// boundary plays a charge beat around the hull (its pooled event light keyed by the bite at the
// line), and riding the storm keeps a sparse deterministic static crawling the hull, per family
// hue (radiation chartreuse, nebula violet, debris slate). Deterministic off simTime; reduced
// motion thins the static and halves the beat, never to zero.
//
// These tests pin the pure decision layer (src/render/hazardStormRead.js); the vfx adapter
// spawns exactly what the beat/plan name.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STORM_CROSSING_REDUCED_MUL,
  STORM_STATIC_CADENCE_HZ,
  STORM_STATIC_REDUCED_CADENCE_HZ,
  resolveStormCrossingBeat,
  resolveStormZoneColorHex,
  stormStaticTickPlan,
  STORM_ZONE_COLORS,
} from '../src/render/hazardStormRead.js';

test('crossing the boundary plays a beat that scales with how hard the zone bites', () => {
  const light = resolveStormCrossingBeat({ entityId: 7, zoneType: 'radiation', intensity: 0.4 }, 120.5);
  const heavy = resolveStormCrossingBeat({ entityId: 7, zoneType: 'radiation', intensity: 0.9 }, 120.5);
  assert.ok(light && heavy, 'both crossings read');
  assert.ok(light.count > 0 && heavy.count > heavy.count * 0.5, 'beats are populated');
  assert.ok(heavy.count > light.count, 'a heavier zone announces itself harder');
  assert.equal(light.lightSeverity, 'contact');
  assert.equal(heavy.lightSeverity, 'detonation', 'a heavy bite keys the big light');
  assert.equal(light.colorHex, STORM_ZONE_COLORS.radiation, 'the beat wears its family hue');
  // Angles ring the hull: they cover the full circle and are deterministic per receipt.
  const again = resolveStormCrossingBeat({ entityId: 7, zoneType: 'radiation', intensity: 0.4 }, 120.5);
  assert.deepEqual(light.angles, again.angles, 'the same receipt builds the same beat');
  const spread = Math.max(...light.angles) - Math.min(...light.angles);
  assert.ok(spread > Math.PI, 'the charge rings the hull, not one side of it');
});

test('reduced motion halves the crossing beat but never silences it', () => {
  const full = resolveStormCrossingBeat({ entityId: 7, zoneType: 'nebula', intensity: 0.8 }, 44);
  const reduced = resolveStormCrossingBeat({ entityId: 7, zoneType: 'nebula', intensity: 0.8 }, 44, true);
  assert.ok(reduced.count >= 3, 'a boundary you never notice is worse than none — a floor stays');
  assert.ok(Math.abs(reduced.count / full.count - STORM_CROSSING_REDUCED_MUL) < 0.35,
    'reduced motion roughly halves the beat');
  assert.equal(reduced.colorHex, full.colorHex);
});

test('foreign crossings and anonymous receipts do not play the player hull read', () => {
  assert.equal(resolveStormCrossingBeat(null, 10), null);
  assert.equal(resolveStormCrossingBeat({ zoneType: 'radiation', intensity: 0.5 }, 10), null,
    'no entityId is not a hull crossing');
  assert.equal(resolveStormCrossingBeat({ entityId: 7, intensity: 0.5 }, 10), null,
    'no zone type has nothing to say');
});

test('the sustained static emits at its cadence, rotates families, and never stacks', () => {
  const latch = { step: null };
  const types = ['radiation', 'nebula'];
  const intensityByType = { radiation: 0.8, nebula: 0.3 };
  let emissions = 0;
  const seenFamilies = new Set();
  let lastRadiation = null;
  for (let i = 0; i < 240; i++) { // 4 s at 60 Hz
    const t = i / 60;
    const entry = stormStaticTickPlan(t, types, intensityByType, STORM_STATIC_CADENCE_HZ, latch.step);
    if (entry) {
      latch.step = entry.step;
      emissions++;
      seenFamilies.add(entry.plan.zoneType);
      assert.ok(entry.plan.count >= 1, 'every emission carries at least one charge tick');
      assert.ok(entry.plan.colorHex, 'the tick wears its family hue');
      if (entry.plan.zoneType === 'radiation') lastRadiation = entry.plan;
    }
  }
  // 7 Hz over 4 s ≈ 28 emissions; the frame-rate-independent latch cannot stack past it.
  assert.ok(emissions >= 26 && emissions <= 30, `cadence holds over time (got ${emissions} in 4 s)`);
  assert.deepEqual(seenFamilies, new Set(types), 'both live families rotate through the read');
  assert.ok(lastRadiation, 'the hot family emitted');
  assert.equal(lastRadiation.count, 2, 'a hot family (>0.5 intensity) carries the extra tick');
  const sameTick = stormStaticTickPlan(120, types, intensityByType, STORM_STATIC_CADENCE_HZ, Math.floor(120 * STORM_STATIC_CADENCE_HZ));
  assert.equal(sameTick, null, 'a latched tick is quiet — no per-frame stacking');
});

test('reduced motion thins the sustained static; an empty hull reads quiet', () => {
  const latch = { step: null };
  let emissions = 0;
  for (let i = 0; i < 240; i++) {
    const entry = stormStaticTickPlan(i / 60, ['radiation'], { radiation: 0.8 }, STORM_STATIC_REDUCED_CADENCE_HZ, latch.step);
    if (entry) { latch.step = entry.step; emissions++; }
  }
  assert.ok(emissions >= 8 && emissions <= 12, `reduced cadence roughly halves the static (got ${emissions})`);
  assert.equal(stormStaticTickPlan(10, [], {}, STORM_STATIC_CADENCE_HZ, null), null,
    'no live family — no static');
  assert.equal(stormStaticTickPlan(10, ['radiation'], { radiation: 0.8 }, 0, null), null,
    'no cadence — no static');
  assert.equal(stormStaticTickPlan(Number.NaN, ['radiation'], {}, STORM_STATIC_CADENCE_HZ, null), null,
    'no clock — no static');
});

test('every hazard family has its own hue, and an unknown family falls to the house amber', () => {
  const hues = new Set(Object.values(STORM_ZONE_COLORS));
  assert.equal(hues.size, Object.keys(STORM_ZONE_COLORS).length, 'families never share a hue');
  assert.equal(resolveStormZoneColorHex('radiation'), STORM_ZONE_COLORS.radiation);
  assert.equal(resolveStormZoneColorHex('something_new'), 0xffb35c, 'unlisted families read quiet amber');
  assert.equal(resolveStormZoneColorHex(undefined), 0xffb35c);
});
