// Instrumented probe of the pq195-09 (a) recover+haul path. Mirrors the test harness.
import { createSimulation, SIM_DT } from './src/core/sim.js';
import { createBus } from './src/core/eventBus.js';
import { physics } from './src/core/physics.js';
import { world } from './src/systems/world.js';
import { flightV3 } from './src/systems/flightV3.js';
import { combat } from './src/systems/combat.js';
import { weapons } from './src/systems/weapons.js';
import { tetherGameplay } from './src/systems/tetherGameplay.js';
import { mining } from './src/systems/mining.js';
import { cargo } from './src/systems/cargo.js';
import { heistFacilities } from './src/systems/heistFacilities.js';
import { lawSecurity } from './src/systems/lawSecurity.js';
import { heat } from './src/systems/heat.js';
import { npcJobsRuntime } from './src/systems/npcJobsRuntime.js';
import { aftermathWrecks } from './src/systems/aftermathWrecks.js';
import { spawnBudget } from './src/systems/spawnBudget.js';
import { createTacticalAISystem } from './src/systems/tacticalAI.js';
import { aiPorts } from './src/systems/aiPorts.js';
import { missions } from './src/systems/missions.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from './src/systems/ships.js';
import { BREAKAWAY_SP07, PQ019_HEIST_SECTOR_ID } from './src/data/heistFacilities.js';
import { BREAKAWAY_RECOVERY_TYPE, PQ019C_HEIST_STATION_ID } from './src/data/heistMission.js';
import { forkReceiverWorld, forkInstrumentModel } from './src/ui/forkInstrument.js';

const SYSTEMS = [
  physics, world, heistFacilities, flightV3, combat, weapons, tetherGameplay,
  mining, cargo, lawSecurity, heat, npcJobsRuntime, aftermathWrecks, spawnBudget,
  createTacticalAISystem(), aiPorts, missions,
];

const bus = createBus();
const sim = createSimulation({ seed: 19509, bus, systems: SYSTEMS });
const { state } = sim;
state.mode = 'flight';
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
await sim.registry.get('physics').prepareBackend(state);
state.player.heat = 0;
state.player.credits = 5000;
state.player.miningBeam = { tierId: 'beam_mk1' };
if (!state.ui) state.ui = {};
if (!state.nav) state.nav = { waypoint: null };
if (!state.input.aimWorld) state.input.aimWorld = { x: 0, z: 0 };
if (!state.input.actions) state.input.actions = {};

