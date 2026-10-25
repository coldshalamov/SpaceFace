// ZC-A34 / build_map §33.1 row 482 — "guns become the nudge and finisher" data invariants.
//
// The rock is the gun: light guns kill a swarm-tier hull ROUGHLY 2x SLOWER than the same hull
// killed by committed thrown mass at a typical wave-1-5 engagement, impact damage scales with
// kinetic energy (mass x relative speed) and pays per victim in a packed sweep, and NO enemy HP
// was inflated to force the ratio (swarm rule 1) — the retune lowered gun lethality only.
//
// BEFORE the 2026-10-23 guns-nudge retune (snapshot of the live tables):
//   wpn_pulse_laser_s          dmg 8,  dps 44   (player starter energy gun)
//   unique_mirrorjaw_pulse     dmg 8,  dps 44   (salvage unique of the starter bolt)
//   masslineImpactDamage       MOMENTUM_DAMAGE_SCALE 1/250, TUMBLE_DAMAGE_SCALE 1/60,
//                              TUMBLE_IMPACT_MIN_DP 400
//   starter-gun TTK (dmg 8):   wasp 13 shots / 2.36 s, zealot 15 / 2.73 s, dart 6 / 1.09 s,
//                              reaver 36 / 6.55 s
// The measured starter-gun TTK (2.36 s per Wasp) was FASTER than a committed thrown boulder per
// hull (~1.8 s at 2 kills per throw), so the optimal swarm play was standing off and grinding.
//
// Model notes (this test mirrors, it does not reimplement):
//   * Weapon channel split comes from the real scalarHitToDamagePacket (energy -> thermal 0.72
//     / ion 0.28); shield -> armorFlat -> armor -> hull application mirrors combat/damage.js
//     routeDamage (per-channel pool multipliers from DAMAGE_MODEL; no subsystem share — an
//     ordinary hit selects no subsystem; shield regen excluded, which only makes guns slower, so
//     every gun number below is a conservative lower bound).
//   * Impact numbers come from the REAL resolveCollisionConsequence (impulseKernel.js) on a
//     silicate boulder (ROCK_SIZE_CLASSES.boulder, mass 12960) meeting catalog hulls.
//   * NPC lethality is pinned: every swarm-roster NPC that fires wpn_pulse_laser_s carries its
//     own dmgOverride (wasp 6, zealot 4, reaver 6, warden 8, bruiser 8), so the shared-table
//     retune touches only the player's gun.

import test from 'node:test';
import assert from 'node:assert/strict';

import { WEAPONS } from '../src/data/weapons.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { DAMAGE_MODEL } from '../src/data/combatDefs.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import {
  resolveCollisionConsequence,
  TERRAIN_CRUMPLE_LAW,
} from '../src/combat/impulseKernel.js';
import { ROCK_SIZE_CLASSES } from '../src/data/rockSubstances.js';
import {
  TAPE_THROW_PERIOD_S,
  tapeHitsPerThrow,
  tapeWaveClearSeconds,
  tapeWaveStrength,
  tapeGunsOnlySlowdownAll,
  ROCK_GUN_WAVE_MAX,
} from '../src/data/rockGunTape.js';
import {
  MOMENTUM_DAMAGE_SCALE,
  WHIP_RECOIL_FRACTION,
  TUMBLE_DAMAGE_SCALE,
  TUMBLE_IMPACT_MIN_DP,
} from '../src/systems/masslineImpactDamage.js';
import { SWARM_ROSTER, swarmRosterFor } from '../src/data/swarmMode.js';

// ─── shared model ─────────────────────────────────────────────────────────────

const CH = DAMAGE_MODEL.channelOrder;
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const weapon = (id) => WEAPONS.find((w) => w.id === id);

function freshHull(enemyId) {
  const e = ENEMY_BY_ID.get(enemyId);
  assert.ok(e, `unknown enemy ${enemyId}`);
  return { shield: e.shield, armorHp: e.armor, armorFlat: e.armorFlat || 0, hull: e.hull };
}

