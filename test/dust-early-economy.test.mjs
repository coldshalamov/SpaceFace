// DUST P2a — the honest early rung (design/program/dust/README.md packet P2).
//
// The 2026-10-31 audit: story beats pay 400–3,000 cr across hours 0–2, the Foothold wage is
// 6,000 cr/h, and the cheapest purchasable fitting on the rack was 4,000 cr — so the first
// *earned*, felt purchase landed hours out, not inside the A-list bar of ~30 minutes. The
// first-haul rack added to src/data/modules.js closes that gap without repricing the ladder,
// touching reward numbers, or adding a credit writer.
//
// TIMELINE ASSUMPTIONS (ordinary route, first hour, stated so the model is auditable):
//   t=0    The purse starts at NEW_GAME.credits (5,000 cr) and is NOT counted as earned income:
//          the first corridor's tolls and stakes consume it — the swing-drive rack note records
//          seed 4242 docking at Helios with 5,172 after a full first sweep (net +172).
//   t=9    STORY_BEATS[0] settlement lands: +400 cr (techVerbLadder EARLY_CREDITS_POOL models
//          this exact payout at hours 0.15).
//   t=20   The authored first-trade teaching contract lands: +760 cr (Helios → Ceres,
//          FIRST_TRADE_CONTRACT.terms.paysCr — one accept→haul→dock cycle after the B0 dock).
//   t>30   Ambient board work accrues at the Foothold rate, VERB_LADDER_RATES.creditsPerHour
//          (6,000 cr/h = 100 cr/min), applied ONLY after the 30-minute mark so the ≤30-min
//          claim below rests on named authored payouts alone (no wage double-counting).
import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { STORY_BEATS } from '../src/data/missions.js';
import { FIRST_TRADE_CONTRACT } from '../src/data/economyContractTemplates.js';
import { EARLY_CREDITS_POOL, VERB_LADDER_RATES } from '../src/data/techVerbLadder.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SHIPS } from '../src/data/ships.js';
import {
  buildSlotList,
  getDerivedStats,
  stationShopOffer,
  thrusterScaling,
} from '../src/systems/ships.js';

// The DUST P2a first-haul rack (src/data/modules.js, FIRST-HAUL RACK section).
const DUST_T0_IDS = Object.freeze([
  'mod_hull_patch_kit_s',   // utility S — hullFlat 30
  'mod_harbor_brake_s',     // thruster S — brakeMult 1.25, turn/strafe neutral
  'mod_cargo_net_s',        // cargo S — cargoFlat 20
  'mod_scoop_ring_s',       // utility S — magnetRange 900 (ore scoop 800 → 900)
  'mod_shield_liner_s',     // shield S — shieldFlat 15, shieldRegenFlat 1
]);

// The first-route stations a 0–2h ordinary pilot actually berths at: the start yard, the
// first-trade destination, and the B1 alloy-run destination.
const FIRST_ROUTE_STATIONS = Object.freeze(['station_helios', 'station_ceres', 'station_tycho']);

// Named authored payouts on the ordinary first-hour route, in sim minutes.
const PAYOUTS = Object.freeze([
  { atMin: 9, cr: Number(STORY_BEATS[0].reward.credits) },
  { atMin: 20, cr: Number(FIRST_TRADE_CONTRACT.terms.paysCr) },
]);
const AMBIENT_AFTER_MIN = 30; // Foothold wage counts only past this mark (see assumptions)
const CR_PER_MIN = VERB_LADDER_RATES.creditsPerHour / 60;

/** Cumulative EARNED credits at `min` sim-minutes of ordinary first-hour play. */
function cumulativeEarnedCr(min) {
  let total = 0;
  for (const p of PAYOUTS) if (p.atMin <= min) total += p.cr;
  if (min > AMBIENT_AFTER_MIN) total += (min - AMBIENT_AFTER_MIN) * CR_PER_MIN;
  return total;
}

const byId = new Map(MODULES.map((m) => [m.id, m]));
const dustRung = DUST_T0_IDS.map((id) => byId.get(id));
// Ordinary station-rack stock only: the shipjack acquisition family marks itself adventureOnly
// and is excluded from shop content by isArmoryStock (src/data/swarmCatalog.js) — it does not
// set the ordinary-route floor.
const purchasableCatalog = MODULES.filter((m) => m.purchasable !== false && !m.salvageOnly
  && m.adventureOnly !== true);
const preExistingFloor = Math.min(
  ...purchasCatalogPrices(purchasableCatalog.filter((m) => !DUST_T0_IDS.includes(m.id))));

function purchasCatalogPrices(list) { return list.map((m) => Number(m.price) || 0).filter((p) => p > 0); }

const cheapestNew = Math.min(...dustRung.map((m) => m.price));
const priciestNew = Math.max(...dustRung.map((m) => m.price));

test('the gap this rung closes was real: the old cheapest fitting was not earnable in 30 min', () => {
  // The pre-existing floor (4,000 cr — Stripped RCS / Cargo Scanner S) against the same
  // conservative earned-income model the purchase claim below uses.
  assert.ok(preExistingFloor >= 4000, `expected the old floor at 4,000 cr, found ${preExistingFloor}`);
  assert.ok(preExistingFloor > cumulativeEarnedCr(30),
    `old floor ${preExistingFloor} cr should exceed earned income at 30 min (${cumulativeEarnedCr(30)} cr)`);
});

