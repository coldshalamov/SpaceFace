#!/usr/bin/env node
// UIUX-ONBOARDING-LIVE-STATUS-IMPL-001 — accessible objective tracker contract.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(ROOT, 'src/systems/onboarding.js'), 'utf8');

assert.match(src, /el\.setAttribute\('role', 'region'\)/,
  'objective tracker must expose a region role');
assert.match(src, /el\.setAttribute\('aria-label', 'Objective tracker'\)/,
  'objective tracker must have an accessible name');
assert.match(src, /title\.setAttribute\('role', 'status'\)/,
  'objective text must be a status message');
assert.match(src, /title\.setAttribute\('aria-live', 'polite'\)/,
  'objective text must use the polite channel');
assert.match(src, /title\.setAttribute\('aria-atomic', 'true'\)/,
  'objective status must announce atomically');

assert.match(src, /this\._titleEl\.textContent !== line/,
  'beat status must update only when objective text changes');
assert.match(src, /this\._titleEl\.textContent !== objective/,
  'story status must update only when objective text changes');
assert.doesNotMatch(src, /this\._titleEl\.focus\(|this\._panel\.focus\(/,
  'objective status must never steal focus');

assert.match(src, /'step ' \+ \(idx >= 0 \? \(idx \+ 1\) : 0\) \+ ' of ' \+ BEATS\.length/,
  'step progress must be available as text');
assert.match(src, /steps\.setAttribute\('aria-hidden', 'true'\)/,
  'visual progress dots must be hidden from the assistive tree');

assert.match(src, /_syncModalAccessibility\(\)/,
  'objective tracker must own modal accessibility synchronization');
assert.match(src, /classList\.contains\('ui-modal-open'\)/,
  'modal synchronization must follow the live modal body state');
assert.match(src, /setAttribute\('aria-hidden', 'true'\)/,
  'modal-open tracker must be removed from the assistive tree');
assert.match(src, /removeAttribute\('aria-hidden'\)/,
  'tracker must return to the assistive tree after modal close');
assert.match(src, /update\(dt, state\)[\s\S]*?_syncModalAccessibility\(\)/,
  'per-frame lifecycle must reconcile semantic state with modal visibility');

console.log('Onboarding live status OK — stable polite objective, textual progress, modal AT sync');