/** One packet through the shield -> armorFlat -> armor -> hull ladder (routeDamage mirror). */
function applyPacket(target, packet) {
  const postShield = {};
  for (const c of CH) {
    const raw = packet.channels[c] || 0;
    const mult = DAMAGE_MODEL.shieldMultipliers[c] || 1;
    const potential = raw * mult;
    const absorbed = Math.min(Math.max(0, target.shield || 0), potential);
    target.shield = Math.max(0, (target.shield || 0) - absorbed);
    postShield[c] = Math.max(0, raw - (mult > 0 ? absorbed / mult : 0));
  }
  const postFlat = {};
  for (const c of CH) postFlat[c] = Math.max(0, (postShield[c] || 0) - (target.armorFlat || 0));
  const terminal = {};
  for (const c of CH) {
    const raw = postFlat[c] || 0;
    const mult = DAMAGE_MODEL.armorMultipliers[c] || 1;
    const potential = raw * mult;
    const absorbed = Math.min(Math.max(0, target.armorHp || 0), potential);
    target.armorHp = Math.max(0, (target.armorHp || 0) - absorbed);
    terminal[c] = Math.max(0, raw - (mult > 0 ? absorbed / mult : 0));
  }
  let hullDamage = 0;
  for (const c of CH) hullDamage += (terminal[c] || 0) * (DAMAGE_MODEL.hullMultipliers[c] || 1);
  target.hull = Math.max(0, target.hull - Math.min(Math.max(0, target.hull || 0), hullDamage));
  return target.hull <= 0;
}

/** Shots (and sustained seconds) for a weapon to solo-kill a catalog hull. */
function gunTtk(weaponDef, enemyId, dmgOverride = null) {
  const t = freshHull(enemyId);
  const dmg = dmgOverride == null ? weaponDef.dmg : dmgOverride;
  let shots = 0;
  while (t.hull > 0 && shots < 10000) {
    shots += 1;
    applyPacket(t, scalarHitToDamagePacket({ damage: dmg, damageType: weaponDef.damageType }));
  }
  assert.ok(shots < 10000, `${weaponDef.id} must kill ${enemyId}`);
  return { shots, seconds: shots / weaponDef.rof };
}

/** Silicate boulder mass straight out of the live rock table (r=18, density 1.0). */
const BOULDER_MASS = Math.round(ROCK_SIZE_CLASSES.boulder.radius ** 2 * 40 * 1.0);

/** Real impulse-kernel receipt for a committed boulder slam at `closing` WU/s. */
function boulderSlam(enemyId, closing, rockMass = BOULDER_MASS) {
  const e = ENEMY_BY_ID.get(enemyId);
  const receipt = resolveCollisionConsequence({
    target: { id: 'victim', type: 'ship', mass: e.mass, hull: e.hull },
    other: { id: 'thrown_boulder', type: 'asteroid', mass: rockMass, radius: ROCK_SIZE_CLASSES.boulder.radius },
    // The solver caps contact dv at 40 WU/s; the pre-solve closing speed is the story (PQ-137.06).
    exchangedMomentum: e.mass * 40,
    preSolveClosingSpeed: closing,
    tick: 0,
    pos: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
  });
  assert.ok(receipt, `a boulder slam at ${closing} must produce a receipt`);
  assert.equal(receipt.surface, 'terrain', 'an asteroid is terrain');
  return receipt;
}

/** True when ONE kinetic packet of `damage` solo-kills the hull (the impact one-shot test). */
function onePacketKills(enemyId, damage) {
  return applyPacket(freshHull(enemyId), scalarHitToDamagePacket({ damage, damageType: 'kinetic' }));
}

/** Lowest closing speed at which one committed boulder slam solo-kills (WU/s). */
function impactKillThreshold(enemyId) {
  let lo = TERRAIN_CRUMPLE_LAW.threshold, hi = 200;
  if (!onePacketKills(enemyId, boulderSlam(enemyId, hi).impactDamage)) return null;
  while (hi - lo > 0.25) {
    const mid = (lo + hi) / 2;
    if (onePacketKills(enemyId, boulderSlam(enemyId, mid).impactDamage)) hi = mid; else lo = mid;
  }
  return hi;
}

// The throw cadence the tape models: one committed throw per TAPE_THROW_PERIOD_S, sweeping
// tapeHitsPerThrow() packed hulls (row 486 lane geometry — corridor vs lane spacing).
const THROW_SECONDS_PER_HULL = TAPE_THROW_PERIOD_S / tapeHitsPerThrow();
// A typical committed wave-1-5 engagement: the throw release band the Line works at.
const TYPICAL_THROW_CLOSING = 60;

// ─── 1. the tuned tables ──────────────────────────────────────────────────────

