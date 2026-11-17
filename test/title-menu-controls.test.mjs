import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './helpers/mini-dom.mjs';
import { words } from '../src/ui/kit/dom.js';
import { composeTitleModeButton, titleTabLadder } from '../src/ui/screens/mainMenu.js';

// Browser geometry/pointer evidence belongs to scripts/check-swarm-hangar-ux.mjs. This test
// protects the real DOM assembly and event ownership independently of rendered dimensions.
test('mode name, description and action are children of the original native button', () => {
  const previous = globalThis.document;
  const doc = makeDocument();
  globalThis.document = doc;
  try {
    const picks = [];
    const list = words([{ action: 'swarm', label: 'Swarm', sub: 'Choose a ship and survive the waves.' }], {
      system: 'light', onPick: (action) => picks.push(action),
    });
    const button = list.querySelector('button');
    // The small shared DOM harness implements append/remove, not replaceChildren.
    button.replaceChildren = (...children) => { button.textContent = ''; button.append(...children); };
    composeTitleModeButton(button, { title: 'Swarm', category: 'Wave survival', action: 'Open hangar' });
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
    assert.equal(button.dataset.action, 'swarm');
    assert.equal(button.parentElement.children.length, 1, 'an inert description cannot sit outside the button');
    const summary = button.querySelector('.dp-lit__note');
    assert.equal(summary.textContent, 'Choose a ship and survive the waves.');
    assert.equal(summary.parentElement, button);
    assert.equal(button.getAttribute('aria-describedby'), summary.id, 'the visible explanation is also announced');
    assert.equal(button.querySelector('.of-title-door-action').textContent, 'Open hangar');
    summary.click();
    assert.deepEqual(picks, ['swarm'], 'description clicks reach the original action exactly once');
    button.click();
    assert.deepEqual(picks, ['swarm', 'swarm'], 'button background uses the same single action');
    button.setAttribute('aria-disabled', 'true');
    summary.click();
    assert.deepEqual(picks, ['swarm', 'swarm'], 'nested copy cannot bypass readiness checks');
  } finally {
    globalThis.document = previous;
  }
});

test('keyboard navigation includes the extras toggle and skips hidden or unavailable actions', () => {
  const control = (name, { hidden = false, disabled = false, loading = false } = {}) => ({
    name, disabled,
    getAttribute: (key) => key === 'aria-disabled' && loading ? 'true' : null,
    getClientRects: () => hidden ? [] : [{ width: 160, height: 48 }],
  });
  const adventure = control('Adventure');
  const swarm = control('Swarm');
  const extraToggle = control('More modes & extras');
  const controls = [control('Continue', { hidden: true }), adventure, swarm,
    control('Racing', { hidden: true }), control('Load', { loading: true }),
    control('Quit', { disabled: true }), extraToggle];
  const selected = titleTabLadder({ root: { querySelectorAll: () => controls } });
  assert.deepEqual(selected, [adventure, swarm, extraToggle]);
});