test('the DUST tier-0 rung exists as honest data: 5 items, 800–2,500 cr, ungated, starter-fit', () => {
  assert.equal(dustRung.filter(Boolean).length, DUST_T0_IDS.length, 'every rung id resolves in MODULES');
  for (const def of dustRung) {
    assert.ok(def, def && def.id);
    assert.equal(def.tier, 0, `${def.id} is tier 0`);
    assert.equal(def.size, 'S', `${def.id} is S-size (the starter hull's bays)`);
    assert.ok(def.price >= 800 && def.price <= 2500, `${def.id} price ${def.price} inside the 800–2,500 band`);
    assert.notEqual(def.purchasable, false, `${def.id} is purchasable`);
    assert.equal(def.requiresTech, undefined, `${def.id} carries no research gate`);
    assert.ok(typeof def.sentence === 'string' && def.sentence.trim(), `${def.id} has an air sentence`);
  }
});

test('P2a bar: the cheapest new item is earnable by ~30 sim-minutes of ordinary first-hour play', () => {
  // Model: B0 settlement (+400 @ 9 min) then the first trade contract (+760 @ 20 min).
  assert.equal(PAYOUTS[0].cr, EARLY_CREDITS_POOL.credits,
    'the t=9 payout is the B0 settlement EARLY_CREDITS_POOL models');
  assert.equal(PAYOUTS[1].cr, 760, 'the t=20 payout is the authored first-trade teaching contract');
  assert.ok(cheapestNew <= cumulativeEarnedCr(30),
    `cheapest new item ${cheapestNew} cr must be earnable by 30 min (${cumulativeEarnedCr(30)} cr)`);
  // And the exact minute it first lands, under named payouts alone:
  let firstMinute = Infinity;
  for (let min = 0; min <= 60; min += 1) {
    if (cumulativeEarnedCr(min) >= cheapestNew) { firstMinute = min; break; }
  }
  assert.ok(firstMinute <= 30, `cheapest item first affordable at minute ${firstMinute}, not ≤30`);
  assert.ok(priciestNew <= cumulativeEarnedCr(60),
    `priciest new item ${priciestNew} cr earnable by 60 min (${cumulativeEarnedCr(60)} cr)`);
  // The rung does not collapse the ladder: the old floor still sits above the whole rung.
  assert.ok(preExistingFloor > priciestNew, 'the pre-existing cheapest fitting stays above the rung');
});

test('every rung row is stocked on the first-route racks (ungated = listed at every yard)', () => {
  // ships.js isUnlocked: a def with no requiresTech is buyable at any docked station; the
  // shipworks chooser lists every purchasable same-slot def. No shopOffer is needed — assert
  // none is required (an offer would override price, which the honest catalog price should not
  // need here) and that the start purse quote path resolves a price at each first-route berth.
  for (const def of dustRung) {
    for (const stationId of FIRST_ROUTE_STATIONS) {
      assert.equal(stationShopOffer(def, stationId), null,
        `${def.id} needs no station-specific offer at ${stationId}`);
    }
    assert.ok(Number.isFinite(def.price) && def.price > 0, `${def.id} has a catalog price`);
  }
});

test('the rung is felt, not stat-noise: every effect moves a live derived stat on the starter hull', () => {
  const hitch = SHIPS.find((s) => s.id === 'ship_kestrel');
  assert.ok(hitch, 'the Hitch starter hull exists');
  const slots = buildSlotList(hitch);
  const fittingsFor = (defId) => {
    const def = byId.get(defId);
    const fittings = new Array(slots.length).fill(null);
    const index = slots.findIndex((slot) => slot.type === def.slotType);
    assert.ok(index >= 0, `the Hitch has a ${def.slotType} bay for ${def.id}`);
    fittings[index] = defId;
    return fittings;
  };
  const stock = getDerivedStats(hitch.id, [], null);

  // Hull patch: additive hull on every hull that fits it.
  const patched = getDerivedStats(hitch.id, fittingsFor('mod_hull_patch_kit_s'), null);
  assert.equal(patched.hullMax, stock.hullMax + 30, 'the patch kit raises hull max by its hullFlat');

  // Harbor brake: braking authority up, turn and strafe exactly as built.
  const brake = thrusterScaling(hitch, [byId.get('mod_harbor_brake_s')]);
  const neutral = thrusterScaling(hitch, []);
  assert.equal(brake.brake, 1.25, 'the brake set scales braking thrust 1.25');
  assert.equal(brake.turn, neutral.turn, 'turn stays stock-neutral');
  assert.equal(brake.strafe, neutral.strafe, 'strafe stays stock-neutral');

  // Cargo net: the first catalog cargo module that FITS the starter's S cargo bay.
  const netted = getDerivedStats(hitch.id, fittingsFor('mod_cargo_net_s'), null);
  assert.equal(netted.cargoCap, stock.cargoCap + 20, 'the deck net raises cargo capacity by 20');
  const sCargoBefore = purchasableCatalog.filter((m) => m.slotType === 'cargo' && m.size === 'S'
    && !DUST_T0_IDS.includes(m.id)).map((m) => m.price);
  assert.ok(Math.min(...sCargoBefore) > 2500, 'before this row the only S cargo fitting cost 38,000');

  // Scoop ring: the mining pickup radius resolves max(800 floor, derived.magnetRange).
  const scooped = getDerivedStats(hitch.id, fittingsFor('mod_scoop_ring_s'), null);
  assert.equal(scooped.magnetRange, 900, 'the scoop ring publishes magnetRange 900');
  assert.ok(scooped.magnetRange > stock.magnetRange, 'and it beats the un-fitted floor');

  // Shield liner: strictly under the Shield Booster S, which stays the clear upgrade.
  const lined = getDerivedStats(hitch.id, fittingsFor('mod_shield_liner_s'), null);
  const booster = byId.get('mod_shield_booster_s');
  assert.ok(lined.shieldMax > stock.shieldMax, 'the liner raises shield max');
  assert.ok(booster.mods.shieldFlat > byId.get('mod_shield_liner_s').mods.shieldFlat,
    'the 6,000 cr Shield Booster S remains the stronger shield');
});