test('zc-a34: the starter bolt is retuned to the nudge role (dmg 8 -> 5, dps 44 -> 27.5)', () => {
  const pulse = weapon('wpn_pulse_laser_s');
  assert.equal(pulse.dmg, 5);          // BEFORE: 8
  assert.equal(pulse.dps, 27.5);       // BEFORE: 44
  assert.equal(pulse.rof, 5.5, 'the burst cadence is untouched — only the payload shrank');
  const mirrorjaw = weapon('unique_mirrorjaw_pulse');
  assert.equal(mirrorjaw.dmg, 5);      // BEFORE: 8 — the unique stays the starter bolt
  assert.equal(mirrorjaw.dps, 27.5);   // BEFORE: 44
});

test('zc-a34: no enemy HP was inflated — the waves-1-10 roster stats are byte-identical', () => {
  // BEFORE snapshot (enemies.js, unchanged by the retune — the ratio was bought with gun
  // lethality, never with padded hulls; swarm rule 1).
  const BEFORE = Object.freeze({
    wasp_swarmer: { hull: 55, armor: 8, armorFlat: 0, shield: 25, mass: 16 },
    reaver_pirate: { hull: 120, armor: 30, armorFlat: 1, shield: 50, mass: 60 },
    choir_zealot: { hull: 55, armor: 10, armorFlat: 0, shield: 40, mass: 17 },
    detonator_dart: { hull: 34, armor: 4, armorFlat: 0, shield: 0, mass: 20 },
    mine_layer_jackal: { hull: 110, armor: 28, armorFlat: 1, shield: 45, mass: 58 },
    lancer_sniper: { hull: 70, armor: 12, armorFlat: 1, shield: 50, mass: 24 },
    warden_escort: { hull: 300, armor: 90, armorFlat: 3, shield: 110, mass: 96 },
    corsair_raider: { hull: 180, armor: 45, armorFlat: 2, shield: 80, mass: 32 },
  });
  for (const [id, before] of Object.entries(BEFORE)) {
    const live = ENEMY_BY_ID.get(id);
    for (const key of ['hull', 'armor', 'armorFlat', 'shield', 'mass']) {
      assert.equal(live[key], before[key], `${id}.${key} must stay at the pre-retune value`);
    }
  }
});

test('zc-a34: every swarm-roster NPC firing the starter bolt keeps its authored damage', () => {
  // The shared-table nerf must reach the PLAYER's gun only; NPC copies are pinned by dmgOverride.
  const expected = { wasp_swarmer: 6, choir_zealot: 4, reaver_pirate: 6, warden_escort: 8, bruiser_brawler: 8 };
  for (const [id, dmg] of Object.entries(expected)) {
    const row = ENEMY_BY_ID.get(id).weapons.find((w) => w.id === 'wpn_pulse_laser_s');
    assert.ok(row, `${id} mounts the starter bolt`);
    assert.equal(row.dmgOverride, dmg, `${id} keeps its authored pulse damage`);
  }
});

test('zc-a34: the concussion cannon follows the nudge law down — the shove is the payload', () => {
  // Row-482 follow-on (2026-10-23): the starter retune (dps 44 -> 27.5) moved the WF-05 authored
  // bar "concussion dps < 25% of the starter's" from 11 to 6.875, so the concussion S follows its
  // own identity ("the collision is the payoff") down from dmg 6 / dps 7.2 to dmg 5 / dps 6.0 —
  // 21.8% of the tuned starter. The shove authority is untouched: impulsePerHit 520, tumbleTorque 35.
  const concussion = weapon('wpn_concussion_cannon_s');
  const pulse = weapon('wpn_pulse_laser_s');
  assert.equal(concussion.dmg, 5);        // BEFORE: 6
  assert.equal(concussion.dps, 6.0);      // BEFORE: 7.2
  assert.equal(concussion.impulsePerHit, 520, 'the shove is the payload — momentum untouched');
  assert.equal(concussion.tumbleTorque, 35, 'the tumble authority is untouched');
  assert.ok(concussion.dps < pulse.dps * 0.25,
    `concussion dps stays a fraction of the starter's (${(concussion.dps / pulse.dps * 100).toFixed(1)}% < 25%)`);
});

// ─── 2. the 2x law: gun TTK vs thrown-mass TTK ────────────────────────────────

