// WF-12 law/heat telegraph (scan sweep · suspicion · WANTED flip).
//
// Cues must appear/disappear with authoritative events only (GDX-A25). Presentation reads
// player:scannedByPatrol and heat:changed; it never invents heat/law state. Shared EVENT_LIGHT
// pool only — no new pool.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import {
  LAW_HEAT_ADMISSION,
  LAW_HEAT_LIGHT_KEY,
  LAW_HEAT_SCAN_SWEEP_LIFE_S,
  LAW_HEAT_WANTED_FLIP_LIFE_S,
  LAW_HEAT_WORST_CASE_LIGHT_SLOTS,
  createLawHeatTelegraphController,
  resolveHeatTelegraphStamps,
  resolveScanSweepStamp,
  scanSweepIntensity,
  suspicionDisplayIntensity,
  suspicionFromHeat,
} from '../src/render/lawHeatTelegraphVfx.js';
import { EVENT_LIGHT_POOL_SIZE, vfx } from '../src/render/vfx.js';
import { heat, THRESHOLD as WANTED_THRESHOLD } from '../src/systems/heat.js';

const DT = 1 / 60;
const PLAYER_ID = 7;

function makeVfxHarness({ motionReduce = false, flashReduce = false } = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 40, z: -12 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
  };
  const state = {
    playerId: PLAYER_ID,
    player: { heat: 0 },
    entities: new Map([[PLAYER_ID, player]]),
    entityList: [player],
    simTime: 0,
    tick: 0,
    settings: {
      video: { particleQuality: 'low', motionReduce, engineTrails: false },
      accessibility: { flashReduce },
    },
    render: { scene },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  return { system, state, bus, player, scene };
}

function sustained(system, key) {
  return system._lights && system._lights.find((slot) => slot.active && slot.sustainedKey === key) || null;
}

function activeLightCount(system) {
  return system._lights ? system._lights.filter((s) => s.active).length : 0;
}

// ── Pure grammar ─────────────────────────────────────────────────────────────

test('suspicionFromHeat scales to the WANTED threshold without inventing values', () => {
  assert.equal(suspicionFromHeat(0), 0);
  assert.equal(suspicionFromHeat(WANTED_THRESHOLD * 0.5), 0.5);
  assert.equal(suspicionFromHeat(WANTED_THRESHOLD), 1);
  assert.equal(suspicionFromHeat(WANTED_THRESHOLD * 2), 1);
  assert.equal(suspicionFromHeat(Number.NaN), 0);
});

test('resolveScanSweepStamp requires a real scanned hull fact', () => {
  assert.equal(resolveScanSweepStamp(null), null);
  assert.equal(resolveScanSweepStamp({}), null);
  assert.equal(resolveScanSweepStamp({ active: false, targetId: 1 }), null);

  const withTarget = resolveScanSweepStamp({ targetId: 9, patrolId: 3, hasContraband: true });
  assert.equal(withTarget.active, true);
  assert.equal(withTarget.targetId, 9);
  assert.equal(withTarget.patrolId, 3);
  assert.equal(withTarget.hasContraband, true);
  assert.equal(withTarget.life, LAW_HEAT_SCAN_SWEEP_LIFE_S);

  const withPos = resolveScanSweepStamp({ pos: { x: 1, z: 2 } });
  assert.equal(withPos.hasPos, true);
  assert.equal(withPos.x, 1);
  assert.equal(withPos.z, 2);
});

test('resolveHeatTelegraphStamps keys suspicion and WANTED flip on heat edges', () => {
  const building = resolveHeatTelegraphStamps({
    value: 0.08,
    previousValue: 0,
    threshold: WANTED_THRESHOLD,
  });
  assert.equal(building.suspicion.active, true);
  assert.ok(building.suspicion.intensity > 0 && building.suspicion.intensity < 1);
  assert.equal(building.wantedFlip, null);

  const flip = resolveHeatTelegraphStamps({
    value: 0.2,
    previousValue: 0.08,
    wanted: true,
    wantedCrossed: true,
    threshold: WANTED_THRESHOLD,
  });
  assert.equal(flip.suspicion.active, false);
  assert.equal(flip.wantedFlip.active, true);
  assert.equal(flip.wantedFlip.life, LAW_HEAT_WANTED_FLIP_LIFE_S);

  const clear = resolveHeatTelegraphStamps({
    value: 0,
    previousValue: 0.2,
    wanted: false,
    wantedCrossed: true,
  });
  assert.equal(clear.suspicion.active, false);
  assert.equal(clear.wantedFlip.active, false);
});

