// PQ-176.00 — "mass is the law", measured in the hands on the real path.
//
// The bar: a full-gun fit and a full-cargo fit of the SAME hull differ in reversal time by at
// least 25 %. Reversal is measured exactly as FEEL_CONTRACT B2 measures it (the definition in
// `feel.reversal_course.mjs`): fly to steady cruise, flip and burn, stop the clock when the
// VELOCITY heading has rotated 0.88 pi from the cruise heading.
//
// Both fits are legal loadouts of one hull, checked against the hull's own nested budgets before
// they are flown, so this can never be a number produced by an impossible ship. The loaded hold is
// filled with the real commodity's authored mass per unit against the fit's own derived cargo cap,
// so the number tracks the catalog instead of a hardcoded tonnage.
//
// Determinism: one fixed seed per run, the real authoritative runtime, rapier-dynamic. No wall
// clock, no ambient randomness.

import { COMMODITIES } from '../../../../src/data/commodities.js';
import { SHIPS } from '../../../../src/data/ships.js';
import { wrapAngle } from '../../../../src/core/rng.js';
import { buildSlotList, getDerivedStats, outfitBudgetForFittings } from '../../../../src/systems/ships.js';
import { bootRealPath, writeRealPathInput } from '../realPath.mjs';

const HULL_ID = 'ship_drifter';           // two M gun mounts and two M holds: it can be either ship
const HOLD_COMMODITY = 'cmdty_ore_iron';  // the ore the starter loop actually hauls
const SETTLE_TICKS = 120;
const CRUISE_HOLD_TICKS = 900;
const REVERSAL_TICKS = 1800;
const REVERSAL_TARGET_RAD = Math.PI * 0.88;
const DELTA_BAR_PCT = 25;

// Slot order is SLOT_TYPES: weapon, shield, engine, cargo, mining, utility, thruster.
// ship_drifter: weapon M x2 | shield M | engine M | cargo M x2 | mining M | utility M x2 | thruster M.
const FITS = Object.freeze([
  Object.freeze({
    key: 'gun',
    label: 'full gun',
    sentence: 'Two M mounts loaded, both holds empty.',
    fittings: Object.freeze([
      'wpn_beam_laser_m', 'wpn_autocannon_m',
      'mod_shield_capacitor_m',
      'mod_engine_fusion_m',
      null, null,
      null,
      'mod_targeting_computer_m', 'mod_thermal_sink_m',
      null,
    ]),
    fillHold: false,
  }),
  Object.freeze({
    key: 'cargo',
    label: 'full cargo',
    sentence: 'No guns, two cargo pods, hold full of iron ore.',
    fittings: Object.freeze([
      null, null,
      'mod_shield_booster_s',
      'mod_engine_ion_m',
      'mod_cargo_pod_m', 'mod_cargo_pod_m',
      null,
      null, null,
      null,
    ]),
    fillHold: true,
  }),
]);

export const scenario = {
  id: 'fit.mass_law',
  label: 'PQ-176.00 Mass is the law — a full-gun fit and a full-cargo fit of one hull fly differently',
  async run(seed) {
    const eventTrace = [];
    const fits = {};
    let proof = null;

    for (const fit of FITS) {
      const measured = await measureFit(seed, fit, eventTrace);
      fits[fit.key] = measured.metrics;
      proof = proof || measured.proof;
    }

    const gun = fits.gun;
    const cargo = fits.cargo;
    const deltaPct = Number.isFinite(gun.velocity180TimeS) && Number.isFinite(cargo.velocity180TimeS)
      && gun.velocity180TimeS > 0
      ? ((cargo.velocity180TimeS - gun.velocity180TimeS) / gun.velocity180TimeS) * 100
      : null;

    const bars = [
      {
        bar: 'PQ-176.00',
        label: `reversal time gap, ${HULL_ID} full-cargo vs full-gun`,
        value: round(deltaPct, 1),
        unit: '% longer',
        met: Number.isFinite(deltaPct) && deltaPct >= DELTA_BAR_PCT,
        note: `full gun ${round(gun.velocity180TimeS, 3)} s at ${round(gun.operationalMass, 1)} t; `
          + `full cargo ${round(cargo.velocity180TimeS, 3)} s at ${round(cargo.operationalMass, 1)} t `
          + `(design rating ${round(gun.designMass, 1)} t; the loaded hull keeps `
          + `${round(cargo.massLoadFactor * 100, 1)} % of its authored acceleration).`,
      },
      {
        bar: 'PQ-176.00',
        label: 'both fits are legal loadouts of the same hull',
        value: (gun.budgetFits ? 1 : 0) + (cargo.budgetFits ? 1 : 0),
        unit: 'of 2 fits inside the nested budgets',
        met: gun.budgetFits === true && cargo.budgetFits === true,
      },
    ];

    return {
      eventTrace,
      metrics: {
        seed,
        hullId: HULL_ID,
        fits,
        reversalDeltaPct: round(deltaPct, 1),
        deltaBarPct: DELTA_BAR_PCT,
        realPathProof: proof,
        bars,
      },
    };
  },
};

