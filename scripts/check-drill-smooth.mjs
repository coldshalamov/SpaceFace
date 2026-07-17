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
  SCAN_RADIUS,
  SCAN_COOLDOWN_S,
  SCAN_ACTIVE_S,
  DRILL_ENERGY_MAX,
  DRILL_ENERGY_RESUME,
  materialHardness,
  extractionTelemetry,
} from '../src/systems/drill.js';
import { cargo } from '../src/systems/cargo.js';
import { addCargo } from '../src/systems/cargo.js';
import {
  createDrillInputController,
  resolveDrillControlMap,
} from '../src/ui/screens/drill.js';

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
  const damageRequests = [];
  const ctx = {
    state,
    bus,
    helpers: { routeCombatDamage(request) { damageRequests.push(request); return { ok: true }; } },
    registry: { get() { return null; } },
  };
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
  return { state, bus, ctx, damageRequests };
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

// --- 5. Gas path routes a canonical damage packet + gasHits (no direct hull write) ---
{
  const { state, bus, damageRequests } = setup();
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
  assert.equal(player.hull, hullBefore, 'drill must not directly mutate hull');
  assert.equal(damageRequests.length, 1, 'gas routes exactly one canonical damage request');
  assert.equal(damageRequests[0].targetId, state.playerId, 'damage request targets player entity');
  assert.equal(damageRequests[0].origin.kind, 'deep_core_gas', 'damage request carries extraction origin');
  const routedDamage = Object.values(damageRequests[0].packet.channels).reduce((sum, value) => sum + value, 0);
  assert.ok(routedDamage > 0, 'damage packet carries normalized combat channels');
  assert.ok(events.some((e) => e.dmg > 0), 'drill:gasHit carries damage');
  console.log(JSON.stringify({
    ok: true,
    section: 'gas',
    hullBefore,
    routedDamage,
    gasHits: state.drill.gasHits,
  }));
}

// --- 6. Seismic survey: radius, cooldown, persistence, and event contract ---
{
  const { state, bus } = setup();
  const pulses = [];
  bus.on('drill:scanPulse', (payload) => pulses.push(payload));
  drill.begin(7788);
  const d = state.drill;
  d.avatar.col = 10;
  d.avatar.row = 10;
  d.field[12][10] = { type: 'vein', hp: 4, maxHp: 4, ore: 'cmdty_silicate', yieldU: 1, tierReq: 1 };
  d.field[10][13] = { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1 };
  d.field[10 + SCAN_RADIUS + 1][10] = { type: 'vein', hp: 4, maxHp: 4, ore: 'cmdty_silicate', yieldU: 1, tierReq: 1 };

  assert.equal(drill.pulseScan(), true, 'ready survey pulse should fire');
  assert.equal(pulses.length, 1, 'survey pulse emits once');
  assert.equal(pulses[0].radius, SCAN_RADIUS, 'pulse publishes authored radius');
  assert.equal(d.scan.cooldown, SCAN_COOLDOWN_S, 'pulse starts cooldown');
  assert.equal(d.scan.active, SCAN_ACTIVE_S, 'pulse starts visible acknowledgment window');
  assert.equal(d.field[12][10].surveyed, true, 'ore contact inside radius is surveyed');
  assert.equal(d.field[10][13].surveyed, true, 'gas contact inside radius is surveyed');
  assert.notEqual(d.field[10 + SCAN_RADIUS + 1][10].surveyed, true, 'outside contact stays unresolved');
  assert.equal(drill.isTileSurveyed(12, 10), true, 'survey query reads persisted mark');
  assert.equal(drill.pulseScan(), false, 'cooldown prevents pulse spam');

  drill.tickInput({ left: false, right: false, up: false, down: false }, SCAN_COOLDOWN_S);
  assert.equal(d.scan.cooldown, 0, 'cooldown advances on the drill-owned clock');
  assert.equal(drill.pulseScan(), true, 'survey becomes available after cooldown');
  console.log(JSON.stringify({ ok: true, section: 'seismic-survey', contacts: pulses[0].contacts, radius: SCAN_RADIUS }));
}