test('reduced-motion intensities are static steps; full motion sweeps without strobe', () => {
  const full = [0, 0.25, 0.5, 0.75, 1].map((t) => scanSweepIntensity(
    t * LAW_HEAT_SCAN_SWEEP_LIFE_S,
    LAW_HEAT_SCAN_SWEEP_LIFE_S,
    false,
  ));
  const reduced = [0, 0.25, 0.5, 0.75, 1].map((t) => scanSweepIntensity(
    t * LAW_HEAT_SCAN_SWEEP_LIFE_S,
    LAW_HEAT_SCAN_SWEEP_LIFE_S,
    true,
  ));
  // Full: smooth half-sine — mid higher than ends.
  assert.ok(full[2] > full[0] && full[2] > full[4]);
  // Reduced: only three discrete steps.
  assert.equal(new Set(reduced.slice(0, 4).map((v) => v.toFixed(2))).size <= 3, true);
  assert.equal(suspicionDisplayIntensity(0.2, true), 0.18);
  assert.equal(suspicionDisplayIntensity(0.5, true), 0.32);
  assert.equal(suspicionDisplayIntensity(0.9, true), 0.48);
});

test('controller stamps appear and expire exactly with authoritative events', () => {
  const ctrl = createLawHeatTelegraphController();
  assert.equal(ctrl.acceptScan({ targetId: PLAYER_ID, pos: { x: 1, z: 2 } }, 10), true);
  assert.equal(ctrl.stamp().scanSweep.active, true);
  assert.equal(ctrl.inspect().scanStarts, 1);

  // Age past life → gone.
  ctrl.update(LAW_HEAT_SCAN_SWEEP_LIFE_S + 0.01, {});
  assert.equal(ctrl.stamp().scanSweep, null);

  // Suspicion builds below WANTED.
  ctrl.acceptHeat({
    value: 0.06,
    previousValue: 0,
    suspicion: 0.06 / WANTED_THRESHOLD,
    wanted: false,
    wantedCrossed: false,
    threshold: WANTED_THRESHOLD,
  });
  assert.equal(ctrl.stamp().suspicion.active, true);
  assert.equal(ctrl.stamp().wantedFlip, null);

  // Crossing WANTED starts the flip and clears suspicion.
  const flip = ctrl.acceptHeat({
    value: 0.2,
    previousValue: 0.06,
    wanted: true,
    wantedCrossed: true,
    threshold: WANTED_THRESHOLD,
  });
  assert.equal(flip.wantedFlipStarted, true);
  assert.equal(ctrl.stamp().suspicion, null);
  assert.equal(ctrl.stamp().wantedFlip.active, true);
  assert.equal(ctrl.consumeWantedPulse() > 0, true);
  assert.equal(ctrl.consumeWantedPulse(), 0, 'pulse token is one-shot');

  ctrl.update(LAW_HEAT_WANTED_FLIP_LIFE_S + 0.01, {});
  assert.equal(ctrl.stamp().wantedFlip, null);

  // Heat clear removes suspicion.
  ctrl.acceptHeat({
    value: 0.05,
    previousValue: 0,
    wanted: false,
    wantedCrossed: false,
    threshold: WANTED_THRESHOLD,
  });
  assert.equal(ctrl.stamp().suspicion.active, true);
  ctrl.update(DT, { heatValue: 0 });
  assert.equal(ctrl.stamp().suspicion, null);
});

test('worst-case pool occupancy is bounded and fits EVENT_LIGHT_POOL_SIZE', () => {
  assert.equal(LAW_HEAT_WORST_CASE_LIGHT_SLOTS, 3);
  assert.ok(LAW_HEAT_WORST_CASE_LIGHT_SLOTS < EVENT_LIGHT_POOL_SIZE);
  assert.ok(LAW_HEAT_ADMISSION.WANTED_FLIP > LAW_HEAT_ADMISSION.SCAN_SWEEP);
  assert.ok(LAW_HEAT_ADMISSION.SCAN_SWEEP > LAW_HEAT_ADMISSION.SUSPICION);
});

// ── Live VFX layer ───────────────────────────────────────────────────────────

