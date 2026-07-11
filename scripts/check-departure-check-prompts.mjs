#!/usr/bin/env node
import assert from 'node:assert/strict';

import { controlPrompt } from '../src/ui/controlPrompts.js';

const firstStationPrompts = [
  ['kbm', 'keyboard/mouse'],
  ['gamepad', 'gamepad'],
  ['touch', 'touch'],
];

for (const [modality, label] of firstStationPrompts) {
  const prompt = controlPrompt('firstStation', modality);
  assert.match(prompt, /Departure Check/, `${label} first-station prompt should teach the pre-undock Departure Check`);
  assert.match(prompt, /undock/i, `${label} first-station prompt should pair Departure Check with undocking`);
}

assert.match(
  controlPrompt('firstStation', 'kbm'),
  /Review Departure Check before .* or Escape undocks/,
  'keyboard/mouse prompt should tersely point to the readiness gate before E/Escape undock',
);
assert.match(
  controlPrompt('firstStation', 'gamepad'),
  /Review Departure Check before B undocks/,
  'gamepad prompt should tersely point to the readiness gate before B undocks',
);
assert.match(
  controlPrompt('firstStation', 'touch'),
  /Review Departure Check, then tap Undock/,
  'touch prompt should tersely point to the readiness gate before Undock',
);

console.log('Departure Check prompt parity OK');
