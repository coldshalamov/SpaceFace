import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import {
  applyFeatureConfigToMaps,
  PRODUCTION_FEATURES,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import {
  GUN_FAMILIES,
  GUN_FAMILY_BANDS,
  GUN_FAMILY_BY_WEAPON_ID,
  SCREEN_DEPTH_WU,
} from '../src/data/gunFamilies.js';
import {
  authoredKickMomentumPerS,
  fireIntervalTicks,
  judgeAgainstBand,
  mortarRadialFalloff,
  PROBE_TICKS,
  runOnce,
  simulateHeat,
  triggerPackets,
} from '../scripts/bench-gun-curve.mjs';

// OVH-08a (design/overhaul/03_COMBAT.md §3.1, ruling R5): the family table is data — every
// weapon id maps to one of the seven families, every family carries its §3.1 band, and the
// bench's pure helpers behave on fixed input. This test never boots the game.

test('every weapon id in weapons.js maps to one §3.1 gun family', () => {
  const familySet = new Set(GUN_FAMILIES);
  assert.ok(WEAPONS.length >= 40, 'the shipped table is unexpectedly small — mapping would be silently partial');
  const byId = new Set(WEAPONS.map((weapon) => weapon.id));
  for (const weapon of WEAPONS) {
    const family = GUN_FAMILY_BY_WEAPON_ID[weapon.id];
    assert.ok(family != null, `${weapon.id} has no gun family`);
    assert.ok(familySet.has(family), `${weapon.id} maps to unknown family "${family}"`);
  }
  for (const id of Object.keys(GUN_FAMILY_BY_WEAPON_ID)) {
    assert.ok(byId.has(id), `gunFamilies maps stale weapon id "${id}" that weapons.js no longer ships`);
  }
  // The §3.1 table's own members are the anchors: the named starter is Pew, the named shove gun Thump.
  assert.equal(GUN_FAMILY_BY_WEAPON_ID.wpn_pulse_laser_s, 'pew');
  assert.equal(GUN_FAMILY_BY_WEAPON_ID.wpn_concussion_cannon_m, 'thump');
});

test('every family has a band, and the §3.1 target numbers are pinned', () => {
  assert.deepEqual(GUN_FAMILIES, ['hose', 'pew', 'burn', 'needle', 'thump', 'boom', 'trick']);
  assert.equal(SCREEN_DEPTH_WU, 126, 'the screen depth is combatDefs\' 126 WU (FEEL_CONTRACT B3/B5 unit)');
  for (const family of GUN_FAMILIES) {
    const band = GUN_FAMILY_BANDS[family];
    assert.ok(band != null, `family "${family}" has no band`);
    assert.equal(band.family, family);
    assert.ok(typeof band.note === 'string' && band.note.length > 0, `${family} band carries its §3.1 sentence`);
    for (const clause of [band.ttk, band.shotsToKill, band.kick]) {
      if (clause == null) continue;
      for (const bound of [clause.min, clause.max]) {
        if (bound != null) assert.ok(Number.isFinite(bound) && bound > 0, `${family} band bound ${bound} must be a positive number`);
      }
    }
  }
  // The numbers §3.1 actually states, pinned so a typo cannot silently move a band.
  assert.equal(GUN_FAMILY_BANDS.hose.ttk.max, 1.0);                       // "kills in ≤ 1.0 s of fire"
  assert.equal(GUN_FAMILY_BANDS.hose.kick.max, 0.1);                      // "moves it ≤ 0.1 screen depth"
  assert.deepEqual(GUN_FAMILY_BANDS.pew.ttk, { min: 1.5, max: 2.0 });     // "kills in 1.5–2.0 s"
  assert.deepEqual(GUN_FAMILY_BANDS.pew.kick, { metric: 'displacementDepthPerS', min: 0.15, max: 0.45 }); // "~0.3 depth/s"
  assert.deepEqual(GUN_FAMILY_BANDS.burn.ttk, { min: 1.0, max: 2.0 });    // "kills in ~1.5 s"
  assert.equal(GUN_FAMILY_BANDS.burn.kick.max, 0.1);                      // "none — it melts"
  assert.deepEqual(GUN_FAMILY_BANDS.needle.shotsToKill, { max: 1 });      // "one shot kills it"
  assert.equal(GUN_FAMILY_BANDS.thump.ttk.min, 3.0);                      // "by bullet alone ≥ 3 s"
  assert.deepEqual(GUN_FAMILY_BANDS.thump.kick, { metric: 'singleHitDisplacement2SDepth', min: 1.0, max: null }); // B5
  assert.equal(GUN_FAMILY_BANDS.boom.ttk, null);                          // "scatters a pack" — unnumbered
  assert.equal(GUN_FAMILY_BANDS.trick.ttk, null);                         // "see §10 the Tumbler"
});

test('bench pure helpers behave on fixed input', () => {
  // triggerPackets: the authored structure decides the payload.
  assert.deepEqual(
    triggerPackets({ id: 'x', dmg: 9, impulsePerHit: 84 }).map((p) => [p.label, p.damage, p.impulsePerHit]),
    [['hit', 9, 84]],
  );
  assert.deepEqual(
    triggerPackets({ id: 'x', dmg: 4, impulsePerHit: 8, volley: { count: 6, spreadDeg: 60 } })
      .map((p) => p.damage),
    [4, 4, 4, 4, 4, 4],
  );
  assert.deepEqual(
    triggerPackets({ id: 'x', dmg: 49, impulsePerHit: 92, submunitions: { count: 2, damageMult: 0.7 } })
      .map((p) => [p.label, p.damage, p.impulsePerHit]),
    [['submunition', 34.3, 92], ['submunition', 34.3, 92]],
  );
  assert.deepEqual(
    triggerPackets({ id: 'x', dmg: 6, impulsePerHit: 10, mortarShell: { blastDmg: 24, impulse: 460 } })
      .map((p) => [p.label, p.damage, p.impulsePerHit]),
    [['impact', 6, 10], ['blast', 24, 460]],
  );
  assert.deepEqual(triggerPackets(null), []);

  // simulateHeat: fixed rhythms with hand-computed peg times.
  assert.equal(simulateHeat({ rof: 1, heatPerShot: 50, heatMax: 100, heatDissip: 0 }, { pacing: 1 }).overheatS, 1.0);
  assert.equal(simulateHeat({ rof: 5.5, heatPerShot: 6, heatMax: 100, heatDissip: 100 }, { pacing: 1 }).overheatS, null);
  assert.equal(
    simulateHeat({ continuous: true, rof: 0, heatPerSec: 60, heatMax: 100, heatDissip: 20 }, { pacing: 1 }).overheatS,
    2.5,
  );
  assert.equal(simulateHeat({ rof: 2, heatPerShot: 0, heatMax: 100, heatDissip: 10 }).reason, 'no_authored_heat');
  // The live beam (Beam Laser M: 55/s in, 22/s out) pegs in the 3–4 s window at player pacing.
  const beam = simulateHeat({ continuous: true, rof: 0, heatPerSec: 55, heatMax: 100, heatDissip: 22 });
  assert.ok(beam.overheatS > 3 && beam.overheatS < 4, `beam peg time ${beam.overheatS} outside 3–4 s`);
  // Player pacing cools 15 % faster, so it never pegs sooner than the pacing-1 run.
  assert.ok(simulateHeat({ rof: 5.5, heatPerShot: 6, heatMax: 100, heatDissip: 16 }).overheatS
    >= simulateHeat({ rof: 5.5, heatPerShot: 6, heatMax: 100, heatDissip: 16 }, { pacing: 1 }).overheatS);

  // authoredKickMomentumPerS: §3.1's "momentum delivered per second of fire" from authored stats.
  const starter = WEAPONS.find((weapon) => weapon.id === 'wpn_pulse_laser_s');
  assert.equal(authoredKickMomentumPerS(starter), 84 * 5.5);              // 462 momentum/s
  const beamWeapon = WEAPONS.find((weapon) => weapon.id === 'wpn_beam_laser_m');
  assert.equal(authoredKickMomentumPerS(beamWeapon), 10);                  // impulsePerHit × dps/dmg = 10/s

  // judgeAgainstBand: clause arithmetic on fixed rows.
  const pewBand = GUN_FAMILY_BANDS.pew;
  assert.equal(judgeAgainstBand({ ttkS: 1.8, displacementDepthPerS: 0.3 }, pewBand).verdict, 'PASS');
  assert.equal(judgeAgainstBand({ ttkS: 1.2, displacementDepthPerS: 0.3 }, pewBand).verdict, 'MISS');
  assert.equal(judgeAgainstBand({ ttkS: 1.8, displacementDepthPerS: 0.05 }, pewBand).verdict, 'MISS');
  assert.equal(judgeAgainstBand({ ttkS: null, displacementDepthPerS: 0.3 }, pewBand).verdict, 'MISS');
  assert.equal(judgeAgainstBand({}, GUN_FAMILY_BANDS.boom).verdict, '—');
  assert.equal(judgeAgainstBand({}, GUN_FAMILY_BANDS.trick).verdict, '—');
  const needleMiss = judgeAgainstBand({ shotsToKill: 2 }, GUN_FAMILY_BANDS.needle);
  assert.equal(needleMiss.verdict, 'MISS');
  assert.ok(needleMiss.checks.some((check) => check.clause === 'shotsToKill' && !check.pass));
});

// The bench harness measures under PRODUCTION_FEATURES (weaponImpulseConsequences ON) — a bare
// runOnce would route damage with the impulse path gated off and read zero displacement.
function runBench(options) {
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  try {
    return runOnce(options);
  } finally {
    restoreFeatureMaps(previous);
  }
}

// OVH-08a fix finding 1 — fire cadence must be the live cooldown rule, not a rounded interval.
// weapons.js sets `w._cooldown = 1/rof` seconds at each shot and `_tickWeapons` decrements it
// `Math.max(0, cd − 1/60)` once per tick BEFORE the `_cooldown > 0` service gate: a mount
// refires on the tick the subtraction chain reaches zero. `Math.round(60/rof)` disagrees —
// Bank Stream M's 14 rps cooled in four ticks on the old bench but takes five live, and even
// exact-on-paper rates leave a float residue (rof 6 → 11 ticks).
test('fire cadence counts the live cooldown decrements, not a rounded interval', () => {
  assert.equal(fireIntervalTicks({ rof: 14 }), 5);   // five 1/60 decrements zero out 1/14 s
  assert.equal(fireIntervalTicks({ rof: 5.5 }), 11);
  assert.equal(fireIntervalTicks({ rof: 6 }), 11);   // 1/6 − 10·(1/60) leaves a residue: tick 11
  assert.equal(fireIntervalTicks({ rof: 4 }), 16);   // round(60/4) = 15 — the old bench fired early
  assert.equal(fireIntervalTicks({ rof: 0.7 }), 86);
  assert.equal(fireIntervalTicks({}), 1);
  // End to end through the real kernel: Bank Stream M's 21-shot kill lands on tick 100 — the
  // 1.667 s the review computed from the live cadence, not the old bench's 1.333 s.
  const bankStream = WEAPONS.find((weapon) => weapon.id === 'wpn_bank_stream_m');
  const run = runBench({ weapon: bankStream, seed: 8081 });
  assert.equal(run.shotsToKill, 21);
  assert.equal(run.ttkS, 1.666667);
});

// OVH-08a fix finding 2 — the Singularity Mortar's damage and kick arrive through the real
// lifecycle: the shell flies to the target (or its authored range), pulls for the authored 1.1 s
// window, then detonates with distance falloff. The old bench applied full blast damage and kick
// on the impact tick.
test('singularity mortar runs flight, timed pull, then falloff blast', () => {
  const mortar = WEAPONS.find((weapon) => weapon.id === 'wpn_singularity_mortar_m');
  assert.ok(mortar.mortarShell.pullS > 0, 'the authored shell carries a pull window');
  const run = runBench({ weapon: mortar, seed: 8081, probe: true });
  assert.ok(run.mortar.fired === 1, 'one trigger = one shell');
  assert.ok(run.mortar.contacts >= 1, 'the shell reached the Wasp inside its authored range');
  // ~150 WU at 190 WU/s: the impact packet lands ~0.7 s after the trigger, not on it.
  assert.ok(run.mortar.firstContactS > 0.5, `contact at ${run.mortar.firstContactS} s — the old bench would have hit on tick 0`);
  // The blast cannot arrive before the pull window closes.
  assert.ok(
    run.mortar.firstDetonateS - run.mortar.firstContactS >= mortar.mortarShell.pullS,
    `detonation ${run.mortar.firstDetonateS} s vs contact ${run.mortar.firstContactS} s — the 1.1 s pull must run first`,
  );
  // And the blast it finally pays is falloff-scaled, not the flat authored 24/460.
  const fall = mortarRadialFalloff(0, 12, mortar.mortarShell.blastRadius);
  assert.equal(fall, 1, 'point-blank keeps full blast');
  assert.equal(mortarRadialFalloff(12 + mortar.mortarShell.blastRadius, 12, mortar.mortarShell.blastRadius), 0, 'the edge fades to nothing');
  assert.ok(run.directWeaponDamage > 6, 'impact + blast packet both routed through the kernel');
});

// OVH-08a fix finding 3 — the two-second shove probe integrates exactly 120 ticks. The old loop
// checked the stop condition only after integrating tick 120, so it read 121 steps: Concussion
// Cannon M showed 115.96 WU where exactly 2 s at the measured 57.5 WU/s is 115.00.
test('the 2 s shove probe integrates exactly 120 ticks', () => {
  assert.equal(PROBE_TICKS, 120);
  const cannon = WEAPONS.find((weapon) => weapon.id === 'wpn_concussion_cannon_m');
  const run = runBench({ weapon: cannon, seed: 8081, probe: true });
  // Constant post-hit velocity, no drag: displacement must equal final speed × 2.0 s — a 121st
  // step would overshoot by a full tick of drift (~0.96 WU here).
  assert.ok(
    Math.abs(run.displacementWu - run.finalSpeedWuS * (PROBE_TICKS / 60)) < 0.01,
    `displacement ${run.displacementWu} WU vs ${run.finalSpeedWuS} WU/s × ${PROBE_TICKS / 60} s`,
  );
  assert.ok(Math.abs(run.displacementWu - 115) < 0.2, `Concussion Cannon M probe ${run.displacementWu} WU — expected ~115`);
});
