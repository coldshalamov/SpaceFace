// NXB-030 — Prove three existing hull sidegrades through actual physical jobs.
//
// The packet's demand: hull choice should be decided by the work, not by a stat sheet.
// Three real starter identities (Hitch / Pelican / Wasp), three existing reachable jobs
// with distinct demands (a freight leg, a precision tow-recovery, a short fight), all
// answered through the owners that actually run them:
//
//   ships.fittingsFromDefaultModules / getDerivedStats  — accepted slots, loaded mass
//   core/flight/propulsionKernel stepPropulsion         — the accel/yaw the tick commands
//   systems/shipCapabilities                            — tow class, governed caps
//   ui/presenters/engineeringPreview + data/shipRoleLattice — the comparison the player reads
//
// The packet's repair rides along: the compare surfaces used to advertise a Hitch
// turn-rate edge over the Pelican that the kernel never produces (both hulls are governed
// at the same 2.45 yaw ceiling). The display now reads the live channels, and the test
// proves the advertised deltas equal the live deltas — including a thruster refit where
// the advertised turn-rate gain is real.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMMODITIES } from '../src/data/commodities.js';
import { MISSION_TYPES } from '../src/data/missions.js';
import { MODULES } from '../src/data/modules.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import { SHIPS } from '../src/data/ships.js';
import { compareHulls } from '../src/data/shipRoleLattice.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  buildSlotList,
  buildWeaponList,
  fittingsFromDefaultModules,
  fits,
  getDerivedStats,
} from '../src/systems/ships.js';
import {
  estimateAtCargoBasis,
  forwardAccelFor,
  governedFightSpeedFor,
  governedYawRateFor,
  shipCapabilityVerbs,
  towClassMassFor,
  travelSpeedFor,
  turnRecordText,
  yawResponseFor,
} from '../src/systems/shipCapabilities.js';
import {
  createPropulsionRuntime,
  previewBrakeStop,
  stepPropulsion,
} from '../src/core/flight/propulsionKernel.js';
import {
  presentHullCompare,
  presentShopModuleDelta,
} from '../src/ui/presenters/engineeringPreview.js';
import { sustainedFireForFit } from '../src/ui/ship/fitReadout.js';

const DT = 1 / 60;
const EPS = 1e-6;

// ---------------------------------------------------------------------------
// Fixture: the three starter identities and the three live-board job conditions.
// cargo_delivery rolls qty = 6 + floor(rng * 16) — the largest roll is 21 units of
// iron ore; the player-facing hold counts units (cargo.usedU), the physics counts
// mass (cargo.usedMass). tow_recovery spawns its slag core at Math.max(40, massU),
// so the authored default lands at 40 t. bounty_hunt is the one-target, 60-taskTime
// fight. All three types sit at risk tiers the starter board already offers.
// ---------------------------------------------------------------------------

const ORE = COMMODITIES.find((c) => c.id === 'cmdty_ore_iron');
const FREIGHT_UNITS = 21;
const FREIGHT_MASS_T = FREIGHT_UNITS * ORE.massPerU;
const TOW_CORE_MASS_T = 40;
const JOB_TYPES = ['cargo_delivery', 'tow_recovery', 'bounty_hunt'];

const STARTERS = NEW_GAME_STARTERS.map((s) => ({
  name: s.name,
  shipId: s.shipId,
  def: SHIPS.find((x) => x.id === s.shipId),
  declared: s.fittedModules.slice(),
  fittings: fittingsFromDefaultModules(s.shipId, s.fittedModules),
}));
const byName = (name) => STARTERS.find((b) => b.name === name);
const HITCH = byName('Hitch');
const PELICAN = byName('Pelican');
const WASP = byName('Wasp');

const playerWithMass = (massT) => ({
  id: 'player',
  isPlayer: true,
  cargo: { usedMass: massT, items: {}, usedVolume: 0, capVolume: 0 },
  efficiencyMods: {},
});

const derivedFor = (build, massT = 0) =>
  getDerivedStats(build.shipId, build.fittings, playerWithMass(massT));

// Drive the real propulsion kernel for `ticks` fixed steps with a constant input and
// return the last result — the same packet the flight system consumes every tick.
function kernelStep(derived, input, ticks = 40) {
  const profile = derived.propulsion;
  const body = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: Math.max(1, derived.operationalMass || 1),
    inertia: Math.max(1, (derived.operationalMass || 1) * 8),
    radius: 8,
  };
  let runtime = createPropulsionRuntime(profile);
  let result = null;
  for (let i = 0; i < ticks; i += 1) {
    result = stepPropulsion({ dt: DT, body, input, profile, runtime });
    runtime = result.runtime;
  }
  return result;
}

