// PQ-030.02 — "The counter arrives first", measured as a clock pair on a fixed seed.
// Seed 30000 matches the PQ-030.00/.01 sibling proofs.
//
// Prints side by side, in player units:
//   T_UNLOCK     committed honest-hours ladder time for tech_fire_control (the sweep head's
//                tech gate; combat_basics -> strike_craft -> fire_control), plus the module
//                save on the same committed characterization rates.
//   T_ENCOUNTER  first sector-day on which the pure encounter planner schedules a
//                tether_control_raider specialist shape in sector_sker_haven — the only
//                tier-3 sector whose authored zones (outlaw_zone / ambush_lane) match the
//                specialist triggers — converted to route clock by the core 600 s day.
// Packet bar: the counter must arrive at least two hours (7200 s) before the head unlocks.
//
// The cut itself (verb, telegraph, taut one-pass sever) is proven in
// test/massline-monofilament-npc-tether.test.mjs and test/pq-140-02-specialists.test.mjs;
// the contest counters in test/tether-control-raider.test.mjs. This file owns the clock only.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { trigger as raiderAmbush } from '../src/data/encounters/334-tether-control-raider-ambush.js';
import { trigger as raiderWake } from '../src/data/encounters/335-tether-control-raider-wake.js';
import { MODULES } from '../src/data/modules.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { planetStatesForSector } from '../src/data/planetStates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  TECH_VERB_LADDER,
  VERB_LADDER_RATES,
  honestHoursForCost,
  pathCostFor,
} from '../src/data/techVerbLadder.js';
import { specialistPlanById } from '../src/ai/specialistPlans.js';
import { planEncounters } from '../src/systems/encounterDirector.js';

const SEED = 30000;
const RAIDER_SECTOR = 'sector_sker_haven';
const RAIDER_SHAPE_IDS = ['tether_control_raider_ambush', 'tether_control_raider_wake'];
const DAY_SECONDS = 600;      // core time contract: encounterDirector DAY_SECONDS (10 sim-min day)
const TWO_HOURS_S = 2 * 3600; // the packet's own "two hours before" bar
const SCAN_DAYS = 60;

test('the sweep head unlocks on the committed honest-hours ladder, not in the first session', () => {
  const ladderRow = TECH_VERB_LADDER.find((row) => row.nodeId === 'tech_fire_control');
  const path = pathCostFor('tech_fire_control');
  const timing = honestHoursForCost(path, {
    ...VERB_LADDER_RATES,
    startCredits: NEW_GAME.credits,
    startRp: NEW_GAME.researchPoints || 0,
  });

  assert.equal(path.credits, 116000, 'combat_basics + strike_craft + fire_control path credits');
  assert.equal(path.rp, 160, 'combat_basics + strike_craft + fire_control path RP');
  assert.equal(timing.bottleneck, 'credits');
  assert.equal(ladderRow.hour, Number(timing.hour.toFixed(2)),
    'ladder row must match a fresh-wallet recomputation from tech.js costs');
  assert.ok(ladderRow.hour >= 24,
    `Fire Control at ${ladderRow.hour} h must be a late-session unlock, not a first-session buy`);

  const sweep = MODULES.find((row) => row.id === 'mod_monofilament_sweep_m');
  assert.equal(sweep.requiresTech, 'tech_fire_control');
  const moduleHours = sweep.price / VERB_LADDER_RATES.creditsPerHour;
  const fitHour = timing.hour + moduleHours;
  console.log(`SEED=${SEED} T_UNLOCK tech=${timing.hour.toFixed(2)} h (credits bottleneck)`
    + ` + module ${sweep.price} cr = ${moduleHours.toFixed(2)} h => fit ~${fitHour.toFixed(2)} h`);
});

test('the specialist trigger carries no tech or wallet clock; its territory is authored early-route', () => {
  for (const [name, trigger] of [['ambush', raiderAmbush], ['wake', raiderWake]]) {
    assert.equal(trigger.gates.requiredTech, undefined,
      `${name}: the counter must not be gated on the player owning any tech`);
    assert.equal(trigger.gates.minCargoValue, undefined);
    assert.equal(trigger.gates.bountyOnly, undefined);
    assert.equal(trigger.gates.storyBeatMin, 1,
      'the only non-travel gate is the first story beat');
    assert.ok(trigger.gates.minSectorTier >= 3, `${name}: lives past the starter cluster`);
  }

  const sector = SECTORS.find((row) => row.id === RAIDER_SECTOR);
  assert.ok(sector, 'sector_sker_haven must exist');
  assert.ok(sector.tier >= raiderAmbush.gates.minSectorTier, 'Sker Haven clears the tier gate');
  assert.ok(sector.security <= raiderAmbush.gates.maxSecurity,
    'Sker Haven security clears the specialist trigger');
  const zoneTypes = new Set(zonesForSector(RAIDER_SECTOR).map((zone) => zone.type));
  for (const needed of raiderAmbush.zoneTypes) {
    assert.ok(zoneTypes.has(needed), `Sker Haven authors a ${needed} zone`);
  }

  const challenges = planetStatesForSector(RAIDER_SECTOR)
    .map((placement) => placement.challenge)
    .filter(Boolean);
  assert.ok(challenges.some((challenge) => challenge.aceId === 'ace_yara_no_cut'),
    'the named tether-cutter ace is authored on the same sector route');

  const plan = specialistPlanById('tether_cutter');
  const hull = ENEMY_TYPES.find((row) => row.id === plan.enemyId);
  assert.equal(plan.verb, 'cut_line');
  assert.ok(hull, 'the cut_line plan resolves to a live enemy id');
});

