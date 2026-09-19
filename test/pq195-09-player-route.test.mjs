// PQ-195.09 — A PLAYER HAS ACTUALLY PLAYED IT.
//
// Route acceptance for the finished Third Shift: the three outcomes complete UNAIDED on the
// ordinary route. Nothing here teleports the assembly, emits custody events by hand, or touches a
// private seam — the pilot is a player: it writes only `state.input` (the public control contract:
// moveZ/aimAngle/turnIntent/boost/brake/fire + aimIntentActive + actions.tetherFire/tetherCut/
// reelDelta + the mining beam's fireGroup) and navigates by what a real player sees — world
// entities and the fork instrument model.
//
// The honest shape of the play, measured from the real run: the tug sprints the launcher→catcher
// corridor at ~145 WU/s, drops the assembly ~1200 WU downlane, and the freed body keeps ~80 WU/s —
// faster than a governed hawser, so nobody catches it from behind, and the authored heading offset
// means it can never deliver itself. You intercept it the way the event is authored to be
// intercepted: watch the tug's lane, get ahead of it, take the body on the crossing, and let the
// massline couple its momentum to yours. Then you feed it — still moving — to whichever buyer you
// chose: through the fork mouth on the centerline, or into the Quiet head by contact.
//
// (a) LAWFUL: intercept the freed body on the lane, rein it in, feed it through the fork mouth,
//     and let the machine settle it — Concord pays.
// (b) FENCE: the same recovery, dragged into the Quiet fence head — contact custody pays the
//     illicit terms.
// (c) WRECK: take the freed body on the line, shoot it dead at winch range, then hold the mining
//     beam on the recovery wreck until its reduced pool is in the hold.
// (d) LEFT ALONE: the player accepts and parks — the carrier transits, releases and departs, the
//     run resolves inside its window with no phantom payout.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { mining } from '../src/systems/mining.js';
import { cargo } from '../src/systems/cargo.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { missions } from '../src/systems/missions.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import {
  BREAKAWAY_SP07,
  PQ019_HEIST_SECTOR_ID,
} from '../src/data/heistFacilities.js';
import {
  BREAKAWAY_RECOVERY_TYPE,
  PQ019C_HEIST_STATION_ID,
} from '../src/data/heistMission.js';
import { forkReceiverWorld, forkInstrumentModel } from '../src/ui/forkInstrument.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';

const SYSTEMS = [
  physics, world, heistFacilities, flightV3, combat, weapons, tetherGameplay,
  mining, cargo, lawSecurity, heat, npcJobsRuntime, aftermathWrecks, spawnBudget,
  createTacticalAISystem(), aiPorts, missions,
];

// ── pilot grammar — the same input contract a player's hands write ──────────────────────────────

function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function neutral(input) {
  input.moveX = 0; input.moveZ = 0; input.turnIntent = 0;
  input.boost = false; input.brake = false;
  input.fire = false; input.fireGroup = 0;
  input.aimIntentActive = true; // a player holding their aim over the scene
  if (input.actions) {
    input.actions.tetherFire = false;
    input.actions.tetherCut = false;
    input.actions.reelDelta = 0;
  }
}

