#!/usr/bin/env node
// scripts/bench-gun-curve.mjs — OVH-08a: measure the gun curve (bench only, no tuning).
//
// Design: design/overhaul/03_COMBAT.md §3.1 (ruling R5: every gun trades damage for kick). The
// family bands live in src/data/gunFamilies.js; this bench measures every weapon against them.
//
// Harness: the same headless combat route scripts/bench-displacement-ttk.mjs uses — the real
// createCombatKernel + collisionConsequences + buildWeaponDamagePacket under PRODUCTION_FEATURES
// (weaponImpulseConsequences ON), routed per hit like the U11 GUNFIRE tactic. Scenario: one Wasp
// (wasp_swarmer: hull 55 / armor 8 / shield 25, mass 16 t) at mid range (~150 WU ahead of the
// shooter, seeded spawn jitter); the shooter holds the trigger; hits arrive along +x so kick
// pushes the Wasp away along the shot line.
//
// Recorded per weapon (median over seeds): time-to-kill; displacement per second of fire in WU/s
// and in the screen-depth unit FEEL_CONTRACT B5 uses (SCREEN_DEPTH_WU = 126 WU, combatDefs
// INERTIAL_SHUNT_TUNING.screenDepthWu); a one-hit B5 probe (fire one hit, drift exactly 2 s —
// 120 integration steps — depth moved); time to overheat from the authored heat fields paced
// like the player's mounts (dissip × 1.15, peg → 2/1.15 s forced vent — weapons.js
// WEAPON_RECHARGE_MULT/WEAPON_VENT_S). Fire cadence is the live `_cooldown` rule — 1/rof seconds
// counted down in 1/60 ticks until the chain reads zero (fireIntervalTicks), not a rounded
// interval. A mortarShell weapon runs the real shell lifecycle: flight, the authored pull
// window, then the falloff blast — never an instant impact-plus-full-blast.
//
// Scope honesty: only the shared weapon/damage/impulse code is measured. Payloads applied
// outside the damage packet (emergent mass driver / sticky impulse, DEPLOY verbs) are noted in
// the row, never invented. Capacitor economy and shield regen are not modeled (U11 precedent:
// effective HP is static); heat is the pacing metric here.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { mulberry32 } from '../src/core/rng.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  applyFeatureConfigToMaps,
  PRODUCTION_FEATURES,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import {
  GUN_FAMILY_BANDS,
  GUN_FAMILY_BY_WEAPON_ID,
  SCREEN_DEPTH_WU,
} from '../src/data/gunFamilies.js';
import { buildWeaponDamagePacket } from '../src/systems/weapons.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';

try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* best effort: background compute yields to the game */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const GUN_CURVE_DIR = path.join(ROOT, '.devshots', 'fleet', 'OVH-08a');
export const GUN_CURVE_MD_PATH = path.join(GUN_CURVE_DIR, 'gun-curve.md');
export const GUN_CURVE_JSON_PATH = path.join(GUN_CURVE_DIR, 'gun-curve.json');
// Packet ask (OVH-08a fix): the every-gun table also lands at .devshots/gun-curve/report.md.
export const GUN_REPORT_DIR = path.join(ROOT, '.devshots', 'gun-curve');
export const GUN_REPORT_MD_PATH = path.join(GUN_REPORT_DIR, 'report.md');

export const DEFAULT_SEEDS = Object.freeze([8081, 8082, 8083]);
const DT = 1 / 60;
const MAX_TICKS = 60 * 30;            // 30 s ceiling: the slowest honest killer fits; timers read "survived"
export const PROBE_TICKS = 60 * 2;    // the B5 window: 2 s of drift after one hit
const PLAYER_ID = 1;
const TARGET_ID = 2;
const TARGET_ENEMY_ID = 'wasp_swarmer';
const MID_RANGE_WU = 150;             // mid range: between the Wasp's preferred 180 WU stand-off and the 240+ WU gun ranges
// Player-facing heat pacing, copied from src/systems/weapons.js (WEAPON_RECHARGE_MULT and the
// vent it feeds): dissip runs 15 % hot, and a pegged gun force-vents for 2/1.15 s while dumping.
const PLAYER_HEAT_PACING = 1.15;
const WEAPON_VENT_S = 2 / PLAYER_HEAT_PACING;
const WEAPON_VENT_DUMP = 1.6 * PLAYER_HEAT_PACING;
// Projectile contact radius for the bench hull: modelTruthBoltRadius falls back to
// planar × (0.7/14) for an unmeasured body — 16 × 0.05 = 0.8 WU on the bench shooter.
const BENCH_BOLT_RADIUS_WU = 0.8;

// ── pure helpers (exercised by test/ovh-08a-gun-families.test.mjs on fixed input) ──────────

/** A DEPLOY-verb weapon never routes a direct-hit packet (it drops a mine/well entity instead). */
export function isDeployWeapon(weapon) {
  return !!weapon && weapon.tracking === 'deploy';
}

/** Continuous (beam) weapons apply damage every tick, not per trigger. */
export function isContinuousWeapon(weapon) {
  return !!weapon && (weapon.continuous === true || weapon.rof === 0);
}

/** The packets one trigger releases against a single target, from the authored structure only:
 * volley fans fire per-projectile damage/impulse; submunition splitters fire count × dmg×mult;
 * the singularity mortar's authored budget is its impact plus its authored blast — the bench
 * delivers them through the real shell lifecycle (flight, pull window, then falloff blast), so
 * this pair only ever feeds the authored kick-momentum metric, never the same-tick hit route.
 * Everything else is one authored hit. Ricochet/chain/return-arc geometry needs more hulls than
 * one Wasp — noted, not invented (single hit per trigger). */
export function triggerPackets(weapon) {
  if (!weapon) return [];
  if (weapon.mortarShell) {
    return [
      { label: 'impact', damage: weapon.dmg || 0, impulsePerHit: weapon.impulsePerHit },
      {
        label: 'blast',
        damage: weapon.mortarShell.blastDmg || 0,
        impulsePerHit: weapon.mortarShell.impulse || 0,
      },
    ];
  }
  if (weapon.submunitions && Number.isFinite(weapon.submunitions.count) && weapon.submunitions.count > 0) {
    const mult = Number.isFinite(weapon.submunitions.damageMult) ? weapon.submunitions.damageMult : 1;
    return Array.from({ length: weapon.submunitions.count }, () => ({
      label: 'submunition',
      damage: (weapon.dmg || 0) * mult,
      impulsePerHit: weapon.impulsePerHit,
    }));
  }
  if (weapon.volley && Number.isFinite(weapon.volley.count) && weapon.volley.count > 0) {
    return Array.from({ length: weapon.volley.count }, () => ({
      label: 'volley',
      damage: weapon.dmg || 0,
      impulsePerHit: weapon.impulsePerHit,
    }));
  }
  return [{ label: 'hit', damage: weapon.dmg || 0, impulsePerHit: weapon.impulsePerHit }];
}

