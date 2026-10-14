// PQ-165.00 — Presets and frame cap (headless numbers, fixed seed 16500).
//
// Proves the pure contracts this leaf adds:
//   • High performance / Balanced / High quality each select an adaptive-quality tier (render scale,
//     pixel-ratio cap, particle density, render graph, adaptive floor) and never touch simulation
//     content — no fewer actors. The chooser presses the mode whose tier the live video settings
//     match exactly; one hand-tweak un-presses it (the Modified note's contract).
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
  CANONICAL_QUALITY_PRESET_IDS,
  FRAME_CAP_OPTIONS,
  QUALITY_PRESETS,
  applyQualityPreset,
  createFrameCap,
  frameCapLabel,
  matchingQualityPreset,
  normalizeFrameCap,
  qualityTierForPreset,
  resolveFrameCap,
  stepFrameCapDebt,
  videoMatchesQualityTier,
} from '../src/render/adaptiveQuality.js';

const SEED = 16500;
const DISPLAY_HZ = 60;
const PRESET_IDS = ['low', 'medium', 'high'];
const CAP_VALUES = [30, 45, 60, 120, 0]; // 0 = off
const PRESET_VIDEO_KEYS = ['renderScale', 'pixelRatioCap', 'bloom', 'bloomLevels', 'shadows', 'energyMaterials', 'renderGraph', 'engineTrails', 'particleQuality'];

test('three presets each select an adaptive-quality tier (seed 16500)', () => {
  assert.equal(QUALITY_PRESETS.length, 5, 'the three picture presets plus iGPU 60 and Integrated GPU');
  assert.deepEqual(QUALITY_PRESETS.slice(0, 3).map((row) => row.id), PRESET_IDS);
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
  assert.deepEqual(moved, ['bloomLevels', 'particleQuality', 'pixelRatioCap', 'renderScale', 'sharpen'].sort(),
    'High performance moves shading resolution, particle density, bloom depth and sharpening only — the medium default already matches the rest');
  assert.equal(before.player.credits, beforeSnapshot.credits, 'credits untouched');
  assert.equal(Array.isArray(before.entityList) ? before.entityList.length : 0, beforeSnapshot.entityCount,
    'entity/actor count untouched — presets never cut content');
  assert.equal(JSON.stringify(before.settings.gameplay), beforeSnapshot.gameplay, 'gameplay settings untouched');
  assert.equal(JSON.stringify(before.settings.accessibility), beforeSnapshot.accessibility, 'accessibility untouched');
});

test('the chooser reflects the live picture: a fresh game is Balanced, a tweak un-presses', () => {
  assert.deepEqual(CANONICAL_QUALITY_PRESET_IDS, ['low', 'medium', 'high']);
  const state = createGameState(SEED);
  // A fresh install ships the Balanced picture exactly — the mode row presses Balanced.
  assert.equal(matchingQualityPreset(state.settings.video), 'medium');
  assert.equal(videoMatchesQualityTier(state.settings.video, 'medium'), true);
  applyQualityPreset(state.settings, 'low');
  assert.equal(state.settings.video.qualityPreset, 'low');
  assert.equal(matchingQualityPreset(state.settings.video), 'low');
  // One hand-tweak off the tier and no mode is pressed any more — the Modified note's contract.
  state.settings.video.renderScale = 0.9;
  assert.equal(matchingQualityPreset(state.settings.video), null);
  assert.equal(videoMatchesQualityTier(state.settings.video, 'low'), false);
  assert.equal(matchingQualityPreset(null), null);
  assert.equal(videoMatchesQualityTier(undefined, 'low'), false);
});

test('four frame-cap values resolve against the live cap (seed 16500)', () => {
  assert.deepEqual(FRAME_CAP_OPTIONS, [30, 45, 60, 120, 0]);
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
  assert.equal(rows.length, 5, 'five cap values measured');
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

test('new games persist a quality preset and an uncapped frame-cap default (seed 16500)', () => {
  const state = createGameState(SEED);
  assert.equal(state.settings.video.qualityPreset, 'medium');
  assert.equal(state.settings.video.frameCap, 0);
});

test('frame-cap debt presents on rAF beats (30 on 60, 120 on 144)', () => {
  // 30 fps on a 60 Hz panel: every other callback.
  let debt = 0;
  let presents = 0;
  for (let i = 0; i < 12; i++) {
    const step = stepFrameCapDebt({ cap: 30, displayHz: 60, debt });
    debt = step.debt;
    if (step.present) presents += 1;
  }
  assert.equal(presents, 6, '30 fps on 60 Hz presents 6 of 12 rAFs');

  // Uncapped / cap at refresh: every callback.
  debt = 0;
  presents = 0;
  for (let i = 0; i < 12; i++) {
    const step = stepFrameCapDebt({ cap: 60, displayHz: 60, debt });
    debt = step.debt;
    if (step.present) presents += 1;
  }
  assert.equal(presents, 12, 'cap at refresh presents every rAF');

  // 120 fps on 144 Hz: five of six callbacks (144 * 5/6 = 120).
  debt = 0;
  presents = 0;
  for (let i = 0; i < 144; i++) {
    const step = stepFrameCapDebt({ cap: 120, displayHz: 144, debt });
    debt = step.debt;
    if (step.present) presents += 1;
  }
  assert.equal(presents, 120, '120 fps on 144 Hz presents 120 of 144 rAFs');
});

test('settings screen surfaces the quality modes and frame cap and preserves the Language row', () => {
  const source = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  assert.match(source, /'Quality mode'/, 'Video tab has a segmented Quality mode row');
  assert.match(source, /'High performance'/, 'the High performance mode is on the chooser');
  assert.match(source, /'High quality'/, 'the High quality mode is on the chooser');
  assert.match(source, /'Hardware preset'/, 'the hardware bundles keep their own row');
  assert.match(source, /matchingQualityPreset/, 'the chooser presses the mode the live picture matches');
  assert.match(source, /'Frame cap'/, 'Video tab has a Frame cap row');
  assert.match(source, /QUALITY_PRESETS/, 'the mode row is driven by the shared preset table');
  assert.match(source, /applyQualityPreset/, 'the mode row applies the shared tier contract');
  assert.match(source, /publishFrameCap/, 'preset application keeps the live frame cap in step');
  assert.match(source, /createFrameCap/, 'frame cap uses the shared controller');
  assert.match(source, /'Language'/, 'the Language row is preserved');
  assert.match(source, /LANGUAGE_OPTIONS/, 'the Language row still uses the locale options');
});
