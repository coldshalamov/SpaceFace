#!/usr/bin/env node
// M1-PLAYER-TELLS world-VFX contract: doctrine FLYBY / TETHER / CHARGE telegraphs.
// Source + headless runtime — does not touch goldens, renderer, or sim goldens.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DOCTRINE_TELEGRAPH_TICKS } from '../src/ai/combatDoctrine.js';
import { vfx } from '../src/render/vfx.js';

const vfxSrc = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');

assert.equal(DOCTRINE_TELEGRAPH_TICKS, 30, 'sim telegraph window is 30 fixed ticks');
assert.match(vfxSrc, /add\('ai:telegraph'/, 'vfx subscribes to ai:telegraph');
assert.match(vfxSrc, /_emitJuiceCue\('ai\.telegraph'/, 'juice cue id preserved for contract checks');
assert.match(vfxSrc, /DOCTRINE_TELL_KIND/, 'doctrine tell vocabulary exists');
assert.match(vfxSrc, /engine_flare/, 'FLYBY maps engine_flare');
assert.match(vfxSrc, /attach_spool/, 'TETHER maps attach_spool');
assert.match(vfxSrc, /weapon_charge/, 'CHARGE maps weapon_charge');
assert.match(vfxSrc, /_spawnDoctrineTellOffscreenCue/, 'truthful offscreen directional cue path');
assert.match(vfxSrc, /_spawnDoctrineTellLink/, 'enemy-to-contact link path');
assert.match(vfxSrc, /_updateDoctrineTells/, 'sustained telegraph update path');
assert.match(vfxSrc, /Math\.max\(30,\s*Math\.floor/, 'presentation life never below 30-tick window');
assert.match(vfxSrc, /_isReduced\(\)/, 'reduced-motion/flash gate is consulted');
assert.equal(vfxSrc.includes('Math.random()') && vfxSrc.includes('_beginDoctrineTell'), true);
// Cosmetic VFX may use Math.random; sim determinism is not owned here. Guard against wall-clock
// lifetime on the doctrine tell path.
const tellBodyStart = vfxSrc.indexOf('_beginDoctrineTell');
const tellBody = vfxSrc.slice(tellBodyStart, tellBodyStart + 2500);
assert(!/Date\.now|performance\.now/.test(tellBody), 'doctrine tell begin must not use wall clock');

function makeBus() {
  const listeners = new Map();
  const events = [];
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
      events.push({ type, payload });
      for (const fn of listeners.get(type) || []) fn(payload);
    },
    events,
  };
}

function makeHarness({ motionReduce = false, flashReduce = false, enemyX = 80, enemyZ = 0 } = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: 1, type: 'ship', alive: true, team: 1,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 10,
  };
  const enemy = {
    id: 2, type: 'ship', alive: true, team: 2,
    pos: { x: enemyX, z: enemyZ }, vel: { x: -20, z: 0 }, rot: Math.PI, radius: 9,
  };
  const state = {
    playerId: player.id,
    tick: 120,
    simTime: 2,
    player: { targetId: enemy.id, tether: { active: false } },
    entities: new Map([[player.id, player], [enemy.id, enemy]]),
    entityList: [player, enemy],
    settings: {
      video: {
        particleQuality: 'high',
        motionReduce,
        engineTrails: true,
        bloom: true,
        bloomStrength: 0.35,
      },
      accessibility: { flashReduce },
    },
    render: { scene, camera: null },
    ui: { radarRange: 4000 },
    combat: { attachments: { byId: {} } },
    content: {},
  };
  const bus = makeBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { scene, state, bus, system, player, enemy };
}

function fireTell(bus, kind, extra = {}) {
  bus.emit('ai:telegraph', {
    entityId: 2,
    targetId: 1,
    kind,
    durationTicks: DOCTRINE_TELEGRAPH_TICKS,
    tick: 120,
    ...extra,
  });
}

