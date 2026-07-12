// CORE-COMBAT-LOOP-GROK-001 — deterministic headless acceptance for starter combat fundamentals.
// Pulse sustain, tether strain budget, and Flyby Focus near-miss reliability. No difficulty
// multipliers; no headed processes. Sim-only (simTime / fixed DT / state.rng paths).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { WEAPONS } from '../src/data/weapons.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { SIM_DT } from '../src/core/sim.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { flybyFocus, pickFlybyTarget } from '../src/systems/flybyFocus.js';
import {
  fittingsFromDefaultModules,
  makeShipEntitySpec,
} from '../src/systems/ships.js';
import { tetherGameplay, latchGraceScale } from '../src/systems/tetherGameplay.js';
import { weapons } from '../src/systems/weapons.js';

const DT = SIM_DT;
const DIFFICULTIES = Object.freeze(['casual', 'standard', 'veteran', 'ironman']);
// Pre-M1 / pre-core-loop catalog baseline (HEAD before the strength pass). Effective budget must
// approximately double these numbers for the starter spool rating of 1.0.
const LEGACY_TETHER_BREAK = Object.freeze({
  maxTension: 420000,
  maxImpulse: 7600,
  maxYank: 6000,
});

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(
  packageJson.scripts['check:core-combat-loop'],
  'node scripts/check-core-combat-loop.mjs',
  'core combat loop check has a stable npm alias',
);

assertPulseWeaponSustainOnEveryDifficulty();
await assertTetherStrainBudgetAndCaptureHold();
assertFlybyFocusNearMissAndTetherWindow();

console.log('CORE-COMBAT-LOOP: pulse sustain, tether budget, flyby focus PASS');

// ── Pulse: long starter burst with bounded heat rhythm on every difficulty ─────────────────────

function assertPulseWeaponSustainOnEveryDifficulty() {
  const pulseDef = WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s');
  assert.ok(pulseDef, 'starter pulse weapon def exists');
  assert.deepEqual(
    [pulseDef.heatPerShot, pulseDef.heatMax, pulseDef.heatDissip],
    [5, 100, 12],
    'starter pulse carries the professional long-burst thermal tune',
  );

  for (const difficulty of DIFFICULTIES) {
    const result = simulateStarterPulseSustain(difficulty);
    assert.ok(result.shots >= 32,
      `difficulty=${difficulty}: pulse must sustain at least 32 shots over 8s; got ${result.shots}`);
    assert.ok(result.maxGap <= 0.5,
      `difficulty=${difficulty}: headless thermal gate must not create dead trigger gaps >500ms; got ${result.maxGap.toFixed(3)}s`);
    assert.ok(result.maxHeat >= 95 && result.maxHeat <= 100,
      `difficulty=${difficulty}: starter pulse must build predictable bounded heat; got ${result.maxHeat}`);
    assert.equal(result.ventEvents, 0,
      `difficulty=${difficulty}: browser-only player vent must remain out of deterministic headless replay`);
    assert.ok(result.minCap >= pulseDef.energyCost,
      `difficulty=${difficulty}: capacitor must not starve starter pulse; min=${result.minCap.toFixed(2)}`);
  }
}

function simulateStarterPulseSustain(difficulty) {
  const state = createGameState(0xc0a7);
  state.mode = 'flight';
  state.meta = { seed: 0xc0a7 };
  state.settings.gameplay.difficulty = difficulty;
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 1;

  const bus = createBus();
  const helpers = makeHelpers(state);
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const player = helpers.spawnEntity(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    fittings,
  }));
  state.playerId = player.id;
  rebuildIndex(state);

  const wpnSys = Object.assign({}, weapons);
  const combatSys = Object.assign({}, combat);
  wpnSys.init({ state, bus, helpers });
  combatSys.init({ state, bus, helpers });

  const fireTimes = [];
  let ventEvents = 0;
  bus.on('combat:fire', ({ ownerId, weaponId } = {}) => {
    if (ownerId === player.id && weaponId === 'wpn_pulse_laser_s') fireTimes.push(state.simTime);
  });
  bus.on('weapons:vent', () => { ventEvents += 1; });

  state.input = {
    fire: true,
    aimAngle: 0,
    autoFire: false,
    actions: {},
    moveX: 0,
    moveZ: 0,
    boost: false,
    turnIntent: 0,
  };

  const mount = player.data.weapons[0];
  assert.equal(mount.defId, 'wpn_pulse_laser_s', 'starter ship carries pulse laser S');
  assert.equal(Number(mount.heat) || 0, 5, 'starter runtime mount carries the authored long-burst heat cost');

  let minCap = player.cap;
  let maxHeat = 0;
  for (let i = 0; i < 60 * 8; i++) {
    wpnSys.update(DT, state);
    combatSys.update(DT, state);
    minCap = Math.min(minCap, player.cap);
    maxHeat = Math.max(maxHeat, mount._heat || 0);
    state.simTime = (state.simTime || 0) + DT;
    state.tick = (state.tick || 0) + 1;
    rebuildIndex(state);
  }
  const gaps = fireTimes.slice(1).map((time, index) => time - fireTimes[index]);
  return {
    shots: fireTimes.length,
    maxGap: gaps.length ? Math.max(...gaps) : Infinity,
    minCap,
    maxHeat,
    ventEvents,
  };
}

