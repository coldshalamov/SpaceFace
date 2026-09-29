// Fling scene — the yardstick for the hull-burst physics overhaul, slice A
// (docs/plans/2026-09-29-hull-burst-physics-overhaul-design.md §10).
//
// THE REAL-PATH LAW: every number here comes out of runtime.step() on bootRealPath — the live
// rapier-dynamic authority, the live tumble writer, the live collision-consequence and combat
// kernels, the live tactical AI, the live loot systems. Hits go through the production damage
// router (deliverProductionGunHit -> kernel.routeDamage -> applyImpulse), never a hand-written
// velocity change.
//
// Owner's sentence this scene exists to make true: "you get a good throw on 3 enemies and they
// blast into an asteroid field and they burst, and there's shiny winnings that come out of them and
// accelerate towards you and bling into you." And: "if I blast an enemy ship I don't want him flying
// against the impact and staying roughly still like a fly buzzing against the wind. I'd want a
// satisfying effect and the ship tumbling out of control off into another direction and pinging
// off of objects."
//
// This is an INSTRUMENT. Its `targets` are the owner's sentence in numbers; an unmet target is the
// finding, not a failure of the run. Targets are deliberately NOT written into `metrics.bars`: that
// seam feeds the FEEL_CONTRACT bars (B1..B13) and this scene must not move them.
//
// Five arms, each on a fresh boot with the same seed:
//   head-on   a hostile flying AT the player at 0 / 0.5 / 1.0 of cruise takes a real concussion hit
//             straight back; live AI. Reports where it goes and whether it comes back (the buzz).
//   spin      how much of a turn the hit actually spins the hull, and how fast that spin dies.
//   rebound   a flung hull meets a rock: does it leave the rock face, or stop dead on it?
//   long      the same fling but more than 3 s of flight: is the kill still the player's (loot)?
//   money     three Wasps flung into a rock cluster with the loot systems live: kills credited,
//             loot that lands with no pilot input, seconds from the last kill to the last chip.

import { resolveWeaponImpulseForHit } from '../../../../src/combat/impulseKernel.js';
import { isRecovering, readTumbleStatus } from '../../../../src/combat/tumbleStatus.js';
import { WEAPONS } from '../../../../src/data/weapons.js';
import { makeEnemySpawnSpec } from '../../../../src/systems/combat.js';
import { addCargo, cargo } from '../../../../src/systems/cargo.js';
import { economy } from '../../../../src/systems/economy.js';
import { lootShards } from '../../../../src/systems/lootShards.js';
import { mining } from '../../../../src/systems/mining.js';
import { ships } from '../../../../src/systems/ships.js';
import { bootRealPath } from '../realPath.mjs';
import {
  GUN_PROVENANCE_TAG,
  GUN_WEAPON_ID,
  SHOVE_SYSTEMS,
  deliverProductionGunHit,
  emptyIntent,
  readCruiseSpeed,
} from './feel.hitstun_curve.mjs';

const DT = 1 / 60;
const HIT_TICK = 30;
const HOSTILE_START = Object.freeze({ x: -400, z: 0 });
// The player sits off the fling line so it is neither in the way nor out of the physics
// admission ring (SG-02 gives ships bodies only near the player; terrain_slam documents a ring of
// at least 520 WU). Centred on the fling geometry so nothing is near the edge.
const PLAYER_OFF_LINE = Object.freeze({ x: -600, z: 220 });
const HULL_RADIUS_WU = 14; // a Wasp
const ROCK_RADIUS_WU = 40;
const TWO_PI = Math.PI * 2;

/** Design targets: the owner's sentence in numbers. Placeholders until tuned in play. */
export const FLING_TARGETS = Object.freeze({
  headOnOutboundFractionOfCruise: 0.3, // at 0.5 and 1.0 of cruise, once the helm returns
  yawTurnsDuringStun: 1.0,
  reboundAwayFractionOfImpact: 0.3,
  longFlightKillIsPlayers: true,
  moneyLandedShare: 1,
  moneySecondsKillToLastChip: 8,
  moneyPilotInputs: 0,
});

function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
function round(v, d = 3) { const m = 10 ** d; return Math.round(finite(v) * m) / m; }

function concussionImpulseMagnitude() {
  const def = WEAPONS.find((w) => w.id === GUN_WEAPON_ID);
  const resolved = def ? resolveWeaponImpulseForHit(def, def.dmg) : null;
  return resolved && Number.isFinite(resolved.magnitude) ? resolved.magnitude : 0;
}