// ── On-screen doctrine kinds ────────────────────────────────────────────────
{
  const cases = [
    { kind: 'engine_flare', doctrineId: 'interceptor_flyby', expect: 'flyby' },
    { kind: 'attach_spool', doctrineId: 'tether_control_raider', expect: 'tether' },
    { kind: 'weapon_charge', doctrineId: 'ranged_disengager', expect: 'charge' },
  ];
  for (const c of cases) {
    const { bus, system, state } = makeHarness();
    fireTell(bus, c.kind, { doctrineId: c.doctrineId });
    const insp = system.inspect();
    assert.equal(insp.doctrineTells.starts, 1, `${c.kind} records a start`);
    assert.equal(insp.doctrineTells.active, 1, `${c.kind} is active after emit`);
    assert.equal(insp.doctrineTells.last.kind, c.expect, `${c.kind} classifies as ${c.expect}`);
    assert.equal(insp.doctrineTells.last.durationTicks, 30, `${c.kind} preserves ≥30-tick window`);
    assert.equal(insp.doctrineTells.last.offscreen, false, `${c.kind} near player is on-screen without camera`);
    assert.equal(insp.doctrineTells.last.entityId, 2, `${c.kind} links to enemy entity`);
    assert.equal(insp.doctrineTells.last.targetId, 1, `${c.kind} links to target contact`);
    assert.equal(insp.doctrineTells.last.startTick, 120, `${c.kind} records startTick`);
    assert.equal(insp.doctrineTells.last.deadlineTick, 150, `${c.kind} deadline = start + 30`);
    const juice = bus.events.filter((e) => e.type === 'presentation:vfxCue' && e.payload && e.payload.id === 'ai.telegraph');
    assert.equal(juice.length, 1, `${c.kind} emits juice cue once`);
    // Sustain across the full window by advancing sim tick (not render-dt alone).
    for (let i = 0; i < 20; i++) {
      state.tick += 1;
      system.update(1 / 60);
    }
    const mid = system.inspect();
    assert.equal(mid.doctrineTells.active, 1, `${c.kind} still live mid-window (tick-owned)`);
    for (let i = 0; i < 20; i++) {
      state.tick += 1;
      system.update(1 / 60);
    }
    // tick advanced 40 from 120 → 160; deadline 150 → retired
    const end = system.inspect();
    assert.equal(end.doctrineTells.active, 0, `${c.kind} retires after deadlineTick`);
  }
}

// ── Pause/tab fairness: render dt alone must not consume the 30-tick warning ─
{
  const { bus, system, state } = makeHarness();
  fireTell(bus, 'engine_flare', { doctrineId: 'interceptor_flyby' });
  assert.equal(system.inspect().doctrineTells.active, 1, 'tell starts active');
  // Many render frames while sim tick is frozen (pause / background tab).
  for (let i = 0; i < 120; i++) system.update(1 / 60);
  assert.equal(state.tick, 120, 'harness tick stayed frozen (pause model)');
  assert.equal(system.inspect().doctrineTells.active, 1,
    'paused render frames must not retire doctrine tell before sim consequence');
  // Advance sim past the hold-fire window (retire when tick > deadline, not >=).
  state.tick = 151; // deadline = 120 + 30 = 150
  system.update(1 / 60);
  assert.equal(system.inspect().doctrineTells.active, 0,
    'tell retires once sim tick passes deadlineTick');
}

// ── Headless fallback: when tick is unavailable, age/life still retires ─────
{
  const { bus, system, state } = makeHarness();
  state.tick = undefined;
  bus.emit('ai:telegraph', {
    entityId: 2, targetId: 1, kind: 'weapon_charge',
    doctrineId: 'ranged_disengager', durationTicks: 30,
    // no tick on payload; state.tick also absent
  });
  assert.equal(system.inspect().doctrineTells.active, 1, 'headless tell starts');
  assert.equal(system.inspect().doctrineTells.last.startTick, null, 'no startTick without sim clock');
  for (let i = 0; i < 20; i++) system.update(1 / 60);
  assert.equal(system.inspect().doctrineTells.active, 1, 'headless mid-life still active');
  for (let i = 0; i < 20; i++) system.update(1 / 60);
  assert.equal(system.inspect().doctrineTells.active, 0, 'headless age/life retires after ~0.5s');
}

// ── Reduced motion / flash remains readable (still classifies + sustains) ───
{
  const { bus, system } = makeHarness({ motionReduce: true });
  fireTell(bus, 'weapon_charge', { doctrineId: 'ranged_disengager' });
  const last = system.inspect().doctrineTells.last;
  assert.equal(last.reduced, true, 'motionReduce marks the tell reduced');
  assert.equal(last.kind, 'charge', 'charge still classifies under reduced motion');
  assert.equal(last.durationTicks, 30, 'reduced path keeps full pre-consequence window');
  system.update(1 / 60);
  assert.equal(system.inspect().doctrineTells.active, 1, 'reduced tell sustains after a frame');
}

// ── Far enemy treated as offscreen directional cue (no camera project) ──────
{
  const { bus, system } = makeHarness({ enemyX: 2400, enemyZ: 800 });
  fireTell(bus, 'engine_flare', { doctrineId: 'interceptor_flyby' });
  const last = system.inspect().doctrineTells.last;
  assert.equal(last.offscreen, true, 'far enemy without camera uses offscreen directional path');
  assert.equal(last.kind, 'flyby', 'offscreen flyby still classified');
  assert.equal(last.entityId, 2, 'offscreen cue still bound to the real enemy id');
}