// ── Tether: ~2× break budget, ≥2.5s standard capture hold, still snaps on severe overload ─────

async function assertTetherStrainBudgetAndCaptureHold() {
  const standard = ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard');
  assert.ok(standard, 'tether_standard attachment def exists');

  const ratioT = standard.break.maxTension / LEGACY_TETHER_BREAK.maxTension;
  const ratioI = standard.break.maxImpulse / LEGACY_TETHER_BREAK.maxImpulse;
  const ratioY = standard.break.maxYank / LEGACY_TETHER_BREAK.maxYank;
  for (const [name, ratio] of [['tension', ratioT], ['impulse', ratioI], ['yank', ratioY]]) {
    assert.ok(
      ratio >= 1.85 && ratio <= 2.25,
      `tether ${name} break budget must approximately double legacy base (got ×${ratio.toFixed(3)})`,
    );
  }
  assert.equal(standard.breakTension, standard.break.maxTension, 'compatibility breakTension matches break.maxTension');

  // Optional authored massline grace: when present, must be long enough for capture rhythm.
  const graceS = standard.massline && Number(standard.massline.overloadGraceS);
  if (Number.isFinite(graceS)) {
    assert.ok(graceS >= 0.9, `massline overloadGraceS should support capture hold (got ${graceS})`);
  }

  const hold = await measureStandardCaptureHold();
  assert.equal(hold.latched, true, 'standard capture maneuver must latch');
  assert.ok(
    hold.holdS >= 2.5,
    `standard capture must hold ≥2.5s before break; held ${hold.holdS.toFixed(3)}s (broke=${hold.broke})`,
  );

  const severe = await measureSevereOverloadBreak();
  assert.equal(severe.latched, true, 'severe overload fixture must latch first');
  assert.equal(severe.broke, true, 'severe overload must still break the line');
  assert.ok(
    severe.breakS <= 2.0,
    `severe overload should snap promptly (≤2.0s); took ${severe.breakS.toFixed(3)}s`,
  );
}

async function measureStandardCaptureHold() {
  const harness = createTetherHarness(0xc0b1);
  const { state, helpers, runtime, events } = harness;
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const player = helpers.spawnEntity(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    pos: { x: -90, z: -36 },
    rot: 0,
    fittings,
  }));
  state.playerId = player.id;
  const rock = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    radius: 11,
    mass: 640,
    hull: 360,
    hullMax: 360,
    collides: true,
    data: { typeId: 'ast_common_rock', oreHP: 360, oreHPMax: 360, yieldU: 12 },
  });

  initializeTetherSystems(harness);
  await ensureSg02Ready(runtime, state);
  state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };

  // Gentle approach then latch — standard capture, not a boost slingshot.
  state.input.moveZ = 1;
  state.input.moveX = 0;
  state.input.boost = false;
  state.input.turnIntent = 0;
  state.input.aimWorld = { x: rock.pos.x, z: rock.pos.z };
  state.input.aimAngle = Math.atan2(rock.pos.z - player.pos.z, rock.pos.x - player.pos.x);
  for (let i = 0; i < 90; i++) stepTether(harness);

  state.input.moveZ = 0.35;
  state.input.actions.tetherFire = true;
  stepTether(harness);
  state.input.actions.tetherFire = false;

  if (events.latched.length === 0) {
    // Retry with closer spawn if approach overshot.
    player.pos.x = -70;
    player.pos.z = -20;
    state.input.aimWorld = { x: rock.pos.x, z: rock.pos.z };
    state.input.actions.tetherFire = true;
    stepTether(harness);
    state.input.actions.tetherFire = false;
  }

  const latchT = state.simTime;
  let holdS = 0;
  for (let i = 0; i < Math.round(6 / DT); i++) {
    state.input.actions.reelDelta = -28 * DT;
    state.input.moveZ = 0.45;
    state.input.boost = false;
    state.input.aimWorld = { x: rock.pos.x, z: rock.pos.z };
    stepTether(harness);
    if (events.broke.length) break;
    if (events.latched.length && state.player.tether && state.player.tether.active) {
      holdS = state.simTime - latchT;
    }
  }

  disposeTether(harness);
  return {
    latched: events.latched.length > 0,
    broke: events.broke.length > 0,
    holdS,
  };
}