/** The live fire interval in ticks. weapons.js sets `w._cooldown = armedCooldown(...)` = 1/rof
 * seconds at the shot (player run scales are 1 outside a live swarm run), and `_tickWeapons`
 * decrements it `Math.max(0, cd − dt)` once per tick BEFORE `_serviceProjectileWeapon` reads the
 * `_cooldown > 0` gate — so a mount refires on the first tick the sequential subtraction chain
 * reaches zero, not on a rounded 60/rof interval. Float makes the count exact-arithmetic-only:
 * Bank Stream M's 1/14 s takes five 1/60 decrements (round(60/14) = 4 fired it early), and even
 * 1/6 leaves a residue after ten decrements (rof 6 refires on tick 11). Reproducing the chain
 * step for step is the only honest count. */
export function fireIntervalTicks(weapon, dt = DT) {
  const rof = positive(weapon && weapon.rof, 0);
  if (!(rof > 0) || !(dt > 0)) return 1;
  let cooldown = 1 / rof;
  let ticks = 0;
  while (cooldown > 0) {
    cooldown = Math.max(0, cooldown - dt);
    ticks += 1;
  }
  return Math.max(1, ticks);
}

/** The mortar's radial falloff, verbatim from weapons.js `_mortarPullTick`/`_mortarDetonate`:
 * full inside the body radius, linear to zero at `radius` past it. */
export function mortarRadialFalloff(dist, bodyRadius, radius) {
  return Math.max(0, 1 - Math.max(0, dist - (bodyRadius || 0)) / radius);
}

/** §3.1 kick = momentum delivered per second of fire, from authored stats only. Pulled triggers
 * pay Σ(packets' impulse) × rof; beams pay impulsePerHit scaled by their per-second damage
 * fraction (resolveWeaponImpulseForHit's fraction, capped 4 as in the kernel). */
export function authoredKickMomentumPerS(weapon) {
  if (!weapon) return 0;
  if (isContinuousWeapon(weapon)) {
    const dps = Number.isFinite(weapon.dps) ? weapon.dps : (weapon.dmg || 0);
    const ref = positive(weapon.dmg, 0);
    const fraction = ref > 0 ? Math.min(dps / ref, 4) : 0;
    return (weapon.impulsePerHit || 0) * fraction;
  }
  const rof = positive(weapon.rof, 0);
  return triggerPackets(weapon).reduce((sum, packet) => sum + positive(packet.impulsePerHit, 0), 0) * rof;
}

/** Time to overheat under held fire, from the authored heat fields with the player's pacing.
 * Rules mirror src/systems/weapons.js: a mount with no positive heat cost has no active heatMax
 * (never overheats); shots land on the live cooldown cadence (fireIntervalTicks — the same
 * `_cooldown` decrement chain the weapon system ticks) and pay heatPerShot; beams pay heatPerSec
 * per second; heat dissipates at heatDissip × pacing every tick BEFORE the shot pays, matching
 * `_tickWeapons` running ahead of `_serviceShip` (paying first would bank cooling the clamp at 0
 * would have eaten). The peg is the first tick whose shot takes heat to heatMax. */
export function simulateHeat(weapon, options = {}) {
  const pacing = options.pacing != null ? options.pacing : PLAYER_HEAT_PACING;
  const dt = options.dt || DT;
  const maxS = options.maxS != null ? options.maxS : 120;
  if (!weapon) return { overheatS: null, reason: 'no_weapon' };
  const continuous = isContinuousWeapon(weapon) && !isDeployWeapon(weapon);
  const heatPerShot = positive(weapon.heatPerShot, 0);
  const heatPerSec = positive(weapon.heatPerSec, 0);
  const cost = continuous ? heatPerSec : heatPerShot;
  const heatMaxRaw = Number.isFinite(weapon.heatMax) ? weapon.heatMax : Infinity;
  const heatMax = cost > 0 && heatMaxRaw > 0 ? heatMaxRaw : Infinity;
  if (!Number.isFinite(heatMax)) return { overheatS: null, reason: 'no_authored_heat' };
  const dissip = positive(weapon.heatDissip, 0) * pacing;
  if (continuous) {
    const net = cost - dissip;
    if (net <= 0) return { overheatS: null, reason: 'dissipation_exceeds_heat' };
    return { overheatS: round(heatMax / net), reason: 'continuous_net_heat' };
  }
  const intervalTicks = fireIntervalTicks(weapon, dt);
  let heat = 0;
  const maxTicks = Math.ceil(maxS / dt);
  for (let tick = 0; tick <= maxTicks; tick++) {
    heat = Math.max(0, heat - dissip * dt);
    if (tick % intervalTicks === 0) {
      heat += cost;
      if (heat >= heatMax) return { overheatS: round(tick * dt), reason: 'pegged' };
    }
  }
  return { overheatS: null, reason: 'never_within_window' };
}

/** PASS/MISS of a measured row against a GUN_FAMILY_BANDS entry. A band with no clauses (Boom,
 * Trick) is '—' — measured, not banded. */
