import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTERWEIGHT_EVENTS, COUNTERWEIGHT_EVENT_BY_ID, eventUnlocked,
  dynamicBodyCount, MAX_DYNAMIC_BODIES, VENUE_LOCAL, VENUE_SECTOR_ID,
  VENUE_STRUCTURES, COMMIT_RADIUS_WU,
} from '../src/features/counterweightCircuit/definition.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { modelTruthRow } from '../src/data/modelTruth.js';
import { freshEventRecord } from '../src/features/counterweightCircuit/scoring.js';
import { venueAnchorGlobal } from '../src/features/counterweightCircuit/physical.js';

test('seven authored events in order with complete fields', () => {
  assert.equal(COUNTERWEIGHT_EVENTS.length, 7);
  const expected = ['soft_berth', 'long_arm', 'clean_sling', 'fragile_freight', 'split_decision', 'moving_berth', 'counterweight_finale'];
  assert.deepEqual(COUNTERWEIGHT_EVENTS.map((d) => d.id), expected);
  for (const [i, def] of COUNTERWEIGHT_EVENTS.entries()) {
    assert.equal(def.index, i);
    assert.ok(def.title && def.tagline && def.skill, `${def.id} presentation fields`);
    assert.ok(Array.isArray(def.bodies) && def.bodies.length > 0, `${def.id} bodies`);
    assert.ok(Array.isArray(def.legs) && def.legs.length > 0, `${def.id} legs`);
    assert.ok(def.medals && def.medals.gold < def.medals.silver && def.medals.silver < def.medals.bronze,
      `${def.id} medal ladder ordered`);
    assert.ok(def.rewardCr > 0, `${def.id} reward`);
    assert.ok(dynamicBodyCount(def) <= MAX_DYNAMIC_BODIES, `${def.id} within dynamic budget`);
  }
});

test('every event references real released assets and sane masses', () => {
  const allBodies = [...VENUE_STRUCTURES, ...COUNTERWEIGHT_EVENTS.flatMap((d) => d.bodies)];
  for (const body of allBodies) {
    assert.ok(body.asset && body.file, `body ${body.role} has asset+file`);
    assert.ok(body.file.endsWith('.glb'), `${body.file} is a GLB`);
    if (body.kind === 'load' || body.kind === 'mobile') {
      assert.ok(body.mass > 0 && body.mass < 200, `${body.role} sane mass ${body.mass}`);
    }
  }
  // Assets that must have model-truth rows for fitted collision skins.
  for (const body of allBodies) {
    assert.ok(modelTruthRow(body.asset), `model truth row for ${body.asset}`);
  }
});

test('progression: previewable, finale requires first five, event6 needs soft_berth', () => {
  const empty = {};
  for (const def of COUNTERWEIGHT_EVENTS.slice(0, 5)) assert.equal(eventUnlocked(def, empty), true, `${def.id} open`);
  assert.equal(eventUnlocked(COUNTERWEIGHT_EVENT_BY_ID.moving_berth, empty), false);
  assert.equal(eventUnlocked(COUNTERWEIGHT_EVENT_BY_ID.counterweight_finale, empty), false);
  const records = { soft_berth: { ...freshEventRecord(), completions: 1 } };
  assert.equal(eventUnlocked(COUNTERWEIGHT_EVENT_BY_ID.moving_berth, records), true);
  assert.equal(eventUnlocked(COUNTERWEIGHT_EVENT_BY_ID.counterweight_finale, records), false);
  for (const id of ['long_arm', 'clean_sling', 'fragile_freight', 'split_decision']) {
    records[id] = { ...freshEventRecord(), completions: 1 };
  }
  assert.equal(eventUnlocked(COUNTERWEIGHT_EVENT_BY_ID.counterweight_finale, records), true);
});

test('venue anchor resolves inside Pallas Drift and courses stay in sector', () => {
  const anchor = venueAnchorGlobal();
  const expected = sectorLocalToGlobalForSector(VENUE_LOCAL, VENUE_SECTOR_ID);
  assert.equal(anchor.x, expected.x);
  assert.equal(anchor.z, expected.z);
  // Every authored local offset resolves to a finite global point.
  for (const def of COUNTERWEIGHT_EVENTS) {
    for (const body of def.bodies) {
      const p = sectorLocalToGlobalForSector({ x: VENUE_LOCAL.x + body.local.x, z: VENUE_LOCAL.z + body.local.z }, VENUE_SECTOR_ID);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    }
  }
});

test('soft berth medal targets match the brief (40/60/90)', () => {
  const m = COUNTERWEIGHT_EVENT_BY_ID.soft_berth.medals;
  assert.deepEqual({ gold: m.gold, silver: m.silver, bronze: m.bronze }, { gold: 40, silver: 60, bronze: 90 });
});
