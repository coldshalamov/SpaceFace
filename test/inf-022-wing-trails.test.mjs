// INF-022 — NPC swarms leave readable trails.
//
// Targeting one member of a tracking wing names the wing and its rough role, straight off
// the entity the panel already holds. And the wing itself holds its slot shape: one actor
// per slot, same relative geometry tick after tick, same tactic across seconds.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind } from '../src/ai/contracts.js';
import { SquadCommander } from '../src/ai/squad.js';
import { wingLineFor } from '../src/ui/targetPanel.js';

function wingMember({ id = 11, squadId = 'wolfpack-3', doctrine = 'mine_layer_wake', trackingPlayer = true } = {}) {
  return {
    id, type: 'ship', alive: true, team: 1,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    data: {
      ai: { squadId, combatDoctrineId: doctrine },
      combat: trackingPlayer ? { targetId: 1 } : {},
    },
  };
}

test('INF-022: targeting a tracking wing member names the wing and its rough role', () => {
  const line = wingLineFor(wingMember(), 1);
  assert.ok(line.includes('WOLFPACK-3'), `the wing is named, got: ${line}`);
  assert.ok(line.includes('AREA DENIAL'), `the doctrine reads as its wing role, got: ${line}`);
  assert.ok(line.includes('TRACKING YOU'), `the tracking half reads, got: ${line}`);
});

test('INF-022: the line degrades gracefully without wing facts', () => {
  assert.equal(wingLineFor({ id: 9, data: { ai: {} } }, 1), null, 'no squad, no wing line');
  assert.equal(wingLineFor(null, 1), null);
  const noDoctrine = wingLineFor(wingMember({ doctrine: null }), 1);
  assert.ok(noDoctrine.includes('WING'), 'the wing still names without a doctrine');
  assert.ok(!noDoctrine.includes('PRESS'), 'no invented role without an identity');
  const notTracking = wingLineFor(wingMember({ trackingPlayer: false }), 1);
  assert.ok(!notTracking.includes('TRACKING YOU'), 'a wing busy elsewhere says so by omission');
  const long = wingLineFor(wingMember({ squadId: 'a-very-long-squadron-designation-99' }), 1);
  assert.ok(long.length <= 64, 'long designations truncate instead of breaking the sentence');
});

test('INF-022: a wing holds one actor per slot and the same shape for seconds', () => {
  const commander = new SquadCommander({ seed: 11 });
  commander.registerSquad({
    id: 'wolfpack-3',
    members: [{ id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }],
  });
  const first = runTicks(commander, 0);
  // One actor per slot: every pair of slots stands well apart.
  for (let a = 0; a < first.slots.length; a++) {
    for (let b = a + 1; b < first.slots.length; b++) {
      const dx = first.slots[a].x - first.slots[b].x;
      const dz = first.slots[a].z - first.slots[b].z;
      assert.ok(Math.hypot(dx, dz) > 1, `slots ${a} and ${b} must not coincide`);
    }
  }
  // Same shape, same tactic, three seconds later on identical truth.
  const later = runTicks(commander, 190);
  assert.equal(later.tactic, first.tactic, 'the tactic holds across seconds, not samples');
  for (let i = 0; i < first.slots.length; i++) {
    const dx = later.slots[i].x - first.slots[i].x;
    const dz = later.slots[i].z - first.slots[i].z;
    assert.ok(Math.hypot(dx, dz) < 1e-6, `slot ${i} must not wander while truth stands still`);
  }
});

function runTicks(commander, tick) {
  const perceptions = new Map();
  for (const id of [11, 12, 13, 14]) {
    perceptions.set(id, {
      self: {
        id, pos: { x: id * 10, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
        hullFraction: 1, disabled: false, capabilities: ['drive'],
      },
      contacts: [{
        kind: ContactKind.SHIP, id: 1, hostile: true, hostileVotes: 1, friendlyVotes: 0,
        confidence: 1, threat: 0.9, pos: { x: 600, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
      }],
      events: [],
    });
  }
  const result = commander.update('wolfpack-3', tick, perceptions, null);
  const slots = [11, 12, 13, 14].map((id) => {
    const directive = result.directives.get(id);
    assert.ok(directive, `member ${id} gets a directive`);
    return directive.formation.slot;
  });
  return { tactic: result.tactic, slots };
}
