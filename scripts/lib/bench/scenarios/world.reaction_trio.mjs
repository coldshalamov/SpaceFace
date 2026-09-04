// scripts/lib/bench/scenarios/world.reaction_trio.mjs — B10 "The world reacts", on the REAL path.
//
// THE REAL-PATH LAW (taste director, binding): "A scenario that integrates its own physics is not a
// measurement." This module integrates nothing and spawns none of the reactions it claims to observe.
// It boots the full PRODUCTION node-safe manifest (`createAuthoritativeRuntime({ profileId:
// 'production', nodeSafeOnly: true })`) with the live `rapier-dynamic` authority, enters a real
// sector so the real stations, the real patrol and the real civilian traffic materialize, then
// causes ONE real thing per clause and watches the live systems with a structural observer.
//
// It deliberately does NOT boot through `scripts/lib/bench/realPath.mjs` (CONTACT's shared helper):
// `bootRealPath` takes a FOCUSED explicit system list, and a focused list cannot materialize a
// sector — no `world` system means no stations, no jurisdiction, no traffic, and therefore nothing
// for the world to react WITH. The full production manifest is strictly more real path than a
// focused list, and this module imports `realPathProof` from that same helper so its metrics carry
// the identical proof object. A stand-in would report `sg02Ready: false` / `backend: 'none'`.
//
// ── The two harness traps this module is hardened against (campaign-wide, found by FORCE) ────────
// TRAP 1 — RESIDENCY. SG-02 gives a Rapier body only to entities the activity classifier keeps
//   inside the player's physics reach (`physicsReachWu`, ~750 WU here). An actor outside it is
//   S2_ABSTRACT/S3_DORMANT: it silently never moves and every derived number reads zero. A clean
//   table of zeros is the worst failure mode in this campaign, so every clause STAGES ITSELF INSIDE
//   THE RING (the player is moved to the event, never the event to the player's spawn point) and
//   then ASSERTS a live body for every actor it depends on. A missing body reports
//   `unmeasured: true` — which is a different answer from "never", and says so in the bar note.
// TRAP 2 — FEATURE FLAGS. `createAuthoritativeRuntime` applies the profile's feature config to the
//   process-global flag MAPS only inside `init` and `step`/`runTicks`, and restores them after.
//   Anything this module does BETWEEN ticks — `physics.prepareBackend`, every `bus.emit` — reads the
//   PROCESS DEFAULTS (all false), so a flag-gated listener is silently a no-op and SG-02 gets built
//   with contact capture permanently OFF (the a82158c8 bug). Every such call here goes through
//   `withFeatures()`, which snapshots, applies `runtime.config.features`, and restores exactly as
//   the runtime does.
//
// Vision sentences under test:
//   B10a "Maybe the patrol that was protecting it has to choose between chasing the attacker and
//         staying with the wreck."
//   B10b "A scavenger appears after something goes wrong."
//   B10c "The civilian hauler panics."
//
// Determinism: fixed seed in, `state.rng`/`state.simTime` only, no wall clock, no `Math.random`.
// Every position this module chooses is derived from the live sector's own entity ordering, so two
// runs of the same seed observe the same world.

import { createAuthoritativeRuntime } from '../../../../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../../../../src/systems/ships.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../../../../src/data/featureFlags.js';
import { realPathProof } from '../realPath.mjs';

const DT = 1 / 60;
const SECTOR_ID = 'sector_helios_prime';

/** B10 clause deadlines, in player units (seconds). From design/FEEL_CONTRACT.md bar B10. */
export const B10A_DEADLINE_S = 10;
export const B10B_DEADLINE_S = 30;
export const B10C_DEADLINE_S = 3;

/** How close an NPC must come to a spilled pod before we call it "arrived", in WU. */
const SALVOR_ARRIVAL_WU = 120;
/** Gunfire this far from a civilian must move it (B10c radius). */
const VIOLENCE_RADIUS_WU = 300;
/** A course change we would call visible from the chase camera: ~11 degrees of heading. */
const COURSE_CHANGE_RAD = 0.2;
/** How far the player stands off the event it is watching. Well inside the ~750 WU physics reach. */
const WITNESS_STANDOFF_WU = 200;

const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
const dist = (a, b) => Math.hypot(finite(a && a.x) - finite(b && b.x), finite(a && a.z) - finite(b && b.z));
const speedOf = (e) => Math.hypot(finite(e && e.vel && e.vel.x), finite(e && e.vel && e.vel.z));

function live(state) {
  return (state.entityList || []).filter((e) => e && e.alive !== false);
}

/**
 * TRAP 2. Run `fn` with the runtime's own feature configuration applied to the process-global flag
 * maps, then restore them exactly as `createAuthoritativeRuntime` does around every step. Anything
 * this module does between ticks — `prepareBackend`, every `bus.emit` — must go through here, or it
 * reads the process defaults (all false) and a flag-gated listener silently never runs.
 */
function withFeatures(runtime, fn) {
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  try {
    return fn();
  } finally {
    restoreFeatureMaps(previous);
  }
}

