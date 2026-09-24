// C4 — the bore rig uses the same printed control as the flight HUD.
// One lamp accent on the controls. No default browser button as the primary.
// The words name the key the player actually bound.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveDrillControlMap } from '../src/ui/screens/drill.js';

const source = readFileSync(new URL('../src/ui/screens/drill.js', import.meta.url), 'utf8');
const liveSource = readFileSync(new URL('../src/ui/asteroid/asteroidScreen.js', import.meta.url), 'utf8');
const liveStyle = readFileSync(new URL('../styles/asteroid-ops.css', import.meta.url), 'utf8');

test('the bore rig has no default button chrome', () => {
  assert.equal(source.includes('sf-btn'), false, 'sf-btn is the old browser button');
  assert.match(source, /k-word k-word--emph k-word--primary drill-scan-button/);
  assert.match(source, /data-sf-role="primary"/);
  assert.doesNotMatch(source, /SPACE: Pulse survey/);
});

test('pulse survey and retract show the live key', () => {
  const map = resolveDrillControlMap({ settings: {} });
  assert.ok(map.scanLabel && map.scanLabel !== 'UNBOUND', 'scan has a default key');
  assert.notEqual(map.scanLabel, 'Space', 'Space is the tether, not the survey');
  assert.match(source, /Pulse survey · \$\{escapeHtml\(controlMap\.scanLabel\)\}/);
  assert.match(source, /exitBtn\.textContent = 'Retract rig · Esc'/);
  assert.match(source, /<kbd>Esc<\/kbd>/);
});

test('restart, abort, and the extraction report are labeled kit words', () => {
  assert.match(source, /retryBtn\.textContent = 'Restart bore'/);
  assert.match(source, /abortBtn\.className = 'k-word k-word--danger'/);
  assert.match(source, /abortBtn\.textContent = 'Abort & return'/);
  assert.match(source, /closeBtn\.textContent = 'Close extraction report'/);
  assert.doesNotMatch(source, /textContent = 'Acknowledge'/);
});

test('a short window can scroll to the foot, and a narrow window stacks it', () => {
  assert.match(source, /@media \(max-height: 760px\)[\s\S]*overflow-y:\s*auto/);
  assert.match(source, /@media \(max-width: 620px\)[\s\S]*\.drill-foot \{ flex-direction: column/);
});

test('the live asteroid works report is a kit key, not the old browser button', () => {
  assert.match(liveSource, /closeBtn\.className = 'fh-key fh-key--primary'/);
  assert.match(liveSource, /closeBtn\.textContent = 'Close extraction report'/);
  assert.match(liveSource, /e\.stopPropagation\(\)/);
  assert.match(liveStyle, /\.ast-summary-box \.fh-key:focus-visible \{ outline: 2px solid var\(--dp-lamp\) !important/);
  assert.match(liveStyle, /\.ast-summary-box \.fh-key:is\(:hover, :focus-visible, :active\) \{[^}]*color: #1a1206/);
  assert.doesNotMatch(liveSource, /sf-btn/);
});

test('control focus uses the flight lamp, not a second accent', () => {
  assert.match(source, /outline:2px solid var\(--dp-lamp\) !important/);
  assert.match(source, /translate: none/);
  assert.doesNotMatch(source, /button:focus-visible[\s\S]{0,80}--sf-you/);
  assert.doesNotMatch(source, /--accent\s*:/);
});