// --- 7. Material choice is visible and predictable ---
{
  const { state } = setup();
  drill.begin(420042);
  const dirtProfiles = new Set();
  for (const column of state.drill.field) {
    for (const tile of column) {
      if (tile.type === 'dirt') dirtProfiles.add(`${tile.maxHp}:${tile.hardness}`);
    }
  }
  assert.equal(dirtProfiles.size, 1,
    `identical-looking soft regolith must not hide multiple cut rates (${[...dirtProfiles].join(', ')})`);

  const soft = { type: 'dirt', hp: 12, maxHp: 12, hardness: 0.65 };
  const hard = { type: 'rock', hp: 12, maxHp: 12, hardness: 1.9 };
  const softReadout = extractionTelemetry(soft, 18);
  const hardReadout = extractionTelemetry(hard, 18);
  assert.equal(materialHardness(soft), 0.65, 'authored hardness is stable');
  assert.ok(hardReadout.effectiveDps < softReadout.effectiveDps, 'hard strata takes longer to cut');
  assert.ok(hardReadout.energyPerS > softReadout.energyPerS, 'hard strata draws more energy');
  assert.ok(hardReadout.heatPerS > softReadout.heatPerS, 'hard strata produces more heat');
  assert.ok(hardReadout.remainingS > softReadout.remainingS, 'HUD time estimate reflects hardness');
  console.log(JSON.stringify({ ok: true, section: 'material-hardness', softReadout, hardReadout }));
}

// --- 8. Rig resources: hard material can exhaust energy, then release-to-recover resumes work ---
{
  const { state, bus } = setup();
  const warnings = [];
  bus.on('drill:warn', (payload) => warnings.push(payload.text));
  drill.begin(9191);
  const d = state.drill;
  const col = d.avatar.col;
  d.field[col][1] = {
    type: 'rock', hp: 1000, maxHp: 1000, hardness: 2.2, ore: null,
    hazard: false, tierReq: 1, risk: 'elevated',
  };
  for (let i = 0; i < 360 && !d.energyDepleted; i++) {
    drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
  }
  assert.equal(d.energyDepleted, true, 'hard cut exhausts the capacitor before endless held drilling');
  assert.equal(d.drillEnergy, 0, 'energy clamps at zero');
  assert.ok(d.drillTemp < 100, 'hard-material energy constraint is distinct from overheat');
  drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
  assert.ok(warnings.some((text) => /capacitor recharging/.test(text)), 'held input explains why work paused');
  for (let i = 0; i < 120 && d.energyDepleted; i++) {
    drill.tickInput({ left: false, right: false, up: false, down: false }, 1 / 60);
  }
  assert.equal(d.energyDepleted, false, 'release-to-recover restores the rig at the authored threshold');
  assert.ok(d.drillEnergy >= DRILL_ENERGY_RESUME, 'resume threshold is satisfied');
  assert.ok(d.drillEnergy <= DRILL_ENERGY_MAX, 'energy never exceeds authored maximum');
  console.log(JSON.stringify({ ok: true, section: 'rig-resources', energy: d.drillEnergy, heat: d.drillTemp }));
}

// --- 9. Deterministic retry, abort receipt, transient save contract, and live bindings ---
{
  const { state, bus } = setup();
  const endings = [];
  bus.on('drill:end', (payload) => endings.push(payload));
  drill.begin(771122);
  const fieldSignature = (d) => JSON.stringify(d.field.map((column) => column.map((tile) => [
    tile.type, tile.hp, tile.ore, tile.yieldU || 0, tile.tierReq, tile.hardness, tile.risk,
  ])));
  const first = fieldSignature(state.drill);
  assert.equal(drill.retry(), true, 'active deterministic bore can restart');
  assert.equal(fieldSignature(state.drill), first, 'same asteroid retry regenerates the exact authored field');
  state.drill.yieldLog.cmdty_silicate = 2;
  state.drill.gasHits = 1;
  state.drill.tilesCleared = 4;
  state.drill.maxDepth = 7;
  const result = drill.abort();
  assert.equal(result.reason, 'aborted');
  assert.equal(result.aborted, true);
  assert.equal(result.yieldUnits, 2);
  assert.equal(result.tilesCleared, 4);
  assert.equal(result.maxDepth, 7);
  assert.equal(endings.at(-1).reason, 'aborted', 'drill:end publishes auditable result receipt');
  assert.equal(state.drill, null, 'abort clears only transient drill state');
  assert.equal(drill.serialize(), null, 'half-cleared bore is not duplicated into saves');
  drill.begin(771122);
  drill.deserialize({ field: 'must-not-restore' });
  assert.equal(state.drill, null, 'load explicitly clears transient drill session');

  const controls = resolveDrillControlMap({
    settings: {
      gameplay: { controlScheme: 'pilot' },
      controls: { bindings: { forward: ['KeyI'], scanPulse: ['KeyP'] } },
    },
  });
  assert.deepEqual(controls.up, ['KeyI'], 'drill movement consumes live player binding');
  assert.deepEqual(controls.scan, ['KeyP'], 'drill survey consumes live player binding');
  assert.equal(controls.scanLabel, 'P', 'visible prompt comes from live binding');
  console.log(JSON.stringify({ ok: true, section: 'retry-save-bindings', result, controls }));
}