/**
 * TRAP 1. The set of entity ids SG-02 currently owns a body for. `owner.records` is keyed by
 * entity id, so this is the authoritative answer to "is this actor actually being simulated?".
 */
function bodyIds(runtime) {
  const physics = runtime && typeof runtime.getSystem === 'function' ? runtime.getSystem('physics') : null;
  const owner = physics && physics._sg02;
  const records = owner && owner.records;
  if (!records || typeof records.has !== 'function') return null;
  return records;
}

/**
 * Names the actors this clause depends on that have NO physics body. A non-empty list means the
 * clause is UNMEASURED — the staging fell outside the residency ring — not that the world failed
 * to react. The two answers must never be confused.
 */
function bodilessActors(runtime, actors) {
  const records = bodyIds(runtime);
  if (!records) return ['<sg02 owner unavailable>'];
  const missing = [];
  for (const [label, entity] of Object.entries(actors)) {
    if (!entity) { missing.push(`${label}:absent`); continue; }
    if (!records.has(entity.id)) missing.push(`${label}#${entity.id}`);
  }
  return missing;
}

/** Boot the full production world in a real sector. Not a fixture: this is the shipping manifest. */
async function bootWorld(seed) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  const state = runtime.state;
  if (!state) throw new Error('world.reaction_trio: runtime has no simulation state');
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  const player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
    isPlayer: true, player: state.player, pos: { x: 0, z: 0 }, fittings: [],
  }));
  state.playerId = player.id;

  const world = runtime.getSystem('world');
  if (!world || typeof world.enterSector !== 'function') {
    throw new Error('world.reaction_trio: the `world` system is not registered — this is not the real path');
  }
  world.enterSector(SECTOR_ID);

  const physics = runtime.getSystem('physics');
  if (!physics || typeof physics.prepareBackend !== 'function') {
    throw new Error('world.reaction_trio: physics has no prepareBackend — this is not the real path');
  }
  // TRAP 2: `prepareBackend` runs OUTSIDE the runtime's feature window and is where SG-02 is built
  // (`captureContactImpacts: combatFlag('weaponImpulseConsequences')`). Read outside the window that
  // flag is the process default `false` and the owner is built with contact capture permanently off
  // — real contact physics, zero `physics:impact` receipts. This is the a82158c8 bug.
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  if (ready !== true) throw new Error('world.reaction_trio: SG-02 dynamic authority failed to come up');

  for (const name of ['traffic', 'lawSecurity', 'aftermathWrecks', 'survivorPod']) {
    if (!runtime.getSystem(name)) {
      throw new Error(`world.reaction_trio: system "${name}" is not registered — the world cannot react without it`);
    }
  }
  return { runtime, state, bus: runtime.bus, player };
}

/** Move the player to witness an event. Trap 1: an unwitnessed event is an unsimulated event. */
function standPlayerOff(state, player, at, dx = WITNESS_STANDOFF_WU, dz = 0) {
  player.pos.x = finite(at && at.x) + dx;
  player.pos.z = finite(at && at.z) + dz;
  player.vel.x = 0;
  player.vel.z = 0;
}

/**
 * Sampling stride, in ticks. Every `runTicks` call pays a feature-map snapshot/restore, so sampling
 * once per tick makes a 30 s window cost minutes of wall clock. Six ticks is a tenth of a second —
 * two orders of magnitude finer than the coarsest bar this scenario reports (3 s), so the stride
 * costs nothing a player could feel and buys a bench that finishes.
 */
const SAMPLE_STRIDE = 6;

/**
 * Step the sim, sampling every `SAMPLE_STRIDE` ticks. `observe()` returns a truthy value the moment
 * the reaction is seen; the walk stops there and the tick count is returned. Returns null for
 * "never" — which is the honest answer when no listener exists.
 */
function watch(runtime, ticks, observe) {
  for (let i = SAMPLE_STRIDE; i <= ticks; i += SAMPLE_STRIDE) {
    runtime.runTicks(SAMPLE_STRIDE, DT);
    if (observe(i)) return i;
  }
  return null;
}

/**
 * The station whose jurisdiction this scenario stages inside. `station_helios` sits at (1280,-420),
 * which is inside the named zone `zone_helios_core` (centre (400,0), radius 1700) — and BOTH are
 * required: `lawSecurity._handleDamage` only opens an incident inside a station's protection ring,
 * and `aftermathWrecks.makeMarker` returns null for a kill outside a named zone. Chosen by the
 * sector's own data, not by a magic number.
 */
const JURISDICTION_STATION_ID = 'station_helios';

function anchorStation(state) {
  const stations = live(state)
    .filter((e) => e.type === 'station' && e.data && typeof e.data.stationId === 'string' && e.data.stationId);
  return stations.find((e) => e.data.stationId === JURISDICTION_STATION_ID)
    || stations.sort((a, b) => String(a.data.stationId).localeCompare(String(b.data.stationId), 'en'))[0]
    || live(state).find((e) => e.type === 'station')
    || null;
}