function spawnHostile(host, pos, vel, { passive = false } = {}) {
  const spec = makeEnemySpawnSpec('wasp_swarmer', 1, { x: pos.x, z: pos.z }, {
    motive: 'motion_lab',
    engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'motion_lab',
  });
  spec.rot = 0;
  spec.data = spec.data || {};
  spec.data.ai = spec.data.ai || {};
  spec.data.ai.activity = {
    ...(spec.data.ai.activity || {}),
    kind: 'attack_run',
    reason: 'motion_lab',
    anchor: { x: pos.x, z: pos.z },
    leashRadius: 4000,
  };
  // A passive hostile holds still until hit, so the fling line is exactly the hit line. Live AI
  // (the default) is what the head-on arms need: the AI's answer after the hit IS the measurement.
  spec.data.ai.roe = passive ? 'hold_fire' : 'weapons_free';
  spec.data.ai.passive = passive;
  spec.data.ai.huntPlayer = !passive;
  spec.data.ai.forcePlayerTarget = !passive;
  spec.data.ai.spawnContext = 'zone_hostile';
  spec.data.intent = emptyIntent();
  spec.data.combat = spec.data.combat || {};
  if (host.state.playerId) spec.data.combat.targetId = host.state.playerId;
  const hostile = host.runtime.spawn(spec);
  hostile.vel = hostile.vel || { x: 0, z: 0 };
  hostile.vel.x = vel.x;
  hostile.vel.z = vel.z;
  return hostile;
}

/**
 * One fling run. `hostiles` are spawned with initial velocities, every one takes `hit` at HIT_TICK,
 * and each tick is traced. Returns the traces plus the causal events the run produced.
 */
