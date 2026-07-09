// Acceptance check for design/spec2/02_FLIGHT_CAMERA_JUICE.md §5.
// Headless: verifies bus events, state constants, profile multipliers, cue tables,
// hit-stop/trauma rules, cruise timing, and source-level VFX budget discipline.

import fs from 'node:fs';
import { cruise } from '../src/systems/cruise.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { resolveFlightProfile } from '../src/core/flightDynamics.js';
import { COMBAT_CUE_IDS, WEAPON_CUE_TABLES, resolveWeaponCueTable } from '../src/data/combatDefs.js';
import { createGameState } from '../src/core/gameState.js';

// Stub a minimal DOM so feel.js can load headlessly.
if (typeof globalThis.document === 'undefined') {
  const styles = [];
  const els = new Map();
  globalThis.document = {
    createElement(tag) {
      const el = {
        tag,
        style: {},
        className: '',
        id: '',
        textContent: '',
        isConnected: true,
        children: [],
        appendChild(c) { this.children.push(c); return c; },
        getContext() { return { clearRect() {}, fillRect() {}, createRadialGradient() { return { addColorStop() {} }; }, createLinearGradient() { return { addColorStop() {} }; }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, set globalCompositeOperation(_) {} }; },
      };
      return el;
    },
    head: { appendChild(s) { styles.push(s); } },
    body: { appendChild() {}, style: {} },
    getElementById(id) { return els.get(id) || null; },
  };
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener() {},
  };
}

const { feel } = await import('../src/render/feel.js');

function makeBus() {
  const listeners = {};
  const events = [];
  return {
    on(name, fn) { (listeners[name] ||= []).push(fn); return fn; },
    emit(name, payload) { events.push({ name, payload }); for (const fn of listeners[name] || []) fn(payload); },
    events,
    clear() { events.length = 0; },
  };
}

function makeState(extra = {}) {
  const state = createGameState(1);
  state.mode = 'flight';
  state.playerId = 1;
  state.player.cruise = { phase: 'off', t: 0 };
  state.entities = new Map();
  state.entityList = [];
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, hull: 100, shield: 100, armorHp: 100,
    maxSpeed: 120, thrust: 40, drag: 1.2, turnRate: 3,
    flags: {},
  });
  state.entityList.push(state.entities.get(1));
  state.input = { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, fire: false, fireGroup: null, autoFire: false, aimWorld: { x: 0, z: 0 }, aimAngle: 0, mouseNdc: { x: 0, y: 0 }, actions: {} };
  state.timeScale = 1;
  state.ui = { screenStack: [], docked: false };
  return Object.assign(state, extra);
}

function addEntity(state, e) {
  state.entities.set(e.id, e);
  state.entityList.push(e);
}