export function judgeAgainstBand(row, band) {
  const checks = [];
  const b = band || {};
  if (b.ttk && (b.ttk.min != null || b.ttk.max != null)) {
    if (row.ttkS == null) {
      checks.push({ clause: 'ttk', pass: false, detail: `no kill within ${round(MAX_TICKS * DT)} s` });
    } else {
      const passMin = b.ttk.min == null || row.ttkS >= b.ttk.min - 1e-9;
      const passMax = b.ttk.max == null || row.ttkS <= b.ttk.max + 1e-9;
      checks.push({ clause: 'ttk', pass: passMin && passMax, detail: `ttk ${row.ttkS} s vs [${b.ttk.min}..${b.ttk.max}] s` });
    }
  }
  if (b.shotsToKill && b.shotsToKill.max != null) {
    const pass = Number.isFinite(row.shotsToKill) && row.shotsToKill <= b.shotsToKill.max;
    checks.push({ clause: 'shotsToKill', pass, detail: `${row.shotsToKill} shots vs ≤ ${b.shotsToKill.max}` });
  }
  if (b.kick && b.kick.metric) {
    const value = row[b.kick.metric];
    if (value == null) {
      checks.push({ clause: b.kick.metric, pass: false, detail: 'unmeasured' });
    } else {
      const passMin = b.kick.min == null || value >= b.kick.min - 1e-9;
      const passMax = b.kick.max == null || value <= b.kick.max + 1e-9;
      checks.push({ clause: b.kick.metric, pass: passMin && passMax, detail: `${value} vs [${b.kick.min}..${b.kick.max}]` });
    }
  }
  if (!checks.length) return { verdict: '—', checks };
  return { verdict: checks.every((check) => check.pass) ? 'PASS' : 'MISS', checks };
}

// ── scenario harness (the U11 combat route, minus its rock: displacement is measured in open space) ──