async function runFling(seed, {
  playerPos,
  hostiles,
  rocks = [],
  hit,
  ticks,
  systems = SHOVE_SYSTEMS,
  eventTrace,
  tag,
  holdPrefillUnits = 0,
}) {
  const host = await bootRealPath({
    seed,
    systems: [...systems],
    hulls: [{ hullId: 'ship_kestrel', pos: playerPos, rot: 0, isPlayer: true }],
  });
  const features = host.runtime && host.runtime.config && host.runtime.config.features;
  const impulseOn = !!(features && features.combat && features.combat.weaponImpulseConsequences);
  const tumbleOn = !!(features && features.massline2 && features.massline2.enabled && features.massline2.tumble);
  if (!impulseOn || !tumbleOn) {
    return { measured: false, reason: 'production feel flags off', realPathProof: host.proof() };
  }

  const player = host.player;
  const rockEntities = rocks.map((r) => host.spawnObstacle({
    pos: r.pos, radius: r.radius || ROCK_RADIUS_WU, mass: 5000, inertiaY: 5000, hull: 4000,
  }));
  const victims = hostiles.map((h) => spawnHostile(host, h.pos, h.vel, { passive: h.passive === true }));
  const cruise = readCruiseSpeed(victims[0]).cruiseSpeed;

  const events = {
    killed: [], collisions: [], drops: [], collected: [], tumbled: [], spawnedPickups: new Set(),
  };
  host.bus.on('entity:killed', (p) => {
    if (!p) return;
    events.killed.push({ id: p.id, killerId: p.killerId == null ? null : p.killerId, tick: host.state.tick | 0 });
  });
  host.bus.on('combat:collisionConsequence', (p) => {
    if (!p) return;
    events.collisions.push({
      tick: p.tick == null ? (host.state.tick | 0) : p.tick,
      targetId: p.targetId,
      otherType: p.otherType,
      deltaV: finite(p.deltaV),
      provenanceActorId: p.provenance && p.provenance.actorId != null ? p.provenance.actorId : null,
      provenanceTag: p.provenance && p.provenance.tag || null,
      targetKilled: !!p.targetKilled,
    });
  });
  host.bus.on('loot:drop', (p) => {
    events.drops.push({
      tick: host.state.tick | 0,
      source: p && p.source,
      items: p && p.items ? p.items.length : 0,
      kinds: p && p.items ? p.items.map((it) => (it && (it.kind || (it.commodityId ? 'ore' : 'other'))) || 'none') : [],
      chipCredits: p && p.items ? p.items.reduce((sum, it) => sum + (it && it.kind === 'credit_chip' ? finite(it.credits != null ? it.credits : it.amount) : 0), 0) : 0,
    });
  });
  host.bus.on('pickup:collected', (p) => {
    events.collected.push({
      tick: host.state.tick | 0,
      pickupId: p && p.pickupId,
      kind: p && p.kind,
      amount: finite(p && p.amount),
      accepted: finite(p && p.acceptedAmount),
      rejected: finite(p && p.rejectedAmount),
      collectorId: p && p.collectorId,
    });
  });
  host.bus.on('combat:tumbled', (p) => {
    if (p) events.tumbled.push({ victimId: p.victimId, tick: p.tick, durationS: p.durationS, spin: p.spin, source: p.source });
  });

  host.step(1);
  // A bare bench state carries a 40-volume placeholder hold; the hold is only synced when a ship's
  // stats change. Set the real derived capacity of the player's hull (Kestrel: 250) so 'hold full'
  // means what it means in play, and optionally start part-full like a mid-run pilot.
  const derivedCap = player.data && player.data.derived && player.data.derived.cargoCap;
  if (Number.isFinite(derivedCap) && host.state.player && host.state.player.cargo) {
    host.state.player.cargo.capVolume = derivedCap;
  }
  if (holdPrefillUnits > 0) addCargo(host.state, 'cmdty_scrap_metal', holdPrefillUnits);
  const walletBefore = finite(host.state.player && host.state.player.credits);
  const cargoBefore = host.state.player && host.state.player.cargo ? { used: finite(host.state.player.cargo.usedVolume), cap: finite(host.state.player.cargo.capVolume) } : null;
  // Ships only: a static rock has a solver body but publishes no telemetry, so asserting on it
  // always reads "no body" whatever the distance (found 2026-09-29, 220 WU and 467 WU alike).
  host.assertBodies([player, ...victims], `feel.fling_scene:${tag}`);

  const traces = victims.map(() => []);
  const startTick = host.state.tick | 0;
  const masses = victims.map((v) => finite(v.mass, 1));
  let hitDone = false;
  let pickupsSeen = 0;
  const seenPickupIds = new Set();
  // Each pickup's life: what it is and the tick it left the world. A `pickup:collected` event is
  // NOT a landing (a full hold refuses the pickup and it keeps floating); leaving the world is.
  const pickupLives = new Map();
  host.step(ticks, {
    before: ({ state }) => {
      if (hitDone || (state.tick - startTick) < (hit.tick != null ? hit.tick : HIT_TICK)) return;
      hitDone = true;
      victims.forEach((victim, i) => {
        if (Array.isArray(hit.only) && !hit.only.includes(i)) return;
        traces[i].hitTick = state.tick | 0;
        traces[i].hitPos = { x: victim.pos.x, z: victim.pos.z };
        traces[i].vBefore = { x: finite(victim.vel.x), z: finite(victim.vel.z) };
        const magnitude = hit.impulseMagnitude != null ? hit.impulseMagnitude : masses[i] * hit.deltaV;
        deliverProductionGunHit(host, victim, {
          attackerId: player.id,
          nx: hit.dir.x,
          nz: hit.dir.z,
          magnitude,
          weaponId: GUN_WEAPON_ID,
          tag: GUN_PROVENANCE_TAG,
        });
      });
      if (eventTrace && eventTrace.length < 400) {
        eventTrace.push({ tick: state.tick | 0, simTime: (state.tick | 0) * DT, type: 'fling:hit', tag });
      }
    },
    after: ({ state }) => {
      victims.forEach((victim, i) => {
        const tel = victim;
        traces[i].push({
          tick: state.tick | 0,
          x: finite(tel.pos && tel.pos.x),
          z: finite(tel.pos && tel.pos.z),
          vx: finite(tel.vel && tel.vel.x),
          vz: finite(tel.vel && tel.vel.z),
          rot: finite(tel.rot),
          w: finite(tel.angVel),
          alive: tel.alive !== false,
          tumbling: readTumbleStatus(state, tel) !== null,
          recovering: isRecovering(state, tel),
        });
      });
      // Count distinct pickup bodies the loot systems put in the world.
      const list = state.entityList || [];
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e && e.type === 'pickup' && !seenPickupIds.has(e.id)) {
          seenPickupIds.add(e.id);
          pickupsSeen++;
          pickupLives.set(e.id, { id: e.id, kind: (e.data && e.data.kind) || e.kind || 'unknown', seenTick: state.tick | 0, leftTick: null });
        }
      }
      for (const [id, life] of pickupLives) {
        if (life.leftTick != null) continue;
        const live = state.entities && state.entities.get ? state.entities.get(id) : null;
        if (!live || live.alive === false) life.leftTick = state.tick | 0;
      }
    },
  });
  events.pickupsSeen = pickupsSeen;
  events.pickupLives = [...pickupLives.values()];
  const typeHistogram = {};
  for (const e of (host.state.entityList || [])) typeHistogram[e && e.type || 'none'] = (typeHistogram[e && e.type || 'none'] || 0) + 1;
  events.entityTypesAtEnd = typeHistogram;
  const cargoAfter = host.state.player && host.state.player.cargo ? { used: finite(host.state.player.cargo.usedVolume), cap: finite(host.state.player.cargo.capVolume) } : null;
  events.wallet = { before: walletBefore, after: finite(host.state.player && host.state.player.credits) };
  events.cargo = { before: cargoBefore, after: cargoAfter };
  events.hullAtEnd = victims.map((v) => ({ id: v.id, hull: finite(v.hull), hullMax: finite(v.hullMax), alive: v.alive !== false }));
  return {
    measured: true,
    host,
    proof: host.proof(),
    cruise,
    startTick,
    traces,
    victims,
    events,
    player,
  };
}

