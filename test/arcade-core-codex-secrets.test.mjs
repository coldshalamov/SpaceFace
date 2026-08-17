import assert from 'node:assert/strict';
import test from 'node:test';

import { CODEX_SECRETS, codexSecretPages } from '../src/data/codexSecrets.js';
import { LISTENING_POST } from '../src/data/listeningPost.js';
import { codexProgressSummary } from '../src/ui/screens/codex.js';

function stateWithListeningPost({ decoded = false } = {}) {
  return {
    story: { flags: { contract_47a_b0_delivered: true } },
    world: { discovery: {
      [LISTENING_POST.sourceSectorId]: { pois: {
        [LISTENING_POST.sourcePoiId]: {
          investigated: true,
          listeningPost: {
            decoded,
            attemptCount: decoded ? 1 : 0,
            decodedAt: decoded ? 120 : null,
          },
        },
      } },
    } },
  };
}

test('Secrets is a fixed six-entry catalog whose unresolved rows reveal no names', () => {
  assert.equal(CODEX_SECRETS.length, 6);
  assert.equal(new Set(CODEX_SECRETS.map((entry) => entry.id)).size, 6);
  const pages = codexSecretPages({ story: {} });
  assert.equal(pages.filter((page) => page.unlocked).length, 0);
  assert.ok(pages.every((page) => page.phase === 'locked' && page.body == null));
});

test('only the real 47-A delivery and Listening Post discovery facts reveal their entries', () => {
  const recoveredState = stateWithListeningPost();
  let pages = codexSecretPages(recoveredState);
  assert.deepEqual(pages.filter((page) => page.unlocked).map((page) => page.id), [
    'secret_listening_post',
    'secret_47a_golden_route',
  ]);
  assert.match(pages[0].body, /5 then 15/);
  assert.equal(pages.find((page) => page.id === 'secret_face').body, null,
    'an unimplemented secret cannot be revealed by catalog presence');

  const decodedState = stateWithListeningPost({ decoded: true });
  pages = codexSecretPages(decodedState);
  const listening = pages.find((page) => page.id === 'secret_listening_post');
  assert.equal(listening.phase, 'decoded');
  assert.match(listening.body, /Last Light Station/);
  assert.match(listening.note, /5,15/);

  const summary = codexProgressSummary(decodedState.story, decodedState);
  assert.equal(summary.items.find((item) => item.key === 'Secrets').value, '2/6 found');
  assert.match(summary.items.find((item) => item.key === 'Completion').value, /^\d+%$/);
});
