#!/usr/bin/env node
// check-combat-operations-benchmark.mjs
//
// Gameplay-balance operational matrices for combat weapons + production tethers.
// Replaces the rejected CPU-throughput benchmark. Does not edit production code.
//
// 1) Weapon matrix — real weapons.js update/fire for 30s continuous trigger.
// 2) Tether matrix — tether_standard via tetherGameplay + attachment service + SG-02
//    with mass-aware production break values (never arbitrary injected break numbers).
// 3) Run twice; compare deterministic receipts (no wall-clock / timestamps).
// 4) Human tables + compact JSON; nonzero exit on truthful failure.
//
// Acceptance (truthful — report production constants if red, do not edit them):
//   • Starter wpn_pulse_laser_s: ≥20 shots in first 4s, no heat lock in those 4s
//   • No dead weapon in the matrix
//   • Same-tier universal dominance fails the gate (multi-axis, not DPS alone)
//   • Light flyby + ordinary mining tethers survive their windows
//   • Over-mass rejects, controlled-breaks, or behaves as a stable anchor (never towable cargo)

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { SIM_DT } from '../src/core/sim.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { WEAPONS } from '../src/data/weapons.js';
import { effectiveTetherBreak } from '../src/combat/attachments.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import {
  fittingsFromDefaultModules,
  getDerivedStats,
  makeShipEntitySpec,
} from '../src/systems/ships.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { weapons as weaponsSystem } from '../src/systems/weapons.js';

const DT = SIM_DT;
const HOLD_S = 30;
const BURST_S = 4;
const STARTER_WEAPON_ID = 'wpn_pulse_laser_s';
const STARTER_MIN_SHOTS_4S = 20;
const TETHER_DEF_ID = 'tether_standard';

/** Production tether catalog surface (user-facing "TETHERS"). */
const TETHERS = Object.freeze(
  ATTACHMENT_DEFS.filter((d) => d && (d.id === TETHER_DEF_ID || d.id === 'attachment_massline')),
);

/** Representative starter → late weapons (includes required starter pulse laser). */
const WEAPON_MATRIX = Object.freeze([
  { id: 'wpn_pulse_laser_s', band: 'starter' },
  { id: 'wpn_autocannon_s', band: 'early' },
  { id: 'wpn_flak_turret_s', band: 'early' },
  { id: 'wpn_pulse_laser_m', band: 'mid' },
  { id: 'wpn_autocannon_m', band: 'mid' },
  { id: 'wpn_railgun_m', band: 'mid' },
  { id: 'wpn_beam_laser_m', band: 'mid' },
  { id: 'wpn_plasma_cannon_m', band: 'mid' },
  { id: 'wpn_missile_rack_m', band: 'mid' },
  { id: 'wpn_heavy_beam_l', band: 'late' },
  { id: 'wpn_siege_lance_l', band: 'late' },
  { id: 'wpn_torpedo_l', band: 'late' },
]);

const TETHER_CASES = Object.freeze([
  {
    id: 'light_flyby',
    label: 'starter ship vs light target flyby',
    // Survive a short loaded flyby capture (Focus-class latch window).
    acceptWindowS: 1.5,
    expectSurvive: true,
  },
  {
    id: 'mining_haul',
    label: 'ordinary asteroid / mining haul',
    // Matches core first-ten-minute capture hold.
    acceptWindowS: 2.5,
    expectSurvive: true,
  },
  {
    id: 'over_mass',
    label: 'intentionally over-mass target',
    acceptWindowS: 3.0,
    expectSurvive: false, // reject, controlled-break, or remain an immovable station-class anchor
  },
]);

const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const TETHER_BY_ID = new Map(TETHERS.map((d) => [d.id, d]));

// ─── main ────────────────────────────────────────────────────────────────────

const wallStart = performance.now();
const runA = await runAll();
const runB = await runAll();
const wallMs = Math.round((performance.now() - wallStart) * 100) / 100;

const receiptA = deterministicReceipt(runA);
const receiptB = deterministicReceipt(runB);
const receiptsMatch = stableStringify(receiptA) === stableStringify(receiptB);

const failures = [...runA.failures];
if (!receiptsMatch) {
  failures.push({
    gate: 'determinism',
    message: 'deterministic receipts differ across two identical runs (excluding wall time)',
  });
}

const pass = failures.length === 0;
const report = {
  benchmark: 'combat-operations-balance',
  pass,
  holdS: HOLD_S,
  burstS: BURST_S,
  dt: DT,
  weapons: receiptA.weapons,
  tethers: receiptA.tethers,
  dominance: receiptA.dominance,
  failures,
  // Wall time is diagnostic only — never part of the deterministic payload.
  wallMs,
  receiptsMatch,
};

printHumanTables(runA, report);
console.log('--- compact JSON ---');
console.log(JSON.stringify(compactReport(report)));

if (!pass) {
  console.error('COMBAT-OPERATIONS-BENCHMARK: FAIL');
  for (const f of failures) {
    console.error(`  [${f.gate}] ${f.message}`);
  }
  process.exit(1);
}

console.log('COMBAT-OPERATIONS-BENCHMARK: PASS');
process.exit(0);

