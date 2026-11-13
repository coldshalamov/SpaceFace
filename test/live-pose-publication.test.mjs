import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/render/renderer.js';
import { createSnapshotFence, packPresentationWorldToFence } from '../src/render/snapshotFence.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import { createPresentationPublisher } from '../src/render/presentationPublisher.js';
import { createPresentationJournal } from '../src/core/presentationJournal.js';
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

function rebuildFlightFixture() {
  const { owner } = fixture();
  const player = {
    id: 1, type: 'ship', isPlayer: true, alive: true, occupantGeneration: 9,
    pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0 }, rot: 0,
  };
  const npc = { ...player, id: 2, isPlayer: false, occupantGeneration: 10,
    pos: { x: 30, y: 0, z: 0 }, prevPos: { x: 30, y: 0, z: 0 } };
  const state = owner.state;
  state.playerId = player.id;
  state.entities = new Map([[player.id, player], [npc.id, npc]]);
  state.entityList = [player, npc];
  owner._frameMembrane = { origin: { x: 0, z: 0 } };
  owner._presentationFrameDt = DT;
  const world = owner._presentationWorld = createPresentationWorld();
  const fence = owner._snapshotFence;
  const journal = createSimLaneJournal();
  const source = createPresentationJournal(1024);
  const publisher = createPresentationPublisher(world, state, { journal });
  let publication;
  owner._presentationPublisher = {
    ...publisher,
    consume(frame, options) {
      publication = publisher.consume(frame, options);
      return publication;
    },
  };
  const mesh = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, userData: {} };
  function draw() {
    const alpha = fence.samplePresentationAlpha(DT, 0, DT, 1);
    owner._snapshotPresentationAlpha = alpha;
    owner._snapshotPresentationSequence = fence.sequence;
    assert.equal(owner._applyPresentationPose(world.getSlotForEntityId(1), mesh, alpha), true);
    return { time: fence.presentedTimeS, raw: fence.presentedPose(1).x, drawn: mesh.position.x };
  }
  function publish(tick, { rebuild = false, lifecycleGeneration = 0 } = {}) {
    state.tick = tick;
    state.simTime = tick * DT;
    const completedTick = { sequence: tick, tick, simTime: state.simTime };
    const start = source.getWriteSequence();
    if (rebuild) source.rebuildFrom(state.entityList, tick);
    else source.recordTransform(tick, player);
    const end = source.getWriteSequence();
    source.markTransferredThrough(end);
    const scalars = new Float64Array((end - start) * 18);
    let index = 0;
    source.visitRange(start, end, {}, record => {
      scalars.set([
        record.tick, record.sequence, record.entityId, record.generation, record.revision,
        record.x, record.y, record.z, record.prevX, record.prevY, record.prevZ,
        record.rot, record.bank, record.pitch, record.prevRot, record.prevBank, record.prevPitch,
        record.visualRevision,
      ], index++ * 18);
    });
    const pack = { start, end, count: end - start, scalars, typeTable: ['ship'],
      kinds: new Uint8Array(end - start).fill(rebuild ? 1 : 3), typeIndex: new Uint16Array(end - start) };
    if (rebuild) assert.equal(journal.applyRebuildPack({ start, end, pack }), true);
    else assert.equal(journal.applyPack(pack), true);
    owner.prepareFrame(0, DT, {
      journal, journalStart: start, journalEnd: end, journalValid: true,
      journalFullRebuild: rebuild, journalRebuildGeneration: journal.getRebuildGeneration(),
      completedTick, lifecycleGeneration,
    });
    return publication;
  }

  for (let tick = 1; tick <= 120; tick++) {
    player.prevPos.x = player.pos.x;
    player.pos.x = tick * DT * 390;
    publish(tick, { rebuild: tick === 1 });
    draw();
  }
  let before;
  for (let frame = 0; frame < 60; frame++) before = draw();
  assert.ok(before.drawn > player.pos.x + 45, 'stall must reach real forward extrapolation');
  return { owner, state, player, npc, world, fence, publish, draw, before };
}

test('a stalled same-life worker rebuild keeps the drawn player ahead of the recovering tick', () => {
  const { state, player, npc, world, fence, publish, draw, before } = rebuildFlightFixture();
  const playerHandle = world.handleForEntityId(player.id);
  const npcHandle = world.handleForEntityId(npc.id);
  const epoch = fence.newestSnapshot().poseEpoch;
  const replacement = { ...npc, occupantGeneration: 11, pos: { x: -220, y: 0, z: 0 } };
  state.entityList[1] = replacement;
  state.entities.set(npc.id, replacement);
  player.prevPos.x = player.pos.x;
  player.pos.x += 390 * DT;
  const publication = publish(121, { rebuild: true });
  const after = draw();
  assert.equal(publication.retainedPlayerPose, true);
  assert.equal(fence.newestSnapshot().poseEpoch, epoch);
  assert.equal(world.handleForEntityId(player.id).generation, playerHandle.generation);
  assert.notEqual(world.handleForEntityId(player.id).sourceGeneration, playerHandle.sourceGeneration);
  const newest = fence.newestSnapshot();
  const playerRow = newest.indexByEntityId.get(player.id);
  assert.equal(newest.columns.position[playerRow * 3], player.pos.x, 'the rebuilt SPAWN supplies the new pose');
  assert.ok(after.time >= before.time);
  assert.ok(after.raw >= before.raw);
  assert.ok(after.drawn >= before.drawn);
  assert.notEqual(world.handleForEntityId(npc.id).generation, npcHandle.generation);
  assert.equal(fence.presentedPose(npc.id).x, -220, 'the recycled NPC never blends against its old life');
});

test('a reused player ID or hard lifecycle boundary reseats even during an extrapolation hold', () => {
  for (const boundary of ['player life', 'sector', 'restore', 'explicit epoch']) {
    const { owner, state, player, world, fence, publish, draw } = rebuildFlightFixture();
    const epoch = fence.newestSnapshot().poseEpoch;
    const playerHandle = world.handleForEntityId(player.id);
    if (boundary === 'player life') player.occupantGeneration++;
    if (boundary === 'sector') state.world.currentSectorId = 'another-sector';
    if (boundary === 'explicit epoch') owner._posePackEpoch++;
    player.pos.x = 806;
    const publication = publish(121, { rebuild: true, lifecycleGeneration: boundary === 'restore' ? 1 : 0 });
    assert.equal(publication.retainedPlayerPose, false, boundary);
    assert.ok(fence.newestSnapshot().poseEpoch > epoch, boundary);
    assert.notEqual(world.handleForEntityId(player.id).generation, playerHandle.generation, boundary);
    const after = draw();
    assert.deepEqual([after.raw, after.drawn], [806, 806], boundary);
  }
});