async function measureFit(seed, fit, eventTrace) {
  const fittings = fit.fittings.slice();
  const holdMass = fit.fillHold ? fullHoldMassFor(fittings) : 0;
  const budget = outfitBudgetForFittings(HULL_ID, fittings);
  const host = await bootRealPath({
    seed,
    systems: ['actions', 'flightV3', 'physics'],
    prepareState: ({ state }) => {
      const cargo = state.player.cargo || (state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 0, capMass: 0 });
      cargo.usedMass = holdMass;
      cargo.usedVolume = holdMass > 0 ? holdMass / massPerVolume() : 0;
    },
    hulls: [{ hullId: HULL_ID, pos: { x: 0, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free' }],
  });

  try {
    const player = host.player;
    const derived = getDerivedStats(HULL_ID, fittings, host.state.player);

    host.step(SETTLE_TICKS, { before: ({ state }) => { writeRealPathInput(state, {}); } });
    host.step(CRUISE_HOLD_TICKS, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });

    const cruiseSpeed = planarSpeed(player);
    const startHeading = Math.atan2(player.vel.z, player.vel.x);
    const startRot = player.rot || 0;
    let startSimTime = null;
    let velocity180TimeS = null;

    host.step(REVERSAL_TICKS, {
      before: ({ state, host: h }) => {
        const err = wrapAngle((startRot + Math.PI) - (h.player.rot || 0));
        const aligned = Math.abs(err) < 0.06;
        writeRealPathInput(state, {
          moveZ: aligned ? 1 : 0,
          turnIntent: aligned ? 0 : Math.max(-1, Math.min(1, err / 0.32)),
        });
        if (startSimTime == null) startSimTime = state.simTime;
      },
      after: ({ state, host: h }) => {
        if (planarSpeed(h.player) < 2.2) return;
        const heading = Math.atan2(h.player.vel.z, h.player.vel.x);
        if (Math.abs(wrapAngle(heading - startHeading)) >= REVERSAL_TARGET_RAD) {
          velocity180TimeS = state.simTime - startSimTime;
          return false;
        }
      },
    });

    eventTrace.push({
      tick: host.state.tick | 0,
      simTime: host.state.simTime,
      type: `${fit.key}:reversal:measured`,
      cruiseSpeed: round(cruiseSpeed, 3),
      velocity180TimeS: round(velocity180TimeS, 3),
      operationalMass: round(derived.operationalMass, 2),
    });

    return {
      proof: host.proof(),
      metrics: {
        label: fit.label,
        sentence: fit.sentence,
        dryMass: round(derived.dryMass, 2),
        cargoMass: round(derived.cargoMass, 2),
        operationalMass: round(derived.operationalMass, 2),
        designMass: round(derived.designMass, 2),
        massLoadFactor: round(derived.massLoadFactor, 4),
        mainAccel: round(derived.propulsion.mainAccel, 2),
        reverseAccel: round(derived.propulsion.reverseAccel, 2),
        cargoCap: derived.cargoCap,
        cruiseSpeed: round(cruiseSpeed, 3),
        velocity180TimeS: round(velocity180TimeS, 3),
        budgetFits: budget ? budget.fits === true : false,
        budgetUsed: budget ? budget.used : null,
        budgetOutfitSpace: budget ? budget.outfitSpace : null,
        budgetWeaponUsed: budget ? budget.weaponUsed : null,
        budgetWeaponCapacity: budget ? budget.weaponCapacity : null,
      },
    };
  } finally {
    host.dispose();
  }
}

/** Tonnes in a hold filled to this fit's derived cargo cap with the loop's own ore. */
function fullHoldMassFor(fittings) {
  const dryDerived = getDerivedStats(HULL_ID, fittings, null);
  const units = Math.floor(Math.max(0, Number(dryDerived.cargoCap) || 0) / volPerUnit());
  return units * massPerUnit();
}

function holdCommodity() {
  return COMMODITIES.find((row) => row.id === HOLD_COMMODITY) || null;
}
function volPerUnit() {
  const row = holdCommodity();
  const v = row && Number(row.volPerU);
  return Number.isFinite(v) && v > 0 ? v : 1;
}
function massPerUnit() {
  const row = holdCommodity();
  const m = row && Number(row.massPerU);
  return Number.isFinite(m) && m > 0 ? m : 1;
}
function massPerVolume() {
  return massPerUnit() / volPerUnit();
}

function planarSpeed(entity) {
  const vel = entity && entity.vel;
  return Math.hypot((vel && vel.x) || 0, (vel && vel.z) || 0);
}

function round(value, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/** The hull, the fits and the bar, for a test or a receipt that wants to name them. */
export const MASS_LAW_BENCH = Object.freeze({
  hullId: HULL_ID,
  holdCommodity: HOLD_COMMODITY,
  deltaBarPct: DELTA_BAR_PCT,
  fits: FITS,
});

// The fit arrays above are index-addressed against the hull's canonical slot list. A hull
// re-slotted without updating them must fail loudly at import rather than silently fly a
// different ship.
export const HULL_SLOT_COUNT = buildSlotList(SHIPS.find((row) => row.id === HULL_ID)).length;
for (const fit of FITS) {
  if (fit.fittings.length !== HULL_SLOT_COUNT) {
    throw new Error(
      `fit.mass_law: the "${fit.label}" array has ${fit.fittings.length} entries but ${HULL_ID} has `
      + `${HULL_SLOT_COUNT} slots — re-index the fits against buildSlotList before flying them`,
    );
  }
}