test('zc-a34: the starter gun kills swarm mass hulls roughly 2x slower than a committed throw', () => {
  const pulse = weapon('wpn_pulse_laser_s');
  // Mass hulls (the throw food of waves 1-5): gun TTK ~2x the throw cadence per hull.
  for (const id of ['wasp_swarmer', 'choir_zealot']) {
    const gun = gunTtk(pulse, id);
    const ratio = gun.seconds / THROW_SECONDS_PER_HULL;
    assert.ok(ratio >= 1.9 && ratio <= 2.6,
      `${id}: gun ${gun.seconds.toFixed(2)} s vs throw ${THROW_SECONDS_PER_HULL.toFixed(2)} s/hull`
      + ` — ratio ${ratio.toFixed(2)}x must sit in the "roughly 2x" band [1.9, 2.6]`);
  }
  // The retune actually moved the needle: BEFORE dmg 8 killed a Wasp in 13 shots / 2.36 s.
  const tuned = gunTtk(pulse, 'wasp_swarmer');
  assert.ok(tuned.shots >= 19, `tuned Wasp kill takes ${tuned.shots} shots (BEFORE 13)`);
  assert.ok(tuned.seconds >= 1.5 * 2.36, `lethality cut by at least a third (BEFORE 2.36 s)`);
});

test('zc-a34: the kinetic starter already sits in the nudge band without further nerfing', () => {
  const auto = weapon('wpn_autocannon_s');
  assert.equal(auto.dmg, 14, 'the autocannon S payload is untouched (BEFORE 14)');
  const ratio = gunTtk(auto, 'wasp_swarmer').seconds / THROW_SECONDS_PER_HULL;
  assert.ok(ratio >= 1.5 && ratio <= 2.6,
    `autocannon S ratio ${ratio.toFixed(2)}x — slow-cadence armor chewer, already nudge-paced`);
});

test('zc-a34: the pressure hull stays honestly slower by gun than by committed slams', () => {
  const pulse = weapon('wpn_pulse_laser_s');
  const gun = gunTtk(pulse, 'reaver_pirate');
  // A committed boulder slam chunks the Reaver (mass-relative crumple cap binds); two slams kill.
  const slam = boulderSlam('reaver_pirate', TYPICAL_THROW_CLOSING).impactDamage;
  assert.ok(!onePacketKills('reaver_pirate', slam), 'one slam must not delete the pressure hull');
  assert.ok(onePacketKills('reaver_pirate', slam * 2 - 1), 'two committed slams finish it');
  const throwSeconds = 2 * TAPE_THROW_PERIOD_S;
  assert.ok(gun.seconds >= throwSeconds,
    `reaver by gun ${gun.seconds.toFixed(1)} s >= two committed throw cycles ${throwSeconds} s`);
});

// ─── 3. impact payoff: energy threshold, KE slope, multi-kill packing ─────────

test('zc-a34: a typical committed throw (60 WU/s) one-shot kills every light swarm hull', () => {
  for (const id of ['wasp_swarmer', 'choir_zealot', 'detonator_dart']) {
    const receipt = boulderSlam(id, TYPICAL_THROW_CLOSING);
    assert.ok(onePacketKills(id, receipt.impactDamage),
      `${id}: one committed boulder slam (${receipt.impactDamage.toFixed(1)}) must solo-kill`);
  }
});

test('zc-a34: the impact-kill energy threshold sits under the committed-throw band', () => {
  for (const id of ['wasp_swarmer', 'choir_zealot', 'detonator_dart']) {
    const threshold = impactKillThreshold(id);
    assert.ok(threshold != null && threshold <= 50,
      `${id}: one-packet kill threshold ${threshold && threshold.toFixed(1)} WU/s <= 50`
      + ' (crumple begins at 30; the throw band is ~55-70)');
  }
});

test('zc-a34: impact damage slopes with kinetic energy, not linear speed', () => {
  // Below the cap, crumple damage is 0.5*(closing-30)^2 * massScale * surface — closing 55 vs 45
  // pays (25/15)^2 = 2.78x. A linear-in-speed law would pay 1.22x.
  const at45 = boulderSlam('wasp_swarmer', 45).impactDamage;
  const at55 = boulderSlam('wasp_swarmer', 55).impactDamage;
  assert.ok(at55 / at45 >= 2.5,
    `KE slope: 55 WU/s pays ${(at55 / at45).toFixed(2)}x the 45 WU/s slam (must be >= 2.5x)`);
  // Monotone through the uncapped band (crumple begins at 30; the wasp cap binds near ~56).
  const band = [35, 40, 45, 50, 55];
  for (let i = 1; i < band.length; i++) {
    assert.ok(boulderSlam('wasp_swarmer', band[i]).impactDamage
      > boulderSlam('wasp_swarmer', band[i - 1]).impactDamage,
      `impact damage must grow from ${band[i - 1]} to ${band[i]} WU/s`);
  }
  // Above the mass-relative ceiling the law saturates by design: harder throws stop paying MORE
  // damage per victim and start paying it to MORE victims (the packing axis) — the ceiling is
  // the authored mass-anchor guarantee, never a slope break in the playable band.
  const at60 = boulderSlam('wasp_swarmer', 60).impactDamage;
  const at80 = boulderSlam('wasp_swarmer', 80).impactDamage;
  assert.ok(at60 === at80 && at60 >= 400,
    `past the cap the per-victim payoff saturates (${at60} at 60 and 80 WU/s)`);
});