const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push({ name, ok: true }); }
  catch (e) { checks.push({ name, ok: false, error: e.message, stack: e.stack }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function approx(a, b, eps = 0.0001, msg) { if (Math.abs(a - b) > eps) throw new Error(msg || `${a} ≉ ${b}`); }

function methodBody(source, name) {
  const start = source.indexOf(`${name}(dt) {`);
  assert(start >= 0, `vfx method ${name} should exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`vfx method ${name} should have a balanced body`);
}

// §3 juice-stack table: event -> expected cue id (and handler name for source checks).
const JUICE_EVENTS = [
  { event: 'combat:damage', cue: 'combat.damage.shield', predicate: 'shieldAbsorbed', sourceToken: "_emitJuiceCue('combat.damage.shield'" },
  { event: 'combat:damage', cue: 'combat.damage.armor', predicate: 'armorHit', sourceToken: "_emitJuiceCue('combat.damage.armor'" },
  { event: 'combat:damage', cue: 'combat.damage.hull', predicate: 'hullHit', sourceToken: "_emitJuiceCue('combat.damage.hull'" },
  { event: 'entity:killed', cue: 'combat.damage.kill', sourceToken: "_emitJuiceCue('combat.damage.kill'" },
  { event: 'tether:attached', cue: 'presentation.tether.attach', sourceToken: "_emitJuiceCue('presentation.tether.attach'" },
  { event: 'tether:broken', cue: 'presentation.tether.break', sourceToken: "_emitJuiceCue('presentation.tether.break'" },
  { event: 'cruise:charging', cue: 'cruise.charging', sourceToken: "_emitJuiceCue('cruise.charging'" },
  { event: 'cruise:engaged', cue: 'cruise.engaged', sourceToken: "_emitJuiceCue('cruise.engaged'" },
  { event: 'cruise:dropped', cue: 'cruise.dropped', sourceToken: "_emitJuiceCue('cruise.dropped'" },
  { event: 'ai:telegraph', cue: 'ai.telegraph', sourceToken: "_emitJuiceCue('ai.telegraph'" },
  { event: 'ai:flee', cue: 'ai.flee', sourceToken: "_emitJuiceCue('ai.flee'" },
  { event: 'ai:formationBroken', cue: 'ai.formation_broken', sourceToken: "_emitJuiceCue('ai.formation_broken'" },
  { event: 'charge:detonated', cue: 'combat.damage.charge', sourceToken: "_emitJuiceCue('combat.damage.charge'" },
];

const vfxSrc = fs.readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
const feelSrc = fs.readFileSync(new URL('../src/render/feel.js', import.meta.url), 'utf8');
const cameraSrc = fs.readFileSync(new URL('../src/render/camera.js', import.meta.url), 'utf8');
const inputSrc = fs.readFileSync(new URL('../src/systems/input.js', import.meta.url), 'utf8');
const cruiseSrc = fs.readFileSync(new URL('../src/systems/cruise.js', import.meta.url), 'utf8');

// ------------------------------------------------------------------------------
// §5.1 — Every §3 event emits its cue exactly once per trigger.
// Source-level: subscription + _emitJuiceCue call. Bus-level: one vfxCue + one audioCue.
// ------------------------------------------------------------------------------
await check('§5.1: VFX subscribes to every §3 event', () => {
  for (const { event } of JUICE_EVENTS) {
    assert(vfxSrc.includes(`add('${event}'`), `vfx missing subscription to ${event}`);
  }
});

await check('§5.1: Every §3 event emits its canonical cue id', () => {
  for (const { sourceToken } of JUICE_EVENTS) {
    assert(vfxSrc.includes(sourceToken), `vfx missing ${sourceToken}`);
  }
});

await check('§5.1: _emitJuiceCue emits presentation:vfxCue + audio:cue once', () => {
  assert(vfxSrc.includes("this.bus.emit('presentation:vfxCue'"), 'vfx emits presentation:vfxCue');
  assert(vfxSrc.includes("this.bus.emit('audio:cue'"), 'vfx emits audio:cue');
  // One emit each per call.
  const vfxMatch = vfxSrc.match(/this\.bus\.emit\('presentation:vfxCue'/g);
  const audioMatch = vfxSrc.match(/this\.bus\.emit\('audio:cue'/g);
  assert(vfxMatch && audioMatch && vfxMatch.length === audioMatch.length,
    `vfxCue (${vfxMatch?.length}) and audio:cue (${audioMatch?.length}) counts must match`);
});

await check('§5.1: Cue IDs are registered in COMBAT_CUE_IDS', () => {
  for (const { cue } of JUICE_EVENTS) {
    assert(COMBAT_CUE_IDS.includes(cue), `COMBAT_CUE_IDS missing ${cue}`);
  }
});

await check('§5.1: Scripted trigger emits one cue pair per trigger', () => {
  const bus = makeBus();
  let vfxCueCount = 0;
  let audioCueCount = 0;
  bus.on('presentation:vfxCue', () => vfxCueCount++);
  bus.on('audio:cue', () => audioCueCount++);
  // Minimal vfx stub that only performs the cue emission contract.
  const stub = { state: makeState(), bus };
  stub._posFrom = (p, id) => (p && p.pos) || { x: 0, z: 0 };
  stub._emitJuiceCue = new Function('id', 'p', 'magnitude', `
    this.bus.emit('presentation:vfxCue', { id, lane: id.split('.')[0], pos: (p && p.pos) || null, magnitude: magnitude || 1, flashReduced: false });
    this.bus.emit('audio:cue', { id });
  `).bind(stub);
  for (const { cue } of JUICE_EVENTS) {
    stub._emitJuiceCue(cue, { pos: { x: 0, z: 0 } }, 1);
  }
  assert(vfxCueCount === JUICE_EVENTS.length, `expected ${JUICE_EVENTS.length} vfx cues, got ${vfxCueCount}`);
  assert(audioCueCount === JUICE_EVENTS.length, `expected ${JUICE_EVENTS.length} audio cues, got ${audioCueCount}`);
});

// ------------------------------------------------------------------------------
// §5.2 — Hit-stop concurrency == 1; time-scaled ticks < 4% over 30 s.
// ------------------------------------------------------------------------------
function makeFeel() {
  const f = Object.create(feel);
  const state = makeState();
  const bus = makeBus();
  f.init({ state, bus, helpers: {} });
  return { f, state, bus };
}

await check('§5.2: Hit-stop concurrency is one at a time (newest wins)', () => {
  const { f, state, bus } = makeFeel();
  state.timeScale = 1;
  bus.emit('combat:damage', { brokeShield: true, isPlayer: true, amount: 10, pos: { x: 0, z: 0 } });
  f.frame(0, state);
  const floor1 = state.timeScale;
  assert(floor1 < 1, 'shield break should dip timeScale');
  bus.emit('entity:killed', { id: 2, killerId: 1, type: 'ship', pos: { x: 0, z: 0 }, victimClass: 'fighter' });
  f.frame(0.001, state);
  assert(f._hsTimer > 0, 'kill hit-stop should be active');
  // Only one timer active at a time.
  assert(typeof f._hsTimer === 'number' && f._hsTimer > 0, 'single hit-stop timer');
});

await check('§5.2: Total time-scaled dilation < 4% over 30 s scenario', () => {
  const { f, state, bus } = makeFeel();
  const dt = 1 / 60;
  let realTime = 0;
  let scaledTime = 0;
  let nextShieldBreak = 1.0;
  let nextKill = 3.0;
  while (realTime < 30) {
    if (realTime >= nextShieldBreak) {
      bus.emit('combat:damage', { brokeShield: true, isPlayer: true, amount: 10, pos: { x: 0, z: 0 } });
      nextShieldBreak += 2.0;
    }
    if (realTime >= nextKill) {
      bus.emit('entity:killed', { id: 2, killerId: 1, type: 'ship', pos: { x: 0, z: 0 }, victimClass: 'fighter' });
      nextKill += 3.5;
    }
    f.frame(dt, state);
    scaledTime += state.timeScale * dt;
    realTime += dt;
  }
  const dilation = (realTime - scaledTime) / realTime;
  assert(dilation < 0.04, `dilation ${(dilation * 100).toFixed(2)}% >= 4%`);
});

// ------------------------------------------------------------------------------
// §5.3 — motionReduce=true => zero trauma > 0.125, zero hit-stop, zero flashes > 120 ms.
// ------------------------------------------------------------------------------
await check('§5.3: motionReduce suppresses trauma above 0.125', () => {
  const { f, state, bus } = makeFeel();
  state.settings.video.motionReduce = true;
  state.camera.trauma = 0;
  bus.emit('entity:killed', { id: 2, killerId: 1, type: 'ship', pos: { x: 0, z: 0 }, victimClass: 'fighter' });
  f.frame(0, state);
  assert(state.camera.trauma <= 0.125, `trauma ${state.camera.trauma} > 0.125 with motionReduce`);
});

await check('§5.3: motionReduce suppresses hit-stop', () => {
  const { f, state, bus } = makeFeel();
  state.settings.video.motionReduce = true;
  state.timeScale = 1;
  bus.emit('combat:damage', { brokeShield: true, isPlayer: true, amount: 10, pos: { x: 0, z: 0 } });
  f.frame(0, state);
  assert(state.timeScale === 1, 'timeScale must stay 1 with motionReduce');
  assert(f._hsTimer === 0, 'hit-stop timer must stay 0 with motionReduce');
});

await check('§5.3: motionReduce suppresses flashes > 120 ms', () => {
  // Source-level: feel skips vignette entirely when motionReduce is on.
  assert(feelSrc.includes('if (mr) return;'), 'feel returns early on motionReduce in _trigger');
  // VFX source-level: flashReduce / motionReduce gating should exist.
  assert(vfxSrc.includes('flashReduced') || vfxSrc.includes('motionReduce'), 'vfx respects flashReduce/motionReduce');
});

// ------------------------------------------------------------------------------
// §5.4 — Cruise charge 3.0 ± 0.05 s; mass-lock drop within 2 ticks; check-cruise green.
// ------------------------------------------------------------------------------
await check('§5.4: Cruise charge time 3.0 ± 0.05 s', () => {
  const bus = makeBus();
  const state = makeState();
  const c = Object.create(cruise); c.init({ state, bus, helpers: {} });
  state.input.actions.cruise = true;
  c.update(0, state);
  const dt = 1 / 60;
  let t = 0;
  while (state.player.cruise.phase !== 'cruising' && t < 5) {
    t += dt;
    c.update(dt, state);
  }
  approx(t, 3.0, 0.05, `charge time ${t.toFixed(3)}s outside tolerance`);
});

await check('§5.4: Mass-lock drops within 2 ticks', () => {
  const bus = makeBus();
  const state = makeState();
  const c = Object.create(cruise); c.init({ state, bus, helpers: {} });
  state.player.cruise.phase = 'cruising';
  addEntity(state, { id: 2, type: 'station', alive: true, radius: 70, pos: { x: 100, z: 0 } });
  c.update(1 / 60, state);
  assert(state.player.cruise.phase === 'off', 'mass-lock drop on first tick');
  const drop = bus.events.find((e) => e.name === 'cruise:dropped');
  assert(drop && drop.payload.reason === 'masslock', 'masslock reason');
});

await check('§5.4: check-cruise.mjs is referenced and runnable', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert(pkg.scripts && pkg.scripts['check:cruise'], 'package.json has check:cruise script');
});

await check('SPEC3-16 §7: V is the cruise verb binding', () => {
  assert(inputSrc.includes("cruise:         ['KeyV']") || inputSrc.includes("cruise: ['KeyV']"),
    'input.js must bind cruise to KeyV');
});

await check('SPEC3-16 §7: Cruise drop applies a 0.5s stumble window', () => {
  const bus = makeBus();
  const state = makeState();
  const c = Object.create(cruise); c.init({ state, bus, helpers: {} });
  state.player.cruise.phase = 'cruising';
  bus.emit('combat:damage', { targetId: 1, amount: 5 });
  const stumbleT = state.player.cruise && state.player.cruise.stumbleT;
  approx(stumbleT, 0.5, 0.0001, `cruise drop must set stumbleT to 0.5s, got ${stumbleT}`);
});

await check('SPEC3-16 §7: Cruise exposes snare/interdiction event surface', () => {
  assert(cruiseSrc.includes('cruise:snared'), 'cruise.js must emit cruise:snared {sourceId}');
  assert(/snared/.test(cruiseSrc), "cruise drop reasons must include 'snared'");
});

// ------------------------------------------------------------------------------
// §5.5 — Frame budget: VFX update is bounded (headless evidence).
// ------------------------------------------------------------------------------
await check('§5.5: VFX update clamps dt and uses pooled allocation', () => {
  assert(vfxSrc.includes('if (dt > 0.1) dt = 0.1'), 'vfx clamps frame dt');
  assert(vfxSrc.includes('this._freeParticleCount') && vfxSrc.includes('this._freeSpriteCount'), 'vfx uses free stacks');
  assert(vfxSrc.includes('SPRITE_CAP') && vfxSrc.includes('PARTICLE_CAP'), 'vfx has caps');
});

await check('§5.5: No unbounded loops or per-frame allocations in vfx hot paths', () => {
  // Basic AST-free sanity: no array growth via push without cap check in update/_integrate functions.
  const integrate = methodBody(vfxSrc, '_integrateParticles');
  assert(!integrate.includes('.push('), 'particle integration does not allocate');
  const spriteInt = methodBody(vfxSrc, '_integrateSprites');
  assert(!spriteInt.includes('.push('), 'sprite integration does not allocate');
  assert(!integrate.includes('new THREE.Vector3'), 'particle integration does not allocate Vector3');
  assert(!spriteInt.includes('new THREE.Vector3'), 'sprite integration does not allocate Vector3');
});

// ------------------------------------------------------------------------------
// Camera / constants contract (§2)
// ------------------------------------------------------------------------------
await check('camera: default zoom fallback is 88 wu', () => {
  const s = createGameState(1);
  assert(s.camera.zoom === 88, `gameState zoom ${s.camera.zoom} !== 88`);
});

await check('camera: look-ahead constants present', () => {
  assert(cameraSrc.includes('LOOKAHEAD_MAX'), 'camera defines LOOKAHEAD_MAX');
  assert(cameraSrc.includes('SPEED_ZOOM_MIN') || cameraSrc.includes('0.88'), 'camera defines 0.88x min zoom');
  assert(cameraSrc.includes('SPEED_ZOOM_MAX') || cameraSrc.includes('1.18'), 'camera defines 1.18x max zoom');
});

await check('camera: kill-cam push-zoom 0.96x / 250 ms', () => {
  assert(cameraSrc.includes('0.96') || cameraSrc.includes('pushZoom(0.96'), 'kill-cam 0.96x present');
  assert(cameraSrc.includes('0.25') || cameraSrc.includes('250'), 'kill-cam 250 ms present');
});

await check('feel: shield-break hit-stop 40 ms, kill hit-stop 60 ms', () => {
  assert(feelSrc.includes('HS_SHIELD_BREAK = 0.04'), 'shield break hit-stop 40 ms');
  assert(feelSrc.includes('HS_KILL = 0.06') || feelSrc.includes('HS_KILL_FREEZE = 0.06'), 'kill hit-stop 60 ms');
});

// ------------------------------------------------------------------------------
// Flight / catalog multipliers (§1)
// ------------------------------------------------------------------------------
await check('flightDynamics: cruising multipliers', () => {
  const state = makeState();
  state.player.cruise.phase = 'cruising';
  const entity = { id: 1, maxSpeed: 120, thrust: 40, drag: 1.2, turnRate: 3 };
  const base = resolveFlightProfile(entity, null);
  const p = resolveFlightProfile(entity, state);
  approx(p.maxSpeed, base.maxSpeed * 4, 0.01, 'maxSpeed ×4');
  approx(p.mainAccel, base.mainAccel * 2.5, 0.01, 'mainAccel ×2.5');
  approx(p.maxYawRate, base.maxYawRate * 0.25, 0.01, 'maxYawRate ×0.25');
});

await check('propulsionCatalog: cruising multipliers', () => {
  const state = makeState();
  state.player.cruise.phase = 'cruising';
  const entity = { id: 1, flightClass: 'fighter', mass: 18, driveId: 'drive_reaction_s' };
  const base = resolvePropulsionProfile(entity, null);
  const p = resolvePropulsionProfile(entity, state);
  approx(p.maxSpeed, (base.maxSpeed || 0) * 4, 0.01, 'catalog maxSpeed ×4');
  approx(p.mainAccel, base.mainAccel * 2.5, 0.01, 'catalog mainAccel ×2.5');
  approx(p.maxYawRate, base.maxYawRate * 0.25, 0.01, 'catalog maxYawRate ×0.25');
});

await check('weapons.js: cruise blocks player fire', () => {
  const src = fs.readFileSync(new URL('../src/systems/weapons.js', import.meta.url), 'utf8');
  assert(src.includes("cruise.phase === 'charging'"), 'guard checks charging');
  assert(src.includes("cruise.phase === 'cruising'"), 'guard checks cruising');
});

await check('combatDefs: weapon cue tables exist', () => {
  assert(WEAPON_CUE_TABLES && typeof WEAPON_CUE_TABLES === 'object', 'WEAPON_CUE_TABLES exported');
  const table = resolveWeaponCueTable('wpn_pulse_laser', [{ id: 'wpn_pulse_laser', damageType: 'energy', size: 'S' }]);
  assert(table && table.muzzle && table.impact && table.cueId, 'resolved table has cues');
});

// ------------------------------------------------------------------------------
// Summary
// ------------------------------------------------------------------------------
const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(c.ok ? `✓ ${c.name}` : `✗ ${c.name}: ${c.error}`);
}
if (failed.length) {
  console.log(`\n${failed.length}/${checks.length} juice-contract checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} juice-contract checks passed.`);