function enemyById(id) {
  const found = ENEMY_TYPES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing enemy type ${id}`);
  return found;
}

function waspEntity(def, id, pos) {
  const radius = positive(def.collisionRadius, 12);
  const mass = positive(def.mass, 16);
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    factionId: def.factionId || 'faction_reach',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius,
    mass,
    hull: def.hull,
    hullMax: def.hull,
    armorHp: def.armor,
    armorMax: def.armor,
    armorFlat: def.armorFlat || 0,
    shield: def.shield,
    shieldMax: def.shield,
    cap: def.cap || 100,
    capMax: def.cap || 100,
    capRegen: def.capRegen || 0,
    flags: {},
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1 },
      physicsBody: { mass, radius, inertiaY: 0.5 * mass * radius * radius },
      shipClass: def.shipClass || 'fighter',
      ai: {
        archetype: def.aiArchetype || 'pirate',
        lawful: false,
        motive: 'ovh08a_measurement',
        engagementTrigger: 'ovh08a_measurement',
      },
      intent: { fire: true, moveX: 1, moveZ: 0, boost: false, brake: false },
      initialEffectiveHp: def.hull + def.armor + def.shield,
    },
  };
}

function playerEntity() {
  return {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_player',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 16,
    mass: 80,
    hull: 500,
    hullMax: 500,
    armorHp: 100,
    armorMax: 100,
    armorFlat: 2,
    shield: 120,
    shieldMax: 120,
    cap: 200,
    capMax: 200,
    flags: {},
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1 },
      physicsBody: { mass: 80, radius: 16, inertiaY: 10_240 },
    },
  };
}

function buildScenario(seed) {
  const rng = mulberry32(seed);
  const def = enemyById(TARGET_ENEMY_ID);
  const target = waspEntity(def, TARGET_ID, {
    x: round(MID_RANGE_WU - 6 + rng() * 12),   // mid range, U11-style spawn jitter
    z: round((rng() - 0.5) * 10),
  });
  const player = playerEntity();
  const state = {
    tick: 0,
    simTime: 0,
    mode: 'flight',
    playerId: PLAYER_ID,
    player: { targetId: TARGET_ID, tether: { active: false, targetId: null, phase: 'idle' } },
    entities: new Map([[player.id, player], [target.id, target]]),
    entityList: [player, target],
    entityIndex: { ships: [player, target] },
    combat: { beams: [], threatTables: new Map() },
    meta: { seed },
    rng,
    runtime: { features: PRODUCTION_FEATURES },
  };
  const metrics = { damage: { weapon: 0, collision: 0 }, physicsImpulses: [] };
  const bus = createBus();
  const helpers = {
    combatPhysics: {
      applyImpulse(input) {
        const entity = state.entities.get(input && input.entityId);
        if (!entity || entity.alive === false) return false;
        const mass = positive(entity.mass, 1);
        const impulse = input.impulse || {};
        entity.vel.x += finite(impulse.x) / mass;
        entity.vel.z += finite(impulse.z) / mass;
        metrics.physicsImpulses.push({
          tick: state.tick,
          entityId: entity.id,
          reason: input.reason || null,
          magnitude: round(Math.hypot(finite(impulse.x), finite(impulse.z))),
          provenance: input.provenance && input.provenance.tag || null,
        });
        return true;
      },
      applyTorqueImpulse(input) {
        const entity = state.entities.get(input && input.entityId);
        if (!entity || entity.alive === false) return false;
        const inertiaY = positive(entity.data?.physicsBody?.inertiaY, 0.5 * positive(entity.mass, 1) * positive(entity.radius, 1) ** 2);
        entity.angVel += finite(input.impulse && input.impulse.y) / inertiaY;
        return true;
      },
    },
  };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } }, {
    onKill: (entity, killerId, lethal) => {
      if (entity.alive === false) return;
      entity.alive = false;
      const origin = lethal && lethal.origin || {};
      const source = lethal && lethal.packet && lethal.packet.source || {};
      bus.emit('entity:killed', {
        id: entity.id,
        killerId,
        type: entity.type,
        pos: { x: entity.pos.x, z: entity.pos.z },
        cause: origin.kind === 'collision' ? 'collision' : origin.kind || source.kind || 'unknown',
        weaponId: origin.weaponId || origin.id || source.weaponId || null,
      });
    },
  });
  const registry = { get: (name) => (name === 'combat' ? { kernel } : null) };
  const consequences = Object.create(collisionConsequences);
  consequences.init({ state, bus, registry, helpers });
  const unsubs = [
    bus.on('combat:damage', (payload) => {
      const applied = finite(payload && payload.applied);
      if (payload && payload.targetId === TARGET_ID) {
        const originKind = payload && payload.origin && payload.origin.kind || null;
        if (originKind === 'collision') metrics.damage.collision += applied;
        else metrics.damage.weapon += applied;
      }
    }),
    bus.on('entity:killed', () => {}),
  ];
  return { state, target, bus, kernel, consequences, unsubs, metrics, helpers };
}

function teardown(scenario) {
  for (const off of scenario.unsubs) off();
  scenario.consequences.destroy();
  scenario.bus.clear();
}

function integratePhysics(state) {
  for (const entity of state.entityList) {
    if (!entity || entity.alive === false || !entity.vel) continue;
    const command = consumePhysicsCommand(entity);
    if (command) {
      for (const impulse of command.torqueImpulses || []) {
        const inertiaY = positive(entity.data?.physicsBody?.inertiaY, 0.5 * positive(entity.mass, 1) * positive(entity.radius, 1) ** 2);
        entity.angVel += finite(impulse.y) / inertiaY;
      }
    }
    entity.pos.x += finite(entity.vel.x) * DT;
    entity.pos.z += finite(entity.vel.z) * DT;
    entity.angVel *= 0.992;
    entity.rot += finite(entity.angVel) * DT;
  }
}

/** One hit routed through the real packet builder + damage router. A payload that differs from
 * the parent def (submunition / volley round / mortar blast) rides the instance `w` as its own
 * projectile so the impulse fraction reads 1 against its own dmg; a continuous beam's per-tick
 * slice (`slice`) keeps the def's authored dmg as the fraction denominator, exactly as the live
 * beam service does. */
function routePacket({ kernel, target, weapon, damage, impulsePerHit, slice = false }) {
  const hitPos = { x: target.pos.x - target.radius * 0.65, z: target.pos.z };
  const w = { defId: weapon.id };
  if (!slice && (damage !== (weapon.dmg || 0) || impulsePerHit !== weapon.impulsePerHit)) {
    w.dmg = damage;
    w.impulsePerHit = impulsePerHit;
  }
  const built = buildWeaponDamagePacket(w, weapon, damage, weapon.damageType, hitPos);
  built.hit = {
    ...(built.hit || {}),
    pos: hitPos,
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
  };
  kernel.routeDamage({
    attackerId: PLAYER_ID,
    targetId: TARGET_ID,
    packet: built,
    origin: { kind: 'weapon', id: weapon.id, weaponId: weapon.id },
  });
}

/** Player-mount heat runtime for the live loop: cadence fire, paced dissipation, and the real
 * peg → forced-vent lockout (WEAPON_VENT_S) with its dump rate, so TTK includes vent rhythm. */
function createHeatRuntime(weapon) {
  const continuous = isContinuousWeapon(weapon) && !isDeployWeapon(weapon);
  const cost = continuous ? positive(weapon.heatPerSec, 0) : positive(weapon.heatPerShot, 0);
  const heatMaxRaw = Number.isFinite(weapon.heatMax) ? weapon.heatMax : Infinity;
  const active = cost > 0 && heatMaxRaw > 0;
  const heatMax = active ? heatMaxRaw : Infinity;
  const dissip = positive(weapon.heatDissip, 0) * PLAYER_HEAT_PACING;
  let heat = 0;
  let ventUntilS = -1;
  let firstPegS = null;
  return {
    get firstPegS() { return firstPegS; },
    canFire(simS) {
      if (!active) return true;
      return simS >= ventUntilS && heat < heatMax;
    },
    pay(simS) {
      if (!active) return;
      heat += continuous ? cost * DT : cost;
      if (heat >= heatMax) {
        if (firstPegS == null) firstPegS = round(simS);
        heat = heatMax;
        ventUntilS = simS + WEAPON_VENT_S;   // the forced vent every pegged mount takes
      }
    },
    tick(simS) {
      if (!active) return;
      // Live order (weapons.js _tickWeapons): every mount sheds baseDissip × pacing each tick,
      // then _tickVent additionally dumps at the vent rate while the lockout runs.
      heat = Math.max(0, heat - dissip * DT);
      if (simS < ventUntilS) {
        heat = Math.max(0, heat - (heatMax / WEAPON_VENT_S) * WEAPON_VENT_DUMP * DT);
      }
    },
  };
}

/** One live mortar shell: `_spawnProjectile`'s launch model for a model-less shooter — the
 * muzzle falls back to the hull centre, the round flies dir × projSpeed (no inherited velocity
 * on a stationary shooter), and the authored `range` is its `maxDistance`. `_tickMortarShots`
 * lands it on contact (a body ate the round) or at maxDistance, runs the timed pull window, then
 * detonates once. The bench reproduces that sequence so the shell's travel time, the 1.1 s pull,
 * and the distance-falloff blast are all measured instead of invented on the trigger tick. */
export function spawnMortarShell(weapon, shooter, target) {
  const dx = target.pos.x - shooter.pos.x, dz = target.pos.z - shooter.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  return {
    pos: { x: shooter.pos.x, z: shooter.pos.z },
    spawn: { x: shooter.pos.x, z: shooter.pos.z },
    dir: { x: dx / dist, z: dz / dist },
    speed: positive(weapon.projSpeed, 300),
    maxDistance: positive(weapon.range, 600),
    cfg: weapon.mortarShell || {},
    phase: 'fly',
    pullUntil: null,
    contactS: null,
    detonateS: null,
  };
}

/** Advance every live shell one tick — the bench's `_tickMortarShots`. Fly → land → pull each
 * tick → detonate the first tick simTime reaches pullUntil (the live code pulls once more on the
 * detonation tick). `onImpact` routes the round's own hit packet on contact; `onDetonate`
 * delivers the radial blast. The pull excludes the shooter exactly like `_mortarPullTick`. */
export function stepMortarShells({ shells, target, simS, dt, onImpact, onDetonate }) {
  for (const shell of shells) {
    if (shell.phase === 'fly') {
      shell.pos.x += shell.dir.x * shell.speed * dt;
      shell.pos.z += shell.dir.z * shell.speed * dt;
      const flown = Math.hypot(shell.pos.x - shell.spawn.x, shell.pos.z - shell.spawn.z);
      const dx = target.pos.x - shell.pos.x, dz = target.pos.z - shell.pos.z;
      const contact = target.alive !== false && Math.hypot(dx, dz) <= (target.radius || 0) + BENCH_BOLT_RADIUS_WU;
      if (contact) {
        shell.contactS = simS;
        if (onImpact) onImpact(shell, target);
      }
      if (contact || flown >= shell.maxDistance) {
        shell.phase = 'pull';
        shell.pullUntil = simS + Math.max(0.1, Number(shell.cfg.pullS) || 1);
        // _mortarLand does not fall through to the pull branch — the window starts next tick.
      }
      continue;
    }
    if (shell.phase === 'pull') {
      const cfg = shell.cfg;
      const pull = Math.max(0, Number(cfg.pull) || 0);
      const radius = Math.max(1, Number(cfg.pullRadius) || 1);
      if (target.alive !== false && pull > 0) {
        const dx = shell.pos.x - target.pos.x, dz = shell.pos.z - target.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= 1e-4) {
          // _mortarPullTick: uniform acceleration with linear falloff, step capped at 1/30.
          const accel = pull * mortarRadialFalloff(dist, target.radius, radius);
          const step = Math.min(dt, 1 / 30);
          target.vel.x += (dx / dist) * accel * step;
          target.vel.z += (dz / dist) * accel * step;
        }
      }
      if (simS >= shell.pullUntil) {
        shell.phase = 'done';
        shell.detonateS = simS;
        if (onDetonate) onDetonate(shell, target);
      }
    }
  }
}

/** `_mortarDetonate` against the bench's one body: radial impulse 460×fall through the physics
 * port, blast damage 24×fall through the same scalarHitToDamagePacket + splash flag the live
 * route builds. A point-blank body gets the full authored blast; at the radius edge it fades to
 * nothing — never the full flat blast the old bench applied on the impact tick. */
function detonateMortarShell({ kernel, shell, weapon, target, applyImpulse }) {
  const cfg = shell.cfg;
  const blastR = Math.max(1, Number(cfg.blastRadius) || 1);
  const dmg = Number(cfg.blastDmg) || 0;
  const baseImpulse = Number(cfg.impulse) || 0;
  const dx = target.pos.x - shell.pos.x, dz = target.pos.z - shell.pos.z;
  const dist = Math.hypot(dx, dz);
  const fall = mortarRadialFalloff(dist, target.radius, blastR);
  const nx = dist > 1e-4 ? dx / dist : 0, nz = dist > 1e-4 ? dz / dist : 1;
  if (baseImpulse > 0 && fall > 0) {
    applyImpulse({
      entityId: target.id,
      impulse: { x: nx * baseImpulse * fall, z: nz * baseImpulse * fall },
      reason: 'mortar_blast',
      provenance: { tag: 'mortar_blast' },
    });
  }
  if (dmg > 0 && target.alive !== false) {
    kernel.routeDamage({
      attackerId: PLAYER_ID,
      targetId: target.id,
      packet: {
        ...scalarHitToDamagePacket({
          damage: dmg * fall, damageType: 'explosive',
          pos: { x: shell.pos.x, z: shell.pos.z },
          source: { kind: 'weapon_splash', weaponId: weapon.id },
        }),
        flags: { splash: true },
      },
      origin: { kind: 'weapon', id: weapon.id },
    });
  }
}

/** Held fire at one Wasp until it dies or the window closes. `probe` fires exactly one packet
 * (the B5 single-hit measurement) and never fires again; for a mortar that one trigger is the
 * real shell lifecycle. */
export function runOnce({ weapon, seed, probe = false }) {
  const scenario = buildScenario(seed);
  const { state, target, bus, kernel, consequences, metrics, helpers } = scenario;
  const player = state.entities.get(PLAYER_ID);
  const spawn = { x: target.pos.x, z: target.pos.z };
  const deploy = isDeployWeapon(weapon);
  const continuous = isContinuousWeapon(weapon);
  const mortar = !!weapon.mortarShell;
  const packets = deploy || mortar ? [] : triggerPackets(weapon);
  const dps = Number.isFinite(weapon.dps) ? weapon.dps : positive(weapon.dmg, 0);
  const heat = createHeatRuntime(weapon);
  const intervalTicks = fireIntervalTicks(weapon);
  const sliceDamage = round(dps * DT);
  const shells = [];
  const mortarLog = { fired: 0, contacts: 0, detonations: 0, firstContactS: null, firstDetonateS: null };
  let killTick = null;
  let triggers = 0;
  let packetsRouted = 0;
  let nextActionTick = 0;      // U11 cadence; a hot gun holds its shot (heat gates, cadence waits)
  const stepShells = (simS) => stepMortarShells({
    shells, target, simS, dt: DT,
    onImpact: (shell) => {
      routePacket({ kernel, target, weapon, damage: weapon.dmg || 0, impulsePerHit: weapon.impulsePerHit });
      packetsRouted++;
      mortarLog.contacts++;
      if (mortarLog.firstContactS == null) mortarLog.firstContactS = round(shell.contactS);
    },
    onDetonate: (shell) => {
      detonateMortarShell({ kernel, shell, weapon, target, applyImpulse: helpers.combatPhysics.applyImpulse });
      packetsRouted++;
      mortarLog.detonations++;
      if (mortarLog.firstDetonateS == null) mortarLog.firstDetonateS = round(shell.detonateS);
    },
  });
  const fireTrigger = () => {
    if (mortar) {
      shells.push(spawnMortarShell(weapon, player, target));
      mortarLog.fired++;
    } else {
      for (const packet of packets) {
        routePacket({ kernel, target, weapon, damage: packet.damage, impulsePerHit: packet.impulsePerHit });
      }
      packetsRouted += packets.length;
    }
    triggers++;
    heat.pay(state.simTime);
  };

  try {
    for (let tick = 0; tick <= MAX_TICKS; tick++) {
      // The B5 window is 120 integration steps after the hit, not 121 — the old loop still
      // integrated tick 120 before checking the stop condition.
      if (probe && tick >= PROBE_TICKS) break;
      state.tick = tick;
      state.simTime = tick * DT;
      kernel.prePhysics(DT);
      consequences.update(DT, state);

      stepShells(state.simTime);          // _tickMortarShots: ahead of the fire service
      heat.tick(state.simTime);           // _tickWeapons' dissip/vent: ahead of the shot gate

      if (probe) {
        if (tick === 0 && !deploy) {
          // The B5 single-hit probe: a beam's "one hit" is one tick's slice, a bolt's is its
          // first authored packet, a mortar's is one real shell.
          if (continuous) {
            routePacket({ kernel, target, weapon, damage: sliceDamage, impulsePerHit: weapon.impulsePerHit, slice: true });
            packetsRouted++;
          } else if (mortar) {
            shells.push(spawnMortarShell(weapon, player, target));
            mortarLog.fired++;
            triggers++;
          } else {
            const first = packets[0] || { damage: 0, impulsePerHit: weapon.impulsePerHit };
            routePacket({ kernel, target, weapon, damage: first.damage, impulsePerHit: first.impulsePerHit });
            packetsRouted++;
          }
        }
      } else if (target.alive !== false && heat.canFire(state.simTime)) {
        if (continuous) {
          routePacket({ kernel, target, weapon, damage: sliceDamage, impulsePerHit: weapon.impulsePerHit, slice: true });
          packetsRouted++;
          triggers++;
          heat.pay(state.simTime);
        } else if (tick >= nextActionTick) {
          // Bolts and deploys both spend the trigger here; deploys route no direct-hit packet
          // (their payload is an entity the packet route never sees), a mortar's is its shell.
          fireTrigger();
          nextActionTick = tick + intervalTicks;
        }
      }

      integratePhysics(state);
      bus.flush();
      kernel.postPhysics();
      if (!probe && target.alive === false) {
        killTick = tick;
        break;
      }
    }
  } finally {
    teardown(scenario);
  }

  const killed = target.alive === false;
  const fireWindowS = probe ? PROBE_TICKS * DT : (killed && killTick != null ? killTick * DT : MAX_TICKS * DT);
  const displacementWu = round(Math.hypot(target.pos.x - spawn.x, target.pos.z - spawn.z));
  const displacementDepth = round(displacementWu / SCREEN_DEPTH_WU);
  return {
    seed,
    probe,
    killed,
    ttkS: !probe && killed && killTick != null ? round(killTick * DT) : null,
    shotsToKill: !probe && killed ? triggers : null,
    triggers,
    packetsRouted,
    heatFirstPegS: heat.firstPegS,
    fireWindowS: round(fireWindowS),
    displacementWu,
    displacementDepth,
    displacementDepthAtEnd: displacementDepth,
    displacementPerSWu: round(displacementWu / Math.max(fireWindowS, DT)),
    displacementDepthPerS: round(displacementDepth / Math.max(fireWindowS, DT)),
    singleHitDisplacement2SDepth: probe ? displacementDepth : null,
    directWeaponDamage: round(metrics.damage.weapon),
    finalSpeedWuS: round(Math.hypot(target.vel.x, target.vel.z)),
    finalHull: round(target.hull),
    mortar: mortar ? mortarLog : null,
  };
}

function modelingNotes(weapon) {
  const notes = [];
  if (isDeployWeapon(weapon)) notes.push('deploy_verb_no_direct_hit_packet');
  if (weapon.volley && weapon.volley.count) notes.push(`volley_of_${weapon.volley.count}_modeled_full_on_single_target`);
  if (weapon.submunitions && weapon.submunitions.count) notes.push('submunition_payload_per_trigger');
  if (weapon.mortarShell) notes.push('mortar_shell_flight_pull_window_then_falloff_blast');
  if (weapon.hullRicochet || weapon.emergentChain || weapon.returnArc || weapon.swarmSeekers) {
    notes.push('multi_hull_geometry_needs_a_pack_single_hit_modeled');
  }
  if ((weapon.dmg || 0) === 0 && positive(weapon.impulsePerHit, 0) > 0 && !weapon.mortarShell) {
    notes.push('zero_damage_def_impulse_applied_outside_damage_packet_not_measured_here');
  }
  if (weapon.subsystemShare === 1.0) notes.push('subsystem_verb_headless_target_has_no_subsystems_damage_lands_where_the_router_puts_it');
  if (!Number.isFinite(weapon.heatMax) || positive(weapon.heatPerShot, 0) === 0 && positive(weapon.heatPerSec, 0) === 0) {
    notes.push('no_authored_heat_never_overheats');
  }
  return notes;
}

function aggregateRuns(runs) {
  const fireRuns = runs.filter((row) => !row.probe);
  const probeRuns = runs.filter((row) => row.probe);
  const killed = fireRuns.filter((row) => row.killed);
  return {
    runsPerWeapon: fireRuns.length,
    kills: killed.length,
    medianTtkS: percentile(killed.map((row) => row.ttkS), 0.5),
    medianShotsToKill: percentile(killed.map((row) => row.shotsToKill), 0.5),
    medianDisplacementWu: percentile(fireRuns.map((row) => row.displacementWu), 0.5),
    medianDisplacementPerSWu: percentile(fireRuns.map((row) => row.displacementPerSWu), 0.5),
    medianDisplacementDepthPerS: percentile(fireRuns.map((row) => row.displacementDepthPerS), 0.5),
    medianDisplacementDepthAtEnd: percentile(fireRuns.map((row) => row.displacementDepthAtEnd), 0.5),
    medianSingleHitDisplacement2SDepth: percentile(probeRuns.map((row) => row.singleHitDisplacement2SDepth), 0.5),
    medianDirectWeaponDamage: mean(fireRuns.map((row) => row.directWeaponDamage)),
  };
}

function benchWeapon(weapon, seeds) {
  const runs = seeds.flatMap((seed) => [
    runOnce({ weapon, seed }),
    runOnce({ weapon, seed, probe: true }),
  ]);
  const overheat = simulateHeat(weapon);
  const aggregate = aggregateRuns(runs);
  const family = GUN_FAMILY_BY_WEAPON_ID[weapon.id] || null;
  const judgeRow = {
    ttkS: aggregate.medianTtkS,
    shotsToKill: aggregate.medianShotsToKill,
    displacementDepthAtEnd: aggregate.medianDisplacementDepthAtEnd,
    displacementDepthPerS: aggregate.medianDisplacementDepthPerS,
    singleHitDisplacement2SDepth: aggregate.medianSingleHitDisplacement2SDepth,
  };
  const notes = modelingNotes(weapon);
  // A weapon whose whole kick is applied outside the damage packet (zero-damage impulse
  // carriers, DEPLOY verbs) cannot be judged on the kick axis through this route — '—', noted.
  const unmeasured = notes.includes('zero_damage_def_impulse_applied_outside_damage_packet_not_measured_here')
    || notes.includes('deploy_verb_no_direct_hit_packet');
  const judgment = unmeasured
    ? { verdict: '—', checks: [], unmeasured: true, reason: 'payload_applied_outside_damage_packet' }
    : judgeAgainstBand(judgeRow, family ? GUN_FAMILY_BANDS[family] : null);
  return {
    id: weapon.id,
    name: weapon.name,
    family,
    fireModel: isDeployWeapon(weapon) ? 'deploy' : (isContinuousWeapon(weapon) ? 'beam' : 'bolt'),
    dmg: weapon.dmg || 0,
    rof: weapon.rof || 0,
    dps: Number.isFinite(weapon.dps) ? weapon.dps : null,
    impulsePerHit: weapon.impulsePerHit || 0,
    authoredKickMomentumPerS: round(authoredKickMomentumPerS(weapon)),
    overheatS: overheat.overheatS,
    overheatReason: overheat.reason,
    modelingNotes: notes,
    aggregate,
    judgment,
    runs,
  };
}

export function buildGunCurve(options = {}) {
  const seeds = Array.isArray(options.seeds) && options.seeds.length
    ? options.seeds.map((seed) => seed >>> 0)
    : [...DEFAULT_SEEDS];
  const previousFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  try {
    const rows = WEAPONS
      .filter((weapon) => weapon.slotType === 'weapon')
      .map((weapon) => benchWeapon(weapon, seeds));
    const missingFamilies = rows.filter((row) => !row.family).map((row) => row.id);
    return {
      schemaVersion: 1,
      packet: 'OVH-08a',
      title: 'gun curve vs §3.1 family bands (bench only, no tuning)',
      design: 'design/overhaul/03_COMBAT.md §3.1; bands in src/data/gunFamilies.js',
      environment: {
        sourceCommit: resolveGitCommit(),
        generatedBy: 'scripts/bench-gun-curve.mjs',
        node: process.version,
        platform: process.platform,
        runtimeProfile: 'production',
        deterministicClock: { dtS: DT, maxTicks: MAX_TICKS, maxSimS: round(MAX_TICKS * DT), probeTicks: PROBE_TICKS },
        seedList: seeds,
        screenDepthWu: SCREEN_DEPTH_WU,
      },
      scenario: {
        target: { enemyTypeId: TARGET_ENEMY_ID, hull: 55, armor: 8, shield: 25, massT: 16, radiusWu: 12 },
        range: { midRangeWu: MID_RANGE_WU, spawnJitterWu: 12 },
        script: 'held fire at one Wasp at mid range; hits along +x; heat-paced vent rhythm included in TTK',
        notModeled: [
          'capacitor economy (heat is the pacing metric)',
          'shield regeneration (U11 precedent: effective HP is static)',
          'emergent payloads applied outside the damage packet (mass driver / sticky impulse, DEPLOY verbs)',
          'multi-hull geometry (ricochet/chain/return arc/seeker spread) — one hit per trigger',
        ],
      },
      missingFamilies,
      verdictCounts: countBy(rows.map((row) => row.judgment.verdict)),
      rows,
    };
  } finally {
    restoreFeatureMaps(previousFlags);
  }
}

export function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderMarkdown(curve) {
  const lines = [];
  lines.push('# OVH-08a — the gun curve vs §3.1 family bands');
  lines.push('');
  lines.push(`Measured by \`scripts/bench-gun-curve.mjs\` (packet ${curve.packet}); bands from`
    + ' `src/data/gunFamilies.js` (design/overhaul/03_COMBAT.md §3.1). One Wasp (16 t, 55/8/25)'
    + ` at mid range (${curve.scenario.range.midRangeWu} WU); 1 screen depth = ${curve.environment.screenDepthWu} WU.`
    + ' Held fire through the real combat kernel; heat vent rhythm included.');
  lines.push('');
  lines.push(`Source commit \`${curve.environment.sourceCommit}\`, node ${curve.environment.node},`
    + ` seeds ${curve.environment.seedList.join('/')}. Verdicts:`
    + ` ${Object.entries(curve.verdictCounts).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
  lines.push('');
  lines.push('## Family bands (§3.1 starting targets)');
  lines.push('');
  lines.push('| Family | TTK band s | Kick clause | Note |');
  lines.push('|---|---|---|---|');
  for (const family of Object.keys(GUN_FAMILY_BANDS)) {
    const band = GUN_FAMILY_BANDS[family];
    const ttk = band.ttk && (band.ttk.min != null || band.ttk.max != null)
      ? `${band.ttk.min == null ? '—' : band.ttk.min}..${band.ttk.max == null ? '—' : band.ttk.max}`
      : (band.shotsToKill ? `≤ ${band.shotsToKill.max} shot` : '—');
    const kick = band.kick
      ? `${band.kick.metric} ${band.kick.min == null ? '—' : `≥ ${band.kick.min}`}..${band.kick.max == null ? '—' : `≤ ${band.kick.max}`}`
      : '—';
    lines.push(`| ${family} | ${ttk} | ${kick} | ${band.note} |`);
  }
  lines.push('');
  lines.push('## The curve');
  lines.push('');
  lines.push('| Weapon | Family | TTK s | Shots→kill | Kick mom/s | Disp WU/s | Disp depth/s | @end depth | 1-hit→2s depth | Overheat s | Verdict | Notes |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const row of curve.rows) {
    const a = row.aggregate;
    lines.push([
      `${row.name} (\`${row.id}\`)`,
      row.family || '**NONE**',
      a.medianTtkS == null ? 'no kill' : a.medianTtkS,
      a.medianShotsToKill == null ? '—' : a.medianShotsToKill,
      row.authoredKickMomentumPerS,
      a.medianDisplacementPerSWu,
      a.medianDisplacementDepthPerS,
      a.medianDisplacementDepthAtEnd,
      a.medianSingleHitDisplacement2SDepth,
      row.overheatS == null ? 'never' : row.overheatS,
      row.judgment.verdict,
      row.modelingNotes.join('; ') || '',
    ].join(' | ').replace(/^/, '| ').concat(' |'));
  }
  lines.push('');
  lines.push('## Verdict detail (clauses that failed)');
  lines.push('');
  const misses = curve.rows.filter((row) => row.judgment.verdict === 'MISS');
  if (!misses.length) {
    lines.push('None — every banded weapon sits inside its §3.1 band.');
  } else {
    for (const row of misses) {
      for (const check of row.judgment.checks.filter((entry) => !entry.pass)) {
        lines.push(`- **${row.name}** (${row.family}): ${check.clause} — ${check.detail}`);
      }
    }
  }
  lines.push('');
  lines.push('Not modeled (see the JSON scenario block): capacitor economy, shield regeneration,'
    + ' emergent payloads applied outside the damage packet, multi-hull geometry.');
  lines.push('');
  return lines.join('\n');
}

