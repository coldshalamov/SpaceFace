// Focused instrumentation probe: latch an asteroid, apply controlled opposing thrust, log every
// tick's tension/yank/overload and the exact break reason. This exists to find WHY the line snaps
// under light pressure. Not a gate — a diagnostic tool.
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { SIM_DT } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = SIM_DT;
const FLIGHT_MODE = process.argv.includes('--assisted') ? 'assisted' : 'newtonian';
const THRUST = parseFloat(process.argv.find((a) => a.startsWith('--thrust='))?.slice(9) || '0.3');
const REEL = process.argv.includes('--reel');

console.log(`\n=== tether snap probe | flightMode=${FLIGHT_MODE} thrust=${THRUST} reel=${REEL} ===\n`);

const harness = createHarness();
const { state, helpers, runtime, events } = harness;
state.settings.controls.flightMode = FLIGHT_MODE;

const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
  isPlayer: true,
  pos: { x: 0, z: 0 },
  rot: 0,
}));
state.playerId = player.id;
const asteroid = helpers.spawnEntity({
  type: 'asteroid',
  pos: { x: 100, z: 0 },
  radius: 12,
  mass: 640,
  hull: 360,
  hullMax: 360,
  collides: true,
  data: { typeId: 'ast_common_rock' },
});

initializeSystems(harness);
await ensureSg02Ready(runtime, state);

state.input.aimWorld = { x: asteroid.pos.x, z: asteroid.pos.z };
state.input.aimAngle = 0;
state.input.actions = { tetherFire: true, tetherCut: false, reelDelta: 0 };
stepHarness(harness);
state.input.actions.tetherFire = false;

if (events.latched.length === 0) {
  console.log('FAILED TO LATCH — aborting');
  process.exit(1);
}
console.log(`latched at tick ${state.tick}. player mass=${player.mass} asteroid mass=${asteroid.mass}`);
console.log(`player thrust accel (derived) ~ ${player.thrust || player.maxThrust || '?'}`);
console.log('---');

// Find the attachment so we can read its runtime + break policy.
function findAttachment() {
  return Object.values(state.combat.attachments.byId).find((a) => a.ownerId === player.id && a.state === 'active');
}

let broke = false;
const TICKS = 90; // 1.5s
let lastAtt = findAttachment();

function fmt(n, w = 9, p = 1) { return Number(n).toFixed(p).padStart(w); }

console.log('tick  tension    impulse     yank    tenR   impR   yankR  overR  grace  harden  breakReason  dist  rest');
for (let i = 0; i < TICKS; i++) {
  // Opposing thrust: player thrusts AWAY from the asteroid (negative moveZ = backwards from +X).
  state.input.moveZ = -THRUST;
  state.input.moveX = 0;
  state.input.boost = false;
  state.input.turnIntent = 0;
  state.input.actions.reelDelta = REEL ? -1 : 0;
  stepHarness(harness);

  const att = findAttachment();
  if (!att) { console.log(`tick ${state.tick}: ATTACHMENT GONE — lastReason=${lastAtt && lastAtt.breakReason}`); broke = true; break; }

  // Read the massline runtime that the controller persisted last tick.
  const rt = att.masslineRuntime || {};
  const tel = att.masslineTelemetry || {};
  const def = att.defId;
  // recompute the overload inputs from live telemetry
  const brk = att.break || {};
  const maxTension = brk.maxTension || 1;
  const maxImpulse = brk.maxImpulse || 1;
  const maxYank = brk.maxYank || 420;
  const tension = att.lastTension || 0;
  const impulse = att.lastImpulse || 0;
  // yank comes from telemetry we stored
  const yank = tel.yank || 0;
  const dist = tel.distance != null ? tel.distance : Math.hypot(asteroid.pos.x - player.pos.x, asteroid.pos.z - player.pos.z);
  const rest = att.restLength;

  console.log(
    `${String(state.tick).padStart(4)}`,
    fmt(tension), fmt(impulse), fmt(yank, 7, 0),
    fmt(tension / maxTension, 6, 3), fmt(impulse / maxImpulse, 6, 3), fmt(yank / maxYank, 6, 3),
    fmt(rt.overloadS || 0, 6, 3),
    fmt((tel.overloadRatio != null ? tel.overloadRatio : 0), 6, 3),
    fmt(rt.state || '', 10),
    fmt(att.breakReason || '', 12),
    fmt(dist, 6, 1), fmt(rest, 6, 1),
  );
  lastAtt = att;
}

console.log('---');
console.log(`result: ${broke ? 'BROKE' : 'HELD'}`);
console.log('break events:', events.broke);
console.log('player final speed:', Math.hypot(player.vel.x, player.vel.z).toFixed(2));

function createHarness() {
  const state = createGameState(0x57d1);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 1;
  state.freeIds.length = 0;
  const bus = createBus();
  const helpers = {};
  const runtime = {
    core: fork(core), physics: fork(physics), actions: fork(actions),
    flight: fork(flightV3), combat: fork(combat), tetherGameplay: fork(tetherGameplay),
  };
  const byName = new Map([
    ['core', runtime.core], ['physics', runtime.physics], ['actions', runtime.actions],
    ['flight', runtime.flight], ['combat', runtime.combat], ['tetherGameplay', runtime.tetherGameplay],
  ]);
  const registry = { get(name) { return byName.get(name) || null; } };
  const ctx = { state, bus, helpers, registry };
  const events = { latched: [], strain: [], broke: [], released: [] };
  bus.on('tether:latched', (p) => events.latched.push(p));
  bus.on('tether:strain', (p) => events.strain.push(p));
  bus.on('tether:broke', (p) => events.broke.push(p));
  bus.on('tether:released', (p) => events.released.push(p));
  runtime.core.init(ctx);
  return { state, bus, helpers, registry, runtime, ctx, events };
}
function fork(s) { return Object.assign(Object.create(Object.getPrototypeOf(s)), s); }
function initializeSystems(h) {
  const { runtime, ctx } = h;
  runtime.physics.init(ctx); runtime.actions.init(ctx); runtime.flight.init(ctx);
  runtime.combat.init(ctx); runtime.tetherGameplay.init(ctx);
}
async function ensureSg02Ready(runtime, state) {
  runtime.physics.update(0, state);
  if (runtime.physics._sg02Init) await runtime.physics._sg02Init;
  runtime.physics.update(0, state);
}
function stepHarness(h) {
  const { runtime, state } = h;
  runtime.core.preStep(DT, state);
  runtime.actions.update(DT, state);
  runtime.flight.update(DT, state);
  runtime.physics.update(DT, state);
  runtime.combat.update(DT, state);
  runtime.tetherGameplay.update(DT, state);
  runtime.core.lifetimeSweep(DT, state);
}
