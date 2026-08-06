import test from 'node:test';
import assert from 'node:assert/strict';

import { mapOperatorLabel } from '../src/ui/galaxyMap.js';
import { factionRepToastText } from '../src/ui/floatingText.js';
import { factionStandingGuidance } from '../src/ui/screens/factions.js';

const visibleState = {
  story: { endgameChoice: null, flags: {} },
};

const quietRoutingState = {
  story: {
    endgameChoice: 'B',
    endgameResolved: true,
    flags: {
      identityErased: true,
      identity_erased: true,
      hide_own_rep_delta: true,
      routing_active: true,
    },
  },
};

test('Choice B changes the live chart identity only when the canonical consequence flag is set', () => {
  assert.equal(mapOperatorLabel(visibleState), 'YOU');
  assert.equal(mapOperatorLabel({ story: { endgameChoice: 'B', flags: {} } }), 'YOU',
    'choice metadata alone must not impersonate an applied consequence');
  assert.equal(mapOperatorLabel(quietRoutingState), 'OPERATOR: UNKNOWN');
});

test('Choice B keeps reputation feedback legible without publishing the exact delta', () => {
  const payload = { factionId: 'faction_free', delta: 12.4 };
  assert.match(factionRepToastText(visibleState, payload), /^\+12 REP · /);

  const routed = factionRepToastText(quietRoutingState, payload);
  assert.match(routed, /^STANDING UPDATE ROUTED · /);
  assert.doesNotMatch(routed, /12|\+|-/);

  const guidance = factionStandingGuidance(120, { id: 'faction_free', short: 'FREE' }, {
    value: 18,
    reason: 'complete_faction_mission',
  }, { hideLastDelta: true });
  assert.equal(guidance.last, 'routing record withheld');
  assert.match(guidance.next, /rep to Trusted/,
    'tier access remains usable; Choice B hides only the personal delta');
});
