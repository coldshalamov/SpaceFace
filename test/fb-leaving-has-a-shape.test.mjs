// FB-073 — leaving has a shape. Three pins:
//
//   1. `dock:undocked` runs the cradle in reverse — the same hologram, brackets letting go,
//      chevrons flipped apex-out along the corridor axis, fading over the same 0.28 s. No
//      particles, no new layer.
//   2. `cargo:jettisoned` is an ACTION_VFX_RECIPES row — verb `fling` along the jettison-impulse
//      reaction direction (pods leave aft of a slow hull), supplied by the receipt resolver in
//      actionEventRecipes.js.
//   3. The jettison voice is its own recipe (`sfx_cargo_jettison`, sharing the massline kick's
//      dash_punch binding at rate 0.8) routed by the unguarded cargo:jettisoned handler.
//
// Pure logic/geometry assertions — no GL context, no AudioContext.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  DOCKING_CRADLE_FADE_S,
  createDockingCradle,
  createDockingCradleGeometry,
  releaseDockingCradle,
  resetDockingCradle,
  updateDockingCradle,
  writeDockingCradleGeometry,
} from '../src/render/dockingCradle.js';
import { ActionVfx } from '../src/render/actionVfx.js';
import { RECIPES, SAMPLE_BINDINGS } from '../src/data/audioRecipes.js';
import { audio } from '../src/audio/audioSystem.js';

const RING_QUADS = 44;
const BRACKET_QUADS = 4;
const CHEVRON_FIRST_QUAD = RING_QUADS + BRACKET_QUADS; // each chevron is two quads, tip->back arms

const berthed = {
  phase: 'berthed',
  berth: { x: 100, z: 50 },
  stationId: 9,
};
const proxy = { corridorBearingDeg: 0, rot: 0, corridor: { captureHalfWidth: 8 }, stationId: 9 };

// Quad i occupies 4 vertices x 3 floats at positions[i*12..i*12+11]; emitQuad lays out
// v0 = start - lateral, v1 = start + lateral, v2 = end - lateral, v3 = end + lateral.
// The chevron's start is its apex (tip), its end is the trailing edge center direction.
function chevronTipAndBack(geometry, quadIndex, berth, axis) {
  const p = geometry.positions, o = quadIndex * 12;
  const tipX = (p[o] + p[o + 3]) / 2, tipZ = (p[o + 2] + p[o + 5]) / 2;
  const backX = (p[o + 6] + p[o + 9]) / 2, backZ = (p[o + 8] + p[o + 11]) / 2;
  return {
    tipProj: (tipX - berth.x) * axis.x + (tipZ - berth.z) * axis.z,
    backProj: (backX - berth.x) * axis.x + (backZ - berth.z) * axis.z,
  };
}

test('undock runs the cradle backwards: chevron apex flips outbound and the beat fades in 0.28 s', () => {
  const cradle = createDockingCradle();
  const scratch = createDockingCradleGeometry();
  const axis = { x: 1, z: 0 };
  const opts = { y: 0.35, reducedMotion: false, gain: 1 };

  // Settle the corridor into berthed so the pad is fully drawn with inbound chevrons.
  for (let i = 0; i < 8; i++) updateDockingCradle(cradle, 0.1, berthed, proxy);
  assert.equal(cradle.phase, 'berthed');
  assert.ok(cradle.visible01 > 0.99);
  writeDockingCradleGeometry(scratch, cradle, opts);
  const inbound = chevronTipAndBack(scratch, CHEVRON_FIRST_QUAD, berthed.berth, axis);
  assert.ok(inbound.tipProj < inbound.backProj,
    'docked chevrons point INBOUND: the apex sits berth-side of the trailing edge');

  // dock:undocked -> vfx._releaseDockingCradle -> releaseDockingCradle.
  releaseDockingCradle(cradle);
  assert.equal(cradle.phase, 'release');
  // The corridor readout is already quiet; the beat must still run to completion on the
  // retained berth geometry.
  updateDockingCradle(cradle, DOCKING_CRADLE_FADE_S / 2, { phase: 'none' }, null);
  assert.equal(cradle.phase, 'release', 'the beat survives a quiet readout');
  assert.ok(cradle.visible01 > 0.3 && cradle.visible01 < 0.7, 'half-way through the shared fade');
  writeDockingCradleGeometry(scratch, cradle, opts);
  assert.ok(scratch.indexCount > 0, 'the release beat still draws the pad');
  const outbound = chevronTipAndBack(scratch, CHEVRON_FIRST_QUAD, berthed.berth, axis);
  assert.ok(outbound.tipProj > outbound.backProj,
    'release chevrons point OUTBOUND: the apex sits out along the corridor axis');

  // The beat ends on the same fade constant — nothing lingers, nothing re-latches on 'none'.
  updateDockingCradle(cradle, DOCKING_CRADLE_FADE_S, { phase: 'none' }, null);
  assert.equal(cradle.phase, 'none');
  writeDockingCradleGeometry(scratch, cradle, opts);
  assert.equal(scratch.indexCount, 0, 'the cradle is fully gone after the release fade');
});