// ── Headless cutoff follows the configured table, not a leftover 900 pin ───
{
  const defaultTable = makeHarness({ enemyX: 1000 });
  fireTell(defaultTable.bus, 'engine_flare', { doctrineId: 'interceptor_flyby' });
  assert.equal(defaultTable.system.inspect().doctrineTells.last.offscreen, true,
    '1000 WU is off the default 144/50 table');

  const wide = makeHarness({ enemyX: 1000 });
  wide.state.camera = { zoom: 330, fov: 90, aspect: 16 / 9, tilt: 60 };
  fireTell(wide.bus, 'engine_flare', { doctrineId: 'interceptor_flyby' });
  assert.equal(wide.system.inspect().doctrineTells.last.offscreen, false,
    '1000 WU is on a 330/90 table even without a projectable camera');
}

// ── Live camera uses NDC project, not the headless table radius ────────────
{
  const live = makeHarness({ enemyX: 1000 });
  const tilt = Math.PI / 3;
  const distance = 144;
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 4000);
  cam.position.set(0, distance * Math.sin(tilt), -distance * Math.cos(tilt));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  live.state.render.camera = cam;
  live.state.camera = { zoom: 330, fov: 90, aspect: 16 / 9, tilt: 60 };
  fireTell(live.bus, 'engine_flare', { doctrineId: 'interceptor_flyby' });
  assert.equal(live.system.inspect().doctrineTells.last.offscreen, true,
    'a 1000 WU enemy stays off-screen on a real camera even at a wide table envelope');

  const near = makeHarness({ enemyX: 80 });
  near.state.render.camera = cam;
  fireTell(near.bus, 'engine_flare', { doctrineId: 'interceptor_flyby' });
  assert.equal(near.system.inspect().doctrineTells.last.offscreen, false,
    'a near enemy still projects on-screen through a real camera');
}

// ── Close-zoom rear cues stay inside the live frustum ──────────────────────
{
  const close = makeHarness({ enemyX: 0, enemyZ: -80 });
  const tilt = Math.PI / 3;
  const distance = 45;
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 4000);
  cam.position.set(0, distance * Math.sin(tilt), -distance * Math.cos(tilt));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  close.state.render.camera = cam;
  close.state.camera = { zoom: 45, fov: 50, aspect: 16 / 9, tilt: 60 };
  const cue = close.system._doctrineTellOffscreenPoint({ x: 0, z: 0 }, 0, -1);
  const ndc = new THREE.Vector3(cue.x, 0, cue.z).project(cam);
  assert.ok(Math.abs(ndc.x) <= 0.85 && Math.abs(ndc.y) <= 0.85,
    `rear close-zoom cue NDC (${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)}) must stay on-screen`);
}

// ── Narrow low-FOV close zoom cannot seed an 8 WU off-screen pin ───────────
{
  const narrow = makeHarness({ enemyX: 80, enemyZ: 0 });
  const tilt = Math.PI / 3;
  const distance = 45;
  const cam = new THREE.PerspectiveCamera(35, 0.5, 1, 4000);
  cam.position.set(0, distance * Math.sin(tilt), -distance * Math.cos(tilt));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  narrow.state.render.camera = cam;
  narrow.state.camera = { zoom: 45, fov: 35, aspect: 0.5, tilt: 60 };
  const cue = narrow.system._doctrineTellOffscreenPoint({ x: 0, z: 0 }, 1, 0);
  const ndc = new THREE.Vector3(cue.x, 0, cue.z).project(cam);
  assert.ok(Math.abs(ndc.x) <= 0.85 && Math.abs(ndc.y) <= 0.85,
    `narrow 35°/0.5 cue NDC (${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)}) must stay on-screen`);
}

// ── Duration floor: payload below 30 is raised to 30 ────────────────────────
{
  const { bus, system } = makeHarness();
  bus.emit('ai:telegraph', {
    entityId: 2, targetId: 1, kind: 'attach_spool',
    doctrineId: 'tether_control_raider', durationTicks: 12, tick: 50,
  });
  assert.equal(system.inspect().doctrineTells.last.durationTicks, 30,
    'sub-30 payload is floored to the 30-tick fairness window');
}

console.log(JSON.stringify({
  schema: 'spaceface.m1.doctrine_vfx.v1',
  ok: true,
  cases: ['flyby', 'tether', 'charge', 'reduced', 'offscreen', 'duration_floor', 'pause_tick', 'headless_fallback', 'headless_table', 'live_project', 'close_rear_cue', 'narrow_low_fov'],
  doctrineTelegraphTicks: DOCTRINE_TELEGRAPH_TICKS,
}, null, 2));
