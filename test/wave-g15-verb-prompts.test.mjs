// Wave G15 — flight help for rope and shove prints the key the player actually bound.

import test from 'node:test';
import assert from 'node:assert/strict';

import { controlPrompt } from '../src/ui/controlPrompts.js';

function reboundState() {
  return {
    settings: {
      gameplay: { controlScheme: 'pilot' },
      controls: {
        bindings: {
          tether: ['KeyP'],
          // The shove hint names the SHOVE power (five powers, owner 2026-10-22), not the charge throw.
          shove: ['KeyZ'],
        },
      },
    },
  };
}

test('G15 rope and shove prompts follow the live binding on flight and combat', () => {
  const state = reboundState();
  for (const key of ['flight', 'combat', 'firstCombat']) {
    const line = controlPrompt(key, 'kbm', state);
    assert.match(line, /P Massline|P controls the Massline/, `${key} shows the rebound rope key`);
    assert.match(line, /Z shove/, `${key} shows the rebound shove key`);
    assert.doesNotMatch(line, /Space\/F/, `${key} does not keep the default rope key`);
    assert.doesNotMatch(line, /\b2\/R shove\b/, `${key} does not keep the default shove key`);
  }
});
