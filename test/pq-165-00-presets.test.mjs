// PQ-165.00 — Presets and frame cap (headless numbers, fixed seed 16500).
//
// Proves the pure contracts this leaf adds:
//   • Low / Medium / High each select an adaptive-quality tier (render scale, particle density,
//     render graph, adaptive floor) and never touch simulation content — no fewer actors.
//   • Frame cap 30 / 60 / 120 / off resolves against the live cap.
//   • VSync is honoured: a cap never exceeds the display refresh when VSync is on, and off means
//     the display refresh (VSync on) or uncapped (VSync off).
//
//   node --test test/pq-165-00-presets.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  ADAPTIVE_QUALITY_TIERS,
  FRAME_CAP_OPTIONS,
  QUALITY_PRESETS,
  applyQualityPreset,
  createFrameCap,
  frameCapLabel,
  normalizeFrameCap,
  qualityTierForPreset,
  resolveFrameCap,
} from '../src/render/adaptiveQuality.js';

const SEED = 16500;
const DISPLAY_HZ = 60;
const PRESET_IDS = ['low', 'medium', 'high'];
const CAP_VALUES = [30, 60, 120, 0]; // 0 = off
const PRESET_VIDEO_KEYS = ['renderScale', 'bloom', 'shadows', 'energyMaterials', 'renderGraph', 'engineTrails', 'particleQuality'];

test('three presets each select an adaptive-quality tier (seed 16500)', () => {
  assert.equal(QUALITY_PRESETS.length, 3, 'exactly three player presets');
  const rows = [];
  for (const presetId of PRESET_IDS) {
    const state = createGameState(SEED);
    const applied = applyQualityPreset(state.settings, presetId);
    const tier = qualityTierForPreset(presetId);
    assert.ok(tier, `${presetId} must select a tier`);
    assert.equal(applied.tier, presetId, `${presetId} selects the ${presetId} tier`);
    assert.equal(state.settings.video.qualityPreset, presetId, 'preset id is persisted on video');
    for (const key of PRESET_VIDEO_KEYS) {
      assert.equal(state.settings.video[key], tier[key], `${presetId}.${key} matches its tier`);
    }
    assert.ok(ADAPTIVE_QUALITY_TIERS[tier.id], 'tier id is a registered adaptive-quality tier');
    rows.push({
      preset: presetId,
      tier: tier.id,
      adaptiveFloor: tier.adaptiveFloor,
      renderScale: tier.renderScale,
      particleQuality: tier.particleQuality,
      renderGraph: tier.renderGraph,
    });
  }
  console.log('pq-165.00 adaptive-quality tier per preset (seed 16500):');
  for (const row of rows) console.log('  ', JSON.stringify(row));
  // Three distinct tiers, not one bucket relabelled.
  assert.equal(new Set(rows.map((r) => r.tier)).size, 3, 'three distinct tiers');
});

test('preset switch is captured: only presentation keys move, no content changes', () => {
  const before = createGameState(SEED);
  const beforeSnapshot = {
    credits: before.player.credits,
    entityCount: Array.isArray(before.entityList) ? before.entityList.length : 0,
    gameplay: JSON.stringify(before.settings.gameplay),
    accessibility: JSON.stringify(before.settings.accessibility),
  };
  const applied = applyQualityPreset(before.settings, 'low');
  assert.ok(applied.changed.includes('qualityPreset'), 'the preset id is recorded as changed');
  // Only the declared presentation keys may differ from the medium default.
  const moved = applied.changed.filter((key) => key !== 'qualityPreset').sort();
  assert.deepEqual(moved, ['particleQuality', 'renderScale'].sort(),
    'Low moves resolution and particle density only — medium default already matches the rest');
  assert.equal(before.player.credits, beforeSnapshot.credits, 'credits untouched');
  assert.equal(Array.isArray(before.entityList) ? before.entityList.length : 0, beforeSnapshot.entityCount,
    'entity/actor count untouched — presets never cut content');
  assert.equal(JSON.stringify(before.settings.gameplay), beforeSnapshot.gameplay, 'gameplay settings untouched');
  assert.equal(JSON.stringify(before.settings.accessibility), beforeSnapshot.accessibility, 'accessibility untouched');
});

