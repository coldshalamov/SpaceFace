// Bumper scene — the yardstick for the hull-burst overhaul, slice C (the Gravity Bumper;
// docs/plans/2026-09-29-hull-burst-physics-overhaul-design.md sections 4, 5 and 10).
//
// THE REAL-PATH LAW (same as feel.fling_scene): every number comes out of runtime.step() on
// bootRealPath — the live rapier-dynamic authority, the live tumble writer, the live
// collision-consequence and combat kernels, the live tactical AI, the live loot systems. The burst
// is lit through the input edge (state.input.actions.hullBurst); the throw is whatever the production impulse route
// does with it. Nothing here writes a velocity.
//
// What it must show: THE MASSLINE MATTERS. A crawling touch is a nudge, a full-speed arrival (a
// Massline swing is the fastest way to arrive aimed) is the full effect, and a heavy hull shrugs.
//
//   crawl / swing   the same light hostile, the same wedge, the player closing at ~15 vs ~300 WU/s:
//                   how far the hull travels in the 3 s after the hit.
//   medium / heavy  the same swing against a Drifter-class and a Bastion-class hull.
//   field3          three Wasps in front of a rock wall, one full-speed pass, loot systems live:
//                   kills caused by the wedge and its flung hulls (not guns), credited to the
//                   player, and the loot that lands with no pilot input.
//
// This is an INSTRUMENT. `targets` are the owner's sentence in numbers; an unmet target is the
// finding. They are deliberately NOT written into `metrics.bars` (that seam feeds FEEL_CONTRACT).

import { isRecovering, readTumbleStatus } from '../../../../src/combat/tumbleStatus.js';
import { makeEnemySpawnSpec } from '../../../../src/systems/combat.js';
import { cargo } from '../../../../src/systems/cargo.js';
import { economy } from '../../../../src/systems/economy.js';
import { hullBurst } from '../../../../src/systems/hullBurst.js';
import { impulseCharges } from '../../../../src/systems/impulseCharges.js';
import { lootShards } from '../../../../src/systems/lootShards.js';
import { mining } from '../../../../src/systems/mining.js';
import { fittingsFromDefaultModules, ships } from '../../../../src/systems/ships.js';
import { bootRealPath, writeRealPathInput } from '../realPath.mjs';
import { SHOVE_SYSTEMS, emptyIntent } from './feel.hitstun_curve.mjs';

const DT = 1 / 60;
const PLAYER_HULL = 'ship_kestrel';
const FLIGHT_S = 3;               // window after the hit in which the flight distance is read
const TRACE_S = 6;                // how long the hull is followed (past the helm's return)
const ROCK_RADIUS_WU = 40;

const BUMPER_SYSTEMS = Object.freeze(SHOVE_SYSTEMS.flatMap((s) => (s === impulseCharges ? [s, hullBurst] : [s])));

/** Design targets: the owner's sentence in numbers. Placeholders until tuned in play. */
export const BUMPER_TARGETS = Object.freeze({
  swingToCrawlDistanceRatio: 4,   // "a crawling touch is a nudge; a full-speed hit is the full effect"
  lightSwingFlightWu: 200,        // a light hull is thrown about two screens in 3 s
  heavyShrugRatio: 0.5,           // a Warden-class hull is given at most half the delta-V a Wasp is
  heavyHelmLossShare: 0.6,        // and keeps flying: it loses its helm for at most 60% as long as a light hull
  outboundAtHelmReturnWuS: 40,    // no buzz: a thrown hull is still leaving when its helm returns
  fieldKillsCreditedToPlayer: 2,  // of three, by the wedge and the hulls it flings
  fieldLandedShare: 1,
  gripMaxSeparationWu: 15,        // the carried hull stays within 15 WU of its nose socket
});

/**
 * Light the wedge the way the keyboard does: the input system's edge on state.input.actions.hullBurst,
 * which the runtime's own copy of the hullBurst system consumes on its next update (the runtime
 * instantiates its own copy of each system, so calling the imported module's activate() would light a
 * different object). `lit` is then read off the system's own `hullBurst:activated` event.
 */
function light(host) {
  if (!host.state.input.actions) host.state.input.actions = {};
  host.state.input.actions.hullBurst = true;
  return true;
}

/** Units of kill loot the salvage bay holds (0 when it has never held anything). */
function bayUnits(state) {
  const items = state.player && state.player.salvageBay && state.player.salvageBay.items;
  let n = 0;
  for (const id in (items || {})) n += Number(items[id]) || 0;
  return n;
}

function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
function round(v, d = 3) { const m = 10 ** d; return Math.round(finite(v) * m) / m; }

/** A hostile that neither shoots nor hunts and holds its ground: still the player's enemy, so it is
 *  thrown and its kill pays a loot burst. (A `passive` hull is not hostile and would only be nudged.) */
