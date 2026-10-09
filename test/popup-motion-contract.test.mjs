// Popup motion contract — every transient surface enters cleanly and honours BOTH
// reduced-motion switches: the OS media query AND the in-game html.sf-reduce-motion
// setting. A surface guarded by only one still animates for the other audience.
// Style: static source pins like test/j07-hud-contract.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const hudStyles = read('../src/ui/views/hudStyles.js');
const hudSrc = read('../src/ui/hud.js');
const toastsSrc = read('../src/ui/toasts.js');
const floatSrc = read('../src/ui/floatingText.js');
const hailSrc = read('../src/ui/contactHailPrompt.js');
const lawSrc = read('../src/ui/sectorLawPresenter.js');
const stuntSrc = read('../src/ui/stuntCallout.js');
const wingmanSrc = read('../src/ui/wingmanRadial.js');
const deckCss = read('../styles/prompt-deck.css');
const commsCss = read('../styles/commsradial.css');

const MEDIA = 'prefers-reduced-motion';
const CLASS_SWITCH = 'html.sf-reduce-motion';

function assertDualGuards(name, src) {
  assert.ok(src.includes(MEDIA), `${name} must honour the OS reduced-motion media query`);
  assert.ok(src.includes(CLASS_SWITCH), `${name} must honour the in-game html.sf-reduce-motion switch`);
}

test('every popup motion surface carries both reduced-motion guards', () => {
  assertDualGuards('prompt-deck.css', deckCss);
  assertDualGuards('hudStyles (alerts/toasts/discovery)', hudStyles);
  assertDualGuards('floatingText', floatSrc);
  assertDualGuards('contactHailPrompt', hailSrc);
  assertDualGuards('commsradial.css', commsCss);
  assertDualGuards('hud.js travel tape', hudSrc);
  assertDualGuards('sectorLawPresenter', lawSrc);
  assertDualGuards('stuntCallout', stuntSrc);
  assertDualGuards('wingmanRadial', wingmanSrc);
});

test('no popup entrance snaps in', () => {
  assert.match(hudStyles, /@keyframes sf-alert-in/, 'alert pills fade in');
  assert.match(hailSrc, /@keyframes sf-contact-hail-in/, 'hail panel slides in');
  assert.match(deckCss, /@keyframes sf-prompt-in/, 'decisions slide in');
  assert.match(stuntSrc, /@keyframes sf-stuntcall-rise/, 'stunt callouts rise');
  assert.match(floatSrc, /@keyframes sf-ft-rise/, 'damage numbers rise');
});

test('the alert danger pulse and entrances cut under reduced motion', () => {
  assert.match(hudStyles, /sf-alertpulse/, 'danger pulse exists');
  const guardCount = (hudStyles.match(/\.sf-alert \{ animation:none; \}/g) || []).length;
  assert.ok(guardCount >= 2, `both reduced-motion guards must still the .sf-alert pulse (found ${guardCount})`);
});

test('toast dismiss plays the exit fade before removal', () => {
  const dismissStart = toastsSrc.indexOf('function dismiss(');
  assert.ok(dismissStart > 0, 'dismiss body locateable');
  const body = toastsSrc.slice(dismissStart, toastsSrc.indexOf('function tick()', dismissStart));
  assert.match(body, /sf-toast--out/, 'dismiss arms the exit class');
  const armAt = body.indexOf('sf-toast--out');
  const timerAt = body.indexOf('setTimeout', armAt);
  const removeAt = body.indexOf('removeChild', armAt);
  assert.ok(timerAt > 0 && removeAt > timerAt, 'removal waits a transition beat after the exit class');
  assert.match(body, /_dismissing/, 're-entrant dismiss is guarded');
  assert.match(body, /opts\.instant/, 'session-boundary teardown skips the exit beat');
  assert.match(toastsSrc, /dismiss\(live\[live\.length - 1\], \{ instant: true \}\)/,
    'save:loaded / game:new clear the lane synchronously');
});

test('toast cards show hover and keyboard focus affordances', () => {
  assert.match(hudStyles, /\.sf-toast:hover/, 'pointer hover reads as interactive');
  assert.match(hudStyles, /\.sf-toast:focus-visible/, 'keyboard focus ring exists');
});

test('wingman radial keeps one copy of its a11y tail', () => {
  const mediaCount = (wingmanSrc.match(/@media \(prefers-reduced-motion:reduce\)/g) || []).length;
  assert.equal(mediaCount, 1, `reduced-motion media block must appear once (found ${mediaCount})`);
  const forcedCount = (wingmanSrc.match(/@media \(forced-colors:active\)/g) || []).length;
  assert.equal(forcedCount, 1, `forced-colors block must appear once (found ${forcedCount})`);
});
