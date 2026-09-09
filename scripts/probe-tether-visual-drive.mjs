// Diagnostic probe (Task D): what do the Massline cable visuals actually have to work with?
//
// Copy of scripts/probe-tether-snap.mjs, re-pointed at PRESENTATION telemetry instead of break
// telemetry. Latches a 640-mass asteroid and applies full opposing thrust for 240 ticks, then
// prints the quantities src/render/vfx.js keys the cable off:
//
//   state.player.tether.strain  — physical ratio lastTension / breakTension (breakTension 10.5M)
//   state.player.tether.load    — presentation load 0..1 (phase floor vs strain*2.5)
//   state.player.tether.phase   — slack | capture | loaded | overload
//
// Not a gate — a diagnostic tool. Run: node scripts/probe-tether-visual-drive.mjs
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
const THRUST = parseFloat(process.argv.find((a) => a.startsWith('--thrust='))?.slice(9) || '1');
const REEL = process.argv.includes('--reel');
const TICKS = 240;

console.log(`\n=== massline visual-drive probe | thrust=${THRUST} reel=${REEL} ticks=${TICKS} ===\n`);

const harness = createHarness();
const { state, helpers, runtime, events } = harness;
state.settings.controls.flightMode = 'newtonian';

const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', {
  isPlayer: true, pos: { x: 0, z: 0 }, rot: 0,
}));
state.playerId = player.id;
// The asteroid sits BEHIND the ship on purpose. flightV3 normalizeCraftInput (:616) turns a player
// throttle below -0.55 into BRAKE, so probe-tether-snap.mjs's "--thrust=1 backwards" applies zero
// force and its line never loads at all. Facing away and running the main drive forward is the only
// way to put full main thrust on the line.
const asteroid = helpers.spawnEntity({
  type: 'asteroid',
  pos: { x: -100, z: 0 },
  radius: 12,
  mass: parseFloat(process.argv.find((a) => a.startsWith('--mass='))?.slice(7) || '640'),
  hull: 360, hullMax: 360, collides: true, data: { typeId: 'ast_common_rock' },
});

initializeSystems(harness);
await ensureSg02Ready(runtime, state);

state.input.aimWorld = { x: asteroid.pos.x, z: asteroid.pos.z };
state.input.aimAngle = Math.PI;
state.input.actions = { tetherFire: true, tetherCut: false, reelDelta: 0 };
stepHarness(harness);
state.input.actions.tetherFire = false;

if (events.latched.length === 0) { console.log('FAILED TO LATCH — aborting'); process.exit(1); }
console.log(`latched at tick ${state.tick}. player mass=${player.mass} asteroid mass=${asteroid.mass}`);
console.log('---');

// Mirror of the vfx.js cable smoothers so the probe reports what the renderer would actually see.
let strainSmooth = 0;
let loadSmooth = 0;
const RENDER_DT = 1 / 60;

// vfx.js _updateTetherCable constants, mirrored (vfx.js imports three.js and cannot load headless).
const TAUT_LOAD = 0.5;
const OVERLOAD_LOAD = 0.88;
const SPARK_LOAD = 0.72;
const CAPTURE_FLOOR = 0.35;
const SHIVER_WU = 0.52;

const seen = {
  phases: new Map(), maxStrain: 0, maxLoad: 0, maxShiverWu: 0,
  tautTicks: 0, sparkTicks: 0, overloadTicks: 0,
  legacyTautTicks: 0, legacySparkTicks: 0,
};
let broke = false;

function fmt(n, w = 9, p = 4) { return Number(n).toFixed(p).padStart(w); }