function spawnHostile(host, enemyId, pos) {
  const spec = makeEnemySpawnSpec(enemyId, 1, { x: pos.x, z: pos.z }, {
    motive: 'motion_lab', engagementTrigger: 'authorized_hostile_spawn', zoneId: 'motion_lab',
  });
  spec.rot = Math.PI;
  spec.data = spec.data || {};
  spec.data.ai = spec.data.ai || {};
  spec.data.ai.activity = {
    ...(spec.data.ai.activity || {}), kind: 'attack_run', reason: 'motion_lab', anchor: { x: pos.x, z: pos.z }, leashRadius: 4000,
  };
  spec.data.ai.roe = 'hold_fire';
  spec.data.ai.passive = false;
  spec.data.ai.huntPlayer = false;
  spec.data.ai.forcePlayerTarget = false;
  spec.data.ai.spawnContext = 'zone_hostile';
  spec.data.intent = emptyIntent();
  spec.data.combat = spec.data.combat || {};
  if (host.state.playerId) spec.data.combat.targetId = host.state.playerId;
  const hostile = host.runtime.spawn(spec);
  hostile.vel = hostile.vel || { x: 0, z: 0 };
  hostile.vel.x = 0;
  hostile.vel.z = 0;
  return hostile;
}

/** A parked hostile for the throw arms: a real hull on the hostile team, marked an encounter body so it
 *  is the player's enemy, with NO AI so nothing moves it but the throw (a live AI drifts on its own
 *  and pollutes a distance reading; the field arm keeps live AI on purpose). */
function spawnHostileHull(host, hullId, pos) {
  const hull = host.spawnShip({ hullId, pos: { x: pos.x, z: pos.z }, rot: Math.PI, team: 1 });
  hull.data = hull.data || {};
  hull.data.encounter = { kind: 'motion_lab' };
  hull.vel = hull.vel || { x: 0, z: 0 };
  hull.vel.x = 0;
  hull.vel.z = 0;
  return hull;
}

async function bootBumper(seed, { systems = BUMPER_SYSTEMS, playerPos = { x: 0, z: 0 }, moduleId = 'mod_gravity_bumper_s', kind = 'gravity' } = {}) {
  const fittings = fittingsFromDefaultModules(PLAYER_HULL, [moduleId]);
  const host = await bootRealPath({
    seed,
    systems: [...systems],
    // The fitting lives where the game keeps it (the owned ship), not only on the spawned entity: the ships
    // system recomputes derived stats from ownedShips whenever the hold's mass changes (a pickup), and a
    // module that only the spawn knew about vanishes on the first chip: the burst then ends 'interrupted'.
    prepareState: ({ state }) => {
      state.player.ownedShips = [{ defId: PLAYER_HULL, fittings: [...fittings] }];
      state.player.activeShipIndex = 0;
    },
    hulls: [{ hullId: PLAYER_HULL, pos: playerPos, rot: 0, isPlayer: true, fittings }],
  });
  const features = host.runtime && host.runtime.config && host.runtime.config.features;
  const impulseOn = !!(features && features.combat && features.combat.weaponImpulseConsequences);
  const tumbleOn = !!(features && features.massline2 && features.massline2.enabled && features.massline2.tumble);
  const fitted = host.player && host.player.data && host.player.data.derived && host.player.data.derived.hullBurstKind;
  if (!impulseOn || !tumbleOn) return { host, reason: 'production feel flags off' };
  if (fitted !== kind) return { host, reason: `the ${moduleId} burst is not in the derived stats (${fitted})` };
  return { host };
}

/**
 * One throw. The player closes on a parked hostile at `playerSpeed`, the burst is lit on tick 1, and
 * the hostile is traced until FLIGHT_S after the hit lands.
 */
