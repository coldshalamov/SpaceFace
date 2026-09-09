#!/usr/bin/env node
// VFX idle-frame budget gate.
//
// WHY THIS EXISTS
// ---------------
// design/PERF_BUDGET.md:48 gives `vfx.update` 2.5 ms of a 16.7 ms frame. A sector where nothing is
// happening must not spend that budget: the player parked in a rock field should cost near nothing,
// so the budget is available for the frame where a web catches eight ships.
//
// WHAT CHANGED, AND WHY (2026-07-27, build plan §2.5 item 3, grammar §9.2.1)
// -------------------------------------------------------------------------
// This file used to require seven VFX subsystem counters to sum to EXACTLY 0 on an idle frame, and
// separately asserted that src/render/vfx.js SOURCE contained specific private method names
// (`_miningBeamActive()`, `_consumeCadence(`, ...).
//
// Both were wrong, and the first one had already cost a real feature. Zero is not a budget: it
// refuses any always-on effect regardless of what it costs, and
// design/program/roadmap/receipts/PQ-023-propulsion-family-REPORT.md:64-80 records the consequence
// in as many words — "no always-on idle nozzle glow" — for a glow whose frame cost was never
// measured. The source-name assertions protected nothing at all and would fail CI on a rename with
// zero behaviour change.
//
// The replacement is a MEASURED CEILING plus two behavioural contracts, so a cheap persistent
// effect can pass on merit and an expensive one still cannot:
//
//   1. BUDGET — an idle frame in a POPULATED sector costs at most IDLE_VFX_BUDGET_MS.
//   2. STEADY STATE — idling does not accumulate live particles/sprites/streaks without bound.
//   3. ACTIVITY GATING — subsystems that exist only to draw a player action (the mining beam, the
//      tether cable) wake when that action starts and go back to sleep when it ends. This is
//      asserted by DRIVING the system, not by reading its source.
//
// Deliberately NOT asserted: that any particular subsystem reports zero on an idle frame. That is
// the rule that banned the nozzle glow, and re-adding it in any form re-bans it.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

// VFX owns 2.5 ms of the 16.7 ms frame (design/PERF_BUDGET.md:48). An idle frame gets a tenth of
// that: enough headroom for a persistent glow or a nozzle idle, nowhere near enough to hide a
// per-frame full-world scan. Measured cost on this harness at the time of writing is ~0.005 ms,
// so this is a ~50x ceiling, not a tripwire that fails on a slow CI box.
const VFX_FRAME_BUDGET_MS = 2.5;
const IDLE_BUDGET_FRACTION = 0.10;
const IDLE_VFX_BUDGET_MS = VFX_FRAME_BUDGET_MS * IDLE_BUDGET_FRACTION;

const IDLE_WARMUP_FRAMES = 500;
const IDLE_MEASURE_FRAMES = 3000;
const IDLE_ASTEROIDS = 420;

function makeBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
      return () => {
        const current = listeners.get(type) || [];
        listeners.set(type, current.filter((item) => item !== fn));
      };
    },
    emit(type, payload) {
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
}

function makeHarness(overrides = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
  };
  const state = {
    playerId: player.id,
    player: { targetId: null, tether: { active: false } },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    settings: {
      video: {
        particleQuality: 'high',
        motionReduce: false,
        energyMaterials: false,
        bloom: true,
        ...(overrides.video || {}),
      },
    },
    render: { scene },
    ui: { radarRange: 4000 },
    combat: { attachments: { byId: {} } },
    content: {},
    ...(overrides.state || {}),
  };
  const bus = makeBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { scene, state, bus, system, player };
}

/** Add inert scenery so "idle" means a real populated sector, not an empty Map. */
function populate(harness, count) {
  let seed = 20260727;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < count; i++) {
    const rock = {
      id: 1000 + i,
      type: 'asteroid',
      alive: true,
      pos: { x: (rnd() - 0.5) * 1600, z: (rnd() - 0.5) * 1600 },
      vel: { x: 0, z: 0 },
      rot: rnd() * Math.PI * 2,
      radius: 6 + rnd() * 18,
      data: { typeId: 'rock_a', seams: [{ localOffset: { x: 2, z: 0 } }, { localOffset: { x: -3, z: 1 } }] },
    };
    harness.state.entities.set(rock.id, rock);
    harness.state.entityList.push(rock);
  }
  return harness;
}

function liveWork(system) {
  return {
    particles: system._liveCount || 0,
    sprites: system._liveSpriteCount || 0,
    streaks: system._liveTrailStreakCount || 0,
  };
}