const rowFor = (rows, label) => rows.find((r) => r.label === label);

// ---------------------------------------------------------------------------

test('NXB-030 fixture honesty: three real starter builds, three live board jobs', () => {
  assert.equal(STARTERS.length, 3);
  for (const build of STARTERS) {
    assert.ok(build.def, `${build.name}: ship def resolves`);
    const slots = buildSlotList(build.def);
    const accepted = build.fittings.filter(Boolean);
    // Every declared module lands in a real accepted slot — no invented refits.
    assert.equal(accepted.length, build.declared.length, `${build.name} accepted all modules`);
    for (let i = 0; i < slots.length; i += 1) {
      const id = build.fittings[i];
      if (!id) continue;
      assert.ok(build.declared.includes(id), `${build.name} slot ${i} holds a declared module`);
      const moduleDef = MODULES.find((m) => m.id === id) || WEAPONS.find((w) => w.id === id);
      assert.ok(moduleDef, `${build.name}: ${id} resolves to a catalog def`);
      // fits() is the slot law the shop applies.
      assert.ok(fits(slots[i], moduleDef), `${build.name}: ${id} fits slot ${i}`);
    }
    const d = derivedFor(build);
    assert.ok(d.propulsion && Number.isFinite(d.propulsion.mainAccel));
    assert.ok(Number.isFinite(d.propulsion.maxYawRate));
    assert.ok(Number.isFinite(d.operationalMass));
  }

  const board = JOB_TYPES.map((t) => MISSION_TYPES.find((m) => m.type === t));
  assert.ok(board.every(Boolean), 'all three job types exist on the mission board');
  assert.equal(board[2].taskTime, 60, 'bounty_hunt stays the short fight');
  assert.equal(board[1].constraints.physicalVerb, 'tow', 'tow_recovery is the physical tow job');
  assert.equal(board[0].constraints.needsCargoSpace, true);
  assert.equal(ORE.massPerU * FREIGHT_UNITS, FREIGHT_MASS_T);
});

// ---------------------------------------------------------------------------

test('NXB-030 freight leg: same loaded mass through the kernel, Pelican carries it best', () => {
  const loaded = STARTERS.map((b) => ({ build: b, derived: derivedFor(b, FREIGHT_MASS_T) }));

  for (const { build, derived } of loaded) {
    // Every build accepts the job's largest roll — no hull is locked out.
    assert.ok(derived.cargoCap >= FREIGHT_UNITS, `${build.name} accepts ${FREIGHT_UNITS}u`);
    // The kernel commands exactly the profile the capability readers display.
    const step = kernelStep(derived, { throttle: 1, turn: 1 });
    assert.ok(Math.abs(step.telemetry.acceleration.x - derived.propulsion.mainAccel) < EPS,
      `${build.name}: kernel accel == profile.mainAccel`);
    assert.ok(Math.abs(step.telemetry.targetYawRate - derived.propulsion.maxYawRate) < EPS,
      `${build.name}: kernel yaw command == profile.maxYawRate`);
    assert.ok(Math.abs(step.maxSpeed - governedFightSpeedFor(derived)) < EPS);
    // Real cost of freight: loading the hold bleeds forward push for everyone.
    const empty = derivedFor(build);
    assert.ok(derived.propulsion.mainAccel < empty.propulsion.mainAccel,
      `${build.name}: the loaded hold costs thrust`);
  }

  const hitch = loaded.find((x) => x.build === HITCH).derived;
  const pelican = loaded.find((x) => x.build === PELICAN).derived;
  const wasp = loaded.find((x) => x.build === WASP).derived;

  // Pelican's mass-oriented package: the largest hold and the drive that keeps the most
  // of its rated push once the ore is aboard — kernel-verified, not spec-sheet.
  assert.ok(pelican.cargoCap > hitch.cargoCap * 2, 'Pelican holds 2.6x the Hitch');
  assert.ok(pelican.cargoCap > wasp.cargoCap * 5, 'Pelican holds 5.4x the Wasp');
  assert.ok(forwardAccelFor(pelican) > forwardAccelFor(hitch),
    'under identical ore, the Pelican shoves harder than the Hitch');
  assert.ok(pelican.massLoadFactor > hitch.massLoadFactor, 'Pelican sheds the least authority');
  assert.ok(pelican.massLoadFactor > wasp.massLoadFactor);

  // The counterweight: that mass is the cost. The Pelican is the heaviest and its dash
  // impulse is the weakest — the freight pick pays in sprint and slam response.
  assert.ok(pelican.operationalMass > hitch.operationalMass);
  assert.ok(pelican.boost.dashImpulse < wasp.boost.dashImpulse);
  assert.ok(pelican.boost.dashImpulse < hitch.boost.dashImpulse);
});