async function runThrow(seed, { hullId, playerSpeed, targetX, tag, throttle = 0, boost = false, burst = true }) {
  const boot = await bootBumper(seed);
  if (boot.reason) return { measured: false, tag, reason: boot.reason };
  const { host } = boot;
  const player = host.player;
  // Initial conditions are set before the first step (a velocity written after a step is not the
  // body's: the physics owner reads it once, at spawn, exactly as the hostile's is in feel.fling_scene).
  player.vel.x = playerSpeed;
  player.vel.z = 0;
  const target = spawnHostileHull(host, hullId, { x: targetX, z: 0 });
  host.step(1);

  const hits = [];
  const tumbled = [];
  let activated = false;
  host.bus.on('hullBurst:activated', () => { activated = true; });
  host.bus.on('hullBurst:hit', (p) => { if (p && p.targetId === target.id) hits.push({ tick: host.state.tick | 0, ...p }); });
  host.bus.on('combat:tumbled', (p) => { if (p && p.victimId === target.id) tumbled.push({ tick: p.tick, durationS: p.durationS, source: p.source }); });
  // Every contact the target has with another ship (the player is the only other ship in these arms): the
  // player's own ram. A throw is only a throw if the hull is not rammed again afterwards.
  const rams = [];
  host.bus.on('combat:collisionConsequence', (p) => {
    if (p && p.targetId === target.id && p.otherType === 'ship') rams.push({ tick: p.tick == null ? (host.state.tick | 0) : p.tick, deltaV: finite(p.deltaV) });
  });

  const startTick = host.state.tick | 0;
  const trace = [];
  let lit = false;
  let hitPos = null;
  let endTick = null;
  let readTick = null;
  let distanceAtRead = 0;
  let playerSpeedBeforeHit = 0;
  host.step(60 * 12, {
    before: ({ state }) => {
      if (burst && !lit) { lit = light(host); }
      // Hands off unless the arm says otherwise: the flight assist settles a hull to rest, so an
      // arm that needs an ARRIVAL SPEED keeps its throttle open until the wedge has hit.
      writeRealPathInput(state, (hits.length || rams.length) ? {} : { moveZ: throttle, boost });
    },
    after: ({ state }) => {
      const tick = state.tick | 0;
      if (!hits.length && !rams.length) playerSpeedBeforeHit = Math.hypot(finite(player.vel.x), finite(player.vel.z));
      trace.push({
        tick, x: finite(target.pos.x), z: finite(target.pos.z),
        vx: finite(target.vel.x), vz: finite(target.vel.z),
        speed: Math.hypot(finite(target.vel.x), finite(target.vel.z)),
        tumbling: readTumbleStatus(state, target) !== null, recovering: isRecovering(state, target),
        alive: target.alive !== false,
      });
      // The reference is the burst's hit; with no burst lit (the control arm) it is the first contact.
      if ((hits.length || (!burst && rams.length)) && !hitPos) {
        hitPos = { x: finite(target.pos.x), z: finite(target.pos.z) };
        readTick = tick + Math.round(FLIGHT_S / DT);
        endTick = tick + Math.round(TRACE_S / DT);
      }
      if (readTick != null && tick === readTick) {
        distanceAtRead = Math.hypot(finite(target.pos.x) - hitPos.x, finite(target.pos.z) - hitPos.z);
      }
      if (endTick != null && tick >= endTick) return false;
      return undefined;
    },
  });

  const hit = hits[0] || null;
  const distance = hitPos ? distanceAtRead : 0;
  const hitTick = hit ? hit.tick : (rams[0] ? rams[0].tick : null);
  // Contacts AFTER the burst's hit: the player bulldozing the hull it just threw.
  const ramsAfterHit = hit ? rams.filter((r) => r.tick > hit.tick) : rams;
  let peakSpeed = 0;
  for (const s of trace) if (hitTick != null && s.tick >= hitTick) peakSpeed = Math.max(peakSpeed, s.speed);
  const stun = tumbled[0] || null;
  // The buzz test: after the helm returns, is the hull still moving away from the player?
  let outboundAtStunEnd = null;
  if (hit && stun) {
    const sample = trace.find((s) => s.tick > hit.tick && !s.tumbling);
    if (sample) outboundAtStunEnd = round(sample.vx, 2);
  }
  return {
    measured: true,
    tag,
    hullId,
    playerSpeed,
    playerSpeedAtHit: round(playerSpeedBeforeHit, 1),
    lit: activated,
    hit: hit ? { deltaV: round(hit.deltaV, 2), closing: round(hit.closing, 2), hostile: hit.hostile, tick: hit.tick - startTick } : null,
    targetMass: round(finite(target.mass, 1), 1),
    stunS: stun ? round(stun.durationS, 3) : 0,
    flightDistanceWu: round(distance, 1),
    peakSpeed: round(peakSpeed, 1),
    playerRams: ramsAfterHit.length,
    playerRamDeltaV: round(ramsAfterHit.reduce((m, r) => Math.max(m, r.deltaV), 0), 1),
    outboundAtStunEnd,
    alive: target.alive !== false,
    realPathProof: host.proof(),
  };
}

/**
 * Three Wasps in front of a rock wall, one full-speed pass. The pilot brakes once the wedge has done
 * its work so the player does not ride into the wall it is trying to throw hulls at.
 */