// --- trace readers ---------------------------------------------------------------------------

function stunWindow(trace) {
  const hitTick = trace.hitTick;
  let start = null;
  let end = null;
  let fullBack = null;
  for (const s of trace) {
    if (s.tick < hitTick) continue;
    if (s.tumbling && start === null) start = s.tick;
    if (start !== null && !s.tumbling && end === null) end = s.tick;
    if (end !== null && !s.tumbling && !s.recovering && fullBack === null) fullBack = s.tick;
  }
  return { start, end, fullBack };
}

function at(trace, tick) {
  return trace.find((s) => s.tick >= tick) || trace[trace.length - 1] || null;
}

function yawTurns(trace, fromTick, toTick) {
  let turns = 0;
  let prev = null;
  for (const s of trace) {
    if (s.tick < fromTick || s.tick > toTick) continue;
    if (prev !== null) {
      let d = s.rot - prev;
      while (d > Math.PI) d -= TWO_PI;
      while (d < -Math.PI) d += TWO_PI;
      turns += Math.abs(d);
    }
    prev = s.rot;
  }
  return turns / TWO_PI;
}

// --- arms -------------------------------------------------------------------------------------

async function runHeadOn(seed, fraction, eventTrace) {
  const magnitude = concussionImpulseMagnitude();
  // The player flies at the origin; the hostile approaches from the left, so the hit (dir -x)
  // pushes it straight back the way it came: the "blast an enemy that is coming at me" case.
  const probe = await runFling(seed, {
    playerPos: { x: 0, z: 0 },
    hostiles: [{ pos: HOSTILE_START, vel: { x: 0, z: 0 } }],
    hit: { dir: { x: -1, z: 0 }, impulseMagnitude: magnitude },
    ticks: 2,
    eventTrace: null,
    tag: 'head_on_probe',
  });
  if (!probe.measured) return { measured: false, reason: probe.reason };
  const cruise = probe.cruise;
  const run = await runFling(seed, {
    playerPos: { x: 0, z: 0 },
    hostiles: [{ pos: HOSTILE_START, vel: { x: cruise * fraction, z: 0 } }],
    hit: { dir: { x: -1, z: 0 }, impulseMagnitude: magnitude },
    ticks: HIT_TICK + 60 * 6,
    eventTrace,
    tag: `head_on_${fraction}`,
  });
  if (!run.measured) return { measured: false, reason: run.reason };
  const trace = run.traces[0];
  const { start, end, fullBack } = stunWindow(trace);
  const hit = trace.hitPos;
  const along = (s) => -s.vx; // outbound speed along the hit direction (-x)
  const disp = (s) => hit.x - s.x; // displacement along the hit direction
  const stunEnd = end == null ? trace[trace.length - 1] : at(trace, end);
  const twoS = at(trace, trace.hitTick + 120);
  const fourS = at(trace, trace.hitTick + 240);
  // A reversal is the hull's outbound velocity changing sign. Counted only inside the stun and the
  // recovery beat: after that the AI has its full drive back and turning around is the AI resuming
  // its attack, not the fling failing.
  const reversalEnd = fullBack == null ? trace[trace.length - 1].tick : fullBack;
  let reversals = 0;
  let prevSign = 0;
  for (const s of trace) {
    if (s.tick < trace.hitTick + 12 || s.tick > reversalEnd) continue;
    const sign = Math.sign(along(s));
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) reversals++;
    if (sign !== 0) prevSign = sign;
  }
  const mass = finite(run.victims[0].mass, 1);
  const deltaV = magnitude / Math.max(1, mass);
  const approach = trace.vBefore.x; // positive = closing on the player (+x is toward the player)
  return {
    measured: true,
    realPathProof: run.proof,
    // The AI sets the approach speed in the ticks before the hit, so the row is labelled by what was
    // MEASURED, not by the fraction it was seeded with.
    seededFraction: fraction,
    cruise: round(cruise, 1),
    impulseMagnitude: round(magnitude, 1),
    hullMass: round(mass, 1),
    deltaV: round(deltaV, 1),
    deltaVFractionOfCruise: round(deltaV / cruise, 3),
    approachSpeedBeforeHit: round(approach, 1),
    approachFractionOfCruise: round(approach / cruise, 3),
    // Nothing pushes back during the stun, so the outbound speed is momentum arithmetic:
    // deltaV minus approach speed. Reported so the identity can be checked, not assumed.
    predictedOutbound: round(deltaV - approach, 1),
    stunS: start == null ? 0 : round(((end == null ? trace[trace.length - 1].tick : end) - start) * DT, 3),
    outboundAtStunEnd: round(along(stunEnd), 1),
    outboundFractionAtStunEnd: round(along(stunEnd) / cruise, 3),
    displacementAtStunEnd: round(disp(stunEnd), 1),
    displacementAt2s: round(disp(twoS), 1),
    displacementAt4s: round(disp(fourS), 1),
    helmFullyBackS: fullBack == null ? null : round((fullBack - trace.hitTick) * DT, 3),
    reversalsInStunAndRecovery: reversals,
    peakSpin: round(trace.reduce((m, s) => (s.tick >= trace.hitTick && s.tick <= trace.hitTick + 12 ? Math.max(m, Math.abs(s.w)) : m), 0), 3),
    yawTurnsDuringStun: round(yawTurns(trace, trace.hitTick, end == null ? Infinity : end), 3),
  };
}