function speedOf(e) { return Math.hypot(e.vel.x, e.vel.z); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function aimAt(state, pos) {
  const p = state.entities.get(state.playerId);
  state.input.aimWorld.x = pos.x;
  state.input.aimWorld.z = pos.z;
  state.input.aimAngle = Math.atan2(pos.z - p.pos.z, pos.x - p.pos.x);
  return wrapAngle(state.input.aimAngle - (p.rot || 0));
}

function steerTo(state, targetPos, { arrive = 40 } = {}) {
  const p = state.entities.get(state.playerId);
  const input = state.input;
  const d = dist(p.pos, targetPos);
  const speed = speedOf(p);
  const err = aimAt(state, targetPos);
  input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
  // Come to rest at the point: brake inside the stopping envelope.
  const stopBand = arrive + speed * 1.4;
  if (d <= stopBand) {
    input.moveZ = 0;
    input.brake = speed > 3;
    return d;
  }
  const facing = Math.abs(err) < 0.45;
  input.moveZ = facing ? 1 : 0;
  input.boost = facing && d > 900;
  return d;
}

// Thrust at a target with a speed cap — the tow drive: steer AT a point so the pair converges on
// the approach line. NEVER brake while towing: a brake input whips the trailing mass into a
// slingshot — overspeed just coasts, thrust resumes under the cap.
function driveToward(state, targetPos, cap) {
  const p = state.entities.get(state.playerId);
  const input = state.input;
  const speed = speedOf(p);
  const err = aimAt(state, targetPos);
  input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
  input.moveZ = (speed <= cap && Math.abs(err) < 0.4) ? 1 : 0;
}

// Where a moving target will be when we can reach it — fixed-point solve on our own governed
// speed. A slower ship can still take a crossing when it holds positional advantage.
function interceptPoint(p, target, ourSpeed = 75) {
  let t = dist(p.pos, target.pos) / ourSpeed;
  for (let i = 0; i < 10; i++) {
    const px = target.pos.x + target.vel.x * t;
    const pz = target.pos.z + target.vel.z * t;
    t = Math.hypot(px - p.pos.x, pz - p.pos.z) / ourSpeed;
  }
  return { x: target.pos.x + target.vel.x * t, z: target.pos.z + target.vel.z * t };
}

async function scene({ seed = 19509 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  // The ordinary route runs the production profile, where impulse consequences are ON — the
  // SG-02 contact-force receipts that feed facility custody only exist under this flag
  // (physics.js reads the process map when the owner is created, i.e. at prepareBackend).
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true,
    'played against the production Rapier owner');
  state.player.heat = 0;
  state.player.credits = 5000;
  state.player.miningBeam = { tierId: 'beam_mk1' };
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  if (!state.input.aimWorld) state.input.aimWorld = { x: 0, z: 0 };
  if (!state.input.actions) state.input.actions = {};

  // The player came out to meet the delivery — they are at the catcher end of the corridor when
  // the run starts, which is where the mission itself sends them. The fork's +n points INTO the
  // bay, so the open mouth faces −n: the player waits out front on the approach side.
  const mouth = forkReceiverWorld();
  const player = sim.spawn(makeShipEntitySpec('ship_hawser', {
    team: 0, isPlayer: true,
    // A tug crew flying recovery fits the coupler head — the hawser's deep utility bay is
    // authored for exactly this job ("the tow you can trust") — plus the ordinary turret gun
    // any crew carries into a raider corridor.
    fittings: fittingsFromDefaultModules('ship_hawser', ['mod_frame_coupler_m', 'wpn_pulse_laser_m']),
    pos: { x: mouth.x - mouth.nx * 500, z: mouth.z - mouth.nz * 500 },
  }));
  state.playerId = player.id;

  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  const missionsSys = sim.registry.get('missions');

  const t = {
    sim, state, bus, missionsSys, player, mouth,
    input: state.input,
    step: (n = 1, drive = null) => {
      for (let i = 0; i < n; i++) {
        neutral(state.input);
        if (drive) drive();
        sim.step(SIM_DT);
      }
    },
    until: (pred, drive, max = 20000, label = 'condition') => {
      for (let i = 0; i < max; i++) {
        neutral(state.input);
        drive();
        sim.step(SIM_DT);
        if (pred()) return i + 1;
      }
      assert.fail(`pilot timed out waiting for ${label}`);
    },
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    load: () => (state.entityList || []).find((e) => e?.alive !== false
      && e.type === 'payload' && e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId) || null,
    carrier: () => (state.entityList || []).find((e) => e?.alive !== false
      && e.type === 'ship' && e.data?.heistFacilityRole === 'transport_carrier') || null,
    latchActive: () => !!(state.player.tether && state.player.tether.active),
    cutTether: () => { state.input.actions.tetherCut = true; },
    accept() {
      const row = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots
        .find((o) => o && o.type === BREAKAWAY_RECOVERY_TYPE);
      assert.ok(row, 'the Tethys board posts the Third Shift row');
      bus.emit('ui:acceptMission', { missionId: row.id });
      return t.mission();
    },
    stepToLaunch(max = 2600) {
      for (let i = 0; i < max; i++) { neutral(state.input); sim.step(SIM_DT); if (t.load()) return true; }
      return false;
    },
  };
  return t;
}

// The lane's closest-approach point to a destination — where a player who knows the corridor
// waits to take the drop. Computed from the carrier's own observed position and heading.
function laneNearPoint(fromPos, vel, dest) {
  const v = Math.hypot(vel.x, vel.z);
  if (v < 1e-6) return { x: fromPos.x, z: fromPos.z };
  const dir = { x: vel.x / v, z: vel.z / v };
  const s = (dest.x - fromPos.x) * dir.x + (dest.z - fromPos.z) * dir.z;
  return { x: fromPos.x + dir.x * s, z: fromPos.z + dir.z * s };
}

// Stage on the tug's lane where it passes nearest the destination, take the freed body on the
// crossing, latch — then BLEED: nose anti-parallel to the pair's own velocity and burn it down.
// You cannot tow a 180-mass flywheel somewhere it isn't already going; you can only kill its
// speed first and fly it there after. Thrusting during the swing just pumps the line.
function recoverLoad(t, dest, { pairCap = 42, arriveWithin = 700, bleedTo = 14, haulTimeout = 20000, onTick = null } = {}) {
  const p = t.player;

  t.until(() => t.state.heistFacilities.carrierReleased === true, () => {
    const c = t.carrier();
    if (!c) return;
    steerTo(t.state, laneNearPoint(c.pos, c.vel, dest), { arrive: 160 });
  }, 12000, 'the carrier release');

  // Intercept the freed body on the crossing and press the public latch control in range.
  let latchTick = 0;
  t.until(() => t.latchActive(), () => {
    const load = t.load();
    if (!load) return;
    steerTo(t.state, interceptPoint(p, load), { arrive: 25 });
    const dl = dist(p.pos, load.pos);
    if (dl < 800) aimAt(t.state, load.pos); // acquisition reads the aim point
    latchTick++;
    if (dl < 360 && latchTick % 8 === 0) t.input.actions.tetherFire = true;
  }, 20000, 'a live latch on the freed assembly');

  // Settle into the haul: HANDS OFF while the load swings — the line couples the pair and the
  // flight assist bleeds it; thrusting during the swing only pumps it (player past 600 WU/s).
  // The moment the pair is coherent, drive: thrust redirects the residual drift WHILE it
  // translates. Reel in only when there is no swing left — radial approach is what the winch is
  // for; reeling tangential motion is the slingshot pump. NEVER brake: the tow drive coasts on
  // overspeed, so the haul arrives still moving — that is what the feed wants.
  let coherent = false;
  let done = false;
  t.until(() => {
    const load = t.load();
    return !load || done || (dist(load.pos, dest) < arriveWithin && speedOf(load) < pairCap);
  }, () => {
    const load = t.load();
    if (!load) return;
    const rel = Math.hypot(load.vel.x - p.vel.x, load.vel.z - p.vel.z);
    // Coherent means settled AND under the tow cap — a pair still faster than the cap gets no
    // thrust at all, so it can neither be steered nor slowed: it just coasts off the map.
    if (rel < 12 && speedOf(load) < pairCap && speedOf(p) < pairCap) coherent = true;
    if (coherent) driveToward(t.state, dest, pairCap);
    if (t.latchActive()) {
      const d = dist(load.pos, p.pos) || 1;
      const ux = (load.pos.x - p.pos.x) / d, uz = (load.pos.z - p.pos.z) / d;
      const rx = load.vel.x - p.vel.x, rz = load.vel.z - p.vel.z;
      const radial = rx * ux + rz * uz;
      const tangential = Math.hypot(rx - radial * ux, rz - radial * uz);
      if (tangential < 10) t.input.actions.reelDelta = -1;
    }
    if (onTick && onTick(load) === 'done') done = true;
    // else: hands off — the assist settles the swing
  }, haulTimeout, 'the pair hauled onto the approach');
  return t.load();
}

// ── (a) lawful: recover and feed the assembly through the Concord fork ──────────────────────────

test('(a) a player recovers the assembly and feeds it through the Concord fork, unaided', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch(), 'the launcher throws the caged assembly');

  const mouth = t.mouth;
  const p = t.player;
  const latx = -mouth.nz, latz = mouth.nx; // +lateral in world space
  const gate = { x: mouth.x - mouth.nx * 430, z: mouth.z - mouth.nz * 430 };
  const approachFix = { x: mouth.x - mouth.nx * 900, z: mouth.z - mouth.nz * 900 };
  const veerOut = { x: mouth.x - mouth.nx * 200 + latx * 500, z: mouth.z - mouth.nz * 200 + latz * 500 };
  // A settled run leaves `missions.active` the same tick it commits — the committed handoff is
  // the custody receipt the player actually earned, observed on the public bus. The reward is
  // the emitted economy grant (economy is the sole credits writer and is not in this rig).
  let committed = null;
  t.bus.on('heist:receiverCommitted', (r) => { committed = r; });
  const grants = [];
  t.bus.on('economy:grantCredits', (r) => grants.push(r));

  const pLocal = (pos) => (pos.x - mouth.x) * mouth.nx + (pos.z - mouth.z) * mouth.nz;
  const lLocal = (pos) => -(pos.x - mouth.x) * mouth.nz + (pos.z - mouth.z) * mouth.nx;

  // Stage on the tug's lane where it passes nearest the fork's approach fix — far enough out
  // front that the intercept happens on the corridor — and take the freed body on the crossing.
  t.until(() => t.state.heistFacilities.carrierReleased === true, () => {
    const c = t.carrier();
    if (c) steerTo(t.state, laneNearPoint(c.pos, c.vel, approachFix), { arrive: 160 });
  }, 12000, 'the carrier release');
  let latchTick = 0;
  t.until(() => t.latchActive(), () => {
    const l = t.load();
    if (!l) return;
    steerTo(t.state, interceptPoint(p, l), { arrive: 25 });
    const dl = dist(p.pos, l.pos);
    if (dl < 800) aimAt(t.state, l.pos); // acquisition reads the aim point
    latchTick++;
    if (dl < 360 && latchTick % 8 === 0) t.input.actions.tetherFire = true;
  }, 20000, 'a live latch on the freed assembly');

  // HANDS OFF through the swing: the line couples the pair and the flight assist bleeds it —
  // thrusting or reeling during the swing only pumps it. Drive the moment the pair is coherent.
  // If the body's own drift ever lines the mouth up on its own, that's the free delivery —
  // cut and let it go.
  let fed = null;
  t.until(() => {
    const l = t.load();
    if (!l || fed) return true;
    const rel = Math.hypot(l.vel.x - p.vel.x, l.vel.z - p.vel.z);
    return rel < 12 && speedOf(l) < 45 && speedOf(p) < 45;
  }, () => {
    const l = t.load();
    if (!l || fed) return;
    const fw = l.vel.x * mouth.nx + l.vel.z * mouth.nz;
    const sw = -l.vel.x * mouth.nz + l.vel.z * mouth.nx;
    const dep = pLocal(l.pos), lat0 = lLocal(l.pos);
    if (fw > 4 && dep < -5) {
      const pred = lat0 + sw * (-dep / fw);
      if (Math.abs(pred) < 8 && speedOf(l) < 95) { t.cutTether(); fed = 'sling'; }
    }
  }, 12000, 'the pair to settle coherent on the line');
  assert.ok(t.load(), 'the assembly is on the line');

  // THE FEED. Velocity-want steering onto the mouth axis — the pair carries downlane momentum
  // that has to be MORPHED, not stopped, so the nose goes on the velocity error (desired minus
  // current) and the speed budget shrinks with remaining depth. The aim point leads the TRAILER
  // (a straight tow preserves the load's lateral offset), and inside ~170 WU the run is a
  // committed drive-through: parking at the mouth leaves the body hovering outside the gate.
  t.until(() => fed || committed || !t.load(), () => {
    const l = t.load();
    if (!l || fed) return;
    const pDep = pLocal(p.pos);
    const dpl = dist(l.pos, p.pos) || 1;
    const lvx = (l.pos.x - p.pos.x) / dpl, lvz = (l.pos.z - p.pos.z) / dpl;
    const rvx = l.vel.x - p.vel.x, rvz = l.vel.z - p.vel.z;
    const radial = rvx * lvx + rvz * lvz;
    const tang = Math.hypot(rvx - radial * lvx, rvz - radial * lvz);
    let err = 0;
    if (pDep > -30) {
      steerTo(t.state, veerOut, { arrive: 80 }); // past the rails: peel off the corridor
    } else {
      const lead = Math.min(600, Math.max(220, -pDep * 0.4));
      const lDepNow = pLocal(l.pos), lLatNow = lLocal(l.pos);
      const near = lDepNow > -170 && Math.abs(lLatNow) < 45;
      const aimDepth = near ? pDep + Math.max(lead, 110) : Math.min(pDep + lead, -60);
      const aimLat = Math.max(-80, Math.min(80, -lLatNow * 1.3));
      const aimPt = {
        x: mouth.x + mouth.nx * aimDepth + latx * aimLat,
        z: mouth.z + mouth.nz * aimDepth + latz * aimLat,
      };
      const ax = aimPt.x - p.pos.x, az = aimPt.z - p.pos.z;
      const ad = Math.hypot(ax, az) || 1;
      const vDes = pDep > 0 ? 55 : (near ? 15 : Math.min(55, Math.max(12, 14 + (-pDep) * 0.04)));
      const vwx = (ax / ad) * vDes - p.vel.x, vwz = (az / ad) * vDes - p.vel.z;
      const dv = Math.hypot(vwx, vwz);
      if (dv > 5) {
        err = wrapAngle(Math.atan2(vwz, vwx) - (p.rot || 0));
        t.input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
        if (Math.abs(err) < 0.4) t.input.moveZ = 1;
      } else {
        err = aimAt(t.state, aimPt);
        t.input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
      }
      // Boost only on the long far legs, while the velocity error is already small.
      if ((pDep > 0 || pDep < -1800) && Math.abs(err) < 0.25 && tang < 15 && dv < 12 && speedOf(p) < 50) {
        t.input.boost = true;
      }
    }
    // Reel in ONLY at near-zero swing — winding tangential motion is the slingshot pump, and a
    // reel held across a cut press cancels the pending cut.
    if (!fed && tang < 5 && dpl > 90) t.input.actions.reelDelta = -1;
    // The instrument is the honest read. Kernel-acquired: stay attached through the dip and cut
    // at the deep, slow turnaround. Ballistic: cut when the body's predicted plane-crossing
    // lands inside the gate — close enough that prediction can't decay, straight enough that
    // the entry isn't a rail graze.
    const model = forkInstrumentModel(t.state);
    if (model && model.phase !== 'outside') {
      if (model.depth > 14 && model.depth < 50 && model.speed < 10) {
        t.cutTether();
        fed = 'turnaround';
      }
    } else if (model) {
      const fw = l.vel.x * mouth.nx + l.vel.z * mouth.nz;
      const sw = -l.vel.x * mouth.nz + l.vel.z * mouth.nx;
      if (fw > 8 && model.depth < -8 && model.depth > -420) {
        const pred = model.lateral + sw * (-model.depth / fw);
        if (Math.abs(pred) < 6 && Math.abs(sw) < 7 && model.speed < 95) {
          t.cutTether();
          fed = 'ballistic';
        }
      }
    }
  }, 14000, 'the fork feed');
  assert.ok(fed, 'the feed committed the body to the fork (kernel or ballistic)');

  // Veer off the corridor and let the machine brake, settle and hand the body off.
  t.until(() => committed || !t.load(), () => {
    steerTo(t.state, veerOut, { arrive: 120 });
  }, 4000, 'the fork handoff');
  assert.ok(committed, 'the fork settled the assembly into a committed receipt');
  assert.equal(committed.facilityId, 'lawful_catcher', 'custody passed to the Concord catcher');
  assert.ok(committed.condition01 > 0.9, `the assembly arrived in good condition (${committed.condition01})`);

  for (let i = 0; i < 900 && t.mission(); i++) { neutral(t.input); sim_step(t); }
  assert.equal(t.mission(), null, 'the run completed');
  const reward = grants.find((g) => g.reason && g.reason.startsWith('mission:'));
  assert.ok(reward && reward.amount > 0,
    `Concord paid the lawful reward (+${reward ? Math.round(reward.amount) : 0}cr)`);
});