/** How far a measured row sits outside its band on one failed clause — the "by how much" the
 * tuning pass needs. Returns { text, relative } (relative overage for worst-first ranking). */
function clauseOverage(row, band, check) {
  if (check.clause === 'ttk') {
    if (row.ttkS == null) return { text: 'no kill inside 30 s', relative: Infinity };
    if (band.ttk.max != null && row.ttkS > band.ttk.max) {
      return { text: `+${round(row.ttkS - band.ttk.max)} s over`, relative: (row.ttkS - band.ttk.max) / band.ttk.max };
    }
    if (band.ttk.min != null && row.ttkS < band.ttk.min) {
      return { text: `${round(band.ttk.min - row.ttkS)} s under`, relative: (band.ttk.min - row.ttkS) / band.ttk.min };
    }
  }
  if (check.clause === 'shotsToKill') {
    return { text: `+${row.shotsToKill - band.shotsToKill.max} shots over`, relative: (row.shotsToKill - band.shotsToKill.max) / band.shotsToKill.max };
  }
  const value = row[check.clause];
  if (value == null) return { text: 'unmeasured', relative: Infinity };
  const clause = band && band.kick && band.kick.metric === check.clause ? band.kick : null;
  if (clause && clause.max != null && value > clause.max) {
    return { text: `+${round(value - clause.max)} over max ${clause.max}`, relative: (value - clause.max) / clause.max };
  }
  if (clause && clause.min != null && value < clause.min) {
    return { text: `${round(clause.min - value)} under min ${clause.min}`, relative: (clause.min - value) / clause.min };
  }
  return { text: check.detail, relative: 0 };
}

