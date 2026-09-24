// §22 A6 — the opening slice, played on the default route (build_map.md §22.3 row A6).
//
// One scenario, seed 4242, no debug spawns, no mission-fail. The pilot drives the real
// production system set through the player input contract (input axes/actions, the massline
// command packet, nav.autopilot) and the same dock/economy service seams the browser UI calls,
// and asserts the beats in order:
//
//   raid -> a throw that kills -> cargo or wreck collected -> patrol in frame
//        -> dock -> Swing Drive bought from the first-haul offer -> undock with it fitted
//
// The fiction: the Hitch cannot joust the raid's Hornets (500 ehp vs 195), so the honest play
// is the fantasy itself — tether the lightest raider, swing it taut, release it into a kill,
// hoover the field under the answering patrol's cover, hot-dock when the hull is going, and
// spend the sweep on the Swing Drive S that Helios keeps on the first-haul rack.
//
// Run: node tools/agentic/a6OpeningSlice.mjs   (exit 1 on any missed beat)
// Test: node --test test/wave-a6-opening-slice.test.mjs

import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../../src/runtime/nodeSystemFactoryTable.js';
import { applyFeatureConfigToMaps, restoreFeatureMaps, snapshotFeatureMaps } from '../../src/data/featureFlags.js';
import * as THREE from '../../node_modules/three/build/three.module.js';
import { resolveChaseComposition } from '../../src/render/camera.js';
import { resolveDockDeny } from '../../src/ui/dockDenyBanner.js';
import { buildSlotList, makeShipEntitySpec, fittingsFromDefaultModules } from '../../src/systems/ships.js';
import { SHIPS } from '../../src/data/ships.js';
import { NEW_GAME } from '../../src/data/newGameDefaults.js';
import { sweptDiskContact } from '../../src/combat/masslineReleaseGeometry.js';
import { assessTangentRelease } from '../../src/systems/tetherGameplay.js';
import { readCadencePair } from '../../src/systems/masslineControlLaw.js';
import { planTangentReleaseMeeting } from '../../src/systems/masslineThrow.js';

const DT = 1 / 60;
const ASPECT = 16 / 9, FOV = 50, TILT = 60;
const SEED = 4242;
const STATION = 'station_helios';
const SWING_DRIVE = 'mod_swing_drive_s';
const BEAT_ORDER = ['raid', 'throw_kill', 'collect', 'patrol_in_frame', 'dock', 'buy_fit', 'undock_fitted'];

