import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENT_FIXTURE_KEYS, AMBIENT_FIXTURE_RESERVE, AMBIENT_FIXTURE_PROFILES,
  fixtureProfileForEntity, makeAmbientFixtureReads, selectAmbientFixtures,
} from '../src/render/ambientFixtures.js';

const fixture = (id, type, x, z, data = {}, defId = '') =>
  ({ id, type, pos: { x, z }, alive: true, data, defId });
const world = (entities) => ({ entityList: entities, entities: new Map(entities.map(e => [e.id, e])) });

test('only physically credible emissive sources receive fixtures', () => {
  assert.equal(fixtureProfileForEntity(fixture(1, 'station', 0, 0)), AMBIENT_FIXTURE_PROFILES.dock);
  assert.equal(fixtureProfileForEntity(fixture(2, 'station', 0, 0, {}, 'refinery')), AMBIENT_FIXTURE_PROFILES.refinery);
  assert.equal(fixtureProfileForEntity(fixture(3, 'station', 0, 0, {}, 'research')), AMBIENT_FIXTURE_PROFILES.research);
  assert.equal(fixtureProfileForEntity(fixture(4, 'gate', 0, 0)), AMBIENT_FIXTURE_PROFILES.gate);
  assert.equal(fixtureProfileForEntity(fixture(5, 'asteroid', 0, 0)), null);
  assert.equal(fixtureProfileForEntity(fixture(6, 'wreck', 0, 0)), null);
  assert.equal(fixtureProfileForEntity(fixture(7, 'wreck', 0, 0, { emergencyLight: true })), AMBIENT_FIXTURE_PROFILES.warning);
  assert.equal(fixtureProfileForEntity(fixture(8, 'asteroid', 0, 0, { oreGlow: true })), AMBIENT_FIXTURE_PROFILES.ore);
  assert.equal(fixtureProfileForEntity(fixture(9, 'ship', 0, 0, { lightFixture: 'biology' })), AMBIENT_FIXTURE_PROFILES.biology);
  assert.equal(fixtureProfileForEntity(fixture(10, 'station', 0, 0, { lightFixture: false })), null);
  assert.equal(fixtureProfileForEntity(fixture(11, 'station', 0, 0, { powered: false })), null);
});

test('fixed two-slot selector stays sticky, never lights dead or distant objects', () => {
  const reads = makeAmbientFixtureReads();
  assert.equal(reads.length, AMBIENT_FIXTURE_KEYS.length);
  assert.equal(AMBIENT_FIXTURE_RESERVE, 2);
  const a = fixture(1, 'station', 20, 0);
  const b = fixture(2, 'gate', 60, 0);
  const c = fixture(3, 'station', 10, 0);
  const w = world([a, b]);
  selectAmbientFixtures(w, { x: 0, z: 0 }, reads);
  assert.deepEqual(new Set(reads.map(x => x.entity?.id)), new Set([1, 2]));
  w.entityList.push(c);
  w.entities.set(c.id, c);
  selectAmbientFixtures(w, { x: 0, z: 0 }, reads);
  assert.deepEqual(new Set(reads.map(x => x.entity?.id)), new Set([1, 2]), 'not a nearest-light carousel');
  b.alive = false;
  selectAmbientFixtures(w, { x: 0, z: 0 }, reads);
  assert.deepEqual(new Set(reads.map(x => x.entity?.id)), new Set([1, 3]));
  selectAmbientFixtures(w, { x: 1000, z: 1000 }, reads);
  assert.ok(reads.every(x => x.entity == null));
});

test('rebases and entity replacement cannot leave old lights pinned', () => {
  const reads = makeAmbientFixtureReads();
  const a = fixture('one', 'station', 200000, -300000);
  const w = world([a]);
  selectAmbientFixtures(w, { x: 200000, z: -300000 }, reads);
  assert.equal(reads.some(x => x.entity === a), true);
  w.entities.set('one', fixture('one', 'station', 200000, -300000));
  selectAmbientFixtures(w, { x: 200000, z: -300000 }, reads);
  assert.ok(reads.every(x => x.entity !== a));
});

test('vacancy selection ranks nearest actual sources irrespective of entity iteration order', () => {
  const reads = makeAmbientFixtureReads();
  const far = fixture('far', 'station', 365, 0);
  const near = fixture('near', 'station', 15, 0);
  const middle = fixture('middle', 'gate', 130, 0);
  selectAmbientFixtures(world([far, middle, near]), { x: 0, z: 0 }, reads);
  assert.deepEqual(new Set(reads.map(x => x.entity?.id)), new Set(['near', 'middle']));
});