// ── B10a ─────────────────────────────────────────────────────────────────────────────────────────
// "Maybe the patrol that was protecting it has to choose between chasing the attacker and staying
// with the wreck." One real kill inside a real jurisdiction, in a real patrol's sight. We do not
// spawn the patrol's decision: we read the live responders' own doctrine activity and ask whether
// the group SPLIT — at least one holding at the wreck, at least one pursuing the attacker.
//
// `stimulus: false` runs the identical staging with NO kill: the control that proves a "met" reading
// came from the world reacting and not from the instrument's own staging.
export async function clausePatrolChoice(seed, { stimulus = true } = {}) {
  const h = await bootWorld(seed);
  const { runtime, state, bus } = h;
  const station = anchorStation(state);
  if (!station) throw new Error('world.reaction_trio: the real sector produced no station to hold jurisdiction');

  // The player is the attacker — that is the scenario the vision sentence describes ("when the
  // player kills something in a patrol's sight"), and it is also the branch `_handleDamage` routes
  // to `_openIncident` for a protected civilian. Both hulls are real, through the real ship factory.
  const attacker = h.player;
  standPlayerOff(state, attacker, station.pos, 120, 40);
  runtime.runTicks(120, DT); // let the sector settle around the player's real position

  const victim = runtime.spawn(makeShipEntitySpec('ship_mule', {
    pos: { x: station.pos.x + 200, z: station.pos.z + 90 }, team: 2, factionId: 'faction_scn', fittings: [],
  }));
  victim.data.trafficRole = 'hauler';
  victim.data.role = 'hauler';
  victim.vel.x = 0;
  victim.vel.z = 120; // dying at cruise, so the wreck has momentum to keep (B10 / PQ-138.03)
  runtime.runTicks(30, DT);

  // TRAP 1: if the victim never got a body it never really flew, and `.03`'s denominator is a lie.
  const missingBodies = bodilessActors(runtime, { attacker, victim });

  const events = [];
  for (const name of ['law:incidentOpened', 'law:dispatchStarted', 'aftermathWreck:recorded',
    'aftermathWreck:spawned', 'survivorPod:ejected', 'law:witnessChoice']) {
    bus.on(name, (p) => events.push({ name, t: finite(state.simTime), p }));
  }

  // The denominator for PQ-138.03 is the victim's speed AT THE MOMENT OF DEATH, not at spawn: the
  // mule is AI-driven and may have braked in the 30 ticks since. Reading it at spawn would score a
  // working wreck as failed.
  const victimSpeed = speedOf(victim);

  // The real damage route. `lawSecurity._handleDamage` gates on `payload.applied > 0` — an `amount`
  // alone is silently ignored, and the incident never opens. This is the production payload shape.
  const killT = finite(state.simTime);
  if (stimulus) {
    withFeatures(runtime, () => {
      bus.emit('combat:damage', {
        id: victim.id, targetId: victim.id, attackerId: attacker.id, sourceId: attacker.id,
        applied: 40, amount: 40, pos: { x: victim.pos.x, z: victim.pos.z },
      });
    });
    runtime.runTicks(6, DT);
    victim.hull = 0;
    victim.alive = false;
    withFeatures(runtime, () => {
      bus.emit('entity:killed', {
        id: victim.id, killerId: attacker.id, type: victim.type,
        pos: { x: victim.pos.x, z: victim.pos.z }, factionId: victim.factionId,
        victimClass: 'civilian',
      });
    });
  }

  const wreckPos = { x: victim.pos.x, z: victim.pos.z };

  // Structural observer — works BEFORE and AFTER the listener exists, and depends on no new event.
  // A responder is "holding" when its doctrine anchor sits at the wreck rather than at the station,
  // or its activity is a hold/loiter kind; it is "chasing" when it is running at the attacker.
  const split = { holdT: null, chaseT: null, holderId: null, chaserId: null };
  const observed = watch(runtime, B10A_DEADLINE_S * 60, () => {
    const t = finite(state.simTime);
    for (const e of live(state)) {
      const ai = e.data && e.data.ai;
      if (!ai || !ai.lawful) continue;
      const act = ai.activity || {};
      const anchor = act.anchor || null;
      const chasing = act.kind === 'attack_run' && (act.targetId === attacker.id || ai.securityTargetId === attacker.id);
      const holding = !!anchor && dist(anchor, wreckPos) < 400
        && (act.kind === 'loiter' || act.kind === 'return_to_anchor' || act.kind === 'hail_hold'
          || act.kind === 'scan_approach' || ai.witnessRole === 'hold');
      if (chasing && split.chaseT == null) { split.chaseT = t - killT; split.chaserId = e.id; }
      if (holding && split.holdT == null) { split.holdT = t - killT; split.holderId = e.id; }
    }
    return split.holdT != null && split.chaseT != null;
  });

  const wreck = live(state).find((e) => e.type === 'wreck' && e.data && e.data.markerId);
  const responders = live(state).filter((e) => e.data && e.data.ai && e.data.ai.lawful);
  const unmeasured = missingBodies.length > 0;
  const result = {
    clause: 'B10a',
    label: 'patrol makes a visible stay-with-wreck / chase choice after a witnessed kill',
    stimulus,
    unmeasured,
    bodilessActors: missingBodies,
    decidedAtS: observed == null ? null : Number((observed / 60).toFixed(3)),
    holdAtS: split.holdT == null ? null : Number(split.holdT.toFixed(3)),
    chaseAtS: split.chaseT == null ? null : Number(split.chaseT.toFixed(3)),
    holderId: split.holderId,
    chaserId: split.chaserId,
    // Preconditions. If any of these is false the clause is UNMEASURED, not unmet — say so loudly.
    incidentOpened: events.some((e) => e.name === 'law:incidentOpened'),
    dispatchStarted: events.some((e) => e.name === 'law:dispatchStarted'),
    wreckRecorded: events.some((e) => e.name === 'aftermathWreck:recorded'),
    wreckSpawned: events.some((e) => e.name === 'aftermathWreck:spawned'),
    podEjected: events.some((e) => e.name === 'survivorPod:ejected'),
    witnessChoiceEvents: events.filter((e) => e.name === 'law:witnessChoice').length,
    responderCount: responders.length,
    respondersChasing: responders.filter((e) => (e.data.ai.activity || {}).kind === 'attack_run').length,
    // PQ-138.03 reads through the same run: the wreck's drift as a fraction of the victim's speed
    // at the moment of death, and whether the wreck is a body a player could shove.
    victimSpeed: Number(victimSpeed.toFixed(2)),
    victimMass: victim.mass == null ? null : Number(victim.mass),
    wreckDriftSpeed: wreck ? Number(speedOf(wreck).toFixed(2)) : null,
    wreckSpeedRetainedPct: wreck && victimSpeed > 0
      ? Number(((speedOf(wreck) / victimSpeed) * 100).toFixed(1)) : null,
    wreckMass: wreck ? wreck.mass : null,
    wreckHasBody: wreck ? !!(bodyIds(runtime) && bodyIds(runtime).has(wreck.id)) : null,
    met: !unmeasured && observed != null,
  };
  runtime.dispose();
  return result;
}