async function runRock(seed, { flightWu, deltaV, eventTrace, tag }) {
  // The hit sends the hull down -x. The rock face sits `flightWu` from the hit point.
  const contactCentreX = HOSTILE_START.x - flightWu - ROCK_RADIUS_WU - HULL_RADIUS_WU;
  return runFling(seed, {
    playerPos: PLAYER_OFF_LINE,
    hostiles: [{ pos: HOSTILE_START, vel: { x: 0, z: 0 }, passive: true }],
    rocks: [{ pos: { x: contactCentreX, z: 0 }, radius: ROCK_RADIUS_WU }],
    hit: { dir: { x: -1, z: 0 }, deltaV },
    ticks: HIT_TICK + 60 * 7,
    eventTrace,
    tag,
  });
}

function readRebound(run) {
  if (!run.measured) return { measured: false, reason: run.reason };
  const trace = run.traces[0];
  const victim = run.victims[0];
  const victimId = victim.id;
  const collision = run.events.collisions.find((c) => c.targetId === victimId && c.otherType === 'asteroid') || null;
  const killed = run.events.killed.find((k) => k.id === victimId) || null;
  const contactTick = collision ? collision.tick : null;
  let speedBefore = 0;
  let speedAfter = null;
  let awayMax = 0;
  let endX = null;
  if (contactTick != null) {
    const pre = at(trace, contactTick - 2);
    speedBefore = pre ? Math.hypot(pre.vx, pre.vz) : 0;
    for (const s of trace) {
      if (s.tick < contactTick || s.tick > contactTick + 90) continue;
      // The rock is on the -x side of the hull, so leaving it means +x velocity.
      awayMax = Math.max(awayMax, s.vx);
    }
    const post = at(trace, contactTick + 6);
    speedAfter = post ? Math.hypot(post.vx, post.vz) : null;
    const last = trace[trace.length - 1];
    endX = last ? last.x : null;
  }
  // Coarse path (every 12 ticks = 0.2 s) so a run that never touches the rock shows where it went.
  const path = trace.filter((s, i) => i % 12 === 0)
    .map((s) => ({ t: round((s.tick - trace.hitTick) * DT, 2), x: round(s.x, 0), z: round(s.z, 0), vx: round(s.vx, 0), w: round(s.w, 1), tumbling: s.tumbling }));
  const survived = victim.alive !== false;
  // Tick-by-tick around the contact: what the hull's velocity and control state actually did.
  const contactWindow = contactTick == null ? null : trace
    .filter((sample) => sample.tick >= contactTick - 2 && sample.tick <= contactTick + 10)
    .map((sample) => ({ dt: sample.tick - contactTick, x: round(sample.x, 1), vx: round(sample.vx, 1), w: round(sample.w, 2), tumbling: sample.tumbling, recovering: sample.recovering }));
  return {
    measured: true,
    realPathProof: run.proof,
    path,
    contactWindow,
    contact: collision,
    survived,
    hullAtEnd: round(victim.hull, 1),
    flightSeconds: contactTick == null ? null : round((contactTick - trace.hitTick) * DT, 3),
    speedBeforeContact: round(speedBefore, 1),
    speedSixTicksAfter: speedAfter == null ? null : round(speedAfter, 1),
    // A dead hull's trace is frozen wreckage, not a bounce: only a survivor's away-speed means anything.
    awayVelocityMax: survived ? round(awayMax, 1) : null,
    awayFractionOfImpact: survived && speedBefore > 0 ? round(awayMax / speedBefore, 3) : null,
    endX: endX == null ? null : round(endX, 1),
    killed,
    killerIsPlayer: killed ? killed.killerId === run.player.id : null,
    killerId: killed ? killed.killerId : null,
    collisionProvenance: collision ? { actorId: collision.provenanceActorId, tag: collision.provenanceTag } : null,
    lootDrops: run.events.drops.length,
    tumbledEvents: run.events.tumbled.length,
    cruise: round(run.cruise, 1),
  };
}