test('zc-a34: multi-kill packing pays — one sweep, one killing receipt per packed hull', () => {
  // Three packed Wasps in the boulder corridor each draw their own full receipt (the payoff is
  // per victim, never split), so one committed throw clears the row-486 lane at pack density.
  const packed = ['wasp_swarmer', 'wasp_swarmer', 'choir_zealot'];
  const kills = packed.filter((id) => onePacketKills(id, boulderSlam(id, TYPICAL_THROW_CLOSING).impactDamage));
  assert.equal(kills.length, packed.length, 'every packed hull dies to the same sweep');
  assert.ok(tapeHitsPerThrow() >= 2, 'the lane geometry itself packs >= 2 hulls per corridor');
  assert.ok(kills.length >= tapeHitsPerThrow(),
    'one throw clears at least the tape model\'s expected pack');
});

test('zc-a34: the thrown body pays for being the club — recoil scales with mass x speed', () => {
  // masslineImpactDamage recoil (BEFORE 1/250): the club takes momentum * 0.65 / 100, so a flung
  // Wasp (16 t) at 100 WU/s chips itself 10.4 (BEFORE 4.2) — meaningful wear, bounded by the
  // 300 cap, so a caught hull survives several committed contacts (packing) before it breaks.
  assert.equal(MOMENTUM_DAMAGE_SCALE, 1 / 100);   // BEFORE: 1/250
  const recoil = (momentum) => Math.min(300, momentum * MOMENTUM_DAMAGE_SCALE * WHIP_RECOIL_FRACTION);
  const waspAt100 = recoil(16 * 100);
  assert.ok(waspAt100 >= 2 * (16 * 100 * (1 / 250) * WHIP_RECOIL_FRACTION),
    'the club pays at least twice its pre-retune wear');
  assert.ok(Math.abs(recoil(3200) / recoil(1600) - 2) < 1e-9,
    'below the cap the recoil is exactly linear in momentum (mass x relative speed)');
  // The legacy fling-into-terrain jackpot: pays earlier and harder than before.
  assert.equal(TUMBLE_DAMAGE_SCALE, 1 / 40);      // BEFORE: 1/60
  assert.equal(TUMBLE_IMPACT_MIN_DP, 300);        // BEFORE: 400
});

// ─── 4. the whole-tape claim: guns-only wave 5 >= 2x the throw tape ────────────

test('zc-a34: a guns-only wave-5 tape clears at least 2x slower than the throw tape', () => {
  // Live gun-tape: the wave-5 roster (wasp/reaver/zealot/dart by SWARM_ROSTER weight) killed
  // one hull at a time by the tuned starter bolt, vs the rock tape's packed throws.
  const pulse = weapon('wpn_pulse_laser_s');
  const roster = swarmRosterFor(5).filter((r) => r.fromWave <= 5);
  const weightSum = roster.reduce((s, r) => s + r.weight, 0);
  const n = tapeWaveStrength(5);
  let gunSeconds = 0;
  for (const entry of roster) {
    gunSeconds += (n * entry.weight / weightSum) * gunTtk(pulse, entry.enemyId).seconds;
  }
  const rockSeconds = tapeWaveClearSeconds(5, 'rocks');
  assert.ok(gunSeconds / rockSeconds >= 2,
    `guns-only wave 5: ${gunSeconds.toFixed(1)} s vs throw tape ${rockSeconds.toFixed(1)} s`
    + ` = ${(gunSeconds / rockSeconds).toFixed(2)}x (row 482 bar: >= 2x)`);
  // The tape model's own slowdown claim still holds with its strategy-level gun TTK.
  assert.ok(tapeGunsOnlySlowdownAll() >= 2, 'the analytical tape still clears the 2x bar');
  assert.ok(ROCK_GUN_WAVE_MAX === 10, 'the share ledger still covers waves 1-10');
});
