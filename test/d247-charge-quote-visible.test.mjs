import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chargeQuoteText } from '../src/ui/asteroid/asteroidController.js';
import { chargeRefusalText } from '../src/systems/drill.js';

const SCREEN_SRC = readFileSync(new URL('../src/ui/asteroid/asteroidScreen.js', import.meta.url), 'utf8');
const STATION_CSS_SRC = readFileSync(new URL('../src/ui/orrery/stationLayouts.js', import.meta.url), 'utf8');

// D247 (second half): the bore-charge quote reached only the screen-reader live region —
// a sighted player committed credits with no visible number. The armed charge now owns the
// crest's live alert slot (showBanner), re-quoting on the HUD cadence until it disarms.
test('armed bore charge paints the quote on the visible alert slot', () => {
  const hud = SCREEN_SRC.slice(
    SCREEN_SRC.indexOf('function updateHud()'),
    SCREEN_SRC.indexOf('function updateHud()') + 8000,
  );
  assert.match(hud, /chargeArmed[\s\S]*chargePreview\(\)/, 'the armed HUD path re-reads the live preview');
  assert.match(hud, /showBanner\('charge'/, 'the quote rides the visible alert slot, not only the SR region');
  assert.match(hud, /clearBanner\('charge'\)/, 'disarm returns the slot');
  assert.match(hud, /chargeRefusalText/, 'a refused preview still says why, visibly');
});

test('quote and refusal formatters cover both arms of the banner', () => {
  // Refused preview: the banner still speaks the gate's own wording.
  assert.match(chargeRefusalText('credits', 1200), /1200 credits/);
  assert.match(chargeRefusalText('tier'), /too hard/);
  // Quoted preview: cost, banked ore, hazards and the commit instruction in one line.
  const text = chargeQuoteText({
    ok: true, payloadLabel: 'Blast charge', cost: 1200,
    yields: { cmdty_ore_iron: 6 }, spill: {}, gasCount: 1, selfDanger: false,
  });
  assert.match(text, /1200 cr/);
  assert.match(text, /banks 6u iron/);
  assert.match(text, /1 gas/);
  assert.match(text, /R again to set it/);
});

// D247 (first half): the ORRERY vitals sheet pinned flex-wrap:nowrap !important, defeating the
// authored deckplate <=1280px wrap — four 132px readings overflowed the crown column onto the
// news tape. The sheet must restore the wrap inside its own scope at the same breakpoint.
test('ORRERY station sheet restores the authored vitals wrap at <=1280px', () => {
  assert.match(STATION_CSS_SRC, /@media \(max-width:1280px\)[^`]*?sxb-vitals[^`]*?flex-wrap:wrap !important/,
    'the crown column wraps the gauges 2x2 instead of overflowing the news tape');
});