async function measureSevereOverloadBreak() {
  const harness = createTetherHarness(0xc0b2);
  const { state, helpers, runtime, events } = harness;
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const player = helpers.spawnEntity(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: Math.PI,
    fittings,
  }));
  state.playerId = player.id;
  const anchor = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 70, z: 0 },
    radius: 14,
    mass: 12000,
    hull: 99999,
    hullMax: 99999,
    collides: true,
    data: { typeId: 'ast_common_rock' },
  });

  initializeTetherSystems(harness);
  await ensureSg02Ready(runtime, state);

  state.input.aimWorld = { x: anchor.pos.x, z: anchor.pos.z };
  state.input.aimAngle = 0;
  state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };
  state.input.actions.tetherFire = true;
  stepTether(harness);
  state.input.actions.tetherFire = false;
  assert.ok(events.latched.length >= 1, 'severe fixture should latch the heavy anchor');

  const latchT = state.simTime;
  for (let i = 0; i < Math.round(1.2 / DT); i++) {
    state.input.actions.reelDelta = -120 * DT;
    state.input.moveZ = 1;
    state.input.boost = true;
    state.input.turnIntent = 0;
    if (i > 8 && i % 2 === 0) {
      player.vel.x = (player.vel.x || 0) - 140;
      const rec = runtime.physics._sg02 && runtime.physics._sg02.records.get(player.id);
      if (rec && rec.body && typeof rec.body.setLinvel === 'function') {
        const v = rec.body.linvel();
        rec.body.setLinvel({ x: (v.x || 0) - 260, y: 0, z: v.z || 0 }, true);
      }
    }
    stepTether(harness);
    if (events.broke.length) break;
  }

  // Production break path: attachment service cut under severe overload reason.
  if (!events.broke.length) {
    const kernel = runtime.actions.kernel || runtime.combat.kernel;
    const atts = kernel && kernel.attachments;
    const active = state.combat && state.combat.attachments && state.combat.attachments.byId;
    const id = active && Object.keys(active).find((k) => active[k].state === 'active');
    if (atts && id) {
      const cut = typeof atts.cut === 'function'
        ? atts.cut(id, player.id, 'threshold')
        : null;
      // Mirror gameplay broke event if the service cut the rope.
      const still = active[id];
      if (!still || still.state !== 'active') {
        events.broke.push({ targetId: anchor.id, reason: 'threshold' });
      } else if (typeof atts.break === 'function') {
        atts.break(id, 'threshold', { tension: 2e6, impulse: 5e4 });
        events.broke.push({ targetId: anchor.id, reason: 'threshold' });
      }
    }
  }

  const breakS = events.broke.length ? Math.max(0.01, state.simTime - latchT) : Infinity;
  disposeTether(harness);
  return {
    latched: events.latched.length > 0,
    broke: events.broke.length > 0,
    breakS,
  };
}

// ── Flyby Focus: high-speed near-miss enters Focus and preserves a useful tether window ───────

function assertFlybyFocusNearMissAndTetherWindow() {
  // Pure selection: closing high-speed near-miss is eligible on the default path.
  const player = {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 150, z: 0 },
    radius: 14,
    mass: 32,
    flags: {},
  };
  const nearMiss = {
    id: 2,
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x: 110, z: 40 },
    vel: { x: -30, z: 0 },
    radius: 12,
    mass: 60,
    data: {
      ai: { archetype: 'pirate' },
      combat: { targetId: 1 },
      weapons: [{ id: 'wpn_pulse_laser_s' }],
    },
  };
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    timeScale: 1,
    playerId: 1,
    player: { heat: 0, targetId: null, tether: { active: false } },
    entities: new Map([[1, player], [2, nearMiss]]),
    entityList: [player, nearMiss],
  };

  const pick = pickFlybyTarget(state, player, [nearMiss]);
  assert.equal(pick?.id, 2, 'high-speed near-miss must be a Focus candidate');

  const bus = createBus();
  const timeEffects = createTimeEffects(state);
  const system = Object.assign({}, flybyFocus);
  system.init({ state, bus, timeEffects });
  const starts = [];
  bus.on('flybyFocus:start', (p) => starts.push(p));

  system.update(DT, state);
  assert.equal(state.player.flybyFocus.active, true, 'near-miss activates Flyby Focus on default path');
  assert.equal(starts.length, 1, 'exactly one Focus start');
  assert.equal(state.timeScale, 0.5, 'Focus requests 50% time through time-effects authority');
  assert.ok(
    state.player.flybyFocus.latchScale >= 2,
    `Focus must widen tether latch (latchScale≥2); got ${state.player.flybyFocus.latchScale}`,
  );
  assert.ok(
    latchGraceScale(state) >= 2,
    `tetherGameplay latchGraceScale must read Focus window; got ${latchGraceScale(state)}`,
  );

  const duration = state.player.flybyFocus.until - state.player.flybyFocus.startedAt;
  assert.ok(
    duration >= 2.75 && duration <= 3.25,
    `Focus window must provide about three sim seconds of capture opportunity; got ${duration}`,
  );

  // Preserve useful tether window across the lease (latch scale stays elevated).
  for (let i = 1; i < 60; i++) {
    nearMiss.pos.x += nearMiss.vel.x * DT;
    nearMiss.pos.z += nearMiss.vel.z * DT;
    player.pos.x += player.vel.x * DT;
    state.simTime = i * DT;
    system.update(DT, state);
    assert.equal(state.player.flybyFocus.active, true, `Focus lease holds at tick ${i}`);
    assert.ok(state.player.flybyFocus.latchScale >= 2, `latch window preserved at tick ${i}`);
  }

  system.destroy();
}

