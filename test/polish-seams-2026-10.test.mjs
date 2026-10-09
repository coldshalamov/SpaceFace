// Focused proofs for seams that were wrong against their own contracts.
import test from 'node:test';
import assert from 'node:assert/strict';

import { machineTranslate } from '../src/localization/pipeline.js';
import { normalizeStoryFacts, recordCareerDecision } from '../src/story/storyFacts.js';
import {
  declineHunterOrigin,
  abandonHunterOrigin,
  acceptHunterOrigin,
} from '../src/careers/origins/hunterOrigin.js';
import { ensureHunterOriginState } from '../src/careers/origins/hunterOriginSave.js';

test('machine phrases do not rewrite words that merely contain them', () => {
  const loading = machineTranslate('es-ES', 'Loading flight systems');
  const payload = machineTranslate('es-ES', 'Likely payload');
  assert.equal(loading.includes('Cargaring'), false, loading);
  assert.equal(payload.includes('payCargar'), false, payload);
  assert.equal(machineTranslate('es-ES', 'Load'), 'Cargar');
});

test('a declined career at the fact cap stays in the ledger', () => {
  const story = { facts: [] };
  for (let i = 0; i < 64; i++) {
    story.facts.push({
      id: `note-${i}`,
      kind: 'note',
      atS: i,
      beat: 0,
      text: `note ${i}`,
      citation: `note:${i}`,
    });
  }
  recordCareerDecision(story, 'declined', { careerId: 'hauler' }, 80, 1);
  const facts = normalizeStoryFacts(story.facts);
  assert.equal(facts.length, 64);
  assert.equal(facts.some((row) => row.id === 'career:hauler:road'), true);
  assert.equal(facts.some((row) => row.id === 'note-0'), false);
});

test('hunter decline and abandon do not grow a step id back on the next ensure', () => {
  const declined = { seed: 3 };
  const offer = ensureHunterOriginState(declined);
  offer.offer.status = 'offered';
  declineHunterOrigin(declined, { simTime: 10 });
  assert.equal(declined.careers.origins.hunter.stepId, null);
  ensureHunterOriginState(declined);
  assert.equal(declined.careers.origins.hunter.stepId, null);
  assert.equal(declined.careers.origins.hunter.offer.status, 'declined');

  const abandoned = { seed: 4 };
  ensureHunterOriginState(abandoned);
  abandoned.careers.origins.hunter.offer.status = 'offered';
  acceptHunterOrigin(abandoned, { simTime: 1 });
  abandonHunterOrigin(abandoned, { simTime: 2 });
  assert.equal(abandoned.careers.origins.hunter.stepId, null);
  ensureHunterOriginState(abandoned);
  assert.equal(abandoned.careers.origins.hunter.stepId, null);
  assert.equal(abandoned.careers.origins.hunter.offer.status, 'declined');
});