// ─── orchestration ───────────────────────────────────────────────────────────

async function runAll() {
  const failures = [];
  const weapons = [];
  for (const entry of WEAPON_MATRIX) {
    const row = runWeaponCase(entry);
    weapons.push(row);
  }
  evaluateWeaponGates(weapons, failures);

  const tethers = [];
  for (const spec of TETHER_CASES) {
    const row = await runTetherCase(spec);
    tethers.push(row);
  }
  evaluateTetherGates(tethers, failures);

  const dominance = findSameTierDominance(weapons);
  if (dominance.length) {
    for (const d of dominance) {
      failures.push({
        gate: 'same_tier_dominance',
        message:
          `${d.dominatorId} universally dominates same-tier ${d.dominatedId} ` +
          `on axes [${d.axes.join(', ')}] (strict on [${d.strictAxes.join(', ')}])`,
      });
    }
  }

  return { weapons, tethers, dominance, failures };
}

function deterministicReceipt(run) {
  return {
    weapons: run.weapons.map((w) => ({
      id: w.id,
      band: w.band,
      tier: w.tier,
      continuous: w.continuous,
      shots: w.shots,
      shotsFirst4s: w.shotsFirst4s,
      firstHeatLockTimeS: w.firstHeatLockTimeS,
      firstHeatLockShotCount: w.firstHeatLockShotCount,
      capStarveTicks: w.capStarveTicks,
      capStarveEvents: w.capStarveEvents,
      recoveryEvents: w.recoveryEvents,
      firstRecoveryTimeS: w.firstRecoveryTimeS,
      emittedDamage: w.emittedDamage,
      sustainedEffectiveDps: w.sustainedEffectiveDps,
      burstEffectiveDps4s: w.burstEffectiveDps4s,
      peakHeat: w.peakHeat,
      endHeat: w.endHeat,
      endCap: w.endCap,
      heatMax: w.heatMax,
      range: w.range,
      projectileSpeed: w.projectileSpeed,
      armorPierce: w.armorPierce,
      splashDamage: w.splashDamage,
      dead: w.dead,
    })),
    tethers: run.tethers.map((t) => ({
      id: t.id,
      attached: t.attached,
      attachReason: t.attachReason,
      sustainedS: t.sustainedS,
      sustainedSteps: t.sustainedSteps,
      broke: t.broke,
      breakReason: t.breakReason,
      cutReason: t.cutReason,
      reelResponse: t.reelResponse,
      peakStrain: t.peakStrain,
      peakTension: t.peakTension,
      breakPolicy: t.breakPolicy,
      targetMass: t.targetMass,
      ownerMass: t.ownerMass,
      targetDisplacement: t.targetDisplacement,
      outcome: t.outcome,
    })),
    dominance: run.dominance,
    failures: run.failures,
  };
}

function compactReport(report) {
  return {
    benchmark: report.benchmark,
    pass: report.pass,
    receiptsMatch: report.receiptsMatch,
    weapons: report.weapons.map((w) => ({
      id: w.id,
      band: w.band,
      shots: w.shots,
      s4: w.shotsFirst4s,
      heatLockS: w.firstHeatLockTimeS,
      heatLockShots: w.firstHeatLockShotCount,
      capStarve: w.capStarveEvents,
      dmg: w.emittedDamage,
      dps: w.sustainedEffectiveDps,
      dead: w.dead,
    })),
    tethers: report.tethers.map((t) => ({
      id: t.id,
      attached: t.attached,
      sustainedS: t.sustainedS,
      broke: t.broke,
      breakReason: t.breakReason,
      reel: t.reelResponse,
      outcome: t.outcome,
    })),
    dominance: report.dominance,
    failures: report.failures,
  };
}

// ─── weapon matrix ───────────────────────────────────────────────────────────

