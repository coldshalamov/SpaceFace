// A pinned COMMANDER is not a leader (seed: "formations that break when their leader is pinned").
// Shoot a squad leader's helm off and the wing used to hold parade formation around a live-but-
// helpless commander; now the wing sags (wider slots, leaderless integrity, the hull reads
// disrupted) and, past a grace window, command passes to the first unpinned socket. Driven
// through the real SquadFrameDirector with a pinned lookup, exactly as tacticalAI supplies it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SquadFrameDirector } from '../src/ai/squadFrame.js';
import { SQUAD_RECIPE_INTERCEPTOR_SCISSORS } from '../src/data/squadChoreography.js';

const RECIPE = SQUAD_RECIPE_INTERCEPTOR_SCISSORS;

function member(id, socket) {
  return {
    id, alive: true, type: 'ship',
    pos: { x: 100 + Math.random() * 4, z: 100 },
    vel: { x: 20, z: 0 }, rot: 0, radius: 8, hull: 100, hullMax: 100,
    data: { ai: { squadSocket: socket } },
  };
}

function squad() {
  return {
    id: 'sq-pin', recipeId: RECIPE,
    members: [member('m-lead', 'lead'), member('m-left', 'left'), member('m-right', 'right')],
    targetId: null,
  };
}

function settle(director, pinnedIds = new Set(), ticks = 30) {
  const sq = squad();
  const pinnedOf = (e) => pinnedIds.has(e.id);
  for (let t = 0; t <= ticks; t++) director.stepAll(t, 1 / 60, [sq], () => null, pinnedOf);
  return { sq, snapshot: director.inspect('sq-pin') };
}

test('a live but pinned commander reads as a hole: the wing sags and the pin is visible', () => {
  const director = new SquadFrameDirector({ seed: 4242 });
  const base = settle(director, new Set(), 30).snapshot;
  assert.equal(base.leaderPinned, false);
  const fresh = new SquadFrameDirector({ seed: 4242 });
  const { snapshot } = settle(fresh, new Set(['m-lead']), 30);
  assert.equal(snapshot.leaderPinned, true, 'the pin is stamped on the frame');
  assert.ok(snapshot.integrity < base.integrity - 0.2,
    `leaderless integrity around a pinned commander: ${snapshot.integrity} < ${base.integrity}`);
  const lead = snapshot.members['m-lead'];
  assert.equal(lead.disrupted, true, 'the pinned hull itself reads disrupted');
});

test('a pinned commander cannot hold command: succession after the grace window', () => {
  const director = new SquadFrameDirector({ seed: 4242 });
  const early = settle(director, new Set(['m-lead']), 30).snapshot;
  assert.equal(early.commandId, 'm-lead', 'within the window the pinned commander keeps command');
  const late = settle(director, new Set(['m-lead']), 150).snapshot;
  assert.notEqual(late.commandId, 'm-lead', 'past the window command passes');
  const relief = late.members[late.commandId];
  assert.ok(relief && relief.alive !== false, 'the relief is a live wing');
  assert.equal(late.leaderPinned, true, 'the pin holds while the hull is still helpless');
});

test('recovery hands the wing back: an unpinned commander clears the window', () => {
  const director = new SquadFrameDirector({ seed: 4242 });
  const pinned = new Set(['m-lead']);
  const sq = squad();
  for (let t = 0; t <= 150; t++) director.stepAll(t, 1 / 60, [sq], () => null, (e) => pinned.has(e.id));
  pinned.delete('m-lead');
  for (let t = 151; t <= 160; t++) director.stepAll(t, 1 / 60, [sq], () => null, (e) => pinned.has(e.id));
  const snapshot = director.inspect('sq-pin');
  assert.equal(snapshot.leaderPinned, false, 'the window clears on recovery');
});

test('without a pinned lookup the formation behaves exactly as before', () => {
  const director = new SquadFrameDirector({ seed: 4242 });
  const sq = squad();
  for (let t = 0; t <= 40; t++) director.stepAll(t, 1 / 60, [sq], () => null);
  const snapshot = director.inspect('sq-pin');
  assert.equal(snapshot.leaderPinned, false);
  assert.equal(snapshot.commandId, 'm-lead');
});