/** The packet's every-gun table at .devshots/gun-curve/report.md: family, gun, TTK on the
 * reference Wasp, displacement, and whether it sits in-band or off-band (and by how much). The
 * off-band rows lead, worst relative overage first — that is the OVH-08b tuning list. */
export function renderReport(curve) {
  const judgeRowOf = (row) => ({
    ttkS: row.aggregate.medianTtkS,
    shotsToKill: row.aggregate.medianShotsToKill,
    displacementDepthAtEnd: row.aggregate.medianDisplacementDepthAtEnd,
    displacementDepthPerS: row.aggregate.medianDisplacementDepthPerS,
    singleHitDisplacement2SDepth: row.aggregate.medianSingleHitDisplacement2SDepth,
  });
  const scored = curve.rows.map((row) => {
    const judgeRow = judgeRowOf(row);
    const band = row.family ? GUN_FAMILY_BANDS[row.family] : null;
    const failed = (row.judgment.checks || []).filter((check) => !check.pass);
    const overages = failed.map((check) => clauseOverage(judgeRow, band, check));
    return {
      row, judgeRow, overages,
      worst: overages.reduce((max, entry) => Math.max(max, entry.relative), 0),
    };
  });
  const offBand = scored.filter((entry) => entry.row.judgment.verdict === 'MISS')
    .sort((a, b) => b.worst - a.worst);
  const rest = scored.filter((entry) => entry.row.judgment.verdict !== 'MISS');
  const tableRow = ({ row, judgeRow, overages }) => [
    row.family || '**NONE**',
    `${row.name} (\`${row.id}\`)`,
    judgeRow.ttkS == null ? 'no kill' : judgeRow.ttkS,
    judgeRow.shotsToKill == null ? '—' : judgeRow.shotsToKill,
    judgeRow.displacementDepthAtEnd,
    judgeRow.displacementDepthPerS,
    judgeRow.singleHitDisplacement2SDepth == null ? '—' : judgeRow.singleHitDisplacement2SDepth,
    row.judgment.verdict,
    overages.length ? overages.map((entry) => entry.text).join('; ') : (row.judgment.verdict === 'MISS' ? '—' : 'in band'),
  ].join(' | ').replace(/^/, '| ').concat(' |');

  const lines = [];
  lines.push('# Gun curve report — every gun vs its §3.1 family band');
  lines.push('');
  lines.push('Generated by `scripts/bench-gun-curve.mjs` (OVH-08a). Reference target: one Wasp'
    + ` (16 t, hull 55 / armor 8 / shield 25) at ${curve.scenario.range.midRangeWu} WU, median of`
    + ` seeds ${curve.environment.seedList.join('/')}. Displacement in screen depths`
    + ` (1 = ${curve.environment.screenDepthWu} WU). Bench reproduces the live cooldown chain,`
    + ' the mortar shell lifecycle (flight, 1.1 s pull window, falloff blast), and a 120-tick'
    + ' 2 s shove probe.');
  lines.push('');
  lines.push('## Off-band guns (worst first — the OVH-08b tuning list)');
  lines.push('');
  lines.push('| Family | Gun | TTK s | Shots→kill | Disp @end depth | Disp depth/s | 1-hit 2 s depth | Verdict | Off-band by |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  if (!offBand.length) lines.push('| — | — | — | — | — | — | — | — | none — every banded gun is in band |');
  for (const entry of offBand) lines.push(tableRow(entry));
  lines.push('');
  lines.push('## In-band / unbanded guns');
  lines.push('');
  lines.push('| Family | Gun | TTK s | Shots→kill | Disp @end depth | Disp depth/s | 1-hit 2 s depth | Verdict | Off-band by |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const entry of rest) lines.push(tableRow(entry));
  lines.push('');
  return lines.join('\n');
}

export function writeGunCurveFiles(options = {}) {
  const curve = buildGunCurve(options);
  mkdirSync(GUN_CURVE_DIR, { recursive: true });
  mkdirSync(GUN_REPORT_DIR, { recursive: true });
  const json = { ...curve, rows: curve.rows.map(({ runs, ...rest }) => ({ ...rest, runs: runs.length })) };
  writeFileSync(GUN_CURVE_JSON_PATH, stableStringify(json));
  writeFileSync(GUN_CURVE_MD_PATH, renderMarkdown(curve));
  writeFileSync(GUN_REPORT_MD_PATH, renderReport(curve));
  return curve;
}

// ── small shared math (same rounding contract as bench-displacement-ttk.mjs) ────────────────

function percentile(values, p) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.ceil(xs.length * p) - 1));
  return round(xs[idx]);
}

function mean(values) {
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return null;
  return round(xs.reduce((sum, value) => sum + value, 0) / xs.length);
}

function countBy(values) {
  const out = {};
  for (const value of values) out[value] = (out[value] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function resolveGitCommit() {
  try {
    return String(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })).trim();
  } catch {
    return 'unknown';
  }
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const curve = writeGunCurveFiles();
  process.stdout.write(renderMarkdown(curve));
}
