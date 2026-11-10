// Pose-handoff freeze — invalid-journal fallback must keep making progress when the
// shared paced-frame wallet is already spent.
//
// During a rebuild window (worker journalRebuild wait, retained-range failure,
// journalValid === false) the non-atomic consume walks fallbackFromState: a chunked
// entity collect feeds a stepped diff-apply into PresentationWorld. Both drives used
// to consult pacedFrameSpend() BEFORE stepping — a frame whose 4 ms wallet was already
// spent by an earlier paced lane (parse/compile/residency drains all debit it) made
// ZERO fallback progress per consume, and repeated that for as long as the window and
// the storm lasted: world poses frozen while renderer, HUD, and cosmetics advance.
// The renderer's own parked legs step >=1 first for exactly this reason.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createPresentationJournal } from '../src/core/presentationJournal.js';
import { createSimLaneJournal } from '../src/core/simLaneJournal.js';
import { createPresentationPublisher } from '../src/render/presentationPublisher.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import {
  notePacedFrameSpend,
  PACED_FRAME_BUDGET_MS,
} from '../src/render/decodeTaskBudget.js';

const COUNT = 64;
// Bounded liveness: >=1 iterator step per consume per parked leg means the collect
// (one yield per entity) plus the apply (256-row slices) finish in roughly
// COUNT + COUNT / 256 consumes. Generous slack for leg interleaving; a zero-step
// leg never finishes at all.
const MAX_PRESENTS = COUNT * 8;

function fixture() {
  const rows = Array.from({ length: COUNT }, (_, index) => ({
    id: index + 1, type: 'ship', alive: true,
    pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0 },
    rot: 0, radius: 1,
  }));
  const state = {
    // 'loading' keeps consume on the paced non-atomic path the invalidation window
    // actually exercises; 'flight' consumes atomically and bypasses these legs.
    mode: 'loading', tick: 2, simTime: 2,
    entities: new Map(rows.map((row) => [row.id, row])), entityList: rows, world: {},
  };
  const world = createPresentationWorld();
  world.rebuildFromEntities(rows);
  return { state, world, rows };
}

function invalidJournalFrame(journal, completedTickCount) {
  return {
    journal, journalStart: 0, journalEnd: journal.getWriteSequence?.() || 0,
    journalValid: false, completedTickCount, lifecycleGeneration: 0,
  };
}

// Saturate the shared wallet exactly the way a co-present paced lane does: a real
// debit in the same frame window before consume reads it.
function spendFrameBudget() {
  notePacedFrameSpend(PACED_FRAME_BUDGET_MS);
}

function worldX(world, entityId) {
  const slot = world.getSlotForEntityId(entityId);
  return slot >= 0 ? world.x[slot] : null;
}

test('invalid-journal fallback mirrors live state when the wallet has room', () => {
  const { state, world, rows } = fixture();
  const journal = createSimLaneJournal();
  journal.requestRebuild(); // the retained-range/worker invalidation window
  const publisher = createPresentationPublisher(world, state, { journal });

  for (const row of rows) row.pos.x = 42;
  let rebuilt = false;
  for (let i = 0; i < MAX_PRESENTS && !rebuilt; i++) {
    rebuilt = publisher.consume(invalidJournalFrame(journal, i + 1)).rebuilt === true;
  }
  assert.equal(rebuilt, true, 'an unstalled fallback completes its diff-apply');
  assert.ok(publisher.getDiagnostics().fallbackRebuilds >= 1);
  assert.equal(worldX(world, rows[0].id), 42, 'the fallback mirror tracks live poses');
});

test('invalid-journal fallback cannot starve on a spent shared paced wallet', () => {
  const { state, world, rows } = fixture();
  const journal = createSimLaneJournal();
  journal.requestRebuild();
  const publisher = createPresentationPublisher(world, state, { journal });

  // Sim keeps completing ticks and moving the world; presentation keeps presenting.
  // Every consume this window lands on a wallet another paced lane already emptied.
  for (const row of rows) row.pos.x = 42;
  let rebuilt = false;
  for (let i = 0; i < MAX_PRESENTS && !rebuilt; i++) {
    spendFrameBudget();
    for (const row of rows) row.pos.x += 1; // the breakup keeps drifting
    rebuilt = publisher.consume(invalidJournalFrame(journal, i + 1)).rebuilt === true;
  }
  assert.equal(rebuilt, true,
    'the fallback must advance its parked legs even on a spent wallet — a frozen '
    + 'mirror is the recorded translation freeze');
  assert.ok(publisher.getDiagnostics().fallbackRebuilds >= 1);
  assert.ok(worldX(world, rows[0].id) > 0,
    'the world mirror must reach live poses, not hold the pre-invalidation frame');
});

