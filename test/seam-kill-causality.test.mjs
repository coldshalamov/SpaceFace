import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KillCause,
  KillSurface,
  compactKillCausality,
  isCanonicalKillCause,
  killCauseFromPayload,
  normalizeKillCause,
} from '../src/combat/killCausality.js';

test('compact kill causality keeps the receipt surface instead of deriving a rock from a station', () => {
  const compact = compactKillCausality({
    killerId: 1,
    presentation: {
      cause: KillCause.SHIP_COLLISION,
      playerCaused: true,
      surface: KillSurface.STRUCTURE,
    },
  }, 1);
  assert.equal(compact.cause, KillCause.SHIP_COLLISION);
  assert.equal(compact.playerCaused, true);
  assert.equal(compact.surface, KillSurface.STRUCTURE, 'a station kill must not be rewritten as terrain');
  assert.equal(compact.version, 1);
});

test('unknown causes collapse to generic; canonical causes pass through', () => {
  assert.equal(normalizeKillCause('not-a-cause'), KillCause.GENERIC);
  assert.equal(isCanonicalKillCause(KillCause.KINETIC), true);
  assert.equal(killCauseFromPayload({ cause: KillCause.EXPLOSIVE }), KillCause.EXPLOSIVE);
  assert.equal(killCauseFromPayload({ presentation: { cause: KillCause.TERRAIN_COLLISION } }), KillCause.TERRAIN_COLLISION);
  const terrain = compactKillCausality({
    presentation: { cause: KillCause.TERRAIN_COLLISION },
  });
  assert.equal(terrain.surface, KillSurface.TERRAIN);
});
