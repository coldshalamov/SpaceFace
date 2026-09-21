// INF-023 — a towing hostile reads as intent: back off, commit, or visibly fail.
//
// When the wing smells an exposed line it does not hover undecided. The specialist
// commits to the counter-tether cut while the rest of the wing visibly backs off into
// a screen around the attempt — one wing, two readable jobs. (The warning window, the
// warn-once gate, and the threatened-end routing already ride the ai:counterTether
// telegraph, proven by massline-counter-tether-response; this locks the wing half.)
import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { SquadCommander } from '../src/ai/squad.js';

test('INF-023: an exposed line splits the wing into cut and screen', () => {
  const commander = new SquadCommander({ seed: 23 });
  commander.registerSquad({
    id: 'jackals-2',
    members: [
      { id: 21, capabilities: ['drive'] },
      { id: 22, capabilities: ['drive', 'counter_tether_cut'] },
    ],
  });
  const perceptions = new Map();
  for (const id of [21, 22]) {
    perceptions.set(id, {
      self: {
        id, pos: { x: id * 10, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
        hullFraction: 1, disabled: false, capabilities: ['drive'],
      },
      contacts: [
        {
          kind: ContactKind.SHIP, id: 1, hostile: true, hostileVotes: 1, friendlyVotes: 0,
          confidence: 1, threat: 0.9, pos: { x: 600, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
        },
        {
          kind: ContactKind.TETHER, id: 'att_7', exposed: true, confidence: 0.7,
          tags: ['owned_by_self'], targetId: 1, ownerId: 1,
        },
      ],
      events: [],
    });
  }
  const result = commander.update('jackals-2', 10, perceptions, null);
  assert.equal(result.tactic, 'cut_and_scatter', 'the exposed line owns the tactic');
  const screen = result.directives.get(21);
  const cut = result.directives.get(22);
  assert.equal(screen.objective.kind, ObjectiveKind.SCREEN, 'the wing backs off into a screen');
  assert.equal(screen.objective.reason, 'exposed_tether');
  assert.equal(cut.objective.kind, ObjectiveKind.COUNTER_TETHER_CUT, 'the specialist commits to the cut');
  assert.equal(cut.objective.reason, 'exposed_tether');
});