function runWeaponCase(entry) {
  const def = WEAPON_BY_ID.get(entry.id);
  if (!def) {
    return {
      id: entry.id,
      band: entry.band,
      tier: null,
      continuous: false,
      shots: 0,
      shotsFirst4s: 0,
      firstHeatLockTimeS: null,
      firstHeatLockShotCount: null,
      capStarveTicks: 0,
      capStarveEvents: 0,
      recoveryEvents: 0,
      firstRecoveryTimeS: null,
      emittedDamage: 0,
      sustainedEffectiveDps: 0,
      burstEffectiveDps4s: 0,
      peakHeat: 0,
      endHeat: 0,
      endCap: 0,
      heatMax: null,
      dead: true,
      missing: true,
    };
  }

  const continuous = !!def.continuous;
  // Deterministic seed (valid hex — not wall-clock; excluded from receipt comparison).
  const state = createGameState(0xc0ba47);
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 10;

  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  // Cap pool from starter hull + default fit (production regen) — weapon is the only variable.
  const derived = getDerivedStats(NEW_GAME.shipId, fittings, state.player);
  const player = Object.assign(
    makeShipEntitySpec(NEW_GAME.shipId, {
      isPlayer: true,
      pos: { x: 0, z: 0 },
      rot: 0,
      fittings,
    }),
    { id: 1, alive: true, flags: {}, vel: { x: 0, z: 0 } },
  );
  player.type = player.type || 'ship';
  player.team = 0;
  player.cap = derived.capMax;
  player.capMax = derived.capMax;
  player.capRegen = derived.capRegen;
  player.data = player.data || {};
  player.data.weapons = [makeWeaponInstance(def)];
  player.data.combat = { lockProgress: 0, lockTarget: null, targetId: 2 };

  // Soft target for turrets / missiles / beams (infinite hull — measure emit, not kill).
  const target = {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 200, z: 0 },
    vel: { x: 0, z: 0 },
    rot: Math.PI,
    radius: 12,
    mass: 40,
    hull: 1e12,
    hullMax: 1e12,
    shield: 0,
    shieldMax: 0,
    flags: {},
    data: {},
  };

  state.entities.set(1, player);
  state.entities.set(2, target);
  state.entityList.push(player, target);
  state.playerId = 1;
  state.player.targetId = 2;
  state.input.fire = true;
  state.input.aimAngle = 0;
  state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  state.input.actions = state.input.actions || {};
  state.combat = state.combat || { beams: [], threatTables: new Map() };
  if (!Array.isArray(state.combat.beams)) state.combat.beams = [];

  const bus = createBus();
  const helpers = {
    getEntity: (id) => state.entities.get(id) || null,
    spawnEntity: (spec) => {
      const id = state.nextEntityId++;
      const e = Object.assign({ id, alive: true, collides: true, flags: {} }, spec);
      e.pos = e.pos || { x: 0, z: 0 };
      e.vel = e.vel || { x: 0, z: 0 };
      state.entities.set(id, e);
      state.entityList.push(e);
      return e;
    },
    mulberry32: (s) => {
      let a = s >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    hash32: (a, b) => {
      let h = (a >>> 0) ^ 0x9e3779b9;
      const s = String(b || '');
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b);
      return h >>> 0;
    },
  };

  const wpn = Object.assign({}, weaponsSystem);
  wpn.init({ state, bus, helpers, registry: { get: () => null } });

  let shots = 0;
  let shotsFirst4s = 0;
  let emittedDamage = 0;
  let damageFirst4s = 0;
  bus.on('combat:fire', (p) => {
    if (!p || p.ownerId !== state.playerId || p.weaponId !== def.id) return;
    shots += 1;
    if (state.simTime < BURST_S - 1e-9) shotsFirst4s += 1;
  });

  const heatPerShot = continuous
    ? 0
    : (Number.isFinite(def.heatPerShot) ? def.heatPerShot : 0);
  const heatPerSec = continuous
    ? (Number.isFinite(def.heatPerSec) ? def.heatPerSec : 0)
    : 0;
  const heatMaxRaw = Number.isFinite(def.heatMax) && def.heatMax > 0 ? def.heatMax : null;
  const activeHeat = (heatPerShot > 0 || heatPerSec > 0) && heatMaxRaw != null;
  const heatMax = activeHeat ? heatMaxRaw : null;

  let firstHeatLockTimeS = null;
  let firstHeatLockShotCount = null;
  let heatLocked = false;
  let capStarveTicks = 0;
  let capStarveEvents = 0;
  let wasCapStarved = false;
  let recoveryEvents = 0;
  let firstRecoveryTimeS = null;
  let peakHeat = 0;

  const totalTicks = Math.round(HOLD_S / DT);

  for (let i = 0; i < totalTicks; i++) {
    // Capacitor regen is combat-owned in full sim; approximate the production regen path so
    // heat/RoF/energyCost are the real operational gates (same pattern as core-first-ten contract).
    if (Number.isFinite(player.capRegen) && Number.isFinite(player.capMax)) {
      player.cap = Math.min(player.capMax, (player.cap || 0) + player.capRegen * DT);
    }

    // Missile/homing: keep selected target in nose cone; production _tickLock builds lockProgress.
    // Do not invent lock thresholds — only re-assert target identity for the continuous trigger case.
    if (def.tracking === 'homing' || def.lockTimeS) {
      const combatBlock = player.data.combat;
      combatBlock.targetId = target.id;
      state.player.targetId = target.id;
      // Face the target so production lock cone (25°) stays satisfied.
      player.rot = 0;
      state.input.aimAngle = 0;
    }

    const w = player.data.weapons[0];
    const heatBefore = w._heat || 0;
    const capBefore = player.cap;
    const energyCost = def.energyCost || 0;
    const wouldNeedCap = continuous ? energyCost * DT : energyCost;
    const heatBlocks = activeHeat && (
      continuous
        ? heatBefore >= heatMax
        : (heatBefore >= heatMax || heatBefore + heatPerShot > heatMax)
    );
    const capBlocks = wouldNeedCap > 0 && capBefore < wouldNeedCap - 1e-12;
    const cooldownBlocks = !continuous && (w._cooldown || 0) > 1e-12;

    state.entityIndex = {
      weaponShips: [player],
      ships: [player, target],
      projectiles: state.entityList.filter((e) => e && e.type === 'projectile'),
    };
    state.simTime = i * DT;
    state.tick = i;
    const shotsBefore = shots;
    // weapons.js clears beams at update start, then pushes this tick's rays.
    wpn.update(DT, state);

    // Emitted damage: projectile catalog dmg on fire; continuous uses beam.dpsThisTick (damage*dt).
    if (continuous) {
      const beams = state.combat.beams || [];
      for (let b = 0; b < beams.length; b++) {
        const beam = beams[b];
        if (beam && beam.ownerId === player.id && beam.weaponId === def.id) {
          const d = Number(beam.dpsThisTick) || 0;
          emittedDamage += d;
          if (state.simTime < BURST_S - 1e-9) damageFirst4s += d;
        }
      }
    } else if (shots > shotsBefore) {
      const dmg = Number(def.dmg) || 0;
      const delta = (shots - shotsBefore) * dmg;
      emittedDamage += delta;
      if (state.simTime < BURST_S - 1e-9) damageFirst4s += delta;
    }

    const heatAfter = w._heat || 0;
    peakHeat = Math.max(peakHeat, heatAfter);
    const fired = shots > shotsBefore || (continuous && (state.combat.beams || []).some(
      (beam) => beam && beam.ownerId === player.id && beam.weaponId === def.id,
    ));

    // Heat lock: held trigger, heat blocked, no fire this tick (not merely on cooldown).
    if (activeHeat && heatBlocks && !fired && !cooldownBlocks) {
      if (!heatLocked) {
        heatLocked = true;
        if (firstHeatLockTimeS == null) {
          firstHeatLockTimeS = round3(state.simTime);
          firstHeatLockShotCount = shots;
        }
      }
    } else if (heatLocked && fired) {
      heatLocked = false;
      recoveryEvents += 1;
      if (firstRecoveryTimeS == null) firstRecoveryTimeS = round3(state.simTime);
    }

    // Capacitor starvation while trigger held and heat/cooldown would otherwise allow fire.
    if (capBlocks && !heatBlocks && !cooldownBlocks && !fired) {
      capStarveTicks += 1;
      if (!wasCapStarved) {
        wasCapStarved = true;
        capStarveEvents += 1;
      }
    } else if (!capBlocks) {
      wasCapStarved = false;
    }

    // Projectile cleanup so entityList does not grow unbounded over 30s.
    if (i % 30 === 29) {
      for (let j = state.entityList.length - 1; j >= 0; j--) {
        const e = state.entityList[j];
        if (e && e.type === 'projectile') {
          state.entities.delete(e.id);
          state.entityList.splice(j, 1);
        }
      }
    }
  }

  const wEnd = player.data.weapons[0];
  const sustainedEffectiveDps = round3(emittedDamage / HOLD_S);
  const burstEffectiveDps4s = round3(damageFirst4s / BURST_S);
  const dead = shots <= 0 && emittedDamage <= 0;

  return {
    id: def.id,
    band: entry.band,
    tier: def.tier ?? null,
    continuous,
    rof: def.rof ?? null,
    dmg: def.dmg ?? null,
    energyCost: def.energyCost ?? null,
    heatPerShot: heatPerShot || null,
    heatPerSec: heatPerSec || null,
    heatMax,
    heatDissip: def.heatDissip ?? null,
    shots,
    shotsFirst4s,
    firstHeatLockTimeS,
    firstHeatLockShotCount,
    capStarveTicks,
    capStarveEvents,
    recoveryEvents,
    firstRecoveryTimeS,
    emittedDamage: round3(emittedDamage),
    sustainedEffectiveDps,
    burstEffectiveDps4s,
    peakHeat: round3(peakHeat),
    endHeat: round3(wEnd._heat || 0),
    endCap: round3(player.cap || 0),
    range: Number(def.range) || 0,
    projectileSpeed: Number.isFinite(def.projSpeed) ? def.projSpeed : 1e9,
    armorPierce: Number(def.armorPierce) || 0,
    splashDamage: Number(def.splashDmg) || 0,
    dead,
    missing: false,
  };
}

