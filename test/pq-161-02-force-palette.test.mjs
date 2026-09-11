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
  FACTION_PALETTES,
  TELEGRAPH_FORCE_CHANNELS,
  evaluateForcePaletteContrast,
  formatForcePaletteReport,
  forceChannelForTelegraphKind,
  forcePaletteHexes,
  getForcePaletteHex,
  minPairDeltaE,
} from '../src/data/palettes.js';
import {
  FORCE_PALETTE_CLAIMS,
  getForcePaletteClaim,
} from '../src/data/factionPaletteClaims.js';

test('PQ-161.02: five force channels disagree on hue', () => {
  assert.deepEqual([...FORCE_CHANNEL_IDS], ['rope', 'wells', 'repulsors', 'impulses', 'shields']);
  const hexes = FORCE_CHANNEL_IDS.map((id) => getForcePaletteHex(id));
  assert.equal(new Set(hexes.map((hex) => hex.toUpperCase())).size, 5);
  assert.equal(FORCE_PALETTE_SEED, 16102);
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

test('PQ-161.02: seed 16102 contrast check is green under three CVD sims', () => {
  const result = evaluateForcePaletteContrast({ seed: 16102, palette: FORCE_PALETTE });
  assert.equal(result.seed, 16102);
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

const TELEGRAPH_VISION_MODES = Object.freeze(['none', 'deuteranopia', 'protanopia']);

test('PQ-161.02: minPairDeltaE separates every force pair under normal and CVD vision', () => {
  const modes = ['none', ...FORCE_CVD_MODES];
  let worst = { de: Infinity, a: null, b: null, mode: null };
  for (let i = 0; i < FORCE_CHANNEL_IDS.length; i++) {
    for (let j = i + 1; j < FORCE_CHANNEL_IDS.length; j++) {
      const a = FORCE_CHANNEL_IDS[i];
      const b = FORCE_CHANNEL_IDS[j];
      for (const mode of modes) {
        const de = minPairDeltaE(getForcePaletteHex(a), getForcePaletteHex(b), [mode]);
        assert.ok(Number.isFinite(de), `${a} vs ${b} ${mode}`);
        if (de < worst.de) worst = { de, a, b, mode };
        assert.ok(
          de >= FORCE_CONTRAST_FLOORS.minDeltaE,
          `${a} vs ${b} ${mode} ΔE ${de.toFixed(2)} < ${FORCE_CONTRAST_FLOORS.minDeltaE}`,
        );
      }
    }
  }
  console.log(`PQ-161.02 minPairDeltaE force-vs-force min=${worst.de.toFixed(2)} pair=${worst.a}-${worst.b} mode=${worst.mode} seed ${FORCE_PALETTE_SEED}`);
});

test('PQ-161.02: telegraph kinds map to force channels, never faction identity', () => {
  const kinds = Object.keys(TELEGRAPH_FORCE_CHANNELS);
  assert.deepEqual(kinds.sort(), ['attach_spool', 'engine_flare', 'wake_mines', 'weapon_charge']);
  const used = new Set();
  for (const kind of kinds) {
    const channel = forceChannelForTelegraphKind(kind);
    assert.equal(channel, TELEGRAPH_FORCE_CHANNELS[kind]);
    assert.equal(FORCE_CHANNEL_IDS.includes(channel), true, `${kind} maps to a force channel`);
    assert.equal(String(channel).startsWith('faction_'), false);
    used.add(channel);
  }
  assert.ok(used.size >= 2, 'telegraph kinds do not collapse onto one force hue');

  const channels = [...used];
  let worst = { de: Infinity, a: null, b: null, mode: null };
  for (let i = 0; i < channels.length; i++) {
    for (let j = i + 1; j < channels.length; j++) {
      for (const mode of TELEGRAPH_VISION_MODES) {
        const de = minPairDeltaE(getForcePaletteHex(channels[i]), getForcePaletteHex(channels[j]), [mode]);
        if (de < worst.de) worst = { de, a: channels[i], b: channels[j], mode };
        assert.ok(
          de >= FORCE_CONTRAST_FLOORS.minDeltaE,
          `telegraph ${channels[i]} vs ${channels[j]} ${mode} ΔE ${de.toFixed(2)} < ${FORCE_CONTRAST_FLOORS.minDeltaE}`,
        );
      }
    }
  }
  console.log(`PQ-161.02 telegraph-force minPairDeltaE min=${worst.de.toFixed(2)} pair=${worst.a}-${worst.b} mode=${worst.mode}`);

  let factionWorst = { de: Infinity, factionId: null, channel: null, mode: null };
  for (const [factionId, palette] of Object.entries(FACTION_PALETTES)) {
    for (const channel of channels) {
      for (const mode of TELEGRAPH_VISION_MODES) {
        const de = minPairDeltaE(getForcePaletteHex(channel), palette.primary, [mode]);
        if (de < factionWorst.de) factionWorst = { de, factionId, channel, mode };
      }
    }
  }
  console.log(`PQ-161.02 faction-primary vs telegraph-force minPairDeltaE min=${factionWorst.de.toFixed(2)} faction=${factionWorst.factionId} channel=${factionWorst.channel} mode=${factionWorst.mode} (identity stays a separate data-faction channel; this is not the force floor)`);
  assert.ok(Number.isFinite(factionWorst.de), 'faction vs force ΔE is measurable');
});
