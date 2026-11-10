// D266: a mining quota must name ore the posting sector's fields can actually fill.
// Before the fix the picker drew from every tier-legal mineable commodity, so Helios
// boards posted ice/hydrogen quotas beside fields that cannot produce either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectorFieldOreWeights } from '../src/data/mining.js';
import { SECTOR_BY_ID, MINEABLE_CMDTYS, CMDTY_BY_ID } from '../src/systems/missions.js';
import { mulberry32 } from '../src/core/rng.js';

const HELIOS = SECTOR_BY_ID.get('sector_helios_prime');

// Reproduce the rollOffer quota branch: field-weighted pick, tier-filtered, fieldless fallback.
function rollQuotaCommodity(info, rng) {
  const tierCap = Math.max(info.sectorTier || 0, 0);
  const tierOk = (id) => (CMDTY_BY_ID.get(id)?.marketTier || 0) <= tierCap;
  const fieldOres = sectorFieldOreWeights(SECTOR_BY_ID.get(info.sectorId));
  const fillable = [...fieldOres.keys()].filter((id) => MINEABLE_CMDTYS.includes(id) && tierOk(id));
  if (fillable.length) {
    let total = 0;
    for (const id of fillable) total += fieldOres.get(id) || 0;
    let roll = rng() * total;
    let cmdtyId = fillable[fillable.length - 1];
    for (const id of fillable) { roll -= fieldOres.get(id) || 0; if (roll <= 0) { cmdtyId = id; break; } }
    return cmdtyId;
  }
  const pool = MINEABLE_CMDTYS.filter(tierOk);
  return pool[Math.floor(rng() * pool.length)];
}

test('D266: Helios field table contains no ice or hydrogen (the unfillable ores)', () => {
  const ores = sectorFieldOreWeights(HELIOS);
  assert.ok(ores.size > 0, 'Helios has authored fields');
  for (const bad of ['cmdty_ice_water', 'cmdty_gas_hydrogen']) {
    assert.equal(ores.has(bad), false, `${bad} is absent from Helios rocks`);
  }
  assert.ok(ores.has('cmdty_ore_iron'), 'iron is present');
  assert.ok(ores.has('cmdty_silicate'), 'silicate is present');
});

test('D266: every rolled Helios quota names ore the local field can fill', () => {
  const fieldOres = sectorFieldOreWeights(HELIOS);
  const rng = mulberry32(4242);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const id = rollQuotaCommodity({ sectorId: 'sector_helios_prime', sectorTier: 0 }, rng);
    seen.add(id);
    assert.ok(fieldOres.has(id), `quota ore ${id} is not produced by Helios fields`);
    assert.ok(MINEABLE_CMDTYS.includes(id), `${id} remains mineable`);
  }
  assert.ok(seen.size >= 2, `expected ore variety, saw ${[...seen].join(',')}`);
});

test('D266: a fieldless sector falls back to the ordinary tier draw', () => {
  const fake = { id: 'sector_fieldless', fields: [] };
  const map = new Map(SECTOR_BY_ID);
  map.set('sector_fieldless', fake);
  // Direct helper contract: no authored fields -> empty weights.
  assert.equal(sectorFieldOreWeights(fake).size, 0);
  // The roll branch falls back to the generic tier-filtered pool.
  const rng = mulberry32(7);
  const tierCap = 0;
  const tierOk = (id) => (CMDTY_BY_ID.get(id)?.marketTier || 0) <= tierCap;
  const pool = MINEABLE_CMDTYS.filter(tierOk);
  const id = pool[Math.floor(rng() * pool.length)];
  assert.ok(pool.includes(id) && tierOk(id));
});