// ---------------------------------------------------------------------------

test('NXB-030 precision recovery: tow margin, reel rate and the turning circle', () => {
  const results = STARTERS.map((b) => {
    const derived = derivedFor(b);
    const p = derived.propulsion;
    const precisionSpeed = p.precisionSpeed ?? p.combatSpeed;
    const radius = precisionSpeed / p.maxYawRate;
    const stop = previewBrakeStop(
      { pos: { x: 0, z: 0 }, vel: { x: precisionSpeed, z: 0 }, rot: 0, angVel: 0 },
      p,
    );
    const verbs = shipCapabilityVerbs({ derived, fittings: b.fittings });
    return { build: b, derived, radius, stopDistance: stop.stopDistance, tow: towClassMassFor(derived), verbs };
  });

  // The 40 t slag core is reachable for every hull — Hitch is the marginal one.
  for (const r of results) {
    assert.ok(r.tow >= TOW_CORE_MASS_T, `${r.build.name} can get the core under way`);
    assert.match(r.verbs.tow.why, /under way/, 'tow advantage names its under-way bar');
  }

  const hitch = results.find((x) => x.build === HITCH);
  const pelican = results.find((x) => x.build === PELICAN);
  const wasp = results.find((x) => x.build === WASP);

  // Pelican owns the line: most tow headroom plus the heavy winch's faster reel.
  assert.ok(pelican.tow > wasp.tow && wasp.tow > hitch.tow, 'tow class orders Pelican > Wasp > Hitch');
  assert.ok(pelican.derived.tetherReelRateMult > 1.5, 'the winch is fitted, not implied');
  assert.ok(hitch.derived.tetherReelRateMult === 1 && wasp.derived.tetherReelRateMult === 1,
    'the other hulls reel at base rate — the Pelican advantage is a fitted module');

  // The honest split on the same job: the Wasp owns the turning circle and the Hitch
  // owns the shortest precision stop — the Pelican is not the answer everywhere.
  assert.ok(wasp.radius < pelican.radius, 'Wasp turns tighter at precision speed');
  assert.ok(Math.abs(hitch.radius - pelican.radius) < EPS,
    'Hitch and Pelican share the same governed turn — the old spec-sheet gap is gone');
  assert.ok(hitch.stopDistance < wasp.stopDistance, 'lightest hull stops shortest');
});

// ---------------------------------------------------------------------------

test('NXB-030 short fight: Wasp carries the fight the Pelican cannot', () => {
  const entries = STARTERS.map((b) => {
    const derived = derivedFor(b);
    const weapons = buildWeaponList(b.def, b.fittings, true, derived);
    const fire = sustainedFireForFit(b.shipId, b.fittings, playerWithMass(0));
    return { build: b, derived, weapons, fire };
  });
  const hitch = entries.find((x) => x.build === HITCH);
  const pelican = entries.find((x) => x.build === PELICAN);
  const wasp = entries.find((x) => x.build === WASP);

  // Every hull can take the contract — none is locked out of the fight.
  for (const e of entries) {
    assert.ok(e.weapons.length >= 1, `${e.build.name} fields a gun`);
    assert.ok(e.fire && e.fire.seconds > 0, `${e.build.name} sustains fire`);
    assert.ok(e.derived.shieldMax > 0, `${e.build.name} carries a shield`);
  }

  // Wasp's combat package wins on every fight axis the kernel and fittings expose.
  assert.equal(wasp.weapons.length, 2);
  assert.equal(hitch.weapons.length, 1);
  assert.equal(pelican.weapons.length, 1);
  assert.ok(wasp.derived.hullMax + wasp.derived.shieldMax > pelican.derived.hullMax + pelican.derived.shieldMax);
  assert.ok(pelican.derived.hullMax + pelican.derived.shieldMax > hitch.derived.hullMax + hitch.derived.shieldMax);
  assert.ok(governedFightSpeedFor(wasp.derived) > governedFightSpeedFor(hitch.derived));
  assert.ok(governedYawRateFor(wasp.derived) > governedYawRateFor(pelican.derived));
  assert.ok(wasp.derived.boost.dashImpulse > hitch.derived.boost.dashImpulse);
  assert.ok(wasp.derived.ramDamageDealtMult > 1 && hitch.derived.ramDamageDealtMult === 0);

  // Kernel-verified: the Wasp's yaw command really is higher in flight.
  const waspStep = kernelStep(wasp.derived, { throttle: 1, turn: 1 });
  const hitchStep = kernelStep(hitch.derived, { throttle: 1, turn: 1 });
  assert.ok(waspStep.telemetry.targetYawRate > hitchStep.telemetry.targetYawRate);

  // The trade is real: the Wasp's 120u hold is the smallest on the roster — it wins
  // the fight and loses the freight leg it cannot carry as deep.
  assert.ok(wasp.derived.cargoCap < hitch.derived.cargoCap);
});

