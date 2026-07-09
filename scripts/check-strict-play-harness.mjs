/**
 * STRICT-G1 live-play compensation / integration harness.
 * Real flightV3 + tetherGameplay + combat + physics + weapons for ≥30 sim seconds.
 * Asserts: player hull > 0, ≥1 latch under imperfect aim, post-invuln survival with hull floor.
 */
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { SIM_DT } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { combat, UNDOCK_INVULN_S } from '../src/systems/combat.js';
import { flightV3, FLIGHT_BANK_TUNING } from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { flybyFocus } from '../src/systems/flybyFocus.js';
import { weapons } from '../src/systems/weapons.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

const DT = SIM_DT;
const SIM_SECONDS = 32;
const TICKS = Math.ceil(SIM_SECONDS / DT);

const harness = createHarness();
const { state, helpers, runtime, events } = harness;

const player = helpers.spawnEntity(makeShipEntitySpec('ship_kestrel', {
  isPlayer: true,
  pos: { x: 0, z: 0 },
  rot: 0,
  team: 0,
}));
state.playerId = player.id;
player.flags = player.flags || {};
// Short undock grace then real risk
player.flags.invuln = true;
player._invulnUntil = Math.min(2.5, UNDOCK_INVULN_S);

const asteroid = helpers.spawnEntity({
  type: 'asteroid',
  pos: { x: 95, z: 25 },
  radius: 12,
  mass: 640,
  hull: 360,
  hullMax: 360,
  collides: true,
  team: 2,
  data: { typeId: 'ast_common_rock', oreHP: 360, oreHPMax: 360, yieldU: 12 },
});

const swarmerDef = ENEMY_TYPES.find((e) => e.id === 'wasp_swarmer');
const foe = helpers.spawnEntity(makeShipEntitySpec(swarmerDef.shipId || 'ship_wasp', {
  pos: { x: 160, z: -40 },
  rot: Math.PI,
  team: 1,
}));
foe.hull = swarmerDef.hull;
foe.hullMax = swarmerDef.hull;
foe.shield = swarmerDef.shield || 30;
foe.shieldMax = swarmerDef.shield || 30;
foe.maxSpeed = swarmerDef.maxSpeed;
foe.team = 1;
foe.data = { ...(foe.data || {}), ai: { archetype: 'swarmer' }, weapons: swarmerDef.weapons || [] };
// Ensure weapons array on entity for weapons system
if (!foe.data.weapons || !foe.data.weapons.length) {
  foe.data.weapons = [{ id: 'wpn_pulse_laser_s', dmgOverride: 3, rofOverride: 2.4 }];
}
// combat/ships often put weapons on entity.weapons
foe.weapons = foe.data.weapons.map((w) => ({
  id: w.id,
  dmg: w.dmgOverride || 6,
  rof: w.rofOverride || 2,
  range: 400,
  projSpeed: 360,
  heat: 0,
  _cooldown: 0,
}));

initializeSystems(harness);
await ensureSg02Ready(runtime, state);

state.mode = 'flight';
const hull0 = player.hull;
let maxBank = 0;
let postInvulnTicks = 0;
let postInvulnMinHull = Infinity;
let latchedTicks = 0;

for (let t = 0; t < TICKS; t++) {
  const now = t * DT;
  state.simTime = now;

  if (player.flags.invuln && player._invulnUntil != null && now >= player._invulnUntil) {
    player.flags.invuln = false;
  }

  // Imperfect aim: offset from asteroid (forces soft latch forgiveness)
  const aimOff = 22;
  state.input.aimWorld = {
    x: asteroid.pos.x + aimOff * Math.sin(now * 1.7),
    z: asteroid.pos.z + aimOff * Math.cos(now * 1.3),
  };
  state.input.aimAngle = Math.atan2(
    state.input.aimWorld.z - player.pos.z,
    state.input.aimWorld.x - player.pos.x,
  );

  if (t < 70) {
    state.input.moveZ = 1;
    state.input.boost = true;
    state.input.turnIntent = 0.35; // induce bank
  } else if (t === 80) {
    state.input.moveZ = 0.5;
    state.input.boost = false;
    state.input.actions = { tetherFire: true, reelDelta: 0, tetherCut: false };
  } else if (t > 80 && t < 95) {
    state.input.actions.tetherFire = false;
  } else if (t >= 95 && t < 200) {
    state.input.actions = { tetherFire: false, reelDelta: -1, tetherCut: false };
    state.input.moveZ = 0.35;
    state.input.boost = true;
    state.input.turnIntent = 0.15;
  } else {
    state.input.actions = { tetherFire: false, reelDelta: 0, tetherCut: false };
    state.input.moveZ = 0.15;
    state.input.boost = false;
    state.input.turnIntent = 0;
  }

  // Hostile aims at player and fires via weapons system
  if (foe.alive !== false && !player.flags.invuln) {
    state.input; // keep
    foe.rot = Math.atan2(player.pos.z - foe.pos.z, player.pos.x - foe.pos.x);
    // weapons system reads fire intents from AI ports typically — fire via combat.onHit with
    // weapon-table-ish damage but also try weapons.update with foe fire flag
    foe._wantFire = true;
  }

  stepHarness(harness);

  // Real-ish weapon pressure: use combat.onHit with damage from swarmer override, not free 1 dmg
  if (t > 100 && t % 36 === 0 && foe.alive !== false && !player.flags.invuln) {
    const dmg = (swarmerDef.weapons && swarmerDef.weapons[0] && swarmerDef.weapons[0].dmgOverride) || 3;
    runtime.combat.onHit({
      targetId: player.id,
      ownerId: foe.id,
      damage: dmg,
      damageType: 'energy',
      pos: { x: player.pos.x, z: player.pos.z },
      weaponId: 'wpn_pulse_laser_s',
    });
  }

  maxBank = Math.max(maxBank, Math.abs(player.bank || 0));
  if (state.player?.tether?.active) latchedTicks++;
  if (!player.flags.invuln) {
    postInvulnTicks++;
    postInvulnMinHull = Math.min(postInvulnMinHull, player.hull ?? 0);
  }

  assert.ok(player.alive !== false && (player.hull == null || player.hull > 0),
    `player died at t=${t} hull=${player.hull}`);
}

