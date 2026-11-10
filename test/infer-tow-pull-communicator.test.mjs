// WF-08: the physical verbs have world presence — a dead tow and live pods can be
// found on communicators in derelict fields, board-valid, verb-named, pool-backed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WRECK_MISSIONS, wreckMissionById, pickWreckMission } from '../src/data/wreckMissions.js';
import { MISSION_TYPES } from '../src/data/missions.js';
import { salvage } from '../src/systems/salvage.js';

const TYPE_IDS = new Set(MISSION_TYPES.map((t) => t.type));
const byId = (id) => WRECK_MISSIONS.find((m) => m.id === id);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('dead tow + live pods are complete communicator templates', () => {
  for (const [id, type] of [['wm_dead_tow', 'tow_recovery'], ['wm_live_pods', 'rescue_under_fire']]) {
    const m = byId(id);
    assert.ok(m, `${id} exists`);
    assert.equal(m.type, type);
    assert.equal(m.tag, 'wreck_salvage');
    for (const k of ['title', 'giver', 'log', 'summary']) {
      assert.ok(typeof m[k] === 'string' && m[k].length > 10, `${id}.${k} is real copy`);
    }
    assert.ok(Number.isFinite(m.reward_cr) && m.reward_cr > 0, `${id} pays`);
    assert.equal(wreckMissionById(id), m, 'by-id lookup resolves');
  }
  const tow = byId('wm_dead_tow');
  assert.ok(tow.params && tow.params.cmdtyId, 'tow carries contract cargo for the pool-fold');
  const pods = byId('wm_live_pods');
  assert.equal(pods.params.podCount, 2, 'pods template names its pod count');
  assert.ok(pods.choice && pods.choice.options.length === 2, 'pods offer the rescue/strip moral choice');
});

test('both types are boardable mission types', () => {
  assert.ok(TYPE_IDS.has('tow_recovery'), 'runner owns tow_recovery');
  assert.ok(TYPE_IDS.has('rescue_under_fire'), 'runner owns rescue_under_fire');
});

test('seed-4242 communicator rotation actually deals both jobs', () => {
  const rng = mulberry32(4242);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickWreckMission(rng).id);
  assert.ok(seen.has('wm_dead_tow'), 'rotation deals the dead tow');
  assert.ok(seen.has('wm_live_pods'), 'rotation deals the live pods');
});

function offerFor(templateId) {
  const mission = wreckMissionById(templateId);
  const point = { id: `zone:sal9`, sectorId: 'sector_helios', zoneId: 'zone', pos: { x: 100, z: -50 } };
  return salvage._buildOffer.call({ _wreckStation: () => ({ id: 'station_helios' }) }, mission, point);
}

test('communicator offers are board-valid rows that name the physical verb', () => {
  const tow = offerFor('wm_dead_tow');
  for (const k of ['id', 'type', 'stationId', 'params']) {
    assert.ok(tow[k] != null, `tow offer carries ${k} (board gate)`);
  }
  assert.equal(tow.type, 'tow_recovery');
  assert.equal(tow.params.physicalVerb, 'tow');
  assert.deepEqual(tow.params.completionMethods, ['tow_in', 'sling_in']);
  assert.equal(tow.params.wreckMissionId, 'wm_dead_tow');
  assert.deepEqual(tow.params.wreckPos, { x: 100, z: -50 });

  const pods = offerFor('wm_live_pods');
  assert.equal(pods.type, 'rescue_under_fire');
  assert.equal(pods.params.physicalVerb, 'pull');
  assert.deepEqual(pods.params.completionMethods, ['stage_tow', 'corridor_pull']);
  assert.equal(pods.params.podCount, 2, 'authored pod count survives the offer floor');
  assert.ok(pods.choice, 'moral choice rides the offer');
});