test('four frame-cap values resolve against the live cap (seed 16500)', () => {
  assert.deepEqual(FRAME_CAP_OPTIONS, [30, 60, 120, 0]);
  const live = { cap: null };
  const controller = createFrameCap({ vsync: true, displayHz: DISPLAY_HZ, apply: (cap) => { live.cap = cap; } });
  const rows = [];
  for (const cap of CAP_VALUES) {
    const effective = controller.setCap(cap);
    assert.equal(live.cap, effective, `effective cap is applied to the live cap for ${cap}`);
    assert.equal(effective, resolveFrameCap({ cap, vsync: true, displayHz: DISPLAY_HZ }));
    assert.equal(frameCapLabel(cap), cap === 0 ? 'Off' : `${cap} fps`);
    assert.equal(normalizeFrameCap(cap), cap);
    rows.push({ requested: cap, label: frameCapLabel(cap), vsync: true, displayHz: DISPLAY_HZ, effectiveLiveCap: live.cap });
  }
  console.log('pq-165.00 frame cap applied to the live cap (seed 16500):');
  for (const row of rows) console.log('  ', JSON.stringify(row));
  assert.equal(rows.length, 4, 'four cap values measured');
});

test('VSync flag is read: cap can never exceed the display refresh', () => {
  // VSync on, 60 Hz panel: 120 is clamped to 60, off follows the refresh.
  assert.equal(resolveFrameCap({ cap: 120, vsync: true, displayHz: 60 }), 60);
  assert.equal(resolveFrameCap({ cap: 60, vsync: true, displayHz: 60 }), 60);
  assert.equal(resolveFrameCap({ cap: 30, vsync: true, displayHz: 60 }), 30);
  assert.equal(resolveFrameCap({ cap: 0, vsync: true, displayHz: 60 }), 60);
  // VSync off: the request is the cap, off is uncapped.
  assert.equal(resolveFrameCap({ cap: 120, vsync: false, displayHz: 60 }), 120);
  assert.equal(resolveFrameCap({ cap: 60, vsync: false, displayHz: 60 }), 60);
  assert.equal(resolveFrameCap({ cap: 30, vsync: false, displayHz: 60 }), 30);
  assert.equal(resolveFrameCap({ cap: 0, vsync: false, displayHz: 60 }), 0);
  // A 144 Hz panel is not needlessly clamped.
  assert.equal(resolveFrameCap({ cap: 120, vsync: true, displayHz: 144 }), 120);
  assert.equal(resolveFrameCap({ cap: 0, vsync: true, displayHz: 144 }), 144);

  const live = { cap: null };
  const controller = createFrameCap({ vsync: true, displayHz: 60, apply: (cap) => { live.cap = cap; } });
  controller.setCap(120);
  assert.equal(live.cap, 60, '120 on a 60 Hz vsync display is 60');
  controller.setVsync(false);
  assert.equal(live.cap, 120, 'turning VSync off lets the 120 request through');
  controller.setVsync(true);
  assert.equal(live.cap, 60, 'turning VSync back on re-clamps the live cap');
  controller.setDisplayHz(144);
  assert.equal(live.cap, 120, 'a 144 Hz panel lets the 120 request through');
});

test('settings screen surfaces the preset and frame cap and preserves the Language row', () => {
  const source = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  assert.match(source, /'Quality preset'/, 'Video tab has a Quality preset row');
  assert.match(source, /'Frame cap'/, 'Video tab has a Frame cap row');
  assert.match(source, /QUALITY_PRESETS/, 'preset row is driven by the shared preset table');
  assert.match(source, /applyQualityPreset/, 'preset row applies the shared tier contract');
  assert.match(source, /createFrameCap/, 'frame cap uses the shared controller');
  assert.match(source, /'Language'/, 'the Language row is preserved');
  assert.match(source, /LANGUAGE_OPTIONS/, 'the Language row still uses the locale options');
});