function makeWeaponInstance(def) {
  const tracking = def.tracking || 'fixed';
  const isTurret = tracking === 'auto_turret';
  return {
    slotIndex: 0,
    defId: def.id,
    name: def.name,
    dmg: def.dmg,
    rof: def.rof,
    energyCost: def.energyCost,
    // ships.makeWeaponRuntime maps heatPerShot/heatPerSec → heat; mirror that.
    heat: def.heatPerShot || def.heatPerSec || 0,
    heatMax: def.heatMax || 100,
    heatDissip: def.heatDissip || 0,
    heatPerSec: def.heatPerSec || 0,
    continuous: !!def.continuous,
    projSpeed: def.projSpeed,
    range: def.range,
    tracking,
    lockTimeS: def.lockTimeS || 0,
    turnRate: def.turnRate || 0,
    damageType: def.damageType,
    facing: isTurret ? 'turret' : 'front',
    facingAngle: 0,
    gimbalArc: isTurret ? Math.PI : Math.PI / 2,
    muzzleOffset: [1, 0],
    _cooldown: 0,
    _heat: 0,
  };
}

function evaluateWeaponGates(weapons, failures) {
  for (const w of weapons) {
    if (w.missing) {
      failures.push({
        gate: 'weapon_missing',
        message: `weapon ${w.id} missing from WEAPONS catalog`,
      });
      continue;
    }
    if (w.dead) {
      failures.push({
        gate: 'dead_weapon',
        message:
          `${w.id} fired 0 shots / 0 emitted damage over ${HOLD_S}s continuous trigger ` +
          `(rof=${w.rof}, energyCost=${w.energyCost}, continuous=${w.continuous})`,
      });
    }
  }

  const starter = weapons.find((w) => w.id === STARTER_WEAPON_ID);
  if (!starter || starter.missing) {
    failures.push({
      gate: 'starter_weapon',
      message: `${STARTER_WEAPON_ID} must be present in the operational matrix`,
    });
    return;
  }

  if (starter.shotsFirst4s < STARTER_MIN_SHOTS_4S) {
    const def = WEAPON_BY_ID.get(STARTER_WEAPON_ID);
    failures.push({
      gate: 'starter_burst',
      message:
        `${STARTER_WEAPON_ID} must fire ≥${STARTER_MIN_SHOTS_4S} shots in first ${BURST_S}s; ` +
        `got ${starter.shotsFirst4s} (production: rof=${def?.rof}, energyCost=${def?.energyCost}, ` +
        `heatPerShot=${def?.heatPerShot ?? 0})`,
    });
  }

  if (starter.firstHeatLockTimeS != null && starter.firstHeatLockTimeS <= BURST_S + 1e-9) {
    const def = WEAPON_BY_ID.get(STARTER_WEAPON_ID);
    failures.push({
      gate: 'starter_heat_lock',
      message:
        `${STARTER_WEAPON_ID} must not heat-lock within first ${BURST_S}s; ` +
        `locked at t=${starter.firstHeatLockTimeS}s after ${starter.firstHeatLockShotCount} shots ` +
        `(production: heatPerShot=${def?.heatPerShot ?? 0}, heatMax=${def?.heatMax ?? 'n/a'}, ` +
        `heatDissip=${def?.heatDissip ?? 'n/a'})`,
    });
  }
}