console.log('tick   tension     strain      load  phase     l(sm)  s(work)  taut  ovl  spark  coreW  shiverWu   dist');
for (let i = 0; i < TICKS; i++) {
  // Forward main drive, pointing away from the anchor: full opposing thrust without tripping brake.
  state.input.throttle = THRUST;
  state.input.strafe = 0;
  state.input.moveZ = THRUST;
  state.input.moveX = 0;
  state.input.boost = false;
  state.input.turnIntent = 0;
  state.input.actions.reelDelta = REEL ? -1 : 0;
  stepHarness(harness);

  const att = Object.values(state.combat.attachments.byId)
    .find((a) => a.ownerId === player.id && a.state === 'active');
  if (!att) { console.log(`tick ${state.tick}: ATTACHMENT GONE`); broke = true; break; }

  const t = state.player.tether;
  const strain = Math.max(0, Math.min(1.5, t.strain || 0));
  strainSmooth += (strain - strainSmooth) * Math.min(1, RENDER_DT * 8);
  const loadRaw = Number.isFinite(t.load) ? Math.max(0, Math.min(1, t.load)) : Math.min(1, strain);
  loadSmooth += (loadRaw - loadSmooth) * Math.min(1, RENDER_DT * 8);

  // Post-fix vfx.js gates, verbatim from _updateTetherCable.
  const l = Math.min(1, Math.max(loadSmooth, strainSmooth));
  const taut = t.phase === 'loaded' || t.phase === 'overload' || loadSmooth > TAUT_LOAD;
  const overload = t.phase === 'overload' || l > OVERLOAD_LOAD || strainSmooth > 0.95;
  const s = Math.max(0, Math.min(1, (l - CAPTURE_FLOOR) / (1 - CAPTURE_FLOOR)));
  const spark = l > SPARK_LOAD;
  const dist = Math.hypot(asteroid.pos.x - player.pos.x, asteroid.pos.z - player.pos.z);
  const coreW = (taut ? 0.26 : 0.34) + l * 0.08;
  const shiverWu = l * l * SHIVER_WU * Math.min(1, dist / 40);

  seen.phases.set(t.phase, (seen.phases.get(t.phase) || 0) + 1);
  seen.maxStrain = Math.max(seen.maxStrain, strain);
  seen.maxLoad = Math.max(seen.maxLoad, loadRaw);
  seen.maxShiverWu = Math.max(seen.maxShiverWu, shiverWu);
  if (taut) seen.tautTicks++;
  if (overload) seen.overloadTicks++;
  if (spark) seen.sparkTicks++;
  // The gates as they stood before this repair, kept so the probe proves the dead code rather than
  // asserting it: taut = strainSmooth > 0.7, overload = strainSmooth > 0.95, sparks = > 0.55.
  if (strainSmooth > 0.7) seen.legacyTautTicks++;
  if (strainSmooth > 0.55) seen.legacySparkTicks++;

  if (i % 12 === 0 || i === TICKS - 1) {
    console.log(
      String(state.tick).padStart(4),
      fmt(att.lastTension || 0, 10, 1), fmt(strain, 11, 7), fmt(loadRaw, 9, 3),
      String(t.phase).padEnd(9), fmt(l, 6, 3), fmt(s, 7, 3),
      String(taut).padStart(5), String(overload).padStart(5), String(spark).padStart(6),
      fmt(coreW, 6, 3), fmt(shiverWu, 9, 4), fmt(dist, 6, 1),
    );
  }
}

console.log('---');
console.log(`result: ${broke ? 'BROKE' : 'HELD'}`);
console.log('phase histogram:', JSON.stringify(Object.fromEntries(seen.phases)));
console.log('max strain:', seen.maxStrain.toExponential(3), ' max load:', seen.maxLoad.toFixed(4));
console.log(`taut ticks: ${seen.tautTicks}/${TICKS}  overload ticks: ${seen.overloadTicks}  spark ticks: ${seen.sparkTicks}`);
console.log('peak geometry shiver:', seen.maxShiverWu.toFixed(4), 'wu (~', (seen.maxShiverWu * 18.7).toFixed(1), 'px at the game camera)');
console.log(`PRE-FIX strain-keyed gates over the same run: taut ${seen.legacyTautTicks}/${TICKS}, sparks ${seen.legacySparkTicks}/${TICKS}`);
console.log('player final speed:', Math.hypot(player.vel.x, player.vel.z).toFixed(2));
console.log('break events:', events.broke.length);

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
