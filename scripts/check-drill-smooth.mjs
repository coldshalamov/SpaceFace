#!/usr/bin/env node
// check-drill-smooth.mjs — gates the 2× empty-tile move cadence + time-interpolated draw path
// and preserves yield / gas gameplay outcomes on the real drill system APIs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import {
  drill,
  DRILL_CONST,
  MOVE_COOLDOWN_BASE,
  MOVE_COOLDOWN_CARGO,
  moveCooldownForLoad,
  avatarDrawPos,
  avatarMoveProgress,
} from '../src/systems/drill.js';
import { cargo } from '../src/systems/cargo.js';
import { addCargo } from '../src/systems/cargo.js';

function createBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit(type, payload) {
      const set = handlers.get(type);
      if (!set) return;
      for (const fn of set) fn(payload);
    },
  };
}

function setup() {
  const state = createGameState(9001);
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: { get() { return null; } } };
  cargo.init(ctx);
  drill.init(ctx);
  if (!state.player.cargo) {
    state.player.cargo = { items: {}, usedVolume: 0, capVolume: 100, capMass: 100 };
  } else {
    state.player.cargo.capVolume = 100;
    state.player.cargo.capMass = 100;
    state.player.cargo.usedVolume = 0;
  }
  // Ensure a player entity for gas hull damage
  if (!state.entities.has(state.playerId)) {
    state.entities.set(state.playerId, {
      id: state.playerId,
      hull: 100,
      hullMax: 100,
      data: {},
    });
  } else {
    const p = state.entities.get(state.playerId);
    p.hull = 100;
    p.hullMax = 100;
  }
  return { state, bus, ctx };
}

function carveTunnel(state, col, rows) {
  for (let r = 0; r < rows; r++) {
    state.drill.field[col][r] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1 };
  }
  state.drill.avatar.row = 0;
  state.drill.avatar.col = col;
  state.drill.avatar.fromCol = col;
  state.drill.avatar.fromRow = 0;
  state.drill.avatar.moveDuration = 0;
  state.drill.avatar.moveElapsed = 0;
  state.drill.moveCooldown = 0;
}

// --- 1. Constants: ~2× prior 0.12 base ---
assert.equal(MOVE_COOLDOWN_BASE, 0.06, 'base empty-tile move interval must be 0.06s (was 0.12)');
assert.equal(MOVE_COOLDOWN_CARGO, 0.05, 'cargo extra must be 0.05s (was 0.10)');
assert.ok(Math.abs(moveCooldownForLoad(0) - 0.06) < 1e-9, 'empty cargo cooldown = base');
assert.ok(Math.abs(moveCooldownForLoad(1) - 0.11) < 1e-9, 'full cargo cooldown = base+cargo');
assert.equal(DRILL_CONST.MOVE_COOLDOWN_BASE, MOVE_COOLDOWN_BASE, 'DRILL_CONST exports base');

// --- 2. Real tickInput path: ~2× tiles vs pre-change baseline in fixed time ---
{
  const { state } = setup();
  assert.ok(drill.begin(424242), 'begin session');
  const col = state.drill.avatar.col;
  carveTunnel(state, col, 40);

  const dt = 1 / 60;
  const holdSec = 2.0;
  const steps = Math.round(holdSec / dt);
  let moves = 0;
  const intervals = [];
  let lastMoveT = null;
  const startRow = state.drill.avatar.row;

  for (let i = 0; i < steps; i++) {
    const before = state.drill.avatar.row;
    drill.tickInput({ left: false, right: false, up: false, down: true }, dt);
    if (state.drill.avatar.row !== before) {
      moves++;
      const t = (i + 1) * dt;
      if (lastMoveT != null) intervals.push(t - lastMoveT);
      lastMoveT = t;
    }
  }

  const advanced = state.drill.avatar.row - startRow;
  const meanInterval = intervals.length
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : null;

  // Pre-change baseline at 0.12s: ~15 tiles / 2s (see implementer baseline log).
  // Post-change at 0.06s: expect ~30 tiles (first move free at t=dt).
  const BASELINE_TILES_2S = 15;
  assert.ok(advanced >= BASELINE_TILES_2S * 1.7, `expected ~2× tiles in ${holdSec}s, got ${advanced} (baseline ${BASELINE_TILES_2S})`);
  assert.ok(moves >= BASELINE_TILES_2S * 1.7, `expected ~2× move events, got ${moves}`);
  assert.ok(meanInterval != null && meanInterval < 0.09, `mean step interval should be ~0.06–0.08s, got ${meanInterval}`);
  assert.ok(meanInterval > 0.05, `mean step interval should not be pathologically low, got ${meanInterval}`);

  // Cooldown stamped on session after a move
  assert.ok(Math.abs(state.drill.moveCooldown) <= MOVE_COOLDOWN_BASE + 1e-6
    || state.drill.moveCooldown <= MOVE_COOLDOWN_BASE,
    'moveCooldown should track the halved base');

  console.log(JSON.stringify({
    ok: true,
    section: 'move-cadence',
    holdSec,
    dt,
    moves,
    advanced,
    meanInterval,
    baselineTiles2s: BASELINE_TILES_2S,
    ratioVsBaseline: advanced / BASELINE_TILES_2S,
    MOVE_COOLDOWN_BASE,
  }));
}