async function runField(seed) {
  const boot = await bootBumper(seed, {
    systems: [...BUMPER_SYSTEMS, lootShards, mining, ships, cargo, economy],
    playerPos: { x: -700, z: 0 },
  });
  if (boot.reason) return { measured: false, tag: 'field3', reason: boot.reason };
  const { host } = boot;
  const player = host.player;
  const derivedCap = player.data && player.data.derived && player.data.derived.cargoCap;
  if (Number.isFinite(derivedCap) && host.state.player && host.state.player.cargo) host.state.player.cargo.capVolume = derivedCap;
  const rocks = [-120, -40, 40, 120].map((z) => host.spawnObstacle({
    pos: { x: -200, z }, radius: ROCK_RADIUS_WU, mass: 5000, inertiaY: 5000, hull: 4000,
  }));
  player.vel.x = 200;
  player.vel.z = 0;
  const wasps = [-60, 0, 60].map((z) => spawnHostile(host, 'wasp_swarmer', { x: -430, z }));
  host.step(1);
  const walletBefore = finite(host.state.player && host.state.player.credits);

  const waspIds = new Set(wasps.map((w) => w.id));
  const killed = [];
  const hits = [];
  let activated = false;
  host.bus.on('hullBurst:activated', () => { activated = true; });
  const collected = [];
  const overflow = [];
  const drops = [];
  host.bus.on('entity:killed', (p) => { if (p && waspIds.has(p.id)) killed.push({ id: p.id, killerId: p.killerId == null ? null : p.killerId, tick: host.state.tick | 0 }); });
  host.bus.on('hullBurst:hit', (p) => { if (p) hits.push({ targetId: p.targetId, deltaV: round(p.deltaV, 1), closing: round(p.closing, 1) }); });
  host.bus.on('loot:drop', (p) => { drops.push({ tick: host.state.tick | 0, items: p && p.items ? p.items.length : 0 }); });
  host.bus.on('pickup:collected', (p) => {
    if (p) collected.push({ tick: host.state.tick | 0, pickupId: p.pickupId, accepted: finite(p.acceptedAmount), kind: p.kind });
  });
  host.bus.on('loot:overflowConverted', (p) => { if (p) overflow.push({ tick: host.state.tick | 0, credits: finite(p.credits) }); });

  const startTick = host.state.tick | 0;
  let lit = false;
  let braked = false;
  const pickupLives = new Map();
  let pickupsSeen = 0;
  host.step(60 * 25, {
    before: ({ state }) => {
      if (!lit) lit = light(host);
      // Brake once the hulls are past the player, so the pass ends before the wall.
      if (!braked && hits.length >= wasps.length) braked = true;
      writeRealPathInput(state, braked ? { brake: true } : { moveZ: 1, boost: true });
    },
    after: ({ state }) => {
      const list = state.entityList || [];
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (!e || e.type !== 'pickup') continue;
        const life = pickupLives.get(e.id);
        if (life && life.entity === e) continue;
        pickupsSeen++;
        pickupLives.set(e.id, { entity: e, seenTick: state.tick | 0, leftTick: null });
      }
      for (const [id, life] of pickupLives) {
        if (life.leftTick != null) continue;
        const live = state.entities && state.entities.get ? state.entities.get(id) : null;
        if (!live || live !== life.entity || live.alive === false) life.leftTick = state.tick | 0;
      }
      return undefined;
    },
  });
  const stranded = [...pickupLives.values()].filter((l) => l.leftTick == null).length;
  const lastKillTick = killed.reduce((m, k) => Math.max(m, k.tick), 0);
  const lastLeftTick = [...pickupLives.values()].reduce((m, l) => Math.max(m, l.leftTick == null ? 0 : l.leftTick), 0);
  return {
    measured: true,
    tag: 'field3',
    rocks: rocks.length,
    lit: activated,
    hostiles: wasps.length,
    burstHits: hits.length,
    killed: killed.length,
    killedCreditedToPlayer: killed.filter((k) => k.killerId === player.id).length,
    lootDrops: drops.length,
    pickupsSeen,
    pickupsStranded: stranded,
    landedShare: pickupsSeen > 0 ? round((pickupsSeen - stranded) / pickupsSeen, 3) : null,
    overflowConverted: overflow.length,
    // Kill loot is banked in the salvage bay (slice D), not the trade hold: what the pass put where.
    bayUnits: bayUnits(host.state),
    holdUsed: round(finite(host.state.player && host.state.player.cargo && host.state.player.cargo.usedVolume), 1),
    walletDelta: round(finite(host.state.player && host.state.player.credits) - walletBefore, 1),
    secondsLastKillToLastLanding: killed.length && lastLeftTick ? round(Math.max(0, lastLeftTick - lastKillTick) * DT, 2) : null,
    startTick,
    realPathProof: host.proof(),
  };
}

/**
 * FIRE LANCE. A full-speed pass down a line of three live Wasps (loot systems live) and one Warden-class heavy:
 * kills caused by the lance and credited to the player, loot that lands with no pilot input, and whether the
 * heavy survives the touch and is burning. Damage is the combat kernel's; nothing here writes a hull.
 */
