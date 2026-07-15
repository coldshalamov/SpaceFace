import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/depth-program-factions-v0.json', import.meta.url),
  'utf8',
));

const EXPECTED_MODULES = [
  'scn',
  'mts',
  'dmc',
  'reach',
  'quiet',
  'vael',
  'free',
  'choir',
  'helix',
];
const BASELINE_IDS = new Set(fixture.map((entry) => entry.id));
const BASELINE_BY_ID = new Map(fixture.map((entry) => [entry.id, entry]));

function baselineEntries(entries) {
  return entries.filter((entry) => BASELINE_IDS.has(entry.id)).map((entry) => {
    const baseline = BASELINE_BY_ID.get(entry.id);
    const relationKeys = Object.keys(baseline.relations || {});
    return {
      ...entry,
      relations: Object.fromEntries(relationKeys.map((id) => [id, entry.relations[id]])),
    };
  });
}

test('F1 assembles the legacy faction export from one module per faction', async () => {
  const indexUrl = new URL('../src/data/factions/index.js', import.meta.url);
  assert.equal(existsSync(indexUrl), true, 'src/data/factions/index.js must exist');

  for (const moduleName of EXPECTED_MODULES) {
    const moduleUrl = new URL(`../src/data/factions/${moduleName}.js`, import.meta.url);
    assert.equal(existsSync(moduleUrl), true, `${moduleName}.js must exist`);
  }

  const indexModule = await import(indexUrl);
  const shimModule = await import('../src/data/factions.js');
  assert.deepEqual(baselineEntries(indexModule.FACTION_META), fixture);
  assert.deepEqual(baselineEntries(shimModule.FACTION_META), fixture);
});

test('F1 faction modules expose future kit fields while preserving every baseline FACTION_META value', async () => {
  const indexUrl = new URL('../src/data/factions/index.js', import.meta.url);
  assert.equal(existsSync(indexUrl), true, 'src/data/factions/index.js must exist');

  const { FACTION_KITS, FACTION_META } = await import(indexUrl);
  assert.equal(FACTION_KITS.length >= EXPECTED_MODULES.length, true);
  assert.deepEqual(baselineEntries(FACTION_META), fixture);

  for (const kit of FACTION_KITS) {
    assert.equal(typeof kit.palette, 'object', `${kit.id} palette`);
    assert.equal(Array.isArray(kit.shipRoles), true, `${kit.id} shipRoles`);
    assert.equal(Array.isArray(kit.illegalCommodities), true, `${kit.id} illegalCommodities`);
    assert.equal(typeof kit.custom, 'object', `${kit.id} custom`);
    assert.equal(typeof kit.voiceRegister, 'string', `${kit.id} voiceRegister`);
  }
});