test('on seed 30000 the specialist arrives hours before the head can unlock', () => {
  const ladderRow = TECH_VERB_LADDER.find((row) => row.nodeId === 'tech_fire_control');
  const unlockSeconds = ladderRow.hour * 3600;
  const zones = zonesForSector(RAIDER_SECTOR);

  let first = null;
  for (let day = 0; day <= SCAN_DAYS && !first; day++) {
    const schedule = planEncounters(SEED, RAIDER_SECTOR, day, zones, null);
    const hit = schedule.find((item) => RAIDER_SHAPE_IDS.includes(item.shapeId)
      && item.ships.some((ship) => ship.archetype === specialistPlanById('tether_cutter').enemyId));
    if (hit) {
      first = { day, delay: hit.delay, shapeId: hit.shapeId, zoneId: hit.zoneId };
    }
  }
  assert.ok(first, `seed ${SEED} must schedule the tether-cutter within ${SCAN_DAYS} Sker Haven days`);

  const encounterSeconds = first.day * DAY_SECONDS + first.delay;
  const marginSeconds = unlockSeconds - encounterSeconds;
  assert.ok(encounterSeconds + TWO_HOURS_S <= unlockSeconds,
    `the counter (${(encounterSeconds / 3600).toFixed(2)} h) must precede the head`
    + ` (${ladderRow.hour.toFixed(2)} h) by at least two hours`);
  assert.equal(first.shapeId, 'tether_control_raider_wake',
    'the measured first contact must be a tether-cutter specialist shape');
  console.log(`SEED=${SEED} T_ENCOUNTER day=${first.day} +${first.delay.toFixed(1)}s`
    + ` = ${encounterSeconds.toFixed(0)} s = ${(encounterSeconds / 60).toFixed(1)} min`
    + ` (${first.shapeId} @ ${first.zoneId})`);
  console.log(`SEED=${SEED} MARGIN ${(marginSeconds / 3600).toFixed(2)} h before tech unlock`
    + ` (bar: >= ${(TWO_HOURS_S / 3600).toFixed(0)} h)`);
});

test('the two-hour margin holds across named seeds, not one lucky roll', () => {
  const ladderRow = TECH_VERB_LADDER.find((row) => row.nodeId === 'tech_fire_control');
  const unlockSeconds = ladderRow.hour * 3600;
  const zones = zonesForSector(RAIDER_SECTOR);
  const seeds = [30000, 47, 1, 2026, 777];

  const firsts = [];
  for (const seed of seeds) {
    let first = null;
    for (let day = 0; day <= 150 && !first; day++) {
      const schedule = planEncounters(seed, RAIDER_SECTOR, day, zones, null);
      const hit = schedule.find((item) => RAIDER_SHAPE_IDS.includes(item.shapeId)
        && item.ships.some((ship) => ship.archetype === specialistPlanById('tether_cutter').enemyId));
      if (hit) first = { day, delay: hit.delay };
    }
    assert.ok(first, `seed ${seed} must schedule the tether-cutter within 150 Sker Haven days`);
    const encounterSeconds = first.day * DAY_SECONDS + first.delay;
    assert.ok(encounterSeconds + TWO_HOURS_S <= unlockSeconds,
      `seed ${seed}: counter at ${(encounterSeconds / 3600).toFixed(2)} h must precede the`
      + ` ${ladderRow.hour.toFixed(2)} h unlock by at least two hours`);
    firsts.push({ seed, encounterSeconds });
  }

  const latest = firsts.reduce((a, b) => (b.encounterSeconds > a.encounterSeconds ? b : a));
  console.log(`SEEDS=[${seeds.join(', ')}] first contact`
    + ` ${(Math.min(...firsts.map((f) => f.encounterSeconds)) / 3600).toFixed(2)} h`
    + ` .. ${(latest.encounterSeconds / 3600).toFixed(2)} h`
    + ` | worst margin ${((unlockSeconds - latest.encounterSeconds) / 3600).toFixed(2)} h`
    + ` (seed ${latest.seed}) | bar: >= 2 h`);
});
