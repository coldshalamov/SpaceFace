// D38 diagnostic — Crucible swarm wave 1 vs a PASSIVE player, on the real production
// system set (headless authoritative runtime). The player drifts and never fires; the
// question is whether the pack presses within 400 WU and kills.
//
// Run: node tools/agentic/d38PassiveSwarm.mjs [seed]
//   D38_FIGHT_S=<sim-s>  — fight first: aim at the nearest hostile, fire, and weave for
//                        N sim-s before going passive (mirrors the demo-path pilot).

import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../../src/runtime/nodeSystemFactoryTable.js';
import { applyFeatureConfigToMaps, restoreFeatureMaps, snapshotFeatureMaps } from '../../src/data/featureFlags.js';
import { applyCombatLabSetup } from '../../src/ui/sandbox/sandboxSetup.js';
import { validateCombatLabSetup } from '../../src/contracts/combatLabSetupSchema.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../../src/systems/ships.js';
import { NEW_GAME } from '../../src/data/newGameDefaults.js';
import { COMBAT_LAB_STARTER_PACKAGES, COMBAT_LAB_ARENAS } from '../../src/data/combatLabSetups.js';
import { sectorLocalToGlobalForSector } from '../../src/data/sectorCoordinates.js';
import { getActivityOwnerEntities, ensureActivityClassified } from '../../src/world/activityRuntime.js';

const DT = 1 / 60;
const SEED = Number(process.argv[2] || 4242);
const MAX_SIM_S = Number(process.env.D38_MAX_S || 200);
const FIGHT_S = Number(process.env.D38_FIGHT_S || 0);

const lookup = getNodeSystemFactoryTable();
lookup.set('input', { name: 'input', init() {}, update() {}, destroy() {} });
const runtime = await createAuthoritativeRuntime({
  profileId: 'production', nodeSafeOnly: true, seed: SEED, systemLookup: lookup,
  exclusions: ['input:no-op-headless'],
});
const { state, bus } = runtime;
const ctx = {
  state, bus,
  registry: { get: (n) => runtime.getSystem(n) },
  helpers: runtime.getHelpers ? runtime.getHelpers() : null,
};

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
{
  const prev = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime?.config?.features);
  try { await runtime.getSystem('physics').prepareBackend(state, { reset: true }); }
  finally { restoreFeatureMaps(prev); }
}
runtime.runTicks(60, DT);

// ---- crucible launch leg (mirrors sandboxSetup §7d) ------------------------------
const starter = COMBAT_LAB_STARTER_PACKAGES.find(e => e.id === 'ricochet_runner');
const setupV = validateCombatLabSetup({
  schema: 'spaceface.combatLabSetup.v1',
  hullId: starter.hullId,
  loadout: starter.loadout.map(e => ({ slotIndex: e.slotIndex, defId: e.defId })),
  enemyPackageId: 'wasp_flight',
  arenaId: 'helios_core',
  seed: SEED,
  wave: 1,
});
if (!setupV.ok) { console.log('setup invalid', setupV.issues); process.exit(2); }
const setup = setupV.value;

bus.emit('run:beginRequested', {
  kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: 'helios_core', openingLesson: true,
});
applyCombatLabSetup(ctx, setup);
const arena = COMBAT_LAB_ARENAS.find(a => a.id === 'helios_core');
const worldSys = runtime.getSystem('world');
const globalPos = sectorLocalToGlobalForSector(arena.spawnPos, arena.sectorId);
worldSys.relocatePlayerInSector({ x: globalPos.x, z: globalPos.z, heading: 0 }, { reason: 'd38' });
bus.emit('run:loadoutReady', { source: 'crucible:launch', arenaId: 'helios_core' });
bus.emit('run:openingPrepareRequested', { source: 'crucible:launch' });

// passive player: zero the input packet every tick so the pilot drifts
const playerId = state.playerId;
const player = state.entities.get(playerId);
const input = state.input;
input.actions = input.actions || {};

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hostiles = () => (state.entityList || []).filter(e =>
  e && e.alive !== false && e.id !== playerId && e.data && e.data.ai
  && e.data.runCohort === 'survival-cohort' || (e && e.alive !== false && e.id !== playerId && e.data && e.data.ai && e.data.ai.forcePlayerTarget));