// ---------------------------------------------------------------------------

test('NXB-030 no build is best everywhere — and none is mandatory', () => {
  // Every hull meets every job's physical threshold; the jobs just prefer different
  // hulls. That is the packet's "no universal pick" contract, stated positively.
  for (const b of STARTERS) {
    const d = derivedFor(b);
    assert.ok(d.cargoCap >= FREIGHT_UNITS, `${b.name}: freight leg reachable`);
    assert.ok(towClassMassFor(d) >= TOW_CORE_MASS_T, `${b.name}: slag core reachable`);
    assert.ok(buildWeaponList(b.def, b.fittings, true, d).length >= 1, `${b.name}: fight reachable`);
  }

  // Each build surrenders at least one headline axis.
  const h = derivedFor(HITCH);
  const p = derivedFor(PELICAN);
  const w = derivedFor(WASP);
  assert.ok(h.cargoCap < p.cargoCap, 'Hitch gives up hold capacity');
  assert.ok(h.boost.dashImpulse < w.boost.dashImpulse, 'Hitch gives up dash');
  assert.ok(p.boost.dashImpulse < h.boost.dashImpulse, 'Pelican gives up sprint');
  assert.ok(buildWeaponList(PELICAN.def, PELICAN.fittings, true, p).length <
    buildWeaponList(WASP.def, WASP.fittings, true, w).length, 'Pelican gives up guns');
  assert.ok(w.cargoCap < p.cargoCap && w.cargoCap < h.cargoCap, 'Wasp gives up freight depth');
  assert.ok(w.tetherReelRateMult === 1, 'Wasp gives up the reel rate');
});

// ---------------------------------------------------------------------------

