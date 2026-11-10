// SFQ-B204 â€” a refused build says why on the preset control and focuses it once.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyPresetRejection, loadoutRejectionSpeech } from '../src/ui/ship/loadoutPresets.js';
import { fakeDom } from './helpers/fake-dom.mjs';

test('SFQ-B204 a rack refusal names the predicate and focuses the build once', () => {
  assert.equal(loadoutRejectionSpeech('rack_not_docked'), 'Dock to prepare the bomb rack');
  assert.equal(loadoutRejectionSpeech('rack_credits'), 'Not enough credits for the rack on this build');
  assert.equal(loadoutRejectionSpeech('rack_no_stock'), 'That bomb is not in stock');
  assert.equal(loadoutRejectionSpeech('rack_empty_rack'), 'The rack on this build is empty');
  assert.equal(loadoutRejectionSpeech('rack_no_rack_owner'), 'This hull has no bomb rack');
  assert.equal(loadoutRejectionSpeech('rack_commit_failed'), 'Rack preparation failed — build not applied');
  assert.equal(loadoutRejectionSpeech('outfit_space'), 'Outfit space exceeded');
  assert.equal(loadoutRejectionSpeech('no-such-reason'), 'Cannot apply this build');

  const previous = globalThis.document;
  globalThis.document = fakeDom();
  try {
    const button = document.createElement('button');
    const sub = document.createElement('span');
    sub.className = 'sx-sw-preset__sub';
    sub.textContent = 'Preset';
    button.querySelector = (sel) => (sel === '.sx-sw-preset__sub' ? sub : null);
    let focuses = 0;
    button.focus = () => { focuses += 1; };
    const speech = applyPresetRejection(button, 'rack_credits');
    assert.equal(speech, 'Not enough credits for the rack on this build');
    assert.equal(button.getAttribute('data-why'), speech);
    assert.equal(button.getAttribute('aria-invalid'), 'true');
    assert.equal(button.getAttribute('aria-label'), speech);
    assert.equal(sub.textContent, speech);
    assert.equal(focuses, 1);
    applyPresetRejection(button, 'rack_credits');
    assert.equal(focuses, 1);
    const rebuilt = document.createElement('button');
    rebuilt.focus = () => { focuses += 1; };
    applyPresetRejection(rebuilt, 'rack_credits', { focus: false });
    assert.equal(rebuilt.getAttribute('aria-invalid'), 'true');
    assert.equal(focuses, 1, 'repainting an error onto a replacement node preserves the current focus');
  } finally {
    globalThis.document = previous;
  }
});