// --- 3. Draw position interpolates across the full move window ---
{
  const { state } = setup();
  drill.begin(111);
  const a = state.drill.avatar;
  a.fromCol = 10;
  a.fromRow = 5;
  a.col = 11;
  a.row = 5;
  a.moveDuration = 0.06;
  a.moveElapsed = 0;
  let p0 = avatarDrawPos(a, 40);
  assert.equal(p0.t, 0, 'progress 0 at move start');
  assert.equal(p0.x, 10 * 40, 'draw x starts at fromCol');
  a.moveElapsed = 0.03;
  let pMid = avatarDrawPos(a, 40);
  assert.ok(Math.abs(pMid.t - 0.5) < 1e-9, 'progress 0.5 mid-move');
  assert.ok(Math.abs(pMid.x - 10.5 * 40) < 1e-6, 'draw x mid between tiles');
  a.moveElapsed = 0.06;
  let p1 = avatarDrawPos(a, 40);
  assert.equal(p1.t, 1, 'progress 1 at move end');
  assert.equal(p1.x, 11 * 40, 'draw x lands on toCol');
  assert.equal(avatarMoveProgress(a), 1);

  // Live path: after empty step, from/to fields + elapsed advance with tickInput
  carveTunnel(state, a.col, 10);
  state.drill.moveCooldown = 0;
  const fromRow = state.drill.avatar.row;
  drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
  assert.equal(state.drill.avatar.row, fromRow + 1, 'logical row advances one tile');
  assert.equal(state.drill.avatar.fromRow, fromRow, 'fromRow captures pre-move cell');
  assert.ok(state.drill.avatar.moveDuration > 0, 'moveDuration set for presentation');
  const startDraw = avatarDrawPos(state.drill.avatar, DRILL_CONST.TILE);
  assert.ok(startDraw.t < 0.05, 'interp starts at the beginning of the move window');
  assert.ok(Math.abs(startDraw.y - fromRow * DRILL_CONST.TILE) < 1e-6, 'draw begins at previous tile');

  // Mid-window: advance elapsed without a new tile step (cooldown still running)
  drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
  const mid = avatarDrawPos(state.drill.avatar, DRILL_CONST.TILE);
  assert.ok(mid.t > 0.1 && mid.t < 0.95, `mid-move progress expected, got ${mid.t}`);
  assert.ok(mid.y > fromRow * DRILL_CONST.TILE, 'draw y has left the previous tile');
  assert.ok(mid.y < (fromRow + 1) * DRILL_CONST.TILE, 'draw y has not snapped to next tile yet');

  // Finish the move window
  for (let i = 0; i < 10; i++) {
    drill.tickInput({ left: false, right: false, up: false, down: false }, 1 / 60);
  }
  const end = avatarDrawPos(state.drill.avatar, DRILL_CONST.TILE);
  assert.ok(end.t >= 0.99, 'after move window, draw has completed the lerp');
  assert.ok(Math.abs(end.y - state.drill.avatar.row * DRILL_CONST.TILE) < 1e-6, 'draw snaps to logical cell at end');

  console.log(JSON.stringify({ ok: true, section: 'draw-interp', startT: startDraw.t, midT: mid.t, endT: end.t }));
}

