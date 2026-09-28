import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createPresentationWorld,
  PRESENTATION_DIRTY,
  setPresentationWorldUnchangedRefreshSkipForBench,
  getPresentationWorldUnchangedRefreshSkipForBench,
} from '../src/render/presentationWorld.js';

function makeEntity(id, overrides = {}) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    isPlayer: false,
    pos: { x: id * 10, y: 0, z: id * 3 },
    prevPos: { x: id * 10, y: 0, z: id * 3 },
    rot: 0.25,
    bank: 0,
    pitch: 0,
    prevRot: 0.25,
    prevBank: 0,
    prevPitch: 0,
    radius: 8,
    flags: {},
    ...overrides,
  };
}

describe('presentation-world-unchanged-refresh-skip', () => {
  it('skip is on by default and bench toggle restores always-write', () => {
    assert.equal(getPresentationWorldUnchangedRefreshSkipForBench(), true);
    setPresentationWorldUnchangedRefreshSkipForBench(false);
    assert.equal(getPresentationWorldUnchangedRefreshSkipForBench(), false);
    setPresentationWorldUnchangedRefreshSkipForBench(true);
    assert.equal(getPresentationWorldUnchangedRefreshSkipForBench(), true);
  });

  it('unchanged refresh returns false and does not mark TRANSFORM dirty', () => {
    setPresentationWorldUnchangedRefreshSkipForBench(true);
    const world = createPresentationWorld({ capacity: 8 });
    const entity = makeEntity(1);
    world.allocateEntity(entity);
    const slot = world.getSlotForEntityId(1);
    world.clearDirty(slot);

    assert.equal(world.refreshVisibleEntity(slot, entity, entity.radius), false);
    assert.equal(world.dirtyMasks[slot] & PRESENTATION_DIRTY.TRANSFORM, 0);
    assert.equal(world.x[slot], entity.pos.x);
    assert.equal(world.z[slot], entity.pos.z);
    assert.equal(world.rot[slot], entity.rot);
  });

  it('pose change returns true, updates scalars, and marks TRANSFORM dirty', () => {
    setPresentationWorldUnchangedRefreshSkipForBench(true);
    const world = createPresentationWorld({ capacity: 8 });
    const entity = makeEntity(2);
    world.allocateEntity(entity);
    const slot = world.getSlotForEntityId(2);
    world.clearDirty(slot);

    entity.prevPos.x = entity.pos.x;
    entity.prevPos.z = entity.pos.z;
    entity.pos.x += 1.5;
    entity.pos.z += 0.5;
    entity.prevRot = entity.rot;
    entity.rot += 0.1;

    assert.equal(world.refreshVisibleEntity(slot, entity, entity.radius), true);
    assert.ok(world.dirtyMasks[slot] & PRESENTATION_DIRTY.TRANSFORM);
    assert.equal(world.x[slot], entity.pos.x);
    assert.equal(world.z[slot], entity.pos.z);
    assert.equal(world.rot[slot], entity.rot);
  });

  it('radius / flag metadata change is observed without a pose delta', () => {
    setPresentationWorldUnchangedRefreshSkipForBench(true);
    const world = createPresentationWorld({ capacity: 8 });
    const entity = makeEntity(3);
    world.allocateEntity(entity);
    const slot = world.getSlotForEntityId(3);
    world.clearDirty(slot);

    // First refresh with new radius should update metadata (pose unchanged → false).
    assert.equal(world.refreshVisibleEntity(slot, entity, 22), false);
    assert.equal(world.radii[slot], 22);

    // Same again is a true unchanged hit.
    assert.equal(world.refreshVisibleEntity(slot, entity, 22), false);
    assert.equal(world.radii[slot], 22);

    entity.flags = { forceRender: true };
    assert.equal(world.refreshVisibleEntity(slot, entity, 22), false);
    // flags packed into world.flags — forceRender bit must be set
    assert.ok(world.flags[slot] !== 0);
  });

  it('entity ref replacement forces a refresh path', () => {
    setPresentationWorldUnchangedRefreshSkipForBench(true);
    const world = createPresentationWorld({ capacity: 8 });
    const first = makeEntity(4);
    world.allocateEntity(first);
    const slot = world.getSlotForEntityId(4);
    world.clearDirty(slot);
    assert.equal(world.refreshVisibleEntity(slot, first, first.radius), false);

    const twin = makeEntity(4); // new object, same id/pose
    assert.equal(world.entityRefs[slot] === twin, false);
    // New ref with identical scalars: early-out requires same ref, so we enter
    // write path; pose unchanged → writePoseScalars returns false.
    assert.equal(world.refreshVisibleEntity(slot, twin, twin.radius), false);
    assert.equal(world.entityRefs[slot], twin);
  });

  it('toggle off agrees with toggle on for a mover+static mix (oracle)', () => {
    const movers = 3;
    const n = 24;

    function run(skipOn) {
      setPresentationWorldUnchangedRefreshSkipForBench(skipOn);
      const world = createPresentationWorld({ capacity: n + 4 });
      const entities = [];
      for (let i = 0; i < n; i++) {
        const e = makeEntity(i + 1, { type: i % 5 === 0 ? 'ship' : 'asteroid' });
        entities.push(e);
        world.allocateEntity(e);
      }
      const slots = entities.map((e) => world.getSlotForEntityId(e.id));
      for (let pass = 0; pass < 12; pass++) {
        for (let i = 0; i < n; i++) {
          const e = entities[i];
          if (i < movers) {
            e.prevPos.x = e.pos.x;
            e.prevPos.z = e.pos.z;
            e.prevRot = e.rot;
            e.pos.x += 0.25;
            e.pos.z += 0.1;
            e.rot += 0.01;
          }
          world.refreshVisibleEntity(slots[i], e, e.radius);
        }
      }
      return slots.map((slot) => ({
        x: world.x[slot],
        z: world.z[slot],
        rot: world.rot[slot],
        radius: world.radii[slot],
        flags: world.flags[slot],
        type: world.typeCodes[slot],
      }));
    }

    const a = run(false);
    const b = run(true);
    assert.deepEqual(b, a);
  });
});
