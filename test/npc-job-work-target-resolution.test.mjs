// The cut beam must terminate on a ROCK, and on the right one, across a save/reload.
//
// `traffic._buildJobSpec` names a miner's field waypoint `field:<entityId>`, and the renderer parses
// that back to aim the extraction beam at the real asteroid. The subtlety is that `job.route` is
// PERSISTED — npcJobsRuntime serializes the kernel record and the save owner writes it out — while
// entity ids are handed out fresh on restore. A restored barge therefore carries an id that may now
// belong to something else entirely.
//
// Without a type check the beam would happily cut whatever holds that id: a station, another ship, a
// pickup. The failure is silent and reads as an art bug rather than a stale reference, so it is
// exactly the kind of thing that survives for months.

import test from 'node:test';
import assert from 'node:assert/strict';

import { vfx } from '../src/render/vfx.js';

/** A resolver bound to a fixed id->entity table, with nothing else from the vfx system. */
function resolverOver(entities) {
  const host = Object.create(vfx);
  host._ent = (id) => entities.get(id) || null;
  return (route) => host._npcJobWorkTarget({ route });
}

const rock = { id: 42, type: 'asteroid', alive: true, pos: { x: 100, z: 40 }, radius: 11 };
const fieldRoute = [
  { id: 'home:station_helios', pos: { x: 0, z: 0 } },
  { id: 'field:42', pos: { x: 100, z: 40 } },
];

test('resolves the real asteroid named by the field waypoint', () => {
  const resolve = resolverOver(new Map([[42, rock]]));
  assert.equal(resolve(fieldRoute), rock);
});

test('refuses a non-asteroid that now holds the persisted id', () => {
  // The save/reload case. Every one of these would previously have been beamed.
  for (const impostor of [
    { id: 42, type: 'station', alive: true, pos: { x: 100, z: 40 }, radius: 34 },
    { id: 42, type: 'ship', alive: true, pos: { x: 100, z: 40 }, radius: 14 },
    { id: 42, type: 'pickup', alive: true, pos: { x: 100, z: 40 }, radius: 8 },
    { id: 42, type: 'projectile', alive: true, pos: { x: 100, z: 40 }, radius: 1 },
  ]) {
    assert.equal(resolverOver(new Map([[42, impostor]]))(fieldRoute), null,
      `a ${impostor.type} must never be treated as a rock face`);
  }
});

test('refuses a mined-out or despawned rock', () => {
  const dead = { ...rock, alive: false };
  assert.equal(resolverOver(new Map([[42, dead]]))(fieldRoute), null);
  assert.equal(resolverOver(new Map())(fieldRoute), null, 'id no longer present at all');
});

test('refuses a rock with no position rather than beaming at the origin', () => {
  const noPos = { id: 42, type: 'asteroid', alive: true, radius: 11 };
  assert.equal(resolverOver(new Map([[42, noPos]]))(fieldRoute), null);
});

test('ignores every waypoint that is not a field, and malformed ids', () => {
  const resolve = resolverOver(new Map([[42, rock]]));
  assert.equal(resolve([{ id: 'home:station_helios' }, { id: 'dest:station_coalition' }]), null);
  assert.equal(resolve([{ id: 'field:' }]), null, 'empty id');
  assert.equal(resolve([{ id: 'field:abc' }]), null, 'non-numeric id');
  assert.equal(resolve([{ id: 'fieldwork:42' }]), null, 'prefix must be exact');
  assert.equal(resolve([{ id: 42 }]), null, 'non-string id');
  assert.equal(resolve([null, undefined, {}]), null, 'holes in the route');
});

test('a corrupt or absent route yields null instead of throwing into the render loop', () => {
  const resolve = resolverOver(new Map([[42, rock]]));
  for (const route of [undefined, null, 'field:42', 0, {}]) {
    assert.doesNotThrow(() => resolve(route));
    assert.equal(resolve(route), null);
  }
});

test('scans past a dead field waypoint to a live one', () => {
  // A cyclic miner route can accumulate more than one field entry; the first being mined out must
  // not blind the barge to the seam it is actually working.
  const second = { id: 77, type: 'asteroid', alive: true, pos: { x: 260, z: -30 }, radius: 9 };
  const resolve = resolverOver(new Map([[42, { ...rock, alive: false }], [77, second]]));
  assert.equal(resolve([{ id: 'field:42' }, { id: 'field:77' }]), second);
});