/**
 * Same-tier universal dominance: A dominates B when A is ≥ on every operational axis
 * and > on at least one. Axes mix sustain, burst, heat/cap discipline, reach, projectile
 * responsiveness, penetration, and splash utility — not raw DPS alone.
 */
function findSameTierDominance(weapons) {
  const live = weapons.filter((w) => !w.missing && !w.dead);
  const byTier = new Map();
  for (const w of live) {
    const t = w.tier ?? 0;
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t).push(w);
  }

  const out = [];
  for (const [, group] of byTier) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = 0; j < group.length; j++) {
        if (i === j) continue;
        const a = group[i];
        const b = group[j];
        const cmp = compareAxes(a, b);
        if (cmp.dominates) {
          out.push({
            tier: a.tier,
            dominatorId: a.id,
            dominatedId: b.id,
            axes: cmp.axes,
            strictAxes: cmp.strictAxes,
          });
        }
      }
    }
  }
  return out;
}

function compareAxes(a, b) {
  // Higher-is-better vectors.
  const axes = [
    ['sustainedEffectiveDps', a.sustainedEffectiveDps, b.sustainedEffectiveDps],
    ['burstEffectiveDps4s', a.burstEffectiveDps4s, b.burstEffectiveDps4s],
    ['shotsFirst4s', a.shotsFirst4s, b.shotsFirst4s],
    // Later heat lock is better; never locking is best.
    ['timeToHeatLock', heatLockScore(a), heatLockScore(b)],
    // Fewer starvation events is better → invert.
    ['capHealth', -a.capStarveEvents, -b.capStarveEvents],
    // Recovery capability after lock (more recovery events while still firing is not pure win;
    // prefer never locking: score = heatLockScore + small recovery credit only if locked).
    ['heatDiscipline', heatDisciplineScore(a), heatDisciplineScore(b)],
    ['range', a.range, b.range],
    ['projectileSpeed', a.projectileSpeed, b.projectileSpeed],
    ['armorPierce', a.armorPierce, b.armorPierce],
    ['splashDamage', a.splashDamage, b.splashDamage],
  ];

  let geAll = true;
  const strictAxes = [];
  const axisNames = [];
  for (const [name, av, bv] of axes) {
    axisNames.push(name);
    if (av + 1e-9 < bv) geAll = false;
    if (av > bv + 1e-9) strictAxes.push(name);
  }
  return { dominates: geAll && strictAxes.length > 0, axes: axisNames, strictAxes };
}

function heatLockScore(w) {
  if (w.firstHeatLockTimeS == null) return HOLD_S + 1;
  return w.firstHeatLockTimeS;
}

function heatDisciplineScore(w) {
  // Prefer no lock; if locked, later lock + successful recovery is better than stuck lock.
  const lock = heatLockScore(w);
  if (w.firstHeatLockTimeS == null) return lock + 10;
  return lock + Math.min(5, w.recoveryEvents);
}

// ─── tether matrix ───────────────────────────────────────────────────────────

