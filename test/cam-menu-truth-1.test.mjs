// CAM-MENU-TRUTH-1 — pause, records, and credits say only what the game can keep.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CREDITS } from '../src/data/credits.js';
import { creditsPlayerLine } from '../src/ui/screens/credits.js';
import { PAUSE_MEDIA_ON_SHEET, pauseMapAction } from '../src/ui/screens/pause.js';
import { recordsMilestoneRows } from '../src/ui/screens/statistics.js';

const pauseSrc = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');
const pauseCss = readFileSync(new URL('../src/ui/orrery/pauseLayouts.js', import.meta.url), 'utf8');

test('pause does not offer retired Operations or unfinished Media, and names the chart', () => {
  assert.equal(PAUSE_MEDIA_ON_SHEET, false);
  assert.doesNotMatch(pauseSrc, /pushScreen',\s*'automation'/);
  assert.match(pauseSrc, /if \(PAUSE_MEDIA_ON_SHEET\)/);
  const action = pauseMapAction({
    world: { currentSectorId: 'sector_helios' },
    nav: { waypoint: { label: 'Helios Station', pos: { x: 1, z: 2 }, sectorId: 'sector_helios' } },
  });
  assert.match(action.label, /^Chart \(/);
  assert.doesNotMatch(action.label, /Local Map|Star Map/);
  const briefLink = pauseCss.slice(pauseCss.indexOf('.sf-pause-brief :is(a'), pauseCss.indexOf(':focus-visible', pauseCss.indexOf('.sf-pause-brief :is(a')));
  assert.match(briefLink, /text-decoration:none !important/);
  assert.match(briefLink, /box-shadow:none !important/);
  assert.doesNotMatch(briefLink, /box-shadow:0 1\.5px/);
});

test('a fresh records wall counts zeros and the next real mark, in plain words', () => {
  const rows = recordsMilestoneRows({
    career: { distanceFlownWu: 0, biggestThrowSpeed: 0, shipsLost: 0, killsByWeapon: {}, counters: {} },
    playerStats: {},
    law: { heat: 0, wanted: 'Clean' },
  });
  const text = rows.map((row) => `${row.label} ${row.value} ${row.next}`).join('\n');
  assert.match(text, /Distance flown 0 m/);
  assert.match(text, /Jumps 0 Next: make one jump/);
  assert.match(text, /Swing releases 0 Next: let go at the top of a swing/);
  assert.match(text, /Status Clean/);
  assert.match(text, /Heat 0%/);
  assert.doesNotMatch(text, /not yet|razor|Massline/i);

  const flown = recordsMilestoneRows({
    career: {
      distanceFlownWu: 12500,
      biggestThrowSpeed: 40,
      counters: { jumps: 1, docks: 0 },
    },
    playerStats: { tradesCount: 0 },
    law: null,
  });
  const distance = flown.find((row) => row.label === 'Distance flown');
  const jumps = flown.find((row) => row.label === 'Jumps');
  assert.equal(distance.value, '12.5 km');
  assert.equal(jumps.value, '1');
  assert.match(jumps.next, /Next: 24 jumps/);
});

test('credits name the Line and do not invent a studio line', () => {
  const latch = (CREDITS.assets || []).find((row) => /refused-latch|Denied Latch/i.test(`${row.role} ${row.name}`));
  assert.ok(latch, 'the refused-latch sound is credited');
  assert.equal(creditsPlayerLine(latch.role), "sound: the Line's refused-latch tick");
  assert.ok((CREDITS.assets || []).every((row) => !/Massline/i.test(String(row.role || ''))));
  assert.equal(CREDITS.madeBy, 'SpaceFace');
  const screen = readFileSync(new URL('../src/ui/screens/credits.js', import.meta.url), 'utf8');
  assert.doesNotMatch(screen, /design, code and art/);
  assert.match(screen, /creditsPlayerLine\(a\.role\)/);
});
