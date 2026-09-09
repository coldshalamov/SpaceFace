import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORCE_BRIGHTNESS_ORDER,
  FORCE_CHANNEL_IDS,
  FORCE_CONTRAST_FLOORS,
  FORCE_CVD_MODES,
  FORCE_PALETTE,
  FORCE_PALETTE_LIVE_STANDINS,
  FORCE_PALETTE_SEED,
  evaluateForcePaletteContrast,
  formatForcePaletteReport,
  forcePaletteHexes,
  getForcePaletteHex,
} from '../src/data/palettes.js';
import {
  FORCE_PALETTE_CLAIMS,
  getForcePaletteClaim,
} from '../src/data/factionPaletteClaims.js';

test('PQ-161.02: five force channels disagree on hue', () => {
  assert.deepEqual([...FORCE_CHANNEL_IDS], ['rope', 'wells', 'repulsors', 'impulses', 'shields']);
  const hexes = FORCE_CHANNEL_IDS.map((id) => getForcePaletteHex(id));
  assert.equal(new Set(hexes.map((hex) => hex.toUpperCase())).size, 5);
  assert.equal(FORCE_PALETTE_SEED, 16120);
});

test('PQ-161.02: live stand-ins fail the contrast check (the gap)', () => {
  const before = evaluateForcePaletteContrast({
    seed: FORCE_PALETTE_SEED,
    palette: FORCE_PALETTE_LIVE_STANDINS,
  });
  assert.equal(before.ok, false, 'rope and wells still share cyan on the live stand-in');
  assert.equal(before.hues.rope.toUpperCase(), before.hues.wells.toUpperCase());
  assert.equal(before.trichromat.minDeltaE, 0);
  console.log('PQ-161.02 BEFORE (live stand-ins)\n' + formatForcePaletteReport(before));
});

test('PQ-161.02: seed 16120 contrast check is green under three CVD sims', () => {
  const result = evaluateForcePaletteContrast({ seed: 16120, palette: FORCE_PALETTE });
  assert.equal(result.seed, 16120);
  assert.equal(result.ok, true, result.errors.join('; ') || 'contrast check');
  assert.deepEqual(result.brightnessOrder, FORCE_BRIGHTNESS_ORDER);
  assert.ok(result.trichromat.minHueDeg >= FORCE_CONTRAST_FLOORS.minHueNoneDeg);

  for (const mode of FORCE_CVD_MODES) {
    const row = result.simulations[mode];
    assert.ok(row, mode);
    assert.ok(row.minDeltaE >= FORCE_CONTRAST_FLOORS.minDeltaE, `${mode} ΔE ${row.minDeltaE}`);
    assert.ok(row.minVoidContrast >= FORCE_CONTRAST_FLOORS.minVoidContrast, `${mode} void ${row.minVoidContrast}`);
    assert.equal(row.brightnessPreserved, true, `${mode} brightness order`);
    assert.deepEqual([...row.brightnessOrder], [...FORCE_BRIGHTNESS_ORDER]);
  }

  const report = formatForcePaletteReport(result);
  assert.match(report, /GREEN/);
  console.log(report);
});

test('PQ-161.02: claims pin the same five hues, not labels', () => {
  assert.equal(FORCE_PALETTE_CLAIMS.length, 5);
  const hexes = forcePaletteHexes(FORCE_PALETTE);
  for (const id of FORCE_CHANNEL_IDS) {
    const claim = getForcePaletteClaim(id);
    assert.ok(claim, id);
    assert.equal(claim.hex, hexes[id]);
    assert.equal(claim.channel, id);
    assert.equal(claim.brightnessRank, FORCE_BRIGHTNESS_ORDER.indexOf(id));
    assert.ok(claim.verb, `${id} verb`);
    assert.ok(claim.hueName, `${id} hue name`);
  }
});