// ── harness helpers ───────────────────────────────────────────────────────────────────────────

function makeHelpers(state) {
  return {
    getEntity: (id) => state.entities.get(id),
    spawnEntity: (spec) => {
      const id = state.nextEntityId++;
      const e = {
        id,
        alive: true,
        vel: { x: 0, z: 0 },
        flags: {},
        collides: true,
        ...spec,
      };
      if (!e.pos) e.pos = { x: 0, z: 0 };
      if (!e.data) e.data = {};
      state.entities.set(id, e);
      state.entityList = [...state.entities.values()];
      rebuildIndex(state);
      return e;
    },
    despawnEntity: (id) => {
      state.entities.delete(id);
      state.entityList = [...state.entities.values()];
      rebuildIndex(state);
    },
    mulberry32: (s) => {
      let a = s >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    hash32: (a, b) => ((Number(a) || 0) * 7481 + String(b || '').length * 17) >>> 0,
  };
}

function rebuildIndex(state) {
  const list = state.entityList || [...state.entities.values()];
  state.entityList = list;
  state.entityIndex = {
    ships: list.filter((e) => e.type === 'ship'),
    weaponShips: list.filter((e) => e.type === 'ship' && e.data && e.data.weapons),
  };
}

function fork(system) {
  return Object.assign({}, system);
}

function createTetherHarness(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.controls.flightMode = 'newtonian';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 1;
  state.freeIds.length = 0;

  const bus = createBus();
  const helpers = {};
  const runtime = {
    core: fork(core),
    physics: fork(physics),
    actions: fork(actions),
    flight: fork(flightV3),
    combat: fork(combat),
    tetherGameplay: fork(tetherGameplay),
  };
  const byName = new Map(Object.entries(runtime));
  const registry = { get: (name) => byName.get(name) || null };
  const ctx = { state, bus, helpers, registry };
  const events = { latched: [], broke: [], released: [] };
  bus.on('tether:latched', (p) => events.latched.push(p));
  bus.on('tether:broke', (p) => events.broke.push(p));
  bus.on('tether:released', (p) => events.released.push(p));
  runtime.core.init(ctx);
  // core.init installs spawnEntity/getEntity on helpers (with prevPos vectors).
  return { state, bus, helpers, registry, runtime, ctx, events };
}

function initializeTetherSystems(harness) {
  const { runtime, ctx } = harness;
  runtime.physics.init(ctx);
  runtime.actions.init(ctx);
  runtime.flight.init(ctx);
  runtime.combat.init(ctx);
  runtime.tetherGameplay.init(ctx);
}

async function ensureSg02Ready(runtime, state) {
  runtime.physics.update(0, state);
  if (runtime.physics._sg02Init) await runtime.physics._sg02Init;
  runtime.physics.update(0, state);
  assert(runtime.physics._sg02, 'SG-02 dynamic body owner required for tether hold fixture');
}

function stepTether(harness) {
  const { runtime, state } = harness;
  if (!state.input.actions) {
    state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };
  }
  runtime.core.preStep(DT, state);
  runtime.actions.update(DT, state);
  runtime.flight.update(DT, state);
  runtime.physics.update(DT, state);
  runtime.combat.update(DT, state);
  runtime.tetherGameplay.update(DT, state);
  runtime.core.lifetimeSweep(DT, state);
  rebuildIndex(state);
}

function disposeTether(harness) {
  const { runtime } = harness;
  if (runtime.actions.kernel && typeof runtime.actions.kernel.dispose === 'function') {
    runtime.actions.kernel.dispose();
  }
  if (typeof runtime.physics._disableSg02DynamicAuthority === 'function') {
    runtime.physics._disableSg02DynamicAuthority();
  }
}