// ── B10b ─────────────────────────────────────────────────────────────────────────────────────────
// "A scavenger appears after something goes wrong." Real freight pods, the real `freight:cargoSpilled`
// event with the real producer's payload shape, then we watch for a LIVE NPC to actually fly to them.
// The arrival is never spawned here: if nothing comes, the answer is "never".
export async function clauseSpilledCargo(seed, { stimulus = true } = {}) {
  const h = await bootWorld(seed);
  const { runtime, state, bus } = h;
  const station = anchorStation(state);
  if (!station) throw new Error('world.reaction_trio: the real sector produced no station');

  // TRAP 1. The player is the residency anchor: with the player at spawn and the spill 1800 WU away,
  // the pods, the carrier AND any salvor flying to them are outside the physics reach — nothing gets
  // a body, nothing moves, and the clause reads "never" whether or not a listener exists. Stage the
  // player at the spill FIRST, then settle, then spill.
  const spillPos = { x: station.pos.x + 520, z: station.pos.z + 300 };
  standPlayerOff(state, h.player, spillPos);
  runtime.runTicks(120, DT);

  // A real carrier that has just been gutted, and real pods with the real custody annotation.
  const carrier = runtime.spawn(makeShipEntitySpec('ship_mule', {
    pos: { x: spillPos.x, z: spillPos.z }, team: 2, factionId: 'faction_scn', fittings: [],
  }));
  const encounterId = `world.reaction_trio:${seed}`;
  const pods = [];
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 * i) / 3;
    pods.push(runtime.spawn({
      type: 'pickup',
      pos: { x: spillPos.x + Math.cos(angle) * 40, z: spillPos.z + Math.sin(angle) * 40 },
      vel: { x: Math.cos(angle) * 6, z: Math.sin(angle) * 6 },
      radius: 4, mass: 0.6, collides: true, flags: { persistent: true },
      data: {
        kind: 'cargo', commodityId: 'cmdty_alloy', amount: 12,
        despawnAt: finite(state.simTime) + 600, encounterId,
        freightCustodyPod: { custodyId: `cust:${seed}`, qty: 12, custodySourceKind: 'lawful_carrier' },
      },
    }));
  }
  runtime.runTicks(12, DT);
  const missingBodies = bodilessActors(runtime, { carrier, pod0: pods[0] });

  const seen = [];
  for (const name of ['npcjobs:assigned', 'traffic:salvorDispatched', 'traffic:spillNoticed',
    'freight:cargoSpilled']) {
    bus.on(name, (p) => seen.push({ name, t: finite(state.simTime), p }));
  }

  const spillT = finite(state.simTime);
  if (stimulus) {
    withFeatures(runtime, () => {
      bus.emit('freight:cargoSpilled', {
        encounterId, custodyId: `cust:${seed}`, manifestId: `fm:${seed}`, carrierId: carrier.id,
        cause: 'carrier_destroyed', qty: 36, podCount: pods.length, t: spillT,
      });
    });
  }

  // Two separate readings, because they fail for different reasons and the fix differs:
  //   noticed  — a live NPC took the spill as its work (its salvage target IS one of these pods).
  //              This is "the world noticed", and it is what a listener can deliver.
  //   arrived  — that NPC physically reached the pods. Also depends on how far the yard is.
  const podIds = new Set(pods.map((p) => p.id));
  const isScavenger = (e) => {
    const role = String((e.data && (e.data.trafficRole || e.data.role)) || '');
    return role === 'salvor' || role === 'scavenger' || role === 'pirate';
  };
  let arrivalId = null;
  let noticedTick = null;
  let noticerId = null;
  let nearestApproachWU = Infinity;
  const observed = watch(runtime, B10B_DEADLINE_S * 60, (tick) => {
    for (const e of live(state)) {
      if (e.type !== 'ship' || e.id === state.playerId || e.id === carrier.id) continue;
      const rec = ((state.traffic && state.traffic.freighters) || []).find((r) => r && r.id === e.id);
      const targeted = (rec && podIds.has(rec.targetId))
        || podIds.has(e.data && e.data.salvageTargetId)
        || podIds.has(e.data && e.data.targetId);
      if (targeted && noticedTick == null) { noticedTick = tick; noticerId = e.id; }
      for (const pod of pods) {
        if (pod.alive === false) continue;
        const d = dist(e.pos, pod.pos);
        if (d < nearestApproachWU) nearestApproachWU = d;
        // A passer-by is not a scavenger: an arrival counts only for an NPC whose ROLE or whose
        // assigned work makes it the thing the vision sentence promises.
        if (d <= SALVOR_ARRIVAL_WU && (isScavenger(e) || (e.data && e.data.jobId) || targeted)) {
          arrivalId = e.id; return true;
        }
      }
    }
    return false;
  });

  const arriver = arrivalId == null ? null : state.entities.get(arrivalId);
  const salvors = live(state).filter((e) => e.data && e.data.trafficRole === 'salvor');
  const unmeasured = missingBodies.length > 0;
  const result = {
    clause: 'B10b',
    label: 'spilled cargo attracts a live NPC',
    stimulus,
    unmeasured,
    bodilessActors: missingBodies,
    arrivedAtS: observed == null ? null : Number((observed / 60).toFixed(3)),
    noticedAtS: noticedTick == null ? null : Number((noticedTick / 60).toFixed(3)),
    noticerId,
    arriverId: arrivalId,
    arriverRole: arriver && arriver.data ? (arriver.data.trafficRole || arriver.data.role || null) : null,
    arriverHadJob: !!(arriver && arriver.data && arriver.data.jobId),
    salvorsInSector: salvors.length,
    nearestSalvorWU: salvors.length
      ? Number(Math.min(...salvors.map((s) => dist(s.pos, spillPos))).toFixed(1)) : null,
    nearestApproachWU: Number.isFinite(nearestApproachWU) ? Number(nearestApproachWU.toFixed(1)) : null,
    podsAlive: pods.filter((p) => p.alive !== false).length,
    spillNoticedEvents: seen.filter((e) => e.name === 'traffic:spillNoticed').length,
    jobEvents: seen.filter((e) => e.name === 'npcjobs:assigned' || e.name === 'traffic:salvorDispatched').length,
    met: !unmeasured && observed != null,
  };
  runtime.dispose();
  return result;
}