async function runLance(seed) {
  const boot = await bootBumper(seed, {
    systems: [...BUMPER_SYSTEMS, lootShards, mining, ships, cargo, economy],
    playerPos: { x: -700, z: 0 },
    moduleId: 'mod_fire_lance_s',
    kind: 'lance',
  });
  if (boot.reason) return { measured: false, tag: 'lance', reason: boot.reason };
  const { host } = boot;
  const player = host.player;
  const derivedCap = player.data && player.data.derived && player.data.derived.cargoCap;
  if (Number.isFinite(derivedCap) && host.state.player && host.state.player.cargo) host.state.player.cargo.capVolume = derivedCap;
  player.vel.x = 200;
  player.vel.z = 0;
  // Three Wasps down the line of flight, and a heavy well off it that the pass never reaches, plus a second
  // heavy squarely in the line last so the lance meets it.
  const wasps = [-470, -420, -370].map((x) => spawnHostile(host, 'wasp_swarmer', { x, z: 0 }));
  const warden = spawnHostileHull(host, 'ship_warden', { x: -250, z: 0 });
  host.step(1);
  const walletBefore = finite(host.state.player && host.state.player.credits);
  const waspIds = new Set(wasps.map((w) => w.id));
  const killed = [];
  const hits = [];
  let activated = false;
  host.bus.on('hullBurst:activated', () => { activated = true; });
  host.bus.on('entity:killed', (p) => { if (p && waspIds.has(p.id)) killed.push({ id: p.id, killerId: p.killerId == null ? null : p.killerId, tick: host.state.tick | 0 }); });
  host.bus.on('hullBurst:hit', (p) => { if (p) hits.push({ targetId: p.targetId, damage: round(p.damage, 1), scale: round(p.scale, 2), stacks: p.burnStacks, lethal: !!p.lethal }); });
  const pool = (e) => finite(e.hull) + finite(e.shield) + finite(e.armorHp);
  const wardenPool0 = pool(warden);
  let wardenBurnSeen = false;
  let lit = false;
  const pickupLives = new Map();
  let pickupsSeen = 0;
  host.step(60 * 20, {
    before: ({ state }) => {
      if (!lit) lit = light(host);
      writeRealPathInput(state, lit && hits.length >= 4 ? { brake: true } : { moveZ: 1, boost: true });
    },
    after: ({ state }) => {
      const list = state.entityList || [];
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (!e || e.type !== 'pickup') continue;
        const life = pickupLives.get(e.id);
        if (life && life.entity === e) continue;
        pickupsSeen++;
        pickupLives.set(e.id, { entity: e, leftTick: null });
      }
      for (const [id, life] of pickupLives) {
        if (life.leftTick != null) continue;
        const live = state.entities && state.entities.get ? state.entities.get(id) : null;
        if (!live || live !== life.entity || live.alive === false) life.leftTick = state.tick | 0;
      }
      // Statuses live on the combat runtime's record for the entity, not on the entity.
      const record = state.combat && state.combat.entities ? state.combat.entities[String(warden.id)] : null;
      if (!wardenBurnSeen && record && JSON.stringify(record).includes('status_burning')) wardenBurnSeen = true;
      return undefined;
    },
  });
  const stranded = [...pickupLives.values()].filter((l) => l.leftTick == null).length;
  return {
    measured: true,
    tag: 'lance',
    lit: activated,
    hostiles: wasps.length,
    hits,
    killed: killed.length,
    killedCreditedToPlayer: killed.filter((k) => k.killerId === player.id).length,
    pickupsSeen,
    pickupsStranded: stranded,
    landedShare: pickupsSeen > 0 ? round((pickupsSeen - stranded) / pickupsSeen, 3) : null,
    walletDelta: round(finite(host.state.player && host.state.player.credits) - walletBefore, 1),
    wardenAlive: warden.alive !== false,
    wardenPoolLostShare: round(1 - pool(warden) / Math.max(1, wardenPool0), 3),
    wardenBurnSeen,
    playerAlive: player.alive !== false,
    realPathProof: host.proof(),
  };
}

/**
 * GRIP BUMPER. The player closes on a parked light hostile, the wedge catches it, and it rides the nose.
 *   ram    the pilot holds course into a rock: the carried hull is the battering ram. The kill is the player's.
 *   cut    the pilot presses the key again after a beat: the hostage is released faster than the player flies.
 * Reports how tightly the hostage rides the nose socket, and whatever the hostage did to the world.
 */