// --- 10. Structural: UI uses avatarDrawPos + dense, accessible, cached presentation paths ---
{
  const uiSrc = readFileSync(new URL('../src/ui/screens/drill.js', import.meta.url), 'utf8');
  assert.match(uiSrc, /avatarDrawPos/, 'UI must import/use avatarDrawPos for time-interp draw');
  assert.match(uiSrc, /spawnParticleBurst/, 'UI must densify FX via spawnParticleBurst');
  assert.match(uiSrc, /drill:break/, 'UI must handle drill:break for break pop');
  assert.match(uiSrc, /prefersReducedMotion|motionReduce/, 'UI must respect motionReduce');
  assert.match(uiSrc, /stepParticles/, 'UI must step particles via shared helper');
  assert.match(uiSrc, /data-drill-scan/, 'UI must expose the survey as a real button');
  assert.match(uiSrc, /resolveDrillControlMap/, 'UI must resolve movement and survey from live bindings');
  assert.match(uiSrc, /addEventListener\('keyup', onKeyUp\)/, 'UI must stop held drilling on physical key release');
  assert.match(uiSrc, /data-energy/, 'UI must expose actual rig energy');
  assert.match(uiSrc, /Restart bore/, 'UI must expose deterministic retry');
  assert.match(uiSrc, /Abort & return/, 'UI must expose an explicit abort action');
  assert.match(uiSrc, /aria-live/, 'UI must announce drill receipts to assistive tech');
  assert.match(uiSrc, /drill-activity-feed/, 'routine drill feedback must live in a sidebar activity feed');
  assert.doesNotMatch(uiSrc, /canvasWrap\.appendChild\(toastContainer\)/,
    'routine feedback must never be mounted over the drill playfield');
  assert.match(uiSrc, /canvasDirty/, 'idle frames must be able to skip the expensive canvas repaint');
  assert.match(uiSrc, /buildHeadlightSprite/, 'headlight gradient must be pre-rasterized');
  assert.match(uiSrc, /buildStrataCache/, 'unchanged strata must be pre-rasterized instead of repainted per frame');
  assert.match(uiSrc, /paintStrataNeighborhood/, 'movement and survey changes must repaint only nearby cached tiles');
  assert.match(uiSrc, /ctx2d\.drawImage\(strataCanvas/, 'the hot render path must blit the cached strata layer');
  assert.doesNotMatch(uiSrc, /const beamGrad = ctx2d\.createRadialGradient/, 'render loop must not allocate headlight gradients');
  assert.doesNotMatch(uiSrc, /Object\.entries\(d\.yieldLog\)\.filter/, 'manifest must rebuild from events, not every frame');
  // Must not rely solely on discrete col*TILE without interp helper
  assert.ok(
    !/drillScreen\._rx \+= \(targetX - drillScreen\._rx\) \* 16 \* dt/.test(uiSrc),
    'legacy exponential snap lerp must be gone',
  );
  console.log(JSON.stringify({ ok: true, section: 'struct-ui' }));
}

// --- 10b. Screen input contract: hold repeats smoothly; release stops; hitches cannot burst ---
{
  const { state } = setup();
  drill.begin(551122);
  const col = state.drill.avatar.col;
  carveTunnel(state, col, 8);
  const controls = createDrillInputController({
    drillSys: drill,
    getState: () => state.drill,
  });

  assert.equal(controls.press('down'), true, 'a direction press is accepted immediately');
  for (let i = 0; i < 30; i++) controls.tick(1 / 60);
  assert.ok(state.drill.avatar.row >= 5,
    `holding one direction must continue through a cleared tunnel (row ${state.drill.avatar.row})`);

  controls.release('down');
  const releasedRow = state.drill.avatar.row;
  controls.tick(0.5);
  assert.equal(state.drill.avatar.row, releasedRow, 'releasing the direction stops continuous travel');

  // A one-second render hitch is clamped and may cross at most one cell during that frame.
  controls.press('down');
  const beforeHitch = state.drill.avatar.row;
  controls.tick(1.0);
  assert.ok(state.drill.avatar.row - beforeHitch <= 1,
    `one delayed frame must not burst across cells (advanced ${state.drill.avatar.row - beforeHitch})`);
  controls.release('down');

  const rockRow = state.drill.avatar.row + 1;
  state.drill.field[col][rockRow] = {
    type: 'rock', hp: 20, maxHp: 20, hardness: 1, ore: null, hazard: false, tierReq: 1, risk: 'low',
  };
  const hpBefore = state.drill.field[col][rockRow].hp;
  controls.press('down');
  controls.tick(1.0);
  const hpAfterHitch = state.drill.field[col][rockRow].hp;
  assert.ok(hpBefore - hpAfterHitch <= drill.getDrillDPS() * (7 / 60) + 1e-9,
    `one slow frame must cap catch-up at 100 ms plus immediate acknowledgment (cut ${hpBefore - hpAfterHitch} HP)`);
  assert.equal(state.drill.avatar.row, rockRow - 1, 'a hitch cannot punch through the selected tile');

  for (let i = 0; i < 180 && state.drill.avatar.row < rockRow; i++) controls.tick(1 / 60);
  assert.equal(state.drill.avatar.row, rockRow, 'held input continuously drills the selected solid tile');
  controls.release('down');
  const stoppedAfterRock = state.drill.avatar.row;
  controls.tick(0.5);
  assert.equal(state.drill.avatar.row, stoppedAfterRock, 'release after drilling prevents entering another cell');

  state.drill.avatar.col = 0;
  controls.press('left');
  assert.equal(controls.hasActiveIntent(), false, 'an asteroid-boundary press retires immediately');
  controls.release('left');
  console.log(JSON.stringify({ ok: true, section: 'held-input', hpBefore, hpAfterHitch }));
}

// --- 10c. Low-frame input work keeps real-time cadence without crossing the selected cell ---
{
  const { state } = setup();
  drill.begin(667733);
  const col = state.drill.avatar.col;
  state.drill.field[col][1] = {
    type: 'rock', hp: 100, maxHp: 100, hardness: 1, ore: null, hazard: false, tierReq: 1, risk: 'low',
  };
  const controls = createDrillInputController({ drillSys: drill, getState: () => state.drill });
  controls.press('down');
  for (let frame = 0; frame < 20; frame++) controls.tick(1 / 20);
  const work = 100 - state.drill.field[col][1].hp;
  assert.ok(work >= drill.getDrillDPS() * 0.9,
    `20 FPS must preserve at least 90% of one second of drill work, got ${work} HP`);
  assert.equal(state.drill.avatar.row, 0, 'low-frame catch-up remains confined to the selected cell');
  console.log(JSON.stringify({ ok: true, section: 'low-frame-cadence', work }));
}

// --- 11. Structural: system exports presentation fields ---
{
  const sysSrc = readFileSync(new URL('../src/systems/drill.js', import.meta.url), 'utf8');
  assert.match(sysSrc, /MOVE_COOLDOWN_BASE\s*=\s*0\.06/, 'system base cooldown 0.06');
  assert.match(sysSrc, /fromCol/, 'system tracks fromCol for interp');
  assert.match(sysSrc, /moveElapsed/, 'system tracks moveElapsed');
  assert.match(sysSrc, /commitAvatarMove|avatarDrawPos/, 'move commit or draw helper present');
  assert.match(sysSrc, /pulseScan\(\)/, 'system owns the seismic survey verb');
  assert.match(sysSrc, /tile\.surveyed = true/, 'survey discoveries persist for the drill session');
  assert.match(sysSrc, /scalarHitToDamagePacket/, 'gas uses canonical combat damage packet');
  assert.doesNotMatch(sysSrc, /player\.hull\s*=/, 'drill must never directly write player hull');
  assert.match(sysSrc, /extractionTelemetry/, 'system owns hardness and resource telemetry');
  assert.match(sysSrc, /serialize\(\)[\s\S]*?return null/, 'drill session is explicitly transient across saves');
  console.log(JSON.stringify({ ok: true, section: 'struct-sys' }));
}

// --- 12. Deep-core rocks remember being drilled and refill over sim time (not instant refresh) ---
{
  const { state } = setup();
  const astId = 2000001;
  state.entities.set(astId, { id: astId, data: { typeId: 'ast_rock', yieldU: 30 } });

  drill.begin(astId);
  let d = state.drill;
  assert.equal(d.rockBudgetMax, 30, 'rock budget max is seeded from the entity yieldU');
  assert.equal(d.rockBudget, 30, 'a fresh rock pays its full budget');
  const col = d.avatar.col;
  d.field[col][1] = { type: 'vein', hp: 1, maxHp: 1, ore: 'cmdty_silicate', yieldU: 12, hazard: false, tierReq: 1 };
  drill.tickInput({ left: false, right: false, up: false, down: true }, 1.0);
  assert.equal(state.player.cargo.items.cmdty_silicate, 12, 'vein grants ore through the canonical cargo writer');
  assert.equal(d.rockBudget, 18, 'session budget is deducted by the units extracted');
  assert.ok(Math.abs(state.entities.get(astId).data.drillDepletion - 12 / 30) < 1e-9,
    'the entity remembers the depletion fraction across sessions');

  // Re-enter the SAME rock without waiting: it must NOT fully refresh.
  drill.end(); drill.begin(astId);
  assert.equal(state.drill.rockBudget, 18, 're-entering a drilled rock does not fully refresh it');

  // Play it out: a fresh vein on an exhausted rock pays nothing.
  state.drill.rockBudget = 0;
  state.drill.avatar.row = 0; state.drill.avatar.col = col; state.drill.moveCooldown = 0;
  state.drill.field[col][1] = { type: 'vein', hp: 1, maxHp: 1, ore: 'cmdty_silicate', yieldU: 5, hazard: false, tierReq: 1 };
  const beforePlayedOut = state.player.cargo.items.cmdty_silicate;
  drill.tickInput({ left: false, right: false, up: false, down: true }, 1.0);
  assert.equal(state.player.cargo.items.cmdty_silicate, beforePlayedOut, 'a played-out rock pays nothing');

  // Wait past the recovery window: the rock refills.
  state.entities.get(astId).data.drillDepletion = 1;
  state.entities.get(astId).data.lastDrillT = state.simTime || 0;
  state.simTime = (state.simTime || 0) + 601;
  drill.end(); drill.begin(astId);
  assert.equal(state.drill.rockBudget, 30, 'an exhausted rock refills over sim time');
  console.log(JSON.stringify({ ok: true, section: 'rock-memory' }));
}

// --- 13. Drill extraction shares the field-depletion ledger with flight-mode mining ---
{
  const { state } = setup();
  const astId = 2000002;
  state.entities.set(astId, { id: astId, data: { typeId: 'ast_rock', yieldU: 20, fieldId: 'field_share_99' } });

  drill.begin(astId);
  const d = state.drill;
  assert.equal(d.fieldId, 'field_share_99', 'session carries the field id for shared depletion');
  const col = d.avatar.col;
  d.field[col][1] = { type: 'vein', hp: 1, maxHp: 1, ore: 'cmdty_silicate', yieldU: 8, hazard: false, tierReq: 1 };
  drill.tickInput({ left: false, right: false, up: false, down: true }, 1.0);
  const result = drill.end();
  assert.equal(result.yieldUnits, 8, 'session result totals the extracted units');
  const fd = state.fieldDepletion && state.fieldDepletion.fields && state.fieldDepletion.fields.field_share_99;
  assert.ok(fd && fd.depletion > 0 && fd.extractedU >= 8,
    'a drill session records one receipt in the shared field-depletion ledger');
  console.log(JSON.stringify({ ok: true, section: 'field-share', depletion: fd && fd.depletion }));
}

console.log('check-drill-smooth: PASS');