function sim_step(t) { t.sim.step(SIM_DT); }

// ── (b) fence: recover and drag the assembly into the Quiet head ─────────────────────────────────

test('(b) the same recovery dragged into the Quiet fence pays the illicit terms, unaided', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch());

  const fenceHead = () => (t.state.entityList || []).find((e) => e?.alive !== false
    && e.data?.heistFacilityRole === 'fence_receiver_head') || null;
  const head = fenceHead();
  assert.ok(head, 'the Quiet fence receiver is embodied in the sector');
  let committed = null;
  t.bus.on('heist:receiverCommitted', (r) => { committed = r; });
  const grants = [];
  t.bus.on('economy:grantCredits', (r) => grants.push(r));
  const p = t.player;
  // Same drop, same latch — the recovery is identical up to the destination choice.
  const approachFix = { x: t.mouth.x - t.mouth.nx * 900, z: t.mouth.z - t.mouth.nz * 900 };
  t.until(() => t.state.heistFacilities.carrierReleased === true, () => {
    const c = t.carrier();
    if (c) steerTo(t.state, laneNearPoint(c.pos, c.vel, approachFix), { arrive: 160 });
  }, 12000, 'the carrier release');
  let latchTick = 0;
  t.until(() => t.latchActive(), () => {
    const l = t.load();
    if (!l) return;
    steerTo(t.state, interceptPoint(p, l), { arrive: 25 });
    const dl = dist(p.pos, l.pos);
    if (dl < 800) aimAt(t.state, l.pos); // acquisition reads the aim point
    latchTick++;
    if (dl < 360 && latchTick % 8 === 0) t.input.actions.tetherFire = true;
  }, 20000, 'a live latch on the freed assembly');

  // Hands off through the swing — same settle as the lawful run.
  t.until(() => {
    const l = t.load();
    if (!l) return true;
    const rel = Math.hypot(l.vel.x - p.vel.x, l.vel.z - p.vel.z);
    return rel < 12 && speedOf(l) < 45 && speedOf(p) < 45;
  }, () => {}, 12000, 'the pair to settle coherent on the line');
  assert.ok(t.load(), 'the assembly is on the line');

  // The Quiet fence is a CONTACT receiver that only collides with payloads: custody moves on the
  // touch, so the delivery is the trailer's path dragged through the head. Velocity-want steering
  // with the same trailer-lead — aim past the head, offset opposite the load's off-line error, so
  // the trailing capsule sweeps across the receiver. The latch already made possession a fact.
  let haulTick = 0;
  let stage = null;
  let runIn = false;
  let swerveUntil = -1;
  let nearHead = false;
  t.until(() => committed || !t.load(), () => {
    const l = t.load();
    const h = fenceHead();
    if (!l || !h) return;
    const ax = h.pos.x - p.pos.x, az = h.pos.z - p.pos.z;
    const dd = Math.hypot(ax, az) || 1;
    haulTick++;
    const dlh = dist(l.pos, h.pos);
    const nx = ax / dd, nz = az / dd;
    const rx = l.pos.x - p.pos.x, rz = l.pos.z - p.pos.z;
    const lAlong = rx * nx + rz * nz;
    const lLat = -rx * nz + rz * nx; // off-line error of the trailer
    const dpl = dist(l.pos, p.pos) || 1;
    const lvx = (l.pos.x - p.pos.x) / dpl, lvz = (l.pos.z - p.pos.z) / dpl;
    const rvx = l.vel.x - p.vel.x, rvz = l.vel.z - p.vel.z;
    const radial = rvx * lvx + rvz * lvz;
    const tang = Math.hypot(rvx - radial * lvx, rvz - radial * lvz);
    const lead = Math.min(600, Math.max(220, dd * 0.3));
    // If the swing aims the body at the head on an IMMINENT crossing, let it go — a free
    // ballistic contact. The window stays tight: a loose cut frees the capsule to sail
    // past the receiver and out of the sector with the run still live.
    const rv = { x: h.pos.x - l.pos.x, z: h.pos.z - l.pos.z };
    const lv = speedOf(l);
    // A free capsule only pays if it PENETRATES the head — a grazing pass inside the radius
    // sum produces no impact impulse and no receipt. The window stays at near-certain hits;
    // anything wider frees the capsule to shave the collider and drift away unearned.
    if (lv > 5 && dlh < 60) {
      const tStar = (rv.x * l.vel.x + rv.z * l.vel.z) / (lv * lv);
      if (tStar > 0 && tStar < 60) {
        const miss = Math.hypot(rv.x - l.vel.x * tStar, rv.z - l.vel.z * tStar);
        if (miss < 6) { t.cutTether(); return; }
      }
    }
    if (dlh < 130) nearHead = true; else if (dlh > 240) nearHead = false;
    if (!t.latchActive() && !nearHead) return; // cut already gone — hands off, the toss does the rest
    const pv = speedOf(p);
    let aimPt;
    let vDes;
    // Stage on the approach axis ~460 out, come to rest, then run dead-on at the
    // receiver. A trailing capsule inherits the tug's velocity AND its line, so the
    // release needs no prediction: at the cut the capsule→tug spring pull points AT
    // the head and the tether's last impulse walks it INTO the collider.
    if (!stage && !runIn && dd < 700) {
      const ux0 = (p.pos.x - h.pos.x) / dd, uz0 = (p.pos.z - h.pos.z) / dd;
      stage = { x: h.pos.x + ux0 * 460, z: h.pos.z + uz0 * 460, ux: ux0, uz: uz0 };
    }
    if (haulTick < swerveUntil) {
      // Post-release: the capsule is ballistic on the tow line — get the hull clear
      // of the receiver's own collider before the load arrives.
      aimPt = { x: h.pos.x + stage.uz * 230, z: h.pos.z - stage.ux * 230 };
      vDes = 38;
    } else if (runIn && t.latchActive()) {
      // RUN-IN — the trailer holds a RIGID lateral offset on a straight tow, so aim
      // the tug's path parallel to the head-axis displaced by that offset: the
      // capsule's own track then crosses the collider dead-on WHILE TETHERED — a real
      // press, not a graze — and the tug's parallel path clears the ball. A free
      // release is only a bonus when the capsule's velocity is already aimed through.
      const aLat = -(l.pos.x - h.pos.x) * stage.uz + (l.pos.z - h.pos.z) * stage.ux;
      const aAlong = (p.pos.x - h.pos.x) * stage.ux + (p.pos.z - h.pos.z) * stage.uz;
      const mirror = Math.max(-95, Math.min(95, aLat * 1.15));
      aimPt = { x: h.pos.x - stage.ux * 160 + stage.uz * mirror,
        z: h.pos.z - stage.uz * 160 - stage.ux * mirror };
      vDes = 30;
      if (tang < 6 && dpl > 60) t.input.actions.reelDelta = -1;
      if (lv > 14 && dlh < 160) {
        const tStar = (rv.x * l.vel.x + rv.z * l.vel.z) / (lv * lv);
        if (tStar > 0 && tStar < 200
          && Math.hypot(rv.x - l.vel.x * tStar, rv.z - l.vel.z * tStar) < 8) {
          t.cutTether();
          swerveUntil = haulTick + 90;
          return;
        }
      }
      if (aAlong < 30) { // at the collider without a window — swerve before pinning
        swerveUntil = haulTick + 60;
        runIn = false;
      }
    } else if (nearHead) {
      // NEAR-HEAD ENDGAME — the sling throw. The tug's own hull collides with the
      // receiver at ~27, so every "follow the tug" path bottoms out tangentially at the
      // radii sum (closest exactly 28, sub-threshold). Custody needs a PRESSED contact,
      // so the capsule must arrive on a path the tug never takes: cut loose when its
      // velocity is aimed through the collider. At release the tether's last impulse
      // still lands for a tick or two — a pull TOWARD the tug — so aim the raw path on
      // the anti-tug side; the deflection walks the free trajectory back onto the head.
      const ux = (p.pos.x - l.pos.x) / dpl, uz = (p.pos.z - l.pos.z) / dpl; // capsule→tug
      if (t.latchActive()) {
        if (dlh < 40 && lv < 24) {
          // THE PRESS — a capsule resting at the collider with ~0 contact force earns
          // nothing; custody needs a PRESSED contact (>60N). When the rope's pull on
          // the capsule already points into the ball (tug on the far side), hold
          // station and reel: the head blocks the line, so shortening drags the
          // capsule INTO the receiver — a sustained press. Otherwise the tug walks
          // the head on a ring waypoint toward the anti-capsule azimuth until the
          // pull turns inward. Safe at these speeds: the ball's reaction kills the
          // tangential pump that makes reeling a free orbit catastrophic.
          const inX = h.pos.x - l.pos.x, inZ = h.pos.z - l.pos.z;
          const rx = p.pos.x - l.pos.x, rz = p.pos.z - l.pos.z; // capsule→tug rope
          const proj = (inX * rx + inZ * rz) / dpl;             // head along rope
          const perp = Math.abs(inX * rz - inZ * rx) / dpl;     // head off rope
          if (proj > 15 && proj < dpl - 8 && perp < 26) {
            // The ball lies on the rope — hold station and reel: the capsule's
            // path is pulled onto the segment, the ball blocks it, and the line
            // keeps shortening into a sustained press (>60N).
            aimPt = { x: p.pos.x, z: p.pos.z };
            vDes = 0;
            t.input.actions.reelDelta = -1;
          } else {
            // Otherwise walk the tug around the ball toward the beyond-head ray
            // (capsule→head continued past the receiver) until the rope crosses it.
            const phi = Math.atan2(p.pos.z - h.pos.z, p.pos.x - h.pos.x);
            const delta = wrapAngle(Math.atan2(inZ, inX) - phi);
            const step = Math.abs(delta) < 0.9 ? delta : Math.sign(delta) * 0.9;
            const a = phi + step;
            aimPt = { x: h.pos.x + Math.cos(a) * 95, z: h.pos.z + Math.sin(a) * 95 };
            vDes = Math.min(18, Math.max(7, Math.abs(delta) * 60));
          }
        } else {
          if (lv > 8 && dlh < 110) {
            const tStar = Math.max(0, (rv.x * l.vel.x + rv.z * l.vel.z) / (lv * lv));
            const mx = l.pos.x + l.vel.x * tStar - h.pos.x - 18 * ux;
            const mz = l.pos.z + l.vel.z * tStar - h.pos.z - 18 * uz;
            if (tStar < 140 && Math.hypot(mx, mz) < 15) { t.cutTether(); return; }
          }
          if (dlh < 110 && lv < 24) {
            // BATTING — the capsule can't press the ball from a rope: every tethered
            // path arrives tangentially (sub-threshold graze, no receipt). So the
            // tug takes the anti-head station while the rope pays out slack, then
            // RELEASES — the free-capsule bump below drives the hull through it
            // into the collider with the tug already in place. If the straight path
            // to the station crosses the ball, bend to a ring point first.
            const fx2 = (l.pos.x - h.pos.x) / dlh, fz2 = (l.pos.z - h.pos.z) / dlh;
            let behind = { x: l.pos.x + fx2 * 52, z: l.pos.z + fz2 * 52 };
            const segx = behind.x - p.pos.x, segz = behind.z - p.pos.z;
            const segLen = Math.hypot(segx, segz) || 1;
            const proj = Math.max(0, Math.min(1,
              ((h.pos.x - p.pos.x) * segx + (h.pos.z - p.pos.z) * segz) / (segLen * segLen)));
            const cx = p.pos.x + segx * proj - h.pos.x;
            const cz = p.pos.z + segz * proj - h.pos.z;
            if (Math.hypot(cx, cz) < 45) {
              behind = { x: h.pos.x + fx2 * 130, z: h.pos.z + fz2 * 130 };
            }
            const dBehind = dist(p.pos, behind);
            if (dBehind > 20) {
              aimPt = behind;
              vDes = Math.min(30, Math.max(12, dBehind * 0.4));
              // Pay out line on the way in — the push needs slack, not a taut rope
              // fighting the shove.
              if (dpl < 110) t.input.actions.reelDelta = 1;
            } else {
              // Stationed on the anti-head ray — release for the knock-in.
              t.cutTether();
              return;
            }
          } else {
            // Otherwise hold the tug OUTSIDE the trailer's orbit radius: the capsule's
            // velocity is always tangent to its circle, and a tangent can only aim at
            // the receiver when the receiver sits outside that circle (dd > dpl).
            const ring = Math.max(70, Math.min(170, dpl + 25));
            const wx = (p.pos.x - h.pos.x) / dd, wz = (p.pos.z - h.pos.z) / dd;
            aimPt = { x: h.pos.x + wx * ring, z: h.pos.z + wz * ring };
            vDes = Math.min(26, Math.max(8, (ring - dd) * 0.4 + 6));
          }
        }
      } else {
        // Free capsule: an inbound toss gets a clear lane; a slow capsule beside the
        // head gets bumped through the collider; a real miss gets chased, re-latched
        // and thrown again — the ordinary player retry loop.
        let inbound = false;
        if (lv > 5 && dlh < 150) {
          const tStar = (rv.x * l.vel.x + rv.z * l.vel.z) / (lv * lv);
          inbound = tStar > 0
            && Math.hypot(rv.x - l.vel.x * tStar, rv.z - l.vel.z * tStar) < 24;
        }
        if (inbound) {
          const wx = (p.pos.x - h.pos.x) / dd, wz = (p.pos.z - h.pos.z) / dd;
          aimPt = { x: h.pos.x + wx * 170, z: h.pos.z + wz * 170 };
          vDes = 10;
        } else if (dlh < 110 && lv < 26) {
          // BUMP: a slow capsule beside the receiver — stand off on the anti-head
          // ray and drive the hull through it into the collider. Lead the capsule
          // by the tug's time-to-intercept, not a stale position.
          const fx2 = (l.pos.x - h.pos.x) / dlh, fz2 = (l.pos.z - h.pos.z) / dlh;
          const lead = lv > 0.5 ? Math.min(40, dpl / 25) : 0;
          const behind = { x: l.pos.x + l.vel.x * lead + fx2 * 44,
            z: l.pos.z + l.vel.z * lead + fz2 * 44 };
          const dBehind = dist(p.pos, behind);
          if (dBehind > 16) {
            aimPt = behind;
            vDes = Math.min(42, Math.max(14, dBehind * 0.6));
          } else {
            aimPt = { x: h.pos.x, z: h.pos.z };
            vDes = 12;
          }
        } else {
          // Chase & re-latch — routed around the receiver's own collider: if the
          // intercept path crosses the head's ball, fly to a ring point on the
          // capsule's side first instead of grinding into the static body.
          const ip = interceptPoint(p, l);
          const segx = ip.x - p.pos.x, segz = ip.z - p.pos.z;
          const segLen = Math.hypot(segx, segz) || 1;
          const proj = Math.max(0, Math.min(1,
            ((h.pos.x - p.pos.x) * segx + (h.pos.z - p.pos.z) * segz) / (segLen * segLen)));
          const cx = p.pos.x + segx * proj - h.pos.x;
          const cz = p.pos.z + segz * proj - h.pos.z;
          aimPt = Math.hypot(cx, cz) < 45
            ? { x: h.pos.x + ((l.pos.x - h.pos.x) / dlh) * 110,
                z: h.pos.z + ((l.pos.z - h.pos.z) / dlh) * 110 }
            : ip;
          vDes = Math.min(34, Math.max(12, dpl * 0.3));
          if (dpl < 800) aimAt(t.state, l.pos); // acquisition reads the aim point
          if (dpl < 360 && haulTick % 8 === 0) t.input.actions.tetherFire = true;
        }
      }
    } else if (stage) {
      // Transit to the stage point on the frozen axis, arriving slow enough that the
      // run-in starts from a settled pair. Reel the line down on the calm leg — a
      // short tether holds the trailer tight to the tow line for a truer release.
      const dStage = dist(p.pos, stage);
      if (dStage < 35 && pv < 12) runIn = true;
      aimPt = stage;
      vDes = Math.min(26, Math.max(6, (dStage - 15) * 0.22));
      if (tang < 8 && dpl > 70) t.input.actions.reelDelta = -1;
    } else {
      const aimLat = Math.max(-80, Math.min(80, -lLat * 1.3));
      aimPt = { x: p.pos.x + nx * (lAlong + lead) - nz * aimLat,
        z: p.pos.z + nz * (lAlong + lead) + nx * aimLat };
      vDes = Math.min(55, Math.max(14, 14 + dd * 0.04));
      if (tang < 8 && dpl > 70) t.input.actions.reelDelta = -1;
    }
    const dx = aimPt.x - p.pos.x, dz = aimPt.z - p.pos.z;
    const ad = Math.hypot(dx, dz) || 1;
    const vwx = (dx / ad) * vDes - p.vel.x, vwz = (dz / ad) * vDes - p.vel.z;
    const dvv = Math.hypot(vwx, vwz);
    let err = 0;
    if (dvv > 5) {
      err = wrapAngle(Math.atan2(vwz, vwx) - (p.rot || 0));
      t.input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
      if (Math.abs(err) < 0.4) t.input.moveZ = 1;
    } else {
      err = aimAt(t.state, aimPt);
      t.input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
    }
    if (dd > 1800 && Math.abs(err) < 0.25 && tang < 15 && dvv < 12 && speedOf(p) < 50) {
      t.input.boost = true;
    }
    // Reel in only at near-zero swing — winding tangential motion is the slingshot pump.
    if (tang < 5 && dpl > 105) t.input.actions.reelDelta = -1;
  }, 30000, 'the trailer dragged across the Quiet head');

  assert.ok(committed, 'the capsule touched the Quiet head and custody committed');
  assert.equal(committed.facilityId, 'fence_receiver', 'custody passed to the Quiet fence');
  for (let i = 0; i < 900 && t.mission(); i++) { neutral(t.input); sim_step(t); }
  assert.equal(t.mission(), null, 'the fence run completed');
  const reward = grants.find((g) => g.reason && g.reason.startsWith('mission:'));
  assert.ok(reward && reward.amount > 0,
    `the fence paid its terms (+${reward ? Math.round(reward.amount) : 0}cr)`);
});

