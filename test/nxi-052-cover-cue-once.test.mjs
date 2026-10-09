// NXI-052 — signal the covering commitment with one existing doctrine cue.
// One cover assignment gives one 'fighting_retreat' cue on the ward's objective — on the tick
// the commitment is created, not a cue every decision tick. A genuinely new commitment (a new
// ward after the first escaped) earns exactly one more cue. The cue rides the existing
// objective.cue contract; the ship decision path consumes the directives without re-emitting it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ShipUtilitySelector } from '../src/ai/shipDecision.js';
import { SquadCommander } from '../src/ai/squad.js';

const SEED = 4242;

const HAZARD = { id: 'rock', kind: ContactKind.HAZARD, alive: true, visible: true, pos: { x: -100, z: 0 } };
const HOSTILE = {
  id: 'player', kind: ContactKind.SHIP, alive: true, valid: true, visible: true, hostile: true,
  confidence: 1, threat: 1, pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
};
const ACTION_DEFS = [
  { id: 'action_burst', tags: ['attack'], preferredRange: 200, targetKinds: [ContactKind.SHIP] },
  { id: 'action_screen', tags: ['screen'], preferredRange: 120, targetKinds: [] },
  { id: 'action_retreat', tags: ['retreat'], preferredRange: 0, targetKinds: [] },
];

function makeCommander() {
  const commander = new SquadCommander({ seed: SEED });
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

function memberFrame(id, hull, { pos = { x: 0, z: 0 }, contacts = null } = {}) {
  return {
    self: {
      id, team: 1, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, rot: 0,
      hullFraction: hull, alive: true, disabled: false, capabilities: ['weapon'],
      occupantGeneration: 1,
    },
    contacts: contacts || [HOSTILE, HAZARD],
    events: [],
  };
}

function frames(entries) {
  const map = new Map();
  for (const [id, frame] of entries) map.set(id, frame);
  return map;
}

function cueCount(result) {
  let count = 0;
  for (const directive of result.directives.values()) {
    if (directive.objective && directive.objective.cue) count += 1;
  }
  return count;
}

function directiveFor(result, memberId) {
  const directive = result.directives.get(memberId);
  assert.ok(directive, `member ${memberId} has a directive`);
  return directive;
}

test('NXI-052: one cover assignment emits one fighting_retreat cue, not one per decision tick', () => {
  const commander = makeCommander();
  const selector = new ShipUtilitySelector();
  const perceptions = {
    a: memberFrame('a', 1),
    b: memberFrame('b', 0.2),
    c: memberFrame('c', 1),
  };

  let totalCues = 0;
  let cuedTick = -1;
  let cuedMemberId = null;
  for (let tick = 10; tick <= 49; tick++) {
    const result = commander.update('wing', tick, frames([
      ['a', perceptions.a],
      ['b', perceptions.b],
      ['c', perceptions.c],
    ]));
    const cuesThisTick = cueCount(result);
    totalCues += cuesThisTick;
    if (cuesThisTick > 0) {
      assert.equal(cuedTick, -1, `tick ${tick}: the commitment's cue fires only once`);
      cuedTick = tick;
      const ward = [...result.directives.values()].find((d) => d.objective.cue);
      cuedMemberId = ward.memberId;
      assert.equal(ward.objective.cue, 'fighting_retreat',
        'the existing doctrine cue signals the covered retreat');
      assert.equal(ward.objective.reason, 'wounded_corridor',
        'the cue rides the ward retreat objective, not a new channel');
    }
    assert.ok(cuesThisTick <= 1, `tick ${tick}: at most one cue per update`);

    // The covering ship screens; the ward retreats. Neither re-emits the commitment cue —
    // the ship decision path consumes the directives without duplicating it.
    const cover = [...result.directives.values()].find((d) => d.objective.reason === 'covering_withdrawal');
    assert.ok(cover, `tick ${tick}: the covering ship holds its assignment`);
    assert.equal(cover.objective.cue, undefined, `tick ${tick}: the coverer carries no cue`);
    const coverDecision = selector.select({
      tick, entityId: cover.memberId,
      perception: perceptions[cover.memberId],
      directive: cover, actionDefs: ACTION_DEFS,
    });
    assert.equal(coverDecision.actionId, 'action_screen');
    assert.equal(coverDecision.maneuver.kind, ManeuverKind.SCREEN);
    assert.equal(coverDecision.cue, undefined,
      `tick ${tick}: the ship decision does not re-emit the commitment cue`);

    const wardDirective = directiveFor(result, 'b');
    const wardDecision = selector.select({
      tick, entityId: 'b', perception: perceptions.b, directive: wardDirective, actionDefs: ACTION_DEFS,
    });
    assert.equal(wardDecision.actionId, 'action_retreat');
    assert.equal(wardDecision.maneuver.kind, ManeuverKind.RETREAT);
    assert.equal(wardDecision.maneuver.squadCorridor, true,
      `tick ${tick}: the ward still flies its squad corridor`);
  }

  assert.equal(totalCues, 1, 'one committed cover assignment emits exactly one cue over 40 ticks');
  assert.equal(cuedTick, 10, 'the single cue lands on the commitment tick');
  assert.equal(cuedMemberId, 'b');

  // The ward escapes; a different member goes wounded — that is a new commitment, and it earns
  // exactly one new cue, not a resumption of per-tick chatter.
  commander.update('wing', 50, frames([
    ['a', perceptions.a],
    ['b', memberFrame('b', 0.2, { pos: { x: 1200, z: 0 } })],
    ['c', perceptions.c],
  ]));
  const second = commander.update('wing', 51, frames([
    ['a', perceptions.a],
    ['b', memberFrame('b', 0.2, { pos: { x: 1200, z: 0 } })],
    ['c', memberFrame('c', 0.2)],
  ]));
  assert.equal(cueCount(second), 1, 'a new commitment announces once');
  const secondWard = [...second.directives.values()].find((d) => d.objective.cue);
  assert.equal(secondWard.memberId, 'c');
  const third = commander.update('wing', 52, frames([
    ['a', perceptions.a],
    ['b', memberFrame('b', 0.2, { pos: { x: 1200, z: 0 } })],
    ['c', memberFrame('c', 0.2)],
  ]));
  assert.equal(cueCount(third), 0, 'the second commitment does not repeat its cue');
});