test('NXB-030 repaired comparison: advertised deltas are the live deltas', () => {
  const hitchD = derivedFor(HITCH);
  const pelicanD = derivedFor(PELICAN);

  // The false advertisement: both hulls are governed at the same yaw ceiling — the
  // records now print identical text instead of the legacy 3.27 vs 2.02 spec gap.
  assert.equal(governedYawRateFor(hitchD), governedYawRateFor(pelicanD));
  assert.equal(turnRecordText(hitchD), turnRecordText(pelicanD));
  const estH = estimateAtCargoBasis({ derived: hitchD, basis: 'current' });
  assert.equal(estH.turnRate, governedYawRateFor(hitchD));
  assert.equal(estH.turnRate, hitchD.propulsion.maxYawRate);

  // The hull-compare surface states the condition of each advantage.
  const cmp = compareHulls('ship_pelican', 'ship_kestrel', pelicanD, hitchD);
  assert.equal(rowFor(cmp.rows, 'Turn rate').tone, 'same');
  assert.match(rowFor(cmp.rows, 'Turn rate').condition, /yaw ceiling|thruster/i);
  assert.equal(rowFor(cmp.rows, 'Fight speed').tone, 'same');
  assert.match(rowFor(cmp.rows, 'Fight speed').condition, /governed|never moves/i);
  const thrustRow = rowFor(cmp.rows, 'Thrust');
  assert.equal(thrustRow.tone, 'worse');
  assert.match(thrustRow.condition, /hold|mass/i);
  assert.ok(Math.abs(thrustRow.delta) / thrustRow.current < 0.05,
    'the thrust gap is small enough to keep honest');
  assert.match(rowFor(cmp.rows, 'Cargo').condition, /contract|hold/i);
  assert.match(rowFor(cmp.rows, 'Op. mass').condition, /survives|sooner/i);
  const sheet = presentHullCompare('ship_pelican', playerWithMass(0));
  assert.ok(sheet && sheet.compare && sheet.compare.rows.length === cmp.rows.length);
  assert.match(sheet.note, /condition|depends|empty hold|governed/i);

  // The shop delta that used to lie: Fusion Drive on the Hitch buys +travel +thrust,
  // +mass +power — and no longer advertises a max-speed or turn-rate gain.
  const shop = presentShopModuleDelta({
    defId: 'ship_kestrel',
    fittings: HITCH.fittings,
    moduleId: 'mod_engine_fusion_m',
  });
  assert.ok(shop.ok);
  const chipKeys = shop.chips.map((c) => c.key);
  assert.ok(!chipKeys.includes('maxSpeed'), 'no false max-speed chip');
  assert.ok(!chipKeys.includes('turnRate'), 'no false turn-rate chip');
  assert.ok(chipKeys.includes('travelCeiling'), 'the real travel gain is advertised');
  assert.ok(chipKeys.includes('thrust'), 'the real thrust gain is advertised');
  const fusionRow = (key) => shop.rows.find((r) => r.key === key);
  assert.equal(fusionRow('maxSpeed').tone, 'same');
  assert.equal(fusionRow('turnRate').tone, 'same');
  assert.match(fusionRow('turnRate').condition, /thruster/i);

  // The advertised numbers equal the live after-fit numbers — the same derived block
  // the kernel would command if the module were bought.
  const afterFit = HITCH.fittings.slice();
  const engineSlot = buildSlotList(HITCH.def).findIndex((s) => s.type === 'engine');
  afterFit[engineSlot] = 'mod_engine_fusion_m';
  const afterD = getDerivedStats('ship_kestrel', afterFit, playerWithMass(0));
  assert.equal(fusionRow('travelCeiling').after, travelSpeedFor(afterD));
  assert.equal(fusionRow('thrust').after, forwardAccelFor(afterD));
  assert.equal(fusionRow('turnRate').after, governedYawRateFor(afterD));
  const afterStep = kernelStep(afterD, { throttle: 1, turn: 1 });
  assert.ok(Math.abs(afterStep.telemetry.targetYawRate - governedYawRateFor(afterD)) < EPS,
    'kernel confirms the drive really leaves the yaw cap untouched');
  assert.ok(travelSpeedFor(afterD) > travelSpeedFor(hitchD), 'the travel gain is real');

  // A real thruster refit still advertises — the Vernier M on the Drifter's thruster
  // bay moves the governed yaw cap and the shop row equals the live cap.
  const drifter = SHIPS.find((x) => x.id === 'ship_drifter');
  const dSlots = buildSlotList(drifter);
  const dThruster = dSlots.findIndex((s) => s.type === 'thruster');
  const beforeD = getDerivedStats('ship_drifter', [], playerWithMass(0));
  const dAfter = Array(dSlots.length).fill(null);
  dAfter[dThruster] = 'mod_thruster_vernier_m';
  const afterDvernier = getDerivedStats('ship_drifter', dAfter, playerWithMass(0));
  const vernier = presentShopModuleDelta({
    defId: 'ship_drifter', fittings: [], moduleId: 'mod_thruster_vernier_m',
  });
  const vernierRow = vernier.rows.find((r) => r.key === 'turnRate');
  assert.equal(vernierRow.tone, 'better');
  assert.ok(governedYawRateFor(afterDvernier) > governedYawRateFor(beforeD),
    'the Vernier gain exists in the kernel profile');
  assert.equal(vernierRow.after, governedYawRateFor(afterDvernier));
  const vernierStep = kernelStep(afterDvernier, { throttle: 1, turn: 1 });
  assert.ok(vernierStep.telemetry.targetYawRate > beforeD.propulsion.maxYawRate);

  // And a real loss still advertises: the stripped thruster drops the live cap.
  const hAfter = HITCH.fittings.slice();
  hAfter[buildSlotList(HITCH.def).findIndex((s) => s.type === 'thruster')] = 'mod_thruster_stripped_s';
  const afterDstripped = getDerivedStats('ship_kestrel', hAfter, playerWithMass(0));
  assert.ok(governedYawRateFor(afterDstripped) < governedYawRateFor(hitchD));
  const stripped = presentShopModuleDelta({
    defId: 'ship_kestrel', fittings: HITCH.fittings, moduleId: 'mod_thruster_stripped_s',
  });
  assert.equal(stripped.rows.find((r) => r.key === 'turnRate').tone, 'worse');
  assert.equal(stripped.rows.find((r) => r.key === 'turnRate').after, governedYawRateFor(afterDstripped));

  // Yaw response is the separate live channel: loading the hold moves it even though
  // the governed cap does not — the two displays are no longer conflated.
  const loadedH = derivedFor(HITCH, FREIGHT_MASS_T);
  assert.equal(governedYawRateFor(loadedH), governedYawRateFor(hitchD));
  assert.ok(yawResponseFor(loadedH) < yawResponseFor(hitchD));
});
