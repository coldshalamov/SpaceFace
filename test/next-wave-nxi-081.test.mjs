// NXI-081 — a tier-blocked vein names the published mining head, at every depth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ORES, BEAMS } from '../src/data/mining.js';
import { MODULES } from '../src/data/modules.js';
import { drillTierReqForOre } from '../src/systems/drill.js';
import {
  drillTierBlockLabel,
  drillTierWarnCopy,
  drillFittedHeadName,
} from '../src/ui/screens/drill.js';

function headForRequirement(req) {
  return MODULES.find((row) => row.slotType === 'mining' && row.tier === req);
}

test('NXI-081: the same ore names one published head at two depths', () => {
  const ore = ORES.find((row) => drillTierReqForOre(row.id) > 1);
  assert.ok(ore, 'the ore catalog has a vein above the starter head');
  const req = drillTierReqForOre(ore.id);
  const beam = BEAMS.find((row) => row.tier === req);
  const mod = headForRequirement(req);
  assert.ok(beam, 'the beam catalog has this requirement');
  assert.ok(mod, 'the module catalog has this requirement');

  const shallow = drillTierBlockLabel(ore.id, 3);
  const deep = drillTierBlockLabel(ore.id, 40);
  assert.equal(shallow, deep);
  assert.equal(shallow, mod.name);
  assert.equal(beam.id, BEAMS.find((row) => row.tier === req).id);

  const warnShallow = drillTierWarnCopy(ore.id, 3);
  const warnDeep = drillTierWarnCopy(ore.id, 40);
  assert.equal(warnShallow, warnDeep);
  assert.equal(warnShallow, `Needs ${mod.name}`);
  assert.equal(warnShallow.includes(mod.name), true);
});

test('NXI-081: an unknown ore and a starter vein name no head', () => {
  for (const row of [3, 40]) {
    const unknown = drillTierBlockLabel('not-an-ore', row);
    assert.equal(unknown, '');
    assert.equal(drillTierWarnCopy('not-an-ore', row), '');
    assert.equal(/MK\d|UPGRADE|Industrial/.test(unknown), false);
  }

  const starter = ORES.find((row) => drillTierReqForOre(row.id) === 1);
  assert.ok(starter, 'the ore catalog has a starter vein');
  assert.equal(drillTierBlockLabel(starter.id, 3), '');
  assert.equal(drillTierBlockLabel(starter.id, 40), '');

  const fitted = headForRequirement(1);
  assert.equal(drillFittedHeadName(1), fitted.name);
  assert.equal(drillFittedHeadName(99), '');
});

test('NXI-081: the screen asks the ore, and a disagreeing tile stamp is not an input', () => {
  const ore = ORES.find((row) => drillTierReqForOre(row.id) > 1);
  const req = drillTierReqForOre(ore.id);
  const mod = headForRequirement(req);
  // The helper has no tierReq argument. A stamp that disagrees cannot rename the head.
  assert.equal(drillTierBlockLabel(ore.id, 3), mod.name);
  assert.notEqual(mod.name, headForRequirement(req === 4 ? 2 : req + 1)?.name);

  const src = readFileSync(new URL('../src/ui/screens/drill.js', import.meta.url), 'utf8');
  assert.equal(src.includes('drillTierBlockLabel('), true);
  assert.equal(src.includes('drillTierWarnCopy('), true);
  assert.equal(src.includes('drillFittedHeadName('), true);
  assert.equal(src.includes('t.tierReq'), false);
  assert.equal(src.includes('p.tierReq'), false);
  assert.equal(src.includes('UPGRADE DRILL'), false);
  assert.equal(src.includes('BASIC MK1'), false);
});