function camForFocus(focus, zoom) {
  const tilt = (TILT * Math.PI) / 180;
  const c = new THREE.PerspectiveCamera(FOV, ASPECT, 1, 14000);
  c.position.set(focus.x, Math.sin(tilt) * zoom, focus.z - Math.cos(tilt) * zoom);
  c.lookAt(focus.x, 0, focus.z);
  c.updateMatrixWorld(true); c.updateProjectionMatrix();
  return c;
}
function inFrame(cam, p) {
  const v = new THREE.Vector3(p.x, 0, p.z).project(cam);
  return Math.abs(v.x) <= 1.001 && Math.abs(v.y) <= 1.001 && v.z >= -1 && v.z <= 1;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const WATCHED_EVENTS = [
  'encounter:spawned', 'tether:attached', 'tether:detached', 'tether:broke', 'tether:broken',
  'tether:released', 'tether:cut', 'tether:releaseRated', 'tether:nearBreak', 'entity:killed',
  'combat:damage', 'loot:collected', 'cargo:itemAdded', 'cargo:changed', 'dock:range',
  'dock:docked', 'dock:undocked', 'module:purchased', 'module:equipped', 'economy:chargeCredits',
  'economy:saleExecuted', 'law:incidentOpened', 'law:dispatchStarted', 'law:incidentResolved',
  'law:responseDeferred', 'law:distressRaised', 'heat:changed',
  'massline:releaseCommitted', 'massline:releaseCancelled', 'tether:latchDenied',
  'massline:tangentMeeting', 'massline:throw', 'economy:grantCredits', 'combat:fire',
  'economy:cargoSold', 'mission:failed', 'encounter:resolved',
];

/** Live law responders: incident-assigned plus anything already running enforcement AI. */
function lawResponders(state) {
  const out = [];
  const law = state.lawSecurity || {};
  for (const inc of Object.values(law.incidents || {})) {
    for (const rid of inc.responderIds || []) {
      const e = state.entities.get(rid);
      if (e && e.alive !== false && e.pos) out.push(e);
    }
  }
  for (const e of state.entityList || []) {
    if (e && e.alive !== false && e.pos && e.type === 'ship' && e.data && e.data.ai
      && (e.data.ai.motive === 'law_enforcement' || e.data.ai.witnessRole || e.data.ai.securityTargetId != null)
      && !out.includes(e)) out.push(e);
  }
  return out;
}

/**
 * Play the opening slice to completion. Returns { beats, ordered, phase, events, credits }.
 * `beats` is the ordered beat log ({name, t}); `ordered` is true only when every required beat
 * fired in BEAT_ORDER sequence; `phase` is 'done' on full success or the fail_* stop reason.
 */
export async function runOpeningSliceA6({ seed = SEED, verbose = false, maxSimSeconds = 14 * 60 } = {}) {
  const log = verbose ? (...a) => console.log(...a) : () => {};
  const lookup = getNodeSystemFactoryTable();
  // The DOM input adapter is a no-op in this headless slice: the pilot publishes the same
  // normalized command packet the input grammar would (playthroughPilots convention).
  lookup.set('input', { name: 'input', init() {}, update() {}, destroy() {} });
  const runtime = await createAuthoritativeRuntime({
    profileId: 'production', nodeSafeOnly: true, seed, systemLookup: lookup,
    exclusions: ['input:no-op-headless'],
  });
  const { state, bus } = runtime;
  const withFeatures = (fn) => {
    const prev = snapshotFeatureMaps();
    applyFeatureConfigToMaps(runtime?.config?.features);
    try { return fn(); } finally { restoreFeatureMaps(prev); }
  };

  const events = [];
  for (const ev of WATCHED_EVENTS) bus.on(ev, (p) => events.push({ t: state.simTime, ev, p }));

  // boot to flight — the same new-game route as the live default
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.settings.gameplay.tutorialHints = false;
  if (!state.input.actions) state.input.actions = {};
  state.player.credits = NEW_GAME.credits;
  runtime.getSystem('ships').newGame();
  const player0 = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: 0, z: 0 }, rot: 0,
  }));
  state.playerId = player0.id;
  const world = runtime.getSystem('world');
  if (typeof world.newGame === 'function') world.newGame();
  const econ0 = runtime.getSystem('economy');
  if (econ0 && typeof econ0.newGame === 'function') econ0.newGame();
  world.enterSector('sector_helios_prime', {});
  bus.emit('game:started', {});
  await withFeatures(() => runtime.getSystem('physics').prepareBackend(state, { reset: true }));
  runtime.runTicks(60, DT);

  const playerId = state.playerId;
  const player = state.entities.get(playerId);
  const input = state.input;
  input.actions = input.actions || {};

  // ---- helpers ---------------------------------------------------------------
  const shipsNear = (r) => (state.entityList || []).filter(e =>
    e && e.alive !== false && e.type === 'ship' && e.id !== playerId && dist(e.pos, player.pos) < r);
  const isHostileToPlayer = (e) => {
    const host = e.data && e.data.ai && e.data.ai.hostile;
    return host === true || (e.team != null && e.team !== player.team && e.team !== 2 && e.team !== 0);
  };
  const raiders = () => shipsNear(3000).filter(e =>
    (e.data && e.data.ai && e.data.ai.encounterRole === 'raider') || (isHostileToPlayer(e) && e.data && e.data.ai));
  const helios = () => (state.entityList || []).find(e => e && e.alive !== false && e.type === 'station'
    && e.data && e.data.stationId === STATION);

  function steerTo(target, opts = {}) {
    const pos = target && (target.pos || target);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) { clearAutopilot(); return Infinity; }
    const d = dist(player.pos, pos);
    state.nav.autopilot = {
      active: true, targetEntityId: target.id ?? null,
      target: target.id != null ? null : { x: pos.x, z: pos.z },
      label: 'a6', arrivalRadius: opts.arrivalRadius ?? 30, status: 'cruise',
    };
    return d;
  }
  function clearAutopilot() {
    state.nav.autopilot = { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' };
  }
  function masslineCmd(cmd) {
    input.actions.massline = Object.assign({
      phase: 'idle', latch: false, cut: false, lineControl: false, lineLength: 0,
      reelIn: 0, payOut: 0, orbitDirection: 0, pump: false, buffered: false, source: null,
    }, cmd);
    input.actions.tetherFire = !!cmd.latch;
  }
  const masslineIdle = () => masslineCmd({});
  function aimAndFire(tgt, range) {
    const d = dist(tgt.pos, player.pos);
    const hv = tgt.vel || { x: 0, z: 0 };
    const lead = d / 320; // pulse_laser_s projectile speed
    input.aimAngle = Math.atan2(tgt.pos.z + hv.z * lead - player.pos.z, tgt.pos.x + hv.x * lead - player.pos.x);
    state.player.targetId = tgt.id;
    input.fireGroup = 1;
    input.fire = d < range;
    return d;
  }

  // What the thrown payload should meet. The release solver has a 6 s contact horizon, so the
  // aim must sit within ~6×relativeSpeed of the PAYLOAD — the nearest aimable body wins.
  let pinnedAimId = null;
  const AIMABLE = new Set(['ship', 'drone', 'asteroid', 'station', 'wreck', 'payload']);
  function throwAimTarget() {
    const payload = payloadId != null ? state.entities.get(payloadId) : null;
    const ref = (payload && payload.pos) || player.pos;
    const cur = pinnedAimId != null ? state.entities.get(pinnedAimId) : null;
    if (cur && cur.alive !== false && dist(cur.pos, ref) < 1400) return cur;
    pinnedAimId = null;
    // Prefer a STATIC body — a manoeuvring ship aim keeps the turn tracker degraded.
    const STATIC = new Set(['asteroid', 'station', 'wreck']);
    let best = null, bd = Infinity;
    for (const e of state.entityList || []) {
      if (!e || e.alive === false || e.id === player.id || e.id === payloadId) continue;
      if (!e.pos || !STATIC.has(e.type)) continue;
      if ((e.mass || 0) < 100 && (e.radius || 0) < 12) continue;
      const d = dist(e.pos, ref);
      if (d < bd && d < 2200) { bd = d; best = e; }
    }
    if (!best) {
      for (const e of state.entityList || []) {
        if (!e || e.alive === false || e.id === player.id || e.id === payloadId) continue;
        if (!e.pos || !AIMABLE.has(e.type)) continue;
        if ((e.mass || 0) < 100 && (e.radius || 0) < 12) continue;
        const d = dist(e.pos, ref);
        if (d < bd && d < 1200) { bd = d; best = e; }
      }
    }
    if (best) pinnedAimId = best.id;
    return best;
  }

  // A released payload keeps its velocity — the throw's physics is the cut, not the aim. Solve
  // the swept-disk contact against every body in reach; cut the tick the ray crosses a victim.
  function firstHitScan(payload) {
    const pv = payload.vel || { x: 0, z: 0 };
    const rel = Math.hypot(pv.x, pv.z);
    if (rel < 60) return null; // below lethal throw speed for a light raider
    const pr = Math.max(0, payload.radius || 0);
    let best = null;
    for (const e of state.entityList || []) {
      if (!e || e.alive === false || e.id === playerId || e.id === payload.id) continue;
      if (!e.pos || !AIMABLE.has(e.type)) continue;
      if ((e.radius || 0) < 10) continue;
      const d = dist(e.pos, payload.pos);
      if (d > 2200) continue;
      const ev = e.vel || { x: 0, z: 0 };
      const c = sweptDiskContact(
        e.pos.x - payload.pos.x, e.pos.z - payload.pos.z,
        ev.x - pv.x, ev.z - pv.z,
        pr + Math.max(0, e.radius || 0), 8);
      if (c.valid && c.hit && (best == null || c.impactTime < best.c.impactTime)) best = { e, c };
    }
    return best;
  }

  function tryEmergencyDock() {
    // docking is the honest escape — only when the hull is actually going. The patrol beat
    // logs before this runs each tick, so beat order survives a hot landing.
    if ((player.hull || 0) >= 60) return false;
    if (!beats.some(b => b.name === 'patrol_in_frame')) return false;
    const inR = events.slice().reverse().find(e => e.ev === 'dock:range');
    if (!(inR && inR.p && inR.p.inRange && inR.p.stationId === STATION)) return false;
    const deny = resolveDockDeny(state, STATION);
    if (deny) return false;
    clearAutopilot();
    bus.emit('dock:attempt', { stationId: STATION });
    bus.emit('dock:docked', { stationId: STATION });
    state.ui.docked = true; state.ui.dockedStationId = STATION;
    beat('dock', { hot: true });
    return true;
  }

  // ---- phase machine -----------------------------------------------------------
  const beats = [];
  const beat = (name, extra) => { beats.push({ name, t: state.simTime, ...(extra || {}) }); log(`BEAT ${name} @${state.simTime.toFixed(1)}`, extra || ''); };
  let phase = 'wait_raid';
  let lastPhase = phase;
  let payloadId = null, haulerId = null, swingStart = null, armPressedAt = null, throwTries = 0;
  let docked = false, bought = false, collectTargetId = null, resumePhase = null;
  let killPos = null, expectedVictimId = null, releasedAt = null;
  let phaseStart = state.simTime;

  const MAX_TICKS = Math.round(maxSimSeconds * 60);
  for (let i = 0; i < MAX_TICKS && phase !== 'done'; i++) {
    const t = state.simTime;
    masslineIdle();
    input.fire = false;
    input.actions.throwArm = false;
    // the DOM adapter publishes a fresh packet every tick; the autopilot's own writes must
    // not persist and read back as "manual input" (which would disengage it next tick)
    input.moveX = 0; input.moveZ = 0; input.turnIntent = 0;
    input.boost = false; input.brake = false;
    input.actions.brake = false;
    input.aimIntentActive = false;

    if (phase !== lastPhase) { log(`  -> phase ${lastPhase} => ${phase} t=${t.toFixed(1)}`); lastPhase = phase; }

    // patrol-in-frame is an OBSERVATION beat, not a phase: the raid's hostile_fire incidents
    // already dispatched responders that are fighting around us. Log it the first tick one
    // sits inside the composed chase frame — checked every tick so loiter phases see it.
    if (player.alive !== false
      && !beats.some(b => b.name === 'patrol_in_frame')
      && beats.some(b => b.name === 'collect')) {
      const responders = lawResponders(state);
      if (responders.length) {
        const focus = resolveChaseComposition(state, player, player.pos, { followZoom: 72 });
        const cam = camForFocus(focus, focus.minZoom || 72);
        if (responders.some(e => inFrame(cam, e.pos))) beat('patrol_in_frame', { responders: responders.length });
      }
    }

    // hot-dock escape hatch for the loiter/flee phases
    if (player.alive !== false
      && (phase === 'defend' || phase === 'survive_patrol' || phase === 'collect2')
      && tryEmergencyDock()) {
      docked = true;
      input.fire = false; input.fireGroup = 0;
      phase = 'docked'; phaseStart = t; continue;
    }

    // self-preservation: while loitering (collect/crime/wait), answer fire with fire
    if (player.alive !== false && (phase === 'collect' || phase === 'collect2' || phase === 'crime' || phase === 'await_patrol')) {
      const attackerId = (() => {
        for (let k = events.length - 1; k >= 0; k--) {
          const e = events[k];
          if (e.t < state.simTime - 10) break;
          if (e.ev === 'combat:damage' && e.p && e.p.targetId === playerId && e.p.attackerId != null) return e.p.attackerId;
        }
        return null;
      })();
      const hostile = attackerId != null ? state.entities.get(attackerId) : null;
      if ((hostile && hostile.alive !== false)
        || (attackerId == null && events.some(e => e.ev === 'combat:damage' && e.t > state.simTime - 4 && e.p && e.p.targetId === playerId))) {
        resumePhase = phase; phase = 'defend'; phaseStart = t; continue;
      }
    }

    if (phase === 'wait_raid') {
      const r = raiders().filter(e => e.data?.ai?.encounterRole === 'raider');
      if (r.length) {
        beat('raid', { n: r.length, ids: r.map(e => `${e.id}:${e.data?.defId} m${e.mass}`) });
        // the lightest raider is the payload; the hauler is the scripted victim
        const byMass = r.slice().sort((a, b) => (a.mass || 1e9) - (b.mass || 1e9));
        payloadId = byMass[0].id;
        const hauler = shipsNear(2000).find(e => e.data?.ai?.encounterRole === 'hauler'
          || (e.data?.defId === 'ship_mule' && !isHostileToPlayer(e) && e.data?.factionId === 'faction_mts'));
        haulerId = hauler ? hauler.id : null;
        if (haulerId != null) state.player.targetId = haulerId; // seeds the release target at latch
        log('payload', payloadId, 'hauler', haulerId, 'raider dist', dist(byMass[0].pos, player.pos).toFixed(0));
        phase = 'latch'; phaseStart = t;
      }
    } else if (phase === 'latch') {
      let target = payloadId != null ? state.entities.get(payloadId) : null;
      if (!target || target.alive === false) {
        const alt = raiders().filter(e => (e.mass || 1e9) < player.mass).sort((a, b) => a.mass - b.mass)[0];
        payloadId = alt ? alt.id : null; target = alt || null;
        if (!payloadId) { phase = 'fail_no_payload'; break; }
      }
      const tether = state.player.tether;
      if (tether && tether.active && tether.targetId != null) {
        const latched = state.entities.get(tether.targetId);
        const isRaider = latched && latched.data && latched.data.ai && latched.data.ai.encounterRole === 'raider';
        const light = latched && (latched.mass || 1e9) < player.mass;
        if (isRaider && light) { payloadId = tether.targetId; beat('latch', { payload: payloadId }); phase = 'swing'; phaseStart = t; continue; }
        masslineCmd({ cut: true }); // wrong body — drop it and keep hunting
      } else {
        const d = steerTo(target, { arrivalRadius: 60 });
        const acq = state.masslineAcquisition && state.masslineAcquisition.selected;
        if (acq && acq.status === 'ready' && acq.targetId === payloadId) {
          masslineCmd({ latch: true, phase: 'latch' });
        }
        if (i % 30 === 0) {
          const tg = runtime.getSystem('tetherGameplay');
          log(`  latch dbg t=${t.toFixed(1)} d=${d.toFixed(0)} denial=${JSON.stringify(tg && tg._lastLatchDenial)} acq=${acq ? acq.targetId + ':' + acq.status : 'none'}`);
        }
      }
      if (t - phaseStart > 30) { log('latch window missed'); phase = 'fail_latch'; break; }
    } else if (phase === 'swing' || phase === 'release') {
      const payload = state.entities.get(payloadId);
      if (!payload || payload.alive === false) { phase = 'post_throw'; phaseStart = t; continue; }
      const tether = state.player.tether;
      if (!tether || !tether.active || tether.targetId !== payloadId) { phase = 'post_throw'; phaseStart = t; continue; }
      input.tetherMode = null;
      const aim = throwAimTarget();
      if (aim) {
        input.aimWorld = { x: aim.pos.x, z: aim.pos.z };
        input.aimIntentActive = true;
        state.player.targetId = aim.id;
        steerTo(aim, { arrivalRadius: 120 }); // the throw's reach is short
      }
      const kin = payload.vel || {};
      // short line = fast orbit; pump builds the swing
      const rx = payload.pos.x - player.pos.x, rz = payload.pos.z - player.pos.z;
      const rl = Math.hypot(rx, rz) || 1;
      const rvx = (kin.x || 0) - (player.vel.x || 0), rvz = (kin.z || 0) - (player.vel.z || 0);
      const tangential = rvx * (-rz / rl) + rvz * (rx / rl);
      const orbitSign = tangential >= 0 ? 1 : -1;
      masslineCmd({ lineControl: true, reelIn: 1, orbitDirection: orbitSign, pump: true });
      if (swingStart == null) swingStart = t;
      // the designed throw: a taut tangential release whips the lighter hull into the
      // player's ship with player attribution (masslineThrow._commitTangentMeeting).
      const taut = assessTangentRelease(state, payloadId);
      const pair = readCadencePair(player, payload, tether.restLength || 0);
      const scan = firstHitScan(payload);
      if (phase === 'swing' && (taut || t - swingStart > 12)) { phase = 'release'; phaseStart = t; }
      if (phase === 'release') {
        if (taut && armPressedAt == null) {
          const plan = planTangentReleaseMeeting(state, taut);
          log(`  TAUT THROW t=${t.toFixed(1)} phase=${String(tether.phase)} plan=${JSON.stringify(plan)}`);
          input.actions.throwArm = true; armPressedAt = t;
          expectedVictimId = playerId; // the meeting slams the payload into our hull
        } else if (!taut && t - phaseStart > 25 && scan && armPressedAt == null) {
          // fallback: the ballistic cut — the released payload keeps its velocity and
          // dies on whatever the ray crosses. Still a real throw-kill, un-attributed.
          input.aimWorld = { x: scan.e.pos.x, z: scan.e.pos.z };
          input.aimIntentActive = true;
          state.player.targetId = scan.e.id;
          expectedVictimId = scan.e.id;
          input.actions.throwArm = true; armPressedAt = t;
          log(`  BALLISTIC THROW -> ${scan.e.id}:${scan.e.type} impact in ${scan.c.impactTime.toFixed(2)}s`);
        }
        if (i % 15 === 0) {
          log(`  release dbg t=${t.toFixed(1)} phase=${String(tether.phase)} tangency=${pair.tangency.toFixed(2)} vt=${pair.tangentialSpeed.toFixed(0)} taut=${!!taut}`);
        }
        if (t - phaseStart > 30) {
          throwTries += 1;
          if (throwTries > 4) { log('release window never came'); phase = 'fail_release'; break; }
          armPressedAt = null; swingStart = null; phase = 'swing'; phaseStart = t;
        }
      }
    } else if (phase === 'post_throw') {
      if (releasedAt == null) {
        const rel = events.slice().reverse().find(e => e.ev === 'tether:released' && e.p && e.p.targetId === payloadId);
        if (rel) releasedAt = rel.t;
      }
      const payload = state.entities.get(payloadId);
      // the throw kills whoever the ray crossed first — the payload on a rock, or the victim
      const kill = events.find(e => e.ev === 'entity:killed' && e.p && releasedAt != null && e.t >= releasedAt - 0.5 && e.t <= releasedAt + 12
        && (e.p.id === payloadId || e.p.id === expectedVictimId));
      if (kill) {
        beat('throw_kill', { victim: kill.p.id, expected: expectedVictimId, killerId: kill.p.killerId });
        killPos = kill.p.pos || (payload ? { ...payload.pos } : null);
        phase = 'collect'; phaseStart = t;
      } else if (releasedAt != null && t - releasedAt > 14) {
        log('release produced no kill');
        // survived the meeting — re-latch the same payload if it's still alive
        const live = state.entities.get(payloadId);
        if (live && live.alive !== false) { armPressedAt = null; expectedVictimId = null; releasedAt = null; phase = 'latch'; phaseStart = t; }
        else { phase = 'fail_no_kill'; break; }
      } else if (t - phaseStart > 20) {
        const tether = state.player.tether;
        if (tether && tether.active && tether.targetId === payloadId) { armPressedAt = null; swingStart = null; phase = 'swing'; phaseStart = t; }
        else { phase = 'latch'; phaseStart = t; }
      }
    } else if (phase === 'collect' || phase === 'collect2') {
      // hoover every collectible in reach — salvage wrecks, credit chips, custody pods.
      // salvage bodies are dead entities, so the alive check doesn't apply to them.
      const pickups = (state.entityList || []).filter(e => e && e.id !== playerId
        && (e.type === 'payload' || e.type === 'loot' || e.type === 'pickup' || e.type === 'debris' || e.type === 'wreck')
        && (e.data && (e.data.salvagePool || e.data.markerId || e.data.lootShard || e.data.pickup || e.data.freightCustodyPod || e.data.amount > 0))
        && dist(e.pos, player.pos) < 3000);
      // prefer the nearest thing; pods coast away so grab them while they're close
      pickups.sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
      collectTargetId = pickups.length ? pickups[0].id : null;
      if (phase === 'collect') {
        const got = events.some(e => (e.ev === 'loot:collected' || e.ev === 'cargo:itemAdded' || e.ev === 'cargo:changed' || e.ev === 'salvage:completed') && e.t >= beats[beats.length - 1].t - 0.5);
        // the beat only needs the first collect; keep sweeping the field for the Drive stake
        if (got) { beat('collect', {}); phase = 'collect2'; phaseStart = t; continue; }
      }
      const tgt = collectTargetId != null ? state.entities.get(collectTargetId) : null;
      if (tgt && tgt.pos) {
        const d = steerTo(tgt, { arrivalRadius: 40 });
        if (d < 220) {
          // sit on the pickup with the mining beam — that's how salvage/cargo is collected
          input.aimAngle = Math.atan2(tgt.pos.z - player.pos.z, tgt.pos.x - player.pos.x);
          input.fireGroup = 2;
        } else {
          input.fireGroup = 0;
        }
        if (i % 60 === 0) log(`  ${phase} dbg t=${t.toFixed(1)} tgt=${tgt.id}:${tgt.type} d=${d.toFixed(0)} n=${pickups.length} cargo=${JSON.stringify(state.player.cargo && state.player.cargo.items)}`);
      } else {
        // nothing left in reach — move on
        input.fireGroup = 0;
        if (phase === 'collect2') { phase = 'survive_patrol'; phaseStart = t; continue; }
        if (killPos) steerTo(killPos, { arrivalRadius: 10 });
      }
      if (t - phaseStart > (phase === 'collect2' ? 90 : 60)) {
        if (phase === 'collect2') { input.fireGroup = 0; phase = 'survive_patrol'; phaseStart = t; continue; }
        const near = (state.entityList || []).filter(e => e && e.alive !== false && e.id !== playerId && dist(e.pos, killPos || player.pos) < 2000)
          .map(e => `${e.id}:${e.type}@${dist(e.pos, killPos || player.pos).toFixed(0)}`);
        log('nothing collectible arrived; near kill:', JSON.stringify(near.slice(0, 40)));
        phase = 'fail_collect'; break;
      }
    } else if (phase === 'survive_patrol') {
      // the raid already opened hostile_fire incidents inside the Helios protection volume —
      // responders are en route or fighting. Run toward their cover and shoot back at
      // whatever is chasing; the Hitch loses every joust above a Wasp.
      const responders = lawResponders(state);
      // the observation block above logs the beat — once it lands, the dock run is next
      if (beats.some(b => b.name === 'patrol_in_frame')) {
        input.fire = false; input.fireGroup = 0;
        phase = 'fly_dock'; phaseStart = t; continue;
      }
      responders.sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
      const dest = responders[0] || helios();
      if (dest) steerTo(dest, { arrivalRadius: 60 });
      // defensive fire at the closest pursuer while running
      const threats = (state.entityList || []).filter(e => e && e.alive !== false && e.id !== playerId
        && e.type === 'ship' && e.pos && dist(e.pos, player.pos) < 450 && isHostileToPlayer(e));
      threats.sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
      if (threats.length) aimAndFire(threats[0], 450);
      if (i % 90 === 0) log(`  survive dbg t=${t.toFixed(1)} resp=${responders.length} near=${threats.length ? threats[0].id : '-'} hull=${player.hull}`);
      if (t - phaseStart > 120) { phase = 'crime'; phaseStart = t; continue; }
    } else if (phase === 'defend') {
      // something is shooting us while we loiter — put responder guns between us and the
      // pursuer and return fire; only a failing hull turns it into a real run for the dock
      const threats = (state.entityList || []).filter(e => e && e.alive !== false && e.id !== playerId
        && e.type === 'ship' && e.pos && dist(e.pos, player.pos) < 900 && isHostileToPlayer(e));
      const hitUs = events.some(e => e.ev === 'combat:damage' && e.t > state.simTime - 12 && e.p && e.p.targetId === playerId);
      if (!threats.length && !hitUs) {
        phase = resumePhase || 'survive_patrol'; phaseStart = t; input.fire = false; continue;
      }
      threats.sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
      let cover = null;
      if ((player.hull || 0) >= 60) {
        for (const e of lawResponders(state)) {
          if (!cover || dist(e.pos, player.pos) < dist(cover.pos, player.pos)) cover = e;
        }
      }
      if (!cover) cover = helios();
      if (cover) steerTo(cover, { arrivalRadius: cover.type === 'station' ? 60 : 120 });
      const tgt = threats[0];
      if (tgt && dist(tgt.pos, player.pos) < 450) aimAndFire(tgt, 450);
      if (i % 90 === 0) log(`  defend dbg t=${t.toFixed(1)} tgt=${tgt ? `${tgt.id}:${tgt.data?.defId}` : 'unseen'} left=${threats.length}`);
      if (t - phaseStart > 60) { phase = resumePhase || 'survive_patrol'; phaseStart = t; }
    } else if (phase === 'crime') {
      // fallback when no raid responder ever enters the frame: one damaging hit on a lawful
      // ship inside the protection ring opens player_assault — the patrol answers the assault
      const inc = Object.values((state.lawSecurity && state.lawSecurity.incidents) || {});
      const mine = inc.find(x => x.attackerId === playerId);
      if (mine) { input.fire = false; phase = 'await_patrol'; phaseStart = t; continue; }
      const lawful = (state.entityList || []).filter(e => e && e.alive !== false && e.id !== playerId
        && e.type === 'ship' && e.pos && !isHostileToPlayer(e)
        && !(e.data && e.data.ai && e.data.ai.encounterRole === 'raider')
        && dist(e.pos, player.pos) < 1200);
      // prefer a slow hull — we only need one witnessed hit
      lawful.sort((a, b) => {
        const av = Math.hypot((a.vel || {}).x || 0, (a.vel || {}).z || 0);
        const bv = Math.hypot((b.vel || {}).x || 0, (b.vel || {}).z || 0);
        return (dist(a.pos, player.pos) + av * 4) - (dist(b.pos, player.pos) + bv * 4);
      });
      const victim = lawful[0];
      if (!victim) {
        if (i % 90 === 0) log(`  crime dbg t=${t.toFixed(1)} no lawful target near inc=${inc.length}`);
        if (t - phaseStart > 120) { log('no lawful target to assault'); phase = 'fail_crime'; break; }
        continue;
      }
      // stand OFF the hull — parked inside the victim's disc, shots never register entry
      const standoff = Math.max(170, (victim.radius || 0) + 130);
      const d = dist(victim.pos, player.pos);
      const ux = d > 1e-3 ? (player.pos.x - victim.pos.x) / d : 1;
      const uz = d > 1e-3 ? (player.pos.z - victim.pos.z) / d : 0;
      const off = (victim.vel || { x: 0, z: 0 });
      steerTo({ pos: { x: victim.pos.x + ux * standoff + off.x * 0.5, z: victim.pos.z + uz * standoff + off.z * 0.5 } }, { arrivalRadius: 20 });
      state.player.targetId = victim.id;
      const hv = victim.vel || { x: 0, z: 0 };
      const lead = d / 320;
      input.aimAngle = Math.atan2(victim.pos.z + hv.z * lead - player.pos.z, victim.pos.x + hv.x * lead - player.pos.x);
      input.fireGroup = 1;
      input.fire = d < 235;
      if (t - phaseStart > 120) { log('could not land a hit on the hauler'); phase = 'fail_crime'; break; }
    } else if (phase === 'await_patrol') {
      // wait for a law responder inside the composed frame (the observation block logs it)
      if (beats.some(b => b.name === 'patrol_in_frame')) { phase = 'fly_dock'; phaseStart = t; continue; }
      if (t - phaseStart > 40) { log('no patrol in frame'); phase = 'fail_patrol'; break; }
    } else if (phase === 'fly_dock') {
      const station = helios();
      if (!station) { phase = 'fail_station'; break; }
      const inR = events.slice().reverse().find(e => e.ev === 'dock:range');
      if (inR && inR.p && inR.p.inRange && inR.p.stationId === STATION) {
        clearAutopilot();
        const deny = resolveDockDeny(state, STATION);
        if (deny) { log('dock denied:', JSON.stringify(deny)); phase = 'fail_dockdeny'; break; }
        bus.emit('dock:attempt', { stationId: STATION });
        bus.emit('dock:docked', { stationId: STATION });
        state.ui.docked = true; state.ui.dockedStationId = STATION;
        docked = true;
        beat('dock', {});
        phase = 'docked'; phaseStart = t;
        continue;
      }
      steerTo(station, { arrivalRadius: 12 });
      if (t - phaseStart > 180) { log('never reached dock range'); phase = 'fail_dock'; break; }
    } else if (phase === 'docked') {
      // sell the sweep, then take the first-haul offer — Helios sells the S drive to the
      // hull in front of it with no Drive Tuning stop (stationShopOffer in ships.js)
      if (!bought) {
        const econ = runtime.getSystem('economy');
        const cargoItems = (state.player.cargo && state.player.cargo.items) || {};
        for (const [cid, qty] of Object.entries(cargoItems)) {
          try {
            const r = econ.execute && econ.execute(STATION, cid, 'sell', qty);
            log('sell', cid, qty, JSON.stringify(r));
          } catch (e) { log('sell err', cid, e.message); }
        }
        log('docked: credits', state.player.credits, 'cargo', JSON.stringify(cargoItems));
        const slots = buildSlotList(SHIPS.find(s => s.id === 'ship_kestrel'));
        const utilIdx = slots.findIndex(s => s.type === 'utility');
        bus.emit('ui:buyModule', { defId: SWING_DRIVE, fitSlotIndex: utilIdx });
        const owned = state.player.ownedShips[state.player.activeShipIndex || 0];
        const purchased = events.slice().reverse().find(e => e.ev === 'module:purchased' && e.p && e.p.defId === SWING_DRIVE);
        const fitted = !!(owned && Array.isArray(owned.fittings) && owned.fittings.includes(SWING_DRIVE));
        log('fittings', JSON.stringify(owned && owned.fittings), 'credits', state.player.credits, 'purchased', !!purchased, 'fitted', fitted);
        bought = true;
        // undock
        state.ui.docked = false; state.ui.dockedStationId = null;
        bus.emit('dock:undocked', { stationId: STATION });
        if (!(purchased && fitted)) { phase = 'fail_buy'; break; }
        beat('buy_fit', { defId: SWING_DRIVE, credits: state.player.credits });
        phase = 'undocked_verify'; phaseStart = t;
      }
    } else if (phase === 'undocked_verify') {
      if (t - phaseStart > 2) {
        const e = state.entities.get(playerId);
        const d = e && e.data && e.data.derived;
        log('derived.swingDrive =', d && d.swingDrive);
        if (d && d.swingDrive === true) { beat('undock_fitted', {}); phase = 'done'; }
        else { phase = 'fail_fit'; break; }
      }
    }

    await withFeatures(() => runtime.runTicks(1, DT));
    if (player.alive === false) {
      phase = 'fail_dead';
      log(`PLAYER DIED t=${state.simTime.toFixed(1)} hull=${player.hull} shield=${player.shield}`);
      break;
    }
    if (i % 3600 === 0) log(`..t=${state.simTime.toFixed(0)} phase=${phase} pos=(${player.pos.x.toFixed(0)},${player.pos.z.toFixed(0)})`);
  }

  // ordered-beat verdict — the required beats must appear as an in-order subsequence
  const names = beats.map(b => b.name);
  let needed = 0;
  for (const n of names) if (n === BEAT_ORDER[needed]) needed++;
  const ordered = needed === BEAT_ORDER.length && phase === 'done';
  return { beats, ordered, phase, events, credits: state.player.credits, docked, bought };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const result = await runOpeningSliceA6({ verbose: true });
  console.log('\n=== beats ===');
  for (const b of result.beats) console.log(`${b.t.toFixed(1)}s  ${b.name}`, JSON.stringify(b));
  console.log('final phase:', result.phase, 'ordered:', result.ordered, 'credits:', result.credits);
  process.exit(result.ordered ? 0 : 1);
}