/** Fling Wasp A into a second Wasp B: the "three enemies" chain's hull-on-hull link. */
async function runChain(seed, eventTrace) {
  const run = await runFling(seed, {
    playerPos: { x: -760, z: 0 },
    // A is flung -x into B, 140 WU down the line. Both hold still until hit: a live B hunting the
    // player runs away down the same line at ~80 WU/s and the closing speed collapses to ~30, which
    // measures the geometry, not the law.
    hostiles: [
      { pos: { x: -400, z: 0 }, vel: { x: 0, z: 0 }, passive: true },
      { pos: { x: -540, z: 0 }, vel: { x: 0, z: 0 }, passive: true },
    ],
    hit: { dir: { x: -1, z: 0 }, deltaV: 110, tick: 3, only: [0] },
    ticks: 3 + 60 * 6,
    eventTrace,
    tag: 'chain',
  });
  if (!run.measured) return { measured: false, reason: run.reason };
  const [a, b] = run.victims;
  const contact = run.events.collisions.find((c) => c.targetId === b.id && c.otherType === 'ship') || null;
  const hull = (id) => run.events.hullAtEnd.find((h) => h.id === id) || null;
  const bTumbled = run.events.tumbled.some((t) => t.victimId === b.id);
  const kills = run.events.killed.filter((k) => k.id === a.id || k.id === b.id);
  return {
    measured: true,
    realPathProof: run.proof,
    hullContact: contact,
    bHull: hull(b.id),
    aHull: hull(a.id),
    bTumbled,
    kills,
    killsCreditedToPlayer: kills.filter((k) => k.killerId === run.player.id).length,
    playerId: run.player.id,
  };
}

async function runMoney(seed, eventTrace, { holdPrefillUnits = 0, tag = 'money' } = {}) {
  // Live AI on purpose: a passive hull is not hostile to the player, so no kill burst would fire.
  // The hit lands on tick 3 so the AI has not had time to steer the hulls off the fling line.
  const hostiles = [-70, 0, 70].map((dz) => ({ pos: { x: HOSTILE_START.x, z: dz }, vel: { x: 0, z: 0 } }));
  const rocks = [-90, 0, 90].map((z) => ({ pos: { x: -760, z }, radius: ROCK_RADIUS_WU }));
  const run = await runFling(seed, {
    playerPos: PLAYER_OFF_LINE,
    hostiles,
    rocks,
    hit: { dir: { x: -1, z: 0 }, deltaV: 110, tick: 3 },
    ticks: 3 + 60 * 30,
    // The ships, cargo and economy owners are live so hold capacity, acceptance and the wallet are
    // the real ones (a bare bench state carries a 40-volume placeholder hold).
    systems: [...SHOVE_SYSTEMS, lootShards, mining, ships, cargo, economy],
    eventTrace,
    tag,
    holdPrefillUnits,
  });
  if (!run.measured) return { measured: false, reason: run.reason };
  const playerId = run.player.id;
  const victimIds = new Set(run.victims.map((v) => v.id));
  const kills = run.events.killed.filter((k) => victimIds.has(k.id));
  const playerKills = kills.filter((k) => k.killerId === playerId);
  const lastKillTick = kills.reduce((m, k) => Math.max(m, k.tick), 0);
  // Acceptance is the cargo owner's word (acceptedAmount on the collect payload), not the collect
  // event itself: a refused pickup announces "collected" again every retry.
  const accepted = new Map();
  for (const c of run.events.collected) {
    if (c.collectorId !== playerId || c.pickupId == null) continue;
    accepted.set(c.pickupId, Math.max(accepted.get(c.pickupId) || 0, c.accepted));
  }
  const spawned = run.events.pickupsSeen;
  const lives = run.events.pickupLives || [];
  const landedLives = [];
  const strandedLives = [];
  const vanishedLives = [];
  for (const l of lives) {
    const acc = accepted.get(l.id) || 0;
    if (l.leftTick == null) strandedLives.push(l);
    else if (acc > 0 || l.kind === 'credit_chip') landedLives.push(l);
    else vanishedLives.push(l);
  }
  const tally = (list) => list.reduce((o, l) => { o[l.kind] = (o[l.kind] || 0) + 1; return o; }, {});
  const lastLandTick = landedLives.reduce((m, l) => Math.max(m, l.leftTick), 0);
  const chipCredits = run.events.drops.reduce((sum, d) => sum + d.chipCredits, 0);
  return {
    measured: true,
    realPathProof: run.proof,
    hostiles: run.victims.length,
    physicsKills: kills.length,
    physicsKillsCreditedToPlayer: playerKills.length,
    lootDrops: run.events.drops.length,
    pickupsSpawned: spawned,
    pickupsLanded: landedLives.length,
    pickupsStranded: strandedLives.length,
    pickupsVanishedUnaccepted: vanishedLives.length,
    landedKinds: tally(landedLives),
    strandedKinds: tally(strandedLives),
    landedShare: spawned > 0 ? round(landedLives.length / spawned, 3) : null,
    holdBefore: run.events.cargo.before,
    holdAfter: run.events.cargo.after,
    chipCreditsDropped: chipCredits,
    walletDelta: round(run.events.wallet.after - run.events.wallet.before, 1),
    collectEventsRaw: run.events.collected.length,
    secondsLastKillToLastLanding: kills.length && landedLives.length && lastLandTick >= lastKillTick
      ? round((lastLandTick - lastKillTick) * DT, 3) : null,
    pilotInputs: 0, // by construction: the scene never writes player input
    collisionEvents: run.events.collisions.length,
    entityTypesAtEnd: run.events.entityTypesAtEnd,
  };
}