const mouth = forkReceiverWorld();
const player = sim.spawn(makeShipEntitySpec('ship_hawser', {
  team: 0, isPlayer: true,
  fittings: fittingsFromDefaultModules('ship_hawser', ['mod_frame_coupler_m']),
  pos: { x: mouth.x - mouth.nx * 500, z: mouth.z - mouth.nz * 500 },
}));
state.playerId = player.id;
sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
const missionsSys = sim.registry.get('missions');
const facSys = sim.registry.get('heistFacilities');
const origPrepare = facSys.prepareReceiverHandoff.bind(facSys);
facSys.prepareReceiverHandoff = (req) => {
  const r = origPrepare(req);
  if (!r?.prepared) console.log(`PREPARE DENIED @${state.tick}`, JSON.stringify(r));
  return r;
};
const origProof = facSys._forkCustodyProof.bind(facSys);
facSys._forkCustodyProof = (schedule, load, facilityId) => {
  const r = origProof(schedule, load, facilityId);
  if (!r?.ok) {
    const cap = state.heistFacilities?.capture;
    console.log(`PROOF FAIL @${state.tick}`, r.reason, 'lspd', load ? Math.hypot(load.vel.x, load.vel.z).toFixed(2) : '-',
      'omega', load ? (load.angVel?.y ?? load.omegaY ?? load.angVel ?? '-').toString().slice(0, 8) : '-',
      'phase', cap?.phase, 'lastTick', cap?.lastTick, 'settledTicks', cap?.settledTicks,
      'hull', load?.hull, 'tether', state.player?.tether?.active,
      'pos', load ? `${load.pos.x.toFixed(0)},${load.pos.z.toFixed(0)}` : '-');
    if (load) {
      const rcv = forkReceiverWorld();
      const dx = load.pos.x - rcv.x, dz = load.pos.z - rcv.z;
      const dep = dx * rcv.nx + dz * rcv.nz;
      const lat = -dx * rcv.nz + dz * rcv.nx;
      const fw = load.vel.x * rcv.nx + load.vel.z * rcv.nz;
      const sw = -load.vel.x * rcv.nz + load.vel.z * rcv.nx;
      console.log(`  fork-local: depth ${dep.toFixed(1)} lat ${lat.toFixed(1)} fw ${fw.toFixed(1)} sw ${sw.toFixed(1)}`);
      console.log('  physicsBody:', JSON.stringify(load.physicsBody).slice(0, 500));
      console.log('  physQueue:', JSON.stringify(state.physics?.impulseQueue || state.physicsAuthority?.queue || null).slice(0, 300));
      for (const e of state.entityList || []) {
        if (!e || e === load || e.alive === false || !e.pos) continue;
        const d = Math.hypot(e.pos.x - load.pos.x, e.pos.z - load.pos.z);
        if (d < 120) console.log('  near:', e.type, e.team, 'd', d.toFixed(0), 'spd', Math.hypot(e.vel?.x || 0, e.vel?.z || 0).toFixed(1));
      }
    }
  }
  return r;
};
for (const ev of ['heist:captureFork', 'heist:facilityCandidate', 'heist:receiverCommitted',
  'heist:receiverAborted', 'heist:receiverPrepared', 'heist:missionCue']) {
  sim.bus.on(ev, (r) => console.log(`EV ${ev} @${state.tick}`, JSON.stringify(r).slice(0, 340)));
}

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const speedOf = (e) => Math.hypot(e.vel.x, e.vel.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const input = state.input;
const load = () => (state.entityList || []).find((e) => e?.alive !== false
  && e.type === 'payload' && e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId) || null;
const carrier = () => (state.entityList || []).find((e) => e?.alive !== false
  && e.type === 'ship' && e.data?.heistFacilityRole === 'transport_carrier') || null;
const mission = () => (state.missions.active || []).find((m) => m && m.heist) || null;
const latchActive = () => !!(state.player.tether && state.player.tether.active);

function neutral() {
  input.moveX = 0; input.moveZ = 0; input.turnIntent = 0;
  input.boost = false; input.brake = false;
  input.fire = false; input.fireGroup = 0;
  input.aimIntentActive = true;
  input.actions.tetherFire = false; input.actions.tetherCut = false; input.actions.reelDelta = 0;
}
function aimAt(pos) {
  input.aimWorld.x = pos.x; input.aimWorld.z = pos.z;
  input.aimAngle = Math.atan2(pos.z - player.pos.z, pos.x - player.pos.x);
  return wrap(input.aimAngle - (player.rot || 0));
}
function steerTo(targetPos, arrive = 40) {
  const d = dist(player.pos, targetPos);
  const speed = speedOf(player);
  const err = aimAt(targetPos);
  input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
  const stopBand = arrive + speed * 1.4;
  if (d <= stopBand) { input.moveZ = 0; input.brake = speed > 3; return d; }
  const facing = Math.abs(err) < 0.45;
  input.moveZ = facing ? 1 : 0;
  input.boost = facing && d > 900;
  return d;
}
function interceptPoint(target, ourSpeed = 75) {
  let t = dist(player.pos, target.pos) / ourSpeed;
  for (let i = 0; i < 10; i++) {
    const px = target.pos.x + target.vel.x * t, pz = target.pos.z + target.vel.z * t;
    t = Math.hypot(px - player.pos.x, pz - player.pos.z) / ourSpeed;
  }
  return { x: target.pos.x + target.vel.x * t, z: target.pos.z + target.vel.z * t };
}
const gate = { x: mouth.x - mouth.nx * 430, z: mouth.z - mouth.nz * 430 };
const approachFix = { x: mouth.x - mouth.nx * 900, z: mouth.z - mouth.nz * 900 };
const throat = { x: mouth.x + mouth.nx * 55, z: mouth.z + mouth.nz * 55 };
// Tow destination: deep inside on the centreline — the last leg is a straight run-in.
const deepIn = { x: mouth.x + mouth.nx * 2500, z: mouth.z + mouth.nz * 2500 };
// Side exit lane for the player after the cut — lateral off the corridor, not back through it.
const latx = -mouth.nz, latz = mouth.nx;
const veerOut = { x: mouth.x - mouth.nx * 200 + latx * 500, z: mouth.z - mouth.nz * 200 + latz * 500 };
function laneNearPoint(fromPos, vel, dest) {
  const v = Math.hypot(vel.x, vel.z);
  if (v < 1e-6) return { x: fromPos.x, z: fromPos.z };
  const dir = { x: vel.x / v, z: vel.z / v };
  const s = (dest.x - fromPos.x) * dir.x + (dest.z - fromPos.z) * dir.z;
  return { x: fromPos.x + dir.x * s, z: fromPos.z + dir.z * s };
}

const row = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots
  .find((o) => o && o.type === BREAKAWAY_RECOVERY_TYPE);
bus.emit('ui:acceptMission', { missionId: row.id });

// Trace every write to the load's velocity vector (and any wholesale `vel` replacement) once the
// kernel has acquired it — the proof reads ~40 WU/s while the kernel's own sample reads ~0.
let velTrapArmed = false;
function armVelTrap() {
  if (velTrapArmed) return;
  const l = load();
  if (!l || !l.vel) return;
  velTrapArmed = true;
  let inner = { x: l.vel.x, z: l.vel.z };
  const handler = {
    set(t, k, v) {
      if ((k === 'x' || k === 'z') && Math.abs(v - (t[k] ?? 0)) > 10) {
        console.log(`VELWRITE @${state.tick} ${k}=${Number(v).toFixed(1)} cur(${inner.x.toFixed(1)},${inner.z.toFixed(1)})`,
          (new Error().stack || '').split('\n').slice(2, 6).join(' | '));
      }
      t[k] = v; return true;
    },
  };
  Object.defineProperty(l, 'vel', {
    configurable: true, enumerable: true,
    get() { return new Proxy(inner, handler); },
    set(v) {
      console.log(`VELREPLACE @${state.tick}`, JSON.stringify(v),
        (new Error().stack || '').split('\n').slice(2, 6).join(' | '));
      inner = { x: v.x, z: v.z };
    },
  });
}

let tick = 0;
for (; tick < 2600 && !load(); tick++) { neutral(); sim.step(SIM_DT); }
console.log('launch@', tick);

let phase = 'stage', latchT = 0, fedFlag = false, runIn = false, latchPos = null;
for (; tick < 40000; tick++) {
  neutral();
  const l = load();
  const c = carrier();
  const m = mission();
  if (phase === 'stage') {
    if (state.heistFacilities.carrierReleased === true) { phase = 'intercept'; console.log('release@', tick); }
    else if (c) steerTo(laneNearPoint(c.pos, c.vel, approachFix), 160);
  } else if (phase === 'intercept') {
    if (!l) { console.log('LOAD GONE @', tick, 'mission?', !!m, 'susp?', m?.heist?.suspended); break; }
    const dl = dist(player.pos, l.pos);
    steerTo(interceptPoint(l), 25);
    if (dl < 800) aimAt(l.pos);
    if (dl < 360 && latchT % 8 === 0) input.actions.tetherFire = true;
    latchT++;
    if (latchActive()) { phase = 'bleed'; latchPos = { x: l.pos.x, z: l.pos.z }; console.log('latch@', tick, 'loadSpd', speedOf(l).toFixed(1), 'dGate', dist(l.pos, gate).toFixed(0), 'hull', l.hull); }
  } else if (phase === 'bleed') {
    if (!l) { console.log('LOAD GONE @', tick, 'mission?', !!m); break; }
    const rel = Math.hypot(l.vel.x - player.vel.x, l.vel.z - player.vel.z);
    // Release-window telemetry: if the load were cut NOW, would its velocity carry it through
    // the mouth plane within the fork's lateral gate?
    const fw = l.vel.x * mouth.nx + l.vel.z * mouth.nz;           // inward speed (+ = into bay)
    const sw = -l.vel.x * mouth.nz + l.vel.z * mouth.nx;          // lateral speed
    const dep = (l.pos.x - mouth.x) * mouth.nx + (l.pos.z - mouth.z) * mouth.nz;
    const lat0 = -(l.pos.x - mouth.x) * mouth.nz + (l.pos.z - mouth.z) * mouth.nx;
    let pred = null;
    if (fw > 4 && dep < -5) {
      const tCross = -dep / fw;
      pred = lat0 + sw * tCross;
    }
    if (tick % 120 === 0) console.log('t', tick, 'lspd', speedOf(l).toFixed(1), 'pspd', speedOf(player).toFixed(1), 'rel', rel.toFixed(1),
      'dep', dep.toFixed(0), 'latNow', lat0.toFixed(1), 'fw', fw.toFixed(1), 'predLat', pred === null ? '-' : pred.toFixed(1));
    if (pred !== null && Math.abs(pred) < 8 && speedOf(l) < 95) {
      input.actions.tetherCut = true;
      console.log('SLING-RELEASE @', tick, 'spd', speedOf(l).toFixed(1), 'predLat', pred.toFixed(1), 'dep', dep.toFixed(0));
      phase = 'settle';
    }
    // Hands off entirely: every counter-thrust/steering variant during the swing either
    // pumped it or prolonged the settle. The assist bleeds the pair on its own.

    if (rel < 12 && speedOf(l) < 45 && speedOf(player) < 45) { phase = 'haul'; console.log('coherent@', tick, 'lspd', speedOf(l).toFixed(1), 'dep', dep.toFixed(0), 'lat', lat0.toFixed(1), 'dThroat', dist(l.pos, throat).toFixed(0)); }
  } else if (phase === 'haul') {
    if (!l) {
      const dead = (state.entityList || []).find((e) => e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId);
      console.log('LOAD GONE @', tick, 'mission?', !!m, 'susp?', m?.heist?.suspended,
        'dead?', dead ? `alive=${dead.alive}` : 'no-entity');
      break;
    }
    // UNIFIED APPROACH: velocity-want steering onto the mouth axis. The pair carries ~45
    // WU/s of downlane momentum that has to be MORPHED, not stopped — so the nose goes on
    // the velocity error (desired velocity minus current), which handles accel, decel and
    // the long turn as one powered maneuver. Speed budget shrinks with remaining depth:
    // the turn radius is v²/latAccel, so the ±11 gate is only threadable slow.
    const pDep = (player.pos.x - mouth.x) * mouth.nx + (player.pos.z - mouth.z) * mouth.nz;
    const pLat = -(player.pos.x - mouth.x) * mouth.nz + (player.pos.z - mouth.z) * mouth.nx;
    const dpl = dist(l.pos, player.pos) || 1;
    const lvx = (l.pos.x - player.pos.x) / dpl, lvz = (l.pos.z - player.pos.z) / dpl;
    const rvx = l.vel.x - player.vel.x, rvz = l.vel.z - player.vel.z;
    const radial = rvx * lvx + rvz * lvz;
    const tang = Math.hypot(rvx - radial * lvx, rvz - radial * lvz);
    let err = 0;
    let ps;
    if (pDep > -30) {
      steerTo(veerOut, 80); // committed or past the rails: peel off the corridor
      ps = speedOf(player);
    } else {
      const lead = Math.min(600, Math.max(220, -pDep * 0.4));
      // Lead the TRAILER, not the ship: a straight tow preserves the load's lateral offset,
      // so the aim point mirrors the load's centreline error — the swing drags it onto the
      // line and the offset shrinks to zero as it converges.
      const lLatNow = -(l.pos.x - mouth.x) * mouth.nz + (l.pos.z - mouth.z) * mouth.nx;
      const lDepNow = (l.pos.x - mouth.x) * mouth.nx + (l.pos.z - mouth.z) * mouth.nz;
      // Committed drive-through: a load inside ~170 WU and roughly on the line must keep its
      // forward momentum — parking at the mouth leaves it hovering outside the gate at <1
      // WU/s, never crossing. Aim through the mouth; the veer threshold still peels the
      // player off and the cut monitors fire when the load's geometry is right.
      const near = lDepNow > -170 && Math.abs(lLatNow) < 45;
      const aimDepth = near ? pDep + Math.max(lead, 110) : Math.min(pDep + lead, -60);
      const aimLat = Math.max(-80, Math.min(80, -lLatNow * 1.3));
      const aimPt = {
        x: mouth.x + mouth.nx * aimDepth - mouth.nz * aimLat,
        z: mouth.z + mouth.nz * aimDepth + mouth.nx * aimLat,
      };
      const ax = aimPt.x - player.pos.x, az = aimPt.z - player.pos.z;
      const ad = Math.hypot(ax, az) || 1;
      const vDes = pDep > 0 ? 55 : (near ? 15 : Math.min(55, Math.max(12, 14 + (-pDep) * 0.04)));
      const vwx = (ax / ad) * vDes - player.vel.x, vwz = (az / ad) * vDes - player.vel.z;
      const dv = Math.hypot(vwx, vwz);
      if (dv > 5) {
        err = wrap(Math.atan2(vwz, vwx) - (player.rot || 0));
        input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
        if (Math.abs(err) < 0.4) input.moveZ = 1;
      } else {
        err = wrap(Math.atan2(az, ax) - (player.rot || 0));
        input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
      }
      ps = speedOf(player);
      // Boost only on the long far legs, while the velocity error is already small.
      if ((pDep > 0 || pDep < -1800) && Math.abs(err) < 0.25 && tang < 15 && dv < 12 && ps < 50) {
        input.boost = true;
      }
    }
    // Reel in ONLY at near-zero swing: a shorter line bounds the trailer's serpentine by
    // the line length. Winding under any real tangential load is the figure-skater pump —
    // and a reel held across a cut press cancels the pending cut.
    if (!fedFlag && tang < 5 && dpl > 90) input.actions.reelDelta = -1;
    // commit monitor: kernel acquires → cut; or the load's predicted plane-crossing lands
    // inside the gate → ballistic cut, then the player veers off the corridor.
    const model = forkInstrumentModel(state);
    if (model && model.phase !== 'outside') {
      // TURNAROUND CUT: stay attached through the dip; the stretched tether hauls the load to
      // a momentary stop INSIDE the capture volume. Cutting there leaves a near-still free
      // load the kernel brake settles in place — a diagonal ballistic entry just grazes a
      // rail and pinballs out (observed 2026-10: 31.6→73.9, bounced out the mouth).
      const lDep = model.depth, lSpd = model.speed;
      if (lDep > 14 && lDep < 50 && lSpd < 10) {
        input.actions.tetherCut = true; fedFlag = 'turnaround';
        console.log('TURNAROUND-CUT @', tick, 'depth', lDep.toFixed(0), 'lat', model.lateral.toFixed(1), 'spd', lSpd.toFixed(1));
        phase = 'settle';
      } else if (tick % 120 === 0) {
        console.log('t', tick, 'inside dep', lDep.toFixed(0), 'lat', model.lateral.toFixed(1), 'spd', lSpd.toFixed(1), 'phase', model.phase);
      }
    } else if (model) {
      const dep = model.depth, lat0 = model.lateral;
      const fw = l.vel.x * mouth.nx + l.vel.z * mouth.nz;
      const sw = -l.vel.x * mouth.nz + l.vel.z * mouth.nx;
      if (fw > 8 && dep < -8 && dep > -420) {
        const pred = lat0 + sw * (-dep / fw);
        // Late, straight cuts only: close enough that prediction can't decay, and little
        // enough lateral speed that the entry isn't a rail graze.
        if (Math.abs(pred) < 6 && Math.abs(sw) < 7 && model.speed < 95) {
          input.actions.tetherCut = true; fedFlag = 'ballistic';
          console.log('BALLISTIC-CUT @', tick, 'depth', dep.toFixed(0), 'lat', lat0.toFixed(1), 'pred', pred.toFixed(1), 'spd', model.speed.toFixed(1), 'fw', fw.toFixed(1));
          phase = 'veer';
        }
      }
    }
    const dl = dist(l.pos, throat), lv = speedOf(l);
    if (!m) { console.log('MISSION GONE @', tick); break; }
    if (tick % 1500 === 0) console.log('t', tick, 'haul d', dl.toFixed(0), 'lspd', lv.toFixed(1), 'pspd', ps.toFixed(1), 'tang', tang.toFixed(1), 'dpl', dpl.toFixed(0), 'lat', model?.lateral?.toFixed(1));
  }
  // Feed: settle on the approach fix (out front), then drive straight down +n through the mouth.
  if (phase === 'feed') {
    const l2 = load();
    if (!l2) { console.log('LOAD GONE @', tick); break; }
    const settled = speedOf(l2) < 14 && speedOf(player) < 14;
    if (settled) { phase = 'runin'; console.log('SETTLED @', tick); }
    else if (tick % 600 === 0) console.log('t', tick, 'settle lspd', speedOf(l2).toFixed(1), 'pspd', speedOf(player).toFixed(1));
  } else if (phase === 'runin') {
    const model = forkInstrumentModel(state);
    const l2 = load();
    if (model && model.phase !== 'outside') {
      input.actions.tetherCut = true;
      console.log('ACQUIRED @', tick, 'phase', model.phase, 'depth', model.depth.toFixed(0), 'lat', model.lateral.toFixed(1), 'spd', model.speed.toFixed(1));
      phase = 'settle';
    } else {
      // ballistic cut window: load outside, aligned, committed
      if (model && l2 && model.depth < -20 && model.depth > -140 && model.aligned
          && model.speed > 8 && model.speed < 60) {
        input.actions.tetherCut = true; fedFlag = true;
        console.log('CUT @', tick, 'depth', model.depth.toFixed(0), 'lat', model.lateral.toFixed(1), 'spd', model.speed.toFixed(1));
      }
      const pDepth = (player.pos.x - mouth.x) * mouth.nx + (player.pos.z - mouth.z) * mouth.nz;
      if (pDepth > 30 && !fedFlag) { steerTo(approachFix, 80); }
      else if (!fedFlag) {
        const err = aimAt(throat);
        input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
        const ps2 = speedOf(player);
        if (ps2 > 30) { input.moveZ = 0; input.brake = true; } else { input.brake = false; input.moveZ = Math.abs(err) < 0.4 ? 1 : 0; }
      } else { steerTo(gate, 120); }
      if (tick % 200 === 0) console.log('t', tick, 'runin depth', model?.depth?.toFixed(0), 'lat', model?.lateral?.toFixed(1), 'spd', model?.speed?.toFixed(1), 'aligned', model?.aligned, 'fed', fedFlag, 'dpl', l2 ? dist(l2.pos, player.pos).toFixed(0) : '-');
      if (!model && !l2) { console.log('BOTH GONE @', tick); break; }
      if (!model) { console.log('MODEL NULL @', tick, 'latch', latchActive(), 'fed', fedFlag); phase = 'settle'; }
    }
  }
  if (phase === 'veer') {
    steerTo(veerOut, 120);
    armVelTrap();
    const model = forkInstrumentModel(state);
    if (tick % 300 === 0) console.log('t', tick, 'veer dep', model?.depth?.toFixed(0), 'lat', model?.lateral?.toFixed(1), 'phase', model?.phase, 'receipt', !!mission()?.heist?.arbiter?.receipt);
    if (mission()?.heist?.arbiter?.receipt) { console.log('RECEIPT @', tick, JSON.stringify(mission().heist.arbiter.receipt).slice(0, 300)); break; }
    if (!mission()) { console.log('MISSION ENDED no receipt @', tick); break; }
    if (tick > 16000) { console.log('veer timeout'); break; }
  }
  if (phase === 'settle') {
    input.brake = true;
    const model = forkInstrumentModel(state);
    const l2 = load();
    if (tick % 60 === 0) console.log('t', tick, 'settle phase', model?.phase, 'depth', model?.depth?.toFixed(0),
      'lat', model?.lateral?.toFixed(1), 'tether', state.player?.tether?.active, 'lspd', l2 ? speedOf(l2).toFixed(1) : '-',
      'receipt', !!mission()?.heist?.arbiter?.receipt);
    if (mission()?.heist?.arbiter?.receipt) { console.log('RECEIPT @', tick, JSON.stringify(mission().heist.arbiter.receipt).slice(0, 300)); break; }
    if (!mission()) { console.log('MISSION ENDED no receipt @', tick); break; }
    if (tick > 16000) { console.log('settle timeout'); break; }
  }
  sim.step(SIM_DT);
}
console.log('END tick', tick);
// Completion can remove the mission from `active` — check every mission bucket for the
// arbiter receipt before calling it a loss.
for (const key of Object.keys(state.missions || {})) {
  const bucket = state.missions[key];
  const list = Array.isArray(bucket) ? bucket : (bucket && Array.isArray(bucket.list) ? bucket.list : []);
  for (const rec of list) {
    if (rec && rec.heist) console.log('mission bucket', key, 'id', rec.id, 'status', rec.status,
      'receipt', JSON.stringify(rec.heist?.arbiter?.receipt || null).slice(0, 400));
  }
}
console.log('capture state', JSON.stringify(state.heistFacilities?.capture || null).slice(0, 300));
