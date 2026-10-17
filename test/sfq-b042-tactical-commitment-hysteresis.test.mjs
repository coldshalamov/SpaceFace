import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind } from '../src/ai/contracts.js';
import { SquadCommander } from '../src/ai/squad.js';

function makePerception(memberId, pos, contacts, tick) {
  return {
    tick,
    self: {
      id: memberId,
      team: 1,
      alive: true,
      pos,
      vel: { x: 0, z: 0 },
      rot: 0,
      hullFraction: 1,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
      factionBehavior: null,
    },
    contacts,
    events: [],
  };
}

test('SFQ-B042: squad focus and member target assignments resist 6-tick distance/threat oscillation over 3,600 ticks', () => {
  const commander = new SquadCommander({ seed: 4242 });
  const memberIds = [11, 12, 13];
  commander.registerSquad({
    id: 'wing_commitment_4242',
    doctrine: 'scavenger',
    faction: 'pirates',
    members: [
      { id: 11, preferredRole: 'leader', capabilities: ['drive', 'sensor', 'weapon'] },
      { id: 12, preferredRole: 'striker', capabilities: ['drive', 'sensor', 'weapon'] },
      { id: 13, preferredRole: 'support', capabilities: ['drive', 'sensor', 'weapon', 'ranged'] },
    ],
  });

  const windowTicks = 600; // 10s @ 60 Hz
  const totalTicks = 3600; // 60s @ 60 Hz
  const focusSwitchesPerWindow = new Array(totalTicks / windowTicks).fill(0);
  const memberSwitchesPerWindow = new Map(
    memberIds.map((id) => [id, new Array(totalTicks / windowTicks).fill(0)]),
  );

  let prevFocusId = null;
  const prevMemberTarget = new Map();

  for (let tick = 1; tick <= totalTicks; tick++) {
    const windowIdx = Math.floor((tick - 1) / windowTicks);
    const phase = Math.floor((tick - 1) / 6) % 2;
    const distA = phase === 0 ? 400 - 8 : 400 + 8;
    const distB = phase === 0 ? 400 + 8 : 400 - 8;
    const threatA = phase === 0 ? 0.61 : 0.59;
    const threatB = phase === 0 ? 0.59 : 0.61;

    const contacts = [
      {
        id: 101,
        kind: ContactKind.SHIP,
        team: 0,
        hostile: true,
        alive: true,
        confidence: 0.9,
        threat: threatA,
        pos: { x: distA, z: 0 },
        vel: { x: 0, z: 0 },
      },
      {
        id: 102,
        kind: ContactKind.SHIP,
        team: 0,
        hostile: true,
        alive: true,
        confidence: 0.9,
        threat: threatB,
        pos: { x: distB, z: 0 },
        vel: { x: 0, z: 0 },
      },
    ];

    const perceptions = new Map(
      memberIds.map((id, idx) => [
        id,
        makePerception(id, { x: 0, z: idx * 20 }, contacts, tick),
      ]),
    );

    const decision = commander.update('wing_commitment_4242', tick, perceptions);
    if (prevFocusId !== null && decision.focusTargetId !== prevFocusId) {
      focusSwitchesPerWindow[windowIdx]++;
    }
    prevFocusId = decision.focusTargetId;

    for (const memberId of memberIds) {
      const targetId = decision.directives.get(memberId)?.objective?.targetId ?? null;
      if (prevMemberTarget.has(memberId) && prevMemberTarget.get(memberId) !== targetId) {
        memberSwitchesPerWindow.get(memberId)[windowIdx]++;
      }
      prevMemberTarget.set(memberId, targetId);
    }
  }

  for (let w = 0; w < focusSwitchesPerWindow.length; w++) {
    assert.ok(
      focusSwitchesPerWindow[w] <= 4,
      `window ${w} had ${focusSwitchesPerWindow[w]} focus switches (expected <= 4 per 10s)`,
    );
    for (const memberId of memberIds) {
      const switches = memberSwitchesPerWindow.get(memberId)[w];
      assert.ok(
        switches <= 4,
        `member ${memberId} in window ${w} had ${switches} target switches (expected <= 4 per 10s)`,
      );
    }
  }

  // Killing the current focus target switches to the surviving target on the very next tick.
  const survivingId = prevFocusId === 101 ? 102 : 101;
  const survivingContacts = [
    {
      id: survivingId,
      kind: ContactKind.SHIP,
      team: 0,
      hostile: true,
      alive: true,
      confidence: 0.9,
      threat: 0.6,
      pos: { x: 400, z: 0 },
      vel: { x: 0, z: 0 },
    },
  ];
  const nextTickPerceptions = new Map(
    memberIds.map((id, idx) => [
      id,
      makePerception(id, { x: 0, z: idx * 20 }, survivingContacts, totalTicks + 1),
    ]),
  );
  const afterKill = commander.update('wing_commitment_4242', totalTicks + 1, nextTickPerceptions);
  assert.equal(
    afterKill.focusTargetId,
    survivingId,
    'killing the current focus target switches focus to the surviving target on the very next tick',
  );
  assert.equal(
    afterKill.directives.get(11)?.objective?.targetId,
    survivingId,
    'leader immediately retargets the surviving hostile on the next tick',
  );
});