// ── B10d (PQ-138.03) ─────────────────────────────────────────────────────────────────────────────
// "Wrecks keep the momentum of the ship that died." Kill a ship that is ACTUALLY at cruise at the
// instant it dies — the mule is AI-driven and brakes within half a second of spawning, so the cruise
// velocity is written on the tick of the kill, not thirty ticks earlier; a stale denominator would
// score a working wreck as broken. Then read the wreck's own speed 2.0 s later, on the real physics.
export async function clauseWreckDrift(seed, { stimulus = true } = {}) {
  const h = await bootWorld(seed);
  const { runtime, state, bus } = h;
  const station = anchorStation(state);
  if (!station) throw new Error('world.reaction_trio: the real sector produced no station');
  standPlayerOff(state, h.player, station.pos, 120, 40);
  runtime.runTicks(120, DT);

  const killPos = { x: station.pos.x + 200, z: station.pos.z + 90 };
  const victim = runtime.spawn(makeShipEntitySpec('ship_mule', {
    pos: { x: killPos.x, z: killPos.z }, team: 2, factionId: 'faction_scn', fittings: [],
  }));
  victim.data.trafficRole = 'hauler';
  runtime.runTicks(30, DT); // let SG-02 give it a body before it matters

  const missingBodies = bodilessActors(runtime, { victim });
  // Cruise, written on the tick of death.
  victim.vel.x = 0;
  victim.vel.z = 120;
  victim.angVel = 1.2;
  const victimSpeed = speedOf(victim);
  const victimSpin = finite(victim.angVel);
  const victimMass = finite(victim.mass);

  if (stimulus) {
    withFeatures(runtime, () => {
      bus.emit('combat:damage', {
        id: victim.id, targetId: victim.id, attackerId: h.player.id, sourceId: h.player.id,
        applied: 400, amount: 400, pos: { x: victim.pos.x, z: victim.pos.z },
      });
    });
    victim.hull = 0;
    victim.alive = false;
    withFeatures(runtime, () => {
      bus.emit('entity:killed', {
        id: victim.id, killerId: h.player.id, type: victim.type,
        pos: { x: victim.pos.x, z: victim.pos.z }, factionId: victim.factionId,
        victimClass: 'civilian',
      });
    });
  }

  const nearestWreck = () => live(state)
    .filter((e) => e.type === 'wreck')
    .sort((a, b) => dist(a.pos, killPos) - dist(b.pos, killPos))[0] || null;
  const wreck0 = nearestWreck();
  const rot0 = wreck0 ? finite(wreck0.rot) : null;
  const pos0 = wreck0 ? { x: wreck0.pos.x, z: wreck0.pos.z } : null;

  runtime.runTicks(120, DT); // exactly 2.0 s, the done-when window

  const wreck = wreck0 && wreck0.alive !== false ? wreck0 : nearestWreck();
  const unmeasured = missingBodies.length > 0 || !wreck;
  const result = {
    clause: 'B10d',
    label: 'a wreck keeps the momentum and spin of the ship that died',
    stimulus,
    unmeasured,
    bodilessActors: missingBodies.concat(wreck ? [] : ['wreck:absent']),
    victimSpeed: Number(victimSpeed.toFixed(2)),
    victimSpin: Number(victimSpin.toFixed(3)),
    victimMass,
    wreckSpeedAt2s: wreck ? Number(speedOf(wreck).toFixed(2)) : null,
    speedRetainedPct: wreck && victimSpeed > 0
      ? Number(((speedOf(wreck) / victimSpeed) * 100).toFixed(1)) : null,
    driftWU: wreck && pos0 ? Number(dist(wreck.pos, pos0).toFixed(1)) : null,
    rotAdvancedRad: wreck && rot0 != null ? Number(Math.abs(finite(wreck.rot) - rot0).toFixed(3)) : null,
    wreckMass: wreck ? wreck.mass : null,
    // "It can be shoved" in one number: a 1e6 wreck is a wall, the victim's own mass is a body.
    shoveable: wreck ? Number(wreck.mass) < 1e6 : null,
    wreckHasBody: wreck ? !!(bodyIds(runtime) && bodyIds(runtime).has(wreck.id)) : null,
    met: !unmeasured && !!wreck && victimSpeed > 0
      && (speedOf(wreck) / victimSpeed) >= 0.8 && Number(wreck.mass) < 1e6,
  };
  runtime.dispose();
  return result;
}