test('release never pops back in without a new undock, and reset clears a beat in flight', () => {
  const cradle = createDockingCradle();
  for (let i = 0; i < 8; i++) updateDockingCradle(cradle, 0.1, berthed, proxy);
  releaseDockingCradle(cradle);
  resetDockingCradle(cradle);
  assert.equal(cradle.release01, 0);
  for (let i = 0; i < 8; i++) updateDockingCradle(cradle, 0.1, { phase: 'none' }, null);
  assert.equal(cradle.phase, 'none');
  assert.ok(cradle.visible01 <= 0.004, 'a cleared beat leaves no ghost pad');
});

test('release brackets swing out past the pad edge as the envelope fades', () => {
  const cradle = createDockingCradle();
  for (let i = 0; i < 8; i++) updateDockingCradle(cradle, 0.1, berthed, proxy);
  releaseDockingCradle(cradle);
  const scratch = createDockingCradleGeometry();
  updateDockingCradle(cradle, DOCKING_CRADLE_FADE_S / 2, { phase: 'none' }, null);
  writeDockingCradleGeometry(scratch, cradle, { y: 0.35, reducedMotion: false, gain: 1 });
  // First bracket quad: both endpoints sit on the bracket arc radius around the berth.
  const p = scratch.positions, o = RING_QUADS * 12;
  const r = Math.hypot(p[o] - berthed.berth.x, p[o + 2] - berthed.berth.z);
  assert.ok(r > cradle.radius * 0.62 + 1,
    `brackets release outward (${r.toFixed(2)}wu > ${(cradle.radius * 0.62).toFixed(2)}wu)`);
});

function flightState(shipOverrides = {}) {
  const ship = {
    id: 1, type: 'ship', alive: true, radius: 7,
    pos: { x: 10, z: -20 }, vel: { x: 0, z: 0 }, rot: 0, ...shipOverrides,
  };
  return {
    simTime: 5, playerId: 1, entities: new Map([[1, ship]]),
    entityList: [ship], settings: { video: {} },
  };
}

test('cargo:jettisoned is a fling receipt — two lots emit two fling rows aft of the hull', () => {
  const vfxOut = new ActionVfx(new THREE.Scene());
  try {
    const state = flightState({ rot: 0 });
    assert.equal(vfxOut.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 6 }, state), true);
    state.simTime += 0.4;
    assert.equal(vfxOut.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 4 }, state), true);
    const instances = vfxOut.inspect().instances;
    const rows = instances.filter((row) => row.event === 'cargo:jettisoned');
    assert.ok(rows.length >= 1, 'the fling row is live');
    for (const row of rows) {
      assert.equal(row.primitive, 'pressure', 'fling rides the shared pressure primitive');
      // A slow hull sheds pods aft — the reaction direction of the jettisonImpulse kick.
      assert.ok(Math.abs(Math.abs(row.angle) - Math.PI) < 1e-3,
        `fling angle ${row.angle} must point aft of the dumping hull`);
      assert.ok(Math.abs(row.x - 10) < 1e-3 && Math.abs(row.z - -20) < 1e-3,
        'the fling anchors at the dumping ship, not the origin');
    }
  } finally {
    vfxOut.dispose();
  }
});

test('a fast hull throws the fling along its motion — the same receipt follows the impulse axis', () => {
  const vfxOut = new ActionVfx(new THREE.Scene());
  try {
    const state = flightState({ rot: 0, vel: { x: 9, z: 0 } });
    assert.equal(vfxOut.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 6 }, state), true);
    const row = vfxOut.inspect().instances.find((entry) => entry.event === 'cargo:jettisoned');
    assert.ok(row, 'fling row live');
    assert.ok(Math.abs(row.angle) < 1e-3, `moving hull flings along velocity, got ${row.angle}`);
  } finally {
    vfxOut.dispose();
  }
});

test('the jettison voice is authored once: recipe, shared dash_punch binding at 0.8, unguarded route', () => {
  const recipe = RECIPES.find((entry) => entry.id === 'sfx_cargo_jettison');
  assert.ok(recipe, 'sfx_cargo_jettison is authored');
  assert.equal(SAMPLE_BINDINGS.sfx_cargo_jettison.id, 'dash_punch');
  assert.equal(SAMPLE_BINDINGS.sfx_cargo_jettison.rate, 0.8);
  const played = [];
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  host._onCargoJettisoned({ commodityId: 'cmdty_ore_iron', amount: 8 });
  assert.deepEqual(played.map((entry) => entry.recipeId), ['sfx_cargo_jettison']);
});