test('flight atomic invalid-journal recovery keeps player/held-target/fragment poses current through churn', () => {
  const { state, world, rows } = fixture();
  state.mode = 'flight';
  const journal = createSimLaneJournal();
  const publisher = createPresentationPublisher(world, state, { journal });
  const player = rows[0];
  const heldTarget = rows[1];
  let nextId = COUNT + 1;
  let completedTicks = 0;

  const workerPack = () => {
    // The worker's authoritative rebuild reply, shape-for-shape as production
    // ships it (presentation-publication-atomic.test.mjs builds the same pack).
    const live = state.entityList.filter((row) => row && row.alive !== false);
    const source = createPresentationJournal(2048);
    source.rebuildFrom(live, 2);
    const start = source.getLastRebuildStart();
    const end = source.getLastRebuildEnd();
    const scalars = new Float64Array((end - start) * 18);
    let index = 0;
    source.visitRange(start, end, {}, (record) => {
      scalars.set([
        record.tick, record.sequence, record.entityId, record.generation, record.revision,
        record.x, record.y, record.z, record.prevX, record.prevY, record.prevZ,
        record.rot, record.bank, record.pitch, record.prevRot, record.prevBank,
        record.prevPitch, record.visualRevision,
      ], index++ * 18);
    });
    journal.applyRebuildPack({ start, end, pack: {
      start, end, count: end - start, scalars,
      kinds: new Uint8Array(end - start).fill(1), typeIndex: new Uint16Array(end - start), typeTable: ['ship'],
    } });
    return { start, end };
  };

  for (let cycle = 0; cycle < 3; cycle++) {
    // Sim still advances: poses drift, a fragment dies, a fresh fragment spawns —
    // the breakup churn the invalidation window has to survive.
    for (const row of state.entityList) { row.pos.x += 3; row.pos.z += 1; }
    const dead = state.entityList.pop();
    dead.alive = false;
    state.entities.delete(dead.id);
    const fragment = {
      id: nextId++, type: 'ship', alive: true,
      pos: { x: 900 + cycle, y: 0, z: 5 }, prevPos: { x: 0, y: 0, z: 0 },
      rot: 0, radius: 1,
    };
    state.entityList.push(fragment);
    state.entities.set(fragment.id, fragment);

    // Invalidated window: journal awaiting the worker rebuild pack. Flight
    // consume is atomic — the spent wallet must not matter and the fallback
    // must land one complete current-state mirror this same present.
    journal.requestRebuild();
    spendFrameBudget();
    const fallback = publisher.consume({
      journal, journalStart: 0, journalEnd: 0, journalValid: false,
      completedTickCount: ++completedTicks, lifecycleGeneration: 0,
    }, { atomic: true });
    assert.equal(fallback.fallback, true);
    assert.equal(fallback.refreshed, true);
    assert.equal(worldX(world, player.id), player.pos.x,
      'player pose holds current state through the invalid window');
    assert.equal(worldX(world, heldTarget.id), heldTarget.pos.x,
      'held-target pose holds current state through the invalid window');
    const fragSlot = world.getSlotForEntityId(fragment.id);
    assert.ok(fragSlot >= 0, 'freshly spawned fragment enters the mirror mid-window');
    assert.equal(world.x[fragSlot], fragment.pos.x);
    assert.equal(world.getSlotForEntityId(dead.id), -1,
      'the dead fragment retires instead of drawing its last pose');

    // The rebuild reply lands: journalFullRebuild path consumes the retained
    // range atomically, still on the spent wallet.
    const { start, end } = workerPack();
    spendFrameBudget();
    const rebuilt = publisher.consume({
      journal, journalStart: start, journalEnd: end, journalFullRebuild: true,
      journalRebuildGeneration: journal.getRebuildGeneration(), journalValid: true,
      completedTickCount: ++completedTicks, lifecycleGeneration: 0,
    }, { atomic: true });
    assert.equal(rebuilt.valid, true);
    assert.equal(journal.needsRebuild(), false);
    assert.equal(worldX(world, player.id), player.pos.x);
    assert.equal(worldX(world, heldTarget.id), heldTarget.pos.x);
    assert.equal(worldX(world, fragment.id), fragment.pos.x);
  }
});

test('a valid journal range still applies on a spent wallet', () => {
  const { state, world, rows } = fixture();
  const journal = createPresentationJournal(2048);
  world.clear();
  for (const row of rows) journal.recordSpawn(1, row);
  const publisher = createPresentationPublisher(world, state, { journal });
  const frame = {
    journal, journalStart: 0, journalEnd: journal.getWriteSequence(),
    journalValid: true,
  };
  spendFrameBudget();
  publisher.consume(frame);
  while (publisher.getLastAppliedSequence() < frame.journalEnd) {
    spendFrameBudget();
    publisher.consume(frame);
  }
  journal.discardThrough(frame.journalEnd);
  frame.journalStart = frame.journalEnd;
  for (const row of rows) {
    row.pos.x = 20;
    journal.recordTransform(2, row);
  }
  frame.journalEnd = journal.getWriteSequence();
  spendFrameBudget();
  const publication = publisher.consume(frame);
  assert.equal(publication.fallback, false,
    'the normal transform range stays on its journal path even mid-storm');
  assert.equal(publication.applied, COUNT);
  assert.equal(worldX(world, rows[0].id), 20);
});