// --- 4. Yield path still mutates cargo + yieldLog via addCargo ---
{
  const { state, bus } = setup();
  const events = [];
  bus.on('drill:yield', (p) => events.push({ kind: 'yield', ...p }));
  bus.on('drill:break', (p) => events.push({ kind: 'break', tileType: p.type, wasVein: p.wasVein, wasGas: p.wasGas }));

  state.drill = {
    asteroidId: 'yield_rock',
    field: [[
      { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1 },
      { type: 'vein', hp: 1, maxHp: 1, ore: 'cmdty_silicate', yieldU: 3, hazard: false, tierReq: 1 },
    ]],
    avatar: {
      col: 0, row: 0, fromCol: 0, fromRow: 0, moveDuration: 0, moveElapsed: 0,
      faceDir: 'down', isDrilling: false, drillTarget: null,
    },
    drillDir: null,
    moveCooldown: 0,
    drillTemp: 0,
    overheated: false,
    cableTrail: [{ col: 0, row: 0 }],
    accumulator: 0,
    gasHits: 0,
    yieldLog: {},
    active: true,
  };

  const before = state.player.cargo.items.cmdty_silicate || 0;
  // Large dt clears the vein in one tick at default DPS
  drill.tickInput({ left: false, right: false, up: false, down: true }, 1.0);
  assert.equal(state.player.cargo.items.cmdty_silicate, before + 3, 'yield must call addCargo');
  assert.equal(state.drill.yieldLog.cmdty_silicate, 3, 'yieldLog records units');
  assert.ok(events.some((e) => e.kind === 'break' && e.wasVein), 'drill:break fires on clear');
  assert.ok(events.some((e) => e.kind === 'yield' && e.qty === 3), 'drill:yield fires with qty');
  console.log(JSON.stringify({ ok: true, section: 'yield', events: events.map((e) => e.kind) }));
}

// --- 5. Gas path damages hull + gasHits ---
{
  const { state, bus } = setup();
  const events = [];
  bus.on('drill:gasHit', (p) => events.push(p));
  bus.on('drill:break', (p) => events.push({ type: 'break', ...p }));

  const player = state.entities.get(state.playerId);
  const hullBefore = player.hull;

  state.drill = {
    asteroidId: 'gas_rock',
    field: [[
      { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1 },
      { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1 },
    ]],
    avatar: {
      col: 0, row: 0, fromCol: 0, fromRow: 0, moveDuration: 0, moveElapsed: 0,
      faceDir: 'down', isDrilling: false, drillTarget: null,
    },
    drillDir: null,
    moveCooldown: 0,
    drillTemp: 0,
    overheated: false,
    cableTrail: [{ col: 0, row: 0 }],
    accumulator: 0,
    gasHits: 0,
    yieldLog: {},
    active: true,
  };

  drill.tickInput({ left: false, right: false, up: false, down: true }, 1.0);
  assert.equal(state.drill.gasHits, 1, 'gasHits increments');
  assert.ok(player.hull < hullBefore, 'hull reduced on gas');
  assert.ok(player.hull >= 1, 'hull floor preserved');
  assert.ok(events.some((e) => e.dmg > 0), 'drill:gasHit carries damage');
  console.log(JSON.stringify({
    ok: true,
    section: 'gas',
    hullBefore,
    hullAfter: player.hull,
    gasHits: state.drill.gasHits,
  }));
}

// --- 6. Structural: UI uses avatarDrawPos + denser particle paths ---
{
  const uiSrc = readFileSync(new URL('../src/ui/screens/drill.js', import.meta.url), 'utf8');
  assert.match(uiSrc, /avatarDrawPos/, 'UI must import/use avatarDrawPos for time-interp draw');
  assert.match(uiSrc, /spawnParticleBurst/, 'UI must densify FX via spawnParticleBurst');
  assert.match(uiSrc, /drill:break/, 'UI must handle drill:break for break pop');
  assert.match(uiSrc, /prefersReducedMotion|motionReduce/, 'UI must respect motionReduce');
  assert.match(uiSrc, /stepParticles/, 'UI must step particles via shared helper');
  // Must not rely solely on discrete col*TILE without interp helper
  assert.ok(
    !/drillScreen\._rx \+= \(targetX - drillScreen\._rx\) \* 16 \* dt/.test(uiSrc),
    'legacy exponential snap lerp must be gone',
  );
  console.log(JSON.stringify({ ok: true, section: 'struct-ui' }));
}

// --- 7. Structural: system exports presentation fields ---
{
  const sysSrc = readFileSync(new URL('../src/systems/drill.js', import.meta.url), 'utf8');
  assert.match(sysSrc, /MOVE_COOLDOWN_BASE\s*=\s*0\.06/, 'system base cooldown 0.06');
  assert.match(sysSrc, /fromCol/, 'system tracks fromCol for interp');
  assert.match(sysSrc, /moveElapsed/, 'system tracks moveElapsed');
  assert.match(sysSrc, /commitAvatarMove|avatarDrawPos/, 'move commit or draw helper present');
  console.log(JSON.stringify({ ok: true, section: 'struct-sys' }));
}

console.log('check-drill-smooth: PASS');