test('SFQ-B042: overflow attacker keeps its secondary target under small threat jitter and retargets immediately when that target dies', () => {
  const commander = new SquadCommander({ seed: 4242 });
  const memberIds = [21, 22, 23];
  commander.registerSquad({
    id: 'wing_secondary_hysteresis',
    doctrine: 'scavenger',
    faction: 'pirates',
    members: [
      { id: 21, preferredRole: 'leader', capabilities: ['drive', 'sensor', 'weapon'] },
      { id: 22, preferredRole: 'striker', capabilities: ['drive', 'sensor', 'weapon'] },
      { id: 23, preferredRole: 'support', capabilities: ['drive', 'sensor', 'weapon', 'ranged'] },
    ],
  });

  let overflowSwitches = 0;
  let prevOverflowTarget = null;

  for (let tick = 1; tick <= 600; tick++) {
    const phase = Math.floor((tick - 1) / 6) % 2;
    const contacts = [
      {
        id: 201,
        kind: ContactKind.SHIP,
        team: 0,
        hostile: true,
        alive: true,
        confidence: 0.95,
        threat: 0.9,
        pos: { x: 220, z: 0 },
        vel: { x: 0, z: 0 },
      },
      {
        id: 202,
        kind: ContactKind.SHIP,
        team: 0,
        hostile: true,
        alive: true,
        confidence: 0.9,
        threat: phase === 0 ? 0.52 : 0.48,
        pos: { x: 400, z: 40 },
        vel: { x: 0, z: 0 },
      },
      {
        id: 203,
        kind: ContactKind.SHIP,
        team: 0,
        hostile: true,
        alive: true,
        confidence: 0.9,
        threat: phase === 0 ? 0.48 : 0.52,
        pos: { x: 400, z: -40 },
        vel: { x: 0, z: 0 },
      },
    ];
    const perceptions = new Map(
      memberIds.map((id) => [id, makePerception(id, { x: 0, z: 0 }, contacts, tick)]),
    );
    const decision = commander.update('wing_secondary_hysteresis', tick, perceptions);
    const overflowTarget = decision.directives.get(23)?.objective?.targetId ?? null;
    if (prevOverflowTarget !== null && overflowTarget !== prevOverflowTarget) {
      overflowSwitches++;
    }
    prevOverflowTarget = overflowTarget;
  }

  assert.equal(prevOverflowTarget, 202);
  assert.equal(overflowSwitches, 0, 'overflow member stays committed to secondary target within targetSwitchMargin');

  // Killing secondary target 202 switches member 23 to 203 on the very next tick.
  const contactsAfterSecondaryDeath = [
    {
      id: 201,
      kind: ContactKind.SHIP,
      team: 0,
      hostile: true,
      alive: true,
      confidence: 0.95,
      threat: 0.9,
      pos: { x: 220, z: 0 },
      vel: { x: 0, z: 0 },
    },
    {
      id: 203,
      kind: ContactKind.SHIP,
      team: 0,
      hostile: true,
      alive: true,
      confidence: 0.9,
      threat: 0.48,
      pos: { x: 400, z: -40 },
      vel: { x: 0, z: 0 },
    },
  ];
  const perceptionsAfter = new Map(
    memberIds.map((id) => [id, makePerception(id, { x: 0, z: 0 }, contactsAfterSecondaryDeath, 601)]),
  );
  const decisionAfter = commander.update('wing_secondary_hysteresis', 601, perceptionsAfter);
  assert.equal(decisionAfter.directives.get(23)?.objective?.targetId, 203);
});