test('vfx layer: scan event lights a sweep slot; expiry retires it', () => {
  const { system, bus, state } = makeVfxHarness();
  assert.ok(system._lights && system._lights.length === EVENT_LIGHT_POOL_SIZE);

  bus.emit('player:scannedByPatrol', {
    hasContraband: false,
    patrolId: 99,
    targetId: PLAYER_ID,
  });
  assert.equal(system.inspect().lawHeatTelegraph.scanStarts, 1);
  assert.ok(system.inspect().lawHeatTelegraph.scanSweep);

  // Apply lights via the update path.
  system._updateLawHeatTelegraph(DT);
  const sweep = sustained(system, LAW_HEAT_LIGHT_KEY.SCAN_SWEEP);
  assert.ok(sweep, 'scan sweep claims a sustained event-light slot');
  assert.ok(sweep.obj.intensity > 0);
  assert.equal(sweep.admissionPriority, LAW_HEAT_ADMISSION.SCAN_SWEEP);

  // Drain lifetime.
  system._updateLawHeatTelegraph(LAW_HEAT_SCAN_SWEEP_LIFE_S + 0.05);
  assert.equal(system.inspect().lawHeatTelegraph.scanSweep, null);
  assert.equal(sustained(system, LAW_HEAT_LIGHT_KEY.SCAN_SWEEP), null);
  assert.equal(state.player.heat, 0, 'presentation never writes heat');
});

test('vfx layer: heat:changed drives suspicion then one WANTED flip pulse', () => {
  const { system, bus, state } = makeVfxHarness();

  bus.emit('heat:changed', {
    value: 0.07,
    previousValue: 0,
    level: 0,
    wanted: false,
    wantedCrossed: false,
    suspicion: 0.07 / WANTED_THRESHOLD,
    threshold: WANTED_THRESHOLD,
    reason: 'unprovoked hit',
  });
  state.player.heat = 0.07;
  system._updateLawHeatTelegraph(DT);
  const sus = sustained(system, LAW_HEAT_LIGHT_KEY.SUSPICION);
  assert.ok(sus, 'suspicion claims a sustained event-light slot');
  assert.ok(system.inspect().lawHeatTelegraph.suspicion);
  assert.ok(system.inspect().lawHeatTelegraph.suspicion.intensity > 0);

  const lightsBeforeFlip = activeLightCount(system);
  bus.emit('heat:changed', {
    value: 0.22,
    previousValue: 0.07,
    level: 2,
    wanted: true,
    wantedCrossed: true,
    suspicion: 1,
    threshold: WANTED_THRESHOLD,
    reason: 'piracy kill',
  });
  state.player.heat = 0.22;
  system._updateLawHeatTelegraph(DT);

  assert.equal(system.inspect().lawHeatTelegraph.wantedFlips, 1);
  assert.ok(system.inspect().lawHeatTelegraph.wantedFlip);
  assert.equal(system.inspect().lawHeatTelegraph.suspicion, null,
    'suspicion yields once WANTED is authoritative');
  assert.equal(sustained(system, LAW_HEAT_LIGHT_KEY.SUSPICION), null);
  // WANTED flip used a transient slot (or reused free); active count stays within pool.
  assert.ok(activeLightCount(system) <= EVENT_LIGHT_POOL_SIZE);
  assert.ok(activeLightCount(system) >= lightsBeforeFlip
    || system._lights.some((s) => s.active && s.sustainedKey == null),
  'WANTED flip activates a transient pool light');

  // Second update must not re-fire the one-shot pulse token.
  const serialBefore = system.inspect().lawHeatTelegraph.wantedFlips;
  system._updateLawHeatTelegraph(DT);
  assert.equal(system.inspect().lawHeatTelegraph.wantedFlips, serialBefore);
});