async function runGrip(seed, { cutAfterS = null, tag }) {
  const boot = await bootBumper(seed, {
    systems: [...BUMPER_SYSTEMS, lootShards, mining, ships, cargo, economy],
    playerPos: { x: -700, z: 0 },
    moduleId: 'mod_grip_bumper_s',
    kind: 'grip',
  });
  if (boot.reason) return { measured: false, tag, reason: boot.reason };
  const { host } = boot;
  const player = host.player;
  const derivedCap = player.data && player.data.derived && player.data.derived.cargoCap;
  if (Number.isFinite(derivedCap) && host.state.player && host.state.player.cargo) host.state.player.cargo.capVolume = derivedCap;
  player.vel.x = 200;
  player.vel.z = 0;
  const rock = cutAfterS == null ? host.spawnObstacle({ pos: { x: 120, z: 0 }, radius: ROCK_RADIUS_WU * 1.5, mass: 9000, inertiaY: 9000, hull: 4000 }) : null;
  const wasp = spawnHostileHull(host, 'ship_wasp', { x: -500, z: 0 });
  host.step(1);
  const walletBefore = finite(host.state.player && host.state.player.credits);
  let activated = false;
  let caughtTick = null;
  let released = null;
  const killed = [];
  host.bus.on('hullBurst:activated', () => { activated = true; });
  host.bus.on('hullBurst:hit', (p) => { if (p && p.caught && caughtTick == null) caughtTick = host.state.tick | 0; });
  host.bus.on('hullBurst:released', (p) => { if (p) released = { tick: host.state.tick | 0, reason: p.reason, deltaV: round(p.deltaV, 1) }; });
  host.bus.on('entity:killed', (p) => { if (p && p.id === wasp.id) killed.push({ killerId: p.killerId == null ? null : p.killerId, tick: host.state.tick | 0 }); });
  const pickupLives = new Map();
  let pickupsSeen = 0;
  let maxSeparation = 0;
  let sumSeparation = 0;
  let carrySamples = 0;
  let outboundAfterRelease = null;
  let lit = false;
  let cutSent = false;
  host.step(60 * 14, {
    before: ({ state }) => {
      if (!lit) lit = light(host);
      // A press of the key AFTER the catch, cutAfterS later, lets the hostage go.
      if (cutAfterS != null && !cutSent && caughtTick != null && ((state.tick | 0) - caughtTick) >= cutAfterS * 60) {
        state.input.actions.hullBurst = true;
        cutSent = true;
      }
      const stop = killed.length > 0 || released != null;
      writeRealPathInput(state, stop ? { brake: true } : { moveZ: 1, boost: true });
    },
    after: ({ state }) => {
      // How tightly the hostage rides the nose socket once it is caught and pulled in (after 1 s).
      if (caughtTick != null && released == null && wasp.alive !== false && ((state.tick | 0) - caughtTick) >= 60) {
        const fx = Math.cos(finite(player.rot));
        const fz = Math.sin(finite(player.rot));
        const reach = finite(player.radius, 12) + finite(wasp.radius, 8) + 4;
        const sep = Math.hypot(finite(wasp.pos.x) - (finite(player.pos.x) + fx * reach), finite(wasp.pos.z) - (finite(player.pos.z) + fz * reach));
        maxSeparation = Math.max(maxSeparation, sep);
        sumSeparation += sep;
        carrySamples++;
      }
      if (released && outboundAfterRelease == null && ((state.tick | 0) - released.tick) >= 6) {
        outboundAfterRelease = round(finite(wasp.vel.x) - finite(player.vel.x), 1);
      }
      const list = state.entityList || [];
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (!e || e.type !== 'pickup') continue;
        const life = pickupLives.get(e.id);
        if (life && life.entity === e) continue;
        pickupsSeen++;
        pickupLives.set(e.id, { entity: e, leftTick: null });
      }
      for (const [id, life] of pickupLives) {
        if (life.leftTick != null) continue;
        const live = state.entities && state.entities.get ? state.entities.get(id) : null;
        if (!live || live !== life.entity || live.alive === false) life.leftTick = state.tick | 0;
      }
      return undefined;
    },
  });
  const stranded = [...pickupLives.values()].filter((l) => l.leftTick == null).length;
  return {
    measured: true,
    tag,
    lit: activated,
    caught: caughtTick != null,
    catchTick: caughtTick,
    carrySamples,
    maxSeparationWu: round(maxSeparation, 2),
    meanSeparationWu: round(carrySamples ? sumSeparation / carrySamples : 0, 2),
    released,
    outboundAfterReleaseWuS: outboundAfterRelease,
    killed: killed.length,
    killedCreditedToPlayer: killed.filter((k) => k.killerId === player.id).length,
    hostageAlive: wasp.alive !== false,
    pickupsSeen,
    pickupsStranded: stranded,
    walletDelta: round(finite(host.state.player && host.state.player.credits) - walletBefore, 1),
    rock: !!rock,
    realPathProof: host.proof(),
  };
}

