// NXI-051 — release the covering assignment when its ward escapes.
// Once the ward's escape is accepted (it outran the threat, reached the corridor, or left the
// picture) the covering ship returns to a live plan and stays there — it is not re-drafted
// every other tick to guard a withdrawal that already succeeded. The coverer is never despawned.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { SquadCommander } from '../src/ai/squad.js';

const SEED = 4242;

function makeCommander() {
  const commander = new SquadCommander({ seed: SEED, config: { freezeResults: false } });
  commander.registerSquad({
    id: 'wing',
    members: [
      { id: 'a', capabilities: ['weapon'] },
      { id: 'b', preferredRole: 'striker', capabilities: ['weapon'] },
      { id: 'c', capabilities: ['weapon'] },
    ],
  });
  return commander;
}

const HAZARD = { id: 'rock', kind: ContactKind.HAZARD, alive: true, visible: true, pos: { x: -100, z: 0 } };

function hostileAt(x, z = 0) {
  return {
    id: 'player', kind: ContactKind.SHIP, alive: true, valid: true, visible: true, hostile: true,
    confidence: 1, threat: 1, pos: { x, z }, vel: { x: 0, z: 0 }, team: 0,
  };
}

function memberFrame(id, hull, { pos = { x: 0, z: 0 }, contacts = null } = {}) {
  return {
    self: {
      id, team: 1, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, rot: 0,
      hullFraction: hull, alive: true, disabled: false, capabilities: ['weapon'],
      occupantGeneration: 1,
    },
    contacts: contacts || [hostileAt(200), HAZARD],
    events: [],
  };
}

function frames(entries) {
  const map = new Map();
  for (const [id, frame] of entries) map.set(id, frame);
  return map;
}

function directiveFor(result, memberId) {
  const directive = result.directives.get(memberId);
  assert.ok(directive, `member ${memberId} still receives a directive`);
  return directive;
}

function reasonsOf(result) {
  return [...result.directives.values()].map((directive) => directive.objective.reason);
}

function covererOf(result) {
  const cover = [...result.directives.values()].find((d) => d.objective.reason === 'covering_withdrawal');
  return cover || null;
}

function isLivePlan(objective) {
  // Any objective the live tactic produces except the covering-withdrawal screen.
  return objective && objective.reason !== 'covering_withdrawal';
}

test('NXI-051: an outrun ward releases the covering ship to a live plan that sticks', () => {
  const commander = makeCommander();
  const committed = commander.update('wing', 10, frames([
    ['a', memberFrame('a', 1)],
    ['b', memberFrame('b', 0.2)],
    ['c', memberFrame('c', 1)],
  ]));
  assert.equal(directiveFor(committed, 'b').objective.reason, 'wounded_corridor');
  const coverer = covererOf(committed);
  assert.ok(coverer, 'a single covering ship is assigned');
  assert.equal(coverer.objective.kind, ObjectiveKind.SCREEN);
  const covererId = coverer.memberId;

  // The ward is still mid-run: cover persists.
  const mid = commander.update('wing', 11, frames([
    ['a', memberFrame('a', 1)],
    ['b', memberFrame('b', 0.2, { pos: { x: -80, z: 0 } })],
    ['c', memberFrame('c', 1)],
  ]));
  assert.ok(covererOf(mid), 'cover holds while the ward is still running the corridor');

  // Accepted escape: the ward put real distance on the threat (>= 720 WU from focus).
  const escaped = commander.update('wing', 12, frames([
    ['a', memberFrame('a', 1)],
    ['b', memberFrame('b', 0.2, { pos: { x: 1200, z: 0 } })],
    ['c', memberFrame('c', 1)],
  ]));
  assert.equal(reasonsOf(escaped).includes('covering_withdrawal'), false,
    'the accepted escape releases the cover role immediately');
  assert.equal(reasonsOf(escaped).includes('wounded_corridor'), false);
  assert.ok(isLivePlan(directiveFor(escaped, covererId).objective),
    'the released coverer is on a live plan, not an empty coordinate');

  // The ward stays escaped for a stretch: the release must stick — no every-other-tick
  // re-draft onto the same finished withdrawal.
  for (let tick = 13; tick <= 20; tick++) {
    const next = commander.update('wing', tick, frames([
      ['a', memberFrame('a', 1)],
      ['b', memberFrame('b', 0.2, { pos: { x: 1200 + tick, z: 0 } })],
      ['c', memberFrame('c', 1)],
    ]));
    assert.equal(reasonsOf(next).includes('covering_withdrawal'), false,
      `tick ${tick}: the released cover stays released while the ward remains clear`);
    assert.equal(reasonsOf(next).includes('wounded_corridor'), false,
      `tick ${tick}: the escaped ward is not re-anchored to a corridor behind it`);
    assert.ok(isLivePlan(directiveFor(next, covererId).objective),
      `tick ${tick}: the released coverer keeps a live plan`);
  }

  // Neighboring success: a different member going wounded still earns a fresh cover.
  const fresh = commander.update('wing', 21, frames([
    ['a', memberFrame('a', 1)],
    ['b', memberFrame('b', 0.2, { pos: { x: 1300, z: 0 } })],
    ['c', memberFrame('c', 0.2)],
  ]));
  const freshCover = covererOf(fresh);
  assert.ok(freshCover, 'a new wounded member still gets a covering ship');
  assert.notEqual(freshCover.memberId, 'c');
  assert.equal(directiveFor(fresh, 'c').objective.reason, 'wounded_corridor');
});

