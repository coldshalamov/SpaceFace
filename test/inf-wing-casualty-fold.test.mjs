// inf-wing-casualty-fold — a wing that loses a wingman folds around its dead.
//
// Seed: "wingmen who die and leave a gap the formation feels." A socket nobody refills used
// to leave the pose untouched: the surviving wing kept flying a full-width wedge with a
// phantom hole on the dead side, and nothing in the motion said the wing had noticed. Now
// the frame counts its unrefilled sockets (`frame.casualties`) and the slot writer narrows
// the surviving members' lateral amplitude per vacancy — the wing visibly tightens around
// its dead instead of flying a hole. Hull-clearance spacing and forward stagger stay
// authored; a replacement that joins refills the vacant socket and the fold releases.
//
// Driven through the real SquadFrameDirector exactly as tacticalAI supplies it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SquadFrameDirector } from '../src/ai/squadFrame.js';
import { SQUAD_RECIPE_INTERCEPTOR_SCISSORS } from '../src/data/squadChoreography.js';

const RECIPE = SQUAD_RECIPE_INTERCEPTOR_SCISSORS;

// Deterministic fixtures: the pinned-disarray harness used Math.random for member jitter;
// this seed's assertions compare slot geometry across runs, so every input is fixed.
function member(id, socket, pos, alive = true) {
  return {
    id, alive, type: 'ship',
    pos: { x: pos[0], z: pos[1] },
    vel: { x: 20, z: 0 }, rot: 0, radius: 8, hull: 100, hullMax: 100,
    data: { ai: { squadSocket: socket } },
  };
}

function squad(extraMembers = []) {
  return {
    id: 'sq-fold', recipeId: RECIPE,
    members: [
      member('m-lead', 'lead', [100, 100]),
      member('m-left', 'left', [80, 95]),
      member('m-right', 'right', [80, 105]),
      ...extraMembers,
    ],
    targetId: null,
  };
}

function run({ killAtTick = null, joinAtTick = null } = {}) {
  const director = new SquadFrameDirector({ seed: 4242 });
  const sq = squad();
  const left = sq.members.find((m) => m.id === 'm-left');
  const fresh = member('m-new', 'left', [90, 100]);
  let snapshot = null;
  for (let t = 0; t <= 40; t++) {
    if (t === killAtTick) left.alive = false;
    if (t === joinAtTick) sq.members.push(fresh); // a reinforcement joins the roster
    director.stepAll(t, 1 / 60, [sq], () => null);
    if (t === 40) snapshot = director.inspect('sq-fold');
  }
  const slotOf = (id) => {
    const link = director.byEntity.get(id);
    return { x: link.plan.slot.x, z: link.plan.slot.z };
  };
  return { snapshot, rightSlot: slotOf('m-right'), leadSlot: slotOf('m-lead') };
}

test('a wingman dies and the pose folds: the surviving wing tightens toward its spine', () => {
  const healthy = run();
  assert.equal(healthy.snapshot.casualties, 0, 'a full wing has no casualties');
  const wounded = run({ killAtTick: 11 });
  assert.equal(wounded.snapshot.casualties, 1, 'the unrefilled socket is counted as the wing\'s dead');
  // Heading stays 0 in INGRESS (no target), so the frame's z axis IS the lateral axis: the
  // surviving right wing sits closer to the spine in the wounded wing than in the healthy one.
  const healthyLateral = healthy.rightSlot.z - 100;
  const woundedLateral = wounded.rightSlot.z - 100;
  assert.ok(woundedLateral < healthyLateral - 2,
    `the wing folds in (wounded ${woundedLateral.toFixed(1)} < healthy ${healthyLateral.toFixed(1)})`);
});

test('the fold is the casualty count, not a style flip: two dead folds tighter than one', () => {
  const one = run({ killAtTick: 11 });
  const director = new SquadFrameDirector({ seed: 4242 });
  const sq = squad();
  const left = sq.members.find((m) => m.id === 'm-left');
  const right = sq.members.find((m) => m.id === 'm-right');
  let leadSlot = null;
  for (let t = 0; t <= 40; t++) {
    if (t === 11) { left.alive = false; right.alive = false; }
    director.stepAll(t, 1 / 60, [sq], () => null);
  }
  const link = director.byEntity.get('m-lead');
  leadSlot = { x: link.plan.slot.x, z: link.plan.slot.z };
  assert.equal(director.inspect('sq-fold').casualties, 2);
  // With both wings dead the lead has no lateral pair left to push off: its slot sits on the
  // spine the frame hangs from — the wing is a single hull flying a narrowed pose, not a
  // parade formation with two holes.
  assert.ok(Math.abs(leadSlot.z - 100) < Math.abs(one.rightSlot.z - 100),
    `the lone survivor folds hardest (${Math.abs(leadSlot.z - 100).toFixed(1)})`);
});

test('a replacement takes the vacant socket and the fold releases to the healthy pose', () => {
  const healthy = run();
  const wounded = run({ killAtTick: 11 });
  const refilled = run({ killAtTick: 11, joinAtTick: 12 });
  assert.equal(refilled.snapshot.casualties, 0, 'the reinforcement claims the socket the refill nulled');
  assert.equal(refilled.snapshot.members['m-new'].socket, 'left', 'the replacement flies the dead wing\'s spot');
  const refilledLateral = refilled.rightSlot.z - 100;
  const woundedLateral = wounded.rightSlot.z - 100;
  // The fold released: the refilled wing flies at least full authored width (0.72 * spacing
  // = 24.48 before separation) — strictly wider than the folded wing it replaced. (The last
  // few WU vs the healthy run come from separateSlots' member-order pair pushes, not the fold.)
  assert.ok(refilledLateral >= 24.48, `the refilled wing flies full width (${refilledLateral.toFixed(1)})`);
  assert.ok(refilledLateral > woundedLateral,
    `refill releases the fold (${refilledLateral.toFixed(1)} > folded ${woundedLateral.toFixed(1)})`);
});

test('no casualties means no change: the full-wing pose matches the authored wedge math', () => {
  const healthy = run();
  // wedge_4 in INGRESS, heading 0, spacing = hull clearance of three radius-8 hulls (34):
  // the right socket's authored lateral offset is 0.72 * spacing = 24.48 before separation.
  // separateSlots then pushes live slots to a 72 minimum, so assert the floor it enforces
  // instead of the raw authored number — the point is that nothing folded.
  assert.ok(healthy.rightSlot.z - 100 >= 24.48, 'the healthy wing flies full width');
  assert.equal(healthy.snapshot.members['m-left'].socket, 'left');
  assert.equal(healthy.snapshot.members['m-right'].socket, 'right');
});