async function runTetherCase(spec) {
  const tetherDef = TETHER_BY_ID.get(TETHER_DEF_ID);
  assert.ok(tetherDef, 'tether_standard must exist in ATTACHMENT_DEFS / TETHERS');

  const harness = createTetherHarness(0x7e7100 + hashStr(spec.id));
  const { state, helpers, runtime, events } = harness;

  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const derived = getDerivedStats(NEW_GAME.shipId, fittings, state.player);
  const player = helpers.spawnEntity(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    fittings,
  }));
  state.playerId = player.id;
  // Ensure derived spool rating is present for effectiveTetherBreak.
  player.data = player.data || {};
  player.data.derived = player.data.derived || derived;

  const breakPolicy = effectiveTetherBreak(tetherDef, player);
  assert.ok(breakPolicy && breakPolicy.maxTension > 0, 'production effectiveTetherBreak must resolve');

  let target;
  if (spec.id === 'light_flyby') {
    // Light hostile / debris-class mass with relative flyby velocity.
    target = helpers.spawnEntity({
      type: 'ship',
      pos: { x: 110, z: 8 },
      vel: { x: -90, z: 0 },
      rot: Math.PI,
      radius: 8,
      mass: 16,
      hull: 80,
      hullMax: 80,
      collides: true,
      team: 1,
      data: {
        defId: 'ship_wasp',
        combatProfileId: 'combat_profile_standard_ship',
        ai: { archetype: 'pirate' },
      },
    });
    player.vel = { x: 70, z: 0 };
  } else if (spec.id === 'mining_haul') {
    target = helpers.spawnEntity({
      type: 'asteroid',
      pos: { x: 90, z: 0 },
      radius: 12,
      mass: 640,
      hull: 360,
      hullMax: 360,
      collides: true,
      data: { typeId: 'ast_common_rock', oreHP: 360, oreHPMax: 360, yieldU: 8 },
    });
  } else {
    // Intentionally over-mass: fixed mega-body + aggressive reel/boost should reject or snap
    // under production break thresholds (never inject custom break values).
    target = helpers.spawnEntity({
      type: 'station',
      pos: { x: 120, z: 0 },
      radius: 40,
      mass: 250000,
      hull: 1e9,
      hullMax: 1e9,
      collides: true,
      data: {
        combatProfileId: 'combat_profile_tether_anchor',
        typeId: 'overmass_anchor',
      },
    });
  }

  initializeTetherSystems(harness);
  await ensureSg02Ready(runtime, state);

  const targetStart = { x: target.pos.x, z: target.pos.z };

  state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  state.input.aimAngle = 0;
  state.input.actions = {
    tetherFire: true,
    tetherCut: false,
    reelDelta: 0,
  };

  // Attempt latch.
  stepTether(harness);
  state.input.actions.tetherFire = false;

  const attached = events.latched.length > 0;
  let attachReason = attached ? 'latched' : 'no_latch';

  // If create failed silently, note active tether mirror.
  if (!attached && state.player?.tether?.active) {
    attachReason = 'mirror_active_without_event';
  }

  let sustainedSteps = 0;
  let peakStrain = 0;
  let peakTension = 0;
  let reelResponse = {
    attempted: false,
    restLengthStart: null,
    restLengthEnd: null,
    delta: null,
    accepted: false,
  };

  const windowTicks = Math.round(spec.acceptWindowS / DT);
  const maxTicks = Math.max(windowTicks + 30, Math.round(4 / DT));

  if (attached) {
    const att0 = firstActiveAttachment(state);
    if (att0) reelResponse.restLengthStart = round3(att0.restLength);

    for (let i = 0; i < maxTicks; i++) {
      if (spec.id === 'light_flyby') {
        // Mild keep-hold: small reel, maintain relative motion without deliberate snap.
        state.input.actions.reelDelta = -0.2;
        state.input.moveZ = 0.1;
        state.input.moveX = 0;
        state.input.boost = false;
      } else if (spec.id === 'mining_haul') {
        state.input.actions.reelDelta = -0.35;
        state.input.moveZ = 0.15;
        state.input.moveX = 0;
        state.input.boost = false;
      } else {
        // Over-mass: hard reel + boost away — production thresholds must reject or controlled-break.
        state.input.actions.reelDelta = -1;
        state.input.moveZ = 1;
        state.input.moveX = 0;
        state.input.boost = true;
      }

      reelResponse.attempted = true;
      stepTether(harness);

      const stillActive = !!(state.player?.tether?.active) && events.broke.length === 0;
      if (stillActive) sustainedSteps += 1;

      const t = state.player && state.player.tether;
      if (t && Number.isFinite(t.strain)) peakStrain = Math.max(peakStrain, t.strain);
      const att = firstActiveAttachment(state);
      if (att) {
        const ten = Number(att.lastTension || att.tension || 0);
        if (Number.isFinite(ten)) peakTension = Math.max(peakTension, ten);
        reelResponse.restLengthEnd = round3(att.restLength);
      }

      if (events.broke.length > 0) break;
      // Survive path: once past accept window with line still live, stop early.
      if (spec.expectSurvive && stillActive && sustainedSteps >= windowTicks) break;
    }

    if (reelResponse.restLengthStart != null && reelResponse.restLengthEnd != null) {
      reelResponse.delta = round3(reelResponse.restLengthEnd - reelResponse.restLengthStart);
      reelResponse.accepted = Math.abs(reelResponse.delta) > 1e-6 || events.broke.length > 0;
    }
  }

  const sustainedS = round3(sustainedSteps * DT);
  const targetDisplacement = round3(Math.hypot(
    target.pos.x - targetStart.x,
    target.pos.z - targetStart.z,
  ));
  const broke = events.broke.length > 0;
  const breakReason = broke
    ? (lastBreakReason(state, events) || 'broke')
    : null;
  const cutReason = events.released.length
    ? 'tether_cut'
    : null;

  let outcome;
  if (spec.expectSurvive) {
    if (attached && sustainedSteps >= windowTicks && !broke) outcome = 'survive';
    else if (!attached) outcome = 'fail_no_attach';
    else if (broke) outcome = 'fail_broke_early';
    else outcome = 'fail_short_hold';
  } else {
    // Station-class bodies are valid authored anchors. They may reject/snap, or hold while the
    // ship moves around them, but must never become towable cargo.
    if (!attached) outcome = 'reject';
    else if (broke && isControlledBreak(breakReason)) outcome = 'controlled_break';
    else if (broke) outcome = 'break_unclassified';
    else if (sustainedSteps >= windowTicks && targetDisplacement <= 0.5) outcome = 'stable_anchor';
    else outcome = 'fail_dragged_overmass';
  }

  return {
    id: spec.id,
    label: spec.label,
    acceptWindowS: spec.acceptWindowS,
    expectSurvive: spec.expectSurvive,
    attached,
    attachReason,
    sustainedS,
    sustainedSteps,
    broke,
    breakReason,
    cutReason,
    reelResponse,
    peakStrain: round3(peakStrain),
    peakTension: round3(peakTension),
    breakPolicy: {
      maxTension: breakPolicy.maxTension,
      maxImpulse: breakPolicy.maxImpulse,
      maxYank: breakPolicy.maxYank,
    },
    targetMass: target.mass,
    ownerMass: player.mass ?? derived.operationalMass ?? derived.mass,
    targetDisplacement,
    outcome,
    // Causal production constants for red reports (not for dominance).
    production: {
      tetherDefId: TETHER_DEF_ID,
      breakTensionCatalog: tetherDef.breakTension,
      break: { ...tetherDef.break },
      massline: tetherDef.massline ? { ...tetherDef.massline } : null,
      reelRate: tetherDef.reelRate,
      minLength: tetherDef.minLength,
      maxLength: tetherDef.maxLength,
    },
  };
}