test('vfx layer: reduced-flash / reduced-motion keep facts, never invent intensity', () => {
  const full = makeVfxHarness();
  const reduced = makeVfxHarness({ motionReduce: true, flashReduce: true });

  for (const h of [full, reduced]) {
    h.bus.emit('player:scannedByPatrol', { targetId: PLAYER_ID, hasContraband: false });
    h.bus.emit('heat:changed', {
      value: 0.05,
      previousValue: 0,
      wanted: false,
      wantedCrossed: false,
      suspicion: 0.05 / WANTED_THRESHOLD,
      threshold: WANTED_THRESHOLD,
    });
    h.state.player.heat = 0.05;
    h.system._updateLawHeatTelegraph(DT);
  }

  const fullSweep = sustained(full.system, LAW_HEAT_LIGHT_KEY.SCAN_SWEEP);
  const redSweep = sustained(reduced.system, LAW_HEAT_LIGHT_KEY.SCAN_SWEEP);
  const fullSus = sustained(full.system, LAW_HEAT_LIGHT_KEY.SUSPICION);
  const redSus = sustained(reduced.system, LAW_HEAT_LIGHT_KEY.SUSPICION);
  assert.ok(fullSweep && redSweep, 'scan fact remains present under accessibility profiles');
  assert.ok(fullSus && redSus, 'suspicion fact remains present under accessibility profiles');
  // Reduced-flash zeros eventLightPeakScale under reduced-motion-and-flash profile.
  assert.ok(redSweep.obj.intensity <= fullSweep.obj.intensity + 1e-6);
  assert.ok(redSus.obj.intensity <= fullSus.obj.intensity + 1e-6);
});

test('headless heat system emit carries telegraph fields the VFX layer consumes', () => {
  const sim = createSimulation({ seed: 1010, systems: [heat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6,
  });
  state.playerId = player.id;

  const changes = [];
  bus.on('heat:changed', (p) => changes.push(p));

  // Unprovoked hit path chips heat below WANTED.
  bus.emit('combat:damage', {
    attackerId: state.playerId,
    targetId: 999,
    factionLawful: false,
    targetHostileToPlayer: false,
    amount: 1,
  });
  assert.ok(changes.length >= 1, 'heat:changed fires from authoritative heat write');
  const first = changes[0];
  assert.ok(Number.isFinite(first.value));
  assert.ok(Number.isFinite(first.previousValue));
  assert.equal(typeof first.wanted, 'boolean');
  assert.equal(typeof first.wantedCrossed, 'boolean');
  assert.ok(Number.isFinite(first.suspicion));
  assert.equal(first.threshold, WANTED_THRESHOLD);

  // Drive the pure controller with the live packet.
  const ctrl = createLawHeatTelegraphController();
  ctrl.acceptHeat(first);
  if (first.value > 0 && first.value < WANTED_THRESHOLD) {
    assert.equal(ctrl.stamp().suspicion.active, true);
  }
});

test('worst-case simultaneous law-heat lights stay within the shared pool math', () => {
  const { system, bus, state } = makeVfxHarness();

  bus.emit('player:scannedByPatrol', { targetId: PLAYER_ID, hasContraband: true });
  bus.emit('heat:changed', {
    value: 0.1,
    previousValue: 0,
    wanted: false,
    wantedCrossed: false,
    suspicion: 0.1 / WANTED_THRESHOLD,
    threshold: WANTED_THRESHOLD,
  });
  state.player.heat = 0.1;
  system._updateLawHeatTelegraph(DT);

  // Two sustained (scan + suspicion). Then flip while scan is still alive.
  bus.emit('heat:changed', {
    value: 0.3,
    previousValue: 0.1,
    wanted: true,
    wantedCrossed: true,
    suspicion: 1,
    threshold: WANTED_THRESHOLD,
  });
  state.player.heat = 0.3;
  system._updateLawHeatTelegraph(DT);

  const sustainedCount = system._lights.filter((s) => s.active && s.sustainedKey != null).length;
  const transientCount = system._lights.filter((s) => s.active && s.sustainedKey == null).length;
  // Scan may still be sustained; suspicion clears on WANTED; flip is transient.
  assert.ok(sustainedCount <= 1, `sustained after WANTED: ${sustainedCount}`);
  assert.ok(transientCount <= 1, `transient WANTED accent: ${transientCount}`);
  assert.ok(activeLightCount(system) <= LAW_HEAT_WORST_CASE_LIGHT_SLOTS);
  assert.ok(activeLightCount(system) <= EVENT_LIGHT_POOL_SIZE);

  const inspect = system.inspect().lawHeatTelegraph;
  assert.equal(inspect.worstCaseLightSlots, LAW_HEAT_WORST_CASE_LIGHT_SLOTS);
  assert.equal(inspect.lightKeys.SCAN_SWEEP, LAW_HEAT_LIGHT_KEY.SCAN_SWEEP);
});
