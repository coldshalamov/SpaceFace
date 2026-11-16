// AL-HUD-1 (build_map row 429): the compact Overhead/Circuits tape must never overlap the
// target card. racingHud.syncParent reparents it into .sf-rightdock, whose contain:layout
// makes position:fixed resolve against the dock box — the old fixed top:68px/right:12px
// landed mid-card. These assertions pin the dock-flow contract and the mobile override
// that keeps its own absolute anchors, at both layout owners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKPLATE_SCREENS_CSS } from '../src/ui/deckplate/screens.js';
import { MOBILE_FLIGHT_LAYOUT_CSS } from '../src/ui/orrery/mobileFlightLayouts.js';

test('compact race tape flows as the right-dock first row, never fixed over the target card', () => {
  // Inside .sf-rightdock the tape participates in the dock's column flow (it is inserted
  // firstChild, so it stacks above the target readout) — overlap is impossible by layout.
  assert.match(
    DECKPLATE_SCREENS_CSS,
    /\.sf-rightdock > \.race-tape\[data-compact="true"\] \{[^}]*position:static/,
  );
  // The #hud-root fallback mount (no dock ancestor) keeps the fixed top-right rail.
  assert.match(
    DECKPLATE_SCREENS_CSS,
    /\.race-tape\[data-compact="true"\] \{[^}]*right:max\(12px/,
  );
});

test('mobile flight owns the compact tape seat, and the phone hides it entirely', () => {
  // mobileFlightLayouts owns placement under data-sf-mobile-flight with !important, which is what
  // beats the desktop dock-flow rule. MOB-07 (a8edb98f0b) moved the phone tape off the glass
  // ("display:none!important") and collapsed its portrait/landscape anchors into one base block, so
  // the contract is now: one absolutely-positioned base seat, plus the per-orientation overrides
  // that only move it.
  const compactRules = [
    ...MOBILE_FLIGHT_LAYOUT_CSS.matchAll(/#race-tape\[data-compact="true"\] \{([^}]*)\}/g),
  ];
  assert.ok(compactRules.length >= 2, 'the compact tape has a base seat plus orientation overrides');
  const base = compactRules.find((rule) => /position:absolute!important/.test(rule[1]));
  assert.ok(base, 'the tape keeps !important absolute positioning over the desktop dock-flow rule');
  assert.match(base[1], /display:none!important/,
    'MOB-07 took the compact Overhead/Circuits tape off the phone glass');
  assert.ok(compactRules.some((rule) => /top:-87px!important/.test(rule[1])),
    'compact landscape still overrides the base seat');
  assert.ok(compactRules.some((rule) => /top:-70px!important/.test(rule[1])),
    'the 320-tall window still lifts the base seat');
});