// ── B10c ─────────────────────────────────────────────────────────────────────────────────────────
// "The civilian hauler panics." Real gunfire between two real hostiles near a real civilian that the
// sector itself spawned. We change nothing about the civilian; we only read whether its own course
// moved.
//
// THE FALSE POSITIVE THIS CLAUSE EXISTS TO AVOID: ambient traffic steers constantly, so "the subject
// turned" proves nothing on its own — measured 2026-09-04, the subject turned at 2.4 s with NO
// listener in the game at all. So the clause is an A/B on the same seed: the identical staging is
// run twice, once with the gunfire and once in silence, and only a turn that happens WITH the
// gunfire and NOT without it counts. The runtime is deterministic, so the two runs differ in exactly
// one thing: whether the shots were fired.
/**
 * One civilian window. Identical staging every time; `stimulus` is the only thing that differs
 * between the two runs of the A/B, and the runtime is deterministic, so any difference in the
 * subject's course between them is caused by the gunfire and by nothing else.
 */
async function civilianWindow(seed, stimulus) {
  const h = await bootWorld(seed);
  const { runtime, state, bus } = h;
  runtime.runTicks(240, DT); // let ambient traffic get under way and pick a heading

  const civilians = live(state)
    .filter((e) => e.type === 'ship' && e.data && ['hauler', 'courier', 'ore_carrier', 'miner', 'shuttle', 'surveyor']
      .includes(String(e.data.trafficRole || '')))
    .sort((a, b) => a.id - b.id);
  if (!civilians.length) throw new Error('world.reaction_trio: the real sector produced no civilian traffic');

  const subject = civilians[0];
  // TRAP 1 + baseline hygiene. Stand the player off the subject so both the subject and the gunfire
  // sit inside the physics reach, settle, and only THEN record the baseline course — so the
  // perturbation of the player's own arrival is inside the baseline and never reads as the signal.
  standPlayerOff(state, h.player, subject.pos, WITNESS_STANDOFF_WU + 150, 0);
  runtime.runTicks(90, DT);

  const records = bodyIds(runtime);
  const courseOf = (e) => {
    const intent = e.data && e.data.intent;
    const rec = ((state.traffic && state.traffic.freighters) || []).find((r) => r && r.id === e.id);
    return {
      aim: finite(intent && intent.aimAngle, finite(e.rot)),
      rot: finite(e.rot),
      targetId: rec ? rec.targetId : null,
      jobId: (e.data && e.data.jobId) || null,
      waitT: rec ? finite(rec.waitT) : 0,
      speed: speedOf(e),
    };
  };
  const before = courseOf(subject);

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const changed = (now, was) => Math.abs(wrap(now.aim - was.aim)) > COURSE_CHANGE_RAD
    || now.targetId !== was.targetId
    || (now.jobId !== was.jobId)
    || (now.waitT > was.waitT + 0.5);

  // Two real hostiles trading real fire, placed so the subject stays inside the B10c radius for the
  // whole window even as it flies its own route.
  const gunfireAt = { x: subject.pos.x + 90, z: subject.pos.z + 40 };
  const shooter = runtime.spawn(makeShipEntitySpec('ship_hornet', {
    pos: { x: gunfireAt.x, z: gunfireAt.z }, team: 1, factionId: 'faction_red', fittings: [],
  }));
  const shot = runtime.spawn(makeShipEntitySpec('ship_wasp', {
    pos: { x: gunfireAt.x + 70, z: gunfireAt.z + 40 }, team: 0, factionId: 'faction_scn', fittings: [],
  }));
  runtime.runTicks(6, DT);
  const missingBodies = bodilessActors(runtime, { subject, shooter, shot });

  let observed = null;
  // The bar says "a civilian WITHIN 300 WU of gunfire". The reading that matters is how close the
  // subject was when the shooting started — an NPC that flies its own route out to 303 WU during the
  // three-second window was still shot at from 109 WU, and calling that unmeasured would throw away a
  // valid reading on a rounding error.
  const distanceAtFirstShot = dist(subject.pos, gunfireAt);
  let maxDistance = distanceAtFirstShot;
  for (let i = SAMPLE_STRIDE; i <= B10C_DEADLINE_S * 60; i += SAMPLE_STRIDE) {
    // Sustained gunfire for the whole window: the real events, with the real payload shapes.
    if (stimulus) {
      withFeatures(runtime, () => {
        bus.emit('combat:fire', {
          id: shooter.id, shooterId: shooter.id, attackerId: shooter.id, targetId: shot.id,
          pos: { x: shooter.pos.x, z: shooter.pos.z }, weaponId: 'wpn_pulse',
        });
        bus.emit('combat:damage', {
          id: shot.id, targetId: shot.id, attackerId: shooter.id, sourceId: shooter.id,
          applied: 12, amount: 12, pos: { x: shot.pos.x, z: shot.pos.z },
        });
      });
    }
    runtime.runTicks(SAMPLE_STRIDE, DT);
    maxDistance = Math.max(maxDistance, dist(subject.pos, gunfireAt));
    if (observed == null && changed(courseOf(subject), before)) observed = i;
  }

  const out = {
    stimulus,
    changedAtS: observed == null ? null : Number((observed / 60).toFixed(3)),
    subjectId: subject.id,
    subjectRole: subject.data.trafficRole,
    subjectDistanceAtFirstShotWU: Number(distanceAtFirstShot.toFixed(1)),
    subjectMaxDistanceToGunfireWU: Number(maxDistance.toFixed(1)),
    subjectInsideRadius: distanceAtFirstShot <= VIOLENCE_RADIUS_WU,
    subjectHasBody: !!(records && records.has(subject.id)),
    bodilessActors: missingBodies,
  };
  runtime.dispose();
  return out;
}