function evaluateTetherGates(tethers, failures) {
  for (const t of tethers) {
    if (t.expectSurvive) {
      if (t.outcome !== 'survive') {
        failures.push({
          gate: `tether_${t.id}`,
          message:
            `${t.label}: expected survive ≥${t.acceptWindowS}s; outcome=${t.outcome} ` +
            `attached=${t.attached} sustainedS=${t.sustainedS} broke=${t.broke} ` +
            `breakReason=${t.breakReason} peakStrain=${t.peakStrain} peakTension=${t.peakTension} ` +
            `production break maxTension=${t.breakPolicy.maxTension} maxImpulse=${t.breakPolicy.maxImpulse} ` +
            `maxYank=${t.breakPolicy.maxYank} (catalog breakTension=${t.production.breakTensionCatalog}) ` +
            `targetMass=${t.targetMass} ownerMass=${t.ownerMass}`,
        });
      }
    } else if (t.outcome !== 'reject' && t.outcome !== 'controlled_break' && t.outcome !== 'stable_anchor') {
      failures.push({
        gate: `tether_${t.id}`,
        message:
          `${t.label}: expected reject or controlled-break; outcome=${t.outcome} ` +
          `attached=${t.attached} sustainedS=${t.sustainedS} broke=${t.broke} ` +
          `breakReason=${t.breakReason} peakStrain=${t.peakStrain} peakTension=${t.peakTension} ` +
          `production break maxTension=${t.breakPolicy.maxTension} maxImpulse=${t.breakPolicy.maxImpulse} ` +
          `maxYank=${t.breakPolicy.maxYank} (catalog breakTension=${t.production.breakTensionCatalog}) ` +
          `targetMass=${t.targetMass} ownerMass=${t.ownerMass} targetDisplacement=${t.targetDisplacement}`,
      });
    }
  }
}

function isControlledBreak(reason) {
  if (!reason) return false;
  const r = String(reason);
  return (
    r === 'threshold'
    || r === 'physics_break'
    || r === 'sustained-overload'
    || r === 'catastrophic-overload'
    || r === 'integrity-failure'
    || r === 'snap'
    || r === 'overload'
    || r.includes('overload')
    || r.includes('threshold')
  );
}

function lastBreakReason(state, events) {
  const atts = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (atts) {
    for (const att of Object.values(atts)) {
      if (att && att.breakReason) return att.breakReason;
    }
  }
  const last = events.broke[events.broke.length - 1];
  return (last && (last.reason || last.breakReason)) || 'broke';
}

function firstActiveAttachment(state) {
  const atts = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!atts) return null;
  for (const att of Object.values(atts)) {
    if (att && att.state === 'active') return att;
  }
  return null;
}

