// SEED-SE-14 — the Clips reel keeps a Death mark when a voyage-log kill shares that instant.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createClipDirector } from '../src/core/simSnapshot.js';
import {
  clipKeptBesideMoments,
  clipListSummary,
  installLiveClipDirector,
  uninstallLiveClipDirector,
} from '../src/ui/screens/clips.js';

const SEED = 4242;

test('seed 4242: a Death clip stays when a logged kill has the same tick', () => {
  const director = createClipDirector();
  director.observeDeath({ tick: 1700, killerId: 4, playerId: 1, seed: SEED });
  const death = director.list().find((clip) => clip.kind === 'death');
  assert.ok(death);
  const loggedKill = { shape: 'logged_kill', payoffTick: death.momentTick, label: 'Logged kill' };
  assert.equal(clipKeptBesideMoments(death, [loggedKill]), true);
  assert.equal(clipKeptBesideMoments({ kind: 'kill', momentTick: death.momentTick }, [loggedKill]), false);

  installLiveClipDirector(null, { stateOf: () => null });
  try {
    const summary = clipListSummary(director);
    assert.equal(summary.items.some((item) => item.kind === 'death' && item.label === 'Death'), true);
  } finally {
    uninstallLiveClipDirector();
  }
});