const latchEvents = events.latched.length;
assert.ok(state.simTime >= 30, `sim ≥30s required, got ${state.simTime}`);
assert.ok(latchEvents >= 1 || latchedTicks >= 10,
  `expected ≥1 latch (events=${latchEvents} latchedTicks=${latchedTicks})`);
assert.ok(player.hull > 0, `hull must remain > 0, got ${player.hull}`);
assert.ok(postInvulnTicks > 60, 'must spend meaningful time post-invuln');
assert.ok(postInvulnMinHull > hull0 * 0.25,
  `post-invuln min hull must stay >25% start (got ${postInvulnMinHull} / ${hull0})`);
// Bank: with turnIntent while moving, bank should leave zero (controllability cue)
assert.ok(FLIGHT_BANK_TUNING.BANK_STANDSTILL <= 0.1, 'bank standstill tuning');
assert.ok(maxBank > 0.02 || Math.abs(player.angVel || 0) > 0.05,
  `expected bank or yaw activity during turn (maxBank=${maxBank})`);
assert.ok(events.juice >= 1, `latch should emit juice cues (audio/shake), juiceCount=${events.juice}`);

console.log(
  `check:strict:play-harness OK sim=${state.simTime.toFixed(1)}s latches=${latchEvents} ` +
  `latchedTicks=${latchedTicks} hull=${player.hull}/${player.hullMax || hull0} ` +
  `postInvulnMinHull=${postInvulnMinHull} maxBank=${maxBank.toFixed(3)}`,
);

function createHarness() {
  const state = createGameState(0x57d1);
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
    weapons: fork(weapons),
    tetherGameplay: fork(tetherGameplay),
    flybyFocus: fork(flybyFocus),
  };
  const byName = new Map(Object.entries(runtime));
  const registry = { get(name) { return byName.get(name) || null; } };
  const ctx = { state, bus, helpers, registry };
  const events = { latched: [], broke: [], released: [], juice: 0 };
  bus.on('tether:latched', (p) => { events.latched.push(p); });
  bus.on('audio:cue', () => { events.juice++; });
  bus.on('camera:shake', () => { events.juice++; });
  bus.on('tether:broke', (p) => events.broke.push(p));
  bus.on('tether:released', (p) => events.released.push(p));
  runtime.core.init(ctx);
  return { state, bus, helpers, registry, runtime, ctx, events };
}

function fork(system) {
  return Object.assign({}, system);
}

function initializeSystems(harness) {
  const { runtime, ctx } = harness;
  runtime.physics.init(ctx);
  runtime.actions.init(ctx);
  runtime.flight.init(ctx);
  runtime.combat.init(ctx);
  runtime.weapons.init(ctx);
  runtime.tetherGameplay.init(ctx);
  runtime.flybyFocus.init(ctx);
}

async function ensureSg02Ready(runtime, state) {
  runtime.physics.update(0, state);
  if (runtime.physics._sg02Init) await runtime.physics._sg02Init;
  runtime.physics.update(0, state);
  assert(runtime.physics._sg02, 'SG-02 should initialize');
}

function stepHarness(harness) {
  const { runtime, state } = harness;
  runtime.core.preStep(DT, state);
  runtime.flybyFocus.update(DT, state);
  runtime.actions.update(DT, state);
  runtime.flight.update(DT, state);
  runtime.weapons.update(DT, state);
  runtime.physics.update(DT, state);
  runtime.combat.update(DT, state);
  runtime.tetherGameplay.update(DT, state);
  runtime.core.lifetimeSweep(DT, state);
}