export const scenario = {
  id: 'feel.bumper_scene',
  label: 'BUMPER Gravity Bumper yardstick: crawl vs swing fling distance, heavy shrug, three Wasps into a rock wall',
  async run(seed) {
    // A real crawl: the target starts OUTSIDE the wedge's reach and the player closes on it slowly, so the hit
    // lands at a small but real closing speed (not a stationary player, which is a different case).
    const crawl = await runThrow(seed, { hullId: 'ship_wasp', playerSpeed: 20, targetX: 150, tag: 'crawl', throttle: 0.1 });
    const swing = await runThrow(seed, { hullId: 'ship_wasp', playerSpeed: 200, targetX: 260, tag: 'swing', throttle: 1, boost: true });
    const medium = await runThrow(seed, { hullId: 'ship_drifter', playerSpeed: 200, targetX: 260, tag: 'swing_medium', throttle: 1, boost: true });
    const heavy = await runThrow(seed, { hullId: 'ship_warden', playerSpeed: 200, targetX: 260, tag: 'swing_heavy', throttle: 1, boost: true });
    // The control: the same approach at the same Warden with the burst NEVER lit. Whatever this hull does is the
    // player's own ram; the burst has to beat it, not be it.
    const control = await runThrow(seed, { hullId: 'ship_warden', playerSpeed: 200, targetX: 260, tag: 'control_heavy', throttle: 1, boost: true, burst: false });
    const field = await runField(seed);
    const lance = await runLance(seed);
    const gripRam = await runGrip(seed, { tag: 'grip_ram' });
    const gripCut = await runGrip(seed, { tag: 'grip_cut', cutAfterS: 1.6 });

    const targets = [];
    const push = (id, label, value, unit, met, note) => targets.push({ id, label, value, unit, met: !!met, ...(note ? { note } : {}) });
    if (crawl.measured && crawl.hit) {
      push('crawl.valid', 'the crawl arm really is a slow approach: closing speed at the hit (WU/s)',
        crawl.hit.closing, 'WU/s', crawl.hit.closing >= 5 && crawl.hit.closing <= 40,
        `player ${crawl.playerSpeedAtHit} WU/s at the hit; wanted between 5 and 40`);
    }
    if (crawl.measured && swing.measured) {
      const ratio = swing.flightDistanceWu / Math.max(1, crawl.flightDistanceWu);
      push('ratio.swingToCrawl', 'flight distance in 3 s: full-speed arrival over a crawl-speed touch',
        round(ratio, 2), 'x', ratio >= BUMPER_TARGETS.swingToCrawlDistanceRatio,
        `crawl ${crawl.flightDistanceWu} WU (closing ${crawl.hit && crawl.hit.closing}, dV ${crawl.hit && crawl.hit.deltaV}), swing ${swing.flightDistanceWu} WU (closing ${swing.hit && swing.hit.closing}, dV ${swing.hit && swing.hit.deltaV}); target >= ${BUMPER_TARGETS.swingToCrawlDistanceRatio}x`);
      push('swing.lightFlight', 'a full-speed arrival throws a light hull this far in 3 s',
        swing.flightDistanceWu, 'WU', swing.flightDistanceWu >= BUMPER_TARGETS.lightSwingFlightWu,
        `stun ${swing.stunS} s, peak ${swing.peakSpeed} WU/s, outbound at helm return ${swing.outboundAtStunEnd}; target >= ${BUMPER_TARGETS.lightSwingFlightWu}`);
    }
    if (swing.measured && swing.outboundAtStunEnd != null) {
      push('swing.noBuzz', 'outbound speed of the thrown hull the moment its helm returns (never a hull hovering or coming back)',
        swing.outboundAtStunEnd, 'WU/s', swing.outboundAtStunEnd >= BUMPER_TARGETS.outboundAtHelmReturnWuS,
        `target >= ${BUMPER_TARGETS.outboundAtHelmReturnWuS}`);
    }
    if (swing.measured && medium.measured) {
      // The player must not bulldoze what it just threw: a thrown hull leaves the nose faster than the
      // player flies, so there is no second contact. If there is, the "flight distance" is the player's own
      // ram, not the burst (found in review: every swing arm had converged on the player's speed). Light
      // and medium hulls must clear the nose. A heavy is thrown slower than the player flies BY DESIGN
      // ("shoved hard but keeps flying") and may be caught: the control arm shows what that means.
      push('noRam', 'contacts between the player and a light / medium hull the wedge just threw',
        swing.playerRams + medium.playerRams, 'contacts', swing.playerRams === 0 && medium.playerRams === 0,
        `light ${swing.playerRams} (leaves at ${swing.peakSpeed} WU/s), medium ${medium.playerRams} (leaves at ${medium.peakSpeed}), both vs the player's ${swing.playerSpeedAtHit}/${medium.playerSpeedAtHit}; heavy ${heavy.measured ? heavy.playerRams : '?'} contacts`);
    }
    if (swing.measured && heavy.measured && swing.hit && heavy.hit) {
      // What the WEDGE delivers (the player keeps flying at whatever it just threw and can hit a slow one
      // again, so a flight distance mixes in an ordinary contact), and whether the heavy keeps its helm.
      const shrug = heavy.hit.deltaV / Math.max(1e-6, swing.hit.deltaV);
      push('heavy.shrug', 'delta-V the wedge gives a heavy hull, as a share of what it gives a light hull at the same arrival speed',
        round(shrug, 3), 'fraction', shrug <= BUMPER_TARGETS.heavyShrugRatio,
        `light ${swing.hit.deltaV} WU/s (mass ${swing.targetMass}), medium ${medium.hit ? medium.hit.deltaV : '?'} (mass ${medium.targetMass}), heavy ${heavy.hit.deltaV} (mass ${heavy.targetMass}); target <= ${BUMPER_TARGETS.heavyShrugRatio}`);
      push('heavy.keepsHelm', 'a heavy hull loses its helm for this share of what a light hull does to the same hit',
        round(heavy.stunS / Math.max(1e-6, swing.stunS), 3), 'fraction', heavy.stunS <= BUMPER_TARGETS.heavyHelmLossShare * swing.stunS,
        `heavy ${heavy.stunS} s vs light ${swing.stunS} s; target <= ${BUMPER_TARGETS.heavyHelmLossShare}`);
      if (control.measured) {
        // Informational, not a target: with the burst NEVER lit the player still carries a Warden along at
        // its own speed (a light ship shoves a heavy one at 280 WU/s), because the player is not slowed by
        // what it touches (the no-physics-damage ruling). That bulldozer is the baseline the burst adds to.
        push('control.bulldozer', 'INFO: with no burst, a Warden the player rams at speed is carried along at (WU/s peak)',
          control.peakSpeed, 'WU/s', true,
          `${control.playerRams} contacts, ${control.flightDistanceWu} WU in 3 s; with the burst: ${heavy.flightDistanceWu} WU after a ${heavy.stunS} s helm loss`);
      }
    }
    if (field.measured) {
      push('field.hits', 'hostile hulls the wedge threw, of three', field.burstHits, 'hulls', field.burstHits === field.hostiles);
      push('field.kills', 'kills credited to the player with no gun fired',
        field.killedCreditedToPlayer, 'kills', field.killedCreditedToPlayer >= BUMPER_TARGETS.fieldKillsCreditedToPlayer,
        `${field.killed} of ${field.hostiles} died; target >= ${BUMPER_TARGETS.fieldKillsCreditedToPlayer} credited`);
      push('field.landed', 'share of spawned loot the hull accepts with no pilot input',
        field.landedShare, 'fraction', field.landedShare === BUMPER_TARGETS.fieldLandedShare,
        `${field.pickupsStranded} still floating; ${field.overflowConverted} refused ore paid credits; wallet +${field.walletDelta}`);
      push('field.bay', 'kill loot goes to the salvage bay and the trade hold stays empty (bay units / hold volume)',
        field.bayUnits, 'units', field.bayUnits > 0 && field.holdUsed === 0,
        `bay ${field.bayUnits} units, hold ${field.holdUsed}`);
    }

    if (lance.measured) {
      push('lance.kills', 'Fire Lance: kills credited to the player, of three Wasps in the line of flight (no gun fired)',
        lance.killedCreditedToPlayer, 'kills', lance.killedCreditedToPlayer === lance.hostiles,
        `${lance.killed} of ${lance.hostiles} died; hits ${JSON.stringify(lance.hits)}`);
      push('lance.landed', 'Fire Lance: share of spawned loot the hull accepts with no pilot input',
        lance.landedShare, 'fraction', lance.landedShare === BUMPER_TARGETS.fieldLandedShare,
        `${lance.pickupsSeen} pickups, ${lance.pickupsStranded} still floating; wallet +${lance.walletDelta}`);
      push('lance.heavyBurns', 'Fire Lance: a Warden-class hull in the line survives the touch and is burning',
        lance.wardenAlive && lance.wardenBurnSeen ? 1 : 0, 'bool', lance.wardenAlive && lance.wardenBurnSeen,
        `alive ${lance.wardenAlive}, burning seen ${lance.wardenBurnSeen}, shield+armour+hull lost ${lance.wardenPoolLostShare}`);
    }

    if (gripRam.measured) {
      push('grip.caught', 'Grip Bumper: a light hostile in the line of flight is caught on the nose', gripRam.caught ? 1 : 0, 'bool', gripRam.caught,
        `caught at tick ${gripRam.catchTick}`);
      push('grip.rides', 'Grip Bumper: the hostage rides the nose socket (largest distance from it, WU, after the first second of carry)',
        gripRam.maxSeparationWu, 'WU', gripRam.carrySamples > 0 && gripRam.maxSeparationWu <= BUMPER_TARGETS.gripMaxSeparationWu,
        `${gripRam.carrySamples} samples; target <= ${BUMPER_TARGETS.gripMaxSeparationWu}`);
      push('grip.ram', 'Grip Bumper: the carried hull is a battering ram: it dies on the rock and the kill is the player\'s',
        gripRam.killedCreditedToPlayer, 'kills', gripRam.killedCreditedToPlayer === 1,
        `killed ${gripRam.killed}, credited ${gripRam.killedCreditedToPlayer}; loot ${gripRam.pickupsSeen} pickups, ${gripRam.pickupsStranded} floating, wallet +${gripRam.walletDelta}`);
    }
    if (gripCut.measured) {
      push('grip.cut', 'Grip Bumper: pressing the key again releases the hostage ahead of the player (its speed relative to the player, WU/s)',
        gripCut.outboundAfterReleaseWuS, 'WU/s', gripCut.released && gripCut.released.reason === 'cut' && gripCut.outboundAfterReleaseWuS != null && gripCut.outboundAfterReleaseWuS > 0,
        `released ${JSON.stringify(gripCut.released)}; hostage alive ${gripCut.hostageAlive}`);
    }

    return {
      metrics: {
        schema: 'spaceface.feel.bumperScene.v1',
        realPathProof: (crawl && crawl.realPathProof) || null,
        targetsDefinition: BUMPER_TARGETS,
        crawl, swing, medium, heavy, control, field, lance, gripRam, gripCut,
        targets,
      },
    };
  },
};

export default scenario;
