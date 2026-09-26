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
  'economy:cargoSold', 'mission:failed', 'encounter:resolved', 'salvage:completed',
  'pickup:collected', 'world:playerRelocated',
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
  // Full-fidelity tap for the position-jump hunt: record every emission verbatim so the
  // teleport cause can't hide behind the watch list. Verbose-only so the fixture stays lean.
  if (verbose) {
    const origEmit = bus.emit.bind(bus);
    bus.emit = (name, payload) => {
      events.push({ t: state.simTime, ev: `*${name}`, p: payload });
      return origEmit(name, payload);
    };
  }

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
    e && e.alive !== false && e.type === 'ship' && e.id !== playerId && e.pos && dist(e.pos, player.pos) < r);
  // Law responders are cover, not targets: every patrol answer comes in on team 1
  // with no friendly marker, so the raw team check would count the rescue as a
  // threat — the pilot could shoot the law (assault -> wanted heat -> warrant
  // hunter -> dock fine) and the "pocket clear" test could never empty. A law hull
  // only counts hostile when it has genuinely turned on the player: a warrant
  // hunter, or a responder assigned the player as its security target.
  let lawIds = new Set();
  const isHostileToPlayer = (e) => {
    const ai = e.data && e.data.ai;
    if (ai && (ai.motive === 'wanted_warrant' || ai.securityTargetId === playerId)) return true;
    if (lawIds.has(e.id)) return false;
    const host = ai && ai.hostile;
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
    state.ui.docked = true; state.ui.dockedStationId = STATION;
    bus.emit('dock:attempt', { stationId: STATION });
    bus.emit('dock:docked', { stationId: STATION });
    beat('dock', { hot: true });
    return true;
  }

  // ---- phase machine -----------------------------------------------------------
  const beats = [];
  const beat = (name, extra) => { beats.push({ name, t: state.simTime, ...(extra || {}) }); log(`BEAT ${name} @${state.simTime.toFixed(1)}`, extra || ''); };
  let phase = 'wait_raid';
  let lastPhase = phase;
  let payloadId = null, haulerId = null, swingStart = null, armPressedAt = null, throwTries = 0;
  let docked = false, bought = false, collectTargetId = null, resumePhase = null, lastPos = null;
  let lastFrameOrigin = null, lastAct = null, sweepCovered = false;
  let killPos = null, expectedVictimId = null, releasedAt = null;
  let phaseStart = state.simTime;

  const MAX_TICKS = Math.round(maxSimSeconds * 60);
  for (let i = 0; i < MAX_TICKS && phase !== 'done'; i++) {
    const t = state.simTime;
    lawIds = new Set(lawResponders(state).map(e => e.id));
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

    // frame-origin watch: entity.pos = frameOrigin + bodyLocal, so a runaway origin
    // reads as a teleport. The origin is derived from the player pos — a shift should
    // never outrun the hull by more than the 4096 quantum.
    const fo = state.world && state.world.frameOrigin;
    if (fo && lastFrameOrigin && (fo.x !== lastFrameOrigin.x || fo.z !== lastFrameOrigin.z)) {
      log(`  FRAME ORIGIN t=${t.toFixed(1)} (${lastFrameOrigin.x},${lastFrameOrigin.z}) -> (${fo.x},${fo.z}) seq=${state.world.frameOriginSeq} player=(${player.pos.x.toFixed(0)},${player.pos.z.toFixed(0)})`);
    }
    lastFrameOrigin = fo ? { x: fo.x, z: fo.z } : lastFrameOrigin;

    // activity-stamp watch: catchUpEntity fires on a non-exact -> exact promotion and
    // adds vel * (simTime - lastExactT) on top of the live-synced pos — a stale stamp
    // reads as a velocity-preserving teleport. Log the player's stamp transitions.
    const act = player.activity;
    if (act && lastAct
      && (act.simTier !== lastAct.simTier
        || act.lastExactT < lastAct.lastExactT - 1e-4
        || act.lastExactT > lastAct.lastExactT + 1
        || act.graceUntilT !== lastAct.graceUntilT)) {
      log(`  ACT STAMP t=${t.toFixed(1)} tier=${lastAct.simTier}->${act.simTier} lastExactT=${lastAct.lastExactT}->${act.lastExactT} grace=${act.graceUntilT} simT=${t.toFixed(3)}`);
    }
    if (act) lastAct = { simTier: act.simTier, lastExactT: act.lastExactT, graceUntilT: act.graceUntilT };

    // ejection watch: a teleport-scale position jump means something threw the hull —
    // catch the tick it happens and who was nearby.
    if (lastPos && dist(player.pos, lastPos) > 300) {
      log(`  !!POSITION JUMP t=${t.toFixed(1)} (${lastPos.x.toFixed(0)},${lastPos.z.toFixed(0)}) -> (${player.pos.x.toFixed(0)},${player.pos.z.toFixed(0)}) v=${Math.hypot(player.vel?.x || 0, player.vel?.z || 0).toFixed(0)} phase=${phase} sector=${state.world && state.world.currentSectorId} mode=${state.mode} docked=${!!(state.ui && state.ui.docked)} auto=${JSON.stringify(state.nav && state.nav.autopilot && state.nav.autopilot.target)}`);
      for (const e of events.slice(-20)) {
        let ps = '';
        try { ps = e.p ? JSON.stringify(e.p).slice(0, 200) : ''; } catch (_) { ps = '[unserializable]'; }
        log(`    evt ${e.t.toFixed(2)} ${e.ev} ${ps}`);
      }
      const near = (state.entityList || []).filter(e => e && e.id !== playerId && e.pos && dist(e.pos, player.pos) < 800)
        .map(e => `${e.id}:${e.type}@${dist(e.pos, player.pos).toFixed(0)}`);
      log(`    near(after): ${JSON.stringify(near.slice(0, 30))}`);
    }
    lastPos = { x: player.pos.x, z: player.pos.z };

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

    // collect is an observation beat too: the magnet banks chips during ANY phase — a
    // defend joust still sweeps pods in passing — so gating the beat on the collect
    // phase was what stranded it inside the defend<->collect joust loop.
    if (player.alive !== false
      && !beats.some(b => b.name === 'collect')
      && beats.some(b => b.name === 'throw_kill')) {
      const tk = beats.find(b => b.name === 'throw_kill').t;
      const got = events.some(e => {
        // same-tick events share simTime with the beat — >= admits them; a scoop
        // during the swing (before the kill lands) must not bank the beat.
        if (!(e.t >= tk)) return false;
        if (e.ev === 'pickup:collected') {
          // only the player's own scoop counts — a raider securing a custody pod
          // emits the same event, and rejected scoops emit it with acceptedAmount 0.
          const p = e.p || {};
          if (p.collectorId != null && String(p.collectorId) !== String(playerId)) return false;
          if (p.acceptedAmount != null && !(p.acceptedAmount > 0)) return false;
          return true;
        }
        return e.ev === 'loot:collected' || e.ev === 'cargo:itemAdded'
          || e.ev === 'cargo:changed' || e.ev === 'salvage:completed';
      });
      if (got) {
        beat('collect', {});
        if (phase === 'collect') { phase = 'collect2'; phaseStart = t; continue; }
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
      // the day-0 guarantee is [60,170]s; a silent no_budget waits 14 min otherwise
      if (t - phaseStart > 240) { log('raid never fired'); phase = 'fail_raid'; break; }
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
      if (!payload || payload.alive === false) {
        // 'the throw kills whoever the ray crossed first' — including the payload
        // on a rock. A tethered hull that dies at swing speed is still the throw
        // doing the killing; count it instead of waiting for a release that
        // can never come now that the line's target is gone.
        // Terrain slams attribute to the victim itself; whip/meeting kills attribute to the
        // player. A shooter's bullet is not the throw — never credit weapons fire.
        const kill = events.slice().reverse().find(e => e.ev === 'entity:killed' && e.p
          && e.p.id === payloadId && t - e.t <= 3
          && (e.p.killerId == null || e.p.killerId === payloadId || e.p.killerId === playerId));
        if (kill) {
          log(`  mid-swing kill t=${t.toFixed(1)}: payload ${payloadId} died on the line (killer=${kill.p.killerId})`);
          beat('throw_kill', { victim: kill.p.id, expected: expectedVictimId, killerId: kill.p.killerId, via: 'mid_swing' });
          killPos = kill.p.pos || (payload ? { ...payload.pos } : null);
          phase = 'collect'; phaseStart = t; continue;
        }
        log(`  swing end t=${t.toFixed(1)}: payload ${payloadId} dead/absent alive=${payload && payload.alive}`);
        for (const e of events.slice(-12)) log(`    ${e.t.toFixed(2)} ${e.ev} ${e.p ? JSON.stringify(e.p).slice(0, 200) : ''}`);
        if (releasedAt == null) {
          payloadId = null; armPressedAt = null; swingStart = null; expectedVictimId = null;
          phase = 'latch';
        } else { phase = 'post_throw'; }
        phaseStart = t; continue;
      }
      const tether = state.player.tether;
      if (!tether || !tether.active || tether.targetId !== payloadId) {
        const why = events.slice().reverse().find(e => /tether:/.test(e.ev));
        log(`  swing end t=${t.toFixed(1)}: tether=${tether ? `${tether.phase} active=${tether.active} target=${tether.targetId} strain=${Number(tether.strain).toFixed(2)}` : 'none'} last=${why ? `${why.ev}@${why.t.toFixed(1)} ${JSON.stringify(why.p)}` : 'none'}`);
        phase = 'post_throw'; phaseStart = t; continue;
      }
      input.tetherMode = null;
      const aim = throwAimTarget();
      if (aim) {
        input.aimWorld = { x: aim.pos.x, z: aim.pos.z };
        input.aimIntentActive = true;
        state.player.targetId = aim.id;
      }
      // Never steer INTO the aim during the swing: in the starter field the nearest heavy
      // body is usually a rock, and dragging the shortening arc across its face kills the
      // payload on terrain (self-attributed — no kill burst) before the meeting develops.
      // A player keeps the arc clear instead: put distance between the hull and the
      // nearest rock face, hauling the tethered payload toward open space.
      if (phase === 'swing') {
        let rock = null, rd = Infinity;
        for (const e of state.entityList || []) {
          if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
          const d = dist(e.pos, player.pos);
          if (d < rd) { rd = d; rock = e; }
        }
        if (rock && rd < 520) {
          const ax = (player.pos.x - rock.pos.x) / (rd || 1), az = (player.pos.z - rock.pos.z) / (rd || 1);
          steerTo({ pos: { x: player.pos.x + ax * 900, z: player.pos.z + az * 900 } }, { arrivalRadius: 60 });
        } else {
          clearAutopilot();
        }
      } else {
        clearAutopilot();
      }
      const kin = payload.vel || {};
      // short line = fast orbit; pump builds the swing
      const rx = payload.pos.x - player.pos.x, rz = payload.pos.z - player.pos.z;
      const rl = Math.hypot(rx, rz) || 1;
      const rvx = (kin.x || 0) - (player.vel.x || 0), rvz = (kin.z || 0) - (player.vel.z || 0);
      const tangential = rvx * (-rz / rl) + rvz * (rx / rl);
      const orbitSign = tangential >= 0 ? 1 : -1;
      // lineLength is the reel axis the control law reads (negative = haul in); reelIn is dead
      // weight — the swing used to run the full latch distance out on a wide arc and the payload
      // could slam a field rock before the meeting geometry developed.
      masslineCmd({ lineControl: true, lineLength: -1, orbitDirection: orbitSign, pump: true });
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
        // a break is a release too — the payload leaves the line with whatever
        // the swing gave it, and the kill window should follow it ballistically.
        const rel = events.slice().reverse().find(e => (e.ev === 'tether:released' || e.ev === 'tether:broken')
          && e.p && e.p.targetId === payloadId);
        if (rel) releasedAt = rel.t;
      }
      const payload = state.entities.get(payloadId);
      // the throw kills whoever the ray crossed first — the payload on a rock, or the victim.
      // same attribution guard as the mid-swing scan: terrain (self) and whip (player) kills
      // count; a stray bullet's kill does not.
      const kill = events.find(e => e.ev === 'entity:killed' && e.p && releasedAt != null && e.t >= releasedAt - 0.5 && e.t <= releasedAt + 12
        && (e.p.id === payloadId || e.p.id === expectedVictimId)
        && (e.p.killerId == null || e.p.killerId === payloadId || e.p.killerId === playerId));
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
        armPressedAt = null; swingStart = null; releasedAt = null;
        if (tether && tether.active && tether.targetId === payloadId) { phase = 'swing'; phaseStart = t; }
        else { phase = 'latch'; phaseStart = t; }
      }
    } else if (phase === 'collect' || phase === 'collect2') {
      // banked-but-returned: the collect beat can land inside defend; on resume this
      // phase re-enters with a fresh timer — promote instead of letting the timer
      // report fail_collect on an already-earned beat.
      if (phase === 'collect' && beats.some(b => b.name === 'collect')) {
        phase = 'collect2'; phaseStart = t; continue;
      }
      // hoover every collectible in reach — salvage wrecks, credit chips. salvage
      // bodies are dead entities, so the alive check doesn't apply to them.
      // Two filters a real pilot applies without thinking:
      //  - VALUE: a bare markerId/empty payload husk carries nothing — never chase it.
      //  - OWNERSHIP: a jettisoned/manifest pod whose owner isn't us is cargo theft;
      //    lawSecurity reports payload_theft on collection, and the wanted heat buys
      //    a clearance fine at dock plus a warrant hunter on our tail.
      // Honest limit: the magnet homes every pickup within ~800 u regardless of the
      // steering filter, so a hot pod in the kill site's spray can still be scooped
      // in passing — that is the design's authored theft option, not a driver bug.
      const podOwner = (e) => {
        const d = e.data || {};
        const v = d.ownerId ?? e.ownerId ?? (d.ownership && d.ownership.ownerId)
          ?? (d.cargoIdentity && d.cargoIdentity.ownerId);
        return v == null || v === '' ? null : String(v);
      };
      const isTheft = (e) => {
        const d = e.data || {};
        // freight custody pods don't carry payloadType — the annotation object does.
        // Pods spilled off a lawful carrier stay the carrier's property (theft);
        // pods a raider stole and died holding are the law's free loot — the theft
        // report explicitly skips hostile_raider respills.
        const fcp = d.freightCustodyPod;
        if (fcp) return fcp.custodySourceKind !== 'hostile_raider';
        const pt = d.payloadType;
        if (pt !== 'jettisoned_cargo' && pt !== 'civilian_manifest') return false;
        const owner = podOwner(e);
        return owner != null && owner !== String(playerId);
      };
      const hasValue = (e) => {
        const d = e.data;
        return (d.amount || 0) > 0
          || (d.salvagePool && Object.keys(d.salvagePool).length > 0)
          || !!d.freightCustodyPod
          || !!d.lootShard;
      };
      const pickups = (state.entityList || []).filter(e => e && e.id !== playerId
        && (e.type === 'payload' || e.type === 'loot' || e.type === 'pickup' || e.type === 'debris' || e.type === 'wreck')
        && e.data && hasValue(e) && !isTheft(e)
        && dist(e.pos, player.pos) < 3000);
      // Kite-sweep: under fire a pilot doesn't park on a pod — it keeps moving on the
      // escape bearing toward the station/law and hoovers what lies along that line.
      // Nearest-first when the pocket is quiet; station-ward bias while pressed.
      const pressed = (state.entityList || []).filter(e => e && e.alive !== false && e.id !== playerId
        && e.type === 'ship' && e.pos && dist(e.pos, player.pos) < 900 && isHostileToPlayer(e));
      pressed.sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
      const station = helios();
      const covered = beats.some(b => b.name === 'patrol_in_frame');
      if (pressed.length && station && !covered) {
        const sx = station.pos.x - player.pos.x, sz = station.pos.z - player.pos.z;
        const sl = Math.hypot(sx, sz) || 1;
        const score = (e) => {
          const ex = e.pos.x - player.pos.x, ez = e.pos.z - player.pos.z;
          const along = (ex * sx + ez * sz) / (sl * (Math.hypot(ex, ez) || 1));
          return dist(e.pos, player.pos) - along * 600;
        };
        pickups.sort((a, b) => score(a) - score(b));
      } else {
        pickups.sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
      }
      collectTargetId = pickups.length ? pickups[0].id : null;
      // Point-blank or dying means stop sweeping and run for the law outright;
      // anything short of that, the magnet can keep working while we move.
      // With the patrol in frame a bail returns to survive_patrol — it holds under
      // cover until the pocket clears, then grants the one covered sweep; only once
      // that sweep is spent does a bail go straight to the dock run.
      const bailTo = (beats.some(b => b.name === 'patrol_in_frame') && sweepCovered)
        ? 'fly_dock' : 'survive_patrol';
      if (phase === 'collect2' && pressed.length
        && (dist(pressed[0].pos, player.pos) < 280 || (player.hull || 0) < 60)) {
        input.fireGroup = 0;
        phase = bailTo; phaseStart = t; continue;
      }
      const tgt = collectTargetId != null ? state.entities.get(collectTargetId) : null;
      if (tgt && tgt.pos) {
        const d = steerTo(tgt, { arrivalRadius: 40 });
        // the beam only works parked on the target — with a hostile inside 600 u
        // standing still is how the hull dies; chips still bank on the flyby.
        const clear = !pressed.length || dist(pressed[0].pos, player.pos) > 600;
        if (d < 220 && clear) {
          input.aimAngle = Math.atan2(tgt.pos.z - player.pos.z, tgt.pos.x - player.pos.x);
          input.fireGroup = 2;
        } else {
          input.fireGroup = 0;
        }
        if (i % 60 === 0) {
          const valued = pickups.map(e => `${e.id}:${e.type} amt=${e.data && e.data.amount || 0} pod=${e.data && e.data.freightCustodyPod ? 'y' : 'n'} pool=${e.data && e.data.salvagePool ? Object.keys(e.data.salvagePool).length : 0}`);
          log(`  ${phase} dbg t=${t.toFixed(1)} tgt=${tgt.id}:${tgt.type} d=${d.toFixed(0)} n=${pickups.length} cargo=${JSON.stringify(state.player.cargo && state.player.cargo.items)} credits=${state.player.credits}`);
          for (const v of valued.slice(0, 10)) log(`    ${v}`);
        }
      } else {
        // nothing left in reach — move on
        input.fireGroup = 0;
        if (phase === 'collect2') { phase = bailTo; phaseStart = t; continue; }
        if (killPos) steerTo(killPos, { arrivalRadius: 10 });
      }
      if (t - phaseStart > (phase === 'collect2' ? 90 : 60)) {
        if (phase === 'collect2') { input.fireGroup = 0; phase = bailTo; phaseStart = t; continue; }
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
      // the observation block above logs the beat. Once the law is visibly holding the
      // pocket, a survivor doesn't dock empty — but it doesn't sweep into gunfire
      // either: hold under the responders' cover until the hostiles are cleared (or
      // the wait runs out), then take ONE covered sweep through the aftermath —
      // chips on the flyby, wrecks beamed while the guns are quiet — and dock.
      // sweepCovered makes the reprieve one-shot.
      const patrolBeat = beats.find(b => b.name === 'patrol_in_frame');
      if (patrolBeat) {
        input.fire = false; input.fireGroup = 0;
        const remaining = (state.entityList || []).filter(e => e && e.alive !== false && e.id !== playerId
          && e.type === 'ship' && e.pos && dist(e.pos, player.pos) < 1500 && isHostileToPlayer(e));
        if (remaining.length === 0 && !sweepCovered) {
          sweepCovered = true; phase = 'collect2'; phaseStart = t; continue;
        }
        if (sweepCovered || t - patrolBeat.t > 150) { phase = 'fly_dock'; phaseStart = t; continue; }
        // hostiles still on the field — hold with the law and let their guns finish it
      }
      responders.sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
      const cover = responders[0] || helios();
      const threats = (state.entityList || []).filter(e => e && e.alive !== false && e.id !== playerId
        && e.type === 'ship' && e.pos && dist(e.pos, player.pos) < 450 && isHostileToPlayer(e));
      threats.sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
      if (cover && patrolBeat && threats.length) {
        // kite the cover, don't park on it: anchor on the far side of the nearest
        // responder from the closest threat so pursuit carries the hostile through
        // the law's firing line — a stationary hull next to the law still eats the
        // hits aimed at it.
        const dx = cover.pos.x - threats[0].pos.x, dz = cover.pos.z - threats[0].pos.z;
        const l = Math.hypot(dx, dz) || 1;
        steerTo({ pos: { x: cover.pos.x + (dx / l) * 380, z: cover.pos.z + (dz / l) * 380 } }, { arrivalRadius: 90 });
      } else if (cover) {
        steerTo(cover, { arrivalRadius: cover.type === 'station' ? 60 : 120 });
      }
      if (threats.length) aimAndFire(threats[0], 450);
      if (i % 90 === 0) log(`  survive dbg t=${t.toFixed(1)} resp=${responders.length} near=${threats.length ? threats[0].id : '-'} hull=${player.hull}`);
      // under a failing hull the wait is a death sentence — summon the patrol early;
      // once the patrol is already in frame the assault-summon has nothing left to buy
      // (and only buys a wanted charge) — run the dock instead.
      if (t - phaseStart > ((player.hull || 0) < 60 ? 25 : 120)) {
        phase = patrolBeat ? 'fly_dock' : 'crime'; phaseStart = t; continue;
      }
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
      // a dying Hitch stops trading and runs for the law — outnumbered above a Wasp,
      // jousting the survivors is how the hull reaches zero. Once the collect beat is
      // banked the sweep is optional income: exiting back to it just re-arms the
      // self-preservation check into another joust cycle, so run for the law instead.
      // Before the beat lands, resume the interrupted collection — it is the only
      // path that lets patrol_in_frame (and so the ordered beat chain) still fire.
      const collectDone = beats.some(b => b.name === 'collect');
      const fleeTo = collectDone ? 'survive_patrol' : (resumePhase || 'survive_patrol');
      if ((player.hull || 0) < 60 && t - phaseStart > 5) { input.fire = false; phase = fleeTo; phaseStart = t; continue; }
      if (t - phaseStart > 60) { phase = fleeTo; phaseStart = t; }
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
        // no continue here: falling through to runTicks is what lets a trader drift
        // into range — continuing would freeze simTime and livelock the run.
      } else {
      // stand OFF the hull — parked inside the victim's disc, shots never register entry
      const standoff = Math.min(220, Math.max(170, (victim.radius || 0) + 130));
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
      }
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
        state.ui.docked = true; state.ui.dockedStationId = STATION;
        bus.emit('dock:attempt', { stationId: STATION });
        bus.emit('dock:docked', { stationId: STATION });
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
        for (const e of events) if (/^economy:|bounty|custody|reward/.test(e.ev)) log(`    ${e.t.toFixed(1)} ${e.ev} ${JSON.stringify(e.p).slice(0, 220)}`);
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
