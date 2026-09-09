// Focused instrumentation probe: latch an asteroid, apply controlled opposing thrust, log every
// tick's tension/yank/overload and the exact break reason. This exists to find WHY the line snaps
// under light pressure. Not a gate — a diagnostic tool.
//
// ============================ THE BRAKE TRAP — READ BEFORE EDITING ============================
//
// This probe used to drive the load with `state.input.moveZ = -THRUST` while the ship FACED the
// anchor, i.e. reverse thrust. normalizeCraftInput (src/systems/flightV3.js:616) turns any PLAYER
// throttle below -0.55 into a full brake:
//
//     brake: !!(raw.brake || raw.fullStop || raw.flipBurn || (isPlayer && throttle < -0.55))
//
// and `brake` zeroes ALL manual translation. So the probe braked instead of pulling. Measured on
// the pre-fix script, 640-mass asteroid, 90 ticks, peak tension:
//
//     --thrust=0.3  ->  148.7      --thrust=0.5  ->  247.5
//     --thrust=0.6  ->    0.0      --thrust=1.0  ->    0.0   (final player speed 0.00)
//
// It is NON-MONOTONIC IN ITS OWN CONTROL VARIABLE, and at the settings anyone reaches for when
// hunting a snap it applied literally no load at all while printing a confident "result: HELD".
// Every load figure this script produced above |throttle| 0.55 was zero, and every figure below it
// was reverse-thruster force, not main-engine force. Session receipts that cited it are wrong.
//
// The fix: the anchor is spawned BEHIND the ship and the drive is FORWARD throttle away from it.
// That is both the stronger and the honest measurement — main engine, no brake rule in the path.
// `driveBrake` is printed every tick and a non-zero value invalidates the run; the script says so
// and exits non-zero rather than letting a braked run be quoted as evidence.
//
// If you ever need reverse thrust specifically, pass --reverse-thrust-broken and read the banner.
// ==============================================================================================
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
// Preserved only to reproduce the defect described above. Do not measure with it.
const REVERSE = process.argv.includes('--reverse-thrust-broken');

// The anchor sits BEHIND the ship (rot 0 faces +X) so that FORWARD throttle pulls away from it.
// See BRAKE TRAP above for why this probe must never use reverse throttle to load the line.
const ANCHOR_X = REVERSE ? 100 : -100;
// normalizeCraftInput turns a player throttle below this into a full brake (flightV3.js:616).
const PLAYER_BRAKE_THROTTLE = -0.55;

console.log(`\n=== tether snap probe | flightMode=${FLIGHT_MODE} thrust=${THRUST} reel=${REEL}`
  + `${REVERSE ? ' drive=REVERSE(BROKEN)' : ' drive=forward-away'} ===\n`);
if (REVERSE) {
  console.log('!! --reverse-thrust-broken: reproducing the known-bad drive. Any load you read here');
  console.log('!! is an UNDERSTATEMENT, and above |throttle| 0.55 it is exactly zero. Do not cite it.\n');
}

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
  pos: { x: ANCHOR_X, z: 0 },
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

// The drive throttle. Forward (positive) away from the anchor by default; the legacy reverse drive
// is negative and is exactly what trips the brake rule.
const DRIVE_THROTTLE = REVERSE ? -THRUST : THRUST;
let brakedTicks = 0;
let peakTension = 0;

console.log('tick  tension    impulse     yank       tenR      impR     yankR  overR  grace  harden  breakReason  dist  rest  brake');
for (let i = 0; i < TICKS; i++) {
  state.input.moveZ = DRIVE_THROTTLE;
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
  // The break envelope is NOT on `attachment.break` — that key does not exist, so the old
  // `att.break || {}` made every maxTension fall back to 1 and the tenR/impR/yankR columns printed
  // raw tension dressed up as a 0..1 ratio. The real snapshot is attachment.tetherPolicy.break,
  // memoized by policyForAttachment (src/combat/attachments.js:733-742).
  const brk = (att.tetherPolicy && att.tetherPolicy.break) || att.break || {};
  const maxTension = brk.maxTension || 1;
  const maxImpulse = brk.maxImpulse || 1;
  const maxYank = brk.maxYank || 420;
  // Did the flight layer turn our drive into a brake? If so this tick measured nothing.
  const braked = DRIVE_THROTTLE < PLAYER_BRAKE_THROTTLE;
  if (braked) brakedTicks++;
  if ((att.lastTension || 0) > peakTension) peakTension = att.lastTension || 0;
  const tension = att.lastTension || 0;
  const impulse = att.lastImpulse || 0;
  // yank comes from telemetry we stored
  const yank = tel.yank || 0;
  const dist = tel.distance != null ? tel.distance : Math.hypot(asteroid.pos.x - player.pos.x, asteroid.pos.z - player.pos.z);
  const rest = att.restLength;

  console.log(
    `${String(state.tick).padStart(4)}`,
    fmt(tension), fmt(impulse), fmt(yank, 7, 0),
    // 6dp, not 3: maxTension is 10,500,000 for tether_standard, so a fully-loaded line is ~1e-4
    // here. That tiny number is CORRECT (see the SCALE WARNING in tetherGameplay.js:589-604) and
    // 3dp printed it as a flat 0.000, which is how it got mistaken for "no load".
    fmt(tension / maxTension, 9, 6), fmt(impulse / maxImpulse, 9, 6), fmt(yank / maxYank, 9, 6),
    fmt(rt.overloadS || 0, 6, 3),
    fmt((tel.overloadRatio != null ? tel.overloadRatio : 0), 6, 3),
    fmt(rt.state || '', 10),
    fmt(att.breakReason || '', 12),
    fmt(dist, 6, 1), fmt(rest, 6, 1),
    braked ? '  BRAKED' : '      -',
  );
  lastAtt = att;
}

const finalSpeed = Math.hypot(player.vel.x, player.vel.z);
console.log('---');
console.log(`result: ${broke ? 'BROKE' : 'HELD'}`);
console.log('break events:', events.broke);
console.log(`peak tension: ${peakTension.toFixed(1)}`);
console.log(`player final speed: ${finalSpeed.toFixed(2)}`);

// A run in which the flight layer braked measured nothing, and a "HELD" from such a run is not
// evidence about the Massline. Fail loudly rather than let the number be quoted.
if (brakedTicks > 0) {
  console.log('');
  console.log(`INVALID RUN — the flight layer braked on ${brakedTicks}/${TICKS} ticks.`);
  console.log(`  drive throttle ${DRIVE_THROTTLE} is below the player brake threshold ${PLAYER_BRAKE_THROTTLE}`);
  console.log('  (src/systems/flightV3.js:616). No opposing load was applied. See BRAKE TRAP in this file.');
  process.exit(2);
}
// Second guard: a run that applied real throttle but never moved and never loaded the line is not
// measuring the tether either, whatever the cause.
if (!broke && peakTension <= 0 && finalSpeed < 0.01) {
  console.log('');
  console.log('INVALID RUN — nonzero throttle produced no tension and no motion. The drive is not');
  console.log('reaching the ship; "HELD" here says nothing about the line. Investigate before citing.');
  process.exit(2);
}

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