export async function clauseCiviliansReact(seed, { stimulus = true } = {}) {
  const fired = await civilianWindow(seed, stimulus);
  // The control is the same seed, the same staging, the same subject — in silence.
  const silent = await civilianWindow(seed, false);
  const stagingFaults = fired.bodilessActors.concat(
    fired.subjectInsideRadius
      ? []
      : [`the nearest civilian was ${fired.subjectDistanceAtFirstShotWU} WU from the gunfire when it started, outside the ${VIOLENCE_RADIUS_WU} WU radius the bar asks about`],
  );
  const unmeasured = stagingFaults.length > 0;
  const attributable = fired.changedAtS != null && silent.changedAtS == null;
  return {
    clause: 'B10c',
    label: 'a civilian within 300 WU of gunfire changes course',
    stimulus,
    unmeasured,
    bodilessActors: stagingFaults,
    changedAtS: attributable ? fired.changedAtS : null,
    changedWithGunfireAtS: fired.changedAtS,
    changedInSilenceAtS: silent.changedAtS,
    // The whole point of the pair. Measured 2026-09-04 with no listener in the game: the subject
    // turned at 2.4 s in BOTH runs, so "it turned" was ambient traffic steering, not a reaction.
    attributableToGunfire: attributable,
    subjectId: fired.subjectId,
    subjectRole: fired.subjectRole,
    subjectDistanceAtFirstShotWU: fired.subjectDistanceAtFirstShotWU,
    subjectMaxDistanceToGunfireWU: fired.subjectMaxDistanceToGunfireWU,
    subjectHasBody: fired.subjectHasBody,
    met: !unmeasured && attributable,
  };
}