let shots = 0;
let shotsOnPlayer = 0;
bus.on('combat:fire', (p) => { if (p && p.ownerId !== playerId) shots++; });
bus.on('combat:hit', (p) => { if (p && (p.targetId === playerId || (p.victimId === playerId))) shotsOnPlayer++; });
bus.on('entity:damaged', (p) => { if (p && (p.entityId === playerId || p.targetId === playerId)) shotsOnPlayer++; });

let activeAt = null;
let packAt = null;   // first moment >2 hostiles exist (hold released)
let deathAt = null;
let edgeLogged = false;
const waspTrace = new Map();
const samples = [];

const totalTicks = Math.round(MAX_SIM_S / DT);
let weaveSign = 1;
for (let i = 0; i < totalTicks; i++) {
  // clear any leftover input so the pilot stays passive (or fights during FIGHT_S)
  input.moveZ = 0; input.moveX = 0; input.turnIntent = 0;
  input.fire = false;
  input.fireGroup = null;
  input.aimAngle = null;
  input.brake = false;
  for (const k of Object.keys(input.actions)) input.actions[k] = false;
  if (FIGHT_S > 0 && state.simTime < FIGHT_S) {
    const hs0 = hostiles();
    const tgt = hs0.length
      ? hs0.reduce((a, b) => dist(a.pos, player.pos) < dist(b.pos, player.pos) ? a : b)
      : null;
    if (tgt) {
      input.aimAngle = Math.atan2(tgt.pos.z - player.pos.z, tgt.pos.x - player.pos.x);
      input.fire = true;
    }
    if (process.env.D38_ESCAPE === '1') {
      // demo-path weave: fixed screen cursor -> fixed world heading -> straight-line escape
      input.aimAngle = 0;
      input.turnIntent = 0;
    } else if (tgt) {
      // helm-assist equivalent: nose chases the aim point
      const err = ((input.aimAngle - (player.rot || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
    }
    if (i % 96 === 0) weaveSign = -weaveSign;
    input.moveZ = 1;
    input.moveX = weaveSign;
  }
  if (process.env.D38_RETURN === '1' && state.simTime >= FIGHT_S) {
    // converge-on-the-swarm die mode (mirrors the probe fix): nose at the nearest
    // hostile, full thrust, brake once inside 250 WU
    const hs0 = hostiles();
    const tgt = hs0.length
      ? hs0.reduce((a, b) => dist(a.pos, player.pos) < dist(b.pos, player.pos) ? a : b)
      : null;
    if (tgt) {
      const d = dist(tgt.pos, player.pos);
      const aim = Math.atan2(tgt.pos.z - player.pos.z, tgt.pos.x - player.pos.x);
      const err = ((aim - (player.rot || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      input.aimAngle = aim;
      input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
      const spd = Math.hypot(player.vel.x, player.vel.z);
      if (d < 250 && spd > 8) input.brake = true;
      else input.moveZ = 1;
    }
  }
  runtime.step(DT);
  const run = state.run;
  if (activeAt == null && run && run.phase === 'active') activeAt = state.simTime;
  if (i % 60 === 0) {
    const hs = hostiles();
    const near = hs.filter(e => dist(e.pos, player.pos) < 400);
    const nearest = hs.length ? Math.min(...hs.map(e => dist(e.pos, player.pos))) : null;
    if (packAt == null && hs.length > 2) packAt = state.simTime;
    const phases = {};
    for (const e of hs) {
      const ph = e.data && e.data.ai && (e.data.ai.doctrinePhase || (e.data.ai.activity && e.data.ai.activity.kind) || '?');
      phases[ph] = (phases[ph] || 0) + 1;
    }
    samples.push({
      t: +state.simTime.toFixed(1), n: hs.length, near: near.length,
      nearest: nearest == null ? null : +nearest.toFixed(0),
      hull: +((player.hull ?? player.data?.hull?.current ?? NaN)).toFixed(0),
      shield: +((player.shield ?? player.data?.shield?.current ?? NaN)).toFixed(0),
      speed: player.vel ? +Math.hypot(player.vel.x, player.vel.z).toFixed(0) : null,
      phases, phase: run && run.phase, shots, hits: shotsOnPlayer,
    });
    // stall signature: live hostiles but none within 400 of the player — dump each survivor
    if (hs.length > 0 && near.length === 0 && state.simTime > (packAt || 0)) {
      for (const w of hs) {
        console.log('STALLER', JSON.stringify({
          t: +state.simTime.toFixed(1), id: w.id, d: +dist(w.pos, player.pos).toFixed(0),
          tier: w.activity && w.activity.simTier,
          pins: w.activity && w.activity.pins,
          activity: w.data.ai && w.data.ai.activity,
          doctrine: w.data.ai && (w.data.ai.combatDoctrineId || w.data.ai.doctrinePhase),
          roe: w.data.ai && w.data.ai.roe,
          hostile: w.data.ai && w.data.ai.hostile,
          passive: w.data.ai && w.data.ai.passive,
          sleeping: !!w.physicsSleeping,
          type: w.type, pos: { x: +w.pos.x.toFixed(0), z: +w.pos.z.toFixed(0) },
        }));
      }
    }
    // catch the demotion edge: identity-swap or stamp-loss on EVERY hostile, every tick
    if (packAt != null && state.simTime >= packAt && hs.length) {
      for (const w of hs) {
        const mapObj = state.entities.get(w.id);
        const act = w.activity;
        const key = `${w.id}`;
        if (!waspTrace.has(key)) {
          waspTrace.set(key, { firstT: state.simTime, obj: w, stamped: act != null });
        }
        const tr = waspTrace.get(key);
        const swapped = tr.obj !== w;
        const lostStamp = tr.stamped && act == null;
        const mapDiff = mapObj !== w;
        const neverStamped = act == null && !tr.stamped && !tr.loggedNever;
        if (neverStamped) tr.loggedNever = true;
        if ((swapped || lostStamp || mapDiff || neverStamped) && !tr.logged) {
          tr.logged = true;
          const r = ensureActivityClassified(state);
          console.log('EDGE', JSON.stringify({
            t: +state.simTime.toFixed(2), id: w.id, swapped, lostStamp, mapDiff, neverStamped,
            actTier: act ? act.simTier : null,
            seen: r.seenEntityIds && r.seenEntityIds.has(w.id),
            sig: r.signaturesById && r.signaturesById.get(w.id),
            hasBody: !!w.physicsBody,
            exact: r.exactIds.includes(w.id), near: r.nearIds.includes(w.id),
            abstract: r.abstractIds.includes(w.id), dormant: r.dormantIds.includes(w.id),
            mode: r.classifyMode,
            desc: (() => { const d = Object.getOwnPropertyDescriptor(w, 'activity'); return d ? `enum:${d.enumerable} write:${d.writable}` : 'none'; })(),
          }));
        }
        if (act != null) tr.stamped = true;
      }
    }
    // deep-dive one wasp every 5 sim-s after the pack arrives
    if (packAt != null && state.simTime >= packAt && i % 300 === 0 && hs.length) {
      const w = hs.reduce((a, b) => dist(a.pos, player.pos) < dist(b.pos, player.pos) ? a : b);
      const stack = runtime.getSystem('tacticalAI') && runtime.getSystem('tacticalAI').stack;
      const decisions = stack && stack.lastResult && stack.lastResult.decisions || [];
      const dec = decisions.find(d => d && d.entityId === w.id);
      const inDecisions = decisions.some(d => d && d.entityId === w.id);
      const ownerList = getActivityOwnerEntities(state, 'ai');
      const inOwnerSet = Array.isArray(ownerList) ? ownerList.includes(w) : (ownerList && typeof ownerList.has === 'function' ? ownerList.has(w) : null);
      const art = ensureActivityClassified(state);
      const inExact = art && art.exactIds ? art.exactIds.includes(w.id) : null;
      const inDormant = art && art.dormantIds ? art.dormantIds.includes(w.id) : null;
      const aimErr = (w.data && w.data.intent && Number.isFinite(w.data.intent.aimAngle))
        ? +(((w.data.intent.aimAngle - w.rot + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 180 / Math.PI).toFixed(1)
        : null;
      if (stack && stack.maneuver && !stack.maneuver.trace) {
        stack.maneuver.trace = { emit: (e) => {
          if (e && e.entityId === w.id && e.context) {
            console.log('PLAN', JSON.stringify({ t: +state.simTime.toFixed(2), id: e.entityId,
              angleErr: +(e.context.angleError * 180 / Math.PI).toFixed(1),
              faceTarget: e.context.faceTarget, obst: e.context.obstacleAvoidance,
              headingDeg: Number.isFinite(e.context.heading) ? +(e.context.heading * 180 / Math.PI).toFixed(0) : null,
              targetId: e.context.targetId,
              speed: +e.context.speed.toFixed(1), rawTorque: +e.context.rawTorqueYaw.toFixed(2),
              reason: e.selected && e.selected.reason, kind: e.selected && e.selected.kind }));
          }
        } };
      }
      const minsp = stack && stack.maneuver && typeof stack.maneuver.inspect === 'function'
        ? stack.maneuver.inspect(w.id) : null;
      const lastReq = minsp && minsp.lastRequest;
      const bearing = Math.atan2(player.pos.z - w.pos.z, player.pos.x - w.pos.x) * 180 / Math.PI;
      const headErr = lastReq && Number.isFinite(lastReq.targetHeading)
        ? +(((lastReq.targetHeading * 180 / Math.PI) - bearing + 540) % 360 - 180).toFixed(1)
        : null;
      console.log('WASP', JSON.stringify({
        t: +state.simTime.toFixed(1), d: +dist(w.pos, player.pos).toFixed(0),
        rot: +((w.rot || 0) * 180 / Math.PI).toFixed(0), aimErr,
        wvel: w.vel ? +Math.hypot(w.vel.x, w.vel.z).toFixed(0) : null,
        inDecisions, inOwnerSet, inExact, inDormant,
        bearingToPlayer: +bearing.toFixed(0),
        maneuver: lastReq && { kind: lastReq.kind, reason: lastReq.reason,
          targetHeading: +(lastReq.targetHeading * 180 / Math.PI).toFixed(0),
          headErrVsPlayer: headErr, torque: lastReq.torqueYaw },
        rawActivity: w.activity ? { tier: w.activity.simTier, pres: w.activity.presentationTier, pins: w.activity.pins, next: w.activity.nextEventAtT } : String(w.activity),
        ai: w.data.ai && {
          roe: w.data.ai.roe, passive: w.data.ai.passive,
          cohortRecipe: w.data.ai.cohortRecipe, fodderRecipe: w.data.ai.fodderRecipe,
          squadRecipe: w.data.ai.squadRecipe, squadId: w.data.ai.squadId,
          allowPassiveManeuver: w.data.ai.allowPassiveManeuver,
          factionPresenceDoctrine: w.data.ai.factionPresenceDoctrine != null,
          activity: w.data.ai.activity, doctrine: w.data.ai.combatDoctrineId,
          forcePlayerTarget: w.data.ai.forcePlayerTarget, huntPlayer: w.data.ai.huntPlayer,
          engagementTrigger: w.data.ai.engagementTrigger, hostile: w.data.ai.hostile,
          team: w.team,
        },
        combat: w.data.combat,
        intent: w.data.intent,
        weapons: (w.data.weapons || []).map(x => ({ id: x.defId || x.id, cd: x._cooldown, heat: x._heat, face: x.facingAngle, gimbal: x.gimbalArc })),
        cap: w.cap, sleeping: w.physicsSleeping,
        decision: dec && {
          actionId: dec.actionId, allowedActionId: dec.allowedActionId,
          doctrine: dec.combatDoctrine && { id: dec.combatDoctrine.doctrineId, phase: dec.combatDoctrine.phase, fireWindow: dec.combatDoctrine.fireWindow, maneuverKind: dec.combatDoctrine.maneuverKind },
          keys: Object.keys(dec),
        },
        activityTier: w.activity && { tier: w.activity.simTier, kind: w.activity.kind, next: w.activity.nextEventAtT },
        flags: w.flags, alive: w.alive,
      }));
    }
  }
  if (player.alive === false || (player.hull != null && player.hull <= 0)) { deathAt = state.simTime; break; }
  if (run && (run.phase === 'ended' || run.phase === 'victory' || run.phase === 'results')) break;
}

const postHold = samples.filter(s => packAt != null && s.t >= packAt);
const covered = postHold.filter(s => s.near > 0).length;
console.log(JSON.stringify({
  seed: SEED, activeAt, packAt, deathAt,
  playerHull0: 260, hullField: player.hull, keys: Object.keys(player),
  postHoldSamples: postHold.length, inFramePct: postHold.length ? +(100 * covered / postHold.length).toFixed(0) : null,
}, null, 1));
for (const s of samples) console.log(JSON.stringify(s));
runtime.dispose && runtime.dispose();
