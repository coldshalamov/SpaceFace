// INF-058 — the active objective has one consistent next action. The mission log's
// objectiveText was the richest projection, but the HUD ran a poorer copy (no set-piece phases,
// no express/open hauler variants, no survey-sample recon) and the local map a poorer one still
// (no commodity names), while the station contracts board showed a title and a berth without the
// objective at all. Every surface now speaks the same projection. These tests pin the wording for
// the previously-diverging contract shapes, the delegation in all three consumer files, and the
// agreement across a save round trip (the projection reads only persisted mission fields).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { objectiveText } from '../src/ui/screens/missionLog.js';

const expressDelivery = {
  type: 'cargo_delivery',
  title: 'Bonded Express 44',
  originCareer: 'hauler',
  destStationId: 'station_helios',
  objectiveProgress: 0,
  objectiveTarget: 40,
  params: { cmdtyId: 'cmdty_ore_iron', qty: 40 },
};

const surveySampleRecon = {
  type: 'recon_scan',
  title: 'Ceres field survey',
  destStationId: 'station_helios',
  objectiveProgress: 1,
  objectiveTarget: 2,
  params: { originSurveySample: true, scanTargets: 1, sampleQty: 2, sampleCmdtyId: 'cmdty_ore_iron', surveyComplete: true },
};

const miningQuota = {
  type: 'mining_quota',
  title: 'Iron run',
  destStationId: 'station_ceres',
  objectiveProgress: 3,
  objectiveTarget: 10,
  params: { cmdtyId: 'cmdty_ore_iron' },
};

test('the projection names the concrete action and target for the previously-diverging shapes', () => {
  assert.match(objectiveText(expressDelivery), /EXPRESS · Deliver 40u Iron Ore to Helios Station/, 'express variant survives');
  assert.match(objectiveText(surveySampleRecon), /Mine sample 0\/2 Iron Ore/, 'survey-sample recon says what to actually do');
  assert.equal(objectiveText(miningQuota), 'Mine 3/10 Iron Ore', 'quota names the commodity, not bare units');
});

test('the projection depends only on persisted plain-data mission fields', () => {
  // _serializeMissions clones state.missions wholesale, so a loaded mission is a deep plain
  // clone of the accepted one. The wording must survive that clone byte for byte.
  for (const m of [expressDelivery, surveySampleRecon, miningQuota]) {
    const revived = JSON.parse(JSON.stringify(m));
    assert.equal(objectiveText(revived), objectiveText(m), m.type + ' reads identically after a save round trip');
  }
  // The wholesale clone the claim rests on: _serializeMissions does not project or prune
  // missions before persisting them.
  const source = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /_serializeMissions\(\) \{\s*\n\s*return \{ missions: clonePlain\(this\.state\.missions\)/,
    'missions must be serialized wholesale for the wording to agree after load',
  );
});

test('the HUD, local map and station board delegate to the one projection — no second inference left', () => {
  const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /import \{ objectiveText \} from '\.\/screens\/missionLog\.js';/);
  assert.match(hud, /function mtObjectiveText\(m\) \{\s*\n\s*return objectiveText\(m\);/);
  assert.ok(!/Mine \$\{prog\}\/\$\{tgt\}/.test(hud), 'the HUD copy must be gone, not just shadowed');

  const localmap = readFileSync(new URL('../src/ui/screens/localmap.js', import.meta.url), 'utf8');
  assert.match(localmap, /import \{ objectiveText \} from '\.\/missionLog\.js';/);
  assert.match(localmap, /function missionProgressText\(m\) \{\s*\n\s*return objectiveText\(m\);/);
  assert.ok(!/Mine \$\{progress\}\/\$\{target\} units/.test(localmap), 'the map copy must be gone, not just shadowed');

  const contracts = readFileSync(new URL('../src/ui/station/screens/contracts.js', import.meta.url), 'utf8');
  assert.match(contracts, /import \{ objectiveText \} from '\.\.\/\.\.\/screens\/missionLog\.js';/);
  assert.match(contracts, /objectiveText\(m\), status\]/, 'the station job row carries the objective line');
});