test('NXI-051: a ward that left the picture releases cover and stays released', () => {
  const commander = makeCommander();
  const committed = commander.update('wing', 10, frames([
    ['a', memberFrame('a', 1)],
    ['b', memberFrame('b', 0.2)],
    ['c', memberFrame('c', 1)],
  ]));
  const coverer = covererOf(committed);
  assert.ok(coverer);
  const covererId = coverer.memberId;

  // Departure: the ward's frame is gone — it made it out (or was removed); no despawn of anyone else.
  for (let tick = 11; tick <= 16; tick++) {
    const next = commander.update('wing', tick, frames([
      ['a', memberFrame('a', 1)],
      ['c', memberFrame('c', 1)],
    ]));
    assert.equal(reasonsOf(next).includes('covering_withdrawal'), false,
      `tick ${tick}: departure releases the cover`);
    assert.ok(isLivePlan(directiveFor(next, covererId).objective),
      `tick ${tick}: the released coverer is on a live plan`);
    assert.equal(next.directives.size, 3, 'the released coverer is never despawned');
  }
});

test('NXI-051: reaching the corridor releases cover; a ward back inside the fight re-arms it', () => {
  const commander = makeCommander();
  const committed = commander.update('wing', 10, frames([
    ['a', memberFrame('a', 1)],
    ['b', memberFrame('b', 0.2)],
    ['c', memberFrame('c', 1)],
  ]));
  const corridor = directiveFor(committed, 'b').objective.flightPoint;
  assert.ok(corridor);
  const covererId = covererOf(committed).memberId;

  // The ward arrives on the corridor point: the accepted escape fires.
  const arrived = commander.update('wing', 11, frames([
    ['a', memberFrame('a', 1)],
    ['b', memberFrame('b', 0.2, { pos: { x: corridor.x, z: corridor.z } })],
    ['c', memberFrame('c', 1)],
  ]));
  assert.equal(reasonsOf(arrived).includes('covering_withdrawal'), false,
    'reaching the corridor releases the cover role');
  assert.ok(isLivePlan(directiveFor(arrived, covererId).objective));

  // While the ward sits on its corridor, the release sticks.
  for (let tick = 12; tick <= 15; tick++) {
    const next = commander.update('wing', tick, frames([
      ['a', memberFrame('a', 1)],
      ['b', memberFrame('b', 0.2, { pos: { x: corridor.x, z: corridor.z } })],
      ['c', memberFrame('c', 1)],
    ]));
    assert.equal(reasonsOf(next).includes('covering_withdrawal'), false,
      `tick ${tick}: an arrived ward does not re-draft its cover`);
  }

  // The ward left its corridor and is back inside the threat's reach — a fresh emergency, not
  // the old withdrawal: the release clears and the ward earns a new corridor + cover.
  const chased = commander.update('wing', 20, frames([
    ['a', memberFrame('a', 1)],
    ['b', memberFrame('b', 0.2, { pos: { x: corridor.x + 140, z: 0 } })],
    ['c', memberFrame('c', 1)],
  ]));
  assert.equal(reasonsOf(chased).includes('wounded_corridor'), true,
    'a ward back inside the fight becomes a live ward again');
  assert.ok(covererOf(chased), 'a fresh covering ship answers the new withdrawal');
});