// --- the scenario -----------------------------------------------------------------------------

export const scenario = {
  id: 'feel.fling_scene',
  label: 'FLING Owner sentence yardstick: head-on shove, spin, rebound, >3 s attribution, chain, money shot',
  async run(seed) {
    const eventTrace = [];
    const headOn = [];
    for (const fraction of [0, 0.5, 1]) headOn.push(await runHeadOn(seed, fraction, eventTrace));
    const measuredHeadOn = headOn.filter((h) => h && h.measured);
    // The inbound case that matters is the one where the hostile really was closing fastest.
    const inbound = measuredHeadOn.reduce((best, h) => (!best || h.approachSpeedBeforeHit > best.approachSpeedBeforeHit ? h : best), null);

    const spin = measuredHeadOn.length ? {
      yawTurnsDuringStun: measuredHeadOn[0].yawTurnsDuringStun,
      peakSpin: measuredHeadOn[0].peakSpin,
      stunS: measuredHeadOn[0].stunS,
    } : null;

    // Lethal fling (a Wasp dies to a rock at about 0.5 cruise closing): attribution inside 3 s.
    const lethal = readRebound(await runRock(seed, { flightWu: 150, deltaV: 100, eventTrace, tag: 'rock_lethal' }));
    // Survivor fling (about 0.27 cruise closing): the only case where a bounce can exist. A 28 WU/s
    // hit stuns for ~0.8 s, so the rock is 15 WU away: contact must land while the hull is still
    // tumbling (a hull that has already recovered scrapes by design; only a loose hull bounces).
    const survivor = readRebound(await runRock(seed, { flightWu: 15, deltaV: 28, eventTrace, tag: 'rock_survivor' }));
    // 300 WU at 90 WU/s is 3.3 s of flight: past the 3 s (180 tick) life of the impulse record, and
    // still inside the 3.5 s stun cap, so the hull is tumbling when it lands.
    const longFlight = readRebound(await runRock(seed, { flightWu: 300, deltaV: 90, eventTrace, tag: 'long_flight' }));
    const chain = await runChain(seed, eventTrace);
    const money = await runMoney(seed, eventTrace);
    // A pilot who has been mining: 60% of the 250 hold already used. This is where the design says
    // a full hold recreates the weigh-the-loot chore.
    const moneyBusyHold = await runMoney(seed, eventTrace, { holdPrefillUnits: 150, tag: 'money_busy_hold' });

    const targets = [];
    const push = (id, label, value, unit, met, note) => targets.push({
      id, label, value, unit, met: !!met, ...(note ? { note } : {}),
    });
    if (inbound) {
      push('headOn.inbound', 'hostile closing on the player takes a real concussion hit straight back: outbound speed when the helm returns (fraction of cruise)',
        inbound.outboundFractionAtStunEnd, 'fraction of cruise',
        inbound.outboundFractionAtStunEnd >= FLING_TARGETS.headOnOutboundFractionOfCruise,
        `approach ${inbound.approachSpeedBeforeHit} wu/s (${inbound.approachFractionOfCruise} cruise), deltaV ${inbound.deltaV}; target >= ${FLING_TARGETS.headOnOutboundFractionOfCruise}`);
    }
    if (spin) {
      push('spin', 'yaw turns the hull spins through during a gun-shove stun', spin.yawTurnsDuringStun, 'turns',
        spin.yawTurnsDuringStun >= FLING_TARGETS.yawTurnsDuringStun, `target >= ${FLING_TARGETS.yawTurnsDuringStun}`);
    }
    if (survivor.measured) {
      push('rebound.survivor', 'a hull that survives a rock hit: speed leaving the rock face (fraction of impact speed)',
        survivor.awayFractionOfImpact, 'fraction of impact speed',
        survivor.survived && survivor.awayFractionOfImpact != null && survivor.awayFractionOfImpact >= FLING_TARGETS.reboundAwayFractionOfImpact,
        survivor.survived ? `target >= ${FLING_TARGETS.reboundAwayFractionOfImpact}` : 'the hull died: no survivor case measured');
    }
    if (lethal.measured) {
      push('attribution.short', 'lethal rock fling inside 3 s is credited to the player',
        lethal.killerIsPlayer === true ? 1 : 0, 'bool', lethal.killerIsPlayer === true,
        `flight ${lethal.flightSeconds} s; killer ${lethal.killerId}`);
    }
    if (longFlight.measured) {
      push('attribution.long', 'lethal rock fling after more than 3 s of flight is credited to the player',
        longFlight.killerIsPlayer === true ? 1 : 0, 'bool', longFlight.killerIsPlayer === true,
        `flight ${longFlight.flightSeconds} s; killer ${longFlight.killerId}; collision provenance ${longFlight.collisionProvenance ? longFlight.collisionProvenance.tag : 'none'}`);
    }
    if (chain.measured) {
      const hurt = chain.bTumbled || (chain.bHull && chain.bHull.hull < chain.bHull.hullMax);
      push('chain.hullOnHull', 'a flung Wasp meets a second Wasp: the second is hurt or stunned, and every kill is the player\'s',
        chain.hullContact ? 1 : 0, 'bool',
        !!chain.hullContact && !!hurt && chain.killsCreditedToPlayer === chain.kills.length,
        `contact ${chain.hullContact ? 'yes' : 'no'}; B tumbled ${chain.bTumbled}; B hull ${chain.bHull ? `${chain.bHull.hull}/${chain.bHull.hullMax}` : '?'}; kills credited to player ${chain.killsCreditedToPlayer} of ${chain.kills.length}`);
    }
    if (money.measured) {
      push('money.credited', 'physics kills credited to the player, of the three flung hulls',
        money.physicsKillsCreditedToPlayer, 'kills', money.physicsKillsCreditedToPlayer === money.hostiles);
      push('money.landed', 'share of spawned loot the hull actually accepts with no pilot input',
        money.landedShare, 'fraction', money.landedShare === FLING_TARGETS.moneyLandedShare,
        `${money.pickupsStranded} still floating (${JSON.stringify(money.strandedKinds)}); hold ${money.holdAfter ? `${money.holdAfter.used}/${money.holdAfter.cap}` : '?'}; wallet +${money.walletDelta} of ${money.chipCreditsDropped} chip credits`);
      push('money.seconds', 'seconds from the last kill to the last loot landing',
        money.secondsLastKillToLastLanding, 's',
        money.secondsLastKillToLastLanding != null && money.secondsLastKillToLastLanding <= FLING_TARGETS.moneySecondsKillToLastChip,
        `target <= ${FLING_TARGETS.moneySecondsKillToLastChip} s`);
    }

    if (moneyBusyHold.measured) {
      push('money.landed.busyHold', 'same fling with the hold 60% full: share of spawned loot the hull accepts with no pilot input',
        moneyBusyHold.landedShare, 'fraction', moneyBusyHold.landedShare === FLING_TARGETS.moneyLandedShare,
        `${moneyBusyHold.pickupsStranded} still floating (${JSON.stringify(moneyBusyHold.strandedKinds)}); hold ${moneyBusyHold.holdBefore ? moneyBusyHold.holdBefore.used : '?'} -> ${moneyBusyHold.holdAfter ? `${moneyBusyHold.holdAfter.used}/${moneyBusyHold.holdAfter.cap}` : '?'}`);
    }

    const realPathProof = (headOn[0] && headOn[0].realPathProof) || null;
    return {
      eventTrace,
      metrics: {
        schema: 'spaceface.feel.flingScene.v2',
        realPathProof,
        targetsDefinition: FLING_TARGETS,
        headOn,
        spin,
        reboundLethal: lethal,
        reboundSurvivor: survivor,
        longFlight,
        chain,
        money,
        moneyBusyHold,
        targets,
      },
    };
  },
};

export default scenario;