/**
 * A bar reading in player units. "Never" is reported as the deadline itself with `met:false`, so the
 * bar reads in seconds either way and a regression to "never" can never look like an improvement.
 * UNMEASURED is a third answer and never silently reads as "never" — that confusion is exactly how
 * a clean table of zeros passes for a measurement.
 */
function clauseBar(label, clause, valueKey, deadline, metNote, missNote) {
  const value = clause[valueKey] == null ? deadline : clause[valueKey];
  if (clause.unmeasured) {
    return {
      bar: 'B10',
      label,
      value: deadline,
      unit: 's',
      met: false,
      note: `UNMEASURED — ${clause.bodilessActors.join('; ')}. This is not a reading of the world; it says the staging never put the question.`,
    };
  }
  return {
    bar: 'B10',
    label,
    value,
    unit: 's',
    met: clause.met && value <= deadline,
    note: clause.met ? metNote(clause) : missNote(clause),
  };
}

export const scenario = {
  id: 'world.reaction_trio',
  label: 'B10 The world reacts — witnessed kill, spilled cargo, civilians near gunfire (REAL PATH)',

  async run(seed) {
    const eventTrace = [];
    const a = await clausePatrolChoice(seed);
    eventTrace.push({ tick: 0, type: 'clause:B10a', data: a });
    const b = await clauseSpilledCargo(seed);
    eventTrace.push({ tick: 1, type: 'clause:B10b', data: b });
    const c = await clauseCiviliansReact(seed);
    eventTrace.push({ tick: 2, type: 'clause:B10c', data: c });
    const d = await clauseWreckDrift(seed);
    eventTrace.push({ tick: 3, type: 'clause:B10d', data: d });

    // One extra boot purely to publish the real-path proof alongside the numbers, so a stand-in can
    // never pass silently: a fixture reports sg02Ready:false / backend:'none'.
    const probe = await bootWorld(seed);
    const proof = realPathProof(probe.runtime);
    probe.runtime.dispose();

    return {
      eventTrace,
      metrics: {
        realPathProof: proof,
        sectorId: SECTOR_ID,
        patrolChoice: a,
        spilledCargo: b,
        civiliansReact: c,
        wreckDrift: d,
        bars: [
          clauseBar('patrol decides stay-or-chase after a witnessed kill', a, 'decidedAtS', B10A_DEADLINE_S,
            (x) => `holder ${x.holderId} held at ${x.holdAtS}s, chaser ${x.chaserId} pursued at ${x.chaseAtS}s`,
            () => 'NEVER — no responder ever held with the wreck while another pursued'),
          clauseBar('a live NPC reaches spilled cargo', b, 'arrivedAtS', B10B_DEADLINE_S,
            (x) => `${x.arriverRole || 'ship'} ${x.arriverId} arrived`,
            (x) => (x.noticedAtS != null
              ? `NOT REACHED — an NPC took the spill as work at ${x.noticedAtS}s but closed only to ${x.nearestApproachWU} WU inside the window`
              : 'NEVER — nothing in the live world came for the spill')),
          clauseBar('a civilian within 300 WU of gunfire changes course', c, 'changedAtS', B10C_DEADLINE_S,
            (x) => `${x.subjectRole} ${x.subjectId} at ${x.subjectDistanceAtFirstShotWU} WU changed course only when the shooting started`,
            (x) => (x.changedWithGunfireAtS != null
              ? `NEVER — the ${x.subjectRole} turned at ${x.changedWithGunfireAtS}s with the gunfire AND at ${x.changedInSilenceAtS}s without it: that is ambient traffic steering, not a reaction`
              : 'NEVER — the civilian flew straight through the firefight')),
          // PQ-138.03 rides the same bar: a wreck that keeps nothing is a decoration, and a
          // decoration is the opposite of a world that reacts. Reported as % of the victim's speed.
          {
            bar: 'B10',
            label: 'a wreck keeps the momentum of the ship that died (2 s after the kill)',
            value: d.unmeasured ? 0 : (d.speedRetainedPct == null ? 0 : d.speedRetainedPct),
            unit: '% of victim speed',
            met: d.met,
            note: d.unmeasured
              ? `UNMEASURED — ${d.bodilessActors.join(', ')}`
              : `${d.speedRetainedPct}% retained, drifted ${d.driftWU} WU, spun ${d.rotAdvancedRad} rad, mass ${d.wreckMass} (${d.shoveable ? 'shoveable' : 'a wall at 1e6'})`,
          },
        ],
      },
    };
  },
};

export default scenario;