// ── (c) wreck: destroy the assembly, then salvage the recovery wreck ─────────────────────────────

test('(c) a destroyed assembly leaves a reduced recovery the player strips with the mining beam', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch());

  // No tow needed for the kill: a tethered capsule orbits the tug faster than the
  // guns can track. The crew runs the body down instead — the freed capsule coasts
  // ballistically on the lane, so they pull alongside at matched velocity and hold
  // the guns on it at knife range until it breaks.
  t.until(() => t.state.heistFacilities.carrierReleased === true, () => {
    const c = t.carrier();
    if (c) steerTo(t.state, laneNearPoint(c.pos, c.vel, t.mouth), { arrive: 160 });
  }, 12000, 'the carrier release');

  t.until(() => !t.load(), () => {
    const l = t.load();
    if (!l) return;
    const d = dist(t.player.pos, l.pos);
    const rel = Math.hypot(l.vel.x - t.player.vel.x, l.vel.z - t.player.vel.z);
    // Guns have travel time: hold the cursor on the lead point, the way a player
    // aims ahead of a runner. Projectile-relative speed ≈ muzzle velocity once the
    // pair is matched, and the fixed point stays honest while it closes.
    let ax = l.pos.x, az = l.pos.z;
    for (let i = 0; i < 3; i++) {
      const ft = Math.hypot(ax - t.player.pos.x, az - t.player.pos.z) / 340;
      ax = l.pos.x + l.vel.x * ft;
      az = l.pos.z + l.vel.z * ft;
    }
    const aimErr = aimAt(t.state, { x: ax, z: az });
    if (d < 600 && rel < 30) {
      // Kill range: the turret only bears ±90° off the nose, so the nose itself tracks
      // the body while the guns work. Small thrust corrections hold the spacing.
      t.input.turnIntent = Math.max(-1, Math.min(1, aimErr / 0.6));
      if (d < 300 && Math.abs(aimErr) < 0.4) t.input.fire = true;
      if (d > 250 && Math.abs(aimErr) < 0.4) t.input.moveZ = 1;
      else if (d < 60) t.input.brake = true;
    } else {
      // Velocity-matching rendezvous: want = load velocity + a closing term toward it,
      // so the pair converges to zero relative speed and every shot lands.
      const wx = l.vel.x + (l.pos.x - t.player.pos.x) * 0.05;
      const wz = l.vel.z + (l.pos.z - t.player.pos.z) * 0.05;
      const err = wrapAngle(Math.atan2(wz, wx) - (t.player.rot || 0));
      t.input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
      if (Math.abs(err) < 0.5 && speedOf(t.player) < Math.hypot(wx, wz) + 5) t.input.moveZ = 1;
      if (Math.abs(err) < 0.5 && d > 800) t.input.boost = true;
    }
  }, 20000, 'the assembly to be destroyed');

  // The bounded wreck materializes where the assembly actually died.
  const wreck = () => (t.state.entityList || []).find((e) => e?.alive !== false
    && e.type === 'wreck' && e.data?.provenance?.markerId) || null;
  for (let i = 0; i < 1200 && !wreck(); i++) { neutral(t.input); sim_step(t); }
  assert.ok(wreck(), 'the reduced recovery wreck is physically there');
  for (let i = 0; i < 900 && t.mission(); i++) { neutral(t.input); sim_step(t); }
  assert.equal(t.mission(), null, 'the failed run settled');

  // Hold the beam on the wreck until its reduced pool is in the hold.
  const cargoOf = () => (t.state.player.cargo && t.state.player.cargo.items) || {};
  const totalBefore = Object.values(cargoOf()).reduce((a, b) => a + (Number(b) || 0), 0);
  t.until(() => {
    return Object.values(cargoOf()).reduce((a, b) => a + (Number(b) || 0), 0) > totalBefore;
  }, () => {
    const w = wreck();
    if (!w) return;
    steerTo(t.state, w.pos, { arrive: 30 });
    aimAt(t.state, w.pos);
    t.input.fireGroup = 2;
  }, 15000, 'the wreck pool to drain into the hold');
});

// ── (d) left alone: the event still has understandable actors ────────────────────────────────────

test('(d) left alone, the carrier finishes its run and the job resolves bounded', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch());
  const grants = [];
  t.bus.on('economy:grantCredits', (r) => grants.push(r));

  // The player parks far off the lane and never touches the controls.
  let sawRelease = false;
  let sawCarrierGone = false;
  let missionResolved = false;
  for (let i = 0; i < 22000; i++) {
    neutral(t.input);
    steerTo(t.state, { x: t.mouth.x + 4000, z: t.mouth.z - 4000 }, { arrive: 200 });
    sim_step(t);
    if (t.state.heistFacilities.carrierReleased === true) sawRelease = true;
    if (sawRelease && !t.carrier()) sawCarrierGone = true;
    if (!t.mission()) { missionResolved = true; break; }
  }

  assert.ok(sawRelease, 'it released the load on schedule without the player');
  assert.ok(sawCarrierGone, 'the tug departed after release — a bounded transient');
  assert.ok(missionResolved, 'the abandoned run resolved inside its window');
  assert.equal(grants.filter((g) => g.reason && g.reason.startsWith('mission:')).length, 0,
    'no payout for an abandoned job');
});
