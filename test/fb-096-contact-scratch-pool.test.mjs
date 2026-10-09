// FB-096 — the NPC-job contact pool builds its traversal scratch at construction.
// A working hull's first weld beat must not mint three Vector3s, a Box3, and the
// traverse closure inside the presenting frame: every signature slot (and the pirate
// intercept scratch) owns them from pool fill, and a 60-contact burst reuses them all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { vfx, initNpcJobContactScratch, resetNpcJobContactScratch } from '../src/render/vfx.js';

const actor = { id: 1, pos: { x: 0, z: 0 }, radius: 10, rot: 0 };

function host(list) {
  const h = Object.create(vfx);
  h.state = { simTime: 1, entityList: list, world: { frameOrigin: { x: 0, z: 0 } } };
  h._ent = (id) => list.find((e) => e.id === id);
  h.lines = [];
  h._spawnStationSideEventStreak = (...args) => { h.lines.push(args); return 1; };
  return h;
}

const job = { kind: 'tender', phase: 'work', routeIndex: 0, route: [{ targetRef: 'object:client' }] };

test('contact scratch is filled at construction, not on first contact', () => {
  const slot = initNpcJobContactScratch({ contactBest: Infinity });
  assert.ok(slot.contactVertex instanceof THREE.Vector3);
  assert.ok(slot.contactPoint instanceof THREE.Vector3);
  assert.ok(slot.contactFrom instanceof THREE.Vector3);
  assert.ok(slot.contactBox instanceof THREE.Box3);
  assert.equal(typeof slot.contactVisit, 'function');
});

test('a 60-contact burst allocates no new traversal objects', () => {
  const root = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 26), new THREE.MeshBasicMaterial());
  root.position.set(65, 0, 0);
  root.updateMatrixWorld(true);
  const target = {
    id: 2, type: 'fx', alive: true, pos: { x: 65, z: 0 }, radius: 12,
    data: { activityObjectSlotId: 'client' },
    view: { root },
  };
  const h = host([actor, target]);
  const slot = initNpcJobContactScratch({ elapsed: 0.5, contactBest: Infinity });
  const owned = [slot.contactVertex, slot.contactPoint, slot.contactFrom, slot.contactBox, slot.contactVisit];
  let emitted = 0;
  for (let beat = 0; beat < 60; beat++) {
    // Advance sim time past the 0.5 s surface-sample hold so every beat re-runs the
    // traverse — the path that used to allocate on first contact.
    h.state.simTime = 1 + beat * 0.6;
    emitted += h._emitNpcJobContact(slot, { cadenceHz: 2 }, actor, job, false) || 0;
  }
  assert.ok(emitted >= 60 * 4, `expected the full burst to emit, got ${emitted}`);
  assert.equal(slot.contactVertex, owned[0], 'contactVertex must never be re-created');
  assert.equal(slot.contactPoint, owned[1], 'contactPoint must never be re-created');
  assert.equal(slot.contactFrom, owned[2], 'contactFrom must never be re-created');
  assert.equal(slot.contactBox, owned[3], 'contactBox must never be re-created');
  assert.equal(slot.contactVisit, owned[4], 'contactVisit must never be re-created');
  assert.equal(slot.contactSurfaceRoot, root, 'the surface cache held the sampled root');
  root.geometry.dispose();
  root.material.dispose();
});

test('release resets contact state in place and keeps the objects', () => {
  const slot = initNpcJobContactScratch({
    contactRef: 'object:client', contactRefreshAt: 5,
    contactTarget: actor, contactBest: 4, contactSurfaceRoot: {}, contactSurfaceUntil: 9,
  });
  const owned = [slot.contactVertex, slot.contactPoint, slot.contactFrom, slot.contactBox, slot.contactVisit];
  resetNpcJobContactScratch(slot);
  assert.equal(slot.contactRef, null);
  assert.equal(slot.contactTarget, null);
  assert.equal(slot.contactBest, Infinity);
  assert.equal(slot.contactSurfaceRoot, null);
  assert.equal(slot.contactSurfaceUntil, 0);
  assert.equal(slot.contactVertex, owned[0]);
  assert.equal(slot.contactPoint, owned[1]);
  assert.equal(slot.contactFrom, owned[2]);
  assert.equal(slot.contactBox, owned[3]);
  assert.equal(slot.contactVisit, owned[4]);
  assert.ok(slot.contactBox.isEmpty(), 'the weld box is emptied, not re-minted');
});

test('production pool construction wires the scratch initializer', async () => {
  const source = await readFile(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  // The signature pool loop and the pirate scratch both init at fill time; the emit path's
  // remaining guard is the bare-slot harness fallback, not the pool's allocation site.
  assert.match(source, /const slot = initNpcJobContactScratch\(\{/);
  assert.match(source, /this\._pirateInterceptScratch = initNpcJobContactScratch\(\{/);
  assert.match(source, /resetNpcJobContactScratch\(slots\[i\]\)/);
  assert.match(source, /if \(!slot\.contactVisit\) initNpcJobContactScratch\(slot\)/);
});
