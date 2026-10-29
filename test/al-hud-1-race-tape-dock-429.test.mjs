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

test('mobile flight keeps its own absolute anchors for the compact tape in the dock', () => {
  // mobileFlightLayouts owns placement under data-sf-mobile-flight; it must keep the
  // !important absolute positioning that beats the desktop dock-flow rule.
  const compactRules = [
    ...MOBILE_FLIGHT_LAYOUT_CSS.matchAll(/#race-tape\[data-compact="true"\] \{([^}]*)\}/g),
  ];
  assert.ok(compactRules.length >= 2, 'portrait + landscape compact anchors both exist');
  for (const rule of compactRules) {
    assert.match(rule[1], /position:absolute!important/);
  }
});