// ---------------------------------------------------------------------------------------------
// 1. BUDGET — an idle frame in a populated sector stays inside its share of the VFX budget.
// ---------------------------------------------------------------------------------------------
{
  const harness = populate(makeHarness(), IDLE_ASTEROIDS);
  const { system } = harness;
  for (let i = 0; i < IDLE_WARMUP_FRAMES; i++) system.update(1 / 60);
  const t0 = performance.now();
  for (let i = 0; i < IDLE_MEASURE_FRAMES; i++) system.update(1 / 60);
  const meanMs = (performance.now() - t0) / IDLE_MEASURE_FRAMES;
  assert.ok(
    meanMs <= IDLE_VFX_BUDGET_MS,
    `idle VFX frame cost ${meanMs.toFixed(4)}ms exceeds its ${IDLE_VFX_BUDGET_MS.toFixed(2)}ms share `
    + `of the ${VFX_FRAME_BUDGET_MS}ms VFX budget (design/PERF_BUDGET.md:48) with ${IDLE_ASTEROIDS} inert bodies`,
  );
  console.log(`ok    idle VFX frame budget {"meanMs":${meanMs.toFixed(5)},"ceilingMs":${IDLE_VFX_BUDGET_MS},"bodies":${IDLE_ASTEROIDS}}`);
}

// ---------------------------------------------------------------------------------------------
// 2. STEADY STATE — idling does not accumulate live work. A persistent effect that holds a fixed
//    number of instances passes; a leak that adds one per frame does not.
// ---------------------------------------------------------------------------------------------
{
  const { system } = populate(makeHarness(), 64);
  for (let i = 0; i < 200; i++) system.update(1 / 60);
  const early = liveWork(system);
  for (let i = 0; i < 1800; i++) system.update(1 / 60);
  const late = liveWork(system);
  for (const key of ['particles', 'sprites', 'streaks']) {
    assert.ok(
      late[key] <= early[key],
      `idle VFX ${key} grew from ${early[key]} to ${late[key]} over 1800 idle frames — that is a leak, `
      + 'not a persistent effect (a persistent effect holds a constant count)',
    );
  }
  console.log(`ok    idle VFX steady state {"early":${JSON.stringify(early)},"late":${JSON.stringify(late)}}`);
}

// ---------------------------------------------------------------------------------------------
// 3. ACTIVITY GATING — behavioural, driven through the bus. The mining beam and the tether cable
//    exist only to draw an action in progress; when that action ends they must stop doing work.
//    Asserted by driving the system, never by reading its source.
// ---------------------------------------------------------------------------------------------
{
  const harness = makeHarness();
  const { bus, state, system } = harness;
  const asteroid = {
    id: 9,
    type: 'asteroid',
    alive: true,
    pos: { x: 40, z: 0 },
    radius: 18,
    rot: 0,
    data: { typeId: 'rock_a', seams: [{ localOffset: { x: 2, z: 0 } }] },
  };
  state.entities.set(asteroid.id, asteroid);
  state.entityList.push(asteroid);

  system.update(1 / 60);
  assert.equal(system.inspect().subsystems.lastFrame.miningBeam, 0,
    'mining beam should be asleep before any mining starts');

  bus.emit('mining:start', { targetId: asteroid.id });
  for (let i = 0; i < 3; i++) system.update(1 / 60);
  assert.equal(system.inspect().subsystems.lastFrame.miningBeam, 1,
    'mining:start should wake the mining beam subsystem immediately');

  bus.emit('mining:stop', {});
  for (let i = 0; i < 60; i++) system.update(1 / 60);
  assert.equal(system.inspect().subsystems.lastFrame.miningBeam, 0,
    'mining:stop should let the mining beam subsystem go back to sleep');
  console.log('ok    mining beam wake and sleep');
}

{
  const harness = makeHarness();
  const { state, system } = harness;
  const rock = {
    id: 11,
    type: 'asteroid',
    alive: true,
    pos: { x: 60, z: 10 },
    vel: { x: 0, z: 0 },
    radius: 14,
    rot: 0,
    data: { typeId: 'rock_a' },
  };
  state.entities.set(rock.id, rock);
  state.entityList.push(rock);

  system.update(1 / 60);
  assert.equal(system.inspect().subsystems.lastFrame.tetherCable, 0,
    'tether cable should be asleep with no massline attached');

  state.player.tether = { active: true, targetId: rock.id, strain: 0.4, load: 0.4, restLength: 50 };
  for (let i = 0; i < 3; i++) system.update(1 / 60);
  assert.equal(system.inspect().subsystems.lastFrame.tetherCable, 1,
    'an active massline should wake the tether cable subsystem');

  state.player.tether = { active: false };
  for (let i = 0; i < 90; i++) system.update(1 / 60);
  assert.equal(system.inspect().subsystems.lastFrame.tetherCable, 0,
    'releasing the massline should let the tether cable subsystem go back to sleep');
  console.log('ok    tether cable wake and sleep');
}

console.log('PASS  check:vfx-sleep');
