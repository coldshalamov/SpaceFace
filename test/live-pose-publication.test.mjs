import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/render/renderer.js';
import { createSnapshotFence, packPresentationWorldToFence } from '../src/render/snapshotFence.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import { createPresentationPublisher } from '../src/render/presentationPublisher.js';
import { createSimLaneJournal } from '../src/core/simLaneJournal.js';
import { notePacedFrameSpend } from '../src/render/decodeTaskBudget.js';

const DT = 1 / 60;

function fixture(count = 2, mode = 'flight') {
  const world = {
    capacity: count,
    alive: new Uint8Array(count).fill(1),
    activeSlots: Uint32Array.from({ length: count }, (_, i) => i),
    entityIds: Float64Array.from({ length: count }, (_, i) => i + 1),
    typeCodes: new Uint16Array(count).fill(1),
    x: new Float64Array(count).fill(10), y: new Float64Array(count), z: new Float64Array(count),
    rot: new Float64Array(count), flags: new Uint32Array(count),
    slotGenerations: new Uint32Array(count).fill(1),
    packDirty: new Uint8Array(count).fill(1),
    getDiagnostics: () => ({ active: count, allocations: count, retirements: 0 }),
  };
  const owner = Object.assign(Object.create(render), {
    state: { mode, simTime: DT, tick: 1, timeScale: 1, render: {}, world: { currentSectorId: 'test' } },
    _contextLost: true,
    _presentationWorld: world,
    _snapshotFence: createSnapshotFence({ capacity: count }),
    _presentationPublisher: { consume: (_frame, options) => {
      owner._lastPublicationAtomic = options?.atomic === true;
      return { applied: 1, rebuilt: false, appliedDelta: 0, spawnedCount: 0 };
    } },
    _notePicturePresent() {},
  });
  const present = sequence => owner.prepareFrame(0, DT, { completedTick: { sequence, tick: sequence, simTime: sequence * DT } });
  return { owner, world, present };
}

test('live completed poses publish even after background admission spends its frame budget', t => {
  t.mock.method(performance, 'now', () => 100);
  const { owner, present } = fixture();
  notePacedFrameSpend(100);
  present(1);
  const snapshot = owner._snapshotFence.latestSnapshot();
  assert.ok(snapshot, 'background work must not hold the live world pose');
  assert.equal(owner._lastPublicationAtomic, true, 'the source mirror must finish before packing a live tick');
  assert.equal(snapshot.simTime, DT);
  assert.equal(owner._snapshotSourceTick, 1);
  assert.deepEqual([snapshot.columns.position[0], snapshot.columns.position[3]], [10, 10]);
});

test('entering flight replaces a parked loading pack with one coherent completed-tick snapshot', t => {
  let clock = 1000;
  t.mock.method(performance, 'now', () => clock++);
  const { owner, world, present } = fixture(2048, 'loading');
  present(1);
  assert.ok(owner._fencePackPending, 'exercise a genuinely parked loading pack');
  world.x.fill(20); world.packDirty.fill(1);
  owner.state.mode = 'flight'; owner.state.simTime = 2 * DT; owner.state.tick = 2;
  present(2);
  const snapshot = owner._snapshotFence.latestSnapshot();
  assert.ok(snapshot, 'the first live present must finish its pose pack');
  assert.equal(snapshot.simTime, 2 * DT);
  assert.equal(owner._snapshotSourceTick, 2);
  for (let row = 0; row < snapshot.count; row++) assert.equal(snapshot.columns.position[row * 3], 20);
  assert.equal(owner._fencePackPending, null);
});

test('entering flight repacks a repaired loading fallback at the same completed sequence', t => {
  let clock = 1000;
  t.mock.method(performance, 'now', () => (clock += 5));
  const { owner, present } = fixture(600, 'loading');
  const rows = Array.from({ length: 600 }, (_, index) => ({
    id: index + 1, type: 'ship', alive: true,
    pos: { x: 10, y: 0, z: 0 }, prevPos: { x: 10, y: 0, z: 0 }, rot: 0,
  }));
  const world = createPresentationWorld();
  world.rebuildFromEntities(rows);
  owner._presentationWorld = world;
  owner.state.entityList = rows;
  owner.state.entities = new Map(rows.map(row => [row.id, row]));
  const journal = createSimLaneJournal();
  journal.requestRebuild();
  const publisher = createPresentationPublisher(world, owner.state, { journal });
  owner._presentationPublisher = publisher;
  packPresentationWorldToFence(world, owner._snapshotFence, DT, 0);
  owner._snapshotSourceTick = 1;
  for (const row of rows) row.pos.x = 20;
  publisher.consume({ journal, journalValid: false, completedTickCount: 1 });
  owner.state.mode = 'flight';
  present(1);
  const snapshot = owner._snapshotFence.latestSnapshot();
  assert.equal(snapshot.count, rows.length);
  for (let row = 0; row < snapshot.count; row++) assert.equal(snapshot.columns.position[row * 3], 20);
});
