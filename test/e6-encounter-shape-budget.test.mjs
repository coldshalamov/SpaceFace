// E6 — build_map.md §22 row E6: a content repetition budget.
// "The same encounter shape cannot be the only combat offer for three hours."
// Fixture over the director's hour buckets: at least three shape ids in hours 0–3 and 5–9.
//
// Provenance (same derived-model convention as check-content-repetition.mjs and the B1
// fixture): this walks the live director planner's day-boundary schedules on the baseline
// catalog — scheduled offers, not fires. Ecology, pressure, proximity, and admission gates can
// still defer or fizzle a scheduled offer at runtime. Hour buckets are 0-indexed meter time
// (floor(t / ENCOUNTER_SHAPE_HOUR_SECONDS)); B1's display hours are 1-indexed — do not mix.
// "Combat offer" is the director's own taxonomy: schedule items with deck === 'combat'
// (patrol_scan counts; customs_logic_net does not; distress_call's bait branch fights but is
// authored deck 'civilian' and runtime-only offers are invisible to the walk).
import assert from 'node:assert/strict';
import test from 'node:test';

import { planEncounters } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  ENCOUNTER_REPETITION_DAY_SECONDS,
  ENCOUNTER_SHAPE_HOUR_SECONDS,
  encounterGrammarKeyFromLive,
} from '../src/systems/encounterScripts.js';

const SEEDS = [4242, 8008];
// Combat-bearing sectors pin the catalog property; the demo route pins its thin edge (exactly
// three combat shapes today — one authored loss turns this red).
const SECTORS = ['sector_nyx_march', 'sector_io_reach', 'sector_helios_prime'];
const HOURS = 10;
const DAYS = Math.round((HOURS * ENCOUNTER_SHAPE_HOUR_SECONDS) / ENCOUNTER_REPETITION_DAY_SECONDS);

function walkOffers(seed, sectorId) {
  const zones = zonesForSector(sectorId);
  assert.ok(zones && zones.length, `${sectorId} must resolve planner zones`);
  const items = [];
  for (let day = 0; day < DAYS; day++) {
    for (const item of planEncounters(seed, sectorId, day, zones)) {
      const shape = ENCOUNTERS[item.shapeId];
      if (!shape) continue;
      items.push({
        t: day * ENCOUNTER_REPETITION_DAY_SECONDS + (Number(item.delay) || 0),
        shapeId: item.shapeId,
        deck: item.deck,
        grammarKey: encounterGrammarKeyFromLive({ shape, plan: item }, item.zoneType),
      });
    }
  }
  return items;
}

const combatIn = (items, loSec, hiSec, unit = 'shapeId') => new Set(
  items
    .filter((i) => i.deck === 'combat' && i.t >= loSec && i.t < hiSec)
    .map((i) => i[unit]),
);

const H = ENCOUNTER_SHAPE_HOUR_SECONDS;

for (const sectorId of SECTORS) {
  for (const seed of SEEDS) {
    test(`E6: ${sectorId} seed ${seed} offers >= 3 combat shapes in hours 0-3 and 5-9`, () => {
      const items = walkOffers(seed, sectorId);
      const early = combatIn(items, 0, 3 * H);
      const late = combatIn(items, 5 * H, 9 * H);
      console.log(
        `E6 ${sectorId} seed=${seed}`,
        `h0-3[${early.size}]: ${[...early].join(',')}`,
        `| h5-9[${late.size}]: ${[...late].join(',')}`,
      );
      assert.ok(early.size >= 3, `hours 0-3 offered ${early.size} combat shapes, want >= 3`);
      assert.ok(late.size >= 3, `hours 5-9 offered ${late.size} combat shapes, want >= 3`);
    });

    test(`E6: ${sectorId} seed ${seed} never has a single combat shape as the only offer for three hours`, () => {
      const items = walkOffers(seed, sectorId);
      const droughts = [];
      for (let h = 0; h + 3 <= HOURS; h++) {
        const ids = combatIn(items, h * H, (h + 3) * H, 'shapeId');
        const keys = combatIn(items, h * H, (h + 3) * H, 'grammarKey');
        // A zero-offer window is a drought — a different defect than the mono-offer this row
        // names. It is collected and logged below, not asserted here.
        if (ids.size === 0) droughts.push(`${h}-${h + 3}h`);
        assert.notEqual(ids.size, 1, `window ${h}-${h + 3}h: only combat offer is ${[...ids][0]}`);
        assert.notEqual(keys.size, 1, `window ${h}-${h + 3}h: only combat grammar is ${[...keys][0]}`);
      }
      console.log(`E6 ${sectorId} seed=${seed} zero-offer windows: ${droughts.length ? droughts.join(', ') : 'none'}`);
    });
  }
}

test('E6: the planner walk is deterministic for identical seed and sector', () => {
  for (const sectorId of SECTORS) {
    const a = walkOffers(4242, sectorId).map((i) => [i.t, i.shapeId, i.deck]);
    const b = walkOffers(4242, sectorId).map((i) => [i.t, i.shapeId, i.deck]);
    assert.deepEqual(a, b);
  }
});