function createTetherHarness(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.controls.flightMode = 'newtonian';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 1;
  if (state.freeIds) state.freeIds.length = 0;

  const bus = createBus();
  const helpers = {};
  const runtime = {
    core: Object.assign({}, core),
    physics: Object.assign({}, physics),
    actions: Object.assign({}, actions),
    flight: Object.assign({}, flightV3),
    combat: Object.assign({}, combat),
    tetherGameplay: Object.assign({}, tetherGameplay),
  };
  const byName = new Map(Object.entries(runtime));
  const registry = { get: (name) => byName.get(name) || null };
  const ctx = { state, bus, helpers, registry };

  const events = { latched: [], strain: [], broke: [], released: [] };
  bus.on('tether:latched', (p) => events.latched.push(p));
  bus.on('tether:strain', (p) => events.strain.push(p));
  bus.on('tether:broke', (p) => events.broke.push(p));
  bus.on('tether:broken', (p) => events.broke.push(p));
  bus.on('tether:released', (p) => events.released.push(p));

  runtime.core.init(ctx);
  return { state, bus, helpers, registry, runtime, ctx, events };
}

function initializeTetherSystems(harness) {
  const { runtime, ctx } = harness;
  runtime.physics.init(ctx);
  runtime.actions.init(ctx);
  runtime.flight.init(ctx);
  runtime.combat.init(ctx);
  runtime.tetherGameplay.init(ctx);
}

async function ensureSg02Ready(runtime, state) {
  runtime.physics.update(0, state);
  if (runtime.physics._sg02Init) await runtime.physics._sg02Init;
  runtime.physics.update(0, state);
  assert.ok(runtime.physics._sg02, 'SG-02 dynamic body owner required for tether operational matrix');
}

function stepTether(harness) {
  const { runtime, state } = harness;
  runtime.core.preStep(DT, state);
  runtime.actions.update(DT, state);
  runtime.flight.update(DT, state);
  runtime.physics.update(DT, state);
  runtime.combat.update(DT, state);
  runtime.tetherGameplay.update(DT, state);
  runtime.core.lifetimeSweep(DT, state);
}

// ─── reporting ───────────────────────────────────────────────────────────────

function printHumanTables(run, report) {
  console.log('=== Combat Operations Benchmark (gameplay balance) ===');
  console.log(`hold=${HOLD_S}s  burst=${BURST_S}s  dt=${DT}  wallMs=${report.wallMs}  receiptsMatch=${report.receiptsMatch}`);
  console.log('');
  console.log('Weapon operational matrix');
  console.log(
    pad('id', 22)
    + pad('band', 8)
    + pad('shots', 8)
    + pad('s@4s', 8)
    + pad('heatLock', 10)
    + pad('hlShots', 8)
    + pad('capStv', 8)
    + pad('recv', 6)
    + pad('dmg', 10)
    + pad('DPS', 8)
    + pad('dead', 6),
  );
  for (const w of run.weapons) {
    console.log(
      pad(w.id, 22)
      + pad(w.band, 8)
      + pad(String(w.shots), 8)
      + pad(String(w.shotsFirst4s), 8)
      + pad(w.firstHeatLockTimeS == null ? 'none' : String(w.firstHeatLockTimeS), 10)
      + pad(w.firstHeatLockShotCount == null ? '-' : String(w.firstHeatLockShotCount), 8)
      + pad(String(w.capStarveEvents), 8)
      + pad(String(w.recoveryEvents), 6)
      + pad(String(w.emittedDamage), 10)
      + pad(String(w.sustainedEffectiveDps), 8)
      + pad(w.dead ? 'YES' : 'no', 6),
    );
  }

  console.log('');
  console.log('Tether operational matrix (production break values)');
  console.log(
    pad('case', 14)
    + pad('attach', 8)
    + pad('sustS', 8)
    + pad('steps', 8)
    + pad('broke', 8)
    + pad('reason', 18)
    + pad('reelΔ', 10)
    + pad('outcome', 16),
  );
  for (const t of run.tethers) {
    const reelD = t.reelResponse && t.reelResponse.delta != null ? String(t.reelResponse.delta) : '-';
    console.log(
      pad(t.id, 14)
      + pad(t.attached ? 'yes' : 'no', 8)
      + pad(String(t.sustainedS), 8)
      + pad(String(t.sustainedSteps), 8)
      + pad(t.broke ? 'yes' : 'no', 8)
      + pad(t.breakReason || '-', 18)
      + pad(reelD, 10)
      + pad(t.outcome, 16),
    );
  }

  if (run.dominance.length) {
    console.log('');
    console.log('Same-tier dominance (red):');
    for (const d of run.dominance) {
      console.log(`  T${d.tier}: ${d.dominatorId} > ${d.dominatedId} strict=[${d.strictAxes.join(',')}]`);
    }
  }

  console.log('');
  console.log(`Failures: ${run.failures.length}`);
}

// ─── utils ───────────────────────────────────────────────────────────────────

function pad(s, n) {
  const str = String(s);
  if (str.length >= n) return str.slice(0, n - 1) + ' ';
  return str + ' '.repeat(n - str.length);
}

function round3(n) {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 1000) / 1000;
}

function stableStringify(value) {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted = {};
      for (const k of Object.keys(v).sort()) sorted[k] = v[k];
      return sorted;
    }
    return v;
  });
}

function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
